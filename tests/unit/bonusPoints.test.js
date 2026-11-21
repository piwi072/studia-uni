import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_BONUS_POINTS,
  computeBwlBonus,
  computeMatheBonus,
  getExamBonusBadge,
  normalizeBonusPoints,
} from '../../src/utils/bonusPoints.js';
import { migrateHsdUrl } from '../../src/state/store.js';

describe('Bonus-Klausurpunkte (Mathe I & BWL) and HSD URL Migration', () => {
  it('initializes Mathe I with 7 points (1:1) and BWL with 21 lecture points (10 exam points)', () => {
    const bp = normalizeBonusPoints(undefined);
    assert.deepEqual(bp, DEFAULT_BONUS_POINTS);
    assert.equal(computeMatheBonus(bp.mathe).examPoints, 7);
    const bwl = computeBwlBonus(bp.bwl);
    assert.equal(bwl.lecturePoints, 21);
    assert.equal(bwl.examPoints, 10);
    assert.equal(bwl.nextBracketAt, 30);
    assert.equal(bwl.toNextBracket, 9);
    assert.equal(bwl.nextExamPoints, 15);
  });

  it('computes BWL 10-point brackets accurately across +4 and +8 increments', () => {
    assert.equal(computeBwlBonus(0).examPoints, 0);
    assert.equal(computeBwlBonus(9).examPoints, 0);
    assert.equal(computeBwlBonus(10).examPoints, 5);
    assert.equal(computeBwlBonus(19).examPoints, 5);
    assert.equal(computeBwlBonus(20).examPoints, 10);
    // Starting from 21 VP: +4 -> 25 VP (still 10 KP), then +8 -> 33 VP (15 KP!)
    const after4 = computeBwlBonus(21 + 4);
    assert.equal(after4.examPoints, 10);
    assert.equal(after4.toNextBracket, 5);
    const after8 = computeBwlBonus(21 + 4 + 8);
    assert.equal(after8.examPoints, 15);
    assert.equal(after8.toNextBracket, 7);
    assert.equal(after8.nextExamPoints, 20);
  });

  it('matches Mathe I and BWL exams to their bonus badge labels', () => {
    const bp = { mathe: 8, bwl: 29 };
    const mBadge = getExamBonusBadge('Mathematik I für WIE', bp);
    const bBadge = getExamBonusBadge('Grundlagen der BWL', bp);
    const gBadge = getExamBonusBadge('Grundlagen der Elektrotechnik I', bp);
    assert.equal(mBadge?.label, '+8 Bonuspunkte');
    assert.equal(bBadge?.label, '+10 Bonuspunkte (29 VP)');
    assert.equal(gBadge, null);
  });

  it('migrates legacy broken HSD Moodle, OSSC, and DaVinci URLs to verified live endpoints', () => {
    assert.equal(migrateHsdUrl('https://moodle.hs-duesseldorf.de'), 'https://mdl.hs-duesseldorf.de/');
    assert.equal(
      migrateHsdUrl('https://moodle.hs-duesseldorf.de/course/view.php?id=42'),
      'https://mdl.hs-duesseldorf.de/course/view.php?id=42'
    );
    assert.equal(migrateHsdUrl('https://ossc.hs-duesseldorf.de'), 'https://ecampus.hs-duesseldorf.de/');
    assert.equal(
      migrateHsdUrl('https://davinci.ei.hs-duesseldorf.de'),
      'https://davinci.ei.hs-duesseldorf.de/davinciIS.dll?type=class'
    );
    assert.equal(migrateHsdUrl('https://notebooklm.google.com/'), 'https://notebooklm.google.com/');
  });
});
