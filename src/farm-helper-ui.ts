import type { SaveState } from './model.ts';
import { t, localizeHtml } from './i18n.ts';
import { HELPER_COST, helperOf } from './farm-helper.ts';
import { ANIMALS, penBuilt, penCapacity, priceOf, worthFeeding } from './farm.ts';
import { RESTOCK_KINDS, RESTOCK_MAX_LEVEL, RESTOCK_PER_KIND, restockCost, restockOf } from './farm-restock.ts';

/** The automatic-feeding switch's line (pen robot and Clover): it feeds only when the time saved is worth more than the
 * crop (farm.ts autoFeedCrop), which in practice means pigs and ducks; when on and nothing qualifies, it says so. */
export function autoFeedNote(s: SaveState, on: boolean, now = Date.now()) {
  return t('Feeds pigs and ducks from your bag when that pays off. Turn off to keep every crop.') + (on && !worthFeeding(s, now) ? ' ' + t('Nothing worth feeding now.') : '');
}

export function farmHelperRow(s: SaveState, visiting = false) {
  if (visiting || s.planet !== 'home' || !penBuilt(s)) return '';
  const h = helperOf(s), status = !h.owned ? t('Hire for ϟ {cost}', { cost: HELPER_COST }) : t(h.paused ? 'Paused' : 'Working');
  return `<button class="soft-button wide helper-button" data-action="farm-helper">🤖 ${t('Animal pen helper')} · ${status}</button>`;
}

export function farmHelperPanel(s: SaveState, picture: string) {
  const h = helperOf(s), art = `<div class="helper-picture"><img src="${picture}" alt="Animal pen helper" width="96" height="96"></div>`;
  const intro = '<p class="center">A tiny robot gathers eggs, duck eggs, milk, truffles and expired livestock meat into your bag. Collected products give their usual EXP.</p>'
    + '<ul class="helper-points"><li>It buys animals only through auto-restock below, and never feed or other items.</li><li>When you return home, it collects the stock already waiting once.</li><li>Automatic feeding is off until you enable it. Feeding uses your cheapest available crop.</li></ul>';
  if (!h.owned) {
    const short = Math.max(0, HELPER_COST - s.energy);
    return localizeHtml(`${art}${intro}<button class="${short ? 'soft-button' : 'primary'} wide" data-action="farm-helper-buy" ${short ? 'disabled' : ''}>${t('Hire animal helper (ϟ {cost})', { cost: HELPER_COST })}</button>${short ? `<p class="muted center">${t('You need {need} more energy.', { need: short })}</p>` : ''}`);
  }
  return localizeHtml(`${art}${intro}<div class="settings-row"><div><strong>Animal helper at work</strong><small>Off: the robot rests beside the animal pen.</small></div><button class="toggle ${h.paused ? '' : 'on'}" role="switch" aria-checked="${!h.paused}" aria-label="Animal helper at work" data-action="farm-helper-pause"></button></div>`
    + `<div class="settings-row"><div><strong>Automatic feeding</strong><small>${autoFeedNote(s, h.autoFeed)}</small></div><button class="toggle ${h.autoFeed ? 'on' : ''}" role="switch" aria-checked="${h.autoFeed}" aria-label="Automatic feeding" data-action="farm-helper-feed"></button></div>`
    + restockSection(s) + '<button class="soft-button wide" data-action="pen-menu">Back to animal pen</button>');
}

/** Auto-restock (farm-restock.ts): level, switch, energy guard, the stock it keeps per kind, and the next upgrade. */
export function restockSection(s: SaveState) {
  const r = restockOf(s), level = r?.level ?? 0, cost = restockCost(level), short = cost === null ? 0 : Math.max(0, cost - s.energy);
  const upgrade = cost === null ? `<p class="muted center">${t('Auto-restock is fully upgraded.')}</p>`
    : `<button class="${short ? 'soft-button' : 'primary'} wide" data-action="farm-restock-upgrade" ${short ? 'disabled' : ''}>⬆️ ${level ? t('Upgrade auto-restock to level {level} (ϟ {cost})', { level: level + 1, cost }) : t('Teach auto-restock (ϟ {cost})', { cost })}</button>`
      + (short ? `<p class="muted center">${t('You need {need} more energy.', { need: short })}</p>` : '');
  const head = `<h4 class="restock-title">🔁 ${t('Auto-restock')} <small>${t('Level {level}/{max}', { level, max: RESTOCK_MAX_LEVEL })}</small></h4>`;
  if (!r) return `<div class="restock">${head}<p class="fineprint">${t('When an animal expires, the robot buys a young one of the same kind at the normal price from your energy. Higher levels keep more of each kind, up to what your pen holds.')}</p>${upgrade}</div>`;
  const stock = RESTOCK_KINDS.filter(k => s.level >= ANIMALS[k].level).map(k => `<span title="${t(ANIMALS[k].name)}">${ANIMALS[k].babyIcon} ${r.roster[k] ?? 0}/${Math.min(RESTOCK_PER_KIND[level - 1], penCapacity(s, k))} <small>ϟ${priceOf(s, k)}</small></span>`).join('');
  return `<div class="restock">${head}<p class="fineprint">${t('Keeps up to {count} of each kind you raise, never more than the pen holds.', { count: RESTOCK_PER_KIND[level - 1] })}</p>`
    + `<div class="restock-stock">${stock}</div>`
    + `<div class="settings-row"><div><strong>${t('Auto-restock')}</strong><small>${t('Buys replacements at the normal price.')}</small></div><button class="toggle ${r.on ? 'on' : ''}" role="switch" aria-checked="${r.on}" aria-label="${t('Auto-restock')}" data-action="farm-restock-toggle"></button></div>`
    + `<div class="settings-row"><div><strong>${t('Spending guard')}</strong><small>${t('Never spends below this much energy.')}</small></div><button class="soft-button" data-action="farm-restock-keep">${t('Keep ϟ {n}', { n: r.keep })}</button></div>`
    + upgrade + '</div>';
}
