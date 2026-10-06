import { t } from './i18n.ts';

/**
 * Small panel pieces for the round-28 economy rules, kept out of main.ts (styles in econ-ui.css):
 * - the market's "Cook & sell all" button with the cooked total next to the raw one (item-views.ts cookSellPlan);
 * - the bed panel's note for fruit trees, which refuse fertilizer (tree-crops.ts).
 */
export interface CookSellPlan { raw: number; cooked: number; kitchen: boolean; dishes: number }
export function cookSellHtml(plan: CookSellPlan, esc: (v: string) => string) {
  if (!plan.raw) return '';
  if (!plan.kitchen) return `<p class="cook-sell-note">🔥 ${esc(t('Cooked food sells for more. Cook it in the kitchen at home first.'))}</p>`;
  if (!plan.dishes || plan.cooked <= plan.raw) return '';
  return `<div class="cook-sell"><button class="primary sell-produce cook-sell-button" data-action="cook-sell-produce">${esc(t('🔥 Cook & sell all → ϟ {amount}', { amount: plan.cooked }))}</button>`
    + `<span class="compare"><span>${esc(t('Cooked: ϟ {amount}', { amount: plan.cooked }))}</span><span>·</span><span>${esc(t('Raw: ϟ {amount}', { amount: plan.raw }))}</span><b>${esc(t('+{amount} more by cooking', { amount: plan.cooked - plan.raw }))}</b></span></div>`;
}
export function treeFertilizerNote() {
  return `<div class="crop-row garden-row fertilizer-row tree-note"><span class="crop-art">🌳</span><div><strong>${t('Fruit trees grow at their own pace')}</strong><p>${t('Fertilizer does not help fruit trees. Use it on your other crops.')}</p></div></div>`;
}
