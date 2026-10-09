import { canonicalItem, type Inventory } from './content.ts';
import { looseQuantity } from './pantry.ts';

/**
 * Backpack and chest slots, like the reference (Zoo Pet `ym={bag:{base:20,add:4,max:5},chest:{base:40,add:10,max:4}}`,
 * cost `function Cm(e,t)`, server `case\`expand\``): the bag starts with 20 slots and grows by 4 per expansion (5 times,
 * up to 40); the chest starts with 40 and grows by 10 (4 times, up to 80).
 *
 * Here an inventory is a stack per item id, so a slot is one item id: any number of carrots take one slot (the
 * reference stacks 99 per slot; our stacks never split). Worn gear sits in its equipment slot, so only the loose copies
 * of an id take a bag slot (pantry.ts looseQuantity). A full bag still takes more of an id it already holds.
 *
 * `fits` is the one capacity check: model.ts addItem asks it for every grant, so every way into the bag (harvest,
 * catches, ground loot, shop, crafting, chest withdrawals, quest rewards...) obeys the same rule. Saves from before the
 * slot limit keep everything: an over-full bag simply takes no new ids until it is below its size again.
 *
 * While a worker's harvest is being delivered to the chest (delivery.ts, actions.ts `intoChest`), the gains pass
 * through the bag on their way, so the check reads the chest's room instead (and counts the ids already on their way).
 */
// The owner chose roomier storage than the reference (20 + 4x5 / 40 + 10x4 felt cramped with this game's many items): a bag of 100 kinds
// growing by 10 up to 150, a chest of 120 growing by 20 up to 200. Upgrade costs keep the reference's formula.
export const STORAGE = { bag: { base: 100, add: 10, max: 5 }, chest: { base: 120, add: 20, max: 4 } } as const;
export type StorageKind = keyof typeof STORAGE;
export const isStorageKind = (value: unknown): value is StorageKind => value === 'bag' || value === 'chest';
type Holder = { bag: Inventory; chest: Inventory; gear: Partial<Record<string, string>>; planet: string; bagUp?: number; chestUp?: number; settings?: { tester?: boolean } };

/** Expansions bought so far (0..max); bad saved values read as 0 or the cap. */
export function storageLevel(s: Pick<Holder, 'bagUp' | 'chestUp'>, kind: StorageKind) {
  const raw = kind === 'bag' ? s.bagUp : s.chestUp;
  return typeof raw === 'number' && Number.isFinite(raw) && raw > 0 ? Math.min(STORAGE[kind].max, Math.floor(raw)) : 0;
}
export const bagCapacity = (s: Pick<Holder, 'bagUp'>) => STORAGE.bag.base + storageLevel(s, 'bag') * STORAGE.bag.add;
export const chestCapacity = (s: Pick<Holder, 'chestUp'>) => STORAGE.chest.base + storageLevel(s, 'chest') * STORAGE.chest.add;
/** Bag slots in use: ids with at least one loose (unworn) copy. */
export const bagSlotsUsed = (s: Holder) => Object.keys(s.bag).filter(id => looseQuantity(s, id) > 0).length;
export const chestSlotsUsed = (s: Pick<Holder, 'chest'>) => Object.values(s.chest).filter(n => (n ?? 0) > 0).length;

/**
 * The energy and materials for the next expansion from level `t` (0-based), exactly the reference's table:
 * bag ⚡200(t+1), leather 8+4t, tusk 2+t, star shard 1+t, pearl t (t ≥ 1), moonstone t−2 (t ≥ 3);
 * chest ⚡300(t+1), vine 6+4t, amber 1+t, star shard 1+t, thunder stone t (t ≥ 1), dragon scale t−1 (t ≥ 2).
 */
export function expansionCost(kind: StorageKind, t: number): { energy: number; materials: Inventory } {
  const materials: Inventory = kind === 'bag' ? { leather: 8 + t * 4, tusk: 2 + t, starshard: 1 + t } : { vine: 6 + t * 4, amber: 1 + t, starshard: 1 + t };
  if (kind === 'bag' && t >= 1) materials.pearl = t;
  if (kind === 'bag' && t >= 3) materials.moonstone = t - 2;
  if (kind === 'chest' && t >= 1) materials.thunderstone = t;
  if (kind === 'chest' && t >= 2) materials.dragonscale = t - 1;
  return { energy: (kind === 'bag' ? 200 : 300) * (t + 1), materials };
}
/** The next expansion of this storage, or null at its cap. */
export function nextExpansion(s: Holder, kind: StorageKind) {
  const level = storageLevel(s, kind); if (level >= STORAGE[kind].max) return null;
  const size = kind === 'bag' ? bagCapacity(s) : chestCapacity(s);
  return { level, size, next: size + STORAGE[kind].add, ...expansionCost(kind, level) };
}
/** Materials are taken from the backpack (the reference: "Nguyên liệu lấy trong túi đồ"), never a worn copy. */
export const hasExpansionMaterials = (s: Holder, materials: Inventory) => Object.entries(materials).every(([id, n]) => looseQuantity(s, id) >= (n ?? 0));

let delivery: Set<string> | null = null;
let full: StorageKind | null = null;
/** Runs `work` with the chest's room as the limit: gains pass through the bag and are moved to the chest afterwards. */
export function intoChest<T>(work: () => T): T { const previous = delivery; delivery = new Set(); try { return work(); } finally { delivery = previous; } }
export const delivering = () => delivery !== null;
/** Which storage refused the last grant (cleared at the start of each action, read when it is refused). */
export const fullNote = () => full;
export const clearFullNote = () => { full = null; };
export const noteFull = (kind: StorageKind) => { full = kind; };

/** Whether every id of `items` fits: ids already held only grow their stack; new ids need free slots. */
export function fits(s: Holder, items: Inventory) {
  if (s.settings?.tester) return true; // tester mode (tester.ts) checks every item at once: no slot limit
  const ids = [...new Set(Object.entries(items).filter(([, n]) => (n ?? 0) > 0).map(([id]) => canonicalItem(id)))];
  if (delivery) { const fresh = ids.filter(id => !((s.chest[id] ?? 0) > 0) && !delivery!.has(id)); return chestSlotsUsed(s) + delivery.size + fresh.length <= chestCapacity(s); }
  const fresh = ids.filter(id => !(looseQuantity(s, id) > 0)); return !fresh.length || bagSlotsUsed(s) + fresh.length <= bagCapacity(s);
}
/** Records ids granted while delivering to the chest, so each later grant sees the room they will take. */
export function noteDelivered(s: Holder, id: string) { if (delivery && !((s.chest[id] ?? 0) > 0)) delivery.add(id); }
/** Room in the chest for one more of `id`. */
export const chestFits = (s: Pick<Holder, 'chest' | 'chestUp'>, raw: string) => { const id = canonicalItem(raw); return (s.chest[id] ?? 0) > 0 || chestSlotsUsed(s) < chestCapacity(s); };
export const BAG_FULL = 'Your backpack is full. Sell something, store it in the chest, or expand the bag.';
export const CHEST_FULL = 'Your chest is full. Take something out or expand the chest.';
