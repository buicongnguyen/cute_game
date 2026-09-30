# Zoo Garden art kit

Built with Blender 4.5 LTS by two headless generators. All geometry and materials are original; no reference-game assets were extracted. The look is a glossy toy style: chunky bevelled shapes, saturated warm colours and flat colour materials with no image textures.

## Files

- `blender/kit/style.py`: the shared palette, materials, bevelled primitives, glTF export and the preview camera, which matches the game's 42° orthographic view.
- `blender/kit/build_props.py`: the ten village props.
- `blender/kit/build_nature.py`: the scenery kit, the 19 crops and their interface icons.
- `blender/kit/build_fish.py`: 18 fish and the old boot, pond dressing (bobber, lily pad and flower, reeds) and the fish icons.
- `blender/kit/CONTRACT.md`: footprints, heights, triangle budgets, node names and material names that the game relies on. Both generators fail rather than export a model that breaks it.
- `../public/assets/models/*.glb`: the models the game loads.
- `../public/assets/icons/crops/*.webp` and `icons/fish/*.webp`: 160 px icons used in the seed picker, backpack, market, garden labels and fish collection.
- `exports/unity-fbx/*.fbx`: prop exports for a possible Unity port. Unity import has not been tested.
- `previews/kit/`: Blender renders of every prop, the scenery, the crops and an icon contact sheet.
- `asset-manifest.json`: triangles, bounds, materials and file sizes from the last build.

## What the game uses

| File | Contents | Triangles | Size |
| --- | --- | ---: | ---: |
| `cottage.glb` | Round cottage with a three-tier golden thatch roof, red door, flower boxes and porch | 7,784 | 199 KB |
| `market-stall.glb` | Red and white awning, produce crates and an energy sign | 4,260 | 116 KB |
| `equipment-stall.glb` | Sky-blue awning, sword and shield rack, hats | 4,452 | 120 KB |
| `garden-bed.glb` | Raised wooden bed with two soil ridges; copied for each of up to 33 beds | 784 | 23 KB |
| `wishing-crystal.glb` | Glowing crystal cluster in a gold-trimmed fountain | 964 | 47 KB |
| `storage-chest.glb` | Treasure chest with gold bands | 1,136 | 36 KB |
| `workshop.glb` | Workbench, pegboard tools, anvil on a stump, striped awning | 3,364 | 100 KB |
| `kitchen.glb` | Cauldron of soup over glowing embers | 2,440 | 60 KB |
| `well.glb` | Stone well with a red gable roof and bucket | 2,824 | 88 KB |
| `rocket.glb` | Rocket on a hazard-striped launch pad, used on every world | 3,772 | 102 KB |
| `scenery.glb` | 11 pieces: blossom, round and pine trees, bush, flowers, grass tuft, rock, stepping stone, fence, gate, mushroom | 36–598 each | 82 KB |
| `crops.glb` | A sprout plus one mature model for each of the 19 crops | 97–370 each | 197 KB |
| `fish.glb` | 18 fish and a boot, each with a separately wagging tail, plus the bobber, lily pad, lily flower and reeds | 148–450 each | 308 KB |

The models and icons total about 1.7 MB.

## Rebuild

From the project root, with Blender 4.5 on PATH:

```powershell
blender -b --factory-startup --python art/blender/kit/build_props.py -- --install --render --fbx
blender -b --factory-startup --python art/blender/kit/build_nature.py -- --install --render
blender -b --factory-startup --python art/blender/kit/build_fish.py -- --install --render
```

- `--install` copies the results into `public/`. Without it, output stays in `art/generated/kit/`, which is not tracked.
- `--render` refreshes the previews. `--fbx` refreshes the Unity exports.
- `--only a,b` rebuilds some props. For nature, `--only` takes `scenery`, `crops` or `icons`; for fish, `models` or `icons`.

Each build takes seconds and is deterministic, so an unchanged script produces byte-identical files.

Blender uses Z up with the front facing -Y. The GLBs are Y up with the front facing +Z, in metres, with the origin at the ground centre. Crops face the camera; the game turns them at most 30° either way.

## Runtime behaviour

- **Props:** `src/assets.ts` loads the ten props once and gives each placed copy its own geometry and materials, so rebuilding a world cannot damage the cache. Each placeholder shape is replaced in place when its model arrives, keeping the entity used for clicks, navigation and interaction.
- **Scenery:** the world waits up to four seconds for the scenery kit before its first build. Trees, flowers, fences and stones share geometry and materials. The world merges them by material into 48 m chunks, so hundreds of trees cost a few draw calls and off-screen chunks are skipped. Other worlds reuse the same pieces with tinted `Leaf`, `Blossom`, `Pine`, `Bark`, `Grass` and `Rock` materials.
- **Dressing:** stepping stones, bushes and mushrooms in the village are decoration only. They add no obstacles, so every player's map and pathfinding stay identical online.
- **Crops:** a bed shows the sprout while young, a smaller copy of the real crop while growing, and the full crop with a sparkle when ready. Each stage pops in with a springy bounce and ripe crops sway.
- **Fish:** `src/fishing-view.ts` stocks every pond with species from its water. Fish swim under a translucent surface at their manifest display scale and depth, wag their tails, nibble the bobber, fight on the line and leap out when caught. Pond depths and tail hinges are part of the contract.
- **Fallbacks:** if any file fails to load, the matching procedural shapes and emoji icons are used instead.

No saved-game format was changed.
