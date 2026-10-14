// The first minutes of a new save (src/first-run.ts, src/fold-lists.ts; docs/FIX-PLAN.md 4.2 to 4.5).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as M from '../src/model.ts';
import { applyGameAction } from '../src/actions.ts';
import { freshStart, CALM_UNTIL_LEVEL, CRITTER, CRITTERS, TUTORIAL_GROW_MS, TUTORIAL_PLANTS, calmHud, nearestCritter, parseFirstRun, tendCritters, tutorialFightStep, tutorialPreview, type CritterWorld } from '../src/first-run.ts';
import { FIRST_VI } from '../src/locales/vi-first.ts';
import { VI_PACK } from '../src/locales/vi-pack.ts';
import { STORY_STEPS } from '../src/content.ts';

const fresh = () => { const s = freshStart(M.newGame('Tester')); s.bag.seed_radish = 99; return s; };
const old = () => { const s = M.parseSave(JSON.stringify({ ...M.newGame('Old'), firstRun: undefined }))!; return s; };
const KILL_STEP = STORY_STEPS.findIndex(s => s.event === 'kill');

test('a new player save carries firstRun; an older save loads without it and a saved one round-trips', () => {
  assert.equal(M.newGame().firstRun, undefined, 'model saves (bots, tests) stay plain');
  assert.deepEqual(freshStart(M.newGame()).firstRun, {});
  const reset = M.newGame(); reset.level = 9; assert.ok(applyGameAction(reset, { type: 'reset', payload: {} })); assert.deepEqual(reset.firstRun, {}, 'a reset starts a new adventure with the help');
  assert.match(readFileSync(new URL('../server/server.mjs', import.meta.url), 'utf8'), /firstRun: \{\} \} \};/, 'a new account too');
  assert.equal(old().firstRun, undefined);
  const s = M.newGame(); s.firstRun = { plants: 2, fought: 1 };
  assert.deepEqual(M.parseSave(JSON.stringify(s))!.firstRun, { plants: 2, fought: 1 });
  assert.deepEqual(parseFirstRun({ plants: 99, fought: 2, food: 1 }), { plants: TUTORIAL_PLANTS, food: 1 });
  assert.equal(parseFirstRun('x'), undefined);
});

test('the first three level-1 plantings of a new save grow in 20 s, then never again', () => {
  const s = fresh(), now = 1_000_000;
  assert.equal(M.plantAll(s, 'radish', now), M.STARTING_PLOTS);
  const times = s.plots.map(p => M.cropDuration(p));
  assert.deepEqual(times.slice(0, 3), [TUTORIAL_GROW_MS, TUTORIAL_GROW_MS, TUTORIAL_GROW_MS]);
  assert.ok(times.slice(3).every(t => t > TUTORIAL_GROW_MS), 'the fourth bed on grows at the normal pace');
  assert.ok(M.harvest(s, 0, now + TUTORIAL_GROW_MS));
  assert.ok(M.plant(s, 0, 'radish', now + TUTORIAL_GROW_MS));
  assert.ok(M.cropDuration(s.plots[0]) > TUTORIAL_GROW_MS, 'a replanted bed is not a fourth tutorial planting');
  assert.equal(M.parseSave(JSON.stringify(s))!.firstRun!.plants, TUTORIAL_PLANTS, 'the count is saved: a reload gives no new ones');
});

test('no tutorial crops for older saves, past level 1, after the first story step, or for higher-level crops', () => {
  const o = old(); o.bag.seed_radish = 9; M.plant(o, 0, 'radish', 5);
  assert.ok(M.cropDuration(o.plots[0]) > TUTORIAL_GROW_MS);
  const l2 = fresh(); l2.level = 2; M.plant(l2, 0, 'radish', 5); assert.ok(M.cropDuration(l2.plots[0]) > TUTORIAL_GROW_MS);
  const st = fresh(); st.progression.story.index = 1; M.plant(st, 0, 'radish', 5); assert.ok(M.cropDuration(st.plots[0]) > TUTORIAL_GROW_MS);
  const s = fresh(); assert.equal(tutorialPreview(s, 'radish', 150_000), TUTORIAL_GROW_MS); assert.equal(s.firstRun!.plants, undefined, 'a preview counts nothing');
});

test('calm HUD: hidden fight corner on a new save until the first fight; food shows quick-eat; level 3 and older saves are full', () => {
  const s = fresh(); delete s.bag.seed_radish;
  assert.deepEqual(calmHud(s, { fighting: false, creatureNear: false }), { skills: false, attack: false, eat: false });
  assert.deepEqual(calmHud(s, { fighting: false, creatureNear: true }), { skills: false, attack: true, eat: false });
  assert.deepEqual(calmHud(s, { fighting: true, creatureNear: true }), { skills: true, attack: true, eat: false });
  assert.deepEqual(calmHud(s, { fighting: false, creatureNear: false }), { skills: true, attack: true, eat: false }, 'kept after the fight');
  s.bag.radish = 1; assert.equal(calmHud(s, { fighting: false, creatureNear: false }).eat, true);
  delete s.bag.radish; assert.equal(calmHud(s, { fighting: false, creatureNear: false }).eat, true, 'kept once seen');
  const l3 = fresh(); l3.level = CALM_UNTIL_LEVEL; assert.deepEqual(calmHud(l3, { fighting: false, creatureNear: false }), { skills: true, attack: true, eat: true });
  assert.deepEqual(calmHud(old(), { fighting: false, creatureNear: false }), { skills: true, attack: true, eat: true });
});

function fakeWorld(): CritterWorld & { spawned: number } {
  const w = {
    enemies: [] as any[], entities: [{ kind: 'plot', x: 0, z: 0 }, { kind: 'plot', x: 2, z: 0 }, { kind: 'home', x: 0, z: -10 }], planet: 'home', networkRole: null, interior: null, obstacles: [{ x: 10, z: 0, r: 2 }], spawned: 0,
    spawnSpecies(type: string, x: number, z: number, index: number) { w.spawned++; const e = { type, x, z, homeX: x, homeZ: z, index, hp: 45, maxHp: 45, damage: 6, xp: 8, respawn: 0, mesh: { visible: true }, definition: { speed: 2.4, sight: 8 }, phase: 'idle' }; w.enemies.push(e); return e; },
  };
  return w;
}

test('easy creatures wait beside the garden during the first "defeat" step (solo only) and stay down after', () => {
  const s = fresh(); s.progression.story.index = KILL_STEP; assert.ok(tutorialFightStep(s));
  const w = fakeWorld();
  assert.equal(tendCritters(w, s, false), 0, 'online play: none');
  assert.equal(tendCritters(w, s, true), CRITTERS);
  for (const e of w.enemies) {
    assert.equal(e.hp, CRITTER.hp); assert.equal(e.damage, CRITTER.damage); assert.equal(e.definition.speed, CRITTER.speed);
    const d = Math.hypot(e.x - 1, e.z); assert.ok(d > 8 && d < 13, `beside the garden (${d.toFixed(1)} m)`);
    assert.ok(Math.hypot(e.x - 10, e.z) > 3.5, 'clear of obstacles');
  }
  tendCritters(w, s, true); assert.equal(w.spawned, CRITTERS, 'no extra spawns');
  w.enemies[0].hp = 0; w.enemies[0].respawn = 25; tendCritters(w, s, true); assert.equal(w.enemies[0].respawn, CRITTER.respawn, 'a fallen one comes back soon');
  assert.equal(nearestCritter([{ ...w.enemies[1], tutorial: false, x: 0.5, z: 0 }, w.enemies[2]] as any, 0, 0), w.enemies[2], 'the tracker prefers the tutorial creatures');
  s.progression.story.index = KILL_STEP + 1; tendCritters(w, s, true);
  assert.ok(w.enemies.every(e => e.hp === 0 && e.respawn > 1000 && !e.mesh.visible), 'idle ones leave once the step is done');
  const older = old(); older.progression.story.index = KILL_STEP; assert.equal(tendCritters(fakeWorld(), older, true), 0, 'older saves: none');
});

test('wiring: the HUD tick, the tracker, the panels and the news dock', () => {
  const main = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
  assert.match(main, /applyCalm\(\$\('#hud'\),calmHud\(state,/);
  assert.match(main, /tendCritters\(world as unknown as CritterWorld,state,!actionHandler&&!visiting\)/);
  assert.match(main, /step\.event==='kill'\|\|step\.event==='skill'/);
  assert.match(main, /foldLists\(type,bodyNode\)/);
  assert.match(main, /foldLists\('quests'/);
  assert.match(main, /let state = saved \?\? freshStart\(M\.newGame\(\)\)/);
  assert.match(main, /freshSave:\(\)=>!!state\.firstRun/);
  assert.match(main, /data-action="ranking" title="Ranking" aria-label="Ranking"/);
  const ranking = readFileSync(new URL('../src/ranking.ts', import.meta.url), 'utf8');
  assert.match(ranking, /count\.hidden = true/, 'no unread count on the dock entry');
  const css = readFileSync(new URL('../src/hud-first.css', import.meta.url), 'utf8');
  for (const sel of ['calm-skills .skill', 'calm-attack .attack-pad', 'calm-attack .jump-pad', 'calm-eat .quick-eat', '.fold-hidden']) assert.ok(css.includes(sel), sel);
});

test('every new string has Vietnamese in the pack', () => {
  for (const [en, vi] of Object.entries(FIRST_VI)) { assert.equal(VI_PACK[en], vi, en); assert.ok(vi && vi !== en); }
  const fold = readFileSync(new URL('../src/fold-lists.ts', import.meta.url), 'utf8');
  for (const m of fold.matchAll(/[^\w.]t\('([^']+)'/g)) assert.ok(Object.hasOwn(FIRST_VI, m[1]), m[1]);
});
