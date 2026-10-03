import { t } from './i18n.ts';
import { OPTIONS, ROWS, ROW_NAMES, lookOptions, ownsOption, splitLook, type LookId, type LookOption, type LookRow, type Looks } from './looks.ts';

/**
 * The look builder's markup, shared by the mirror (look-shop.ts) and a friend's Looks tab (friend-looks-ui.ts). No
 * stylesheet import here (look-shop.ts brings look-shop.css), so the house panel and Node tests can use it.
 * Each option is a tile with its Blender portrait (assets/icons/looks/<option>.webp, build_hero_styles.py
 * render_option_icons: the default explorer with only that option changed).
 */
const esc = (v: string) => v.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
/** The combination's name, e.g. "Girl · Tall · Cat ears · Fox hood" (the free defaults "No ears" and "No hood" left out). */
export const lookName = (id: LookId) => lookOptions(id).filter((o, i) => i < 2 || OPTIONS[o].price > 0).map(o => t(OPTIONS[o].name)).join(' · ');
const ART_BASE = `${import.meta.env?.BASE_URL ?? '/'}assets/icons/looks/`;
/** An option's portrait (128 px webp); its emoji is the alt text, shown if the picture cannot load. */
export const lookArt = (o: LookOption) => `${ART_BASE}${o}.webp`;
const tileArt = (o: LookOption) => `<img class="look-chip-art" src="${lookArt(o)}" alt="${OPTIONS[o].icon}" width="128" height="128" loading="lazy" decoding="async">`;
/** The headline option of a combination, for toasts: its hood, else its ears, else its body. */
export const headline = (id: LookId) => { const l = splitLook(id); return l.deco !== 'bare' ? l.deco : l.ears !== 'none' ? l.ears : l.body; };

/**
 * The four rows of tiles. `attr` is the tiles' data attribute (each panel listens for its own); `worn` is what the
 * wearer has now ("Wearing"); ownership and prices are always the player's (options belong to the player and dress
 * every friend). `readOnly` disables the tiles (a visitor).
 */
export function lookRowsHtml(s: { looks?: Looks }, draft: LookId, { attr, worn, readOnly = false }: { attr: string; worn: LookId; readOnly?: boolean }) {
  const wornOpts = lookOptions(worn), chosen = lookOptions(draft);
  return (Object.keys(ROWS) as LookRow[]).map(row => `<div class="look-row" data-look-row="${row}"><span class="look-row-name">${esc(t(ROW_NAMES[row]))}</span><div class="look-chips">${ROWS[row].map(o => {
    const opt = OPTIONS[o], on = chosen.includes(o), owned = ownsOption(s, o), wearing = wornOpts.includes(o);
    const tag = wearing ? `<small class="look-state">${esc(t('Wearing'))}</small>` : owned ? (opt.price ? `<small class="look-state owned">✓ ${esc(t('Owned'))}</small>` : '') : `<small class="look-price">ϟ ${opt.price}</small>`;
    return `<button class="look-chip${on ? ' on' : ''}${wearing ? ' worn' : ''}" ${attr}="${o}" aria-pressed="${on}" title="${esc(t(opt.name))}"${readOnly ? ' disabled' : ''}><span class="look-chip-icon">${tileArt(o)}</span><span class="look-chip-name">${esc(t(opt.name))}</span>${tag}</button>`;
  }).join('')}</div></div>`).join('');
}
/** The wooden mirror frame; mirror-preview.ts draws into its glass (`slot` names whose picture it holds). */
export const mirrorHtml = (slot: string, caption = '') => `<figure class="look-mirror"><div class="mirror-glass" data-mirror-slot="${slot}"></div>${caption ? `<figcaption>${esc(caption)}</figcaption>` : ''}</figure>`;
/** Keeps each row's chosen tile in view (a re-render starts every row at its left edge). */
export function centreChosen(root: ParentNode = document) {
  root.querySelectorAll<HTMLElement>('.look-chips .look-chip.on').forEach(chip => { const row = chip.parentElement!; if (row.scrollWidth > row.clientWidth) row.scrollLeft = chip.offsetLeft - (row.clientWidth - chip.offsetWidth) / 2; });
}
