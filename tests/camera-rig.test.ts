import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {SHADOW,cameraOffset,clampZoom,followBlend,groundAt,lightAxes,shadowBox,viewFootprint} from '../src/camera-rig.ts';

const near=(a:number,b:number,eps=.05)=>assert.ok(Math.abs(a-b)<=eps,`${a} should be ${b} ±${eps}`);
const DESKTOP=1440/900,PHONE=390/844,LANDSCAPE=844/390;

test('the camera sits where the reference puts it: 21.7 m away at a 51.5° pitch, 1.3x further back in portrait',()=>{
  const desk=cameraOffset(DESKTOP);assert.deepEqual(desk.toArray(),[0,17,13.5]);near(desk.length(),21.71,.01);near(Math.atan2(desk.y,desk.z)*180/Math.PI,51.5,.1);
  const phone=cameraOffset(PHONE);near(phone.y,22.1,1e-9);near(phone.z,17.55,1e-9);
  assert.deepEqual(cameraOffset(LANDSCAPE).toArray(),[0,17,13.5]);
  near(cameraOffset(DESKTOP,1.5).length(),21.71*1.5,.02);
});

test('the view shows the reference ground: ±12.6 m across the explorer row, 14.2 m up and 7.8 m down on a desktop; ±4.75, 18.5 and 10.2 m on a portrait phone',()=>{
  near(groundAt(DESKTOP,1,1,0).x,12.64);near(groundAt(DESKTOP,1,-1,0).x,-12.64);near(groundAt(DESKTOP,1,0,1).z,-14.19);near(groundAt(DESKTOP,1,0,-1).z,7.83);
  near(groundAt(PHONE,1,1,0).x,4.75);near(groundAt(PHONE,1,0,1).z,-18.45);near(groundAt(PHONE,1,0,-1).z,10.18);
  // The explorer is the centre of the screen, with no look-ahead.
  near(groundAt(DESKTOP,1,0,0).x,0,1e-6);near(groundAt(DESKTOP,1,0,0).z,0,1e-6);
});

test('the camera follows at 9/s, 5/s in cut-scenes, and zoom reaches 0.65-1.5 by wheel and 0.6-1.6 by pinch',()=>{
  near(followBlend(.1,false),1-Math.exp(-.9),1e-12);near(followBlend(.1,true),1-Math.exp(-.5),1e-12);
  assert.deepEqual([clampZoom(.2,'wheel'),clampZoom(3,'wheel'),clampZoom(1.1,'wheel')],[.65,1.5,1.1]);
  assert.deepEqual([clampZoom(.2,'pinch'),clampZoom(3,'pinch')],[.6,1.6]);
});

test('light axes are the ones three gives the shadow camera, wherever the sun target is',()=>{
  const offset=new T.Vector3(-15,35,18),sun=new T.DirectionalLight();sun.target.position.set(3,0,-2);sun.position.copy(sun.target.position).add(offset);
  sun.updateMatrixWorld();sun.target.updateMatrixWorld();sun.shadow.updateMatrices(sun);
  const x=new T.Vector3(),y=new T.Vector3(),z=new T.Vector3();sun.shadow.camera.matrixWorld.extractBasis(x,y,z);
  const [ax,ay]=lightAxes(offset);near(x.distanceTo(ax),0,1e-9);near(y.distanceTo(ay),0,1e-9);
});

test('the shadow box covers the ground in view and what stands on it, and is far smaller than the old square box',()=>{
  const axes=lightAxes(new T.Vector3(-15,35,18));
  for(const aspect of [DESKTOP,PHONE,LANDSCAPE])for(const zoom of [.6,1,1.6]){
    const footprint=viewFootprint(aspect,zoom),box=shadowBox(footprint,axes);
    for(const p of footprint)for(const y of [0,SHADOW.lift/2,SHADOW.lift]){
      const point=new T.Vector3(p.x,y,p.z),a=point.dot(axes[0]),b=point.dot(axes[1]);
      assert.ok(a>=box.left+SHADOW.margin-1e-9&&a<=box.right-SHADOW.margin+1e-9&&b>=box.bottom+SHADOW.margin-1e-9&&b<=box.top-SHADOW.margin+1e-9);
    }
    if(zoom!==1)continue;
    // The orthographic camera's box: max(26, span x aspect x 0.8) each way from the explorer.
    const span=aspect<.8?21*Math.max(.82,Math.min(1.35,.6/aspect)):21,old=(2*Math.max(26,span*Math.max(1,aspect)*.8))**2;
    assert.ok((box.right-box.left)*(box.top-box.bottom)<old*.75,`aspect ${aspect.toFixed(2)}: ${((box.right-box.left)*(box.top-box.bottom)).toFixed(0)} m² vs ${old.toFixed(0)} m²`);
  }
});
