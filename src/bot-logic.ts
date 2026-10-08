/**
 * The AI neighbours for solo play (bots.ts draws and runs them): who they are, how rich they look, what they give a new
 * friend, and how friendship and gifts are remembered. Everything here is plain data and functions (no three.js, no DOM), so
 * the tests can drive it. The cast comes from one saved seed, so the same neighbours turn up every visit.
 */
import type { AnimalKind } from './farm.ts';

export type Tier = 'rich' | 'average' | 'new';
export interface BotGear { hat?: string; outfit?: string; boots?: string; disguise?: string }
export interface BotDef {
  id: string; name: string; level: number; tier: Tier; color: string; gear: BotGear;
  /** Can fly (a superhero, an angel, a fairy or rocket boots): it crosses the sky now and then and swoops down to say hello. */
  flies: boolean;
  /** What its house holds (bots.ts builds the garden from this). */
  house: { plots: number; animals: AnimalKind[]; crops: string[]; decor: string[] };
  /** Pets that follow it: two for the rich ones (gear.pet is the first, bots.ts sends the second as an extra pet), none for the rest. */
  pets: string[];
  /** Rare things it can give a new friend, best first; the first one the player does not have yet is given. */
  gifts: string[];
}
export const BOT_ID_PREFIX = 'bot:';
export const isBotId = (id: string) => id.startsWith(BOT_ID_PREFIX);

const NAMES = ['Nova', 'Aria', 'Minh', 'Bao', 'Pip', 'Luna', 'Kai', 'Mai', 'Leo', 'Suri', 'Tam', 'Hana', 'Rio', 'Lan'];
const COLORS = ['#e0524a', '#4a90e2', '#f2a33a', '#58b368', '#a66ad6', '#ef7fa7', '#37b3b0', '#8d6e63'];
/** Outfits a rich neighbour might wear (rare disguises and wings), a middling one, and a newcomer. */
const RICH: Array<{ gear: BotGear; flies: boolean }> = [
  { gear: { disguise: 'dz_superhero' }, flies: true }, { gear: { disguise: 'dz_superhero' }, flies: true },
  { gear: { outfit: 'armor_angel', hat: 'hat_halo' }, flies: true }, { gear: { disguise: 'dz_fairy' }, flies: true },
  { gear: { outfit: 'armor_superhero', hat: 'crown', boots: 'boots_rocket' }, flies: true },
  { gear: { disguise: 'dz_knight' }, flies: false }, { gear: { disguise: 'dz_vampire' }, flies: false }, { gear: { disguise: 'dz_mage' }, flies: false },
];
const AVERAGE: BotGear[] = [{ outfit: 'armor_tux', hat: 'hat_cowboy' }, { outfit: 'armor_kimono', hat: 'hat_samurai' }, { outfit: 'armor_knight', hat: 'hat_viking' }, { outfit: 'armor_aodai', hat: 'hat_graduate' }, { outfit: 'armor_hawaii', hat: 'hat_party' }];
const NEWCOMER: BotGear[] = [{ outfit: 'armor_hoodie', hat: 'hat_straw' }, { outfit: 'armor_leather' }, { outfit: 'armor_chef', hat: 'hat_chef' }, { outfit: 'armor_hoodie', hat: 'hat_cat' }];
/** Gifts by tier. All of them are rare: wealthier neighbours give the best outfits. */
const GIFTS: Record<Tier, string[]> = {
  rich: ['dz_superhero', 'dz_fairy', 'dz_vampire', 'dz_snowman', 'dz_ninja', 'dz_mage', 'dz_knight', 'dz_dino', 'dz_pirate', 'dz_mecha', 'armor_superhero', 'armor_angel'],
  average: ['armor_angel', 'armor_superhero', 'hat_halo', 'boots_rocket', 'hat_bear', 'crown'],
  new: ['hat_bear', 'hat_halo', 'crown', 'boots_rocket'],
};
/** The rare things any neighbour may give when its own pool is already in the player's bag. */
export const SPARE_GIFTS = ['crown', 'hat_bear', 'hat_halo', 'boots_rocket', 'armor_angel', 'armor_superhero', 'dz_snowman', 'dz_fairy', 'dz_vampire', 'dz_ninja', 'dz_mage', 'dz_knight', 'dz_dino', 'dz_pirate', 'dz_mecha', 'dz_superhero'];
/** Last resort when the player already has every gift: a purse of energy. */
export const ENERGY_GIFT = 1500;

/** A small seeded random (mulberry32): the cast is the same for the same seed. */
export function seeded(seed: number) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const pick = <T,>(list: readonly T[], r: () => number) => list[Math.floor(r() * list.length)];
const ANIMALS_BY_TIER: Record<Tier, AnimalKind[][]> = {
  rich: [['cow', 'cow', 'pig', 'goat', 'goose', 'duck', 'chicken', 'chicken'], ['cow', 'goat', 'goat', 'goose', 'pig', 'chicken', 'duck', 'duck', 'cow']],
  average: [['chicken', 'chicken', 'duck', 'cow'], ['goat', 'chicken', 'pig']],
  new: [['chicken', 'chicken'], ['chicken']],
};
const CROPS_BY_TIER: Record<Tier, string[]> = { rich: ['apple', 'mango', 'grape', 'pumpkin', 'melon', 'rainbowrose'], average: ['carrot', 'pumpkin', 'berry', 'melon'], new: ['radish', 'carrot', 'mint'] };
const DECOR_BY_TIER: Record<Tier, string[]> = { rich: ['deco_fruittree', 'deco_statue', 'deco_trophy', 'deco_rainbow', 'deco_aquarium', 'deco_lamp'], average: ['deco_lamp', 'deco_table', 'deco_teddy'], new: ['deco_nest'] };

/** Two different pets for a rich neighbour, from their own random so the rest of the cast stays what it was. */
const PET_POOL = ['pet_dragon', 'pet_firefly', 'pet_parrot', 'pet_turtle', 'pet_sheep', 'bunny', 'pet_robot'];
function pickPets(seed: number, index: number) {
  const r = seeded((seed ^ 0x9e3779b9) + index * 7919), pool = [...PET_POOL], first = pool.splice(Math.floor(r() * pool.length), 1)[0];
  return [first, pool[Math.floor(r() * pool.length)]];
}
/** `count` neighbours from a seed: at least one rich one, the rest random (richer ones are rarer). */
export function makeCast(seed: number, count = 5): BotDef[] {
  const r = seeded(seed), names = [...NAMES];
  for (let i = names.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [names[i], names[j]] = [names[j], names[i]]; }
  const bots: BotDef[] = [];
  for (let i = 0; i < count; i++) {
    const roll = r(), tier: Tier = i === 0 ? 'rich' : roll < .25 ? 'rich' : roll < .7 ? 'average' : 'new';
    const look = tier === 'rich' ? pick(RICH, r) : { gear: pick(tier === 'average' ? AVERAGE : NEWCOMER, r), flies: false };
    const level = tier === 'rich' ? 24 + Math.floor(r() * 18) : tier === 'average' ? 9 + Math.floor(r() * 12) : 2 + Math.floor(r() * 6);
    const plots = tier === 'rich' ? 18 + Math.floor(r() * 6) : tier === 'average' ? 12 : 9;
    bots.push({
      id: `${BOT_ID_PREFIX}${i}`, name: names[i], level, tier, color: pick(COLORS, r), gear: look.gear, flies: look.flies,
      house: { plots, animals: pick(ANIMALS_BY_TIER[tier], r), crops: [...CROPS_BY_TIER[tier]], decor: DECOR_BY_TIER[tier].slice(0, tier === 'rich' ? 5 : tier === 'average' ? 3 : 1) },
      gifts: [...GIFTS[tier]], pets: tier === 'rich' ? pickPets(seed, i) : [],
    });
  }
  return bots;
}

// ---- Friendship and gifts, remembered in the browser ----
export interface GiftNote { item?: string; count: number; energy: number }
export interface BotStore {
  v: 1; seed: number;
  /** Bot id -> when the friendship began. */
  friends: Record<string, number>;
  /** A gift promised at the moment of friendship and not yet in the bag (so a reload or a failed grant never loses it). */
  pending: Record<string, GiftNote>;
  /** Items already given: never given twice. */
  given: string[];
  /** Bot id -> earliest time it may start a meeting again. */
  meetAfter: Record<string, number>;
  /** Bot id -> when a friend last handed over a present (at most one per PRESENT_GAP_MS). */
  daily: Record<string, number>;
}
export const newStore = (seed: number): BotStore => ({ v: 1, seed, friends: {}, pending: {}, given: [], meetAfter: {}, daily: {} });
const rec = (v: unknown): Record<string, unknown> => v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {};
const nums = (v: unknown) => Object.fromEntries(Object.entries(rec(v)).filter(([, x]) => typeof x === 'number' && Number.isFinite(x))) as Record<string, number>;
/** Reads a saved store defensively: anything unreadable gives a fresh one for a new seed. */
export function parseStore(raw: string | null, fallbackSeed: number): BotStore {
  try {
    const v = rec(JSON.parse(raw ?? 'null')), seed = typeof v.seed === 'number' && Number.isFinite(v.seed) ? v.seed >>> 0 : fallbackSeed;
    const pending: Record<string, GiftNote> = {};
    for (const [id, g] of Object.entries(rec(v.pending))) { const n = rec(g); if (typeof n.count === 'number' && typeof n.energy === 'number') pending[id] = { item: typeof n.item === 'string' ? n.item : undefined, count: Math.max(0, Math.min(99, n.count | 0)), energy: Math.max(0, Math.min(1e6, n.energy | 0)) }; }
    return { v: 1, seed, friends: nums(v.friends), pending, given: Array.isArray(v.given) ? v.given.filter((x): x is string => typeof x === 'string').slice(0, 200) : [], meetAfter: nums(v.meetAfter), daily: nums(v.daily) };
  } catch { return newStore(fallbackSeed); }
}
export const isFriend = (s: BotStore, id: string) => Object.hasOwn(s.friends, id);

/** The item a new friend gives: the first of its own pool the player lacks, then any spare rare one, else a purse of energy. */
export function chooseGift(bot: BotDef, store: BotStore, owns: (item: string) => boolean): GiftNote {
  const free = (id: string) => !owns(id) && !store.given.includes(id);
  const item = bot.gifts.find(free) ?? SPARE_GIFTS.find(free);
  return item ? { item, count: 1, energy: bot.tier === 'rich' ? 500 : 200 } : { count: 0, energy: ENERGY_GIFT };
}
/**
 * Makes the friendship and promises the gift in the same step, before anything else can go wrong: the gift stays in
 * `pending` (and in the saved store) until settleGift confirms it reached the bag. Befriending twice changes nothing.
 */
export function befriend(store: BotStore, bot: BotDef, now: number, owns: (item: string) => boolean): GiftNote | null {
  if (isFriend(store, bot.id)) return store.pending[bot.id] ?? null;
  store.friends[bot.id] = now; delete store.meetAfter[bot.id];
  const gift = chooseGift(bot, store, owns);
  if (gift.item) store.given.push(gift.item); // reserved now, so two friends never promise the same item
  store.pending[bot.id] = gift; return gift;
}
/** Marks the gift as delivered (or, when it could not be, puts the reservation back so another gift can be chosen). */
export function settleGift(store: BotStore, botId: string, delivered: boolean) {
  const gift = store.pending[botId]; if (!gift) return;
  if (delivered) { delete store.pending[botId]; return; }
  if (gift.item) store.given = store.given.filter(x => x !== gift.item);
}
export const MEET_PAUSE_MS = { declined: 8 * 60_000, greeted: 90_000, spoke: 3 * 60_000 };
export const canMeet = (s: BotStore, id: string, now: number) => (s.meetAfter[id] ?? 0) <= now;
/**
 * Meeting a friend gives a present about one time in five: mostly everyday things (a snack, seeds, a little energy), now and
 * then (1 time in 10) something rare. Each friend gives at most one present per PRESENT_GAP_MS (store.daily holds the last
 * one's time; bots.ts sets it when a present is handed over). A last time in the future (a changed clock) does not block.
 */
export const PRESENT_CHANCE = .2, RARE_PRESENT_CHANCE = .1, PRESENT_GAP_MS = 5 * 60_000;
export const givesPresent = (s: BotStore, id: string, rand: () => number, now = Date.now()) => {
  const last = s.daily[id];
  return isFriend(s, id) && !(last !== undefined && last <= now && now - last < PRESENT_GAP_MS) && rand() < PRESENT_CHANCE;
};
const EVERYDAY: Array<[string, number]> = [['carrot', 3], ['radish', 3], ['egg', 2], ['milk', 2], ['pumpkin', 1], ['mint', 2], ['berry', 2], ['leather', 1], ['coral', 1], ['meat', 1]];
/** The present for this meeting (what the player has is no reason to skip: everyday things stack). */
export function choosePresent(store: BotStore, owns: (item: string) => boolean, rand: () => number): GiftNote {
  if (rand() < RARE_PRESENT_CHANCE) { const item = SPARE_GIFTS.find(id => !owns(id) && !store.given.includes(id)); if (item) return { item, count: 1, energy: 0 }; }
  const [item, count] = EVERYDAY[Math.floor(rand() * EVERYDAY.length)];
  return rand() < .5 ? { item, count, energy: 0 } : { count: 0, energy: 80 + Math.floor(rand() * 5) * 40 };
}

// ---- Walking ----
export interface Walker { x: number; z: number; facing: number; goalX: number; goalZ: number; wait: number; speed: number }
export interface WalkCtx { blocked: (x: number, z: number) => boolean; rand: () => number; radius: number; centre: { x: number; z: number } }
/** Turns a heading toward a target at most `rate` radians. */
export function turn(from: number, to: number, rate: number) {
  let d = ((to - from + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
  d = Math.max(-rate, Math.min(rate, d)); return from + d;
}
/** Picks a free spot inside the walking disc (a few tries; otherwise stays put). */
export function pickGoal(w: Walker, ctx: WalkCtx) {
  for (let i = 0; i < 12; i++) {
    const a = ctx.rand() * Math.PI * 2, d = 3 + Math.sqrt(ctx.rand()) * ctx.radius, x = ctx.centre.x + Math.cos(a) * d, z = ctx.centre.z + Math.sin(a) * d;
    if (!ctx.blocked(x, z)) { w.goalX = x; w.goalZ = z; return true; }
  }
  w.goalX = w.x; w.goalZ = w.z; return false;
}
/** One step toward the goal at `speed` metres a second; blocked steps slide or stop and choose a new goal. Returns true while moving. */
export function walk(w: Walker, dt: number, ctx: WalkCtx, flying = false) {
  const dx = w.goalX - w.x, dz = w.goalZ - w.z, dist = Math.hypot(dx, dz);
  if (dist < .25) return false;
  w.facing = turn(w.facing, Math.atan2(dx, dz), dt * 6);
  const step = Math.min(dist, w.speed * dt);
  // Straight on when free; otherwise slide round the obstacle by turning up to ~80 degrees either way (no path finding needed for a tree or a fence post).
  for (const off of flying ? [0] : [0, .7, -.7, 1.4, -1.4]) {
    const heading = w.facing + off, nx = w.x + Math.sin(heading) * step, nz = w.z + Math.cos(heading) * step;
    if (flying || !ctx.blocked(nx, nz)) { w.x = nx; w.z = nz; w.facing = heading; return true; }
  }
  w.wait = 0; pickGoal(w, ctx); return false;
}

// ---- Where they live: the common area beyond the four gates ----
/** The safe zone around the cottage ends here; the four gates stand on it (world.ts). */
export const SAFE_RADIUS = 18;
export interface Zone { id: string; x: number; z: number; /** The gate on the way in, on the safe zone's edge. */ gate: { x: number; z: number } }
export const ZONES: readonly Zone[] = [
  { id: 'forest', x: -30, z: 0, gate: { x: -SAFE_RADIUS, z: 0 } }, { id: 'meadow', x: 0, z: 30, gate: { x: 0, z: SAFE_RADIUS } },
  { id: 'swamp', x: 0, z: -30, gate: { x: 0, z: -SAFE_RADIUS } }, { id: 'canyon', x: 30, z: 0, gate: { x: SAFE_RADIUS, z: 0 } },
];
/** How far from its zone's middle a neighbour wanders: the nearest edge is still 21 m from the cottage, outside the safe zone. */
export const ZONE_RADIUS = 9;
export const zoneOf = (def: Pick<BotDef, 'id'>) => ZONES[(Number(def.id.slice(BOT_ID_PREFIX.length)) || 0) % ZONES.length];
export const inSafeZone = (x: number, z: number) => Math.hypot(x, z) < SAFE_RADIUS;
/** The way through a gate: a point just outside it and one just inside (`out` first when leaving, in first when arriving). */
export function gateRoute(zone: Zone, inward: boolean) {
  const k = 1 / SAFE_RADIUS, ux = zone.gate.x * k, uz = zone.gate.z * k, outside = { x: ux * (SAFE_RADIUS + 3.5), z: uz * (SAFE_RADIUS + 3.5) }, inside = { x: ux * (SAFE_RADIUS - 4), z: uz * (SAFE_RADIUS - 4) };
  return inward ? [outside, inside] : [inside, outside];
}
export interface Foe { id: string; x: number; z: number; hp: number; boss?: boolean }
/** The nearest living enemy near the neighbour and its hunting ground: ordinary ones, or (bosses = true) only bosses, which they test briefly and then leave to the player. */
export function pickFoe(foes: readonly Foe[], at: { x: number; z: number }, zone: Zone, reach = 18, bosses = false): Foe | null {
  let best: Foe | null = null, bestD = Infinity;
  for (const f of foes) {
    if (f.hp <= 0 || !!f.boss !== bosses || !Number.isFinite(f.x) || !Number.isFinite(f.z) || inSafeZone(f.x, f.z) || Math.hypot(f.x - zone.x, f.z - zone.z) > ZONE_RADIUS + 14) continue;
    const d = Math.hypot(f.x - at.x, f.z - at.z); if (d < reach && d < bestD) { best = f; bestD = d; }
  }
  return best;
}
/** A neighbour's blow: gentle, so the fights last and the player still has enemies to beat. */
export const attackDamage = (level: number) => 4 + Math.round(level * .6);
/** How long a neighbour dares to fight a boss (seconds) and how long it keeps away from bosses afterwards. */
export const bossDare = (rand: () => number) => 5 + rand() * 5, BOSS_SHY = 150;
/** A friend plans its next trip into the player's safe zone 6 to 12 minutes ahead and stays only 20 to 40 seconds: they are busy fighting. */
export const nextVisitIn = (rand: () => number) => 360 + rand() * 360;
export const visitStay = (rand: () => number) => 20 + rand() * 20;
/** Out hunting 2 to 4 minutes, then a rest at its own safe zone (out of sight) for about as long: half the time they are away. */
export const huntFor = (rand: () => number) => 120 + rand() * 120;
export const restFor = (rand: () => number) => 100 + rand() * 140;

/** The daily Colossus's arena while neighbours may help (colossus.ts through the game bridge). */
export interface RallyPoint { id: string; x: number; z: number; r: number }
/** Where neighbour number `i` stands round the Colossus: a ring just outside its body, spread by the golden angle. */
export function rallySpot(r: RallyPoint, i: number) { const a = i * 2.399 + .6, d = r.r + 3 + (i % 3) * 1.5; return { x: r.x + Math.cos(a) * d, z: r.z + Math.sin(a) * d }; }

/**
 * Quiet during fights: neighbours do not interrupt the player in about three fights out of four. While the player is in
 * a fight (a creature within FIGHT_RANGE m is after them, the player lost health, the target they picked is hurt, or the
 * boss bar shows) and for FIGHT_MEMORY s after the last such sign, a meeting may only start when a FIGHT_PASS_CHANCE
 * roll passes; a meeting already under way when the fight starts rolls once too, and waits for the fight to end if it fails.
 */
export const FIGHT_MEMORY = 8, FIGHT_PASS_CHANCE = .25, FIGHT_RANGE = 14;
export interface FightFoe { id: string; x: number; z: number; hp: number; maxHp: number; phase?: string }
export interface FightSense { playerHp: number; px: number; pz: number; enemies: readonly FightFoe[]; selectedId?: string | null; bossBar?: boolean }
/** A creature chasing or striking (hud-combat's aggro: any phase but idle and return). */
const chasing = (e: FightFoe) => !!e.phase && e.phase !== 'idle' && e.phase !== 'return';
export class FightWatch {
  private hp = NaN; private lastAt = -Infinity;
  /** Feeds one frame's signs at clock time `clock` (s) and says whether the player counts as fighting. */
  update(clock: number, s: FightSense) {
    const hurt = Number.isFinite(this.hp) && s.playerHp < this.hp - .01; this.hp = s.playerHp;
    const sign = hurt || !!s.bossBar || s.enemies.some(e => e.hp > 0 && (chasing(e) && Math.hypot(e.x - s.px, e.z - s.pz) < FIGHT_RANGE
      || e.id === s.selectedId && e.hp < e.maxHp && Math.hypot(e.x - s.px, e.z - s.pz) < FIGHT_RANGE + 8));
    if (sign) this.lastAt = clock;
    return this.fighting(clock);
  }
  fighting(clock: number) { return clock - this.lastAt < FIGHT_MEMORY; }
  reset() { this.hp = NaN; this.lastAt = -Infinity; }
}
/** One roll per meeting attempt during a fight: true about one time in four. */
export const fightPass = (rand: () => number) => rand() < FIGHT_PASS_CHANCE;
/** The creature the player is fighting: the picked target, else the nearest one chasing within FIGHT_RANGE m. */
export function fightTarget(s: FightSense) {
  const picked = s.enemies.find(e => e.id === s.selectedId && e.hp > 0); if (picked) return picked;
  let best: FightFoe | null = null, bestD = FIGHT_RANGE;
  for (const e of s.enemies) if (e.hp > 0 && chasing(e)) { const d = Math.hypot(e.x - s.px, e.z - s.pz); if (d < bestD) { best = e; bestD = d; } }
  return best;
}
/** True when a speech bubble anchored at its bottom centre (bx, by) would cover the screen point (tx, ty) of the target. */
export const bubbleCovers = (bx: number, by: number, tx: number, ty: number) => Math.abs(tx - bx) < 150 && ty > by - 90 && ty < by + 60;
