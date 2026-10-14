import { progressEntries, type ProgressKind } from './progression.ts';
import type { SaveState } from './model.ts';
import { t } from './i18n.ts';

/**
 * Red "to claim" badges for the Journal (main.ts quests()): the top tabs (Explore, Grow, Collect) group the sections
 * (sub-tabs); each sub-tab counts its entries that are complete but not yet collected (the same rule as the Collect
 * buttons: progressEntries' complete && !claimed), each group sums its sections, and the dock's Journal button shows the total.
 * Pure apart from progressEntries' own refreshProgress (day/week roll-over), which quests() already relies on.
 */
export type JournalGroup = 'explore' | 'grow' | 'collect';
export const JOURNAL_GROUPS: readonly [JournalGroup, string, readonly ProgressKind[]][] = [
  ['explore', 'Explore', ['story', 'bounties', 'challenges']],
  ['grow', 'Grow', ['daily', 'weekly', 'pass']],
  ['collect', 'Collect', ['achievements', 'collection']],
];
export const groupOf = (kind: ProgressKind): JournalGroup => JOURNAL_GROUPS.find(([, , kinds]) => kinds.includes(kind))?.[0] ?? 'explore';

export interface JournalBadges { total: number; groups: Record<JournalGroup, number>; kinds: Record<ProgressKind, number>; }

const GROUP_LABEL: Record<JournalGroup, string> = { explore: '🧭 Explore', grow: '🌱 Grow', collect: '🎁 Collect' };
/** The badge text: up to 9, then 9+ (same as the News count). */
export const badgeCount = (n: number) => n <= 0 ? '' : n > 9 ? '9+' : String(n);
const pill = (n: number) => n > 0 ? `<i class="tab-badge" aria-hidden="true">${badgeCount(n)}</i>` : '';
const aria = (label: string, n: number) => n > 0 ? ` aria-label="${t('{label}, {n} to claim', { label, n })}"` : '';

/** Both tab rows of the Journal: the groups (data-action journal-group) and the chosen group's sections (journal-tab). */
export function journalTabsHtml(b: JournalBadges, active: ProgressKind, sections: readonly [ProgressKind, string][]): string {
  const current = groupOf(active), names = new Map(sections);
  const top = JOURNAL_GROUPS.map(([id, , kinds]) => { const label = t(GROUP_LABEL[id]), on = id === current; return `<button class="${on ? 'active' : ''}" aria-pressed="${on}" data-action="journal-group" data-kind="${kinds[0]}" data-group="${id}"${aria(label, b.groups[id])}>${label}${pill(b.groups[id])}</button>`; }).join('');
  const kinds = JOURNAL_GROUPS.find(([id]) => id === current)![2];
  const sub = kinds.map(kind => { const label = t(names.get(kind) ?? kind), on = kind === active; return `<button class="${on ? 'active' : ''}" aria-pressed="${on}" data-action="journal-tab" data-kind="${kind}"${aria(label, b.kinds[kind])}>${label}${pill(b.kinds[kind])}</button>`; }).join('');
  return `<nav class="panel-tabs journal-groups" aria-label="${t('Journal groups')}">${top}</nav><nav class="panel-tabs journal-sections" aria-label="${t('Journal sections')}">${sub}</nav>`;
}
/** Where a group button leads: its first section that has something to claim, else its first section. */
export function groupTarget(b: JournalBadges, group: JournalGroup): ProgressKind {
  const kinds = JOURNAL_GROUPS.find(([id]) => id === group)![2];
  return kinds.find(k => b.kinds[k] > 0) ?? kinds[0];
}

export function journalBadges(s: SaveState, now = Date.now()): JournalBadges {
  const kinds = {} as Record<ProgressKind, number>, groups = {} as Record<JournalGroup, number>;
  let total = 0;
  for (const [group, , list] of JOURNAL_GROUPS) {
    groups[group] = 0;
    for (const kind of list) {
      const n = progressEntries(s, kind, now).filter(e => e.complete && !e.claimed).length;
      kinds[kind] = n; groups[group] += n; total += n;
    }
  }
  return { total, groups, kinds };
}
