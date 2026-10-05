import { TITANS, type TitanSkill } from './titan-content.ts';

export type { TitanSkill } from './titan-content.ts';
export interface TitanPoint {x:number;z:number}
export interface TitanSource extends TitanPoint {radius:number;facing:number}
export interface TitanTarget extends TitanPoint {id:string;airborne?:boolean}
export interface TitanMark extends TitanPoint {r:number;delay:number;k?:number;a?:number;safe?:boolean}
export const TITAN_WINDUPS:Record<TitanSkill,number>={sweep:1.3,pull:1.1,lines:1.2,bombard:1.3,leap:1,donut:1.6,orbs:1,pools:1.2,summon:1.1,stomp4:1};
export const TITAN_COLORS:Record<TitanSkill,string>={sweep:'#ff3bd0',pull:'#8a5aff',lines:'#ff7a1f',bombard:'#ff3b3b',leap:'#ffb13d',donut:'#ff2a2a',orbs:'#b06aff',pools:'#7fff5a',summon:'#ffe14d',stomp4:'#ff5a3b'};
export const TITAN_CALLOUTS:Record<TitanSkill,string>={sweep:'⚠️ SWEEPING BEAM',pull:'⚠️ SUCTION PULL',lines:'⚠️ RAY BURST',bombard:'⚠️ BOMBARDMENT',leap:'⚠️ LEAP CRUSH',donut:'⚠️ DEATH RING — STAY CLOSE!',orbs:'⚠️ HOMING ORBS',pools:'⚠️ POISON POOLS',summon:'⚠️ SUMMON',stomp4:'⚠️ REPEATED STOMPS'};
export const TITAN_MOVE_SETS=Object.fromEntries(Object.entries(TITANS).map(([id,d])=>[id,d.skills])) as Record<string,readonly TitanSkill[]>;
export const isTitanSkill=(skill:string|undefined):skill is TitanSkill=>!!skill&&Object.hasOwn(TITAN_WINDUPS,skill);
const distance=(a:TitanPoint,b:TitanPoint)=>Math.hypot(a.x-b.x,a.z-b.z);
const wrap=(a:number)=>Math.atan2(Math.sin(a),Math.cos(a));
/** Marks are generated once by the host and included in snapshots; peers never roll hazards independently. */
export function titanTelegraphs(skill:TitanSkill,source:TitanSource,target:TitanPoint,targets:TitanTarget[]=[],random:()=>number=Math.random):TitanMark[]{
  const delay=TITAN_WINDUPS[skill],marks:TitanMark[]=[],near=targets.filter(p=>distance(p,source)<30);
  const add=(x:number,z:number,r:number,extra:Partial<TitanMark>={})=>marks.push({x:Math.round(x*100)/100,z:Math.round(z*100)/100,r,delay,...extra});
  if(skill==='sweep'){const a=Math.atan2(target.x-source.x,target.z-source.z)-1.75;for(let n=1;n<=8;n++)add(source.x+Math.sin(a)*(source.radius+n*2),source.z+Math.cos(a)*(source.radius+n*2),1.2,{a});}
  if(skill==='pull')add(source.x,source.z,source.radius+4);
  if(skill==='lines')for(let i=0;i<6;i++){const a=source.facing+i/6*Math.PI*2;for(let k=1;k<=7;k++)add(source.x+Math.sin(a)*(source.radius+k*2.3),source.z+Math.cos(a)*(source.radius+k*2.3),1.3,{k});}
  if(skill==='bombard'){for(const p of near)add(p.x,p.z,2.4,{k:0});for(let i=0;i<14;i++){const a=random()*Math.PI*2,r=source.radius+2+random()*16;add(source.x+Math.sin(a)*r,source.z+Math.cos(a)*r,2.4,{k:1+i%4});}}
  if(skill==='leap')add(target.x,target.z,6.5);
  if(skill==='donut'){add(source.x,source.z,source.radius+11);add(source.x,source.z,source.radius+1.5,{safe:true});}
  if(skill==='orbs')add(source.x,source.z,source.radius+1);
  if(skill==='pools'){for(const p of near)add(p.x,p.z,2.8);while(marks.length<5){const a=random()*Math.PI*2,r=source.radius+3+random()*9;add(source.x+Math.sin(a)*r,source.z+Math.cos(a)*r,2.8);}}
  if(skill==='summon')add(source.x,source.z,source.radius+2);
  if(skill==='stomp4')for(let k=0;k<4;k++){const p=near[k%Math.max(1,near.length)]??target;add(p.x+(random()-.5)*2,p.z+(random()-.5)*2,3.6,{delay:delay+k*.35,k});}
  return marks;
}
export interface TitanOrb extends TitanPoint {vx:number;vz:number;targetId?:string;done:boolean}
export interface TitanAttack {
  skill:TitanSkill;age:number;life:number;origin:TitanPoint;facing:number;radius:number;marks:TitanMark[];
  fired:number[];nextHit:Record<string,number>;orbs:TitanOrb[];
}
export interface TitanStep {hits:Array<{id:string;multiplier:number;source:'melee'|'shot'|'hazard'}>;pulls:Array<{id:string;x:number;z:number}>;bursts:TitanMark[];summon:boolean;move?:TitanPoint&{y:number};done:boolean}
export function beginTitanAttack(skill:TitanSkill,source:TitanSource,marks:TitanMark[],targets:TitanTarget[]):TitanAttack{
  const life:Record<TitanSkill,number>={sweep:2.2,pull:1.35,lines:1.2,bombard:2.3,leap:.8,donut:.35,orbs:7,pools:7,summon:.3,stomp4:1.3};
  const orbs:TitanOrb[]=skill==='orbs'?Array.from({length:5},(_,i)=>{const a=source.facing+i*Math.PI*2/5;return{x:source.x+Math.sin(a)*source.radius,z:source.z+Math.cos(a)*source.radius,vx:Math.sin(a)*6,vz:Math.cos(a)*6,targetId:targets.length?targets[i%targets.length].id:undefined,done:false};}):[];
  return {skill,age:0,life:life[skill],origin:{x:source.x,z:source.z},facing:source.facing,radius:source.radius,marks:marks.map(p=>({...p})),fired:[],nextHit:{},orbs};
}
/** Pure fixed-step encounter effects. All delayed attacks pause with the world and die with their caster. */
export function stepTitanAttack(a:TitanAttack,dt:number,source:TitanPoint,targets:TitanTarget[]):TitanStep{
  const out:TitanStep={hits:[],pulls:[],bursts:[],summon:false,done:false};if(!(dt>0)||!Number.isFinite(dt)||a.age>=a.life){out.done=a.age>=a.life;return out;}
  a.age=Math.min(a.life,a.age+dt);
  const hit=(p:TitanTarget,multiplier:number,kind:'melee'|'shot'|'hazard'='melee',key='',period=0)=>{const k=key+':'+p.id;if(period&&(a.nextHit[k]??-1)>a.age)return;if(period)a.nextHit[k]=a.age+period;out.hits.push({id:p.id,multiplier,source:kind});};
  const once=(index:number,time:number,fn:()=>void)=>{if(!a.fired.includes(index)&&a.age>=time){a.fired.push(index);fn();}};
  const area=(p:TitanMark,multiplier:number,kind:'melee'|'shot'|'hazard'='melee',inner=0)=>{out.bursts.push(p);for(const target of targets){const d=distance(p,target);if(d<p.r&&(inner===0||d>inner))hit(target,multiplier,kind);}};
  if(a.skill==='sweep'){const angle=(a.marks[0]?.a??a.facing)+a.age/2.2*3.5;for(const p of targets){const d=distance(source,p),delta=wrap(Math.atan2(p.x-source.x,p.z-source.z)-angle);if(d<a.radius+17&&Math.abs(delta)<.16+1/Math.max(3,d))hit(p,.9,'shot','beam',.45);}}
  if(a.skill==='pull'){for(const p of targets){const d=distance(source,p);if(!p.airborne&&d<a.radius+16&&d>a.radius+.5){const step=Math.max(0,Math.min(d-a.radius,dt*(9-d*.25)));out.pulls.push({id:p.id,x:(source.x-p.x)/d*step,z:(source.z-p.z)/d*step});}}once(0,1.3,()=>area({...source,r:a.radius+4.5,delay:0},1.8));}
  if(a.skill==='lines')a.marks.forEach((p,i)=>once(i,.06+(p.k??0)*.11,()=>area({...p,r:p.r+.2},1.2)));
  if(a.skill==='bombard')a.marks.forEach((p,i)=>once(i,.45+(p.k??0)*.38,()=>area(p,1.3,'hazard')));
  if(a.skill==='leap'){const p=a.marks[0]??{...a.origin,r:6.5,delay:0},f=a.age/.8;out.move={x:a.origin.x+(p.x-a.origin.x)*f,z:a.origin.z+(p.z-a.origin.z)*f,y:Math.sin(f*Math.PI)*8};once(0,.8,()=>{out.bursts.push(p);for(const t of targets){const d=distance(p,t);if(d<p.r)hit(t,d<3?2.2:1.5);}});}
  if(a.skill==='donut')once(0,0,()=>area({...source,r:a.radius+11,delay:0},1.7,'hazard',a.radius+1.5));
  if(a.skill==='summon')once(0,0,()=>{out.summon=true;out.bursts.push({...source,r:a.radius+2,delay:0});});
  if(a.skill==='stomp4')a.marks.forEach((p,i)=>once(i,.06+(p.k??i)*.35,()=>area(p,1.4)));
  if(a.skill==='pools'&&a.age>=.4)for(let i=0;i<a.marks.length;i++){const p=a.marks[i];for(const t of targets)if(distance(p,t)<p.r)hit(t,.3,'hazard','pool'+i,.5);}
  if(a.skill==='orbs')for(const orb of a.orbs){if(orb.done)continue;const target=targets.find(t=>t.id===orb.targetId);if(target){const d=distance(orb,target);if(d<1.3){hit(target,1.2,'shot');orb.done=true;continue;}const acceleration=a.age<.6?4:11;orb.vx+=(target.x-orb.x)/d*acceleration*dt;orb.vz+=(target.z-orb.z)/d*acceleration*dt;const speed=Math.hypot(orb.vx,orb.vz);if(speed>7.5){orb.vx*=7.5/speed;orb.vz*=7.5/speed;}}
    const from={x:orb.x,z:orb.z};orb.x+=orb.vx*dt;orb.z+=orb.vz*dt;
    if(target){const dx=orb.x-from.x,dz=orb.z-from.z,len=dx*dx+dz*dz,f=len?Math.max(0,Math.min(1,((target.x-from.x)*dx+(target.z-from.z)*dz)/len)):0;if(Math.hypot(target.x-from.x-dx*f,target.z-from.z-dz*f)<1.3){hit(target,1.2,'shot');orb.done=true;}}
  }
  out.done=a.age>=a.life;return out;
}

/** Accept only bounded visual state from a world host. Never use these values to award damage or loot. */
export function sanitizeTitanAttacks(value:unknown):TitanAttack[]{
  if(!Array.isArray(value))return [];
  const number=(v:unknown,min:number,max:number)=>typeof v==='number'&&Number.isFinite(v)&&v>=min&&v<=max;
  const record=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
  const point=(v:unknown):v is TitanPoint=>record(v)&&number(v.x,-160,160)&&number(v.z,-160,160);
  const result:TitanAttack[]=[];
  for(const raw of value.slice(0,8)){
    if(!record(raw)||typeof raw.skill!=='string'||!isTitanSkill(raw.skill)||!point(raw.origin)||!number(raw.age,0,7)||!number(raw.life,.1,7)||!number(raw.radius,.5,5)||!number(raw.facing,-100,100)||!Array.isArray(raw.marks))continue;
    const marks:TitanMark[]=[];
    for(const m of raw.marks.slice(0,64))if(point(m)&&record(m)&&number(m.r,.1,20)&&number(m.delay,0,5))marks.push({x:m.x,z:m.z,r:m.r as number,delay:m.delay as number,...(number(m.k,0,64)?{k:Math.floor(m.k as number)}:{}),...(number(m.a,-100,100)?{a:m.a as number}:{}),...(m.safe===true?{safe:true}:{})});
    if(!marks.length)continue;
    const orbs:TitanOrb[]=[];for(const o of Array.isArray(raw.orbs)?raw.orbs.slice(0,5):[])if(point(o)&&record(o)&&number(o.vx,-8,8)&&number(o.vz,-8,8))orbs.push({x:o.x,z:o.z,vx:o.vx as number,vz:o.vz as number,done:o.done===true,...(typeof o.targetId==='string'&&o.targetId.length<=100?{targetId:o.targetId}:{})});
    const fired=Array.isArray(raw.fired)?raw.fired.filter((v):v is number=>number(v,0,64)&&Number.isInteger(v)).slice(0,65):[];
    const nextHit:Record<string,number>={};if(record(raw.nextHit))for(const[key,v]of Object.entries(raw.nextHit).slice(0,64))if(key.length<=180&&key!=='__proto__'&&number(v,0,15))nextHit[key]=v as number;
    result.push({skill:raw.skill,age:raw.age as number,life:raw.life as number,radius:raw.radius as number,facing:raw.facing as number,origin:{x:raw.origin.x,z:raw.origin.z},marks,orbs,fired,nextHit});
  }
  return result;
}
