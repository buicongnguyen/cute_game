/**
 * Elite roles on the normal planets (docs/ELITE-ROLES.md). A role is attached to a spawned creature of an ordinary species,
 * never a new species and never a boss: about one in six of the chosen species on its planet. Which individuals carry it
 * comes from the shared roster order alone (enemy-roster.ts, world.ts build), so every browser and the server agree.
 *
 * Two roles to start with, so the owner can judge the feel before they spread:
 * - SPLITTER (Candy, the Jelly Jumper): when beaten it bursts into two smaller jellies (SPLIT). A second level of
 *   splitting is a data switch, off.
 * - SHIELDED (Ocean, the Stone Crab): a crystal barrier. Shots are mostly deflected; close hits, skills, dives and the
 *   power strike hurt in full and crack it; cracked through, it breaks for a while and the crab is stunned (SHIELD).
 *
 * Pure data and rules: the browser (world.ts), the server (server/combat-authority.mjs) and the balance simulation
 * (promo/fight-sim.mts) all call these same functions.
 */
export type EliteRoleId = 'splitter' | 'shielded';
/** What a creature carries: a role, or 'mini' for a splitter's child (a dormant roster slot until a split wakes it). */
export type EliteTag = EliteRoleId | 'mini';
/**
 * Where a hit came from (combat.ts CombatHit.source, set by the shared simulation so the server sees the same):
 * 'shot' a basic shot of a gun (and the air shot), 'pet' a pet's shot or the dog's toss, 'summon' a turret, cannon or other
 * summon, 'melee' a basic sword or fist hit, 'skill' any skill (the Lob and its splash, the Rush, disguise skills, a
 * skill's own projectile), 'dive' the dive strike, 'quake' the Quake (also Sky Quake and the old Root Quake), 'power'
 * the power strike. A hit with no source (a hazard, a remote relay) is treated as a close hit.
 */
export type HitSource = 'shot' | 'pet' | 'summon' | 'melee' | 'skill' | 'dive' | 'quake' | 'power';
export const PROJECTILE_SOURCES: ReadonlySet<HitSource> = new Set(['shot', 'pet', 'summon']);
export const HEAVY_SOURCES: ReadonlySet<HitSource> = new Set(['dive', 'quake', 'power']);

export interface EliteRole {
  id: EliteRoleId; planet: string; species: string;
  /** Share of that species' spawns on the planet that carry the role (rounded to a whole number of creatures). */
  share: number;
  /** Factors on the ordinary creature: health, damage, drawn size (and hit radius), EXP. */
  hp: number; damage: number; size: number; xp: number;
  /** Chance of one extra loot roll when it is beaten (its 'loot bonus'). */
  loot: number;
  /** Name tag ('{name}' is the species' name), the role's short tag and icon, the one-line hint, the first-meeting toast. */
  name: string; tag: string; icon: string; hint: string; toast: string;
  /** The role's colour: ground ring, label badge. */
  color: string;
}
export const ELITE_ROLES: Readonly<Record<EliteRoleId, EliteRole>> = {
  splitter: {
    id: 'splitter', planet: 'candy', species: 'jelly', share: 1 / 6, hp: 1.15, damage: 1.1, size: 1.3, xp: 1.6, loot: .5,
    name: 'Splitting {name}', tag: 'Splitter', icon: '🫧', hint: 'Splits in two', color: '#ff6fc4',
    toast: 'An elite! This Jelly Jumper splits in two when beaten.',
  },
  shielded: {
    id: 'shielded', planet: 'ocean', species: 'crab', share: 1 / 6, hp: 1.4, damage: 1.1, size: 1.2, xp: 1.6, loot: .6,
    name: 'Crystal-shell {name}', tag: 'Shielded', icon: '🛡️', hint: 'Shots bounce off: break the shell up close', color: '#3f6dff',
    toast: 'An elite! Shots bounce off its crystal shell: break it up close, with a skill or a dive.',
  },
};
export const ELITE_PLANETS: ReadonlySet<string> = new Set(Object.values(ELITE_ROLES).map(r => r.planet));

/** The splitter's children. `second` (off): a child of a child splits once more into `tiny` ones. */
export const SPLIT = {
  children: 2, size: .6, hp: .3, damage: .55, speed: 1.3,
  /** EXP of each child as a share of the ordinary creature's; children drop no loot and do not count for quests or bounties. */
  xp: .15,
  /** Live children per planet at most (the speed rule); with fewer than `children` free slots the elite dies without splitting. */
  cap: 8,
  /** Metres from the parent's spot where the children appear. */
  spread: .9,
  second: false,
  tiny: { size: .4, hp: .35, damage: .55, speed: 1.45 },
} as const;

/** The shielded creature's barrier. Seconds. */
export const SHIELD = {
  /** Share of a projectile hit (a basic shot, a pet's shot, a summon's hit) that gets through while the barrier stands. */
  shot: .15,
  /** Close hits (melee, a skill) that break it; a heavy hit (dive, Quake, power strike) breaks it at once. */
  cracks: 3,
  /** How long it stays broken, and the stun when it breaks. */
  open: 6, stun: 1,
  /** Seconds without a cracking hit after which the cracks heal. */
  heal: 10,
} as const;
export interface Barrier { cracks: number; /** Seconds it stays broken (0: it stands). */ open: number; /** Seconds since the last crack. */ idle: number }
export type BarrierEvent = 'deflect' | 'crack' | 'break' | 'open';
export const newBarrier = (): Barrier => ({ cracks: 0, open: 0, idle: 0 });
/** A hit of `amount` from `source` reaches a barrier: what gets through, the stun it adds, and what happened to it. */
export function barrierHit(b: Barrier, amount: number, source: HitSource | undefined): { amount: number; stun: number; event: BarrierEvent } {
  if (b.open > 0) return { amount, stun: 0, event: 'open' };
  if (source && PROJECTILE_SOURCES.has(source)) return { amount: amount * SHIELD.shot, stun: 0, event: 'deflect' };
  b.idle = 0; b.cracks = source && HEAVY_SOURCES.has(source) ? SHIELD.cracks : b.cracks + 1;
  if (b.cracks >= SHIELD.cracks) { b.cracks = 0; b.open = SHIELD.open; return { amount, stun: SHIELD.stun, event: 'break' }; }
  return { amount, stun: 0, event: 'crack' };
}
/** Time passes: a broken barrier regrows, old cracks heal. Returns true when it just regrew. */
export function stepBarrier(b: Barrier, dt: number): boolean {
  if (b.open > 0) { b.open = Math.max(0, b.open - dt); return b.open === 0; }
  if (b.cracks > 0 && (b.idle += dt) >= SHIELD.heal) { b.cracks = 0; b.idle = 0; }
  return false;
}
/** A barrier as it travels online (snapshot): finite, clamped. */
export function readBarrier(raw: unknown): Barrier | undefined {
  const r = raw as Partial<Barrier> | undefined; if (!r || typeof r !== 'object') return undefined;
  const n = (v: unknown, max: number) => Number.isFinite(v) ? Math.max(0, Math.min(max, v as number)) : 0;
  return { cracks: Math.round(n(r.cracks, SHIELD.cracks)), open: n(r.open, SHIELD.open), idle: n(r.idle, 60) };
}

/** A small, fixed string hash (FNV-1a): the same on every machine. */
function hash(text: string) { let h = 2166136261; for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
/**
 * The roster indices that carry a role on `planet`, given the species of each roster slot in order. Exactly
 * round(count x share) of the role's species, picked by a fixed hash of planet, species and the creature's place among its
 * kind: the same for every player and the server. Bosses and dormant slots never qualify.
 */
export function eliteAssignments(planet: string, slots: readonly { type: string; boss?: boolean; dormant?: boolean }[]): Map<number, EliteRoleId> {
  const out = new Map<number, EliteRoleId>();
  for (const role of Object.values(ELITE_ROLES)) {
    if (role.planet !== planet) continue;
    const mine = slots.map((s, index) => ({ s, index })).filter(({ s }) => s.type === role.species && !s.boss && !s.dormant);
    const want = Math.round(mine.length * role.share);
    mine.map(({ index }, k) => ({ index, key: hash(`${planet}:${role.species}:${k}`) })).sort((a, b) => a.key - b.key || a.index - b.index).slice(0, want).forEach(({ index }) => out.set(index, role.id));
  }
  return out;
}
/** How many dormant child slots a planet keeps (appended last to its roster). */
export const miniSlots = (planet: string) => Object.values(ELITE_ROLES).some(r => r.planet === planet && r.id === 'splitter') ? SPLIT.cap : 0;
/** The splitter species of a planet (its children are of the same species). */
export const splitterSpecies = (planet: string) => Object.values(ELITE_ROLES).find(r => r.planet === planet && r.id === 'splitter')?.species;

/** The fields an elite changes on a creature (a roster entry or a world creature). */
export interface EliteBody { hp?: number; maxHp?: number; baseMaxHp: number; damage?: number; baseDamage: number; xp: number; radius: number }
/** Applies role `tag` to a freshly made creature: health, damage, EXP and hit radius. Returns its drawn size factor. */
export function dressElite(e: EliteBody, tag: EliteTag): number {
  if (tag === 'mini') {
    const s = SPLIT;
    e.baseMaxHp = Math.max(1, Math.round(e.baseMaxHp * ELITE_ROLES.splitter.hp * s.hp)); e.baseDamage *= s.damage; e.xp = Math.max(1, Math.round(e.xp * s.xp)); e.radius *= s.size;
    if (e.maxHp !== undefined) e.maxHp = e.baseMaxHp; if (e.hp !== undefined) e.hp = e.baseMaxHp; if (e.damage !== undefined) e.damage = e.baseDamage;
    return s.size;
  }
  const r = ELITE_ROLES[tag];
  e.baseMaxHp = Math.round(e.baseMaxHp * r.hp); e.baseDamage *= r.damage; e.xp = Math.round(e.xp * r.xp); e.radius *= r.size;
  if (e.maxHp !== undefined) e.maxHp = e.baseMaxHp; if (e.hp !== undefined) e.hp = e.baseMaxHp; if (e.damage !== undefined) e.damage = e.baseDamage;
  return r.size;
}
/** The name shown in labels and the target frame. */
export function eliteName(tag: EliteTag | undefined, name: string): string {
  if (!tag) return name; if (tag === 'mini') return 'Little ' + name;
  return ELITE_ROLES[tag].name.replace('{name}', name);
}

/** The creature a split may wake: a dormant child slot of the same species. */
export interface SplitSlot { id: string; elite?: EliteTag; hp: number; type?: string; pending?: boolean; parentId?: string; depth?: number }
/**
 * The children to wake when `parent` is beaten: `SPLIT.children` free child slots, or none when the elite cannot split (it
 * is a child itself and the second level is off, or fewer free slots than children: the cap is reached).
 */
export function splitChildren<S extends SplitSlot>(parent: SplitSlot, slots: readonly S[]): S[] {
  const depth = parent.elite === 'splitter' ? 0 : parent.elite === 'mini' ? parent.depth ?? 1 : -1;
  if (depth < 0 || depth >= (SPLIT.second ? 2 : 1)) return [];
  const free = slots.filter(m => m.elite === 'mini' && m.hp <= 0 && !m.pending && m.type === parent.type);
  return free.length < SPLIT.children ? [] : free.slice(0, SPLIT.children);
}
/** Where child `i` of `n` appears round the parent's spot. */
export const childSpot = (x: number, z: number, i: number, n: number = SPLIT.children) => { const a = i * Math.PI * 2 / n + .6; return { x: x + Math.cos(a) * SPLIT.spread, z: z + Math.sin(a) * SPLIT.spread }; };
/** A child's health, damage and drawn size for its depth (1 a mini, 2 a tiny one), from the slot's own base numbers. */
export function childScale(depth: number) { return depth >= 2 ? SPLIT.tiny : SPLIT; }

/** Rewards: an elite is one kill of its species (quests, bounties, kill totals) with its EXP factor and an extra loot roll at
 * `loot` chance; a child pays its small EXP only. */
export function eliteReward(tag: EliteTag | undefined): { counts: boolean; extraLoot: number } {
  if (tag === 'mini') return { counts: false, extraLoot: 0 };
  return { counts: true, extraLoot: tag ? ELITE_ROLES[tag].loot : 0 };
}
/** The label line for a creature: icon and tag, and the hint (shown on the selected one and the target frame). */
export function eliteBadge(tag: EliteTag | undefined): { icon: string; tag: string; hint: string; color: string } | null {
  if (!tag) return null;
  if (tag === 'mini') { const r = ELITE_ROLES.splitter; return { icon: r.icon, tag: 'Split jelly', hint: 'A piece of a splitter', color: r.color }; }
  const r = ELITE_ROLES[tag]; return { icon: r.icon, tag: r.tag, hint: r.hint, color: r.color };
}

/** The parts of elite.glb (art/blender/kit/build_elite.py) the view draws. */
export const ELITE_PARTS = { barrier: 'elite_barrier', cracks: ['elite_crack_1', 'elite_crack_2', 'elite_crack_3'], cores: 'elite_cores' } as const;
/** A soft wobble of a splitter's jelly (and its children): x/z and y factors at `time` s. */
export function jellyWobble(time: number, phase: number, tag: EliteTag | undefined): [number, number] {
  if (tag !== 'splitter' && tag !== 'mini') return [1, 1];
  const w = Math.sin(time * (tag === 'mini' ? 9 : 6) + phase) * (tag === 'mini' ? .05 : .07); return [1 + w, 1 - w];
}
