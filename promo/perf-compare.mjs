// The compare maths of the speed gate (docs/QUALITY-PLAN.md section 2), kept apart from the browser tool so tests/perf-compare.test.mjs can run it.
//
// A measured row:  { key, kind?, main, shadow, triangles, programs, geometries, textures, geometryBytes, visited, level, shadowMap, pitch, invalid? }
// A baseline row:  the larger value of the baseline runs for every field, plus `spread` (larger minus smaller) for the gated ones.
//
// Row kinds (docs/AAA-PLAN.md section 7):
//   standing (no `kind`)  one frozen frame: the 24 standing rows, the moving rows, the space row and the boss rows' frozen frame.
//   live                  some seconds of play on the fake clock: the boss peaks, the scripted fight, the idle village's layout work.
//   report                printed and kept in the baseline, never gated (the Colossus fight, until two runs agree within 5%).
//
// Exact fields (draws, shadow draws, triangles, programs): the limit is the baseline's larger value, plus what a ledger entry
// for this very row allows. The spread between the baseline runs is recorded (it should be 0: the tool reads the same frame of
// the same world in every run) and is NOT added to the limit; the rows that still differ are named in docs/QUALITY-PLAN.md.
// Memory fields (geometries, textures, geometry bytes): may grow 5%.
// `visited` (scene matrices walked) is reported, never gated.
// Live fields (peak draws, peak shadow draws, peak triangles, and Chrome's LayoutCount, RecalcStyleCount and Nodes): may grow 5%
// over the baseline's larger value. Programs created during a live row may not pass the baseline's larger value at all.
export const EXACT = ['main', 'shadow', 'triangles', 'programs'];
export const MEMORY = ['geometries', 'textures', 'geometryBytes'];
export const MEMORY_GROWTH = 0.05;
// `fx` (particle pools and loot cards, drawn while one is alive) and `roam` (a rescued friend's avatar, drawn while it walks through the view)
// are chance: a small allowance, not an exact limit. They are kept out of the exact draw and triangle counts.
export const SOFT = { fx: 3, roam: 16, fxTriangles: 500, roamTriangles: 2500, fxShadow: 3, roamShadow: 16 };
export const LIVE = ['peakMain', 'peakShadow', 'peakTriangles', 'layoutCount', 'recalcStyleCount', 'nodes'];
export const LIVE_GROWTH = 0.05;
/** Counted from zero in a live row, and never allowed above the baseline: a new shader compiled in the middle of a fight is a hitch. */
export const CREATED = ['programsCreated'];
/** Logged with a live row, never gated: they depend on the machine and its load. */
export const LOGGED = ['slowestMs', 'longTasks', 'frames'];
/** Two runs of a report row "agree" when every live field is within this share of the larger value. */
export const REPORT_AGREE = 0.05;
/** Every field the gate reads, for the tool's "smaller of the runs" fold. */
export const FIELDS = [...EXACT, ...MEMORY, ...Object.keys(SOFT), ...LIVE, ...CREATED];
export const kindOf = row => row?.kind ?? 'standing';

/** Fold the rows of several runs of one place into a baseline row. */
export function foldRuns(runs) {
  const kind = kindOf(runs[0]);
  if (kind === 'standing') {
    const out = { key: runs[0].key, level: runs[0].level, shadowMap: runs[0].shadowMap, pitch: runs[0].pitch, spread: {} };
    for (const f of [...EXACT, ...MEMORY, ...Object.keys(SOFT), 'visited']) {
      if (!runs.every(r => typeof r[f] === 'number')) continue;
      const v = runs.map(r => r[f]);
      out[f] = Math.max(...v);
      if (EXACT.includes(f)) out.spread[f] = Math.max(...v) - Math.min(...v);
    }
    return out;
  }
  const out = { key: runs[0].key, kind, level: runs[0].level, spread: {} };
  for (const f of [...LIVE, ...CREATED, ...LOGGED]) {
    if (!runs.every(r => typeof r[f] === 'number')) continue;
    const v = runs.map(r => r[f]);
    out[f] = Math.max(...v);
    if (!LOGGED.includes(f)) out.spread[f] = Math.max(...v) - Math.min(...v);
  }
  if (kind === 'report') out.agree = runs.length > 1 && [...LIVE, ...CREATED].every(f => typeof out[f] !== 'number' || out.spread[f] <= out[f] * REPORT_AGREE);
  return out;
}

/**
 * Fold the runs of one compare into the rows to judge: the smaller value of every gated field (a real addition shows in every
 * run, a chance spark does not). A row that is invalid in ANY run, or missing from any run, is invalid: a run that could not
 * be read must not be hidden by one that could.
 */
export function foldCompareRuns(runs) {
  const keys = [...new Set(runs.flatMap(run => run.map(r => r.key)))];
  return keys.map(key => {
    const rows = runs.map(run => run.find(r => r.key === key)), first = rows.find(Boolean);
    const gone = rows.findIndex(r => !r), bad = rows.findIndex(r => r?.invalid);
    if (gone >= 0) return { ...first, invalid: `missing from run ${gone + 1} of ${runs.length}` };
    if (bad >= 0) return { ...first, invalid: runs.length > 1 ? `run ${bad + 1} of ${runs.length}: ${rows[bad].invalid}` : rows[bad].invalid };
    const out = { ...first };
    for (const f of FIELDS) if (rows.some(r => typeof r[f] === 'number')) { if (rows.every(r => typeof r[f] === 'number')) out[f] = Math.min(...rows.map(r => r[f])); else delete out[f]; } // not measured in one run: not measured
    return out;
  });
}

/** The most a row may show: { field: limit }. A ledger is { entries: [{ row, name, allow: { field: extra } }] }. */
export function rowLimit(base, ledger = { entries: [] }) {
  const limit = {}, extra = {};
  for (const e of ledger.entries ?? []) if (e.row === base.key) for (const [f, n] of Object.entries(e.allow ?? {})) extra[f] = (extra[f] ?? 0) + n;
  if (kindOf(base) !== 'standing') {
    for (const f of LIVE) if (typeof base[f] === 'number') limit[f] = Math.floor(base[f] * (1 + LIVE_GROWTH)) + (extra[f] ?? 0);
    for (const f of CREATED) if (typeof base[f] === 'number') limit[f] = base[f] + (extra[f] ?? 0);
    return limit;
  }
  for (const f of EXACT) limit[f] = base[f] + (extra[f] ?? 0);
  for (const f of MEMORY) limit[f] = Math.floor(base[f] * (1 + MEMORY_GROWTH)) + (extra[f] ?? 0);
  for (const [f, slack] of Object.entries(SOFT)) if (typeof base[f] === 'number') limit[f] = base[f] + slack + (extra[f] ?? 0);
  return limit;
}

const LIVE_NAMES = [['peakMain', 'peak draws'], ['peakShadow', 'peak shadow draws'], ['peakTriangles', 'peak triangles'], ['programsCreated', 'programs created'], ['layoutCount', 'layouts'], ['recalcStyleCount', 'style recalcs'], ['nodes', 'nodes']];
const liveText = (c, limit) => LIVE_NAMES.filter(([f]) => typeof c[f] === 'number').map(([f, name]) => `${name} ${c[f]}${limit && typeof limit[f] === 'number' ? ` (limit ${limit[f]})` : ''}`).join(', ');

/** Compare current rows with the baseline. Returns { ok, failures: [string], report: [string] }. */
export function compareRows(baseline, current, ledger = { entries: [] }) {
  const failures = [], report = [], seen = new Set();
  for (const c of current) {
    seen.add(c.key);
    const base = baseline.rows[c.key], kind = kindOf(base ?? c);
    if (kind === 'report') { // never gated: an invalid or new report row is said, not failed
      report.push(`${c.key}: REPORT ONLY${c.invalid ? ` (invalid: ${c.invalid})` : ''}: ${liveText(c)}${base ? `; baseline ${liveText(base)}, its runs ${base.agree ? 'agreed within 5%' : 'did not agree within 5%'}` : '; not in the baseline'}`);
      continue;
    }
    if (c.invalid) { failures.push(`${c.key}: invalid row (${c.invalid}), refused`); continue; }
    if (!base) { failures.push(`${c.key}: not in the baseline`); continue; }
    if (kindOf(c) !== kind) { failures.push(`${c.key}: is a ${kindOf(c)} row, the baseline holds a ${kind} row`); continue; }
    const limit = rowLimit(base, ledger);
    const gated = kind === 'live' ? Object.keys(limit) : [...EXACT, ...MEMORY, ...Object.keys(SOFT).filter(k => typeof base[k] === 'number')];
    for (const f of gated) {
      if (!(typeof c[f] === 'number')) { failures.push(`${c.key}: ${f} was not measured`); continue; }
      if (c[f] > limit[f]) failures.push(`${c.key}: ${f} ${c[f]} is over its limit ${limit[f]} (baseline ${base[f]})`);
    }
    report.push(kind === 'live' ? `${c.key}: ${liveText(c, limit)}${typeof c.slowestMs === 'number' ? `; logged: slowest frame ${c.slowestMs} ms, ${c.longTasks ?? 0} long task(s)` : ''}`
      : `${c.key}: draws ${c.main}+${c.shadow} (limit ${limit.main}+${limit.shadow}), triangles ${c.triangles} (limit ${limit.triangles}), programs ${c.programs}`);
  }
  for (const key of Object.keys(baseline.rows)) if (!seen.has(key)) { if (kindOf(baseline.rows[key]) === 'report') report.push(`${key}: REPORT ONLY, not measured in this run`); else failures.push(`${key}: missing from this run`); }
  return { ok: failures.length === 0, failures, report };
}

// ---- The before-play download (promo/first-visit-bytes.mjs, docs/AAA-PLAN.md section 7) ----
// A measured case:  { key: 'new/en', beforeStart: window, afterStart: window };  a window is { total, byType: { js, css, ... }, lazy: { features, 'features-vi' }, files }.
// Limit: the baseline's larger value plus 1% noise (plus the spread its runs showed: an icon may land on either side of the
// Start button), for each window's total and for each type in it (so no new audio, model,
// image or font slips in under the code's 1%). After Start the named lazy chunks are counted apart, against their own allowances.
export const DOWNLOAD_NOISE = 0.01;
export const DOWNLOAD_TYPES = ['js', 'css', 'glb', 'audio', 'image', 'font', 'other'];
/** The lazy chunks that may arrive after Start, with the most each may weigh (gzip bytes; section 7's install-list table). */
export const LAZY_ALLOWANCE = { features: 30 * 1024, 'features-vi': 15 * 1024 };
/** Which named lazy chunk a built file belongs to, or null. */
export const lazyChunkOf = file => { const m = /(?:^|\/)assets\/(features-vi|features)-[^/]+\.(?:js|css)$/.exec(file); return m ? m[1] : null; };

/** Fold the measured cases of several runs into the baseline's download section. */
export function foldDownload(runs) {
  const cases = {};
  for (const first of runs[0]) {
    const all = runs.map(run => run.find(c => c.key === first.key)), out = { key: first.key };
    for (const w of ['beforeStart', 'afterStart']) {
      const totals = all.map(c => c[w].total), byType = {}, typeSpread = {};
      for (const t of DOWNLOAD_TYPES) { const v = all.map(c => c[w].byType[t] ?? 0); byType[t] = Math.max(...v); if (Math.max(...v) !== Math.min(...v)) typeSpread[t] = Math.max(...v) - Math.min(...v); }
      out[w] = { total: Math.max(...totals), spread: Math.max(...totals) - Math.min(...totals), byType, typeSpread, files: Math.max(...all.map(c => c[w].files)) };
    }
    cases[first.key] = out;
  }
  return { runs: runs.length, cases };
}
/** Compare measured cases with the baseline's download section. Returns { ok, failures, report }. */
export function compareDownload(baseline, current) {
  const failures = [], report = [], seen = new Set(), limitOf = n => Math.floor(n * (1 + DOWNLOAD_NOISE));
  for (const c of current) {
    seen.add(c.key);
    const base = baseline?.cases?.[c.key];
    if (c.invalid) { failures.push(`${c.key}: invalid (${c.invalid}), refused`); continue; }
    if (!base) { failures.push(`${c.key}: not in the baseline`); continue; }
    for (const w of ['beforeStart', 'afterStart']) {
      const name = w === 'beforeStart' ? 'up to Start' : 'after Start';
      const most = limitOf(base[w].total) + (base[w].spread ?? 0), mostOf = t => limitOf(base[w].byType[t] ?? 0) + (base[w].typeSpread?.[t] ?? 0);
      if (c[w].total > most) failures.push(`${c.key}: ${name} ${c[w].total} bytes is over its limit ${most} (baseline ${base[w].total})`);
      for (const t of DOWNLOAD_TYPES) if ((c[w].byType[t] ?? 0) > mostOf(t)) failures.push(`${c.key}: ${name}, ${t} ${c[w].byType[t]} bytes is over its limit ${mostOf(t)} (baseline ${base[w].byType[t] ?? 0})`);
      for (const [chunk, bytes] of Object.entries(c[w].lazy ?? {})) {
        if (w === 'beforeStart' && bytes) failures.push(`${c.key}: the lazy chunk ${chunk} (${bytes} bytes) loaded before Start`);
        else if (bytes > (LAZY_ALLOWANCE[chunk] ?? 0)) failures.push(`${c.key}: the lazy chunk ${chunk} is ${bytes} bytes, over its allowance ${LAZY_ALLOWANCE[chunk] ?? 0}`);
      }
    }
    report.push(`${c.key}: up to Start ${c.beforeStart.total} (limit ${limitOf(base.beforeStart.total) + (base.beforeStart.spread ?? 0)}), after Start ${c.afterStart.total} (limit ${limitOf(base.afterStart.total) + (base.afterStart.spread ?? 0)})`);
  }
  for (const key of Object.keys(baseline?.cases ?? {})) if (!seen.has(key)) failures.push(`${key}: missing from this run`);
  return { ok: failures.length === 0, failures, report };
}

// ---- The start download (promo/start-bytes.mjs, docs/AAA-PLAN.md section 7) ----
// The baseline's start section is { english, vietnamese }: gzip bytes of everything fetched before the Start button, taken at
// the commit a round starts from. A package that must add to the start gets a named ledger entry with row "start":
//   { "row": "start", "name": "<package>", "allow": { "english": 927, "vietnamese": 927 }, "why": "<what the bytes are>" }
// The limit of each total is the baseline plus the sum of those allowances, exact: gzip of the same build gives the same bytes.
// An entry may be negative (a payback), which lowers the limit for everyone after it.
export const START_ROW = 'start';
export const START_FIELDS = ['english', 'vietnamese'];
/** The most each start may weigh: { english, vietnamese }, with the entries that were counted. */
export function startLimit(baseline, ledger = { entries: [] }) {
  const entries = (ledger.entries ?? []).filter(e => e.row === START_ROW), limit = {};
  for (const field of START_FIELDS) limit[field] = (baseline?.[field] ?? 0) + entries.reduce((n, e) => n + (e.allow?.[field] ?? 0), 0);
  return { limit, entries };
}
/** Compare measured start totals with the baseline's start section. Returns { ok, failures, report }. */
export function compareStart(baseline, current, ledger = { entries: [] }) {
  const failures = [], report = [];
  if (!baseline || START_FIELDS.some(field => !Number.isFinite(baseline[field]))) return { ok: false, failures: ['the baseline has no start section: write it with node promo/start-bytes.mjs --baseline at the commit the round starts from'], report };
  const { limit, entries } = startLimit(baseline, ledger);
  for (const e of entries) {
    if (!e.name || !e.why) failures.push(`a start entry of the ledger needs "name" and "why" (${JSON.stringify(e)})`);
    for (const [field, n] of Object.entries(e.allow ?? {})) if (!START_FIELDS.includes(field) || !Number.isFinite(n)) failures.push(`${e.name ?? 'a start entry'}: "${field}" is not a start total with a number of bytes`);
  }
  for (const field of START_FIELDS) {
    const now = current?.[field], allowed = limit[field] - baseline[field];
    if (!Number.isFinite(now)) { failures.push(`${field} start: not measured`); continue; }
    const line = `${field} start ${now} bytes (baseline ${baseline[field]}${allowed ? `, allowances ${allowed > 0 ? '+' : ''}${allowed}` : ''}, limit ${limit[field]})`;
    if (now > limit[field]) failures.push(`${line}: ${now - limit[field]} bytes over. Move code behind import(), or add a named entry with row "start" to promo/perf-ledger.json if the growth is decided.`);
    else report.push(line);
  }
  return { ok: failures.length === 0, failures, report };
}
