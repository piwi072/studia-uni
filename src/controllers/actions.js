import {
  DEFAULT_SEMESTER_CONFIG,
  formatShortDateDE,
  isoDate,
  parseISODate,
  uid,
} from '../data/defaults.js';
import { focusTimer } from '../services/focusTimer.js';
import { setGeminiApiKey } from '../services/geminiTutor.js';
import {
  clearPersistedSession,
  connectGoogleAccount,
  disconnectGoogleAccount,
  pushAllRecurringTasksToGoogle,
  pushEventToGoogle,
  pushRecurringTaskToGoogle,
  startGoogleRedirectLogin,
  syncGoogleCalendars,
} from '../services/googleCalendar.js';
import { syncWithGoogleDrive } from '../services/googleDriveSync.js';
import {
  exportExamsToICS,
  exportRecurringTasksToICS,
  exportSingleEventToICS,
  exportTimetableToICS,
  inferTimetableEntriesFromICS,
  parseICS,
} from '../services/ics.js';
import {
  addMinutesToTime,
  getUnifiedExams,
  isGoogleEventExam,
  store,
} from '../state/store.js';
import { vibrate } from '../utils/html.js';
import { nextLectureOccurrence } from '../utils/semester.js';
import { rateCard } from '../utils/spacedRepetition.js';

export function pickFile(accept, onLoad) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = accept;
  input.onchange = () => {
    const file = input.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => onLoad(String(reader.result || ''), file.name);
    reader.readAsText(file, 'utf-8');
  };
  input.click();
}

export function mutateExamById(examId, fn) {
  store.update((s) => {
    if (examId.startsWith('gex_')) {
      const gKey = examId.slice(4);
      s.google.examMetaByGoogleId = s.google.examMetaByGoogleId || {};
      if (!s.google.examMetaByGoogleId[gKey]) {
        s.google.examMetaByGoogleId[gKey] = {
          ects: 5,
          attempt: 1,
          aids: '',
          color: 'sage',
          completed: false,
          grade: null,
          topics: [],
        };
      }
      fn(s.google.examMetaByGoogleId[gKey], true, gKey);
    } else {
      const ex = s.exams.find((x) => x.id === examId);
      if (ex) fn(ex, false, null);
    }
  });
}

export function createActionHandlers({ ui, render, showToast }) {
  async function handleClick(e) {
    const navBtn = e.target.closest('[data-nav]');
    if (navBtn) {
      vibrate(8);
      ui.tab = navBtn.dataset.nav;
      if (navBtn.dataset.sub) ui.toolkitSub = navBtn.dataset.sub;
      window.scrollTo({ top: 0, behavior: 'smooth' });
      render();
      return;
    }

    const actionEl = e.target.closest('[data-action]');
    if (!actionEl) return;
    const action = actionEl.dataset.action;

    if (action === 'backdrop-close') {
      if (e.target === actionEl) {
        ui.modal = null;
        render();
      }
      return;
    }
    if (action === 'close-modal') {
      ui.modal = null;
      render();
      return;
    }
    if (action === 'open-modal') {
      vibrate(8);
      ui.modal = {
        type: actionEl.dataset.modal,
        id: actionEl.dataset.id || null,
        date: actionEl.dataset.date || null,
      };
      render();
      return;
    }
    if (action === 'pick-swatch') {
      const row = actionEl.closest('.color-picker-row');
      row?.querySelectorAll('.color-swatch').forEach((s) => s.classList.remove('selected'));
      actionEl.classList.add('selected');
      return;
    }
    if (action === 'toggle-theme') {
      vibrate(8);
      store.update((s) => {
        s.theme = s.theme === 'dark' ? 'light' : 'dark';
      });
      return;
    }

    /* Jump directly to due flashcards in Modules tab */
    if (action === 'open-due-cards') {
      vibrate(8);
      ui.tab = 'toolkit';
      ui.toolkitSub = 'modules';
      if (actionEl.dataset.modId) ui.selectedModuleId = actionEl.dataset.modId;
      ui.cardDueOnly = true;
      ui.cardIndex = 0;
      ui.cardFlipped = false;
      window.scrollTo({ top: 0, behavior: 'smooth' });
      render();
      return;
    }

    /* Module selector & module file import */
    if (action === 'select-module') {
      vibrate(6);
      ui.selectedModuleId = actionEl.dataset.id;
      ui.cardIndex = 0;
      ui.cardFlipped = false;
      ui.tutorError = '';
      render();
      return;
    }
    if (action === 'import-module-file') {
      const modId = actionEl.dataset.id;
      pickFile('.md,.txt,text/markdown,text/plain', (text, filename) => {
        const clean = text.trim();
        if (!clean) return;
        store.update((s) => {
          const mod = (s.modules || []).find((m) => m.id === modId);
          if (!mod) return;
          mod.notebookNotes = mod.notebookNotes || [];
          mod.notebookNotes.unshift({
            id: uid('nn'),
            title: filename.replace(/\.(md|txt)$/i, ''),
            content: clean.slice(0, 12000),
            updatedAt: isoDate(),
          });
        });
        showToast(`„${filename}“ im Modul gespeichert!`);
      });
      return;
    }
    if (action === 'delete-module-note') {
      const { modId, noteId } = actionEl.dataset;
      store.update((s) => {
        const mod = (s.modules || []).find((m) => m.id === modId);
        if (mod) mod.notebookNotes = (mod.notebookNotes || []).filter((n) => n.id !== noteId);
      });
      return;
    }

    /* Gemini AI Tutor actions */
    if (action === 'set-tutor-mode') {
      vibrate(6);
      ui.tutorMode = actionEl.dataset.value;
      ui.tutorError = '';
      render();
      return;
    }
    if (action === 'tutor-clear') {
      const modId = actionEl.dataset.modId;
      if (ui.tutorResultByModule) delete ui.tutorResultByModule[modId];
      ui.tutorError = '';
      render();
      return;
    }
    if (action === 'tutor-accept-cards') {
      const modId = actionEl.dataset.modId;
      const res = ui.tutorResultByModule?.[modId];
      if (!res?.cards?.length) return;
      store.update((s) => {
        s.flashcards = [...res.cards, ...(s.flashcards || [])];
      });
      delete ui.tutorResultByModule[modId];
      ui.cardIndex = 0;
      ui.cardFlipped = false;
      ui.cardDueOnly = true;
      showToast(`${res.cards.length} Karteikarten übernommen!`);
      render();
      return;
    }
    if (action === 'tutor-save-note') {
      const modId = actionEl.dataset.modId;
      const res = ui.tutorResultByModule?.[modId];
      if (!res?.text) return;
      store.update((s) => {
        const mod = (s.modules || []).find((m) => m.id === modId);
        if (!mod) return;
        mod.notebookNotes = mod.notebookNotes || [];
        mod.notebookNotes.unshift({
          id: uid('nn'),
          title: res.title || `KI-Erklärung (${mod.short})`,
          content: res.text.slice(0, 12000),
          updatedAt: isoDate(),
        });
      });
      showToast('Erklärung als Modul-Info gespeichert!');
      return;
    }
    if (action === 'tutor-save-question-card') {
      const modId = actionEl.dataset.modId;
      const idx = Number(actionEl.dataset.idx);
      const res = ui.tutorResultByModule?.[modId];
      const item = res?.items?.[idx];
      const mod = (store.state.modules || []).find((m) => m.id === modId);
      if (!item || !mod) return;
      store.update((s) => {
        s.flashcards = s.flashcards || [];
        s.flashcards.unshift({
          id: uid('fc'),
          course: mod.courseKey,
          front: item.question,
          back: item.solution,
          box: 1,
          nextReview: isoDate(),
          lastReviewed: null,
          reps: 0,
        });
      });
      showToast(`Probefrage als Karteikarte für ${mod.short} gespeichert!`);
      return;
    }
    if (action === 'clear-gemini-key') {
      setGeminiApiKey('');
      ui.tutorError = '';
      showToast('Gemini API-Key von diesem Gerät entfernt.');
      render();
      return;
    }

    /* PWA Install */
    if (action === 'trigger-install' && ui.installPromptEvent) {
      ui.installPromptEvent.prompt();
      const res = await ui.installPromptEvent.userChoice;
      ui.installPromptEvent = null;
      if (res?.outcome === 'accepted') showToast('Studia wird installiert!');
      render();
      return;
    }
    if (action === 'dismiss-install') {
      ui.installBannerDismissed = true;
      render();
      return;
    }

    /* Timetable actions */
    if (action === 'set-parity') {
      ui.weekParityFilter = actionEl.dataset.value;
      render();
      return;
    }
    if (action === 'select-timetable-day') {
      vibrate(6);
      ui.selectedTimetableDay = Number(actionEl.dataset.day);
      render();
      return;
    }
    if (action === 'toggle-timetable-layout') {
      const currentlyAgenda =
        ui.timetableLayout === 'agenda' || (!ui.timetableLayout && window.innerWidth < 720);
      ui.timetableLayout = currentlyAgenda ? 'grid' : 'agenda';
      render();
      return;
    }
    if (action === 'delete-course') {
      store.update((s) => {
        s.timetable = s.timetable.filter((c) => c.id !== actionEl.dataset.id);
      });
      ui.modal = null;
      showToast('Veranstaltung entfernt');
      render();
      return;
    }
    if (action === 'export-ics-timetable') {
      exportTimetableToICS(store.state.timetable);
      showToast('Stundenplan als .ics gespeichert!');
      return;
    }
    if (action === 'import-ics-timetable') {
      pickFile('.ics,text/calendar', (text) => {
        const entries = inferTimetableEntriesFromICS(parseICS(text));
        if (entries.length === 0) {
          showToast('Keine passenden Termine in der .ics-Datei gefunden.');
          return;
        }
        store.update((s) => {
          s.timetable.push(...entries);
        });
        showToast(`${entries.length} Veranstaltungen importiert!`);
      });
      return;
    }

    /* Calendar, Google Sync & Drive Sync actions */
    if (action === 'set-cal-filter') {
      ui.calFilter = actionEl.dataset.value;
      render();
      return;
    }
    if (action === 'select-cal-date') {
      vibrate(6);
      ui.selectedCalendarDate = actionEl.dataset.date;
      const d = parseISODate(ui.selectedCalendarDate);
      ui.calYear = d.getFullYear();
      ui.calMonth = d.getMonth();
      render();
      return;
    }
    if (action === 'cal-prev-month') {
      const d = new Date(ui.calYear, ui.calMonth - 1, 1);
      ui.calYear = d.getFullYear();
      ui.calMonth = d.getMonth();
      render();
      return;
    }
    if (action === 'cal-next-month') {
      const d = new Date(ui.calYear, ui.calMonth + 1, 1);
      ui.calYear = d.getFullYear();
      ui.calMonth = d.getMonth();
      render();
      return;
    }
    if (action === 'cal-today') {
      const now = new Date();
      ui.selectedCalendarDate = isoDate(now);
      ui.calYear = now.getFullYear();
      ui.calMonth = now.getMonth();
      render();
      return;
    }
    if (action === 'delete-event') {
      store.update((s) => {
        s.calendarEvents = s.calendarEvents.filter((ev) => ev.id !== actionEl.dataset.id);
      });
      showToast('Termin gelöscht');
      return;
    }
    if (action === 'toggle-google-exam') {
      vibrate(10);
      const gKey = actionEl.dataset.gkey;
      const allEvs = store.state.google.connected
        ? store.state.googleEvents
        : store.state.calendarEvents;
      const ev = allEvs.find((x) => (x.googleEventId || x.id) === gKey);
      if (!ev) return;

      const currentlyExam = isGoogleEventExam(ev, store.state.google);
      store.update((s) => {
        s.google.promotedGoogleExamIds = (s.google.promotedGoogleExamIds || []).filter((k) => k !== gKey);
        s.google.hiddenGoogleExamIds = (s.google.hiddenGoogleExamIds || []).filter((k) => k !== gKey);
        if (currentlyExam) s.google.hiddenGoogleExamIds.push(gKey);
        else s.google.promotedGoogleExamIds.push(gKey);
      });
      showToast(currentlyExam ? 'Aus Klausuren ausgeblendet.' : 'In Klausuren-Lernplan übernommen!');
      return;
    }
    if (action === 'dismiss-google-exam') {
      const gKey = actionEl.dataset.gkey;
      store.update((s) => {
        s.google.promotedGoogleExamIds = (s.google.promotedGoogleExamIds || []).filter((k) => k !== gKey);
        if (!(s.google.hiddenGoogleExamIds || []).includes(gKey)) {
          s.google.hiddenGoogleExamIds.push(gKey);
        }
      });
      showToast('Aus Klausuren ausgeblendet (bleibt im Google Kalender).');
      return;
    }
    if (action === 'import-ics-calendar') {
      pickFile('.ics,text/calendar', (text) => {
        const parsed = parseICS(text);
        if (parsed.length === 0) {
          showToast('Keine Termine gefunden.');
          return;
        }
        store.update((s) => {
          for (const ev of parsed) {
            s.calendarEvents.push({
              id: uid('ev'),
              title: ev.title,
              date: ev.date,
              start: ev.start || '09:00',
              end: ev.end || '',
              location: ev.location || '',
              notes: ev.notes || '',
              source: 'local',
              calendarName: '.ics Import',
              color: 'slate',
            });
          }
        });
        showToast(`${parsed.length} Termine importiert!`);
      });
      return;
    }
    if (action === 'connect-google' || action === 'refresh-google-session') {
      const input = document.getElementById('set-client-id');
      const roEl = document.getElementById('set-readonly-toggle');
      const drvEl = document.getElementById('set-drive-toggle');
      const clientId = input ? input.value.trim() : store.state.google.clientId;
      const readOnly = roEl ? roEl.checked : Boolean(store.state.google.readOnlyMode);
      const includeDrive = drvEl ? drvEl.checked : store.state.google.driveSyncEnabled !== false;
      const promptMode = action === 'refresh-google-session' ? '' : 'select_account consent';

      ui.googleError = '';
      try {
        showToast(action === 'refresh-google-session' ? 'Erneuere Google-Sitzung…' : 'Google-Anmeldung öffnet sich…');
        await connectGoogleAccount(clientId, { readOnly, includeDrive, promptMode });
        const detected = getUnifiedExams(store.state).filter((ex) => ex.fromGoogle).length;
        if (includeDrive) {
          await syncWithGoogleDrive({ direction: 'auto', silent: true });
        }
        showToast(`Google verbunden! ${detected} Klausur(en) erkannt.`);
        render();
      } catch (err) {
        ui.googleError = err.message || 'Google Anmeldung fehlgeschlagen.';
        showToast(ui.googleError);
        render();
      }
      return;
    }
    if (action === 'connect-google-redirect') {
      const input = document.getElementById('set-client-id');
      const roEl = document.getElementById('set-readonly-toggle');
      const drvEl = document.getElementById('set-drive-toggle');
      const clientId = input ? input.value.trim() : store.state.google.clientId;
      const readOnly = roEl ? roEl.checked : Boolean(store.state.google.readOnlyMode);
      const includeDrive = drvEl ? drvEl.checked : store.state.google.driveSyncEnabled !== false;
      try {
        startGoogleRedirectLogin(clientId, { readOnly, includeDrive });
      } catch (err) {
        ui.googleError = err.message;
        render();
      }
      return;
    }
    if (action === 'sync-google-now') {
      try {
        const count = await syncGoogleCalendars();
        if (store.state.google.driveSyncEnabled) {
          await syncWithGoogleDrive({ direction: 'auto', silent: true });
        }
        ui.googleError = '';
        showToast(`${count} Google-Termine synchronisiert.`);
      } catch (err) {
        ui.googleError = err.message;
        showToast(err.message);
        render();
      }
      return;
    }
    if (action === 'drive-sync-auto' || action === 'drive-sync-upload' || action === 'drive-sync-download') {
      const direction =
        action === 'drive-sync-upload'
          ? 'upload'
          : action === 'drive-sync-download'
            ? 'download'
            : 'auto';
      try {
        const res = await syncWithGoogleDrive({ direction, silent: false });
        const label =
          res.action === 'downloaded'
            ? 'Stand aus Google Drive geladen!'
            : res.action === 'uploaded' || res.action === 'created'
              ? 'Stand in Google Drive gespeichert!'
              : 'Google Drive ist aktuell.';
        showToast(label);
        render();
      } catch (err) {
        showToast(err.message);
        render();
      }
      return;
    }
    if (action === 'disconnect-google') {
      disconnectGoogleAccount();
      ui.googleError = '';
      showToast('Google-Konto getrennt.');
      return;
    }
    if (action === 'push-event-google') {
      const payload = {
        title: actionEl.dataset.title,
        date: actionEl.dataset.date,
        start: actionEl.dataset.start,
        end: actionEl.dataset.end,
        location: actionEl.dataset.location,
        notes: actionEl.dataset.notes,
      };
      if (store.state.google.connected) {
        try {
          await pushEventToGoogle(payload);
          showToast('Im Google Kalender gespeichert!');
        } catch (err) {
          showToast(err.message);
        }
      } else {
        exportSingleEventToICS(payload);
        showToast('Als .ics gespeichert.');
      }
      return;
    }

    /* Recurring Abgaben -> Google Calendar Series with Reminders */
    if (action === 'push-all-recurring-google') {
      try {
        showToast('Lege Abgabe-Serien mit Erinnerungen an…');
        const cnt = await pushAllRecurringTasksToGoogle(
          store.state.tasks,
          store.state.semesterConfig
        );
        showToast(`${cnt} Abgabe-Serien (Vorabend + 2h Erinnerung) in Google angelegt!`);
      } catch (err) {
        showToast(err.message);
      }
      return;
    }
    if (action === 'push-recurring-task-google') {
      const tk = (store.state.tasks || []).find((x) => x.id === actionEl.dataset.id);
      if (!tk) return;
      if (store.state.google.connected) {
        try {
          await pushRecurringTaskToGoogle(tk, store.state.semesterConfig);
          showToast(`Serie „${tk.title}“ mit Erinnerungen im Google Kalender gespeichert!`);
        } catch (err) {
          showToast(err.message);
        }
      } else {
        exportRecurringTasksToICS([tk], store.state.semesterConfig);
        showToast('Abgabe-Serie als .ics (mit Erinnerungen) geladen!');
      }
      return;
    }
    if (action === 'export-ics-recurring') {
      exportRecurringTasksToICS(store.state.tasks, store.state.semesterConfig);
      showToast('Alle Abgabe-Serien als .ics (inkl. Erinnerungen & Ferienpause) geladen!');
      return;
    }

    /* Exams actions */
    if (action === 'set-exam-filter') {
      ui.examFilter = actionEl.dataset.value;
      render();
      return;
    }
    if (action === 'toggle-exam-topic') {
      vibrate(10);
      const { examId, topicId } = actionEl.dataset;
      mutateExamById(examId, (ex) => {
        const tp = (ex.topics || []).find((t) => t.id === topicId);
        if (tp) tp.done = !tp.done;
      });
      return;
    }
    if (action === 'delete-exam-topic') {
      const { examId, topicId } = actionEl.dataset;
      mutateExamById(examId, (ex) => {
        ex.topics = (ex.topics || []).filter((t) => t.id !== topicId);
      });
      return;
    }
    if (action === 'delete-exam') {
      store.update((s) => {
        s.exams = s.exams.filter((x) => x.id !== actionEl.dataset.id);
      });
      showToast('Klausur gelöscht');
      return;
    }
    if (action === 'export-ics-exams') {
      exportExamsToICS(getUnifiedExams(store.state));
      showToast('Klausuren als .ics exportiert!');
      return;
    }
    if (action === 'push-exam-google') {
      const ex = getUnifiedExams(store.state).find((x) => x.id === actionEl.dataset.id);
      if (!ex) return;
      const payload = {
        title: `Klausur: ${ex.title}`,
        date: ex.date,
        start: ex.time || '09:00',
        end: addMinutesToTime(ex.time || '09:00', ex.durationMin || 90),
        location: ex.room || '',
        notes: `${ex.ects} ECTS · ${ex.attempt}. Versuch${ex.aids ? ` · Hilfsmittel: ${ex.aids}` : ''}`,
      };
      if (store.state.google.connected) {
        try {
          await pushEventToGoogle(payload);
          showToast(`„${ex.title}“ in Google Kalender gespeichert!`);
        } catch (err) {
          showToast(err.message);
        }
      } else {
        exportSingleEventToICS(payload);
        showToast('Klausur als .ics geladen.');
      }
      return;
    }

    /* Toolkit & Recurring Tasks actions */
    if (action === 'set-toolkit-sub') {
      vibrate(6);
      ui.toolkitSub = actionEl.dataset.value;
      render();
      return;
    }
    if (action === 'complete-recurring-task') {
      vibrate(14);
      const id = actionEl.dataset.id;
      let nextDueStr = '';
      store.update((s) => {
        const t = s.tasks.find((x) => x.id === id);
        if (!t) return;
        const step = t.recurrence === 'biweekly' ? 14 : 7;
        t.lastCompleted = isoDate();
        t.streak = Number(t.streak || 0) + 1;
        t.due = nextLectureOccurrence(t.due, step, s.semesterConfig);
        nextDueStr = formatShortDateDE(t.due);
      });
      showToast(`Erledigt! Nächste Abgabe auf ${nextDueStr} geplant (Ferien berücksichtigt).`);
      return;
    }
    if (action === 'toggle-task') {
      vibrate(10);
      store.update((s) => {
        const t = s.tasks.find((x) => x.id === actionEl.dataset.id);
        if (t) t.done = !t.done;
      });
      return;
    }
    if (action === 'delete-task') {
      store.update((s) => {
        s.tasks = s.tasks.filter((x) => x.id !== actionEl.dataset.id);
      });
      return;
    }

    /* 5-Box Leitner Spaced Repetition Flashcards */
    if (action === 'set-card-due-filter') {
      vibrate(6);
      ui.cardDueOnly = actionEl.dataset.value === 'due';
      ui.cardIndex = 0;
      ui.cardFlipped = false;
      render();
      return;
    }
    if (action === 'card-flip') {
      vibrate(6);
      ui.cardFlipped = !ui.cardFlipped;
      render();
      return;
    }
    if (action === 'card-prev') {
      ui.cardIndex = Math.max(0, (ui.cardIndex || 0) - 1);
      ui.cardFlipped = false;
      render();
      return;
    }
    if (action === 'card-rate') {
      vibrate(10);
      const { id, result } = actionEl.dataset;
      const todayIso = isoDate();
      store.update((s) => {
        const idx = (s.flashcards || []).findIndex((c) => c.id === id);
        if (idx >= 0) {
          s.flashcards[idx] = rateCard(s.flashcards[idx], result, todayIso);
        }
      });
      // When in dueOnly mode and rated good/hard, card drops out of queue so index stays at 0 (or cycles on 'again')
      ui.cardIndex = result === 'again' ? (ui.cardIndex || 0) + 1 : ui.cardDueOnly !== false ? 0 : (ui.cardIndex || 0) + 1;
      ui.cardFlipped = false;
      render();
      return;
    }
    if (action === 'delete-flashcard') {
      store.update((s) => {
        s.flashcards = (s.flashcards || []).filter((c) => c.id !== actionEl.dataset.id);
      });
      ui.cardFlipped = false;
      return;
    }

    /* E-Technik Calculator quick clear */
    if (action === 'calc-ohm-clear') {
      ui.calc.ohmU = '';
      ui.calc.ohmI = '';
      ui.calc.ohmR = '';
      ui.calc.ohmP = '';
      render();
      return;
    }

    /* Grades, Notes, Quicklinks */
    if (action === 'delete-grade') {
      store.update((s) => {
        s.grades = s.grades.filter((g) => g.id !== actionEl.dataset.id);
      });
      return;
    }
    if (action === 'delete-note') {
      store.update((s) => {
        s.notes = s.notes.filter((n) => n.id !== actionEl.dataset.id);
      });
      return;
    }
    if (action === 'delete-quicklink') {
      store.update((s) => {
        s.quickLinks = s.quickLinks.filter((q) => q.id !== actionEl.dataset.id);
      });
      return;
    }

    /* Focus Timer & Study Analytics controls */
    if (action === 'start-focus-quick') {
      vibrate(12);
      const subj = actionEl.dataset.subject || 'GET I';
      focusTimer.setSubject(subj);
      ui.tab = 'toolkit';
      ui.toolkitSub = 'focus';
      if (!focusTimer.running) focusTimer.start();
      render();
      showToast(`Bib-Fokus für ${subj} gestartet!`);
      return;
    }
    if (action === 'focus-preset') {
      focusTimer.setPreset(actionEl.dataset.value);
      render();
      return;
    }
    if (action === 'focus-toggle') {
      vibrate(12);
      focusTimer.toggle();
      render();
      return;
    }
    if (action === 'focus-reset') {
      focusTimer.reset();
      render();
      return;
    }
    if (action === 'focus-switch-phase') {
      focusTimer.switchPhase(focusTimer.phase === 'work' ? 'break' : 'work');
      render();
      return;
    }
    if (action === 'focus-wakelock') {
      const on = await focusTimer.toggleWakeLock();
      showToast(on ? 'Display bleibt in der Bib wach.' : 'Display-Wachhalten aus.');
      render();
      return;
    }
    if (action === 'log-manual-study') {
      const subj = focusTimer.subject || 'GET I';
      const mins = Math.max(5, Number(actionEl.dataset.minutes || 30));
      store.update((s) => {
        s.studySessions.push({ id: uid('ss'), course: subj, minutes: mins, date: isoDate() });
      });
      showToast(`+${mins} Min Lernzeit für ${subj} geloggt!`);
      return;
    }
    if (action === 'set-weekly-goal') {
      const mins = Math.max(60, Number(actionEl.dataset.minutes || 600));
      store.update((s) => {
        s.studyGoalWeeklyMin = mins;
      });
      showToast(`Wochenziel auf ${Math.round(mins / 60)} Std. gesetzt.`);
      return;
    }
    if (action === 'set-study-scope') {
      ui.studyStatsScope = actionEl.dataset.value;
      render();
      return;
    }

    /* Semester & Backup Reset */
    if (action === 'reset-semester-hsd') {
      store.update((s) => {
        s.semesterConfig = {
          ...DEFAULT_SEMESTER_CONFIG,
          holidays: DEFAULT_SEMESTER_CONFIG.holidays.map((h) => ({ ...h })),
        };
      });
      showToast('HSD WS 2026/27 Zeiten wiederhergestellt.');
      render();
      return;
    }
    if (action === 'export-backup') {
      const blob = new Blob([store.exportJSON()], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `studia-backup-${isoDate()}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 300);
      showToast('Backup heruntergeladen!');
      return;
    }
    if (action === 'import-backup') {
      pickFile('.json,application/json', (text) => {
        try {
          store.importJSON(text);
          showToast('Backup wiederhergestellt!');
        } catch (err) {
          showToast(err.message);
        }
      });
      return;
    }
    if (action === 'reset-demo') {
      store.resetToDemo();
      ui.modal = null;
      showToast('WIE-1 Startdaten wiederhergestellt.');
      render();
    }
  }

  function handleInput(e) {
    const key = e.target.dataset?.calc;
    if (!key) return;
    ui.calc[key] = e.target.value;
    render(e.target.id);
  }

  async function handleChange(e) {
    const target = e.target;
    if (target.dataset?.calc) {
      ui.calc[target.dataset.calc] = target.value;
      render(target.id);
      return;
    }

    const action = target.dataset.action;
    if (action === 'focus-subject') {
      focusTimer.setSubject(target.value);
      return;
    }
    if (action === 'toggle-google-readonly') {
      store.update((s) => {
        s.google.readOnlyMode = target.checked;
      });
      return;
    }
    if (action === 'toggle-google-remember') {
      store.update(
        (s) => {
          s.google.rememberLogin = target.checked;
        },
        { touchUpdatedAt: false }
      );
      if (!target.checked) clearPersistedSession();
      return;
    }
    if (action === 'toggle-drive-sync') {
      store.update(
        (s) => {
          s.google.driveSyncEnabled = target.checked;
        },
        { touchUpdatedAt: false }
      );
      return;
    }
    if (action === 'plan-grade-change') {
      store.update((s) => {
        const m = (s.semesterPlan || []).find((x) => x.id === target.dataset.id);
        if (m) m.targetGrade = Number(target.value);
      });
      return;
    }
    if (action === 'toggle-google-cal') {
      const calId = target.value;
      store.update((s) => {
        const set = new Set(s.google.selectedCalendarIds || []);
        if (target.checked) set.add(calId);
        else set.delete(calId);
        s.google.selectedCalendarIds = [...set];
      });
      if (store.state.google.connected) {
        try {
          await syncGoogleCalendars();
          showToast('Kalender-Auswahl aktualisiert.');
        } catch (err) {
          showToast(err.message);
        }
      }
      return;
    }
    if (action === 'set-write-google-cal') {
      store.update((s) => {
        s.google.writeCalendarId = target.value;
      });
      showToast('Ziel-Kalender gespeichert.');
    }
  }

  return { handleClick, handleInput, handleChange };
}
