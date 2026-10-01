import * as T from 'three';
import { TELEGRAPH_LOOK } from './boss-patterns.ts';

/**
 * Danger telegraphs as flat ground decals, after the reference: a faint tinted disc shows the
 * whole area, a brighter disc grows from the centre over the wind-up and fills the area at the
 * moment the blow lands, and an edge ring marks the border. Colours come from boss-patterns.ts.
 *
 * Decals are pooled and redrawn each frame (begin, draw..., end): nothing is created or
 * disposed while fighting, so no shader is relinked mid-fight. They are unlit 2D geometry, a
 * handful of triangles each.
 */
interface Decal { group: T.Group; base: T.Mesh; fill: T.Mesh; edge: T.Mesh }

const circle = new T.CircleGeometry(1, 40).rotateX(-Math.PI / 2);
circle.userData.sharedKit = true;

export class TelegraphDecals {
  readonly root = new T.Group();
  private decals: Decal[] = [];
  private used = 0;
  private materials = new Map<string, { base: T.MeshBasicMaterial; fill: T.MeshBasicMaterial; edge: T.MeshBasicMaterial }>();
  /** Edge rings keep a fixed width in metres, so each radius (a handful per game) has its own ring. */
  private edges = new Map<string, T.RingGeometry>();

  constructor() { this.root.name = 'telegraphs'; }

  private look(color: string) {
    let set = this.materials.get(color);
    if (!set) {
      const make = (opacity: number, order: number) => {
        const m = new T.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, side: T.DoubleSide, polygonOffset: true, polygonOffsetFactor: -order, polygonOffsetUnits: -order, toneMapped: false });
        m.userData.sharedKit = true; return m;
      };
      set = { base: make(TELEGRAPH_LOOK.base, 1), fill: make(TELEGRAPH_LOOK.fill, 2), edge: make(TELEGRAPH_LOOK.edge, 3) };
      this.materials.set(color, set);
    }
    return set;
  }

  private edge(r: number) {
    const key = r.toFixed(1);
    let ring = this.edges.get(key);
    if (!ring) { ring = new T.RingGeometry(Math.max(.05, 1 - TELEGRAPH_LOOK.edgeWidth / Math.max(.2, r)), 1, 48).rotateX(-Math.PI / 2); ring.userData.sharedKit = true; this.edges.set(key, ring); }
    return ring;
  }

  begin() { this.used = 0; }

  /** One decal: centre, ground height, radius, progress 0–1 of the wind-up and its colour. */
  draw(x: number, y: number, z: number, r: number, progress: number, color: string) {
    let decal = this.decals[this.used];
    if (!decal) {
      const group = new T.Group(), look = this.look(color);
      const base = new T.Mesh(circle, look.base), fill = new T.Mesh(circle, look.fill), edge = new T.Mesh(this.edge(r), look.edge);
      for (const [mesh, order] of [[base, 1], [fill, 2], [edge, 3]] as const) { mesh.renderOrder = order; mesh.raycast = () => {}; mesh.name = 'attack-telegraph'; group.add(mesh); }
      decal = { group, base, fill, edge }; this.decals.push(decal); this.root.add(group);
    }
    this.used++;
    const look = this.look(color), p = Math.min(1, Math.max(0, progress));
    decal.base.material = look.base; decal.fill.material = look.fill; decal.edge.material = look.edge; decal.edge.geometry = this.edge(r);
    decal.group.visible = true; decal.group.position.set(x, y, z);
    decal.base.scale.setScalar(r); decal.edge.scale.setScalar(r);
    decal.fill.visible = p > .001; decal.fill.scale.setScalar(Math.max(.001, r * p));
    decal.fill.position.y = .005; decal.edge.position.y = .01;
    return decal;
  }

  end() { for (let i = this.used; i < this.decals.length; i++) this.decals[i].group.visible = false; }

  /** Decals drawn this frame (tests and probes). */
  get active() { return this.decals.slice(0, this.used).map(d => ({ x: d.group.position.x, z: d.group.position.z, r: d.base.scale.x, fill: d.fill.visible ? d.fill.scale.x / d.base.scale.x : 0, color: '#' + (d.base.material as T.MeshBasicMaterial).color.getHexString() })); }

  clear() { this.used = 0; this.end(); }
}
