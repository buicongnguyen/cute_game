// Arrival flags (src/place-flags.ts, src/place-flags-view.ts; docs/FIX-PLAN.md 5.5): where they go up, the save, the model budget.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as T from 'three';
import * as M from '../src/model.ts';
import { PLANETS } from '../src/content.ts';
import { DUNGEON } from '../src/dungeon-rules.ts';
import { COLOSSUS_SCHEDULE } from '../src/colossus-content.ts';
import { huntingPonds } from '../src/fish-hunting.ts';
import { GUARDIAN_POND } from '../src/lake-guardian.ts';
import { createEnvironmentLayout, zoneAt } from '../src/environments.ts';
import { PLACES, PAD_FLAG, WILD_FLAG_MIN_R, FLAG_STEP, backfillFlags, flagSpot, flagsOn, parsePlaceFlags, placeAt, placeById, placesReached, plantFlag, type PlaceFlags } from '../src/place-flags.ts';
import { FLAG_CAPACITY, FLAG_TRIANGLES, FLAG_VIEW_RANGE, flagModel, mountPlaceFlags } from '../src/place-flags-view.ts';
import { placesRowHtml } from '../src/goals-ui.ts';
import { FLAGS_VI } from '../src/locales/vi-flags.ts';
import { VI_PACK } from '../src/locales/vi-pack.ts';

test('sixteen places: the four wilds, four home landmarks and the eight other planets, each once', () => {
  assert.equal(PLACES.length, 16);
  assert.equal(new Set(PLACES.map(p => p.id)).size, 16);
  assert.deepEqual(PLACES.filter(p => p.kind === 'wild').map(p => p.id).sort(), ['canyon', 'forest', 'meadow', 'swamp']);
  assert.equal(PLACES.filter(p => p.kind === 'landmark').length, 4);
  assert.deepEqual(PLACES.filter(p => p.kind === 'planet').map(p => p.id).sort(), Object.keys(PLANETS).filter(id => id !== 'home').sort());
  assert.ok(PLACES.filter(p => p.planet === 'home').length <= FLAG_CAPACITY, 'one world never holds more flags than the mesh');
  for (const p of PLACES) { assert.ok(VI_PACK[p.name], `Vietnamese name: ${p.name}`); assert.ok(VI_PACK[p.hint], `Vietnamese hint: ${p.hint}`); }
  for (const [en, vi] of Object.entries(FLAGS_VI)) { assert.ok(vi && vi !== en, en); assert.equal(VI_PACK[en], vi, en); }
});

test('the landmarks sit where the game puts them, and their flags stand clear of them', () => {
  const at = (id: string) => placeById(id)!.at!;
  assert.deepEqual(at('vault'), { x: DUNGEON.lobby.x, z: DUNGEON.lobby.z });
  assert.deepEqual(at('cinderpeak'), { x: COLOSSUS_SCHEDULE.x, z: COLOSSUS_SCHEDULE.z });
  const lake = huntingPonds('home').find(p => p.id === GUARDIAN_POND)!;
  assert.deepEqual(at('lake'), { x: lake.x, z: lake.z });
  const gate = /GATE = \{ gate: \{ x: (-?[\d.]+), z: (-?[\d.]+) \}/.exec(readFileSync(new URL('../src/ctf.ts', import.meta.url), 'utf8'))!;
  assert.deepEqual(at('gate'), { x: Number(gate[1]), z: Number(gate[2]) });
  // Each landmark flag is outside its circle or water, in reach of where the explorer arrives, and on the home map's land.
  assert.ok(Math.hypot(placeById('vault')!.spot.x - DUNGEON.lobby.x, placeById('vault')!.spot.z - DUNGEON.lobby.z) > DUNGEON.lobby.r);
  assert.ok(Math.hypot(placeById('lake')!.spot.x - lake.x, placeById('lake')!.spot.z - lake.z) > lake.rx + 1);
  for (const p of PLACES.filter(q => q.kind === 'landmark')) { assert.ok(Math.hypot(p.spot.x - p.at!.x, p.spot.z - p.at!.z) < (p.reach ?? 0) + 6, p.id); assert.ok(Math.hypot(p.spot.x, p.spot.z) < 140, p.id); }
});

test('arriving: a landmark in reach first, then the wild by position; the village is home, a planet counts anywhere on it', () => {
  assert.equal(placeAt('home', 0, 0), null);
  assert.equal(placeAt('home', 10, 5), null, 'inside the hedge is the village');
  assert.equal(placeAt('home', -30, 2)?.id, 'forest');
  assert.equal(placeAt('home', 30, 2)?.id, 'canyon');
  assert.equal(placeAt('home', 2, -30)?.id, 'swamp');
  assert.equal(placeAt('home', 2, 22)?.id, 'meadow');
  assert.equal(placeAt('home', -12, 27)?.id, 'gate');
  assert.equal(placeAt('home', 11, 31)?.id, 'vault');
  assert.equal(placeAt('home', 40, 95)?.id, 'lake');
  assert.equal(placeAt('home', 70, 5)?.id, 'cinderpeak');
  for (const id of Object.keys(PLANETS).filter(id => id !== 'home')) assert.equal(placeAt(id, 0, 3.6)?.id, id);
  assert.equal(placeAt('nowhere', 0, 0), null);
  assert.equal(placeAt('home', NaN, 0), null);
});

test('a wild flag goes up a step beside the explorer, outside the hedge, on a clear spot', () => {
  const forest = placeById('forest')!;
  for (const [x, z, facing] of [[-30, 2, 0], [-18.5, 0, -Math.PI / 2], [-21, 1, 0], [-40, -20, 1.2]] as const) {
    const s = flagSpot(forest, x, z, facing);
    assert.ok(Math.hypot(s.x, s.z) >= WILD_FLAG_MIN_R - .06, `outside the hedge from ${x},${z}`);
    assert.ok(Math.hypot(s.x - x, s.z - z) >= FLAG_STEP * .7 - .06, `a step from the explorer at ${x},${z}`);
    assert.ok(Math.hypot(s.x - x, s.z - z) < 4, 'still beside the explorer');
  }
  // The right-hand spot is in a tree: the flag takes the next clear one.
  const right = flagSpot(forest, -30, 2, 0), blocked = flagSpot(forest, -30, 2, 0, (x, z) => Math.hypot(x - right.x, z - right.z) > .5);
  assert.notDeepEqual(blocked, right);
  // Landmarks and planets keep their own spot whatever the explorer does.
  assert.deepEqual(flagSpot(placeById('candy')!, 9, 9, 2), PAD_FLAG);
  assert.deepEqual(flagSpot(placeById('gate')!, -12, 27, 0), placeById('gate')!.spot);
});

test('each place gets one flag, ever; counts and per-world lists follow', () => {
  const flags: PlaceFlags = {};
  assert.equal(plantFlag(flags, placeById('forest')!, { x: -25.04, z: 1.96 }, 1234), true);
  assert.deepEqual(flags.forest, [-25, 2, 1234]);
  assert.equal(plantFlag(flags, placeById('forest')!, { x: -40, z: 0 }, 5678), false, 'a second arrival plants nothing');
  assert.deepEqual(flags.forest, [-25, 2, 1234]);
  assert.equal(plantFlag(flags, placeById('candy')!, { x: NaN, z: 0 }), false);
  plantFlag(flags, placeById('candy')!, PAD_FLAG, 99);
  assert.deepEqual(placesReached(flags), { done: 2, total: 16 });
  assert.deepEqual(flagsOn(flags, 'home').map(f => f.id), ['forest']);
  assert.deepEqual(flagsOn(flags, 'candy').map(f => f.id), ['candy']);
  assert.deepEqual(placesReached(undefined), { done: 0, total: 16 });
});

test('saves: old ones start with a flag on every planet landed on; flags survive a reload; junk is dropped', () => {
  // A new game and the promo saves (made before flags) have none in the file: the game makes them on first use.
  assert.equal(M.newGame().placeFlags, undefined);
  for (const file of ['save.json', 'save-late.json']) {
    const s = M.parseSave(readFileSync(new URL(`../promo/${file}`, import.meta.url), 'utf8'))!;
    assert.equal(s.placeFlags, undefined, file);
    const flags = backfillFlags(s);
    assert.deepEqual(Object.keys(flags).sort(), s.visited.filter(id => id !== 'home').sort(), `${file}: every planet landed on, nothing else`);
    for (const spot of Object.values(flags)) assert.deepEqual(spot, [PAD_FLAG.x, PAD_FLAG.z, 0]);
  }
  assert.deepEqual(backfillFlags({ visited: ['home'] }), {}, 'a fresh explorer has reached nothing yet');
  const s = M.newGame('Flags'); s.placeFlags = { forest: [-22, 3.5, 1000], gate: [-15.2, 30.6, 2000] };
  const back = M.parseSave(JSON.stringify(s))!;
  assert.deepEqual(back.placeFlags, s.placeFlags);
  const junk = JSON.parse(JSON.stringify(s)); junk.placeFlags = { forest: [-22, 3.5, 1000], nowhere: [1, 1, 1], swamp: ['a', 2], canyon: [9999, 0, 1], meadow: [1, Infinity], ['__proto__']: [1, 1, 1], gate: [-15.2, 30.6, -5] };
  assert.deepEqual(M.parseSave(JSON.stringify(junk))!.placeFlags, { forest: [-22, 3.5, 1000], gate: [-15.2, 30.6, 0] });
  assert.equal(M.parseSave(JSON.stringify({ ...junk, placeFlags: 'flags' }))!.placeFlags, undefined);
});

test('the flag model fits its budget: one draw, under 150 triangles, vertex colour, no shadows', () => {
  const { geometry, material } = flagModel();
  const tris = geometry.getAttribute('position').count / 3;
  assert.equal(tris, FLAG_TRIANGLES); assert.ok(tris <= 150);
  assert.ok(geometry.getAttribute('color') && geometry.getAttribute('aFlag'));
  assert.ok(material instanceof T.MeshToonMaterial && material.vertexColors);
  assert.equal(material.userData.sharedKit, true, 'a world rebuild never disposes it');
});

/** A small world for the runtime: the home map, the explorer, a camera target. */
function rig(online = false) {
  const scene = new T.Scene(), state = M.newGame('Rig'), toasts: string[] = [], store = new Map<string, string>();
  const world = { scene, planet: 'home', position: new T.Vector3(), facing: 0, time: 0, state, obstacles: [] as { x: number; z: number; r: number }[], environment: { layout: createEnvironmentLayout('home') }, cameraTarget: new T.Vector3(), interior: null as unknown, fx: null };
  let active = true, on = online;
  const flags = mountPlaceFlags({ world, state: () => state, active: () => active, online: () => on, planted: p => toasts.push(p.id), storage: { getItem: k => store.get(k) ?? null, setItem: (k, v) => { store.set(k, v); } } });
  let clock = 0;
  const at = (x: number, z: number) => { world.position.set(x, 0, z); world.cameraTarget.set(x, 0, z); flags.update(clock += 400); };
  return { world, state, toasts, flags, at, store, setActive: (v: boolean) => { active = v; }, setOnline: (v: boolean) => { on = v; } };
}

test('runtime: walking out plants one flag with one toast, the mesh holds this world\'s flags and hides out of reach', () => {
  const r = rig();
  r.flags.rebuild();
  assert.equal(r.flags.mesh.count, 0); assert.equal(r.flags.mesh.visible, false, 'nothing to draw');
  r.at(0, 3); assert.deepEqual(r.toasts, [], 'the village is home');
  r.at(-30, 2); assert.deepEqual(r.toasts, ['forest']);
  assert.equal(zoneAt({ x: -30, z: 2 }), 'forest');
  assert.equal(r.flags.mesh.count, 1); assert.equal(r.flags.mesh.visible, true);
  r.at(-35, 4); r.at(-30, 2); assert.deepEqual(r.toasts, ['forest'], 'once per place');
  r.at(-30 - FLAG_VIEW_RANGE - 20, 2); assert.equal(r.flags.mesh.visible, false, 'no draw when no flag can be on screen');
  r.at(-30, 2); assert.equal(r.flags.mesh.visible, true);
  r.setActive(false); r.at(30, 2); assert.deepEqual(r.toasts, ['forest'], 'no planting in a mode, a flight or a visit'); assert.equal(r.flags.mesh.visible, false);
  r.setActive(true); r.at(30, 2); assert.deepEqual(r.toasts, ['forest', 'canyon']);
  assert.equal(r.flags.marks().length, 2, 'the map marks this world\'s flags');
  // Another world: its own flags only.
  r.world.planet = 'candy'; r.state.planet = 'candy'; r.flags.rebuild(); assert.equal(r.flags.mesh.count, 0);
  r.at(0, 3.6); assert.deepEqual(r.toasts, ['forest', 'canyon', 'candy']); assert.equal(r.flags.mesh.count, 1);
  assert.deepEqual(r.state.placeFlags!.candy.slice(0, 2), [PAD_FLAG.x, PAD_FLAG.z]);
});

test('runtime: an old save is backfilled silently; online the flags come back after each server update', () => {
  const r = rig(true); r.state.visited.push('toy', 'candy');
  r.flags.rebuild();
  assert.deepEqual(Object.keys(r.state.placeFlags!).sort(), ['candy', 'toy']); assert.deepEqual(r.toasts, [], 'no toast for the backfill');
  r.at(-30, 2); assert.deepEqual(r.toasts, ['forest']);
  assert.ok(JSON.parse(r.store.get('zoo-garden-flags-online')!).Rig.forest, 'kept in this browser for the account');
  // A server update replaces the save without flags (main.ts applyAuthoritativeState drops unknown keys).
  delete r.state.placeFlags; r.at(-31, 2);
  assert.ok(r.state.placeFlags!.forest, 'restored'); assert.deepEqual(r.toasts, ['forest'], 'and not planted again');
  // The server's copy may hold older flags: the browser's are merged in.
  r.state.placeFlags = { toy: [3.2, 5.8, 0] }; r.at(-31, 2);
  assert.ok(r.state.placeFlags.forest && r.state.placeFlags.toy);
});

test('the Goals panel lists every place, reached ones first in the explorer\'s colour, with where to go next', () => {
  const esc = (s: string) => s.replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);
  const html = placesRowHtml({ placeFlags: { forest: [-22, 2, 1] }, color: '#ff7ab0', level: 1 }, esc);
  assert.match(html, /1\/16/); assert.match(html, /--flag:#ff7ab0/);
  assert.equal((html.match(/<li /g) ?? []).length, 16);
  assert.equal((html.match(/class="got"/g) ?? []).length, 1);
  assert.match(html, /Blue Lake Meadow · Out of the south gate\./, 'the next place to go');
  const low = placesRowHtml({ placeFlags: Object.fromEntries(PLACES.filter(p => p.kind !== 'planet').map(p => [p.id, [0, 0, 0]])) as PlaceFlags, level: 1 }, esc);
  assert.match(low, /Level up to land on new worlds\./, 'no planet is open yet at level 1');
  const all = placesRowHtml({ placeFlags: Object.fromEntries(PLACES.map(p => [p.id, [0, 0, 0]])) as PlaceFlags, level: 40 }, esc);
  assert.match(all, /16\/16/); assert.match(all, /Well travelled/);
});
