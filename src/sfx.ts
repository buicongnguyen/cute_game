/**
 * Small synthesized sound effects. Everything is generated with WebAudio, so
 * there is nothing to download and the game stays playable offline.
 */
export type Sound = 'click' | 'punch' | 'swing' | 'hit' | 'crit' | 'hurt' | 'pop' | 'splash' | 'cast' | 'reel' | 'snap'
  | 'success' | 'level' | 'harvest' | 'shoot' | 'poof' | 'coin';

export class Sfx {
  enabled = true;
  private ctx: AudioContext | null = null;
  private out: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private last = new Map<Sound, number>();

  private context() {
    if (!this.enabled) return null;
    try {
      this.ctx ??= new AudioContext();
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      if (!this.out) { this.out = this.ctx.createGain(); this.out.gain.value = .55; this.out.connect(this.ctx.destination); }
      if (!this.noise) {
        this.noise = this.ctx.createBuffer(1, this.ctx.sampleRate, this.ctx.sampleRate);
        const data = this.noise.getChannelData(0); let seed = 7;
        for (let i = 0; i < data.length; i++) { seed = (seed * 16807) % 2147483647; data[i] = seed / 1073741823.5 - 1; }
      }
      return this.ctx;
    } catch { return null; }
  }

  private tone(ctx: AudioContext, at: number, type: OscillatorType, from: number, to: number, length: number, volume: number) {
    const osc = ctx.createOscillator(), gain = ctx.createGain();
    osc.type = type; osc.frequency.setValueAtTime(from, at); osc.frequency.exponentialRampToValueAtTime(Math.max(20, to), at + length);
    gain.gain.setValueAtTime(volume, at); gain.gain.exponentialRampToValueAtTime(.0008, at + length);
    osc.connect(gain); gain.connect(this.out!); osc.start(at); osc.stop(at + length + .02);
  }

  private hiss(ctx: AudioContext, at: number, filter: BiquadFilterType, from: number, to: number, length: number, volume: number, q = 1) {
    const src = ctx.createBufferSource(), band = ctx.createBiquadFilter(), gain = ctx.createGain();
    src.buffer = this.noise; band.type = filter; band.Q.value = q;
    band.frequency.setValueAtTime(from, at); band.frequency.exponentialRampToValueAtTime(Math.max(40, to), at + length);
    gain.gain.setValueAtTime(volume, at); gain.gain.exponentialRampToValueAtTime(.0008, at + length);
    src.connect(band); band.connect(gain); gain.connect(this.out!); src.start(at, Math.random() * .5); src.stop(at + length + .02);
  }

  play(sound: Sound) {
    const ctx = this.context(); if (!ctx) return;
    const now = ctx.currentTime, previous = this.last.get(sound) ?? -1;
    // Many hits in the same instant would only clip; one clear sound reads better.
    if (now - previous < (sound === 'hit' || sound === 'coin' ? .045 : .02)) return;
    this.last.set(sound, now);
    const t = now + .005;
    switch (sound) {
      case 'click': this.tone(ctx, t, 'sine', 740, 520, .06, .05); break;
      case 'pop': this.tone(ctx, t, 'sine', 420, 980, .09, .09); break;
      case 'coin': this.tone(ctx, t, 'square', 1320, 1320, .05, .025); this.tone(ctx, t + .05, 'square', 1760, 1760, .09, .025); break;
      case 'punch': case 'swing': this.hiss(ctx, t, 'bandpass', sound === 'swing' ? 2200 : 1400, 380, .11, .16, 1.4); break;
      case 'hit': this.hiss(ctx, t, 'lowpass', 2400, 300, .07, .22); this.tone(ctx, t, 'triangle', 190, 80, .1, .2); break;
      case 'crit': this.hiss(ctx, t, 'lowpass', 3200, 400, .09, .26); this.tone(ctx, t, 'triangle', 220, 70, .14, .24);
        this.tone(ctx, t + .02, 'sine', 1200, 2100, .16, .07); break;
      case 'hurt': this.tone(ctx, t, 'square', 260, 120, .14, .05); this.hiss(ctx, t, 'lowpass', 900, 200, .12, .12); break;
      case 'shoot': this.tone(ctx, t, 'sine', 900, 280, .1, .08); break;
      case 'poof': this.hiss(ctx, t, 'lowpass', 1800, 200, .25, .2); this.tone(ctx, t, 'sine', 520, 180, .18, .06); break;
      case 'cast': this.hiss(ctx, t, 'bandpass', 900, 3000, .18, .06, 2); break;
      case 'splash': this.hiss(ctx, t, 'lowpass', 1600, 250, .3, .22); this.tone(ctx, t, 'sine', 340, 160, .12, .05); break;
      case 'reel': this.hiss(ctx, t, 'highpass', 3000, 3000, .03, .05); break;
      case 'snap': this.tone(ctx, t, 'sawtooth', 700, 90, .18, .06); this.hiss(ctx, t, 'highpass', 2500, 1200, .12, .1); break;
      case 'success': [523, 659, 784].forEach((f, i) => this.tone(ctx, t + i * .08, 'sine', f, f, .16, .07)); break;
      case 'harvest': [659, 988].forEach((f, i) => this.tone(ctx, t + i * .07, 'sine', f, f * 1.01, .14, .07)); break;
      case 'level': [523, 659, 784, 1046].forEach((f, i) => this.tone(ctx, t + i * .09, 'triangle', f, f, .2, .07)); break;
    }
  }
}
