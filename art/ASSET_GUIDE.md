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
- `blender/kit/build_wilds.py`: the home wilds pieces: swamp tree, log, toadstools, red rock, dead tree, dry bush, crystals, fern and reeds.
- `blender/kit/build_worlds_bright.py`: candy, toy, cloud, jungle and ocean scenery.
- `blender/kit/build_worlds_harsh.py`: ice, lava and night-world scenery.
- `blender/kit/build_space.py`: the starship (with a separate flame), its launch pad, stardust and three asteroids.
- `blender/kit/build_farm.py`: the farm pen: hen, chick, cow and calf with named parts for animation, fence segment, gate, feed and water troughs, coop, hay bale, and the egg, milk and egg-basket products with their icons.
- `blender/kit/CONTRACT.md`: footprints, heights, triangle budgets, node names and material names that the game relies on. Both generators fail rather than export a model that breaks it.
- `../public/assets/models/*.glb`: the models the game loads.
- `../public/assets/icons/crops/*.webp`, `icons/fish/*.webp` and `icons/items/*.webp`: 160 px icons used in the seed picker, backpack, shop, market, crafting lists, garden labels and fish collection. Decoration icons are drawn by the game from the placed models instead.
- `exports/unity-fbx/*.fbx`: prop exports for a possible Unity port. Unity import has not been tested.
- `previews/kit/`: Blender renders of every prop, the scenery, the crops, the fish, the explorer in each hat, outfit, boot, weapon and disguise, the pets, the farm pen (`farm.webp`, `farm-pen.webp`, `farm-poses.webp`), and icon contact sheets.
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
| `scenery.glb` | 11 pieces: blossom, round and pine trees, bush, flowers, grass tuft, rock, stepping stone, fence, gate, mushroom | 36–598 each | 82 KB |
| `crops.glb` | A sprout plus one mature model for each of the 19 crops | 97–370 each | 197 KB |
| `fish.glb` | 18 fish and a boot, each with a separately wagging tail, plus the bobber, lily pad, lily flower and reeds | 148–450 each | 308 KB |
| `hero.glb` | The explorer: `body`, `head` (with the `head-leaf` sprout), both arms with hand grips, both legs | 3,304 | 77 KB |
| `gear-wear.glb` | 19 hats that follow the head, 17 outfits whose sleeves follow the arms, and 5 pairs of boots that follow the legs | 324–1,072 each | 680 KB |
| `gear-weapons.glb` | 19 weapons held at the right hand, with `muzzle` and `rod-tip` markers | 356–888 each | 427 KB |
| `disguises.glb` | Ten costumes, split into pieces that follow the head, body, arms and legs | 2,212–2,484 each | 581 KB |
| `pets.glb` | Seven pets; the parrot, firefly and dragon have separate wings that flap | 1,268–1,440 each | 249 KB |
| `space.glb` | Starship with a separate `flame`, launch pad (deck at 0.31 m), stardust, rock, ice and lava asteroids | 100–2,360 each | 129 KB |
| `wilds.glb` | Nine home-wilds pieces for the forest, swamp and canyon, also used for reeds around every pond | 114–496 each | 67 KB |
| `worlds-bright.glb` | Lollipop tree, candy cane, gumdrops, donut, cupcake, toy blocks, toy ball, cloud tree, sky rock, jungle tree, palm, coral | 150–523 each | 126 KB |
| `worlds-harsh.glb` | Snowy pine, ice spire, snow rock, snowman, lava rock, obsidian, ash tree, small volcano, night tree | 120–416 each | 95 KB |

The models total about 3.7 MB and the icons about 0.6 MB. A new player downloads the world models and `hero.glb` only; each gear file loads the first time something from it is worn.

Ready but not loaded by the game yet:

| File | Contents | Triangles | Size |
| --- | --- | ---: | ---: |
| `farm.glb` | Farm pen: hen, chick, cow and calf, each split into body, head, legs, tail (and wings for the birds) around their joints; a 2 m fence segment, a gate with a swinging door, feed and water troughs, a coop and a hay bale; egg, milk bottle and egg basket | 128–1,490 each | 272 KB |

The egg, milk and egg-basket icons (`icons/items/egg.webp`, `milk.webp`, `egg_basket.webp`) come from the same build. The offline worker keeps `farm.glb` the first time it is fetched instead of downloading it at install.

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
blender -b --factory-startup --python art/blender/kit/build_wilds.py -- --install --render
blender -b --factory-startup --python art/blender/kit/build_worlds_bright.py -- --install --render
blender -b --factory-startup --python art/blender/kit/build_worlds_harsh.py -- --install --render
blender -b --factory-startup --python art/blender/kit/build_space.py -- --install --render
blender -b --factory-startup --python art/blender/kit/build_farm.py -- --install --render
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
- **Scenery placement:** `src/biomes.ts` plans every world from tables that follow the reference game's density: each home region and each planet has its own mix and counts, plus three loose border rows just outside the walkable circle. The plan is seeded and never depends on which files have loaded, so every player gets the same trees and obstacles; trees and rocks among it block, ground cover does not.
- **Scenery drawing:** `src/scatter.ts` draws the plan as instances, one batch per model part per 64 m tile (centred on the village), so off-screen tiles are skipped. Parts that differ only in colour are merged first with their colours baked into the vertices (`KitLibrary.mergedParts`), and props and the explorer are baked the same way when they load (`bakeModel`). Ground cover casts no shadows, and battery saver draws half of it. Creatures cast shadows only near the view.
- **Ground:** `src/ground.ts` shades 40 m tiles with vertex colours: soft home-region blends, gentle noise, sand trails, sandy pond halos, a lighter landing area, the toy play-mat checker (a tiny texture), and hills beyond the border.
- **Space:** `src/space.ts` simulates the flight (fuel, boost, stardust, asteroid bounces, the edge of space, discovery and landing); `src/space-view.ts` draws the stars, nebulae, noise-shaded planets with atmospheres and rings, instanced asteroids and stardust, the ship and its exhaust; `src/ship-sequence.ts` plays take-off and landing on the pad.
- **Loading:** the home wilds load with the village scenery; each planet's scenery file loads the first time that planet is visited or discovered in space, and the offline worker keeps it on first use.
- **Fallbacks:** if any file fails to load, the matching procedural shapes and emoji icons are used instead.
- `build_props.py` still writes `rocket.glb`; the game now uses the pad and ship from `space.glb`, so leave `rocket.glb` out of `public/`.

No saved-game format was changed.

## Forest hunting addition

`forest-birds.glb` adds the Great Forest Hawk used for the six large forest enemies. Its Blender source is `blender/kit/build_forest_birds.py`, adapted from the local `3d_astra` project's procedural `birdGeometry` wing and tail layout. The source hash, four rigid-part pivots, dimensions, 1,452-triangle count and 45,504-byte budget are recorded in `forest-birds-manifest.json`. Runtime scale is 1.45, with two flapping wing hinges and a 0.8 m collision radius around the body. It uses no textures, skin or extra animation file; all six birds share the baked geometry and material.

The Hunting harpoon aliases the already shipped `trident` held model and icon. Its flying fork is the single 84-triangle vertex-colored mesh from `src/harpoon-art.ts`, with no texture or shadow pass. There is no additional weapon model download. The [hunting guide](../docs/hunting.md) records gameplay, Vietnamese instructions, provenance and the existing horizontal combat-plane limitation.
