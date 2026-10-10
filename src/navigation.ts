export interface Point { x: number; z: number }
export interface Obstacle extends Point { r: number }
/** maxIterations caps the A* search (default 50000), so a goal that cannot be reached costs a bounded amount of time. */
export interface NavigationOptions {clearance?:number;bounds?:number;gridSize?:number;walkable?:(point:Point)=>boolean;maxIterations?:number}
export const WORLD_BOUNDS=148;
const CLEARANCE = .36;

/*
 * Worlds hold well over a thousand trees and rocks. A grid of small obstacles, built once per
 * obstacle list, lets collision and path checks look only at nearby cells. Large obstacles,
 * such as lava pools, are few and are always checked.
 */
const CELL=6,SMALL=3;
interface ObstacleIndex {length:number;cells:Map<number,Obstacle[]>;large:Obstacle[]}
const indexes=new WeakMap<Obstacle[],ObstacleIndex>();
const cellKey=(cx:number,cz:number)=>(cx+4096)*8192+cz+4096;
function indexOf(obstacles:Obstacle[]):ObstacleIndex|null{
  if(obstacles.length<48)return null;
  let index=indexes.get(obstacles);
  if(index&&index.length===obstacles.length)return index;
  index={length:obstacles.length,cells:new Map(),large:[]};
  for(const o of obstacles){
    if(o.r>SMALL){index.large.push(o);continue;}
    const key=cellKey(Math.floor(o.x/CELL),Math.floor(o.z/CELL));let list=index.cells.get(key);if(!list)index.cells.set(key,list=[]);list.push(o);
  }
  indexes.set(obstacles,index);return index;
}
/** True when `test` holds for any obstacle that could reach the box grown by `pad`. */
export function someObstacleNear(obstacles:Obstacle[],minX:number,minZ:number,maxX:number,maxZ:number,pad:number,test:(o:Obstacle)=>boolean){
  const index=indexOf(obstacles);if(!index)return obstacles.some(test);
  if(index.large.some(test))return true;
  const r=pad+SMALL,x0=Math.floor((minX-r)/CELL),x1=Math.floor((maxX+r)/CELL),z0=Math.floor((minZ-r)/CELL),z1=Math.floor((maxZ+r)/CELL);
  if((x1-x0+1)*(z1-z0+1)>index.cells.size)return obstacles.some(test);
  for(let cx=x0;cx<=x1;cx++)for(let cz=z0;cz<=z1;cz++){const list=index.cells.get(cellKey(cx,cz));if(list)for(const o of list)if(test(o))return true;}
  return false;
}
/** Obstacles whose edge could be within `reach` of the point: the large ones plus nearby grid cells (every obstacle for short lists). */
export function nearbyObstacles(obstacles:Obstacle[],x:number,z:number,reach:number):readonly Obstacle[]{
  const index=indexOf(obstacles);if(!index)return obstacles;
  const r=reach+SMALL,x0=Math.floor((x-r)/CELL),x1=Math.floor((x+r)/CELL),z0=Math.floor((z-r)/CELL),z1=Math.floor((z+r)/CELL);
  if((x1-x0+1)*(z1-z0+1)>index.cells.size)return obstacles;
  const near=index.large.slice();
  for(let cx=x0;cx<=x1;cx++)for(let cz=z0;cz<=z1;cz++){const list=index.cells.get(cellKey(cx,cz));if(list)for(const o of list)near.push(o);}
  return near;
}

export function blocked(point: Point, obstacles: Obstacle[],options:NavigationOptions={}) {
  const clearance=options.clearance??CLEARANCE;
  return Math.abs(point.x)>(options.bounds??49) || Math.abs(point.z)>(options.bounds??49) || options.walkable?.(point)===false || someObstacleNear(obstacles,point.x,point.z,point.x,point.z,clearance,o=>{const ox=point.x-o.x,oz=point.z-o.z,r=o.r+clearance;return r>0&&ox*ox+oz*oz<r*r;}); // squared compare: Math.hypot is the slow path of this per-creature, per-frame check
}

export function clearSegment(from: Point, to: Point, obstacles: Obstacle[],options:NavigationOptions={}) {
  if (blocked(from, obstacles,options) || blocked(to, obstacles,options)) return false;
  const dx = to.x-from.x, dz = to.z-from.z, lengthSquared = dx*dx+dz*dz;
  if(options.walkable){const steps=Math.ceil(Math.sqrt(lengthSquared)/.5);for(let i=1;i<steps;i++)if(!options.walkable({x:from.x+dx*i/steps,z:from.z+dz*i/steps}))return false;}
  const clearance=options.clearance??CLEARANCE;
  return !someObstacleNear(obstacles,Math.min(from.x,to.x),Math.min(from.z,to.z),Math.max(from.x,to.x),Math.max(from.z,to.z),clearance,obstacle => {
    const t = lengthSquared ? Math.max(0, Math.min(1, ((obstacle.x-from.x)*dx+(obstacle.z-from.z)*dz)/lengthSquared)) : 0;
    const ox=from.x+t*dx-obstacle.x,oz=from.z+t*dz-obstacle.z,r=obstacle.r+clearance;return r>0&&ox*ox+oz*oz<r*r;
  });
}

export function approach(from: Point, target: Point, radius: number, obstacles: Obstacle[], distance = radius+1.1,options:NavigationOptions={}): Point | null {
  const angle=Math.atan2(from.x-target.x,from.z-target.z);
  return Array.from({length:16},(_,i)=>({x:target.x+Math.sin(angle+i*Math.PI/8)*distance,z:target.z+Math.cos(angle+i*Math.PI/8)*distance}))
    .filter(p=>!blocked(p,obstacles,options)).sort((a,b)=>Math.hypot(a.x-from.x,a.z-from.z)-Math.hypot(b.x-from.x,b.z-from.z))[0]??null;
}

export function findRoute(from: Point, target: Point, obstacles: Obstacle[],options:NavigationOptions={}): Point[] {
  if (blocked(from, obstacles,options) || blocked(target, obstacles,options)) return [];
  if (clearSegment(from, target, obstacles,options)) return [{...target}];
  const grid=options.gridSize??(Math.hypot(from.x-target.x,from.z-target.z)>75?2:1);
  const key=(x:number,z:number)=>x+','+z, sx=Math.round(from.x/grid)*grid, sz=Math.round(from.z/grid)*grid;
  const open: Array<Point & {g:number;f:number}> = [], cost=new Map<string,number>(), parents=new Map<string,string>(), closed=new Set<string>();
  const push=(node:Point&{g:number;f:number})=>{open.push(node);let i=open.length-1;while(i){const p=(i-1)>>1;if(open[p].f<=node.f)break;open[i]=open[p];i=p;}open[i]=node;};
  const pop=()=>{const first=open[0],last=open.pop()!;if(open.length){let i=0;while(i*2+1<open.length){let child=i*2+1;if(child+1<open.length&&open[child+1].f<open[child].f)child++;if(open[child].f>=last.f)break;open[i]=open[child];i=child;}open[i]=last;}return first;};
  // Connect the exact player position to the grid with a collision-free segment.
  // Its nearest rounded grid cell can be inside a tree even when the player is not.
  for(let dx=-1;dx<=1;dx++)for(let dz=-1;dz<=1;dz++){
    const point={x:sx+dx*grid,z:sz+dz*grid};
    if(!clearSegment(from,point,obstacles,options))continue;
    const g=Math.hypot(point.x-from.x,point.z-from.z);
    cost.set(key(point.x,point.z),g);push({...point,g,f:g+Math.hypot(point.x-target.x,point.z-target.z)});
  }
  let end='';
  const budget=options.maxIterations??50000;
  for(let iterations=0;open.length&&iterations<budget;iterations++){
    const n=pop(),k=key(n.x,n.z);if(closed.has(k))continue;closed.add(k);
    // Being near the goal is insufficient: the final fractional segment must fit.
    if(Math.hypot(n.x-target.x,n.z-target.z)<1.5*grid&&clearSegment(n,target,obstacles,options)){end=k;break;}
    for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,1],[1,-1],[-1,-1]]){
      const x=n.x+dx*grid,z=n.z+dz*grid,nk=key(x,z);if(closed.has(nk)||!clearSegment(n,{x,z},obstacles,options))continue;
      const ng=n.g+Math.hypot(dx,dz)*grid;if(ng>=(cost.get(nk)??Infinity))continue;cost.set(nk,ng);parents.set(nk,k);push({x,z,g:ng,f:ng+Math.hypot(x-target.x,z-target.z)});
    }
  }
  if(!end)return grid>1&&options.gridSize===undefined?findRoute(from,target,obstacles,{...options,gridSize:1}):[];
  const route:Point[]=[{...target}];let k=end;
  for(;;){const [x,z]=k.split(',').map(Number);route.unshift({x,z});const parent=parents.get(k);if(!parent)break;k=parent;}
  return route;
}
