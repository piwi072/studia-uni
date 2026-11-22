export const DEFAULT_BONUS_POINTS = {
  mathe: 7, // 1:1 (1 gesammelter Punkt = 1 Klausurpunkt)
  bwl: 21, // Vorlesungspunkte (+1 bis +4 pro Quiz, teils 2 Quizzes/VL), 10er-Brackets: 10 VP = 5 Klausurpunkte
};

export function normalizeBonusPoints(raw) {
  const matheNum = Number(raw?.mathe);
  const bwlNum = Number(raw?.bwl);
  return {
    mathe:
      raw?.mathe !== undefined && raw?.mathe !== null && Number.isFinite(matheNum)
        ? Math.max(0, Math.round(matheNum))
        : DEFAULT_BONUS_POINTS.mathe,
    bwl:
      raw?.bwl !== undefined && raw?.bwl !== null && Number.isFinite(bwlNum)
        ? Math.max(0, Math.round(bwlNum))
        : DEFAULT_BONUS_POINTS.bwl,
  };
}

/**
 * Mathe I: 1:1 conversion (each collected point = 1 exam bonus point).
 */
export function computeMatheBonus(rawPoints) {
  const collected = Math.max(0, Math.round(Number(rawPoints ?? 0)));
  return {
    collected,
    examPoints: collected,
  };
}

/**
 * BWL: Lecture points (+4 or +8 per lecture) convert at 0.5x in 10-point brackets:
 * 10 VP = 5 Klausurpunkte, 20 VP = 10 KP, 30 VP = 15 KP, ...
 */
export function computeBwlBonus(rawLecturePoints) {
  const lecturePoints = Math.max(0, Math.round(Number(rawLecturePoints ?? 0)));
  const bracketSize = 10;
  const examPointsPerBracket = 5;
  const completedBrackets = Math.floor(lecturePoints / bracketSize);
  const examPoints = completedBrackets * examPointsPerBracket;
  const remainder = lecturePoints % bracketSize;
  const nextBracketAt = (completedBrackets + 1) * bracketSize;
  const toNextBracket = bracketSize - remainder;
  const nextExamPoints = (completedBrackets + 1) * examPointsPerBracket;
  const progressPct = Math.round((remainder / bracketSize) * 100);

  return {
    lecturePoints,
    examPoints,
    completedBrackets,
    remainder,
    bracketSize,
    nextBracketAt,
    toNextBracket,
    nextExamPoints,
    progressPct,
  };
}

/**
 * Matches a Klausur title to its bonus point summary (Mathe I or BWL), if any.
 */
export function getExamBonusBadge(examTitle, bonusPoints) {
  const t = String(examTitle || '').toLowerCase();
  const bp = normalizeBonusPoints(bonusPoints);
  if (t.includes('mathe')) {
    const m = computeMatheBonus(bp.mathe);
    return {
      subject: 'mathe',
      examPoints: m.examPoints,
      label: `+${m.examPoints} Bonuspunkte`,
    };
  }
  if (t.includes('bwl') || t.includes('betriebswirtschaft')) {
    const b = computeBwlBonus(bp.bwl);
    return {
      subject: 'bwl',
      examPoints: b.examPoints,
      label: `+${b.examPoints} Bonuspunkte (${b.lecturePoints} VP)`,
    };
  }
  return null;
}
