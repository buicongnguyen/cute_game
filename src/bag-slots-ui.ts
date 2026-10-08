import { ITEMS } from './content.ts';
import { looseQuantity } from './pantry.ts';
import { STORAGE, bagCapacity, bagSlotsUsed, chestCapacity, chestSlotsUsed, nextExpansion, hasExpansionMaterials, storageLevel, type StorageKind } from './storage-slots.ts';
import type { SaveState } from './model.ts';

/**
 * The slot meter and the "Expand" card of the backpack and chest panels (main.ts inventory/storage), like the
 * reference's bag modal: "Mở rộng Túi đồ [20 ô] · Bậc 1/5: thêm 4 ô (20 → 24). Nguyên liệu lấy trong túi đồ." with the
 * energy and material chips and an Expand button. Pure HTML builders; English text is translated by the caller's t().
 */
type T = (text: string, params?: Record<string, string | number>) => string;
const esc = (value: string) => value.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
export function slotUse(s: SaveState, kind: StorageKind) {
  const used = kind === 'bag' ? bagSlotsUsed(s) : chestSlotsUsed(s), size = kind === 'bag' ? bagCapacity(s) : chestCapacity(s);
  return { used, size, full: used >= size };
}
/** "12 / 20 slots" with a small fill bar; red when full (or over-full from an older save). */
export function slotMeterHtml(s: SaveState, kind: StorageKind, t: T) {
  const { used, size, full } = slotUse(s, kind), share = Math.min(100, Math.round(used / size * 100));
  return `<span class="slot-meter${full ? ' full' : ''}" data-slots="${kind}" title="${esc(t('Each kind of item takes one slot.'))}"><i style="--fill:${share}%"></i><b>${used} / ${size}</b> ${esc(t('slots'))}</span>`;
}
/** The expansion card: next step, its energy and materials (have/need from the backpack) and the Expand button. */
export function expandCardHtml(s: SaveState, kind: StorageKind, t: T, icon: (id: string) => string) {
  const next = nextExpansion(s, kind), title = kind === 'bag' ? t('Expand backpack') : t('Expand chest');
  if (!next) return `<div class="expand-card maxed" data-expand="${kind}"><span class="expand-icon" aria-hidden="true">${kind === 'bag' ? '🎒' : '📦'}</span><div><strong>${esc(title)}</strong><small>${esc(t('Fully expanded: {size} slots.', { size: kind === 'bag' ? bagCapacity(s) : chestCapacity(s) }))}</small></div></div>`;
  const energyOk = s.energy >= next.energy, ok = energyOk && hasExpansionMaterials(s, next.materials);
  const chips = [`<span class="chip chip-energy${energyOk ? '' : ' chip-miss'}">ϟ ${next.energy.toLocaleString()}</span>`,
    ...Object.entries(next.materials).map(([id, n]) => { const have = looseQuantity(s, id), name = esc(t(ITEMS[id]?.name ?? id)); return `<span class="chip${have < n! ? ' chip-miss' : ''}" title="${name}">${icon(id)}<span class="vh">${name}</span> ${have}/${n}</span>`; })].join('');
  return `<div class="expand-card" data-expand="${kind}"><span class="expand-icon" aria-hidden="true">${kind === 'bag' ? '🎒' : '📦'}</span><div><strong>${esc(title)} <em>${next.size} ${esc(t('slots'))}</em></strong>`
    + `<small>${esc(t('Step {step}/{max}: +{add} slots ({from} → {to}). Materials come from your backpack.', { step: storageLevel(s, kind) + 1, max: STORAGE[kind].max, add: STORAGE[kind].add, from: next.size, to: next.next }))}</small>`
    + `<span class="chips">${chips}</span></div><button class="primary expand-button" data-action="expand-storage" data-kind="${kind}" ${ok ? '' : 'disabled'}>${esc(t('Expand'))}</button></div>`;
}
