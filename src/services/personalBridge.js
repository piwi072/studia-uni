import { addDaysToISO, addMinutesToTime } from '../data/defaults.js';
import { store } from '../state/store.js';
import { getHolidayExclusionDates, normalizeSemesterConfig } from '../utils/semester.js';

const BRIDGE_STORAGE_KEY = 'studia_personal_bridge_v1';

let autoPushTimer = null;
let bridgeListeners = new Set();
let bridgeStatus = {
  state: 'idle', // 'idle' | 'syncing' | 'synced' | 'error'
  message: '',
  error: '',
  lastSync: null,
};

export function getBridgeStatus() {
  return bridgeStatus;
}

export function subscribeBridgeStatus(fn) {
  bridgeListeners.add(fn);
  return () => bridgeListeners.delete(fn);
}

function setBridgeStatus(patch) {
  bridgeStatus = { ...bridgeStatus, ...patch };
  bridgeListeners.forEach((fn) => fn(bridgeStatus));
}

export function generateBridgeSecret() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  let out = 'std_';
  const bytes = new Uint8Array(24);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  for (let i = 0; i < bytes.length; i++) {
    out += alphabet[bytes[i] % alphabet.length];
  }
  return out;
}

export function getPersonalBridgeConfig() {
  try {
    if (typeof localStorage === 'undefined') return { url: '', secret: '' };
    const raw = localStorage.getItem(BRIDGE_STORAGE_KEY);
    if (!raw) return { url: '', secret: '' };
    const parsed = JSON.parse(raw);
    return {
      url: String(parsed?.url || '').trim(),
      secret: String(parsed?.secret || '').trim(),
    };
  } catch {
    return { url: '', secret: '' };
  }
}

export function ensureBridgeSecret() {
  const cfg = getPersonalBridgeConfig();
  if (cfg.secret) return cfg.secret;
  const created = generateBridgeSecret();
  savePersonalBridgeConfig({ url: cfg.url, secret: created });
  return created;
}

export function savePersonalBridgeConfig({ url, secret }) {
  try {
    if (typeof localStorage === 'undefined') return;
    const cleanUrl = String(url || '').trim();
    const cleanSecret = String(secret || '').trim();
    if (!cleanUrl && !cleanSecret) {
      localStorage.removeItem(BRIDGE_STORAGE_KEY);
      return;
    }
    localStorage.setItem(
      BRIDGE_STORAGE_KEY,
      JSON.stringify({ url: cleanUrl, secret: cleanSecret })
    );
  } catch {
    // Ignore storage errors
  }
}

export function clearPersonalBridgeConfig() {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(BRIDGE_STORAGE_KEY);
    }
  } catch {
    // Ignore
  }
  setBridgeStatus({ state: 'idle', message: '', error: '', lastSync: null });
}

export function isPersonalBridgeConfigured() {
  const cfg = getPersonalBridgeConfig();
  return Boolean(cfg.url && /^https:\/\//i.test(cfg.url) && cfg.secret.length >= 8);
}

/* ---------- 1-Tap Magic Pairing Link for Pixel 8, iPad & PC ---------- */

export function encodeBridgePairingToken({ url, secret }) {
  const json = JSON.stringify({ u: String(url || '').trim(), s: String(secret || '').trim() });
  const bytes = new TextEncoder().encode(json);
  let bin = '';
  bytes.forEach((b) => {
    bin += String.fromCharCode(b);
  });
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function decodeBridgePairingToken(token) {
  const norm = String(token || '').replace(/-/g, '+').replace(/_/g, '/');
  const padded = norm + '='.repeat((4 - (norm.length % 4)) % 4);
  const bin = atob(padded);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const parsed = JSON.parse(new TextDecoder().decode(bytes));
  if (!parsed?.u || !parsed?.s) throw new Error('Ungültiger Geräte-Link.');
  return { url: String(parsed.u).trim(), secret: String(parsed.s).trim() };
}

export function buildBridgePairingUrl(baseUrlOverride = null) {
  const cfg = getPersonalBridgeConfig();
  if (!cfg.url || !cfg.secret) return '';
  const base =
    baseUrlOverride ||
    (typeof window !== 'undefined'
      ? `${window.location.origin}${window.location.pathname}`
      : 'https://piwi072.github.io/studia-uni/');
  return `${base}#bridge=${encodeBridgePairingToken(cfg)}`;
}

/**
 * Checks window.location.hash for `#bridge=...`, saves credentials locally,
 * and cleans the hash immediately so the secret never lingers in the address bar.
 */
export function consumeBridgePairingHash() {
  if (typeof window === 'undefined') return null;
  const hash = window.location.hash || '';
  if (!hash.startsWith('#bridge=')) return null;
  const token = hash.slice('#bridge='.length).split('&')[0];
  window.history.replaceState(null, '', window.location.pathname + window.location.search);
  try {
    const cfg = decodeBridgePairingToken(token);
    savePersonalBridgeConfig(cfg);
    return cfg;
  } catch {
    return null;
  }
}

/* ---------- Ready-to-Paste Personal Google Apps Script Generator ---------- */

export function generateAppsScriptCode(secretInput) {
  const secret = String(secretInput || ensureBridgeSecret()).replace(/'/g, '');
  return `// Studia Dauer-Sync Bridge (dein privates Google-Skript — nie wieder neu anmelden!)
// 1) Einmal in script.google.com einfügen & speichern
// 2) Bereitstellen -> Neue Bereitstellung -> Web-App
//    Ausführen als: "Ich" | Zugriff: "Jeder" (durch dein geheimes Token unten geschützt!)
// 3) Web-App-URL in Studia einfügen — fertig!

const STUDIA_SECRET = '${secret}';
const SYNC_FILE_NAME = 'studia-personal-sync.json';

function doGet(e) {
  return handleRequest_({
    secret: e && e.parameter ? e.parameter.secret : '',
    action: (e && e.parameter && e.parameter.action) || 'ping',
  });
}

function doPost(e) {
  try {
    const raw = (e && e.postData && e.postData.contents) ? e.postData.contents : '{}';
    return handleRequest_(JSON.parse(raw));
  } catch (err) {
    return jsonOut_({ ok: false, error: 'Ungültige Anfrage: ' + err });
  }
}

function handleRequest_(req) {
  try {
    if (!req || req.secret !== STUDIA_SECRET) {
      return jsonOut_({ ok: false, error: 'Falsches Sync-Token (Zugriff verweigert).' });
    }
    const action = req.action || 'ping';

    if (action === 'ping') {
      return jsonOut_({ ok: true, email: Session.getEffectiveUser().getEmail() || 'Google-Konto' });
    }

    if (action === 'sync') {
      const stateResult = syncDriveState_(req.state || null, req.direction || 'auto');
      const calData = readCalendars_(req.selectedCalendarIds || null);
      return jsonOut_({
        ok: true,
        email: Session.getEffectiveUser().getEmail() || calData.primaryEmail || 'Google-Konto',
        stateAction: stateResult.action,
        remoteState: stateResult.state,
        calendars: calData.calendars,
        events: calData.events,
        serverTime: new Date().toISOString(),
      });
    }

    if (action === 'push_state') {
      const stateResult = syncDriveState_(req.state || null, 'upload');
      return jsonOut_({ ok: true, stateAction: stateResult.action, serverTime: new Date().toISOString() });
    }

    if (action === 'create_event') {
      const created = createCalendarEvent_(req.event || {}, req.calendarId || 'primary');
      return jsonOut_({ ok: true, event: created });
    }

    if (action === 'create_recurring_task') {
      const created = createRecurringTaskSeries_(req.task || {}, req.calendarId || 'primary');
      return jsonOut_({ ok: true, event: created });
    }

    return jsonOut_({ ok: false, error: 'Unbekannte Aktion: ' + action });
  } catch (err) {
    return jsonOut_({ ok: false, error: String(err) });
  }
}

function jsonOut_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.TEXT);
}

function getOrCreateSyncFile_() {
  const props = PropertiesService.getScriptProperties();
  const cachedId = props.getProperty('SYNC_FILE_ID');
  if (cachedId) {
    try {
      const f = DriveApp.getFileById(cachedId);
      if (!f.isTrashed()) return f;
    } catch (e) {}
  }
  const files = DriveApp.getFilesByName(SYNC_FILE_NAME);
  if (files.hasNext()) {
    const f = files.next();
    props.setProperty('SYNC_FILE_ID', f.getId());
    return f;
  }
  const created = DriveApp.createFile(SYNC_FILE_NAME, '{}', MimeType.PLAIN_TEXT);
  props.setProperty('SYNC_FILE_ID', created.getId());
  return created;
}

function syncDriveState_(incomingState, direction) {
  const file = getOrCreateSyncFile_();
  let remote = null;
  try {
    const txt = file.getBlob().getDataAsString('UTF-8');
    if (txt && txt.trim().length > 2) remote = JSON.parse(txt);
  } catch (e) {
    remote = null;
  }

  const remoteTs = remote && remote.updatedAt ? Date.parse(remote.updatedAt) : 0;
  const localTs = incomingState && incomingState.updatedAt ? Date.parse(incomingState.updatedAt) : 0;

  if (direction === 'download') {
    return { action: remote ? 'downloaded' : 'empty', state: remote };
  }
  if (direction === 'upload' || !remote || !remote.timetable) {
    if (incomingState && incomingState.timetable) {
      file.setContent(JSON.stringify(incomingState));
      return { action: 'uploaded', state: null };
    }
    return { action: 'empty', state: null };
  }
  if (remoteTs > localTs + 1500) {
    return { action: 'downloaded', state: remote };
  }
  if (localTs > remoteTs + 1500 && incomingState && incomingState.timetable) {
    file.setContent(JSON.stringify(incomingState));
    return { action: 'uploaded', state: null };
  }
  return { action: 'unchanged', state: null };
}

function readCalendars_(selectedIds) {
  const allCals = CalendarApp.getAllCalendars();
  const defaultCal = CalendarApp.getDefaultCalendar();
  const defaultId = defaultCal ? defaultCal.getId() : '';
  const calendars = allCals.map(function (c) {
    return {
      id: c.getId(),
      summary: c.getName() || c.getId(),
      primary: c.getId() === defaultId,
      backgroundColor: c.getColor() || '#1a73e8',
      accessRole: c.isOwnedByMe() ? 'owner' : 'reader',
    };
  });

  const validSelected = Array.isArray(selectedIds)
    ? selectedIds.filter(function (id) { return calendars.some(function (c) { return c.id === id; }); })
    : [];
  const targetIds = validSelected.length > 0 ? validSelected : (defaultId ? [defaultId] : []);

  const now = new Date();
  const start = new Date(now.getTime() - 30 * 86400000);
  const end = new Date(now.getTime() + 180 * 86400000);
  const events = [];

  targetIds.forEach(function (calId) {
    const cal = CalendarApp.getCalendarById(calId);
    if (!cal) return;
    const calName = cal.getName() || 'Kalender';
    const tz = cal.getTimeZone() || 'Europe/Berlin';
    cal.getEvents(start, end).forEach(function (ev) {
      const sd = ev.getStartTime();
      const ed = ev.getEndTime();
      const allDay = ev.isAllDayEvent();
      events.push({
        id: 'gcal_' + ev.getId() + '_' + fmtIso_(sd, tz),
        googleEventId: ev.getId(),
        calendarId: calId,
        title: ev.getTitle() || '(Ohne Titel)',
        date: fmtIso_(sd, tz),
        start: allDay ? 'Ganztägig' : fmtHM_(sd, tz),
        end: allDay ? '' : fmtHM_(ed, tz),
        location: ev.getLocation() || '',
        notes: ev.getDescription() || '',
        htmlLink: '',
        source: 'google',
        calendarName: 'Google · ' + calName,
        color: 'google',
      });
    });
  });

  return { calendars: calendars, events: events, primaryEmail: defaultId };
}

function resolveCalendar_(calId) {
  if (calId && calId !== 'primary') {
    const c = CalendarApp.getCalendarById(calId);
    if (c) return c;
  }
  return CalendarApp.getDefaultCalendar();
}

function parseCalDate_(isoDateStr, hmStr, tz) {
  return Utilities.parseDate(isoDateStr + ' ' + (hmStr || '09:00'), tz || 'Europe/Berlin', 'yyyy-MM-dd HH:mm');
}

function createCalendarEvent_(ev, calId) {
  const cal = resolveCalendar_(calId);
  const tz = cal.getTimeZone() || 'Europe/Berlin';
  const s = parseCalDate_(ev.date, ev.start || '09:00', tz);
  const e = parseCalDate_(ev.date, ev.end || '10:00', tz);
  const created = cal.createEvent(ev.title || 'Studia Termin', s, e, {
    location: ev.location || '',
    description: (ev.notes ? ev.notes + '\\n\\n' : '') + '— Gespeichert via Studia',
  });
  return { id: created.getId() };
}

function createRecurringTaskSeries_(tk, calId) {
  const cal = resolveCalendar_(calId);
  const tz = cal.getTimeZone() || 'Europe/Berlin';
  const s = parseCalDate_(tk.due, tk.startTime || '09:30', tz);
  const e = parseCalDate_(tk.due, tk.endTime || '10:00', tz);
  const until = parseCalDate_(tk.untilIso || '2027-01-24', '23:59', tz);
  const rec = CalendarApp.newRecurrence()
    .addWeeklyRule()
    .interval(Number(tk.interval || 1))
    .until(until);
  (tk.exDates || []).forEach(function (iso) {
    rec.addDateExclusion(parseCalDate_(iso, '00:00', tz));
  });
  const series = cal.createEventSeries(tk.summary || ('Abgabe: ' + tk.title), s, e, rec, {
    location: tk.course || '',
    description: tk.description || '— Serientermin aus Studia',
  });
  series.addPopupReminder(1440);
  series.addPopupReminder(120);
  return { id: series.getId() };
}

function fmtIso_(d, tz) {
  return Utilities.formatDate(d, tz || 'Europe/Berlin', 'yyyy-MM-dd');
}

function fmtHM_(d, tz) {
  return Utilities.formatDate(d, tz || 'Europe/Berlin', 'HH:mm');
}
`;
}

/* ---------- Network Calls (CORS-Simple text/plain POST, zero preflight!) ---------- */

async function callBridge(payload, overrideCfg = null) {
  const cfg = overrideCfg || getPersonalBridgeConfig();
  if (!cfg.url || !cfg.secret) {
    throw new Error('Dauer-Sync ist noch nicht eingerichtet.');
  }
  let resp;
  try {
    resp = await fetch(cfg.url, {
      method: 'POST',
      redirect: 'follow',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8',
      },
      body: JSON.stringify({
        secret: cfg.secret,
        ...payload,
      }),
    });
  } catch {
    throw new Error(
      'Keine Verbindung zum Dauer-Sync-Skript — prüfe deine Internetverbindung oder die Web-App-URL.'
    );
  }
  if (!resp.ok) {
    throw new Error(`Dauer-Sync Serverfehler (HTTP ${resp.status}). Prüfe die Web-App-URL.`);
  }
  const text = await resp.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(
      'Antwort war kein JSON — prüfe bei Google Apps Script, dass „Zugriff: Jeder“ gewählt ist und die URL auf /exec endet.'
    );
  }
  if (!data.ok) {
    throw new Error(data.error || 'Dauer-Sync fehlgeschlagen.');
  }
  return data;
}

/**
 * Full bidirectional sync of BOTH Studia state (Drive) AND Google Calendar events
 * with ZERO OAuth popups or 1-hour expiry!
 */
export async function syncAllViaBridge({ direction = 'auto', silent = false, overrideCfg = null } = {}) {
  if (!overrideCfg && !isPersonalBridgeConfigured()) {
    return { action: 'not_configured' };
  }
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return { action: 'offline' };
  }

  setBridgeStatus({ state: 'syncing', error: '' });

  try {
    const data = await callBridge(
      {
        action: 'sync',
        direction,
        state: store.getSyncPayload(),
        selectedCalendarIds: store.state.google.selectedCalendarIds || [],
      },
      overrideCfg
    );

    if (data.stateAction === 'downloaded' && data.remoteState) {
      store.applyRemoteState(data.remoteState);
    }

    const calendars = Array.isArray(data.calendars) ? data.calendars : [];
    const events = Array.isArray(data.events) ? data.events : [];
    const primaryCal = calendars.find((c) => c.primary);
    const nowIso = new Date().toISOString();

    store.update(
      (s) => {
        s.google.connected = true;
        s.google.userEmail = data.email || primaryCal?.id || s.google.userEmail || 'Google-Konto';
        if (calendars.length > 0) {
          s.google.calendars = calendars;
          const validSel = (s.google.selectedCalendarIds || []).filter((id) =>
            calendars.some((c) => c.id === id)
          );
          if (validSel.length === 0 && primaryCal) {
            s.google.selectedCalendarIds = [primaryCal.id];
          }
          if (!s.google.writeCalendarId || !calendars.some((c) => c.id === s.google.writeCalendarId)) {
            s.google.writeCalendarId = primaryCal?.id || calendars[0].id;
          }
        }
        s.googleEvents = events;
        s.google.lastSync = nowIso;
        s.google.lastDriveSync = nowIso;
      },
      { touchUpdatedAt: false, fromRemote: true }
    );

    setBridgeStatus({
      state: 'synced',
      message:
        data.stateAction === 'downloaded'
          ? 'Neuerer Stand von anderem Gerät geladen'
          : 'Alle Geräte & Google Kalender synchron',
      error: '',
      lastSync: nowIso,
    });

    return {
      action: data.stateAction || 'synced',
      eventsCount: events.length,
      email: data.email || '',
    };
  } catch (err) {
    setBridgeStatus({
      state: 'error',
      error: err.message || 'Dauer-Sync fehlgeschlagen.',
    });
    if (!silent) throw err;
    return { action: 'error', error: err.message };
  }
}

/**
 * Debounced background push (~1.8s after any local edit on Pixel 8, iPad, or PC).
 */
export function scheduleBridgeAutoPush() {
  if (!isPersonalBridgeConfigured()) return;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
  if (autoPushTimer) clearTimeout(autoPushTimer);
  autoPushTimer = setTimeout(async () => {
    try {
      setBridgeStatus({ state: 'syncing', error: '' });
      await callBridge({
        action: 'push_state',
        state: store.getSyncPayload(),
      });
      const nowIso = new Date().toISOString();
      store.update(
        (s) => {
          s.google.lastDriveSync = nowIso;
        },
        { touchUpdatedAt: false, fromRemote: true }
      );
      setBridgeStatus({ state: 'synced', message: 'Gespeichert', error: '', lastSync: nowIso });
    } catch (err) {
      setBridgeStatus({ state: 'error', error: err.message || 'Auto-Sync fehlgeschlagen.' });
    }
  }, 1800);
}

export async function pushEventViaBridge({
  title,
  date,
  start,
  end,
  location = '',
  notes = '',
}) {
  const startHour = start && /^\d{2}:\d{2}$/.test(start) ? start : '09:00';
  const endHour =
    end && /^\d{2}:\d{2}$/.test(end) && end > startHour
      ? end
      : addMinutesToTime(startHour, 60);

  const res = await callBridge({
    action: 'create_event',
    calendarId: store.state.google.writeCalendarId || 'primary',
    event: { title, date, start: startHour, end: endHour, location, notes },
  });
  await syncAllViaBridge({ direction: 'auto', silent: true });
  return res.event;
}

export async function pushRecurringTaskViaBridge(task, semesterConfig) {
  const cfg = normalizeSemesterConfig(semesterConfig);
  const dueTime = task.dueTime && /^\d{2}:\d{2}$/.test(task.dueTime) ? task.dueTime : '23:59';
  const startTime = addMinutesToTime(dueTime, -30);
  const interval = task.recurrence === 'biweekly' ? 2 : 1;
  const untilIso = addDaysToISO(cfg.lecturesEnd || '2027-01-22', 2);
  const exDates = getHolidayExclusionDates(task.due, interval * 7, cfg);

  const res = await callBridge({
    action: 'create_recurring_task',
    calendarId: store.state.google.writeCalendarId || 'primary',
    task: {
      title: task.title,
      summary: `Abgabe: ${task.title}`,
      course: task.course || '',
      due: task.due,
      startTime,
      endTime: dueTime,
      interval,
      untilIso,
      exDates,
      description: `${task.course || 'Studium'} · ${task.recurrenceLabel || ''}\n— Serientermin aus Studia`,
    },
  });

  store.update((s) => {
    const t = (s.tasks || []).find((x) => x.id === task.id);
    if (t && res.event?.id) {
      t.googleEventId = res.event.id;
    }
  });
  await syncAllViaBridge({ direction: 'auto', silent: true });
  return res.event;
}

export async function pushAllRecurringTasksViaBridge(tasks, semesterConfig) {
  const recurring = (tasks || []).filter(
    (t) => t.due && (t.recurrence === 'weekly' || t.recurrence === 'biweekly')
  );
  let count = 0;
  for (const tk of recurring) {
    await pushRecurringTaskViaBridge(tk, semesterConfig);
    count += 1;
  }
  return count;
}
