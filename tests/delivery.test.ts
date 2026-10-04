import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import * as M from '../src/model.ts';
import * as H from '../src/helper.ts';
import * as F from '../src/friends.ts';
import { applyGameAction, ACTION_RULES_VERSION } from '../src/actions.ts';
import { HOME_SAFE_R, explorerAway, storeGains, storedLine } from '../src/delivery.ts';
import { VI_FRIENDS as vi } from '../src/locales/vi-friends.ts';
import { createAccountStore } from '../server/account-store.mjs';
import { createActionService } from '../server/action-service.mjs';

const T0 = 1_000_000;
const act = (s: M.SaveState, type: string, payload: Record<string, unknown> = {}) => applyGameAction(s, { type, payload }, { now: T0, random: () => .5 });
function garden() { const s = M.newGame(); s.level = 30; s.energy = 5000; assert.equal(H.buyHelper(s), 'bought'); s.plots[0].crop = 'carrot'; s.plots[0].plantedAt = T0 - M.CROPS.carrot.duration - 1 - 300000; return s; }

test('the explorer is out past the safe circle at home, or anywhere on another planet', () => {
  assert.equal(explorerAway('home', 0, 0), false); assert.equal(explorerAway('home', HOME_SAFE_R - .1, 0), false);
  assert.equal(explorerAway('home', HOME_SAFE_R, 0), true); assert.equal(explorerAway('ice', 0, 0), true); assert.equal(explorerAway('home', NaN, 0), true);
});

test('the robot harvest goes to the bag at home and to the chest from the wilds; XP and harvest credit are the same', () => {
  const near = garden(), far = garden();
  assert.equal(act(near, 'helperHarvest', { index: 0, away: false }), 'carrot');
  assert.equal(act(far, 'helperHarvest', { index: 0, away: true }), 'carrot');
  assert.equal(near.bag.carrot, 1); assert.equal(near.chest.carrot, undefined); assert.equal(near.awayStore, undefined);
  assert.equal(far.bag.carrot, undefined); assert.equal(far.chest.carrot, 1); assert.deepEqual(far.awayStore, { carrot: 1 });
  assert.equal(far.xp, near.xp); assert.equal(far.level, near.level); assert.equal(far.counters.harvests, near.counters.harvests);
  // A junk `away` value is not "away"; planting is never redirected.
  const junk = garden(); act(junk, 'helperHarvest', { index: 0, away: 'yes' }); assert.equal(junk.bag.carrot, 1);
});

test('catch-up work for time away (the save idle over a minute) is stored in the chest, and survives a reload with its note', () => {
  const s = garden(); s.savedAt = T0 - 120_000; const r = act(s, 'helperCatchUp') as { harvested: string[] };
  assert.deepEqual(r.harvested, ['carrot']); assert.equal(s.bag.carrot, undefined); assert.equal(s.chest.carrot, 1);
  const back = M.parseSave(JSON.stringify(s))!; assert.deepEqual(back.awayStore, { carrot: 1 });
  assert.deepEqual(act(back, 'ackStored'), { carrot: 1 }); assert.equal(back.awayStore, undefined); assert.equal(back.chest.carrot, 1);
});

test('the cook keeps her pot in the bag; what she cooks and the raw half go to the chest', () => {
  const s = M.newGame(); s.level = 30; s.planet = 'toy'; M.grantDefeat(s, 'robot', 1, true, () => .5, false);
  assert.equal(F.rescue(s, 'pepper', T0), true); s.planet = 'home'; F.arriveHome(s, { x: 0, z: 5 });
  for (const i of [0, 1, 2, 3]) { s.plots[i].crop = 'carrot'; s.plots[i].plantedAt = T0 - M.CROPS.carrot.duration - 1 - 300000; }
  for (const i of [0, 1, 2, 3]) act(s, 'friendWork', { id: 'pepper', kind: 'harvest', index: i, away: true });
  assert.equal((s.bag.carrot ?? 0) + (s.bag.cooked_carrot ?? 0), 0, 'nothing reaches the bag');
  assert.equal((s.chest.carrot ?? 0) + (s.chest.cooked_carrot ?? 0) * 1, 4);
});

test('a stack that cannot grow in the chest stays in the bag instead of being lost', () => {
  const s = garden(); s.chest.carrot = Number.MAX_SAFE_INTEGER; s.bag.carrot = 1;
  const { stored, kept } = storeGains(s, {}); assert.deepEqual(stored, {}); assert.deepEqual(kept, { carrot: 1 }); assert.equal(s.bag.carrot, 1);
});

test('the summary lists the largest stacks first and its words have Vietnamese', () => {
  const line = storedLine({ egg: 3, carrot: 12, milk: 1, corn: 2, wool: 1 }, id => id, 3);
  assert.equal(line.text, '12 carrot, 3 egg, 2 corn'); assert.equal(line.more, 2); assert.equal(line.total, 19);
  for (const k of ['While you were out, your helpers stored:', 'and {count} more', 'Tap to open the chest']) assert.ok(vi[k], k);
});

test('online, the server decides from its own pose of the explorer, not the client flag', async t => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'zoo-delivery-')), store = await createAccountStore({ dataDir: dir });
  t.after(async () => { await store.close(); await rm(dir, { recursive: true, force: true }); });
  const profile = garden(); profile.plots[1].crop = 'carrot'; profile.plots[1].plantedAt = Date.now() - M.CROPS.carrot.duration - 1000 - 300000;
  profile.plots[0].plantedAt = Date.now() - M.CROPS.carrot.duration - 1000 - 300000;
  await store.create({ id: 'alice', username: 'alice', hash: 'h', salt: 's', friends: [], requests: [], profile });
  let peer = { active: true, planet: 'home', room: 'public:home', visit: null, pose: { x: 40, z: 0 } };
  const execute = createActionService({ store, getPeer: () => peer });
  const command = async (type: string, payload = {}) => execute('alice', { rulesVersion: ACTION_RULES_VERSION, requestId: randomUUID(), expectedRevision: (await store.get('alice')).profileRevision || 0, type, payload });
  const out = await command('helperHarvest', { index: 0, away: false });
  assert.equal(out.profile.chest.carrot, 1); assert.equal(out.profile.bag.carrot, undefined);
  peer = { ...peer, pose: { x: 2, z: 3 } };
  const home = await command('helperHarvest', { index: 1, away: true });
  assert.equal(home.profile.bag.carrot, 1); assert.equal(home.profile.chest.carrot, 1);
  // The client-side rules agree with the server for the same pose.
  const local = garden(); act(local, 'helperHarvest', { index: 0, away: explorerAway('home', 40, 0) }); assert.equal(local.chest.carrot, 1);
  const ack = await command('ackStored'); assert.deepEqual(ack.result, { carrot: 1 }); assert.equal(ack.profile.awayStore, undefined);
});
