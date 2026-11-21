/**
 * Creature voices (AAA-PLAN WP12): every creature family has a voice of its own, synthesized like every effect (nothing
 * is recorded or downloaded). A blob squeaks, a bird chirps, a boar grunts; the bigger the creature, the lower it speaks.
 *
 *   notice   a creature saw the explorer (creatureAlert): its own "?!" in place of the shared alert beep
 *   windup   an attack is coming (telegraph): the voice rises over the wind-up and peaks as the blow lands
 *   hurt     a blow landed on it (hitLanded): a short yelp, at most once in HURT_GAP seconds per creature
 *   death    it fell (creatureDefeat): the voice falls away under the poof
 *
 * A voice is placed: panned by where the creature is on the screen (at most PAN_MAX to a side) and faded with its
 * distance from the explorer (full inside FULL metres, silent from HEAR metres on).
 *
 * Voices are decoration, the blows are not: every voice is an ordinary voice of the shared counter (AudioGraph.voices,
 * never a priority one), at most LIVE of them sound at once (2 on a touch device) and PER_SECOND start in a second (4), each kind has its own pause per
 * family and creature, and no two voices of a kind start within that kind's GAP. A dozen creatures cannot squeak a fight away.
 * A notice took the place of the alert beep, a cue: one notice may sound over the cap, so a group that notices the
 * explorer in the middle of a fight is still heard (once, not once per creature).
 * A boss's wind-up is the one voice that is not held back by those pauses, and the only one that may use a voice kept
 * for priority cues: it is the warning the player should hear, and it is louder than the others.
 * A notice is never fainter than half level (a creature notices from up to 20 m, and the beep it replaced had one level).
 * While a dialog is open no wind-up voice starts and the ones that sound are hushed.
 *
 * Levels: docs/SOUNDS.md, measured by promo/loudness.mjs (promo/loudness.json `voices`); tests/creature-voices.test.ts.
 * This file imports sfx.ts for types only.
 */
import type { AudioGraph } from '../sfx.ts';
import type { GameServices } from '../game-services.ts';
import type { Enemy } from '../world.ts';
import { audioLevels } from '../audio-settings.ts';
import { fillNoise } from '../features-rng.ts';

export type VoiceKind = 'notice' | 'windup' | 'hurt' | 'death';
export const VOICE_KINDS: readonly VoiceKind[] = ['notice', 'windup', 'hurt', 'death'];

/**
 * A family's voice. `f` is the pitch in Hz of a creature of radius 0.7 (SIZE_REF); `wave` its colour; `lp` a low-pass at
 * that many times the pitch (a round, closed mouth); `beat` a second voice that many Hz off (a growl's roughness);
 * `air` breath or hiss mixed in (0 to 1); `notes` the syllables of its notice; `len` how slowly it speaks (1 = a
 * small quick creature); `vib` a wobble in Hz on the long sounds; `trim` evens the families out at the speakers, and `warn` a boss's wind-up.
 */
interface Timbre { wave: OscillatorType; f: number; lp?: number; beat?: number; air?: number; notes?: number; len?: number; vib?: number; trim?: number; warn?: number }
export const VOICES: Record<string, Timbre> = {
  blob: { wave: 'sine', f: 880, notes: 1, len: 1.1, trim: 1, warn: 1.17 }, // a squeak
  bunny: { wave: 'sine', f: 1150, notes: 2, len: .8, trim: 1, warn: 1.15 }, // two quick peeps
  mushroom: { wave: 'triangle', f: 520, notes: 1, len: 1.2, vib: 14, trim: 1, warn: 1.1 }, // a springy "boing"
  frog: { wave: 'square', f: 190, lp: 5, beat: 31, notes: 2, len: 1, trim: .5, warn: 2 }, // a croak
  winged: { wave: 'sine', f: 2300, notes: 3, len: .6, vib: 28, trim: 1 }, // a chirp
  quadruped: { wave: 'sawtooth', f: 150, lp: 3, beat: 27, air: .1, notes: 1, len: 1.4, trim: 1, warn: 1.6 }, // a grunt
  bear: { wave: 'sawtooth', f: 104, lp: 6, beat: 21, air: .3, notes: 1, len: 1.9, trim: .85, warn: 1.9 }, // a growl
  crab: { wave: 'square', f: 760, lp: 4, notes: 3, len: .45, trim: 1, warn: .86 }, // clicking claws
  flower: { wave: 'sawtooth', f: 310, lp: 7, air: .7, notes: 1, len: .9, trim: 1, warn: 1.6 }, // a hissing snap
  cactus: { wave: 'triangle', f: 430, air: .3, notes: 2, len: .5, trim: 1, warn: 1.42 }, // a dry "tk-tk"
  treant: { wave: 'sawtooth', f: 82, lp: 5, beat: 11, air: .3, notes: 1, len: 2.3, vib: 5, trim: .85, warn: 1.9 }, // a creak
  lollipop: { wave: 'triangle', f: 1320, notes: 2, len: .9, vib: 18, trim: 1, warn: 1.1 }, // a sweet two-note call
  cake: { wave: 'triangle', f: 240, lp: 6, notes: 1, len: 1.8, vib: 6, trim: 1, warn: 1.2 }, // a wobbling "bloop"
  biped: { wave: 'square', f: 330, lp: 4, notes: 2, len: 1, trim: 1, warn: .93 }, // "hey!"
  penguin: { wave: 'square', f: 610, lp: 3, beat: 43, notes: 2, len: .8, trim: .7, warn: 1.32 }, // a honk
  volcano: { wave: 'sawtooth', f: 72, lp: 7, beat: 9, air: .8, notes: 1, len: 1.8, trim: .85, warn: 1.8 }, // a rumble
  turtle: { wave: 'triangle', f: 132, lp: 8, beat: 8, air: .2, notes: 1, len: 2, trim: .75, warn: 1.75 }, // a slow low moan
  worm: { wave: 'sawtooth', f: 270, lp: 9, air: .9, notes: 1, len: 1.3, vib: 22, trim: 1, warn: 1.17 }, // a hiss
  dragon: { wave: 'sawtooth', f: 118, lp: 8, beat: 29, air: .6, notes: 1, len: 2.1, trim: .88, warn: 1.6 }, // a roar
  jackbox: { wave: 'triangle', f: 500, notes: 2, len: 1, vib: 16, trim: 1, warn: 1.1 }, // a spring
  robot: { wave: 'square', f: 270, lp: 7, notes: 3, len: .7, trim: 1 }, // three beeps
  eye: { wave: 'sine', f: 610, notes: 1, len: 1.7, vib: 9, trim: 1, warn: 1.06 }, // an eerie hum
  titan: { wave: 'sawtooth', f: 58, lp: 7, beat: 15, air: .6, notes: 1, len: 2.6, trim: 1, warn: 1.6 }, // the ground speaks
};
/** The voice of a family nobody wrote one for: a squeak. */
export const DEFAULT_VOICE = 'blob';

/** The radius whose pitch is the table's; the pitch falls as the creature grows, inside PITCH_RANGE. */
export const SIZE_REF = .7, PITCH_RANGE = [.4, 1.6] as const;
/** How much higher or lower a creature of this radius speaks than the table's pitch (1 at SIZE_REF). */
export const pitchOf = (radius: number) => Math.max(PITCH_RANGE[0], Math.min(PITCH_RANGE[1], (SIZE_REF / Math.max(.05, radius || SIZE_REF)) ** .6));
/** The most a voice is panned to a side; full level inside FULL metres; silent from HEAR metres on. */
export const PAN_MAX = .8, FULL = 6, HEAR = 30;
/** Where a voice sits between the speakers, from where its creature is across the screen (-1 left edge, 1 right edge). */
export const panOf = (screenX: number) => Number.isFinite(screenX) ? Math.max(-PAN_MAX, Math.min(PAN_MAX, screenX * PAN_MAX)) : 0;
/** A voice's level by its creature's distance from the explorer in metres: 1 near, 0 from HEAR on. */
export const fadeOf = (metres: number) => !(metres < HEAR) ? 0 : metres <= FULL ? 1 : ((HEAR - metres) / (HEAR - FULL)) ** 1.5;

/** A creature yelps at most once in this many seconds. */
export const HURT_GAP = .25;
/**
 * No two voices of a kind start within its GAP seconds, whoever speaks (a group that notices the explorer is one or two
 * notices, not a chorus); FAMILY_GAP is the pause before the same family may say the same kind again.
 */
export const GAP: Record<VoiceKind, number> = { notice: .3, windup: .15, hurt: .08, death: .08 }, FAMILY_GAP: Record<VoiceKind, number> = { notice: .4, windup: .6, hurt: .12, death: .15 };
/** Ordinary voices of the shared counter that a creature voice always leaves free for the blows. */
export const SPARE = 2;
/** Creature voices sounding at once, at most: on a desktop and on a touch device. */
export const LIVE = 4, LIVE_TOUCH = 2;
/** Creature voices started in any one second, at most (a notice may be one more): on a desktop and on a touch device. */
export const PER_SECOND = 6, PER_SECOND_TOUCH = 4;
/** An ordinary creature's wind-up is heard only this near (metres); a boss's as far as any voice. */
export const WINDUP_NEAR = 14;
/** The wind-up voice rises for the whole wind-up, but never longer than WINDUP_MAX seconds; a longer wind-up starts it later. */
export const WINDUP_MAX = 1.2, WINDUP_TAIL = .1;
/** While a wind-up sounds its creature is looked at this often (seconds): an interrupted one falls silent. */
export const WATCH = .08;
/** How long the rise of a wind-up of `seconds` lasts: the voice starts `seconds - rise` after the telegraph and peaks at the blow. */
export const windupRise = (seconds: number) => Math.max(.05, Math.min(WINDUP_MAX, seconds));
/** Each kind's level against a notice; a boss's wind-up is the loud one. */
export const LEVEL: Record<VoiceKind, number> = { notice: 1, windup: .8, hurt: .6, death: .9 }, BOSS_WINDUP = 1.5;

/** A notice is never fainter than this (of full level), however far its creature is. */
export const NOTICE_FLOOR = .5;

export interface Say {
  /** The creature's radius (pitch), 0.7 when left out. */
  radius?: number;
  /** Its level from 0 to 1 (fadeOf its distance) and where it sits (panOf). */
  gain?: number; pan?: number;
  /** A wind-up: the seconds until the blow. */
  seconds?: number;
  boss?: boolean;
}
/** A playing voice: `end` on the audio clock, and `stop()` fades it out at once (an interrupted wind-up). */
interface Spoken { end: number; peak: number; stop(): void }

type Ctx = AudioContext;
/** One source into `to` with a quick attack and a decay, its pitch gliding; a second one `beat` Hz off roughens it. */
function note(ctx: Ctx, to: AudioNode, at: number, wave: OscillatorType, from: number, target: number, length: number, volume: number, beat = 0, vib = 0) {
  const env = ctx.createGain();
  env.gain.value = 0; env.gain.setValueAtTime(.0001, at); env.gain.linearRampToValueAtTime(volume, at + Math.min(.012, length * .25)); env.gain.exponentialRampToValueAtTime(.0008, at + length);
  env.connect(to);
  for (const off of beat ? [0, beat] : [0]) {
    const osc = ctx.createOscillator(); osc.type = wave;
    // The pitch is also set outright: an oscillator that waits at its default 440 Hz for its first step starts at a phase
    // that depends on where in the audio block it begins, and two voices a few Hz apart then add up differently each time.
    osc.frequency.value = from + off; osc.frequency.setValueAtTime(from + off, at); osc.frequency.exponentialRampToValueAtTime(Math.max(20, target + off), at + length);
    if (vib && !off) wobble(ctx, osc, at, length, vib, (from + target) * .03);
    osc.connect(env); osc.start(at); osc.stop(at + length + .02);
  }
}
/** A slow wobble on an oscillator's pitch. */
function wobble(ctx: Ctx, osc: OscillatorNode, at: number, length: number, hz: number, depth: number) {
  const lfo = ctx.createOscillator(), amount = ctx.createGain();
  lfo.frequency.value = hz; amount.gain.value = depth; lfo.connect(amount); amount.connect(osc.frequency); lfo.start(at); lfo.stop(at + length + .02);
}

/**
 * The voices' own little random stream (pitch and level of each play). Never Math.random: whether a voice plays depends on
 * the audio clock, which is real time, and a draw from the game's stream would then make the game itself differ from run
 * to run (the speed gate seeds Math.random and found exactly that).
 */
const ownRandom = (seed = 20261121) => () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };

export class CreatureVoices {
  /** Counters for the probes and tests. `byKind` counts the voices that started. */
  readonly stats = { played: 0, limited: 0, capped: 0, quiet: 0, byKind: { notice: 0, windup: 0, hurt: 0, death: 0 } as Record<VoiceKind, number> };
  random: () => number;
  private graph: AudioGraph; private touch: boolean; private muted: () => boolean;
  private noise: AudioBuffer | null = null;
  /** When each live voice ends, and when each kind and each family's kind was last said. */
  private ends: number[] = []; private said = new Map<string, number>(); private starts: number[] = [];
  constructor(graph: AudioGraph, options: { touch?: boolean; random?: () => number; muted?: () => boolean } = {}) {
    this.graph = graph; this.touch = !!options.touch; this.random = options.random ?? ownRandom(); this.muted = options.muted ?? (() => !(graph.sfx > 0));
  }
  /** Creature voices sounding now. */
  live(now: number) { this.ends = this.ends.filter(end => end > now); return this.ends.length; }

  /**
   * Says `kind` in the voice of `family`; null when it stays silent (muted, too far, too soon, or no voice free).
   * A boss's wind-up skips the pauses and this feature's own cap, and may take a voice kept for priority cues.
   */
  speak(family: string, kind: VoiceKind, say: Say = {}): Spoken | null {
    const graph = this.graph, level = Math.max(0, Math.min(1, say.gain ?? 1));
    if (this.muted() || graph.rest || !(level > .003)) { this.stats.quiet++; return null; }
    const ctx = graph.ctx, bus = ctx && graph.bus('sfx'); if (!ctx || !bus) return null;
    const now = ctx.currentTime, loud = kind === 'windup' && !!say.boss, key = kind + ':' + family;
    const more = kind === 'notice' ? 1 : 0, cap = (this.touch ? LIVE_TOUCH : LIVE) + more, rate = (this.touch ? PER_SECOND_TOUCH : PER_SECOND) + more;
    this.starts = this.starts.filter(t => now - t < 1);
    if (!loud && (now - (this.said.get(kind) ?? -9) < GAP[kind] || now - (this.said.get(key) ?? -9) < FAMILY_GAP[kind] || this.live(now) >= cap || this.starts.length >= rate)) { this.stats.limited++; return null; }
    const timbre = VOICES[family] ?? VOICES[DEFAULT_VOICE], slow = timbre.len ?? 1;
    const rise = windupRise(say.seconds ?? .6), at = now + .005 + (kind === 'windup' ? Math.max(0, (say.seconds ?? .6) - rise) : 0);
    const length = kind === 'windup' ? rise + WINDUP_TAIL : kind === 'notice' ? .1 * slow * (1 + ((timbre.notes ?? 1) - 1) * 1.25) : kind === 'hurt' ? .11 * slow : Math.max(.3, .34 * slow);
    // The last ordinary voices are left to the blows: a creature voice is decoration and steps back first (it is not even asked
    // for, so the shared counter's `capped` goes on counting sounds the fight lost, not voices).
    if (!loud && graph.voices.live(now) >= graph.voices.budget - graph.voices.reserve - SPARE) { this.stats.capped++; return null; }
    if (!graph.voices.take(now, at + length, loud)) { this.stats.capped++; return null; }
    this.said.set(kind, now); this.said.set(key, now); this.ends.push(at + length); this.starts.push(now);
    this.stats.played++; this.stats.byKind[kind]++;
    const out = ctx.createGain(); out.gain.value = level;
    out.connect(say.pan && graph.pan ? graph.pan(bus, say.pan) : bus);
    const p = pitchOf(say.radius ?? SIZE_REF) * (1 + (this.random() - .5) * .08), volume = .09 * (timbre.trim ?? 1) * LEVEL[kind] * (loud ? BOSS_WINDUP * (timbre.warn ?? 1) : 1) * (.92 + this.random() * .16);
    try { this.voice(ctx, out, at, timbre, kind, timbre.f * p, volume, rise, loud); } catch { /* a missing WebAudio feature only loses this voice */ }
    const free = () => { const i = this.ends.indexOf(at + length); if (i >= 0) this.ends.splice(i, 1); };
    return { end: at + length, peak: at + (kind === 'windup' ? rise : 0), stop() { free(); try { const g = out.gain, t = ctx.currentTime; g.cancelScheduledValues(t); g.setTargetAtTime(0, t, .015); } catch { /* it ends by itself */ } } };
  }

  private breath(ctx: Ctx) {
    if (!this.noise) {
      this.noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      fillNoise(this.noise.getChannelData(0));
    }
    return this.noise;
  }
  /** Breath or hiss around a pitch: band-passed noise with its own envelope (the steps are [seconds after `at`, level]). */
  private air(ctx: Ctx, to: AudioNode, at: number, hz: number, steps: [number, number][], amount: number) {
    const src = ctx.createBufferSource(), band = ctx.createBiquadFilter(), env = ctx.createGain(), end = steps[steps.length - 1][0];
    src.buffer = this.breath(ctx); src.loop = true; band.type = 'bandpass'; band.Q.value = .9; band.frequency.setValueAtTime(Math.max(300, Math.min(6000, hz)), at);
    env.gain.value = 0; env.gain.setValueAtTime(.0001, at); for (const [t, v] of steps) env.gain.linearRampToValueAtTime(Math.max(.0001, v * amount), at + t);
    src.connect(band); band.connect(env); env.connect(to); src.start(at, this.random() * .5); src.stop(at + end + .02);
  }

  private voice(ctx: Ctx, out: AudioNode, at: number, t: Timbre, kind: VoiceKind, f: number, volume: number, rise: number, loud: boolean) {
    // The mouth: a low-pass that follows the pitch, for the families that have one.
    let to = out;
    if (t.lp) { const mouth = ctx.createBiquadFilter(); mouth.type = 'lowpass'; mouth.Q.value = 1.2; mouth.frequency.setValueAtTime(Math.min(9000, f * t.lp), at); mouth.connect(out); to = mouth; }
    const slow = t.len ?? 1, beat = t.beat ?? 0, air = t.air ?? 0;
    if (kind === 'notice') {
      // A question: every syllable rises, each a little higher than the one before.
      const notes = t.notes ?? 1, length = .1 * slow;
      for (let i = 0; i < notes; i++) note(ctx, to, at + i * length * 1.25, t.wave, f * (1 + .1 * i), f * (1.38 + .1 * i), length, volume, beat);
      if (air) this.air(ctx, out, at, f * 3, [[.01, volume * 1.5], [length, 0]], air);
    } else if (kind === 'hurt') {
      // A yelp: starts high and drops.
      const length = .11 * slow;
      note(ctx, to, at, t.wave, f * 1.5, f * .82, length, volume, beat);
      if (air) this.air(ctx, out, at, f * 6, [[.006, volume * 1.5], [length, 0]], air);
    } else if (kind === 'death') {
      // The voice falls away, wobbling if it can.
      const length = Math.max(.3, .34 * slow);
      note(ctx, to, at, t.wave, f * 1.28, f * .4, length, volume, beat, t.vib ?? 7);
      if (air) this.air(ctx, out, at, f * 4, [[.02, volume * 1.2], [length, 0]], air);
    } else {
      // A wind-up: it is there at once (a small accent), then the pitch climbs and the level swells to the blow.
      const lead = Math.min(.04, rise * .2), dip = Math.min(.16, rise * .45), env = ctx.createGain(), peak = at + rise;
      env.gain.value = 0; env.gain.setValueAtTime(.0001, at); env.gain.linearRampToValueAtTime(volume * .5, at + lead); env.gain.linearRampToValueAtTime(volume * .36, at + dip);
      env.gain.linearRampToValueAtTime(volume, peak); env.gain.exponentialRampToValueAtTime(.0008, peak + WINDUP_TAIL);
      env.connect(to);
      // Two voices a few Hz apart add up to twice one: a rough voice winds up at 0.7 of its level, a boss's three at 0.6.
      const share = ctx.createGain(); share.gain.value = loud ? .6 : beat ? .7 : 1; share.connect(env);
      for (const [off, octave] of loud ? [[0, 1], [beat, 1], [0, 2]] : beat ? [[0, 1], [beat, 1]] : [[0, 1]]) {
        const osc = ctx.createOscillator(); osc.type = octave > 1 ? 'triangle' : t.wave;
        osc.frequency.value = (f * .62 + off) * octave; osc.frequency.setValueAtTime((f * .62 + off) * octave, at); osc.frequency.exponentialRampToValueAtTime((f * 1.3 + off) * octave, peak);
        if (t.vib && !off && octave === 1) wobble(ctx, osc, at, rise, t.vib, f * .03);
        osc.connect(share); osc.start(at); osc.stop(peak + WINDUP_TAIL + .02);
      }
      if (air || loud) this.air(ctx, out, at, f * 4, [[lead, volume * .5], [dip, volume * .3], [rise, volume * 1.3], [rise + WINDUP_TAIL, 0]], Math.max(air, loud ? .4 : 0));
    }
  }
}

/** Where a creature is for the ears: its distance from the explorer in metres and its place across the screen (-1 to 1). */
export type Place = (enemy: Enemy) => { metres: number; screenX: number };

/**
 * Connects the voices to the game's events. `place` says where a creature is; `now()` is the audio clock; `later` runs
 * the look at a creature that is winding up (a timer; tests hand in their own); `paused()` is true while a dialog is open.
 * Returns the wind-ups that are sounding, by creature, for tests.
 */
export function listen(s: Pick<GameServices, 'on'>, voices: CreatureVoices, place: Place, now: () => number, later: (run: () => void, seconds: number) => void = (run, seconds) => { setTimeout(run, seconds * 1000); }, paused: () => boolean = () => false) {
  const yelped = new WeakMap<Enemy, number>(), winding = new Map<Enemy, Spoken>();
  const say = (enemy: Enemy, kind: VoiceKind, seconds?: number) => {
    const at = place(enemy);
    if (kind === 'windup' && (paused() || !enemy.boss && at.metres > WINDUP_NEAR)) return null;
    return voices.speak(enemy.definition?.family ?? DEFAULT_VOICE, kind, { radius: enemy.radius, gain: kind === 'notice' ? Math.max(NOTICE_FLOOR, fadeOf(at.metres)) : fadeOf(at.metres), pan: panOf(at.screenX), seconds, boss: enemy.boss });
  };
  /** An interrupted wind-up (a flinch, a stun, a break, a defeat) must not go on promising a blow. */
  const hush = (enemy: Enemy, always = false) => {
    const voice = winding.get(enemy); if (!voice) return;
    if (always || voice.end <= now() || ((enemy.phase !== 'windup' || enemy.stun > 0) && voice.peak - now() > .05)) { if (voice.end > now()) voice.stop(); winding.delete(enemy); }
  };
  // Not every interruption is a blow of the explorer's (a stun takes hold a frame later, a creature may turn and flee):
  // while a wind-up sounds, its creature is looked at every WATCH seconds. No timer runs otherwise.
  let watching = false;
  const watch = () => { const all = paused(); for (const enemy of [...winding.keys()]) hush(enemy, all); if (winding.size) later(watch, WATCH); else watching = false; };
  s.on('creatureAlert', ({ enemy }) => { say(enemy, 'notice'); });
  s.on('telegraph', ({ enemy, time }) => {
    for (const [other, voice] of winding) if (voice.end <= now()) winding.delete(other);
    hush(enemy, true); const voice = say(enemy, 'windup', time); if (voice) winding.set(enemy, voice);
    if (winding.size && !watching) { watching = true; later(watch, WATCH); }
  });
  s.on('hitLanded', ({ enemy }) => {
    hush(enemy);
    if (!(enemy.hp > 0)) return; // its last sound is the death voice
    const t = now(); if (t - (yelped.get(enemy) ?? -9) < HURT_GAP) return;
    if (say(enemy, 'hurt')) yelped.set(enemy, t);
  });
  s.on('creatureDefeat', ({ enemy }) => { hush(enemy, true); say(enemy, 'death'); });
  s.on('bossBreak', ({ enemy }) => hush(enemy, true));
  return winding;
}

export function mount(s: GameServices) {
  const w = s.world, graph = s.audio, voices = new CreatureVoices(graph, { touch: s.touch(), muted: () => !(audioLevels.sfx > 0) });
  const spot = w.position.clone();
  const winding = listen(s, voices, enemy => {
    // Across the screen: the creature's place seen by the camera. Behind the camera the picture is mirrored.
    spot.set(enemy.x, enemy.mesh?.position.y ?? 0, enemy.z).project(w.camera);
    return { metres: Math.hypot(enemy.x - w.position.x, enemy.z - w.position.z), screenX: spot.z > 1 ? -spot.x : spot.x };
  }, () => graph.made?.currentTime ?? 0, undefined, () => !!s.modal());
  Object.assign(voices, { winding }); // for the probes: the wind-ups that are sounding, by creature
  // Last, when everything above has worked: from here on main.ts leaves the alert beep to the creatures' own notice.
  graph.creatures = voices;
}

/**
 * Where each kind peaks at the speakers at full level, in dBFS (promo/loudness.mjs --check holds every family to it):
 * all of them under the blows (a hit peaks near -9), a notice no quieter than the alert beep it replaces may be (-24).
 * A boss's wind-up is the warning: clearly over the music (RMS near -23), still under a hit.
 */
export const VOICE_BANDS: Record<VoiceKind, readonly [number, number]> = { notice: [-24, -17], windup: [-26, -17], hurt: [-28, -18], death: [-26, -17] };
export const WARNING_BAND = [-16, -11] as const;
/** A pet's or a helper's hit ('petHit', stingers.ts) is this many dB under the explorer's own. */
export const PET_UNDER = [5, 7] as const;
