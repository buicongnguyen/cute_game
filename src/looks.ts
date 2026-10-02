/**
 * Explorer body styles ("looks"), bought with energy at the bedroom mirror and switched freely once owned.
 * Pure state (no three.js) so model.ts parses it and the server runs the same rules (actions.ts buyLook / wearLook).
 *
 * The art is art/blender/kit/build_hero_styles.py: each style is its own hero-<id>.glb with the default hero's part names
 * and materials. FIT mirrors that script's art/generated/kit/hero-styles.json (tests/looks.test.ts checks them): the
 * per-part transform World.wearKit applies to a gear piece after placing it relative to the DEFAULT pivot, so every
 * hat, outfit, boot and weapon made for the default hero fits the taller body without new gear art.
 * A look is cosmetic: stats, hitboxes and HERO_SCALE are the same for every style.
 */
export type LookId = 'default' | 'tall' | 'catboy' | 'bunny';
export const LOOK_IDS: readonly LookId[] = ['default', 'tall', 'catboy', 'bunny'];
export interface Looks { owned: LookId[]; style: LookId }
export interface Fit { scale: [number, number, number]; offset: [number, number, number] }
/** Prices sit between a hat and an outfit (cosmetic, no stats); the default look is free and always owned. */
export const LOOKS: Record<LookId, { name: string; desc: string; price: number; icon: string; file?: string }> = {
  default: { name: 'Explorer', desc: 'The classic round explorer with a leaf sprout.', price: 0, icon: '🧒' },
  tall: { name: 'Tall', desc: 'Taller and slimmer, with a smaller head.', price: 120, icon: '🧍', file: 'hero-tall.glb' },
  catboy: { name: 'Cat boy', desc: 'Cat ears and a curly tail. Ears tuck under hats.', price: 180, icon: '🐱', file: 'hero-catboy.glb' },
  bunny: { name: 'Bunny girl', desc: 'Long bunny ears, twin tails and a puff tail. Ears tuck under hats.', price: 180, icon: '🐰', file: 'hero-bunny.glb' },
};
const E = .36;
/** Gear fit per hero part (three.js part space: scale, then offset). Only the tall body moves its pivots. */
export const FIT: Record<LookId, Partial<Record<string, Fit>>> = {
  default: {}, catboy: {}, bunny: {},
  tall: {
    head: { scale: [.8, .8, .8], offset: [0, 0, 0] },
    body: { scale: [.82, 1.15, .82], offset: [0, 0, 0] },
    'arm-left': { scale: [.88, 1.45, .88], offset: [0, 0, 0] },
    'arm-right': { scale: [.88, 1.45, .88], offset: [0, 0, 0] },
    'leg-left': { scale: [1, 1, 1], offset: [0, -E, 0] },
    'leg-right': { scale: [1, 1, 1], offset: [0, -E, 0] },
    'hand-right': { scale: [1, 1, 1], offset: [0, 0, 0] },
  },
};
export const isLook = (v: unknown): v is LookId => typeof v === 'string' && (LOOK_IDS as readonly string[]).includes(v);
/** Saves from before looks have no `looks`: they parse as undefined, which means "default, nothing else owned". */
export function parseLooks(raw: unknown): Looks | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const r = raw as Record<string, unknown>;
  const owned = Array.isArray(r.owned) ? [...new Set(r.owned.filter(isLook))].filter(id => id !== 'default') : [];
  const style = isLook(r.style) && (r.style === 'default' || owned.includes(r.style)) ? r.style : 'default';
  return owned.length || style !== 'default' ? { owned, style } : undefined;
}
interface HasLooks { energy: number; looks?: Looks }
export const lookOf = (s: { looks?: Looks }): LookId => isLook(s.looks?.style) ? s.looks!.style : 'default';
export const ownsLook = (s: { looks?: Looks }, id: LookId) => id === 'default' || !!s.looks?.owned.includes(id);
/** Buys a look with energy and wears it. False if unknown, already owned or too dear. */
export function buyLook(s: HasLooks, id: unknown): boolean {
  if (!isLook(id) || ownsLook(s, id) || s.energy < LOOKS[id].price) return false;
  s.energy -= LOOKS[id].price; s.looks ??= { owned: [], style: 'default' }; s.looks.owned.push(id); s.looks.style = id; return true;
}
/** Switches to an owned look (free). */
export function wearLook(s: HasLooks, id: unknown): boolean {
  if (!isLook(id) || !ownsLook(s, id)) return false;
  s.looks ??= { owned: [], style: 'default' }; s.looks.style = id; return true;
}
