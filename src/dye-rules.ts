import * as M from './model.ts';
import { DYE_STYLES, dyeIdsOf, dyePrice, isDye, setPrice, setDiscount, type DyeStyleId } from './dye-skins.ts';

/**
 * Buying dyes: the rules the shop (dye-ui.ts) and the server (actions.ts `buyDye` / `buyDyeSet`, replayed by
 * server/action-service.mjs) share, so a client cannot name its own price. Nothing is granted unless the whole purchase
 * can be paid and fits the backpack; a failed purchase changes nothing. A dye is an ordinary bag item (one slot per id,
 * like every item), so there is no new save field and old saves load unchanged.
 */
/** A dye the explorer has: loose, worn (a worn piece still counts in the bag) or kept in the house chest. */
export const ownsDye = (s: Pick<M.SaveState, 'bag' | 'chest'>, id: string) => (s.bag[id] ?? 0) > 0 || (s.chest[id] ?? 0) > 0;
/** Why this dye cannot be bought right now, or null when it can. */
export function dyeBlock(s: M.SaveState, id: string): string | null {
  const price = dyePrice(id);
  if (price === null || !isDye(id)) return 'That dye is not for sale.';
  if (ownsDye(s, id)) return 'You already own that dye.';
  if (!M.levelAllows(s.level, id)) return M.gearLevel(id) > s.level ? 'Needs level {level}.' : 'That dye is not for sale.';
  if (s.energy < price) return 'You need {cost} energy for that.';
  return M.fits(s, { [id]: 1 }) ? null : M.BAG_FULL;
}
export function buyDye(s: M.SaveState, id: string): boolean {
  if (typeof id !== 'string' || dyeBlock(s, id) !== null || !M.addItem(s, id)) return false;
  s.energy -= dyePrice(id)!; M.recordEvent(s, 'craft'); return true;
}
/** The dyes of a style the explorer does not have yet, and what they cost together as a set (`null` price below three missing pieces: those sell singly). */
export function setOffer(s: Pick<M.SaveState, 'bag' | 'chest'>, style: DyeStyleId) {
  const missing = dyeIdsOf(style).filter(id => !ownsDye(s, id));
  return { missing, price: setDiscount(missing.length) > 0 ? setPrice(missing) : null, single: missing.reduce((n, id) => n + (dyePrice(id) ?? 0), 0) };
}
/** Why the style's set cannot be bought right now, or null when it can. */
export function setBlock(s: M.SaveState, style: unknown): string | null {
  if (typeof style !== 'string' || !Object.hasOwn(DYE_STYLES, style)) return 'That dye is not for sale.';
  const offer = setOffer(s, style as DyeStyleId);
  if (offer.price === null) return 'A set needs at least three dyes you do not have yet.';
  if (offer.missing.some(id => !M.levelAllows(s.level, id))) return 'Some of these dyes need a higher level.';
  if (s.energy < offer.price) return 'You need {cost} energy for that.';
  return M.fits(s, Object.fromEntries(offer.missing.map(id => [id, 1]))) ? null : M.BAG_FULL;
}
export function buyDyeSet(s: M.SaveState, style: unknown): boolean {
  if (setBlock(s, style) !== null) return false;
  const offer = setOffer(s, style as DyeStyleId);
  for (const id of offer.missing) if (!M.addItem(s, id)) return false; // cannot happen after the fits check; the caller's clone is dropped on false
  s.energy -= offer.price!; M.recordEvent(s, 'craft', offer.missing.length); return true;
}
/** The plain-words refusal for the toast (refusals.ts): the first thing the rule found wrong, read from the state as it was. */
export function dyeReason(s: M.SaveState, p: Record<string, unknown>): string {
  const bySet = typeof p.style === 'string', id = typeof p.id === 'string' ? p.id : '';
  const text = (bySet ? setBlock(s, p.style) : dyeBlock(s, id)) ?? 'That dye is not for sale.';
  const cost = bySet ? setOffer(s, p.style as DyeStyleId).price : dyePrice(id);
  return text.replace('{cost}', String(cost ?? '')).replace('{level}', String(id ? M.gearLevel(id) : ''));
}
