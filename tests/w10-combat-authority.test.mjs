import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createAccountStore} from '../server/account-store.mjs';
import {createCombatAuthority} from '../server/combat-authority.mjs';
import * as Game from '../src/model.ts';
import {enemyRoster} from '../src/enemy-roster.ts';

// Wave 10 review, items 12 and 13: the spawn point the server keeps, and Hard scaling that follows the room host.
async function fixture(t,difficulty='easy'){
  const dataDir=await mkdtemp(path.join(tmpdir(),'cute-w10-combat-')),store=await createAccountStore({dataDir,databaseUrl:''}),profile=Game.newGame();profile.settings.difficulty=difficulty;
  const account=await store.create({id:'host',username:'host',hash:'h',salt:'s',profile,friends:[],requests:[],profileRevision:0});
  const peer={account,active:true,visit:null,planet:'home',room:'public:home',pose:{x:-30,z:1,facing:0,moving:false},socket:{}},peers=new Map([['host',peer]]),room={id:peer.room,members:new Set(['host']),host:'host',enemies:[],killed:new Set()},rooms=new Map([[room.id,room]]);
  const authority=createCombatAuthority({store,peers,rooms,remember:v=>Object.assign(account,v),onError:()=>{},send:()=>{},broadcast:()=>{},onDeath:()=>{}});
  t.after(async()=>{await authority.close();await store.close();});
  const definition=enemyRoster('home').find(e=>e.type==='mushroom');
  return {peer,room,authority,definition,snapshot:(extra={})=>authority.acceptSnapshots(room,[{id:definition.id,type:'mushroom',x:-30,z:0,hp:1,...extra}]),enemy:()=>authority.state(room).enemies.get(definition.id)};
}

test('12. a mid-chase first sighting keeps the reported spawn (homeX/homeZ) as the rescue/respawn point',async t=>{
  const f=await fixture(t);f.snapshot({x:-30,z:0,homeX:-34,homeZ:3});
  assert.deepEqual(f.enemy().home,{x:-34,z:3},'not the chase position');
  f.snapshot({x:-31,z:0,homeX:-50,homeZ:9});assert.deepEqual(f.enemy().home,{x:-34,z:3},'taken once: later snapshots cannot move it');
});
test('12. an implausible reported spawn falls back to where the creature was first seen',async t=>{
  for(const extra of [{homeX:-30+80,homeZ:0},{homeX:Infinity,homeZ:0},{homeX:-1,homeZ:0},{}]){
    const f=await fixture(t);f.snapshot({x:-30,z:0,...extra});assert.deepEqual(f.enemy().home,{x:-30,z:0},JSON.stringify(extra));
  }
});
test('13. creatures follow the host difficulty: spawned scaled, rescaled when the host setting changes',async t=>{
  const f=await fixture(t,'hard');f.snapshot();const e=f.enemy(),base=f.definition.baseMaxHp;
  assert.equal(e.maxHp,Math.round(base*1.25));
  f.peer.account.profile.settings.difficulty='easy';e.hp=Math.round(e.maxHp/2);f.snapshot();
  assert.equal(e.maxHp,base);assert.equal(e.baseMaxHp,base);assert.ok(Math.abs(e.hp-base/2)<=1,'keeps its share of health');assert.ok(Math.abs(e.damage-f.definition.baseDamage)<1e-9);
  f.peer.account.profile.settings.difficulty='hard';f.snapshot();assert.equal(e.maxHp,Math.round(base*1.25));
});
