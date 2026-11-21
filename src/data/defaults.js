export const DEFAULT_GOOGLE_CLIENT_ID =
  '922128740496-p75em90i978ijaubirk1loa75uk7l4nh.apps.googleusercontent.com';

export const COURSE_COLORS = {
  sage: { label: 'Salbei', hex: '#2D6A4F', bg: 'rgba(45, 106, 79, 0.12)', badge: 'badge-sage' },
  slate: { label: 'Schieferblau', hex: '#356075', bg: 'rgba(53, 96, 117, 0.13)', badge: 'badge-slate' },
  terracotta: { label: 'Terrakotta', hex: '#C85A32', bg: 'rgba(200, 90, 50, 0.13)', badge: 'badge-terracotta' },
  ochre: { label: 'Ocker', hex: '#B57A1C', bg: 'rgba(181, 122, 28, 0.14)', badge: 'badge-ochre' },
  plum: { label: 'Pflaume', hex: '#6D4C5C', bg: 'rgba(109, 76, 92, 0.13)', badge: 'badge-plum' },
};

export const WEEKDAYS_SHORT = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
export const WEEKDAYS_FULL = [
  'Montag',
  'Dienstag',
  'Mittwoch',
  'Donnerstag',
  'Freitag',
  'Samstag',
  'Sonntag',
];
export const MONTHS_DE = [
  'Januar',
  'Februar',
  'März',
  'April',
  'Mai',
  'Juni',
  'Juli',
  'August',
  'September',
  'Oktober',
  'November',
  'Dezember',
];

export const GERMAN_GRADES = [1.0, 1.3, 1.7, 2.0, 2.3, 2.7, 3.0, 3.3, 3.7, 4.0, 5.0];

export const DEFAULT_EXAM_KEYWORDS = [
  'klausur',
  'prüfung',
  'pruefung',
  'exam',
  'testat',
  'kolloquium',
];

export function isoDate(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function addDays(days, base = new Date()) {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return isoDate(d);
}

export function addDaysToISO(iso, days) {
  const d = parseISODate(iso);
  d.setDate(d.getDate() + days);
  return isoDate(d);
}

export function parseISODate(str) {
  const [y, m, d] = String(str || isoDate()).split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

export function daysBetween(isoTarget, base = new Date()) {
  const start = new Date(base.getFullYear(), base.getMonth(), base.getDate());
  const target = parseISODate(isoTarget);
  return Math.round((target - start) / 86400000);
}

export function getISOWeek(date = new Date()) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
}

export function getMondayIndex(date = new Date()) {
  const jsDay = date.getDay();
  return jsDay === 0 ? 6 : jsDay - 1;
}

export function nextWeekdayISO(targetMonIdx, fromDate = new Date()) {
  const cur = getMondayIndex(fromDate);
  const delta = (targetMonIdx - cur + 7) % 7;
  return addDays(delta, fromDate);
}

export function nextOccurrenceFromAnchor(anchorISO, stepDays, fromDate = new Date()) {
  const todayStr = isoDate(fromDate);
  let cur = anchorISO;
  let guard = 0;
  while (cur < todayStr && guard < 200) {
    cur = addDaysToISO(cur, stepDays);
    guard += 1;
  }
  return cur;
}

export function formatDateDE(iso) {
  if (!iso) return '';
  const d = parseISODate(iso);
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`;
}

export function formatShortDateDE(iso) {
  if (!iso) return '';
  const d = parseISODate(iso);
  return `${WEEKDAYS_SHORT[getMondayIndex(d)]}, ${d.getDate()}. ${MONTHS_DE[d.getMonth()].slice(0, 3)}`;
}

export function addMinutesToTime(hhmm, mins) {
  const [h, m] = (hhmm || '09:00').split(':').map(Number);
  const total = h * 60 + m + Number(mins || 0);
  const wrapped = ((total % 1440) + 1440) % 1440;
  const nh = Math.floor(wrapped / 60);
  const nm = wrapped % 60;
  return `${String(nh).padStart(2, '0')}:${String(nm).padStart(2, '0')}`;
}

export function timeToMinutes(hhmm) {
  const [h, m] = (hhmm || '08:00').split(':').map(Number);
  return h * 60 + m;
}

/**
 * Official HSD Fachbereich EI & WiWi dates for WS 2026/27
 * (Source: ei.hs-duesseldorf.de/aktuelles/termine/semestertermine)
 */
export const DEFAULT_SEMESTER_CONFIG = {
  name: 'WS 2026/27',
  lecturesStart: '2026-10-05',
  lecturesEnd: '2027-01-22',
  examPeriodStart: '2027-01-25',
  examPeriodEnd: '2027-02-27',
  examRegStart: '2026-11-16',
  examRegEnd: '2026-11-30',
  holidays: [
    {
      id: 'hol_xmas',
      label: 'Weihnachtsferien (vorlesungsfrei)',
      start: '2026-12-23',
      end: '2027-01-03',
    },
  ],
};

export function uid(prefix = 'id') {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

export function createDefaultModules() {
  const today = isoDate();
  return [
    {
      id: 'mod_get',
      courseKey: 'GET I',
      title: 'Grundlagen der Elektrotechnik I für WIE',
      short: 'GET I',
      lecturer: 'Schoft',
      room: '05.1.001 (EI)',
      schedule: 'Fr 12:00–13:45 (VL) · 14:00–14:45 (ÜB)',
      ects: 5,
      color: 'sage',
      toolType: 'get',
      moodleUrl: 'https://moodle.hs-duesseldorf.de',
      notebookUrl: 'https://notebooklm.google.com/',
      notebookLabel: 'NotebookLM · GET I',
      notebookNotes: [
        {
          id: 'nn_get_1',
          title: 'Praktikum-Hinweis (1× im Semester)',
          content: 'Raum 05.2.055 · Team GET I WIE. Versuchsanleitung vorab im Moodle laden und durchlesen.',
          updatedAt: today,
        },
      ],
    },
    {
      id: 'mod_mathe',
      courseKey: 'Mathe I',
      title: 'Mathematik I für WIE',
      short: 'Mathe I',
      lecturer: 'Kerkhoff, Kirchner',
      room: '05.1.001 (EI)',
      schedule: 'Di 12:00–13:45 (ÜB) · 14:00–15:45 (VL)',
      ects: 5,
      color: 'terracotta',
      toolType: 'mathe',
      moodleUrl: 'https://moodle.hs-duesseldorf.de',
      notebookUrl: 'https://notebooklm.google.com/',
      notebookLabel: 'NotebookLM · Mathe I',
      notebookNotes: [
        {
          id: 'nn_mathe_1',
          title: 'Übungs-Rhythmus',
          content: 'Arbeitsblatt jede Woche bis Dienstag 12:00 Uhr rechtzeitig zur Übung fertigmachen.',
          updatedAt: today,
        },
      ],
    },
    {
      id: 'mod_it',
      courseKey: 'Informationstechnik',
      title: 'Grundlagen der Informationstechnik',
      short: 'Informationstechnik',
      lecturer: 'Machmerth',
      room: '04.E.007 (AM)',
      schedule: 'Di 10:00–11:45 (VL) · 17:00–18:45 (ÜB)',
      ects: 5,
      color: 'slate',
      toolType: 'it',
      moodleUrl: 'https://moodle.hs-duesseldorf.de',
      notebookUrl: 'https://notebooklm.google.com/',
      notebookLabel: 'NotebookLM · Informationstechnik',
      notebookNotes: [
        {
          id: 'nn_it_1',
          title: 'Abgabe-Rhythmus',
          content: 'Alle 2 Wochen Sonntag um 24:00 Uhr (22. Nov., 6. Dez., 20. Dez., …).',
          updatedAt: today,
        },
      ],
    },
    {
      id: 'mod_inf',
      courseKey: 'Informatik I',
      title: 'Grundlagen der Informatik I',
      short: 'Informatik I',
      lecturer: 'Mondwurf',
      room: '04.E.007 (AM)',
      schedule: 'Mi 08:00–09:45 (VL) · 10:00–11:45 (ÜB)',
      ects: 5,
      color: 'sage',
      toolType: 'inf',
      moodleUrl: 'https://moodle.hs-duesseldorf.de',
      notebookUrl: 'https://notebooklm.google.com/',
      notebookLabel: 'NotebookLM · Informatik I',
      notebookNotes: [],
    },
    {
      id: 'mod_bwl',
      courseKey: 'BWL',
      title: 'Grundlagen der Betriebswirtschaftslehre',
      short: 'BWL',
      lecturer: 'Verhasselt',
      room: '04.E.007 (AM)',
      schedule: 'Do 15:00–17:45 (VL) · 18:00–18:45 (ÜB)',
      ects: 5,
      color: 'ochre',
      toolType: 'bwl',
      moodleUrl: 'https://moodle.hs-duesseldorf.de',
      notebookUrl: 'https://notebooklm.google.com/',
      notebookLabel: 'NotebookLM · BWL',
      notebookNotes: [],
    },
    {
      id: 'mod_markt',
      courseKey: 'Marktanalyse',
      title: 'Marktanalyse und -bearbeitung',
      short: 'Marktanalyse',
      lecturer: 'Schmengler',
      room: '05.1.001 (EI)',
      schedule: 'Mo 10:00–12:45 (VL) · 13:00–13:45 (ÜB)',
      ects: 5,
      color: 'plum',
      toolType: 'markt',
      moodleUrl: 'https://moodle.hs-duesseldorf.de',
      notebookUrl: 'https://notebooklm.google.com/',
      notebookLabel: 'NotebookLM · Marktanalyse',
      notebookNotes: [
        {
          id: 'nn_markt_1',
          title: 'Wöchentliche Abgabe',
          content: 'Jeden Freitag bis 10:00 Uhr Aufgabe abgeben.',
          updatedAt: today,
        },
      ],
    },
  ];
}

export function createDefaultState() {
  const today = isoDate();
  const nextTue = nextWeekdayISO(1);
  const nextFri = nextWeekdayISO(4);
  const nextInfoTechSun = nextOccurrenceFromAnchor('2026-11-22', 14);

  return {
    version: 4,
    updatedAt: new Date().toISOString(),
    studyGoalWeeklyMin: 600,
    semesterConfig: {
      ...DEFAULT_SEMESTER_CONFIG,
      holidays: DEFAULT_SEMESTER_CONFIG.holidays.map((h) => ({ ...h })),
    },
    profile: {
      university: 'Hochschule Düsseldorf (HSD)',
      degree: 'B.Eng. Wirtschaftsingenieurwesen Elektrotechnik',
      shortDegree: 'B.Eng. WIE · 1. Sem.',
      semester: 'WS 2026/27 · 1. Semester',
      targetEcts: 210,
      showSaturday: false,
    },
    theme: 'light',
    google: {
      clientId: DEFAULT_GOOGLE_CLIENT_ID,
      readOnlyMode: false,
      rememberLogin: true,
      driveSyncEnabled: true,
      driveFileId: null,
      lastDriveSync: null,
      connected: false,
      userEmail: '',
      lastSync: null,
      calendars: [],
      selectedCalendarIds: ['primary'],
      writeCalendarId: 'primary',
      examKeywords: [...DEFAULT_EXAM_KEYWORDS],
      promotedGoogleExamIds: [],
      hiddenGoogleExamIds: [],
      examMetaByGoogleId: {
        ev_g_ex_get: {
          ects: 5,
          attempt: 1,
          aids: 'Formelsammlung & nicht-programmierbarer Taschenrechner',
          color: 'sage',
          topics: [
            { id: 'gt1', text: 'Ohmsches Gesetz, Kirchhoffsche Regeln & Maschenstrom', done: true },
            { id: 'gt2', text: 'Reihen-, Parallel- & Brückenschaltungen (Spannungsteiler)', done: true },
            { id: 'gt3', text: 'Ersatzspannungs- & Ersatzstromquelle (Thévenin / Norton)', done: false },
            { id: 'gt4', text: 'Elektrisches Feld, Kondensator & RC-Schaltvorgänge', done: false },
            { id: 'gt5', text: 'Magnetisches Feld, Induktivität & Wechselstrom-Grundlagen', done: false },
          ],
        },
        ev_g_ex_mathe: {
          ects: 5,
          attempt: 1,
          aids: 'Formelsammlung (lt. Vorlesung)',
          color: 'terracotta',
          topics: [
            { id: 'mt1', text: 'Mengen, Aussagenlogik, Summen & Vollständige Induktion', done: true },
            { id: 'mt2', text: 'Komplexe Zahlen (Kartesisch, Polar, Euler-Form)', done: false },
            { id: 'mt3', text: 'Vektorrechnung, Matrizen & Lineare Gleichungssysteme', done: false },
            { id: 'mt4', text: 'Funktionen, Grenzwerte & Differentialrechnung', done: false },
            { id: 'mt5', text: 'Integralrechnung & Übungsblätter wiederholen', done: false },
          ],
        },
        ev_g_ex_bwl: {
          ects: 5,
          attempt: 1,
          aids: 'Nicht-programmierbarer Taschenrechner',
          color: 'ochre',
          topics: [
            { id: 'bt1', text: 'Rechtsformen, Unternehmensziele & Standortwahl', done: true },
            { id: 'bt2', text: 'Kosten- und Leistungsrechnung (Deckungsbeitrag, Break-Even)', done: false },
            { id: 'bt3', text: 'Investition, Finanzierung & Bilanz-Grundlagen', done: false },
          ],
        },
      },
    },
    modules: createDefaultModules(),
    timetable: [
      {
        id: 'tt_ma_vl',
        title: 'Marktanalyse und -bearbeitung',
        short: 'Marktanalyse',
        type: 'VL',
        day: 0,
        start: '10:00',
        end: '12:45',
        room: '05.1.001 (EI)',
        lecturer: 'Schmengler',
        ects: 5,
        weekParity: 'all',
        color: 'plum',
        link: 'https://moodle.hs-duesseldorf.de',
        absences: 0,
        maxAbsences: null,
      },
      {
        id: 'tt_ma_ub',
        title: 'Marktanalyse und -bearbeitung',
        short: 'Marktanalyse',
        type: 'ÜB',
        day: 0,
        start: '13:00',
        end: '13:45',
        room: '05.1.001 (EI)',
        lecturer: 'Schmengler',
        ects: 0,
        weekParity: 'all',
        color: 'plum',
        link: '',
        absences: 0,
        maxAbsences: null,
      },
      {
        id: 'tt_it_vl',
        title: 'Grundlagen der Informationstechnik',
        short: 'Informationstechnik',
        type: 'VL',
        day: 1,
        start: '10:00',
        end: '11:45',
        room: '04.E.007 (AM)',
        lecturer: 'Machmerth',
        ects: 5,
        weekParity: 'all',
        color: 'slate',
        link: 'https://moodle.hs-duesseldorf.de',
        absences: 0,
        maxAbsences: null,
      },
      {
        id: 'tt_ma1_ub',
        title: 'Mathematik I für WIE',
        short: 'Mathe I',
        type: 'ÜB',
        day: 1,
        start: '12:00',
        end: '13:45',
        room: '05.1.001 (EI)',
        lecturer: 'Kerkhoff, Kirchner',
        ects: 0,
        weekParity: 'all',
        color: 'terracotta',
        link: '',
        absences: 0,
        maxAbsences: null,
      },
      {
        id: 'tt_ma1_vl',
        title: 'Mathematik I für WIE',
        short: 'Mathe I',
        type: 'VL',
        day: 1,
        start: '14:00',
        end: '15:45',
        room: '05.1.001 (EI)',
        lecturer: 'Kerkhoff, Kirchner',
        ects: 5,
        weekParity: 'all',
        color: 'terracotta',
        link: 'https://moodle.hs-duesseldorf.de',
        absences: 0,
        maxAbsences: null,
      },
      {
        id: 'tt_it_ub',
        title: 'Grundlagen der Informationstechnik',
        short: 'Informationstechnik',
        type: 'ÜB',
        day: 1,
        start: '17:00',
        end: '18:45',
        room: '04.E.007 (AM)',
        lecturer: 'Machmerth',
        ects: 0,
        weekParity: 'all',
        color: 'slate',
        link: '',
        absences: 0,
        maxAbsences: null,
      },
      {
        id: 'tt_inf_vl',
        title: 'Grundlagen der Informatik I',
        short: 'Informatik I',
        type: 'VL',
        day: 2,
        start: '08:00',
        end: '09:45',
        room: '04.E.007 (AM)',
        lecturer: 'Mondwurf',
        ects: 5,
        weekParity: 'all',
        color: 'sage',
        link: 'https://moodle.hs-duesseldorf.de',
        absences: 0,
        maxAbsences: null,
      },
      {
        id: 'tt_inf_ub',
        title: 'Grundlagen der Informatik I',
        short: 'Informatik I',
        type: 'ÜB',
        day: 2,
        start: '10:00',
        end: '11:45',
        room: '04.E.007 (AM)',
        lecturer: 'Mondwurf',
        ects: 0,
        weekParity: 'all',
        color: 'sage',
        link: '',
        absences: 0,
        maxAbsences: null,
      },
      {
        id: 'tt_bwl_vl',
        title: 'Grundlagen der Betriebswirtschaftslehre',
        short: 'BWL',
        type: 'VL',
        day: 3,
        start: '15:00',
        end: '17:45',
        room: '04.E.007 (AM)',
        lecturer: 'Verhasselt',
        ects: 5,
        weekParity: 'all',
        color: 'ochre',
        link: 'https://moodle.hs-duesseldorf.de',
        absences: 0,
        maxAbsences: null,
      },
      {
        id: 'tt_bwl_ub',
        title: 'Grundlagen der Betriebswirtschaftslehre',
        short: 'BWL',
        type: 'ÜB',
        day: 3,
        start: '18:00',
        end: '18:45',
        room: '04.E.007 (AM)',
        lecturer: 'Verhasselt',
        ects: 0,
        weekParity: 'all',
        color: 'ochre',
        link: '',
        absences: 0,
        maxAbsences: null,
      },
      {
        id: 'tt_get_vl',
        title: 'Grundlagen der Elektrotechnik I für WIE',
        short: 'GET I',
        type: 'VL',
        day: 4,
        start: '12:00',
        end: '13:45',
        room: '05.1.001 (EI)',
        lecturer: 'Schoft',
        ects: 5,
        weekParity: 'all',
        color: 'sage',
        link: 'https://moodle.hs-duesseldorf.de',
        absences: 0,
        maxAbsences: null,
      },
      {
        id: 'tt_get_ub',
        title: 'Grundlagen der Elektrotechnik I für WIE',
        short: 'GET I',
        type: 'ÜB',
        day: 4,
        start: '14:00',
        end: '14:45',
        room: '05.1.001 (EI)',
        lecturer: 'Schoft',
        ects: 0,
        weekParity: 'all',
        color: 'sage',
        link: '',
        absences: 0,
        maxAbsences: null,
      },
    ],
    exams: [],
    calendarEvents: [
      {
        id: 'ev_g_ex_get',
        title: 'Klausur Grundlagen der Elektrotechnik I (WIE)',
        date: addDays(54),
        start: '09:00',
        end: '11:00',
        location: 'HSD · Gebäude 05 (Hörsaal)',
        notes: 'Beispiel-Termin — nach Google-Login erscheinen hier deine echten Klausuren.',
        source: 'google-demo',
        calendarName: 'Google Kalender (Beispiel)',
        color: 'google',
      },
      {
        id: 'ev_g_ex_mathe',
        title: 'Klausur Mathematik I für WIE',
        date: addDays(61),
        start: '10:00',
        end: '12:00',
        location: 'HSD · Hörsaal 05.1.001',
        notes: 'Beispiel-Termin aus Google Kalender',
        source: 'google-demo',
        calendarName: 'Google Kalender (Beispiel)',
        color: 'google',
      },
      {
        id: 'ev_g_ex_bwl',
        title: 'Klausur Grundlagen der BWL',
        date: addDays(68),
        start: '14:00',
        end: '15:30',
        location: 'HSD · Gebäude 04',
        notes: 'Beispiel-Termin aus Google Kalender',
        source: 'google-demo',
        calendarName: 'Google Kalender (Beispiel)',
        color: 'google',
      },
      {
        id: 'ev_prac_get',
        title: 'GET I Praktikum (einmalig im Semester)',
        date: addDays(11),
        start: '12:00',
        end: '15:45',
        location: '05.2.055 · Team GET I WIE',
        notes: 'Einmaliger Labortermin — Datum bei Bedarf im Kalender anpassen.',
        source: 'local',
        calendarName: 'Praktikum (1×)',
        color: 'sage',
      },
    ],
    googleEvents: [],
    tasks: [
      {
        id: 'tk_it_biweekly',
        title: 'Abgabe Grundlagen der Informationstechnik',
        course: 'Informationstechnik',
        due: nextInfoTechSun,
        dueTime: '23:59',
        recurrence: 'biweekly',
        recurrenceLabel: 'Alle 2 Wochen · So 24:00',
        streak: 0,
        lastCompleted: null,
        done: false,
      },
      {
        id: 'tk_mathe_weekly',
        title: 'Mathe I Arbeitsblatt für die Übung fertigmachen',
        course: 'Mathe I',
        due: nextTue,
        dueTime: '12:00',
        recurrence: 'weekly',
        recurrenceLabel: 'Jede Woche · Di 12:00 (zur Übung)',
        streak: 0,
        lastCompleted: null,
        done: false,
      },
      {
        id: 'tk_markt_weekly',
        title: 'Marktanalyse Aufgabe abgeben',
        course: 'Marktanalyse',
        due: nextFri,
        dueTime: '10:00',
        recurrence: 'weekly',
        recurrenceLabel: 'Jede Woche · Fr 10:00',
        streak: 0,
        lastCompleted: null,
        done: false,
      },
    ],
    grades: [],
    semesterPlan: [
      { id: 'sp_1', title: 'Grundlagen der Elektrotechnik I', ects: 5, targetGrade: 2.0 },
      { id: 'sp_2', title: 'Mathematik I für WIE', ects: 5, targetGrade: 2.3 },
      { id: 'sp_3', title: 'Grundlagen der Informationstechnik', ects: 5, targetGrade: 1.7 },
      { id: 'sp_4', title: 'Grundlagen der Informatik I', ects: 5, targetGrade: 2.0 },
      { id: 'sp_5', title: 'Grundlagen der BWL', ects: 5, targetGrade: 1.7 },
      { id: 'sp_6', title: 'Marktanalyse und -bearbeitung', ects: 5, targetGrade: 1.7 },
    ],
    flashcards: [
      {
        id: 'fc_1',
        course: 'BWL',
        front: 'Was ist der Unterschied zwischen Ökonomischem Minimal- und Maximalprinzip?',
        back: 'Minimalprinzip: Ein festes Ziel mit möglichst geringem Mitteleinsatz erreichen.\nMaximalprinzip: Mit gegebenen Mitteln den größtmöglichen Erfolg erzielen.',
        box: 1,
      },
      {
        id: 'fc_2',
        course: 'BWL',
        front: 'Wie berechnet sich der Stückdeckungsbeitrag (db) und die Break-Even-Menge?',
        back: 'db = Verkaufspreis (p) − variable Stückkosten (kᵥ)\nBreak-Even-Menge: x_BE = Fixkosten (K_f) / db',
        box: 1,
      },
      {
        id: 'fc_3',
        course: 'Marktanalyse',
        front: 'Was unterscheidet Primärforschung (Field Research) von Sekundärforschung (Desk Research)?',
        back: 'Primärforschung: Neue Daten speziell für die aktuelle Fragestellung erheben (Umfragen, Interviews).\nSekundärforschung: Bereits vorhandene Daten auswerten (Statistiken, Berichte, interne Zahlen).',
        box: 1,
      },
      {
        id: 'fc_4',
        course: 'Marktanalyse',
        front: 'Nenne die 4 Ps des Marketing-Mix (Instrumente der Marktbearbeitung).',
        back: '1. Product (Produktpolitik)\n2. Price (Preispolitik)\n3. Place (Distributionspolitik)\n4. Promotion (Kommunikationspolitik)',
        box: 1,
      },
      {
        id: 'fc_5',
        course: 'GET I',
        front: 'Wie lauten die 1. und 2. Kirchhoffsche Regel (Knoten- & Maschenregel)?',
        back: 'Knotenregel: Σ I = 0 (Summe zufließender = abfließender Ströme im Knoten).\nMaschenregel: Σ U = 0 (Summe aller Spannungen in einer geschlossenen Masche ist Null).',
        box: 1,
      },
      {
        id: 'fc_6',
        course: 'GET I',
        front: 'Wie lautet die Formel für den unbelasteten Spannungsteiler (R₁ und R₂ in Reihe)?',
        back: 'U₂ = U_ges · R₂ / (R₁ + R₂)\nMerke: Am größeren Widerstand fällt die größere Spannung ab.',
        box: 1,
      },
      {
        id: 'fc_7',
        course: 'GET I',
        front: 'Wie verhalten sich Widerstände vs. Kondensatoren in Reihen- und Parallelschaltung?',
        back: 'Widerstände: Reihe addiert sich (R₁+R₂), Parallel über Kehrwerte.\nKondensatoren genau umgekehrt: Parallel addiert sich (C₁+C₂), Reihe über Kehrwerte!',
        box: 1,
      },
      {
        id: 'fc_8',
        course: 'Informationstechnik',
        front: 'Wie rechnet man eine Dualzahl (Binär) schnell in Hexadezimal um?',
        back: 'Von rechts in 4er-Blöcke (Nibbles) gruppieren und jeden 4er-Block direkt in eine Hex-Ziffer (0–9, A–F) übersetzen.\nBeispiel: 1011 0101₂ = B5₁₆.',
        box: 1,
      },
      {
        id: 'fc_9',
        course: 'Informationstechnik',
        front: 'Wie lautet das De Morgansche Gesetz in der Digitaltechnik?',
        back: '¬(A ∧ B) = ¬A ∨ ¬B\n¬(A ∨ B) = ¬A ∧ ¬B\n(„Balken brechen, Zeichen drehen“)',
        box: 1,
      },
      {
        id: 'fc_10',
        course: 'Mathe I',
        front: 'Wie rechnet man eine komplexe Zahl z = a + j·b in die Polarform r · e^(jφ) um?',
        back: 'Betrag: r = √(a² + b²)\nWinkel: φ = arctan(b / a) — dabei den Quadranten beachten (bei a < 0 gilt +180° bzw. +π)!',
        box: 1,
      },
      {
        id: 'fc_11',
        course: 'Informatik I',
        front: 'Was ist der Unterschied zwischen Call-by-Value und Call-by-Reference?',
        back: 'Call-by-Value: Eine Kopie des Wertes wird übergeben — Änderungen wirken sich nicht auf das Original aus.\nCall-by-Reference: Eine Referenz/Adresse wird übergeben — Änderungen verändern direkt das Original.',
        box: 1,
      },
      {
        id: 'fc_12',
        course: 'Informatik I',
        front: 'Wann nutzt man eine while-Schleife vs. eine for-Schleife?',
        back: 'for-Schleife: Wenn die Anzahl der Durchläufe vorher bekannt ist (Zählschleife).\nwhile-Schleife: Wenn solange wiederholt wird, bis eine Bedingung nicht mehr erfüllt ist.',
        box: 1,
      },
    ],
    studySessions: [
      { id: 'ss_1', course: 'GET I', minutes: 50, date: today },
      { id: 'ss_2', course: 'Mathe I', minutes: 25, date: today },
    ],
    notes: [
      {
        id: 'nt_1',
        title: 'Campus Derendorf — Gebäude-Kürzel',
        course: 'HSD',
        content: '• 04.E.007 (AM) = Gebäude 4, Erdgeschoss (Audimax / Hörsaal)\n• 05.1.001 (EI) = Gebäude 5 (Elektrotechnik), 1. OG\n• 05.2.055 = Gebäude 5, 2. OG (GET I Praktikums-Labor)',
        updatedAt: today,
      },
    ],
    quickLinks: [
      {
        id: 'ql_moodle',
        label: 'HSD Moodle',
        sub: 'Skripte, Übungsblätter & Abgaben',
        url: 'https://moodle.hs-duesseldorf.de',
      },
      {
        id: 'ql_davinci',
        label: 'DaVinci Stundenplan (EI)',
        sub: 'Aktuelle Raumänderungen & Gruppen',
        url: 'https://davinci.ei.hs-duesseldorf.de',
      },
      {
        id: 'ql_ossc',
        label: 'HSD OSSC Portal',
        sub: 'Prüfungsanmeldung & Bescheinigungen',
        url: 'https://ossc.hs-duesseldorf.de',
      },
      {
        id: 'ql_mensa',
        label: 'Mensa Campus Derendorf',
        sub: 'Tagesmenü STW Düsseldorf',
        url: 'https://www.stw-d.de/gastronomie/speiseplaene/mensa-campus-derendorf/',
      },
      {
        id: 'ql_notebooklm',
        label: 'Google NotebookLM',
        sub: 'Alle deine Uni-Notebooks öffnen',
        url: 'https://notebooklm.google.com/',
      },
      {
        id: 'ql_gcal',
        label: 'Google Kalender',
        sub: 'Alle Termine & Klausuren öffnen',
        url: 'https://calendar.google.com',
      },
    ],
  };
}
