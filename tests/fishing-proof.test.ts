import test from 'node:test';import assert from 'node:assert/strict';
import {FishingProof} from '../src/fishing-proof.ts';
import {FishingSimulation} from '../src/fishing.ts';
test('online fishing waits for an authoritative selection without inventing an approach',()=>{
  let ready=false;const sim=new FishingSimulation({quality:1,bait:false,random:()=>0,choose:()=>ready?{id:'fish_perch',power:.2}:null});
  for(let i=0;i<200;i++)sim.update(.025,false);assert.equal(sim.phase,'wait');assert.equal(sim.approaches,0);assert.equal(sim.pick,null);
  ready=true;for(let i=0;i<10&&sim.phase==='wait';i++)sim.update(.025,false);assert.equal(sim.phase,'approach');assert.equal(sim.approaches,1);
});
test('fishing proof keeps monotonic bounded hooked samples and the final success endpoint',()=>{
  const proof=new FishingProof(1000);
  for(let i=0;i<=10000;i++)proof.sample(3000+i*16,i%200<150,.4,Math.min(1,i/10000),i===10000);
  const result=proof.finish(163000);assert.ok(result.samples.length<=96);assert.equal(result.hookAt,2);assert.equal(result.samples.at(-1)?.progress,1);
  let previous=result.hookAt;for(const sample of result.samples){assert.ok(sample.t>=previous);assert.ok(sample.t<=result.elapsed);previous=sample.t;}
});
test('proof preserves release boundaries without charging the release interval as reeling',()=>{
  const proof=new FishingProof(0);proof.sample(1000,true,.25,.05);proof.sample(2000,true,.4,.3);proof.sample(2500,false,.4,.3);proof.sample(3500,false,.2,.28);proof.sample(4000,true,.2,.28);proof.sample(5000,true,.4,1,true);
  let previous=proof.hookAt!,held=0;for(const sample of proof.samples){if(sample.held)held+=sample.t-previous;previous=sample.t;}assert.equal(held,2.5);
});
