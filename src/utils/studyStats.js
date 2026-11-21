import { WEEKDAYS_SHORT, addDaysToISO, getMondayIndex, isoDate, parseISODate } from '../data/defaults.js';

export const DEFAULT_WEEKLY_GOAL_MIN = 600; // 10 Stunden pro Woche

/**
 * Computes Monday (start) and Sunday (end) ISO dates for the week containing `refIso`.
 */
export function getWeekBounds(refIso = isoDate()) {
  const d = parseISODate(refIso);
  const monIdx = getMondayIndex(d);
  const mondayIso = addDaysToISO(refIso, -monIdx);
  const sundayIso = addDaysToISO(mondayIso, 6);
  return { mondayIso, sundayIso };
}

/**
 * Computes consecutive study day streak ending on `todayIso` (or yesterday if not studied yet today).
 */
export function computeStudyStreak(studySessions, todayIso = isoDate()) {
  const daysWithStudy = new Set();
  for (const s of studySessions || []) {
    if (s?.date && Number(s.minutes || 0) > 0) {
      daysWithStudy.add(s.date);
    }
  }
  if (daysWithStudy.size === 0) return { current: 0, studiedToday: false };

  const studiedToday = daysWithStudy.has(todayIso);
  let cursor = studiedToday ? todayIso : addDaysToISO(todayIso, -1);
  let streak = 0;

  while (daysWithStudy.has(cursor) && streak < 365) {
    streak += 1;
    cursor = addDaysToISO(cursor, -1);
  }

  return { current: streak, studiedToday };
}

/**
 * Builds complete study analytics: weekly goal progress, streak, 7-day breakdown,
 * and per-module stats (including modules with 0 min so neglected subjects stand out!).
 */
export function computeStudyAnalytics(
  studySessions = [],
  modules = [],
  weeklyGoalMin = DEFAULT_WEEKLY_GOAL_MIN,
  todayIso = isoDate()
) {
  const goal = Math.max(30, Number(weeklyGoalMin || DEFAULT_WEEKLY_GOAL_MIN));
  const { mondayIso, sundayIso } = getWeekBounds(todayIso);
  const streak = computeStudyStreak(studySessions, todayIso);

  const totalByCourse = new Map();
  const weekByCourse = new Map();
  const byDate = new Map();

  let totalMinutes = 0;
  let weekMinutes = 0;
  let todayMinutes = 0;

  for (const s of studySessions || []) {
    const mins = Math.max(0, Number(s?.minutes || 0));
    if (!mins) continue;
    const course = s.course || 'Allgemein';
    totalMinutes += mins;
    totalByCourse.set(course, (totalByCourse.get(course) || 0) + mins);

    if (s.date) {
      byDate.set(s.date, (byDate.get(s.date) || 0) + mins);
      if (s.date === todayIso) todayMinutes += mins;
      if (s.date >= mondayIso && s.date <= sundayIso) {
        weekMinutes += mins;
        weekByCourse.set(course, (weekByCourse.get(course) || 0) + mins);
      }
    }
  }

  // Current week daily bars (Mo .. So)
  const weekDays = [];
  for (let i = 0; i < 7; i++) {
    const dIso = addDaysToISO(mondayIso, i);
    weekDays.push({
      iso: dIso,
      label: WEEKDAYS_SHORT[i],
      minutes: byDate.get(dIso) || 0,
      isToday: dIso === todayIso,
      isFuture: dIso > todayIso,
    });
  }

  // Per-module breakdown covering all configured WIE modules + any extra logged courses
  const seenKeys = new Set();
  const moduleStats = [];

  for (const mod of modules || []) {
    const key = mod.courseKey;
    seenKeys.add(key);
    moduleStats.push({
      courseKey: key,
      short: mod.short || key,
      color: mod.color || 'sage',
      weekMinutes: weekByCourse.get(key) || 0,
      totalMinutes: totalByCourse.get(key) || 0,
      isOfficialModule: true,
    });
  }

  for (const [key, mins] of totalByCourse.entries()) {
    if (seenKeys.has(key)) continue;
    moduleStats.push({
      courseKey: key,
      short: key,
      color: 'slate',
      weekMinutes: weekByCourse.get(key) || 0,
      totalMinutes: mins,
      isOfficialModule: false,
    });
  }

  // Sort by week minutes desc, then total minutes desc
  moduleStats.sort((a, b) => {
    if (b.weekMinutes !== a.weekMinutes) return b.weekMinutes - a.weekMinutes;
    return b.totalMinutes - a.totalMinutes;
  });

  // Identify least-studied official module this week
  const officialMods = moduleStats.filter((m) => m.isOfficialModule);
  const leastStudied =
    officialMods.length > 0
      ? [...officialMods].sort((a, b) => {
          if (a.weekMinutes !== b.weekMinutes) return a.weekMinutes - b.weekMinutes;
          return a.totalMinutes - b.totalMinutes;
        })[0]
      : null;

  const weekGoalPct = Math.min(100, Math.round((weekMinutes / goal) * 100));
  const remainingGoalMin = Math.max(0, goal - weekMinutes);

  return {
    todayMinutes,
    weekMinutes,
    totalMinutes,
    weeklyGoalMin: goal,
    weekGoalPct,
    remainingGoalMin,
    streak,
    weekDays,
    moduleStats,
    leastStudied,
    mondayIso,
    sundayIso,
  };
}
