/** Public gameplay rules expressed as data and independently authored pure logic. */
export type BossSkill='slam'|'quake'|'charge'|'barrage'|'rain'|'spin'|'eclipse';
export interface BossPoint {x:number;z:number}
export interface BossTelegraph extends BossPoint {r:number;delay:number}
export const BOSS_WINDUPS:Record<BossSkill,number>={slam:1.1,quake:1.2,charge:1,barrage:.9,rain:1.3,spin:.7,eclipse:1.2};
export const BOSS_SKILLS:Record<string,readonly BossSkill[]>={
  bear:['slam','charge','quake'],treant:['slam','rain','barrage'],croc:['charge','spin','slam'],mushking:['rain','spin','slam'],
  cake:['barrage','rain','slam'],gingerbread:['charge','barrage','spin'],jellyqueen:['quake','barrage','rain'],
  yeti:['slam','rain','quake'],mammoth:['charge','quake','slam'],frostowl:['barrage','charge','rain'],
  golem:['slam','rain','barrage'],dragon:['barrage','rain','charge','quake'],robot:['barrage','charge','quake','spin'],
  gorilla:['slam','charge','rain','quake'],leviathan:['barrage','rain','quake','charge'],phoenix:['barrage','rain','charge','spin'],
  shadowlord:['eclipse','rain','spin','barrage','quake'],
};
export const ZONE_DIFFICULTY:Record<string,number>={home:0,forest:1,meadow:1,swamp:2,canyon:3,candy:3,ice:4,lava:5,toy:2,jungle:3,ocean:4,sky:5,cloud:5,dark:6,shadow:6};
const DIFFICULTY_MULTIPLIERS=[1,1,1.7,2.6,3.6,4.8,6.2];
export function creatureScale(difficulty:number,boss=false,worldBoss=false){
  const rank=Math.min(6,Math.max(0,Math.floor(difficulty))),base=DIFFICULTY_MULTIPLIERS[rank];
  return {level:rank*3-2+(boss?6:0),hpMultiplier:base*(boss&&!worldBoss?2.6:1),attackMultiplier:base*(boss?1.35:1),xpMultiplier:.6+base*.4};
}
/** Apply this to definition HP/attack once when a boss acquires its first target. */
export function bossScale(zone:string,type:string,players:number,maxPlayerLevel:number){
  const base=creatureScale(ZONE_DIFFICULTY[zone]??1,true,type==='dragon'),count=Math.max(1,Math.floor(players)),extraLevels=Math.max(0,maxPlayerLevel-base.level);
  return {...base,hpMultiplier:base.hpMultiplier*(1+.6*(count-1))*(1+extraLevels*.12),attackMultiplier:base.attackMultiplier*(1+.1*(count-1))*(1+extraLevels*.07)};
}
/** Three HP phases belong to world bosses; ordinary bosses enrage below 30%. */
export function bossPhase(hp:number,maxHp:number):1|2|3 {const fraction=maxHp>0?hp/maxHp:1;return fraction<1/3?3:fraction<2/3?2:1;}
/** attackCount is one-based; skillCount is the number of special attacks already used. */
export function bossSkill(type:string,attackCount:number,hpFraction:number,skillCount:number):BossSkill|null{
  const skills=BOSS_SKILLS[type];if(!skills)return attackCount%3===0?'slam':null;
  const special=hpFraction<.3||attackCount%2===0||(hpFraction<.5&&attackCount%3!==1);
  return special?skills[Math.max(0,skillCount)%skills.length]:null;
}
export function bossTelegraphs(skill:BossSkill,from:BossPoint,target:BossPoint,phase=1,seed=1):BossTelegraph[]{
  const delay=BOSS_WINDUPS[skill],round=(n:number)=>Math.round(n*100)/100,point=(p:BossPoint,r:number)=>({x:round(p.x),z:round(p.z),r,delay});
  if(skill==='charge'){
    const distance=Math.hypot(target.x-from.x,target.z-from.z)||1,dx=(target.x-from.x)/distance,dz=(target.z-from.z)/distance;
    return Array.from({length:6},(_,i)=>point({x:from.x+dx*(i+1)*2,z:from.z+dz*(i+1)*2},1.3));
  }
  if(skill==='rain'){
    let value=seed>>>0;const random=()=>{value=(Math.imul(value,1664525)+1013904223)>>>0;return value/4294967296;};
    const marks=[point(target,2)];for(let i=1;i<(phase>=2?4:3);i++){const angle=random()*Math.PI*2,distance=2+random()*4.5;marks.push(point({x:target.x+Math.cos(angle)*distance,z:target.z+Math.sin(angle)*distance},2));}return marks;
  }
  return [point(from,{slam:4.8,quake:9,barrage:2.2,spin:3.4,eclipse:7}[skill])];
}
/**
 * Telegraph language, after the reference: red means "your target" (the open ring), so danger is a
 * filled disc whose inner fill grows over the wind-up. Opacities and the 0.12 m edge are the reference's.
 */
export const TELEGRAPH_LOOK={base:.18,fill:.35,edge:.8,edgeWidth:.12};
/** Each boss skill has its own colour, so a glance tells a slam from falling rocks. */
export const BOSS_TELEGRAPH_COLORS:Record<BossSkill,string>={slam:'#ff5a3b',quake:'#ffb13d',charge:'#ff3b3b',barrage:'#b06aff',rain:'#ff7a1f',spin:'#ff3bd0',eclipse:'#8a5aff'};
/** The callout floated above a boss at the start of a wind-up (one per skill, never a toast). */
export const BOSS_CALLOUTS:Record<BossSkill,string>={slam:'⚠️ SLAM',quake:'⚠️ QUAKE',charge:'⚠️ CHARGE',barrage:'⚠️ BARRAGE',rain:'⚠️ METEOR RAIN',spin:'⚠️ SPIN',eclipse:'⚠️ ECLIPSE'};
/** Callouts show only to explorers this close to the boss (metres). */
export const CALLOUT_RANGE=30;
/**
 * The ordinary creatures the reference telegraphs on the ground; every other creature warns by
 * pose alone (crouch, lean, tremble). `at`: around itself, in front of it, or where it will land.
 */
export const CREATURE_TELEGRAPHS:Record<string,{r:number;at:'self'|'front'|'target';color:string}>={
  magmaturtle:{r:2.6,at:'self',color:'#ff3b3b'},lavaworm:{r:2,at:'self',color:'#ff3b3b'},
  firebat:{r:1.2,at:'target',color:'#ff3b3b'},chomper:{r:1.4,at:'front',color:'#ff3b3b'},
};
/** Fill of a telegraph: 0 when the wind-up starts, exactly 1 when the blow lands (remaining reaches 0). */
export function telegraphProgress(remaining:number,total:number){if(!(total>0))return 1;return Math.min(1,Math.max(0,1-remaining/total));}
