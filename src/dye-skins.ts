import type { ItemDef } from './content.ts';

/**
 * Dyes: energy-priced recolours of gear we already have (hats, outfits, weapons, boots, companions). The idea comes from
 * the reference's "mythic skins" (same stats, new colours, untradeable, cheaper in sets), but there is no real money, and
 * the styles, names and colours are our own.
 *
 * How they join the game without touching a single existing definition:
 * - registerDyes(ITEMS) is called once from the end of content.ts and ADDS one item per (style, base piece) under the id
 *   `dye_<style>_<baseId>`. Each copy is a deep clone of the base item (so the stats, the weapon and the pet blocks are the
 *   same numbers by construction) with its own name, `noTrade: true`, no sell value and no shop price, so nothing that
 *   sells, lists or auto-offers gear ever sees it (special-offers.ts leaves anything with `dye` out too).
 * - The renderer finds the base model through baseOf(id) and recolours it (dye-render.ts); the 2D icon is the base icon with
 *   a CSS filter (dye-ui.css). Nothing new has to be modelled.
 * - Ownership needs no save field: a dye is an ordinary bag item (one slot per id, like every item), worn in its gear slot.
 *
 * This module is pure data and arithmetic and imports no game code at run time, so content.ts can call it while loading
 * and the browser and the server (actions.ts replays purchases) read the same prices.
 */
export type DyeStyleId = 'gilded' | 'prism' | 'frost' | 'shade' | 'ruby';
export interface DyeStyle { id: DyeStyleId; name: string; /** The colour multiplied or blended into the 3D model. */ tint: string; /** Prism: each part of the model gets its own hue. */ rainbow?: boolean; /** A little glow so gilded and prism pieces shine. */ glow?: string; /** CSS class that tints the 2D icon (dye-ui.css). */ cls: string }
export const DYE_STYLES: Record<DyeStyleId, DyeStyle> = {
  gilded: { id: 'gilded', name: 'Gilded', tint: '#f2b930', glow: '#5c3b00', cls: 'dye-gilded' },
  prism: { id: 'prism', name: 'Prism', tint: '#c07bff', rainbow: true, glow: '#2a2050', cls: 'dye-prism' },
  frost: { id: 'frost', name: 'Frost', tint: '#7fdcff', glow: '#0a3a55', cls: 'dye-frost' },
  shade: { id: 'shade', name: 'Shade', tint: '#4b3f78', cls: 'dye-shade' },
  ruby: { id: 'ruby', name: 'Ruby', tint: '#e0264f', glow: '#4a0010', cls: 'dye-ruby' },
};
export const DYE_STYLE_IDS = Object.keys(DYE_STYLES) as DyeStyleId[];

/**
 * Which base pieces each style recolours. Every base is an ordinary shop piece with a Blender model and no id-specific
 * behaviour in the code (flying pets and the harpoon were left out on purpose). Gilded and Frost are full five-piece
 * sets; the other three have four pieces.
 */
export const DYE_PICKS: Record<DyeStyleId, readonly string[]> = {
  gilded: ['hat_samurai', 'armor_knight', 'sword_crystal', 'boots_rocket', 'pet_robot'],
  prism: ['hat_halo', 'armor_angel', 'blaster_rainbow', 'pet_sheep'],
  frost: ['hat_viking', 'armor_space', 'gun_ice', 'boots_cloud', 'pet_turtle'],
  shade: ['hat_pirate', 'armor_tux', 'scythe_moon', 'boots_cowboy'],
  ruby: ['hat_wizard', 'armor_kimono', 'staff_fire', 'bow_star'],
};
const SLOTS = ['hat', 'outfit', 'boots', 'weapon', 'pet'];

/** What a flat single dye costs before the base piece's worth is added (see dyePrice). */
export const DYE_PRICE = 6000;
/** A set of five or more missing pieces is 45% cheaper than buying them one by one; three or four, 14% cheaper. */
export const SET_DISCOUNT_FIVE = 0.45, SET_DISCOUNT_THREE = 0.14;
export const setDiscount = (pieces: number) => pieces >= 5 ? SET_DISCOUNT_FIVE : pieces >= 3 ? SET_DISCOUNT_THREE : 0;

export interface DyeInfo { style: DyeStyleId; base: string; price: number }
const registry = new Map<string, DyeInfo>();
export const dyeId = (style: DyeStyleId, base: string) => `dye_${style}_${base}`;
/** The price of one dye: ϟ6,000 scaled by the base piece's worth (x(1 + sell/400), so a ϟ30 hat costs 6,450 and a ϟ380 blaster 11,700), rounded to 50. Deterministic from content. */
export const priceFor = (sell: number) => Math.round(DYE_PRICE * (1 + Math.max(0, sell) / 400) / 50) * 50;

/** Adds every dye variant to `items` (idempotent). Called once by content.ts after the base items exist. */
export function registerDyes(items: Record<string, ItemDef>) {
  for (const style of DYE_STYLE_IDS) for (const base of DYE_PICKS[style]) {
    const def = Object.hasOwn(items, base) ? items[base] : undefined, id = dyeId(style, base);
    if (!def || !SLOTS.includes(def.slot ?? '') || Object.hasOwn(items, id)) continue;
    const info: DyeInfo = { style, base, price: priceFor(def.sell) };
    const copy: ItemDef = structuredClone(def);
    delete copy.price; delete copy.materials; delete copy.keepsake;
    items[id] = { ...copy, name: `${DYE_STYLES[style].name} ${def.name}`, sell: 0, noTrade: true, dye: info };
    registry.set(id, info);
  }
}
export const isDye = (id: string) => registry.has(id);
export const dyeInfo = (id: string): DyeInfo | undefined => registry.get(id);
/** The item a dye recolours (the model, the kit and the level gate belong to it); any other id is its own base. */
export const baseOf = (id: string) => registry.get(id)?.base ?? id;
/** Every dye id, in style order. */
export const dyeIds = () => [...registry.keys()];
export const dyeIdsOf = (style: DyeStyleId) => [...registry].filter(([, info]) => info.style === style).map(([id]) => id);
/** Whether a player may trade or give the item away: false for dyes (there is no trading yet, so this guards every future route). */
export const isTradeable = (id: string) => !registry.has(id);
/** The CSS class tinting a dye's 2D icon, or '' for any other item. */
export const dyeIconClass = (id: string) => { const info = registry.get(id); return info ? DYE_STYLES[info.style].cls : ''; };

/** The price of a single dye (a pure number: the shop and the server both read it); null for an id that is not a dye. */
export const dyePrice = (id: string): number | null => registry.get(id)?.price ?? null;
/** The price of buying `ids` (dyes of one style that are still missing) as a set: their singles added up, less the set discount. */
export function setPrice(ids: readonly string[]): number {
  const total = ids.reduce((sum, id) => sum + (dyePrice(id) ?? 0), 0);
  return Math.floor(total * (1 - setDiscount(ids.length)));
}
