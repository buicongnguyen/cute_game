import test from 'node:test';
import assert from 'node:assert/strict';
import { compareRows, foldRuns, foldCompareRuns, rowLimit } from '../promo/perf-compare.mjs';

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

test('two baseline runs that differed: the limit is the larger value, the spread is recorded and not added', () => {
  const b = baseline([]); b.rows.a = foldRuns([row('a', { main: 100 }), row('a', { main: 103 })]);
  assert.equal(b.rows.a.main, 103); assert.equal(b.rows.a.spread.main, 3);
  assert.equal(rowLimit(b.rows.a).main, 103);
  assert.equal(compareRows(b, [row('a', { main: 103 })]).ok, true);
  assert.equal(compareRows(b, [row('a', { main: 104 })]).ok, false);
  assert.equal(rowLimit(b.rows.a).shadow, 40);
});

test('several compare runs: the smaller value of each field; invalid or missing in ANY run is invalid', () => {
  const two = foldCompareRuns([[row('a', { main: 104, programs: 30 }), row('b')], [row('a', { main: 100, programs: 31 }), row('b', { triangles: 199000 })]]);
  assert.deepEqual(two.map(r => r.key), ['a', 'b']);
  assert.equal(two[0].main, 100); assert.equal(two[0].programs, 30); assert.equal(two[1].triangles, 199000); assert.equal(two[0].invalid, undefined);
  // Invalid in the second run only: the first run's good numbers must not hide it.
  const bad = foldCompareRuns([[row('a')], [row('a', { invalid: 'a dialog is open' })]]);
  assert.match(bad[0].invalid, /run 2 of 2: a dialog is open/);
  assert.equal(compareRows(baseline([row('a')]), bad).ok, false);
  assert.match(foldCompareRuns([[row('a', { invalid: 'camera off' })], [row('a')]])[0].invalid, /run 1 of 2: camera off/);
  // Missing from the second run (the browser died half way), or only there.
  const gone = foldCompareRuns([[row('a'), row('b')], [row('a')]]);
  assert.match(gone.find(r => r.key === 'b').invalid, /missing from run 2 of 2/);
  assert.match(compareRows(baseline([row('a'), row('b')]), gone).failures[0], /b: invalid row \(missing from run 2 of 2\), refused/);
  assert.match(foldCompareRuns([[row('a')], [row('a'), row('c')]]).find(r => r.key === 'c').invalid, /missing from run 1 of 2/);
  // A field one run did not measure is not measured.
  const half = row('a'); delete half.textures;
  assert.equal('textures' in foldCompareRuns([[row('a')], [half]])[0], false);
  assert.match(compareRows(baseline([row('a')]), foldCompareRuns([[row('a')], [half]])).failures[0], /textures was not measured/);
  // One run keeps its row as it is, live rows fold their own fields, and a report row stays a report.
  assert.deepEqual(foldCompareRuns([[row('a')]]), [row('a')]);
  const peak = o => ({ key: 'p', kind: 'live', peakMain: 200, layoutCount: 100, programsCreated: 1, level: 'high', ...o });
  assert.equal(foldCompareRuns([[peak({ peakMain: 210, layoutCount: 90 })], [peak()]])[0].peakMain, 200);
  assert.equal(foldCompareRuns([[peak({ peakMain: 210, layoutCount: 90 })], [peak()]])[0].layoutCount, 90);
  assert.equal(compareRows({ rows: {} }, foldCompareRuns([[peak({ kind: 'report' })], [peak({ kind: 'report', invalid: 'gone' })]])).ok, true);
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

test('chance counts (fx, roam and their triangles) have a small allowance above the baseline, no more', () => {
  const b = baseline([row('a', { fx: 2, roam: 13, fxTriangles: 300, roamTriangles: 9000, fxShadow: 1, roamShadow: 13 })]);
  const ok = row('a', { fx: 5, roam: 29, fxTriangles: 800, roamTriangles: 11500, fxShadow: 4, roamShadow: 29 });
  assert.equal(compareRows(b, [ok]).ok, true);
  for (const o of [{ fx: 6 }, { roam: 30 }, { fxTriangles: 801 }, { roamTriangles: 11501 }, { fxShadow: 5 }, { roamShadow: 30 }]) assert.equal(compareRows(b, [{ ...ok, ...o }]).ok, false, JSON.stringify(o));
});

// ---- The WP3 row kinds (docs/AAA-PLAN.md section 7) ----
const live = (key, o = {}) => ({ key, kind: 'live', peakMain: 200, peakShadow: 40, peakTriangles: 100000, programsCreated: 2, layoutCount: 100, recalcStyleCount: 300, nodes: 2000, frames: 240, slowestMs: 20, longTasks: 0, level: 'high', ...o });

test('frozen frames of the new rows (moving, space, a boss mid-telegraph) are exact like a standing row', () => {
  for (const key of ['village-move/late/42/desktop-high', 'space/late/frame/desktop-high', 'bear/mid/frame/desktop-high', 'treant/mid/frame/phone-high']) {
    const b = baseline([row(key)]);
    assert.equal(b.rows[key].kind, undefined, 'a standing row');
    assert.equal(compareRows(b, [row(key)]).ok, true);
    assert.equal(compareRows(b, [row(key, { main: 101 })]).ok, false, key);
    assert.equal(compareRows(b, [row(key, { programs: 31 })]).ok, false, key);
  }
});

test('live rows: draws, triangles and layout counts may grow 5%, no more', () => {
  const b = baseline([live('bear/mid/peak/desktop-high')]), key = 'bear/mid/peak/desktop-high';
  assert.equal(b.rows[key].kind, 'live');
  assert.deepEqual(rowLimit(b.rows[key]), { peakMain: 210, peakShadow: 42, peakTriangles: 105000, layoutCount: 105, recalcStyleCount: 315, nodes: 2100, programsCreated: 2 });
  assert.equal(compareRows(b, [live(key, { peakMain: 210, peakShadow: 42, peakTriangles: 105000, layoutCount: 105, recalcStyleCount: 315, nodes: 2100 })]).ok, true);
  for (const o of [{ peakMain: 211 }, { peakShadow: 43 }, { peakTriangles: 105001 }, { layoutCount: 106 }, { recalcStyleCount: 316 }, { nodes: 2101 }]) {
    const r = compareRows(b, [live(key, o)]); assert.equal(r.ok, false, JSON.stringify(o)); assert.match(r.failures[0], new RegExp(Object.keys(o)[0]));
  }
  const two = foldRuns([live(key, { layoutCount: 100 }), live(key, { layoutCount: 110 })]);
  assert.equal(two.spread.layoutCount, 10); assert.equal(rowLimit(two).layoutCount, 115, 'baseline runs that differed: 5% over the larger value, the spread is not added');
  assert.equal(compareRows(b, [live(key, { slowestMs: 900, longTasks: 40 })]).ok, true, 'the slowest frame and long tasks are logged, not gated');
  assert.match(compareRows(b, [live(key, { slowestMs: 900, longTasks: 40 })]).report[0], /slowest frame 900 ms, 40 long task/);
});

test('programs created during a live row: above the baseline fails, with no 5%', () => {
  const key = 'swampfight/late/peak/desktop-high', b = baseline([live(key, { programsCreated: 40 })]);
  assert.equal(compareRows(b, [live(key, { programsCreated: 40 })]).ok, true);
  assert.equal(compareRows(b, [live(key, { programsCreated: 39 })]).ok, true);
  const r = compareRows(b, [live(key, { programsCreated: 41 })]); assert.equal(r.ok, false); assert.match(r.failures[0], /programsCreated 41 is over its limit 40/);
  // Two baseline runs that differed: the larger value is the limit, the spread is not added on top.
  b.rows[key] = foldRuns([live(key, { programsCreated: 1 }), live(key, { programsCreated: 3 })]);
  assert.equal(rowLimit(b.rows[key]).programsCreated, 3);
  const ledger = { entries: [{ row: key, name: 'WP19 sprites', allow: { programsCreated: 1, peakMain: 4 } }] };
  assert.equal(rowLimit(b.rows[key], ledger).programsCreated, 4); assert.equal(rowLimit(b.rows[key], ledger).peakMain, 214);
});

test('the idle village row gates only the layout work it holds', () => {
  const key = 'idle/late/layout/desktop-high', idle = o => ({ key, kind: 'live', layoutCount: 60, recalcStyleCount: 320, nodes: 2130, frames: 240, slowestMs: 30, longTasks: 0, level: 'high', ...o });
  const b = baseline([idle()]);
  assert.deepEqual(Object.keys(rowLimit(b.rows[key])).sort(), ['layoutCount', 'nodes', 'recalcStyleCount']);
  assert.equal(compareRows(b, [idle({ layoutCount: 63 })]).ok, true);
  assert.equal(compareRows(b, [idle({ layoutCount: 64 })]).ok, false);
  const gone = idle(); delete gone.nodes; assert.match(compareRows(b, [gone]).failures[0], /nodes was not measured/);
});

test('a live row is refused when invalid, missing, or measured as another kind', () => {
  const key = 'treant/mid/peak/desktop-high', b = baseline([live(key)]);
  assert.match(compareRows(b, [live(key, { invalid: 'the treant left the fight' })]).failures[0], /invalid row.*refused/);
  assert.match(compareRows(b, []).failures[0], /missing from this run/);
  assert.match(compareRows(b, [row(key)]).failures[0], /is a standing row, the baseline holds a live row/);
});

test('the Colossus row is a report: kept in the baseline, printed, never a failure', () => {
  const key = 'colossus/late/peak/desktop-high', rep = o => live(key, { kind: 'report', ...o });
  const agreed = foldRuns([rep(), rep({ peakMain: 205 })]), apart = foldRuns([rep(), rep({ peakMain: 260 })]);
  assert.equal(agreed.kind, 'report'); assert.equal(agreed.agree, true); assert.equal(apart.agree, false, 'more than 5% apart');
  assert.equal(foldRuns([rep()]).agree, false, 'one run cannot agree with itself');
  const b = { rows: { [key]: apart } };
  const worse = compareRows(b, [rep({ peakMain: 999, programsCreated: 50 })]);
  assert.equal(worse.ok, true); assert.match(worse.report[0], /REPORT ONLY.*peak draws 999.*did not agree within 5%/);
  assert.equal(compareRows(b, [rep({ invalid: 'the Colossus never woke' })]).ok, true, 'an invalid report is said, not failed');
  assert.equal(compareRows(b, []).ok, true, 'and it may be left out of a run');
  assert.equal(compareRows({ rows: {} }, [rep()]).ok, true, 'a report row needs no baseline');
});

// ---- The before-play download (promo/first-visit-bytes.mjs) ----
import { compareDownload, foldDownload, lazyChunkOf, LAZY_ALLOWANCE } from '../promo/perf-compare.mjs';
const win = (o = {}) => ({ total: 1_000_000, byType: { js: 600_000, css: 40_000, glb: 300_000, audio: 0, image: 50_000, font: 8_000, other: 2_000 }, lazy: {}, files: 30, ...o });
const visit = (key, before = {}, after = {}) => ({ key, beforeStart: win(before), afterStart: win({ total: 200_000, byType: { js: 20_000, css: 0, glb: 180_000, audio: 0, image: 0, font: 0, other: 0 }, files: 4, ...after }) });

test('the download: exact plus 1% noise for each window and each type', () => {
  const b = foldDownload([[visit('new/en')], [visit('new/en')]]);
  assert.equal(b.runs, 2); assert.equal(b.cases['new/en'].beforeStart.spread, 0);
  assert.equal(compareDownload(b, [visit('new/en')]).ok, true);
  assert.equal(compareDownload(b, [visit('new/en', { total: 1_010_000 })]).ok, true);
  assert.match(compareDownload(b, [visit('new/en', { total: 1_010_001 })]).failures[0], /up to Start 1010001 bytes is over its limit 1010000/);
  assert.match(compareDownload(b, [visit('new/en', {}, { total: 202_001 })]).failures[0], /after Start/);
  // A new sound after Start is not hidden by the 1%: its type had nothing.
  const sound = visit('new/en', {}, { byType: { js: 20_000, css: 0, glb: 180_000, audio: 900, image: 0, font: 0, other: 0 } });
  assert.match(compareDownload(b, [sound]).failures[0], /after Start, audio 900 bytes is over its limit 0/);
  assert.match(compareDownload(b, []).failures[0], /new\/en: missing/);
  assert.match(compareDownload(b, [visit('late/vi')]).failures[0], /not in the baseline/);
  assert.match(compareDownload(b, [{ ...visit('new/en'), invalid: 'play never started' }]).failures[0], /refused/);
});

test('the download: the named lazy chunks are counted apart, after Start only, within their allowances', () => {
  assert.equal(lazyChunkOf('assets/features-B1x2.js'), 'features'); assert.equal(lazyChunkOf('assets/features-vi-9aZ.js'), 'features-vi');
  assert.equal(lazyChunkOf('assets/features-B1x2.css'), 'features'); assert.equal(lazyChunkOf('assets/world-B1x2.js'), null);
  const b = foldDownload([[visit('new/vi')]]);
  assert.equal(compareDownload(b, [visit('new/vi', {}, { lazy: { features: LAZY_ALLOWANCE.features, 'features-vi': LAZY_ALLOWANCE['features-vi'] } })]).ok, true);
  assert.match(compareDownload(b, [visit('new/vi', {}, { lazy: { features: LAZY_ALLOWANCE.features + 1 } })]).failures[0], /lazy chunk features is 30721 bytes, over its allowance 30720/);
  assert.match(compareDownload(b, [visit('new/vi', { lazy: { features: 500 } })]).failures[0], /loaded before Start/);
});

test('the download baseline keeps the larger of two runs and their spread', () => {
  const b = foldDownload([[visit('late/en', { total: 1_000_000 })], [visit('late/en', { total: 1_004_000 })]]);
  assert.equal(b.cases['late/en'].beforeStart.total, 1_004_000); assert.equal(b.cases['late/en'].beforeStart.spread, 4_000);
  assert.equal(compareDownload(b, [visit('late/en', { total: 1_018_040 })]).ok, true, '1% over the larger value, plus the spread');
  assert.equal(compareDownload(b, [visit('late/en', { total: 1_018_041 })]).ok, false);
  const icons = n => ({ byType: { ...win().byType, image: n } }), c = foldDownload([[visit('late/en', icons(50_000))], [visit('late/en', icons(54_000))]]);
  assert.deepEqual(c.cases['late/en'].beforeStart.typeSpread, { image: 4_000 });
  assert.equal(compareDownload(c, [visit('late/en', icons(58_540))]).ok, true); assert.equal(compareDownload(c, [visit('late/en', icons(58_541))]).ok, false);
});
