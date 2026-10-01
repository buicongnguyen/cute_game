import { ITEMS, CROPS, PLANETS, RECIPES, DISGUISES, FISH, FISH_WEIGHTS, LOOT_TABLES, UPGRADES, STARTING_PLOTS, MAX_EXTRA_PLOTS, MAX_DECORATIONS, STORY_STEPS, canonicalItem, type ItemId, type Inventory, type GearSlot, type CropId, type PlanetId, type BuffKey, type BuffDef, type WeaponDef } from './content.ts';
import { createProgression, normalizeProgression, recordEvent, progressEntries, claimProgress, type ProgressionState } from './progression.ts';
export * from './content.ts';
export { recordEvent, progressEntries, claimProgress, type ProgressKind, type ProgressEntry } from './progression.ts';
export interface Plot {
    crop: CropId | null;
    plantedAt: number;
    x?: number;
    z?: number;
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
    contentVersion: 2;
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
}
export const COLORS = ['#4aa8ff', '#ff7ab0', '#6fd35a', '#ffb13d', '#a07bff', '#ff5a5a'];
export const SAVE_KEY = 'cute-game-save-v1';
export function newGame(name = 'Clover', color = COLORS[0]): SaveState { return { version: 1, contentVersion: 2, name: name.slice(0, 20) || 'Clover', color, level: 1, xp: 0, hp: 100, energy: 0, bag: {}, chest: {}, gear: {}, plots: Array.from({ length: STARTING_PLOTS }, (_, i) => ({ crop: null, plantedAt: 0, x: -11.4 + (i % 3) * 2.25, z: -.4 + Math.floor(i / 3) * 2.25 })), counters: { harvests: 0, sold: 0, bought: 0, equipped: 0, kills: 0, upgrades: 0, fish: 0, skills: 0 }, quest: 0, healthUp: 0, attackUp: 0, defenseUp: 0, critUp: 0, planet: 'home', visited: ['home'], discovered: ['home'], settings: { sound: true, lowGraphics: false }, worldRewards: { mineReadyAt: {}, collectedGifts: {}, giftReadyAt: {}, resourceReadyAt: {}, lava: { gateOpen: false, braziers: [] } }, buffs: {}, sizeEffect: null, decorations: [], nextDecorationId: 1, collection: {}, fishRecords: {}, progression: createProgression(), dropped: null, savedAt: Date.now() }; }
export function xpNeeded(level: number) { return Math.round(25 * Math.pow(Math.max(1, level), 1.55)); }
function equipped(s: SaveState) { return Object.values(s.gear).map(id => ITEMS[id]).filter(Boolean); }
function equipmentStat(s: SaveState, key: string) { return equipped(s).reduce((sum, item) => sum + ((item.stats as Record<string, number> | undefined)?.[key] || 0), 0); }
function effect(s: SaveState, key: BuffKey, now = Date.now()) { const buff = s.buffs[key]; return buff && buff.expiresAt > now ? buff.value : 0; }
export function maxHp(s: SaveState) { return 100 + (s.level - 1) * 10 + s.healthUp * 25 + equipmentStat(s, 'hp'); }
export function attack(s: SaveState, now = Date.now()) { return (10 + (s.level - 1) * 1.5 + s.attackUp * 3 + equipmentStat(s, 'atk')) * (1 + effect(s, 'atk', now)); }
export function defense(s: SaveState, now = Date.now()) { return s.defenseUp * 4 + (s.level - 1) + equipmentStat(s, 'def') + effect(s, 'def', now); }
export function activeStats(s: SaveState, now = Date.now()) {
    const gear = equipped(s), dz = s.gear.disguise ? DISGUISES[s.gear.disguise] : undefined;
    return { attack: attack(s, now), defense: defense(s, now), maxHp: maxHp(s), speed: 6 * Math.max(.2, 1 + equipmentStat(s, 'speed') + effect(s, 'speed', now)), critChance: Math.min(.85, .05 + s.critUp * .025 + equipmentStat(s, 'crit') + effect(s, 'crit', now)), critDamage: 2, haste: effect(s, 'haste', now), regen: equipmentStat(s, 'regen') + effect(s, 'regen', now), xp: effect(s, 'xp', now) + gear.reduce((n, i) => n + (i.xp || 0), 0), magnet: effect(s, 'magnet', now) ? 3 : 1, luck: effect(s, 'luck', now) + gear.reduce((n, i) => n + (i.luck || 0), 0), light: effect(s, 'light', now) > 0 || gear.some(i => i.light), fireResistance: Math.min(1, effect(s, 'fireres', now)), lifesteal: (dz?.lifesteal || 0) + effect(s, 'lifesteal', now), lavaproof: gear.some(i => i.lavaproof), antidote: gear.some(i => i.antidote), poisonImmune: gear.some(i => i.antidote), flippers: s.gear.boots === 'boots_flipper', featherFall: gear.some(i => (i as any).featherfall), flying: false, sizeScale: s.sizeEffect && s.sizeEffect.expiresAt > now ? s.sizeEffect.scale : 1 };
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
    return false; p.crop = crop; p.plantedAt = now; return true; }
export function plantAll(s: SaveState, crop: CropId, now = Date.now()) { let count = 0; s.plots.forEach((_, i) => { if (plant(s, i, crop, now))
    count++; }); return count; }
export function cropProgress(p: Plot, now = Date.now()) { const def = p.crop && Object.hasOwn(CROPS, p.crop) ? CROPS[p.crop] : undefined; return def ? Math.max(0, Math.min(1, (now - p.plantedAt) / def.duration)) : 0; }
export function harvest(s: SaveState, index: number, now = Date.now()): CropId | null { const p = s.plots[index]; if (!p?.crop || cropProgress(p, now) < 1)
    return null; const id = p.crop; if (!addItem(s, id))
    return null; p.crop = null; p.plantedAt = 0; gainXp(s, CROPS[id].xp, now); recordEvent(s, 'harvest', 1, id, now); return id; }
export function harvestAll(s: SaveState, now = Date.now()) { const harvested: CropId[] = []; s.plots.forEach((_, i) => { const id = harvest(s, i, now); if (id)
    harvested.push(id); }); return harvested; }
export function fertilize(s: SaveState, index: number, timeOrItem: number | string = Date.now(), raw = 'spore') { const now = typeof timeOrItem === 'number' ? timeOrItem : Date.now(), id = canonicalItem(typeof timeOrItem === 'string' ? timeOrItem : raw), p = s.plots[index], grow = ITEMS[id]?.grow; if (!p?.crop || !grow || cropProgress(p, now) >= 1 || !removeItem(s.bag, id))
    return false; const remaining = CROPS[p.crop].duration * (1 - cropProgress(p, now)); p.plantedAt -= remaining * grow; return true; }
/**
 * Ground at home that a garden bed must stay off (G2D-4), matching World.build: the cottage, stalls, chest, crystal,
 * starship pad, workshop, kitchen, well, village trees (crown, not just trunk), the fence-side bushes and the pond.
 */
export const HOME_CLEARANCE: readonly { x: number; z: number; r: number }[] = [
    { x: 0, z: -8, r: 3.2 }, { x: 9, z: 2.5, r: 2 }, { x: 9.6, z: 10.6, r: 2 }, { x: -3.3, z: -4.9, r: 1 }, { x: 8.5, z: -7, r: 1.5 },
    { x: 13.5, z: -3, r: 2 }, { x: 5.5, z: 6.5, r: 1.3 }, { x: 1, z: 10.5, r: 1.4 }, { x: -7, z: -11, r: 1.4 }, { x: -7.5, z: 11.2, r: 3.6 },
    ...[[-13, -8], [-14, 7], [3, -13], [10, -11], [14, 5], [-2, 15]].map(([x, z]) => ({ x, z, r: 1.2 })),
    ...Array.from({ length: 16 }, (_, i) => { const a = (i + .5) / 16 * Math.PI * 2; return { x: Math.cos(a) * 16.4, z: Math.sin(a) * 16.4, r: .8 }; }),
];
/** Half the side of a bed's frame (2.12 m), the stepping-stone trails' half-width and the farthest a bed corner may reach. */
export const BED_HALF = 1.06, TRAIL_HALF = .55, BED_REACH = 17.4;
/** Whether a bed centred here keeps off the home obstacles, the four trails along the axes and the fence. */
export function bedClear(x: number, z: number) {
    if (!Number.isFinite(x) || !Number.isFinite(z) || Math.hypot(Math.abs(x) + BED_HALF, Math.abs(z) + BED_HALF) > BED_REACH) return false;
    if (Math.abs(x) < BED_HALF + TRAIL_HALF || Math.abs(z) < BED_HALF + TRAIL_HALF) return false;
    return HOME_CLEARANCE.every(o => Math.hypot(Math.max(0, Math.abs(o.x - x) - BED_HALF), Math.max(0, Math.abs(o.z - z) - BED_HALF)) >= o.r);
}
/** Centre of the starting garden; new beds grow outward from it on the 2.25 m garden grid. */
const GARDEN_CENTRE = { x: -9.15, z: 1.85 };
const BED_GRID = Array.from({ length: 15 * 15 }, (_, i) => ({ x: +(-11.4 + (i % 15 - 7) * 2.25).toFixed(2), z: +(-.4 + (Math.floor(i / 15) - 7) * 2.25).toFixed(2) }))
    .sort((a, b) => Math.hypot(a.x - GARDEN_CENTRE.x, a.z - GARDEN_CENTRE.z) - Math.hypot(b.x - GARDEN_CENTRE.x, b.z - GARDEN_CENTRE.z) || a.z - b.z || a.x - b.x);
/** The free grid spot nearest the garden for a new bed (the first `count` beds count as placed), or null. */
function freeBedSpot(s: SaveState, count = s.plots.length) {
    const placed = { ...s, plots: s.plots.slice(0, count) };
    return BED_GRID.find(p => bedClear(p.x, p.z) && placementFree(placed, p.x, p.z, 2.15)) ?? null;
}
/** Moves saved beds that sit on an obstacle or on an earlier bed (older saves placed them blindly) to free ground. */
export function settleBeds(s: SaveState) {
    let moved = 0;
    s.plots.forEach((p, i) => {
        const x = p.x ?? (-11.4 + i % 3 * 2.25), z = p.z ?? (-.4 + Math.floor(i / 3) * 2.25);
        const crowded = s.plots.slice(0, i).some((q, j) => Math.hypot(x - (q.x ?? (-11.4 + j % 3 * 2.25)), z - (q.z ?? (-.4 + Math.floor(j / 3) * 2.25))) < 2.15);
        // The nine starting beds are laid out by hand; only check them against each other.
        if (i < STARTING_PLOTS && !crowded || bedClear(x, z) && !crowded) return;
        const spot = freeBedSpot(s, i); if (!spot) return;
        p.x = spot.x; p.z = spot.z; moved++;
    });
    return moved;
}
export function gardenExpansionCost(s: SaveState) { return 60 + Math.max(0, s.plots.length - STARTING_PLOTS) * 20; }
function placementFree(s: SaveState, x: number, z: number, radius: number, omit?: string) { return Number.isFinite(x) && Number.isFinite(z) && Math.hypot(x, z) <= 16.6 && !s.plots.some((p, i) => Math.hypot(x - (p.x ?? (-11.4 + i % 3 * 2.25)), z - (p.z ?? (-.4 + Math.floor(i / 3) * 2.25))) < radius) && !s.decorations.some(d => d.uid !== omit && Math.hypot(x - d.x, z - d.z) < (ITEMS[d.id]?.collider || .6) + radius * .5); }
export function expandGarden(s: SaveState, x?: number, z?: number) { if (s.planet !== 'home' || s.plots.length >= STARTING_PLOTS + MAX_EXTRA_PLOTS)
    return false; const cost = gardenExpansionCost(s), kit = (s.bag.plot_kit || 0) > 0; if (!kit && s.energy < cost)
    return false; if (x === undefined || z === undefined) {
    const spot = freeBedSpot(s);
    if (!spot)
        return false;
    x = spot.x;
    z = spot.z;
} if (!bedClear(x, z) || !placementFree(s, x, z, 2.15))
    return false; if (kit)
    removeItem(s.bag, 'plot_kit');
else
    s.energy -= cost; s.plots.push({ crop: null, plantedAt: 0, x: x!, z: z! }); recordEvent(s, 'expand'); return true; }
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
    s.healthUp++;
    s.hp = maxHp(s);
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
export function grantDefeat(s: SaveState, type: string, xp: number, boss = false, rng: () => number = Math.random) { gainXp(s, xp); const loot = rollLoot(type, activeStats(s).luck, rng); for (const item of loot)
    addItem(s, item.id, item.count); recordEvent(s, 'kill', 1, type); if (boss)
    recordEvent(s, 'boss', 1, type); return loot; }
export function chooseFish(s: SaveState, water: string = s.planet, rng: () => number = Math.random) { const choices = FISH_WEIGHTS[water] || FISH_WEIGHTS.home, luck = activeStats(s).luck, weighted = choices.map(([id, weight]) => [id, weight * (ITEMS[id].legend ? 1 + luck * 1.5 : ITEMS[id].rare ? 1 + luck : 1)] as const); let draw = rng() * weighted.reduce((sum, [, w]) => sum + w, 0); for (const [id, weight] of weighted) {
    draw -= weight;
    if (draw <= 0)
        return id;
} return weighted[weighted.length - 1][0]; }
export function grantCatch(s: SaveState, raw: ItemId, size?: number, hugeCatch = false) { const id = canonicalItem(raw), fish = Object.hasOwn(FISH, id) ? FISH[id] : undefined; if (!fish)
    return false; const huge = hugeCatch && fish.rarity !== 'junk'; if (!addItem(s, id))
    return false; gainXp(s, fish.xp * (huge ? 2 : 1)); if (huge)
    s.energy += Math.round(fish.sell * .6); if (size && Number.isFinite(size))
    s.fishRecords[id] = Math.max(s.fishRecords[id] || 0, size); recordEvent(s, 'fish'); if (ITEMS[id].rare || ITEMS[id].legend)
    recordEvent(s, 'fishrare'); if (ITEMS[id].legend)
    recordEvent(s, 'legendFish'); return true; }
export function placeDecoration(s: SaveState, raw: ItemId, x: number, z: number, rotation = 0) { const id = canonicalItem(raw), item = Object.hasOwn(ITEMS, id) ? ITEMS[id] : undefined; if (item?.type === 'placeable')
    return expandGarden(s, x, z); if (s.planet !== 'home' || item?.type !== 'decor' || s.decorations.length >= MAX_DECORATIONS || !Number.isFinite(rotation) || !placementFree(s, x, z, 1.9) || !removeItem(s.bag, id))
    return false; s.decorations.push({ uid: `decor-${s.nextDecorationId++}`, id, x, z, rotation }); recordEvent(s, 'decorate'); return true; }
export function moveDecoration(s: SaveState, uid: string, x: number, z: number, rotation?: number) { const d = s.decorations.find(d => d.uid === uid); if (!d || s.planet !== 'home' || !placementFree(s, x, z, 1.9, uid) || rotation !== undefined && !Number.isFinite(rotation))
    return false; d.x = x; d.z = z; if (rotation !== undefined)
    d.rotation = rotation; return true; }
export function removeDecoration(s: SaveState, uid: string) { const index = s.decorations.findIndex(d => d.uid === uid); if (index < 0 || s.planet !== 'home')
    return false; const [d] = s.decorations.splice(index, 1); addItem(s, d.id); return true; }
export const MINE_REGROW_MS = 20000;
export function mineAvailable(s: SaveState, planet: PlanetId, index: number, now = Date.now()) { return Object.hasOwn(PLANETS, planet) && planet !== 'home' && Number.isInteger(index) && index >= 0 && index < 2 && Number.isFinite(now) && now >= 0 && now <= Number.MAX_SAFE_INTEGER - MINE_REGROW_MS && now >= (s.worldRewards.mineReadyAt[planet]?.[index] || 0); }
export function claimMine(s: SaveState, index: number, now = Date.now()) { if (!mineAvailable(s, s.planet, index, now))
    return false; (s.worldRewards.mineReadyAt[s.planet] ??= [0, 0])[index] = now + MINE_REGROW_MS; const material: Record<PlanetId, string> = { home: 'stone', candy: 'sugar', ice: 'icecrystal', lava: 'mcrystal', toy: 'gear', jungle: 'vine', ocean: 'coral', cloud: 'feather', shadow: 'shadow' }; addItem(s, material[s.planet]); recordEvent(s, 'mine', 1, undefined, now); return true; }
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
    (s.worldRewards.giftReadyAt.toy ??= Array(GIFT_COUNT).fill(0))[index] = now + GIFT_REGROW_MS;
    const choices: [
        GiftOutcome['kind'],
        number,
        string
    ][] = [['giant', 3, 'Giant power!'], ['tiny', 3, 'Tiny speed!'], ['coins', 3, 'Energy shower!'], ['heal', 2, 'Fully healed!'], ['bomb', 2, 'Surprise explosion!'], ['toys', 3, 'Toy parts!'], ['curse', 1, 'Sticky feet!']];
    let draw = Math.max(0, Math.min(.999999999, rng())) * 17, choice = choices[0];
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
        result.energy = 20 + Math.round(rng() * 40) + s.level * 2;
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
        addItem(s, 'gear', 2 + Math.min(2, Math.floor(rng() * 3)));
        if (rng() < .15)
            addItem(s, 'battery');
    }
    else
        s.buffs.speed = { value: -.4, expiresAt: now + 8000, source: 'gift' };
    return result;
}
export function claimEnvironmentResource(s: SaveState, key: string, raw: ItemId, now = Date.now(), cooldownMs = 20000) { const id = canonicalItem(raw); if (!/^[a-zA-Z0-9:_-]{1,100}$/.test(key) || ['constructor', '__proto__', 'prototype'].includes(key) || !Object.hasOwn(ITEMS, id) || !Number.isFinite(now) || now < 0 || now > 8.64e15-86400000 || !Number.isFinite(cooldownMs) || cooldownMs < 0 || now < (s.worldRewards.resourceReadyAt[key] || 0))
    return false; s.worldRewards.resourceReadyAt[key] = now + Math.min(cooldownMs, 86400000); addItem(s, id); recordEvent(s, 'mine', 1, undefined, now); return true; }
export function openCave(s: SaveState) { if (s.planet !== 'lava' || s.worldRewards.lava.gateOpen)
    return false; s.worldRewards.lava.gateOpen = true; return true; }
export function lightBrazier(s: SaveState, index: number, rng:()=>number=Math.random) { const lava = s.worldRewards.lava; if (s.planet !== 'lava' || !Number.isInteger(index) || index < 0 || index > 2 || lava.braziers.includes(index) || !removeItem(s.bag, 'fcrystal'))
    return false; lava.braziers.push(index);
    if(lava.braziers.length===3){addItem(s,'firecore',2);addItem(s,'deco_volcano');addItem(s,'obsidian',2+Math.min(1,Math.floor(rng()*2)));}
    return true; }
export function furnaceReady(s: SaveState) { return s.worldRewards.lava.braziers.length === 3; }
export function claimCaveChest(s: SaveState, now = Date.now(), rng: () => number = Math.random) { if (!Number.isFinite(now) || Math.abs(now) > 8.64e15)
    return false; const date = new Date(now).toISOString().slice(0, 10), lava = s.worldRewards.lava; if (s.planet !== 'lava' || !lava.gateOpen || lava.caveChestDay === date)
    return false; lava.caveChestDay = date; addItem(s, 'obsidian', 3 + Math.min(2, Math.floor(rng() * 3))); addItem(s, 'firecore', 1 + Math.min(1, Math.floor(rng() * 2))); if (rng() < .35)
    addItem(s, 'dragonegg'); if (rng() < .3)
    addItem(s, 'deco_nest'); if (rng() < .5)
    addItem(s, 'starshard'); return true; }
export function die(s: SaveState, x: number, z: number) { const items: Inventory = {}; for (const id of Object.keys(s.bag)) {
    const n = looseQuantity(s, id);
    if (n) {
        items[id] = n;
        removeItem(s.bag, id, n);
    }
} if (s.dropped)
    for (const [id, n] of Object.entries(s.dropped.items))
        s.chest[id] = (s.chest[id] || 0) + n!; s.dropped = Object.keys(items).length ? { x, z, planet: s.planet, items } : null; s.planet = 'home'; s.hp = maxHp(s); s.buffs = {}; s.sizeEffect = null; }
export function recoverBag(s: SaveState) { if (!s.dropped || s.dropped.planet !== s.planet)
    return false; for (const [id, n] of Object.entries(s.dropped.items))
    addItem(s, id, n); s.dropped = null; return true; }
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
        const legacy = v.contentVersion !== 2;
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
        if (record(v.gear))
            for (const [rawSlot, rawId] of Object.entries(v.gear)) {
                if (typeof rawId !== 'string')
                    continue;
                const id = canonicalItem(rawId), slot = rawSlot === 'armor' ? 'outfit' : rawSlot === 'feet' ? 'boots' : rawSlot;
                if (Object.hasOwn(ITEMS, id) && s.bag[id] && ITEMS[id].slot === slot)
                    s.gear[slot as GearSlot] = id;
            }
        s.hp = Math.min(typeof v.hp === 'number' && Number.isFinite(v.hp) && v.hp >= 0 ? v.hp : 100, maxHp(s));
        s.plots = v.plots.slice(0, STARTING_PLOTS + MAX_EXTRA_PLOTS).map((p: unknown, i: number) => { const crop = record(p) && typeof p.crop === 'string' ? canonicalItem(p.crop) : null; const point = record(p) && Number.isFinite(p.x) && Number.isFinite(p.z) ? { x: p.x, z: p.z } : { x: -11.4 + (i % 3) * 2.25, z: -.4 + Math.floor(i / 3) * 2.25 }; return { crop: crop && Object.hasOwn(CROPS, crop) ? crop : null, plantedAt: record(p) ? integer(p.plantedAt) : 0, ...point }; });
        if (legacy) {
            const target = Math.min(STARTING_PLOTS + MAX_EXTRA_PLOTS, s.plots.length + 3);
            while (s.plots.length < target)
                s.plots.push({ crop: null, plantedAt: 0, x: -11.4 + (s.plots.length % 3) * 2.25, z: -.4 + Math.floor(s.plots.length / 3) * 2.25 });
        }
        while (s.plots.length < STARTING_PLOTS)
            s.plots.push({ crop: null, plantedAt: 0, x: -11.4 + (s.plots.length % 3) * 2.25, z: -.4 + Math.floor(s.plots.length / 3) * 2.25 });
        for (const key of Object.keys(s.counters) as (keyof Counters)[])
            s.counters[key] = integer(record(v.counters) ? v.counters[key] : 0);
        s.quest = integer(v.quest, 0, 1e6);
        s.planet = planetId(v.planet)!;
        s.visited = [...new Set<PlanetId>(['home', ...(Array.isArray(v.visited) ? v.visited.map(planetId).filter((id: PlanetId | null): id is PlanetId => !!id) : []), s.planet])];
        s.discovered = [...new Set<PlanetId>([...s.visited, ...(Array.isArray(v.discovered) ? v.discovered.map(planetId).filter((id: PlanetId | null): id is PlanetId => !!id) : [])])];
        const settings = record(v.settings) ? v.settings : {};
        s.settings = { sound: settings.sound !== false, lowGraphics: settings.lowGraphics === true };
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
        settleBeds(s);
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
