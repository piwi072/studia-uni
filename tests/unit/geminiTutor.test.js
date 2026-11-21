import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildGeminiAppHandoffPrompt,
  buildGeminiRequestBody,
  getGeminiModel,
  getGeminiThinkingLevel,
} from '../../src/services/geminiTutor.js';

describe('Gemini 4 Neon Pro Tutor Service', () => {
  it('defaults to gemini-4-neon with medium thinking level', () => {
    assert.equal(getGeminiModel(), 'gemini-4-neon');
    assert.equal(getGeminiThinkingLevel(), 'medium');
  });

  it('builds generateContent body with thinkingConfig.thinkingLevel for Gemini 4 Neon', () => {
    const body = buildGeminiRequestBody({
      model: 'gemini-4-neon',
      systemInstruction: 'System',
      userPrompt: 'Explain Ohm',
      thinkingLevel: 'high',
    });
    assert.equal(body.generationConfig.maxOutputTokens, 8192);
    assert.deepEqual(body.generationConfig.thinkingConfig, { thinkingLevel: 'high' });
  });

  it('omits thinkingConfig for gemini-3.5-flash-lite', () => {
    const body = buildGeminiRequestBody({
      model: 'gemini-3.5-flash-lite',
      systemInstruction: 'System',
      userPrompt: 'Quick card',
      thinkingLevel: 'medium',
    });
    assert.equal(body.generationConfig.thinkingConfig, undefined);
  });

  it('builds module-aware handoff prompt including saved notes for Gemini Pro App', () => {
    const mod = {
      title: 'Grundlagen der Elektrotechnik I für WIE',
      short: 'GET I',
      notebookNotes: [{ title: 'Kapitel 2', content: 'Spannungsteiler U2 = U * R2 / (R1 + R2)' }],
    };
    const prompt = buildGeminiAppHandoffPrompt(mod, 'explain', 'Berechne U2 für R1=1k, R2=2k');
    assert.ok(prompt.includes('Grundlagen der Elektrotechnik I'));
    assert.ok(prompt.includes('Spannungsteiler U2 = U * R2 / (R1 + R2)'));
    assert.ok(prompt.includes('Berechne U2 für R1=1k, R2=2k'));
  });
});
