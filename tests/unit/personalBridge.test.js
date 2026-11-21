import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  decodeBridgePairingToken,
  encodeBridgePairingToken,
  generateAppsScriptCode,
  generateBridgeSecret,
} from '../../src/services/personalBridge.js';

describe('Personal Dauer-Sync Bridge Service', () => {
  it('generates high-entropy personal secrets with std_ prefix', () => {
    const s1 = generateBridgeSecret();
    const s2 = generateBridgeSecret();
    assert.ok(s1.startsWith('std_'));
    assert.equal(s1.length, 28);
    assert.notEqual(s1, s2);
  });

  it('roundtrips base64url Magic Pairing Tokens cleanly', () => {
    const original = {
      url: 'https://script.google.com/macros/s/AKfycbxTestBridgeId123/exec',
      secret: 'std_AbC123xYz789MnPqRsTuVwXy',
    };
    const token = encodeBridgePairingToken(original);
    assert.ok(!/[+/=]/.test(token), 'Token must be URL-safe base64url without padding');
    const decoded = decodeBridgePairingToken(token);
    assert.deepEqual(decoded, original);
  });

  it('rejects malformed pairing tokens', () => {
    assert.throws(() => decodeBridgePairingToken('not_valid_json_token'));
  });

  it('generates timezone-safe Apps Script containing secret, Drive sync, and Calendar reminders', () => {
    const secret = 'std_TestSecretToken123456789';
    const script = generateAppsScriptCode(secret);
    assert.ok(script.includes(`const STUDIA_SECRET = '${secret}';`));
    assert.ok(script.includes('function doPost(e)'));
    assert.ok(script.includes('DriveApp.createFile'));
    assert.ok(script.includes('CalendarApp.getAllCalendars()'));
    assert.ok(script.includes('addPopupReminder(1440)'));
    assert.ok(script.includes('addPopupReminder(120)'));
    assert.ok(script.includes('Utilities.formatDate'));
    assert.ok(script.includes('Utilities.parseDate'));
    assert.ok(script.includes('Session.getEffectiveUser().getEmail()'));
  });
});
