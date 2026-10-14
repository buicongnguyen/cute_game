/**
 * The News inbox: the explorer's own announcements (level-ups, milestones, unlocks, achievements, records, report cards,
 * rewards ready) collected in one list instead of popping up mid-screen. Entries live in the save (SaveState.inbox),
 * newest first, at most INBOX_CAP; older saves have none. Text is kept as the English key plus parameters, so a
 * language switch re-translates old entries. `open` names the screen a tap on the entry opens (news-inbox-ui.ts).
 * Pure rules only: no DOM here, so the model, the server and the tests can share it.
 */
export const INBOX_CAP = 50;
export type InboxKind = 'level' | 'milestone' | 'unlock' | 'achievement' | 'record' | 'report' | 'reward' | 'quest' | 'other';
export const INBOX_KINDS: readonly InboxKind[] = ['level', 'milestone', 'unlock', 'achievement', 'record', 'report', 'reward', 'quest', 'other'];
/** Screens an entry may open (news-inbox-ui.ts maps each to the game's own panel). */
export const INBOX_TARGETS = ['quests', 'achievements', 'bag', 'insight', 'map', 'shop', 'ranking', 'discovery'] as const;
export type InboxTarget = typeof INBOX_TARGETS[number];
export interface InboxItem {
  /** Rising number, unique within a save. */
  id: number;
  /** When it happened (ms since 1970). */
  at: number;
  kind: InboxKind;
  icon: string;
  /** English text keys, translated when shown; {name} placeholders filled from `params`. */
  title: string;
  text: string;
  params?: Record<string, string | number>;
  open?: InboxTarget;
  read?: true;
}
export type InboxInput = Omit<InboxItem, 'id' | 'at' | 'read'>;

const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const str = (v: unknown, max: number) => typeof v === 'string' ? v.slice(0, max) : '';

/** A saved inbox, cleaned: well-formed entries only, newest first, at most INBOX_CAP. Missing or broken = empty. */
export function parseInbox(raw: unknown): InboxItem[] {
  if (!Array.isArray(raw)) return [];
  const out: InboxItem[] = [], ids = new Set<number>();
  for (const v of raw) {
    if (!record(v)) continue;
    const id = v.id, at = v.at, title = str(v.title, 200);
    if (typeof id !== 'number' || !Number.isSafeInteger(id) || id < 0 || ids.has(id)) continue;
    if (typeof at !== 'number' || !Number.isFinite(at) || at < 0 || at > 8.64e15 || !title) continue;
    const item: InboxItem = { id, at: Math.floor(at), kind: INBOX_KINDS.includes(v.kind as InboxKind) ? v.kind as InboxKind : 'other', icon: str(v.icon, 8) || '📰', title, text: str(v.text, 400) };
    if (record(v.params)) {
      const params: Record<string, string | number> = {};
      for (const [k, p] of Object.entries(v.params).slice(0, 8)) if (typeof p === 'string') params[k.slice(0, 24)] = p.slice(0, 80); else if (typeof p === 'number' && Number.isFinite(p)) params[k.slice(0, 24)] = p;
      if (Object.keys(params).length) item.params = params;
    }
    if (INBOX_TARGETS.includes(v.open as InboxTarget)) item.open = v.open as InboxTarget;
    if (v.read === true) item.read = true;
    ids.add(id); out.push(item);
  }
  out.sort((a, b) => b.at - a.at || b.id - a.id);
  return out.slice(0, INBOX_CAP);
}

/** Adds an entry on top (unread) and drops the oldest past INBOX_CAP. Returns the new entry. */
export function addInbox(list: InboxItem[], input: InboxInput, now = Date.now()): InboxItem {
  const id = list.reduce((m, e) => Math.max(m, e.id), 0) + 1;
  const item: InboxItem = { ...input, id, at: now };
  if (!item.params || !Object.keys(item.params).length) delete item.params;
  if (!item.open) delete item.open;
  list.unshift(item);
  if (list.length > INBOX_CAP) list.length = INBOX_CAP;
  return item;
}
export const unreadCount = (list: readonly InboxItem[]) => list.reduce((n, e) => n + (e.read ? 0 : 1), 0);
/** Marks every entry read; returns how many changed. */
export function markAllRead(list: InboxItem[]): number { let n = 0; for (const e of list) if (!e.read) { e.read = true; n++; } return n; }
/** The badge's text: up to 9, then 9+. Empty when nothing is unread. */
export const badgeText = (n: number) => n <= 0 ? '' : n > 9 ? '9+' : String(n);
/** "now", minutes, hours or days ago, as an English key and its number (translated by the caller). */
export function agoKey(at: number, now = Date.now()): [string, number] {
  const s = Math.max(0, (now - at) / 1000);
  if (s < 60) return ['just now', 0];
  if (s < 3600) return ['{n} min ago', Math.floor(s / 60)];
  if (s < 86400) return ['{n} h ago', Math.floor(s / 3600)];
  return ['{n} d ago', Math.floor(s / 86400)];
}

/** "Show announcements as pop-ups" (Settings): off by default, so announcements go to News. Kept on this device. */
export const POPUPS_KEY = 'zoo-news-popups';
export function popupsOn(store: Pick<Storage, 'getItem'> | null = typeof localStorage === 'undefined' ? null : localStorage): boolean {
  try { return store?.getItem(POPUPS_KEY) === '1'; } catch { return false; }
}

/** The Almanac report level a level-up from `before` to `after` earns, or 0 (the same rule as insight-rules.ts
 * reportEarned: 3, then every fifth level), kept here so the start-up bundle need not load the Almanac. */
export function reportLevelFor(before: number, after: number): number {
  for (let l = Math.floor(after); l >= 3; l--) if (l === 3 || l >= 5 && l % 5 === 0) return l > before ? l : 0;
  return 0;
}
