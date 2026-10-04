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
import { poseStep, arrived, TOP_SPEED, BURST, ARRIVAL } from '../server/pose-budget.mjs';
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

test('sign-in rate limits key on the client behind a trusted proxy, and never trust the header otherwise', () => {
  const request = { socket: { remoteAddress: '10.0.0.7' }, headers: { 'x-forwarded-for': '6.6.6.6, 203.0.113.9' } };
  assert.equal(clientAddress(request, false), '10.0.0.7', 'no proxy configured: the header could be made up');
  assert.equal(clientAddress(request, true), '203.0.113.9', 'the entry the trusted proxy appended');
  assert.equal(clientAddress({ socket: { remoteAddress: '10.0.0.7' }, headers: {} }, true), '10.0.0.7');
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
