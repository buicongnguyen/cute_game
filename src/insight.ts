// The Village Almanac (the "big picture" book), one lazy chunk: main.ts imports this file with import() when the book,
// a disguise card or a level-up needs it. Nothing else may import it statically, or its code joins the first download
// (tests/insight-lazy.test.mjs). It costs nothing per frame: pages are HTML built when opened.
import './insight.css';
import { t } from './i18n.ts';
import type { SaveState } from './model.ts';
import { DISGUISE_IDS } from './disguise-profile.ts';
import { disguiseChapterHtml, disguiseDetailHtml, disguiseSlotHtml, type DzSort, type PageUi } from './disguise-ui.ts';

export interface InsightDeps {
  state(): SaveState;
  openDialog(type: string, title: string, body: string, kicker?: string, icon?: string): void;
  closeDialog(): void;
  /** The open panel's type ('' when none). */
  modal(): string;
  art(id: string, icon: string): string;
  esc(text: string): string;
  toast(message: string, icon?: string): void;
  /** Reopens one of the game's own panels (the journal, the outfitters, the backpack...). */
  panel(type: string): void;
}
export type InsightTab = 'disguises';
export interface InsightApi {
  /** Opens the book (on its last page, or the one named). */
  open(tab?: InsightTab, options?: { disguise?: string; compare?: string | null; from?: string }): void;
  /** Redraws the open book (a language switch). */
  refresh(): void;
  /** Fills every [data-dz] placeholder under `root` with that disguise's strength card. */
  fill(root: Element): void;
  readonly tab: InsightTab;
}
export const BOOK = { type: 'insight', title: 'The Village Almanac', kicker: 'THE BIG PICTURE', icon: '📒' } as const;
const TABS: readonly [InsightTab, string, string][] = [['disguises', '🎭', 'Disguises']];

export function initInsight(d: InsightDeps): InsightApi {
  let tab: InsightTab = 'disguises', dzSort: DzSort = 'total', dzOpen: string | null = null, dzCompare: string | null = null, from = '';
  const ui = (): PageUi => ({ t, esc: d.esc, art: d.art, state: d.state() });
  const body = () => document.querySelector<HTMLElement>('#dialog-body');
  function page(): string {
    const u = ui();
    if (dzOpen) return `<div class="ins-back"><button class="soft-button" data-insight="dz-back">← ${u.esc(t('All disguises'))}</button>${from ? `<button class="soft-button" data-insight="return">${u.esc(t(from === 'shop' ? 'Back to the outfitters' : 'Back to the backpack'))}</button>` : ''}</div>` + disguiseDetailHtml(u, dzOpen, dzCompare);
    return disguiseChapterHtml(u, dzSort);
  }
  function render(top = false) {
    const u = ui(), tabs = TABS.length > 1 ? `<nav class="panel-tabs ins-tabs" aria-label="${u.esc(t('Almanac pages'))}">${TABS.map(([id, icon, label]) => `<button class="${tab === id ? 'active' : ''}" aria-pressed="${tab === id}" data-insight="tab" data-tab="${id}">${icon} ${u.esc(t(label))}</button>`).join('')}</nav>` : '';
    d.openDialog(BOOK.type, BOOK.title, `<div class="insight-book" data-i18n-skip data-tab="${tab}">${tabs}${page()}</div>`, BOOK.kicker, BOOK.icon);
    if (top) { const node = body(); if (node) node.scrollTop = 0; }
  }
  const api: InsightApi = {
    get tab() { return tab; },
    open(next, options) {
      if (next) tab = next;
      if (options && 'disguise' in options) { dzOpen = options.disguise && DISGUISE_IDS.includes(options.disguise) ? options.disguise : null; dzCompare = options.compare ?? null; from = options.from ?? ''; }
      render(true);
    },
    refresh() { if (d.modal() === BOOK.type) render(); },
    fill(root) {
      const u = ui();
      root.querySelectorAll<HTMLElement>('[data-dz]').forEach(slot => { const id = slot.dataset.dz ?? ''; if (slot.dataset.filled === id) return; slot.dataset.filled = id; slot.innerHTML = disguiseSlotHtml(u, id); });
    },
  };
  // One delegated listener each for taps and for the comparison picker; main.ts's own click handler ignores data-insight.
  document.addEventListener('click', event => {
    const button = (event.target as HTMLElement | null)?.closest<HTMLElement>('[data-insight]'); if (!button || !button.closest('#dialog-body')) return;
    const action = button.dataset.insight;
    if (action === 'dz-open') { const inBook = d.modal() === BOOK.type; api.open('disguises', { disguise: button.dataset.id, compare: button.dataset.compare || null, from: inBook ? from : d.modal() === 'shop' ? 'shop' : d.modal() === 'bag' ? 'bag' : '' }); }
    else if (action === 'dz-back') { dzOpen = null; dzCompare = null; from = ''; render(true); }
    else if (action === 'dz-sort') { dzSort = (button.dataset.axis ?? 'total') as DzSort; render(); }
    else if (action === 'return') { const target = from; from = ''; dzOpen = null; d.panel(target); }
    else if (action === 'tab') { tab = button.dataset.tab as InsightTab; dzOpen = null; render(true); }
  });
  document.addEventListener('change', event => {
    const select = event.target; if (!(select instanceof HTMLSelectElement) || select.dataset.insightSelect !== 'dz-compare') return;
    dzCompare = select.value || null; render();
    body()?.querySelector<HTMLSelectElement>('#dz-compare')?.focus({ preventScroll: true });
  });
  return api;
}
