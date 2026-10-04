import * as T from 'three';
import * as M from './model.ts';
import { cageKit, heroKit, wearKit, weaponKit, petKit } from './assets.ts';
import { buildFriend, friendModel, friendSignature, poseFriend, FRIEND_SCALE, type FriendPose } from './friend-view.ts';
import { CAGES, FRIENDS, FRIEND_IDS, cageState, friendsOf, inVillage, nextFriendTask, resting, friendStage, friendHeight, type CageState, type Friend, type FriendId, type FriendTask, type WorkResult } from './friends.ts';
import type { World, Entity } from './world.ts';
import { dropTree } from './dispose-tree.ts';
import { lineFor, type LineScenario } from './friend-lines.ts';
import { HIP, gaitSwing, newGait, stepGait, type Gait } from './walk-cycle.ts';
import { RESCUE_REACH, cageCandidates } from './cage-spots.ts';

/**
 * Rescued friends in the world: the prisoners' cages by their bosses, the rescue, friends following the explorer home,
 * and friends walking between their post and their jobs (rules in friends.ts, looks in friend-view.ts).
 *
 * Draw cost: a cage is two merged vertex-colour meshes (frame, door) from cage.glb; a friend is the explorer's hero
 * kit (baked parts + merged outlines) at half size with no shadow pass and a shared blob. Friends live in their own
 * group in the scene (kept across world rebuilds); light proxy entities in the world root give them labels and taps.
 */
/** Where each friend works and idles: Sprout at the garden's front-right corner (the robot has the left), Clover at
 * the pen's front-left corner (the pen robot has the right), Pepper beside the volcano kitchen (1, 10.5). */
const POSTS: Record<FriendId, { x: number; z: number }> = {
  sprout: { x: M.GARDEN_CENTRE.x + 3.15, z: M.GARDEN_CENTRE.z + 2.6 },
  clover: { x: M.PEN.x - M.PEN.hw + .6, z: M.PEN.z + M.PEN.hd + .55 },
  pepper: { x: -.65, z: 10.9 },
};
/** Outside the cottage door. */
const COTTAGE_DOOR = { x: 0, z: -5.2 };
export const postFor = (id: FriendId) => POSTS[id];
/** A following friend's spot: behind the explorer and to its left (the pet trails to the right), one row per friend. */
export function followGoal(hero: { x: number; z: number }, facing: number, slot: number) {
  const back = 1.6 + slot * .8, side = .8 * (slot % 2 ? -1 : 1);
  return { x: hero.x - Math.sin(facing) * back - Math.cos(facing) * side, z: hero.z - Math.cos(facing) * back + Math.sin(facing) * side };
}
const WORK_TIME: Record<FriendTask['kind'], number> = { harvest: .9, plant: 1.1, collect: .8, feed: 1 };
const POSE_OF: Record<FriendTask['kind'], FriendPose> = { harvest: 'harvest', plant: 'plant', collect: 'collect', feed: 'feed' };

export interface CrewHost {
  world: World;
  /** The player's own save (the world may be showing a host's while visiting). */
  own(): M.SaveState;
  visiting(): boolean;
  flying(): boolean;
  started(): boolean;
  /** The bed the garden robot is walking to, so Sprout picks another. */
  robotBed(): number | undefined;
  /** The empty bed whose seed list the player has open: nobody plants it meanwhile (optional: tests leave it out). */
  heldBed?(): number | undefined;
  animalAt(uid: number): { x: number; z: number } | undefined;
  perform<R>(type: string, payload?: Record<string, unknown>): Promise<R | undefined>;
  rescued(id: FriendId, at: { x: number; z: number }): void;
  locked(id: FriendId): void;
  worked(id: FriendId, task: FriendTask, result: WorkResult, at: { x: number; z: number }): void;
  arrived(ids: FriendId[]): void;
  /** A friend reached a new growth stage (optional: tests and older hosts leave it out). */
  grew?(id: FriendId, stage: number): void;
  /** Outdoor speech bubbles (optional: tests leave them out). */
  chat?: { say(who: string, text: string, at: () => { x: number; z: number }): void; speaking(who: string): boolean };
}

interface Actor {
  id: FriendId; root: T.Group; sig: string; entity: Entity; x: number; z: number; facing: number; t: number; gait: Gait; swing: number; walked?: boolean;
  pose: FriendPose; task: FriendTask | null; workT: number; think: number; cookT: number; cheerT: number; pending: boolean; wander: number;
  /** Home trips: 0 working, 1 walking to the cottage door, 2 inside; `inT` seconds left inside, `jobs` done since the last visit, `tripAt` jobs before the next, `nice` seconds until a friendly word. */
  trip: 0 | 1 | 2; inT: number; jobs: number; tripAt: number; nice: number;
}
interface Cage { id: FriendId; group: T.Group; door: T.Object3D | null; prisoner: T.Group | null; entity: Entity; x: number; z: number; state: CageState; pop?: { t: number; vx: number; vz: number } }

export class FriendCrew {
  readonly group = new T.Group();
  readonly actors = new Map<FriendId, Actor>();
  readonly cages = new Map<FriendId, Cage>();
  private host: CrewHost;
  private builtFor: T.Object3D | null = null; private cageSig = ''; private check = 0;
  private spots = new Map<FriendId, { x: number; z: number }>(); private rescuing = new Set<FriendId>(); private arriving = false; private dt = 0;
  constructor(host: CrewHost) { this.host = host; this.group.name = 'friends'; host.world.scene.add(this.group); }

  private kitSig() { return `${heroKit.ready}${wearKit.ready}${weaponKit.ready}${petKit.ready}`; }

  // ---- Cages ----
  private cageSignature() { const s = this.host.world.state; return FRIEND_IDS.map(id => cageState(s, id)).join() + cageKit.ready + this.kitSig(); }
  private buildCages() {
    const w = this.host.world, s = w.state;
    for (const c of this.cages.values()) { dropTree(c.group); if (c.door && !c.door.parent) dropTree(c.door); w.entities = w.entities.filter(e => e !== c.entity); }
    if (this.builtFor !== w.root) this.spots.clear();
    this.cages.clear(); this.builtFor = w.root; this.cageSig = this.cageSignature();
    for (const id of FRIEND_IDS) {
      const spec = CAGES[id], state = cageState(s, id); if (spec.planet !== w.planet || state === 'hidden') continue;
      const boss = w.enemies.find(e => e.boss && e.type === spec.boss); if (!boss) continue;
      if (!cageKit.requested) void cageKit.load();
      const spot = this.spots.get(id) ?? this.cageSpot(boss.homeX, boss.homeZ), group = new T.Group(); group.name = 'cage-' + id; this.spots.set(id, spot);
      const frame = this.cagePart('cage'); if (frame) group.add(frame);
      const door = state === 'rescued' ? null : this.cagePart('cage_door'); if (door) group.add(door);
      let prisoner: T.Group | null = null;
      if (state !== 'rescued') { prisoner = buildFriend(id); prisoner.position.z = .22; group.add(prisoner); }
      // The door faces the camera (+z). The cage is shown 1.2x (2.5 m) so it reads at the game camera; the prisoner inside stays half size.
      for (const part of [frame, door]) part?.scale.setScalar(1.2);
      // Solid, so the explorer walks round it (the navigation index rebuilds when the obstacle count changes).
      if (!w.obstacles.some(o => o.x === spot.x && o.z === spot.z)) w.obstacle(spot.x, spot.z, .95);
      // An empty cage is only scenery: no label, no tap, no context button.
      const entity = w.addEntity('cage', state === 'open' ? FRIENDS[id].name : 'Locked cage', state === 'open' ? '🗝️' : '🔒', group, spot.x, spot.z, 1, FRIEND_IDS.indexOf(id));
      if (state === 'rescued') w.entities = w.entities.filter(e => e !== entity);
      this.cages.set(id, { id, group, door, prisoner, entity, x: spot.x, z: spot.z, state });
    }
  }
  /** Towards the village from the boss, skipping spots taken by trees and rocks. */
  private cageSpot(bx: number, bz: number) {
    const w = this.host.world, spots = cageCandidates(bx, bz);
    return spots.find(({ x, z }) => !w.obstacles.some(o => Math.hypot(o.x - x, o.z - z) < o.r + 1.1)) ?? spots[0];
  }
  /** One merged mesh per cage model (cage.glb), or simple bars until it loads. */
  private cagePart(name: 'cage' | 'cage_door'): T.Object3D | null {
    const parts = cageKit.ready ? cageKit.mergedParts(name) : undefined, g = new T.Group(); g.name = name;
    if (parts?.length) for (const p of parts) { const m = new T.Mesh(p.geometry, p.material); m.applyMatrix4(p.matrix); m.castShadow = name === 'cage'; g.add(m); }
    else {
      const iron = new T.MeshToonMaterial({ color: '#56607a' }), wood = new T.MeshToonMaterial({ color: '#b5793f' });
      const angles = name === 'cage' ? [70, 100, 130, 160, 190, 220, 250, 280] : [-43, -14, 14, 43];
      for (const d of angles) { const a = d * Math.PI / 180, bar = new T.Mesh(new T.CylinderGeometry(.026, .026, 1.45, 5), iron); bar.position.set(.7 * Math.sin(a), .83, .7 * Math.cos(a)); g.add(bar); }
      if (name === 'cage') { const floor = new T.Mesh(new T.CylinderGeometry(.76, .76, .12, 16), wood); floor.position.y = .06; const roof = new T.Mesh(new T.ConeGeometry(.78, .34, 16), new T.MeshToonMaterial({ color: '#d9534a' })); roof.position.y = 1.72; g.add(floor, roof); }
    }
    return g;
  }
  /** A tap on a cage: rescue when open, a hint when locked. */
  tapCage(e: Entity) {
    const c = [...this.cages.values()].find(c => c.entity === e); if (!c || this.host.visiting()) return;
    if (c.state === 'open') void this.rescue(c.id); else if (c.state === 'locked') this.host.locked(c.id);
  }
  async rescue(id: FriendId) {
    const c = this.cages.get(id), w = this.host.world; if (!c || c.state !== 'open' || this.rescuing.has(id) || this.host.visiting()) return false;
    this.rescuing.add(id);
    try {
      const own = this.host.own(), ok = await this.host.perform<boolean>('rescueFriend', { id });
      if (!ok || this.host.own() !== own || this.cages.get(id) !== c) return false;
      // The door pops off and tumbles away; the prisoner steps out cheering and starts to follow.
      c.state = 'rescued'; w.entities = w.entities.filter(e => e !== c.entity); this.cageSig = this.cageSignature();
      if (c.door) c.pop = { t: 0, vx: (Math.random() - .5) * 2, vz: 2.6 };
      if (c.prisoner) { dropTree(c.prisoner); c.prisoner = null; }
      const a = this.actor(id, own.friends!.find(f => f.id === id)!); a.x = c.x + .9; a.z = c.z + 1.2; a.facing = 0; a.cheerT = 1.6; // out through the door, beside the explorer
      this.host.rescued(id, c); return true;
    } finally { this.rescuing.delete(id); }
  }
  private updateCages(dt: number) {
    const w = this.host.world, t = w.time;
    if (this.builtFor !== w.root || (this.check -= dt) <= 0 && (this.check = .5, this.cageSignature() !== this.cageSig)) this.buildCages();
    for (const c of this.cages.values()) {
      if (c.prisoner) poseFriend(c.prisoner, 'sad', t + FRIEND_IDS.indexOf(c.id) * 1.7);
      if (c.pop && c.door) {
        const p = c.pop; p.t += dt; c.door.position.set(p.vx * p.t, Math.max(0, 2.2 * p.t - 4.9 * p.t * p.t), p.vz * p.t); c.door.rotation.x = -p.t * 4;
        if (p.t > .9) { dropTree(c.door); c.door = null; c.pop = undefined; }
      }
      // Walking up to an open cage frees the prisoner too.
      if (c.state === 'open' && this.host.started() && !this.host.visiting() && Math.hypot(w.position.x - c.x, w.position.z - c.z) < RESCUE_REACH) void this.rescue(c.id);
    }
  }

  // ---- Friends ----
  private actor(id: FriendId, f: Friend): Actor {
    let a = this.actors.get(id);
    const stage = friendStage(f), sig = friendSignature(f) + this.kitSig();
    if (a && a.sig !== sig) {
      const grew = stage > (a.root.userData.stage ?? 0);
      dropTree(a.root); a.root = this.dress(id, f); a.sig = sig; this.group.add(a.root); this.fitProxy(a.entity.mesh, stage);
      // The "grew up!" moment: a cheer, a sparkle and a line (main.ts shows it) when the saved stage rises.
      // Indoors the effects layer draws in the cottage's scene: an outdoor friend's sparkles would pop up among the furniture.
      if (grew) { a.cheerT = 1.8; if (!this.host.world.interior) this.host.world.fx?.burst(new T.Vector3(a.x, 1, a.z), { n: 16, color: ['#ffe66d', '#ffffff', '#9be15d'], glow: true, speed: 3, up: 6 }); this.host.grew?.(id, stage); }
    }
    if (a) return a;
    const proxy = new T.Group(); proxy.name = 'friend-proxy-' + id;
    // An undrawn box of the friend's height, so the name label (main.ts labelHeight) sits just above its head.
    PROXY_BOX ??= new T.BoxGeometry(.5, 1.05, .5).translate(0, .52, 0); PROXY_BOX.userData.sharedKit = true;
    const box = new T.Mesh(PROXY_BOX); box.visible = false; proxy.add(box); this.fitProxy(proxy, stage);
    a = { id, root: this.dress(id, f), sig, entity: { id: 'friend:' + id, kind: 'friend', name: FRIENDS[id].name, icon: ICONS[f.role], mesh: proxy, x: 0, z: 0, radius: .35, index: FRIEND_IDS.indexOf(id) },
      x: POSTS[id].x, z: POSTS[id].z, facing: 0, t: Math.random() * 9, gait: newGait(), swing: .6, pose: 'idle', task: null, workT: 0, think: 0, cookT: 0, cheerT: 0, pending: false, wander: 0, trip: 0, inT: 0, jobs: 0, tripAt: 2 + Math.floor(Math.random() * 3) + FRIEND_IDS.indexOf(id), nice: 6 + Math.random() * 10 };
    this.group.add(a.root); this.actors.set(id, a); return a;
  }
  /** The same model as in the cottage (friend-view.ts friendModel): gear, work hat, look and growth stage. */
  private dress(id: FriendId, f: Friend) { const r = friendModel(f); r.userData.friend = id; return r; }
  /** The label box grows with the friend, so the name stays just above its head. */
  private fitProxy(proxy: T.Object3D, stage: number) { proxy.scale.set(1, friendHeight(stage) / friendHeight(0), 1); }
  private hide(a: Actor) { a.root.visible = false; this.setEntity(a, false); }
  private setEntity(a: Actor, on: boolean) {
    const w = this.host.world, has = w.entities.includes(a.entity);
    on &&= !w.interior; // indoors the house shows its own friends; outdoor labels and taps would leak through
    if (on && !has) { w.entities.push(a.entity); w.root.add(a.entity.mesh); }
    else if (!on && has) { w.entities = w.entities.filter(e => e !== a.entity); a.entity.mesh.removeFromParent(); }
    if (on) { a.entity.x = a.x; a.entity.z = a.z; a.entity.mesh.position.set(a.x, 0, a.z); }
  }

  update(dt: number) {
    this.dt = dt;
    const w = this.host.world, s = w.state, own = this.host.own(), visiting = this.host.visiting(), mine = s === own && !visiting;
    this.group.visible = !this.host.flying();
    if (!this.host.flying()) this.updateCages(dt);
    const friends = friendsOf(s), now = Date.now();
    for (const [id, a] of this.actors) if (!friends.some(f => f.id === id)) { dropTree(a.root); this.setEntity(a, false); this.actors.delete(id); }
    let slot = 0;
    for (const f of friends) {
      const a = this.actor(f.id, f); a.t += dt;
      if (this.host.flying()) { this.hide(a); continue; }
      if (!f.home) {
        // Following: only the player's own friends, on whichever planet the explorer is.
        if (!mine) { this.hide(a); continue; }
        a.root.visible = true; this.setEntity(a, false); a.task = null;
        const goal = followGoal(w.position, w.facing, slot++);
        if (Math.hypot(goal.x - a.x, goal.z - a.z) > 22) { a.x = goal.x; a.z = goal.z; } // after landing or a long dash
        if (a.cheerT > 0) { a.cheerT -= dt; this.place(a, 'cheer'); continue; }
        this.walk(a, goal, dt, 7.5, .25); continue;
      }
      if (w.planet !== 'home') { this.hide(a); continue; }
      a.root.visible = true; this.setEntity(a, true);
      this.work(a, f, s, mine, dt, now);
    }
    if (mine && !this.arriving && s.planet === 'home' && w.planet === 'home' && friends.some(f => !f.home) && inVillage(w.position)) {
      this.arriving = true; const at = { x: w.position.x, z: w.position.z };
      void this.host.perform<FriendId[]>('friendsArrive', at).then(ids => { if (ids?.length) this.host.arrived(ids); }).finally(() => { this.arriving = false; });
    }
  }
  /** Moves towards `goal` and poses; true once within `stand` of it. */
  private walk(a: Actor, goal: { x: number; z: number }, dt: number, speed = 1.9, stand = .06) {
    const dx = goal.x - a.x, dz = goal.z - a.z, d = Math.hypot(dx, dz);
    // A margin, not d > stand: the stand point moves with the walker, so stepping exactly d - stand would approach it forever.
    if (d > stand + .02) {
      const step = Math.min(d - stand, Math.max(speed * .5, Math.min(speed, d * 2.5)) * dt); a.x += dx / d * step; a.z += dz / d * step;
      const leg = HIP * a.root.scale.x; stepGait(a.gait, step, dt, leg); a.swing = gaitSwing(step / Math.max(dt, 1e-4), leg); a.walked = true;
      this.turn(a, Math.atan2(dx, dz), dt); this.place(a, 'walk'); return false;
    }
    return true;
  }
  private turn(a: Actor, to: number, dt: number) { a.facing += Math.atan2(Math.sin(to - a.facing), Math.cos(to - a.facing)) * Math.min(1, dt * 10); }
  private place(a: Actor, pose: FriendPose) {
    a.pose = pose; a.root.position.set(a.x, 0, a.z); a.root.rotation.y = a.facing; if (!a.walked) stepGait(a.gait, 0, this.dt, 1); a.walked = false; // standing still: the last steps fade out
    poseFriend(a.root, pose, a.t, a.gait, a.swing);
    if (this.host.world.entities.includes(a.entity)) { a.entity.x = a.x; a.entity.z = a.z; a.entity.mesh.position.set(a.x, 0, a.z); }
  }
  private target(s: M.SaveState, a: Actor, task: FriendTask) {
    const at = 'index' in task ? s.plots[task.index] && M.bedPosition(s, task.index) : this.host.animalAt(task.uid);
    if (!at) return null;
    const dx = a.x - at.x, dz = a.z - at.z, d = Math.hypot(dx, dz) || 1, stand = 'index' in task ? .8 : .7;
    return { stand: { x: at.x + dx / d * stand, z: at.z + dz / d * stand }, at };
  }
  /** At home: think, walk to the job, pose, then do it (owner) or just pretend (a visitor's copy). */
  private work(a: Actor, f: Friend, s: M.SaveState, act: boolean, dt: number, now: number) {
    const post = POSTS[a.id];
    if (a.cheerT > 0) { a.cheerT -= dt; this.place(a, 'cheer'); return; }
    if (f.role === 'cook' && (f.paused || resting(f, now))) {
      // The cook off duty walks into the cottage and stays there.
      a.task = null; if (a.trip === 2 || this.walk(a, COTTAGE_DOOR, dt)) this.goInside(a, 0); return;
    }
    if (a.trip === 2) { // inside the cottage on a visit: wait it out, then come out (the cook in a new outfit)
      if ((a.inT -= dt) > 0) { this.goInside(a, a.inT); return; }
      this.comeOut(a, f); return;
    }
    if (a.trip === 1) { a.task = null; if (this.walk(a, COTTAGE_DOOR, dt)) this.goInside(a, 12 + Math.random() * 16); return; }
    if (f.paused) { a.task = null; if (this.walk(a, post, dt)) this.place(a, 'idle'); return; }
    // A friendly word when the explorer is near (the pool for it is in friend-lines.ts).
    if ((a.nice -= dt) <= 0) { a.nice = 14 + Math.random() * 16; if (Math.hypot(a.x - this.host.world.position.x, a.z - this.host.world.position.z) < 3.6) this.speak(a, 'NICE'); }
    if (a.workT > 0) {
      a.workT -= dt; const tg = a.task && this.target(s, a, a.task); if (tg) this.turn(a, Math.atan2(tg.at.x - a.x, tg.at.z - a.z), dt);
      this.place(a, a.task ? POSE_OF[a.task.kind] : 'idle');
      if (a.workT <= 0 && a.task) {
        const task = a.task; a.task = null; a.think = .4;
        if (act && !a.pending && !(task.kind === 'plant' && task.index === this.host.heldBed?.())) { // the player opened this bed's seed list meanwhile: it is theirs
          a.pending = true; const own = s;
          void this.host.perform<WorkResult>('friendWork', { id: a.id, kind: task.kind, ...('index' in task ? { index: task.index } : { uid: task.uid }) })
            .then(r => { if (r && !r.skipped && this.host.own() === own) { this.host.worked(a.id, task, r, { x: a.x, z: a.z }); if (a.id === 'pepper') a.cookT = 2.4; a.jobs++; this.speak(a, this.scenarioOf(f.role, task.kind)); } })
            .finally(() => { a.pending = false; });
        } else if (!act && a.id === 'pepper') a.cookT = 2.4;
      }
      return;
    }
    if ((a.think -= dt) <= 0 && !a.task && a.cookT <= 0) {
      a.think = .5;
      if (act && !a.pending) a.task = nextFriendTask(s, a.id, a, now, a.id === 'sprout' ? this.host.robotBed() : a.id === 'pepper' ? this.bedOf('sprout') : undefined, this.host.heldBed?.());
      else if (!act && (a.wander -= .5) <= 0) {
        // A visitor's copy never acts: it potters between the beds or animals now and then.
        a.wander = 4 + Math.random() * 4;
        const animals = M.penBuilt(s) ? M.farmOf(s).animals.filter(x => x.kind !== 'dog') : [];
        if (f.role === 'farm' || f.role === 'cook' && animals.length && Math.random() < .5) { const x = animals[Math.floor(Math.random() * animals.length)]; a.task = x ? { kind: 'collect', uid: x.uid } : null; }
        else if (s.plots.length) a.task = { kind: f.role === 'garden' ? 'plant' : 'harvest', index: Math.floor(Math.random() * s.plots.length) };
      }
    }
    // After a few jobs, a friend walks home for a rest (and comes out later), as a person would.
    if (act && !a.task && !a.pending && a.workT <= 0 && a.jobs >= a.tripAt && inVillage(a)) { a.trip = 1; this.speak(a, 'HOME'); return; }
    const tg = a.task && this.target(s, a, a.task);
    if (a.task && !tg) a.task = null;
    if (a.task && tg) { if (this.walk(a, tg.stand, dt)) a.workT = WORK_TIME[a.task.kind] * (act ? 1 : 2); return; }
    // Back at the post: the cook stirs her pot after each gathering (and keeps a pot going while she waits).
    if (this.walk(a, post, dt)) {
      if (a.id === 'pepper') { a.cookT = Math.max(0, a.cookT - dt); this.turn(a, Math.atan2(1 - a.x, 10.5 - a.z), dt); this.place(a, 'cook'); }
      else { this.turn(a, 0, dt * .3); this.place(a, 'idle'); }
    } else a.cookT = 0;
  }
  private scenarioOf(role: Friend['role'], kind: FriendTask['kind']): LineScenario {
    return role === 'cook' && (kind === 'harvest' || kind === 'collect') ? 'COOK' : kind === 'harvest' ? 'HARVEST' : kind === 'plant' ? 'PLANT' : kind === 'collect' ? 'COLLECT' : 'FEED';
  }
  private speak(a: Actor, scenario: LineScenario) {
    const chat = this.host.chat; if (!chat || this.host.world.interior || chat.speaking(a.id)) return;
    chat.say(a.id, lineFor(a.id, scenario), () => ({ x: a.x, z: a.z }));
  }
  /** In the cottage: hidden outdoors (its own scene shows it indoors). */
  private goInside(a: Actor, left: number) { a.trip = 2; a.inT = left; this.place(a, 'idle'); a.root.visible = false; this.setEntity(a, false); }
  /** Out of the cottage door: a new outfit for the cook, a word about it. */
  private comeOut(a: Actor, f: Friend) {
    a.trip = 0; a.jobs = 0; a.tripAt = 3 + Math.floor(Math.random() * 3); a.x = COTTAGE_DOOR.x; a.z = COTTAGE_DOOR.z + .5; a.root.visible = true; this.setEntity(a, true);
    if (f.role === 'cook' && this.host.own().friends?.includes(f)) void this.host.perform('friendOutfit', { id: a.id, pick: Math.random() }).then(ok => { if (ok) this.speak(a, 'OUTFIT'); });
  }
  private bedOf(id: FriendId) { const t = this.actors.get(id)?.task; return t && 'index' in t ? t.index : undefined; }
  /** For the status line and tests. */
  activity(id: FriendId): string { const a = this.actors.get(id); return !a ? 'away' : a.pose; }
}
let PROXY_BOX: T.BoxGeometry | null = null;
const ICONS: Record<Friend['role'], string> = { garden: '🌱', farm: '🐄', cook: '🍳' };
export { FRIEND_SCALE };
