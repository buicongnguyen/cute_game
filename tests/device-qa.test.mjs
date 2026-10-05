// Browser checks from the wave-11 device QA: the cottage door leak, the indoor HUD, 44 px touch targets and narrow-phone
// skill labels. Like hud-layout.test.mjs they need a running DEV server and Playwright, so they only run when HUD_LAYOUT_URL is set:
//   HUD_LAYOUT_URL=http://127.0.0.1:5302/ PLAYWRIGHT_MODULE=<path to playwright/index.mjs> node --test tests/device-qa.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { dismissWelcome } from './browser-start.mjs';

const url = process.env.HUD_LAYOUT_URL;
const skip = !url && 'set HUD_LAYOUT_URL to a running DEV server';
const PHONE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };

async function play(view, run) {
  const given = process.env.PLAYWRIGHT_MODULE, pw = await import(given ? pathToFileURL(given).href : 'playwright');
  const browser = await (pw.chromium ?? pw.default.chromium).launch({ args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
  try {
    const page = await (await browser.newContext(view)).newPage();
    await page.routeWebSocket(u => new URL(u).searchParams.has('token'), () => {});
    await page.goto(url, { waitUntil: 'load', timeout: 60000 });
    await page.waitForSelector('#title-screen button.primary', { state: 'visible', timeout: 60000 });
    await page.waitForFunction(() => !document.querySelector('#title-screen').inert, null, { timeout: 30000 });
    await run(page);
  } finally { await browser.close(); }
}
async function start(page) {
  await page.fill('#name-input', 'QA'); await page.click('#title-screen button.primary');
  await page.waitForFunction(() => !!window.__zoo?.world, null, { timeout: 30000 }); await dismissWelcome(page); await page.waitForTimeout(3000);
}

/** Controls whose hit area (their box, or an absolutely placed ::before/::after) is under 44 px on this screen. */
const smallTargets = () => {
  const out = [];
  for (const el of document.querySelectorAll('button, [role=button], select, a[href]')) {
    if (el.closest('[hidden],[inert]')) continue; const st = getComputedStyle(el); if (st.visibility === 'hidden' || st.pointerEvents === 'none') continue;
    const b = el.getBoundingClientRect(); if (!b.width || !b.height || b.bottom < 0 || b.top > innerHeight || b.right < 0 || b.left > innerWidth) continue;
    let w = b.width, h = b.height;
    for (const ps of ['::before', '::after']) { const s = getComputedStyle(el, ps); if (s.content !== 'none' && s.position === 'absolute') { w = Math.max(w, parseFloat(s.width) || 0); h = Math.max(h, parseFloat(s.height) || 0); } }
    if (w < 43.5 || h < 43.5) out.push(`${el.className || el.tagName}[${el.dataset.action ?? ''}] ${Math.round(w)}x${Math.round(h)}`);
  }
  return out;
};

test('ten trips in and out of the cottage leave the village scene and its draw calls flat', { skip, timeout: 180000 }, () => play({ viewport: { width: 1440, height: 900 } }, async page => {
  // Neighbours change clothes and respawn during ordinary play; this fixture measures the cottage's lifetime only.
  await page.evaluate(async () => (await import('/src/bots.ts')).setNeighboursOn(false));
  await start(page);
  await page.evaluate(() => { const w = window.__zoo.world; w.position.set(0, 0, -4); w.cameraTarget.copy(w.position); });
  await page.waitForTimeout(900);
  const probe = () => page.evaluate(() => {
    const w = window.__zoo.world; let n = 0, doors = 0;
    // Refined fish now have deeper mesh trees: prune the entire independently spawning pond population.
    const count = o => { if (o.name === 'fishing') return; n++; if (o.name === 'cottage-door') doors++; for (const c of o.children) count(c); };
    count(w.scene);
    const fish = w.scene.getObjectByName('fishing'), visible = fish?.visible;
    window.__cottageCamera ??= w.camera.clone();
    w.camera.copy(window.__cottageCamera);
    if (fish) fish.visible = false;
    w.render(); const draws = w.renderer.info.render.calls;
    if (fish) fish.visible = visible;
    return { n, doors, draws };
  });
  const first = await probe();
  for (let i = 0; i < 10; i++) {
    await page.evaluate(() => { window.__zoo.world.position.set(0, 0, -4); window.__zoo.house.enter(true); }); await page.waitForTimeout(700);
    await page.evaluate(() => window.__zoo.house.leave()); await page.waitForTimeout(900);
  }
  const last = await probe();
  assert.equal(last.doors, 1, 'one outdoor door');
  // Nothing in the stable village fixture may grow after repeated entries.
  assert.ok(last.n <= first.n + 2, `scene objects ${first.n} -> ${last.n}`);
  assert.ok(last.draws <= first.draws + 3, `draw calls ${first.draws} -> ${last.draws}`);
}));

test('indoors the HUD says Cottage and the discovery pill is hidden', { skip, timeout: 120000 }, () => play(PHONE, async page => {
  await start(page);
  await page.evaluate(() => { const w = window.__zoo.world; w.position.set(2.6, 0, 10); w.cameraTarget.copy(w.position); }); await page.waitForTimeout(600);
  await page.evaluate(() => { window.__zoo.world.position.set(0, 0, -4); window.__zoo.house.enter(true); }); await page.waitForTimeout(1200);
  const r = await page.evaluate(() => { const p = document.querySelector('#discovery-progress'), b = p.getBoundingClientRect(); return { zone: document.querySelector('#zone-name').textContent, shown: !p.hidden && getComputedStyle(p).visibility !== 'hidden' && b.width > 0, bottom: b.bottom }; });
  assert.equal(r.zone, 'Cottage'); assert.equal(r.shown, false, 'no discovery pill indoors');
  await page.evaluate(() => window.__zoo.house.leave()); await page.waitForTimeout(1200);
  assert.notEqual(await page.evaluate(() => document.querySelector('#zone-name').textContent), 'Cottage');
}));

test('every tappable control on the title, HUD and main dialogs has a 44 px hit area on a touch phone', { skip, timeout: 180000 }, () => play(PHONE, async page => {
  const bad = { title: await page.evaluate(smallTargets) };
  await start(page);
  bad.hud = await page.evaluate(smallTargets);
  for (const d of ['settings', 'quests', 'shop', 'market', 'help', 'map', 'upgrades', 'crafting', 'decorations', 'storage', 'planets']) {
    await page.evaluate(d => { const z = window.__zoo; (z.dialogs[d] ?? z[d])(); }, d); await page.waitForTimeout(400);
    bad[d] = await page.evaluate(smallTargets);
    await page.evaluate(() => document.querySelector('[data-action="close"]')?.click()); await page.waitForTimeout(250);
  }
  for (const k of Object.keys(bad)) if (!bad[k].length) delete bad[k];
  assert.deepEqual(bad, {});
}));

test('desktop keeps its compact controls (the touch hit areas are pointer:coarse only)', { skip, timeout: 120000 }, () => play({ viewport: { width: 1440, height: 900 } }, async page => {
  const swatch = await page.evaluate(() => { const b = document.querySelector('#title-screen [data-action="color"]'); return { w: b.getBoundingClientRect().width, before: getComputedStyle(b, '::before').content }; });
  assert.ok(swatch.w < 44 && swatch.before === 'none', JSON.stringify(swatch));
}));

for (const lang of ['en', 'vi']) test(`skill labels fit and stay apart on a 360 px phone (${lang})`, { skip, timeout: 120000 }, () => play({ viewport: { width: 360, height: 740 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }, async page => {
  await page.evaluate(l => localStorage.setItem('cute-game-language', l), lang); await page.reload();
  await page.waitForSelector('#title-screen button.primary', { state: 'visible', timeout: 60000 });
  await page.waitForFunction(() => !document.querySelector('#title-screen').inert, null, { timeout: 30000 });
  await start(page);
  const r = await page.evaluate(() => [...document.querySelectorAll('.skill > small')].map(s => { const b = s.getBoundingClientRect(); return { text: s.textContent, cut: s.scrollWidth > s.clientWidth + 1, l: b.left, r: b.right, t: b.top, b: b.bottom }; }));
  assert.deepEqual(r.filter(x => x.cut).map(x => x.text), [], 'no label is cut off');
  const meet = (a, b) => a.l < b.r - .5 && b.l < a.r - .5 && a.t < b.b - .5 && b.t < a.b - .5;
  for (let i = 0; i < r.length; i++) for (let j = i + 1; j < r.length; j++) assert.ok(!meet(r[i], r[j]), `${r[i].text} meets ${r[j].text}`);
  for (const x of r) assert.ok(x.l >= 0 && x.r <= 360, `${x.text} on screen`);
}));
