import test from 'node:test';
import assert from 'node:assert/strict';
import { FishingSimulation, selectCatch, planCast, earlyPull, catchBonus, catchWeight, CAST, FISH_PER_WATER, type FishingOptions } from '../src/fishing.ts';

/** Seeded random numbers (mulberry32), so every run of a rule test sees the same fish. */
function seeded(seed:number){return ()=>{seed|=0;seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
const perch={id:'fish_perch',power:.2},shark={id:'fish_shark',power:1.2};
function sim(o:Partial<FishingOptions>={}){return new FishingSimulation({quality:.3,bait:false,choose:()=>perch,random:seeded(7),...o});}
function advance(f:FishingSimulation,seconds:number,held=false){for(let t=0;t<seconds-1e-9;t+=.025)f.update(.025,held);}
function until(f:FishingSimulation,phase:string,limit=60){let t=0;for(;t<limit&&f.phase!==phase;t+=.025)f.update(.025,false);assert.equal(f.phase,phase,`reached ${phase}`);return t;}
const close=(a:number,b:number,eps=1e-6)=>assert.ok(Math.abs(a-b)<eps,`${a} ≈ ${b}`);

test('the shore point is 0.6 m outside the rim on the explorer side; a tap inside the water is the cast point',()=>{
  const water={x:0,z:0,r:9},{shore,cast}=planCast(water,{x:20,z:0},{x:5,z:2});
  close(shore.x,9.6);close(shore.z,0);assert.deepEqual(cast,{x:5,z:2});
});
test('a tap on or beyond the rim lands 0.6 m inside it',()=>{
  const water={x:-7.5,z:11.2,r:3.3},{cast}=planCast(water,{x:-3,z:7},{x:-7.5,z:20});
  close(Math.hypot(cast.x-water.x,cast.z-water.z),3.3-CAST.edgeGap);
});
test('a far tap is pulled back to 7 m from the shore point; a near tap is pushed out to 1.8 m toward the middle',()=>{
  const lake={x:0,z:0,r:11},far=planCast(lake,{x:30,z:0},{x:-10,z:0});
  close(Math.hypot(far.cast.x-far.shore.x,far.cast.z-far.shore.z),7);close(far.cast.x,11.6-7);
  const near=planCast(lake,{x:30,z:0},{x:11,z:.2});
  close(Math.hypot(near.cast.x-near.shore.x,near.cast.z-near.shore.z),1.8);close(near.cast.z,0);
  // The live reference: explorer (-4.02, 8.06) taps (-5.44, 9.27) at the home pond → shore (-4.61, 8.59), cast (-5.94, 9.79).
  const ref=planCast({x:-7.5,z:11.2,r:3.3},{x:-4.02,z:8.06},{x:-5.44,z:9.27});
  close(ref.cast.x,-5.94,.01);close(ref.cast.z,9.79,.01);close(ref.shore.x,-4.61,.01);close(ref.shore.z,8.59,.01);
});
test('an early press moves the bobber 0.7 m toward the explorer and reels in near the rim',()=>{
  const water={x:0,z:0,r:5},pulled=earlyPull(water,{x:0,z:0},{x:6,z:0});
  close(pulled.cast.x,.7);assert.equal(pulled.reeledIn,false);
  assert.equal(earlyPull(water,{x:4.2,z:0},{x:6,z:0}).reeledIn,true);
});
test('the cast flies 0.5 s, then waits 2–5.5 s, shortened by a worm (÷1.7) and the rod (÷(1+q/2))',()=>{
  const f=sim();advance(f,.475);assert.equal(f.phase,'cast');advance(f,.05);assert.equal(f.phase,'wait');
  for(const [bait,q] of [[false,.3],[true,.3],[true,.7]] as const){
    const g=sim({bait,quality:q,random:seeded(3)});for(let i=0;i<200;i++){const w=g.nextWait(),k=(bait?1.7:1)*(1+q*.5);assert.ok(w>=2/k-1e-9&&w<=5.5/k+1e-9);}
  }
});
test('a fish is chosen at each approach with the bait/rod/luck bonus, and swims in at 1.1 then 0.45 m/s',()=>{
  const bonuses:number[]=[];const f=sim({bait:true,quality:.7,luck:.1,choose:b=>{bonuses.push(b);return perch;},approachFrom:()=>3});
  until(f,'approach');close(bonuses[0],.8+.7-.3+.1);assert.equal(f.pick,perch);
  const t=until(f,'nibble');
  // 1 m at 1.1 m/s, then 1.45 m at 0.45 m/s.
  assert.ok(Math.abs(t-(1/1.1+1.45/.45))<.06,`approach took ${t}`);
});
test('1–4 nibbles dip the bobber, then the fish bites (95 %) or swims off (5 %)',()=>{
  let bites=0,fled=0;
  for(let s=1;s<=200;s++){
    const f=sim({random:seeded(s)});until(f,'nibble');
    while(f.phase==='nibble')f.update(.025,false);
    assert.ok(f.nibbles>=1&&f.nibbles<=4,`nibbles ${f.nibbles}`);
    if(f.phase==='bite')bites++;else{assert.equal(f.phase,'wait');assert.equal(f.fled,1);fled++;}
  }
  assert.ok(bites>180&&bites<200&&fled>0,`bites ${bites} fled ${fled}`);
});
test('the bite lasts 1.4 + 0.6 × rod quality; a missed bite uses the worm and a new fish is chosen',()=>{
  for(const q of [.3,.7]){
    let picks=0;const f=sim({quality:q,bait:true,random:seeded(11),choose:()=>{picks++;return perch;}});until(f,'bite');
    let t=0;while(f.phase==='bite'){f.update(.01,false);t+=.01;}
    assert.ok(Math.abs(t-(1.4+.6*q))<.02,`window ${t}`);
    assert.equal(f.phase,'wait');assert.equal(f.missedBites,1);assert.equal(f.baitUsed,1);
    until(f,'approach');assert.equal(picks,2);
  }
  const nobait=sim();until(nobait,'bite');advance(nobait,2.2);assert.equal(nobait.baitUsed,0,'no worm, nothing used');
});
test('pressing early scares the fish, waits 1.5 s longer and pulls the bobber toward the explorer',()=>{
  const water={x:0,z:0,r:9},f=sim({water,cast:{x:-3,z:0},player:{x:10,z:0},approachFrom:()=>2});
  until(f,'approach');assert.equal(f.press(),false);f.release();
  assert.equal(f.phase,'wait');assert.equal(f.earlyPresses,1);assert.equal(f.fled,1);assert.equal(f.pick,null);close(f.cast!.x,-2.3);
  // A held press counts once.
  f.update(.01,true);f.update(.01,true);assert.equal(f.earlyPresses,2);f.update(.01,false);f.update(.01,true);assert.equal(f.earlyPresses,3);
  // Near the rim the line comes back in, without using the worm.
  const g=sim({water,cast:{x:8.2,z:0},player:{x:10,z:0},bait:true});advance(g,.6);g.press();assert.equal(g.phase,'escaped');assert.match(g.reason,/reeled/);assert.equal(g.baitUsed,0);
});
test('pressing on the bite hooks the fish at tension 0.25 and progress 0.05',()=>{
  const f=sim();until(f,'bite');assert.equal(f.press(),true);assert.equal(f.phase,'hooked');close(f.tension,.25);close(f.progress,.05);
});
test('paused fishing leaves the bite timer and line tension unchanged',()=>{
  const f=sim();until(f,'bite');f.update(20,false,false);assert.equal(f.phase,'bite');f.press();const tension=f.tension;f.update(20,true,false);assert.equal(f.tension,tension);
});
test('holding through surges snaps the line; leaving it slack 7 s loses the fish; both use the worm',()=>{
  const f=sim({quality:0,bait:true,choose:()=>shark});until(f,'bite');f.press();advance(f,10,true);
  assert.equal(f.phase,'escaped');assert.equal(f.snapped,true);assert.equal(f.baitUsed,1);
  const g=sim({quality:1,bait:true});until(g,'bite');g.press();g.release();advance(g,7.1,false);
  assert.equal(g.phase,'escaped');assert.match(g.reason,/slack/);assert.equal(g.baitUsed,1);
});
test('reeling between surges lands the fish, using the worm',()=>{
  const f=sim({quality:.7,bait:true});until(f,'bite');f.press();
  for(let i=0;i<8000&&!f.finished;i++)f.update(.025,f.surge<=0&&f.tension<.62);
  assert.equal(f.phase,'caught');assert.equal(f.progress,1);assert.equal(f.baitUsed,1);
});
test('reeling a perch steadily takes about as long as in the reference (6–9 s; the live reference took 6.7 s)',()=>{
  const times:number[]=[];
  for(let s=1;s<=30;s++){const f=sim({random:seeded(s)});until(f,'bite');f.press();let t=0;while(!f.finished&&t<60){f.update(.05,f.surge<=0&&f.tension<.62);t+=.05;}if(f.phase==='caught')times.push(t);}
  const mean=times.reduce((a,b)=>a+b,0)/times.length;assert.ok(times.length>=25&&mean>4&&mean<11,`mean ${mean} over ${times.length}`);
});
test('the rare-fish bonus, weights and fish per water follow the reference',()=>{
  close(catchBonus(false,.3),0);close(catchBonus(true,.7,.1),1.3);
  assert.equal(catchWeight(10,'common',1),10);assert.equal(catchWeight(10,'rare',1),20);assert.equal(catchWeight(10,'legendary',1),25);
  // Round 26: twice the reference's 9 (lake) and 4 (home) fish, at the user's request.
  assert.equal(FISH_PER_WATER.lake,18);assert.equal(FISH_PER_WATER.home,8);assert.equal(FISH_PER_WATER.lava,0);
});
test('weighted catches respect pool and bounded sizes',()=>{const pool=[{id:'tiny',weight:100,min:2,max:5},{id:'rare',weight:1,min:20,max:30}];assert.equal(selectCatch(pool,()=>0).id,'tiny');const result=selectCatch(pool,()=>.999);assert.equal(result.id,'rare');assert.ok(result.size>=20&&result.size<=30);});
test('huge fish are large samples inside the ordinary size range, never oversized junk',()=>{const result=selectCatch([{id:'carp',weight:1,min:10,max:50}],()=>.99);assert.equal(result.huge,true);assert.ok(result.size<=50);assert.equal(selectCatch([{id:'boot',weight:1,min:10,max:50,junk:true}],()=>.99).huge,false);assert.equal(selectCatch([{id:'carp',weight:1,min:10,max:50}],()=>.5).huge,false);});
