/**
 * How effective an item is, as one number per category, so every purchase list (the outfitters' tabs, the workshop and
 * forge recipes, the tester shop) runs from the weakest to the strongest. Ties (and things with no fighting value:
 * seeds, kits, decorations, materials) sort by price. Each row shows the key number so the order reads at a glance;
 * the chips are icons and digits only, so they need no translation.
 *
 * Scores:
 *  - weapons: damage per second, attack / cooldown (a spread gun's pellets count .45 each, as combat.ts fires them);
 *  - rods: fishing power (quality);
 *  - hats, outfits, boots, disguises: defence + health / 5 + attack + 3 x regeneration + crit and speed in points;
 *  - companions: the same plus their shot (damage factor per second x 100);
 *  - food: healing plus its buff (each buff in rough health-equivalent points, scaled by its minutes).
 * A tab that mixes kinds lists them in KIND_RANK order (the Weapons tab: rods first, as tools, then weapons by DPS).
 */
import { ITEMS, type ItemDef } from './content.ts';
import type { SaveState } from './model.ts';
import { forgeLevel } from './weapon-forge.ts';
import { gearLevel, upgradableGear } from './upgrades.ts';

export type PowerKind = 'weapon' | 'rod' | 'wear' | 'pet' | 'food' | 'other';
const BUFF_WEIGHT: Record<string, number> = { atk: 200, def: 4, haste: 150, regen: 12, speed: 100, crit: 200, xp: 60, magnet: 20, luck: 100, light: 10, fireres: 60, lifesteal: 200 };
export function powerKind(item: ItemDef | undefined): PowerKind {
  if (!item) return 'other';
  if (item.slot === 'weapon') return item.weapon?.kind === 'rod' ? 'rod' : 'weapon';
  if (item.slot === 'pet') return 'pet';
  if (item.slot) return 'wear';
  if (item.heal || item.buff) return 'food';
  return 'other';
}
const statPoints = (item: ItemDef) => { const s = item.stats ?? {}; return (s.def ?? 0) + (s.hp ?? 0) / 5 + (s.atk ?? 0) + 3 * (s.regen ?? 0) + 100 * (s.crit ?? 0) + 50 * (s.speed ?? 0); };
const weaponDps = (item: ItemDef) => { const w = item.weapon!, spread = w.spread ?? 1; return (item.stats?.atk ?? item.attack ?? 0) * (spread > 1 ? spread * .45 : 1) / Math.max(.1, w.cd || .5); };
const petShot = (item: ItemDef) => item.pet?.dmg && item.pet.cd ? item.pet.dmg / item.pet.cd * 100 : 0;
const buffPoints = (item: ItemDef) => { const b = item.buff; if (!b) return 0; let sum = 0; for (const [k, v] of Object.entries(b)) if (k !== 'time' && typeof v === 'number') sum += v * (BUFF_WEIGHT[k] ?? 0); return sum * Math.max(.5, (b.time || 60) / 60); };
/** One effectiveness number (higher = stronger) for the item's own category. */
export function itemScore(id: string): number {
  const item = Object.hasOwn(ITEMS, id) ? ITEMS[id] : undefined, kind = powerKind(item);
  if (!item) return 0;
  if (kind === 'weapon') return weaponDps(item);
  if (kind === 'rod') return (item.weapon?.quality ?? 0) * 100;
  if (kind === 'pet') return statPoints(item) + petShot(item);
  if (kind === 'wear') return statPoints(item);
  if (kind === 'food') return Math.min(item.heal ?? 0, 2000) + buffPoints(item);
  return 0;
}
/** Scores of different kinds are different units: a mixed list keeps plain goods, then tools (rods), food, wear, companions, weapons. */
const KIND_RANK: Record<PowerKind, number> = { other: 0, rod: 1, food: 2, wear: 3, pet: 4, weapon: 5 };
/** Weakest first; equal effect → cheaper first; then by id so the order never shuffles between renders. */
export function compareByPower(a: string, b: string, priceOf: (id: string) => number = id => ITEMS[id]?.price ?? 0) {
  const ka = KIND_RANK[powerKind(ITEMS[a])], kb = KIND_RANK[powerKind(ITEMS[b])];
  return ka - kb || itemScore(a) - itemScore(b) || priceOf(a) - priceOf(b) || (a < b ? -1 : a > b ? 1 : 0);
}
export function sortByPower<T>(list: readonly T[], idOf: (entry: T) => string, priceOf?: (entry: T) => number): T[] {
  const index = new Map(list.map(entry => [idOf(entry), entry] as const));
  return [...list].sort((x, y) => compareByPower(idOf(x), idOf(y), priceOf ? id => priceOf(index.get(id)!) : undefined));
}
const n = (v: number) => (Math.round(v * 10) / 10).toString();
/** The key number of a row, e.g. "⚔️ 11/s", "🛡️ 8 · ❤️ 25", "🐾 25", "❤️ 40 · ✨ 30", or '' for plain goods. */
export function powerLabel(id: string): string {
  const item = Object.hasOwn(ITEMS, id) ? ITEMS[id] : undefined, kind = powerKind(item);
  if (!item || kind === 'other') return '';
  if (kind === 'weapon') return `⚔️ ${n(weaponDps(item))}/s`;
  if (kind === 'rod') return `🎣 ${Math.round((item.weapon?.quality ?? 0) * 100)}`;
  if (kind === 'food') { const buff = Math.round(buffPoints(item)); return [item.heal ? `❤️ ${item.heal >= 9999 ? '∞' : item.heal}` : '', buff ? `✨ ${buff}` : ''].filter(Boolean).join(' · '); }
  const s = item.stats ?? {}, parts = [s.def ? `🛡️ ${s.def}` : '', s.hp ? `❤️ ${s.hp}` : '', s.atk ? `⚔️ ${s.atk}` : ''].filter(Boolean);
  if (kind === 'pet') parts.unshift(`🐾 ${Math.round(itemScore(id))}`);
  return parts.join(' · ') || `✨ ${Math.round(itemScore(id))}`;
}
export const powerChip = (id: string) => { const label = powerLabel(id); return label ? `<span class="chip chip-power">${label}</span>` : ''; };
/** "+3" for a forged weapon or a bench-levelled piece of gear, '' at +0. */
export function levelOf(s: SaveState, id: string) { return upgradableGear(id) ? gearLevel(s, id) : ITEMS[id]?.slot === 'weapon' ? forgeLevel(s, id) : 0; }
export const levelTag = (s: SaveState, id: string) => { const level = levelOf(s, id); return level ? ` <span class="level-tag">+${level}</span>` : ''; };
