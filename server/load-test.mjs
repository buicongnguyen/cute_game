/**
 * A rough load test: `node server/load-test.mjs [accounts=1000] [online=100] [seconds=20]`.
 * Starts the real game server on this computer (temporary data, file storage), registers the accounts, connects the
 * "online" ones over WebSocket and has each walk about 10 times a second and chat now and then. It reports how late the
 * server's own clock runs (event-loop lag), how evenly other players' movement reaches each player, and memory use.
 * It only measures the server and this computer: a real internet connection adds its own delay.
 */
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { monitorEventLoopDelay } from 'node:perf_hooks';
import { WebSocket } from 'ws';
import { createAccountStore } from './account-store.mjs';
import { createGameServer } from './server.mjs';
import * as Game from '../src/model.ts';
import { randomUUID } from 'node:crypto';

const accountsWanted = Number(process.argv[2] || 1000), online = Number(process.argv[3] || 100), seconds = Number(process.argv[4] || 20);
const dataDir = await mkdtemp(path.join(os.tmpdir(), 'zoo-load-'));
const store = await createAccountStore({ dataDir, databaseUrl: '' });
const server = await createGameServer({ host: '127.0.0.1', port: 0, dataDir, accountStore: store, databaseUrl: '', databaseRequired: false, maxPlayers: online + 20, trustProxy: true });
const lag = monitorEventLoopDelay({ resolution: 10 }); lag.enable();
const started = Date.now();

const post = async (route, body, ip) => {
  const response = await fetch(`${server.url}/api/${route}`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': ip }, body: JSON.stringify(body) });
  return { status: response.status, cookie: response.headers.get('set-cookie')?.split(';')[0] };
};
const cookies = [];
for (let i = 0; i < accountsWanted; i += 20) {
  await Promise.all(Array.from({ length: Math.min(20, accountsWanted - i) }, async (_, k) => {
    const n = i + k, r = await post('auth/register', { username: `load_${n}`, password: 'Load-test-password-123', name: `Load${n}` }, `10.${n >> 8 & 255}.${n & 255}.1`);
    if (r.status === 200) cookies[n] = r.cookie; else throw new Error(`register ${n} failed: ${r.status}`);
  }));
}
// A public world holds 24 players, so spread the online players over the planets the way a crowd would spread (or into parties).
const planets = Object.keys(Game.PLANETS);
for (let n = 0; n < online; n++) {
  const session = await (await fetch(`${server.url}/api/auth/session`, { headers: { Cookie: cookies[n] } })).json();
  await store.command({ actorId: session.account.id, requestId: randomUUID(), expectedRevision: session.revision, actionType: 'loadSetup', hash: 'b'.repeat(64), run: records => { records.get(session.account.id).profile.planet = planets[n % planets.length]; return true; } });
}
console.log(`${accountsWanted} accounts registered in ${((Date.now() - started) / 1000).toFixed(1)} s`);

const sockets = [], gaps = [], lastSeen = new Map(); let received = 0, refused = 0, joined = 0, bytes = 0;
await Promise.all(Array.from({ length: online }, (_, n) => new Promise(resolve => {
  const ws = new WebSocket(server.url.replace('http:', 'ws:') + '/socket', { headers: { Cookie: cookies[n] } });
  sockets.push(ws);
  ws.on('message', raw => {
    received++; bytes += raw.length;
    const message = JSON.parse(raw.toString());
    if (message.type === 'joined') { joined++; resolve(); }
    if (message.type === 'pose') { const now = Date.now(), last = lastSeen.get(ws); if (last) gaps.push(now - last); lastSeen.set(ws, now); }
  });
  ws.on('unexpected-response', () => { refused++; resolve(); });
  ws.on('error', () => resolve());
  setTimeout(resolve, 15000); // never wait for a player that cannot join
})));
console.log(`${joined} players connected (${refused} refused)`);

const timers = sockets.map((ws, n) => setInterval(() => {
  if (ws.readyState !== WebSocket.OPEN) return;
  const t = Date.now() / 1000 + n;
  ws.send(JSON.stringify({ type: 'pose', x: Math.cos(t) * 8, z: Math.sin(t) * 8, facing: t % 6, moving: true, sentAt: Date.now() }));
  if (Math.random() < 0.01) ws.send(JSON.stringify({ type: 'chat', requestId: `load-${n}-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`, text: 'hello from the load test' }));
}, 100));
await new Promise(resolve => setTimeout(resolve, seconds * 1000));
timers.forEach(clearInterval);

// Saving: every real game action is one account write. Time 300 of them (3 each from 100 players) on the full database.
const saveStart = Date.now(); let saves = 0;
await Promise.all(Array.from({ length: Math.min(online, 100) }, async (_, n) => {
  for (let k = 0; k < 3; k++) {
    const session = await (await fetch(`${server.url}/api/auth/session`, { headers: { Cookie: cookies[n] } })).json();
    await store.command({ actorId: session.account.id, requestId: randomUUID(), expectedRevision: session.revision, actionType: 'loadSave', hash: 'c'.repeat(64), run: records => { records.get(session.account.id).profile.energy += 1; return true; } }); saves++;
  }
}));
const saveSeconds = (Date.now() - saveStart) / 1000;
const sorted = gaps.sort((a, b) => a - b), pick = q => sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))] : NaN;
const mem = process.memoryUsage();
console.log(`\nResult for ${accountsWanted} accounts, ${joined} online, ${seconds} s:`);
console.log(`  messages received by players: ${received}  (${(bytes / 1048576).toFixed(1)} MB, ${(bytes / 1024 / seconds / Math.max(1, joined)).toFixed(1)} KB/s per player)`);
console.log(`  time between other players' pose updates seen by one player (ms): median ${pick(.5)}, 95th ${pick(.95)}, worst ${sorted.at(-1) ?? 'n/a'}  (${sorted.length} samples)`);
console.log(`  server event-loop lag (ms): mean ${(lag.mean / 1e6).toFixed(1)}, 99th ${(lag.percentile(99) / 1e6).toFixed(1)}, max ${(lag.max / 1e6).toFixed(1)}`);
console.log(`  saves: ${saves} account writes in ${saveSeconds.toFixed(1)} s (${(saves / saveSeconds).toFixed(0)} per second) while ${accountsWanted} accounts are stored`);
console.log(`  memory: ${(mem.rss / 1048576).toFixed(0)} MB resident`);
sockets.forEach(ws => ws.terminate()); await server.close(); await rm(dataDir, { recursive: true, force: true });
process.exit(0);
