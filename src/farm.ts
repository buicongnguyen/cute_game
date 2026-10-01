import { ITEMS, CROPS, canonicalItem, type ItemId, type Inventory } from './content.ts';
import { addItem, removeItem, gainXp, looseQuantity, type SaveState } from './model.ts';
import { recordEvent } from './progression.ts';

/**
 * The animal pen beside the garden (our extension: the reference has no farm animals). It runs on the crop rules:
 * a chick or calf is bought with energy (level-gated like seeds) and grows up on a timer; adults make one egg or one
 * jug of milk per cycle, which waits until collected (like a ripe crop); a crop from the bag halves the time still
 * needed, once per stage; one tap collects everything that is ready. After their lifetime, animals become a meat
 * pickup that waits until collected. Arrival time is independent of growth boosts. Timers also run while closed.
 */
export type AnimalKind = 'chicken' | 'cow';
export interface Animal {
  uid: number;
  kind: AnimalKind;
  /** When it arrived as a chick or calf (moved earlier when fed while young). */
  bornAt: number;
  /** Arrival time never changes when fed. Optional only for legacy in-memory animals; saves always fill it. */
  acquiredAt?: number;
  /** Start of the product cycle under way: set to the moment it grows up when bought, moved by feeding and collecting. */
  cycleAt: number;
  /** Fed while young / during the current product cycle (one feed each). */
  fedYoung?: boolean;
  fed?: boolean;
  /** Breed (coat colour) index into BREEDS[kind]: picked once at purchase, kept for life (the young wear it too). */
  coat?: number;
}
export interface FarmState { animals: Animal[]; nextId: number; penLevel: number; /** The pen has been built (a marked plot until then). */ built: boolean }
export interface AnimalDef {
  name: string; baby: string; icon: string; babyIcon: string; level: number; price: number;
  growMs: number; productMs: number; product: ItemId; xp: number; cap: number; capStep: number;
}
export const ANIMALS: Record<AnimalKind, AnimalDef> = {
  chicken: { name: 'Chicken', baby: 'Chick', icon: '🐔', babyIcon: '🐤', level: 2, price: 25, growMs: 60_000, productMs: 40_000, product: 'egg', xp: 5, cap: 4, capStep: 3 },
  cow: { name: 'Cow', baby: 'Calf', icon: '🐄', babyIcon: '🐮', level: 5, price: 70, growMs: 120_000, productMs: 75_000, product: 'milk', xp: 10, cap: 2, capStep: 4 },
};
export const ANIMAL_KINDS = Object.keys(ANIMALS) as AnimalKind[];
/** Coat breeds per kind (index = Animal.coat); farm-view.ts holds the matching colours. */
export const BREEDS: Record<AnimalKind, readonly string[]> = {
  chicken: ['White Leghorn', 'Rhode Island Red', 'Black Australorp', 'Speckled Sussex', 'Buff Orpington'],
  cow: ['Holstein', 'Jersey', 'Red and white', 'Black Angus', 'Highland'],
};
/** A stable breed: a hash of the animal's id and arrival second, so a purchase always gets the same coat. */
export function coatPick(kind: AnimalKind, uid: number, at = 0) {
  let h = (Math.imul(uid | 0, 0x9e3779b1) ^ Math.imul(Math.floor(at / 1000) | 0, 0x85ebca6b)) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d) >>> 0; h = (h ^ (h >>> 13)) >>> 0;
  return h % BREEDS[kind].length;
}
/** The animal's breed index; a missing or bad one falls back to the id's stable pick. */
export function coatOf(a: Pick<Animal, 'kind' | 'uid' | 'coat'>) { const n = BREEDS[a.kind].length, c = a.coat; return typeof c === 'number' && Number.isInteger(c) && c >= 0 && c < n ? c : coatPick(a.kind, a.uid); }
/** A crop given as feed halves the time the animal still needs to grow up or to make its next product. */
export const FEED_SHARE = .5;
/** Each kind has its own cap; the two upgrades reach 10 chickens and 10 cows. */
export const MAX_ANIMALS_PER_KIND = 10;
/** Wall-clock time from arrival until an animal becomes collectible meat. */
export const ANIMAL_LIFESPAN_MS = 2 * 60 * 60 * 1000;
/** Energy for each pen expansion (+3 chickens and +4 cows each). */
export const PEN_EXPANSIONS = [140, 280] as const;
export const MAX_PEN_LEVEL = PEN_EXPANSIONS.length;
/**
 * Building the pen: at level 2, when chicks unlock, for 40 energy. That is 1.6 chicks: a real first step (more than a
 * chick, so the pen feels like a purchase) yet well under the first expansion (140), so a new player at level 2 has it
 * after a couple of harvests and the first hen follows soon after.
 */
export const PEN_BUILD = { level: 2, price: 40 } as const;

/**
 * Where the pen stands at home: north of the garden (behind it on screen), on open grass between the storage chest,
 * the well and the west trees, clear of the trails and the fence. hw/hd are the half width (x) and half depth (z) of
 * its sandy floor, which keeps garden beds off; the open side faces the garden (south).
 */
export const PEN = { x: -8.6, z: -5, hw: 3.4, hd: 2.2 } as const;
/**
 * The open farmyard the animals roam, like fish in a pond: an oval around the pen a little wider than its old fence
 * (rx/rz are the half axes, centred on PEN). Only a low fence behind it remains, so nothing hides the animals from the
 * camera; decorations keep out of it, and the animals step around beds and anything else standing in it.
 */
export const YARD = { rx: 4.3, rz: 2.9 } as const;
/** Whether a point lies inside the yard oval grown by `pad` metres. */
export function inYard(x: number, z: number, pad = 0) { return ((x - PEN.x) / (YARD.rx + pad)) ** 2 + ((z - PEN.z) / (YARD.rz + pad)) ** 2 < 1; }
/** Distance from a point to the pen's fence rectangle (0 inside). */
export function penDistance(x: number, z: number) { return Math.hypot(Math.max(0, Math.abs(x - PEN.x) - PEN.hw), Math.max(0, Math.abs(z - PEN.z) - PEN.hd)); }
/** Whether a square of half side `half` centred here keeps `margin` metres off the pen (a path around the fence). */
export function clearOfPen(x: number, z: number, half: number, margin = .5) {
  // North, the yard's back fence stands past the old fence line (farm-view BACK_FENCE_Z, plus its posts).
  const dz = z - PEN.z, depth = dz < 0 ? YARD.rz + .7 : PEN.hd;
  return Math.abs(x - PEN.x) >= PEN.hw + half + margin || Math.abs(dz) >= depth + half + margin;
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

export function emptyFarm(): FarmState { return { animals: [], nextId: 1, penLevel: 0, built: false }; }
/** Saves from before the farm have no `farm`: they start with an empty pen. */
export function farmOf(s: SaveState): FarmState { return (s.farm ??= emptyFarm()); }
export function penBuilt(s: SaveState) { return farmOf(s).built === true; }
export type BuildCheck = 'ok' | 'away' | 'level' | 'energy' | 'built';
export function canBuildPen(s: SaveState): BuildCheck {
  if (penBuilt(s)) return 'built';
  if (s.planet !== 'home') return 'away';
  if (s.level < PEN_BUILD.level) return 'level';
  return s.energy < PEN_BUILD.price ? 'energy' : 'ok';
}
/** Builds the pen on its marked plot: the yard, coop and troughs appear and animals can be bought. */
export function buildPen(s: SaveState) { if (canBuildPen(s) !== 'ok') return false; s.energy -= PEN_BUILD.price; farmOf(s).built = true; return true; }
// Leave room for timer additions; corrupt clocks cannot create rewards or consume feed.
const MAX_FARM_TIME = Number.MAX_SAFE_INTEGER - ANIMAL_LIFESPAN_MS - 120_000;
function validTime(value: unknown): value is number { return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= MAX_FARM_TIME; }
function arrival(a: Animal) { return a.acquiredAt ?? a.bornAt; }
function validAnimalTime(a: Animal, now: number) {
  return Object.hasOwn(ANIMALS, a.kind) && validTime(now) && validTime(arrival(a)) && now >= arrival(a) &&
    Number.isFinite(a.bornAt) && Math.abs(a.bornAt) <= MAX_FARM_TIME && validTime(a.cycleAt);
}
export function expiresAt(a: Animal) { return validTime(arrival(a)) ? arrival(a) + ANIMAL_LIFESPAN_MS : Infinity; }
export function expired(a: Animal, now = Date.now()) { return validTime(now) && now >= expiresAt(a); }
/** Milliseconds until meat is ready; arrival is independent of the feeding-adjusted growth timer. */
export function lifetimeLeft(a: Animal, now = Date.now()) { return validTime(now) ? Math.max(0, expiresAt(a) - now) : Infinity; }
export function productFor(a: Animal, now = Date.now()): ItemId { return expired(a, now) ? 'meat' : ANIMALS[a.kind].product; }
export function adultAt(a: Animal) { return a.bornAt + ANIMALS[a.kind].growMs; }
export function isAdult(a: Animal, now = Date.now()) { return validAnimalTime(a, now) && now >= adultAt(a); }
/** 0 → 1 while young. */
export function growth(a: Animal, now = Date.now()) { return validAnimalTime(a, now) ? Math.max(0, Math.min(1, (now - a.bornAt) / ANIMALS[a.kind].growMs)) : 0; }
/** 0 → 1 through the product cycle; expired animals have a waiting meat pickup. */
export function productProgress(a: Animal, now = Date.now()) {
  if (!validAnimalTime(a, now)) return 0;
  return expired(a, now) ? 1 : isAdult(a, now) ? Math.max(0, Math.min(1, (now - a.cycleAt) / ANIMALS[a.kind].productMs)) : 0;
}
export function productReady(a: Animal, now = Date.now()) { return productProgress(a, now) >= 1; }
/** Milliseconds until growth or production finishes; 0 while a product or meat pickup waits. */
export function timeLeft(a: Animal, now = Date.now()) {
  if (!validAnimalTime(a, now)) return Infinity;
  const next = isAdult(a, now) ? a.cycleAt + ANIMALS[a.kind].productMs - now : adultAt(a) - now;
  return expired(a, now) ? 0 : Math.max(0, next);
}
function capacity(kind: AnimalKind, level: number) {
  const d = ANIMALS[kind], safeLevel = Number.isFinite(level) ? Math.max(0, Math.min(MAX_PEN_LEVEL, Math.floor(level))) : 0;
  return Math.min(MAX_ANIMALS_PER_KIND, d.cap + safeLevel * d.capStep);
}
export function penCapacity(s: SaveState, kind: AnimalKind) { return capacity(kind, farmOf(s).penLevel); }
export function animalCount(s: SaveState, kind: AnimalKind) { return farmOf(s).animals.filter(a => a.kind === kind).length; }
export type BuyCheck = 'ok' | 'away' | 'unbuilt' | 'level' | 'full' | 'energy';
export function canBuyAnimal(s: SaveState, kind: AnimalKind): BuyCheck {
  const d = Object.hasOwn(ANIMALS, kind) ? ANIMALS[kind] : undefined;
  if (!d || s.planet !== 'home') return 'away';
  if (!penBuilt(s)) return 'unbuilt';
  if (s.level < d.level) return 'level';
  if (animalCount(s, kind) >= penCapacity(s, kind)) return 'full';
  return s.energy < d.price ? 'energy' : 'ok';
}
/** Buys a chick or a calf; it arrives young and grows up on its own. */
export function buyAnimal(s: SaveState, kind: AnimalKind, now = Date.now()): Animal | null {
  if (canBuyAnimal(s, kind) !== 'ok' || !validTime(now)) return null;
  const farm = farmOf(s);
  if (!Number.isSafeInteger(farm.nextId) || farm.nextId < 1 || farm.nextId >= Number.MAX_SAFE_INTEGER) return null;
  const a: Animal = { uid: farm.nextId++, kind, bornAt: now, acquiredAt: now, cycleAt: now + ANIMALS[kind].growMs, coat: coatPick(kind, farm.nextId - 1, now) };
  s.energy -= ANIMALS[kind].price; farm.animals.push(a); return a;
}
/** The crop the farm feeds by default: the cheapest one in the bag (ties by name), or null. */
export function feedCrop(s: SaveState): ItemId | null {
  const crops = Object.keys(s.bag).filter(id => Object.hasOwn(CROPS, id) && looseQuantity(s, id) > 0);
  crops.sort((a, b) => ITEMS[a].sell - ITEMS[b].sell || a.localeCompare(b));
  return crops[0] ?? null;
}
/** Whether this animal would take feed now: once while young, once per product cycle, never while a product waits. */
export function canFeed(a: Animal, now = Date.now()) { return validAnimalTime(a, now) && !expired(a, now) && (isAdult(a, now) ? !a.fed && !productReady(a, now) : !a.fedYoung); }
/** Feeds one crop to an animal; returns the crop used, or null (no such animal, already fed, nothing to feed). */
export function feedAnimal(s: SaveState, uid: number, now = Date.now(), raw?: ItemId): ItemId | null {
  const a = farmOf(s).animals.find(x => x.uid === uid), crop = raw ? canonicalItem(raw) : feedCrop(s);
  if (!a || !crop || !Object.hasOwn(CROPS, crop) || !Number.isFinite(now) || !canFeed(a, now) || looseQuantity(s, crop) < 1 || !removeItem(s.bag, crop)) return null;
  a.acquiredAt ??= a.bornAt; // Freeze the legacy arrival before feeding changes bornAt.
  const skip = timeLeft(a, now) * FEED_SHARE;
  if (isAdult(a, now)) { a.cycleAt -= skip; a.fed = true; }
  else { a.bornAt -= skip; a.cycleAt -= skip; a.fedYoung = true; }
  return crop;
}
/** Feeds every animal that would take feed while crops last; returns how many ate. */
export function feedAll(s: SaveState, now = Date.now()) { let fed = 0; for (const a of farmOf(s).animals) if (canFeed(a, now) && feedAnimal(s, a.uid, now)) fed++; return fed; }
export interface Collected { uid: number; kind: AnimalKind; item: ItemId }
/**
 * Collects waiting products or expired animals as meat, with XP. Meat is granted only on collection, then the
 * expired animal is removed. Failed inventory grants preserve it. Given UID order supports nearest-first collection.
 */
export function collectProducts(s: SaveState, now = Date.now(), uids?: readonly number[]): Collected[] {
  if (s.planet !== 'home' || !validTime(now)) return [];
  const animals = farmOf(s).animals, picked = new Set(uids ?? animals.map(a => a.uid));
  const out: Collected[] = [];
  for (const uid of picked) {
    const a = animals.find(animal => animal.uid === uid);
    if (!a || !productReady(a, now)) continue;
    const item = productFor(a, now);
    if (!addItem(s, item)) continue;
    if (expired(a, now)) {
      // Duplicate requested IDs or malformed in-memory copies can never grant the same animal twice.
      for (let index = animals.length - 1; index >= 0; index--) if (animals[index].uid === uid) animals.splice(index, 1);
    } else { a.cycleAt = now; a.fed = false; }
    gainXp(s, ANIMALS[a.kind].xp, now); out.push({ uid: a.uid, kind: a.kind, item });
  }
  return out;
}
export function readyAnimals(s: SaveState, now = Date.now()) { return farmOf(s).animals.filter(a => productReady(a, now)); }
export function penExpandCost(s: SaveState) { const level = farmOf(s).penLevel; return level < MAX_PEN_LEVEL ? PEN_EXPANSIONS[level] : null; }
/** Room for three more chickens and four more cows, up to ten of each. */
export function expandPen(s: SaveState) {
  const cost = penExpandCost(s);
  if (cost === null || s.planet !== 'home' || !penBuilt(s) || s.energy < cost) return false;
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
function count(value: unknown, fallback = 0) { return typeof value === 'number' && Number.isSafeInteger(Math.floor(value)) && value >= 0 ? Math.floor(value) : fallback; }
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
    if (!Object.hasOwn(ANIMALS, kind) || uid < 1 || uid >= Number.MAX_SAFE_INTEGER || seen.has(uid) ||
      typeof a.bornAt !== 'number' || !Number.isFinite(a.bornAt) || Math.abs(a.bornAt) > MAX_FARM_TIME) continue;
    if (room[kind] >= capacity(kind, farm.penLevel)) continue;
    const bornAt = a.bornAt, acquiredAt = a.acquiredAt === undefined ? bornAt : a.acquiredAt;
    if (!validTime(acquiredAt) || bornAt < acquiredAt - ANIMALS[kind].growMs || bornAt > acquiredAt) continue;
    const cycleAt = a.cycleAt === undefined ? bornAt + ANIMALS[kind].growMs : a.cycleAt;
    if (!validTime(cycleAt)) continue;
    seen.add(uid); room[kind]++;
    // Saves from before breeds get a stable coat from the animal's id (the same one on every load).
    const coat = coatOf({ kind, uid, coat: a.coat as number | undefined });
    farm.animals.push({ uid, kind, bornAt, acquiredAt, cycleAt, coat, ...(a.fedYoung === true ? { fedYoung: true } : {}), ...(a.fed === true ? { fed: true } : {}) });
  }
  // Saves from before building: a pen with animals or an expansion was already standing.
  farm.built = v.built === true || farm.animals.length > 0 || farm.penLevel > 0;
  farm.nextId = Math.max(count(v.nextId, 1), 1, ...farm.animals.map(a => a.uid + 1));
  return farm;
}
