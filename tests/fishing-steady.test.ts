import test from 'node:test';
import assert from 'node:assert/strict';
import { FishingSimulation, STEADY, type FishingOptions } from '../src/fishing.ts';
import { ITEMS, FISH, RECIPES } from '../src/content.ts';
import { ContextGearSelection } from '../src/context-gear.ts';
import * as M from '../src/model.ts';

function seeded(seed:number){return ()=>{seed|=0;seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
const heaviest=Math.max(...Object.values(FISH).map(f=>f.power??0));
const whale={id:'fish_whale',power:heaviest};
const steadyRod=ITEMS.rod_steady.weapon!;
function sim(o:Partial<FishingOptions>={}){return new FishingSimulation({quality:steadyRod.quality!,steady:true,bait:false,choose:()=>whale,random:seeded(11),...o});}
/** Waits for the bite, hooks it, then returns the simulation in the fight. */
function hooked(f:FishingSimulation){for(let t=0;t<60&&f.phase!=='bite';t+=.025)f.update(.025,false);assert.equal(f.phase,'bite');f.update(.025,true);assert.equal(f.phase,'hooked');return f;}

test('the steady rod is a third, dearer rod with ocean materials and the best quality',()=>{
  const price=(id:string)=>RECIPES.find(r=>r.station==='shop'&&r.result===id)!;
  assert.equal(steadyRod.kind,'rod');assert.equal(steadyRod.steady,true);
  assert.ok(steadyRod.quality!>ITEMS.rod_gold.weapon!.quality!);
  assert.ok(price('rod_steady').energy>price('rod_gold').energy*3);
  assert.deepEqual(price('rod_steady').materials,{coral:4,pearl:1});
  // The automatic rod choice near water prefers it over the golden rod.
  const s=M.newGame();s.bag.rod_gold=1;s.bag.rod_steady=1;s.bag.rod=1;
  assert.equal(new ContextGearSelection().forFishing(s),'rod_steady');
});

test('the steady line never snaps, whatever the tension and however long Reel is held',()=>{
  for(let seed=1;seed<=40;seed++){
    const f=hooked(sim({random:seeded(seed)}));let peak=0;
    for(let t=0;t<30&&!f.finished;t+=.025){f.update(.025,true);peak=Math.max(peak,f.tension);}
    assert.equal(f.snapped,false,`seed ${seed}`);assert.ok(peak<=STEADY.maxTension+1e-9);
    assert.equal(f.phase,'caught',`seed ${seed}: holding Reel lands the heaviest fish`);
  }
  // The same fight with the golden rod snaps: holding through every surge is what breaks a normal line.
  let snaps=0;for(let seed=1;seed<=40;seed++){const f=hooked(sim({steady:false,quality:.7,random:seeded(seed)}));for(let t=0;t<30&&!f.finished;t+=.025)f.update(.025,true);if(f.snapped)snaps++;}
  assert.ok(snaps>30,`golden rod snapped ${snaps}/40`);
});

test('heavy fish land quickly, but fishing stays interactive (hook at the bite, no long slack)',()=>{
  const f=hooked(sim());let t=0;for(;t<30&&!f.finished;t+=.025)f.update(.025,true);
  assert.equal(f.phase,'caught');assert.ok(t<8,`whale landed in ${t.toFixed(1)} s`);
  // Its bite window is 0.4 s longer than a plain rod of the same quality.
  const plain=sim({steady:false});assert.ok(Math.abs(sim().biteWindow-plain.biteWindow-STEADY.bite)<1e-9);
  // Missing the bite still loses the fish.
  const missed=sim();for(let s=0;s<60&&missed.missedBites===0;s+=.025)missed.update(.025,false);assert.equal(missed.missedBites,1);
  // Letting go for over 4 s still lets the fish slip away.
  const slack=hooked(sim());for(let s=0;s<5&&!slack.finished;s+=.025)slack.update(.025,false);
  assert.equal(slack.phase,'escaped');assert.equal(slack.snapped,false);
});
