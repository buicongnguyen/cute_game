import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {World} from '../src/world.ts';
import * as M from '../src/model.ts';
import {EnvironmentSimulation,createEnvironmentLayout} from '../src/environments.ts';
import {EnvironmentView} from '../src/environment-art.ts';
import {environmentResourceNodes} from '../src/environment-resources.ts';
import {enemyRoster} from '../src/enemy-roster.ts';
import {beginTitanAttack,titanTelegraphs} from '../src/titan-patterns.ts';
function world(){return Object.assign(Object.create(World.prototype),{state:M.newGame(),scene:new T.Scene(),camera:new T.PerspectiveCamera(40,4/3,.5,300),root:new T.Group(),player:new T.Group(),companion:new T.Group(),position:new T.Vector3(),destination:null,route:[],selected:null,obstacles:[],entities:[],enemies:[],plotMeshes:[],cropSignatures:[],particles:[],keys:new Set<string>(),facing:0,time:0,planet:'home',hazardTimer:0,marker:new T.Mesh(),ring:new T.Mesh(),cameraTarget:new T.Vector3(),sun:new T.DirectionalLight(),raycaster:new T.Raycaster(),onInteract(){},onAttackEnemy(){},onDamage(){},onZone(){}}) as World;}
test('all nine built worlds match the canonical server roster, including a living Titan',()=>{
 const w=world();for(const planet of Object.keys(M.PLANETS) as M.PlanetId[]){w.build(planet);const roster=enemyRoster(planet);assert.equal(w.enemies.length,roster.length,planet);
  for(const e of w.enemies){const canonical=roster.find(r=>r.id===e.id)!;assert.ok(canonical,e.id);assert.equal(e.type,canonical.type);assert.equal(e.baseMaxHp,canonical.baseMaxHp,e.id);assert.equal(e.baseDamage,canonical.baseDamage,e.id);}
  const titan=w.enemies.find(e=>e.definition?.titan)!;assert.ok(titan&&titan.hp>0,planet);w.damageEnemy(titan,titan.hp);assert.equal(titan.respawn,600);
 }
});
test('the authority resource catalog agrees with the world interactable positions',()=>{
 const w=world();for(const planet of ['jungle','ocean','lava','shadow'] as const){w.build(planet);for(const n of environmentResourceNodes(w.environment.layout)){const e=w.entities.find(e=>e.id===n.id);assert.ok(e,n.id);assert.deepEqual([e.x,e.z,e.radius],[n.x,n.z,n.radius],n.id);}}
});
test('jungle fruit uses persisted wall time across travel and never grows early after a reload',()=>{
 const w=world();w.state.hp=1;w.build('jungle');let fruit=w.entities.find(e=>e.kind==='fruit')!;const before=Date.now();w.interactEnvironment(fruit);const hp=w.state.hp,ready=w.state.worldRewards.resourceReadyAt[fruit.id];assert.ok(ready>=before+60000);assert.ok(hp>1);
 w.build('home');w.state=JSON.parse(JSON.stringify(w.state));w.build('jungle');fruit=w.entities.find(e=>e.id===fruit.id)!;assert.equal(fruit.mesh.getObjectByName('fruit')!.visible,false);w.interactEnvironment(fruit);assert.equal(w.state.hp,hp);assert.equal(w.state.worldRewards.resourceReadyAt[fruit.id],ready);
 w.state.worldRewards.resourceReadyAt[fruit.id]=Date.now()-1;w.interactEnvironment(fruit);assert.ok(w.state.hp>hp);
});
test('sixteen ocean clams require three hits and regrow after 150 wall-clock seconds',()=>{
 const w=world();w.build('ocean');const clams=w.entities.filter(e=>e.kind==='clam');assert.equal(clams.length,16);const clam=clams[0],before=w.state.bag.coral??0;
 w.interactEnvironment(clam);w.interactEnvironment(clam);assert.equal(w.state.bag.coral??0,before);const start=Date.now();w.interactEnvironment(clam);assert.ok([1,2].includes((w.state.bag.coral??0)-before));assert.ok(w.state.worldRewards.resourceReadyAt[clam.id]>=start+150000);assert.equal(clam.mesh.visible,false);
 const bag={...w.state.bag};w.interactEnvironment(clam);assert.deepEqual(w.state.bag,bag);
});
test('online environment rewards wait for authority and a rejection leaves save data intact',async()=>{
 const w=world();w.build('jungle');const e=w.entities.find(e=>e.kind==='fruit')!,before=JSON.stringify(w.state),requests:unknown[]=[];let reject!:(e:Error)=>void;
 w.authoritativeAction=intent=>{requests.push(intent);return new Promise((_,r)=>{reject=r;});};w.interactEnvironment(e);w.interactEnvironment(e);assert.deepEqual(requests,[{type:'environmentResource',payload:{nodeId:e.id}}]);assert.equal(JSON.stringify(w.state),before);
 reject(new Error('Too far away.'));await new Promise(resolve=>setImmediate(resolve));assert.equal(JSON.stringify(w.state),before);w.interactEnvironment(e);assert.equal(requests.length,2);reject(new Error('Too far away.'));await new Promise(resolve=>setImmediate(resolve));
});
test('touching a cloud pad launches automatically but landing cannot bounce the player back',()=>{
 const sim=new EnvironmentSimulation(createEnvironmentLayout('cloud')),link=sim.layout.links[0],traits={speed:6,maxHp:100};let p={...link.a};let result=sim.step(.05,p,{x:0,z:0},traits,[]);assert.equal(sim.airborne,true);
 for(let i=0;i<100&&sim.airborne;i++){result=sim.step(.05,p,{x:0,z:0},traits,[]);if(result.relocate)p=result.relocate;}assert.deepEqual([p.x,p.z],[link.b.x,link.b.z]);sim.step(.05,p,{x:0,z:0},traits,[]);assert.equal(sim.airborne,false);
 sim.step(.05,{x:p.x+2,z:p.z},{x:0,z:0},traits,[]);sim.step(.05,p,{x:0,z:0},traits,[]);assert.equal(sim.airborne,true);
});
test('eclipse extinguishes pillar visuals, healing, reveal, and enemy repulsion until it ends',()=>{
 const sim=new EnvironmentSimulation(createEnvironmentLayout('shadow')),view=new EnvironmentView(sim.layout),lamp=sim.layout.lamps[0];sim.lightPillar(lamp.id);view.update(sim);const flame=view.nodes.find(n=>n.kind==='light-pillar'&&n.index===lamp.id)!.mesh.getObjectByName('flame')!;assert.equal(flame.visible,true);
 sim.eclipseUntil=10;view.update(sim);assert.equal(flame.visible,false);assert.equal(sim.inLight(lamp),false);assert.equal(sim.enemyLightObstacles().length,0);assert.equal(sim.step(.1,lamp,{x:0,z:0},{speed:6,maxHp:100},[]).heal,0);
 sim.time=10;view.update(sim);assert.equal(flame.visible,true);assert.equal(sim.inLight(lamp),true);assert.ok(sim.enemyLightObstacles().length>0);
});
test('a peer renders and locally follows a shared Titan pull without awarding damage',()=>{
 const host=world();host.planet='candy';host.environment=new EnvironmentSimulation(createEnvironmentLayout('candy'));host.localPlayerId='host';host.position.set(30,0,10);const e=host.spawnSpecies('titan_hydra',30,0,0)!;const targets=[{id:'peer',x:30,z:10}],from={x:30,z:0,radius:e.radius,facing:0};e.titanAttacks=[beginTitanAttack('pull',from,titanTelegraphs('pull',from,targets[0],targets),targets)];
 const peer=world();peer.planet='candy';peer.environment=new EnvironmentSimulation(createEnvironmentLayout('candy'));peer.localPlayerId='peer';peer.setNetworkRole('peer');peer.position.set(30,0,10);let damage=0;peer.onDamage=()=>damage++;peer.applyEnemySnapshots(host.enemySnapshots());peer.update(.05,true,false);assert.ok(peer.position.z<10);assert.ok(peer.enemies[0].titanAttacks![0].age>0);assert.equal(damage,0);assert.ok(peer.scene.getObjectByName('titan-attacks')?.children.length);
 const snap=host.enemySnapshots();snap[0].hp=0;peer.applyEnemySnapshots(snap);peer.update(.05,true,false);assert.deepEqual(peer.enemies[0].titanAttacks,[]);
});

test('online mining submits each strike once and reports server progress instead of granting a local reward',async()=>{
 const w=world();w.build('ocean');const clam=w.entities.find(e=>e.kind==='clam')!,events:string[]=[],calls:unknown[]=[];w.onEnvironmentEvent=e=>events.push(e.message??'');w.authoritativeAction=async intent=>{calls.push(intent);return {hits:calls.length,required:3};};
 const before={...w.state.bag};w.interactEnvironment(clam);await new Promise(r=>setImmediate(r));assert.equal(calls.length,1);assert.equal(events.at(-1),'Mining 1/3 strikes.');
 w.interactEnvironment(clam);await new Promise(r=>setImmediate(r));assert.equal(calls.length,2);assert.deepEqual(w.state.bag,before);assert.equal(clam.mesh.userData.hits,undefined);
});
test('a rejected turtle ride remains on shore and an accepted ride starts its 45-second protection',async()=>{
 const w=world();w.build('ocean');const turtle=w.entities.find(e=>e.kind==='turtle')!;w.authoritativeAction=async()=>{throw new Error('Too far away.');};w.interactEnvironment(turtle);await new Promise(r=>setImmediate(r));assert.equal(w.environment.riding,false);assert.equal(turtle.mesh.visible,true);
 w.authoritativeAction=async intent=>{assert.deepEqual(intent,{type:'rideTurtle',payload:{index:turtle.index}});return true;};w.interactEnvironment(turtle);await new Promise(r=>setImmediate(r));assert.equal(w.environment.rideUntil-w.environment.time,45);assert.equal(turtle.mesh.visible,false);
});
test('online idle and pillar healing cannot change HP before the server profile arrives',()=>{
 const w=world();w.build('home');w.state.hp=10;w.authoritativeAction=async()=>true;w.update(1,true,false);assert.equal(w.state.hp,10);
 w.build('shadow');const lamp=w.environment.layout.lamps[0];w.environment.lightPillar(lamp.id);w.position.set(lamp.x,0,lamp.z);w.update(.1,true,false);assert.equal(w.state.hp,10);
});
