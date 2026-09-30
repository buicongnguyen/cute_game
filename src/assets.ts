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
} as const;

export type RefinedAsset = keyof typeof REFINED_ASSET_FILES;
type SceneLoader = (url: string) => Promise<T.Group>;
const gltfLoader = new GLTFLoader();

export class RefinedAssetLibrary {
  private scenes = new Map<RefinedAsset, T.Group>();
  private loading: Promise<void> | null = null;
  private loadScene: SceneLoader;

  constructor(loadScene: SceneLoader = async url => (await gltfLoader.loadAsync(url)).scene) {
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

export const refinedAssets = new RefinedAssetLibrary();
