import * as T from 'three';
import type { KitLibrary } from './assets.ts';
import type { Effects } from './fx.ts';
import type { FishingSimulation } from './fishing.ts';

/** Swimmable water of one pond, in world units. */
export interface PondView { id: string; x: number; z: number; rx: number; rz: number; surface: number; waterId: string }
type FishState = 'swim' | 'approach' | 'nibble' | 'hooked' | 'flee';
interface Swimmer {
  obj: T.Group; tail: T.Object3D | null; pond: PondView; species: string; heading: number; speed: number; depth: number; wag: number;
  goal: { x: number; z: number } | null; state: FishState; t: number; wig: number; dart: number;
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
const look = (species: string) => FISH_LOOK[species] ?? [1, .06, .5];
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
 * Fishing drawn in the world: fish swim in the ponds, the bobber arcs out on a
 * line, fish nibble and bite, a hooked fish is dragged toward the shore as the
 * catch progresses, and a landed fish leaps into the explorer's arms. The rules
 * live in FishingSimulation; this class only shows them.
 */
export class FishingView {
  active = false;
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
  private shore = new T.Vector3();
  private t = 0; private phase = ''; private nibbles = 0; private missed = 0; private dip = 0; private early = 0;
  private interest: Swimmer | null = null; private species = '';
  private leaps: Leap[] = [];
  private scratch = new T.Vector3();
  private readonly segments = 18;
  private respawns: Array<{ pond: PondView; at: number }> = [];
  private clock = 0;

  constructor(scene: T.Scene, private fx: Effects, private kit: KitLibrary, private sound: (name: 'pop' | 'splash' | 'cast' | 'snap' | 'reel') => void) {
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
    const top = new T.Mesh(new T.SphereGeometry(.09, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), new T.MeshStandardMaterial({ color: '#ef3b3b', roughness: .4 }));
    const bottom = new T.Mesh(new T.SphereGeometry(.09, 12, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), new T.MeshStandardMaterial({ color: '#ffffff', roughness: .4 }));
    group.add(top, bottom); return group;
  }

  private makeFish(species: string): { obj: T.Group; tail: T.Object3D | null } {
    const model = this.kit.ready ? this.kit.instance(species) : null;
    if (model) {
      model.traverse(o => { o.castShadow = false; });
      model.scale.setScalar(look(species)[0]);
      return { obj: model, tail: model.children.find(c => c.name.endsWith('_tail')) ?? null };
    }
    const [body, fin] = FALLBACK[species] ?? ['#ff9a3a', '#ffffff'], group = new T.Group();
    const trunk = new T.Mesh(new T.SphereGeometry(.13, 12, 8), new T.MeshStandardMaterial({ color: body, roughness: .45 }));
    trunk.scale.set(.85, .6, 1.7); group.add(trunk);
    const tail = new T.Mesh(new T.ConeGeometry(.12, .2, 4), new T.MeshStandardMaterial({ color: fin, roughness: .45 }));
    tail.rotation.x = Math.PI / 2; tail.position.z = -.3; tail.name = 'fallback_tail';
    const hinge = new T.Group(); hinge.position.z = -.22; tail.position.z = -.1; hinge.add(tail); hinge.name = `${species}_tail`; group.add(hinge);
    return { obj: group, tail: hinge };
  }

  /** Stock the ponds of a freshly built world. `pool` lists species by weight for each water. */
  populate(ponds: PondView[], pool: (waterId: string) => string[]) {
    this.cancel();
    for (const f of this.fish) this.root.remove(f.obj);
    for (const d of this.dressing) this.root.remove(d);
    this.fish = []; this.dressing = []; this.respawns = [];
    if (this.kit.ready) { const fresh = this.makeBobber(); this.root.remove(this.bobber); this.bobber = fresh; this.bobber.visible = false; this.root.add(fresh); }
    for (const pond of ponds) {
      const species = pool(pond.waterId).filter(id => id !== 'boot');
      const count = Math.max(3, Math.min(8, Math.round(pond.rx * pond.rz * .5)));
      for (let i = 0; i < count && species.length; i++) this.addFish(pond, species[Math.floor(Math.random() * species.length)]);
      // Reeds and lily flowers from the kit dress the shoreline.
      for (const [name, count2, onEdge] of [['reeds', 3, true], ['lily_flower', 2, false]] as const) {
        for (let i = 0; i < count2; i++) {
          const piece = this.kit.ready ? this.kit.instance(name) : null; if (!piece) continue;
          const a = (i + .3) / count2 * Math.PI * 2 + pond.x, r = onEdge ? .98 : .55;
          piece.position.set(pond.x + Math.cos(a) * pond.rx * r, onEdge ? 0 : pond.surface + .01, pond.z + Math.sin(a) * pond.rz * r);
          piece.rotation.y = a; this.root.add(piece); this.dressing.push(piece);
        }
      }
    }
  }

  private addFish(pond: PondView, species: string, fromEdge = false) {
    const { obj, tail } = this.makeFish(species), a = Math.random() * Math.PI * 2, r = fromEdge ? .85 : Math.random() * .7;
    const [scale, top, wag] = this.kit.ready ? look(species) : [1, .06, .5], depth = top * scale + .015;
    obj.position.set(pond.x + Math.cos(a) * pond.rx * r, pond.surface - depth, pond.z + Math.sin(a) * pond.rz * r);
    this.root.add(obj);
    const fish: Swimmer = { obj, tail, pond, species, heading: Math.random() * 6.28, speed: between(.5, 1.1), goal: null, state: 'swim', t: 0, wig: Math.random() * 10, dart: 0, depth, wag };
    this.fish.push(fish); return fish;
  }

  private inside(pond: PondView, x: number, z: number, margin = .82) {
    const u = (x - pond.x) / (pond.rx * margin), v = (z - pond.z) / (pond.rz * margin), d = Math.hypot(u, v);
    return d <= 1 ? { x, z } : { x: pond.x + u / d * pond.rx * margin, z: pond.z + v / d * pond.rz * margin };
  }

  /** Start a cast from the rod tip toward the water in front of the explorer. */
  begin(pond: PondView, rodTip: T.Vector3, player: T.Vector3, species: string) {
    this.cancel();
    this.active = true; this.pond = pond; this.species = species; this.t = 0; this.phase = 'cast'; this.nibbles = 0; this.missed = 0; this.dip = 0; this.early = 0;
    const dx = pond.x - player.x, dz = pond.z - player.z, length = Math.hypot(dx, dz) || 1;
    const reach = Math.min(3.2, Math.max(1.6, Math.min(pond.rx, pond.rz) * .9));
    const spot = this.inside(pond, player.x + dx / length * reach, player.z + dz / length * reach, .7);
    this.castTo.set(spot.x, pond.surface, spot.z);
    const edge = this.inside(pond, player.x, player.z, .92); this.shore.set(edge.x, pond.surface, edge.z);
    this.castFrom.copy(rodTip);
    this.bobber.visible = true; this.line.visible = true; this.bobber.position.copy(rodTip);
    this.sound('cast');
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
    this.cancel();
  }

  /** The catch leaps out of the water in an arc and lands in the explorer's arms. */
  land(target: () => T.Vector3, done: () => void) {
    const fish = this.interest, pond = this.pond;
    let obj: T.Group;
    if (fish) { this.fish.splice(this.fish.indexOf(fish), 1); obj = fish.obj; if (pond) this.respawns.push({ pond, at: this.clock + 12 }); }
    else { obj = this.makeFish(this.species).obj; obj.position.copy(this.bobber.position); this.root.add(obj); }
    this.interest = null;
    const from = obj.position.clone(); from.y = (pond?.surface ?? 0) + .1;
    this.fx.burst(from, { n: 20, color: ['#ffffff', '#9fe3ff'], glow: true, speed: 5, up: 7, y: 0 });
    this.fx.ring(from, { color: '#ffffff', to: 2, life: .5, y: (pond?.surface ?? 0) + .02 });
    this.sound('splash');
    this.leaps.push({ obj, from, target, t: 0, done });
    this.cancel();
  }

  update(dt: number, time: number, rodTip: T.Vector3, player: T.Vector3, sim: FishingSimulation | null) {
    this.clock += dt;
    for (let i = this.respawns.length - 1; i >= 0; i--) if (this.respawns[i].at <= this.clock) {
      const { pond } = this.respawns[i]; this.respawns.splice(i, 1);
      const species = this.fish.find(f => f.pond === pond)?.species; if (species) this.addFish(pond, species, true);
    }
    for (const fish of this.fish) this.updateFish(fish, dt, time, Math.hypot(player.x - fish.pond.x, player.z - fish.pond.z) < 45);
    this.updateLeaps(dt);
    if (!this.active || !sim || !this.pond) return;
    this.t += dt;
    const pond = this.pond, bob = this.bobber.position;
    if (sim.phase !== this.phase) this.enter(sim.phase, sim);
    if (sim.missedBites > this.missed) {
      this.missed = sim.missedBites;
      if (this.interest) this.flee(this.interest); this.interest = null;
      this.fx.ring(bob, { color: '#ffffff', from: .2, to: .7, life: .4, y: pond.surface + .01 });
    }
    if (sim.earlyPresses > this.early) {
      // Too early: the bobber is tugged toward the explorer and the fish swims off.
      this.early = sim.earlyPresses;
      const dx = player.x - this.castTo.x, dz = player.z - this.castTo.z, d = Math.hypot(dx, dz) || 1;
      const moved = this.inside(pond, this.castTo.x + dx / d * .7, this.castTo.z + dz / d * .7, .7); this.castTo.set(moved.x, pond.surface, moved.z);
      this.fx.ring(this.castTo, { color: '#ffffff', from: .2, to: .8, life: .4, y: pond.surface + .01 });
      if (this.interest) this.flee(this.interest); this.interest = null;
    }
    if (sim.nibbles > this.nibbles) { this.nibbles = sim.nibbles; if (this.interest) this.interest.dart = .3; }
    let float: number | null = pond.surface + Math.sin(time * 2.2) * .02;
    if (this.phase === 'cast') {
      const k = Math.min(1, this.t / .5);
      bob.lerpVectors(this.castFrom, this.castTo, k); bob.y = this.castFrom.y * (1 - k) + pond.surface * k + Math.sin(k * Math.PI) * 1.6; float = null;
    } else if (this.phase === 'waiting' || this.phase === 'nibble') {
      bob.x += (this.castTo.x - bob.x) * Math.min(1, dt * 3); bob.z += (this.castTo.z - bob.z) * Math.min(1, dt * 3);
      if (!this.interest) this.attract();
      if (this.dip > 0) { this.dip -= dt; float -= Math.sin((1 - this.dip / .25) * Math.PI) * .07; }
    } else if (this.phase === 'bite') {
      float = pond.surface - .22 + Math.sin(time * 25) * .03;
      bob.x += Math.sin(time * 9) * dt * .4; bob.z += Math.cos(time * 7) * dt * .4;
      if (Math.random() < dt * 25) this.fx.burst(bob, { n: 1, color: '#ffffff', size: .06, speed: 1.5, up: 2, y: .05 });
    } else if (this.phase === 'fight') { this.updateFight(dt, time, sim, player); float = null; }
    if (float !== null) bob.y += (float - bob.y) * Math.min(1, dt * 12);
    this.bobber.rotation.z = Math.sin(time * 3) * .1;
    this.drawLine(time, rodTip, this.phase === 'fight' ? sim.tension : 0);
  }

  private enter(phase: string, sim: FishingSimulation) {
    const pond = this.pond!, bob = this.bobber.position;
    if (this.phase === 'cast' && phase !== 'cast') {
      this.fx.ring(this.castTo, { color: '#ffffff', from: .2, to: 1.2, life: .6, y: pond.surface + .01 });
      this.fx.burst(this.castTo, { n: 8, color: ['#ffffff', '#bfe9ff'], speed: 2, up: 3, size: .07, y: 0 }); this.sound('pop');
    }
    if (phase === 'bite') {
      this.fx.ring(bob, { color: '#ffffff', from: .2, to: 1, life: .45, y: pond.surface + .01 });
      this.fx.burst(bob, { n: 10, color: ['#ffffff', '#bfe9ff'], glow: true, speed: 3, up: 4, y: 0 }); this.sound('splash');
    }
    if (phase === 'fight') {
      if (!this.interest) this.attract();
      if (this.interest) this.interest.state = 'hooked';
      this.fx.burst(bob, { n: 12, color: ['#ffffff', '#bfe9ff'], glow: true, speed: 3, up: 4, y: 0 }); this.fx.shake(.2);
    }
    this.phase = phase; this.t = 0; void sim;
  }

  /** Pick the fish that will take the bait: one of the chosen species if it lives here. */
  private attract() {
    const pond = this.pond!;
    const same = this.fish.filter(f => f.pond === pond && f.state === 'swim' && f.species === this.species);
    const fish = same.length && Math.random() < .6 ? same[Math.floor(Math.random() * same.length)] : this.addFish(pond, this.species, true);
    fish.state = 'approach'; fish.t = 0; this.interest = fish;
  }

  private updateFight(dt: number, time: number, sim: FishingSimulation, player: T.Vector3) {
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
    fish.obj.rotation.y = fish.heading;
    if (fish.tail) fish.tail.rotation.y = Math.sin(time * 26 + fish.wig) * Math.min(.6, fish.wag * 1.2);
    this.bobber.position.set(p.x, pond.surface - .05, p.z);
    if (surging && Math.random() < dt * 30) this.fx.burst(p, { n: 1, color: ['#ffffff', '#bfe9ff'], size: .09, speed: 2.5, up: 4, y: .3 });
    if (surging && Math.random() < dt * 4) this.fx.ring(p, { color: '#ffffff', from: .3, to: 1, life: .4, y: pond.surface + .01, opacity: .6 });
    if (Math.random() < dt * 3) this.sound('reel');
  }

  private updateFish(fish: Swimmer, dt: number, time: number, near: boolean) {
    fish.obj.visible = near;
    if (!near && fish.state === 'swim') return;
    if (fish.state === 'hooked') return;
    fish.t += dt;
    const p = fish.obj.position, bob = this.bobber.position;
    let goal: { x: number; z: number } | null = null, speed = fish.speed;
    if (fish.state === 'swim') {
      if (!fish.goal || Math.hypot(fish.goal.x - p.x, fish.goal.z - p.z) < .3 || fish.t > 8) {
        const a = Math.random() * 6.28, r = Math.random() * .8; fish.goal = this.inside(fish.pond, fish.pond.x + Math.cos(a) * fish.pond.rx * r, fish.pond.z + Math.sin(a) * fish.pond.rz * r); fish.t = 0;
      }
      goal = fish.goal;
    } else if (fish.state === 'flee') {
      goal = { x: p.x + Math.sin(fish.heading) * 2, z: p.z + Math.cos(fish.heading) * 2 };
      if (fish.t > 1.4) { fish.state = 'swim'; fish.speed = between(.5, 1.1); fish.goal = null; }
    } else {
      const distance = Math.hypot(bob.x - p.x, bob.z - p.z);
      speed = distance > 2 ? 1.1 : .45;
      if (distance > .55 && fish.dart <= 0) goal = { x: bob.x, z: bob.z };
      else fish.heading = turn(fish.heading, Math.atan2(bob.x - p.x, bob.z - p.z), dt * 5);
      if (fish.dart > 0) {
        // A nibble: dart in, tap the bobber, back off.
        fish.dart -= dt; const k = Math.sin((1 - fish.dart / .3) * Math.PI);
        p.x = bob.x - Math.sin(fish.heading) * (.5 - k * .32); p.z = bob.z - Math.cos(fish.heading) * (.5 - k * .32);
        if (fish.dart < .15 && this.dip <= 0) { this.dip = .25; this.fx.ring(bob, { color: '#ffffff', from: .15, to: .5, life: .35, y: fish.pond.surface + .01, opacity: .6 }); }
      }
    }
    if (goal) {
      fish.heading = turn(fish.heading, Math.atan2(goal.x - p.x, goal.z - p.z), dt * 3);
      const next = this.inside(fish.pond, p.x + Math.sin(fish.heading) * speed * dt, p.z + Math.cos(fish.heading) * speed * dt);
      p.x = next.x; p.z = next.z;
    }
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
    const bob = this.bobber.position, hooked = this.phase === 'fight', sag = hooked ? .05 : .5, tremble = hooked ? tension * .06 : 0;
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
