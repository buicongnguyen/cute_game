/**
 * Upgrade levels of the four fighting skills (Q whirlwind, W dash, E ground slam, R the weapon's special).
 * Pure numbers with no game-state imports, so combat.ts (client and the server's combat-authority) reads the
 * same table: the browser and the authority can never disagree about a levelled skill.
 *
 * Balance: each skill gains at most +40-50% damage at level 5, about what one weapon tier step gives, and the
 * two cooldown cuts stop at -25% (dash) / -20% (special) so the skill loop never turns into a permanent spin.
 * Disguise skills keep their own fixed kits (a disguise is already a power spike); levels apply to the base four.
 */
export const MAX_SKILL_LEVEL = 5;
export const SKILL_SLOTS = 4;
export interface SkillTuning { damage: number; radius: number; cooldown: number; cooldownScale: number }
/** Per-level steps: damage multiplier, extra radius (m), seconds off the cooldown, and a cooldown factor. */
export const SKILL_STEPS: readonly SkillTuning[] = [
  { damage: .1, radius: .12, cooldown: 0, cooldownScale: 0 },   // Q whirlwind: harder and a little wider
  { damage: .1, radius: 0, cooldown: .2, cooldownScale: 0 },     // W dash: harder and 0.2 s sooner per level (4 s → 3 s)
  { damage: .08, radius: .3, cooldown: 0, cooldownScale: 0 },    // E slam: harder and a wider shockwave (4.4 m → 5.9 m)
  { damage: .08, radius: 0, cooldown: 0, cooldownScale: .04 },   // R special: harder and 4% sooner per level (−20% at 5)
];
export const clampSkillLevel = (level: unknown) => typeof level === 'number' && Number.isSafeInteger(level) ? Math.max(0, Math.min(MAX_SKILL_LEVEL, level)) : 0;
/** The numbers a skill uses at `level` (0 = unupgraded: multiplier 1, no extra radius, full cooldown). */
export function skillTuning(index: number, level: number): SkillTuning {
  const step = SKILL_STEPS[index], l = clampSkillLevel(level);
  if (!step) return { damage: 1, radius: 0, cooldown: 0, cooldownScale: 1 };
  return { damage: 1 + step.damage * l, radius: step.radius * l, cooldown: step.cooldown * l, cooldownScale: 1 - step.cooldownScale * l };
}
/** The cooldown of slot `index` at `level`, from its base seconds. Disguise skills are never levelled. */
export function levelledCooldown(index: number, base: number, level: number, disguised = false) {
  if (disguised) return base;
  const t = skillTuning(index, level);
  return Math.max(.5, (base - t.cooldown) * t.cooldownScale);
}
/** What the next level adds, in plain words (localized by main.ts through the vi catalog). */
export const SKILL_LEVEL_TEXT: readonly string[] = [
  'Each level: +10% damage and +0.12 m spin radius.',
  'Each level: +10% damage and 0.2 s shorter cooldown.',
  'Each level: +8% damage and +0.3 m shockwave radius.',
  'Each level: +8% damage and 4% shorter cooldown for your weapon special.',
];
