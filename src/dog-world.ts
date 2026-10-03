import type * as T from 'three';
import { coatOf, PEN, type SaveState } from './model.ts';
import { farmKit, type FarmPenView } from './farm-view.ts';
import { DogFollowView, type DogPose } from './dog-follow.ts';
import { dogFollows, leashSpot, newDogLink, stepDog, trailSpot, DOG_FAR, type DogLink } from './guard-dog.ts';

/** What the dog needs from the world (world.ts passes itself). */
export interface DogHost {
  scene: T.Scene; planet: string; position: T.Vector3; facing: number; boarded: boolean; time: number; state: SaveState;
  interior?: unknown; farmView?: FarmPenView;
  remotePlayers?: Map<string, { mesh: T.Object3D; pose: { facing?: number; dog?: number | null; planet?: string } }>;
  /** The explorer's own dog coat, or null (no dog, or visiting someone else's garden); defaults to the world's save. */
  ownDog?: () => number | null;
}
/** Your dog's coat from a save, or null without a dog. */
export function dogCoatOf(s: SaveState) { const a = s.farm?.animals?.find(x => x.kind === 'dog'); return a ? coatOf(a) : null; }

/**
 * Ties guard-dog.ts to the world each frame: hands your dog between the pen (FarmPenView) and the follower view,
 * and gives every visible explorer whose pose says `dog` a follower too.
 */
export class GuardDogs {
  readonly view = new DogFollowView();
  readonly link: DogLink = newDogLink();
  private planet = '';
  private kit = farmKit.ready;
  private remote = new Map<string, DogLink>();
  private poses: DogPose[] = [];
  /** Where your dog is now: 'pen', 'follow' or 'return' (for probes and tests). */
  get place() { return this.link.place; }
  update(h: DogHost, dt: number) {
    if (this.view.group.parent !== h.scene) h.scene.add(this.view.group);
    if (this.kit !== farmKit.ready) { this.kit = farmKit.ready; this.view.refresh(); }
    const poses = this.poses; poses.length = 0;
    const coat = h.ownDog ? h.ownDog() : dogCoatOf(h.state), pen = h.planet === 'home' && h.farmView?.isBuilt ? h.farmView : null;
    if (coat === null) { this.link.place = 'pen'; pen?.setDogAway(false); }
    else {
      // A new world (a landing, a visit ending): a dog out with you lands beside you.
      if (this.planet !== h.planet && this.link.place !== 'pen') { const at = trailSpot(h.position, h.facing); this.link.x = at.x; this.link.z = at.z; this.link.speed = 0; }
      const follow = dogFollows(h.planet, h.position, !!h.interior);
      const leash = pen ? leashSpot(PEN, h.state.farm?.speciesPens?.dog) : null;
      const place = stepDog(this.link, dt, follow, h.position, h.facing, pen && this.link.place === 'pen' ? pen.dogSpot() : null, leash);
      // Sent home from far away (a respawn at home): it is simply back at its pen.
      if (place === 'return' && leash && Math.hypot(this.link.x - leash.x, this.link.z - leash.z) > DOG_FAR * 1.6) { this.link.place = 'pen'; this.link.x = leash.x; this.link.z = leash.z; }
      pen?.setDogAway(this.link.place !== 'pen', this.link);
      if (this.link.place !== 'pen' && !h.boarded) poses.push({ key: 'me', x: this.link.x, z: this.link.z, heading: this.link.heading, coat });
    }
    this.planet = h.planet;
    for (const [id, r] of h.remotePlayers ?? []) {
      const dog = r.pose.dog;
      if (typeof dog !== 'number' || !r.mesh.visible) { this.remote.delete(id); continue; }
      let l = this.remote.get(id); if (!l) { l = newDogLink(); this.remote.set(id, l); }
      const facing = r.pose.facing ?? 0, at = r.mesh.position;
      stepDog(l, dt, true, at, facing, null, null);
      poses.push({ key: id, x: l.x, z: l.z, heading: l.heading, coat: Math.max(0, Math.min(2, dog | 0)) });
    }
    for (const id of this.remote.keys()) if (!h.remotePlayers?.has(id)) this.remote.delete(id);
    this.view.update(dt, h.time, poses);
  }
  dispose() { this.view.dispose(); }
}
