import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as M from '../src/model.ts';
const fruits = [
  ['apple',3,8,400,600],['grape',5,8,450,700],['mango',7,8,500,800],['pineapple',9,12,750,1200],
  ['coconut',11,12,800,1300],['durian',14,12,950,1500],['lychee',16,14,1100,1800],['peach',18,14,1400,2200],
] as const;
test('eight long fruits have real-hour timing, reference rewards, no seed and matching cooked catalog entries',()=>{
  assert.equal(M.LEGACY_CROP_IDS.length,19);assert.equal(Object.keys(M.CROPS).length,27);
  for(const [id,level,hours,xp,sell] of fruits){
    assert.deepEqual([M.CROPS[id].level,M.CROPS[id].duration,M.CROPS[id].xp,M.ITEMS[id].sell],[level,hours*3600_000,xp,sell]);
    assert.equal(M.CROPS[id].seed,undefined);assert.equal(M.ITEMS['cooked_'+id].base,id);
  }
  assert.equal(M.ITEMS.apple.heal,120);assert.equal(M.ITEMS.coconut.heal,400);assert.equal(M.ITEMS.peach.heal,9999);
  assert.equal(M.ITEMS.grape.heal,708,'reference fallback healing uses the final sale energy');
  assert.deepEqual(M.ITEMS.peach.buff,{atk:.2,def:15,regen:5,xp:.5,time:300});
});
test('original crops receive exactly one growth and reward scaling; reloading never multiplies inventory or EXP',()=>{
  assert.deepEqual([M.CROPS.carrot.duration,M.CROPS.carrot.xp,M.ITEMS.carrot.sell],[100_000,12,9]);
  assert.deepEqual([M.CROPS.radish.duration,M.CROPS.radish.xp,M.ITEMS.radish.sell],[150_000,18,12]);
  assert.equal(M.ITEMS.carrot.heal,11);assert.equal(M.ITEMS.cooked_carrot.heal,22);
  const s=M.newGame();s.bag.carrot=4;s.xp=3;s.energy=27;
  const r=M.parseSave(JSON.stringify(M.parseSave(JSON.stringify(s))))!;
  assert.equal(r.bag.carrot,4);assert.equal(r.xp,3);assert.equal(r.energy,27);
});
test('new fruit crops remain single harvests, refuse fertilizer and ripen on their original timer',()=>{
  for(const [id,level] of fruits){
    const s=M.newGame();s.level=level;s.bag.manure=2;const at=1_000_000;
    assert.ok(M.plant(s,0,id,at));assert.equal(M.cropProgress(s.plots[0],at+M.CROPS[id].duration-1)<1,true);
    assert.equal(M.fertilize(s,0,at,'manure'),false);assert.equal(s.bag.manure,2,'a refused dose is not spent');assert.equal(M.cropProgress(s.plots[0],at),0);
    const ripeAt=at+M.cropDuration(s.plots[0]);assert.equal(M.harvest(s,0,ripeAt-1),null);
    assert.equal(M.harvest(s,0,ripeAt),id);assert.equal(s.bag[id],1);assert.equal(s.plots[0].crop,null);
    assert.equal(M.harvest(s,0,ripeAt),null);assert.equal(s.bag[id],1);
  }
});
