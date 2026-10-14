import { t } from './i18n.ts';
import { addInbox, agoKey, badgeText, markAllRead, popupsOn, unreadCount, POPUPS_KEY, type InboxInput, type InboxItem, type InboxTarget } from './news-inbox.ts';

/**
 * The News inbox on screen (news-inbox.ts holds the rules): the 📰 dock button with its unread badge, the panel listing
 * entries newest first, and `announce`, the one door every non-urgent announcement goes through. With "Show
 * announcements as pop-ups" off (the default) an announcement only lands in News and the badge gives one short pulse;
 * switched on, the old pop-up (`popup`) runs as well. Nothing here runs per frame: the badge changes only when an
 * entry is added or read.
 */
export interface InboxDeps {
  /** The save that holds the entries (SaveState.inbox). */
  state(): { inbox?: InboxItem[] };
  save(): void;
  esc(text: string): string;
  openDialog(type: string, title: string, body: string, kicker?: string, icon?: string): void;
  closeDialog(): void;
  modal(): string | null;
  /** Opens the screen an entry points at. */
  go(target: InboxTarget): void;
}
export type InboxApi = ReturnType<typeof initInbox>;
export const NEWS_PANEL = 'news';

export function initInbox(d: InboxDeps) {
  const list = () => (d.state().inbox ??= []);
  const button = () => document.querySelector<HTMLButtonElement>('#hud [data-action="news"]');
  const refreshBadge = (pulse = false) => {
    const b = button(); if (!b) return;
    const n = unreadCount(list()), badge = b.querySelector<HTMLElement>('.inbox-count');
    // A quiet dot, not a red count: numbers are kept for things to collect (docs/FIX-PLAN.md 4.4).
    if (badge) { badge.textContent = ''; badge.classList.add('inbox-dot'); badge.hidden = n === 0; }
    const label = n ? `${t('News')} · ${t('{n} unread', { n })}` : t('News');
    if (b.getAttribute('aria-label') !== label) b.setAttribute('aria-label', label);
    if (pulse) { b.classList.remove('inbox-pulse'); void b.offsetWidth; b.classList.add('inbox-pulse'); }
  };
  const entryHtml = (e: InboxItem) => {
    const [ago, n] = agoKey(e.at);
    return `<li><button class="inbox-entry${e.read ? '' : ' unread'}" data-inbox="${e.id}"${e.open ? '' : ' data-inbox-static'}><span class="inbox-icon" aria-hidden="true">${d.esc(e.icon)}</span><span class="inbox-text"><strong>${d.esc(t(e.title, e.params))}</strong>${e.text ? `<small>${d.esc(t(e.text, e.params))}</small>` : ''}</span><time>${d.esc(t(ago, { n }))}</time>${e.open ? '<i aria-hidden="true">›</i>' : ''}</button></li>`;
  };
  const bodyHtml = () => {
    const items = list();
    return items.length ? `<ul class="inbox-list">${items.map(entryHtml).join('')}</ul>` : `<p class="inbox-empty">${d.esc(t('Nothing new yet. Level-ups, unlocks and rewards will gather here.'))}</p>`;
  };
  const open = () => {
    d.openDialog(NEWS_PANEL, 'News', bodyHtml(), 'YOUR INBOX', '📰');
    if (markAllRead(list())) { d.save(); refreshBadge(); }
  };
  document.addEventListener('click', event => {
    const entry = (event.target as HTMLElement | null)?.closest<HTMLElement>('[data-inbox]');
    if (!entry || !entry.closest('#dialog-body') || d.modal() !== NEWS_PANEL) return;
    const item = list().find(e => String(e.id) === entry.dataset.inbox);
    if (item?.open) { d.closeDialog(); d.go(item.open); }
  });
  const api = {
    open, refreshBadge,
    /** Adds an announcement to News. Returns true when the caller should also show its old pop-up (setting on). */
    announce(input: InboxInput, now = Date.now()): boolean {
      addInbox(list(), input, now); d.save(); refreshBadge(true);
      if (d.modal() === NEWS_PANEL) { const body = document.querySelector('#dialog-body'); if (body) { body.innerHTML = bodyHtml(); markAllRead(list()); refreshBadge(); } }
      return popupsOn();
    },
    get popups() { return popupsOn(); },
    setPopups(on: boolean) { try { localStorage.setItem(POPUPS_KEY, on ? '1' : '0'); } catch { /* private mode: this visit only */ } },
    settingHtml: () => `<div class="settings-row"><div><strong>${d.esc(t('Show announcements as pop-ups'))}</strong><small>${d.esc(t('Off: level-ups, unlocks and rewards wait quietly in News'))}</small></div><button class="toggle ${popupsOn() ? 'on' : ''}" role="switch" aria-checked="${popupsOn()}" aria-label="${d.esc(t('Show announcements as pop-ups'))}" data-news-popups></button></div>`,
  };
  document.addEventListener('click', event => {
    const toggle = (event.target as HTMLElement | null)?.closest<HTMLElement>('[data-news-popups]'); if (!toggle) return;
    const on = !popupsOn(); api.setPopups(on); toggle.classList.toggle('on', on); toggle.setAttribute('aria-checked', String(on));
  });
  return api;
}

/**
 * The "More" menu: the dock buttons used less often during play live in #more-stash (hidden, so the modules that add
 * them keep working unchanged); the ⋯ button lists the ones currently offered and a tap presses the real one.
 */
const MORE_ICONS: Record<string, string> = { ranking: '🏆', 'online-button': '👥', 'neighbours-button': '🏡', help: '❓', settings: '⚙️', fullscreen: '⛶', install: '📲' };
export function initMoreMenu() {
  const more = document.querySelector<HTMLButtonElement>('#hud [data-action="more"]'), stash = document.querySelector<HTMLElement>('#more-stash'), menu = document.querySelector<HTMLElement>('#more-menu');
  if (!more || !stash || !menu) return { close() {} };
  const key = (b: HTMLButtonElement, i: number) => b.dataset.action || b.id || (b.closest('.platform-tools') ? (i === 0 ? 'fullscreen' : 'install') : 'item');
  const offered = () => Array.from(stash.querySelectorAll<HTMLButtonElement>('button')).filter(b => !b.hidden && !b.closest('[hidden]:not(#more-stash)'));
  const count = () => stash.querySelector<HTMLElement>('.news-count:not([hidden])')?.textContent ?? '';
  const badge = more.querySelector<HTMLElement>('.more-count');
  const syncBadge = () => { if (!badge) return; const c = count(); badge.textContent = c; badge.hidden = !c; };
  const close = () => { menu.hidden = true; more.setAttribute('aria-expanded', 'false'); };
  const render = () => {
    const tools = Array.from(stash.querySelectorAll<HTMLButtonElement>('.platform-tools button'));
    menu.innerHTML = '';
    offered().forEach(b => {
      const k = key(b, tools.indexOf(b)), row = document.createElement('button');
      row.className = 'more-item'; row.type = 'button'; row.dataset.moreKey = k;
      const label = (b.getAttribute('aria-label') || b.title || b.textContent || '').split(' · ')[0].trim();
      row.innerHTML = `<span aria-hidden="true">${MORE_ICONS[k] ?? '•'}</span><span></span>`;
      (row.lastElementChild as HTMLElement).textContent = label;
      const c = k === 'ranking' ? count() : ''; if (c) { const i = document.createElement('i'); i.className = 'more-count'; i.textContent = c; row.append(i); }
      row.addEventListener('click', event => { event.stopPropagation(); close(); b.click(); });
      menu.append(row);
    });
  };
  more.addEventListener('click', event => {
    event.stopPropagation();
    if (menu.hidden) { render(); menu.hidden = false; more.setAttribute('aria-expanded', 'true'); } else close();
  });
  document.addEventListener('pointerdown', event => { if (!menu.hidden && !(event.target as HTMLElement).closest('#more-menu,[data-action="more"]')) close(); });
  document.addEventListener('keydown', event => { if (event.key === 'Escape' && !menu.hidden) close(); });
  if (typeof MutationObserver !== 'undefined') new MutationObserver(syncBadge).observe(stash, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['hidden'] });
  syncBadge();
  return { close };
}
