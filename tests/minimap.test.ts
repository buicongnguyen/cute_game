import test from 'node:test';
import assert from 'node:assert/strict';
import { mapCaption, mapPoint, drawMarkers, drawTerrain, MAP_PX, CREATURE_RANGE, type MapView } from '../src/minimap.ts';
import { createEnvironmentLayout } from '../src/environments.ts';

/** A 2D context that records the points circles are drawn at. */
function fakeContext() {
  const arcs: { x: number; y: number; r: number }[] = [], texts: string[] = [];
  const ctx = new Proxy({} as Record<string, unknown>, {
    get: (target, key) => key === 'arc' ? (x: number, y: number, r: number) => arcs.push({ x, y, r }) : key === 'fillText' ? (t: string) => texts.push(t) : key in target ? target[key as string] : () => {},
    set: (target, key, value) => { target[key as string] = value; return true; },
  });
  return { ctx: ctx as unknown as CanvasRenderingContext2D, arcs, texts };
}
const creature = (x: number, z: number, boss = false) => ({ x, z, kind: 'enemy', mesh: { visible: true }, hp: 10, boss, phase: 'idle' });

test('the minimap caption names the zone the explorer stands in, not always the village', () => {
  assert.equal(mapCaption('home', 0, 3), 'Clover Village');
  assert.equal(mapCaption('home', -30.88, 9.2), 'Mushroom Forest');
  assert.equal(mapCaption('home', 40, 0), 'Redrock Canyon');
  assert.equal(mapCaption('home', 0, 40), 'Blue Lake Meadow');
  assert.equal(mapCaption('home', 0, -40), 'Chomper Swamp');
  assert.notEqual(mapCaption('candy', 0, 0), 'Clover Village');
});

test('the minimap shows the whole world north-up like the reference (75 px per 144 m)', () => {
  assert.deepEqual(mapPoint(0, 0), { x: MAP_PX / 2, y: MAP_PX / 2 });
  assert.equal(mapPoint(144, 0).x, MAP_PX);
  assert.equal(mapPoint(0, -144).y, 0); // north (−z) is up
});

test('bosses always show; other creatures only within 40 m', () => {
  const { ctx, arcs, texts } = fakeContext();
  const view: MapView = { planet: 'home', layout: createEnvironmentLayout('home'), position: { x: 0, z: 0 }, facing: 0, entities: [], ready: [], remotes: [],
    enemies: [creature(10, 0), creature(CREATURE_RANGE + 5, 0), creature(-120, 0, true)] };
  drawMarkers(ctx, view);
  const at = (x: number) => arcs.some(a => Math.abs(a.x - mapPoint(x, 0).x) < .01);
  assert.ok(at(10), 'a near creature is drawn');
  assert.ok(!at(CREATURE_RANGE + 5), 'a far creature is not');
  assert.ok(at(-120) && texts.includes('♛'), 'a far boss is drawn with a crown');
});

test('terrain draws for home and every planet without throwing', () => {
  for (const planet of ['home', 'candy', 'ice', 'lava', 'toy', 'jungle', 'ocean', 'cloud', 'shadow'] as const) {
    const { ctx } = fakeContext();
    drawTerrain(ctx, { planet, layout: createEnvironmentLayout(planet), entities: [{ x: 5, z: 5, kind: 'fish', mesh: { visible: true }, pond: { rx: 4, rz: 3 } }] });
  }
});
