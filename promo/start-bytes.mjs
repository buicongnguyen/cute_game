// Download weight of the start and of the offline install (docs/QUALITY-PLAN.md section 2, limits in docs/AAA-PLAN.md section 7).
// Run after the Pages build:   npm run build:pages && npm run perf:bytes        (DIST=<folder> to measure another build)
//   (a) the English start: index.html and every script, modulepreload and stylesheet it names, gzip.
//   (b) the Vietnamese start: (a) plus the vi-pack chunk.
//   (c) the install list: the transfer size of every file in the service worker's CORE and EXTRA lists (gzip for scripts, stylesheets,
//       JSON and SVG; raw for models, audio and images), printed per file so a new lazy chunk shows up by name.
// --json prints one line of JSON for tests and the plan's table.
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { gzipSync } from 'node:zlib';

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

const total = rows => rows.reduce((n, [, s]) => n + s, 0);
if (process.argv.includes('--json')) { console.log(JSON.stringify({ english: total(english), vietnamese: total(vietnamese), install: total(install), viChunk: viChunk ?? null })); process.exit(0); }
const show = (title, rows, all) => {
  console.log(`\n${title}`);
  for (const [f, s] of (all ? [...rows].sort((a, b) => b[1] - a[1]) : rows)) console.log(`  ${kb(s)}  ${f}`);
  console.log(`  ${kb(total(rows))}  total, ${rows.length} files`);
};
show('(a) English start, gzip', english);
show('(b) Vietnamese start, gzip (English start + vi-pack chunk)', vietnamese.slice(english.length), false);
console.log(`  ${kb(total(vietnamese))}  total with the English start`);
show('(c) install list (service worker CORE + EXTRA), transfer size, largest first', install, true);
console.log(`\nsummary: English start ${kb(total(english)).trim()}, Vietnamese start ${kb(total(vietnamese)).trim()}, install list ${(total(install) / 1048576).toFixed(2)} MB`);
