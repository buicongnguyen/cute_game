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

## Explorer and gear (`hero_spec.py`)

The explorer and everything worn or held share one space: Blender Z up, the
explorer faces -Y (glTF +Z), metres, standing at the origin with arms hanging
straight down. `hero_spec.py` holds the pivots and the body envelope, and
`build_proxy_hero()` builds a stand-in for fitting until `hero.glb` exists.

### `hero.glb` (`build_hero.py`)

One root node `hero` at the origin. Its children are mesh objects whose
**origins are the pivots** in `hero_spec.PIVOTS`: `body`, `head`, `arm-left`,
`arm-right`, `leg-left`, `leg-right`. `arm-left` and `arm-right` each contain an
empty, `hand-left` / `hand-right`, at `hero_spec.HANDS`. `head` contains a
separate child mesh `head-leaf` (the sprout; hidden while a hat is worn). Keep
object names on the mesh data too (`obj.data.name = obj.name`).

Materials: `Hero skin`, `Hero hair`, `Hero shirt` (recoloured to the player's
colour at runtime), `Hero shirt shade` (darkened player colour), `Hero pants`,
`Hero shoe`, `Hero eye`, `Hero blush`, `Hero bag`, `Hero leaf`. At most 3,500
triangles and 200 KB. Stay inside the envelope so gear fits.

### Gear GLBs

| File | Generator | Items | Default part | Triangles per item |
| --- | --- | --- | --- | ---: |
| `gear-wear.glb` | `build_wear.py` | 19 hats, 17 outfits, 5 boots | hats `head`, outfits `body` | hat 700, outfit 1,400, boots pair 600 |
| `gear-weapons.glb` | `build_weapons.py` | 19 weapons | `hand-right` | 900 |
| `pets.glb` | `build_weapons.py` | 7 pets | none (follows the explorer) | 1,500 |
| `disguises.glb` | `build_hero.py` | 10 disguises | per piece | 2,500 |

Each item is one top-level node named exactly the item id, at the origin with
no transform. Inside it, every mesh object is modelled **in explorer space** at
its worn position, and its name ends with `@<part>`, the hero part it follows:
`@head`, `@body`, `@arm-left`, `@arm-right`, `@leg-left`, `@leg-right` or
`@hand-right` (for example `hat_wizard@head`, `boots_cowboy_l@leg-left`,
`armor_knight_sleeve_r@arm-right`). Untagged meshes use the default part. Boots
always come as a left and a right piece. Outfits may add sleeves on the arms
and wings or capes on the body. Disguises are costumes worn over the explorer:
a head piece, a body piece and optional arm, leg and extra pieces.

Weapons are gripped at `hand-right` `(0.37, -0.05, 0.72)`; the game parents
them to that empty and may turn the wrist. Swords, hammers, scythes and the
trident point forward (-Y), raised about 20°. Blasters point level forward.
The staff stands upright in the fist, and the bow is held upright in front of
the fist. Empties mark where effects start: `muzzle` for every blaster, bow and
staff, and `rod-tip` at the end of each fishing rod.

Pets are modelled standing at the origin (flying pets centred at z 0.5), 0.5–0.9
tall, facing -Y. The game places them beside the explorer.

### Item icons

`public/assets/icons/items/<id>.webp`: 160 × 160, transparent, 3/4 view,
under 8 KB, for every weapon, hat, outfit, boots, pet and disguise and for the
non-equipment items (materials, seeds, foods, fertilizer, spore, worm bait and
the garden bed kit). Worn gear is shown on its own; disguises are shown worn by
the explorer. Crops and fish keep their own folders, cooked foods reuse the
raw item's icon, and decorations are drawn by the game.

### Weapons and pets (`build_weapons.py`)

`gear-weapons.glb` holds 19 weapon nodes. Each has one child mesh,
`<id>@hand-right`, with its vertices already in explorer space, so it must be
attached to `hand-right` without moving it. Materials are named
`Weapon <id> <part>`. They are single sided, with no textures or UVs.

- **Held poses.** Swords, hammers, the scythe and the trident point forward,
  raised 20°. Rods are raised 50° and are 1.8 long. Blasters are level. The
  staff and the bow are upright in the fist but lean 19° out (+X), plus 9°
  (staff) or 6° (bow) forward.
- **Head clearance.** The head hangs only about 0.3 above the fist, so the
  build fails if any weapon comes within 0.60 of `HEAD_CENTRE` below it, or
  within `HAIR_RADIUS` above it. For the same reason, blasters keep their tall
  parts forward of the grip.
- **Handles.** Every handle axis passes through the grip point (distance 0),
  and the handle surface is within 0.04–0.06 of it.
- **Effect empties.** `muzzle` sits on the 5 blasters, the bow and the staff,
  and `rod-tip` on both rods. The names are exact: the build strips Blender's
  `.001` suffixes in the GLB. The empties have no rotation, so shots travel
  along the explorer's facing.
- **Glow.** Emissive strengths, exported as `KHR_materials_emissive_strength`:
  - lava magma 3.0
  - fire staff flame core 3.0, flame 2.6, gem 2.2
  - obsidian edge 2.4
  - thunder bolt 2.2
  - rainbow emitter 1.6, rainbow bands 0.45
  - bow star 1.2, bow string 0.6
  - moon scythe edge 1.2, moon 1.0, gem 0.8, craters 0.5
  - crystal sword crystal 1.1, crystal light 0.9, violet crystal 0.7
  - golden rod tip 1.0, gem 0.9
  - ice crystal 0.8
  - bubble tank 0.35

| Weapon | Tris | Effect empty (glTF x, y, z) |
| --- | ---: | --- |
| `sword_wood`, `sword_tusk`, `sword_crystal`, `sword_candy` | 624, 768, 356, 828 | none |
| `sword_lava`, `sword_obsidian` | 628, 462 | none |
| `hammer_thunder`, `toy_hammer`, `scythe_moon`, `trident` | 548, 808, 824, 888 | none |
| `gun_pea`, `gun_bubble`, `gun_spike` | 856, 736, 778 | `muzzle` (0.37, 0.955, 0.65 / 0.67 / 0.54) |
| `gun_ice`, `blaster_rainbow` | 884, 844 | `muzzle` (0.37, 0.955, 0.75 / 0.71) |
| `bow_star` | 624 | `muzzle` (0.419, 0.853, 0.144), the arrow rest |
| `staff_fire` | 630 | `muzzle` (0.702, 1.673, 0.201), the gem |
| `rod`, `rod_gold` | 848, 872 | `rod-tip` (0.37, 1.884 / 1.889, 1.027 / 1.031) |

`pets.glb` holds 7 pet nodes, each with a child mesh `<id>_body`. Pets stand at
the origin and face -Y (glTF +Z). Materials are named `Pet <id> <part>`.

The three flyers also carry `<id>_wing_l` and `<id>_wing_r`. Each wing has one
material, no rotation, and its origin at the wing root; `_r` is on +X, like
`hand-right`. To flap, rotate the wings about their forward axis, with opposite
signs: `wing_r.rotation.z = +a` and `wing_l.rotation.z = -a` raise both, and a
swing of about ±0.6 rad reads as a flap.

Pet glow: firefly glow 2.6, firefly antenna tips 1.5, firefly wings 0.25, robot
screen 1.8, robot antenna light 1.6.

| Pet | Tris | Height | Notes |
| --- | ---: | ---: | --- |
| `pet_robot` | 1,398 | 0.85 | walks; glowing screen face |
| `pet_parrot` | 1,440 | 0.69 | flies, centre z 0.50; wing roots (±0.11, 0.54, -0.04) glTF |
| `pet_turtle` | 1,268 | 0.53 | walks |
| `pet_sheep` | 1,408 | 0.62 | walks; cloud wool |
| `pet_firefly` | 1,420 | 0.65 | flies, centre z 0.53; wing roots (±0.06, 0.51, -0.06) glTF |
| `pet_dragon` | 1,414 | 0.68 | flies, centre z 0.52; wing roots (±0.10, 0.50, -0.10) glTF |
| `bunny` | 1,300 | 0.71 | walks; mochi body |

Per-item bounds, triangles, materials, grip distances and head clearance are in
`art/generated/kit/weapons-manifest.json`.

### Hero and disguises (`build_hero.py`)

`hero.glb` node tree (glTF translations, relative to the parent):

```
hero (0, 0, 0)
  body      (0, 0.85, 0)
  head      (0, 1.12, 0)       └ head-leaf (0, 1.05, -0.02)   origin = stem base (Blender 0, 0.02, 2.17)
  arm-left  (-0.37, 1.08, -0.02) └ hand-left  (0, -0.36, 0.07)
  arm-right (0.37, 1.08, -0.02)  └ hand-right (0, -0.36, 0.07)
  leg-left  (-0.18, 0.52, 0)
  leg-right (0.18, 0.52, 0)
```

About 3,300 triangles and 79 KB, with exactly the ten `Hero …` materials. The
default shirt is `#4AA8FF` (`COLORS[0]`) and the shade is 72 % of it. The eye
highlights and the backpack patch use `Hero pants` (cream), and the smile uses
`Hero eye`, so tinting `Hero pants` also tints those. The arms hang straight
down in the file; previews and icons use the game's 0.3 rad rest splay. Where the
real surfaces sit, for gear makers (the build fails past 2 cm outside the envelope):

- Hair ≤ 0.619 from `HEAD_CENTRE`. The fringe tips reach z ≈ 1.70–1.76 at the
  front, the side locks z ≈ 1.38 and the nape z ≈ 1.21. Eyes are centred at
  (±0.21, z 1.585), 0.16 × 0.20, domed out to r 0.606.
- Torso: 4–6 mm inside the envelope; the shirt hem band is +13 mm at
  z 0.61–0.68; the front backpack straps are +12 mm at x ±0.19, z 0.74–1.12.
- Backpack: pouch (0.38 × 0.18 × 0.42) at (0, 0.33, 0.895), with flap, pocket
  and patch out to y 0.465 and z 0.675–1.11.
- Arms: sleeve r ≤ 0.121, cuff r 0.118 at z 0.83. The hand is an ellipsoid at
  (±0.37, -0.035, 0.728) with radii (0.112, 0.116, 0.12), plus a thumb toward
  the body.
- Legs: shorts cuff r 0.117 at z 0.418–0.565; skin r 0.083 at z 0.24–0.43. The
  shoe is a lathe of (r, z) (0, 0) (0.075, 0) (0.112, 0.022) (0.128, 0.065)
  (0.126, 0.13) (0.108, 0.195) (0.072, 0.24) (0, 0.258) around (±0.18, -0.08),
  stretched × 1.15 along Y.

`disguises.glb` has one node per id with identity-transform meshes in explorer
space. Attach each mesh to the part named by its tag while the hero is at rest,
e.g. three.js `part.attach(mesh)`, or subtract the part's pivot from its
position. Every disguise hides the backpack: a covering box (ninja pack,
spellbook, shield, jetpack, leafy wing mount, treasure chest), a cape, the dino
hump or the snowball. Hide `head-leaf` while a disguise is worn (the hood, hat
or snowball would be pierced), **except** `dz_fairy` (petal crown ring) and
`dz_superhero` (mask only). The manifest has this as `hides_leaf`. Materials are
named `Disguise <look> <part>`. Emissive: mecha glow 1.6, flame 1.2, bulb 0.8;
fairy wing 0.35, wing rim 0.3; vampire gem 0.4. Clearances used: hoods and
helmets ≥ 0.636 from `HEAD_CENTRE`; torso layers at envelope + 0.03–0.045;
sleeves at arm + 0.024–0.035; trousers at 0.117 + 0.02–0.03; boots at shoe +
0.022–0.03. Per-piece triangles, bounds and materials are in
`art/generated/kit/hero-manifest.json`. `--debug DIR` renders fit sheets (back,
mid-stride, arm raised, game camera) for the plain hero and every disguise.

### Wearable gear (`build_wear.py` → `gear-wear.glb`)

41 top-level empties (19 hats, 17 outfits, 5 boots), each named the item id,
at the origin with an identity transform. Pieces, in explorer space:

- Hats: one mesh `<id>@head`.
- Outfits: `<id>@body` (torso shell plus any cape, wings, tail or hood), and
  sleeves `<id>_sleeve_l@arm-left` / `<id>_sleeve_r@arm-right` on every outfit
  except `armor_wings` (a sleeveless vest).
- Boots: `<id>_l@leg-left` and `<id>_r@leg-right`. Soles sit at z −0.016.

Materials are `Wear <id> <name>`, single sided, metallic 0 and roughness
0.35–0.6. Metal is faked with light and dark bands. The GLB uses shared
accessors: the primitives of one mesh share one POSITION/NORMAL buffer. Its
material factors are rounded to 4 decimals. Emissive materials:

- `hat_lantern glow`: strength 3.
- `hat_halo glow`, `glow light` and `sparkle`: 2.2–2.5.
- `boots_rocket flame` and `thruster glow`: 3–3.5.
- `boots_lava lava` and `lava hot`: 3.

Fit is checked against `hero.glb` as well as the envelope:

- Hats keep ≥ 0.63 from `HEAD_CENTRE` where they wrap the cranium. The
  exceptions are small details sunk into a hood: the frog's eye sockets, the
  bear's muzzle, and the bunny band at 0.627.
- No hat vertex comes within 0.60 of `HEAD_CENTRE` on the face side below
  z 1.9 (a failing check).
- Brimmed hats are tilted back 5–12° so the game camera sees the eyes.
- The four hoods (`hat_leather`, `hat_bear`, `hat_space`, `hat_frog`) cover the
  hair. Their backs flatten onto the shoulders above the backpack.
- The halo floats at z 2.5. `hat_bunny` is a headband, so the hair shows.
- Sleeves cover the hero's arm, which is r ≈ 0.14 with its cuff down to
  z 0.79. They run from a cuff at z 0.8 up over a shoulder dome to z 1.24.
- Torso shells are envelope + 0.035–0.046, pulled in 4.5% at the back so the
  backpack stays visible. Robes and coats (`armor_pirate`, `armor_kimono`,
  `armor_angel`) flare down to z 0.32–0.34, clear of swinging legs.
- Capes and wings clear the backpack: the superhero cape drapes over it, and
  wing roots sit at y 0.47. Hiding the backpack is optional. The wolf tail
  hangs below it (z 0.2–0.62), and the hoodie's hood lies on top of it.
- Flippers reach y −0.8 in front of the foot. The rocket thruster points back
  and down from the heel.

The manifest is `art/generated/kit/wear-manifest.json`. Per item it lists
triangles, pieces (part, triangles, materials, and Blender and glTF bounds),
the emissive materials and, for hats, face and head clearance. Budgets:
hat 700, outfit 1,400, boots pair 600, whole file ≤ 700 KB. The current file
is 680 KB. Icons are `public/assets/icons/items/<id>.webp`, each ≤ 6 KB.

## Space kit (`build_space.py` → `space.glb`)

`public/assets/models/space.glb` holds the piloted flight between planets. It
has one top-level mesh node per piece, named exactly as below, and each
transform is the identity. The ship and pad keep the rocket prop's material
names (`Rocket white`, `Rocket red`, `Sun` band, `Gold`, `Glass`, `Charcoal`,
`Pad`, `Pad dark`, `Hazard`, `Pad light`), so they match `rocket.glb`.

| Node | Origin | Size | Triangles | Materials |
| --- | --- | --- | ---: | --- |
| `ship` | bottom of the engine bell, z 0 (the fin feet also touch z 0) | h 4.80, hull r 0.93, porthole rim r 0.99, fins r 1.42 | 2,080 + flame 280 (≤ 2,600) | rocket prop's |
| `pad` | ground centre | r 2.64, h 0.345 | 1,576 (≤ 1,800) | `Pad`, `Pad dark`, `Hazard`, `Pad light` |
| `stardust` | star centre | point tips at r 0.5, 0.42 thick | 100 (≤ 140) | `Stardust`, `Stardust rim` |
| `asteroid_rock` | centre | about 2.1 × 1.9 × 1.8 | 148 (≤ 160) | `Asteroid rock`, `Asteroid crater` |
| `asteroid_ice` | centre | about 2.1 × 1.9 × 2.0 | 104 (≤ 160) | `Asteroid ice`, `Asteroid frost` |
| `asteroid_lava` | centre | about 2.0 × 1.8 × 1.8 | 144 (≤ 170) | `Basalt`, `Lava glow` |

- **Ship.** It is the prop rocket without its pad, and its nose points up
  (glTF +Y). The porthole faces glTF +Z. To fly level, rotate it −90° about
  glTF X: the nose then points −Z and the porthole faces up.
- **Flame.** `ship` has one child mesh, `flame`, with an identity transform.
  Its origin is the bell exit (the ship origin). It is a yellow core
  (`Rocket flame core`) inside a fluted orange flame (`Rocket flame`), both
  emissive at strength 3. The flame hangs 1.6 below its origin (glTF y −1.6…0.1)
  and is at most r 0.5. Toggle `flame.visible`, and scale `flame.scale.y` to
  stretch it downward.
- **Pad.** The ship stands on `pad_top` = **0.31** (the deck). Put the ship
  origin there, e.g. `ship.position.y = pad.position.y + 0.31`. The lights are
  low emissive domes (`Pad light`, 1.4), and a yellow centre target shows once
  the ship has gone.
- **Stardust.** A puffy five-point star lying flat (it faces glTF +Y). One
  point aims at glTF −Z, which is screen-up from the game camera. Spin it
  about Y. `Stardust` glows at 2.5 and `Stardust rim` at 1.2.
- **Asteroids.** The game scales them by 1.6–4.5. The rock has four
  raised-rim craters, mostly on top. The ice has scattered frost facets and
  five crystals with frosted points. The lava rock is dark basalt with two
  glowing pools and seams (`Lava glow`, 2.5).

The game tone-maps with three.js Neutral, which pulls strong emission toward
white. The emission colours therefore keep green low, so the flame still reads
orange and the core yellow at strength 3. The manifest is
`art/generated/kit/space-manifest.json`. Per node it lists triangles,
materials, Blender and glTF bounds and the emissive materials, plus
`pad_top`, the flame details and the file size (about 129 KB, limit 250 KB).
The build fails on a missing node or flame, a broken budget, a ship base off
z 0 (±0.02) or a pad top outside 0.1–0.35. Previews:
`art/previews/kit/space.webp` and `space-flight.webp`.

## Home wilds (`build_wilds.py` → `wilds.glb`)

Swamp, forest-floor and canyon scenery for the home planet. The rules match
the Scenery kit: one GLB with one top-level mesh node per piece, named exactly
as below, with no transform. Each origin is the piece's own ground centre
(z 0), and the front faces -Y in Blender (+Z in glTF). The game instances these
pieces hundreds of times and batches them by material, so a material name
always means the same material. `Bark` and `Mushroom cap/spots/stem` are the
exact `scenery.glb` definitions. "A" is the darker shade and "B" the lighter.

| Node | Look | Size (built) | Triangles (budget) | Materials |
| --- | --- | --- | ---: | --- |
| `tree_swamp` | squat swamp tree: twisted trunk on 4 root arches, 4 dark drooping lobes round a lighter crown, 8 hanging moss ribbons | h 3.41; canopy r ≈ 1.4 (1.63 to the diagonal lobes); trunk r 0.30 at the ground; roots land at r ≈ 1.0 | 496 (500) | `Swamp bark`, `Swamp leaf A`, `Swamp leaf B`, `Moss` |
| `log` | fallen log along X; both ends sawn 16° toward the sky, showing a growth ring; two moss patches and a small pale mushroom on the front | 1.94 long (x ±0.97), r 0.28, h 0.56 | 158 (160) | `Bark`, `Log end`, `Moss` |
| `toadstools` | 3 red toadstools with white spots, leaning apart | footprint r 0.41; h 0.52 / 0.36 / 0.23 | 156 (160) | `Mushroom cap`, `Mushroom spots`, `Mushroom stem` |
| `rock_red` | canyon mesa with 3 strata (dark, light, dark) stepping in at two ledges, a sandy top, and a fallen chunk at its foot | r 1.32 (main mesa about 2.2 × 1.9), h 1.40 | 147 (160) | `Red rock A`, `Red rock B` |
| `tree_dead` | bare, pale desert tree: the trunk becomes a central leader, 2 forked limbs (5 tips), 2 twigs and 3 root flares | h 2.98, branch spread r 1.08, trunk r 0.29 at the ground | 194 (220) | `Dead wood` |
| `dry_bush` | dry straw-gold scrub: a fountain of 20 spiky blades | r 0.56, h 0.52 | 120 (120) | `Dry grass` |
| `crystals` | 5 glowing violet hexagonal prisms on a dusky rock | h 1.12, footprint r 0.48 | 125 (160) | `Crystal`, `Crystal base` |
| `fern` | 4 broad, arching dark fronds round 3 upright light ones, with notched edges | r 0.64, h 0.58 | 140 (160) | `Fern A`, `Fern B` |
| `reeds` | 6 reed blades and 3 cattails (1.0 / 0.86 / 0.72) | h 1.00, footprint r 0.33 | 114 (120) | `Reed`, `Cattail` |

Materials:

- **Colours:** new materials use vivid toy colours:
  - `Swamp bark` `#6B3D27`
  - `Swamp leaf A` `#127A5B`, `Swamp leaf B` `#2AAE72`
  - `Moss` `#9AD13A`
  - `Log end` `#F0B46E`
  - `Red rock A` `#D2482A`, `Red rock B` `#F58E3C`
  - `Dead wood` `#C9BBAA`
  - `Dry grass` `#EFBE3A`
  - `Crystal` `#9F72FF`, `Crystal base` `#6B648F`
  - `Fern A` `#1C9A47`, `Fern B` `#5BCB3A`
  - `Reed` `#4FAE36`, `Cattail` `#8A4A22`
- **Glow:** `Crystal` is the only emissive material: `#6A36FF` at strength 1.5, exported as `KHR_materials_emissive_strength`.
- **Double sided:** the sheet materials `Moss`, `Dry grass`, `Fern A`, `Fern B` and `Reed`. Everything else is a closed or ground-sealed solid with back faces culled.

`art/generated/kit/wilds-manifest.json` lists, per node:

- triangles and materials
- Blender and glTF bounds
- footprint radius and trunk radius at the ground
- emissive materials

It also lists every material's colour, roughness and sidedness, and the file size. The file is 68 KB; the limit is 200 KB.

The build exits non-zero on any of these:

- a missing node
- a broken triangle budget
- a ground (min z) beyond ±0.02
- an off-centre footprint
- a size more than 15 % over its target (the toadstools also have a hard height cap of 0.55)
- material names other than those listed
- an unexpected emissive strength
- a file over 200 KB

It also reads the exported GLB back to check node names, transforms, materials and glTF bounds. The output is deterministic: two runs give byte-identical GLB and manifest files.

Previews:

- `art/previews/kit/wilds.webp`: every piece, labelled, next to the explorer.
- `wilds-scene.webp`: a swamp, forest and canyon patch at the game camera and zoom, with `scenery.glb` trees for comparison.

## Bright worlds (`build_worlds_bright.py` → `worlds-bright.glb`)

Scenery for the Candy, Toy, Cloud, Jungle and Ocean planets, installed as
`public/assets/models/worlds-bright.glb`. The rules match the Scenery kit: one
top-level mesh node per piece, named exactly as below, with no transform. Each
origin is the piece's own ground centre (z 0), and the front faces -Y in
Blender (+Z in glTF). Pieces are instanced 40–270 times per planet and batched
by material, so a material name always means the same material in this file.
Collision r is the circle the game blocks at ground level. "Ground r" is the
built radius of everything below z 0.3.

| Node | Planet | Look | Size (built) | Collision r (ground r) | Triangles (budget) | Materials |
| --- | --- | --- | --- | --- | ---: | --- |
| `candy_tree` | candy | twisted white stick with pink stripes; round candy ball whose 8 pink/mint stripes pinwheel from the top; 8 sugar buttons | h 3.40, canopy r 1.27 | 0.35 (0.27) | 388 (420) | `Candy stick`, `Candy swirl A`, `Candy swirl B` |
| `candy_cane` | candy | upright cane, 2 red and 2 white helical stripes, hook toward +X, sugar drift at the foot | h 2.18, x −0.30…0.76, y ±0.30 | 0.3 (0.31) | 246 (260) | `Candy red`, `Candy white` |
| `gumdrops` | candy | 3 matte sugared gumdrops: pink, lime, orange | 0.85 × 0.79, h 0.44 | — | 150 (160) | `Gumdrop A`, `Gumdrop B`, `Gumdrop C` |
| `donut` | candy | giant donut on its edge, leaning back 22° so the iced face looks at the camera; drippy pink icing, 10 sprinkles | 1.74 × 1.02, h 1.54 | 0.9 (0.74) | 395 (420) | `Donut dough`, `Donut icing`, `Sprinkle A`, `Sprinkle B` |
| `cupcake` | candy | pleated wrapper (20 flat facets), 3-tier swirled frosting, cherry | 1.40 × 1.37, h 1.48 | 0.6 (0.47) | 298 (320) | `Cupcake wrapper`, `Frosting`, `Cherry` |
| `toyblock` | toy | 2 blocks with 1 on top, each turned a little; painted faces with wooden chamfered edges; raised star, circle, heart and triangle emblems on the front, back, outer sides and top | 1.96 × 1.04, h 1.66 | 1.3 (1.02) | 213 (220) | `Toy red`, `Toy blue`, `Toy yellow`, `Toy wood` |
| `toyball` | toy | beach ball, 6 segments (A B C A B C), pole tipped toward the camera | r 0.89, h 1.74 | 0.9 (0.66) | 252 (260) | `Ball A`, `Ball B`, `Ball C` |
| `cloudtree` | cloud | slender leaning white trunk, a cloud wisp at its foot, crown plus 5 puffs (white tops over sky-blue bellies) | h 3.54, canopy 2.70 × 2.60 | 0.4 (0.40) | 435 (450) | `Cloud trunk`, `Cloud puff A`, `Cloud puff B` |
| `skyrock` | cloud | faceted pale chunk, wider above its foot, with a rocky lip round a scalloped grass cap; 3 glowing crystals | 1.75 × 1.84, h 1.31 (grass top 0.99) | 0.8 (0.83) | 196 (220) | `Sky rock`, `Sky grass`, `Crystal` |
| `jungletree` | jungle | trunk on 5 buttress roots; 3 scalloped canopy tiers (light tops, dark rims); 7 hanging vines | h 4.98, canopy 4.40 × 4.02 | 0.6 (0.66) | 523 (600) | `Jungle bark`, `Jungle leaf A`, `Jungle leaf B`, `Vine` |
| `palm` | ocean | trunk of 7 stacked segments curving to +X; 8 serrated drooping fronds; 3 coconuts in the frond gaps | h 4.67, x −1.12…3.30, y ±2.1 | 0.35 (0.30) | 406 (450) | `Palm trunk`, `Palm leaf`, `Coconut` |
| `coral` | ocean | branching coral (6 arms), lumpy brain coral, curved sea fan | 1.37 × 1.09, h 0.82 | — | 245 (260) | `Coral A`, `Coral B`, `Coral C` |

Colours:

- **Candy:**
  - `Candy stick` `#FFF5EE`, `Candy swirl A` `#FF2E8C`, `Candy swirl B` `#2FE0B4`
  - `Candy red` `#F0203A`, `Candy white` `#FFF7F1`
  - `Gumdrop A/B/C` `#FF3A8C` / `#8CE01E` / `#FF8A12` (roughness 0.82)
  - `Donut dough` `#E8963E`, `Donut icing` `#FF3FA0`, `Sprinkle A/B` `#2AA4FF` / `#FFE12A`
  - `Cupcake wrapper` `#FFC02A`, `Frosting` `#4FE2BE`, `Cherry` `#E3102E`
- **Toy:** `Toy red/blue/yellow` `#EE2D2D` / `#2462EA` / `#FFC21A`, `Toy wood` `#E6AE66`, `Ball A/B/C` `#F5333D` / `#FFD428` / `#1FA6F2`.
- **Cloud:** `Cloud trunk` `#ECF2FF`, `Cloud puff A/B` `#FCFEFF` / `#8FD2FF`, `Sky rock` `#CBC2EC`, `Sky grass` `#5CD446`.
- **Jungle:** `Jungle bark` `#8A5634`, `Jungle leaf A/B` `#14803A` / `#3FC23E`, `Vine` `#9BE03A`.
- **Ocean:** `Palm trunk` `#C68646`, `Palm leaf` `#30C24A`, `Coconut` `#6E4226`, `Coral A/B/C` `#FF2A72` / `#FF6414` / `#9A36FF`.

Other material rules:

- **Glow:** `Crystal` is the only emissive material: `#5CE8FF` with emission `#6FF0FF` at strength 1.5, exported as `KHR_materials_emissive_strength`. `wilds.glb` has its own violet `Crystal`. The two are different materials in different files, so don't key a tint on that name across kits.
- **Double sided:** `Palm leaf` and `Coral C` (the sea fan), which are sheets. Everything else is a closed or ground-sealed solid with back faces culled.
- **Corals:** the coral sits on its foot, so place it on the sea floor. The deep pink, orange and violet were chosen to read under the game's water (`#6fd8fb`, opacity 0.38) over sand.

The build exits non-zero on any of these:

- a missing node
- a broken triangle budget
- a base (min z) beyond ±0.02
- an x or y extent more than 15 % over the contract size, or a height outside ±15 %
- ground r more than 15 % over the collision r
- material names other than those listed
- a file over 350 KB

The checks run before install. `--only NODE[,NODE]` checks a subset and never writes the GLB or manifest.

`art/generated/kit/worlds-bright-manifest.json` lists, per node:

- planet, triangles, budget and materials
- emissive materials
- Blender and glTF bounds
- ground radius, collision r and contract size

It also lists every material's colour, roughness, sidedness and emission, and the file size. The file is 128,608 bytes for 3,747 triangles. Two runs give byte-identical GLB and manifest files.

Previews (`--render`):

- `art/previews/kit/worlds-bright.webp`: every piece, labelled, at true scale from the game camera.
- `worlds-bright-scenes.webp`: one vignette per planet on that planet's ground colour, at the game camera and zoom (36 px per metre) with the explorer. The ocean vignette has an island and a coral lagoon under the game's water. A sixth panel shows every piece beside the explorer.

## Harsh worlds (`build_worlds_harsh.py` → `worlds-harsh.glb`)

`public/assets/models/worlds-harsh.glb` dresses the Ice, Lava and Shadow
planets (Shadow is lit only around the player). It holds one top-level mesh
node per piece, named exactly as below. Every node sits at the file origin with
an identity transform, and its origin is its own ground centre (z 0). Pieces
face -Y in Blender (glTF +Z), and the snowman's face looks that way. The game
instances each piece 36–270 times, so materials are few and shared by name:
the same name is the same material. `Bark` is identical to the one in
`scenery.glb`, and the build checks this. Every material is single sided, with
no textures or UVs.

| Node | Planet | Size (h, overall r) | Ground r / collision r | Triangles | Materials |
| --- | --- | --- | --- | ---: | --- |
| `snow_pine` | ice | 4.00, 1.48 | 0.48 / 0.45 (snow drift) | 408 (≤ 420) | `Bark`, `Snow pine`, `Snow` |
| `ice_spire` | ice | 2.76, 0.62 | 0.47 / 0.55 | 120 (≤ 160) | `Ice`, `Ice glow` |
| `snow_rock` | ice | 0.90, 0.94 | 0.80 / 0.8 | 156 (≤ 160) | `Frost rock`, `Snow` |
| `snowman` | ice | 1.64, 0.71 (arms); bottom ball r 0.45 | 0.26 / 0.45 | 416 (≤ 420) | `Snow`, `Coal`, `Carrot`, `Scarf`, `Twig` |
| `lava_rock` | lava | 0.95, 0.91 | 0.84 / 0.85 | 133 (≤ 170) | `Basalt`, `Lava glow` |
| `obsidian` | lava | 1.36, 0.57 | 0.38 / 0.5 | 132 (≤ 160) | `Obsidian`, `Obsidian edge` |
| `ash_tree` | lava | 3.20, 0.91 (branches); trunk r 0.29 | 0.33 / 0.35 | 181 (≤ 260) | `Charcoal wood`, `Ember` |
| `mini_volcano` | lava | 2.60, 2.14 (base r 2.0) | 2.13 / none | 320 (≤ 320) | `Basalt`, `Volcano slope`, `Lava glow` |
| `deadtree` | shadow | 3.40, 1.19 (branches); trunk r 0.28 | 0.34 / 0.35 | 266 (≤ 280) | `Shadow wood`, `Shadow glow` |

"Ground r" is the widest vertex at z ≤ 0.1. The snowman touches the ground
only under its bottom ball, whose widest point (r 0.45 at z 0.42) matches its
collision circle.

- **Snow pine.** Three teal-green tiers. Each tier has a steep skirt and a thick
  snow ledge whose rounded drips hang over the skirt, with a snowy tip and a
  small snow drift round the trunk foot.
- **Ice spire.** A six-sided crystal with four leaning side shards, flat
  shaded. The pyramid tips are `Ice glow`.
- **Snow rock.** A half-buried periwinkle boulder under a domed snow cap with
  drips.
- **Snowman.** Three balls, a coal face and buttons, a carrot nose, a red scarf
  with one hanging end, and twig arms (the left one waving).
- **Lava rock.** A faceted basalt boulder. Four zigzag cracks glow; they meet
  in a star on top and taper to points lower down.
- **Obsidian.** Five glossy black-purple shards. The vertical edges are narrow
  violet chamfers (`Obsidian edge`) that run up to each tip.
- **Ash tree.** A charcoal trunk with three limbs and two twigs. The leader and
  two limb tips smoulder (`Ember`), as do a snapped stub and one crack low on
  the trunk.
- **Mini volcano.** A basalt rim and crater around a glowing pool. Four raised
  lava drips spill through notches in the rim and end in points, and two
  basalt boulders sit at the foot. It makes the world border ring (no
  collision).
- **Dead tree.** A twisted violet trunk. Three branches and the leader end in
  curls, and three glowing teardrop buds hang from the curls.

Glow (exported as `KHR_materials_emissive_strength`): `Lava glow` 2.5,
`Ember` 2.0, `Shadow glow` 1.5, `Ice glow` 1.2. All other materials do not
glow. To survive Neutral tone mapping, the warm glows keep green low.
`Lava glow` uses `build_space.py`'s colours. `Basalt` is darker than
`space.glb`'s so the rocks read on the lava ground (`#6e5a60`).

The manifest is `art/generated/kit/worlds-harsh-manifest.json`. Per node it
lists the planet, triangles, vertices, materials, emissive materials, Blender
and glTF bounds, overall and ground radius, the collision radius and the
budget. It also lists every material's colour, roughness and glow, and the
file size (about 97 KB, limit 300 KB).

The build fails on any of these:

- a missing or extra node, a node with a transform, or wrong materials
  (checked again in the exported GLB);
- a broken triangle budget;
- min z more than 0.02 from 0;
- a height outside ±15%, or an overall or ground radius more than 15% over
  size;
- a wrong glow strength, a double-sided material, or a `Bark` that differs from
  `scenery.glb`'s.

Output is deterministic: two runs give byte-identical files. `--render` writes
`art/previews/kit/worlds-harsh.webp` and `worlds-harsh-scenes.webp`. The first
is a labelled contact sheet from the game camera on each planet's ground. The
second shows one vignette per planet at game zoom, with the explorer for scale
and Shadow lit only around the explorer.
