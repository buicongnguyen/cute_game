/**
 * STUB (w8-house) of the rescued-friends save module owned by w8-rescue
 * (cute_game-notes/round2/FRIENDS-CONTRACT.md). It has exactly the contract's exports so the house can
 * be built and tested before the real file lands; the lead replaces this file with w8-rescue's.
 * Not here (real file's job): save parsing of `friends`, rescue rules, roles at work outdoors.
 */
import { ITEMS, canonicalItem, type ItemId } from './content.ts';
import { addItem, removeItem, type SaveState } from './model.ts';

export type FriendId = 'sprout' | 'clover' | 'pepper';
export type FriendRole = 'garden' | 'farm' | 'cook';
type FriendSlot = 'hat' | 'armor' | 'boots' | 'pet' | 'weapon';
export interface Friend {
  id: FriendId; role: FriendRole;
  rescuedAt: number;
  /** Gear the player gave this friend (same slot keys and item ids as SaveState.gear; hats, outfits etc.). */
  gear: Partial<Record<FriendSlot, ItemId>>;
}
export const FRIENDS: Record<FriendId, { name: string; role: FriendRole; tint: string; hair: string }> = {
  sprout: { name: 'Sprout', role: 'garden', tint: '#7cc96b', hair: '#6b4a2e' },
  clover: { name: 'Clover', role: 'farm', tint: '#f2a65a', hair: '#3e2a20' },
  pepper: { name: 'Pepper', role: 'cook', tint: '#e8657f', hair: '#f0c75a' },
};
type WithFriends = SaveState & { friends?: Friend[] };
export function friendsOf(s: SaveState): Friend[] { const list = (s as WithFriends).friends; return Array.isArray(list) ? list : []; }
/** The friend slot an item is worn in (the save's 'outfit' slot is the contract's 'armor'). */
function slotOf(item: ItemId): FriendSlot | null {
  const slot = ITEMS[item]?.slot;
  return slot === 'outfit' ? 'armor' : slot === 'hat' || slot === 'boots' || slot === 'pet' || slot === 'weapon' ? slot : null;
}
/** The explorer stops wearing an item that is no longer in the bag. */
function keepGearOwned(s: SaveState) { for (const [slot, id] of Object.entries(s.gear)) if (id && !s.bag[id]) delete s.gear[slot as keyof SaveState['gear']]; }
export function giveGear(s: SaveState, id: FriendId, raw: ItemId): boolean {
  const item = canonicalItem(raw), friend = friendsOf(s).find(f => f.id === id), slot = slotOf(item);
  if (!friend || !slot || !s.bag[item]) return false;
  const old = friend.gear[slot];
  if (old === item) return false;
  if (!removeItem(s.bag, item)) return false;
  if (old) addItem(s, old);
  friend.gear[slot] = item; keepGearOwned(s);
  return true;
}
export function takeGear(s: SaveState, id: FriendId, slot: string): boolean {
  const friend = friendsOf(s).find(f => f.id === id), key = slot as FriendSlot, item = friend?.gear[key];
  if (!friend || !item || !addItem(s, item)) return false;
  delete friend.gear[key];
  return true;
}
