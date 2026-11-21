import { isoDate, uid } from '../data/defaults.js';
import {
  explainTutorExercise,
  generateTutorExamQuestions,
  generateTutorFlashcards,
  setGeminiApiKey,
  setGeminiModel,
  setGeminiThinkingLevel,
} from '../services/geminiTutor.js';
import { pushEventToGoogle } from '../services/googleCalendar.js';
import {
  isPersonalBridgeConfigured,
  pushEventViaBridge,
  savePersonalBridgeConfig,
  syncAllViaBridge,
} from '../services/personalBridge.js';
import { exportSingleEventToICS } from '../services/ics.js';
import { addMinutesToTime, getUnifiedExams, store } from '../state/store.js';
import { parseBulkFlashcards } from '../utils/flashcardParser.js';
import { mutateExamById } from './actions.js';

export function createFormHandler({ ui, render, showToast }) {
  return async function handleSubmit(e) {
    e.preventDefault();
    const form = e.target;
    const fd = new FormData(form);

    /* ---------- Inline Forms ---------- */
    if (form.dataset.form === 'save-bridge-config') {
      const url = String(fd.get('bridgeUrl') || '').trim();
      const secret = String(fd.get('bridgeSecret') || '').trim();
      if (!url || !/^https:\/\//i.test(url)) {
        showToast('Bitte eine gültige https://script.google.com/…/exec URL eingeben.');
        return;
      }
      if (secret.length < 8) {
        showToast('Das Sync-Token sollte mindestens 8 Zeichen lang sein.');
        return;
      }
      savePersonalBridgeConfig({ url, secret });
      showToast('Teste Verbindung & synchronisiere…');
      try {
        const res = await syncAllViaBridge({ direction: 'auto', silent: false });
        showToast(
          `Dauer-Sync aktiv! ${res.eventsCount || 0} Kalender-Termine geladen — nie wieder neu anmelden.`
        );
        render();
      } catch (err) {
        showToast(err.message || 'Verbindung fehlgeschlagen.');
        render();
      }
      return;
    }

    if (form.dataset.form === 'add-topic') {
      const text = String(fd.get('topic') || '').trim();
      if (!text) return;
      mutateExamById(form.dataset.examId, (ex) => {
        ex.topics = ex.topics || [];
        ex.topics.push({ id: uid('tp'), text, done: false });
      });
      return;
    }

    if (form.dataset.form === 'exam-keywords') {
      const list = String(fd.get('keywords') || '')
        .split(',')
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean);
      store.update((s) => {
        s.google.examKeywords = list.length ? list : ['klausur', 'prüfung'];
      });
      showToast('Schlagwörter gespeichert.');
      return;
    }

    if (form.dataset.form === 'save-gemini-key') {
      const apiKey = String(fd.get('apiKey') || '').trim();
      if (!apiKey) return;
      setGeminiApiKey(apiKey);
      ui.tutorError = '';
      ui.tutorCanFallbackHydrogen = false;
      showToast('Gemini API-Key lokal gespeichert! Du kannst den KI-Tutor jetzt nutzen.');
      render();
      return;
    }

    if (form.dataset.form === 'save-gemini-settings') {
      const apiKey = String(fd.get('apiKey') || '').trim();
      const model = String(fd.get('model') || 'gemini-4-neon');
      const thinkingLevel = String(fd.get('thinkingLevel') || 'medium');
      setGeminiApiKey(apiKey);
      setGeminiModel(model);
      setGeminiThinkingLevel(thinkingLevel);
      ui.tutorError = '';
      ui.tutorCanFallbackHydrogen = false;
      showToast(`KI-Tutor gespeichert (${model} · ${thinkingLevel}).`);
      render();
      return;
    }

    if (form.dataset.form === 'tutor-run') {
      const modId = form.dataset.modId;
      const mode = form.dataset.mode || 'cards';
      const prompt = String(fd.get('prompt') || '').trim();
      const mod = (store.state.modules || []).find((m) => m.id === modId);
      if (!mod) return;

      ui.tutorLoading = true;
      ui.tutorError = '';
      ui.tutorCanFallbackHydrogen = false;
      render();

      try {
        ui.tutorResultByModule = ui.tutorResultByModule || {};
        if (mode === 'cards') {
          const { cards } = await generateTutorFlashcards(mod, prompt);
          if (cards.length === 0) {
            throw new Error('Es konnten keine Karten geparst werden. Bitte erneut versuchen.');
          }
          ui.tutorResultByModule[modId] = { type: 'cards', cards };
        } else if (mode === 'explain') {
          const { text } = await explainTutorExercise(mod, prompt);
          ui.tutorResultByModule[modId] = {
            type: 'explain',
            title: prompt.slice(0, 60) || `Erklärung (${mod.short})`,
            text,
          };
        } else {
          const { items, rawText } = await generateTutorExamQuestions(mod, prompt);
          ui.tutorResultByModule[modId] = { type: 'exam', items, rawText };
        }
      } catch (err) {
        ui.tutorError = err.message || 'KI-Tutor Anfrage fehlgeschlagen.';
        ui.tutorCanFallbackHydrogen = Boolean(err.canFallbackToHydrogen);
      } finally {
        ui.tutorLoading = false;
        render();
      }
      return;
    }

    if (form.dataset.form === 'semester-config') {
      const lecturesStart = String(fd.get('lecturesStart') || '2026-10-05');
      const lecturesEnd = String(fd.get('lecturesEnd') || '2027-01-22');
      const holidayStart = String(fd.get('holidayStart') || '').trim();
      const holidayEnd = String(fd.get('holidayEnd') || '').trim();
      const holidayLabel = String(fd.get('holidayLabel') || 'Vorlesungsfreie Zeit').trim();
      const examPeriodStart = String(fd.get('examPeriodStart') || '').trim();
      const examPeriodEnd = String(fd.get('examPeriodEnd') || '').trim();

      store.update((s) => {
        s.semesterConfig = {
          ...(s.semesterConfig || {}),
          lecturesStart,
          lecturesEnd,
          examPeriodStart,
          examPeriodEnd,
          holidays:
            holidayStart && holidayEnd
              ? [{ id: 'hol_xmas', label: holidayLabel, start: holidayStart, end: holidayEnd }]
              : [],
        };
      });
      showToast('HSD-Semesterzeiten & Ferien gespeichert!');
      return;
    }

    if (form.dataset.form === 'profile') {
      store.update((s) => {
        const deg = String(fd.get('degree') || '').trim();
        if (deg) s.profile.shortDegree = deg;
        s.profile.semester = String(fd.get('semester') || '').trim() || s.profile.semester;
        s.profile.targetEcts = Math.max(30, Number(fd.get('targetEcts') || 210));
      });
      showToast('Studienprofil gespeichert.');
      return;
    }

    /* ---------- Modal Forms ---------- */
    const modalType = form.dataset.modalSubmit;
    if (!modalType) return;

    if (modalType === 'share-import') {
      const moduleId = String(fd.get('moduleId') || 'mod_get');
      const target = String(fd.get('target') || 'module-note');
      const title = String(fd.get('title') || 'Geteilte Info').trim();
      const url = String(fd.get('url') || '').trim();
      const content = String(fd.get('content') || '').trim();
      const mod = (store.state.modules || []).find((m) => m.id === moduleId) || store.state.modules[0];

      if (target === 'notebook-link' && mod) {
        const link = url || content.match(/https?:\/\/\S+/)?.[0] || '';
        if (!link) {
          showToast('Keine gültige URL zum Speichern gefunden.');
          return;
        }
        store.update((s) => {
          const m = (s.modules || []).find((x) => x.id === mod.id);
          if (!m) return;
          if (link.includes('moodle')) m.moodleUrl = link;
          else {
            m.notebookUrl = link;
            m.notebookLabel = title || `NotebookLM · ${m.short}`;
          }
        });
        ui.tab = 'toolkit';
        ui.toolkitSub = 'modules';
        ui.selectedModuleId = mod.id;
        ui.modal = null;
        showToast(`Link in ${mod.short} gespeichert!`);
        render();
        return;
      }

      if (target === 'flashcards' && mod) {
        let parsed = parseBulkFlashcards(content, mod.courseKey);
        if (parsed.length === 0) {
          parsed = [
            {
              id: uid('fc'),
              course: mod.courseKey,
              front: title,
              back: content,
              box: 1,
              nextReview: isoDate(),
              lastReviewed: null,
              reps: 0,
            },
          ];
        }
        store.update((s) => {
          s.flashcards = [...parsed, ...(s.flashcards || [])];
        });
        ui.tab = 'toolkit';
        ui.toolkitSub = 'modules';
        ui.selectedModuleId = mod.id;
        ui.cardDueOnly = true;
        ui.cardIndex = 0;
        ui.cardFlipped = false;
        ui.modal = null;
        showToast(`${parsed.length} Karteikarte(n) in ${mod.short} übernommen!`);
        render();
        return;
      }

      if (target === 'task') {
        store.update((s) => {
          s.tasks.unshift({
            id: uid('tk'),
            title: title || content.slice(0, 80),
            course: mod?.courseKey || 'Orga',
            due: isoDate(),
            dueTime: '23:59',
            recurrence: 'once',
            recurrenceLabel: 'Einmalig',
            streak: 0,
            lastCompleted: null,
            done: false,
          });
        });
        ui.tab = 'toolkit';
        ui.toolkitSub = 'tasks';
        ui.modal = null;
        showToast('Geteilte Aufgabe angelegt!');
        render();
        return;
      }

      // Default: module-note
      if (mod) {
        store.update((s) => {
          const m = (s.modules || []).find((x) => x.id === mod.id);
          if (!m) return;
          m.notebookNotes = m.notebookNotes || [];
          m.notebookNotes.unshift({
            id: uid('nn'),
            title,
            content: content.slice(0, 12000),
            updatedAt: isoDate(),
          });
        });
        ui.tab = 'toolkit';
        ui.toolkitSub = 'modules';
        ui.selectedModuleId = mod.id;
        ui.modal = null;
        showToast(`Geteilte Info in ${mod.short} gespeichert!`);
        render();
      }
      return;
    }

    if (modalType === 'module-notebook') {
      const modId = form.dataset.id;
      store.update((s) => {
        const mod = (s.modules || []).find((m) => m.id === modId);
        if (!mod) return;
        mod.notebookLabel = String(fd.get('notebookLabel') || '').trim() || `NotebookLM · ${mod.short}`;
        mod.notebookUrl = String(fd.get('notebookUrl') || '').trim() || 'https://notebooklm.google.com/';
        const mUrl = String(fd.get('moodleUrl') || '').trim();
        if (mUrl) mod.moodleUrl = mUrl;
      });
      ui.modal = null;
      showToast('Notebook-Link im Modul gespeichert!');
      render();
      return;
    }

    if (modalType === 'module-note') {
      const modId = form.dataset.id;
      store.update((s) => {
        const mod = (s.modules || []).find((m) => m.id === modId);
        if (!mod) return;
        mod.notebookNotes = mod.notebookNotes || [];
        mod.notebookNotes.unshift({
          id: uid('nn'),
          title: String(fd.get('title') || '').trim(),
          content: String(fd.get('content') || '').trim(),
          updatedAt: isoDate(),
        });
      });
      ui.modal = null;
      showToast('Info aus Notebook im Modul gespeichert!');
      render();
      return;
    }

    if (modalType === 'import-notebook-cards') {
      const mod = (store.state.modules || []).find((m) => m.id === form.dataset.id);
      if (!mod) return;
      const bulk = String(fd.get('bulkText') || '');
      const parsed = parseBulkFlashcards(bulk, mod.courseKey);
      if (parsed.length === 0) {
        showToast('Kein Format erkannt. Nutze z. B. „Frage :: Antwort“ oder „F: ... / A: ...“.');
        return;
      }
      store.update((s) => {
        s.flashcards = [...parsed, ...(s.flashcards || [])];
      });
      ui.modal = null;
      ui.cardIndex = 0;
      ui.cardFlipped = false;
      ui.cardDueOnly = true;
      showToast(`${parsed.length} Karteikarten für ${mod.short} importiert!`);
      render();
      return;
    }

    if (modalType === 'course') {
      const id = form.dataset.id;
      const title = String(fd.get('title') || '').trim();
      const entry = {
        id: id || uid('tt'),
        title,
        short: title.split(/\s+/).slice(0, 2).join(' ').slice(0, 16),
        type: String(fd.get('type') || 'VL'),
        day: Number(fd.get('day') || 0),
        start: String(fd.get('start') || '10:00'),
        end: String(fd.get('end') || '11:45'),
        room: String(fd.get('room') || '').trim(),
        lecturer: String(fd.get('lecturer') || '').trim(),
        weekParity: String(fd.get('weekParity') || 'all'),
        ects: Number(fd.get('ects') || 0),
        color: String(fd.get('color') || 'sage'),
      };
      store.update((s) => {
        const idx = s.timetable.findIndex((c) => c.id === entry.id);
        if (idx >= 0) s.timetable[idx] = { ...s.timetable[idx], ...entry };
        else s.timetable.push({ ...entry, link: '', absences: 0, maxAbsences: null });
      });
      ui.modal = null;
      showToast(id ? 'Veranstaltung aktualisiert' : 'Veranstaltung hinzugefügt');
      render();
      return;
    }

    if (modalType === 'exam') {
      const id = form.dataset.id;
      const gKey = form.dataset.gkey;
      if (gKey) {
        mutateExamById(`gex_${gKey}`, (meta) => {
          meta.ects = Number(fd.get('ects') || 5);
          meta.attempt = Number(fd.get('attempt') || 1);
          meta.aids = String(fd.get('aids') || '').trim();
          meta.color = String(fd.get('color') || 'sage');
        });
        ui.modal = null;
        showToast('Lern-Details gespeichert.');
        render();
        return;
      }

      const entry = {
        id: id || uid('ex'),
        title: String(fd.get('title') || '').trim(),
        date: String(fd.get('date') || ''),
        time: String(fd.get('time') || '09:00'),
        durationMin: Number(fd.get('durationMin') || 90),
        ects: Number(fd.get('ects') || 5),
        room: String(fd.get('room') || '').trim(),
        attempt: Number(fd.get('attempt') || 1),
        aids: String(fd.get('aids') || '').trim(),
        color: String(fd.get('color') || 'sage'),
      };
      if (!id && fd.get('pushGoogle') === 'on' && (isPersonalBridgeConfigured() || store.state.google.connected)) {
        try {
          const pushFn = isPersonalBridgeConfigured() ? pushEventViaBridge : pushEventToGoogle;
          const created = await pushFn({
            title: `Klausur ${entry.title}`,
            date: entry.date,
            start: entry.time,
            end: addMinutesToTime(entry.time, entry.durationMin),
            location: entry.room,
            notes: `${entry.ects} ECTS · ${entry.attempt}. Versuch`,
          });
          if (created?.id) {
            store.update((s) => {
              s.google.examMetaByGoogleId[created.id] = {
                ects: entry.ects,
                attempt: entry.attempt,
                aids: entry.aids,
                color: entry.color,
                completed: false,
                grade: null,
                topics: [],
              };
            });
          }
          ui.modal = null;
          showToast('Klausur im Google Kalender angelegt!');
          render();
          return;
        } catch (err) {
          showToast(`Google Sync fehlgeschlagen (${err.message}) — lokal gespeichert.`);
        }
      }

      store.update((s) => {
        const idx = s.exams.findIndex((x) => x.id === entry.id);
        if (idx >= 0) s.exams[idx] = { ...s.exams[idx], ...entry };
        else s.exams.push({ ...entry, completed: false, grade: null, topics: [] });
      });
      ui.modal = null;
      showToast(id ? 'Klausur aktualisiert' : 'Klausur eingetragen');
      render();
      return;
    }

    if (modalType === 'complete-exam') {
      const id = form.dataset.id;
      const gradeRaw = String(fd.get('grade') || '').trim();
      const sem = String(fd.get('semester') || '1. Sem.').trim();
      const examObj = getUnifiedExams(store.state).find((x) => x.id === id);
      mutateExamById(id, (target) => {
        target.completed = true;
        if (gradeRaw) target.grade = Number(gradeRaw);
      });
      if (gradeRaw && examObj) {
        store.update((s) => {
          s.grades.push({
            id: uid('gr'),
            title: examObj.title,
            semester: sem,
            ects: examObj.ects,
            grade: Number(gradeRaw),
          });
        });
      }
      ui.modal = null;
      showToast(gradeRaw ? 'Klausur abgeschlossen & Note gespeichert!' : 'Klausur abgeschlossen!');
      render();
      return;
    }

    if (modalType === 'event') {
      const payload = {
        title: String(fd.get('title') || '').trim(),
        date: String(fd.get('date') || isoDate()),
        start: String(fd.get('start') || '14:00'),
        end: String(fd.get('end') || '15:30'),
        location: String(fd.get('location') || '').trim(),
        notes: String(fd.get('notes') || '').trim(),
      };
      const pushGoogle = fd.get('pushGoogle') === 'on';
      if (pushGoogle && (isPersonalBridgeConfigured() || store.state.google.connected)) {
        try {
          if (isPersonalBridgeConfigured()) await pushEventViaBridge(payload);
          else await pushEventToGoogle(payload);
          ui.modal = null;
          showToast('Termin im Google Kalender gespeichert!');
          render();
          return;
        } catch {
          showToast('Google Sync fehlgeschlagen — lokal gespeichert.');
        }
      }
      store.update((s) => {
        s.calendarEvents.push({
          id: uid('ev'),
          ...payload,
          source: 'local',
          calendarName: 'Studia',
          color: 'sage',
        });
      });
      if (pushGoogle && !store.state.google.connected) exportSingleEventToICS(payload);
      ui.modal = null;
      showToast('Termin gespeichert');
      render();
      return;
    }

    if (modalType === 'task') {
      const recurrence = String(fd.get('recurrence') || 'once');
      store.update((s) => {
        s.tasks.push({
          id: uid('tk'),
          title: String(fd.get('title') || '').trim(),
          course: String(fd.get('course') || 'Orga').trim(),
          due: String(fd.get('due') || ''),
          dueTime: String(fd.get('dueTime') || '23:59'),
          recurrence,
          recurrenceLabel:
            recurrence === 'weekly' ? 'Jede Woche' : recurrence === 'biweekly' ? 'Alle 2 Wochen' : 'Einmalig',
          streak: 0,
          lastCompleted: null,
          done: false,
        });
      });
      ui.modal = null;
      showToast('Abgabe / Aufgabe hinzugefügt');
      render();
      return;
    }

    if (modalType === 'flashcard') {
      store.update((s) => {
        s.flashcards = s.flashcards || [];
        s.flashcards.unshift({
          id: uid('fc'),
          course: String(fd.get('course') || 'GET I'),
          front: String(fd.get('front') || '').trim(),
          back: String(fd.get('back') || '').trim(),
          box: 1,
          nextReview: isoDate(),
          lastReviewed: null,
          reps: 0,
        });
      });
      ui.modal = null;
      ui.cardIndex = 0;
      ui.cardFlipped = false;
      ui.cardDueOnly = true;
      showToast('Karteikarte gespeichert!');
      render();
      return;
    }

    if (modalType === 'grade') {
      store.update((s) => {
        s.grades.push({
          id: uid('gr'),
          title: String(fd.get('title') || '').trim(),
          grade: Number(fd.get('grade') || 1.7),
          ects: Number(fd.get('ects') || 5),
          semester: String(fd.get('semester') || '1. Sem.').trim(),
        });
      });
      ui.modal = null;
      showToast('Note gespeichert');
      render();
      return;
    }

    if (modalType === 'note') {
      const id = form.dataset.id;
      const payload = {
        title: String(fd.get('title') || '').trim(),
        course: String(fd.get('course') || 'HSD').trim(),
        content: String(fd.get('content') || '').trim(),
        updatedAt: isoDate(),
      };
      store.update((s) => {
        const idx = s.notes.findIndex((n) => n.id === id);
        if (idx >= 0) s.notes[idx] = { ...s.notes[idx], ...payload };
        else s.notes.unshift({ id: uid('nt'), ...payload });
      });
      ui.modal = null;
      showToast('Notiz gespeichert');
      render();
      return;
    }

    if (modalType === 'quicklink') {
      store.update((s) => {
        s.quickLinks.push({
          id: uid('ql'),
          label: String(fd.get('label') || '').trim(),
          sub: String(fd.get('sub') || '').trim(),
          url: String(fd.get('url') || '').trim(),
        });
      });
      ui.modal = null;
      showToast('Campus-Link hinzugefügt');
      render();
    }
  };
}
