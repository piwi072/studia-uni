import { store } from '../state/store.js';
import { addDays, isoDate } from '../data/defaults.js';

const SCOPES =
  'https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar.readonly';

let accessToken = null;
let tokenExpiresAt = 0;

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
              'Google Identity Services konnten nicht geladen werden. Bist du online?'
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

export async function connectGoogleAccount(clientIdInput) {
  const clientId = (clientIdInput || store.state.google.clientId || '').trim();
  if (!clientId) {
    throw new Error(
      'Bitte trage zuerst deine Google OAuth Client-ID in den Einstellungen ein.'
    );
  }

  const oauth2 = await ensureGisLoaded();

  const tokenResp = await new Promise((resolve, reject) => {
    try {
      const client = oauth2.initTokenClient({
        client_id: clientId,
        scope: SCOPES,
        callback: (response) => {
          if (response.error) {
            reject(
              new Error(
                response.error_description ||
                  `Google Anmeldung abgebrochen (${response.error})`
              )
            );
          } else {
            resolve(response);
          }
        },
        error_callback: (err) => {
          reject(
            new Error(
              err?.message || 'Google Anmelde-Popup wurde blockiert oder geschlossen.'
            )
          );
        },
      });
      client.requestAccessToken({ prompt: 'consent' });
    } catch (err) {
      reject(err);
    }
  });

  accessToken = tokenResp.access_token;
  tokenExpiresAt = Date.now() + Number(tokenResp.expires_in || 3600) * 1000;

  store.update((s) => {
    s.google.clientId = clientId;
    s.google.connected = true;
    s.google.demoMode = false;
  });

  await syncGoogleCalendars();
  return true;
}

export function disconnectGoogleAccount() {
  if (accessToken && window.google?.accounts?.oauth2?.revoke) {
    try {
      window.google.accounts.oauth2.revoke(accessToken);
    } catch {
      // Ignore revoke error if offline
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
  const timeMax = new Date(`${addDays(150)}T23:59:59`).toISOString();

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
      if (!s.google.writeCalendarId || !calendars.some((c) => c.id === s.google.writeCalendarId)) {
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
