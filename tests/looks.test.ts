import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as T from 'three';
import * as M from '../src/model.ts';
import * as F from '../src/friends.ts';
import { applyGameAction } from '../src/actions.ts';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DEFAULT_LOOK, DEFAULT_PIVOTS, FIT, LOOK_IDS, OPTIONS, ROWS, bodyFile, buyLook, lookOf, lookPrice, ownsLook, parseLooks, splitLook, swapOption, wearLook, type Body, type Fit, type Height } from '../src/looks.ts';
import { HeroLibrary, heroKitFor, tuckEars, useHeroLoader } from '../src/assets.ts';
import { HIP, applyGait, gaitSwing, newGait, stepGait } from '../src/walk-cycle.ts';
import { GROWTH, earnedStage, friendHeight, friendStage, growUp } from '../src/growth.ts';
import { friendScale, buildFriend, poseFriend } from '../src/friend-view.ts';
import { World, HERO_SCALE } from '../src/world.ts';

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

test('harvests count toward growing up (60 a day at most), and the catch-up grows a friend who rested at home for days', () => {
  const s = M.newGame(); s.level = 30; s.energy = 1e5; s.planet = M.CAGES.sprout.planet;
  M.grantDefeat(s, M.CAGES.sprout.boss, 1, true, () => .5, false); assert.equal(F.rescue(s, 'sprout', T0), true); s.planet = 'home'; F.arriveHome(s, { x: 0, z: 5 });
  const f = s.friends![0];
  for (let i = 0; i < 39; i++) { const plot = s.plots[0]; plot.crop = 'radish'; plot.plantedAt = T0 - M.CROPS.radish.duration - 1; assert.ok(F.friendWork(s, 'sprout', { kind: 'harvest', index: 0 }, T0)); }
  assert.equal(friendStage(f), 0);
  for (let i = 0; i < 31; i++) { const plot = s.plots[0]; plot.crop = 'radish'; plot.plantedAt = T0 - M.CROPS.radish.duration - 1; assert.ok(F.friendWork(s, 'sprout', { kind: 'harvest', index: 0 }, T0)); }
  assert.equal(f.jobs, 60, 'at most 60 jobs a day count'); assert.equal(friendStage(f), 1, 'a busy first day reaches the first step, before the one-day timer');
  for (let i = 0; i < 10; i++) { const plot = s.plots[0]; plot.crop = 'radish'; plot.plantedAt = T0 - M.CROPS.radish.duration - 1; assert.ok(F.friendWork(s, 'sprout', { kind: 'harvest', index: 0 }, T0 + DAY)); }
  assert.equal(f.jobs, 70); assert.equal(friendStage(f), 1);
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
  assert.match(growthLine(s, 'pepper'), /0\.75/); assert.match(growthLine(s, 'pepper'), /150 harvests or collections/); assert.match(growthLine(s, 'pepper'), /3 days after the rescue/);
  s.friends[0].grown = 2; assert.match(growthLine(s, 'pepper'), /fully grown/);
});

// ----------------------------------------------------------------- looks
test('looks: body, height and ears combine; options are bought once, for both bodies, and switching is free', () => {
  const s = M.newGame(); s.energy = 1000;
  assert.equal(LOOK_IDS.length, 18); assert.equal(lookOf(s), DEFAULT_LOOK); assert.equal(DEFAULT_LOOK, 'boy-chibi-none');
  assert.equal(ownsLook(s, 'girl-chibi-none'), true, 'both bodies are free'); assert.equal(OPTIONS.boy.price + OPTIONS.girl.price + OPTIONS.chibi.price + OPTIONS.none.price, 0);
  assert.ok(act(s, 'wearLook', { id: 'girl-chibi-none' })); assert.equal(s.energy, 1000);
  assert.equal(wearLook(s, 'girl-tall-none'), false, 'tall not owned yet');
  assert.equal(lookPrice(s, 'girl-tall-cat'), OPTIONS.tall.price + OPTIONS.cat.price);
  assert.ok(act(s, 'buyLook', { id: 'girl-tall-cat' })); assert.equal(s.energy, 1000 - 270); assert.equal(lookOf(s), 'girl-tall-cat');
  assert.deepEqual(splitLook(lookOf(s)), { body: 'girl', height: 'tall', ears: 'cat' });
  assert.throws(() => act(s, 'buyLook', { id: 'girl-tall-cat' }), 'nothing left to buy');
  assert.ok(act(s, 'wearLook', { id: 'boy-tall-cat' }), 'owned options unlock for the other body too'); assert.equal(s.energy, 730);
  assert.ok(act(s, 'buyLook', { id: 'bunny' }), 'one option, swapped into the worn look'); assert.equal(lookOf(s), 'boy-tall-bunny'); assert.equal(s.energy, 580);
  assert.ok(act(s, 'wearLook', { id: 'girl-chibi-cat' })); assert.equal(s.energy, 580, 'switching is free');
  assert.throws(() => act(s, 'wearLook', { id: 'girl-teen-cat' }), 'teen is not owned');
  s.energy = 10; assert.equal(buyLook(s, 'girl-teen-none'), false, 'too dear'); assert.equal(buyLook(s, 'mermaid'), false, 'unknown');
  assert.equal(buyLook(s, 'boy-huge-none'), false); assert.equal(wearLook(s, 'boy-chibi'), false);
  assert.equal(swapOption('boy-chibi-none', 'girl'), 'girl-chibi-none'); assert.equal(swapOption('boy-chibi-none', 'teen'), 'boy-teen-none'); assert.equal(swapOption('boy-chibi-none', 'cat'), 'boy-chibi-cat');
});

test('looks are saved, old single looks migrate onto the builder, and tampered saves fall back to the default', () => {
  const s = M.newGame(); s.energy = 1000; buyLook(s, 'boy-teen-cat');
  const back = M.parseSave(JSON.stringify(s))!; assert.deepEqual(back.looks, { owned: ['teen', 'cat'], style: 'boy-teen-cat' });
  const old = JSON.parse(JSON.stringify(s)); delete old.looks; assert.equal(lookOf(M.parseSave(JSON.stringify(old))!), DEFAULT_LOOK);
  // Tall -> Tall height; Cat boy -> Boy + Cat; Bunny girl -> Girl + Bunny.
  assert.deepEqual(parseLooks({ owned: ['tall'], style: 'tall' }), { owned: ['tall'], style: 'boy-tall-none' });
  assert.deepEqual(parseLooks({ owned: ['catboy'], style: 'catboy' }), { owned: ['cat'], style: 'boy-chibi-cat' });
  assert.deepEqual(parseLooks({ owned: ['tall', 'catboy', 'bunny'], style: 'bunny' }), { owned: ['tall', 'cat', 'bunny'], style: 'girl-chibi-bunny' });
  assert.deepEqual(parseLooks({ owned: ['bunny'], style: 'default' }), { owned: ['bunny'], style: DEFAULT_LOOK });
  const legacy = JSON.parse(JSON.stringify(s)); legacy.looks = { owned: ['tall', 'bunny'], style: 'tall' };
  const migrated = M.parseSave(JSON.stringify(legacy))!; assert.equal(lookOf(migrated), 'boy-tall-none'); assert.ok(ownsLook(migrated, 'girl-tall-bunny'), 'the old purchases combine');
  assert.deepEqual(parseLooks({ owned: ['tall', 'x', 'tall', 'girl'], style: 'girl-chibi-bunny' }), { owned: ['tall'], style: DEFAULT_LOOK }, 'a look not owned is not worn; free options are never stored');
  assert.equal(parseLooks('tall'), undefined); assert.equal(lookOf({ looks: { owned: [], style: 'nonsense' as never } }), DEFAULT_LOOK);
});

// -------------------------------------------- every wearable on every combination
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
  const tris = doc.meshes.reduce((n: number, m: { primitives: { indices: number }[] }) => n + m.primitives.reduce((k, p) => k + doc.accessors[p.indices].count / 3, 0), 0);
  return { doc, nodes, at, box, tris, index: (name: string) => nodes.findIndex(n => n.name === name), parent };
}
const PARTS = ['body', 'head', 'arm-left', 'arm-right', 'leg-left', 'leg-right'];
const BODIES = ROWS.body.flatMap(b => ROWS.height.map(h => ({ body: b as Body, height: h as Height, file: bodyFile(b as Body, h as Height) })));
/** World.wearKit's placement: relative to the default pivot, then the height's fit, then onto the part. */
const place = (b: T.Box3, tag: string, f: Fit | undefined, at: T.Vector3) => {
  const out = b.clone().translate(new T.Vector3(...DEFAULT_PIVOTS[tag]).negate());
  if (f) { out.min.multiply(new T.Vector3(...f.scale)).add(new T.Vector3(...f.offset)); out.max.multiply(new T.Vector3(...f.scale)).add(new T.Vector3(...f.offset)); }
  return out.translate(at);
};

test('six body files keep the hero\'s parts and hand empties; their pivots agree with FIT', () => {
  const base = glb('hero.glb');
  assert.equal(new Set(BODIES.map(b => b.file)).size, 6);
  for (const [name, p] of Object.entries(DEFAULT_PIVOTS)) assert.ok(base.at(base.index(name)).distanceTo(new T.Vector3(...p)) < .002, name);
  for (const { file, height } of BODIES) {
    const g = glb(file), fit = FIT[height];
    for (const name of [...PARTS, 'hand-left', 'hand-right', 'head-leaf']) assert.ok(g.index(name) >= 0, `${file} has ${name}`);
    for (const n of g.nodes) assert.ok(!n.rotation && !n.scale, `${file}: ${n.name} is unrotated and unscaled, as gear placement assumes`);
    assert.equal(g.nodes[g.parent.get(g.index('head-leaf'))!].name, 'head', `${file}: the sprout rides the head and hides under hats`);
    if (height === 'chibi') { for (const name of PARTS) assert.ok(g.at(g.index(name)).distanceTo(base.at(base.index(name))) < .002, `${file} keeps the ${name} pivot`); continue; }
    // Legs drop by the fit's offset: the hips rise by the extra shin, and the soles stay on the ground.
    assert.ok(Math.abs(g.at(g.index('leg-left')).y - (DEFAULT_PIVOTS['leg-left'][1] - fit['leg-left']!.offset[1])) < .002, `${file} hips match FIT`);
    assert.ok(Math.abs(g.box(g.index('leg-left')).min.y) < .02, `${file} stands on the ground`);
  }
  const teen = glb(bodyFile('boy', 'teen')), tall = glb(bodyFile('boy', 'tall'));
  assert.ok(base.at(base.index('head')).y < teen.at(teen.index('head')).y && teen.at(teen.index('head')).y < tall.at(tall.index('head')).y, 'chibi < teen < tall');
});

test('every wearable (hats, outfits, boots, weapons, disguises) attaches to every combination and lands on its part', () => {
  const kits = ['gear-wear.glb', 'gear-weapons.glb', 'disguises.glb'].map(glb);
  let checked = 0;
  for (const { file, height } of BODIES) {
    const hero = glb(file), fit = FIT[height];
    for (const kit of kits) for (const [i, n] of kit.nodes.entries()) {
      if (n.mesh === undefined || !n.name) continue;
      const item = M.ITEMS[kit.nodes[kit.parent.get(i)!]?.name ?? n.name];
      const tag = n.name.includes('@') ? n.name.split('@')[1] : item?.slot === 'hat' ? 'head' : item?.slot === 'weapon' ? 'hand-right' : 'body';
      const part = hero.index(tag); assert.ok(part >= 0, `${file}: ${n.name} finds ${tag}`);
      const b = place(kit.box(i), tag, fit[tag], hero.at(part));
      if (tag === 'hand-right') { assert.ok(b.distanceToPoint(hero.at(part)) < .05, `${file}: ${n.name} is held in the fist`); checked++; continue; }
      const target = hero.box(part).expandByScalar(/halo/.test(n.name) ? .4 : .12); // the halo floats above the head on purpose
      assert.ok(b.intersectsBox(target), `${file}: ${n.name} sits on ${tag}`);
      if (/boots/.test(n.name)) assert.ok(Math.abs(b.min.y) < .08, `${file}: ${n.name} stands on the ground (${b.min.y.toFixed(3)})`);
      if (item?.slot === 'hat' && tag === 'head') assert.ok(b.max.y > hero.box(part).max.y - .05, `${file}: ${n.name} covers the top of the head (ears tuck under it)`);
      checked++;
    }
  }
  assert.ok(checked > 6 * 100, `checked ${checked} pieces`);
});

test('ears sit on the head and tails on the back at every height; budgets: triangles near the hero, 7 meshes per body', () => {
  const parts = glb('hero-parts.glb'), base = glb('hero.glb');
  for (const name of ['ears-cat', 'ears-bunny', 'tail-cat', 'tail-bunny']) assert.ok(parts.index(name) >= 0, name);
  const partBox = (name: string) => { const i = parts.index(name), b = new T.Box3(); for (const [j, n] of parts.nodes.entries()) if ((j === i || parts.parent.get(j) === i) && n.mesh !== undefined) b.union(parts.box(j)); return b; };
  for (const { file, height } of BODIES) {
    const hero = glb(file), fit = FIT[height], head = hero.index('head'), body = hero.index('body');
    for (const ears of ['cat', 'bunny']) {
      const e = place(partBox('ears-' + ears), 'head', fit.head, hero.at(head)), t = place(partBox('tail-' + ears), 'body', fit.body, hero.at(body));
      assert.ok(e.intersectsBox(hero.box(head)) && e.max.y > hero.box(head).max.y, `${file}: ${ears} ears rise from the head`);
      assert.ok(t.intersectsBox(hero.box(body).expandByScalar(.05)) && t.min.z < hero.box(body).min.z - .02, `${file}: ${ears} tail pokes out at the back`);
      const tris = hero.tris - 128 /* the sprout gives way to the ears */ + [`ears-${ears}`, `tail-${ears}`].reduce((n, p) => n + parts.doc.meshes[parts.nodes[parts.index(p)].mesh ?? parts.nodes[parts.nodes[parts.index(p)].children![0]].mesh!].primitives.reduce((k: number, q: { indices: number }) => k + parts.doc.accessors[q.indices].count / 3, 0), 0);
      assert.ok(tris <= base.tris * 1.25, `${file} + ${ears}: ${tris} triangles (hero ${base.tris})`);
    }
    assert.equal(hero.doc.meshes.length, 7, `${file}: one mesh per part plus head-leaf (the game bakes each into one draw plus the shirt)`);
  }
});

const disk = async (url: string) => { const file = url.split('/').pop()!.split('?')[0], bytes = readFileSync(new URL(`../public/assets/models/${file}`, import.meta.url)); return (await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer, '')).scene; };
const draws = (o: T.Object3D) => { let n = 0; o.traverse(m => { if (m instanceof T.Mesh && m.visible && m.layers.mask) n++; }); return n; };
test('at run time every combination draws exactly what the default explorer draws, and ears tuck under hats', async () => {
  useHeroLoader(disk);
  const plain = new HeroLibrary('hero.glb', disk); await plain.load(); const want = draws(plain.instance('#4aa8ff')!), bare = new Map<string, number>();
  for (const id of LOOK_IDS) {
    const kit = id === DEFAULT_LOOK ? plain : heroKitFor(id); await kit.load(); assert.ok(kit.ready, id);
    const hero = kit.instance('#ff7ab0')!, l = splitLook(id);
    assert.ok(draws(hero) <= want, `${id}: no more draws than the default (${draws(hero)} vs ${want})`);
    const head = hero.getObjectByName('head')!, mesh = head.children.find((o): o is T.Mesh => o instanceof T.Mesh && !!o.geometry.getAttribute('color'))!, before = mesh.geometry.getAttribute('position').count;
    if (l.ears === 'none') bare.set(l.body + l.height, before); else assert.ok(before > bare.get(l.body + l.height)!, `${id}: the ears are baked into the head`);
    tuckEars(hero, true);
    if (l.ears !== 'none') assert.ok(mesh.geometry.getAttribute('position').count < before, `${id}: the ears tuck under a hat`);
  }
});

// ------------------------------------------------------------- presence
function world() {
  return Object.assign(Object.create(World.prototype), {
    state: M.newGame(), scene: new T.Scene(), camera: new T.PerspectiveCamera(40, 4 / 3, .5, 300), root: new T.Group(), player: new T.Group(), companion: new T.Group(), position: new T.Vector3(),
    entities: [], enemies: [], planet: 'home',
  }) as World;
}
test('an online explorer\'s whole combination travels with its pose and rebuilds the avatar only when it changes', () => {
  const w = world(); w.addRemotePlayer('ann', { x: 1, z: 1, look: 'boy-chibi-none' });
  const first = w.remotePlayers.get('ann')!.mesh; w.updateRemotePlayer('ann', { x: 2, z: 1 }); assert.equal(w.remotePlayers.get('ann')!.mesh, first, 'a move keeps the avatar');
  w.updateRemotePlayer('ann', { x: 2, z: 1, look: 'girl-tall-bunny' }); const second = w.remotePlayers.get('ann')!; assert.notEqual(second.mesh, first); assert.equal(second.pose.look, 'girl-tall-bunny');
  assert.equal(second.mesh.scale.x, HERO_SCALE, 'a look never changes the explorer\'s size');
  w.updateRemotePlayer('bob', { x: 0, z: 0, look: 'catboy' as never }); assert.ok(w.remotePlayers.get('bob'), 'an old look id from an older client still draws');
});

// ------------------------------------------------------------- walking on legs
test('friends walk on their legs: the swing changes while moving, blends out and rests at 0 when idle', () => {
  const g = newGait(), dt = 1 / 60, leg = HIP * .42, limbs = { legL: new T.Object3D(), legR: new T.Object3D(), armL: new T.Object3D(), armR: new T.Object3D() };
  const seen = new Set<string>();
  for (let i = 0; i < 60; i++) { stepGait(g, 1.6 * dt, dt, leg); limbs.legL.rotation.x = limbs.legR.rotation.x = 0; applyGait(limbs, g, gaitSwing(1.6, leg)); seen.add(limbs.legL.rotation.x.toFixed(2)); }
  assert.ok(seen.size > 10, 'the leg angle keeps changing while walking'); assert.ok(g.blend > .99);
  assert.ok(Math.abs(limbs.legL.rotation.x + limbs.legR.rotation.x) < 1e-9, 'the legs swing opposite'); assert.ok(Math.sign(limbs.armL.rotation.x) !== Math.sign(limbs.legL.rotation.x) || limbs.legL.rotation.x === 0, 'the arms counter-swing');
  for (let i = 0; i < 60; i++) { stepGait(g, 0, dt, leg); limbs.legL.rotation.x = limbs.legR.rotation.x = 0; applyGait(limbs, g, .6); }
  assert.equal(g.blend, 0); assert.equal(limbs.legL.rotation.x, 0); assert.equal(limbs.legR.rotation.x, 0);
  // A bigger walker steps slower for the same ground; a fast one is capped so legs never blur.
  const small = newGait(), big = newGait(); stepGait(small, .05, dt, .2); stepGait(big, .05, dt, .5); assert.ok(small.phase > big.phase);
  const fast = newGait(); stepGait(fast, 10 * dt, dt, .2); assert.ok(fast.phase <= 18 * dt + 1e-9);
});

test('a friend posed through the walk swings its hero legs, then stands still at 0', () => {
  const root = buildFriend('pepper'), model = root.userData.model as T.Object3D;
  const leg = new T.Object3D(); leg.name = 'leg-left'; const leg2 = new T.Object3D(); leg2.name = 'leg-right'; model.add(leg, leg2); // the stand-in has no legs of its own
  const g = newGait(), angles: number[] = [];
  for (let i = 0; i < 40; i++) { stepGait(g, 1.6 / 60, 1 / 60, HIP * root.scale.x); poseFriend(root, 'walk', i / 60, g, .6); angles.push(leg.rotation.x); }
  assert.ok(Math.max(...angles) - Math.min(...angles) > .5, 'the leg swings while walking');
  for (let i = 0; i < 60; i++) { stepGait(g, 0, 1 / 60, 1); poseFriend(root, 'idle', i / 60, g, .6); }
  assert.equal(leg.rotation.x, 0); assert.equal(leg2.rotation.x, 0);
});

test('indoors, a friend crossing the house swings its legs, and they rest at 0 once it stands at its hangout', async () => {
  const { HouseView } = await import('../src/house-view.ts');
  const view = Object.assign(Object.create(HouseView.prototype), { friends: new Map(), walks: new Map(), clock: 0, roles: [], hangouts: [] });
  const group = new T.Group(), model = new T.Group(); group.add(model); group.scale.setScalar(.42);
  const legL = new T.Object3D(), legR = new T.Object3D(); legL.name = 'leg-left'; legR.name = 'leg-right'; model.add(legL, legR);
  const spot = { x: 0, z: 1, facing: 0, pose: 'stand' }; group.position.set(-1.5, 0, 1);
  view.friends.set('pepper', { id: 'pepper', group, signature: 'x', spot, seed: 0, role: 'cook', stage: 0 });
  view.walks.set('pepper', { to: spot, points: [{ x: 0, z: 1 }], next: 0 });
  // Only the friends' loop matters here: skip the fire, steam and door.
  Object.assign(view, { flame: { scale: new T.Vector3() }, puffs: { setMatrixAt() {}, instanceMatrix: {} }, v: new T.Vector3(), q: new T.Quaternion(), sc: new T.Vector3(), m4: new T.Matrix4(), pulseRing() {}, hoverGlow: { visible: false }, door: { rotation: new T.Euler() }, doorOpen: 0, doorTarget: 0, schedulePhase: 0 });
  const seen = new Set<string>();
  for (let i = 0; i < 30; i++) { view.update(1 / 60, i / 60); seen.add(legL.rotation.x.toFixed(2)); }
  assert.ok(seen.size > 8, `legs swing while crossing (${seen.size} angles)`);
  for (let i = 30; i < 200; i++) view.update(1 / 60, i / 60);
  assert.ok(Math.hypot(group.position.x, group.position.z - 1) < .06, 'arrived'); assert.equal(legL.rotation.x, 0); assert.equal(legR.rotation.x, 0);
});
