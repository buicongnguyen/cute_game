// Browser check that failed model downloads recover without a reload. Like hud-layout.test.mjs it needs a
// running DEV server and Playwright, so it only runs when HUD_LAYOUT_URL is set:
//   HUD_LAYOUT_URL=http://127.0.0.1:5461/ PLAYWRIGHT_MODULE=<path to playwright/index.mjs> node --test tests/art-retry-browser.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { dismissWelcome } from './browser-start.mjs';

const url = process.env.HUD_LAYOUT_URL;
const skip = !url && 'set HUD_LAYOUT_URL to a running DEV server';
async function chromium() {
  const given = process.env.PLAYWRIGHT_MODULE, pw = await import(given ? pathToFileURL(given).href : 'playwright');
  return pw.chromium ?? pw.default.chromium;
}
/** Real building models on the home world (the refined cottage, stalls, chest...) and the farm kit state. */
const art = () => {
  const w = window.__zoo.world;
  return { refined: w.entities.filter(e => e.mesh.userData.refinedAsset).length, kitTrees: !!w.kit('tree_round'), note: !document.querySelector('#art-note')?.hidden };
};

async function open(browser, block) {
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  await page.routeWebSocket(socketUrl => new URL(socketUrl).searchParams.has('token'), () => {});
  const tries = new Map();
  await page.route(/\.glb(\?|$)/, route => {
    const name = new URL(route.request().url()).pathname.split('/').pop(), n = (tries.get(name) ?? 0) + 1; tries.set(name, n);
    return block(n) ? route.abort('failed') : route.continue();
  });
  await page.goto(url, { waitUntil: 'load', timeout: 60000 });
  await page.waitForSelector('#title-screen button.primary', { state: 'visible', timeout: 60000 });
  await page.waitForFunction(() => !document.querySelector('#title-screen').inert, null, { timeout: 30000 });
  await page.fill('#name-input', 'Retry');
  await page.click('#title-screen button.primary');
  await page.waitForFunction(() => !!window.__zoo?.world, null, { timeout: 30000 }); await dismissWelcome(page);
  return { page, tries };
}

test('models whose first download fails appear after the automatic retry, without a reload', { skip, timeout: 120000 }, async () => {
  const browser = await (await chromium()).launch({ args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
  try {
    const { page, tries } = await open(browser, n => n === 1);
    await page.waitForFunction(() => window.__zoo.world.entities.some(e => e.mesh.userData.refinedAsset === 'cottage'), null, { timeout: 30000 });
    const now = await page.evaluate(art);
    assert.ok(now.refined >= 5, `buildings use their models (${now.refined})`); assert.ok(now.kitTrees); assert.equal(now.note, false);
    assert.equal(tries.get('cottage.glb'), 2, 'one failure, one retry');
  } finally { await browser.close(); }
});

test('models still missing after the quick retries show a note, and tapping it brings them in', { skip, timeout: 120000 }, async () => {
  const browser = await (await chromium()).launch({ args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
  try {
    let offline = true;
    const { page } = await open(browser, () => offline);
    await page.waitForSelector('#art-note:not([hidden])', { timeout: 40000 });
    assert.equal((await page.evaluate(art)).refined, 0, 'stand-ins while the files are unreachable');
    offline = false;
    await page.click('#art-note');
    await page.waitForFunction(() => window.__zoo.world.entities.some(e => e.mesh.userData.refinedAsset === 'cottage'), null, { timeout: 30000 });
    await page.waitForSelector('#art-note', { state: 'hidden', timeout: 10000 });
    const now = await page.evaluate(art);
    assert.ok(now.refined >= 5); assert.ok(now.kitTrees, 'trees too');
  } finally { await browser.close(); }
});
