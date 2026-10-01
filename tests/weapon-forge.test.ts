import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as M from '../src/model.ts';
function equipped(){const s=M.newGame();s.level=7;s.attackUp=2;s.energy=100_000;s.bag={sword_wood:2,rod:1,bone:1000,leather:1000,starshard:1000,moonstone:1000,firecore:1000};M.equip(s,'sword_wood');return s;}
test('forging costs match level thresholds, exclude rods, and never exceed +15',()=>{
  assert.deepEqual(M.forgeCost(0),{energy:80,materials:{bone:4,leather:4,starshard:1}});
  assert.deepEqual(M.forgeCost(5),{energy:380,materials:{bone:14,leather:14,starshard:2,moonstone:1}});
  assert.deepEqual(M.forgeCost(10),{energy:680,materials:{bone:24,leather:24,starshard:4,moonstone:2,firecore:2}});
  const s=equipped();assert.equal(M.canForge(s,'rod'),false);assert.equal(M.canForge(s,'missing'),false);
  for(let i=1;i<=15;i++){assert.equal(M.forgeWeapon(s,'sword_wood',()=>0)?.level,i);assert.equal(s.bag.sword_wood,2);}
  const before=structuredClone(s);assert.equal(M.forgeWeapon(s,'sword_wood',()=>0),null);assert.deepEqual(s,before);
});
test('the 30% boundary consumes one full cost on failure without downgrading; invalid RNG and missing resources do not mutate',()=>{
  const s=equipped();assert.equal(M.forgeWeapon(s,'sword_wood',()=>.299999)?.success,true);const cost=M.forgeCost(1),energy=s.energy;
  const outcome=M.forgeWeapon(s,'sword_wood',()=>.3);assert.equal(outcome?.success,false);assert.equal(M.forgeLevel(s,'sword_wood'),1);assert.equal(s.energy,energy-cost.energy);
  for(const value of [NaN,Infinity,-.1,1]){const before=structuredClone(s);assert.equal(M.forgeWeapon(s,'sword_wood',()=>value),null);assert.deepEqual(s,before);}
  delete s.bag.bone;const before=structuredClone(s);assert.equal(M.forgeWeapon(s,'sword_wood',()=>0),null);assert.deepEqual(s,before);
});
test('enhancement is shared by copies and multiplies the complete pre-buff attack exactly once across reloads',()=>{
  const s=equipped(),now=1_000_000,base=M.attack(s,now);s.forge={sword_wood:15};M.addBuff(s,{atk:.25,time:60},'test',now);
  assert.equal(M.attack(s,now),base*1.15*1.25);
  const again=M.parseSave(JSON.stringify(M.parseSave(JSON.stringify(s))))!;assert.equal(M.attack(again,now),base*1.15*1.25);
  assert.equal(again.bag.sword_wood,2);assert.equal(M.forgeLevel(again,'sword_wood'),15);
  assert.deepEqual(M.parseForge({sword_wood:16,rod:15,sword_lava:1.5,unknown:10}),{});
});
test('crop migration preserves old deadlines and generation once; new plantings receive new durations and identities',()=>{
  const old=JSON.parse(JSON.stringify(M.newGame()));old.contentVersion=2;old.plots[0]={crop:'carrot',plantedAt:1_000_000};old.bag={carrot:4};old.energy=123;
  let s=M.parseSave(JSON.stringify(old))!;assert.equal(s.contentVersion,3);assert.equal(s.plots[0].growDuration,10_000);assert.equal(M.cropProgress(s.plots[0],1_005_000),.5);
  const generation=s.plots[0].generation;s=M.parseSave(JSON.stringify(s))!;assert.equal(s.plots[0].generation,generation);assert.equal(s.plots[0].growDuration,10_000);
  assert.equal(s.bag.carrot,4);assert.equal(s.energy,123);assert.equal(M.harvest(s,0,1_010_000),'carrot');
  assert.ok(M.plant(s,0,'carrot',1_010_000));assert.equal(s.plots[0].growDuration,100_000);assert.notEqual(s.plots[0].generation,generation);
});
