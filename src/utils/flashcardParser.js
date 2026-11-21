import { isoDate, uid } from '../data/defaults.js';

/**
 * Smart parser: converts pasted NotebookLM / Gemini study guides, Markdown tables,
 * Q/A blocks, or "Frage :: Antwort" lines into Studia flashcards with Leitner defaults.
 */
export function parseBulkFlashcards(rawText, courseKey, todayIso = isoDate()) {
  const cards = [];
  const seen = new Set();

  const addCard = (front, back) => {
    const f = String(front || '')
      .replace(/^[-•*]\s*/, '')
      .replace(/^\*\*|\*\*$/g, '')
      .trim();
    const b = String(back || '')
      .replace(/^\*\*|\*\*$/g, '')
      .trim();
    const key = `${f}|||${b}`;
    if (f && b && !seen.has(key)) {
      seen.add(key);
      cards.push({
        id: uid('fc'),
        course: courseKey,
        front: f,
        back: b,
        box: 1,
        nextReview: todayIso,
        lastReviewed: null,
        reps: 0,
      });
    }
  };

  const text = String(rawText || '').trim();
  if (!text) return cards;

  // Format 1: Markdown table rows | Question | Answer |
  const tableLines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.startsWith('|') && l.endsWith('|') && !/^\|[\s-:|]+\|$/.test(l));
  for (let i = 0; i < tableLines.length; i++) {
    const cols = tableLines[i]
      .slice(1, -1)
      .split('|')
      .map((c) => c.trim());
    if (cols.length >= 2 && !(i === 0 && /^(frage|begriff|question|term|vorderseite)$/i.test(cols[0]))) {
      addCard(cols[0], cols[1]);
    }
  }

  // Format 2: Q/F & A blocks ("F: ... A: ..." or "Frage: ... Antwort: ...")
  const qaRegex =
    /(?:^|\n)\s*(?:\d+[.)]\s*)?(?:\*\*)?(?:F|Frage|Q|Question)(?:\*\*)?\s*:\s*([\s\S]*?)\n\s*(?:\*\*)?(?:A|Antwort|Answer)(?:\*\*)?\s*:\s*([\s\S]*?)(?=\n\s*(?:\d+[.)]\s*)?(?:\*\*)?(?:F|Frage|Q|Question)(?:\*\*)?\s*:|$)/gi;
  let match;
  while ((match = qaRegex.exec(text)) !== null) {
    addCard(match[1], match[2]);
  }

  // Format 3: Line-by-line "Front :: Back" or "Front — Back"
  for (const line of text.split(/\r?\n/)) {
    const sep = line.includes('::') ? '::' : line.includes(' — ') ? ' — ' : null;
    if (!sep) continue;
    const [front, ...rest] = line.split(sep);
    addCard(front, rest.join(sep));
  }

  return cards;
}

/**
 * Guesses the best-matching module id from shared text/title/url (used by Web Share Target).
 */
export function guessModuleIdFromText(text = '', modules = []) {
  const hay = String(text || '').toLowerCase();
  const hints = [
    { id: 'mod_get', keys: ['elektrotechnik', 'get', 'kirchhoff', 'ohm', 'widerstand', 'kondensator', 'schoft', 'spannungsteiler'] },
    { id: 'mod_mathe', keys: ['mathe', 'komplex', 'matrix', 'vektor', 'integral', 'induktion', 'kerkhoff', 'kirchner'] },
    { id: 'mod_it', keys: ['informationstechnik', 'binär', 'hexadezimal', 'zweierkomplement', 'de morgan', 'machmerth', 'digitaltechnik'] },
    { id: 'mod_info', keys: ['informatik', 'algorithmus', 'schleife', 'java', 'python', 'pointer', 'mondwurf', 'programmierung'] },
    { id: 'mod_bwl', keys: ['bwl', 'betriebswirtschaft', 'deckungsbeitrag', 'break-even', 'bilanz', 'verhasselt'] },
    { id: 'mod_markt', keys: ['marktanalyse', 'marketing', 'marktbearbeitung', 'primärforschung', 'schmengler', '4 ps'] },
  ];
  for (const h of hints) {
    if (h.keys.some((k) => hay.includes(k))) {
      if (modules.some((m) => m.id === h.id)) return h.id;
    }
  }
  return modules[0]?.id || 'mod_get';
}
