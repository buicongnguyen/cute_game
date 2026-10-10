/**
 * Runs the game for anyone on the internet from this computer: `npm run share`.
 *
 * It builds the game if needed, backs up the accounts file, starts the game server on this machine only (127.0.0.1) and
 * opens a tunnel so a public https address reaches it. The tunnel is the only way in: no router ports are opened.
 * Tunnel: cloudflared (free, no account for a random address) if installed, otherwise ngrok.
 *   winget install Cloudflare.cloudflared      # or: winget install ngrok.ngrok  (then: ngrok config add-authtoken ...)
 */
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, copyFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { needsShareBuild, shareBuildEnv } from './share-build.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.env.PORT || 8787), dataDir = process.env.DATA_DIR || path.join(root, 'data');
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const have = command => spawnSync(process.platform === 'win32' ? 'where' : 'which', [command], { stdio: 'ignore' }).status === 0;

// A newer Pages build can still be the wrong edition; check its emitted mode as well as its age.
if (needsShareBuild(root, process.argv.includes('--build'))) {
  console.log('Building the latest game first (about 15 seconds)…');
  if (spawnSync(npm, ['run', 'build'], { cwd: root, env: shareBuildEnv(), stdio: 'inherit', shell: process.platform === 'win32' }).status !== 0) { console.error('The build failed.'); process.exit(1); }
}
// A dated daily copy of the accounts file before the server starts.
const accounts = path.join(dataDir, 'accounts.json');
if (existsSync(accounts)) {
  const backups = path.join(dataDir, 'backups'); mkdirSync(backups, { recursive: true });
  copyFileSync(accounts, path.join(backups, `accounts-${new Date().toISOString().slice(0, 10)}.json`));
}
process.env.HOST = '127.0.0.1'; process.env.PORT = String(port); process.env.COOKIE_SECURE = '1'; process.env.TRUST_PROXY = '1'; process.env.DATA_DIR = dataDir;
const { createGameServer } = await import('./server.mjs');
const game = await createGameServer();
console.log(`Game server ready on this computer at ${game.url} (not reachable from outside yet).`);

let tunnel;
if (have('cloudflared')) {
  tunnel = spawn('cloudflared', ['tunnel', '--url', `http://127.0.0.1:${port}`, '--no-autoupdate'], { stdio: ['ignore', 'pipe', 'pipe'] });
  const watch = chunk => { const match = String(chunk).match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/); if (match) announce(match[0]); };
  tunnel.stdout.on('data', watch); tunnel.stderr.on('data', watch);
} else if (have('ngrok')) {
  // A free ngrok account includes one fixed address (dashboard -> Domains). Put it in NGROK_DOMAIN (for example my-name.ngrok-free.app) and the
  // address never changes, so the github.io build, which has it baked in as ONLINE_URL, always finds this PC.
  const fixed = String(process.env.NGROK_DOMAIN || '').replace(/^https?:\/\//, '').replace(/\/+$/, '');
  tunnel = spawn('ngrok', ['http', String(port), '--log=stdout', ...(fixed ? [`--domain=${fixed}`] : [])], { stdio: ['ignore', 'pipe', 'pipe'] });
  const poll = setInterval(async () => {
    try { const list = await (await fetch('http://127.0.0.1:4040/api/tunnels')).json(); const url = list.tunnels?.find(t => t.public_url?.startsWith('https'))?.public_url; if (url) { clearInterval(poll); announce(url); } } catch { /* ngrok is still starting */ }
  }, 1500);
} else {
  console.log('\nNo tunnel program found. Install one, then run this again:\n  winget install Cloudflare.cloudflared\n');
}
let shown = false;
function announce(url) {
  if (shown) return; shown = true;
  console.log(`\n=========================================\n  Share this address with players:\n  ${url}\n=========================================\nKeep this window open while people play. Press Ctrl+C to stop.\nTip: set the GitHub variable ONLINE_URL to this address to add a "Play online" link to the public page (it changes each run with a free quick tunnel).\n`);
}
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, async () => { tunnel?.kill(); await game.close(); process.exit(0); });
