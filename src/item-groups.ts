/**
 * Item lists in labelled groups: every list that shows items (the outfitters' tabs, the backpack, the chest, the upgrade
 * bench's Gear tab, the workshop and forge, the tester shop, the market) shows one small header per kind of thing
 * ("🎩 Hats · 7") and, inside each group, runs from the weakest to the strongest (item-power.ts). Scores of different
 * kinds are different units, so grouping first is what makes "weakest to strongest" mean something.
 *
 * Group order is fixed per panel: shops and the bench lead with what you wear and fight with; the backpack, chest and
 * market lead with what you gather and sell. A tapped header folds its group; folds are remembered per device
 * (localStorage, a convenience only: a blocked store just means every group starts open).
 */
import { ITEMS } from './content.ts';
import { sortByPower } from './item-power.ts';
import { t } from './i18n.ts';

export type GroupId = 'hat' | 'outfit' | 'boots' | 'sword' | 'ranged' | 'tool' | 'pet' | 'disguise' | 'food' | 'harvest' | 'fish' | 'seed' | 'material' | 'decor' | 'kit';
export const GROUPS: Record<GroupId, { icon: string; label: string }> = {
  hat: { icon: '🎩', label: 'Hats' }, outfit: { icon: '👕', label: 'Outfits' }, boots: { icon: '👢', label: 'Boots' },
  sword: { icon: '⚔️', label: 'Swords' }, ranged: { icon: '🏹', label: 'Guns & staffs' }, tool: { icon: '🎣', label: 'Rods & tools' },
  pet: { icon: '🐾', label: 'Pets' }, disguise: { icon: '🎭', label: 'Disguises' }, food: { icon: '🍲', label: 'Food' },
  harvest: { icon: '🥕', label: 'Harvest' }, fish: { icon: '🐟', label: 'Fish' }, seed: { icon: '🌱', label: 'Seeds' },
  material: { icon: '🪵', label: 'Materials' }, decor: { icon: '🪴', label: 'Decorations' }, kit: { icon: '📦', label: 'Kits' },
};
/** Shops, the bench and the workshop: gear first, in the order you dress (head to feet), then weapons, tools, companions. */
export const GEAR_ORDER: readonly GroupId[] = ['hat', 'outfit', 'boots', 'sword', 'ranged', 'tool', 'pet', 'disguise', 'food', 'seed', 'material', 'harvest', 'fish', 'decor', 'kit'];
/** Backpack, chest and market: what you gather, eat and sell first, then gear. */
export const BAG_ORDER: readonly GroupId[] = ['food', 'harvest', 'fish', 'seed', 'material', 'hat', 'outfit', 'boots', 'sword', 'ranged', 'tool', 'pet', 'disguise', 'decor', 'kit'];

/** Which group an item belongs to (unknown ids fall into Materials). */
export function groupOf(id: string): GroupId {
  const item = Object.hasOwn(ITEMS, id) ? ITEMS[id] : undefined;
  if (!item) return 'material';
  if (item.slot === 'hat') return 'hat';
  if (item.slot === 'outfit') return 'outfit';
  if (item.slot === 'boots') return 'boots';
  if (item.slot === 'pet') return 'pet';
  if (item.slot === 'disguise') return 'disguise';
  if (item.slot === 'weapon') return item.weapon?.kind === 'rod' ? 'tool' : item.weapon?.kind === 'gun' ? 'ranged' : 'sword';
  if (item.type === 'bait') return 'tool';
  if (item.type === 'decor') return 'decor';
  if (item.type === 'placeable') return 'kit';
  if (item.type === 'crop') return 'harvest';
  if (item.type === 'fish') return 'fish';
  if (id.startsWith('seed_') || item.type === 'seed') return 'seed';
  if (item.type === 'food' || item.heal || item.buff) return 'food';
  return 'material';
}
export interface ItemGroup<T> { id: GroupId; icon: string; label: string; entries: T[] }
/** Splits `list` into groups in `order` (empty groups left out), each sorted weakest to strongest. */
export function groupItems<T>(list: readonly T[], idOf: (entry: T) => string, order: readonly GroupId[] = GEAR_ORDER, priceOf?: (entry: T) => number): ItemGroup<T>[] {
  const buckets = new Map<GroupId, T[]>();
  for (const entry of list) { const g = groupOf(idOf(entry)); (buckets.get(g) ?? buckets.set(g, []).get(g)!).push(entry); }
  const rank = (g: GroupId) => { const i = order.indexOf(g); return i < 0 ? order.length : i; };
  return [...buckets.keys()].sort((a, b) => rank(a) - rank(b) || GEAR_ORDER.indexOf(a) - GEAR_ORDER.indexOf(b))
    .map(id => ({ id, ...GROUPS[id], entries: sortByPower(buckets.get(id)!, idOf, priceOf) }));
}

const FOLD_KEY = 'zoo-garden-folded-groups';
let folded: Set<string> | null = null;
function folds() {
  if (folded) return folded;
  try { const raw = JSON.parse(globalThis.localStorage?.getItem(FOLD_KEY) ?? '[]'); folded = new Set(Array.isArray(raw) ? raw.filter(v => typeof v === 'string') : []); } catch { folded = new Set(); }
  return folded;
}
/** Whether `group` is folded in `panel` on this device. */
export const isFolded = (panel: string, group: string) => folds().has(`${panel}:${group}`);
/** Folds or unfolds a group (a header tap); returns the new folded state. */
export function toggleFold(panel: string, group: string) {
  const set = folds(), key = `${panel}:${group}`, now = !set.has(key);
  if (now) set.add(key); else set.delete(key);
  try { globalThis.localStorage?.setItem(FOLD_KEY, JSON.stringify([...set])); } catch { /* Per-device convenience only. */ }
  return now;
}
/** "🎩 Hats · 7" (translated label). */
export const groupTitle = (g: { icon: string; label: string }, count: number) => `${g.icon} ${t(g.label)} · ${count}`;
/**
 * The grouped list as markup: per group a header button (data-action="toggle-group") and a grid of `grid` class holding
 * `row(entry)` for each entry. Panels with a single group still show its header, so every list reads the same way.
 */
export function groupedHtml<T>(panel: string, groups: readonly ItemGroup<T>[], row: (entry: T) => string, grid = 'shop-grid') {
  return groups.map(g => {
    const shut = isFolded(panel, g.id);
    return `<section class="item-group${shut ? ' folded' : ''}" data-group="${g.id}"><h4 class="item-group-head"><button type="button" data-action="toggle-group" data-panel="${panel}" data-group="${g.id}" aria-expanded="${!shut}">${groupTitle(g, g.entries.length)}</button></h4><div class="${grid}">${g.entries.map(row).join("")}</div></section>`;
  }).join('');
}
