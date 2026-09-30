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
} as const;

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

interface KitPart { geometry: T.BufferGeometry; material: T.Material; matrix: T.Matrix4 }

/** Marks kit geometry and materials as shared so world disposal leaves them alive. */
export function isShared(resource: { userData: Record<string, unknown> }) { return resource.userData.sharedKit === true; }

/**
 * Named models from kit GLBs. Instances share geometry and materials, which lets the
 * world batch hundreds of trees and flowers into a few draw calls.
 */
export class KitLibrary {
  ready = false;
  private models = new Map<string, KitPart[]>();
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
          const inverse = node.matrixWorld.clone().invert(), parts: KitPart[] = [];
          node.traverse(object => {
            if (!(object instanceof T.Mesh) || Array.isArray(object.material)) return;
            object.geometry.userData.sharedKit = true;
            object.material.userData.sharedKit = true;
            parts.push({ geometry: object.geometry, material: object.material, matrix: inverse.clone().multiply(object.matrixWorld) });
          });
          if (node.name && parts.length) this.models.set(node.name, parts);
        }
      } catch { /* The procedural scenery remains. */ }
    })).then(() => { this.ready = this.models.size > 0; });
    return this.loading;
  }

  has(name: string) { return this.models.has(name); }

  /** A new group for `name`; `tint` maps material names to replacement colours. */
  instance(name: string, tint?: Record<string, string>): T.Group | null {
    const parts = this.models.get(name);
    if (!parts) return null;
    const group = new T.Group();
    group.name = name;
    for (const part of parts) {
      const mesh = new T.Mesh(part.geometry, this.material(part.material, tint?.[part.material.name]));
      mesh.applyMatrix4(part.matrix);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);
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

export const refinedAssets = new RefinedAssetLibrary();
export const sceneryKit = new KitLibrary([KIT_FILES.scenery]);
export const cropKit = new KitLibrary([KIT_FILES.crops]);
