import test from 'node:test';
import assert from 'node:assert/strict';
import { mapCaption, mapPoint, drawMarkers, drawTerrain, homeMapColor, borderWander, ZONE_COLORS, MAP_PX, CREATURE_RANGE, type MapView } from '../src/minimap.ts';
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

// Stage 2 (docs/QUALITY-PLAN.md): the map shows the lie of the land, not four ruler-cut sectors.
const rgb = (c: string) => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
const far = (a: readonly number[], b: readonly number[]) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]);
test('the home map paints each wild in its ground colour, the village green in the middle and the rim wood at the edge', () => {
  assert.deepEqual(homeMapColor(0, 3), rgb(ZONE_COLORS.home));
  assert.deepEqual(homeMapColor(80, 0), rgb(ZONE_COLORS.canyon));
  assert.deepEqual(homeMapColor(-80, 0), rgb(ZONE_COLORS.forest));
  assert.deepEqual(homeMapColor(0, 80), rgb(ZONE_COLORS.meadow));
  assert.deepEqual(homeMapColor(0, -80), rgb(ZONE_COLORS.swamp));
  assert.ok(far(homeMapColor(0, 160), rgb(ZONE_COLORS.meadow)) > 60, 'beyond the edge of the world the rim wood shows');
  for (const [x, z] of [[30, 30], [-55, 55], [100, -100], [-12, -12], [149, 3]]) for (const v of homeMapColor(x, z)) assert.ok(v >= 0 && v <= 255 && Number.isFinite(v));
});
test('borders between wilds wander and blend: no straight sector edge', () => {
  // Along the exact diagonal between canyon and meadow the colour leans one way, then the other.
  const lean = [30, 45, 60, 75, 90, 105, 120].map(d => { const c = homeMapColor(d * Math.SQRT1_2, d * Math.SQRT1_2); return Math.sign(far(c, rgb(ZONE_COLORS.canyon)) - far(c, rgb(ZONE_COLORS.meadow))); });
  assert.ok(lean.includes(1) && lean.includes(-1), `the border crosses the diagonal: ${lean}`);
  assert.equal(borderWander(10), 0, 'the village itself is not bent');
  assert.ok(Math.max(...[40, 60, 80, 100, 120].map(d => Math.abs(borderWander(d)))) < .2, 'borders wander by a few degrees only, so the caption still names the right wild');
  // Across a border the colour changes in steps, not at one line.
  const across = Array.from({ length: 41 }, (_, i) => { const a = Math.PI / 4 - borderWander(70) + (i - 20) * .006; return homeMapColor(Math.cos(a) * 70, Math.sin(a) * 70); });
  const steps = across.slice(1).map((c, i) => far(c, across[i]));
  assert.ok(steps.filter(s => s > 0).length >= 8 && Math.max(...steps) < far(rgb(ZONE_COLORS.canyon), rgb(ZONE_COLORS.meadow)) / 3, 'a soft blend');
});
test('home terrain draws its marks and roads on a real canvas API and still draws without pixel access', () => {
  const calls: string[] = []; let put = 0;
  const ctx = new Proxy({} as Record<string, unknown>, { get: (target, key) => key === 'createImageData' ? (w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4) }) : key === 'putImageData' ? (image: { data: Uint8ClampedArray }) => { put++; assert.equal(image.data[3], 255); } : key in target ? target[key as string] : (...args: unknown[]) => { calls.push(String(key)); void args; }, set: (target, key, value) => { target[key as string] = value; return true; } });
  drawTerrain(ctx as unknown as CanvasRenderingContext2D, { planet: 'home', layout: createEnvironmentLayout('home'), entities: [] });
  assert.equal(put, 1, 'the land is painted once');
  assert.ok(calls.filter(c => c === 'stroke').length >= 8 + 4 + 40, 'roads (edge and sand), the hedge and the canyon ledges are stroked');
  assert.ok(calls.filter(c => c === 'fill').length > 150, 'tree clumps, flowers and reed pools are filled');
});
test('the map panel is not clipped to a disc any more: the stylesheet frames it', async () => {
  const src = (await import('node:fs')).readFileSync(new URL('../src/minimap.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(src, /ctx.clip()/);
});
