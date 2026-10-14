import test from 'node:test';
import assert from 'node:assert/strict';
import * as M from '../src/model.ts';
import { progressEntries, claimProgress, type ProgressKind } from '../src/progression.ts';
import { journalBadges, journalTabsHtml, groupTarget, groupOf, badgeCount, JOURNAL_GROUPS } from '../src/journal-badges.ts';
import { setLanguage } from '../src/i18n.ts';
import { BADGE_VI } from '../src/locales/vi-badge.ts';

const ALL: ProgressKind[] = ['story', 'daily', 'weekly', 'achievements', 'pass', 'bounties', 'collection', 'challenges'];
const SECTIONS = ALL.map(k => [k, k[0].toUpperCase() + k.slice(1)] as [ProgressKind, string]);
const NOW = Date.UTC(2026, 9, 14, 12);

test('every journal section belongs to exactly one group', () => {
  const listed = JOURNAL_GROUPS.flatMap(([, , kinds]) => kinds);
  assert.deepEqual([...listed].sort(), [...ALL].sort());
});

test('counts match the Collect buttons per section, and sum up to groups and total', () => {
  const s = M.newGame('Tester');
  const b = journalBadges(s, NOW);
  for (const kind of ALL) assert.equal(b.kinds[kind], progressEntries(s, kind, NOW).filter(e => e.complete && !e.claimed).length, kind);
  for (const [g, , kinds] of JOURNAL_GROUPS) assert.equal(b.groups[g], kinds.reduce((n, k) => n + b.kinds[k], 0));
  assert.equal(b.total, ALL.reduce((n, k) => n + b.kinds[k], 0));
  // A fresh game has today's check-in waiting.
  assert.ok(b.kinds.daily >= 1);
  assert.equal(groupTarget(b, 'grow'), 'daily');
});

test('claiming clears the badge', () => {
  const s = M.newGame('Tester');
  const before = journalBadges(s, NOW).kinds.daily;
  const login = progressEntries(s, 'daily', NOW).find(e => e.complete && !e.claimed)!;
  assert.ok(claimProgress(s, 'daily', login.id, NOW));
  assert.equal(journalBadges(s, NOW).kinds.daily, before - 1);
});

test('tabs html: red pills with counts and spoken labels, only where something waits', () => {
  setLanguage('en');
  const b = { total: 12, groups: { explore: 0, grow: 12, collect: 0 }, kinds: { story: 0, daily: 2, weekly: 10, achievements: 0, pass: 0, bounties: 0, collection: 0, challenges: 0 } } as const;
  const html = journalTabsHtml(b as never, 'daily', SECTIONS);
  assert.match(html, /aria-label="Daily, 2 to claim"[^>]*>Daily<i class="tab-badge" aria-hidden="true">2<\/i>/);
  assert.match(html, /aria-label="Weekly, 10 to claim"[^>]*>Weekly<i class="tab-badge"[^>]*>9\+<\/i>/);
  assert.match(html, /🌱 Grow, 12 to claim/);
  assert.equal((html.match(/tab-badge/g) ?? []).length, 3);
  assert.doesNotMatch(html, /data-kind="story"[^>]*data-action="journal-tab"/);
  assert.equal(groupOf('collection'), 'collect');
  assert.equal(badgeCount(0), '');
});

test('Vietnamese labels exist for every new string', () => {
  setLanguage('vi');
  try {
    const b = journalBadges(M.newGame('Tester'), NOW);
    const html = journalTabsHtml(b, 'daily', SECTIONS);
    assert.match(html, /phần thưởng chờ nhận/);
    assert.match(html, /Phát triển/);
  } finally { setLanguage('en'); }
  assert.ok(Object.keys(BADGE_VI).length >= 6);
});
