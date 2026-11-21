/**
 * The music director (AAA-PLAN WP13): which music plays where, on the music bus of the game's one audio graph.
 *
 *   state      when                                                    what plays
 *   indoors    inside the cottage                                      nothing: the cottage radio is the music there
 *   space      flying between planets                                  the space tune
 *   ctf, rescue, vault   in a mode                                     the mode's tune, with its own beat
 *   boss       from bossEngaged until the boss falls or is left        the boss tune, with its own beat
 *   danger     a creature gives chase within REACH metres              the tune of the place, and the drums join
 *   village, forest, meadow, swamp, canyon, and each planet            the tune of the place
 *
 * There is no title state: the director is made after the first played frame, and the title stays quiet.
 *
 * - A change of tune is an equal-power crossfade of FADE seconds (the squares of the gains add up to 1 all the way).
 *   Danger and boss last HOLD seconds past their cause, so a creature at the edge of its reach cannot make the drums flap.
 * - The village rests: a tune plays once (two 8-bar phrases, or the recorded theme), then 60 to 120 s of the world's own
 *   sounds, then a variation. The wild regions play on.
 * - The recorded theme is asked for THEME_WAIT seconds after the features are mounted (the first played frame) or
 *   later, in idle time, so it is no part of the download before play; the service worker keeps it (sw-logic.mjs
 *   onDemand). Once it is there it plays on each arrival in the village; the live score plays the variations.
 * - Theme only: below Sharp graphics and on Battery saver (services.quality()), with THEME_ONLY of music-content.ts,
 *   or with the preference `music` set to `theme`: no live score; the theme plays and rests wherever there is music.
 *   (`music` = `live` plays the live score at any graphics level.)
 * - The radio wins: while it plays, and indoors, the director is silent (a radio that starts cuts a tail in CUT seconds).
 * - Off: with the music slider at 0 nothing is planned and nothing is kept; with both sliders at 0 or in a hidden tab the
 *   context sleeps (sound-mix.ts) and the director waits. It only ever reads the audio clock, so a stopped or a faked
 *   page clock can neither stall it nor make it spin.
 * - Ducking is not done here: everything plays on the music bus, which the stingers lower (sound-mix.ts duck).
 *
 * mount() looks at the game ten times a second (a timer, since frames stop in space): where the hero is, whether a
 * creature chases, the radio. Notes are planned about four times a second (music-score.ts).
 */
import type { AudioGraph } from '../sfx.ts';
import type { GameServices } from '../game-services.ts';
import type { Enemy } from '../world.ts';
import { audioLevels, radio } from '../audio-settings.ts';
import { assetUrl } from '../asset-url.ts';
import { MUSIC, HOME_ZONES, MODES, THEME_ONLY } from './music-content.ts';
import { Player, scoreBus, SCORE_VOICES, TOUCH_SCORE } from './music-score.ts';

/** For promo/music-clips.mjs, which takes the tunes and the player from the module the director itself uses. */
export { MUSIC, Player };
/** Seconds of a crossfade; seconds danger and boss outlast their cause; metres within which a chaser counts. */
export const FADE = 1.8, HOLD = 1.5, REACH = 12;
/** Seconds in which a starting radio silences the director; seconds after the first played frame before the theme is asked for. */
export const CUT = .12, THEME_WAIT = 20;
/** Everything of the director goes through this trim into the music bus, like the radio (features/radio.ts MusicBox.TRIM). */
export const TRIM = .55;
/** A fade is drawn with this many straight pieces. */
const PIECES = 12;

/** What the director needs to know of the game, read by mount(). */
export interface Scene { planet: string; zone: string; indoors: boolean; space: boolean; mode: string; chase: boolean; boss: boolean; radio: boolean }
export const newScene = (): Scene => ({ planet: 'home', zone: '', indoors: false, space: false, mode: '', chase: false, boss: false, radio: false });
/** The tune of the place alone: the planet's, or on the home planet the zone's (the village where a zone has no name yet). */
export const regionOf = (s: Scene) => s.planet !== 'home' ? MUSIC[s.planet] ? s.planet : 'village' : HOME_ZONES[s.zone] ?? 'village';
/** The state table. */
export const stateOf = (s: Scene, chase = s.chase, boss = s.boss) => s.indoors ? 'indoors' : s.space ? 'space' : MUSIC[s.mode] ? s.mode : boss ? 'boss' : chase ? 'danger' : regionOf(s);
/** The gain of a deck `x` (0 to 1) of the way through a fade that began at `from`: going up, or going out. */
export const fadeLevel = (from: number, up: boolean, x: number) => { const c = Math.cos(Math.max(0, Math.min(1, x)) * Math.PI / 2); return up ? Math.sqrt(1 - (1 - from * from) * c * c) : from * c; };

/** True while its cause holds and HOLD seconds longer. */
export class Held {
  on = false; private until = 0;
  set(cause: boolean, now: number) { if (cause) { this.on = true; this.until = now + HOLD; } else if (now >= this.until) this.on = false; return this.on; }
}

/** One thing that plays: a live tune or the recorded theme, behind its own gain. */
interface Deck { gain: GainNode; player: Player | null; src: AudioBufferSourceNode | null; from: number; t0: number; span: number; up: boolean; end: number; drums: boolean }

export class Director {
  /** The live score may play (false: theme only). */
  live = true;
  /** The recorded theme, once it is here. */
  theme: AudioBuffer | null = null;
  /** The state now, and what plays for it: a tune's name, 'theme', or '' for nothing. */
  name = ''; key = '';
  readonly decks: Deck[] = [];
  /** The deck that is up (null: silence), true in a rest, and when the play or the rest ends on the audio clock. */
  cur: Deck | null = null; resting = false; until = 0;
  private graph: AudioGraph; private lite: boolean; private seed: number; private ends: Float64Array;
  private out: AudioNode | null = null; private echo: AudioNode | null = null;
  private level = -1; private seen = -1; private round = 0; private plays = 0;
  private chase = new Held(); private boss = new Held(); private radio = false;
  /** `lite`: a touch device (6 voices, no pad). */
  constructor(graph: AudioGraph, lite = false, seed = 1) { this.graph = graph; this.lite = lite; this.seed = seed >>> 0; this.ends = new Float64Array(lite ? TOUCH_SCORE : SCORE_VOICES); }
  private random() { let t = this.seed = this.seed + 0x6D2B79F5 | 0; t = Math.imul(t ^ t >>> 15, 1 | t); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }

  /** Call it about ten times a second with the scene as it is. */
  tick(s: Scene) {
    const g = this.graph, level = audioLevels.music;
    if (!(level > 0)) { // off: the bus goes to 0 and nothing is kept
      if (this.out && level !== this.level) { g.music = this.level = level; g.bus('music'); }
      if (this.key || this.decks.length) { for (const d of this.decks) this.close(d); this.decks.length = 0; this.cur = null; this.key = ''; }
      return;
    }
    if (g.rest) return;
    if (level !== this.level || !this.out) {
      g.music = this.level = level; const bus = g.bus('music'); if (!bus) return;
      if (!this.out) { const trim = bus.context.createGain(); trim.gain.value = TRIM; trim.connect(bus); this.out = trim; this.echo = scoreBus(bus.context, trim); }
    }
    const now = g.made!.currentTime;
    if (now === this.seen) return; // a sleeping context, or the same moment again: nothing to do
    this.seen = now;
    const name = this.name = stateOf(s, this.chase.set(s.chase, now), this.boss.set(s.boss, now)), id = name === 'danger' ? regionOf(s) : name;
    const key = s.radio || !MUSIC[id].progs ? '' : this.live && !THEME_ONLY ? id : 'theme';
    // A radio that starts is a change too, also where nothing is asked for (indoors): what still fades out is cut.
    const cut = s.radio && !this.radio; this.radio = s.radio;
    if (key !== this.key || cut) { this.key = key; this.round = 0; this.resting = false; this.enter(now, s.radio ? CUT : FADE); }
    else if (now >= this.until) {
      if (this.resting) { this.resting = false; this.enter(now, FADE); }
      else { const [lo, hi] = MUSIC.village.rest!; this.resting = true; this.fade(null, now, FADE); this.until = now + lo + this.random() * (hi - lo); }
    }
    // The drums of the chase join the tune of the place, and leave more slowly than they came.
    const cur = this.cur, drums = name === 'danger';
    if (cur?.player && !cur.player.score.tune.beat && cur.drums !== drums) { cur.drums = drums; cur.player.drums.gain.setTargetAtTime(drums ? 1 : 0, now, drums ? .05 : .4); }
    const effects = this.lite ? g.voices : undefined;
    for (let i = this.decks.length - 1; i >= 0; i--) {
      const d = this.decks[i];
      if (d.up || now < d.end) d.player?.pass(now, drums && d === cur, effects);
      else if (now > d.end + 1.2) { this.close(d); this.decks.splice(i, 1); } // its echoes are over
    }
  }

  /** Starts what the state plays now: the theme, a tune, or nothing. */
  private enter(now: number, span: number) {
    const key = this.key, tune = MUSIC[key] ?? MUSIC.village;
    if (!key) { this.fade(null, now, span); this.until = Infinity; return; }
    // The recorded theme: on arrival where it belongs, and always where there is no live score.
    const first = !this.round++, theme = key === 'theme' || tune.file && first ? this.theme : null;
    if (key === 'theme' && !theme) { this.round = 0; this.resting = true; this.fade(null, now, span); this.until = now + 2; return; } // not here yet: look again shortly
    const ctx = this.graph.made!, d: Deck = { gain: null!, player: null, src: null, from: 0, t0: now, span, up: true, end: 0, drums: false };
    if (theme) {
      const src = d.src = ctx.createBufferSource(); d.gain = ctx.createGain(); d.gain.gain.value = 0;
      src.buffer = theme; src.connect(d.gain); d.gain.connect(this.out!); src.start(now + .05);
    } else {
      let seed = this.plays++ * 7919; for (let i = 0; i < key.length; i++) seed = seed * 31 + key.charCodeAt(i) | 0;
      d.player = new Player(ctx, this.echo!, tune, seed, this.lite, this.ends); d.gain = d.player.out;
    }
    this.decks.push(d); this.fade(d, now, span);
    this.until = theme ? now + theme.duration + .2 : tune.rest ? now + (tune.play ?? 2) * 32 * 60 / tune.bpm! : Infinity;
  }

  /** Crossfades to `to` (null: to silence) from wherever every deck is now, in `span` seconds. */
  private fade(to: Deck | null, now: number, span: number) {
    for (const d of this.decks) {
      if (d !== to && !d.up && now >= d.end) continue; // out already: it waits to be taken away
      const from = this.levelOf(d, now), up = d === to, g = d.gain.gain;
      d.from = from; d.t0 = now; d.span = span; d.up = up; if (!up) d.end = now + span;
      // Straight pieces from the level it has: a ramp that is cut off would fall back to where it began.
      g.cancelScheduledValues(now); g.setValueAtTime(from, now);
      for (let i = 1; i <= PIECES; i++) g.linearRampToValueAtTime(fadeLevel(from, up, i / PIECES), now + span * i / PIECES);
    }
    this.cur = to;
  }
  /** A deck's gain at `now`, worked out from its last fade (a gain cannot be read back in the middle of a ramp). */
  levelOf(d: Deck, now: number) { return fadeLevel(d.from, d.up, (now - d.t0) / d.span); }
  private close(d: Deck) { try { d.src?.stop(); } catch { /* it never started */ } try { d.gain.disconnect(); } catch { /* gone already */ } }
}

/** A creature that neither rests nor walks home is after someone. */
const hunting = (e: Enemy) => e.hp > 0 && !!e.phase && e.phase !== 'idle' && e.phase !== 'return';

export function mount(s: GameServices) {
  if (typeof document === 'undefined' || typeof setInterval !== 'function') return;
  const w = s.world, graph = s.audio, scene = newScene(), wish = s.pref('music'), director = new Director(graph, s.touch());
  Object.assign(graph, { director }); // for the probes: __zooSfx.graph.director
  let boss: Enemy | null = null, asked = false;
  s.on('bossEngaged', ({ enemy }) => { boss = enemy; });
  const body = document.body.classList, space = document.getElementById('space-hud'), born = performance.now();
  const near = (e: Enemy, reach: number) => (e.x - w.position.x) ** 2 + (e.z - w.position.z) ** 2 < reach * reach;
  /** The recorded theme, fetched whole (the service worker keeps it) and decoded once. */
  const load = () => {
    const ctx = graph.made, file = MUSIC.village.file; if (!ctx || !file) { asked = false; return; }
    void fetch(assetUrl(file)).then(r => r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status)))).then(bytes => ctx.decodeAudioData(bytes)).then(buffer => { director.theme = buffer; }).catch(() => { /* offline and not kept: the live score plays on */ });
  };
  setInterval(() => {
    if (audioLevels.music > 0 && !graph.rest) {
      scene.planet = w.planet; scene.zone = w.lastZone; scene.indoors = !!w.interior; scene.space = !!space && !space.hidden; scene.radio = !!radio.box?.playing;
      scene.mode = ''; if (body.contains('in-mode')) for (const name in MODES) if (body.contains(name)) scene.mode = MODES[name];
      const out = !scene.indoors && !scene.space; let chase = false;
      if (out) for (const e of w.enemies) if (hunting(e) && near(e, REACH)) { chase = true; break; }
      scene.chase = chase;
      if (boss && !(boss.hp > 0 && w.enemies.includes(boss))) boss = null;
      scene.boss = out && !!boss && (hunting(boss) || near(boss, REACH * 2));
      if (!asked && performance.now() - born >= THEME_WAIT * 1000 && !(navigator as { connection?: { saveData?: boolean } }).connection?.saveData) { asked = true; if (typeof requestIdleCallback === 'function') requestIdleCallback(load, { timeout: 5000 }); else setTimeout(load, 0); }
    }
    director.live = wish === 'live' || wish !== 'theme' && s.quality() === 'high';
    director.tick(scene);
  }, 100);
}
