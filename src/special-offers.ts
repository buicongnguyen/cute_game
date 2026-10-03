import { ITEMS, RECIPES, LOOT_TABLES } from './content.ts';

/**
 * Special offers: gear, companions and decorations that are normally only crafted at the workshop or dropped by bosses
 * are also listed at the outfitters, for a high energy price, so a player who would rather not grind materials or a
 * boss can still save up for one. The normal ways keep working and stay far cheaper; this is a late, energy-rich route.
 *
 * Price scale (the user asked for 10,000 each):
 * - SPECIAL_PRICE ϟ10,000 for every crafted or boss-dropped item. Crafted ones cost ϟ40-520 plus materials at the
 *   workshop and sell for 20-340, so 10,000 is a deliberate premium, about an afternoon of late-game farming.
 * - TITAN_PRICE ϟ25,000 for the titan trophies (hat_t_* / pet_t_*, legend): the rarest drops in the game, from the
 *   hardest bosses, and the strongest hats and companions (they sell for 900-1,600, three to five times anything else
 *   here). At a flat 10,000 they would be the cheapest way to the best companion, so they cost two and a half times more.
 * Keepsakes from old saves (the Mochi bunny) are never sold. Pure rules: the shop (model.ts buy/shopPrice) and the
 * server (actions.ts replays buy) read the same numbers, so a client cannot name its own price.
 */
export const SPECIAL_PRICE = 10_000, TITAN_PRICE = 25_000;
export type SpecialSource = 'workshop' | 'boss' | 'titan';

const titan = (id: string) => !!ITEMS[id].legend && /^(hat|pet)_t_/.test(id);
/** Gear, a companion or a decoration that the outfitters do not normally sell. */
export function isSpecial(id: string): boolean {
  if (!Object.hasOwn(ITEMS, id)) return false;
  const item = ITEMS[id];
  return (!!item.slot || item.type === 'decor') && item.price === undefined && !item.keepsake;
}
/** The special energy price, or null when the item is not a special offer. */
export function specialPrice(id: string): number | null { return isSpecial(id) ? titan(id) ? TITAN_PRICE : SPECIAL_PRICE : null; }
/** How the item is usually obtained, for the shop's "Usually …" line. */
export function specialSource(id: string): SpecialSource {
  if (titan(id)) return 'titan';
  return RECIPES.some(r => r.result === id && r.station !== 'shop') ? 'workshop' : Object.values(LOOT_TABLES).some(table => Array.isArray(table) && table.some(entry => entry[0] === id)) ? 'boss' : 'workshop';
}
export const SOURCE_NOTE: Record<SpecialSource, string> = { workshop: 'Usually made at the workshop.', boss: 'Usually dropped by a boss.', titan: 'A titan trophy, the rarest boss drop.' };
/** Every special offer id (computed on call: other modules add items to ITEMS while loading). */
export const specialIds = () => Object.keys(ITEMS).filter(isSpecial);
