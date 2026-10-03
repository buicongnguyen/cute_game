import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import * as M from '../src/model.ts';
import { ACTION_RULES_VERSION } from '../src/actions.ts';
import { createAccountStore } from '../server/account-store.mjs';
import { createActionService } from '../server/action-service.mjs';

// The server runs the friend look rules (friend-looks.ts) at home only, like giving a friend gear.
async function fixture(t, edit = () => {}) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'zoo-friend-looks-')), store = await createAccountStore({ dataDir: dir });
  t.after(async () => { await store.close(); await rm(dir, { recursive: true, force: true }); });
  const profile = M.newGame('Alice'); profile.energy = 400;
  profile.friends = [{ id: 'sprout', role: 'garden', rescuedAt: 1, gear: {}, home: true }];
  edit(profile);
  await store.create({ id: 'alice', username: 'alice', hash: 'test-hash', salt: 'test-salt', friends: [], requests: [], profile });
  const peer = { active: true, planet: profile.planet, room: 'public:home', visit: null, pose: { x: 0, z: 0 } };
  const execute = createActionService({ store, getPeer: () => peer, getWorld: () => null });
  const command = async (type, payload = {}) => execute('alice', { rulesVersion: ACTION_RULES_VERSION, requestId: randomUUID(), expectedRevision: (await store.get('alice')).profileRevision || 0, type, payload });
  return { store, peer, command };
}

test('a friend\'s look is validated and saved by the server: owned options free, the rest bought for the player', async t => {
  const f = await fixture(t);
  await assert.rejects(f.command('friendLook', { friend: 'sprout', id: 'girl-tall-none-fox' }), /not available/, 'unowned options need buy');
  await assert.rejects(f.command('friendLook', { friend: 'sprout', id: 'robot-chibi-none-bare' }), /not available/, 'unknown look');
  await assert.rejects(f.command('friendLook', { friend: 'clover', id: 'girl-chibi-none-bare' }), /not available/, 'not rescued');
  const ok = await f.command('friendLook', { friend: 'sprout', id: 'girl-tall-none-fox', buy: true }); assert.equal(ok.result, true);
  const profile = (await f.store.get('alice')).profile;
  assert.equal(profile.friends[0].look, 'girl-tall-none-fox'); assert.equal(profile.energy, 400 - 120 - 120);
  assert.deepEqual([...profile.looks.owned].sort(), ['fox', 'tall']); assert.equal(profile.looks.style, 'boy-chibi-none-bare', 'the explorer keeps their look');
});

test('friend looks only change at home, never while visiting', async t => {
  const away = await fixture(t, s => { s.planet = 'ice'; });
  await assert.rejects(away.command('friendLook', { friend: 'sprout', id: 'girl-chibi-none-bare' }), /garden/);
  const home = await fixture(t); home.peer.visit = 'bob';
  await assert.rejects(home.command('friendLook', { friend: 'sprout', id: 'girl-chibi-none-bare' }), /garden/);
  assert.equal((await home.store.get('alice')).profile.friends[0].look, undefined);
});
