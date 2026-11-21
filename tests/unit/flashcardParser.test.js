import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { guessModuleIdFromText, parseBulkFlashcards } from '../../src/utils/flashcardParser.js';

describe('Flashcard Bulk Parser & Share Module Matcher', () => {
  it('parses mixed Markdown tables, F:/A: blocks, and :: lines with deduplication', () => {
    const input = `
| Frage | Antwort |
| --- | --- |
| Was ist das Ohmsche Gesetz? | U = R · I |
| Einheit der Kapazität? | Farad (F) |

F: Was besagt die Knotenregel?
A: Summe aller Ströme im Knoten ist 0.

Leistung DC :: P = U · I
Was ist das Ohmsche Gesetz? :: U = R · I
`;
    const cards = parseBulkFlashcards(input, 'GET I', '2026-11-21');
    assert.equal(cards.length, 4);
    assert.equal(cards[0].course, 'GET I');
    assert.equal(cards[0].box, 1);
    assert.equal(cards[0].nextReview, '2026-11-21');
  });

  it('auto-detects the right HSD WIE module from shared text', () => {
    const mods = [
      { id: 'mod_get' },
      { id: 'mod_mathe' },
      { id: 'mod_it' },
      { id: 'mod_info' },
      { id: 'mod_bwl' },
      { id: 'mod_markt' },
    ];
    assert.equal(guessModuleIdFromText('Zweierkomplement und De Morgan Übung', mods), 'mod_it');
    assert.equal(guessModuleIdFromText('Break-Even und Stückdeckungsbeitrag', mods), 'mod_bwl');
    assert.equal(guessModuleIdFromText('Komplexe Zahlen Euler-Form', mods), 'mod_mathe');
    assert.equal(guessModuleIdFromText('4 Ps Marketing-Mix', mods), 'mod_markt');
  });
});
