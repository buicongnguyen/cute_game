import { ITEMS, CROPS, canonicalItem, type ItemId, type Inventory } from './content.ts';
import { addItem, removeItem, gainXp, looseQuantity, type SaveState } from './model.ts';
import { recordEvent } from './progression.ts';

/**
 * The animal pen beside the garden (our extension: the reference has no farm animals). It runs on the crop rules:
 * a chick or calf is bought with energy (level-gated like seeds) and grows up on a timer; adults make one egg or one
 * jug of milk per cycle, which waits until collected (like a ripe crop); a crop from the bag halves the time still
 * needed, once per stage; one tap collects everything that is ready. Animals are never sold or turned into meat: meat
 * keeps coming from wild creatures. Times are wall-clock milliseconds, so the farm keeps going while the game is closed.
 */
export type AnimalKind = 'chicken' | 'cow';
export interface Animal {
  uid: number;
  kind: AnimalKind;
  /** When it arrived as a chick or calf (moved earlier when fed while young). */
  bornAt: number;
  /** Start of the product cycle under way: set to the moment it grows up when bought, moved by feeding and collecting. */
  cycleAt: number;
  /** Fed while young / during the current product cycle (one feed each). */
  fedYoung?: boolean;
  fed?: boolean;
}
export interface FarmState { animals: Animal[]; nextId: number; penLevel: number }
export interface AnimalDef {
  name: string; baby: string; icon: string; babyIcon: string; level: number; price: number;
  growMs: number; productMs: number; product: ItemId; xp: number; cap: number; capStep: number;
}
export const ANIMALS: Record<AnimalKind, AnimalDef> = {
  chicken: { name: 'Chicken', baby: 'Chick', icon: '🐔', babyIcon: '🐤', level: 2, price: 25, growMs: 60_000, productMs: 40_000, product: 'egg', xp: 5, cap: 4, capStep: 2 },
  cow: { name: 'Cow', baby: 'Calf', icon: '🐄', babyIcon: '🐮', level: 5, price: 70, growMs: 120_000, productMs: 75_000, product: 'milk', xp: 10, cap: 2, capStep: 1 },
};
export const ANIMAL_KINDS = Object.keys(ANIMALS) as AnimalKind[];
/** A crop given as feed halves the time the animal still needs to grow up or to make its next product. */
export const FEED_SHARE = .5;
/** Energy for each pen expansion (+2 chickens and +1 cow each). */
export const PEN_EXPANSIONS = [140, 280] as const;
export const MAX_PEN_LEVEL = PEN_EXPANSIONS.length;

/**
 * Where the pen stands at home: north of the garden (behind it on screen), on open grass between the storage chest,
 * the well and the west trees, clear of the trails and the fence. hw/hd are the half width (x) and half depth (z) of
 * its fence; the gate faces the garden (south).
 */
export const PEN = { x: -8.6, z: -5, hw: 3.4, hd: 2.2 } as const;
/** Distance from a point to the pen's fence rectangle (0 inside). */
export function penDistance(x: number, z: number) { return Math.hypot(Math.max(0, Math.abs(x - PEN.x) - PEN.hw), Math.max(0, Math.abs(z - PEN.z) - PEN.hd)); }
/** Whether a square of half side `half` centred here keeps `margin` metres off the pen (a path around the fence). */
export function clearOfPen(x: number, z: number, half: number, margin = .5) {
  return Math.abs(x - PEN.x) >= PEN.hw + half + margin || Math.abs(z - PEN.z) >= PEN.hd + half + margin;
}

// The products and the kitchen dishes made from them. Buffs follow the cooked foods: a raw product only heals.
const FARM_ITEMS: Record<string, Pick<typeof ITEMS[string], 'name' | 'icon' | 'type' | 'sell' | 'heal' | 'buff' | 'desc'>> = {
  egg: { name: 'Egg', icon: '🥚', type: 'food', sell: 6, heal: 12, desc: 'Laid by your chickens. Sell it, or cook an omelette or pancakes at the kitchen.' },
  milk: { name: 'Milk', icon: '🥛', type: 'food', sell: 14, heal: 20, desc: 'From your cows. Sell it, or make a milkshake, cheese or pancakes at the kitchen.' },
  omelette: { name: 'Omelette', icon: '🍳', type: 'food', sell: 18, heal: 40, buff: { def: 10, time: 90 }, desc: 'Two eggs, folded warm. Heals 40 and +10 defense for 90s.' },
  milkshake: { name: 'Milkshake', icon: '🥤', type: 'food', sell: 34, heal: 45, buff: { speed: .25, time: 90 }, desc: 'Cold and frothy. Heals 45 and +25% speed for 90s.' },
  cheese: { name: 'Cheese wheel', icon: '🧀', type: 'food', sell: 50, heal: 70, buff: { regen: 3, time: 120 }, desc: 'Three jugs of milk, aged a little. Heals 70 and +3 HP/s for 120s.' },
  pancake: { name: 'Pancakes', icon: '🥞', type: 'food', sell: 26, heal: 55, buff: { xp: .3, time: 120 }, desc: 'An egg and a jug of milk. Heals 55 and +30% XP for 120s.' },
};
for (const [id, item] of Object.entries(FARM_ITEMS)) if (!Object.hasOwn(ITEMS, id)) ITEMS[id] = { ...item } as typeof ITEMS[string];
export interface Dish { id: ItemId; materials: Inventory }
/** Kitchen recipes that use farm products (free to cook, like roasting). */
export const FARM_DISHES: readonly Dish[] = [
  { id: 'omelette', materials: { egg: 2 } },
  { id: 'pancake', materials: { egg: 1, milk: 1 } },
  { id: 'milkshake', materials: { milk: 2 } },
  { id: 'cheese', materials: { milk: 3 } },
];

export function emptyFarm(): FarmState { return { animals: [], nextId: 1, penLevel: 0 }; }
/** Saves from before the farm have no `farm`: they start with an empty pen. */
export function farmOf(s: SaveState): FarmState { return (s.farm ??= emptyFarm()); }
export function adultAt(a: Animal) { return a.bornAt + ANIMALS[a.kind].growMs; }
export function isAdult(a: Animal, now = Date.now()) { return now >= adultAt(a); }
/** 0 → 1 while young. */
export function growth(a: Animal, now = Date.now()) { return Math.max(0, Math.min(1, (now - a.bornAt) / ANIMALS[a.kind].growMs)); }
/** 0 → 1 through the current product cycle; 0 while young. */
export function productProgress(a: Animal, now = Date.now()) { return isAdult(a, now) ? Math.max(0, Math.min(1, (now - a.cycleAt) / ANIMALS[a.kind].productMs)) : 0; }
export function productReady(a: Animal, now = Date.now()) { return productProgress(a, now) >= 1; }
/** Milliseconds until it grows up (young) or until its product is ready (adult); 0 when a product waits. */
export function timeLeft(a: Animal, now = Date.now()) {
  return isAdult(a, now) ? Math.max(0, a.cycleAt + ANIMALS[a.kind].productMs - now) : adultAt(a) - now;
}
export function penCapacity(s: SaveState, kind: AnimalKind) { const d = ANIMALS[kind]; return d.cap + farmOf(s).penLevel * d.capStep; }
export function animalCount(s: SaveState, kind: AnimalKind) { return farmOf(s).animals.filter(a => a.kind === kind).length; }
export type BuyCheck = 'ok' | 'away' | 'level' | 'full' | 'energy';
export function canBuyAnimal(s: SaveState, kind: AnimalKind): BuyCheck {
  const d = Object.hasOwn(ANIMALS, kind) ? ANIMALS[kind] : undefined;
  if (!d || s.planet !== 'home') return 'away';
  if (s.level < d.level) return 'level';
  if (animalCount(s, kind) >= penCapacity(s, kind)) return 'full';
  return s.energy < d.price ? 'energy' : 'ok';
}
/** Buys a chick or a calf; it arrives young and grows up on its own. */
export function buyAnimal(s: SaveState, kind: AnimalKind, now = Date.now()): Animal | null {
  if (canBuyAnimal(s, kind) !== 'ok' || !Number.isFinite(now) || now < 0) return null;
  const farm = farmOf(s), a: Animal = { uid: farm.nextId++, kind, bornAt: now, cycleAt: now + ANIMALS[kind].growMs };
  s.energy -= ANIMALS[kind].price; farm.animals.push(a); return a;
}
/** The crop the farm feeds by default: the cheapest one in the bag (ties by name), or null. */
export function feedCrop(s: SaveState): ItemId | null {
  const crops = Object.keys(s.bag).filter(id => Object.hasOwn(CROPS, id) && looseQuantity(s, id) > 0);
  crops.sort((a, b) => ITEMS[a].sell - ITEMS[b].sell || a.localeCompare(b));
  return crops[0] ?? null;
}
/** Whether this animal would take feed now: once while young, once per product cycle, never while a product waits. */
export function canFeed(a: Animal, now = Date.now()) { return isAdult(a, now) ? !a.fed && !productReady(a, now) : !a.fedYoung; }
/** Feeds one crop to an animal; returns the crop used, or null (no such animal, already fed, nothing to feed). */
export function feedAnimal(s: SaveState, uid: number, now = Date.now(), raw?: ItemId): ItemId | null {
  const a = farmOf(s).animals.find(x => x.uid === uid), crop = raw ? canonicalItem(raw) : feedCrop(s);
  if (!a || !crop || !Object.hasOwn(CROPS, crop) || !Number.isFinite(now) || !canFeed(a, now) || looseQuantity(s, crop) < 1 || !removeItem(s.bag, crop)) return null;
  const skip = timeLeft(a, now) * FEED_SHARE;
  if (isAdult(a, now)) { a.cycleAt -= skip; a.fed = true; }
  else { a.bornAt -= skip; a.cycleAt -= skip; a.fedYoung = true; }
  return crop;
}
/** Feeds every animal that would take feed while crops last; returns how many ate. */
export function feedAll(s: SaveState, now = Date.now()) { let fed = 0; for (const a of farmOf(s).animals) if (canFeed(a, now) && feedAnimal(s, a.uid, now)) fed++; return fed; }
export interface Collected { uid: number; kind: AnimalKind; item: ItemId }
/**
 * Collects every waiting product (or only those of `uids`) into the bag, with XP; each animal starts its next cycle
 * now. The order is the given one, so the view can gather nearest first.
 */
export function collectProducts(s: SaveState, now = Date.now(), uids?: readonly number[]): Collected[] {
  if (s.planet !== 'home') return [];
  const animals = farmOf(s).animals, picked = uids ? uids.map(uid => animals.find(a => a.uid === uid)).filter((a): a is Animal => !!a) : animals;
  const out: Collected[] = [];
  for (const a of picked) {
    if (!productReady(a, now)) continue;
    const item = ANIMALS[a.kind].product;
    if (!addItem(s, item)) continue;
    a.cycleAt = now; a.fed = false; gainXp(s, ANIMALS[a.kind].xp, now); out.push({ uid: a.uid, kind: a.kind, item });
  }
  return out;
}
export function readyAnimals(s: SaveState, now = Date.now()) { return farmOf(s).animals.filter(a => productReady(a, now)); }
export function penExpandCost(s: SaveState) { const level = farmOf(s).penLevel; return level < MAX_PEN_LEVEL ? PEN_EXPANSIONS[level] : null; }
/** Room for two more chickens and one more cow. */
export function expandPen(s: SaveState) {
  const cost = penExpandCost(s);
  if (cost === null || s.planet !== 'home' || s.energy < cost) return false;
  s.energy -= cost; farmOf(s).penLevel++; return true;
}
export function canCookDish(s: SaveState, id: ItemId) {
  const dish = FARM_DISHES.find(d => d.id === id);
  return !!dish && s.planet === 'home' && Number.isSafeInteger((s.bag[id] || 0) + 1) && Object.entries(dish.materials).every(([m, n]) => looseQuantity(s, m) >= n!);
}
/** Cooks one farm dish at the kitchen (free, counts as a meal for the journal). */
export function cookDish(s: SaveState, id: ItemId) {
  if (!canCookDish(s, id)) return false;
  for (const [m, n] of Object.entries(FARM_DISHES.find(d => d.id === id)!.materials)) removeItem(s.bag, m, n);
  addItem(s, id); recordEvent(s, 'cook', 1); return true;
}
function count(value: unknown, fallback = 0) { return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.floor(value) : fallback; }
/** The farm from a save: unknown kinds and bad times are dropped, the pen keeps its caps; missing = an empty pen. */
export function parseFarm(raw: unknown): FarmState {
  const farm = emptyFarm();
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return farm;
  const v = raw as Record<string, unknown>;
  farm.penLevel = Math.min(MAX_PEN_LEVEL, count(v.penLevel));
  const seen = new Set<number>(), room: Record<AnimalKind, number> = { chicken: 0, cow: 0 };
  for (const item of Array.isArray(v.animals) ? v.animals : []) {
    if (!item || typeof item !== 'object') continue;
    const a = item as Record<string, unknown>, kind = a.kind as AnimalKind, uid = count(a.uid, -1);
    if (!Object.hasOwn(ANIMALS, kind) || uid < 1 || seen.has(uid) || !Number.isFinite(a.bornAt) || (a.bornAt as number) < 0) continue;
    if (room[kind] >= ANIMALS[kind].cap + farm.penLevel * ANIMALS[kind].capStep) continue;
    const bornAt = a.bornAt as number, cycleAt = Number.isFinite(a.cycleAt) ? a.cycleAt as number : bornAt + ANIMALS[kind].growMs;
    seen.add(uid); room[kind]++;
    farm.animals.push({ uid, kind, bornAt, cycleAt, ...(a.fedYoung === true ? { fedYoung: true } : {}), ...(a.fed === true ? { fed: true } : {}) });
  }
  farm.nextId = Math.max(count(v.nextId, 1), 1, ...farm.animals.map(a => a.uid + 1));
  return farm;
}
