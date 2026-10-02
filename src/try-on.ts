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
  if (M.WEARABLE_SLOTS.includes(slot)) delete next.disguise; // the same rule as M.equip, so buying shows what was tried
  return next;
}

/**
 * Rods are held by context (context-gear.ts): out by the water, put away elsewhere. A manual Equip of one was undone
 * on the next frame, so menus show them as automatic instead, and buying one does not take the weapon out of hand.
 */
export const autoHeld = (id: string) => M.ITEMS[id]?.weapon?.kind === 'rod';
/** Items the explorer can wear on the avatar (rods change by context, so they are not previewed). */
export const canTryOn = (id: string) => { const item = M.ITEMS[id]; return !!item?.slot && !autoHeld(id); };
