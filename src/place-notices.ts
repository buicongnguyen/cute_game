/** Small place reminders, scoped to the active save. Never queue a stack of interruptions. */
import { t } from './i18n.ts';
export interface NoticeStore { getItem(key: string): string | null; setItem(key: string, value: string): void }
export const NOTICE_COOLDOWN = 10_000;
export class PlaceNoticeHistory {
  private seen = new Set<string>();
  private last = new Map<string, number>();
  private scope: () => string;
  private storage?: NoticeStore;
  constructor(scope: () => string, storage?: NoticeStore) { this.scope = scope; this.storage = storage; }
  /** Mark only an introduction actually about to open, once per save even after reload. */
  first(id: string): boolean {
    const key = 'zoo-place-intro:v1:' + this.scope() + ':' + id;
    if (this.seen.has(key)) return false;
    try { if (this.storage?.getItem(key) === '1') { this.seen.add(key); return false; } } catch { /* memory fallback */ }
    this.seen.add(key);
    try { this.storage?.setItem(key, '1'); } catch { /* memory fallback */ }
    return true;
  }
  allow(id: string, now: number): boolean {
    const key = this.scope() + ':' + id, last = this.last.get(key);
    if (last !== undefined && now - last < NOTICE_COOLDOWN) return false;
    this.last.set(key, now); return true;
  }
}
export function mountPlaceNotices(parent: HTMLElement, scope: () => string) {
  let storage: NoticeStore | undefined; try { storage = globalThis.localStorage; } catch { /* optional */ }
  const history = new PlaceNoticeHistory(scope, storage);
  const el = document.createElement('div'); el.id = 'place-notice'; el.hidden = true;
  el.setAttribute('role', 'status'); el.setAttribute('aria-live', 'polite'); el.setAttribute('aria-atomic', 'true');
  const icon = document.createElement('span'), text = document.createElement('span'); icon.setAttribute('aria-hidden', 'true'); el.append(icon, text); parent.append(el);
  let timer: ReturnType<typeof setTimeout> | undefined, owner = '';
  return {
    first: (id: string) => history.first(id),
    show(id: string, message: string, symbol = 'ℹ️', passive = false) {
      if (!history.allow(id, Date.now())) return false;
      clearTimeout(timer); owner = scope(); icon.textContent = symbol; text.textContent = t(message);
      el.classList.toggle('passive', passive); el.hidden = false;
      timer = setTimeout(() => { el.hidden = true; }, passive ? 3500 : 4200); return true;
    },
    /** A save change or title screen must not show another explorer's reminder. */
    sync(active: boolean) { if (!active || owner !== scope()) { el.hidden = true; clearTimeout(timer); } },
  };
}
