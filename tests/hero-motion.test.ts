import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {World} from '../src/world.ts';
import * as M from '../src/model.ts';
import {perfFlags} from '../src/perf-flags.ts';
import {heroPose,type HeroMotion} from '../src/hero-motion.ts';
import {strideOf,armSwing} from '../src/walk-cycle.ts';
import {HeroIdle,busyOf,mount,FIDGET_MIN,FIDGET_MAX,SIT_AT,LEAN_IN,LEAN_TIME,SETTLE_TIME,CLIP_HOLD,HOLD_UP_DELAY,type HeroParts,type Act} from '../src/features/hero-idle.ts';

const DT=1/60,NAMES=['arm-left','arm-right','leg-left','leg-right','head'];
function avatar(hip=.52){const m=new T.Group(),body=new T.Group();m.add(body);for(const name of NAMES){const p=new T.Group();p.name=name;if(name.startsWith('leg'))p.position.y=hip;body.add(p);}return m;}
/** A World as the other tests build it (no constructor), standing at the origin. */
function world(hip=.52){
  const w=Object.create(World.prototype) as World;Object.assign(w,{state:M.newGame(),player:avatar(hip),moving:false,weaponKind:'fist',time:0,facing:0,walkClock:0,position:new T.Vector3()});
  const leg=w.player.getObjectByName('leg-left')!,other=w.player.getObjectByName('leg-right')!;
  /** One frame: the hero covers ground while moving, the frame resets the drawn body as update() does, then the pose. */
  const tick=(dt=DT)=>{if(w.moving)w.position.x+=6*dt;w.player.position.set(0,0,0);w.player.scale.setScalar(.84);(w as any).animatePlayer(dt);return leg.rotation.x;};
  return {w,leg,other,tick};
}
const frames=(seconds:number)=>Math.round(seconds/DT);

test('a stop at 60 fps: no leg moves more than 0.1 rad in a frame, and both are under 0.05 rad within 0.45 s',()=>{
  let worst=0,open=0;
  for(const hip of [.4,.52,.9,1.36])for(let phase=0;phase<24;phase++){
    const {w,leg,other,tick}=world(hip);w.moving=true;for(let i=0;i<60+phase;i++)tick();
    open=Math.max(open,Math.abs(leg.rotation.x));
    let was=leg.rotation.x,wasR=other.rotation.x;w.moving=false;
    for(let i=1;i<=frames(1.2);i++){
      tick();const d=Math.max(Math.abs(leg.rotation.x-was),Math.abs(other.rotation.x-wasR));worst=Math.max(worst,d);was=leg.rotation.x;wasR=other.rotation.x;
      assert.ok(d<=.1,`hip ${hip} phase ${phase} frame ${i}: ${d}`);
      if(i>=frames(.45))assert.ok(Math.abs(was)<.05&&Math.abs(wasR)<.05,`hip ${hip} phase ${phase} frame ${i}: leg ${was}`);
    }
    assert.equal(Math.abs(leg.rotation.x),0,'the legs come to rest exactly');assert.equal(w.heroMove!.gait.blend,0);
  }
  assert.ok(open>.6,'stops were taken with the legs wide open');assert.ok(worst>.05,'and the legs really had to close');
});

test('a start eases in: the blend rises without overshoot and the lean-in is over after 0.15 s; a stop settles within 0.3 s',()=>{
  const {w,tick}=mounted(),leg=w.player.getObjectByName('leg-left')!;for(let i=0;i<30;i++)tick();
  assert.equal(Math.abs(leg.rotation.x),0);assert.equal(w.player.rotation.x,0);
  w.moving=true;let last=0,peak=0,first=NaN;
  for(let i=1;i<=frames(1.5);i++){
    tick();const b=w.heroMove!.gait.blend;if(i===1)first=leg.rotation.x;
    assert.ok(b>=last&&b<=1,`blend ${b} after ${last}`);last=b;peak=Math.max(peak,w.player.rotation.x);
    if(i>frames(LEAN_TIME)+1)assert.ok(Math.abs(w.player.rotation.x-.1*b)<1e-9,'only the walk lean is left');
  }
  assert.ok(Math.abs(first)<.7*.19,`the first frame of a walk is a fifth of the swing at most (${first})`);
  assert.equal(last,1);assert.ok(peak>.1&&peak<=.1+LEAN_IN,`lean peak ${peak}`);
  assert.equal(w.player.rotation.x,.1,'a settled walk leans as it always did');
  // The stop: the lean comes back through a small rock backwards, and everything is at rest after the settle.
  w.moving=false;let back=0,dip=1;
  for(let i=1;i<=frames(1);i++){tick();back=Math.min(back,w.player.rotation.x);if(i<frames(SETTLE_TIME))dip=Math.min(dip,w.player.scale.y/.84);assert.ok(Math.abs(w.player.rotation.x)<=.1+1e-9);}
  assert.ok(back<0&&back>-.06,`a small rock back (${back})`);assert.ok(dip<1&&dip>.95,`a small dip (${dip})`);assert.equal(Math.abs(w.player.rotation.x),0);
});

test('heroMotion off is the old switch: the full walk pose on the first frame, the idle pose on the frame after a stop',()=>{
  perfFlags.heroMotion=false;
  try{
    const {w,leg,tick}=world();w.moving=true;tick();
    const stride=strideOf(.52,6,.84),arm=armSwing(),c=Math.sin(w.walkClock);
    assert.equal(leg.rotation.x,c*stride.swing);assert.equal(w.player.rotation.x,.1);
    assert.equal(w.player.getObjectByName('arm-left')!.rotation.x,-c*arm.swing-arm.ease);assert.equal(w.player.getObjectByName('arm-left')!.rotation.z,-arm.splay);
    assert.equal(w.player.getObjectByName('head')!.rotation.z,c*.05);
    w.moving=false;tick();const o=w.walkClock;
    assert.equal(Math.abs(leg.rotation.x),0);assert.equal(w.player.rotation.x,0);assert.equal(w.player.getObjectByName('arm-right')!.rotation.z,arm.splay+Math.sin(o)*.05);
    assert.equal(w.player.getObjectByName('head')!.rotation.y,Math.sin(o*.4)*.15);assert.equal(w.player.scale.y,.84*(1+Math.sin(o*1.2)*.025));
    let called=0;w.heroExtras=()=>{called++;};tick();assert.equal(called,0,'no extras with the flag off');
    perfFlags.heroMotion=true;tick();assert.equal(called,1);
  }finally{perfFlags.heroMotion=true;}
});

test('the weapon stance rides the blend: the same arm as before when standing and when walking, eased between',()=>{
  const {w,tick}=world();w.weaponKind='sword';const arm=w.player.getObjectByName('arm-right')!;
  tick();assert.equal(arm.rotation.x,-.45);assert.equal(arm.rotation.z,.18);
  w.moving=true;tick();const first=arm.rotation.x;assert.ok(first>-.45&&first<-.3,`eased, not snapped (${first})`);
  for(let i=0;i<120;i++)tick();assert.ok(Math.abs(arm.rotation.x-(-.3+Math.sin(w.walkClock)*.3))<1e-12);
});

/** A motion and parts for the idle on its own: every channel at rest, as the base pose leaves them when standing. */
function rig(){
  const part=()=>({rotation:{x:0,y:0,z:0}}),parts={armL:part(),armR:part(),legL:part(),legR:part(),head:part()},m:HeroMotion={gait:{phase:0,blend:0},leg:0,twist:0,lean:0,lift:0,sy:1};
  const reset=()=>{for(const p of Object.values(parts))p.rotation.x=p.rotation.y=p.rotation.z=0;m.twist=m.lean=m.lift=0;m.sy=1;};
  const posed=()=>Object.values(parts).some(p=>p.rotation.x||p.rotation.y||p.rotation.z)||m.twist!==0||m.lean!==0||m.lift!==0||m.sy!==1;
  return {parts,m,reset,posed};
}
/** Runs an idle for `seconds` and returns when each act began. */
function story(seed:number,seconds:number,look=NaN,saver=false){
  const idle=new HeroIdle(seed),{parts,m,reset}=rig(),log:{at:number;act:Act}[]=[];let was:Act='';
  for(let i=1;i<=frames(seconds);i++){reset();idle.step(m,parts,DT,0,saver,look,.35);if(idle.act!==was){was=idle.act;if(was)log.push({at:+(i*DT).toFixed(3),act:was});}}
  return {idle,log,parts,m};
}

test('idle: the first fidget comes between 6 and 10 s, fidgets differ, and the explorer sits at 30 s',()=>{
  for(let seed=1;seed<=40;seed++){
    const {log,idle,m,parts}=story(seed,34,seed%2?.6:NaN);
    assert.ok(log[0].at>=FIDGET_MIN&&log[0].at<=FIDGET_MAX+DT,`seed ${seed}: first at ${log[0].at}`);
    assert.notEqual(log[0].act,'sit');
    const sit=log.find(l=>l.act==='sit')!;assert.ok(sit&&Math.abs(sit.at-SIT_AT)<=2*DT,`seed ${seed}: sit at ${sit?.at}`);
    const fidgets=log.filter(l=>l.act!=='sit');assert.ok(fidgets.length>=2,`seed ${seed}: ${JSON.stringify(log)}`);
    for(let i=1;i<fidgets.length;i++){assert.notEqual(fidgets[i].act,fidgets[i-1].act);const gap=fidgets[i].at-fidgets[i-1].at;assert.ok(gap>=FIDGET_MIN,`gap ${gap}`);}
    if(!(seed%2))assert.ok(fidgets.every(f=>f.act!=='look'),'nothing to look at, no look');
    // Seated: the body is down by the drop, the legs are out in front, and it stays so.
    assert.equal(idle.act,'sit');assert.ok(Math.abs(m.lift+.35)<1e-9);assert.ok(parts.legL.rotation.x<-1.4&&parts.legR.rotation.x<-1.3);
  }
});

test('20 s of idle shows at least two different fidgets for the seeds the game uses',()=>{
  for(const slot of [0,1,2]){const {log}=story(0x5eed+slot,20,.4);assert.ok(new Set(log.map(l=>l.act)).size>=2,JSON.stringify(log));}
});

test('the same seed gives the same fidgets at the same times; another seed another run',()=>{
  const a=story(7,34,.5).log,b=story(7,34,.5).log;assert.deepEqual(a,b);
  const others=[8,9,10,11].map(seed=>JSON.stringify(story(seed,34,.5).log));assert.ok(others.some(o=>o!==JSON.stringify(a)));
});

test('input cancels within one frame: a fidget and the sit end at the next step and the pose is gone 0.12 s later',()=>{
  for(const until of ['fidget','sit'] as const)for(const how of ['poke','walk','fight'] as const){
    const idle=new HeroIdle(3),{parts,m,reset,posed}=rig();let guard=0;
    while(!(until==='sit'?idle.act==='sit'&&idle.w===1:idle.act&&idle.act!=='sit'&&idle.w>.9)){reset();idle.step(m,parts,DT,0,false,.5,.35);assert.ok(++guard<4000);}
    assert.ok(posed());
    reset();if(how==='poke')idle.poke();idle.step(m,parts,DT,how==='walk'?1:how==='fight'?2:0,false,.5,.35);
    assert.equal(idle.act,'',`${until}/${how}: over in one frame`);assert.equal(idle.idle,0);
    assert.ok(idle.w<1&&idle.w>0,'it eases out, under a fight pose too (no pop up from the ground)');
    for(let i=0;i<frames(.12)+1;i++){reset();idle.step(m,parts,DT,how==='walk'?1:how==='fight'&&i<3?2:0,false,.5,.35);}
    assert.equal(idle.w,0);assert.equal(posed(),false);assert.equal(idle.shown,'');
    // And the wait starts over: nothing for the next 6 s.
    for(let i=0;i<frames(FIDGET_MIN)-10;i++){reset();idle.step(m,parts,DT,0,false,.5,.35);assert.equal(idle.act,'');}
  }
});

test('Battery saver: no fidget, no sit, no clip',()=>{
  const {log,idle,m,parts}=story(5,40,.5,true);assert.deepEqual(log,[]);assert.equal(idle.w,0);assert.equal(m.lift,0);assert.equal(parts.armL.rotation.x,0);
});

test('no new objects after warm-up: the motion, its gait and the idle keep their shape, and a frame returns the same motion',()=>{
  const {w,tick}=world();const idle=new HeroIdle(2),p=w.player;
  const parts:HeroParts={armL:p.getObjectByName('arm-left'),armR:p.getObjectByName('arm-right'),legL:p.getObjectByName('leg-left'),legR:p.getObjectByName('leg-right'),head:p.getObjectByName('head')};
  w.heroExtras=(m,dt)=>idle.step(m,parts,dt,busyOf(w as never),false,.3,.35);
  for(let i=0;i<120;i++)tick();
  const m=w.heroMove!,gait=m.gait,shape=()=>JSON.stringify([Object.keys(m),Object.keys(gait),Object.keys(idle)]),keys=shape(),rot=p.getObjectByName('leg-left')!.rotation;
  for(let i=0;i<frames(40);i++){w.moving=i%900>840;tick();assert.equal(w.heroMove,m);assert.equal(m.gait,gait);}
  assert.equal(shape(),keys);assert.equal(p.getObjectByName('leg-left')!.rotation,rot);
  assert.equal(heroPose(w as never,0,strideOf(.52),armSwing(),'fist'),m);
});

/** The feature mounted on a World as the game mounts it, with the services it reads. */
function mounted(quality='high'){
  const {w,tick}=world();Object.assign(w,{enemies:[],plotMeshes:[],companion:new T.Group(),companion2:new T.Group(),interior:null});
  const on:Record<string,(p:unknown)=>void>={},level={now:quality,modal:''};
  mount({world:w,slot:()=>0,quality:()=>level.now,state:()=>w.state,modal:()=>level.modal,on:(e:string,f:(p:unknown)=>void)=>{on[e]=f;return()=>{};}} as never);
  return {w,tick,on,level,idle:(w.heroExtras as unknown as {idle:HeroIdle}).idle};
}
const armX=(w:World)=>w.player.getObjectByName('arm-left')!.rotation.x;

test('playPose: a clip raises the arms, lasts its seconds and returns to the idle pose',()=>{
  for(const kind of ['cheer','holdUp'] as const){
    const {w,tick,idle}=mounted();for(let i=0;i<30;i++)tick();assert.equal(Math.abs(armX(w)),0);
    w.playPose!(kind,1);let top=0,lift=0;
    for(let i=0;i<frames(1);i++){tick();top=Math.min(top,armX(w));lift=Math.max(lift,w.player.position.y);}
    assert.equal(idle.act,'');
    assert.ok(top<(kind==='cheer'?-2.3:-1.9),`${kind}: arms up (${top})`);if(kind==='cheer')assert.ok(lift>.1,'a hop');
    for(let i=0;i<frames(.2);i++)tick();
    assert.equal(Math.abs(armX(w)),0);assert.equal(w.player.position.y,0);assert.equal(idle.shown,'');assert.equal(Math.abs(w.player.rotation.x),0);
    // Lengths are kept between 0.6 and 1.2 s.
    w.playPose!(kind,5);assert.equal(idle.clipTime,1.2);w.playPose!(kind,.1);assert.equal(idle.clipTime,.6);
  }
});

test('a clip waits under a fight pose and is not played at all on Battery saver; level-ups cheer and catches hold up',()=>{
  const {w,tick,on,level,idle}=mounted();for(let i=0;i<10;i++)tick();
  on.levelUp({level:2});assert.equal(idle.clip,'cheer');
  w.punchT=.2;tick();assert.equal(idle.w,0,'the punch has the body');assert.equal(idle.act,'');
  for(let i=0;i<frames(.5);i++)tick();assert.ok(armX(w)<-2,'the cheer shows once the punch is over');
  for(let i=0;i<frames(1);i++)tick();assert.equal(Math.abs(armX(w)),0);
  on.fishCatch({id:'x',size:1});assert.equal(idle.clip,'holdUp');for(let i=0;i<frames(HOLD_UP_DELAY)-2;i++)tick();assert.equal(idle.act,'','the arms wait for the fish');
  for(let i=0;i<6;i++)tick();assert.equal(idle.act,'holdUp');for(let i=0;i<frames(1.4);i++)tick();assert.equal(idle.act,'');
  level.now='low';w.playPose!('cheer',1);assert.equal(idle.clip,'');
  for(let i=0;i<frames(35);i++)tick();assert.equal(idle.act,'');assert.equal(Math.abs(armX(w)),0);assert.equal(w.player.position.y,0);
});

test('mounted: the explorer looks at a near creature, ignores a far one, and a walk ends the look',()=>{
  const {w,tick,idle}=mounted();const near=new T.Group(),far=new T.Group();near.position.set(3,0,3);far.position.set(40,0,0);
  (w as any).enemies=[{hp:5,mesh:far},{hp:5,mesh:near}];
  let looked=false;for(let i=0;i<frames(26)&&!looked;i++){tick();if(idle.act==='look'&&idle.w===1)looked=true;}
  assert.ok(looked,'a look within 26 s');
  const head=w.player.getObjectByName('head')!;assert.ok(Math.abs(head.rotation.y-Math.PI/4)<.02,`the head turns to the creature (${head.rotation.y})`);
  w.moving=true;tick();assert.equal(idle.act,'');
});

test('the idle clock does not run while the game is not played: a dialog, the starship, a knock-out',()=>{
  // Reading a shop dialog for 40 s: nothing behind it, and a fresh wait after it closes.
  {const {w,tick,level,idle}=mounted();level.modal='shop';for(let i=0;i<frames(40);i++){tick();assert.equal(idle.act,'');assert.equal(idle.idle,0);}
    assert.equal(w.player.position.y,0);level.modal='';for(let i=0;i<frames(FIDGET_MIN)-5;i++){tick();assert.equal(idle.act,'');}}
  // Holding the flight stick for 35 s (on board, the explorer hidden): not seated on arrival.
  {const {w,tick,idle}=mounted();w.boarded=true;w.player.visible=false;for(let i=0;i<frames(35);i++)tick();assert.equal(idle.idle,0);
    w.boarded=false;w.player.visible=true;for(let i=0;i<frames(3);i++){tick();assert.equal(idle.act,'');}assert.equal(w.player.position.y,0);}
  {const {w,tick,idle}=mounted();w.state.hp=0;for(let i=0;i<frames(35);i++)tick();assert.equal(idle.act,'');assert.equal(idle.idle,0);}
  // A dialog that opens on a seated explorer stands it up.
  {const {tick,level,idle}=mounted();for(let i=0;i<frames(31.5);i++)tick();assert.equal(idle.act,'sit');level.modal='bag';tick();assert.equal(idle.act,'');}
});

test('no sitting with a live creature within 8 m; one that comes near stands the explorer up with the ease',()=>{
  const {w,tick,idle}=mounted(),mesh=new T.Group(),foe={hp:5,mesh};mesh.position.set(5,0,0);(w as any).enemies=[foe];
  for(let i=0;i<frames(34);i++){tick();assert.notEqual(idle.act,'sit');}
  mesh.position.set(30,0,0);for(let i=0;i<30;i++)tick();assert.equal(idle.act,'sit','it sits once the creature is gone');
  for(let i=0;i<frames(1);i++)tick();assert.ok(w.player.position.y<-.3);
  mesh.position.set(6,0,0);let n=0;while(idle.act==='sit'){tick();assert.ok(++n<=13,'noticed within the poll');}
  assert.ok(w.player.position.y<-.2,'no pop: still most of the way down on the frame it is cut');
  for(let i=0;i<frames(.12)+1;i++)tick();assert.equal(w.player.position.y,0);
  foe.hp=0;for(let i=0;i<frames(31);i++)tick();assert.equal(idle.act,'sit','a fallen creature is no threat');
});

test('hurt while seated: the body comes up over the ease, not in one frame',()=>{
  const {w,tick,idle}=mounted();for(let i=0;i<frames(31.5);i++)tick();const down=w.player.position.y;assert.ok(down<-.3);
  w.hurtT=.3;tick();assert.equal(idle.act,'');const first=w.player.position.y;assert.ok(first<down*.6&&first>down,`eased (${first} from ${down})`);
  let was=first;for(let i=0;i<frames(.12)+1;i++){tick();assert.ok(w.player.position.y>=was-1e-9);was=w.player.position.y;}assert.equal(was,0);
});

test('a clip asked for while seated eases out of the sit first, then plays whole',()=>{
  const {w,tick,idle}=mounted();for(let i=0;i<frames(31.5);i++)tick();assert.equal(idle.act,'sit');assert.equal(idle.w,1);
  w.playPose!('cheer',1);tick();assert.equal(idle.shown,'sit');assert.ok(idle.w<1&&idle.w>.8,'the weight is not zeroed');
  let n=1;while(idle.act!=='cheer'){tick();assert.ok(++n<12);}
  assert.equal(idle.t,DT,'the clip begins at its start');let top=0;for(let i=0;i<frames(1.3);i++){tick();top=Math.min(top,armX(w));}
  assert.ok(top<-2.3);assert.equal(idle.act,'');assert.equal(w.player.position.y,0);
});

test('a clip waits for a fight pose at its start (a blaster aim of 0.7 s), starts over when cut, and is dropped after CLIP_HOLD',()=>{
  const {w,tick,idle}=mounted();for(let i=0;i<10;i++)tick();
  w.aimT=.7;w.playPose!('cheer',1);for(let i=0;i<frames(.7)-1;i++){tick();assert.equal(idle.act,'');}
  for(let i=0;i<4;i++)tick();assert.equal(idle.act,'cheer');assert.ok(idle.t<=4*DT+1e-9);
  for(let i=0;i<20;i++)tick();w.punchT=.1;tick();assert.equal(idle.act,'');assert.equal(idle.clip,'cheer');
  for(let i=0;i<14;i++)tick();assert.equal(idle.act,'cheer');assert.ok(idle.t<.2,`from its start again (${idle.t})`);
  for(let i=0;i<frames(1.3);i++)tick();assert.equal(idle.act,'');
  w.playPose!('cheer',1);for(let i=0;i<frames(CLIP_HOLD)+3;i++){w.punchT=.1;tick();}assert.equal(idle.clip,'','a long fight drops the cheer');
  for(let i=0;i<30;i++)tick();assert.equal(idle.act,'');
});

test('a pad button is input too; Battery saver and the sit do not search for things to look at; swapped parts are found again',()=>{
  const heard:Record<string,()=>void>={},g=globalThis as any,hadAdd=g.addEventListener,pad={buttons:[{pressed:false}],axes:[0,0]};
  g.addEventListener=(type:string,f:()=>void)=>{heard[type]=f;};
  const nav=Object.getOwnPropertyDescriptor(g,'navigator');Object.defineProperty(g,'navigator',{value:{getGamepads:()=>[null,pad]},configurable:true});
  try{
    const {w,tick,level,idle}=mounted();let reads=0;const list:unknown[]=[];Object.defineProperty(w,'enemies',{get(){reads++;return list;},configurable:true});
    for(let i=0;i<frames(31.5);i++)tick();assert.equal(idle.act,'sit');
    pad.buttons[0].pressed=true;tick();assert.equal(idle.act,'sit','no pad connected: not read');
    heard.gamepadconnected();tick();assert.equal(idle.act,'','a held button stands the explorer up');pad.buttons[0].pressed=false;
    pad.axes[1]=.6;for(let i=0;i<frames(12);i++){tick();assert.equal(idle.act,'');}pad.axes[1]=0;heard.gamepaddisconnected();
    // The sit: only the 5-a-second threat check reads the creatures, never the look.
    for(let i=0;i<frames(31.5);i++)tick();assert.equal(idle.act,'sit');reads=0;for(let i=0;i<120;i++)tick();assert.ok(reads<=11,`${reads} reads in 2 s of sitting`);
    idle.poke();tick();level.now='low';reads=0;for(let i=0;i<frames(12);i++)tick();assert.equal(reads,0,'Battery saver reads nothing');level.now='high';
    // Another head (a look or a disguise swaps the part): the new one is posed.
    const old=w.player.getObjectByName('head')!,head=new T.Group();head.name='head';old.parent!.add(head);old.removeFromParent();
    idle.poke();tick();(idle as any).start('look',2.6);idle.yaw=.8;for(let i=0;i<40;i++)tick();assert.ok(head.rotation.y>.6,`the new head turns (${head.rotation.y})`);
  }finally{g.addEventListener=hadAdd;if(nav)Object.defineProperty(g,'navigator',nav);else delete g.navigator;}
});
