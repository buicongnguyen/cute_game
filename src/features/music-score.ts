/**
 * The live score (AAA-PLAN WP13): the marimba, pad and bass of the game's theme (promo/music.py), played by WebAudio
 * from a tune of music-content.ts. Nothing is downloaded and nothing is recorded: every note is an oscillator.
 *
 * - `Score` writes the notes, one eighth note at a time: bass, a pad chord per bar, a marimba figure over the chord and
 *   a melody that walks a five-note scale in two-bar motifs. It draws from its own seeded generator: the same tune and
 *   seed give the same notes. Every 8 bars it takes another progression of the tune (never the same more than twice
 *   running) and another arrangement (all of it, without the melody, or without the figure).
 * - `Player` plays them into one gain node. It plans a step when the step is at most AHEAD seconds away, on the audio
 *   clock, so nothing is ever planned further ahead than that; after a stall (a slow frame, a sleeping tab) it starts
 *   afresh from now and never catches up, so no burst of late notes. Nothing runs between two steps.
 * - Voices: the score counts its own (SCORE_VOICES on a desktop, TOUCH_SCORE on a touch device, where it also leaves
 *   out the pad and each marimba note's upper partial). It never takes from the effects' counter (sfx.ts Voices), so
 *   music cannot make an effect or a priority cue fail; on a touch device it also steps back while effects sound:
 *   a note is left out when the score's voices and the effects' together would pass TOUCH_SCORE.
 *
 * This file imports sfx.ts for types only.
 */
import type { Voices } from '../sfx.ts';
import { MUSIC, type Tune } from './music-content.ts';

/** A step is planned when it is at most this many seconds away. */
export const AHEAD = .2;
/** The score's voices at once: on a desktop, and on a touch device. */
export const SCORE_VOICES = 14, TOUCH_SCORE = 6;
/** The score's level into the music bus (promo/music-clips.mjs measures it against the theme). */
export const LEVEL = 1.1;
/** The theme's three echoes (promo/music.py): seconds and level. */
export const ECHO = [[.23, .28], [.41, .18], [.67, .1]] as const;
export const MAR = 0, BASS = 1, PAD = 2, DRUM = 3, HAT = 4;
export interface Note { kind: number; f: number; len: number; amp: number }
/** Counters for the browser probe: notes played, audio nodes made for them, notes left out for want of a voice. */
export const stats = { notes: 0, nodes: 0, skipped: 0 };

const MAJOR = [0, 2, 4, 5, 7, 9, 11], FIVE = [[0, 1, 2, 4, 5], [0, 2, 3, 4, 6]], MINOR = [0, 1, 1, 0, 0, 1], WALK = [-2, -1, -1, 0, 1, 1, 2], LEAD_AT = [0, -1, -1, 1, 2, -1, -1, 3];
const hz = (midi: number) => 440 * 2 ** ((midi - 69) / 12);

export class Score {
  /** The notes of the step just written (the first `n` of them), reused for every step. */
  readonly notes: Note[] = Array.from({ length: 16 }, () => ({ kind: 0, f: 0, len: 0, amp: 0 }));
  n = 0;
  /** Eighth notes written so far; the progression in play (its index in the tune) and how often it has run in a row. */
  step = 0; id = -1; run = 0;
  /** Seconds per beat. */
  readonly beat: number;
  readonly tune: Tune; readonly lite: boolean;
  private seed: number; private scale: number[]; private order: number[] = []; private left = 0;
  private arr = 0; private motif = [5, 5, 5, 5];
  constructor(tune: Tune, seed = 1, lite = false) {
    this.tune = tune; this.lite = lite; this.seed = seed >>> 0; this.beat = 60 / (tune.bpm ?? 100);
    const m = tune.mode ?? 0; this.scale = MAJOR.map((_, i) => (MAJOR[(i + m) % 7] - MAJOR[m] + 12) % 12);
    for (let i = 0; i < (tune.progs?.length ?? 0); i++) this.order.push(i);
  }
  /** mulberry32. */
  private random() { let t = this.seed = this.seed + 0x6D2B79F5 | 0; t = Math.imul(t ^ t >>> 15, 1 | t); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }
  /** The MIDI note of a scale degree (0 = the key; below 0 and above 6 are the octaves around it). */
  private midi(degree: number) { return this.tune.key! + 12 * Math.floor(degree / 7) + this.scale[(degree % 7 + 7) % 7]; }
  private add(kind: number, f: number, len: number, amp: number) { const note = this.notes[this.n]; if (!note) return; note.kind = kind; note.f = f; note.len = len; note.amp = amp; this.n++; }
  /** The next 8 bars: another progression (the same one at most twice running) and an arrangement. */
  private phrase() {
    const order = this.order;
    if (this.id >= 0 && this.run < 2 && this.random() < .3) this.run++;
    else {
      if (!this.left) { // every progression once, in a new order, before any comes again
        for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(this.random() * (i + 1)), t = order[i]; order[i] = order[j]; order[j] = t; }
        this.left = order.length; if (order.length > 1 && order[this.left - 1] === this.id) { order[this.left - 1] = order[0]; order[0] = this.id; }
      }
      this.id = order[--this.left]; this.run = 1;
    }
    // All of it, without the melody, or without the figure. Never twice running without the melody: that would be the same 8 bars again.
    const r = this.random(), arr = this.step ? r < .55 ? 0 : r < .8 ? 1 : 2 : 0; this.arr = arr === 1 && this.arr === 1 ? 0 : arr;
  }
  /** Writes the next eighth note into `notes` and returns how many there are. `drums`: the chase beat joins (music-content.ts danger). */
  next(drums = false) {
    const t = this.tune, s = this.step, i = s & 7, bar = s >> 3, b = this.beat, lite = this.lite;
    this.n = 0; if (!t.progs?.length) return 0;
    if (s % 64 === 0) this.phrase();
    this.step++;
    // The drums come first: when voices are short, the beat and the bass stay.
    const beat = t.beat ?? (drums ? MUSIC.danger.beat : undefined);
    if (beat) {
      const [kick, shake, tom] = beat;
      if (kick[s % kick.length] === 'x') this.add(DRUM, 150, .2, .27);
      if (tom[s % tom.length] === 'x') this.add(DRUM, 230, .15, .2);
      if (shake[s % shake.length] === 'x') this.add(HAT, 0, .06, i & 1 ? .11 : .07);
    }
    let d = +t.progs[this.id][bar & 7] - 1; if (d > 3) d -= 7; // the chord's root, folded around the key
    const root = this.midi(d), style = t.bass ?? 0;
    if (style === 2) this.add(BASS, hz(root + (i === 7 ? 12 : 0)), b * .5, .2);
    else if (!(i & (style ? 3 : 1))) this.add(BASS, hz(i & 2 && !style ? this.midi(d + 4) : root), b * (style ? 2 : 1.6), .26);
    // The melody: a motif of four notes for two bars; the second bar plays it again and the phrase ends on the key.
    const j = LEAD_AT[i];
    if (j >= 0) {
      if (!j && !(bar & 1)) { let p = this.motif[3]; for (let k = 0; k < 4; k++) this.motif[k] = p = Math.max(3, Math.min(8, p + WALK[Math.floor(this.random() * 7)])); }
      const sounds = this.random() < (t.lead ?? .8), vol = .85 + .3 * this.random();
      if (sounds && this.arr !== 1 && s >= 16) { // the first two bars of a play are the band alone
        const p = j === 3 && (bar & 7) === 7 ? 5 : this.motif[j], five = FIVE[MINOR[t.mode ?? 0]];
        this.add(MAR, hz(this.midi(five[p % 5] + 7 * Math.floor(p / 5)) + 12), b * (lite ? 1 : 1.4), .17 * vol);
      }
    }
    const fig = t.arp ? t.arp[s % t.arp.length] : '.';
    // The figure sits two octaves over the bass, one in the higher keys (a sine over 1.5 kHz is shrill).
    if (fig !== '.' && this.arr !== 2) this.add(MAR, hz((fig === '3' ? root + 12 : this.midi(d + 2 * +fig)) + (t.key! > 50 ? 12 : 24)), b * (lite ? .75 : 1), .1);
    if (!i && !lite) for (let k = 0; k < 3; k++) this.add(PAD, hz(this.midi(d + 2 * k) + 12), 4 * b + .6, .05);
    return this.n;
  }
}

/** A gain in front of `to` that also feeds the theme's three echoes: the score's players connect to it. */
export function scoreBus(ctx: BaseAudioContext, to: AudioNode) {
  const bus = ctx.createGain(); bus.connect(to);
  if (typeof ctx.createDelay === 'function') for (const [seconds, level] of ECHO) { const delay = ctx.createDelay(1), wet = ctx.createGain(); delay.delayTime.value = seconds; wet.gain.value = level; bus.connect(delay); delay.connect(wet); wet.connect(to); }
  return bus;
}

// What every player of a context shares: the shaker's noise and the pad's wave.
let shared: { ctx: BaseAudioContext; noise: AudioBuffer; wave: PeriodicWave | null } | undefined;
function kit(ctx: BaseAudioContext) {
  if (shared?.ctx === ctx) return shared;
  const noise = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * .2), ctx.sampleRate), data = noise.getChannelData(0); let seed = 11;
  for (let i = 0; i < data.length; i++) { seed = (seed * 16807) % 2147483647; data[i] = seed / 1073741823.5 - 1; }
  return shared = { ctx, noise, wave: typeof ctx.createPeriodicWave === 'function' ? ctx.createPeriodicWave(new Float32Array(3), new Float32Array([0, 1, .3])) : null };
}

export class Player {
  /** Everything this player sounds goes through `out` (the director fades it); the drums through `drums` first. */
  readonly out: GainNode; readonly drums: GainNode; readonly score: Score;
  /** When the next step sounds, on the audio clock (below 0: not started). */
  at = -1;
  private ctx: BaseAudioContext; private hats: AudioNode; private ends: Float64Array; private level: number;
  /** `ends` is the score's voice counter (when each voice ends), shared by the players of one director. */
  constructor(ctx: BaseAudioContext, to: AudioNode, tune: Tune, seed: number, lite: boolean, ends: Float64Array) {
    this.ctx = ctx; this.ends = ends; this.score = new Score(tune, seed, lite); this.level = LEVEL * (tune.gain ?? 1);
    this.out = ctx.createGain(); this.out.gain.value = 0; this.out.connect(to);
    this.drums = ctx.createGain(); this.drums.gain.value = tune.beat ? 1 : 0; this.drums.connect(this.out);
    const high = ctx.createBiquadFilter(); high.type = 'highpass'; high.frequency.value = 6500; high.connect(this.drums); this.hats = high;
  }
  /**
   * Plans every step that sounds within AHEAD of `now`: about four times a second there is one, otherwise this is a
   * comparison. `effects` (a touch device): the effects' voice counter, whose live voices the score makes room for.
   */
  pass(now: number, drums = false, effects?: Voices) {
    if (this.at < now + .01) this.at = now + .06; // the first step, or back after a stall: from now, with nothing to catch up
    const score = this.score, eighth = score.beat / 2, swing = score.tune.swing ?? 0;
    for (let guard = 0; this.at <= now + AHEAD && guard < 4; guard++) {
      const at = this.at, odd = score.step & 1, n = score.next(drums), room = this.ends.length - (effects ? effects.live(now) : 0);
      for (let i = 0; i < n; i++) { const note = score.notes[i]; if (this.take(at, at + note.len, room)) this.play(note, at); else stats.skipped++; }
      this.at = at + eighth * (odd ? 1 - swing : 1 + swing);
    }
  }
  /** One voice of the score from `at` to `end`; false when `room` voices already sound then. */
  private take(at: number, end: number, room: number) {
    const ends = this.ends; let live = 0, free = -1;
    for (let i = 0; i < ends.length; i++) if (ends[i] > at) live++; else free = i;
    if (live >= room || free < 0) return false;
    ends[free] = end; return true;
  }
  private play(note: Note, at: number) {
    const ctx = this.ctx, env = ctx.createGain(), g = env.gain, amp = note.amp * this.level, end = at + note.len, kind = note.kind;
    // The envelope is 0 until its source starts (sfx.ts: a new gain is 1, which would let one sample through).
    g.value = 0; g.setValueAtTime(amp, at); stats.notes++; stats.nodes += 2;
    if (kind === HAT) {
      const src = ctx.createBufferSource(); src.buffer = kit(ctx).noise;
      g.exponentialRampToValueAtTime(.0008, end); src.connect(env); env.connect(this.hats); src.start(at); src.stop(end + .02); return;
    }
    const osc = ctx.createOscillator(); osc.frequency.value = note.f;
    if (kind === PAD) { // soft, slow in and slow out
      const wave = kit(ctx).wave; if (wave) osc.setPeriodicWave(wave);
      g.setValueAtTime(0, at); g.linearRampToValueAtTime(amp, at + .5); g.setValueAtTime(amp, end - .8); g.linearRampToValueAtTime(0, end);
    } else if (kind === DRUM) { osc.frequency.setValueAtTime(note.f, at); osc.frequency.exponentialRampToValueAtTime(note.f * .35, end); g.exponentialRampToValueAtTime(.0008, end); }
    else { // marimba and bass: struck, then dying away; the last 50 ms close the note without a click
      g.setTargetAtTime(0, at, kind === BASS ? 1 / 3.2 : 1 / 5.5); g.setTargetAtTime(0, end - .05, .012);
      if (kind === MAR && !this.score.lite) { // the mallet: the fourth partial, gone in a tenth of a second
        const top = ctx.createOscillator(), click = ctx.createGain(); top.frequency.value = note.f * 4; click.gain.value = 0; click.gain.setValueAtTime(.35, at); click.gain.setTargetAtTime(0, at, .04);
        top.connect(click); click.connect(env); top.start(at); top.stop(end + .03); stats.nodes += 2;
      }
    }
    osc.connect(env); env.connect(kind === DRUM ? this.drums : this.out); osc.start(at); osc.stop(end + .03);
  }
}
