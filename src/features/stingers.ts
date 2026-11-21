/**
 * The stingers (AAA-PLAN WP8): short musical cues, each with its own recipe, so the level fanfare is heard only on a
 * level-up. Synthesized like every effect (sfx.ts building blocks: tone, hiss, bell), nothing is downloaded.
 *
 *   rewardSmall   two bright bells up a fourth                      a small gain: more storage, a tower upgrade, a nap
 *   rewardMedium  a three-bell D major run over a warm note         an upgrade that worked, a rare drop, a captured flag
 *   rewardLarge   a four-note A major run into a held chord         a new friend or pet, a new ability
 *   discover      a rising hum under an open, floating bell run     a new planet, a landing
 *   victory       a drum, a three-note horn call, a held F chord    a boss falls, a friend is freed
 *   equip         a cloth pull, a buckle and a two-bell fifth       new gear is on
 *   deny          two low notes stepping down                       not possible
 *   go            two short horn notes and a high one, with a rush  a match or a wave starts
 *   levelUp       the level fanfare of sfx.ts ('level')             a level-up, and nothing else
 *   flag          the pole thunks in, the cloth snaps, two horns    the arrival flag (place-flags.ts); it lived in sfx.ts before
 *
 * Every stinger lowers the music bus 6 dB for its length (sound-mix.ts duck), takes one voice of the shared budget as a
 * priority cue, and plays on the sfx bus. Levels: docs/SOUNDS.md, measured by promo/loudness.mjs.
 * The recipes reach the effects player through `AudioGraph.cue`; this file imports sfx.ts for types only.
 */
import type { AudioGraph, Kit, Sfx, Sound, Stinger } from '../sfx.ts';
import type { GameServices } from '../game-services.ts';

/** How far the music goes down under a stinger, in dB. */
export const STINGER_DUCK = 6;
/** The level fanfare's length in seconds (sfx.ts plays it; the duck under it is made here). */
export const LEVEL_LENGTH = 1.1;
/** The same stinger again inside this many seconds is one stinger. */
export const STINGER_GAP = .1;

type Play = (s: Sfx, k: Kit) => void;
/** A low drum: the weight under a win. */
const drum: (s: Sfx, k: Kit, dt: number, volume: number) => void = (s, k, dt, volume) => { s.tone(k, dt, 'sine', 130, 46, .2, volume, .003); s.hiss(k, dt, 'lowpass', 900, 140, .1, volume * .4); };
/** A horn note: a round triangle with a little square edge. */
const horn: (s: Sfx, k: Kit, dt: number, f: number, length: number, volume: number) => void = (s, k, dt, f, length, volume) => { s.tone(k, dt, 'triangle', f, f, length, volume, .012); s.tone(k, dt, 'square', f, f, length * .8, volume * .2, .012); };

/** Each stinger: its length in seconds (the voice it takes and the duck under it), its volume and its recipe. */
export const STINGER: Record<Exclude<Stinger, 'levelUp'> | 'flag', { length: number; gain: number; play: Play }> = {
  rewardSmall: { length: .45, gain: 1.3, play(s, k) {
    s.bell(k, 0, 1319, .16, .07, 2, 1.2); s.bell(k, .09, 1760, .34, .07, 2, 1.2); s.tone(k, .09, 'triangle', 880, 880, .22, .05, .01);
  } },
  rewardMedium: { length: .7, gain: 1.5, play(s, k) {
    [1175, 1480, 1760].forEach((f, i) => { s.bell(k, i * .08, f, i === 2 ? .5 : .24, .06, 2, 1.3); s.tone(k, i * .08, 'triangle', f / 2, f / 2, .16, .05, .008); });
    s.tone(k, .16, 'triangle', 294, 294, .5, .06, .02); s.hiss(k, .16, 'highpass', 4000, 9000, .4, .02, 1, .12);
  } },
  rewardLarge: { length: 1.1, gain: 1, play(s, k) {
    [880, 1109, 1319, 1760].forEach((f, i) => { s.bell(k, i * .075, f, .3, .055, 3.5, 1.5); s.tone(k, i * .075, 'triangle', f / 2, f / 2, .14, .06, .008); });
    [880, 1109, 1319].forEach(f => s.tone(k, .3, 'triangle', f, f, .75, .045, .02));
    drum(s, k, .3, .16); s.bell(k, .3, 2637, .7, .035); s.hiss(k, .3, 'highpass', 5000, 10000, .7, .025, 1, .15);
  } },
  discover: { length: 1, gain: 1.3, play(s, k) {
    s.tone(k, 0, 'sine', 294, 440, .5, .08, .12); s.hiss(k, 0, 'bandpass', 1500, 7000, .8, .03, 1.2, .35);
    [587, 880, 1319, 1661].forEach((f, i) => s.bell(k, .1 + i * .13, f, .5, .055, 3.5, 1.1));
    s.tone(k, .49, 'sine', 1661, 1661, .5, .03, .05);
  } },
  victory: { length: 1.4, gain: .85, play(s, k) {
    drum(s, k, 0, .22); horn(s, k, 0, 523, .11, .09); horn(s, k, .13, 523, .11, .09); horn(s, k, .26, 698, .16, .1);
    drum(s, k, .44, .26); [698, 880, 1046].forEach(f => horn(s, k, .44, f, .9, .06)); s.tone(k, .44, 'triangle', 349, 349, .8, .06, .02);
    s.bell(k, .44, 2093, .8, .035); s.hiss(k, .44, 'highpass', 5000, 9500, .8, .025, 1, .15);
  } },
  equip: { length: .4, gain: 1.25, play(s, k) {
    s.hiss(k, 0, 'bandpass', 900, 2600, .09, .12, 1.6, .03); s.bell(k, .07, 1480, .08, .07, 2.76, 3);
    s.bell(k, .12, 988, .26, .06, 2, 1.2); s.bell(k, .12, 1480, .3, .05, 2, 1.2);
  } },
  deny: { length: .32, gain: .7, play(s, k) {
    s.tone(k, 0, 'triangle', 277, 262, .1, .14, .006); s.tone(k, 0, 'square', 277, 262, .08, .02, .006);
    s.tone(k, .12, 'triangle', 208, 196, .18, .14, .006); s.tone(k, .12, 'square', 208, 196, .14, .02, .006); s.hiss(k, .12, 'lowpass', 600, 150, .08, .06);
  } },
  go: { length: .6, gain: 1.25, play(s, k) {
    horn(s, k, 0, 659, .09, .1); horn(s, k, .11, 659, .09, .1); horn(s, k, .22, 988, .36, .1);
    s.hiss(k, .2, 'bandpass', 700, 3600, .22, .08, 1.6, .06); s.bell(k, .22, 1976, .3, .03);
  } },
  flag: { length: .8, gain: 1, play(s, k) {
    s.tone(k, 0, 'sine', 210, 70, .12, .2, .002); s.hiss(k, 0, 'lowpass', 900, 160, .1, .12);
    s.hiss(k, .07, 'bandpass', 1200, 2600, .09, .07, 2.2, .01); s.hiss(k, .15, 'bandpass', 1500, 3000, .08, .05, 2.2, .01);
    [[587, .12], [880, .2]].forEach(([f, d], i) => { s.tone(k, .16 + i * .13, 'triangle', f, f, d + .14, .07, .012); s.tone(k, .16 + i * .13, 'square', f, f, d, .012, .012); });
    s.bell(k, .32, 1760, .35, .03, 3.5, 1.4);
  } },
};

/**
 * Gives a graph its stingers. The effects player asks `graph.cue` before every play: a stinger is played here (true), or
 * refused (false: the same one a moment ago, or no voice left even for a priority cue); any other sound is left to the
 * player's own recipes. The level fanfare stays the player's, with the music lowered under it.
 */
export function installStingers(graph: AudioGraph) {
  const last: Partial<Record<Sound, number>> = {};
  graph.cue = (sfx, sound, ctx) => {
    if (sound === 'levelUp') return sfx.play('level');
    if (sound === 'level') { graph.duck('music', STINGER_DUCK, LEVEL_LENGTH); return; }
    const stinger = (STINGER as Partial<Record<Sound, typeof STINGER.go>>)[sound]; if (!stinger) return;
    const now = ctx.currentTime, to = graph.bus('sfx');
    if (!to || now - (last[sound] ?? -9) < STINGER_GAP) { sfx.stats.limited++; return false; }
    if (!graph.voices.take(now, now + stinger.length, true)) { sfx.stats.capped++; return false; }
    last[sound] = now; sfx.stats.started++; sfx.stats.byKind[sound] = (sfx.stats.byKind[sound] ?? 0) + 1;
    graph.duck('music', STINGER_DUCK, stinger.length);
    try { stinger.play(sfx, { ctx, to, at: now + .005, p: 1 + (sfx.random() - .5) * .015, g: stinger.gain * (.94 + sfx.random() * .12) }); } catch { /* a missing WebAudio feature only loses this cue */ }
    return true;
  };
}

export function mount(services: Pick<GameServices, 'audio' | 'on' | 'tone'>) {
  installStingers(services.audio);
  // A freed friend is a win: main.ts tells it once (game-events.ts), and the cue is played here.
  services.on('rescue', () => services.tone('victory'));
}
