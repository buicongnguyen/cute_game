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

// The server enforces "who plants a bed" (auto-plant.ts): it runs the same actions as offline play, at home only.
async function fixture(t, edit = () => {}) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'zoo-auto-plant-')), store = await createAccountStore({ dataDir: dir });
  t.after(async () => { await store.close(); await rm(dir, { recursive: true, force: true }); });
  const profile = M.newGame('Alice'); profile.level = 10; profile.energy = 400;
  profile.helper = { owned: true, paused: false, seed: 'same', last: {} };
  profile.friends = [{ id: 'sprout', role: 'garden', rescuedAt: 1, gear: {}, home: true }];
  edit(profile);
  await store.create({ id: 'alice', username: 'alice', hash: 'test-hash', salt: 'test-salt', friends: [], requests: [], profile });
  const peer = { active: true, planet: profile.planet, room: 'public:home', visit: null, pose: { x: 0, z: 0 } };
  const execute = createActionService({ store, getPeer: () => peer, getWorld: () => null });
  const command = async (type, payload = {}) => execute('alice', { rulesVersion: ACTION_RULES_VERSION, requestId: randomUUID(), expectedRevision: (await store.get('alice')).profileRevision || 0, type, payload });
  const profileNow = async () => (await store.get('alice')).profile;
  return { store, peer, command, profile: profileNow };
}
const ripe = (s, i, crop) => { const p = s.plots[i]; p.crop = crop; p.growDuration = M.CROPS[crop].duration; p.plantedAt = Date.now() - p.growDuration - 1000 - 300000; };

test('with auto-planting off the server lets no helper plant; harvests and the player\'s own planting go through', async t => {
  const f = await fixture(t, s => { ripe(s, 0, 'melon'); ripe(s, 1, 'carrot'); ripe(s, 2, 'carrot'); });
  assert.equal((await f.command('setAutoPlant', { on: false })).result, true);
  assert.equal((await f.profile()).helper.manual, true, 'the switch is saved on the account');
  await assert.rejects(f.command('helperPlant', { index: 4 }), /not available/);
  assert.equal((await f.command('friendWork', { id: 'sprout', kind: 'plant', index: 4 })).result.skipped, true);
  assert.equal((await f.command('helperHarvest', { index: 0 })).result, 'melon');
  assert.deepEqual((await f.command('friendWork', { id: 'sprout', kind: 'harvest', index: 1 })).result.raw, { carrot: 1 });
  // Either catch-up harvests what ripened and plants nothing.
  assert.deepEqual((await f.command('helperCatchUp')).result, { harvested: ['carrot'], planted: [] });
  assert.equal((await f.command('friendsCatchUp')).result.sprout.jobs, 0);
  assert.ok((await f.profile()).plots.every(p => !p.crop), 'every bed is empty and stays empty');
  // The player plants a fruit tree; the server remembers it as that bed's own crop.
  assert.equal((await f.command('plant', { index: 4, id: 'apple' })).result, true);
  const bed = (await f.profile()).plots[4]; assert.equal(bed.crop, 'apple'); assert.equal(bed.choice, 'apple');
  await assert.rejects(f.command('setAutoPlant', { on: 'yes' }), /not available/);
});

test('a switched-off robot means no automatic planting by Sprout either, on the server too', async t => {
  const f = await fixture(t);
  assert.equal((await f.command('setHelperPaused', { paused: true })).result, true);
  assert.equal((await f.command('friendWork', { id: 'sprout', kind: 'plant', index: 0 })).result.skipped, true);
  await assert.rejects(f.command('helperPlant', { index: 0 }), /not available/);
  assert.equal((await f.command('friendsCatchUp')).result.sprout.jobs, 0);
  assert.ok((await f.profile()).plots.every(p => !p.crop));
  assert.equal((await f.command('plantAll', { id: 'grape' })).result, 9);
  // Bolt back at work: Sprout plants again, and only what the beds ask for.
  assert.equal((await f.command('setHelperPaused', { paused: false })).result, true);
  assert.ok((await f.profile()).plots.every(p => p.crop === 'grape' && p.choice === 'grape'));
});

test('the server replants a hand-planted bed with the player\'s crop, whatever Bolt was told', async t => {
  const f = await fixture(t, s => { s.helper.seed = 'carrot'; s.plots[0].choice = 'apple'; });
  assert.equal((await f.command('helperPlant', { index: 0 })).result, 'apple');
  assert.equal((await f.command('helperPlant', { index: 1 })).result, 'carrot');
  assert.equal((await f.command('friendWork', { id: 'sprout', kind: 'plant', index: 2 })).result.kind, 'plant');
  let plots = (await f.profile()).plots; assert.deepEqual(plots.slice(0, 3).map(p => p.crop), ['apple', 'carrot', 'carrot']);
  assert.equal(plots[1].choice, undefined);
  // Handing the beds back to Bolt is an action of its own.
  assert.equal((await f.command('clearBedChoices')).result, 1);
  plots = (await f.profile()).plots; assert.equal(plots[0].choice, undefined);
});

test('the switch belongs to the home garden: not from another planet, not while visiting', async t => {
  const away = await fixture(t, s => { s.planet = 'ice'; });
  await assert.rejects(away.command('setAutoPlant', { on: false }), /garden/);
  const home = await fixture(t); home.peer.visit = 'bob';
  await assert.rejects(home.command('setAutoPlant', { on: false }), /garden/);
  await assert.rejects(home.command('clearBedChoices'), /garden/);
  assert.equal((await home.profile()).helper.manual, undefined);
});
