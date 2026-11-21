import { ICONS } from '../components/icons.js';
import {
  COURSE_COLORS,
  daysBetween,
  formatDateDE,
  formatShortDateDE,
} from '../data/defaults.js';
import {
  computeExamReadiness,
  formatSingleGradeDE,
  getUnifiedExams,
} from '../state/store.js';
import { esc } from '../utils/html.js';

export function renderExamsView(state, ui) {
  const now = new Date();
  const filter = ui.examFilter || 'upcoming';

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

  return `
    <header class="page-header">
      <div>
        <div class="page-eyebrow">${upcoming.length} Prüfungen · ${totalUpcomingEcts} ECTS · Ø ${avgReady}% vorbereitet</div>
        <h1 class="page-title">Klausuren & Lernplan</h1>
      </div>
      <div class="page-actions">
        ${
          state.google.connected
            ? `<button class="btn btn-google btn-sm" data-action="sync-google-now">${ICONS.sync} Google Sync</button>`
            : `<button class="btn btn-google btn-sm" data-action="open-modal" data-modal="settings">${ICONS.google} Google verbinden</button>`
        }
        <button class="btn btn-primary" data-action="open-modal" data-modal="exam">
          ${ICONS.plus} Klausur
        </button>
      </div>
    </header>

    <section class="google-banner" aria-label="Automatische Klausur-Erkennung">
      <div class="google-banner-info">
        <div class="google-icon-wrap">${ICONS.google}</div>
        <div>
          <div class="fw-700" style="font-size:0.9rem;">
            ${
              state.google.connected
                ? 'Klausuren direkt aus deinem Google Kalender'
                : 'Kein doppeltes Eintippen: Klausuren kommen aus Google Kalender'
            }
          </div>
          <div class="text-xs text-secondary">
            Erkennung aktiv für Schlagwörter (<code>${esc(keywordsStr)}</code>) + jeder Termin im Kalender lässt sich per 1 Klick als Klausur übernehmen. Lern-Checklisten & Hilfsmittel werden hier direkt drangehängt.
          </div>
        </div>
      </div>
      <button class="btn btn-secondary btn-sm" data-nav="calendar">Im Kalender wählen</button>
    </section>

    <div class="timetable-toolbar">
      <div class="segmented-bar" role="tablist">
        <button class="segment-btn ${filter === 'upcoming' ? 'active' : ''}" data-action="set-exam-filter" data-value="upcoming">
          Anstehend (${upcoming.length})
        </button>
        <button class="segment-btn ${filter === 'completed' ? 'active' : ''}" data-action="set-exam-filter" data-value="completed">
          Geschrieben (${completed.length})
        </button>
      </div>
      ${
        upcoming.length > 0
          ? `<button class="btn btn-ghost btn-sm" data-action="export-ics-exams">${ICONS.download} .ics Export</button>`
          : ''
      }
    </div>

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
            ${list.map((ex) => renderExamCard(ex, now, state.google.connected)).join('')}
          </div>`
    }
  `;
}

function renderExamCard(ex, now, googleConnected) {
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
