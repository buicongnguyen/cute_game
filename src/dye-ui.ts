import { t } from './i18n.ts';
import { ITEMS, gearLevel, type SaveState } from './model.ts';
import { DYE_STYLES, DYE_STYLE_IDS, dyeIdsOf, dyePrice, setDiscount, type DyeStyleId } from './dye-skins.ts';
import { ownsDye, setOffer } from './dye-rules.ts';
import './dye-ui.css';

/**
 * The outfitters' "Dyes" tab: energy-priced recolours of gear (dye-skins.ts), grouped by style. Each style is a card with
 * its pieces (icon = the base piece's icon with the style's CSS filter, name, price, Buy / Owned / Wear) and, while three
 * or more pieces are missing, one button that buys them all for less. main.ts adds the tab name and calls `fill()` once
 * after it opens the shop dialog on this tab; everything else (clicks, purchases, refreshing) is here. A purchase goes
 * through the shared rules (actions buyDye / buyDyeSet), so online the server decides and prices.
 */
export const DYES_TAB = 'Dyes';
export interface DyeUiDeps {
  state(): SaveState;
  perform(type: string, payload?: Record<string, unknown>): Promise<unknown>;
  /** The item's icon markup (main.ts art). */
  art(id: string, icon: string): string;
  /** Shows the shop again (same tab) after a purchase. */
  refresh(): void;
  /** Puts a piece on (main.ts equip + feedback). */
  wear(id: string): Promise<void>;
  toast(message: string, icon?: string): void; tone(kind?: string): void;
  modal(): string | null;
}
const esc = (v: string) => v.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const money = (n: number) => `ϟ ${Math.round(n).toLocaleString()}`;

function pieceHtml(s: SaveState, id: string, d: Pick<DyeUiDeps, 'art'>) {
  const item = ITEMS[id], price = dyePrice(id)!, owned = ownsDye(s, id), worn = Object.values(s.gear).includes(id), need = gearLevel(id), gated = need > s.level;
  const action = owned
    ? worn ? `<span class="chip chip-seed dye-chip">✓ ${esc(t('Equipped'))}</span>` : `<button class="sky-button dye-btn" data-dye-wear="${id}" ${gated ? 'disabled' : ''}>${esc(t('Equip'))}</button>`
    : `<button class="primary dye-btn${s.energy < price ? ' looks-disabled' : ''}" data-dye-buy="${id}" ${gated ? 'disabled' : ''} ${s.energy < price ? 'aria-disabled="true"' : ''}>${money(price)}</button>`;
  return `<div class="shop-item dye-piece"><span class="shop-icon">${d.art(id, item.icon)}</span>`
    + `<div><strong>${esc(t(item.name))}</strong>${owned ? ` <span class="chip dye-chip">${esc(t('Owned'))}</span>` : ''}${gated ? ` <span class="chip chip-gate">🔒 ${esc(t('Needs level {level}', { level: need }))}</span>` : ''}</div>${action}</div>`;
}
/** The whole Dyes tab body for this save. */
export function dyesHtml(s: SaveState, d: Pick<DyeUiDeps, 'art'>) {
  const cards = DYE_STYLE_IDS.map(style => {
    const info = DYE_STYLES[style], ids = dyeIdsOf(style), owned = ids.filter(id => ownsDye(s, id)).length, offer = setOffer(s, style as DyeStyleId);
    const off = setDiscount(offer.missing.length), short = offer.price !== null && s.energy < offer.price;
    const set = offer.price === null ? '' : `<button class="primary dye-set${short ? ' looks-disabled' : ''}" data-dye-set="${style}" ${short ? 'aria-disabled="true"' : ''}>${esc(t(owned ? 'Complete the set' : 'Buy the set'))} · ${money(offer.price)} <small>${esc(t('Save {percent}%', { percent: Math.round(off * 100) }))} <s>${money(offer.single)}</s></small></button>`;
    return `<section class="dye-card ${info.cls}" aria-label="${esc(t(info.name))}"><header><h4>${esc(t(info.name))}</h4><span class="chip">${esc(t('{owned} of {total} owned', { owned, total: ids.length }))}</span></header>${ids.map(id => pieceHtml(s, id, d)).join('')}${set}</section>`;
  }).join('');
  return `<div class="dye-tab"><p class="intro dye-intro">${esc(t('Dyes recolour gear you can already wear: same stats, new colours. They cost energy, cannot be traded, and a set is cheaper than its pieces.'))}</p>${cards}</div>`;
}

export function initDyeUi(d: DyeUiDeps) {
  /** Replaces the dialog's list (below the tabs) with the Dyes section. */
  function fill() {
    const nav = document.querySelector('#dialog-body nav.panel-tabs'); if (!nav) return;
    while (nav.nextSibling) nav.nextSibling.remove();
    const holder = document.createElement('div'); holder.innerHTML = dyesHtml(d.state(), d); nav.after(...Array.from(holder.childNodes));
  }
  document.addEventListener('click', async event => {
    const button = (event.target as HTMLElement | null)?.closest<HTMLButtonElement>('[data-dye-buy],[data-dye-set],[data-dye-wear]');
    if (!button || button.disabled || d.modal() !== 'shop') return;
    if (button.dataset.dyeWear) { await d.wear(button.dataset.dyeWear); d.refresh(); return; }
    const id = button.dataset.dyeBuy, style = button.dataset.dyeSet;
    button.disabled = true;
    const ok = id ? await d.perform('buyDye', { id }) : await d.perform('buyDyeSet', { style });
    if (ok) {
      d.tone('success');
      d.toast(id ? t('Dyed: {name}', { name: t(ITEMS[id].name) }) : t('New dye set: {name}', { name: t(DYE_STYLES[style as DyeStyleId].name) }), '🎨');
    }
    d.refresh();
  });
  return { fill };
}
