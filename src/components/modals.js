import { ICONS } from './icons.js';
import {
  COURSE_COLORS,
  DEFAULT_GOOGLE_CLIENT_ID,
  GERMAN_GRADES,
  WEEKDAYS_FULL,
  addDays,
  isoDate,
} from '../data/defaults.js';
import { formatSingleGradeDE, getUnifiedExams } from '../state/store.js';
import { esc } from '../utils/html.js';

export function renderModal(state, modalState, ui = {}) {
  if (!modalState) return '';
  const { type, id, date } = modalState;

  let title = '';
  let body = '';
  let footer = '';

  if (type === 'course') {
    const existing = id ? state.timetable.find((c) => c.id === id) : null;
    title = existing ? 'Veranstaltung bearbeiten' : 'Neue Veranstaltung';
    body = renderCourseForm(existing);
    footer = `
      ${
        existing
          ? `<button type="button" class="btn btn-danger-soft" style="margin-right:auto;" data-action="delete-course" data-id="${esc(existing.id)}">${ICONS.trash} Löschen</button>`
          : ''
      }
      <button type="button" class="btn btn-ghost" data-action="close-modal">Abbrechen</button>
      <button type="submit" form="studia-modal-form" class="btn btn-primary">Speichern</button>
    `;
  } else if (type === 'exam') {
    const existing = id ? getUnifiedExams(state).find((e) => e.id === id) : null;
    title = existing
      ? existing.fromGoogle
        ? 'Lern-Details zur Google-Klausur'
        : 'Klausur bearbeiten'
      : 'Neue Klausur eintragen';
    body = renderExamForm(existing, state.google.connected);
    footer = `
      <button type="button" class="btn btn-ghost" data-action="close-modal">Abbrechen</button>
      <button type="submit" form="studia-modal-form" class="btn btn-primary">Speichern</button>
    `;
  } else if (type === 'complete-exam') {
    const existing = id ? getUnifiedExams(state).find((e) => e.id === id) : null;
    if (!existing) return '';
    title = 'Klausur abschließen & Note speichern';
    body = `
      <form id="studia-modal-form" class="form-stack" data-modal-submit="complete-exam" data-id="${esc(existing.id)}">
        <p class="text-sm text-secondary">
          Glückwunsch zur geschriebenen Klausur in <strong>${esc(existing.title)}</strong> (${existing.ects} ECTS)! Trage optional direkt deine Note ein.
        </p>
        <div class="form-row">
          <div class="field">
            <label for="f-grade">Note</label>
            <select id="f-grade" name="grade" class="select mono">
              <option value="">Noch ausstehend</option>
              ${GERMAN_GRADES.map((g) => `<option value="${g}">${formatSingleGradeDE(g)}</option>`).join('')}
            </select>
          </div>
          <div class="field">
            <label for="f-sem">Semester</label>
            <input id="f-sem" name="semester" class="input" value="1. Sem." />
          </div>
        </div>
      </form>
    `;
    footer = `
      <button type="button" class="btn btn-ghost" data-action="close-modal">Abbrechen</button>
      <button type="submit" form="studia-modal-form" class="btn btn-primary">Abschließen</button>
    `;
  } else if (type === 'event') {
    title = 'Neuer Kalender-Termin';
    body = renderEventForm(date || isoDate(), state.google.connected);
    footer = `
      <button type="button" class="btn btn-ghost" data-action="close-modal">Abbrechen</button>
      <button type="submit" form="studia-modal-form" class="btn btn-primary">Speichern</button>
    `;
  } else if (type === 'task') {
    title = 'Neue Abgabe / Aufgabe';
    body = `
      <form id="studia-modal-form" class="form-stack" data-modal-submit="task">
        <div class="field">
          <label for="f-title">Titel</label>
          <input id="f-title" name="title" class="input" placeholder="z. B. Arbeitsblatt Mathe I" required />
        </div>
        <div class="form-row">
          <div class="field">
            <label for="f-course">Fach</label>
            <select id="f-course" name="course" class="select">
              ${(state.modules || [])
                .map((m) => `<option value="${esc(m.courseKey)}">${esc(m.short)}</option>`)
                .join('')}
              <option value="Orga">Orga / Allgemein</option>
            </select>
          </div>
          <div class="field">
            <label for="f-recur">Wiederholung</label>
            <select id="f-recur" name="recurrence" class="select">
              <option value="once">Einmalig</option>
              <option value="weekly">Jede Woche</option>
              <option value="biweekly">Alle 2 Wochen</option>
            </select>
          </div>
        </div>
        <div class="form-row">
          <div class="field">
            <label for="f-due">Nächstes Datum</label>
            <input id="f-due" name="due" type="date" class="input mono" value="${addDays(3)}" required />
          </div>
          <div class="field">
            <label for="f-time">Uhrzeit</label>
            <input id="f-time" name="dueTime" type="time" class="input mono" value="23:59" />
          </div>
        </div>
      </form>
    `;
    footer = `
      <button type="button" class="btn btn-ghost" data-action="close-modal">Abbrechen</button>
      <button type="submit" form="studia-modal-form" class="btn btn-primary">Speichern</button>
    `;
  } else if (type === 'module-notebook') {
    const mod = (state.modules || []).find((m) => m.id === id);
    if (!mod) return '';
    title = `Notebook verknüpfen · ${mod.short}`;
    body = `
      <form id="studia-modal-form" class="form-stack" data-modal-submit="module-notebook" data-id="${esc(mod.id)}">
        <p class="text-xs text-secondary">
          Öffne dein passendes Notebook in <strong>Google NotebookLM</strong> (oder OneNote / Google Drive), kopiere die URL aus der Adresszeile und füge sie hier ein. So öffnest du das Fach-Notebook künftig mit 1 Tipp direkt aus dem Modul!
        </p>
        <div class="field">
          <label for="f-nb-label">Button-Name</label>
          <input id="f-nb-label" name="notebookLabel" class="input" value="${esc(mod.notebookLabel || `NotebookLM · ${mod.short}`)}" />
        </div>
        <div class="field">
          <label for="f-nb-url">Notebook-URL</label>
          <input id="f-nb-url" name="notebookUrl" type="url" class="input mono" style="font-size:0.82rem;" value="${esc(mod.notebookUrl || '')}" placeholder="https://notebooklm.google.com/notebook/..." required />
        </div>
        <div class="field">
          <label for="f-moodle-url">Moodle-Kurslink (optional)</label>
          <input id="f-moodle-url" name="moodleUrl" type="url" class="input mono" style="font-size:0.82rem;" value="${esc(mod.moodleUrl || '')}" placeholder="https://moodle.hs-duesseldorf.de/course/..." />
        </div>
      </form>
    `;
    footer = `
      <button type="button" class="btn btn-ghost" data-action="close-modal">Abbrechen</button>
      <button type="submit" form="studia-modal-form" class="btn btn-primary">Speichern</button>
    `;
  } else if (type === 'module-note') {
    const mod = (state.modules || []).find((m) => m.id === id);
    if (!mod) return '';
    title = `Notebook-Info hinzufügen · ${mod.short}`;
    body = `
      <form id="studia-modal-form" class="form-stack" data-modal-submit="module-note" data-id="${esc(mod.id)}">
        <div class="field">
          <label for="f-title">Titel</label>
          <input id="f-title" name="title" class="input" placeholder="z. B. Kap. 3 Zusammenfassung aus NotebookLM" required />
        </div>
        <div class="field">
          <label for="f-content">Zusammenfassung / wichtige Infos</label>
          <textarea id="f-content" name="content" class="textarea" rows="7" placeholder="Füge hier einfach Text aus deinem NotebookLM-Studienleitfaden oder deiner Mitschrift ein…" required></textarea>
        </div>
      </form>
    `;
    footer = `
      <button type="button" class="btn btn-ghost" data-action="close-modal">Abbrechen</button>
      <button type="submit" form="studia-modal-form" class="btn btn-primary">Im Modul speichern</button>
    `;
  } else if (type === 'import-notebook-cards') {
    const mod = (state.modules || []).find((m) => m.id === id);
    if (!mod) return '';
    title = `Karteikarten aus Notebook importieren · ${mod.short}`;
    body = `
      <form id="studia-modal-form" class="form-stack" data-modal-submit="import-notebook-cards" data-id="${esc(mod.id)}">
        <p class="text-xs text-secondary">
          Kopiere Fragen &amp; Antworten aus deinem <strong>NotebookLM</strong> (z. B. Studienleitfaden / FAQ / Karteikarten) hier hinein. Studia erkennt automatisch Formate wie <code>Frage :: Antwort</code>, <code>F: ... A: ...</code> oder Markdown-Tabellen!
        </p>
        <div class="field">
          <label for="f-bulk">Text aus NotebookLM einfügen</label>
          <textarea id="f-bulk" name="bulkText" class="textarea mono" style="font-size:0.82rem;" rows="8" placeholder="Beispiel 1:&#10;Was ist das Ohmsche Gesetz? :: U = R · I&#10;&#10;Beispiel 2:&#10;F: Was besagt die Knotenregel?&#10;A: Die Summe aller Ströme im Knoten ist 0." required></textarea>
        </div>
      </form>
    `;
    footer = `
      <button type="button" class="btn btn-ghost" data-action="close-modal">Abbrechen</button>
      <button type="submit" form="studia-modal-form" class="btn btn-primary">Als Karteikarten anlegen</button>
    `;
  } else if (type === 'flashcard') {
    const defaultCourse = id || 'GET I';
    title = 'Neue Karteikarte anlegen';
    body = `
      <form id="studia-modal-form" class="form-stack" data-modal-submit="flashcard">
        <div class="field">
          <label for="f-course">Modul</label>
          <select id="f-course" name="course" class="select">
            ${(state.modules || [])
              .map(
                (m) =>
                  `<option value="${esc(m.courseKey)}" ${m.courseKey === defaultCourse ? 'selected' : ''}>${esc(m.short)}</option>`
              )
              .join('')}
          </select>
        </div>
        <div class="field">
          <label for="f-front">Frage / Begriff (Vorderseite)</label>
          <textarea id="f-front" name="front" class="textarea" rows="3" placeholder="z. B. Was besagt die Maschenregel?" required></textarea>
        </div>
        <div class="field">
          <label for="f-back">Antwort / Formel (Rückseite)</label>
          <textarea id="f-back" name="back" class="textarea" rows="4" placeholder="Kurze, knackige Antwort…" required></textarea>
        </div>
      </form>
    `;
    footer = `
      <button type="button" class="btn btn-ghost" data-action="close-modal">Abbrechen</button>
      <button type="submit" form="studia-modal-form" class="btn btn-primary">Karte speichern</button>
    `;
  } else if (type === 'grade') {
    title = 'Note in Notenspiegel eintragen';
    body = `
      <form id="studia-modal-form" class="form-stack" data-modal-submit="grade">
        <div class="field">
          <label for="f-title">Modulname</label>
          <input id="f-title" name="title" class="input" placeholder="z. B. Grundlagen der Elektrotechnik I" required />
        </div>
        <div class="form-row">
          <div class="field">
            <label for="f-grade">Note</label>
            <select id="f-grade" name="grade" class="select mono">
              ${GERMAN_GRADES.map((g) => `<option value="${g}" ${g === 1.7 ? 'selected' : ''}>${formatSingleGradeDE(g)}</option>`).join('')}
            </select>
          </div>
          <div class="field">
            <label for="f-ects">ECTS</label>
            <input id="f-ects" name="ects" type="number" min="1" max="30" value="5" class="input mono" required />
          </div>
        </div>
        <div class="field">
          <label for="f-sem">Semester</label>
          <input id="f-sem" name="semester" class="input" value="1. Sem." />
        </div>
      </form>
    `;
    footer = `
      <button type="button" class="btn btn-ghost" data-action="close-modal">Abbrechen</button>
      <button type="submit" form="studia-modal-form" class="btn btn-primary">Speichern</button>
    `;
  } else if (type === 'note') {
    const existing = id ? state.notes.find((n) => n.id === id) : null;
    title = existing ? 'Notiz bearbeiten' : 'Neue Uni-Notiz';
    body = `
      <form id="studia-modal-form" class="form-stack" data-modal-submit="note" data-id="${esc(existing?.id || '')}">
        <div class="form-row">
          <div class="field">
            <label for="f-title">Titel</label>
            <input id="f-title" name="title" class="input" value="${esc(existing?.title || '')}" required />
          </div>
          <div class="field">
            <label for="f-course">Tag</label>
            <input id="f-course" name="course" class="input" value="${esc(existing?.course || 'HSD')}" />
          </div>
        </div>
        <div class="field">
          <label for="f-content">Inhalt</label>
          <textarea id="f-content" name="content" class="textarea" rows="5" required>${esc(existing?.content || '')}</textarea>
        </div>
      </form>
    `;
    footer = `
      <button type="button" class="btn btn-ghost" data-action="close-modal">Abbrechen</button>
      <button type="submit" form="studia-modal-form" class="btn btn-primary">Speichern</button>
    `;
  } else if (type === 'quicklink') {
    title = 'Campus-Link hinzufügen';
    body = `
      <form id="studia-modal-form" class="form-stack" data-modal-submit="quicklink">
        <div class="field"><label for="f-label">Bezeichnung</label><input id="f-label" name="label" class="input" required /></div>
        <div class="field"><label for="f-sub">Kurzbeschreibung</label><input id="f-sub" name="sub" class="input" /></div>
        <div class="field"><label for="f-url">URL</label><input id="f-url" name="url" type="url" class="input" placeholder="https://..." required /></div>
      </form>
    `;
    footer = `
      <button type="button" class="btn btn-ghost" data-action="close-modal">Abbrechen</button>
      <button type="submit" form="studia-modal-form" class="btn btn-primary">Hinzufügen</button>
    `;
  } else if (type === 'settings') {
    title = 'Google-Konto & Einstellungen';
    body = renderSettingsBody(state, ui);
    footer = `<button type="button" class="btn btn-primary" data-action="close-modal">Fertig</button>`;
  }

  return `
    <div class="modal-backdrop" data-action="backdrop-close" role="dialog" aria-modal="true" aria-labelledby="modal-title-el">
      <div class="modal-sheet">
        <div class="sheet-handle"></div>
        <div class="modal-header">
          <h2 id="modal-title-el" class="modal-title">${esc(title)}</h2>
          <button class="icon-btn" data-action="close-modal" aria-label="Schließen">${ICONS.close}</button>
        </div>
        <div class="modal-body">${body}</div>
        <div class="modal-footer">${footer}</div>
      </div>
    </div>
  `;
}

function renderColorPicker(selected = 'sage') {
  return `
    <div class="field">
      <label>Farbakzent</label>
      <div class="color-picker-row">
        ${Object.entries(COURSE_COLORS)
          .map(
            ([key, val]) => `
          <label style="cursor:pointer;">
            <input type="radio" name="color" value="${key}" ${key === selected ? 'checked' : ''} style="display:none;" />
            <span class="color-swatch ${key === selected ? 'selected' : ''}" style="display:block; background:${val.hex};" data-action="pick-swatch" title="${val.label}"></span>
          </label>`
          )
          .join('')}
      </div>
    </div>
  `;
}

function renderCourseForm(existing) {
  const types = ['VL', 'ÜB', 'TUT', 'SEM', 'PR', 'LAB'];
  return `
    <form id="studia-modal-form" class="form-stack" data-modal-submit="course" data-id="${esc(existing?.id || '')}">
      <div class="field">
        <label for="f-title">Modul / Veranstaltung</label>
        <input id="f-title" name="title" class="input" value="${esc(existing?.title || '')}" required />
      </div>
      <div class="form-row">
        <div class="field">
          <label for="f-type">Typ</label>
          <select id="f-type" name="type" class="select">
            ${types.map((t) => `<option value="${t}" ${existing?.type === t ? 'selected' : ''}>${t}</option>`).join('')}
          </select>
        </div>
        <div class="field">
          <label for="f-day">Wochentag</label>
          <select id="f-day" name="day" class="select">
            ${WEEKDAYS_FULL.slice(0, 6).map((d, i) => `<option value="${i}" ${Number(existing?.day ?? 0) === i ? 'selected' : ''}>${d}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="form-row">
        <div class="field"><label for="f-start">Beginn</label><input id="f-start" name="start" type="time" class="input mono" value="${esc(existing?.start || '10:00')}" required /></div>
        <div class="field"><label for="f-end">Ende</label><input id="f-end" name="end" type="time" class="input mono" value="${esc(existing?.end || '11:45')}" required /></div>
      </div>
      <div class="form-row">
        <div class="field"><label for="f-room">Raum</label><input id="f-room" name="room" class="input" value="${esc(existing?.room || '')}" /></div>
        <div class="field"><label for="f-lecturer">Dozent:in</label><input id="f-lecturer" name="lecturer" class="input" value="${esc(existing?.lecturer || '')}" /></div>
      </div>
      <div class="form-row">
        <div class="field">
          <label for="f-parity">Rhythmus</label>
          <select id="f-parity" name="weekParity" class="select">
            <option value="all" ${!existing || existing.weekParity === 'all' ? 'selected' : ''}>Jede Woche</option>
            <option value="even" ${existing?.weekParity === 'even' ? 'selected' : ''}>Nur gerade KW</option>
            <option value="odd" ${existing?.weekParity === 'odd' ? 'selected' : ''}>Nur ungerade KW</option>
          </select>
        </div>
        <div class="field"><label for="f-ects">ECTS</label><input id="f-ects" name="ects" type="number" min="0" max="30" class="input mono" value="${existing?.ects ?? 5}" /></div>
      </div>
      ${renderColorPicker(existing?.color || 'sage')}
    </form>
  `;
}

function renderExamForm(existing, googleConnected) {
  const isGoogle = Boolean(existing?.fromGoogle);
  return `
    <form id="studia-modal-form" class="form-stack" data-modal-submit="exam" data-id="${esc(existing?.id || '')}" data-gkey="${esc(existing?.googleKey || '')}">
      ${
        isGoogle
          ? `<p class="text-xs text-secondary">Datum, Uhrzeit und Raum kommen live aus deinem <strong>Google Kalender</strong>. Hier pflegst du ECTS, Versuch und Hilfsmittel.</p>`
          : `
            <div class="field"><label for="f-title">Modul / Klausur</label><input id="f-title" name="title" class="input" value="${esc(existing?.title || '')}" required /></div>
            <div class="form-row">
              <div class="field"><label for="f-date">Datum</label><input id="f-date" name="date" type="date" class="input mono" value="${esc(existing?.date || addDays(30))}" required /></div>
              <div class="field"><label for="f-time">Uhrzeit</label><input id="f-time" name="time" type="time" class="input mono" value="${esc(existing?.time || '09:00')}" required /></div>
            </div>
            <div class="form-row">
              <div class="field"><label for="f-dur">Dauer (Min)</label><input id="f-dur" name="durationMin" type="number" min="15" max="360" class="input mono" value="${existing?.durationMin || 90}" /></div>
              <div class="field"><label for="f-room">Raum</label><input id="f-room" name="room" class="input" value="${esc(existing?.room || '')}" /></div>
            </div>
          `
      }
      <div class="form-row">
        <div class="field"><label for="f-ects">ECTS</label><input id="f-ects" name="ects" type="number" min="1" max="30" class="input mono" value="${existing?.ects ?? 5}" /></div>
        <div class="field">
          <label for="f-attempt">Prüfungsversuch</label>
          <select id="f-attempt" name="attempt" class="select">
            <option value="1" ${Number(existing?.attempt ?? 1) === 1 ? 'selected' : ''}>1. Versuch</option>
            <option value="2" ${Number(existing?.attempt) === 2 ? 'selected' : ''}>2. Versuch</option>
            <option value="3" ${Number(existing?.attempt) === 3 ? 'selected' : ''}>3. Versuch</option>
          </select>
        </div>
      </div>
      <div class="field"><label for="f-aids">Erlaubte Hilfsmittel</label><input id="f-aids" name="aids" class="input" value="${esc(existing?.aids || '')}" /></div>
      ${
        !existing && googleConnected
          ? `<label class="flex-row" style="font-size:0.85rem; cursor:pointer;"><input type="checkbox" name="pushGoogle" checked /><span>Direkt im Google Kalender anlegen</span></label>`
          : ''
      }
      ${renderColorPicker(existing?.color || 'sage')}
    </form>
  `;
}

function renderEventForm(defaultDate, googleConnected) {
  return `
    <form id="studia-modal-form" class="form-stack" data-modal-submit="event">
      <div class="field"><label for="f-title">Titel</label><input id="f-title" name="title" class="input" placeholder="z. B. GET I Praktikum" required /></div>
      <div class="form-row">
        <div class="field"><label for="f-date">Datum</label><input id="f-date" name="date" type="date" class="input mono" value="${esc(defaultDate)}" required /></div>
        <div class="field"><label for="f-location">Ort (optional)</label><input id="f-location" name="location" class="input" placeholder="z. B. 05.2.055" /></div>
      </div>
      <div class="form-row">
        <div class="field"><label for="f-start">Start</label><input id="f-start" name="start" type="time" class="input mono" value="14:00" required /></div>
        <div class="field"><label for="f-end">Ende</label><input id="f-end" name="end" type="time" class="input mono" value="15:30" required /></div>
      </div>
      <div class="field"><label for="f-notes">Notiz (optional)</label><textarea id="f-notes" name="notes" class="textarea" rows="3"></textarea></div>
      <label class="flex-row" style="cursor:pointer; font-size:0.86rem;">
        <input type="checkbox" name="pushGoogle" ${googleConnected ? 'checked' : ''} />
        <span>${googleConnected ? 'Direkt in meinen Google Kalender eintragen' : 'Zusätzlich als .ics für Google Kalender laden'}</span>
      </label>
    </form>
  `;
}

function renderSettingsBody(state, ui) {
  const g = state.google;
  const origin = window.location.origin;
  const fullRedirect = `${window.location.origin}${window.location.pathname}`;

  return `
    <div class="form-stack">
      <section>
        <h3 style="font-size:0.98rem; margin-bottom:10px; display:flex; align-items:center; gap:8px;">
          ${ICONS.google} Google Kalender & Klausur-Erkennung
        </h3>
        <div class="form-stack">
          <div class="field">
            <label for="set-client-id">Google Cloud OAuth 2.0 Client-ID</label>
            <input
              id="set-client-id"
              class="input mono"
              style="font-size:0.8rem;"
              value="${esc(g.clientId || DEFAULT_GOOGLE_CLIENT_ID)}"
              placeholder="922128740496-...apps.googleusercontent.com"
            />
          </div>

          <label class="flex-row" style="font-size:0.83rem; cursor:pointer;">
            <input id="set-readonly-toggle" type="checkbox" data-action="toggle-google-readonly" ${g.readOnlyMode ? 'checked' : ''} />
            <span>Nur-Lese-Modus (falls nur <code>calendar.readonly</code> freigegeben wurde)</span>
          </label>

          <div class="flex-row">
            <button type="button" class="btn btn-google" data-action="connect-google">
              ${ICONS.google} ${g.connected ? 'Konto wechseln / neu verbinden' : 'Mit Google-Konto anmelden'}
            </button>
            <button type="button" class="btn btn-secondary btn-sm" data-action="connect-google-redirect" title="Hilfreich falls Popups auf dem Pixel 8 oder iPad blockiert werden">
              Ohne Popup anmelden
            </button>
            ${
              g.connected
                ? `<button type="button" class="btn btn-secondary btn-sm" data-action="sync-google-now">${ICONS.sync} Sync</button>
                   <button type="button" class="btn btn-danger-soft btn-sm" data-action="disconnect-google">Trennen</button>`
                : ''
            }
          </div>

          ${
            ui.googleError
              ? `<div class="note-card" style="background:var(--status-danger-soft); color:var(--status-danger);">
                  <strong class="text-xs">Letzte Google-Meldung:</strong>
                  <div class="text-xs">${esc(ui.googleError)}</div>
                </div>`
              : ''
          }

          <details class="guide-details" ${!g.connected ? 'open' : ''}>
            <summary>Hilfe bei „Zugriff blockiert / Kein Zugriff“ trotz Testnutzer</summary>
            <ol>
              <li><strong>Richtige E-Mail &amp; Projekt prüfen:</strong> Öffne in Google Cloud das Projekt <code>922128740496</code> → <strong>Google Auth Platform → Zielgruppe (Audience) → Testnutzer</strong>. Achtung: <code>@gmail.com</code> und <code>@googlemail.com</code> sind für Google zwei getrennte Adressen — trage genau die Mail ein, mit der du dich anmeldest, und klicke unten auf <strong>Speichern</strong>.</li>
              <li><strong>Autorisierter JavaScript-Ursprung:</strong> Unter <em>Google Auth Platform → Clients → deine Client-ID</em> muss unter „Autorisierte JavaScript-Ursprünge“ exakt <code>${esc(origin)}</code> stehen (<strong>ohne</strong> <code>/studia-uni/</code> dahinter!). Für „Ohne Popup anmelden“ zusätzlich <code>${esc(fullRedirect)}</code> bei Weiterleitungs-URIs.</li>
              <li><strong>Scopes freigeben:</strong> Prüfe unter <em>APIs &amp; Dienste → Aktivierte APIs</em>, dass die <strong>Google Calendar API</strong> aktiv ist.</li>
              <li><strong>Warnbildschirm „App nicht überprüft“:</strong> Wenn Google warnt, tippe links unten auf <strong>„Erweitert“ → „Weiter zu … (unsicher)“</strong> — das ist bei privaten Test-Apps normal.</li>
            </ol>
          </details>

          <form class="form-stack" data-form="exam-keywords">
            <div class="field">
              <label for="set-keywords">Schlagwörter für automatische Klausur-Erkennung</label>
              <div class="inline-add-row" style="margin-top:0;">
                <input
                  id="set-keywords"
                  name="keywords"
                  class="input"
                  style="font-size:0.84rem;"
                  value="${esc((g.examKeywords || []).join(', '))}"
                />
                <button type="submit" class="btn btn-secondary btn-sm">Speichern</button>
              </div>
            </div>
          </form>

          ${
            g.connected && g.calendars?.length > 0
              ? `
                <div class="field">
                  <label>Angezeigte Google Kalender</label>
                  <div class="form-stack" style="gap:6px;">
                    ${g.calendars
                      .map(
                        (cal) => `
                      <label class="flex-row" style="font-size:0.86rem; cursor:pointer;">
                        <input type="checkbox" data-action="toggle-google-cal" value="${esc(cal.id)}" ${g.selectedCalendarIds.includes(cal.id) ? 'checked' : ''} />
                        <span>${esc(cal.summary)} ${cal.primary ? '(Hauptkalender)' : ''}</span>
                      </label>`
                      )
                      .join('')}
                  </div>
                </div>
                <div class="field">
                  <label for="set-write-cal">Ziel-Kalender für neue Studia-Termine</label>
                  <select id="set-write-cal" class="select" data-action="set-write-google-cal">
                    ${g.calendars
                      .filter((c) => c.accessRole === 'owner' || c.accessRole === 'writer')
                      .map((cal) => `<option value="${esc(cal.id)}" ${g.writeCalendarId === cal.id ? 'selected' : ''}>${esc(cal.summary)}</option>`)
                      .join('')}
                  </select>
                </div>
              `
              : ''
          }
        </div>
      </section>

      <hr style="border:none; border-top:1px solid var(--border-subtle); margin:4px 0;" />

      <section>
        <h3 style="font-size:0.98rem; margin-bottom:10px;">Studienprofil &amp; Backup</h3>
        <form class="form-stack" data-form="profile">
          <div class="form-row">
            <div class="field"><label for="p-degree">Studiengang</label><input id="p-degree" name="degree" class="input" value="${esc(state.profile.shortDegree || state.profile.degree)}" /></div>
            <div class="field"><label for="p-ects">Ziel-ECTS</label><input id="p-ects" name="targetEcts" type="number" min="30" max="360" class="input mono" value="${state.profile.targetEcts}" /></div>
          </div>
          <div class="field"><label for="p-sem">Aktuelles Semester</label><input id="p-sem" name="semester" class="input" value="${esc(state.profile.semester)}" /></div>
          <div class="flex-row">
            <button type="submit" class="btn btn-secondary btn-sm">Profil speichern</button>
            <button type="button" class="btn btn-secondary btn-sm" data-action="export-backup">${ICONS.download} Backup</button>
            <button type="button" class="btn btn-secondary btn-sm" data-action="import-backup">${ICONS.upload} Laden</button>
            <button type="button" class="btn btn-danger-soft btn-sm" data-action="reset-demo">WIE-1 Reset</button>
          </div>
        </form>
      </section>
    </div>
  `;
}
