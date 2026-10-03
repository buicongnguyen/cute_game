// w18: 4x home recovery, cleanse on landing/entering, pen robot auto-restock, smaller Titans and forest hawks.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
const M = await import('../src/model.ts');
const { applyGameAction, ACTION_RULES_VERSION } = await import('../src/actions.ts');
const H = await import('../src/home-care.ts');
const R = await import('../src/farm-restock.ts');
const { INDOOR_Y } = await import('../src/house.ts');
const { ENEMY_TYPES, enemyScale, ENEMY_SCALE } = await import('../src/enemy-types.ts');
const { TITANS } = await import('../src/titan-content.ts');
const { enemyRoster } = await import('../src/enemy-roster.ts');
const { pickCircle, CREATURE_CIRCLE, NODE_PX_PER_METRE } = await import('../src/picking.ts');
const { setLanguage, t } = await import('../src/i18n.ts');
const { restockSection } = await import('../src/farm-helper-ui.ts');
const { parseFarm } = await import('../src/farm.ts');
const { createAccountStore } = await import('../server/account-store.mjs');
const { createActionService, commandHash } = await import('../server/action-service.mjs');

const act = (s, type, payload = {}, now = Date.now()) => applyGameAction(s, { type, payload }, { now, random: () => .5 });

test('home heals 4x the old rate (rest 4 HP/s + passive regen), outdoors in the village and indoors alike', () => {
  assert.equal(H.homeRecoveryRate(0), 16); // was 4 HP/s
  assert.equal(H.homeRecoveryRate(2), 24); // was 4 + 2
  for (const regen of [0, 1.5, 5]) assert.equal(regen + H.homeRecoveryBonus(regen), 4 * (4 + regen));
  assert.equal(H.homeRecoveryBonus(NaN), 16);
  assert.equal(H.atHome('home', { x: 0, z: 0 }), true);
  assert.equal(H.atHome('home', { x: -60, z: 0 }), false, 'the forest is not home');
  assert.equal(H.atHome('home', { x: -60, z: 0, y: INDOOR_Y }), true, 'an indoor pose (raised by INDOOR_Y) is home');
  assert.equal(H.atHome('home', { x: 99, z: 99 }, true), true);
  assert.equal(H.atHome('candy', { x: 0, z: 0 }), false);
});

test('client world and server authority both use the shared home rate (the old client line sat inside a comment)', async () => {
  const world = await readFile(new URL('../src/world.ts', import.meta.url), 'utf8'), server = await readFile(new URL('../server/combat-authority.mjs', import.meta.url), 'utf8');
  assert.match(world, /\n\s*this\.homeRecovering=atHome\(this\.planet,this\.position,!!this\.interior\).*homeRecoveryBonus\(stats\.regen\)\*dt/);
  assert.match(server, /if\(atHome\(peer\.planet,peer\.pose\)&&peer\.account\.profile\.hp<traits\.maxHp\)hp\(peer,homeRecoveryBonus\(traits\.regen\)\*dt,'rest'\)/);
  setLanguage('vi'); try { assert.notEqual(t('Home: fast recovery'), 'Home: fast recovery'); } finally { setLanguage('en'); }
  assert.match(H.homeChip(true, 'x'), /🏡 x <b>×4<\/b>/); assert.equal(H.homeChip(false, 'x'), '');
});

test('landing home, flying home and entering the cottage clear every negative effect and keep the good ones', () => {
  const now = Date.now(), s = M.newGame(); s.planet = 'toy';
  s.buffs.speed = { value: -.4, expiresAt: now + 8000, source: 'gift' };
  s.buffs.atk = { value: .5, expiresAt: now + 20000, source: 'gift' };
  s.buffs.def = { value: -3, expiresAt: now + 20000, source: 'effect' };
  assert.deepEqual(H.debuffKeys(s, now).sort(), ['def', 'speed']);
  assert.deepEqual(act(s, 'returnHome', {}, now), { cleansed: 2 });
  assert.equal(s.buffs.speed, undefined); assert.equal(s.buffs.def, undefined); assert.equal(s.buffs.atk.value, .5);
  // Entering the cottage: same rule, only at home.
  s.buffs.speed = { value: -.4, expiresAt: now + 8000, source: 'gift' };
  assert.equal(act(s, 'homeCleanse', {}, now), 1); assert.equal(s.buffs.speed, undefined); assert.equal(act(s, 'homeCleanse', {}, now), 0);
  s.planet = 'toy'; s.buffs.speed = { value: -.4, expiresAt: now + 8000, source: 'gift' };
  assert.throws(() => act(s, 'homeCleanse', {}, now)); assert.equal(s.buffs.speed.value, -.4, 'never cleansed away from home');
  // An ordinary curse-free trip still returns a truthy result (main.ts arrive checks it).
  const clean = M.newGame(); clean.planet = 'candy'; assert.deepEqual(act(clean, 'returnHome'), { cleansed: 0 });
});

function farmer(energy = 5000) {
  const s = M.newGame('Farmer'); s.level = 20; s.energy = energy; s.farm.built = true; s.farm.helper = { owned: true, paused: false, autoFeed: false }; return s;
}
const expire = (s, kind) => { const a = s.farm.animals.find(x => x.kind === kind && !M.expired(x)); a.bornAt = a.acquiredAt = Date.now() - M.ANIMAL_LIFESPAN_MS - 1000; a.cycleAt = M.adultAt(a); return a; };

test('auto-restock: upgrade costs scale, level caps per kind, the pen caps all, and nothing is bought before it is taught', () => {
  const s = farmer(); M.buyAnimal(s, 'chicken'); M.buyAnimal(s, 'chicken'); M.buyAnimal(s, 'chicken');
  assert.deepEqual(R.RESTOCK_COSTS, [300, 600, 1200, 2400]);
  expire(s, 'chicken'); M.collectProducts(s); assert.equal(M.animalCount(s, 'chicken'), 2);
  assert.deepEqual(R.restock(s), [], 'no restock before the upgrade');
  let energy = s.energy; assert.equal(R.upgradeRestock(s), 'upgraded'); assert.equal(s.energy, energy - 300);
  assert.equal(R.restockOf(s).level, 1); assert.equal(R.restockOf(s).roster.chicken, 2, 'level 1 keeps 2 of a kind');
  expire(s, 'chicken'); M.collectProducts(s); energy = s.energy;
  const bought = R.restock(s); assert.equal(bought.length, 1); assert.equal(bought[0].kind, 'chicken'); assert.equal(s.energy, energy - M.priceOf(s, 'chicken'));
  assert.equal(M.animalCount(s, 'chicken'), 2); assert.deepEqual(R.restock(s), [], 'full to its roster');
  // Upgrading: level 2 keeps 4 but the base pen holds only 4 chickens; the roster grows only with what the player raised.
  assert.equal(R.upgradeRestock(s), 'upgraded'); assert.equal(s.energy <= energy, true);
  M.buyAnimal(s, 'chicken'); M.buyAnimal(s, 'chicken'); assert.equal(M.buyAnimal(s, 'chicken'), null, 'pen full at 4');
  R.restock(s); assert.equal(R.restockOf(s).roster.chicken, 4);
  for (let i = 0; i < 4; i++) expire(s, 'chicken'); M.collectProducts(s);
  assert.equal(R.restock(s).length, R.RESTOCK_RUN_CAP, 'a live run buys at most two'); assert.equal(R.restock(s).length, 2); assert.equal(M.animalCount(s, 'chicken'), 4);
  assert.equal(R.upgradeRestock(s), 'upgraded'); assert.equal(R.upgradeRestock(s), 'upgraded'); assert.equal(R.upgradeRestock(s), 'max');
  assert.equal(R.restockTarget(s, 'chicken'), M.penCapacity(s, 'chicken'), 'never more than the pen holds');
  // Expanding the pen raises room; the roster still only refills what was raised.
  assert.equal(parseFarm(JSON.parse(JSON.stringify(s.farm))).helper.restock.level, 4, 'saved and parsed');
});

test('auto-restock: the switch and the energy guard are respected, prices follow difficulty, and expired animals hold their slot', () => {
  const s = farmer(); M.buyAnimal(s, 'cow'); assert.equal(R.upgradeRestock(s), 'upgraded');
  expire(s, 'cow'); assert.equal(R.nextRestock(s), 'cow', 'an expired animal is replaced once the pen has room');
  M.collectProducts(s);
  assert.equal(act(s, 'setFarmRestock', { keep: 2500 }), true); s.energy = 2500 + M.priceOf(s, 'cow') - 1;
  assert.deepEqual(R.restock(s), [], 'would drop below the guard');
  s.energy += 1; assert.equal(R.restock(s).length, 1); assert.equal(s.energy, 2500);
  expire(s, 'cow'); M.collectProducts(s); s.energy = 9000;
  assert.equal(act(s, 'setFarmRestock', { on: false }), true); assert.deepEqual(R.restock(s), []);
  assert.throws(() => act(s, 'setFarmRestock', { keep: 123 })); assert.throws(() => act(s, 'farmHelperRestock'));
  act(s, 'setFarmRestock', { on: true }); s.farm.helper.paused = true; assert.deepEqual(R.restock(s), [], 'a paused robot buys nothing');
  s.farm.helper.paused = false; s.settings.difficulty = 'hard';
  const price = M.priceOf(s, 'cow'); assert.equal(price, 120); const before = s.energy; assert.equal(R.restock(s)[0].price, 120); assert.equal(s.energy, before - 120);
  const v = farmer(0); assert.equal(R.upgradeRestock(v), 'energy'); v.planet = 'candy'; v.energy = 9999; assert.equal(R.upgradeRestock(v), 'away');
});

test('auto-restock offline catch-up collects the meat first, then restocks fairly and at most six', () => {
  const s = farmer(99999); s.farm.penLevel = 2;
  for (const kind of ['chicken', 'duck', 'cow', 'pig']) for (let i = 0; i < 4; i++) M.buyAnimal(s, kind);
  for (let i = 0; i < 4; i++) R.upgradeRestock(s);
  for (const kind of ['chicken', 'duck', 'cow', 'pig']) for (let i = 0; i < 4; i++) expire(s, kind);
  const now = Date.now(), r = act(s, 'farmHelperCatchUp', {}, now);
  assert.equal(r.collected.filter(c => c.item === 'meat').length, 16);
  assert.equal(r.restocked.length, R.RESTOCK_CATCH_UP_CAP);
  assert.ok(s.farm.animals.every(a => a.bornAt === now), 'replacements arrive young now: no back-dated production');
  const sum = R.restockSummary(r.restocked); assert.equal(sum.spent, r.restocked.reduce((n, x) => n + x.price, 0)); assert.match(sum.animals, /\d/);
});

test('the restock panel renders in Vietnamese with no English left', () => {
  const s = farmer(); M.buyAnimal(s, 'chicken');
  setLanguage('vi');
  try {
    for (const html of [restockSection(s), (R.upgradeRestock(s), restockSection(s))]) {
      const text = html.replace(/<[^>]+>/g, ' ');
      for (const w of ['Auto', 'restock', 'Keep', 'Level', 'Spending', 'Upgrade', 'normal']) assert.ok(!text.includes(w), `${w} in: ${text}`);
    }
  } finally { setLanguage('en'); }
});

async function server(t) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'zoo-restock-')), store = await createAccountStore({ dataDir: dir });
  t.after(async () => { await store.close(); await rm(dir, { recursive: true, force: true }); });
  const profile = farmer(5000); M.buyAnimal(profile, 'pig', Date.now() - 60_000);
  profile.buffs.speed = { value: -.4, expiresAt: Date.now() + 60_000, source: 'gift' };
  await store.create({ id: 'alice', username: 'alice', hash: 'h', salt: 's', friends: [], requests: [], profile });
  let peer = { active: true, planet: 'home', room: 'public:home', visit: null, pose: { x: 0, z: 0 } };
  const execute = createActionService({ store, getPeer: () => peer });
  const command = async (type, payload = {}) => execute('alice', { rulesVersion: ACTION_RULES_VERSION, requestId: randomUUID(), expectedRevision: (await store.get('alice')).profileRevision || 0, type, payload });
  const edit = async change => { const a = await store.get('alice'); await store.command({ actorId: 'alice', requestId: randomUUID(), expectedRevision: a.profileRevision || 0, hash: commandHash({ x: randomUUID() }), actionType: 'test', run: r => { change(r.get('alice')); return true; } }); };
  return { store, command, edit, set peer(v) { peer = v; } };
}

test('the server validates restock (cost, guard, switch) and cleanses on its own copy', async t => {
  const f = await server(t);
  await assert.rejects(f.command('farmHelperRestock'), 'not taught yet');
  const start = (await f.store.get('alice')).profile.energy, up = await f.command('upgradeFarmRestock'); assert.equal(up.profile.energy, start - 300);
  await f.edit(a => { const x = a.profile.farm.animals[0]; x.bornAt = x.acquiredAt = Date.now() - M.ANIMAL_LIFESPAN_MS - 1000; x.cycleAt = M.adultAt(x); });
  const caught = await f.command('farmHelperCatchUp'); assert.equal(caught.result.restocked.length, 1); assert.equal(caught.result.restocked[0].kind, 'pig');
  assert.equal(caught.profile.farm.animals.filter(a => a.kind === 'pig').length, 1);
  await assert.rejects(f.command('setFarmRestock', { keep: 7 }));
  await f.edit(a => { a.profile.energy = 100; const x = a.profile.farm.animals[0]; x.bornAt = x.acquiredAt = Date.now() - M.ANIMAL_LIFESPAN_MS - 1000; x.cycleAt = M.adultAt(x); });
  await f.command('farmHelperCollect', { uid: (await f.store.get('alice')).profile.farm.animals[0].uid });
  await assert.rejects(f.command('farmHelperRestock'), 'the guard (keep 250) blocks a pig purchase');
  const cleansed = await f.command('homeCleanse'); assert.equal(cleansed.result, 1); assert.equal(cleansed.profile.buffs.speed, undefined);
  f.peer = { active: true, planet: 'home', room: 'x', visit: 'bob', pose: { x: 0, z: 0 } };
  await assert.rejects(f.command('homeCleanse')); await assert.rejects(f.command('upgradeFarmRestock'));
});

test('Titans are drawn at 0.75 and forest hawks at 0.5, with radius, reach and server roster radius to match', () => {
  for (const [id, d] of Object.entries(TITANS)) {
    assert.ok(Math.abs(enemyScale(id, true) - d.scale * .75) < 1e-9, id);
    assert.ok(Math.abs(ENEMY_TYPES[id].radius - d.radius * .75) < 1e-9); assert.ok(Math.abs(ENEMY_TYPES[id].reach - d.reach * .75) < 1e-9);
    assert.equal(TITANS[id].radius, d.radius, 'the shared facts are not mutated');
  }
  assert.ok(Math.abs(enemyScale('forest_raptor') - ENEMY_SCALE.forest_raptor * .5) < 1e-9);
  assert.ok(Math.abs(ENEMY_TYPES.forest_raptor.radius - .4) < 1e-9); assert.ok(Math.abs(ENEMY_TYPES.forest_raptor.reach - .95) < 1e-9);
  const roster = enemyRoster('home');
  assert.ok(Math.abs(roster.find(e => e.type === 'forest_raptor').radius - .4) < 1e-9);
  assert.ok(Math.abs(roster.find(e => e.type === 'titan_turtle').radius - 4.2 * .75) < 1e-9);
  assert.equal(enemyScale('wolf'), ENEMY_SCALE.wolf, 'others unchanged');
  // Pick circles: hawks keep the 55 px creature floor; the turtle's circle shrinks with its body but stays boss-sized.
  assert.equal(pickCircle('enemy', ENEMY_TYPES.forest_raptor.radius).r, CREATURE_CIRCLE.r);
  assert.equal(pickCircle('enemy', ENEMY_TYPES.titan_turtle.radius, true).r, 4.2 * .75 * NODE_PX_PER_METRE);
});
