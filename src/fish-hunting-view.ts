import * as T from 'three';
import { isShared } from './assets.ts';
import { fishLook, type FishingView } from './fishing-view.ts';
import { fishHuntKey, fishHuntTargets, type FishHuntTarget, type HuntPond, type HuntingState } from './fish-hunting.ts';
import { createHarpoonProjectile } from './harpoon-art.ts';

type Point = { x: number; z: number };
type FishModel = { obj: T.Group; tail: T.Object3D | null };
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
  private world: unknown;
  private owner: unknown;

  constructor(scene: T.Scene, fishing: FishingView) {
    this.fishing = fishing; this.makeFish = id => fishing.makeFish(id);
    this.group.name = 'fish-hunting'; this.projectile.visible = false;
    this.group.add(this.projectile); scene.add(this.group);
  }
  now() { return Date.now() + this.offset; }
  syncClock(serverNow: number) { if (Number.isFinite(serverNow)) this.offset = serverNow - Date.now(); }
  private clearFish() {
    for (const f of this.fish) {
      this.group.remove(f.obj);
      f.obj.traverse(o => { if (o instanceof T.Mesh) {
        if (!isShared(o.geometry)) o.geometry.dispose();
        for (const material of Array.isArray(o.material) ? o.material : [o.material]) if (!isShared(material)) material.dispose();
      } });
    }
    this.fish = []; this.targets = [];
  }
  update(dt: number, pond: HuntPond | null, hunting: HuntingState | undefined, kitReady: boolean, world: unknown, owner: unknown) {
    if (world !== this.world || owner !== this.owner) {
      this.world = world; this.owner = owner; this.offset = 0; this.shot = null; this.projectile.visible = false;
      this.clearFish(); this.pond = null;
    }
    if (pond?.id !== this.pond?.id || this.kitReady !== kitReady) {
      this.clearFish(); this.pond = pond; this.kitReady = kitReady;
      if (!pond) { this.shot = null; this.projectile.visible = false; }
      if (pond) for (const target of fishHuntTargets(pond, this.now())) {
        const model = this.makeFish(target.id); this.fish.push(model); this.group.add(model.obj);
      }
    }
    this.fishing.huntingPondId = pond?.id ?? null;
    const now = this.now();
    this.targets = pond ? fishHuntTargets(pond, now) : [];
    for (const target of this.targets) {
      const f = this.fish[target.slot]; if (!f) continue;
      f.obj.visible = now >= (hunting?.readyAt[fishHuntKey(pond!.id, target.slot)] ?? 0);
      const [scale, top, wag] = fishLook(target.id);
      f.obj.position.set(target.x, pond!.surface - top * scale - .02, target.z);
      f.obj.rotation.y = target.facing;
      if (f.tail) f.tail.rotation.y = Math.sin(now / 200 + target.slot) * wag;
    }
    this.targets = this.targets.filter(t => this.fish[t.slot]?.obj.visible);
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
