import test from 'node:test';
import assert from 'node:assert/strict';
import {TITANS,TITAN_ITEMS,TITAN_LOOT} from '../src/titan-content.ts';
import {beginTitanAttack,stepTitanAttack,titanTelegraphs,sanitizeTitanAttacks,TITAN_WINDUPS,type TitanSkill} from '../src/titan-patterns.ts';
import {enemyRoster} from '../src/enemy-roster.ts';
import {PLANETS} from '../src/content.ts';
import * as Game from '../src/model.ts';
import {CombatSimulation} from '../src/combat.ts';
const source={x:30,z:0,radius:4,facing:0},target={id:'player',x:30,z:10};
const attack=(skill:TitanSkill)=>beginTitanAttack(skill,source,titanTelegraphs(skill,source,target,[target],()=>.5),[target]);

test('nine planets have distinct Titans, complete moves, and independent legendary hat and pet loot',()=>{
 assert.equal(Object.keys(TITANS).length,9);assert.equal(new Set(Object.values(TITANS).map(t=>t.planet)).size,9);
 for(const [id,t] of Object.entries(TITANS)){
  assert.ok(t.skills.length>=5);assert.ok(t.skills.every(skill=>TITAN_WINDUPS[skill]>0));
  const loot=TITAN_LOOT[id],hat=loot.find(([item])=>TITAN_ITEMS[item]?.slot==='hat'),pet=loot.find(([item])=>TITAN_ITEMS[item]?.slot==='pet');
  assert.equal(hat?.[1],.12);assert.equal(pet?.[1],.06);assert.ok(TITAN_ITEMS[pet![0]].pet!.dmg!>0);
 }
 for(const planet of Object.keys(PLANETS)){
  const roster=enemyRoster(planet as keyof typeof PLANETS),titan=roster.filter(e=>e.titan);assert.equal(titan.length,1);assert.equal(titan[0].respawn,600);
  assert.equal(new Set(roster.map(e=>e.id)).size,roster.length);assert.ok(roster.every(e=>e.id===`${planet}:enemy:${e.index}`));
 }
});
test('all Titan actions create serializable telegraphs and finish with finite bounded effects',()=>{
 for(const skill of Object.keys(TITAN_WINDUPS) as TitanSkill[]){
  const a=attack(skill);assert.ok(a.marks.length);let step;
  for(let i=0;i<150&&!step?.done;i++)step=stepTitanAttack(a,.05,source,[target]);
  assert.equal(step?.done,true,skill);assert.equal(sanitizeTitanAttacks([JSON.parse(JSON.stringify(a))]).length,1,skill);
  assert.ok(a.orbs.every(o=>Number.isFinite(o.x)&&Number.isFinite(o.z)));
 }
});
test('death ring damages its outer band while the green inner circle is safe',()=>{
 const result=stepTitanAttack(attack('donut'),.05,source,[{id:'safe',x:30,z:4},{id:'edge',x:30,z:7},{id:'outside',x:30,z:16}]);
 assert.deepEqual(result.hits.map(h=>h.id),['edge']);assert.equal(result.hits[0].multiplier,1.7);
});
test('bombardment warns before impact and hits the exact centre of its mark only once',()=>{
 const a=attack('bombard');assert.equal(stepTitanAttack(a,.44,source,[target]).hits.length,0);
 const impact=stepTitanAttack(a,.02,source,[target]);assert.ok(impact.hits.some(h=>h.id==='player'&&h.multiplier===1.3));
 assert.equal(stepTitanAttack(a,.01,source,[target]).hits.length,0);
});
test('pull moves ground players but not flying players and explodes after its warning',()=>{
 const a=attack('pull'),flying={...target,id:'fly',airborne:true};
 const first=stepTitanAttack(a,.1,source,[target,flying]);assert.deepEqual(first.pulls.map(p=>p.id),['player']);assert.ok(first.pulls[0].z<0);assert.equal(first.hits.length,0);
 const final=stepTitanAttack(a,1.21,source,[{...target,z:0}]);assert.equal(final.hits[0].multiplier,1.8);
});
test('poison pools tick every half-second and do not advance during a paused step',()=>{
 const a=attack('pools');assert.equal(stepTitanAttack(a,.39,source,[target]).hits.length,0);assert.equal(stepTitanAttack(a,0,source,[target]).hits.length,0);
 assert.equal(a.age,.39);assert.equal(stepTitanAttack(a,.02,source,[target]).hits.length,1);assert.equal(stepTitanAttack(a,.48,source,[target]).hits.length,0);assert.equal(stepTitanAttack(a,.03,source,[target]).hits.length,1);
});
test('leap lands on its marked target, with stronger damage in the centre',()=>{
 const a=attack('leap');assert.ok(stepTitanAttack(a,.4,source,[]).move!.y>7);
 const land=stepTitanAttack(a,.4,source,[target,{...target,id:'edge',x:34}]);assert.deepEqual(land.move,{x:30,z:10,y:Math.sin(Math.PI)*8});assert.deepEqual(land.hits.map(h=>h.multiplier),[2.2,1.5]);
});
test('homing orbs accelerate, collide without tunnelling, and cannot hit twice',()=>{
 const a=attack('orbs');let hits=0;for(let i=0;i<150;i++)hits+=stepTitanAttack(a,.05,source,[target]).hits.length;
 assert.ok(hits>0&&hits<=5);assert.equal(stepTitanAttack(a,1,source,[target]).hits.length,0);
});
test('Titan snapshots reject arbitrary effects and bound all collections and coordinates',()=>{
 const good=attack('lines');const input=[{...good,skill:'giveGold'},{...good,origin:{x:Infinity,z:0}},{...good,marks:[{x:999,z:0,r:2,delay:1}]},good];
 const out=sanitizeTitanAttacks(input);assert.equal(out.length,1);assert.notEqual(out[0].marks,good.marks);assert.equal(out[0].skill,'lines');
 const oversized=Array(100).fill({...good,marks:Array(1000).fill(good.marks[0]),nextHit:{'__proto__':100,foo:Infinity}});assert.equal(sanitizeTitanAttacks(oversized).length,8);assert.equal(sanitizeTitanAttacks(oversized)[0].marks.length,64);
});

test('each Titan reward can be earned, equipped for real stats, saved, and used as an attacking companion',()=>{
 for(const [id,titan] of Object.entries(TITANS)){
  const state=Game.newGame(),loot=Game.grantDefeat(state,id,titan.xp,true,()=>0,false),key=id.replace('titan_',''),hat='hat_t_'+key,pet='pet_t_'+key;
  assert.ok(loot.some(d=>d.id===hat));assert.ok(loot.some(d=>d.id===pet));assert.equal(state.bag[hat],undefined);
  for(const item of loot)assert.equal(Game.addItem(state,item.id,item.count),true);
  const before=Game.activeStats(state);assert.equal(Game.equip(state,hat),true);assert.notDeepEqual(Game.activeStats(state),before,hat);assert.equal(Game.equip(state,pet),true);
  const restored=Game.parseSave(JSON.stringify(state))!;assert.equal(restored.gear.hat,hat);assert.equal(restored.gear.pet,pet);
  const target={id:'enemy',x:0,z:4,radius:.7,hp:100000},definition=TITAN_ITEMS[pet].pet!;
  const sim=new CombatSimulation({position:()=>({x:0,z:0}),facing:()=>0,face(){},move(){},targets:()=>[target],weapon:()=>({kind:'fist'}),stats:()=>Game.activeStats(restored),effect(){},hit:(t,hit)=>{t.hp-=hit.amount;},pet:()=>({x:0,z:0,dmg:definition.dmg!,cd:definition.cd!,shot:definition.shot})},()=>.5);
  for(let n=0;n<20;n++)sim.update(.05);assert.ok(target.hp<100000,pet);
 }
});
