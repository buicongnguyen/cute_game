import * as T from 'three';

// Tap picking and move re-target guards after the reference's 29/09 fix for stutter when tapping repeatedly
// (bundle @1051193 radii, @1052966 dead zones, @1059638 hold). A raycast through the whole scene cost 2-7 ms per
// tap on a throttled CPU; projecting a few dozen entity anchors costs microseconds.

/** Reference pick circles: anchor height in metres, radius in pixels on a 900 px tall view at the reference's default zoom. */
export const PICK_CIRCLES:Readonly<Record<string,{h:number;r:number}>>={
  plot:{h:.3,r:42},craft:{h:1.4,r:105},sell:{h:1.2,r:95},upgrade:{h:1.2,r:80},shop:{h:1.4,r:110},
  chest:{h:.4,r:45},travel:{h:2.5,r:110},decoration:{h:.8,r:50},dropped:{h:.4,r:50},
};
export const CREATURE_CIRCLE={h:.6,r:55},BOSS_CIRCLE={h:1.6,r:110};
/** Planet nodes (veins, presents, pillars…) use the reference's node rule: 55 px per metre of radius, at half a 1.4 m height. */
export const NODE_PX_PER_METRE=55,NODE_ANCHOR=.7;
/** Ponds are flat ellipses and the cottage a big block: circles fit them badly, so only the raycast fallback picks them. */
export const RAYCAST_ONLY:ReadonlySet<string>=new Set(['home','fish']);
/**
 * Zoom here is the visible height in metres. At 900/57 ≈ 15.8 m the ground scale matches the reference's default view
 * (57 px per metre across a 900 px tall screen, CC-04), so circles cover the same ground as the reference's do; at the
 * default zoom 21 they are 0.75 of its pixel radii.
 */
export const REFERENCE_SPAN=900/57;
/** A move re-target closer than this to the current walk target changes nothing worth a new path. */
export const RETARGET_DEAD_ZONE=.6;
/** While held, a pointer resting on the explorer does not re-target: it would only shuffle on the spot. */
export const HOLD_HERO_ZONE=.8;

export interface PickCircle {x:number;y:number;z:number;radius:number}

/** The reference scales its pixel radii by view height / 900 / zoom (its portrait pull-back excluded, as here). */
export function pickScale(viewHeight:number,zoom=21){return viewHeight/900*REFERENCE_SPAN/zoom;}

/**
 * Anchor height and unscaled pixel radius of an entity's circle; big creatures keep at least their own footprint and
 * sit at half their model height (when known), so a tap on a tall creature's upper body lands in its own circle.
 */
export function pickCircle(kind:string,radius:number,boss=false,height=0):{h:number;r:number}{
  if(kind==='enemy'){const c=boss?BOSS_CIRCLE:CREATURE_CIRCLE;return {h:Math.max(c.h,height/2),r:Math.max(c.r,radius*NODE_PX_PER_METRE)};}
  return PICK_CIRCLES[kind]??{h:NODE_ANCHOR,r:radius*NODE_PX_PER_METRE};
}

const projected=new T.Vector3();
/**
 * The circle holding the tap most deeply (pixel distance minus radius, smallest wins, as in the reference), or null.
 * Vector3.project serves orthographic and perspective cameras alike; anchors behind the camera or past far are skipped.
 */
export function pickInScreen<C extends PickCircle>(circles:Iterable<C>,camera:T.Camera,width:number,height:number,x:number,y:number):C|null{
  return circlesAt(circles,camera,width,height,x,y)[0]??null;
}
/** Every circle holding the tap, the most deeply held first. */
export function circlesAt<C extends PickCircle>(circles:Iterable<C>,camera:T.Camera,width:number,height:number,x:number,y:number):C[]{
  const held:Array<{c:C;d:number}>=[];
  for(const c of circles){
    projected.set(c.x,c.y,c.z).project(camera);if(projected.z<-1||projected.z>1)continue;
    const d=Math.hypot((projected.x+1)*width/2-x,(1-projected.y)*height/2-y)-c.radius;if(d<0)held.push({c,d});
  }
  return held.sort((a,b)=>a.d-b.d).map(h=>h.c);
}

const base=new T.Vector3(),top=new T.Vector3();
/** Upright extent the raycast fallback considers: enough for the rocket, the cottage roof and fruit trees. */
export const PICK_HEIGHT=8;
/** Whether the tap ray passes close enough to an entity's upright extent for its meshes to be worth an exact raycast. */
export function nearRay(ray:T.Ray,x:number,y:number,z:number,radius:number){return ray.distanceSqToSegment(base.set(x,y,z),top.set(x,y+PICK_HEIGHT,z))<(radius+1.5)**2;}

/** A held pointer this close to the explorer stops it: a chase or walk ends without a new path. */
export function holdsHero(point:{x:number;z:number},hero:{x:number;z:number}){return Math.hypot(point.x-hero.x,point.z-hero.z)<HOLD_HERO_ZONE;}
/** A move re-target that can be skipped: within .6 m of the current walk target or, while held, within .8 m of the explorer. */
export function ignoreRetarget(point:{x:number;z:number},target:{x:number;z:number}|null,hero:{x:number;z:number},held:boolean){
  return !!target&&Math.hypot(point.x-target.x,point.z-target.z)<RETARGET_DEAD_ZONE||held&&Math.hypot(point.x-hero.x,point.z-hero.z)<HOLD_HERO_ZONE;
}
