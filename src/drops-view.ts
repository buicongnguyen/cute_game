import { t } from './i18n.ts';
/**
 * Draws ground loot cheaply: every drop is a camera-facing card cut from a runtime atlas of our own
 * 160 px item icons (public/assets/icons), all in ONE InstancedMesh, over ONE instanced rarity-ring mesh.
 * That is 2 draw calls for any number of drops and no shadow-pass cost (neither mesh casts shadows).
 * The spin is faked by flipping the card's x-scale; the countdown pill is a pooled DOM element within 14 m.
 */
import * as T from 'three';
import { terrainHeight, type EnvironmentLayout } from './environments.ts';
import { DROP, DropManager, RING_COLORS, blinkVisible, dropLabel, rarityOf, type Drop, type Rarity } from './drops.ts';

const CELL = 128, GRID = 8, SLOTS = GRID * GRID, INK = '#3a2433';
/** Card size in metres and its backward lean, so the 52° camera does not squash it to a sliver. */
const CARD = 1.3, LEAN = -.42;

/** Packs icons into a 1024² canvas on demand, with an ink outline baked in (the reference outlines its drops). */
class IconAtlas {
  readonly canvas = document.createElement('canvas'); readonly texture: T.CanvasTexture;
  private slots = new Map<string, number>(); private loading = new Set<string>(); private owners: (string | null)[] = Array(SLOTS).fill(null);
  private ctx: CanvasRenderingContext2D;
  constructor(private url: (id: string) => string | null) {
    this.canvas.width = this.canvas.height = CELL * GRID; this.ctx = this.canvas.getContext('2d')!;
    this.texture = new T.CanvasTexture(this.canvas); this.texture.colorSpace = T.SRGBColorSpace; this.texture.anisotropy = 1;
  }
  /** Atlas cell of an icon, or -1 while it loads (the ring still shows). */
  cell(id: string, live: Set<string>): number {
    const slot = this.slots.get(id); if (slot !== undefined) return slot;
    if (!this.loading.has(id)) { this.loading.add(id); this.load(id, live); }
    return -1;
  }
  private load(id: string, live: Set<string>) {
    const src = this.url(id), img = new Image();
    img.onload = () => this.pack(id, img, live); img.onerror = () => this.pack(id, null, live);
    if (src) img.src = src; else queueMicrotask(() => this.pack(id, null, live));
  }
  private pack(id: string, img: HTMLImageElement | null, live: Set<string>) {
    // Reuse a free slot, or one whose icon no drop shows any more.
    let slot = this.owners.indexOf(null); if (slot < 0) slot = this.owners.findIndex(o => o !== null && !live.has(o)); if (slot < 0) slot = 0;
    const old = this.owners[slot]; if (old) { this.slots.delete(old); this.loading.delete(old); }
    this.owners[slot] = id; this.slots.set(id, slot); this.loading.delete(id);
    const c = this.ctx, x = (slot % GRID) * CELL, y = Math.floor(slot / GRID) * CELL, pad = 10, size = CELL - pad * 2;
    c.clearRect(x, y, CELL, CELL);
    if (img) {
      // Ink silhouette stamped around the icon = a 3 px outline that costs nothing at draw time.
      const ink = document.createElement('canvas'); ink.width = ink.height = size; const k = ink.getContext('2d')!;
      k.drawImage(img, 0, 0, size, size); k.globalCompositeOperation = 'source-in'; k.fillStyle = INK; k.fillRect(0, 0, size, size);
      for (let a = 0; a < 8; a++) c.drawImage(ink, x + pad + Math.cos(a * Math.PI / 4) * 3, y + pad + Math.sin(a * Math.PI / 4) * 3);
      c.drawImage(img, x + pad, y + pad, size, size);
    } else { c.fillStyle = '#fff4cc'; c.strokeStyle = INK; c.lineWidth = 6; c.beginPath(); c.arc(x + CELL / 2, y + CELL / 2, size / 3, 0, Math.PI * 2); c.fill(); c.stroke(); }
    this.texture.needsUpdate = true;
  }
  dispose() { this.texture.dispose(); }
}

function cardMaterial(map: T.Texture) {
  const m = new T.MeshBasicMaterial({ map, alphaTest: .5, side: T.DoubleSide });
  m.onBeforeCompile = shader => {
    shader.vertexShader = 'attribute vec2 cell;\n' + shader.vertexShader.replace('#include <uv_vertex>', `#include <uv_vertex>\n  vMapUv = (vMapUv + cell) * ${(1 / GRID).toFixed(6)};`);
  };
  m.customProgramCacheKey = () => 'drop-card-atlas';
  return m;
}

export class DropView {
  cards: T.InstancedMesh; rings: T.InstancedMesh; atlas: IconAtlas;
  private cell: T.InstancedBufferAttribute; private capacity = 0;
  private tags = new Map<number, { el: HTMLElement; text: string; warn: boolean }>();
  private m = new T.Matrix4(); private q = new T.Quaternion(); private e = new T.Euler(0, 0, 0, 'YXZ'); private s = new T.Vector3(); private p = new T.Vector3(); private v = new T.Vector3();
  private colors: Record<Rarity, T.Color> = { common: new T.Color(RING_COLORS.common), rare: new T.Color(RING_COLORS.rare), legendary: new T.Color(RING_COLORS.legendary) };
  private cardMat: T.MeshBasicMaterial; private ringGeo = new T.RingGeometry(.55, .75, 32).rotateX(-Math.PI / 2); private cardGeo = new T.PlaneGeometry(1, 1);
  private ringMat = new T.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: .7, depthWrite: false });

  constructor(private scene: T.Scene, private layer: HTMLElement, iconUrl: (id: string) => string | null) {
    this.atlas = new IconAtlas(iconUrl); this.cardMat = cardMaterial(this.atlas.texture);
    this.cell = new T.InstancedBufferAttribute(new Float32Array(0), 2);
    this.cards = this.rings = null!; this.grow(32);
  }
  private grow(n: number) {
    if (this.cards) { this.scene.remove(this.cards, this.rings); this.cards.geometry.dispose(); this.cards.dispose(); this.rings.dispose(); }
    this.capacity = n;
    this.cell = new T.InstancedBufferAttribute(new Float32Array(n * 2), 2); this.cell.setUsage(T.DynamicDrawUsage);
    const geo = this.cardGeo.clone(); geo.setAttribute('cell', this.cell);
    this.cards = new T.InstancedMesh(geo, this.cardMat, n); this.rings = new T.InstancedMesh(this.ringGeo, this.ringMat, n);
    for (const mesh of [this.cards, this.rings]) { mesh.name = 'drops'; mesh.frustumCulled = false; mesh.castShadow = mesh.receiveShadow = false; mesh.count = 0; mesh.instanceMatrix.setUsage(T.DynamicDrawUsage); this.scene.add(mesh); }
    this.rings.setColorAt(0, this.colors.common); this.rings.renderOrder = 1;
  }

  /** Re-pose every card toward the camera and refresh the pills. Call with up-to-date camera matrices. */
  sync(drops: Drop[], time: number, camera: T.Camera, hero: { x: number; z: number }, width: number, height: number) {
    if (drops.length > this.capacity) this.grow(Math.max(drops.length, this.capacity * 2));
    const live = new Set(drops.map(d => d.item)), cam = camera.position;
    let n = 0;
    for (const d of drops) {
      const visible = blinkVisible(d.life - d.age, time), slot = this.atlas.cell(d.item, live);
      // Ring on the ground.
      this.m.makeTranslation(d.x, d.ground + .04, d.z); this.rings.setMatrixAt(n, visible ? this.m : this.m.makeScale(0, 0, 0)); this.rings.setColorAt(n, this.colors[d.rarity]);
      // Card: cylindrical billboard (yaw only) plus a fixed lean back. The spin is an x-scale flip that never
      // narrows below 55%, so the icon stays readable through the turn (a true edge-on card would vanish).
      const flip = Math.cos(d.spin), sx = Math.sign(flip || 1) * (.55 + .45 * Math.abs(flip));
      this.e.set(LEAN, Math.atan2(cam.x - d.x, cam.z - d.z), 0); this.q.setFromEuler(this.e);
      this.s.set(CARD * sx, CARD, CARD).multiplyScalar(visible && slot >= 0 ? 1 : 0);
      this.p.set(d.x, d.y + CARD * .5 - .25, d.z);
      this.cards.setMatrixAt(n, this.m.compose(this.p, this.q, this.s));
      this.cell.setXY(n, Math.max(0, slot) % GRID, GRID - 1 - Math.floor(Math.max(0, slot) / GRID));
      n++;
    }
    this.cards.count = this.rings.count = n; this.cards.visible = this.rings.visible = n > 0; // no draws at all without drops
    this.cards.instanceMatrix.needsUpdate = this.rings.instanceMatrix.needsUpdate = this.cell.needsUpdate = true;
    if (this.rings.instanceColor) this.rings.instanceColor.needsUpdate = true;
    this.syncTags(drops, camera, hero, width, height);
  }

  private syncTags(drops: Drop[], camera: T.Camera, hero: { x: number; z: number }, width: number, height: number) {
    const seen = new Set<number>();
    for (const d of drops) {
      if (Math.hypot(hero.x - d.x, hero.z - d.z) >= DROP.labelRange) continue;
      this.v.set(d.x, d.y + CARD - .2, d.z).project(camera); if (this.v.z >= 1) continue;
      seen.add(d.uid);
      let tag = this.tags.get(d.uid); if (!tag) { const el = document.createElement('div'); el.className = 'droptag'; this.layer.append(el); tag = { el, text: '', warn: false }; this.tags.set(d.uid, tag); }
      const { text: sourceText, warn } = dropLabel(d); const text = t(sourceText);
      if (tag.text !== text) { tag.el.textContent = text; tag.text = text; }
      if (tag.warn !== warn) { tag.el.classList.toggle('warn', warn); tag.warn = warn; }
      tag.el.style.transform = `translate(${((this.v.x * .5 + .5) * width).toFixed(1)}px,${((-this.v.y * .5 + .5) * height).toFixed(1)}px) translate(-50%,-100%)`;
    }
    for (const [uid, tag] of this.tags) if (!seen.has(uid)) { tag.el.remove(); this.tags.delete(uid); }
  }
}

/** The parts of World the drops need (kept structural so tests and tools can fake it). */
export interface DropWorld { scene: T.Scene; camera: T.Camera; position: T.Vector3; root: T.Object3D; environment: { layout: EnvironmentLayout } }
export interface DropHooks {
  layer: HTMLElement;
  iconUrl: (id: string) => string | null;
  item: (id: string) => { name: string; rare?: boolean; legend?: boolean } | undefined;
  alive: () => boolean;
  /** Room in the bag? The clone's bag is unlimited today, so this only fails on overflow. */
  canAdd: (id: string, count: number) => boolean;
  /** Put a picked stack into the bag ('+n name' float, sound). */
  onPick: (d: Drop, stack: number) => void;
  onFull?: (d: Drop) => void;
  onRare?: (d: Drop, name: string) => void;
  onExpire?: (d: Drop) => void;
}

/** Wires the simulation, the view and the game together. Returns what the game calls. */
export function createDrops(world: DropWorld, h: DropHooks, seed = (Date.now() & 0x7fffffff) || 1) {
  // Same ground rule as the creatures (world.ts): never below the water floor.
  const groundAt = (x: number, z: number) => Math.max(-.7, terrainHeight(world.environment.layout, { x, z }));
  const hero = () => ({ x: world.position.x, z: world.position.z, alive: h.alive() });
  // A rebuild swaps world.root (planet change, visits): drops stay on the map they fell on, like the reference.
  const mapKey = () => world.root;
  const sim = new DropManager(seed), view = new DropView(world.scene, h.layer, h.iconUrl);
  let key = mapKey(), stack = 0, stackT = 0;
  // Pose the cards just before each frame's draw, so they track the camera with no one-frame lag.
  const previous = world.scene.onBeforeRender;
  world.scene.onBeforeRender = function (this: T.Scene, ...args: Parameters<T.Scene['onBeforeRender']>) {
    previous.apply(this, args); const camera = args[2];
    if (camera === world.camera) view.sync(sim.drops, sim.time, camera, hero(), innerWidth, innerHeight);
  };
  const api = {
    sim, view,
    /** Toss a stack onto the ground at a point (kill loot, bag overflow). */
    spawn(id: string, count: number, x: number, z: number, opts: { thrown?: boolean; dir?: number; owner?: string } = {}) {
      const def = h.item(id); if (!def || !(count > 0)) return null;
      if (mapKey() !== key) { key = mapKey(); sim.clear(); }
      const d = sim.spawn(id, count, { x, z }, { ...opts, rarity: rarityOf(def), ground: groundAt(x, z) });
      if (d.rarity !== 'common') h.onRare?.(d, def.name);
      return d;
    },
    spawnLoot(loot: { id: string; count: number }[], x: number, z: number) { for (const item of loot) api.spawn(item.id, item.count, x, z); },
    update(dt: number) {
      if (mapKey() !== key) { key = mapKey(); sim.clear(); }
      stackT -= dt; if (stackT <= 0) stack = 0;
      if (!sim.drops.length) return;
      const ev = sim.step(dt, hero(), h.canAdd, groundAt);
      // Pickups in quick succession stack their floats upwards instead of printing over each other.
      for (const d of ev.picked) { h.onPick(d, stack++); stackT = .6; }
      for (const d of ev.full) h.onFull?.(d);
      for (const d of ev.expired) h.onExpire?.(d);
    },
    clear() { sim.clear(); },
  };
  return api;
}
export type Drops = ReturnType<typeof createDrops>;
