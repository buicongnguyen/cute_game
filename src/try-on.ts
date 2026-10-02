import * as M from './model.ts';

type Gear = M.SaveState['gear'];

/**
 * The gear the explorer shows while trying an item on: the saved gear with that one slot swapped.
 * A disguise covers everything, so trying a hat or outfit takes the disguise off for the preview.
 * The result is a new object; the save's gear is never touched (try-on is local and temporary).
 */
export function previewGear(gear: Gear, id: M.ItemId | null | undefined): Gear {
  const slot = id ? M.ITEMS[id]?.slot : undefined;
  if (!id || !slot) return { ...gear };
  const next: Gear = { ...gear, [slot]: id };
  if (slot === 'hat' || slot === 'outfit' || slot === 'boots') delete next.disguise;
  return next;
}

/** Items the explorer can wear on the avatar (rods change by context, so they are not previewed). */
export const canTryOn = (id: string) => { const item = M.ITEMS[id]; return !!item?.slot && item.weapon?.kind !== 'rod'; };
