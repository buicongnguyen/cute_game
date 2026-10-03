import * as T from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { toToon, toonify } from './toon.ts';
import { BUILD, DEFAULT_LOOK, DEFAULT_PIVOTS, bodyFile, fitOf, splitLook, type Body, type Fit, type LookId } from './looks.ts';
import { loadWithRetry, DEFAULT_POLICY, type RetryPolicy } from './art-retry.ts';

// Vite supplies the deployment prefix; direct Node tests use the root default.
const assetBase = import.meta.env?.BASE_URL ?? '/';
// Model files keep fixed names, so builds add each file's content hash (vite.config.ts) as ?v=. The
// service worker serves a model cache-first only when that hash matches the copy it holds, so a new
// game build never draws an older build's models (or the reverse).
const MODEL_VERSIONS: Record<string, string> = typeof __ZOO_MODEL_VERSIONS__ === 'undefined' ? {} : __ZOO_MODEL_VERSIONS__ ?? {};
export const modelUrl = (file: string) => `${assetBase}assets/models/${file}${MODEL_VERSIONS[file] ? `?v=${MODEL_VERSIONS[file]}` : ''}`;

export const REFINED_ASSET_FILES = {
  cottage: modelUrl('cottage.glb'),
  market: modelUrl('market-stall.glb'),
  outfitters: modelUrl('equipment-stall.glb'),
  garden: modelUrl('garden-bed.glb'),
  crystal: modelUrl('wishing-crystal.glb'),
  chest: modelUrl('storage-chest.glb'),
  workshop: modelUrl('workshop.glb'),
  kitchen: modelUrl('kitchen.glb'),
  well: modelUrl('well.glb'),
} as const;

// Multi-model kits: one GLB holds many small named models (trees, flowers, crops).
export const KIT_FILES = {
  scenery: modelUrl('scenery.glb'),
  crops: modelUrl('crops.glb'),
  fruitCrops: modelUrl('fruit_crops.glb'),
  fish: modelUrl('fish.glb'),
  wear: modelUrl('gear-wear.glb'),
  weapons: modelUrl('gear-weapons.glb'),
  disguises: modelUrl('disguises.glb'),
  pets: modelUrl('pets.glb'),
  space: modelUrl('space.glb'),
  wilds: modelUrl('wilds.glb'),
  worldsBright: modelUrl('worlds-bright.glb'),
  worldsHarsh: modelUrl('worlds-harsh.glb'),
  worldsDressing: modelUrl('worlds-dressing.glb'),
  farm: modelUrl('farm.glb'),
  creatures: modelUrl('creatures.glb'),
  forestBirds: modelUrl('forest-birds.glb'),
  helper: modelUrl('helper.glb'),
  cage: modelUrl('cage.glb'),
} as const;
export const HERO_FILE = modelUrl('hero.glb');

export type RefinedAsset = keyof typeof REFINED_ASSET_FILES;
type SceneLoader = (url: string) => Promise<T.Group>;
const gltfLoader = new GLTFLoader();
const loadGltfScene: SceneLoader = async url => (await gltfLoader.loadAsync(url)).scene;

export class RefinedAssetLibrary {
  private scenes = new Map<RefinedAsset, T.Group>();
  private loading: Promise<void> | null = null;
  private loadScene: SceneLoader;
  private policy: RetryPolicy;

  constructor(loadScene: SceneLoader = loadGltfScene, policy = DEFAULT_POLICY) {
    this.loadScene = loadScene; this.policy = policy;
  }

  loadAll(): Promise<void> {
    // An unavailable optional model must never stop the procedural game loading: the entity keeps
    // its procedural model until a later retry brings the file in (art-retry.ts).
    this.loading ??= Promise.all((Object.keys(REFINED_ASSET_FILES) as RefinedAsset[]).map(async name => {
      const url = REFINED_ASSET_FILES[name], keep = (scene: T.Group) => { this.scenes.set(name, bakeModel(scene)); };
      const scene = await loadWithRetry(url, () => this.loadScene(url), keep, this.policy);
      if (scene) keep(scene);
    })).then(() => {});
    return this.loading;
  }

  has(name: RefinedAsset) { return this.scenes.has(name); }
  clone(name: RefinedAsset): T.Group | null {
    const source = this.scenes.get(name);
    if (!source) return null;
    const instance = source.clone(true);
    instance.name = `refined-${name}`;
    instance.traverse(object => {
      if (!(object instanceof T.Mesh)) return;
      // World rebuilds dispose their instances. The reusable source stays alive.
      object.geometry = object.geometry.clone();
      object.material = Array.isArray(object.material)
        ? object.material.map(material => material.clone())
        : object.material.clone();
      object.castShadow = true;
      object.receiveShadow = true;
    });
    return instance;
  }
}

export interface KitPart { geometry: T.BufferGeometry; material: T.Material; matrix: T.Matrix4; name: string; tag?: string }
/** Empties that mark where effects start, such as a blaster's muzzle or a rod's tip. */
interface KitMarker { name: string; matrix: T.Matrix4; tag?: string }
const MARKERS = ['muzzle', 'rod-tip'];
/** The hero part a gear piece follows: the text after `@` in its own or an ancestor's name. */
function partTag(object: T.Object3D, stop: T.Object3D) {
  for (let o: T.Object3D | null = object; o && o !== stop; o = o.parent) { const at = o.name.indexOf('@'); if (at >= 0) return o.name.slice(at + 1).replace(/_\d+$/, ''); }
  return undefined;
}

/**
 * Plain, opaque, untextured, non-glowing standard materials can share one baked-colour material.
 * Roughness is grouped into three finishes (glossy, satin, matte); finer steps are invisible at
 * game zoom but would split one merged mesh into several.
 */
const FINISHES = [.2, .42, .58];
const finish = (roughness: number) => roughness < .3 ? FINISHES[0] : roughness < .5 ? FINISHES[1] : FINISHES[2];
type Plain = T.MeshStandardMaterial | T.MeshToonMaterial;
function plainSignature(material: T.Material) {
  if (!(material instanceof T.MeshStandardMaterial || material instanceof T.MeshToonMaterial) || material.transparent || material.map || material.vertexColors || material.alphaTest > 0) return null;
  if (material.emissiveIntensity > 0 && material.emissive.getHex() !== 0) return null;
  // Toon materials have no finish: one look per side and shading.
  if (material instanceof T.MeshToonMaterial) return [material.constructor.name, 'toon', material.side, (material as { flatShading?: boolean }).flatShading].join('|');
  return [material.constructor.name, finish(material.roughness), material.metalness.toFixed(1), material.side, material.flatShading].join('|');
}
const refinish = (material: Plain, like: Plain) => { if (material instanceof T.MeshStandardMaterial && like instanceof T.MeshStandardMaterial) material.roughness = finish(like.roughness); };
const baked = new Map<string, Plain>();
function bakedMaterial(signature: string, like: Plain) {
  let material = baked.get(signature);
  if (!material) {
    material = like.clone(); material.color.set('#ffffff'); material.vertexColors = true; refinish(material, like); material.name = 'Baked colours'; material.userData.sharedKit = true;
    baked.set(signature, material);
  }
  return material;
}

/**
 * Merges the plain meshes directly under `node` (or, with `deep`, anywhere under it) into one
 * mesh per material look with the colours baked into the vertices. A prop made of a dozen
 * coloured pieces then costs two or three draw calls instead of twelve. Glowing, see-through
 * and textured meshes, and any that `keep` names, are left as they are.
 */
export function bakeModel<O extends T.Object3D>(node: O, { deep = true, keep = () => false }: { deep?: boolean; keep?: (mesh: T.Mesh) => boolean } = {}) {
  node.updateMatrixWorld(true);
  const toNode = node.matrixWorld.clone().invert(), groups = new Map<string, { meshes: T.Mesh[]; like: Plain }>();
  const candidates: T.Mesh[] = [];
  if (deep) node.traverse(o => { if (o instanceof T.Mesh && !(o instanceof T.InstancedMesh)) candidates.push(o); });
  // Shallow: only meshes directly under the node, so named sub-parts (a sprout that hides) stay separate.
  else for (const child of node.children) if (child instanceof T.Mesh) candidates.push(child);
  for (const mesh of candidates) {
    if (Array.isArray(mesh.material) || keep(mesh) || !mesh.visible) continue;
    const signature = plainSignature(mesh.material);
    if (!signature) continue;
    const group = groups.get(signature) ?? { meshes: [], like: mesh.material as Plain }; group.meshes.push(mesh); groups.set(signature, group);
  }
  for (const [signature, { meshes, like }] of groups) {
    if (meshes.length < 2) continue;
    const indexed = meshes.every(m => m.geometry.index);
    const pieces = meshes.map(mesh => {
      let geometry = new T.BufferGeometry();
      geometry.setAttribute('position', mesh.geometry.getAttribute('position').clone());
      const normal = mesh.geometry.getAttribute('normal'); if (normal) geometry.setAttribute('normal', normal.clone());
      if (mesh.geometry.index) geometry.setIndex(mesh.geometry.index.clone());
      if (!indexed && geometry.index) geometry = geometry.toNonIndexed();
      geometry.applyMatrix4(toNode.clone().multiply(mesh.matrixWorld));
      const color = (mesh.material as Plain).color, count = geometry.getAttribute('position').count, colors = new Float32Array(count * 3);
      for (let i = 0; i < count; i++) colors.set([color.r, color.g, color.b], i * 3);
      geometry.setAttribute('color', new T.BufferAttribute(colors, 3));
      return geometry;
    });
    if (pieces.some(p => !p.getAttribute('normal')) && pieces.some(p => p.getAttribute('normal'))) { pieces.forEach(p => p.dispose()); continue; }
    const geometry = mergeGeometries(pieces, false); pieces.forEach(p => p.dispose());
    if (!geometry) continue;
    const material = like.clone(); material.color.set('#ffffff'); material.vertexColors = true; refinish(material, like); material.name = `Baked ${signature.split('|')[1]}`;
    const merged = new T.Mesh(geometry, material); merged.name = 'baked'; merged.castShadow = meshes.some(m => m.castShadow); merged.receiveShadow = true;
    // A one-material glTF node is a Mesh that can have children (sockets, limbs): hide it
    // rather than remove it, or its children would disappear with it.
    for (const mesh of meshes) { if (mesh.children.length) mesh.layers.disableAll(); else mesh.removeFromParent(); }
    node.add(merged);
  }
  // Every prepared model draws with the reference's toon ramp (RC-05).
  return toonify(node);
}

/**
 * Gathers every mesh named `name` (a two-material piece loads as `name` and `name_1`) into
 * one group with that name at the model's origin, so it can be shown or scaled as a unit.
 */
export function gatherPart(model: T.Object3D, name: string) {
  const pieces: T.Object3D[] = [];
  model.traverse(o => { if (o !== model && o.name.replace(/_d+$/, '') === name) pieces.push(o); });
  if (!pieces.length) return null;
  const group = new T.Group(); group.name = name;
  for (const piece of pieces) { piece.name = `${name}-part`; group.add(piece); }
  model.add(group); return group;
}

/** Marks kit geometry and materials as shared so world disposal leaves them alive. */
export function isShared(resource: { userData: Record<string, unknown> }) { return resource.userData.sharedKit === true; }

/**
 * Named models from kit GLBs. Instances share geometry and materials, which lets the
 * world batch hundreds of trees and flowers into a few draw calls.
 */
export class KitLibrary {
  ready = false;
  /** Bumped on every file ingested: caches built from the parts (creature templates) rebuild when a later file adds more. */
  revision = 0;
  private models = new Map<string, KitPart[]>();
  private markers = new Map<string, KitMarker[]>();
  private tinted = new Map<string, T.Material>();
  private merged = new Map<string, KitPart[]>();
  private loading: Promise<void> | null = null;
  private urls: string[];
  private loadScene: SceneLoader;
  private policy: RetryPolicy;

  constructor(urls: string[], loadScene: SceneLoader = loadGltfScene, policy = DEFAULT_POLICY) {
    this.urls = urls;
    this.loadScene = loadScene; this.policy = policy;
  }

  load(): Promise<void> {
    // A file that still fails after its quick retries leaves the procedural stand-ins; a later
    // retry adds its models and turns the kit ready (art-retry.ts announces it).
    const keep = (scene: T.Group) => { this.ingest(scene); this.ready = this.models.size > 0; };
    this.loading ??= Promise.all(this.urls.map(async url => {
      const scene = await loadWithRetry(url, () => this.loadScene(url), keep, this.policy);
      if (scene) { try { this.ingest(scene); } catch { /* The procedural scenery remains. */ } }
    })).then(() => { this.ready = this.models.size > 0; });
    return this.loading;
  }

  private ingest(scene: T.Group) {
    this.revision++;
    scene.updateMatrixWorld(true);
    for (const node of scene.children) {
      const inverse = node.matrixWorld.clone().invert(), parts: KitPart[] = [], markers: KitMarker[] = [];
      node.traverse(object => {
        const marker = MARKERS.find(m => object.name.startsWith(m));
        if (marker && !(object instanceof T.Mesh)) markers.push({ name: marker, matrix: inverse.clone().multiply(object.matrixWorld), tag: partTag(object, node) });
        if (!(object instanceof T.Mesh) || Array.isArray(object.material)) return;
        object.geometry.userData.sharedKit = true;
        // Kit models draw with the toon ramp like everything else (RC-05).
        object.material = toToon(object.material);
        object.material.userData.sharedKit = true;
        // A single-material child keeps its own name, so animated parts (a fish tail) can be found.
        const named = object.name || object.parent?.name || '';
        parts.push({ geometry: object.geometry, material: object.material, matrix: inverse.clone().multiply(object.matrixWorld), name: named, tag: partTag(object, node) });
      });
      if (node.name && parts.length) { this.models.set(node.name, parts); if (markers.length) this.markers.set(node.name, markers); }
    }
  }

  has(name: string) { return this.models.has(name); }
  /**
   * The meshes that make up `name`, placed inside the model, for drawing many copies as
   * instances. `tint` maps material names to replacement colours, as in `instance`.
   */
  parts(name: string, tint?: Record<string, string>): KitPart[] | undefined {
    return this.models.get(name)?.map(part => ({ ...part, material: this.material(part.material, tint?.[part.material.name]) }));
  }
  /** True once `load` has been called, whether or not the file has arrived. */
  get requested() { return this.loading !== null; }

  /** A new group for `name`; `tint` maps material names to replacement colours. */
  instance(name: string, tint?: Record<string, string>): T.Group | null {
    const parts = this.models.get(name);
    if (!parts) return null;
    const group = new T.Group();
    group.name = name;
    for (const part of parts) {
      const mesh = new T.Mesh(part.geometry, this.material(part.material, tint?.[part.material.name]));
      mesh.applyMatrix4(part.matrix);
      mesh.name = part.name;
      if (part.tag) mesh.userData.tag = part.tag;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);
    }
    for (const marker of this.markers.get(name) ?? []) {
      const empty = new T.Object3D(); empty.name = marker.name; empty.applyMatrix4(marker.matrix);
      if (marker.tag) empty.userData.tag = marker.tag;
      group.add(empty);
    }
    return group;
  }

  /**
   * The parts of `name` for drawing many copies, with every set of plain parts that differ
   * only in colour merged into one mesh whose colours are baked into its vertices. A
   * three-material tree then costs one draw call per batch instead of three. Glowing,
   * transparent or textured parts stay separate so they keep their look.
   */
  mergedParts(name: string, tint?: Record<string, string>): KitPart[] | undefined {
    const key = `${name}|${tint ? JSON.stringify(tint) : ''}`, known = this.merged.get(key);
    if (known) return known;
    const parts = this.parts(name, tint);
    if (!parts) return undefined;
    const groups = new Map<string, KitPart[]>(), kept: KitPart[] = [];
    for (const part of parts) {
      const signature = plainSignature(part.material);
      if (!signature) { kept.push(part); continue; }
      const list = groups.get(signature) ?? []; list.push(part); groups.set(signature, list);
    }
    const result = [...kept];
    for (const [signature, list] of groups) {
      if (list.length === 1) { result.push(list[0]); continue; }
      const pieces = list.map(part => {
        let geometry = new T.BufferGeometry();
        geometry.setAttribute('position', part.geometry.getAttribute('position').clone());
        const normal = part.geometry.getAttribute('normal'); if (normal) geometry.setAttribute('normal', normal.clone());
        if (part.geometry.index) geometry.setIndex(part.geometry.index.clone());
        geometry.applyMatrix4(part.matrix);
        if (geometry.index && list.some(p => !p.geometry.index)) geometry = geometry.toNonIndexed();
        const color = (part.material as Plain).color, count = geometry.getAttribute('position').count, colors = new Float32Array(count * 3);
        for (let i = 0; i < count; i++) colors.set([color.r, color.g, color.b], i * 3);
        geometry.setAttribute('color', new T.BufferAttribute(colors, 3));
        return geometry;
      });
      const geometry = mergeGeometries(pieces, false);
      pieces.forEach(p => p.dispose());
      if (!geometry) { result.push(...list); continue; }
      geometry.userData.sharedKit = true;
      result.push({ geometry, material: bakedMaterial(signature, list[0].material as Plain), matrix: new T.Matrix4(), name, tag: list[0].tag });
    }
    this.merged.set(key, result);
    return result;
  }

  private material(source: T.Material, color?: string) {
    if (!color || !(source instanceof T.MeshStandardMaterial || source instanceof T.MeshToonMaterial)) return source;
    const key = `${source.uuid}:${color}`;
    let tinted = this.tinted.get(key);
    if (!tinted) {
      const copy = source.clone();
      copy.color.set(color);
      copy.userData.sharedKit = true;
      this.tinted.set(key, copy);
      tinted = copy;
    }
    return tinted;
  }
}

const EARLESS = new WeakMap<T.BufferGeometry, T.BufferGeometry>();
/**
 * A body style's ears (hero-<look>.glb `head-leaf`, build_hero_styles.py) join the head's baked mesh, so they cost no
 * draw of their own (the default hero's sprout bakes into its head the same way). The head without them is kept too:
 * tuckEars swaps it in under a hat, the way the sprout is hidden.
 */
export function mergeEars(hero: T.Object3D) {
  const leaf = hero.getObjectByName('head-leaf'), head = hero.getObjectByName('head');
  const ears = leaf?.children.find((o): o is T.Mesh => o instanceof T.Mesh), target = head?.children.find((o): o is T.Mesh => o instanceof T.Mesh && !Array.isArray(o.material) && (o.material as Plain).vertexColors && !!o.geometry.getAttribute('color'));
  if (!leaf || !ears || !target || !ears.geometry.getAttribute('color')) return;
  hero.updateMatrixWorld(true);
  let base = target.geometry, extra = ears.geometry.clone().applyMatrix4(target.matrixWorld.clone().invert().multiply(ears.matrixWorld));
  if (!base.index || !extra.index) { if (base.index) base = base.toNonIndexed(); if (extra.index) extra = extra.toNonIndexed(); }
  for (const name of Object.keys(extra.attributes)) if (!base.getAttribute(name)) extra.deleteAttribute(name);
  const merged = mergeGeometries([base, extra], false); extra.dispose(); if (!merged) return;
  // The earless head is kit geometry too (tuckEars swaps it in): disposing it with one explorer would make every
  // later hat re-upload it.
  target.geometry.userData.sharedKit = true;
  EARLESS.set(merged, target.geometry); target.geometry = merged; leaf.removeFromParent();
}
/** Hides (or shows) a styled explorer's ears: they tuck under hats and most disguises, as the sprout does. */
export function tuckEars(model: T.Object3D, hide: boolean) {
  model.traverse(o => { if (o instanceof T.Mesh) { const earless = EARLESS.get(o.geometry); if (hide && earless) o.geometry = earless; } });
}

/**
 * The explorer model: named parts (body, head, arms, legs) keep their hierarchy so
 * they can be animated and dressed. Geometry is shared; each instance gets its own
 * materials so its shirt can take the player's colour.
 */
export class HeroLibrary {
  ready = false;
  private source: T.Object3D | null = null;
  private loading: Promise<void> | null = null;
  private url: string;
  private loadScene: SceneLoader;
  private policy: RetryPolicy;
  private dress?: (hero: T.Object3D, scene: T.Group) => void;
  /** `dress` runs after each part is baked and before the ears merge: the character builder adds ears and a tail there. */
  constructor(url = HERO_FILE, loadScene: SceneLoader = loadGltfScene, policy = DEFAULT_POLICY, dress?: (hero: T.Object3D, scene: T.Group) => void) { this.url = url; this.loadScene = loadScene; this.policy = policy; this.dress = dress; }
  get requested() { return this.loading !== null; }
  load(): Promise<void> {
    // Until the file arrives (a retry may bring it later) the procedural explorer stands in.
    const keep = (scene: T.Group) => {
      const hero = scene.getObjectByName('hero') ?? scene;
      // Each posable part becomes one or two meshes; the shirt keeps its own material for recolouring.
      const shirt = (mesh: T.Mesh) => /^Hero shirt/.test((mesh.material as T.Material).name);
      for (const part of ['body', 'head', 'arm-left', 'arm-right', 'leg-left', 'leg-right', 'head-leaf']) { const node = hero.getObjectByName(part); if (node) bakeModel(node, { deep: false, keep: shirt }); }
      this.dress?.(hero, scene); mergeEars(hero);
      toonify(hero); hero.traverse(o => { if (o instanceof T.Mesh) o.geometry.userData.sharedKit = true; });
      this.source = hero; this.ready = true;
    };
    this.loading ??= loadWithRetry(this.url, () => this.loadScene(this.url), keep, this.policy).then(scene => { if (scene) keep(scene); }).catch(() => { /* The procedural explorer remains. */ });
    return this.loading;
  }
  instance(color: string): T.Group | null {
    if (!this.source) return null;
    const hero = new T.Group(), body = this.source.clone(true);
    body.position.set(0, 0, 0); body.rotation.set(0, 0, 0); body.scale.set(1, 1, 1);
    hero.add(body); hero.name = 'hero';
    // Poses set x (swing) then z (splay) on the arms, the same order the procedural explorer uses.
    for (const arm of ['arm-left', 'arm-right']) { const node = body.getObjectByName(arm); if (node) node.rotation.order = 'YXZ'; }
    const shade = new T.Color(color).multiplyScalar(.72);
    body.traverse(o => {
      if (!(o instanceof T.Mesh)) return;
      o.castShadow = true; o.receiveShadow = true;
      o.material = (Array.isArray(o.material) ? o.material : [o.material]).map(m => {
        const copy = m.clone();
        const shirt = copy instanceof T.MeshStandardMaterial || copy instanceof T.MeshToonMaterial ? copy : null;
        if (shirt && m.name === 'Hero shirt') shirt.color.set(color);
        if (shirt && m.name === 'Hero shirt shade') shirt.color.copy(shade);
        return copy;
      });
      if ((o.material as T.Material[]).length === 1) o.material = (o.material as T.Material[])[0];
    });
    return hero;
  }
}

export const refinedAssets = new RefinedAssetLibrary();
export const sceneryKit = new KitLibrary([KIT_FILES.scenery]);
export const cropKit = new KitLibrary([KIT_FILES.crops,KIT_FILES.fruitCrops]);
export const fishKit = new KitLibrary([KIT_FILES.fish]);
export const heroKit = new HeroLibrary();
/**
 * Character-builder combinations (looks.ts): body x height is its own hero file; ears and tails come from
 * hero-parts.glb (modelled on the default hero), placed with the height's FIT like gear, then baked into the head
 * and body meshes, so every combination draws exactly what the default explorer draws. Raw files are fetched and
 * parsed once and shared between the combinations that use them.
 */
const rawScenes = new Map<string, Promise<T.Group>>();
let heroLoader: SceneLoader = loadGltfScene;
/** Tests load the combination files from disk (Node has no fetch for model URLs); this also forgets cached kits. */
export function useHeroLoader(load: SceneLoader) { heroLoader = load; rawScenes.clear(); heroStyleKits.clear(); }
const rawScene = (file: string) => {
  let p = rawScenes.get(file); if (!p) { p = heroLoader(modelUrl(file)); rawScenes.set(file, p); p.catch(() => rawScenes.delete(file)); }
  return p.then(scene => scene.clone(true));
};
/** One vertex-coloured geometry from a parts-file piece, moved from default-hero space into a part's space. */
export function bakePart(piece: T.Object3D, pivot: [number, number, number], fit?: Fit) {
  piece.updateMatrixWorld(true);
  const toPart = new T.Matrix4().makeTranslation(-pivot[0], -pivot[1], -pivot[2]);
  if (fit) toPart.premultiply(new T.Matrix4().makeScale(...fit.scale)).premultiply(new T.Matrix4().makeTranslation(...fit.offset));
  const pieces: T.BufferGeometry[] = [];
  piece.traverse(o => {
    if (!(o instanceof T.Mesh)) return;
    let g = new T.BufferGeometry(); g.setAttribute('position', o.geometry.getAttribute('position').clone());
    const n = o.geometry.getAttribute('normal'); if (n) g.setAttribute('normal', n.clone());
    if (o.geometry.index) { g.setIndex(o.geometry.index.clone()); const flat = g.toNonIndexed(); g.dispose(); g = flat; }
    g.applyMatrix4(toPart.clone().multiply(o.matrixWorld)); if (!n) g.computeVertexNormals();
    const c = (o.material as Plain).color ?? new T.Color('#ffffff'), count = g.getAttribute('position').count, colors = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) colors.set([c.r, c.g, c.b], i * 3);
    g.setAttribute('color', new T.BufferAttribute(colors, 3)); pieces.push(g);
  });
  const merged = pieces.length ? mergeGeometries(pieces, false) : null; pieces.forEach(p => p.dispose()); return merged;
}
/** Merges a baked geometry (part space) into the part's vertex-coloured mesh; false when the part has none. */
export function mergeIntoPart(part: T.Object3D, extra: T.BufferGeometry) {
  const target = part.children.find((o): o is T.Mesh => o instanceof T.Mesh && !Array.isArray(o.material) && !!(o.material as Plain).vertexColors && !!o.geometry.getAttribute('color'));
  if (!target) return false;
  let base = target.geometry, add = extra.clone().applyMatrix4(target.matrix.clone().invert());
  if (base.index) base = base.toNonIndexed();
  for (const name of Object.keys(add.attributes)) if (!base.getAttribute(name)) add.deleteAttribute(name);
  const merged = mergeGeometries([base, add], false); add.dispose(); if (base !== target.geometry) base.dispose();
  if (!merged) return false; target.geometry = merged; return true;
}
/**
 * Puts a combination's ears or head decoration (as the head-leaf, which mergeEars bakes into the head) and tail on a
 * baked hero. A decoration (an animal hood) brings its own ears, so it takes the head-leaf instead of the ears.
 */
function dressEars(hero: T.Object3D, parts: T.Object3D, ears: string, deco: string, fit: Partial<Record<string, Fit>>) {
  const head = hero.getObjectByName('head'), body = hero.getObjectByName('body'); if (!head || !body) return;
  const earPiece = parts.getObjectByName(deco !== 'bare' ? 'deco-' + deco : 'ears-' + ears), tailPiece = parts.getObjectByName('tail-' + ears);
  const earGeo = earPiece && bakePart(earPiece, DEFAULT_PIVOTS.head, fit.head), tailGeo = tailPiece && bakePart(tailPiece, DEFAULT_PIVOTS.body, fit.body);
  if (tailGeo) { mergeIntoPart(body, tailGeo); tailGeo.dispose(); }
  const like = head.children.find((o): o is T.Mesh => o instanceof T.Mesh && !!(o.material as Plain).vertexColors);
  if (!earGeo || !like) return;
  head.getObjectByName('head-leaf')?.removeFromParent(); // ears take the sprout's place (and its tuck-under-hats rule)
  const leaf = new T.Group(); leaf.name = 'head-leaf'; leaf.add(new T.Mesh(earGeo, like.material)); head.add(leaf);
}
/**
 * A build (looks.ts BUILD) on a raw body file, before baking: the torso and limbs widen or narrow about their own
 * pivots and the shoulders and hips spread, so the same meshes (and draws) make a sturdy or slim explorer.
 */
export function applyBuild(scene: T.Object3D, body: Body) {
  const b = BUILD[body]; if (!b) return;
  const widen = (name: string, x: number, z: number, spread: number) => {
    const part = scene.getObjectByName(name); if (!part) return;
    part.position.x *= spread; const m = new T.Matrix4().makeScale(x, 1, z);
    for (const child of part.children) if (child instanceof T.Mesh) child.applyMatrix4(m);
  };
  widen('body', b.torso[0], b.torso[1], 1);
  for (const arm of ['arm-left', 'arm-right']) widen(arm, b.limb, b.limb, b.spread);
  for (const leg of ['leg-left', 'leg-right']) widen(leg, b.limb, b.limb, b.hips);
}
const heroStyleKits = new Map<string, HeroLibrary>();
export function heroKitFor(look: LookId): HeroLibrary {
  if (look === DEFAULT_LOOK) return heroKit;
  let kit = heroStyleKits.get(look);
  if (!kit) {
    const l = splitLook(look), file = bodyFile(l.body, l.height); let parts: T.Group | null = null;
    const load: SceneLoader = async () => { const [scene, p] = await Promise.all([rawScene(file), l.ears === 'none' && l.deco === 'bare' ? null : rawScene('hero-parts.glb')]); parts = p; applyBuild(scene, l.body);
      if (p) scene.getObjectByName('head-leaf')?.removeFromParent(); // before baking, or the head bake would swallow the sprout beside the ears
      return scene; };
    kit = new HeroLibrary(modelUrl(file), load, DEFAULT_POLICY, hero => { if (parts) dressEars(hero, parts, l.ears, l.deco, fitOf(look)); });
    heroStyleKits.set(look, kit);
  }
  return kit;
}
// Gear the explorer can wear or hold, one file per group so each downloads only when first worn.
export const wearKit = new KitLibrary([KIT_FILES.wear]);
export const weaponKit = new KitLibrary([KIT_FILES.weapons]);
/** New gameplay item, existing Blender trident geometry; no duplicate weapon download. */
export const weaponModelName = (id: string) => id === 'harpoon' ? 'trident' : id;
export const disguiseKit = new KitLibrary([KIT_FILES.disguises]);
export const petKit = new KitLibrary([KIT_FILES.pets]);
/** The starship, its launch pad, stardust and asteroids. */
export const spaceKit = new KitLibrary([KIT_FILES.space]);
/** Scenery for the home wilds and the other planets, loaded the first time each is needed. */
export const wildsKit = new KitLibrary([KIT_FILES.wilds]);
export const brightKit = new KitLibrary([KIT_FILES.worldsBright]);
export const harshKit = new KitLibrary([KIT_FILES.worldsHarsh]);
/** Small ground dressing for every world (pebbles, sprinkles, shells...), baked into the 2D cover cards. */
export const dressingKit = new KitLibrary([KIT_FILES.worldsDressing]);
/** The animal pen (farm-view.ts), loaded the first time the home pen is built. */
export const farmKit = new KitLibrary([KIT_FILES.farm]);
/** The garden helper (helper-view.ts), loaded once a helper is owned or seen. */
export const helperKit = new KitLibrary([KIT_FILES.helper]);
/** The prisoners' cages (cage-view.ts), loaded the first time a cage is shown. */
export const cageKit = new KitLibrary([KIT_FILES.cage]);
