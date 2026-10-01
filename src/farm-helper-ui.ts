import type { SaveState } from './model.ts';
import { t, localizeHtml } from './i18n.ts';
import { HELPER_COST, helperOf } from './farm-helper.ts';
import { penBuilt } from './farm.ts';

export function farmHelperRow(s: SaveState, visiting = false) {
  if (visiting || s.planet !== 'home' || !penBuilt(s)) return '';
  const h = helperOf(s), status = !h.owned ? t('Hire for ϟ {cost}', { cost: HELPER_COST }) : t(h.paused ? 'Paused' : 'Working');
  return `<button class="soft-button wide helper-button" data-action="farm-helper">🤖 ${t('Animal pen helper')} · ${status}</button>`;
}

export function farmHelperPanel(s: SaveState, picture: string) {
  const h = helperOf(s), art = `<div class="helper-picture"><img src="${picture}" alt="Animal pen helper" width="96" height="96"></div>`;
  const intro = '<p class="center">A tiny robot gathers eggs, duck eggs, milk, truffles and expired livestock meat into your bag. Collected products give their usual EXP.</p>'
    + '<ul class="helper-points"><li>It never buys animals, feed or other items.</li><li>When you return home, it collects the stock already waiting once.</li><li>Automatic feeding is off until you enable it. Feeding uses your cheapest available crop.</li></ul>';
  if (!h.owned) {
    const short = Math.max(0, HELPER_COST - s.energy);
    return localizeHtml(`${art}${intro}<button class="${short ? 'soft-button' : 'primary'} wide" data-action="farm-helper-buy" ${short ? 'disabled' : ''}>${t('Hire animal helper (ϟ {cost})', { cost: HELPER_COST })}</button>${short ? `<p class="muted center">${t('You need {need} more energy.', { need: short })}</p>` : ''}`);
  }
  return localizeHtml(`${art}${intro}<div class="settings-row"><div><strong>Animal helper at work</strong><small>Off: the robot rests beside the animal pen.</small></div><button class="toggle ${h.paused ? '' : 'on'}" role="switch" aria-checked="${!h.paused}" aria-label="Animal helper at work" data-action="farm-helper-pause"></button></div>`
    + `<div class="settings-row"><div><strong>Automatic feeding</strong><small>Uses crops from your bag only. Turn off to keep every crop.</small></div><button class="toggle ${h.autoFeed ? 'on' : ''}" role="switch" aria-checked="${h.autoFeed}" aria-label="Automatic feeding" data-action="farm-helper-feed"></button></div>`
    + '<button class="soft-button wide" data-action="pen-menu">Back to animal pen</button>');
}
