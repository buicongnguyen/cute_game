import * as T from 'three';

/**
 * The see-through model that previews where a garden bed kit or a decoration will go (reference decor.startPlace /
 * moveGhost: the model at 60 % opacity, glowing red, emissive #ff2020 at 0.6, while the spot is refused). It owns its
 * geometry and its own material copies, so the tint never reaches placed objects; `ownsMaterials` says the template's
 * materials were already private copies (a refined clone, a sculpted decoration) to free.
 */
export class PlacementGhost {
  readonly group = new T.Group();
  private readonly materials: T.Material[] = [];
  readonly id: string;
  constructor(id: string, template: T.Object3D, ownsMaterials = false) {
    this.id = id;
    this.group.name = 'placement-ghost';
    template.position.set(0, 0, 0); template.rotation.set(0, 0, 0);
    template.traverse(o => {
      if (!(o instanceof T.Mesh)) return;
      const source = Array.isArray(o.material) ? o.material[0] : o.material as T.Material, copy = source.clone();
      if (ownsMaterials) for (const m of Array.isArray(o.material) ? o.material : [o.material]) (m as T.Material).dispose();
      // depthWrite off so the ground under the model still shows through; drawn after the opaque scene.
      copy.transparent = true; copy.opacity = .6; copy.depthWrite = false;
      o.material = copy; o.castShadow = false; o.receiveShadow = false; o.renderOrder = 3;
      this.materials.push(copy);
      const lit = copy as T.MeshStandardMaterial; if (lit.emissive) lit.userData.glow = [lit.emissive.getHex(), lit.emissiveIntensity];
    });
    this.group.add(template);
  }
  /** Moves and turns the ghost; a refused spot glows red like the reference's. */
  place(x: number, z: number, rotation: number, ok: boolean) {
    this.group.position.set(x, .02, z); this.group.rotation.y = rotation;
    for (const m of this.materials) {
      const lit = m as T.MeshStandardMaterial;
      // A glowing decoration keeps its own glow on a good spot.
      if (lit.emissive) { const [hex, intensity] = lit.userData.glow; lit.emissive.set(ok ? hex : 0xff2020); lit.emissiveIntensity = ok ? intensity : .6; }
    }
    this.group.userData.ok = ok;
  }
  dispose() {
    this.group.removeFromParent();
    this.group.traverse(o => { if (o instanceof T.Mesh) o.geometry.dispose(); });
    for (const m of this.materials) m.dispose();
    this.materials.length = 0;
  }
}
