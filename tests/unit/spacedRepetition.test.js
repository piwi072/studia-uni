import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  getLeitnerStats,
  getModuleCardQueue,
  isCardDue,
  normalizeCard,
  previewNextIntervals,
  rateCard,
} from '../../src/utils/spacedRepetition.js';

describe('5-Box Leitner Spaced Repetition', () => {
  it('migrates legacy cards without nextReview to be due today', () => {
    const legacy = { id: 'fc_old', course: 'GET I', front: 'U=?', back: 'R·I', box: 2 };
    const norm = normalizeCard(legacy, '2026-11-21');
    assert.equal(norm.box, 2);
    assert.equal(norm.nextReview, '2026-11-21');
    assert.equal(isCardDue(norm, '2026-11-21'), true);
  });

  it('advances box and schedules 3/7/14/30-day intervals on good rating', () => {
    let card = { id: 'fc_1', course: 'GET I', front: 'F', back: 'A', box: 1, nextReview: '2026-11-21', reps: 0 };
    card = rateCard(card, 'good', '2026-11-21');
    assert.equal(card.box, 2);
    assert.equal(card.nextReview, '2026-11-24'); // +3d
    assert.equal(isCardDue(card, '2026-11-22'), false);
    assert.equal(isCardDue(card, '2026-11-24'), true);

    card = rateCard(card, 'good', '2026-11-24');
    assert.equal(card.box, 3);
    assert.equal(card.nextReview, '2026-12-01'); // +7d

    card = rateCard(card, 'good', '2026-12-01');
    assert.equal(card.box, 4);
    assert.equal(card.nextReview, '2026-12-15'); // +14d

    card = rateCard(card, 'good', '2026-12-15');
    assert.equal(card.box, 5);
    assert.equal(card.nextReview, '2027-01-14'); // +30d
  });

  it('resets card to box 1 due today on again rating', () => {
    const card = { id: 'fc_2', course: 'Mathe I', front: 'F', back: 'A', box: 4, nextReview: '2026-11-21', reps: 5 };
    const updated = rateCard(card, 'again', '2026-11-21');
    assert.equal(updated.box, 1);
    assert.equal(updated.nextReview, '2026-11-21');
    assert.equal(updated.reps, 0);
  });

  it('keeps box with shortened interval on hard rating', () => {
    const card = { id: 'fc_3', course: 'BWL', front: 'F', back: 'A', box: 3, nextReview: '2026-11-21', reps: 2 };
    const updated = rateCard(card, 'hard', '2026-11-21');
    assert.equal(updated.box, 3);
    assert.equal(updated.nextReview, '2026-11-24'); // floor(7/2) = 3 days
  });

  it('computes accurate due queue, preview labels, and 5-box stats', () => {
    const cards = [
      { id: 'c1', course: 'GET I', front: '1', back: '1', box: 1, nextReview: '2026-11-21' },
      { id: 'c2', course: 'GET I', front: '2', back: '2', box: 4, nextReview: '2026-12-01' },
      { id: 'c3', course: 'GET I', front: '3', back: '3', box: 5, nextReview: '2026-11-20' },
    ];
    const dueQueue = getModuleCardQueue(cards, 'GET I', { dueOnly: true, todayIso: '2026-11-21' });
    assert.equal(dueQueue.length, 2);
    assert.equal(dueQueue[0].id, 'c1'); // lower box first

    const stats = getLeitnerStats(cards, 'GET I', '2026-11-21');
    assert.equal(stats.total, 3);
    assert.equal(stats.dueCount, 2);
    assert.equal(stats.masteredCount, 2);
    assert.deepEqual(stats.boxes, [1, 0, 0, 1, 1]);

    const prev = previewNextIntervals({ box: 2 });
    assert.equal(prev.goodDays, 7);
    assert.equal(prev.hardDays, 1);
  });
});
