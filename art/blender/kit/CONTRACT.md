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
