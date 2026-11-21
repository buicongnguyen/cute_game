// The speed gate of docs/QUALITY-PLAN.md: what the game draws at fixed places, at fixed camera pitches and fixed graphics, frame for frame.
//
// Run against a dev server (it needs the __zoo hook; a VITE_PERF_HOOK build has it too):  npx vite --port 5298 --host 127.0.0.1 --strictPort
//   node promo/perf-budget.mjs                 measure every row and print it (one JSON line each)
//   node promo/perf-budget.mjs --baseline      measure RUNS times (default 2), write promo/perf-baseline.json
//   node promo/perf-budget.mjs --compare       measure, then compare with the baseline and the ledger; exit 1 on any row over its limit
//   PORT=5298 picks the server.  RUNS=2 (the baseline in the repo was taken with RUNS=4; --compare reads the smaller value of its runs).  ONLY=village,canyon or ONLY=late,phone keeps the rows whose key holds one of these words
//   (with --baseline, ONLY re-takes just those rows and keeps the rest of the file).
//   PROBE_ADD=village adds one mesh to that place, to prove that --compare then fails.  SHOTS=<dir> saves a picture of each row (for looking only:
//   a screenshot lets real time pass between rows, which shifts the counts; --baseline and --compare refuse it).  PLAYWRIGHT_MODULE=<path to playwright/index.mjs> if playwright is not found.
//
// The measure is frozen (copied from promo/draw-call-review.mjs): performance.now and Date.now are fake, requestAnimationFrame is
// pumped by hand, Math.random is seeded, neighbours are off, the colossus sleeps. After Start and the greeting dialogs: pump 120
// frames, wait until the kits and the crop bake are idle (up to 20 s), pin the hero, stop pumping, and count ONE world.render()
// with a draw counter that is active only inside that call, main and shadow draws split. The two particle pools (the scene's
// 'effects' group and the loot cards) are counted apart as `fx` (whether a spark is alive in that frame is chance), and the rescued
// friends' avatars as `roam` (a friend walks in or out of view). Both have a small allowance in the compare (promo/perf-compare.mjs). No fps is measured: a slow CPU makes
// that number a lottery, and the draw counts are what the game's cost is made of.
// A row is valid only when the camera is within 0.5 degrees of its pitch, the hero is on the spot and the graphics level is the pinned one.
//
// Beyond the 24 standing rows (docs/AAA-PLAN.md section 7, WP3), all at 1600x900 on graphics High unless stated:
//   <place>-move   village, wild and canyon on the late save: the hero walks east and north (D and W held) for 1 s, then one frozen frame.
//   bear, treant   on promo/save-mid.json, the hero 8 m from the boss: `frame` is one frozen frame half way through the boss's
//                  first wind-up (exact, like a standing row; on the phone too), `peak` the 4 s that follow (live).
//   swampfight     8 s in the swamp on the late save with a fixed input script (an attack every quarter second, the four skills in
//                  turn, two waves of the six nearest creatures set in a ring around the hero): live.
//   space          one frozen frame 4 s after the starship enters space.
//   idle           4 s of idle play in the village on the late save: the page's layout work only (live).
//   colossus       4 s beside the woken Colossus (__zoo.colossus.start()): report only, never gated.
// A live row still runs on the fake clock, one pumped game frame for each real browser frame: the game's steps are the same in
// every run while the browser does its own style and layout work as in play. It holds the peak draws, shadow draws and triangles
// of any one frame (sparks and friends included), the shader programs created meanwhile, and Chrome's LayoutCount,
// RecalcStyleCount and Nodes (CDP Performance.getMetrics). The slowest frame and the long-task count are logged, never gated:
// they depend on the machine.
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { compareRows, foldRuns, FIELDS } from './perf-compare.mjs';

const args = process.argv.slice(2), mode = args.includes('--baseline') ? 'baseline' : args.includes('--compare') ? 'compare' : 'print';
const here = new URL('./', import.meta.url);
const pwPath = process.env.PLAYWRIGHT_MODULE;
let chromium;
try { ({ chromium } = pwPath ? await import(pwPath.startsWith('file:') ? pwPath : pathToFileURL(pwPath).href) : createRequire(import.meta.url)('playwright')); }
catch (e) { console.error(`Playwright was not found (${e.message.split(String.fromCharCode(10))[0]}). Set PLAYWRIGHT_MODULE to the path of an installed playwright/index.mjs.`); process.exit(2); }
const base = `http://127.0.0.1:${process.env.PORT || 5298}`, RUNS = Number(process.env.RUNS || 2);
const only = (process.env.ONLY || '').split(',').filter(Boolean);
if (process.env.SHOTS && mode !== 'print') { console.error('SHOTS is for looking only: run it without --baseline or --compare.'); process.exit(2); }

const SCENES = { village: [0, 3.6], wild: [-13, -57], canyon: [105, -40] };
const SAVES = { late: './save-late.json', save: './save.json', new: './save-new.json', mid: './save-mid.json' };
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
// The rows beyond the standing ones (see the head of this file). A boss row is [boss, how far the hero stands].
const BOSSES = [['bear', 8], ['treant', 8]];
const COLOSSUS_SPOT = [68, 0]; // 10 m west of the Colossus (colossus-content.ts COLOSSUS_SCHEDULE x 78, z 0)
const LIVE_FRAMES = 240, FIGHT_FRAMES = 480, SPACE_FRAMES = 240, MOVE_FRAMES = 60;
const EXTRA_KEYS = {
  late: [...Object.keys(SCENES).map(s => `${s}-move/late/42/desktop-high`), 'idle/late/layout/desktop-high', 'swampfight/late/peak/desktop-high', 'space/late/frame/desktop-high'],
  mid: BOSSES.flatMap(([b]) => [`${b}/mid/frame/desktop-high`, `${b}/mid/peak/desktop-high`]),
  midPhone: BOSSES.map(([b]) => `${b}/mid/frame/phone-high`),
  colossus: ['colossus/late/peak/desktop-high'],
};

// Runs in the page before any game code: the frozen clock, the pumped frames, the seeded random, the draw counter.
function frozenPage({ save, level, pitch, attr, lid }) {
  try {
    localStorage.setItem('cute-game-save-v1', JSON.stringify(save)); localStorage.setItem('cute-game-slot', '0'); localStorage.setItem('cute-game-language', 'en');
    localStorage.setItem('zoo-garden-graphics', JSON.stringify({ setting: level, autoVersion: 2 }));
    localStorage.setItem('cute-game-neighbours-on', '0'); localStorage.setItem('zoo-camera-view', String(pitch)); localStorage.setItem('zoo-colossus-sleeps', lid);
  } catch { /* the page then reports an invalid row */ }
  let seed = 12345;
  const seedWith = n => { seed = n | 0; };
  Math.random = () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  // Kept for the live rows: the browser's own frames and clock.
  const realFrame = window.requestAnimationFrame.bind(window), realNow = performance.now.bind(performance);
  let longTasks = 0; try { new PerformanceObserver(list => { longTasks += list.getEntries().length; }).observe({ entryTypes: ['longtask'] }); } catch { /* not counted */ }
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
  window.__frozen = { pump, seedWith, count, realFrame, realNow, longTasks: () => longTasks };
}

// Runs in the page once the world exists: the counters every row reads (window.__m).
function installMeter() {
  const f = window.__frozen, w = __zoo.world, r = w.renderer, c = f.count;
  const sp = { shadow: 0, fx: 0, fxTriangles: 0, roam: 0, roamTriangles: 0 };
  // The wrapper on renderBufferDirect splits the shadow pass (depth materials) from the main pass.
  const orig = r.renderBufferDirect;
  r.renderBufferDirect = function (camera, scene, geometry, material, object) {
    const calls = c.calls, tris = c.triangles, res = orig.apply(this, arguments), dc = c.calls - calls, dt = c.triangles - tris;
    if (c.active && dc) {
      if (material.isMeshDepthMaterial || material.isMeshDistanceMaterial) sp.shadow += dc;
      else if (object.parent?.name === 'effects' || object.name === 'drops' || /projectile/.test(object.name)) { sp.fx += dc; sp.fxTriangles += dt; } // spark and glow pools, loot cards, a shot in the air: drawn only while one is alive, which chance decides
      else { let o = object; while (o && !/^friend-/.test(o.name)) o = o.parent; if (o) { sp.roam += dc; sp.roamTriangles += dt; } } // a rescued friend walking in or out of view
      if (window.__attr) { const k = (material.isMeshDepthMaterial ? 's:' : 'm:') + (object.name || object.parent?.name || object.type) + '|' + (geometry.attributes.position?.count ?? 0); window.__attr[k] = (window.__attr[k] ?? 0) + dc; }
    }
    return res;
  };
  const reset = () => { if (window.__wantAttr) window.__attr = {}; Object.assign(sp, { shadow: 0, fx: 0, fxTriangles: 0, roam: 0, roamTriangles: 0 }); c.calls = 0; c.triangles = 0; };
  const read = () => ({ main: c.calls - sp.shadow - sp.fx - sp.roam, shadow: sp.shadow, triangles: Math.round(c.triangles - sp.fxTriangles - sp.roamTriangles), fx: sp.fx, roam: sp.roam, fxTriangles: Math.round(sp.fxTriangles), roamTriangles: Math.round(sp.roamTriangles) });
  const memory = () => {
    const seen = new Set(); let bytes = 0;
    w.scene.traverse(o => { if (!o.geometry) return; for (const a of [...Object.values(o.geometry.attributes), o.geometry.index].filter(Boolean)) { const b = a.array?.buffer ?? a.data?.array?.buffer; if (b && !seen.has(b)) { seen.add(b); bytes += b.byteLength; } } });
    return { programs: r.info.programs.length, geometries: r.info.memory.geometries, textures: r.info.memory.textures, geometryBytes: bytes, ...(window.__attr ? { attr: window.__attr } : {}), visited: __zoo.matrixStats.visited };
  };
  const graphics = level => {
    const stored = (() => { try { return JSON.parse(localStorage.getItem('zoo-garden-graphics')).setting; } catch { return null; } })();
    const wantMap = window.__gfx.QUALITY[level].shadow, mapSize = r.shadowMap.enabled ? w.sun.shadow.mapSize.x : 0;
    return { shadowMap: mapSize, bad: stored !== level || mapSize !== wantMap ? `graphics are not on ${level} (stored ${stored}, shadow map ${mapSize}, wanted ${wantMap})` : null };
  };
  const dialog = () => { const d = document.querySelector('#dialog-layer'); return d && !d.hidden ? 'a dialog is open: ' + d.textContent.trim().replace(/\s+/g, ' ').slice(0, 60) : null; };
  const pitchNow = () => { const v = w.viewOffset; return Math.atan2(v.y, Math.hypot(v.x, v.z)) * 180 / Math.PI; };
  window.__m = {
    memory, graphics, dialog, pitchNow,
    /** Stand the hero on a spot, pinned, under a camera pitch; returns the pitch the camera really has. */
    stand(x, z, deg) { f.seedWith(2468); w.position.set(x, 0, z); w.cameraTarget.set(x, 0, z); w.facing = 0; w.zoom = 1; __zoo.pinHero?.({ x, z }); window.__cam.setCameraPitch(deg); w.resize(); return pitchNow(); },
    /** Where a world point lands on the screen: -1..1 both ways when it is in frame. */
    onScreen(x, y, z) { const v = w.camera.position.clone().set(x, y, z).project(w.camera); return { x: +v.x.toFixed(2), y: +v.y.toFixed(2), inFrame: Math.abs(v.x) <= 1 && Math.abs(v.y) <= 1 && v.z < 1 }; },
    key(type, code, key) { document.body.dispatchEvent(new KeyboardEvent(type, { code, key, bubbles: true, cancelable: true })); },
    /** Pump frames one by one until `until()` holds, with a real pause every few so downloads and promises can land. */
    async pumpUntil(until, most) { let n = 0; while (!until() && n < most) { f.pump(1); if (++n % 10 === 0) await new Promise(res => setTimeout(res, 0)); } return n; },
    /** ONE world.render(), counted. */
    render() { reset(); r.shadowMap.needsUpdate = true; c.active = true; w.render(); c.active = false; return read(); },
    /** One whole pumped frame, counted: whatever the game draws in it (the space view does not go through world.render). */
    frame() { reset(); c.active = true; f.pump(1); c.active = false; return read(); },
    /** `frames` game frames, one for each real browser frame; `each(i)` runs before frame i. The peaks hold every draw of a frame. */
    live(frames, each) {
      return new Promise(done => {
        const peak = { peakMain: 0, peakShadow: 0, peakTriangles: 0 }, programs = r.info.programs.length, long = f.longTasks(); let i = 0, last = 0, slowest = 0;
        const tick = () => {
          const now = f.realNow(); if (i) slowest = Math.max(slowest, now - last); last = now;
          each?.(i); reset(); c.active = true; f.pump(1); c.active = false;
          peak.peakMain = Math.max(peak.peakMain, c.calls - sp.shadow); peak.peakShadow = Math.max(peak.peakShadow, sp.shadow); peak.peakTriangles = Math.max(peak.peakTriangles, Math.round(c.triangles));
          if (++i < frames) f.realFrame(tick); else done({ ...peak, programsCreated: r.info.programs.length - programs, frames, slowestMs: +slowest.toFixed(1), longTasks: f.longTasks() - long });
        };
        f.realFrame(tick);
      });
    },
  };
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

/** A fresh browser context with the game started on a save, the greeting cards closed, the kits loaded and the meter in. */
async function openGame(browser, device, level, saveName, { pitch = 42, lid = 'asleep' } = {}) {
  const save = JSON.parse(readFileSync(new URL(SAVES[saveName], here), 'utf8')); save.savedAt = 1.8e12; save.hp = 999999; save.settings ??= {}; save.settings.aiNeighbours = false;
  const ctx = await browser.newContext({ ...device, serviceWorkers: 'block' });
  await ctx.addInitScript(frozenPage, { save, level, pitch, attr: !!process.env.ATTR, lid });
  const page = await ctx.newPage(), errors = []; page.on('pageerror', e => errors.push(e.message.slice(0, 160)));
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
    await page.evaluate(installMeter);
    return { ctx, page, errors, settled, level };
  } catch (e) { await ctx.close(); throw e; }
}
/** Notes, page errors, the picture and the printed line every row gets. */
async function emit(game, row, out) {
  if (game.settled.timedOut) row.note = 'kits or crop bake still changing after 20 s';
  if (game.errors.length) row.pageErrors = game.errors.slice(0, 3);
  if (process.env.SHOTS) { mkdirSync(process.env.SHOTS, { recursive: true }); await game.page.screenshot({ path: `${process.env.SHOTS}/${row.key.replaceAll('/', '_')}.png` }); }
  out.push(row); console.log(JSON.stringify(row));
}
/** Chrome's own counters for the page (CDP Performance.getMetrics). */
async function chromeMetrics(game) {
  game.cdp ??= await game.ctx.newCDPSession(game.page).then(async cdp => { await cdp.send('Performance.enable'); return cdp; });
  await game.cdp.send('HeapProfiler.collectGarbage'); // Nodes counts every node still in memory: without this it holds whatever the collector has not reached yet
  const m = Object.fromEntries((await game.cdp.send('Performance.getMetrics')).metrics.map(x => [x.name, x.value]));
  return { layoutCount: m.LayoutCount, recalcStyleCount: m.RecalcStyleCount, nodes: m.Nodes };
}
/** A live stretch run in the page by `run` (it returns the meter's live() result and may add `invalid`), with Chrome's counters around it. */
async function liveRow(game, key, kind, run, arg) {
  const before = await chromeMetrics(game), measured = await game.page.evaluate(run, arg), after = await chromeMetrics(game);
  return { key, kind, ...measured, layoutCount: after.layoutCount - before.layoutCount, recalcStyleCount: after.recalcStyleCount - before.recalcStyleCount, nodes: after.nodes, level: game.level };
}

async function measureGroup(browser, [profile, device, level, saveName, pitches]) {
  const game = await openGame(browser, device, level, saveName, { pitch: pitches[0] }), { page } = game;
  const out = [];
  try {
    for (const scene of Object.keys(SCENES)) for (const deg of pitches) {
      const key = rowKey(scene, saveName, deg, profile); if (!wanted(key)) continue;
      const [x, z] = SCENES[scene];
      const row = await page.evaluate(([x, z, deg, key, level, probeAdd]) => {
        const f = window.__frozen, w = __zoo.world, m = window.__m;
        f.seedWith(2468); w.position.set(x, 0, z); w.cameraTarget.set(x, 0, z); w.facing = 0; w.zoom = 1; __zoo.pinHero?.({ x, z });
        window.__cam.setCameraPitch(deg); w.resize();
        const pitch = m.pitchNow();
        f.pump(120);
        let probe = null; if (probeAdd && key.startsWith(probeAdd + '/')) { const mesh = probe = w.marker.clone(); mesh.visible = true; mesh.frustumCulled = false; mesh.position.set(x, 1, z + 2); w.scene.add(mesh); } // self-test of the gate: one more mesh in the scene
        const counted = m.render(); probe?.removeFromParent();
        const g = m.graphics(level), p = w.position;
        let invalid = null;
        if (Math.abs(pitch - deg) > .5) invalid = `camera ${pitch.toFixed(2)} degrees, not ${deg}`;
        else if (g.bad) invalid = g.bad;
        else if (Math.hypot(p.x - x, p.z - z) > 8) invalid = 'the hero left the spot';
        else if (__zoo.state.planet !== 'home') invalid = 'not on the home map';
        else if (m.dialog()) invalid = m.dialog();
        return { key, ...counted, ...m.memory(), level, shadowMap: g.shadowMap, pitch: +pitch.toFixed(2), ...(invalid ? { invalid } : {}) };
      }, [x, z, deg, key, level, process.env.PROBE_ADD || '']);
      await emit(game, row, out);
    }
  } finally { await game.ctx.close(); }
  return out;
}

/** The late save's other rows: moving, idle layout, the scripted swamp fight, space (last: the hero leaves the map). */
async function measureLateExtras(browser) {
  const level = 'high', game = await openGame(browser, DESKTOP, level, 'late'), { page } = game, out = [];
  try {
    for (const scene of Object.keys(SCENES)) {
      const key = `${scene}-move/late/42/desktop-high`; if (!wanted(key)) continue;
      const row = await page.evaluate(([x, z, key, level, frames]) => {
        const f = window.__frozen, w = __zoo.world, m = window.__m;
        const pitch = m.stand(x, z, 42); f.pump(120);
        __zoo.pinHero?.(null); m.key('keydown', 'KeyD', 'd'); m.key('keydown', 'KeyW', 'w'); f.pump(frames); m.key('keyup', 'KeyD', 'd'); m.key('keyup', 'KeyW', 'w');
        const p = w.position, east = p.x - x, north = z - p.z; __zoo.pinHero?.({ x: p.x, z: p.z });
        const counted = m.render(), g = m.graphics(level);
        let invalid = null;
        if (Math.abs(pitch - 42) > .5) invalid = `camera ${pitch.toFixed(2)} degrees, not 42`;
        else if (g.bad) invalid = g.bad;
        else if (!(east > 1 && north > 1)) invalid = `the hero did not walk east and north (east ${east.toFixed(2)} m, north ${north.toFixed(2)} m)`;
        else if (__zoo.state.planet !== 'home') invalid = 'not on the home map';
        else if (m.dialog()) invalid = m.dialog();
        return { key, ...counted, ...m.memory(), level, shadowMap: g.shadowMap, pitch: +pitch.toFixed(2), walked: [+east.toFixed(2), +north.toFixed(2)], ...(invalid ? { invalid } : {}) };
      }, [...SCENES[scene], key, level, MOVE_FRAMES]);
      await emit(game, row, out);
    }
    const idleKey = 'idle/late/layout/desktop-high';
    if (wanted(idleKey)) {
      await page.evaluate(([x, z]) => { window.__m.stand(x, z, 42); window.__frozen.pump(120); }, SCENES.village);
      const row = await liveRow(game, idleKey, 'live', async ([level, frames]) => {
        const m = window.__m, r = await m.live(frames), g = m.graphics(level), invalid = g.bad ?? m.dialog() ?? (__zoo.state.planet !== 'home' ? 'not on the home map' : null);
        return { frames: r.frames, slowestMs: r.slowestMs, longTasks: r.longTasks, ...(invalid ? { invalid } : {}) }; // layout work only: the standing village rows hold the draws
      }, [level, LIVE_FRAMES]);
      await emit(game, row, out);
    }
    const fightKey = 'swampfight/late/peak/desktop-high';
    if (wanted(fightKey)) {
      const row = await liveRow(game, fightKey, 'live', async ([x, z, level, frames]) => {
        const f = window.__frozen, w = __zoo.world, m = window.__m;
        m.stand(x, z, 42); f.pump(120); f.seedWith(97531);
        // The fixed script. Waves: the six nearest living creatures, set in a ring 3 m around the hero, at the start and half way.
        const used = new Set(), far = e => Math.hypot(e.x - x, e.z - z);
        const wave = () => w.enemies.filter(e => !e.boss && e.hp > 0 && !used.has(e)).sort((a, b) => far(a) - far(b) || (a.id < b.id ? -1 : 1)).slice(0, 6).forEach((e, i) => {
          used.add(e); const a = i / 6 * Math.PI * 2; e.x = e.homeX = x + Math.cos(a) * 3; e.z = e.homeZ = z + Math.sin(a) * 3; e.lod = undefined; e.resting = false; e.route = []; e.mesh.position.x = e.x; e.mesh.position.z = e.z;
        });
        const skills = __zoo.skillList().length;
        const r = await m.live(frames, i => { if (i % (frames / 2) === 0) wave(); if (i % 15 === 5) __zoo.fight.basicAttack(); if (i % 60 === 30 && skills) __zoo.skill((i - 30) / 60 % Math.min(4, skills)); });
        const g = m.graphics(level), defeated = [...used].filter(e => e.hp <= 0).length;
        const invalid = g.bad ?? m.dialog() ?? (__zoo.state.planet !== 'home' ? 'not on the home map' : used.size < 12 ? `only ${used.size} creatures joined the fight` : !defeated ? 'no creature was defeated: the script did not fight' : null);
        return { ...r, creatures: used.size, defeated, ...(invalid ? { invalid } : {}) };
      }, [...SCENES.wild, level, FIGHT_FRAMES]);
      await emit(game, row, out);
    }
    const spaceKey = 'space/late/frame/desktop-high';
    if (wanted(spaceKey)) {
      await page.evaluate(([x, z]) => { window.__m.stand(x, z, 42); window.__frozen.pump(120); __zoo.pinHero?.(null); void __zoo.launch(); }, SCENES.village);
      let flying = false; for (let i = 0; i < 100 && !flying; i++) { await settle(page, 30); flying = await page.evaluate(() => !!__zoo.flight); } // lift-off and the warp, up to 50 s of game time
      const row = await page.evaluate(([key, level, frames, flying]) => {
        const f = window.__frozen, m = window.__m;
        if (!flying) return { key, level, invalid: 'the starship never reached space' };
        f.pump(frames - 1 - Math.min(frames - 1, Math.round(__zoo.flight.time * 60))); // up to 4 s after entering space
        const counted = m.frame(), g = m.graphics(level), flight = __zoo.flight;
        const invalid = g.bad ?? (!flight ? 'the flight ended' : !counted.main ? 'the space view drew nothing' : null);
        return { key, ...counted, ...m.memory(), level, shadowMap: g.shadowMap, pitch: 42, flightTime: flight ? +flight.time.toFixed(2) : null, ...(invalid ? { invalid } : {}) };
      }, [spaceKey, level, SPACE_FRAMES, flying]);
      await emit(game, row, out);
    }
  } finally { await game.ctx.close(); }
  return out;
}

/** King Bear and the treant on the mid save: a frozen frame half way through the first wind-up, then (desktop) the 4 s that follow. */
async function measureBosses(browser, profile, device) {
  const level = 'high', game = await openGame(browser, device, level, 'mid'), { page } = game, out = [];
  try {
    for (const [boss, apart] of BOSSES) {
      const frameKey = `${boss}/mid/frame/${profile}`, peakKey = `${boss}/mid/peak/${profile}`, wantPeak = profile === 'desktop-high' && wanted(peakKey);
      if (!wanted(frameKey) && !wantPeak) continue;
      const row = await page.evaluate(async ([boss, apart, key, level]) => {
        const w = __zoo.world, m = window.__m, e = w.enemies.find(e => e.type === boss && e.boss && e.hp > 0);
        if (!e) return { key, level, invalid: `no living ${boss} on the map` };
        // 8 m from the boss, on the village side of it.
        const d = Math.hypot(e.x, e.z) || 1, x = e.x - e.x / d * apart, z = e.z - e.z / d * apart;
        const pitch = m.stand(x, z, 42);
        const woke = await m.pumpUntil(() => !!e.phase && e.phase !== 'idle', 600);
        const frames = woke + await m.pumpUntil(() => e.phase === 'windup' && w.windupProgress(e) >= .5, 1200);
        const counted = m.render(), g = m.graphics(level), screen = m.onScreen(e.x, 1, e.z), telegraph = e.phase === 'windup' ? +w.windupProgress(e).toFixed(2) : null;
        let invalid = null;
        if (Math.abs(pitch - 42) > .5) invalid = `camera ${pitch.toFixed(2)} degrees, not 42`;
        else if (g.bad) invalid = g.bad;
        else if (telegraph === null) invalid = `the ${boss} never wound up (phase ${e.phase} after ${frames} frames)`;
        else if (!screen.inFrame) invalid = `the ${boss} is not in frame (${screen.x}, ${screen.y})`;
        else if (m.dialog()) invalid = m.dialog();
        return { key, ...counted, ...m.memory(), level, shadowMap: g.shadowMap, pitch: +pitch.toFixed(2), boss: { skill: e.skill ?? 'strike', telegraph, framesToIt: frames, wokeAfter: woke, screen, apart: +Math.hypot(e.x - x, e.z - z).toFixed(1) }, ...(invalid ? { invalid } : {}) };
      }, [boss, apart, frameKey, level]);
      if (wanted(frameKey)) await emit(game, row, out);
      if (wantPeak) {
        const peak = row.invalid ? { key: peakKey, kind: 'live', level, invalid: 'no frozen frame before it: ' + row.invalid } : await liveRow(game, peakKey, 'live', async ([boss, level, frames]) => {
          const w = __zoo.world, m = window.__m, e = w.enemies.find(e => e.type === boss && e.boss), r = await m.live(frames), g = m.graphics(level), p = w.position;
          const invalid = g.bad ?? m.dialog() ?? (!e || e.hp <= 0 ? `the ${boss} is gone` : Math.hypot(e.x - p.x, e.z - p.z) > 20 || e.phase === 'idle' || e.phase === 'return' ? `the ${boss} left the fight (phase ${e.phase})` : null);
          return { ...r, ...(invalid ? { invalid } : {}) };
        }, [boss, level, LIVE_FRAMES]);
        await emit(game, peak, out);
      }
      await page.evaluate(() => { const w = __zoo.world; window.__m.stand(0, 3.6, 42); window.__frozen.pump(30); for (const e of w.enemies) if (e.boss && e.hp > 0) e.hp = e.maxHp; }); // back to the village between the two bosses
    }
  } finally { await game.ctx.close(); }
  return out;
}

/** The Colossus, woken through the dev hook with the Ember Well's lid off: a report, never gated. */
async function measureColossus(browser) {
  const level = 'high', key = EXTRA_KEYS.colossus[0], game = await openGame(browser, DESKTOP, level, 'late', { lid: 'wild' }), { page } = game, out = [];
  try {
    await page.evaluate(([x, z]) => { window.__m.stand(x, z, 42); }, COLOSSUS_SPOT);
    let ready = false; for (let i = 0; i < 80 && !ready; i++) { await settle(page, 12); ready = await page.evaluate(() => !!__zoo.colossus); } // the modes chunk loads on its own
    if (!ready) { await emit(game, { key, kind: 'report', level, invalid: 'the Colossus module never loaded' }, out); return out; }
    await page.evaluate(() => __zoo.colossus.start());
    let up = false; for (let i = 0; i < 80 && !up; i++) { await settle(page, 30); up = await page.evaluate(() => __zoo.colossus.debug.hp > 0); }
    await settle(page, 240); await idle(page); // it rises, its real model arrives
    const row = up ? await liveRow(game, key, 'report', async ([level, frames]) => {
      const m = window.__m, r = await m.live(frames), g = m.graphics(level), d = __zoo.colossus.debug;
      const invalid = g.bad ?? m.dialog() ?? (!(d.hp > 0) ? 'the Colossus is gone' : null);
      return { ...r, attacks: d.attacks, ...(invalid ? { invalid } : {}) };
    }, [level, LIVE_FRAMES]) : { key, kind: 'report', level, invalid: 'the Colossus never woke' };
    await emit(game, row, out);
  } finally { await game.ctx.close(); }
  return out;
}

const browser = await chromium.launch({ args: ['--use-angle=default', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'] });
const runs = [], started = Date.now();
try {
  for (let run = 1; run <= RUNS; run++) {
    console.log(`--- run ${run} of ${RUNS}`);
    const rows = []; for (const g of GROUPS) if (g[4].some(deg => Object.keys(SCENES).some(s => wanted(rowKey(s, g[3], deg, g[0]))))) rows.push(...await measureGroup(browser, g));
    if (EXTRA_KEYS.late.some(wanted)) rows.push(...await measureLateExtras(browser));
    if (EXTRA_KEYS.mid.some(wanted)) rows.push(...await measureBosses(browser, 'desktop-high', DESKTOP));
    if (EXTRA_KEYS.midPhone.some(wanted)) rows.push(...await measureBosses(browser, 'phone-high', PHONE));
    if (EXTRA_KEYS.colossus.some(wanted)) rows.push(...await measureColossus(browser));
    runs.push(rows);
  }
} finally { await browser.close(); }
console.log(`measured ${runs[0]?.length ?? 0} rows x ${RUNS} in ${((Date.now() - started) / 1000).toFixed(0)} s`);

const invalid = runs.flat().filter(r => r.invalid && r.kind !== 'report');
for (const r of runs.flat().filter(r => r.invalid)) console.log(`INVALID ${r.key}: ${r.invalid}`);
const BASELINE = new URL('./perf-baseline.json', here), LEDGER = new URL('./perf-ledger.json', here);
if (mode === 'baseline') {
  if (invalid.length) { console.log('baseline NOT written: invalid rows'); process.exit(1); }
  const rows = {}; for (const key of runs[0].map(r => r.key)) rows[key] = foldRuns(runs.map(run => run.find(r => r.key === key)));
  // The download section belongs to promo/first-visit-bytes.mjs; with ONLY the rows that were not measured stay as they were.
  const old = existsSync(BASELINE) ? JSON.parse(readFileSync(BASELINE, 'utf8')) : {}, all = only.length ? { ...old.rows, ...rows } : rows;
  const same = Object.values(all).filter(r => Object.values(r.spread).every(v => v === 0)).length;
  writeFileSync(BASELINE, JSON.stringify({ version: 1, runs: RUNS, rowsIdenticalAcrossRuns: same, rows: all, ...(old.download ? { download: old.download } : {}) }, null, 1) + '\n');
  console.log(`baseline written: ${Object.keys(all).length} rows (${Object.keys(rows).length} measured now), ${same} identical across ${RUNS} runs`);
} else if (mode === 'compare') {
  const baseline = JSON.parse(readFileSync(BASELINE, 'utf8')), ledger = existsSync(LEDGER) ? JSON.parse(readFileSync(LEDGER, 'utf8')) : { entries: [] };
  // With several runs the smaller value of each field is compared: noise cannot fail a row, a real addition shows in every run.
  const rows = runs[0].map(r => ({ ...r, ...Object.fromEntries(FIELDS.filter(f => typeof r[f] === 'number').map(f => [f, Math.min(...runs.map(run => run.find(x => x.key === r.key)?.[f] ?? Infinity))])) }));
  const subset = only.length ? { rows: Object.fromEntries(Object.entries(baseline.rows).filter(([k]) => wanted(k))) } : baseline;
  const result = compareRows(subset, rows, ledger);
  for (const line of result.report) console.log(line);
  for (const f of result.failures) console.log('FAIL ' + f);
  console.log(result.ok ? 'perf gate: pass' : `perf gate: ${result.failures.length} failure(s)`);
  process.exit(result.ok ? 0 : 1);
}
