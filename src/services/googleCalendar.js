import { store } from '../state/store.js';
import { DEFAULT_GOOGLE_CLIENT_ID, addDays, addDaysToISO, addMinutesToTime, isoDate } from '../data/defaults.js';
import { getHolidayExclusionDates, normalizeSemesterConfig } from '../utils/semester.js';

const SCOPE_READONLY = 'https://www.googleapis.com/auth/calendar.readonly';
const SCOPE_READWRITE =
  'https://www.googleapis.com/auth/calendar.readonly https://www.googleapis.com/auth/calendar.events';
const SCOPE_DRIVE_APPDATA = 'https://www.googleapis.com/auth/drive.appdata';
const SESSION_STORAGE_KEY = 'studia_google_session_v1';

let accessToken = null;
let tokenExpiresAt = 0;
let grantedScopes = '';

function persistSession() {
  try {
    if (typeof localStorage === 'undefined') return;
    if (!store.state.google.rememberLogin || !accessToken) {
      localStorage.removeItem(SESSION_STORAGE_KEY);
      return;
    }
    localStorage.setItem(
      SESSION_STORAGE_KEY,
      JSON.stringify({
        accessToken,
        tokenExpiresAt,
        grantedScopes,
        savedAt: Date.now(),
      })
    );
  } catch {
    // Ignore storage quota errors
  }
}

function loadPersistedSession() {
  try {
    if (typeof localStorage === 'undefined') return false;
    const raw = localStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw);
    if (parsed?.accessToken && Number(parsed.tokenExpiresAt) > Date.now() + 30000) {
      accessToken = parsed.accessToken;
      tokenExpiresAt = Number(parsed.tokenExpiresAt);
      grantedScopes = String(parsed.grantedScopes || '');
      return true;
    }
    localStorage.removeItem(SESSION_STORAGE_KEY);
    return false;
  } catch {
    return false;
  }
}

export function clearPersistedSession() {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(SESSION_STORAGE_KEY);
    }
  } catch {
    // Ignore
  }
}

function getRequestedScopes({ readOnly = false, includeDrive = true } = {}) {
  const calScope = readOnly ? SCOPE_READONLY : SCOPE_READWRITE;
  return includeDrive ? `${calScope} ${SCOPE_DRIVE_APPDATA}` : calScope;
}

export function getAccessToken() {
  return hasActiveGoogleToken() ? accessToken : null;
}

export function hasDriveScope() {
  if (!hasActiveGoogleToken()) return false;
  if (!grantedScopes) return Boolean(store.state.google.driveSyncEnabled);
  return grantedScopes.includes('drive.appdata');
}

function ensureGisLoaded() {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      reject(new Error('Browser-Umgebung erforderlich.'));
      return;
    }
    if (window.google?.accounts?.oauth2) {
      resolve(window.google.accounts.oauth2);
      return;
    }
    const existing = document.querySelector('script[src*="accounts.google.com/gsi/client"]');
    if (existing) {
      let tries = 0;
      const timer = setInterval(() => {
        tries += 1;
        if (window.google?.accounts?.oauth2) {
          clearInterval(timer);
          resolve(window.google.accounts.oauth2);
        } else if (tries > 40) {
          clearInterval(timer);
          reject(
            new Error(
              'Google Login-Skript konnte nicht geladen werden. Prüfe deine Internetverbindung oder Werbeblocker.'
            )
          );
        }
      }, 150);
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => {
      if (window.google?.accounts?.oauth2) resolve(window.google.accounts.oauth2);
      else reject(new Error('Google Login-Modul nicht verfügbar.'));
    };
    script.onerror = () =>
      reject(new Error('Keine Verbindung zu accounts.google.com möglich.'));
    document.head.appendChild(script);
  });
}

export function hasActiveGoogleToken() {
  return Boolean(accessToken && Date.now() < tokenExpiresAt - 30000);
}

/**
 * Handle OAuth2 implicit token returned via URL hash (#access_token=...)
 * when user uses Redirect-Login mode (helpful on Pixel 8 PWA / iPad Safari).
 */
export async function handleGoogleRedirectCallback() {
  if (typeof window === 'undefined') return null;
  const hash = window.location.hash || '';
  if (!hash.includes('access_token=') && !hash.includes('error=')) return null;

  const params = new URLSearchParams(hash.replace(/^#/, ''));
  window.history.replaceState(null, '', window.location.pathname + window.location.search);

  const err = params.get('error');
  if (err) {
    throw new Error(formatGoogleError(err, params.get('error_description')));
  }

  const token = params.get('access_token');
  const expiresIn = Number(params.get('expires_in') || 3600);
  if (!token) return null;

  accessToken = token;
  tokenExpiresAt = Date.now() + expiresIn * 1000;
  grantedScopes = params.get('scope') || getRequestedScopes({
    readOnly: store.state.google.readOnlyMode,
    includeDrive: store.state.google.driveSyncEnabled,
  });
  persistSession();

  store.update(
    (s) => {
      s.google.connected = true;
    },
    { touchUpdatedAt: false }
  );

  const count = await syncGoogleCalendars();
  return count;
}

/**
 * Attempts to restore the persisted session token or silently refresh via GIS
 * when the app opens or returns to foreground — never shows an error popup.
 */
export async function trySilentGoogleReconnect() {
  const g = store.state.google;
  if (!g.connected || !g.rememberLogin) {
    return { status: 'skipped' };
  }

  // 1. Check cached token in localStorage first (instant, zero network OAuth roundtrip)
  if (hasActiveGoogleToken() || loadPersistedSession()) {
    return { status: 'restored' };
  }

  // 2. If offline, keep cached events without failing
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return { status: 'offline' };
  }

  // 3. Attempt silent GIS refresh using saved userEmail hint (prompt: '')
  const clientId = (g.clientId || DEFAULT_GOOGLE_CLIENT_ID).trim();
  if (!clientId || !g.userEmail) {
    return { status: 'needs_login' };
  }

  try {
    const oauth2 = await ensureGisLoaded();
    const tokenResp = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('silent_timeout')), 6500);
      try {
        const client = oauth2.initTokenClient({
          client_id: clientId,
          scope: getRequestedScopes({
            readOnly: Boolean(g.readOnlyMode),
            includeDrive: g.driveSyncEnabled !== false,
          }),
          hint: g.userEmail,
          include_granted_scopes: true,
          callback: (response) => {
            clearTimeout(timeout);
            if (response.error) reject(new Error(response.error));
            else resolve(response);
          },
          error_callback: (err) => {
            clearTimeout(timeout);
            reject(new Error(err?.type || 'silent_error'));
          },
        });
        client.requestAccessToken({ prompt: '' });
      } catch (err) {
        clearTimeout(timeout);
        reject(err);
      }
    });

    accessToken = tokenResp.access_token;
    tokenExpiresAt = Date.now() + Number(tokenResp.expires_in || 3600) * 1000;
    grantedScopes = tokenResp.scope || '';
    persistSession();
    return { status: 'refreshed' };
  } catch {
    return { status: 'needs_login' };
  }
}

/**
 * Standard Popup Sign-In via Google Identity Services (only requires Authorized JS Origin).
 */
export async function connectGoogleAccount(
  clientIdInput,
  { readOnly = false, includeDrive = true, promptMode = 'select_account consent' } = {}
) {
  const clientId = (
    clientIdInput ||
    store.state.google.clientId ||
    DEFAULT_GOOGLE_CLIENT_ID
  ).trim();
  if (!clientId) {
    throw new Error('Bitte trage zuerst deine Google OAuth Client-ID ein.');
  }

  const oauth2 = await ensureGisLoaded();
  const reqScopes = getRequestedScopes({ readOnly, includeDrive });

  const tokenResp = await new Promise((resolve, reject) => {
    try {
      const client = oauth2.initTokenClient({
        client_id: clientId,
        scope: reqScopes,
        hint: store.state.google.userEmail || undefined,
        include_granted_scopes: true,
        callback: (response) => {
          if (response.error) {
            reject(
              new Error(formatGoogleError(response.error, response.error_description))
            );
          } else {
            resolve(response);
          }
        },
        error_callback: (err) => {
          reject(
            new Error(
              formatGoogleError(err?.type || 'popup_error', err?.message)
            )
          );
        },
      });
      client.requestAccessToken({ prompt: promptMode });
    } catch (err) {
      reject(err);
    }
  });

  accessToken = tokenResp.access_token;
  tokenExpiresAt = Date.now() + Number(tokenResp.expires_in || 3600) * 1000;
  grantedScopes = tokenResp.scope || reqScopes;

  store.update(
    (s) => {
      s.google.clientId = clientId;
      s.google.readOnlyMode = Boolean(readOnly);
      s.google.driveSyncEnabled = Boolean(includeDrive);
      s.google.connected = true;
    },
    { touchUpdatedAt: false }
  );
  persistSession();

  await syncGoogleCalendars();
  return true;
}

/**
 * Alternative Redirect Login (no popup needed — requires Redirect URI in Google Cloud Console).
 */
export function startGoogleRedirectLogin(
  clientIdInput,
  { readOnly = false, includeDrive = true } = {}
) {
  const clientId = (
    clientIdInput ||
    store.state.google.clientId ||
    DEFAULT_GOOGLE_CLIENT_ID
  ).trim();
  if (!clientId) {
    throw new Error('Bitte trage zuerst deine Google OAuth Client-ID ein.');
  }

  store.update(
    (s) => {
      s.google.clientId = clientId;
      s.google.readOnlyMode = Boolean(readOnly);
      s.google.driveSyncEnabled = Boolean(includeDrive);
    },
    { touchUpdatedAt: false }
  );

  const redirectUri = `${window.location.origin}${window.location.pathname}`;
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'token',
    scope: getRequestedScopes({ readOnly, includeDrive }),
    include_granted_scopes: 'true',
    prompt: 'select_account consent',
  });

  window.location.href = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

function formatGoogleError(code, desc) {
  const c = String(code || '').toLowerCase();
  if (c === 'access_denied') {
    return 'Google meldet „Zugriff verweigert (access_denied)“: Prüfe, ob du dein Testnutzer-Konto gewählt und alle Berechtigungen bestätigt hast.';
  }
  if (c === 'popup_closed' || c === 'popup_closed_by_user') {
    return 'Das Google-Anmeldefenster wurde geschlossen, bevor die Anmeldung fertig war.';
  }
  if (c === 'popup_failed_to_open') {
    return 'Popup wurde vom Browser blockiert. Erlaube Popups oder nutze den Button „Ohne Popup anmelden“.';
  }
  return desc ? `${desc} (${code})` : `Google Anmeldung fehlgeschlagen (${code}).`;
}

export function disconnectGoogleAccount() {
  if (accessToken && typeof window !== 'undefined' && window.google?.accounts?.oauth2?.revoke) {
    try {
      window.google.accounts.oauth2.revoke(accessToken);
    } catch {
      // Ignore offline revoke error
    }
  }
  accessToken = null;
  tokenExpiresAt = 0;
  grantedScopes = '';
  clearPersistedSession();
  store.update(
    (s) => {
      s.google.connected = false;
      s.google.userEmail = '';
      s.google.calendars = [];
      s.google.lastSync = null;
      s.google.lastDriveSync = null;
      s.google.driveFileId = null;
      s.googleEvents = [];
    },
    { touchUpdatedAt: false }
  );
}

async function googleFetch(url, options = {}) {
  if (!hasActiveGoogleToken()) {
    throw new Error('Google Sitzung abgelaufen. Tippe auf „Sitzung erneuern“ oder neu verbinden.');
  }
  const resp = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  if (resp.status === 401) {
    accessToken = null;
    tokenExpiresAt = 0;
    clearPersistedSession();
    throw new Error('Google Token abgelaufen. Bitte Sitzung kurz erneuern.');
  }
  if (resp.status === 403) {
    throw new Error(
      'Keine Berechtigung (HTTP 403): Prüfe, ob die „Google Calendar API“ in deinem Google-Cloud-Projekt 922128740496 aktiviert ist.'
    );
  }
  if (!resp.ok) {
    const errText = await resp.text().catch(() => '');
    throw new Error(`Google Kalender API Fehler (${resp.status}): ${errText.slice(0, 140)}`);
  }
  return resp.json();
}

export async function syncGoogleCalendars() {
  const listData = await googleFetch(
    'https://www.googleapis.com/calendar/v3/users/me/calendarList?minAccessRole=reader'
  );
  const calendars = (listData.items || []).map((cal) => ({
    id: cal.id,
    summary: cal.summaryOverride || cal.summary || cal.id,
    primary: Boolean(cal.primary),
    backgroundColor: cal.backgroundColor || '#1a73e8',
    accessRole: cal.accessRole,
  }));

  const primaryCal = calendars.find((c) => c.primary);
  const existingSelected = store.state.google.selectedCalendarIds || [];
  const validSelected = existingSelected.filter((id) =>
    calendars.some((c) => c.id === id)
  );
  const selectedIds =
    validSelected.length > 0
      ? validSelected
      : calendars.filter((c) => c.primary).map((c) => c.id);

  if (selectedIds.length === 0 && calendars[0]) {
    selectedIds.push(calendars[0].id);
  }

  const timeMin = new Date(`${addDays(-30)}T00:00:00`).toISOString();
  const timeMax = new Date(`${addDays(180)}T23:59:59`).toISOString();

  const fetchedEvents = [];

  for (const calId of selectedIds) {
    const calInfo = calendars.find((c) => c.id === calId);
    const params = new URLSearchParams({
      singleEvents: 'true',
      orderBy: 'startTime',
      timeMin,
      timeMax,
      maxResults: '250',
    });
    try {
      const evData = await googleFetch(
        `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calId)}/events?${params}`
      );
      for (const item of evData.items || []) {
        if (item.status === 'cancelled') continue;
        const parsed = mapGoogleEvent(item, calInfo);
        if (parsed) fetchedEvents.push(parsed);
      }
    } catch (err) {
      console.warn(`Kalender ${calId} konnte nicht geladen werden:`, err);
    }
  }

  store.update(
    (s) => {
      s.google.calendars = calendars;
      s.google.selectedCalendarIds = selectedIds;
      if (primaryCal) {
        s.google.userEmail = primaryCal.id;
        if (
          !s.google.writeCalendarId ||
          !calendars.some((c) => c.id === s.google.writeCalendarId)
        ) {
          s.google.writeCalendarId = primaryCal.id;
        }
      }
      s.google.lastSync = new Date().toISOString();
      s.googleEvents = fetchedEvents;
    },
    { touchUpdatedAt: false }
  );

  return fetchedEvents.length;
}

function mapGoogleEvent(item, calInfo) {
  const startRaw = item.start?.dateTime || item.start?.date;
  const endRaw = item.end?.dateTime || item.end?.date;
  if (!startRaw) return null;

  const isAllDay = Boolean(item.start?.date && !item.start?.dateTime);
  let dateStr = '';
  let startTime = 'Ganztägig';
  let endTime = '';

  if (isAllDay) {
    dateStr = item.start.date;
  } else {
    const sd = new Date(startRaw);
    const ed = endRaw ? new Date(endRaw) : null;
    dateStr = isoDate(sd);
    startTime = `${String(sd.getHours()).padStart(2, '0')}:${String(sd.getMinutes()).padStart(2, '0')}`;
    if (ed) {
      endTime = `${String(ed.getHours()).padStart(2, '0')}:${String(ed.getMinutes()).padStart(2, '0')}`;
    }
  }

  return {
    id: `gcal_${item.id}`,
    googleEventId: item.id,
    calendarId: calInfo?.id || 'primary',
    title: item.summary || '(Ohne Titel)',
    date: dateStr,
    start: startTime,
    end: endTime,
    location: item.location || '',
    notes: item.description || '',
    htmlLink: item.htmlLink || '',
    source: 'google',
    calendarName: `Google · ${calInfo?.summary || 'Kalender'}`,
    color: 'google',
  };
}

export async function pushEventToGoogle({
  title,
  date,
  start,
  end,
  location = '',
  notes = '',
}) {
  if (store.state.google.readOnlyMode) {
    throw new Error(
      'Du bist im Nur-Lese-Modus angemeldet. Deaktiviere „Nur lesen“ in den Einstellungen, um Termine in Google zu speichern.'
    );
  }
  const calId = store.state.google.writeCalendarId || 'primary';
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Berlin';

  const startHour = start && /^\d{2}:\d{2}$/.test(start) ? start : '09:00';
  const endHour =
    end && /^\d{2}:\d{2}$/.test(end) && end > startHour
      ? end
      : addMinutesToTime(startHour, 60);

  const body = {
    summary: title,
    location,
    description: notes ? `${notes}\n\n— Gespeichert via Studia` : 'Gespeichert via Studia',
    start: {
      dateTime: `${date}T${startHour}:00`,
      timeZone: tz,
    },
    end: {
      dateTime: `${date}T${endHour}:00`,
      timeZone: tz,
    },
  };

  const created = await googleFetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calId)}/events`,
    {
      method: 'POST',
      body: JSON.stringify(body),
    }
  );

  await syncGoogleCalendars();
  return created;
}

/**
 * Pure builder for a Google Calendar recurring deadline event with native Pixel/iOS pop-up
 * reminders (1 day before + 2 hours before) and automatic EXDATE skipping for semester holidays.
 */
export function buildRecurringTaskEventPayload(task, semesterConfig, tz = 'Europe/Berlin') {
  const cfg = normalizeSemesterConfig(semesterConfig);
  const dueTime = task.dueTime && /^\d{2}:\d{2}$/.test(task.dueTime) ? task.dueTime : '23:59';
  // Schedule a 30-min block ending right at the submission deadline
  const startTime = addMinutesToTime(dueTime, -30);
  const endTime = dueTime;

  const interval = task.recurrence === 'biweekly' ? 2 : 1;
  const stepDays = interval * 7;

  // UNTIL covers lecturesEnd + 2 days (so Sunday 24:00 deadlines on the final lecture weekend stay included)
  const untilIso = addDaysToISO(cfg.lecturesEnd || '2027-01-22', 2);
  const untilStamp = `${untilIso.replace(/-/g, '')}T235959Z`;

  const recurrence = [`RRULE:FREQ=WEEKLY;INTERVAL=${interval};UNTIL=${untilStamp}`];

  const exDates = getHolidayExclusionDates(task.due, stepDays, cfg);
  if (exDates.length > 0) {
    const startCompact = `${startTime.replace(':', '')}00`;
    const exList = exDates.map((d) => `${d.replace(/-/g, '')}T${startCompact}`).join(',');
    recurrence.push(`EXDATE;TZID=${tz}:${exList}`);
  }

  return {
    summary: `Abgabe: ${task.title}`,
    location: task.course || '',
    description: `${task.course || 'Studium'} · ${task.recurrenceLabel || (interval === 2 ? 'Alle 2 Wochen' : 'Jede Woche')}\nFerienzeiten (${cfg.holidays.map((h) => `${h.start}–${h.end}`).join(', ')}) automatisch ausgenommen.\n\n— Serientermin aus Studia`,
    start: {
      dateTime: `${task.due}T${startTime}:00`,
      timeZone: tz,
    },
    end: {
      dateTime: `${task.due}T${endTime}:00`,
      timeZone: tz,
    },
    recurrence,
    reminders: {
      useDefault: false,
      overrides: [
        { method: 'popup', minutes: 1440 }, // Vorabend (24h vorher)
        { method: 'popup', minutes: 120 },  // 2 Stunden vorher
      ],
    },
    extendedProperties: {
      private: {
        studiaTaskId: task.id,
      },
    },
  };
}

export async function pushRecurringTaskToGoogle(task, semesterConfig) {
  if (store.state.google.readOnlyMode) {
    throw new Error(
      'Du bist im Nur-Lese-Modus angemeldet. Deaktiviere „Nur lesen“ in den Einstellungen, um Abgaben-Serien in Google anzulegen.'
    );
  }
  const calId = store.state.google.writeCalendarId || 'primary';
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Berlin';
  const body = buildRecurringTaskEventPayload(task, semesterConfig, tz);

  let saved;
  if (task.googleEventId) {
    try {
      saved = await googleFetch(
        `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calId)}/events/${encodeURIComponent(task.googleEventId)}`,
        { method: 'PUT', body: JSON.stringify(body) }
      );
    } catch {
      // Event might have been deleted manually in Google Calendar -> recreate
      saved = await googleFetch(
        `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calId)}/events`,
        { method: 'POST', body: JSON.stringify(body) }
      );
    }
  } else {
    saved = await googleFetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calId)}/events`,
      { method: 'POST', body: JSON.stringify(body) }
    );
  }

  store.update((s) => {
    const t = (s.tasks || []).find((x) => x.id === task.id);
    if (t && saved?.id) {
      t.googleEventId = saved.id;
      t.googleHtmlLink = saved.htmlLink || '';
    }
  });

  await syncGoogleCalendars();
  return saved;
}

export async function pushAllRecurringTasksToGoogle(tasks, semesterConfig) {
  const recurring = (tasks || []).filter(
    (t) => t.due && (t.recurrence === 'weekly' || t.recurrence === 'biweekly')
  );
  if (recurring.length === 0) return 0;

  let count = 0;
  for (const tk of recurring) {
    await pushRecurringTaskToGoogle(tk, semesterConfig);
    count += 1;
  }
  return count;
}
