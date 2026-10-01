interface Point { x:number; y:number }
export interface GestureHost { tap(x:number,y:number):void; walk(x:number,y:number):void; zoom(ratio:number):void; stop():void }
/** A press held this long steers instead of tapping, and then re-targets at most this often: a new path every frame
 * made the explorer stutter under a held or tapping finger (the reference's 29/09 fix). */
export const HOLD_DELAY=.2,HOLD_RETARGET=.2;
/** Pointer identity prevents a second finger releasing a first finger's movement. */
export class GroundGestures {
  private pointers=new Map<number,Point>();private age=0;private nextWalk=HOLD_DELAY;private pinch=0;private wasPinch=false;private host:GestureHost;
  constructor(host:GestureHost){this.host=host;}
  down(id:number,x:number,y:number){this.pointers.set(id,{x,y});if(this.pointers.size===1){this.age=0;this.nextWalk=HOLD_DELAY;this.wasPinch=false;}else{this.wasPinch=true;this.pinch=this.distance();this.host.stop();}}
  move(id:number,x:number,y:number){if(!this.pointers.has(id))return;this.pointers.set(id,{x,y});if(this.pointers.size>1){const d=this.distance();if(d>8&&this.pinch>8)this.host.zoom(this.pinch/d);this.pinch=d;}}
  up(id:number,cancel=false){const point=this.pointers.get(id);if(!point)return;if(!cancel&&!this.wasPinch&&this.age<HOLD_DELAY)this.host.tap(point.x,point.y);this.pointers.delete(id);if(!this.pointers.size)this.clear();}
  update(dt:number,active=true){if(!active){this.clear();return;}this.age+=dt;if(this.pointers.size===1&&!this.wasPinch&&this.age>=this.nextWalk){const p=this.pointers.values().next().value!;this.nextWalk=this.age+HOLD_RETARGET;this.host.walk(p.x,p.y);}}
  clear(){this.pointers.clear();this.age=0;this.nextWalk=HOLD_DELAY;this.pinch=0;this.wasPinch=false;}
  private distance(){const [a,b]=[...this.pointers.values()];return a&&b?Math.hypot(a.x-b.x,a.y-b.y):0;}
}
