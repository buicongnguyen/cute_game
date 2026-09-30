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
