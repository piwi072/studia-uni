import { parseBulkFlashcards } from '../utils/flashcardParser.js';

const KEY_STORAGE = 'studia_gemini_api_key';
const MODEL_STORAGE = 'studia_gemini_model';
const THINKING_STORAGE = 'studia_gemini_thinking';

export const GEMINI_MODELS = [
  {
    id: 'gemini-4-neon',
    short: 'Gemini 4 Neon',
    label: 'Gemini 4 Neon (Pro · Starkes Reasoning)',
    supportsThinkingLevel: true,
    isPro: true,
  },
  {
    id: 'gemini-4-hydrogen',
    short: 'Gemini 4 Hydrogen',
    label: 'Gemini 4 Hydrogen (Free Tier · Schnell)',
    supportsThinkingLevel: true,
    isPro: false,
  },
  {
    id: 'gemini-3.5-flash-lite',
    short: '3.5 Flash-Lite',
    label: 'Gemini 3.5 Flash-Lite (Free Tier · Ultra-schnell)',
    supportsThinkingLevel: false,
    isPro: false,
  },
  {
    id: 'gemini-4-carbon',
    short: 'Gemini 4 Carbon',
    label: 'Gemini 4 Carbon (Max. Tiefe · Paid API)',
    supportsThinkingLevel: true,
    isPro: true,
  },
];

export const GEMINI_THINKING_LEVELS = [
  { id: 'low', label: 'Schnell (low)' },
  { id: 'medium', label: 'Ausgewogen (medium)' },
  { id: 'high', label: 'Gründlich (high)' },
  { id: 'xhigh', label: 'Extra tief (xhigh)' },
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
    if (typeof localStorage === 'undefined') return 'gemini-4-neon';
    const saved = localStorage.getItem(MODEL_STORAGE);
    return saved && GEMINI_MODELS.some((m) => m.id === saved) ? saved : 'gemini-4-neon';
  } catch {
    return 'gemini-4-neon';
  }
}

export function setGeminiModel(modelId) {
  try {
    if (typeof localStorage === 'undefined') return;
    const valid = GEMINI_MODELS.some((m) => m.id === modelId) ? modelId : 'gemini-4-neon';
    localStorage.setItem(MODEL_STORAGE, valid);
  } catch {
    // Ignore
  }
}

export function getGeminiThinkingLevel() {
  try {
    if (typeof localStorage === 'undefined') return 'medium';
    const saved = localStorage.getItem(THINKING_STORAGE);
    return GEMINI_THINKING_LEVELS.some((t) => t.id === saved) ? saved : 'medium';
  } catch {
    return 'medium';
  }
}

export function setGeminiThinkingLevel(level) {
  try {
    if (typeof localStorage === 'undefined') return;
    const valid = GEMINI_THINKING_LEVELS.some((t) => t.id === level) ? level : 'medium';
    localStorage.setItem(THINKING_STORAGE, valid);
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

/**
 * Pure request body builder for Gemini generateContent REST API.
 * Uses thinkingConfig.thinkingLevel for Gemini 4 models (Neon, Hydrogen, Carbon)
 * and reserves 8192 maxOutputTokens so reasoning tokens never truncate the answer.
 */
export function buildGeminiRequestBody({
  model,
  systemInstruction,
  userPrompt,
  thinkingLevel = 'medium',
}) {
  const modelMeta = GEMINI_MODELS.find((m) => m.id === model);
  const generationConfig = {
    maxOutputTokens: 8192,
  };
  if (modelMeta?.supportsThinkingLevel && thinkingLevel) {
    generationConfig.thinkingConfig = {
      thinkingLevel,
    };
  }
  return {
    system_instruction: { parts: [{ text: systemInstruction }] },
    contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
    generationConfig,
  };
}

/**
 * Builds the exact module-aware system & user prompts (reused both for the live API
 * and for the 1-click "In Gemini Pro (Neon) öffnen" clipboard handoff!).
 */
export function buildTutorPrompts(mod, mode = 'cards', customInput = '') {
  const input = String(customInput || '').trim();
  const notesText = buildModuleNotesSnippet(mod, mode === 'explain' ? 3500 : 6000);

  if (mode === 'explain') {
    const systemInstruction = `Du bist ein geduldiger, klar strukturierter Uni-Tutor für Erstsemester Wirtschaftsingenieurwesen Elektrotechnik (Hochschule Düsseldorf).
Erkläre Übungsaufgaben und Konzepte auf Deutsch Schritt für Schritt:
1. Gegeben / Gesucht (falls Rechenaufgabe)
2. Passende Formel / Regel
3. Rechenweg Schritt für Schritt (mit Einheiten-Check!)
4. Kurzes Fazit & typische Klausur-Falle.
Verwende gut lesbare Unicode-Formeln (U = R · I, √, ², φ, Ω) statt rohem LaTeX-Quelltext.`;
    const userPrompt = `Modul: ${mod.title} (${mod.short})\nAufgabe / Frage:\n${
      input || `Erkläre die wichtigsten Erstsemester-Grundlagen in ${mod.title} verständlich an einem Beispiel.`
    }${notesText ? `\n\nKontext aus meinen Notizen:\n${notesText}` : ''}`;
    return { systemInstruction, userPrompt };
  }

  if (mode === 'exam') {
    const systemInstruction = `Du bist Klausur-Coach für Erstsemester Wirtschaftsingenieurwesen Elektrotechnik (Hochschule Düsseldorf).
Erstelle genau 3 realistische Klausur-Probefragen (Mix aus Verständnis & kurzer Rechen-/Anwendungsaufgabe) auf Deutsch.
Verwende exakt dieses Format, getrennt durch "---":
FRAGE: <Aufgabenstellung inkl. Punkte z. B. (6 Pkt.)>
LÖSUNG: <Präzise Musterlösung mit Rechenweg/Stichpunkten>
---
Keine Einleitung, kein Schlusswort, Formeln in sauberem Unicode.`;
    const userPrompt = `Modul: ${mod.title} (${mod.short})${
      input ? `\nFokus: ${input}` : ''
    }${notesText ? `\n\nMeine Modul-Notizen:\n${notesText}` : ''}`;
    return { systemInstruction, userPrompt };
  }

  // Default: 'cards'
  const topicLine = input
    ? `Schwerpunkt-Thema: ${input}`
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
  return { systemInstruction, userPrompt };
}

export function buildGeminiAppHandoffPrompt(mod, mode = 'cards', customInput = '') {
  const { systemInstruction, userPrompt } = buildTutorPrompts(mod, mode, customInput);
  return `${systemInstruction}\n\n${userPrompt}`;
}

async function callGemini({ systemInstruction, userPrompt, modelOverride = null }) {
  const apiKey = getGeminiApiKey();
  if (!apiKey) {
    throw new Error(
      'Kein Gemini API-Key hinterlegt. Du kannst oben deinen AI-Studio-Key eintragen — oder direkt „In Gemini Pro (Neon) öffnen“ ohne API-Key nutzen.'
    );
  }
  const model = modelOverride || getGeminiModel();
  const thinkingLevel = getGeminiThinkingLevel();
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const body = buildGeminiRequestBody({ model, systemInstruction, userPrompt, thinkingLevel });

  let resp;
  try {
    resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error(
      'Keine Internetverbindung — für den KI-Tutor wird eine aktive Verbindung benötigt.'
    );
  }

  if (!resp.ok) {
    const errJson = await resp.json().catch(() => null);
    const msg = errJson?.error?.message || `HTTP ${resp.status}`;
    const isNeonOrCarbon = model === 'gemini-4-neon' || model === 'gemini-4-carbon';
    if (isNeonOrCarbon && (resp.status === 400 || resp.status === 403 || resp.status === 429)) {
      const err = new Error(
        `${model} benötigt in Google AI Studio einen API-Key mit aktivierten Pro-Credits / Billing (${msg}). Tipp: Aktiviere deine monatlichen Google-AI-Pro-API-Credits in AI Studio, wechsle direkt auf „Gemini 4 Hydrogen (Free)“, oder nutze „In Gemini Pro (Neon) öffnen“.`
      );
      err.canFallbackToHydrogen = true;
      throw err;
    }
    if (resp.status === 400 || resp.status === 401 || resp.status === 403) {
      throw new Error(`API-Key oder Modell-Zugriff abgelehnt: ${msg}`);
    }
    if (resp.status === 429) {
      throw new Error(
        'Limit kurz erreicht (HTTP 429). Warte kurz oder wechsle das Modell direkt im KI-Tutor.'
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

export async function generateTutorFlashcards(mod, customTopic = '') {
  const { systemInstruction, userPrompt } = buildTutorPrompts(mod, 'cards', customTopic);
  const rawText = await callGemini({ systemInstruction, userPrompt });
  const cards = parseBulkFlashcards(rawText, mod.courseKey);
  return { rawText, cards };
}

export async function explainTutorExercise(mod, questionText) {
  const { systemInstruction, userPrompt } = buildTutorPrompts(mod, 'explain', questionText);
  const text = await callGemini({ systemInstruction, userPrompt });
  return { text };
}

export async function generateTutorExamQuestions(mod, customFocus = '') {
  const { systemInstruction, userPrompt } = buildTutorPrompts(mod, 'exam', customFocus);
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
