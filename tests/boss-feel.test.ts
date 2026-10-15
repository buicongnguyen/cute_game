import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {World,type Enemy} from '../src/world.ts';
import {newGame} from '../src/model.ts';
import {EnvironmentSimulation,createEnvironmentLayout} from '../src/environments.ts';
import {ENEMY_TYPES,enemyScale} from '../src/enemy-types.ts';
import {BODY,BOSS_DRAW,BOSS_SHAPES,bodyCircles,bodyGap,bossReach,chargeTouches,frontEdge,hitRadius,pushClear,slideOffBodies} from '../src/boss-body.ts';
import {STAGGER,adoptStaggerView,newStagger,staggerBroken,staggerDamage,staggerGain,staggerHit,staggerShare,staggerView} from '../src/boss-stagger.ts';
import {WEAR_STEPS,wearLook,wearStage} from '../src/boss-wear.ts';
import {BossWearView} from '../src/boss-wear-view.ts';
import {TITANS} from '../src/titan-content.ts';
import type {Effects} from '../src/fx.ts';

// FEEL pass (2026-10-15): solid, smaller bosses with a stagger meter and cute wear.
function world() {
  const w=Object.assign(Object.create(World.prototype), {
    state:newGame(),scene:new T.Scene(),camera:new T.OrthographicCamera(-3,3,3,-3,.1,20),
    root:new T.Group(),player:new T.Group(),companion:new T.Group(),position:new T.Vector3(),
    destination:null,route:[],selected:null,obstacles:[],entities:[],enemies:[],plotMeshes:[],cropSignatures:[],
    particles:[],keys:new Set<string>(),facing:0,time:0,planet:'home',hazardTimer:0,
    marker:new T.Mesh(),ring:new T.Mesh(),cameraTarget:new T.Vector3(),sun:new T.DirectionalLight(),raycaster:new T.Raycaster(),
    onInteract(){},onAttackEnemy(){},onDamage(){},onZone(){},
  }) as World;
  w.environment=new EnvironmentSimulation(createEnvironmentLayout('home'));
  return w;
}
const quietFx=()=>({text(){},burst(){},ring(){},spark(){},shake(){},freeze(){},update(){},density:1,shakeOffset:()=>new T.Vector3()}) as unknown as Effects;
const step=(w:World,n=1)=>{for(let i=0;i<n;i++)w.update(.025,true,false);};
const near=(a:number,b:number,e=1e-6)=>Math.abs(a-b)<e;

test('every boss is drawn at 1.48 and its body is fitted to the drawn model (0.85-0.9 of a round one, long ones covered by circles)',()=>{
  assert.ok(near(BOSS_DRAW,1.48));
  const bosses=Object.entries(ENEMY_TYPES).filter(([,d])=>d.boss&&!d.titan).map(([k])=>k);
  assert.deepEqual(bosses.filter(k=>!BOSS_SHAPES[k]),[],'every boss has a shape');
  for(const k of bosses){
    const shape=BOSS_SHAPES[k],x=shape.extent.side*BOSS_DRAW,front=shape.extent.front*BOSS_DRAW,back=shape.extent.back*BOSS_DRAW;
    assert.ok(near(enemyScale(k,true),BOSS_DRAW),k);
    if(shape.circles.length===1){const r=shape.circles[0][2],fit=r/Math.max(x,front,back);assert.ok(fit>=BODY.fit[0]-.01&&fit<=BODY.fit[1]+.005,`${k}: ${fit.toFixed(3)}`);continue;}
    // A long body: its circles reach 0.83-1.0 of the model ahead, behind and across.
    const ahead=Math.max(...shape.circles.map(c=>c[1]+c[2])),behind=Math.max(...shape.circles.map(c=>c[2]-c[1])),across=Math.max(...shape.circles.map(c=>Math.abs(c[0])+c[2]));
    for(const [name,reach,model] of [['front',ahead,front],['back',behind,back],['side',across,x]] as const)assert.ok(reach/model>=.83&&reach/model<=1.01,`${k} ${name}: ${(reach/model).toFixed(2)}`);
  }
  assert.ok(BOSS_SHAPES.croc.circles.length===3&&BOSS_SHAPES.mammoth.circles.length===2&&BOSS_SHAPES.dragon.circles.length>=3,'long bosses get several circles');
});

test('a boss definition carries the fitted hit radius and a reach that still touches an explorer pressed to its front',()=>{
  for(const [k,shape] of Object.entries(BOSS_SHAPES)){
    const d=ENEMY_TYPES[k];assert.equal(d.radius,hitRadius(shape),k);
    assert.ok(d.reach>=frontEdge(shape)+BODY.explorer+BODY.swing-1e-9,`${k} reach ${d.reach}`);
    // A fist (range 1) touching the farthest circle still lands: the hit radius reaches it.
    for(const c of shape.circles)assert.ok(1+d.radius>=Math.hypot(c[0],c[1])+c[2]+BODY.explorer-1e-9,`${k} circle ${c}`);
  }
  assert.equal(ENEMY_TYPES.bear.radius,1.1);assert.equal(ENEMY_TYPES.croc.radius,2.05);assert.equal(ENEMY_TYPES.mammoth.radius,1.55);
  assert.equal(bossReach(BOSS_SHAPES.bear,2.08),2.08,'a round boss keeps its scaled reach');
  // Titans keep their own 0.75 size; the dungeon guardians are not in the table.
  for(const id of Object.keys(TITANS))assert.equal(BOSS_SHAPES[id],undefined);
});

test('body circles turn with the facing and the gap is to the nearest surface',()=>{
  const out=new Float64Array(9),end=bodyCircles('croc',2.05,0,0,0,out);assert.equal(end,9);
  assert.ok(near(out[1],1.5)&&near(out[0],0),'the head is ahead (+z) at facing 0');
  bodyCircles('croc',2.05,0,0,Math.PI/2,out);assert.ok(near(out[0],1.5)&&near(out[1],0,1e-9),'facing +x the head is at +x');
  assert.ok(near(bodyGap('croc',2.05,0,0,0,0,3),3-2.45),'in front of the nose');
  assert.ok(near(bodyGap('croc',2.05,0,0,0,2,0),2-1.05),'beside the middle');
  assert.equal(bodyCircles('dg_morel',1.5,1,2,0,out),3);assert.deepEqual([...out.slice(0,3)],[1,2,1.5],'no shape: one circle of the radius');
  assert.ok(chargeTouches('croc',2.05,0,0,0,0,2.45+.5));assert.ok(!chargeTouches('croc',2.05,0,0,0,0,2.45+.7));
});

test('walking into a body slides round it; an explorer already inside works out gently and never deeper',()=>{
  const c=[0,0,1];
  const to={x:0,z:1.2};slideOffBodies({x:0,z:2},to,c,3,.45);assert.ok(near(Math.hypot(to.x,to.z),1.45),'head-on stops at the surface');
  const slide={x:.3,z:1.3};slideOffBodies({x:0,z:1.5},slide,c,3,.45);assert.ok(near(Math.hypot(slide.x,slide.z),1.45)&&slide.x>.2,'a slanted step keeps its sideways part');
  const out={x:0,z:.8};slideOffBodies({x:0,z:.6},out,c,3,.45);assert.ok(near(out.z,.8),'leaving is free');
  const deeper={x:0,z:.4};slideOffBodies({x:0,z:.6},deeper,c,3,.45);assert.ok(near(deeper.z,.6),'never deeper (the step shoves it out)');
  const push={x:0,z:0};assert.ok(near(pushClear(0,1,[0,0,1,0,1.5,1],6,.45,push)+0,Math.hypot(push.x,push.z)));
  assert.ok(near(Math.hypot(0+push.x,1+push.z-1.5),1.452,1e-3)||Math.hypot(push.x,1+push.z)>=1.45,'out of both circles of a long body');
});

test('the explorer cannot walk into a boss, slides past it, and is shoved out when the boss walks onto it',()=>{
  const w=world();w.fx=quietFx();const e=w.spawnSpecies('bear',40,0,0)!;e.cooldown=999;w.position.set(43,0,0);step(w);
  for(let i=0;i<60;i++){w.move(-.1,0);}
  assert.ok(w.position.x-e.x>=e.radius+BODY.explorer-1e-6,`stopped at the fur: ${(w.position.x-e.x).toFixed(3)}`);
  w.position.set(43,0,.6);for(let i=0;i<120;i++)w.move(-.1,0);
  assert.ok(w.position.x<e.x-1,'a step past the side slides round the body to the far side');
  // The boss steps onto the explorer: the explorer is shoved clear on the next steps.
  w.position.set(e.x+.5,0,0);step(w,3);assert.ok(Math.hypot(w.position.x-e.x,w.position.z-e.z)>=e.radius+BODY.explorer-.01,'shoved out');
  // A portal passes through.
  w.position.set(43,0,0);w.passBodies=true;for(let i=0;i<40;i++)w.move(-.1,0);w.passBodies=false;assert.ok(near(w.position.x,39,1e-6));
});

test('wedged between a boss and a wall, the explorer slides out sideways instead of staying inside',()=>{
  const w=world();w.fx=quietFx();const e=w.spawnSpecies('bear',40,0,0)!;e.cooldown=999;
  w.obstacles.push({x:42.3,z:0,r:.6});w.position.set(41.2,0,0);step(w,30);
  assert.ok(Math.hypot(w.position.x-e.x,w.position.z-e.z)>=e.radius+BODY.explorer-.02,'out of the body');
  assert.ok(Math.hypot(w.position.x-42.3,w.position.z)>=.6+.36-.02,'and not in the wall');
});

test('a boss charge stops on touching the explorer, hits once and throws the explorer back',()=>{
  const w=world();w.fx=quietFx();let hits=0;w.onDamage=()=>{hits++;};w.position.set(30+ENEMY_TYPES.croc.reach+.15,0,0);const e=w.spawnSpecies('croc',30,0,0)!;
  e.attackCount=1;step(w);assert.equal(e.skill,'charge');
  let stoppedAt=NaN,startX=NaN;for(let i=0;i<200;i++){const was=e.phase;step(w);if(was==='charge'&&isNaN(startX))startX=w.position.x;if(was==='charge'&&e.phase==='recover'){stoppedAt=e.x;break;}}
  assert.equal(hits,1,'one hit');assert.ok(Number.isFinite(stoppedAt),'the charge ended');
  assert.ok(bodyGap(e.type,e.radius,e.x,e.z,e.mesh.rotation.y,w.position.x,w.position.z)>-.05,'it never ran through the explorer');
  step(w,12);assert.ok(w.position.x>startX+.5,`thrown back: ${(w.position.x-startX).toFixed(2)} m`);
});

test('stagger: heavy blows and criticals fill it after the first 3 s; a full meter breaks for 2 s and the next needs 30% more',()=>{
  const s=newStagger(),heavy={knock:2.5},crit={critical:true};
  assert.equal(staggerGain({}),0);assert.equal(staggerGain(heavy),STAGGER.heavy);assert.equal(staggerGain({lift:1}),STAGGER.heavy);assert.equal(staggerGain({stun:1}),STAGGER.heavy);
  assert.equal(staggerGain({critical:true,knock:2}),STAGGER.heavy+STAGGER.critical);
  assert.equal(staggerHit(s,heavy,0),'none','the first hit starts the fight');assert.equal(staggerHit(s,heavy,2.9),'none','grace');
  assert.equal(staggerHit(s,{},3.1),'none','an ordinary hit adds nothing');
  let t=3.2,result:string='';for(let i=0;i<20&&result!=='break';i++,t+=.3)result=staggerHit(s,i%2?crit:heavy,t);
  assert.equal(result,'break');assert.ok(staggerBroken(s,t));assert.ok(near(s.until-(t-.3),STAGGER.time));assert.equal(s.need,Math.round(STAGGER.need*STAGGER.grow));assert.equal(s.fill,0);
  assert.equal(staggerDamage(s,t,100),125);assert.equal(staggerHit(s,heavy,t),'none','no filling on its knees');
  assert.ok(!staggerBroken(s,t+STAGGER.time));assert.equal(staggerDamage(s,t+STAGGER.time,100),100);
  assert.equal(staggerHit(s,heavy,t+STAGGER.time+.1),'fill');assert.ok(staggerShare(s)>0&&staggerShare(s)<.2);
  // A fight left alone is forgotten: the meter starts small again, with its grace.
  assert.equal(staggerHit(s,heavy,t+40),'none');assert.equal(s.need,STAGGER.need);assert.equal(s.breaks,0);
  // Titans need twice as much and kneel only 1.2 s.
  const ti=newStagger();staggerHit(ti,heavy,0,true);assert.equal(ti.need,STAGGER.need*STAGGER.titan);let r='';for(let i=0;i<20&&r!=='break';i++)r=staggerHit(ti,heavy,4+i*.1,true);
  assert.equal(r,'break');assert.ok(near(ti.until-(4+(Math.ceil(STAGGER.need*STAGGER.titan/STAGGER.heavy)-1)*.1),STAGGER.titanTime,1e-6));
});

test('stagger crosses the wire as a share and seconds left, on the browser\'s own clock',()=>{
  const s=newStagger();staggerHit(s,{knock:3},100);for(let t=104;t<110&&!staggerBroken(s,t);t+=.2)staggerHit(s,{knock:3,critical:true},t);
  const v=staggerView(s,s.until-1.5);assert.ok(near(v.broken,1.5));assert.equal(v.breaks,1);
  const copy=newStagger();assert.ok(adoptStaggerView(copy,v,7));assert.ok(staggerBroken(copy,8)&&!staggerBroken(copy,8.6));assert.equal(copy.breaks,1);
  assert.equal(adoptStaggerView(copy,undefined,0),false);
});

test('a boss broken in the world kneels: wind-up cancelled, telegraphs gone, +25% damage, then it fights on',()=>{
  const w=world();w.fx=quietFx();w.position.set(32,0,0);const e=w.spawnSpecies('bear',30,0,0)!;e.attackCount=1;step(w);assert.equal(e.phase,'windup');assert.ok(e.skill);
  e.stagger=Object.assign(newStagger(),{start:w.time-10,last:w.time,fill:STAGGER.need-1});
  assert.equal(w.damageEnemy(e,10,0,false,undefined,{knock:2.5}),'break');
  assert.equal(e.phase,'chase');assert.deepEqual(e.telegraphs,[]);assert.ok(e.stun>=STAGGER.time-1e-6);
  const hp=e.hp;w.damageEnemy(e,100);assert.equal(hp-e.hp,125);
  step(w,Math.ceil(STAGGER.time/.025)+2);assert.ok(!staggerBroken(e.stagger,w.time));
  // The Colossus (driven by its own module) never breaks.
  const c=w.spawnSpecies('bear',60,0,1)!;c.driver={incoming:(_e,a)=>a};c.stagger=undefined;w.damageEnemy(c,10,0,false,undefined,{knock:3});assert.equal(c.stagger,undefined);
});

test('the server\'s break arrives with the health: the browser kneels its boss and shows the meter',()=>{
  const w=world();w.fx=quietFx();w.setNetworkRole('peer');const e=w.spawnSpecies('bear',30,0,0)!;
  w.applyAuthoritativeEnemyHealth({id:e.id,x:30,z:0,hp:e.hp-50,maxHp:e.maxHp,respawn:0,stun:2,stagger:{share:0,broken:2,breaks:1},impactId:'a',impact:{amount:50,critical:true,knock:2.5,brk:true} as never});
  assert.ok(staggerBroken(e.stagger,w.time+1));assert.equal(e.stagger!.breaks,1);assert.equal(e.stun,2);
});

test('wear stages at 75/50/25% health; a dead or healed boss is clean; chips and puffs per family',()=>{
  assert.deepEqual(WEAR_STEPS,[.75,.5,.25]);
  assert.equal(wearStage(100,100),0);assert.equal(wearStage(76,100),0);assert.equal(wearStage(75,100),1);assert.equal(wearStage(50,100),2);assert.equal(wearStage(25,100),3);assert.equal(wearStage(1,100),3);
  assert.equal(wearStage(0,100),0);assert.equal(wearStage(5,0),0);
  assert.equal(wearLook('treant','#8a5a3b','#4fbf5a').chips[0],'#8a5a3b');assert.equal(wearLook('bear','#8b5a3c','#fff').chips[1],'#ffd23f','a crowned boss loses a crown jewel');
  assert.equal(wearLook('robot','#fff','#fff').puff,'sparks');assert.equal(wearLook('yeti','#fff','#fff').puff,'steam');
});

test('the wear view sticks pieces on as stages pass, hides when there is nothing to draw, and clears on a respawn',()=>{
  const view=new BossWearView(),mesh=new T.Group(),body=new T.Mesh(new T.SphereGeometry(1,12,8));body.position.y=1;mesh.add(body);mesh.scale.setScalar(1.48);mesh.updateMatrixWorld(true);
  const boss={id:'b',type:'bear',hp:100,maxHp:100,mesh,definition:{color:'#8b5a3c',accent:'#fff'}};
  view.frame([boss],()=>0,null,.016,0);assert.equal(view.busy,false,'nothing on an unhurt boss: no draw call');
  boss.hp=70;view.frame([boss],()=>0,null,.016,.1);assert.equal(view.stats.stuck,2);assert.ok(view.busy);
  boss.hp=20;view.frame([boss],()=>0,null,.016,.2);assert.ok(view.stats.stuck>=6);assert.ok(view.stats.chips>=1,'a chip popped off');
  view.frame([boss],()=>1.5,null,.016,.3);assert.equal(view.stats.stars,4,'dizzy stars while kneeling');
  boss.hp=100;for(let i=0;i<300;i++)view.frame([boss],()=>0,null,.05,1+i*.05);assert.equal(view.busy,false,'healed: clean again, and hidden');
  view.warm(true);assert.ok(view.group.children.every(m=>m.visible));view.warm(false);assert.ok(view.group.children.every(m=>!m.visible));
});

test('an Enemy built by Object.create (old saves, tests) works without the new fields',()=>{
  const w=world();const e=w.spawnSpecies('bear',30,0,0)! as Enemy;delete e.stagger;w.position.set(34,0,0);w.move(-.2,0);step(w);assert.ok(Number.isFinite(w.position.x));
});
