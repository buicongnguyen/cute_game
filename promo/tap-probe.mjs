// Tap-target probe: opens every dialog / panel at four touch viewports and lists each visible interactive element whose
// real tap area (its box plus any ::after / padding hit area, measured by elementFromPoint) is under 44x44 CSS px, or whose
// hit area is stolen by a neighbouring control.
//
//   node promo/tap-probe.mjs                      (needs `npx vite --port 5301 --strictPort`; PROBE_URL overrides)
//   SIZES=390x844 ONLY=hud,bag node promo/tap-probe.mjs      (subset)
//   JSON=out.json node promo/tap-probe.mjs        (also writes the offenders)
//
// Method: for each control the page scrolls it to the middle, then walks the centre row and the centre column one pixel
// at a time (up to 22 px beyond the box on each side) while elementFromPoint still answers the control or one of its
// children: that run is the tap area. It also samples the corners and edge middles of the visible box: when another
// interactive element answers there, the neighbour steals the tap ("stolen").
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync } from 'node:fs';
const require = createRequire('C:/Users/n/source/repos/3D_claudeopus55/package.json');
const { chromium } = require('playwright');
const URL_ = process.env.PROBE_URL || 'http://localhost:5301/';
const save = readFileSync(new URL('./save.json', import.meta.url), 'utf8');
const MIN = 44;
const ALL_SIZES = [[320, 568], [390, 844], [768, 1024], [844, 390]];
const sizes = (process.env.SIZES ? process.env.SIZES.split(',').map(s => s.split('x').map(Number)) : ALL_SIZES);
const only = process.env.ONLY ? new Set(process.env.ONLY.split(',')) : null;

const SEL = 'button, a[href], [role="button"], [role="switch"], [role="radio"], [role="tab"], input:not([type="hidden"]), select, textarea, summary, [data-action], [data-rescue], [data-ctf], label[for]';

/** Runs in the page: measures every visible interactive element under `root`. */
function measure([sel, MIN]) {
  const out = [];
  const vis = el => { const cs = getComputedStyle(el); if (cs.pointerEvents === 'none') return false; if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity === 0) return false; for (let p = el.parentElement; p; p = p.parentElement) { const c = getComputedStyle(p); if (c.display === 'none' || c.visibility === 'hidden' || +c.opacity === 0 || p.hidden) return false; } const r = el.getBoundingClientRect(); return r.width > 1 && r.height > 1; };
  const mine = (el, hit) => !!hit && (hit === el || el.contains(hit));
  const describe = el => { const id = el.id ? '#' + el.id : '', cl = typeof el.className === 'string' && el.className ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : '', da = el.dataset?.action ? `[${el.dataset.action}${el.dataset.kind ? ':' + el.dataset.kind : ''}]` : ''; return (el.tagName.toLowerCase() + id + cl + da) + (el.getAttribute('aria-label') || el.textContent.trim().slice(0, 18) ? ' "' + (el.getAttribute('aria-label') || el.textContent.trim()).slice(0, 18) + '"' : ''); };
  const seen = new Set();
  // While a dialog is open only the dialog is reachable (the HUD below it is inert and covered by the backdrop).
  const modals = [...document.querySelectorAll('dialog[open]')], layer = document.querySelector('#dialog-layer'), scope = modals.length ? modals.at(-1) : layer && !layer.hidden ? layer : document;
  for (const el of scope.querySelectorAll(sel)) {
    if (seen.has(el) || !vis(el) || el.closest('[inert]')) continue; seen.add(el);
    if (el.tagName !== 'SUMMARY') { const d = el.closest('details'); if (d && !d.open) continue; }
    // An element nested in another control (an icon span with data-action) is the parent's business.
    if (el.parentElement?.closest(sel) && el.tagName !== 'INPUT') continue;
    if (el.disabled && !el.closest('label')) { /* disabled controls still want a target, but only count if visible */ }
    el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' });
    let r = el.getBoundingClientRect();
    const W = innerWidth, H = innerHeight;
    // A visible box outside the screen after scrolling (fixed offscreen panels): skip.
    if (r.right < 0 || r.bottom < 0 || r.left > W || r.top > H) continue;
    const cx = Math.round(Math.min(Math.max(r.left + r.width / 2, 1), W - 2)), cy = Math.round(Math.min(Math.max(r.top + r.height / 2, 1), H - 2));
    const c = document.elementFromPoint(cx, cy);
    if (!mine(el, c)) {
      // Covered at the centre: by a neighbour control (stolen), or by an overlay/other layer (not reachable: not our business).
      const thief = c?.closest(sel);
      if (thief && !thief.contains(el) && !el.contains(thief)) out.push({ el: describe(el), w: 0, h: 0, box: [Math.round(r.width), Math.round(r.height)], stolen: describe(thief), covered: true });
      continue;
    }
    const run = (dx, dy, lim) => { let a = 0, b = 0, thiefA = null, thiefB = null; for (let i = 1; i <= lim; i++) { const x = cx + dx * i, y = cy + dy * i; const h = document.elementFromPoint(x, y); if (!mine(el, h)) { thiefA = h; break; } a = i; } for (let i = 1; i <= lim; i++) { const x = cx - dx * i, y = cy - dy * i; const h = document.elementFromPoint(x, y); if (!mine(el, h)) { thiefB = h; break; } b = i; } return { len: a + b + 1, thiefA, thiefB }; };
    const limX = Math.ceil(r.width / 2) + 24, limY = Math.ceil(r.height / 2) + 24;
    const rx = run(1, 0, Math.min(limX, W)), ry = run(0, 1, Math.min(limY, H));
    // Stolen: another control answers inside the visible box (corners, edge middles, inset 2px).
    const pts = [[.12, .12], [.88, .12], [.12, .88], [.88, .88], [.5, .12], [.5, .88], [.12, .5], [.88, .5]]; let stolen = '';
    for (const [fx, fy] of pts) { const x = Math.min(Math.max(r.left + r.width * fx, 0), W - 1), y = Math.min(Math.max(r.top + r.height * fy, 0), H - 1); const h = document.elementFromPoint(x, y); if (h && !mine(el, h)) { const t = h.closest(sel); if (t && t !== el && !t.contains(el) && !el.contains(t)) { stolen = describe(t); break; } } }
    // Measuring stopped at a neighbour: tell which one.
    const nb = [rx.thiefA, rx.thiefB, ry.thiefA, ry.thiefB].map(h => h?.closest?.(sel)).find(t => t && t !== el && !t.contains(el) && !el.contains(t));
    out.push({ el: describe(el), w: rx.len, h: ry.len, box: [Math.round(r.width), Math.round(r.height)], stolen, neighbour: nb ? describe(nb) : '' });
  }
  return out;
}

async function settle(page, ms = 450) { await page.waitForTimeout(ms); }
async function closeAll(page) {
  for (let i = 0; i < 4; i++) {
    const open = await page.evaluate(() => { const l = document.querySelector('#dialog-layer'); const m = document.querySelectorAll('dialog[open]'); m.forEach(d => d.close()); return (!!l && !l.hidden) || m.length > 0; });
    if (!open) return;
    await page.evaluate(() => { (document.querySelector('#dialog-layer [data-action="close"]') || document.querySelector('#dialog-close'))?.click(); });
    await page.waitForTimeout(150);
    if (await page.evaluate(() => !document.querySelector('#dialog-layer')?.hidden)) await page.keyboard.press('Escape');
  }
}
const click = (page, selector, nth = 0) => page.evaluate(([s, n]) => { const el = document.querySelectorAll(s)[n]; if (!el) return false; el.click(); return true; }, [selector, nth]);
const dlg = (page, name) => page.evaluate(n => { __zoo.dialogs[n](); }, name);
const interact = (page, kind) => page.evaluate(k => { const e = __zoo.world.entities.find(x => x.kind === k); if (!e) return false; __zoo.world.onInteract(e); return true; }, kind);

/** [name, async (page, ctx) => void] : each opens one screen (the page is then probed and the dialog closed). */
const SCENES = [
  ['hud', async () => {}],
  ['bag', p => dlg(p, 'inventory')],
  ['wardrobe', p => p.evaluate(() => __zoo.panel('wardrobe'))],
  ['chest', p => dlg(p, 'storage')],
  ['shop-Tools', async p => { await dlg(p, 'shop'); }],
  ['market', p => dlg(p, 'market')],
  ['cook', p => dlg(p, 'cooking')],
  ['craft', p => dlg(p, 'crafting')],
  ['upgrade', p => dlg(p, 'upgrades')],
  ['forge', p => dlg(p, 'forgeMenu')],
  ['map', p => dlg(p, 'map')],
  ['settings', p => dlg(p, 'settings')],
  ['help', p => dlg(p, 'help')],
  ['decorations', p => dlg(p, 'decorations')],
  ['looks', p => p.evaluate(() => __zoo.panel('looks'))],
  ['travel', p => p.evaluate(() => __zoo.panel('travel'))],
  ['bed', async p => { await interact(p, 'plot'); }],
  ['helper', async p => { await interact(p, 'plot'); await settle(p, 200); await click(p, '#dialog [data-action="helper"]'); }],
  ['pen', async p => { await dlg(p, 'shop'); await settle(p, 200); await click(p, '[data-action="shop-tab"][data-kind="Pets"]'); await settle(p, 200); await click(p, '#dialog [data-action="pen-menu"]'); }],
  ['neighbours', async p => { await dlg(p, 'settings'); }],
  ['leaderboard', p => click(p, '#hud [data-action="ranking"]')],
  ['online', p => click(p, '#social-slot button')],
  ['friend', async p => { await interact(p, 'friend'); }],
  ['rescue-briefing', p => p.evaluate(() => __rescue.brief('toy'))],
  ['ctf-gate', p => p.evaluate(() => __ctf.open())],
];
const TABS = {
  'shop': { open: p => dlg(p, 'shop'), tabs: '[data-action="shop-tab"]', attr: 'kind' },
  'journal': { open: p => dlg(p, 'quests'), tabs: '[data-action="journal-tab"]', attr: 'kind' },
};

async function launch(browser, w, h, slotSave) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  await ctx.addInitScript(([s]) => { try { if (s) localStorage.setItem('cute-game-save-v1', s); localStorage.setItem('cute-game-slot', '0'); localStorage.setItem('cute-game-language', 'en'); localStorage.setItem('cute-game-tutorial', 'done'); } catch {} }, [slotSave]);
  const page = await ctx.newPage();
  page.on('pageerror', e => console.log('  pageerror', e.message.slice(0, 120)));
  await page.goto(URL_);
  await page.waitForSelector('[data-action="start"]', { timeout: 60000 });
  return { ctx, page };
}

export async function probeAll() {
  const browser = await chromium.launch({ args: ['--use-angle=default', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'] });
  const report = {};
  for (const [w, h] of sizes) {
    const key = `${w}x${h}`, list = []; report[key] = list;
    const add = (scene, rows) => { for (const r of rows) list.push({ scene, ...r }); };
    const bad = r => r.covered || r.w < MIN || r.h < MIN || !!r.stolen;
    const probe = async (page, scene) => { const rows = await page.evaluate(measure, [SEL, MIN]); add(scene, rows.filter(bad)); return rows.length; };
    // Title screen, its profile list, then the game.
    let { ctx, page } = await launch(browser, w, h, save);
    const want = n => !only || only.has(n);
    if (want('title')) { await settle(page, 800); await probe(page, 'title'); }
    if (want('title-profiles')) { await click(page, '[data-action="title-profiles"]'); await settle(page, 300); await probe(page, 'title-profiles'); }
    await page.evaluate(() => document.querySelector('[data-action="start"]').click());
    await page.waitForTimeout(7000);
    await page.evaluate(() => document.querySelector('.tutorial,.welcome')?.remove());
    const total = {};
    for (const [name, open] of SCENES) {
      if (!want(name)) continue;
      try { await closeAll(page); await open(page); await settle(page); total[name] = await probe(page, name); } catch (e) { console.log(`  [${key}] ${name} failed: ${e.message.slice(0, 100)}`); }
      await closeAll(page);
    }
    for (const [name, def] of Object.entries(TABS)) {
      if (!want(name)) continue;
      try {
        await closeAll(page); await def.open(page); await settle(page);
        const kinds = await page.evaluate(([s, a]) => [...document.querySelectorAll(s)].map(b => b.dataset[a]), [def.tabs, def.attr]);
        for (const kind of kinds) { await click(page, `${def.tabs}[data-${def.attr}="${kind}"]`); await settle(page, 250); await probe(page, `${name}:${kind}`); }
      } catch (e) { console.log(`  [${key}] ${name} tabs failed: ${e.message.slice(0, 100)}`); }
      await closeAll(page);
    }
    // Rescue build / squad / me tabs and the Flag Rush match HUD.
    if (want('rescue')) {
      try {
        await closeAll(page); await page.evaluate(() => __rescue.quickStart('toy')); await settle(page, 2500);
        for (const tab of ['defences', 'squad', 'me']) { await page.evaluate(t => __rescue.tab(t), tab); await settle(page, 400); await probe(page, `rescue:${tab}`); }
        await page.evaluate(() => __rescue.leave?.()); await closeAll(page);
      } catch (e) { console.log(`  [${key}] rescue failed: ${e.message.slice(0, 100)}`); }
      await page.reload(); await page.waitForSelector('[data-action="start"]'); await page.evaluate(() => document.querySelector('[data-action="start"]').click()); await page.waitForTimeout(6000);
    }
    await ctx.close();
    // A fresh profile (no save): the title card, profile list and the first-run welcome.
    if (want('fresh')) {
      const f = await launch(browser, w, h, null); await settle(f.page, 800); await probe(f.page, 'fresh:title');
      await f.page.evaluate(() => document.querySelector('[data-action="start"]').click()); await f.page.waitForTimeout(5000); await probe(f.page, 'fresh:hud'); await f.ctx.close();
    }
    console.log(`${key}: ${list.length} offenders; controls probed per scene: ` + Object.entries(total).map(([k, v]) => `${k}=${v}`).join(' '));
  }
  await browser.close();
  return report;
}

const report = await probeAll();
const lines = [];
for (const [key, list] of Object.entries(report)) {
  // One line per distinct control (the same HUD buttons repeat in every scene); the scenes it showed up in are merged.
  const byEl = new Map();
  for (const r of list) { const k = r.el; const e = byEl.get(k) ?? { ...r, scenes: new Set() }; e.scenes.add(r.scene); byEl.set(k, e); }
  lines.push(`\n== ${key}: ${list.length} offender rows, ${byEl.size} distinct controls ==`);
  for (const e of byEl.values()) lines.push(`  ${String(e.w).padStart(3)}x${String(e.h).padEnd(3)} box ${e.box.join('x').padEnd(7)} ${e.el}${e.stolen ? '  STOLEN by ' + e.stolen : e.neighbour && (e.w < MIN || e.h < MIN) ? '  (cut by ' + e.neighbour + ')' : ''}  [${[...e.scenes].slice(0, 4).join(',')}${e.scenes.size > 4 ? '+' + (e.scenes.size - 4) : ''}]`);
}
console.log(lines.join('\n'));
console.log('\nSUMMARY ' + Object.entries(report).map(([k, l]) => `${k}: ${new Set(l.map(r => r.el)).size} controls`).join(' | '));
if (process.env.JSON) writeFileSync(process.env.JSON, JSON.stringify(report, null, 1));
