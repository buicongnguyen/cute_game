import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, mkdir, rename, rmdir, rm, readdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { Pool } from 'pg';
import { createAccountStore, validateImportedAccounts } from '../server/account-store.mjs';

const account = (id, username = id) => ({
  id, username, hash: `hash-${id}`, salt: `salt-${id}`, createdAt: 1234, friends: [], requests: [],
  profile: { version: 1, contentVersion: 2, name: username, savedAt: 111, bag: { carrot: 7 }, helper: { name: 'Mây', level: 4 }, home: { level: 2 }, placed: [{ id: 'chair', x: 3 }] },
});
const save = (revision, tag = `mutation-${String(revision).padStart(10, '0')}`) => ({
  profile: { version: 1, name: 'Updated', savedAt: revision * 1000, helper: { name: 'Mây', level: revision } },
  revision, mutation: tag, receivedAt: revision * 1000 + 5,
});
const status = expected => error => error.status === expected;

// PGlite runs a real PostgreSQL engine with one connection. Serialize checkout,
// including ordinary pool queries, so each production BEGIN/COMMIT uses an
// exclusive client exactly as a pg Pool would. Faults interrupt actual SQL
// transactions, not a mocked database implementation.
async function pgPool() {
  const db = await PGlite.create(); let queue = Promise.resolve(), fault = null, statements = [];
  const pool = {
    async connect() {
      const before = queue; let unlock; queue = new Promise(resolve => { unlock = resolve; }); await before;
      let released = false;
      return {
        async query(sql, params) { statements.push(sql); if (fault) fault(sql, params); return db.query(sql, params); },
        release() { if (!released) { released = true; unlock(); } },
      };
    },
    async query(sql, params) { const client = await pool.connect(); try { return await client.query(sql, params); } finally { client.release(); } },
    async end() { await queue; await db.close(); },
    fail(callback) { fault = callback; },
    get statements() { return statements; },
    clearStatements() { statements = []; },
  };
  return pool;
}

for (const kind of ['file', 'postgres']) {
  test(`${kind} account store contract`, async t => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'zoo-store-'));
    const pool = kind === 'postgres' ? await pgPool() : undefined;
    const store = await createAccountStore({ dataDir: directory, pool });
    t.after(async () => { await store.close(); await rm(directory, { recursive: true, force: true }); });
    assert.equal(store.kind, kind);

    await t.test('atomic import preserves credentials, save versions and new gameplay fields', async () => {
      const alice = account('alice'), bob = account('bob');
      alice.profileRevision = 8; alice.lastMutation = 'original-mutation-8'; alice.receivedAt = 9876;
      alice.profile.version = 0; alice.profile.contentVersion = 1; // Storage must not migrate or strip a save.
      await assert.rejects(store.importAccounts([alice, { ...bob, username: 'alice' }]), status(409));
      assert.deepEqual(await store.list(), []);
      assert.equal(await store.importAccounts([alice, bob]), 2);
      assert.deepEqual(await store.get('alice'), alice);
      assert.deepEqual(await store.findByUsername('bob'), bob);
      await assert.rejects(store.importAccounts([account('carol')]), status(409));
      assert.equal((await store.list()).length, 2);
      assert.equal(await store.get('unknown'), null);
      assert.equal(await store.findByUsername("alice' OR true --"), null, 'lookup parameters are values, not SQL');
    });

    await t.test('duplicate creates are rejected atomically, even when submitted concurrently', async () => {
      const results = await Promise.allSettled([store.create(account('carol')), store.create(account('other', 'carol'))]);
      assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
      assert.equal(results.find(result => result.status === 'rejected').reason.status, 409);
      await assert.rejects(store.create(account('alice', 'unique')), status(409));
      assert.equal((await store.list()).length, 3);
    });

    await t.test('profile saves enforce revisions and replay mutation IDs without overwriting data', async () => {
      const updated = await store.saveProfile('alice', save(9));
      assert.equal(updated.replayed, false); assert.equal(updated.account.profileRevision, 9);
      assert.equal(updated.account.lastMutation, save(9).mutation); assert.equal(updated.account.receivedAt, 9005);
      const replay = await store.saveProfile('alice', { ...save(123, save(9).mutation), profile: { name: 'Do not overwrite' } });
      assert.equal(replay.replayed, true); assert.deepEqual(replay.account, updated.account);
      await assert.rejects(store.saveProfile('alice', save(9, 'another-mutation-9')), status(409));
      await assert.rejects(store.saveProfile('alice', save(8)), status(409));
      await assert.rejects(store.saveProfile('alice', { ...save(10), revision: NaN }), status(400));
      await assert.rejects(store.saveProfile('alice', { ...save(10), mutation: 'short' }), status(400));
      await assert.rejects(store.saveProfile('missing', save(1)), status(404));
      assert.deepEqual(await store.get('alice'), updated.account);
    });

    await t.test('concurrent same-revision writes allow exactly one winner and preserve its complete profile', async () => {
      const results = await Promise.allSettled([
        store.saveProfile('alice', { ...save(10, 'concurrent-first-10'), profile: { name: 'First', helper: { level: 10 } } }),
        store.saveProfile('alice', { ...save(10, 'concurrent-second-10'), profile: { name: 'Second', helper: { level: 20 } } }),
      ]);
      assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
      assert.equal(results.find(result => result.status === 'rejected').reason.status, 409);
      assert.deepEqual(await store.get('alice'), results.find(result => result.status === 'fulfilled').value.account);
    });

    await t.test('friend requests, acceptance and removal update both current accounts without replacing profiles', async () => {
      await assert.rejects(store.friendAction('alice', 'alice', 'request'), status(404));
      await assert.rejects(store.friendAction('alice', 'missing', 'request'), status(404));
      await assert.rejects(store.friendAction('alice', 'bob', 'unknown'), status(404));
      await assert.rejects(store.friendAction('alice', 'bob', 'accept'), status(400));
      await Promise.all([store.friendAction('alice', 'bob', 'request'), store.friendAction('bob', 'alice', 'request')]);
      assert.deepEqual((await store.get('bob')).requests, ['alice']);
      const profile = save(11);
      await Promise.all([store.friendAction('alice', 'bob', 'accept'), store.saveProfile('alice', profile)]);
      const alice = await store.get('alice'), bob = await store.get('bob');
      assert.deepEqual(alice.friends, ['bob']); assert.deepEqual(bob.friends, ['alice']);
      assert.deepEqual(alice.requests, []); assert.deepEqual(bob.requests, []);
      assert.deepEqual(alice.profile, profile.profile); assert.equal(alice.profileRevision, 11);
      await assert.rejects(store.friendAction('alice', 'bob', 'request'), status(409));
      const removed = await store.friendAction('alice', 'bob', 'remove');
      assert.deepEqual(removed.map(value => value.friends), [[], []]);
      await store.friendAction('alice', 'bob', 'request');
      await store.friendAction('bob', 'alice', 'decline');
      assert.deepEqual((await store.get('bob')).requests, []);
    });

    await t.test('returned and submitted records cannot mutate stored data by reference', async () => {
      const original = account('diana'), created = await store.create(original);
      original.profile.name = 'Input mutation'; created.profile.name = 'Output mutation';
      const fetched = await store.get('diana'); fetched.requests.push('bob');
      const listed = await store.list(); listed.find(value => value.id === 'diana').hash = 'changed';
      assert.deepEqual(await store.get('diana'), account('diana'));
      const update = save(1), promise = store.saveProfile('diana', update);
      update.profile.name = 'Caller changed pending save';
      const result = await promise; result.account.profile.name = 'Caller changed result';
      assert.equal((await store.get('diana')).profile.name, 'Updated');
    });

    await t.test('account revisions cover profile and both friendship records but never failed saves or mutation replays', async () => {
      await store.create({ ...account('epoch'), accountRevision: 41 });
      await store.create(account('epochpeer'));
      const updated = await store.saveProfile('epoch', save(1));
      assert.equal(updated.account.accountRevision, 42);
      assert.equal((await store.saveProfile('epoch', save(2, save(1).mutation))).account.accountRevision, 42);
      await assert.rejects(store.saveProfile('epoch', save(1, 'different-mutation-id')), status(409));
      assert.equal((await store.get('epoch')).accountRevision, 42);
      const requested = await store.friendAction('epoch', 'epochpeer', 'request');
      assert.equal(requested[0].accountRevision, 43); assert.equal(requested[1].accountRevision, 1);
      const accepted = await store.friendAction('epochpeer', 'epoch', 'accept');
      assert.equal(accepted[0].accountRevision, 2); assert.equal(accepted[1].accountRevision, 44);
      await assert.rejects(store.friendAction('epoch', 'epochpeer', 'request'), status(409));
      assert.equal((await store.get('epoch')).accountRevision, 44);
      const removed = await store.friendAction('epoch', 'epochpeer', 'remove');
      assert.equal(removed[0].accountRevision, 45); assert.equal(removed[1].accountRevision, 3);
    });

    if (kind === 'file') await t.test('a failed durable write publishes nothing and later writes recover', async () => {
      const before = await store.get('alice'), filename = path.join(directory, 'accounts.json'), backup = path.join(directory, 'before.json');
      const original = await readFile(filename, 'utf8');
      await rename(filename, backup); await mkdir(filename); // Force atomic replacement to fail on all platforms.
      try {
        await assert.rejects(store.saveProfile('alice', save(12)));
        assert.deepEqual(await store.get('alice'), before, 'failed save cannot appear successful to later readers');
        await assert.rejects(store.create(account('failed')));
        assert.equal(await store.get('failed'), null);
        assert.equal(await readFile(backup, 'utf8'), original);
      } finally { await rmdir(filename); await rename(backup, filename); }
      assert.equal((await readdir(directory)).filter(name => name.endsWith('.tmp')).length, 0);
      await store.saveProfile('alice', save(12));
      const reopened = await createAccountStore({ dataDir: directory });
      try { assert.deepEqual(await reopened.list(), await store.list()); }
      finally { await reopened.close(); }
    });

    if (kind === 'postgres') await t.test('a failed second friendship write rolls back the first account as well', async () => {
      await store.friendAction('alice', 'bob', 'request');
      const before = await store.list(); let updates = 0;
      pool.fail(sql => { if (sql.startsWith('UPDATE zoo_accounts') && ++updates === 2) throw new Error('injected connection error'); });
      await assert.rejects(store.friendAction('bob', 'alice', 'accept'), /injected connection error/);
      pool.fail(null);
      assert.deepEqual(await store.list(), before);
      await store.friendAction('bob', 'alice', 'accept');
      assert.deepEqual((await store.get('alice')).friends, ['bob']);
      assert.ok(pool.statements.some(sql => /ORDER BY id FOR UPDATE/.test(sql)), 'friend rows are locked in deterministic order');
      assert.ok(pool.statements.includes('ROLLBACK'));
    });

    await t.test('health checks the selected storage and all methods reject after closing', async () => {
      assert.deepEqual(await store.health(), { ok: true, kind });
      await store.close();
      await assert.rejects(store.get('alice'), /closed/);
      await assert.rejects(store.create(account('closed')), /closed/);
      await assert.rejects(store.health(), /closed/);
    });
  });
}

test('legacy accounts.json loads without changing hashes, version fields or the source file', async t => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'zoo-legacy-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const legacy = account('legacy'); delete legacy.friends; delete legacy.requests;
  const filename = path.join(directory, 'accounts.json'), original = JSON.stringify({ version: 1, accounts: [legacy] });
  await writeFile(filename, original);
  const store = await createAccountStore({ dataDir: directory });
  try { assert.deepEqual(await store.get('legacy'), { ...legacy, friends: [], requests: [] }); assert.equal(await readFile(filename, 'utf8'), original); }
  finally { await store.close(); }
  await writeFile(filename, '{broken');
  await assert.rejects(createAccountStore({ dataDir: directory }), /could not be read/);
  assert.equal(await readFile(filename, 'utf8'), '{broken', 'a corrupt database must never be overwritten automatically');
});

test('PostgreSQL import rolls back partial inserts and configured failures never create a file fallback', async t => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'zoo-pg-failure-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  await assert.rejects(createAccountStore({ dataDir: directory, databaseUrl: 'postgres://configured', pool: { query: async () => { throw new Error('database unavailable'); } } }), /database unavailable/);
  assert.deepEqual(await readdir(directory), []);
  const pool = await pgPool(), store = await createAccountStore({ pool });
  try {
    let inserts = 0;
    pool.fail(sql => { if (sql.startsWith('INSERT INTO zoo_accounts') && ++inserts === 2) throw new Error('second insert failed'); });
    await assert.rejects(store.importAccounts([account('one'), account('two')]), /second insert failed/);
    pool.fail(null);
    assert.deepEqual(await store.list(), []);
    assert.equal(await store.importAccounts([account('one'), account('two')]), 2);
    assert.ok(pool.statements.includes('LOCK TABLE zoo_accounts IN EXCLUSIVE MODE'));
    pool.fail(sql => { if (sql === 'SELECT 1') throw new Error('health unavailable'); });
    await assert.rejects(store.health(), /health unavailable/);
    pool.fail(null);
  } finally { await store.close(); }
});

test('owned PostgreSQL pools bound resources and handle idle errors without leaking connection details', async t => {
  let owned;
  // Inspect the actual pg Pool without opening a network connection. SQL
  // correctness and rollback are tested against PGlite above.
  t.mock.method(Pool.prototype, 'query', function () { owned = this; return Promise.resolve({ rows: [] }); });
  const warnings = [];
  t.mock.method(console, 'warn', (...args) => warnings.push(args.join(' ')));
  const url = 'postgres://test_user:private-test-value@unused.invalid/database?sslmode=verify-full';
  const store = await createAccountStore({ databaseUrl: url });
  try {
    assert.equal(owned.options.connectionString, url, 'SSL remains governed by the configured connection URL');
    assert.equal(owned.options.max, 5); assert.equal(owned.options.connectionTimeoutMillis, 10_000);
    assert.equal(owned.options.statement_timeout, 15_000); assert.equal(owned.options.query_timeout, 20_000);
    assert.notEqual(owned.options.ssl?.rejectUnauthorized, false);
    assert.ok(owned.listenerCount('error') > 0);
    owned.emit('error', new Error(`connection lost: ${url}`));
    assert.deepEqual(warnings, ['An idle account database connection closed.']);
    assert.deepEqual(await store.health(), { ok: true, kind: 'postgres' });
  } finally { await store.close(); }
});

test('import validation rejects invalid account revisions and detaches valid source records before connecting', () => {
  for (const revision of [-1, .5, '1', NaN, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => validateImportedAccounts([{ ...account('alice'), accountRevision: revision }]), status(400));
  }
  const original = { ...account('alice'), accountRevision: 15 }, validated = validateImportedAccounts([original]);
  assert.equal(validated[0].accountRevision, 15); validated[0].profile.name = 'Changed';
  assert.equal(original.profile.name, 'alice');
});
