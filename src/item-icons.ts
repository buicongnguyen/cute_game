import { ITEMS, CROPS, FISH } from './content.ts';

/**
 * Where an item's Blender icon lives under public/assets/icons/ ('crops/apple.webp', 'items/cooked_apple.webp', …), or
 * null for a decoration, which the game draws from its own 3D model (icons.ts decorIcon). Every other item has a file:
 * tests/item-icons.test.ts fails when one is missing. Crops and fish keep their own folders; everything else, cooked
 * food and farm dishes included (art/blender/kit/build_dishes.py), is in items/.
 */
export function iconPath(id: string): string | null {
  if (!Object.hasOwn(ITEMS, id) || ITEMS[id].type === 'decor') return null;
  // A dye (dye-skins.ts) shows its base piece's icon; the style's CSS filter does the recolouring (dye-ui.css).
  const file = ITEMS[id].dye?.base ?? id;
  return `${Object.hasOwn(CROPS, id) ? 'crops' : Object.hasOwn(FISH, id) ? 'fish' : 'items'}/${file}.webp`;
}
