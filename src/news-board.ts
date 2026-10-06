import { t, getLanguage, onLanguageChange, type Language } from './i18n.ts';

/**
 * The news board (reference F-002): a 📰 button in the top-right menu with a red unread count, and a panel with two tabs,
 * "News" (update cards, newest first, the newest tagged NEW) and "Coming soon". The entries are a static file written
 * for this game (public/news.json, both languages in each entry). Read entries are remembered on this device
 * (localStorage READ_KEY). When something is unread the panel opens by itself 2.5 s after load, retrying every 2 s
 * (up to 40 times) until the game has started and no other panel is open, like the reference.
 */
export const READ_KEY = 'zoo-news-read';
export const AUTO_OPEN = { firstMs: 2500, retryMs: 2000, tries: 40 } as const;
type Text = Record<Language, string>;
type Lines = Record<Language, string[]>;
export interface NewsEntry { id: string; date: string; icon: string; title: Text; items: Lines }
export interface UpcomingEntry { id: string; icon: string; title: Text; text: Text; status: Text }
export interface NewsData { news: NewsEntry[]; upcoming: UpcomingEntry[] }
export type NewsTab = 'news' | 'soon';

const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const text = (v: unknown): Text | null => record(v) && typeof v.en === 'string' && v.en ? { en: v.en, vi: typeof v.vi === 'string' && v.vi ? v.vi : v.en } : null;
const lines = (v: unknown): Lines | null => {
  if (!record(v) || !Array.isArray(v.en)) return null;
  const en = v.en.filter((x): x is string => typeof x === 'string'), vi = Array.isArray(v.vi) ? v.vi.filter((x): x is string => typeof x === 'string') : [];
  return { en, vi: vi.length === en.length ? vi : en };
};
/** A checked copy of news.json: malformed entries are dropped; news sorted newest first (stable within a day). */
export function parseNews(raw: unknown): NewsData {
  const src = record(raw) ? raw : {};
  const news = (Array.isArray(src.news) ? src.news : []).flatMap((e): NewsEntry[] => {
    if (!record(e) || typeof e.id !== 'string' || typeof e.date !== 'string') return [];
    const title = text(e.title), items = lines(e.items);
    return title && items ? [{ id: e.id, date: e.date, icon: typeof e.icon === 'string' ? e.icon : '📰', title, items }] : [];
  });
  const order = new Map(news.map((e, i) => [e, i]));
  news.sort((a, b) => b.date.localeCompare(a.date) || order.get(a)! - order.get(b)!);
  const upcoming = (Array.isArray(src.upcoming) ? src.upcoming : []).flatMap((e): UpcomingEntry[] => {
    if (!record(e) || typeof e.id !== 'string') return [];
    const title = text(e.title), body = text(e.text), status = text(e.status);
    return title && body ? [{ id: e.id, icon: typeof e.icon === 'string' ? e.icon : '🔜', title, text: body, status: status ?? { en: '', vi: '' } }] : [];
  });
  return { news, upcoming };
}

export function readIds(storage: Pick<Storage, 'getItem'> | undefined = globalThis.localStorage): Set<string> {
  try { const v = JSON.parse(storage?.getItem(READ_KEY) ?? '[]'); return new Set(Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []); } catch { return new Set(); }
}
export function markRead(ids: Iterable<string>, storage: Pick<Storage, 'getItem' | 'setItem'> | undefined = globalThis.localStorage) {
  const all = readIds(storage); for (const id of ids) all.add(id);
  try { storage?.setItem(READ_KEY, JSON.stringify([...all].slice(-200))); } catch { /* Storage is optional: the badge just comes back next time. */ }
}
/** News entries this device has not read yet. */
export const unread = (data: NewsData, read: Set<string>) => data.news.filter(e => !read.has(e.id));

const esc = (v: string) => v.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
function dateText(date: string, lang: Language) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(date); if (!m) return date;
  return lang === 'vi' ? `${m[3]}/${m[2]}/${m[1]}` : `${m[1]}-${m[2]}-${m[3]}`;
}
/** The panel body: the two tabs, then the cards of the chosen tab. `fresh` = ids unread when the panel opened. */
export function newsHtml(data: NewsData, tab: NewsTab, fresh: Set<string>, lang: Language = getLanguage()) {
  const tabs = `<nav class="panel-tabs news-tabs" aria-label="${esc(t('News sections'))}">${([['news', '📰 ' + t('News')], ['soon', '🔜 ' + t('Coming soon')]] as const).map(([id, label]) => `<button class="${tab === id ? 'active' : ''}" aria-pressed="${tab === id}" data-action="news-tab" data-kind="${id}">${esc(label)}</button>`).join('')}</nav>`;
  if (tab === 'soon') return tabs + (data.upcoming.length ? `<div class="news-list">${data.upcoming.map(e => `<article class="news-card upcoming"><span class="news-icon">${esc(e.icon)}</span><div><h3>${esc(e.title[lang])}${e.status[lang] ? ` <span class="news-status">${esc(e.status[lang])}</span>` : ''}</h3><p>${esc(e.text[lang])}</p></div></article>`).join('')}</div>` : `<p class="empty-state">${esc(t('More plans are on the way.'))}</p>`);
  if (!data.news.length) return tabs + `<p class="empty-state">${esc(t('No news yet.'))}</p>`;
  const card = (e: NewsEntry, i: number) => `<article class="news-card${i === 0 ? ' latest' : ''}"><span class="news-icon">${esc(e.icon)}</span><div><h3>${i === 0 || fresh.has(e.id) ? `<span class="news-new">${esc(t('NEW'))}</span> ` : ''}${esc(e.title[lang])}</h3><small class="news-date">${esc(dateText(e.date, lang))}</small><ul>${e.items[lang].map(line => `<li>${esc(line)}</li>`).join('')}</ul></div></article>`;
  const [first, ...rest] = data.news;
  return tabs + `<div class="news-list">${card(first, 0)}${rest.length ? `<div class="section-label news-earlier">📜 ${esc(t('Earlier updates'))}</div>${rest.map((e, i) => card(e, i + 1)).join('')}` : ''}</div>`;
}

export interface NewsDeps {
  /** main.ts openDialog: the panel shell (title, kicker, body, icon). */
  openDialog(type: string, title: string, body: string, kicker?: string, icon?: string): void;
  /** True when the game has started and no panel is open: the moment the board may open itself. */
  idle(): boolean;
  /** The app root: the 📰 button goes into its top-right menu, and its clicks (📰, tabs) are handled here. */
  root: HTMLElement;
  url: string;
  fetch?: typeof fetch;
}
export function initNewsBoard(d: NewsDeps) {
  let data: NewsData = { news: [], upcoming: [] }, tab: NewsTab = 'news', fresh = new Set<string>(), loaded = false;
  // The 📰 button sits after the journal, like the reference's menu (F-005); added here so main.ts's menu markup stays as it is.
  const menu = d.root.querySelector<HTMLElement>('#hud .top-actions'), button = document.createElement('button');
  button.type = 'button'; button.className = 'icon-button'; button.dataset.action = 'news'; button.innerHTML = '📰<i class="news-count" hidden></i>';
  const label = () => { button.title = t('News'); button.setAttribute('aria-label', t('News')); };
  label(); onLanguageChange(label);
  menu?.insertBefore(button, menu.querySelector('#social-slot'));
  d.root.addEventListener('click', event => {
    const b = (event.target as HTMLElement).closest<HTMLButtonElement>('button[data-action]'); if (!b || b.disabled) return;
    if (b.dataset.action === 'news') api.open(); else if (b.dataset.action === 'news-tab') api.tab(b.dataset.kind);
  });
  const refreshBadge = () => {
    const badge = button.querySelector<HTMLElement>('.news-count'); if (!badge) return;
    const n = unread(data, readIds()).length;
    badge.hidden = n === 0; badge.textContent = n > 9 ? '9+' : n ? String(n) : '';
  };
  const render = () => d.openDialog('news', 'News board', newsHtml(data, tab, fresh), 'WHAT IS NEW IN ZOO GARDEN', '📰');
  const open = (next: NewsTab = 'news') => {
    tab = next;
    fresh = new Set(unread(data, readIds()).map(e => e.id));
    render(); markRead(data.news.map(e => e.id)); refreshBadge();
  };
  const load = async () => {
    try {
      const response = await (d.fetch ?? fetch)(d.url, { cache: 'no-store' });
      if (response.ok) { data = parseNews(await response.json()); loaded = true; }
    } catch { /* Offline: no board this time. */ }
    refreshBadge();
  };
  // Automated browsers (tests) open it only when asked with ?news=1, so a timed panel never lands in a scripted run.
  const auto = !(globalThis.navigator?.webdriver) || /[?&]news=1(&|$)/.test(globalThis.location?.search ?? '');
  const ready = load().then(() => {
    if (!auto || !unread(data, readIds()).length) return;
    let tries = 0;
    const attempt = () => { if (!unread(data, readIds()).length) return; if (d.idle()) { open('news'); return; } if (++tries < AUTO_OPEN.tries) setTimeout(attempt, AUTO_OPEN.retryMs); };
    setTimeout(attempt, AUTO_OPEN.firstMs);
  });
  const api = {
    open: (next?: NewsTab) => { open(next); if (!loaded) void load().then(() => { if (loaded) open(next); }); },
    tab: (next: string | undefined) => { tab = next === 'soon' ? 'soon' : 'news'; render(); },
    refreshBadge, ready, data: () => data,
  };
  return api;
}
