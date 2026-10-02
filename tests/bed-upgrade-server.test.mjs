import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { createGameServer } from '../server/server.mjs';

// The server runs upgradeBed through the shared rules (actions.ts) behind the farm gate: no energy, no upgrade,
// and a forged index is refused before anything is saved.
test('the server validates bed upgrades: energy, index and the saved level', async () => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), 'zoo-garden-bed-upgrade-'));
  const game = await createGameServer({ port: 0, dataDir, databaseUrl: '', databaseRequired: false });
  try {
    const registered = await fetch(game.url + '/api/auth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'bed_upgrade', password: 'password-bed' }) });
    const cookie = registered.headers.get('set-cookie').split(';')[0], session = await registered.json();
    const call = async (type, payload, expectedRevision) => { const response = await fetch(game.url + '/api/actions', { method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ type, payload, rulesVersion: 1, expectedRevision, requestId: randomUUID() }) }); return { status: response.status, data: await response.json() }; };
    assert.equal(session.profile.energy, 0);
    assert.equal((await call('upgradeBed', { index: 0 }, session.revision)).status, 409, 'not enough energy');
    assert.equal((await call('upgradeBed', { index: -3 }, session.revision)).status, 400, 'a forged index');
    assert.equal((await call('upgradeBed', { index: 99 }, session.revision)).status, 409, 'no such bed');
    const final = await (await fetch(game.url + '/api/auth/session', { headers: { Cookie: cookie } })).json();
    assert.equal(final.profile.plots[0].level, undefined); assert.equal(final.revision, session.revision);
  } finally { await game.close(); await rm(dataDir, { recursive: true, force: true }); }
});
