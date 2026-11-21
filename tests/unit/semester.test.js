import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_SEMESTER_CONFIG,
  countRemainingLectureWeeks,
  expandRecurringTaskDates,
  getHolidayExclusionDates,
  getSemesterDayStatus,
  isExamRegistrationOpen,
  nextLectureOccurrence,
} from '../../src/utils/semester.js';

describe('HSD Semester & Holiday Calendar', () => {
  it('recognizes regular lecture day in November 2026', () => {
    const status = getSemesterDayStatus('2026-11-24', DEFAULT_SEMESTER_CONFIG);
    assert.equal(status.isLectureDay, true);
    assert.equal(status.phase, 'lectures');
  });

  it('pauses lectures during Weihnachtsferien (23.12.2026 – 03.01.2027)', () => {
    for (const d of ['2026-12-23', '2026-12-25', '2026-12-31', '2027-01-03']) {
      const status = getSemesterDayStatus(d, DEFAULT_SEMESTER_CONFIG);
      assert.equal(status.isLectureDay, false, `${d} must be vorlesungsfrei`);
      assert.equal(status.phase, 'holiday');
    }
    const resume = getSemesterDayStatus('2027-01-04', DEFAULT_SEMESTER_CONFIG);
    assert.equal(resume.isLectureDay, true);
  });

  it('detects Prüfungszeitraum after lecturesEnd (22.01.2027)', () => {
    const lastLecture = getSemesterDayStatus('2027-01-22', DEFAULT_SEMESTER_CONFIG);
    assert.equal(lastLecture.isLectureDay, true);

    const examDay = getSemesterDayStatus('2027-01-26', DEFAULT_SEMESTER_CONFIG);
    assert.equal(examDay.isLectureDay, false);
    assert.equal(examDay.phase, 'exams');
  });

  it('detects active eCampus Prüfungsanmeldung (16.11.–30.11.2026)', () => {
    assert.equal(isExamRegistrationOpen('2026-11-21', DEFAULT_SEMESTER_CONFIG), true);
    assert.equal(isExamRegistrationOpen('2026-12-02', DEFAULT_SEMESTER_CONFIG), false);
  });

  it('skips Weihnachtsferien when advancing recurring tasks', () => {
    // Weekly Friday Marktanalyse: Dec 18 + 7d = Dec 25 (holiday!) -> Jan 1 (holiday!) -> Jan 8
    const nextFri = nextLectureOccurrence('2026-12-18', 7, DEFAULT_SEMESTER_CONFIG);
    assert.equal(nextFri, '2027-01-08');

    // Weekly Tuesday Mathe I: Dec 22 + 7d = Dec 29 (holiday!) -> Jan 5
    const nextTue = nextLectureOccurrence('2026-12-22', 7, DEFAULT_SEMESTER_CONFIG);
    assert.equal(nextTue, '2027-01-05');
  });

  it('expands recurring tasks without holiday dates and stops after lecturesEnd', () => {
    const marktanalyse = {
      due: '2026-12-11',
      recurrence: 'weekly',
    };
    const dates = expandRecurringTaskDates(marktanalyse, DEFAULT_SEMESTER_CONFIG, 12);
    assert.deepEqual(dates, [
      '2026-12-11',
      '2026-12-18',
      '2027-01-08',
      '2027-01-15',
      '2027-01-22',
    ]);
    assert.equal(dates.includes('2026-12-25'), false);
    assert.equal(dates.includes('2027-01-01'), false);
    assert.equal(dates.includes('2027-01-29'), false);
  });

  it('computes holiday EXDATE list for Google Calendar / ICS series', () => {
    const ex = getHolidayExclusionDates('2026-11-27', 7, DEFAULT_SEMESTER_CONFIG);
    assert.deepEqual(ex, ['2026-12-25', '2027-01-01']);
  });

  it('counts remaining non-holiday lecture weeks accurately', () => {
    const weeksFromNov21 = countRemainingLectureWeeks('2026-11-21', DEFAULT_SEMESTER_CONFIG);
    assert.ok(weeksFromNov21 >= 7 && weeksFromNov21 <= 8, `Expected 7-8 weeks, got ${weeksFromNov21}`);
    assert.equal(countRemainingLectureWeeks('2027-01-25', DEFAULT_SEMESTER_CONFIG), 0);
  });
});
