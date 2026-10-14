import { ITEMS, canonicalItem } from './content.ts';
import { isSpecial } from './special-offers.ts';
import { MAX_FORGE_LEVEL } from './weapon-forge.ts';

/**
 * A blade grows with the work put into it (the owner's rule, 2026-10-14): its slash wind gets longer and brighter with
 * its forge level (+0..+15, weapon-forge.ts) and its tier, and its real reach rises only a little, about half a metre
 * at the very top (a premium blade at +15). All of it is the one number `growth` (0..1) read through GROWTH, so the
 * look and the rule can never drift apart. The reach is a shared rule: model.ts weaponStats adds it, and the server
 * fights with that same function (server/combat-authority.mjs), so online and solo reach the same.
 *
 * Tiers: 0 basic (sold at the outfitters), 1 crafted or boss-dropped (special-offers.ts isSpecial), 2 premium (a rare
 * weapon, or a dyed premium skin, dye-skins.ts).
 */
export type WeaponTier = 0 | 1 | 2;
export const GROWTH = {
  /** Metres of reach at growth 1 (premium +15). */
  reach: .5,
  /** The share of growth the forge gives; the rest comes from the tier. */
  forge: .8,
  /** At growth 1 the blade's ribbon reaches this much farther out (x1.6), and its colour is this much brighter and whiter. */
  length: .6, bright: .55, whiten: .35,
} as const;

export function weaponTier(raw: string | undefined): WeaponTier {
  if (!raw || !Object.hasOwn(ITEMS, raw)) return 0;
  const item = ITEMS[raw], base = ITEMS[canonicalItem(raw)] ?? item;
  if (item.rare || base.rare || item.dye) return 2;
  return isSpecial(raw) || isSpecial(canonicalItem(raw)) ? 1 : 0;
}
/** 0 for a basic blade at +0, 1 for a premium one at +15. */
export function growth(forge: number, tier: number): number {
  const f = Math.max(0, Math.min(MAX_FORGE_LEVEL, Number.isFinite(forge) ? forge : 0)) / MAX_FORGE_LEVEL, k = Math.max(0, Math.min(2, Number.isFinite(tier) ? tier : 0)) / 2;
  return GROWTH.forge * f + (1 - GROWTH.forge) * k;
}
/** Extra metres of real hit reach (rounded to millimetres so client and server agree to the digit). */
export const reachBonus = (forge: number, tier: number) => Math.round(GROWTH.reach * growth(forge, tier) * 1000) / 1000;
/** How the slash wind looks: its length factor (the ribbon reaches farther from the grip), brightness and whitening. */
export function windLook(forge: number, tier: number) { const g = growth(forge, tier); return { length: 1 + GROWTH.length * g, bright: 1 + GROWTH.bright * g, whiten: GROWTH.whiten * g }; }
/** A trail colour (linear r, g, b) grown: mixed towards white, then lit up (values above 1 glow: the trail is not tone mapped). */
export function grownTint(rgb: readonly [number, number, number], look: { bright: number; whiten: number }): [number, number, number] {
  return [0, 1, 2].map(i => Math.min(1.8, (rgb[i] + (1 - rgb[i]) * look.whiten) * look.bright)) as [number, number, number];
}
/** The blade's measured axis (trail-ribbon.ts Blade) reaching `length` times as far from the grip: the ribbon sweeps a longer arc. */
export function growBlade<B extends { grip: readonly number[]; tip: readonly number[]; inner: readonly number[]; length: number }>(blade: B, length: number): B {
  if (!(length > 1)) return blade;
  const out = (p: readonly number[]) => [0, 1, 2].map(i => blade.grip[i] + (p[i] - blade.grip[i]) * length);
  return { ...blade, tip: out(blade.tip), inner: out(blade.inner), length: blade.length * length } as B;
}
/** The look of the blade in hand from the save: its forge level and tier. Not a sword (or nothing held): no growth. */
export function heldWindLook(forge: number, id: string | undefined) { return id && ITEMS[id]?.weapon?.kind === 'sword' ? windLook(forge, weaponTier(id)) : windLook(0, 0); }
