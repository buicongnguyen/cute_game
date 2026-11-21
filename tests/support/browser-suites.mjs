// `npm run test:browser`: the eight browser suites (docs/QUALITY-PLAN.md section 2), a merge gate of the AAA round.
// It starts its own dev server (the suites need the __zoo hook) on a private port with a private dependency cache, so no
// other server on the machine is disturbed, runs the suites against it and stops it. Nothing here names a machine path:
//
//   PLAYWRIGHT_MODULE=<a playwright install>/index.mjs npm run test:browser     (without it, "playwright" is imported)
//   BROWSER_PORT=5391          the private port (strict: the run stops if it is taken)
//   HUD_LAYOUT_URL=<url>       use a dev server that is already running instead of starting one
//   BROWSER_JOBS=2             test files run side by side (Node's default otherwise); lower it on a busy machine
//   npm run test:browser -- tests/hud-layout.test.mjs                            (only the files named)
// Do not edit src/ while it runs. A timeout that passes when its file runs alone is machine load, not a regression.
import { spawn } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const BROWSER_SUITES = ['art-retry-browser', 'device-qa', 'dialog-dock', 'hud-layout', 'item-layout', 'mobile-menu-layout', 'quick-eat-browser', 'rescue-view-browser'].map(name => `tests/${name}.test.mjs`);

const root = fileURLToPath(new URL('../..', import.meta.url));
async function main() {
  const named = process.argv.slice(2).filter(arg => !arg.startsWith('-')), files = named.length ? named : BROWSER_SUITES;
  let server = null, url = process.env.HUD_LAYOUT_URL;
  if (!url) {
    const port = Number(process.env.BROWSER_PORT) || 5391, { createServer } = await import('vite');
    // The repo's config with a cache of its own. node_modules may be a link into another checkout (a git worktree): its real
    // folder is allowed, or the fonts fall back and every measured width changes. .scratch holds logs and screenshots.
    server = await createServer({ root, cacheDir: '.scratch/vite-cache-browser', server: { host: '127.0.0.1', port, strictPort: true, hmr: false, watch: { ignored: ['**/.scratch/**'] }, fs: { allow: [root, realpathSync(new URL('../../node_modules', import.meta.url))] } } });
    try { await server.listen(); } catch (error) {
      await server.close().catch(() => {});
      console.error(/EADDRINUSE|already in use/i.test(String(error?.message ?? error)) ? `browser suites: port ${port} is taken. Set BROWSER_PORT to a free port, or HUD_LAYOUT_URL to the dev server that is already running.` : `browser suites: the dev server did not start: ${error?.message ?? error}`);
      process.exit(2);
    }
    url = `http://127.0.0.1:${port}/`;
    console.log(`browser suites: dev server on ${url}`);
  }
  const jobs = process.env.BROWSER_JOBS ? [`--test-concurrency=${Number(process.env.BROWSER_JOBS) || 1}`] : [];
  let code = 1;
  try { code = await new Promise(done => spawn(process.execPath, ['--test', ...jobs, ...files], { cwd: root, stdio: 'inherit', env: { ...process.env, HUD_LAYOUT_URL: url } }).on('exit', (exit, signal) => done(exit ?? (signal ? 1 : 0))).on('error', () => done(1))); }
  finally { await server?.close().catch(() => {}); } // the server stops whatever happened to the run
  process.exit(code);
}
if (process.argv[1] && fileURLToPath(import.meta.url) === realpathSync(process.argv[1])) await main();
