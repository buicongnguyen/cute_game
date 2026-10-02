/**
 * Going in and out of the cottage. The world keeps its outdoor build untouched while the explorer is
 * inside: entering swaps in the interior's entities and furniture obstacles, moves the explorer, its pet,
 * the tap marker and other explorers into the interior scene (world.render draws that scene instead) and
 * zooms the camera in; leaving restores everything and stands the explorer in front of the cottage door.
 * Creatures and hazards stay outdoors: none of them is in the interior's entities or scene.
 */
import * as T from 'three';
import { groundAt } from './camera-rig.ts';
import type { Entity, World } from './world.ts';
import { FRIEND_SPOTS, HOUSE, furnitureObstacles, walkable } from './house.ts';
import { ACTIVITIES, type ActivityId } from './house-activities.ts';
import { HouseView, friendName } from './house-view.ts';
import { friendsOf, type Friend, type FriendId } from './friends.ts';

/** The parts of World the house touches (tests pass a real World built without WebGL). */
export type HouseHost = Pick<World, 'scene' | 'root' | 'player' | 'companion' | 'marker' | 'ring' | 'remoteRoot' | 'fx' | 'entities' | 'obstacles' | 'position' | 'destination' | 'route' | 'selected' | 'cameraTarget' | 'cameraFocus' | 'zoom' | 'facing' | 'interior' | 'state'> & { resize(): void };
export interface FriendEntity extends Entity { friendId: FriendId }
export interface ActivityEntity extends Entity { activity: ActivityId }

/**
 * Where the camera looks indoors: at the explorer, but slid so the view never runs far past the house
 * (a dollhouse on a dark table, not a corner of floor and a lot of black). Centred when the view is wider.
 */
export function houseFocus(p: { x: number; z: number }, aspect: number, zoom: number, out = new T.Vector3()) {
  const b = HOUSE.bounds, left = groundAt(aspect, zoom, -1, 0).x, right = groundAt(aspect, zoom, 1, 0).x, far = groundAt(aspect, zoom, 0, 1).z, near = groundAt(aspect, zoom, 0, -1).z;
  // When the view is wider than the house the limits cross: then it drifts a little with the explorer around the middle.
  const clamp = (v: number, lo: number, hi: number) => { const mid = (lo + hi) / 2, reach = lo > hi ? (lo - hi) / 4 : (hi - lo) / 2; return Math.min(mid + reach, Math.max(mid - reach, v)); };
  return out.set(clamp(p.x, b.x0 - .6 - left, b.x1 + .6 - right), 0, clamp(p.z, b.z0 - 2.2 - far, b.z1 + .6 - near));
}
const innerAspect = () => typeof innerWidth === 'number' && innerHeight > 0 ? innerWidth / innerHeight : 16 / 9;
export class HouseSession {
  view = new HouseView();
  private saved: { entities: Entity[]; obstacles: World['obstacles']; zoom: number } | null = null;
  private host: HouseHost | null = null;
  get inside() { return !!this.saved; }
  /** The camera's indoor target (houseFocus), followed through world.cameraFocus. */
  focus = new T.Vector3();
  /** Re-aims the camera; call once a frame while inside. */
  frame(aspect: number) {
    const h = this.host; if (!h || !this.saved) return; houseFocus(h.position, aspect, h.zoom, this.focus); h.cameraFocus = this.focus;
    // Friends walk between hangouts: their tap circles follow them (no allocation).
    for (const e of h.entities) if (e.kind === 'friend') { const p = e.mesh.position; e.x = p.x; e.z = p.z; }
  }
  /** Moves the explorer and its pet (rebuilt on every gear change) back under the interior. */
  private adopt() { const h = this.host; if (!h || !this.saved) return; this.view.root.add(h.player, h.companion); }
  enter(host: HouseHost) {
    if (this.saved) return;
    this.host = host;
    this.saved = { entities: host.entities, obstacles: host.obstacles, zoom: host.zoom };
    this.syncFriends();
    host.entities = this.entities(); host.obstacles = this.obstacles();
    host.interior = { scene: this.view.scene, root: this.view.root, walkable, drop: () => this.drop(), adopt: () => this.adopt() };
    this.adopt();
    this.view.scene.add(host.marker, host.ring, host.remoteRoot); host.fx?.attach(this.view.scene);
    host.position.set(HOUSE.spawn.x, 0, HOUSE.spawn.z); host.facing = Math.PI; host.destination = null; host.route = []; host.selected = null;
    host.marker.visible = false; host.ring.visible = false;
    host.zoom = innerAspect() > 1 ? HOUSE.wideZoom : HOUSE.zoom; host.resize();
    host.cameraTarget.copy(houseFocus(host.position, innerAspect(), host.zoom, this.focus)); host.cameraFocus = this.focus;
    void this.view.refine();
  }
  /** Back outside in front of the door. */
  leave() {
    const host = this.host; if (!host || !this.saved) return;
    host.interior = null; this.drop();
    host.position.set(HOUSE.outside.x, 0, HOUSE.outside.z); host.facing = 0; host.cameraTarget.copy(host.position);
  }
  /** Undo the swap (also when the world rebuilt itself under us: then its own lists are already new). */
  private drop() {
    const host = this.host, saved = this.saved; if (!host || !saved) return;
    this.saved = null;
    if (host.entities.some(e => e.mesh.parent === this.view.root)) { host.entities = saved.entities; host.obstacles = saved.obstacles; }
    if (host.player.parent === this.view.root) host.root.add(host.player);
    if (host.companion.parent === this.view.root) host.root.add(host.companion);
    host.scene.add(host.marker, host.ring, host.remoteRoot); host.fx?.attach(host.scene);
    host.destination = null; host.route = []; host.selected = null; host.marker.visible = false; host.ring.visible = false;
    if (host.cameraFocus === this.focus) host.cameraFocus = null;
    host.zoom = saved.zoom; host.resize();
  }
  /** The door, the wardrobe and mirror, and each friend: tappable things inside. */
  private entities(): Entity[] {
    const out: Entity[] = [], add = (kind: string, name: string, icon: string, mesh: T.Group, x: number, z: number, radius: number, id: string) => {
      if (mesh.parent !== this.view.root) { mesh.position.set(x, mesh.position.y, z); this.view.root.add(mesh); }
      const e: Entity = { id, kind, name, icon, mesh, x, z, radius }; mesh.userData.entity = e; out.push(e); return e;
    };
    add('house-door', 'Outside', '🚪', this.view.door, HOUSE.door.x, HOUSE.door.z, .8, 'house:door');
    // Every activity (house-activities.ts) is tappable; stove, workbench and globe carry main.ts's own kinds.
    for (const a of ACTIVITIES) {
      const anchor = this.anchors.get(a.id) ?? new T.Group(); this.anchors.set(a.id, anchor); anchor.position.y = a.y;
      (add(a.entity, a.name, a.icon, anchor, a.at.x, a.at.z, .7, 'house:' + a.id) as ActivityEntity).activity = a.id;
    }
    for (const view of this.view.friends.values()) {
      const e = add('friend', friendName(view.id), '🧑‍🌾', view.group, view.spot.x, view.spot.z, .55, 'house:friend:' + view.id) as FriendEntity;
      e.friendId = view.id;
    }
    // The door hinge sits off its centre: keep its tap circle on the doorway.
    this.view.door.position.set(.53, 0, HOUSE.bounds.z1);
    return out;
  }
  private anchors = new Map<string, T.Group>();
  /** Furniture only: friends walk between hangouts, so they are not fixed obstacles. */
  private obstacles() { return furnitureObstacles(); }
  /** Friends shown match the save; re-run after a give or take, or a rescue. */
  syncFriends(list: Friend[] = this.host ? friendsOf(this.host.state).filter(f => f.home) : []) {
    const before = [...this.view.friends.values()].map(v => v.group);
    this.view.syncFriends(list.slice(0, FRIEND_SPOTS.length));
    const after = [...this.view.friends.values()].map(v => v.group);
    if (this.host && this.saved && (before.length !== after.length || before.some((g, i) => g !== after[i]))) { this.host.entities = this.entities(); this.host.obstacles = this.obstacles(); }
  }
}
