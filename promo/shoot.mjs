import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { readFileSync, mkdirSync } from 'node:fs';
// Playwright: PLAYWRIGHT_MODULE (a playwright/index.mjs) or the project's own install.
const { chromium } = process.env.PLAYWRIGHT_MODULE ? await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href) : createRequire(import.meta.url)('playwright');
export const save = readFileSync(new URL(process.env.SAVE_FILE || './save.json', import.meta.url), 'utf8');
export async function open(opts = {}) {
  const browser = await chromium.launch({ args: ['--use-angle=default', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'] });
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1, ...opts });
  await ctx.addInitScript(([s, LANG]) => { try { localStorage.setItem('cute-game-save-v1', s); localStorage.setItem('cute-game-slot', '0'); localStorage.setItem('cute-game-language', LANG); } catch {} }, [save, process.env.LANG_CODE || 'en']);
  const page = await ctx.newPage();
  await page.goto('http://localhost:5233/');
  await page.waitForSelector('[data-action="start"]');
  return { browser, ctx, page };
}
