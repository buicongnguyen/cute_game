import { ITEMS } from './content.ts';
import { PET_SLOTS } from './pet-slots.ts';
/**
 * Duplicate gear in the shop (FIX-PLAN 3.4). A second copy of gear is not useless (a helper can wear it, and pets fill two
 * pet slots), so it is not blocked; the shop marks gear you own as "Owned" and the buy button asks once more before a
 * copy you probably do not need. Materials, food and seeds (no gear slot) always buy at once.
 */
type Owner = { bag: Record<string, number | undefined>; chest?: Record<string, number | undefined>; gear?: Record<string, string | undefined> };
/** Copies of `id` the explorer has: in the bag (worn gear counts there too), in the chest, or worn. */
export function ownedCopies(s: Owner, id: string): number {
  const n = (s.bag[id] ?? 0) + (s.chest?.[id] ?? 0);
  return n > 0 ? n : Object.values(s.gear ?? {}).includes(id) ? 1 : 0;
}
/** How many copies one explorer can use at once: two for pets (two pet slots), one for any other gear. */
export const usefulCopies = (id: string) => { const slot = ITEMS[id as keyof typeof ITEMS]?.slot; return !slot ? Infinity : slot === 'pet' || slot === 'pet2' ? PET_SLOTS.length : 1; };
/** True when buying `id` again should ask first: gear you already own as many of as you can use. */
export const needsDuplicateConfirm = (s: Owner, id: string) => ownedCopies(s, id) >= usefulCopies(id);
