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

/** Seconds a duck takes to go down, and to come back up. */
export const DUCK_ATTACK = .08, DUCK_RELEASE = .3;

/**
 * Gives a graph its duck(name, dB = 6, seconds = 1). Ducks do not stack: while one holds, another only makes it last
 * longer, at the first one's depth. A duck does not build the context: before any sound there is nothing to lower.
 */
export function installDuck(graph: AudioGraph) {
  const held: Partial<Record<Bus, { low: number; until: number }>> = {};
  graph.duck = (name, dB = 6, seconds = 1) => {
    const ctx = graph.made; if (!ctx || !graph.bus(name)) return;
    const h = held[name] ??= { low: 1, until: -1 }, g = graph.nodes[name]!.duck.gain, now = ctx.currentTime, end = now + Math.max(.1, seconds);
    if (now >= h.until) { // free (or still coming back): go down from where the gain is now
      const from = g.value; g.cancelScheduledValues(now); g.setValueAtTime(from, now); g.linearRampToValueAtTime(h.low = 10 ** (-dB / 20), now + DUCK_ATTACK);
    } else if (end <= h.until) return; // inside a longer duck: nothing to add
    else g.cancelScheduledValues(h.until); // held: drop the planned return and plan a later one
    h.until = end; g.setValueAtTime(h.low, end); g.linearRampToValueAtTime(1, end + DUCK_RELEASE);
  };
}

/**
 * Puts the context to sleep while there is nothing to hear (both sliders at 0, or a hidden tab), otherwise wakes it.
 * `music` is the music slider now (audioLevels.music); the graph keeps it. Returns true when it should be asleep. An iPhone's "interrupted" state (a call, the lock screen) wakes the same way.
 */
export function settle(graph: AudioGraph, hidden: boolean, music = audioLevels.music) {
  graph.music = music;
  const off = graph.rest = graph.silent || hidden, ctx = graph.made;
  try {
    if (!ctx) return off;
    if (off) { if (ctx.state === 'running') void ctx.suspend?.()?.catch(() => {}); }
    else if (ctx.state !== 'running' && ctx.state !== 'closed') void ctx.resume()?.catch(() => {});
  } catch { /* an older browser: the context stays as it is */ }
  return off;
}

/** Settles the graph on every input and visibility change; the returned function stops watching. */
export function watchRest(graph: AudioGraph, win: Pick<Window, 'addEventListener' | 'removeEventListener'>, doc: Pick<Document, 'hidden' | 'addEventListener' | 'removeEventListener'>) {
  // 'change' is a volume slider let go (audio-settings.ts); the others are the gestures a phone lets audio start in.
  const events = ['pointerdown', 'touchend', 'keydown', 'change'], check = () => { settle(graph, doc.hidden); };
  for (const e of events) win.addEventListener(e, check, { capture: true, passive: true });
  doc.addEventListener('visibilitychange', check);
  check();
  return () => { for (const e of events) win.removeEventListener(e, check, { capture: true }); doc.removeEventListener('visibilitychange', check); };
}

export function mount(services: Pick<GameServices, 'audio'>) {
  installDuck(services.audio);
  if (typeof window !== 'undefined' && typeof document !== 'undefined') watchRest(services.audio, window, document);
}
