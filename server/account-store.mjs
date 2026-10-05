import { access, mkdir, open, readFile, rename, unlink } from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

const failure = (status, message) => Object.assign(new Error(message), { status });
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const clone = value => structuredClone(value);
const conflict = () => failure(409, 'A newer adventure is already saved. Reconnect to load it.');
const unavailable = () => failure(404, 'Choose another explorer.');
const tooOld = () => failure(410, 'This pending action is too old to retry safely. Check your latest adventure before trying again.');

// The old guest-note path was the only writer that could leave a compact successful receipt at revision zero.
// Discard this narrow legacy shape; never reinterpret it as a replayable game action.
function legacyGuestReceipt(receipt) {
  const reply = receipt?.reply;
  return receipt?.format === 2 && object(reply) && (reply.revision === undefined || reply.revision === 0)
    && reply.ok === true && reply.authorityVersion === 1 && reply.result === true
    && Object.keys(reply).every(key => ['ok','revision','authorityVersion','result'].includes(key));
}

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
  if (account.receiptFloor !== undefined && (!Number.isSafeInteger(account.receiptFloor) || account.receiptFloor < 0 || account.receiptFloor > (account.profileRevision || 0))) throw failure(400, 'This account needs valid action history.');
  if (account.receiptHistoryPruned !== undefined && typeof account.receiptHistoryPruned !== 'boolean') throw failure(400, 'This account needs valid action history.');
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
  const ids=new Set(accounts.map(account=>account.id)),revisions=new Map(accounts.map(account=>[account.id,account.profileRevision||0])),keys=new Set();
  return values.map(value=>{
    const receipt=json(value,'The action receipts could not be imported.');
    if(!object(receipt)||!ids.has(receipt.actorId)||typeof receipt.requestId!=='string'||!/^[a-zA-Z0-9-]{16,80}$/.test(receipt.requestId)||typeof receipt.hash!=='string'||!/^[a-f0-9]{64}$/.test(receipt.hash)||!object(receipt.reply)||receipt.reply.ok!==true||(receipt.format!==2&&!object(receipt.reply.profile))||(!legacyGuestReceipt(receipt)&&(!Number.isSafeInteger(receipt.reply.revision)||receipt.reply.revision<1)))throw failure(400,'The action receipts could not be imported.');
    if(!legacyGuestReceipt(receipt)&&receipt.reply.revision>revisions.get(receipt.actorId))throw failure(400,'The action receipts are newer than their saved account.');
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
  if(spec.originalRevision!==undefined&&(!Number.isSafeInteger(spec.originalRevision)||spec.originalRevision<0||spec.originalRevision>spec.expectedRevision))throw failure(400,'This action needs a valid request.');
  return [...new Set([spec.actorId,...(spec.relatedIds || [])])].sort();
}
/**
 * Receipts make a retried request safe (same id, same answer). A client retries only its few pending actions, so each
 * account keeps at most RECEIPT_WINDOW receipts and persists the revision through which history was removed. The
 * original revision stays bound to network request IDs across conflict retries: expired requests fail terminally,
 * rather than rebasing into a duplicate mutation. Server bookkeeping that the player never
 * reads (combat health batches, about two a second while hurt: `outbox: false`) also stays out of the account's event outbox.
 */
export const RECEIPT_WINDOW = 512;
const receiptRevision = receipt => receipt?.reply?.revision ?? 0;
const historyFloor = account => Math.max(account.receiptFloor || 0, (account.profileRevision || 0) - RECEIPT_WINDOW, 0);
/** Also bounds old keepRevision receipts. Mutates detached records only; callers publish them atomically. */
function compactReceiptHistory(accounts, values) {
  const kept = [], byActor = new Map();
  for (const receipt of values) { const group = byActor.get(receipt.actorId) || []; group.push(receipt); byActor.set(receipt.actorId, group); }
  for (const account of accounts) {
    const notes = new Set((account.outbox || []).filter(entry => entry.type === 'guestNote').map(entry => entry.id));
    const candidates = [], floor = historyFloor(account); let removedFloor = floor, removed = false;
    for (const receipt of byActor.get(account.id) || []) {
      if (legacyGuestReceipt(receipt) || receipt.actionType === 'guestNote' || notes.has(receipt.requestId)) { removed = true; continue; }
      if (receiptRevision(receipt) <= floor) { removed = true; continue; }
      candidates.push(receipt);
    }
    candidates.sort((a,b) => receiptRevision(b) - receiptRevision(a));
    for (const receipt of candidates.slice(RECEIPT_WINDOW)) { removed = true; removedFloor = Math.max(removedFloor, receiptRevision(receipt)); }
    kept.push(...candidates.slice(0,RECEIPT_WINDOW));
    if (removed || removedFloor > 0) account.receiptHistoryPruned = true;
    if (removedFloor > 0) account.receiptFloor = removedFloor;
  }
  return kept;
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
  if (spec.receipt !== false) {
    const floor = historyFloor(actor);
    if (spec.requireBoundRevision && spec.originalRevision === undefined && (floor > 0 || actor.receiptHistoryPruned)) throw failure(426,'Reconnect to use server-approved actions.');
    if ((spec.originalRevision ?? spec.expectedRevision) < floor) throw tooOld();
  }
  if ((actor.profileRevision || 0) !== spec.expectedRevision) throw conflict();
  const before = new Map([...records].map(([id,value])=>[id,JSON.stringify(value)])), profileBefore = new Map([...records].map(([id,value])=>[id,JSON.stringify(value.profile)]));
  const result = await spec.run(records);
  actor.authorityVersion = 1;
  if(spec.actionType&&spec.outbox!==false){
    actor.outbox??=[];
    actor.outbox.push({id:spec.requestId,type:spec.actionType,result:clone(result),at:Date.now()});
    actor.outbox=actor.outbox.slice(-256);
  }
  const changed = [];
  for (const [id,value] of records) {
    if (id !== actor.id && JSON.stringify(value) === before.get(id)) continue;
    // A friend's visit, water or message changes things around an account without changing its game profile. Only a changed
    // profile moves its revision: otherwise the owner's very next action (planting, say) would find the revision stale, be rejected, and be lost.
    const profileChanged = JSON.stringify(value.profile) !== profileBefore.get(id);
    if (profileChanged || (id === actor.id && !spec.keepRevision)) value.profileRevision = (value.profileRevision || 0) + 1;
    if (id === actor.id && historyFloor(value) > 0) { value.receiptFloor = historyFloor(value); value.receiptHistoryPruned = true; }
    value.accountRevision = nextAccountRevision(value);
    value.receivedAt = Date.now();
    changed.push(accountRecord(value));
  }
  const reply = {ok:true,profile:clone(actor.profile),revision:actor.profileRevision||0,authorityVersion:1,result};
  // Internal diary writes are already durable in the account; they have no client retry to acknowledge.
  const {profile,...compactReply}=reply;
  return {reply,records:changed,receipt:spec.receipt===false?null:{format:2,actorId:spec.actorId,requestId:spec.requestId,hash:spec.hash,actionType:spec.actionType,reply:compactReply}};
}

function sessionEntries(entries, now = Date.now()) {
  if (!Array.isArray(entries)) throw failure(400,'Invalid saved sessions.');
  return entries.filter(entry => {
    if (!Array.isArray(entry) || entry.length!==2 || typeof entry[0]!=='string' || !/^[a-f0-9]{64}$/.test(entry[0]) || !object(entry[1]) || typeof entry[1].id!=='string' || !entry[1].id || !Number.isSafeInteger(entry[1].expires)) throw failure(400,'Invalid saved sessions.');
    return entry[1].expires > now;
  }).map(([hash,{id,expires}]) => [hash,{id,expires}]);
}
function updateFriends(first, second, action) {
  if (!['request', 'accept', 'decline', 'remove', 'cancel'].includes(action)) throw failure(404, 'Unknown action.');
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
  else if (action === 'cancel') target.requests = target.requests.filter(id => id !== actor.id); // withdraw my own request
  else { actor.friends = actor.friends.filter(id => id !== target.id); target.friends = target.friends.filter(id => id !== actor.id); }
  actor.accountRevision = nextAccountRevision(actor); target.accountRevision = nextAccountRevision(target);
  return [actor, target];
}

async function fileStore(dataDir) {
  const directory = path.resolve(dataDir), filename = path.join(directory, 'accounts.json');
  await mkdir(directory, { recursive: true });
  let accounts = new Map(), receipts = new Map(), pending = Promise.resolve(), sessionPending = Promise.resolve(), closed = false;
  try {
    const saved = JSON.parse(await readFile(filename, 'utf8'));
    if (!object(saved) || !Array.isArray(saved.accounts)) throw new Error('Invalid account database.');
    accounts = new Map(validateImportedAccounts(saved.accounts).map(account => [account.id, account]));
    const values = [...accounts.values()], before=JSON.stringify(values), valid = validateImportedReceipts(saved.receipts || [], values);
    for (const receipt of compactReceiptHistory(values,valid)) receipts.set(`${receipt.actorId}:${receipt.requestId}`,receipt);
    if (before!==JSON.stringify(values) || valid.length!==receipts.size) await persist(accounts,receipts);
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
      if (outcome.receipt) {
        nextReceipts.set(`${outcome.receipt.actorId}:${outcome.receipt.requestId}`,outcome.receipt);
        const floor = receiptRevision(outcome.receipt) - RECEIPT_WINDOW;
        if (floor > 0) for (const [key, value] of nextReceipts) if (value.actorId === outcome.receipt.actorId && receiptRevision(value) <= floor) nextReceipts.delete(key);
      }
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
        return {value:{reply:result.reply,accounts:result.records},receipt:result.receipt,changed:result.records.length>0};
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
      const validatedReceipts=compactReceiptHistory(records,validateImportedReceipts(importedReceipts,records));
      return write(next => {
        if (next.size) throw failure(409, 'Import requires an empty account database.');
        for (const account of records) next.set(account.id, account);
        return { value: records.length, receipts:validatedReceipts };
      });
    },
    async loadSessions(now = Date.now()) {
      active(); await sessionPending;
      let saved; try { saved = JSON.parse(await readFile(path.join(directory,'sessions.json'),'utf8')); }
      catch (error) { if (error.code==='ENOENT') return []; throw error; }
      return sessionEntries(Object.entries(saved),now).filter(([,value])=>accounts.has(value.id));
    },
    saveSessions(entries) {
      active(); const valid = sessionEntries(entries), temporary = path.join(directory,`sessions.json.${randomUUID()}.tmp`);
      const result = sessionPending.catch(()=>{}).then(async()=>{
        try {
          const file=await open(temporary,'wx',0o600);
          try { await file.writeFile(JSON.stringify(Object.fromEntries(valid))); await file.sync(); } finally { await file.close(); }
          await rename(temporary,path.join(directory,'sessions.json'));
        } finally { await unlink(temporary).catch(error=>{if(error.code!=='ENOENT')throw error;}); }
      }); sessionPending=result; return result;
    },
    async health() { active(); await pending.catch(() => {}); await access(directory, constants.R_OK | constants.W_OK); return { ok: true, kind: 'file' }; },
    async close() { closed = true; await pending.catch(() => {}); await sessionPending.catch(()=>{}); },
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
  // One migration for old unbounded/zero guest receipts, not a scan of every player's history on every restart.
  try { await transaction(async client => {
    if ((await client.query("SELECT value FROM zoo_store_metadata WHERE key='receipt-bounds-v3'")).rows.length) return;
    const records=(await client.query('SELECT account FROM zoo_accounts ORDER BY id FOR UPDATE')).rows.map(row=>row.account);
    const before=new Map(records.map(value=>[value.id,JSON.stringify(value)]));
    const values=(await client.query('SELECT receipt FROM zoo_action_receipts')).rows.map(row=>row.receipt);
    const kept=compactReceiptHistory(records,validateImportedReceipts(values,records)),keys=new Set(kept.map(value=>`${value.actorId}:${value.requestId}`));
    for (const account of records) if (JSON.stringify(account)!==before.get(account.id)) await update(client,account);
    const removed=values.filter(value=>!keys.has(`${value.actorId}:${value.requestId}`));
    if (removed.length) await client.query('DELETE FROM zoo_action_receipts WHERE (actor_id,request_id) IN (SELECT * FROM unnest($1::text[],$2::text[]))',[removed.map(value=>value.actorId),removed.map(value=>value.requestId)]);
    await client.query("INSERT INTO zoo_store_metadata(key,value) VALUES('receipt-bounds-v3','true'::jsonb)");
  }); } catch (error) { if (!injectedPool) await pool.end().catch(() => {}); throw error; }
  return {
    kind: 'postgres',
    async command(spec) {
      const ids = commandSpec(spec);
      return transaction(async client => {
        const rows = (await client.query('SELECT account FROM zoo_accounts WHERE id = ANY($1::text[]) ORDER BY id FOR UPDATE',[ids])).rows;
        const receipt = (await client.query('SELECT receipt FROM zoo_action_receipts WHERE actor_id=$1 AND request_id=$2',[spec.actorId,spec.requestId])).rows[0]?.receipt;
        const result = await runCommand(spec,new Map(rows.map(row=>[row.account.id,row.account])),receipt);
        for (const account of result.records) await update(client,account);
        if (result.receipt) {
          await client.query('INSERT INTO zoo_action_receipts(actor_id,request_id,receipt) VALUES($1,$2,$3::jsonb)',[spec.actorId,spec.requestId,JSON.stringify(result.receipt)]);
          const floor = receiptRevision(result.receipt) - RECEIPT_WINDOW;
          if (floor > 0) await client.query("DELETE FROM zoo_action_receipts WHERE actor_id=$1 AND (receipt->'reply'->>'revision')::bigint <= $2",[spec.actorId,floor]);
        }
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
      const validatedReceipts=compactReceiptHistory(records,validateImportedReceipts(importedReceipts,records));
      return transaction(async client => {
        // Block concurrent inserts/updates throughout the empty check and complete import.
        await client.query('LOCK TABLE zoo_accounts IN EXCLUSIVE MODE');
        if ((await client.query('SELECT id FROM zoo_accounts LIMIT 1')).rows.length) throw failure(409, 'Import requires an empty account database.');
        for (const account of records) await insert(client, account);
        for(const receipt of validatedReceipts)await client.query('INSERT INTO zoo_action_receipts(actor_id,request_id,receipt) VALUES($1,$2,$3::jsonb)',[receipt.actorId,receipt.requestId,JSON.stringify(receipt)]);
        return records.length;
      });
    },
    async loadSessions(now = Date.now()) {
      return transaction(async client => {
        await client.query('DELETE FROM zoo_sessions WHERE expires_at <= $1',[now]);
        return (await client.query('SELECT token_hash,account_id,expires_at FROM zoo_sessions ORDER BY token_hash')).rows.map(row=>[row.token_hash,{id:row.account_id,expires:Number(row.expires_at)}]);
      });
    },
    async saveSessions(entries) {
      const valid=sessionEntries(entries);
      return transaction(async client => {
        await client.query('DELETE FROM zoo_sessions');
        if(valid.length)await client.query('INSERT INTO zoo_sessions(token_hash,account_id,expires_at) SELECT * FROM unnest($1::text[],$2::text[],$3::bigint[])',[valid.map(([hash])=>hash),valid.map(([,value])=>value.id),valid.map(([,value])=>value.expires)]);
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
