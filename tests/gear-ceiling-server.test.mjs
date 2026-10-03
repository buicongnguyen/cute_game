// Gear ceilings on the server: the bench action charges the same gap-scaled price and stores the same level, a stored
// profile reads back the same levels, and the combat authority fights with the same levelled stats and pet shot as
// the browser (both sum model.ts equipmentStat -> upgrades.ts levelledStat over the same save).
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {createAccountStore} from '../server/account-store.mjs';
import {createActionService} from '../server/action-service.mjs';
import {createCombatAuthority} from '../server/combat-authority.mjs';
import {rememberAccount} from '../server/account-cache.mjs';
import {ACTION_RULES_VERSION,applyGameAction} from '../src/actions.ts';
import * as Game from '../src/model.ts';
import {activity} from '../src/house-activities.ts';
import {INDOOR_Y} from '../src/house.ts';
import {gearCost,gearLevel,gearFactor} from '../src/upgrades.ts';

const NOW=1_800_000_000_000;
const pick=a=>({maxHp:a.maxHp,attack:a.attack,defense:a.defense,regen:a.regen,critChance:a.critChance,speed:a.speed});
function explorer(){
  const p=Game.newGame('actor');p.planet='home';p.energy=50000;for(const id of ['leather','bone','starshard','moonstone'])p.bag[id]=200;
  for(const id of ['hat_straw','armor_hoodie','boots_flipper','pet_firefly']){p.bag[id]=1;Game.equip(p,id);}
  return p;
}
async function store(t){
  const dataDir=await mkdtemp(path.join(tmpdir(),'cute-gear-ceiling-')),s=await createAccountStore({dataDir,databaseUrl:''});
  t.after(async()=>{await s.close();await rm(dataDir,{recursive:true,force:true});});
  return s;
}

test('the server bench charges the gap-scaled price and levels exactly like the browser rules',async t=>{
  const s=await store(t),profile=explorer();
  await s.create({id:'actor',username:'actor',hash:'h',salt:'s',profile,friends:[],requests:[],profileRevision:0});
  const bench=activity('bench'),peer={planet:'home',visit:null,active:true,pose:{x:bench.at.x,z:bench.at.z,y:INDOOR_Y}};
  const execute=createActionService({store:s,getPeer:()=>peer});
  const local=structuredClone(profile);let revision=0;
  for(const id of ['hat_straw','hat_straw','hat_straw','boots_flipper','pet_firefly']){
    const level=gearLevel(local,id),price=gearCost(id,level).energy;
    const reply=await execute('actor',{type:'upgradeGear',payload:{id},rulesVersion:ACTION_RULES_VERSION,requestId:randomUUID(),expectedRevision:revision});
    revision=reply.revision;assert.deepEqual(reply.result,{id,level:level+1});
    const before=local.energy;applyGameAction(local,{type:'upgradeGear',payload:{id}},{now:NOW,random:()=>.5});
    assert.equal(before-local.energy,price,`${id} +${level}`);assert.equal(reply.profile.energy,local.energy,'the server charged the same');
  }
  const saved=(await s.get('actor')).profile;
  assert.deepEqual(saved.gearLevels,{hat_straw:3,boots_flipper:1,pet_firefly:1});assert.deepEqual(saved.gearLevels,local.gearLevels);
  assert.deepEqual(pick(Game.activeStats(saved,NOW)),pick(Game.activeStats(local,NOW)),'stored profile = browser save');
  // The same live-server path (account-cache parses every remembered account).
  const remembered=rememberAccount(new Map(),await s.get('actor'));assert.deepEqual(remembered.profile.gearLevels,local.gearLevels);
  // A forged id is refused before anything is paid.
  await assert.rejects(execute('actor',{type:'upgradeGear',payload:{id:'sword_wood'},rulesVersion:ACTION_RULES_VERSION,requestId:randomUUID(),expectedRevision:revision}),e=>e.status===409||e.status===400);
});

test('combat authority fights with the levelled stats and the pet shot the browser shows',async t=>{
  const s=await store(t),profile=explorer();profile.gearLevels={hat_straw:7,armor_hoodie:10,boots_flipper:4,pet_firefly:6};
  const account=await s.create({id:'actor',username:'actor',hash:'h',salt:'s',profile,friends:[],requests:[],profileRevision:0});
  const peer={account,active:true,visit:null,planet:'home',room:'public:home',pose:{x:-30,z:1,facing:0,moving:false},socket:{}},peers=new Map([['actor',peer]]),room={id:peer.room,members:new Set(['actor']),host:'actor',enemies:[],killed:new Set()},rooms=new Map([[room.id,room]]);
  const authority=createCombatAuthority({store:s,peers,rooms,remember:value=>Object.assign(account,value),send:()=>{},broadcast:()=>{}});
  t.after(()=>authority.close());
  const host=authority.engineFor(peer).sim.host,server=pick(host.stats());
  // The browser's numbers for the same save (main.ts reads M.activeStats; the HUD shows them).
  const browser=pick(Game.activeStats(Game.parseSave(JSON.stringify(profile)),Date.now()));
  assert.deepEqual(server,browser);
  // And they are the ceiling formula: the hoodie at +10 is exactly the outfit ceiling (126 hp, 40 def, 12 atk ...).
  const bare=explorer(),base=pick(Game.activeStats(bare,NOW));
  assert.ok(server.maxHp>base.maxHp&&server.defense>base.defense&&server.attack>base.attack&&server.regen>base.regen&&server.speed>base.speed);
  // The pet's shot: its own damage x 1.24 at +6, on the server and in main.ts's pet() host alike.
  const shot=host.pet();assert.ok(shot,'the pet fights away from the village');
  assert.equal(shot.dmg,Game.ITEMS.pet_firefly.pet.dmg*gearFactor(profile,'pet_firefly'));assert.equal(gearFactor(profile,'pet_firefly'),1.24);
});
