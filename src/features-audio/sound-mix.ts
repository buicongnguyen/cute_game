/**
 * The parts of the sound core (sfx.ts audioGraph, here as services.audio) that can wait until after Start (AAA-PLAN WP7):
 * - duck: a bus goes down 6 dB under a cue or a spoken line and comes back. The stingers and the talk bar call it.
 * - rest: the one AudioContext sleeps (suspend) while both volume sliders are at 0 or the tab is hidden, and wakes on
 *   the next input, so a silent or hidden game does not keep the audio thread running.
 * Nothing here runs per frame: only on a duck call, an input event or a visibility change.
 */
import type { AudioGraph, Bus } from '../sfx.ts';
import type { GameServices } from '../game-services.ts';
import { audioLevels } from '../audio-settings.ts';

/** Time constants of a duck, in seconds: going down (6 dB is reached within 0.1 s) and coming back up. */
const DUCK_ATTACK = .02, DUCK_RELEASE = .1;

/**
 * Gives a graph its duck(name, dB = 6, seconds = 1), its glide for moved sliders and its panner. Ducks do not stack: while one holds, another only makes it last
 * longer, at the first one's depth. A duck does not build the context: before any sound there is nothing to lower.
 * The gain only ever glides (setTargetAtTime): a new duck starts from wherever the gain is, with no step and without
 * reading the gain back in the middle of a ramp.
 */
export function installMix(graph: AudioGraph) {
  graph.pan = (to, pan) => {
    const ctx = to.context; if (typeof ctx.createStereoPanner !== 'function') return to;
    const node = ctx.createStereoPanner(); node.pan.value = Math.max(-1, Math.min(1, pan)); node.connect(to); return node;
  };
  // A volume slider that moves: the bus gain glides to its new level in about 50 ms and then sits on it exactly (0 is 0).
  graph.glide = (g, level, now) => { g.cancelScheduledValues(now); g.setTargetAtTime(level, now, .015); g.setValueAtTime(level, now + .15); };
  const held: Partial<Record<Bus, { low: number; until: number }>> = {};
  graph.duck = (name, dB = 6, seconds = 1) => {
    const ctx = graph.made; if (!ctx || !graph.bus(name)) return;
    const h = held[name] ??= { low: 1, until: -1 }, g = graph.nodes[name]!.duck.gain, now = ctx.currentTime, end = now + Math.max(.1, seconds);
    if (now >= h.until) { g.cancelScheduledValues(now); g.setTargetAtTime(h.low = 10 ** (-dB / 20), now, DUCK_ATTACK); } // free, or still coming back: go down from where the gain is
    else if (end <= h.until) return; // inside a longer duck: nothing to add
    else g.cancelScheduledValues(h.until); // held: drop the planned return and plan a later one
    h.until = end; g.setTargetAtTime(1, end, DUCK_RELEASE);
  };
}

/**
 * Puts the context to sleep while there is nothing to hear (both sliders at 0, or a hidden tab), otherwise wakes it.
 * `music` is the music slider now (audioLevels.music); the graph keeps it. Returns true when it should be asleep.
 * Awake means resume() every time, whatever the state says: a suspend() asked a moment ago may still be on its way,
 * and an iPhone's "interrupted" state (a call, the lock screen) wakes the same way.
 */
export function settle(graph: AudioGraph, hidden: boolean, music = audioLevels.music) {
  graph.music = music; graph.hidden = hidden;
  const off = graph.rest, ctx = graph.made;
  try {
    if (!ctx || ctx.state === 'closed') return off;
    if (!off) void ctx.resume()?.catch(() => {});
    else if (ctx.state === 'running') void ctx.suspend?.()?.catch(() => {});
  } catch { /* an older browser: the context stays as it is */ }
  return off;
}

/** Settles the graph on every input and visibility change; the returned function stops watching. */
export function watchRest(graph: AudioGraph, win: Pick<Window, 'addEventListener' | 'removeEventListener'>, doc: Pick<Document, 'hidden' | 'addEventListener' | 'removeEventListener'>) {
  // The gestures a phone lets audio start in are caught first (capture). A volume slider being dragged ('input') or let
  // go ('change', audio-settings.ts) is read last (bubble), after the game's own handler has taken the new level.
  const gestures = ['pointerdown', 'touchend', 'keydown'], sliders = ['input', 'change'], check = () => { settle(graph, doc.hidden); };
  for (const e of gestures) win.addEventListener(e, check, { capture: true, passive: true });
  for (const e of sliders) win.addEventListener(e, check, { passive: true });
  doc.addEventListener('visibilitychange', check);
  check();
  return () => { for (const e of gestures) win.removeEventListener(e, check, { capture: true }); for (const e of sliders) win.removeEventListener(e, check); doc.removeEventListener('visibilitychange', check); };
}

export function mount(services: Pick<GameServices, 'audio'>) {
  installMix(services.audio);
  if (typeof window !== 'undefined' && typeof document !== 'undefined') watchRest(services.audio, window, document);
}
