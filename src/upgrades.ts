/**
 * The cottage's upgrade bench: levels for owned gear and for the four fighting skills. Pure rules shared by the
 * client, actions.ts ('upgradeGear' / 'upgradeSkill', so the server runs the same code) and the tests.
 *
 * Gear: hats, outfits, boots and companions level deterministically, +4% of the item's own flat stats (health,
 * attack, defence, regeneration) and of a companion's shot damage per level, up to +10 (+40%). Crit and speed are
 * left alone because both already hit caps (85% crit, the speed floor) and would run away first. Weapons stay on the
 * ember forge (+1% attack per level, 30% chance per attempt, up to +15): the bench offers the same forge attempt
 * with the same cost and odds, so there is one rule for weapons wherever you stand.
 */
import { ITEMS, canonicalItem, type Inventory } from './content.ts';
import type { SaveState } from './model.ts';
import { MAX_SKILL_LEVEL, SKILL_SLOTS, clampSkillLevel, levelledCooldown } from './skill-upgrades.ts';

export const MAX_GEAR_LEVEL = 10;
export const GEAR_STEP = .04;
export const LEVELLED_SLOTS = ['hat', 'outfit', 'boots', 'pet'] as const;
export const LEVELLED_STATS = ['hp', 'atk', 'def', 'regen'] as const;
type Upgraded = SaveState & { gearLevels?: Record<string, number>; skillLevels?: number[] };

/** Gear that levels on the bench (weapons use the forge, disguises are their own power spike, rods are tools). */
export function upgradableGear(raw: string) { const item = ITEMS[canonicalItem(raw)]; return !!item && Object.hasOwn(ITEMS, canonicalItem(raw)) && (LEVELLED_SLOTS as readonly string[]).includes(item.slot ?? '') && !item.keepsake; }
export function gearLevel(s: SaveState, raw: string): number {
  const value = (s as Upgraded).gearLevels?.[canonicalItem(raw)];
  return typeof value === 'number' && Number.isSafeInteger(value) ? Math.max(0, Math.min(MAX_GEAR_LEVEL, value)) : 0;
}
/** Factor on the item's flat stats (and a companion's shot damage): 1 at +0, 1.4 at +10. */
export const gearFactor = (s: SaveState, raw: string) => 1 + GEAR_STEP * gearLevel(s, raw);
/** Energy rises with the square of the level; leather and bone throughout, star shards from +5, a moonstone from +8. */
export function gearCost(level: number): { energy: number; materials: Inventory } {
  const l = Math.max(0, Math.min(MAX_GEAR_LEVEL - 1, Math.floor(Number.isFinite(level) ? level : 0)));
  const materials: Inventory = { leather: 2 + l, bone: 1 + Math.floor(l / 2) };
  if (l >= 5) materials.starshard = l - 4;
  if (l >= 8) materials.moonstone = 1;
  return { energy: 60 + 40 * l + 10 * l * l, materials };
}
/** Materials beyond the one worn of each equipped item (wearing a material is impossible, but keep the forge's rule). */
const spare = (s: SaveState, id: string) => (s.bag[id] || 0) - (Object.values(s.gear).includes(id) ? 1 : 0);
const affordable = (s: SaveState, cost: { energy: number; materials: Inventory }) => s.energy >= cost.energy && Object.entries(cost.materials).every(([id, n]) => spare(s, id) >= n!);
function pay(s: SaveState, cost: { energy: number; materials: Inventory }) {
  s.energy -= cost.energy;
  for (const [id, n] of Object.entries(cost.materials)) { s.bag[id]! -= n!; if (!s.bag[id]) delete s.bag[id]; }
}
export function canUpgradeGear(s: SaveState, raw: string) {
  const id = canonicalItem(raw);
  return upgradableGear(id) && (s.bag[id] || 0) > 0 && gearLevel(s, id) < MAX_GEAR_LEVEL && affordable(s, gearCost(gearLevel(s, id)));
}
export function upgradeGear(s: SaveState, raw: string): { id: string; level: number } | null {
  const id = canonicalItem(raw); if (!canUpgradeGear(s, id)) return null;
  const level = gearLevel(s, id); pay(s, gearCost(level));
  ((s as Upgraded).gearLevels ??= {})[id] = level + 1;
  return { id, level: level + 1 };
}
/** One stat of one item with its level applied (model.ts equipmentStat sums these). */
export function levelledStat(s: SaveState, id: string, key: string, base: number) {
  return (LEVELLED_STATS as readonly string[]).includes(key) && upgradableGear(id) ? base * gearFactor(s, id) : base;
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
