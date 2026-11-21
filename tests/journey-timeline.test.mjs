// The journey tool's timeline (docs/AAA-PLAN.md WP4): a recorded event list parses into the timeline and the beats are counted.
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { BEATS, baselineNumbers, buildTimeline, namedLine, opener } from '../promo/journey.mjs';

// What the page recorder writes (ms on the wall clock): a short first session, cut down from a real phone run.
const mark = (t, name, data) => ({ t, type: 'mark', name, ...(data ? { data } : {}) });
const tap = (t, target = 'canvas') => ({ t, type: 'input', kind: 'tap', target });
const attack = t => ({ t, type: 'input', kind: 'attack', target: 'button[attack]' });
const collect = t => ({ t, type: 'input', kind: 'collect', target: '#quick-claim[claim]' });
const dialog = (t, title, text = '') => ({ t, type: 'dialog', title, text });
const FIXTURE = [
  mark(4000, 'title'), tap(9000, '#name-input'), tap(10000, 'button[start]'), mark(10100, 'start'),
  dialog(10900, 'Welcome home!', 'Welcome home! Your garden is waiting.'), tap(12000, 'button in dialog'), { t: 12300, type: 'dialog-close' },
  mark(15000, 'first-view'), tap(16000), dialog(17500, 'Choose a seed'), mark(18000, 'seed-picker'), tap(18500, 'button[plant] in dialog'), mark(19100, 'planted'),
  tap(19500, 'button[close] in dialog'), { t: 19800, type: 'dialog-close' },
  mark(40000, 'ripe'), tap(41000), mark(41400, 'first-harvest'), { t: 41500, type: 'level', level: 2 },
  // Pepper's text dialog arrives 3.6 s after the harvest tap: the game opened it, not the tap
  dialog(44600, 'Your first harvest!', 'Your first harvest! Hi boss! I am Pepper, the village cook. What a lovely first harvest!'),
  tap(46000, 'button[close] in dialog'), { t: 46300, type: 'dialog-close' },
  { t: 52000, type: 'story', index: 1 }, collect(53000), { t: 61000, type: 'story', index: 2 }, collect(62000),
  { t: 70000, type: 'story', index: 3 }, collect(70500), { t: 75000, type: 'story', index: 4 }, collect(75500),
  mark(80000, 'fight-start'), tap(80500, '#quest-summary[quests]'), { t: 84000, type: 'hp', pct: 92 }, { t: 86000, type: 'kill' },
  tap(86500, '#quest-summary[quests]'), { t: 91000, type: 'kill' }, { t: 91050, type: 'level', level: 3 },
  mark(91200, 'fight-eager'), attack(92000), dialog(92300, 'Made with a little magic'), tap(93000, 'button[close] in dialog'), { t: 93300, type: 'dialog-close' },
  attack(94000), dialog(94200, 'Made with a little magic'), tap(95000, 'button[close] in dialog'), { t: 95300, type: 'dialog-close' },
  attack(96000), attack(96300), { t: 96800, type: 'hp', pct: 71 }, { t: 97000, type: 'kill' }, attack(98000), { t: 99000, type: 'kill' }, attack(99500), { t: 101000, type: 'kill' },
  { t: 101100, type: 'story', index: 5 }, mark(101500, 'fight-done'),
  { t: 110000, type: 'ko' }, dialog(110300, 'A little rest, then try again'), { t: 110400, type: 'ko' }, tap(112000, 'button[close] in dialog'), { t: 112300, type: 'dialog-close' },
  { t: 118000, type: 'ribbon', id: 'level' }, { t: 118100, type: 'stinger', id: 'level' }, { t: 119000, type: 'card', id: 'first-win' },
  { t: 119500, type: 'line', speaker: 'Sprout', text: 'Over here!' },
  mark(120100, 'end'),
];

test('a recorded event list parses into the timeline', () => {
  const t = buildTimeline(FIXTURE, { route: 'new', device: 'phone' });
  assert.equal(t.route, 'new'); assert.equal(t.device, 'phone');
  assert.equal(t.durationS, 110, 'seconds after Play, to the last event');
  // the first named line is Pepper's text dialog, 34.5 s after Play; the later talk line by Sprout is not the first
  assert.deepEqual({ t: t.firstNamedLine.t, speaker: t.firstNamedLine.speaker }, { t: 34.5, speaker: 'Pepper' });
  assert.match(t.firstNamedLine.text, /I am Pepper/);
  // dialogs and what opened them
  assert.deepEqual(t.dialogs.map(d => [d.title, d.by]), [
    ['Welcome home!', 'tap'], ['Choose a seed', 'tap'], ['Your first harvest!', 'game'],
    ['Made with a little magic', 'attack'], ['Made with a little magic', 'attack'], ['A little rest, then try again', 'game'],
  ]);
  assert.deepEqual(t.dialogsBy, { attack: 2, collect: 0, tap: 2, key: 0, game: 2 });
  assert.equal(t.dialogs[2].t, 34.5);
  // Collect taps: one for each of the four finished steps before the fight; the fifth step ended without one
  assert.equal(t.collectTaps, 4); assert.equal(t.storySteps, 5); assert.equal(t.collectTapsPerStep, .8);
  assert.equal(t.attackPresses, 6);
  assert.deepEqual(t.levelUps, [{ t: 31.4, level: 2 }, { t: 81, level: 3 }]);
  assert.deepEqual(t.ribbons, [{ t: 107.9, id: 'level' }]); assert.deepEqual(t.cards, [{ t: 108.9, id: 'first-win' }]); assert.deepEqual(t.stingers, [{ t: 108, id: 'level' }]);
  assert.deepEqual(t.knockOuts, [99.9], 'health at 0 and the rest dialog 0.4 s later are one knock-out');
  assert.equal(t.kills, 5);
  assert.equal(t.steps.find(s => s.name === 'planted').t, 9);
});

test('the fight step: presses it needed, eager presses and the dialogs Attack opened', () => {
  const { fight } = buildTimeline(FIXTURE, { route: 'new', device: 'phone' });
  assert.deepEqual(fight, {
    startS: 69.9, attackPressesNeeded: 0, eagerAttackPresses: 6, trackerTaps: 2, dialogsOpenedByAttack: 2,
    kills: 5, firstKillAfterS: 6, tookS: 21.5, lowestHealthPct: 71,
  });
});

test('beats are counted, with the time of the first', () => {
  const { beats } = buildTimeline(FIXTURE, { route: 'new', device: 'phone' });
  assert.deepEqual(beats.title, { count: 1, firstS: -6.1 }, 'the title screen is before Play');
  assert.deepEqual(beats['first-named-line'], { count: 2, firstS: 34.5 });
  assert.deepEqual(beats.collect, { count: 4, firstS: 42.9 });
  assert.deepEqual(beats['first-kill'], { count: 5, firstS: 75.9 });
  assert.deepEqual(beats['attack-opened-dialog'], { count: 2, firstS: 82.2 });
  assert.deepEqual(beats['level-up'], { count: 2, firstS: 31.4 });
  assert.deepEqual(beats['knock-out'], { count: 2, firstS: 99.9 }, 'the beat counts raw events; the timeline merges them');
  assert.deepEqual(beats.ribbon, { count: 1, firstS: 107.9 }); assert.deepEqual(beats.card, { count: 1, firstS: 108.9 }); assert.deepEqual(beats.stinger, { count: 1, firstS: 108 });
  assert.deepEqual(beats.crystal, { count: 0, firstS: null });
  assert.equal(beats['boss-engaged'], undefined, 'beats of the other route are left out');
  assert.equal(new Set(BEATS.map(b => b.id)).size, BEATS.length, 'beat ids are unique');
});

test('a later package adds its beat and its check to the table', () => {
  const firstWin = { id: 'first-win', on: e => e.type === 'card' && e.id === 'first-win', check: t => t.fight.dialogsOpenedByAttack ? `${t.fight.dialogsOpenedByAttack} dialogs opened by Attack in the fight step` : null };
  const t = buildTimeline(FIXTURE, { route: 'new', device: 'phone', beats: [...BEATS, firstWin] });
  assert.deepEqual(t.beats['first-win'], { count: 1, firstS: 108.9 });
  assert.deepEqual(t.complaints, ['first-win: 2 dialogs opened by Attack in the fight step']);
  assert.deepEqual(buildTimeline(FIXTURE).complaints, []);
});

test('the boss route: cage opened or time ran out', () => {
  const run = last => [mark(1000, 'start'), mark(3000, 'first-view'), mark(4000, 'boss-in-view'), tap(5000), mark(9000, 'boss-engaged', { bossPct: 100 }),
    attack(9500), attack(9800), tap(10500, 'button[skill]'), { t: 20000, type: 'hp', pct: 40 }, mark(40000, 'boss-half', { bossPct: 49 }), { t: 50000, type: 'ko' }, attack(60000), last, mark(131000, 'end')];
  const lost = buildTimeline(run(mark(129000, 'boss-timeout', { bossPct: 22 })), { route: 'mid', device: 'pc' });
  assert.deepEqual(lost.boss, { engagedS: 8, cageOpened: false, tookS: 120, bossHealthLeftPct: 22, attackPresses: 3, skillPresses: 1, knockOuts: 1, lowestHealthPct: 40 });
  assert.deepEqual(lost.beats['boss-timeout'], { count: 1, firstS: 128 }); assert.equal(lost.beats.planted, undefined);
  const won = buildTimeline(run(mark(99000, 'cage-open', { bossPct: 0 })), { route: 'mid', device: 'pc' });
  assert.deepEqual([won.boss.cageOpened, won.boss.tookS, won.boss.bossHealthLeftPct], [true, 90, 0]);
  assert.equal(won.fight, undefined);
});

test('named lines and openers', () => {
  assert.equal(namedLine(dialog(0, 'Little outfitters', 'Hats and boots')), null);
  assert.equal(namedLine(tap(0, 'Pepper')), null, 'only dialogs and talk lines speak');
  assert.equal(namedLine({ t: 0, type: 'line', speaker: 'Old Honeypaw', text: 'Grr' }).speaker, 'Old Honeypaw');
  assert.equal(namedLine(dialog(0, 'Peppermint tea', 'A warm cup')), null, 'whole names only');
  const events = [attack(1000), dialog(3400, 'A'), tap(5000), dialog(7600, 'B'), collect(8000), dialog(8100, 'C'), { t: 9000, type: 'input', kind: 'key', target: 'key m' }, dialog(9200, 'D')];
  assert.deepEqual([1, 3, 5, 7].map(i => opener(events, i).by), ['attack', 'game', 'collect', 'key']);
});

test('the baseline keeps numbers only', () => {
  const numbers = baselineNumbers(buildTimeline(FIXTURE, { route: 'new', device: 'phone' }));
  assert.equal(numbers.firstNamedLineS, 34.5); assert.equal(numbers.dialogsOpened, 6); assert.equal(numbers.levelReached, 3);
  assert.deepEqual(numbers.beats['attack-opened-dialog'], [2, 82.2]); assert.deepEqual(numbers.beats.crystal, [0]);
  assert.equal(numbers.fight.dialogsOpenedByAttack, 2);
  assert.doesNotMatch(JSON.stringify(numbers), /Hi boss|little magic/, 'no dialog texts');
  // the committed baseline has the same shape for every row it holds
  const baseline = JSON.parse(readFileSync(new URL('../promo/journey-baseline.json', import.meta.url), 'utf8'));
  const rows = Object.entries(baseline).filter(([key]) => key.includes('/'));
  assert.ok(rows.length >= 2, 'route new on phone and PC');
  for (const [key, row] of rows) {
    assert.match(key, /^(new|mid)\/(phone|pc)$/);
    for (const field of ['durationS', 'dialogsOpened', 'collectTaps', 'attackPresses', 'levelUps', 'knockOuts']) assert.equal(typeof row[field], 'number', `${key} ${field}`);
    assert.doesNotMatch(JSON.stringify(row), /[A-Z]:[\\/]|\.png/, 'no paths or pictures');
  }
});
