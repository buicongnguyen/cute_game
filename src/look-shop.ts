import { t } from './i18n.ts';
import { heroKit, heroKitFor, wearKit } from './assets.ts';
import { OPTIONS, lookOf, lookPrice, missingOptions, swapOption, type LookId } from './looks.ts';
import { centreChosen, headline, lookName, lookRowsHtml, mirrorHtml } from './look-tiles.ts';
import { MirrorPreview, restPose } from './mirror-preview.ts';
import type { SaveState } from './model.ts';
import type { World } from './world.ts';
import './look-shop.css';

/**
 * The bedroom mirror's character builder: four rows of option tiles (body, height, ears, head decoration), each a
 * Blender portrait of the explorer with that option (assets/icons/looks, build_hero_styles.py render_option_icons),
 * beside a framed mirror that shows the whole combination on your own avatar (mirror-preview.ts: a small offscreen
 * render, redrawn only when the combination changes). A row wider than its column scrolls sideways and keeps the
 * chosen tile in view. Every tap also previews the combination on the explorer in the world (World.tryOnLook, local
 * only; the dialog steps aside so the explorer stays in view), and one button buys what the combination still needs
 * (actions buyLook) or wears it (wearLook). Owned options combine freely. A friend's Looks tab (friend-looks-ui.ts)
 * uses the same rows and mirror.
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
export { lookName };

export function lookShopHtml(s: SaveState, draft: LookId) {
  const worn = lookOf(s), price = lookPrice(s, draft), missing = missingOptions(s, draft);
  const main = draft === worn ? `<span class="chip chip-seed">✓ ${esc(t('Wearing'))}</span>`
    : missing.length ? `<button class="primary" data-look-action="buy" ${s.energy < price ? 'disabled' : ''}>${esc(t('Buy'))} ϟ ${price}</button>`
    : `<button class="primary" data-look-action="wear">${esc(t('Wear'))}</button>`;
  const back = draft === worn ? '' : `<button class="soft-button" data-look-action="reset">${esc(t('Back to mine'))}</button>`;
  return `<p class="intro">${esc(t('Mix a body, a height, ears and an animal hood. Owned options combine freely; a hood brings its own ears and a hat covers it. Gear fits every look, and stats stay the same.'))}</p>`
    + `<div class="look-studio">${mirrorHtml('explorer')}<div class="look-builder">${lookRowsHtml(s, draft, { attr: 'data-look-option', worn })}</div></div>`
    + `<div class="look-footer"><strong class="look-name">${esc(lookName(draft))}</strong><div class="look-buttons">${back}${main}</div></div>`;
}

/** Everything the explorer's mirror picture depends on (mirror-preview.ts redraws only when this changes). */
export function mirrorKey(id: LookId, color: string, gear: SaveState['gear']) {
  return [id, color, gear.outfit ?? '', gear.boots ?? '', heroKit.ready, heroKitFor(id).ready, wearKit.ready].join('|');
}

export function initLookShop(d: LookShopDeps) {
  const w = d.world, draft = (): LookId => w.tryOnLook ?? lookOf(w.state); // the preview lives on the world, so closing any dialog ends it (main.ts endTryOn)
  // The glass shows the look in your outfit and boots, bare-headed: a hat would cover the hood or ears being tried.
  const mirror = new MirrorPreview({ reach: 3.6, width: 190, height: 270 });
  const render = () => { if (d.modal() === 'looks') open(); };
  const paint = () => {
    const id = draft(), gear = { outfit: w.state.gear.outfit, boots: w.state.gear.boots }, kit = heroKitFor(id);
    mirror.show(document.querySelector('[data-mirror-slot="explorer"]'), mirrorKey(id, w.state.color, gear), () => restPose(w.lookAvatar(w.state.color, gear, id)));
    // A body file still on its way: the default explorer stands in, and the glass redraws once it lands.
    if (!kit.ready) void kit.load().then(() => { if (d.modal() === 'looks' && draft() === id) paint(); });
  };
  const preview = (id: LookId) => {
    w.tryOnLook = id === lookOf(w.state) ? null : id; w.refreshPlayer();
    const kit = heroKitFor(id); if (!kit.ready && !kit.requested) void kit.load().then(() => { if (w.tryOnLook === id) w.refreshPlayer(); });
  };
  function open() {
    d.openDialog('looks', t('Mirror, mirror'), lookShopHtml(w.state, draft()), t('LOOKS'), '🪞');
    document.querySelector('#dialog-layer')?.classList.add('trying-on'); // the explorer stays in view beside (or above) the builder
    centreChosen(); paint();
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
  return { open, preview, mirror };
}
