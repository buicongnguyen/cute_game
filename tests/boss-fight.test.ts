import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {World,type Enemy} from '../src/world.ts';
import {newGame} from '../src/model.ts';
import {EnvironmentSimulation,createEnvironmentLayout} from '../src/environments.ts';
import {BOSS_CALLOUTS,BOSS_TELEGRAPH_COLORS,hitControl,keepsChasing,liftHeight} from '../src/boss-patterns.ts';
import {CombatSimulation,type CombatHit,type CombatTarget} from '../src/combat.ts';
import type {Effects} from '../src/fx.ts';

// Boss fights against the reference's rules (bundle apply/applyStatus/beginWindup/castSkill/enrage, RC-13, RU-F10).
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
const texts:string[]=[];
const quietFx=()=>({text:(_a:unknown,m:string)=>texts.push(m),burst(){},ring(){},spark(){},shake(){},update(){},shakeOffset:()=>new T.Vector3()}) as unknown as Effects;
const step=(w:World,n=1)=>{for(let i=0;i<n;i++)w.update(.025,true,false);};

test('a hit never staggers a boss: its skill wind-up runs to the end and the skill lands',()=>{
  const w=world(),callouts:string[]=[];let damage=0;
  w.fx={...quietFx(),text:(_a:unknown,m:string,style:string)=>{if(style.includes('callout'))callouts.push(m);}} as unknown as Effects;
  w.onDamage=n=>{damage+=n;};w.position.set(32,0,0);const e=w.spawnSpecies('bear',30,0,0)!;e.attackCount=1;
  step(w);assert.equal(e.phase,'windup');assert.equal(e.skill,'slam');const total=e.windupTotal!;
  // Hit it every 0.5 s, like fists do, through the whole wind-up.
  let steps=0;while(e.phase==='windup'&&steps<200){if(steps%20===0)w.damageEnemy(e,10,.15);assert.equal(e.stun,0,'no flinch on a boss');step(w);steps++;}
  assert.ok(Math.abs(steps*.025-total)<.03,`the wind-up ran its full ${total}s (${steps*.025}s)`);
  assert.equal(e.phase,'recover');assert.ok(damage>0,'the slam hit the explorer');
  assert.deepEqual(callouts,[BOSS_CALLOUTS.slam],'one callout for one wind-up, never repeated');
});

test('hard stuns and sheep, charm or fear only slow a boss (resisted), with a RESIST float',()=>{
  assert.deepEqual(hitControl(true,.15),{stun:0,slow:0});assert.deepEqual(hitControl(true,3),{stun:0,slow:3*.6});
  assert.deepEqual(hitControl(false,0),{stun:0,slow:0});assert.deepEqual(hitControl(false,.15),{stun:0,slow:0});assert.deepEqual(hitControl(false,2),{stun:2,slow:0});
  texts.length=0;const w=world();w.fx=quietFx();w.position.set(32,0,0);const e=w.spawnSpecies('bear',30,0,0)!;
  w.damageEnemy(e,5,3);assert.equal(e.stun,0);assert.ok(Math.abs(e.statuses!.slow-1.8)<1e-9);
  w.statusEnemy(e,'sheep',6);w.statusEnemy(e,'charm',8);w.statusEnemy(e,'fear',4);
  assert.equal(e.statuses!.sheep??0,0);assert.equal(e.statuses!.charm??0,0);assert.equal(e.statuses!.fear??0,0);
  assert.ok(Math.abs(e.statuses!.slow-8*.6)<1e-9,'the longest resisted effect sets the slow');
  assert.ok(texts.includes('🛡️ RESIST'));
  w.statusEnemy(e,'taunt',6);w.statusEnemy(e,'blind',2);assert.equal(e.statuses!.taunt,6);assert.equal(e.statuses!.blind,2);
  const wolf=w.spawnSpecies('wolf',40,0,1)!;w.statusEnemy(wolf,'sheep',6);assert.equal(wolf.statuses!.sheep,6);
});

test('knockback is 6 m/s per knock unit and x0.15 on a boss; a launch lifts a boss at a quarter speed and interrupts it',()=>{
  const w=world();w.position.set(32,0,0);const bear=w.spawnSpecies('bear',30,0,0)!,wolf=w.spawnSpecies('wolf',40,0,1)!;
  w.knockEnemy(bear,1,0,1.2);w.knockEnemy(wolf,1,0,1.2);
  assert.ok(Math.abs(bear.knockVX!-1.2*6*.15)<1e-9);assert.ok(Math.abs(wolf.knockVX!-1.2*6)<1e-9);
  assert.equal(liftHeight(true,2.5),2.5*.0625);assert.equal(liftHeight(false,2.5),2.5);
  const boss=w.spawnSpecies('croc',30,8,2)!;boss.attackCount=1;w.position.set(32,0,8);step(w);assert.equal(boss.phase,'windup');
  w.knockUpEnemy(boss,2.5,.75);assert.ok(Math.abs(boss.liftVelocity!-Math.sqrt(2.5*.0625*24))<1e-9);step(w);assert.notEqual(boss.phase,'windup','a launch is the one hit that cancels a boss wind-up');
});

test('the punch knocks 0.8, every third punch 2.2 (reference combo)',()=>{
  const hits:CombatHit[]=[],target:CombatTarget={id:'a',x:0,z:1.5,hp:999,radius:.7};
  const sim=new CombatSimulation({position:()=>({x:0,z:0}),facing:()=>0,face(){},targets:()=>[target],weapon:()=>({kind:'fist',range:1}),stats:()=>({attack:10,critChance:0}),move(){},hit:(_t,h)=>hits.push(h),effect(){}},()=>.5);
  for(let i=0;i<3;i++)sim.basic(target);
  assert.deepEqual(hits.map(h=>h.knock),[.8,.8,2.2]);
});

test('a boss keeps chasing past its leash while it is being hit, then gives up 4 s after the last hit',()=>{
  assert.equal(keepsChasing(30,13,10,99),false);assert.equal(keepsChasing(30,13,10,1),true);assert.equal(keepsChasing(10,13,31,99),false);assert.equal(keepsChasing(10,13,29,99),true);
  const w=world();const e=w.spawnSpecies('bear',60,0,0)!;e.cooldown=999;w.position.set(64,0,0);step(w);assert.equal(e.phase,'chase');
  // Drag the fight 35 m from home while hitting it every second: it stays on the explorer.
  e.x=95;w.position.set(99,0,0);
  for(let i=0;i<120;i++){if(i%40===0)w.damageEnemy(e,1);e.cooldown=999;step(w);}
  assert.equal(e.phase,'chase');
  for(let i=0;i<180;i++){e.cooldown=999;step(w);}
  assert.equal(e.phase,'return','no hit for 4 s: it walks home');
});

test('enrage fires once when a boss drops below 30% in the fight, and resets when it walks home healed',()=>{
  const w=world(),toasts:string[]=[];texts.length=0;w.fx=quietFx();w.onEnvironmentEvent=ev=>{if(ev.message)toasts.push(ev.message);};
  w.position.set(32,0,0);const e=w.spawnSpecies('bear',30,0,0)!;e.cooldown=999;step(w);
  w.damageEnemy(e,e.hp*.75);e.cooldown=999;step(w);assert.equal(e.enraged,true);assert.equal(toasts.length,1);assert.ok(texts.includes('😡 ENRAGED!'));
  step(w,5);assert.equal(toasts.length,1);
  e.lastHitAt=-99;w.position.set(0,0,0);e.x+=6;for(let i=0;i<800;i++){e.cooldown=999;step(w);if(e.phase==='idle')break;}
  assert.equal(e.phase,'idle');assert.equal(e.hp,e.maxHp);assert.equal(e.enraged,false);
});

test('bosses with a skill list never throw the plain slam; their off-beat attacks are ordinary blows within range + 0.6 m',()=>{
  const w=world();let damage=0;w.onDamage=n=>{damage+=n;};w.position.set(32.7,0,0);const e=w.spawnSpecies('bear',30,0,0)!;
  e.attackCount=2;e.mesh.userData.attackCount=2;e.hp=e.maxHp; // the 3rd attack at full HP: no skill in the reference
  step(w);assert.equal(e.phase,'windup');assert.equal(e.skill,undefined);assert.equal(e.mesh.userData.slam,false);
  assert.ok(Math.abs(e.windupTotal!-e.definition!.windup)<1e-9,'the plain blow uses the creature wind-up, not the 1.1 s slam');
  for(let i=0;i<40&&e.phase==='windup';i++)step(w);
  assert.ok(damage>0,'2.7 m away is inside range 2.6 + 0.6 for a boss');
  assert.equal(w.decals?.active.length??0,0);
});

test('boss discs use the reference colours: rain orange, charge amber, the rest red',()=>{
  assert.equal(BOSS_TELEGRAPH_COLORS.rain,'#ff7a1f');assert.equal(BOSS_TELEGRAPH_COLORS.charge,'#ffb13d');
  for(const k of ['slam','quake','barrage','spin','eclipse'] as const)assert.equal(BOSS_TELEGRAPH_COLORS[k],'#ff3b3b');
});

test('a charging boss hits the explorer within its body radius + 0.6 m, once',()=>{
  const w=world();let hits=0;w.onDamage=()=>{hits++;};w.position.set(32.5,0,0);const e:Enemy=w.spawnSpecies('croc',30,0,0)!;
  e.attackCount=1; // croc's first special is the charge (on attack 2)
  step(w);assert.equal(e.skill,'charge');for(let i=0;i<120&&hits===0;i++)step(w);
  assert.equal(hits,1);
});

test('a defeated boss comes back after 90 s, and only once every explorer is more than 22 m from its home',()=>{
  const w=world();w.position.set(32,0,0);const e=w.spawnSpecies('bear',30,0,0)!;w.damageEnemy(e,e.hp);assert.equal(e.respawn,90);
  for(let i=0;i<3700;i++)w.update(.025,true,false);assert.equal(e.hp,0,'the explorer still stands near its home');
  w.position.set(60,0,0);step(w);assert.equal(e.hp,e.maxHp);assert.equal(e.enraged??false,false);
});

test('an ordinary creature does not flinch: punches during its wind-up neither stun it nor cancel the bite',()=>{
  const w=world();let damage=0;w.onDamage=n=>{damage+=n;};w.position.set(30,0,0);const wolf=w.spawnSpecies('wolf',31.2,0,0)!;
  for(let i=0;i<40&&wolf.phase!=='windup';i++)step(w);assert.equal(wolf.phase,'windup');
  for(let i=0;i<60&&!damage;i++){if(i%4===0)w.damageEnemy(wolf,1,.15);assert.equal(wolf.stun,0);step(w);}
  assert.ok(damage>0,'the wind-up ran out and the bite landed');
  // Real crowd control still stops it: a hard stun (ice, thunder) and a launch.
  w.damageEnemy(wolf,1,1.5);assert.equal(wolf.stun,1.5);step(w);assert.equal(wolf.phase,'chase');
});

test('knock distances match the reference: a punch slides a creature about 0.6 m, a boss about 0.09 m',()=>{
  // Two identical worlds, one knocked: the difference is the slide alone (6 m/s per unit, damped by 1 - 8 dt).
  const slide=(type:string,knock:number)=>{
    const run=(k:number)=>{const w=world();w.position.set(0,0,0);const e=w.spawnSpecies(type,45,0,0)!;if(k)w.knockEnemy(e,1,0,k);step(w,60);return e.x;};
    return run(knock)-run(0);
  };
  const wolf=slide('wolf',.8),third=slide('wolf',2.2),bear=slide('bear',.8);
  assert.ok(Math.abs(wolf-.8*6/8)<.08,`punch slide ${wolf.toFixed(3)} m`);
  assert.ok(Math.abs(third-2.2*6/8)<.2,`third punch slide ${third.toFixed(3)} m`);
  assert.ok(Math.abs(bear-.8*6*.15/8)<.03,`boss slide ${bear.toFixed(3)} m`);
});

test('boss cooldowns: x0.7 below half health and x0.6 once enraged, for plain blows as well as skills (bundle @837714)',async()=>{
  const {bossCooldownScale}=await import('../src/world.ts');
  const b=(hp:number,enraged=false)=>bossCooldownScale({boss:true,hp,maxHp:100,enraged});
  assert.equal(b(100),1);assert.equal(b(40),.7);assert.ok(Math.abs(b(40,true)-.42)<1e-12);assert.equal(b(80,true),.6,'keyed on enraged, not on a health line');
  assert.equal(bossCooldownScale({boss:false,hp:10,maxHp:100,enraged:true}),1);
  // A plain blow (3rd attack above half health: no skill) from an enraged boss.
  const w=world();w.fx=quietFx();w.position.set(32.7,0,0);const e=w.spawnSpecies('bear',30,0,0)!;
  e.attackCount=2;e.mesh.userData.attackCount=2;e.scaled=true;e.hp=e.maxHp*.8;e.enraged=true;
  step(w);assert.equal(e.phase,'windup');assert.equal(e.skill,undefined,'a plain blow');
  for(let i=0;i<40&&e.phase==='windup';i++)step(w);
  assert.equal(e.phase,'recover');assert.ok(Math.abs(e.cooldown-e.definition!.cooldown*.6)<.03,`cooldown ${e.cooldown} vs ${e.definition!.cooldown*.6}`);
});

test('a respawned boss is calm again: enraged clears on respawn and on the dragon summon',async()=>{
  const w=world();w.position.set(32,0,0);const e=w.spawnSpecies('bear',30,0,0)!;e.enraged=true;w.damageEnemy(e,e.hp);
  w.position.set(60,0,0);for(let i=0;i<3700&&e.hp<=0;i++)step(w);assert.equal(e.hp,e.maxHp);assert.equal(e.enraged,false);
  const {lavaEvent}=await import('../src/lava-weather.ts');
  const v=world();v.planet='lava';v.environment=new EnvironmentSimulation(createEnvironmentLayout('lava'));let cycle=0;while(lavaEvent(cycle*360).id!=='dragon')cycle++;
  const dragon=v.spawnSpecies('dragon',-96,58,0)!;dragon.hp=0;dragon.respawn=999999;dragon.enraged=true;
  v.environment.time=cycle*360+239.9;v.update(.01,true,false);assert.equal(dragon.hp,dragon.maxHp);assert.equal(dragon.enraged,false);
});
