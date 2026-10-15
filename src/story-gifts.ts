/**
 * Story rewards that help a new explorer in (docs/FIX-PLAN.md 5.6, the owner's "make it a little easier for players to
 * join the game and play it"). Pure data and arithmetic, shared by the browser and the server (progression.ts
 * storyReward pays it on both sides).
 *
 * - Energy and EXP grow with the level through the shared levelRewardBonus (model.ts): 1 at level 1, 1.9 at 10, 4.9 at
 *   40, capped at 6. EXP keeps a share of the level's need (bigger in the first two chapters) plus a bonus-scaled part.
 * - The first two chapters also hand over starter items a new explorer can use at once, picked from the shop's cheapest
 *   useful things and ordered so each arrives just before the step that needs it: fertilizer for the garden, a stack of
 *   healing potions before the first fights, a straw hat, a fishing rod with bait before "Catch two fish", and a robot
 *   companion (wearable from level 4, level-gates.ts) before the first boss.
 */
import type { Inventory } from './content.ts';

/** Starter items per story step index (Chapter 1 = steps 0-8, Chapter 2 = steps 9-14), paid on top of a step's own `end` gift. */
export const STORY_GIFTS: Readonly<Record<number, Inventory>> = {
  0: { manure: 4 },            // Harvest three crops: two doses of fertilizer ripen the next crop at once
  1: { potion: 3 },            // Earn 20 energy at the market: food before the fights (quick-eat appears once food is in the bag)
  2: { hat_straw: 1 },         // Buy or craft one item: a hat to wear right away (+3 defence, +10 health)
  3: { potion: 2 },            // Equip a weapon: more potions, for "Defeat five creatures"
  4: { rod: 1, worm: 5 },      // Defeat five creatures: a fishing rod and bait for "Catch two fish" (two steps on)
  6: { manure: 4 },            // Catch two fish
  9: { potion: 3 },            // Defeat 25 creatures
  10: { manure: 6 },           // Place another garden bed (the kit came with "Reach level 5")
  11: { pet_robot: 1 },        // Cook three meals: a companion that fights beside you, just before "Defeat a boss"
  12: { potion: 3, worm: 5 },  // Defeat a boss: potions, and bait for "Catch five fish"
};

/** Story energy: a base, a part per level and per step, all grown by the level bonus. */
export const storyEnergy = (level: number, index: number, bonus: number) => Math.round((60 + level * 7 + Math.min(index, 40) * 5) * bonus);
/** Story EXP: a share of what the level needs (more in the first two chapters, more again past the written story) plus 15 × the bonus. */
export const storyXpShare = (index: number) => index < 15 ? .35 : index >= 29 ? .3 : .25;
export const storyXp = (need: number, index: number, bonus: number) => Math.round(need * storyXpShare(index) + 15 * bonus);
/** The step's starter items merged with its own end gift (counts add up). */
export function storyItems(index: number, end?: Inventory): Inventory | undefined {
  const gift = Object.hasOwn(STORY_GIFTS, index) ? STORY_GIFTS[index] : undefined;
  if (!gift) return end;
  const out: Inventory = { ...gift };
  for (const [id, n] of Object.entries(end ?? {})) out[id] = (out[id] ?? 0) + (n ?? 0);
  return out;
}
