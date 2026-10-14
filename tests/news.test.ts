// The News inbox: its rules, the save-format change (old saves load, new ones round-trip), Vietnamese, and the
// wiring that sends level-ups, milestones and unlocks to News instead of mid-screen pop-ups.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as M from '../src/model.ts';
import { INBOX_CAP, addInbox, agoKey, badgeText, markAllRead, parseInbox, popupsOn, reportLevelFor, unreadCount, POPUPS_KEY, type InboxItem } from '../src/news-inbox.ts';
import { reportEarned } from '../src/insight-rules.ts';
import { NEWS_VI } from '../src/locales/vi-news.ts';
import { VI_PACK } from '../src/locales/vi-pack.ts';

const NOW = 1_790_000_000_000;
const src = (f: string) => readFileSync(new URL(`../src/${f}`, import.meta.url), 'utf8');

test('entries go on top, unread, with rising ids; the oldest fall off past the cap', () => {
  const list: InboxItem[] = [];
  const a = addInbox(list, { kind: 'level', icon: '🌟', title: 'Level {level}!', text: '', params: { level: 2 } }, NOW);
  const b = addInbox(list, { kind: 'unlock', icon: '🔫', title: 'Side slot unlocked!', text: 'x', open: 'bag' }, NOW + 1);
  assert.deepEqual(list.map(e => e.id), [b.id, a.id]); assert.ok(b.id > a.id);
  assert.equal(unreadCount(list), 2); assert.equal(badgeText(2), '2');
  for (let i = 0; i < 70; i++) addInbox(list, { kind: 'other', icon: '•', title: `n${i}`, text: '' }, NOW + 10 + i);
  assert.equal(list.length, INBOX_CAP); assert.equal(list[0].title, 'n69'); assert.equal(list.at(-1)!.title, 'n20');
  assert.equal(badgeText(50), '9+'); assert.equal(badgeText(0), '');
  assert.equal(markAllRead(list), INBOX_CAP); assert.equal(unreadCount(list), 0); assert.equal(markAllRead(list), 0);
});

test('parseInbox keeps well-formed entries newest first and drops the rest', () => {
  assert.deepEqual(parseInbox(undefined), []); assert.deepEqual(parseInbox({}), []); assert.deepEqual(parseInbox('x'), []);
  const out = parseInbox([
    { id: 1, at: NOW, kind: 'level', icon: '🌟', title: 'Level {level}!', text: 'A', params: { level: 3, bad: {} }, open: 'insight', read: true },
    { id: 2, at: NOW + 5, kind: 'weird', title: 'T', text: 5, open: 'nowhere' },
    { id: 2, at: NOW, title: 'duplicate id' }, { id: -1, at: NOW, title: 'neg' }, { id: 3, at: 'x', title: 'bad time' }, { id: 4, at: NOW, title: '' }, null, [],
  ]);
  assert.deepEqual(out.map(e => e.id), [2, 1]);
  assert.deepEqual(out[1], { id: 1, at: NOW, kind: 'level', icon: '🌟', title: 'Level {level}!', text: 'A', params: { level: 3 }, open: 'insight', read: true });
  assert.deepEqual(out[0], { id: 2, at: NOW + 5, kind: 'other', icon: '📰', title: 'T', text: '' });
  assert.equal(parseInbox(Array.from({ length: 80 }, (_, i) => ({ id: i + 1, at: NOW + i, title: 't' }))).length, INBOX_CAP);
});

test('save format: an old save without an inbox loads unchanged; a saved inbox round-trips', () => {
  const old = M.newGame('Mai'); const raw = JSON.parse(JSON.stringify(old)); delete raw.inbox;
  const loaded = M.parseSave(JSON.stringify(raw))!; assert.ok(loaded); assert.equal(loaded.inbox, undefined);
  const s = M.newGame('Mai'); s.inbox = [];
  addInbox(s.inbox, { kind: 'milestone', icon: '🏅', title: 'Milestone: level {level}', text: '+{energy} energy and a moonstone. Onward, legend!', params: { level: 30, energy: '15,000' }, open: 'bag' }, NOW);
  const back = M.parseSave(JSON.stringify(s))!; assert.deepEqual(back.inbox, s.inbox);
  const broken = M.parseSave(JSON.stringify({ ...s, inbox: 'nope' }))!; assert.equal(broken.inbox, undefined, 'a broken inbox never breaks the save');
});

test('the report level rule matches the Almanac (insight-rules.ts reportEarned)', () => {
  for (let before = 1; before < 60; before++) for (let after = before + 1; after < before + 12; after++) assert.equal(reportLevelFor(before, after), reportEarned(before, after), `${before}->${after}`);
});

test('time labels and the pop-up switch (off by default)', () => {
  assert.deepEqual(agoKey(NOW, NOW + 5000), ['just now', 0]);
  assert.deepEqual(agoKey(NOW, NOW + 5 * 60_000), ['{n} min ago', 5]);
  assert.deepEqual(agoKey(NOW, NOW + 3 * 3600_000), ['{n} h ago', 3]);
  assert.deepEqual(agoKey(NOW, NOW + 2 * 86400_000), ['{n} d ago', 2]);
  assert.equal(popupsOn(null), false); assert.equal(popupsOn({ getItem: () => null }), false);
  assert.equal(popupsOn({ getItem: k => k === POPUPS_KEY ? '1' : null }), true);
  assert.equal(popupsOn({ getItem: () => { throw new Error('blocked'); } }), false);
});

test('every new string has Vietnamese in the pack', () => {
  for (const [en, vi] of Object.entries(NEWS_VI)) { assert.ok(vi && vi !== en, en); assert.equal(VI_PACK[en], vi, en); }
  const ui = src('news-inbox-ui.ts') + src('news-inbox.ts') + src('main.ts');
  for (const key of ['News', 'YOUR INBOX', 'Show announcements as pop-ups', 'Level {level}!', 'Milestone: level {level}', 'Side slot unlocked!', 'New game updates', 'just now', '{n} min ago'])
    assert.ok(VI_PACK[key], `missing Vietnamese: ${key}`), assert.ok(ui.includes(`'${key}'`), `used: ${key}`);
});

test('wiring: level-ups, milestones, the side-slot unlock and the update board go to News; pop-ups only when switched on', () => {
  const main = src('main.ts');
  const level = main.slice(main.indexOf('function levelCheck'), main.indexOf('function levelCheck') + 1600);
  assert.match(level, /inbox\.announce\(/); assert.match(level, /if\(popups\)\{void loadInsight\(\)\.then\(\(\)=>insight\?\.levelUp/);
  assert.match(main, /if\(!seen&&inbox\.announce\(\{kind:'unlock'/);
  assert.match(main, /initNewsBoard\(\{host:ranking\.news,autoOpen:\(\)=>inbox\.popups,onUnread:/);
  assert.match(src('news-board.ts'), /if \(d\.autoOpen && !d\.autoOpen\(\)\) \{/);
  assert.match(main, /case 'news':inbox\.open\(\);break;/);
  assert.match(main, /\$\{inbox\.settingHtml\(\)\}/);
});

test('dock: four buttons stay (bag, journal, news, more); the rest wait in the More menu', () => {
  const main = src('main.ts'), nav = main.match(/<nav class="top-actions"[\s\S]*?<\/nav>/)![0];
  const stashAt = nav.indexOf('<div id="more-stash"'), dock = nav.slice(0, stashAt), stash = nav.slice(stashAt);
  assert.deepEqual([...dock.matchAll(/data-action="([^"]+)"/g)].map(m => m[1]), ['bag', 'quests', 'news', 'more']);
  for (const moved of ['data-action="ranking"', 'id="social-slot"', 'data-action="help"', 'id="platform-slot"', 'data-action="settings"']) assert.ok(stash.includes(moved), moved);
  assert.ok(stash.includes('id="news-count"'), 'the update board keeps its unread count (mirrored on More)');
});
