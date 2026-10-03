import { t } from './i18n.ts';
import { heroKitFor } from './assets.ts';
import { OPTIONS, ROWS, ROW_NAMES, lookOf, lookOptions, lookPrice, missingOptions, ownsOption, splitLook, swapOption, type LookId, type LookOption, type LookRow } from './looks.ts';
import type { SaveState } from './model.ts';
import type { World } from './world.ts';
import './look-shop.css';

/**
 * The bedroom mirror's character builder: four rows of option chips (body, height, ears, head decoration); a row
 * wider than the sheet scrolls sideways (phones and desktop alike), and the previewed chip is scrolled into view. Every tap previews the
 * combination on your own explorer at once (the try-on path: World.tryOnLook, local only; the dialog steps aside so
 * the explorer stays in view), and one button buys what the combination still needs (actions buyLook) or wears it
 * (wearLook). Owned options combine freely.
 */
export interface LookShopDeps {
  world: World;
  perform(type: string, payload?: Record<string, unknown>): Promise<unknown>;
  openDialog(type: string, title: string, body: string, kicker?: string, icon?: string): void;
  modal(): string | null;
  toast(message: string, icon?: string): void; tone(kind?: string): void;
  /** Leaves the item try-on (main.ts endTryOn) so the two previews never mix. */
  endGearTryOn(): void;
}
const esc = (v: string) => v.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
/** The combination's name, e.g. "Girl · Tall · Cat ears · Fox hood" (the free defaults "No ears" and "No hood" left out). */
export const lookName = (id: LookId) => lookOptions(id).filter((o, i) => i < 2 || OPTIONS[o].price > 0).map(o => t(OPTIONS[o].name)).join(' · ');
const ART_BASE = `${import.meta.env?.BASE_URL ?? '/'}assets/icons/looks/`;
/** A chip's picture: the Blender portrait for a head decoration, an emoji otherwise. */
const chipIcon = (o: LookOption) => OPTIONS[o].art ? `<img class="look-chip-art" src="${ART_BASE}${o}.webp" alt="${OPTIONS[o].icon}" width="40" height="40" loading="lazy" decoding="async">` : OPTIONS[o].icon;
/** The headline option of a combination, for toasts: its hood, else its ears, else its body. */
const headline = (id: LookId) => { const l = splitLook(id); return l.deco !== 'bare' ? l.deco : l.ears !== 'none' ? l.ears : l.body; };

export function lookShopHtml(s: SaveState, draft: LookId) {
  const worn = lookOf(s), wornOpts = lookOptions(worn), chosen = lookOptions(draft), price = lookPrice(s, draft), missing = missingOptions(s, draft);
  const rows = (Object.keys(ROWS) as LookRow[]).map(row => `<div class="look-row" data-look-row="${row}"><span class="look-row-name">${esc(t(ROW_NAMES[row]))}</span><div class="look-chips${ROWS[row].length > 4 ? ' scroll' : ''}">${ROWS[row].map(o => {
    const opt = OPTIONS[o], on = chosen.includes(o), owned = ownsOption(s, o), wearing = wornOpts.includes(o);
    const tag = wearing ? `<small class="look-state">${esc(t('Wearing'))}</small>` : owned ? (opt.price ? `<small class="look-state owned">✓ ${esc(t('Owned'))}</small>` : '') : `<small class="look-price">ϟ ${opt.price}</small>`;
    return `<button class="look-chip${on ? ' on' : ''}${wearing ? ' worn' : ''}" data-look-option="${o}" aria-pressed="${on}"><span class="look-chip-icon">${chipIcon(o)}</span><span>${esc(t(opt.name))}</span>${tag}</button>`;
  }).join('')}</div></div>`).join('');
  const main = draft === worn ? `<span class="chip chip-seed">✓ ${esc(t('Wearing'))}</span>`
    : missing.length ? `<button class="primary" data-look-action="buy" ${s.energy < price ? 'disabled' : ''}>${esc(t('Buy'))} ϟ ${price}</button>`
    : `<button class="primary" data-look-action="wear">${esc(t('Wear'))}</button>`;
  const back = draft === worn ? '' : `<button class="soft-button" data-look-action="reset">${esc(t('Back to mine'))}</button>`;
  return `<p class="intro">${esc(t('Mix a body, a height, ears and an animal hood. Owned options combine freely; a hood brings its own ears and a hat covers it. Gear fits every look, and stats stay the same.'))}</p>`
    + `<div class="look-builder">${rows}</div><div class="look-footer"><strong class="look-name">${esc(lookName(draft))}</strong><div class="look-buttons">${back}${main}</div></div>`;
}

export function initLookShop(d: LookShopDeps) {
  const w = d.world, draft = (): LookId => w.tryOnLook ?? lookOf(w.state); // the preview lives on the world, so closing any dialog ends it (main.ts endTryOn)
  const render = () => { if (d.modal() === 'looks') open(); };
  const preview = (id: LookId) => {
    w.tryOnLook = id === lookOf(w.state) ? null : id; w.refreshPlayer();
    const kit = heroKitFor(id); if (!kit.ready && !kit.requested) void kit.load().then(() => { if (w.tryOnLook === id) w.refreshPlayer(); });
  };
  function open() {
    d.openDialog('looks', t('Mirror, mirror'), lookShopHtml(w.state, draft()), t('LOOKS'), '🪞');
    document.querySelector('#dialog-layer')?.classList.add('trying-on'); // the explorer stays in view beside (or above) the builder
    // Long rows scroll sideways: keep each row's chosen chip in view (a re-render starts a row at its left edge).
    document.querySelectorAll<HTMLElement>('.look-chips.scroll .look-chip.on').forEach(chip => { const row = chip.parentElement!; row.scrollLeft = chip.offsetLeft - (row.clientWidth - chip.offsetWidth) / 2; });
  }
  document.addEventListener('click', async event => {
    const chip = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-look-option]');
    if (chip && d.modal() === 'looks') {
      d.endGearTryOn(); const next = swapOption(draft(), chip.dataset.lookOption as Parameters<typeof swapOption>[1]);
      if (next !== draft()) { preview(next); w.fx?.burst(w.position, { n: 8, color: ['#ffe66d', '#ffffff'], glow: true, speed: 2.2, up: 4 }); d.tone('click'); }
      render(); return;
    }
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-look-action]'); if (!button || button.disabled) return;
    const action = button.dataset.lookAction, id = draft();
    if (action === 'reset') { preview(lookOf(w.state)); render(); return; }
    button.disabled = true;
    const ok = await d.perform(action === 'buy' ? 'buyLook' : 'wearLook', { id });
    if (ok) {
      d.tone('success'); w.tryOnLook = null; w.refreshPlayer();
      w.fx?.burst(w.position, { n: 18, color: ['#ffe66d', '#ffffff', '#ff9ec7'], glow: true, speed: 3, up: 6 });
      d.toast(t(action === 'buy' ? 'New look: {name}!' : 'Now wearing: {name}', { name: lookName(id) }), OPTIONS[headline(id)].icon);
    }
    render();
  });
  return { open, preview };
}
