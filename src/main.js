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
import {
  consumeBridgePairingHash,
  getBridgeStatus,
  isPersonalBridgeConfigured,
  scheduleBridgeAutoPush,
  subscribeBridgeStatus,
  syncAllViaBridge,
} from './services/personalBridge.js';
import { getUnifiedExams, store } from './state/store.js';
import { esc, vibrate } from './utils/html.js';
import { getLeitnerStats } from './utils/spacedRepetition.js';
import { renderCalendarView } from './views/calendarView.js';
import { renderExamsView } from './views/examsView.js';
import { renderTimetableView } from './views/timetableView.js';
import { renderTodayView } from './views/todayView.js';
import { renderFocusView, renderModulesView } from './views/toolkitView.js';

// Handle 1-tap Magic Pairing Link (#bridge=...) before anything else!
const pairedBridge = consumeBridgePairingHash();

const params = new URLSearchParams(window.location.search);
const rawTab = params.get('tab');
const rawSub = params.get('sub');
let initialTab = 'today';
let initialTodaySub = 'overview';
let initialExamsSub = 'exams';

if (['today', 'timetable', 'calendar', 'exams', 'modules', 'focus'].includes(rawTab)) {
  initialTab = rawTab;
  if (rawTab === 'today' && rawSub === 'tasks') initialTodaySub = 'tasks';
  if (rawTab === 'exams' && rawSub === 'grades') initialExamsSub = 'grades';
} else if (rawTab === 'toolkit') {
  // Backwards compatibility for older shortcuts/links
  if (rawSub === 'focus') initialTab = 'focus';
  else if (rawSub === 'tasks') {
    initialTab = 'today';
    initialTodaySub = 'tasks';
  } else if (rawSub === 'grades') {
    initialTab = 'exams';
    initialExamsSub = 'grades';
  } else {
    initialTab = 'modules';
  }
}

const sharedTitle = params.get('share_title') || '';
const sharedText = params.get('share_text') || '';
const sharedUrl = params.get('share_url') || '';
const hasIncomingShare = Boolean(sharedTitle || sharedText || sharedUrl);

if (hasIncomingShare) {
  window.history.replaceState(null, '', window.location.pathname);
}

const ui = {
  tab: initialTab,
  todaySub: initialTodaySub,
  examsSub: initialExamsSub,
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
  tutorCanFallbackHydrogen: false,
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

  const routeKey = `${ui.tab}:${ui.tab === 'today' ? ui.todaySub : ui.tab === 'exams' ? ui.examsSub : ''}`;
  const shouldAnimate = routeKey !== lastRenderedRoute;
  lastRenderedRoute = routeKey;

  const upcomingExamsCount = getUnifiedExams(state).filter((e) => !e.completed).length;
  const dueCardsCount = getLeitnerStats(state.flashcards || [], null, isoDate()).dueCount;
  const timerSnap = focusTimer.getSnapshot();
  const driveStatus = getDriveSyncStatus();
  const bridgeActive = isPersonalBridgeConfigured();
  const bridgeStat = getBridgeStatus();
  const sidebarCollapsed = Boolean(state.sidebarCollapsed);

  let mainContent = '';
  if (ui.tab === 'today') mainContent = renderTodayView(state, ui);
  else if (ui.tab === 'timetable') mainContent = renderTimetableView(state, ui);
  else if (ui.tab === 'calendar') mainContent = renderCalendarView(state, ui);
  else if (ui.tab === 'exams') mainContent = renderExamsView(state, ui);
  else if (ui.tab === 'modules') mainContent = renderModulesView(state, ui);
  else mainContent = renderFocusView(state, ui);

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

  const isSyncedOk = bridgeActive || state.google.connected;
  const syncLabel = bridgeActive
    ? bridgeStat.state === 'syncing'
      ? 'Synchronisiert…'
      : bridgeStat.state === 'error'
        ? 'Sync prüfen'
        : 'Dauer-Sync aktiv'
    : !state.google.connected
      ? 'Dauer-Sync einrichten'
      : driveStatus.state === 'syncing'
        ? 'Drive synchronisiert…'
        : hasActiveGoogleToken()
          ? state.google.lastDriveSync
            ? 'Google & Drive aktiv'
            : 'Google Kalender aktiv'
          : 'Sitzung pausiert';

  appRoot.innerHTML = `
    <div class="app-shell">
      <aside class="sidebar-rail ${sidebarCollapsed ? 'collapsed' : ''}" aria-label="Hauptnavigation">
        <div class="brand-header">
          <button
            class="brand-trigger"
            data-action="toggle-sidebar"
            title="${sidebarCollapsed ? 'Seitenleiste ausklappen' : 'Seitenleiste einklappen'}"
            aria-label="${sidebarCollapsed ? 'Seitenleiste ausklappen' : 'Seitenleiste einklappen'}"
          >
            <div class="brand-mark">
              <img src="./icons/icon-192.png" alt="Studia App-Icon" />
            </div>
            <div class="brand-text">
              <div class="brand-title">Studia</div>
              <div class="brand-sub">${esc(state.profile.shortDegree || state.profile.degree)}</div>
            </div>
          </button>
          <button
            class="brand-toggle-btn"
            data-action="toggle-sidebar"
            title="${sidebarCollapsed ? 'Seitenleiste ausklappen' : 'Seitenleiste einklappen'}"
            aria-label="${sidebarCollapsed ? 'Seitenleiste ausklappen' : 'Seitenleiste einklappen'}"
            aria-expanded="${!sidebarCollapsed}"
          >
            ${sidebarCollapsed ? ICONS.panelOpen : ICONS.panelClose}
          </button>
        </div>

        <nav class="rail-nav">
          <button class="rail-nav-btn ${ui.tab === 'today' ? 'active' : ''}" data-nav="today" title="Heute & Abgaben">
            ${ICONS.today} <span class="rail-label">Heute</span>
          </button>
          <button class="rail-nav-btn ${ui.tab === 'timetable' ? 'active' : ''}" data-nav="timetable" title="Stundenplan">
            ${ICONS.timetable} <span class="rail-label">Stundenplan</span>
          </button>
          <button class="rail-nav-btn ${ui.tab === 'calendar' ? 'active' : ''}" data-nav="calendar" title="Kalender">
            ${ICONS.calendar} <span class="rail-label">Kalender</span>
          </button>
          <button class="rail-nav-btn ${ui.tab === 'exams' ? 'active' : ''}" data-nav="exams" title="Klausuren & Noten (${upcomingExamsCount})">
            ${ICONS.exams} <span class="rail-label">Klausuren</span>
            ${upcomingExamsCount > 0 ? `<span class="nav-badge">${upcomingExamsCount}</span>` : ''}
          </button>
          <button class="rail-nav-btn ${ui.tab === 'modules' ? 'active' : ''}" data-nav="modules" title="Module & Karteikarten (${dueCardsCount} fällig)">
            ${ICONS.toolkit} <span class="rail-label">Module</span>
            ${dueCardsCount > 0 ? `<span class="nav-badge">${dueCardsCount}</span>` : ''}
          </button>
          <button class="rail-nav-btn ${ui.tab === 'focus' ? 'active' : ''}" data-nav="focus" title="Bib-Fokus">
            ${ICONS.focus} <span class="rail-label">Bib-Fokus</span>
          </button>
        </nav>

        <div class="rail-footer">
          <button class="mini-timer-pill ${timerSnap.running ? 'running' : ''}" data-nav="focus" title="Bib-Fokus (${formatMMSS(timerSnap.remainingSeconds)})">
            <span class="flex-row" style="gap:7px;">
              ${ICONS.clock}
              <span class="mini-timer-label">${timerSnap.running ? esc(timerSnap.subject) : 'Bib-Fokus'}</span>
            </span>
            <strong id="rail-timer-text" class="mono">${formatMMSS(timerSnap.remainingSeconds)}</strong>
          </button>

          <button class="sync-status-btn" data-action="open-modal" data-modal="settings" title="${esc(syncLabel)}">
            <span class="sync-dot ${isSyncedOk && bridgeStat.state !== 'error' ? 'connected' : 'demo'}"></span>
            <span class="rail-label" style="flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
              ${esc(syncLabel)}
            </span>
          </button>

          <div class="rail-utility-row">
            <button class="icon-btn surface" data-action="toggle-theme" aria-label="Farbschema wechseln" title="Hell / Dunkel">
              ${state.theme === 'dark' ? ICONS.sun : ICONS.moon}
            </button>
            <button class="icon-btn surface" style="flex:1; gap:7px; font-size:0.82rem; font-weight:600;" data-action="open-modal" data-modal="settings" title="Einstellungen & Sync">
              ${ICONS.settings} <span class="rail-label">Einstellungen</span>
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
              ? `<button class="btn btn-soft btn-sm mono" data-nav="focus" id="mobile-timer-pill">${formatMMSS(timerSnap.remainingSeconds)}</button>`
              : ''
          }
          <button class="icon-btn" data-action="toggle-theme" aria-label="Design wechseln">
            ${state.theme === 'dark' ? ICONS.sun : ICONS.moon}
          </button>
          <button class="icon-btn" data-action="open-modal" data-modal="settings" aria-label="Einstellungen & Sync">
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
        <button class="m-nav-btn ${ui.tab === 'modules' ? 'active' : ''}" data-nav="modules">
          <span class="m-nav-pill">${ICONS.toolkit}</span>
          <span>Module</span>
        </button>
        <button class="m-nav-btn ${ui.tab === 'focus' ? 'active' : ''}" data-nav="focus">
          <span class="m-nav-pill">${ICONS.focus}</span>
          <span>Fokus</span>
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
    if (isPersonalBridgeConfigured()) {
      scheduleBridgeAutoPush();
    } else {
      scheduleDriveAutoUpload();
    }
  }
});

subscribeDriveSyncStatus(() => {
  if (ui.modal?.type === 'settings') render();
});

subscribeBridgeStatus(() => {
  render();
});

/* ---------- Startup: Personal Bridge Pairing + Auto-Sync + OAuth Fallback ---------- */
let lastBackgroundSyncAt = 0;

async function runBackgroundSync(force = false) {
  const now = Date.now();
  if (isPersonalBridgeConfigured()) {
    if (!force && now - lastBackgroundSyncAt < 30 * 1000) return;
    lastBackgroundSyncAt = now;
    const res = await syncAllViaBridge({ direction: 'auto', silent: true });
    if (res.action === 'downloaded') {
      showToast('Änderungen von anderem Gerät geladen.');
    }
    return;
  }

  if (!store.state.google.connected || !store.state.google.rememberLogin) return;
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

function activatePairedBridge() {
  showToast('Gerät verknüpft! Lade deine Daten & Google Kalender…');
  syncAllViaBridge({ direction: 'download', silent: false })
    .then((res) => {
      showToast(`Dauer-Sync aktiv! ${res.eventsCount || 0} Kalender-Termine geladen.`);
      render();
    })
    .catch((err) => {
      showToast(err.message || 'Synchronisierung fehlgeschlagen.');
      ui.modal = { type: 'settings' };
      render();
    });
}

if (pairedBridge) {
  activatePairedBridge();
} else {
  handleGoogleRedirectCallback()
    .then(async (count) => {
      if (count !== null) {
        if (store.state.google.driveSyncEnabled) {
          await syncWithGoogleDrive({ direction: 'auto', silent: true });
        }
        showToast(`Google verbunden! ${count} Termine geladen.`);
        render();
      } else {
        await runBackgroundSync(true);
      }
    })
    .catch((err) => {
      ui.googleError = err.message;
      ui.modal = { type: 'settings' };
      render();
    });
}

window.addEventListener('hashchange', () => {
  const newlyPaired = consumeBridgePairingHash();
  if (newlyPaired) {
    activatePairedBridge();
  }
});

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    runBackgroundSync(false).catch(() => {});
  }
});

// Keep PC / iPad / Pixel in sync every 60s while app is open in foreground (Personal Bridge)
setInterval(() => {
  if (document.visibilityState === 'visible' && isPersonalBridgeConfigured()) {
    runBackgroundSync(false).catch(() => {});
  }
}, 60 * 1000);

render();
