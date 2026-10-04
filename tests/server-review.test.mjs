// Server review fixes: the pose movement budget (no teleports past the proximity rules), the proxy-aware sign-in rate
// limit, and receipts that no longer grow forever.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import * as M from '../src/model.ts';
import { poseStep, poseFix, arrived, TOP_SPEED, BURST, ARRIVAL, FIX_MS } from '../server/pose-budget.mjs';
import { clientAddress } from '../server/client-address.mjs';
import { createAccountStore, RECEIPT_WINDOW } from '../server/account-store.mjs';
import { commandHash } from '../server/action-service.mjs';

const peer = () => ({ planet: 'home', visit: null, pose: { x: 0, z: -8 }, poseAt: 0 });
/** Sends a pose like server.mjs does: accepted poses move the peer. */
function send(p, x, z, now) { const ok = poseStep(p, { x, z }, Math.hypot(x - p.pose.x, z - p.pose.z), now); if (ok) { p.pose = { x, z }; p.poseAt = now; } return ok; }

test('a pause no longer buys a teleport: after 5 s one pose may move a short burst, not across the map', () => {
  const p = peer(); assert.equal(send(p, 0, -8, 1000), true);
  assert.equal(send(p, 140, 40, 6100), false, 'the 145 m jump of the review probe is dropped');
  assert.equal(send(p, 0, -8 + BURST - 1, 6200), true, 'a short burst (stepping into the cottage) still works');
});

test('the village-centre snap is the Home button only: no chain of snaps and small jumps outruns the top speed', () => {
  const p = peer(); send(p, 60, 0, 1000); send(p, 60, 0, 1100);
  assert.equal(send(p, 1, 0, 1200), true, 'Home: back to the centre at once');
  assert.equal(send(p, 0, -8, 1280), true, 'then walking on from there');
  send(p, 60, 0, 1400); assert.notDeepEqual(p.pose, { x: 60, z: 0 }, 'cannot jump back out');
  p.pose = { x: 60, z: 0 }; p.poseAt = 1400; p.poseBudget = 0; // walked far out meanwhile
  assert.equal(send(p, 1, 0, 1500), false, 'a second snap within 5 s is dropped');
  assert.equal(send(p, 1, 0, 6300), true, 'the Home button again later');
  // A stream of small jumps: at most the top speed plus one burst, however the client splits it.
  const q = peer(); send(q, 0, 0, 1000); let t = 1000;
  for (let i = 0; i < 40; i++) { t += 65; send(q, q.pose.x + 11, 0, t); }
  assert.ok(q.pose.x <= TOP_SPEED * (t - 1000) / 1000 + BURST + 1, `moved ${q.pose.x.toFixed(1)} m in ${t - 1000} ms`);
  const away = { ...peer(), planet: 'toy' }; send(away, 50, 0, 1000); assert.equal(send(away, 1, 0, 1100), false, 'no snap on other planets');
});

test('a join or respawn allows the landing spot for a few seconds, then the normal burst again', () => {
  const p = peer(); send(p, 0, 0, 1000); arrived(p, 2000);
  assert.equal(send(p, 0, ARRIVAL - 2, 2100), true, 'landing spot near the server spawn');
  assert.equal(send(p, 0, ARRIVAL - 2 + BURST + 5, 20_000), false, 'later the burst is back to normal');
});

test('a dropped pose heals: the server sends its spot back (poseFix), the client goes there, and its poses are accepted again', async () => {
  // The re-review case: walk out of the centre, press Home twice within 5 s (the second snap is dropped), then walk on.
  const p = peer(); send(p, 0, 0, 1000);
  for (let t = 1100; t <= 1600; t += 100) send(p, p.pose.x + 5, 0, t); // 30 m out
  assert.equal(send(p, 1, 0, 1700), true, 'Home: the first snap');
  for (let t = 1800; t <= 2900; t += 100) send(p, p.pose.x + 4, 0, t); // about 49 m out again
  assert.ok(p.pose.x > BURST + 5, `walked to ${p.pose.x}`);
  assert.equal(send(p, 1, 0, 3000), false, 'the second Home snap within 5 s is dropped');
  let client = { x: 1, z: 0 }, fixes = 0;
  // A client that honours poseFix: without it every later pose would stay dropped, since the budget never covers the gap.
  for (let t = 3100; t <= 4500; t += 100) {
    client = { x: client.x, z: client.z - 1 };
    if (!send(p, client.x, client.z, t)) { const fix = poseFix(p, t); if (fix) { fixes++; assert.deepEqual([fix.type, fix.planet, fix.visit], ['poseFix', 'home', null]); client = { x: fix.x, z: fix.z }; } }
  }
  assert.equal(fixes, 1, 'one correction is enough');
  assert.deepEqual(p.pose, client, 'server and client agree again, so requireNear rules work on the spot the player sees');
  // Without the correction (an old client) poses keep being dropped: the fix is what heals it.
  const q = peer(); send(q, 0, 0, 1000); q.pose = { x: 60, z: 0 }; q.poseAt = 1000;
  let accepted = 0; for (let t = 1100; t < 30_000; t += 100) if (send(q, 30, -(t - 1100) / 100, t)) accepted++; // walking away, 30 m from the server's spot
  assert.equal(accepted, 0, 'the stuck case the fix exists for');
});

test('poseFix goes out at most once per FIX_MS, and the server and client wire it up', async () => {
  const p = { ...peer(), pose: { x: 7, z: 3 } };
  assert.deepEqual(poseFix(p, 1000), { type: 'poseFix', planet: 'home', visit: null, x: 7, z: 3 });
  assert.equal(poseFix(p, 1000 + FIX_MS - 1), null);
  assert.ok(poseFix(p, 1000 + FIX_MS));
  const server = await readFile(new URL('../server/server.mjs', import.meta.url), 'utf8'), online = await readFile(new URL('../src/online.ts', import.meta.url), 'utf8');
  assert.match(server, /if \(!move\) \{ const fix = poseFix\(peer, now\); if \(fix\) send\(socket, fix\)/);
  assert.match(online, /message\.type==='poseFix'.*message\.planet===w\.planet&&\(message\.visit\?\?null\)===visiting.*w\.position\.set\(message\.x,w\.position\.y,message\.z\)/);
});

test('sign-in rate limits key on the client behind a trusted proxy, and never trust the header otherwise', () => {
  const request = { socket: { remoteAddress: '10.0.0.7' }, headers: { 'x-forwarded-for': '6.6.6.6, 203.0.113.9' } };
  assert.equal(clientAddress(request, false), '10.0.0.7', 'no proxy configured: the header could be made up');
  assert.equal(clientAddress(request, true), '203.0.113.9', 'the entry the trusted proxy appended');
  assert.equal(clientAddress({ socket: { remoteAddress: '10.0.0.7' }, headers: {} }, true), '10.0.0.7');
  assert.equal(clientAddress({ ...request, headers: { ...request.headers, 'cf-connecting-ip': '198.51.100.4' } }, true), '203.0.113.9', 'CF-Connecting-IP could be made up where no Cloudflare sits in front (Render, ngrok)');
  assert.equal(clientAddress({ socket: {}, headers: { 'x-forwarded-for': 'x'.repeat(500) } }, true).length, 64, 'a long header is not a long key');
});

async function storeFixture(t, kind) {
  let store, cleanup;
  if (kind === 'file') { const dir = await mkdtemp(path.join(os.tmpdir(), 'zoo-receipts-')); store = await createAccountStore({ dataDir: dir }); cleanup = async () => { await store.close(); await rm(dir, { recursive: true, force: true }); }; store.file = path.join(dir, 'accounts.json'); }
  else { const db = await PGlite.create(); const pool = { async connect() { return { query: (s, p) => db.query(s, p), release() {} }; }, query: (s, p) => db.query(s, p), async end() {} }; store = await createAccountStore({ pool }); store.db = db; cleanup = async () => { await store.close(); await db.close(); }; }
  t.after(cleanup);
  await store.create({ id: 'alice', username: 'alice', hash: 'h', salt: 's', friends: [], requests: [], profile: M.newGame('Alice') });
  const command = async (extra = {}) => { const rev = (await store.get('alice')).profileRevision || 0, requestId = randomUUID(); return store.command({ actorId: 'alice', requestId, hash: commandHash({ type: 'settings', requestId }), expectedRevision: rev, actionType: 'settings', run: records => { records.get('alice').profile.settings.sound = !records.get('alice').profile.settings.sound; return true; }, ...extra }); };
  return { store, command };
}
for (const kind of ['file', 'postgres']) test(`${kind} store: receipts keep only the last ${RECEIPT_WINDOW} revisions, and health batches stay out of the outbox`, async t => {
  const f = await storeFixture(t, kind), total = RECEIPT_WINDOW + 40;
  for (let i = 0; i < total; i++) await f.command(i === total - 1 ? { outbox: false, actionType: 'health' } : {});
  const count = kind === 'file' ? JSON.parse(await readFile(f.store.file, 'utf8')).receipts.length : (await f.store.db.query('SELECT count(*)::int AS n FROM zoo_action_receipts')).rows[0].n;
  assert.ok(count <= RECEIPT_WINDOW + 1 && count >= RECEIPT_WINDOW - 1, `${count} receipts kept`);
  const account = await f.store.get('alice');
  assert.equal(account.outbox.length, 256); assert.notEqual(account.outbox.at(-1).type, 'health', 'the health batch is not an event');
});
