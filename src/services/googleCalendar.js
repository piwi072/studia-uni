import { store } from '../state/store.js';
import { DEFAULT_GOOGLE_CLIENT_ID, addDays, isoDate } from '../data/defaults.js';

const SCOPE_READONLY = 'https://www.googleapis.com/auth/calendar.readonly';
const SCOPE_READWRITE =
  'https://www.googleapis.com/auth/calendar.readonly https://www.googleapis.com/auth/calendar.events';

let accessToken = null;
let tokenExpiresAt = 0;

function getRequestedScopes(readOnly) {
  return readOnly ? SCOPE_READONLY : SCOPE_READWRITE;
}

function ensureGisLoaded() {
  return new Promise((resolve, reject) => {
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
  const hash = window.location.hash || '';
  if (!hash.includes('access_token=') && !hash.includes('error=')) return null;

  const params = new URLSearchParams(hash.replace(/^#/, ''));
  // Clean token from URL bar immediately
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
  store.update((s) => {
    s.google.connected = true;
  });

  const count = await syncGoogleCalendars();
  return count;
}

/**
 * Standard Popup Sign-In via Google Identity Services (only requires Authorized JS Origin).
 * Uses prompt: 'select_account consent' so the user can explicitly choose their Testnutzer email!
 */
export async function connectGoogleAccount(clientIdInput, { readOnly = false } = {}) {
  const clientId = (
    clientIdInput ||
    store.state.google.clientId ||
    DEFAULT_GOOGLE_CLIENT_ID
  ).trim();
  if (!clientId) {
    throw new Error('Bitte trage zuerst deine Google OAuth Client-ID ein.');
  }

  const oauth2 = await ensureGisLoaded();

  const tokenResp = await new Promise((resolve, reject) => {
    try {
      const client = oauth2.initTokenClient({
        client_id: clientId,
        scope: getRequestedScopes(readOnly),
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
      client.requestAccessToken({ prompt: 'select_account consent' });
    } catch (err) {
      reject(err);
    }
  });

  accessToken = tokenResp.access_token;
  tokenExpiresAt = Date.now() + Number(tokenResp.expires_in || 3600) * 1000;

  store.update((s) => {
    s.google.clientId = clientId;
    s.google.readOnlyMode = Boolean(readOnly);
    s.google.connected = true;
  });

  await syncGoogleCalendars();
  return true;
}

/**
 * Alternative Redirect Login (no popup needed — requires Redirect URI in Google Cloud Console).
 */
export function startGoogleRedirectLogin(clientIdInput, { readOnly = false } = {}) {
  const clientId = (
    clientIdInput ||
    store.state.google.clientId ||
    DEFAULT_GOOGLE_CLIENT_ID
  ).trim();
  if (!clientId) {
    throw new Error('Bitte trage zuerst deine Google OAuth Client-ID ein.');
  }

  store.update((s) => {
    s.google.clientId = clientId;
    s.google.readOnlyMode = Boolean(readOnly);
  });

  const redirectUri = `${window.location.origin}${window.location.pathname}`;
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'token',
    scope: getRequestedScopes(readOnly),
    include_granted_scopes: 'true',
    prompt: 'select_account consent',
  });

  window.location.href = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

function formatGoogleError(code, desc) {
  const c = String(code || '').toLowerCase();
  if (c === 'access_denied') {
    return 'Google meldet „Zugriff verweigert (access_denied)“: Prüfe, ob du genau das Google-Konto aus deiner Testnutzer-Liste gewählt hast (Achtung: @gmail.com vs. @googlemail.com!) und auf „Erweitert → Weiter“ geklickt hast.';
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
  if (accessToken && window.google?.accounts?.oauth2?.revoke) {
    try {
      window.google.accounts.oauth2.revoke(accessToken);
    } catch {
      // Ignore offline revoke error
    }
  }
  accessToken = null;
  tokenExpiresAt = 0;
  store.update((s) => {
    s.google.connected = false;
    s.google.userEmail = '';
    s.google.calendars = [];
    s.google.lastSync = null;
    s.googleEvents = [];
  });
}

async function googleFetch(url, options = {}) {
  if (!hasActiveGoogleToken()) {
    throw new Error('Google Sitzung abgelaufen. Bitte erneut mit Google verbinden.');
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
    store.update((s) => {
      s.google.connected = false;
    });
    throw new Error('Google Token abgelaufen. Bitte erneut anmelden.');
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

  store.update((s) => {
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
  });

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
      : `${String((Number(startHour.slice(0, 2)) + 1) % 24).padStart(2, '0')}:${startHour.slice(3, 5)}`;

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
