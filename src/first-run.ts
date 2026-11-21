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
 * - The start (FIX-PLAN 4.6): three welcome cards on an untouched save, one goal on screen until the first fight is won
 *   (or level 3), Chapter 1's way pointed out, and one-time moment tips. What was seen is saved in `seen` through the
 *   `firstRunSeen` action, so the server keeps the same list and a second device does not show it again.
 *
 * Pure rules here (model.ts and the server use tutorialGrow); the DOM and world parts take what they need as arguments.
 */
import { CROPS, ITEMS, STORY_STEPS } from './content.ts';

/** Present only on saves started after this change; missing = an older save (full HUD, no tutorial crops). */
export interface FirstRun { plants?: number; fought?: 1; food?: 1; seen?: FirstSeen[] }
/** What a new save shows once: the welcome cards and the moment tips (moment-tips.ts). */
export const FIRST_SEEN = ['cards', 'tip:plant', 'tip:harvest', 'tip:fight', 'tip:drop', 'tip:equip', 'tip:ring', 'tip:chain'] as const;
export type FirstSeen = typeof FIRST_SEEN[number];
export const isFirstSeen = (v: unknown): v is FirstSeen => (FIRST_SEEN as readonly unknown[]).includes(v);
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
  if (Array.isArray(r.seen)) { const seen = FIRST_SEEN.filter(id => (r.seen as unknown[]).includes(id)); if (seen.length) out.seen = seen; }
  return out;
}

// ---- The start: welcome cards, one goal, tips (FIX-PLAN 4.6) ----
export const hasSeen = (s: { firstRun?: FirstRun }, id: FirstSeen) => !!s.firstRun?.seen?.includes(id);
/** Notes a card or tip as seen. Saves without `firstRun` (older ones) never show them, so there is nothing to note: still true. */
export function markSeen(s: { firstRun?: FirstRun }, id: FirstSeen): boolean {
  if (!isFirstSeen(id)) return false;
  const run = s.firstRun; if (run && !run.seen?.includes(id)) (run.seen ??= []).push(id);
  return true;
}
interface StartSave extends RunSave { plots: readonly { crop: unknown }[] }
/** A save started now that has not been played yet: level 1, nothing planted, harvested or defeated, the story on its first step. An online account that already played is not untouched. */
export const untouched = (s: StartSave) => !!s.firstRun && s.level === 1 && s.counters.harvests === 0 && s.counters.kills === 0 && s.progression.story.index === 0 && s.plots.every(p => !p.crop);
/** The three welcome cards: on an untouched save, until they are seen or skipped. */
export const welcomeCardsDue = (s: StartSave) => untouched(s) && !hasSeen(s, 'cards');
/**
 * One goal at a time: on a new save only the story tracker shows until the first creature is defeated (Chapter 1's
 * first fight) or level 3, whichever comes first. The bounty, the quick challenge and the other trackers wait. Older saves: never.
 */
export const oneGoal = (s: RunSave) => !!s.firstRun && s.counters.kills === 0 && s.level < CALM_UNTIL_LEVEL;
/** Chapter 1 of a new save: the way to the next step is pointed out by itself (trail and edge arrow). */
export const chapterOneGuide = (s: RunSave) => !!s.firstRun && STORY_STEPS[s.progression.story.index]?.chapter === 0;

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

/** A spot keeps this far from everything a press of Attack could use, and from the other spots (metres). */
export const SPOT_CLEAR = 7, SPOT_APART = 3.2;
/** Spots stay inside the village fence (its ring is 18 m out), so the wild creatures of the forest never join the first fight. */
export const SPOT_HUB = 16.5;
/**
 * Spots beside the garden for the first fight's creatures: 9 to 15 m out from the garden's middle, SPOT_APART m from each
 * other, and as far from every thing of the village as it has room for, so that no dialog is one press away from the
 * fight. A place SPOT_CLEAR m clear is as good as any (the nearest ring first); the crowded village has two such
 * places, and the third creature gets the place with the most room left (never under SPOT_APART).
 */
export function critterSpots(w: Pick<CritterWorld, 'entities' | 'obstacles'>, n = CRITTERS) {
  const beds = w.entities.filter(e => e.kind === 'plot'), spots: { x: number; z: number }[] = []; if (!beds.length) return spots;
  const cx = beds.reduce((a, e) => a + e.x, 0) / beds.length, cz = beds.reduce((a, e) => a + e.z, 0) / beds.length;
  const things = w.entities.filter(e => e.kind !== 'enemy');
  const near = (list: readonly { x: number; z: number; r?: number }[], x: number, z: number, pad = 0) => list.reduce((least, e) => Math.min(least, Math.hypot(x - e.x, z - e.z) - (e.r ?? 0) - pad), SPOT_CLEAR);
  while (spots.length < n) {
    let best: { x: number; z: number } | null = null, most = SPOT_APART;
    for (let k = 0; k < 520; k++) {
      const a = k * 2.399963, d = 9 + (k % 13) * .5, x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d;
      if (Math.hypot(x, z) > SPOT_HUB || near(w.obstacles, x, z, 1.6) < 0 || near(spots, x, z) < SPOT_APART) continue;
      const room = near(things, x, z); if (room > most) { most = room; best = { x, z }; }
    }
    if (!best) break; spots.push(best);
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
