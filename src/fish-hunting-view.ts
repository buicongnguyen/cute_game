import * as T from 'three';
import { isShared } from './assets.ts';
import { fishLook, type FishingView } from './fishing-view.ts';
import { fishHuntKey, fishHuntTargets, type FishHuntTarget, type HuntPond, type HuntingState } from './fish-hunting.ts';
import { createHarpoonProjectile } from './harpoon-art.ts';
import { guardianTarget } from './lake-guardian.ts';

type Point = { x: number; z: number };
type FishModel = { obj: T.Group; tail: T.Object3D | null; id: string };
/** Only the selected pond uses these targets. Rewards never depend on an animation finishing. */
export class FishHuntingView {
  readonly group = new T.Group();
  pond: HuntPond | null = null;
  targets: FishHuntTarget[] = [];
  private fish: FishModel[] = [];
  private projectile = createHarpoonProjectile();
  private shot: { from: T.Vector3; to: T.Vector3; elapsed: number } | null = null;
  private kitReady = false;
  private makeFish: (id: string) => FishModel;
  private fishing: FishingView;
  private offset = 0;
  /** The rod view's fish poses at handover; targets ease in from them instead of popping. */
  private from: Array<{ x: number; z: number; heading: number }> = [];
  private blend = 1;
  private world: unknown;
  private owner: unknown;

  constructor(scene: T.Scene, fishing: FishingView) {
    this.fishing = fishing; this.makeFish = id => ({ ...fishing.makeFish(id), id });
    this.group.name = 'fish-hunting'; this.projectile.visible = false;
    this.group.add(this.projectile); scene.add(this.group);
  }
  now() { return Date.now() + this.offset; }
  syncClock(serverNow: number) { if (Number.isFinite(serverNow)) this.offset = serverNow - Date.now(); }
  private dispose(f: FishModel) {
    this.group.remove(f.obj);
    f.obj.traverse(o => { if (o instanceof T.Mesh) {
      if (!isShared(o.geometry)) o.geometry.dispose();
      for (const material of Array.isArray(o.material) ? o.material : [o.material]) if (!isShared(material)) material.dispose();
    } });
  }
  private clearFish() { for (const f of this.fish) this.dispose(f); this.fish = []; this.targets = []; }
  update(dt: number, pond: HuntPond | null, hunting: HuntingState | undefined, kitReady: boolean, world: unknown, owner: unknown) {
    if (world !== this.world || owner !== this.owner) {
      this.world = world; this.owner = owner; this.offset = 0; this.shot = null; this.projectile.visible = false;
      this.clearFish(); this.pond = null;
    }
    if (pond?.id !== this.pond?.id || this.kitReady !== kitReady) {
      if (this.pond && pond?.id !== this.pond.id) this.fishing.adoptPoses?.(this.pond.id, this.fish.map(f => ({ x: f.obj.position.x, z: f.obj.position.z, heading: f.obj.rotation.y, id: f.id })));
      if (pond && pond.id !== this.pond?.id) { this.from = this.fishing.ordinaryPoses?.(pond.id) ?? []; this.blend = this.from.length ? 0 : 1; }
      this.clearFish(); this.pond = pond; this.kitReady = kitReady;
      if (!pond) { this.shot = null; this.projectile.visible = false; }
      if (pond) for (const target of fishHuntTargets(pond, this.now(), hunting)) {
        const model = this.makeFish(target.id); this.fish.push(model); this.group.add(model.obj);
      }
    }
    this.fishing.huntingPondId = pond?.id ?? null;
    const now = this.now(); this.blend = Math.min(1, this.blend + dt / .6);
    const k = this.blend * this.blend * (3 - 2 * this.blend);
    this.targets = pond ? fishHuntTargets(pond, now, hunting) : [];
    for (const target of this.targets) {
      let f = this.fish[target.slot]; if (!f) continue;
      // A caught slot restocks with a newly rolled species (fish-hunting.ts): swap the model while the slot is empty.
      if (f.id !== target.id) { const next = this.makeFish(target.id); next.obj.position.copy(f.obj.position); next.obj.rotation.y = f.obj.rotation.y; this.dispose(f); this.fish[target.slot] = f = next; this.group.add(next.obj); }
      f.obj.visible = now >= (hunting?.readyAt[fishHuntKey(pond!.id, target.slot)] ?? 0);
      const [scale, top, wag] = fishLook(target.id);
      // Same swim depth as the rod view's fish (FishingView.addFish), so the pond looks the same with either gear.
      const start = k < 1 ? this.from[target.slot] : undefined;
      f.obj.position.set(start ? start.x + (target.x - start.x) * k : target.x, pond!.surface - top * scale - .015, start ? start.z + (target.z - start.z) * k : target.z);
      f.obj.rotation.y = start ? start.heading + Math.atan2(Math.sin(target.facing - start.heading), Math.cos(target.facing - start.heading)) * k : target.facing;
      if (f.tail) f.tail.rotation.y = Math.sin(now / 200 + target.slot) * wag;
    }
    this.targets = this.targets.filter(t => this.fish[t.slot]?.obj.visible);
    // The Lake Guardian is drawn by LakeGuardianView (shown with any gear); here it is only a target to aim at.
    const guardian = pond ? guardianTarget(pond, now, hunting) : null; if (guardian) this.targets.push(guardian);
    if (this.shot) {
      this.shot.elapsed += dt; const t = Math.min(1, this.shot.elapsed / .28);
      this.projectile.position.lerpVectors(this.shot.from, this.shot.to, t);
      this.projectile.position.y += Math.sin(t * Math.PI) * .5;
      this.projectile.lookAt(this.shot.to);
      if (t === 1) { this.shot = null; this.projectile.visible = false; }
    }
  }
  nearest(aim: Point, from: Point, range: number) {
    return this.targets.filter(t => Math.hypot(t.x - from.x, t.z - from.z) <= range)
      .sort((a, b) => Math.hypot(a.x - aim.x, a.z - aim.z) - Math.hypot(b.x - aim.x, b.z - aim.z))[0] ?? null;
  }
  throw(from: Point, aim: Point) {
    this.shot = { from: new T.Vector3(from.x, 1.1, from.z), to: new T.Vector3(aim.x, this.pond?.surface ?? .3, aim.z), elapsed: 0 };
    this.projectile.position.copy(this.shot.from); this.projectile.lookAt(this.shot.to); this.projectile.visible = true;
  }
}
