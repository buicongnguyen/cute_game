// The speed gate of docs/QUALITY-PLAN.md: what the game draws at three fixed places, and whether a slow CPU still holds 60 fps.
// Run against a dev server (it needs the __zoo hook):  npx vite --port 5298 --host 127.0.0.1 --strictPort
//   node promo/perf-budget.mjs                 the camera as it is
//   PITCH=40,30,22 node promo/perf-budget.mjs  also tilt the camera to these pitches (degrees above the ground), same distance
//   FAR=85 shortens the view distance for the tilted rows.  PORT picks the server.  SHOTS=<dir> saves a picture of each row.
// Counts are one whole frame (shadow pass included). Creatures keep moving, so numbers wander by a few percent: compare
// rows of one run, and use promo/frozen-ab.mjs when a change needs an exact before/after.
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
const { chromium } = createRequire('C:/Users/n/source/repos/3D_claudeopus55/package.json')('playwright');
const save = readFileSync(new URL('./save.json', import.meta.url), 'utf8'), base = `http://127.0.0.1:${process.env.PORT || 5298}`;
const SCENES = { village: [0, 3.6], wild: [-13, -57], canyon: [105, -40] }, NOW = 51.5, DISTANCE = 21.7;
const rows = [['now', NOW, 300], ...(process.env.PITCH || '').split(',').filter(Boolean).map(d => [`${d}°`, Number(d), Number(process.env.FAR || 300)])];
const browser = await chromium.launch({ args: ['--use-angle=default', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'] });
const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
await ctx.addInitScript(([s]) => { try { localStorage.setItem('cute-game-save-v1', s); localStorage.setItem('cute-game-slot', '0'); localStorage.setItem('cute-game-language', 'en'); localStorage.setItem('zoo-colossus-sleeps', 'asleep'); } catch {} }, [save]);
const page = await ctx.newPage(), cdp = await ctx.newCDPSession(page); page.on('pageerror', e => console.log('ERR', e.message.slice(0, 120)));
await page.goto(base + '/'); await page.waitForSelector('[data-action="start"]'); await page.click('[data-action="start"]'); await page.waitForTimeout(8000);
// The dev server hands out the very module the game uses, so the camera can be tilted from here.
await page.evaluate(async () => { window.__cam = (await import('/src/camera-rig.ts')).CAMERA; });
const tilt = (deg, far) => page.evaluate(([deg, far, d]) => { const r = deg * Math.PI / 180, w = __zoo.world; __cam.offset[1] = d * Math.sin(r); __cam.offset[2] = d * Math.cos(r); w.camera.far = far; w.camera.updateProjectionMatrix(); w.resize(); }, [deg, far, DISTANCE]);
const frame = () => page.evaluate(() => new Promise(done => { const r = __zoo.world.renderer; requestAnimationFrame(() => { r.info.autoReset = false; r.info.reset(); requestAnimationFrame(() => { const o = { calls: r.info.render.calls, triangles: r.info.render.triangles }; r.info.autoReset = true; done(o); }); }); }));
const fps = ms => page.evaluate(ms => new Promise(done => { const d = []; let last = performance.now(); const end = last + ms, f = now => { d.push(now - last); last = now; if (now < end) requestAnimationFrame(f); else { d.shift(); const sum = d.reduce((a, b) => a + b, 0); d.sort((a, b) => a - b); done({ fps: +(d.length / (sum / 1000)).toFixed(1), p95: +d[Math.floor(d.length * .95)].toFixed(1) }); } }; requestAnimationFrame(f); }), ms);
for (const [scene, [x, z]] of Object.entries(SCENES)) {
  await page.evaluate(([x, z]) => { const w = __zoo.world; w.position.set(x, 0, z); w.facing = 0; w.zoom = 1; w.resize(); }, [x, z]);
  for (const [label, deg, far] of rows) {
    await tilt(deg, far); await page.waitForTimeout(2500);
    const a = await frame(), b = await frame();
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 }); await page.waitForTimeout(1500); const slow = await fps(5000); await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
    console.log(JSON.stringify({ scene, camera: label, drawCalls: Math.max(a.calls, b.calls), triangles: Math.max(a.triangles, b.triangles), slowCpuFps: slow.fps, slowCpuP95ms: slow.p95 }));
    if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/budget-${scene}-${String(deg).replace('.', '_')}.png` });
  }
}
await browser.close();
