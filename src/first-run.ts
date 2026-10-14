/**
 * The first minutes of a brand-new save (docs/FIX-PLAN.md 4.2 and 4.3).
 *
 * - Tutorial planting: the first three level-1 crops of a new save grow in 20 s instead of minutes, so the first reward
 *   comes inside the first minute. Only while the story is still on its first step, only at level 1, three plantings
 *   per save ever (the count is saved), never again.
 * - A calm HUD: on a new save below level 3 the fight buttons wait. Skills appear after the first fight (all four are open
 *   from level 1, so the first aggro or first defeat reveals them for good), Attack and Jump when a creature is near or
 *   after that first fight, quick-eat once there is food in the bag. Saves from before this change have no `firstRun`
 *   and keep their full HUD.
 * - The "defeat creatures" step of Chapter 1: easy, slow creatures wait beside the garden (solo play only), and the
 *   tracker walks to the nearest one, so there is always a next visible goal.
 *
 * Pure rules here (model.ts and the server use tutorialGrow); the DOM and world parts take what they need as arguments.
 */
import { CROPS, ITEMS, STORY_STEPS } from './content.ts';

/** Present only on saves started after this change; missing = an older save (full HUD, no tutorial crops). */
export interface FirstRun { plants?: number; fought?: 1; food?: 1 }
export const TUTORIAL_PLANTS = 3;
export const TUTORIAL_GROW_MS = 20_000;
/** From this level on the HUD is always full. */
export const CALM_UNTIL_LEVEL = 3;

interface RunSave { level: number; firstRun?: FirstRun; counters: { harvests: number; kills: number }; progression: { story: { index: number } }; bag: Record<string, number | undefined> }

/** Marks a save a player is starting now (the browser's new game, a reset, a new account): it gets the first-minutes help. */
export function freshStart<T extends { firstRun?: FirstRun }>(s: T): T { s.firstRun = {}; return s; }

export function parseFirstRun(v: unknown): FirstRun | undefined {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return undefined;
  const r = v as Record<string, unknown>, out: FirstRun = {};
  if (Number.isSafeInteger(r.plants) && (r.plants as number) > 0) out.plants = Math.min(TUTORIAL_PLANTS, r.plants as number);
  if (r.fought === 1) out.fought = 1;
  if (r.food === 1) out.food = 1;
  return out;
}

/** The grow time a planting would get, without counting it (the seed picker's time chip). */
export function tutorialPreview(s: RunSave, crop: string, duration: number) { const run = s.firstRun ? { ...s.firstRun } : undefined; return tutorialGrow({ ...s, firstRun: run }, crop, duration); }
/** The grow time for a planting: 20 s for one of the first three level-1 crops of a new save, else `duration` unchanged. Counts the tutorial planting. */
export function tutorialGrow(s: RunSave, crop: string, duration: number): number {
  const run = s.firstRun, def = Object.hasOwn(CROPS, crop) ? CROPS[crop] : undefined;
  if (!run || !def || def.level > 1 || s.level > 1 || s.progression.story.index > 0 || s.counters.harvests >= TUTORIAL_PLANTS || (run.plants ?? 0) >= TUTORIAL_PLANTS || !(duration > TUTORIAL_GROW_MS)) return duration;
  run.plants = (run.plants ?? 0) + 1;
  return TUTORIAL_GROW_MS;
}

export const foodCount = (bag: Record<string, number | undefined>) => Object.entries(bag).reduce((n, [id, c]) => n + ((ITEMS[id] as { heal?: number } | undefined)?.heal && c ? c : 0), 0);

export interface CalmView { skills: boolean; attack: boolean; eat: boolean }
const FULL: CalmView = { skills: true, attack: true, eat: true };
/**
 * What the fight corner shows (true = shown). Notes the first fight and the first food into the save so they stay.
 * `fighting`: a creature has noticed the explorer close by; `creatureNear`: any living creature close by.
 */
export function calmHud(s: RunSave, at: { fighting: boolean; creatureNear: boolean }): CalmView {
  const run = s.firstRun;
  if (!run || s.level >= CALM_UNTIL_LEVEL) return FULL;
  if (!run.fought && (at.fighting || s.counters.kills > 0)) run.fought = 1;
  if (!run.food && foodCount(s.bag) > 0) run.food = 1;
  return { skills: !!run.fought, attack: !!run.fought || at.creatureNear, eat: !!run.food };
}
/** Puts the view on the HUD as three classes (hud-first.css hides what is not shown yet). */
export function applyCalm(hud: HTMLElement, view: CalmView) {
  for (const [cls, shown] of [['calm-skills', view.skills], ['calm-attack', view.attack], ['calm-eat', view.eat]] as const) if (hud.classList.contains(cls) === shown) hud.classList.toggle(cls, !shown);
}

/** True while the story step is Chapter 1's "Defeat five creatures" on a new save. */
export function tutorialFightStep(s: RunSave) {
  const step = STORY_STEPS[s.progression.story.index];
  return !!s.firstRun && !!step && step.chapter === 0 && step.event === 'kill';
}

// ---- the easy creatures beside the garden ----
interface Critter { x: number; z: number; hp: number; maxHp: number; damage: number; baseDamage?: number; baseMaxHp?: number; xp: number; respawn: number; homeX: number; homeZ: number; boss?: boolean; type?: string; definition?: object; mesh: { visible: boolean }; tutorial?: boolean; phase?: string; kind?: string; index?: number; level?: number }
export interface CritterWorld {
  enemies: Critter[]; entities: { kind: string; x: number; z: number }[]; planet: string; networkRole: unknown; interior?: unknown;
  obstacles: { x: number; z: number; r: number }[];
  spawnSpecies(type: string, x: number, z: number, index: number): Critter | null;
}
export const CRITTERS = 3;
export const CRITTER = { type: 'mushroom', hp: 30, damage: 3, speed: 1.5, sight: 5, respawn: 5 } as const;
/** Index range of the tutorial creatures: far past the village roster, so they never take a real creature's identity. */
export const CRITTER_INDEX = 90_000;

/** Free spots in a ring 9 to 12 m out from the garden's middle, on the side away from the village buildings. */
export function critterSpots(w: Pick<CritterWorld, 'entities' | 'obstacles'>, n = CRITTERS) {
  const beds = w.entities.filter(e => e.kind === 'plot'); if (!beds.length) return [];
  const cx = beds.reduce((a, e) => a + e.x, 0) / beds.length, cz = beds.reduce((a, e) => a + e.z, 0) / beds.length;
  const spots: { x: number; z: number }[] = [];
  for (let k = 0; k < 48 && spots.length < n; k++) {
    const a = k * 2.399963, d = 9 + (k % 4);
    const x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d;
    if (w.obstacles.some(o => Math.hypot(x - o.x, z - o.z) < o.r + 1.6)) continue;
    if (w.entities.some(e => e.kind !== 'enemy' && Math.hypot(x - e.x, z - e.z) < 3.2)) continue;
    if (spots.some(p => Math.hypot(x - p.x, z - p.z) < 3)) continue;
    spots.push({ x, z });
  }
  return spots;
}
/**
 * Called with the HUD tick. While the tutorial fight step is on (solo play, at home, outdoors) keeps the easy creatures
 * beside the garden, reviving each a few seconds after it falls; once the step is done they stay down.
 */
export function tendCritters(w: CritterWorld, s: RunSave, solo: boolean) {
  const on = solo && tutorialFightStep(s) && w.planet === 'home' && !w.networkRole && !w.interior;
  const mine = w.enemies.filter(e => e.tutorial);
  if (!on) { for (const e of mine) if (e.hp <= 0 || e.phase === 'idle' || !e.phase) { e.hp = 0; e.respawn = 999_999; e.mesh.visible = false; } return mine.length; }
  for (const e of mine) if (e.hp <= 0 && e.respawn > CRITTER.respawn) e.respawn = CRITTER.respawn;
  if (mine.length >= CRITTERS) return mine.length;
  for (const [i, p] of critterSpots(w).entries()) {
    if (i < mine.length) continue;
    const e = w.spawnSpecies(CRITTER.type, p.x, p.z, CRITTER_INDEX + i); if (!e) continue;
    e.tutorial = true; e.level = 1; e.hp = e.maxHp = e.baseMaxHp = CRITTER.hp; e.damage = e.baseDamage = CRITTER.damage;
    if (e.definition) e.definition = { ...(e.definition as Record<string, unknown>), speed: CRITTER.speed, sight: CRITTER.sight };
  }
  return w.enemies.filter(e => e.tutorial).length;
}
/** The tracker's goal for steps with no place (defeat, skills): the nearest living small creature, tutorial ones first. */
export function nearestCritter<T extends Critter>(enemies: readonly T[], x: number, z: number, within = 80): T | null {
  let best: T | null = null, bestD = within;
  for (const e of enemies) {
    if (e.hp <= 0 || e.boss || (e.definition as { titan?: boolean } | undefined)?.titan) continue;
    const d = Math.hypot(e.x - x, e.z - z) - (e.tutorial ? 1000 : 0);
    if (d < bestD) { best = e; bestD = d; }
  }
  return best;
}
