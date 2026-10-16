import { PICKUP, PickupList, type PickupLine, type TaskRowId } from './gain-feed.ts';

/**
 * Draws the gain feed (gain-feed.ts has the rules): the pickup list by the backpack button, the small "+N" over the EXP bar and
 * the energy count, and the tick on a tracker row. Everything here runs on a gain, never once a frame: one timer for the next
 * line to fade, motion by the Web Animations API on transform and opacity only (no layout is read, nothing reflows), and the
 * list never takes a tap (pointer-events: none, gain-feed.css). Pieces are made once and reused.
 */
export interface GainFeedHooks {
  hud: HTMLElement;
  /** The item's picture (item-icons.ts), or null for its emoji. */
  iconUrl(id: string): string | null;
  emoji(id: string): string;
  /** The item's name, already in the player's language. */
  name(id: string): string;
  phone(): boolean;
}
export interface GainFeed {
  pickup(id: string, count: number): void;
  stat(kind: 'xp' | 'energy', amount: number): void;
  tick(row: TaskRowId, delta: number, folded: boolean): void;
  /** For the layout tests and pictures: fills the list as a fight's loot would. */
  demo(): void;
}

const calm = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
/** el.animate where it exists (it does not in the Node tests' fake DOM). */
function play(el: Element | null | undefined, frames: Keyframe[], ms: number, easing = 'ease-out') {
  if (!el || typeof (el as HTMLElement).animate !== 'function') return null;
  return (el as HTMLElement).animate(frames, { duration: calm() ? Math.min(ms, 120) : ms, easing });
}
const FLOAT_UP: Keyframe[] = [{ transform: 'translateY(4px)', opacity: 0 }, { transform: 'translateY(0)', opacity: 1, offset: .18 }, { transform: 'translateY(-14px)', opacity: 0 }];
const GLOW: Keyframe[] = [{ opacity: 0 }, { opacity: .9, offset: .25 }, { opacity: 0 }];
const BUMP: Keyframe[] = [{ transform: 'scale(1)' }, { transform: 'scale(1.22)', offset: .35 }, { transform: 'scale(1)' }];
const BOUNCE: Keyframe[] = [{ transform: 'translateY(0) scale(1)' }, { transform: 'translateY(-5px) scale(1.12)', offset: .35 }, { transform: 'translateY(1px) scale(.96)', offset: .7 }, { transform: 'translateY(0) scale(1)' }];

export function initGainFeed(h: GainFeedHooks): GainFeed {
  const list = new PickupList(), nodes = new Map<number, HTMLElement>();
  const root = document.createElement('div'); root.id = 'pickup-feed'; root.setAttribute('aria-hidden', 'true'); h.hud.appendChild(root);
  let timer = 0;
  const schedule = () => { clearTimeout(timer); const next = list.nextExpiry(); if (next !== null) timer = window.setTimeout(sweep, Math.max(16, next - performance.now() + 5)); };
  const leave = (line: PickupLine) => { const el = nodes.get(line.uid); if (!el) return; nodes.delete(line.uid); el.classList.add('out'); setTimeout(() => el.remove(), 360); };
  function sweep() { for (const line of list.expire(performance.now())) leave(line); schedule(); }
  const lineNode = (line: PickupLine) => {
    const el = document.createElement('div'); el.className = 'pf-line';
    const icon = document.createElement('span'); icon.className = 'pf-icon';
    const url = h.iconUrl(line.id);
    if (url) { const img = document.createElement('img'); img.src = url; img.alt = ''; img.draggable = false; img.onerror = () => { icon.textContent = h.emoji(line.id); }; icon.appendChild(img); } else icon.textContent = h.emoji(line.id);
    const name = document.createElement('span'); name.className = 'pf-name'; name.textContent = h.name(line.id);
    const count = document.createElement('b'); count.className = 'pf-count';
    el.append(icon, name, count); return el;
  };
  let bag: HTMLElement | null = null, bounce: Animation | null = null;
  const bagBounce = () => {
    bag ??= h.hud.querySelector<HTMLElement>('.top-actions [data-action="bag"]');
    if (bounce && bounce.playState === 'running' && Number(bounce.currentTime ?? 0) < 200) return; // a burst of drops: one hop, not a shiver
    bounce?.cancel(); bounce = play(bag, BOUNCE, 420);
  };
  function pickup(id: string, count: number) {
    if (!(count > 0)) return;
    const change = list.add(id, count, performance.now(), h.phone() ? PICKUP.maxPhone : PICKUP.max);
    for (const line of change.dropped) { nodes.get(line.uid)?.remove(); nodes.delete(line.uid); } // pushed out: gone at once, so the list never grows a fourth row while it fades
    let el = nodes.get(change.line.uid);
    if (!el) { el = lineNode(change.line); nodes.set(change.line.uid, el); }
    el.querySelector('.pf-count')!.textContent = '×' + change.line.count.toLocaleString();
    if (root.firstElementChild !== el) root.prepend(el);
    if (change.merged) play(el.querySelector('.pf-count'), BUMP, 260); else play(el, [{ transform: 'translateX(14px)', opacity: 0 }, { transform: 'translateX(0)', opacity: 1 }], 200);
    bagBounce(); schedule();
  }

  // The "+N" over a number of the hero plate: one piece per number, summed while it is still floating.
  const floats: Record<'xp' | 'energy', { el: HTMLElement | null; sum: number; anim: Animation | null }> = { xp: { el: null, sum: 0, anim: null }, energy: { el: null, sum: 0, anim: null } };
  let glow: HTMLElement | null = null;
  function stat(kind: 'xp' | 'energy', amount: number) {
    if (!(amount > 0)) return;
    const f = floats[kind], card = h.hud.querySelector<HTMLElement>('.player-card'); if (!card) return;
    if (!f.el) { f.el = document.createElement('b'); f.el.className = 'gf-float gf-' + kind; f.el.setAttribute('aria-hidden', 'true'); card.appendChild(f.el); }
    f.sum = f.anim && f.anim.playState === 'running' ? f.sum + amount : amount;
    f.el.textContent = '+' + Math.round(f.sum).toLocaleString();
    f.anim?.cancel(); f.anim = play(f.el, FLOAT_UP, 900);
    if (f.anim) f.anim.onfinish = () => { f.sum = 0; };
    if (kind === 'xp') {
      if (!glow) { const meter = h.hud.querySelector('.meter.experience'); if (meter) { glow = document.createElement('i'); glow.className = 'gf-glow'; meter.appendChild(glow); } }
      play(glow, GLOW, 600);
    } else play(h.hud.querySelector('.hero-energy > b'), BUMP, 280);
  }

  // A tracker row ticks: a glow over the row, the count bumps, a "+1" floats up beside it. Folded, the chip's number pulses.
  const ROW: Record<TaskRowId, [string, string]> = { quest: ['#quest-summary', '#chip-quest'], bounty: ['#bounty-tracker', '#chip-bounty'], chal: ['#challenge-tracker', '#chip-chal'] };
  const pluses = new Map<Element, HTMLElement>(), glows = new Map<Element, HTMLElement>();
  function tick(row: TaskRowId, delta: number, folded: boolean) {
    const host = h.hud.querySelector<HTMLElement>(ROW[row][folded ? 1 : 0]); if (!host || host.closest('[hidden]')) return;
    // The folded chip's numbers are rewritten as text by the HUD, so their "+1" hangs on the chip itself, by its right end.
    const holder = folded ? host.closest<HTMLElement>('#tracker-chip') ?? host : host;
    let plus = pluses.get(holder); if (!plus) { plus = document.createElement('b'); plus.className = 'gf-plus'; plus.setAttribute('aria-hidden', 'true'); pluses.set(holder, plus); }
    if (plus.parentElement !== holder) holder.appendChild(plus);
    plus.textContent = '+' + delta; play(plus, FLOAT_UP, 800);
    if (folded) { play(host, BUMP, 320); return; }
    let shine = glows.get(host); if (!shine) { shine = document.createElement('i'); shine.className = 'gf-row-glow'; host.appendChild(shine); glows.set(host, shine); }
    play(shine, GLOW, 700); play(host.querySelector('.tracker-count'), BUMP, 320);
  }
  return { pickup, stat, tick, demo: () => { pickup('meat', 3); pickup('feather', 2); pickup('apple', 1); } };
}
