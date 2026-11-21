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
 *   Danger lasts HOLD and a boss BOSS_HOLD seconds past its cause, so a creature at the edge of its reach cannot make
 *   the drums flap. Another place must hold SETTLE seconds before its tune takes over, so a walk along a border
 *   changes nothing; and a tune that comes back while it still fades out (or within LINGER seconds after) is faded
 *   up again where it is, not started anew. At most three decks exist.
 * - The village rests: a tune plays once (two 8-bar phrases, or the recorded theme), then 60 to 120 s of the world's own
 *   sounds, then a variation. The wild regions play on.
 * - The recorded theme is asked for THEME_WAIT seconds after the features are mounted (the first played frame) or
 *   later, in idle time, so it is no part of the download before play; the service worker keeps it (sw-logic.mjs
 *   onDemand), and it is decoded only where it is needed (in the village, or where there is no live score). It then
 *   plays on an arrival in the village, at most once in THEME_GAP seconds; the live score plays the variations.
 *   The fetch waits while a chase or a boss is on, and a fetch that fails is tried again later, each time later.
 * - Theme only: below Sharp graphics and on Battery saver (services.quality()), with THEME_ONLY of music-content.ts,
 *   or with "Live music" off in Settings (the preference `music` = `theme`): the theme plays and rests wherever there
 *   is music. Until the theme is there (the first 20 s, Save-Data, offline) the live score stands in with a touch
 *   device's means: six voices, no pad. (`music` = `live` plays the full live score at any graphics level.)
 *   The graphics level is the automatic governor's: it is taken up only at a change of place, in a rest or when the
 *   switch is moved, never in the middle of a chase or a boss.
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
import { Player, scoreBus, seeded, SCORE_VOICES } from './music-score.ts';

/** Seconds of a crossfade; seconds danger outlasts its cause, and a boss (longer than a fade); metres within which a chaser counts. */
export const FADE = 1.8, HOLD = 1.5, BOSS_HOLD = 2, REACH = 12;
/** Seconds another place must hold before its tune takes over; seconds a faded tune stays ready to come back; seconds between two plays of the recorded theme. */
export const SETTLE = 1.5, LINGER = 4, THEME_GAP = 180;
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

/** True while its cause holds and `hold` seconds longer. */
export class Held {
  on = false; private until = 0; private hold: number;
  constructor(hold = HOLD) { this.hold = hold; }
  set(cause: boolean, now: number) { if (cause) { this.on = true; this.until = now + this.hold; } else if (now >= this.until) this.on = false; return this.on; }
}

/** One thing that plays: a live tune or the recorded theme, behind its own gain. `until`: when its play is over. */
interface Deck { key: string; gain: GainNode; player: Player | null; src: AudioBufferSourceNode | null; from: number; t0: number; span: number; up: boolean; end: number; linger: number; drums: boolean; until: number }

export class Director {
  /** What is asked for (mount() sets it): the live score may play; false: the recorded theme only. */
  can = true;
  /** True: take `can` up at the next look, whatever the place (the switch in Settings was moved). */
  fresh = false;
  /**
   * How the music is made now: 'live', 'theme' (the recorded theme only), or 'lite' (theme only, but the theme is not
   * here: the live score with a touch device's means). Taken from `can` at a change of place, in a rest and in silence.
   */
  mode = '';
  /** The recorded theme, once it is here. */
  theme: AudioBuffer | null = null;
  /** The state now, and what plays for it: a tune's name (with '~' for its lite version), 'theme', or '' for nothing. */
  name = ''; key = '';
  /** The decks that exist (three at most), and how many were ever made. */
  readonly decks: Deck[] = []; made = 0;
  /** The deck that is up (null: silence), true in a rest, and when the play or the rest ends on the audio clock. */
  cur: Deck | null = null; resting = false; until = 0;
  private graph: AudioGraph; private lite: boolean; private random: () => number; private ends = new Float64Array(SCORE_VOICES);
  private out: AudioNode | null = null; private echo: AudioNode | null = null;
  private level = -1; private seen = -1; private round = 0; private plays = 0;
  private chase = new Held(); private boss = new Held(BOSS_HOLD); private radio = false;
  /** The tune of the state at the last look and whether it changed since the music was last settled, whether the key in play is a place's, the key that waits at a border and since when, and when the theme last began. */
  private id = ''; private stale = false; private place = false; private want = ''; private since = 0; private themeAt = -1e9;
  /** `lite`: a touch device (6 voices, no pad). */
  constructor(graph: AudioGraph, lite = false, seed = 1) { this.graph = graph; this.lite = lite; this.random = seeded(seed); }

  /** Call it about ten times a second with the scene as it is. */
  tick(s: Scene) {
    const g = this.graph, level = audioLevels.music;
    if (!(level > 0)) { // off: the bus goes to 0 and nothing is kept
      if (this.out && level !== this.level) { g.music = this.level = level; g.bus('music'); }
      if (this.key || this.decks.length) { for (const d of this.decks) this.close(d); this.decks.length = 0; this.cur = null; this.key = this.want = ''; }
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
    const fresh = this.fresh, name = this.name = stateOf(s, this.chase.set(s.chase, now), this.boss.set(s.boss, now)), region = regionOf(s), id = name === 'danger' ? region : name;
    // How the music is made is settled where a change cannot be heard as one: never in the middle of a chase or a boss.
    if (id !== this.id) { this.id = id; this.stale = true; }
    const was = this.mode;
    if (!was || fresh || name !== 'boss' && name !== 'danger' && (this.stale || this.resting || !this.cur)) { this.fresh = this.stale = false; this.mode = this.can && !THEME_ONLY ? 'live' : this.theme ? 'theme' : 'lite'; }
    const place = id === region, key = s.radio || !MUSIC[id].progs ? '' : this.mode === 'theme' ? 'theme' : this.mode === 'lite' ? id + '~' : id;
    // A radio that starts is a change too, also where nothing is asked for (indoors): what still fades out is cut.
    const cut = s.radio && !this.radio; this.radio = s.radio;
    if (this.resting && was && this.mode !== was && key && this.key) this.key = key; // settled anew in a rest: the rest goes on, and what follows it is the new kind
    let go = cut || key !== this.key;
    if (go && !cut && !fresh && place && this.place && key && this.key) { // from one place to another: the new one must hold, or a border would thrash
      if (key !== this.want) { this.want = key; this.since = now; }
      go = now - this.since >= SETTLE;
    } else this.want = '';
    if (go) { this.key = key; this.place = place; this.want = ''; this.round = 0; this.resting = false; this.enter(now, s.radio ? CUT : FADE); }
    else if (key === this.key && now >= this.until) {
      if (this.resting) { this.resting = false; this.enter(now, FADE); }
      else { const [lo, hi] = MUSIC.village.rest!; this.resting = true; this.fade(null, now, FADE); this.until = now + lo + this.random() * (hi - lo); }
    }
    // The drums of the chase join the tune of the place, and leave more slowly than they came.
    const cur = this.cur, drums = name === 'danger';
    if (cur?.player && !cur.player.score.tune.beat && cur.drums !== drums) { cur.drums = drums; cur.player.drums.gain.setTargetAtTime(drums ? 1 : 0, now, drums ? .05 : .4); }
    const effects = this.lite ? g.voices : undefined;
    for (let i = this.decks.length - 1; i >= 0; i--) {
      const d = this.decks[i];
      // A deck that has faded out plays on unheard for LINGER seconds: if its place comes back, it is still in step.
      if (d.up || now < d.end + d.linger) d.player?.pass(now, drums && d === cur, effects);
      else { this.close(d); this.decks.splice(i, 1); }
    }
  }

  /** Starts what the state plays now: the theme, a tune, or nothing. */
  private enter(now: number, span: number) {
    const key = this.key, lite = key.endsWith('~'), tune = MUSIC[lite ? key.slice(0, -1) : key] ?? MUSIC.village;
    if (!key) { this.fade(null, now, span); this.until = Infinity; return; }
    // Still there from a moment ago (a walk along a border, a boss kited at the edge of its reach): up again, from where it is.
    for (const d of this.decks) if (d.key === key && d !== this.cur && now < d.until - FADE) { this.round++; this.fade(d, now, span); this.until = d.until; return; }
    // The recorded theme: on arrival where it belongs (not twice in THEME_GAP seconds), and always where there is no live score.
    const first = !this.round++, theme = key === 'theme' || tune.file && first && now - this.themeAt > THEME_GAP ? this.theme : null;
    const ctx = this.graph.made!, d: Deck = { key, gain: null!, player: null, src: null, from: 0, t0: now, span, up: true, end: 0, linger: 0, drums: false, until: Infinity };
    if (theme) {
      const src = d.src = ctx.createBufferSource(); d.gain = ctx.createGain(); d.gain.gain.value = 0;
      src.buffer = theme; src.connect(d.gain); d.gain.connect(this.out!); src.start(now + .05); this.themeAt = now;
    } else {
      let seed = this.plays++ * 7919; for (let i = 0; i < key.length; i++) seed = seed * 31 + key.charCodeAt(i) | 0;
      d.player = new Player(ctx, this.echo!, tune, seed, this.lite || lite, this.ends); d.gain = d.player.out;
    }
    this.until = d.until = theme ? now + theme.duration + .2 : tune.rest ? now + (tune.play ?? 2) * 32 * 60 / tune.bpm! : Infinity;
    this.decks.push(d); this.made++; this.fade(d, now, span);
    while (this.decks.length > 3) this.close(this.decks.shift()!); // the oldest: it has long faded out
  }

  /** Crossfades to `to` (null: to silence) from wherever every deck is now, in `span` seconds. */
  private fade(to: Deck | null, now: number, span: number) {
    for (const d of this.decks) {
      if (d !== to && !d.up && now >= d.end) continue; // out already: it waits to come back or to be taken away
      const from = this.levelOf(d, now), up = d === to, g = d.gain.gain;
      d.from = from; d.t0 = now; d.span = span; d.up = up; if (!up) { d.end = now + span; d.linger = to ? LINGER : 0; } // it stays ready where another tune took over, not where the music stops
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
  const w = s.world, graph = s.audio, scene = newScene(), director = new Director(graph, s.touch());
  Object.assign(graph, { director }); // for the probes: __zooSfx.graph.director
  let boss: Enemy | null = null, wish = s.pref('music');
  s.on('bossEngaged', ({ enemy }) => { boss = enemy; });
  const body = document.body.classList, space = document.getElementById('space-hud');
  const near = (e: Enemy, reach: number) => (e.x - w.position.x) ** 2 + (e.z - w.position.z) ** 2 < reach * reach;
  // The switch in Settings (audio-settings.ts audioRowsHtml draws the row; the click is taken here): on is automatic, off is the theme only.
  radio.row = () => `<div class="settings-row"><div><strong>Live music</strong><small>Tunes played for each place. Off: the recorded theme only.</small></div><button class="toggle ${wish === 'theme' ? '' : 'on'}" role="switch" aria-checked="${wish !== 'theme'}" aria-label="Live music" data-live-music></button></div>`;
  document.addEventListener('click', event => {
    const button = (event.target as Element | null)?.closest?.('[data-live-music]'); if (!button) return;
    wish = wish === 'theme' ? '' : 'theme'; s.setPref('music', wish); director.fresh = true;
    button.classList.toggle('on', wish !== 'theme'); button.setAttribute('aria-checked', String(wish !== 'theme'));
  });
  // The recorded theme: fetched whole (the service worker keeps it) THEME_WAIT seconds in or later, decoded where it is needed.
  let bytes: ArrayBuffer | null = null, busy = false, tries = 0, askAt = performance.now() + THEME_WAIT * 1000;
  const failed = () => { busy = false; bytes = null; askAt = performance.now() + 30000 * 2 ** Math.min(5, tries++); }; // again in 30 s, 1 min, 2 min ... 16 min
  const load = () => { void fetch(assetUrl(MUSIC.village.file!)).then(r => r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status)))).then(got => { bytes = got; busy = false; }).catch(failed); };
  setInterval(() => {
    director.can = wish === 'live' || wish !== 'theme' && s.quality() === 'high';
    if (audioLevels.music > 0 && !graph.rest) {
      scene.planet = w.planet; scene.zone = w.lastZone; scene.indoors = !!w.interior; scene.space = !!space && !space.hidden; scene.radio = !!radio.box?.playing;
      scene.mode = ''; if (body.contains('in-mode')) for (const name in MODES) if (body.contains(name)) scene.mode = MODES[name];
      const out = !scene.indoors && !scene.space; let chase = false;
      if (out) for (const e of w.enemies) if (hunting(e) && near(e, REACH)) { chase = true; break; }
      scene.chase = chase;
      if (boss && !(boss.hp > 0 && w.enemies.includes(boss))) boss = null;
      scene.boss = out && !!boss && (hunting(boss) || near(boss, REACH * 2));
      // Never in a fight: a fetch and a decode are work the fight should not pay for.
      if (!busy && !director.theme && !chase && !scene.boss) {
        if (bytes) { if (graph.made && (!director.can || out && regionOf(scene) === 'village')) { busy = true; void graph.made.decodeAudioData(bytes).then(buffer => { director.theme = buffer; bytes = null; busy = false; }, failed); } }
        else if (performance.now() >= askAt && !(navigator as { connection?: { saveData?: boolean } }).connection?.saveData) { busy = true; if (typeof requestIdleCallback === 'function') requestIdleCallback(load, { timeout: 5000 }); else setTimeout(load, 0); }
      }
    }
    director.tick(scene);
  }, 100);
}
