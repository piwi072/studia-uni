import { store } from '../state/store.js';
import { getAccessToken, hasActiveGoogleToken, hasDriveScope } from './googleCalendar.js';

const SYNC_FILENAME = 'studia-sync-v1.json';
const DRIVE_FILES_URL = 'https://www.googleapis.com/drive/v3/files';
const DRIVE_UPLOAD_URL = 'https://www.googleapis.com/upload/drive/v3/files';

let autoUploadTimer = null;
let syncStatusListeners = new Set();
let currentSyncStatus = { state: 'idle', message: '', error: '', needsDriveApiEnable: false };

export function getDriveSyncStatus() {
  return currentSyncStatus;
}

export function subscribeDriveSyncStatus(fn) {
  syncStatusListeners.add(fn);
  return () => syncStatusListeners.delete(fn);
}

function setStatus(patch) {
  currentSyncStatus = { ...currentSyncStatus, ...patch };
  syncStatusListeners.forEach((fn) => fn(currentSyncStatus));
}

async function driveFetch(url, options = {}) {
  const token = getAccessToken();
  if (!token) {
    throw new Error('Keine aktive Google-Sitzung für Drive-Sync.');
  }
  const resp = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(options.headers || {}),
    },
  });
  if (resp.status === 403) {
    const text = await resp.text().catch(() => '');
    const apiDisabled =
      text.includes('accessNotConfigured') ||
      text.includes('Drive API') ||
      text.includes('has not been used');
    const err = new Error(
      apiDisabled
        ? 'Google Drive API ist in deinem Cloud-Projekt (922128740496) noch nicht aktiviert. Aktiviere sie einmalig mit dem Link unten.'
        : 'Kein Drive-AppData-Zugriff: Melde dich einmal kurz neu mit Google an, um den Drive-Sync-Scope zu bestätigen.'
    );
    err.needsDriveApiEnable = apiDisabled;
    throw err;
  }
  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new Error(`Google Drive Fehler (${resp.status}): ${text.slice(0, 140)}`);
  }
  return resp;
}

async function findSyncFile() {
  const params = new URLSearchParams({
    spaces: 'appDataFolder',
    q: `name='${SYNC_FILENAME}' and trashed=false`,
    fields: 'files(id, name, modifiedTime)',
    pageSize: '5',
  });
  const resp = await driveFetch(`${DRIVE_FILES_URL}?${params}`);
  const data = await resp.json();
  const files = data.files || [];
  if (files.length === 0) return null;
  // Pick newest if multiple exist
  files.sort((a, b) => (b.modifiedTime || '').localeCompare(a.modifiedTime || ''));
  return files[0];
}

async function downloadSyncFile(fileId) {
  const resp = await driveFetch(`${DRIVE_FILES_URL}/${encodeURIComponent(fileId)}?alt=media`);
  return resp.json();
}

async function uploadSyncFile(payload, existingFileId = null) {
  const jsonBody = JSON.stringify(payload);

  if (existingFileId) {
    const resp = await driveFetch(
      `${DRIVE_UPLOAD_URL}/${encodeURIComponent(existingFileId)}?uploadType=media&fields=id,modifiedTime`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json; charset=UTF-8' },
        body: jsonBody,
      }
    );
    return resp.json();
  }

  // Create new file inside hidden appDataFolder using multipart upload
  const boundary = 'studia_sync_boundary_' + Date.now().toString(36);
  const metadata = JSON.stringify({
    name: SYNC_FILENAME,
    parents: ['appDataFolder'],
    mimeType: 'application/json',
  });
  const multipartBody =
    `--${boundary}\r\n` +
    'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
    `${metadata}\r\n` +
    `--${boundary}\r\n` +
    'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
    `${jsonBody}\r\n` +
    `--${boundary}--`;

  const resp = await driveFetch(
    `${DRIVE_UPLOAD_URL}?uploadType=multipart&fields=id,modifiedTime`,
    {
      method: 'POST',
      headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
      body: multipartBody,
    }
  );
  return resp.json();
}

/**
 * Bidirectional sync with Google Drive hidden appDataFolder.
 * @param {'auto'|'upload'|'download'} direction
 */
export async function syncWithGoogleDrive({ direction = 'auto', silent = false } = {}) {
  if (!store.state.google.driveSyncEnabled) {
    return { action: 'disabled' };
  }
  if (!hasActiveGoogleToken()) {
    if (!silent) throw new Error('Bitte zuerst mit deinem Google-Konto anmelden.');
    return { action: 'no_token' };
  }
  if (!hasDriveScope()) {
    const msg = 'Für den Geräte-Sync einmal auf „Neu verbinden“ tippen, damit Google Drive (App-Ordner) freigegeben wird.';
    setStatus({ state: 'error', error: msg, needsDriveApiEnable: false });
    if (!silent) throw new Error(msg);
    return { action: 'missing_scope' };
  }

  setStatus({ state: 'syncing', error: '', needsDriveApiEnable: false });

  try {
    const remoteFile = await findSyncFile();
    const localUpdated = Date.parse(store.state.updatedAt || '1970-01-01T00:00:00Z') || 0;

    if (direction === 'upload') {
      const saved = await uploadSyncFile(store.getSyncPayload(), remoteFile?.id || store.state.google.driveFileId);
      store.update(
        (s) => {
          s.google.driveFileId = saved.id;
          s.google.lastDriveSync = new Date().toISOString();
        },
        { touchUpdatedAt: false, fromRemote: true }
      );
      setStatus({ state: 'synced', message: 'In Google Drive gespeichert', error: '' });
      return { action: 'uploaded', fileId: saved.id };
    }

    if (direction === 'download') {
      if (!remoteFile) {
        setStatus({ state: 'idle', message: 'Noch kein Cloud-Stand in Google Drive', error: '' });
        if (!silent) throw new Error('Noch kein Studia-Stand in Google Drive vorhanden. Lade zuerst hoch.');
        return { action: 'empty' };
      }
      const remoteData = await downloadSyncFile(remoteFile.id);
      store.applyRemoteState(remoteData);
      store.update(
        (s) => {
          s.google.driveFileId = remoteFile.id;
          s.google.lastDriveSync = new Date().toISOString();
        },
        { touchUpdatedAt: false, fromRemote: true }
      );
      setStatus({ state: 'synced', message: 'Aus Google Drive geladen', error: '' });
      return { action: 'downloaded', fileId: remoteFile.id };
    }

    // Automatic smart sync: newest timestamp wins
    if (!remoteFile) {
      const saved = await uploadSyncFile(store.getSyncPayload(), null);
      store.update(
        (s) => {
          s.google.driveFileId = saved.id;
          s.google.lastDriveSync = new Date().toISOString();
        },
        { touchUpdatedAt: false, fromRemote: true }
      );
      setStatus({ state: 'synced', message: 'Erster Cloud-Stand angelegt', error: '' });
      return { action: 'created', fileId: saved.id };
    }

    const remoteData = await downloadSyncFile(remoteFile.id);
    const remoteUpdated = Date.parse(remoteData?.updatedAt || remoteFile.modifiedTime || '1970-01-01T00:00:00Z') || 0;

    if (remoteUpdated > localUpdated + 1500) {
      store.applyRemoteState(remoteData);
      store.update(
        (s) => {
          s.google.driveFileId = remoteFile.id;
          s.google.lastDriveSync = new Date().toISOString();
        },
        { touchUpdatedAt: false, fromRemote: true }
      );
      setStatus({ state: 'synced', message: 'Neueren Stand aus Google Drive geladen', error: '' });
      return { action: 'downloaded', fileId: remoteFile.id };
    }

    const saved = await uploadSyncFile(store.getSyncPayload(), remoteFile.id);
    store.update(
      (s) => {
        s.google.driveFileId = saved.id;
        s.google.lastDriveSync = new Date().toISOString();
      },
      { touchUpdatedAt: false, fromRemote: true }
    );
    setStatus({ state: 'synced', message: 'Mit Google Drive synchronisiert', error: '' });
    return { action: 'uploaded', fileId: saved.id };
  } catch (err) {
    setStatus({
      state: 'error',
      error: err.message || 'Drive-Sync fehlgeschlagen.',
      needsDriveApiEnable: Boolean(err.needsDriveApiEnable),
    });
    if (!silent) throw err;
    return { action: 'error', error: err.message };
  }
}

/**
 * Debounced background upload whenever local user data changes.
 */
export function scheduleDriveAutoUpload() {
  if (!store.state.google.driveSyncEnabled || !hasActiveGoogleToken() || !hasDriveScope()) {
    return;
  }
  if (autoUploadTimer) clearTimeout(autoUploadTimer);
  autoUploadTimer = setTimeout(() => {
    syncWithGoogleDrive({ direction: 'upload', silent: true }).catch(() => {});
  }, 2400);
}
