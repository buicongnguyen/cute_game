import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createAccountStore} from '../server/account-store.mjs';
import {createCombatAuthority} from '../server/combat-authority.mjs';
import {createColossusAuthority} from '../server/colossus-authority.mjs';
import * as Game from '../src/model.ts';
import {COLOSSUS_ID,COLOSSUS_STATS} from '../src/colossus-content.ts';
import {beginColossusAttack,colossusTelegraphs,headPoint} from '../src/colossus-patterns.ts';

const T0=Date.parse('2026-10-06T13:00:05Z');
const windowAt=(phase,day=7)=>()=>({phase,day,startsAt:T0-5000,endsAt:T0+3595000,left:1000});
function rig(phase='active'){
 let clock=windowAt(phase);const sent=[],broadcasts=[],hurts=[],trueHurts=[];
 const peer={account:{id:'p1',profile:{...Game.newGame(),hp:500,gear:{outfit:'armor_leaf'}}},pose:{x:70,z:4},socket:{},planet:'home'};
 const peers=new Map([['p1',peer]]),home={id:'public:home',members:new Set(['p1'])},lava={id:'public:lava',members:new Set()},s={enemies:new Map()},sl={enemies:new Map()};
 const authority=createColossusAuthority({peers,send:(_,m)=>sent.push(m),broadcast:(room,m)=>broadcasts.push({room:room.id,...m}),clock:now=>clock(now),random:()=>.1});
 authority.setMaxHp(p=>Game.maxHp(p.account.profile));
 const step=(seconds,room=home,state=s)=>{for(let t=0;t<seconds;t+=.05)authority.tick(room,state,.05,{targets:()=>[peer],hurt:(p,multiplier,factor,roll)=>{hurts.push({multiplier,factor,roll});return true;},hurtTrue:(p,amount)=>trueHurts.push(amount),now:T0+t*1000});};
 return {authority,peer,home,lava,s,sl,sent,broadcasts,hurts,trueHurts,step,setClock:c=>{clock=c;}};
}
test('the server wakes one shared-health Colossus in each home room during the window, and only tells other rooms it is up',()=>{
 const r=rig();r.step(.1);
 const enemy=r.s.enemies.get(COLOSSUS_ID);assert.ok(enemy);assert.equal(enemy.hp,COLOSSUS_STATS.hp);assert.equal(enemy.boss,true);assert.equal(enemy.roster.xp,COLOSSUS_STATS.xp);
 const state=r.broadcasts.find(m=>m.room==='public:home'&&m.type==='colossus');assert.equal(state.on,true);assert.equal(state.hp,COLOSSUS_STATS.hp);assert.equal(state.killed,false);
 r.step(.3,r.lava,r.sl);assert.equal(r.sl.enemies.size,0,'never spawned on another planet');
 const far=r.broadcasts.find(m=>m.room==='public:lava');assert.equal(far.on,true);assert.equal(far.hp,undefined);
});
test('it attacks the explorers in reach through 75% of their defence, with its round-robin skills and status effects',()=>{
 const r=rig();r.step(7);
 const attack=r.broadcasts.filter(m=>m.type==='colossus'&&m.attacks?.length).at(-1);assert.ok(attack,'attack state is shipped to the room');
 assert.ok(r.hurts.length>=1,'the stomp landed');assert.equal(r.hurts[0].multiplier,2,'the foot itself');
 assert.deepEqual(r.sent.find(m=>m.type==='colossusHit'),{type:'colossusHit',effect:'crack',x:70,z:4},'a 35% roll (0.1 here) cracks worn armour');
 assert.ok(r.authority.effects.get('p1').crackUntil>T0);
});
test('a lowered head takes ×2.5 from an explorer standing by it; elsewhere ×1',()=>{
 const r=rig();r.step(.1);const enemy=r.s.enemies.get(COLOSSUS_ID),c=r.authority.record(r.home),source={x:enemy.x,z:enemy.z,facing:c.facing};
 const bite=beginColossusAttack('bite',source,colossusTelegraphs('bite',source,{x:66,z:0}));bite.age=bite.windup*.8;c.attacks=[bite];
 const head=headPoint(source,bite,false);
 assert.equal(r.authority.incoming(r.home,enemy,{pose:head},100),250);
 assert.equal(r.authority.incoming(r.home,enemy,{pose:{x:head.x+40,z:head.z}},100),100);
 assert.equal(r.authority.incoming(r.home,{type:'bear'},{pose:head},100),100,'only the Colossus has the weak point');
});
test('once killed it stays down for the day, leaves at the end of the window and wakes again the next day',()=>{
 const r=rig();r.step(.1);r.s.enemies.get(COLOSSUS_ID).hp=0;r.step(.2);
 assert.equal(r.authority.record(r.home).killedDay,7);assert.equal(r.broadcasts.filter(m=>m.room==='public:home').at(-1).killed,true);
 r.s.enemies.delete(COLOSSUS_ID);r.step(.2);assert.equal(r.s.enemies.has(COLOSSUS_ID),false,'no second Colossus the same day');
 r.setClock(windowAt('active',8));r.step(.1);assert.equal(r.s.enemies.get(COLOSSUS_ID)?.hp,COLOSSUS_STATS.hp,'tomorrow it is back');
 r.setClock(windowAt('idle',8));r.step(.1);assert.equal(r.s.enemies.has(COLOSSUS_ID),false);assert.equal(r.broadcasts.at(-1).on,false);
});
test('the kill commits through the combat authority: helpers get its loot and the final blow the companion',async t=>{
 const dataDir=await mkdtemp(path.join(tmpdir(),'cute-colossus-')),store=await createAccountStore({dataDir,databaseUrl:''}),profile=Game.newGame();profile.level=30;
 const account=await store.create({id:'actor',username:'actor',hash:'h',salt:'s',profile,friends:[],requests:[],profileRevision:0});
 const peer={account,active:true,visit:null,planet:'home',room:'public:home',pose:{x:72,z:0,facing:Math.PI/2,moving:false},socket:{}},peers=new Map([['actor',peer]]),room={id:'public:home',members:new Set(['actor']),host:'actor',enemies:[],killed:new Set()},rooms=new Map([[room.id,room]]);
 const messages=[];const remember=value=>{Object.assign(account,value);return account;};
 const authority=createCombatAuthority({store,peers,rooms,remember,onError:e=>t.diagnostic(String(e.stack)),send:(_,m)=>messages.push(structuredClone(m)),broadcast:(_,m)=>messages.push(structuredClone(m)),colossusClock:now=>({phase:'active',day:3,startsAt:now-1000,endsAt:now+3600000,left:3600000})});
 t.after(async()=>{await authority.close();await store.close();});
 let enemy;for(let i=0;i<60&&!enemy;i++){await new Promise(r=>setTimeout(r,25));enemy=authority.state(room).enemies.get(COLOSSUS_ID);}
 assert.ok(enemy,'spawned by the server tick');enemy.hp=3;
 authority.basic(peer,COLOSSUS_ID);
 let saved;for(let i=0;i<120&&!saved;i++){await new Promise(r=>setTimeout(r,25));saved=messages.find(m=>m.type==='profile'&&m.profile.bag.pet_colossus===1);}
 assert.ok(saved,'the final blow banks the companion');assert.ok(saved.profile.xp>0||saved.profile.level>30);
 assert.ok(messages.some(m=>m.type==='defeat'&&m.id===COLOSSUS_ID&&m.by.includes('actor')));
 assert.ok(messages.some(m=>m.type==='colossus'&&m.finalBlow===true));
 assert.ok(messages.some(m=>m.type==='dropSpawn'&&m.drop.item==='colossus_shard'),'its spoils drop for the helper');
});
