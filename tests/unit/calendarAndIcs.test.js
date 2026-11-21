import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_SEMESTER_CONFIG } from '../../src/data/defaults.js';
import { buildRecurringTaskEventPayload } from '../../src/services/googleCalendar.js';
import { buildRecurringTasksICS, parseICS } from '../../src/services/ics.js';

describe('Recurring Submission Series (Google Calendar & ICS)', () => {
  const sampleTasks = [
    {
      id: 'tk_markt_weekly',
      title: 'Marktanalyse Aufgabe abgeben',
      course: 'Marktanalyse',
      due: '2026-11-27',
      dueTime: '10:00',
      recurrence: 'weekly',
      recurrenceLabel: 'Jede Woche · Fr 10:00',
    },
    {
      id: 'tk_it_biweekly',
      title: 'Abgabe Informationstechnik',
      course: 'Informationstechnik',
      due: '2026-11-22',
      dueTime: '23:59',
      recurrence: 'biweekly',
      recurrenceLabel: 'Alle 2 Wochen · So 24:00',
    },
  ];

  it('builds Google Calendar recurring payload with 24h + 2h reminders and holiday EXDATE', () => {
    const payload = buildRecurringTaskEventPayload(sampleTasks[0], DEFAULT_SEMESTER_CONFIG, 'Europe/Berlin');
    assert.equal(payload.summary, 'Abgabe: Marktanalyse Aufgabe abgeben');
    assert.equal(payload.start.dateTime, '2026-11-27T09:30:00');
    assert.equal(payload.end.dateTime, '2026-11-27T10:00:00');
    assert.ok(payload.recurrence[0].startsWith('RRULE:FREQ=WEEKLY;INTERVAL=1;UNTIL=20270124T235959Z'));
    assert.ok(payload.recurrence[1].includes('EXDATE;TZID=Europe/Berlin:20261225T093000,20270101T093000'));
    assert.deepEqual(payload.reminders.overrides, [
      { method: 'popup', minutes: 1440 },
      { method: 'popup', minutes: 120 },
    ]);
  });

  it('builds biweekly Google Calendar payload for Sunday 24:00 deadline', () => {
    const payload = buildRecurringTaskEventPayload(sampleTasks[1], DEFAULT_SEMESTER_CONFIG, 'Europe/Berlin');
    assert.equal(payload.start.dateTime, '2026-11-22T23:29:00');
    assert.equal(payload.end.dateTime, '2026-11-22T23:59:00');
    assert.ok(payload.recurrence[0].includes('INTERVAL=2'));
  });

  it('generates valid recurring ICS with VALARM reminders & holiday EXDATE and roundtrips via parseICS', () => {
    const ics = buildRecurringTasksICS(sampleTasks, DEFAULT_SEMESTER_CONFIG);
    assert.ok(ics.includes('TRIGGER:-P1D'));
    assert.ok(ics.includes('TRIGGER:-PT2H'));
    assert.ok(ics.includes('EXDATE:20261225T093000,20270101T093000'));

    const parsed = parseICS(ics);
    assert.equal(parsed.length, 2);
    assert.equal(parsed[0].title, 'Abgabe: Marktanalyse Aufgabe abgeben');
    assert.equal(parsed[0].date, '2026-11-27');
  });
});
