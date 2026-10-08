import { ITEMS, CROPS, PLANETS, RECIPES, DISGUISES, FISH, FISH_WEIGHTS, LOOT_TABLES, UPGRADES, STARTING_PLOTS, MAX_EXTRA_PLOTS, LEGACY_MAX_PLOTS, MAX_DECORATIONS, STORY_STEPS, canonicalItem, type ItemId, type Inventory, type GearSlot, type CropId, type PlanetId, type BuffKey, type BuffDef, type WeaponDef } from './content.ts';
import { createProgression, normalizeProgression, recordEvent, progressEntries, claimProgress, type ProgressionState } from './progression.ts';
import { parseHelper, type HelperState } from './helper-state.ts';
import { parseFriends, parseBosses, noteBossDefeat, type Friend } from './friends-state.ts';
import { parseDungeon, type DungeonSave } from './dungeon-save.ts';
import { parseCtf, type CtfSave } from './ctf-save.ts';
import { parseHouse, type HouseState } from './house-activities.ts';
import { parseLooks, type Looks } from './looks.ts';
import { uniformSpecial } from './uniform-skills.ts';
import { dropUnownedFriendLooks } from './friend-looks.ts';
import { clearOfPen, inYard, emptyFarm, parseFarm, type FarmState } from './farm.ts';
import { forgeLevel, parseForge } from './weapon-forge.ts';
import { levelledStat, parseGearLevels, parseSkillLevels } from './upgrades.ts';
import { LEGACY_CROP_IDS } from './content.ts';
import { cropLevel, cropXp, cropGrowTime, sellPrice, kitchenOpen, isDifficulty, difficultyOf, rewardScale, bedUpgradeScale, type Difficulty } from './difficulty.ts';
import { parseHunting, type HuntingState } from './fish-hunting.ts';
import { looseQuantity, pantry, usePantry, hasMaterials, useMaterials } from './pantry.ts';
import { specialPrice } from './special-offers.ts';
import { levelAllows } from './level-gates.ts';
import { AUDIO_DEFAULTS, parseAudio } from './audio-settings.ts';
import { isTreeCrop } from './tree-crops.ts';
import { fits, noteFull, noteDelivered, clearFullNote, delivering, chestFits, nextExpansion, hasExpansionMaterials, isStorageKind, type StorageKind } from './storage-slots.ts';
import { pruneBags, bagId, parseDeathBags, MAX_DEATH_BAGS, type DeathBag } from './death-bags.ts';
export * from './storage-slots.ts';
export * from './death-bags.ts';
export { gearLevel, gearWorld, levelAllows } from './level-gates.ts';
export { isTreeCrop, TREE_CROP_MS } from './tree-crops.ts';
export * from './weapon-forge.ts';
// Purchase-list order and item level tags (main.ts renders them as M.*, which the panel tests already provide).
export { sortByPower, powerChip, levelTag, ownedScore, gearProgressHtml } from './item-power.ts';
export { gearFactor, skillLevel, skillCooldown } from './upgrades.ts';
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
    /** The difficulty at planting: the harvest's XP and value follow it, so switching never re-prices a growing crop. */
    difficulty?: Difficulty;
    /** Bed upgrades (upgradeBed): each level halves this bed's grow time (bedGrowTime, up to BED_MAX_LEVEL 3); missing = 0. */
    level?: number;
    /** The crop the player last planted here by hand (auto-plant.ts): helpers replant only this in the bed. Missing = helpers choose. */
    choice?: CropId;
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
    /** A new game starts with the welcome (a cook helper and the 1M-energy offer); anything saved without it has had it. */
    welcome?: 'pending' | 'done';
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
        /** Derived: any volume above 0 (audio-settings.ts). Older saves had only this switch. */
        sound: boolean;
        /** Music and effects volume in [0, 1] (reference defaults 0.45 / 0.8) and the vibration switch (audio-settings.ts). */
        musicVolume?: number;
        sfxVolume?: number;
        vibrate?: boolean;
        lowGraphics: boolean;
        /** Render resolution (graphics.ts RESOLUTION): Auto (default: phones at the reference's 1.25×), Sharp, Balanced or Battery saver. */
        renderRes?: 'auto' | 'sharp' | 'balanced' | 'saver';
        /** The on-screen movement pad; off by default because the reference is tap-to-move only. */
        movePad?: boolean;
        joystickSide?: 'left'|'right';
        keyboardLayout?: 'classic'|'wasd';
        /** "Place new beds myself": a bought bed opens the see-through placement instead of going down automatically. */
        placeBeds?: boolean;
        /** Easy (default; every old save), Normal or Hard: difficulty.ts reads prices and rules through it. */
        difficulty?: Difficulty;
        /** When the difficulty was last lowered (difficulty.ts LOWER_COOLDOWN_MS: once a day). */
        difficultyLoweredAt?: number;
        /** Tester mode (tester.ts): set only by the solo tester code; opens the Tester shop. */
        tester?: boolean;
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
    /** Bags dropped where the explorer fell (death-bags.ts): up to 10, each kept 24 hours; missing = none. */
    deathBags?: DeathBag[];
    /** Backpack and chest expansions bought (storage-slots.ts); missing = 0. */
    bagUp?: number;
    chestUp?: number;
    savedAt: number;
    /** The animal pen (farm.ts); older saves get an empty one. */
    farm: FarmState;
    /** Bed layout version (GARDEN_LAYOUT); saves without it are moved to the smaller beds by shrinkGarden. */
    gardenLayout?: number;
    /** The garden helper (helper.ts); older saves have none and parse as not owned. */
    helper?: HelperState;
    /** What the workers stored in the chest while the explorer was out (delivery.ts), until the note is read. */
    awayStore?: Inventory;
    forge?: Record<string, number>;
    /** Upgrade-bench levels of owned hats, outfits, boots and companions (upgrades.ts); missing = +0. */
    gearLevels?: Record<string, number>;
    /** Upgrade levels of the skills Q, W, E, R (skill-upgrades.ts); missing = all 0. */
    skillLevels?: number[];
    nextPlantId?: number;
    /** The beds a save from before the 24-bed cap lost and what it got back (trimGarden), until the note is shown. */
    gardenTrim?: TrimNote;
    /** The player took the weapon off by hand ('unequip'): fight with fists, after a reload and on the server too (context-gear.ts). */
    fists?: true;
    /** Harpoon cooldowns and individual pond restock deadlines survive reloads. */
    hunting?: HuntingState;
    /** Rescued friends (friends.ts); missing in older saves = nobody rescued. */
    friends?: Friend[];
    /** Bosses defeated at least once, as planet:type: they unlock the prisoners' cages for good (a respawn never re-locks one). */
    bosses?: string[];
    /** The Delvers' Vault (dungeon-rules.ts): today's runs, clears and the run in progress. */
    dungeon?: DungeonSave;
    /** Flag Rush (ctf-claim.ts): today's rewarded matches and the matches already paid. */
    ctf?: CtfSave;
    /** Explorer body styles bought at the mirror (looks.ts); missing in older saves = the default look only. */
    looks?: Looks;
    /** Cottage activities (house-activities.ts): when each was last used, paintings made. */
    house?: HouseState;
}
export const COLORS = ['#4aa8ff', '#ff7ab0', '#6fd35a', '#ffb13d', '#a07bff', '#ff5a5a'];
export const SAVE_KEY = 'cute-game-save-v1';
export function newGame(name = 'Clover', color = COLORS[0]): SaveState { return { version: 1, contentVersion: 3, forge: {}, nextPlantId: 0, name: name.slice(0, 20) || 'Clover', color, level: 1, xp: 0, hp: 100, energy: 0, bag: {}, chest: {}, gear: {}, plots: Array.from({ length: STARTING_PLOTS }, (_, i) => ({ crop: null, plantedAt: 0, ...defaultBed(i) })), gardenLayout: GARDEN_LAYOUT, farm: emptyFarm(), counters: { harvests: 0, sold: 0, bought: 0, equipped: 0, kills: 0, upgrades: 0, fish: 0, skills: 0 }, quest: 0, healthUp: 0, attackUp: 0, defenseUp: 0, critUp: 0, planet: 'home', visited: ['home'], discovered: ['home'], settings: { sound: true, musicVolume: AUDIO_DEFAULTS.musicVolume, sfxVolume: AUDIO_DEFAULTS.sfxVolume, vibrate: AUDIO_DEFAULTS.vibrate, lowGraphics: false, difficulty: 'easy' }, worldRewards: { mineReadyAt: {}, collectedGifts: {}, giftReadyAt: {}, resourceReadyAt: {}, lava: { gateOpen: false, braziers: [] } }, buffs: {}, sizeEffect: null, decorations: [], nextDecorationId: 1, collection: {}, fishRecords: {}, progression: createProgression(), savedAt: Date.now(), welcome: 'pending', looks: { owned: ['tall'], style: 'girl-tall-none-bare' } }; }
export function xpNeeded(level: number) { return Math.round(25 * Math.pow(Math.max(1, level), 1.55)); }
function equipped(s: SaveState) { return Object.values(s.gear).map(id => ITEMS[id]).filter(Boolean); }
// Bench levels (upgrades.ts) scale an item's own flat stats. While a disguise is worn its own weapon fights (weaponStats),
// so the hidden weapon in the hand adds neither its stats nor its forge bonus.
function equipmentStat(s: SaveState, key: string) { return Object.entries(s.gear).reduce((sum, [slot, id]) => slot === 'weapon' && s.gear.disguise ? sum : sum + levelledStat(s, id, key, (ITEMS[id]?.stats as Record<string, number> | undefined)?.[key] || 0), 0); }
function effect(s: SaveState, key: BuffKey, now = Date.now()) { const buff = s.buffs[key]; return buff && buff.expiresAt > now ? buff.value : 0; }
export function maxHp(s: SaveState) { return 100 + (s.level - 1) * 10 + s.healthUp * 25 + equipmentStat(s, 'hp'); }
export function attack(s: SaveState, now = Date.now()) { return (10 + (s.level - 1) * 1.5 + s.attackUp * 3 + equipmentStat(s, 'atk')) * (1 + (s.gear.weapon && !s.gear.disguise ? forgeLevel(s, s.gear.weapon) / 100 : 0)) * (1 + effect(s, 'atk', now)); }
export function defense(s: SaveState, now = Date.now()) { return s.defenseUp * 4 + (s.level - 1) + equipmentStat(s, 'def') + effect(s, 'def', now); }
export function activeStats(s: SaveState, now = Date.now()) {
    const gear = equipped(s), dz = s.gear.disguise ? DISGUISES[s.gear.disguise] : undefined;
    return { attack: attack(s, now), defense: defense(s, now), maxHp: maxHp(s), speed: 6 * Math.max(.2, 1 + equipmentStat(s, 'speed') + effect(s, 'speed', now)), critChance: Math.min(.85, .05 + s.critUp * .025 + equipmentStat(s, 'crit') + effect(s, 'crit', now)), critDamage: 2, haste: effect(s, 'haste', now), regen: equipmentStat(s, 'regen') + effect(s, 'regen', now), xp: effect(s, 'xp', now) + gear.reduce((n, i) => n + (i.xp || 0), 0), magnet: effect(s, 'magnet', now) ? 3 : 1, luck: effect(s, 'luck', now) + gear.reduce((n, i) => n + (i.luck || 0), 0), light: effect(s, 'light', now) > 0 || gear.some(i => i.light) || s.planet === 'lava' && (s.bag.fcrystal || 0) > 0, fireResistance: Math.min(1, effect(s, 'fireres', now)), lifesteal: (dz?.lifesteal || 0) + effect(s, 'lifesteal', now), lavaproof: gear.some(i => i.lavaproof), antidote: gear.some(i => i.antidote), poisonImmune: gear.some(i => i.antidote), flippers: s.gear.boots === 'boots_flipper', featherFall: gear.some(i => (i as any).featherfall), flying: false, sizeScale: s.sizeEffect && s.sizeEffect.expiresAt > now ? s.sizeEffect.scale : 1 };
}
export function weaponStats(s: SaveState): WeaponDef {
    const weapon = (s.gear.disguise && DISGUISES[s.gear.disguise]?.weapon) || (s.gear.weapon && ITEMS[s.gear.weapon]?.weapon);
    const stats: WeaponDef = { kind: 'fist', range: 1, cd: .5, special: 'fist', ...(weapon || {}) };
    // A uniform in the outfit slot brings its own fighting skill (uniform-skills.ts) in place of the weapon's special.
    const uniform = !s.gear.disguise && stats.kind !== 'rod' ? uniformSpecial(s.gear.outfit) : undefined;
    return uniform ? { ...stats, special: uniform } : stats;
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
        // A weaker effect never lengthens a stronger one still running (a nap must not stretch a cooked-berry XP buff).
        if (remaining && old!.value > value) continue;
        s.buffs[key] = { value: Math.max(value, remaining ? old!.value : 0), expiresAt: now + Math.min(600, buff.time + remaining * .5) * 1000, source };
    }
}
export function tickEffects(s: SaveState, dt: number, now = Date.now()) { if (!Number.isFinite(dt) || dt < 0)
    return; for (const key of Object.keys(s.buffs) as BuffKey[])
    if (s.buffs[key]!.expiresAt <= now)
        delete s.buffs[key]; s.hp = Math.min(maxHp(s), s.hp + activeStats(s, now).regen * Math.min(dt, 1)); }
export function addItem(s: SaveState, raw: ItemId, count = 1) { const id = canonicalItem(raw); if (!Object.hasOwn(ITEMS, id) || !Number.isSafeInteger(count) || count < 1)
    return false; const next = (s.bag[id] || 0) + count; if (!Number.isSafeInteger(next))
    return false;
    // The one slot check (storage-slots.ts): a new id needs a free slot; a full bag refuses and says so.
    if (!fits(s, { [id]: count })) { noteFull(delivering() ? 'chest' : 'bag'); return false; }
    noteDelivered(s, id); s.bag[id] = next; s.collection[id] = 1; return true; }
/** Whether the bag (or, while delivering, the chest) has room for all these items at once. */
export function canAddAll(s: SaveState, items: Inventory) { return fits(s, items); }
export const canAddItem = (s: SaveState, id: ItemId, count = 1) => fits(s, { [canonicalItem(id)]: count });
/** Grants that must never be lost (a first-defeat companion, quest and vault rewards): the bag when it has room, else the chest. */
export function stowItem(s: SaveState, raw: ItemId, count = 1): 'bag' | 'chest' | false {
    if (addItem(s, raw, count)) return 'bag';
    const id = canonicalItem(raw); if (!Object.hasOwn(ITEMS, id) || !Number.isSafeInteger(count) || count < 1 || !Number.isSafeInteger((s.chest[id] || 0) + count)) return false;
    clearFullNote(); s.chest[id] = (s.chest[id] || 0) + count; s.collection[id] = 1; return 'chest';
}
/**
 * Expands the backpack (+4 slots, 5 times) or the chest (+10 slots, 4 times) for the reference's energy and materials
 * (storage-slots.ts expansionCost), taken from the backpack. Returns the new size.
 */
export function expandStorage(s: SaveState, kind: StorageKind): { kind: StorageKind; level: number; size: number } | false {
    if (!isStorageKind(kind)) return false; const next = nextExpansion(s, kind);
    if (!next || s.energy < next.energy || !hasExpansionMaterials(s, next.materials)) return false;
    s.energy -= next.energy; for (const [id, n] of Object.entries(next.materials)) if (n) removeItem(s.bag, id, n);
    if (kind === 'bag') s.bagUp = next.level + 1; else s.chestUp = next.level + 1;
    return { kind, level: next.level + 1, size: next.next };
}
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
/** `bonus` is the Hard reward (+15%): the save's own by default; kills pass the room's creature scale, harvests the planting difficulty. */
export function gainXp(s: SaveState, amount: number, now = Date.now(), bonus = rewardScale(s)): number { if (!Number.isFinite(amount) || amount <= 0)
    return 0; const before = s.level; const gained = amount * (1 + activeStats(s, now).xp) * bonus; /* Hard: +15% */ if (!Number.isFinite(gained))
    return 0; if (!Number.isFinite(s.xp + gained))
    return 0; s.xp += gained; let guard = 0; while (s.xp >= xpNeeded(s.level) && guard++ < 10000) {
    s.xp -= xpNeeded(s.level);
    s.level++;
    s.hp = maxHp(s);
} return s.level - before; }
export function plant(s: SaveState, index: number, raw: CropId, now = Date.now()) { const crop = canonicalItem(raw), p = s.plots[index], def = Object.hasOwn(CROPS, crop) ? CROPS[crop] : undefined; if (!p || p.crop || !def || cropLevel(s, crop) > s.level || !Number.isFinite(now) || now < 0)
    return false; if (def.seed && !removeItem(s.bag, def.seed))
    return false; p.crop = crop; p.plantedAt = now; p.growDuration = bedGrowTime(p, cropGrowTime(s, crop)); p.difficulty = difficultyOf(s); s.nextPlantId = (s.nextPlantId || 0) + 1; p.generation = `${now}-${s.nextPlantId}`; return true; }
export function plantAll(s: SaveState, crop: CropId, now = Date.now()) { let count = 0; s.plots.forEach((_, i) => { if (plant(s, i, crop, now))
    count++; }); return count; }
export function cropDuration(p: Plot) { const def = p.crop && Object.hasOwn(CROPS, p.crop) ? CROPS[p.crop] : undefined; return def ? (Number.isFinite(p.growDuration) && p.growDuration! > 0 ? p.growDuration! : def.duration) : 0; }
export function cropProgress(p: Plot, now = Date.now()) { const duration = cropDuration(p); return duration ? Math.max(0, Math.min(1, (now - p.plantedAt) / duration)) : 0; }
export function harvest(s: SaveState, index: number, now = Date.now()): CropId | null { const p = s.plots[index]; if (!Number.isFinite(now) || now < 0 || !p?.crop || !(cropProgress(p, now) >= 1))
    return null; const id = p.crop; if (!addItem(s, id))
    return null; const at = isDifficulty(p.difficulty) ? { settings: { difficulty: p.difficulty } } : s; p.crop = null; p.plantedAt = 0; delete p.growDuration; delete p.generation; delete p.difficulty;
    // XP as planted (tree XP and the Hard bonus): switching after planting changes neither. The price is the same on every difficulty.
    gainXp(s, cropXp(at, id), now, rewardScale(at)); recordEvent(s, 'harvest', 1, id, now); return id; }
export function harvestAll(s: SaveState, now = Date.now()) { const harvested: CropId[] = []; s.plots.forEach((_, i) => { const id = harvest(s, i, now); if (id)
    harvested.push(id); }); return harvested; }
export function fertilize(s: SaveState, index: number, timeOrItem: number | string = Date.now(), raw = 'spore') {
    const now = typeof timeOrItem === 'number' ? timeOrItem : Date.now();
    const id = canonicalItem(typeof timeOrItem === 'string' ? timeOrItem : raw);
    const plot = s.plots[index];
    const crop = plot?.crop && Object.hasOwn(CROPS, plot.crop) ? CROPS[plot.crop] : undefined;
    const grow = Object.hasOwn(ITEMS, id) ? ITEMS[id].grow : undefined;
    // Fruit trees (tree-crops.ts) refuse fertilizer: they grow at their own pace.
    if (!crop || !grow || !Number.isFinite(grow) || grow <= 0 || isTreeCrop(plot.crop!) ||
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
export const BED_SCALE = .6, BED_HALF = .585, BED_STEP = 1.23, BED_GAP = 1.19, TRAIL_HALF = .55, BED_REACH = 17.4;
/*
 * Layout 4 (the 24-bed cap) took every bed to 0.75 of layout 3: BED_SCALE .8 -> .6, half side .78 -> .585, grid step
 * 1.64 -> 1.23 m (the ~7 cm path between frames scales with them), so the full 6 x 4 garden (7.4 x 4.9 m) fits in about
 * the ground the old 3 x 3 block and its first ring of extra beds used, and the rest of the yard is free again.
 */
/**
 * Crops shrink less than their beds (.88 -> .72, 0.82 instead of 0.75): a ripe crop still reads ~36 px tall on a phone,
 * and its leaves may overhang the smaller soil square a little, which reads as a full bed rather than a crowded one.
 */
export const CROP_SCALE = .72;
/** Centre of the garden; hand-placed beds may also go on the BED_STEP grid around it. */
export const GARDEN_CENTRE = { x: -9.15, z: 2.99 };
/** The garden grid: 6 columns x 4 rows; row 0 stands just north of the west trail (z >= BED_HALF + TRAIL_HALF). */
export const GARDEN_COLUMNS = 6, GARDEN_ROWS = 4;
const gridSpot = (column: number, row: number) => ({ x: +(GARDEN_CENTRE.x + (column - 2.5) * BED_STEP).toFixed(2), z: +(1.16 + row * BED_STEP).toFixed(2) });
/**
 * The 24 grid spots in fill order: the 3 x 3 starting block (west columns), then the east 3 x 3, then the north row.
 * Auto-placed beds take the first free one, so a growing garden fills the 6 x 4 grid instead of spreading.
 */
export const GARDEN_GRID = [
    ...Array.from({ length: 9 }, (_, i) => gridSpot(i % 3, Math.floor(i / 3))),
    ...Array.from({ length: 9 }, (_, i) => gridSpot(3 + i % 3, Math.floor(i / 3))),
    ...Array.from({ length: 6 }, (_, i) => gridSpot(i, 3)),
];
/** Where bed `i` sits by default: its spot on the 6 x 4 grid (the first nine are the starting 3 x 3 block). */
export function defaultBed(i: number) { return GARDEN_GRID[i] ? { ...GARDEN_GRID[i] } : gridSpot(i % GARDEN_COLUMNS, Math.floor(i / GARDEN_COLUMNS)); }
/** The starting grid of layout 3 (80 % beds): a 3 x 3 block 1.64 m apart around GARDEN_CENTRE. */
export function layout3Bed(i: number) { return { x: +(GARDEN_CENTRE.x + (i % 3 - 1) * 1.64).toFixed(2), z: +(GARDEN_CENTRE.z + (Math.floor(i / 3) - 1) * 1.64).toFixed(2) }; }
/** The starting grid of layout 2 (thick frames): 1.8 m apart from (-10.95, 0.05). */
export function layout2Bed(i: number) { return { x: +(-10.95 + (i % 3) * 1.8).toFixed(2), z: +(.05 + Math.floor(i / 3) * 1.8).toFixed(2) }; }
/** The starting grid of saves made before the beds shrank: 2.25 m apart from (-11.4, -0.4). */
export function legacyBed(i: number) { return { x: -11.4 + (i % 3) * 2.25, z: -.4 + Math.floor(i / 3) * 2.25 }; }
/** Saves on the current bed layout carry this; older ones are migrated by shrinkGarden. */
export const GARDEN_LAYOUT = 4;
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
const BED_GRID = Array.from({ length: 19 * 19 }, (_, i) => ({ x: +(GARDEN_CENTRE.x + (i % 19 - 9) * BED_STEP).toFixed(2), z: +(GARDEN_CENTRE.z + (Math.floor(i / 19) - 9) * BED_STEP).toFixed(2) }))
    .sort((a, b) => Math.hypot(a.x - GARDEN_CENTRE.x, a.z - GARDEN_CENTRE.z) - Math.hypot(b.x - GARDEN_CENTRE.x, b.z - GARDEN_CENTRE.z) || a.z - b.z || a.x - b.x);
/** The first free spot of the 6 x 4 garden grid (else the free grid spot nearest the garden) for a new square bed, or null. */
function freeBedSpot(s: SaveState, beds: readonly BedSpot[]) { const fits = (p: BedSpot) => bedClear(p.x, p.z) && bedRoom(s, p.x, p.z, 0, beds); return GARDEN_GRID.find(fits) ?? BED_GRID.find(fits) ?? null; }
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
export function shrinkGarden(s: SaveState, from = 1, now = Date.now()) {
    trimGarden(s, now);
    const [ox, oz, step] = from === 3 ? [GARDEN_CENTRE.x, GARDEN_CENTRE.z, 1.64] : from === 2 ? [-10.95, .05, 1.8] : [-11.4, -.4, 2.25], oldBed = from === 3 ? layout3Bed : from === 2 ? layout2Bed : legacyBed;
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
/** The most beds a garden holds (a 6 x 4 grid). */
export const MAX_PLOTS = STARTING_PLOTS + MAX_EXTRA_PLOTS;
/** What the bed at index `i` cost to add (gardenExpansionCost when the garden had `i` beds). */
export const bedPrice = (i: number) => 60 + Math.max(0, i - STARTING_PLOTS) * 20;
/** What trimGarden did, kept for a one-time note (main.ts; the 'ackTrim' action clears it). */
export interface TrimNote { beds: number; energy: number; items: Inventory }
/**
 * Saves from before the 24-bed cap may hold up to 33 beds. The beds over the cap go, least grown first (empty ones,
 * then the youngest crops); the nine starting beds always stay. The refund is what the most expensive beds cost (the
 * last N bought, whichever beds go: a kit in the bag would be useless at the cap), plus the removed beds' upgrades.
 * A crop on a removed bed moves, timers and all, to an empty bed that stays; failing that a ripe one is harvested,
 * one more than half grown comes back as the crop itself, and a younger one as its seed, or as its value pro rata
 * when it has none (the bag, else the chest). Returns the energy refunded; the totals go to s.gardenTrim.
 */
export function trimGarden(s: SaveState, now = Date.now()) {
    const excess = s.plots.length - MAX_PLOTS; if (excess <= 0) return 0;
    const items: Inventory = {}, grown = (i: number) => s.plots[i].crop ? cropProgress(s.plots[i], now) : -1;
    const give = (id: ItemId) => { if (!addItem(s, id)) s.chest[id] = (s.chest[id] || 0) + 1; items[id] = (items[id] || 0) + 1; };
    let refund = 0; for (let k = 1; k <= excess; k++) refund += bedPrice(s.plots.length - k);
    const extra = s.plots.map((_, i) => i).filter(i => i >= STARTING_PLOTS), removed = new Set(extra.sort((a, b) => grown(a) - grown(b) || b - a).slice(0, excess));
    const empty = s.plots.map((_, i) => i).filter(i => !removed.has(i) && !s.plots[i].crop);
    // The most grown crops get the free beds first.
    for (const i of [...removed].sort((a, b) => grown(b) - grown(a))) {
        const p = s.plots[i], crop = p.crop, progress = grown(i);
        for (let level = 0; level < bedLevel(p); level++) refund += bedUpgradeCost(s, level);
        if (!crop) continue;
        const to = empty.shift();
        if (to !== undefined) { Object.assign(s.plots[to], { crop, plantedAt: p.plantedAt, growDuration: cropDuration(p), ...(p.generation ? { generation: p.generation } : {}), ...(p.difficulty ? { difficulty: p.difficulty } : {}) }); continue; }
        if (progress >= 1) { if (harvest(s, i, now)) items[crop] = (items[crop] || 0) + 1; else give(crop); }
        else if (progress > .5) give(crop);
        else { const seed = CROPS[crop]?.seed; if (seed) give(seed); else refund += Math.round(sellPrice(s, crop) * progress); }
    }
    s.plots = s.plots.filter((_, i) => !removed.has(i));
    s.energy += refund; s.gardenTrim = { beds: excess, energy: refund, items }; return refund;
}
/** The trim note, once: reading it clears it. */
export function takeTrimNote(s: SaveState): TrimNote | Record<string, never> { const note = s.gardenTrim ?? {}; delete s.gardenTrim; return note; }
/**
 * Bed upgrades: each level HALVES that bed's grow time (level 1 = half, 2 = a quarter, 3 = an eighth), up to
 * BED_MAX_LEVEL 3. The level-L -> L+1 price doubles each step from 120 energy (120, 240, 480: 840 per bed); Normal and
 * Hard pay 1.5x (difficulty.ts). Saves from when a bed had five gentler 10 % levels (up to level 5) are set to level 3
 * on loading and get the energy of the two levels removed back (parseSave).
 */
export const BED_MAX_LEVEL = 3, BED_UPGRADE_BASE = 120, LEGACY_BED_MAX_LEVEL = 5;
export const bedLevel = (p: Plot | undefined) => p && Number.isSafeInteger(p.level) && p.level! > 0 ? Math.min(BED_MAX_LEVEL, p.level!) : 0;
/** How many times faster a bed of this level grows its crops (2, 4, 8). */
export const bedSpeedUp = (level: number) => 2 ** Math.max(0, Math.min(BED_MAX_LEVEL, level));
/** A crop's grow time on this bed: halved per level. */
export const bedGrowTime = (p: Plot | undefined, duration: number) => Math.max(1, Math.round(duration / bedSpeedUp(bedLevel(p))));
/** The energy to take a bed from `level` to `level + 1`. */
export function bedUpgradeCost(s: Parameters<typeof bedUpgradeScale>[0], level: number) { return Math.round(BED_UPGRADE_BASE * 2 ** level * bedUpgradeScale(s)); }
/**
 * Raises bed `i` one level. A crop already growing there speeds up at once: its timer is rescaled to the new level,
 * keeping the share it has grown (so an upgrade never makes a crop ripen in the past or lose progress).
 */
export function upgradeBed(s: SaveState, i: number, now = Date.now()) {
    const p = Number.isSafeInteger(i) ? s.plots[i] : undefined, level = bedLevel(p);
    if (s.planet !== 'home' || !p || level >= BED_MAX_LEVEL || !Number.isFinite(now) || now < 0) return false;
    const cost = bedUpgradeCost(s, level); if (s.energy < cost) return false;
    s.energy -= cost; p.level = level + 1;
    if (p.crop) {
        const before = cropDuration(p), progress = cropProgress(p, now);
        if (progress < 1 && before > 0) { const after = Math.max(1, Math.round(before / 2)); p.growDuration = after; p.plantedAt = Math.round(now - progress * after); }
    }
    return true;
}
/** Room for a new bed: apart from every other bed's square and clear of decorations, inside the fence. */
function bedRoom(s: SaveState, x: number, z: number, rotation = 0, beds: readonly BedSpot[] = bedSpots(s)) {
    return Number.isFinite(x) && Number.isFinite(z) && Math.hypot(x, z) <= 16.6 && !s.decorations.some(d => Math.hypot(x - d.x, z - d.z) < (ITEMS[d.id]?.collider || .6) + BED_GAP * .5)
        && beds.every(b => bedsApart(x, z, rotation, b.x, b.z, b.rotation ?? 0));
}
export function gardenExpansionCost(s: SaveState) { return 60 + Math.max(0, s.plots.length - STARTING_PLOTS) * 20; }
function placementFree(s: SaveState, x: number, z: number, radius: number, omit?: string) { return Number.isFinite(x) && Number.isFinite(z) && Math.hypot(x, z) <= 16.6 && !s.plots.some((_, i) => { const p = bedPosition(s, i); return Math.hypot(x - p.x, z - p.z) < radius; }) && !s.decorations.some(d => d.uid !== omit && Math.hypot(x - d.x, z - d.z) < (ITEMS[d.id]?.collider || .6) + radius * .5); }
/** Adds a bed (a kit from the bag, else energy): at (x, z) when given, otherwise automatically at the free spot nearest the garden. */
export function expandGarden(s: SaveState, x?: number, z?: number, rotation = 0) { if (s.planet !== 'home' || s.plots.length >= MAX_PLOTS)
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
    if (s.plots.length >= MAX_PLOTS) return 'max';
    if (s.planet !== 'home') return 'away';
    if ((s.bag.plot_kit || 0) > 0) return 'have';
    const cost = gardenExpansionCost(s);
    if (s.energy < cost || !addItem(s, 'plot_kit')) return 'energy';
    s.energy -= cost; return 'bought';
}
/** Packs an empty extra bed back into a garden bed kit (reference removeExtra); later beds move down one index. An upgraded bed stays (a kit cannot carry its level; it can still be moved). */
export function storeBed(s: SaveState, i: number) {
    if (s.planet !== 'home' || !isExtraBed(s, i) || s.plots[i].crop || bedLevel(s.plots[i]) > 0 || !addItem(s, 'plot_kit')) return false;
    s.plots.splice(i, 1); return true;
}
/** Reposition a bed without changing its crop or its original growing duration. */
export function moveBed(s: SaveState, i: number, x: number, z: number, rotation = 0) {
    if (s.planet !== 'home' || !Number.isInteger(i) || !s.plots[i] || !Number.isFinite(rotation) || !bedClear(x,z,rotation) || !bedRoom(s,x,z,rotation,bedSpots(s).filter((_,index)=>index!==i))) return false;
    Object.assign(s.plots[i], { x, z, rotation }); return true;
}
export * from './difficulty.ts';
export function sell(s: SaveState, raw: ItemId, count = 1) { const id = canonicalItem(raw), item = Object.hasOwn(ITEMS, id) ? ITEMS[id] : undefined; if (!item || !Number.isSafeInteger(count) || count < 1 || !item.sell || count > looseQuantity(s, id))
    return 0; const value = sellPrice(s, id) * count; if (!Number.isSafeInteger(value) || !Number.isSafeInteger(s.energy + value) || !removeItem(s.bag, id, count))
    return 0; s.energy += value; recordEvent(s, 'sell', value); return value; }
export function canCraft(s: SaveState, index: number) { const r = RECIPES[index]; return !!r && Number.isSafeInteger((s.bag[r.result] || 0) + (r.count || 1)) && fits(s, { [r.result]: r.count || 1 }) && s.energy >= r.energy && (r.station !== 'forge' || furnaceReady(s)) && hasMaterials(s, r.materials); }
// Materials come from the bag first, then the house chest at home (pantry.ts), as the kitchen's ingredients do.
export function craft(s: SaveState, index: number) { if (!canCraft(s, index))
    return (RECIPES[index] && !fits(s, { [RECIPES[index].result]: 1 }) && noteFull('bag'), false); const r = RECIPES[index]; if (!useMaterials(s, r.materials)) return false; s.energy -= r.energy; addItem(s, r.result, r.count || 1); recordEvent(s, 'craft'); return true; }
export function buy(s: SaveState, raw: ItemId) { const id = canonicalItem(raw); if (id === 'plot_kit') return buyPlotKit(s); const index = RECIPES.findIndex(r => r.station === 'shop' && r.result === id); return index >= 0 ? craft(s, index) : buySpecial(s, id); }
/** A special offer (special-offers.ts): crafted or boss-dropped gear and decorations, for energy only, at the server's price. */
function buySpecial(s: SaveState, id: ItemId) { const price = specialPrice(id); if (price === null || s.energy < price || !levelAllows(s.level, id) || !addItem(s, id)) return false; s.energy -= price; recordEvent(s, 'craft'); return true; }
/** A garden bed kit costs what the bed it adds would cost by Expand (gardenExpansionCost, counting kits already held); none at the 24-bed cap. */
export function kitPrice(s: SaveState): number | null { const beds = s.plots.length + (s.bag.plot_kit || 0); return beds >= MAX_PLOTS ? null : bedPrice(beds); }
/** The shop's price for an item now; null = not on sale (a bed kit at the cap). */
export function shopPrice(s: SaveState, id: ItemId): number | null { return id === 'plot_kit' ? kitPrice(s) : Object.hasOwn(ITEMS, id) ? ITEMS[id].price ?? specialPrice(id) : null; }
function buyPlotKit(s: SaveState) { const price = kitPrice(s); if (price === null || s.energy < price || !addItem(s, 'plot_kit')) return false; s.energy -= price; recordEvent(s, 'craft'); return true; }
/** Clothes: drawn on the explorer only without a disguise. */
export const WEARABLE_SLOTS: readonly GearSlot[] = ['hat', 'outfit', 'boots'];
export function equip(s: SaveState, raw: ItemId) { const id = canonicalItem(raw), item = Object.hasOwn(ITEMS, id) ? ITEMS[id] : undefined; if (!item?.slot || !s.bag[id])
    return false;
    // Level gates (level-gates.ts): late gear waits for its world's level; a piece already worn (an old save) stays on.
    if (s.gear[item.slot] !== id && !levelAllows(s.level, id))
    return false; s.gear[item.slot] = id;
    // A disguise covers clothes (World.avatar draws none under it): putting clothes on takes it off, as the try-on
    // preview shows (try-on.ts previewGear). Otherwise the equipped hat stayed invisible under the costume.
    if (WEARABLE_SLOTS.includes(item.slot)) delete s.gear.disguise;
    s.hp = Math.min(s.hp, maxHp(s)); if (item.slot === 'weapon' || item.slot === 'disguise')
    s.counters.equipped++; return true; }
// Own slots only: 'constructor' or '__proto__' from a client read Object.prototype and "succeeded" on the server.
export function unequip(s: SaveState, slot: GearSlot, auto = false) { if (!Object.hasOwn(s.gear, slot) || !s.gear[slot])
    return false;
    // Taken off, it needs a bag slot of its own unless loose copies are there already (reference: "Túi đồ đầy, không tháo ra được!").
    // The shore's automatic weapon swap (context-gear.ts) is not the player taking it off: it never fails on slots.
    if (!auto && !fits(s, { [s.gear[slot]!]: 1 })) { noteFull('bag'); return false; }
    delete s.gear[slot]; s.hp = Math.min(s.hp, maxHp(s)); return true; }
export function eat(s: SaveState, raw: ItemId, now = Date.now()) { const id = canonicalItem(raw), item = Object.hasOwn(ITEMS, id) ? ITEMS[id] : undefined; if (!item || !item.heal && !item.buff || !item.buff && s.hp >= maxHp(s) || !removeItem(s.bag, id))
    return false; if (item.heal)
    s.hp = Math.min(maxHp(s), s.hp + item.heal); if (item.buff)
    addBuff(s, item.buff, id, now); return true; }
// Ingredients within reach (bag, plus the chest at home) live in pantry.ts, shared by every home station.
export { looseQuantity, pantry, pantryIds, usePantry, hasMaterials, useMaterials, fromChest } from './pantry.ts';
export { SPECIAL_PRICE, TITAN_PRICE, isSpecial, specialPrice, specialSource, specialIds, SOURCE_NOTE } from './special-offers.ts';
export function cook(s: SaveState, raw: ItemId, count = 1) { const id = canonicalItem(raw), result = `cooked_${id}`; if (!Object.hasOwn(ITEMS, result) || s.planet !== 'home' || !kitchenOpen(s) || !Number.isSafeInteger(count) || count < 1 || !Number.isSafeInteger((s.bag[result] || 0) + count) || !canAddItem(s, result, count) && (noteFull('bag'), true) || !usePantry(s, id, count))
    return false; addItem(s, result, count); recordEvent(s, 'cook', count); return true; }
export function transfer(s: SaveState, raw: ItemId, toChest: boolean) { const id = canonicalItem(raw); if (toChest && looseQuantity(s, id) < 1)
    return false; const from = toChest ? s.bag : s.chest, to = toChest ? s.chest : s.bag; if (Object.hasOwn(ITEMS, id) && (from[id] || 0) > 0 && !(toChest ? chestFits(s, id) : fits(s, { [id]: 1 }))) { noteFull(toChest ? 'chest' : 'bag'); return false; } if (!Number.isSafeInteger((to[id] || 0) + 1) || !removeItem(from, id))
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
export function collectStardust(s: SaveState, rng: () => number = Math.random) { s.energy += 3; const shard = rng() < .08 && addItem(s, 'starshard'); return shard; }
export const QUESTS = STORY_STEPS.map((q, i) => ({ title: q.title, task: q.title, target: q.target, icon: q.icon, counter: q.condition || q.event || 'level', energy: 0, xp: 0, hint: `Chapter ${q.chapter + 1} · Step ${i + 1}` }));
export function questProgress(s: SaveState) { return progressEntries(s, 'story')[0]?.progress || 0; }
export function claimQuest(s: SaveState) { return claimProgress(s, 'story', `story:${s.progression.story.index}`); }
/** boost scales every drop chance (Hard: rewardScale). */
export function rollLoot(type: string, luck = 0, rng: () => number = Math.random, boost = 1) { const loot: {
    id: string;
    count: number;
}[] = []; for (const [id, chance, min, max] of LOOT_TABLES[type] || []) {
    if (rng() < Math.min(1, boost * chance * (chance < .5 ? 1 + Math.max(0, luck) : 1)))
        loot.push({ id, count: min + Math.min(max - min, Math.floor(rng() * (max - min + 1))) });
} return loot; }
/** Whether the explorer already has this item anywhere (bag, chest, worn gear or collection). */
export function ownsItem(s: SaveState, id: string) { return (s.bag[id] ?? 0) > 0 || (s.chest?.[id] ?? 0) > 0 || Object.values(s.gear ?? {}).includes(id) || !!s.collection?.[id]; }
/** The first defeat of a boss or titan guarantees its little companion (never a duplicate of one already owned). It goes
 * straight into the bag (whatever `bank` says) so it can never be lost on the ground; any same-pet roll of this kill is
 * folded into it. Returns the pet's id when one was given (for the client's toast), else undefined. */
function addFirstDefeatPet(s: SaveState, type: string, loot: { id: string; count: number }[]) {
    const id = type.startsWith('titan_') ? `pet_t_${type.slice(6)}` : `pet_b_${type}`;
    if (!Object.hasOwn(ITEMS, id) || ownsItem(s, id)) return undefined;
    for (let i = loot.length - 1; i >= 0; i--) if (loot[i].id === id) loot.splice(i, 1);
    stowItem(s, id, 1); return id; // a full bag sends it to the chest: never lost
}
/** Ground loot of a defeat; `pet` names the first-defeat companion already banked into the bag (not part of the list). */
export type DefeatLoot = { id: string; count: number }[] & { pet?: string };
/** bank=false leaves the loot out of the bag: the game tosses it onto the ground instead (drops.ts). `bonus`: the Hard
 * reward of the creatures fought (co-op: the room's scale, difficulty.ts scaleReward); solo it is the save's own. */
export function grantDefeat(s: SaveState, type: string, xp: number, boss = false, rng: () => number = Math.random, bank = true, bonus = rewardScale(s)): DefeatLoot { gainXp(s, xp, Date.now(), bonus); const first = boss && !(s.bosses ?? []).includes(`${s.planet}:${type}`), loot: DefeatLoot = rollLoot(type, activeStats(s).luck, rng, bonus); if (first) { const pet = addFirstDefeatPet(s, type, loot); if (pet) loot.pet = pet; } if (bank) for (const item of loot)
    stowItem(s, item.id, item.count); recordEvent(s, 'kill', 1, type); if (boss)
    { recordEvent(s, 'boss', 1, type); noteBossDefeat(s, type); } return loot; }
export function chooseFish(s: SaveState, water: string = s.planet, rng: () => number = Math.random) { const choices = FISH_WEIGHTS[water] || FISH_WEIGHTS.home, luck = activeStats(s).luck, weighted = choices.map(([id, weight]) => [id, weight * (ITEMS[id].legend ? 1 + luck * 1.5 : ITEMS[id].rare ? 1 + luck : 1)] as const); let draw = rng() * weighted.reduce((sum, [, w]) => sum + w, 0); for (const [id, weight] of weighted) {
    draw -= weight;
    if (draw <= 0)
        return id;
} return weighted[weighted.length - 1][0]; }
/**
 * The size bonus of a catch: 1 for a small or ordinary fish, rising to 2 (a double bonus) for the biggest the species grows
 * and past 2 up to 3 for a giant beyond that; a "huge" catch (the top of the sampling) is at least 1.6. The bonus pays that
 * many times the fish's value (energy) and experience; junk never gets one.
 */
export function catchMultiplier(fish: { size: number[]; rarity: string }, size?: number, huge = false) {
    if (fish.rarity === 'junk') return 1;
    const [lo, hi] = fish.size, f = size && Number.isFinite(size) && hi > lo ? (size - lo) / (hi - lo) : 0;
    const bySize = 1 + Math.max(0, Math.min(1, (f - .4) / .6)) + Math.max(0, Math.min(1, f - 1));
    return Math.max(huge ? 1.6 : 1, Math.round(bySize * 100) / 100);
}
export function grantCatch(s: SaveState, raw: ItemId, size?: number, hugeCatch = false) {
    const id = canonicalItem(raw), fish = Object.hasOwn(FISH, id) ? FISH[id] : undefined; if (!fish)
        return false;
    const huge = hugeCatch && fish.rarity !== 'junk', multiplier = catchMultiplier(fish, size, huge), bonus = Math.round(fish.sell * (multiplier - 1));
    if (!Number.isSafeInteger(s.energy + bonus) || !addItem(s, id))
        return false;
    gainXp(s, Math.round(fish.xp * (huge ? Math.max(2, multiplier) : multiplier))); s.energy += bonus;
    if (size && Number.isFinite(size))
        s.fishRecords[id] = Math.max(s.fishRecords[id] || 0, size);
    recordEvent(s, 'fish'); if (ITEMS[id].rare || ITEMS[id].legend)
        recordEvent(s, 'fishrare'); if (ITEMS[id].legend)
        recordEvent(s, 'legendFish');
    return true;
}
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
/**
 * Knocked out: every loose item in the backpack drops in a bag at the spot (death-bags.ts; the reference's whole-bag
 * drop), worn gear, the chest, level and energy stay. Up to 10 bags wait 24 hours each; an 11th banks the oldest into
 * the chest. Back home with full health. Returns the new bag, or null when the backpack was empty.
 */
export function die(s: SaveState, x: number, z: number, now = Date.now()): DeathBag | null {
    const items: Inventory = {};
    for (const id of Object.keys(s.bag)) { const n = looseQuantity(s, id); if (n) { items[id] = n; removeItem(s.bag, id, n); } }
    pruneBags(s, now);
    let bag: DeathBag | null = null;
    if (Object.keys(items).length && Number.isFinite(x) && Number.isFinite(z)) { bag = { id: bagId(s, now), x, z, planet: s.planet, items, at: now }; (s.deathBags ??= []).push(bag); }
    while ((s.deathBags?.length ?? 0) > MAX_DEATH_BAGS) {
        const old = s.deathBags!.shift()!;
        // Bank the oldest bag. At the numeric storage limit, keep the overflow in the newly emptied bag or the newest bag
        // instead of serializing an unsafe integer that a reload would discard.
        for (const [id, n] of Object.entries(old.items)) { let remaining = n!; for (const target of [s.chest, s.bag, ...(bag ? [bag.items] : [])]) { const moved = Math.min(remaining, Number.MAX_SAFE_INTEGER - (target[id] || 0)); if (moved > 0) target[id] = (target[id] || 0) + moved; remaining -= moved; if (!remaining) break; } }
    }
    s.planet = 'home'; s.hp = maxHp(s); s.buffs = {}; s.sizeEffect = null; return bag;
}
/**
 * Picks a dropped bag back up (`id`, else the oldest on this planet): what fits goes into the backpack, the rest stays
 * in the bag (reference: "Túi đầy! Vẫn còn đồ trong hũ."). False when there is no live bag here or nothing fits.
 */
export function recoverBag(s: SaveState, id?: string, now = Date.now()): { id: string; taken: Inventory; left: number } | false {
    pruneBags(s, now);
    const bag = (s.deathBags ?? []).find(b => b.planet === s.planet && (id === undefined || b.id === id)); if (!bag) return false;
    const taken: Inventory = {};
    for (const [item, n] of Object.entries(bag.items)) if (n && addItem(s, item, n)) { taken[item] = n; delete bag.items[item]; }
    if (!Object.keys(taken).length) return false;
    const left = Object.values(bag.items).reduce((sum: number, n) => sum + (n ?? 0), 0);
    if (!left) { s.deathBags = s.deathBags!.filter(b => b !== bag); if (!s.deathBags.length) delete s.deathBags; }
    clearFullNote(); return { id: bag.id, taken, left };
}
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
        const legacy = !(typeof v.contentVersion === 'number' && v.contentVersion >= 2), oldCropTimers = !(typeof v.contentVersion === 'number' && v.contentVersion >= 3), layoutBed = v.gardenLayout === GARDEN_LAYOUT ? defaultBed : v.gardenLayout === 3 ? layout3Bed : v.gardenLayout === 2 ? layout2Bed : legacyBed;
        const inventory = (data: unknown): Inventory => { const result: Inventory = {}; if (record(data))
            for (const [raw, n] of Object.entries(data)) {
                const id = canonicalItem(raw);
                if (Object.hasOwn(ITEMS, id) && Number.isSafeInteger(n) && n > 0 && Number.isSafeInteger((result[id] || 0) + n))
                    result[id] = (result[id] || 0) + n;
            } return result; };
        s.level = integer(v.level, 1, 1e9);
        s.xp = typeof v.xp === 'number' && Number.isFinite(v.xp) && v.xp >= 0 ? Math.min(v.xp, xpNeeded(s.level) * 2) : 0;
        s.energy = integer(v.energy);
        s.welcome = v.welcome === 'pending' ? 'pending' : 'done';
        s.healthUp = integer(v.healthUp, 0, 1e9);
        s.attackUp = integer(v.attackUp, 0, 1e9);
        s.defenseUp = integer(v.defenseUp, 0, 1e9);
        s.critUp = integer(v.critUp, 0, 28);
        s.bag = inventory(v.bag);
        s.chest = inventory(v.chest);
        s.forge = parseForge(v.forge);
        { const gear = parseGearLevels(v.gearLevels), skills = parseSkillLevels(v.skillLevels); if (gear) s.gearLevels = gear; if (skills) s.skillLevels = skills; }
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
        // Migration refunds use the saved difficulty's prices, so restore preferences before the beds.
        const settings = record(v.settings) ? v.settings : {};
        s.settings = { ...parseAudio(settings), lowGraphics: settings.lowGraphics === true, ...(typeof settings.movePad === 'boolean' ? { movePad: settings.movePad } : {}) };
        if(settings.joystickSide==='left'||settings.joystickSide==='right')s.settings.joystickSide=settings.joystickSide;
        if(settings.keyboardLayout==='classic'||settings.keyboardLayout==='wasd')s.settings.keyboardLayout=settings.keyboardLayout;
        if (settings.renderRes === 'sharp' || settings.renderRes === 'balanced' || settings.renderRes === 'saver') s.settings.renderRes = settings.renderRes;
        if (settings.placeBeds === true) s.settings.placeBeds = true;
        if (settings.tester === true) s.settings.tester = true;
        s.settings.difficulty = isDifficulty(settings.difficulty) ? settings.difficulty : 'easy'; // saves from before the setting play on Easy
        if (typeof settings.difficultyLoweredAt === 'number' && Number.isFinite(settings.difficultyLoweredAt) && settings.difficultyLoweredAt > 0) s.settings.difficultyLoweredAt = settings.difficultyLoweredAt;
        let bedRefund = 0; // energy back for upgrade levels above BED_MAX_LEVEL in older saves
        s.plots = v.plots.slice(0, LEGACY_MAX_PLOTS).map((p: unknown, i: number) => {
            const rawCrop = record(p) && typeof p.crop === 'string' ? canonicalItem(p.crop) : null;
            const crop = rawCrop && Object.hasOwn(CROPS, rawCrop) ? rawCrop : null;
            const point = record(p) && Number.isFinite(p.x) && Number.isFinite(p.z) ? { x: p.x, z: p.z } : layoutBed(i);
            if (record(p) && Number.isSafeInteger(p.level)) for (let l = BED_MAX_LEVEL; l < Math.min(LEGACY_BED_MAX_LEVEL, p.level); l++) bedRefund += bedUpgradeCost(s, l);
            const level = record(p) && Number.isSafeInteger(p.level) && p.level > 0 ? { level: Math.min(BED_MAX_LEVEL, p.level) } : {};
            const rotation = record(p) && typeof p.rotation === 'number' && Number.isFinite(p.rotation) && p.rotation ? { rotation: p.rotation } : {};
            // Fertilizer may legitimately advance a synthetic-clock planting before epoch zero.
            const plantedAt = record(p) && Number.isSafeInteger(p.plantedAt) && p.plantedAt >= -14*86400000 ? p.plantedAt : 0;
            const duration = crop ? CROPS[crop].duration / (oldCropTimers && LEGACY_CROP_IDS.includes(crop) ? 10 : 1) : 0;
            const growDuration = crop && record(p) && typeof p.growDuration === 'number' && Number.isFinite(p.growDuration) && p.growDuration > 0 && p.growDuration <= 14 * 86400000 ? p.growDuration : duration;
            const generation = crop ? record(p) && typeof p.generation === 'string' && /^[a-zA-Z0-9:_-]{1,100}$/.test(p.generation) ? p.generation : `legacy:${i}:${plantedAt}:${crop}` : undefined;
            const rawChoice = record(p) && typeof p.choice === 'string' ? canonicalItem(p.choice) : '', choice = Object.hasOwn(CROPS, rawChoice) ? { choice: rawChoice } : {};
            return { crop, plantedAt, ...point, ...rotation, ...level, ...choice, ...(crop ? { growDuration, generation, ...(record(p) && isDifficulty(p.difficulty) ? { difficulty: p.difficulty as Difficulty } : {}) } : {}) };
        });
        if (bedRefund > 0 && Number.isSafeInteger(s.energy + bedRefund)) s.energy += bedRefund;
        if (legacy) {
            const target = Math.min(MAX_PLOTS, s.plots.length + 3);
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
        // Layout 4 (24-bed cap): older saves are trimmed to 24 and their beds moved onto the 6 x 4 grid (shrinkGarden).
        const bedKey = (i: number) => { const p = bedPosition(s, i); return `${p.x.toFixed(2)},${p.z.toFixed(2)}`; }, oldKeys = new Map(s.plots.map((p, i) => [p, bedKey(i)]));
        if (v.gardenLayout === GARDEN_LAYOUT) { trimGarden(s); settleBeds(s); } else shrinkGarden(s, v.gardenLayout === 3 ? 3 : v.gardenLayout === 2 ? 2 : 1);
        if (!s.gardenTrim && record(v.gardenTrim) && Number.isSafeInteger(v.gardenTrim.beds) && v.gardenTrim.beds > 0) s.gardenTrim = { beds: Math.min(99, v.gardenTrim.beds), energy: integer(v.gardenTrim.energy), items: inventory(v.gardenTrim.items) };
        s.farm = parseFarm(v.farm);
        const hunting = parseHunting(v.hunting); if (hunting) s.hunting = hunting;
        if (v.fists === true && !s.gear.weapon) s.fists = true;
        if (record(v.helper)) {
            s.helper = parseHelper(v.helper);
            // The robot's "replant the same" memory is keyed by bed position (helper.ts bedKey): follow the beds that moved.
            const last = { ...s.helper.last };
            s.plots.forEach((p, i) => { const crop = last[oldKeys.get(p) ?? ''] ?? last[bedKey(i)]; if (crop) { delete s.helper!.last[bedKey(i)]; s.helper!.last[bedKey(i)] = crop; } }); // newest last: parseHelper keeps the newest 64
        }
        const awayStore = inventory(v.awayStore); if (Object.keys(awayStore).length) s.awayStore = awayStore;
        const friends = parseFriends(v.friends), bosses = parseBosses(v.bosses); if (friends.length) s.friends = friends;
        // Gear given before borrowing (ab819d1) left the bag: put that copy back once, so taking it off or the cook's change of clothes never destroys it.
        for (const f of friends) if (!f.borrowed) { for (const item of Object.values(f.gear)) if (item && !(s.bag[item] ?? 0)) addItem(s, item); f.borrowed = true; } if (bosses.length) s.bosses = bosses; const house = parseHouse(v.house); if (house) s.house = house;
        const dungeon = parseDungeon(v.dungeon); if (dungeon) s.dungeon = dungeon;
        const ctf = parseCtf(v.ctf); if (ctf) s.ctf = ctf;
        const looks = parseLooks(v.looks); if (looks) s.looks = looks; else delete s.looks; // older saves keep the look they had: the default hero
        dropUnownedFriendLooks(s);
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
        s.savedAt = integer(v.savedAt, s.savedAt);
        // Dropped bags (death-bags.ts); an older save's single `dropped` bag counts from its last save.
        { const bags = parseDeathBags(v.deathBags, v.dropped, s.savedAt, inventory); if (bags.length) s.deathBags = bags; }
        for (const kind of ['bagUp', 'chestUp'] as const) { const level = integer(v[kind], 0, kind === 'bagUp' ? 5 : 4); if (level) s[kind] = level; }
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
