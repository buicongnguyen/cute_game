// The journey tool's timeline (docs/AAA-PLAN.md WP4): a recorded event list parses into the timeline and the beats are counted.
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { BEATS, baselineNumbers, buildTimeline, foldRuns, namedLine, opener, repeats, scriptHash } from '../promo/journey.mjs';

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
  // the Attack probe: the pen site opens on Attack, the market does not
  mark(102000, 'probe', { kind: 'pen' }), attack(102100), dialog(102300, 'A spot for an animal pen'), mark(103600, 'probe-result', { kind: 'pen', offered: true, opened: 'A spot for an animal pen' }),
  tap(104000, 'button[close] in dialog'), { t: 104200, type: 'dialog-close' },
  mark(105000, 'probe', { kind: 'sell' }), attack(105100), mark(106700, 'probe-result', { kind: 'sell', offered: false, opened: null }),
  mark(107000, 'free-play'),
  { t: 110000, type: 'ko' }, dialog(110300, 'A little rest, then try again'), { t: 110400, type: 'ko' }, tap(112000, 'button[close] in dialog'), { t: 112300, type: 'dialog-close' },
  // Attack spam with nothing to use beside the hero: the dialog the game opens then is the game's
  { ...attack(114700), usable: false }, { ...attack(114900), usable: false }, dialog(115000, 'Level 4!'), tap(115300, 'button[close] in dialog'), { t: 115500, type: 'dialog-close' },
  { ...attack(116400), usable: true }, dialog(116700, 'The Ember Well'), tap(117000, 'button[close] in dialog'), { t: 117200, type: 'dialog-close' },
  { t: 118000, type: 'ribbon', id: 'level' }, { t: 118100, type: 'stinger', id: 'level' }, { t: 119000, type: 'card', id: 'first-win' },
  { t: 119500, type: 'line', speaker: 'Sprout', text: 'Over here!' },
  mark(120000, 'free-play-done'), mark(120100, 'end'),
];

test('a recorded event list parses into the timeline', () => {
  const t = buildTimeline(FIXTURE, { route: 'new', device: 'phone' });
  assert.equal(t.route, 'new'); assert.equal(t.device, 'phone');
  assert.equal(t.durationS, 110, 'seconds after Play, to the last event');
  // the first dialog that names someone is Pepper's text dialog, 34.5 s after Play; the first SPOKEN line is Sprout's talk line
  assert.deepEqual({ t: t.firstNamedDialog.t, speaker: t.firstNamedDialog.speaker }, { t: 34.5, speaker: 'Pepper' });
  assert.match(t.firstNamedDialog.text, /I am Pepper/);
  assert.deepEqual(t.firstSpokenLine, { t: 109.4, speaker: 'Sprout', text: 'Over here!' });
  assert.equal(buildTimeline(FIXTURE.filter(e => e.type !== 'line')).firstSpokenLine, null, 'a text dialog is not a spoken line');
  // dialogs and what opened them
  assert.deepEqual(t.dialogs.map(d => [d.title, d.by]), [
    ['Welcome home!', 'tap'], ['Choose a seed', 'tap'], ['Your first harvest!', 'game'],
    ['Made with a little magic', 'attack'], ['Made with a little magic', 'attack'], ['A spot for an animal pen', 'attack'], ['A little rest, then try again', 'game'],
    ['Level 4!', 'game'], ['The Ember Well', 'attack'],
  ]);
  assert.deepEqual(t.dialogsBy, { attack: 4, collect: 0, tap: 2, key: 0, game: 3 });
  assert.equal(t.dialogs[2].t, 34.5);
  // Collect taps: one for each of the four finished steps before the fight; the fifth step ended without one
  assert.equal(t.collectTaps, 4); assert.equal(t.storySteps, 5); assert.equal(t.collectTapsPerStep, .8);
  assert.equal(t.attackPresses, 11);
  assert.deepEqual(t.levelUps, [{ t: 31.4, level: 2 }, { t: 81, level: 3 }]);
  assert.deepEqual(t.ribbons, [{ t: 107.9, id: 'level' }]); assert.deepEqual(t.cards, [{ t: 108.9, id: 'first-win' }]); assert.deepEqual(t.stingers, [{ t: 108, id: 'level' }]);
  assert.deepEqual(t.knockOuts, [99.9], 'health at 0 and the rest dialog 0.4 s later are one knock-out');
  assert.equal(t.kills, 5);
  assert.equal(t.steps.find(s => s.name === 'planted').t, 9);
});

test('the fight step: presses it needed, eager presses and the dialogs Attack opened', () => {
  const { fight } = buildTimeline(FIXTURE, { route: 'new', device: 'phone' });
  assert.deepEqual(fight, {
    startS: 69.9, completed: true, attackPressesNeeded: 0, eagerAttackPresses: 6, trackerTaps: 2,
    dialogsOpenedByAttack: 2, dialogsOpenedByAttackDistinct: 1, maxRepeatsOfOneDialog: 2,
    kills: 5, firstKillAfterS: 6, tookS: 21.5, lowestHealthPct: 71,
  });
  const cut = FIXTURE.filter(e => !(e.type === 'kill' && e.t > 97000));
  assert.equal(buildTimeline(cut).fight.completed, false, 'three kills when the step ended: not completed');
  assert.deepEqual(repeats([{ title: 'a' }, { title: 'b' }, { title: 'a' }, { title: 'a' }]), { count: 4, distinct: 2, maxRepeats: 3 });
  assert.deepEqual(repeats([]), { count: 0, distinct: 0, maxRepeats: 0 });
});

test('the Attack probe and free play are their own blocks', () => {
  const t = buildTimeline(FIXTURE, { route: 'new', device: 'phone' });
  assert.deepEqual(t.attackProbe, { tried: 2, opened: 1, titles: 1, things: { pen: 1, sell: 0 } });
  assert.deepEqual(t.freePlay, {
    startS: 96.9, tookS: 13, attackPresses: 3, collectTaps: 0, storySteps: 0,
    dialogsOpenedByAttack: 1, dialogsOpenedByAttackDistinct: 1, maxRepeatsOfOneDialog: 1, kills: 0, levelUps: 0, knockOuts: 1,
  });
  assert.equal(buildTimeline(FIXTURE.filter(e => !/probe|free-play/.test(e.name ?? ''))).attackProbe, undefined);
});

test('beats are counted, with the time of the first', () => {
  const { beats } = buildTimeline(FIXTURE, { route: 'new', device: 'phone' });
  assert.deepEqual(beats.title, { count: 1, firstS: -6.1 }, 'the title screen is before Play');
  assert.deepEqual(beats['first-named-dialog'], { count: 1, firstS: 34.5 });
  assert.deepEqual(beats['first-spoken-line'], { count: 1, firstS: 109.4 });
  assert.deepEqual(beats['attack-probe'], { count: 1, firstS: 93.5 });
  assert.deepEqual(beats.collect, { count: 4, firstS: 42.9 });
  assert.deepEqual(beats['first-kill'], { count: 5, firstS: 75.9 });
  assert.deepEqual(beats['attack-opened-dialog'], { count: 4, firstS: 82.2 });
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
  const lost = buildTimeline(run(mark(129000, 'boss-timeout', { bossPct: 22, lowestPct: 15 })), { route: 'mid', device: 'pc' });
  assert.deepEqual(lost.boss, { engagedS: 8, cageOpened: false, tookS: 120, bossHealthLeftPct: 22, bossLowestHealthPct: 15, bossStartedAtPct: 100, attackPresses: 3, skillPresses: 1, knockOuts: 1, lowestHealthPct: 40 });
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
  // each kind of press has its own window: Attack and keys 0.6 s, a tap or Collect 2.5 s
  const events = [attack(1000), dialog(1500, 'A'), attack(2000), dialog(2700, 'B'), tap(5000), dialog(7400, 'C'), tap(8000), dialog(10600, 'D'),
    collect(11000), dialog(11100, 'E'), { t: 12000, type: 'input', kind: 'key', target: 'key m' }, dialog(12200, 'F'), { t: 13000, type: 'input', kind: 'key', target: 'key m' }, dialog(13700, 'G')];
  assert.deepEqual([1, 3, 5, 7, 9, 11, 13].map(i => opener(events, i).by), ['attack', 'game', 'tap', 'game', 'collect', 'key', 'game']);
  // a tap walked the hero to the shop; Attack presses on the way had nothing to use: the tap opened it
  const walk = [tap(1000), { ...attack(2000), usable: false }, { ...attack(2400), usable: false }, dialog(2600, 'Little outfitters')];
  assert.deepEqual(opener(walk, 3), { by: 'tap', target: 'canvas' });
  // Attack spam in a fight (nothing usable), and the game opens a dialog: the game's, not Attack's
  const spam = [{ ...attack(1000), usable: false }, { ...attack(1260), usable: false }, { ...attack(1520), usable: false }, dialog(1600, 'Level 4!')];
  assert.equal(opener(spam, 3).by, 'game');
  // the same spam beside a usable thing: Attack opened it
  assert.equal(opener([...spam.slice(0, 2), { ...attack(1520), usable: true }, dialog(1600, 'Choose a seed')], 3).by, 'attack');
  // a knock-out's rest dialog is the game's even with a usable press just before it
  assert.equal(opener([{ ...attack(1000), usable: true }, { t: 1100, type: 'ko' }, dialog(1300, 'A little rest, then try again')], 2).by, 'game');
});

test('the baseline keeps numbers only', () => {
  const numbers = baselineNumbers(buildTimeline(FIXTURE, { route: 'new', device: 'phone' }));
  assert.equal(numbers.firstNamedDialogS, 34.5); assert.equal(numbers.firstSpokenLineS, 109.4); assert.equal(numbers.dialogsOpened, 9); assert.equal(numbers.levelReached, 3);
  assert.deepEqual(numbers.beats['attack-opened-dialog'], { count: 4, firstS: 82.2 }); assert.deepEqual(numbers.beats.crystal, { count: 0, firstS: null });
  assert.equal(numbers.fight.dialogsOpenedByAttack, 2); assert.equal(numbers.attackProbe.opened, 1); assert.equal(numbers.freePlay.tookS, 13);
  assert.doesNotMatch(JSON.stringify(numbers), /Hi boss|little magic/, 'no dialog texts');
  // the committed baseline has the same shape for every row it holds
  const baseline = JSON.parse(readFileSync(new URL('../promo/journey-baseline.json', import.meta.url), 'utf8'));
  const rows = Object.entries(baseline).filter(([key]) => key.includes('/'));
  assert.ok(rows.length >= 2, 'route new on phone and PC');
  const number = v => typeof v === 'number' || !!v && typeof v.median === 'number' && v.min <= v.median && v.median <= v.max;
  for (const [key, row] of rows) {
    assert.match(key, /^(new|mid)\/(phone|pc)$/);
    for (const field of ['durationS', 'dialogsOpened', 'collectTaps', 'attackPresses', 'levelUps', 'knockOuts']) assert.ok(number(row[field]), `${key} ${field}`);
    assert.doesNotMatch(JSON.stringify(row), /[A-Z]:[\\/]|\.png/, 'no paths or pictures');
    assert.ok(row.runs >= 1, `${key} says how many runs it folds`);
    assert.match(row.script, /^[0-9a-f]{12}$/, `${key} carries the hash of the tool that measured it`);
    if (key.startsWith('new/')) { assert.ok(row.runs >= 3, `${key}: three runs`); assert.ok(number(row.attackProbe.opened), `${key} has the Attack probe`); assert.ok(number(row.freePlay.tookS)); }
  }
  // rows measured by different versions of the tool must not sit side by side
  assert.equal(new Set(rows.map(([, row]) => row.script)).size, 1, 'every row was measured by the same promo/journey.mjs');
  assert.match(scriptHash(), /^[0-9a-f]{12}$/);
});

test('runs fold into the median with the lowest and the highest', () => {
  const fold = foldRuns([
    { a: 1, b: 5, c: null, d: { e: 2, f: 'x' }, g: 'p', h: true },
    { a: 1, b: 9, c: 4, d: { e: 8, f: 'x' }, g: 'q', h: true },
    { a: 1, b: 7, c: 6, d: { e: 3, f: 'x' }, g: 'p', h: false },
  ]);
  assert.deepEqual(fold, { a: 1, b: { median: 7, min: 5, max: 9 }, c: { median: 5, min: 4, max: 6, missing: 1 }, d: { e: { median: 3, min: 2, max: 8 }, f: 'x' }, g: { values: ['p', 'q', 'p'] }, h: { values: [true, true, false] } });
  assert.deepEqual(foldRuns([{ a: null }, { a: null }]), { a: null });
  const one = baselineNumbers(buildTimeline(FIXTURE)); assert.deepEqual(foldRuns([one, one, one]), one, 'equal runs fold into themselves');
});
