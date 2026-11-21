import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SpaceFlight, STAR_MAP, SPACE_EDGE, FUEL_MAX, spaceLayout, type SpaceInput } from '../src/space.ts';
import { PALETTES } from '../src/planet-palette.ts';

const empty = () => ({ asteroids: [], dust: [] });
const fly = (flight: SpaceFlight, seconds: number, input: Partial<SpaceInput> = {}) => {
  const events = [];
  for (let t = 0; t < seconds; t += 1 / 60) events.push(...flight.step(1 / 60, { turn: 0, thrust: 0, brake: false, boost: false, aim: null, ...input }));
  return events;
};

test('the sky is the same every flight and keeps asteroids and stardust out of planets', () => {
  const a = spaceLayout(), b = spaceLayout();
  assert.deepEqual(a, b);
  assert.ok(a.asteroids.length > 250, 'belts are well filled');
  assert.equal(a.dust.length, 70);
  for (const p of Object.values(STAR_MAP)) {
    assert.ok(a.asteroids.every(r => Math.hypot(r.x - p.x, r.z - p.z) >= p.r + 30), `asteroids clear of ${p.id}`);
    assert.ok(a.dust.every(d => Math.hypot(d.x - p.x, d.z - p.z) >= p.r + 8), `dust clear of ${p.id}`);
  }
});

test('the ship leaves its planet drifting outward, and thrust burns fuel faster when boosting', () => {
  const cruise = new SpaceFlight('home', ['home'], empty());
  assert.equal(cruise.x, 0); assert.equal(cruise.z, STAR_MAP.home.r + 8); assert.equal(cruise.vz, 14);
  fly(cruise, 2, { thrust: 1 });
  const boosted = new SpaceFlight('home', ['home'], empty());
  fly(boosted, 2, { boost: true });
  assert.ok(boosted.fuel < cruise.fuel - 5, 'boost burns about five times the fuel');
  assert.ok(boosted.speed > cruise.speed, 'boost is faster');
  fly(cruise, 4, { thrust: 1 }); fly(boosted, 4, { boost: true });
  assert.ok(cruise.speed < 30 && boosted.speed < 57, 'speed settles near its cap');
});

test('an empty tank warns once and leaves the ship crawling until stardust refuels it', () => {
  const flight = new SpaceFlight('home', ['home'], { asteroids: [], dust: [{ id: 0, x: 0, z: 200 }] });
  flight.fuel = .5;
  const events = fly(flight, 3, { thrust: 1 });
  assert.equal(flight.fuel, 0);
  assert.equal(events.filter(e => e.kind === 'empty').length, 1);
  const slow = new SpaceFlight('home', ['home'], empty()); slow.fuel = 0; slow.vz = 0;
  const fast = new SpaceFlight('home', ['home'], empty()); fast.vz = 0;
  slow.step(.1, { turn: 0, thrust: 1, brake: false, boost: false }); fast.step(.1, { turn: 0, thrust: 1, brake: false, boost: false });
  assert.ok(Math.abs(slow.vz / fast.vz - .35) < .02, 'no fuel leaves a third of the thrust');
  // Fly onto the dust: fuel comes back and the dust moves elsewhere.
  const dusty = new SpaceFlight('home', ['home'], { asteroids: [], dust: [{ id: 3, x: 0, z: STAR_MAP.home.r + 9 }] }, () => .3);
  dusty.fuel = 10;
  const got = dusty.step(1 / 60);
  assert.deepEqual(got.find(e => e.kind === 'dust'), { kind: 'dust', id: 3, fuel: 10 + 14 });
  assert.notEqual(dusty.layout.dust[0].z, STAR_MAP.home.r + 9);
  dusty.fuel = 95; dusty.layout.dust[0] = { id: 3, x: dusty.x, z: dusty.z }; dusty.step(1 / 60);
  assert.equal(dusty.fuel, FUEL_MAX);
});

test('asteroids push the ship back out and a hard knock is reported', () => {
  const flight = new SpaceFlight('home', ['home'], { asteroids: [{ x: 0, z: 40, r: 3, scale: 4, spin: 0, kind: 'rock' }], dust: [] });
  flight.vz = 25;
  const events = fly(flight, 1.5);
  assert.ok(flight.z <= 40 - 3 - 1.4 + 1e-6, 'the ship never ends inside the rock');
  assert.ok(flight.vz < 0, 'it bounced');
  assert.ok(events.some(e => e.kind === 'bump'));
});

test('steering toward a held pointer turns the ship and pushes it that way', () => {
  const flight = new SpaceFlight('home', ['home'], empty());
  fly(flight, 2, { aim: { x: 600, z: flight.z } });
  assert.ok(Math.abs(flight.yaw - Math.PI / 2) < .15, 'facing +x');
  assert.ok(flight.vx > 10);
});

test('the edge of space pulls the ship back and says so', () => {
  const flight = new SpaceFlight('home', ['home'], empty());
  flight.x = SPACE_EDGE + 30; flight.z = 0; flight.vz = 0; flight.vx = 20;
  const events = fly(flight, 3);
  assert.ok(flight.vx < 0);
  assert.equal(events.filter(e => e.kind === 'edge').length, 1);
});

test('flying near a planet discovers it once, and landing needs the level', () => {
  const candy = STAR_MAP.candy, flight = new SpaceFlight('home', ['home'], empty());
  flight.x = candy.x; flight.z = candy.z + candy.r + 40; flight.vz = 0;
  const seen = flight.step(1 / 60);
  assert.deepEqual(seen.filter(e => e.kind === 'discover'), [{ kind: 'discover', planet: 'candy' }]);
  assert.equal(flight.step(1 / 60).filter(e => e.kind === 'discover').length, 0);
  assert.equal(flight.land(() => true), false, 'not over the planet yet');
  flight.z = candy.z + 5; flight.step(1 / 60);
  assert.equal(flight.over?.id, 'candy');
  assert.equal(flight.land(() => false), false, 'level too low');
  assert.equal(flight.land(() => true), true);
  const landing = fly(flight, 2);
  assert.deepEqual(landing.filter(e => e.kind === 'landed'), [{ kind: 'landed', planet: 'candy' }]);
  assert.ok(flight.landingScale < .4);
  assert.ok(Math.hypot(flight.x - candy.x, flight.z - candy.z) < .5, 'the ship spirals onto the planet');
});

import { planRoutes, routeFuel, AUTOPILOT_CRUISE } from '../src/space.ts';
import * as M from '../src/model.ts';
const levels = Object.fromEntries(Object.entries(M.PLANETS).map(([id, p]) => [id, p.level])) as Record<M.PlanetId, number>;
const allIds = Object.keys(STAR_MAP) as M.PlanetId[];

test('star-map routes list every planet easiest first, then nearest', () => {
  const routes = planRoutes({ from: 'home', level: 30, discovered: allIds, levels });
  assert.equal(routes.length, allIds.length);
  for (let i = 1; i < routes.length; i++) assert.ok(routes[i - 1].level < routes[i].level || routes[i - 1].level === routes[i].level && routes[i - 1].distance <= routes[i].distance);
  assert.deepEqual(routes.map(r => r.id), ['home', 'toy', 'candy', 'jungle', 'ice', 'ocean', 'lava', 'cloud', 'shadow']);
});

test('routes lock the current planet, undiscovered planets and too-high levels', () => {
  const routes = planRoutes({ from: 'home', level: 6, discovered: ['home', 'candy', 'toy', 'ice'], levels });
  const lock = Object.fromEntries(routes.map(r => [r.id, r.lock]));
  assert.equal(lock.home, 'here'); assert.equal(lock.toy, null); assert.equal(lock.candy, null);
  assert.equal(lock.ice, 'level'); assert.equal(lock.jungle, 'undiscovered'); assert.equal(lock.shadow, 'undiscovered');
  assert.equal(planRoutes({ from: 'home', level: 30, discovered: allIds, levels, fuel: 10 }).find(r => r.id === 'shadow')!.lock, 'fuel');
});

test('the recommended pick is the hardest open planet, falling back to home', () => {
  const pick = (o: Parameters<typeof planRoutes>[0]) => planRoutes(o).filter(r => r.recommended).map(r => r.id);
  assert.deepEqual(pick({ from: 'home', level: 6, discovered: ['home', 'candy', 'toy'], levels }), ['candy']);
  assert.deepEqual(pick({ from: 'home', level: 5, discovered: ['home', 'candy', 'toy'], levels }), ['toy']);
  assert.deepEqual(pick({ from: 'home', level: 3, discovered: ['home', 'candy', 'toy'], levels }), []);
  assert.deepEqual(pick({ from: 'toy', level: 4, discovered: ['home', 'toy', 'candy'], levels }), ['home']);
});

test('the autopilot flies to the chosen planet, lands, and stays within its fuel estimate', () => {
  for (const to of ['candy', 'shadow', 'jungle'] as M.PlanetId[]) {
    const flight = new SpaceFlight('home', ['home'], spaceLayout());
    flight.setAutopilot(to);
    let landed: string | null = null, t = 0;
    for (; t < 120 && !landed; t += 1 / 30) for (const e of flight.step(1 / 30)) if (e.kind === 'landed') landed = e.planet;
    assert.equal(landed, to, `reaches ${to}`);
    assert.ok(FUEL_MAX - flight.fuel <= routeFuel('home', to), `${to}: burned ${FUEL_MAX - flight.fuel} <= ${routeFuel('home', to)}`);
    assert.ok(flight.discovered.has(to));
  }
});

test('skipping the autopilot jumps straight to the landing and still burns the trip fuel', () => {
  const flight = new SpaceFlight('home', ['home'], empty());
  assert.equal(flight.skipAutopilot(), false, 'nothing to skip without a destination');
  flight.setAutopilot('ocean'); flight.step(.1);
  assert.equal(flight.skipAutopilot(), true);
  assert.equal(flight.autopilot, null); assert.equal(flight.landing?.planet.id, 'ocean');
  assert.ok(flight.fuel < FUEL_MAX - 10 && flight.fuel > FUEL_MAX - routeFuel('home', 'ocean'));
  const events = fly(flight, 2); assert.ok(events.some(e => e.kind === 'landed' && e.planet === 'ocean'));
  assert.ok(AUTOPILOT_CRUISE > 0);
});

test('a star-map trip still pays the ϟ launch and respects the landing level', () => {
  const s = M.newGame(); s.energy = M.LAUNCH_COST - 1;
  assert.equal(M.launch(s), false); s.energy = M.LAUNCH_COST + 5;
  assert.equal(M.launch(s), true); assert.equal(s.energy, 5);
  assert.equal(M.travel(s, 'candy'), false, 'level 1 cannot land on candy'); s.level = 6;
  assert.equal(M.travel(s, 'candy'), true); assert.equal(s.planet, 'candy');
});

/** Hue (degrees), saturation and value of 0..255 channels. */
const hsv = (r: number, g: number, b: number) => { const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min, h = !d ? 0 : max === r ? ((g - b) / d + 6) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4; return { h: h * 60, s: max ? d / max : 0, v: max / 255 }; };
const hexHsv = (hex: string) => hsv(parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16));
const cloudHsv = (rgba: string) => { const [r, g, b] = rgba.slice(5).split(',').map(Number); return hsv(r, g, b); };

test('space is very dark blue with blue and teal clouds only, and round stars (it was violet with a magenta cloud and square stars)', () => {
  const own = PALETTES.own.space, sky = hexHsv(own.sky);
  assert.ok(sky.h >= 210 && sky.h <= 240, `background hue ${sky.h.toFixed(0)}`); assert.ok(sky.v <= .15, `background value ${sky.v.toFixed(2)}`); assert.ok(sky.s >= .6, 'blue, not grey');
  assert.ok(own.nebulae.length >= 4);
  for (const cloud of own.nebulae) { const c = cloudHsv(cloud); assert.ok(c.h >= 160 && c.h <= 245, `${cloud}: hue ${c.h.toFixed(0)} is blue or teal`); assert.ok(!(c.h >= 280 && c.h <= 330), 'no magenta'); assert.ok(c.s >= .5, 'saturated'); }
  assert.ok(own.nebulae.some(c => cloudHsv(c).h < 190) && own.nebulae.some(c => cloudHsv(c).h > 210), 'both teal and blue');
  assert.equal(own.round, true); assert.equal(own.stars.length, 3);
  for (const star of own.stars) assert.ok(hexHsv(star).v >= .98, 'bright stars');
  const basalt = hexHsv(own.paint!.Basalt); assert.ok(basalt.h >= 210 && basalt.h <= 250, 'the lava rocks are blue-black basalt, not mauve');
  const lower = hexHsv(own.hemi[1]); assert.ok(lower.h >= 210 && lower.h <= 240, 'the light from below is blue too');
  const old = PALETTES.classic!.space;
  assert.ok(hexHsv(old.sky).h > 240, 'the old sky was violet'); assert.ok(old.nebulae.some(c => { const h = cloudHsv(c).h; return h >= 280 && h <= 330; }), 'the old sky had a magenta cloud'); assert.equal(old.round, false); assert.equal(old.paint, undefined);
});
