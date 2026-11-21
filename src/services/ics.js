import {
  addDaysToISO,
  addMinutesToTime,
  isoDate,
  parseISODate,
  uid,
} from '../data/defaults.js';
import { getHolidayExclusionDates, normalizeSemesterConfig } from '../utils/semester.js';

const ICS_DAYS = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'];

function escapeICS(str = '') {
  return String(str)
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;');
}

function toICSDateTime(dateIso, hhmm = '09:00') {
  const cleanDate = dateIso.replace(/-/g, '');
  const cleanTime = `${hhmm.replace(':', '')}00`;
  return `${cleanDate}T${cleanTime}`;
}

function downloadFile(filename, content, mime = 'text/calendar;charset=utf-8') {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(url);
    a.remove();
  }, 300);
}

export function exportExamsToICS(exams) {
  const nowStamp = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Studia Uni PWA//DE',
    'CALSCALE:GREGORIAN',
    'X-WR-CALNAME:Studia Klausuren',
  ];

  for (const ex of exams.filter((e) => !e.completed)) {
    const start = toICSDateTime(ex.date, ex.time || '09:00');
    const end = toICSDateTime(ex.date, addMinutesToTime(ex.time || '09:00', ex.durationMin || 90));
    lines.push(
      'BEGIN:VEVENT',
      `UID:${ex.id}@studia.app`,
      `DTSTAMP:${nowStamp}`,
      `DTSTART:${start}`,
      `DTEND:${end}`,
      `SUMMARY:${escapeICS(`Klausur: ${ex.title}`)}`,
      `LOCATION:${escapeICS(ex.room || '')}`,
      `DESCRIPTION:${escapeICS(`${ex.ects} ECTS · ${ex.attempt}. Versuch${ex.aids ? ` · Hilfsmittel: ${ex.aids}` : ''}`)}`,
      'BEGIN:VALARM',
      'TRIGGER:-P7D',
      'ACTION:DISPLAY',
      `DESCRIPTION:${escapeICS(`In 7 Tagen: Klausur ${ex.title}`)}`,
      'END:VALARM',
      'BEGIN:VALARM',
      'TRIGGER:-P1D',
      'ACTION:DISPLAY',
      `DESCRIPTION:${escapeICS(`Morgen: Klausur ${ex.title}`)}`,
      'END:VALARM',
      'END:VEVENT'
    );
  }

  lines.push('END:VCALENDAR');
  downloadFile('studia-klausuren.ics', lines.join('\r\n'));
}

export function exportTimetableToICS(timetable, weeksCount = 14) {
  const now = new Date();
  const jsDay = now.getDay();
  const mondayOffset = jsDay === 0 ? -6 : 1 - jsDay;
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() + mondayOffset);
  const nowStamp = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Studia Uni PWA//DE',
    'CALSCALE:GREGORIAN',
    'X-WR-CALNAME:Studia Stundenplan',
  ];

  for (const item of timetable) {
    const firstDate = new Date(monday);
    firstDate.setDate(monday.getDate() + Number(item.day || 0));
    const dateStr = isoDate(firstDate);
    const interval = item.weekParity === 'all' ? 1 : 2;
    const count = item.weekParity === 'all' ? weeksCount : Math.ceil(weeksCount / 2);

    lines.push(
      'BEGIN:VEVENT',
      `UID:${item.id}@studia.app`,
      `DTSTAMP:${nowStamp}`,
      `DTSTART:${toICSDateTime(dateStr, item.start || '08:00')}`,
      `DTEND:${toICSDateTime(dateStr, item.end || '09:30')}`,
      `RRULE:FREQ=WEEKLY;INTERVAL=${interval};BYDAY=${ICS_DAYS[item.day] || 'MO'};COUNT=${count}`,
      `SUMMARY:${escapeICS(`[${item.type}] ${item.title}`)}`,
      `LOCATION:${escapeICS(item.room || '')}`,
      `DESCRIPTION:${escapeICS(item.lecturer ? `Dozent:in: ${item.lecturer}` : '')}`,
      'END:VEVENT'
    );
  }

  lines.push('END:VCALENDAR');
  downloadFile('studia-stundenplan.ics', lines.join('\r\n'));
}

/**
 * Pure builder for recurring submission .ics with RRULE, UNTIL, holiday EXDATE, and 2 VALARMs.
 */
export function buildRecurringTasksICS(tasks, semesterConfig) {
  const cfg = normalizeSemesterConfig(semesterConfig);
  const nowStamp = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  const untilIso = addDaysToISO(cfg.lecturesEnd || '2027-01-22', 2);
  const untilStamp = `${untilIso.replace(/-/g, '')}T235959Z`;

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Studia Uni PWA//DE',
    'CALSCALE:GREGORIAN',
    'X-WR-CALNAME:Studia Abgaben',
  ];

  for (const tk of (tasks || []).filter(
    (t) => t.due && (t.recurrence === 'weekly' || t.recurrence === 'biweekly')
  )) {
    const dueTime = tk.dueTime && /^\d{2}:\d{2}$/.test(tk.dueTime) ? tk.dueTime : '23:59';
    const startTime = addMinutesToTime(dueTime, -30);
    const interval = tk.recurrence === 'biweekly' ? 2 : 1;
    const exDates = getHolidayExclusionDates(tk.due, interval * 7, cfg);

    lines.push(
      'BEGIN:VEVENT',
      `UID:${tk.id}@studia.app`,
      `DTSTAMP:${nowStamp}`,
      `DTSTART:${toICSDateTime(tk.due, startTime)}`,
      `DTEND:${toICSDateTime(tk.due, dueTime)}`,
      `RRULE:FREQ=WEEKLY;INTERVAL=${interval};UNTIL=${untilStamp}`
    );

    if (exDates.length > 0) {
      const exStr = exDates.map((d) => toICSDateTime(d, startTime)).join(',');
      lines.push(`EXDATE:${exStr}`);
    }

    lines.push(
      `SUMMARY:${escapeICS(`Abgabe: ${tk.title}`)}`,
      `LOCATION:${escapeICS(tk.course || '')}`,
      `DESCRIPTION:${escapeICS(tk.recurrenceLabel || 'Wiederkehrende Semester-Abgabe')}`,
      'BEGIN:VALARM',
      'TRIGGER:-P1D',
      'ACTION:DISPLAY',
      `DESCRIPTION:${escapeICS(`Morgen fällig: ${tk.title}`)}`,
      'END:VALARM',
      'BEGIN:VALARM',
      'TRIGGER:-PT2H',
      'ACTION:DISPLAY',
      `DESCRIPTION:${escapeICS(`In 2 Stunden fällig: ${tk.title}`)}`,
      'END:VALARM',
      'END:VEVENT'
    );
  }

  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}

export function exportRecurringTasksToICS(tasks, semesterConfig) {
  const content = buildRecurringTasksICS(tasks, semesterConfig);
  downloadFile('studia-abgaben.ics', content);
}

export function exportSingleEventToICS({ title, date, start, end, location, notes }) {
  const nowStamp = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  const startT = start && /^\d{2}:\d{2}$/.test(start) ? start : '09:00';
  const endT = end && /^\d{2}:\d{2}$/.test(end) ? end : addMinutesToTime(startT, 60);
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Studia Uni PWA//DE',
    'BEGIN:VEVENT',
    `UID:${uid('ev')}@studia.app`,
    `DTSTAMP:${nowStamp}`,
    `DTSTART:${toICSDateTime(date, startT)}`,
    `DTEND:${toICSDateTime(date, endT)}`,
    `SUMMARY:${escapeICS(title)}`,
    `LOCATION:${escapeICS(location || '')}`,
    `DESCRIPTION:${escapeICS(notes || '')}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 32) || 'termin';
  downloadFile(`${slug}.ics`, lines.join('\r\n'));
}

export function parseICS(icsText) {
  const unfolded = icsText.replace(/\r\n[ \t]/g, '').replace(/\n[ \t]/g, '');
  const lines = unfolded.split(/\r?\n/);

  const events = [];
  let current = null;

  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') {
      current = {};
      continue;
    }
    if (line === 'END:VEVENT' && current) {
      if (current.title && current.date) {
        events.push(current);
      }
      current = null;
      continue;
    }
    if (!current) continue;

    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;
    const keyPart = line.slice(0, colonIdx);
    const val = line
      .slice(colonIdx + 1)
      .replace(/\\n/g, '\n')
      .replace(/\\,/g, ',')
      .replace(/\\;/g, ';')
      .replace(/\\\\/g, '\\')
      .trim();
    const key = keyPart.split(';')[0].toUpperCase();

    if (key === 'SUMMARY') current.title = val;
    else if (key === 'LOCATION') current.location = val;
    else if (key === 'DESCRIPTION') current.notes = val;
    else if (key === 'RRULE') current.rrule = val;
    else if (key === 'DTSTART') {
      const parsed = parseICSDateVal(val);
      if (parsed) {
        current.date = parsed.date;
        current.start = parsed.time;
      }
    } else if (key === 'DTEND') {
      const parsed = parseICSDateVal(val);
      if (parsed) {
        current.end = parsed.time;
      }
    }
  }

  return events;
}

function parseICSDateVal(val) {
  const m = val.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?/);
  if (!m) return null;
  const [, y, mo, d, hh, mm, , isUtc] = m;
  if (hh !== undefined && mm !== undefined) {
    if (isUtc) {
      const dt = new Date(Date.UTC(+y, +mo - 1, +d, +hh, +mm));
      return {
        date: isoDate(dt),
        time: `${String(dt.getHours()).padStart(2, '0')}:${String(dt.getMinutes()).padStart(2, '0')}`,
      };
    }
    return { date: `${y}-${mo}-${d}`, time: `${hh}:${mm}` };
  }
  return { date: `${y}-${mo}-${d}`, time: 'Ganztägig' };
}

export function inferTimetableEntriesFromICS(parsedEvents) {
  const seen = new Set();
  const results = [];
  const palette = ['sage', 'slate', 'terracotta', 'ochre', 'plum'];
  let colorIdx = 0;

  for (const ev of parsedEvents) {
    if (!ev.start || ev.start === 'Ganztägig') continue;
    const d = parseISODate(ev.date);
    const jsDay = d.getDay();
    const monIdx = jsDay === 0 ? 6 : jsDay - 1;
    if (monIdx > 5) continue;

    const sig = `${ev.title}|${monIdx}|${ev.start}`;
    if (seen.has(sig)) continue;
    seen.add(sig);

    const upper = ev.title.toUpperCase();
    let type = 'VL';
    if (upper.includes('ÜBUNG') || upper.includes('[ÜB]') || upper.includes('UEBUNG')) type = 'ÜB';
    else if (upper.includes('TUTOR')) type = 'TUT';
    else if (upper.includes('SEMINAR') || upper.includes('[SEM]')) type = 'SEM';
    else if (upper.includes('PRAKTIKUM') || upper.includes('[PR]')) type = 'PR';

    const cleanTitle = ev.title.replace(/^\[(VL|ÜB|TUT|SEM|PR|LAB)\]\s*/i, '').trim();

    results.push({
      id: uid('tt'),
      title: cleanTitle,
      short: cleanTitle.split(/\s+/).slice(0, 2).join(' ').slice(0, 14),
      type,
      day: monIdx,
      start: ev.start,
      end: ev.end && ev.end > ev.start ? ev.end : addMinutesToTime(ev.start, 90),
      room: ev.location || '',
      lecturer: '',
      ects: 0,
      weekParity: ev.rrule?.includes('INTERVAL=2') ? 'even' : 'all',
      color: palette[colorIdx++ % palette.length],
      link: '',
      absences: 0,
      maxAbsences: null,
    });
  }

  return results;
}
