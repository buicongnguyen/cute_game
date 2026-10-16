// The start of a new save (docs/FIX-PLAN.md 4.6): welcome cards once, one goal at a time, Chapter 1's way pointed out,
// moment tips once, and Pepper's 10,000 energy as the first harvest's reward (with the migration of older saves).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as M from '../src/model.ts';
import * as F from '../src/friends.ts';
import { applyGameAction } from '../src/actions.ts';
import { freshStart, welcomeCardsDue, untouched, oneGoal, chapterOneGuide, hasSeen, markSeen, parseFirstRun, FIRST_SEEN, CALM_UNTIL_LEVEL } from '../src/first-run.ts';
import { pickTip, type TipFacts } from '../src/moment-tips.ts';
import { welcomeCards } from '../src/welcome-cards.ts';
import { FIRST_VI } from '../src/locales/vi-first.ts';
import { VI_PACK } from '../src/locales/vi-pack.ts';
import { STORY_STEPS } from '../src/content.ts';

const T0 = 1_700_000_000_000;
const act = (s: M.SaveState, type: string, payload: Record<string, unknown> = {}, now = T0) => applyGameAction(s, { type, payload }, { now, random: () => .5 });
const fresh = () => { const s = freshStart(M.newGame('Mai')); s.bag.seed_radish = 9; return s; };
/** Plants bed 0 at `now` and returns the time it is ripe. */
function ripen(s: M.SaveState, now = T0) { act(s, 'plant', { index: 0, id: 'radish' }, now); const p = s.plots[0]; return now + (p.growDuration ?? 600_000) + 1000; }

test('welcome cards: only on an untouched new save, once, saved in the save through the action the server runs too', () => {
  const s = fresh(); assert.ok(untouched(s)); assert.ok(welcomeCardsDue(s));
  assert.equal(act(s, 'firstRunSeen', { id: 'cards' }), true);
  assert.ok(hasSeen(s, 'cards')); assert.equal(welcomeCardsDue(s), false, 'never again');
  assert.equal(act(s, 'firstRunSeen', { id: 'cards' }), true, 'a second note is harmless');
  assert.deepEqual(s.firstRun!.seen, ['cards']);
  assert.deepEqual(M.parseSave(JSON.stringify(s))!.firstRun!.seen, ['cards'], 'kept across a reload (and on the server, which parses the same way)');
  assert.throws(() => act(s, 'firstRunSeen', { id: 'nonsense' }), 'unknown ids are malformed');
  const old = M.newGame(); assert.equal(welcomeCardsDue(old), false, 'older saves (no firstRun) never see them');
  assert.equal(act(old, 'firstRunSeen', { id: 'tip:plant' }), true); assert.equal(old.firstRun, undefined, 'and nothing is added to them');
  const played = fresh(); played.counters.harvests = 1; assert.equal(welcomeCardsDue(played), false, 'an online account that already played: no cards');
  const levelled = fresh(); levelled.level = 2; assert.equal(welcomeCardsDue(levelled), false);
  const planted = fresh(); ripen(planted); assert.equal(welcomeCardsDue(planted), false, 'a bed already planted');
  assert.deepEqual(parseFirstRun({ seen: ['cards', 'x', 'tip:fight', 'cards'] })!.seen, ['cards', 'tip:fight'], 'only known ids, once each');
  assert.ok(markSeen(s, 'tip:fight') && FIRST_SEEN.every(id => markSeen(s, id)) && s.firstRun!.seen!.length === FIRST_SEEN.length);
});

test('the three cards say who you are, what the game is and what to do now, Tap on phones and Click with a mouse', () => {
  const phone = welcomeCards(true, 9), pc = welcomeCards(false, 9);
  assert.equal(phone.length, 3);
  assert.match(phone[0].title, /keeper of Clover Village/); assert.match(phone[1].body, /fly to \{n\} planets/); assert.equal(phone[1].params!.n, 9);
  assert.match(phone[2].body, /^Tap a garden bed/); assert.match(pc[2].body, /^Click a garden bed/);
  for (const c of [...phone, pc[2]]) assert.ok(c.body.length <= 72, `two lines at most on a phone: ${c.body}`);
});

test('one goal at a time: the bounty and challenge trackers wait until the first creature is defeated or level 3', () => {
  const s = fresh(); assert.ok(oneGoal(s));
  s.counters.kills = 1; assert.equal(oneGoal(s), false, 'the first fight is won');
  const t = fresh(); t.level = CALM_UNTIL_LEVEL; assert.equal(oneGoal(t), false, 'or level 3');
  assert.equal(oneGoal(M.newGame()), false, 'older saves: unchanged');
  const main = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
  assert.match(main, /const one=oneGoal\(state\),bounty=one\?undefined:progressEntries\(state,'bounties'\)\[0\]/);
  assert.match(main, /const chal=one\?null:challenges\.view\(\)/);
});

test('Chapter 1 of a new save points the way by itself; later chapters and older saves do not', () => {
  const s = fresh(); assert.ok(chapterOneGuide(s));
  s.progression.story.index = STORY_STEPS.findIndex(step => step.chapter === 1); assert.equal(chapterOneGuide(s), false);
  assert.equal(chapterOneGuide(M.newGame()), false);
});

test('moment tips: once each, the most urgent first, with the words of the device', () => {
  const none: TipFacts = { touch: true, emptyBed: null, ripeBed: null, creature: null, drop: null, equip: false }, at = { x: 1, y: 1, z: 1 };
  const s = fresh();
  assert.equal(pickTip(s, none), null);
  assert.equal(pickTip(s, { ...none, emptyBed: at })!.text, 'Tap the garden bed to plant');
  assert.equal(pickTip(s, { ...none, touch: false, emptyBed: at })!.text, 'Click the garden bed or press F to plant');
  assert.equal(pickTip(s, { ...none, emptyBed: at, creature: at })!.id, 'tip:fight', 'a creature close by comes first');
  assert.equal(pickTip(s, { ...none, touch: false, creature: at })!.text, 'Press F or click it to attack');
  assert.equal(pickTip(s, { ...none, creature: at })!.text, 'Tap Attack to fight it');
  assert.equal(pickTip(s, { ...none, ripeBed: at })!.id, 'tip:harvest');
  assert.equal(pickTip(s, { ...none, equip: true })!.at, 'bag');
  markSeen(s, 'tip:plant'); assert.equal(pickTip(s, { ...none, emptyBed: at }), null, 'seen: never again');
  assert.equal(pickTip(s, { ...none, emptyBed: at }, 'tip:plant')!.id, 'tip:plant', 'the one already up stays while its moment lasts');
  const k = fresh(); k.counters.kills = 1; assert.equal(pickTip(k, { ...none, creature: at }), null, 'no fight tip once a creature fell');
  assert.equal(pickTip(M.newGame(), { ...none, emptyBed: at }), null, 'older saves: no tips');
});

test("Pepper's gift is the first harvest's reward: once, through the harvest action, never twice and never lost", () => {
  const s = fresh(); assert.equal(s.welcome, 'pending');
  const ripe = ripen(s); assert.equal(s.energy, 0); assert.equal(F.friendOf(s, 'pepper'), undefined, 'she comes with the first harvest');
  act(s, 'harvest', { index: 0 }, ripe);
  assert.equal(s.welcome, 'done'); assert.equal(s.energy, F.WELCOME_ENERGY); assert.ok(F.friendOf(s, 'pepper')?.home);
  const again = ripen(s, ripe + 1); act(s, 'harvest', { index: 0 }, again);
  assert.equal(s.energy, F.WELCOME_ENERGY + 0, 'never twice'); assert.equal(F.friendsOf(s).filter(f => f.id === 'pepper').length, 1);
  // harvestAll gives it too.
  const b = fresh(), at = ripen(b); act(b, 'harvestAll', {}, at); assert.equal(b.energy, F.WELCOME_ENERGY);
});

test('migration: a save that already decided keeps its state; one that never answered gets the gift on its next harvest', () => {
  const took = fresh(); act(took, 'welcomeStart', { take: true }); const t1 = ripen(took); act(took, 'harvest', { index: 0 }, t1);
  assert.equal(took.energy, F.WELCOME_ENERGY, 'took it before: nothing more');
  const passed = fresh(); act(passed, 'welcomeStart', { take: false }); const t2 = ripen(passed); act(passed, 'harvest', { index: 0 }, t2);
  assert.equal(passed.energy, 0, 'said no thanks before: that choice stands');
  const pending = M.parseSave(JSON.stringify({ ...M.newGame('Old'), welcome: 'pending', firstRun: undefined }))!; pending.bag.seed_radish = 1;
  pending.counters.harvests = 12; // an older save that closed the old offer without answering
  const t3 = ripen(pending); act(pending, 'harvest', { index: 0 }, t3);
  assert.equal(pending.welcome, 'done'); assert.equal(pending.energy, F.WELCOME_ENERGY, 'nobody loses it');
  const early = fresh(); assert.equal(F.firstHarvestGift(early, T0), false, 'no harvest yet: nothing');
  const actions = readFileSync(new URL('../src/actions.ts', import.meta.url), 'utf8');
  assert.equal(actions.match(/Friends\.firstHarvestGift\(state, now\)/g)!.length, 2, "only the explorer's own harvest and harvestAll: helpers' harvests do not count");
});

test('every new start string has its Vietnamese', () => {
  const files = ['welcome-cards.ts', 'moment-tips.ts'].map(f => readFileSync(new URL(`../src/${f}`, import.meta.url), 'utf8'));
  const strings = new Set<string>();
  for (const src of files) for (const m of src.matchAll(/(?:title|body|text): (?:touch \? |f\.touch \? )?'([^']+)'(?: : '([^']+)')?/g)) { strings.add(m[1]); if (m[2]) strings.add(m[2]); }
  for (const src of files) for (const m of src.matchAll(/\Wt\('([^']+)'/g)) strings.add(m[1]);
  strings.add("You're the new keeper of Clover Village"); strings.add("Let's grow!");
  assert.ok(strings.size >= 20, `found ${strings.size}`);
  for (const en of strings) assert.ok(VI_PACK[en] && VI_PACK[en] !== en, en);
  for (const [en, vi] of Object.entries(FIRST_VI)) assert.equal(VI_PACK[en], vi, en);
});
