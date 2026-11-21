import './styles/index.css';
import { ICONS } from './components/icons.js';
import { renderModal } from './components/modals.js';
import { createActionHandlers } from './controllers/actions.js';
import { createFormHandler } from './controllers/forms.js';
import { isoDate } from './data/defaults.js';
import { focusTimer, formatMMSS } from './services/focusTimer.js';
import {
  handleGoogleRedirectCallback,
  hasActiveGoogleToken,
  syncGoogleCalendars,
  trySilentGoogleReconnect,
} from './services/googleCalendar.js';
import {
  getDriveSyncStatus,
  scheduleDriveAutoUpload,
  subscribeDriveSyncStatus,
  syncWithGoogleDrive,
} from './services/googleDriveSync.js';
import { getUnifiedExams, store } from './state/store.js';
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

const sharedTitle = params.get('share_title') || '';
const sharedText = params.get('share_text') || '';
const sharedUrl = params.get('share_url') || '';
const hasIncomingShare = Boolean(sharedTitle || sharedText || sharedUrl);

if (hasIncomingShare) {
  // Clean URL immediately so reloading does not reopen the Share dialog
  window.history.replaceState(null, '', window.location.pathname);
}

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
  cardDueOnly: true,
  studyStatsScope: 'week',
  tutorMode: 'cards',
  tutorLoading: false,
  tutorError: '',
  tutorResultByModule: {},
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
  modal: hasIncomingShare
    ? {
        type: 'share-import',
        shared: { title: sharedTitle, text: sharedText, url: sharedUrl },
      }
    : null,
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
  while (region.children.length >= 2) {
    region.firstElementChild?.remove();
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
  const driveStatus = getDriveSyncStatus();

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
            <div class="install-banner-sub">Vollbild, Offline-Stundenplan &amp; Teilen-Ziel auf dem Homescreen</div>
          </div>
        </div>
        <div class="flex-row">
          <button class="btn btn-primary btn-sm" data-action="trigger-install">Installieren</button>
          <button class="icon-btn" data-action="dismiss-install" aria-label="Später">${ICONS.close}</button>
        </div>
      </div>`
      : '';

  const syncLabel = !state.google.connected
    ? 'Google verknüpfen'
    : driveStatus.state === 'syncing'
      ? 'Drive synchronisiert…'
      : hasActiveGoogleToken()
        ? state.google.lastDriveSync
          ? 'Google & Drive aktiv'
          : 'Google Kalender aktiv'
        : 'Sitzung pausiert';

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
              ${esc(syncLabel)}
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

/* ---------- Focus Timer Subscriptions ---------- */
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

/* ---------- Delegated Event Controllers ---------- */
const { handleClick, handleInput, handleChange } = createActionHandlers({ ui, render, showToast });
const handleSubmit = createFormHandler({ ui, render, showToast });

appRoot.addEventListener('click', handleClick);
appRoot.addEventListener('input', handleInput);
appRoot.addEventListener('change', handleChange);
appRoot.addEventListener('submit', handleSubmit);

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

store.subscribe((_state, meta) => {
  render();
  if (meta?.touchUpdatedAt && !meta?.fromRemote) {
    scheduleDriveAutoUpload();
  }
});

subscribeDriveSyncStatus(() => {
  if (ui.modal?.type === 'settings') render();
});

/* ---------- Startup: OAuth Redirect + Silent Auto-Reconnect & Auto-Sync ---------- */
let lastBackgroundSyncAt = 0;

async function runSilentAutoSync(force = false) {
  if (!store.state.google.connected || !store.state.google.rememberLogin) return;
  const now = Date.now();
  if (!force && now - lastBackgroundSyncAt < 10 * 60 * 1000) return;

  const reconnect = await trySilentGoogleReconnect();
  if (reconnect.status === 'restored' || reconnect.status === 'refreshed') {
    lastBackgroundSyncAt = now;
    try {
      await syncGoogleCalendars();
    } catch {
      // Keep cached calendar events offline
    }
    if (store.state.google.driveSyncEnabled) {
      await syncWithGoogleDrive({ direction: 'auto', silent: true });
    }
    render();
  }
}

handleGoogleRedirectCallback()
  .then(async (count) => {
    if (count !== null) {
      if (store.state.google.driveSyncEnabled) {
        await syncWithGoogleDrive({ direction: 'auto', silent: true });
      }
      showToast(`Google verbunden! ${count} Termine geladen.`);
      render();
    } else {
      await runSilentAutoSync(true);
    }
  })
  .catch((err) => {
    ui.googleError = err.message;
    ui.modal = { type: 'settings' };
    render();
  });

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    runSilentAutoSync(false).catch(() => {});
  }
});

render();
