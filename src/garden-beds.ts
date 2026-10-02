import * as T from 'three';
import { bakeModel } from './assets.ts';

/**
 * All garden beds as instanced meshes (G2D-5): the bed model (garden-bed.glb, or the simple boxes until it loads) is
 * baked to one mesh per material finish, and every bed is an instance of those. Beds receive shadows but never cast:
 * they are flat, and 33 casting beds cost a shadow-pass draw each. Each bed keeps its own entity group, which now holds
 * only an invisible pick box (and the 3D crops, if the crop cards could not be baked).
 */
/** Bed-level pips (model.ts upgradeBed): one gold gem per level along the bed's front plank, in bed model units. */
const PIP = new T.OctahedronGeometry(.2, 0).scale(1, 1.25, .7), PIP_MATERIAL = new T.MeshBasicMaterial({ color: '#ffd23f' });
PIP.userData.sharedKit = true;
export const pipSpot = (k: number, levels: number) => ({ x: (k - (levels - 1) / 2) * .36, y: .5, z: .97 });
export class GardenBeds {
  readonly group = new T.Group();
  private key = '';
  constructor() { this.group.name = 'garden-beds'; }
  private owned = new Set<T.Material>();
  /**
   * Rebuild when the bed model or the bed positions change; `key` names the model. The beds own the template's
   * geometry, and its materials too when `ownsMaterials` (a refined clone); merged materials are always theirs.
   */
  sync(make: () => T.Object3D | null, key: string, beds: readonly { x: number; z: number; rotation?: number; level?: number }[], ownsMaterials = false, scale = 1) {
    const signature = key + '|' + scale + '|' + beds.map(b => `${b.x},${b.z},${b.rotation ?? 0},${b.level ?? 0}`).join(';');
    if (signature === this.key) return;
    this.key = signature; this.clear();
    const template = beds.length ? make() : null;
    if (!template) return;
    template.position.set(0, 0, 0); template.rotation.set(0, 0, 0); template.scale.setScalar(1);
    bakeModel(template); template.updateMatrixWorld(true);
    const place = new T.Matrix4(), turn = new T.Matrix4(), each = new T.Matrix4(), size = new T.Matrix4().makeScale(scale, scale, scale);
    template.traverse(o => {
      if (!(o instanceof T.Mesh) || o instanceof T.InstancedMesh || !o.visible || !o.layers.isEnabled(0)) return;
      let hidden = false; for (let p: T.Object3D | null = o; p && p !== template; p = p.parent) if (!p.visible) hidden = true;
      if (hidden) return;
      const material = o.material as T.Material;
      if (ownsMaterials || material.name.startsWith('Baked')) this.owned.add(material);
      const mesh = new T.InstancedMesh(o.geometry, material, beds.length);
      mesh.castShadow = false; mesh.receiveShadow = true; mesh.name = 'garden-bed-instances';
      // Placed beds may be turned in 45° steps (reference placement), so each instance is moved, turned and sized.
      beds.forEach((b, i) => mesh.setMatrixAt(i, each.multiplyMatrices(place.makeTranslation(b.x, 0, b.z).multiply(turn.makeRotationY(b.rotation ?? 0)).multiply(size), o.matrixWorld)));
      mesh.computeBoundingSphere(); this.group.add(mesh);
    });
    // Upgraded beds show their level as gold pips: every pip of the garden is one instance of one mesh, so the
    // markers cost a single draw call in all (none until a bed is upgraded), never one per bed.
    const levels = beds.reduce((n, b) => n + (b.level ?? 0), 0);
    if (levels) {
      const pips = new T.InstancedMesh(PIP, PIP_MATERIAL, levels), local = new T.Matrix4(); let n = 0;
      pips.castShadow = false; pips.receiveShadow = false; pips.name = 'garden-bed-level-pips';
      for (const b of beds) for (let k = 0; k < (b.level ?? 0); k++) {
        const at = pipSpot(k, b.level!);
        pips.setMatrixAt(n++, each.copy(place.makeTranslation(b.x, 0, b.z)).multiply(turn.makeRotationY(b.rotation ?? 0)).multiply(size).multiply(local.makeTranslation(at.x, at.y, at.z)));
      }
      pips.computeBoundingSphere(); this.group.add(pips);
    }
  }
  /** Number of draw calls the beds cost (one per material finish). */
  get draws() { return this.group.children.length; }
  clear() {
    for (const mesh of this.group.children as T.InstancedMesh[]) {
      // Cached procedural materials outlive the beds; baked and cloned ones do not.
      if (!mesh.geometry.userData.sharedKit) mesh.geometry.dispose();
      mesh.dispose();
    }
    for (const material of this.owned) material.dispose();
    this.owned.clear(); this.group.clear();
  }
  /** Forget the layout so the next sync rebuilds even if nothing changed. */
  invalidate() { this.key = ''; }
}
