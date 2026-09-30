import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {ITEMS} from '../src/content.ts';
import {buildDecoration} from '../src/decorations-art.ts';
test('every live decoration has finite grounded geometry within a usable garden footprint',()=>{
  for(const[id,item]of Object.entries(ITEMS).filter(([,item])=>item.type==='decor')){
    const model=buildDecoration(id);assert.notEqual(model.userData.fallback,true,`${id} needs a designed model`);const box=new T.Box3().setFromObject(model),size=box.getSize(new T.Vector3());assert.ok(Math.abs(box.min.y)<1e-6,`${id} must stand on ground`);assert.ok(size.y>.3&&size.y<3.5,`${id} usable height`);assert.ok(size.x<3.5&&size.z<3.5,`${id} garden footprint`);
    let triangles=0,meshes=0;model.traverse(object=>{if(!(object instanceof T.Mesh))return;meshes++;const points=object.geometry.getAttribute('position');assert.ok(points&&points.count>2);for(const value of points.array)assert.ok(Number.isFinite(value),`${id} contains nonfinite vertices`);triangles+=(object.geometry.index?.count||points.count)/3;assert.equal(object.receiveShadow,true);});assert.ok(meshes>=5,`${item.name} has no modeled details`);assert.ok(triangles<20000,`${id} is too expensive for repeated placement`);
  }
});
test('disposing or recoloring a decoration cannot damage another placement or a later rebuild',()=>{
  const a=buildDecoration('deco_aquarium'),b=buildDecoration('deco_aquarium');const aMeshes:T.Mesh[]=[],bMeshes:T.Mesh[]=[];a.traverse(o=>{if(o instanceof T.Mesh)aMeshes.push(o);});b.traverse(o=>{if(o instanceof T.Mesh)bMeshes.push(o);});let invalidations=0;for(const mesh of bMeshes){mesh.geometry.addEventListener('dispose',()=>invalidations++);for(const material of Array.isArray(mesh.material)?mesh.material:[mesh.material])material.addEventListener('dispose',()=>invalidations++);}
  for(let i=0;i<aMeshes.length;i++){assert.notEqual(aMeshes[i].geometry,bMeshes[i].geometry);assert.notEqual(aMeshes[i].material,bMeshes[i].material);aMeshes[i].geometry.dispose();for(const material of Array.isArray(aMeshes[i].material)?aMeshes[i].material:[aMeshes[i].material])material.dispose();}
  assert.equal(invalidations,0);const color=(bMeshes[0].material as T.MeshStandardMaterial).color.getHex();(aMeshes[0].material as T.MeshStandardMaterial).color.set('#000000');assert.equal((bMeshes[0].material as T.MeshStandardMaterial).color.getHex(),color);const rebuilt=buildDecoration('deco_aquarium');assert.equal(((rebuilt.children[0] as T.Mesh).material as T.MeshStandardMaterial).color.getHex(),color);
});
