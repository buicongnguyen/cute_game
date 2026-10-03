import type { SaveState } from './model.ts';
import { ANIMALS, animalCount, buyAnimal, canBuyAnimal, expired, farmOf, penCapacity, priceOf, type LivestockKind } from './farm.ts';
import { canWork, helperOf } from './farm-helper.ts';
import { RESTOCK_KEEP_STEPS, RESTOCK_MAX_LEVEL, type RestockState } from './farm-helper-state.ts';

/**
 * Pen robot "Auto-restock": livestock expire after ANIMAL_LIFESPAN_MS, and once upgraded the robot buys a young
 * replacement of the same kind at the normal (difficulty) price, from the player's energy, never below the
 * "keep at least ϟN" guard. Level n keeps up to RESTOCK_PER_KIND[n-1] of each kind, and never more than the pen
 * holds now (expansions raise it). The robot only refills what it has seen: its roster remembers the most living
 * animals of each kind it ever counted, so it replaces losses but never decides to grow the farm by itself.
 */
export const RESTOCK_KINDS: readonly LivestockKind[] = ['chicken', 'duck', 'cow', 'pig'];
export const RESTOCK_PER_KIND = [2, 4, 7, 10] as const;
export const RESTOCK_COSTS = [300, 600, 1200, 2400] as const;
/** One live run buys at most this many; returning home after a long trip at most RESTOCK_CATCH_UP_CAP. */
export const RESTOCK_RUN_CAP = 2, RESTOCK_CATCH_UP_CAP = 6;
export { RESTOCK_KEEP_STEPS, RESTOCK_MAX_LEVEL };

export const restockOf = (s: SaveState): RestockState | undefined => helperOf(s).restock;
export const restockCost = (level: number) => level >= 0 && level < RESTOCK_MAX_LEVEL ? RESTOCK_COSTS[level] : null;
/** How many of `kind` the robot keeps now: the smallest of its level limit, what it has seen, and the pen's room. */
export function restockTarget(s: SaveState, kind: LivestockKind) {
  const r = restockOf(s); if (!r?.level) return 0;
  return Math.min(RESTOCK_PER_KIND[r.level - 1], r.roster[kind] ?? 0, penCapacity(s, kind));
}
const alive = (s: SaveState, kind: LivestockKind, now: number) => farmOf(s).animals.filter(a => a.kind === kind && !expired(a, now)).length;
/** Remember today's living stock (never more than the level allows); called before every run and on upgrade. */
function learn(s: SaveState, r: RestockState, now: number) {
  for (const kind of RESTOCK_KINDS) { const n = Math.min(alive(s, kind, now), RESTOCK_PER_KIND[r.level - 1]); if (n > (r.roster[kind] ?? 0)) r.roster[kind] = n; }
}

export type UpgradeResult = 'upgraded' | 'max' | 'away' | 'unowned' | 'energy';
export function upgradeRestock(s: SaveState, now = Date.now()): UpgradeResult {
  const h = helperOf(s); if (!h.owned || !s.farm?.helper) return 'unowned';
  if (s.planet !== 'home') return 'away';
  const level = h.restock?.level ?? 0, cost = restockCost(level); if (cost === null) return 'max';
  if (!Number.isSafeInteger(s.energy) || s.energy < cost) return 'energy';
  s.energy -= cost;
  const r = s.farm.helper.restock ??= { level: 0, on: true, keep: 250, roster: {} }; r.level = level + 1; learn(s, r, now);
  return 'upgraded';
}
export function setRestock(s: SaveState, on: unknown, keep: unknown) {
  const r = s.planet === 'home' && helperOf(s).owned ? s.farm?.helper?.restock : undefined; if (!r) return false;
  if (on !== undefined) { if (typeof on !== 'boolean') return false; r.on = on; }
  if (keep !== undefined) { if (!(RESTOCK_KEEP_STEPS as readonly unknown[]).includes(keep)) return false; r.keep = keep as number; }
  return true;
}
/** The next affordable replacement, or null. Expired animals still waiting as meat hold their slot until collected. */
export function nextRestock(s: SaveState, now = Date.now()): LivestockKind | null {
  const r = restockOf(s); if (!r?.on || !canWork(s)) return null;
  for (const kind of RESTOCK_KINDS) {
    if (alive(s, kind, now) >= restockTarget(s, kind) || animalCount(s, kind) >= penCapacity(s, kind)) continue;
    if (canBuyAnimal(s, kind) === 'ok' && s.energy - priceOf(s, kind) >= r.keep) return kind;
  }
  return null;
}
export interface Restocked { kind: LivestockKind; uid: number; price: number }
/** Buys up to `cap` replacements through buyAnimal (same price, level and room checks as the shop). Server-run too. */
export function restock(s: SaveState, now = Date.now(), cap = RESTOCK_RUN_CAP): Restocked[] {
  const out: Restocked[] = [], r = restockOf(s);
  if (!r?.on || !canWork(s) || !Number.isSafeInteger(cap) || cap < 1) return out;
  learn(s, r, now);
  for (let i = 0; i < Math.min(cap, RESTOCK_CATCH_UP_CAP); i++) {
    const kind = nextRestock(s, now); if (!kind) break;
    const price = priceOf(s, kind), a = buyAnimal(s, kind, now); if (!a) break;
    out.push({ kind, uid: a.uid, price });
  }
  return out;
}
/** "Restocked 2 🐔 1 🐄 (ϟ 120)" pieces for the toast. */
export function restockSummary(list: readonly Restocked[]) {
  const by = new Map<LivestockKind, number>(); for (const x of list) by.set(x.kind, (by.get(x.kind) ?? 0) + 1);
  return { animals: [...by].map(([k, n]) => `${n} ${ANIMALS[k].babyIcon}`).join(' '), spent: list.reduce((n, x) => n + x.price, 0) };
}
