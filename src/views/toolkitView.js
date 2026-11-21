import { ICONS } from '../components/icons.js';
import {
  GERMAN_GRADES,
  addDaysToISO,
  daysBetween,
  formatShortDateDE,
} from '../data/defaults.js';
import { FOCUS_PRESETS, focusTimer, formatMMSS } from '../services/focusTimer.js';
import {
  computeGpaStats,
  formatGradeDE,
  formatSingleGradeDE,
} from '../state/store.js';
import { esc } from '../utils/html.js';
import { renderTaskRow } from './todayView.js';

export function renderToolkitView(state, ui) {
  const sub = ui.toolkitSub || 'tasks'; // 'tasks' | 'cards' | 'etech' | 'focus' | 'grades'

  return `
    <header class="page-header">
      <div>
        <div class="page-eyebrow">Deine WIE-Werkzeuge · 1. Semester</div>
        <h1 class="page-title">Studium</h1>
      </div>
      <div class="page-actions">
        ${
          sub === 'tasks'
            ? `<button class="btn btn-primary" data-action="open-modal" data-modal="task">${ICONS.plus} Abgabe / Aufgabe</button>`
            : sub === 'cards'
              ? `<button class="btn btn-primary" data-action="open-modal" data-modal="flashcard">${ICONS.plus} Karteikarte</button>`
              : sub === 'grades'
                ? `<button class="btn btn-secondary btn-sm" data-action="open-modal" data-modal="note">${ICONS.plus} Notiz</button>
                   <button class="btn btn-primary" data-action="open-modal" data-modal="grade">${ICONS.plus} Note</button>`
                : ''
        }
      </div>
    </header>

    <div class="timetable-toolbar">
      <div class="segmented-bar" role="tablist" aria-label="Studien-Werkzeuge">
        <button class="segment-btn ${sub === 'tasks' ? 'active' : ''}" data-action="set-toolkit-sub" data-value="tasks">
          Abgaben
        </button>
        <button class="segment-btn ${sub === 'cards' ? 'active' : ''}" data-action="set-toolkit-sub" data-value="cards">
          Karteikarten
        </button>
        <button class="segment-btn ${sub === 'etech' ? 'active' : ''}" data-action="set-toolkit-sub" data-value="etech">
          E-Technik
        </button>
        <button class="segment-btn ${sub === 'focus' ? 'active' : ''}" data-action="set-toolkit-sub" data-value="focus">
          Bib-Fokus
        </button>
        <button class="segment-btn ${sub === 'grades' ? 'active' : ''}" data-action="set-toolkit-sub" data-value="grades">
          Noten & HSD
        </button>
      </div>
    </div>

    ${
      sub === 'tasks'
        ? renderTasksTab(state)
        : sub === 'cards'
          ? renderFlashcardsTab(state, ui)
          : sub === 'etech'
            ? renderEtechHelperTab(ui)
            : sub === 'focus'
              ? renderFocusTab(state)
              : renderGradesAndCampusTab(state)
    }
  `;
}

/* ---------- Sub-Tab 1: Wiederkehrende Abgaben & Einmalige Aufgaben ---------- */
function renderTasksTab(state) {
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

  return `
    <div class="toolkit-grid">
      <section class="card">
        <div class="section-head">
          <div>
            <h2 class="section-title">Feste Semester-Abgaben</h2>
            <div class="text-xs text-muted">Abhaken schiebt die Abgabe automatisch in den nächsten Rhythmus</div>
          </div>
          <button class="section-link" data-action="open-modal" data-modal="task">+ Neu</button>
        </div>

        ${
          recurring.length === 0
            ? `<div class="empty-state"><strong>Keine wiederkehrenden Abgaben</strong>Lege wöchentliche oder 2-wöchige Abgaben an.</div>`
            : `<div class="timeline-list">
                ${recurring
                  .map((tk) => {
                    const diff = daysBetween(tk.due, now);
                    const step = tk.recurrence === 'biweekly' ? 14 : 7;
                    const nextAfter = addDaysToISO(tk.due, step);
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
                          </div>
                          <div class="fw-700" style="font-size:0.95rem;">${esc(tk.title)}</div>
                          <div class="text-xs text-muted mt-sm">
                            ${tk.recurrence === 'biweekly' ? 'Alle 2 Wochen' : 'Jede Woche'} · Danach am ${formatShortDateDE(nextAfter)}
                            ${tk.streak > 0 ? ` · <strong>${tk.streak}× erledigt</strong>` : ''}
                          </div>
                        </div>
                        <div class="flex-row" style="flex-wrap:nowrap; flex-shrink:0;">
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
            <div class="text-xs text-muted">z. B. Prüfungsanmeldung im OSSC, Praktikums-Vorbereitung</div>
          </div>
          <button class="section-link" data-action="open-modal" data-modal="task">+ Aufgabe</button>
        </div>
        ${
          oneOff.length === 0
            ? `<div class="empty-state"><strong>Keine einmaligen Aufgaben offen</strong>Tippe oben auf „+ Abgabe / Aufgabe“, um dir To-dos zu merken.</div>`
            : `<div class="task-list">${oneOff.map((t) => renderTaskRow(t, now)).join('')}</div>`
        }
      </section>
    </div>
  `;
}

/* ---------- Sub-Tab 2: Mini-Karteikarten für unterwegs (Pixel 8 + Desktop) ---------- */
function renderFlashcardsTab(state, ui) {
  const allCards = state.flashcards || [];
  const courses = ['Alle', ...new Set(allCards.map((c) => c.course))];
  const activeCourse = courses.includes(ui.cardFilter) ? ui.cardFilter : 'Alle';

  const filtered =
    activeCourse === 'Alle'
      ? allCards
      : allCards.filter((c) => c.course === activeCourse);

  // Prioritize cards with lower mastery box first
  const ordered = [...filtered].sort((a, b) => (a.box || 1) - (b.box || 1));
  const idx = ordered.length > 0 ? (ui.cardIndex || 0) % ordered.length : 0;
  const current = ordered[idx] || null;
  const flipped = Boolean(ui.cardFlipped);

  const masteredCount = filtered.filter((c) => (c.box || 1) >= 3).length;
  const masteredPct = filtered.length > 0 ? Math.round((masteredCount / filtered.length) * 100) : 0;

  return `
    <div class="flex-row" style="margin-bottom:14px;">
      ${courses
        .map(
          (c) => `
        <button class="btn ${activeCourse === c ? 'btn-primary' : 'btn-secondary'} btn-sm" data-action="card-filter" data-value="${esc(c)}">
          ${esc(c)}
        </button>`
        )
        .join('')}
    </div>

    <div class="toolkit-grid">
      <section>
        ${
          !current
            ? `<div class="card empty-state"><strong>Noch keine Karteikarten in diesem Fach</strong>Tippe oben auf „+ Karteikarte“, um eigene Lernkarten anzulegen.</div>`
            : `
              <div class="flashcard-stage" data-action="card-flip" role="button" tabindex="0" aria-label="Karte umdrehen">
                <div class="flashcard-box ${flipped ? 'is-flipped' : ''}">
                  <div class="flex-between">
                    <div class="flex-row" style="gap:6px;">
                      <span class="badge badge-sage">${esc(current.course)}</span>
                      <span class="badge ${current.box >= 3 ? 'badge-sage' : current.box === 2 ? 'badge-ochre' : 'badge-neutral'}">
                        ${current.box >= 3 ? 'Sicher' : current.box === 2 ? 'Am Üben' : 'Neu'}
                      </span>
                    </div>
                    <span class="text-xs mono text-muted">${idx + 1} / ${ordered.length}</span>
                  </div>

                  <div>
                    <div class="text-xs text-muted fw-600" style="text-transform:uppercase; letter-spacing:0.06em; margin-bottom:8px;">
                      ${flipped ? 'Antwort' : 'Frage'}
                    </div>
                    <div class="flashcard-text">${esc(flipped ? current.back : current.front)}</div>
                  </div>

                  <div class="text-xs text-muted">
                    ${flipped ? 'Bewerte unten, wie sicher du warst' : 'Tippen zum Umdrehen'}
                  </div>
                </div>
              </div>

              <div class="flex-between mt-md" style="flex-wrap:wrap;">
                <div class="flex-row">
                  <button class="btn btn-secondary btn-sm" data-action="card-prev">${ICONS.chevronLeft} Zurück</button>
                  <button class="btn btn-secondary btn-sm" data-action="card-flip">${flipped ? 'Frage zeigen' : 'Antwort zeigen'}</button>
                </div>
                <div class="flex-row">
                  <button class="btn btn-danger-soft btn-sm" data-action="card-rate" data-id="${esc(current.id)}" data-result="again">
                    Nochmal üben
                  </button>
                  <button class="btn btn-primary btn-sm" data-action="card-rate" data-id="${esc(current.id)}" data-result="good">
                    ${ICONS.check} Gewusst
                  </button>
                </div>
              </div>
            `
        }
      </section>

      <section class="card">
        <div class="section-head">
          <div>
            <h2 class="section-title">Lernfortschritt (${esc(activeCourse)})</h2>
            <div class="text-xs text-muted">${masteredCount} von ${filtered.length} Karten sitzen sicher</div>
          </div>
          <button class="section-link" data-action="open-modal" data-modal="flashcard">+ Karte</button>
        </div>

        <div class="progress-track" style="height:9px; margin-bottom:16px;">
          <div class="progress-fill" style="width:${masteredPct}%"></div>
        </div>

        <div class="grade-list" style="max-height:300px; overflow-y:auto;">
          ${filtered
            .map(
              (c, i) => `
            <div class="grade-row" style="padding:9px 11px;">
              <button style="flex:1; text-align:left;" data-action="card-jump" data-index="${i}">
                <div class="text-xs fw-600">${esc(c.front)}</div>
                <div class="text-xs text-muted">${esc(c.course)} · ${c.box >= 3 ? 'Sicher' : c.box === 2 ? 'Am Üben' : 'Neu'}</div>
              </button>
              <button class="icon-btn" style="width:28px;height:28px;" data-action="delete-flashcard" data-id="${esc(c.id)}" aria-label="Karte löschen">
                ${ICONS.trash}
              </button>
            </div>`
            )
            .join('')}
        </div>
      </section>
    </div>
  `;
}

/* ---------- Sub-Tab 3: E-Technik & WIE-Helfer ---------- */
function renderEtechHelperTab(ui) {
  const c = ui.calc || {
    prefixVal: 470,
    prefixUnit: 'n',
    ohmU: '12',
    ohmI: '',
    ohmR: '220',
    ohmP: '',
    r1: 1000,
    r2: 2200,
    uIn: 5,
    bwlP: 49,
    bwlKv: 21,
    bwlKf: 14000,
  };

  // 1. SI Prefix conversion
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

  // 2. Ohm's Law (any 2 of U, I, R, P)
  const ohmRes = solveOhm(c.ohmU, c.ohmI, c.ohmR, c.ohmP);

  // 3. Series / Parallel / Voltage Divider
  const r1 = Number(c.r1 || 0);
  const r2 = Number(c.r2 || 0);
  const uIn = Number(c.uIn || 0);
  const rSeries = r1 + r2;
  const rParallel = r1 > 0 && r2 > 0 ? (r1 * r2) / (r1 + r2) : 0;
  const u2 = r1 + r2 > 0 ? (uIn * r2) / (r1 + r2) : 0;

  // 4. BWL Deckungsbeitrag & Break-Even
  const db = Number(c.bwlP || 0) - Number(c.bwlKv || 0);
  const xBe = db > 0 ? Math.ceil(Number(c.bwlKf || 0) / db) : null;
  const umsatzBe = xBe !== null ? xBe * Number(c.bwlP || 0) : null;

  return `
    <div class="calc-grid">
      <section class="card">
        <div class="section-head">
          <div>
            <h2 class="section-title">SI-Präfix-Umrechner</h2>
            <div class="text-xs text-muted">Für Widerstände (Ω), Kondensatoren (F), Ströme (A) & Spannungen (V)</div>
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
              ${prefixes
                .map(
                  (p) =>
                    `<option value="${p.key}" ${p.key === c.prefixUnit ? 'selected' : ''}>${p.label}</option>`
                )
                .join('')}
            </select>
          </div>
        </div>
        <div class="prefix-grid">
          ${prefixes
            .map((p) => {
              const converted = baseVal / Math.pow(10, p.exp);
              return `
                <div class="prefix-cell ${p.key === c.prefixUnit ? 'active' : ''}">
                  <span class="text-xs text-muted">${p.label}</span>
                  <strong class="mono text-xs">${fmtEng(converted)} ${p.key}</strong>
                </div>`;
            })
            .join('')}
        </div>
      </section>

      <section class="card">
        <div class="section-head">
          <div>
            <h2 class="section-title">Ohmsches Gesetz & Leistung</h2>
            <div class="text-xs text-muted">Beliebige 2 Werte eingeben (die anderen 2 leer lassen)</div>
          </div>
          <button class="btn btn-ghost btn-sm" data-action="calc-ohm-clear">Leeren</button>
        </div>
        <div class="form-row">
          <div class="field">
            <label for="calc-ohm-u">Spannung U (V)</label>
            <input id="calc-ohm-u" class="input mono" type="number" step="any" placeholder="z. B. 12" value="${esc(c.ohmU)}" data-calc="ohmU" />
          </div>
          <div class="field">
            <label for="calc-ohm-i">Strom I (A)</label>
            <input id="calc-ohm-i" class="input mono" type="number" step="any" placeholder="z. B. 0.05" value="${esc(c.ohmI)}" data-calc="ohmI" />
          </div>
        </div>
        <div class="form-row mt-sm">
          <div class="field">
            <label for="calc-ohm-r">Widerstand R (Ω)</label>
            <input id="calc-ohm-r" class="input mono" type="number" step="any" placeholder="z. B. 220" value="${esc(c.ohmR)}" data-calc="ohmR" />
          </div>
          <div class="field">
            <label for="calc-ohm-p">Leistung P (W)</label>
            <input id="calc-ohm-p" class="input mono" type="number" step="any" placeholder="z. B. 0.65" value="${esc(c.ohmP)}" data-calc="ohmP" />
          </div>
        </div>
        ${
          ohmRes
            ? `<div class="calc-result-row">
                <div class="calc-result-box"><div class="text-xs text-muted">U (Spannung)</div><div class="mono fw-700">${fmtEng(ohmRes.U)} V</div></div>
                <div class="calc-result-box"><div class="text-xs text-muted">I (Strom)</div><div class="mono fw-700">${fmtEng(ohmRes.I * 1000)} mA <span class="text-xs text-muted">(${fmtEng(ohmRes.I)} A)</span></div></div>
                <div class="calc-result-box"><div class="text-xs text-muted">R (Widerstand)</div><div class="mono fw-700">${fmtEng(ohmRes.R)} Ω</div></div>
                <div class="calc-result-box"><div class="text-xs text-muted">P (Leistung)</div><div class="mono fw-700">${fmtEng(ohmRes.P)} W</div></div>
              </div>`
            : `<div class="text-xs text-muted mt-md">Bitte genau 2 positive Werte eintragen (z. B. U = 12 und R = 220).</div>`
        }
      </section>

      <section class="card">
        <div class="section-head">
          <div>
            <h2 class="section-title">Reihe, Parallel & Spannungsteiler</h2>
            <div class="text-xs text-muted">Schnellcheck für GET-I-Übungen & Labor</div>
          </div>
        </div>
        <div class="form-row">
          <div class="field">
            <label for="calc-r1">R₁ (Ω)</label>
            <input id="calc-r1" class="input mono" type="number" step="any" value="${esc(c.r1)}" data-calc="r1" />
          </div>
          <div class="field">
            <label for="calc-r2">R₂ (Ω)</label>
            <input id="calc-r2" class="input mono" type="number" step="any" value="${esc(c.r2)}" data-calc="r2" />
          </div>
        </div>
        <div class="field mt-sm">
          <label for="calc-uin">Eingangsspannung U_ges (V) für Spannungsteiler</label>
          <input id="calc-uin" class="input mono" type="number" step="any" value="${esc(c.uIn)}" data-calc="uIn" />
        </div>
        <div class="calc-result-row">
          <div class="calc-result-box"><div class="text-xs text-muted">Reihe (R₁ + R₂)</div><div class="mono fw-700">${fmtEng(rSeries)} Ω</div></div>
          <div class="calc-result-box"><div class="text-xs text-muted">Parallel (R₁ ∥ R₂)</div><div class="mono fw-700">${fmtEng(rParallel)} Ω</div></div>
        </div>
        <div class="calc-result-box mt-sm flex-between">
          <span class="text-xs text-muted">Spannung über R₂ (unbelastet)</span>
          <strong class="mono">${fmtEng(u2)} V</strong>
        </div>
      </section>

      <section class="card">
        <div class="section-head">
          <div>
            <h2 class="section-title">BWL: Deckungsbeitrag & Break-Even</h2>
            <div class="text-xs text-muted">Für Grundlagen der BWL & Marktanalyse</div>
          </div>
        </div>
        <div class="form-row">
          <div class="field">
            <label for="calc-bwl-p">Verkaufspreis p (€)</label>
            <input id="calc-bwl-p" class="input mono" type="number" step="any" value="${esc(c.bwlP)}" data-calc="bwlP" />
          </div>
          <div class="field">
            <label for="calc-bwl-kv">Variable Stückkosten kᵥ (€)</label>
            <input id="calc-bwl-kv" class="input mono" type="number" step="any" value="${esc(c.bwlKv)}" data-calc="bwlKv" />
          </div>
        </div>
        <div class="field mt-sm">
          <label for="calc-bwl-kf">Fixkosten K_f (€)</label>
          <input id="calc-bwl-kf" class="input mono" type="number" step="any" value="${esc(c.bwlKf)}" data-calc="bwlKf" />
        </div>
        <div class="calc-result-row">
          <div class="calc-result-box">
            <div class="text-xs text-muted">Stückdeckungsbeitrag (db)</div>
            <div class="mono fw-700">${db.toFixed(2).replace('.', ',')} €</div>
          </div>
          <div class="calc-result-box">
            <div class="text-xs text-muted">Break-Even-Menge (x_BE)</div>
            <div class="mono fw-700">${xBe !== null ? `${xBe.toLocaleString('de-DE')} Stk.` : 'Kein BE (db ≤ 0)'}</div>
          </div>
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
    </div>

    <section class="card mt-lg">
      <div class="section-head">
        <h2 class="section-title">1.-Semester-Formelsammlung (Kurz-Spickzettel)</h2>
      </div>
      <div class="calc-grid">
        <details class="guide-details" open>
          <summary>Grundlagen der Elektrotechnik I (GET I)</summary>
          <div class="formula-list">
            <div class="formula-item"><span>Ohmsches Gesetz</span><code class="mono">U = R · I</code></div>
            <div class="formula-item"><span>Elektrische Leistung</span><code class="mono">P = U · I = I² · R = U² / R</code></div>
            <div class="formula-item"><span>Spannungsteiler</span><code class="mono">U₂ = U · R₂ / (R₁ + R₂)</code></div>
            <div class="formula-item"><span>RC-Zeitkonstante</span><code class="mono">τ = R · C</code></div>
            <div class="formula-item"><span>Leiterwiderstand</span><code class="mono">R = ρ · l / A</code></div>
          </div>
        </details>

        <details class="guide-details" open>
          <summary>Mathe I, Informationstechnik & BWL</summary>
          <div class="formula-list">
            <div class="formula-item"><span>Euler-Formel (Komplex)</span><code class="mono">e^(jφ) = cos(φ) + j·sin(φ)</code></div>
            <div class="formula-item"><span>De Morgan (Digitaltechnik)</span><code class="mono">¬(A ∧ B) = ¬A ∨ ¬B</code></div>
            <div class="formula-item"><span>Zweierkomplement (n Bit)</span><code class="mono">−2^(n−1) … 2^(n−1)−1</code></div>
            <div class="formula-item"><span>Deckungsbeitrag</span><code class="mono">db = p − kᵥ · DB = db · x</code></div>
            <div class="formula-item"><span>Break-Even-Menge</span><code class="mono">x_BE = K_f / (p − kᵥ)</code></div>
          </div>
        </details>
      </div>
    </section>
  `;
}

function solveOhm(uStr, iStr, rStr, pStr) {
  const U = uStr !== '' && Number(uStr) > 0 ? Number(uStr) : null;
  const I = iStr !== '' && Number(iStr) > 0 ? Number(iStr) : null;
  const R = rStr !== '' && Number(rStr) > 0 ? Number(rStr) : null;
  const P = pStr !== '' && Number(pStr) > 0 ? Number(pStr) : null;

  const filled = [U, I, R, P].filter((x) => x !== null).length;
  if (filled !== 2) return null;

  if (U && I) return { U, I, R: U / I, P: U * I };
  if (U && R) return { U, I: U / R, R, P: (U * U) / R };
  if (U && P) return { U, I: P / U, R: (U * U) / P, P };
  if (I && R) return { U: I * R, I, R, P: I * I * R };
  if (I && P) return { U: P / I, I, R: P / (I * I), P };
  if (R && P) {
    const calcI = Math.sqrt(P / R);
    return { U: Math.sqrt(P * R), I: calcI, R, P };
  }
  return null;
}

function fmtEng(num) {
  if (!Number.isFinite(num)) return '–';
  if (num === 0) return '0';
  const abs = Math.abs(num);
  if (abs >= 1e6 || abs < 1e-3) {
    return num.toExponential(3).replace('.', ',');
  }
  return Number(num.toPrecision(4)).toString().replace('.', ',');
}

/* ---------- Sub-Tab 4: Bib-Fokus-Timer ---------- */
function renderFocusTab(state) {
  const snap = focusTimer.getSnapshot();
  const radius = 104;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - snap.progress);

  const subjectsSet = new Set();
  for (const c of state.timetable || []) subjectsSet.add(c.short || c.title);
  subjectsSet.add('Allgemein');
  const subjects = [...subjectsSet];
  if (!subjects.includes(snap.subject)) subjects.unshift(snap.subject);

  const totalsByCourse = new Map();
  let totalMinutes = 0;
  for (const ss of state.studySessions || []) {
    const mins = Number(ss.minutes || 0);
    totalMinutes += mins;
    totalsByCourse.set(ss.course, (totalsByCourse.get(ss.course) || 0) + mins);
  }
  const rankedCourses = [...totalsByCourse.entries()].sort((a, b) => b[1] - a[1]);
  const maxCourseMin = rankedCourses[0]?.[1] || 60;

  return `
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

        <div class="mt-md">
          <button class="btn btn-soft btn-sm" data-action="focus-wakelock">
            ${ICONS.phone} Display in der Bib wachhalten: <strong>${snap.wakeLockEnabled ? 'AN' : 'AUS'}</strong>
          </button>
        </div>
      </section>

      <section class="card">
        <div class="section-head">
          <div>
            <h2 class="section-title">Deine Lernzeit nach Fach</h2>
            <div class="text-xs text-muted">Gesamt: ${(totalMinutes / 60).toFixed(1).replace('.', ',')} Std. (${totalMinutes} Min)</div>
          </div>
          <button class="btn btn-soft btn-sm" data-action="log-manual-study">+ 30 Min</button>
        </div>

        ${
          rankedCourses.length === 0
            ? `<div class="empty-state"><strong>Noch keine Sessions geloggt</strong>Starte deinen ersten Fokus-Block!</div>`
            : `<div class="bar-chart">
                ${rankedCourses
                  .map(([course, mins]) => {
                    const pct = Math.max(8, Math.round((mins / maxCourseMin) * 100));
                    const hrs = (mins / 60).toFixed(1).replace('.', ',');
                    return `
                      <div class="bar-row">
                        <div class="bar-row-head">
                          <span class="fw-600">${esc(course)}</span>
                          <span class="mono text-secondary">${hrs} Std. (${mins} Min)</span>
                        </div>
                        <div class="progress-track">
                          <div class="progress-fill" style="width:${pct}%"></div>
                        </div>
                      </div>`;
                  })
                  .join('')}
              </div>`
        }
      </section>
    </div>
  `;
}

/* ---------- Sub-Tab 5: Erstsemester Zielnoten-Planer, Notenspiegel, HSD-Links & Notizen ---------- */
function renderGradesAndCampusTab(state) {
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
                  aria-label="Zielnote für ${esc(mod.title)}"
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
                  Sobald deine ersten Klausurergebnisse da sind, kannst du sie hier eintragen (oder direkt über „Klausuren → Geschrieben“ übernehmen).
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
            <h2 class="section-title">Schnellnotizen</h2>
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
