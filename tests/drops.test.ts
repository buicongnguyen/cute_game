import test from 'node:test';
import assert from 'node:assert/strict';
import { DROP, DropManager, blinkVisible, dropLabel, rarityOf, remaining } from '../src/drops.ts';
import * as M from '../src/model.ts';

const yes = () => true, no = () => false;
/** Run the simulation for `seconds` in 60 Hz steps; returns every event. */
function run(sim: DropManager, seconds: number, hero = { x: 50, z: 50 }, canAdd: (id: string, n: number) => boolean = yes) {
  const all = { picked: [] as unknown[], expired: [] as unknown[], full: [] as unknown[] };
  for (let t = 0; t < seconds - 1e-9; t += 1 / 60) { const e = sim.step(1 / 60, hero, canAdd); all.picked.push(...e.picked); all.expired.push(...e.expired); all.full.push(...e.full); }
  return all;
}

test('the toss is seeded: same seed, same landing spot; lands 0.6-1.5 m away and settles on the ground', () => {
  const land = (seed: number) => { const s = new DropManager(seed); const d = s.spawn('leather', 1, { x: 0, z: 0 }); run(s, 3); return d; };
  const a = land(7), b = land(7), c = land(8);
  assert.deepEqual([a.x, a.z], [b.x, b.z]);
  assert.notDeepEqual([a.x, a.z], [c.x, c.z]);
  for (let seed = 1; seed < 40; seed++) {
    const d = land(seed), r = Math.hypot(d.x, d.z);
    assert.ok(d.resting, 'settled');
    // Ballistic flight (≈0.6 s at 5 m/s up from 0.6 m) carries it reach × 2.4 × t, then small bounces add a little.
    assert.ok(r > .6 && r < 4.2, `landed ${r.toFixed(2)} m away`);
    assert.ok(Math.abs(d.y - DROP.rest) <= DROP.bob + 1e-9, 'bobs ±0.08 m around the resting height');
  }
});

test('gravity 18 and bounce 0.35: the first bounce keeps 35% of the landing speed', () => {
  const s = new DropManager(3), d = s.spawn('bone', 1, { x: 0, z: 0 }, { toss: false });
  let prevVy = 0, bounced = false;
  for (let i = 0; i < 600 && !d.resting; i++) { prevVy = d.vy; s.step(1 / 240, { x: 99, z: 99 }, yes); if (d.vy > 0 && prevVy < 0) { assert.ok(Math.abs(d.vy / (prevVy - DROP.gravity / 240) + DROP.bounce) < .02); bounced = true; break; } }
  assert.ok(bounced);
});

test('magnet: nothing is pulled before 0.6 s or beyond 3.2 m; inside, the drop flies to the hero and is picked up', () => {
  const s = new DropManager(1), d = s.spawn('honey', 2, { x: 0, z: 0 }, { toss: false });
  // Hero 3.0 m away: still no pull at 0.5 s.
  const hero = { x: 3, z: 0 };
  run(s, .5, hero);
  assert.equal(d.x, 0); assert.equal(s.drops.length, 1);
  const ev = run(s, 1, hero);
  assert.equal(ev.picked.length, 1); assert.equal(s.drops.length, 0);
  // Beyond the radius it waits for the whole life.
  const far = new DropManager(1); far.spawn('honey', 1, { x: 0, z: 0 }, { toss: false });
  run(far, 5, { x: DROP.magnetRadius + .05, z: 0 });
  assert.equal(far.drops.length, 1); assert.equal(far.drops[0].x, 0);
});

test('expiry after 30 s; label counts down and turns red under 10 s; blink only in the last 5 s', () => {
  const s = new DropManager(2), d = s.spawn('meat', 1, { x: 0, z: 0 });
  assert.equal(dropLabel(d).text, '⏳ 30s'); assert.equal(dropLabel(d).warn, false);
  run(s, 20.5);
  assert.equal(dropLabel(d).text, '⏳ 10s'); assert.equal(dropLabel(d).warn, true);
  // Blink thresholds.
  for (let t = 0; t < 2; t += .01) assert.equal(blinkVisible(5.01, t), true);
  const flicker = (left: number) => { let on = 0, flips = 0, last = true; for (let t = 0; t < 1; t += .001) { const v = blinkVisible(left, t); on += +v; if (v !== last) flips++; last = v; } return { on, flips }; };
  const slow = flicker(4), fast = flicker(1.5);
  assert.ok(slow.on > 400 && slow.on < 600, 'half visible');
  assert.ok(Math.abs(slow.flips - 16 / Math.PI * 1) < 2 && Math.abs(fast.flips - 30 / Math.PI) < 2, `${slow.flips}/${fast.flips} flips: 16 then 30 rad/s`);
  const ev = run(s, 9.6);
  assert.equal(ev.expired.length, 1); assert.equal(s.drops.length, 0); assert.ok(remaining(d) <= 0);
});

test('bag full: the drop stays on the ground, is not pulled, and warns at most every 4 s', () => {
  const s = new DropManager(4), d = s.spawn('spine', 1, { x: 0, z: 0 }, { toss: false });
  const ev = run(s, 9, { x: .3, z: 0 }, no);
  assert.equal(s.drops.length, 1); assert.equal(d.x, 0);
  assert.equal(ev.full.length, 3, 'warned at 0.6 s, 4.6 s and 8.6 s');
  // Room again: picked up.
  assert.equal(run(s, .1, { x: .3, z: 0 }, yes).picked.length, 1);
});

test('a thrown item is locked for its thrower until they walk 3.6 m away', () => {
  const s = new DropManager(5), d = s.spawn('amber', 1, { x: 0, z: 0 }, { thrown: true, dir: 0 });
  // The thrower stays beside it: never pulled, never collected.
  for (let i = 0; i < 120; i++) s.step(1 / 60, { x: d.x + .3, z: d.z }, yes);
  assert.equal(s.drops.length, 1); assert.ok(d.selfLock);
  run(s, .1, { x: d.x + 3.7, z: d.z }); assert.equal(d.selfLock, false);
  assert.equal(run(s, 2, { x: d.x + 1, z: d.z }).picked.length, 1);
});

test('kill loot no longer goes straight to the bag when the game drops it; pickup puts it there', () => {
  const s = M.newGame(), loot = M.grantDefeat(s, 'mushroom', 8, false, () => 0, false);
  assert.ok(loot.length > 0); assert.equal(s.xp, 8); assert.equal(s.counters.kills, 1);
  for (const item of loot) assert.equal(s.bag[item.id] ?? 0, 0);
  const sim = new DropManager(9); for (const item of loot) sim.spawn(item.id, item.count, { x: 0, z: 0 }, { rarity: rarityOf(M.ITEMS[item.id]) });
  const picked = run(sim, 3, { x: 0, z: 0 }, (id, n) => Number.isSafeInteger((s.bag[id] ?? 0) + n)).picked as { item: string; count: number }[];
  for (const d of picked) assert.ok(M.addItem(s, d.item, d.count));
  for (const item of loot) assert.equal(s.bag[item.id], item.count);
  assert.equal(rarityOf({ rare: true }), 'rare'); assert.equal(rarityOf({ legend: true, rare: true }), 'legendary'); assert.equal(rarityOf({}), 'common');
});
