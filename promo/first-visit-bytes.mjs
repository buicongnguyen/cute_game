// The before-play download of a first visit (docs/AAA-PLAN.md section 7, WP3): what a new visitor's browser fetches.
// Run after the Pages build:   npm run build:pages && npm run perf:download        (prints the four cases)
//   node promo/first-visit-bytes.mjs --baseline    measure RUNS times (default 2) and write the `download` section of promo/perf-baseline.json
//   node promo/first-visit-bytes.mjs --compare     measure once and compare with that section; exit 1 on anything over its limit
//   PORT=5297 is the private port of the `vite preview` this tool starts and stops itself (SERVER=<url of the game> uses a server
//   that already runs).  DIST=<folder> measures another build.  ONLY=new,vi keeps the cases whose key holds one of these words.
//   PLAYWRIGHT_MODULE=<path to playwright/index.mjs> if playwright is not found.
//
// Four cases: promo/save-new.json and promo/save-late.json, in English and Vietnamese. Each is a fresh browser profile with
// the service worker BLOCKED: the worker registers a few seconds after the art goes quiet (src/art-status.ts, src/art-retry.ts)
// and then installs its whole list, so with it running a fixed window would catch a timing-dependent slice of that install.
// The install list has its own row (npm run perf:bytes, row c).
// Two windows:
//   up to Start   from opening the page until the Start button is there and the network has been quiet for 2 s;
//   after Start   from the click on Start until 10 s after the first played frame, plus whatever was still on its way then.
// Every fetched file is weighed as the host sends it, read from the build itself so the number does not depend on the server:
// gzip for scripts, stylesheets, HTML, JSON and SVG, raw for models, audio, images and fonts (the same rule as promo/start-bytes.mjs).
// Bytes are kept by type (js, css, glb, audio, image, font, other). The named lazy chunks (features, features-vi) are counted
// apart: they may arrive after Start within their own allowances (promo/perf-compare.mjs).
// Limit: exact plus 1% noise per window and per type.
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { pathToFileURL, fileURLToPath } from 'node:url';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import { compareDownload, foldDownload, lazyChunkOf, DOWNLOAD_TYPES } from './perf-compare.mjs';

const args = process.argv.slice(2), mode = args.includes('--baseline') ? 'baseline' : args.includes('--compare') ? 'compare' : 'print';
const here = new URL('./', import.meta.url), root = fileURLToPath(new URL('../', import.meta.url));
const dist = path.resolve(process.env.DIST || path.join(root, 'dist'));
if (!existsSync(path.join(dist, 'index.html'))) { console.error(`No build in ${dist}. Run npm run build:pages first.`); process.exit(2); }
const pwPath = process.env.PLAYWRIGHT_MODULE;
let chromium;
try { ({ chromium } = pwPath ? await import(pwPath.startsWith('file:') ? pwPath : pathToFileURL(pwPath).href) : createRequire(import.meta.url)('playwright')); }
catch (e) { console.error(`Playwright was not found (${e.message.split(String.fromCharCode(10))[0]}). Set PLAYWRIGHT_MODULE to the path of an installed playwright/index.mjs.`); process.exit(2); }
const RUNS = Number(process.env.RUNS || (mode === 'baseline' ? 2 : 1)), only = (process.env.ONLY || '').split(',').filter(Boolean);
/** The owner's limits for the download before play (docs/AAA-PLAN.md section 1), printed beside the totals. */
const OWNER_LIMIT = { new: 1.6 * 1048576, late: 1.8 * 1048576 };
const AFTER_START_MS = 10000, QUIET_MS = 2000;

// The deployment base of the build (/cute_game/ for Pages), from the build's own note.
const info = existsSync(path.join(dist, 'build-info.json')) ? JSON.parse(readFileSync(path.join(dist, 'build-info.json'), 'utf8')) : { base: '/' };
const basePath = info.base.endsWith('/') ? info.base : info.base + '/';

const COMPRESSIBLE = /\.(js|mjs|css|json|svg|html|webmanifest)$/i;
const TYPES = [['js', /\.m?js$/i], ['css', /\.css$/i], ['glb', /\.(glb|gltf|bin)$/i], ['audio', /\.(mp3|ogg|wav|m4a|aac|opus)$/i], ['image', /\.(png|jpe?g|webp|avif|gif|svg|ico)$/i], ['font', /\.(woff2?|ttf|otf)$/i]];
const typeOf = file => TYPES.find(([, rule]) => rule.test(file))?.[0] ?? 'other';
const weights = new Map();
/** [file under the build, bytes as the host sends them], or null for a URL that is not a file of the build. */
function weigh(url, origin) {
  const u = new URL(url); if (u.origin !== origin || !u.pathname.startsWith(basePath)) return null;
  let file = decodeURIComponent(u.pathname.slice(basePath.length)) || 'index.html'; if (file.endsWith('/')) file += 'index.html';
  const full = path.join(dist, file); if (!full.startsWith(dist) || !existsSync(full)) return null;
  if (!weights.has(file)) { const bytes = readFileSync(full); weights.set(file, COMPRESSIBLE.test(file) ? gzipSync(bytes, { level: 9 }).length : bytes.length); }
  return [file, weights.get(file)];
}
const emptyWindow = () => ({ total: 0, byType: Object.fromEntries(DOWNLOAD_TYPES.map(t => [t, 0])), lazy: {}, files: 0, list: [] });

/** Start `vite preview` on the build; resolves with { url, stop }. */
async function preview() {
  if (process.env.SERVER) return { url: process.env.SERVER.replace(/\/?$/, '/'), stop() {} };
  const port = String(process.env.PORT || 5297);
  const child = spawn(process.execPath, [path.join(root, 'node_modules/vite/bin/vite.js'), 'preview', '--port', port, '--strictPort', '--host', '127.0.0.1', '--outDir', dist], { cwd: root, env: { ...process.env, VITE_BASE_PATH: basePath, VITE_STATIC_HOST: 'true' }, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = ''; child.stdout.on('data', d => { log += d; }); child.stderr.on('data', d => { log += d; });
  const url = `http://127.0.0.1:${port}${basePath}`, until = Date.now() + 30000;
  for (;;) {
    if (child.exitCode !== null) throw new Error(`vite preview stopped (is port ${port} taken?):\n${log}`);
    try { const r = await fetch(url); if (r.ok) break; } catch { /* not up yet */ }
    if (Date.now() > until) { child.kill(); throw new Error(`vite preview did not answer on ${url} within 30 s:\n${log}`); }
    await new Promise(r => setTimeout(r, 250));
  }
  return { url, stop: () => child.kill() };
}

async function measureCase(browser, url, saveName, language) {
  const key = `${saveName}/${language}`, save = JSON.parse(readFileSync(new URL(`./save-${saveName}.json`, here), 'utf8')); save.savedAt = Date.now();
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1, serviceWorkers: 'block' }); // a new context is a fresh profile: no HTTP cache, no storage
  await ctx.addInitScript(([save, language]) => { try { localStorage.setItem('cute-game-save-v1', JSON.stringify(save)); localStorage.setItem('cute-game-slot', '0'); localStorage.setItem('cute-game-language', language); localStorage.setItem('cute-game-neighbours-on', '0'); } catch { /* the case then reads as a new game */ } }, [save, language]);
  const page = await ctx.newPage(), origin = new URL(url).origin;
  const windows = { beforeStart: emptyWindow(), afterStart: emptyWindow() }, seen = new Set(), foreign = [], failed = [];
  let into = 'beforeStart', pending = 0, lastActivity = Date.now();
  page.on('request', r => { if (/^https?:/.test(r.url())) { pending++; lastActivity = Date.now(); r.__window = into; } });
  const done = (r, ok) => {
    if (!/^https?:/.test(r.url())) return; pending--; lastActivity = Date.now();
    if (!ok) { failed.push(r.url().replace(origin, '')); return; }
    if (seen.has(r.url())) return; seen.add(r.url());
    const w = windows[r.__window ?? into], weighed = weigh(r.url(), origin);
    if (!weighed) { foreign.push(r.url().replace(origin, '')); return; }
    const [file, bytes] = weighed, lazy = lazyChunkOf(file);
    w.files++; w.list.push([file, bytes]);
    if (lazy) w.lazy[lazy] = (w.lazy[lazy] ?? 0) + bytes; else { w.total += bytes; w.byType[typeOf(file)] += bytes; }
  };
  page.on('requestfinished', r => done(r, true)); page.on('requestfailed', r => done(r, false));
  const quiet = async (ms, most) => { const until = Date.now() + most; while (Date.now() < until && (pending > 0 || Date.now() - lastActivity < ms)) await page.waitForTimeout(100); return pending === 0; };
  let invalid = null;
  try {
    await page.goto(url);
    await page.waitForSelector('[data-action="start"]', { state: 'visible', timeout: 60000 }).catch(() => { throw new Error('the Start button did not appear within 60 s: the page never started'); });
    if (!await quiet(QUIET_MS, 60000)) invalid = 'the network was not quiet 60 s after the Start button appeared';
    into = 'afterStart';
    await page.click('[data-action="start"]');
    // The first played frame: the HUD is shown (main.ts start()) and the browser has drawn it.
    await page.waitForFunction(() => { const hud = document.querySelector('#hud'); return !!hud && !hud.hidden; }, null, { timeout: 60000 });
    await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
    await page.waitForTimeout(AFTER_START_MS);
    into = 'late'; // anything asked for from here on is outside the window; what is on its way still counts
    const until = Date.now() + 30000; while (pending > 0 && Date.now() < until) await page.waitForTimeout(100);
    const language = await page.evaluate(() => document.documentElement.lang);
    if (!invalid && !language.startsWith(key.split('/')[1])) invalid = `the page is in "${language}"`;
  } catch (e) { invalid = e.message.split('\n')[0].slice(0, 160); }
  finally { await ctx.close(); }
  return { key, ...windows, ...(foreign.length ? { foreign } : {}), ...(failed.length ? { failed } : {}), ...(invalid ? { invalid } : {}) };
}

const kb = n => (n / 1024).toFixed(1) + ' KB', mb = n => (n / 1048576).toFixed(2) + ' MB';
const types = w => DOWNLOAD_TYPES.filter(t => w.byType[t]).map(t => `${t} ${kb(w.byType[t])}`).join(', ') + Object.entries(w.lazy).map(([c, n]) => `; lazy ${c} ${kb(n)}`).join('');
const server = await preview(), runs = [], started = Date.now();
let browser;
try {
  browser = await chromium.launch({ args: ['--use-angle=default', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'] });
  for (let run = 1; run <= RUNS; run++) {
    console.log(`--- run ${run} of ${RUNS}`);
    const cases = [];
    for (const saveName of ['new', 'late']) for (const language of ['en', 'vi']) {
      const key = `${saveName}/${language}`; if (only.length && !only.some(w => key.includes(w))) continue;
      const c = await measureCase(browser, server.url, saveName, language); cases.push(c);
      console.log(`${key}: up to Start ${kb(c.beforeStart.total)} in ${c.beforeStart.files} files (${types(c.beforeStart)})`);
      console.log(`${' '.repeat(key.length)}  after Start ${kb(c.afterStart.total)} in ${c.afterStart.files} files (${types(c.afterStart)})`);
      const sum = c.beforeStart.total + c.afterStart.total, limit = OWNER_LIMIT[saveName];
      console.log(`${' '.repeat(key.length)}  both windows ${mb(sum)}: ${sum <= limit ? 'within' : 'OVER'} the owner's ${mb(limit)} for a ${saveName} save (up to Start alone: ${mb(c.beforeStart.total)})`);
      if (args.includes('--files')) for (const w of ['beforeStart', 'afterStart']) for (const [f, n] of [...c[w].list].sort((a, b) => b[1] - a[1])) console.log(`      ${w === 'beforeStart' ? 'before' : 'after '} ${kb(n).padStart(10)}  ${f}`);
      if (c.foreign) console.log(`${' '.repeat(key.length)}  not files of the build (not weighed): ${c.foreign.join(', ')}`);
      if (c.failed) console.log(`${' '.repeat(key.length)}  failed requests: ${c.failed.join(', ')}`);
      if (c.invalid) console.log(`INVALID ${key}: ${c.invalid}`);
    }
    runs.push(cases);
  }
} finally { await browser?.close(); server.stop(); }
console.log(`measured ${runs[0]?.length ?? 0} cases x ${RUNS} in ${((Date.now() - started) / 1000).toFixed(0)} s`);

const strip = c => ({ ...c, beforeStart: { ...c.beforeStart, list: undefined }, afterStart: { ...c.afterStart, list: undefined } });
const BASELINE = new URL('./perf-baseline.json', here);
if (mode === 'baseline') {
  if (runs.flat().some(c => c.invalid)) { console.log('download baseline NOT written: invalid cases'); process.exit(1); }
  const file = existsSync(BASELINE) ? JSON.parse(readFileSync(BASELINE, 'utf8')) : { version: 1, rows: {} };
  const folded = foldDownload(runs.map(run => run.map(strip)));
  file.download = { ...folded, cases: only.length ? { ...file.download?.cases, ...folded.cases } : folded.cases, ownerLimit: { new: Math.round(OWNER_LIMIT.new), late: Math.round(OWNER_LIMIT.late) } };
  writeFileSync(BASELINE, JSON.stringify(file, null, 1) + '\n');
  for (const c of Object.values(folded.cases)) console.log(`${c.key}: up to Start ${c.beforeStart.total} (spread ${c.beforeStart.spread}), after Start ${c.afterStart.total} (spread ${c.afterStart.spread})`);
  console.log(`download baseline written: ${Object.keys(folded.cases).length} cases from ${RUNS} runs`);
} else if (mode === 'compare') {
  const file = JSON.parse(readFileSync(BASELINE, 'utf8'));
  if (!file.download) { console.log('no download section in the baseline: run with --baseline first'); process.exit(1); }
  const subset = only.length ? { cases: Object.fromEntries(Object.entries(file.download.cases).filter(([k]) => only.some(w => k.includes(w)))) } : file.download;
  const result = compareDownload(subset, runs[0].map(strip));
  for (const line of result.report) console.log(line);
  for (const f of result.failures) console.log('FAIL ' + f);
  console.log(result.ok ? 'download gate: pass' : `download gate: ${result.failures.length} failure(s)`);
  process.exit(result.ok ? 0 : 1);
}
