// Frozen-clock pixel A/B for the structural speed-ups (src/perf-flags.ts).
//
//   VITE_PERF_HOOK=1 npx vite build --outDir /tmp/zoo-perf --base /cute_game/   (any build that exposes __zoo/__vault)
//   node promo/frozen-ab.mjs http://127.0.0.1:5312/cute_game/ mergeRemoteAvatars out/ab [village bots vault]
//
// The page gets a seeded Math.random, a fake performance.now/Date.now and a requestAnimationFrame that only runs when the
// script pumps it, so game time stands still between pumps. Each scene is played for N frames, then rendered twice from the
// SAME state with no time passing: with the speed-up on (the state the played frames left behind), then with it off (the full
// recompute, as ground truth). The two screenshots are compared pixel by pixel (HUD hidden); a speed-up that must not change
// the picture reports `differing: 0`. Two separate page loads are NOT comparable (asset arrival order moves animals and
// particles), which is why both renders come from one frozen page.
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
const require = createRequire('C:/Users/n/source/repos/3D_claudeopus55/package.json');
const { chromium } = require('playwright');
const BASE = 1.8e12;
const [url, flag, out, ...want] = process.argv.slice(2);
if (!url || !flag || !out) { console.log('usage: node promo/frozen-ab.mjs <url> <flag> <outdir> [village|bots|vault ...]'); process.exit(2); }
mkdirSync(out, { recursive: true });
const scenes = want.length ? want : ['village', 'bots', 'vault'];
const save = JSON.parse(readFileSync(new URL('./save.json', import.meta.url), 'utf8'));
for (const p of save.plots ?? []) p.plantedAt = BASE - p.growDuration - 5000;
save.savedAt = BASE; save.energy = 99999;

const FREEZE = base => {
  let seed = 12345; Math.random = () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  let fake = 1000, auto = true, id = 0; const queue = [];
  performance.now = () => fake; Date.now = () => base + fake;
  window.requestAnimationFrame = cb => { queue.push(cb); return ++id; }; window.cancelAnimationFrame = () => {};
  window.__pump = n => { for (let i = 0; i < n; i++) { fake += 1000 / 60; for (const cb of queue.splice(0)) cb(fake); } return fake; };
  setInterval(() => { if (auto) window.__pump(1); }, 16);
  window.__freeze = (target = 14000) => { auto = false; while (fake < target - 1e-6) window.__pump(1); };
};

async function diff(browser, fa, fb, outPng) {
  const p = await browser.newPage();
  const r = await p.evaluate(async ([A, B]) => {
    const load = async s => { const i = new Image(); i.src = 'data:image/png;base64,' + s; await i.decode(); const c = document.createElement('canvas'); c.width = i.width; c.height = i.height; const x = c.getContext('2d'); x.drawImage(i, 0, 0); return x.getImageData(0, 0, i.width, i.height); };
    const a = await load(A), b = await load(B); if (a.width !== b.width || a.height !== b.height) return { error: 'size differs' };
    let n = 0, max = 0, sum = 0, big = 0; const o = new Uint8ClampedArray(a.data.length);
    for (let i = 0; i < a.data.length; i += 4) { let d = 0; for (let c = 0; c < 3; c++) d = Math.max(d, Math.abs(a.data[i + c] - b.data[i + c])); if (d) { n++; sum += d; if (d > max) max = d; if (d > 16) big++; o[i] = 255; o[i + 3] = 255; } else { o[i] = a.data[i] >> 2; o[i + 1] = a.data[i + 1] >> 2; o[i + 2] = a.data[i + 2] >> 2; o[i + 3] = 255; } }
    const c = document.createElement('canvas'); c.width = a.width; c.height = a.height; c.getContext('2d').putImageData(new ImageData(o, a.width, a.height), 0, 0);
    return { pixels: a.width * a.height, differing: n, over16: big, maxDelta: max, meanDelta: n ? +(sum / n).toFixed(2) : 0, png: c.toDataURL('image/png').split(',')[1] };
  }, [readFileSync(fa).toString('base64'), readFileSync(fb).toString('base64')]);
  await p.close(); if (r.png) writeFileSync(outPng, Buffer.from(r.png, 'base64')); delete r.png; return r;
}

const browser = await chromium.launch({ args: ['--use-angle=default', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'] });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, serviceWorkers: 'block' });
await ctx.addInitScript(([s]) => { try { localStorage.setItem('cute-game-save-v1', s); localStorage.setItem('cute-game-slot', '0'); localStorage.setItem('cute-game-language', 'en'); } catch {} }, [JSON.stringify(save)]);
await ctx.addInitScript(FREEZE, BASE);
const page = await ctx.newPage();
await page.goto(url); await page.waitForSelector('[data-action="start"]'); await page.click('[data-action="start"]'); await page.waitForSelector('#hud', { state: 'visible' });
await page.waitForTimeout(10000); await page.evaluate(() => window.__freeze(50000)); await page.waitForTimeout(300);
const setups = {
  village: () => { __zoo.world.position.set(-9, 0, 2); },
  bots: () => { const w = __zoo.world; const r = [...w.remotePlayers.values()][0]; if (r) w.position.set(r.pose.x + 3, 0, r.pose.z + 3); },
  vault: () => { __vault.quickStart(0, true); },
};
let failed = false;
for (const s of scenes) {
  await page.evaluate(setups[s]); await page.evaluate(n => window.__pump(n), s === 'vault' ? 400 : 180); await page.waitForTimeout(400); await page.evaluate(n => window.__pump(n), 6);
  await page.addStyleTag({ content: 'body *{visibility:hidden !important} canvas{visibility:visible !important}' });
  for (const on of [true, false]) {
    await page.evaluate(([f, v, rebuild]) => { __zoo.flags[f] = v; if (rebuild) __zoo.world.refreshAvatars(); __zoo.world.render(); }, [flag, on, flag === 'mergeRemoteAvatars' || flag === 'cacheHulls']);
    await page.waitForTimeout(150); await page.evaluate(() => __zoo.world.render());
    await page.screenshot({ path: `${out}/${s}-${on ? 'on' : 'off'}.png` });
  }
  const r = await diff(browser, `${out}/${s}-on.png`, `${out}/${s}-off.png`, `${out}/${s}-diff.png`);
  console.log(s, JSON.stringify(r)); if (!(r.differing === 0 || r.differing < 50 && r.over16 < 50)) failed = true;
}
await browser.close(); process.exit(failed ? 1 : 0);
