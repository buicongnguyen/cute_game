// Weapon pair (owner's design, 2026-10-14): a main slot (gear.weapon: blades or fists) and a side slot (gear.side: one gun).
// An empty side slot plays exactly as before. The rules here are shared by the client, the offline game and the server
// (server/combat-authority.mjs keeps its own WeaponPair per explorer and learns the hand from the 'swap' message).
import { ITEMS, type ItemId } from './content.ts';

/** The side slot opens at this level (a one-time toast tells the player). */
export const SIDE_LEVEL = 15;
/** Auto swap: to the gun when the target's edge is farther than this (metres)… */
export const GUN_FAR = 4.5;
/** …and back to the blade or fists within this. In between the weapon in hand stays (hysteresis). */
export const BLADE_NEAR = 3;
/** Least time between two swaps, and the quick draw that follows a swap (seconds). */
export const SWAP_GAP = .6, DRAW_TIME = .15;
/** The first hit after a swap does +20%. */
export const SWAP_BONUS = 1.2;
/** In Auto mode a swap forced by Tab or the button holds this long before the distance rule may swap back (seconds). */
export const PAIR_HOLD = 3;
/** The side gun's own attack bonus counts at half (no stat stacking: the stowed weapon adds nothing). */
export const SIDE_ATK_SHARE = .5;

export type Hand = 'main' | 'side';
export type PairMode = 'auto' | 'manual';
type PairSave = { level: number; bag: Partial<Record<string, number>>; gear: { weapon?: ItemId; side?: ItemId }; settings?: { pairManual?: boolean } };

export const isGun = (id: string | undefined) => !!id && Object.hasOwn(ITEMS, id) && ITEMS[id].slot === 'weapon' && ITEMS[id].weapon?.kind === 'gun';
export const sideOpen = (s: { level: number }) => s.level >= SIDE_LEVEL;
/** A worn side gun the explorer still owns, while the main hand is not a gun too. */
export function sideGun(s: PairSave): ItemId | undefined {
  const id = s.gear.side;
  return id && isGun(id) && (s.bag[id] ?? 0) > 0 && !isGun(s.gear.weapon) ? id : undefined;
}
export const pairMode = (s: PairSave): PairMode => s.settings?.pairManual === true ? 'manual' : 'auto';

/** Put a gun in the side slot. A gun held in the main hand moves over (the main hand then goes back to a blade or fists). */
export function equipSide(s: PairSave & { gear: Record<string, ItemId | undefined> }, id: ItemId): boolean {
  if (!sideOpen(s) || !isGun(id) || !((s.bag[id] ?? 0) > 0)) return false;
  if (s.gear.weapon === id || isGun(s.gear.weapon)) delete s.gear.weapon;
  s.gear.side = id; return true;
}
export function unequipSide(s: { gear: Record<string, ItemId | undefined> }): boolean { if (!s.gear.side) return false; delete s.gear.side; return true; }

/** Hysteresis: gun beyond GUN_FAR, blade within BLADE_NEAR, otherwise keep what is in hand. `edge` is the target's edge distance. */
export function autoHand(current: Hand, edge: number): Hand {
  if (!Number.isFinite(edge)) return current;
  return edge > GUN_FAR ? 'side' : edge < BLADE_NEAR ? 'main' : current;
}

/**
 * The hand of one explorer: which weapon is out, when it last changed, the draw and the one-shot swap bonus.
 * Time is in seconds on whatever clock the caller uses (the client's world time, the server's Date.now()/1000).
 */
export class WeaponPair {
  hand: Hand = 'main';
  lastSwap = -Infinity;
  drawUntil = -Infinity;
  private bonus = false;
  /** Change hands. Refused within SWAP_GAP of the last swap or without a side gun to swap to. */
  swap(to: Hand, now: number, hasSide = true): boolean {
    if (to === this.hand || to === 'side' && !hasSide || now - this.lastSwap < SWAP_GAP - 1e-9) return false;
    this.hand = to; this.lastSwap = now; this.drawUntil = now + DRAW_TIME; this.bonus = true; return true;
  }
  toggle(now: number, hasSide = true) { return this.swap(this.hand === 'main' ? 'side' : 'main', now, hasSide); }
  /** Auto mode: the hand the target's distance asks for. Returns true when it swapped. */
  auto(edge: number, now: number, hasSide = true) { return this.swap(autoHand(this.hand, edge), now, hasSide); }
  /** The draw blocks attacks for DRAW_TIME after a swap. */
  ready(now: number) { return now >= this.drawUntil - 1e-9; }
  /** Multiplier for the next hit: SWAP_BONUS once after a swap, then 1. */
  takeBonus(): number { if (!this.bonus) return 1; this.bonus = false; return SWAP_BONUS; }
  get bonusReady() { return this.bonus; }
  /** No side gun any more (unequipped, moved): back to the main hand quietly, no bonus. */
  settle(hasSide: boolean) { if (!hasSide && this.hand === 'side') { this.hand = 'main'; this.bonus = false; } }
  reset() { this.hand = 'main'; this.lastSwap = -Infinity; this.drawUntil = -Infinity; this.bonus = false; }
}

/** The profile the combat rules read for a hand: with the side gun out it is the weapon in hand (model.ts reads `hand`). */
export function withHand<S extends PairSave>(s: S, hand: Hand): S {
  if (hand !== 'side' || !sideGun(s)) { if (!('hand' in s)) return s; const { hand: _h, ...rest } = s as S & { hand?: Hand }; return rest as S; }
  return { ...s, hand: 'side' };
}
