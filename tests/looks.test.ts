import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as T from 'three';
import * as M from '../src/model.ts';
import * as F from '../src/friends.ts';
import { applyGameAction } from '../src/actions.ts';
import { FIT, LOOKS, LOOK_IDS, buyLook, lookOf, ownsLook, parseLooks, wearLook, type LookId } from '../src/looks.ts';
import { GROWTH, earnedStage, friendHeight, friendStage, growUp } from '../src/growth.ts';
import { friendScale, buildFriend } from '../src/friend-view.ts';
import { World, HERO_SCALE, DEFAULT_PIVOTS } from '../src/world.ts';

const DAY = 86_400_000, T0 = 1_000_000_000;
const act = (s: M.SaveState, type: string, payload: Record<string, unknown> = {}, now = T0) => applyGameAction(s, { type, payload }, { now, random: () => .5 });

// ---------------------------------------------------------------- growth
test('friends grow from half to 0.75 to 0.8 of the explorer, by days at home or jobs done, and never shrink', () => {
  const f: F.Friend = { id: 'sprout', role: 'garden', rescuedAt: T0, gear: {}, home: true };
  assert.deepEqual(GROWTH.map(g => g.height), [.5, .75, .8]);
  assert.equal(earnedStage(f, T0), 0);
  assert.equal(earnedStage(f, T0 + DAY - 1), 0); assert.equal(earnedStage(f, T0 + DAY), 1); assert.equal(earnedStage(f, T0 + 3 * DAY), 2);
  assert.equal(earnedStage({ ...f, jobs: 39 }, T0), 0); assert.equal(earnedStage({ ...f, jobs: 40 }, T0), 1); assert.equal(earnedStage({ ...f, jobs: 150 }, T0), 2);
  assert.equal(earnedStage({ ...f, rescuedAt: 0 }, T0 + 9 * DAY), 0, 'an unknown rescue time never counts as days');
  assert.equal(growUp(f, T0 + DAY), true); assert.equal(friendStage(f), 1); assert.equal(growUp(f, T0 + DAY), false, 'the moment fires once');
  f.rescuedAt = T0 + 5 * DAY; assert.equal(growUp(f, T0), false); assert.equal(friendStage(f), 1, 'a grown friend never shrinks');
  assert.equal(friendScale(0), HERO_SCALE * .5); assert.equal(friendScale(1), HERO_SCALE * .75); assert.equal(friendScale(2), HERO_SCALE * .8);
  assert.equal(friendHeight(9), .8);
});

test('every job counts toward growing up, and the catch-up grows a friend who rested at home for days', () => {
  const s = M.newGame(); s.level = 30; s.energy = 1e5; s.planet = M.CAGES.sprout.planet;
  M.grantDefeat(s, M.CAGES.sprout.boss, 1, true, () => .5, false); assert.equal(F.rescue(s, 'sprout', T0), true); s.planet = 'home'; F.arriveHome(s, { x: 0, z: 5 });
  const f = s.friends![0];
  for (let i = 0; i < 40; i++) { const plot = s.plots[0]; plot.crop = 'radish'; plot.plantedAt = T0 - M.CROPS.radish.duration - 1; assert.ok(F.friendWork(s, 'sprout', { kind: 'harvest', index: 0 }, T0)); }
  assert.equal(f.jobs, 40); assert.equal(friendStage(f), 1);
  f.paused = true; F.friendsCatchUp(s, T0 + 3 * DAY); assert.equal(friendStage(f), 2);
});

test('growth survives saving, and saves from before growth migrate from today\'s work', () => {
  const s = M.newGame(); s.friends = [{ id: 'clover', role: 'farm', rescuedAt: T0, gear: {}, home: true, jobs: 77, grown: 1 }];
  const back = M.parseSave(JSON.stringify(s))!; assert.equal(back.friends![0].jobs, 77); assert.equal(back.friends![0].grown, 1);
  const old = JSON.parse(JSON.stringify(s)); delete old.friends[0].jobs; delete old.friends[0].grown; old.friends[0].day = 5; old.friends[0].done = 12;
  const migrated = M.parseSave(JSON.stringify(old))!.friends![0]; assert.equal(migrated.jobs, 12); assert.equal(friendStage(migrated), 0);
  const bad = JSON.parse(JSON.stringify(s)); bad.friends[0].grown = 9; assert.equal(M.parseSave(JSON.stringify(bad))!.friends![0].grown, 2);
});

test('a grown friend is drawn at its stage, and the friend panel shows the stage', async () => {
  for (const stage of [0, 1, 2]) assert.equal(buildFriend('pepper', {}, stage).scale.x, friendScale(stage));
  const { growthLine } = await import('../src/friend-ui.ts');
  const s = M.newGame(); s.friends = [{ id: 'pepper', role: 'cook', rescuedAt: T0, gear: {}, home: true, jobs: 50, grown: 1 }];
  assert.match(growthLine(s, 'pepper'), /0\.75/); assert.match(growthLine(s, 'pepper'), /150 jobs/);
  s.friends[0].grown = 2; assert.match(growthLine(s, 'pepper'), /fully grown/);
});

// ----------------------------------------------------------------- looks
test('looks: the default is free, others are bought once with energy, worn at once and switched freely', () => {
  const s = M.newGame(); s.energy = 500;
  assert.equal(lookOf(s), 'default'); assert.equal(ownsLook(s, 'default'), true); assert.equal(LOOKS.default.price, 0);
  assert.equal(wearLook(s, 'tall'), false, 'not owned yet');
  assert.ok(act(s, 'buyLook', { id: 'tall' })); assert.equal(s.energy, 500 - LOOKS.tall.price); assert.equal(lookOf(s), 'tall');
  assert.throws(() => act(s, 'buyLook', { id: 'tall' }), 'buying twice fails');
  assert.ok(act(s, 'wearLook', { id: 'default' })); assert.equal(lookOf(s), 'default');
  assert.ok(act(s, 'wearLook', { id: 'tall' })); assert.equal(s.energy, 500 - LOOKS.tall.price, 'switching is free');
  s.energy = 10; assert.equal(buyLook(s, 'bunny'), false, 'too dear'); assert.equal(buyLook(s, 'mermaid'), false, 'unknown');
  assert.throws(() => act(s, 'wearLook', { id: 'catboy' }));
});

test('looks are saved, and old or tampered saves fall back to the default', () => {
  const s = M.newGame(); s.energy = 1000; buyLook(s, 'catboy'); buyLook(s, 'bunny');
  const back = M.parseSave(JSON.stringify(s))!; assert.deepEqual(back.looks, { owned: ['catboy', 'bunny'], style: 'bunny' });
  const old = JSON.parse(JSON.stringify(s)); delete old.looks; assert.equal(lookOf(M.parseSave(JSON.stringify(old))!), 'default');
  assert.deepEqual(parseLooks({ owned: ['tall', 'x', 'tall', 'default'], style: 'bunny' }), { owned: ['tall'], style: 'default' }, 'a look not owned is not worn');
  assert.equal(parseLooks('tall'), undefined);
});

// -------------------------------------------- every wearable on every style
type Node = { name?: string; mesh?: number; children?: number[]; translation?: number[]; rotation?: number[]; scale?: number[] };
function glb(file: string) {
  const data = readFileSync(new URL(`../public/assets/models/${file}`, import.meta.url));
  const len = data.readUInt32LE(12); const doc = JSON.parse(data.subarray(20, 20 + len).toString('utf8'));
  const nodes: Node[] = doc.nodes, parent = new Map<number, number>();
  nodes.forEach((n, i) => n.children?.forEach(c => parent.set(c, i)));
  const at = (i: number): T.Vector3 => { const n = nodes[i], p = parent.has(i) ? at(parent.get(i)!) : new T.Vector3(); return p.add(new T.Vector3(...(n.translation ?? [0, 0, 0]))); };
  const box = (i: number) => {
    const b = new T.Box3(), o = at(i);
    for (const p of doc.meshes[nodes[i].mesh!].primitives) { const a = doc.accessors[p.attributes.POSITION]; b.expandByPoint(new T.Vector3(...a.min).add(o)); b.expandByPoint(new T.Vector3(...a.max).add(o)); }
    return b;
  };
  return { nodes, at, box, index: (name: string) => nodes.findIndex(n => n.name === name), parent };
}
const STYLE_FILE: Record<LookId, string> = { default: 'hero.glb', tall: 'hero-tall.glb', catboy: 'hero-catboy.glb', bunny: 'hero-bunny.glb' };
const PARTS = ['body', 'head', 'arm-left', 'arm-right', 'leg-left', 'leg-right'];

test('every style keeps the hero\'s part names, materials and hand empties, and the default pivots match hero.glb', () => {
  const base = glb('hero.glb');
  for (const [name, p] of Object.entries(DEFAULT_PIVOTS)) assert.ok(base.at(base.index(name)).distanceTo(new T.Vector3(...p)) < .002, name);
  for (const id of LOOK_IDS) {
    const g = glb(STYLE_FILE[id]);
    for (const name of [...PARTS, 'hand-left', 'hand-right', 'head-leaf']) assert.ok(g.index(name) >= 0, `${id} has ${name}`);
    for (const n of g.nodes) assert.ok(!n.rotation && !n.scale, `${id}: ${n.name} is unrotated and unscaled, as gear placement assumes`);
    assert.equal(g.nodes[g.parent.get(g.index('head-leaf'))!].name, 'head', `${id}: ears/sprout ride the head and hide under hats`);
    for (const key of Object.keys(FIT[id])) assert.ok(g.index(key) >= 0, `${id} FIT names a real part (${key})`);
    if (id !== 'tall') for (const name of PARTS) assert.ok(g.at(g.index(name)).distanceTo(base.at(base.index(name))) < .002, `${id} keeps the ${name} pivot, so it needs no FIT`);
  }
});

test('every wearable (hats, outfits, boots, weapons, disguises) attaches to every style and lands on its part', () => {
  const kits = ['gear-wear.glb', 'gear-weapons.glb', 'disguises.glb'].map(glb);
  let checked = 0;
  for (const id of LOOK_IDS) {
    const hero = glb(STYLE_FILE[id]), fit = FIT[id];
    for (const kit of kits) for (const [i, n] of kit.nodes.entries()) {
      if (n.mesh === undefined || !n.name) continue;
      const item = M.ITEMS[kit.nodes[kit.parent.get(i)!]?.name ?? n.name];
      const tag = n.name.includes('@') ? n.name.split('@')[1] : item?.slot === 'hat' ? 'head' : item?.slot === 'weapon' ? 'hand-right' : 'body';
      const part = hero.index(tag); assert.ok(part >= 0, `${id}: ${n.name} finds ${tag}`);
      // World.wearKit: relative to the default pivot, then the style's fit, then onto the style's part.
      const f = fit[tag], b = kit.box(i).clone().translate(new T.Vector3(...DEFAULT_PIVOTS[tag]).negate());
      if (f) { b.min.multiply(new T.Vector3(...f.scale)).add(new T.Vector3(...f.offset)); b.max.multiply(new T.Vector3(...f.scale)).add(new T.Vector3(...f.offset)); }
      b.translate(hero.at(part));
      if (tag === 'hand-right') { assert.ok(b.distanceToPoint(hero.at(part)) < .05, `${id}: ${n.name} is held in the fist`); checked++; continue; }
      const target = hero.box(part).expandByScalar(/halo/.test(n.name) ? .4 : .12); // the halo floats above the head on purpose
      assert.ok(b.intersectsBox(target), `${id}: ${n.name} sits on ${tag}`);
      if (/boots/.test(n.name)) assert.ok(Math.abs(b.min.y) < .08, `${id}: ${n.name} stands on the ground (${b.min.y.toFixed(3)})`);
      if (item?.slot === 'hat' && tag === 'head') assert.ok(b.max.y > hero.box(part).max.y - .05, `${id}: ${n.name} covers the top of the head`);
      checked++;
    }
  }
  assert.ok(checked > 4 * 100, `checked ${checked} pieces`);
});

test('the styles stay inside the triangle budget and draw no more than the default hero', () => {
  for (const id of LOOK_IDS) {
    const data = readFileSync(new URL(`../public/assets/models/${STYLE_FILE[id]}`, import.meta.url)), len = data.readUInt32LE(12), doc = JSON.parse(data.subarray(20, 20 + len).toString('utf8'));
    const tris = doc.meshes.reduce((n: number, m: { primitives: { indices: number }[] }) => n + m.primitives.reduce((k, p) => k + doc.accessors[p.indices].count / 3, 0), 0);
    assert.ok(tris <= 3850, `${id}: ${tris} triangles`);
    assert.equal(doc.meshes.length, 7, `${id}: one mesh per part plus head-leaf (the game bakes each into one draw plus the shirt)`);
  }
});

// ------------------------------------------------------------- presence
function world() {
  return Object.assign(Object.create(World.prototype), {
    state: M.newGame(), scene: new T.Scene(), camera: new T.PerspectiveCamera(40, 4 / 3, .5, 300), root: new T.Group(), player: new T.Group(), companion: new T.Group(), position: new T.Vector3(),
    entities: [], enemies: [], planet: 'home',
  }) as World;
}
test('an online explorer\'s look travels with its pose and rebuilds the avatar only when it changes', () => {
  const w = world(); w.addRemotePlayer('ann', { x: 1, z: 1, look: 'default' });
  const first = w.remotePlayers.get('ann')!.mesh; w.updateRemotePlayer('ann', { x: 2, z: 1 }); assert.equal(w.remotePlayers.get('ann')!.mesh, first, 'a move keeps the avatar');
  w.updateRemotePlayer('ann', { x: 2, z: 1, look: 'bunny' }); const second = w.remotePlayers.get('ann')!; assert.notEqual(second.mesh, first); assert.equal(second.pose.look, 'bunny');
  assert.equal(second.mesh.scale.x, HERO_SCALE, 'a look never changes the explorer\'s size');
});
