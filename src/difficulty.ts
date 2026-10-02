import { CROPS, ITEMS, type ItemId } from './content.ts';

/**
 * Difficulty (a per-save setting, Settings panel). Easy keeps every original value; Normal and Hard make the economy
 * slower; Hard also makes creatures tougher. Base tables are never changed: prices and rules are read through these
 * helpers with the save, so switching mid-game takes effect for new purchases, plantings and fights at once.
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
  normal: 'A slower economy: kitchen at level 14, leaner fruit trees, dearer livestock.',
  hard: 'Normal’s economy, and creatures with more health and harder hits.',
};
const harsh = (s: WithSettings | null | undefined) => difficultyOf(s) !== 'easy';

/** Zoo Pet gates cooking behind its level-14 lava reward: Normal and Hard lock the kitchen (and Pepper's cooking) until then. */
export const KITCHEN_LEVEL = 14;
export const kitchenLevel = (s: WithSettings) => harsh(s) ? KITCHEN_LEVEL : 0;
export const kitchenOpen = (s: WithSettings & { level: number }) => s.level >= kitchenLevel(s);

/** Fruit trees (the 8-14 hour crops): later and leaner off Easy — apple L3 600/400 becomes L8 sell 150, 120 XP. */
export const TREE_LEVEL_STEP = 5, TREE_LEVEL_CAP = 25, TREE_SELL = .25, TREE_XP = .3;
export const isFruitTree = (id: string) => Object.hasOwn(CROPS, id) && CROPS[id].duration >= 8 * 3_600_000;
export function cropLevel(s: WithSettings, id: string) {
  const c = CROPS[id]; if (!c) return Infinity;
  return harsh(s) && isFruitTree(id) ? Math.min(TREE_LEVEL_CAP, c.level + TREE_LEVEL_STEP) : c.level;
}
export function cropXp(s: WithSettings, id: string) { const c = CROPS[id]; return !c ? 0 : harsh(s) && isFruitTree(id) ? Math.round(c.xp * TREE_XP) : c.xp; }
/** What one item sells for at the market. */
export function sellPrice(s: WithSettings, id: ItemId) { const base = ITEMS[id]?.sell ?? 0; return harsh(s) && isFruitTree(id) ? Math.round(base * TREE_SELL) : base; }

/** Livestock off Easy: chicken 60 (was 25), cow 120 (was 70), duck and pig about 1.7x; products come 1.5x less often. */
const ANIMAL_PRICE: Record<string, number> = { chicken: 60, cow: 120 };
export const ANIMAL_PRICE_SCALE = 1.7, PRODUCT_PACE = 1.5;
export function animalPrice(s: WithSettings, kind: string, base: number) {
  if (!harsh(s) || kind === 'dog') return base;
  return ANIMAL_PRICE[kind] ?? Math.round(base * ANIMAL_PRICE_SCALE / 10) * 10;
}
/** The product-interval multiplier an animal bought now carries for life (owned animals keep theirs). */
export const productPace = (s: WithSettings) => harsh(s) ? PRODUCT_PACE : 1;

/** Hard creatures (bosses too): +25% health, +20% damage. One helper for the client world and the server. */
export function creatureScale(d: Difficulty | WithSettings | null | undefined) {
  const level = typeof d === 'string' ? d : difficultyOf(d);
  return level === 'hard' ? { hp: 1.25, damage: 1.2 } : { hp: 1, damage: 1 };
}
