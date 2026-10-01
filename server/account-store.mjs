import { access, mkdir, open, readFile, rename, unlink } from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

const failure = (status, message) => Object.assign(new Error(message), { status });
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const clone = value => structuredClone(value);
const conflict = () => failure(409, 'A newer adventure is already saved. Reconnect to load it.');
const unavailable = () => failure(404, 'Choose another explorer.');

function json(value, message) {
  try { return JSON.parse(JSON.stringify(value)); }
  catch { throw failure(400, message); }
}
function accountRecord(value) {
  const account = json(value, 'This account could not be saved.');
  if (!object(account) || typeof account.id !== 'string' || !account.id || account.id.length > 128 ||
      typeof account.username !== 'string' || !/^[a-z0-9_]{3,24}$/.test(account.username) ||
      typeof account.hash !== 'string' || !account.hash || typeof account.salt !== 'string' || !account.salt || !object(account.profile)) {
    throw failure(400, 'This account could not be saved.');
  }
  for (const key of ['friends', 'requests']) {
    account[key] ??= [];
    if (!Array.isArray(account[key]) || account[key].some(id => typeof id !== 'string' || !id)) throw failure(400, 'This account could not be saved.');
  }
  if (account.profileRevision !== undefined && (!Number.isSafeInteger(account.profileRevision) || account.profileRevision < 0)) throw failure(400, 'This save needs a valid revision.');
  if (account.accountRevision !== undefined && (!Number.isSafeInteger(account.accountRevision) || account.accountRevision < 0)) throw failure(400, 'This account needs a valid revision.');
  return account;
}
/** Validate the complete import before opening a destination connection. Returns detached JSON records. */
export function validateImportedAccounts(accounts) {
  if (!Array.isArray(accounts)) throw failure(400, 'Please provide an account array to import.');
  const records = accounts.map(accountRecord), ids = new Set(), usernames = new Set();
  for (const account of records) {
    if (ids.has(account.id) || usernames.has(account.username)) throw failure(409, 'The import contains duplicate accounts.');
    ids.add(account.id); usernames.add(account.username);
  }
  return records;
}
export function validateImportedReceipts(values, accounts) {
  if(!Array.isArray(values))throw failure(400,'The action receipts could not be imported.');
  const ids=new Set(accounts.map(account=>account.id)),keys=new Set();
  return values.map(value=>{
    const receipt=json(value,'The action receipts could not be imported.');
    if(!object(receipt)||!ids.has(receipt.actorId)||typeof receipt.requestId!=='string'||!/^[a-zA-Z0-9-]{16,80}$/.test(receipt.requestId)||typeof receipt.hash!=='string'||!/^[a-f0-9]{64}$/.test(receipt.hash)||!object(receipt.reply)||receipt.reply.ok!==true||(receipt.format!==2&&!object(receipt.reply.profile))||!Number.isSafeInteger(receipt.reply.revision)||receipt.reply.revision<1)throw failure(400,'The action receipts could not be imported.');
    const key=`${receipt.actorId}:${receipt.requestId}`;if(keys.has(key))throw failure(409,'The import contains duplicate action receipts.');keys.add(key);return receipt;
  });
}
function nextAccountRevision(account) {
  const revision = account.accountRevision ?? 0;
  if (!Number.isSafeInteger(revision) || revision < 0 || revision === Number.MAX_SAFE_INTEGER) throw failure(409, 'This account revision cannot be advanced.');
  return revision + 1;
}
function profileUpdate(value) {
  if (!object(value) || !object(value.profile)) throw failure(400, 'This adventure could not be saved.');
  if (!Number.isSafeInteger(value.revision) || value.revision < 1 || typeof value.mutation !== 'string' || !/^[a-zA-Z0-9-]{16,80}$/.test(value.mutation)) throw failure(400, 'This save needs a valid revision.');
  const receivedAt = value.receivedAt ?? Date.now();
  if (!Number.isSafeInteger(receivedAt) || receivedAt < 0) throw failure(400, 'This save needs a valid timestamp.');
  return { profile: json(value.profile, 'This adventure could not be saved.'), revision: value.revision, mutation: value.mutation, receivedAt };
}
function updateProfile(account, update) {
  if (!account) throw failure(404, 'That account was not found.');
  if (account.authorityVersion) throw failure(409, 'Reconnect to use server-approved actions.');
  if (account.lastMutation === update.mutation) return { account, replayed: true };
  if (update.revision <= (account.profileRevision || 0)) throw conflict();
  return { account: { ...account, profile: update.profile, profileRevision: update.revision, lastMutation: update.mutation, receivedAt: update.receivedAt, accountRevision: nextAccountRevision(account) }, replayed: false };
}
function commandSpec(spec) {
  if (!object(spec) || typeof spec.actorId !== 'string' || typeof spec.requestId !== 'string' || !/^[a-zA-Z0-9-]{16,80}$/.test(spec.requestId) || typeof spec.hash !== 'string' || !/^[a-f0-9]{64}$/.test(spec.hash) || !Number.isSafeInteger(spec.expectedRevision) || spec.expectedRevision < 0 || typeof spec.run !== 'function') throw failure(400,'This action needs a valid request.');
  if(spec.checkAccess!==undefined&&typeof spec.checkAccess!=='function')throw failure(400,'This action needs a valid request.');
  return [...new Set([spec.actorId,...(spec.relatedIds || [])])].sort();
}
async function runCommand(spec, records, receipt) {
  // Access may have been revoked while the request waited for a database lock.
  spec.checkAccess?.();
  const actor = records.get(spec.actorId);
  if (!actor) throw failure(404,'That account was not found.');
  if (receipt) {
    if (receipt.hash !== spec.hash) throw failure(409,'That request was already used for another action.');
    return { reply: {...receipt.reply,profile:clone(actor.profile),revision:actor.profileRevision||0,actionRevision:receipt.reply.revision,replayed:true}, records:[], receipt:null };
  }
  if ((actor.profileRevision || 0) !== spec.expectedRevision) throw conflict();
  const before = new Map([...records].map(([id,value])=>[id,JSON.stringify(value)]));
  const result = await spec.run(records);
  actor.authorityVersion = 1;
  if(spec.actionType){
    actor.outbox??=[];
    actor.outbox.push({id:spec.requestId,type:spec.actionType,result:clone(result),at:Date.now()});
    actor.outbox=actor.outbox.slice(-256);
  }
  const changed = [];
  for (const [id,value] of records) if (id === actor.id || JSON.stringify(value) !== before.get(id)) {
    value.profileRevision = (value.profileRevision || 0) + 1;
    value.accountRevision = nextAccountRevision(value);
    value.receivedAt = Date.now();
    changed.push(accountRecord(value));
  }
  const reply = {ok:true,profile:clone(actor.profile),revision:actor.profileRevision,authorityVersion:1,result};
  // Keep the committed random outcome forever without copying a complete farm/save on every click.
  const {profile,...compactReply}=reply;
  return {reply,records:changed,receipt:{format:2,actorId:spec.actorId,requestId:spec.requestId,hash:spec.hash,reply:compactReply}};
}
function updateFriends(first, second, action) {
  if (!['request', 'accept', 'decline', 'remove'].includes(action)) throw failure(404, 'Unknown action.');
  if (!first || !second || first.id === second.id) throw unavailable();
  const actor = clone(first), target = clone(second);
  if (action === 'request') {
    if (actor.friends.includes(target.id)) throw failure(409, 'You are already friends.');
    if (!target.requests.includes(actor.id)) target.requests.push(actor.id);
  } else if (action === 'accept') {
    if (!actor.requests.includes(target.id)) throw failure(400, 'That friend request is no longer available.');
    actor.requests = actor.requests.filter(id => id !== target.id); target.requests = target.requests.filter(id => id !== actor.id);
    if (!actor.friends.includes(target.id)) actor.friends.push(target.id);
    if (!target.friends.includes(actor.id)) target.friends.push(actor.id);
  } else if (action === 'decline') actor.requests = actor.requests.filter(id => id !== target.id);
  else { actor.friends = actor.friends.filter(id => id !== target.id); target.friends = target.friends.filter(id => id !== actor.id); }
  actor.accountRevision = nextAccountRevision(actor); target.accountRevision = nextAccountRevision(target);
  return [actor, target];
}

async function fileStore(dataDir) {
  const directory = path.resolve(dataDir), filename = path.join(directory, 'accounts.json');
  await mkdir(directory, { recursive: true });
  let accounts = new Map(), receipts = new Map(), pending = Promise.resolve(), closed = false;
  try {
    const saved = JSON.parse(await readFile(filename, 'utf8'));
    if (!object(saved) || !Array.isArray(saved.accounts)) throw new Error('Invalid account database.');
    accounts = new Map(validateImportedAccounts(saved.accounts).map(account => [account.id, account]));
    for (const receipt of validateImportedReceipts(saved.receipts || [],[...accounts.values()])) receipts.set(`${receipt.actorId}:${receipt.requestId}`,receipt);
  } catch (error) {
    if (error.code !== 'ENOENT') throw new Error('The account database could not be read. It has not been overwritten.', { cause: error });
  }
  function active() { if (closed) throw new Error('The account store is closed.'); }
  async function persist(next, nextReceipts = receipts) {
    const temporary = path.join(directory, `accounts.json.${randomUUID()}.tmp`);
    try {
      const file = await open(temporary, 'wx', 0o600);
      try { await file.writeFile(JSON.stringify({ version: 2, accounts: [...next.values()], receipts:[...nextReceipts.values()] })); await file.sync(); }
      finally { await file.close(); }
      await rename(temporary, filename);
    } finally { await unlink(temporary).catch(error => { if (error.code !== 'ENOENT') throw error; }); }
  }
  function write(operation) {
    active();
    const result = pending.catch(() => {}).then(async () => {
      const next = new Map(accounts), outcome = await operation(next);
      const nextReceipts = new Map(receipts);
      if (outcome.receipt) nextReceipts.set(`${outcome.receipt.actorId}:${outcome.receipt.requestId}`,outcome.receipt);
      for(const receipt of outcome.receipts||[])nextReceipts.set(`${receipt.actorId}:${receipt.requestId}`,receipt);
      // Publish only after the complete replacement has been written and renamed.
      if (outcome.changed !== false) { await persist(next,nextReceipts); accounts = next; receipts = nextReceipts; }
      return clone(outcome.value);
    });
    pending = result; return result;
  }
  async function read(operation) { active(); await pending.catch(() => {}); return clone(operation()); }
  return {
    kind: 'file',
    async command(spec) {
      const ids = commandSpec(spec);
      return write(async next => {
        const records = new Map(ids.filter(id=>next.has(id)).map(id=>[id,clone(next.get(id))]));
        const result = await runCommand(spec,records,receipts.get(`${spec.actorId}:${spec.requestId}`));
        for (const value of result.records) next.set(value.id,value);
        return {value:{reply:result.reply,accounts:result.records},receipt:result.receipt,changed:!!result.receipt};
      });
    },
    list: () => read(() => [...accounts.values()]),
    get: id => read(() => accounts.get(id) ?? null),
    findByUsername: username => read(() => [...accounts.values()].find(account => account.username === username) ?? null),
    async create(value) {
      const account = accountRecord(value);
      return write(next => {
        if ([...next.values()].some(value => value.username === account.username)) throw failure(409, 'That username is already taken.');
        if (next.has(account.id)) throw failure(409, 'That account already exists.');
        next.set(account.id, account); return { value: account };
      });
    },
    async saveProfile(id, value) {
      const update = profileUpdate(value);
      return write(next => {
        const result = updateProfile(next.get(id), update);
        if (!result.replayed) next.set(id, result.account);
        return { value: result, changed: !result.replayed };
      });
    },
    async friendAction(actorId, targetId, action, checkAccess) {
      return write(next => {
        checkAccess?.();
        const pair = updateFriends(next.get(actorId), next.get(targetId), action);
        for (const account of pair) next.set(account.id, account);
        return { value: pair };
      });
    },
    async importAccounts(values, importedReceipts=[]) {
      const records = validateImportedAccounts(values);
      const validatedReceipts=validateImportedReceipts(importedReceipts,records);
      return write(next => {
        if (next.size) throw failure(409, 'Import requires an empty account database.');
        for (const account of records) next.set(account.id, account);
        return { value: records.length, receipts:validatedReceipts };
      });
    },
    async health() { active(); await pending.catch(() => {}); await access(directory, constants.R_OK | constants.W_OK); return { ok: true, kind: 'file' }; },
    async close() { closed = true; await pending.catch(() => {}); },
  };
}

function databaseError(error) {
  if (error.code === '23505') return failure(409, error.constraint === 'zoo_accounts_pkey' ? 'That account already exists.' : 'That username is already taken.');
  return error;
}
async function postgresStore(databaseUrl, injectedPool) {
  // Keep SSL policy in the connection URL. In particular, never disable certificate verification here.
  const pool = injectedPool ?? new (await import('pg')).Pool({
    connectionString: databaseUrl, max: 5, connectionTimeoutMillis: 10_000,
    statement_timeout: 15_000, query_timeout: 20_000,
  });
  // pg emits idle connection failures outside query promises (for example when
  // a hosted database suspends). Handle the event without logging credentials.
  if (!injectedPool) pool.on('error', () => console.warn('An idle account database connection closed.'));
  let closed = false;
  try { for(const statement of (await readFile(new URL('./schema.sql', import.meta.url), 'utf8')).split('-- @statement')) if(statement.trim()) await pool.query(statement); }
  catch (error) { if (!injectedPool) await pool.end().catch(() => {}); throw error; }
  function active() { if (closed) throw new Error('The account store is closed.'); }
  async function transaction(operation) {
    active(); const client = await pool.connect();
    try { await client.query('BEGIN'); const value = await operation(client); await client.query('COMMIT'); return clone(value); }
    catch (error) { await client.query('ROLLBACK').catch(() => {}); throw databaseError(error); }
    finally { client.release(); }
  }
  async function query(sql, params) { active(); return pool.query(sql, params); }
  const insert = (client, account) => client.query('INSERT INTO zoo_accounts (id, username, account) VALUES ($1, $2, $3::jsonb)', [account.id, account.username, JSON.stringify(account)]);
  const update = (client, account) => client.query('UPDATE zoo_accounts SET account = $2::jsonb WHERE id = $1', [account.id, JSON.stringify(account)]);
  return {
    kind: 'postgres',
    async command(spec) {
      const ids = commandSpec(spec);
      return transaction(async client => {
        const rows = (await client.query('SELECT account FROM zoo_accounts WHERE id = ANY($1::text[]) ORDER BY id FOR UPDATE',[ids])).rows;
        const receipt = (await client.query('SELECT receipt FROM zoo_action_receipts WHERE actor_id=$1 AND request_id=$2',[spec.actorId,spec.requestId])).rows[0]?.receipt;
        const result = await runCommand(spec,new Map(rows.map(row=>[row.account.id,row.account])),receipt);
        for (const account of result.records) await update(client,account);
        if (result.receipt) await client.query('INSERT INTO zoo_action_receipts(actor_id,request_id,receipt) VALUES($1,$2,$3::jsonb)',[spec.actorId,spec.requestId,JSON.stringify(result.receipt)]);
        return {reply:result.reply,accounts:result.records};
      });
    },
    async list() { return clone((await query('SELECT account FROM zoo_accounts ORDER BY id')).rows.map(row => row.account)); },
    async get(id) { return clone((await query('SELECT account FROM zoo_accounts WHERE id = $1', [id])).rows[0]?.account ?? null); },
    async findByUsername(username) { return clone((await query('SELECT account FROM zoo_accounts WHERE username = $1', [username])).rows[0]?.account ?? null); },
    async create(value) { const account = accountRecord(value); return transaction(async client => { await insert(client, account); return account; }); },
    async saveProfile(id, value) {
      const profile = profileUpdate(value);
      return transaction(async client => {
        const account = (await client.query('SELECT account FROM zoo_accounts WHERE id = $1 FOR UPDATE', [id])).rows[0]?.account;
        const result = updateProfile(account, profile);
        if (!result.replayed) await update(client, result.account);
        return result;
      });
    },
    async friendAction(actorId, targetId, action, checkAccess) {
      return transaction(async client => {
        // All callers lock pairs in the same order, including opposite-direction friend requests.
        const rows = (await client.query('SELECT account FROM zoo_accounts WHERE id = ANY($1::text[]) ORDER BY id FOR UPDATE', [[actorId, targetId]])).rows;
        checkAccess?.();
        const pair = updateFriends(rows.find(row => row.account.id === actorId)?.account, rows.find(row => row.account.id === targetId)?.account, action);
        for (const account of pair) await update(client, account);
        return pair;
      });
    },
    async importAccounts(values, importedReceipts=[]) {
      const records = validateImportedAccounts(values);
      const validatedReceipts=validateImportedReceipts(importedReceipts,records);
      return transaction(async client => {
        // Block concurrent inserts/updates throughout the empty check and complete import.
        await client.query('LOCK TABLE zoo_accounts IN EXCLUSIVE MODE');
        if ((await client.query('SELECT id FROM zoo_accounts LIMIT 1')).rows.length) throw failure(409, 'Import requires an empty account database.');
        for (const account of records) await insert(client, account);
        for(const receipt of validatedReceipts)await client.query('INSERT INTO zoo_action_receipts(actor_id,request_id,receipt) VALUES($1,$2,$3::jsonb)',[receipt.actorId,receipt.requestId,JSON.stringify(receipt)]);
        return records.length;
      });
    },
    async health() { await query('SELECT 1'); return { ok: true, kind: 'postgres' }; },
    async close() { if (!closed) { closed = true; await pool.end(); } },
  };
}

/** DATABASE_URL is selected by the caller; configured database failures never fall back to local files. */
export async function createAccountStore({ dataDir = path.resolve('data'), databaseUrl, pool } = {}) {
  return databaseUrl || pool ? postgresStore(databaseUrl, pool) : fileStore(dataDir);
}
