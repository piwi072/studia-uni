import {
  DEFAULT_EXAM_KEYWORDS,
  DEFAULT_GOOGLE_CLIENT_ID,
  addDaysToISO,
  createDefaultModules,
  createDefaultState,
  isoDate,
} from '../data/defaults.js';

const STORAGE_KEY = 'studia_wie_state_v2';

class StudiaStore {
  constructor() {
    this.state = this.load();
    this.listeners = new Set();
  }

  load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return createDefaultState();
      const parsed = JSON.parse(raw);
      const fallback = createDefaultState();
      const mergedGoogle = {
        ...fallback.google,
        ...(parsed.google || {}),
        clientId: parsed.google?.clientId || DEFAULT_GOOGLE_CLIENT_ID,
        examKeywords: parsed.google?.examKeywords || fallback.google.examKeywords,
        promotedGoogleExamIds: parsed.google?.promotedGoogleExamIds || [],
        hiddenGoogleExamIds: parsed.google?.hiddenGoogleExamIds || [],
        examMetaByGoogleId: {
          ...fallback.google.examMetaByGoogleId,
          ...(parsed.google?.examMetaByGoogleId || {}),
        },
      };
      return {
        ...fallback,
        ...parsed,
        profile: { ...fallback.profile, ...(parsed.profile || {}) },
        google: mergedGoogle,
        modules:
          Array.isArray(parsed.modules) && parsed.modules.length > 0
            ? parsed.modules
            : createDefaultModules(),
      };
    } catch {
      return createDefaultState();
    }
  }

  save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
    } catch (err) {
      console.warn('Speichern fehlgeschlagen:', err);
    }
  }

  subscribe(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  notify() {
    this.save();
    this.listeners.forEach((fn) => fn(this.state));
  }

  update(mutator) {
    mutator(this.state);
    this.notify();
  }

  resetToDemo() {
    const prevClientId = this.state.google.clientId || DEFAULT_GOOGLE_CLIENT_ID;
    const prevTheme = this.state.theme;
    this.state = createDefaultState();
    this.state.google.clientId = prevClientId;
    this.state.theme = prevTheme;
    this.notify();
  }

  exportJSON() {
    return JSON.stringify(this.state, null, 2);
  }

  importJSON(jsonStr) {
    const parsed = JSON.parse(jsonStr);
    if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.timetable)) {
      throw new Error('Ungültige Studia-Backup-Datei.');
    }
    const fallback = createDefaultState();
    this.state = {
      ...fallback,
      ...parsed,
      profile: { ...fallback.profile, ...(parsed.profile || {}) },
      google: {
        ...fallback.google,
        ...(parsed.google || {}),
        clientId: parsed.google?.clientId || DEFAULT_GOOGLE_CLIENT_ID,
        connected: false,
      },
      modules:
        Array.isArray(parsed.modules) && parsed.modules.length > 0
          ? parsed.modules
          : createDefaultModules(),
    };
    this.notify();
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
    const step = tk.recurrence === 'weekly' ? 7 : tk.recurrence === 'biweekly' ? 14 : 0;
    const count = step > 0 ? 4 : 1;
    for (let i = 0; i < count; i++) {
      const occDate = i === 0 ? tk.due : addDaysToISO(tk.due, step * i);
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
        calendarName: step > 0 ? 'Wiederkehrende Abgabe' : 'Abgabe',
        color: 'ochre',
      });
    }
  }

  return events.sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    return (a.start || '').localeCompare(b.start || '');
  });
}

export function addMinutesToTime(hhmm, mins) {
  const [h, m] = (hhmm || '09:00').split(':').map(Number);
  const total = h * 60 + m + Number(mins || 0);
  const nh = Math.floor(total / 60) % 24;
  const nm = total % 60;
  return `${String(nh).padStart(2, '0')}:${String(nm).padStart(2, '0')}`;
}

export function timeToMinutes(hhmm) {
  const [h, m] = (hhmm || '08:00').split(':').map(Number);
  return h * 60 + m;
}

export function getTodayStudyMinutes(state) {
  const today = isoDate();
  return (state.studySessions || [])
    .filter((s) => s.date === today)
    .reduce((sum, s) => sum + Number(s.minutes || 0), 0);
}
