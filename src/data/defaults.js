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
  const jsDay = date.getDay(); // 0=Sun..6=Sat
  return jsDay === 0 ? 6 : jsDay - 1; // 0=Mon..6=Sun
}

/** Find next date matching targetMonIdx (0=Mon..6=Sun) >= today */
export function nextWeekdayISO(targetMonIdx, fromDate = new Date()) {
  const cur = getMondayIndex(fromDate);
  let delta = (targetMonIdx - cur + 7) % 7;
  return addDays(delta, fromDate);
}

/** Advance a recurring anchor date forward in stepDays increments until >= today */
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

export function uid(prefix = 'id') {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

export function createDefaultState() {
  const today = isoDate();
  const nextTue = nextWeekdayISO(1); // Dienstag (Mathe I Arbeitsblatt)
  const nextFri = nextWeekdayISO(4); // Freitag (Marktanalyse Aufgabe)
  const nextInfoTechSun = nextOccurrenceFromAnchor('2026-11-22', 14); // 22. Nov 2026, dann alle 14 Tage

  return {
    version: 2,
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
      clientId: '',
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
    // Exakter Stundenplan aus davinci.ei.hs-duesseldorf.de (BEng-WIE-1, wöchentlich — ohne einmalige grüne Praktika)
    timetable: [
      {
        id: 'tt_ma_vl',
        title: 'Marktanalyse und -bearbeitung',
        short: 'Marktanalyse',
        type: 'VL',
        day: 0, // Mo
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
        day: 1, // Di
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
        day: 2, // Mi
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
        day: 3, // Do
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
        day: 4, // Fr
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
    // Manuelle Studia-Klausuren (leer im Standard, weil Klausuren direkt aus Google Kalender erkannt werden!)
    exams: [],
    // Demo-Termine (werden automatisch durch echte Google-Kalender-Termine ersetzt, sobald Google verbunden ist)
    calendarEvents: [
      {
        id: 'ev_g_ex_get',
        title: 'Klausur Grundlagen der Elektrotechnik I (WIE)',
        date: addDays(54),
        start: '09:00',
        end: '11:00',
        location: 'HSD · Gebäude 05 (Hörsaal)',
        notes: 'Beispiel-Termin aus Google Kalender — nach Google-Login erscheinen hier deine echten Klausuren.',
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
    // Echte wiederkehrende Abgaben + einmalige Aufgaben
    tasks: [
      {
        id: 'tk_it_biweekly',
        title: 'Abgabe Grundlagen der Informationstechnik',
        course: 'Informationstechnik',
        due: nextInfoTechSun,
        dueTime: '23:59',
        recurrence: 'biweekly', // once | weekly | biweekly
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
    // Erstsemester: noch 0 abgeschlossene Noten + 6 laufende 1.-Semester-Module für den Zielnoten-Planer
    grades: [],
    semesterPlan: [
      { id: 'sp_1', title: 'Grundlagen der Elektrotechnik I', ects: 5, targetGrade: 2.0 },
      { id: 'sp_2', title: 'Mathematik I für WIE', ects: 5, targetGrade: 2.3 },
      { id: 'sp_3', title: 'Grundlagen der Informationstechnik', ects: 5, targetGrade: 1.7 },
      { id: 'sp_4', title: 'Grundlagen der Informatik I', ects: 5, targetGrade: 2.0 },
      { id: 'sp_5', title: 'Grundlagen der BWL', ects: 5, targetGrade: 1.7 },
      { id: 'sp_6', title: 'Marktanalyse und -bearbeitung', ects: 5, targetGrade: 1.7 },
    ],
    // Mini-Karteikarten für unterwegs auf dem Pixel 8 (1. Semester WIE)
    flashcards: [
      {
        id: 'fc_1',
        course: 'BWL',
        front: 'Was ist der Unterschied zwischen Ökonomischem Minimal- und Maximalprinzip?',
        back: 'Minimalprinzip: Ein festes Ziel mit möglichst geringem Mitteleinsatz erreichen.\nMaximalprinzip: Mit gegebenen Mitteln den größtmöglichen Erfolg erzielen.',
        box: 1, // 1=Neu, 2=Üben, 3=Sicher
      },
      {
        id: 'fc_2',
        course: 'BWL',
        front: 'Wie berechnet sich der Stückdeckungsbeitrag (db) und die Break-Even-Menge?',
        back: 'db = Verkaufspreis (p) − variable Stückkosten (kv)\nBreak-Even-Menge: x_BE = Fixkosten (Kf) / db',
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
        back: 'Knotenregel: Die Summe aller zufließenden Ströme in einem Knoten ist gleich der Summe der abfließenden Ströme (Σ I = 0).\nMaschenregel: Die Summe aller Spannungen in einer geschlossenen Masche ist Null (Σ U = 0).',
        box: 1,
      },
      {
        id: 'fc_6',
        course: 'GET I',
        front: 'Wie lautet die Formel für den unbelasteten Spannungsteiler (R₁ und R₂ in Reihe)?',
        back: 'U₂ = U_ges · R₂ / (R₁ + R₂)\nMerke: An dem größeren Widerstand fällt die größere Spannung ab.',
        box: 1,
      },
      {
        id: 'fc_7',
        course: 'GET I',
        front: 'Wie verhalten sich Widerstände vs. Kondensatoren in Reihen- und Parallelschaltung?',
        back: 'Widerstände: Reihe addiert sich (R₁+R₂), Parallel über Kehrwerte (1/R = 1/R₁ + 1/R₂).\nKondensatoren genau umgekehrt: Parallel addiert sich (C₁+C₂), Reihe über Kehrwerte!',
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
        back: 'Betrag: r = √(a² + b²)\nWinkel: φ = arctan(b / a) — dabei den Quadranten beachten (bei a < 0 gilt +π bzw. +180°)!',
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
        title: 'Abgabe-Rhythmus im Überblick',
        course: 'Orga',
        content: '• Marktanalyse: jeden Freitag 10:00 Uhr\n• Informationstechnik (Machmerth): alle 2 Wochen Sonntag 24:00 Uhr (22. Nov., 6. Dez., …)\n• Mathe I: jede Woche bis Dienstag 12:00 Uhr zur Übung',
        updatedAt: today,
      },
      {
        id: 'nt_2',
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
        id: 'ql_gcal',
        label: 'Google Kalender',
        sub: 'Alle Termine & Klausuren öffnen',
        url: 'https://calendar.google.com',
      },
    ],
  };
}
