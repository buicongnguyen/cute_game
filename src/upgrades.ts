/**
 * The cottage's upgrade bench: levels for owned gear and for the four fighting skills. Pure rules shared by the
 * client, actions.ts ('upgradeGear' / 'upgradeSkill', so the server runs the same code) and the tests.
 *
 * Gear: hats, outfits, boots and companions level deterministically up to +10. Each level moves the item's health,
 * attack, defence, regeneration, crit and speed evenly toward its slot's ceiling (gear-ceiling.ts), so at +10 every
 * item of a slot has the same stats and the player wears the look they like. An item further from the ceiling costs
 * more energy per level (its gap share x 1.5 of the base curve, at least half of it); materials are the same for all.
 * A companion's shot is its own ability: it still grows +4% per level (gearFactor) and does not converge.
 * Weapons stay on the ember forge (+1% attack per level, 50% chance per attempt up to +5 then 30%, up to +15): the bench offers the
 * same forge attempt with the same cost and odds, so there is one rule for weapons wherever you stand.
 * Saves keep only the level number (gearLevels), so older saves simply read their levels through the new formula.
 */
import { ITEMS, canonicalItem, type Inventory } from './content.ts';
import type { SaveState } from './model.ts';
import { hasMaterials, useMaterials } from './pantry.ts';
import { MAX_SKILL_LEVEL, SKILL_SLOTS, clampSkillLevel, levelledCooldown } from './skill-upgrades.ts';
import { CONVERGED_STATS, MAX_GEAR_LEVEL, baseLine, gapShare, lerpStat, lineAtLevel, SLOT_CEILING, isCeilingSlot, type StatLine } from './gear-ceiling.ts';

export { MAX_GEAR_LEVEL };
/** The old per-level step: a companion's shot still grows by it (+40% at +10). */
export const GEAR_STEP = .04;
export const LEVELLED_SLOTS = ['hat', 'outfit', 'boots', 'pet'] as const;
/** Energy per level = the base curve x max(GAP_COST_MIN, GAP_COST_SCALE x gap share): a full gap pays 1.5x, a near-ceiling item half. */
export const GAP_COST_SCALE = 1.5, GAP_COST_MIN = .5;
type Upgraded = SaveState & { gearLevels?: Record<string, number>; skillLevels?: number[] };
type Cost = { energy: number; materials: Inventory };

/** Gear that levels on the bench (weapons use the forge, disguises are their own power spike, rods are tools). */
export function upgradableGear(raw: string) { const item = ITEMS[canonicalItem(raw)]; return !!item && Object.hasOwn(ITEMS, canonicalItem(raw)) && (LEVELLED_SLOTS as readonly string[]).includes(item.slot ?? '') && !item.keepsake; }
export function gearLevel(s: SaveState, raw: string): number {
  const value = (s as Upgraded).gearLevels?.[canonicalItem(raw)];
  return typeof value === 'number' && Number.isSafeInteger(value) ? Math.max(0, Math.min(MAX_GEAR_LEVEL, value)) : 0;
}
/** A companion's shot factor (main.ts and combat-authority scale pet damage by it): 1 at +0, 1.4 at +10, the pet's own. */
export const gearFactor = (s: SaveState, raw: string) => 1 + GEAR_STEP * gearLevel(s, raw);
/** The ceiling every item of this one's slot reaches at +10 (null for things the bench does not level). */
export function gearCeiling(raw: string): Readonly<StatLine> | null { const id = canonicalItem(raw), slot = ITEMS[id]?.slot; return upgradableGear(id) && isCeilingSlot(slot) ? SLOT_CEILING[slot] : null; }
/** The item's converged stats as the player has it now (its base for anything the bench does not level). */
export const levelledLine = (s: SaveState, raw: string): StatLine => { const id = canonicalItem(raw); return upgradableGear(id) ? lineAtLevel(id, gearLevel(s, id)) : baseLine(id); };
const energyCurve = (l: number) => 60 + 40 * l + 10 * l * l;
const round5 = (v: number) => Math.max(5, Math.round(v / 5) * 5);
/** Energy scales with the item's gap to its ceiling; leather and bone throughout, star shards from +5, a moonstone from +8. */
export function gearCost(raw: string, level: number): Cost {
  const l = Math.max(0, Math.min(MAX_GEAR_LEVEL - 1, Math.floor(Number.isFinite(level) ? level : 0)));
  const materials: Inventory = { leather: 2 + l, bone: 1 + Math.floor(l / 2) };
  if (l >= 5) materials.starshard = l - 4;
  if (l >= 8) materials.moonstone = 1;
  return { energy: round5(energyCurve(l) * Math.max(GAP_COST_MIN, GAP_COST_SCALE * gapShare(canonicalItem(raw)))), materials };
}
/** Everything still to pay from `level` to +10 (the bench shows the energy). */
export function gearCostToMax(raw: string, level: number): Cost {
  const total: Cost = { energy: 0, materials: {} };
  for (let l = Math.max(0, Math.floor(Number.isFinite(level) ? level : 0)); l < MAX_GEAR_LEVEL; l++) {
    const step = gearCost(raw, l); total.energy += step.energy;
    for (const [id, n] of Object.entries(step.materials)) total.materials[id] = (total.materials[id] || 0) + n!;
  }
  return total;
}
/** Materials within reach: the bag (never a worn copy), plus the house chest at home (pantry.ts), as at the forge. */
const affordable = (s: SaveState, cost: Cost) => s.energy >= cost.energy && hasMaterials(s, cost.materials);
function pay(s: SaveState, cost: Cost) {
  if (useMaterials(s, cost.materials)) s.energy -= cost.energy;
}
export function canUpgradeGear(s: SaveState, raw: string) {
  const id = canonicalItem(raw);
  return upgradableGear(id) && (s.bag[id] || 0) > 0 && gearLevel(s, id) < MAX_GEAR_LEVEL && affordable(s, gearCost(id, gearLevel(s, id)));
}
export function upgradeGear(s: SaveState, raw: string): { id: string; level: number } | null {
  const id = canonicalItem(raw); if (!canUpgradeGear(s, id)) return null;
  const level = gearLevel(s, id); pay(s, gearCost(id, level));
  ((s as Upgraded).gearLevels ??= {})[id] = level + 1;
  return { id, level: level + 1 };
}
/** One stat of one worn item with its level applied (model.ts equipmentStat sums these, on the client and the server). */
export function levelledStat(s: SaveState, id: string, key: string, base: number) {
  if (!(CONVERGED_STATS as readonly string[]).includes(key) || !upgradableGear(id)) return base;
  const top = gearCeiling(id)!; return lerpStat(base, top[key as keyof StatLine], gearLevel(s, id));
}

export function skillLevel(s: SaveState, index: number) { return clampSkillLevel((s as Upgraded).skillLevels?.[index]); }
export function skillLevels(s: SaveState) { return Array.from({ length: SKILL_SLOTS }, (_, i) => skillLevel(s, i)); }
/** 120, 480, 1 080, 1 920, 3 000 energy; bone, then star shards from level 2 and a moonstone for the last. */
export function skillCost(level: number): { energy: number; materials: Inventory } {
  const l = Math.max(0, Math.min(MAX_SKILL_LEVEL - 1, Math.floor(Number.isFinite(level) ? level : 0)));
  const materials: Inventory = { bone: 3 + 2 * l };
  if (l >= 1) materials.starshard = l;
  if (l >= 4) materials.moonstone = 1;
  return { energy: 120 * (l + 1) ** 2, materials };
}
export function canUpgradeSkill(s: SaveState, index: number) {
  return Number.isSafeInteger(index) && index >= 0 && index < SKILL_SLOTS && skillLevel(s, index) < MAX_SKILL_LEVEL && affordable(s, skillCost(skillLevel(s, index)));
}
export function upgradeSkill(s: SaveState, index: number): { index: number; level: number } | null {
  if (!canUpgradeSkill(s, index)) return null;
  const level = skillLevel(s, index); pay(s, skillCost(level));
  const levels = skillLevels(s); levels[index] = level + 1; (s as Upgraded).skillLevels = levels;
  return { index, level: level + 1 };
}
/** The cooldown both main.ts and combat-authority start after a cast. */
export function skillCooldown(s: SaveState, index: number, base: number, disguised: boolean) { return levelledCooldown(index, base, skillLevel(s, index), disguised); }

/** Save validation (model.ts parseSave): unknown items, weapons, out-of-range or non-integer levels are dropped. */
export function parseGearLevels(value: unknown): Record<string, number> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const out: Record<string, number> = {};
  for (const [raw, level] of Object.entries(value)) { const id = canonicalItem(raw); if (upgradableGear(id) && Number.isSafeInteger(level) && (level as number) > 0) out[id] = Math.min(MAX_GEAR_LEVEL, level as number); }
  return Object.keys(out).length ? out : undefined;
}
export function parseSkillLevels(value: unknown): number[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const out = Array.from({ length: SKILL_SLOTS }, (_, i) => clampSkillLevel(value[i]));
  return out.some(Boolean) ? out : undefined;
}
