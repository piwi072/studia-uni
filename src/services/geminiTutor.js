import { parseBulkFlashcards } from '../utils/flashcardParser.js';

const KEY_STORAGE = 'studia_gemini_api_key';
const MODEL_STORAGE = 'studia_gemini_model';

export const GEMINI_MODELS = [
  {
    id: 'gemini-4-hydrogen',
    label: 'Gemini 4 Hydrogen (Empfohlen · Free Tier)',
  },
  {
    id: 'gemini-3.5-flash-lite',
    label: 'Gemini 3.5 Flash-Lite (Ultra-schnell · Free Tier)',
  },
  {
    id: 'gemini-4-neon',
    label: 'Gemini 4 Neon (Paid API Tier)',
  },
];

export function getGeminiApiKey() {
  try {
    if (typeof localStorage === 'undefined') return '';
    return localStorage.getItem(KEY_STORAGE) || '';
  } catch {
    return '';
  }
}

export function setGeminiApiKey(key) {
  try {
    if (typeof localStorage === 'undefined') return;
    const clean = String(key || '').trim();
    if (!clean) localStorage.removeItem(KEY_STORAGE);
    else localStorage.setItem(KEY_STORAGE, clean);
  } catch {
    // Ignore
  }
}

export function getGeminiModel() {
  try {
    if (typeof localStorage === 'undefined') return 'gemini-4-hydrogen';
    return localStorage.getItem(MODEL_STORAGE) || 'gemini-4-hydrogen';
  } catch {
    return 'gemini-4-hydrogen';
  }
}

export function setGeminiModel(modelId) {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(MODEL_STORAGE, modelId || 'gemini-4-hydrogen');
  } catch {
    // Ignore
  }
}

export function hasGeminiKey() {
  return getGeminiApiKey().length > 10;
}

function buildModuleNotesSnippet(mod, maxChars = 6000) {
  const notes = mod?.notebookNotes || [];
  if (notes.length === 0) return '';
  return notes
    .map((n) => `### ${n.title}\n${n.content}`)
    .join('\n\n')
    .slice(0, maxChars);
}

async function callGemini({ systemInstruction, userPrompt, modelOverride = null }) {
  const apiKey = getGeminiApiKey();
  if (!apiKey) {
    throw new Error(
      'Bitte hinterlege zuerst deinen kostenlosen Gemini API-Key aus Google AI Studio in den Einstellungen.'
    );
  }
  const model = modelOverride || getGeminiModel();
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: systemInstruction }] },
      contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
      generationConfig: {
        maxOutputTokens: 2048,
      },
    }),
  });

  if (!resp.ok) {
    const errJson = await resp.json().catch(() => null);
    const msg = errJson?.error?.message || `HTTP ${resp.status}`;
    if (resp.status === 400 || resp.status === 401 || resp.status === 403) {
      throw new Error(`API-Key oder Modell-Zugriff abgelehnt: ${msg}`);
    }
    if (resp.status === 429) {
      throw new Error(
        'Free-Tier Limit kurz erreicht (HTTP 429). Warte 30 Sekunden oder wechsle in den Einstellungen auf Gemini 3.5 Flash-Lite.'
      );
    }
    throw new Error(`Gemini API Fehler: ${msg}`);
  }

  const data = await resp.json();
  const parts = data?.candidates?.[0]?.content?.parts || [];
  const text = parts
    .filter((p) => p.text && !p.thought)
    .map((p) => p.text)
    .join('\n')
    .trim();

  if (!text) {
    throw new Error('Gemini hat keine Antwort zurückgegeben. Formuliere deine Anfrage etwas genauer.');
  }
  return text;
}

/**
 * Mode 1: Generate flashcards from module notes and/or custom topic.
 */
export async function generateTutorFlashcards(mod, customTopic = '') {
  const notesText = buildModuleNotesSnippet(mod);
  const topicLine = customTopic.trim()
    ? `Schwerpunkt-Thema: ${customTopic.trim()}`
    : notesText
      ? 'Erstelle Karten auf Basis der bereitgestellten Modul-Notizen.'
      : `Erstelle 6 typische Erstsemester-Prüfungskarten für das Modul „${mod.title}“ (HSD B.Eng. WIE).`;

  const systemInstruction = `Du bist ein präziser Tutor für Erstsemester im Studiengang Wirtschaftsingenieurwesen Elektrotechnik (Hochschule Düsseldorf).
Antworte auf Deutsch. Gib AUSSCHLIESSLICH 6 kompakte Karteikarten im exakten Format:
Frage :: Antwort
Eine Karte pro Zeile, ohne Nummerierung, ohne Markdown-Codeblock, ohne Einleitung oder Schlusswort. Formeln gut lesbar mit Unicode (Ω, µ, √, ², ₁, φ).`;

  const userPrompt = `Modul: ${mod.title} (${mod.short})\n${topicLine}${
    notesText ? `\n\nGespeicherte Modul-Notizen:\n${notesText}` : ''
  }`;

  const rawText = await callGemini({ systemInstruction, userPrompt });
  const cards = parseBulkFlashcards(rawText, mod.courseKey);
  return { rawText, cards };
}

/**
 * Mode 2: Explain an exercise or concept step-by-step.
 */
export async function explainTutorExercise(mod, questionText) {
  const notesText = buildModuleNotesSnippet(mod, 3500);
  const systemInstruction = `Du bist ein geduldiger, klar strukturierter Uni-Tutor für Erstsemester Wirtschaftsingenieurwesen Elektrotechnik (HSD).
Erkläre Übungsaufgaben und Konzepte auf Deutsch Schritt für Schritt:
1. Gegeben / Gesucht (falls Rechenaufgabe)
2. Passende Formel / Regel
3. Rechenweg Schritt für Schritt (mit Einheiten-Check!)
4. Kurzes Fazit & typische Klausur-Falle.
Verwende gut lesbare Unicode-Formeln (U = R · I, √, ², φ, Ω) statt rohem LaTeX-Quelltext.`;

  const userPrompt = `Modul: ${mod.title}\nAufgabe / Frage:\n${questionText.trim()}${
    notesText ? `\n\nKontext aus meinen Notizen:\n${notesText}` : ''
  }`;

  const text = await callGemini({ systemInstruction, userPrompt });
  return { text };
}

/**
 * Mode 3: Generate 3 exam practice questions with collapsible solutions.
 */
export async function generateTutorExamQuestions(mod, customFocus = '') {
  const notesText = buildModuleNotesSnippet(mod, 4500);
  const systemInstruction = `Du bist Klausur-Coach für Erstsemester Wirtschaftsingenieurwesen Elektrotechnik (Hochschule Düsseldorf).
Erstelle genau 3 realistische Klausur-Probefragen (Mix aus Verständnis & kurzer Rechen-/Anwendungsaufgabe) auf Deutsch.
Verwende exakt dieses Format, getrennt durch "---":
FRAGE: <Aufgabenstellung inkl. Punkte z. B. (6 Pkt.)>
LÖSUNG: <Präzise Musterlösung mit Rechenweg/Stichpunkten>
---
Keine Einleitung, kein Schlusswort, Formeln in sauberem Unicode.`;

  const userPrompt = `Modul: ${mod.title} (${mod.short})${
    customFocus.trim() ? `\nFokus: ${customFocus.trim()}` : ''
  }${notesText ? `\n\nMeine Modul-Notizen:\n${notesText}` : ''}`;

  const rawText = await callGemini({ systemInstruction, userPrompt });
  const blocks = rawText
    .split(/\n?---+\n?/)
    .map((b) => b.trim())
    .filter(Boolean);

  const items = [];
  for (const b of blocks) {
    const m = b.match(/FRAGE\s*:\s*([\s\S]*?)\n\s*LÖSUNG\s*:\s*([\s\S]*)/i);
    if (m) {
      items.push({
        question: m[1].trim(),
        solution: m[2].trim(),
      });
    }
  }
  return { rawText, items };
}
