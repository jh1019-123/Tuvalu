import { FishTier } from '../types/game';

class SoundEngine {
  private ctx: AudioContext | null = null;
  private muted = false;

  private ensureContext(): AudioContext | null {
    if (this.muted) return null;
    if (!this.ctx && typeof window !== 'undefined') {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
    return this.ctx;
  }

  public setMuted(mute: boolean) {
    this.muted = mute;
  }

  public isMuted(): boolean {
    return this.muted;
  }

  private playTone(
    freq: number,
    duration: number,
    type: OscillatorType = 'sine',
    gainVal = 0.14,
    freqEnd?: number,
    delay = 0,
  ) {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    if (freqEnd !== undefined) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, freqEnd), now + duration);
    }
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(gainVal, now + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + duration + 0.02);
  }

  private playNoise(duration: number, filterFreq = 800, gainVal = 0.08, delay = 0) {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime + delay;
    const sampleCount = Math.floor(ctx.sampleRate * duration);
    const buffer = ctx.createBuffer(1, sampleCount, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < sampleCount; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(filterFreq, now);
    filter.Q.setValueAtTime(1.5, now);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(gainVal, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    src.start(now);
    src.stop(now + duration + 0.02);
  }

  public playCast() {
    this.playTone(320, 0.22, 'triangle', 0.1, 720);
    this.playNoise(0.18, 1200, 0.06, 0.05);
  }

  public playSplash() {
    this.playNoise(0.28, 650, 0.14);
    this.playTone(220, 0.16, 'sine', 0.08, 90, 0.02);
  }

  public playBiteAlert() {
    this.playTone(660, 0.12, 'triangle', 0.16, 880);
    this.playTone(880, 0.16, 'triangle', 0.16, 1174, 0.1);
  }

  public playReelTick() {
    this.playTone(540, 0.04, 'square', 0.04, 420);
  }

  public playCatchFanfare(tier: FishTier) {
    const notes: Record<FishTier, number[]> = {
      common: [523, 659],
      uncommon: [523, 659, 784],
      epic: [523, 659, 784, 1046],
      legendary: [523, 659, 784, 987, 1174],
      mythic: [523, 659, 784, 1046, 1318, 1568],
    };
    const seq = notes[tier];
    seq.forEach((n, idx) => {
      this.playTone(n, 0.24, 'triangle', 0.14, undefined, idx * 0.08);
    });
  }

  public playCoin() {
    this.playTone(987, 0.08, 'sine', 0.12);
    this.playTone(1318, 0.18, 'sine', 0.14, undefined, 0.07);
  }

  public playScrub() {
    this.playNoise(0.09, 1800, 0.07);
    this.playTone(460, 0.06, 'sine', 0.04, 620);
  }

  public playChop(perfect: boolean) {
    this.playNoise(0.07, 900, 0.12);
    if (perfect) {
      this.playTone(740, 0.14, 'triangle', 0.12, 987);
    } else {
      this.playTone(320, 0.09, 'triangle', 0.09, 220);
    }
  }

  public playDropIngredient() {
    this.playTone(300, 0.12, 'sine', 0.12, 520);
    this.playNoise(0.14, 1400, 0.06, 0.04);
  }

  public playFireFan() {
    this.playNoise(0.16, 480, 0.09);
  }

  public playStir() {
    this.playTone(587, 0.11, 'sine', 0.1, 784);
  }

  public playVictory() {
    [523, 659, 784, 1046, 1318].forEach((n, i) => {
      this.playTone(n, 0.3, 'triangle', 0.15, undefined, i * 0.09);
    });
  }

  public playDefeat() {
    [440, 392, 349, 293].forEach((n, i) => {
      this.playTone(n, 0.26, 'sawtooth', 0.07, undefined, i * 0.12);
    });
  }

  public playSwat() {
    this.playNoise(0.08, 1600, 0.14);
    this.playTone(760, 0.08, 'triangle', 0.12, 1120, 0.01);
  }

  public playPestLand() {
    this.playTone(190, 0.14, 'sawtooth', 0.08, 130);
  }

  public playRecipeUnlock() {
    [587, 740, 880, 1174, 1480].forEach((n, idx) => {
      this.playTone(n, 0.28, 'triangle', 0.14, undefined, idx * 0.075);
    });
  }

  public playJudgeTasting() {
    this.playTone(440, 0.14, 'sine', 0.09, 523);
    this.playTone(587, 0.18, 'triangle', 0.09, 659, 0.12);
  }

  public playClick() {
    this.playTone(620, 0.05, 'sine', 0.07, 740);
  }
}

export const soundEngine = new SoundEngine();
