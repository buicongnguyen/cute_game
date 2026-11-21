/**
 * Synthesized sound effects (FIX-PLAN 5.1). Everything is built with WebAudio from layered oscillators, FM bells,
 * filtered noise and envelopes, so nothing is downloaded: bytes before play are unchanged and the game stays
 * playable offline. The AudioContext is made on the first touch/key (phones need that to unlock audio) or on the
 * first sound, never before. Each play draws a little random pitch and volume so repeats are not robotic; a
 * per-sound rate limit and a global voice cap keep big fights from clipping; a compressor glues the mix.
 * Nothing runs per frame: cost exists only while a sound plays. Docs: docs/SOUNDS.md.
 *
 * One AudioContext for the whole game (AAA-PLAN WP7): audioGraph() owns it, with four buses (sfx, ui, ambience, music)
 * into the compressor. Everything that sounds connects to a bus: these effects, the cottage radio (house-life.ts),
 * and later the ambience, the stingers and the score. Never call `new AudioContext()` anywhere else.
 */
export type Sound = 'alert' | 'click' | 'open' | 'close' | 'punch' | 'swing' | 'hit' | 'hitHeavy' | 'crit' | 'hurt' | 'pop' | 'plant'
  | 'splash' | 'cast' | 'reel' | 'snap' | 'bite' | 'catch' | 'stroke' | 'dive'
  | 'jump' | 'flip' | 'land'
  | 'success' | 'quest' | 'level' | 'harvest' | 'shoot' | 'poof' | 'coin' | 'buy' | 'sell' | 'ready' | 'power'
  | 'boom' | 'zap' | 'freeze' | 'magic' | 'shock' | 'flag' | 'thud' | 'break' | Stinger | 'powerReady' | 'roar' | 'petHit';
/**
 * The stingers (AAA-PLAN WP8): short musical cues for a reward, a discovery, a win, new gear, a refusal and a start. Their
 * recipes come with the features (features-audio/stingers.ts, after the first played frame) through `AudioGraph.cue`; until
 * then a stinger plays the 'success' chime. 'levelUp' is the level fanfare ('level'), which only a level-up plays.
 * The arrival flag's horn call ('flag') and the power strike's own ready chime ('powerReady') are made there too.
 */
export type Stinger = 'levelUp' | 'rewardSmall' | 'rewardMedium' | 'rewardLarge' | 'discover' | 'victory' | 'equip' | 'deny' | 'go';
export const STINGERS: readonly Stinger[] = ['levelUp', 'rewardSmall', 'rewardMedium', 'rewardLarge', 'discover', 'victory', 'equip', 'deny', 'go'];
/**
 * Every sound whose recipe is not in this file: the stingers, 'powerReady', the Colossus's 'roar' and 'petHit', the bite a
 * pet's or a helper's blow lands with instead of the explorer's hit ('flag' is listed in ALL_SOUNDS).
 */
export const LATE_SOUNDS: readonly Sound[] = [...STINGERS, 'powerReady', 'roar', 'petHit'];

/**
 * The mix (AAA-PLAN WP8): where each kind of sound peaks, in dBFS at the speakers with the sliders at their defaults
 * (promo/loudness.mjs measures them; promo/loudness.json keeps the result and tests/sound-mix.test.ts holds the recipes
 * to it). A new sound joins one of these lists and is tuned into its band. The order is the plan's; the numbers are read
 * with the compressor settled, as in play: the plan's own (-14 to -18 for impacts, -26 to -30 for taps) were read on the
 * first sound of a new context, which reads a short sound 5 to 12 dB too low (docs/SOUNDS.md, "The mix").
 * - impact: a blow that lands: the loudest sounds in the game.
 * - whoosh: the swing before a blow, 6 to 10 dB under the hit it leads to (`of`), and never under `floor`.
 * - ui: taps and panels, clearly under everything in play.
 * - cue: what the player must not miss (a creature noticed you, POWER READY, a bite) and every stinger: -24 or louder.
 *   'ready' is the small chime of a skill off its cooldown, heard every few seconds: about -20. 'powerReady' is the big one.
 */
export const LOUDNESS = {
  impact: { peak: [-12, -6], sounds: ['hit', 'hitHeavy', 'crit', 'thud', 'break', 'boom', 'power'] },
  whoosh: { under: [6, 10], floor: -26, of: { swing: 'hit', punch: 'hit' }, sounds: ['swing', 'punch', 'cast'] },
  ui: { peak: [-26, -21], sounds: ['click', 'open', 'close'] },
  cue: { peak: [-24, -10], sounds: ['alert', 'ready', 'bite', 'hurt', 'catch', 'flag', 'success', 'quest', 'level', ...LATE_SOUNDS] },
} as const satisfies Record<string, { peak?: readonly number[]; under?: readonly number[]; floor?: number; of?: Partial<Record<Sound, Sound>>; sounds: readonly Sound[] }>;

/** Every game event the sound pass covers, and the voice it plays (tests check each one has a recipe). */
export const SOUND_EVENTS = {
  hitBlade: 'hit', hitFist: 'hit', hitGun: 'hit', hitHeavy: 'hitHeavy', critical: 'crit', enemyDefeat: 'poof', playerHurt: 'hurt',
  harvest: 'harvest', plant: 'plant', energyGain: 'coin', buy: 'buy', sell: 'sell', levelUp: 'level',
  fishBite: 'bite', fishCatch: 'catch', uiTap: 'click', uiOpen: 'open', uiClose: 'close', questComplete: 'quest',
  powerStrike: 'power', jump: 'jump', land: 'land', swimStroke: 'stroke', swimSplash: 'dive',
  swingBlade: 'swing', swingFist: 'punch', gunShot: 'shoot', flagPlanted: 'flag', bossHit: 'thud', bossBreak: 'break',
} as const satisfies Record<string, Sound>;

export type WeaponKind = 'blade' | 'fist' | 'gun';
/** Attack sounds tell the next hit what struck: a blade rings, a fist smacks, a shot ticks. */
const WEAPON_OF: Partial<Record<Sound, WeaponKind>> = { swing: 'blade', punch: 'fist', shoot: 'gun', zap: 'gun' };
const WEAPON_MEMORY = 1.2; // seconds an attack sound colours the hits after it

/** Per-sound limits inside a 100 ms window; everything else allows 2. */
export const RATE: Partial<Record<Sound, number>> = { hit: 3, hitHeavy: 2, coin: 4, crit: 2, poof: 2, reel: 1, stroke: 1, ready: 1, thud: 1, break: 1 };
export const RATE_WINDOW = .1;
export const MAX_VOICES = 14;
/** These still play over a full cap (a fanfare should not vanish in a brawl), up to MAX_VOICES + 4. */
const PRIORITY = new Set<Sound>(['level', 'quest', 'hurt', 'catch', 'power', 'roar']);
/** Musical cues stay in tune: less pitch spread. */
const TUNED = new Set<Sound>(['level', 'quest', 'success', 'coin', 'buy', 'sell', 'harvest', 'magic', 'freeze', 'ready', 'open', 'close']);

/** Live synthesized voices on a touch device, shared by everything that plays through the graph; priority cues get 2 more. */
export const TOUCH_VOICES = 8;
/**
 * The shared count of live synthesized voices (one per played sound or note). `budget` is the most at once; the last
 * `reserve` of them are kept for priority cues (a fanfare in a brawl).
 */
export class Voices {
  private ends: number[] = [];
  budget: number; reserve: number;
  /** Voices refused since the page opened, for the browser probe (audioGraph().stats.capped). */
  capped = 0;
  /** The defaults are a desktop's: the old cap of 14 for ordinary sounds, 4 more for priority cues. */
  constructor(budget = MAX_VOICES + 4, reserve = 4) { this.budget = budget; this.reserve = reserve; }
  live(now: number) { this.ends = this.ends.filter(e => e > now); return this.ends.length; }
  /** Counts one voice from `now` until `end`; false (and nothing counted) when it is full. Only a `priority` voice may use the reserve. */
  take(now: number, end: number, priority = false) { if (this.live(now) >= this.budget - (priority ? 0 : this.reserve)) { this.capped++; return false; } this.ends.push(end); return true; }
}

/** Rate limit + voice cap, pure so tests can drive it with a fake clock. */
export class SoundGate {
  private recent = new Map<Sound, number[]>();
  private pool: Voices;
  constructor(pool = new Voices()) { this.pool = pool; }
  voices(now: number) { return this.pool.live(now); }
  /** True when `sound` may start at `now`; it then counts as a voice until `end`. */
  admit(sound: Sound, now: number, end: number) {
    const times = (this.recent.get(sound) ?? []).filter(t => now - t < RATE_WINDOW);
    if (times.length >= (RATE[sound] ?? 2) || (times.length && now - times[times.length - 1] < .018)) { this.recent.set(sound, times); return 'limited' as const; }
    // A tap on a button always sounds: the ui sounds are short and rate-limited, and take no voice from a fight.
    if (!UI.has(sound) && !this.pool.take(now, end, PRIORITY.has(sound))) return 'capped' as const;
    times.push(now); this.recent.set(sound, times); return 'ok' as const;
  }
}

/** Rough voice lengths (seconds) so the cap knows when a voice is done. */
const LENGTH: Partial<Record<Sound, number>> = { break: .6, thud: .25, level: 1.1, quest: .9, catch: .8, power: .7, success: .55, buy: .5, sell: .55, poof: .45, harvest: .4, dive: .5, boom: .4, magic: .45, freeze: .4 };

type Ctx = AudioContext;
/** One play: where it goes, when it starts, and this play's pitch (`p`) and volume (`g`) factors. */
export interface Kit { ctx: Ctx; to: AudioNode; at: number; p: number; g: number }

export type Bus = 'sfx' | 'ui' | 'ambience' | 'music';
/** These play on the ui bus. */
const UI = new Set<Sound>(['click', 'open', 'close']);

/**
 * The game's one AudioContext and its mix: bus -> duck -> compressor -> speakers, for each of the four buses.
 * The music bus follows the Settings music slider (`music`); sfx, ui and ambience follow the effects slider (`sfx`).
 * After Start, features-audio/sound-mix.ts lets the context sleep while both sliders are at 0 or the tab is hidden.
 */
export class AudioGraph {
  readonly voices = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches ? new Voices(TOUCH_VOICES + 2, 2) : new Voices();
  /** The effects slider, 0-1 (Sfx.volume). */
  sfx = .8;
  /** The music slider, 0-1: whoever plays music sets it from audio-settings.ts audioLevels.music before asking for the bus. */
  music = .45;
  /** The tab is hidden (features-audio/sound-mix.ts keeps it). */
  hidden = false;
  /** The context once it is made; `ctx` makes it. */
  made: Ctx | null = null;
  private mix: AudioNode | null = null;
  /** Each bus made so far, with the duck gain behind it. */
  readonly nodes: Partial<Record<Bus, { bus: GainNode; duck: GainNode; level?: number }>> = {};
  /**
   * Lowers a bus by `dB` for `seconds` so a cue or a spoken line stands out. Ducks do not stack: while one holds, another
   * only makes it last longer. features-audio/sound-mix.ts supplies it once the features are mounted (after the first played
   * frame); before that a call does nothing.
   */
  duck: (name: Bus, dB?: number, seconds?: number) => void = () => {};
  /**
   * The sounds whose recipes load after Start (features-audio/stingers.ts): asked first for every play that may sound. It answers
   * true or false when the sound was its own (played, or refused), and nothing when the recipes here should play it.
   */
  cue?: (sfx: Sfx, sound: Sound, ctx: Ctx) => boolean | void;
  private make: () => Ctx;
  constructor(make?: () => Ctx) { this.make = make ?? (() => new AudioContext()); }

  /** The context, made on first use; null where WebAudio is missing. */
  get ctx(): Ctx | null {
    if (!this.made) try {
      const ctx = this.made = this.make(); this.mix = ctx.destination;
      if (typeof ctx.createDynamicsCompressor === 'function') { // glues a busy mix and stops clipping
        const comp = ctx.createDynamicsCompressor();
        comp.threshold.value = -14; comp.knee.value = 10; comp.ratio.value = 6; comp.attack.value = .003; comp.release.value = .18;
        comp.connect(ctx.destination); this.mix = comp;
      }
    } catch { return null; }
    return this.made;
  }
  /** Both sliders at 0: nothing can be heard. */
  get silent() { return !(this.sfx > 0) && !(this.music > 0); }
  /** True while the context should sleep: asking for a bus then does not wake it, and effects are skipped. */
  get rest() { return this.hidden || this.silent; }
  /** Counters for the browser probe: voices refused by the shared counter. */
  readonly stats = this.voices;
  /** Moves a bus gain to a new level without a step (a step in a playing gain clicks); features-audio/sound-mix.ts supplies it. */
  glide?: (gain: AudioParam, level: number, now: number) => void;
  /** Set once the creatures have their own voices (creature-voices.ts): the game then leaves the alert beep to them. */
  creatures?: unknown;
  /** A panner in front of `to` (-1 left to 1 right) for one sound; features-audio/sound-mix.ts supplies it, and until then sounds play in the middle. */
  pan?: (to: AudioNode, pan: number) => AudioNode;

  /** A bus to connect to, at its slider's level right now (call it again after a slider moves); null without WebAudio. */
  bus(name: Bus): GainNode | null {
    const ctx = this.ctx; if (!ctx) return null;
    let n = this.nodes[name];
    if (!n) { n = this.nodes[name] = { bus: ctx.createGain(), duck: ctx.createGain() }; n.bus.connect(n.duck); n.duck.connect(this.mix!); }
    const level = name === 'music' ? this.music : .55 * this.sfx / .8, g = n.bus.gain, now = ctx.currentTime;
    // The first level is set outright; a slider that moves later glides there.
    if (n.level !== level) { if (n.level === undefined || !this.glide) g.value = level; else this.glide(g, level, now); n.level = level; }
    // Not only 'suspended': an iPhone reports 'interrupted' after a call or the lock screen.
    if (!this.rest && ctx.state !== 'running') void ctx.resume()?.catch?.(() => {});
    return n.bus;
  }

  /** Phones start audio only inside a gesture: the first touch or key builds the context and plays one silent sample. */
  listen() {
    const events = ['pointerdown', 'touchend', 'keydown'];
    const unlock = () => {
      for (const e of events) window.removeEventListener(e, unlock, { capture: true });
      try { if (!this.silent && this.bus('sfx')) { const ctx = this.made!, s = ctx.createBufferSource(); s.buffer = ctx.createBuffer(1, 1, ctx.sampleRate); s.connect(ctx.destination); s.start(); } } catch { /* fine */ }
    };
    for (const e of events) window.addEventListener(e, unlock, { capture: true, passive: true });
  }
}
let shared: AudioGraph | undefined;
/** The game's audio graph: `ctx`, `bus(name)`, `duck(name, dB, seconds)` and the shared `voices` counter. */
export const audioGraph = () => shared ??= new AudioGraph();

export class Sfx {
  enabled = true;
  /** Effects volume from Settings (audio-settings.ts), 0-1; the default 0.8 plays at the original loudness. */
  get volume() { return this.graph.sfx; }
  set volume(v: number) { this.graph.sfx = v; }
  /** Counters for tests and the browser probe. */
  readonly stats = { started: 0, limited: 0, capped: 0, muted: 0, byKind: {} as Partial<Record<Sound, number>> };
  random: () => number = Math.random;
  private out: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private gate: SoundGate;
  private weapon: { kind: WeaponKind; at: number } = { kind: 'fist', at: -9 };
  /** The graph these effects play through: the game's shared one, or a private one for a test's own context. */
  readonly graph: AudioGraph;

  constructor(make?: () => Ctx) {
    this.graph = make ? new AudioGraph(make) : audioGraph();
    this.gate = new SoundGate(this.graph.voices);
    if (!make && typeof window !== 'undefined' && typeof window.addEventListener === 'function') { this.graph.listen(); (globalThis as { __zooSfx?: Sfx }).__zooSfx ??= this; }
  }

  private context() {
    if (!this.enabled || !(this.volume > 0)) return null;
    try {
      const ctx = this.graph.ctx; this.out = this.graph.bus('sfx');
      if (!ctx) return null;
      if (!this.noise) {
        this.noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
        const data = this.noise.getChannelData(0); let seed = 7;
        for (let i = 0; i < data.length; i++) { seed = (seed * 16807) % 2147483647; data[i] = seed / 1073741823.5 - 1; }
      }
      return ctx;
    } catch { return null; }
  }

  // ---- building blocks -------------------------------------------------------------------------------------
  // Each envelope holds its gain at 0 until its source starts: a new gain is 1, and a source that starts a fraction of a
  // sample before the envelope's first step would send one sample through at full level (a click, measured up to -8 dBFS).
  /** One oscillator with a quick attack and exponential decay, pitch gliding from -> to. */
  tone(k: Kit, dt: number, type: OscillatorType, from: number, to: number, length: number, volume: number, attack = .004) {
    const { ctx } = k, at = k.at + dt, osc = ctx.createOscillator(), gain = ctx.createGain();
    osc.type = type; osc.frequency.setValueAtTime(from * k.p, at); osc.frequency.exponentialRampToValueAtTime(Math.max(20, to * k.p), at + length);
    gain.gain.value = 0; gain.gain.setValueAtTime(.0001, at); gain.gain.linearRampToValueAtTime(volume * k.g, at + attack); gain.gain.exponentialRampToValueAtTime(.0008, at + length);
    osc.connect(gain); gain.connect(k.to); osc.start(at); osc.stop(at + length + .02);
  }
  /** Filtered noise: whooshes, smacks, splashes, dust. */
  hiss(k: Kit, dt: number, filter: BiquadFilterType, from: number, to: number, length: number, volume: number, q = 1, attack = .003) {
    const { ctx } = k, at = k.at + dt, src = ctx.createBufferSource(), band = ctx.createBiquadFilter(), gain = ctx.createGain();
    src.buffer = this.noise; band.type = filter; band.Q.value = q;
    band.frequency.setValueAtTime(from * k.p, at); band.frequency.exponentialRampToValueAtTime(Math.max(40, to * k.p), at + length);
    gain.gain.value = 0; gain.gain.setValueAtTime(.0001, at); gain.gain.linearRampToValueAtTime(volume * k.g, at + attack); gain.gain.exponentialRampToValueAtTime(.0008, at + length);
    src.connect(band); band.connect(gain); gain.connect(k.to); src.start(at, this.random() * .5); src.stop(at + length + .02);
  }
  /** A two-operator FM bell: coins, blade rings, sparkles. ratio 3.5 = glassy, 2.76 = metal, 1.4 = wood. */
  bell(k: Kit, dt: number, freq: number, length: number, volume: number, ratio = 3.5, index = 2.2) {
    const { ctx } = k, at = k.at + dt, f = freq * k.p, car = ctx.createOscillator(), mod = ctx.createOscillator(), depth = ctx.createGain(), gain = ctx.createGain();
    car.frequency.value = f; mod.frequency.value = f * ratio;
    depth.gain.setValueAtTime(f * index, at); depth.gain.exponentialRampToValueAtTime(f * .05, at + length);
    gain.gain.value = 0; gain.gain.setValueAtTime(.0001, at); gain.gain.linearRampToValueAtTime(volume * k.g, at + .003); gain.gain.exponentialRampToValueAtTime(.0008, at + length);
    mod.connect(depth); depth.connect(car.frequency); car.connect(gain); gain.connect(k.to);
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

  /**
   * Plays a sound; true when it started (false: muted, resting in a hidden tab, rate-limited or over the voice cap).
   * `detune` shifts the whole sound in cents (100 = a semitone up); `pan` places it from -1 (left) to 1 (right), once the
   * features are mounted (after the first played frame).
   */
  play(sound: Sound, opts?: { detune?: number; pan?: number }) {
    // A resting context has a stopped clock: sounds asked for meanwhile would all play at once when it wakes.
    if (!this.enabled || !(this.volume > 0) || this.graph.rest) { this.stats.muted++; return false; }
    const ctx = this.context(); if (!ctx) return false;
    const own = this.graph.cue?.(this, sound, ctx); if (own != null) return own;
    const now = ctx.currentTime, end = now + (LENGTH[sound] ?? .3);
    const verdict = this.gate.admit(sound, now, end);
    if (verdict !== 'ok') { this.stats[verdict]++; return false; }
    this.stats.started++; this.stats.byKind[sound] = (this.stats.byKind[sound] ?? 0) + 1;
    const spread = TUNED.has(sound) ? .015 : .08;
    let to: AudioNode = UI.has(sound) ? this.graph.bus('ui')! : this.out!;
    if (opts?.pan && this.graph.pan) to = this.graph.pan(to, opts.pan);
    const k: Kit = { ctx, to, at: now + .005, p: (1 + (this.random() - .5) * spread) * 2 ** ((opts?.detune ?? 0) / 1200), g: .88 + this.random() * .24 };
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
      case 'alert': this.tone(k, 0, 'square', 660, 990, .07, .09); this.tone(k, .07, 'square', 990, 1320, .08, .075); break;
      // Attacks: a blade whoosh, a shorter lower fist whoosh, a cute "pew" with a crack and a thump.
      case 'swing': this.hiss(k, 0, 'bandpass', 700, 3400, .15, .28, 2.4, .04); this.hiss(k, .03, 'highpass', 6000, 3000, .08, .07); break;
      case 'punch': this.hiss(k, 0, 'bandpass', 420, 1300, .1, .8, 1.8, .025); break;
      case 'shoot': this.tone(k, 0, 'square', 1500, 280, .09, .045); this.tone(k, 0, 'sine', 900, 300, .1, .07);
        this.hiss(k, 0, 'highpass', 4500, 2500, .035, .1); this.tone(k, 0, 'sine', 170, 60, .07, .12); break;
      // Hits (the last attack sound chose the weapon): light, heavy (a knock or launch) and critical.
      case 'petHit': /* a pet's bite, until its recipe has come (features-audio/stingers.ts) */ case 'hit': this.weaponHit(k, struck, 0); break;
      case 'hitHeavy': this.weaponHit(k, struck, 1); break;
      case 'crit': this.weaponHit(k, struck, 1.2); this.bell(k, .02, 2350, .3, .05, 3.5, 2.5);
        this.tone(k, .02, 'sine', 1200, 2400, .16, .05); this.hiss(k, .02, 'highpass', 7000, 4000, .18, .04); break;
      // Defeat: a puff of air, a falling "boop" and a little twinkle.
      case 'poof': this.hiss(k, 0, 'lowpass', 2600, 160, .36, .22, 1, .01); this.tone(k, 0, 'sine', 660, 170, .24, .08);
        this.bell(k, .1, 1568, .2, .035); this.bell(k, .16, 2093, .22, .03); break;
      // Hurt: a squeaky "oof" (two formant-ish sines) on a thump.
      case 'roar': /* the Colossus, until its recipe has come */ case 'hurt': this.tone(k, 0, 'triangle', 520, 300, .14, .09); this.tone(k, 0, 'sine', 980, 620, .12, .04);
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
      default: /* a stinger before its recipes have come */ case 'success': [523, 659, 784].forEach((f, i) => { this.bell(k, i * .08, f * 2, .3, .035, 2, 1); this.tone(k, i * .08, 'triangle', f, f, .18, .06); }); break;
      case 'quest': [784, 988, 1175, 1568].forEach((f, i) => this.bell(k, i * .07, f, .4, .05, 3.5, 1.6));
        this.hiss(k, .05, 'highpass', 3000, 9000, .5, .03, 1, .2); this.tone(k, .28, 'triangle', 392, 392, .45, .06, .02); break;
      case 'levelUp': case 'level': [523, 659, 784].forEach((f, i) => { this.tone(k, i * .1, 'square', f, f, .12, .03); this.tone(k, i * .1, 'triangle', f, f, .16, .07); });
        [1046, 1318, 1568].forEach(f => { this.tone(k, .3, 'triangle', f, f, .75, .055, .02); this.tone(k, .3, 'square', f / 2, f / 2, .5, .015, .02); });
        this.bell(k, .3, 2093, .6, .03); this.hiss(k, .3, 'highpass', 5000, 9000, .6, .025, 1, .1); break;
      // Fishing: a bite is a quick double plop; the catch a big splash, droplets and a tiny ta-da.
      case 'bite': this.tone(k, 0, 'sine', 950, 260, .06, .12); this.tone(k, .07, 'sine', 800, 240, .06, .09); this.hiss(k, 0, 'lowpass', 1800, 400, .08, .06); break;
      case 'catch': this.hiss(k, 0, 'lowpass', 3200, 280, .5, .26, 1, .01); this.tone(k, 0, 'sine', 300, 140, .14, .08);
        this.drops(k, .08, 5, .3, .04); this.bell(k, .25, 1319, .3, .04); this.bell(k, .32, 1760, .4, .04); break;
      case 'splash': this.hiss(k, 0, 'lowpass', 1800, 250, .3, .22); this.tone(k, 0, 'sine', 340, 160, .12, .05); this.drops(k, .05, 2, .15, .03); break;
      case 'cast': this.hiss(k, 0, 'bandpass', 900, 3000, .18, .34, 2); break;
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
      case 'ready': this.bell(k, 0, 1320, .12, .065, 3.5, 1.4); this.tone(k, 0, 'sine', 880, 1320, .09, .048); break;
      case 'power': this.hiss(k, 0, 'bandpass', 300, 4200, .12, .1, 2, .1); this.tone(k, .1, 'sine', 150, 34, .45, .34, .004);
        this.hiss(k, .1, 'lowpass', 1600, 110, .4, .26); this.tone(k, .1, 'sawtooth', 1500, 260, .16, .045); this.hiss(k, .1, 'highpass', 4500, 2200, .16, .09);
        this.bell(k, .12, 2093, .4, .03); break;
      case 'boom': this.tone(k, 0, 'sine', 140, 40, .32, .3); this.hiss(k, 0, 'lowpass', 1200, 120, .3, .24); break;
      case 'zap': this.tone(k, 0, 'sawtooth', 1400, 300, .16, .05); this.hiss(k, 0, 'highpass', 4000, 2000, .14, .1); break;
      case 'shock': this.tone(k, 0, 'square', 1900, 240, .12, .035); this.hiss(k, 0, 'highpass', 5200, 2600, .16, .09); this.tone(k, .015, 'sine', 120, 45, .2, .2); break;
      case 'freeze': [1568, 2093, 2637].forEach((f, i) => this.bell(k, i * .04, f, .25, .03, 3.5, 1.5)); this.hiss(k, 0, 'highpass', 5000, 3000, .2, .05); break;
      case 'magic': [784, 1175, 1568].forEach((f, i) => this.bell(k, i * .05, f, .24, .04, 3.5, 1.8)); this.hiss(k, 0, 'highpass', 5000, 8000, .3, .02, 1, .1); break;
      // The arrival flag (place-flags.ts) is made in features-audio/stingers.ts, with the stingers.
      // A boss's body takes the blow (played with the weapon's own hit): a deep, round thump, like striking a big drum.
      case 'thud': this.tone(k, 0, 'sine', 120, 42, .2, .3, .003); this.hiss(k, 0, 'lowpass', 700, 110, .14, .14); break;
      // The stagger break: a woody crack, a sub drop and a dizzy two-note wobble going down.
      case 'break': this.hiss(k, 0, 'bandpass', 2400, 900, .09, .22, 1.6, .002); this.tone(k, 0, 'sine', 160, 38, .38, .34, .003);
        this.hiss(k, .02, 'lowpass', 1600, 120, .3, .2); this.tone(k, .12, 'triangle', 880, 660, .14, .05); this.tone(k, .26, 'triangle', 740, 520, .2, .045); break;
    }
  }
}

/** Every Sound name but the stingers (tests check each has a recipe, here or for 'flag' in features-audio/stingers.ts). */
export const ALL_SOUNDS: readonly Sound[] = ['alert', 'click', 'open', 'close', 'punch', 'swing', 'hit', 'hitHeavy', 'crit', 'hurt', 'pop', 'plant',
  'splash', 'cast', 'reel', 'snap', 'bite', 'catch', 'stroke', 'dive', 'jump', 'flip', 'land', 'success', 'quest', 'level', 'harvest', 'shoot',
  'poof', 'coin', 'buy', 'sell', 'ready', 'power', 'boom', 'zap', 'freeze', 'magic', 'shock', 'flag', 'thud', 'break'];
