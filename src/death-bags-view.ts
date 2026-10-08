import * as T from 'three';
import { toonMaterial } from './toon.ts';
import { liveBags, bagTimeLeft, bagAlive, DEATH_BAG_REACH, type DeathBag } from './death-bags.ts';
import { fits, BAG_FULL } from './storage-slots.ts';
import type { SaveState } from './model.ts';

/**
 * The dropped bags in the world (death-bags.ts): a little pink backpack on a glowing ring where the explorer fell, a
 * "🎒 Your bag · 23h 05m" tag over it, and a pickup when the explorer walks up to it (or taps it). A full backpack takes
 * what fits and leaves the rest in the bag, as the reference does.
 *
 * Cheap: five shared meshes per bag (shared geometry and materials, `sharedKit`, so a removed bag frees nothing it
 * shares), at most ten bags, and the tags are plain DOM nodes moved only while a bag is near.
 */
const shared = <R extends { userData: Record<string, unknown> }>(r: R) => { r.userData.sharedKit = true; return r; };
let kit: { body: T.BufferGeometry; flap: T.BufferGeometry; pocket: T.BufferGeometry; strap: T.BufferGeometry; ring: T.BufferGeometry; pink: T.Material; rose: T.Material; cream: T.Material; glow: T.Material } | null = null;
function bagKit() {
  return kit ??= {
    body: shared(new T.SphereGeometry(.36, 14, 10).scale(1, 1.08, .78)), flap: shared(new T.SphereGeometry(.3, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2).scale(1.1, .55, .9)),
    pocket: shared(new T.BoxGeometry(.34, .2, .12)), strap: shared(new T.TorusGeometry(.17, .035, 6, 12, Math.PI)), ring: shared(new T.RingGeometry(.62, .86, 32).rotateX(-Math.PI / 2)),
    pink: shared(toonMaterial({ color: '#ff7ab0' })), rose: shared(toonMaterial({ color: '#e0528f' })), cream: shared(toonMaterial({ color: '#ffe9c7' })),
    glow: shared(new T.MeshBasicMaterial({ color: '#ff9ed0', transparent: true, opacity: .7, depthWrite: false })),
  };
}
/** The pink backpack model for a dropped bag (centred on the ground; `userData.bob` is the part that bobs). */
export function deathBagModel() {
  const k = bagKit(), g = new T.Group(), bob = new T.Group();
  const body = new T.Mesh(k.body, k.pink); body.position.y = .42;
  const flap = new T.Mesh(k.flap, k.rose); flap.position.y = .62;
  const pocket = new T.Mesh(k.pocket, k.cream); pocket.position.set(0, .34, .27);
  const strap = new T.Mesh(k.strap, k.rose); strap.position.y = .8; strap.rotation.y = Math.PI / 2;
  bob.add(body, flap, pocket, strap); body.castShadow = true;
  const ring = new T.Mesh(k.ring, k.glow); ring.position.y = .04; ring.renderOrder = 2;
  bob.scale.setScalar(1.3); g.add(bob, ring); g.userData.bob = bob; g.userData.ring = ring; return g;
}
export const deathBagEntityId = (id: string) => `deathbag:${id}`;
export const bagIdOf = (entityId: string) => entityId.startsWith('deathbag:') ? entityId.slice(9) : undefined;

type Entity = { id: string; kind: string; x: number; z: number; mesh: T.Group };
export interface DeathBagDeps {
  world: { entities: Entity[]; position: { x: number; z: number }; planet: string; state: SaveState; screen(x: number, y: number, z: number): { x: number; y: number; front: boolean }; syncDropped(): void };
  layer: HTMLElement;
  /** The explorer's own save (while visiting, world.state is the host's). */
  own: () => SaveState;
  /** True while the explorer can pick things up (started, own world, alive, no menu open). */
  active: () => boolean;
  perform: (type: string, payload: Record<string, unknown>) => Promise<unknown>;
  toast: (message: string, icon?: string) => void;
  t: (text: string, params?: Record<string, string | number>) => string;
}
export function initDeathBags(d: DeathBagDeps) {
  const tags = new Map<string, HTMLElement>();
  let pending = false, warned = '', clock = 0, time = 0, retryAt = 0;
  const own = () => d.own();
  const bagOf = (e: Entity) => { const id = bagIdOf(e.id); return id ? (own().deathBags ?? []).find(b => b.id === id) : undefined; };
  async function pick(e: Entity, auto = false) {
    const bag = bagOf(e); if (!bag || pending) return;
    if (!Object.keys(bag.items).some(id => fits(own(), { [id]: bag.items[id]! }))) { if (!auto || warned !== bag.id) d.toast(d.t(BAG_FULL), '🎒'); warned = bag.id; return; }
    pending = true; retryAt = performance.now() + 2000;
    try {
      const result = await d.perform('recoverBag', { id: bag.id }) as { left?: number } | undefined;
      if (!result) return;
      d.world.syncDropped();
      d.toast(result.left ? d.t('Your backpack is full. The rest is still waiting in the dropped bag.') : d.t('All your little treasures are back.'), '🎒');
    } finally { pending = false; }
  }
  function tag(b: DeathBag, e: Entity, now: number) {
    let el = tags.get(b.id);
    if (!el) { el = document.createElement('div'); el.className = 'death-bag-tag'; d.layer.append(el); tags.set(b.id, el); }
    const p = d.world.screen(e.x, 2.05, e.z), near = Math.hypot(d.world.position.x - e.x, d.world.position.z - e.z) < 18;
    el.hidden = !p.front || !near || !d.active();
    if (el.hidden) return;
    // Above the entity's own name label ("Your dropped backpack"): just the time it has left.
    const text = `⏳ ${d.t('{time} left', { time: bagTimeLeft(b, now) })}`;
    if (el.textContent !== text) el.textContent = text;
    el.style.transform = `translate(${Math.round(p.x)}px,${Math.round(p.y)}px) translate(-50%,-100%)`;
  }
  function update(dt: number) {
    time += dt; clock += dt; const now = Date.now(), bags = d.world.entities.filter(e => e.kind === 'dropped');
    // A bag that ran out (24 h) or was emptied elsewhere (another device online) leaves the world.
    if (clock > 1) { clock = 0; const live = liveBags(own(), now, d.world.planet); if (live.length !== bags.length || bags.some(e => !live.some(b => deathBagEntityId(b.id) === e.id))) d.world.syncDropped(); }
    const seen = new Set<string>();
    for (const e of bags) {
      const b = bagOf(e); if (!b || !bagAlive(b, now)) continue; seen.add(b.id);
      const bob = e.mesh.userData.bob as T.Object3D | undefined, ring = e.mesh.userData.ring as T.Object3D | undefined;
      if (bob) { bob.position.y = Math.abs(Math.sin(time * 2.5)) * .12; bob.rotation.y = Math.sin(time * 1.5) * .3; }
      if (ring) ring.scale.setScalar(1 + Math.sin(time * 4) * .1);
      tag(b, e, now);
      const dist = Math.hypot(d.world.position.x - e.x, d.world.position.z - e.z);
      if (dist < DEATH_BAG_REACH && d.active() && performance.now() > retryAt) void pick(e, true); else if (warned === b.id && dist > DEATH_BAG_REACH + 1) warned = '';
    }
    for (const [id, el] of tags) if (!seen.has(id)) { el.remove(); tags.delete(id); }
  }
  return { pick: (e: Entity) => pick(e), update };
}
