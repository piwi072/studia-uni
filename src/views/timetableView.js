import { ICONS } from '../components/icons.js';
import {
  COURSE_COLORS,
  WEEKDAYS_FULL,
  WEEKDAYS_SHORT,
  formatDateDE,
  getISOWeek,
  getMondayIndex,
  isoDate,
} from '../data/defaults.js';
import { timeToMinutes } from '../state/store.js';
import { esc } from '../utils/html.js';
import { getSemesterBannerInfo } from '../utils/semester.js';

export function renderTimetableView(state, ui) {
  const todayIso = isoDate();
  const semInfo = getSemesterBannerInfo(todayIso, state.semesterConfig);
  const kw = getISOWeek();
  const currentParity = kw % 2 === 0 ? 'even' : 'odd';
  const todayMonIdx = getMondayIndex();
  const showSat = Boolean(state.profile.showSaturday);
  const daysCount = showSat ? 6 : 5;
  const parityFilter = ui.weekParityFilter || 'all';
  const selectedDay = Math.min(ui.selectedTimetableDay ?? Math.min(todayMonIdx, 4), daysCount - 1);

  // Automatic responsive behavior: PC & iPad (>=720px) show normal week grid, phones (<720px) show readable day-pills
  const isSmallScreen = window.innerWidth < 720;
  const useAgenda = ui.timetableLayout ? ui.timetableLayout === 'agenda' : isSmallScreen;

  const filtered = (state.timetable || []).filter((item) => {
    if (Number(item.day) >= daysCount) return false;
    if (parityFilter === 'all') return true;
    const activeParity = parityFilter === 'current' ? currentParity : parityFilter;
    return item.weekParity === 'all' || item.weekParity === activeParity;
  });

  const totalEctsThisTerm = (state.timetable || []).reduce(
    (sum, c) => sum + Number(c.ects || 0),
    0
  );

  const hasParitySpecific = (state.timetable || []).some((c) => c.weekParity !== 'all');
  const hol = semInfo.config.holidays?.[0];

  return `
    <header class="page-header">
      <div>
        <div class="page-eyebrow">${esc(state.profile.semester)} · KW ${kw} · BEng-WIE-1</div>
        <h1 class="page-title">Stundenplan</h1>
      </div>
      <div class="page-actions">
        <button class="btn btn-secondary btn-sm" data-action="import-ics-timetable" title="Stundenplan (.ics) importieren">
          ${ICONS.upload} .ics Import
        </button>
        <button class="btn btn-secondary btn-sm" data-action="export-ics-timetable" title="Kompletten Stundenplan als .ics für Google Kalender exportieren">
          ${ICONS.download} .ics Export
        </button>
        <button class="btn btn-primary" data-action="open-modal" data-modal="course">
          ${ICONS.plus} Kurs
        </button>
      </div>
    </header>

    <div class="semester-strip mb-md ${!semInfo.status.isLectureDay ? 'is-break' : ''}">
      <div class="text-xs text-secondary">
        ${
          !semInfo.status.isLectureDay
            ? `<strong>${esc(semInfo.status.label)}:</strong> Reguläre Vorlesungen pausieren aktuell. Unten siehst du deinen normalen Wochenplan zur Übersicht.`
            : `<strong>Vorlesungszeit ${esc(semInfo.config.name)}:</strong> bis ${formatDateDE(semInfo.config.lecturesEnd)} (<strong>noch ${semInfo.weeksLeft} Wochen</strong>)${
                hol ? ` · Ferien: ${formatDateDE(hol.start)}–${formatDateDE(hol.end)}` : ''
              }${
                semInfo.config.examPeriodStart ? ` · Prüfungen ab ${formatDateDE(semInfo.config.examPeriodStart)}` : ''
              }`
        }
      </div>
      <button class="btn btn-secondary btn-sm" data-action="open-modal" data-modal="settings">Zeiten anpassen</button>
    </div>

    <div class="timetable-toolbar">
      ${
        hasParitySpecific
          ? `<div class="segmented-bar" role="tablist" aria-label="Wochen-Rhythmus">
              <button class="segment-btn ${parityFilter === 'all' ? 'active' : ''}" data-action="set-parity" data-value="all">Alle</button>
              <button class="segment-btn ${parityFilter === 'current' ? 'active' : ''}" data-action="set-parity" data-value="current">KW ${kw} (${currentParity === 'even' ? 'G' : 'U'})</button>
              <button class="segment-btn ${parityFilter === 'even' ? 'active' : ''}" data-action="set-parity" data-value="even">Gerade</button>
              <button class="segment-btn ${parityFilter === 'odd' ? 'active' : ''}" data-action="set-parity" data-value="odd">Ungerade</button>
            </div>`
          : `<div class="flex-row">
              <span class="badge badge-sage mono">${totalEctsThisTerm} ECTS · Alle Kurse wöchentlich</span>
            </div>`
      }

      <div class="flex-row">
        ${hasParitySpecific ? `<span class="badge badge-sage mono">${totalEctsThisTerm} ECTS</span>` : ''}
        <a class="btn btn-ghost btn-sm" href="https://davinci.ei.hs-duesseldorf.de/davinciIS.dll?type=class" target="_blank" rel="noopener noreferrer">
          DaVinci EI ${ICONS.external}
        </a>
        <button class="btn btn-ghost btn-sm" data-action="toggle-timetable-layout">
          ${useAgenda ? 'Wochenraster' : 'Tagesansicht'}
        </button>
      </div>
    </div>

    ${
      useAgenda
        ? renderAgendaTimetable(filtered, daysCount, selectedDay, todayMonIdx)
        : renderWeekGridTimetable(filtered, daysCount, todayMonIdx)
    }

    <div class="card card-compact mt-lg flex-between" style="flex-wrap:wrap;">
      <div class="text-sm text-secondary">
        <strong>Hinweis GET I Praktikum (05.2.055):</strong> Da es nur einmal im Semester stattfindet, liegt es übersichtlich als Einzeltermin im <strong>Kalender</strong> statt jede Woche den Stundenplan zu füllen.
      </div>
      <button class="btn btn-soft btn-sm" data-nav="calendar">Im Kalender ansehen →</button>
    </div>
  `;
}

function renderWeekGridTimetable(items, daysCount, todayMonIdx) {
  const hours = Array.from({ length: 12 }, (_, i) => i + 8); // 08:00..19:00

  return `
    <div class="week-grid-wrap">
      <div class="week-grid ${daysCount === 6 ? 'has-sat' : ''}">
        <div class="week-corner">Zeit</div>
        ${Array.from({ length: daysCount }, (_, dayIdx) => {
          return `<div class="week-day-head ${dayIdx === todayMonIdx ? 'is-today' : ''}">
            ${WEEKDAYS_FULL[dayIdx]}
          </div>`;
        }).join('')}

        <div class="week-time-col" style="height:680px;">
          ${hours
            .map((h) => {
              const top = (h - 8) * 60;
              const style = h === 8 ? 'top:10px; transform:none;' : `top:${top}px`;
              return `<div class="week-hour-label" style="${style}">${String(h).padStart(2, '0')}:00</div>`;
            })
            .join('')}
        </div>

        ${Array.from({ length: daysCount }, (_, dayIdx) => {
          const dayItems = items
            .filter((it) => Number(it.day) === dayIdx)
            .sort((a, b) => a.start.localeCompare(b.start));

          return `<div class="week-day-col ${dayIdx === todayMonIdx ? 'is-today' : ''}" style="height:680px;">
            ${dayItems
              .map((it) => {
                const startM = Math.max(8 * 60, timeToMinutes(it.start));
                const endM = Math.min(19 * 60 + 20, Math.max(startM + 42, timeToMinutes(it.end)));
                const top = startM - 8 * 60;
                const height = Math.max(42, endM - startM - 2);
                const c = COURSE_COLORS[it.color] || COURSE_COLORS.sage;
                const isCompactBlock = height < 56;
                const displayTitle = isCompactBlock || window.innerWidth < 1120 ? (it.short || it.title) : it.title;
                const timeLine = isCompactBlock ? `${esc(it.start)} · ${esc(it.type)}` : `${esc(it.start)}–${esc(it.end)} · ${esc(it.type)}`;
                return `
                  <button
                    class="course-block"
                    style="top:${top}px; height:${height}px; --block-color:${c.hex}; --block-bg:${c.bg};"
                    data-action="open-modal"
                    data-modal="course"
                    data-id="${esc(it.id)}"
                    title="${esc(it.title)} (${esc(it.start)}–${esc(it.end)})"
                  >
                    <div class="course-block-time" style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${timeLine}</div>
                    <div class="course-block-title">${esc(displayTitle)}</div>
                    ${height >= 64 ? `<div class="course-block-meta">${esc(it.room || '')}${it.lecturer && window.innerWidth >= 1120 ? ` · ${esc(it.lecturer)}` : ''}</div>` : ''}
                  </button>`;
              })
              .join('')}
          </div>`;
        }).join('')}
      </div>
    </div>
  `;
}

function renderAgendaTimetable(items, daysCount, selectedDay, todayMonIdx) {
  const dayItems = items
    .filter((it) => Number(it.day) === selectedDay)
    .sort((a, b) => a.start.localeCompare(b.start));

  return `
    <div class="day-pills ${daysCount === 6 ? 'has-sat' : ''}" role="tablist" aria-label="Wochentag wählen">
      ${Array.from({ length: daysCount }, (_, d) => {
        const count = items.filter((it) => Number(it.day) === d).length;
        return `
          <button
            class="day-pill ${d === selectedDay ? 'active' : ''}"
            data-action="select-timetable-day"
            data-day="${d}"
          >
            <span>${WEEKDAYS_SHORT[d]}${d === todayMonIdx ? ' •' : ''}</span>
            <span class="day-pill-count">${count}</span>
          </button>`;
      }).join('')}
    </div>

    ${
      dayItems.length === 0
        ? `<div class="card empty-state">
            <strong>Freier ${WEEKDAYS_FULL[selectedDay]}</strong>
            Keine Veranstaltungen eingetragen.
          </div>`
        : dayItems
            .map((it) => {
              const c = COURSE_COLORS[it.color] || COURSE_COLORS.sage;
              return `
                <article class="agenda-card">
                  <div class="timeline-bar" style="background:${c.hex}"></div>
                  <div class="timeline-time" style="width:62px;">
                    <strong>${esc(it.start)}</strong>
                    <span>${esc(it.end)}</span>
                  </div>
                  <div class="timeline-body">
                    <div class="flex-between">
                      <div class="timeline-title">
                        <span>${esc(it.title)}</span>
                        <span class="badge ${c.badge}">${esc(it.type)}</span>
                      </div>
                      <button class="icon-btn" data-action="open-modal" data-modal="course" data-id="${esc(it.id)}" aria-label="Kurs bearbeiten">
                        ${ICONS.edit}
                      </button>
                    </div>
                    <div class="timeline-meta">
                      ${it.room ? `<span>${ICONS.pin} ${esc(it.room)}</span>` : ''}
                      ${it.lecturer ? `<span>${ICONS.user} ${esc(it.lecturer)}</span>` : ''}
                      ${it.ects ? `<span class="mono">${it.ects} ECTS</span>` : ''}
                    </div>
                  </div>
                </article>`;
            })
            .join('')
    }
  `;
}
