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

## Fishing kit (`build_fish.py` → `public/assets/models/fish.glb`)

The fish swim in the 3D ponds (`src/fishing-view.ts`), so this kit follows
different rules from the rest of the file. Fish are not placed on the ground:
each model's origin is its **centre of mass** (the swim pivot), and the game
keeps it just under the water surface. Heads face Blender -Y (glTF +Z), and up
is +Z (glTF +Y). 1 unit is 1 metre, at scale 1.

One GLB holds one top-level **empty per catalogue id**, named exactly the id
(`fish_perch` … `fish_manta`, `boot`) and placed at the origin. Its children
are:

- `<id>_body`: a mesh with several materials.
- `<id>_tail` (real fish only; the boot has none): exactly **one material**,
  so it exports as a single primitive. Its rotation is zero and its origin is
  the tail hinge. The game wags it with `tail.rotation.y`, about the vertical
  axis. Every tail root sits on the hinge axis (the eel's sits inside a joint
  ellipsoid), so a swing of ±0.6 rad never opens a gap. The manifest's `wag`
  gives a comfortable swing per species.

Budgets: at most 450 triangles per fish, tail included, with the tail itself
at most 80. The boot allows 250. Sizes are the longest extent at scale 1:
small 0.45–0.55, medium 0.6–0.75, big 0.8–1.1.

Materials are named `Fish <id without fish_> <part>` (for example
`Fish koi patch`), plus the shared `Fish eye` and `Fish eye white`. There are
no textures or UVs, and every material is single sided because all parts are
closed shapes. Roughness is 0.18–0.6. Metallic is 0 everywhere except the
golden fish (at most 0.3).

Emissive materials:

- `Fish angler lure` at strength 3 (exported as
  `KHR_materials_emissive_strength`).
- `Fish golden body/belly/fin/crown` at 0.25–0.45.
- `Fish jelly bell/rim/inner/tentacle` at 0.3–0.6, which makes the jelly look
  translucent while staying opaque.

| Node | Size | Triangles (body + tail) | Tail material | Tail is |
| --- | --- | ---: | --- | --- |
| `fish_perch` | small, 0.50 | 402 + 22 | `Fish perch fin` | forked fin |
| `fish_clown` | small, 0.45 | 394 + 18 | `Fish clown fin` | round fin |
| `fish_puffer` | small, 0.46 | 418 + 18 | `Fish puffer fin` | round fin |
| `fish_carp` | medium, 0.66 | 406 + 22 | `Fish carp fin` | forked fin |
| `fish_shark` | big, 0.97 | 374 + 26 | `Fish shark fin` | crescent, big upper lobe |
| `fish_rainbow` | small, 0.52 | 338 + 22 | `Fish rainbow fin` | forked fin |
| `fish_catfish` | big, 0.87 (whiskers 0.70 wide) | 422 + 18 | `Fish catfish fin` | round fin |
| `fish_koi` | medium, 0.68 | 404 + 22 | `Fish koi fin` | forked fin |
| `fish_eel` | big, 1.04 | 334 + 64 | `Fish eel body` | rear third of the body |
| `fish_swordfish` | big, 1.02 | 396 + 26 | `Fish swordfish sail` | crescent |
| `fish_jelly` | small, 0.49 | 342 + 75 | `Fish jelly tentacle` | five tentacles |
| `fish_icepike` | medium, 0.73 | 424 + 22 | `Fish icepike fin` | forked fin |
| `fish_whale` | big, 0.95 | 376 + 26 | `Fish whale body` | horizontal flukes |
| `fish_kraken` | big, 0.83 | 338 + 75 | `Fish kraken body` | five tentacles |
| `fish_golden` | medium, 0.61 | 392 + 48 | `Fish golden fin` | double fantail |
| `fish_sunfish` | big, 0.89 | 408 + 22 | `Fish sunfish fin` | clavus |
| `fish_angler` | medium, 0.69 | 415 + 18 | `Fish angler fin` | round fin |
| `fish_manta` | big, 1.00 wide | 318 + 15 | `Fish manta body` | whip tail |
| `boot` | 0.36 long, 0.33 tall | 236 | none | none |

A few species are posed or built differently:

- `fish_sunfish` basks on its side, rolled 85° about its length with its right
  side up, as ocean sunfish do. The round body then reads from the high camera
  and fits a shallow pond. Its icon shows it upright.
- `fish_jelly` tilts its bell 6° forward. The oral arms and tentacles stream
  back at skirt height instead of hanging down.

Heights matter because the game's pond is shallow: the bed sits about 0.13
under the surface. `art/generated/kit/fish-manifest.json` lists, per fish:

- `body_top`: the top of the body above the centre.
- `depth.body_under`: the centre depth that keeps the body submerged; fins may
  still break the surface, which suits the shark and swordfish.
- `display_scale`: a suggested scale for the game's zoom.
- The tail hinge, in Blender and glTF coordinates.

### Pond dressing (same GLB)

Each piece is a single top-level mesh at the origin, with its origin at the
waterline or ground.

| Node | Materials | Size | Triangles | Origin |
| --- | --- | --- | ---: | --- |
| `bobber` | `Bobber red`, `Bobber white` | 0.13 wide, 0.20 tall (z −0.066 to 0.134) | 162 | waterline: the white half sits below it, the red half above; the line anchor is the antenna tip at z 0.134 (glTF y) |
| `lily_pad` | `Lily pad` | r ≈ 0.35 with a narrow notch, top at z 0.014–0.019 | ≤ 60 | water surface |
| `lily_flower` | `Lily flower`, `Lily centre` | ≈ 0.18 wide, 0.08 tall | ≤ 240 | flower base (its lowest point): set it on a pad (+0.016) or on the water |
| `reeds` | `Reed stem`, `Reed head` | four cattails and three leaves, h ≈ 0.89 | ≤ 150 | ground |

Icons: `public/assets/icons/fish/<id>.webp` are 160 × 160, transparent, 3/4
view, each under 10 KB.
