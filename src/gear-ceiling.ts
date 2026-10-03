/**
 * Gear ceilings for the upgrade bench (upgrades.ts): at +10 every hat has the same stats, every outfit the same, every
 * pair of boots the same and every companion the same stat line, so a player maxes the one whose look they like. Each
 * level moves an item's health, attack, defence, regeneration, crit and speed evenly from its own base to its slot's
 * ceiling (level L: base + (ceiling - base) x L/10), so a cute straw hat catches up fully by +10.
 *
 * Each ceiling is the best its slot could reach under the old rule (+4% of the item's own stats per level), stat by
 * stat: health, attack, defence and regeneration at the old +10 top end (1.4 x the best base in the slot), crit and
 * speed at the best base (the old rule never levelled them: both sit near caps, 85% crit and the speed floor).
 * Rounded up to whole points (regeneration to .5). Since every ceiling is at least 1.4 x every base in its slot:
 *  - no stat ever drops on a level, and
 *  - no item is ever weaker than under the old rule at the same level (base x (1 + .04 L) <= the lerp above).
 * The old best build of each kind (tank, hitter, runner) was already reachable by picking the right item per slot;
 * the ceiling lets any look reach all of them, so the crit and speed totals a player can stack stay where they were.
 *
 *            hp  def  atk  regen  crit  speed   set by
 *   hat     210   42   31   7     .15   .22     Ancient Mountain Helm (150 hp, 30 def), Void Eye Crown (22 atk),
 *                                               Rafflesia Crown (5 regen), Royal crown (.15 crit), Cloud Whale Hat (.22)
 *   outfit  126   40   12   4.5   .08   .18     Knight/Angel outfit (90 hp), Knight (28 def), Superhero (8 atk),
 *                                               Angel (3 regen), Tuxedo (.08 crit), Dragon wings (.18 speed)
 *   boots    28   12    0   0     0     .25     Cowboy boots (20 hp, 8 def), Rocket boots (.25 speed)
 *   pet     210   35   23   8.5   .1    .2      Little Cloud Whale (150 hp, .2 speed), Little Mountain Turtle (25 def),
 *                                               Little Void Eye (16 atk), Little Rafflesia (6 regen), Crystal Queen (.1)
 *
 * A companion's shot (element, rhythm, damage) is its own ability and does not converge: it keeps the old +4% per
 * level (upgrades.ts gearFactor). New items must fit under these ceilings (tests/gear-ceiling.test.ts checks it).
 */
import { ITEMS } from './content.ts';

export const MAX_GEAR_LEVEL = 10;
export const CEILING_SLOTS = ['hat', 'outfit', 'boots', 'pet'] as const;
export type CeilingSlot = typeof CEILING_SLOTS[number];
/** Every stat a bench level moves. Other item fields (light, lava-proofing, flippers, xp, luck) stay the item's own. */
export const CONVERGED_STATS = ['hp', 'def', 'atk', 'regen', 'crit', 'speed'] as const;
export type ConvergedStat = typeof CONVERGED_STATS[number];
export type StatLine = Record<ConvergedStat, number>;
export const SLOT_CEILING: Record<CeilingSlot, Readonly<StatLine>> = {
  hat: { hp: 210, def: 42, atk: 31, regen: 7, crit: .15, speed: .22 },
  outfit: { hp: 126, def: 40, atk: 12, regen: 4.5, crit: .08, speed: .18 },
  boots: { hp: 28, def: 12, atk: 0, regen: 0, crit: 0, speed: .25 },
  pet: { hp: 210, def: 35, atk: 23, regen: 8.5, crit: .1, speed: .2 },
};
export const isCeilingSlot = (slot: string | undefined): slot is CeilingSlot => (CEILING_SLOTS as readonly string[]).includes(slot ?? '');
/** The item's own base stats for the converged keys (missing = 0). */
export function baseLine(id: string): StatLine {
  const stats = (Object.hasOwn(ITEMS, id) ? ITEMS[id].stats : undefined) as Partial<Record<string, number>> | undefined;
  return Object.fromEntries(CONVERGED_STATS.map(k => [k, stats?.[k] ?? 0])) as StatLine;
}
/** One stat at a bench level: exactly the base at +0 and exactly the ceiling at +10, an even step between. */
export function lerpStat(base: number, ceiling: number, level: number) {
  const l = Math.max(0, Math.min(MAX_GEAR_LEVEL, level));
  return l >= MAX_GEAR_LEVEL ? ceiling : base + (ceiling - base) * l / MAX_GEAR_LEVEL;
}
/** The item's converged stats at `level` (an item outside the four slots keeps its base). */
export function lineAtLevel(id: string, level: number): StatLine {
  const base = baseLine(id), slot = Object.hasOwn(ITEMS, id) ? ITEMS[id].slot : undefined;
  if (!isCeilingSlot(slot)) return base;
  const top = SLOT_CEILING[slot];
  return Object.fromEntries(CONVERGED_STATS.map(k => [k, lerpStat(base[k], top[k], level)])) as StatLine;
}
/** Fighting value in points, the same weights the shop lists sort by (item-power.ts): crit and speed in points. */
export const statPoints = (s: Partial<Record<string, number>>) => (s.def ?? 0) + (s.hp ?? 0) / 5 + (s.atk ?? 0) + 3 * (s.regen ?? 0) + 100 * (s.crit ?? 0) + 50 * (s.speed ?? 0);
/** How far the item has to travel to its ceiling, as a share of the ceiling's points: 0 = already there, 1 = nothing yet. */
export function gapShare(id: string): number {
  const slot = Object.hasOwn(ITEMS, id) ? ITEMS[id].slot : undefined;
  if (!isCeilingSlot(slot)) return 0;
  const top = statPoints(SLOT_CEILING[slot]);
  return top > 0 ? Math.max(0, Math.min(1, (top - statPoints(baseLine(id))) / top)) : 0;
}
const one = (v: number) => (Math.round(v * 10) / 10).toString();
/** "❤️ 210 · 🛡️ 42 · ⚔️ 31 · 💚 7/s · ✨ 15% · 💨 +22%" (zeros left out; icons and digits only, so no translation). */
export function statLineLabel(line: Partial<StatLine>) {
  const parts = [
    line.hp ? `❤️ ${one(line.hp)}` : '', line.def ? `🛡️ ${one(line.def)}` : '', line.atk ? `⚔️ ${one(line.atk)}` : '',
    line.regen ? `💚 ${one(line.regen)}/s` : '', line.crit ? `✨ ${one(line.crit * 100)}%` : '',
    line.speed ? `💨 ${line.speed > 0 ? '+' : ''}${one(line.speed * 100)}%` : '',
  ];
  return parts.filter(Boolean).join(' · ');
}
