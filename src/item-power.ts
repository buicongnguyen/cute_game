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
 * Lists of things the player owns (the upgrade bench, the backpack) sort by ownedScore: the same score with the item's
 * bench level (its stats on the way to the slot ceiling, gear-ceiling.ts) or forge level applied; their chips can
 * show the levelled numbers too (powerChip(id, save)), and gearProgressHtml is the "Lv 7/10 · at max" block.
 */
import { ITEMS, type ItemDef } from './content.ts';
import type { SaveState } from './model.ts';
import { forgeLevel } from './weapon-forge.ts';
import { GEAR_STEP, MAX_GEAR_LEVEL, gearCeiling, gearFactor, gearLevel, levelledLine, upgradableGear } from './upgrades.ts';
import { statLineLabel, statPoints as linePoints, type StatLine } from './gear-ceiling.ts';
import { t } from './i18n.ts';

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
const statPoints = (item: ItemDef) => linePoints((item.stats ?? {}) as Partial<Record<string, number>>);
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
/** The score of an item as the player owns it: bench-levelled stats (and a companion's levelled shot), forged weapon attack. */
export function ownedScore(s: SaveState, id: string): number {
  const item = Object.hasOwn(ITEMS, id) ? ITEMS[id] : undefined, kind = powerKind(item);
  if (!item) return 0;
  if (kind === 'weapon') return weaponDps(item) * (1 + forgeLevel(s, id) / 100);
  if ((kind === 'wear' || kind === 'pet') && upgradableGear(id)) return linePoints(levelledLine(s, id)) + (kind === 'pet' ? petShot(item) * gearFactor(s, id) : 0);
  return itemScore(id);
}
/** Scores of different kinds are different units: a mixed list keeps plain goods, then tools (rods), food, wear, companions, weapons. */
const KIND_RANK: Record<PowerKind, number> = { other: 0, rod: 1, food: 2, wear: 3, pet: 4, weapon: 5 };
/** Weakest first; equal effect → cheaper first; then by id so the order never shuffles between renders. */
export function compareByPower(a: string, b: string, priceOf: (id: string) => number = id => ITEMS[id]?.price ?? 0, scoreOf: (id: string) => number = itemScore) {
  const ka = KIND_RANK[powerKind(ITEMS[a])], kb = KIND_RANK[powerKind(ITEMS[b])];
  return ka - kb || scoreOf(a) - scoreOf(b) || priceOf(a) - priceOf(b) || (a < b ? -1 : a > b ? 1 : 0);
}
/** `scoreOf` = (id) => ownedScore(save, id) for lists of owned things, so levelled items sort by what they do now. */
export function sortByPower<T>(list: readonly T[], idOf: (entry: T) => string, priceOf?: (entry: T) => number, scoreOf?: (id: string) => number): T[] {
  const index = new Map(list.map(entry => [idOf(entry), entry] as const));
  return [...list].sort((x, y) => compareByPower(idOf(x), idOf(y), priceOf ? id => priceOf(index.get(id)!) : undefined, scoreOf));
}
const n = (v: number) => (Math.round(v * 10) / 10).toString();
/** The key number of a row, e.g. "⚔️ 11/s", "🛡️ 8 · ❤️ 25", "🐾 25", "❤️ 40 · ✨ 30", or '' for plain goods. With a save: as owned (levels applied). */
export function powerLabel(id: string, s?: SaveState): string {
  const item = Object.hasOwn(ITEMS, id) ? ITEMS[id] : undefined, kind = powerKind(item);
  if (!item || kind === 'other') return '';
  if (kind === 'weapon') return `⚔️ ${n(s ? ownedScore(s, id) : weaponDps(item))}/s`;
  if (kind === 'rod') return `🎣 ${Math.round((item.weapon?.quality ?? 0) * 100)}`;
  if (kind === 'food') { const buff = Math.round(buffPoints(item)); return [item.heal ? `❤️ ${item.heal >= 9999 ? '∞' : item.heal}` : '', buff ? `✨ ${buff}` : ''].filter(Boolean).join(' · '); }
  const owned = !!s && upgradableGear(id), score = owned ? ownedScore(s!, id) : itemScore(id);
  const st: Partial<StatLine> = owned ? levelledLine(s!, id) : item.stats ?? {}, parts = [st.def ? `🛡️ ${n(st.def)}` : '', st.hp ? `❤️ ${n(st.hp)}` : '', st.atk ? `⚔️ ${n(st.atk)}` : ''].filter(Boolean);
  if (kind === 'pet') parts.unshift(`🐾 ${Math.round(score)}`);
  return parts.join(' · ') || `✨ ${Math.round(score)}`;
}
export const powerChip = (id: string, s?: SaveState) => { const label = powerLabel(id, s); return label ? `<span class="chip chip-power">${label}</span>` : ''; };
/** "+3" for a forged weapon or a bench-levelled piece of gear, '' at +0. */
export function levelOf(s: SaveState, id: string) { return upgradableGear(id) ? gearLevel(s, id) : ITEMS[id]?.slot === 'weapon' ? forgeLevel(s, id) : 0; }
export const levelTag = (s: SaveState, id: string) => { const level = levelOf(s, id); return level ? ` <span class="level-tag">+${level}</span>` : ''; };
const esc = (v: string) => v.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const SAME_FOR: Record<string, string> = { hat: 'same for every hat', outfit: 'same for every outfit', boots: 'same for every pair of boots', pet: 'same for every companion' };
/** "Lv 7/10 · at max: ❤️ 210 · 🛡️ 42 … (same for every hat)" and a bar to +10, for bench-levelled gear ('' otherwise). */
export function gearProgressHtml(s: SaveState, id: string) {
  const ceiling = gearCeiling(id); if (!ceiling) return '';
  const level = gearLevel(s, id), label = esc(t('Level {level} / {max}', { level, max: MAX_GEAR_LEVEL }));
  const shot = ITEMS[id].slot === 'pet' && ITEMS[id].pet?.dmg ? `<p class="muted">${esc(t('Its shot stays its own: +{now}% damage', { now: Math.round(level * GEAR_STEP * 100) }))}</p>` : '';
  return `<div class="gear-max"><p>${esc(t('Lv {level}/{max} · at max: {stats}', { level, max: MAX_GEAR_LEVEL, stats: statLineLabel(ceiling) }))} <span class="muted">(${esc(t(SAME_FOR[ITEMS[id].slot!]))})</span></p><span class="gear-bar" role="progressbar" aria-valuemin="0" aria-valuemax="${MAX_GEAR_LEVEL}" aria-valuenow="${level}" aria-label="${label}"><i style="width:${level / MAX_GEAR_LEVEL * 100}%"></i></span>${shot}</div>`;
}
