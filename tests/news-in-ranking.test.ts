// The news board lives inside the leaderboard dialog (its News section): there is no News button in the dock, the unread
// count shows on the Ranking button and on the News tab, and everything the board did before still happens there
// (opening, the NEW tags, marking read, the Coming soon tab, opening by itself once, both languages).
// The dialog itself is measured in a browser by tests/hud-layout.test.mjs; these tests drive the board through its host.
import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { initNewsBoard, READ_KEY, AUTO_OPEN, type NewsHost } from '../src/news-board.ts';
import { SECTIONS, badgeText } from '../src/ranking.ts';
import { t, setLanguage, loadVietnamese } from '../src/i18n.ts';

const read = (file: string) => readFileSync(new URL(`../src/${file}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
afterEach(() => { setLanguage('en'); if (original) Object.defineProperty(globalThis, 'localStorage', original); else delete (globalThis as { localStorage?: unknown }).localStorage; });

const NEWS = {
  news: [
    { id: 'n3', date: '2026-10-09', icon: '⚖️', title: { en: 'Third', vi: 'Thứ ba' }, items: { en: ['c'], vi: ['c vi'] } },
    { id: 'n2', date: '2026-10-06', icon: '🎉', title: { en: 'Second', vi: 'Thứ hai' }, items: { en: ['b'], vi: ['b vi'] } },
    { id: 'n1', date: '2026-10-01', icon: '🌱', title: { en: 'First', vi: 'Thứ nhất' }, items: { en: ['a'], vi: ['a vi'] } },
  ],
  upcoming: [{ id: 'u1', icon: '🔜', title: { en: 'Later', vi: 'Sau này' }, text: { en: 'Soon', vi: 'Sắp có' }, status: { en: 'Planned', vi: 'Dự kiến' } }],
};
/** A stand-in for the leaderboard dialog's News section (what ranking.ts initRanking returns as `news`). */
function fixture(options: { read?: string[]; fetch?: typeof fetch } = {}) {
  const store = new Map<string, string>(); if (options.read) store.set(READ_KEY, JSON.stringify(options.read));
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => { store.set(k, v); } } });
  const listeners: Array<() => void> = [], handlers: Record<string, (event: unknown) => void> = {}, counts: number[] = [];
  const state = { shown: false, opened: 0, idle: false };
  const panel = { innerHTML: '', addEventListener: (type: string, fn: (event: unknown) => void) => { handlers[type] = fn; } };
  /** The player taps the News tab of the dialog. */
  const show = () => { state.shown = true; for (const listener of listeners) listener(); };
  const host: NewsHost = { panel: panel as unknown as HTMLElement, open: () => { state.opened++; show(); }, shown: () => state.shown, setUnread: n => { counts.push(n); }, onShown: listener => { listeners.push(listener); } };
  const fetcher = options.fetch ?? (async () => ({ ok: true, json: async () => NEWS })) as unknown as typeof fetch;
  const board = initNewsBoard({ host, idle: () => state.idle, url: 'news.json', fetch: fetcher });
  /** A tap on one of the bulletin's own tabs. */
  const tap = (kind: string) => handlers.click({ target: { closest: (sel: string) => sel.includes('news-tab') ? { dataset: { kind }, disabled: false } : null } });
  const count = (re: RegExp) => panel.innerHTML.match(re)?.length ?? 0;
  return { board, host, panel, state, counts, show, tap, count, stored: () => JSON.parse(store.get(READ_KEY) ?? '[]') as string[], unread: () => counts.at(-1) };
}

test('the unread count goes to the host, for the Ranking button and the News tab, and clears when the News section is shown', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const f = fixture({ read: ['n1'] });
  await f.board.ready;
  assert.equal(f.unread(), 2, 'two of the three entries are unread on this device');
  assert.equal(f.state.opened, 0); assert.equal(f.panel.innerHTML, '', 'nothing is drawn until the section is shown');
  // The player opens the leaderboard and taps News.
  f.show();
  assert.equal(f.count(/class="news-card/g), 3); assert.equal(f.count(/class="news-new"/g), 2, 'the newest entry and the other unread one wear NEW');
  assert.match(f.panel.innerHTML, /data-action="news-tab" data-kind="news"/); assert.match(f.panel.innerHTML, /class="active" aria-pressed="true" data-action="news-tab" data-kind="news"/);
  assert.deepEqual(f.stored().sort(), ['n1', 'n2', 'n3'], 'everything is read from now on'); assert.equal(f.unread(), 0, 'the badge clears');
  assert.equal(f.state.opened, 0, 'the board never opens the dialog when the player walked in');
  // The Coming soon tab of the bulletin, and back.
  f.tap('soon'); assert.equal(f.count(/class="news-card upcoming"/g), 1); assert.match(f.panel.innerHTML, /Later/); assert.match(f.panel.innerHTML, /class="active" aria-pressed="true" data-action="news-tab" data-kind="soon"/);
  f.tap('news'); assert.equal(f.count(/class="news-card/g), 3); assert.equal(f.count(/class="news-new"/g), 2, 'the NEW tags stay for this visit');
  // Coming back later: the News tab first, and only the newest entry is tagged.
  f.tap('soon'); f.show();
  assert.match(f.panel.innerHTML, /class="active" aria-pressed="true" data-action="news-tab" data-kind="news"/); assert.equal(f.count(/class="news-new"/g), 1);
});

test('other code opens the board through the dialog: open() asks the host for its News section, on the tab it names', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const f = fixture({ read: ['n1', 'n2', 'n3'] });
  await f.board.ready; assert.equal(f.unread(), 0);
  f.board.open('soon');
  assert.equal(f.state.opened, 1); assert.equal(f.count(/class="news-card upcoming"/g), 1);
  f.board.open();
  assert.equal(f.state.opened, 2); assert.equal(f.count(/class="news-card/g), 3); assert.doesNotMatch(f.panel.innerHTML, /upcoming/);
});

test('with unread news the dialog opens by itself on News, once, when the game is idle', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const f = fixture();
  await f.board.ready; assert.equal(f.unread(), 3);
  t.mock.timers.tick(AUTO_OPEN.firstMs); assert.equal(f.state.opened, 0, 'a panel is open or the game has not started: it waits');
  f.state.idle = true; t.mock.timers.tick(AUTO_OPEN.retryMs);
  assert.equal(f.state.opened, 1); assert.equal(f.count(/class="news-new"/g), 3); assert.equal(f.unread(), 0);
  t.mock.timers.tick(AUTO_OPEN.retryMs * AUTO_OPEN.tries); assert.equal(f.state.opened, 1, 'never a second time');
  // Nothing unread: no timer, no opening.
  const quiet = fixture({ read: ['n1', 'n2', 'n3'] }); quiet.state.idle = true;
  await quiet.board.ready; t.mock.timers.tick(AUTO_OPEN.firstMs + AUTO_OPEN.retryMs); assert.equal(quiet.state.opened, 0);
});

test('offline: the section says there is no news yet, and fills in when the file arrives', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let online = false;
  const f = fixture({ fetch: (async () => { if (!online) throw new Error('offline'); return { ok: true, json: async () => NEWS }; }) as unknown as typeof fetch });
  await f.board.ready; assert.equal(f.unread(), 0);
  online = true; f.show();
  assert.match(f.panel.innerHTML, /No news yet\./);
  await new Promise<void>(resolve => setImmediate(resolve)); await new Promise<void>(resolve => setImmediate(resolve));
  assert.equal(f.count(/class="news-card/g), 3, 'the cards arrive without another tap'); assert.equal(f.unread(), 0);
});

test('the bulletin is drawn in Vietnamese when the game is', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  await loadVietnamese(); setLanguage('vi');
  const f = fixture(); await f.board.ready; f.show();
  assert.match(f.panel.innerHTML, /Thứ ba/); assert.match(f.panel.innerHTML, /Tin tức/); assert.match(f.panel.innerHTML, /Sắp ra mắt/); assert.match(f.panel.innerHTML, /MỚI/);
  assert.match(f.panel.innerHTML, /09\/10\/2026/);
});

test('the dialog has two sections, Ranking and News, with their own header; the count reads "9+" past nine', async () => {
  assert.deepEqual(Object.keys(SECTIONS), ['ranking', 'news']);
  assert.deepEqual([SECTIONS.ranking.tab, SECTIONS.ranking.title, SECTIONS.news.tab, SECTIONS.news.title, SECTIONS.news.kicker], ['Ranking', 'Leaderboard', 'News', 'News board', 'WHAT IS NEW IN ZOO GARDEN']);
  assert.deepEqual([0, -1, 1, 8, 9, 10, 120].map(badgeText), ['', '', '1', '8', '9', '9+', '9+']);
  await loadVietnamese(); setLanguage('vi');
  for (const key of ['Ranking', 'News', 'Leaderboard', 'News board', 'Ranking and news', 'Energy', 'Level', 'WHAT IS NEW IN ZOO GARDEN', 'CLIMB THE RANKS']) assert.notEqual(t(key), key, `${key} has Vietnamese`);
  assert.equal(t('{n} unread news', { n: 3 }), '3 tin chưa đọc'); assert.equal(t('Ranking and news'), 'Xếp hạng và tin tức'); assert.equal(t('Energy'), 'Năng lượng');
});

test('ranking.ts: the section tabs come first in the dialog, the badge is written on the Ranking button, and News asks the board to draw', () => {
  const src = read('ranking.ts');
  assert.match(src, /dialog\.append\(header, sections, tabs, chips, hint, list, mine, newsPanel\);/);
  // The dock button: its count element is the one main.ts put there; it is written only when the count changes.
  assert.match(src, /const count = trigger\?\.querySelector<HTMLElement>\('\.news-count'\);/);
  // Since FIX-PLAN 4.4 the dock count stays hidden: updates reach the player as an entry in the News inbox.
  assert.match(src, /setUnread\(n: number\) \{ if \(n === unreadNews\) return; unreadNews = n; if \(count\) \{ count\.hidden = true; count\.textContent = ''; \} label\(\); \}/);
  // The News tab wears the same count; a section change redraws, Ranking reloads the board, News calls the board's listeners.
  assert.match(src, /if \(id === 'news' && unreadNews > 0\) \{ const badge = el\('i', 'news-count', badgeText\(unreadNews\)\);/);
  assert.match(src, /if \(next === 'ranking'\) void load\(\); else \{ newsPanel\.scrollTop = 0; for \(const listener of newsListeners\) listener\(\); \}/);
  assert.match(src, /const open = \(\) => show\('ranking'\);/, 'the Ranking button opens on Ranking');
  assert.match(src, /open: \(\) => show\('news'\),/);
  // Section tabs and the bulletin's own tabs are full touch targets, and hidden sections really hide.
  const css = read('ranking.css');
  assert.match(css, /\.ranking-sections button \{ position: relative; flex: 1; min-height: 44px;/); assert.match(css, /\.ranking-news \.panel-tabs button \{ min-height: 44px; \}/);
  assert.match(css, /\.ranking-tabs\[hidden\], \.ranking-cats\[hidden\], \.ranking-list\[hidden\], \.ranking-news\[hidden\] \{ display: none; \}/);
});
