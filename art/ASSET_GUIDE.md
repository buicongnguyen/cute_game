# Refined village assets

Created with Blender 4.5.14 LTS for Zoo Garden. All geometry and materials are original; no reference-game assets were extracted.

## Included files

- `blender/zoo-garden-village.blend`: editable objects, named materials, five asset collections, and a separate presentation studio.
- `blender/build_assets.py` and `blender/props.py`: reproducible asset authoring and export scripts.
- `../public/assets/models/*.glb`: five models loaded by the browser game.
- `exports/unity-fbx/*.fbx`: matching exports for a possible Unity port. Unity import, materials, and runtime behavior have not been tested.
- `previews/`: Blender renders of the cottage and the complete collection.
- `asset-manifest.json`: geometry counts, dimensions, and export sizes.

| Model | Refinement | Triangles |
| --- | --- | ---: |
| Cottage | Layered thatch, timber frame, stone base, arched door, windows, flower boxes, lantern, porch | 12,632 |
| Market stall | Curved striped canopy, scalloped hem, wooden counter, produce baskets | 9,560 |
| Equipment stall | Teal canopy, timber counter, small gear displays | 7,038 |
| Garden bed | Beveled wood, corner details, clear soil area for live crops | 1,196 |
| Wishing crystal | Faceted crystal cluster and tiered stone base | 1,172 |

The five GLBs total about 2.04 MB uncompressed. The garden model is reused for each plot. Materials use colors rather than image textures. Exported geometry is joined for efficient loading; the Blender source retains editable parts. Fine cottage and canopy details still need evaluation on physical phones.

## Rebuild

From the project root, with Blender on PATH:

```powershell
blender --background --factory-startup --python art/blender/build_assets.py -- --output art/generated --render
Copy-Item art/generated/models/*.glb public/assets/models/
```

Omit `--render` for a faster model-only export. `art/generated/source` contains the regenerated Blender scene; `unity-fbx` contains the regenerated FBX models. Regeneration recreates the scripted design and will not incorporate manual changes to the existing `.blend` file. To keep manual refinements, edit and export from that file instead.

Blender uses Z up and -Y as the front. GLB exports use Y up and +Z as the front, in meters, with origin at ground level. Keep these conventions and the current model footprints when exporting replacements, since the game's interaction points and obstacles are unchanged.

## Runtime behavior

`src/assets.ts` loads and caches each model once. Each scene instance owns its mesh geometry and materials so world disposal cannot damage the cache. The original procedural models remain as a fallback if an optional GLB is unavailable. Asset replacement preserves the entity used for clicks, navigation, and interactions. Garden crop groups remain live when the wooden bed is replaced.

No saved-game format was changed.
