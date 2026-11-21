import {
  DEFAULT_EXAM_KEYWORDS,
  DEFAULT_GOOGLE_CLIENT_ID,
  addMinutesToTime,
  createDefaultModules,
  createDefaultState,
  isoDate,
  timeToMinutes,
} from '../data/defaults.js';
import {
  adjustTaskDueForHolidays,
  expandRecurringTaskDates,
  normalizeSemesterConfig,
} from '../utils/semester.js';
import { normalizeCard } from '../utils/spacedRepetition.js';

export { addMinutesToTime, timeToMinutes };

const STORAGE_KEY = 'studia_wie_state_v2';

function mergeWithDefaults(parsed, { keepConnection = true } = {}) {
  const fallback = createDefaultState();
  const semesterConfig = normalizeSemesterConfig(parsed?.semesterConfig);
  const todayIso = isoDate();

  const mergedGoogle = {
    ...fallback.google,
    ...(parsed?.google || {}),
    clientId: parsed?.google?.clientId || DEFAULT_GOOGLE_CLIENT_ID,
    rememberLogin: parsed?.google?.rememberLogin !== false,
    driveSyncEnabled: parsed?.google?.driveSyncEnabled !== false,
    examKeywords: parsed?.google?.examKeywords || fallback.google.examKeywords,
    promotedGoogleExamIds: parsed?.google?.promotedGoogleExamIds || [],
    hiddenGoogleExamIds: parsed?.google?.hiddenGoogleExamIds || [],
    examMetaByGoogleId: {
      ...fallback.google.examMetaByGoogleId,
      ...(parsed?.google?.examMetaByGoogleId || {}),
    },
  };
  if (!keepConnection) {
    mergedGoogle.connected = false;
  }

  const rawCards = Array.isArray(parsed?.flashcards) ? parsed.flashcards : fallback.flashcards;
  const flashcards = rawCards.map((c) => normalizeCard(c, todayIso));

  const rawTasks = Array.isArray(parsed?.tasks) ? parsed.tasks : fallback.tasks;
  const tasks = rawTasks.map((t) => {
    if (t.recurrence === 'weekly' || t.recurrence === 'biweekly') {
      const step = t.recurrence === 'biweekly' ? 14 : 7;
      return { ...t, due: adjustTaskDueForHolidays(t.due, step, semesterConfig) };
    }
    return t;
  });

  return {
    ...fallback,
    ...(parsed || {}),
    version: 4,
    updatedAt: parsed?.updatedAt || fallback.updatedAt,
    studyGoalWeeklyMin: Math.max(30, Number(parsed?.studyGoalWeeklyMin || fallback.studyGoalWeeklyMin || 600)),
    semesterConfig,
    profile: { ...fallback.profile, ...(parsed?.profile || {}) },
    google: mergedGoogle,
    modules:
      Array.isArray(parsed?.modules) && parsed.modules.length > 0
        ? parsed.modules
        : createDefaultModules(),
    tasks,
    flashcards,
  };
}

class StudiaStore {
  constructor() {
    this.state = this.load();
    this.listeners = new Set();
  }

  load() {
    try {
      if (typeof localStorage === 'undefined') return mergeWithDefaults(null);
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return mergeWithDefaults(null);
      const parsed = JSON.parse(raw);
      return mergeWithDefaults(parsed, { keepConnection: true });
    } catch {
      return mergeWithDefaults(null);
    }
  }

  save() {
    try {
      if (typeof localStorage === 'undefined') return;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
    } catch (err) {
      console.warn('Speichern fehlgeschlagen:', err);
    }
  }

  subscribe(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  notify(meta = {}) {
    this.save();
    this.listeners.forEach((fn) => fn(this.state, meta));
  }

  update(mutator, { touchUpdatedAt = true, fromRemote = false } = {}) {
    mutator(this.state);
    if (touchUpdatedAt && !fromRemote) {
      this.state.updatedAt = new Date().toISOString();
    }
    this.notify({ touchUpdatedAt, fromRemote });
  }

  resetToDemo() {
    const prevClientId = this.state.google.clientId || DEFAULT_GOOGLE_CLIENT_ID;
    const prevTheme = this.state.theme;
    const prevConnected = this.state.google.connected;
    const prevEmail = this.state.google.userEmail;
    const prevDriveFileId = this.state.google.driveFileId;
    this.state = mergeWithDefaults(null);
    this.state.google.clientId = prevClientId;
    this.state.google.connected = prevConnected;
    this.state.google.userEmail = prevEmail;
    this.state.google.driveFileId = prevDriveFileId;
    this.state.theme = prevTheme;
    this.state.updatedAt = new Date().toISOString();
    this.notify({ touchUpdatedAt: true, fromRemote: false });
  }

  /**
   * Produces a portable JSON payload for Google Drive appDataFolder sync
   * (omits volatile Google Calendar cache, session tokens, and device-only Gemini API key).
   */
  getSyncPayload() {
    const s = this.state;
    return {
      version: 4,
      updatedAt: s.updatedAt || new Date().toISOString(),
      studyGoalWeeklyMin: s.studyGoalWeeklyMin,
      semesterConfig: s.semesterConfig,
      profile: s.profile,
      theme: s.theme,
      modules: s.modules,
      timetable: s.timetable,
      exams: s.exams,
      calendarEvents: (s.calendarEvents || []).filter((e) => e.source !== 'google-demo'),
      tasks: s.tasks,
      grades: s.grades,
      semesterPlan: s.semesterPlan,
      flashcards: s.flashcards,
      studySessions: s.studySessions,
      notes: s.notes,
      quickLinks: s.quickLinks,
      googleMeta: {
        examKeywords: s.google.examKeywords,
        promotedGoogleExamIds: s.google.promotedGoogleExamIds,
        hiddenGoogleExamIds: s.google.hiddenGoogleExamIds,
        examMetaByGoogleId: s.google.examMetaByGoogleId,
        selectedCalendarIds: s.google.selectedCalendarIds,
        writeCalendarId: s.google.writeCalendarId,
      },
    };
  }

  /**
   * Applies a remote payload loaded from Google Drive without breaking live OAuth state
   * or triggering an auto-upload echo.
   */
  applyRemoteState(remote) {
    if (!remote || typeof remote !== 'object' || !Array.isArray(remote.timetable)) {
      throw new Error('Ungültige Studia-Cloud-Daten in Google Drive.');
    }
    const prevGoogle = this.state.google;
    const prevGoogleEvents = this.state.googleEvents;
    const prevSidebarCollapsed = Boolean(this.state.sidebarCollapsed);
    const demoEvents = (this.state.calendarEvents || []).filter((e) => e.source === 'google-demo');
    const remoteEvents = Array.isArray(remote.calendarEvents) ? remote.calendarEvents : [];

    const merged = mergeWithDefaults(
      {
        ...remote,
        sidebarCollapsed: prevSidebarCollapsed,
        calendarEvents: [...demoEvents, ...remoteEvents.filter((e) => e.source !== 'google-demo')],
        google: {
          ...prevGoogle,
          ...(remote.googleMeta || {}),
        },
      },
      { keepConnection: true }
    );
    merged.googleEvents = prevGoogleEvents;
    merged.updatedAt = remote.updatedAt || new Date().toISOString();
    this.state = merged;
    this.notify({ touchUpdatedAt: false, fromRemote: true });
  }

  exportJSON() {
    return JSON.stringify(this.state, null, 2);
  }

  importJSON(jsonStr) {
    const parsed = JSON.parse(jsonStr);
    if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.timetable)) {
      throw new Error('Ungültige Studia-Backup-Datei.');
    }
    this.state = mergeWithDefaults(parsed, { keepConnection: false });
    this.state.updatedAt = new Date().toISOString();
    this.notify({ touchUpdatedAt: true, fromRemote: false });
  }
}

export const store = new StudiaStore();

/* ---------- Google Calendar -> Automatic Exam Detection ---------- */

export function isGoogleEventExam(ev, googleState) {
  const g = googleState || {};
  const key = ev.googleEventId || ev.id;
  if ((g.hiddenGoogleExamIds || []).includes(key)) return false;
  if ((g.promotedGoogleExamIds || []).includes(key)) return true;

  const keywords = (g.examKeywords?.length ? g.examKeywords : DEFAULT_EXAM_KEYWORDS).map((k) =>
    k.toLowerCase().trim()
  );
  const haystack = `${ev.title || ''} ${ev.calendarName || ''}`.toLowerCase();
  return keywords.some((kw) => kw && haystack.includes(kw));
}

export function getUnifiedExams(state) {
  const g = state.google || {};
  const metaMap = g.examMetaByGoogleId || {};
  const sourceGoogleEvents = g.connected
    ? state.googleEvents || []
    : (state.calendarEvents || []).filter((e) => e.source === 'google-demo');

  const googleExams = [];
  for (const ev of sourceGoogleEvents) {
    if (!isGoogleEventExam(ev, g)) continue;
    const gKey = ev.googleEventId || ev.id;
    const meta = metaMap[gKey] || {};
    const startMins = ev.start && /^\d{2}:\d{2}$/.test(ev.start) ? timeToMinutes(ev.start) : null;
    const endMins = ev.end && /^\d{2}:\d{2}$/.test(ev.end) ? timeToMinutes(ev.end) : null;
    const inferredDur =
      startMins !== null && endMins !== null && endMins > startMins ? endMins - startMins : 90;

    googleExams.push({
      id: `gex_${gKey}`,
      googleKey: gKey,
      fromGoogle: true,
      isDemoGoogle: ev.source === 'google-demo',
      calendarName: ev.calendarName || 'Google Kalender',
      htmlLink: ev.htmlLink || '',
      title: ev.title.replace(/^klausur[:\s-]*/i, '').trim() || ev.title,
      rawTitle: ev.title,
      date: ev.date,
      time: ev.start || '09:00',
      durationMin: meta.durationMin || inferredDur,
      room: ev.location || meta.room || '',
      ects: meta.ects ?? 5,
      attempt: meta.attempt ?? 1,
      aids: meta.aids ?? '',
      color: meta.color || 'sage',
      completed: Boolean(meta.completed),
      grade: meta.grade ?? null,
      topics: meta.topics || [],
    });
  }

  const manualExams = (state.exams || []).map((ex) => ({
    ...ex,
    fromGoogle: false,
    isDemoGoogle: false,
  }));

  return [...googleExams, ...manualExams].sort((a, b) => a.date.localeCompare(b.date));
}

/* ---------- Computed Academic Helpers ---------- */

export function computeGpaStats(grades, targetEcts = 210) {
  const passed = grades.filter((g) => Number(g.grade) <= 4.0);
  const totalEcts = passed.reduce((sum, g) => sum + Number(g.ects || 0), 0);
  const graded = grades.filter((g) => Number(g.grade) > 0 && Number(g.ects) > 0);
  const weightedSum = graded.reduce((sum, g) => sum + Number(g.grade) * Number(g.ects), 0);
  const gradedEcts = graded.reduce((sum, g) => sum + Number(g.ects), 0);
  const gpa = gradedEcts > 0 ? weightedSum / gradedEcts : null;
  const progressPct = Math.min(100, Math.round((totalEcts / (targetEcts || 210)) * 100));
  return { gpa, totalEcts, gradedEcts, progressPct };
}

export function formatGradeDE(num) {
  if (num === null || num === undefined || Number.isNaN(num)) return '–';
  return Number(num).toFixed(2).replace('.', ',');
}

export function formatSingleGradeDE(num) {
  if (num === null || num === undefined || Number.isNaN(num)) return '–';
  return Number(num).toFixed(1).replace('.', ',');
}

export function computeExamReadiness(exam) {
  const topics = exam.topics || [];
  if (topics.length === 0) return { done: 0, total: 0, pct: 0 };
  const done = topics.filter((t) => t.done).length;
  return { done, total: topics.length, pct: Math.round((done / topics.length) * 100) };
}

export function getAllCalendarEvents(state) {
  const events = [];

  for (const ev of state.calendarEvents || []) {
    if (ev.source === 'google-demo' && state.google.connected) continue;
    events.push({
      ...ev,
      isDetectedExam: ev.source === 'google-demo' ? isGoogleEventExam(ev, state.google) : false,
    });
  }

  for (const ev of state.googleEvents || []) {
    events.push({
      ...ev,
      isDetectedExam: isGoogleEventExam(ev, state.google),
    });
  }

  for (const ex of state.exams || []) {
    if (ex.completed) continue;
    events.push({
      id: `exam_${ex.id}`,
      examId: ex.id,
      title: `Klausur: ${ex.title}`,
      date: ex.date,
      start: ex.time || '09:00',
      end: addMinutesToTime(ex.time || '09:00', ex.durationMin || 90),
      location: ex.room || '',
      notes: ex.aids ? `Hilfsmittel: ${ex.aids}` : '',
      source: 'exam',
      calendarName: 'Klausur',
      color: 'terracotta',
    });
  }

  for (const tk of state.tasks || []) {
    if (!tk.due || (tk.recurrence === 'once' && tk.done)) continue;
    const isRecurring = tk.recurrence === 'weekly' || tk.recurrence === 'biweekly';
    const dates = expandRecurringTaskDates(tk, state.semesterConfig, 12);
    dates.forEach((occDate, i) => {
      events.push({
        id: `task_${tk.id}_${i}`,
        taskId: tk.id,
        title: `Abgabe: ${tk.title}`,
        date: occDate,
        start: tk.dueTime || '23:59',
        end: '',
        location: tk.course || '',
        notes: tk.recurrenceLabel || '',
        source: 'task',
        calendarName: isRecurring ? 'Wiederkehrende Abgabe' : 'Abgabe',
        color: 'ochre',
      });
    });
  }

  return events.sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    return (a.start || '').localeCompare(b.start || '');
  });
}

export function getTodayStudyMinutes(state) {
  const today = isoDate();
  return (state.studySessions || [])
    .filter((s) => s.date === today)
    .reduce((sum, s) => sum + Number(s.minutes || 0), 0);
}
