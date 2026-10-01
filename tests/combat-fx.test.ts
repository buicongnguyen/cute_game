import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {World} from '../src/world.ts';
import {newGame} from '../src/model.ts';
import {EnvironmentSimulation,createEnvironmentLayout} from '../src/environments.ts';
import {addOutlines,outlineMaterial,outlinesEnabled,setOutlinesEnabled,showOutlines,INK} from '../src/outline.ts';
import {TelegraphDecals} from '../src/telegraph.ts';
import {TargetMarker,TARGET_HOLD,targetRingRadius} from '../src/target-marker.ts';
import {BOSS_CALLOUTS,BOSS_TELEGRAPH_COLORS,CREATURE_TELEGRAPHS,telegraphProgress} from '../src/boss-patterns.ts';
import {Effects} from '../src/fx.ts';
import {QUALITY} from '../src/graphics.ts';

// The same WebGL-free world the other world tests use, plus the combat visuals this file checks.
function world() {
  const w=Object.assign(Object.create(World.prototype), {
    state:newGame(),scene:new T.Scene(),camera:new T.PerspectiveCamera(40,4/3,.5,300),
    root:new T.Group(),player:new T.Group(),companion:new T.Group(),position:new T.Vector3(),
    destination:null,route:[],selected:null,obstacles:[],entities:[],enemies:[],plotMeshes:[],cropSignatures:[],
    particles:[],keys:new Set<string>(),facing:0,time:0,planet:'home',hazardTimer:0,
    marker:new T.Mesh(new T.RingGeometry(.22,.32,8),new T.MeshBasicMaterial()),ring:new T.Mesh(),cameraTarget:new T.Vector3(),sun:new T.DirectionalLight(),raycaster:new T.Raycaster(),
    onInteract(){},onAttackEnemy(){},onDamage(){},onZone(){},
  }) as World;
  w.environment=new EnvironmentSimulation(createEnvironmentLayout('home'));
  w.decals=new TelegraphDecals();w.target=new TargetMarker();
  return w;
}
const ink=new T.Color(INK).getHex();

test('outlines are ink back-face hulls that never catch taps or cast shadows',()=>{
  const model=new T.Group(),body=new T.Mesh(new T.IcosahedronGeometry(.6,1),new T.MeshStandardMaterial()),glow=new T.Mesh(new T.SphereGeometry(.2),new T.MeshBasicMaterial({transparent:true}));
  const scatter=new T.InstancedMesh(new T.BoxGeometry(),new T.MeshStandardMaterial(),4);model.add(body,glow,scatter);
  const hulls=addOutlines(model);
  assert.equal(hulls.length,1,'transparent glow and instanced decor get no outline');
  const hull=hulls[0];assert.equal(hull.parent,body);assert.equal(hull.geometry,body.geometry,'a creature hull shares its geometry');
  assert.equal(hull.material,outlineMaterial());assert.equal(outlineMaterial().side,T.BackSide);assert.equal(outlineMaterial().color.getHex(),ink);
  assert.equal(hull.castShadow,false);
  const ray=new T.Raycaster(new T.Vector3(0,0,5),new T.Vector3(0,0,-1)),hits=ray.intersectObject(model,true);
  assert.ok(hits.length>0&&hits.every(h=>!h.object.userData.outline),'raycasts see the body, never the hull');
  showOutlines(model,false);assert.equal(hull.visible,false);showOutlines(model,true);assert.equal(hull.visible,true);
});

test('the explorer gets one welded hull per animated part, not one per mesh',()=>{
  const hero=new T.Group(),arm=new T.Group(),head=new T.Group();arm.name='arm-left';head.name='head';hero.add(arm,head);
  for(let i=0;i<3;i++){const m=new T.Mesh(new T.BoxGeometry(.2,.4,.2),new T.MeshStandardMaterial());m.position.y=i*.3;arm.add(m);}
  head.add(new T.Mesh(new T.SphereGeometry(.5,8,6),new T.MeshStandardMaterial()),new T.Mesh(new T.ConeGeometry(.2,.3,6),new T.MeshStandardMaterial()));
  const hulls=addOutlines(hero,{merge:true});
  assert.equal(hulls.length,2);assert.deepEqual(hulls.map(h=>h.parent?.name).sort(),['arm-left','head']);
  // Welded: a box's split corner normals become one shared vertex, so the pushed hull has no cracks.
  const armHull=hulls.find(h=>h.parent===arm)!;assert.ok(armHull.geometry.getAttribute('position').count<3*24);
});

test('battery saver turns every outline off with one switch; other tiers keep them',()=>{
  assert.equal(QUALITY.low.outlines,false);assert.equal(QUALITY.medium.outlines,true);assert.equal(QUALITY.high.outlines,true);
  setOutlinesEnabled(false);assert.equal(outlinesEnabled(),false);assert.equal(outlineMaterial().visible,false);
  setOutlinesEnabled(true);assert.equal(outlineMaterial().visible,true);
});

test('creatures are outlined only within 20 m of the view',()=>{
  const w=world();w.position.set(30,0,0);w.cameraTarget.set(30,0,0);
  const near=w.spawnSpecies('wolf',36,0,0)!,far=w.spawnSpecies('wolf',60,0,1)!;near.cooldown=far.cooldown=99;
  assert.ok((near.mesh.userData.outlines as T.Mesh[]).length>0);
  w.update(.025,true,false);
  assert.equal(near.mesh.userData.outlined,true);assert.equal(far.mesh.userData.outlined,false);
  for(const o of near.mesh.userData.outlines as T.Mesh[])assert.equal(o.castShadow,false,'the near-shadow toggle leaves hulls alone');
});

test('telegraph fill is 0 at the start of a wind-up and exactly 1 when the blow lands',()=>{
  assert.equal(telegraphProgress(.88,.88),0);assert.equal(telegraphProgress(.44,.88),.5);assert.equal(telegraphProgress(0,.88),1);assert.equal(telegraphProgress(-.01,.88),1);
  // An enraged boss winds up at 0.8x: the fill follows the real wind-up, not the table value.
  const w=world();w.position.set(32,0,0);const e=w.spawnSpecies('bear',30,0,0)!;e.attackCount=1;e.hp=e.maxHp*.2;let damage=0;w.onDamage=n=>{damage+=n;};
  w.update(.025,true,false);assert.equal(e.skill,'slam');assert.ok(Math.abs(e.windupTotal!-1.1*.8)<1e-9);
  let previous=-1,steps=1,remaining=e.phaseTime!;
  while(!damage&&steps<200){
    const decal=w.decals!.active[0];assert.ok(decal,'the slam disc shows through the whole wind-up');
    assert.equal(decal.color,BOSS_TELEGRAPH_COLORS.slam);assert.equal(decal.r,4.8);
    assert.ok(decal.fill>previous&&decal.fill<1,'the fill grows and is not full before the hit');previous=decal.fill;remaining=e.phaseTime!;
    w.update(.025,true,false);steps++;
  }
  assert.ok(damage>0);
  assert.equal(telegraphProgress(remaining-.025,e.windupTotal!),1,'the blow lands on the step the fill reaches 1');
  const windup=(steps-1)*.025;assert.ok(windup>=e.windupTotal!-1e-9&&windup-.025<e.windupTotal!,'and that step is the first one past the wind-up');
  assert.equal(w.decals!.active.length,0,'the disc is gone once the blow has landed');
});

test('ordinary creatures warn by pose only; the four reference kinds draw a red disc',()=>{
  assert.deepEqual(Object.keys(CREATURE_TELEGRAPHS).sort(),['chomper','firebat','lavaworm','magmaturtle']);
  const w=world();w.position.set(30,0,0);const wolf=w.spawnSpecies('wolf',31.2,0,0)!;
  for(let i=0;i<40&&wolf.phase!=='windup';i++)w.update(.025,true,false);
  assert.equal(wolf.phase,'windup');assert.equal(w.decals!.active.length,0,'no red wind-up ring under an ordinary creature');
  assert.equal(wolf.mesh.getObjectByName('attack-telegraph'),undefined);
  const v=world();v.planet='lava';v.position.set(30,0,0);const turtle=v.spawnSpecies('magmaturtle',31.5,0,0)!;
  for(let i=0;i<40&&turtle.phase!=='windup';i++)v.update(.025,true,false);
  assert.equal(turtle.phase,'windup');const disc=v.decals!.active[0];assert.ok(disc);assert.equal(disc.r,2.6);assert.equal(disc.color,'#ff3b3b');
});

test('a boss wind-up floats one callout above the boss and sends no toast; enrage keeps one toast',()=>{
  const w=world(),callouts:string[]=[],toasts:string[]=[];
  w.fx={text:(_at:unknown,message:string,style:string)=>{if(style.includes('callout'))callouts.push(message);},burst(){},ring(){},spark(){},update(){},shakeOffset:()=>new T.Vector3()} as unknown as Effects;
  w.onEnvironmentEvent=event=>{if(event.message)toasts.push(event.message);};
  w.position.set(32,0,0);const e=w.spawnSpecies('bear',30,0,0)!;e.attackCount=1;
  w.update(.025,true,false);assert.equal(e.skill,'slam');
  assert.deepEqual(callouts,[BOSS_CALLOUTS.slam]);assert.deepEqual(toasts,[]);
  for(let i=0;i<80;i++)w.update(.025,true,false);
  // Below 30% the next wind-up adds the single enrage toast; the one after does not repeat it.
  e.hp=e.maxHp*.2;e.cooldown=0;e.phase='chase';const before=callouts.length;
  for(let i=0;i<200&&callouts.length<before+2;i++){if(e.phase==='chase')e.cooldown=0;w.update(.025,true,false);}
  assert.equal(toasts.length,1);assert.match(toasts[0],/enraged/);
  // Explorers more than 30 m away get no callout.
  const far=world(),seen:string[]=[];far.fx={text:(_a:unknown,m:string)=>seen.push(m),burst(){}} as unknown as Effects;
  const boss=far.spawnSpecies('bear',0,0,0)!;far.position.set(31,0,0);far.bossCallout(boss,'quake');assert.deepEqual(seen,[]);
});

test('the red target ring follows the selection, then the last creature hit for 3 s',()=>{
  const w=world();w.position.set(30,0,0);const e=w.spawnSpecies('wolf',32,0,0)!;e.cooldown=99;
  w.update(.025,true,false);assert.equal(w.target!.root.visible,false);
  w.hitFeedback(e,5,false);w.update(.025,true,false);
  assert.equal(w.target!.root.visible,true);assert.ok(Math.abs(w.target!.ring.position.x-e.mesh.position.x)<1e-6);
  assert.ok(w.target!.ring.scale.x>=targetRingRadius(0,e.radius)*.94,'never smaller than the hit circle');
  for(let t=0;t<TARGET_HOLD;t+=.025)w.update(.025,true,false);
  assert.equal(w.target!.root.visible,false,'the mark clears 3 s after the last hit');
  // A shop keeps the yellow ring; a creature never shows it.
  w.select(e);assert.equal(w.ring.visible,false);
});

test('a tap that picks a creature colours the walk marker red',()=>{
  const w=world();w.position.set(30,0,0);const e=w.spawnSpecies('wolf',40,0,0)!;e.cooldown=99;
  w.walkTo(28,2);assert.equal((w.marker.material as T.MeshBasicMaterial).color.getHexString(),'ffffff');
  w.select(e);assert.equal((w.marker.material as T.MeshBasicMaterial).color.getHexString(),'ff5a5a');
});

test('hit effects are pooled: the second hit reuses the first hit\'s materials',()=>{
  const fx=new Effects(new T.Scene(),new T.PerspectiveCamera());
  fx.ring({x:0,z:0});fx.spark({x:0,z:0});fx.flash({x:0,z:0});fx.slash({x:0,z:0},0);
  for(let i=0;i<60;i++)fx.update(1/60);
  assert.equal(fx.activeCount,0);assert.equal(fx.pooledCount,4);
  const materials=new Set<T.Material>();(fx as unknown as {free:Record<string,{material:T.Material}[]>}).free.ring.forEach(r=>materials.add(r.material));
  fx.ring({x:1,z:1},{color:'#ffe14d'});assert.equal(fx.pooledCount,3,'taken from the pool, not created');
  const active=(fx as unknown as {transients:{material:T.Material}[]}).transients[0];assert.ok(materials.has(active.material));
  fx.clear();assert.equal(fx.pooledCount,4);
});

test('the decal pool redraws without creating meshes each frame',()=>{
  const decals=new TelegraphDecals();
  decals.begin();decals.draw(0,0,0,2,.5,'#ff3b3b');decals.draw(3,0,0,4.8,.2,'#ff5a3b');decals.end();
  const meshes=decals.root.children.length;
  decals.begin();decals.draw(1,0,0,2,.7,'#ff3b3b');decals.end();
  assert.equal(decals.root.children.length,meshes);assert.equal(decals.active.length,1);assert.equal(decals.root.children[1].visible,false);
  assert.ok(Math.abs(decals.active[0].fill-.7)<1e-9);
});
