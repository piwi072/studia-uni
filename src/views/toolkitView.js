import { ICONS } from '../components/icons.js';
import {
  COURSE_COLORS,
  GERMAN_GRADES,
  daysBetween,
  formatShortDateDE,
  isoDate,
} from '../data/defaults.js';
import { FOCUS_PRESETS, focusTimer, formatMMSS } from '../services/focusTimer.js';
import {
  GEMINI_MODELS,
  GEMINI_THINKING_LEVELS,
  getGeminiModel,
  getGeminiThinkingLevel,
  hasGeminiKey,
} from '../services/geminiTutor.js';
import { isPersonalBridgeConfigured } from '../services/personalBridge.js';
import {
  computeGpaStats,
  formatGradeDE,
  formatSingleGradeDE,
} from '../state/store.js';
import {
  computeBwlBonus,
  computeMatheBonus,
  normalizeBonusPoints,
} from '../utils/bonusPoints.js';
import { esc } from '../utils/html.js';
import { findHolidayForDate, nextLectureOccurrence } from '../utils/semester.js';
import {
  LEITNER_BOXES,
  getBoxMeta,
  getLeitnerStats,
  getModuleCardQueue,
  previewNextIntervals,
} from '../utils/spacedRepetition.js';
import { computeStudyAnalytics } from '../utils/studyStats.js';
import { renderTaskRow } from './todayView.js';

/* ==========================================================================
   STANDALONE VIEW: MODULE (Alle 6 Fächer vereint: NotebookLM, Infos, 5-Fächer
   Spaced-Repetition Karteikarten, Gemini KI-Tutor, fachspezifische Rechner)
   ========================================================================== */
export function renderModulesView(state, ui) {
  const todayIso = isoDate();
  const modules = state.modules || [];
  const activeId = modules.some((m) => m.id === ui.selectedModuleId)
    ? ui.selectedModuleId
    : modules[0]?.id;
  const mod = modules.find((m) => m.id === activeId);
  if (!mod) return `<div class="card empty-state"><strong>Keine Module vorhanden</strong></div>`;

  const col = COURSE_COLORS[mod.color] || COURSE_COLORS.sage;
  const totalDueAll = getLeitnerStats(state.flashcards || [], null, todayIso).dueCount;

  // Spaced Repetition (5-box Leitner)
  const leitnerStats = getLeitnerStats(state.flashcards || [], mod.courseKey, todayIso);
  const dueOnly = ui.cardDueOnly !== false; // default true
  const orderedCards = getModuleCardQueue(state.flashcards || [], mod.courseKey, {
    dueOnly,
    todayIso,
  });
  const cIdx = orderedCards.length > 0 ? (ui.cardIndex || 0) % orderedCards.length : 0;
  const currentCard = orderedCards[cIdx] || null;
  const flipped = Boolean(ui.cardFlipped);
  const cardBoxMeta = currentCard ? getBoxMeta(currentCard.box) : null;
  const intervals = currentCard ? previewNextIntervals(currentCard) : null;

  // Related tasks for this module
  const modTasks = (state.tasks || []).filter(
    (t) =>
      (t.course || '').toLowerCase() === mod.courseKey.toLowerCase() &&
      (!t.done || t.recurrence !== 'once')
  );

  // Study time logged for this module
  const modMins = (state.studySessions || [])
    .filter((s) => (s.course || '').toLowerCase() === mod.courseKey.toLowerCase())
    .reduce((sum, s) => sum + Number(s.minutes || 0), 0);

  const hasCustomNotebook =
    mod.notebookUrl &&
    mod.notebookUrl !== 'https://notebooklm.google.com/' &&
    mod.notebookUrl !== 'https://notebooklm.google.com';

  const bonus = normalizeBonusPoints(state.bonusPoints);
  const inlineBonusHtml = renderModuleInlineBonus(mod.id, bonus);

  return `
    <header class="page-header">
      <div>
        <div class="page-eyebrow">${modules.length} Module · ${totalDueAll} Karten heute fällig · Gemini 4 Neon Tutor</div>
        <h1 class="page-title">Module</h1>
      </div>
      <div class="page-actions">
        <a class="btn btn-secondary btn-sm" href="https://mdl.hs-duesseldorf.de/" target="_blank" rel="noopener noreferrer">
          HSD Moodle ${ICONS.external}
        </a>
        <a class="btn btn-secondary btn-sm" href="https://ecampus.hs-duesseldorf.de/" target="_blank" rel="noopener noreferrer">
          eCampus ${ICONS.external}
        </a>
      </div>
    </header>

    <!-- 6-Module Switcher -->
    <div class="module-pill-grid" role="tablist" aria-label="Modul auswählen">
      ${modules
        .map((m) => {
          const mc = COURSE_COLORS[m.color] || COURSE_COLORS.sage;
          const mStats = getLeitnerStats(state.flashcards || [], m.courseKey, todayIso);
          const isAct = m.id === mod.id;
          return `
            <button
              class="module-pill ${isAct ? 'active' : ''}"
              data-action="select-module"
              data-id="${esc(m.id)}"
              role="tab"
              aria-selected="${isAct}"
            >
              <span class="module-dot" style="background:${mc.hex}"></span>
              <span class="module-pill-body">
                <strong>${esc(m.short)}</strong>
                <span class="text-xs text-muted">
                  ${mStats.dueCount > 0 ? `<strong style="color:var(--accent-primary);">${mStats.dueCount} fällig</strong> · ` : ''}${mStats.total} Karten
                </span>
              </span>
            </button>`;
        })
        .join('')}
    </div>

    <!-- Active Module Header Card -->
    <section class="card mt-md" style="margin-bottom:18px;">
      <div class="flex-between" style="flex-wrap:wrap; gap:14px;">
        <div>
          <div class="flex-row" style="gap:6px; margin-bottom:6px;">
            <span class="badge ${col.badge} mono">${mod.ects} ECTS</span>
            <span class="badge badge-neutral">${esc(mod.room)}</span>
            <span class="badge badge-neutral">${esc(mod.lecturer)}</span>
            ${modMins > 0 ? `<span class="badge badge-sage mono">${modMins} Min gelernt</span>` : ''}
          </div>
          <h2 style="font-size:1.22rem; font-weight:800;">${esc(mod.title)}</h2>
          <div class="text-xs text-secondary mt-sm">${esc(mod.schedule)}</div>
        </div>

        <div class="flex-row" style="gap:7px;">
          <a
            class="btn btn-primary btn-sm"
            href="${esc(mod.notebookUrl || 'https://notebooklm.google.com/')}"
            target="_blank"
            rel="noopener noreferrer"
          >
            ${esc(hasCustomNotebook ? (mod.notebookLabel || 'Mein Notebook') : 'NotebookLM öffnen')} ${ICONS.external}
          </a>
          <button
            class="btn btn-secondary btn-sm"
            data-action="open-modal"
            data-modal="module-notebook"
            data-id="${esc(mod.id)}"
          >
            ${ICONS.edit} Notebook-Link
          </button>
          <a
            class="btn btn-ghost btn-sm"
            href="${esc(mod.moodleUrl || 'https://mdl.hs-duesseldorf.de/')}"
            target="_blank"
            rel="noopener noreferrer"
          >
            Moodle ${ICONS.external}
          </a>
          <button
            class="btn btn-soft btn-sm"
            data-action="start-focus-quick"
            data-subject="${esc(mod.courseKey)}"
          >
            ${ICONS.play} Fokus
          </button>
        </div>
      </div>

      ${inlineBonusHtml}

      ${
        modTasks.length > 0
          ? `<div class="mt-md" style="padding-top:12px; border-top:1px solid var(--border-subtle);">
              <div class="text-xs fw-600 text-muted" style="margin-bottom:6px;">Aktive Abgabe in diesem Modul</div>
              <div class="task-list">${modTasks.map((t) => renderTaskRow(t)).join('')}</div>
            </div>`
          : ''
      }
    </section>

    <!-- Main 2-Column Workspace: Spaced-Repetition Flashcards + Notebook Infos -->
    <div class="toolkit-grid">
      <!-- Left: 5-Box Leitner Flashcards -->
      <section class="card">
        <div class="section-head">
          <div>
            <h3 class="section-title">Karteikarten · ${esc(mod.short)}</h3>
            <div class="text-xs text-muted">
              5-Fächer Spaced Repetition · ${leitnerStats.dueCount} heute fällig · ${leitnerStats.masteredCount}/${leitnerStats.total} sicher
            </div>
          </div>
          <div class="flex-row" style="gap:5px;">
            <button
              class="btn btn-soft btn-sm"
              data-action="open-modal"
              data-modal="import-notebook-cards"
              data-id="${esc(mod.id)}"
              title="Fragen & Antworten aus NotebookLM einfügen"
            >
              Aus Notebook
            </button>
            <button
              class="btn btn-secondary btn-sm"
              data-action="open-modal"
              data-modal="flashcard"
              data-id="${esc(mod.courseKey)}"
            >
              ${ICONS.plus} Karte
            </button>
          </div>
        </div>

        <!-- Due vs All Filter + 5-Box Leitner Strip -->
        <div class="flex-between" style="flex-wrap:wrap; gap:8px; margin-bottom:12px;">
          <div class="segmented-bar" role="tablist" aria-label="Kartenfilter">
            <button class="segment-btn ${dueOnly ? 'active' : ''}" data-action="set-card-due-filter" data-value="due">
              Heute fällig (${leitnerStats.dueCount})
            </button>
            <button class="segment-btn ${!dueOnly ? 'active' : ''}" data-action="set-card-due-filter" data-value="all">
              Alle (${leitnerStats.total})
            </button>
          </div>
          <div class="leitner-strip" title="Verteilung über die 5 Leitner-Fächer (1, 3, 7, 14, 30 Tage)">
            ${LEITNER_BOXES.map(
              (b, idx) => `
              <span class="leitner-pip ${leitnerStats.boxes[idx] > 0 ? 'has-cards' : ''}" title="${b.label} (${b.days} Tage)">
                F${b.box}: <strong>${leitnerStats.boxes[idx]}</strong>
              </span>`
            ).join('')}
          </div>
        </div>

        ${
          leitnerStats.total === 0
            ? `<div class="empty-state">
                <strong>Noch keine Karteikarten für ${esc(mod.short)}</strong>
                Lege eigene Karten an, importiere aus NotebookLM oder lass unten den KI-Tutor welche erstellen!
              </div>`
            : !currentCard
              ? `<div class="empty-state" style="padding:26px 14px;">
                  <strong>Alle fälligen Karten für ${esc(mod.short)} geschafft!</strong>
                  Du bist für heute auf Stand. Komm morgen wieder oder übe trotzdem alle ${leitnerStats.total} Karten.
                  <div class="mt-md">
                    <button class="btn btn-secondary btn-sm" data-action="set-card-due-filter" data-value="all">
                      Alle ${leitnerStats.total} Karten anzeigen
                    </button>
                  </div>
                </div>`
              : `
                <div class="flashcard-stage" data-action="card-flip" role="button" tabindex="0" aria-label="Karte umdrehen">
                  <div class="flashcard-box ${flipped ? 'is-flipped' : ''}" style="min-height:195px; padding:20px;">
                    <div class="flex-between">
                      <span class="badge ${cardBoxMeta.badgeClass}">
                        ${esc(cardBoxMeta.label)}
                      </span>
                      <span class="text-xs mono text-muted">${cIdx + 1} / ${orderedCards.length}</span>
                    </div>
                    <div>
                      <div class="text-xs text-muted fw-600" style="text-transform:uppercase; letter-spacing:0.06em; margin-bottom:6px;">
                        ${flipped ? 'Antwort' : 'Frage'}
                      </div>
                      <div class="flashcard-text">${esc(flipped ? currentCard.back : currentCard.front)}</div>
                    </div>
                    <div class="flex-between text-xs text-muted">
                      <span>${flipped ? 'Unten nach Sicherheit bewerten' : 'Tippen zum Umdrehen'}</span>
                      <span class="mono">${currentCard.nextReview && currentCard.nextReview > todayIso ? `Nächste: ${formatShortDateDE(currentCard.nextReview)}` : 'Heute fällig'}</span>
                    </div>
                  </div>
                </div>

                <div class="flex-between mt-md" style="flex-wrap:wrap; gap:8px;">
                  <div class="flex-row" style="gap:5px;">
                    <button class="btn btn-secondary btn-sm" data-action="card-prev" aria-label="Vorherige Karte">${ICONS.chevronLeft}</button>
                    <button class="btn btn-secondary btn-sm" data-action="card-flip">${flipped ? 'Frage' : 'Antwort'}</button>
                    <button class="icon-btn" style="width:32px;height:32px;" data-action="delete-flashcard" data-id="${esc(currentCard.id)}" aria-label="Karte löschen">${ICONS.trash}</button>
                  </div>
                  <div class="flex-row" style="gap:5px;">
                    <button class="btn btn-danger-soft btn-sm" data-action="card-rate" data-id="${esc(currentCard.id)}" data-result="again">
                      Nochmal <span class="mono" style="opacity:0.8;">(${intervals.againLabel})</span>
                    </button>
                    <button class="btn btn-secondary btn-sm" data-action="card-rate" data-id="${esc(currentCard.id)}" data-result="hard">
                      Schwer <span class="mono" style="opacity:0.8;">(${intervals.hardLabel})</span>
                    </button>
                    <button class="btn btn-primary btn-sm" data-action="card-rate" data-id="${esc(currentCard.id)}" data-result="good">
                      ${ICONS.check} Gewusst <span class="mono" style="opacity:0.85;">(${intervals.goodLabel})</span>
                    </button>
                  </div>
                </div>
              `
        }
      </section>

      <!-- Right: Notebook Infos & Imported Knowledge -->
      <section class="card">
        <div class="section-head">
          <div>
            <h3 class="section-title">Notebook-Infos & Skript-Notizen</h3>
            <div class="text-xs text-muted">Offline-Zusammenfassungen aus NotebookLM / Moodle</div>
          </div>
          <div class="flex-row" style="gap:5px;">
            <button
              class="btn btn-secondary btn-sm"
              data-action="import-module-file"
              data-id="${esc(mod.id)}"
              title="Markdown- oder Textdatei (.md / .txt) ins Modul importieren"
            >
              ${ICONS.upload} .md/.txt
            </button>
            <button
              class="btn btn-soft btn-sm"
              data-action="open-modal"
              data-modal="module-note"
              data-id="${esc(mod.id)}"
            >
              ${ICONS.plus} Info
            </button>
          </div>
        </div>

        ${
          (mod.notebookNotes || []).length === 0
            ? `<div class="empty-state" style="padding:20px 12px;">
                <strong>Noch keine Infos aus deinem Notebook gespeichert</strong>
                Kopiere Zusammenfassungen über „+ Info“ hinein — oder nutze auf dem Pixel 8 direkt <strong>„Teilen → Studia“</strong> in NotebookLM/Moodle!
              </div>`
            : `<div class="timeline-list">
                ${(mod.notebookNotes || [])
                  .map(
                    (nn) => `
                  <article class="note-card">
                    <div class="flex-between">
                      <strong style="font-size:0.9rem;">${esc(nn.title)}</strong>
                      <button
                        class="icon-btn"
                        style="width:26px;height:26px;"
                        data-action="delete-module-note"
                        data-mod-id="${esc(mod.id)}"
                        data-note-id="${esc(nn.id)}"
                        aria-label="Info löschen"
                      >
                        ${ICONS.trash}
                      </button>
                    </div>
                    <div class="note-content">${esc(nn.content)}</div>
                    <div class="text-xs text-muted">${formatShortDateDE(nn.updatedAt)}</div>
                  </article>`
                  )
                  .join('')}
              </div>`
        }

        <details class="guide-details mt-md">
          <summary>Tipp: Inhalte direkt vom Handy teilen</summary>
          <div class="text-xs text-secondary mt-sm">
            Wenn Studia als App installiert ist, markiere in NotebookLM, Moodle oder Chrome Text oder einen Link → <strong>Teilen → Studia</strong>. Dann landet der Inhalt direkt hier als Info oder Karteikarte.
          </div>
        </details>
      </section>
    </div>

    <!-- Gemini KI-Tutor Section -->
    <div class="mt-lg">
      ${renderGeminiTutorCard(mod, ui)}
    </div>

    <!-- Module-Specific Calculator & Formula Cheat Sheet -->
    <div class="mt-lg">
      ${renderModuleTools(mod, ui)}
    </div>
  `;
}

function renderGeminiTutorCard(mod, ui) {
  const keyConfigured = hasGeminiKey();
  const activeModel = getGeminiModel();
  const modelMeta = GEMINI_MODELS.find((m) => m.id === activeModel) || GEMINI_MODELS[0];
  const thinkingLevel = getGeminiThinkingLevel();
  const mode = ui.tutorMode || 'cards'; // 'cards' | 'explain' | 'exam'
  const loading = Boolean(ui.tutorLoading);
  const error = ui.tutorError || '';
  const result = ui.tutorResultByModule?.[mod.id] || null;
  const noteCount = (mod.notebookNotes || []).length;

  const submitLabel =
    mode === 'cards'
      ? loading
        ? `${modelMeta.short} denkt nach…`
        : `6 Karten mit ${modelMeta.short}`
      : mode === 'explain'
        ? loading
          ? 'Erklärung wird erstellt…'
          : `Mit ${modelMeta.short} erklären`
        : loading
          ? 'Fragen werden erstellt…'
          : `3 Probefragen mit ${modelMeta.short}`;

  return `
    <section class="card tutor-card" aria-label="KI-Tutor mit Gemini 4 Neon">
      <div class="section-head" style="margin-bottom:12px; flex-wrap:wrap; gap:10px;">
        <div>
          <div class="flex-row" style="gap:7px;">
            <h3 class="section-title" style="display:flex; align-items:center; gap:7px;">
              ${ICONS.sparkles} KI-Tutor · ${esc(mod.short)}
            </h3>
            <span class="badge ${modelMeta.id === 'gemini-4-neon' ? 'badge-terracotta' : 'badge-sage'} mono">${esc(modelMeta.short)}</span>
          </div>
          <div class="text-xs text-muted">
            Direkt per API (Gemini 4 Neon / Hydrogen) oder per 1-Klick-Prompt in deiner <strong>Gemini Pro App</strong>
          </div>
        </div>

        <div class="flex-row" style="gap:6px;">
          <select
            class="select mono"
            style="width:auto; min-height:34px; padding:4px 10px; font-size:0.78rem;"
            data-action="change-gemini-model"
            aria-label="Gemini-Modell wählen"
          >
            ${GEMINI_MODELS.map(
              (m) => `<option value="${esc(m.id)}" ${m.id === activeModel ? 'selected' : ''}>${esc(m.short)}${m.isPro ? ' (Pro)' : ' (Free)'}</option>`
            ).join('')}
          </select>
          ${
            modelMeta.supportsThinkingLevel
              ? `<select
                  class="select mono"
                  style="width:auto; min-height:34px; padding:4px 10px; font-size:0.78rem;"
                  data-action="change-gemini-thinking"
                  aria-label="Denktiefe wählen"
                  title="Thinking-Level für Gemini 4 Neon / Hydrogen"
                >
                  ${GEMINI_THINKING_LEVELS.map(
                    (tl) => `<option value="${esc(tl.id)}" ${tl.id === thinkingLevel ? 'selected' : ''}>Denktiefe: ${esc(tl.id)}</option>`
                  ).join('')}
                </select>`
              : ''
          }
          <button class="btn btn-ghost btn-sm" data-action="open-modal" data-modal="settings">
            ${ICONS.settings} Key
          </button>
        </div>
      </div>

      <div class="segmented-bar" role="tablist" aria-label="KI-Tutor Modus" style="margin-bottom:12px;">
        <button class="segment-btn ${mode === 'cards' ? 'active' : ''}" data-action="set-tutor-mode" data-value="cards">
          Karten
        </button>
        <button class="segment-btn ${mode === 'explain' ? 'active' : ''}" data-action="set-tutor-mode" data-value="explain">
          Erklären
        </button>
        <button class="segment-btn ${mode === 'exam' ? 'active' : ''}" data-action="set-tutor-mode" data-value="exam">
          Probefragen
        </button>
      </div>

      <form class="form-stack" data-form="tutor-run" data-mod-id="${esc(mod.id)}" data-mode="${esc(mode)}">
        ${
          mode === 'cards'
            ? `
              <div class="field">
                <label for="tutor-prompt">Thema (optional — sonst werden deine ${noteCount} Modul-Notizen ausgewertet)</label>
                <input
                  id="tutor-prompt"
                  name="prompt"
                  class="input"
                  placeholder="z. B. Spannungsteiler &amp; Kirchhoff oder leer lassen für Modul-Notizen…"
                />
              </div>
            `
            : mode === 'explain'
              ? `
                <div class="field">
                  <label for="tutor-prompt">Übungsaufgabe oder Konzept aus ${esc(mod.short)}</label>
                  <textarea
                    id="tutor-prompt"
                    name="prompt"
                    class="textarea"
                    rows="3"
                    placeholder="Füge deine Mathe-I-Aufgabe, GET-Schaltung oder BWL-Rechnung ein…"
                    required
                  ></textarea>
                </div>
              `
              : `
                <div class="field">
                  <label for="tutor-prompt">Schwerpunkt für die Klausur-Simulation (optional)</label>
                  <input
                    id="tutor-prompt"
                    name="prompt"
                    class="input"
                    placeholder="z. B. Komplexe Zahlen, Zweierkomplement, Break-Even…"
                  />
                </div>
              `
        }

        <div class="flex-row" style="gap:8px;">
          ${
            keyConfigured
              ? `<button type="submit" class="btn btn-primary btn-sm" ${loading ? 'disabled' : ''}>
                  ${ICONS.sparkles} ${esc(submitLabel)}
                </button>`
              : ''
          }
          <button
            type="button"
            class="btn ${keyConfigured ? 'btn-secondary' : 'btn-primary'} btn-sm"
            data-action="tutor-open-gemini-app"
            data-mod-id="${esc(mod.id)}"
            data-mode="${esc(mode)}"
            title="Kopiert den fertigen Modul-Prompt in die Zwischenablage und öffnet die Gemini Pro App (mit Gemini 4 Neon)"
          >
            In Gemini Pro (Neon) öffnen ${ICONS.external}
          </button>
        </div>
      </form>

      ${
        !keyConfigured
          ? `
            <details class="guide-details mt-md">
              <summary>Optional: AI-Studio API-Key für direkte Generierung in Studia hinterlegen</summary>
              <div class="text-xs text-secondary mt-sm">
                Mit <strong>Google AI Pro</strong> kannst du in Google AI Studio deine monatlichen API-Credits für <strong>Gemini 4 Neon</strong> aktivieren — oder <strong>Gemini 4 Hydrogen</strong> kostenlos nutzen. Der Key bleibt nur auf diesem Gerät.
              </div>
              <form class="inline-add-row mt-sm" data-form="save-gemini-key">
                <input
                  type="password"
                  name="apiKey"
                  class="input mono"
                  style="font-size:0.84rem;"
                  placeholder="AIzaSy…"
                  autocomplete="off"
                  required
                />
                <button type="submit" class="btn btn-primary btn-sm">Speichern</button>
                <a
                  class="btn btn-secondary btn-sm"
                  href="https://aistudio.google.com/apikey"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  AI Studio Key ${ICONS.external}
                </a>
              </form>
            </details>
          `
          : ''
      }

      ${
        error
          ? `<div class="note-card mt-md" style="background:var(--status-danger-soft); color:var(--status-danger);">
              <div class="text-xs fw-700">KI-Tutor Hinweis</div>
              <div class="text-xs">${esc(error)}</div>
              ${
                ui.tutorCanFallbackHydrogen
                  ? `<div class="flex-row mt-sm">
                      <button type="button" class="btn btn-secondary btn-sm" data-action="tutor-switch-hydrogen">
                        Auf Gemini 4 Hydrogen (Free) wechseln
                      </button>
                      <button type="button" class="btn btn-soft btn-sm" data-action="tutor-open-gemini-app" data-mod-id="${esc(mod.id)}" data-mode="${esc(mode)}">
                        In Gemini Pro App öffnen ${ICONS.external}
                      </button>
                    </div>`
                  : ''
              }
            </div>`
          : ''
      }

      ${renderTutorResult(mod, result)}
    </section>
  `;
}

function renderTutorResult(mod, result) {
  if (!result) return '';

  if (result.type === 'cards') {
    const cards = result.cards || [];
    return `
      <div class="tutor-output mt-md">
        <div class="flex-between" style="flex-wrap:wrap; margin-bottom:10px;">
          <strong class="text-sm">${cards.length} Karteikarten-Vorschläge für ${esc(mod.short)}</strong>
          <div class="flex-row">
            <button class="btn btn-primary btn-sm" data-action="tutor-accept-cards" data-mod-id="${esc(mod.id)}">
              ${ICONS.check} Alle ${cards.length} übernehmen
            </button>
            <button class="btn btn-ghost btn-sm" data-action="tutor-clear" data-mod-id="${esc(mod.id)}">Verwerfen</button>
          </div>
        </div>
        <div class="timeline-list">
          ${cards
            .map(
              (c) => `
            <div class="note-card">
              <div class="fw-700 text-xs">${esc(c.front)}</div>
              <div class="text-xs text-secondary" style="white-space:pre-wrap;">${esc(c.back)}</div>
            </div>`
            )
            .join('')}
        </div>
      </div>
    `;
  }

  if (result.type === 'explain') {
    return `
      <div class="tutor-output mt-md">
        <div class="flex-between" style="margin-bottom:8px;">
          <strong class="text-sm">Erklärung (${esc(mod.short)})</strong>
          <div class="flex-row">
            <button class="btn btn-soft btn-sm" data-action="tutor-save-note" data-mod-id="${esc(mod.id)}">
              Als Modul-Info speichern
            </button>
            <button class="btn btn-ghost btn-sm" data-action="tutor-clear" data-mod-id="${esc(mod.id)}">Leeren</button>
          </div>
        </div>
        <div class="tutor-answer-text">${esc(result.text)}</div>
      </div>
    `;
  }

  if (result.type === 'exam') {
    const items = result.items || [];
    if (items.length === 0) {
      return `
        <div class="tutor-output mt-md">
          <div class="tutor-answer-text">${esc(result.rawText || '')}</div>
        </div>
      `;
    }
    return `
      <div class="tutor-output mt-md">
        <div class="flex-between" style="margin-bottom:10px;">
          <strong class="text-sm">Klausur-Probefragen · ${esc(mod.short)}</strong>
          <button class="btn btn-ghost btn-sm" data-action="tutor-clear" data-mod-id="${esc(mod.id)}">Leeren</button>
        </div>
        <div class="timeline-list">
          ${items
            .map(
              (item, idx) => `
            <div class="note-card">
              <div class="flex-between" style="align-items:flex-start;">
                <div class="fw-700 text-sm" style="white-space:pre-wrap;">${idx + 1}. ${esc(item.question)}</div>
                <button
                  class="btn btn-soft btn-sm"
                  style="flex-shrink:0;"
                  data-action="tutor-save-question-card"
                  data-mod-id="${esc(mod.id)}"
                  data-idx="${idx}"
                >
                  + Karte
                </button>
              </div>
              <details class="guide-details mt-sm" style="margin-top:8px;">
                <summary>Musterlösung anzeigen</summary>
                <div class="text-xs text-secondary mt-sm" style="white-space:pre-wrap;">${esc(item.solution)}</div>
              </details>
            </div>`
            )
            .join('')}
        </div>
      </div>
    `;
  }

  return '';
}

/* ---------- Tailored Tools & Formula Sheets per Module ---------- */
function renderModuleTools(mod, ui) {
  const c = ui.calc || {};

  if (mod.toolType === 'get') {
    const prefixes = [
      { key: 'p', label: 'Piko (p)', exp: -12 },
      { key: 'n', label: 'Nano (n)', exp: -9 },
      { key: 'µ', label: 'Mikro (µ)', exp: -6 },
      { key: 'm', label: 'Milli (m)', exp: -3 },
      { key: '', label: 'Basis (1)', exp: 0 },
      { key: 'k', label: 'Kilo (k)', exp: 3 },
      { key: 'M', label: 'Mega (M)', exp: 6 },
      { key: 'G', label: 'Giga (G)', exp: 9 },
    ];
    const curExp = prefixes.find((p) => p.key === c.prefixUnit)?.exp ?? -9;
    const baseVal = Number(c.prefixVal || 0) * Math.pow(10, curExp);
    const ohmRes = solveOhm(c.ohmU, c.ohmI, c.ohmR, c.ohmP);
    const r1 = Number(c.r1 || 0);
    const r2 = Number(c.r2 || 0);
    const uIn = Number(c.uIn || 0);
    const rSeries = r1 + r2;
    const rParallel = r1 > 0 && r2 > 0 ? (r1 * r2) / (r1 + r2) : 0;
    const u2 = r1 + r2 > 0 ? (uIn * r2) / (r1 + r2) : 0;

    return `
      <div class="calc-grid">
        <section class="card">
          <div class="section-head">
            <div>
              <h3 class="section-title">SI-Präfix-Umrechner</h3>
              <div class="text-xs text-muted">Für Ω, F, H, A & V</div>
            </div>
          </div>
          <div class="form-row">
            <div class="field">
              <label for="calc-prefix-val">Wert</label>
              <input id="calc-prefix-val" class="input mono" type="number" step="any" value="${esc(c.prefixVal)}" data-calc="prefixVal" />
            </div>
            <div class="field">
              <label for="calc-prefix-unit">Präfix</label>
              <select id="calc-prefix-unit" class="select" data-calc="prefixUnit">
                ${prefixes.map((p) => `<option value="${p.key}" ${p.key === c.prefixUnit ? 'selected' : ''}>${p.label}</option>`).join('')}
              </select>
            </div>
          </div>
          <div class="prefix-grid">
            ${prefixes
              .map(
                (p) => `
              <div class="prefix-cell ${p.key === c.prefixUnit ? 'active' : ''}">
                <span class="text-xs text-muted">${p.label}</span>
                <strong class="mono text-xs">${fmtEng(baseVal / Math.pow(10, p.exp))} ${p.key}</strong>
              </div>`
              )
              .join('')}
          </div>
        </section>

        <section class="card">
          <div class="section-head">
            <div>
              <h3 class="section-title">Ohmsches Gesetz & Leistung</h3>
              <div class="text-xs text-muted">Beliebige 2 Werte eingeben</div>
            </div>
            <button class="btn btn-ghost btn-sm" data-action="calc-ohm-clear">Leeren</button>
          </div>
          <div class="form-row">
            <div class="field"><label for="calc-ohm-u">U (V)</label><input id="calc-ohm-u" class="input mono" type="number" step="any" value="${esc(c.ohmU)}" data-calc="ohmU" /></div>
            <div class="field"><label for="calc-ohm-i">I (A)</label><input id="calc-ohm-i" class="input mono" type="number" step="any" value="${esc(c.ohmI)}" data-calc="ohmI" /></div>
          </div>
          <div class="form-row mt-sm">
            <div class="field"><label for="calc-ohm-r">R (Ω)</label><input id="calc-ohm-r" class="input mono" type="number" step="any" value="${esc(c.ohmR)}" data-calc="ohmR" /></div>
            <div class="field"><label for="calc-ohm-p">P (W)</label><input id="calc-ohm-p" class="input mono" type="number" step="any" value="${esc(c.ohmP)}" data-calc="ohmP" /></div>
          </div>
          ${
            ohmRes
              ? `<div class="calc-result-row">
                  <div class="calc-result-box"><div class="text-xs text-muted">U</div><div class="mono fw-700">${fmtEng(ohmRes.U)} V</div></div>
                  <div class="calc-result-box"><div class="text-xs text-muted">I</div><div class="mono fw-700">${fmtEng(ohmRes.I * 1000)} mA</div></div>
                  <div class="calc-result-box"><div class="text-xs text-muted">R</div><div class="mono fw-700">${fmtEng(ohmRes.R)} Ω</div></div>
                  <div class="calc-result-box"><div class="text-xs text-muted">P</div><div class="mono fw-700">${fmtEng(ohmRes.P)} W</div></div>
                </div>`
              : `<div class="text-xs text-muted mt-md">Genau 2 positive Werte eingeben (z. B. U = 12, R = 220).</div>`
          }
        </section>

        <section class="card">
          <h3 class="section-title">Reihe, Parallel & Spannungsteiler</h3>
          <div class="form-row mt-md">
            <div class="field"><label for="calc-r1">R₁ (Ω)</label><input id="calc-r1" class="input mono" type="number" step="any" value="${esc(c.r1)}" data-calc="r1" /></div>
            <div class="field"><label for="calc-r2">R₂ (Ω)</label><input id="calc-r2" class="input mono" type="number" step="any" value="${esc(c.r2)}" data-calc="r2" /></div>
          </div>
          <div class="field mt-sm"><label for="calc-uin">U_ges (V)</label><input id="calc-uin" class="input mono" type="number" step="any" value="${esc(c.uIn)}" data-calc="uIn" /></div>
          <div class="calc-result-row">
            <div class="calc-result-box"><div class="text-xs text-muted">Reihe</div><div class="mono fw-700">${fmtEng(rSeries)} Ω</div></div>
            <div class="calc-result-box"><div class="text-xs text-muted">Parallel</div><div class="mono fw-700">${fmtEng(rParallel)} Ω</div></div>
          </div>
          <div class="calc-result-box mt-sm flex-between">
            <span class="text-xs text-muted">Spannungsteiler U₂</span>
            <strong class="mono">${fmtEng(u2)} V</strong>
          </div>
        </section>

        <section class="card">
          <h3 class="section-title">GET-I Formelsammlung</h3>
          <div class="formula-list">
            <div class="formula-item"><span>Ohmsches Gesetz</span><code class="mono">U = R · I</code></div>
            <div class="formula-item"><span>Leistung</span><code class="mono">P = U · I = I²·R = U²/R</code></div>
            <div class="formula-item"><span>Spannungsteiler</span><code class="mono">U₂ = U · R₂ / (R₁ + R₂)</code></div>
            <div class="formula-item"><span>RC-Zeitkonstante</span><code class="mono">τ = R · C</code></div>
            <div class="formula-item"><span>Leiterwiderstand</span><code class="mono">R = ρ · l / A</code></div>
          </div>
        </section>
      </div>
    `;
  }

  if (mod.toolType === 'mathe') {
    const re = Number(c.cplxRe ?? 3);
    const im = Number(c.cplxIm ?? 4);
    const mag = Math.hypot(re, im);
    const rad = Math.atan2(im, re);
    const deg = (rad * 180) / Math.PI;
    return `
      <div class="calc-grid">
        <section class="card">
          <div class="section-head">
            <div>
              <h3 class="section-title">Komplexe Zahlen: Kartesisch → Polar</h3>
              <div class="text-xs text-muted">z = a + j·b direkt in Betrag & Winkel umrechnen</div>
            </div>
          </div>
          <div class="form-row">
            <div class="field"><label for="calc-re">Realteil a</label><input id="calc-re" class="input mono" type="number" step="any" value="${esc(c.cplxRe ?? '3')}" data-calc="cplxRe" /></div>
            <div class="field"><label for="calc-im">Imaginärteil b</label><input id="calc-im" class="input mono" type="number" step="any" value="${esc(c.cplxIm ?? '4')}" data-calc="cplxIm" /></div>
          </div>
          <div class="calc-result-row">
            <div class="calc-result-box"><div class="text-xs text-muted">Betrag r = |z|</div><div class="mono fw-700">${fmtEng(mag)}</div></div>
            <div class="calc-result-box"><div class="text-xs text-muted">Winkel φ</div><div class="mono fw-700">${deg.toFixed(2).replace('.', ',')}° <span class="text-xs text-muted">(${rad.toFixed(3).replace('.', ',')} rad)</span></div></div>
          </div>
          <div class="calc-result-box mt-sm flex-between">
            <span class="text-xs text-muted">Polarform</span>
            <strong class="mono">${fmtEng(mag)} · e^(j · ${deg.toFixed(1).replace('.', ',')}°)</strong>
          </div>
        </section>

        <section class="card">
          <h3 class="section-title">Mathe-I Spickzettel</h3>
          <div class="formula-list">
            <div class="formula-item"><span>Euler-Formel</span><code class="mono">e^(jφ) = cos(φ) + j·sin(φ)</code></div>
            <div class="formula-item"><span>Komplex konjugiert</span><code class="mono">z·z* = a² + b² = |z|²</code></div>
            <div class="formula-item"><span>Gaußsche Summenformel</span><code class="mono">Σ k = n·(n+1) / 2</code></div>
            <div class="formula-item"><span>Produktregel</span><code class="mono">(u·v)' = u'·v + u·v'</code></div>
            <div class="formula-item"><span>Kettenregel</span><code class="mono">f(g(x))' = f'(g(x)) · g'(x)</code></div>
          </div>
        </section>
      </div>
    `;
  }

  if (mod.toolType === 'it') {
    const rawDec = String(c.numDec ?? '181').trim();
    const num = Number.parseInt(rawDec, 10);
    const valid = Number.isFinite(num);
    const unsigned8 = valid ? num & 0xff : 0;
    const binStr = valid
      ? (num >= 0 ? num.toString(2) : `−${Math.abs(num).toString(2)}`)
      : '–';
    const hexStr = valid
      ? (num >= 0 ? `0x${num.toString(16).toUpperCase()}` : `−0x${Math.abs(num).toString(16).toUpperCase()}`)
      : '–';
    const twos8 = valid && num >= -128 && num <= 127
      ? unsigned8.toString(2).padStart(8, '0').replace(/(.{4})/, '$1 ')
      : 'außerhalb −128…127';

    return `
      <div class="calc-grid">
        <section class="card">
          <div class="section-head">
            <div>
              <h3 class="section-title">Zahlensystem-Umrechner</h3>
              <div class="text-xs text-muted">Dezimal ↔ Binär, Hexadezimal & 8-Bit Zweierkomplement</div>
            </div>
          </div>
          <div class="field">
            <label for="calc-num-dec">Dezimalzahl (auch negativ für 8-Bit Zweierkomplement)</label>
            <input id="calc-num-dec" class="input mono" type="number" step="1" value="${esc(rawDec)}" data-calc="numDec" />
          </div>
          <div class="calc-result-row">
            <div class="calc-result-box"><div class="text-xs text-muted">Binär (Basis 2)</div><div class="mono fw-700">${esc(binStr)}</div></div>
            <div class="calc-result-box"><div class="text-xs text-muted">Hexadezimal (Basis 16)</div><div class="mono fw-700">${esc(hexStr)}</div></div>
          </div>
          <div class="calc-result-box mt-sm flex-between">
            <span class="text-xs text-muted">8-Bit Zweierkomplement</span>
            <strong class="mono">${esc(twos8)}</strong>
          </div>
        </section>

        <section class="card">
          <h3 class="section-title">Informationstechnik Spickzettel</h3>
          <div class="formula-list">
            <div class="formula-item"><span>De Morgan 1</span><code class="mono">¬(A ∧ B) = ¬A ∨ ¬B</code></div>
            <div class="formula-item"><span>De Morgan 2</span><code class="mono">¬(A ∨ B) = ¬A ∧ ¬B</code></div>
            <div class="formula-item"><span>n-Bit Zweierkomplement</span><code class="mono">−2^(n−1) … 2^(n−1)−1</code></div>
            <div class="formula-item"><span>Shannon-Entropie</span><code class="mono">I(x) = −log₂(p(x)) Bit</code></div>
          </div>
        </section>
      </div>
    `;
  }

  if (mod.toolType === 'inf') {
    const bytes = Number(c.byteVal ?? 1024);
    const kib = bytes / 1024;
    const mib = bytes / (1024 * 1024);
    return `
      <div class="calc-grid">
        <section class="card">
          <h3 class="section-title">Bit / Byte Speicher-Schnellcheck</h3>
          <div class="field mt-md">
            <label for="calc-bytes">Größe in Byte</label>
            <input id="calc-bytes" class="input mono" type="number" min="0" step="any" value="${esc(c.byteVal ?? '1024')}" data-calc="byteVal" />
          </div>
          <div class="calc-result-row">
            <div class="calc-result-box"><div class="text-xs text-muted">Bit</div><div class="mono fw-700">${fmtEng(bytes * 8)} Bit</div></div>
            <div class="calc-result-box"><div class="text-xs text-muted">KiB (1024 B)</div><div class="mono fw-700">${fmtEng(kib)} KiB</div></div>
          </div>
          <div class="calc-result-box mt-sm flex-between">
            <span class="text-xs text-muted">MiB</span>
            <strong class="mono">${fmtEng(mib)} MiB</strong>
          </div>
        </section>

        <section class="card">
          <h3 class="section-title">Informatik-I Spickzettel</h3>
          <div class="formula-list">
            <div class="formula-item"><span>int (32-Bit)</span><code class="mono">4 Byte · −2,14 Mrd. … +2,14 Mrd.</code></div>
            <div class="formula-item"><span>double (IEEE 754)</span><code class="mono">8 Byte · ~15 Nachkommastellen</code></div>
            <div class="formula-item"><span>Array-Index</span><code class="mono">0 bis length − 1</code></div>
            <div class="formula-item"><span>Logische Operatoren</span><code class="mono">&& (UND) · || (ODER) · ! (NICHT)</code></div>
          </div>
        </section>
      </div>
    `;
  }

  // BWL & Marktanalyse
  const db = Number(c.bwlP || 0) - Number(c.bwlKv || 0);
  const xBe = db > 0 ? Math.ceil(Number(c.bwlKf || 0) / db) : null;
  const umsatzBe = xBe !== null ? xBe * Number(c.bwlP || 0) : null;

  return `
    <div class="calc-grid">
      <section class="card">
        <div class="section-head">
          <div>
            <h3 class="section-title">Deckungsbeitrag & Break-Even Rechner</h3>
            <div class="text-xs text-muted">Für BWL & Marktanalyse</div>
          </div>
        </div>
        <div class="form-row">
          <div class="field"><label for="calc-bwl-p">Verkaufspreis p (€)</label><input id="calc-bwl-p" class="input mono" type="number" step="any" value="${esc(c.bwlP)}" data-calc="bwlP" /></div>
          <div class="field"><label for="calc-bwl-kv">Var. Stückkosten kᵥ (€)</label><input id="calc-bwl-kv" class="input mono" type="number" step="any" value="${esc(c.bwlKv)}" data-calc="bwlKv" /></div>
        </div>
        <div class="field mt-sm"><label for="calc-bwl-kf">Fixkosten K_f (€)</label><input id="calc-bwl-kf" class="input mono" type="number" step="any" value="${esc(c.bwlKf)}" data-calc="bwlKf" /></div>
        <div class="calc-result-row">
          <div class="calc-result-box"><div class="text-xs text-muted">Stückdeckungsbeitrag (db)</div><div class="mono fw-700">${db.toFixed(2).replace('.', ',')} €</div></div>
          <div class="calc-result-box"><div class="text-xs text-muted">Break-Even-Menge</div><div class="mono fw-700">${xBe !== null ? `${xBe.toLocaleString('de-DE')} Stk.` : 'db ≤ 0'}</div></div>
        </div>
        ${
          umsatzBe !== null
            ? `<div class="calc-result-box mt-sm flex-between">
                <span class="text-xs text-muted">Break-Even-Umsatz</span>
                <strong class="mono">${umsatzBe.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €</strong>
              </div>`
            : ''
        }
      </section>

      <section class="card">
        <h3 class="section-title">${mod.toolType === 'markt' ? 'Marktanalyse Spickzettel' : 'BWL Formelsammlung'}</h3>
        <div class="formula-list">
          ${
            mod.toolType === 'markt'
              ? `
                <div class="formula-item"><span>Marketing-Mix (4 Ps)</span><code class="mono">Product · Price · Place · Promotion</code></div>
                <div class="formula-item"><span>Marktanteil</span><code class="mono">Eigener Umsatz / Marktvolumen × 100%</code></div>
                <div class="formula-item"><span>Marktsättigung</span><code class="mono">Marktvolumen / Marktpotenzial × 100%</code></div>
                <div class="formula-item"><span>Preiselastizität</span><code class="mono">ε = (Δx / x) / (Δp / p)</code></div>
              `
              : `
                <div class="formula-item"><span>Wirtschaftlichkeit</span><code class="mono">Ertrag / Aufwand</code></div>
                <div class="formula-item"><span>Eigenkapitalrentabilität</span><code class="mono">Gewinn / Eigenkapital × 100%</code></div>
                <div class="formula-item"><span>Deckungsbeitrag</span><code class="mono">db = p − kᵥ · DB = db · x</code></div>
                <div class="formula-item"><span>Break-Even-Menge</span><code class="mono">x_BE = K_f / (p − kᵥ)</code></div>
              `
          }
        </div>
      </section>
    </div>
  `;
}

function solveOhm(uStr, iStr, rStr, pStr) {
  const U = uStr !== '' && Number(uStr) > 0 ? Number(uStr) : null;
  const I = iStr !== '' && Number(iStr) > 0 ? Number(iStr) : null;
  const R = rStr !== '' && Number(rStr) > 0 ? Number(rStr) : null;
  const P = pStr !== '' && Number(pStr) > 0 ? Number(pStr) : null;
  if ([U, I, R, P].filter((x) => x !== null).length !== 2) return null;
  if (U && I) return { U, I, R: U / I, P: U * I };
  if (U && R) return { U, I: U / R, R, P: (U * U) / R };
  if (U && P) return { U, I: P / U, R: (U * U) / P, P };
  if (I && R) return { U: I * R, I, R, P: I * I * R };
  if (I && P) return { U: P / I, I, R: P / (I * I), P };
  if (R && P) return { U: Math.sqrt(P * R), I: Math.sqrt(P / R), R, P };
  return null;
}

function fmtEng(num) {
  if (!Number.isFinite(num)) return '–';
  if (num === 0) return '0';
  const abs = Math.abs(num);
  if (abs >= 1e6 || abs < 1e-3) return num.toExponential(3).replace('.', ',');
  return Number(num.toPrecision(4)).toString().replace('.', ',');
}

function renderModuleInlineBonus(modId, bonusPoints) {
  if (modId === 'mod_mathe') {
    const m = computeMatheBonus(bonusPoints.mathe);
    return `
      <div class="bonus-inline-strip mt-md">
        <div class="flex-row" style="gap:8px;">
          <span class="badge badge-terracotta mono">${ICONS.award} Bonus: ${m.examPoints} KP</span>
          <span class="text-xs text-secondary">Mathe I · 1 : 1 Klausurpunkte</span>
        </div>
        <div class="flex-row" style="gap:5px;">
          <button class="btn btn-secondary btn-sm" data-action="adjust-bonus" data-subject="mathe" data-delta="-1" aria-label="Mathe Bonuspunkt minus 1">−1</button>
          <button class="btn btn-primary btn-sm" data-action="adjust-bonus" data-subject="mathe" data-delta="1">+1 Punkt</button>
        </div>
      </div>
    `;
  }
  if (modId === 'mod_bwl') {
    const b = computeBwlBonus(bonusPoints.bwl);
    return `
      <div class="bonus-inline-strip mt-md">
        <div class="flex-row" style="gap:8px; flex-wrap:wrap;">
          <span class="badge badge-ochre mono">${ICONS.award} Bonus: ${b.examPoints} KP</span>
          <span class="text-xs text-secondary">
            <strong class="mono">${b.lecturePoints} VP</strong> · noch ${b.toNextBracket} VP bis ${b.nextExamPoints} KP
          </span>
        </div>
        <div class="flex-row" style="gap:5px;">
          <button class="btn btn-secondary btn-sm" data-action="adjust-bonus" data-subject="bwl" data-delta="-1" aria-label="BWL Punkt minus 1">−1</button>
          <button class="btn btn-soft btn-sm" data-action="adjust-bonus" data-subject="bwl" data-delta="1">+1</button>
          <button class="btn btn-soft btn-sm" data-action="adjust-bonus" data-subject="bwl" data-delta="2">+2</button>
          <button class="btn btn-soft btn-sm" data-action="adjust-bonus" data-subject="bwl" data-delta="3">+3</button>
          <button class="btn btn-primary btn-sm" data-action="adjust-bonus" data-subject="bwl" data-delta="4">+4</button>
        </div>
      </div>
    `;
  }
  return '';
}

/* ==========================================================================
   ABGABEN-BEREICH (Eingebettet unter Heute -> Abgaben)
   ========================================================================== */
export function renderTasksSection(state) {
  const now = new Date();
  const recurring = (state.tasks || [])
    .filter((t) => t.recurrence === 'weekly' || t.recurrence === 'biweekly')
    .sort((a, b) => `${a.due} ${a.dueTime || ''}`.localeCompare(`${b.due} ${b.dueTime || ''}`));

  const oneOff = (state.tasks || [])
    .filter((t) => !t.recurrence || t.recurrence === 'once')
    .sort((a, b) => {
      if (a.done !== b.done) return a.done ? 1 : -1;
      return (a.due || '9999').localeCompare(b.due || '9999');
    });

  const googleConnected = Boolean(state.google?.connected || isPersonalBridgeConfigured());

  return `
    <div class="toolkit-grid">
      <section class="card">
        <div class="section-head">
          <div>
            <h2 class="section-title">Feste Semester-Abgaben</h2>
            <div class="text-xs text-muted">Abhaken schiebt automatisch weiter · Ferienzeiten werden übersprungen</div>
          </div>
          <button class="section-link" data-action="open-modal" data-modal="task">+ Neu</button>
        </div>

        ${
          recurring.length > 0
            ? `<div class="semester-strip mb-md" style="margin-bottom:14px;">
                <div class="text-xs text-secondary">
                  <strong>Native Handy-Erinnerungen:</strong> Lege alle ${recurring.length} Abgabe-Serien (inkl. Vorabend- &amp; 2-Std.-Erinnerung, ohne Weihnachtsferien) in deinem Google Kalender an.
                </div>
                <div class="flex-row" style="flex-shrink:0;">
                  ${
                    googleConnected
                      ? `<button class="btn btn-google btn-sm" data-action="push-all-recurring-google">
                          ${ICONS.bell} Alle in Google
                        </button>`
                      : `<button class="btn btn-secondary btn-sm" data-action="export-ics-recurring">
                          ${ICONS.bell} .ics Erinnerungen
                        </button>`
                  }
                </div>
              </div>`
            : ''
        }

        ${
          recurring.length === 0
            ? `<div class="empty-state"><strong>Keine wiederkehrenden Abgaben</strong></div>`
            : `<div class="timeline-list">
                ${recurring
                  .map((tk) => {
                    const diff = daysBetween(tk.due, now);
                    const step = tk.recurrence === 'biweekly' ? 14 : 7;
                    const nextAfter = nextLectureOccurrence(tk.due, step, state.semesterConfig);
                    const skippedHoliday = Boolean(
                      findHolidayForDate(
                        new Date(
                          new Date(`${tk.due}T12:00:00`).getTime() + step * 86400000
                        )
                          .toISOString()
                          .slice(0, 10),
                        state.semesterConfig
                      )
                    );
                    const timeTxt = tk.dueTime === '23:59' ? '24:00 Uhr' : `${tk.dueTime || '12:00'} Uhr`;
                    const urgencyBadge =
                      diff < 0
                        ? `<span class="badge badge-danger">Überfällig</span>`
                        : diff === 0
                          ? `<span class="badge badge-terracotta mono">Heute · ${timeTxt}</span>`
                          : diff === 1
                            ? `<span class="badge badge-ochre mono">Morgen · ${timeTxt}</span>`
                            : `<span class="badge badge-sage mono">in ${diff} Tagen · ${formatShortDateDE(tk.due)} (${timeTxt})</span>`;

                    return `
                      <div class="recurring-card">
                        <div style="flex:1; min-width:0;">
                          <div class="flex-row" style="gap:6px; margin-bottom:4px;">
                            <span class="badge badge-slate">${esc(tk.course)}</span>
                            ${urgencyBadge}
                            ${tk.googleEventId ? `<span class="badge badge-google">✓ Erinnerung aktiv</span>` : ''}
                          </div>
                          <div class="fw-700" style="font-size:0.95rem;">${esc(tk.title)}</div>
                          <div class="text-xs text-muted mt-sm">
                            ${tk.recurrence === 'biweekly' ? 'Alle 2 Wochen' : 'Jede Woche'} · Danach am ${formatShortDateDE(nextAfter)}${skippedHoliday ? ' (Ferien übersprungen)' : ''}
                            ${tk.streak > 0 ? ` · <strong>${tk.streak}× erledigt</strong>` : ''}
                          </div>
                        </div>
                        <div class="flex-row" style="flex-wrap:nowrap; flex-shrink:0;">
                          <button
                            class="btn btn-secondary btn-sm"
                            data-action="push-recurring-task-google"
                            data-id="${esc(tk.id)}"
                            title="Als Serientermin mit Erinnerung in Google Kalender speichern"
                          >
                            ${ICONS.bell} ${googleConnected ? (tk.googleEventId ? 'Update' : 'Google') : '.ics'}
                          </button>
                          <button class="btn btn-primary btn-sm" data-action="complete-recurring-task" data-id="${esc(tk.id)}">
                            ${ICONS.check} Abgehakt
                          </button>
                          <button class="icon-btn" data-action="delete-task" data-id="${esc(tk.id)}" aria-label="Abgabe löschen">
                            ${ICONS.trash}
                          </button>
                        </div>
                      </div>`;
                  })
                  .join('')}
              </div>`
        }
      </section>

      <section class="card">
        <div class="section-head">
          <div>
            <h2 class="section-title">Einmalige Aufgaben</h2>
            <div class="text-xs text-muted">z. B. Prüfungsanmeldung im HSD eCampus, Praktikums-Vorbereitung</div>
          </div>
          <button class="section-link" data-action="open-modal" data-modal="task">+ Aufgabe</button>
        </div>
        ${
          oneOff.length === 0
            ? `<div class="empty-state"><strong>Keine einmaligen Aufgaben offen</strong>Tippe oben auf „+ Abgabe“.</div>`
            : `<div class="task-list">${oneOff.map((t) => renderTaskRow(t, now)).join('')}</div>`
        }
      </section>
    </div>
  `;
}

/* ==========================================================================
   STANDALONE VIEW: BIB-FOKUS & LERNZEIT-STATISTIK PRO MODUL
   ========================================================================== */
export function renderFocusView(state, ui = {}) {
  const snap = focusTimer.getSnapshot();
  const radius = 104;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - snap.progress);

  const subjects = (state.modules || []).map((m) => m.courseKey);
  if (!subjects.includes('Allgemein')) subjects.push('Allgemein');
  if (!subjects.includes(snap.subject)) subjects.unshift(snap.subject);

  const todayIso = isoDate();
  const stats = computeStudyAnalytics(
    state.studySessions || [],
    state.modules || [],
    state.studyGoalWeeklyMin,
    todayIso
  );
  const scope = ui.studyStatsScope || 'week'; // 'week' | 'total'
  const maxDayMin = Math.max(45, ...stats.weekDays.map((d) => d.minutes));
  const maxModMin = Math.max(
    30,
    ...stats.moduleStats.map((m) => (scope === 'week' ? m.weekMinutes : m.totalMinutes))
  );
  const goalHoursOptions = [5, 10, 15, 20];

  return `
    <header class="page-header">
      <div>
        <div class="page-eyebrow">
          Diese Woche: ${(stats.weekMinutes / 60).toFixed(1).replace('.', ',')} Std. · ${stats.streak.current} ${stats.streak.current === 1 ? 'Tag' : 'Tage'} Streak · Wochenziel ${stats.weekGoalPct}%
        </div>
        <h1 class="page-title">Bib-Fokus</h1>
      </div>
      <div class="page-actions">
        <button class="btn btn-secondary btn-sm" data-action="focus-wakelock">
          ${ICONS.phone} Display wach: <strong>${snap.wakeLockEnabled ? 'AN' : 'AUS'}</strong>
        </button>
      </div>
    </header>

    <div class="toolkit-grid">
      <section class="card focus-card" aria-label="Bib-Fokus-Timer">
        <div class="segmented-bar" role="tablist">
          ${FOCUS_PRESETS.map(
            (p) => `
            <button class="segment-btn ${snap.presetId === p.id ? 'active' : ''}" data-action="focus-preset" data-value="${p.id}">
              ${p.label}
            </button>`
          ).join('')}
        </div>

        <div class="timer-ring-wrap">
          <svg class="timer-ring-svg" viewBox="0 0 236 236">
            <circle class="timer-ring-bg" cx="118" cy="118" r="${radius}" />
            <circle
              id="focus-ring-circle"
              class="timer-ring-progress ${snap.phase === 'break' ? 'break' : ''}"
              cx="118"
              cy="118"
              r="${radius}"
              stroke-dasharray="${circumference}"
              stroke-dashoffset="${dashOffset}"
            />
          </svg>
          <div class="timer-center">
            <div id="focus-time-readout" class="timer-display">${formatMMSS(snap.remainingSeconds)}</div>
            <div id="focus-phase-readout" class="timer-phase">
              ${snap.phase === 'work' ? 'Fokus-Phase' : 'Kurze Pause'}
            </div>
          </div>
        </div>

        <div class="field" style="width:100%; max-width:300px; text-align:left; margin-bottom:16px;">
          <label for="focus-subject-select">Modul / Fach</label>
          <select id="focus-subject-select" class="select" data-action="focus-subject">
            ${subjects
              .map(
                (subj) =>
                  `<option value="${esc(subj)}" ${subj === snap.subject ? 'selected' : ''}>${esc(subj)}</option>`
              )
              .join('')}
          </select>
        </div>

        <div class="flex-row" style="justify-content:center; gap:10px;">
          <button id="focus-toggle-btn" class="btn btn-primary" style="min-width:136px;" data-action="focus-toggle">
            ${snap.running ? `${ICONS.pause} Pause` : `${ICONS.play} Starten`}
          </button>
          <button class="btn btn-secondary" data-action="focus-reset">${ICONS.reset} Reset</button>
          <button class="btn btn-ghost btn-sm" data-action="focus-switch-phase">
            ${snap.phase === 'work' ? 'Zur Pause' : 'Zum Fokus'}
          </button>
        </div>

        <div class="flex-row mt-md" style="justify-content:center; gap:6px;">
          <button class="btn btn-soft btn-sm" data-action="log-manual-study" data-minutes="15">+15m</button>
          <button class="btn btn-soft btn-sm" data-action="log-manual-study" data-minutes="30">+30m</button>
          <button class="btn btn-soft btn-sm" data-action="log-manual-study" data-minutes="60">+60m</button>
        </div>
      </section>

      <section class="card">
        <div class="section-head">
          <div>
            <h2 class="section-title">Lernzeit-Statistik &amp; Wochenziel</h2>
            <div class="text-xs text-muted">
              Diese Woche: ${(stats.weekMinutes / 60).toFixed(1).replace('.', ',')} Std. · Gesamt: ${(stats.totalMinutes / 60).toFixed(1).replace('.', ',')} Std.
            </div>
          </div>
          <span class="badge ${stats.streak.current > 0 ? 'badge-terracotta' : 'badge-neutral'} mono" style="display:inline-flex; align-items:center; gap:4px;">
            ${ICONS.flame} ${stats.streak.current} ${stats.streak.current === 1 ? 'Tag' : 'Tage'} Streak
          </span>
        </div>

        <!-- Weekly Goal Bar & Quick Goal Picker -->
        <div class="study-goal-box">
          <div class="flex-between text-xs" style="margin-bottom:6px;">
            <span class="fw-600">Wochenziel (${(stats.weeklyGoalMin / 60).toFixed(0)} Std.)</span>
            <span class="mono fw-700">${stats.weekGoalPct}% · ${stats.remainingGoalMin > 0 ? `noch ${(stats.remainingGoalMin / 60).toFixed(1).replace('.', ',')} Std.` : 'Geschafft!'}</span>
          </div>
          <div class="progress-track" style="height:9px;">
            <div class="progress-fill ${stats.weekGoalPct >= 100 ? '' : stats.weekGoalPct >= 40 ? '' : 'warn'}" style="width:${stats.weekGoalPct}%"></div>
          </div>
          <div class="flex-row mt-sm" style="gap:5px; justify-content:space-between;">
            <span class="text-xs text-muted">Ziel anpassen:</span>
            <div class="flex-row" style="gap:4px;">
              ${goalHoursOptions
                .map((hrs) => {
                  const active = stats.weeklyGoalMin === hrs * 60;
                  return `<button class="btn ${active ? 'btn-primary' : 'btn-ghost'} btn-sm" style="padding:3px 9px; font-size:0.74rem;" data-action="set-weekly-goal" data-minutes="${hrs * 60}">${hrs}h</button>`;
                })
                .join('')}
            </div>
          </div>
        </div>

        <!-- 7-Day Rhythm Mini Bar Chart (Mo..So) -->
        <div class="week-bars" aria-label="Lernminuten diese Woche (Mo–So)">
          ${stats.weekDays
            .map((d) => {
              const hPct = d.minutes > 0 ? Math.max(12, Math.round((d.minutes / maxDayMin) * 100)) : 5;
              return `
                <div class="week-bar-col ${d.isToday ? 'is-today' : ''}">
                  <div class="week-bar-val mono">${d.minutes > 0 ? `${d.minutes}m` : ''}</div>
                  <div class="week-bar-track">
                    <div class="week-bar-fill ${d.minutes === 0 ? 'empty' : ''}" style="height:${hPct}%"></div>
                  </div>
                  <div class="week-bar-label">${d.label}</div>
                </div>`;
            })
            .join('')}
        </div>

        <!-- Per-Module Coverage (Week vs Total) -->
        <div class="flex-between mt-md" style="margin-bottom:10px;">
          <strong class="text-sm">Verteilung pro Modul</strong>
          <div class="segmented-bar" role="tablist">
            <button class="segment-btn ${scope === 'week' ? 'active' : ''}" data-action="set-study-scope" data-value="week">Woche</button>
            <button class="segment-btn ${scope === 'total' ? 'active' : ''}" data-action="set-study-scope" data-value="total">Gesamt</button>
          </div>
        </div>

        <div class="bar-chart">
          ${stats.moduleStats
            .map((m) => {
              const mins = scope === 'week' ? m.weekMinutes : m.totalMinutes;
              const pct = mins > 0 ? Math.max(6, Math.round((mins / maxModMin) * 100)) : 0;
              const hrs = (mins / 60).toFixed(1).replace('.', ',');
              const col = COURSE_COLORS[m.color] || COURSE_COLORS.sage;
              return `
                <div class="bar-row">
                  <div class="bar-row-head">
                    <span class="fw-600 flex-row" style="gap:6px;">
                      <span class="module-dot" style="background:${col.hex}; width:8px; height:8px;"></span>
                      ${esc(m.short)}
                    </span>
                    <span class="mono text-secondary">${hrs} Std. (${mins} Min)</span>
                  </div>
                  <div class="progress-track">
                    <div class="progress-fill" style="width:${pct}%; background:${col.hex};"></div>
                  </div>
                </div>`;
            })
            .join('')}
        </div>

        ${
          stats.leastStudied
            ? `<div class="semester-strip mt-md" style="margin-top:14px;">
                <div class="text-xs text-secondary">
                  <strong>Balance-Tipp:</strong> <strong>${esc(stats.leastStudied.short)}</strong> hatte diese Woche erst <strong>${stats.leastStudied.weekMinutes} Min</strong> Lernzeit.
                </div>
                <button class="btn btn-soft btn-sm" data-action="start-focus-quick" data-subject="${esc(stats.leastStudied.courseKey)}">
                  ${ICONS.play} Starten
                </button>
              </div>`
            : ''
        }
      </section>
    </div>
  `;
}

/* ==========================================================================
   NOTEN, ZIELNOTEN-PLANER & HSD-LINKS (Eingebettet unter Klausuren -> Noten)
   ========================================================================== */
export function renderGradesAndCampusSection(state) {
  const stats = computeGpaStats(state.grades || [], state.profile.targetEcts);
  const plan = state.semesterPlan || [];
  const planStats = computeGpaStats(
    plan.map((p) => ({ ects: p.ects, grade: p.targetGrade })),
    state.profile.targetEcts
  );

  return `
    <div class="toolkit-grid">
      <div class="today-col">
        <section class="card">
          <div class="section-head">
            <div>
              <h2 class="section-title">1.-Semester-Zielnoten-Planer</h2>
              <div class="text-xs text-muted">Simuliere deinen möglichen Schnitt nach den ersten Prüfungen (30 ECTS)</div>
            </div>
            <span class="badge badge-sage mono" style="font-size:0.9rem;">Ø ${formatGradeDE(planStats.gpa)}</span>
          </div>

          <div class="grade-list">
            ${plan
              .map(
                (mod) => `
              <div class="grade-row">
                <div>
                  <div class="fw-600 text-sm">${esc(mod.title)}</div>
                  <div class="text-xs text-muted mono">${mod.ects} ECTS</div>
                </div>
                <select
                  class="select mono"
                  style="width:88px; min-height:36px; padding:4px 8px;"
                  data-action="plan-grade-change"
                  data-id="${esc(mod.id)}"
                >
                  ${GERMAN_GRADES.filter((g) => g <= 4.0)
                    .map(
                      (g) =>
                        `<option value="${g}" ${Number(mod.targetGrade) === g ? 'selected' : ''}>${formatSingleGradeDE(g)}</option>`
                    )
                    .join('')}
                </select>
              </div>`
              )
              .join('')}
          </div>
        </section>

        <section class="card">
          <div class="section-head">
            <div>
              <h2 class="section-title">Offizieller Notenspiegel</h2>
              <div class="text-xs text-muted">
                ${stats.totalEcts} / ${state.profile.targetEcts} ECTS bestanden${stats.gpa ? ` · Schnitt ${formatGradeDE(stats.gpa)}` : ''}
              </div>
            </div>
            <button class="section-link" data-action="open-modal" data-modal="grade">+ Note eintragen</button>
          </div>
          ${
            (state.grades || []).length === 0
              ? `<div class="empty-state" style="padding:18px 10px;">
                  <strong>Noch keine abgeschlossenen Prüfungen</strong>
                  Sobald deine ersten Klausurergebnisse da sind, kannst du sie hier eintragen.
                </div>`
              : `<div class="grade-list">
                  ${state.grades
                    .map((g) => {
                      const pillClass = g.grade <= 2.0 ? '' : g.grade <= 3.0 ? 'mid' : 'low';
                      return `
                        <div class="grade-row">
                          <div>
                            <div class="fw-600">${esc(g.title)}</div>
                            <div class="text-xs text-muted">${esc(g.semester || '1. Sem.')} · <span class="mono">${g.ects} ECTS</span></div>
                          </div>
                          <div class="flex-row">
                            <span class="grade-pill ${pillClass}">${formatSingleGradeDE(g.grade)}</span>
                            <button class="icon-btn" data-action="delete-grade" data-id="${esc(g.id)}" aria-label="Note löschen">${ICONS.trash}</button>
                          </div>
                        </div>`;
                    })
                    .join('')}
                </div>`
          }
        </section>
      </div>

      <div class="today-col">
        <section class="card">
          <div class="section-head">
            <h2 class="section-title">HSD Campus-Links</h2>
            <button class="section-link" data-action="open-modal" data-modal="quicklink">+ Link</button>
          </div>
          <div class="timeline-list">
            ${(state.quickLinks || [])
              .map(
                (ql) => `
              <div class="grade-row">
                <a href="${esc(ql.url)}" target="_blank" rel="noopener noreferrer" style="flex:1; color:inherit;">
                  <div class="fw-600 text-sm">${esc(ql.label)} ${ICONS.external}</div>
                  <div class="text-xs text-muted">${esc(ql.sub || ql.url)}</div>
                </a>
                <button class="icon-btn" data-action="delete-quicklink" data-id="${esc(ql.id)}" aria-label="Link entfernen">
                  ${ICONS.trash}
                </button>
              </div>`
              )
              .join('')}
          </div>
        </section>

        <section class="card">
          <div class="section-head">
            <h2 class="section-title">Allgemeine Uni-Notizen</h2>
            <button class="section-link" data-action="open-modal" data-modal="note">+ Notiz</button>
          </div>
          ${
            (state.notes || []).length === 0
              ? `<div class="empty-state"><strong>Keine Notizen</strong></div>`
              : `<div class="timeline-list">
                  ${state.notes
                    .map(
                      (n) => `
                    <article class="note-card">
                      <div class="flex-between">
                        <span class="badge badge-sage">${esc(n.course || 'Uni')}</span>
                        <div class="flex-row" style="gap:2px;">
                          <button class="icon-btn" style="width:28px;height:28px;" data-action="open-modal" data-modal="note" data-id="${esc(n.id)}" aria-label="Notiz bearbeiten">${ICONS.edit}</button>
                          <button class="icon-btn" style="width:28px;height:28px;" data-action="delete-note" data-id="${esc(n.id)}" aria-label="Notiz löschen">${ICONS.trash}</button>
                        </div>
                      </div>
                      <h3 style="font-size:0.93rem; font-weight:700;">${esc(n.title)}</h3>
                      <div class="note-content">${esc(n.content)}</div>
                      <div class="text-xs text-muted">${formatShortDateDE(n.updatedAt)}</div>
                    </article>`
                    )
                    .join('')}
                </div>`
          }
        </section>
      </div>
    </div>
  `;
}
