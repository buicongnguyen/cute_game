/**
 * The Delvers' Vault drawn: the kit (art/blender/kit/build_dungeon.py → dungeon.glb), the arena with its per-room tint
 * and dressing, the lobby circle and keeper at home, creature models, and the guardians' telegraphs (pooled meshes,
 * redrawn every frame: nothing is created or disposed mid-fight). Simple shapes stand in until the file arrives.
 */
import * as T from 'three';
import { KitLibrary, modelUrl } from './assets.ts';
import { toonMaterial, isLit, type LitMaterial } from './toon.ts';
import { addOutlines, showOutlines } from './outline.ts';
import { TelegraphDecals } from './telegraph.ts';
import { TELEGRAPH_LOOK } from './boss-patterns.ts';
import { DUNGEON_SKILL_INFO, type DungeonStage } from './dungeon-content.ts';
import { markProgress, type DgAttack, type DgMark } from './dungeon-patterns.ts';

export const dungeonKitFile = modelUrl('dungeon.glb');
export const dungeonKit = new KitLibrary([dungeonKitFile]);
const mats = new Map<string, T.MeshToonMaterial>();
const mat = (color: string, glow = 0) => { const key = color + glow; let m = mats.get(key); if (!m) { m = toonMaterial({ color, emissive: glow ? color : '#000000', emissiveIntensity: glow }); m.userData.sharedKit = true; mats.set(key, m); } return m; };
function mesh(geometry: T.BufferGeometry, color: string, x = 0, y = 0, z = 0, glow = 0) { const m = new T.Mesh(geometry, mat(color, glow)); m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; return m; }

/** The arena for one room: floor, wall and dressing tinted for that room; the kit when ready, else simple shapes. */
export function buildArena(stage: DungeonStage): T.Group {
  const g = new T.Group(); g.name = 'vault-arena';
  const tint = { 'Vault floor': stage.floor, 'Vault inlay': shade(stage.floor, 1.35), 'Vault glow': stage.accent, 'Vault stone': shade(stage.floor, 1.6), 'Vault stone dark': shade(stage.floor, 1.05), 'Vault tile': shade(stage.floor, .84) };
  const floor = dungeonKit.ready ? dungeonKit.instance('dg_floor', tint) : null, wall = dungeonKit.ready ? dungeonKit.instance('dg_wall', tint) : null, dress = dungeonKit.ready ? dungeonKit.instance('dg_dress_' + stage.id) : null;
  if (floor) g.add(floor); else { const disc = mesh(new T.CylinderGeometry(26.5, 26.5, .5, 48), stage.floor, 0, -.25, 0); disc.receiveShadow = true; g.add(disc); for (const r of [5.5, 13.5, 21.5]) { const ring = mesh(new T.TorusGeometry(r, .14, 4, 48).rotateX(Math.PI / 2), r === 13.5 ? stage.accent : shade(stage.floor, 1.35), 0, .02, 0, r === 13.5 ? 1 : 0); g.add(ring); } }
  if (wall) g.add(wall); else for (let i = 0; i < 24; i++) { const a = i * Math.PI * 2 / 24, p = mesh(new T.BoxGeometry(1.1, 3.2, 1.1), shade(stage.floor, 1.6), Math.cos(a) * 25.2, 1.6, Math.sin(a) * 25.2); p.rotation.y = -a; g.add(p); }
  if (dress) g.add(dress);
  g.traverse(o => { if (o instanceof T.Mesh) { o.receiveShadow = true; o.castShadow = o.position.y > .2 || !!wall; o.raycast = () => {}; } });
  return g;
}
export function buildPortal(): T.Group {
  const kit = dungeonKit.ready ? dungeonKit.instance('dg_portal') : null; if (kit) { kit.traverse(o => { o.raycast = () => {}; }); return kit; }
  const g = new T.Group(); g.add(mesh(new T.CylinderGeometry(2.1, 2.1, .25, 20), '#6b6a86', 0, .12, 0), mesh(new T.TorusGeometry(1.75, .26, 6, 28), '#6b6a86', 0, 2.15, 0));
  const disc = mesh(new T.CircleGeometry(1.55, 28), '#b48cff', 0, 2.15, 0, 2); (disc.material as T.Material).side = T.DoubleSide; g.add(disc); return g;
}
/** The glowing circle by the south gate (home), and Vault Keeper Wren beside it. */
export function buildLobby(): T.Group {
  const kit = dungeonKit.ready ? dungeonKit.instance('dg_lobby') : null; if (kit) { kit.traverse(o => { o.raycast = () => {}; if (o instanceof T.Mesh) o.castShadow = false; }); return kit; }
  const g = new T.Group(); const ring = mesh(new T.TorusGeometry(4.2, .12, 4, 48).rotateX(Math.PI / 2), '#9be7ff', 0, .04, 0, 1.4); ring.castShadow = false; g.add(ring);
  for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3; g.add(mesh(new T.BoxGeometry(.42, .9, .3), '#a99fc6', Math.cos(a) * 4.6, .45, Math.sin(a) * 4.6)); }
  g.traverse(o => { o.raycast = () => {}; }); return g;
}
export function buildKeeper(): T.Group {
  const kit = dungeonKit.ready ? dungeonKit.instance('dg_keeper') : null; if (kit) return kit;
  const g = new T.Group(); g.add(mesh(new T.CylinderGeometry(.32, .5, 1, 14), '#5a6fb0', 0, .5, 0), mesh(new T.IcosahedronGeometry(.3, 1), '#ffd9b8', 0, 1.15, 0), mesh(new T.CylinderGeometry(.55, .55, .06, 16), '#7a4a8a', 0, 1.36, 0), mesh(new T.ConeGeometry(.26, .45, 12), '#7a4a8a', 0, 1.6, 0), mesh(new T.CylinderGeometry(.12, .12, .22, 8), '#ffd23f', .5, 1.6, -.15, 1.5));
  return g;
}
/**
 * A creature or guardian from the kit, ready to adopt into its entity (world.ts keeps its own scale per type, so the
 * kit's true-size model sits in a child scaled by 1/worldScale). Lit materials are copied for the hit flash.
 */
export function creatureModel(type: string, worldScale: number): T.Group | null {
  const kit = dungeonKit.ready ? dungeonKit.instance(type) : null; if (!kit) return null;
  const outer = new T.Group(), flash: LitMaterial[] = [];
  kit.scale.setScalar(1 / Math.max(.05, worldScale)); outer.add(kit);
  outer.traverse(o => { if (o instanceof T.Mesh && isLit(o.material)) { o.material = o.material.clone(); o.material.userData.sharedKit = false; flash.push(o.material as LitMaterial); } });
  outer.userData.flashMaterials = flash; addOutlines(outer); showOutlines(outer, false);
  return outer;
}
function shade(hex: string, k: number) { const c = new T.Color(hex); c.r = Math.min(1, c.r * k); c.g = Math.min(1, c.g * k); c.b = Math.min(1, c.b * k); return '#' + c.getHexString(); }

/** The guardians' telegraphs: circles reuse the shared decals; rings, lines, cones and safe circles are pooled here. */
export class VaultTelegraphs {
  readonly root = new T.Group();
  private decals = new TelegraphDecals();
  private pool: T.Mesh[] = []; private used = 0;
  private plane = new T.PlaneGeometry(1, 1).rotateX(-Math.PI / 2).translate(0, 0, .5);
  private sphere = new T.IcosahedronGeometry(.45, 1);
  private rings = new Map<string, T.BufferGeometry>(); private cones = new Map<string, T.BufferGeometry>();
  private materials = new Map<string, T.MeshBasicMaterial>();
  constructor() { this.root.name = 'vault-telegraphs'; this.root.add(this.decals.root); }
  private material(color: string, opacity: number) { const key = color + opacity; let m = this.materials.get(key); if (!m) { m = new T.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, side: T.DoubleSide, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }); this.materials.set(key, m); } return m; }
  private ringGeometry(inner: number) { const key = inner.toFixed(2); let g = this.rings.get(key); if (!g) { g = new T.RingGeometry(Math.max(.01, Math.min(.98, inner)), 1, 48).rotateX(-Math.PI / 2); this.rings.set(key, g); } return g; }
  private coneGeometry(arc: number) { const key = arc.toFixed(2); let g = this.cones.get(key); if (!g) { g = new T.CircleGeometry(1, 24, Math.PI / 2 - arc / 2, arc).rotateX(-Math.PI / 2); g.rotateY(Math.PI); this.rings.set('c' + key, g); this.cones.set(key, g); } return g; }
  private mesh(geometry: T.BufferGeometry, color: string, opacity: number) {
    let m = this.pool[this.used++]; if (!m) { m = new T.Mesh(geometry); m.raycast = () => {}; m.renderOrder = 3; this.root.add(m); this.pool.push(m); }
    m.geometry = geometry; m.material = this.material(color, opacity); m.visible = true; m.scale.set(1, 1, 1); m.rotation.set(0, 0, 0); m.position.set(0, 0, 0); return m;
  }
  begin() { this.used = 0; this.decals.begin(); }
  draw(a: DgAttack, source: { x: number; z: number }) {
    const color = DUNGEON_SKILL_INFO[a.skill].color, y = .06;
    for (let i = 0; i < a.marks.length; i++) {
      const m = a.marks[i]; if (a.fired.includes(i) && m.shape !== 'safe' && a.skill !== 'spore_trail' && !(a.skill === 'riptide_dash' && i > 0)) continue;
      const p = markProgress(a, m), lingering = a.age >= m.at; // trails and pools stay drawn while they burn
      if (m.shape === 'circle') { if (a.skill === 'eclipse_wing') { this.wipe(m, p, color); continue; } this.decals.draw(m.x, y, m.z, m.r, lingering ? 1 : p, color); }
      else if (m.shape === 'safe') { const ring = this.mesh(this.ringGeometry(.86), '#5aff9a', TELEGRAPH_LOOK.edge); ring.position.set(m.x, y + .03, m.z); ring.scale.setScalar(m.r); const fill = this.mesh(this.ringGeometry(.01), '#5aff9a', .28); fill.position.set(m.x, y + .02, m.z); fill.scale.setScalar(m.r); }
      else if (m.shape === 'ring') { const base = this.mesh(this.ringGeometry((m.inner ?? 0) / m.r), color, TELEGRAPH_LOOK.base * 1.4); base.position.set(m.x, y, m.z); base.scale.setScalar(m.r); const edge = this.mesh(this.ringGeometry(Math.max((m.inner ?? 0) / m.r, 1 - .12 / m.r)), color, TELEGRAPH_LOOK.edge * (.4 + .6 * p)); edge.position.set(m.x, y + .01, m.z); edge.scale.setScalar(m.r); }
      else if (m.shape === 'line') {
        const angle = a.skill === 'prism_lances' && a.age >= a.windup ? (m.angle ?? 0) + (a.age - a.windup) * 1.2 : m.angle ?? 0, ox = a.skill === 'prism_lances' ? source.x : m.x, oz = a.skill === 'prism_lances' ? source.z : m.z;
        const base = this.mesh(this.plane, color, a.skill === 'prism_lances' && a.age >= a.windup ? .7 : TELEGRAPH_LOOK.base * 1.6); base.position.set(ox, y, oz); base.rotation.y = angle; base.scale.set(m.width ?? 1, 1, m.len ?? m.r);
        if (a.age < m.at) { const fill = this.mesh(this.plane, color, TELEGRAPH_LOOK.fill); fill.position.set(ox, y + .01, oz); fill.rotation.y = angle; fill.scale.set(m.width ?? 1, 1, Math.max(.01, (m.len ?? m.r) * p)); }
      } else if (m.shape === 'cone') {
        const base = this.mesh(this.coneGeometry(m.arc ?? 1), color, TELEGRAPH_LOOK.base * 1.6); base.position.set(m.x, y, m.z); base.rotation.y = m.angle ?? 0; base.scale.setScalar(m.len ?? m.r);
        const fill = this.mesh(this.coneGeometry(m.arc ?? 1), color, TELEGRAPH_LOOK.fill); fill.position.set(m.x, y + .01, m.z); fill.rotation.y = m.angle ?? 0; fill.scale.setScalar(Math.max(.01, (m.len ?? m.r) * p));
      }
    }
    if (a.skill === 'bubble_orbs' && a.age >= a.windup) for (const o of a.orbs) if (!o.done) { const s = this.mesh(this.sphere, '#bff4ff', .85); s.position.set(o.x, 1.1 + Math.sin(a.age * 8 + o.x) * .15, o.z); s.scale.setScalar(1.1); }
  }
  /** The eclipse darkens the whole arena (a big soft disc) while the three safe circles glow green. */
  private wipe(m: DgMark, p: number, color: string) { const base = this.mesh(this.ringGeometry(.01), color, .12 + .22 * p); base.position.set(m.x, .05, m.z); base.scale.setScalar(m.r); }
  end() { for (let i = this.used; i < this.pool.length; i++) this.pool[i].visible = false; this.decals.end(); }
  clear() { this.begin(); this.end(); }
}
