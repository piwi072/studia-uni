import { addDaysToISO, isoDate } from '../data/defaults.js';

/**
 * 5-Box Leitner Spaced Repetition Schedule
 * Box 1: 1 day   (Neu / Wiederholen)
 * Box 2: 3 days  (Lernen)
 * Box 3: 7 days  (Festigen)
 * Box 4: 14 days (Sicher)
 * Box 5: 30 days (Langzeit)
 */
export const LEITNER_BOXES = [
  { box: 1, days: 1, label: 'Fach 1 · Neu', shortLabel: 'Neu', badgeClass: 'badge-neutral' },
  { box: 2, days: 3, label: 'Fach 2 · Lernen', shortLabel: 'Lernen', badgeClass: 'badge-ochre' },
  { box: 3, days: 7, label: 'Fach 3 · Festigen', shortLabel: 'Festigen', badgeClass: 'badge-slate' },
  { box: 4, days: 14, label: 'Fach 4 · Sicher', shortLabel: 'Sicher', badgeClass: 'badge-sage' },
  { box: 5, days: 30, label: 'Fach 5 · Langzeit', shortLabel: 'Langzeit', badgeClass: 'badge-sage' },
];

export function getBoxMeta(boxNum) {
  const clamped = Math.max(1, Math.min(5, Number(boxNum || 1)));
  return LEITNER_BOXES[clamped - 1];
}

/**
 * Ensures older cards (from v1/v2 with box 1..3 and no nextReview) have full Leitner fields.
 */
export function normalizeCard(card, todayIso = isoDate()) {
  const box = Math.max(1, Math.min(5, Number(card.box || 1)));
  return {
    ...card,
    box,
    nextReview: card.nextReview || todayIso,
    lastReviewed: card.lastReviewed || null,
    reps: Number(card.reps || 0),
  };
}

export function isCardDue(card, todayIso = isoDate()) {
  if (!card) return false;
  if (!card.nextReview) return true;
  return card.nextReview <= todayIso;
}

/**
 * Preview intervals for rating buttons (again / hard / good) on the current card.
 */
export function previewNextIntervals(card) {
  const curBox = Math.max(1, Math.min(5, Number(card?.box || 1)));
  const curDays = getBoxMeta(curBox).days;
  const hardDays = Math.max(1, Math.floor(curDays / 2));
  const nextBox = Math.min(5, curBox + 1);
  const goodDays = getBoxMeta(nextBox).days;
  return {
    againLabel: 'Heute',
    hardDays,
    hardLabel: hardDays === 1 ? '1 Tag' : `${hardDays} Tage`,
    goodDays,
    goodLabel: goodDays === 1 ? '1 Tag' : `${goodDays} Tage`,
    nextBox,
  };
}

/**
 * Applies a Leitner rating ('again' | 'hard' | 'good') and returns updated fields.
 */
export function rateCard(card, result, todayIso = isoDate()) {
  const curBox = Math.max(1, Math.min(5, Number(card.box || 1)));
  const reps = Number(card.reps || 0);

  if (result === 'again') {
    return {
      ...card,
      box: 1,
      nextReview: todayIso, // re-appears immediately in today's due queue
      lastReviewed: todayIso,
      reps: 0,
    };
  }

  if (result === 'hard') {
    const keepBox = Math.max(1, curBox);
    const interval = Math.max(1, Math.floor(getBoxMeta(keepBox).days / 2));
    return {
      ...card,
      box: keepBox,
      nextReview: addDaysToISO(todayIso, interval),
      lastReviewed: todayIso,
      reps: reps + 1,
    };
  }

  // 'good'
  const newBox = Math.min(5, curBox + 1);
  const interval = getBoxMeta(newBox).days;
  return {
    ...card,
    box: newBox,
    nextReview: addDaysToISO(todayIso, interval),
    lastReviewed: todayIso,
    reps: reps + 1,
  };
}

/**
 * Returns cards sorted by urgency: overdue/due first, then lower box first, then earliest nextReview.
 */
export function getModuleCardQueue(cards, courseKey, { dueOnly = true, todayIso = isoDate() } = {}) {
  const filtered = (cards || [])
    .filter((c) => (!courseKey || c.course === courseKey))
    .map((c) => normalizeCard(c, todayIso))
    .filter((c) => (!dueOnly || isCardDue(c, todayIso)));

  return filtered.sort((a, b) => {
    const aDue = isCardDue(a, todayIso) ? 0 : 1;
    const bDue = isCardDue(b, todayIso) ? 0 : 1;
    if (aDue !== bDue) return aDue - bDue;
    if (a.box !== b.box) return a.box - b.box;
    return (a.nextReview || '').localeCompare(b.nextReview || '');
  });
}

/**
 * Aggregates 5-box Leitner counts and due counts globally or for a specific course.
 */
export function getLeitnerStats(cards, courseKey = null, todayIso = isoDate()) {
  const list = (cards || [])
    .filter((c) => (!courseKey || c.course === courseKey))
    .map((c) => normalizeCard(c, todayIso));

  const boxes = [0, 0, 0, 0, 0];
  let dueCount = 0;
  let masteredCount = 0;

  for (const c of list) {
    boxes[c.box - 1] += 1;
    if (isCardDue(c, todayIso)) dueCount += 1;
    if (c.box >= 4) masteredCount += 1;
  }

  return {
    total: list.length,
    dueCount,
    masteredCount,
    boxes, // [box1, box2, box3, box4, box5]
  };
}
