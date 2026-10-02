import { ITEMS, CROPS, PLANETS, RECIPES, DISGUISES, FISH, FISH_WEIGHTS, LOOT_TABLES, UPGRADES, STARTING_PLOTS, MAX_EXTRA_PLOTS, MAX_DECORATIONS, STORY_STEPS, canonicalItem, type ItemId, type Inventory, type GearSlot, type CropId, type PlanetId, type BuffKey, type BuffDef, type WeaponDef } from './content.ts';
import { createProgression, normalizeProgression, recordEvent, progressEntries, claimProgress, type ProgressionState } from './progression.ts';
import { parseHelper, type HelperState } from './helper-state.ts';
import { parseFriends, parseBosses, noteBossDefeat, type Friend } from './friends-state.ts';
import { parseLooks, type Looks } from './looks.ts';
import { clearOfPen, inYard, emptyFarm, parseFarm, type FarmState } from './farm.ts';
import { forgeLevel, parseForge } from './weapon-forge.ts';
import { LEGACY_CROP_IDS } from './content.ts';
import { parseHunting, type HuntingState } from './fish-hunting.ts';
export * from './weapon-forge.ts';
export * from './content.ts';
export * from './farm.ts';
export * from './helper-state.ts';
export * from './friends-state.ts';
export { recordEvent, progressEntries, claimProgress, type ProgressKind, type ProgressEntry } from './progression.ts';
export interface Plot {
    crop: CropId | null;
    plantedAt: number;
    x?: number;
    z?: number;
    /** Turn about the vertical axis in 45° steps (reference placement); missing in older saves = 0. */
    rotation?: number;
    /** Snapshot at planting: content updates cannot lengthen a crop already growing. */
    growDuration?: number;
    /** Changes on every planting so delayed harvest/theft requests cannot target a replacement crop. */
    generation?: string;
}
export interface Decoration {
    uid: string;
    id: string;
    x: number;
    z: number;
    rotation: number;
}
export interface WorldRewards {
    mineReadyAt: Partial<Record<PlanetId, number[]>>;
    collectedGifts: Partial<Record<PlanetId, number[]>>;
    giftReadyAt: Partial<Record<PlanetId, number[]>>;
    resourceReadyAt: Record<string, number>;
    lava: {
        gateOpen: boolean;
        braziers: number[];
        caveChestDay?: string;
    };
}
export type Counters = {
    harvests: number;
    sold: number;
    bought: number;
    equipped: number;
    kills: number;
    upgrades: number;
    fish: number;
    skills: number;
};
export interface SaveState {
    version: 1;
    contentVersion: 3;
    name: string;
    color: string;
    level: number;
    xp: number;
    hp: number;
    energy: number;
    bag: Inventory;
    chest: Inventory;
    gear: Partial<Record<GearSlot, ItemId>>;
    plots: Plot[];
    counters: Counters;
    quest: number;
    healthUp: number;
    attackUp: number;
    defenseUp: number;
    critUp: number;
    planet: PlanetId;
    visited: PlanetId[];
    /** Planets spotted from the starship; only these show their names on the star map. */
    discovered: PlanetId[];
    settings: {
        sound: boolean;
        lowGraphics: boolean;
        /** The on-screen movement pad; off by default because the reference is tap-to-move only. */
        movePad?: boolean;
        joystickSide?: 'left'|'right';
        /** "Place new beds myself": a bought bed opens the see-through placement instead of going down automatically. */
        placeBeds?: boolean;
    };
    worldRewards: WorldRewards;
    buffs: Partial<Record<BuffKey, {
        value: number;
        expiresAt: number;
        source: string;
    }>>;
    sizeEffect: {
        scale: number;
        expiresAt: number;
    } | null;
    decorations: Decoration[];
    nextDecorationId: number;
    collection: Record<string, number>;
    fishRecords: Record<string, number>;
    progression: ProgressionState;
    dropped: {
        x: number;
        z: number;
        planet: PlanetId;
        items: Inventory;
    } | null;
    savedAt: number;
    /** The animal pen (farm.ts); older saves get an empty one. */
    farm: FarmState;
    /** Bed layout version (GARDEN_LAYOUT); saves without it are moved to the smaller beds by shrinkGarden. */
    gardenLayout?: number;
    /** The garden helper (helper.ts); older saves have none and parse as not owned. */
    helper?: HelperState;
    forge?: Record<string, number>;
    nextPlantId?: number;
    /** Harpoon cooldowns and individual pond restock deadlines survive reloads. */
    hunting?: HuntingState;
    /** Rescued friends (friends.ts); missing in older saves = nobody rescued. */
    friends?: Friend[];
    /** Bosses defeated at least once, as planet:type: they unlock the prisoners' cages for good (a respawn never re-locks one). */
    bosses?: string[];
    /** Explorer body styles bought at the mirror (looks.ts); missing in older saves = the default look only. */
    looks?: Looks;
}
export const COLORS = ['#4aa8ff', '#ff7ab0', '#6fd35a', '#ffb13d', '#a07bff', '#ff5a5a'];
export const SAVE_KEY = 'cute-game-save-v1';
export function newGame(name = 'Clover', color = COLORS[0]): SaveState { return { version: 1, contentVersion: 3, forge: {}, nextPlantId: 0, name: name.slice(0, 20) || 'Clover', color, level: 1, xp: 0, hp: 100, energy: 0, bag: {}, chest: {}, gear: {}, plots: Array.from({ length: STARTING_PLOTS }, (_, i) => ({ crop: null, plantedAt: 0, ...defaultBed(i) })), gardenLayout: GARDEN_LAYOUT, farm: emptyFarm(), counters: { harvests: 0, sold: 0, bought: 0, equipped: 0, kills: 0, upgrades: 0, fish: 0, skills: 0 }, quest: 0, healthUp: 0, attackUp: 0, defenseUp: 0, critUp: 0, planet: 'home', visited: ['home'], discovered: ['home'], settings: { sound: true, lowGraphics: false }, worldRewards: { mineReadyAt: {}, collectedGifts: {}, giftReadyAt: {}, resourceReadyAt: {}, lava: { gateOpen: false, braziers: [] } }, buffs: {}, sizeEffect: null, decorations: [], nextDecorationId: 1, collection: {}, fishRecords: {}, progression: createProgression(), dropped: null, savedAt: Date.now() }; }
export function xpNeeded(level: number) { return Math.round(25 * Math.pow(Math.max(1, level), 1.55)); }
function equipped(s: SaveState) { return Object.values(s.gear).map(id => ITEMS[id]).filter(Boolean); }
function equipmentStat(s: SaveState, key: string) { return equipped(s).reduce((sum, item) => sum + ((item.stats as Record<string, number> | undefined)?.[key] || 0), 0); }
function effect(s: SaveState, key: BuffKey, now = Date.now()) { const buff = s.buffs[key]; return buff && buff.expiresAt > now ? buff.value : 0; }
export function maxHp(s: SaveState) { return 100 + (s.level - 1) * 10 + s.healthUp * 25 + equipmentStat(s, 'hp'); }
export function attack(s: SaveState, now = Date.now()) { return (10 + (s.level - 1) * 1.5 + s.attackUp * 3 + equipmentStat(s, 'atk')) * (1 + (s.gear.weapon ? forgeLevel(s, s.gear.weapon) / 100 : 0)) * (1 + effect(s, 'atk', now)); }
export function defense(s: SaveState, now = Date.now()) { return s.defenseUp * 4 + (s.level - 1) + equipmentStat(s, 'def') + effect(s, 'def', now); }
export function activeStats(s: SaveState, now = Date.now()) {
    const gear = equipped(s), dz = s.gear.disguise ? DISGUISES[s.gear.disguise] : undefined;
    return { attack: attack(s, now), defense: defense(s, now), maxHp: maxHp(s), speed: 6 * Math.max(.2, 1 + equipmentStat(s, 'speed') + effect(s, 'speed', now)), critChance: Math.min(.85, .05 + s.critUp * .025 + equipmentStat(s, 'crit') + effect(s, 'crit', now)), critDamage: 2, haste: effect(s, 'haste', now), regen: equipmentStat(s, 'regen') + effect(s, 'regen', now), xp: effect(s, 'xp', now) + gear.reduce((n, i) => n + (i.xp || 0), 0), magnet: effect(s, 'magnet', now) ? 3 : 1, luck: effect(s, 'luck', now) + gear.reduce((n, i) => n + (i.luck || 0), 0), light: effect(s, 'light', now) > 0 || gear.some(i => i.light) || s.planet === 'lava' && (s.bag.fcrystal || 0) > 0, fireResistance: Math.min(1, effect(s, 'fireres', now)), lifesteal: (dz?.lifesteal || 0) + effect(s, 'lifesteal', now), lavaproof: gear.some(i => i.lavaproof), antidote: gear.some(i => i.antidote), poisonImmune: gear.some(i => i.antidote), flippers: s.gear.boots === 'boots_flipper', featherFall: gear.some(i => (i as any).featherfall), flying: false, sizeScale: s.sizeEffect && s.sizeEffect.expiresAt > now ? s.sizeEffect.scale : 1 };
}
export function weaponStats(s: SaveState): WeaponDef {
    const weapon = (s.gear.disguise && DISGUISES[s.gear.disguise]?.weapon) || (s.gear.weapon && ITEMS[s.gear.weapon]?.weapon);
    return { kind: 'fist', range: 1, cd: .5, special: 'fist', ...(weapon || {}) };
}
export function activeBuffs(s: SaveState, now = Date.now()) { return Object.entries(s.buffs).filter(([, b]) => b && b.expiresAt > now).map(([id, b]) => ({ id, name: ({ atk: 'Attack', def: 'Defense', haste: 'Attack speed', regen: 'Regeneration', speed: 'Movement speed', crit: 'Critical chance', xp: 'Experience', magnet: 'Loot magnet', luck: 'Luck', light: 'Light', fireres: 'Fire resistance', lifesteal: 'Life steal' } as Record<string, string>)[id], icon: ITEMS[b!.source]?.icon || '✨', remaining: (b!.expiresAt - now) / 1000, description: `${ITEMS[b!.source]?.name || 'Effect'} · ${b!.value}` })); }
export function addBuff(s: SaveState, buff: BuffDef, source = 'effect', now = Date.now()) {
    if (!Number.isFinite(buff.time) || buff.time <= 0)
        return;
    for (const key of ['atk', 'def', 'haste', 'regen', 'speed', 'crit', 'xp', 'magnet', 'luck', 'light', 'fireres', 'lifesteal'] as BuffKey[]) {
        const value = buff[key];
        if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0)
            continue;
        const old = s.buffs[key], remaining = Math.max(0, (old?.expiresAt || 0) - now) / 1000;
        s.buffs[key] = { value: Math.max(value, remaining ? old!.value : 0), expiresAt: now + Math.min(600, buff.time + remaining * .5) * 1000, source };
    }
}
export function tickEffects(s: SaveState, dt: number, now = Date.now()) { if (!Number.isFinite(dt) || dt < 0)
    return; for (const key of Object.keys(s.buffs) as BuffKey[])
    if (s.buffs[key]!.expiresAt <= now)
        delete s.buffs[key]; s.hp = Math.min(maxHp(s), s.hp + activeStats(s, now).regen * Math.min(dt, 1)); }
export function addItem(s: SaveState, raw: ItemId, count = 1) { const id = canonicalItem(raw); if (!Object.hasOwn(ITEMS, id) || !Number.isSafeInteger(count) || count < 1)
    return false; const next = (s.bag[id] || 0) + count; if (!Number.isSafeInteger(next))
    return false; s.bag[id] = next; s.collection[id] = 1; return true; }
/** A reward bundle is one grant: never consume its source after receiving only some items. */
function addItems(s: SaveState, items: Inventory) {
    const next = { ...s, bag: { ...s.bag }, collection: { ...s.collection } };
    for (const [id, count] of Object.entries(items)) if (!addItem(next, id, count)) return false;
    s.bag = next.bag; s.collection = next.collection; return true;
}
const validRoll = (value: number) => Number.isFinite(value) && value >= 0 && value < 1;
export function removeItem(inv: Inventory, raw: ItemId, count = 1) { const id = canonicalItem(raw); if (!Object.hasOwn(ITEMS, id) || !Number.isSafeInteger(count) || count < 1 || (inv[id] || 0) < count)
    return false; inv[id]! -= count; if (!inv[id])
    delete inv[id]; return true; }
export function gainXp(s: SaveState, amount: number, now = Date.now()): number { if (!Number.isFinite(amount) || amount <= 0)
    return 0; const before = s.level; const gained = amount * (1 + activeStats(s, now).xp); if (!Number.isFinite(gained))
    return 0; if (!Number.isFinite(s.xp + gained))
    return 0; s.xp += gained; let guard = 0; while (s.xp >= xpNeeded(s.level) && guard++ < 10000) {
    s.xp -= xpNeeded(s.level);
    s.level++;
    s.hp = maxHp(s);
} return s.level - before; }
export function plant(s: SaveState, index: number, raw: CropId, now = Date.now()) { const crop = canonicalItem(raw), p = s.plots[index], def = Object.hasOwn(CROPS, crop) ? CROPS[crop] : undefined; if (!p || p.crop || !def || def.level > s.level || !Number.isFinite(now) || now < 0)
    return false; if (def.seed && !removeItem(s.bag, def.seed))
    return false; p.crop = crop; p.plantedAt = now; p.growDuration = def.duration; s.nextPlantId = (s.nextPlantId || 0) + 1; p.generation = `${now}-${s.nextPlantId}`; return true; }
export function plantAll(s: SaveState, crop: CropId, now = Date.now()) { let count = 0; s.plots.forEach((_, i) => { if (plant(s, i, crop, now))
    count++; }); return count; }
export function cropDuration(p: Plot) { const def = p.crop && Object.hasOwn(CROPS, p.crop) ? CROPS[p.crop] : undefined; return def ? (Number.isFinite(p.growDuration) && p.growDuration! > 0 ? p.growDuration! : def.duration) : 0; }
export function cropProgress(p: Plot, now = Date.now()) { const duration = cropDuration(p); return duration ? Math.max(0, Math.min(1, (now - p.plantedAt) / duration)) : 0; }
export function harvest(s: SaveState, index: number, now = Date.now()): CropId | null { const p = s.plots[index]; if (!Number.isFinite(now) || now < 0 || !p?.crop || !(cropProgress(p, now) >= 1))
    return null; const id = p.crop; if (!addItem(s, id))
    return null; p.crop = null; p.plantedAt = 0; delete p.growDuration; delete p.generation; gainXp(s, CROPS[id].xp, now); recordEvent(s, 'harvest', 1, id, now); return id; }
export function harvestAll(s: SaveState, now = Date.now()) { const harvested: CropId[] = []; s.plots.forEach((_, i) => { const id = harvest(s, i, now); if (id)
    harvested.push(id); }); return harvested; }
export function fertilize(s: SaveState, index: number, timeOrItem: number | string = Date.now(), raw = 'spore') {
    const now = typeof timeOrItem === 'number' ? timeOrItem : Date.now();
    const id = canonicalItem(typeof timeOrItem === 'string' ? timeOrItem : raw);
    const plot = s.plots[index];
    const crop = plot?.crop && Object.hasOwn(CROPS, plot.crop) ? CROPS[plot.crop] : undefined;
    const grow = Object.hasOwn(ITEMS, id) ? ITEMS[id].grow : undefined;
    if (!crop || !grow || !Number.isFinite(grow) || grow <= 0 ||
        !Number.isFinite(now) || now < 0 || now > Number.MAX_SAFE_INTEGER ||
        !Number.isFinite(plot.plantedAt) || Math.abs(plot.plantedAt) > Number.MAX_SAFE_INTEGER || plot.plantedAt > now ||
        !Number.isFinite(crop.duration) || crop.duration <= 0)
        return false;
    const duration = cropDuration(plot), elapsed = Math.max(0, now - plot.plantedAt);
    if (elapsed >= duration || !removeItem(s.bag, id))
        return false;
    // Each dose advances a fixed share of the original timer; excess never carries into the next crop.
    plot.plantedAt = now - Math.min(duration, elapsed + duration * grow);
    return true;
}
/**
 * Ground at home that a garden bed must stay off (G2D-4), matching World.build: the cottage, stalls, chest, crystal,
 * starship pad, workshop, kitchen, well, village trees (crown, not just trunk), the fence-side bushes and the pond.
 * The animal pen (farm.ts PEN) is checked as a rectangle in bedClear.
 */
export const HOME_CLEARANCE: readonly { x: number; z: number; r: number }[] = [
    { x: 0, z: -8, r: 3.2 }, { x: 9, z: 2.5, r: 2 }, { x: 9.6, z: 10.6, r: 2 }, { x: -3.3, z: -4.9, r: 1 }, { x: 8.5, z: -7, r: 1.5 },
    { x: 13.5, z: -3, r: 2 }, { x: 5.5, z: 6.5, r: 1.3 }, { x: 1, z: 10.5, r: 1.4 }, { x: -7, z: -11, r: 1.4 }, { x: -7.5, z: 11.2, r: 3.6 },
    ...[[-13, -8], [-14, 7], [3, -13], [10, -11], [14, 5], [-2, 15]].map(([x, z]) => ({ x, z, r: 1.2 })),
    ...Array.from({ length: 16 }, (_, i) => { const a = (i + .5) / 16 * Math.PI * 2; return { x: Math.cos(a) * 16.4, z: Math.sin(a) * 16.4, r: .8 }; }),
];
/**
 * Beds are drawn at 80 % (BED_SCALE shrinks the bed model, its pick shape and the crops). Layout 3 thinned the frame
 * (7 cm planks, 10 cm posts instead of 15/22 cm) around the same 1.8 m soil square, so a frame is 1.94 m in model units,
 * 1.55 m in the world (half side BED_HALF .78), on a 1.64 m grid (BED_STEP; was 1.8 m around 1.7 m frames): the same
 * ~8-10 cm path between frames, (1.8 / 1.64)^2 = 1.20 times the beds per area. Two square beds stand at least BED_GAP
 * (2 x BED_HALF + 2 cm) apart along an axis. TRAIL_HALF is the stepping-stone trails' half-width and
 * BED_REACH the farthest a bed corner may reach from the village centre.
 */
export const BED_SCALE = .8, BED_HALF = .78, BED_STEP = 1.64, BED_GAP = 1.58, TRAIL_HALF = .55, BED_REACH = 17.4;
/** Crops shrink less than their beds: the updated 50 px mature silhouette stays about 44 px tall on a phone. */
export const CROP_SCALE = .88;
/**
 * Where starting bed `i` sits: a 3 x 3 block on the garden grid around GARDEN_CENTRE. Its south row stands just off
 * the west stepping-stone trail (z >= BED_HALF + TRAIL_HALF); the thick layout-2 block reached over it.
 */
export function defaultBed(i: number) { return { x: +(GARDEN_CENTRE.x + (i % 3 - 1) * BED_STEP).toFixed(2), z: +(GARDEN_CENTRE.z + (Math.floor(i / 3) - 1) * BED_STEP).toFixed(2) }; }
/** The starting grid of layout 2 (thick frames): 1.8 m apart from (-10.95, 0.05). */
export function layout2Bed(i: number) { return { x: +(-10.95 + (i % 3) * 1.8).toFixed(2), z: +(.05 + Math.floor(i / 3) * 1.8).toFixed(2) }; }
/** The starting grid of saves made before the beds shrank: 2.25 m apart from (-11.4, -0.4). */
export function legacyBed(i: number) { return { x: -11.4 + (i % 3) * 2.25, z: -.4 + Math.floor(i / 3) * 2.25 }; }
/** Saves on the current bed layout carry this; older ones are migrated by shrinkGarden. */
export const GARDEN_LAYOUT = 3;
/** Reach of a bed from its centre along the axes: 0.78 m square on, 1.1 m when turned 45°. */
const bedSpan = (rotation = 0) => BED_HALF * (Math.abs(Math.cos(rotation)) + Math.abs(Math.sin(rotation)));
/**
 * Whether a bed centred here keeps off the home obstacles, the animal pen (with a path around it), the four trails
 * along the axes and the fence. A turned bed is checked by the square that holds it.
 */
export function bedClear(x: number, z: number, rotation = 0) {
    const half = Number.isFinite(rotation) ? bedSpan(rotation) : NaN;
    if (!Number.isFinite(x) || !Number.isFinite(z) || !(Math.hypot(Math.abs(x) + half, Math.abs(z) + half) <= BED_REACH)) return false;
    if (Math.abs(x) < half + TRAIL_HALF || Math.abs(z) < half + TRAIL_HALF || !clearOfPen(x, z, half)) return false;
    return HOME_CLEARANCE.every(o => Math.hypot(Math.max(0, Math.abs(o.x - x) - half), Math.max(0, Math.abs(o.z - z) - half)) >= o.r);
}
/** Whether two beds' bounding squares keep apart (2 cm between square frames; a turned bed's square is larger). */
function bedsApart(ax: number, az: number, ar: number, bx: number, bz: number, br: number) { return Math.max(Math.abs(ax - bx), Math.abs(az - bz)) >= Math.max(BED_GAP, bedSpan(ar) + bedSpan(br) + .02); }
type BedSpot = { x: number; z: number; rotation?: number };
const bedSpots = (s: SaveState): BedSpot[] => s.plots.map((p, i) => ({ ...bedPosition(s, i), rotation: p.rotation ?? 0 }));
/** Centre of the starting garden; new beds grow outward from it on the BED_STEP garden grid. */
export const GARDEN_CENTRE = { x: -9.15, z: 2.99 };
const BED_GRID = Array.from({ length: 19 * 19 }, (_, i) => ({ x: +(GARDEN_CENTRE.x + (i % 19 - 9) * BED_STEP).toFixed(2), z: +(GARDEN_CENTRE.z + (Math.floor(i / 19) - 9) * BED_STEP).toFixed(2) }))
    .sort((a, b) => Math.hypot(a.x - GARDEN_CENTRE.x, a.z - GARDEN_CENTRE.z) - Math.hypot(b.x - GARDEN_CENTRE.x, b.z - GARDEN_CENTRE.z) || a.z - b.z || a.x - b.x);
/** The free grid spot nearest the garden for a new square bed, given the beds already standing, or null. */
function freeBedSpot(s: SaveState, beds: readonly BedSpot[]) { return BED_GRID.find(p => bedClear(p.x, p.z) && bedRoom(s, p.x, p.z, 0, beds)) ?? null; }
/** Moves saved beds that sit on an obstacle or on an earlier bed (older saves placed them blindly) to free ground. */
export function settleBeds(s: SaveState) {
    let moved = 0;
    s.plots.forEach((p, i) => {
        const { x, z } = bedPosition(s, i), r = p.rotation ?? 0;
        const crowded = s.plots.slice(0, i).some((q, j) => { const b = bedPosition(s, j); return !bedsApart(x, z, r, b.x, b.z, q.rotation ?? 0); });
        // The nine starting beds are laid out by hand; only check them against each other.
        if (!crowded && (i < STARTING_PLOTS || bedClear(x, z, r))) return;
        const spot = freeBedSpot(s, bedSpots(s).slice(0, i)); if (!spot) return;
        p.x = spot.x; p.z = spot.z; delete p.rotation; moved++;
    });
    return moved;
}
/**
 * Saves on an older bed layout (none: 2.25 m grid; 2: 1.8 m grid with thick frames): starting beds still on their
 * old spots move to the current grid, and extra beds the game placed itself (unturned, on the old grid) are packed in again nearest the garden,
 * around the beds the player placed by hand, which keep their spots. settleBeds then clears any overlap that is left
 * (a hand-placed bed on the new pen, say). Crops and timers stay with their beds.
 */
export function shrinkGarden(s: SaveState, from = 1) {
    const [ox, oz, step] = from === 2 ? [-10.95, .05, 1.8] : [-11.4, -.4, 2.25], oldBed = from === 2 ? layout2Bed : legacyBed;
    const onOldGrid = (x: number, z: number) => [(x - ox) / step, (z - oz) / step].every(k => Math.abs(k - Math.round(k)) < .01);
    const repack = new Set<number>();
    s.plots.forEach((p, i) => {
        const { x, z } = bedPosition(s, i), old = oldBed(i);
        if (i < STARTING_PLOTS) { if (Math.abs(x - old.x) < .01 && Math.abs(z - old.z) < .01) Object.assign(p, defaultBed(i)); }
        else if (!p.rotation && onOldGrid(x, z)) repack.add(i);
    });
    const standing = bedSpots(s).filter((_, i) => !repack.has(i));
    for (const i of repack) { const spot = freeBedSpot(s, standing); if (!spot) continue; Object.assign(s.plots[i], spot); standing.push({ ...spot, rotation: 0 }); }
    s.gardenLayout = GARDEN_LAYOUT;
    return settleBeds(s);
}
/** Room for a new bed: apart from every other bed's square and clear of decorations, inside the fence. */
function bedRoom(s: SaveState, x: number, z: number, rotation = 0, beds: readonly BedSpot[] = bedSpots(s)) {
    return Number.isFinite(x) && Number.isFinite(z) && Math.hypot(x, z) <= 16.6 && !s.decorations.some(d => Math.hypot(x - d.x, z - d.z) < (ITEMS[d.id]?.collider || .6) + BED_GAP * .5)
        && beds.every(b => bedsApart(x, z, rotation, b.x, b.z, b.rotation ?? 0));
}
export function gardenExpansionCost(s: SaveState) { return 60 + Math.max(0, s.plots.length - STARTING_PLOTS) * 20; }
function placementFree(s: SaveState, x: number, z: number, radius: number, omit?: string) { return Number.isFinite(x) && Number.isFinite(z) && Math.hypot(x, z) <= 16.6 && !s.plots.some((_, i) => { const p = bedPosition(s, i); return Math.hypot(x - p.x, z - p.z) < radius; }) && !s.decorations.some(d => d.uid !== omit && Math.hypot(x - d.x, z - d.z) < (ITEMS[d.id]?.collider || .6) + radius * .5); }
/** Adds a bed (a kit from the bag, else energy): at (x, z) when given, otherwise automatically at the free spot nearest the garden. */
export function expandGarden(s: SaveState, x?: number, z?: number, rotation = 0) { if (s.planet !== 'home' || s.plots.length >= STARTING_PLOTS + MAX_EXTRA_PLOTS)
    return false; const cost = gardenExpansionCost(s), kit = (s.bag.plot_kit || 0) > 0; if (!kit && s.energy < cost)
    return false; if (x === undefined || z === undefined) {
    const spot = freeBedSpot(s, bedSpots(s));
    if (!spot)
        return false;
    x = spot.x;
    z = spot.z;
    rotation = 0;
} if (!bedClear(x, z, rotation) || !bedRoom(s, x, z, rotation))
    return false; if (kit)
    removeItem(s.bag, 'plot_kit');
else
    s.energy -= cost; s.plots.push({ crop: null, plantedAt: 0, x: x!, z: z!, ...(rotation ? { rotation } : {}) }); recordEvent(s, 'expand'); return true; }
/** Where bed `i` sits (saves from before free placement kept no position). */
export function bedPosition(s: SaveState, i: number) { const p = s.plots[i], d = defaultBed(i); return { x: p?.x ?? d.x, z: p?.z ?? d.z }; }
/** Beds 10+ were added by the player and can be packed away again; the nine starting beds cannot. */
export function isExtraBed(s: SaveState, i: number) { return i >= STARTING_PLOTS && i < s.plots.length; }
/** Reach of a ripe tap: the whole garden (the user's choice; the reference gathers only within 5 m of the tapped bed). */
export const HARVEST_REACH = Infinity;
/** Ripe beds a tap on ripe bed `index` gathers, nearest first (the tapped bed leads); empty if that bed is not ripe. */
export function ripeNearby(s: SaveState, index: number, now = Date.now(), reach = HARVEST_REACH) {
    const at = bedPosition(s, index), ripe = (i: number) => !!s.plots[i]?.crop && cropProgress(s.plots[i], now) >= 1;
    if (!ripe(index)) return [];
    // Distances to the millimetre so beds at the same spacing keep save order.
    const near = s.plots.map((_, i) => { const p = bedPosition(s, i); return { i, d: Math.round(Math.hypot(p.x - at.x, p.z - at.z) * 1000) / 1000 }; }).filter(b => b.d < reach && ripe(b.i));
    return near.sort((a, b) => a.d - b.d || a.i - b.i).map(b => b.i);
}
/** Whether a new bed may go here: clear of the cottage, pen, trails and fence (bedClear) and of other beds and decorations. */
export function bedSpotOk(s: SaveState, x: number, z: number, rotation = 0) { return s.planet === 'home' && bedClear(x, z, rotation) && bedRoom(s, x, z, rotation); }
/** Whether a decoration may stand here (clear of beds, other decorations and the animal pen, inside the fence); obstacles are the world's. */
export function decorSpotOk(s: SaveState, x: number, z: number) { return s.planet === 'home' && placementFree(s, x, z, 1.9) && clearOfPen(x, z, .3, .2) && !inYard(x, z, .5); }
/**
 * "Expand garden" (reference buyPlot): at the cap nothing happens; with a garden bed kit already in the bag the player
 * just places it; otherwise 60 + 20 x extra beds of energy buys one. The kit is spent only when the bed is placed.
 */
export function readyPlotKit(s: SaveState): 'max' | 'away' | 'energy' | 'have' | 'bought' {
    if (s.plots.length >= STARTING_PLOTS + MAX_EXTRA_PLOTS) return 'max';
    if (s.planet !== 'home') return 'away';
    if ((s.bag.plot_kit || 0) > 0) return 'have';
    const cost = gardenExpansionCost(s);
    if (s.energy < cost || !addItem(s, 'plot_kit')) return 'energy';
    s.energy -= cost; return 'bought';
}
/** Packs an empty extra bed back into a garden bed kit (reference removeExtra); later beds move down one index. */
export function storeBed(s: SaveState, i: number) {
    if (s.planet !== 'home' || !isExtraBed(s, i) || s.plots[i].crop || !addItem(s, 'plot_kit')) return false;
    s.plots.splice(i, 1); return true;
}
/** Reposition a bed without changing its crop or its original growing duration. */
export function moveBed(s: SaveState, i: number, x: number, z: number, rotation = 0) {
    if (s.planet !== 'home' || !Number.isInteger(i) || !s.plots[i] || !Number.isFinite(rotation) || !bedClear(x,z,rotation) || !bedRoom(s,x,z,rotation,bedSpots(s).filter((_,index)=>index!==i))) return false;
    Object.assign(s.plots[i], { x, z, rotation }); return true;
}
export function looseQuantity(s: SaveState, raw: ItemId) { const id = canonicalItem(raw); return Math.max(0, (s.bag[id] || 0) - (Object.values(s.gear).includes(id) ? 1 : 0)); }
export function sell(s: SaveState, raw: ItemId, count = 1) { const id = canonicalItem(raw), item = Object.hasOwn(ITEMS, id) ? ITEMS[id] : undefined; if (!item || !Number.isSafeInteger(count) || count < 1 || !item.sell || count > looseQuantity(s, id))
    return 0; const value = item.sell * count; if (!Number.isSafeInteger(value) || !Number.isSafeInteger(s.energy + value) || !removeItem(s.bag, id, count))
    return 0; s.energy += value; recordEvent(s, 'sell', value); return value; }
export function canCraft(s: SaveState, index: number) { const r = RECIPES[index]; return !!r && Number.isSafeInteger((s.bag[r.result] || 0) + (r.count || 1)) && s.energy >= r.energy && (r.station !== 'forge' || furnaceReady(s)) && Object.entries(r.materials).every(([id, n]) => looseQuantity(s, id) >= n!); }
export function craft(s: SaveState, index: number) { if (!canCraft(s, index))
    return false; const r = RECIPES[index]; s.energy -= r.energy; for (const [id, n] of Object.entries(r.materials))
    removeItem(s.bag, id, n); addItem(s, r.result, r.count || 1); recordEvent(s, 'craft'); return true; }
export function buy(s: SaveState, raw: ItemId) { const id = canonicalItem(raw), index = RECIPES.findIndex(r => r.station === 'shop' && r.result === id); return index >= 0 && craft(s, index); }
export function equip(s: SaveState, raw: ItemId) { const id = canonicalItem(raw), item = Object.hasOwn(ITEMS, id) ? ITEMS[id] : undefined; if (!item?.slot || !s.bag[id])
    return false; s.gear[item.slot] = id; s.hp = Math.min(s.hp, maxHp(s)); if (item.slot === 'weapon' || item.slot === 'disguise')
    s.counters.equipped++; return true; }
export function unequip(s: SaveState, slot: GearSlot) { if (!s.gear[slot])
    return false; delete s.gear[slot]; s.hp = Math.min(s.hp, maxHp(s)); return true; }
export function eat(s: SaveState, raw: ItemId, now = Date.now()) { const id = canonicalItem(raw), item = Object.hasOwn(ITEMS, id) ? ITEMS[id] : undefined; if (!item || !item.heal && !item.buff || !item.buff && s.hp >= maxHp(s) || !removeItem(s.bag, id))
    return false; if (item.heal)
    s.hp = Math.min(maxHp(s), s.hp + item.heal); if (item.buff)
    addBuff(s, item.buff, id, now); return true; }
export function cook(s: SaveState, raw: ItemId, count = 1) { const id = canonicalItem(raw), result = `cooked_${id}`; if (!Object.hasOwn(ITEMS, result) || s.planet !== 'home' || !Number.isSafeInteger(count) || count < 1 || !Number.isSafeInteger((s.bag[result] || 0) + count) || !removeItem(s.bag, id, count))
    return false; addItem(s, result, count); recordEvent(s, 'cook', count); return true; }
export function transfer(s: SaveState, raw: ItemId, toChest: boolean) { const id = canonicalItem(raw); if (toChest && looseQuantity(s, id) < 1)
    return false; const from = toChest ? s.bag : s.chest, to = toChest ? s.chest : s.bag; if (!Number.isSafeInteger((to[id] || 0) + 1) || !removeItem(from, id))
    return false; to[id] = (to[id] || 0) + 1; return true; }
export function upgradeCost(s: SaveState, kind: keyof typeof UPGRADES) { const rank = kind === 'health' ? s.healthUp : kind === 'attack' ? s.attackUp : kind === 'defense' ? s.defenseUp : s.critUp; return Math.min(Number.MAX_SAFE_INTEGER, Math.ceil(UPGRADES[kind].base * Math.pow(1.38, rank))); }
export function upgrade(s: SaveState, kind: keyof typeof UPGRADES) { if (!Object.hasOwn(UPGRADES, kind) || kind === 'crit' && s.critUp >= 28)
    return false; const cost = upgradeCost(s, kind); if (s.energy < cost)
    return false; s.energy -= cost; if (kind === 'health') {
    // Like the reference: +25 maximum health, and the same 25 healed at once (not a full heal).
    s.healthUp++;
    s.hp = Math.min(maxHp(s), s.hp + UPGRADES.health.step);
}
else if (kind === 'attack')
    s.attackUp++;
else if (kind === 'defense')
    s.defenseUp++;
else
    s.critUp++; recordEvent(s, 'upgrade'); return true; }
/** Filling the starship's tank costs the same from every world. */
export const LAUNCH_COST = 20;
export function launch(s: SaveState) { if (s.energy < LAUNCH_COST)
    return false; s.energy -= LAUNCH_COST; return true; }
/** Marks a planet as spotted from space; returns true the first time. */
export function discover(s: SaveState, id: PlanetId) { if (!Object.hasOwn(PLANETS, id) || s.discovered.includes(id))
    return false; s.discovered.push(id); return true; }
export function canLand(s: SaveState, id: PlanetId) { return Object.hasOwn(PLANETS, id) && s.level >= PLANETS[id].level; }
/** Touches down on a planet. The flight itself is paid for at launch. */
export function travel(s: SaveState, id: PlanetId) { if (!canLand(s, id))
    return false; s.planet = id; discover(s, id); if (!s.visited.includes(id))
    s.visited.push(id); if (id !== 'home')
    recordEvent(s, 'planet'); return true; }
/** Stardust collected in space: a little energy and, now and then, a star shard. */
export function collectStardust(s: SaveState, rng: () => number = Math.random) { s.energy += 3; const shard = rng() < .08; if (shard)
    addItem(s, 'starshard'); return shard; }
export const QUESTS = STORY_STEPS.map((q, i) => ({ title: q.title, task: q.title, target: q.target, icon: q.icon, counter: q.condition || q.event || 'level', energy: 0, xp: 0, hint: `Chapter ${q.chapter + 1} · Step ${i + 1}` }));
export function questProgress(s: SaveState) { return progressEntries(s, 'story')[0]?.progress || 0; }
export function claimQuest(s: SaveState) { return claimProgress(s, 'story', `story:${s.progression.story.index}`); }
export function rollLoot(type: string, luck = 0, rng: () => number = Math.random) { const loot: {
    id: string;
    count: number;
}[] = []; for (const [id, chance, min, max] of LOOT_TABLES[type] || []) {
    if (rng() < Math.min(1, chance * (chance < .5 ? 1 + Math.max(0, luck) : 1)))
        loot.push({ id, count: min + Math.min(max - min, Math.floor(rng() * (max - min + 1))) });
} return loot; }
/** bank=false leaves the loot out of the bag: the game tosses it onto the ground instead (drops.ts). */
export function grantDefeat(s: SaveState, type: string, xp: number, boss = false, rng: () => number = Math.random, bank = true) { gainXp(s, xp); const loot = rollLoot(type, activeStats(s).luck, rng); if (bank) for (const item of loot)
    addItem(s, item.id, item.count); recordEvent(s, 'kill', 1, type); if (boss)
    { recordEvent(s, 'boss', 1, type); noteBossDefeat(s, type); } return loot; }
export function chooseFish(s: SaveState, water: string = s.planet, rng: () => number = Math.random) { const choices = FISH_WEIGHTS[water] || FISH_WEIGHTS.home, luck = activeStats(s).luck, weighted = choices.map(([id, weight]) => [id, weight * (ITEMS[id].legend ? 1 + luck * 1.5 : ITEMS[id].rare ? 1 + luck : 1)] as const); let draw = rng() * weighted.reduce((sum, [, w]) => sum + w, 0); for (const [id, weight] of weighted) {
    draw -= weight;
    if (draw <= 0)
        return id;
} return weighted[weighted.length - 1][0]; }
export function grantCatch(s: SaveState, raw: ItemId, size?: number, hugeCatch = false) { const id = canonicalItem(raw), fish = Object.hasOwn(FISH, id) ? FISH[id] : undefined; if (!fish)
    return false; const huge = hugeCatch && fish.rarity !== 'junk', bonus = huge ? Math.round(fish.sell * .6) : 0; if (!Number.isSafeInteger(s.energy + bonus) || !addItem(s, id))
    return false; gainXp(s, fish.xp * (huge ? 2 : 1)); s.energy += bonus; if (size && Number.isFinite(size))
    s.fishRecords[id] = Math.max(s.fishRecords[id] || 0, size); recordEvent(s, 'fish'); if (ITEMS[id].rare || ITEMS[id].legend)
    recordEvent(s, 'fishrare'); if (ITEMS[id].legend)
    recordEvent(s, 'legendFish'); return true; }
/** Mystery catches are resolved once by the caller's authority, including unusual treasure. */
export function grantMysteryCatch(s: SaveState, raw: ItemId, size?: number, supergiant = false) {
    const id = canonicalItem(raw), fish = FISH[id];
    if (!fish) return addItem(s,id);
    if (!supergiant) return grantCatch(s,id,size,false);
    if (!Number.isSafeInteger(s.energy + fish.sell*2) || !addItem(s,id)) return false;
    gainXp(s,fish.xp*4); s.energy += fish.sell*2;
    if (size && Number.isFinite(size)) s.fishRecords[id] = Math.max(s.fishRecords[id]||0,size);
    recordEvent(s,'fish'); if (ITEMS[id].rare || ITEMS[id].legend) recordEvent(s,'fishrare'); if (ITEMS[id].legend) recordEvent(s,'legendFish');
    return true;
}
export function placeDecoration(s: SaveState, raw: ItemId, x: number, z: number, rotation = 0) { const id = canonicalItem(raw), item = Object.hasOwn(ITEMS, id) ? ITEMS[id] : undefined; if (item?.type === 'placeable')
    return expandGarden(s, x, z, rotation); if (s.planet !== 'home' || item?.type !== 'decor' || s.decorations.length >= MAX_DECORATIONS || !Number.isFinite(rotation) || !placementFree(s, x, z, 1.9) || !removeItem(s.bag, id))
    return false; s.decorations.push({ uid: `decor-${s.nextDecorationId++}`, id, x, z, rotation }); recordEvent(s, 'decorate'); return true; }
export function moveDecoration(s: SaveState, uid: string, x: number, z: number, rotation?: number) { const d = s.decorations.find(d => d.uid === uid); if (!d || s.planet !== 'home' || !placementFree(s, x, z, 1.9, uid) || rotation !== undefined && !Number.isFinite(rotation))
    return false; d.x = x; d.z = z; if (rotation !== undefined)
    d.rotation = rotation; return true; }
export function removeDecoration(s: SaveState, uid: string) { const index = s.decorations.findIndex(d => d.uid === uid); if (index < 0 || s.planet !== 'home')
    return false; if (!addItem(s, s.decorations[index].id)) return false; s.decorations.splice(index, 1); return true; }
export const MINE_REGROW_MS = 20000;
export function mineAvailable(s: SaveState, planet: PlanetId, index: number, now = Date.now()) { return Object.hasOwn(PLANETS, planet) && planet !== 'home' && Number.isInteger(index) && index >= 0 && index < 2 && Number.isFinite(now) && now >= 0 && now <= Number.MAX_SAFE_INTEGER - MINE_REGROW_MS && now >= (s.worldRewards.mineReadyAt[planet]?.[index] || 0); }
export function claimMine(s: SaveState, index: number, now = Date.now()) { if (!mineAvailable(s, s.planet, index, now))
    return false; const material: Record<PlanetId, string> = { home: 'stone', candy: 'sugar', ice: 'icecrystal', lava: 'mcrystal', toy: 'gear', jungle: 'vine', ocean: 'coral', cloud: 'feather', shadow: 'shadow' }; if (!addItem(s, material[s.planet])) return false; (s.worldRewards.mineReadyAt[s.planet] ??= [0, 0])[index] = now + MINE_REGROW_MS; recordEvent(s, 'mine', 1, undefined, now); return true; }
export const GIFT_REGROW_MS = 45000, GIFT_COUNT = 26;
export interface GiftOutcome {
    kind: 'giant' | 'tiny' | 'coins' | 'heal' | 'bomb' | 'toys' | 'curse';
    label: string;
    energy?: number;
    radius?: number;
    damageMultiplier?: number;
}
export function giftAvailable(s: SaveState, planet: PlanetId, index: number, now = Date.now()) { return planet === 'toy' && Number.isInteger(index) && index >= 0 && index < GIFT_COUNT && Number.isFinite(now) && now >= 0 && now < Number.MAX_SAFE_INTEGER - GIFT_REGROW_MS && now >= (s.worldRewards.giftReadyAt.toy?.[index] || 0); }
export function claimGift(s: SaveState, index: number, now = Date.now(), rng: () => number = Math.random): GiftOutcome | false {
    if (!giftAvailable(s, s.planet, index, now))
        return false;
    const firstRoll=rng();if(!validRoll(firstRoll))return false;
    const choices: [
        GiftOutcome['kind'],
        number,
        string
    ][] = [['giant', 3, 'Giant power!'], ['tiny', 3, 'Tiny speed!'], ['coins', 3, 'Energy shower!'], ['heal', 2, 'Fully healed!'], ['bomb', 2, 'Surprise explosion!'], ['toys', 3, 'Toy parts!'], ['curse', 1, 'Sticky feet!']];
    let draw = firstRoll * 17, choice = choices[0];
    for (const entry of choices) {
        draw -= entry[1];
        if (draw < 0) {
            choice = entry;
            break;
        }
    }
    const [kind, , label] = choice, result: GiftOutcome = { kind, label };
    if (kind === 'giant' || kind === 'tiny') {
        s.sizeEffect = { scale: kind === 'giant' ? 1.7 : .55, expiresAt: now + 20000 };
        addBuff(s, kind === 'giant' ? { atk: .5, time: 20 } : { speed: .6, time: 20 }, 'gift', now);
    }
    else if (kind === 'coins') {
        const roll=rng();if(!validRoll(roll))return false;
        result.energy = 20 + Math.round(roll * 40) + s.level * 2;
        if(!Number.isSafeInteger(s.energy+result.energy))return false;
        s.energy += result.energy;
    }
    else if (kind === 'heal')
        s.hp = maxHp(s);
    else if (kind === 'bomb') {
        result.radius = 4.5;
        result.damageMultiplier = 3;
        s.hp = Math.max(0, s.hp - maxHp(s) * .1);
    }
    else if (kind === 'toys') {
        const countRoll=rng(),bonusRoll=rng();if(!validRoll(countRoll)||!validRoll(bonusRoll))return false;
        if(!addItems(s,{gear:2+Math.floor(countRoll*3),...(bonusRoll<.15?{battery:1}:{})}))return false;
    }
    else
        s.buffs.speed = { value: -.4, expiresAt: now + 8000, source: 'gift' };
    (s.worldRewards.giftReadyAt.toy ??= Array(GIFT_COUNT).fill(0))[index] = now + GIFT_REGROW_MS;
    return result;
}
export function claimEnvironmentResource(s: SaveState, key: string, raw: ItemId, now = Date.now(), cooldownMs = 20000) { const id = canonicalItem(raw); if (!/^[a-zA-Z0-9:_-]{1,100}$/.test(key) || ['constructor', '__proto__', 'prototype'].includes(key) || !Object.hasOwn(ITEMS, id) || !Number.isFinite(now) || now < 0 || now > 8.64e15-86400000 || !Number.isFinite(cooldownMs) || cooldownMs < 0 || now < (s.worldRewards.resourceReadyAt[key] || 0))
    return false; if (!addItem(s, id)) return false; s.worldRewards.resourceReadyAt[key] = now + Math.min(cooldownMs, 86400000); recordEvent(s, 'mine', 1, undefined, now); return true; }
export function openCave(s: SaveState) { if (s.planet !== 'lava' || s.worldRewards.lava.gateOpen)
    return false; s.worldRewards.lava.gateOpen = true; return true; }
export function lightBrazier(s: SaveState, index: number, rng:()=>number=Math.random) { const lava = s.worldRewards.lava; if (s.planet !== 'lava' || !Number.isInteger(index) || index < 0 || index > 2 || lava.braziers.includes(index) || !(s.bag.fcrystal!>=1))
    return false;
    if(lava.braziers.length===2){const roll=rng();if(!validRoll(roll)||!addItems(s,{firecore:2,deco_volcano:1,obsidian:2+Math.floor(roll*2)}))return false;}
    removeItem(s.bag,'fcrystal');lava.braziers.push(index);
    return true; }
export function furnaceReady(s: SaveState) { return s.worldRewards.lava.braziers.length === 3; }
export function claimCaveChest(s: SaveState, now = Date.now(), rng: () => number = Math.random) { if (!Number.isFinite(now) || now < 0 || now > 8.64e15)
    return false; const date = new Date(now).toISOString().slice(0, 10), lava = s.worldRewards.lava; if (s.planet !== 'lava' || !lava.gateOpen || lava.caveChestDay === date)
    return false;
    const rolls=Array.from({length:5},()=>rng());if(!rolls.every(validRoll))return false;
    const rewards:Inventory={obsidian:3+Math.floor(rolls[0]*3),firecore:1+Math.floor(rolls[1]*2)};
    if(rolls[2]<.35)rewards.dragonegg=1;if(rolls[3]<.3)rewards.deco_nest=1;if(rolls[4]<.5)rewards.starshard=1;
    if(!addItems(s,rewards))return false;lava.caveChestDay=date;return true; }
export function die(s: SaveState, x: number, z: number) { const items: Inventory = {}; for (const id of Object.keys(s.bag)) {
    const n = looseQuantity(s, id);
    if (n) {
        items[id] = n;
        removeItem(s.bag, id, n);
    }
} if (s.dropped)
    for (const [id, n] of Object.entries(s.dropped.items)) {
        // Bank the old stash first. At the numeric storage limit, preserve overflow in the
        // newly emptied bag/current stash instead of serializing an unsafe integer that reload discards.
        let remaining=n!;
        for(const target of [s.chest,s.bag,items]){const moved=Math.min(remaining,Number.MAX_SAFE_INTEGER-(target[id]||0));if(moved>0)target[id]=(target[id]||0)+moved;remaining-=moved;if(!remaining)break;}
    } s.dropped = Object.keys(items).length ? { x, z, planet: s.planet, items } : null; s.planet = 'home'; s.hp = maxHp(s); s.buffs = {}; s.sizeEffect = null; }
export function recoverBag(s: SaveState) { if (!s.dropped || s.dropped.planet !== s.planet)
    return false;
    // Stage the entire pickup: a failed grant must preserve every item for a later retry.
    if(!addItems(s,s.dropped.items))return false;s.dropped = null; return true; }
function record(value: unknown): value is Record<string, any> { return !!value && typeof value === 'object' && !Array.isArray(value); }
function integer(value: unknown, fallback = 0, max = Number.MAX_SAFE_INTEGER) { return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.min(max, Math.floor(value)) : fallback; }
function planetId(value: unknown): PlanetId | null { const id = value === 'sky' ? 'cloud' : value === 'dark' ? 'shadow' : value; return typeof id === 'string' && Object.hasOwn(PLANETS, id) ? id as PlanetId : null; }
export function parseSave(raw: string | null): SaveState | null {
    if (!raw)
        return null;
    try {
        const v: unknown = JSON.parse(raw);
        if (!record(v) || v.version !== 1 || typeof v.name !== 'string' || typeof v.level !== 'number' || !Number.isFinite(v.level) || v.level < 1 || !planetId(v.planet) || !Array.isArray(v.plots))
            return null;
        const s = newGame(v.name, typeof v.color === 'string' && /^#[0-9a-f]{6}$/i.test(v.color) ? v.color : COLORS[0]);
        const legacy = !(typeof v.contentVersion === 'number' && v.contentVersion >= 2), oldCropTimers = !(typeof v.contentVersion === 'number' && v.contentVersion >= 3), layoutBed = v.gardenLayout === GARDEN_LAYOUT ? defaultBed : v.gardenLayout === 2 ? layout2Bed : legacyBed;
        const inventory = (data: unknown): Inventory => { const result: Inventory = {}; if (record(data))
            for (const [raw, n] of Object.entries(data)) {
                const id = canonicalItem(raw);
                if (Object.hasOwn(ITEMS, id) && Number.isSafeInteger(n) && n > 0 && Number.isSafeInteger((result[id] || 0) + n))
                    result[id] = (result[id] || 0) + n;
            } return result; };
        s.level = integer(v.level, 1, 1e9);
        s.xp = typeof v.xp === 'number' && Number.isFinite(v.xp) && v.xp >= 0 ? Math.min(v.xp, xpNeeded(s.level) * 2) : 0;
        s.energy = integer(v.energy);
        s.healthUp = integer(v.healthUp, 0, 1e9);
        s.attackUp = integer(v.attackUp, 0, 1e9);
        s.defenseUp = integer(v.defenseUp, 0, 1e9);
        s.critUp = integer(v.critUp, 0, 28);
        s.bag = inventory(v.bag);
        s.chest = inventory(v.chest);
        s.forge = parseForge(v.forge);
        s.nextPlantId = integer(v.nextPlantId);
        if (record(v.gear))
            for (const [rawSlot, rawId] of Object.entries(v.gear)) {
                if (typeof rawId !== 'string')
                    continue;
                const id = canonicalItem(rawId), slot = rawSlot === 'armor' ? 'outfit' : rawSlot === 'feet' ? 'boots' : rawSlot;
                if (Object.hasOwn(ITEMS, id) && s.bag[id] && ITEMS[id].slot === slot)
                    s.gear[slot as GearSlot] = id;
            }
        s.hp = Math.min(typeof v.hp === 'number' && Number.isFinite(v.hp) && v.hp >= 0 ? v.hp : 100, maxHp(s));
        s.plots = v.plots.slice(0, STARTING_PLOTS + MAX_EXTRA_PLOTS).map((p: unknown, i: number) => {
            const rawCrop = record(p) && typeof p.crop === 'string' ? canonicalItem(p.crop) : null;
            const crop = rawCrop && Object.hasOwn(CROPS, rawCrop) ? rawCrop : null;
            const point = record(p) && Number.isFinite(p.x) && Number.isFinite(p.z) ? { x: p.x, z: p.z } : layoutBed(i);
            const rotation = record(p) && typeof p.rotation === 'number' && Number.isFinite(p.rotation) && p.rotation ? { rotation: p.rotation } : {};
            // Fertilizer may legitimately advance a synthetic-clock planting before epoch zero.
            const plantedAt = record(p) && Number.isSafeInteger(p.plantedAt) && p.plantedAt >= -14*86400000 ? p.plantedAt : 0;
            const duration = crop ? CROPS[crop].duration / (oldCropTimers && LEGACY_CROP_IDS.includes(crop) ? 10 : 1) : 0;
            const growDuration = crop && record(p) && typeof p.growDuration === 'number' && Number.isFinite(p.growDuration) && p.growDuration > 0 && p.growDuration <= 14 * 86400000 ? p.growDuration : duration;
            const generation = crop ? record(p) && typeof p.generation === 'string' && /^[a-zA-Z0-9:_-]{1,100}$/.test(p.generation) ? p.generation : `legacy:${i}:${plantedAt}:${crop}` : undefined;
            return { crop, plantedAt, ...point, ...rotation, ...(crop ? { growDuration, generation } : {}) };
        });
        if (legacy) {
            const target = Math.min(STARTING_PLOTS + MAX_EXTRA_PLOTS, s.plots.length + 3);
            while (s.plots.length < target)
                s.plots.push({ crop: null, plantedAt: 0, ...layoutBed(s.plots.length) });
        }
        while (s.plots.length < STARTING_PLOTS)
            s.plots.push({ crop: null, plantedAt: 0, ...layoutBed(s.plots.length) });
        for (const key of Object.keys(s.counters) as (keyof Counters)[])
            s.counters[key] = integer(record(v.counters) ? v.counters[key] : 0);
        s.quest = integer(v.quest, 0, 1e6);
        s.planet = planetId(v.planet)!;
        s.visited = [...new Set<PlanetId>(['home', ...(Array.isArray(v.visited) ? v.visited.map(planetId).filter((id: PlanetId | null): id is PlanetId => !!id) : []), s.planet])];
        s.discovered = [...new Set<PlanetId>([...s.visited, ...(Array.isArray(v.discovered) ? v.discovered.map(planetId).filter((id: PlanetId | null): id is PlanetId => !!id) : [])])];
        const settings = record(v.settings) ? v.settings : {};
        s.settings = { sound: settings.sound !== false, lowGraphics: settings.lowGraphics === true, ...(typeof settings.movePad === 'boolean' ? { movePad: settings.movePad } : {}) };
        if(settings.joystickSide==='left'||settings.joystickSide==='right')s.settings.joystickSide=settings.joystickSide;
        if (settings.placeBeds === true) s.settings.placeBeds = true;
        const rewards = record(v.worldRewards) ? v.worldRewards : {};
        if (record(rewards.mineReadyAt))
            for (const [key, times] of Object.entries(rewards.mineReadyAt)) {
                const planet = planetId(key);
                if (planet && planet !== 'home' && Array.isArray(times))
                    s.worldRewards.mineReadyAt[planet] = [integer(times[0]), integer(times[1])];
            }
        if (record(rewards.collectedGifts) && Array.isArray(rewards.collectedGifts.toy))
            s.worldRewards.collectedGifts.toy = [...new Set<number>(rewards.collectedGifts.toy.filter((n: unknown): n is number => typeof n === 'number' && Number.isInteger(n) && n >= 0 && n < 6))];
        if (record(rewards.giftReadyAt) && Array.isArray(rewards.giftReadyAt.toy))
            s.worldRewards.giftReadyAt.toy = Array.from({ length: GIFT_COUNT }, (_, i) => integer(rewards.giftReadyAt.toy[i]));
        else if (s.worldRewards.collectedGifts.toy?.length) {
            s.worldRewards.giftReadyAt.toy = Array(GIFT_COUNT).fill(0);
            for (const index of s.worldRewards.collectedGifts.toy)
                s.worldRewards.giftReadyAt.toy[index] = Math.min(Date.now() + GIFT_REGROW_MS, integer(v.savedAt, Date.now()) + GIFT_REGROW_MS);
        }
        if (record(rewards.resourceReadyAt))
            for (const [key, time] of Object.entries(rewards.resourceReadyAt))
                if (/^[a-zA-Z0-9:_-]{1,100}$/.test(key) && !['constructor', '__proto__', 'prototype'].includes(key))
                    s.worldRewards.resourceReadyAt[key] = integer(time);
        if (record(rewards.lava)) {
            s.worldRewards.lava.gateOpen = rewards.lava.gateOpen === true;
            s.worldRewards.lava.braziers = Array.isArray(rewards.lava.braziers) ? [...new Set<number>(rewards.lava.braziers.filter((n: unknown): n is number => typeof n === 'number' && Number.isInteger(n) && n >= 0 && n < 3))] : [];
            if (typeof rewards.lava.caveChestDay === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(rewards.lava.caveChestDay))
                s.worldRewards.lava.caveChestDay = rewards.lava.caveChestDay;
        }
        const keys: BuffKey[] = ['atk', 'def', 'haste', 'regen', 'speed', 'crit', 'xp', 'magnet', 'luck', 'light', 'fireres', 'lifesteal'];
        if (record(v.buffs))
            for (const key of keys) {
                const b = v.buffs[key];
                if (record(b) && typeof b.value === 'number' && Number.isFinite(b.value) && (b.value > 0 || key === 'speed' && b.value >= -.8) && Number.isFinite(b.expiresAt))
                    s.buffs[key] = { value: Math.min(b.value, 100), expiresAt: b.expiresAt, source: typeof b.source === 'string' ? canonicalItem(b.source) : 'effect' };
            }
        if (record(v.sizeEffect) && [.55, 1.7].includes(v.sizeEffect.scale) && Number.isFinite(v.sizeEffect.expiresAt))
            s.sizeEffect = { scale: v.sizeEffect.scale, expiresAt: v.sizeEffect.expiresAt };
        if (Array.isArray(v.decorations))
            for (const d of v.decorations.slice(0, MAX_DECORATIONS)) {
                if (!record(d) || typeof d.id !== 'string')
                    continue;
                const id = canonicalItem(d.id);
                if (ITEMS[id]?.type === 'decor' && Number.isFinite(d.x) && Number.isFinite(d.z) && Math.hypot(d.x, d.z) <= 16.6)
                    s.decorations.push({ uid: typeof d.uid === 'string' ? d.uid.slice(0, 80) : `decor-${s.nextDecorationId++}`, id, x: d.x, z: d.z, rotation: Number.isFinite(d.rotation) ? d.rotation : 0 });
            }
        if (v.gardenLayout === GARDEN_LAYOUT) settleBeds(s); else shrinkGarden(s, v.gardenLayout === 2 ? 2 : 1);
        s.farm = parseFarm(v.farm);
        const hunting = parseHunting(v.hunting); if (hunting) s.hunting = hunting;
        if (record(v.helper)) s.helper = parseHelper(v.helper);
        const friends = parseFriends(v.friends), bosses = parseBosses(v.bosses); if (friends.length) s.friends = friends; if (bosses.length) s.bosses = bosses;
        const looks = parseLooks(v.looks); if (looks) s.looks = looks;
        s.nextDecorationId = Math.max(integer(v.nextDecorationId, 1), s.decorations.length + 1, ...s.decorations.map(d => Number(d.uid.replace('decor-', '')) + 1).filter(Number.isFinite));
        if (record(v.collection))
            for (const [id, n] of Object.entries(v.collection))
                if (Object.hasOwn(ITEMS, canonicalItem(id)) && n)
                    s.collection[canonicalItem(id)] = 1;
        for (const id of [...Object.keys(s.bag), ...Object.keys(s.chest), ...s.decorations.map(d => d.id)])
            s.collection[id] = 1;
        if (record(v.fishRecords))
            for (const [id, n] of Object.entries(v.fishRecords))
                if (Object.hasOwn(FISH, id) && typeof n === 'number' && Number.isFinite(n) && n > 0)
                    s.fishRecords[id] = n;
        const d = v.dropped;
        if (record(d) && Number.isFinite(d.x) && Number.isFinite(d.z) && planetId(d.planet)) {
            const items = inventory(d.items);
            if (Object.keys(items).length)
                s.dropped = { x: d.x, z: d.z, planet: planetId(d.planet)!, items };
        }
        s.savedAt = integer(v.savedAt, s.savedAt);
        s.progression = normalizeProgression(v.progression, s);
        s.quest = s.progression.story.index;
        // Carry any old threshold overflow forward instead of silently deleting XP.
        while (s.xp >= xpNeeded(s.level)) {
            s.xp -= xpNeeded(s.level);
            s.level++;
            s.hp = maxHp(s);
        }
        return s;
    }
    catch {
        return null;
    }
}
