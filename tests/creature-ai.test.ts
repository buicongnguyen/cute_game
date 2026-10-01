import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {World,type Enemy} from '../src/world.ts';
import {newGame} from '../src/model.ts';
import {EnvironmentSimulation,createEnvironmentLayout} from '../src/environments.ts';
import {frameSteps} from '../src/frame-steps.ts';

// Real world code with real Three objects; only WebGL is left out (same setup as world.test.ts).
function world() {
  return Object.assign(Object.create(World.prototype), {
    state:newGame(),scene:new T.Scene(),camera:new T.OrthographicCamera(-3,3,3,-3,.1,20),
    root:new T.Group(),player:new T.Group(),companion:new T.Group(),position:new T.Vector3(),
    destination:null,route:[],selected:null,obstacles:[],entities:[],enemies:[],plotMeshes:[],cropSignatures:[],
    particles:[],keys:new Set<string>(),facing:0,time:0,planet:'home',hazardTimer:0,
    marker:new T.Mesh(),ring:new T.Mesh(),cameraTarget:new T.Vector3(),sun:new T.DirectionalLight(),raycaster:new T.Raycaster(),
    onInteract(){},onAttackEnemy(){},onDamage(){},onZone(){},
  }) as World;
}
const homeWorld=()=>{const w=world();w.environment=new EnvironmentSimulation(createEnvironmentLayout('home'));return w;};
const step=(w:World,steps=1)=>{for(let i=0;i<steps;i++)w.update(.025,true,false);};
const distance=(a:{x:number;z:number},b:{x:number;z:number})=>Math.hypot(a.x-b.x,a.z-b.z);
/** How many of the next `steps` steps move each creature. */
function movingSteps(w:World,creatures:Enemy[],steps:number){
  const counts=creatures.map(()=>0);
  for(let i=0;i<steps;i++){const before=creatures.map(e=>({x:e.x,z:e.z}));step(w);creatures.forEach((e,j)=>{if(distance(e,before[j])>1e-9)counts[j]++;});}
  return counts;
}

test('a frame simulates at most four fixed steps and drops the rest of a long stall',()=>{
  assert.deepEqual(frameSteps(0),[]);
  assert.deepEqual(frameSteps(.016),[.016]);
  assert.deepEqual(frameSteps(.04).map(s=>+s.toFixed(4)),[.025,.015]);
  for(const stall of [.1,.25,1]){const steps=frameSteps(stall);assert.equal(steps.length,4);assert.ok(Math.abs(steps.reduce((a,b)=>a+b,0)-.1)<1e-9,'0.1 s of game time at most');}
});

test('creatures keep one obstacle list between steps, so its grid index is built once',()=>{
  const w=homeWorld();w.obstacles=Array.from({length:200},(_,i)=>({x:30+i%20*3,z:-30+Math.floor(i/20)*3,r:.5}));w.position.set(40,0,0);
  const obstacles=()=>(w as unknown as {creatureObstacles():unknown[]}).creatureObstacles();
  const first=obstacles();step(w,3);assert.equal(obstacles(),first);
  // Thorn walls come back as a fresh list every step; the combined list is only rebuilt when they move.
  const jungle=world();jungle.planet='jungle';jungle.environment=new EnvironmentSimulation(createEnvironmentLayout('jungle'));jungle.obstacles=w.obstacles;jungle.position.set(40,0,0);
  const jungleList=()=>(jungle as unknown as {creatureObstacles():unknown[]}).creatureObstacles();
  step(jungle);const thorns=jungleList();assert.ok(thorns.length>200,'some thorn walls are up');step(jungle);
  if(jungle.environment.dynamicObstacles().length===thorns.length-200)assert.equal(jungleList(),thorns);
  // On the shadow planet the lit pillars join the list, cached by which pillars are lit.
  const shadow=world();shadow.planet='shadow';shadow.environment=new EnvironmentSimulation(createEnvironmentLayout('shadow'));shadow.obstacles=w.obstacles;shadow.position.set(40,0,0);
  const shadowList=()=>(shadow as unknown as {creatureObstacles():unknown[]}).creatureObstacles();
  assert.equal(shadowList().length,200);shadow.environment.lightPillar(shadow.environment.layout.lamps[0].id);
  const lit=shadowList();assert.equal(lit.length,201);step(shadow,2);assert.equal(shadowList(),lit);
});

test('calm creatures far from the explorer rest, wanderers think on every fourth step, aggro ones on every step',()=>{
  const w=homeWorld();w.position.set(40,0,0);
  const far=w.spawnSpecies('wolf',90,0,0)!,wanderer=w.spawnSpecies('wolf',40,-30,1)!,chaser=w.spawnSpecies('wolf',40,28,2)!;
  chaser.statuses={taunt:60};
  const [farMoves,wanderMoves,chaseMoves]=movingSteps(w,[far,wanderer,chaser],16);
  assert.equal(farMoves,0,'no AI beyond 48 m unless aggro');
  assert.equal(wanderMoves,4,'an idle wanderer moves on every fourth step');
  assert.equal(chaseMoves,16,'an aggro creature moves on every step');
  // A creature that sees the explorer reacts on the very next step.
  const w2=homeWorld();w2.position.set(40,0,0);const spotter=w2.spawnSpecies('wolf',50,0,0)!;step(w2);assert.equal(spotter.phase,'chase');
});

test('throttled wanderers are staggered and glide instead of hopping',()=>{
  const w=homeWorld();w.position.set(60,0,0);
  const wolves=[0,1,2,3].map(i=>w.spawnSpecies('wolf',60+Math.cos(i*1.6)*30,Math.sin(i*1.6)*30,i)!);
  const thinking=Array.from({length:8},()=>{const before=wolves.map(e=>e.x+','+e.z);step(w);return wolves.filter((e,i)=>e.x+','+e.z!==before[i]).length;});
  assert.equal(thinking.reduce((a,b)=>a+b,0),8,'each wanderer thinks twice in eight steps');
  assert.ok(Math.max(...thinking)<=2,`few wanderers think on the same step: ${thinking}`);
  const e=wolves[0],drawn:Array<{x:number;z:number}>=[];
  for(let i=0;i<8;i++){step(w);drawn.push({x:e.mesh.position.x,z:e.mesh.position.z});}
  const jumps=drawn.slice(1).map((p,i)=>distance(p,drawn[i]));
  assert.ok(jumps.every(d=>d<.03),`the drawn body moves a little every step: ${jumps.map(d=>d.toFixed(3))}`);
  assert.ok(jumps.filter(d=>d>1e-6).length>=6,'it keeps moving between thinking steps');
});

test('creatures never pile onto the explorer; a boss mid-skill holds its ground',()=>{
  const w=homeWorld();w.position.set(40,0,0);
  const wolf=w.spawnSpecies('wolf',40.3,.95,0)!;wolf.stun=999;
  const boss=w.spawnSpecies('treant',40,-1.4,1)!;Object.assign(boss,{phase:'windup',phaseTime:30,skill:'slam'});const bossAt={x:boss.x,z:boss.z};
  step(w,2);
  assert.ok(distance(wolf,w.position)>=.45+wolf.radius-.001,'the creature is pushed out of the explorer');
  assert.deepEqual({x:w.position.x,z:w.position.z},{x:40,z:0},'the explorer is not moved');
  assert.deepEqual({x:boss.x,z:boss.z},bossAt,'a boss in the middle of a skill keeps its course');
});

test('fifty aggro creatures around the explorer outside the forest gate cost under a millisecond per step',async t=>{
  const w=world();w.build('home');w.position.set(-22,0,2);
  // A crowded fight: the fifty nearest creatures live 6-25 m from the explorer (outside the fence) and all
  // chase it (taunted, so none gives up), pressing around it every step.
  // Rooted creatures (speed 0) cannot come to the fight, so they are not among the fifty.
  const awake=w.enemies.filter(e=>e.hp>0&&!e.boss&&(e.definition?.speed??1)>0).sort((a,b)=>distance(a,w.position)-distance(b,w.position)).slice(0,50);
  let seed=7;const random=()=>(seed=seed*16807%2147483647)/2147483647;
  for(const e of awake){
    for(let i=0;i<50;i++){const a=random()*Math.PI*2,r=6+random()*19,x=w.position.x+Math.cos(a)*r,z=w.position.z+Math.sin(a)*r;if(Math.hypot(x,z)>20&&!w.blocked(x,z)){e.x=e.homeX=x;e.z=e.homeZ=z;break;}}
    e.statuses={taunt:1e6};
  }
  assert.equal(awake.length,50);assert.ok(awake.every(e=>distance(e,w.position)<26&&Math.hypot(e.x,e.z)>18),'all fifty are near the explorer, outside the safe area');
  step(w,80);
  const median=()=>{const times:number[]=[];for(let i=0;i<120;i++){const t=performance.now();step(w);times.push(performance.now()-t);}return times.sort((a,b)=>a-b)[60];};
  // Other processes (the rest of this suite runs in parallel) only ever make a run slower, so the best of several
  // medians counts, taken a moment apart until one is clearly under budget.
  let best=Infinity;
  for(let attempt=0;attempt<12&&!(attempt>=3&&best<.8);attempt++){if(attempt>=3)await new Promise(done=>setTimeout(done,150));best=Math.min(best,median());}
  t.diagnostic(`median simulation step with 50 aggro creatures: ${best.toFixed(3)} ms`);
  assert.ok(awake.filter(e=>e.phase!=='idle').length>=45,'the creatures are fighting, not resting');
  // Shared CI runners are 2-3x slower than a desktop (1.6 ms measured there); the code before the fix took 12-55 ms.
  const budget=process.env.CI?4:1;
  assert.ok(best<budget,`median step ${best.toFixed(3)} ms (budget ${budget} ms)`);
});

test('a minute in the home forest never stalls on a calm wanderer searching for a route',()=>{
  // At this spot a boar whose wander goal lies past a fence used to run a whole-map A* search every
  // 25 s, a stall of most of a second. Calm wanderers no longer search, and walking home has a budget.
  const w=world();w.build('home');w.position.set(-30.88,0,9.2);
  let worst=0,at=0;
  for(let i=0;i<2400;i++){const t=performance.now();step(w);const spent=performance.now()-t;if(spent>worst){worst=spent;at=i*.025;}}
  assert.ok(worst<200,`the slowest step took ${worst.toFixed(1)} ms at ${at.toFixed(2)} s`);
});
