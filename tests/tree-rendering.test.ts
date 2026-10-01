import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as T from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {KitLibrary} from '../src/assets.ts';
import {buildScatter, fallbackParts, tallPiecesNear, type TallPiece} from '../src/scatter.ts';
import {OccluderFade} from '../src/occluders.ts';
import type {DecorPlacement} from '../src/biomes.ts';

const placement = (x:number,z:number,type='tree_round'):DecorPlacement => ({type,x,z,y:0,scale:1,rotation:.3,radius:.55});
const colorAt = (mesh:T.InstancedMesh,index:number) => {const c=new T.Color();mesh.getColorAt(index,c);return c.toArray();};

test('tree shades are stable across rebuilds, order and graphics quality without adding batches or changing placements',()=>{
  const list=Array.from({length:12},(_,i)=>placement(-32-i*2,4)),saved=structuredClone(list);
  const full=buildScatter(list,fallbackParts),low=buildScatter([...list].reverse(),fallbackParts,.5);
  assert.deepEqual(list,saved);
  const lookup=(group:T.Group)=>{
    const result=new Map<string,number[]>();
    for(const p of tallPiecesNear(group,-40,4,40)){
      const c=colorAt(p.meshes[0],p.index);result.set(`${p.x}:${p.z}`,c);
      for(const mesh of p.meshes){assert.deepEqual(colorAt(mesh,p.index),c);assert.equal(mesh.geometry,fallbackParts('tree_round')[p.meshes.indexOf(mesh)].geometry);}
    }
    return result;
  };
  assert.deepEqual(lookup(full),lookup(low));assert.ok(new Set([...lookup(full).values()].map(String)).size>1);
  const expectedTiles=new Set(list.map(p=>Math.floor(p.x/32+.5)+':'+Math.floor(p.z/32+.5))).size;
  assert.equal(full.children.length,expectedTiles*fallbackParts('tree_round').length);
  const village=buildScatter([placement(2,3)],fallbackParts);
  for(const mesh of village.children as T.InstancedMesh[])assert.deepEqual(colorAt(mesh,0),[1,1,1]);
  const rocks=buildScatter([placement(-35,4,'rock')],fallbackParts);
  for(const mesh of rocks.children as T.InstancedMesh[])assert.equal(mesh.instanceColor,null);
});

test('colored occluders preserve their shade through fades and reused overlay slots',()=>{
  const g=buildScatter([placement(-32,0),placement(-32,5)],fallbackParts),fade=new OccluderFade(g);
  const pieces=tallPiecesNear(g,-32,0,10),original=pieces.map(p=>colorAt(p.meshes[0],p.index));
  const hit=(piece:TallPiece)=>{const hero=new T.Vector3(piece.x,1,piece.z-1);fade.update(1,hero.clone().add(new T.Vector3(0,17,13.5)),[hero],hero,true);};
  const clear=()=>{const away=new T.Vector3(30,1,30);fade.update(1,away.clone().add(new T.Vector3(0,17,13.5)),[away],away,true);};
  pieces.forEach((piece,index)=>{
    hit(piece);assert.ok(fade.fadedPieces().includes(piece));
    // One overlay per shared part, created in the same order as the piece's meshes.
    for(const [part,mesh] of piece.meshes.entries()){
      const active=g.children.filter(o=>o.userData.fadeOverlay)[part] as T.InstancedMesh;
      assert.ok(active.count>0);assert.deepEqual(colorAt(active,0),colorAt(mesh,piece.index));
    }
    clear();assert.equal(fade.fadedPieces().length,0);assert.deepEqual(colorAt(piece.meshes[0],piece.index),original[index]);
  });
  // Reusing the same overlay for an untinted source must not retain a previous tree's color.
  for(const mesh of pieces[1].meshes)mesh.instanceColor=null;
  hit(pieces[1]);
  for(const mesh of g.children.filter(o=>o.userData.fadeOverlay) as T.InstancedMesh[])if(mesh.count)assert.deepEqual(colorAt(mesh,0),[1,1,1]);
});

test('shipped trees remain small opaque meshes merged into one runtime batch per tree type',async()=>{
  const bytes=await readFile(new URL('../public/assets/models/scenery.glb',import.meta.url));assert.ok(bytes.length<100_000);
  const gltf=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
  const kit=new KitLibrary(['scenery.glb'],async()=>gltf.scene);await kit.load();
  for(const [id,limit] of [['tree_round',600],['tree_blossom',600],['tree_pine',400]] as const){
    const parts=kit.mergedParts(id)!;assert.equal(parts.length,1,id);
    assert.ok((parts[0].geometry.index?.count??parts[0].geometry.attributes.position.count)/3<=limit,id);
    assert.equal(parts[0].material.transparent,false);assert.equal((parts[0].material as T.MeshToonMaterial).map,null);
    const g=buildScatter([placement(30,0,id),placement(33,3,id)],()=>parts);assert.equal(g.children.length,1);
  }
});
