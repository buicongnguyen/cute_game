/**
 * Moment tips (FIX-PLAN 4.6): on a new save, one small pointer bubble beside the thing that matters right now, each tip
 * once (saved through the firstRunSeen action, first-run.ts): plant at the first empty bed, harvest the first ripe crop,
 * the first creature close by, the first drop on the ground, and the backpack when a weapon waits to be equipped.
 * Phones say "Tap", mouse players "Click" or the key (the same coarse-pointer check as guide.ts isTouch).
 * Never behind a dialog (the HUD hides them while one is open) and never in the top strip where the dialog blur sits:
 * a bubble that would rise into it flips below its anchor.
 * The rules are pure (pickTip, tests); the bubble is one fixed element moved with a transform, positioned each frame
 * only while a tip is up, and the rules are read five times a second.
 */
import { t } from './i18n.ts';
import { hasSeen, type FirstRun, type FirstSeen } from './first-run.ts';

export interface TipPoint { x: number; y: number; z: number }
/** What is around the explorer now (main.ts gathers it; null when absent or too far). */
export interface TipFacts {
  touch: boolean;
  /** The nearest empty bed within reach while nothing has been planted or harvested yet. */
  emptyBed: TipPoint | null;
  /** A ripe bed close by while nothing has been harvested yet. */
  ripeBed: TipPoint | null;
  /** The nearest living small creature close by. */
  creature: TipPoint | null;
  /** A drop lying on the ground close by. */
  drop: TipPoint | null;
  /** A weapon in the bag while the story asks to equip one and nothing is equipped. */
  equip: boolean;
}
interface TipSave { firstRun?: FirstRun; counters: { kills: number } }
export interface Tip { id: FirstSeen; icon: string; text: string; at: TipPoint | 'bag' }
/** The tip to show now, or null: only on a new save, each once, the most urgent first (a creature, a drop, a ripe crop, a bed, the backpack). `showing`: the tip already up, which counts as unseen while its moment lasts. */
export function pickTip(s: TipSave, f: TipFacts, showing?: FirstSeen | null): Tip | null {
  if (!s.firstRun) return null;
  const want = (id: FirstSeen) => id === showing || !hasSeen(s, id);
  if (f.creature && s.counters.kills === 0 && want('tip:fight')) return { id: 'tip:fight', icon: '⚔️', text: f.touch ? 'Tap Attack to fight it' : 'Press F or click it to attack', at: f.creature };
  if (f.drop && want('tip:drop')) return { id: 'tip:drop', icon: '✨', text: 'Walk over it to pick it up', at: f.drop };
  if (f.ripeBed && want('tip:harvest')) return { id: 'tip:harvest', icon: '🧺', text: f.touch ? 'Ripe! Tap the bed to harvest' : 'Ripe! Click the bed or press F to harvest', at: f.ripeBed };
  if (f.emptyBed && want('tip:plant')) return { id: 'tip:plant', icon: '🌱', text: f.touch ? 'Tap the garden bed to plant' : 'Click the garden bed or press F to plant', at: f.emptyBed };
  if (f.equip && want('tip:equip')) return { id: 'tip:equip', icon: '🎒', text: f.touch ? 'Tap the backpack to equip your weapon' : 'Click the backpack (or press I) to equip your weapon', at: 'bag' };
  return null;
}
/** A tip stays up while its moment lasts, at least this long once shown and at most this long (seconds). */
export const TIP_MIN = 3, TIP_MAX = 10;
/** Bubbles never rise into the top strip (the zone name, the dialog blur): below this many pixels they flip under the anchor. */
export const TOP_STRIP = 120;

export interface TipHost {
  hud: HTMLElement;
  state(): TipSave;
  /** The game is on and calm enough for a tip: started, no dialog, at home or in the wild, alive. */
  active(): boolean;
  facts(): TipFacts;
  screen(x: number, y: number, z: number): { x: number; y: number; front: boolean };
  /** The backpack button on the HUD (the equip tip points at it). */
  bag(): HTMLElement | null;
  /** Saves the tip as seen (the firstRunSeen action). */
  seen(id: FirstSeen): void;
}
export function mountMomentTips(h: TipHost) {
  const el = document.createElement('div'); el.id = 'moment-tip'; el.hidden = true; el.setAttribute('role', 'status');
  el.innerHTML = '<div class="mt-bubble"><span></span><b></b><i class="mt-tail"></i></div>';
  h.hud.append(el);
  const icon = el.querySelector('span')!, text = el.querySelector('b')!, bubble = el.querySelector<HTMLElement>('.mt-bubble')!;
  let tip: Tip | null = null, age = 0, clock = 0, lastPos = '', marked = new Set<FirstSeen>();
  function hide() { tip = null; el.hidden = true; lastPos = ''; }
  function place() {
    if (!tip) return;
    let x: number, y: number;
    if (tip.at === 'bag') { const b = h.bag(), r = b?.getBoundingClientRect(); if (!r || !r.width) { el.hidden = true; return; } x = r.left + r.width / 2; y = r.bottom + 4; el.classList.add('below'); }
    else { const p = h.screen(tip.at.x, tip.at.y, tip.at.z); if (!p.front || p.x < 0 || p.x > innerWidth || p.y < 0 || p.y > innerHeight) { el.hidden = true; return; } x = p.x; y = p.y; el.classList.toggle('below', y < TOP_STRIP + 70); }
    el.hidden = false;
    // Keep the bubble on screen: shift it sideways inside a 16 px gutter, the tail stays on the anchor.
    const half = (bubble.offsetWidth || 200) / 2, shift = Math.min(innerWidth - 16 - half, Math.max(16 + half, x)) - x;
    const pos = `${x.toFixed(0)},${y.toFixed(0)},${shift.toFixed(0)}`; if (pos === lastPos) return; lastPos = pos;
    el.style.transform = `translate(${x.toFixed(0)}px, ${y.toFixed(0)}px)`; bubble.style.setProperty('--mt-shift', `${shift.toFixed(0)}px`);
  }
  return {
    /** Every frame: reads the rules five times a second, moves a shown bubble each frame. */
    frame(dt: number) {
      clock += dt; if (tip && !el.hidden) age += dt; // a tip counts its time (and is saved as seen) only while it is on screen
      if (clock >= .2) {
        clock = 0;
        const on = h.active(), s = h.state(), next = on && s.firstRun ? pickTip(s, h.facts(), tip?.id) : null;
        if (!on) { if (tip) hide(); return; }
        // The shown tip stays while its moment lasts (TIP_MIN..TIP_MAX s); a different moment takes over only after TIP_MIN.
        let gone: FirstSeen | null = null;
        if (tip && (age > TIP_MAX || (!next || next.id !== tip.id) && (age > TIP_MIN || !age))) { gone = tip.id; hide(); }
        if (next && next.id !== gone && (!tip || next.id === tip.id)) {
          if (!tip) { age = 0; icon.textContent = next.icon; text.textContent = t(next.text); el.classList.remove('below'); }
          tip = next;
        }
      }
      if (tip) { place(); if (!el.hidden && !marked.has(tip.id)) { marked.add(tip.id); h.seen(tip.id); } } // seen once it is on screen: once per save, even after a reload
    },
    get shown() { return tip?.id ?? null; },
  };
}
