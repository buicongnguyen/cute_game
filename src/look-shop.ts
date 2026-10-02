import type * as T from 'three';
import { t } from './i18n.ts';
import { modelIcon } from './icons.ts';
import { heroKit, heroKitFor } from './assets.ts';
import { LOOKS, LOOK_IDS, lookOf, ownsLook, type LookId } from './looks.ts';
import type { SaveState } from './model.ts';
import type { World } from './world.ts';
import './look-shop.css';

/**
 * The bedroom mirror's "Look" shop: preview each body style on your own explorer (the try-on path: World.tryOnLook,
 * local only), buy it with energy, then switch freely between owned looks (actions buyLook / wearLook).
 */
export interface LookShopDeps {
  world: World & { lookAvatar(color: string, gear: SaveState['gear'], look: LookId): T.Group };
  perform(type: string, payload?: Record<string, unknown>): Promise<unknown>;
  openDialog(type: string, title: string, body: string, kicker?: string, icon?: string): void;
  modal(): string | null;
  toast(message: string, icon?: string): void; tone(kind?: string): void;
  /** Leaves the item try-on (main.ts endTryOn) so the two previews never mix. */
  endGearTryOn(): void;
}
const esc = (v: string) => v.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

export function lookShopHtml(s: SaveState, trying: LookId | null, portrait: (id: LookId) => string) {
  const worn = lookOf(s);
  const cards = LOOK_IDS.map(id => {
    const look = LOOKS[id], owned = ownsLook(s, id), isWorn = worn === id, img = portrait(id);
    const main = isWorn ? `<span class="chip chip-seed">✓ ${esc(t('Wearing'))}</span>`
      : owned ? `<button class="primary" data-look-action="wear" data-look="${id}">${esc(t('Wear'))}</button>`
      : `<button class="primary" data-look-action="buy" data-look="${id}" ${s.energy < look.price ? 'disabled' : ''}>ϟ ${look.price}</button>`;
    const preview = isWorn ? '' : `<button class="soft-button" data-look-action="try" data-look="${id}" aria-pressed="${trying === id}">${esc(t(trying === id ? '👀 Trying on' : '🪞 Try'))}</button>`;
    return `<div class="look-card${isWorn ? ' worn' : ''}${trying === id ? ' trying' : ''}" data-look-card="${id}"><span class="look-portrait">${img ? `<img src="${img}" alt="">` : look.icon}</span>`
      + `<div><strong>${esc(t(look.name))}</strong><p>${esc(t(look.desc))}</p></div><div class="look-buttons">${main}${preview}</div></div>`;
  }).join('');
  return `<p class="intro">${esc(t('Pick a look for your explorer. Hats, outfits and weapons fit every look; stats stay the same.'))}</p><div class="look-grid">${cards}</div>`;
}

export function initLookShop(d: LookShopDeps) {
  const w = d.world, trying = () => w.tryOnLook ?? null; // the preview lives on the world, so closing any dialog ends it (main.ts endTryOn)
  const portrait = (id: LookId) => {
    const kit = heroKitFor(id);
    if (!kit.ready || !heroKit.ready) return '';
    return modelIcon(`look:${id}:${w.state.color}`, () => d.world.lookAvatar(w.state.color, {}, id));
  };
  const render = () => { if (d.modal() === 'looks') open(); };
  const preview = (id: LookId | null) => { w.tryOnLook = id; w.refreshPlayer(); document.querySelector('#dialog-layer')?.classList.toggle('trying-on', !!id); };
  function open() {
    // Fetch every style once the shop opens, so portraits and previews are ready; redraw when each arrives.
    for (const id of LOOK_IDS) { const kit = heroKitFor(id); if (!kit.requested) void kit.load().then(render); }
    d.openDialog('looks', t('Mirror, mirror'), lookShopHtml(w.state, trying(), portrait), t('LOOKS'), '🪞');
    if (trying()) document.querySelector('#dialog-layer')?.classList.add('trying-on');
  }
  document.addEventListener('click', async event => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-look-action]'); if (!button || button.disabled) return;
    const id = button.dataset.look as LookId, action = button.dataset.lookAction;
    if (action === 'try') { d.endGearTryOn(); preview(trying() === id ? null : id); if (trying()) w.fx?.burst(w.position, { n: 10, color: ['#ffe66d', '#ffffff'], glow: true, speed: 2.5, up: 5 }); render(); return; }
    button.disabled = true;
    const ok = await d.perform(action === 'buy' ? 'buyLook' : 'wearLook', { id });
    if (ok) {
      d.tone('success'); if (trying()) preview(null); else w.refreshPlayer();
      w.fx?.burst(w.position, { n: 18, color: ['#ffe66d', '#ffffff', '#ff9ec7'], glow: true, speed: 3, up: 6 });
      d.toast(t(action === 'buy' ? 'New look: {name}!' : 'Now wearing: {name}', { name: t(LOOKS[id].name) }), LOOKS[id].icon);
    }
    render();
  });
  return { open };
}
