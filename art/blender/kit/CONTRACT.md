# Zoo Garden kit contract

The game places these models at fixed positions with fixed collision circles
(`src/world.ts`). A replacement must stay inside its footprint or the player
will clip through it or get stuck. Blender is Z up with the front facing -Y;
the glTF files are Y up with the front facing +Z. The origin is the ground
centre and 1 unit is 1 metre.

Shared look: `style.py` (palette, glossy materials, bevels, export, preview camera).

## Village props (`build_props.py` → `public/assets/models/<file>.glb`)

One joined mesh per file. Material names are free, but keep them stable.

| File | Game entity | Max footprint (x × y), height | Triangle budget |
| --- | --- | --- | ---: |
| `cottage.glb` | home, collision r 2.7 | walls r ≤ 2.7, roof r ≤ 3.7, porch front ≤ 3.4; h ≤ 6.5 | 9,000 |
| `market-stall.glb` | sell, r 1.7 | 3.2 × 2.0; h ≤ 2.9 | 5,000 |
| `equipment-stall.glb` | shop, r 1.7 | 3.2 × 2.0; h ≤ 2.9 | 5,000 |
| `garden-bed.glb` | plot (33 copies) | 2.12 × 2.12; h ≤ 0.34 | 900 |
| `wishing-crystal.glb` | upgrade, r 1.4 | r ≤ 1.35; h ≤ 3.2 | 2,500 |
| `storage-chest.glb` | chest, r 0.6 | 1.3 × 0.85; h ≤ 1.1 | 1,200 |
| `workshop.glb` | craft, r 1.1 | 2.4 × 1.8; h ≤ 2.6 | 4,000 |
| `kitchen.glb` | cook, r 1.0 | r ≤ 1.1; h ≤ 1.6 | 2,500 |
| `well.glb` | scenery, r 1.2 | r ≤ 1.15; h ≤ 2.9 | 3,000 |
| `rocket.glb` | travel, r 1.5 | pad r ≤ 2.7, body r ≤ 1.0; h ≤ 5.2 | 4,000 |

Garden bed: the soil top sits at z 0.22 and the frame top at about z 0.30.
Crops stand at (±0.4, ±0.4), so leave that area clear and run two soil ridges
along X at y = ±0.4.

## Scenery (`build_nature.py` → `public/assets/models/scenery.glb`)

One GLB with one top-level mesh node per piece, each with its origin at its
own ground centre. The game batches hundreds of copies by material, so pieces
share materials by name. Runtime recolouring for other planets depends on
these material names.

| Node | Materials | Size | Triangles |
| --- | --- | --- | ---: |
| `tree_blossom` | `Bark`, `Blossom A`, `Blossom B` | h ≈ 3.6, canopy r ≈ 1.6 | ≤ 600 |
| `tree_round` | `Bark`, `Leaf A`, `Leaf B` | h ≈ 3.6, canopy r ≈ 1.6 | ≤ 600 |
| `tree_pine` | `Bark`, `Pine A`, `Pine B` | h ≈ 3.8, r ≈ 1.3 | ≤ 400 |
| `bush` | `Leaf A`, `Leaf B`, `Berry` | r ≈ 0.6 | ≤ 300 |
| `flowers` | `Stem`, `Petal *`, `Flower centre` | r ≈ 0.35 | ≤ 250 |
| `tuft` | `Grass` | h ≈ 0.4 | ≤ 40 |
| `rock` | `Rock` | r ≈ 0.8 | ≤ 120 |
| `stone_step` | `Step stone` | r ≈ 0.4, h ≤ 0.08 | ≤ 60 |
| `fence` | `Fence post`, `Fence rail` | posts at x = ±1.0, rails at z 0.4 and 0.8, h 1.0 | ≤ 150 |
| `gate` | `Fence post`, `Fence rail`, `Sign` | posts at x = ±1.7, h 3.1 | ≤ 300 |
| `mushroom` | `Mushroom cap`, `Mushroom spots`, `Mushroom stem` | h ≈ 0.35 | ≤ 120 |

## Crops (`build_nature.py` → `public/assets/models/crops.glb`)

Nodes `crop_sprout` plus `crop_<id>` for every crop id below. Each mature crop
fits 0.7 × 0.7, stands at most 0.9 tall on z 0 and uses at most 400
triangles. Icons are rendered to `public/assets/icons/crops/<id>.webp`.

`radish carrot pumpkin mint chili candy bean star berry coffee moonflower
magnetmelon melon clover glowshroom iceberry goldcorn dragonfruit rainbowrose`
