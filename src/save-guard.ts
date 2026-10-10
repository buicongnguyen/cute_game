import type { SaveState } from './model.ts';

/**
 * Keeps a device save from being lost silently.
 *  - A save that exists but cannot be read (corrupt JSON, a missing field) used to load as a fresh Level 1 and the next
 *    autosave overwrote it. Now the raw text is first copied to `<key>-corrupt-<time>` (the last three are kept).
 *  - A save written by a NEWER build (version/contentVersion beyond what this one knows) is never overwritten:
 *    this tab plays read-only with a notice.
 *  - Two tabs on one save: each remembers the `savedAt` it loaded or last wrote. If the stored one is newer, another
 *    tab has saved since, so this tab stops writing (its state is stale) instead of putting old progress back.
 * Pure logic over a Storage-like object; the banner lives in save-guard-ui.ts.
 */
export const SUPPORTED_VERSION = 1;
export const SUPPORTED_CONTENT = 3;
export const BACKUPS_KEPT = 3;

export type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem' | 'key' | 'length'>;
export type LoadStatus = 'empty' | 'ok' | 'corrupt' | 'newer';
export type GuardNotice = 'corrupt' | 'corrupt-unsaved' | 'newer' | 'stale';
export interface LoadResult { state: SaveState | null; status: LoadStatus; backup?: string }

const backupPrefix = (key: string) => `${key}-corrupt-`;

/** `savedAt` of a raw save without parsing all of it (it is called on every autosave). */
export function savedAtOf(raw: string | null): number {
  const hit = raw ? /"savedAt":\s*(\d+)/.exec(raw) : null;
  return hit ? Number(hit[1]) : 0;
}

/** True when the raw save was written by a newer build than this one understands. */
export function isNewerSave(raw: string): boolean {
  try {
    const v = JSON.parse(raw) as { version?: unknown; contentVersion?: unknown } | null;
    if (!v || typeof v !== 'object') return false;
    return (typeof v.version === 'number' && v.version > SUPPORTED_VERSION) || (typeof v.contentVersion === 'number' && v.contentVersion > SUPPORTED_CONTENT);
  } catch { return false; }
}

/** Backup keys of one save key, newest first. */
export function backupKeys(storage: StorageLike, key: string): string[] {
  const prefix = backupPrefix(key), found: { name: string; at: number }[] = [];
  for (let i = 0; i < storage.length; i++) {
    const name = storage.key(i);
    if (name?.startsWith(prefix) && /^\d+$/.test(name.slice(prefix.length))) found.push({ name, at: Number(name.slice(prefix.length)) });
  }
  return found.sort((a, b) => b.at - a.at).map(f => f.name);
}

export class SaveGuard {
  /** Notices to show once (the UI reads and clears them). */
  notices: GuardNotice[] = [];
  /** True while this tab must not write (another tab is newer, or the stored save is from a newer build). */
  frozen: GuardNotice | null = null;
  onChange: () => void = () => {};
  private seen = new Map<string, number>();

  private storage: StorageLike | null;
  private now: () => number;
  constructor(storage: StorageLike | null, now: () => number = Date.now) { this.storage = storage; this.now = now; }

  load(key: string, parse: (raw: string | null) => SaveState | null): LoadResult {
    const storage = this.storage;
    if (!storage) return { state: parse(null), status: 'empty' };
    const raw = storage.getItem(key);
    if (raw === null) { this.seen.set(key, 0); return { state: null, status: 'empty' }; }
    const state = parse(raw);
    if (state) {
      this.seen.set(key, state.savedAt || savedAtOf(raw));
      // Newer content that this build can still read is playable, but saving would strip what it does not know.
      if (isNewerSave(raw)) { this.freeze('newer'); return { state, status: 'newer' }; }
      return { state, status: 'ok' };
    }
    if (isNewerSave(raw)) { this.seen.set(key, savedAtOf(raw)); this.freeze('newer'); return { state: null, status: 'newer' }; }
    const backup = this.backUp(key, raw);
    this.seen.set(key, 0);
    if (backup) this.notices.push('corrupt'); else this.freeze('corrupt-unsaved');
    return { state: null, status: 'corrupt', backup: backup ?? undefined };
  }

  /** Copies an unreadable save aside (once) and trims old copies. Null when the copy could not be stored. */
  private backUp(key: string, raw: string): string | null {
    const storage = this.storage!;
    try {
      const existing = backupKeys(storage, key);
      if (existing.length && storage.getItem(existing[0]) === raw) return existing[0];
      let at = this.now();
      while (storage.getItem(backupPrefix(key) + at) !== null) at++;
      const name = backupPrefix(key) + at;
      storage.setItem(name, raw);
      for (const old of backupKeys(storage, key).slice(BACKUPS_KEPT)) storage.removeItem(old);
      return name;
    } catch { return null; }
  }

  private freeze(why: GuardNotice) { if (!this.frozen) { this.frozen = why; this.notices.push(why); this.onChange(); } }

  /** Asked before every write: false while frozen, and freezes when another tab saved after this one last looked. */
  canWrite(key: string): boolean {
    if (this.frozen) return false;
    if (!this.storage) return true;
    let stored: string | null;
    try { stored = this.storage.getItem(key); } catch { return true; }
    if (savedAtOf(stored) > (this.seen.get(key) ?? 0) || (stored === null && (this.seen.get(key) ?? 0) > 0)) { this.freeze('stale'); return false; }
    return true;
  }

  wrote(key: string, savedAt: number) { this.seen.set(key, savedAt); }

  /** Browser `storage` event: another tab changed (or cleared) this save. */
  external(event: { key: string | null; newValue: string | null }, key: string) {
    if (this.frozen || (event.key !== null && event.key !== key)) return;
    if (event.key === null || event.newValue === null || savedAtOf(event.newValue) > (this.seen.get(key) ?? 0)) this.freeze('stale');
  }

  hasBackup(key: string): boolean { try { return !!this.storage && backupKeys(this.storage, key).length > 0; } catch { return false; } }

  /** Puts the newest backup back as the save. The caller reloads the page; this tab writes nothing more. */
  restore(key: string): boolean {
    if (!this.storage) return false;
    try {
      const newest = backupKeys(this.storage, key)[0];
      const raw = newest ? this.storage.getItem(newest) : null;
      if (raw === null) return false;
      this.storage.setItem(key, raw);
      this.frozen = 'stale'; // the page reloads next; its pagehide autosave must not undo this
      return true;
    } catch { return false; }
  }
}
