import { SAVE_KEY } from './model.ts';

/** Three offline save profiles on this device. Slot 0 keeps the original key, so an existing save is simply profile 1. */
export const PROFILE_SLOTS = 3;
const SLOT_KEY = 'cute-game-slot';
export const slotKey = (slot: number) => slot === 0 ? SAVE_KEY : `${SAVE_KEY}-slot${slot + 1}`;
const valid = (n: number) => Number.isInteger(n) && n >= 0 && n < PROFILE_SLOTS;
export function activeSlot(): number {
  try { const n = Number(globalThis.localStorage?.getItem(SLOT_KEY)); return valid(n) ? n : 0; } catch { return 0; }
}
export function setActiveSlot(slot: number): boolean {
  if (!valid(slot)) return false;
  try { globalThis.localStorage?.setItem(SLOT_KEY, String(slot)); return true; } catch { return false; }
}
export const activeKey = () => slotKey(activeSlot());
