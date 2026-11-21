import { ICONS } from '../components/icons.js';
import {
  COURSE_COLORS,
  MONTHS_DE,
  WEEKDAYS_FULL,
  daysBetween,
  formatShortDateDE,
  getISOWeek,
  getMondayIndex,
  isoDate,
} from '../data/defaults.js';
import {
  computeExamReadiness,
  computeGpaStats,
  formatGradeDE,
  getAllCalendarEvents,
  getTodayStudyMinutes,
  getUnifiedExams,
  timeToMinutes,
} from '../state/store.js';
import { esc } from '../utils/html.js';

export function renderTodayView(state) {
  const now = new Date();
  const todayIso = isoDate(now);
  const monIdx = getMondayIndex(now);
  const kw = getISOWeek(now);
  const kwParity = kw % 2 === 0 ? 'even' : 'odd';
  const nowMins = now.getHours() * 60 + now.getMinutes();

  const dateHeading = `${WEEKDAYS_FULL[monIdx]}, ${now.getDate()}. ${MONTHS_DE[now.getMonth()]}`;

  // Today's timetable entries matching current KW parity
  const todayCourses = (state.timetable || [])
    .filter(
      (c) =>
        Number(c.day) === monIdx &&
        (c.weekParity === 'all' || c.weekParity === kwParity)
    )
    .map((c) => ({
      id: c.id,
      kind: 'course',
      title: c.title,
      badge: c.type,
      start: c.start,
      end: c.end,
      location: c.room,
      sub: c.lecturer,
      colorHex: (COURSE_COLORS[c.color] || COURSE_COLORS.sage).hex,
      badgeClass: (COURSE_COLORS[c.color] || COURSE_COLORS.sage).badge,
    }));

  // Today's calendar & Google events
  const todayCalEvents = getAllCalendarEvents(state)
    .filter((ev) => ev.date === todayIso && ev.source !== 'task')
    .map((ev) => ({
      id: ev.id,
      kind: ev.source,
      title: ev.title,
      badge: ev.calendarName || 'Termin',
      start: ev.start || '09:00',
      end: ev.end || '',
      location: ev.location,
      sub: ev.notes,
      colorHex:
        ev.color === 'google'
          ? 'var(--accent-google)'
          : (COURSE_COLORS[ev.color] || COURSE_COLORS.sage).hex,
      badgeClass:
        ev.color === 'google'
          ? 'badge-google'
          : (COURSE_COLORS[ev.color] || COURSE_COLORS.sage).badge,
    }));

  const timeline = [...todayCourses, ...todayCalEvents].sort((a, b) =>
    (a.start || '99:99').localeCompare(b.start || '99:99')
  );

  // Upcoming open tasks sorted by due date
  const openTasks = (state.tasks || [])
    .filter((t) => !t.done || t.recurrence !== 'once')
    .sort((a, b) => {
      const da = `${a.due || '9999'} ${a.dueTime || '23:59'}`;
      const db = `${b.due || '9999'} ${b.dueTime || '23:59'}`;
      return da.localeCompare(db);
    });

  // Determine current or next-up block
  const activeOrNext = timeline.find((item) => {
    if (!item.start || item.start === 'Ganztägig') return false;
    const endM = item.end ? timeToMinutes(item.end) : timeToMinutes(item.start) + 60;
    return endM > nowMins;
  });

  const nextTask = openTasks[0];
  const nextTaskDays = nextTask?.due ? daysBetween(nextTask.due, now) : null;

  let heroEyebrow = `KW ${kw} · ${state.profile.semester}`;
  let heroTitle = 'Vorlesungsfreier Tag — Zeit für Abgaben & Karteikarten';
  let heroMeta = nextTask
    ? `<span>Nächste Abgabe: <strong>${esc(nextTask.title)}</strong> (${nextTaskDays === 0 ? 'Heute' : nextTaskDays === 1 ? 'Morgen' : formatShortDateDE(nextTask.due)}${nextTask.dueTime ? ` · ${nextTask.dueTime === '23:59' ? '24:00' : nextTask.dueTime}` : ''})</span>`
    : `<span>${todayCourses.length} Vorlesungen · ${todayCalEvents.length} Termine heute</span>`;
  let heroSubject = state.timetable[0]?.short || 'GET I';

  if (activeOrNext) {
    const startM = timeToMinutes(activeOrNext.start);
    const diff = startM - nowMins;
    heroSubject = activeOrNext.title;
    if (diff <= 0) {
      heroEyebrow = `LÄUFT GERADE · BIS ${activeOrNext.end || ''}`;
    } else if (diff < 60) {
      heroEyebrow = `ALS NÄCHSTES · IN ${diff} MIN`;
    } else {
      const h = Math.floor(diff / 60);
      const m = diff % 60;
      heroEyebrow = `ALS NÄCHSTES · IN ${h} Std.${m ? ` ${m} Min` : ''}`;
    }
    heroTitle = activeOrNext.title;
    heroMeta = `
      <span class="mono">${esc(activeOrNext.start)}${activeOrNext.end ? `–${esc(activeOrNext.end)}` : ''}</span>
      ${activeOrNext.location ? `<span>${ICONS.pin} ${esc(activeOrNext.location)}</span>` : ''}
      ${activeOrNext.badge ? `<span>· ${esc(activeOrNext.badge)}</span>` : ''}
    `;
  }

  // Upcoming exams (Google Calendar auto-detected + manual!)
  const upcomingExams = getUnifiedExams(state).filter((ex) => !ex.completed);
  const nextExam = upcomingExams[0];
  const nextExamDays = nextExam ? daysBetween(nextExam.date, now) : null;

  const gpaStats = computeGpaStats(state.grades || [], state.profile.targetEcts);
  const studyMinsToday = getTodayStudyMinutes(state);
  const activeEcts = (state.timetable || []).reduce((s, c) => s + Number(c.ects || 0), 0);
  const masteredCards = (state.flashcards || []).filter((f) => f.box >= 3).length;

  return `
    <header class="page-header">
      <div>
        <div class="page-eyebrow">${esc(dateHeading)} · KW ${kw} · ${esc(state.profile.university || 'HSD')}</div>
        <h1 class="page-title">Guten Studientag</h1>
      </div>
      <div class="page-actions">
        <button class="btn btn-secondary" data-action="open-modal" data-modal="task">
          ${ICONS.plus} Abgabe
        </button>
        <button class="btn btn-primary" data-action="start-focus-quick" data-subject="${esc(heroSubject)}">
          ${ICONS.play} Fokus starten
        </button>
      </div>
    </header>

    <section class="today-hero" aria-label="Nächster Termin">
      <div>
        <div class="today-hero-eyebrow">${esc(heroEyebrow)}</div>
        <div class="today-hero-title">${esc(heroTitle)}</div>
        <div class="today-hero-meta">${heroMeta}</div>
      </div>
      <div class="today-hero-actions">
        <button class="btn-hero" data-nav="timetable">${ICONS.timetable} Stundenplan</button>
        <button class="btn-hero" data-nav="toolkit" data-sub="modules">Module & Notebooks</button>
      </div>
    </section>

    <section class="stats-strip" aria-label="Studien-Kennzahlen">
      <div class="stat-tile">
        <div class="stat-label">Nächste Abgabe</div>
        <div class="stat-value">${nextTask ? (nextTaskDays <= 0 ? 'Heute' : nextTaskDays === 1 ? 'Morgen' : `${nextTaskDays} Tage`) : '–'}</div>
        <div class="stat-sub">${nextTask ? `${esc(nextTask.course)} · ${nextTask.dueTime === '23:59' ? '24:00' : esc(nextTask.dueTime || '')}` : 'Alles erledigt'}</div>
      </div>
      <div class="stat-tile">
        <div class="stat-label">Nächste Klausur</div>
        <div class="stat-value">${nextExam ? (nextExamDays <= 0 ? 'Heute' : `${nextExamDays} Tage`) : '–'}</div>
        <div class="stat-sub">${nextExam ? esc(nextExam.title) : 'Aus Google Kalender'}</div>
      </div>
      <div class="stat-tile">
        <div class="stat-label">Heute gelernt</div>
        <div class="stat-value">${studyMinsToday} Min</div>
        <div class="stat-sub">${masteredCards}/${(state.flashcards || []).length} Karten sicher</div>
      </div>
      <div class="stat-tile">
        <div class="stat-label">${gpaStats.gpa ? 'Notenschnitt' : '1. Semester'}</div>
        <div class="stat-value">${gpaStats.gpa ? formatGradeDE(gpaStats.gpa) : `${activeEcts} ECTS`}</div>
        <div class="stat-sub">${gpaStats.gpa ? `${gpaStats.totalEcts} / ${state.profile.targetEcts} ECTS` : `6 Module · Ziel ${state.profile.targetEcts} ECTS`}</div>
      </div>
    </section>

    <div class="today-grid">
      <div class="today-col">
        <section class="card">
          <div class="section-head">
            <h2 class="section-title">Anstehende Abgaben & Pflichtaufgaben</h2>
            <button class="section-link" data-nav="toolkit" data-sub="tasks">Alle verwalten →</button>
          </div>
          ${
            openTasks.length === 0
              ? `<div class="empty-state"><strong>Keine offenen Abgaben</strong>Alles erledigt!</div>`
              : `<div class="task-list">
                  ${openTasks.slice(0, 5).map((tk) => renderTaskRow(tk, now)).join('')}
                </div>`
          }
        </section>

        <section class="card">
          <div class="section-head">
            <h2 class="section-title">Dein Ablauf heute</h2>
            <button class="section-link" data-nav="timetable">Wochenplan →</button>
          </div>
          ${
            timeline.length === 0
              ? `<div class="empty-state">
                  <strong>Heute stehen keine Vorlesungen an.</strong>
                  Perfekt für Mathe-Arbeitsblatt, Informationstechnik-Abgabe oder eine Runde Karteikarten.
                </div>`
              : `<div class="timeline-list">
                  ${timeline
                    .map(
                      (item) => `
                    <div class="timeline-item">
                      <div class="timeline-bar" style="background:${item.colorHex}"></div>
                      <div class="timeline-time">
                        <strong>${esc(item.start)}</strong>
                        <span>${esc(item.end)}</span>
                      </div>
                      <div class="timeline-body">
                        <div class="timeline-title">
                          <span>${esc(item.title)}</span>
                          <span class="badge ${item.badgeClass}">${esc(item.badge)}</span>
                        </div>
                        <div class="timeline-meta">
                          ${item.location ? `<span>${esc(item.location)}</span>` : ''}
                          ${item.sub ? `<span>· ${esc(item.sub)}</span>` : ''}
                        </div>
                      </div>
                    </div>`
                    )
                    .join('')}
                </div>`
          }
        </section>
      </div>

      <div class="today-col">
        <section class="card">
          <div class="section-head">
            <h2 class="section-title">Klausuren aus Google Kalender</h2>
            <button class="section-link" data-nav="exams">Lernplan (${upcomingExams.length}) →</button>
          </div>
          ${
            upcomingExams.length === 0
              ? `<div class="empty-state"><strong>Keine Klausuren erkannt</strong>Verbinde deinen Google Kalender — Termine mit „Klausur“ oder „Prüfung“ erscheinen hier automatisch.</div>`
              : `<div class="timeline-list">
                  ${upcomingExams
                    .slice(0, 3)
                    .map((ex) => {
                      const dLeft = daysBetween(ex.date, now);
                      const ready = computeExamReadiness(ex);
                      const fillClass = ready.pct >= 70 ? '' : ready.pct >= 35 ? 'warn' : 'danger';
                      return `
                        <div class="timeline-item" style="flex-direction:column; gap:8px; cursor:pointer;" data-nav="exams">
                          <div class="flex-between">
                            <div>
                              <div class="fw-700" style="font-size:0.93rem;">${esc(ex.title)}</div>
                              <div class="text-xs text-muted">
                                ${formatShortDateDE(ex.date)} · ${esc(ex.time)} · ${ex.ects} ECTS
                                ${ex.fromGoogle ? ' · Google Kalender' : ''}
                              </div>
                            </div>
                            <span class="badge ${dLeft <= 14 ? 'badge-terracotta' : 'badge-sage'} mono">
                              ${dLeft <= 0 ? 'Heute' : `in ${dLeft} T.`}
                            </span>
                          </div>
                          <div>
                            <div class="flex-between text-xs text-muted" style="margin-bottom:4px;">
                              <span>Lernplan (${ready.done}/${ready.total} Themen)</span>
                              <span class="mono fw-600">${ready.pct}%</span>
                            </div>
                            <div class="progress-track">
                              <div class="progress-fill ${fillClass}" style="width:${ready.pct}%"></div>
                            </div>
                          </div>
                        </div>`;
                    })
                    .join('')}
                </div>`
          }
        </section>

        <section class="card">
          <div class="section-head">
            <h2 class="section-title">HSD Campus Schnellzugriff</h2>
            <button class="section-link" data-nav="toolkit" data-sub="grades">Alle Links →</button>
          </div>
          <div class="quicklinks-grid">
            ${(state.quickLinks || [])
              .slice(0, 4)
              .map(
                (ql) => `
              <a class="quicklink-tile" href="${esc(ql.url)}" target="_blank" rel="noopener noreferrer">
                <div>
                  <div>${esc(ql.label)}</div>
                  <div class="text-xs text-muted" style="font-weight:400;">${esc(ql.sub || '')}</div>
                </div>
                ${ICONS.external}
              </a>`
              )
              .join('')}
          </div>
        </section>
      </div>
    </div>
  `;
}

export function renderTaskRow(tk, now = new Date()) {
  const isRecurring = tk.recurrence === 'weekly' || tk.recurrence === 'biweekly';
  const diff = tk.due ? daysBetween(tk.due, now) : null;
  const timeTxt = tk.dueTime ? (tk.dueTime === '23:59' ? '24:00' : tk.dueTime) : '';
  let dueLabel = tk.due ? `${formatShortDateDE(tk.due)}${timeTxt ? ` · ${timeTxt}` : ''}` : 'Ohne Datum';
  let dueClass = 'badge-neutral';
  if (diff !== null) {
    if (diff < 0) {
      dueLabel = `Überfällig (${formatShortDateDE(tk.due)})`;
      dueClass = 'badge-danger';
    } else if (diff === 0) {
      dueLabel = `Heute${timeTxt ? ` · ${timeTxt}` : ''}`;
      dueClass = 'badge-terracotta';
    } else if (diff === 1) {
      dueLabel = `Morgen${timeTxt ? ` · ${timeTxt}` : ''}`;
      dueClass = 'badge-ochre';
    } else if (diff <= 3) {
      dueClass = 'badge-ochre';
    }
  }

  return `
    <div class="task-row ${!isRecurring && tk.done ? 'done' : ''}">
      <button
        class="check-circle ${!isRecurring && tk.done ? 'checked' : ''}"
        data-action="${isRecurring ? 'complete-recurring-task' : 'toggle-task'}"
        data-id="${esc(tk.id)}"
        title="${isRecurring ? 'Für diesen Zyklus abhaken & nächsten Termin planen' : 'Erledigen'}"
        aria-label="${isRecurring ? 'Abgabe für diese Woche abhaken' : 'Aufgabe erledigen'}"
      >
        ${!isRecurring && tk.done ? ICONS.check : ''}
      </button>
      <div class="task-body">
        <div class="task-title">${esc(tk.title)}</div>
        <div class="task-meta">
          ${tk.course ? `<span class="badge badge-sage">${esc(tk.course)}</span>` : ''}
          <span class="badge ${dueClass} mono">${esc(dueLabel)}</span>
          ${
            isRecurring
              ? `<span class="badge badge-slate">${tk.recurrence === 'biweekly' ? 'Alle 2 Wo.' : 'Wöchentlich'}${tk.streak > 0 ? ` · ${tk.streak}× erledigt` : ''}</span>`
              : ''
          }
        </div>
      </div>
      <button class="icon-btn" data-action="delete-task" data-id="${esc(tk.id)}" aria-label="Aufgabe löschen">
        ${ICONS.trash}
      </button>
    </div>
  `;
}
