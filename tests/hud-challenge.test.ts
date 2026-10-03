// The timed bonus line (hud-challenge.ts), player-only challenge credit (progression asHelper, helper.ts, combat pet shots),
// and the desktop keyboard guide (hud-keys.ts).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as M from '../src/model.ts';
import * as P from '../src/progression.ts';
import * as Helper from '../src/helper.ts';
import { ChallengeDirector, challengeView } from '../src/hud-challenge.ts';
import { keysGuideHtml, readGuide, guideFolded, KeysGuide, KEYS_LEARNED, KEYS_GUIDE_KEY } from '../src/hud-keys.ts';
import { CombatSimulation } from '../src/combat.ts';
import { setLanguage } from '../src/i18n.ts';

const start = Date.UTC(2026, 9, 3, 12);
const ALL = { kill: true, skill: true, harvest: true, fish: true, boss: false };
const NONE = { kill: false, skill: false, harvest: false, fish: false, boss: false };
const settle = () => new Promise(r => setTimeout(r, 0));

function director(s: M.SaveState, clock: { now: number }, chances = ALL, active = () => true) {
  const toasts: string[] = [];
  const d = new ChallengeDirector({
    state: () => s, active, chances: () => chances,
    start: async type => P.startChallenge(s, type, clock.now),
    claim: async id => P.claimProgress(s, 'challenges', id, clock.now),
    toast: text => { toasts.push(text); },
  }, () => 0);
  return { d, toasts };
}

test('reference rules: boss first, otherwise a fitting type; 70-170 s first, 100-200 after a win, 120-220 after a timeout', () => {
  assert.equal(P.pickChallenge({ ...ALL, boss: true }, () => .99), 'boss');
  assert.equal(P.pickChallenge(NONE), null);
  assert.equal(P.pickChallenge({ ...NONE, fish: true }, () => .5), 'fish');
  assert.deepEqual(['start', 'won', 'failed'].map(k => [P.nextChallengeDelay(k as 'start', () => 0), P.nextChallengeDelay(k as 'start', () => 1)]), [[70, 170], [100, 200], [120, 220]]);
  assert.deepEqual(['kill', 'skill', 'harvest', 'fish', 'boss'].map(P.challengeSeconds), [75, 45, 100, 120, 150]);
});

test('a surprise challenge starts on its timer, wins the moment it is done and pays a streak-scaled reward', async () => {
  const s = M.newGame(); s.level = 5; const clock = { now: start }, { d, toasts } = director(s, clock);
  d.tick(69, clock.now); await settle(); assert.equal(s.progression.challenge, null, 'not before the first delay (70 s with rng 0)');
  d.tick(2, clock.now); await settle();
  const c = s.progression.challenge!; assert.equal(c.type, 'kill'); assert.equal(c.target, 4); assert.equal(c.ends, start + 75000);
  assert.match(toasts.at(-1)!, /Surprise challenge! Defeat creatures ×4 in 75 seconds/);
  const v = challengeView(s, start + 30000)!; assert.equal(v.left, 45); assert.equal(v.task, 'Defeat creatures · 0/4'); assert.ok(Math.abs(v.fraction - .6) < 1e-9); assert.equal(v.chip, '⏱️ 45s 0/4');
  const energy = s.energy; clock.now = start + 40000;
  P.recordEvent(s, 'kill', 4, 'mushroom', clock.now); d.tick(.1, clock.now); await settle();
  assert.equal(s.progression.challenge!.claimed, true, 'no Collect step: it is won at once');
  assert.equal(s.energy - energy, 15 + 5 * 4, 'reward (15 + 4 x level) x streak multiplier 1'); assert.equal(s.progression.streak, 1);
  assert.match(toasts.at(-1)!, /^Challenge won! 35 energy/);
  assert.equal(challengeView(s, clock.now, d.wonReward)!.won, true, 'the line shows the win for a moment');
  assert.equal(d.next, 100, 'the next one comes 100-200 s after a win');
  d.tick(.1, clock.now + 5000); await settle(); assert.equal(d.view(clock.now + 5000), null, 'then the line hides');
});

test('a timeout clears the challenge, breaks the streak, says so and waits 120-220 s', async () => {
  const s = M.newGame(); s.level = 3; s.progression.streak = 2; const clock = { now: start }, { d, toasts } = director(s, clock);
  d.next = 0; d.tick(.1, clock.now); await settle(); assert.equal(s.progression.challenge?.type, 'kill');
  d.tick(.1, clock.now); P.recordEvent(s, 'kill', 1, 'mushroom', clock.now + 1000);
  clock.now = start + 76000; P.refreshProgress(s, clock.now); d.tick(.1, clock.now); await settle();
  assert.equal(s.progression.challenge, null); assert.equal(s.progression.streak, 0); assert.equal(d.next, 120);
  assert.match(toasts.at(-1)!, /Time's up/);
});

test('no challenge below level 2, while inactive (indoors, dialogs, visiting), or when nothing fits', async () => {
  const s = M.newGame(); const clock = { now: start };
  let { d } = director(s, clock); d.next = 0; d.tick(1, clock.now); await settle(); assert.equal(s.progression.challenge, null);
  s.level = 2; ({ d } = director(s, clock, ALL, () => false)); d.next = 0; d.tick(1, clock.now); await settle(); assert.equal(s.progression.challenge, null);
  ({ d } = director(s, clock, NONE)); d.next = 0; d.tick(1, clock.now); await settle(); assert.equal(s.progression.challenge, null); assert.equal(d.next, 20, 'looks again in 20 s');
});

test('a completed challenge is not lost to the clock before it is paid', () => {
  const s = M.newGame(); s.level = 2; P.startChallenge(s, 'skill', start); P.recordEvent(s, 'skill', 8, undefined, start + 1000);
  P.refreshProgress(s, start + 60000); assert.ok(s.progression.challenge && !s.progression.challenge.claimed, 'still there to be won');
});

test('only the player earns timed-challenge progress: the garden helper and the pet do not', () => {
  const s = M.newGame(); s.level = 2; P.startChallenge(s, 'harvest', start);
  s.helper = { ...M.newHelper(), owned: true } as typeof s.helper;
  const now = start + 1000; s.plots[0].crop = 'carrot'; s.plots[0].plantedAt = 0; s.plots[0].growDuration = 1;
  const before = s.progression.totals.harvest ?? 0;
  assert.ok(Helper.helperHarvest(s, 0, now), 'the helper harvests');
  assert.equal(s.progression.challenge!.progress, 0, 'the helper\'s harvest is not the player\'s');
  assert.equal((s.progression.totals.harvest ?? 0) - before, 1, 'it still counts for the journal and achievements');
  s.plots[1].crop = 'carrot'; s.plots[1].plantedAt = 0; s.plots[1].growDuration = 1; M.harvest(s, 1, now);
  assert.equal(s.progression.challenge!.progress, 1, 'the player\'s own harvest counts');
  assert.equal(P.asHelper(() => 7), 7);
  // A pet's projectile is tagged so main.ts grants its kill under asHelper.
  const hits: { helper?: boolean }[] = [], target = { id: 'a', x: 0, z: 3, hp: 50, radius: .6 };
  const sim = new CombatSimulation({ position: () => ({ x: 0, z: 0 }), facing: () => 0, face() {}, moving: () => false, skillLevel: () => 1, targets: () => [target], weapon: () => ({ kind: 'melee', attack: 1 }) as never, stats: () => ({ attack: 10, critChance: 0 }) as never, move() {}, hit: (_t, h) => { hits.push(h); }, effect() {}, pet: () => ({ x: 0, z: 0, dmg: 1, cd: 1 }) } as never);
  for (let i = 0; i < 20; i++) sim.update(.05, true);
  assert.ok(hits.length > 0 && hits.every(h => h.helper === true), 'pet shots carry helper: true');
});

test('the keyboard guide shows the layout chosen in Settings and folds itself after the keys are learned', () => {
  const classic = keysGuideHtml('classic', false), wasd = keysGuideHtml('wasd', false);
  for (const k of ['Q', 'W', 'E', 'R', '↑', 'Space', 'F', 'J', 'I', 'H', 'M']) assert.ok(classic.includes(`<kbd>${k}</kbd>`), `classic shows ${k}`);
  for (const k of ['W', 'A', 'S', 'D', 'J', 'K', 'L', ';', 'P']) assert.ok(wasd.includes(`<kbd>${k}</kbd>`), `WASD shows ${k}`);
  assert.ok(!wasd.includes('↑'));
  assert.ok(!keysGuideHtml('classic', true).includes('<dl>'), 'folded it is just the ⌨️ chip');
  const store = new Map<string, string>(), storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => { store.set(k, v); } } as Storage;
  const root = { innerHTML: '', classList: { toggle() {} } } as unknown as HTMLElement;
  const g = new KeysGuide(root, storage); assert.equal(guideFolded(g.memory), false, 'open for a new player');
  for (let i = 0; i < KEYS_LEARNED; i++) g.used();
  assert.equal(guideFolded(readGuide(storage)), true, 'folded once the keys are learned, remembered on this device');
  g.toggle(); assert.equal(readGuide(storage).mode, 'open', 'reopening by hand sticks'); for (let i = 0; i < 50; i++) g.used(); assert.equal(guideFolded(g.memory), false);
  g.toggle(); assert.equal(guideFolded(readGuide(storage)), true);
  assert.deepEqual(readGuide({ getItem: () => '{bad' }), { mode: 'auto', uses: 0 }); assert.equal(KEYS_GUIDE_KEY, 'zoo-garden-keys-guide');
});

test('the bonus line and the keyboard guide are fully Vietnamese', () => {
  setLanguage('vi');
  try {
    const s = M.newGame(); s.level = 4; P.startChallenge(s, 'harvest', start);
    const v = challengeView(s, start + 1000)!; assert.match(v.title, /Thử thách nhanh · 99 giây/); assert.doesNotMatch(v.task, /Harvest/);
    assert.deepEqual(challengeView(s, start, 'x'), challengeView(s, start), 'the win card only shows for a claimed challenge');
    const html = keysGuideHtml('classic', false).replace(/<kbd>[^<]*<\/kbd>/g, '');
    for (const word of ['Move', 'Basic attack', 'Skills', 'Interact', 'Journal', 'Backpack', 'Eat', 'Map', 'Keyboard', 'Hide']) assert.ok(!html.includes(word), `${word} is translated`);
  } finally { setLanguage('en'); }
});
