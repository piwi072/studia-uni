import './styles/index.css';
import { ICONS } from './components/icons.js';
import { renderModal } from './components/modals.js';
import {
  addDaysToISO,
  formatShortDateDE,
  isoDate,
  parseISODate,
  uid,
} from './data/defaults.js';
import { focusTimer, formatMMSS } from './services/focusTimer.js';
import {
  connectGoogleAccount,
  disconnectGoogleAccount,
  handleGoogleRedirectCallback,
  pushEventToGoogle,
  startGoogleRedirectLogin,
  syncGoogleCalendars,
} from './services/googleCalendar.js';
import {
  exportExamsToICS,
  exportSingleEventToICS,
  exportTimetableToICS,
  inferTimetableEntriesFromICS,
  parseICS,
} from './services/ics.js';
import {
  addMinutesToTime,
  getUnifiedExams,
  isGoogleEventExam,
  store,
} from './state/store.js';
import { esc, vibrate } from './utils/html.js';
import { renderCalendarView } from './views/calendarView.js';
import { renderExamsView } from './views/examsView.js';
import { renderTimetableView } from './views/timetableView.js';
import { renderTodayView } from './views/todayView.js';
import { renderToolkitView } from './views/toolkitView.js';

const params = new URLSearchParams(window.location.search);
const initialTab = ['today', 'timetable', 'calendar', 'exams', 'toolkit'].includes(
  params.get('tab')
)
  ? params.get('tab')
  : 'today';

const ui = {
  tab: initialTab,
  toolkitSub: ['modules', 'tasks', 'focus', 'grades'].includes(params.get('sub'))
    ? params.get('sub')
    : 'modules',
  selectedModuleId: 'mod_get',
  weekParityFilter: 'all',
  timetableLayout: null,
  selectedTimetableDay: null,
  selectedCalendarDate: isoDate(),
  calYear: new Date().getFullYear(),
  calMonth: new Date().getMonth(),
  calFilter: 'all',
  examFilter: 'upcoming',
  cardIndex: 0,
  cardFlipped: false,
  googleError: '',
  calc: {
    prefixVal: '470',
    prefixUnit: 'n',
    ohmU: '12',
    ohmI: '',
    ohmR: '220',
    ohmP: '',
    r1: '1000',
    r2: '2200',
    uIn: '5',
    cplxRe: '3',
    cplxIm: '4',
    numDec: '181',
    byteVal: '1024',
    bwlP: '49',
    bwlKv: '21',
    bwlKf: '14000',
  },
  modal: null,
  installPromptEvent: null,
  installBannerDismissed: false,
};

const appRoot = document.getElementById('app');

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  const metaTheme = document.getElementById('meta-theme-color');
  if (metaTheme) {
    metaTheme.setAttribute('content', theme === 'dark' ? '#101412' : '#F6F4EF');
  }
}

function showToast(message) {
  let region = document.querySelector('.toast-region');
  if (!region) {
    region = document.createElement('div');
    region.className = 'toast-region';
    document.body.appendChild(region);
  }
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = message;
  region.appendChild(el);
  setTimeout(() => {
    el.style.opacity = '0';
    el.style.transition = 'opacity 0.25s';
    setTimeout(() => el.remove(), 260);
  }, 3600);
}

function pickFile(accept, onLoad) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = accept;
  input.onchange = () => {
    const file = input.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => onLoad(String(reader.result || ''), file.name);
    reader.readAsText(file, 'utf-8');
  };
  input.click();
}

/** Smart parser: converts pasted NotebookLM study guides / Q&A into Flashcards */
function parseBulkFlashcards(rawText, courseKey) {
  const cards = [];
  const seen = new Set();
  const addCard = (front, back) => {
    const f = front.replace(/^[-•*]\s*/, '').trim();
    const b = back.trim();
    const key = `${f}|||${b}`;
    if (f && b && !seen.has(key)) {
      seen.add(key);
      cards.push({ id: uid('fc'), course: courseKey, front: f, back: b, box: 1 });
    }
  };

  const text = String(rawText || '').trim();
  if (!text) return cards;

  // Format 1: Markdown table rows | Question | Answer |
  const tableLines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.startsWith('|') && l.endsWith('|') && !/^\|[\s-:|]+\|$/.test(l));
  for (let i = 0; i < tableLines.length; i++) {
    const cols = tableLines[i]
      .slice(1, -1)
      .split('|')
      .map((c) => c.trim());
    if (cols.length >= 2 && !(i === 0 && /^(frage|begriff|question|term)$/i.test(cols[0]))) {
      addCard(cols[0], cols[1]);
    }
  }

  // Format 2: Q/F & A blocks ("F: ... A: ..." or "Frage: ... Antwort: ...")
  const qaRegex =
    /(?:^|\n)\s*(?:F|Frage|Q|Question)\s*:\s*([\s\S]*?)\n\s*(?:A|Antwort|Answer)\s*:\s*([\s\S]*?)(?=\n\s*(?:F|Frage|Q|Question)\s*:|$)/gi;
  let match;
  while ((match = qaRegex.exec(text)) !== null) {
    addCard(match[1], match[2]);
  }

  // Format 3: Line-by-line "Front :: Back" or "Front — Back"
  for (const line of text.split(/\r?\n/)) {
    const sep = line.includes('::') ? '::' : line.includes(' — ') ? ' — ' : null;
    if (!sep) continue;
    const [front, ...rest] = line.split(sep);
    addCard(front, rest.join(sep));
  }

  return cards;
}

function mutateExamById(examId, fn) {
  store.update((s) => {
    if (examId.startsWith('gex_')) {
      const gKey = examId.slice(4);
      s.google.examMetaByGoogleId = s.google.examMetaByGoogleId || {};
      if (!s.google.examMetaByGoogleId[gKey]) {
        s.google.examMetaByGoogleId[gKey] = {
          ects: 5,
          attempt: 1,
          aids: '',
          color: 'sage',
          completed: false,
          grade: null,
          topics: [],
        };
      }
      fn(s.google.examMetaByGoogleId[gKey], true, gKey);
    } else {
      const ex = s.exams.find((x) => x.id === examId);
      if (ex) fn(ex, false, null);
    }
  });
}

let lastRenderedRoute = '';

function render(preserveFocusId = null) {
  const activeEl = preserveFocusId ? document.getElementById(preserveFocusId) : null;
  const caretPos = activeEl && 'selectionStart' in activeEl ? activeEl.selectionStart : null;

  const state = store.state;
  applyTheme(state.theme);

  const routeKey = `${ui.tab}:${ui.tab === 'toolkit' ? ui.toolkitSub : ''}`;
  const shouldAnimate = routeKey !== lastRenderedRoute;
  lastRenderedRoute = routeKey;

  const openTasksCount = (state.tasks || []).filter(
    (t) => !t.done || t.recurrence === 'weekly' || t.recurrence === 'biweekly'
  ).length;
  const upcomingExamsCount = getUnifiedExams(state).filter((e) => !e.completed).length;
  const timerSnap = focusTimer.getSnapshot();

  let mainContent = '';
  if (ui.tab === 'today') mainContent = renderTodayView(state);
  else if (ui.tab === 'timetable') mainContent = renderTimetableView(state, ui);
  else if (ui.tab === 'calendar') mainContent = renderCalendarView(state, ui);
  else if (ui.tab === 'exams') mainContent = renderExamsView(state, ui);
  else mainContent = renderToolkitView(state, ui);

  const installBannerHtml =
    ui.installPromptEvent && !ui.installBannerDismissed
      ? `
      <div class="install-banner">
        <div class="install-banner-left">
          <div class="brand-mark" style="width:34px;height:34px;">
            <img src="./icons/icon-192.png" alt="Studia" />
          </div>
          <div>
            <div class="install-banner-title">Studia als App installieren</div>
            <div class="install-banner-sub">Vollbild, Offline-Stundenplan & Schnellzugriff auf dem Homescreen</div>
          </div>
        </div>
        <div class="flex-row">
          <button class="btn btn-primary btn-sm" data-action="trigger-install">Installieren</button>
          <button class="icon-btn" data-action="dismiss-install" aria-label="Später">${ICONS.close}</button>
        </div>
      </div>`
      : '';

  appRoot.innerHTML = `
    <div class="app-shell">
      <aside class="sidebar-rail" aria-label="Hauptnavigation">
        <div class="brand-header">
          <div class="brand-mark">
            <img src="./icons/icon-192.png" alt="Studia App-Icon" />
          </div>
          <div>
            <div class="brand-title">Studia</div>
            <div class="brand-sub">${esc(state.profile.shortDegree || state.profile.degree)}</div>
          </div>
        </div>

        <nav class="rail-nav">
          <button class="rail-nav-btn ${ui.tab === 'today' ? 'active' : ''}" data-nav="today">
            ${ICONS.today} <span>Heute</span>
          </button>
          <button class="rail-nav-btn ${ui.tab === 'timetable' ? 'active' : ''}" data-nav="timetable">
            ${ICONS.timetable} <span>Stundenplan</span>
          </button>
          <button class="rail-nav-btn ${ui.tab === 'calendar' ? 'active' : ''}" data-nav="calendar">
            ${ICONS.calendar} <span>Kalender</span>
          </button>
          <button class="rail-nav-btn ${ui.tab === 'exams' ? 'active' : ''}" data-nav="exams">
            ${ICONS.exams} <span>Klausuren</span>
            ${upcomingExamsCount > 0 ? `<span class="nav-badge">${upcomingExamsCount}</span>` : ''}
          </button>
          <button class="rail-nav-btn ${ui.tab === 'toolkit' ? 'active' : ''}" data-nav="toolkit">
            ${ICONS.toolkit} <span>Studium</span>
            ${openTasksCount > 0 ? `<span class="nav-badge">${openTasksCount}</span>` : ''}
          </button>
        </nav>

        <div class="rail-footer">
          <button class="mini-timer-pill ${timerSnap.running ? 'running' : ''}" data-nav="toolkit" data-sub="focus">
            <span class="flex-row" style="gap:7px;">
              ${ICONS.clock}
              <span>${timerSnap.running ? esc(timerSnap.subject) : 'Bib-Fokus'}</span>
            </span>
            <strong id="rail-timer-text" class="mono">${formatMMSS(timerSnap.remainingSeconds)}</strong>
          </button>

          <button class="sync-status-btn" data-action="open-modal" data-modal="settings">
            <span class="sync-dot ${state.google.connected ? 'connected' : 'demo'}"></span>
            <span style="flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
              ${state.google.connected ? 'Google Kalender aktiv' : 'Google verknüpfen'}
            </span>
          </button>

          <div class="rail-utility-row">
            <button class="icon-btn surface" data-action="toggle-theme" aria-label="Farbschema wechseln" title="Hell / Dunkel">
              ${state.theme === 'dark' ? ICONS.sun : ICONS.moon}
            </button>
            <button class="icon-btn surface" style="flex:1; gap:7px; font-size:0.82rem; font-weight:600;" data-action="open-modal" data-modal="settings">
              ${ICONS.settings} <span>Einstellungen</span>
            </button>
          </div>
        </div>
      </aside>

      <header class="mobile-topbar">
        <div class="mobile-topbar-left">
          <div class="brand-mark" style="width:30px;height:30px;border-radius:8px;">
            <img src="./icons/icon-192.png" alt="Studia" />
          </div>
          <div>
            <div class="brand-title" style="font-size:1rem;">Studia</div>
            <div class="text-xs text-muted" style="line-height:1.1;">${esc(state.profile.shortDegree || state.profile.semester)}</div>
          </div>
        </div>
        <div class="mobile-topbar-right">
          ${
            timerSnap.running
              ? `<button class="btn btn-soft btn-sm mono" data-nav="toolkit" data-sub="focus" id="mobile-timer-pill">${formatMMSS(timerSnap.remainingSeconds)}</button>`
              : ''
          }
          <button class="icon-btn" data-action="toggle-theme" aria-label="Design wechseln">
            ${state.theme === 'dark' ? ICONS.sun : ICONS.moon}
          </button>
          <button class="icon-btn" data-action="open-modal" data-modal="settings" aria-label="Einstellungen & Google-Konto">
            ${ICONS.settings}
          </button>
        </div>
      </header>

      <main class="main-workspace">
        <div class="view-container ${shouldAnimate ? 'view-animate' : ''}">
          ${installBannerHtml}
          ${mainContent}
        </div>
      </main>

      <nav class="mobile-bottom-nav" aria-label="Mobile Navigation">
        <button class="m-nav-btn ${ui.tab === 'today' ? 'active' : ''}" data-nav="today">
          <span class="m-nav-pill">${ICONS.today}</span>
          <span>Heute</span>
        </button>
        <button class="m-nav-btn ${ui.tab === 'timetable' ? 'active' : ''}" data-nav="timetable">
          <span class="m-nav-pill">${ICONS.timetable}</span>
          <span>Plan</span>
        </button>
        <button class="m-nav-btn ${ui.tab === 'calendar' ? 'active' : ''}" data-nav="calendar">
          <span class="m-nav-pill">${ICONS.calendar}</span>
          <span>Kalender</span>
        </button>
        <button class="m-nav-btn ${ui.tab === 'exams' ? 'active' : ''}" data-nav="exams">
          <span class="m-nav-pill">${ICONS.exams}</span>
          <span>Klausuren</span>
        </button>
        <button class="m-nav-btn ${ui.tab === 'toolkit' ? 'active' : ''}" data-nav="toolkit">
          <span class="m-nav-pill">${ICONS.toolkit}</span>
          <span>Studium</span>
        </button>
      </nav>
    </div>

    ${renderModal(state, ui.modal, ui)}
  `;

  if (preserveFocusId) {
    const nextEl = document.getElementById(preserveFocusId);
    if (nextEl) {
      nextEl.focus();
      if (caretPos !== null && nextEl.setSelectionRange && nextEl.type !== 'number') {
        try {
          nextEl.setSelectionRange(caretPos, caretPos);
        } catch {
          // Ignore
        }
      }
    }
  }
}

focusTimer.subscribe((snap) => {
  const timeEl = document.getElementById('focus-time-readout');
  const ringEl = document.getElementById('focus-ring-circle');
  const railEl = document.getElementById('rail-timer-text');
  const mobEl = document.getElementById('mobile-timer-pill');
  const formatted = formatMMSS(snap.remainingSeconds);

  if (railEl) railEl.textContent = formatted;
  if (mobEl) mobEl.textContent = formatted;
  if (timeEl) timeEl.textContent = formatted;
  if (ringEl) {
    const circ = 2 * Math.PI * 104;
    ringEl.setAttribute('stroke-dashoffset', String(circ * (1 - snap.progress)));
  }
});

focusTimer.onCompleteCallback = (msg) => {
  vibrate([60, 40, 60]);
  showToast(msg);
  render();
};

appRoot.addEventListener('click', async (e) => {
  const navBtn = e.target.closest('[data-nav]');
  if (navBtn) {
    vibrate(8);
    ui.tab = navBtn.dataset.nav;
    if (navBtn.dataset.sub) ui.toolkitSub = navBtn.dataset.sub;
    window.scrollTo({ top: 0, behavior: 'smooth' });
    render();
    return;
  }

  const actionEl = e.target.closest('[data-action]');
  if (!actionEl) return;
  const action = actionEl.dataset.action;

  if (action === 'backdrop-close') {
    if (e.target === actionEl) {
      ui.modal = null;
      render();
    }
    return;
  }
  if (action === 'close-modal') {
    ui.modal = null;
    render();
    return;
  }
  if (action === 'open-modal') {
    vibrate(8);
    ui.modal = {
      type: actionEl.dataset.modal,
      id: actionEl.dataset.id || null,
      date: actionEl.dataset.date || null,
    };
    render();
    return;
  }
  if (action === 'pick-swatch') {
    const row = actionEl.closest('.color-picker-row');
    row?.querySelectorAll('.color-swatch').forEach((s) => s.classList.remove('selected'));
    actionEl.classList.add('selected');
    return;
  }
  if (action === 'toggle-theme') {
    vibrate(8);
    store.update((s) => {
      s.theme = s.theme === 'dark' ? 'light' : 'dark';
    });
    return;
  }

  /* Module selector & module file import */
  if (action === 'select-module') {
    vibrate(6);
    ui.selectedModuleId = actionEl.dataset.id;
    ui.cardIndex = 0;
    ui.cardFlipped = false;
    render();
    return;
  }
  if (action === 'import-module-file') {
    const modId = actionEl.dataset.id;
    pickFile('.md,.txt,text/markdown,text/plain', (text, filename) => {
      const clean = text.trim();
      if (!clean) return;
      store.update((s) => {
        const mod = (s.modules || []).find((m) => m.id === modId);
        if (!mod) return;
        mod.notebookNotes = mod.notebookNotes || [];
        mod.notebookNotes.unshift({
          id: uid('nn'),
          title: filename.replace(/\.(md|txt)$/i, ''),
          content: clean.slice(0, 12000),
          updatedAt: isoDate(),
        });
      });
      showToast(`„${filename}“ im Modul gespeichert!`);
    });
    return;
  }
  if (action === 'delete-module-note') {
    const { modId, noteId } = actionEl.dataset;
    store.update((s) => {
      const mod = (s.modules || []).find((m) => m.id === modId);
      if (mod) mod.notebookNotes = (mod.notebookNotes || []).filter((n) => n.id !== noteId);
    });
    return;
  }

  /* PWA Install */
  if (action === 'trigger-install' && ui.installPromptEvent) {
    ui.installPromptEvent.prompt();
    const res = await ui.installPromptEvent.userChoice;
    ui.installPromptEvent = null;
    if (res?.outcome === 'accepted') showToast('Studia wird installiert!');
    render();
    return;
  }
  if (action === 'dismiss-install') {
    ui.installBannerDismissed = true;
    render();
    return;
  }

  /* Timetable actions */
  if (action === 'set-parity') {
    ui.weekParityFilter = actionEl.dataset.value;
    render();
    return;
  }
  if (action === 'select-timetable-day') {
    vibrate(6);
    ui.selectedTimetableDay = Number(actionEl.dataset.day);
    render();
    return;
  }
  if (action === 'toggle-timetable-layout') {
    const currentlyAgenda =
      ui.timetableLayout === 'agenda' || (!ui.timetableLayout && window.innerWidth < 720);
    ui.timetableLayout = currentlyAgenda ? 'grid' : 'agenda';
    render();
    return;
  }
  if (action === 'delete-course') {
    store.update((s) => {
      s.timetable = s.timetable.filter((c) => c.id !== actionEl.dataset.id);
    });
    ui.modal = null;
    showToast('Veranstaltung entfernt');
    render();
    return;
  }
  if (action === 'export-ics-timetable') {
    exportTimetableToICS(store.state.timetable);
    showToast('Stundenplan als .ics gespeichert!');
    return;
  }
  if (action === 'import-ics-timetable') {
    pickFile('.ics,text/calendar', (text) => {
      const entries = inferTimetableEntriesFromICS(parseICS(text));
      if (entries.length === 0) {
        showToast('Keine passenden Termine in der .ics-Datei gefunden.');
        return;
      }
      store.update((s) => {
        s.timetable.push(...entries);
      });
      showToast(`${entries.length} Veranstaltungen importiert!`);
    });
    return;
  }

  /* Calendar & Google Sync actions */
  if (action === 'set-cal-filter') {
    ui.calFilter = actionEl.dataset.value;
    render();
    return;
  }
  if (action === 'select-cal-date') {
    vibrate(6);
    ui.selectedCalendarDate = actionEl.dataset.date;
    const d = parseISODate(ui.selectedCalendarDate);
    ui.calYear = d.getFullYear();
    ui.calMonth = d.getMonth();
    render();
    return;
  }
  if (action === 'cal-prev-month') {
    const d = new Date(ui.calYear, ui.calMonth - 1, 1);
    ui.calYear = d.getFullYear();
    ui.calMonth = d.getMonth();
    render();
    return;
  }
  if (action === 'cal-next-month') {
    const d = new Date(ui.calYear, ui.calMonth + 1, 1);
    ui.calYear = d.getFullYear();
    ui.calMonth = d.getMonth();
    render();
    return;
  }
  if (action === 'cal-today') {
    const now = new Date();
    ui.selectedCalendarDate = isoDate(now);
    ui.calYear = now.getFullYear();
    ui.calMonth = now.getMonth();
    render();
    return;
  }
  if (action === 'delete-event') {
    store.update((s) => {
      s.calendarEvents = s.calendarEvents.filter((ev) => ev.id !== actionEl.dataset.id);
    });
    showToast('Termin gelöscht');
    return;
  }
  if (action === 'toggle-google-exam') {
    vibrate(10);
    const gKey = actionEl.dataset.gkey;
    const allEvs = store.state.google.connected
      ? store.state.googleEvents
      : store.state.calendarEvents;
    const ev = allEvs.find((x) => (x.googleEventId || x.id) === gKey);
    if (!ev) return;

    const currentlyExam = isGoogleEventExam(ev, store.state.google);
    store.update((s) => {
      s.google.promotedGoogleExamIds = (s.google.promotedGoogleExamIds || []).filter((k) => k !== gKey);
      s.google.hiddenGoogleExamIds = (s.google.hiddenGoogleExamIds || []).filter((k) => k !== gKey);
      if (currentlyExam) s.google.hiddenGoogleExamIds.push(gKey);
      else s.google.promotedGoogleExamIds.push(gKey);
    });
    showToast(currentlyExam ? 'Aus Klausuren ausgeblendet.' : 'In Klausuren-Lernplan übernommen!');
    return;
  }
  if (action === 'dismiss-google-exam') {
    const gKey = actionEl.dataset.gkey;
    store.update((s) => {
      s.google.promotedGoogleExamIds = (s.google.promotedGoogleExamIds || []).filter((k) => k !== gKey);
      if (!(s.google.hiddenGoogleExamIds || []).includes(gKey)) {
        s.google.hiddenGoogleExamIds.push(gKey);
      }
    });
    showToast('Aus Klausuren ausgeblendet (bleibt im Google Kalender).');
    return;
  }
  if (action === 'import-ics-calendar') {
    pickFile('.ics,text/calendar', (text) => {
      const parsed = parseICS(text);
      if (parsed.length === 0) {
        showToast('Keine Termine gefunden.');
        return;
      }
      store.update((s) => {
        for (const ev of parsed) {
          s.calendarEvents.push({
            id: uid('ev'),
            title: ev.title,
            date: ev.date,
            start: ev.start || '09:00',
            end: ev.end || '',
            location: ev.location || '',
            notes: ev.notes || '',
            source: 'local',
            calendarName: '.ics Import',
            color: 'slate',
          });
        }
      });
      showToast(`${parsed.length} Termine importiert!`);
    });
    return;
  }
  if (action === 'connect-google') {
    const input = document.getElementById('set-client-id');
    const roEl = document.getElementById('set-readonly-toggle');
    const clientId = input ? input.value.trim() : store.state.google.clientId;
    const readOnly = roEl ? roEl.checked : Boolean(store.state.google.readOnlyMode);
    ui.googleError = '';
    try {
      showToast('Google-Anmeldung öffnet sich…');
      await connectGoogleAccount(clientId, { readOnly });
      const detected = getUnifiedExams(store.state).filter((ex) => ex.fromGoogle).length;
      showToast(`Google Kalender verbunden! ${detected} Klausur(en) erkannt.`);
      render();
    } catch (err) {
      ui.googleError = err.message || 'Google Anmeldung fehlgeschlagen.';
      showToast(ui.googleError);
      render();
    }
    return;
  }
  if (action === 'connect-google-redirect') {
    const input = document.getElementById('set-client-id');
    const roEl = document.getElementById('set-readonly-toggle');
    const clientId = input ? input.value.trim() : store.state.google.clientId;
    const readOnly = roEl ? roEl.checked : Boolean(store.state.google.readOnlyMode);
    try {
      startGoogleRedirectLogin(clientId, { readOnly });
    } catch (err) {
      ui.googleError = err.message;
      render();
    }
    return;
  }
  if (action === 'sync-google-now') {
    try {
      const count = await syncGoogleCalendars();
      ui.googleError = '';
      showToast(`${count} Google-Termine synchronisiert.`);
    } catch (err) {
      ui.googleError = err.message;
      showToast(err.message);
      render();
    }
    return;
  }
  if (action === 'disconnect-google') {
    disconnectGoogleAccount();
    ui.googleError = '';
    showToast('Google-Konto getrennt.');
    return;
  }
  if (action === 'push-event-google') {
    const payload = {
      title: actionEl.dataset.title,
      date: actionEl.dataset.date,
      start: actionEl.dataset.start,
      end: actionEl.dataset.end,
      location: actionEl.dataset.location,
      notes: actionEl.dataset.notes,
    };
    if (store.state.google.connected) {
      try {
        await pushEventToGoogle(payload);
        showToast('Im Google Kalender gespeichert!');
      } catch (err) {
        showToast(err.message);
      }
    } else {
      exportSingleEventToICS(payload);
      showToast('Als .ics gespeichert.');
    }
    return;
  }

  /* Exams actions */
  if (action === 'set-exam-filter') {
    ui.examFilter = actionEl.dataset.value;
    render();
    return;
  }
  if (action === 'toggle-exam-topic') {
    vibrate(10);
    const { examId, topicId } = actionEl.dataset;
    mutateExamById(examId, (ex) => {
      const tp = (ex.topics || []).find((t) => t.id === topicId);
      if (tp) tp.done = !tp.done;
    });
    return;
  }
  if (action === 'delete-exam-topic') {
    const { examId, topicId } = actionEl.dataset;
    mutateExamById(examId, (ex) => {
      ex.topics = (ex.topics || []).filter((t) => t.id !== topicId);
    });
    return;
  }
  if (action === 'delete-exam') {
    store.update((s) => {
      s.exams = s.exams.filter((x) => x.id !== actionEl.dataset.id);
    });
    showToast('Klausur gelöscht');
    return;
  }
  if (action === 'export-ics-exams') {
    exportExamsToICS(getUnifiedExams(store.state));
    showToast('Klausuren als .ics exportiert!');
    return;
  }
  if (action === 'push-exam-google') {
    const ex = getUnifiedExams(store.state).find((x) => x.id === actionEl.dataset.id);
    if (!ex) return;
    const payload = {
      title: `Klausur: ${ex.title}`,
      date: ex.date,
      start: ex.time || '09:00',
      end: addMinutesToTime(ex.time || '09:00', ex.durationMin || 90),
      location: ex.room || '',
      notes: `${ex.ects} ECTS · ${ex.attempt}. Versuch${ex.aids ? ` · Hilfsmittel: ${ex.aids}` : ''}`,
    };
    if (store.state.google.connected) {
      try {
        await pushEventToGoogle(payload);
        showToast(`„${ex.title}“ in Google Kalender gespeichert!`);
      } catch (err) {
        showToast(err.message);
      }
    } else {
      exportSingleEventToICS(payload);
      showToast('Klausur als .ics geladen.');
    }
    return;
  }

  /* Toolkit & Recurring Tasks actions */
  if (action === 'set-toolkit-sub') {
    vibrate(6);
    ui.toolkitSub = actionEl.dataset.value;
    render();
    return;
  }
  if (action === 'complete-recurring-task') {
    vibrate(14);
    const id = actionEl.dataset.id;
    let nextDueStr = '';
    store.update((s) => {
      const t = s.tasks.find((x) => x.id === id);
      if (!t) return;
      const step = t.recurrence === 'biweekly' ? 14 : 7;
      t.lastCompleted = isoDate();
      t.streak = Number(t.streak || 0) + 1;
      t.due = addDaysToISO(t.due, step);
      nextDueStr = formatShortDateDE(t.due);
    });
    showToast(`Erledigt! Nächste Abgabe automatisch auf ${nextDueStr} geplant.`);
    return;
  }
  if (action === 'toggle-task') {
    vibrate(10);
    store.update((s) => {
      const t = s.tasks.find((x) => x.id === actionEl.dataset.id);
      if (t) t.done = !t.done;
    });
    return;
  }
  if (action === 'delete-task') {
    store.update((s) => {
      s.tasks = s.tasks.filter((x) => x.id !== actionEl.dataset.id);
    });
    return;
  }

  /* Flashcards actions */
  if (action === 'card-flip') {
    vibrate(6);
    ui.cardFlipped = !ui.cardFlipped;
    render();
    return;
  }
  if (action === 'card-prev') {
    ui.cardIndex = Math.max(0, (ui.cardIndex || 0) - 1);
    ui.cardFlipped = false;
    render();
    return;
  }
  if (action === 'card-rate') {
    vibrate(10);
    const { id, result } = actionEl.dataset;
    store.update((s) => {
      const card = (s.flashcards || []).find((c) => c.id === id);
      if (!card) return;
      if (result === 'good') card.box = Math.min(3, (card.box || 1) + 1);
      else card.box = 1;
    });
    ui.cardIndex = (ui.cardIndex || 0) + 1;
    ui.cardFlipped = false;
    render();
    return;
  }
  if (action === 'delete-flashcard') {
    store.update((s) => {
      s.flashcards = (s.flashcards || []).filter((c) => c.id !== actionEl.dataset.id);
    });
    ui.cardFlipped = false;
    return;
  }

  /* E-Technik Calculator quick clear */
  if (action === 'calc-ohm-clear') {
    ui.calc.ohmU = '';
    ui.calc.ohmI = '';
    ui.calc.ohmR = '';
    ui.calc.ohmP = '';
    render();
    return;
  }

  /* Grades, Notes, Quicklinks */
  if (action === 'delete-grade') {
    store.update((s) => {
      s.grades = s.grades.filter((g) => g.id !== actionEl.dataset.id);
    });
    return;
  }
  if (action === 'delete-note') {
    store.update((s) => {
      s.notes = s.notes.filter((n) => n.id !== actionEl.dataset.id);
    });
    return;
  }
  if (action === 'delete-quicklink') {
    store.update((s) => {
      s.quickLinks = s.quickLinks.filter((q) => q.id !== actionEl.dataset.id);
    });
    return;
  }

  /* Focus Timer controls */
  if (action === 'start-focus-quick') {
    vibrate(12);
    const subj = actionEl.dataset.subject || 'GET I';
    focusTimer.setSubject(subj);
    ui.tab = 'toolkit';
    ui.toolkitSub = 'focus';
    if (!focusTimer.running) focusTimer.start();
    render();
    showToast(`Bib-Fokus für ${subj} gestartet!`);
    return;
  }
  if (action === 'focus-preset') {
    focusTimer.setPreset(actionEl.dataset.value);
    render();
    return;
  }
  if (action === 'focus-toggle') {
    vibrate(12);
    focusTimer.toggle();
    render();
    return;
  }
  if (action === 'focus-reset') {
    focusTimer.reset();
    render();
    return;
  }
  if (action === 'focus-switch-phase') {
    focusTimer.switchPhase(focusTimer.phase === 'work' ? 'break' : 'work');
    render();
    return;
  }
  if (action === 'focus-wakelock') {
    const on = await focusTimer.toggleWakeLock();
    showToast(on ? 'Display bleibt in der Bib wach.' : 'Display-Wachhalten aus.');
    render();
    return;
  }
  if (action === 'log-manual-study') {
    const subj = focusTimer.subject || 'GET I';
    store.update((s) => {
      s.studySessions.push({ id: uid('ss'), course: subj, minutes: 30, date: isoDate() });
    });
    showToast(`+30 Min Lernzeit für ${subj} geloggt!`);
    return;
  }

  /* Backup & Reset */
  if (action === 'export-backup') {
    const blob = new Blob([store.exportJSON()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `studia-backup-${isoDate()}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 300);
    showToast('Backup heruntergeladen!');
    return;
  }
  if (action === 'import-backup') {
    pickFile('.json,application/json', (text) => {
      try {
        store.importJSON(text);
        showToast('Backup wiederhergestellt!');
      } catch (err) {
        showToast(err.message);
      }
    });
    return;
  }
  if (action === 'reset-demo') {
    store.resetToDemo();
    ui.modal = null;
    showToast('WIE-1 Startdaten wiederhergestellt.');
    render();
  }
});

appRoot.addEventListener('input', (e) => {
  const key = e.target.dataset?.calc;
  if (!key) return;
  ui.calc[key] = e.target.value;
  render(e.target.id);
});

appRoot.addEventListener('change', async (e) => {
  const target = e.target;
  if (target.dataset?.calc) {
    ui.calc[target.dataset.calc] = target.value;
    render(target.id);
    return;
  }

  const action = target.dataset.action;
  if (action === 'focus-subject') {
    focusTimer.setSubject(target.value);
    return;
  }
  if (action === 'toggle-google-readonly') {
    store.update((s) => {
      s.google.readOnlyMode = target.checked;
    });
    return;
  }
  if (action === 'plan-grade-change') {
    store.update((s) => {
      const m = (s.semesterPlan || []).find((x) => x.id === target.dataset.id);
      if (m) m.targetGrade = Number(target.value);
    });
    return;
  }
  if (action === 'toggle-google-cal') {
    const calId = target.value;
    store.update((s) => {
      const set = new Set(s.google.selectedCalendarIds || []);
      if (target.checked) set.add(calId);
      else set.delete(calId);
      s.google.selectedCalendarIds = [...set];
    });
    if (store.state.google.connected) {
      try {
        await syncGoogleCalendars();
        showToast('Kalender-Auswahl aktualisiert.');
      } catch (err) {
        showToast(err.message);
      }
    }
    return;
  }
  if (action === 'set-write-google-cal') {
    store.update((s) => {
      s.google.writeCalendarId = target.value;
    });
    showToast('Ziel-Kalender gespeichert.');
  }
});

appRoot.addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target;
  const fd = new FormData(form);

  if (form.dataset.form === 'add-topic') {
    const text = String(fd.get('topic') || '').trim();
    if (!text) return;
    mutateExamById(form.dataset.examId, (ex) => {
      ex.topics = ex.topics || [];
      ex.topics.push({ id: uid('tp'), text, done: false });
    });
    return;
  }

  if (form.dataset.form === 'exam-keywords') {
    const list = String(fd.get('keywords') || '')
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
    store.update((s) => {
      s.google.examKeywords = list.length ? list : ['klausur', 'prüfung'];
    });
    showToast('Schlagwörter gespeichert.');
    return;
  }

  if (form.dataset.form === 'profile') {
    store.update((s) => {
      const deg = String(fd.get('degree') || '').trim();
      if (deg) s.profile.shortDegree = deg;
      s.profile.semester = String(fd.get('semester') || '').trim() || s.profile.semester;
      s.profile.targetEcts = Math.max(30, Number(fd.get('targetEcts') || 210));
    });
    showToast('Studienprofil gespeichert.');
    return;
  }

  const modalType = form.dataset.modalSubmit;
  if (!modalType) return;

  if (modalType === 'module-notebook') {
    const modId = form.dataset.id;
    store.update((s) => {
      const mod = (s.modules || []).find((m) => m.id === modId);
      if (!mod) return;
      mod.notebookLabel = String(fd.get('notebookLabel') || '').trim() || `NotebookLM · ${mod.short}`;
      mod.notebookUrl = String(fd.get('notebookUrl') || '').trim() || 'https://notebooklm.google.com/';
      const mUrl = String(fd.get('moodleUrl') || '').trim();
      if (mUrl) mod.moodleUrl = mUrl;
    });
    ui.modal = null;
    showToast('Notebook-Link im Modul gespeichert!');
    render();
    return;
  }

  if (modalType === 'module-note') {
    const modId = form.dataset.id;
    store.update((s) => {
      const mod = (s.modules || []).find((m) => m.id === modId);
      if (!mod) return;
      mod.notebookNotes = mod.notebookNotes || [];
      mod.notebookNotes.unshift({
        id: uid('nn'),
        title: String(fd.get('title') || '').trim(),
        content: String(fd.get('content') || '').trim(),
        updatedAt: isoDate(),
      });
    });
    ui.modal = null;
    showToast('Info aus Notebook im Modul gespeichert!');
    render();
    return;
  }

  if (modalType === 'import-notebook-cards') {
    const mod = (store.state.modules || []).find((m) => m.id === form.dataset.id);
    if (!mod) return;
    const bulk = String(fd.get('bulkText') || '');
    const parsed = parseBulkFlashcards(bulk, mod.courseKey);
    if (parsed.length === 0) {
      showToast('Kein Format erkannt. Nutze z. B. „Frage :: Antwort“ oder „F: ... / A: ...“.');
      return;
    }
    store.update((s) => {
      s.flashcards = [...parsed, ...(s.flashcards || [])];
    });
    ui.modal = null;
    ui.cardIndex = 0;
    ui.cardFlipped = false;
    showToast(`${parsed.length} Karteikarten für ${mod.short} importiert!`);
    render();
    return;
  }

  if (modalType === 'course') {
    const id = form.dataset.id;
    const title = String(fd.get('title') || '').trim();
    const entry = {
      id: id || uid('tt'),
      title,
      short: title.split(/\s+/).slice(0, 2).join(' ').slice(0, 16),
      type: String(fd.get('type') || 'VL'),
      day: Number(fd.get('day') || 0),
      start: String(fd.get('start') || '10:00'),
      end: String(fd.get('end') || '11:45'),
      room: String(fd.get('room') || '').trim(),
      lecturer: String(fd.get('lecturer') || '').trim(),
      weekParity: String(fd.get('weekParity') || 'all'),
      ects: Number(fd.get('ects') || 0),
      color: String(fd.get('color') || 'sage'),
    };
    store.update((s) => {
      const idx = s.timetable.findIndex((c) => c.id === entry.id);
      if (idx >= 0) s.timetable[idx] = { ...s.timetable[idx], ...entry };
      else s.timetable.push({ ...entry, link: '', absences: 0, maxAbsences: null });
    });
    ui.modal = null;
    showToast(id ? 'Veranstaltung aktualisiert' : 'Veranstaltung hinzugefügt');
    render();
    return;
  }

  if (modalType === 'exam') {
    const id = form.dataset.id;
    const gKey = form.dataset.gkey;
    if (gKey) {
      mutateExamById(`gex_${gKey}`, (meta) => {
        meta.ects = Number(fd.get('ects') || 5);
        meta.attempt = Number(fd.get('attempt') || 1);
        meta.aids = String(fd.get('aids') || '').trim();
        meta.color = String(fd.get('color') || 'sage');
      });
      ui.modal = null;
      showToast('Lern-Details gespeichert.');
      render();
      return;
    }

    const entry = {
      id: id || uid('ex'),
      title: String(fd.get('title') || '').trim(),
      date: String(fd.get('date') || ''),
      time: String(fd.get('time') || '09:00'),
      durationMin: Number(fd.get('durationMin') || 90),
      ects: Number(fd.get('ects') || 5),
      room: String(fd.get('room') || '').trim(),
      attempt: Number(fd.get('attempt') || 1),
      aids: String(fd.get('aids') || '').trim(),
      color: String(fd.get('color') || 'sage'),
    };
    if (!id && fd.get('pushGoogle') === 'on' && store.state.google.connected) {
      try {
        const created = await pushEventToGoogle({
          title: `Klausur ${entry.title}`,
          date: entry.date,
          start: entry.time,
          end: addMinutesToTime(entry.time, entry.durationMin),
          location: entry.room,
          notes: `${entry.ects} ECTS · ${entry.attempt}. Versuch`,
        });
        if (created?.id) {
          store.update((s) => {
            s.google.examMetaByGoogleId[created.id] = {
              ects: entry.ects,
              attempt: entry.attempt,
              aids: entry.aids,
              color: entry.color,
              completed: false,
              grade: null,
              topics: [],
            };
          });
        }
        ui.modal = null;
        showToast('Klausur im Google Kalender angelegt!');
        render();
        return;
      } catch (err) {
        showToast(`Google Sync fehlgeschlagen (${err.message}) — lokal gespeichert.`);
      }
    }

    store.update((s) => {
      const idx = s.exams.findIndex((x) => x.id === entry.id);
      if (idx >= 0) s.exams[idx] = { ...s.exams[idx], ...entry };
      else s.exams.push({ ...entry, completed: false, grade: null, topics: [] });
    });
    ui.modal = null;
    showToast(id ? 'Klausur aktualisiert' : 'Klausur eingetragen');
    render();
    return;
  }

  if (modalType === 'complete-exam') {
    const id = form.dataset.id;
    const gradeRaw = String(fd.get('grade') || '').trim();
    const sem = String(fd.get('semester') || '1. Sem.').trim();
    const examObj = getUnifiedExams(store.state).find((x) => x.id === id);
    mutateExamById(id, (target) => {
      target.completed = true;
      if (gradeRaw) target.grade = Number(gradeRaw);
    });
    if (gradeRaw && examObj) {
      store.update((s) => {
        s.grades.push({
          id: uid('gr'),
          title: examObj.title,
          semester: sem,
          ects: examObj.ects,
          grade: Number(gradeRaw),
        });
      });
    }
    ui.modal = null;
    showToast(gradeRaw ? 'Klausur abgeschlossen & Note gespeichert!' : 'Klausur abgeschlossen!');
    render();
    return;
  }

  if (modalType === 'event') {
    const payload = {
      title: String(fd.get('title') || '').trim(),
      date: String(fd.get('date') || isoDate()),
      start: String(fd.get('start') || '14:00'),
      end: String(fd.get('end') || '15:30'),
      location: String(fd.get('location') || '').trim(),
      notes: String(fd.get('notes') || '').trim(),
    };
    const pushGoogle = fd.get('pushGoogle') === 'on';
    if (pushGoogle && store.state.google.connected) {
      try {
        await pushEventToGoogle(payload);
        ui.modal = null;
        showToast('Termin im Google Kalender gespeichert!');
        render();
        return;
      } catch (err) {
        showToast(`Google Sync fehlgeschlagen — lokal gespeichert.`);
      }
    }
    store.update((s) => {
      s.calendarEvents.push({
        id: uid('ev'),
        ...payload,
        source: 'local',
        calendarName: 'Studia',
        color: 'sage',
      });
    });
    if (pushGoogle && !store.state.google.connected) exportSingleEventToICS(payload);
    ui.modal = null;
    showToast('Termin gespeichert');
    render();
    return;
  }

  if (modalType === 'task') {
    const recurrence = String(fd.get('recurrence') || 'once');
    store.update((s) => {
      s.tasks.push({
        id: uid('tk'),
        title: String(fd.get('title') || '').trim(),
        course: String(fd.get('course') || 'Orga').trim(),
        due: String(fd.get('due') || ''),
        dueTime: String(fd.get('dueTime') || '23:59'),
        recurrence,
        recurrenceLabel:
          recurrence === 'weekly' ? 'Jede Woche' : recurrence === 'biweekly' ? 'Alle 2 Wochen' : 'Einmalig',
        streak: 0,
        lastCompleted: null,
        done: false,
      });
    });
    ui.modal = null;
    showToast('Abgabe / Aufgabe hinzugefügt');
    render();
    return;
  }

  if (modalType === 'flashcard') {
    store.update((s) => {
      s.flashcards = s.flashcards || [];
      s.flashcards.unshift({
        id: uid('fc'),
        course: String(fd.get('course') || 'GET I'),
        front: String(fd.get('front') || '').trim(),
        back: String(fd.get('back') || '').trim(),
        box: 1,
      });
    });
    ui.modal = null;
    ui.cardIndex = 0;
    ui.cardFlipped = false;
    showToast('Karteikarte gespeichert!');
    render();
    return;
  }

  if (modalType === 'grade') {
    store.update((s) => {
      s.grades.push({
        id: uid('gr'),
        title: String(fd.get('title') || '').trim(),
        grade: Number(fd.get('grade') || 1.7),
        ects: Number(fd.get('ects') || 5),
        semester: String(fd.get('semester') || '1. Sem.').trim(),
      });
    });
    ui.modal = null;
    showToast('Note gespeichert');
    render();
    return;
  }

  if (modalType === 'note') {
    const id = form.dataset.id;
    const payload = {
      title: String(fd.get('title') || '').trim(),
      course: String(fd.get('course') || 'HSD').trim(),
      content: String(fd.get('content') || '').trim(),
      updatedAt: isoDate(),
    };
    store.update((s) => {
      const idx = s.notes.findIndex((n) => n.id === id);
      if (idx >= 0) s.notes[idx] = { ...s.notes[idx], ...payload };
      else s.notes.unshift({ id: uid('nt'), ...payload });
    });
    ui.modal = null;
    showToast('Notiz gespeichert');
    render();
    return;
  }

  if (modalType === 'quicklink') {
    store.update((s) => {
      s.quickLinks.push({
        id: uid('ql'),
        label: String(fd.get('label') || '').trim(),
        sub: String(fd.get('sub') || '').trim(),
        url: String(fd.get('url') || '').trim(),
      });
    });
    ui.modal = null;
    showToast('Campus-Link hinzugefügt');
    render();
  }
});

window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && ui.modal) {
    ui.modal = null;
    render();
  }
});

let lastIsSmall = window.innerWidth < 720;
window.addEventListener('resize', () => {
  const nowSmall = window.innerWidth < 720;
  if (nowSmall !== lastIsSmall) {
    lastIsSmall = nowSmall;
    ui.timetableLayout = null;
    render();
  }
});

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  ui.installPromptEvent = e;
  render();
});

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  });
}

store.subscribe(() => render());

// Check if returning from Google Redirect OAuth flow
handleGoogleRedirectCallback()
  .then((count) => {
    if (count !== null) {
      showToast(`Google Kalender verbunden! ${count} Termine geladen.`);
      render();
    }
  })
  .catch((err) => {
    ui.googleError = err.message;
    ui.modal = { type: 'settings' };
    render();
  });

render();
