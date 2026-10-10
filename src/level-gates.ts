import { ITEMS, PLANETS, LOOT_TABLES, COLLECTIONS, type PlanetId } from './content.ts';
import { TITANS, TITAN_LOOT } from './titan-content.ts';
import { isSpecial } from './special-offers.ts';
import { DUNGEON_LEVEL } from './dungeon-content.ts';

/**
 * Level gates for the late gear (user decision, round 28). The 1M-energy welcome lottery stays, but a fresh explorer can
 * no longer turn it straight into the strongest companions and hats: titan trophies (hat_t_* / pet_t_*), boss pets
 * (pet_b_*) and every other special-offer gear piece need the level of the world they come from, both to buy at the
 * outfitters (model.ts buy) and to put on (model.ts equip). The level is that world's landing level (PLANETS[*].level):
 * - a titan trophy: the planet its titan lives on (titan-content.ts TITANS[*].planet);
 * - a boss pet pet_b_<boss>: the planet whose bosses include <boss>;
 * - crafted gear: the planet whose collection lists it (content.ts COLLECTIONS);
 * - a boss drop: the lowest-level planet with a boss that drops it.
 * - a Delvers' Vault companion (pet_dg_*): the vault's recommended level, DUNGEON_LEVEL (20, as the night world's titan).
 * Gear worn before the rule (old saves) stays worn; only putting it on again waits for the level.
 * Pure rules: the browser and the server (actions.ts → model.ts) read the same table.
 */
const COLLECTION_PLANET: Record<string, PlanetId> = { sky: 'cloud', dark: 'shadow' };
const planetLevel = (id: string) => Object.hasOwn(PLANETS, id) ? PLANETS[id as PlanetId].level : 0;

function bossPlanet(boss: string): PlanetId | null {
  let best: PlanetId | null = null;
  for (const [id, planet] of Object.entries(PLANETS) as [PlanetId, (typeof PLANETS)[PlanetId]][])
    if (planet.bosses.includes(boss) && (best === null || planet.level < PLANETS[best].level)) best = id;
  return best;
}

let cache: Map<string, PlanetId | null> | null = null;
/** The world a gated gear piece comes from, or null when it has no gate (ordinary shop gear, materials, decorations). */
export function gearWorld(raw: string): PlanetId | null {
  if (!Object.hasOwn(ITEMS, raw) || !ITEMS[raw].slot || !isSpecial(raw)) return null;
  cache ??= new Map();
  if (cache.has(raw)) return cache.get(raw)!;
  let world: PlanetId | null = null;
  const titan = Object.entries(TITAN_LOOT).find(([, table]) => table.some(([item]) => item === raw))?.[0];
  if (titan && Object.hasOwn(TITANS, titan)) world = (TITANS as Record<string, { planet: string }>)[titan].planet as PlanetId;
  else if (raw.startsWith('pet_b_')) world = bossPlanet(raw.slice(6));
  if (!world) { const key = Object.entries(COLLECTIONS).find(([, c]) => c.items.includes(raw))?.[0]; if (key) world = (COLLECTION_PLANET[key] ?? key) as PlanetId; }
  if (!world) for (const [boss, table] of Object.entries(LOOT_TABLES)) {
    if (!table.some(([item]) => item === raw)) continue;
    const planet = bossPlanet(boss);
    if (planet && (!world || PLANETS[planet].level < PLANETS[world].level)) world = planet;
  }
  if (world && !Object.hasOwn(PLANETS, world)) world = null;
  cache.set(raw, world);
  return world;
}
/** The level needed to buy or wear this gear piece; 0 when anyone may (no gate, or a level-1 world). */
export function gearLevel(raw: string): number { if (Object.hasOwn(ITEMS, raw) && ITEMS[raw].dye) return gearLevel(ITEMS[raw].dye!.base); /* a dye waits for its base piece's level */ if (raw.startsWith('pet_dg_') && Object.hasOwn(ITEMS, raw)) return DUNGEON_LEVEL; const world = gearWorld(raw), level = world ? planetLevel(world) : 0; return level > 1 ? level : 0; }
/** Whether an explorer of `level` may buy or put on `id`. */
export const levelAllows = (level: number, id: string) => level >= gearLevel(id);
/** Every gated gear piece and its level, for tests and the docs. */
export const gatedGear = () => Object.keys(ITEMS).map(id => [id, gearLevel(id)] as const).filter(([, level]) => level > 0);
