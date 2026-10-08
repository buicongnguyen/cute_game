// Summons creatures can fight (combat.ts SUMMON_HP): the ninja's four clones and the snow decoy draw attacks, every
// hittable summon has hit points and pops at 0; the knight's shield bounces shots back; the server shares only checked
// decoys (shareableDecoys). World-level checks use the real World with real Three objects (no WebGL).
import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { CombatSimulation, DZ, DECOY, SUMMON_HP, shareableDecoys, decoyPoint, type CombatEffect, type CombatTarget, type DecoyPose } from '../src/combat.ts';
import { World } from '../src/world.ts';
import { newGame } from '../src/model.ts';
import { EnvironmentSimulation, createEnvironmentLayout } from '../src/environments.ts';
import { makeSummon, summonHealth } from '../src/summon-art.ts';

function arena(targets: CombatTarget[] = [{ id: 'a', x: 0, z: 3, hp: 1e6, maxHp: 1e6, radius: .5, facing: Math.PI }]) {
  const p = { x: 0, z: 0 }, effects: CombatEffect[] = [], hits: { id: string; amount: number }[] = [], statuses: { id: string; kind: string; d: number }[] = [];
  let facing = 0;
  const sim = new CombatSimulation({ position: () => p, facing: () => facing, face: a => { facing = a; }, targets: () => targets, weapon: () => ({ kind: 'fist' }), stats: () => ({ attack: 10, critChance: 0, maxHp: 200 }),
    move: (x, z) => { p.x += x; p.z += z; }, hit: (tg, h) => { hits.push({ id: tg.id, amount: h.amount }); tg.hp -= h.amount; return h.amount; },
    effect: e => effects.push(e), status: (tg, kind, d) => statuses.push({ id: tg.id, kind, d }) }, () => .5);
  const run = (seconds: number) => { for (let i = 0; i < seconds * 40; i++) sim.update(.025); };
  return { sim, p, effects, hits, statuses, targets, run };
}

test('shadow clones: four of them, each with 25% of your health, taunting, still hitting for ×0.5', () => {
  const a = arena(); assert.equal(a.sim.disguise('dz_ninja', 0), true);
  const clones = a.sim.allies.filter(x => x.kind === 'clone');
  assert.equal(clones.length, 4);
  for (const c of clones) { assert.equal(c.maxHp, 50, '25% of 200'); assert.equal(c.hp, 50); assert.ok(Math.hypot(c.x, c.z) <= DECOY.range); }
  const decoys = a.sim.decoys(); assert.equal(decoys.length, 4); assert.ok(decoys.every(d => d.taunt && d.kind === 'clone'));
  a.run(1); assert.ok(a.hits.some(h => h.amount === 5), 'a clone hit is ×0.5 of 10 attack');
  // Casting again replaces the four, never eight.
  a.sim.disguise('dz_ninja', 0); assert.equal(a.sim.allies.filter(x => x.kind === 'clone').length, 4);
});

test('a clone takes the blows aimed at it, pops in a puff at 0 and vanishes when its time runs out', () => {
  const a = arena([]); a.sim.disguise('dz_ninja', 0);
  const [first, second] = a.sim.allies;
  assert.equal(a.sim.hurtAlly(first.id, 20), true); assert.equal(first.hp, 30); assert.ok((first.hurt ?? 0) > 0, 'a short flash after the blow');
  a.effects.length = 0; a.sim.hurtAlly(first.id, 40);
  assert.equal(a.sim.allies.includes(first), false, 'destroyed at 0');
  assert.ok(a.effects.some(e => e.look === 'poof' && Math.abs(e.x - first.x) < 1e-9), 'it pops in a puff where it stood');
  assert.equal(a.sim.hurtAlly(first.id, 5), false, 'a gone clone cannot be hit again');
  a.effects.length = 0; a.run(DZ.clones.life + .1);
  assert.equal(a.sim.allies.length, 0); assert.ok(a.effects.filter(e => e.look === 'poof').length >= 3, 'the rest puff away at the end');
  assert.equal(a.sim.allies.includes(second), false);
});

test('clones stay within DECOY.range m of you while they chase', () => {
  const a = arena([{ id: 'far', x: 0, z: 30, hp: 1e6, maxHp: 1e6, radius: .5 }, { id: 'near', x: 4, z: 0, hp: 1e6, maxHp: 1e6, radius: .5 }]);
  a.sim.disguise('dz_ninja', 0); a.run(3);
  for (const c of a.sim.allies) assert.ok(Math.hypot(c.x - a.p.x, c.z - a.p.z) <= DECOY.range, `clone at ${c.x},${c.z}`);
  assert.ok(a.hits.every(h => h.id === 'near'), 'only the creature near you is chased');
});

test('snow decoy: 60% of your health; broken early it bursts ×2.5 and freezes at once, and never bursts twice', () => {
  const a = arena([{ id: 'a', x: 0, z: 3, hp: 1e6, maxHp: 1e6, radius: .5 }]);
  a.sim.disguise('dz_snowman', 1); const decoy = a.sim.allies.find(x => x.kind === 'snowman')!;
  assert.equal(decoy.maxHp, 120); assert.ok(a.sim.decoys()[0].taunt);
  assert.equal(a.statuses.filter(s => s.kind === 'blind').length, 0, 'creatures go for it rather than losing track');
  a.run(1); assert.equal(a.hits.length, 0);
  a.sim.hurtAlly(decoy.id, 500);
  assert.ok(a.hits.some(h => h.id === 'a' && h.amount === 25), 'burst ×2.5'); assert.ok(a.statuses.some(s => s.kind === 'stun' && s.d === DZ.decoy.freeze));
  const count = a.hits.length; a.run(DZ.decoy.life); assert.equal(a.hits.length, count, 'no second burst at the end of its time');
  // Left alone it bursts when its time runs out.
  const b = arena([{ id: 'a', x: 0, z: 3, hp: 1e6, maxHp: 1e6, radius: .5 }]); b.sim.disguise('dz_snowman', 1); b.run(DZ.decoy.life - .2); assert.equal(b.hits.length, 0); b.run(.4); assert.equal(b.hits.filter(h => h.amount === 25).length, 1);
});

test('summon hit points: binding tree, deck cannon, tesla turret, sandbag wall; the broken wall gives no more cover', () => {
  for (const [id, slot, kind] of [['dz_fairy', 3, 'tree'], ['dz_pirate', 0, 'cannon'], ['dz_mecha', 1, 'turret'], ['dz_army', 1, 'sandbag']] as const) {
    const a = arena([]); a.sim.disguise(id, slot); const s = a.sim.allies.find(x => x.kind === kind)!;
    assert.ok(s, kind); assert.equal(s.maxHp, Math.round(200 * SUMMON_HP[kind].hp), kind); assert.equal(a.sim.decoys()[0].taunt, false, `${kind} is attacked only as the nearest target`);
  }
  const wall = arena([]); wall.sim.disguise('dz_army', 1); assert.equal(wall.sim.defenseBonus, DZ.sandbag.defence);
  const bags = wall.sim.allies[0]; assert.equal(bags.ring, DZ.sandbag.radius);
  wall.sim.hurtAlly(bags.id, 1e4); assert.equal(wall.sim.defenseBonus, 0, 'no cover once the wall falls'); assert.equal(wall.sim.allies.length, 0);
  // Online health from the server lands on the same summon.
  const t = arena([]); t.sim.disguise('dz_fairy', 3); const tree = t.sim.allies[0]; t.sim.setAllyHp(tree.id, 10); assert.equal(tree.hp, 10); t.sim.setAllyHp(tree.id, 0); assert.equal(t.sim.allies.length, 0);
  // The model shows it: a bar over it and a smaller, lower body as it weakens.
  const model = makeSummon('cannon'); summonHealth(model, 'cannon', .3, 0); const bar = model.getObjectByName('hp-bar')!; assert.ok(bar.visible); assert.ok(model.scale.y < 1);
  summonHealth(model, 'cannon', 1, 0); assert.equal(bar.visible, false, 'no bar at full health');
});

test("the knight's shield bounces a shot from in front back at its shooter for ×1.5, not one from behind", () => {
  const front: CombatTarget = { id: 'f', x: 0, z: 6, hp: 1e6, maxHp: 1e6, radius: .5 }, back: CombatTarget = { id: 'b', x: 0, z: -6, hp: 1e6, maxHp: 1e6, radius: .5 };
  const a = arena([front, back]); a.sim.disguise('dz_knight', 0);
  assert.equal(a.sim.reflect(back, .3), false, 'from behind it is not blocked');
  assert.equal(a.sim.reflect(front, .3), true); assert.equal(a.hits.length, 0, 'the ball is still flying home');
  a.run(.35); assert.deepEqual(a.hits.map(h => [h.id, h.amount]), [['f', 15]]);
  a.run(DZ.block.time); assert.equal(a.sim.reflect(front), false, 'the shield is down');
});

test('server checks on shared decoys: at most four, clones within 6 m, inside their lifetime, sane numbers', () => {
  const at = { x: 10, z: 10 }, clone = (id: number, x: number, z: number, life = 5): Partial<DecoyPose> => ({ id, kind: 'clone', x, z, hp: 30, maxHp: 50, life });
  const list = [clone(1, 11, 10), clone(2, 9, 10), clone(3, 10, 12), clone(4, 10, 8), { id: 5, kind: 'snowman', x: 11.5, z: 10, hp: 50, maxHp: 120, life: 3 }, clone(6, 30, 10), clone(7, 10, 11, 99),
    { id: 8, kind: 'dragon', x: 10, z: 10, hp: 5, maxHp: 5, life: 1 }, { id: 9, kind: 'clone', x: NaN, z: 10, hp: 5, maxHp: 5, life: 1 }, { id: 10, kind: 'tree', x: 10, z: 10, hp: 0, maxHp: 5, life: 1 }];
  const shared = shareableDecoys(list, at);
  assert.equal(shared.length, DECOY.max);
  assert.ok(!shared.some(d => d.id === 6), 'a clone 20 m away is not shared'); assert.ok(!shared.some(d => d.id === 7), 'past its lifetime');
  assert.ok(!shared.some(d => [8, 9, 10].includes(d.id)), 'unknown kind, NaN, no hit points');
  assert.ok(shared.every(d => d.taunt), 'decoys first'); assert.ok(shared.some(d => d.id === 5));
  // A hittable summon's strike point: its centre, or the nearest point of the sandbag ring.
  assert.deepEqual(decoyPoint({ x: 0, z: 0, ring: 2.6 }, { x: 10, z: 0 }), { x: 2.6, z: 0 });
});

// ---- The creatures' side (world.ts): who they go for, and who their blows land on.
function world(log: { player: number[]; decoy: [string | null, number, number, string][] }) {
  const w = Object.assign(Object.create(World.prototype), {
    state: newGame(), scene: new T.Scene(), camera: new T.OrthographicCamera(-3, 3, 3, -3, .1, 20),
    root: new T.Group(), player: new T.Group(), companion: new T.Group(), position: new T.Vector3(),
    destination: null, route: [], selected: null, obstacles: [], entities: [], enemies: [], plotMeshes: [], cropSignatures: [],
    particles: [], keys: new Set<string>(), facing: 0, time: 0, planet: 'home', hazardTimer: 0,
    marker: new T.Mesh(), ring: new T.Mesh(), cameraTarget: new T.Vector3(), sun: new T.DirectionalLight(), raycaster: new T.Raycaster(),
    onInteract() {}, onAttackEnemy() {}, onDamage(n: number) { log.player.push(n); }, onZone() {},
  }) as World;
  w.environment = new EnvironmentSimulation(createEnvironmentLayout('home'));
  w.onDecoyDamage = (owner, id, amount, source) => { log.decoy.push([owner, id, amount, source]); };
  return w;
}
const target = (w: World, e: unknown) => (w as unknown as { enemyTarget(e: unknown): { x: number; z: number; decoy?: { owner: string | null; id: number } } | undefined }).enemyTarget(e);
const refresh = (w: World) => (w as unknown as { refreshDecoys(): void }).refreshDecoys();

test('taunt targeting: a creature near a clone goes for the clone, not you; far from it, for you', () => {
  const log = { player: [] as number[], decoy: [] as [string | null, number, number, string][] }, w = world(log);
  w.position.set(40, 0, 0); const wolf = w.spawnSpecies('wolf', 44, 0, 0)!;
  let decoys: DecoyPose[] = [{ id: 7, kind: 'clone', x: 47, z: 0, r: .45, hp: 40, maxHp: 50, taunt: true, life: 5 }];
  w.localDecoys = () => decoys; refresh(w);
  assert.deepEqual(target(w, wolf)?.decoy, { owner: null, id: 7 }, 'the clone 3 m away, even with you 4 m away');
  decoys = [{ id: 7, kind: 'clone', x: 60, z: 0, r: .45, hp: 40, maxHp: 50, taunt: true, life: 5 }]; refresh(w);
  assert.equal(target(w, wolf)?.decoy, undefined, 'a clone 16 m away does not pull it from you');
  // A cannon (no taunt) is attacked only while it is the nearest.
  decoys = [{ id: 3, kind: 'cannon', x: 45, z: 0, r: .7, hp: 40, maxHp: 50, taunt: false, life: 5 }]; refresh(w);
  assert.equal(target(w, wolf)?.decoy?.id, 3);
  decoys = [{ id: 3, kind: 'cannon', x: 50, z: 0, r: .7, hp: 40, maxHp: 50, taunt: false, life: 5 }]; refresh(w);
  assert.equal(target(w, wolf)?.decoy, undefined);
  // Another explorer's decoy, from their pose, counts too.
  decoys = []; w.addRemotePlayer('friend', { x: 52, z: 0, decoys: [{ id: 2, kind: 'snowman', x: 46, z: 1, r: .7, hp: 60, maxHp: 120, taunt: true, life: 4 }] }); refresh(w);
  assert.deepEqual(target(w, wolf)?.decoy, { owner: 'friend', id: 2 });
});

test('damage redirected: the blow, the shot and the area land on the summon, not on you', () => {
  const log = { player: [] as number[], decoy: [] as [string | null, number, number, string][] }, w = world(log);
  w.position.set(40, 0, 0); w.localDecoys = () => [{ id: 7, kind: 'clone', x: 41.5, z: 0, r: .45, hp: 40, maxHp: 50, taunt: true, life: 5 }];
  const wolf = w.spawnSpecies('wolf', 42.5, 0, 0)!; wolf.cooldown = 0;
  for (let i = 0; i < 160; i++) w.update(.025, true, false);
  assert.ok(log.decoy.some(([owner, id, amount, source]) => owner === null && id === 7 && amount > 0 && source === 'melee'), 'the wolf bit the clone');
  assert.deepEqual(log.player, [], 'and never you');
  // A shot flying at you passes the clone first.
  const log2 = { player: [] as number[], decoy: [] as [string | null, number, number, string][] }, w2 = world(log2);
  w2.position.set(40, 0, 0); w2.localDecoys = () => [{ id: 9, kind: 'snowman', x: 43, z: 0, r: .7, hp: 40, maxHp: 50, taunt: true, life: 5 }];
  const mesh = new T.Mesh(new T.SphereGeometry(.17), new T.MeshBasicMaterial()); mesh.position.set(50, 1, 0); w2.scene.add(mesh);
  (w2 as unknown as { enemyShots: unknown[] }).enemyShots = [{ id: 's', ownerId: 'e', mesh, vx: -13, vz: 0, life: 2, damage: 9 }];
  for (let i = 0; i < 60; i++) w2.update(.025, true, false);
  assert.deepEqual(log2.decoy.map(d => [d[1], d[2], d[3]]), [[9, 9, 'shot']]); assert.deepEqual(log2.player, []);
  // An area that covers both hurts both (each once).
  const log3 = { player: [] as number[], decoy: [] as [string | null, number, number, string][] }, w3 = world(log3);
  w3.position.set(40, 0, 0); w3.localDecoys = () => [{ id: 4, kind: 'tree', x: 41, z: 0, r: .8, hp: 40, maxHp: 50, taunt: false, life: 5 }];
  const boss = w3.spawnSpecies('wolf', 42, 1, 0)!; refresh(w3);
  (w3 as unknown as { areaDamage(e: unknown, x: number, z: number, r: number, m: number): void }).areaDamage(boss, 41, 0, 3, 1);
  assert.equal(log3.decoy.length, 1); assert.equal(log3.player.length, 1);
});

test("a shot that meets the knight's raised shield turns round toward its shooter", () => {
  const log = { player: [] as number[], decoy: [] as [string | null, number, number, string][] }, w = world(log);
  w.position.set(40, 0, 0); w.facing = Math.PI / 2; // facing +x
  const shooter = w.spawnSpecies('cactus', 48, 0, 0)!; shooter.stun = 99;
  w.playerBlocks = from => from.x > w.position.x;
  const mesh = new T.Mesh(new T.SphereGeometry(.17), new T.MeshBasicMaterial()); mesh.position.set(46, 1, 0); w.scene.add(mesh);
  const shots = (w as unknown as { enemyShots: { vx: number; targetEnemyId?: string; reflected?: boolean; life: number }[] }).enemyShots = [{ id: 's', ownerId: shooter.id, mesh, vx: -13, vz: 0, life: 2, damage: 9 } as never];
  for (let i = 0; i < 20 && !shots[0]?.reflected; i++) w.update(.025, true, false);
  assert.equal(log.player.length, 1, "the host's rules decide the hit (combat.reflect in main.ts)");
  const shot = shots[0]; assert.ok(shot?.reflected, 'bounced'); assert.ok(shot.vx > 0, 'flying back to +x'); assert.equal(shot.targetEnemyId, shooter.id);
});
