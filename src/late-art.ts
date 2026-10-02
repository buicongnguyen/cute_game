import { HERO_FILE, KIT_FILES, REFINED_ASSET_FILES, modelUrl } from './assets.ts';
import { titanKitFile } from './titan-art.ts';

/**
 * Model files that only arrived after their retries (art-retry.ts) swap their stand-ins in place. Each file names
 * the part of the world it dresses, so a late gear file rebuilds avatars only, not the scenery, the creatures and the
 * pen as well (review w15: every late file cost a full refresh, once per file).
 */
export type LateArt = 'refined' | 'scenery' | 'avatars' | 'creatures' | 'crops' | 'farm' | 'fish' | 'house';
/** house-view.ts HOUSE_FILE, not imported: house-view reaches world.ts through friend-view, and world.ts imports this. */
export const HOUSE_FILE = modelUrl('house.glb');
const ROUTES: Array<[LateArt, readonly string[]]> = [
  ['refined', [...Object.values(REFINED_ASSET_FILES), KIT_FILES.space]],
  ['scenery', [KIT_FILES.scenery, KIT_FILES.wilds, KIT_FILES.worldsBright, KIT_FILES.worldsHarsh, KIT_FILES.worldsDressing]],
  ['avatars', [HERO_FILE, KIT_FILES.wear, KIT_FILES.weapons, KIT_FILES.disguises, KIT_FILES.pets]],
  ['creatures', [KIT_FILES.creatures, KIT_FILES.forestBirds, titanKitFile]],
  ['crops', [KIT_FILES.crops, KIT_FILES.fruitCrops]],
  ['farm', [KIT_FILES.farm]],
  ['fish', [KIT_FILES.fish]],
  ['house', [HOUSE_FILE]],
];
/** The parts of the world the late files dress. Files that refresh themselves (helper, cage) name none. */
export function lateArtParts(urls: Iterable<string>): Set<LateArt> {
  const out = new Set<LateArt>();
  for (const url of urls) for (const [part, files] of ROUTES) if (files.includes(url)) out.add(part);
  return out;
}
/** Collects late files and hands them over once per frame, so several files landing together cost one refresh. */
export class LateArtQueue {
  private urls = new Set<string>();
  add(url: string) { this.urls.add(url); }
  /** The files since the last take (empty when none). */
  take(): string[] { const out = [...this.urls]; this.urls.clear(); return out; }
}
