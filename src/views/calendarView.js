import { ICONS } from '../components/icons.js';
import {
  COURSE_COLORS,
  MONTHS_DE,
  WEEKDAYS_FULL,
  WEEKDAYS_SHORT,
  addDaysToISO,
  daysBetween,
  formatDateDE,
  formatShortDateDE,
  getISOWeek,
  getMondayIndex,
  isoDate,
  parseISODate,
} from '../data/defaults.js';
import { hasActiveGoogleToken } from '../services/googleCalendar.js';
import { isPersonalBridgeConfigured } from '../services/personalBridge.js';
import { getAllCalendarEvents, getUnifiedExams } from '../state/store.js';
import { esc } from '../utils/html.js';
import {
  findHolidayForDate,
  getSemesterBannerInfo,
  getSemesterDayStatus,
} from '../utils/semester.js';

export function renderCalendarView(state, ui) {
  const todayIso = isoDate();
  const selectedIso = ui.selectedCalendarDate || todayIso;
  const cursorYear = ui.calYear ?? parseISODate(selectedIso).getFullYear();
  const cursorMonth = ui.calMonth ?? parseISODate(selectedIso).getMonth();
  const calSub = ['month', 'week', 'upcoming', 'semester'].includes(ui.calSub) ? ui.calSub : 'month';
  const filter = ui.calFilter || 'all'; // 'all' | 'google' | 'exam' | 'task'
  const showLectures = ui.calShowLectures !== false;
  const searchQuery = String(ui.calSearch || '').trim();
  const searchLower = searchQuery.toLowerCase();

  const allEvents = getAllCalendarEvents(state);
  const filteredEvents = allEvents.filter((ev) => {
    if (filter === 'google' && ev.source !== 'google' && ev.source !== 'google-demo') return false;
    if (filter === 'exam' && ev.source !== 'exam' && !ev.isDetectedExam) return false;
    if (filter === 'task' && ev.source !== 'task') return false;
    if (searchLower) {
      const hay = `${ev.title || ''} ${ev.location || ''} ${ev.notes || ''} ${ev.calendarName || ''}`.toLowerCase();
      if (!hay.includes(searchLower)) return false;
    }
    return true;
  });

  const byDate = new Map();
  for (const ev of filteredEvents) {
    if (!byDate.has(ev.date)) byDate.set(ev.date, []);
    byDate.get(ev.date).push(ev);
  }

  const upcomingCount = filteredEvents.filter((ev) => ev.date >= todayIso).length;
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
        <div class="page-eyebrow">Termine, Wochenplan, Klausuren &amp; Semester-Zeitstrahl</div>
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

    ${renderSyncStrip(state, bridgeActive, lastSyncStr, lastDriveStr, sessionActive)}

    <!-- Primary Calendar Sub-Tabs (Reiter) -->
    <div class="timetable-toolbar" style="gap:10px;">
      <div class="segmented-bar" role="tablist" aria-label="Kalender-Ansicht">
        <button class="segment-btn ${calSub === 'month' ? 'active' : ''}" data-action="set-cal-sub" data-value="month">
          Monat
        </button>
        <button class="segment-btn ${calSub === 'week' ? 'active' : ''}" data-action="set-cal-sub" data-value="week">
          Woche
        </button>
        <button class="segment-btn ${calSub === 'upcoming' ? 'active' : ''}" data-action="set-cal-sub" data-value="upcoming">
          Anstehend (${upcomingCount})
        </button>
        <button class="segment-btn ${calSub === 'semester' ? 'active' : ''}" data-action="set-cal-sub" data-value="semester">
          Semester
        </button>
      </div>

      <div class="flex-row" style="gap:6px; flex-wrap:wrap;">
        ${
          calSub === 'month' || calSub === 'week'
            ? `<button
                class="btn ${showLectures ? 'btn-soft' : 'btn-ghost'} btn-sm"
                data-action="toggle-cal-lectures"
                title="Reguläre Vorlesungen aus dem Stundenplan ein-/ausblenden"
              >
                ${showLectures ? '✓ Vorlesungen' : '+ Vorlesungen'}
              </button>`
            : ''
        }
        ${
          calSub !== 'semester'
            ? `<button class="btn btn-ghost btn-sm" data-action="cal-today">Heute</button>`
            : `<button class="btn btn-secondary btn-sm" data-action="open-modal" data-modal="settings">Zeiten anpassen</button>`
        }
      </div>
    </div>

    <!-- Filter & Search Row (for Monat, Woche, Anstehend) -->
    ${
      calSub !== 'semester'
        ? `<div class="cal-filter-row mb-md">
            <div class="segmented-bar" role="tablist" aria-label="Kategorie filtern">
              <button class="segment-btn ${filter === 'all' ? 'active' : ''}" data-action="set-cal-filter" data-value="all">Alle</button>
              <button class="segment-btn ${filter === 'google' ? 'active' : ''}" data-action="set-cal-filter" data-value="google">Google</button>
              <button class="segment-btn ${filter === 'exam' ? 'active' : ''}" data-action="set-cal-filter" data-value="exam">Klausuren</button>
              <button class="segment-btn ${filter === 'task' ? 'active' : ''}" data-action="set-cal-filter" data-value="task">To-Dos</button>
            </div>
            <div class="cal-search-wrap">
              <input
                id="cal-search-input"
                type="search"
                class="input cal-search-input"
                placeholder="Termin, Raum oder Fach suchen…"
                value="${esc(searchQuery)}"
                data-cal-search="1"
              />
            </div>
          </div>`
        : ''
    }

    ${
      calSub === 'month'
        ? renderMonthSubView(state, byDate, {
            todayIso,
            selectedIso,
            cursorYear,
            cursorMonth,
            filter,
            showLectures,
            bridgeActive,
          })
        : calSub === 'week'
          ? renderWeekSubView(state, byDate, {
              todayIso,
              selectedIso,
              filter,
              showLectures,
              bridgeActive,
            })
          : calSub === 'upcoming'
            ? renderUpcomingSubView(state, filteredEvents, {
                todayIso,
                searchQuery,
                bridgeActive,
              })
            : renderSemesterSubView(state, todayIso)
    }
  `;
}

/* ==========================================================================
   SYNC BANNER (compact when active)
   ========================================================================== */
function renderSyncStrip(state, bridgeActive, lastSyncStr, lastDriveStr, sessionActive) {
  const g = state.google;
  if (bridgeActive) {
    return `
      <div class="semester-strip mb-md" aria-label="Dauer-Sync Status">
        <div class="flex-row" style="gap:8px;">
          <span class="sync-dot connected"></span>
          <div class="text-xs text-secondary">
            <strong>Dauer-Sync aktiv</strong> (${esc(g.userEmail || 'Google-Konto')}) · ${(state.googleEvents || []).length} Google-Termine · Stand ${lastSyncStr || 'gerade eben'}
          </div>
        </div>
        <div class="flex-row" style="gap:6px;">
          <button class="btn btn-secondary btn-sm" data-action="sync-google-now">${ICONS.sync} Sync</button>
          <button class="btn btn-ghost btn-sm" data-action="open-modal" data-modal="settings">${ICONS.settings}</button>
        </div>
      </div>`;
  }
  return `
    <section class="google-banner" aria-label="Google Kalender Status">
      <div class="google-banner-info">
        <div class="google-icon-wrap">${ICONS.google}</div>
        <div>
          <div class="fw-700" style="font-size:0.94rem;">
            ${
              g.connected
                ? `Verbunden mit ${esc(g.userEmail || 'Google Kalender')}`
                : 'Dauer-Sync einrichten — alle Geräte & Google Kalender synchron'
            }
          </div>
          <div class="text-xs text-secondary">
            ${
              g.connected
                ? `${(state.googleEvents || []).length} Google-Termine · Kalender-Sync ${lastSyncStr || 'aktiv'}${
                    lastDriveStr ? ` · Drive-Sync ${lastDriveStr}` : ''
                  }${!sessionActive ? ' · Sitzung pausiert' : ''}`
                : 'Einmal einrichten: Abgaben, Einträge & Google Kalender bleiben automatisch auf Handy, iPad & PC gleich.'
            }
          </div>
        </div>
      </div>
      <div class="flex-row">
        ${
          g.connected
            ? `
              <button class="btn btn-google btn-sm" data-action="${sessionActive ? 'sync-google-now' : 'refresh-google-session'}">
                ${ICONS.sync} ${sessionActive ? 'Sync' : 'Sitzung erneuern'}
              </button>
              <button class="btn btn-secondary btn-sm" data-action="open-modal" data-modal="settings">
                Einstellungen
              </button>`
            : `
              <button class="btn btn-google btn-sm" data-action="open-modal" data-modal="settings">
                ${ICONS.cloud} Dauer-Sync einrichten
              </button>`
        }
      </div>
    </section>`;
}

/* ==========================================================================
   HELPER: Events for a single date (calendar events + optional timetable)
   ========================================================================== */
function getEventsForDate(state, byDate, iso, { filter, showLectures }) {
  const dateObj = parseISODate(iso);
  const monIdx = getMondayIndex(dateObj);
  const kwParity = getISOWeek(dateObj) % 2 === 0 ? 'even' : 'odd';
  const dayStatus = getSemesterDayStatus(iso, state.semesterConfig);

  const includeLectures =
    showLectures &&
    dayStatus.isLectureDay &&
    filter === 'all';

  const dayCourses = !includeLectures
    ? []
    : (state.timetable || [])
        .filter(
          (c) =>
            Number(c.day) === monIdx &&
            (c.weekParity === 'all' || c.weekParity === kwParity)
        )
        .map((c) => ({
          id: `tt_${c.id}`,
          title: `${c.title} (${c.type})`,
          shortTitle: `${c.short || c.title} (${c.type})`,
          date: iso,
          start: c.start,
          end: c.end,
          location: c.room,
          notes: c.lecturer,
          source: 'timetable',
          calendarName: 'Stundenplan',
          color: c.color || 'sage',
        }));

  const combined = [...(byDate.get(iso) || []), ...dayCourses].sort((a, b) =>
    (a.start || '99:99').localeCompare(b.start || '99:99')
  );
  return { events: combined, dayStatus };
}

/* ==========================================================================
   REITER 1: MONAT (Month Grid + Smart Day Agenda with ←/→ stepper)
   ========================================================================== */
function renderMonthSubView(
  state,
  byDate,
  { todayIso, selectedIso, cursorYear, cursorMonth, filter, showLectures, bridgeActive }
) {
  const { events: dayEvents, dayStatus: selDayStatus } = getEventsForDate(state, byDate, selectedIso, {
    filter,
    showLectures,
  });

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
    const hasExam = evs.some((e) => e.source === 'exam' || e.isDetectedExam);
    const dayPhase = getSemesterDayStatus(iso, state.semesterConfig).phase;
    cells.push({
      iso,
      dayNum: d.getDate(),
      inMonth: d.getMonth() === cursorMonth,
      isToday: iso === todayIso,
      isSelected: iso === selectedIso,
      isHoliday: Boolean(hol),
      isExamDay: hasExam,
      isExamPeriod: dayPhase === 'exams',
      dots: evs.slice(0, 3).map((e) => getEventDotColor(e)),
    });
  }

  return `
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
              class="cal-cell ${c.inMonth ? '' : 'other-month'} ${c.isToday ? 'is-today' : ''} ${c.isSelected ? 'selected' : ''} ${c.isHoliday ? 'is-holiday' : ''} ${c.isExamDay ? 'is-exam-day' : ''}"
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

        <div class="cal-legend mt-md">
          <span><i class="cal-dot" style="background:var(--accent-terracotta)"></i> Klausur</span>
          <span><i class="cal-dot" style="background:var(--accent-google)"></i> Google</span>
          <span><i class="cal-dot" style="background:var(--accent-ochre)"></i> To-Do / Übung</span>
          <span><i class="cal-dot" style="background:var(--accent-primary)"></i> Termin</span>
          <span><i class="cal-legend-box"></i> Ferien</span>
        </div>
      </section>

      <section class="card" aria-label="Tagesagenda">
        <div class="section-head">
          <div>
            <h2 class="section-title">${formatShortDateDE(selectedIso)}</h2>
            <div class="text-xs text-muted">${formatDateDE(selectedIso)} · KW ${getISOWeek(parseISODate(selectedIso))} · ${dayEvents.length} Einträge</div>
          </div>
          <div class="flex-row" style="gap:4px;">
            <button class="icon-btn surface" data-action="cal-step-day" data-delta="-1" aria-label="Vorheriger Tag" title="Vorheriger Tag">
              ${ICONS.chevronLeft}
            </button>
            <button class="icon-btn surface" data-action="cal-step-day" data-delta="1" aria-label="Nächster Tag" title="Nächster Tag">
              ${ICONS.chevronRight}
            </button>
            <button class="btn btn-soft btn-sm" data-action="open-modal" data-modal="event" data-date="${esc(selectedIso)}">
              ${ICONS.plus} Neu
            </button>
          </div>
        </div>

        ${
          !selDayStatus.isLectureDay
            ? `<div class="note-card mb-sm" style="background:var(--accent-ochre-soft); margin-bottom:12px;">
                <div class="text-xs fw-700" style="color:var(--accent-ochre);">${esc(selDayStatus.label)}</div>
                <div class="text-xs text-secondary">Reguläre Vorlesungen und Semester-Abgaben pausieren an diesem Tag.</div>
              </div>`
            : ''
        }

        ${
          dayEvents.length === 0
            ? `<div class="empty-state">
                <strong>Freier Tag — nichts geplant</strong>
                Tippe auf „+ Neu“, um einen Termin einzutragen, oder schalte oben „+ Vorlesungen“ ein.
              </div>`
            : `<div class="timeline-list">
                ${dayEvents.map((ev) => renderEventRow(state, ev, bridgeActive, false)).join('')}
              </div>`
        }
      </section>
    </div>
  `;
}

/* ==========================================================================
   REITER 2: WOCHE (7-Tage Wochenboard Mo–So)
   ========================================================================== */
function renderWeekSubView(state, byDate, { todayIso, selectedIso, filter, showLectures, bridgeActive }) {
  const selDate = parseISODate(selectedIso);
  const monOffset = getMondayIndex(selDate);
  const mondayIso = addDaysToISO(selectedIso, -monOffset);
  const sundayIso = addDaysToISO(mondayIso, 6);
  const kw = getISOWeek(parseISODate(mondayIso));

  const weekDays = Array.from({ length: 7 }, (_, idx) => {
    const iso = addDaysToISO(mondayIso, idx);
    const { events, dayStatus } = getEventsForDate(state, byDate, iso, { filter, showLectures });
    return {
      iso,
      dayName: WEEKDAYS_FULL[idx],
      dayShort: WEEKDAYS_SHORT[idx],
      dateNum: parseISODate(iso).getDate(),
      isToday: iso === todayIso,
      isSelected: iso === selectedIso,
      dayStatus,
      events,
    };
  });

  const totalWeekEvents = weekDays.reduce((sum, d) => sum + d.events.length, 0);

  return `
    <section class="card">
      <div class="cal-header" style="margin-bottom:14px;">
        <button class="icon-btn surface" data-action="cal-step-week" data-delta="-7" aria-label="Vorherige Woche">
          ${ICONS.chevronLeft}
        </button>
        <div style="text-align:center;">
          <div class="cal-month-title">KW ${kw} · ${formatShortDateDE(mondayIso)} – ${formatShortDateDE(sundayIso)}</div>
          <div class="text-xs text-muted">${totalWeekEvents} Einträge in dieser Woche</div>
        </div>
        <button class="icon-btn surface" data-action="cal-step-week" data-delta="7" aria-label="Nächste Woche">
          ${ICONS.chevronRight}
        </button>
      </div>

      <div class="cal-week-board">
        ${weekDays
          .map(
            (day) => `
          <div class="cal-week-col ${day.isToday ? 'is-today' : ''} ${!day.dayStatus.isLectureDay ? 'is-break' : ''}">
            <div class="cal-week-col-head">
              <button
                class="cal-week-day-btn"
                data-action="select-cal-date"
                data-date="${day.iso}"
                title="Tag im Detail ansehen"
              >
                <span class="text-xs text-muted">${day.dayShort}</span>
                <strong class="mono">${day.dateNum}.</strong>
              </button>
              <button
                class="icon-btn"
                style="width:26px; height:26px;"
                data-action="open-modal"
                data-modal="event"
                data-date="${day.iso}"
                title="Termin am ${formatShortDateDE(day.iso)} hinzufügen"
                aria-label="Termin hinzufügen"
              >
                ${ICONS.plus}
              </button>
            </div>

            ${
              !day.dayStatus.isLectureDay
                ? `<div class="cal-week-holiday-tag">${esc(day.dayStatus.label)}</div>`
                : ''
            }

            <div class="cal-week-events">
              ${
                day.events.length === 0
                  ? `<div class="cal-week-empty">–</div>`
                  : day.events
                      .map((ev) => {
                        const col = getEventDotColor(ev);
                        const isEditable = ev.source === 'local';
                        const isExam = ev.source === 'exam' || ev.isDetectedExam;
                        return `
                          <div
                            class="cal-week-chip ${isExam ? 'is-exam' : ''}"
                            style="border-left-color:${col};"
                            ${
                              isEditable
                                ? `data-action="open-modal" data-modal="event" data-id="${esc(ev.id)}" role="button" tabindex="0"`
                                : `data-action="select-cal-date" data-date="${day.iso}" role="button" tabindex="0"`
                            }
                            title="${esc(ev.title)}${ev.location ? ` · ${ev.location}` : ''}"
                          >
                            <div class="cal-week-chip-time mono">${esc(ev.start === '23:59' ? '24:00' : ev.start || 'Ganztägig')}</div>
                            <div class="cal-week-chip-title">${esc(ev.shortTitle || ev.title)}</div>
                            ${ev.location ? `<div class="cal-week-chip-meta">${esc(ev.location)}</div>` : ''}
                          </div>`;
                      })
                      .join('')
              }
            </div>
          </div>`
          )
          .join('')}
      </div>
    </section>
  `;
}

/* ==========================================================================
   REITER 3: ANSTEHEND (Smart Grouped Agenda — NO endless wall!)
   ========================================================================== */
function renderUpcomingSubView(state, filteredEvents, { todayIso, searchQuery, bridgeActive }) {
  const now = new Date();
  const upcoming = filteredEvents
    .filter((ev) => ev.date >= todayIso)
    .sort((a, b) => `${a.date}T${a.start || '99:99'}`.localeCompare(`${b.date}T${b.start || '99:99'}`));

  if (upcoming.length === 0) {
    return `
      <div class="card empty-state">
        <strong>${searchQuery ? `Keine Treffer für „${esc(searchQuery)}“` : 'Keine anstehenden Termine'}</strong>
        ${
          searchQuery
            ? 'Probiere einen anderen Suchbegriff oder setze den Filter auf „Alle“.'
            : 'Füge oben über „+ Termin“ einen Termin hinzu oder richte Dauer-Sync für deinen Google Kalender ein.'
        }
      </div>`;
  }

  const buckets = [
    { key: 'soon', title: 'Heute & Morgen', badgeClass: 'badge-terracotta', items: [], openByDefault: true },
    { key: 'week', title: 'Diese Woche (2–7 Tage)', badgeClass: 'badge-ochre', items: [], openByDefault: true },
    { key: 'fortnight', title: 'Nächste 2–4 Wochen', badgeClass: 'badge-sage', items: [], openByDefault: true },
    { key: 'later', title: 'Später im Semester', badgeClass: 'badge-neutral', items: [], openByDefault: false },
  ];

  for (const ev of upcoming) {
    const diff = daysBetween(ev.date, now);
    if (diff <= 1) buckets[0].items.push(ev);
    else if (diff <= 7) buckets[1].items.push(ev);
    else if (diff <= 30) buckets[2].items.push(ev);
    else buckets[3].items.push(ev);
  }

  const nonEmpty = buckets.filter((b) => b.items.length > 0);
  // If only "Später im Semester" has events, keep it open automatically
  if (nonEmpty.length === 1) nonEmpty[0].openByDefault = true;

  return `
    <div class="cal-upcoming-stack">
      ${nonEmpty
        .map((bucket) => {
          const isOpen = bucket.openByDefault || Boolean(searchQuery);
          return `
            <details class="card cal-bucket" ${isOpen ? 'open' : ''}>
              <summary class="cal-bucket-head">
                <div class="flex-row" style="gap:8px;">
                  <span class="fw-700">${bucket.title}</span>
                  <span class="badge ${bucket.badgeClass} mono">${bucket.items.length}</span>
                </div>
                <span class="text-xs text-muted">Auf-/Zuklappen</span>
              </summary>
              <div class="timeline-list mt-md">
                ${bucket.items.map((ev) => renderEventRow(state, ev, bridgeActive, true)).join('')}
              </div>
            </details>`;
        })
        .join('')}
    </div>
  `;
}

/* ==========================================================================
   REITER 4: SEMESTER-ZEITSTRAHL & MEILENSTEINE
   ========================================================================== */
function renderSemesterSubView(state, todayIso) {
  const now = new Date();
  const semInfo = getSemesterBannerInfo(todayIso, state.semesterConfig);
  const cfg = semInfo.config;
  const hol = cfg.holidays?.[0];

  // Semester progress calculation (lecturesStart -> examPeriodEnd or lecturesEnd)
  const startMs = parseISODate(cfg.lecturesStart).getTime();
  const endIso = cfg.examPeriodEnd || cfg.lecturesEnd;
  const endMs = parseISODate(endIso).getTime();
  const nowMs = parseISODate(todayIso).getTime();
  const progressPct =
    endMs > startMs ? Math.max(0, Math.min(100, Math.round(((nowMs - startMs) / (endMs - startMs)) * 100))) : 0;

  const milestones = [
    { label: 'Vorlesungsbeginn', date: cfg.lecturesStart, type: 'sage' },
    cfg.examRegStart
      ? {
          label: `Prüfungsanmeldung${cfg.examRegEnd ? ` (bis ${formatShortDateDE(cfg.examRegEnd)})` : ''}`,
          date: cfg.examRegStart,
          endDate: cfg.examRegEnd,
          type: 'ochre',
        }
      : null,
    hol
      ? {
          label: `${hol.label} (bis ${formatShortDateDE(hol.end)})`,
          date: hol.start,
          endDate: hol.end,
          type: 'slate',
        }
      : null,
    { label: 'Letzter Vorlesungstag', date: cfg.lecturesEnd, type: 'sage' },
    cfg.examPeriodStart
      ? {
          label: `Prüfungszeitraum${cfg.examPeriodEnd ? ` (bis ${formatShortDateDE(cfg.examPeriodEnd)})` : ''}`,
          date: cfg.examPeriodStart,
          endDate: cfg.examPeriodEnd,
          type: 'terracotta',
        }
      : null,
  ]
    .filter(Boolean)
    .sort((a, b) => a.date.localeCompare(b.date));

  const exams = getUnifiedExams(state)
    .filter((e) => !e.completed)
    .sort((a, b) => a.date.localeCompare(b.date));

  return `
    <div class="today-grid">
      <div class="today-col">
        <section class="card">
          <div class="section-head">
            <div>
              <h2 class="section-title">Semester-Fortschritt · ${esc(cfg.name)}</h2>
              <div class="text-xs text-muted">${esc(semInfo.status.label)} · noch ${semInfo.weeksLeft} Vorlesungswochen</div>
            </div>
            <span class="badge badge-sage mono">${progressPct}%</span>
          </div>
          <div class="progress-track mt-sm" style="height:10px;">
            <div class="progress-fill" style="width:${progressPct}%"></div>
          </div>
          <div class="flex-between text-xs text-muted mt-sm">
            <span>Start: ${formatDateDE(cfg.lecturesStart)}</span>
            <span>Ende: ${formatDateDE(endIso)}</span>
          </div>

          <div class="cal-milestone-list mt-lg">
            ${milestones
              .map((m) => {
                const isPast = (m.endDate || m.date) < todayIso;
                const isActive = m.date <= todayIso && (m.endDate ? todayIso <= m.endDate : m.date === todayIso);
                const diff = daysBetween(m.date, now);
                const badgeTxt = isActive
                  ? 'Aktiv'
                  : isPast
                    ? 'Vorbei'
                    : diff === 0
                      ? 'Heute'
                      : `in ${diff} T.`;
                const badgeCls = isActive
                  ? 'badge-terracotta'
                  : isPast
                    ? 'badge-neutral'
                    : `badge-${m.type}`;
                return `
                  <div class="cal-milestone-item ${isPast ? 'is-past' : ''} ${isActive ? 'is-active' : ''}">
                    <span class="cal-milestone-dot" style="background:${(COURSE_COLORS[m.type] || COURSE_COLORS.sage).hex}"></span>
                    <div style="flex:1; min-width:0;">
                      <div class="fw-600 text-sm">${esc(m.label)}</div>
                      <div class="text-xs text-muted mono">${formatDateDE(m.date)}</div>
                    </div>
                    <span class="badge ${badgeCls} mono">${badgeTxt}</span>
                  </div>`;
              })
              .join('')}
          </div>
        </section>
      </div>

      <div class="today-col">
        <section class="card">
          <div class="section-head">
            <div>
              <h2 class="section-title">Klausuren-Fahrplan (${exams.length})</h2>
              <div class="text-xs text-muted">Abstände zwischen deinen Prüfungen auf einen Blick</div>
            </div>
            <button class="section-link" data-nav="exams">Alle Klausuren →</button>
          </div>

          ${
            exams.length === 0
              ? `<div class="empty-state">
                  <strong>Noch keine Klausuren eingetragen</strong>
                  Trage unter „Klausuren“ deine Prüfungstermine ein, dann siehst du hier automatisch die Lern-Abstände.
                </div>`
              : `<div class="cal-milestone-list">
                  ${exams
                    .map((ex, idx) => {
                      const d = daysBetween(ex.date, now);
                      const prev = idx > 0 ? exams[idx - 1] : null;
                      const gap = prev ? daysBetween(ex.date, parseISODate(prev.date)) : null;
                      return `
                        ${
                          gap !== null
                            ? `<div class="cal-exam-gap text-xs text-muted">↳ ${gap} Tag${gap === 1 ? '' : 'e'} Lernzeit bis zur nächsten Klausur</div>`
                            : ''
                        }
                        <div class="cal-milestone-item">
                          <span class="cal-milestone-dot" style="background:${(COURSE_COLORS[ex.color] || COURSE_COLORS.terracotta).hex}"></span>
                          <div style="flex:1; min-width:0;">
                            <div class="fw-600 text-sm">${esc(ex.title)}</div>
                            <div class="text-xs text-muted mono">${formatShortDateDE(ex.date)} (${formatDateDE(ex.date)}) · ${esc(ex.time || '09:00')}</div>
                          </div>
                          <span class="badge ${d <= 14 ? 'badge-terracotta' : 'badge-sage'} mono">${d <= 0 ? 'Heute' : `in ${d} T.`}</span>
                        </div>`;
                    })
                    .join('')}
                </div>`
          }
        </section>
      </div>
    </div>
  `;
}

/* ==========================================================================
   SHARED EVENT ROW (with Edit button for local events!)
   ========================================================================== */
function renderEventRow(state, ev, bridgeActive, showDateBadge = false) {
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
  const isLocal = ev.source === 'local';
  const canPush = isLocal || ev.source === 'exam';
  const diff = showDateBadge ? daysBetween(ev.date, new Date()) : null;
  const relLabel =
    diff === null
      ? ''
      : diff === 0
        ? 'Heute'
        : diff === 1
          ? 'Morgen'
          : `in ${diff} T.`;

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
          ${showDateBadge ? `<span class="badge badge-neutral mono">${formatShortDateDE(ev.date)} · ${relLabel}</span>` : ''}
          <span class="badge ${badgeClass}">${esc(ev.isDetectedExam ? 'Klausur (Google)' : ev.calendarName || 'Termin')}</span>
        </div>
        <div class="timeline-meta">
          ${ev.location ? `<span>${esc(ev.location)}</span>` : ''}
          ${ev.notes ? `<span>· ${esc(ev.notes.slice(0, 80))}</span>` : ''}
        </div>
        <div class="flex-row mt-sm" style="flex-wrap:wrap; gap:6px;">
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
                  ${ICONS.google} ${bridgeActive || state.google.connected ? 'In Google speichern' : '.ics'}
                </button>`
              : ''
          }
          ${
            ev.htmlLink
              ? `<a class="btn btn-ghost btn-sm" href="${esc(ev.htmlLink)}" target="_blank" rel="noopener noreferrer">Google ${ICONS.external}</a>`
              : ''
          }
          ${
            isLocal
              ? `<button class="btn btn-ghost btn-sm" data-action="open-modal" data-modal="event" data-id="${esc(ev.id)}" aria-label="Termin bearbeiten" title="Bearbeiten">${ICONS.edit}</button>
                 <button class="btn btn-ghost btn-sm" data-action="delete-event" data-id="${esc(ev.id)}" aria-label="Termin löschen" title="Löschen">${ICONS.trash}</button>`
              : ''
          }
        </div>
      </div>
    </div>`;
}

function getEventDotColor(ev) {
  if (ev.isDetectedExam || ev.source === 'exam') return 'var(--accent-terracotta)';
  if (ev.source === 'google' || ev.source === 'google-demo') return 'var(--accent-google)';
  if (ev.source === 'task') return 'var(--accent-ochre)';
  return (COURSE_COLORS[ev.color] || COURSE_COLORS.sage).hex;
}
