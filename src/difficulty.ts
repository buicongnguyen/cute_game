import { CROPS, ITEMS, type ItemId } from './content.ts';

/**
 * Difficulty (a per-save setting, Settings panel). Easy keeps every original value; Normal and Hard make the economy
 * slower; Hard also makes creatures tougher and pays +15% XP and drop chance for it. Base tables are never changed:
 * prices and rules are read through these helpers with the save. Switching takes effect for new purchases, plantings
 * and spawns: a crop keeps the difficulty it was planted under (plot.difficulty), an animal its product pace. Raising
 * the difficulty is free; lowering it asks first and works once a day (LOWER_COOLDOWN_MS), so the Normal rules
 * cannot be dodged action by action. In co-op the room host's difficulty scales the creatures (hardScale): the server
 * rescales live ones when the host or the host's setting changes, and every browser spawns with the host's scale.
 */
export type Difficulty = 'easy' | 'normal' | 'hard';
export const DIFFICULTIES: readonly Difficulty[] = ['easy', 'normal', 'hard'];
export const isDifficulty = (v: unknown): v is Difficulty => DIFFICULTIES.includes(v as Difficulty);
type WithSettings = { settings?: { difficulty?: Difficulty } };
/** Old saves (no setting) play on Easy. */
export const difficultyOf = (s: WithSettings | null | undefined): Difficulty => isDifficulty(s?.settings?.difficulty) ? s!.settings!.difficulty! : 'easy';
export const DIFFICULTY_LABEL: Record<Difficulty, string> = { easy: 'Easy', normal: 'Normal', hard: 'Hard' };
/** The Settings panel's one-line description of each difficulty. */
export const DIFFICULTY_NOTE: Record<Difficulty, string> = {
  easy: 'The relaxed economy: every price and creature as it always was.',
  normal: 'A slower economy: kitchen at level 14, fruit trees later and twice as slow with less XP, dearer livestock.',
  hard: 'Normal’s economy, creatures with more health and harder hits, and +15% XP and drop chance as the reward.',
};
const harsh = (s: WithSettings | null | undefined) => difficultyOf(s) !== 'easy';

/** Zoo Pet gates cooking behind its level-14 lava reward: Normal and Hard lock the kitchen (and Pepper's cooking) until then. */
export const KITCHEN_LEVEL = 14;
export const kitchenLevel = (s: WithSettings) => harsh(s) ? KITCHEN_LEVEL : 0;
export const kitchenOpen = (s: WithSettings & { level: number }) => s.level >= kitchenLevel(s);

/**
 * Fruit trees (the 8-14 hour crops) off Easy: unlocked 5 levels later, twice the grow time and 0.3x the XP — apple L3
 * (8 h, 400 XP) becomes L8 (16 h, 120 XP). Both are fixed at planting (model.ts plant: plot.growDuration and
 * plot.difficulty), so switching the difficulty never re-prices a growing tree. The sell price is the same on every
 * difficulty: a price that followed the current setting let a raise-harvest-lower round trip pay the gap (review w15).
 */
export const TREE_LEVEL_STEP = 5, TREE_LEVEL_CAP = 25, TREE_GROW = 2, TREE_XP = .3;
export const isFruitTree = (id: string) => Object.hasOwn(CROPS, id) && CROPS[id].duration >= 8 * 3_600_000;
export function cropLevel(s: WithSettings, id: string) {
  const c = CROPS[id]; if (!c) return Infinity;
  return harsh(s) && isFruitTree(id) ? Math.min(TREE_LEVEL_CAP, c.level + TREE_LEVEL_STEP) : c.level;
}
export function cropXp(s: WithSettings, id: string) { const c = CROPS[id]; return !c ? 0 : harsh(s) && isFruitTree(id) ? Math.round(c.xp * TREE_XP) : c.xp; }
/** A crop's grow time when planted now, before the bed's own speed-up (model.ts bedGrowTime). */
export function cropGrowTime(s: WithSettings, id: string) { const c = CROPS[id]; return !c ? 0 : harsh(s) && isFruitTree(id) ? c.duration * TREE_GROW : c.duration; }
/** What one item sells for at the market: the same on every difficulty. */
export function sellPrice(_s: WithSettings, id: ItemId): number { return ITEMS[id]?.sell ?? 0; }

/** Livestock off Easy: chicken 60 (was 25), cow 120 (was 70), duck and pig about 1.7x; products come 1.5x less often. */
const ANIMAL_PRICE: Record<string, number> = { chicken: 60, cow: 120 };
export const ANIMAL_PRICE_SCALE = 1.7, PRODUCT_PACE = 1.5;
export function animalPrice(s: WithSettings, kind: string, base: number) {
  if (!harsh(s) || kind === 'dog') return base;
  return ANIMAL_PRICE[kind] ?? Math.round(base * ANIMAL_PRICE_SCALE / 10) * 10;
}
/** The product-interval multiplier an animal bought now carries for life (owned animals keep theirs). */
export const productPace = (s: WithSettings) => harsh(s) ? PRODUCT_PACE : 1;

/** Hard rewards for choosing it: +15% XP (model.ts gainXp) and +15% drop chance (rollLoot). */
export const HARD_BONUS = 1.15;
export const rewardScale = (s: WithSettings | null | undefined) => difficultyOf(s) === 'hard' ? HARD_BONUS : 1;
/** The kill bonus follows the creatures fought (a co-op room's hardScale, set by its host), not the killer's own setting. */
export const scaleReward = (scale: { hp: number } | null | undefined) => (scale?.hp ?? 1) > 1 ? HARD_BONUS : 1;
const RANK: Record<Difficulty, number> = { easy: 0, normal: 1, hard: 2 };
/** Lowering the difficulty works once per this long (stored settings.difficultyLoweredAt). */
export const LOWER_COOLDOWN_MS = 24 * 3_600_000;
export const isLowering = (from: Difficulty, to: Difficulty) => RANK[to] < RANK[from];
/** When the save may lower its difficulty again (0 = now). */
export const lowerReadyAt = (s: { settings?: { difficultyLoweredAt?: number } }) => { const at = s.settings?.difficultyLoweredAt; return typeof at === 'number' && Number.isFinite(at) ? at + LOWER_COOLDOWN_MS : 0; };
/** Hard creatures (bosses too): +25% health, +20% damage. One helper for the client world and the server.
 * (Named apart from boss-patterns.ts creatureScale, which scales by zone rank.) */
export function hardScale(d: Difficulty | WithSettings | null | undefined) {
  const level = typeof d === 'string' ? d : difficultyOf(d);
  return level === 'hard' ? { hp: 1.25, damage: 1.2 } : { hp: 1, damage: 1 };
}
/** Bed upgrades (model.ts upgradeBed) cost 1.5x off Easy, like the dearer livestock. */
export const BED_UPGRADE_SCALE = 1.5;
export const bedUpgradeScale = (s: WithSettings | null | undefined) => harsh(s) ? BED_UPGRADE_SCALE : 1;
