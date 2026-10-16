// The gain feed (src/gain-feed.ts): which gain is told where, the pickup list's merging, size and fading, and the tracker
// rows that tick when a gain moves the quest step, the bounty or a timed challenge on. Plus a look at main.ts's call sites:
// no EXP, energy or pickup floats over the hero any more.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PICKUP, PickupList, TaskWatch, TICK_WINDOW, gainPlace, type GainKind } from '../src/gain-feed.ts';
import * as M from '../src/model.ts';
import { progressEntries, recordEvent, refreshProgress } from '../src/progression.ts';

test('the routing table: items to the tracker or the pickup list, EXP and energy to the plate, the rest stays in the world', () => {
  assert.equal(gainPlace('item', true), 'tracker');
  assert.equal(gainPlace('item', false), 'pickups');
  assert.equal(gainPlace('item'), 'pickups');
  for (const kind of ['xp', 'energy'] as GainKind[]) { assert.equal(gainPlace(kind), 'stat'); assert.equal(gainPlace(kind, true), 'stat', 'a stat is never a tracker tick'); }
  for (const kind of ['heal', 'damage', 'crit', 'level', 'catch', 'warn', 'note'] as GainKind[]) assert.equal(gainPlace(kind), 'centre', kind);
});

test('the pickup list: newest on top, the same item within 2 s merges into one line, later it is a new line', () => {
  const list = new PickupList();
  list.add('meat', 1, 0); list.add('feather', 2, 100);
  assert.deepEqual(list.lines.map(l => [l.id, l.count]), [['feather', 2], ['meat', 1]], 'newest on top');
  const merged = list.add('meat', 2, 100 + PICKUP.merge - 200);
  assert.ok(merged.merged); assert.deepEqual(list.lines.map(l => [l.id, l.count]), [['meat', 3], ['feather', 2]], 'merged, ×3, and back on top');
  const again = list.add('meat', 1, merged.line.at + PICKUP.merge + 1);
  assert.equal(again.merged, false, 'after the merge window a new line starts');
  assert.equal(PICKUP.merge, 2000); assert.equal(PICKUP.life, 3000);
});

test('the pickup list keeps 3 lines (2 on phones): the oldest leaves first', () => {
  const list = new PickupList();
  for (const [i, id] of ['a', 'b', 'c'].entries()) assert.deepEqual(list.add(id, 1, i * 10).dropped, []);
  const d = list.add('d', 1, 40);
  assert.deepEqual(d.dropped.map(l => l.id), ['a']); assert.deepEqual(list.lines.map(l => l.id), ['d', 'c', 'b']);
  const phone = new PickupList(); phone.add('a', 1, 0); phone.add('b', 1, 1);
  assert.deepEqual(phone.add('c', 1, 2, PICKUP.maxPhone).dropped.map(l => l.id), ['a']); assert.equal(phone.lines.length, 2);
  assert.deepEqual([PICKUP.max, PICKUP.maxPhone], [3, 2]);
  // A merge into an older line moves it up and drops nothing.
  assert.deepEqual(list.add('b', 5, 60).dropped, []); assert.deepEqual(list.lines.map(l => [l.id, l.count]), [['b', 6], ['d', 1], ['c', 1]]);
});

test('each line fades 3 s after it was last added to; the next fade time is known without a per-frame check', () => {
  const list = new PickupList();
  assert.equal(list.nextExpiry(), null);
  list.add('meat', 1, 0); list.add('apple', 1, 1000);
  assert.equal(list.nextExpiry(), PICKUP.life);
  assert.deepEqual(list.expire(PICKUP.life - 1), []);
  list.add('meat', 1, 1500); // a merge keeps it alive
  assert.deepEqual(list.expire(PICKUP.life + 10), [], 'meat was topped up at 1.5 s');
  assert.deepEqual(list.expire(1000 + PICKUP.life).map(l => l.id), ['apple']);
  assert.equal(list.nextExpiry(), 1500 + PICKUP.life);
  assert.deepEqual(list.expire(1500 + PICKUP.life).map(l => l.id), ['meat']); assert.equal(list.lines.length, 0);
});

test('a tracker row ticks only when its own task moves on; a new task starts without a tick', () => {
  const w = new TaskWatch();
  assert.equal(w.see('quest', 'story:0', 0, 0), 0, 'the first look is the baseline');
  assert.equal(w.see('quest', 'story:0', 0, 100), 0);
  assert.equal(w.see('quest', 'story:0', 2, 200), 2, 'moved on by 2');
  assert.ok(w.recent(200 + TICK_WINDOW)); assert.ok(!w.recent(200 + TICK_WINDOW + 1), 'only a gain told right after the tick counts as its cause');
  assert.equal(w.see('quest', 'story:1', 0, 300), 0, 'the next quest step');
  assert.equal(w.see('quest', 'story:1', 1, 400), 1);
  assert.equal(w.see('bounty', 'home:1', 1, 500), 0); assert.equal(w.see('bounty', 'home:1', 2, 600), 1, 'the bounty is a row of its own');
  assert.equal(w.see('bounty', null, 0, 700), 0, 'claimed or gone'); assert.equal(w.see('bounty', 'home:2', 1, 800), 0, 'a new bounty');
  assert.equal(w.see('chal', 12345, 0, 900), 0); assert.equal(w.see('chal', 12345, 3, 1000), 3);
  assert.equal(w.see('quest', 'story:1', 0, 1100), 0, 'a count that drops (an item-count step after selling) is no tick');
  w.reset(); assert.equal(w.see('chal', 12345, 5, 1200), 0, 'after a reset (another save) the next look is a baseline'); assert.ok(!w.recent(1200));
});

test('task match with the real progression: a harvest moves the harvest step on, a kill moves its bounty and a timed challenge', () => {
  const s = M.newGame('Feed'); const now = Date.now(); refreshProgress(s, now);
  const w = new TaskWatch(), look = (t: number) => {
    const q = progressEntries(s, 'story', now)[0], b = s.progression.bounty, c = s.progression.challenge;
    return { quest: w.see('quest', q.id, q.progress, t), bounty: w.see('bounty', b && !b.claimed ? b.key : null, b?.progress ?? 0, t), chal: w.see('chal', c && !c.claimed ? c.ends : null, c?.progress ?? 0, t) };
  };
  const b = s.progression.bounty; assert.ok(b, 'the home map has a bounty this half hour'); const prey = b.type, other = prey === 'boar' ? 'slime' : 'boar';
  s.progression.challenge = { type: 'kill', target: 3, progress: 0, ends: now + 60e3, claimed: false };
  look(0);
  const step = progressEntries(s, 'story', now)[0];
  recordEvent(s, 'harvest', 1, undefined, now);
  const afterHarvest = look(10);
  // The first story step is the harvest step (content.ts STORY_STEPS); if that ever changes, the harvest simply does not tick.
  assert.equal(afterHarvest.quest, progressEntries(s, 'story', now)[0].progress - step.progress);
  assert.equal(afterHarvest.bounty, 0, 'a harvest is not the bounty'); assert.equal(afterHarvest.chal, 0, 'nor a kill challenge');
  recordEvent(s, 'kill', 1, prey, now);
  assert.deepEqual(look(20), { quest: 0, bounty: 1, chal: 1 });
  recordEvent(s, 'kill', 1, other, now);
  assert.deepEqual(look(30), { quest: 0, bounty: 0, chal: 1 }, 'another creature: only the challenge');
});

test('main.ts: pickups, EXP and energy no longer float over the hero; damage, catches and warnings still do', () => {
  const src = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
  const calls = src.match(/floating\([^;]*/g) ?? [];
  for (const c of calls) assert.ok(!/\bE?XP\b|ϟ|'\+'\+count|\+1 \{name\}|'\+'\+n\+/.test(c), `a gain still floats: ${c.slice(0, 90)}`);
  assert.match(src, /gainStat\('xp',e\.xp\)/, 'a kill fills the EXP bar');
  assert.match(src, /feedback=\(id:string,count:number\)=>\{gainItem\(id,count\)/, 'drops go through the feed');
  assert.match(src, /gainItem\(crop,1\)/, 'a harvest goes through the feed');
  assert.match(src, /floating\('⚠️ Line strained!'/, 'warnings stay in the world');
  assert.match(src, /'#hud \.player-card,#hud \.top-actions,#hud \.tracker-stack,#pickup-feed,/, 'world labels keep clear of the pickup list (measureHud)');
});
