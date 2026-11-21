import {
  DEFAULT_SEMESTER_CONFIG,
  addDaysToISO,
  daysBetween,
  isoDate,
  parseISODate,
} from '../data/defaults.js';

export { DEFAULT_SEMESTER_CONFIG };

export function normalizeSemesterConfig(raw) {
  const base = DEFAULT_SEMESTER_CONFIG;
  if (!raw || typeof raw !== 'object') {
    return { ...base, holidays: base.holidays.map((h) => ({ ...h })) };
  }
  const holidays = Array.isArray(raw.holidays)
    ? raw.holidays.filter((h) => h && h.start && h.end)
    : base.holidays.map((h) => ({ ...h }));
  return {
    name: raw.name || base.name,
    lecturesStart: raw.lecturesStart || base.lecturesStart,
    lecturesEnd: raw.lecturesEnd || base.lecturesEnd,
    examPeriodStart: raw.examPeriodStart || base.examPeriodStart,
    examPeriodEnd: raw.examPeriodEnd || base.examPeriodEnd,
    examRegStart: raw.examRegStart || base.examRegStart,
    examRegEnd: raw.examRegEnd || base.examRegEnd,
    holidays,
  };
}

export function findHolidayForDate(dateIso, config = DEFAULT_SEMESTER_CONFIG) {
  const cfg = normalizeSemesterConfig(config);
  return cfg.holidays.find((h) => dateIso >= h.start && dateIso <= h.end) || null;
}

/**
 * Determines whether lectures/recurring submissions take place on a given ISO date.
 */
export function getSemesterDayStatus(dateIso = isoDate(), config = DEFAULT_SEMESTER_CONFIG) {
  const cfg = normalizeSemesterConfig(config);
  const holiday = findHolidayForDate(dateIso, cfg);
  if (holiday) {
    return {
      isLectureDay: false,
      phase: 'holiday',
      label: holiday.label,
      holiday,
    };
  }
  if (cfg.examPeriodStart && cfg.examPeriodEnd && dateIso >= cfg.examPeriodStart && dateIso <= cfg.examPeriodEnd) {
    return {
      isLectureDay: false,
      phase: 'exams',
      label: 'Prüfungszeitraum (vorlesungsfrei)',
      holiday: null,
    };
  }
  if (cfg.lecturesStart && dateIso < cfg.lecturesStart) {
    return {
      isLectureDay: false,
      phase: 'before',
      label: 'Vor Vorlesungsbeginn',
      holiday: null,
    };
  }
  if (cfg.lecturesEnd && dateIso > cfg.lecturesEnd) {
    return {
      isLectureDay: false,
      phase: 'after',
      label: 'Vorlesungsfreie Zeit',
      holiday: null,
    };
  }
  return {
    isLectureDay: true,
    phase: 'lectures',
    label: `Vorlesungszeit (${cfg.name})`,
    holiday: null,
  };
}

export function isExamRegistrationOpen(dateIso = isoDate(), config = DEFAULT_SEMESTER_CONFIG) {
  const cfg = normalizeSemesterConfig(config);
  if (!cfg.examRegStart || !cfg.examRegEnd) return false;
  return dateIso >= cfg.examRegStart && dateIso <= cfg.examRegEnd;
}

/**
 * Counts remaining non-holiday lecture weeks from `fromIso` through `lecturesEnd`.
 */
export function countRemainingLectureWeeks(fromIso = isoDate(), config = DEFAULT_SEMESTER_CONFIG) {
  const cfg = normalizeSemesterConfig(config);
  if (!cfg.lecturesEnd || fromIso > cfg.lecturesEnd) return 0;
  const startIso = cfg.lecturesStart && fromIso < cfg.lecturesStart ? cfg.lecturesStart : fromIso;
  let lectureWorkdays = 0;
  let cursor = startIso;
  let guard = 0;
  while (cursor <= cfg.lecturesEnd && guard < 366) {
    const d = parseISODate(cursor);
    const day = d.getDay(); // 0 Sun .. 6 Sat
    if (day >= 1 && day <= 5 && !findHolidayForDate(cursor, cfg)) {
      lectureWorkdays += 1;
    }
    cursor = addDaysToISO(cursor, 1);
    guard += 1;
  }
  return Math.ceil(lectureWorkdays / 5);
}

/**
 * Returns the next valid recurring task date starting at `baseIso + stepDays`,
 * skipping any dates falling inside configured semester holidays.
 * Also handles Sunday 24:00 deadlines that fall on the Sunday right after lecturesEnd (up to +2 days grace).
 */
export function nextLectureOccurrence(baseIso, stepDays, config = DEFAULT_SEMESTER_CONFIG) {
  const cfg = normalizeSemesterConfig(config);
  const step = Math.max(1, Number(stepDays || 7));
  let candidate = addDaysToISO(baseIso, step);
  let guard = 0;
  while (findHolidayForDate(candidate, cfg) && guard < 12) {
    candidate = addDaysToISO(candidate, step);
    guard += 1;
  }
  return candidate;
}

/**
 * Ensures an initial due date does not sit inside a holiday (advances if needed).
 */
export function adjustTaskDueForHolidays(dueIso, stepDays, config = DEFAULT_SEMESTER_CONFIG) {
  if (!dueIso) return dueIso;
  const cfg = normalizeSemesterConfig(config);
  const step = Math.max(1, Number(stepDays || 7));
  let candidate = dueIso;
  let guard = 0;
  while (findHolidayForDate(candidate, cfg) && guard < 12) {
    candidate = addDaysToISO(candidate, step);
    guard += 1;
  }
  return candidate;
}

/**
 * Expands a recurring task into concrete dates for the calendar view,
 * skipping holidays and stopping after lecturesEnd (+2 days grace for Sunday deadlines).
 */
export function expandRecurringTaskDates(task, config = DEFAULT_SEMESTER_CONFIG, maxCount = 12) {
  if (!task?.due) return [];
  const step = task.recurrence === 'weekly' ? 7 : task.recurrence === 'biweekly' ? 14 : 0;
  if (step === 0) return [task.due];

  const cfg = normalizeSemesterConfig(config);
  const cutoff = cfg.lecturesEnd ? addDaysToISO(cfg.lecturesEnd, 2) : null;
  const dates = [];
  let cursor = task.due;
  let safety = 0;

  while (dates.length < maxCount && safety < 40) {
    safety += 1;
    if (cutoff && cursor > cutoff) break;
    if (!findHolidayForDate(cursor, cfg)) {
      dates.push(cursor);
    }
    cursor = addDaysToISO(cursor, step);
  }
  return dates;
}

/**
 * Returns all occurrence dates of a recurring task that fall inside configured holidays
 * (used to emit RFC 5545 EXDATE lines for Google Calendar & .ics!).
 */
export function getHolidayExclusionDates(startIso, stepDays, config = DEFAULT_SEMESTER_CONFIG) {
  const cfg = normalizeSemesterConfig(config);
  if (!startIso || !cfg.lecturesEnd) return [];
  const step = Math.max(1, Number(stepDays || 7));
  const cutoff = addDaysToISO(cfg.lecturesEnd, 2);
  const excluded = [];
  let cursor = startIso;
  let safety = 0;

  while (cursor <= cutoff && safety < 60) {
    safety += 1;
    if (findHolidayForDate(cursor, cfg)) {
      excluded.push(cursor);
    }
    cursor = addDaysToISO(cursor, step);
  }
  return excluded;
}

/**
 * Compact German summary banner info for the semester status.
 */
export function getSemesterBannerInfo(todayIso = isoDate(), config = DEFAULT_SEMESTER_CONFIG) {
  const cfg = normalizeSemesterConfig(config);
  const status = getSemesterDayStatus(todayIso, cfg);
  const weeksLeft = countRemainingLectureWeeks(todayIso, cfg);
  const nextHoliday = cfg.holidays
    .filter((h) => h.end >= todayIso)
    .sort((a, b) => a.start.localeCompare(b.start))[0] || null;
  const daysToHoliday = nextHoliday ? daysBetween(nextHoliday.start, parseISODate(todayIso)) : null;
  const examRegActive = isExamRegistrationOpen(todayIso, cfg);

  return {
    status,
    weeksLeft,
    nextHoliday,
    daysToHoliday,
    examRegActive,
    config: cfg,
  };
}
