import {test} from 'node:test';
import assert from 'node:assert/strict';
import {EnvironmentSimulation,createEnvironmentLayout,terrainHeight,tideHeight,ventPhase,trainPosition,raftPosition} from '../src/environments.ts';
import {lavaEvent,LAVA_EVENT_INFO} from '../src/lava-weather.ts';
const traits={speed:6,maxHp:100};const still={x:0,z:0};
test('ice retains momentum after release and brakes over time',()=>{
  const sim=new EnvironmentSimulation(createEnvironmentLayout('ice')),p={x:30,z:0};
  const accelerating=sim.step(.5,p,{x:1,z:0},traits,[]),gliding=sim.step(.1,p,still,traits,[]);
  assert.ok(accelerating.motion.x>0&&gliding.motion.x>0);const speed=sim.velocity.x;sim.step(2,p,still,traits,[]);assert.ok(sim.velocity.x<speed*.05);
});
test('lava warning precedes eruption and burns both explorers and creatures',()=>{
  const layout=createEnvironmentLayout('lava'),sim=new EnvironmentSimulation(layout),vent=layout.vents[0];sim.time=301-.01;
  const warning=sim.step(.02,vent,still,traits,[]);assert.equal(ventPhase(sim.time,vent.phase),'warning');assert.ok(warning.events.length>0);assert.equal(warning.damage,0);
  sim.time=306;const eruption=sim.step(.02,vent,still,traits,[{id:'normal',...vent,hp:100,maxHp:100,boss:false},{id:'boss',...vent,hp:1000,maxHp:1000,boss:true}]);
  assert.equal(eruption.damage,14.000000000000002);assert.deepEqual(eruption.enemyHits.map(e=>Math.round(e.amount)),[14,30]);
});
test('tide exposes low stepping stones and complete lava resistance prevents burning',()=>{
  const layout=createEnvironmentLayout('lava'),stone=layout.stones.find(s=>s.height===-.64)!;
  assert.ok(terrainHeight(layout,stone)>tideHeight(75));assert.ok(terrainHeight(layout,stone)<tideHeight(25));
  const sim=new EnvironmentSimulation(layout);sim.time=25;assert.ok(sim.step(.02,stone,still,traits,[]).damage>0);
  const protectedSim=new EnvironmentSimulation(layout);protectedSim.time=25;assert.equal(protectedSim.step(.02,stone,still,{...traits,fireResistance:1},[]).damage,0);
});
test('moving train collisions affect player and enemy with separate percentages',()=>{
  const layout=createEnvironmentLayout('toy'),sim=new EnvironmentSimulation(layout),point=trainPosition(layout.tracks[0],.01);
  const result=sim.step(.01,point,still,traits,[{id:'e',...point,hp:100,maxHp:100,boss:false}]);assert.equal(result.damage,15);assert.equal(result.enemyHits[0].amount,30);assert.ok(Math.hypot(result.push.x,result.push.z)>2);
});
test('jungle thorns alternate collision and antidote equipment blocks poison',()=>{
  const layout=createEnvironmentLayout('jungle'),sim=new EnvironmentSimulation(layout);assert.ok(sim.dynamicObstacles().length>0);
  const wall=layout.thorns[0];sim.time=0;assert.ok(sim.dynamicObstacles().some(o=>o.x===wall.x&&o.z===wall.z));sim.time=17;assert.ok(!sim.dynamicObstacles().some(o=>o.x===wall.x&&o.z===wall.z));
  const gas=layout.poison[0];assert.ok(sim.step(.01,gas,still,traits,[]).damage>0);assert.equal(new EnvironmentSimulation(layout).step(.01,gas,still,{...traits,poisonImmune:true,flying:true},[]).damage,0);
});
test('ocean oxygen drains in water, recovers at vents, and turtle rides preserve it',()=>{
  const layout=createEnvironmentLayout('ocean'),sim=new EnvironmentSimulation(layout),water={x:145,z:0};assert.ok(terrainHeight(layout,water)<0);
  sim.step(5,water,still,traits,[]);assert.equal(sim.oxygen,60);sim.rideUntil=sim.time+45;sim.step(5,water,still,traits,[]);assert.equal(sim.oxygen,60);
  sim.rideUntil=0;sim.step(.5,layout.bubbles[0],still,traits,[]);assert.equal(sim.oxygen,90);sim.step(1,{x:0,z:0},still,traits,[]);assert.equal(sim.oxygen,100);
});
test('cloud islands form a connected jump network and launches land exactly',()=>{
  const layout=createEnvironmentLayout('cloud'),sim=new EnvironmentSimulation(layout);assert.equal(layout.islands.length,26);assert.equal(layout.links.length,25);
  const link=layout.links[0];sim.launch(link.a,link.b);let result;for(let i=0;i<30&&sim.airborne;i++)result=sim.step(.1,link.a,still,traits,[]);
  assert.equal(sim.airborne,false);assert.equal(result!.relocate!.x,link.b.x);assert.equal(result!.relocate!.z,link.b.z);
});
test('cloud gusts push creatures and falling returns explorer to last safe ground',()=>{
  const layout=createEnvironmentLayout('cloud'),sim=new EnvironmentSimulation(layout);sim.time=20;
  const gust=sim.step(.1,{x:0,z:0},still,traits,[{id:'e',x:0,z:0,hp:100,maxHp:100,boss:false}]);assert.ok(Math.hypot(gust.push.x,gust.push.z)>.3);assert.equal(gust.enemyPushes.length,1);
  sim.step(.1,{x:145,z:0},still,traits,[]);assert.ok(sim.airborne);const fall=sim.step(.9,{x:145,z:0},still,traits,[]);assert.equal(fall.damage,12);assert.deepEqual(fall.relocate,{x:0,z:0,y:0});
});
test('shadow pillars reveal, heal and repel until their timed light expires',()=>{
  const layout=createEnvironmentLayout('shadow'),sim=new EnvironmentSimulation(layout),lamp=layout.lamps[0];sim.lightPillar(lamp.id);assert.ok(sim.revealed(lamp,{x:0,z:0}));assert.ok(sim.enemyLightObstacles().length>0);
  assert.equal(sim.step(1,lamp,still,traits,[]).heal,3);sim.time=151;assert.equal(sim.inLight(lamp),false);assert.equal(sim.enemyLightObstacles().length,0);
});

test('lava rafts carry a standing player and protect them over submerged ground',()=>{
  const layout=createEnvironmentLayout('lava'),sim=new EnvironmentSimulation(layout);sim.time=303.9;
  const p=raftPosition(layout.pools[0],sim.time),next=raftPosition(layout.pools[0],sim.time+.1),result=sim.step(.1,p,still,traits,[]);
  assert.equal(result.damage,0);assert.ok(Math.abs(result.push.x-(next.x-p.x))<.0001);assert.equal(result.y,next.y);
});

test('eruption fire rain warns before impact and leaves elevated shelter safe',()=>{
  const layout=createEnvironmentLayout('lava'),sim=new EnvironmentSimulation(layout);sim.time=300;
  const p={x:20,z:10};sim.fireRain.push({...p,id:'rain:one',remaining:.8,duration:.8});
  assert.equal(sim.step(.7,p,still,traits,[]).damage,0);const impact=sim.step(.11,p,still,traits,[{...p,id:'enemy',hp:100,maxHp:100,boss:false}]);assert.equal(impact.damage,12);assert.equal(impact.enemyHits[0].amount,10);
  const mesa=layout.mesas[0];sim.fireRain.push({...mesa,id:'rain:two',remaining:.1,duration:.8});assert.equal(sim.step(.11,mesa,still,traits,[]).damage,0);
});

test('dragon phases flood the nest while its rock islands remain safe',()=>{
  const layout=createEnvironmentLayout('lava'),sim=new EnvironmentSimulation(layout);sim.time=300;const floor={x:layout.nest.x-7,z:layout.nest.z};assert.equal(terrainHeight(layout,floor),-.25);assert.equal(sim.lavaAt(floor),false);
  sim.dragonPhase=2;for(let i=0;i<80;i++)sim.step(.1,{x:0,z:0},still,traits,[]);assert.ok(sim.nestLevel>-.22);assert.equal(sim.lavaAt(floor),true);assert.equal(sim.lavaAt(layout.nestIslands[0]),false);
  sim.dragonPhase=3;for(let i=0;i<150;i++)sim.step(.1,{x:0,z:0},still,traits,[]);assert.ok(sim.nestLevel>.3);assert.equal(sim.lavaAt(layout.nestIslands[0]),false);
  sim.dragonPhase=0;for(let i=0;i<150;i++)sim.step(.1,{x:0,z:0},still,traits,[]);assert.equal(sim.lavaAt(floor),false);
});

test('only a dragon event ending dismisses its dragon, including after host migration',()=>{
  const sim=new EnvironmentSimulation(createEnvironmentLayout('lava'));let cycle=0;while(lavaEvent(cycle*360).id!=='dragon')cycle++;sim.time=cycle*360+239.9;
  assert.equal(sim.step(.01,{x:0,z:0},still,traits,[]).dragonSummon,true);
  const replacement=new EnvironmentSimulation(sim.layout);replacement.time=sim.time;replacement.weather.restore(sim.weather.snapshot());
  assert.equal(replacement.step(.2,{x:0,z:0},still,traits,[]).dragonDismiss,true);assert.equal(replacement.step(.2,{x:0,z:0},still,traits,[]).dragonDismiss,false);
  const crowd=new EnvironmentSimulation(sim.layout);let other=0;while(['dragon','normal'].includes(lavaEvent(other*360).id))other++;crowd.time=other*360+239.9;crowd.nearbyPlayers=3;assert.equal(crowd.step(.01,{x:0,z:0},still,traits,[]).dragonSummon,true);assert.equal(crowd.step(.2,{x:0,z:0},still,traits,[]).dragonDismiss,false);
});

test('cloud lightning warns on solid ground before damaging player and nearby enemies',()=>{
  const sim=new EnvironmentSimulation(createEnvironmentLayout('cloud'));sim.step(5.9,{x:0,z:0},still,traits,[]);assert.equal(sim.lightning.bolts.length,0);
  sim.step(.11,{x:0,z:0},still,traits,[]);assert.equal(sim.lightning.bolts.length,1);const bolt=sim.lightning.bolts[0];assert.equal(bolt.remaining,1.2);assert.ok(terrainHeight(sim.layout,bolt)>=0);assert.ok(sim.lightning.wait>=7&&sim.lightning.wait<=13);
  assert.equal(sim.step(1.1,bolt,still,traits,[]).damage,0);const hit=sim.step(.11,bolt,still,traits,[{...bolt,id:'enemy',hp:100,maxHp:100,boss:false}]);assert.equal(hit.damage,12);assert.equal(hit.enemyHits[0].amount,20);assert.equal(sim.lightning.bolts.length,0);
  const peer=new EnvironmentSimulation(sim.layout);peer.authoritative=false;peer.step(20,{x:0,z:0},still,traits,[]);assert.equal(peer.lightning.bolts.length,0);
});
test('volcano weather shows a name for every event, never the internal id',()=>{
  const sim=new EnvironmentSimulation(createEnvironmentLayout('lava'));
  for(let cycle=0;cycle<12;cycle++){sim.time=cycle*360+5;const weather=sim.status({x:40,z:0}).find(s=>s.label==='Weather')!;const event=lavaEvent(sim.time);assert.ok(LAVA_EVENT_INFO[event.id].name);assert.ok(weather.value.startsWith(LAVA_EVENT_INFO[event.id].name),weather.value);assert.ok(!weather.value.startsWith(event.id+' '),weather.value);}
});
