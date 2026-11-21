import { store } from '../state/store.js';
import { isoDate, uid } from '../data/defaults.js';

export const FOCUS_PRESETS = [
  { id: 'pomodoro', label: '25 / 5', workMin: 25, breakMin: 5, desc: 'Klassischer Pomodoro' },
  { id: 'bib', label: '50 / 10', workMin: 50, breakMin: 10, desc: 'Uni-Bib Deep Work' },
  { id: 'exam', label: '90 / 15', workMin: 90, breakMin: 15, desc: 'Altklausur-Block' },
];

class FocusTimerService {
  constructor() {
    this.presetId = 'pomodoro';
    this.phase = 'work'; // 'work' | 'break'
    this.totalSeconds = 25 * 60;
    this.remainingSeconds = 25 * 60;
    this.running = false;
    this.endTimestamp = null;
    this.subject = 'GET I';
    this.wakeLockEnabled = false;
    this.wakeLockSentinel = null;
    this.intervalId = null;
    this.listeners = new Set();
    this.onCompleteCallback = null;
  }

  subscribe(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  emit() {
    this.listeners.forEach((fn) => fn(this.getSnapshot()));
  }

  getSnapshot() {
    return {
      presetId: this.presetId,
      phase: this.phase,
      totalSeconds: this.totalSeconds,
      remainingSeconds: this.remainingSeconds,
      running: this.running,
      subject: this.subject,
      wakeLockEnabled: this.wakeLockEnabled,
      progress:
        this.totalSeconds > 0
          ? 1 - this.remainingSeconds / this.totalSeconds
          : 0,
    };
  }

  setPreset(presetId) {
    const preset = FOCUS_PRESETS.find((p) => p.id === presetId) || FOCUS_PRESETS[0];
    this.pause();
    this.presetId = preset.id;
    this.phase = 'work';
    this.totalSeconds = preset.workMin * 60;
    this.remainingSeconds = this.totalSeconds;
    this.emit();
  }

  setSubject(subject) {
    this.subject = subject;
    this.emit();
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.endTimestamp = Date.now() + this.remainingSeconds * 1000;
    if (this.wakeLockEnabled) this.acquireWakeLock();
    this.intervalId = setInterval(() => this.tick(), 250);
    this.emit();
  }

  pause() {
    if (!this.running) return;
    this.running = false;
    clearInterval(this.intervalId);
    this.intervalId = null;
    if (this.endTimestamp) {
      this.remainingSeconds = Math.max(0, Math.ceil((this.endTimestamp - Date.now()) / 1000));
    }
    this.releaseWakeLock();
    this.emit();
  }

  toggle() {
    if (this.running) this.pause();
    else this.start();
  }

  reset() {
    this.pause();
    const preset = FOCUS_PRESETS.find((p) => p.id === this.presetId) || FOCUS_PRESETS[0];
    const mins = this.phase === 'work' ? preset.workMin : preset.breakMin;
    this.totalSeconds = mins * 60;
    this.remainingSeconds = this.totalSeconds;
    this.emit();
  }

  switchPhase(nextPhase) {
    this.pause();
    const preset = FOCUS_PRESETS.find((p) => p.id === this.presetId) || FOCUS_PRESETS[0];
    this.phase = nextPhase;
    const mins = nextPhase === 'work' ? preset.workMin : preset.breakMin;
    this.totalSeconds = mins * 60;
    this.remainingSeconds = this.totalSeconds;
    this.emit();
  }

  tick() {
    const left = Math.max(0, Math.ceil((this.endTimestamp - Date.now()) / 1000));
    if (left !== this.remainingSeconds) {
      this.remainingSeconds = left;
      this.emit();
    }
    if (left <= 0) {
      this.handleComplete();
    }
  }

  handleComplete() {
    this.pause();
    playChime();
    const preset = FOCUS_PRESETS.find((p) => p.id === this.presetId) || FOCUS_PRESETS[0];

    if (this.phase === 'work') {
      store.update((s) => {
        s.studySessions.push({
          id: uid('ss'),
          course: this.subject || 'Allgemein',
          minutes: preset.workMin,
          date: isoDate(),
        });
      });
      if (this.onCompleteCallback) {
        this.onCompleteCallback(
          `Stark! ${preset.workMin} Min für ${this.subject} geloggt. Zeit für ${preset.breakMin} Min Pause.`
        );
      }
      this.switchPhase('break');
    } else {
      if (this.onCompleteCallback) {
        this.onCompleteCallback('Pause vorbei — bereit für die nächste Lernsession!');
      }
      this.switchPhase('work');
    }
  }

  async toggleWakeLock() {
    this.wakeLockEnabled = !this.wakeLockEnabled;
    if (this.wakeLockEnabled && this.running) {
      await this.acquireWakeLock();
    } else if (!this.wakeLockEnabled) {
      await this.releaseWakeLock();
    }
    this.emit();
    return this.wakeLockEnabled;
  }

  async acquireWakeLock() {
    try {
      if ('wakeLock' in navigator && !this.wakeLockSentinel) {
        this.wakeLockSentinel = await navigator.wakeLock.request('screen');
        this.wakeLockSentinel.addEventListener('release', () => {
          this.wakeLockSentinel = null;
        });
      }
    } catch {
      // Wake Lock not permitted or unsupported
    }
  }

  async releaseWakeLock() {
    try {
      if (this.wakeLockSentinel) {
        await this.wakeLockSentinel.release();
        this.wakeLockSentinel = null;
      }
    } catch {
      this.wakeLockSentinel = null;
    }
  }
}

function playChime() {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const freqs = [523.25, 659.25, 783.99]; // C5 - E5 - G5 warm chime
    freqs.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      const start = ctx.currentTime + i * 0.14;
      gain.gain.setValueAtTime(0.001, start);
      gain.gain.exponentialRampToValueAtTime(0.14, start + 0.04);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 1.1);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 1.15);
    });
  } catch {
    // Audio blocked
  }
}

export function formatMMSS(totalSec) {
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export const focusTimer = new FocusTimerService();
