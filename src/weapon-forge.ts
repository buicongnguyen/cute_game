import { ITEMS, canonicalItem, type Inventory } from './content.ts';
import type { SaveState } from './model.ts';
import { hasMaterials, useMaterials } from './pantry.ts';

export const MAX_FORGE_LEVEL = 15;
/** Success chance of an attempt from +6 on; the first five levels (+1 to +5) are easier: FORGE_EARLY_CHANCE. */
export const FORGE_SUCCESS_CHANCE = .3, FORGE_EARLY_CHANCE = .5, FORGE_EARLY_LEVELS = 5;
/** The chance of the attempt made at forge level `level` (the level before the attempt): 50% for +1..+5, 30% after. */
export const forgeChance = (level: number) => level < FORGE_EARLY_LEVELS ? FORGE_EARLY_CHANCE : FORGE_SUCCESS_CHANCE;
/** What one more level costs on average: tries = 1 / chance, energy = cost x tries. */
export function forgeExpected(level: number) { const p = forgeChance(level), tries = 1 / p; return { chance: p, tries, energy: Math.round(forgeCost(level).energy * tries) }; }
export function forgeLevel(state: SaveState, raw: string): number {
  const value = state.forge?.[canonicalItem(raw)];
  return typeof value === 'number' && Number.isSafeInteger(value) ? Math.max(0, Math.min(MAX_FORGE_LEVEL, value)) : 0;
}
export function forgeCost(level: number) {
  const rank = Math.max(0, Math.min(MAX_FORGE_LEVEL, Math.floor(Number.isFinite(level) ? level : 0)));
  const materials: Inventory = { bone: 4 + 2 * rank, leather: 4 + 2 * rank, starshard: 1 + Math.floor(rank / 3) };
  if (rank >= 5) materials.moonstone = 1 + Math.floor((rank - 5) / 4);
  if (rank >= 10) materials.firecore = rank - 8;
  return { energy: 80 + 60 * rank, materials };
}
export function canForge(state: SaveState, raw: string): boolean {
  const id = canonicalItem(raw), item = Object.hasOwn(ITEMS, id) ? ITEMS[id] : undefined;
  if (!item?.weapon || item.weapon.kind === 'rod' || item.slot !== 'weapon' || !(state.bag[id]! > 0) || forgeLevel(state, id) >= MAX_FORGE_LEVEL) return false;
  const cost = forgeCost(forgeLevel(state, id));
  // Bag first, then the house chest at home (pantry.ts), like the workshop recipes beside it.
  return state.energy >= cost.energy && hasMaterials(state, cost.materials);
}
export interface ForgeOutcome { id: string; success: boolean; level: number; energy: number; materials: Inventory }
/** Randomness is selected by the server online; failures consume one attempt without downgrading. */
export function forgeWeapon(state: SaveState, raw: string, random: () => number = Math.random): ForgeOutcome | null {
  const id = canonicalItem(raw); if (!canForge(state, id)) return null;
  const level = forgeLevel(state, id), cost = forgeCost(level), roll = random();
  if (!Number.isFinite(roll) || roll < 0 || roll >= 1) return null;
  if (!useMaterials(state, cost.materials)) return null;
  state.energy -= cost.energy;
  const success = roll < forgeChance(level);
  (state.forge ??= {})[id] = level + Number(success);
  return { id, success, level: level + Number(success), ...cost };
}
export function parseForge(value: unknown): Record<string, number> {
  const result: Record<string, number> = {};
  if (!value || typeof value !== 'object' || Array.isArray(value)) return result;
  for (const [id, level] of Object.entries(value)) if (Object.hasOwn(ITEMS, id) && ITEMS[id].slot === 'weapon' && ITEMS[id].weapon?.kind !== 'rod' && Number.isSafeInteger(level) && level > 0 && level <= MAX_FORGE_LEVEL) result[id] = level;
  return result;
}
