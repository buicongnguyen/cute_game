// The Village Almanac (the "big picture" book), one lazy chunk: main.ts imports this file with import() once play has
// begun, or sooner when the book or a disguise card is asked for. Nothing else may import it statically, or its code
// joins the first download (tests/insight-lazy.test.mjs). It costs nothing per frame: pages are HTML built when opened,
// and the only timer runs every two seconds while a report card waits for a calm moment.
import './insight.css';
import { t, getLanguage } from './i18n.ts';
import type { SaveState } from './model.ts';
import { DISGUISE_IDS } from './disguise-profile.ts';
import { disguiseChapterHtml, disguiseDetailHtml, disguiseSlotHtml, type DzSort } from './disguise-ui.ts';
import { analysisHtml, mapHtml, trendHtml, reportHtml, type BookUi } from './insight-pages.ts';
import { reportEarned, reportLevelAt, reportOffer, scoreList } from './insight-rules.ts';
import { setHistoryScorer } from './insight-history.ts';
import type { ChapterId } from './insight-graph.ts';

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
  /** Walks the explorer to a place of the village map (the map's own "go"). */
  go(kind: string): void;
  /** Opens the journal on a tab. */
  journal(tab: string): void;
  /** Nothing is going on: playing, no panel, no fight, no mode, not fishing or flying. A report card is only offered then. */
  calm(): boolean;
  /** Which save this is (the profile's storage key), for remembering the report cards already offered on this device. */
  saveKey(): string;
  /** "Show announcements as pop-ups" (news-inbox.ts): without it the report card waits in News, no chip. */
  popups?(): boolean;
}
export type InsightTab = 'home' | 'map' | 'trend' | 'report' | 'disguises';
export interface InsightApi {
  /** Opens the book (on its last page, or the one named). */
  open(tab?: InsightTab, options?: { disguise?: string | null; compare?: string | null; from?: string; chapter?: ChapterId; node?: string }): void;
  /** Redraws the open book (a language switch). */
  refresh(): void;
  /** Fills every [data-dz] placeholder under `root` with that disguise's strength card. */
  fill(root: Element): void;
  /** The explorer levelled up: a report card is queued at report levels, a short invitation otherwise. */
  levelUp(before: number, after: number): void;
  /** The report level waiting to be offered (0 = none) and whether its chip is showing. */
  readonly pending: number; readonly offered: boolean;
  readonly tab: InsightTab;
}
export const BOOK = { type: 'insight', title: 'The Village Almanac', kicker: 'THE BIG PICTURE', icon: '📒' } as const;
const TABS: readonly [InsightTab, string, string][] = [['home', '📊', 'Overview'], ['map', '🗺️', 'Product map'], ['trend', '📈', 'Trend'], ['report', '🏅', 'Report card'], ['disguises', '🎭', 'Disguises']];
const SEEN = 'zoo-almanac-seen:';
const POLL_MS = 2000, INVITE_MS = 12000;

export function initInsight(d: InsightDeps): InsightApi {
  let tab: InsightTab = 'home', dzSort: DzSort = 'total', dzOpen: string | null = null, dzCompare: string | null = null, from = '';
  let chapter: ChapterId = 'garden', selected: { row: string; id: string } | null = null; const openGroups = new Map<ChapterId, Set<string>>();
  let pending = 0, timer: ReturnType<typeof setInterval> | null = null, chip: HTMLElement | null = null, inviteTimer: ReturnType<typeof setTimeout> | null = null;
  setHistoryScorer(scoreList);
  const ui = (): BookUi => ({ t, esc: d.esc, art: d.art, state: d.state(), now: Date.now(), lang: getLanguage() });
  const body = () => document.querySelector<HTMLElement>('#dialog-body');
  const readSeen = () => { try { return Number(localStorage.getItem(SEEN + d.saveKey())) || 0; } catch { return 0; } };
  const writeSeen = (level: number) => { try { localStorage.setItem(SEEN + d.saveKey(), String(Math.max(level, readSeen()))); } catch { /* Private mode: the card may be offered again. */ } };
  function page(): string {
    const u = ui();
    if (tab === 'home') return analysisHtml(u);
    if (tab === 'map') return mapHtml(u, chapter, selected, openGroups.get(chapter) ?? null);
    if (tab === 'trend') return trendHtml(u);
    if (tab === 'report') return reportHtml(u);
    if (dzOpen) return `<div class="ins-back"><button class="soft-button" data-insight="dz-back">← ${u.esc(t('All disguises'))}</button>${from ? `<button class="soft-button" data-insight="return">${u.esc(t(from === 'shop' ? 'Back to the outfitters' : 'Back to the backpack'))}</button>` : ''}</div>` + disguiseDetailHtml(u, dzOpen, dzCompare);
    return disguiseChapterHtml(u, dzSort);
  }
  function render(top = false) {
    const u = ui(), node = body(), keep = !top && d.modal() === BOOK.type && node ? node.scrollTop : 0;
    const tabs = `<nav class="panel-tabs ins-tabs" aria-label="${u.esc(t('Almanac pages'))}">${TABS.map(([id, icon, label]) => `<button class="${tab === id ? 'active' : ''}" aria-pressed="${tab === id}" data-insight="tab" data-tab="${id}"><span aria-hidden="true">${icon}</span> ${u.esc(t(label))}</button>`).join('')}</nav>`;
    d.openDialog(BOOK.type, BOOK.title, `<div class="insight-book" data-i18n-skip data-tab="${tab}">${tabs}${page()}</div>`, BOOK.kicker, BOOK.icon);
    const now = body(); if (now) now.scrollTop = keep;
  }
  // ---- The report card's invitation: a small chip, never a dialog, shown only in a calm moment.
  function hideChip() { chip?.remove(); chip = null; if (inviteTimer) { clearTimeout(inviteTimer); inviteTimer = null; } }
  function showChip(text: string, report: number) {
    hideChip();
    chip = document.createElement('div'); chip.className = 'almanac-chip'; chip.setAttribute('role', 'status');
    chip.innerHTML = `<button class="almanac-chip-open" data-almanac="open"><span aria-hidden="true">📒</span><span>${d.esc(text)}</span></button><button class="almanac-chip-close" data-almanac="close" aria-label="${d.esc(t('Not now'))}">×</button>`;
    chip.addEventListener('click', event => { const what = (event.target as HTMLElement).closest<HTMLElement>('[data-almanac]')?.dataset.almanac; if (!what) return;
      if (report) { writeSeen(report); pending = 0; stop(); }
      hideChip(); if (what === 'open') api.open(report ? 'report' : 'home'); });
    (document.querySelector('#app') ?? document.body).append(chip);
  }
  function stop() { if (timer) { clearInterval(timer); timer = null; } }
  function poll() {
    if (!pending) { stop(); return; }
    const due = reportOffer({ level: d.state().level, seen: readSeen(), calm: d.calm() });
    if (due && !chip) showChip(t('Your level {level} report card is ready', { level: due }), due);
    else if (!due && chip && !d.calm()) hideChip(); // a fight began or a panel opened: it waits again
    if (reportLevelAt(d.state().level) <= readSeen()) { pending = 0; stop(); }
  }
  function queue(level: number) { if (level <= readSeen()) return; pending = level; if (!timer) timer = setInterval(poll, POLL_MS); poll(); }
  const api: InsightApi = {
    get tab() { return tab; }, get pending() { return pending; }, get offered() { return !!chip; },
    open(next, options) {
      if (next) tab = next;
      if (options && 'disguise' in options) { dzOpen = options.disguise && DISGUISE_IDS.includes(options.disguise) ? options.disguise : null; dzCompare = options.compare ?? null; from = options.from ?? ''; }
      if (options?.chapter) { chapter = options.chapter; selected = null; }
      if (tab === 'report') { const level = reportLevelAt(d.state().level); if (level) { writeSeen(level); if (pending <= level) { pending = 0; stop(); hideChip(); } } }
      render(true);
    },
    refresh() { if (d.modal() === BOOK.type) render(); },
    fill(root) {
      const u = ui();
      root.querySelectorAll<HTMLElement>('[data-dz]').forEach(slot => { const id = slot.dataset.dz ?? ''; if (slot.dataset.filled === id) return; slot.dataset.filled = id; slot.innerHTML = disguiseSlotHtml(u, id); });
    },
    levelUp(before, after) {
      if (readSeen() > after) { try { localStorage.setItem(SEEN + d.saveKey(), String(reportLevelAt(before))); } catch { /* as above */ } } // a new story on this profile starts its cards afresh
      const earned = reportEarned(before, after);
      if (earned) queue(earned);
      else if (!pending && !chip && d.calm()) { showChip(t('Level {level}! See your big picture', { level: after }), 0); inviteTimer = setTimeout(hideChip, INVITE_MS); }
    },
  };
  // One delegated listener each for taps, the comparison picker and the folding groups; main.ts's own click handler ignores data-insight.
  document.addEventListener('click', event => {
    const button = (event.target as HTMLElement | null)?.closest<HTMLElement>('[data-insight]'); if (!button || !button.closest('#dialog-body')) return;
    const action = button.dataset.insight;
    if (action === 'dz-open') { const inBook = d.modal() === BOOK.type; api.open('disguises', { disguise: button.dataset.id, compare: button.dataset.compare || null, from: inBook ? from : d.modal() === 'shop' ? 'shop' : d.modal() === 'bag' ? 'bag' : '' }); }
    else if (action === 'dz-back') { dzOpen = null; dzCompare = null; from = ''; render(true); }
    else if (action === 'dz-sort') { dzSort = (button.dataset.axis ?? 'total') as DzSort; render(); }
    else if (action === 'return') { const target = from; from = ''; dzOpen = null; d.panel(target); }
    else if (action === 'tab') { api.open(button.dataset.tab as InsightTab, button.dataset.tab === 'disguises' ? { disguise: null } : undefined); }
    else if (action === 'chapter') { chapter = button.dataset.chapter as ChapterId; selected = null; render(true); }
    else if (action === 'node') { const id = button.dataset.id!, row = button.dataset.row!; selected = selected?.id === id && selected.row === row ? null : { id, row }; render();
      body()?.querySelector<HTMLElement>(selected ? '.ins-detail' : `.ins-node[data-id="${id}"][data-row="${CSS.escape(row)}"]`)?.scrollIntoView({ block: 'nearest' }); body()?.querySelector<HTMLElement>(`.ins-node[data-id="${id}"][data-row="${CSS.escape(row)}"]`)?.focus({ preventScroll: true }); }
    else if (action === 'node-close') { selected = null; render(); }
    else if (action === 'step') { const { go, journal, panel } = button.dataset; if (journal) d.journal(journal); else if (panel) d.panel(panel); else if (go) d.go(go); }
  });
  document.addEventListener('change', event => {
    const select = event.target; if (!(select instanceof HTMLSelectElement) || select.dataset.insightSelect !== 'dz-compare') return;
    dzCompare = select.value || null; render();
    body()?.querySelector<HTMLSelectElement>('#dz-compare')?.focus({ preventScroll: true });
  });
  document.addEventListener('toggle', event => { // remember which groups the reader folded, across redraws
    const group = event.target; if (!(group instanceof HTMLDetailsElement) || !group.classList.contains('ins-group') || !group.closest('.insight-book')) return;
    const all = Array.from(group.parentElement!.querySelectorAll<HTMLDetailsElement>(':scope > .ins-group'));
    openGroups.set(chapter, new Set(all.filter(g => g.open).map(g => g.dataset.group!)));
  }, true);
  // A report card earned earlier and never shown (the game closed first, or this is the book's first day) is offered once.
  { const level = reportLevelAt(d.state().level); if (level && (d.popups?.() ?? true)) queue(level); }
  return api;
}
