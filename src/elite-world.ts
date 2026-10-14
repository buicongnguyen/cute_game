/**
 * Elite roles in the browser's world (elite-roles.ts holds the rules): dressing the creatures a build makes, the barrier
 * on a hit, the split when a splitter falls, the children leaving with their parent's respawn, and the online snapshot.
 * world.ts calls these from a few short lines; nothing here runs for a planet without elites.
 */
import { ELITE_ROLES, SPLIT, barrierHit, childSpot, dressElite, eliteAssignments, eliteName, newBarrier, readBarrier, splitChildren, stepBarrier, type Barrier, type BarrierEvent, type EliteTag, type HitSource } from './elite-roles.ts';
import type { EnemyDefinition } from './enemy-types.ts';

/** The elite fields a world creature carries. */
export interface EliteFields {
  id: string; name: string; type?: string; hp: number; maxHp: number; baseMaxHp?: number; damage: number; baseDamage?: number; xp: number; radius: number; boss: boolean;
  respawn: number; x: number; z: number; homeX: number; homeZ: number; definition?: EnemyDefinition; mesh: { visible: boolean };
  elite?: EliteTag; /** Drawn size factor of the role (world.ts multiplies the species' scale by it). */ eliteSize?: number;
  barrier?: Barrier; /** A child: its parent's id and its depth (1 a mini, 2 a tiny one). */ parentId?: string; depth?: number;
  /** Seconds left of the burst a split child pops out with (looks only). */ born?: number;
}

/** Gives creature `e` the role `tag` (its numbers, size, name, barrier); a child is also made dormant and a little faster. */
export function makeElite<E extends EliteFields>(e: E, tag: EliteTag) {
  const base = { baseMaxHp: e.baseMaxHp ?? e.maxHp, baseDamage: e.baseDamage ?? e.damage, xp: e.xp, radius: e.radius, hp: e.hp, maxHp: e.maxHp, damage: e.damage };
  e.eliteSize = dressElite(base, tag); Object.assign(e, base); e.elite = tag; e.name = eliteName(tag, e.name);
  if (tag === 'shielded') e.barrier = newBarrier();
  if (tag === 'mini') { if (e.definition) e.definition = { ...e.definition, speed: e.definition.speed * SPLIT.speed }; e.hp = 0; e.respawn = 999999; e.mesh.visible = false; }
  return e;
}
/** The splitter's dormant children for a planet (or a scripted fight): SPLIT.cap of them, made with `spawn`. */
export function makeChildren<E extends EliteFields>(species: string, count: number, spawn: (type: string, index: number) => E | null, first: number) {
  for (let i = 0; i < count; i++) { const m = spawn(species, first + i); if (!m) break; makeElite(m, 'mini'); }
}
/** Dresses the creatures a build made, in roster order, and makes the planet's dormant child slots with `spawn`. */
export function dressWorld<E extends EliteFields>(planet: string, enemies: E[], spawn: (type: string, index: number) => E | null) {
  const roles = eliteAssignments(planet, enemies.map(e => ({ type: e.type ?? '', boss: e.boss, dormant: e.respawn >= 999999 })));
  if (!roles.size) return;
  for (const [index, role] of roles) makeElite(enemies[index], role);
  const kid = Object.values(ELITE_ROLES).find(r => r.planet === planet && r.id === 'splitter')?.species;
  if (kid) makeChildren(kid, SPLIT.cap, spawn, enemies.length);
}

/** A hit reaches an elite: what the barrier lets through and the stun it adds; `event` for the view (undefined: no barrier). */
export function eliteIncoming(e: EliteFields, amount: number, stun: number, hazard: boolean, source?: HitSource): { amount: number; stun: number; event?: BarrierEvent } {
  if (e.elite !== 'shielded' || hazard) return { amount, stun };
  const r = barrierHit(e.barrier ??= newBarrier(), amount, source);
  return { amount: r.event === 'deflect' ? Math.max(1, Math.round(r.amount)) : r.amount, stun: Math.max(stun, r.stun), event: r.event };
}

/** Time passes for a creature's barrier; true when it just regrew. */
export function stepBarriers(e: EliteFields, dt: number) { return e.barrier ? stepBarrier(e.barrier, dt) : false; }

/**
 * A splitter (or, with the second level on, a child) fell: wakes its children round its spot with `place` (which resolves
 * overlaps and sets the home). Returns the children woken (none at the cap).
 */
export function splitWorld<E extends EliteFields>(parent: E, enemies: readonly E[], place: (child: E, x: number, z: number) => void): E[] {
  const kids = splitChildren(parent, enemies);
  const depth = (parent.elite === 'mini' ? parent.depth ?? 1 : 0) + 1;
  kids.forEach((m, i) => {
    const at = childSpot(parent.x, parent.z, i, kids.length); place(m, at.x, at.z);
    m.parentId = parent.elite === 'mini' ? parent.parentId : parent.id; m.depth = depth;
    m.maxHp = Math.max(1, Math.round((m.baseMaxHp ?? m.maxHp) * (depth >= 2 ? SPLIT.tiny.hp : 1))); m.hp = m.maxHp;
    m.eliteSize = depth >= 2 ? SPLIT.tiny.size : SPLIT.size; m.respawn = 0; m.born = .35; m.mesh.visible = true;
  });
  return kids;
}
/** A splitter came back at its home: any child of it still out leaves with it (its respawn slot). Returns those removed. */
export function retireChildren<E extends EliteFields>(parent: E, enemies: readonly E[]): E[] {
  if (parent.elite !== 'splitter') return [];
  const gone = enemies.filter(m => m.elite === 'mini' && m.parentId === parent.id && m.hp > 0);
  for (const m of gone) { m.hp = 0; m.respawn = 999999; m.mesh.visible = false; }
  return gone;
}
/** Online: the elite facts the authority publishes (the roster's role, a child's parent and depth, the barrier). */
export function applyEliteSnapshot(e: EliteFields, snapshot: { elite?: unknown; parentId?: unknown; depth?: unknown; barrier?: unknown }) {
  if (e.elite === 'mini') { if (typeof snapshot.parentId === 'string') e.parentId = snapshot.parentId.slice(0, 100); if (Number.isFinite(snapshot.depth)) { e.depth = Math.max(1, Math.min(2, Math.round(snapshot.depth as number))); e.eliteSize = e.depth >= 2 ? SPLIT.tiny.size : SPLIT.size; } }
  if (e.elite === 'shielded') { const b = readBarrier(snapshot.barrier); if (b) e.barrier = b; }
}
