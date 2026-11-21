/**
 * The low-health warning (AAA-PLAN WP12): below a quarter of the health bar the explorer's heart is heard, the edge of
 * the screen turns red and a heart shows on the health bar, until the bar is back above 30%.
 *
 * - On below LOW_ON (25%), off above LOW_OFF (30%): between the two it stays as it was, so a bar that sits at a quarter
 *   cannot make the warning flap.
 * - Off at 0 health (knocked out), indoors (the cottage is safe) and on Battery saver.
 * - The heartbeat: two soft low thumps every BEAT seconds at about -24 dBFS, an ordinary voice of the shared counter
 *   (a full fight may drop a beat; it never takes a voice kept for priority cues). Planned on the audio clock.
 * - The red edge is one layer of its own (low-health.css) whose opacity alone changes. A desktop pulses it with the
 *   beat; a touch device, a reduced-motion setting and the comfort setting (pref `flashes` = `off`, AAA-PLAN WP9) show
 *   it still.
 * - The heart on the bar is a class on the bar that is already there: no node, no text.
 *
 * Cost: a timer looks at the health five times a second (no frame listener); classes change only when the warning
 * comes or goes; no draw call, no layout. Levels: docs/SOUNDS.md, promo/loudness.mjs (`heartbeat`).
 */
import type { AudioGraph } from '../sfx.ts';
import type { GameServices } from '../game-services.ts';
import { audioLevels } from '../audio-settings.ts';

/** The warning comes below LOW_ON of the bar and goes above LOW_OFF. */
export const LOW_ON = .25, LOW_OFF = .3;
/** Seconds from one heartbeat to the next, the length of one (both thumps), and how often the health is looked at. */
export const BEAT = .8, BEAT_LENGTH = .3, POLL = .2;

export interface Vitals { health: number; indoors?: boolean; saver?: boolean }
/** The warning's switch: `step` takes the facts and says whether the warning is on. */
export class LowHealth {
  on = false;
  step({ health, indoors, saver }: Vitals) {
    if (!(health > 0) || indoors || saver) this.on = false;
    else if (health < LOW_ON) this.on = true;
    else if (health > LOW_OFF) this.on = false;
    return this.on;
  }
}
/** Whether the edge may pulse: never on a touch device, with reduced motion, or with flashes switched off. */
export const pulses = (touch: boolean, reduced: boolean, flashes: string) => !touch && !reduced && flashes !== 'off';

/** One heartbeat at `at` on the audio clock into `to`: lub-dub, each a low thump with a little body a phone can play. */
export function heartbeat(ctx: AudioContext, to: AudioNode, at: number, volume = 1) {
  for (const [dt, level, f] of [[0, 1, 74], [.17, .72, 62]]) {
    for (const [mult, part, length] of [[1, .066, .13], [2.5, .0125, .07]]) {
      const osc = ctx.createOscillator(), env = ctx.createGain(), t = at + dt;
      osc.type = 'sine'; osc.frequency.value = f * mult * 1.5; osc.frequency.setValueAtTime(f * mult * 1.5, t); osc.frequency.exponentialRampToValueAtTime(f * mult * .62, t + length);
      env.gain.value = 0; env.gain.setValueAtTime(.0001, t); env.gain.linearRampToValueAtTime(part * level * volume, t + .008); env.gain.exponentialRampToValueAtTime(.0008, t + length);
      osc.connect(env); env.connect(to); osc.start(t); osc.stop(t + length + .02);
    }
  }
}

/**
 * Plans the heartbeats on the audio clock while the warning is on: `tick(on)` is called every POLL seconds and plans
 * the beat that falls due before the next call. A beat without a free voice is left out. `stats` counts for the probes.
 */
export class Heart {
  readonly stats = { beats: 0, dropped: 0 };
  private next = -1;
  private graph: AudioGraph; private muted: () => boolean;
  constructor(graph: AudioGraph, muted: () => boolean = () => !(graph.sfx > 0)) { this.graph = graph; this.muted = muted; }
  tick(on: boolean) {
    const graph = this.graph;
    if (!on || this.muted() || graph.rest) { this.next = -1; return; }
    const ctx = graph.ctx, bus = ctx && graph.bus('sfx'); if (!ctx || !bus) return;
    const now = ctx.currentTime;
    if (this.next < now) this.next = now + .03; // the first beat, or the clock stood still (a hidden tab): start afresh
    while (this.next < now + POLL + .05) {
      if (graph.voices.take(now, this.next + BEAT_LENGTH)) { this.stats.beats++; try { heartbeat(ctx, bus, this.next); } catch { /* a missing WebAudio feature only loses the beat */ } }
      else this.stats.dropped++;
      this.next += BEAT;
    }
  }
}

// The sheet comes as text inside this chunk (no request of its own). Node tests have no bundler and no page: they get none.
const sheets: Record<string, string> = typeof document === 'undefined' ? {} : import.meta.glob('./low-health.css', { query: '?inline', import: 'default', eager: true });

export function mount(s: GameServices) {
  if (typeof document === 'undefined' || typeof setInterval !== 'function') return;
  const flash = document.getElementById('damage-flash'), bar = document.querySelector('.meter.health'); if (!flash?.parentNode) return;
  const style = document.createElement('style'); style.textContent = Object.values(sheets).join(''); document.head.append(style);
  const edge = document.createElement('div'); edge.id = 'low-health'; edge.setAttribute('aria-hidden', 'true'); flash.parentNode.insertBefore(edge, flash);
  const low = new LowHealth(), heart = new Heart(s.audio, () => !(audioLevels.sfx > 0)), reduced = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)');
  Object.assign(s.audio, { lowHealth: { low, heart } }); // for the probes: __zooSfx.graph.lowHealth
  let shown = false, pulsing = false;
  setInterval(() => {
    const on = low.step({ health: s.health(), indoors: !!s.world.interior, saver: s.quality() === 'low' }) && !document.hidden;
    const pulse = on && pulses(s.touch(), !!reduced?.matches, s.pref('flashes'));
    if (on !== shown) { shown = on; edge.classList.toggle('on', on); bar?.classList.toggle('low', on); }
    if (pulse !== pulsing) { pulsing = pulse; edge.classList.toggle('pulse', pulse); }
    heart.tick(on);
  }, POLL * 1000);
}

/** Where the heartbeat peaks at the speakers, in dBFS (promo/loudness.mjs --check): about -24. */
export const HEART_BAND = [-26, -22] as const;
