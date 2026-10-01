import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {World,type Entity} from '../src/world.ts';
import {newGame} from '../src/model.ts';
import {HOLD_HERO_ZONE,RETARGET_DEAD_ZONE,ignoreRetarget,pickCircle,pickInScreen,pickScale} from '../src/picking.ts';
import {GroundGestures,HOLD_DELAY,HOLD_RETARGET} from '../src/gestures.ts';

// An 800x600 view under a top-down camera: world x lands at 400 + x*133.3 px and world z at 300 + z*100 px.
Object.assign(globalThis,{innerWidth:800,innerHeight:600});
const PX=800/6;
function topDown<C extends T.Camera>(camera:C):C{camera.position.set(0,8,0);camera.up.set(0,0,-1);camera.lookAt(0,0,0);camera.updateMatrixWorld(true);return camera;}
const ortho=()=>topDown(new T.OrthographicCamera(-3,3,3,-3,.1,20));
function world(camera:T.Camera=ortho()) {
  return Object.assign(Object.create(World.prototype), {
    state:newGame(),scene:new T.Scene(),camera,root:new T.Group(),player:new T.Group(),companion:new T.Group(),position:new T.Vector3(0,0,2.5),
    destination:null,route:[],selected:null,obstacles:[],entities:[],enemies:[],plotMeshes:[],cropSignatures:[],
    particles:[],keys:new Set<string>(),facing:0,time:0,planet:'home',hazardTimer:0,
    marker:new T.Mesh(),ring:new T.Mesh(),cameraTarget:new T.Vector3(),sun:new T.DirectionalLight(),raycaster:new T.Raycaster(),
    onInteract(){},onAttackEnemy(){},onDamage(){},onZone(){},
  }) as World;
}
const block=(size:number)=>{const g=new T.Group(),m=new T.Mesh(new T.BoxGeometry(size,size,size),new T.MeshBasicMaterial());m.position.y=size/2;g.add(m);return g;};

test('screen picking: the circle holding the tap most deeply wins, under orthographic and perspective cameras',()=>{
  for(const camera of [ortho(),topDown(new T.PerspectiveCamera(40,800/600,.1,50))]){
    const near={x:.2,y:.6,z:0,radius:50},far={x:-.3,y:.6,z:0,radius:50},out={x:2,y:.6,z:0,radius:50};
    assert.equal(pickInScreen([far,near,out],camera,800,600,400,300),near);
    assert.equal(pickInScreen([far,out],camera,800,600,400,300),far);
    assert.equal(pickInScreen([out],camera,800,600,400,300),null);
  }
  // The reference ranks by distance minus radius, so a boss's wide circle can beat a nearer small one.
  const camera=ortho(),small={x:.3,y:.6,z:0,radius:45},boss={x:-.45,y:1.6,z:0,radius:110};
  assert.equal(pickInScreen([small,boss],camera,800,600,400,300),boss);
  // Anchors behind a perspective camera never catch a tap, however wide their circle.
  assert.equal(pickInScreen([{x:0,y:9,z:0,radius:5000}],topDown(new T.PerspectiveCamera(40,800/600,.1,50)),800,600,400,300),null);
});

test('pick circles use the reference radii, scaled by view height and zoom',()=>{
  assert.deepEqual(pickCircle('enemy',.8),{h:.6,r:55});
  assert.deepEqual(pickCircle('enemy',1.7,true),{h:1.6,r:110});
  assert.deepEqual(pickCircle('enemy',1.6),{h:.6,r:88},'a big creature keeps at least its own footprint');
  assert.deepEqual(pickCircle('plot',1),{h:.3,r:42});
  assert.deepEqual(pickCircle('mine',1.4),{h:.7,r:77},'planet nodes: 55 px per metre of radius');
  // At the default zoom the clone shows 900/21 = 42.9 px per metre across against the reference's 57: circles shrink to match.
  assert.equal(pickScale(900,900/57),1);assert.ok(Math.abs(pickScale(900)-42.86/57)<.001);
  assert.equal(pickScale(450,900/57),.5);assert.equal(pickScale(900,2*900/57),.5);
});

test('a tap picks the nearest creature inside its pixel radius, without a raycast, and otherwise walks on the ground',()=>{
  const w=world(),intersect=w.raycaster.intersectObjects.bind(w.raycaster);let raycasts=0;
  w.raycaster.intersectObjects=((...a:Parameters<typeof intersect>)=>{raycasts++;return intersect(...a);}) as typeof intersect;
  w.spawnEnemy(-.18,0,0,'Far');w.spawnEnemy(.1,0,1,'Near');w.spawnEnemy(1.2,0,2,'Aside');w.root.updateMatrixWorld(true);
  w.pointer(400,300);assert.equal(w.selected?.name,'Near');
  // Creature circles are 55 px x pickScale(600) = 27.6 px here: 0.15 m (20 px) from 'Aside' picks it.
  w.pointer(400+1.35*PX,300);assert.equal(w.selected?.name,'Aside');assert.equal(raycasts,0,'creatures are picked in screen space');
  // Zoomed out (26.7 px per metre), the 27.6 px circle reaches past the 0.7 m body: a tap 0.9 m out still picks.
  const far=world(topDown(new T.OrthographicCamera(-15,15,15,-15,.1,40)));far.spawnEnemy(0,0,0,'Small');far.root.updateMatrixWorld(true);
  far.raycaster.setFromCamera(new T.Vector2(.9/15,0),far.camera);assert.equal(far.raycaster.intersectObject(far.enemies[0].mesh,true).length,0,'the ray misses the body');
  far.pointer(400+.9*800/30,300);assert.equal(far.selected?.name,'Small');
  // Hidden, it no longer catches the tap, which falls through to the ground under the pointer.
  w.enemies.find(e=>e.name==='Aside')!.mesh.visible=false;
  w.pointer(400+1.35*PX,300);assert.equal(w.selected,null);
  assert.ok(w.destination&&Math.abs(w.destination.x-1.35)<.01&&Math.abs(w.destination.z)<.01);
});

test('the raycast fallback tests only the few entities near the tap ray, never the whole scene',()=>{
  const w=world(),lists:T.Object3D[][]=[],intersect=w.raycaster.intersectObjects.bind(w.raycaster);
  w.raycaster.intersectObjects=((objects:T.Object3D[],...rest:[boolean?,T.Intersection[]?])=>{lists.push(objects);return intersect(objects,...rest);}) as typeof w.raycaster.intersectObjects;
  for(let i=0;i<200;i++){const tree=block(.5);tree.position.set(-2.5+(i%20)*.25,0,-2.5+Math.floor(i/20)*.5);w.root.add(tree);}
  const cottage=w.addEntity('home','Cottage','',block(2),0,0,3.2);w.addEntity('fish','Pond','',block(.2),-6,-6,3);w.root.updateMatrixWorld(true);
  assert.equal(w.pickEntity(400+.5*PX,300+.5*100),cottage);
  assert.deepEqual(lists.at(-1),[cottage.mesh],'only the cottage sits near this ray; the pond and 200 scenery meshes are skipped');
  w.pointer(400+1.5*PX,300);assert.equal(w.selected,null,'beside the cottage walls is ground, even inside the prefilter');
  assert.ok(w.destination&&Math.abs(w.destination.x-1.5)<.01);
  assert.ok(lists.every(list=>list.every(o=>(o.userData.entity as Entity|undefined)?.kind==='home')),'no raycast ever held scenery or the far pond');
});

test('a move re-target within 0.6 m of the walk target keeps the path; a held pointer also rests within 0.8 m of the explorer',()=>{
  assert.equal(ignoreRetarget({x:.5,z:0},{x:0,z:0},{x:5,z:5},false),RETARGET_DEAD_ZONE>.5);
  assert.equal(ignoreRetarget({x:.7,z:0},{x:0,z:0},{x:5,z:5},false),false);
  assert.equal(ignoreRetarget({x:.7,z:0},null,{x:0,z:0},false),false,'a fresh tap still moves a resting explorer');
  assert.equal(ignoreRetarget({x:.7,z:0},null,{x:0,z:0},true),HOLD_HERO_ZONE>.7);
  const w=world();w.pointer(400+.9*PX,300);const route=w.route,destination=w.destination!;
  assert.ok(Math.abs(destination.x-.9)<.01);
  w.pointer(400+1.2*PX,300);assert.equal(w.route,route);assert.equal(w.destination,destination,'0.3 m away: no new path');
  w.pointer(400+1.8*PX,300);assert.notEqual(w.route,route);assert.ok(Math.abs(w.destination!.x-1.8)<.01,'0.9 m away: re-targeted');
  // Holding: a pointer resting on the explorer (0, 2.5) does not re-target; a pointer 1.5 m away does.
  w.destination=null;w.route=[];w.steer(400+.4*PX,550);assert.equal(w.destination,null);
  w.steer(400+1.5*PX,550);assert.ok(w.destination&&Math.abs(w.destination.x-1.5)<.01&&Math.abs(w.destination.z-2.5)<.01);
  // With a creature selected the dead zone does not apply: a ground tap always cancels the chase.
  w.spawnEnemy(-2,-2,0,'Target');w.root.updateMatrixWorld(true);w.select(w.enemies[0]);assert.ok(w.selected);
  const chase=w.destination!;w.pointer(400+(chase.x+.3)*PX,300+chase.z*100);assert.equal(w.selected,null);
});

test('a held pointer steers once the press becomes a hold, then re-targets at most every 0.2 s',()=>{
  const walks:Array<{t:number;x:number}>=[];let t=0;
  const g=new GroundGestures({tap(){},walk:x=>walks.push({t,x}),zoom(){},stop(){}});
  g.down(1,0,0);for(let i=1;i<=90;i++){t+=1/60;g.move(1,i,0);g.update(1/60);}
  assert.ok(walks[0].t>=HOLD_DELAY-1e-9);
  for(let i=1;i<walks.length;i++)assert.ok(walks[i].t-walks[i-1].t>=HOLD_RETARGET-1e-9,`walk ${i} came ${walks[i].t-walks[i-1].t} s after the last`);
  assert.ok(walks.length>=6&&walks.length<=7,`${walks.length} re-targets in 1.5 s`);
  assert.equal(walks.at(-1)!.x,Math.round(walks.at(-1)!.t*60),'each re-target follows the latest pointer position');
});
