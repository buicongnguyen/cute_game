import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {createAccountStore,RECEIPT_WINDOW,validateImportedReceipts} from '../server/account-store.mjs';
import {createActionService,commandHash,logGuest} from '../server/action-service.mjs';
import * as Game from '../src/model.ts';

const status=n=>error=>error.status===n;
const account=id=>({id,username:id,hash:'kept-hash',salt:'kept-salt',friends:[],requests:[],profile:Game.newGame(id)});
const receipt=(revision,extra={})=>({format:2,actorId:'alice',requestId:randomUUID(),hash:commandHash({note:true}),reply:{ok:true,authorityVersion:1,result:true,...(revision===undefined?{}:{revision})},...extra});
async function fixture(t,kind,{accounts=[],receipts=[]}={}){
  const dir=await mkdtemp(path.join(os.tmpdir(),'zoo-receipt-recovery-'));
  const db=kind==='postgres'?await PGlite.create():null;
  const pool=db?{query:(sql,args)=>db.query(sql,args),async connect(){return{query:(sql,args)=>db.query(sql,args),release(){}};},async end(){}}:undefined;
  if(kind==='file')await writeFile(path.join(dir,'accounts.json'),JSON.stringify({version:2,accounts,receipts}));
  else {
    for(const sql of (await readFile(new URL('../server/schema.sql',import.meta.url),'utf8')).split('-- @statement'))if(sql.trim())await db.query(sql);
    for(const value of accounts)await db.query('INSERT INTO zoo_accounts(id,username,account) VALUES($1,$2,$3::jsonb)',[value.id,value.username,JSON.stringify(value)]);
    for(const value of receipts)await db.query('INSERT INTO zoo_action_receipts(actor_id,request_id,receipt) VALUES($1,$2,$3::jsonb)',[value.actorId,value.requestId,JSON.stringify(value)]);
  }
  let store=await createAccountStore({dataDir:dir,pool});
  t.after(async()=>{await store.close();await db?.close();await rm(dir,{recursive:true,force:true});});
  return {get store(){return store;},async reopen(){await store.close();store=await createAccountStore({dataDir:dir,pool});},async receipts(){return db?(await db.query('SELECT receipt FROM zoo_action_receipts')).rows.map(row=>row.receipt):JSON.parse(await readFile(path.join(dir,'accounts.json'),'utf8')).receipts;}};
}
const intent=(revision,type,payload,requestId=`r${revision}-${randomUUID()}`)=>({rulesVersion:1,expectedRevision:revision,requestId,type,payload});

for(const kind of ['file','postgres']){
  test(`${kind}: first and repeated guest notes persist without receipts, outbox growth or game revision conflicts`,async t=>{
    const f=await fixture(t,kind,{accounts:[account('alice')]});
    for(let i=0;i<540;i++)await f.store.command({actorId:'alice',requestId:randomUUID(),hash:commandHash({i}),expectedRevision:0,actionType:'guestNote',keepRevision:true,receipt:false,outbox:false,run:records=>{logGuest(records.get('alice'),{at:i,kind:'visit',by:'bob'});return true;}});
    await f.reopen();const saved=await f.store.get('alice');
    assert.equal(saved.profileRevision||0,0);assert.equal(saved.visitLog.length,30);assert.equal(saved.visitLog[0].at,539);
    assert.equal(saved.outbox,undefined);assert.equal(saved.hash,'kept-hash');assert.equal((await f.receipts()).length,0);
    const reply=await createActionService({store:f.store,getPeer:()=>null})('alice',intent(0,'settings',{settings:{sound:false}}));
    assert.equal(reply.revision,1,'the next ordinary action still accepts revision zero');
  });

  test(`${kind}: legacy zero/missing guest receipts recover even after their outbox entries were evicted`,async t=>{
    const alice=account('alice');alice.profileRevision=300;alice.outbox=Array.from({length:256},()=>({id:randomUUID(),type:'settings',result:true}));
    const keep=receipt(300),f=await fixture(t,kind,{accounts:[alice],receipts:[receipt(0),receipt(undefined),keep]});
    assert.deepEqual((await f.receipts()).map(value=>value.requestId),[keep.requestId]);
    assert.equal((await f.store.get('alice')).receiptHistoryPruned,true);
    await f.reopen();const saved=await f.store.get('alice');
    assert.deepEqual(saved.profile,alice.profile);assert.equal(saved.hash,alice.hash);assert.equal(saved.profileRevision,300);assert.equal(saved.receiptHistoryPruned,true);
    const execute=createActionService({store:f.store,getPeer:()=>null});
    await assert.rejects(execute('alice',intent(300,'settings',{settings:{sound:false}},randomUUID())),status(426));
    assert.equal((await execute('alice',intent(300,'settings',{settings:{sound:false}}))).revision,301);
  });

  test(`${kind}: legacy same-revision histories are bounded and remain safe after reopening`,async t=>{
    const alice=account('alice');alice.profileRevision=2;
    const f=await fixture(t,kind,{accounts:[alice],receipts:Array.from({length:650},()=>receipt(2))});
    assert.equal((await f.receipts()).length,RECEIPT_WINDOW);
    await f.reopen();const saved=await f.store.get('alice');assert.equal(saved.receiptFloor,2);assert.equal(saved.receiptHistoryPruned,true);
    const execute=createActionService({store:f.store,getPeer:()=>null});
    await assert.rejects(execute('alice',intent(2,'settings',{settings:{sound:false}},`r1-${randomUUID()}`)),status(410));
    assert.equal((await execute('alice',intent(2,'settings',{settings:{sound:false}}))).revision,3);
  });

  test(`${kind}: an evicted gift cannot run twice after a conflict rebase or server restart`,async t=>{
    const alice=account('alice'),owner=account('owner');alice.friends=['owner'];owner.friends=['alice'];alice.profile.bag.carrot=20;
    const f=await fixture(t,kind,{accounts:[alice,owner]});
    let execute=createActionService({store:f.store,getPeer:()=>null});
    const gift=intent(0,'giftFriend',{ownerId:'owner',item:'carrot',count:1});
    await execute('alice',gift);
    for(let i=1;i<=RECEIPT_WINDOW;i++)await execute('alice',intent(i,'settings',{settings:{sound:i%2===0}}));
    assert.equal((await f.receipts()).some(value=>value.requestId===gift.requestId),false);
    await f.reopen();execute=createActionService({store:f.store,getPeer:()=>null});
    assert.equal((await f.store.get('alice')).receiptFloor,1);
    await assert.rejects(execute('alice',gift),status(410));
    await assert.rejects(execute('alice',{...gift,expectedRevision:513,originalRevision:513}),status(410),'changing mutable fields cannot change the origin bound into the ID');
    await assert.rejects(execute('alice',{...gift,requestId:randomUUID(),expectedRevision:513,originalRevision:513}),status(426),'old clients cannot safely rebase an unknown pruned ID');
    assert.equal((await f.store.get('owner')).profile.chest.carrot,1);
    assert.equal((await f.store.get('alice')).profile.bag.carrot,19);
    // An ordinary recent conflict still rebases successfully and replays exactly once.
    const pending=intent(513,'giftFriend',{ownerId:'owner',item:'carrot',count:1});
    await execute('alice',intent(513,'settings',{settings:{sound:true}}));
    await assert.rejects(execute('alice',pending),status(409));
    const accepted=await execute('alice',{...pending,expectedRevision:514});assert.equal(accepted.revision,515);
    assert.equal((await execute('alice',pending)).replayed,true);
    assert.equal((await f.store.get('owner')).profile.chest.carrot,2);
  });

  test(`${kind}: a visitor from another planet can water and give gifts without changing their return planet`,async t=>{
    const alice=account('alice'),owner=account('owner'),now=Date.now();alice.friends=['owner'];owner.friends=['alice'];alice.profile.planet='candy';alice.profile.bag.carrot=2;owner.profile.level=30;
    assert.ok(Game.plant(owner.profile,0,'pumpkin',now-60_000));
    const f=await fixture(t,kind,{accounts:[alice,owner]}),peer={planet:'home',visit:'owner',pose:Game.bedPosition(owner.profile,0)};
    const execute=createActionService({store:f.store,getPeer:()=>peer});
    const watered=await execute('alice',intent(0,'waterFriend',{ownerId:'owner',index:0,generation:owner.profile.plots[0].generation}));
    assert.ok(watered.result.seconds>0);assert.equal(watered.profile.planet,'candy');
    const gift=await execute('alice',intent(1,'giftFriend',{ownerId:'owner',item:'carrot',count:1}));
    assert.equal(gift.profile.planet,'candy');assert.equal((await f.store.get('owner')).profile.chest.carrot,1);
    peer.visit=null;await assert.rejects(execute('alice',intent(2,'waterFriend',{ownerId:'owner',index:0,generation:owner.profile.plots[0].generation})),status(403));
  });
}

test('zero-revision recovery only accepts the exact old guest-note envelope',()=>{
  const alice=account('alice');
  assert.equal(validateImportedReceipts([receipt(0),receipt(undefined)],[alice]).length,2);
  for(const bad of [receipt(0,{reply:{ok:true,authorityVersion:1,result:false,revision:0}}),receipt(0,{reply:{ok:true,authorityVersion:1,result:true,revision:0,profile:{}}}),receipt(0,{hash:'bad'}),receipt(0,{actorId:'missing'}),receipt(-1)])assert.throws(()=>validateImportedReceipts([bad],[alice]),status(400));
});

test('future receipt revisions fail before recovery can overwrite the original file',async t=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'zoo-future-receipts-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 const alice=account('alice');alice.profileRevision=1;
 const original=JSON.stringify({version:2,accounts:[alice],receipts:Array.from({length:513},(_,i)=>receipt(i+2))});
 const filename=path.join(dir,'accounts.json');await writeFile(filename,original);
 await assert.rejects(createAccountStore({dataDir:dir}),/could not be read/);assert.equal(await readFile(filename,'utf8'),original);
 assert.throws(()=>validateImportedReceipts([receipt(2)],[alice]),status(400));
});

test('PostgreSQL rejects future receipts before rewriting accounts or publishing the migration marker',async t=>{
 const db=await PGlite.create();t.after(()=>db.close());
 const pool={query:(sql,args)=>db.query(sql,args),async connect(){return{query:(sql,args)=>db.query(sql,args),release(){}};},async end(){}};
 const store=await createAccountStore({pool}),alice=account('alice');alice.profileRevision=1;await store.create(alice);await store.close();
 const bad=receipt(2);await db.query('INSERT INTO zoo_action_receipts(actor_id,request_id,receipt) VALUES($1,$2,$3::jsonb)',[bad.actorId,bad.requestId,JSON.stringify(bad)]);
 await db.query('DELETE FROM zoo_store_metadata');
 await assert.rejects(createAccountStore({pool}),/newer than their saved account/);
 assert.deepEqual((await db.query('SELECT account FROM zoo_accounts')).rows[0].account,alice);
 assert.equal((await db.query('SELECT * FROM zoo_store_metadata')).rows.length,0);
 assert.equal((await db.query('SELECT * FROM zoo_action_receipts')).rows.length,1);
});
