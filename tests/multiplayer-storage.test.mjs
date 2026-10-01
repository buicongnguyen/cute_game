import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { createAccountStore } from '../server/account-store.mjs';
import { createGameServer } from '../server/server.mjs';
import { databaseCommand } from '../server/database-cli.mjs';
import * as Game from '../src/model.ts';
import { commandHash } from '../server/action-service.mjs';
import { randomUUID } from 'node:crypto';

// Real PostgreSQL SQL through PGlite, with serialized pg-compatible checkout.
// Server/store lifetimes can end independently of the database engine, like a
// remote database surviving a web-process restart. No hosted service is used.
async function database() {
  const db = await PGlite.create(); let queue = Promise.resolve(), failure = null, closes = 0;
  const pool = {
    async connect() {
      const before = queue; let unlock; queue = new Promise(resolve => { unlock = resolve; }); await before;
      let released = false;
      return {
        async query(sql, params) { if (failure) failure(sql, params); return db.query(sql, params); },
        release() { if (!released) { released = true; unlock(); } },
      };
    },
    async query(sql, params) { const client = await pool.connect(); try { return await client.query(sql, params); } finally { client.release(); } },
    async end() { await queue; closes++; },
  };
  return { pool, fail: callback => { failure = callback; }, get closes() { return closes; }, async destroy() { await queue; await db.close(); } };
}

async function api(server, route, { method = 'GET', body, cookie } = {}) {
  const response = await fetch(`${server.url}/api/${route}`, {
    method, headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: response.status, body: await response.json(), cookie: response.headers.get('set-cookie')?.split(';')[0] };
}
const password = 'garden-password-42';
const login = (server, username) => api(server, 'auth/login', { method: 'POST', body: { username, password } });

test('SQL-backed HTTP accounts, revisions and friendships survive a server restart', async t => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'zoo-http-sql-')), db = await database();
  let server, store;
  t.after(async () => { if (server) await server.close(); await db.destroy(); await rm(directory, { recursive: true, force: true }); });
  async function start() {
    store = await createAccountStore({ pool: db.pool });
    server = await createGameServer({ host: '127.0.0.1', port: 0, dataDir: directory, databaseUrl: '', databaseRequired: false, accountStore: store });
  }
  await start();
  const alice = await api(server, 'auth/register', { method: 'POST', body: { username: 'alice', password, name: 'Alice' } });
  const bob = await api(server, 'auth/register', { method: 'POST', body: { username: 'bob', password, name: 'Bob' } });
  assert.equal(alice.status, 200); assert.equal(bob.status, 200);
  const aliceId = alice.body.account.id, bobId = bob.body.account.id;
  // Privileged fixture setup is separate from the public API: clients cannot upload earned value.
  await store.command({ actorId: aliceId, expectedRevision: 0, requestId: randomUUID(), hash: commandHash({fixture:true}), run: records => {
    const state=records.get(aliceId).profile;state.energy=1234;state.bag={rod:1,sword_wood:1};return true;
  }});
  const requestId = 'http-durable-action-0001';
  const intent={rulesVersion:1,requestId,expectedRevision:1,type:'equip',payload:{id:'sword_wood'}};
  const saved = await api(server, 'actions', { method: 'POST', cookie: alice.cookie, body: intent });
  assert.equal(saved.status, 200); assert.equal(saved.body.revision, 2);
  const profile=saved.body.profile;
  assert.equal((await api(server, 'friends/request', { method: 'POST', cookie: alice.cookie, body: { id: bobId } })).status, 200);
  assert.equal((await api(server, 'friends/accept', { method: 'POST', cookie: bob.cookie, body: { id: aliceId } })).status, 200);
  const durableBefore = await store.get(aliceId);
  assert.deepEqual(durableBefore.friends, [bobId]);
  assert.equal(durableBefore.profile.energy, 1234); assert.equal(durableBefore.profileRevision, 2);
  assert.ok(durableBefore.accountRevision >= 3);
  await server.close(); server = null;
  assert.equal(db.closes, 1);
  await start();
  assert.equal((await api(server, 'auth/session', { cookie: alice.cookie })).body.account, null, 'sessions are deliberately process-local');
  const restoredAlice = await login(server, 'alice'), restoredBob = await login(server, 'bob');
  assert.equal(restoredAlice.status, 200); assert.equal(restoredBob.status, 200);
  assert.equal(restoredAlice.body.account.id, aliceId); assert.equal(restoredAlice.body.revision, 2);
  assert.deepEqual(restoredAlice.body.profile, Game.parseSave(JSON.stringify(profile)));
  assert.deepEqual(restoredAlice.body.friends.map(friend => friend.id), [bobId]);
  assert.deepEqual(restoredBob.body.friends.map(friend => friend.id), [aliceId]);
  assert.deepEqual(await store.get(aliceId), durableBefore, 'login/restart cannot rewrite password hashes or saved records');
  const replay = await api(server, 'actions', { method: 'POST', cookie: restoredAlice.cookie, body: {...intent,expectedRevision:20} });
  assert.equal(replay.status, 200); assert.equal(replay.body.revision, 2);assert.equal(replay.body.replayed,true);
  const stale = await api(server, 'actions', { method: 'POST', cookie: restoredAlice.cookie, body: {...intent,requestId:'different-stale-action',expectedRevision:1} });
  assert.equal(stale.status, 409);
  const forbidden=await api(server,'profile',{method:'PUT',cookie:restoredAlice.cookie,body:{profile:{...profile,energy:999999},revision:99,mutation:randomUUID()}});
  assert.equal(forbidden.status,409);
  assert.deepEqual(await store.get(aliceId), durableBefore);
  assert.deepEqual((await api(server, 'health')).body.storage, 'postgres');
  assert.deepEqual(await readdir(directory), [], 'SQL storage never creates a fallback accounts.json');
});

test('SQL write and commit failures never produce successful HTTP saves or publish uncommitted accounts', async t => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'zoo-http-fault-')), db = await database();
  const store = await createAccountStore({ pool: db.pool });
  const server = await createGameServer({ host: '127.0.0.1', port: 0, dataDir: directory, databaseUrl: '', databaseRequired: false, accountStore: store });
  t.after(async () => { await server.close(); await db.destroy(); await rm(directory, { recursive: true, force: true }); });
  const registered = await api(server, 'auth/register', { method: 'POST', body: { username: 'fault_user', password } });
  assert.equal(registered.status, 200);
  const id = registered.body.account.id, original = await store.get(id);
  for (const point of ['UPDATE zoo_accounts', 'COMMIT']) {
    db.fail(sql => { if (sql.startsWith(point)) throw new Error('private-database-failure'); });
    const result = await api(server, 'actions', { method: 'POST', cookie: registered.cookie, body: {
      rulesVersion:1,requestId:`fault-action-${point.startsWith('UPDATE') ? 'update' : 'commit'}`,expectedRevision:0,type:'settings',payload:{name:'Uncommitted name'},
    } });
    assert.equal(result.status, 500); assert.doesNotMatch(JSON.stringify(result.body), /private-database/);
    db.fail(null);
    const after = await login(server, 'fault_user');
    assert.equal(after.status, 200); assert.equal(after.body.revision, 0);
    assert.deepEqual(after.body.profile, original.profile);
    assert.deepEqual(await store.get(id), original, 'failed SQL cannot advance either account or profile revision');
  }
  db.fail(sql => { if (sql === 'COMMIT') throw new Error('registration commit failed'); });
  const createFailed = await api(server, 'auth/register', { method: 'POST', body: { username: 'uncommitted', password } });
  assert.equal(createFailed.status, 500); assert.equal(createFailed.cookie, undefined);
  db.fail(null);
  assert.equal(await store.findByUsername('uncommitted'), null);
  assert.equal((await login(server, 'uncommitted')).status, 401);
  db.fail(sql => { if (sql === 'SELECT 1') throw new Error('private-health-failure'); });
  const health = await api(server, 'health'); assert.equal(health.status, 503);
  assert.deepEqual(health.body, { ok: false, error: 'Account storage is unavailable.' });
  db.fail(sql => { if (sql.startsWith('SELECT account')) throw new Error('private-read-failure'); });
  const readFailed = await api(server, 'auth/session', { cookie: registered.cookie });
  assert.equal(readFailed.status, 500); assert.doesNotMatch(JSON.stringify(readFailed.body), /private-read/);
  db.fail(null);
  assert.equal((await api(server, 'health')).status, 200);
  assert.deepEqual(await readdir(directory), []);
});

function importAccount(id) {
  return { id, username: id, salt: `legacy-salt-${id}`, hash: `legacy-hash-${id}`, createdAt: 123, friends: [], requests: [],
    profile: Game.newGame(`Player ${id}`), profileRevision: 7, accountRevision: 12, lastMutation: 'preserved-mutation-007', receivedAt: 456 };
}

test('database CLI checks and imports real SQL without changing credentials or source files', async t => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'zoo-cli-sql-')), db = await database();
  t.after(async () => { await db.destroy(); await rm(directory, { recursive: true, force: true }); });
  const filename = path.join(directory, 'accounts.json'), records = [importAccount('legacyone'), importAccount('legacytwo')];
  records[0].friends = [records[1].id]; records[1].friends = [records[0].id];
  Game.addItem(records[0].profile, 'rod'); Game.addItem(records[0].profile, 'sword_wood'); Game.equip(records[0].profile, 'sword_wood');
  const original = JSON.stringify({ version: 1, accounts: records }); await writeFile(filename, original);
  const output = [], created = [];
  const options = {
    env: { DATABASE_URL: 'postgres://unused-test-connection' }, output: value => output.push(value),
    createStore: async options => { assert.equal(options.databaseUrl, 'postgres://unused-test-connection'); const store = await createAccountStore({ pool: db.pool }); created.push(store); return store; },
  };
  await databaseCommand(['check'], options);
  assert.match(output[0], /PostgreSQL is ready/); assert.equal(db.closes, 1);
  await assert.rejects(created[0].list(), /closed/);
  await databaseCommand(['import', '--path', filename], options);
  assert.match(output.at(-1), /Imported 2 accounts/); assert.equal(db.closes, 2);
  assert.equal(await readFile(filename, 'utf8'), original);
  const reader = await createAccountStore({ pool: db.pool });
  try { assert.deepEqual(await reader.list(), records); }
  finally { await reader.close(); }
  await assert.rejects(databaseCommand(['import', '--path', filename], options), error => error.status === 409);
  await assert.rejects(created.at(-1).list(), /closed/);
  const healthy = await createAccountStore({ pool: db.pool });
  try { assert.deepEqual(await healthy.list(), records, 'refusing a repeated import leaves every row untouched'); }
  finally { await healthy.close(); }
  db.fail(sql => { if (sql === 'SELECT 1') throw new Error('health unavailable'); });
  await assert.rejects(databaseCommand(['check'], options), /health unavailable/);
  db.fail(null);
  await assert.rejects(created.at(-1).list(), /closed/, 'CLI always closes the store on command failure');
});

test('database CLI rejects malformed imports before opening any destination connection', async t => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'zoo-cli-invalid-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const filename = path.join(directory, 'accounts.json'); let connections = 0;
  const options = { env: { DATABASE_URL: 'postgres://unused-test-connection' }, output() {}, createStore: async () => { connections++; throw new Error('must not connect'); } };
  const valid = importAccount('legacy');
  for (const source of [
    '{invalid', JSON.stringify({ version: 99, accounts: [] }), JSON.stringify({ version: 1, accounts: {} }),
    JSON.stringify({ version: 1, accounts: [{ ...valid, profile: { version: 1 } }] }),
    JSON.stringify({ version: 1, accounts: [{ ...valid, hash: null }] }),
    JSON.stringify({ version: 1, accounts: [{ ...valid, username: 'bad user' }] }),
    JSON.stringify({ version: 1, accounts: [{ ...valid, accountRevision: -1 }] }),
    JSON.stringify({ version: 1, accounts: [valid, { ...valid, id: 'second' }] }),
  ]) {
    await writeFile(filename, source);
    await assert.rejects(databaseCommand(['import', '--path', filename], options));
    assert.equal(connections, 0, 'all source/account validation must finish before opening the database');
    assert.equal(await readFile(filename, 'utf8'), source);
  }
  await assert.rejects(databaseCommand(['check'], { ...options, env: {} }), /DATABASE_URL/);
  await assert.rejects(databaseCommand(['import', filename], options), /Use npm/);
  assert.equal(connections, 0);
});

test('version-2 file migration preserves durable command receipts and retries after PostgreSQL import', async t => {
  const directory=await mkdtemp(path.join(os.tmpdir(),'zoo-v2-import-')),db=await database();
  t.after(async()=>{await db.destroy();await rm(directory,{recursive:true,force:true});});
  const source=await createAccountStore({dataDir:directory});await source.create(importAccount('legacy'));
  const requestId=randomUUID(),hash=commandHash({type:'fixtureReward'});
  const first=await source.command({actorId:'legacy',requestId,hash,expectedRevision:7,actionType:'fixtureReward',run:records=>{records.get('legacy').profile.energy+=35;return {gain:35};}});
  await source.command({actorId:'legacy',requestId:randomUUID(),hash:commandHash({type:'later'}),expectedRevision:8,run:records=>{records.get('legacy').profile.energy+=5;return true;}});
  const original=await source.get('legacy');await source.close();
  const filename=path.join(directory,'accounts.json'),bytes=await readFile(filename,'utf8'),document=JSON.parse(bytes);assert.equal(document.version,2);
  assert.ok(document.receipts.every(receipt=>receipt.format===2&&!Object.hasOwn(receipt.reply,'profile')),'compact receipts keep the original outcome without repeated save snapshots');
  const options={env:{DATABASE_URL:'postgres://unused-test-connection'},output(){},createStore:()=>createAccountStore({pool:db.pool})};
  // Even failure after accounts have been inserted must leave an empty destination.
  db.fail(sql=>{if(sql.startsWith('INSERT INTO zoo_action_receipts'))throw new Error('receipt import failed');});
  await assert.rejects(databaseCommand(['import','--path',filename],options),/receipt import failed/);db.fail(null);
  let reader=await createAccountStore({pool:db.pool});assert.deepEqual(await reader.list(),[]);await reader.close();
  await databaseCommand(['import','--path',filename],options);
  reader=await createAccountStore({pool:db.pool});
  try{
    assert.deepEqual(await reader.get('legacy'),original);
    const retry=await reader.command({actorId:'legacy',requestId,hash,expectedRevision:9,run:()=>{throw new Error('a migrated receipt must never rerun');}});
    assert.equal(retry.reply.replayed,true);assert.deepEqual(retry.reply.result,first.reply.result);assert.equal(retry.reply.revision,9);assert.equal(retry.reply.actionRevision,8);assert.equal(retry.reply.profile.energy,40);
    assert.equal((await reader.get('legacy')).profile.energy,40);assert.equal((await reader.get('legacy')).profileRevision,9);
    await assert.rejects(reader.command({actorId:'legacy',requestId,hash:commandHash({changed:true}),expectedRevision:9,run:()=>true}),error=>error.status===409);
  }finally{await reader.close();}
  assert.equal(await readFile(filename,'utf8'),bytes,'the live file source and receipts remain intact');
});

test('legacy full-profile command receipts remain replayable after SQL import without rolling back current progress',async t=>{
  const directory=await mkdtemp(path.join(os.tmpdir(),'zoo-full-receipt-')),db=await database();
  t.after(async()=>{await db.destroy();await rm(directory,{recursive:true,force:true});});
  const current=importAccount('legacy');current.profile.energy=90;current.profileRevision=9;current.authorityVersion=1;
  const oldProfile=structuredClone(current.profile);oldProfile.energy=35;
  const requestId=randomUUID(),hash=commandHash({type:'oldReward'}),receipt={actorId:current.id,requestId,hash,reply:{ok:true,profile:oldProfile,revision:8,authorityVersion:1,result:{gain:35}}};
  const filename=path.join(directory,'accounts.json');await writeFile(filename,JSON.stringify({version:2,accounts:[current],receipts:[receipt]}));
  const options={env:{DATABASE_URL:'postgres://unused-test-connection'},output(){},createStore:()=>createAccountStore({pool:db.pool})};
  await databaseCommand(['import','--path',filename],options);
  const reader=await createAccountStore({pool:db.pool});try{
    const replay=await reader.command({actorId:current.id,requestId,hash,expectedRevision:8,run:()=>{throw new Error('legacy receipt must not rerun');}});
    assert.equal(replay.reply.replayed,true);assert.equal(replay.reply.actionRevision,8);assert.equal(replay.reply.revision,9);assert.equal(replay.reply.profile.energy,90);assert.deepEqual(replay.reply.result,{gain:35});
    assert.deepEqual(await reader.get(current.id),current);
  }finally{await reader.close();}
});

test('version-2 malformed and orphaned receipts are rejected before opening the destination',async t=>{
  const directory=await mkdtemp(path.join(os.tmpdir(),'zoo-v2-invalid-'));t.after(()=>rm(directory,{recursive:true,force:true}));
  const filename=path.join(directory,'accounts.json'),account=importAccount('legacy');let connections=0;
  const receipt={actorId:'legacy',requestId:randomUUID(),hash:commandHash({original:true}),reply:{ok:true,profile:account.profile,revision:7,result:true}};
  const options={env:{DATABASE_URL:'postgres://unused'},output(){},createStore:async()=>{connections++;throw new Error('must not connect');}};
  for(const receipts of [[{...receipt,actorId:'missing'}],[{...receipt,hash:'not-a-hash'}],[{...receipt,reply:{...receipt.reply,revision:-1}}],[receipt,receipt],{}]){
    await writeFile(filename,JSON.stringify({version:2,accounts:[account],receipts}));await assert.rejects(databaseCommand(['import','--path',filename],options));assert.equal(connections,0);
  }
});
