import * as T from 'three';
import type { KitLibrary } from './assets.ts';
import type { Effects } from './fx.ts';
import { CAST, FISH_PER_WATER, RESTOCK_AFTER_CATCH, MYSTERY, type FishingState, type Point } from './fishing.ts';
import { toonMaterial } from './toon.ts';

/** Swimmable water of one pond, in world units. */
export interface PondView { id: string; x: number; z: number; rx: number; rz: number; surface: number; waterId: string }
type FishState = 'swim' | 'approach' | 'nibble' | 'bite' | 'hooked' | 'flee';
interface Swimmer {
  obj: T.Group; tail: T.Object3D | null; pond: PondView; species: string; heading: number; speed: number; depth: number; wag: number;
  goal: { x: number; z: number } | null; state: FishState; t: number; wig: number;
  mystery?:boolean; mark?:T.Sprite;
}
interface Leap { obj: T.Group; from: T.Vector3; target: () => T.Vector3; t: number; done: () => void }

const between = (min: number, max: number) => min + Math.random() * (max - min);
const turn = (from: number, to: number, amount: number) => from + Math.atan2(Math.sin(to - from), Math.cos(to - from)) * Math.min(1, amount);
/**
 * Display scale, body top above the swim pivot and tail swing per species, from
 * art/generated/kit/fish-manifest.json. Each fish swims just deep enough that
 * its body stays under the surface; tall fins may break it.
 */
const FISH_LOOK: Record<string, [scale: number, top: number, wag: number]> = {
  fish_perch: [1.6, 0.0589, 0.6],
  fish_clown: [1.6, 0.0595, 0.6],
  fish_puffer: [1.6, 0.1048, 0.6],
  fish_carp: [1.4, 0.0817, 0.6],
  fish_shark: [1.1, 0.0784, 0.6],
  fish_rainbow: [1.6, 0.0539, 0.6],
  fish_catfish: [1.1, 0.0611, 0.6],
  fish_koi: [1.4, 0.0729, 0.6],
  fish_eel: [1.1, 0.04, 0.35],
  fish_swordfish: [1.1, 0.0825, 0.6],
  fish_jelly: [1.6, 0.0733, 0.45],
  fish_icepike: [1.4, 0.0482, 0.6],
  fish_whale: [1.1, 0.1226, 0.5],
  fish_kraken: [1.1, 0.1019, 0.45],
  fish_golden: [1.4, 0.0803, 0.6],
  fish_sunfish: [1.1, 0.0819, 0.4],
  fish_angler: [1.4, 0.0989, 0.6],
  fish_manta: [1.1, 0.0405, 0.5],
  boot: [1.4, 0.1864, 0.6],
};
export const fishLook = (species: string) => FISH_LOOK[species] ?? [1, .06, .5];
const look = fishLook;
/** Height of the bobber's antenna tip above its waterline, where the line ties on. */
const LINE_ANCHOR = .134;
// Fallback colours when the fish models are unavailable.
const FALLBACK: Record<string, [string, string]> = {
  fish_perch: ['#8fb34a', '#ff9a3a'], fish_clown: ['#ff8a2a', '#ffffff'], fish_puffer: ['#f2c94c', '#8a6a2a'], fish_carp: ['#d9a441', '#8a5a2a'],
  fish_shark: ['#7f93a8', '#e8eef4'], fish_rainbow: ['#5fd3f5', '#ff6bb5'], fish_catfish: ['#8a7a6a', '#5a4a3a'], fish_koi: ['#ffffff', '#ff5a2a'],
  fish_eel: ['#3fae8f', '#1f6a5a'], fish_swordfish: ['#3f7fd6', '#a9c8f5'], fish_jelly: ['#ff9ccf', '#ffd3ec'], fish_icepike: ['#bfe8ff', '#ffffff'],
  fish_whale: ['#4a7fd6', '#dcecff'], fish_kraken: ['#b04a8a', '#ff8ad0'], fish_golden: ['#ffc83a', '#fff1a0'], fish_sunfish: ['#b8c2cc', '#e8eef4'],
  fish_angler: ['#2b3a6b', '#ffe45c'], fish_manta: ['#2a3a5a', '#e8eef4'], boot: ['#8a5a34', '#5a3a20'],
};

/**
 * Fishing drawn in the world: fish swim in the ponds, the bobber arcs out on a line to the
 * tapped spot, the chosen fish swims up, nibbles and bites, a hooked fish is dragged toward the
 * shore as the catch progresses, and a landed fish leaps into the explorer's arms. The rules
 * (timings, the early-press tug, which fish comes) live in FishingSimulation; this class only shows them.
 */
export class FishingView {
  active = false;
  /** The hunting view draws this pond's ordinary fish at their authoritative targets; the mystery fish stays ours. */
  huntingPondId: string | null = null;
  pond: PondView | null = null;
  readonly castTo = new T.Vector3();
  private root = new T.Group();
  private fish: Swimmer[] = [];
  private dressing: T.Object3D[] = [];
  private bobber: T.Object3D;
  private line: T.Line;
  private linePositions: Float32Array;
  private lineMaterial = new T.LineBasicMaterial({ color: '#ffffff', transparent: true, opacity: .95 });
  private castFrom = new T.Vector3();
  private t = 0; private phase = ''; private dip = 0;
  /** Counters of the simulation already shown. */
  private seen = { nibbles: 0, missed: 0, early: 0, fled: 0 };
  private interest: Swimmer | null = null; private species = '';
  private leaps: Leap[] = [];
  private scratch = new T.Vector3();
  private readonly segments = 18;
  private respawns: Array<{ pond: PondView; at: number }> = [];
  private ripples = new Map<PondView, number>();
  private clock = 0;
  private mysterySpawns:Array<{pond:PondView;at:number}>=[];
  private ponds:PondView[]=[];
  private mysteryDeadlines=new Map<string,number>();
  private mysterySpecies:(waterId:string)=>string=()=> 'fish_perch';
  private symbolTextures=new Map<string,T.CanvasTexture>();
  /** Seconds of monotonic time; cooldowns continue while animation is suspended. */
  private readonly monotonicNow:()=>number;

  private fx:Effects;private kit:KitLibrary;private sound:(name:'pop'|'splash'|'cast'|'snap'|'reel')=>void;
  constructor(scene: T.Scene, fx: Effects, kit: KitLibrary, sound: (name: 'pop' | 'splash' | 'cast' | 'snap' | 'reel') => void, monotonicNow:()=>number=()=>performance.now()/1000) {
    this.fx=fx;this.kit=kit;this.sound=sound;this.monotonicNow=monotonicNow;
    this.root.name = 'fishing';
    scene.add(this.root);
    this.bobber = this.makeBobber(); this.bobber.visible = false; this.root.add(this.bobber);
    this.linePositions = new Float32Array(this.segments * 3);
    const geometry = new T.BufferGeometry(); geometry.setAttribute('position', new T.BufferAttribute(this.linePositions, 3));
    this.line = new T.Line(geometry, this.lineMaterial); this.line.frustumCulled = false; this.line.visible = false; this.root.add(this.line);
  }

  attach(scene: T.Scene) { if (this.root.parent !== scene) scene.add(this.root); }

  private makeBobber() {
    const kitBobber = this.kit.ready ? this.kit.instance('bobber') : null;
    if (kitBobber) return kitBobber;
    const group = new T.Group();
    const top = new T.Mesh(new T.SphereGeometry(.09, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), toonMaterial({ color: '#ef3b3b' }));
    const bottom = new T.Mesh(new T.SphereGeometry(.09, 12, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), toonMaterial({ color: '#ffffff' }));
    group.add(top, bottom); return group;
  }

  makeFish(species: string): { obj: T.Group; tail: T.Object3D | null } {
    const model = this.kit.ready ? this.kit.instance(species) : null;
    if (model) {
      model.traverse(o => { o.castShadow = false; });
      model.scale.setScalar(look(species)[0]);
      return { obj: model, tail: model.children.find(c => c.name.endsWith('_tail')) ?? null };
    }
    const [body, fin] = FALLBACK[species] ?? ['#ff9a3a', '#ffffff'], group = new T.Group();
    const trunk = new T.Mesh(new T.SphereGeometry(.13, 12, 8), toonMaterial({ color: body }));
    trunk.scale.set(.85, .6, 1.7); group.add(trunk);
    const tail = new T.Mesh(new T.ConeGeometry(.12, .2, 4), toonMaterial({ color: fin }));
    tail.rotation.x = Math.PI / 2; tail.position.z = -.3; tail.name = 'fallback_tail';
    const hinge = new T.Group(); hinge.position.z = -.22; tail.position.z = -.1; hinge.add(tail); hinge.name = `${species}_tail`; group.add(hinge);
    return { obj: group, tail: hinge };
  }

  /** Stock the ponds of a freshly built world with the reference's count per kind of water. `pool` lists species by weight for each water. */
  populate(ponds: PondView[], pool: (waterId: string) => string[], mysterySpecies?:(waterId:string)=>string, stock?:(pond:PondView)=>string[]|null) {
    this.cancel();
    for (const f of this.fish) this.root.remove(f.obj);
    for (const d of this.dressing) this.root.remove(d);
    this.fish = []; this.dressing = []; this.respawns = []; this.mysterySpawns=[]; this.ripples.clear();
    for(const leap of this.leaps)this.root.remove(leap.obj);this.leaps=[];
    this.mysterySpecies=mysterySpecies??(waterId=>pool(waterId).find(id=>id!=='boot')??'fish_perch');
    this.ponds=ponds;
    if (this.kit.ready) { const fresh = this.makeBobber(); this.root.remove(this.bobber); this.bobber = fresh; this.bobber.visible = false; this.root.add(fresh); }
    for (const pond of ponds) {
      const species = pool(pond.waterId).filter(id => id !== 'boot');
      const count = FISH_PER_WATER[pond.waterId] ?? 4;
      // Stocking from the harpoon slots keeps the same species in the pond when hunting gear takes over its fish.
      const slots = stock?.(pond);
      for (let i = 0; i < count && species.length; i++) this.addFish(pond, slots?.[i] ?? species[Math.floor(Math.random() * species.length)]);
      if(count&&species.length)this.mysterySpawns.push({pond,at:this.mysteryDeadlines.get(pond.id)??this.monotonicNow()+between(MYSTERY.firstMin,MYSTERY.firstMax)});
      // Reeds on the sandy lip and lily flowers on the water, from the kit.
      for (const [name, count2, onEdge] of [['reeds', 3, true], ['lily_flower', 2, false]] as const) {
        for (let i = 0; i < count2; i++) {
          const piece = this.kit.ready ? this.kit.instance(name) : null; if (!piece) continue;
          const a = (i + .3) / count2 * Math.PI * 2 + pond.x, d = onEdge ? pond.rx + .3 : pond.rx * .55;
          piece.position.set(pond.x + Math.cos(a) * d, onEdge ? .12 : pond.surface + .01, pond.z + Math.sin(a) * d);
          // Lily pads and reeds lie flat or are thin: their shadows would cost a pass and add nothing.
          piece.traverse(o => { o.castShadow = false; });
          piece.rotation.y = a; this.root.add(piece); this.dressing.push(piece);
        }
      }
    }
  }

  private symbol(label:string,size=.75){
    let texture=this.symbolTextures.get(label);
    if(!texture){const canvas=document.createElement('canvas');canvas.width=canvas.height=128;const ctx=canvas.getContext('2d')!;ctx.font='bold 100px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.lineWidth=10;ctx.strokeStyle='#3a2433';ctx.fillStyle='#ffe14d';ctx.strokeText(label,64,70);ctx.fillText(label,64,70);texture=new T.CanvasTexture(canvas);texture.colorSpace=T.SRGBColorSpace;this.symbolTextures.set(label,texture);}
    const sprite=new T.Sprite(new T.SpriteMaterial({map:texture,depthTest:false,transparent:true}));sprite.scale.setScalar(size);sprite.renderOrder=5;return sprite;
  }
  private addMystery(pond:PondView){
    if(this.fish.some(f=>f.pond.id===pond.id&&f.mystery))return;
    const species=this.mysterySpecies(pond.waterId),fish=this.addFish(pond,species==='boot'?'fish_perch':species);
    this.root.remove(fish.obj);const obj=new T.Group(),shadow=new T.Mesh(new T.CircleGeometry(.8,24),new T.MeshBasicMaterial({color:'#0d1626',transparent:true,opacity:.55,depthWrite:false}));
    shadow.rotation.x=-Math.PI/2;shadow.scale.set(.55,1.25,1);obj.add(shadow);const mark=this.symbol('?');mark.position.y=1.1;obj.add(mark);obj.position.copy(fish.obj.position);this.root.add(obj);
    fish.obj=obj;fish.tail=null;fish.depth=.04;fish.mystery=true;fish.mark=mark;fish.speed=between(.35,.6);
  }
  /** Hidden species is revealed only on landing; the visible question mark determines attraction. */
  mysteryNearCast(){return this.fish.find(f=>f.mystery&&f.pond.id===this.pond?.id&&f.state==='swim'&&Math.hypot(f.obj.position.x-this.castTo.x,f.obj.position.z-this.castTo.z)<MYSTERY.reach)?.species??null;}

  /** Apply relative server time, so changing the browser clock cannot alter eligibility. */
  setMysteryAvailability(pondId:string,remaining:number){
    if(!Number.isFinite(remaining))return;
    const at=this.monotonicNow()+Math.max(0,remaining);this.mysteryDeadlines.set(pondId,at);
    this.mysterySpawns=this.mysterySpawns.filter(entry=>entry.pond.id!==pondId);
    if(remaining>0)for(let i=this.fish.length-1;i>=0;i--){const fish=this.fish[i];if(fish.mystery&&fish.pond.id===pondId&&fish!==this.interest){this.root.remove(fish.obj);this.fish.splice(i,1);}}
    const pond=this.ponds.find(p=>p.id===pondId);if(pond)this.mysterySpawns.push({pond,at});
  }
  resetMysteryAvailability(){this.mysteryDeadlines.clear();}

  private addFish(pond: PondView, species: string, fromEdge = false) {
    const { obj, tail } = this.makeFish(species), a = Math.random() * Math.PI * 2, r = fromEdge ? .85 : Math.random() * .7;
    const [scale, top, wag] = this.kit.ready ? look(species) : [1, .06, .5], depth = top * scale + .015;
    obj.position.set(pond.x + Math.cos(a) * pond.rx * r, pond.surface - depth, pond.z + Math.sin(a) * pond.rz * r);
    this.root.add(obj);
    const fish: Swimmer = { obj, tail, pond, species, heading: Math.random() * 6.28, speed: between(.5, 1.1), goal: null, state: 'swim', t: 0, wig: Math.random() * 10, depth, wag };
    this.fish.push(fish); return fish;
  }

  /** Where this pond's ordinary fish are, in stocking order, so a hunting handover starts from them. */
  ordinaryPoses(pondId: string) { return this.fish.filter(f => f.pond.id === pondId && !f.mystery).map(f => ({ x: f.obj.position.x, z: f.obj.position.z, heading: f.obj.rotation.y })); }
  /** Hand the fish back where the hunting view left them, so leaving the shore does not teleport them. */
  adoptPoses(pondId: string, poses: Array<{ x: number; z: number; heading: number }>) {
    this.fish.filter(f => f.pond.id === pondId && !f.mystery).forEach((f, i) => { const p = poses[i]; if (!p) return; const at = this.inside(f.pond, p.x, p.z, 1); f.obj.position.x = at.x; f.obj.position.z = at.z; f.heading = p.heading; f.obj.rotation.y = p.heading; f.goal = null; });
  }

  private inside(pond: PondView, x: number, z: number, margin = .82) {
    const u = (x - pond.x) / (pond.rx * margin), v = (z - pond.z) / (pond.rz * margin), d = Math.hypot(u, v);
    return d <= 1 ? { x, z } : { x: pond.x + u / d * pond.rx * margin, z: pond.z + v / d * pond.rz * margin };
  }

  /** Start a cast from the rod tip to `cast` (chosen from the tap by planCast). */
  begin(pond: PondView, rodTip: T.Vector3, cast: Point) {
    this.cancel();
    this.active = true; this.pond = this.fish.find(f=>f.pond.id===pond.id)?.pond??pond; this.t = 0; this.phase = 'cast'; this.dip = 0; this.seen = { nibbles: 0, missed: 0, early: 0, fled: 0 };
    this.castTo.set(cast.x, pond.surface, cast.z);
    this.castFrom.copy(rodTip);
    this.bobber.visible = true; this.line.visible = true; this.bobber.position.copy(rodTip);
    this.sound('cast');
  }

  /**
   * The fish the simulation sends to the bobber (attract @868468): 60 % of the time one of that species
   * already swimming here, else a new one from the rim. Returns its distance to the bobber.
   */
  approachDistance(species: string,mystery=false) {
    const pond = this.pond; if (!pond) return 2.5;
    if (this.interest && this.interest.state !== 'swim') this.flee(this.interest);
    const hidden=mystery?this.fish.find(f=>f.mystery&&f.pond.id===pond.id&&f.state==='swim'&&Math.hypot(f.obj.position.x-this.castTo.x,f.obj.position.z-this.castTo.z)<MYSTERY.reach):null;
    const same = this.fish.filter(f => !f.mystery&&f.pond.id === pond.id && f.state === 'swim' && f.species === species);
    const fish = hidden??(same.length && Math.random() < .6 ? same[Math.floor(Math.random() * same.length)] : this.addFish(pond, species, true));
    fish.state = 'approach'; fish.t = 0; this.interest = fish; this.species = species;
    return Math.hypot(fish.obj.position.x - this.castTo.x, fish.obj.position.z - this.castTo.z);
  }

  cancel() {
    if (this.interest && this.interest.state !== 'swim') this.flee(this.interest);
    this.interest = null; this.active = false; this.pond = null; this.bobber.visible = false; this.line.visible = false; this.phase = '';
  }

  private flee(fish: Swimmer) {
    fish.state = 'flee'; fish.t = 0; fish.speed = 3.2;
    fish.heading = Math.atan2(fish.obj.position.x - this.bobber.position.x, fish.obj.position.z - this.bobber.position.z);
  }

  /** The line broke: splash, a jolt, and the fish darts away. */
  snap() {
    const mid = this.bobber.position.clone().lerp(this.castFrom, .5);
    this.fx.burst(mid, { n: 14, color: '#ffffff', glow: true, speed: 5, up: 3, y: 0 });
    this.fx.burst(this.bobber.position, { n: 16, color: ['#ffffff', '#9fe3ff'], speed: 4, up: 5, y: 0 });
    this.fx.shake(.3); this.sound('snap');
    const fish = this.interest; this.cancel(); if (fish) fish.speed = 4.5;
  }

  /** The catch leaps out of the water in an arc and lands in the explorer's arms; a new fish swims in 12 s later. */
  land(target: () => T.Vector3, done: () => void,reveal?:{id:string;supergiant?:boolean;icon?:string;fish?:boolean}) {
    const fish = this.interest, pond = this.pond;
    let obj: T.Group;
    if (fish) { this.fish.splice(this.fish.indexOf(fish), 1); obj = fish.obj; }
    else { obj = this.makeFish(this.species).obj; obj.position.copy(this.bobber.position); this.root.add(obj); }
    if(fish?.mystery&&reveal){const previous=obj;obj=reveal.fish!==false?this.makeFish(reveal.id).obj:new T.Group();if(reveal.fish===false)obj.add(this.symbol(reveal.icon??'✨',1.1));obj.position.copy(previous.position);if(reveal.supergiant)obj.scale.multiplyScalar(2.2);this.root.remove(previous);this.root.add(obj);}
    this.interest = null;
    if (pond) {if(fish?.mystery)this.setMysteryAvailability(pond.id,between(MYSTERY.respawnMin,MYSTERY.respawnMax));else this.respawns.push({ pond, at: this.clock + RESTOCK_AFTER_CATCH });}
    const from = obj.position.clone(); from.y = (pond?.surface ?? 0) + .1;
    this.fx.burst(from, { n: 20, color: ['#ffffff', '#9fe3ff'], glow: true, speed: 5, up: 7, y: 0 });
    this.fx.ring(from, { color: '#ffffff', to: 2, life: .5, y: (pond?.surface ?? 0) + .02 });
    this.sound('splash');
    this.leaps.push({ obj, from, target, t: 0, done });
    this.cancel();
  }

  update(dt: number, time: number, rodTip: T.Vector3, player: T.Vector3, sim: FishingState | null) {
    this.clock += dt;
    const mysteryNow=this.monotonicNow();
    for(let i=this.mysterySpawns.length-1;i>=0;i--)if(this.mysterySpawns[i].at<=mysteryNow){this.addMystery(this.mysterySpawns[i].pond);this.mysterySpawns.splice(i,1);}
    for (let i = this.respawns.length - 1; i >= 0; i--) if (this.respawns[i].at <= this.clock) {
      const { pond } = this.respawns[i]; this.respawns.splice(i, 1);
      const species = this.fish.find(f => f.pond.id === pond.id&&!f.mystery)?.species; if (species) this.addFish(pond, species, true);
    }
    for (const fish of this.fish) this.updateFish(fish, dt, time, Math.hypot(player.x - fish.pond.x, player.z - fish.pond.z) < 45);
    this.ambientRipples(player);
    this.updateLeaps(dt);
    if (!this.active || !sim || !this.pond) return;
    this.t += dt;
    const pond = this.pond, bob = this.bobber.position;
    if (sim.phase !== this.phase) this.enter(sim.phase);
    if (sim.cast) this.castTo.set(sim.cast.x, pond.surface, sim.cast.z);
    if (sim.earlyPresses > this.seen.early) {
      // Too early: the bobber is tugged toward the explorer (the simulation moved the cast point).
      this.seen.early = sim.earlyPresses;
      this.fx.ring(this.castTo, { color: '#ffffff', from: .2, to: .8, life: .4, y: pond.surface + .01 });
    }
    if (sim.fled > this.seen.fled) {
      this.seen.fled = sim.fled;
      if (this.interest) this.flee(this.interest); this.interest = null;
    }
    if (sim.missedBites > this.seen.missed) { this.seen.missed = sim.missedBites; this.fx.ring(bob, { color: '#ffffff', from: .2, to: .7, life: .4, y: pond.surface + .01 }); }
    if (sim.nibbles > this.seen.nibbles) {
      // Each nibble touches the bobber: a dip and a small ring.
      this.seen.nibbles = sim.nibbles; this.dip = .25;
      this.fx.ring(bob, { color: '#ffffff', from: .15, to: .5, life: .35, y: pond.surface + .01, opacity: .6 });
    }
    let float: number | null = pond.surface + Math.sin(time * 2.2) * .02;
    if (this.phase === 'cast') {
      const k = Math.min(1, this.t / CAST.flight);
      bob.lerpVectors(this.castFrom, this.castTo, k); bob.y = this.castFrom.y * (1 - k) + pond.surface * k + Math.sin(k * Math.PI) * CAST.arc; float = null;
    } else if (this.phase === 'wait' || this.phase === 'approach' || this.phase === 'nibble') {
      bob.x += (this.castTo.x - bob.x) * Math.min(1, dt * 3); bob.z += (this.castTo.z - bob.z) * Math.min(1, dt * 3);
      if (this.dip > 0) { this.dip -= dt; float -= Math.sin((1 - Math.max(0, this.dip) / .25) * Math.PI) * .07; }
      this.drawSuitor(dt, sim);
    } else if (this.phase === 'bite') {
      float = pond.surface - .22 + Math.sin(time * 25) * .03;
      bob.x += Math.sin(time * 9) * dt * .4; bob.z += Math.cos(time * 7) * dt * .4;
      if (Math.random() < dt * 25) this.fx.burst(bob, { n: 1, color: '#ffffff', size: .06, speed: 1.5, up: 2, y: .05 });
      this.drawSuitor(dt, sim);
    } else if (this.phase === 'hooked') { this.updateFight(dt, time, sim, player); float = null; }
    if (float !== null) bob.y += (float - bob.y) * Math.min(1, dt * 12);
    this.bobber.rotation.z = Math.sin(time * 3) * .1;
    this.drawLine(time, rodTip, this.phase === 'hooked' ? sim.tension : 0);
  }

  private enter(phase: string) {
    const pond = this.pond!, bob = this.bobber.position;
    if (this.phase === 'cast' && phase !== 'cast') {
      this.fx.ring(this.castTo, { color: '#ffffff', from: .2, to: 1.2, life: .6, y: pond.surface + .01 });
      this.fx.burst(this.castTo, { n: 8, color: ['#ffffff', '#bfe9ff'], speed: 2, up: 3, size: .07, y: 0 }); this.sound('pop');
    }
    if (phase === 'bite') {
      this.fx.ring(bob, { color: '#ffffff', from: .3, to: 1.5, life: .5, y: pond.surface + .01 });
      this.fx.burst(bob, { n: 10, color: ['#ffffff', '#bfe9ff'], glow: true, speed: 3, up: 4, y: 0 }); this.sound('splash');
      if (this.interest) this.interest.state = 'bite';
    }
    if (phase === 'hooked') {
      if (this.interest) this.interest.state = 'hooked';
      this.fx.burst(bob, { n: 12, color: ['#ffffff', '#bfe9ff'], glow: true, speed: 3, up: 4, y: 0 }); this.fx.shake(.2);
    }
    this.phase = phase; this.t = 0;
  }

  /** The fish the simulation sent: it swims in to the distance the simulation says, darts at the bobber on each nibble, and grabs it on the bite. */
  private drawSuitor(dt: number, sim: FishingState) {
    const fish = this.interest; if (!fish || fish.state === 'flee' || fish.state === 'swim') return;
    const p = fish.obj.position, bob = this.bobber.position, pond = fish.pond;
    if (this.phase === 'approach') fish.state = 'approach'; else if (this.phase === 'nibble') fish.state = 'nibble';
    const face = Math.atan2(bob.x - p.x, bob.z - p.z);
    fish.heading = turn(fish.heading, face, dt * (fish.state === 'approach' ? 4 : 6));
    if (fish.state === 'bite') {
      p.x += (bob.x - p.x) * Math.min(1, dt * 10); p.z += (bob.z - p.z) * Math.min(1, dt * 10); p.y = pond.surface - fish.depth - .1;
      fish.heading += Math.sin(this.clock * 20) * dt * 3;
    } else {
      // Nibbling: hold 0.5 m off, then dart in 0.32 m and back over 0.3 s (the reference's dart).
      const away = fish.state === 'nibble' ? .5 - (sim.dart > 0 ? Math.sin((1 - sim.dart / .3) * Math.PI) * .32 : 0) : sim.fishDistance;
      const dx = p.x - bob.x, dz = p.z - bob.z, d = Math.hypot(dx, dz) || 1;
      const goal = this.inside(pond, bob.x + dx / d * away, bob.z + dz / d * away, .95), k = Math.min(1, dt * (sim.dart > 0 ? 30 : 8));
      p.x += (goal.x - p.x) * k; p.z += (goal.z - p.z) * k;
      p.y = pond.surface - fish.depth + Math.sin(this.clock * 1.3 + fish.wig) * .012;
    }
    fish.obj.rotation.y = fish.heading;
    if (fish.tail) fish.tail.rotation.y = Math.sin(this.clock * (fish.state === 'bite' ? 22 : 10) + fish.wig) * fish.wag;
  }

  private updateFight(dt: number, time: number, sim: FishingState, player: T.Vector3) {
    const fish = this.interest; if (!fish) return;
    const pond = this.pond!, surging = sim.surge > 0, p = fish.obj.position;
    const shore = this.scratch.set(player.x, 0, player.z).lerp(this.castTo, .18);
    const along = sim.progress, x = this.castTo.x + (shore.x - this.castTo.x) * along, z = this.castTo.z + (shore.z - this.castTo.z) * along;
    const dx = shore.x - this.castTo.x, dz = shore.z - this.castTo.z, length = Math.hypot(dx, dz) || 1;
    const wiggle = Math.sin(time * (surging ? 14 : 6)) * (surging ? .55 : .2);
    const goal = this.inside(pond, x - dz / length * wiggle, z + dx / length * wiggle, .95);
    p.x += (goal.x - p.x) * Math.min(1, dt * 6); p.z += (goal.z - p.z) * Math.min(1, dt * 6);
    p.y = pond.surface - fish.depth + (surging ? Math.abs(Math.sin(time * 9)) * .3 : 0);
    fish.heading = Math.atan2(this.castTo.x - shore.x, this.castTo.z - shore.z) + Math.sin(time * 12) * .5;
    fish.obj.rotation.y = fish.heading; fish.obj.rotation.z = Math.sin(time * 18) * .4;
    if (fish.tail) fish.tail.rotation.y = Math.sin(time * 26 + fish.wig) * Math.min(.6, fish.wag * 1.2);
    this.bobber.position.set(p.x, pond.surface - .05, p.z);
    if (surging && Math.random() < dt * 30) this.fx.burst(p, { n: 1, color: ['#ffffff', '#bfe9ff'], size: .09, speed: 2.5, up: 4, y: .3 });
    if (surging && Math.random() < dt * 4) this.fx.ring(p, { color: '#ffffff', from: .3, to: 1, life: .4, y: pond.surface + .01, opacity: .6 });
    if (Math.random() < dt * 3) this.sound('reel');
  }

  /** Now and then a swimming fish nudges the surface: a faint ring, so still water looks alive. Pooled rings, nearby ponds only. */
  private ambientRipples(player: T.Vector3) {
    for (const fish of this.fish) {
      const pond = fish.pond; if (Math.hypot(player.x - pond.x, player.z - pond.z) > 26 + pond.rx) continue;
      const next = this.ripples.get(pond) ?? this.clock + between(.5, 2.5);
      if (next > this.clock) { this.ripples.set(pond, next); continue; }
      if (fish.state === 'swim' && fish.obj.visible) this.fx.ring(fish.obj.position, { color: '#ffffff', from: .12, to: .7, life: 1.1, y: pond.surface + .012, thick: .12, opacity: .25 });
      this.ripples.set(pond, this.clock + between(1.2, 3.2) / Math.max(1, this.fish.filter(f => f.pond.id === pond.id).length / 3));
    }
  }

  private updateFish(fish: Swimmer, dt: number, time: number, near: boolean) {
    if (fish.pond.id === this.huntingPondId && !fish.mystery) { fish.obj.visible = false; return; }
    fish.obj.visible = near;
    if(fish.mark){fish.mark.position.y=1.1+Math.abs(Math.sin(time*3+fish.wig))*.25;fish.mark.material.opacity=fish.state==='swim'?1:.35;}
    if (!near && fish.state === 'swim') return;
    // The suitor and the hooked fish are moved by drawSuitor and updateFight.
    if (fish.state !== 'swim' && fish.state !== 'flee') { if (!this.active || fish !== this.interest) { fish.state = 'swim'; fish.goal = null; } return; }
    fish.t += dt; fish.obj.rotation.z = 0;
    const p = fish.obj.position;
    let goal: { x: number; z: number }, speed = fish.speed;
    if (fish.state === 'swim') {
      if (!fish.goal || Math.hypot(fish.goal.x - p.x, fish.goal.z - p.z) < .3 || fish.t > 8) {
        const a = Math.random() * 6.28, r = Math.random() * .8; fish.goal = this.inside(fish.pond, fish.pond.x + Math.cos(a) * fish.pond.rx * r, fish.pond.z + Math.sin(a) * fish.pond.rz * r); fish.t = 0;
      }
      goal = fish.goal;
    } else {
      goal = { x: p.x + Math.sin(fish.heading) * 2, z: p.z + Math.cos(fish.heading) * 2 };
      if (fish.t > 1.4) { fish.state = 'swim'; fish.speed = between(.5, 1.1); fish.goal = null; }
    }
    fish.heading = turn(fish.heading, Math.atan2(goal.x - p.x, goal.z - p.z), dt * 3);
    const next = this.inside(fish.pond, p.x + Math.sin(fish.heading) * speed * dt, p.z + Math.cos(fish.heading) * speed * dt);
    p.x = next.x; p.z = next.z;
    p.y = fish.pond.surface - fish.depth + Math.sin(time * 1.3 + fish.wig) * .012;
    fish.obj.rotation.y = fish.heading;
    if (fish.tail) fish.tail.rotation.y = Math.sin(time * (fish.state === 'flee' ? 22 : 9) + fish.wig) * fish.wag;
  }

  private updateLeaps(dt: number) {
    for (let i = this.leaps.length - 1; i >= 0; i--) {
      const leap = this.leaps[i]; leap.t += dt / .65;
      const k = Math.min(1, leap.t), to = leap.target().clone(); to.y += 1.2;
      leap.obj.position.lerpVectors(leap.from, to, k); leap.obj.position.y += Math.sin(k * Math.PI) * 2.2;
      leap.obj.rotation.x += dt * 9; leap.obj.rotation.y += dt * 5;
      if (k >= 1) { this.root.remove(leap.obj); this.leaps.splice(i, 1); leap.done(); }
    }
  }

  /** A sagging line while waiting; taut, reddening and trembling with tension while reeling. */
  private drawLine(time: number, tip: T.Vector3, tension: number) {
    const bob = this.bobber.position, hooked = this.phase === 'hooked', sag = hooked ? .05 : .5, tremble = hooked ? tension * .06 : 0;
    for (let i = 0; i < this.segments; i++) {
      const s = i / (this.segments - 1);
      this.linePositions[i * 3] = tip.x + (bob.x - tip.x) * s;
      this.linePositions[i * 3 + 1] = tip.y + (bob.y + LINE_ANCHOR - tip.y) * s - Math.sin(s * Math.PI) * sag + Math.sin(time * 60 + i * 2) * tremble * Math.sin(s * Math.PI);
      this.linePositions[i * 3 + 2] = tip.z + (bob.z - tip.z) * s;
    }
    (this.line.geometry.attributes.position as T.BufferAttribute).needsUpdate = true;
    this.lineMaterial.color.setRGB(1, 1 - tension * .75, 1 - tension * .9);
  }

  get swimming() { return this.fish.length; }
}
