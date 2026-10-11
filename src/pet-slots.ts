import { ITEMS } from './content.ts';

/**
 * Two pet slots and the dog as a pet (no three.js, no model.ts: the client, the server and the tests share it).
 *
 * Slots: `gear.pet` and `gear.pet2` both hold an item whose own slot is 'pet' (no item says 'pet2'). Both are free from
 * the start. Everything a worn pet gives (stats, luck, light, its shots) counts from either slot exactly as it did from
 * the one slot; each pet shoots on its own cooldown. The same pet can sit in both slots only when the bag holds two.
 *
 * The dog: owning the garden guard dog (the animal pen, farm.ts) grants one DOG_PET item. Worn in a pet slot it follows
 * and tosses bones as before (guard-dog.ts keeps its numbers); not worn it stays at its pen. It has no model of its own
 * among the companions: the pen's dog is the one that walks out (dog-world.ts). Its garden protection belongs to owning
 * the dog (farm.ts hasGuardDog / guardBiteDamage) and never depends on the item being worn.
 *
 * The item is `penned`: it lives at the pen, not in the backpack, so it never takes a bag slot (storage-slots.ts) and
 * can never be sold, dropped, stored, given away, lent to a helper, dyed, upgraded or left in a dropped bag. That is
 * also why it can never be lost: taking it off always works, even with a full bag.
 */
export const PET_SLOTS = ['pet', 'pet2'] as const;
export type PetSlot = typeof PET_SLOTS[number];
export const DOG_PET = 'pet_dog';
type Gear = Partial<Record<string, string>>;

export const isPetSlot = (slot: unknown): slot is PetSlot => slot === 'pet' || slot === 'pet2';
/** The item slot a gear key takes: 'pet2' takes pets; every other key takes its own kind. */
export const slotKind = (key: string) => key === 'pet2' ? 'pet' : key;
/** How many gear slots wear this id (0, 1, or 2 for a pet worn twice). */
export function wornCount(gear: Gear, id: string) { let n = 0; for (const key in gear) if (gear[key] === id) n++; return n; }
/** The gear key wearing this id, or null. */
export function slotWearing(gear: Gear, id: string): string | null { for (const key in gear) if (gear[key] === id) return key; return null; }
/** The first empty pet slot, or null when both hold a pet. */
export const freePetSlot = (gear: Gear): PetSlot | null => !gear.pet ? 'pet' : !gear.pet2 ? 'pet2' : null;
/** The pets worn, in slot order (the dog included). */
export const petIds = (gear: Gear): string[] => PET_SLOTS.map(slot => gear[slot]).filter((id): id is string => !!id);
/** True while the dog is worn: it comes along (guard-dog.ts dogFollows still keeps it at the pen inside the village). */
export const dogWorn = (gear: Gear | undefined) => !!gear && (gear.pet === DOG_PET || gear.pet2 === DOG_PET);
/**
 * The pets drawn as companions, in slot order without the dog: index 0 trails on the right as the one pet always has,
 * index 1 on the left (the dog's side, which is free: two companions fill both slots, so the dog is at its pen).
 * No allocation: the frame loop asks this.
 */
export function companionId(gear: Gear | undefined, index: number): string | undefined {
  if (!gear) return undefined;
  const a = gear.pet && gear.pet !== DOG_PET ? gear.pet : undefined, b = gear.pet2 && gear.pet2 !== DOG_PET ? gear.pet2 : undefined;
  return index === 0 ? a ?? b : a ? b : undefined;
}
/** Lives at the pen, never in the backpack (the dog). */
export const isPenned = (id: string | undefined) => !!id && Object.hasOwn(ITEMS, id) && ITEMS[id].penned === true;

type DogOwner = { bag: Record<string, number | undefined>; chest?: Record<string, number | undefined>; gear: Gear; farm?: { animals?: { kind: string }[] } };
/** Owning the pen's guard dog (time-free, so a save reads the same on every machine). */
export const ownsDog = (s: Pick<DogOwner, 'farm'>) => !!s.farm?.animals?.some(a => a?.kind === 'dog');
/**
 * Keeps the dog item in step with the pen's dog. A dog without its item (a save from before pets had two slots, or a
 * dog bought just now) gets the item WORN in the free pet slot, so it keeps following as it always did; with both
 * slots taken it waits at the pen (the item is in the bag list, slot-free). No dog: no item. Returns true when granted.
 */
export function syncDogPet(s: DogOwner): boolean {
  if (!ownsDog(s)) {
    for (const slot of PET_SLOTS) if (s.gear[slot] === DOG_PET) delete s.gear[slot];
    delete s.bag[DOG_PET]; if (s.chest) delete s.chest[DOG_PET];
    return false;
  }
  if (s.chest?.[DOG_PET]) delete s.chest[DOG_PET];
  if (wornCount(s.gear, DOG_PET) > 1) delete s.gear.pet2;
  if ((s.bag[DOG_PET] ?? 0) >= 1) { s.bag[DOG_PET] = 1; return false; }
  s.bag[DOG_PET] = 1;
  if (!dogWorn(s.gear)) { const free = freePetSlot(s.gear); if (free) s.gear[free] = DOG_PET; }
  return true;
}
