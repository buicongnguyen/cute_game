import * as M from './model.ts';
import { t } from './i18n.ts';
import { HELPER_COST, helperOf, canPlant } from './helper.ts';

/**
 * The garden helper's panels. It is sold from the garden bed panel (not the outfitters or the market): the helper's
 * whole job is the beds, the bed panel already sells garden growth for energy (Expand garden), and a player who taps a
 * bed is exactly the player who wants the farming done. Strings are English source keys, localized by localizeHtml.
 */
export interface HelperUi { esc: (s: string) => string; mini: (id: string) => string; picture: string }

/** One line in the bed panels: hire Sprout, or open its settings (with what it is doing). */
export function helperRow(s: M.SaveState, visiting: boolean) {
  if (visiting || s.planet !== 'home') return '';
  const h = helperOf(s), status = !h.owned ? `Hire for ϟ ${HELPER_COST}` : h.paused ? 'Paused' : 'Working';
  return `<button class="soft-button wide helper-button" data-action="helper">🤖 Garden helper · ${status}</button>`;
}

export function helperPanel(s: M.SaveState, ui: HelperUi) {
  const h = helperOf(s), picture = `<div class="helper-picture"><img src="${ui.picture}" alt="Sprout, the garden helper" width="96" height="96"></div>`;
  if (!h.owned) {
    const short = Math.max(0, HELPER_COST - s.energy);
    return `${picture}<p class="center">Sprout is a tiny gardening robot. It walks between your beds, harvests ripe crops into your bag and replants empty beds with seeds you already have.</p>`
      + `<ul class="helper-points"><li>Crops it harvests give you their XP, as if you had picked them.</li><li>It never buys seeds.</li><li>While you are away, it tends each bed that ripened once when you come back.</li></ul>`
      + `<button class="${short ? 'soft-button' : 'primary'} wide" data-action="helper-buy" ${short ? 'disabled' : ''}>Hire Sprout (ϟ ${HELPER_COST})</button>`
      + (short ? `<p class="muted center">You need ${short} more energy.</p>` : '');
  }
  const crops = Object.entries(M.CROPS).filter(([, c]) => c.level <= s.level);
  const seedButton = (id: string, label: string, extra = '') => `<button role="radio" aria-checked="${h.seed === id}" class="${h.seed === id ? 'on' : ''}" data-action="helper-seed" data-item="${id}">${label}${extra}</button>`;
  return `${picture}<div class="settings-row"><div><strong>Helper at work</strong><small>Off: Sprout rests beside the garden</small></div><button class="toggle ${h.paused ? '' : 'on'}" role="switch" aria-checked="${!h.paused}" aria-label="Helper at work" data-action="helper-pause"></button></div>`
    + `<div class="settings-row helper-seed-row"><div><strong>Seed to plant</strong><small>Same as before: each bed gets what grew there last, otherwise the cheapest seed you have</small></div></div>`
    + `<div class="segmented helper-seeds" role="radiogroup" aria-label="Seed to plant">${seedButton('same', 'Same as before')}${crops.map(([id, c]) => seedButton(id, `${ui.mini(id)} ${ui.esc(t(c.name))}`, c.seed ? ` <span class="chip">×${s.bag[c.seed] ?? 0}</span>` : '')).join('')}</div>`
    + (h.seed !== 'same' && !canPlant(s, h.seed) ? `<p class="garden-tip">💡 You have no seeds for this crop. Sprout waits until you do.</p>` : '');
}
