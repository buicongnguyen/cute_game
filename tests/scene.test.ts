import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {World,HERO_SCALE,HERO_MODEL_HEIGHT} from '../src/world.ts';
import {ENEMY_TYPES,ENEMY_SCALE,enemyScale} from '../src/enemy-types.ts';

const explorer=HERO_MODEL_HEIGHT*HERO_SCALE;
/** A species' drawn height, measured on the game's own model at the scale the game draws it. */
function drawnHeight(type:string){
  const w=Object.create(World.prototype) as any,def=ENEMY_TYPES[type],g=w.speciesModel(def) as T.Group;
  g.scale.setScalar(enemyScale(type,def.boss));g.updateMatrixWorld(true);
  return new T.Box3().setFromObject(g).max.y;
}

test('every common creature stands 0.55-0.8x the explorer, as in the reference (CC-05, RC-04)',()=>{
  for(const [type,def] of Object.entries(ENEMY_TYPES)){
    if(def.boss)continue;
    assert.ok(ENEMY_SCALE[type],`${type} has a scale`);
    const ratio=drawnHeight(type)/explorer;
    assert.ok(ratio>=.55&&ratio<=.8,`${type}: ${ratio.toFixed(2)}x the explorer`);
  }
});

test('bosses keep their size and still tower over the explorer',()=>{
  for(const [type,def] of Object.entries(ENEMY_TYPES))if(def.boss){assert.equal(enemyScale(type,true),1.85);assert.ok(drawnHeight(type)>explorer,type);}
});

test('a spawned creature is drawn, picked and labelled at its smaller size',()=>{
  const w=Object.assign(Object.create(World.prototype),{state:{},root:new T.Group(),entities:[],enemies:[],planet:'home'}) as any;
  const e=w.spawnSpecies('mushroom',40,0,0);
  assert.equal(e.mesh.scale.x,ENEMY_SCALE.mushroom);
  const h=w.modelHeight(e);assert.ok(Math.abs(h-drawnHeight('mushroom'))<.05,`pick height ${h}`);
  // A hit swell at measuring time does not change the cached height.
  e.mesh.userData.pickHeight=undefined;e.mesh.scale.multiplyScalar(1.5);assert.ok(Math.abs(w.modelHeight(e)-h)<.05);
});

// ---- Scenery around fights: clearings, lookalikes, tiles, shadows, the occluder fade, cover cards, dark planets.
import {DECOR,CLEARING,LOOKALIKES} from '../src/biomes.ts';
import {buildScatter,updateScatterShadows,tallPiecesNear,SCATTER_TILE,SHADOW_REACH,LOW_DECOR,TALL_DECOR,partsExtent,fallbackParts,type TallPiece} from '../src/scatter.ts';
import {OccluderFade,blocks,FADE} from '../src/occluders.ts';
import {newGame} from '../src/model.ts';
import type {PlanetId} from '../src/model.ts';

function built(planet:PlanetId){
  const w=Object.assign(Object.create(World.prototype),{
    state:newGame(),scene:new T.Scene(),camera:new T.PerspectiveCamera(40,4/3,.5,300),root:new T.Group(),player:new T.Group(),companion:new T.Group(),position:new T.Vector3(),
    destination:null,route:[],selected:null,obstacles:[],entities:[],enemies:[],plotMeshes:[],cropSignatures:[],particles:[],keys:new Set<string>(),facing:0,time:0,planet:'home',hazardTimer:0,
    marker:new T.Mesh(),ring:new T.Mesh(),cameraTarget:new T.Vector3(),sun:new T.DirectionalLight(),raycaster:new T.Raycaster(),onInteract(){},onAttackEnemy(){},onDamage(){},onZone(){},
  }) as any;
  w.build(planet);return w;
}

test('creatures spawn in clearings: no tree or rock within 4.5 m, so wandering (2 m) keeps 2.5 m from tall decor (CC-06, CC-7)',()=>{
  for(const planet of ['home','candy','ice','lava','toy','jungle','ocean','cloud','shadow'] as PlanetId[]){
    const w=built(planet),homes=w.enemies.filter((e:any)=>e.respawn<999999);
    assert.ok(homes.length>10,planet);
    for(const e of homes)for(const p of w.decor){
      if(DECOR[p.type]?.cover&&!LOOKALIKES[p.type]?.includes(e.type))continue; // ground cover may grow in a clearing, unless it mimics the creature
      const d=Math.hypot(p.x-e.homeX,p.z-e.homeZ),limit=LOOKALIKES[p.type]?.includes(e.type)?CLEARING.lookalike:p.radius>0?CLEARING.blocking:CLEARING.low;
      if(Math.hypot(p.x,p.z)>=149)continue; // the border rows stand outside the walkable circle
      assert.ok(d>=limit-1e-9,`${planet}: ${p.type} ${d.toFixed(2)} m from a ${e.type}`);
    }
  }
});

test('scatter tiles are 32 m; cover and low pieces never cast; taller ones cast only within 20 m of the camera target',()=>{
  assert.equal(SCATTER_TILE,32);
  const w=built('home'),group=w.root.getObjectByName('scatter') as T.Group,meshes:T.InstancedMesh[]=[];
  group.traverse(o=>{if(o instanceof T.InstancedMesh&&o.userData.scatter)meshes.push(o);});
  for(const m of meshes){const s=m.boundingSphere!;assert.ok(s.radius<SCATTER_TILE*1.5,`${m.userData.scatter} batch spans one tile`);}
  updateScatterShadows(group,-60,0);
  for(const m of meshes){
    const type=m.userData.scatter,low=DECOR[type]?.cover||partsExtent(fallbackParts(type)).height<LOW_DECOR,s=m.boundingSphere!,near=Math.hypot(s.center.x+60,s.center.z)-s.radius<SHADOW_REACH;
    assert.equal(m.castShadow,!low&&near,`${type} at ${s.center.x.toFixed(0)},${s.center.z.toFixed(0)}`);
  }
  assert.ok(meshes.some(m=>m.castShadow)&&meshes.some(m=>!m.castShadow&&!DECOR[m.userData.scatter]?.cover));
});

test('a tall piece between the camera and the explorer fades to 35% in 0.15 s, then returns to its batch',()=>{
  const w=built('home'),group=w.root.getObjectByName('scatter') as T.Group,fade=new OccluderFade(group);
  const piece=tallPiecesNear(group,-60,10,30).find(p=>p.height>2.5)!;assert.ok(piece&&piece.height>TALL_DECOR);
  // The explorer stands just north of the piece; the camera looks from the south, as the game's does.
  const hero=new T.Vector3(piece.x,1,piece.z-1),eye=hero.clone().add(new T.Vector3(0,17,13.5)),away=new T.Vector3(piece.x+30,1,piece.z);
  assert.ok(blocks(piece,eye,hero));assert.ok(!blocks(piece,away.clone().add(new T.Vector3(0,17,13.5)),away));
  const original=new T.Matrix4();piece.meshes[0].getMatrixAt(piece.index,original);
  for(let t=0;t<.2;t+=.025)fade.update(.025,eye,[hero],hero);
  assert.ok(Math.abs(fade.fadeOf(piece)-FADE.alpha)<1e-9,'faded to 35%');
  const hidden=new T.Matrix4();piece.meshes[0].getMatrixAt(piece.index,hidden);assert.equal(hidden.elements[0],0,'moved out of its tile batch');
  const overlay=group.children.find(o=>o.userData.fadeOverlay) as T.InstancedMesh;assert.ok(overlay&&overlay.count>=1&&(overlay.material as T.Material).alphaHash);
  for(let t=0;t<.4;t+=.025)fade.update(.025,eye,[away],away);
  assert.equal(fade.fadedPieces().length,0);const back=new T.Matrix4();piece.meshes[0].getMatrixAt(piece.index,back);assert.ok(back.equals(original),'back in its batch');
});

test('the occluder check is cheap: the forest around a fight costs well under a millisecond',()=>{
  const w=built('home'),group=w.root.getObjectByName('scatter') as T.Group,fade=new OccluderFade(group),hero=new T.Vector3(-60,1,10),eye=hero.clone().add(new T.Vector3(0,17,13.5));
  const near:TallPiece[]=tallPiecesNear(group,hero.x,hero.z,FADE.reach);assert.ok(near.length>5,'some trees around');
  const start=performance.now();for(let i=0;i<100;i++)fade.update(.1,eye,[hero,hero.clone().setY(1.7)],hero,true);
  assert.ok((performance.now()-start)/100<1,'per check');
});

test('dark planets: creatures near the explorer show glowing eyes through the darkness (C8)',()=>{
  const w=built('shadow');w.update(.025,true,false);
  const e=w.enemies.find((e:any)=>e.hp>0&&!e.boss)!;w.position.set(e.x+3,0,e.z);
  const glints=w.eyeGlints();assert.ok(glints.some((g:any)=>g.creature===e),'the nearby creature has eyes in the dark');
  w.update(.025,true,false);const eyes=w.root.getObjectByName('eye-glints') as T.InstancedMesh;assert.ok(eyes?.visible&&eyes.count>=2);
  const home=built('home');home.update(.025,true,false);assert.equal(home.eyeGlints().length,0);
});
