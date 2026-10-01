import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {createAccountStore} from '../server/account-store.mjs';
import {createActionService} from '../server/action-service.mjs';
import * as Game from '../src/model.ts';
import {STAR_MAP} from '../src/space.ts';

test('paid flights validate planet and dust positions, rotate dust on the server, and replay without duplicate rewards',async t=>{
  let now=1_800_000_000_000;t.mock.method(Date,'now',()=>now);
  const dir=await mkdtemp(join(tmpdir(),'zoo-flight-')),store=await createAccountStore({dataDir:dir});
  t.after(async()=>{await store.close();await rm(dir,{recursive:true,force:true});});
  const profile=Game.newGame();profile.energy=100;profile.level=20;
  await store.create({id:'pilot',username:'pilot',hash:'hash',salt:'salt',profile,friends:[],requests:[]});
  const peer={planet:'home',room:'public:home',visit:null,pose:{x:0,z:0}},execute=createActionService({store,getPeer:()=>peer});
  const job=async(type,payload={},requestId=randomUUID())=>({type,payload,requestId,expectedRevision:(await store.get('pilot')).profileRevision||0,rulesVersion:1});
  await assert.rejects(execute('pilot',await job('discover',{id:'candy',position:STAR_MAP.candy})),e=>e.status===409);
  const launch=await execute('pilot',await job('launch'));assert.equal(launch.profile.energy,80);
  const initial=await store.get('pilot'),dust=initial.flightDust[0];
  await assert.rejects(execute('pilot',await job('collectStardust',{dustId:dust.id,position:{x:0,z:0}})),e=>e.status===409);
  assert.equal((await store.get('pilot')).profile.energy,80);
  now+=5000;
  const request=await job('collectStardust',{dustId:dust.id,position:{x:dust.x,z:dust.z}}),reward=await execute('pilot',request);
  assert.equal(reward.profile.energy,83);assert.equal(reward.result.nextDust.id,dust.id);assert.notDeepEqual(reward.result.nextDust,dust);
  const replay=await execute('pilot',request);assert.equal(replay.replayed,true);assert.deepEqual(replay.result,reward.result);assert.equal(replay.profile.energy,83);
  if(Math.hypot(reward.result.nextDust.x-dust.x,reward.result.nextDust.z-dust.z)>5)await assert.rejects(execute('pilot',await job('collectStardust',{dustId:dust.id,position:dust})),e=>e.status===409);
  now+=5000;const discovered=await execute('pilot',await job('discover',{id:'candy',position:STAR_MAP.candy}));assert.ok(discovered.profile.discovered.includes('candy'));
  await assert.rejects(execute('pilot',await job('discover',{id:'shadow',position:STAR_MAP.candy})),e=>e.status===409);
  const landed=await execute('pilot',await job('travel',{id:'candy'}));assert.equal(landed.profile.planet,'candy');assert.equal(landed.profile.energy,83);
  peer.planet='candy';peer.room='public:candy';now+=5000;
  await assert.rejects(execute('pilot',await job('collectStardust',{dustId:1,position:STAR_MAP.candy})),e=>e.status===409);
});

test('new mobile preferences and two fertilizer doses on long fruit timers survive save reloads',()=>{
  const s=Game.newGame();s.settings.movePad=false;s.settings.joystickSide='right';s.level=30;s.bag.manure=2;
  Game.plant(s,0,'peach',1000);Game.fertilize(s,0,1000,'manure');
  const half=Game.parseSave(JSON.stringify(s));assert.equal(Game.cropProgress(half.plots[0],1000),.5);assert.deepEqual(half.settings,s.settings);
  Game.fertilize(half,0,1000,'manure');const ripe=Game.parseSave(JSON.stringify(half));assert.equal(Game.cropProgress(ripe.plots[0],1000),1);assert.equal(Game.harvest(ripe,0,1000),'peach');
});
