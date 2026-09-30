# Zoo Garden art kit

Built with Blender 4.5 LTS by headless generators. All geometry and materials are original; no reference-game assets were extracted. The look is a glossy toy style: chunky bevelled shapes, saturated warm colours and flat colour materials with no image textures.

## Files

- `blender/kit/style.py`: the shared palette, materials, bevelled primitives, glTF export and the preview camera, which matches the game's 42° orthographic view.
- `blender/kit/build_props.py`: the ten village props.
- `blender/kit/build_nature.py`: the scenery kit, the 19 crops and their interface icons.
- `blender/kit/build_fish.py`: 18 fish and the old boot, pond dressing (bobber, lily pad and flower, reeds) and the fish icons.
- `blender/kit/hero_spec.py`: the explorer's part pivots, hand grips and body envelope, shared by every gear generator so pieces fit the same body.
- `blender/kit/build_hero.py`: the explorer (`hero.glb`) and the ten disguises.
- `blender/kit/build_wear.py`: hats, outfits and boots.
- `blender/kit/build_weapons.py`: swords, blasters, rods and other held weapons, plus the seven pets.
- `blender/kit/build_items.py`: icons for materials, foods, seeds and farm supplies.
- `blender/kit/CONTRACT.md`: footprints, heights, triangle budgets, node names and material names that the game relies on. Both generators fail rather than export a model that breaks it.
- `../public/assets/models/*.glb`: the models the game loads.
- `../public/assets/icons/crops/*.webp`, `icons/fish/*.webp` and `icons/items/*.webp`: 160 px icons used in the seed picker, backpack, shop, market, crafting lists, garden labels and fish collection. Decoration icons are drawn by the game from the placed models instead.
- `exports/unity-fbx/*.fbx`: prop exports for a possible Unity port. Unity import has not been tested.
- `previews/kit/`: Blender renders of every prop, the scenery, the crops, the fish, the explorer in each hat, outfit, boot, weapon and disguise, the pets, and icon contact sheets.
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
| `hero.glb` | The explorer: `body`, `head` (with the `head-leaf` sprout), both arms with hand grips, both legs | 3,304 | 77 KB |
| `gear-wear.glb` | 19 hats that follow the head, 17 outfits whose sleeves follow the arms, and 5 pairs of boots that follow the legs | 324–1,072 each | 680 KB |
| `gear-weapons.glb` | 19 weapons held at the right hand, with `muzzle` and `rod-tip` markers | 356–888 each | 427 KB |
| `disguises.glb` | Ten costumes, split into pieces that follow the head, body, arms and legs | 2,212–2,484 each | 581 KB |
| `pets.glb` | Seven pets; the parrot, firefly and dragon have separate wings that flap | 1,268–1,440 each | 249 KB |

The models total about 3.4 MB and the icons about 0.6 MB. A new player downloads the world models and `hero.glb` only; each gear file loads the first time something from it is worn.

## Rebuild

From the project root, with Blender 4.5 on PATH:

```powershell
blender -b --factory-startup --python art/blender/kit/build_props.py -- --install --render --fbx
blender -b --factory-startup --python art/blender/kit/build_nature.py -- --install --render
blender -b --factory-startup --python art/blender/kit/build_fish.py -- --install --render
blender -b --factory-startup --python art/blender/kit/build_hero.py -- --install --render
blender -b --factory-startup --python art/blender/kit/build_wear.py -- --install --render
blender -b --factory-startup --python art/blender/kit/build_weapons.py -- --install --render
blender -b --factory-startup --python art/blender/kit/build_items.py -- --install --render
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
- **Explorer:** `HeroLibrary` keeps the explorer's part hierarchy, so the game poses the arms, legs, head and body for walking, attacks, skills and fishing. Each explorer gets its own shirt materials in the player's colour.
- **Gear:** every gear piece is named `<id>_<piece>@<part>` and is modelled around the resting explorer. The game re-parents each piece to the part after `@`, so hats turn with the head, sleeves swing with the arms and weapons stay in the right hand. Buying gear equips it at once. Each gear file downloads only the first time something from it is worn, and a slot shows simple shapes until then. The sprout hides under hats and most costumes.
- **Fallbacks:** if any file fails to load, the matching procedural shapes and emoji icons are used instead.

No saved-game format was changed.
