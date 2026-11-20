import test from 'node:test';
import assert from 'node:assert/strict';
import { compareRows, foldRuns, rowLimit } from '../promo/perf-compare.mjs';

const row = (key, o = {}) => ({ key, main: 100, shadow: 40, triangles: 200000, programs: 30, geometries: 500, textures: 80, geometryBytes: 4_000_000, visited: 9000, level: 'high', shadowMap: 2048, pitch: 42, ...o });
const baseline = rows => ({ rows: Object.fromEntries(rows.map(r => [r.key, foldRuns([r])])) });

test('an equal row passes, and one more draw on an exact row fails', () => {
  const b = baseline([row('a')]);
  assert.equal(compareRows(b, [row('a')]).ok, true);
  for (const f of ['main', 'shadow', 'triangles', 'programs']) {
    const r = compareRows(b, [row('a', { [f]: row('a')[f] + 1 })]);
    assert.equal(r.ok, false, f); assert.match(r.failures[0], new RegExp(f));
  }
  assert.equal(compareRows(b, [row('a', { main: 99 })]).ok, true, 'fewer draws pass');
});

test('two baseline runs that differed: the limit is the larger value plus the spread', () => {
  const b = baseline([]); b.rows.a = foldRuns([row('a', { main: 100 }), row('a', { main: 103 })]);
  assert.equal(b.rows.a.main, 103); assert.equal(b.rows.a.spread.main, 3);
  assert.equal(rowLimit(b.rows.a).main, 106);
  assert.equal(compareRows(b, [row('a', { main: 106 })]).ok, true);
  assert.equal(compareRows(b, [row('a', { main: 107 })]).ok, false);
  assert.equal(rowLimit(b.rows.a).shadow, 40, 'a field that agreed keeps an exact limit');
});

test('a ledger entry raises only its own row', () => {
  const b = baseline([row('a'), row('b')]);
  const ledger = { entries: [{ row: 'a', name: 'WP5 sea', allow: { main: 6, triangles: 1000 } }] };
  const now = [row('a', { main: 106, triangles: 201000 }), row('b', { main: 106 })];
  const r = compareRows(b, now, ledger);
  assert.equal(r.ok, false); assert.equal(r.failures.length, 1); assert.match(r.failures[0], /^b: main/);
  assert.equal(compareRows(b, [row('a', { main: 107 }), row('b')], ledger).ok, false, 'only up to what the entry allows');
});

test('a missing row fails and an invalid row is refused', () => {
  const b = baseline([row('a'), row('b')]);
  const missing = compareRows(b, [row('a')]); assert.equal(missing.ok, false); assert.match(missing.failures[0], /b: missing/);
  const bad = compareRows(b, [row('a', { invalid: 'camera 38.2 degrees, not 42' }), row('b')]);
  assert.equal(bad.ok, false); assert.match(bad.failures[0], /invalid row.*refused/);
  assert.equal(compareRows(b, [row('a'), row('b'), row('c')]).ok, false, 'a row that is not in the baseline fails');
});

test('memory counters may grow 5%, no more', () => {
  const b = baseline([row('a')]);
  assert.equal(compareRows(b, [row('a', { geometries: 525, textures: 84, geometryBytes: 4_200_000 })]).ok, true);
  for (const o of [{ geometries: 526 }, { textures: 85 }, { geometryBytes: 4_200_001 }]) assert.equal(compareRows(b, [row('a', o)]).ok, false, JSON.stringify(o));
});
