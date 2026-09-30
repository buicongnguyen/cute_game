import * as T from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// Vite supplies the deployment prefix; direct Node tests use the root default.
const assetBase = import.meta.env?.BASE_URL ?? '/';

export const REFINED_ASSET_FILES = {
  cottage: `${assetBase}assets/models/cottage.glb`,
  market: `${assetBase}assets/models/market-stall.glb`,
  outfitters: `${assetBase}assets/models/equipment-stall.glb`,
  garden: `${assetBase}assets/models/garden-bed.glb`,
  crystal: `${assetBase}assets/models/wishing-crystal.glb`,
  chest: `${assetBase}assets/models/storage-chest.glb`,
  workshop: `${assetBase}assets/models/workshop.glb`,
  kitchen: `${assetBase}assets/models/kitchen.glb`,
  well: `${assetBase}assets/models/well.glb`,
  rocket: `${assetBase}assets/models/rocket.glb`,
} as const;

// Multi-model kits: one GLB holds many small named models (trees, flowers, crops).
export const KIT_FILES = {
  scenery: `${assetBase}assets/models/scenery.glb`,
  crops: `${assetBase}assets/models/crops.glb`,
  fish: `${assetBase}assets/models/fish.glb`,
  wear: `${assetBase}assets/models/gear-wear.glb`,
  weapons: `${assetBase}assets/models/gear-weapons.glb`,
  disguises: `${assetBase}assets/models/disguises.glb`,
  pets: `${assetBase}assets/models/pets.glb`,
} as const;
export const HERO_FILE = `${assetBase}assets/models/hero.glb`;

export type RefinedAsset = keyof typeof REFINED_ASSET_FILES;
type SceneLoader = (url: string) => Promise<T.Group>;
const gltfLoader = new GLTFLoader();
const loadGltfScene: SceneLoader = async url => (await gltfLoader.loadAsync(url)).scene;

export class RefinedAssetLibrary {
  private scenes = new Map<RefinedAsset, T.Group>();
  private loading: Promise<void> | null = null;
  private loadScene: SceneLoader;

  constructor(loadScene: SceneLoader = loadGltfScene) {
    this.loadScene = loadScene;
  }

  loadAll(): Promise<void> {
    // An unavailable optional model must never stop the procedural game loading.
    this.loading ??= Promise.all((Object.keys(REFINED_ASSET_FILES) as RefinedAsset[]).map(async name => {
      try { this.scenes.set(name, await this.loadScene(REFINED_ASSET_FILES[name])); }
      catch { /* Keep this entity's original procedural model. */ }
    })).then(() => {});
    return this.loading;
  }

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

interface KitPart { geometry: T.BufferGeometry; material: T.Material; matrix: T.Matrix4; name: string; tag?: string }
/** Empties that mark where effects start, such as a blaster's muzzle or a rod's tip. */
interface KitMarker { name: string; matrix: T.Matrix4; tag?: string }
const MARKERS = ['muzzle', 'rod-tip'];
/** The hero part a gear piece follows: the text after `@` in its own or an ancestor's name. */
function partTag(object: T.Object3D, stop: T.Object3D) {
  for (let o: T.Object3D | null = object; o && o !== stop; o = o.parent) { const at = o.name.indexOf('@'); if (at >= 0) return o.name.slice(at + 1).replace(/_\d+$/, ''); }
  return undefined;
}

/** Marks kit geometry and materials as shared so world disposal leaves them alive. */
export function isShared(resource: { userData: Record<string, unknown> }) { return resource.userData.sharedKit === true; }

/**
 * Named models from kit GLBs. Instances share geometry and materials, which lets the
 * world batch hundreds of trees and flowers into a few draw calls.
 */
export class KitLibrary {
  ready = false;
  private models = new Map<string, KitPart[]>();
  private markers = new Map<string, KitMarker[]>();
  private tinted = new Map<string, T.Material>();
  private loading: Promise<void> | null = null;
  private urls: string[];
  private loadScene: SceneLoader;

  constructor(urls: string[], loadScene: SceneLoader = loadGltfScene) {
    this.urls = urls;
    this.loadScene = loadScene;
  }

  load(): Promise<void> {
    this.loading ??= Promise.all(this.urls.map(async url => {
      try {
        const scene = await this.loadScene(url);
        scene.updateMatrixWorld(true);
        for (const node of scene.children) {
          const inverse = node.matrixWorld.clone().invert(), parts: KitPart[] = [], markers: KitMarker[] = [];
          node.traverse(object => {
            const marker = MARKERS.find(m => object.name.startsWith(m));
            if (marker && !(object instanceof T.Mesh)) markers.push({ name: marker, matrix: inverse.clone().multiply(object.matrixWorld), tag: partTag(object, node) });
            if (!(object instanceof T.Mesh) || Array.isArray(object.material)) return;
            object.geometry.userData.sharedKit = true;
            object.material.userData.sharedKit = true;
            // A single-material child keeps its own name, so animated parts (a fish tail) can be found.
            const named = object.name || object.parent?.name || '';
            parts.push({ geometry: object.geometry, material: object.material, matrix: inverse.clone().multiply(object.matrixWorld), name: named, tag: partTag(object, node) });
          });
          if (node.name && parts.length) { this.models.set(node.name, parts); if (markers.length) this.markers.set(node.name, markers); }
        }
      } catch { /* The procedural scenery remains. */ }
    })).then(() => { this.ready = this.models.size > 0; });
    return this.loading;
  }

  has(name: string) { return this.models.has(name); }
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

  private material(source: T.Material, color?: string) {
    if (!color || !(source instanceof T.MeshStandardMaterial)) return source;
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
  constructor(url = HERO_FILE, loadScene: SceneLoader = loadGltfScene) { this.url = url; this.loadScene = loadScene; }
  load(): Promise<void> {
    this.loading ??= this.loadScene(this.url).then(scene => {
      const hero = scene.getObjectByName('hero') ?? scene;
      hero.traverse(o => { if (o instanceof T.Mesh) o.geometry.userData.sharedKit = true; });
      this.source = hero; this.ready = true;
    }).catch(() => { /* The procedural explorer remains. */ });
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
        if (copy instanceof T.MeshStandardMaterial && m.name === 'Hero shirt') copy.color.set(color);
        if (copy instanceof T.MeshStandardMaterial && m.name === 'Hero shirt shade') copy.color.copy(shade);
        return copy;
      });
      if ((o.material as T.Material[]).length === 1) o.material = (o.material as T.Material[])[0];
    });
    return hero;
  }
}

export const refinedAssets = new RefinedAssetLibrary();
export const sceneryKit = new KitLibrary([KIT_FILES.scenery]);
export const cropKit = new KitLibrary([KIT_FILES.crops]);
export const fishKit = new KitLibrary([KIT_FILES.fish]);
export const heroKit = new HeroLibrary();
// Gear the explorer can wear or hold, one file per group so each downloads only when first worn.
export const wearKit = new KitLibrary([KIT_FILES.wear]);
export const weaponKit = new KitLibrary([KIT_FILES.weapons]);
export const disguiseKit = new KitLibrary([KIT_FILES.disguises]);
export const petKit = new KitLibrary([KIT_FILES.pets]);
