// Screenshots of the 🏆 leaderboard: solo (neighbourhood) board and a server board built by server/ranking.mjs.
// Dev server: npx vite --port 5254 --strictPort. Run: node --experimental-strip-types promo/ranking-shots.mjs [outDir]
import { createRequire } from 'node:module';
import { readFileSync, mkdirSync } from 'node:fs';
import * as M from '../src/model.ts';
import { createRanking } from '../server/ranking.mjs';
import { weekKey } from '../src/ranking-logic.ts';
const require = createRequire('C:/Users/n/source/repos/3D_claudeopus55/package.json');
const { chromium } = require('playwright');
const save = readFileSync(new URL('./save.json', import.meta.url), 'utf8');
const out = process.argv[2] || 'shots'; mkdirSync(out, { recursive: true });
const URL_ = process.env.GAME_URL || 'http://localhost:5254/';

// A server board from real ranking code: 60 explorers with varied counters.
const now = Date.now(), week = weekKey(now), names = ['Kim', 'Lan', 'Huy', 'Thao', 'Bao', 'Vy', 'Long', 'Nhi', 'Tuan', 'Mai', 'An', 'Phuc'];
const accounts = Array.from({ length: 60 }, (_, i) => { const p = M.newGame(`${names[i % names.length]}${i >= names.length ? i : ''}`, M.COLORS[i % M.COLORS.length]); p.level = 3 + (i * 37) % 48; p.counters.kills = (i * 53) % 900; p.counters.harvests = (i * 29) % 400; p.fishRecords = { fish_perch: 20 + (i * 13) % 90 };
  return { id: `u${i}`, username: `u${i}`, profile: p, ranking: { week, exp: (i * 7919) % 26000, harvest: (i * 31) % 140, fish: (i * 17) % 60, kills: (i * 41) % 300, boss: i % 7 } }; });
const ranking = createRanking({ source: () => accounts });

async function shoot(viewport, name, mode, lang = 'en') {
  const browser = await chromium.launch({ args: ['--use-angle=default', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'] });
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1, hasTouch: viewport.width < 600, isMobile: viewport.width < 600 });
  await ctx.addInitScript(([s, lang]) => { try { localStorage.setItem('cute-game-save-v1', s); localStorage.setItem('cute-game-slot', '0'); localStorage.setItem('cute-game-language', lang); } catch {} }, [save, lang]);
  await ctx.route('**/api/**', route => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/api/ranking')) {
      if (mode === 'error') return route.fulfill({ status: 503, body: '{}' });
      const reply = ranking.query({ board: url.searchParams.get('board'), cat: url.searchParams.get('cat'), meId: mode === 'server' ? 'u17' : null });
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(reply) });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ account: null }) });
  });
  const page = await ctx.newPage();
  await page.goto(URL_);
  await page.waitForSelector('[data-action="start"]');
  await page.click('[data-action="start"]');
  await page.waitForTimeout(2500);
  await page.click('#hud [data-action="ranking"]');
  await page.waitForSelector('#ranking-dialog .ranking-row, #ranking-dialog .ranking-empty');
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${out}/${name}.png` });
  if (mode !== 'error') {
    await page.click('#ranking-dialog .ranking-tabs button:nth-child(2)');
    await page.click('#ranking-dialog .ranking-cats button:nth-child(2)');
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${out}/${name}-alltime-big.png` });
  }
  await browser.close();
}
await shoot({ width: 1400, height: 800 }, 'ranking-server-1400', 'server');
await shoot({ width: 390, height: 844 }, 'ranking-server-390', 'server');
await shoot({ width: 1400, height: 800 }, 'ranking-solo-1400', 'solo');
await shoot({ width: 390, height: 844 }, 'ranking-solo-390-vi', 'solo', 'vi');
await shoot({ width: 390, height: 844 }, 'ranking-error-390', 'error');
console.log('done');
