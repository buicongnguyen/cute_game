import * as M from './model.ts';

/**
 * Quick eat: the HUD button that eats from the backpack without opening it. The reference only eats
 * from its bag menu (useItem, bundle @1049318), so the choice rule here is ours: the smallest heal that
 * covers the missing health (cheapest first on ties), otherwise the biggest heal there is.
 */
export type FoodChoice = M.ItemId | 'auto';

/** Healing foods in the backpack, smallest heal first (cheaper first on equal heals). */
export function healingFoods(s: M.SaveState): M.ItemId[] {
  return (Object.keys(s.bag) as M.ItemId[]).filter(id => (s.bag[id] ?? 0) > 0 && !M.ITEMS[id]?.slot && (M.ITEMS[id]?.heal ?? 0) > 0)
    .sort((a, b) => M.ITEMS[a].heal! - M.ITEMS[b].heal! || M.ITEMS[a].sell - M.ITEMS[b].sell || a.localeCompare(b));
}

/** The food a tap eats: the player's pick while they still carry it, else the best fit for the missing health. */
export function pickFood(s: M.SaveState, choice: FoodChoice = 'auto'): M.ItemId | null {
  const foods = healingFoods(s);
  if (choice !== 'auto' && foods.includes(choice)) return choice;
  const missing = M.maxHp(s) - s.hp;
  return foods.find(id => M.ITEMS[id].heal! >= missing) ?? foods.at(-1) ?? null;
}

/** What the button shows: the food, how many, and why it is greyed out (still tappable for a hint). */
export function quickEatView(s: M.SaveState, choice: FoodChoice = 'auto') {
  const id = pickFood(s, choice), full = s.hp >= M.maxHp(s);
  return { id, count: id ? s.bag[id] ?? 0 : 0, idle: !id || full, reason: !id ? 'none' as const : full ? 'full' as const : null };
}
