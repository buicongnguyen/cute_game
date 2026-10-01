export interface CombatPoint { x: number; z: number }
export interface WeaponProfile { kind: 'fist'|'sword'|'gun'|'rod'; range?: number; cd?: number; arc?: number; special?: string; shot?: string; spread?: number; quality?: number; fx?: string }
export interface CombatTarget extends CombatPoint { id: string; hp: number; maxHp?:number; boss?:boolean; radius: number; stun?: number }
export interface CombatStats { attack: number; maxHp?:number; critChance: number; critDamage?: number; haste?: number; lifesteal?: number }
export interface CombatHit { amount: number; critical: boolean; stun: number; lift: number; knock: number; direction: CombatPoint }
export interface CombatEffect extends CombatPoint { kind: 'arc'|'ring'|'impact'|'trail'|'beam'|'cast'; color: string; radius: number; facing?: number; duration?: number }
export interface CombatHost {
  position(): CombatPoint; facing(): number; face(angle: number): void;
  targets(): CombatTarget[]; weapon(): WeaponProfile; stats(): CombatStats;
  move(x: number, z: number): void; hit(target: CombatTarget, hit: CombatHit): number|void;
  effect(effect: CombatEffect): void; clearShot?(from: CombatPoint, to: CombatPoint): boolean;
  heal?(fraction: number): void;
  /** Online execution is resolved by the authority; healing is awarded only on its confirmation. */
  execute?(target:CombatTarget,healFraction:number):void;
  moving?():boolean;
  pet?():{x:number;z:number;dmg:number;cd:number;shot?:string}|null;
  status?(target:CombatTarget,kind:'fear'|'charm'|'slow'|'blind'|'sheep'|'taunt',duration:number):void;
  moveTarget?(target:CombatTarget,x:number,z:number):void;
}
export interface Projectile extends CombatPoint { id: number; direction: CombatPoint; speed: number; remaining: number; radius: number; color: string; kind: string; multiplier: number; hit: Set<string>; pierce: boolean; stun: number; lift: number; explosion: number }
export interface CombatAlly extends CombatPoint {id:number;kind:'clone'|'turret'|'cannon'|'bat'|'snowman';life:number;cooldown:number;orbit:number}
export const BASE_SKILLS = [
  { name: 'Whirlwind', icon: '🌀', cd: 7, description: 'Spin for two seconds, striking nearby enemies repeatedly.' },
  { name: 'Dash', icon: '➶', cd: 4, description: 'Rush forward, striking every enemy along your path once.' },
  { name: 'Ground slam', icon: '💥', cd: 9, description: 'Leap and land with a shockwave that throws enemies into the air.' },
] as const;
export const SPECIALS: Record<string,{name:string;icon:string;cd:number}> = {
  fist:{name:'Punch flurry',icon:'👊',cd:6},crescent:{name:'Crescent slash',icon:'🌙',cd:6},gore:{name:'Tusk rush',icon:'🐗',cd:7},wave:{name:'Blade waves',icon:'🌊',cd:6},
  peastorm:{name:'Pea barrage',icon:'🟢',cd:8},bigbubble:{name:'Bubble prison',icon:'🫧',cd:10},nova:{name:'Thorn nova',icon:'🌵',cd:9},blizzard:{name:'Blizzard',icon:'❄️',cd:9},
  magma:{name:'Magma pillars',icon:'🌋',cd:8},thunder:{name:'Thunder chain',icon:'⚡',cd:9},bonk:{name:'Giant bonk',icon:'🔨',cd:7},tsunami:{name:'Tsunami',icon:'🌊',cd:9},
  whirl:{name:'Moon cyclone',icon:'🌪️',cd:8},starfall:{name:'Starfall',icon:'🌠',cd:9},inferno:{name:'Inferno ring',icon:'🔥',cd:9},laser:{name:'Rainbow laser',icon:'🌈',cd:8},
};
export function attackRange(weapon?: string|WeaponProfile, targetRadius=.8): number {
  if(typeof weapon==='object')return Math.max(.5,weapon.range??1)+(weapon.kind==='gun'?0:targetRadius);
  return weapon==='blaster'||weapon?.startsWith('gun_')?8:2.7;
}
export function distanceToSegment(point:CombatPoint,from:CombatPoint,to:CombatPoint) {
  const dx=to.x-from.x,dz=to.z-from.z,length=dx*dx+dz*dz;
  const fraction=length?Math.max(0,Math.min(1,((point.x-from.x)*dx+(point.z-from.z)*dz)/length)):0;
  return Math.hypot(point.x-from.x-dx*fraction,point.z-from.z-dz*fraction);
}
const direction=(angle:number)=>({x:Math.sin(angle),z:Math.cos(angle)});
const colorFor=(kind:string)=>kind.includes('ice')?'#a9eeff':kind.includes('fire')?'#ff985f':kind.includes('bubble')?'#b6eaff':kind.includes('spike')?'#cae482':kind.includes('star')?'#ffe689':'#c4ec9f';
type Scheduled={at:number;run:()=>void};

/** Independently authored fixed-step combat; every delayed effect follows game pause. */
export class CombatSimulation {
  readonly projectiles: Projectile[]=[];
  readonly allies:CombatAlly[]=[];
  readonly statuses: Record<string,number>={};
  readonly marked=new Map<string,number>();
  private host:CombatHost; private random:()=>number; private time=0; private serial=0; private combo=0;
  private giantStep=0;private lastStep:CombatPoint|null=null;private petCooldown=0;
  private jobs:Scheduled[]=[]; private action:{kind:'dash'|'slam';until:number;started:number;direction:CombatPoint;speed:number;multiplier:number;hit:Set<string>}|null=null;
  constructor(host:CombatHost,random:()=>number=Math.random){this.host=host;this.random=random;}
  get visualScale(){return this.statuses.giant>0?2:1;}
  get defenseBonus(){return this.statuses.giant>0?20:0;}
  get locksMovement(){return !!this.action;}
  /** Ground slam: a fast leap that snaps down onto the target when the shockwave lands at 0.42 s. */
  get airborne(){if(this.action?.kind!=='slam')return 0;const t=(this.time-this.action.started)/.42;return t<1?Math.sin(t*Math.PI*.85)*2.6:0;}
  /** The movement skill in progress and its elapsed time, for the explorer's pose. */
  get pose(){return this.action?{kind:this.action.kind,t:this.time-this.action.started}:null;}
  get invulnerable(){return this.action?.kind==='dash'||(this.statuses.shield??0)>0;}
  reset(){this.giantStep=0;this.lastStep=null;this.petCooldown=0;this.jobs=[];this.projectiles.length=0;this.allies.length=0;this.marked.clear();this.action=null;for(const key of Object.keys(this.statuses))delete this.statuses[key];}
  nearest(range=12){const p=this.host.position();return this.host.targets().filter(t=>t.hp>0&&Math.hypot(t.x-p.x,t.z-p.z)<=range+t.radius).sort((a,b)=>Math.hypot(a.x-p.x,a.z-p.z)-Math.hypot(b.x-p.x,b.z-p.z))[0];}
  aim(target?:CombatTarget){const p=this.host.position(),t=target??this.nearest();if(t)this.host.face(Math.atan2(t.x-p.x,t.z-p.z));return this.host.facing();}
  private emit(kind:CombatEffect['kind'],point:CombatPoint,radius:number,color='#e5f6ff',facing=this.host.facing()){this.host.effect({...point,kind,radius,color,facing});}
  private later(delay:number,run:()=>void){this.jobs.push({at:this.time+delay,run});}
  private damage(target:CombatTarget,multiplier:number,stun=0,lift=0,knock=0){
    if(target.hp<=0)return;const stats=this.host.stats(),p=this.host.position();
    const critical=this.random()<stats.critChance,angle=Math.atan2(target.x-p.x,target.z-p.z);
    const bonus=(this.statuses.giant>0?1.6:1)*(this.statuses.stealth>0?3:1)*(this.marked.has(target.id)?1.5:1);
    this.statuses.stealth=0;
    const amount=Math.max(1,Math.round(stats.attack*multiplier*bonus*(critical?(stats.critDamage??2):1)*(.9+this.random()*.2)));
    const applied=this.host.hit(target,{amount,critical,stun,lift,knock,direction:direction(angle)});
    const dealt=typeof applied==='number'?Math.max(0,Math.min(amount,applied)):amount;
    const lifesteal=(stats.lifesteal??0)+(this.statuses.lifesteal>0?.4:0);
    if(lifesteal>0&&dealt>0)this.host.heal?.(dealt*lifesteal/(stats.maxHp??100));
  }
  private area(point:CombatPoint,radius:number,multiplier:number,stun=0,lift=0,color='#e5f6ff',knock=1.2){
    this.emit('ring',point,radius,color);
    for(const target of this.host.targets())if(target.hp>0&&Math.hypot(target.x-point.x,target.z-point.z)<=radius+target.radius)this.damage(target,multiplier,stun,lift,knock);
  }
  private arc(radius:number,multiplier:number,threshold:number,target?:CombatTarget,knock=1.2){
    const p=this.host.position(),d=direction(this.host.facing());this.emit('arc',p,radius,this.host.weapon().fx??'#fff4c8');
    for(const enemy of this.host.targets()){
      const x=enemy.x-p.x,z=enemy.z-p.z,length=Math.hypot(x,z);
      if(enemy.hp>0&&length<=radius+enemy.radius&&(enemy===target||length===0||(x*d.x+z*d.z)/length>=threshold))this.damage(enemy,multiplier,.15,0,knock);
    }
  }
  shoot(kind:string,angle:number,multiplier=1,range=11,extras:Partial<Projectile>={}){
    const p=this.host.position(),d=direction(angle);
    this.projectiles.push({id:++this.serial,x:p.x+d.x*.6,z:p.z+d.z*.6,direction:d,speed:kind==='wave'?13:kind==='bigbubble'?7:19,remaining:range,radius:kind==='bigbubble'?.8:.22,color:colorFor(kind),kind,multiplier,hit:new Set(),pierce:kind==='wave',stun:kind==='ice'?1.5:0,lift:kind==='bigbubble'?3:0,explosion:kind==='fireball'?2:0,...extras});
  }
  basic(target?:CombatTarget){
    if(this.action)return false;const weapon=this.host.weapon();if(weapon.kind==='rod')return false;
    target??=this.nearest(attackRange(weapon));if(!target)return false;
    const p=this.host.position();if(Math.hypot(target.x-p.x,target.z-p.z)>attackRange(weapon,target.radius))return false;
    const angle=this.aim(target);
    if(weapon.kind==='gun'){
      const count=Math.max(1,weapon.spread??1);for(let i=0;i<count;i++)this.shoot(weapon.shot??'pea',angle+(count===1?0:(i/(count-1)-.5)*.6),count>1?.45:1,(weapon.range??8)+1);
    }else if(weapon.kind==='sword')this.arc(weapon.range??2,1.1,weapon.arc??.2,target);
    else{this.combo=(this.combo+1)%3;this.arc(1.6,this.combo===0?1.5:1,.5,target,this.combo===0?2.2:.8);}// the reference's punch knock: 0.8, 2.2 on the third
    return true;
  }
  private dash(multiplier=1.7,speed=30,duration=.24){
    this.action={kind:'dash',started:this.time,until:this.time+duration,direction:direction(this.aim()),speed,multiplier,hit:new Set()};
  }
  skill(index:number,special='fist'){
    if(this.action)return false;
    this.aim();
    if(index===0){for(let i=0;i<10;i++)this.later(i*.22,()=>this.area(this.host.position(),this.host.weapon().kind==='sword'?3.4:2.8,.55));}
    else if(index===1)this.dash();
    else if(index===2){this.action={kind:'slam',started:this.time,until:this.time+.8,direction:direction(this.host.facing()),speed:0,multiplier:0,hit:new Set()};this.later(.42,()=>this.area(this.host.position(),4.4,2.3,.8,2.5,'#ffd091'));}
    else return this.special(special);
    return true;
  }
  special(id:string){
    const p={...this.host.position()},angle=this.aim(),d=direction(angle);
    switch(id){
      case 'fist': for(let i=0;i<6;i++)this.later(i*.14,()=>{this.aim(this.nearest(2.6));this.arc(1.8,.8,.5);});break;
      case 'crescent':this.arc(3.8,2.4,-.05);break;
      case 'gore':this.dash(2,28,.36);break;
      case 'wave':case 'tsunami':{const angles=id==='wave'?[-.28,0,.28]:[-.5,-.25,0,.25,.5];for(const offset of angles)this.shoot('wave',angle+offset,id==='wave'?2:1.6,id==='wave'?12:13);break;}
      case 'peastorm':for(let i=0;i<14;i++)this.later(i*.07,()=>this.shoot('pea',angle+(this.random()-.5)*.9,.8,11));break;
      case 'bigbubble':this.shoot('bigbubble',angle,1.2,11,{stun:3});break;
      case 'nova':case 'blizzard':for(let i=0;i<24;i++)this.shoot(id==='nova'?'spike':'ice',i*Math.PI/12,id==='nova'?1.1:1,id==='nova'?8:9);break;
      case 'magma':for(let i=1;i<=5;i++)this.later(i*.09,()=>this.area({x:p.x+d.x*i*1.7,z:p.z+d.z*i*1.7},1.6,1.5,.5,1.8,'#ff9357'));break;
      case 'thunder':this.host.targets().filter(t=>t.hp>0&&Math.hypot(t.x-p.x,t.z-p.z)<10).sort((a,b)=>Math.hypot(a.x-p.x,a.z-p.z)-Math.hypot(b.x-p.x,b.z-p.z)).slice(0,6).forEach((target,i)=>this.later(i*.09,()=>{this.emit('impact',target,1,'#a6f8ff');this.damage(target,2.4,2);}));break;
      case 'bonk':this.area({x:p.x+d.x*1.6,z:p.z+d.z*1.6},3.6,2.2,3,2,'#ffe14d');break;
      case 'whirl':for(let i=0;i<3;i++)this.later(i*.22,()=>this.area(this.host.position(),4.4,1.4,.2,0,'#c9e8ff'));break;
      case 'starfall':{const target={...(this.nearest(13)??{x:p.x+d.x*6,z:p.z+d.z*6})};for(let i=0;i<12;i++){const a=this.random()*Math.PI*2,r=this.random()*3.6,point={x:target.x+Math.cos(a)*r,z:target.z+Math.sin(a)*r};this.later(i*.09,()=>this.emit('cast',point,1.6,'#ffe45c'));this.later(i*.09+.22,()=>this.area(point,1.6,1.1,.2,0,'#ffe45c'));}break;}
      case 'inferno':for(let i=0;i<10;i++)this.later(i*.05,()=>{const a=i*Math.PI/5;this.area({x:p.x+Math.cos(a)*3.6,z:p.z+Math.sin(a)*3.6},1.8,1.3,.2,1.2,'#ff874c');});break;
      case 'laser':{const end={x:p.x+d.x*14,z:p.z+d.z*14};this.emit('beam',p,14,'#bbfaff',angle);for(const t of this.host.targets())if(t.hp>0&&distanceToSegment(t,p,end)<t.radius+.7)this.damage(t,3,.4,0,2);break;}
      default:return false;
    }return true;
  }
  disguise(id:string,index:number){
    if(this.action)return false;
    const map:Record<string,string[]>={dz_superhero:['flight','dive','sweep','boulder'],dz_mage:['fireball','teleport','sheep','blackhole'],dz_knight:['shield','charge','taunt','holy'],dz_mecha:['tank','turret','missiles','energyshield'],dz_ninja:['clones','stealth','backstab','smoke'],dz_dino:['devour','tail','roar','giant'],dz_pirate:['cannon','hook','parrot','cannons'],dz_vampire:['drain','bats','batcircle','bloodnova'],dz_snowman:['snowball','decoy','icefloor','iceage'],dz_fairy:['heal','hover','charm','roots']};
    const effect=map[id]?.[index];if(!effect)return false;
    const p={...this.host.position()},angle=this.aim(),d=direction(angle);
    if(effect==='flight'){this.statuses.flight=this.statuses.flight>0?0:12;this.emit('ring',p,2,'#ffffff');}
    else if(effect==='hover'){this.statuses.flight=8;this.emit('ring',p,2,'#ffe1ff');}
    else if(effect==='dive'){const mult=this.statuses.flight>0?4:2;this.statuses.flight=0;this.host.move(d.x*4,d.z*4);this.later(.18,()=>this.area(this.host.position(),5,mult,1,3,'#b5cbff'));}
    else if(effect==='sweep'){
      const nextHit=new Map<string,number>();
      for(let step=0;step<=48;step++){const elapsed=step*.025,beamAngle=angle-.9+elapsed/1.2*1.8;this.later(elapsed,()=>{
        const origin=this.host.position(),forward=direction(beamAngle);
        this.host.effect({...origin,kind:'beam',radius:13,color:'#ff5656',facing:beamAngle,duration:.06});
        for(const target of this.host.targets()){
          const dx=target.x-origin.x,dz=target.z-origin.z,along=dx*forward.x+dz*forward.z,across=Math.abs(dx*forward.z-dz*forward.x);
          if(target.hp>0&&along>0&&along<13&&across<target.radius+.5&&elapsed>=(nextHit.get(target.id)??-Infinity)){nextHit.set(target.id,elapsed+.25);this.damage(target,1,0,0,.5);}
        }
      });}
    }
    else if(effect==='shield'||effect==='energyshield'){this.statuses.shield=4;if(effect==='energyshield')this.host.heal?.(.2);this.emit('ring',p,2.5,'#a1fbdf');}
    else if(effect==='heal'){for(let i=0;i<16;i++)this.later(i*.5,()=>{this.emit('ring',p,4,'#bbffb9');if(Math.hypot(this.host.position().x-p.x,this.host.position().z-p.z)<4)this.host.heal?.(.03);});}
    else if(effect==='stealth'||effect==='bats'){this.statuses.stealth=effect==='bats'?0:5;this.statuses.bats=effect==='bats'?2.5:0;if(effect==='bats')this.statuses.shield=2.5;this.emit('ring',p,2,'#c0ace8');}
    else if(effect==='teleport'){this.host.move(d.x*8,d.z*8);this.emit('impact',this.host.position(),2,'#c6adff');}
    else if(effect==='backstab'){const t=this.nearest(12);if(!t)return false;this.host.move(t.x-p.x-d.x*1.2,t.z-p.z-d.z*1.2);this.damage(t,3,1);this.emit('arc',t,2,'#f9f0ce');}
    else if(effect==='giant'){this.statuses.giant=10;this.giantStep=0;this.lastStep={...p};this.emit('ring',p,2.5,'#c96a3a');}
    else if(effect==='tank'){this.statuses.tank=6;for(let i=0;i<24;i++)this.later(i*.25,()=>this.area(this.host.position(),2,1,.3,1,'#8fa8ad'));}
    else if(effect==='charge')this.dash(3,25,.45);
    else if(effect==='tail')this.area(p,3.6,1.8,0,0,'#5fbf5a',6);
    else if(effect==='devour'){const t=this.nearest(3.2);if(!t)return false;if(!t.boss&&t.hp/(t.maxHp??t.hp)<.4){
      if(this.host.execute)this.host.execute(t,.25);
      else{this.host.hit(t,{amount:t.hp+1,critical:true,stun:0,lift:0,knock:0,direction:d});if(t.hp<=0)this.host.heal?.(.25);}
    }else this.damage(t,3,0,0,1);this.emit('arc',p,2.4,'#d4e79a');}
    else if(effect==='roar'||effect==='smoke'||effect==='taunt'||effect==='sheep'||effect==='charm'){
      const t=this.nearest(12),center=(effect==='sheep'||effect==='charm')?(t??p):p,radius=effect==='sheep'?3:effect==='charm'?1:effect==='roar'?9:effect==='taunt'?12:5;
      for(const e of this.host.targets())if(e.hp>0&&Math.hypot(e.x-center.x,e.z-center.z)<radius+e.radius)this.host.status?.(e,effect==='roar'?'fear':effect==='smoke'?'blind':effect==='taunt'?'taunt':effect==='sheep'?'sheep':'charm',effect==='charm'?8:effect==='sheep'||effect==='taunt'?6:4);
      if(effect==='taunt')this.statuses.armor=6;if(effect==='smoke')this.statuses.stealth=4;this.emit('ring',center,radius,'#ccbae8');
    }
    else if(effect==='roots'){this.area(p,6,1,4);for(let i=1;i<9;i++)this.later(i*.5,()=>{this.area(p,6,.3,.5,0,'#aad487');this.host.heal?.(.01);});}
    else if(effect==='drain'){const t=this.nearest(11);if(!t)return false;for(let i=0;i<7;i++)this.later(i*.35,()=>{if(t.hp>0){this.damage(t,.7);this.host.heal?.(.035);this.emit('beam',this.host.position(),Math.hypot(t.x-this.host.position().x,t.z-this.host.position().z),'#ea7a9c',Math.atan2(t.x-this.host.position().x,t.z-this.host.position().z));}});}
    else if(effect==='bloodnova'){this.statuses.lifesteal=6;const targets=this.host.targets().filter(t=>Math.hypot(t.x-p.x,t.z-p.z)<7);for(let i=0;i<12;i++)this.later(i*.5,()=>{for(const t of targets)this.damage(t,.3);this.emit('ring',p,7,'#cf6290');});}
    else if(effect==='fireball'||effect==='boulder'){this.emit('cast',p,2,effect==='fireball'?'#ffad6b':'#ad9d89');this.later(.8,()=>this.shoot(effect==='fireball'?'fireball':'boulder',angle,3,14,{radius:1,explosion:4,stun:2}));}
    else if(effect==='snowball'){this.shoot('snowball',angle,3,21,{radius:1.5,speed:9,pierce:true,stun:2});}
    else if(effect==='blackhole'){const target={...(this.nearest(12)??p)};for(let i=0;i<10;i++)this.later(i*.3,()=>{for(const t of this.host.targets())if(Math.hypot(t.x-target.x,t.z-target.z)<7)this.host.moveTarget?.(t,target.x+(t.x-target.x)*.65,target.z+(t.z-target.z)*.65);this.area(target,5,.4,1,0,'#9c8ee5');});this.later(3,()=>this.area(target,5,3,1,2,'#bc97ed'));}
    else if(effect==='holy'){const target={...(this.nearest(14)??p)};this.emit('cast',target,3,'#fff1b0');this.later(.8,()=>this.area(target,3.5,4,1,2.5,'#fff1b0'));}
    else if(effect==='clones'||effect==='turret'||effect==='cannon'||effect==='batcircle'){
      const count=effect==='clones'?2:effect==='batcircle'?5:1;
      for(let i=0;i<count;i++){const a=i/count*Math.PI*2;this.allies.push({id:++this.serial,kind:effect==='clones'?'clone':effect==='batcircle'?'bat':effect,x:p.x+Math.cos(a)*1.5,z:p.z+Math.sin(a)*1.5,life:effect==='turret'?12:effect==='cannon'?10:8,cooldown:i*.12,orbit:a});}
    }
    else if(effect==='hook'){const t=this.nearest(14);if(!t)return false;this.host.moveTarget?.(t,p.x+d.x*1.8,p.z+d.z*1.8);this.damage(t,1.5,2);this.emit('beam',p,Math.hypot(t.x-p.x,t.z-p.z),'#d6c19b',angle);}
    else if(effect==='parrot'){for(const t of this.host.targets().filter(t=>Math.hypot(t.x-p.x,t.z-p.z)<12)){this.marked.set(t.id,8);this.damage(t,.5);this.emit('impact',t,1,'#8ae394');}}
    else if(effect==='missiles'){const targets=this.host.targets().filter(t=>t.hp>0&&Math.hypot(t.x-p.x,t.z-p.z)<16).slice(0,6);targets.forEach((t,i)=>this.later(i*.15,()=>this.shoot('missile',Math.atan2(t.x-p.x,t.z-p.z),2,18,{explosion:2})));}
    else if(effect==='cannons'){const t={...(this.nearest(14)??p)};for(let i=0;i<12;i++){const a=this.random()*Math.PI*2,r=this.random()*4,point={x:t.x+Math.cos(a)*r,z:t.z+Math.sin(a)*r};this.later(i*.15,()=>this.emit('cast',point,2,'#dca66c'));this.later(i*.15+.5,()=>this.area(point,2,1.5,.5,1,'#dca66c'));}}
    else if(effect==='decoy'){const point={x:p.x+d.x*2.5,z:p.z+d.z*2.5};this.allies.push({id:++this.serial,kind:'snowman',...point,life:6,cooldown:99,orbit:0});for(const t of this.host.targets())if(Math.hypot(t.x-point.x,t.z-point.z)<8)this.host.status?.(t,'blind',6);this.later(6,()=>this.area(point,4,2.5,2,0,'#e4f9ff'));}
    else if(effect==='icefloor'){for(let i=0;i<16;i++)this.later(i*.5,()=>{this.emit('ring',p,6,'#c2f1ff');for(const t of this.host.targets())if(Math.hypot(t.x-p.x,t.z-p.z)<6)this.host.status?.(t,'slow',1);});}
    else if(effect==='iceage'){const targets=this.host.targets().filter(t=>Math.hypot(t.x-p.x,t.z-p.z)<8);for(const t of targets)this.host.status?.(t,'sheep',3);this.emit('ring',p,8,'#d0f7ff');this.later(3,()=>{for(const t of targets)this.damage(t,2.8,1);});}
    else return this.special(effect);
    return true;
  }
  update(dt:number,active=true){
    if(!active||!Number.isFinite(dt)||dt<=0)return;this.time+=dt;
    const position=this.host.position(),moved=this.host.moving?.()??(!!this.lastStep&&Math.hypot(position.x-this.lastStep.x,position.z-this.lastStep.z)>dt);
    if(this.statuses.giant>0){this.giantStep-=dt;if(moved&&this.giantStep<=0){this.giantStep=.45;this.area(position,2.5,.7,0,0,'#c96a3a',2);}}
    this.lastStep={...position};
    this.petCooldown=Math.max(0,this.petCooldown-dt);
    const pet=this.host.pet?.();
    if(pet&&Number.isFinite(pet.dmg)&&pet.dmg>0&&Number.isFinite(pet.cd)&&pet.cd>0&&this.petCooldown<=0){
      const target=this.host.targets().filter(e=>e.hp>0&&Math.hypot(e.x-position.x,e.z-position.z)<7+e.radius).sort((a,b)=>Math.hypot(a.x-position.x,a.z-position.z)-Math.hypot(b.x-position.x,b.z-position.z))[0];
      if(target){const angle=Math.atan2(target.x-pet.x,target.z-pet.z);this.shoot(pet.shot??'fire',angle,pet.dmg,9,{x:pet.x,z:pet.z});this.petCooldown=Math.max(.1,pet.cd);this.emit('cast',pet,.35,colorFor(pet.shot??'fire'),angle);}
    }
    for(const key of Object.keys(this.statuses))this.statuses[key]=Math.max(0,this.statuses[key]-dt);
    for(const[id,time]of this.marked){if(time<=dt)this.marked.delete(id);else this.marked.set(id,time-dt);}
    const due=this.jobs.filter(job=>job.at<=this.time);this.jobs=this.jobs.filter(job=>job.at>this.time);for(const job of due)job.run();
    if(this.action){const a=this.action;if(a.kind==='dash'){
      const from={...this.host.position()},remaining=Math.max(0,Math.min(dt,a.until-(this.time-dt)));this.host.move(a.direction.x*a.speed*remaining,a.direction.z*a.speed*remaining);
      const to=this.host.position();this.emit('trail',to,.7,'#e9fbff');
      for(const t of this.host.targets())if(t.hp>0&&!a.hit.has(t.id)&&distanceToSegment(t,from,to)<1.2+t.radius){a.hit.add(t.id);this.damage(t,a.multiplier,.3,0,3);}
    }if(this.time>=a.until)this.action=null;}
    for(let i=this.allies.length-1;i>=0;i--){const ally=this.allies[i];ally.life-=dt;ally.cooldown-=dt;if(ally.life<=0){this.allies.splice(i,1);continue;}if(ally.kind==='snowman')continue;
      const targets=this.host.targets().filter(t=>t.hp>0&&Math.hypot(t.x-ally.x,t.z-ally.z)<13).sort((a,b)=>Math.hypot(a.x-ally.x,a.z-ally.z)-Math.hypot(b.x-ally.x,b.z-ally.z)),target=targets[0];
      if(ally.kind==='bat'){const p=this.host.position();ally.x=p.x+Math.cos(this.time*3+ally.orbit)*2.2;ally.z=p.z+Math.sin(this.time*3+ally.orbit)*2.2;}
      if(!target)continue;
      const distance=Math.hypot(target.x-ally.x,target.z-ally.z),angle=Math.atan2(target.x-ally.x,target.z-ally.z);
      if(ally.kind==='clone'&&distance>1.3){const step=Math.min(distance-1.2,dt*8);ally.x+=Math.sin(angle)*step;ally.z+=Math.cos(angle)*step;}
      if(ally.cooldown>0)continue;
      if(ally.kind==='turret'||ally.kind==='cannon'){this.shoot(ally.kind==='turret'?'pea':'fireball',angle,ally.kind==='turret'?.65:1.2,14,{x:ally.x,z:ally.z,explosion:ally.kind==='cannon'?2:0});ally.cooldown=ally.kind==='turret'?.5:.8;this.emit('cast',ally,.6,'#d2b9ff');}
      else if(distance<target.radius+1.6){this.damage(target,ally.kind==='bat'?.35:.6,.1);ally.cooldown=.7;this.emit('arc',ally,1,'#c6b2ee',angle);if(ally.kind==='bat')this.host.heal?.(.01);}
    }
    for(let i=this.projectiles.length-1;i>=0;i--){const shot=this.projectiles[i],from={x:shot.x,z:shot.z},step=Math.min(shot.speed*dt,shot.remaining),to={x:shot.x+shot.direction.x*step,z:shot.z+shot.direction.z*step};
      if(this.host.clearShot&&!this.host.clearShot(from,to)){this.emit('impact',from,.4,shot.color);this.projectiles.splice(i,1);continue;}
      shot.x=to.x;shot.z=to.z;shot.remaining-=step;let consumed=false;
      const targets=this.host.targets().filter(t=>t.hp>0&&!shot.hit.has(t.id)&&distanceToSegment(t,from,to)<=t.radius+shot.radius).sort((a,b)=>Math.hypot(a.x-from.x,a.z-from.z)-Math.hypot(b.x-from.x,b.z-from.z));
      for(const target of targets){shot.hit.add(target.id);this.damage(target,shot.multiplier,shot.stun,shot.lift,1);this.emit('impact',target,shot.radius+.3,shot.color);if(shot.explosion)this.area(target,shot.explosion,shot.multiplier*.6,shot.stun,0,shot.color);if(!shot.pierce){consumed=true;break;}}
      if(consumed||shot.remaining<=0)this.projectiles.splice(i,1);
    }
  }
}
