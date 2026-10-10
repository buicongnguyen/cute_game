export interface CombatPoint { x: number; z: number }
export interface WeaponProfile { kind: 'fist'|'sword'|'gun'|'rod'; range?: number; cd?: number; arc?: number; special?: string; shot?: string; spread?: number; quality?: number; fx?: string }
export interface CombatTarget extends CombatPoint { id: string; hp: number; maxHp?:number; boss?:boolean; radius: number; stun?: number; facing?:number }
export interface CombatStats { attack: number; maxHp?:number; critChance: number; critDamage?: number; haste?: number; lifesteal?: number }
export interface CombatHit { amount: number; critical: boolean; stun: number; lift: number; knock: number; direction: CombatPoint; /** Dealt by the pet, not the explorer (timed challenges ignore it). */ helper?: boolean }
export interface CombatEffect extends CombatPoint { kind: 'arc'|'ring'|'impact'|'trail'|'beam'|'cast'|'toss'; color: string; radius: number; facing?: number; duration?: number; /** Arc width (rad) of a swing; beam width (m). */ arc?: number; width?: number;
  /** How the view dresses it (skill-fx.ts): 'eyes' twin eye lasers, 'burn' a laser scorch, 'shock' an electric burst. Same hit either way. */
  look?: EffectLook;
  /** A repeat tick of a cast whose look is already drawn (the whirlwind's 10 hits): hits as usual, draws nothing more. */
  quiet?: boolean }
export const DISGUISE_LOOKS=['charge','smoke','heal','icefield','blackhole','moon','holy','meteor','cannonfall','hook','drain','hearts','roots','roar','freeze','portal','bite','tail','parrot','shield','rush','bolt','rainbow','bats','iceage','crater','lift','blast','magma','inferno','anchor','lotus','eagle','goldstar','bonk','whirl','surf','poof','sheep','taunt','dust',
  // The six uniform kits (DISGUISE_KITS): a toy soldier, a sailor, the ao dai lady and gentleman, the stars-and-stripes and red-flag heroes.
  'tank','sandbag','flare','parachute','whistle','ribbon','fan','lantern','kite','ink','dragondance','starshield','torch','firework','bamboo','drum','bigstar'] as const;
export type EffectLook='eyes'|'burn'|'shock'|'boulder'|typeof DISGUISE_LOOKS[number];
export const EFFECT_LOOKS:readonly EffectLook[]=['eyes','burn','shock','boulder',...DISGUISE_LOOKS];
/** Superhero throw: lock a landing point, then lob over intervening ground obstacles. */
export const BOULDER={range:14,fallback:8,time:.6,arc:4,height:3,radius:4.5,power:3.2,lift:7} as const;
/** The laser gaze (dz_superhero slot 2): one sweep of `arc` rad in `time` s, a `length` m line `width` m wide; a creature is hit again after `rehit` s. */
export const GAZE={length:13,width:1,arc:1.8,time:1.2,step:.025,rehit:.25} as const;
/** Shots that crackle with electricity and burst with a shock: the battle robot's bolts, its turret and missiles, the robot pet. */
export const ELECTRIC_SHOTS:ReadonlySet<string>=new Set(['volt','missile']);
export const ELECTRIC_COLOR='#8fdcff';
/**
 * Each disguise's four skills, slot 1-4 (Q, W, E, R), as the effect ids CombatSimulation.disguise runs.
 * The ten disguises the reference (Zoo Pet) also has keep its kits: the same skill, order, cooldown (content.ts),
 * range, damage factor, duration and effect (facts with bundle offsets: docs of the clone, facts-combat.md §2b).
 * The six uniforms have kits of their own in the same shape: slot 1 a basic special, slot 2 mobility or defence,
 * slot 3 control or support, slot 4 the big one.
 */
export const DISGUISE_KITS:Readonly<Record<string,readonly string[]>>={
  dz_superhero:['flight','dive','sweep','boulder'],dz_ninja:['clones','stealth','backstab','smoke'],dz_mage:['fireball','teleport','sheep','blackhole'],
  dz_knight:['block','knightcharge','taunt','holy'],dz_mecha:['tank','turret','missiles','energyshield'],dz_dino:['devour','tail','roar','giant'],
  dz_fairy:['heal','hover','charm','tree'],dz_pirate:['cannon','hook','parrot','broadside'],dz_vampire:['drain','bats','batcircle','bloodnova'],
  dz_snowman:['snowball','decoy','icefloor','iceage'],
  dz_army:['popgun','sandbag','flare','airdrop'],dz_navy:['anchor','surfride','whistle','lighthouse'],dz_aodai:['lotus','ribbon','fan','lanterns'],
  dz_aodai_man:['dragon','kite','ink','dragondance'],dz_usa:['eagle','starshield','torch','fireworks'],dz_vietnam:['goldstar','bamboo','drum','bigstar'],
};
/** Disguise skill numbers: metres, seconds, damage factors (× attack). skill-info.ts builds the tooltips from this same table. */
export const DZ={
  flight:{time:12,speed:.35},dive:{ahead:4,radius:5,power:2,flying:4,lift:2.2,delay:.18,guard:.5},
  clones:{count:4,life:8,power:.5,cd:.45,reach:1.4,ring:1.6},stealth:{time:5,speed:.3,bonus:3},backstab:{range:12,power:3.2},smoke:{radius:5,time:5,blind:1.2,tick:.5},
  fireball:{charge:.8,range:14,fallback:9,flight:.35,radius:5,power:3.5,lift:1.25},teleport:{distance:8,guard:.4},sheep:{range:12,around:3,count:3,time:6},
  blackhole:{range:12,fallback:6,pull:8,time:3,tick:.25,radius:5,power:3,lift:1.5},
  block:{time:4,reflect:1.5,speed:16},knightcharge:{speed:22,time:.5,grab:2,radius:3,power:2.5,knock:4,lift:1.5},taunt:{radius:12,time:6,defence:80},holy:{range:14,fallback:6,delay:.6,radius:3.5,power:4.5,lift:1.25},
  tank:{time:6,speed:.8,defence:30,reach:1.6,power:1.6,rehit:.6,knock:5,lift:1},turret:{life:12,power:.55,cd:.35,range:11},missiles:{count:6,range:15,radius:2,power:1.4},energyshield:{time:4,heal:.2},
  devour:{reach:3.2,below:.4,heal:.25,power:3},tail:{radius:3.6,power:1.8,knock:6},roar:{radius:9,time:4},giant:{time:10,defence:20,step:.45,radius:2.5,power:.7,knock:2},
  heal:{radius:4,time:8,tick:.5,perTick:.03},hover:{time:8,speed:.25},charm:{range:12,time:8},tree:{ahead:3,life:6,root:4,radius:5,power:.8,cd:1},
  cannon:{life:10,power:1.4,cd:1.3,range:12},hook:{range:14,power:1.2,slow:2,gap:1.5},parrot:{life:8,power:.4,cd:.6,reach:1.4,speed:7,mark:8},
  broadside:{range:15,fallback:7,count:12,spacing:.13,spread:5,delay:.5,radius:1.8,power:1.4},
  // The reference's 2026-10-07 balance patch: drain heals 30% (was 80%), a bat bite 0.15% of max HP (was 1%), blood moon steals 12% (was 40%).
  drain:{range:11,ticks:8,tick:.35,power:.7,heal:.3},bats:{time:2.5,speed:1},batcircle:{count:5,life:8,power:.35,heal:.0015},bloodnova:{radius:7,time:6,tick:.5,power:.3,lifesteal:.12},
  snowball:{time:2.4,speed:9,grow:.9,slow:3},decoy:{ahead:2.5,life:6,lure:8,radius:4,power:2.5,freeze:2},icefloor:{radius:6,time:8,speed:.5},iceage:{radius:8,freeze:3,power:2.8},
  // The uniforms
  popgun:{count:5,spread:.4,power:1.2,range:12},sandbag:{time:6,radius:2.6,defence:60,power:.5,knock:4},flare:{range:12,fallback:6,delay:.5,radius:5,blind:4,mark:6},
  airdrop:{range:14,fallback:7,count:5,ring:2.6,fall:1.2,spacing:.2,radius:2.2,power:2,heal:.15},
  surfride:{speed:26,time:.35,power:1.4},whistle:{radius:8,stun:2.5},lighthouse:{life:6,turn:Math.PI,reach:12,width:.3,power:1.2,blind:1.5,rehit:.6},
  ribbon:{speed:24,time:.35,boost:.3,boostTime:3},fan:{radius:7,cone:.64,power:1.2,knock:5,slow:3},lanterns:{count:8,ring:4,rise:1,spacing:.18,radius:2.4,power:1.6,heal:.02},
  kite:{time:5,speed:.3},ink:{radius:5,stun:3,power:.8},dragondance:{time:5,tick:.5,radius:4.2,power:.7},
  starshield:{time:3,radius:3,power:1,knock:4},torch:{time:6,bonus:.3,heal:.1,radius:6,blind:2},fireworks:{count:10,range:14,fallback:7,spacing:.15,rise:.6,radius:2.2,power:1.5},
  bamboo:{speed:16,time:.5,radius:3,power:1.4,knock:2},drum:{beats:3,gap:.35,radius:7,power:.6,knock:2.5,stun:1.5},bigstar:{range:14,fallback:6,delay:.7,radius:5,power:4,lift:1.25,slow:3},
} as const;
/**
 * Summons creatures can fight: hit points as a fraction of the explorer's max health, body radius (m), and whether it
 * is a decoy. A creature within DECOY.lure m of a decoy (the ninja's clones, the snow decoy) goes for it before any
 * explorer; the other summons are attacked when they are a creature's nearest target. A blow, a shot or an area that
 * reaches a summon hurts the summon, not you; at 0 hit points it pops, as when its time runs out.
 */
export const SUMMON_HP:Readonly<Record<string,{hp:number;r:number;taunt?:boolean}>>={
  clone:{hp:.25,r:.45,taunt:true},snowman:{hp:.6,r:.7,taunt:true},tree:{hp:.8,r:.8},cannon:{hp:.5,r:.7},turret:{hp:.45,r:.6},sandbag:{hp:.9,r:.5},
};
/** Stolen life (weapon life steal, blood moon, life drain, bat bites) heals at most this share of max HP per second, all sources together. */
export const LIFESTEAL_CAP_PER_SECOND=.06;
/** Online each explorer shares at most `max` hittable summons (server-checked): clones stay within `range` m of their explorer; `lure` is the decoys' pull. */
export const DECOY={max:4,range:6,lure:8} as const;
/** A hittable summon as creatures see it (CombatSimulation.decoys, the online pose). `ring`: the sandbag wall's radius round x/z. */
export interface DecoyPose{id:number;kind:string;x:number;z:number;r:number;hp:number;maxHp:number;taunt:boolean;life:number;ring?:number}
/** Longest life of each hittable summon (s), for the server's checks. */
const SUMMON_LIFE:Record<string,number>={clone:8,snowman:6,tree:6,cannon:10,turret:12,sandbag:6};
/**
 * The summons an explorer's pose may share with the room (server.mjs): only live hittable ones, at most DECOY.max
 * (decoys first, then the nearest), a clone no farther than DECOY.range m from its explorer, a fixed summon where it
 * was set (it never moves), nothing past its kind's lifetime, every number finite and clamped.
 */
export function shareableDecoys(list:readonly Partial<DecoyPose>[],at:CombatPoint):DecoyPose[]{
  const ok=list.filter(d=>d&&typeof d.kind==='string'&&SUMMON_HP[d.kind]&&Number.isInteger(d.id)&&[d.x,d.z,d.hp,d.maxHp,d.life].every(Number.isFinite)&&d.hp!>0&&d.maxHp!>0&&d.life!>0&&d.life!<=SUMMON_LIFE[d.kind]+.5&&(d.kind!=='clone'||Math.hypot(d.x!-at.x,d.z!-at.z)<=DECOY.range))
    .map(d=>{const s=SUMMON_HP[d.kind!];return {id:d.id!,kind:d.kind!,x:Math.round(d.x!*100)/100,z:Math.round(d.z!*100)/100,r:s.r,hp:Math.round(Math.min(d.hp!,d.maxHp!)),maxHp:Math.round(d.maxHp!),taunt:!!s.taunt,life:Math.round(d.life!*10)/10,...(d.kind==='sandbag'?{ring:DZ.sandbag.radius}:{})};});
  return ok.sort((a,b)=>Number(b.taunt)-Number(a.taunt)||Math.hypot(a.x-at.x,a.z-at.z)-Math.hypot(b.x-at.x,b.z-at.z)).slice(0,DECOY.max);
}
/** Where a creature at `from` strikes a summon: its centre, or for the sandbag ring the nearest point of the wall. */
export function decoyPoint(d:{x:number;z:number;ring?:number},from:CombatPoint):CombatPoint{
  if(!d.ring)return {x:d.x,z:d.z};const dx=from.x-d.x,dz=from.z-d.z,l=Math.hypot(dx,dz);
  return l<1e-6?{x:d.x+d.ring,z:d.z}:{x:d.x+dx/l*d.ring,z:d.z+dz/l*d.ring};
}
/** Kit skills that are the uniform weapon specials (special()). */
const SPECIAL_SKILLS=new Set(['anchor','lotus','dragon','eagle','goldstar']);
import { skillTuning } from './skill-upgrades.ts';
import { dogTarget, DOG_TOSS_FLIGHT, DOG_TOSS_RANGE } from './guard-dog.ts';
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
  /** The guard dog when it may fight (following you away from home, guard-dog.ts): where it is, its toss factor and rate, and your target. */
  dog?():{x:number;z:number;dmg:number;cd:number;target?:string|null}|null;
  /** 'stun' freezes or roots a creature in place (no damage). */
  status?(target:CombatTarget,kind:'fear'|'charm'|'slow'|'blind'|'sheep'|'taunt'|'stun',duration:number):void;
  moveTarget?(target:CombatTarget,x:number,z:number):void;
  /** Upgrade level of base skill slot 0-3 (skill-upgrades.ts); missing = 0. */
  skillLevel?(index:number):number;
}
export interface Projectile extends CombatPoint { id: number; direction: CombatPoint; speed: number; remaining: number; radius: number; color: string; kind: string; multiplier: number; hit: Set<string>; pierce: boolean; stun: number; lift: number; explosion: number; homing?:string; initialRadius?:number; helper?: boolean; /** Fired by a summon (turret, cannon): it never heals the explorer. */ summoned?: boolean;
  /** Bursts in an area of this radius where it lands (first creature, or the end of its flight) instead of a direct hit. */
  burst?:number; burstLift?:number;
  /** Seconds a creature it touches is slowed. */
  slow?:number }
export interface CombatAlly extends CombatPoint {id:number;kind:'clone'|'turret'|'cannon'|'bat'|'snowman'|'parrot'|'tree'|'lighthouse'|'sandbag';life:number;cooldown:number;orbit:number;facing?:number;
  /** Hittable summons (SUMMON_HP): hit points left and at full; `hurt` counts down a short flash after a blow; `ring` is the sandbag wall's radius. */
  hp?:number;maxHp?:number;hurt?:number;ring?:number}
export const BASE_SKILLS = [
  { name: 'Petal Gale', icon: '🌸', cd: 7, description: 'Spin for two seconds, striking nearby enemies repeatedly.' },
  { name: 'Breeze Step', icon: '🍃', cd: 4, description: 'Rush forward, striking every enemy along your path once.' },
  { name: 'Root Quake', icon: '🪨', cd: 9, description: 'Leap and land with a shockwave that throws enemies into the air.' },
] as const;
export const SPECIALS: Record<string,{name:string;icon:string;cd:number}> = {
  volley:{name:'Cork barrage',icon:'🍾',cd:7},anchor:{name:'Anchor swing',icon:'⚓',cd:8},lotus:{name:'Lotus petals',icon:'🪷',cd:9},dragon:{name:'Dragon fan',icon:'🐉',cd:8},eagle:{name:'Eagle strike',icon:'🦅',cd:8},goldstar:{name:'Golden star burst',icon:'⭐',cd:9},
  fist:{name:'Paw Storm',icon:'🐾',cd:6},crescent:{name:'Crescent slash',icon:'🌙',cd:6},gore:{name:'Tusk rush',icon:'🐗',cd:7},wave:{name:'Blade waves',icon:'🌊',cd:6},
  peastorm:{name:'Pea barrage',icon:'🟢',cd:8},bigbubble:{name:'Bubble prison',icon:'🫧',cd:10},nova:{name:'Thorn nova',icon:'🌵',cd:9},blizzard:{name:'Blizzard',icon:'❄️',cd:9},
  magma:{name:'Magma pillars',icon:'🌋',cd:8},thunder:{name:'Thunder chain',icon:'⚡',cd:9},bonk:{name:'Giant bonk',icon:'🔨',cd:7},tsunami:{name:'Wave fan',icon:'🌊',cd:9},
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
const colorFor=(kind:string)=>ELECTRIC_SHOTS.has(kind)?ELECTRIC_COLOR:kind.includes('ice')?'#a9eeff':kind.includes('fire')||kind==='rocket'?'#ff985f':kind.includes('bubble')?'#b6eaff':kind.includes('spike')?'#cae482':kind.includes('star')?'#ffe689':kind==='cork'?'#e8c08a':'#c4ec9f';
type Scheduled={at:number;run:()=>void};

/** Independently authored fixed-step combat; every delayed effect follows game pause. */
export class CombatSimulation {
  readonly projectiles: Projectile[]=[];
  readonly allies:CombatAlly[]=[];
  readonly statuses: Record<string,number>={};
  readonly marked=new Map<string,number>();
  private host:CombatHost; private random:()=>number; private time=0; private serial=0; private combo=0;
  /** Damage factor of the levelled skill being cast; delayed hits keep the factor they were cast with. */
  private power=1;private giantStep=0;private lastStep:CombatPoint|null=null;private petCooldown=0;private dogCooldown=0;
  private jobs:Scheduled[]=[]; private action:{kind:'dash'|'slam';until:number;started:number;direction:CombatPoint;speed:number;multiplier:number;hit:Set<string>;
    /** Knight's charge: carry creatures along instead of hitting them on the way. */ push?:boolean; then?:()=>void}|null=null;
  /** Speed bonus (fraction) while statuses.swift runs; where the sandbag wall stands; next time each creature may be rammed or swept again. */
  private swift=0;private coverAt:CombatPoint|null=null;private rehits=new Map<string,number>();
  constructor(host:CombatHost,random:()=>number=Math.random){this.host=host;this.random=random;}
  get visualScale(){return this.statuses.giant>0?2:1;}
  /** Extra defence from skills: giant form, tank mode, and the sandbag wall while you stand behind it (+80 'armor' is added by the hosts). */
  get defenseBonus(){
    // The wall gives cover until its time or its hit points run out (ended() clears coverAt).
    const p=this.host.position(),cover=(this.statuses.cover??0)>0&&!!this.coverAt&&Math.hypot(p.x-this.coverAt.x,p.z-this.coverAt.z)<=DZ.sandbag.radius;
    return (this.statuses.giant>0?DZ.giant.defence:0)+((this.statuses.tank??0)>0?DZ.tank.defence:0)+(cover?DZ.sandbag.defence:0);
  }
  /** Extra move speed (fraction): flight, vanish, tank mode, bat form, the ice rink, ribbon glide, kite. */
  get speedBonus(){return (this.statuses.swift??0)>0?this.swift:0;}
  /** The knight's raised shield stops every blow from a creature in front of the explorer. */
  blocks(from:CombatPoint){if(!((this.statuses.block??0)>0))return false;const p=this.host.position(),d=direction(this.host.facing());return (from.x-p.x)*d.x+(from.z-p.z)*d.z>0;}
  /**
   * The raised shield also turns a creature's shot that strikes it from in front back at the shooter: the shot flies
   * home at DZ.block.speed m/s (`delay`, the hosts pass the flight time) and hits it for ×DZ.block.reflect. False when
   * the shield is down or the shot came from behind (then it hurts as usual).
   */
  reflect(shooter:CombatTarget,delay=0){
    if(!this.blocks(shooter))return false;const p=this.host.position();
    this.emit('impact',{x:p.x+Math.sin(this.host.facing())*.6,z:p.z+Math.cos(this.host.facing())*.6},.9,'#fff3c4',this.host.facing(),'shield');
    this.later(Math.max(0,Math.min(3,delay)),()=>{if(shooter.hp<=0)return;this.damage(shooter,DZ.block.reflect,.2,0,1.5);this.emit('impact',shooter,.8,'#fff3c4',this.host.facing(),'blast');});
    return true;
  }
  /** Serial of summons only (not shots), so the server's copy of a summon has the same id as the browser's. */
  private allySerial=0;
  /** Adds a summon; a hittable kind (SUMMON_HP) gets its hit points from the explorer's max health. */
  private summon(ally:Omit<CombatAlly,'id'>){const s=SUMMON_HP[ally.kind],maxHp=s?Math.max(1,Math.round((this.host.stats().maxHp??100)*s.hp)):undefined;const made:CombatAlly={...ally,id:++this.allySerial,...(maxHp?{hp:maxHp,maxHp}:{}),...(s&&ally.kind==='sandbag'?{ring:DZ.sandbag.radius}:{})};this.allies.push(made);return made;}
  /** The live hittable summons, as creatures see them. */
  decoys():DecoyPose[]{const out:DecoyPose[]=[];for(const a of this.allies){const s=SUMMON_HP[a.kind];if(s&&(a.hp??0)>0)out.push({id:a.id,kind:a.kind,x:a.x,z:a.z,r:s.r,hp:a.hp!,maxHp:a.maxHp!,taunt:!!s.taunt,life:a.life,...(a.ring?{ring:a.ring}:{})});}return out;}
  /** A creature's blow, shot or area reached summon `id`: it loses `amount` hit points and pops at 0. True when it was hit. */
  hurtAlly(id:number,amount:number){
    const ally=this.allies.find(a=>a.id===id);if(!ally||!((ally.hp??0)>0)||!Number.isFinite(amount)||amount<=0)return false;
    ally.hp=Math.max(0,ally.hp!-amount);ally.hurt=.25;this.emit('impact',{x:ally.x,z:ally.z},.5,'#ffffff');if(ally.hp<=0)this.pop(ally);return true;
  }
  /** Online the server owns summon health: its count arrives here (0 pops it). */
  setAllyHp(id:number,hp:number){const ally=this.allies.find(a=>a.id===id);if(!ally||ally.hp===undefined||!Number.isFinite(hp))return;if(hp<ally.hp)ally.hurt=.25;ally.hp=Math.max(0,Math.min(ally.maxHp??hp,hp));if(ally.hp<=0)this.pop(ally);}
  private pop(ally:CombatAlly){const i=this.allies.indexOf(ally);if(i<0)return;this.allies.splice(i,1);this.ended(ally);}
  /** A summon is gone (destroyed or its time ran out): clones vanish in a puff, the snow decoy bursts and freezes, a wall falls. */
  private ended(ally:CombatAlly){
    const at={x:ally.x,z:ally.z},K=DZ;
    if(ally.kind==='clone')this.visual('poof',at,1.2,.6,'#b9a6e8');
    else if(ally.kind==='snowman'){this.area(at,K.decoy.radius,K.decoy.power,0,0,'#e4f9ff',2,'iceage');for(const t of this.within(at,K.decoy.radius))this.host.status?.(t,'stun',K.decoy.freeze);}
    else if(ally.kind==='sandbag'){this.statuses.cover=0;this.coverAt=null;this.visual('dust',at,ally.ring??2.6,.8,'#d8c59a');}
    else if(ally.kind==='tree'||ally.kind==='cannon'||ally.kind==='turret')this.visual('dust',at,1.4,.7,'#d8c59a');
  }
  private haste(amount:number,time:number){this.swift=(this.statuses.swift??0)>0?Math.max(this.swift,amount):amount;this.statuses.swift=Math.max(this.statuses.swift??0,time);}
  get locksMovement(){return !!this.action;}
  /** Ground slam: a fast leap that snaps down onto the target when the shockwave lands at 0.42 s. */
  get airborne(){if(this.action?.kind!=='slam')return 0;const t=(this.time-this.action.started)/.42;return t<1?Math.sin(t*Math.PI*.85)*2.6:0;}
  /** The movement skill in progress and its elapsed time, for the explorer's pose. */
  get pose(){return this.action?{kind:this.action.kind,t:this.time-this.action.started}:null;}
  get invulnerable(){return this.action?.kind==='dash'||(this.statuses.shield??0)>0||(this.statuses.invuln??0)>0;}
  reset(){this.leechAt=-Infinity;this.leechGot=0;this.summonHit=false;this.allySerial=0;this.swift=0;this.coverAt=null;this.rehits.clear();this.giantStep=0;this.lastStep=null;this.petCooldown=0;this.dogCooldown=0;this.jobs=[];this.projectiles.length=0;this.allies.length=0;this.marked.clear();this.action=null;for(const key of Object.keys(this.statuses))delete this.statuses[key];}
  nearest(range=12){const p=this.host.position();return this.host.targets().filter(t=>t.hp>0&&Math.hypot(t.x-p.x,t.z-p.z)<=range+t.radius).sort((a,b)=>Math.hypot(a.x-p.x,a.z-p.z)-Math.hypot(b.x-p.x,b.z-p.z))[0];}
  aim(target?:CombatTarget){const p=this.host.position(),t=target??this.nearest();if(t)this.host.face(Math.atan2(t.x-p.x,t.z-p.z));return this.host.facing();}
  private emit(kind:CombatEffect['kind'],point:CombatPoint,radius:number,color='#e5f6ff',facing=this.host.facing(),look?:EffectLook,quiet=false){this.host.effect({x:point.x,z:point.z,kind,radius,color,facing,...(look?{look}:{}),...(quiet?{quiet:true}:{})});}
  private visual(look:EffectLook,point:CombatPoint,radius:number,duration:number,color='#cfb5f5',facing=this.host.facing()){this.host.effect({...point,kind:'cast',look,radius,duration,color,facing});}
  private later(delay:number,run:()=>void){const power=this.power;this.jobs.push({at:this.time+delay,run:power===1?run:()=>{const old=this.power;this.power=power;try{run();}finally{this.power=old;}}});}
  /** Set while a pet projectile deals its damage. */
  private helperShot=false;
  /** Set while a summon (clone, bat, parrot, tree, lighthouse, turret, cannon) deals damage: pets and summons never heal their owner. */
  private summonHit=false;
  /** Life stolen in the current one-second window (HP); see LIFESTEAL_CAP_PER_SECOND. */
  private leechAt=-Infinity;private leechGot=0;
  /** Heals `amount` HP of stolen life, at most LIFESTEAL_CAP_PER_SECOND of max HP per second over every source; returns the HP healed. */
  private leech(amount:number){const max=this.host.stats().maxHp??100;if(!(amount>0)||!(max>0))return 0;if(this.time-this.leechAt>=1){this.leechAt=this.time;this.leechGot=0;}
    const healed=Math.max(0,Math.min(amount,max*LIFESTEAL_CAP_PER_SECOND-this.leechGot));if(healed<=0)return 0;this.leechGot+=healed;this.host.heal?.(healed/max);return healed;}
  /** One hit; returns the damage dealt. `shown` marks it critical on screen without doubling it (the ninja's strike). */
  private damage(target:CombatTarget,multiplier:number,stun=0,lift=0,knock=0,shown=false){
    if(target.hp<=0)return 0;const stats=this.host.stats(),p=this.host.position();
    const critical=this.random()<stats.critChance,angle=Math.atan2(target.x-p.x,target.z-p.z);
    const bonus=(this.statuses.giant>0?1.6:1)*(this.statuses.stealth>0?DZ.stealth.bonus:1)*(this.marked.has(target.id)?1.5:1)*((this.statuses.rally??0)>0?1+DZ.torch.bonus:1);
    this.statuses.stealth=0;
    const amount=Math.max(1,Math.round(stats.attack*multiplier*this.power*bonus*(critical?(stats.critDamage??2):1)*(.9+this.random()*.2)));
    const applied=this.host.hit(target,{amount,critical:critical||shown,stun,lift,knock,direction:direction(angle),...(this.helperShot?{helper:true}:{})});
    const dealt=typeof applied==='number'?Math.max(0,Math.min(amount,applied)):amount;
    const lifesteal=(stats.lifesteal??0)+(this.statuses.lifesteal>0?DZ.bloodnova.lifesteal:0);
    if(lifesteal>0&&dealt>0&&!this.helperShot&&!this.summonHit)this.leech(dealt*lifesteal);
    return dealt;
  }
  private within(point:CombatPoint,radius:number){return this.host.targets().filter(t=>t.hp>0&&Math.hypot(t.x-point.x,t.z-point.z)<=radius+t.radius);}
  private area(point:CombatPoint,radius:number,multiplier:number,stun=0,lift=0,color='#e5f6ff',knock=1.2,look?:EffectLook,quiet=false){
    this.emit('ring',point,radius,color,this.host.facing(),look,quiet);
    for(const target of this.within(point,radius))this.damage(target,multiplier,stun,lift,knock);
  }
  /** The nearest creature's spot within `range`, else `fallback` m straight ahead. */
  private spot(range:number,fallback:number,d:CombatPoint){const t=this.nearest(range),p=this.host.position();return t?{x:t.x,z:t.z}:{x:p.x+d.x*fallback,z:p.z+d.z*fallback};}
  private burst(shot:Projectile,point:CombatPoint){this.emit('impact',point,.7,shot.color,this.host.facing(),ELECTRIC_SHOTS.has(shot.kind)?'shock':'blast');this.area(point,shot.burst!,shot.multiplier,shot.stun,shot.burstLift??0,shot.color,1.5,ELECTRIC_SHOTS.has(shot.kind)?'shock':'blast');}
  private arc(radius:number,multiplier:number,threshold:number,target?:CombatTarget,knock=1.2){
    const p=this.host.position(),d=direction(this.host.facing());this.host.effect({...p,kind:'arc',radius,color:this.host.weapon().fx??'#fff4c8',facing:this.host.facing(),arc:2*Math.acos(Math.max(-1,Math.min(1,threshold)))});
    for(const enemy of this.host.targets()){
      const x=enemy.x-p.x,z=enemy.z-p.z,length=Math.hypot(x,z);
      if(enemy.hp>0&&length<=radius+enemy.radius&&(enemy===target||length===0||(x*d.x+z*d.z)/length>=threshold))this.damage(enemy,multiplier,.15,0,knock);
    }
  }
  shoot(kind:string,angle:number,multiplier=1,range=11,extras:Partial<Projectile>={}){
    const p=this.host.position(),d=direction(angle);
    this.projectiles.push({id:++this.serial,x:p.x+d.x*.6,z:p.z+d.z*.6,direction:d,speed:kind==='wave'||kind==='dragon'?13:kind==='bigbubble'?7:19,remaining:range,radius:kind==='bigbubble'?.8:.22,color:colorFor(kind),kind,multiplier:multiplier*this.power,hit:new Set(),pierce:kind==='wave'||kind==='dragon',stun:kind==='ice'?1.5:0,lift:kind==='bigbubble'?3:0,explosion:kind==='fireball'?2:0,...extras});
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
  /** Rush forward `speed`×`duration` m, untouchable; multiplier 0 passes through without hitting, `push` carries creatures along. */
  private dash(multiplier=1.7,speed=30,duration=.24,extra:{push?:boolean;then?:()=>void}={}){
    const aimed=this.aim();this.action={kind:'dash',started:this.time,until:this.time+duration,direction:direction(aimed),speed,multiplier:multiplier*this.power,hit:new Set(),...extra};this.visual('rush',this.host.position(),2,duration,'#e9fbff',aimed);
  }
  skill(index:number,special='fist'){
    if(this.action)return false;
    this.aim();
    const tuning=skillTuning(index,this.host.skillLevel?.(index)??0);this.power=tuning.damage;
    try{
      if(index===0){const radius=(this.host.weapon().kind==='sword'?3.4:2.8)+tuning.radius;this.host.effect({...this.host.position(),kind:'cast',look:'whirl',radius,color:'#e5f6ff',duration:2.2});for(let i=0;i<10;i++)this.later(i*.22,()=>this.area(this.host.position(),radius,.55,0,0,'#e5f6ff',1.2,undefined,true));}
      else if(index===1)this.dash();
      else if(index===2){this.action={kind:'slam',started:this.time,until:this.time+.8,direction:direction(this.host.facing()),speed:0,multiplier:0,hit:new Set()};this.host.effect({...this.host.position(),kind:'cast',radius:4.4+tuning.radius,color:'#ffd091',duration:.45});this.later(.42,()=>this.area(this.host.position(),4.4+tuning.radius,2.3,.8,2.5,'#ffd091',1.2,'crater'));}
      else return this.special(special);
      return true;
    }finally{this.power=1;}
  }
  special(id:string){
    const p={...this.host.position()},angle=this.aim(),d=direction(angle);
    switch(id){
      // Uniform skills (uniform-skills.ts): toy versions that fit each outfit, drawn and voiced like the disguise kits
      case 'volley':this.visual('poof',{x:p.x+d.x*.9,z:p.z+d.z*.9},.9,.6,'#f3e2bd');for(let i=0;i<10;i++)this.later(i*.06,()=>{this.shoot('cork',angle+(this.random()-.5)*.14,.7,15);if(i%3===2)this.visual('poof',{x:this.host.position().x+d.x*.9,z:this.host.position().z+d.z*.9},.5,.3,'#f3e2bd');});break;
      case 'anchor':this.visual('anchor',p,4.4,.7,'#9fd6ff',angle);this.later(.15,()=>this.area(p,4.4,2,.4,3,'#9fd6ff'));break;
      case 'lotus':for(let i=0;i<12;i++)this.shoot('lotus',i*Math.PI/6,.8,8);this.host.heal?.(.08);this.visual('lotus',p,3,1.4,'#ffb3cf');break;
      case 'dragon':for(const offset of [-.45,-.3,-.15,0,.15,.3,.45])this.shoot('dragon',angle+offset,1.3,12);break;
      case 'eagle':this.dash(2.4,30,.3);this.later(.3,()=>{this.emit('ring',this.host.position(),3,'#ffffff');this.area(this.host.position(),3,1.8,.5,2,'#ffffff',1.2,'eagle');});break;
      case 'goldstar':for(let i=0;i<5;i++)this.shoot('star',angle+i*Math.PI*2/5,1.4,11,{pierce:true});this.later(.1,()=>this.area(p,2.6,1.2,.3,1.5,'#ffe34d',1.2,'goldstar'));break;
      case 'fist': for(let i=0;i<6;i++)this.later(i*.14,()=>{this.aim(this.nearest(2.6));this.arc(1.8,.8,.5);});break;
      case 'crescent':this.arc(3.8,2.4,-.05);break;
      case 'gore':this.dash(2,28,.36);break;
      case 'wave':case 'tsunami':{const angles=id==='wave'?[-.28,0,.28]:[-.5,-.25,0,.25,.5];this.visual('surf',p,id==='wave'?10:13,.9,'#7fd0ff',angle);for(const offset of angles)this.shoot('wave',angle+offset,id==='wave'?2:1.6,id==='wave'?12:13);break;}
      case 'peastorm':for(let i=0;i<14;i++)this.later(i*.07,()=>this.shoot('pea',angle+(this.random()-.5)*.9,.8,11));break;
      case 'bigbubble':this.shoot('bigbubble',angle,1.2,11,{stun:3});break;
      case 'nova':case 'blizzard':for(let i=0;i<24;i++)this.shoot(id==='nova'?'thornburst':'ice',i*Math.PI/12,id==='nova'?1.1:1,id==='nova'?8:9);break;
      case 'magma':for(let i=1;i<=5;i++)this.later(i*.09,()=>this.area({x:p.x+d.x*i*1.7,z:p.z+d.z*i*1.7},1.6,1.5,.5,1.8,'#ff9357',1.2,'magma'));break;
      case 'thunder':this.host.targets().filter(t=>t.hp>0&&Math.hypot(t.x-p.x,t.z-p.z)<10).sort((a,b)=>Math.hypot(a.x-p.x,a.z-p.z)-Math.hypot(b.x-p.x,b.z-p.z)).slice(0,6).forEach((target,i,list)=>this.later(i*.09,()=>{const from=i?list[i-1]:this.host.position();this.host.effect({x:from.x,z:from.z,kind:'beam',radius:Math.hypot(target.x-from.x,target.z-from.z),color:'#a6f8ff',facing:Math.atan2(target.x-from.x,target.z-from.z),duration:.3,width:.35,look:'bolt'});this.emit('impact',target,1,'#a6f8ff');this.damage(target,2.4,2);}));break;
      case 'bonk':this.area({x:p.x+d.x*1.6,z:p.z+d.z*1.6},3.6,2.2,3,2,'#ffe14d',1.2,'bonk');break;
      case 'whirl':for(let i=0;i<3;i++)this.later(i*.22,()=>this.area(this.host.position(),4.4,1.4,.2,0,'#c9e8ff',1.2,'whirl'));break;
      case 'starfall':{const target={...(this.nearest(13)??{x:p.x+d.x*6,z:p.z+d.z*6})};for(let i=0;i<12;i++){const a=this.random()*Math.PI*2,r=this.random()*3.6,point={x:target.x+Math.cos(a)*r,z:target.z+Math.sin(a)*r};this.later(i*.09,()=>this.visual('meteor',point,1.6,.22,'#ffe45c'));this.later(i*.09+.22,()=>this.area(point,1.6,1.1,.2,0,'#ffe45c',1.2,'blast'));}break;}
      case 'inferno':for(let i=0;i<10;i++)this.later(i*.05,()=>{const a=i*Math.PI/5;this.area({x:p.x+Math.cos(a)*3.6,z:p.z+Math.sin(a)*3.6},1.8,1.3,.2,1.2,'#ff874c',1.2,'inferno');});break;
      case 'laser':{const end={x:p.x+d.x*14,z:p.z+d.z*14};this.host.effect({...p,kind:'beam',radius:14,color:'#bbfaff',facing:angle,duration:.5,width:1.4,look:'rainbow'});for(const t of this.host.targets())if(t.hp>0&&distanceToSegment(t,p,end)<t.radius+.7)this.damage(t,3,.4,0,2);break;}
      default:return false;
    }return true;
  }
  disguise(id:string,index:number){
    if(this.action)return false;
    const effect=DISGUISE_KITS[id]?.[index];if(!effect)return false;
    if(SPECIAL_SKILLS.has(effect))return this.special(effect);
    const p={...this.host.position()},angle=this.aim(),d=direction(angle),K=DZ;
    switch(effect){
      // ---- Superhero
      case 'flight':if(this.statuses.flight>0){this.statuses.flight=0;this.statuses.swift=0;}else{this.statuses.flight=K.flight.time;this.haste(K.flight.speed,K.flight.time);}this.visual('lift',p,2.5,.9,'#ffffff');break;
      case 'dive':{const mult=this.statuses.flight>0?K.dive.flying:K.dive.power;this.statuses.flight=0;this.statuses.invuln=Math.max(this.statuses.invuln??0,K.dive.guard);this.host.move(d.x*K.dive.ahead,d.z*K.dive.ahead);this.later(K.dive.delay,()=>this.area(this.host.position(),K.dive.radius,mult,0,K.dive.lift,'#b5cbff',1.5,'crater'));break;}
      case 'sweep':{
        // Laser gaze: twin eye beams sweep the front. Each step the line drawn (look 'eyes', skill-fx.ts) and the line hit
        // are the same: from the explorer along `beamAngle`, GAZE.length long and GAZE.width wide; a hit leaves a scorch ('burn').
        const nextHit=new Map<string,number>(),steps=Math.round(GAZE.time/GAZE.step);
        for(let step=0;step<=steps;step++){const elapsed=step*GAZE.step,beamAngle=angle-GAZE.arc/2+elapsed/GAZE.time*GAZE.arc;this.later(elapsed,()=>{
          const at=this.host.position(),origin={x:at.x,z:at.z},forward=direction(beamAngle);
          this.host.effect({...origin,kind:'beam',radius:GAZE.length,color:'#ff3b30',facing:beamAngle,duration:GAZE.step*3,width:GAZE.width,look:'eyes'});
          for(const target of this.host.targets()){
            const dx=target.x-origin.x,dz=target.z-origin.z,along=dx*forward.x+dz*forward.z,across=Math.abs(dx*forward.z-dz*forward.x);
            if(target.hp>0&&along>0&&along<GAZE.length&&across<target.radius+GAZE.width/2&&elapsed>=(nextHit.get(target.id)??-Infinity)){
              nextHit.set(target.id,elapsed+GAZE.rehit);this.damage(target,1,0,0,.5);
              this.emit('impact',{x:origin.x+forward.x*along,z:origin.z+forward.z*along},.6,'#ff6a3a',beamAngle,'burn');
            }
          }
        });}
        break;}
      case 'boulder':{
        const landing=this.spot(BOULDER.range,BOULDER.fallback,d);
        this.host.effect({...p,kind:'cast',look:'boulder',radius:Math.hypot(landing.x-p.x,landing.z-p.z),facing:Math.atan2(landing.x-p.x,landing.z-p.z),duration:BOULDER.time,color:'#c96a3a'});
        this.later(BOULDER.time,()=>this.area(landing,BOULDER.radius,BOULDER.power,0,BOULDER.lift,'#c96a3a',1.2,'boulder'));break;}
      // ---- Shadow ninja
      case 'clones':{
        // Four clones in a ring round you (a new cast replaces the old ones). They fight (×0.5 a hit), stay within
        // DECOY.range m of you, and draw the attacks of creatures near them (SUMMON_HP) until their hit points run out.
        for(const old of this.allies.filter(a=>a.kind==='clone'))this.pop(old);
        for(let i=0;i<K.clones.count;i++){const a=angle+Math.PI/4+i*Math.PI*2/K.clones.count,x=p.x+Math.sin(a)*K.clones.ring,z=p.z+Math.cos(a)*K.clones.ring;this.summon({kind:'clone',x,z,life:K.clones.life,cooldown:i*.1,orbit:a,facing:angle});this.visual('poof',{x:x-Math.sin(a)*.35,z:z-Math.cos(a)*.35},.45,.3,'#b9a6e8');}
        break;}
      case 'stealth':this.statuses.stealth=K.stealth.time;this.haste(K.stealth.speed,K.stealth.time);this.visual('poof',p,2,.7,'#c0ace8');break;
      case 'backstab':{const t=this.nearest(K.backstab.range);if(!t)return false;const behind=direction(t.facing??angle),gap=t.radius+.8;this.visual('portal',p,1,.35);this.host.move(t.x-p.x-behind.x*gap,t.z-p.z-behind.z*gap);this.aim(t);this.visual('portal',this.host.position(),1,.35);this.damage(t,K.backstab.power,0,0,1,true);this.emit('arc',t,2.5,'#c9c9ff');break;}
      case 'smoke':this.visual('smoke',p,K.smoke.radius,K.smoke.time);for(let i=0;i<K.smoke.time/K.smoke.tick;i++)this.later(i*K.smoke.tick,()=>{for(const t of this.within(p,K.smoke.radius))this.host.status?.(t,'blind',K.smoke.blind);const at=this.host.position();if(Math.hypot(at.x-p.x,at.z-p.z)<K.smoke.radius)this.statuses.stealth=Math.max(this.statuses.stealth??0,.6);});break;
      // ---- Archmage
      case 'fireball':this.visual('charge',p,1,K.fireball.charge,'#ffad6b');this.later(K.fireball.charge,()=>{
        const from=this.host.position(),t=this.nearest(K.fireball.range),to=t?{x:t.x,z:t.z}:{x:from.x+d.x*K.fireball.fallback,z:from.z+d.z*K.fireball.fallback},gap=Math.max(.5,Math.hypot(to.x-from.x,to.z-from.z));
        this.shoot('fireball',Math.atan2(to.x-from.x,to.z-from.z),K.fireball.power,gap,{x:from.x,z:from.z,radius:.6,speed:Math.max(12,gap/K.fireball.flight),burst:K.fireball.radius,burstLift:K.fireball.lift,...(t?{homing:t.id}:{})});});break;
      case 'teleport':this.visual('portal',p,1,.45);this.host.move(d.x*K.teleport.distance,d.z*K.teleport.distance);this.statuses.invuln=Math.max(this.statuses.invuln??0,K.teleport.guard);this.visual('portal',this.host.position(),1,.45);break;
      case 'sheep':{const t=this.nearest(K.sheep.range);if(!t)return false;const others=this.within(t,K.sheep.around).filter(e=>e!==t).sort((a,b)=>Math.hypot(a.x-t.x,a.z-t.z)-Math.hypot(b.x-t.x,b.z-t.z)).slice(0,K.sheep.count-1);
        for(const e of [t,...others])this.host.status?.(e,'sheep',K.sheep.time);this.visual('sheep',t,K.sheep.around,1,'#ccbae8');break;}
      case 'blackhole':{const c=this.spot(K.blackhole.range,K.blackhole.fallback,d);this.visual('blackhole',c,K.blackhole.pull,K.blackhole.time,'#9c8ee5');
        for(let i=0;i<K.blackhole.time/K.blackhole.tick;i++)this.later(i*K.blackhole.tick,()=>{for(const t of this.within(c,K.blackhole.pull))this.host.moveTarget?.(t,c.x+(t.x-c.x)*.7,c.z+(t.z-c.z)*.7);});
        this.later(K.blackhole.time,()=>this.area(c,K.blackhole.radius,K.blackhole.power,0,K.blackhole.lift,'#bc97ed',1.5,'blast'));break;}
      // ---- Sun knight
      case 'block':this.statuses.block=K.block.time;this.visual('shield',p,2.3,K.block.time,'#fff3c4');break;
      case 'knightcharge':this.dash(0,K.knightcharge.speed,K.knightcharge.time,{push:true,then:()=>{
        const at=this.host.position(),front={x:at.x+d.x*1.5,z:at.z+d.z*1.5},carried=this.action?.hit??new Set<string>();this.visual('crater',front,K.knightcharge.radius,.6,'#fff3c4');
        for(const t of this.host.targets())if(carried.has(t.id))this.damage(t,K.knightcharge.power,0,K.knightcharge.lift,K.knightcharge.knock);}});break;
      case 'taunt':for(const e of this.within(p,K.taunt.radius))this.host.status?.(e,'taunt',K.taunt.time);this.statuses.armor=K.taunt.time;this.visual('taunt',p,K.taunt.radius,1,'#ff6a4a');break;
      case 'holy':{const c=this.spot(K.holy.range,K.holy.fallback,d);this.visual('holy',c,K.holy.radius,K.holy.delay,'#fff1b0');this.later(K.holy.delay,()=>this.area(c,K.holy.radius,K.holy.power,0,K.holy.lift,'#fff1b0',1.5));break;}
      // ---- Battle robot
      case 'tank':this.statuses.tank=K.tank.time;this.haste(K.tank.speed,K.tank.time);this.visual('tank',p,1.2,K.tank.time,ELECTRIC_COLOR,angle);this.emit('ring',p,K.tank.reach,ELECTRIC_COLOR,angle,'shock');break;
      case 'turret':this.summon({kind:'turret',x:p.x+d.x*1.5,z:p.z+d.z*1.5,life:K.turret.life,cooldown:0,orbit:0,facing:angle});this.visual('dust',{x:p.x+d.x*1.5,z:p.z+d.z*1.5},2.2,.8,'#d8c59a');break;
      case 'missiles':{const list=this.host.targets().filter(t=>t.hp>0&&Math.hypot(t.x-p.x,t.z-p.z)<K.missiles.range+t.radius).sort((a,b)=>Math.hypot(a.x-p.x,a.z-p.z)-Math.hypot(b.x-p.x,b.z-p.z)).slice(0,K.missiles.count);
        for(let i=0;i<K.missiles.count;i++){const t=list[i%Math.max(1,list.length)],aim=t?Math.atan2(t.x-p.x,t.z-p.z):angle,fan=(i/(K.missiles.count-1)-.5)*1.2;
          this.shoot('missile',aim+fan,K.missiles.power,t?K.missiles.range+4:3,{burst:K.missiles.radius,...(t?{homing:t.id}:{})});}break;}
      case 'energyshield':this.statuses.shield=K.energyshield.time;this.host.heal?.(K.energyshield.heal);this.visual('shield',p,2.3,K.energyshield.time,'#6fe8ff');break;
      // ---- Tyrannosaur
      case 'devour':{const t=this.nearest(K.devour.reach);if(!t)return false;if(!t.boss&&t.hp/(t.maxHp??t.hp)<K.devour.below){
        if(this.host.execute)this.host.execute(t,K.devour.heal);
        else{this.host.hit(t,{amount:t.hp+1,critical:true,stun:0,lift:0,knock:0,direction:d});if(t.hp<=0)this.host.heal?.(K.devour.heal);}
      }else this.damage(t,K.devour.power,0,0,1);this.visual('bite',p,2.4,.4,'#d4e79a');break;}
      case 'tail':this.visual('tail',p,K.tail.radius,.4,'#5fbf5a');this.area(p,K.tail.radius,K.tail.power,0,0,'#5fbf5a',K.tail.knock);break;
      case 'roar':for(const e of this.within(p,K.roar.radius))this.host.status?.(e,'fear',K.roar.time);this.visual('roar',p,K.roar.radius,.8,'#79c487');break;
      case 'giant':this.statuses.giant=K.giant.time;this.giantStep=0;this.lastStep={...p};this.visual('crater',p,3.2,.8,'#c96a3a');break;
      // ---- Flower fairy
      case 'heal':this.visual('heal',p,K.heal.radius,K.heal.time,'#bbffb9');for(let i=0;i<K.heal.time/K.heal.tick;i++)this.later(i*K.heal.tick,()=>{if(Math.hypot(this.host.position().x-p.x,this.host.position().z-p.z)<K.heal.radius)this.host.heal?.(K.heal.perTick);});break;
      case 'hover':this.statuses.flight=K.hover.time;this.haste(K.hover.speed,K.hover.time);this.visual('lift',p,2.5,.9,'#ffe1ff');break;
      case 'charm':{const t=this.nearest(K.charm.range);if(!t)return false;this.host.status?.(t,'charm',K.charm.time);this.visual('hearts',t,1,2,'#ff80bd');break;}
      case 'tree':{const at={x:p.x+d.x*K.tree.ahead,z:p.z+d.z*K.tree.ahead};this.summon({kind:'tree',...at,life:K.tree.life,cooldown:K.tree.cd,orbit:0,facing:angle});
        for(const t of this.within(at,K.tree.radius))this.host.status?.(t,'stun',K.tree.root);this.visual('roots',at,K.tree.radius,K.tree.root,'#aad487');break;}
      // ---- Pirate captain
      case 'cannon':this.summon({kind:'cannon',x:p.x+d.x*1.5,z:p.z+d.z*1.5,life:K.cannon.life,cooldown:0,orbit:0,facing:angle});this.visual('dust',{x:p.x+d.x*1.5,z:p.z+d.z*1.5},2.2,.8,'#d8c59a');break;
      case 'hook':{const t=this.nearest(K.hook.range);if(!t)return false;this.visual('hook',p,Math.hypot(t.x-p.x,t.z-p.z),.25,'#d6c19b',angle);this.later(.25,()=>{if(t.hp<=0)return;this.host.moveTarget?.(t,p.x+d.x*K.hook.gap,p.z+d.z*K.hook.gap);this.damage(t,K.hook.power);this.host.status?.(t,'slow',K.hook.slow);});break;}
      case 'parrot':this.summon({kind:'parrot',x:p.x,z:p.z,life:K.parrot.life,cooldown:0,orbit:0,facing:angle});this.visual('poof',p,1.4,.6,'#8ae394');break;
      case 'broadside':{const c=this.spot(K.broadside.range,K.broadside.fallback,d);for(let i=0;i<K.broadside.count;i++){const a=this.random()*Math.PI*2,r=this.random()*K.broadside.spread,point={x:c.x+Math.cos(a)*r,z:c.z+Math.sin(a)*r};
        this.later(i*K.broadside.spacing,()=>this.visual('cannonfall',point,K.broadside.radius,K.broadside.delay,'#dca66c'));this.later(i*K.broadside.spacing+K.broadside.delay,()=>this.area(point,K.broadside.radius,K.broadside.power,0,0,'#ff8a3d',2,'blast'));}break;}
      // ---- Vampire count
      case 'drain':{const t=this.nearest(K.drain.range);if(!t)return false;for(let i=0;i<K.drain.ticks;i++)this.later(i*K.drain.tick,()=>{if(t.hp<=0)return;const at=this.host.position(),dealt=this.damage(t,K.drain.power);this.leech(dealt*K.drain.heal);this.visual('drain',at,Math.hypot(t.x-at.x,t.z-at.z),K.drain.tick,'#ea7a9c',Math.atan2(t.x-at.x,t.z-at.z));});break;}
      case 'bats':this.statuses.bats=K.bats.time;this.statuses.invuln=Math.max(this.statuses.invuln??0,K.bats.time);this.haste(K.bats.speed,K.bats.time);this.visual('bats',p,2,K.bats.time,'#6a3d9a');break;
      case 'batcircle':for(let i=0;i<K.batcircle.count;i++){const a=i/K.batcircle.count*Math.PI*2;this.summon({kind:'bat',x:p.x+Math.cos(a)*2.2,z:p.z+Math.sin(a)*2.2,life:K.batcircle.life,cooldown:i*.12,orbit:a});}this.visual('dust',p,2.6,.8,'#b9a6e8');break;
      case 'bloodnova':{this.visual('moon',p,K.bloodnova.radius,K.bloodnova.time,'#cf6290');this.statuses.lifesteal=K.bloodnova.time;const targets=this.within(p,K.bloodnova.radius);for(let i=0;i<K.bloodnova.time/K.bloodnova.tick;i++)this.later(i*K.bloodnova.tick,()=>{for(const t of targets)this.damage(t,K.bloodnova.power);});break;}
      // ---- Snowman
      case 'snowball':this.shoot('snowball',angle,1,K.snowball.speed*K.snowball.time,{radius:.5,initialRadius:.5,speed:K.snowball.speed,pierce:true,stun:0,slow:K.snowball.slow});break;
      case 'decoy':{
        // A snowman decoy: creatures within DECOY.lure m go for it instead of you (SUMMON_HP); when its hit points or
        // its time run out it bursts for ×2.5 and freezes everything round it (ended()).
        for(const old of this.allies.filter(a=>a.kind==='snowman'))this.pop(old);
        const point={x:p.x+d.x*K.decoy.ahead,z:p.z+d.z*K.decoy.ahead};this.summon({kind:'snowman',...point,life:K.decoy.life,cooldown:99,orbit:0,facing:angle});
        this.visual('poof',point,1.4,.6,'#e4f9ff');this.visual('taunt',point,DECOY.lure,1,'#9fe6ff');break;}
      case 'icefloor':this.visual('icefield',p,K.icefloor.radius,K.icefloor.time,'#c2f1ff');for(let i=0;i<K.icefloor.time*2;i++)this.later(i*.5,()=>{for(const t of this.within(p,K.icefloor.radius))this.host.status?.(t,'slow',1);const at=this.host.position();if(Math.hypot(at.x-p.x,at.z-p.z)<K.icefloor.radius)this.haste(K.icefloor.speed,.6);});break;
      case 'iceage':{const targets=this.within(p,K.iceage.radius);for(const t of targets){this.host.status?.(t,'stun',K.iceage.freeze);this.visual('freeze',t,Math.max(.6,t.radius),K.iceage.freeze,'#d0f7ff');}
        this.visual('iceage',p,K.iceage.radius,2.2,'#d0f7ff');this.later(K.iceage.freeze,()=>{for(const t of targets)this.damage(t,K.iceage.power,0,0,1);});break;}
      // ---- Army soldier (toy-box drill: cork popgun, sandbags, a signal flare, parachute supply crates)
      case 'popgun':for(let i=0;i<K.popgun.count;i++)this.shoot('cork',angle+(i/(K.popgun.count-1)-.5)*K.popgun.spread,K.popgun.power,K.popgun.range);this.visual('poof',{x:p.x+d.x*.9,z:p.z+d.z*.9},.8,.4,'#f3e2bd');break;
      case 'sandbag':for(const old of this.allies.filter(a=>a.kind==='sandbag'))this.pop(old);this.statuses.cover=K.sandbag.time;this.coverAt={...p};this.summon({kind:'sandbag',x:p.x,z:p.z,life:K.sandbag.time,cooldown:99,orbit:0,facing:angle});this.visual('dust',p,K.sandbag.radius,.8,'#d8c59a');for(const t of this.within(p,K.sandbag.radius))this.damage(t,K.sandbag.power,0,0,K.sandbag.knock);break;
      case 'flare':{const c=this.spot(K.flare.range,K.flare.fallback,d);this.visual('flare',c,K.flare.radius,K.flare.delay+.9,'#ff6a3a');this.later(K.flare.delay,()=>{for(const t of this.within(c,K.flare.radius)){this.host.status?.(t,'blind',K.flare.blind);this.marked.set(t.id,K.flare.mark);this.emit('impact',t,1,'#ffb03a');}});break;}
      case 'airdrop':{const c=this.spot(K.airdrop.range,K.airdrop.fallback,d);for(let i=0;i<K.airdrop.count;i++){const a=i*Math.PI/2+angle,point=i?{x:c.x+Math.sin(a)*K.airdrop.ring,z:c.z+Math.cos(a)*K.airdrop.ring}:c;
        this.later(i*K.airdrop.spacing,()=>this.visual('parachute',point,K.airdrop.radius,K.airdrop.fall,'#f0ece0'));this.later(i*K.airdrop.spacing+K.airdrop.fall,()=>this.area(point,K.airdrop.radius,K.airdrop.power,0,.5,'#e8c27a',1.5,'dust'));}
        this.later(K.airdrop.fall,()=>this.host.heal?.(K.airdrop.heal));break;}
      // ---- Navy sailor (anchor, a wave ride, the bosun's whistle, a lighthouse)
      case 'surfride':this.visual('surf',p,K.surfride.speed*K.surfride.time,.6,'#7fd0ff',angle);this.dash(K.surfride.power,K.surfride.speed,K.surfride.time);break;
      case 'whistle':this.visual('whistle',p,K.whistle.radius,1,'#ffffff');for(const t of this.within(p,K.whistle.radius))this.host.status?.(t,'stun',K.whistle.stun);break;
      case 'lighthouse':{const at={x:p.x+Math.cos(angle)*1.6,z:p.z-Math.sin(angle)*1.6};this.summon({kind:'lighthouse',...at,life:K.lighthouse.life,cooldown:0,orbit:0,facing:angle});this.visual('dust',at,1.6,.8,'#d8e8f5');break;}
      // ---- Ao dai lady (lotus, silk ribbon, paper fan, lanterns)
      case 'ribbon':this.visual('ribbon',p,2,1.2,'#ff8fb1',angle);this.dash(0,K.ribbon.speed,K.ribbon.time);this.haste(K.ribbon.boost,K.ribbon.boostTime);break;
      case 'fan':this.visual('fan',p,K.fan.radius,.7,'#ffb3cf',angle);for(const t of this.within(p,K.fan.radius)){const x=t.x-p.x,z=t.z-p.z,l=Math.hypot(x,z);if(l===0||(x*d.x+z*d.z)/l>=K.fan.cone){this.damage(t,K.fan.power,0,0,K.fan.knock);this.host.status?.(t,'slow',K.fan.slow);}}break;
      case 'lanterns':for(let i=0;i<K.lanterns.count;i++){const a=i/K.lanterns.count*Math.PI*2+angle,point={x:p.x+Math.sin(a)*K.lanterns.ring,z:p.z+Math.cos(a)*K.lanterns.ring},at=K.lanterns.rise+i*K.lanterns.spacing;
        this.host.effect({...point,kind:'cast',look:'lantern',radius:K.lanterns.radius,duration:at,color:'#ff5a4a',facing:a});
        this.later(at,()=>{this.area(point,K.lanterns.radius,K.lanterns.power,0,0,'#ffc35a',1.2);this.host.heal?.(K.lanterns.heal);});}break;
      // ---- Ao dai gentleman (dragon fan, a kite, an ink-brush circle, a dragon dance)
      case 'kite':this.statuses.flight=K.kite.time;this.haste(K.kite.speed,K.kite.time);this.visual('kite',p,2,K.kite.time,'#ffd84a',angle);break;
      case 'ink':this.visual('ink',p,K.ink.radius,K.ink.stun,'#20242c');for(const t of this.within(p,K.ink.radius)){this.damage(t,K.ink.power);this.host.status?.(t,'stun',K.ink.stun);}break;
      case 'dragondance':this.visual('dragondance',p,K.dragondance.radius,K.dragondance.time,'#e8352b');for(let i=0;i<K.dragondance.time/K.dragondance.tick;i++)this.later(i*K.dragondance.tick+K.dragondance.tick/2,()=>this.area(this.host.position(),K.dragondance.radius,K.dragondance.power,0,0,'#ffd84a',1.5));break;
      // ---- Stars and stripes (eagle, star shield, liberty torch, fireworks)
      case 'starshield':this.statuses.shield=K.starshield.time;this.visual('starshield',p,1.6,K.starshield.time,'#3c5bd6',angle);for(const t of this.within(p,K.starshield.radius))this.damage(t,K.starshield.power,0,0,K.starshield.knock);break;
      case 'torch':this.statuses.rally=K.torch.time;this.host.heal?.(K.torch.heal);this.visual('torch',p,K.torch.radius,K.torch.time,'#ffb02e');for(const t of this.within(p,K.torch.radius))this.host.status?.(t,'blind',K.torch.blind);break;
      case 'fireworks':{const list=this.host.targets().filter(t=>t.hp>0&&Math.hypot(t.x-p.x,t.z-p.z)<K.fireworks.range+t.radius),colors=['#ff4d5a','#ffffff','#4d7dff'];
        for(let i=0;i<K.fireworks.count;i++){const t=list[i%Math.max(1,list.length)],a=this.random()*Math.PI*2,r=this.random()*1.2,base=t?{x:t.x,z:t.z}:{x:p.x+d.x*K.fireworks.fallback,z:p.z+d.z*K.fireworks.fallback},point={x:base.x+Math.cos(a)*r,z:base.z+Math.sin(a)*r},color=colors[i%3];
          this.later(i*K.fireworks.spacing,()=>this.visual('firework',point,K.fireworks.radius,K.fireworks.rise+.5,color));this.later(i*K.fireworks.spacing+K.fireworks.rise,()=>this.area(point,K.fireworks.radius,K.fireworks.power,0,.4,color,1.5));}break;}
      // ---- Vietnam red flag (golden star, bamboo vault, bronze drum, the great golden star)
      case 'bamboo':this.visual('bamboo',p,K.bamboo.speed*K.bamboo.time,K.bamboo.time+.2,'#8fd45a',angle);this.dash(0,K.bamboo.speed,K.bamboo.time,{then:()=>this.area(this.host.position(),K.bamboo.radius,K.bamboo.power,0,.4,'#8fd45a',K.bamboo.knock,'dust')});break;
      case 'drum':this.visual('drum',p,K.drum.radius,K.drum.gap*K.drum.beats+.4,'#e0a040');for(let b=0;b<K.drum.beats;b++)this.later(b*K.drum.gap,()=>this.area(p,K.drum.radius,K.drum.power,b===K.drum.beats-1?K.drum.stun:0,0,'#f2c14e',K.drum.knock));break;
      case 'bigstar':{const c=this.spot(K.bigstar.range,K.bigstar.fallback,d);this.visual('bigstar',c,K.bigstar.radius,K.bigstar.delay+.5,'#ffe34d');this.later(K.bigstar.delay,()=>{this.area(c,K.bigstar.radius,K.bigstar.power,0,K.bigstar.lift,'#ffe34d',1.5,'goldstar');for(const t of this.within(c,K.bigstar.radius))this.host.status?.(t,'slow',K.bigstar.slow);});break;}
      default:return false;
    }
    return true;
  }
  /**
   * The guard dog's toy toss (guard-dog.ts): a 'toss' effect from the dog (radius = distance, facing = direction) for the
   * bone's arc, then the hit when it lands DOG_TOSS_FLIGHT later, if the creature is still alive and near.
   */
  private dogToss(dt:number){
    this.dogCooldown=Math.max(0,this.dogCooldown-dt);const dog=this.host.dog?.();
    if(!dog||!(dog.dmg>0)||!(dog.cd>0)||!Number.isFinite(dog.x)||!Number.isFinite(dog.z)||this.dogCooldown>0)return;
    const target=dogTarget(dog,this.host.targets(),dog.target);if(!target)return;
    const from={x:dog.x,z:dog.z},dmg=dog.dmg;this.dogCooldown=dog.cd;
    this.emit('toss',from,Math.hypot(target.x-from.x,target.z-from.z),'#fff1d6',Math.atan2(target.x-from.x,target.z-from.z));
    this.later(DOG_TOSS_FLIGHT,()=>{if(target.hp<=0||Math.hypot(target.x-from.x,target.z-from.z)>DOG_TOSS_RANGE+3+target.radius)return;this.helperShot=true;this.damage(target,dmg,0,0,.4);this.helperShot=false;/* the puppy's kill is not the player's for timed challenges */this.emit('impact',target,.45,'#fff1d6');});
  }
  update(dt:number,active=true){
    if(!active||!Number.isFinite(dt)||dt<=0)return;this.time+=dt;
    const position=this.host.position(),moved=this.host.moving?.()??(!!this.lastStep&&Math.hypot(position.x-this.lastStep.x,position.z-this.lastStep.z)>dt);
    if(this.statuses.giant>0){this.giantStep-=dt;if(moved&&this.giantStep<=0){this.giantStep=.45;this.area(position,2.5,.7,0,0,'#c96a3a',2,'crater');}}
    this.lastStep={...position};
    this.petCooldown=Math.max(0,this.petCooldown-dt);
    const pet=this.host.pet?.();
    if(pet&&Number.isFinite(pet.dmg)&&pet.dmg>0&&Number.isFinite(pet.cd)&&pet.cd>0&&this.petCooldown<=0){
      const target=this.host.targets().filter(e=>e.hp>0&&Math.hypot(e.x-position.x,e.z-position.z)<7+e.radius).sort((a,b)=>Math.hypot(a.x-position.x,a.z-position.z)-Math.hypot(b.x-position.x,b.z-position.z))[0];
      if(target){const angle=Math.atan2(target.x-pet.x,target.z-pet.z);this.shoot(pet.shot??'fire',angle,pet.dmg,9,{x:pet.x,z:pet.z,stun:pet.shot==='ice'?.5:0,helper:true});// a pet's ice shot chills; 1.5 s at its 1.2-1.5 s rate froze a target for good
this.petCooldown=Math.max(.1,pet.cd);this.emit('cast',pet,.35,colorFor(pet.shot??'fire'),angle);}
    }
    this.dogToss(dt);
    for(const key of Object.keys(this.statuses))this.statuses[key]=Math.max(0,this.statuses[key]-dt);
    for(const[id,time]of this.marked){if(time<=dt)this.marked.delete(id);else this.marked.set(id,time-dt);}
    const due=this.jobs.filter(job=>job.at<=this.time);this.jobs=this.jobs.filter(job=>job.at>this.time);for(const job of due)job.run();
    if(this.action){const a=this.action;if(a.kind==='dash'){
      const from={...this.host.position()},remaining=Math.max(0,Math.min(dt,a.until-(this.time-dt)));this.host.move(a.direction.x*a.speed*remaining,a.direction.z*a.speed*remaining);
      const to=this.host.position();this.emit('trail',to,.7,'#e9fbff');
      if(a.push){for(const t of this.within(to,DZ.knightcharge.grab)){a.hit.add(t.id);if(!t.boss)this.host.moveTarget?.(t,to.x+a.direction.x*1.6,to.z+a.direction.z*1.6);}}
      else if(a.multiplier>0)for(const t of this.host.targets())if(t.hp>0&&!a.hit.has(t.id)&&distanceToSegment(t,from,to)<1.2+t.radius){a.hit.add(t.id);this.damage(t,a.multiplier,.3,0,3);}
    }if(this.time>=a.until){a.then?.();if(this.action===a)this.action=null;}}
    // Tank mode rams every creature it touches, each at most once per DZ.tank.rehit s.
    if((this.statuses.tank??0)>0){const at=this.host.position();for(const t of this.within(at,DZ.tank.reach)){const key='tank:'+t.id;if((this.rehits.get(key)??-1)>this.time)continue;this.rehits.set(key,this.time+DZ.tank.rehit);this.damage(t,DZ.tank.power,0,DZ.tank.lift,DZ.tank.knock);this.emit('ring',t,DZ.tank.reach,ELECTRIC_COLOR,this.host.facing(),'shock');}}
    for(let i=this.allies.length-1;i>=0;i--){const ally=this.allies[i];if(!ally)continue;ally.life-=dt;ally.cooldown-=dt;if(ally.hurt)ally.hurt=Math.max(0,ally.hurt-dt);if(ally.life<=0){this.allies.splice(i,1);this.ended(ally);continue;}if(ally.kind==='snowman'||ally.kind==='sandbag')continue;
      if(ally.kind==='lighthouse'){
        // The beam turns DZ.lighthouse.turn rad/s; a creature it sweeps over (within reach) is hit and dazzled, at most once per rehit.
        const L=DZ.lighthouse;ally.facing=(ally.facing??0)+dt*L.turn;const beam=direction(ally.facing);
        for(const t of this.host.targets()){const x=t.x-ally.x,z=t.z-ally.z,l=Math.hypot(x,z);if(t.hp<=0||l>L.reach+t.radius||l<.01)continue;
          const off=Math.abs(Math.atan2(x*beam.z-z*beam.x,x*beam.x+z*beam.z)),key=ally.id+':'+t.id;
          if(off>L.width+Math.atan2(t.radius,l)||(this.rehits.get(key)??-1)>this.time)continue;
          this.rehits.set(key,this.time+L.rehit);this.summonHit=true;this.damage(t,L.power);this.summonHit=false;this.host.status?.(t,'blind',L.blind);this.emit('impact',t,.9,'#fff4b0');}
        continue;
      }
      const home=this.host.position(),targets=this.host.targets().filter(t=>t.hp>0&&Math.hypot(t.x-ally.x,t.z-ally.z)<13&&(ally.kind!=='clone'||Math.hypot(t.x-home.x,t.z-home.z)<DECOY.range+DZ.clones.reach+t.radius)).sort((a,b)=>Math.hypot(a.x-ally.x,a.z-ally.z)-Math.hypot(b.x-ally.x,b.z-ally.z)),target=targets[0];
      if(ally.kind==='bat'){const p=this.host.position();ally.x=p.x+Math.cos(this.time*3+ally.orbit)*2.2;ally.z=p.z+Math.sin(this.time*3+ally.orbit)*2.2;}
      if(!target){if(ally.kind==='parrot'||ally.kind==='clone'){const p=this.host.position(),gap=Math.hypot(p.x-ally.x,p.z-ally.z),near=ally.kind==='clone'?DZ.clones.ring+.4:1.5;if(gap>near){const step=Math.min(gap-near+.3,dt*(ally.kind==='parrot'?DZ.parrot.speed:8));ally.x+=(p.x-ally.x)/gap*step;ally.z+=(p.z-ally.z)/gap*step;ally.facing=Math.atan2(p.x-ally.x,p.z-ally.z);}}continue;}
      const distance=Math.hypot(target.x-ally.x,target.z-ally.z),angle=Math.atan2(target.x-ally.x,target.z-ally.z);ally.facing=angle;
      const reach=ally.kind==='clone'?DZ.clones.reach:ally.kind==='parrot'?DZ.parrot.reach:ally.kind==='tree'?DZ.tree.radius:1.6;
      if((ally.kind==='clone'||ally.kind==='parrot')&&distance>target.radius+reach*.85){const step=Math.min(distance-target.radius-reach*.8,dt*(ally.kind==='parrot'?DZ.parrot.speed:8));ally.x+=Math.sin(angle)*step;ally.z+=Math.cos(angle)*step;
        // Clones keep close: never more than DECOY.range m from you (online the server shares them only that near).
        if(ally.kind==='clone'){const p=this.host.position(),gx=ally.x-p.x,gz=ally.z-p.z,g=Math.hypot(gx,gz),max=DECOY.range-.3;if(g>max){ally.x=p.x+gx/g*max;ally.z=p.z+gz/g*max;}}}
      if(ally.cooldown>0)continue;
      if(ally.kind==='turret'||ally.kind==='cannon'){const T=ally.kind==='turret'?DZ.turret:DZ.cannon;if(distance>T.range+target.radius)continue;this.shoot(ally.kind==='turret'?'volt':'cannonball',angle,T.power,T.range+1,{x:ally.x,z:ally.z,explosion:ally.kind==='cannon'?2:0,summoned:true});ally.cooldown=T.cd;this.emit('cast',ally,.6,ally.kind==='turret'?ELECTRIC_COLOR:'#d2b9ff');}
      else if(distance<target.radius+reach){
        if(ally.kind==='tree'){this.summonHit=true;this.damage(target,DZ.tree.power,0,0,.5);this.summonHit=false;ally.cooldown=DZ.tree.cd;this.emit('ring',ally,DZ.tree.radius,'#8dff8a');continue;}
        const power=ally.kind==='bat'?DZ.batcircle.power:ally.kind==='parrot'?DZ.parrot.power:DZ.clones.power;
        this.summonHit=true;this.damage(target,power,.1);this.summonHit=false;ally.cooldown=ally.kind==='parrot'?DZ.parrot.cd:ally.kind==='clone'?DZ.clones.cd:.7;this.emit('arc',ally,1,ally.kind==='parrot'?'#ff5a4a':'#c6b2ee',angle);
        if(ally.kind==='bat')this.leech(DZ.batcircle.heal*(this.host.stats().maxHp??100));if(ally.kind==='parrot'&&target.hp>0)this.marked.set(target.id,DZ.parrot.mark);}
    }
    for(let i=this.projectiles.length-1;i>=0;i--){const shot=this.projectiles[i];if(shot.kind==='snowball')shot.radius=Math.min(2.6,shot.radius+DZ.snowball.grow*dt);if(shot.homing){const target=this.host.targets().find(t=>t.id===shot.homing&&t.hp>0);if(target){const a=Math.atan2(target.x-shot.x,target.z-shot.z),old=Math.atan2(shot.direction.x,shot.direction.z),turn=Math.atan2(Math.sin(a-old),Math.cos(a-old));shot.direction=direction(old+Math.max(-dt*5,Math.min(dt*5,turn)));}}const from={x:shot.x,z:shot.z},step=Math.min(shot.speed*dt,shot.remaining),to={x:shot.x+shot.direction.x*step,z:shot.z+shot.direction.z*step};
      if(this.host.clearShot&&!this.host.clearShot(from,to)){if(shot.burst)this.burst(shot,from);else this.emit('impact',from,.4,shot.color);this.projectiles.splice(i,1);continue;}
      shot.x=to.x;shot.z=to.z;shot.remaining-=step;let consumed=false;
      const targets=this.host.targets().filter(t=>t.hp>0&&!shot.hit.has(t.id)&&distanceToSegment(t,from,to)<=t.radius+shot.radius).sort((a,b)=>Math.hypot(a.x-from.x,a.z-from.z)-Math.hypot(b.x-from.x,b.z-from.z));
      this.helperShot=!!shot.helper;this.summonHit=!!shot.summoned;for(const target of targets){shot.hit.add(target.id);
        if(shot.burst){this.burst(shot,{x:target.x,z:target.z});consumed=true;break;}
        // The rolling snowball hits harder as it grows: ×(1 + its radius), and knocks creatures aside.
        this.damage(target,shot.kind==='snowball'?shot.multiplier*(1+shot.radius):shot.multiplier,shot.stun,shot.lift,shot.kind==='snowball'?3:1);if(shot.slow)this.host.status?.(target,'slow',shot.slow);
        const look=ELECTRIC_SHOTS.has(shot.kind)?'shock' as const:shot.explosion?'blast' as const:undefined;this.emit('impact',target,shot.radius+.3,shot.color,this.host.facing(),look);if(shot.explosion)this.area(target,shot.explosion,shot.multiplier*.6,shot.stun,0,shot.color,1.2,look);if(!shot.pierce){consumed=true;break;}}
      if(!consumed&&shot.remaining<=0&&shot.burst)this.burst(shot,to);this.helperShot=false;this.summonHit=false;if(consumed||shot.remaining<=0)this.projectiles.splice(i,1);
    }
  }
}
