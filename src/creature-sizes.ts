import { TITANS } from './titan-content.ts';

/**
 * Size pass (w18): Titans are drawn at 0.75 of their old size and the Great Forest Hawks at 0.5. The same factor scales
 * the drawn model (enemy-types.ts enemyScale), the hit/body radius (which also sets the tap circle, approach range,
 * the server's hit and contact checks and every Titan telegraph that is placed from the body's edge) and the melee
 * reach, so a smaller body never keeps a big body's reach. Fixed-size danger zones (bombard blasts, pools) stay as
 * they were: they are what the player dodges, not the creature. Tap circles keep picking.ts CREATURE_CIRCLE (55 px)
 * as their floor, so a half-size hawk stays as easy to tap as any other creature.
 */
export const TITAN_SIZE = .75, FOREST_BIRD_SIZE = .5;
export const SIZE_FACTORS: Readonly<Record<string, number>> = {
  forest_raptor: FOREST_BIRD_SIZE,
  ...Object.fromEntries(Object.keys(TITANS).map(id => [id, TITAN_SIZE])),
};
export const sizeFactor = (type: string | undefined) => (type && SIZE_FACTORS[type]) || 1;
/** A resized copy (never mutate the shared TITANS facts). */
export function sized<D extends { radius: number; reach: number; height?: number }>(type: string, def: D): D {
  const k = sizeFactor(type); if (k === 1) return def;
  return { ...def, radius: def.radius * k, reach: def.reach * k, ...(def.height !== undefined ? { height: def.height * k } : {}) };
}
