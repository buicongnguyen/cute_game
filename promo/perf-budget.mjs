// The speed gate of docs/QUALITY-PLAN.md: what the game draws at fixed places, at fixed camera pitches and fixed graphics, frame for frame.
//
// Run against a dev server (it needs the __zoo hook):  npx vite --port 5298 --host 127.0.0.1 --strictPort
//   node promo/perf-budget.mjs                 measure the 24 rows and print them (one JSON line each)
//   node promo/perf-budget.mjs --baseline      measure RUNS times (default 2), write promo/perf-baseline.json
//   node promo/perf-budget.mjs --compare       measure, then compare with the baseline and the ledger; exit 1 on any row over its limit
//   PORT=5298 picks the server.  RUNS=2.  ONLY=village,canyon or ONLY=late,phone keeps the rows whose key holds one of these words.
//   PROBE_ADD=village adds one mesh to that place, to prove that --compare then fails.  SHOTS=<dir> saves a picture of each row.  PLAYWRIGHT_MODULE=<path to playwright/index.mjs> if playwright is not found.
//
// The measure is frozen (copied from promo/draw-call-review.mjs): performance.now and Date.now are fake, requestAnimationFrame is
// pumped by hand, Math.random is seeded, neighbours are off, the colossus sleeps. After Start and the greeting dialogs: pump 120
// frames, wait until the kits and the crop bake are idle (up to 20 s), pin the hero, stop pumping, and count ONE world.render()
// with a draw counter that is active only inside that call, main and shadow draws split. The two particle pools (the scene's
// 'effects' group and the loot cards) are counted apart as `fx` (whether a spark is alive in that frame is chance), and the rescued
// friends' avatars as `roam` (a friend walks in or out of view). Both have a small allowance in the compare (promo/perf-compare.mjs). No fps is measured: a slow CPU makes
// that number a lottery, and the draw counts are what the game's cost is made of.
// A row is valid only when the camera is within 0.5 degrees of its pitch, the hero is on the spot and the graphics level is the pinned one.
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { compareRows, foldRuns } from './perf-compare.mjs';

const args = process.argv.slice(2), mode = args.includes('--baseline') ? 'baseline' : args.includes('--compare') ? 'compare' : 'print';
const here = new URL('./', import.meta.url);
const pwPath = process.env.PLAYWRIGHT_MODULE;
const { chromium } = pwPath ? await import(pwPath.startsWith('file:') ? pwPath : pathToFileURL(pwPath).href) : createRequire('C:/Users/n/source/repos/3D_claudeopus55/package.json')('playwright');
const base = `http://127.0.0.1:${process.env.PORT || 5298}`, RUNS = Number(process.env.RUNS || (mode === 'compare' ? 1 : 2));
const only = (process.env.ONLY || '').split(',').filter(Boolean);

const SCENES = { village: [0, 3.6], wild: [-13, -57], canyon: [105, -40] };
const SAVES = { late: './save-late.json', save: './save.json', new: './save-new.json' };
const DESKTOP = { viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 };
const PHONE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true };
// One browser context per group: [profile, device, graphics level, save, pitches]. 6 groups x 3 places = 24 rows.
const GROUPS = [
  ['desktop-high', DESKTOP, 'high', 'late', [42, 30, 51.5]],
  ['desktop-high', DESKTOP, 'high', 'save', [42]],
  ['desktop-high', DESKTOP, 'high', 'new', [42]],
  ['phone-high', PHONE, 'high', 'late', [42]],
  ['desktop-medium', DESKTOP, 'medium', 'late', [42]],
  ['desktop-low', DESKTOP, 'low', 'late', [42]],
];
const rowKey = (scene, save, deg, profile) => `${scene}/${save}/${deg}/${profile}`;
const wanted = key => !only.length || only.some(w => key.split('/').includes(w) || key.includes(w));

// Runs in the page before any game code: the frozen clock, the pumped frames, the seeded random, the draw counter.
function frozenPage({ save, level, pitch, attr }) {
  try {
    localStorage.setItem('cute-game-save-v1', JSON.stringify(save)); localStorage.setItem('cute-game-slot', '0'); localStorage.setItem('cute-game-language', 'en');
    localStorage.setItem('zoo-garden-graphics', JSON.stringify({ setting: level, autoVersion: 2 }));
    localStorage.setItem('cute-game-neighbours-on', '0'); localStorage.setItem('zoo-camera-view', String(pitch)); localStorage.setItem('zoo-colossus-sleeps', 'asleep');
  } catch { /* the page then reports an invalid row */ }
  let seed = 12345;
  const seedWith = n => { seed = n | 0; };
  Math.random = () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  let fake = 1000, id = 0; const pending = new Map();
  performance.now = () => fake; Date.now = () => 1.8e12 + fake;
  window.requestAnimationFrame = cb => { pending.set(++id, cb); return id; }; window.cancelAnimationFrame = n => pending.delete(n);
  const pump = n => { for (let i = 0; i < n; i++) { fake += 1000 / 60; const jobs = [...pending.values()]; pending.clear(); for (const cb of jobs) cb(fake); } };
  const count = { active: false, calls: 0, triangles: 0 };
  for (const proto of [window.WebGLRenderingContext?.prototype, window.WebGL2RenderingContext?.prototype].filter(Boolean)) for (const key of ['drawArrays', 'drawElements', 'drawArraysInstanced', 'drawElementsInstanced']) {
    const original = proto[key]; if (!original) continue;
    proto[key] = function (...a) {
      if (count.active) { const inst = key.endsWith('Instanced'), arrays = key.startsWith('drawArrays'), n = arrays ? a[2] : a[1], copies = inst ? (arrays ? a[3] : a[4]) : 1; count.calls++; if (a[0] === 4) count.triangles += n / 3 * copies; }
      return original.apply(this, a);
    };
  }
  window.__wantAttr = !!attr;
  window.__frozen = { pump, seedWith, count };
}

// Wait (real time, up to 20 s) until the set of loaded kits and the crop bake stop changing for 2 s.
const idle = page => page.evaluate(async () => {
  const a = await import('/src/assets.ts'), w = __zoo.world, kits = ['sceneryKit', 'cropKit', 'fishKit', 'heroKit', 'wearKit', 'weaponKit', 'disguiseKit', 'petKit', 'bossPetKit', 'spaceKit', 'wildsKit', 'brightKit', 'harshKit', 'dressingKit', 'farmKit', 'helperKit', 'cageKit'];
  const sig = () => kits.map(k => +!!a[k]?.ready).join('') + (w.cropCards ? '/' + +!!w.cropCards.ready + ':' + w.cropCards.bakeMs : '/-') + '/' + w.renderer.info.memory.geometries + ':' + w.renderer.info.memory.textures + ':' + w.renderer.info.programs.length;
  let last = sig(), stable = 0;
  for (let i = 0; i < 80 && stable < 8; i++) { __frozen.pump(30); await new Promise(r => setTimeout(r, 250)); const s = sig(); if (s === last) stable++; else { stable = 0; last = s; } }
  return { signature: last, stable, timedOut: stable < 8 };
});

// Frames are pumped by hand in small chunks with a real pause between them, so downloads and promises can land; no frame is ever driven by the wall clock.
const settle = async (page, frames, chunk = 6) => { for (let done = 0; done < frames; done += chunk) { await page.evaluate(n => __frozen.pump(n), chunk); await page.waitForTimeout(30); } };

async function measureGroup(browser, [profile, device, level, saveName, pitches]) {
  const save = JSON.parse(readFileSync(new URL(SAVES[saveName], here), 'utf8')); save.savedAt = 1.8e12; save.hp = 999999; save.settings ??= {}; save.settings.aiNeighbours = false;
  const ctx = await browser.newContext({ ...device, serviceWorkers: 'block' });
  await ctx.addInitScript(frozenPage, { save, level, pitch: pitches[0], attr: !!process.env.ATTR });
  const page = await ctx.newPage(), errors = []; page.on('pageerror', e => errors.push(e.message.slice(0, 160)));
  const out = [];
  try {
    await page.goto(base + '/'); await page.waitForSelector('[data-action="start"]'); await page.click('[data-action="start"]');
    await page.waitForFunction(() => !!window.__zoo?.world?.renderer, null, { timeout: 60000 });
    await settle(page, 240); await page.waitForTimeout(500); // the greeting cards open a moment after Start
    // Close what greets the hero (the daily welcome-back card, a welcome gift): an open dialog pauses play and blurs the view.
    for (let i = 0; i < 8; i++) {
      await settle(page, 30);
      const open = await page.evaluate(() => { const d = document.querySelector('#dialog-layer'); return !!d && !d.hidden; }); if (!open) break;
      await page.evaluate(() => { const d = document.querySelector('#dialog-layer'); [...d.querySelectorAll('button')].find(b => /^(Close|No, thanks)$/i.test(b.textContent.trim()) || b.dataset.action === 'welcome-pass')?.click(); });
      await settle(page, 18); await page.keyboard.press('Escape');
    }
    await settle(page, 120);
    const settled = await idle(page);
    // The hero must not be hurt or knocked off its spot while a row is read: health is topped up and the hero pinned.
    await page.evaluate(() => { const s = __zoo.state, full = s.hp; setInterval(() => { if (__zoo.state.hp < full) __zoo.state.hp = full; }, 50); });
    await page.evaluate(async () => { window.__cam = await import('/src/camera-rig.ts'); window.__gfx = await import('/src/graphics.ts'); });
    for (const scene of Object.keys(SCENES)) for (const deg of pitches) {
      const key = rowKey(scene, saveName, deg, profile); if (!wanted(key)) continue;
      const [x, z] = SCENES[scene];
      const row = await page.evaluate(([x, z, deg, key, level, probeAdd]) => {
        const f = window.__frozen, w = __zoo.world, r = w.renderer, cam = window.__cam, c = f.count;
        f.seedWith(2468); w.position.set(x, 0, z); w.cameraTarget.set(x, 0, z); w.facing = 0; w.zoom = 1; __zoo.pinHero?.({ x, z });
        cam.setCameraPitch(deg); w.resize();
        const v = w.viewOffset, pitch = Math.atan2(v.y, Math.hypot(v.x, v.z)) * 180 / Math.PI;
        f.pump(120);
        // One render, counted. The wrapper on renderBufferDirect splits the shadow pass (depth materials) from the main pass.
        if (!w.__zooSplit) {
          const orig = r.renderBufferDirect; w.__zooSplit = { shadow: 0, fx: 0, fxTriangles: 0, roam: 0, roamTriangles: 0 };
          r.renderBufferDirect = function (camera, scene, geometry, material, object) {
            const calls = c.calls, tris = c.triangles, res = orig.apply(this, arguments), dc = c.calls - calls, dt = c.triangles - tris, sp = w.__zooSplit;
            if (c.active && dc) {
              if (material.isMeshDepthMaterial || material.isMeshDistanceMaterial) sp.shadow += dc;
              else if (object.parent?.name === 'effects' || object.name === 'drops') { sp.fx += dc; sp.fxTriangles += dt; } // spark and glow pools, loot cards: drawn only while one is alive, which chance decides
              else { let o = object; while (o && !/^friend-/.test(o.name)) o = o.parent; if (o) { sp.roam += dc; sp.roamTriangles += dt; } } // a rescued friend walking in or out of view
              if (window.__attr) { const k = (material.isMeshDepthMaterial ? 's:' : 'm:') + (object.name || object.parent?.name || object.type) + '|' + (geometry.attributes.position?.count ?? 0); window.__attr[k] = (window.__attr[k] ?? 0) + dc; }
            }
            return res;
          };
        }
        let probe = null; if (probeAdd && key.startsWith(probeAdd + '/')) { const m = probe = w.marker.clone(); m.visible = true; m.frustumCulled = false; m.position.set(x, 1, z + 2); w.scene.add(m); } // self-test of the gate: one more mesh in the scene
        if (window.__wantAttr) window.__attr = {}; Object.assign(w.__zooSplit, { shadow: 0, fx: 0, fxTriangles: 0, roam: 0, roamTriangles: 0 }); c.calls = 0; c.triangles = 0; r.shadowMap.needsUpdate = true; c.active = true; w.render(); c.active = false; probe?.removeFromParent();
        const seen = new Set(); let bytes = 0;
        w.scene.traverse(o => { if (!o.geometry) return; for (const a of [...Object.values(o.geometry.attributes), o.geometry.index].filter(Boolean)) { const b = a.array?.buffer ?? a.data?.array?.buffer; if (b && !seen.has(b)) { seen.add(b); bytes += b.byteLength; } } });
        const stored = (() => { try { return JSON.parse(localStorage.getItem('zoo-garden-graphics')).setting; } catch { return null; } })();
        const wantMap = window.__gfx.QUALITY[level].shadow, mapSize = r.shadowMap.enabled ? w.sun.shadow.mapSize.x : 0;
        const d = document.querySelector('#dialog-layer'), p = w.position;
        let invalid = null;
        if (Math.abs(pitch - deg) > .5) invalid = `camera ${pitch.toFixed(2)} degrees, not ${deg}`;
        else if (stored !== level || mapSize !== wantMap) invalid = `graphics are not on ${level} (stored ${stored}, shadow map ${mapSize}, wanted ${wantMap})`;
        else if (Math.hypot(p.x - x, p.z - z) > 8) invalid = 'the hero left the spot';
        else if (__zoo.state.planet !== 'home') invalid = 'not on the home map';
        else if (d && !d.hidden) invalid = 'a dialog is open: ' + d.textContent.trim().replace(/\s+/g, ' ').slice(0, 60);
        return { key, main: c.calls - w.__zooSplit.shadow - w.__zooSplit.fx - w.__zooSplit.roam, shadow: w.__zooSplit.shadow, triangles: Math.round(c.triangles - w.__zooSplit.fxTriangles - w.__zooSplit.roamTriangles), fx: w.__zooSplit.fx, roam: w.__zooSplit.roam, programs: r.info.programs.length, geometries: r.info.memory.geometries, textures: r.info.memory.textures, geometryBytes: bytes,
          ...(window.__attr ? { attr: window.__attr } : {}), visited: __zoo.matrixStats.visited, level, shadowMap: mapSize, pitch: +pitch.toFixed(2), ...(invalid ? { invalid } : {}) };
      }, [x, z, deg, key, level, process.env.PROBE_ADD || '']);
      if (settled.timedOut) row.note = 'kits or crop bake still changing after 20 s';
      if (errors.length) row.pageErrors = errors.slice(0, 3);
      if (process.env.SHOTS) { mkdirSync(process.env.SHOTS, { recursive: true }); await page.screenshot({ path: `${process.env.SHOTS}/${key.replaceAll('/', '_')}.png` }); }
      out.push(row); console.log(JSON.stringify(row));
    }
  } finally { await ctx.close(); }
  return out;
}

const browser = await chromium.launch({ args: ['--use-angle=default', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'] });
const runs = [], started = Date.now();
try {
  for (let run = 1; run <= RUNS; run++) {
    console.log(`--- run ${run} of ${RUNS}`);
    const rows = []; for (const g of GROUPS) if (g[4].some(deg => Object.keys(SCENES).some(s => wanted(rowKey(s, g[3], deg, g[0]))))) rows.push(...await measureGroup(browser, g));
    runs.push(rows);
  }
} finally { await browser.close(); }
console.log(`measured ${runs[0]?.length ?? 0} rows x ${RUNS} in ${((Date.now() - started) / 1000).toFixed(0)} s`);

const invalid = runs.flat().filter(r => r.invalid);
for (const r of invalid) console.log(`INVALID ${r.key}: ${r.invalid}`);
const BASELINE = new URL('./perf-baseline.json', here), LEDGER = new URL('./perf-ledger.json', here);
if (mode === 'baseline') {
  if (invalid.length) { console.log('baseline NOT written: invalid rows'); process.exit(1); }
  const rows = {}; for (const key of runs[0].map(r => r.key)) rows[key] = foldRuns(runs.map(run => run.find(r => r.key === key)));
  const same = Object.values(rows).filter(r => Object.values(r.spread).every(v => v === 0)).length;
  writeFileSync(BASELINE, JSON.stringify({ version: 1, runs: RUNS, rowsIdenticalAcrossRuns: same, rows }, null, 1) + '\n');
  console.log(`baseline written: ${Object.keys(rows).length} rows, ${same} identical across ${RUNS} runs`);
} else if (mode === 'compare') {
  const baseline = JSON.parse(readFileSync(BASELINE, 'utf8')), ledger = existsSync(LEDGER) ? JSON.parse(readFileSync(LEDGER, 'utf8')) : { entries: [] };
  // With several runs the smaller value of each field is compared: noise cannot fail a row, a real addition shows in every run.
  const fields = ["fx", "roam", "main", "shadow", 'triangles', 'programs', 'geometries', 'textures', 'geometryBytes'];
  const rows = runs[0].map(r => ({ ...r, ...Object.fromEntries(fields.map(f => [f, Math.min(...runs.map(run => run.find(x => x.key === r.key)?.[f] ?? Infinity))])) }));
  const subset = only.length ? { rows: Object.fromEntries(Object.entries(baseline.rows).filter(([k]) => wanted(k))) } : baseline;
  const result = compareRows(subset, rows, ledger);
  for (const line of result.report) console.log(line);
  for (const f of result.failures) console.log('FAIL ' + f);
  console.log(result.ok ? 'perf gate: pass' : `perf gate: ${result.failures.length} failure(s)`);
  process.exit(result.ok ? 0 : 1);
}
