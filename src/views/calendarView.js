import { ICONS } from '../components/icons.js';
import {
  COURSE_COLORS,
  MONTHS_DE,
  WEEKDAYS_SHORT,
  formatDateDE,
  formatShortDateDE,
  getISOWeek,
  getMondayIndex,
  isoDate,
  parseISODate,
} from '../data/defaults.js';
import { hasActiveGoogleToken } from '../services/googleCalendar.js';
import { isPersonalBridgeConfigured } from '../services/personalBridge.js';
import { getAllCalendarEvents } from '../state/store.js';
import { esc } from '../utils/html.js';
import { findHolidayForDate, getSemesterDayStatus } from '../utils/semester.js';

export function renderCalendarView(state, ui) {
  const todayIso = isoDate();
  const selectedIso = ui.selectedCalendarDate || todayIso;
  const cursorYear = ui.calYear ?? parseISODate(selectedIso).getFullYear();
  const cursorMonth = ui.calMonth ?? parseISODate(selectedIso).getMonth();
  const filter = ui.calFilter || 'all'; // 'all' | 'google' | 'exam' | 'task'

  const allEvents = getAllCalendarEvents(state);
  const filteredEvents = allEvents.filter((ev) => {
    if (filter === 'all') return true;
    if (filter === 'google') return ev.source === 'google' || ev.source === 'google-demo';
    if (filter === 'exam') return ev.source === 'exam' || ev.isDetectedExam;
    if (filter === 'task') return ev.source === 'task';
    return true;
  });

  const byDate = new Map();
  for (const ev of filteredEvents) {
    if (!byDate.has(ev.date)) byDate.set(ev.date, []);
    byDate.get(ev.date).push(ev);
  }

  const selDateObj = parseISODate(selectedIso);
  const selMonIdx = getMondayIndex(selDateObj);
  const selKwParity = getISOWeek(selDateObj) % 2 === 0 ? 'even' : 'odd';
  const selDayStatus = getSemesterDayStatus(selectedIso, state.semesterConfig);

  const dayCourses =
    !selDayStatus.isLectureDay || filter === 'google' || filter === 'exam' || filter === 'task'
      ? []
      : (state.timetable || [])
          .filter(
            (c) =>
              Number(c.day) === selMonIdx &&
              (c.weekParity === 'all' || c.weekParity === selKwParity)
          )
          .map((c) => ({
            id: `tt_${c.id}`,
            title: `${c.title} (${c.type})`,
            date: selectedIso,
            start: c.start,
            end: c.end,
            location: c.room,
            notes: c.lecturer,
            source: 'timetable',
            calendarName: 'Stundenplan',
            color: c.color || 'sage',
          }));

  const dayEvents = [...(byDate.get(selectedIso) || []), ...dayCourses].sort((a, b) =>
    (a.start || '99:99').localeCompare(b.start || '99:99')
  );

  const firstOfMonth = new Date(cursorYear, cursorMonth, 1);
  const startOffset = getMondayIndex(firstOfMonth);
  const gridStart = new Date(cursorYear, cursorMonth, 1 - startOffset);

  const cells = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(gridStart);
    d.setDate(gridStart.getDate() + i);
    const iso = isoDate(d);
    const evs = byDate.get(iso) || [];
    const hol = findHolidayForDate(iso, state.semesterConfig);
    cells.push({
      iso,
      dayNum: d.getDate(),
      inMonth: d.getMonth() === cursorMonth,
      isToday: iso === todayIso,
      isSelected: iso === selectedIso,
      isHoliday: Boolean(hol),
      dots: evs.slice(0, 3).map((e) => getEventDotColor(e)),
    });
  }

  const g = state.google;
  const bridgeActive = isPersonalBridgeConfigured();
  const lastSyncStr = g.lastSync
    ? new Date(g.lastSync).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
    : null;
  const lastDriveStr = g.lastDriveSync
    ? new Date(g.lastDriveSync).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
    : null;
  const sessionActive = bridgeActive || hasActiveGoogleToken();

  return `
    <header class="page-header">
      <div>
        <div class="page-eyebrow">Deine Google-Termine, Klausuren & Abgaben an einem Ort</div>
        <h1 class="page-title">Kalender</h1>
      </div>
      <div class="page-actions">
        <button class="btn btn-secondary btn-sm" data-action="import-ics-calendar">
          ${ICONS.upload} .ics Import
        </button>
        <button class="btn btn-primary" data-action="open-modal" data-modal="event" data-date="${esc(selectedIso)}">
          ${ICONS.plus} Termin
        </button>
      </div>
    </header>

    <section class="google-banner" aria-label="Google Kalender Status">
      <div class="google-banner-info">
        <div class="google-icon-wrap">${ICONS.google}</div>
        <div>
          <div class="fw-700" style="font-size:0.94rem;">
            ${
              bridgeActive
                ? `Dauer-Sync aktiv (${esc(g.userEmail || 'Google-Konto')})`
                : g.connected
                  ? `Verbunden mit ${esc(g.userEmail || 'Google Kalender')}`
                  : 'Dauer-Sync einrichten — nie wieder mit Google neu anmelden'
            }
          </div>
          <div class="text-xs text-secondary">
            ${
              bridgeActive
                ? `${(state.googleEvents || []).length} Google-Termine · Handy, iPad & PC automatisch synchron · Stand ${lastSyncStr || 'gerade eben'}`
                : g.connected
                  ? `${(state.googleEvents || []).length} Google-Termine · Kalender-Sync ${lastSyncStr || 'aktiv'}${
                      lastDriveStr ? ` · Drive-Sync ${lastDriveStr}` : ''
                    }${!sessionActive ? ' · Sitzung pausiert' : ''}`
                  : 'Richte einmalig deinen persönlichen Dauer-Sync ein: Abgaben, Einträge & Google Kalender bleiben automatisch auf Handy, iPad & PC gleich.'
            }
          </div>
        </div>
      </div>
      <div class="flex-row">
        ${
          bridgeActive || g.connected
            ? `
              <button class="btn btn-google btn-sm" data-action="${sessionActive ? 'sync-google-now' : 'refresh-google-session'}">
                ${ICONS.sync} ${sessionActive ? 'Sync' : 'Sitzung erneuern'}
              </button>
              <button class="btn btn-secondary btn-sm" data-action="open-modal" data-modal="settings">
                Einstellungen
              </button>
            `
            : `
              <button class="btn btn-google btn-sm" data-action="open-modal" data-modal="settings">
                ${ICONS.cloud} Dauer-Sync einrichten
              </button>
            `
        }
      </div>
    </section>

    <div class="timetable-toolbar">
      <div class="segmented-bar" role="tablist" aria-label="Kalenderfilter">
        <button class="segment-btn ${filter === 'all' ? 'active' : ''}" data-action="set-cal-filter" data-value="all">Alle</button>
        <button class="segment-btn ${filter === 'google' ? 'active' : ''}" data-action="set-cal-filter" data-value="google">Google</button>
        <button class="segment-btn ${filter === 'exam' ? 'active' : ''}" data-action="set-cal-filter" data-value="exam">Klausuren</button>
        <button class="segment-btn ${filter === 'task' ? 'active' : ''}" data-action="set-cal-filter" data-value="task">Abgaben</button>
      </div>
      <button class="btn btn-ghost btn-sm" data-action="cal-today">Heute</button>
    </div>

    <div class="calendar-layout">
      <section class="card" aria-label="Monatsansicht">
        <div class="cal-header">
          <button class="icon-btn surface" data-action="cal-prev-month" aria-label="Vorheriger Monat">
            ${ICONS.chevronLeft}
          </button>
          <div class="cal-month-title">${MONTHS_DE[cursorMonth]} ${cursorYear}</div>
          <button class="icon-btn surface" data-action="cal-next-month" aria-label="Nächster Monat">
            ${ICONS.chevronRight}
          </button>
        </div>

        <div class="cal-weekdays">
          ${WEEKDAYS_SHORT.map((d) => `<div>${d}</div>`).join('')}
        </div>

        <div class="cal-grid">
          ${cells
            .map(
              (c) => `
            <button
              class="cal-cell ${c.inMonth ? '' : 'other-month'} ${c.isToday ? 'is-today' : ''} ${c.isSelected ? 'selected' : ''} ${c.isHoliday ? 'is-holiday' : ''}"
              data-action="select-cal-date"
              data-date="${c.iso}"
            >
              <span>${c.dayNum}</span>
              <span class="cal-dots">
                ${c.dots.map((col) => `<span class="cal-dot" style="background:${col}"></span>`).join('')}
              </span>
            </button>`
            )
            .join('')}
        </div>
      </section>

      <section class="card" aria-label="Tagesagenda">
        <div class="section-head">
          <div>
            <h2 class="section-title">${formatShortDateDE(selectedIso)}</h2>
            <div class="text-xs text-muted">${formatDateDE(selectedIso)} · ${dayEvents.length} Einträge</div>
          </div>
          <button class="btn btn-soft btn-sm" data-action="open-modal" data-modal="event" data-date="${esc(selectedIso)}">
            ${ICONS.plus} Neu
          </button>
        </div>

        ${
          !selDayStatus.isLectureDay
            ? `<div class="note-card mb-sm" style="background:var(--accent-ochre-soft); margin-bottom:12px;">
                <div class="text-xs fw-700" style="color:var(--accent-ochre);">${esc(selDayStatus.label)}</div>
                <div class="text-xs text-secondary">Vorlesungen und reguläre Semester-Abgaben werden an diesem Tag automatisch ausgeblendet.</div>
              </div>`
            : ''
        }

        ${
          dayEvents.length === 0
            ? `<div class="empty-state">
                <strong>Nichts geplant an diesem Tag</strong>
                Tippe auf „+ Neu“, um einen Termin lokal oder direkt in deinem Google Kalender zu speichern.
              </div>`
            : `<div class="timeline-list">
                ${dayEvents
                  .map((ev) => {
                    const dotColor = getEventDotColor(ev);
                    const isGoogleSrc = ev.source === 'google' || ev.source === 'google-demo';
                    const gKey = ev.googleEventId || ev.id;
                    const badgeClass = ev.isDetectedExam
                      ? 'badge-terracotta'
                      : isGoogleSrc
                        ? 'badge-google'
                        : ev.source === 'exam'
                          ? 'badge-terracotta'
                          : ev.source === 'task'
                            ? 'badge-ochre'
                            : 'badge-sage';
                    const canDelete = ev.source === 'local';
                    const canPush = ev.source === 'local' || ev.source === 'exam';

                    return `
                      <div class="timeline-item">
                        <div class="timeline-bar" style="background:${dotColor}"></div>
                        <div class="timeline-time">
                          <strong>${esc(ev.start === '23:59' ? '24:00' : ev.start || '–')}</strong>
                          <span>${esc(ev.end || '')}</span>
                        </div>
                        <div class="timeline-body">
                          <div class="timeline-title">
                            <span>${esc(ev.title)}</span>
                            <span class="badge ${badgeClass}">${esc(ev.isDetectedExam ? 'Klausur (Google)' : ev.calendarName || 'Termin')}</span>
                          </div>
                          <div class="timeline-meta">
                            ${ev.location ? `<span>${esc(ev.location)}</span>` : ''}
                            ${ev.notes ? `<span>· ${esc(ev.notes.slice(0, 80))}</span>` : ''}
                          </div>
                          <div class="flex-row mt-sm">
                            ${
                              isGoogleSrc
                                ? `<button class="btn ${ev.isDetectedExam ? 'btn-soft' : 'btn-secondary'} btn-sm" data-action="toggle-google-exam" data-gkey="${esc(gKey)}">
                                    ${ev.isDetectedExam ? '✓ In Klausuren' : '+ Als Klausur übernehmen'}
                                  </button>`
                                : ''
                            }
                            ${
                              canPush
                                ? `<button class="btn btn-ghost btn-sm" data-action="push-event-google" data-title="${esc(ev.title)}" data-date="${esc(ev.date)}" data-start="${esc(ev.start || '09:00')}" data-end="${esc(ev.end || '')}" data-location="${esc(ev.location || '')}" data-notes="${esc(ev.notes || '')}">
                                    ${ICONS.google} ${state.google.connected ? 'In Google speichern' : '.ics'}
                                  </button>`
                                : ''
                            }
                            ${
                              ev.htmlLink
                                ? `<a class="btn btn-ghost btn-sm" href="${esc(ev.htmlLink)}" target="_blank" rel="noopener noreferrer">Google ${ICONS.external}</a>`
                                : ''
                            }
                            ${
                              canDelete
                                ? `<button class="btn btn-ghost btn-sm" data-action="delete-event" data-id="${esc(ev.id)}" aria-label="Termin löschen">${ICONS.trash}</button>`
                                : ''
                            }
                          </div>
                        </div>
                      </div>`;
                  })
                  .join('')}
              </div>`
        }
      </section>
    </div>
  `;
}

function getEventDotColor(ev) {
  if (ev.isDetectedExam || ev.source === 'exam') return 'var(--accent-terracotta)';
  if (ev.source === 'google' || ev.source === 'google-demo') return 'var(--accent-google)';
  if (ev.source === 'task') return 'var(--accent-ochre)';
  return (COURSE_COLORS[ev.color] || COURSE_COLORS.sage).hex;
}
