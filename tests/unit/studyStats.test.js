import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { computeStudyAnalytics, computeStudyStreak } from '../../src/utils/studyStats.js';

describe('Study Time Analytics & Streak', () => {
  it('computes consecutive day streak ending today or yesterday', () => {
    const sessions = [
      { course: 'GET I', minutes: 30, date: '2026-11-19' },
      { course: 'Mathe I', minutes: 45, date: '2026-11-20' },
      { course: 'BWL', minutes: 25, date: '2026-11-21' },
    ];
    const s1 = computeStudyStreak(sessions, '2026-11-21');
    assert.equal(s1.current, 3);
    assert.equal(s1.studiedToday, true);

    // Next day before first session still keeps streak alive from yesterday
    const s2 = computeStudyStreak(sessions, '2026-11-22');
    assert.equal(s2.current, 3);
    assert.equal(s2.studiedToday, false);

    // Gap of 2 days breaks streak
    const s3 = computeStudyStreak(sessions, '2026-11-23');
    assert.equal(s3.current, 0);
  });

  it('tracks weekly goal, 7-day bars, and detects neglected official modules', () => {
    const modules = [
      { courseKey: 'GET I', short: 'GET I', color: 'sage' },
      { courseKey: 'Mathe I', short: 'Mathe I', color: 'terracotta' },
      { courseKey: 'BWL', short: 'BWL', color: 'ochre' },
    ];
    const sessions = [
      { course: 'GET I', minutes: 120, date: '2026-11-16' }, // Mon
      { course: 'Mathe I', minutes: 60, date: '2026-11-21' }, // Sat
      { course: 'GET I', minutes: 90, date: '2026-11-05' }, // Previous month
    ];
    const stats = computeStudyAnalytics(sessions, modules, 360, '2026-11-21');
    assert.equal(stats.weekMinutes, 180);
    assert.equal(stats.totalMinutes, 270);
    assert.equal(stats.weekGoalPct, 50);
    assert.equal(stats.remainingGoalMin, 180);
    assert.equal(stats.weekDays.length, 7);
    assert.equal(stats.weekDays[0].minutes, 120); // Mo
    assert.equal(stats.weekDays[5].minutes, 60); // Sa
    assert.equal(stats.leastStudied.courseKey, 'BWL');
    assert.equal(stats.leastStudied.weekMinutes, 0);
  });
});
