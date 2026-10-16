import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as T from 'three';
import { attackIntent, USE_AFTER_SWING_S } from '../src/attack-intent.ts';
import { pokeTarget, fencePoint, PokeGate, VillageFun, POKE, type PokeThing } from '../src/village-fun.ts';
import { PondSplash, type SplashPond } from '../src/pond-splash.ts';

const press = (o: Partial<Parameters<typeof attackIntent>[0]> = {}) => attackIntent({ hostile: false, usable: true, fresh: true, sinceSwing: 10, ...o });

test('Attack uses the thing beside you only when no creature is near, on a fresh press, and not right after a swing', () => {
  assert.equal(press(), 'use', 'beside the workshop, nothing hostile: open it');
  assert.equal(press({ hostile: true }), 'attack', 'a creature in reach or targeted always wins');
  assert.equal(press({ usable: false }), 'attack', 'nothing to use: swing');
  assert.equal(press({ fresh: false }), 'attack', 'a held Attack (power strike, auto swings) never opens a dialog');
  assert.equal(press({ sinceSwing: USE_AFTER_SWING_S - .1 }), 'attack', 'a chain that ends beside the chest keeps swinging');
  assert.equal(press({ sinceSwing: USE_AFTER_SWING_S }), 'use');
});

test('F and the phone Attack go through the same rule; the old F branch is gone', () => {
  const main = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
  assert.match(main, /else if\(key==='f'\)\{fKey\(event\.code\);\}/);
  assert.match(main, /function fKey\(code:string\)\{\r?\n  if\(useInstead\(/, 'F asks the shared rule first');
  assert.match(main, /if\(!useInstead\(true\)\)\{attackPointers\.add/, 'the pad asks it before a press can start a hold');
  assert.match(main, /case 'attack':if\(!airOn\(\)\|\|\(event as MouseEvent\)\.detail===0\)\{if\(!useInstead\(true\)\)basicAttack\(\);\}/);
});

const things: PokeThing[] = [{ id: 'tree', kind: 'tree', x: 0, z: 2, r: .9 }, { id: 'stall', kind: 'bump', x: 2.5, z: 0, r: 1 }, { id: 'hen', kind: 'happy', x: 0, z: -1.2, r: .3 }];
test('a swing meets the nearest thing in front, or one right beside; nothing behind or out of reach', () => {
  assert.equal(pokeTarget(things, 0, 0, 0, 2)?.id, 'tree', 'facing +z: the tree');
  assert.equal(pokeTarget(things, 0, 0, Math.PI / 2, 2)?.id, 'stall', 'facing +x: the stall');
  assert.equal(pokeTarget(things, 0, 0, Math.PI, 2)?.id, 'hen', 'facing -z: the hen, gently');
  assert.equal(pokeTarget(things, 0, 0, -Math.PI / 2, .5), null, 'facing -x, short reach: nothing');
  assert.equal(pokeTarget([{ id: 'b', kind: 'bump', x: -.9, z: 0, r: .5 }], 0, 0, 0, 1)?.id, 'b', 'right beside counts whatever the facing');
});
test('the fence is met only near the ring of the village fence', () => {
  assert.deepEqual(fencePoint(16.5, 0, 18, 2), { x: 18, z: 0 }); assert.equal(fencePoint(10, 0, 18, 2), null); assert.equal(fencePoint(0, 0, 18, 2), null);
});
test('each thing rests between reactions; a tree shakes and comes back upright; nothing is allocated per frame once still', () => {
  const g = new PokeGate(); assert.ok(g.ready('a', 0)); assert.ok(!g.ready('a', POKE.rest - .1)); assert.ok(g.ready('a', POKE.rest + .01));
  const bursts: unknown[] = [], fx = { burst: (...a: unknown[]) => bursts.push(a) } as never; let now = 0;
  const fun = new VillageFun(() => fx, () => now), tree = new T.Group();
  assert.ok(fun.poke({ id: 't', kind: 'tree', x: 0, z: 2, r: .9, obj: tree }, 0, 0)); assert.equal(bursts.length, 1, 'a puff of leaves');
  assert.ok(!fun.poke({ id: 't', kind: 'tree', x: 0, z: 2, r: .9, obj: tree }, 0, 0), 'resting');
  fun.update(.1); assert.ok(Math.abs(tree.rotation.x) + Math.abs(tree.rotation.z) > 0, 'it sways');
  for (let i = 0; i < 10; i++) fun.update(.1); assert.equal(tree.rotation.x, 0); assert.equal(tree.rotation.z, 0);
  now = 1; assert.ok(fun.poke({ id: 'hen', kind: 'happy', x: 1, z: 0, r: .3 }, 0, 0)); assert.equal(bursts.length, 2, 'hearts, never harm');
});
test('a plain swing at the water splashes the pond (with its rest); one away from it does not', () => {
  const pond: SplashPond = { id: 'p', x: 0, z: 4, r: 2, surface: .1, waterId: 'home' }, fx = { density: 1, burst() {}, ring() {} } as never;
  const s = new PondSplash({ root: () => null, fx: () => fx, ponds: () => [pond], fish: () => null, species: () => 'fish_carp', now: () => 0, reduced: () => false });
  assert.equal(s.swing(0, 0, Math.PI, 2), false, 'facing away');
  assert.equal(s.swing(0, 0, 0, 2), true, 'facing the water from its edge');
  assert.equal(s.swing(0, 0, 0, 2), false, 'the pond rests between splashes');
});
