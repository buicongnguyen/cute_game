import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {World,type Enemy} from '../src/world.ts';
import {newGame} from '../src/model.ts';
import {EnvironmentSimulation,createEnvironmentLayout} from '../src/environments.ts';
import {ENEMY_TYPES} from '../src/enemy-types.ts';
import {KNOCK_IMPULSE} from '../src/boss-patterns.ts';
import {weightClass,flinches,flingDistance,flingPose,newFlingPose,deathTime,bumpShare,hurtSpeed,startsFleeing,WEIGHT,FLINCH,FLING,FLEE,HURT,BUMP} from '../src/creature-weight.ts';

const weightOf=(type:string)=>weightClass(type,ENEMY_TYPES[type]);

test('weight classes: light hoppers and flyers, medium walkers, heavy turtles and everything standing; bosses and titans have none',()=>{
  for(const type of ['mushroom','jelly','bunny','frog','bee','owl','firebat','snowball','minislime','magmaslime','toysoldier'])assert.equal(weightOf(type),'light',type);
  for(const type of ['boar','crab','penguin','seal','firelizard','wolf','forest_raptor','thunderbird','spider','lavaworm'])assert.equal(weightOf(type),'medium',type);
  for(const type of ['magmaturtle','cactus','chomper','flytrap','volcano','icebloom','urchin','windspirit','demoneye'])assert.equal(weightOf(type),'heavy',type);
  for(const [type,def] of Object.entries(ENEMY_TYPES))if(def.boss||def.titan)assert.equal(weightOf(type),null,type);
  // Every ordinary species gets a class; an elite with a role or a body someone else drives keeps its old feel.
  for(const [type,def] of Object.entries(ENEMY_TYPES))if(!def.boss&&!def.titan)assert.ok(weightOf(type),type);
  assert.equal(weightClass('boar',ENEMY_TYPES.boar,{elite:'shielded'}),null);
  assert.equal(weightClass('boar',ENEMY_TYPES.boar,{driver:{}}),null);
  assert.equal(weightClass('boar',ENEMY_TYPES.boar,{boss:true}),null);
  assert.equal(weightClass('boar',undefined),null);
});

test('weight scales the recoil and the knock: light most, heavy least',()=>{
  assert.ok(WEIGHT.light.react>WEIGHT.medium.react&&WEIGHT.medium.react>WEIGHT.heavy.react);
  assert.ok(WEIGHT.light.knock>WEIGHT.medium.knock&&WEIGHT.medium.knock>WEIGHT.heavy.knock);
  assert.equal(WEIGHT.medium.knock,1,'a medium creature slides as every creature did before');
});

test('earned flinch: light on a big hit or a critical, medium on a critical only, heavy and bosses never, and not again within the cooldown',()=>{
  const fresh=99;
  assert.equal(flinches('light',{},fresh),false,'a plain hit never interrupts');
  assert.equal(flinches('light',{big:true},fresh),true);
  assert.equal(flinches('light',{critical:true},fresh),true);
  assert.equal(flinches('medium',{big:true},fresh),false);
  assert.equal(flinches('medium',{critical:true},fresh),true);
  assert.equal(flinches('heavy',{critical:true,big:true},fresh),false);
  assert.equal(flinches(null,{critical:true,big:true},fresh),false);
  assert.equal(flinches('light',{critical:true},FLINCH.cooldown-.01),false,'no stun-lock');
  assert.equal(flinches('light',{critical:true},FLINCH.cooldown),true);
  assert.ok(FLINCH.time<FLINCH.cooldown/2,'a creature acts most of the time even under constant big hits');
});

test('death fling: light far, medium short, heavy and bosses not at all; capped, and short',()=>{
  assert.ok(flingDistance('light',1)>=1.5&&flingDistance('light',1)<=3);
  assert.equal(flingDistance('light',99),WEIGHT.light.flingMax);
  assert.ok(WEIGHT.light.flingMax<=3);
  assert.ok(flingDistance('medium',1)<flingDistance('light',1)&&flingDistance('medium',99)<=1.5);
  assert.equal(flingDistance('heavy',2),0);
  assert.equal(flingDistance(null,2),0);
  assert.equal(flingDistance('light',NaN),0);
  assert.ok(deathTime(2)<=.6+1e-9,'the whole death (throw, bounce, poof) stays under 0.6 s');
  assert.equal(deathTime(0),FLING.poof,'no throw: the old 0.3 s swell and shrink');
});

test('the fling pose starts and ends on the ground, rises in between, and a full light throw ends on its back',()=>{
  const p=newFlingPose(),d=flingDistance('light',1.5);
  flingPose(0,d,p);assert.deepEqual([p.along,p.up,p.spin],[0,0,0]);
  flingPose(FLING.fly/2,d,p);assert.ok(p.up>.5,'it flies');assert.ok(p.along>0&&p.along<.8);
  flingPose(FLING.fly+FLING.bounce/2,d,p);assert.ok(p.up>0&&p.up<FLING.arc/2,'a smaller bounce');
  flingPose(FLING.fly+FLING.bounce,d,p);assert.equal(p.along,1);assert.ok(Math.abs(p.up)<1e-9);assert.ok(Math.abs(p.spin-Math.PI*2.5)<1e-9);
  // A medium throw only topples part way; no throw is the rest pose.
  flingPose(FLING.fly+FLING.bounce,flingDistance('medium',1),p);assert.ok(p.spin>0&&p.spin<Math.PI/2);
  flingPose(.1,0,p);assert.deepEqual([p.along,p.up,p.spin],[0,0,0]);
});

test('bump share, limp and timid flight thresholds',()=>{
  assert.equal(bumpShare('light',BUMP.minSpeed-.1),0,'a slow shove passes nothing on');
  assert.ok(bumpShare('light',5)>bumpShare('medium',5)&&bumpShare('medium',5)>bumpShare('heavy',5));
  assert.equal(bumpShare(null,9),0,'never into a boss');
  assert.equal(hurtSpeed('light',24,100),HURT.speed);assert.equal(hurtSpeed('light',25,100),1);assert.equal(hurtSpeed(null,1,100),1);assert.equal(hurtSpeed('medium',0,100),1);
  assert.equal(startsFleeing('bunny','light',19,100,false),true);
  assert.equal(startsFleeing('bunny','light',19,100,true),false,'only once');
  assert.equal(startsFleeing('bunny','light',20,100,false),false);
  assert.equal(startsFleeing('boar','medium',5,100,false),false,'only timid species');
  assert.equal(startsFleeing('penguin',null,5,100,false),false);
});

// Real world code with real Three objects; only WebGL is left out (same setup as creature-ai.test.ts).
function world() {
  const w=Object.assign(Object.create(World.prototype), {
    state:newGame(),scene:new T.Scene(),camera:new T.OrthographicCamera(-3,3,3,-3,.1,20),
    root:new T.Group(),player:new T.Group(),companion:new T.Group(),position:new T.Vector3(),
    destination:null,route:[],selected:null,obstacles:[],entities:[],enemies:[],plotMeshes:[],cropSignatures:[],
    particles:[],keys:new Set<string>(),facing:0,time:0,planet:'home',hazardTimer:0,
    marker:new T.Mesh(),ring:new T.Mesh(),cameraTarget:new T.Vector3(),sun:new T.DirectionalLight(),raycaster:new T.Raycaster(),
    onInteract(){},onAttackEnemy(){},onDamage(){},onZone(){},
  }) as World;
  w.environment=new EnvironmentSimulation(createEnvironmentLayout('home'));return w;
}
const at=(w:World,type:string,x:number,z:number)=>{const e=w.spawnSpecies(type,x,z,w.enemies.length)!;return e;};

test('the knock a creature takes follows its weight; a boss and a rooted plant are as before',()=>{
  const w=world(),speed=(e:Enemy)=>Math.hypot(e.knockVX??0,e.knockVZ??0);
  const light=at(w,'mushroom',40,0),medium=at(w,'boar',40,10),heavy=at(w,'magmaturtle',40,20),boss=at(w,'bear',40,30),plant=at(w,'chomper',40,40);
  for(const e of [light,medium,heavy,boss,plant])w.knockEnemy(e,1,0,1);
  assert.equal(speed(medium),KNOCK_IMPULSE);
  assert.ok(Math.abs(speed(light)-KNOCK_IMPULSE*WEIGHT.light.knock)<1e-9);
  assert.ok(Math.abs(speed(heavy)-KNOCK_IMPULSE*WEIGHT.heavy.knock)<1e-9);
  assert.ok(Math.abs(speed(boss)-KNOCK_IMPULSE*.15)<1e-9,'a boss: the old x0.15');
  assert.equal(speed(plant),0);
});

test('a flinch cancels a light creature\'s wind-up, holds it briefly, then it winds up again; a boss never flinches',()=>{
  const w=world();w.position.set(40,0,0);
  const e=at(w,'mushroom',41,0);e.phase='windup';e.phaseTime=.4;e.cooldown=0;e.lastHitAt=0;
  assert.equal(w.flinchEnemy(e,{}),false,'a plain hit does not');
  assert.equal(w.flinchEnemy(e,{big:true}),true);
  assert.equal(e.phase,'chase');assert.equal(e.flinchT,FLINCH.time);
  assert.equal(w.flinchEnemy(e,{critical:true}),false,'cooldown');
  for(let i=0;i<10;i++)w.update(.025,true,false);
  assert.notEqual(e.phase,'windup','still staggered');
  for(let i=0;i<20;i++)w.update(.025,true,false);
  assert.equal(e.flinchT,0);
  assert.equal(e.phase,'windup','the wind-up starts over');
  const boss=at(w,'bear',60,0);boss.phase='windup';boss.phaseTime=.5;
  assert.equal(w.flinchEnemy(boss,{critical:true,big:true}),false);assert.equal(boss.phase,'windup');
  const peer=world();peer.setNetworkRole('peer');const p=at(peer,'mushroom',41,0);p.phase='windup';
  assert.equal(peer.flinchEnemy(p,{critical:true}),true);assert.equal(p.phase,'windup','a peer leaves the rule to the host');
});

test('a knocked creature passes part of its push to one it runs into',()=>{
  const w=world();w.position.set(0,0,-60);
  const a=at(w,'boar',40,0),b=at(w,'mushroom',41.2,0);a.phase=b.phase='chase';a.lastHitAt=b.lastHitAt=0;
  a.knockVX=8;a.knockVZ=0;
  (w as unknown as {separateCreatures():void}).separateCreatures();
  assert.ok((b.knockVX??0)>3,'the light one is shoved along');
  assert.ok(Math.abs((a.knockVX??0)-8*BUMP.keep)<1e-9);
  // Moving away from the other passes nothing on.
  const c=at(w,'boar',20,0),d=at(w,'mushroom',21.2,0);c.phase=d.phase='chase';c.knockVX=-8;
  (w as unknown as {separateCreatures():void}).separateCreatures();
  assert.ok(!d.knockVX);
});

test('a killing blow throws a small body (looks only: the rule place stays) and a boss dies as before',()=>{
  const w=world(),e=at(w,'mushroom',40,0);w.position.set(38,0,0);e.mesh.position.set(40,0,0);
  const x=e.x,z=e.z;e.hp=0;w.startDeathFling(e,1,0,1);
  assert.ok(e.fling!.d>1.5);assert.equal(e.dying,deathTime(e.fling!.d));
  const step=(n:number)=>{for(let i=0;i<n;i++)(w as unknown as {updateEnemyVisual(e:Enemy,dt:number):void}).updateEnemyVisual(e,.02);};
  step(5);assert.ok(e.mesh.position.x>40.5,'drawn along the blow');assert.ok(e.mesh.position.y>.2,'in the air');
  assert.equal(e.x,x);assert.equal(e.z,z);
  step(40);assert.equal(e.mesh.visible,false);assert.equal(e.dying,0);
  const boss=at(w,'bear',60,0);boss.hp=0;w.startDeathFling(boss,1,0,2);assert.equal(boss.fling!.d,0);assert.equal(boss.dying,.3);
  // A throw into scenery is cut short.
  const walled=world();walled.obstacles=[{x:41,z:0,r:.6}];const m=at(walled,'mushroom',40,0);m.mesh.position.set(40,0,0);m.hp=0;walled.startDeathFling(m,1,0,1.5);
  assert.ok(m.fling!.d<1,'not through the rock');
});

test('a timid creature runs for it once when badly hurt, then fights again',()=>{
  const w=world();w.position.set(40,0,0);
  const e=at(w,'bunny',42,0);e.lastHitAt=0;e.hp=Math.floor(e.maxHp*(FLEE.below-.05));
  w.update(.025,true,false);assert.equal(e.fled,true);assert.ok((e.fleeT??0)>0);
  const before=Math.hypot(e.x-40,e.z);for(let i=0;i<20;i++)w.update(.025,true,false);
  assert.ok(Math.hypot(e.x-40,e.z)>before,'it ran away');assert.notEqual(e.phase,'windup');
  for(let i=0;i<80;i++)w.update(.025,true,false);assert.equal(e.fleeT,0);
});
test('online: the host flinches a creature from the server\'s impact, and the later kill (sent without the blow) still throws it along that blow',()=>{
  const w=world();w.setNetworkRole('host');w.position.set(40,0,0);
  const e=at(w,'mushroom',42,0);e.mesh.position.set(42,0,0);e.phase='windup';e.phaseTime=.4;
  w.applyAuthoritativeEnemyHealth({id:e.id,x:e.x,z:e.z,hp:1,maxHp:e.maxHp,respawn:0,impactId:'a',impact:{amount:5,critical:true,direction:{x:0,z:1}}});
  assert.equal(e.phase,'chase');assert.equal(e.flinchT,FLINCH.time);assert.equal(e.blowZ,1);
  w.applyAuthoritativeEnemyHealth({id:e.id,x:e.x,z:e.z,hp:0,maxHp:e.maxHp,respawn:20});
  assert.ok(e.fling!.d>1.5);assert.equal(e.fling!.dz,1);assert.equal(e.dying,deathTime(e.fling!.d));
  // A boss gets none of it: no flinch, the old 0.3 s death.
  const boss=at(w,'bear',60,0);boss.phase='windup';boss.phaseTime=.5;
  w.applyAuthoritativeEnemyHealth({id:boss.id,x:boss.x,z:boss.z,hp:1,maxHp:boss.maxHp,respawn:0,impactId:'b',impact:{amount:5,critical:true,knock:2,direction:{x:0,z:1}}});
  assert.equal(boss.phase,'windup');assert.equal(boss.blowAt,undefined);
  w.applyAuthoritativeEnemyHealth({id:boss.id,x:boss.x,z:boss.z,hp:0,maxHp:boss.maxHp,respawn:90});assert.equal(boss.dying,.3);
});
