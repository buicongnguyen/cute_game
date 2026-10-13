import * as T from 'three';

/**
 * Sleeves stretch, gloves do not. A gear piece made for the default explorer's short arm is one mesh: a sleeve with a
 * glove (or a mitten, a cuff, a claw) at its end. On a longer-armed body style the fit used to scale the whole piece
 * along the arm (x3 on the Grown height), which turned every glove into a long carrot. Here the piece keeps its own
 * size around the hand (it rides down with the hand, unscaled along the arm) and only the sleeve above the cuff is stretched to reach.
 *
 * The baked geometry is cached per source geometry and stretch, flagged shared (never disposed with an avatar), so a
 * refresh of the explorer makes nothing new.
 */
/** The default explorer's hand sits this far below its shoulder (looks.ts DEFAULT_PIVOTS: arm 1.08, hand 0.72), and a glove reaches about this far above the hand's centre. */
export const HAND_DROP = .36, GLOVE = .13;
/**
 * Where a point at height `y` (0 at the shoulder, negative down the arm) ends up when the arm is `stretch` times longer:
 * everything from the cuff down rides with the hand unchanged in size, the sleeve above it stretches to meet it.
 */
export function sleeveY(y: number, stretch: number, drop = HAND_DROP, glove = GLOVE): number {
  if (!(stretch > 1)) return y * (stretch > 0 ? stretch : 1);
  const cuff = -(drop - glove), shift = -(stretch - 1) * drop;
  return y >= cuff ? y * (cuff + shift) / cuff : y + shift;
}
const cache = new Map<string, T.BufferGeometry>();
/**
 * Fits an arm piece (already moved to the part's pivot, unscaled) to an arm `width` times wider and `stretch` times
 * longer: bakes every mesh of the piece into part space with the sleeve rule and leaves the piece's own transform at identity.
 */
export function fitArmPiece(piece: T.Object3D, width: number, stretch: number) {
  piece.updateMatrixWorld(true);
  const toPart = new T.Matrix4().copy(piece.parent ? piece.parent.matrixWorld : new T.Matrix4()).invert(), meshes: T.Mesh[] = [], v = new T.Vector3();
  piece.traverse(o => { if (o instanceof T.Mesh) meshes.push(o); });
  const mats = meshes.map(m => new T.Matrix4().multiplyMatrices(toPart, m.matrixWorld));
  meshes.forEach((m, i) => {
    const key = `${m.geometry.uuid}|${width}|${stretch}|${mats[i].elements.map(e => e.toFixed(3)).join(',')}`;
    let g = cache.get(key);
    if (!g) {
      g = m.geometry.clone(); const p = g.getAttribute('position'), n = g.getAttribute('normal'), nm = new T.Matrix3().getNormalMatrix(mats[i]);
      for (let j = 0; j < p.count; j++) { v.fromBufferAttribute(p, j).applyMatrix4(mats[i]); p.setXYZ(j, v.x * width, sleeveY(v.y, stretch), v.z * width); }
      if (n) for (let j = 0; j < n.count; j++) { v.fromBufferAttribute(n, j).applyMatrix3(nm).normalize(); n.setXYZ(j, v.x, v.y, v.z); }
      p.needsUpdate = true; g.computeBoundingBox(); g.computeBoundingSphere(); g.userData.sharedKit = true; cache.set(key, g);
    }
    m.geometry = g;
  });
  // The geometry now lives in part space: every transform between the part and the mesh becomes identity.
  piece.traverse(o => { o.position.set(0, 0, 0); o.quaternion.identity(); o.scale.set(1, 1, 1); o.updateMatrix(); });
}
