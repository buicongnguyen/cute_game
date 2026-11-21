// Download weight of the start and of the offline install (docs/QUALITY-PLAN.md section 2, limits in docs/AAA-PLAN.md section 7).
// Run after the Pages build:   npm run build:pages && npm run perf:bytes        (DIST=<folder> to measure another build)
//   (a) the English start: index.html and every script, modulepreload and stylesheet it names, gzip.
//   (b) the Vietnamese start: (a) plus the vi-pack chunk.
//   (c) the install list: the transfer size of every file in the service worker's CORE and EXTRA lists (gzip for scripts, stylesheets,
//       JSON and SVG; raw for models, audio and images), printed per file so a new lazy chunk shows up by name.
//   (d) the lazy split: the feature modules (src/features.ts, src/features/, src/story/) and their Vietnamese phrases
//       (src/features-vi/) are in the lazy chunks "features" and "features-vi", and nothing in (a) or (b) loads those chunks.
//       Read from the chunk map the build writes (.scratch/build/chunk-map.json; CHUNK_MAP=<file> for another build). Exit 1 if not.
//   (e) the limit: (a) and (b) may not pass the start section of promo/perf-baseline.json plus the allowances of the entries with
//       row "start" in promo/perf-ledger.json (compareStart in promo/perf-compare.mjs). Exit 1 if either does.
//       --baseline writes this build's totals as that section (only at the commit a round starts from).
// --json prints one line of JSON for tests and the plan's table.
import { readFileSync, readdirSync, existsSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { gzipSync } from 'node:zlib';
import { compareStart } from './perf-compare.mjs';

/** Where each lazy source module must be built: the first rule that matches a module's path decides. */
export const LAZY_HOMES = [
  ['features-vi', /^src\/features-vi\//],
  ['features', /^src\/(features\.ts$|features\/|story\/)/],
];
const LAZY_NAMES = new Set(LAZY_HOMES.map(([name]) => name));

/**
 * Problems with the lazy split, as sentences (none: []).
 *   map      what vite.config.ts chunkMap() wrote: { chunks: { 'assets/x.js': { name, imports, dynamicImports, modules } } }
 *   starts   { English: [files index.html names], Vietnamese: [those plus the vi-pack chunk] }; paths as in the map
 * A start download is its files plus everything they import statically, however far: a lazy chunk in there is fetched before
 * Start, whether by an import line or a modulepreload.
 */
export function lazySplitProblems(map, starts) {
  const chunks = map?.chunks ?? {}, problems = [];
  for (const [file, chunk] of Object.entries(chunks)) for (const module of chunk.modules) {
    const home = LAZY_HOMES.find(([, rule]) => rule.test(module))?.[0];
    if (home && chunk.name !== home) problems.push(`${module} is built into the "${chunk.name}" chunk (${file}); it belongs in the lazy "${home}" chunk. See manualChunk in vite.config.ts.`);
  }
  for (const [label, files] of Object.entries(starts)) {
    const scripts = files.filter(file => /\.m?js$/.test(file)), missing = scripts.filter(file => !chunks[file]);
    if (missing.length) { problems.push(`the chunk map does not know ${missing.join(', ')} of the ${label} start: it is from another build. Build again, then run this.`); continue; }
    const via = new Map(scripts.map(file => [file, null])), queue = [...scripts];
    while (queue.length) { const at = queue.shift(); for (const next of chunks[at]?.imports ?? []) if (!via.has(next)) { via.set(next, at); queue.push(next); } }
    for (const [file, from] of via) if (LAZY_NAMES.has(chunks[file]?.name)) {
      const trail = [file]; for (let at = from; at; at = via.get(at)) trail.unshift(at);
      problems.push(`the ${label} start downloads the lazy "${chunks[file].name}" chunk: ${from ? trail.join(' imports ') : `index.html names ${file}`}. Load it with import() only, and keep what the start needs out of it.`);
    }
  }
  return problems;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const dist = path.resolve(process.env.DIST || 'dist');
  if (!existsSync(path.join(dist, 'index.html'))) { console.error(`No build in ${dist}. Run npm run build:pages first.`); process.exit(2); }
  const COMPRESSIBLE = /\.(js|mjs|css|json|svg|html|webmanifest)$/i;
  const sizeOf = file => { const bytes = readFileSync(file); return COMPRESSIBLE.test(file) ? gzipSync(bytes, { level: 9 }).length : bytes.length; };
  const kb = n => (n / 1024).toFixed(1).padStart(8) + ' KB';

  const html = readFileSync(path.join(dist, 'index.html'), 'utf8');
  const base = html.match(/<base\s+href="([^"]+)"/)?.[1] ?? null;
  // The deployment base (/cute_game/ for Pages): found from the service worker, or from the first asset URL.
  const sw = existsSync(path.join(dist, 'sw.js')) ? readFileSync(path.join(dist, 'sw.js'), 'utf8') : '';
  const prefix = sw.match(/const BASE=("[^"]*")/) ? JSON.parse(sw.match(/const BASE=("[^"]*")/)[1]) : (base ?? '/');
  const local = url => { const clean = url.split('?')[0].split('#')[0]; return clean.startsWith(prefix) ? clean.slice(prefix.length) : clean.replace(/^\.?\//, ''); };

  const named = new Set(['index.html']);
  for (const m of html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"/g)) named.add(local(m[1]));
  for (const m of html.matchAll(/<link\b[^>]*>/g)) {
    const tag = m[0], rel = tag.match(/\brel="([^"]+)"/)?.[1] ?? '', href = tag.match(/\bhref="([^"]+)"/)?.[1];
    if (href && (/\bmodulepreload\b/.test(rel) || /\bstylesheet\b/.test(rel))) named.add(local(href));
  }
  const english = [...named].filter(f => existsSync(path.join(dist, f))).map(f => [f, sizeOf(path.join(dist, f))]);
  const viChunk = readdirSync(path.join(dist, 'assets')).find(f => /^vi-pack.*\.js$/.test(f));
  const vietnamese = [...english, ...(viChunk ? [[`assets/${viChunk}`, sizeOf(path.join(dist, 'assets', viChunk))]] : [])];

  const list = name => { const at = sw.indexOf(`const ${name}=`); if (at < 0) return []; const line = sw.slice(at + `const ${name}=`.length, sw.indexOf('\n', at)).replace(/;$/, ''); return JSON.parse(line); };
  const install = [...new Set([...list('CORE'), ...list('EXTRA')].map(local))].filter(f => existsSync(path.join(dist, f))).map(f => [f, sizeOf(path.join(dist, f))]);

  // (d) the lazy split.
  const mapFile = path.resolve(process.env.CHUNK_MAP || '.scratch/build/chunk-map.json');
  const map = existsSync(mapFile) ? JSON.parse(readFileSync(mapFile, 'utf8')) : null;
  const split = map ? lazySplitProblems(map, { English: english.map(([f]) => f), Vietnamese: vietnamese.map(([f]) => f) })
    : [`no chunk map at ${path.relative(process.cwd(), mapFile) || mapFile}: the build writes it (vite.config.ts chunkMap). Build again, then run this.`];
  const lazy = Object.entries(map?.chunks ?? {}).filter(([, chunk]) => LAZY_NAMES.has(chunk.name)).map(([f, chunk]) => [f, existsSync(path.join(dist, f)) ? sizeOf(path.join(dist, f)) : 0, chunk.name]);

  const total = rows => rows.reduce((n, [, s]) => n + s, 0);
  // (e) the limit.
  const BASELINE = new URL('./perf-baseline.json', import.meta.url), LEDGER = new URL('./perf-ledger.json', import.meta.url);
  const baseline = existsSync(BASELINE) ? JSON.parse(readFileSync(BASELINE, 'utf8')) : {}, ledger = existsSync(LEDGER) ? JSON.parse(readFileSync(LEDGER, 'utf8')) : { entries: [] };
  const measured = { english: total(english), vietnamese: total(vietnamese) };
  if (process.argv.includes('--baseline')) {
    if (split.length) { console.error('start baseline NOT written: the lazy split is broken'); process.exit(1); }
    writeFileSync(BASELINE, JSON.stringify({ ...baseline, start: measured }, null, 1) + '\n');
    console.log(`start baseline written: English ${measured.english}, Vietnamese ${measured.vietnamese}`); process.exit(0);
  }
  const gate = compareStart(baseline.start, measured, ledger), failed = split.length + gate.failures.length;
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify({ english: total(english), vietnamese: total(vietnamese), install: total(install), viChunk: viChunk ?? null, lazy: Object.fromEntries(lazy.map(([, s, name]) => [name, s])), split, limit: gate }));
    process.exit(failed ? 1 : 0);
  }
  const show = (title, rows, all) => {
    console.log(`\n${title}`);
    for (const [f, s] of (all ? [...rows].sort((a, b) => b[1] - a[1]) : rows)) console.log(`  ${kb(s)}  ${f}`);
    console.log(`  ${kb(total(rows))}  total, ${rows.length} files`);
  };
  show('(a) English start, gzip', english);
  show('(b) Vietnamese start, gzip (English start + vi-pack chunk)', vietnamese.slice(english.length), false);
  console.log(`  ${kb(total(vietnamese))}  total with the English start`);
  show('(c) install list (service worker CORE + EXTRA), transfer size, largest first', install, true);
  console.log('\n(d) lazy split: feature modules and their Vietnamese phrases stay out of the start');
  for (const [f, s, name] of lazy) console.log(`  ${kb(s)}  ${f}  (${name}: ${map.chunks[f].modules.length} modules, loaded after Start)`);
  for (const problem of split) console.log(`  FAIL  ${problem}`);
  if (!split.length) console.log('  ok');
  console.log('\n(e) limit: the baseline plus the named allowances (promo/perf-ledger.json, row "start")');
  for (const line of gate.report) console.log(`  ok    ${line}`);
  for (const line of gate.failures) console.log(`  FAIL  ${line}`);
  console.log(`\nsummary: English start ${kb(total(english)).trim()}, Vietnamese start ${kb(total(vietnamese)).trim()}, install list ${(total(install) / 1048576).toFixed(2)} MB${split.length ? `, lazy split: ${split.length} problem${split.length > 1 ? 's' : ''}` : ''}${gate.failures.length ? ', over the start limit' : ''}`);
  if (failed) process.exit(1);
}
