import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {World,HERO_SCALE} from '../src/world.ts';
import {RefinedAssetLibrary} from '../src/assets.ts';
import {attackRange} from '../src/combat.ts';
import {claimGift,newGame,plant,weaponStats} from '../src/model.ts';
import * as M from '../src/model.ts';
import {EnvironmentSimulation,createEnvironmentLayout} from '../src/environments.ts';
import {lavaEvent} from '../src/lava-weather.ts';

// Exercise actual world behavior with real Three objects; only WebGL is omitted.
function world() {
  return Object.assign(Object.create(World.prototype), {
    state:newGame(),scene:new T.Scene(),camera:new T.PerspectiveCamera(40,4/3,.5,300),
    root:new T.Group(),player:new T.Group(),companion:new T.Group(),position:new T.Vector3(),
    destination:null,route:[],selected:null,obstacles:[],entities:[],enemies:[],plotMeshes:[],cropSignatures:[],
    particles:[],keys:new Set<string>(),facing:0,time:0,planet:'home',hazardTimer:0,
    marker:new T.Mesh(),ring:new T.Mesh(),cameraTarget:new T.Vector3(),sun:new T.DirectionalLight(),raycaster:new T.Raycaster(),
    onInteract(){},onAttackEnemy(){},onDamage(){},onZone(){},
  }) as World;
}

test('world movement reaches a fractional goal beside a tree without corner cutting',()=>{
  const w=world();w.build('home');w.position.set(23.364043668843806,0,-23.966000208165497);
  const target=new T.Vector3(-25.25037911720574,0,43.94605067325756);
  w.walkTo(target.x,target.z);assert.ok(w.route.length>0);
  for(let i=0;i<3000&&w.route.length;i++){w.update(.025,true,false);assert.equal(w.blocked(w.position.x,w.position.z),false);}
  assert.equal(w.route.length,0);assert.ok(w.position.distanceTo(target)<.001);
});

test('clicking a stunned boss moves inside the same reach accepted by the attack',()=>{
  const w=world();w.spawnEnemy(3,0,1,'Boss',false,true);
  const enemy=w.enemies[0];enemy.stun=999;let attacks=0;
  w.onAttackEnemy=e=>{if(Math.hypot(e.x-w.position.x,e.z-w.position.z)<=attackRange(weaponStats(w.state),e.radius))attacks++;};
  w.select(enemy);assert.ok(w.route.length>0);assert.equal(attacks,0);
  for(let i=0;i<60&&!attacks;i++)w.update(.025,true,false);
  assert.ok(attacks>0);assert.ok(Math.hypot(enemy.x-w.position.x,enemy.z-w.position.z)<=attackRange(weaponStats(w.state),enemy.radius));
});

test('a blaster click attacks at range without first walking into melee distance',()=>{
  const w=world();w.state.gear.weapon='gun_bubble';w.spawnEnemy(6,0,1,'Sprout');let attacks=0;
  w.onAttackEnemy=()=>attacks++;w.select(w.enemies[0]);
  assert.equal(attacks,1);assert.equal(w.destination,null);assert.equal(w.route.length,0);assert.equal(w.position.x,0);
});

test('hidden or removed presents do not intercept a click on the ground',()=>{
  Object.assign(globalThis,{innerWidth:800,innerHeight:600});
  for(const removed of [false,true]){
    const w=world();w.position.set(0,0,4);
    const model=new T.Group();model.add(new T.Mesh(new T.BoxGeometry(1,1,1),new T.MeshBasicMaterial()));model.children[0].position.y=.5;
    const present=w.addEntity('gift','Present','',model,0,0,1);
    if(removed)w.entities=[];else present.mesh.visible=false;
    w.root.updateMatrixWorld(true);w.camera.position.set(0,8,0);w.camera.up.set(0,0,-1);w.camera.lookAt(0,0,0);w.camera.updateMatrixWorld(true);
    w.pointer(400,300);
    assert.equal(w.selected,null);assert.ok(w.destination);assert.ok(w.destination!.length()<.001);
  }
});

test('a target removed while walking is cleared before interaction',()=>{
  const w=world(),model=new T.Group();model.add(new T.Mesh(new T.BoxGeometry(),new T.MeshBasicMaterial()));
  const entity=w.addEntity('gift','Present','',model,5,0,1);let interactions=0;
  w.onInteract=()=>interactions++;w.select(entity);w.entities=[];w.update(.025,true,false);
  assert.equal(w.selected,null);assert.equal(w.destination,null);assert.equal(w.ring.visible,false);assert.equal(interactions,0);
});

test('refining a planted garden preserves the crop group and target wrapper, and instances the beds',async()=>{
  const w=world();w.makePlot(0);plant(w.state,0,'carrot',Date.now()-30000);w.syncCrops();
  const plot=w.entities.find(e=>e.kind==='plot'&&e.index===0)!,crops=w.plotMeshes[0],count=crops.children.length;
  const source=new T.Group();source.add(new T.Mesh(new T.BoxGeometry(),new T.MeshStandardMaterial()));
  const assets=new RefinedAssetLibrary(async()=>source);await assets.loadAll();w.applyRefinedAssets(assets);
  assert.equal(plot.mesh.userData.entity,plot);assert.equal(crops.parent,plot.mesh);assert.equal(crops.children.length,count);
  // No renderer here, so the 3D fallback draws ONE crop per bed (G2D-2), which never casts.
  assert.equal(count,1);crops.traverse(o=>assert.equal(o.castShadow,false));
  // The refined bed is drawn by the instanced bed meshes, not inside the entity (G2D-5).
  assert.equal(plot.mesh.getObjectByName('refined-garden'),undefined);
  const beds=w.scene.getObjectByName('garden-beds')!;assert.ok(beds.children.length>0);
  for(const m of beds.children as T.InstancedMesh[]){assert.ok(m instanceof T.InstancedMesh);assert.equal(m.count,w.state.plots.length);assert.equal(m.castShadow,false);assert.equal(m.receiveShadow,true);}
});

test('a tap ray through a bed still finds the plot entity through its invisible pick box',()=>{
  const w=world();w.build('home');const plot=w.entities.find(e=>e.kind==='plot')!;
  w.raycaster.set(new T.Vector3(plot.x,10,plot.z+.3),new T.Vector3(0,-1,0));
  assert.equal((w as unknown as {raycastEntity(m:T.Object3D[]):unknown}).raycastEntity([plot.mesh]),plot);
});

test('a full 33-bed garden keeps every bed off buildings, props, trees, the pond, the trails and other beds',()=>{
  const w=world();w.state.energy=1e7;while(M.expandGarden(w.state));assert.equal(w.state.plots.length,33);
  w.build('home');const beds=w.entities.filter(e=>e.kind==='plot');assert.equal(beds.length,33);
  const square=(b:{x:number;z:number},x:number,z:number)=>Math.hypot(Math.max(0,Math.abs(b.x-x)-M.BED_HALF),Math.max(0,Math.abs(b.z-z)-M.BED_HALF));
  for(const b of beds){
    for(const o of w.obstacles)assert.ok(square(b,o.x,o.z)>=o.r-1e-9,`bed ${b.index} at ${b.x},${b.z} overlaps obstacle ${o.x},${o.z}`);
    for(const e of w.entities)if(e.kind!=='plot'&&e.kind!=='enemy')assert.ok(square(b,e.x,e.z)>=Math.min(e.radius,3.6)-1e-9,`bed ${b.index} overlaps ${e.kind}`);
    for(const o of beds)if(o!==b)assert.ok(Math.max(Math.abs(o.x-b.x),Math.abs(o.z-b.z))>=M.BED_GAP);
    assert.ok(M.clearOfPen(b.x,b.z,M.BED_HALF),'beds keep off the animal pen and the path around it');
    // The starting garden sits where the west trail would run (its stones skip it); new beds keep off every trail.
    if(b.index!>=9)assert.ok(Math.abs(b.x)>=1.4&&Math.abs(b.z)>=1.4,'beds stay off the stepping-stone trails');
  }
  assert.equal(w.bedDraws>0,true);
});

test('toy gifts retain stable IDs and positions across a cooldown and rebuild',()=>{
  const w=world();w.state.planet='toy';w.build('toy');
  const positions=new Map(w.entities.filter(e=>e.kind==='gift').map(e=>[e.index,[e.x,e.z]]));
  const obstacles=w.obstacles.map(o=>({...o}));
  assert.ok(claimGift(w.state,2));w.build('toy');
  const gifts=w.entities.filter(e=>e.kind==='gift');assert.equal(gifts.length,26);
  assert.equal(gifts.find(e=>e.index===2)!.mesh.visible,false);
  gifts.forEach(e=>assert.deepEqual([e.x,e.z],positions.get(e.index)));
  assert.deepEqual(w.obstacles,obstacles);
  assert.deepEqual(w.entities.filter(e=>e.kind==='mine').map(e=>[e.id,e.index]),[['toy:mine:0',0],['toy:mine:1',1]]);
  w.state.worldRewards.giftReadyAt.toy![2]=Date.now()-1;w.update(.02,true,false);assert.equal(gifts.find(e=>e.index===2)!.mesh.visible,true);
});

test('creatures route around scenery without penetrating their radius',()=>{
  const w=world();w.environment=new EnvironmentSimulation(createEnvironmentLayout('home'));w.position.set(29,0,0);w.obstacles=[{x:25,z:0,r:1.2}];
  const enemy=w.spawnSpecies('wolf',21,0,0)!;let attacked=false;w.onDamage=()=>{attacked=true;};
  for(let frame=0;frame<700&&!attacked;frame++){w.update(.025,true,false);assert.ok(Math.hypot(enemy.x-25,enemy.z)>=1.2+enemy.radius-.001);}
  assert.ok(attacked,'wolf should eventually go around the rock and attack');
});

test('peers retain local movement while only hosts simulate creatures behind a modal',()=>{
  const w=world();w.planet='candy';w.environment=new EnvironmentSimulation(createEnvironmentLayout('candy'));w.position.set(36,0,0);const enemy=w.spawnSpecies('gummy',30,0,0)!;
  w.setNetworkRole('peer');w.keys.add('ArrowDown');w.update(.1,true,false);assert.equal(enemy.x,30);assert.ok(w.position.z>0);
  w.setNetworkRole('host');const oldZ=w.position.z;w.update(.1,false,false);assert.ok(enemy.x>30);assert.equal(w.position.z,oldZ);
});

test('enemy and hazard snapshots preserve host migration combat state',()=>{
  const w=world();w.environment=new EnvironmentSimulation(createEnvironmentLayout('shadow'));const e=w.spawnSpecies('spider',30,1,0)!;
  Object.assign(e,{phase:'windup',phaseTime:.3,stun:2,statuses:{slow:4},cooldown:.7});w.environment.time=40;w.environment.lightPillar(2);
  const copy=world();copy.environment=new EnvironmentSimulation(createEnvironmentLayout('shadow'));copy.applyEnemySnapshots(w.enemySnapshots());copy.applyEnvironmentSnapshot(w.environmentSnapshot());
  assert.equal(copy.enemies[0].phase,'windup');assert.equal(copy.enemies[0].phaseTime,.3);assert.equal(copy.enemies[0].statuses!.slow,4);assert.equal(copy.environment.time,40);assert.equal(copy.environment.lamps.get(2),190);
});

test('remote avatars are separate from obstacles and refresh equipment without duplicates',()=>{
  const w=world();w.addRemotePlayer('friend',{x:3,z:4,color:'#abcdff',gear:{weapon:'gun_bubble',pet:'pet_bunny'}});const first=w.remotePlayers.get('friend')!.mesh;
  w.updateRemotePlayer('friend',{x:5,z:6,gear:{weapon:'sword_lava',disguise:'dz_mecha'}});assert.notEqual(w.remotePlayers.get('friend')!.mesh,first);assert.equal(w.remoteRoot.children.length,1);assert.equal(w.obstacles.length,0);
  w.clearRemotePlayers();assert.equal(w.remotePlayers.size,0);assert.equal(w.remoteRoot.children.length,0);
});

test('home includes nine plots and exact regional creature populations within full bounds',()=>{
  const w=world();w.build('home');assert.equal(w.plotMeshes.length,9);assert.equal(w.enemies.length,150);assert.equal(w.enemies.filter(e=>e.boss).length,4);
  assert.ok(w.enemies.some(e=>Math.hypot(e.x,e.z)>100));assert.equal(w.blocked(149,0),true);
  assert.deepEqual(w.entities.filter(e=>e.kind==='plot').slice(0,3).map(e=>[e.x,e.z]),[[-10.95,.05],[-9.15,.05],[-7.35,.05]]);
});

test('follow-up damage cannot shorten an active crowd-control stun',()=>{
  const w=world();const enemy=w.spawnSpecies('mushroom',3,0,0)!;w.damageEnemy(enemy,1,3);w.damageEnemy(enemy,1,0);assert.equal(enemy.stun,3);
});

test('charmed ranged creatures shoot other enemies without hurting their explorer',()=>{
  const w=world();w.planet='candy';w.environment=new EnvironmentSimulation(createEnvironmentLayout('candy'));w.position.set(2,0,0);const shooter=w.spawnSpecies('lollipop',0,0,0)!,target=w.spawnSpecies('jelly',5,0,1)!;
  target.stun=999;w.statusEnemy(shooter,'charm',10);let playerDamage=0;w.onDamage=()=>playerDamage++;
  for(let i=0;i<120&&target.hp===target.maxHp;i++)w.update(.025,true,false);
  assert.ok(target.hp<target.maxHp);assert.equal(playerDamage,0);
});

test('boss slam warns before damaging everyone inside its area beyond melee reach',()=>{
  const w=world();w.environment=new EnvironmentSimulation(createEnvironmentLayout('home'));w.position.set(32,0,0);const e=w.spawnSpecies('bear',30,0,0)!;e.attackCount=1;let damage=0,remoteDamage=0;
  w.onDamage=n=>{damage+=n;};w.addRemotePlayer('friend',{x:34.4,z:0,hp:100});w.onRemoteDamage=()=>remoteDamage++;
  w.update(.025,true,false);assert.equal(e.skill,'slam');assert.equal(damage,0);assert.equal(e.telegraphs![0].r,4.8);
  w.position.x=34.4;for(let i=0;i<45;i++)w.update(.025,true,false);assert.equal(damage,e.damage*1.6);assert.equal(remoteDamage,1);
});

test('boss quake damages a distant ring only after its delayed outward pulse',()=>{
  const w=world();w.environment=new EnvironmentSimulation(createEnvironmentLayout('home'));w.position.set(32,0,0);const e=w.spawnSpecies('bear',30,0,0)!;e.attackCount=1;e.skillCount=2;e.hp=e.maxHp*.2;let hits=0;
  w.onDamage=()=>hits++;w.update(.025,true,false);assert.equal(e.skill,'quake');w.position.x=38.3;
  for(let i=0;i<60;i++)w.update(.025,true,false);assert.equal(hits,0);
  for(let i=0;i<20;i++)w.update(.025,true,false);assert.equal(hits,1);
});

test('collected shared meteor rewards are authorized once and deduplicated in the save',()=>{
  const w=world();w.planet='lava';w.environment=new EnvironmentSimulation(createEnvironmentLayout('lava'));w.environment.weather.ores.push({id:'lava:meteor:one',kind:'meteor',x:35,z:2,y:0,expiresAt:90});
  const result=w.applyEnvironmentAction({kind:'collect-ore',id:'lava:meteor:one'});assert.ok(result.ok);assert.equal(w.applyEnvironmentAction({kind:'collect-ore',id:'lava:meteor:one'}).ok,false);
  assert.equal(w.grantEnvironmentReward('ack:one',result.rewards!),true);const inventory={...w.state.bag};assert.equal(w.grantEnvironmentReward('ack:one',result.rewards!),false);assert.deepEqual(w.state.bag,inventory);
});

test('magma slime splits into three dormant minions and uses stable entity IDs',()=>{
  const w=world();w.planet='lava';w.environment=new EnvironmentSimulation(createEnvironmentLayout('lava'));const slime=w.spawnSpecies('magmaslime',30,30,0)!;
  for(let i=1;i<=3;i++){const minion=w.spawnSpecies('minislime',0,0,i)!;minion.hp=0;minion.respawn=999999;}
  w.damageEnemy(slime,slime.hp);assert.equal(w.enemies.filter(e=>e.type==='minislime'&&e.hp>0).length,3);assert.equal(new Set(w.enemies.map(e=>e.id)).size,4);
});

test('turtle shell armor and its recovery weakness do not modify environmental damage',()=>{
  const w=world(),enemy=w.spawnSpecies('magmaturtle',30,0,0)!;const hp=enemy.hp;
  w.damageEnemy(enemy,100);assert.equal(enemy.hp,hp-12);
  enemy.phase='recover';w.damageEnemy(enemy,10);assert.equal(enemy.hp,hp-32);
  w.damageEnemy(enemy,10,0,true);assert.equal(enemy.hp,hp-42);
});

test('received boss projectiles animate without peer damage and survive host migration',()=>{
  const host=world();host.planet='candy';host.environment=new EnvironmentSimulation(createEnvironmentLayout('candy'));host.position.set(32,0,0);
  const boss=host.spawnSpecies('cake',30,0,0)!;boss.attackCount=1;host.update(.01,true,false);assert.equal(boss.skill,'barrage');
  for(let i=0;i<37;i++)host.update(.025,true,false);const snapshots=host.enemySnapshots();assert.ok(snapshots[0].shots!.length>0);snapshots[0].shots=snapshots[0].shots!.slice(0,1);
  const peer=world();peer.planet='candy';peer.environment=new EnvironmentSimulation(createEnvironmentLayout('candy'));peer.setNetworkRole('peer');peer.applyEnemySnapshots(snapshots);
  const shot=peer.enemySnapshots()[0].shots![0];peer.position.set(shot.x+shot.vx*.01,0,shot.z+shot.vz*.01);let hits=0;peer.onDamage=()=>hits++;
  peer.update(.01,true,false);assert.equal(hits,0);const moved=peer.enemySnapshots()[0].shots!.find(s=>s.id===shot.id)!;assert.ok(Math.hypot(moved.x-shot.x,moved.z-shot.z)>0);
  peer.setNetworkRole('host');peer.update(.001,true,false);assert.equal(hits,1);
  snapshots[0].shots=[];peer.applyEnemySnapshots(snapshots);assert.equal(peer.enemySnapshots()[0].shots!.length,0);
});

test('fire crystal and obsidian deposits require their own strike counts and persistent regrowth',()=>{
  const w=world();w.planet='lava';w.environment=new EnvironmentSimulation(createEnvironmentLayout('lava'));
  for(const [kind,item,hits] of [['fire-crystal','fcrystal',2],['obsidian-ore','obsidian',4],['magma-ore','mcrystal',3]] as const){
    const entity=w.addEntity(kind,'Ore','',new T.Group(),20,0,1),before=w.state.bag[item]??0;
    for(let hit=1;hit<hits;hit++){assert.match(w.interactEnvironment(entity)!.message,/Mining/);assert.equal(w.state.bag[item]??0,before);}
    w.interactEnvironment(entity);const count=w.state.bag[item]-before;assert.ok(count>=(kind==='magma-ore'?2:1)&&count<=(kind==='magma-ore'?3:2));
    w.interactEnvironment(entity);assert.equal(w.state.bag[item]-before,count);assert.equal(entity.mesh.visible,false);
  }
});

test('chased creatures retain aggro beyond initial sight and return home with healing after the leash',()=>{
  const w=world();w.environment=new EnvironmentSimulation(createEnvironmentLayout('home'));w.position.set(38,0,0);const e=w.spawnSpecies('wolf',30,0,0)!;
  w.update(.02,true,false);assert.equal(e.phase,'chase');w.position.x=45;w.update(.02,true,false);assert.equal(e.phase,'chase');
  e.hp=e.maxHp*.5;e.x=61;w.position.x=70;w.update(.1,true,false);assert.equal(e.phase,'return');assert.ok(e.hp>e.maxHp*.5);assert.ok(e.x<61);
});

test('grounded enemies will not chase across lava but burrowing worms can cross',()=>{
  const w=world();w.planet='lava';w.environment=new EnvironmentSimulation(createEnvironmentLayout('lava'));w.environment.time=300;
  const pool=w.environment.layout.pools[0],e=w.spawnSpecies('magmacrab',pool.x-pool.r-1,pool.z-6,0)!;
  w.position.set(pool.x-10,0,pool.z-6);
  for(let i=0;i<30;i++)w.update(.025,true,false);assert.equal(w.environment.lavaAt(e),false);
  const worm=w.spawnSpecies('lavaworm',pool.x-pool.r-1,pool.z-6,1)!;worm.cooldown=999;
  for(let i=0;i<30;i++)w.update(.025,true,false);assert.equal(w.environment.lavaAt(worm),true);assert.equal(worm.hp,worm.maxHp);
});

test('planet landing pads are safe and pursuing creatures remain outside their boundary',()=>{
  const w=world();w.planet='candy';w.environment=new EnvironmentSimulation(createEnvironmentLayout('candy'));const enemy=w.spawnSpecies('gummy',13,0,0)!;
  w.position.set(10,0,0);let hits=0;w.onDamage=()=>hits++;
  for(let i=0;i<100;i++)w.update(.025,true,false);assert.equal(hits,0);assert.ok(Math.hypot(enemy.x,enemy.z)>=12.5-.001);
});

test('dragon later-phase rain creates extra fire warnings that survive environment snapshots',()=>{
  const w=world();w.planet='lava';w.environment=new EnvironmentSimulation(createEnvironmentLayout('lava'));w.environment.time=300;const p=w.environment.layout.nest;w.position.set(p.x+2,0,p.z);
  const dragon=w.spawnSpecies('dragon',p.x,p.z,0)!;dragon.scaled=true;dragon.hp=dragon.maxHp*.6;dragon.attackCount=1;dragon.skillCount=1;w.update(.01,true,false);
  assert.equal(dragon.skill,'rain');assert.equal(dragon.bossStage,2);assert.equal(w.environment.fireRain.length,3);
  const peer=world();peer.planet='lava';peer.environment=new EnvironmentSimulation(createEnvironmentLayout('lava'));peer.applyEnvironmentSnapshot(w.environmentSnapshot());assert.deepEqual(peer.environment.fireRain,w.environment.fireRain);assert.equal(peer.environment.nestLevel,w.environment.nestLevel);
});

test('bat-type creatures orbit at five metres, then wind up and dive through the target',()=>{
  const w=world();w.environment=new EnvironmentSimulation(createEnvironmentLayout('home'));w.position.set(40,0,0);const bat=w.spawnSpecies('firebat',45,0,0)!;bat.cooldown=10;
  for(let i=0;i<120;i++)w.update(.025,true,false);assert.ok(Math.abs(bat.z)>1);assert.ok(Math.abs(Math.hypot(bat.x-40,bat.z)-5)<.2);
  bat.cooldown=0;w.update(.025,true,false);assert.equal(bat.phase,'windup');let hits=0;w.onDamage=()=>hits++;const from={x:bat.x-40,z:bat.z};
  for(let i=0;i<70;i++)w.update(.025,true,false);assert.equal(hits,1);assert.ok(Math.hypot(bat.x-40,bat.z)>1);
  // The dive is not stopped at the explorer's body: the bat ends well past it, on the far side.
  const along=((bat.x-40)*from.x+bat.z*from.z)/Math.hypot(from.x,from.z);assert.ok(along<-3,`the bat ends ${along.toFixed(2)} m along its approach`);
});

test('a charging boar runs through the explorer and ends on the far side',()=>{
  const w=world();w.environment=new EnvironmentSimulation(createEnvironmentLayout('home'));w.position.set(40,0,0);const boar=w.spawnSpecies('boar',46,0,0)!;let hits=0;w.onDamage=()=>hits++;
  let from:{x:number;z:number}|null=null;for(let i=0;i<200&&!from;i++){w.update(.025,true,false);if(boar.phase==='charge')from={x:boar.x-40,z:boar.z};}
  assert.ok(from,'the boar charges');for(let i=0;i<40&&boar.phase==='charge';i++)w.update(.025,true,false);
  assert.equal(hits,1);const along=((boar.x-40)*from!.x+boar.z*from!.z)/Math.hypot(from!.x,from!.z);assert.ok(along<-2,`the boar ends ${along.toFixed(2)} m along its approach`);
});

test('creature separation untangles coincident enemies without moving rooted plants or crossing rocks',()=>{
  const w=world();w.environment=new EnvironmentSimulation(createEnvironmentLayout('home'));w.position.set(40,0,0);w.obstacles=[{x:28,z:0,r:1}];
  const wolves=[0,1,2].map(i=>w.spawnSpecies('wolf',26,0,i)!);const plant=w.spawnSpecies('chomper',25.6,0,3)!;const origin={x:plant.x,z:plant.z};
  for(const e of w.enemies)e.stun=999;for(let i=0;i<30;i++)w.update(.025,true,false);
  assert.deepEqual({x:plant.x,z:plant.z},origin);for(const e of wolves){assert.ok(Math.hypot(e.x-28,e.z)>=1+e.radius-.001);for(const other of w.enemies)if(other!==e)assert.ok(Math.hypot(e.x-other.x,e.z-other.z)>=e.radius+other.radius-.02);}
  w.setNetworkRole('peer');wolves[1].x=wolves[0].x;wolves[1].z=wolves[0].z;w.update(.1,true,false);assert.equal(wolves[1].x,wolves[0].x);assert.equal(wolves[1].z,wolves[0].z);
});

test('ending a dragon event dismisses the boss without defeat rewards',()=>{
  const w=world();w.planet='lava';w.environment=new EnvironmentSimulation(createEnvironmentLayout('lava'));let cycle=0;while(lavaEvent(cycle*360).id!=='dragon')cycle++;
  const dragon=w.spawnSpecies('dragon',-96,58,0)!;dragon.hp=0;dragon.respawn=999999;let hazardHits=0;w.onHazardEnemy=()=>hazardHits++;
  w.environment.time=cycle*360+239.9;w.update(.01,true,false);assert.equal(dragon.hp,dragon.maxHp);w.update(.2,true,false);assert.equal(dragon.hp,0);assert.equal(hazardHits,0);assert.equal(dragon.mesh.visible,false);assert.ok(dragon.respawn>999000);
});

test('cloud lightning countdown and warnings survive peer snapshots and host migration',()=>{
  const host=world();host.planet='cloud';host.environment=new EnvironmentSimulation(createEnvironmentLayout('cloud'));host.position.set(0,0,0);host.update(6.1,true,false);assert.equal(host.environment.lightning.bolts.length,1);
  const peer=world();peer.planet='cloud';peer.environment=new EnvironmentSimulation(createEnvironmentLayout('cloud'));peer.applyEnvironmentSnapshot(host.environmentSnapshot());assert.deepEqual(peer.environment.lightning,host.environment.lightning);
  peer.setNetworkRole('peer');peer.position.set(0,0,0);peer.update(.2,true,false);assert.ok(peer.environment.lightning.bolts[0].remaining<1.2);peer.setNetworkRole('host');peer.update(.2,true,false);assert.equal(peer.environment.lightning.sequence,1);
});

test('the camera follows the explorer at 9/s, looks straight at it, and the sun box sits under the camera target',()=>{
  const w=world();w.build('home');
  assert.deepEqual([(w.scene.fog as T.Fog).near,(w.scene.fog as T.Fog).far],[45,110]);
  w.position.set(10,0,0);w.cameraTarget.set(0,0,0);w.update(.1,true,false);
  assert.ok(Math.abs(w.cameraTarget.x-10*(1-Math.exp(-.9)))<1e-6);
  assert.ok(w.camera.position.clone().sub(w.cameraTarget).distanceTo(new T.Vector3(0,17,13.5))<1e-9);
  w.camera.updateMatrixWorld();const look=w.camera.getWorldDirection(new T.Vector3());
  assert.ok(look.distanceTo(new T.Vector3(0,-17,-13.5).normalize())<1e-6);
  const sun=(w as unknown as {sun:T.DirectionalLight}).sun;
  assert.ok(sun.target.position.distanceTo(new T.Vector3(w.cameraTarget.x,0,w.cameraTarget.z))<.05);
  w.build('shadow');assert.deepEqual([(w.scene.fog as T.Fog).near,(w.scene.fog as T.Fog).far],[14,55]);
});

test('explorers are drawn at the reference hero size, online ones too',()=>{
  const w=world();w.update(.025,true,false);assert.ok(Math.abs(w.player.scale.x-HERO_SCALE)<1e-9);
  w.addRemotePlayer('friend',{x:3,z:4});assert.equal(w.remotePlayers.get('friend')!.mesh.scale.x,HERO_SCALE);
});

test('a host message for another planet cannot leave undefeatable creatures on the minimap (wave 4 minimap bug)',()=>{
  // A late 'enemies' message from the home host lands after the explorer built the candy world.
  const home=world();home.planet='home';home.environment=new EnvironmentSimulation(createEnvironmentLayout('home'));home.spawnSpecies('slime',10,0,0);home.spawnSpecies('gummy',12,0,1);
  const peer=world();peer.planet='candy';peer.environment=new EnvironmentSimulation(createEnvironmentLayout('candy'));const own=peer.spawnSpecies('gummy',30,0,0)!;peer.setNetworkRole('peer');
  peer.applyEnemySnapshots(home.enemySnapshots());
  assert.deepEqual(peer.enemies.map(e=>e.id),['candy:enemy:0'],'no home creatures are spawned into the candy world');
  // The candy host's own reports still apply: a defeat hides the creature and its marker.
  peer.applyEnemySnapshots([{...peer.enemySnapshots()[0],hp:0,respawn:20}]);
  assert.equal(own.hp,0);assert.equal(own.mesh.visible,false);
  assert.equal(peer.enemies.filter(e=>e.hp>0).length,0,'nothing alive is left for the minimap to draw');
});

test('the well by the storage chest is scenery only, like the reference: no entity, prompt or label',()=>{
  const w=world();w.build('home');
  let well:T.Object3D|undefined;w.root.traverse(o=>{if(o.userData.prop==='well')well=o;});
  assert.ok(well,'the well is built');assert.equal(well!.userData.entity,undefined);
  assert.ok(!w.entities.some(e=>Math.hypot(e.x-well!.position.x,e.z-well!.position.z)<1.5),'no interactive entity sits on the well');
});
