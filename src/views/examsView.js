import { ICONS } from '../components/icons.js';
import {
  COURSE_COLORS,
  daysBetween,
  formatDateDE,
  formatShortDateDE,
} from '../data/defaults.js';
import { isPersonalBridgeConfigured } from '../services/personalBridge.js';
import {
  computeExamReadiness,
  formatSingleGradeDE,
  getUnifiedExams,
} from '../state/store.js';
import {
  computeBwlBonus,
  computeMatheBonus,
  getExamBonusBadge,
  normalizeBonusPoints,
} from '../utils/bonusPoints.js';
import { esc } from '../utils/html.js';
import { renderGradesAndCampusSection } from './toolkitView.js';

export function renderExamsView(state, ui) {
  const now = new Date();
  const examsSub = ui.examsSub === 'grades' ? 'grades' : 'exams';
  const filter = ui.examFilter || 'upcoming';
  const googleConnected = Boolean(state.google.connected || isPersonalBridgeConfigured());

  const allExams = getUnifiedExams(state);
  const upcoming = allExams.filter((e) => !e.completed);
  const completed = allExams
    .filter((e) => e.completed)
    .sort((a, b) => b.date.localeCompare(a.date));

  const list = filter === 'upcoming' ? upcoming : completed;
  const totalUpcomingEcts = upcoming.reduce((s, e) => s + Number(e.ects || 0), 0);
  const avgReady =
    upcoming.length > 0
      ? Math.round(
          upcoming.reduce((s, e) => s + computeExamReadiness(e).pct, 0) / upcoming.length
        )
      : 0;

  const keywordsStr = (state.google.examKeywords || []).slice(0, 4).join(', ');
  const bonus = normalizeBonusPoints(state.bonusPoints);

  return `
    <header class="page-header">
      <div>
        <div class="page-eyebrow">${upcoming.length} Prüfungen · ${totalUpcomingEcts} ECTS · Ø ${avgReady}% vorbereitet</div>
        <h1 class="page-title">${examsSub === 'grades' ? 'Noten, Schnitt & HSD-Links' : 'Klausuren & Noten'}</h1>
      </div>
      <div class="page-actions">
        ${
          examsSub === 'grades'
            ? `<button class="btn btn-secondary btn-sm" data-action="open-modal" data-modal="note">${ICONS.plus} Notiz</button>
               <button class="btn btn-primary" data-action="open-modal" data-modal="grade">${ICONS.plus} Note</button>`
            : `${
                googleConnected
                  ? `<button class="btn btn-secondary btn-sm" data-action="sync-google-now">${ICONS.sync} Sync</button>`
                  : `<button class="btn btn-google btn-sm" data-action="open-modal" data-modal="settings">${ICONS.cloud} Dauer-Sync</button>`
              }
              <button class="btn btn-primary" data-action="open-modal" data-modal="exam">
                ${ICONS.plus} Klausur
              </button>`
        }
      </div>
    </header>

    <div class="timetable-toolbar">
      <div class="segmented-bar" role="tablist" aria-label="Klausuren und Noten">
        <button class="segment-btn ${examsSub === 'exams' ? 'active' : ''}" data-action="set-exams-sub" data-value="exams">
          Klausuren &amp; Bonus (${upcoming.length})
        </button>
        <button class="segment-btn ${examsSub === 'grades' ? 'active' : ''}" data-action="set-exams-sub" data-value="grades">
          Noten &amp; Schnitt
        </button>
      </div>
      ${
        examsSub === 'exams' && upcoming.length > 0
          ? `<div class="flex-row" style="gap:6px;">
              <div class="segmented-bar" role="tablist">
                <button class="segment-btn ${filter === 'upcoming' ? 'active' : ''}" data-action="set-exam-filter" data-value="upcoming">
                  Anstehend (${upcoming.length})
                </button>
                <button class="segment-btn ${filter === 'completed' ? 'active' : ''}" data-action="set-exam-filter" data-value="completed">
                  Geschrieben (${completed.length})
                </button>
              </div>
              <button class="btn btn-ghost btn-sm" data-action="export-ics-exams">${ICONS.download} .ics</button>
            </div>`
          : ''
      }
    </div>

    ${
      examsSub === 'grades'
        ? renderGradesAndCampusSection(state)
        : `
    ${renderBonusPointsCard(bonus)}

    ${
      !googleConnected
        ? `<div class="semester-strip mb-md" aria-label="Automatische Klausur-Erkennung">
            <div class="text-xs text-secondary">
              <strong>Google Kalender Klausuren:</strong> Richte Dauer-Sync ein, dann erscheinen deine echten Termine (<code>${esc(keywordsStr)}</code>) hier automatisch statt der Beispiele.
            </div>
            <div class="flex-row" style="gap:6px; flex-shrink:0;">
              <button class="btn btn-secondary btn-sm" data-action="open-modal" data-modal="settings">Dauer-Sync</button>
              <button class="btn btn-ghost btn-sm" data-nav="calendar">Kalender</button>
            </div>
          </div>`
        : ''
    }

    ${
      list.length === 0
        ? `<div class="card empty-state">
            <strong>${filter === 'upcoming' ? 'Noch keine anstehenden Klausuren erkannt' : 'Noch keine geschriebenen Klausuren'}</strong>
            ${
              filter === 'upcoming'
                ? 'Verbinde dein Google-Konto oder markiere einen Termin im Kalender als Klausur.'
                : 'Nach einer geschriebenen Prüfung kannst du hier deine Note direkt in den Notenspiegel übernehmen.'
            }
          </div>`
        : `<div class="exam-grid">
            ${list.map((ex) => renderExamCard(ex, now, googleConnected, bonus)).join('')}
          </div>`
    }
    `
    }
  `;
}

export function renderBonusPointsCard(bonusPoints) {
  const mathe = computeMatheBonus(bonusPoints.mathe);
  const bwl = computeBwlBonus(bonusPoints.bwl);

  return `
    <section class="card mb-md" aria-label="Bonus-Klausurpunkte">
      <div class="section-head" style="margin-bottom:12px;">
        <div>
          <h2 class="section-title" style="display:flex; align-items:center; gap:7px;">
            ${ICONS.award} Bonus-Klausurpunkte
          </h2>
          <div class="text-xs text-muted">Mathe I (1 : 1) &amp; BWL (10er-Brackets: 10 VL-Punkte = 5 Klausurpunkte) · auf allen Geräten synchron</div>
        </div>
      </div>

      <div class="bonus-grid">
        <!-- Mathe I (1:1) -->
        <div class="bonus-card">
          <div class="flex-between">
            <span class="badge badge-terracotta">Mathe I</span>
            <span class="badge badge-neutral mono">1 : 1</span>
          </div>
          <div class="bonus-score-row">
            <div class="bonus-big-num mono" data-bonus-display="mathe">${mathe.examPoints}</div>
            <div>
              <div class="fw-700 text-sm">Klausurpunkte</div>
              <div class="text-xs text-muted">Jeder Punkt zählt 1 zu 1</div>
            </div>
          </div>
          <div class="bonus-controls">
            <button
              class="btn btn-secondary btn-sm"
              data-action="adjust-bonus"
              data-subject="mathe"
              data-delta="-1"
              aria-label="Mathe I Bonuspunkt abziehen"
            >−1</button>
            <button
              class="btn btn-primary btn-sm"
              style="flex:1;"
              data-action="adjust-bonus"
              data-subject="mathe"
              data-delta="1"
            >+1 Punkt</button>
          </div>
        </div>

        <!-- BWL (10er-Brackets: 10 VP = 5 KP) -->
        <div class="bonus-card">
          <div class="flex-between">
            <span class="badge badge-ochre">BWL</span>
            <span class="badge badge-neutral mono">10 VP = 5 KP</span>
          </div>
          <div class="bonus-score-row">
            <div class="bonus-big-num mono" data-bonus-display="bwl-exam">${bwl.examPoints}</div>
            <div>
              <div class="fw-700 text-sm">Klausurpunkte</div>
              <div class="text-xs text-muted">
                aus <strong class="mono" data-bonus-display="bwl-vp">${bwl.lecturePoints}</strong> Vorlesungspunkten
              </div>
            </div>
          </div>
          <div>
            <div class="flex-between text-xs text-muted" style="margin-bottom:4px;">
              <span>Nächste Stufe: ${bwl.nextBracketAt} VP → ${bwl.nextExamPoints} KP</span>
              <span class="mono fw-600">noch ${bwl.toNextBracket} VP</span>
            </div>
            <div class="progress-track" style="height:6px;">
              <div class="progress-fill" style="width:${bwl.progressPct}%"></div>
            </div>
          </div>
          <div class="bonus-controls">
            <button
              class="btn btn-secondary btn-sm"
              data-action="adjust-bonus"
              data-subject="bwl"
              data-delta="-1"
              title="1 Vorlesungspunkt abziehen"
              aria-label="BWL 1 Vorlesungspunkt abziehen"
            >−1</button>
            <button
              class="btn btn-soft btn-sm"
              style="flex:1;"
              data-action="adjust-bonus"
              data-subject="bwl"
              data-delta="4"
            >+4 VL</button>
            <button
              class="btn btn-primary btn-sm"
              style="flex:1;"
              data-action="adjust-bonus"
              data-subject="bwl"
              data-delta="8"
            >+8 VL</button>
            <button
              class="btn btn-secondary btn-sm"
              data-action="adjust-bonus"
              data-subject="bwl"
              data-delta="1"
              title="1 Vorlesungspunkt hinzufügen"
              aria-label="BWL 1 Vorlesungspunkt hinzufügen"
            >+1</button>
          </div>
        </div>
      </div>
    </section>
  `;
}

function renderExamCard(ex, now, googleConnected, bonusPoints) {
  const days = daysBetween(ex.date, now);
  const ready = computeExamReadiness(ex);
  const openTopics = ready.total - ready.done;
  const paceHint =
    !ex.completed && openTopics > 0 && days > 0
      ? days >= openTopics
        ? `Rhythmus: ca. 1 Thema alle ${Math.max(1, Math.floor(days / openTopics))} Tage`
        : `Endspurt: ca. ${Math.ceil(openTopics / Math.max(1, days))} Themen pro Tag`
      : openTopics === 0 && ready.total > 0
        ? 'Alle Themen abgehakt — bereit für Altklausuren!'
        : '';

  const colorInfo = COURSE_COLORS[ex.color] || COURSE_COLORS.sage;
  const fillClass = ready.pct >= 70 ? '' : ready.pct >= 35 ? 'warn' : 'danger';
  const bonusBadge = getExamBonusBadge(ex.title, bonusPoints);
  const attemptBadge =
    Number(ex.attempt) >= 3
      ? `<span class="badge badge-danger">${ex.attempt}. Versuch</span>`
      : Number(ex.attempt) === 2
        ? `<span class="badge badge-ochre">2. Versuch</span>`
        : `<span class="badge badge-neutral">1. Versuch</span>`;

  return `
    <article class="exam-card">
      <div class="exam-card-head">
        <div>
          <div class="flex-row" style="gap:6px; margin-bottom:6px;">
            <span class="badge ${colorInfo.badge} mono">${ex.ects} ECTS</span>
            ${attemptBadge}
            ${
              bonusBadge
                ? `<span class="badge badge-sage mono">${ICONS.award} ${esc(bonusBadge.label)}</span>`
                : ''
            }
            ${
              ex.fromGoogle
                ? `<span class="badge badge-google">${ex.isDemoGoogle ? 'Google Beispiel' : 'Google Kalender'}</span>`
                : ''
            }
            ${ex.completed && ex.grade ? `<span class="badge badge-sage mono">Note ${formatSingleGradeDE(ex.grade)}</span>` : ''}
          </div>
          <h2 style="font-size:1.1rem; font-weight:700;">${esc(ex.title)}</h2>
          <div class="text-xs text-secondary mt-sm">
            ${formatShortDateDE(ex.date)} (${formatDateDE(ex.date)}) · <span class="mono">${esc(ex.time || '09:00')}</span> · ${ex.durationMin || 90} Min
          </div>
          ${ex.room ? `<div class="text-xs text-muted" style="margin-top:3px;">Raum: ${esc(ex.room)}</div>` : ''}
          ${ex.aids ? `<div class="text-xs text-muted" style="margin-top:3px;">Hilfsmittel: ${esc(ex.aids)}</div>` : ''}
        </div>
        <div class="exam-countdown">
          ${
            ex.completed
              ? `<span class="badge badge-sage">Erledigt</span>`
              : `
                <div class="exam-days-num" style="color:${days <= 14 ? 'var(--accent-terracotta)' : 'var(--accent-primary)'}">
                  ${days <= 0 ? 'Heute' : days}
                </div>
                <div class="exam-days-label">${days <= 0 ? 'Viel Erfolg!' : days === 1 ? 'Tag noch' : 'Tage noch'}</div>
              `
          }
        </div>
      </div>

      <div>
        <div class="flex-between text-xs" style="margin-bottom:5px;">
          <span class="text-secondary fw-600">Lernplan · ${ready.done}/${ready.total} Themen</span>
          <span class="mono fw-700">${ready.pct}%</span>
        </div>
        <div class="progress-track">
          <div class="progress-fill ${fillClass}" style="width:${ready.pct}%"></div>
        </div>
        ${paceHint ? `<div class="text-xs text-muted" style="margin-top:5px;">${esc(paceHint)}</div>` : ''}
      </div>

      <div class="topic-list">
        ${(ex.topics || [])
          .map(
            (tp) => `
          <div class="topic-item ${tp.done ? 'done' : ''}">
            <button
              class="check-circle ${tp.done ? 'checked' : ''}"
              style="width:19px; height:19px;"
              data-action="toggle-exam-topic"
              data-exam-id="${esc(ex.id)}"
              data-topic-id="${esc(tp.id)}"
              aria-label="Thema abhaken"
            >
              ${tp.done ? ICONS.check : ''}
            </button>
            <span style="flex:1;">${esc(tp.text)}</span>
            <button
              class="icon-btn"
              style="width:26px; height:26px;"
              data-action="delete-exam-topic"
              data-exam-id="${esc(ex.id)}"
              data-topic-id="${esc(tp.id)}"
              aria-label="Thema entfernen"
            >
              ${ICONS.close}
            </button>
          </div>`
          )
          .join('')}

        ${
          !ex.completed
            ? `<form class="inline-add-row" data-form="add-topic" data-exam-id="${esc(ex.id)}">
                <input class="input" style="min-height:36px; font-size:0.84rem; padding:6px 10px;" name="topic" placeholder="Neues Lernthema oder Altklausur…" required />
                <button class="btn btn-soft btn-sm" type="submit">+</button>
              </form>`
            : ''
        }
      </div>

      <div class="flex-between" style="padding-top:8px; border-top:1px solid var(--border-subtle); flex-wrap:wrap;">
        <div class="flex-row" style="gap:6px;">
          ${
            !ex.completed
              ? `<button class="btn btn-soft btn-sm" data-action="start-focus-quick" data-subject="${esc(ex.title)}">
                  ${ICONS.play} Lernen
                </button>`
              : ''
          }
          ${
            !ex.fromGoogle && !ex.completed
              ? `<button class="btn btn-google btn-sm" data-action="push-exam-google" data-id="${esc(ex.id)}">
                  ${ICONS.google} ${googleConnected ? 'In Google' : '.ics'}
                </button>`
              : ex.htmlLink
                ? `<a class="btn btn-ghost btn-sm" href="${esc(ex.htmlLink)}" target="_blank" rel="noopener noreferrer">Google ${ICONS.external}</a>`
                : ''
          }
        </div>
        <div class="flex-row" style="gap:4px;">
          ${
            !ex.completed
              ? `<button class="btn btn-secondary btn-sm" data-action="open-modal" data-modal="complete-exam" data-id="${esc(ex.id)}">
                  Geschrieben
                </button>`
              : ''
          }
          <button class="icon-btn" data-action="open-modal" data-modal="exam" data-id="${esc(ex.id)}" aria-label="Details bearbeiten">
            ${ICONS.edit}
          </button>
          ${
            ex.fromGoogle
              ? `<button class="btn btn-ghost btn-sm" data-action="dismiss-google-exam" data-gkey="${esc(ex.googleKey)}" title="Termin bleibt im Google Kalender, wird hier aber ausgeblendet">
                  Ausblenden
                </button>`
              : `<button class="icon-btn" data-action="delete-exam" data-id="${esc(ex.id)}" aria-label="Klausur löschen">${ICONS.trash}</button>`
          }
        </div>
      </div>
    </article>
  `;
}
