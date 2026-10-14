/**
 * Synthesized sound effects (FIX-PLAN 5.1). Everything is built with WebAudio from layered oscillators, FM bells,
 * filtered noise and envelopes, so nothing is downloaded: bytes before play are unchanged and the game stays
 * playable offline. The AudioContext is made on the first touch/key (phones need that to unlock audio) or on the
 * first sound, never before. Each play draws a little random pitch and volume so repeats are not robotic; a
 * per-sound rate limit and a global voice cap keep big fights from clipping; a compressor glues the mix.
 * Nothing runs per frame: cost exists only while a sound plays. Docs: docs/SOUNDS.md.
 */
export type Sound = 'alert' | 'click' | 'open' | 'close' | 'punch' | 'swing' | 'hit' | 'hitHeavy' | 'crit' | 'hurt' | 'pop' | 'plant'
  | 'splash' | 'cast' | 'reel' | 'snap' | 'bite' | 'catch' | 'stroke' | 'dive'
  | 'jump' | 'flip' | 'land'
  | 'success' | 'quest' | 'level' | 'harvest' | 'shoot' | 'poof' | 'coin' | 'buy' | 'sell' | 'ready' | 'power'
  | 'boom' | 'zap' | 'freeze' | 'magic' | 'shock';

/** Every game event the sound pass covers, and the voice it plays (tests check each one has a recipe). */
export const SOUND_EVENTS = {
  hitBlade: 'hit', hitFist: 'hit', hitGun: 'hit', hitHeavy: 'hitHeavy', critical: 'crit', enemyDefeat: 'poof', playerHurt: 'hurt',
  harvest: 'harvest', plant: 'plant', energyGain: 'coin', buy: 'buy', sell: 'sell', levelUp: 'level',
  fishBite: 'bite', fishCatch: 'catch', uiTap: 'click', uiOpen: 'open', uiClose: 'close', questComplete: 'quest',
  powerStrike: 'power', jump: 'jump', land: 'land', swimStroke: 'stroke', swimSplash: 'dive',
  swingBlade: 'swing', swingFist: 'punch', gunShot: 'shoot',
} as const satisfies Record<string, Sound>;

export type WeaponKind = 'blade' | 'fist' | 'gun';
/** Attack sounds tell the next hit what struck: a blade rings, a fist smacks, a shot ticks. */
const WEAPON_OF: Partial<Record<Sound, WeaponKind>> = { swing: 'blade', punch: 'fist', shoot: 'gun', zap: 'gun' };
const WEAPON_MEMORY = 1.2; // seconds an attack sound colours the hits after it

/** Per-sound limits inside a 100 ms window; everything else allows 2. */
export const RATE: Partial<Record<Sound, number>> = { hit: 3, hitHeavy: 2, coin: 4, crit: 2, poof: 2, reel: 1, stroke: 1, ready: 1 };
export const RATE_WINDOW = .1;
export const MAX_VOICES = 14;
/** These still play over a full cap (a fanfare should not vanish in a brawl), up to MAX_VOICES + 4. */
const PRIORITY = new Set<Sound>(['level', 'quest', 'hurt', 'catch', 'power']);
/** Musical cues stay in tune: less pitch spread. */
const TUNED = new Set<Sound>(['level', 'quest', 'success', 'coin', 'buy', 'sell', 'harvest', 'magic', 'freeze', 'ready', 'open', 'close']);

/** Rate limit + voice cap, pure so tests can drive it with a fake clock. */
export class SoundGate {
  private recent = new Map<Sound, number[]>();
  private ends: number[] = [];
  voices(now: number) { this.ends = this.ends.filter(e => e > now); return this.ends.length; }
  /** True when `sound` may start at `now`; it then counts as a voice until `end`. */
  admit(sound: Sound, now: number, end: number) {
    const times = (this.recent.get(sound) ?? []).filter(t => now - t < RATE_WINDOW);
    if (times.length >= (RATE[sound] ?? 2) || (times.length && now - times[times.length - 1] < .018)) { this.recent.set(sound, times); return 'limited' as const; }
    if (this.voices(now) >= MAX_VOICES + (PRIORITY.has(sound) ? 4 : 0)) return 'capped' as const;
    times.push(now); this.recent.set(sound, times); this.ends.push(end); return 'ok' as const;
  }
}

/** Rough voice lengths (seconds) so the cap knows when a voice is done. */
const LENGTH: Partial<Record<Sound, number>> = { level: 1.1, quest: .9, catch: .8, power: .7, success: .55, buy: .5, sell: .55, poof: .45, harvest: .4, dive: .5, boom: .4, magic: .45, freeze: .4 };

type Ctx = AudioContext;
interface Kit { ctx: Ctx; at: number; p: number; g: number }

export class Sfx {
  enabled = true;
  /** Effects volume from Settings (audio-settings.ts), 0-1; the default 0.8 plays at the original loudness. */
  volume = .8;
  /** Counters for tests and the browser probe. */
  readonly stats = { started: 0, limited: 0, capped: 0, muted: 0, byKind: {} as Partial<Record<Sound, number>> };
  random: () => number = Math.random;
  private ctx: Ctx | null = null;
  private out: GainNode | null = null;
  private analyser: AnalyserNode | null = null;
  private noise: AudioBuffer | null = null;
  private gate = new SoundGate();
  private weapon: { kind: WeaponKind; at: number } = { kind: 'fist', at: -9 };
  private make: () => Ctx;

  constructor(make?: () => Ctx) {
    this.make = make ?? (() => new AudioContext());
    // Phones: the context may only start inside a gesture, so the first touch/key builds and resumes it.
    if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
      const unlock = () => {
        for (const e of ['pointerdown', 'touchend', 'keydown']) window.removeEventListener(e, unlock, true);
        const ctx = this.context(); if (!ctx) return;
        try { const s = ctx.createBufferSource(); s.buffer = ctx.createBuffer(1, 1, ctx.sampleRate); s.connect(ctx.destination); s.start(); } catch { /* fine */ }
      };
      for (const e of ['pointerdown', 'touchend', 'keydown']) window.addEventListener(e, unlock, { capture: true, passive: true });
      (globalThis as { __zooSfx?: Sfx }).__zooSfx ??= this;
    }
  }

  private context() {
    if (!this.enabled || !(this.volume > 0)) return null;
    try {
      this.ctx ??= this.make();
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      if (!this.out) {
        this.out = this.ctx.createGain();
        if (typeof this.ctx.createDynamicsCompressor === 'function') { // glues a busy mix and stops clipping
          const comp = this.ctx.createDynamicsCompressor();
          comp.threshold.value = -14; comp.knee.value = 10; comp.ratio.value = 6; comp.attack.value = .003; comp.release.value = .18;
          this.out.connect(comp); comp.connect(this.ctx.destination);
        } else this.out.connect(this.ctx.destination);
      }
      this.out.gain.value = .55 * Math.max(0, Math.min(1, this.volume)) / .8;
      if (!this.noise) {
        this.noise = this.ctx.createBuffer(1, this.ctx.sampleRate, this.ctx.sampleRate);
        const data = this.noise.getChannelData(0); let seed = 7;
        for (let i = 0; i < data.length; i++) { seed = (seed * 16807) % 2147483647; data[i] = seed / 1073741823.5 - 1; }
      }
      return this.ctx;
    } catch { return null; }
  }

  /** For the browser probe: an AnalyserNode on the effects bus (made only when asked). */
  meter() { const ctx = this.context(); if (!ctx || !this.out) return null; if (!this.analyser) { this.analyser = ctx.createAnalyser(); this.analyser.fftSize = 512; this.out.connect(this.analyser); } return this.analyser; }

  // ---- building blocks -------------------------------------------------------------------------------------
  /** One oscillator with a quick attack and exponential decay, pitch gliding from -> to. */
  private tone(k: Kit, dt: number, type: OscillatorType, from: number, to: number, length: number, volume: number, attack = .004) {
    const { ctx } = k, at = k.at + dt, osc = ctx.createOscillator(), gain = ctx.createGain();
    osc.type = type; osc.frequency.setValueAtTime(from * k.p, at); osc.frequency.exponentialRampToValueAtTime(Math.max(20, to * k.p), at + length);
    gain.gain.setValueAtTime(.0001, at); gain.gain.linearRampToValueAtTime(volume * k.g, at + attack); gain.gain.exponentialRampToValueAtTime(.0008, at + length);
    osc.connect(gain); gain.connect(this.out!); osc.start(at); osc.stop(at + length + .02);
  }
  /** Filtered noise: whooshes, smacks, splashes, dust. */
  private hiss(k: Kit, dt: number, filter: BiquadFilterType, from: number, to: number, length: number, volume: number, q = 1, attack = .003) {
    const { ctx } = k, at = k.at + dt, src = ctx.createBufferSource(), band = ctx.createBiquadFilter(), gain = ctx.createGain();
    src.buffer = this.noise; band.type = filter; band.Q.value = q;
    band.frequency.setValueAtTime(from * k.p, at); band.frequency.exponentialRampToValueAtTime(Math.max(40, to * k.p), at + length);
    gain.gain.setValueAtTime(.0001, at); gain.gain.linearRampToValueAtTime(volume * k.g, at + attack); gain.gain.exponentialRampToValueAtTime(.0008, at + length);
    src.connect(band); band.connect(gain); gain.connect(this.out!); src.start(at, this.random() * .5); src.stop(at + length + .02);
  }
  /** A two-operator FM bell: coins, blade rings, sparkles. ratio 3.5 = glassy, 2.76 = metal, 1.4 = wood. */
  private bell(k: Kit, dt: number, freq: number, length: number, volume: number, ratio = 3.5, index = 2.2) {
    const { ctx } = k, at = k.at + dt, f = freq * k.p, car = ctx.createOscillator(), mod = ctx.createOscillator(), depth = ctx.createGain(), gain = ctx.createGain();
    car.frequency.value = f; mod.frequency.value = f * ratio;
    depth.gain.setValueAtTime(f * index, at); depth.gain.exponentialRampToValueAtTime(f * .05, at + length);
    gain.gain.setValueAtTime(.0001, at); gain.gain.linearRampToValueAtTime(volume * k.g, at + .003); gain.gain.exponentialRampToValueAtTime(.0008, at + length);
    mod.connect(depth); depth.connect(car.frequency); car.connect(gain); gain.connect(this.out!);
    mod.start(at); car.start(at); mod.stop(at + length + .02); car.stop(at + length + .02);
  }
  /** Water droplets: tiny sine chirps that rise, at random offsets. */
  private drops(k: Kit, dt: number, n: number, spread: number, volume: number) {
    for (let i = 0; i < n; i++) { const f = 700 + this.random() * 900; this.tone(k, dt + this.random() * spread, 'sine', f, f * 1.9, .045, volume); }
  }
  private weaponHit(k: Kit, kind: WeaponKind, heavy: number) {
    if (kind === 'blade') { // a bright metal ring over a slice and a small body thud
      this.bell(k, 0, 1650 + this.random() * 250, .16 + .1 * heavy, .07, 2.76, 3);
      this.hiss(k, 0, 'highpass', 5200, 2600, .05, .16, .8); this.tone(k, 0, 'triangle', 200, 90, .09, .16);
    } else if (kind === 'gun') { // a sharp tick, a crack of grit, a short pop
      this.tone(k, 0, 'square', 1100, 380, .03, .05); this.hiss(k, 0, 'lowpass', 3600, 500, .06, .2);
      this.tone(k, 0, 'sine', 260, 90, .08, .2);
    } else { // fist: a round smack and a soft-belly bump
      this.tone(k, 0, 'sine', 160, 52, .13, .32, .002); this.hiss(k, 0, 'lowpass', 2200, 260, .07, .24);
      this.tone(k, 0, 'triangle', 360, 170, .05, .1);
    }
    if (heavy) { this.tone(k, 0, 'sine', 95 , 34, .22 * heavy + .06, .3, .003); this.hiss(k, .005, 'lowpass', 1400, 140, .2 * heavy, .2); }
  }

  /** Plays a sound; true when it started (false: muted, rate-limited or over the voice cap). */
  play(sound: Sound) {
    if (!this.enabled || !(this.volume > 0)) { this.stats.muted++; return false; }
    const ctx = this.context(); if (!ctx) return false;
    const now = ctx.currentTime, end = now + (LENGTH[sound] ?? .3);
    const verdict = this.gate.admit(sound, now, end);
    if (verdict !== 'ok') { this.stats[verdict]++; return false; }
    this.stats.started++; this.stats.byKind[sound] = (this.stats.byKind[sound] ?? 0) + 1;
    const spread = TUNED.has(sound) ? .015 : .08;
    const k: Kit = { ctx, at: now + .005, p: 1 + (this.random() - .5) * spread, g: .88 + this.random() * .24 };
    const weaponKind = WEAPON_OF[sound]; if (weaponKind) this.weapon = { kind: weaponKind, at: now };
    const struck: WeaponKind = now - this.weapon.at < WEAPON_MEMORY ? this.weapon.kind : 'fist';
    try { this.voice(k, sound, struck); } catch { /* a missing WebAudio feature only loses this sound */ }
    return true;
  }

  private voice(k: Kit, sound: Sound, struck: WeaponKind) {
    switch (sound) {
      // UI: a soft wooden tap, a two-note pluck up to open, down to close.
      case 'click': this.bell(k, 0, 1250, .05, .06, 1.4, 1.2); this.hiss(k, 0, 'highpass', 6500, 5000, .015, .03); break;
      case 'open': this.bell(k, 0, 660, .12, .07, 1.4, 1.4); this.bell(k, .06, 990, .16, .06, 1.4, 1.2); this.hiss(k, 0, 'bandpass', 700, 2200, .12, .035, 1.5, .03); break;
      case 'close': this.bell(k, 0, 880, .1, .06, 1.4, 1.2); this.bell(k, .055, 587, .14, .055, 1.4, 1.2); this.hiss(k, 0, 'bandpass', 2000, 650, .1, .03, 1.5, .02); break;
      case 'alert': this.tone(k, 0, 'square', 660, 990, .07, .035); this.tone(k, .07, 'square', 990, 1320, .08, .03); break;
      // Attacks: a blade whoosh, a shorter lower fist whoosh, a cute "pew" with a crack and a thump.
      case 'swing': this.hiss(k, 0, 'bandpass', 700, 3400, .15, .16, 2.4, .04); this.hiss(k, .03, 'highpass', 6000, 3000, .08, .04); break;
      case 'punch': this.hiss(k, 0, 'bandpass', 420, 1300, .1, .17, 1.8, .025); break;
      case 'shoot': this.tone(k, 0, 'square', 1500, 280, .09, .045); this.tone(k, 0, 'sine', 900, 300, .1, .07);
        this.hiss(k, 0, 'highpass', 4500, 2500, .035, .1); this.tone(k, 0, 'sine', 170, 60, .07, .12); break;
      // Hits (the last attack sound chose the weapon): light, heavy (a knock or launch) and critical.
      case 'hit': this.weaponHit(k, struck, 0); break;
      case 'hitHeavy': this.weaponHit(k, struck, 1); break;
      case 'crit': this.weaponHit(k, struck, 1.2); this.bell(k, .02, 2350, .3, .05, 3.5, 2.5);
        this.tone(k, .02, 'sine', 1200, 2400, .16, .05); this.hiss(k, .02, 'highpass', 7000, 4000, .18, .04); break;
      // Defeat: a puff of air, a falling "boop" and a little twinkle.
      case 'poof': this.hiss(k, 0, 'lowpass', 2600, 160, .36, .22, 1, .01); this.tone(k, 0, 'sine', 660, 170, .24, .08);
        this.bell(k, .1, 1568, .2, .035); this.bell(k, .16, 2093, .22, .03); break;
      // Hurt: a squeaky "oof" (two formant-ish sines) on a thump.
      case 'hurt': this.tone(k, 0, 'triangle', 520, 300, .14, .09); this.tone(k, 0, 'sine', 980, 620, .12, .04);
        this.tone(k, 0, 'sine', 150, 60, .12, .2); this.hiss(k, 0, 'lowpass', 1100, 200, .1, .1); break;
      // Garden: a rising bubble pop; harvest = pop + leafy rustle + bright two-note pluck; plant = two soft dirt pats.
      case 'pop': this.tone(k, 0, 'sine', 380, 1100, .08, .1); break;
      case 'harvest': this.tone(k, 0, 'sine', 360, 1150, .07, .1); this.hiss(k, 0, 'highpass', 4200, 3000, .1, .05);
        this.bell(k, .06, 784, .2, .06, 2, 1.2); this.bell(k, .13, 1175, .26, .055, 2, 1.2); break;
      case 'plant': this.hiss(k, 0, 'lowpass', 800, 180, .1, .2); this.hiss(k, .08, 'lowpass', 700, 160, .1, .16);
        this.tone(k, .03, 'sine', 300, 500, .14, .06); break;
      // Money: energy gain = two glassy coin bells; buy adds a till tick and a chord; sell spills coins.
      case 'coin': this.bell(k, 0, 1976, .12, .05); this.bell(k, .055, 2637, .26, .05); break;
      case 'buy': this.hiss(k, 0, 'bandpass', 3000, 2500, .025, .08, 4); this.hiss(k, .05, 'bandpass', 3200, 2600, .025, .08, 4);
        this.bell(k, .09, 1319, .35, .05); this.bell(k, .09, 1976, .4, .045); this.bell(k, .12, 2637, .3, .03); break;
      case 'sell': [1568, 1319, 1760, 2093].forEach((f, i) => this.bell(k, i * .055, f, .22, .045)); this.hiss(k, 0, 'highpass', 6000, 4000, .3, .03); break;
      // Progress: success arpeggio; quest = bell arpeggio + shimmer; level = a little brass fanfare and held chord.
      case 'success': [523, 659, 784].forEach((f, i) => { this.bell(k, i * .08, f * 2, .3, .035, 2, 1); this.tone(k, i * .08, 'triangle', f, f, .18, .06); }); break;
      case 'quest': [784, 988, 1175, 1568].forEach((f, i) => this.bell(k, i * .07, f, .4, .05, 3.5, 1.6));
        this.hiss(k, .05, 'highpass', 3000, 9000, .5, .03, 1, .2); this.tone(k, .28, 'triangle', 392, 392, .45, .06, .02); break;
      case 'level': [523, 659, 784].forEach((f, i) => { this.tone(k, i * .1, 'square', f, f, .12, .03); this.tone(k, i * .1, 'triangle', f, f, .16, .07); });
        [1046, 1318, 1568].forEach(f => { this.tone(k, .3, 'triangle', f, f, .75, .055, .02); this.tone(k, .3, 'square', f / 2, f / 2, .5, .015, .02); });
        this.bell(k, .3, 2093, .6, .03); this.hiss(k, .3, 'highpass', 5000, 9000, .6, .025, 1, .1); break;
      // Fishing: a bite is a quick double plop; the catch a big splash, droplets and a tiny ta-da.
      case 'bite': this.tone(k, 0, 'sine', 950, 260, .06, .12); this.tone(k, .07, 'sine', 800, 240, .06, .09); this.hiss(k, 0, 'lowpass', 1800, 400, .08, .06); break;
      case 'catch': this.hiss(k, 0, 'lowpass', 3200, 280, .5, .26, 1, .01); this.tone(k, 0, 'sine', 300, 140, .14, .08);
        this.drops(k, .08, 5, .3, .04); this.bell(k, .25, 1319, .3, .04); this.bell(k, .32, 1760, .4, .04); break;
      case 'splash': this.hiss(k, 0, 'lowpass', 1800, 250, .3, .22); this.tone(k, 0, 'sine', 340, 160, .12, .05); this.drops(k, .05, 2, .15, .03); break;
      case 'cast': this.hiss(k, 0, 'bandpass', 900, 3000, .18, .06, 2); break;
      case 'reel': this.hiss(k, 0, 'highpass', 3000, 3000, .03, .05); break;
      case 'snap': this.tone(k, 0, 'sawtooth', 700, 90, .18, .06); this.hiss(k, 0, 'highpass', 2500, 1200, .12, .1); break;
      // Swimming: a soft water swish per stroke, a splash with droplets on the way in.
      case 'stroke': this.hiss(k, 0, 'bandpass', 450, 1300, .26, .07, 1.4, .08); this.tone(k, .05, 'sine', 210, 280, .12, .025, .03); break;
      case 'dive': this.hiss(k, 0, 'lowpass', 2600, 240, .4, .22, 1, .008); this.tone(k, 0, 'sine', 260, 120, .16, .08); this.drops(k, .1, 4, .3, .035); break;
      // Jumping (jump-rules.ts): a springy hop, a brighter flip, a thud with a dust puff on landing.
      case 'jump': this.tone(k, 0, 'sine', 280, 680, .11, .08); this.tone(k, 0, 'triangle', 560, 1100, .06, .02); this.hiss(k, 0, 'bandpass', 900, 1700, .07, .05, 1.2); break;
      case 'flip': this.tone(k, 0, 'triangle', 520, 1040, .1, .06); this.hiss(k, 0, 'bandpass', 1800, 2800, .08, .05, 1.4); this.bell(k, .03, 1568, .12, .02); break;
      case 'land': this.tone(k, 0, 'sine', 170, 62, .11, .14, .002); this.hiss(k, 0, 'lowpass', 1000, 180, .12, .08); break;
      // Skill voices (skill-sounds.ts) and the power strike: a rising charge whoosh, a sub boom and an electric crack.
      case 'ready': this.bell(k, 0, 1320, .12, .035, 3.5, 1.4); this.tone(k, 0, 'sine', 880, 1320, .09, .025); break;
      case 'power': this.hiss(k, 0, 'bandpass', 300, 4200, .12, .1, 2, .1); this.tone(k, .1, 'sine', 150, 34, .45, .34, .004);
        this.hiss(k, .1, 'lowpass', 1600, 110, .4, .26); this.tone(k, .1, 'sawtooth', 1500, 260, .16, .045); this.hiss(k, .1, 'highpass', 4500, 2200, .16, .09);
        this.bell(k, .12, 2093, .4, .03); break;
      case 'boom': this.tone(k, 0, 'sine', 140, 40, .32, .3); this.hiss(k, 0, 'lowpass', 1200, 120, .3, .24); break;
      case 'zap': this.tone(k, 0, 'sawtooth', 1400, 300, .16, .05); this.hiss(k, 0, 'highpass', 4000, 2000, .14, .1); break;
      case 'shock': this.tone(k, 0, 'square', 1900, 240, .12, .035); this.hiss(k, 0, 'highpass', 5200, 2600, .16, .09); this.tone(k, .015, 'sine', 120, 45, .2, .2); break;
      case 'freeze': [1568, 2093, 2637].forEach((f, i) => this.bell(k, i * .04, f, .25, .03, 3.5, 1.5)); this.hiss(k, 0, 'highpass', 5000, 3000, .2, .05); break;
      case 'magic': [784, 1175, 1568].forEach((f, i) => this.bell(k, i * .05, f, .24, .04, 3.5, 1.8)); this.hiss(k, 0, 'highpass', 5000, 8000, .3, .02, 1, .1); break;
    }
  }
}

/** Every Sound name (tests check each has a recipe). */
export const ALL_SOUNDS: readonly Sound[] = ['alert', 'click', 'open', 'close', 'punch', 'swing', 'hit', 'hitHeavy', 'crit', 'hurt', 'pop', 'plant',
  'splash', 'cast', 'reel', 'snap', 'bite', 'catch', 'stroke', 'dive', 'jump', 'flip', 'land', 'success', 'quest', 'level', 'harvest', 'shoot',
  'poof', 'coin', 'buy', 'sell', 'ready', 'power', 'boom', 'zap', 'freeze', 'magic', 'shock'];
