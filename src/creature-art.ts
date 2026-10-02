import * as T from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { KitLibrary, KIT_FILES, type KitPart } from './assets.ts';
import { toToon } from './toon.ts';

/**
 * Creature art from creatures.glb (art/blender/kit/build_creatures.py, CONTRACT.md "Creatures"): each creature
 * is a root node named its ENEMY_TYPES id with one rigid child per part, `<id>_<part>`, whose origin is the part's
 * hinge. A part's pieces are merged into one mesh with its colours baked into the vertices, so a creature costs the
 * same draws as the procedural shapes it replaces (one body, plus four legs or two wings), and every part keeps the
 * names the animation already looks for (`leg0`-`leg3`, `wing-l`, `wing-r`). Creatures without art, and every
 * creature until the file arrives (or when it is missing), keep the procedural shapes.
 */
export const creatureKit = new KitLibrary([KIT_FILES.creatures,KIT_FILES.forestBirds]);

const LEGGED = ['body', 'leg_fl', 'leg_fr', 'leg_bl', 'leg_br'] as const;
const WINGED = ['body', 'wing_l', 'wing_r'] as const;
const SOLID = ['body'] as const;
/** The parts each redrawn creature must have, matching its old family's animated parts (src/world.ts speciesModel). */
export const CREATURE_PARTS: Readonly<Record<string, readonly string[]>> = {
  mushroom: SOLID, mushking: SOLID, boar: LEGGED, bee: WINGED, wolf: LEGGED, frog: SOLID, crab: LEGGED, chomper: SOLID,
  cactus: SOLID, bear: SOLID, treant: SOLID, croc: LEGGED,
  forest_raptor: ['body','head','wing_l','wing_r'],
  // The other planets.
  gummy: LEGGED, jelly: SOLID, snowball: SOLID, penguin: SOLID, icebloom: SOLID, magmaslime: SOLID, minislime: SOLID,
  firelizard: LEGGED, magmacrab: LEGGED, chameleon: LEGGED, flytrap: SOLID, cloudsheep: LEGGED, yeti: SOLID, mammoth: LEGGED,
};
/** Triangle budgets: creatures are numerous, bosses come one at a time. */
export const CREATURE_TRIANGLES = { common: 2500, boss: 5000 } as const;
/**
 * The animation's node names. It swings leg1 with leg2 and leg0 with leg3 (diagonal pairs, a trot), so the
 * front-left and back-right legs share a phase.
 */
const NODE_NAMES: Readonly<Record<string, string>> = { leg_bl: 'leg0', leg_fl: 'leg1', leg_br: 'leg2', leg_fr: 'leg3', wing_l: 'wing-l', wing_r: 'wing-r' };

let baked: T.Material | null = null;
/** One vertex-coloured toon material for every creature part; each creature clones it for its hit flash. */
function bakedMaterial() {
  if (!baked) { baked = toToon(new T.MeshStandardMaterial({ color: '#ffffff', vertexColors: true, roughness: .5 })); baked.name = 'Creature colours'; baked.userData.sharedKit = true; }
  return baked;
}

/** A float copy of a (possibly quantised: KHR_mesh_quantization) vec3 attribute; getX and friends undo the normalisation. */
function floats(a: T.BufferAttribute | T.InterleavedBufferAttribute) {
  const out = new Float32Array(a.count * 3);
  for (let i = 0; i < a.count; i++) { out[i * 3] = a.getX(i); out[i * 3 + 1] = a.getY(i); out[i * 3 + 2] = a.getZ(i); }
  return new T.BufferAttribute(out, 3);
}

/** The pieces of one part in its hinge's space, merged with their colours baked into the vertices. */
function mergePart(pieces: KitPart[], pivot: T.Vector3) {
  const indexed = pieces.every(p => p.geometry.index), toPivot = new T.Matrix4().makeTranslation(-pivot.x, -pivot.y, -pivot.z);
  const geometries = pieces.map(part => {
    let g = new T.BufferGeometry();
    g.setAttribute('position', floats(part.geometry.getAttribute('position')));
    const normal = part.geometry.getAttribute('normal'); if (normal) g.setAttribute('normal', floats(normal));
    if (part.geometry.index) g.setIndex(part.geometry.index.clone());
    if (!indexed && g.index) g = g.toNonIndexed();
    g.applyMatrix4(toPivot.clone().multiply(part.matrix));
    const color = (part.material as T.MeshStandardMaterial).color ?? new T.Color('#ffffff'), count = g.getAttribute('position').count, colors = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) colors.set([color.r, color.g, color.b], i * 3);
    g.setAttribute('color', new T.BufferAttribute(colors, 3));
    return g;
  });
  const merged = mergeGeometries(geometries, false); geometries.forEach(g => g.dispose());
  if (merged) merged.userData.sharedKit = true;
  return merged;
}

function template(type: string, kit: KitLibrary): T.Group | null {
  const parts = kit.parts(type), wanted = CREATURE_PARTS[type];
  if (!parts || !wanted) return null;
  const byPart = new Map<string, KitPart[]>();
  for (const part of parts) {
    // GLTFLoader names the pieces of a several-material part `<id>_<part>`, `<id>_<part>_1`, ...
    const name = part.name.replace(/(_\d+)+$/, ''), role = name.startsWith(`${type}_`) ? name.slice(type.length + 1) : '';
    if (wanted.includes(role)) { const list = byPart.get(role) ?? []; list.push(part); byPart.set(role, list); }
  }
  // A creature missing a part keeps its procedural shape rather than losing a leg.
  if (wanted.some(role => !byPart.has(role))) return null;
  const group = new T.Group(); group.name = `creature-${type}`;
  for (const role of wanted) {
    const pieces = byPart.get(role)!, pivot = new T.Vector3().setFromMatrixPosition(pieces[0].matrix), geometry = mergePart(pieces, pivot);
    if (!geometry) return null;
    const mesh = new T.Mesh(geometry, bakedMaterial()); mesh.name = `creature-${role}`; mesh.castShadow = true; mesh.receiveShadow = true;
    const node = NODE_NAMES[role];
    if (node) { const hinge = new T.Group(); hinge.name = node; hinge.position.copy(pivot); hinge.add(mesh); group.add(hinge); }
    else { mesh.position.copy(pivot); group.add(mesh); }
  }
  return group;
}

const templates = new WeakMap<KitLibrary, { revision: number; map: Map<string, T.Group | null> }>();
/**
 * A new model of `type` from the kit (geometry and material shared), or null while it has no art for it. The kit is
 * ready after its first file (creatures.glb or forest-birds.glb): the cache follows kit.revision, so a "no art" answer
 * given before the other file (or a late retry) arrived is asked again and restyleCreatures picks the art up.
 */
export function creatureArt(type: string, kit: KitLibrary = creatureKit): T.Group | null {
  if (!kit.ready || !CREATURE_PARTS[type]) return null;
  let entry = templates.get(kit); if (!entry || entry.revision !== kit.revision) templates.set(kit, entry = { revision: kit.revision, map: new Map() });
  const cache = entry.map;
  let made = cache.get(type);
  if (made === undefined) { made = template(type, kit); cache.set(type, made); }
  return made ? made.clone(true) : null;
}

/** Cached animation lookups and measurements that belong to the model being replaced. */
const MODEL_CACHE = ['legs', 'wings', 'pickHeight', 'pickHeightAsset', 'castsShadow', 'outlined'];
/**
 * Moves a prepared creature model's parts into an existing creature's root, so the entity, its position, facing,
 * scale and AI state stay as they are while its look changes (the kit arriving after the creature spawned).
 */
export function adoptCreatureModel(root: T.Object3D, model: T.Object3D, dispose: (old: T.Object3D) => void) {
  for (const child of [...root.children]) { root.remove(child); dispose(child); }
  for (const child of [...model.children]) root.add(child);
  for (const key of MODEL_CACHE) delete root.userData[key];
  root.userData.flashMaterials = model.userData.flashMaterials; root.userData.outlines = model.userData.outlines; root.userData.creatureArt = true;
}
