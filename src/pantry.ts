import { ITEMS, canonicalItem, type Inventory } from './content.ts';

/**
 * Ingredients and materials within reach. At home the house chest counts as well as the backpack: the workers store
 * their harvest there while the explorer is out (delivery.ts), and the chest is where knocked-out-safe treasure waits.
 * Every home station reads the same numbers: the kitchen and farm dishes, the workshop and outfitter recipes, the forge
 * and the cottage bench. Away from home only the loose backpack counts. Equipped gear (one of each worn id) is never
 * spent. These are pure rules, shared by the client, actions.ts (the server replays them) and the tests; model.ts
 * re-exports them, and weapon-forge.ts / upgrades.ts import them here to stay clear of model.ts.
 */
type Stocked = { bag: Inventory; chest: Inventory; gear: Partial<Record<string, string>>; planet: string };

/** The backpack stack minus the one worn copy of an equipped id. */
export function looseQuantity(s: Stocked, raw: string) { const id = canonicalItem(raw); return Math.max(0, (s.bag[id] || 0) - (Object.values(s.gear).includes(id) ? 1 : 0)); }
/** Loose backpack stack, plus the house chest when at home. */
export function pantry(s: Stocked, raw: string) { const id = canonicalItem(raw); return looseQuantity(s, id) + (s.planet === 'home' ? s.chest[id] || 0 : 0); }
/** The part of `pantry` that would come out of the chest (the backpack is used first). */
export function fromChest(s: Stocked, raw: string, count: number) { return Math.max(0, Math.min(count, pantry(s, raw)) - looseQuantity(s, raw)); }
/** The ids within reach (pantry > 0), bag first. */
export function pantryIds(s: Stocked) { return [...new Set([...Object.keys(s.bag), ...(s.planet === 'home' ? Object.keys(s.chest) : [])])].filter(id => pantry(s, id) > 0); }
function take(inv: Inventory, id: string, n: number) { if ((inv[id] || 0) < n) return false; inv[id]! -= n; if (!inv[id]) delete inv[id]; return true; }
/** Takes `count` from the bag first, then the chest (home only); false (and nothing taken) when there is not enough. */
export function usePantry(s: Stocked, raw: string, count = 1) {
  const id = canonicalItem(raw); if (!Object.hasOwn(ITEMS, id) || !Number.isSafeInteger(count) || count < 1 || pantry(s, id) < count) return false;
  const fromBag = Math.min(count, looseQuantity(s, id)); if (fromBag) take(s.bag, id, fromBag);
  return fromBag === count || take(s.chest, id, count - fromBag);
}
/** Whether every material of a recipe or cost is within reach. */
export const hasMaterials = (s: Stocked, materials: Inventory = {}) => Object.entries(materials).every(([id, n]) => Number.isSafeInteger(n) && pantry(s, id) >= n!);
/** Spends a whole recipe or cost, or nothing at all (checked first, so a short material never leaves a half-paid craft). */
export function useMaterials(s: Stocked, materials: Inventory = {}) {
  if (!hasMaterials(s, materials)) return false;
  for (const [id, n] of Object.entries(materials)) if (n! > 0) usePantry(s, id, n);
  return true;
}
