// Elite roles on the normal planets (src/elite-roles.ts, elite-world.ts, elite-rewards.ts; docs/ELITE-ROLES.md).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as M from '../src/model.ts';
import { ELITE_PARTS, ELITE_ROLES, HEAVY_SOURCES, PROJECTILE_SOURCES, SHIELD, SPLIT, barrierHit, eliteAssignments, eliteBadge, newBarrier, splitChildren, stepBarrier, type HitSource } from '../src/elite-roles.ts';
import { dressWorld, eliteIncoming, makeElite, retireChildren, splitWorld, type EliteFields } from '../src/elite-world.ts';
import { eliteDefeat } from '../src/elite-rewards.ts';
import { enemyRoster } from '../src/enemy-roster.ts';
import { ENEMY_TYPES, PLANET_SPAWNS } from '../src/enemy-types.ts';
import { CombatSimulation, type CombatHit, type CombatTarget } from '../src/combat.ts';
import { safeRadius } from '../src/safe-zone.ts';
import { powerShape } from '../src/power-rules.ts';
import { VI_PACK } from '../src/locales/vi-pack.ts';
import { ELITE_VI, ELITE_HELP_VI } from '../src/locales/vi-elite.ts';
import { HELP_TOPICS } from '../src/help-topics.ts';

test('roles: about one in six of the chosen species, from the roster order alone, never bosses or dormant slots', () => {
  for (const role of Object.values(ELITE_ROLES)) {
    const roster = enemyRoster(role.planet as M.PlanetId), mine = roster.filter(e => e.type === role.species && !e.dormant), elites = mine.filter(e => e.elite === role.id);
    const count = (PLANET_SPAWNS[role.planet as M.PlanetId] ?? []).find(([t]) => t === role.species)![1];
    assert.equal(elites.length, Math.round(count * role.share), role.id);
    assert.ok(elites.length >= 1 && elites.length / count > .1 && elites.length / count < .25, role.id);
    assert.ok(roster.every(e => !e.elite || e.elite === 'mini' || (!e.boss && e.type === role.species) || e.type !== role.species));
    // The same twice, and the same as the browser's own build would choose.
    assert.deepEqual(enemyRoster(role.planet as M.PlanetId).map(e => e.elite ?? ''), roster.map(e => e.elite ?? ''));
    assert.deepEqual([...eliteAssignments(role.planet, roster.filter(e => e.elite !== 'mini').map(e => ({ type: e.type, boss: e.boss, dormant: e.dormant })))].map(([i]) => roster[i].id), elites.map(e => e.id));
  }
  // Only the two planets have elites; the others keep their rosters exactly.
  for (const planet of ['home', 'ice', 'lava', 'toy', 'jungle', 'cloud', 'shadow'] as M.PlanetId[]) assert.ok(enemyRoster(planet).every(e => !e.elite), planet);
  assert.equal(ELITE_ROLES.splitter.planet, 'candy'); assert.equal(ELITE_ROLES.shielded.planet, 'ocean');
});

test('an elite is stronger, larger and pays more; a child is small; the splitter planet keeps SPLIT.cap dormant child slots, appended last', () => {
  const roster = enemyRoster('candy'), plain = roster.find(e => e.type === 'jelly' && !e.elite)!, elite = roster.find(e => e.elite === 'splitter')!, kids = roster.filter(e => e.elite === 'mini');
  assert.equal(elite.baseMaxHp, Math.round(plain.baseMaxHp * ELITE_ROLES.splitter.hp)); assert.equal(elite.xp, Math.round(plain.xp * ELITE_ROLES.splitter.xp));
  assert.ok(elite.radius > plain.radius && elite.baseDamage > plain.baseDamage);
  assert.equal(kids.length, SPLIT.cap); assert.ok(kids.every(k => k.dormant && k.respawn === 999999 && k.type === 'jelly'));
  assert.deepEqual(kids.map(k => k.index), roster.slice(-SPLIT.cap).map(k => k.index), 'appended after everything else, so older ids keep their place');
  assert.equal(kids[0].baseMaxHp, Math.round(plain.baseMaxHp * ELITE_ROLES.splitter.hp * SPLIT.hp));
  assert.equal(kids[0].xp, Math.max(1, Math.round(plain.xp * SPLIT.xp)));
  // The ocean has no children (no splitter there), and the older creatures keep their ids on both planets.
  assert.equal(enemyRoster('ocean').filter(e => e.elite === 'mini').length, 0);
});

test('elites never stand in the landing area: every creature is placed at least 27 m out, the safe zone is 11 m', () => {
  assert.ok(safeRadius('candy') < 27 && safeRadius('ocean') < 27);
  const world = readFileSync(new URL('../src/world.ts', import.meta.url), 'utf8');
  assert.match(world, /d=boss\?100\+rng\(\)\*24:27\+rng\(\)\*97/, 'creatures are placed 27 m or more from the centre');
});

/** A small world: elites made the way the browser makes them. */
function creatures(planet: string) {
  const list: (EliteFields & { phase?: string })[] = []; let n = 0;
  const spawn = (type: string, index = list.length) => { const d = ENEMY_TYPES[type]; const e: EliteFields = { id: `${planet}:enemy:${index}`, name: d.name, type, hp: d.hp, maxHp: d.hp, baseMaxHp: d.hp, damage: d.damage, baseDamage: d.damage, xp: d.xp, radius: d.radius, boss: d.boss, respawn: 0, x: 40 + n, z: 40, homeX: 40 + n, homeZ: 40, definition: d, mesh: { visible: true } }; n++; list.push(e); return e; };
  for (const [type, count] of PLANET_SPAWNS[planet as M.PlanetId] ?? []) for (let i = 0; i < count; i++) spawn(type);
  dressWorld(planet, list, (type, index) => spawn(type, index));
  return list;
}

test('split: two children at 60% size, a share of the health, a little faster; no second level; the cap stops a split', () => {
  const list = creatures('candy'), elite = list.find(e => e.elite === 'splitter')!;
  assert.equal(elite.name, 'Splitting Jelly Jumper');
  elite.hp = 0; const kids = splitWorld(elite, list, (m, x, z) => { m.x = x; m.z = z; });
  assert.equal(kids.length, SPLIT.children);
  for (const k of kids) { assert.equal(k.elite, 'mini'); assert.equal(k.parentId, elite.id); assert.equal(k.depth, 1); assert.equal(k.eliteSize, SPLIT.size); assert.ok(k.hp > 0 && k.hp === k.maxHp); assert.ok(k.definition!.speed > ENEMY_TYPES.jelly.speed); assert.ok(Math.hypot(k.x - elite.x, k.z - elite.z) <= SPLIT.spread + 1e-9); }
  assert.ok(kids[0].maxHp < elite.maxHp * .5 && kids[0].damage < elite.damage);
  // A child does not split again (SPLIT.second is off).
  assert.equal(SPLIT.second, false); kids[0].hp = 0; assert.deepEqual(splitWorld(kids[0], list, () => {}), []);
  // The cap: with fewer than two free slots left the elite dies without splitting.
  const others = list.filter(e => e.elite === 'splitter' && e !== elite);
  for (const e of others) { e.hp = 0; splitWorld(e, list, () => {}); }
  const alive = list.filter(e => e.elite === 'mini' && e.hp > 0).length;
  assert.ok(alive <= SPLIT.cap, 'never more children alive than the cap');
  const late = list.find(e => e.elite === 'splitter' && e.hp <= 0)!; late.hp = 0;
  const free = list.filter(e => e.elite === 'mini' && e.hp <= 0).length;
  assert.equal(splitWorld(late, list, () => {}).length, free >= 2 ? 2 : 0);
  // An ordinary jelly never splits; a child is never chosen for a split slot while alive.
  const plain = list.find(e => e.type === 'jelly' && !e.elite)!; assert.deepEqual(splitWorld(plain, list, () => {}), []);
  assert.deepEqual(splitChildren({ id: 'x', elite: 'splitter', hp: 0, type: 'jelly' }, list.filter(e => e.elite === 'mini' && e.hp > 0)), []);
});

test('the children leave with their parent: when the splitter comes back, its children still out vanish', () => {
  const list = creatures('candy'), elite = list.find(e => e.elite === 'splitter')!; elite.hp = 0;
  const kids = splitWorld(elite, list, () => {}); kids[1].hp = 0;
  elite.hp = elite.maxHp; const gone = retireChildren(elite, list);
  assert.deepEqual(gone.map(k => k.id), [kids[0].id]); assert.ok(kids[0].hp === 0 && kids[0].respawn === 999999 && !kids[0].mesh.visible);
});

test('rewards: an elite counts as one kill of its species with more EXP and an extra loot roll; a child pays its small EXP only', () => {
  const s = M.newGame(); s.planet = 'candy'; const kills = () => s.counters?.kills ?? 0, xp0 = M.totalXp?.(s) ?? s.xp, k0 = kills();
  const rng = () => .01; // every roll lands
  const loot = eliteDefeat(s, 'jelly', 20, 'splitter', rng, false, 1);
  assert.equal(kills(), k0 + 1, 'the elite is one kill');
  const plain = M.rollLoot('jelly', M.activeStats(s).luck, rng, 1); assert.ok(loot.length > plain.length, 'the extra roll');
  const before = kills(), xpBefore = s.xp, levelBefore = s.level; const kid = eliteDefeat(s, 'jelly', 3, 'mini', rng, false, 1);
  assert.equal(kid.length, 0); assert.equal(kills(), before, 'a child does not count for quests, bounties or kill totals');
  assert.ok(s.xp > xpBefore || s.level > levelBefore, 'but pays its EXP'); void xp0;
});

test('shield: shots are deflected to 15%, close hits crack it, three cracks or one heavy hit break it for 6 s with a stun, then it regrows', () => {
  const b = newBarrier();
  for (const source of PROJECTILE_SOURCES) { const r = barrierHit(b, 100, source); assert.equal(r.event, 'deflect'); assert.equal(r.amount, 100 * SHIELD.shot); assert.equal(b.cracks, 0); }
  assert.deepEqual(barrierHit(b, 100, 'melee'), { amount: 100, stun: 0, event: 'crack' }); assert.equal(b.cracks, 1);
  assert.deepEqual(barrierHit(b, 100, 'skill'), { amount: 100, stun: 0, event: 'crack' });
  assert.deepEqual(barrierHit(b, 100, 'melee'), { amount: 100, stun: SHIELD.stun, event: 'break' }); assert.equal(b.open, SHIELD.open);
  assert.deepEqual(barrierHit(b, 100, 'shot'), { amount: 100, stun: 0, event: 'open' }, 'broken: everything hurts in full');
  assert.equal(stepBarrier(b, SHIELD.open - .1), false); assert.equal(stepBarrier(b, .2), true); assert.equal(b.open, 0);
  for (const heavy of HEAVY_SOURCES) { const h = newBarrier(); assert.equal(barrierHit(h, 50, heavy as HitSource).event, 'break', heavy); }
  // Cracks heal after a quiet while.
  const c = newBarrier(); barrierHit(c, 1, 'melee'); stepBarrier(c, SHIELD.heal + .1); assert.equal(c.cracks, 0);
  // A hit with no source (a hazard relay, a remote hit) counts as a close hit; hazards never touch the barrier.
  const e = makeElite({ id: 'ocean:enemy:1', name: 'Stone Crab', type: 'crab', hp: 100, maxHp: 100, damage: 10, xp: 10, radius: .8, boss: false, respawn: 0, x: 0, z: 0, homeX: 0, homeZ: 0, mesh: { visible: true } }, 'shielded');
  assert.equal(e.name, 'Crystal-shell Stone Crab');
  assert.deepEqual(eliteIncoming(e, 40, 0, true, 'shot'), { amount: 40, stun: 0 });
  assert.equal(eliteIncoming(e, 40, 0, false, 'shot').amount, 6);
});

/** A real combat simulation against one creature: the hit sources it reports, and the damage a shielded crab takes from them. */
function arena(weapon: 'sword' | 'fist' | 'gun', pet = false) {
  const crab: CombatTarget & { taken: number; sources: string[]; elite?: string } = { id: 'ocean:enemy:1', x: 0, z: 1.6, radius: .8, hp: 1e6, maxHp: 1e6, taken: 0, sources: [], phase: 'chase' };
  const barrier = newBarrier(); let facing = 0, time = 0;
  const sim = new CombatSimulation({ position: () => ({ x: 0, z: 0 }), facing: () => facing, face: a => { facing = a; }, targets: () => [crab], weapon: () => weapon === 'gun' ? { kind: 'gun', range: 8, shot: 'pea' } : weapon === 'sword' ? { kind: 'sword', range: 2.2 } : { kind: 'fist' },
    stats: () => ({ attack: 100, critChance: 0 }), move: () => {}, effect: () => {},
    hit: (_t: CombatTarget, h: CombatHit) => { crab.sources.push(h.source ?? 'none'); crab.taken += barrierHit(barrier, h.amount, h.source).amount; },
    ...(pet ? { pet: () => ({ x: .5, z: 0, dmg: 1, cd: .5, shot: 'fire' }), focus: () => crab.id } : {}) }, () => .5);
  return { sim, crab, barrier, step: (s: number) => { for (let t = 0; t < s; t += .05) { sim.update(.05, true); time += .05; } }, now: () => time };
}

test('hit sources come from the shared simulation: a gun shot, a sword or fist swing, a skill, a dive, a Quake, a power strike, a pet shot', () => {
  const gun = arena('gun'); gun.sim.basic(gun.crab); gun.step(.5); assert.deepEqual([...new Set(gun.crab.sources)], ['shot']);
  const sword = arena('sword'); sword.sim.basic(sword.crab); assert.deepEqual(sword.crab.sources, ['melee']);
  const fist = arena('fist'); fist.sim.basic(fist.crab); assert.deepEqual(fist.crab.sources, ['melee']);
  const dive = arena('fist'); dive.sim.dive(1, 2.5, 0, 0, () => false, () => Infinity); assert.deepEqual(dive.crab.sources, ['dive']);
  const quake = arena('fist'); quake.sim.skill(2, 'fist'); quake.step(1); assert.ok(quake.crab.sources.length && quake.crab.sources.every(s => s === 'quake'), 'the old Root Quake');
  const moves = arena('fist'); moves.sim.edge.moves = true; moves.sim.skill(2, 'fist'); moves.step(1); assert.ok(moves.crab.sources.length && moves.crab.sources.every(s => s === 'quake'), 'the Quake move');
  const rush = arena('fist'); rush.sim.skill(1, 'fist'); rush.step(1); assert.ok(rush.crab.sources.length && rush.crab.sources.every(s => s === 'skill'), 'Breeze Step is a skill');
  const power = arena('sword'); power.sim.powerStrike(powerShape('sword', false), 1); power.step(1); assert.ok(power.crab.sources.includes('power'));
  const pet = arena('fist', true); pet.step(3); assert.ok(pet.crab.sources.length > 0 && pet.crab.sources.every(s => s === 'pet'), 'a pet shot');
});

test('pets against the shield: their shots are deflected; a gun player loses most damage until the shell breaks; a sword player loses none', () => {
  const pet = arena('fist', true); pet.step(3); assert.equal(pet.barrier.cracks, 0); assert.ok(pet.crab.taken > 0 && pet.crab.taken < pet.crab.sources.length * 100 * SHIELD.shot * 1.3);
  const sword = arena('sword'); let raw = 0; for (let i = 0; i < 6; i++) { sword.sim.basic(sword.crab); sword.step(.6); } raw = sword.crab.sources.length;
  assert.ok(raw > 0 && sword.crab.taken >= raw * 100 * .89, 'every swing in full');
});

test('the parts the view draws are in the kit file, each small', () => {
  const glb = readFileSync(new URL('../public/assets/models/elite.glb', import.meta.url)); assert.ok(glb.length < 80_000);
  // The glTF JSON chunk: each named mesh and its triangles (indexed: indices / 3, else positions / 3).
  const json = JSON.parse(glb.subarray(20, 20 + glb.readUInt32LE(12)).toString('utf8'));
  const tris = new Map<string, number>(json.nodes.filter((n: { mesh?: number }) => n.mesh !== undefined).map((n: { name: string; mesh: number }) => [n.name,
    json.meshes[n.mesh].primitives.reduce((a: number, p: { indices?: number; attributes: { POSITION: number } }) => a + json.accessors[p.indices ?? p.attributes.POSITION].count / 3, 0)]));
  for (const name of [ELITE_PARTS.barrier, ELITE_PARTS.cores, ...ELITE_PARTS.cracks]) { assert.ok(tris.has(name), name + ' in the glb'); assert.ok(tris.get(name)! <= 300, `${name}: ${tris.get(name)} triangles`); }
});

test('strings: every elite line reads in Vietnamese; the Help topic is there in both languages', () => {
  const lines = [...Object.values(ELITE_ROLES).flatMap(r => [r.tag, r.hint, r.toast, r.name.replace('{name}', ENEMY_TYPES[r.species].name)]), eliteBadge('mini')!.tag, eliteBadge('mini')!.hint, 'Little Jelly Jumper', '🛡️ Deflected', 'Shell broken!', 'Split!'];
  for (const en of lines) { assert.ok(VI_PACK[en], en); assert.notEqual(VI_PACK[en], en); assert.equal(VI_PACK[en], ELITE_VI[en]); }
  const topic = HELP_TOPICS.find(([, title]) => title === 'Elite creatures')!; assert.ok(topic);
  assert.equal(VI_PACK[topic[1]], ELITE_HELP_VI[0]); assert.equal(VI_PACK[topic[2]], ELITE_HELP_VI[1]);
  assert.deepEqual(ELITE_HELP_VI[1].match(/\d+/g), topic[2].match(/\d+/g), 'the same numbers in both languages');
});
