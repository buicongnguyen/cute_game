import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveMysteryCatch,MYSTERY_TREASURE_WEIGHTS,FishingSimulation} from '../src/fishing.ts';
const sequence=(...values:number[])=>()=>values.shift()??.5;
test('mystery fish has a strict sixty-percent supergiant boundary and bounded size',()=>{
  assert.deepEqual(resolveMysteryCatch({id:'fish_whale',max:500},sequence(.599999,0)),{id:'fish_whale',size:800,huge:true,supergiant:true,mystery:true});
  assert.equal(resolveMysteryCatch({id:'fish_whale',max:500},sequence(.6,0)).id,'starshard');
  assert.equal(resolveMysteryCatch({id:'fish_whale',max:500},sequence(0,.999999)).size,1300);
});
test('every mystery treasure can be selected and cannot fall outside its catalog',()=>{
  const total=MYSTERY_TREASURE_WEIGHTS.reduce((n,[,w])=>n+w,0);let prefix=0;
  for(const [id,weight]of MYSTERY_TREASURE_WEIGHTS){const result=resolveMysteryCatch({id:'fish_perch',max:40},sequence(.8,(prefix+weight/2)/total));assert.equal(result.id,id);assert.equal(result.supergiant,false);prefix+=weight;}
});
test('ordinary fishing no longer randomly snaps below the tension threshold',()=>{
  const sim=new FishingSimulation({quality:0,bait:false,choose:()=>({id:'fish_whale',power:1}),random:()=>0});
  for(let i=0;i<2000&&sim.phase!=='bite';i++)sim.update(.025,false);
  sim.press();sim.surge=1;sim.tension=.1;sim.update(.1,true);
  assert.equal(sim.phase,'hooked');assert.ok(sim.tension<1);
});
