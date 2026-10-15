import { TITANS } from './titan-content.ts';
import { BOSS_SHAPES, BOSS_SIZE } from './boss-body.ts';

/**
 * Size pass (w18): Titans are drawn at 0.75 of their old size and the Great Forest Hawks at 0.5. The same factor scales
 * the drawn model (enemy-types.ts enemyScale), the hit/body radius (which also sets the tap circle, approach range,
 * the server's hit and contact checks and every Titan telegraph that is placed from the body's edge) and the melee
 * reach, so a smaller body never keeps a big body's reach. Fixed-size danger zones (bombard blasts, pools) stay as
 * they were: they are what the player dodges, not the creature. Tap circles keep picking.ts CREATURE_CIRCLE (55 px)
 * as their floor, so a half-size hawk stays as easy to tap as any other creature.
 *
 * Bosses (FEEL pass, 2026-10-15) are drawn at 0.8 of their old 1.85 (boss-body.ts BOSS_SIZE) the same way; after this
 * factor their hit radius and reach are refitted to the drawn body (boss-body.ts fitBoss). Dungeon guardians draw their
 * own art at its own size (dungeon-view.ts creatureModel) and Rescue Call bosses are instanced raiders: neither is listed.
 */
export const TITAN_SIZE = .75, FOREST_BIRD_SIZE = .5;
export const SIZE_FACTORS: Readonly<Record<string, number>> = {
  forest_raptor: FOREST_BIRD_SIZE,
  ...Object.fromEntries(Object.keys(TITANS).map(id => [id, TITAN_SIZE])),
  ...Object.fromEntries(Object.keys(BOSS_SHAPES).map(id => [id, BOSS_SIZE])),
};
export const sizeFactor = (type: string | undefined) => (type && SIZE_FACTORS[type]) || 1;
/** A resized copy (never mutate the shared TITANS facts). */
export function sized<D extends { radius: number; reach: number; height?: number }>(type: string, def: D): D {
  const k = sizeFactor(type); if (k === 1) return def;
  return { ...def, radius: def.radius * k, reach: def.reach * k, ...(def.height !== undefined ? { height: def.height * k } : {}) };
}
