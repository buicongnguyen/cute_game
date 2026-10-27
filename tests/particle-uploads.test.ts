import test from 'node:test';
import { perfFlags } from '../src/perf-flags.ts';
import assert from 'node:assert/strict';
import * as T from 'three';
import { ParticlePool } from '../src/fx.ts';
import { queueAttributeRange } from '../src/buffer-updates.ts';

const emit = (p: ParticlePool, life = 1, color = '#ff0000') => p.emit(0, 1, 0, 0, 0, 0, life, .2, color, 0);
test('empty pools upload nothing; live pools upload only live matrices and dirty colours', () => {
 const p = new ParticlePool(420, false), m = p.mesh.instanceMatrix, c = p.mesh.instanceColor!;
 p.update(.1); assert.equal(m.version, 0); assert.equal(c.version, 0);
 emit(p); emit(p); p.update(.1);
 assert.deepEqual(m.updateRanges, [{ start: 0, count: 32 }]); assert.deepEqual(c.updateRanges, [{ start: 0, count: 6 }]);
 m.clearUpdateRanges(); c.clearUpdateRanges(); const cv = c.version;
 p.update(.1); assert.equal(c.version, cv); assert.deepEqual(m.updateRanges, [{ start: 0, count: 32 }]);
 p.clear(); const mv = m.version; p.update(.1); p.update(.1); assert.equal(m.version, mv); assert.equal(p.mesh.count, 0);
 emit(p, 2, '#00ff00'); p.update(.1); assert.equal(p.mesh.count, 1); assert.ok(c.version > cv);
});
test('pending ranges survive hidden frames and remain bounded', () => {
 const a = new T.InstancedBufferAttribute(new Float32Array(160), 16);
 queueAttributeRange(a, 64, 16); for(let i=0;i<1000;i++)queueAttributeRange(a, 0, 16);
 assert.deepEqual(a.updateRanges, [{start:0,count:80}]);
});
test('expiry swaps the surviving particle and its colour into the live prefix', () => {
 const p = new ParticlePool(8,false); emit(p,.05,'#ff0000'); emit(p,2,'#00ff00'); p.update(.01);
 p.mesh.instanceColor!.clearUpdateRanges(); p.update(.1);
 assert.equal(p.count,1); const color=new T.Color();p.mesh.getColorAt(0,color);assert.equal(color.getHex(),0x00ff00);
 assert.deepEqual(p.mesh.instanceColor!.updateRanges,[{start:0,count:3}]);
});

test('selective uploads preserve moving, homing and recycled particle data', () => {
 const oldRandom=Math.random,oldFlag=perfFlags.selectiveParticleUploads;
 try {
  const before=new ParticlePool(4,true),after=new ParticlePool(4,true),camera=new T.PerspectiveCamera();
  before.setCamera(camera);after.setCamera(camera);
  const arrivals=[0,0];
  const fill=(pool:ParticlePool,index:number)=>{Math.random=()=>.4;for(let i=0;i<6;i++)pool.emit(i*.2,1,0,1,2,0,.3+i*.1,.2,i%2?'#ff0000':'#00ff00',2,i===5?()=>new T.Vector3(0,0,0):null,()=>arrivals[index]++,.1);};
  fill(before,0);fill(after,1);
  for(let frame=0;frame<25;frame++){
   camera.rotation.y=frame*.1;
   perfFlags.selectiveParticleUploads=false;before.update(.05);
   perfFlags.selectiveParticleUploads=true;after.update(.05);
   assert.equal(after.count,before.count);
   assert.deepEqual(after.mesh.instanceMatrix.array,before.mesh.instanceMatrix.array);
   assert.deepEqual(after.mesh.instanceColor!.array,before.mesh.instanceColor!.array);
   if(frame===15){before.clear();after.clear();fill(before,0);fill(after,1);}
  }
  assert.equal(arrivals[0],arrivals[1],'arrival callbacks agree between both policies');
  assert.ok(arrivals[0]>0,'homing particles actually arrive');
 } finally {Math.random=oldRandom;perfFlags.selectiveParticleUploads=oldFlag;}
});
