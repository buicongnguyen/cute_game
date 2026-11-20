// The compare maths of the speed gate (docs/QUALITY-PLAN.md section 2), kept apart from the browser tool so tests/perf-compare.test.mjs can run it.
//
// A measured row:  { key, main, shadow, triangles, programs, geometries, textures, geometryBytes, visited, level, shadowMap, pitch, invalid? }
// A baseline row:  the larger value of the baseline runs for every field, plus `spread` (larger minus smaller) for the exact ones.
//
// Exact fields (draws, shadow draws, triangles, programs): the limit is the baseline's larger value plus the spread the two
// baseline runs showed (0 when they agreed), plus what a ledger entry for this very row allows.
// Memory fields (geometries, textures, geometry bytes): may grow 5%.
// `visited` (scene matrices walked) is reported, never gated.
export const EXACT = ['main', 'shadow', 'triangles', 'programs'];
export const MEMORY = ['geometries', 'textures', 'geometryBytes'];
export const MEMORY_GROWTH = 0.05;
// `fx` (particle pools and loot cards, drawn while one is alive) and `roam` (a rescued friend's avatar, drawn while it walks through the view)
// are chance: a small allowance, not an exact limit. They are kept out of the exact draw and triangle counts.
export const SOFT = { fx: 3, roam: 16, fxTriangles: 500, roamTriangles: 2500 };

/** Fold the rows of several runs of one place into a baseline row. */
export function foldRuns(runs) {
  const out = { key: runs[0].key, level: runs[0].level, shadowMap: runs[0].shadowMap, pitch: runs[0].pitch, spread: {} };
  for (const f of [...EXACT, ...MEMORY, ...Object.keys(SOFT), 'visited']) {
    if (!runs.every(r => typeof r[f] === 'number')) continue;
    const v = runs.map(r => r[f]);
    out[f] = Math.max(...v);
    if (EXACT.includes(f)) out.spread[f] = Math.max(...v) - Math.min(...v);
  }
  return out;
}

/** The most a row may show: { field: limit }. A ledger is { entries: [{ row, name, allow: { field: extra } }] }. */
export function rowLimit(base, ledger = { entries: [] }) {
  const limit = {}, extra = {};
  for (const e of ledger.entries ?? []) if (e.row === base.key) for (const [f, n] of Object.entries(e.allow ?? {})) extra[f] = (extra[f] ?? 0) + n;
  for (const f of EXACT) limit[f] = base[f] + (base.spread?.[f] ?? 0) + (extra[f] ?? 0);
  for (const f of MEMORY) limit[f] = Math.floor(base[f] * (1 + MEMORY_GROWTH)) + (extra[f] ?? 0);
  for (const [f, slack] of Object.entries(SOFT)) if (typeof base[f] === 'number') limit[f] = base[f] + slack + (extra[f] ?? 0);
  return limit;
}

/** Compare current rows with the baseline. Returns { ok, failures: [string], report: [string] }. */
export function compareRows(baseline, current, ledger = { entries: [] }) {
  const failures = [], report = [], seen = new Set();
  for (const c of current) {
    seen.add(c.key);
    if (c.invalid) { failures.push(`${c.key}: invalid row (${c.invalid}), refused`); continue; }
    const base = baseline.rows[c.key];
    if (!base) { failures.push(`${c.key}: not in the baseline`); continue; }
    const limit = rowLimit(base, ledger);
    for (const f of [...EXACT, ...MEMORY, ...Object.keys(SOFT).filter(k => typeof base[k] === 'number')]) {
      if (!(typeof c[f] === 'number')) { failures.push(`${c.key}: ${f} was not measured`); continue; }
      if (c[f] > limit[f]) failures.push(`${c.key}: ${f} ${c[f]} is over its limit ${limit[f]} (baseline ${base[f]})`);
    }
    report.push(`${c.key}: draws ${c.main}+${c.shadow} (limit ${limit.main}+${limit.shadow}), triangles ${c.triangles} (limit ${limit.triangles}), programs ${c.programs}`);
  }
  for (const key of Object.keys(baseline.rows)) if (!seen.has(key)) failures.push(`${key}: missing from this run`);
  return { ok: failures.length === 0, failures, report };
}
