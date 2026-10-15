/**
 * How heavy an ordinary creature is, and what that changes when it is hit (docs/QUALITY-PLAN.md, "small creatures feel real").
 *
 * Three classes: a light one (slimes, bunnies, bats, wasps, small birds, frogs) reacts big, is pushed far, flinches out of
 * a wind-up on the last hit of a chain or a critical and is flung when killed; a medium one (boar, crab, penguin, seal,
 * lizard) slides, flinches only on a critical and is thrown a little; a heavy one (turtle, everything rooted or standing)
 * barely moves, puffs dust and never flinches. Bosses, titans and elites with a role have no class here: everything in
 * this file leaves them exactly as they were.
 *
 * Pure data and functions: world.ts applies them on the host (solo or the room's host, which simulates creatures online;
 * the server owns only HP, stun and lift, so nothing here needs a server twin).
 */
import type {EnemyDefinition} from './enemy-types.ts';

export type Weight='light'|'medium'|'heavy';

/** Species whose class the rule below would get wrong. */
export const WEIGHT_OVERRIDES:Record<string,Weight>={forest_raptor:'medium',thunderbird:'medium',hammershark:'medium',cloudsheep:'medium',lavaworm:'medium',magmaturtle:'heavy',toysoldier:'light',windmouse:'light'};
const LIGHT_FAMILIES:ReadonlySet<string>=new Set(['blob','bunny','winged','frog','mushroom']);
const HEAVY_FAMILIES:ReadonlySet<string>=new Set(['turtle','flower','cactus','volcano','lollipop','jackbox','eye']);

/** The class of a creature, or null for one this file must leave alone (a boss, a titan, an elite with a role, a body someone else drives). */
export function weightClass(type:string|undefined,def:Pick<EnemyDefinition,'family'|'speed'|'hp'|'behavior'|'boss'|'titan'>|undefined,extra?:{boss?:boolean;elite?:unknown;driver?:unknown}):Weight|null{
  if(!def||def.boss||def.titan||extra?.boss||extra?.elite||extra?.driver)return null;
  const own=type?WEIGHT_OVERRIDES[type]:undefined;if(own)return own;
  if(!(def.speed>0)||def.behavior==='rooted'||HEAVY_FAMILIES.has(def.family))return 'heavy';
  if(LIGHT_FAMILIES.has(def.family)||def.hp<=80)return 'light';
  return 'medium';
}

/**
 * Per class: `react` scales the drawn recoil (hit-react.ts), `knock` the rule knockback (world.ts knockEnemy), `fling` the
 * metres a killing blow throws the body (looks only, `flingMax` caps it), `hop` metres of the little hop a big hit gives,
 * `bump` the part of its push a knocked body passes to a creature it runs into, `dust` whether a hit puffs dust at its feet.
 */
export const WEIGHT={
  light:{react:1.3,knock:1.3,fling:1.7,flingMax:2.8,hop:.35,bump:.55,dust:false,attackCooldown:.9},
  medium:{react:1,knock:1,fling:.8,flingMax:1.3,hop:0,bump:.35,dust:false,attackCooldown:1},
  heavy:{react:.45,knock:.3,fling:0,flingMax:0,hop:0,bump:.1,dust:true,attackCooldown:1},
} as const;

/** Earned flinch: seconds the creature is staggered (its wind-up is cancelled and starts over) and seconds before it can flinch again. */
export const FLINCH={time:.35,cooldown:1.2};
/** Whether a hit interrupts a creature: light on the last hit of a chain or a critical, medium on a critical only, heavy never; never again within FLINCH.cooldown s. */
export function flinches(weight:Weight|null,hit:{critical?:boolean;big?:boolean},sinceLast:number){
  if(!weight||weight==='heavy'||!(sinceLast>=FLINCH.cooldown))return false;
  return weight==='light'?!!(hit.critical||hit.big):!!hit.critical;
}

/** Death fling timing: the body flies for `fly` s, bounces once for `bounce` s, then the old swell and shrink (`poof` s) runs where it lies. `arc`/`bounceArc`: metres high for a full light throw. */
export const FLING={fly:.2,bounce:.1,poof:.3,arc:.9,bounceArc:.18};
/** Metres a killing blow of `strength` (hit-react.ts reactStrength, 1 for a plain hit) throws a body of this class. */
export function flingDistance(weight:Weight|null,strength:number){
  if(!weight)return 0;const w=WEIGHT[weight];return Math.min(w.flingMax,w.fling*Math.max(0,Number.isFinite(strength)?strength:0));
}
export interface FlingPose {along:number;up:number;spin:number;squash:number}
export const newFlingPose=():FlingPose=>({along:0,up:0,spin:0,squash:0});
/**
 * Where a flung body is drawn `t` s after the blow, for a throw of `distance` m, written into `out` (no allocation): the part
 * of the way covered (0–1), metres above the ground, the tumble backwards (rad) and a squash on touching down. A full light
 * throw turns head over heels once and lands on its back; a shorter (medium) throw has a lower arc and only topples part way.
 */
export function flingPose(t:number,distance:number,out:FlingPose):FlingPose{
  const k=Math.max(0,Math.min(1,distance/WEIGHT.light.fling)),turn=k>=.95?Math.PI*2:0,topple=Math.PI/2*k;out.squash=0;
  if(!(t>0)||!(k>0)){out.along=out.up=out.spin=0;return out;}
  if(t<FLING.fly){const s=t/FLING.fly;out.along=.8*(1-(1-s)*(1-s));out.up=4*s*(1-s)*FLING.arc*k;out.spin=(turn+topple)*s;return out;}
  const b=Math.min(1,(t-FLING.fly)/FLING.bounce);
  out.along=.8+.2*b;out.up=4*b*(1-b)*FLING.bounceArc*k;out.spin=turn+topple;out.squash=b<.3?(.3-b)*.8:0;
  return out;
}
/** Total seconds of a death: with no throw only the poof, as before. */
export const deathTime=(distance:number)=>distance>0?FLING.fly+FLING.bounce+FLING.poof:FLING.poof;

/** A knocked body passes part of its push to a creature it runs into, only while it is really moving (m/s). */
export const BUMP={minSpeed:2,keep:.6};
/** The push (m/s along each axis) a body moving at (vx, vz) passes to one of class `other`; zero for a boss or a standing creature. */
export function bumpShare(other:Weight|null,speed:number){return other&&speed>=BUMP.minSpeed?WEIGHT[other].bump:0;}

/** Badly hurt: below this part of its health a creature moves at `speed` and limps. */
export const HURT={below:.25,speed:.85};
export const hurtSpeed=(weight:Weight|null,hp:number,maxHp:number)=>weight&&maxHp>0&&hp>0&&hp/maxHp<HURT.below?HURT.speed:1;
/** Timid species run away once, for `time` s, when they first drop below `below` of their health. */
export const FLEE={below:.2,time:2};
export const TIMID:ReadonlySet<string>=new Set(['bunny','penguin','frog']);
export const startsFleeing=(type:string|undefined,weight:Weight|null,hp:number,maxHp:number,fled:boolean)=>!!weight&&!fled&&TIMID.has(type??'')&&maxHp>0&&hp>0&&hp/maxHp<FLEE.below;
/** Seconds of a light body's hop on a big hit (a back flip on a critical), and of the hop when a creature first notices an explorer (metres high). */
export const HOP={time:.3,notice:.28,noticeTime:.3};
