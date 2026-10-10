import * as T from 'three';
import { isLit, type LitMaterial } from './toon.ts';

/**
 * Hit flash without a material copy per creature. A creature used to clone every lit material when it was built so
 * its white flash could not light the others: 50 parts x 10 creatures = 500 materials, and three.js re-uploads
 * a material's uniforms every time consecutive draws use different ones. Now the parts keep the shared kit material
 * (consecutive parts of consecutive creatures sort together and skip that work) and a creature copies its
 * materials the first time it is actually hit. The copy then stays, so later flashes cost nothing extra.
 */
type Holder = { userData: Record<string, unknown> };

/** Remembers the lit meshes of a freshly built creature model; no material is copied yet. */
export function deferFlash(model: T.Object3D) {
  const meshes: T.Mesh[] = [];
  model.traverse(o => {
    if (!(o instanceof T.Mesh) || !isLit(o.material)) return;
    // Shared between creatures from now on: no creature's disposal may free it.
    if (o.material.userData.sharedKit === undefined) o.material.userData.sharedKit = true;
    meshes.push(o);
  });
  model.userData.flashMeshes = meshes; model.userData.flashMaterials = undefined;
  return model;
}

/** The creature's own materials (copied on first use), the ones the hit flash tints. `flashOwns` on the root tags the copies as disposable with the creature (the Vault's), else they keep their source's flag. */
export function flashMaterialsOf(root: Holder): LitMaterial[] {
  const own = root.userData.flashMaterials as LitMaterial[] | undefined;
  if (own) return own;
  const meshes = root.userData.flashMeshes as T.Mesh[] | undefined;
  if (!meshes) return [];
  const list: LitMaterial[] = [], ownsClones = root.userData.flashOwns === true;
  for (const mesh of meshes) {
    if (!isLit(mesh.material)) continue;
    const source = mesh.material, copy = source.clone() as LitMaterial;
    // Material.clone drops a shader patch; the creature looked patched until now, so the copy keeps it (no look change at the first hit).
    if (Object.prototype.hasOwnProperty.call(source, 'onBeforeCompile')) copy.onBeforeCompile = source.onBeforeCompile;
    if (Object.prototype.hasOwnProperty.call(source, 'customProgramCacheKey')) copy.customProgramCacheKey = source.customProgramCacheKey;
    if (ownsClones) copy.userData.sharedKit = false;
    mesh.material = copy; list.push(copy);
  }
  root.userData.flashMaterials = list;
  return list;
}

/** The copies made so far, without making any (a flash that never started has nothing to clear). */
export const flashMaterialsSoFar = (root: Holder) => (root.userData.flashMaterials as LitMaterial[] | undefined) ?? [];

/** Hands a prepared model's flash state to the creature that adopts it. */
export function transferFlash(from: Holder, to: Holder) {
  to.userData.flashMaterials = from.userData.flashMaterials; to.userData.flashMeshes = from.userData.flashMeshes; to.userData.flashOwns = from.userData.flashOwns;
}
