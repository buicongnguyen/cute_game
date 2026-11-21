// The first minutes of a new save (src/first-run.ts, src/fold-lists.ts; docs/FIX-PLAN.md 4.2 to 4.5).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as M from '../src/model.ts';
import { applyGameAction } from '../src/actions.ts';
import { freshStart, SPOT_CLEAR, SPOT_APART, SPOT_HUB, critterSpots, isFirstSeen, markSeen, hasSeen, CALM_UNTIL_LEVEL, CRITTER, CRITTERS, TUTORIAL_GROW_MS, TUTORIAL_PLANTS, calmHud, nearestCritter, parseFirstRun, tendCritters, tutorialFightStep, tutorialPreview, type CritterWorld } from '../src/first-run.ts';
import { FIRST_VI } from '../src/locales/vi-first.ts';
import { VI_PACK } from '../src/locales/vi-pack.ts';
import { STORY_STEPS } from '../src/content.ts';
import { PEN } from '../src/farm.ts';
import { ZONE_DIFFICULTY, zoneInfo } from '../src/hud-combat.ts';
import { ENEMY_TYPES } from '../src/enemy-types.ts';
import { DANGER_LEVELS, DANGER_SIGN, dangerChip, CRITTER_NAME, LESSON, WARN, WILDS, biteAllowed, createLesson, wildAhead, ownBlow, firstWinNow, ringBites, inRing } from '../src/features/tutorial-fight.ts';
import TUTORIAL_VI from '../src/features-vi/tutorial.ts';

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
    assert.equal(e.type, 'mushroom');
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

// ---- the first fight (AAA-PLAN WP17) ----
/** The village as world.ts builds it: every thing it adds at home with fixed numbers, the pen, the home pond and the starting beds. */
function village() {
  const src = readFileSync(new URL('../src/world.ts', import.meta.url), 'utf8'), home = src.slice(src.indexOf("if(planet==='home'){"), src.indexOf('for(let i=0;i<54;i++)'));
  const entities = [...home.matchAll(/addEntity\('([\w-]+)','[^']*','[^']*',[^;]*?,(-?[\d.]+),(-?[\d.]+),(-?[\d.]+)\)/g)].map(m => ({ kind: m[1], x: +m[2], z: +m[3] }));
  const obstacles = [...home.matchAll(/this\.obstacle\((-?[\d.]+),(-?[\d.]+),(-?[\d.]+)\)/g)].map(m => ({ x: +m[1], z: +m[2], r: +m[3] }));
  const s = fresh(); for (let i = 0; i < s.plots.length; i++) entities.push({ kind: 'plot', ...M.bedPosition(s, i) });
  entities.push({ kind: 'pen', x: PEN.x, z: PEN.z }, { kind: 'fish', x: -7.5, z: 11.2 });
  return { entities, obstacles };
}
const USED_BY_ATTACK = ['shop', 'craft', 'pen', 'chest', 'sell', 'home', 'well'];
test('on the real village two creatures of the first fight wait 7 m from every thing, and the third as far as the village has room (5.5 m or more)', () => {
  const w = village(), far = (p: { x: number; z: number }, kinds?: string[]) => Math.min(...w.entities.filter(e => !kinds || kinds.includes(e.kind)).map(e => Math.hypot(e.x - p.x, e.z - p.z)));
  for (const kind of [...USED_BY_ATTACK, 'cook', 'upgrade', 'travel', 'plot', 'fish']) assert.ok(w.entities.some(e => e.kind === kind), `the village has a ${kind}`);
  const spots = critterSpots(w); assert.equal(spots.length, CRITTERS);
  for (const [i, p] of spots.entries()) {
    assert.ok(far(p, USED_BY_ATTACK) >= (i < 2 ? SPOT_CLEAR : 5.5), `spot ${i}: ${far(p, USED_BY_ATTACK).toFixed(1)} m from the nearest of the shop, workshop, pen, chest, market, cottage and well`);
    assert.ok(far(p) >= 5.5, `spot ${i}: ${far(p).toFixed(1)} m from every thing (the kitchen, the crystal, the beds, the pond too)`);
    assert.ok(Math.hypot(p.x, p.z) <= SPOT_HUB, 'inside the fence: no wild creature joins');
    for (const q of spots) assert.ok(q === p || Math.hypot(p.x - q.x, p.z - q.z) >= SPOT_APART);
  }
  assert.ok(spots.filter(p => far(p) >= SPOT_CLEAR).length >= 2, 'two of the three keep 7 m from everything; the crowded village has no third such spot');
  // A village with no room at all gets none (a real one is never this full); one chest beside the garden changes nothing.
  const crowded = { entities: [{ kind: 'plot', x: 0, z: 0 }, ...Array.from({ length: 400 }, (_, i) => ({ kind: 'chest', x: -19 + i % 20 * 2 + 1, z: -19 + Math.floor(i / 20) * 2 + 1 }))], obstacles: [] };
  assert.equal(critterSpots(crowded).length, 0);
  assert.equal(critterSpots({ entities: [{ kind: 'plot', x: 0, z: 0 }, { kind: 'chest', x: 6, z: 0 }], obstacles: [] }).length, CRITTERS);
});

function lessonWorld(kills = 0) {
  const save = { firstRun: {} as { seen?: string[] }, counters: { kills }, hp: 100 }, hero = { x: 0, z: 0 };
  const critter = (id: string, x: number) => ({ id, x, z: 0, hp: 30, damage: 3, tutorial: true, type: 'mushroom', name: 'Grumpy Mushroom', definition: { name: 'Grumpy Mushroom', windup: .45, reach: 1.3, speed: 1.5 } }) as any;
  const enemies = [critter('home:90000', 1), critter('home:90001', 1), critter('home:90002', 1), { id: 'home:7', x: 1, z: 0, hp: 40, damage: 9, definition: { windup: .45, reach: 1.3 } } as any];
  const rules = createLesson({ enemies: () => enemies, hero: () => hero, save: () => save });
  return { save, hero, enemies, rules };
}
test('the first fight: swings wait for the first press, then never again', () => {
  const w = lessonWorld(); w.rules.tend();
  assert.equal(w.rules.swing(true), true, 'the auto-fight, a tap on the creature, the tracker: held');
  assert.equal(w.rules.swing(true), true);
  assert.equal(w.rules.swing(false), false, 'a press of Attack swings');
  assert.equal(w.rules.swing(true), false, 'and from then on everything swings by itself again');
  const blow = lessonWorld(); blow.rules.tend(); blow.rules.release(); assert.equal(blow.rules.swing(true), false, 'a blow that landed (a skill) ends the wait too');
  const won = lessonWorld(1); won.rules.tend(); assert.equal(won.rules.swing(true), false, 'a save with a win (a player past or in the middle of the step) never waits');
  const older = lessonWorld(); delete (older.save as any).firstRun; older.rules.tend(); assert.equal(older.rules.swing(true), false, 'an older save: never');
  const none = lessonWorld(); none.enemies.length = 0; none.rules.tend(); assert.equal(none.rules.swing(true), false, 'no creature of the first fight about: nothing waits (another planet, the step not reached, online)');
  const dead = lessonWorld(); for (const e of dead.enemies) e.hp = 0; dead.rules.tend(); assert.equal(dead.rules.swing(true), false);
});
test('the first fight: only the first creature has the ring, the others never reach; a bite lands only in the ring and never below 60%', () => {
  const w = lessonWorld(), [first, second, third, wild] = w.enemies;
  assert.equal(w.rules.tend(), first);
  assert.deepEqual(first.warn, { r: LESSON.ring, at: 'around', color: LESSON.color }); assert.equal(first.definition.windup, 1); assert.equal(first.definition.reach, LESSON.reach);
  assert.equal(LESSON.ring, 2, 'a radius the telegraph pool already has (boss-patterns.ts CREATURE_TELEGRAPHS: the lava worm)');
  for (const e of [second, third]) { assert.equal(e.warn, undefined); assert.equal(e.definition.reach, 0, 'no wind-up without reach'); assert.equal(e.definition.speed, 1.5); }
  assert.equal(wild.definition.reach, 1.3, 'other creatures are left alone');
  for (const e of [first, second, third]) { assert.equal(e.name, 'Gloomcap nibbler'); assert.equal(e.definition.name, CRITTER_NAME, 'shown as a nibbler'); assert.equal(e.type, 'mushroom', 'the species stays the mushroom'); }
  const once = first.definition; w.rules.tend(); assert.equal(first.definition, once, 'prepared once');
  assert.equal(w.rules.bite(3, first.id, 100), 3, 'in the ring');
  w.hero.x = first.x + LESSON.ring + .1; assert.equal(w.rules.bite(3, first.id, 100), 0, 'stepped out: nothing');
  w.hero.x = 0; assert.equal(w.rules.bite(3, second.id, 100), 0, 'the others never bite');
  assert.equal(w.rules.bite(9, wild.id, 100), 9, 'a wild creature bites as ever'); assert.equal(w.rules.bite(5, undefined, 100), 5, 'and so does a hazard');
  assert.equal(LESSON.floor, .6);
  assert.equal(biteAllowed(3, 100, 100), 3); assert.equal(biteAllowed(3, 62, 100), 2, 'only down to 60'); assert.equal(biteAllowed(3, 60, 100), 0); assert.equal(biteAllowed(3, 40, 100), 0, 'already below: nothing more');
  assert.equal(biteAllowed(60, 130, 130), 52, '60% of 130 is 78'); assert.equal(biteAllowed(3, 78.9, 130), 0, 'never a fraction below');
  for (let i = 0; i < 40; i++) w.save.hp -= w.rules.bite(3, first.id, 100); assert.equal(w.save.hp, 60, 'forty bites in the ring: 60% and no lower');
});
test('a fallen creature of the first fight comes back when its seconds are over, with the explorer standing right there', () => {
  const w = lessonWorld(), [first, second, , wild] = w.enemies, back: string[] = [];
  for (const e of w.enemies) Object.assign(e, { maxHp: e.hp, homeX: 5, homeZ: 6, respawn: 0, mesh: { visible: true }, phase: 'chase' });
  const rules = createLesson({ enemies: () => w.enemies, hero: () => w.hero, save: () => w.save, back: e => back.push(e.id) }); rules.tend();
  Object.assign(first, { hp: 0, respawn: 3, x: 9, z: 9, mesh: { visible: false }, fled: true, fleeT: 1 }); rules.tend();
  assert.equal(first.hp, 0, 'still down while its seconds run'); assert.deepEqual(back, []);
  first.respawn = 0; assert.equal(rules.tend(), first);
  assert.equal(first.hp, 30); assert.deepEqual([first.x, first.z], [5, 6], 'at its own spot'); assert.equal(first.mesh.visible, true); assert.equal(first.phase, 'idle'); assert.equal(first.fled, false); assert.deepEqual(back, [first.id]);
  Object.assign(second, { hp: 0, respawn: 999_999, mesh: { visible: false } }); rules.tend(); assert.equal(second.hp, 0, 'the step is done (first-run.ts sets 999,999 s): it stays down');
  Object.assign(wild, { hp: 0, respawn: 0 }); rules.tend(); assert.equal(wild.hp, 0, 'a wild creature is the world\'s own business');
  // Five wins from three creatures without leaving the village: every one that falls is back for the next.
  let wins = 0; for (let round = 0; round < 5; round++) { const e = w.enemies.find(x => x.tutorial && x.hp > 0)!; assert.ok(e, `round ${round}: a creature to fight`); e.hp = 0; e.respawn = 0; wins++; rules.tend(); }
  assert.equal(wins, 5);
});
test('the two tips of the first fight and the first win are kept in the save like the other moment tips: once', () => {
  for (const id of ['tip:ring', 'tip:chain', 'win'] as const) {
    assert.ok(isFirstSeen(id)); const s = fresh(); assert.equal(hasSeen(s, id), false); assert.ok(markSeen(s, id)); markSeen(s, id);
    assert.deepEqual(M.parseSave(JSON.stringify(s))!.firstRun!.seen, [id], 'saved once, and it survives a reload');
    assert.ok(applyGameAction(fresh(), { type: 'firstRunSeen', payload: { id } }), 'the action the tips use takes it');
  }
  assert.deepEqual(parseFirstRun({ seen: ['tip:ring', 'nonsense'] }), { seen: ['tip:ring'] });
});
test('the first win is the explorer\'s own, once per save: not a pet\'s, a helper\'s or a hazard\'s kill, and never again after a reload', () => {
  const own = { helper: false, source: 'basic' }, save = () => ({ firstRun: {} as { seen?: string[] }, counters: { kills: 0 }, hp: 100 });
  assert.equal(ownBlow(own), true); assert.equal(ownBlow({}), true, 'a plain strike');
  assert.equal(ownBlow({ helper: true }), false); assert.equal(ownBlow({ source: 'pet' }), false); assert.equal(ownBlow({ source: 'summon' }), false); assert.equal(ownBlow(undefined), false, 'a hazard, or a blow settled elsewhere');
  assert.equal(firstWinNow(save(), own), true);
  for (const impact of [{ helper: true }, { source: 'pet' }, { source: 'summon' }, undefined]) assert.equal(firstWinNow(save(), impact), false, JSON.stringify(impact ?? 'no blow'));
  const told = save(); told.firstRun.seen = ['win']; assert.equal(firstWinNow(told, own), false, 'told already: a kill the count missed, then a reload, does not tell it twice');
  const later = save(); later.counters.kills = 1; assert.equal(firstWinNow(later, own), false, 'a save with a defeat counted is past its first win');
  const older = save(); delete (older as { firstRun?: unknown }).firstRun; assert.equal(firstWinNow(older, own), false, 'an older save: never');
  // through the save: marked, stored, reloaded
  const s = fresh(); assert.equal(firstWinNow(s, own), true); assert.ok(applyGameAction(s, { type: 'firstRunSeen', payload: { id: 'win' } }));
  assert.equal(firstWinNow(M.parseSave(JSON.stringify(s))!, own), false);
});
test('the ring bites only when its wind-up ends in a strike, with the explorer still in it, in the village, and no dialog open', () => {
  const ring = (phase: string, hp = 30) => ({ x: 1, z: 0, hp, phase }), hero = { x: 0, z: 0 };
  assert.equal(ringBites(ring('recover'), true, hero, false), true);
  assert.equal(ringBites(ring('recover'), true, hero, true), false, 'a dialog, the cottage or a cut-scene holds the game: no bite');
  assert.equal(ringBites(ring('recover'), false, hero, false), false, 'no wind-up before it');
  assert.equal(ringBites(ring('chase'), true, hero, false), false, 'the wind-up was cut short (a flinch, a stun): no bite');
  assert.equal(ringBites(ring('recover', 0), true, hero, false), false, 'it fell first');
  assert.equal(ringBites(ring('recover'), true, { x: 1 + LESSON.ring + .01, z: 0 }, false), false, 'stepped out of the ring');
  assert.equal(ringBites({ x: 19, z: 0, hp: 30, phase: 'recover' }, true, { x: 18.5, z: 0 }, false), false, 'outside the village world.ts lands the blow itself: not twice');
  assert.equal(inRing({ x: 0, z: 0 }, { x: LESSON.ring, z: 0 }), true, 'the rim is in'); assert.equal(inRing({ x: 0, z: 0 }, { x: 1.5, z: 1.5 }), false);
});
test('edges: the bite floor and the warning before the fence', () => {
  assert.equal(biteAllowed(3, 61, 100), 1); assert.equal(biteAllowed(3, 60.9, 100), 0, 'less than a whole point of room'); assert.equal(biteAllowed(0, 100, 100), 0);
  assert.equal(biteAllowed(3, 100, 101), 3, '60% of 101 rounds up to 61'); assert.equal(biteAllowed(50, 100, 101), 39);
  assert.equal(wildAhead(WARN.from, 0, 1), 'canyon', 'from 14.5 m'); assert.equal(wildAhead(WARN.from - .01, 0, 1), null); assert.equal(wildAhead(WARN.edge, 0, 1), null, 'at the fence the zone speaks for itself');
  assert.equal(wildAhead(11, 11, 1), null, 'the diagonal belongs to the meadow, which is level 1');
  assert.equal(wildAhead(11.1, 11, 4), 'canyon'); assert.equal(wildAhead(11, -11.1, 1), 'swamp'); assert.equal(wildAhead(0, 0, 1), null);
});
test('the danger chip: a zone 3 or more levels above the explorer says so in words, with a warning sign', () => {
  assert.equal(DANGER_LEVELS, 3); assert.equal(DANGER_SIGN, '⚠️');
  const plain = (source: string, params?: Record<string, string | number>) => source.replace(/\{(\w+)\}/g, (_, key) => String(params?.[key]));
  const boss = ENEMY_TYPES.bear.name, chip = (name: string, planet: string, level: number) => dangerChip(zoneInfo(name, planet).chip, level, plain); // the boss's name comes from the table
  assert.equal(zoneInfo('Redrock Canyon', 'home').chip, `★★★ · Lv 7+ · 👑 ${boss}`, 'the plain chip is as it always was');
  assert.equal(chip('Redrock Canyon', 'home', 2), `⚠️ Lv 7+ Dangerous · 👑 ${boss}`);
  assert.equal(chip('Redrock Canyon', 'home', 4), `⚠️ Lv 7+ Dangerous · 👑 ${boss}`, 'level 4: still 3 below'); assert.equal(chip('Redrock Canyon', 'home', 5), null, 'level 5: the plain chip stays');
  assert.ok(chip('Chomper Swamp', 'home', 1)?.startsWith('⚠️ Lv 4+ Dangerous')); assert.equal(chip('Chomper Swamp', 'home', 2), null);
  assert.equal(chip('Mushroom Forest', 'home', 1), null); assert.equal(chip('Clover Village', 'home', 1), null, "the village's chip is 'Safe'");
  assert.ok(chip('Frost Peaks', 'ice', 7)?.startsWith('⚠️ Lv 10+ Dangerous'), 'planets too'); assert.equal(chip('Frost Peaks', 'ice', 8), null);
  assert.equal(dangerChip(`⚠️ Lv 7+ Dangerous · 👑 ${boss}`, 1, plain), null, 'a chip that already warns is left alone (the observer would loop)');
  assert.equal(dangerChip('★★★ · Cấp 7+ · 👑 Vua Gấu', 2, s => s === 'Lv {level}+ Dangerous' ? 'Cấp {level}+ Nguy hiểm' : s), '⚠️ Cấp {level}+ Nguy hiểm · 👑 Vua Gấu', 'the level is read from the chip in any language; the words come from t()');
});
test('danger ahead: the banner of a zone 3 levels above the explorer shows before the fence, not for a zone within reach', () => {
  for (const [id, [, level]] of Object.entries(WILDS)) assert.equal(level, Math.max(1, ZONE_DIFFICULTY[id] * 3 - 2), `${id}: the level of hud-combat.ts`);
  assert.deepEqual(WARN, { from: 14.5, edge: 18, rearm: 11, levels: 3 });
  assert.equal(wildAhead(15, 2, 2), 'canyon', 'level 2 walking east past the market: Lv 7+');
  assert.equal(wildAhead(14, 2, 2), null, 'not yet'); assert.equal(wildAhead(18.5, 2, 2), null, 'past the fence the zone has its own banner');
  assert.equal(wildAhead(15, 2, 4), 'canyon'); assert.equal(wildAhead(15, 2, 5), null, 'at level 5 the canyon is 2 levels up: no warning');
  assert.equal(wildAhead(0, -15, 1), 'swamp', 'Lv 4+ for a level 1'); assert.equal(wildAhead(0, -15, 2), null);
  assert.equal(wildAhead(-15, 0, 1), null, 'the forest is level 1'); assert.equal(wildAhead(0, 15, 1), null);
});
test('the first fight and the danger chip have their Vietnamese (a lazy table: all of it shows after Start)', () => {
  const vi: Record<string, string> = TUTORIAL_VI;
  for (const en of [CRITTER_NAME, 'Tap Attack!', 'Press F!', 'Step out of the ring!', 'One more for a finisher!', 'Lv {level}+ Dangerous']) assert.ok(vi[en] && vi[en] !== en, en);
  assert.match(vi['Lv {level}+ Dangerous'], /\{level\}/);
  for (const en of Object.keys(vi)) assert.equal(VI_PACK[en], undefined, `${en}: not in the start pack (0 bytes before Start)`);
  const feature = readFileSync(new URL('../src/features/tutorial-fight.ts', import.meta.url), 'utf8');
  for (const m of feature.matchAll(/show\('\w+', (?:s\.touch\(\) \? )?'([^']+)'(?: : '([^']+)')?/g)) for (const en of [m[1], m[2]]) if (en) assert.ok(Object.hasOwn(vi, en), en);
});
test('old saves and the first fight: a save past the step, or one in the middle of it, loads and plays as before', () => {
  for (const file of ['save-new.json', 'save-mid.json', 'save-late.json']) {
    const text = readFileSync(new URL('../promo/' + file, import.meta.url), 'utf8'), s = M.parseSave(text)!;
    assert.deepEqual(M.parseSave(JSON.stringify(s)), s, `${file}: loading it changes nothing`);
    const w = fakeWorld(); assert.equal(tendCritters(w, s, true), tutorialFightStep(s) ? CRITTERS : 0, file);
  }
  // In the middle of the step with wins already: the creatures are there, nothing waits for a press, and the step still counts.
  const mid = fresh(); mid.progression.story.index = KILL_STEP; mid.counters.kills = 3;
  const w = fakeWorld(); assert.equal(tendCritters(w, mid, true), CRITTERS);
  const rules = createLesson({ enemies: () => w.enemies as any, hero: () => ({ x: 0, z: 0 }), save: () => mid }); rules.tend();
  assert.equal(rules.swing(true), false);
  // In the middle of it with no win yet (the step just reached on the old version): one press of Attack and it goes on.
  const zero = fresh(); zero.progression.story.index = KILL_STEP; const z = fakeWorld(); tendCritters(z, zero, true);
  const first = createLesson({ enemies: () => z.enemies as any, hero: () => ({ x: 0, z: 0 }), save: () => zero }); first.tend();
  assert.equal(first.swing(true), true); assert.equal(first.swing(false), false); assert.equal(first.swing(true), false);
});

test('wiring: the HUD tick, the tracker, the panels and the news dock', () => {
  const main = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
  assert.match(main, /applyCalm\(\$\('#hud'\),calmHud\(state,/);
  assert.match(main, /tendCritters\(world as unknown as CritterWorld,state,!actionHandler&&!visiting\)/);
  assert.match(main, /\|\|world\.lesson\?\.swing\(!!e\)\)return;/, 'every swing asks the first fight (absent until the features load)');
  assert.match(main, /if\(world\.lesson&&!\(damage=world\.lesson\.bite\(damage,enemyId,M\.maxHp\(state\)\)\)\)return;/, 'and every blow on the explorer');
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
