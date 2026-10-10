import * as T from 'three';
import { DYE_STYLES, dyeInfo } from './dye-skins.ts';

/**
 * The 3D side of a dye (dye-skins.ts): the base piece's own model, recoloured. World.wearKit / petFor ask for the base
 * model (baseOf) and pass it through here. Plain-coloured parts keep their light and shade but take the style's hue;
 * parts coloured per vertex are multiplied by it. Prism gives each part its own hue. Materials are cached per source
 * material and style, and flagged shared so disposeTree never frees them.
 */
const cache = new Map<string, T.Material>();
function dyed(source: T.MeshStandardMaterial | T.MeshToonMaterial, style: (typeof DYE_STYLES)[keyof typeof DYE_STYLES], part: number): T.Material {
  const key = `${source.uuid}:${style.id}:${style.rainbow ? part % 6 : 0}`;
  let made = cache.get(key);
  if (made) return made;
  const copy = source.clone(), tint = new T.Color(style.tint);
  if (style.rainbow) tint.setHSL((part % 6) / 6, .85, .6);
  if (source.vertexColors || source.map) copy.color.copy(tint);
  else {
    const tone = { h: 0, s: 0, l: 0 }; source.color.getHSL(tone);
    const goal = { h: 0, s: 0, l: 0 }; tint.getHSL(goal);
    // Keep the part's light and shade, take the style's hue and (most of) its saturation; very dark or pale parts stay a little themselves.
    copy.color.setHSL(goal.h, Math.min(1, goal.s * (.55 + .45 * Math.min(1, tone.s * 2 + .3))), Math.min(.92, Math.max(.08, tone.l * .55 + goal.l * .45)));
  }
  if (style.glow && copy instanceof T.MeshStandardMaterial) { copy.emissive.set(style.glow); copy.emissiveIntensity = .55; copy.metalness = Math.max(copy.metalness, style.id === 'gilded' ? .55 : .25); copy.roughness = Math.min(copy.roughness, .45); }
  copy.userData.sharedKit = true;
  cache.set(key, copy);
  return copy;
}
/** Recolours a freshly built gear or companion model in place when `id` is a dye; any other id leaves it alone. Returns the model. */
export function applyDye<O extends T.Object3D | null>(model: O, id: string | undefined): O {
  const info = id ? dyeInfo(id) : undefined;
  if (!info || !model) return model;
  const style = DYE_STYLES[info.style]; let part = 0;
  model.traverse(node => {
    if (!(node instanceof T.Mesh) || Array.isArray(node.material)) return;
    const source = node.material;
    if (source instanceof T.MeshStandardMaterial || source instanceof T.MeshToonMaterial) node.material = dyed(source, style, part++);
  });
  model.userData.dye = info.style;
  return model;
}
