/**
 * The hit counter: a small number beside the fight that pops with every hit. The number is the untouched streak
 * (five-rules.ts: own hits landed since the explorer was last hurt, marked with a small shield), with the damage bonus it
 * gives under it and the power strike's charge as a thin ring round it (power-rules.ts). It warms in colour as the streak
 * grows, names the fight's big moments, and sums the timed chain up when that ends ('12 hits · 3,480', 'New best!').
 *
 * The rules are pure (tests/combo-counter.test.ts). The view writes to the page only when what it shows changes: never
 * once a frame. Motion is CSS only (combo-counter.css) and stops under 'reduced motion'.
 */

/** The counter grows a little and warms in colour at these counts. */
export const COUNTER_TIERS: readonly number[] = [5, 10, 20, 30];
/** 0 below the first milestone, then 1 to 4. */
export function counterTier(count: number) { let tier = 0; for (const at of COUNTER_TIERS) if (count >= at) tier++; return tier; }
/** True when `count` is exactly a milestone: the counter flashes once. */
export const counterMilestone = (count: number) => COUNTER_TIERS.includes(count);
export const COUNTER = {
  /** The counter shows from this many hits. */
  from: 2,
  /** A chain of at least this many hits is summed up when it ends, for `summary` seconds. */
  summaryFrom: 3, summary: 1.8,
  /** Seconds the name of a big moment ('LAUNCH!', 'FINISHER!') stays under the number. */
  note: .9,
} as const;

// ---------------------------------------------------------------- The best chain

/** Where the best chain lives in the save: two of the progression totals (an open table of numbers, so no new save field). */
export const BEST_HITS = 'comboBest', BEST_DAMAGE = 'comboBestDamage';
/**
 * A chain ended with `count` hits and `damage` dealt. Records it in `totals` when it beats the best count (or ties it
 * with more damage) and returns true for a new best. A first chain sets the record without calling it one, and a
 * chain under COUNTER.summaryFrom never counts.
 */
export function recordBest(totals: Record<string, number>, count: number, damage: number): boolean {
  count = Math.floor(count); damage = Math.max(0, Math.round(damage));
  if (!(count >= COUNTER.summaryFrom)) return false;
  const best = Number(totals[BEST_HITS]) || 0, bestDamage = Number(totals[BEST_DAMAGE]) || 0;
  if (count < best || count === best && damage <= bestDamage) return false;
  totals[BEST_HITS] = count; totals[BEST_DAMAGE] = damage;
  return best > 0 && count > best;
}

// ---------------------------------------------------------------- Where it sits

export interface Box { l: number; t: number; r: number; b: number }
const overlap = (a: Box, b: Box, pad = 0) => a.l < b.r + pad && b.l < a.r + pad && a.t < b.b + pad && b.t < a.b + pad;
/** The room the counter takes on screen (its tilted box, with the line under the number): smaller on phones (a narrow or a short screen). */
export function counterSize(W: number, H: number) { return W <= 600 || H <= 520 ? { w: 110, h: 72 } : { w: 140, h: 90 }; }
export interface Placement { x: number; y: number; /** Which side of the explorer it is on. */ side: 'left' | 'right'; /** False when no free place exists at all: the counter is not shown until one does. */ free: boolean; /** No place clear of the creature was free: it may cover the creature (never the explorer or the HUD). */ onTarget?: boolean }
/**
 * Where the counter goes: beside the explorer, on the side away from the creature being fought, as near as a free place
 * allows. It never covers the explorer or any of `blocked`, nor the target while any place clear of it is free (the HUD's pieces: boss bar, map, dock, stick,
 * paw ...), and stays `margin` px inside the screen. `keep`: where it is now; it stays there while that place is still
 * free, so it does not hop about during a chain. (x, y) is its top left corner.
 */
export function placeCounter(view: { W: number; H: number }, hero: Box, target: Box | null, blocked: readonly Box[], keep?: Placement | null, margin = 8): Placement {
  const { w, h } = counterSize(view.W, view.H), hx = (hero.l + hero.r) / 2, hy = (hero.t + hero.b) / 2, gap = 14;
  const ok = (x: number, y: number, creature: Box | null = target) => {
    const box = { l: x, t: y, r: x + w, b: y + h };
    if (box.l < margin || box.t < margin || box.r > view.W - margin || box.b > view.H - margin) return false;
    if (overlap(box, hero, 4) || creature && overlap(box, creature, 4)) return false;
    return !blocked.some(b => overlap(box, b, 6));
  };
  // Beside the explorer, `push` further out; on a narrow screen it slides in to stay on screen (never onto the explorer: `ok` refuses that).
  const beside = (side: 'left' | 'right', push: number) => side === 'left' ? Math.max(margin, hero.l - gap - w - push) : Math.min(view.W - margin - w, hero.r + gap + push);
  if (keep?.free && ok(keep.x, keep.y, keep.onTarget ? null : target)) { if (!keep.onTarget) return keep; }
  // Away from the target first; with no target, on the left (the eye reads the number, then the fight).
  const away: 'left' | 'right' = target && (target.l + target.r) / 2 < hx ? 'right' : 'left', sides = [away, away === 'left' ? 'right' : 'left'] as const;
  const heights = [hy - h * .9, hy - h * 1.6, hy - h * .2, hy - h * 2.4, hy + h * .6, hy + h * 1.3, hy - h * 3.2, hy + h * 2.1];
  for (const push of [0, w * .5, w]) for (const side of sides) for (const y of heights) {
    const x = beside(side, push);
    if (ok(x, y)) return { x: Math.round(x), y: Math.round(y), side, free: true };
  }
  // No room at either side (a very narrow phone with the target beside the explorer): over the explorer's head, else under its feet.
  for (const y of [hero.t - gap - h, hero.t - gap - h * 1.8, hero.b + gap]) for (const x of [hx - w / 2, hx - w * .9, hx - w * .1]) if (ok(x, y)) return { x: Math.round(x), y: Math.round(y), side: away, free: true };
  // Still nothing (a 320 px phone with the creature on the only free side): the creature may pass behind it; the explorer and the HUD never do.
  if (target) for (const side of sides) for (const y of heights) { const x = beside(side, 0); if (ok(x, y, null)) return keep?.onTarget && keep.x === Math.round(x) && keep.y === Math.round(y) ? keep : { x: Math.round(x), y: Math.round(y), side, free: true, onTarget: true }; }
  // Last: the free place nearest the explorer anywhere on screen (a coarse sweep; this runs only when a count changes and nothing nearer was free).
  for (const creature of target ? [target, null] : [null]) {
    let best: Placement | null = null, near = Infinity;
    for (let y = margin; y + h <= view.H - margin; y += 14) for (let x = margin; x + w <= view.W - margin; x += 14) {
      const d = Math.hypot(x + w / 2 - hx, y + h / 2 - hy); if (d < near && ok(x, y, creature)) { near = d; best = { x, y, side: x + w / 2 < hx ? 'left' : 'right', free: true, ...(target && !creature ? { onTarget: true } : {}) }; }
    }
    if (best) return keep && keep.x === best.x && keep.y === best.y ? keep : best;
  }
  return { x: margin, y: Math.round(view.H * .38), side: 'left', free: false };
}

/** Every piece of the HUD the counter must keep off: the pieces themselves, not their containers (a container may span the screen). */
export const HUD_PIECES = '#hud .player-card,#hud .top-actions button,#hud .minimap,#hud .home-button,#hud .tracker-panels > *,#hud #tracker-chip,#hud #quick-eat,#hud .quick-eat-pick,#hud #buff-bar > *,#hud .skill,#hud .attack-pad,#hud .jump-pad,#movement-joystick,#boss-bar,#target-frame,.colossus-banner,#context-prompt button,#keys-guide,#environment-bar > *,#toasts .toast,#reel-button,#fish-hint,#discovery-progress,.almanac-chip';
/** The boxes of the HUD's visible pieces. A layout read: main.ts asks when a chain starts and at most twice a second while it runs, never per frame. */
export function readHudBoxes(doc: Pick<Document, 'querySelectorAll'>, selector: string = HUD_PIECES): Box[] {
  const out: Box[] = [];
  doc.querySelectorAll<HTMLElement>(selector).forEach(el => { const b = el.getBoundingClientRect(); if (b.width > 1 && b.height > 1) out.push({ l: b.left, t: b.top, r: b.right, b: b.bottom }); });
  return out;
}

// ---------------------------------------------------------------- What it shows

export interface CounterState {
  /** The number shown: the untouched streak while a chain runs, the chain's own count in its sum. */ count: number; /** The damage bonus in percent (0 = none shown). */ bonus: number; live: boolean;
  /** The power strike's charge: 0 to 1 towards the next level, and the level reached (0 none, 1 ready, 2 overcharged). */ charge: number; level: number;
  /** A big moment to name under the number ('' = none). */ note: string;
  /** The chain's sum when it has ended ('' while it runs), and whether it is a new best. */ summary: string; best: boolean;
}
/** The class list of the counter for a state: its tier, whether it lives, the charge, a milestone flash. */
export function counterClasses(s: CounterState, flip: boolean) {
  return ['t' + counterTier(s.count), s.live ? 'live' : 'done', flip ? 'pa' : 'pb', s.level > 0 ? 'charged' : '', s.level > 1 ? 'over' : '', s.live && counterMilestone(s.count) ? 'mile' : '', s.note ? 'noted' : '', s.best ? 'best' : ''].filter(Boolean).join(' ');
}
const group = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
/** '12 hits · 3,480': `phrase` is the translated pattern with {count} and {damage}. */
export function summaryText(phrase: string, count: number, damage: number) { return phrase.replace('{count}', String(count)).replace('{damage}', group(damage)); }

export const COUNTER_HTML = '<div id="combo-counter" hidden aria-hidden="true"><div class="cc-ring"><b class="cc-n"></b></div><div class="cc-side"><span class="cc-w"><svg class="cc-shield" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1.2l5.6 1.9v4.3c0 3.4-2.3 6-5.6 7.4-3.3-1.4-5.6-4-5.6-7.4V3.1z" fill="currentColor" stroke="#3a2433" stroke-width="1.6" stroke-linejoin="round"/></svg><span class="cc-word"></span></span><i class="cc-bonus"></i></div><em class="cc-note"></em></div>';

/** The counter on the page. `show` is cheap to call often: it writes only when its signature changes. */
export class ComboCounterView {
  private root: HTMLElement; private n: HTMLElement; private w: HTMLElement; private bonus: HTMLElement; private note: HTMLElement;
  private shown = ''; private flip = false; private wasLive = false; private lastCount = 0; private placed: Placement | null = null;
  constructor(root: HTMLElement) {
    this.root = root; const q = (s: string) => root.querySelector<HTMLElement>(s)!;
    this.n = q('.cc-n'); this.w = q('.cc-word'); this.bonus = q('.cc-bonus'); this.note = q('.cc-note');
  }
  get visible() { return !!this.shown; }
  /**
   * `state` null hides it. `word` is the translated 'HITS'; `place` is asked for the counter's place only when a chain
   * starts or its count changes (it reads the layout, so never per frame).
   */
  show(state: CounterState | null, word: string, place: (keep: Placement | null) => Placement) {
    const sig = !state ? '' : `${state.count}|${state.bonus}|${+state.live}|${Math.round(state.charge * 100)}|${state.level}|${state.note}|${state.summary}|${+state.best}|${word}`;
    if (sig === this.shown) return; const was = this.shown; this.shown = sig;
    if (!state) { this.root.hidden = true; this.placed = null; this.lastCount = 0; this.wasLive = false; return; }
    const counted = state.count !== this.lastCount; this.lastCount = state.count;
    if (counted && state.live) this.flip = !this.flip; // a new hit: the pop plays again (two identical animations, swapped)
    const ended = !state.live && this.wasLive; this.wasLive = state.live;
    if (!was || counted || ended) { // a new chain, a new hit, or the chain's end (the sum stays a while: the HUD may have changed under it)
      const at = place(this.placed);
      if (at !== this.placed) { this.placed = at; this.root.style.left = at.x + 'px'; this.root.style.top = at.y + 'px'; }
    }
    this.root.className = counterClasses(state, this.flip) + ' ' + (this.placed?.side ?? 'left');
    this.root.style.setProperty('--p', String(Math.round(Math.max(0, Math.min(1, state.level > 0 && state.charge <= 0 ? 1 : state.charge)) * 100)));
    this.n.textContent = String(state.count); this.w.textContent = word; this.bonus.textContent = state.bonus > 0 ? `+${state.bonus}%` : '';
    this.note.textContent = state.summary || state.note;
    this.root.hidden = !this.placed?.free; // nowhere free of the HUD and the explorer: better unseen than on top of them
  }
}
