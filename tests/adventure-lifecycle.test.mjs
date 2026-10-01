import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {newGame} from '../src/model.ts';
import {createAccountStore} from '../server/account-store.mjs';
import {createActionService} from '../server/action-service.mjs';

test('starting a new adventure clears previous drops, resource strikes, casts and rides but retains theft allowance',async t=>{
  const dir=await mkdtemp(join(tmpdir(),'zoo-reset-review-')),store=await createAccountStore({dataDir:dir});
  t.after(async()=>{await store.close();await rm(dir,{recursive:true,force:true});});
  const now=Date.now(),profile=newGame();profile.bag.carrot=5;
  const allowance={friend:{day:new Date(now).toISOString().slice(0,10),count:6}};
  await store.create({id:'alice',username:'alice',hash:'test',salt:'test',profile,friends:[],requests:[],theftLedger:allowance,
    drops:[{id:'old',item:'carrot',count:9,planet:'home',room:'public:home',space:'home:alice',x:0,z:0,owner:'alice',ownerId:'alice',releaseAt:0,expiresAt:now+30000}],
    resourceHits:{'lava:cave-gate':{hits:7,at:now}},fishingTicket:{id:'cast'},journeyPaid:true,flightDust:[{id:1}],flightPoint:{x:0,z:0},rideUntil:now+45000,ridePlanet:'ocean',mysteryReadyAt:{pond:now+90000}});
  const peer={planet:'home',room:'public:home',pose:{x:0,z:0}},execute=createActionService({store,getPeer:()=>peer});
  const act=async(type,payload={})=>execute('alice',{type,payload,rulesVersion:1,expectedRevision:(await store.get('alice')).profileRevision||0,requestId:randomUUID()});
  const result=await act('reset');assert.deepEqual(result.profile.bag,{});
  const current=await store.get('alice');assert.equal(current.adventureEpoch,1);assert.equal(current.lifeEpoch,1);assert.equal(current.journeyPaid,false);assert.deepEqual(current.theftLedger,allowance);
  for(const field of ['drops','resourceHits','fishingTicket','flightDust','flightPoint','rideUntil','ridePlanet','mysteryReadyAt'])assert.equal(Object.hasOwn(current,field),false,field);
  await assert.rejects(act('claimDrop',{id:'old',ownerId:'alice'}),error=>error.status===409);
  await assert.rejects(act('travel',{id:'candy'}),error=>error.status===409);
});
