# Reference analysis — Zoo Pet

Inspected on 2026-09-30 at [zoo-pet.store](https://zoo-pet.store), which redirected to https://d173ysgpwor2n4.cloudfront.net/. Analysis used the visible guest flow, character setup, gameplay screen, help, inventory, and quest journal. Advanced systems below are documented by the reference's help screen; they were not all personally played through.

## What the reference is

A browser-based, colorful 3D life/adventure RPG. A small home garden is the safe hub. Gardening, fishing, combat, and exploration all feed a shared economy based on energy, items, experience, and equipment. Players start at their own home; multiplayer/shared areas are described beyond the gate.

## Observed opening flow

1. Registration/login, with a guest mode that saves locally and cannot play online.
2. Character name and six clothing colors.
3. Spawn in front of a round, yellow-roof cottage in a fenced garden.
4. The first prompt directs the player to tap a garden bed.
5. The journal introduces a nine-step first chapter.

The first chapter asks the player to harvest three crops, earn 20 energy by selling, buy an item, equip a weapon, defeat five enemies, purchase an upgrade, catch two fish, use skills ten times, and reach level five.

## Visual and interaction language

- High, angled 3D camera following a small chibi character.
- Bright grassy ground, pink trees, flowers, wooden fences, farm beds, a thatched cottage, and compact service buildings.
- Cream panels, rounded buttons, colored skill controls, chunky text, and small icon labels.
- Health and experience in the top-left, inventory/quests/social/help/settings near the top-right, a circular minimap, and four skill buttons along the bottom.
- Tap the ground to walk; tap an object to interact or a creature to attack. The reference supports Q/W/E/R combat shortcuts and I for inventory.

## Main systems documented in the reference

| System | Visible/reference behavior | Local baseline |
|---|---|---|
| Gardening | Plant, grow, fertilize, harvest for XP, expand beds | Three crops; different timers/rewards and six starting beds |
| Economy | Sell inventory for energy; buy equipment | Implemented |
| Equipment | Weapon, hat, clothing, shoes, pet, disguise | Five slots; no disguise slot |
| Combat | Basic attacks plus spin, dash, stomp, weapon-specific ultimate | Implemented with simplified effects and three weapon categories |
| Progression | Levels, stats, upgrades, quests | Levels, upgrades, and first nine-step chapter |
| Death | Lose loose items into a recoverable bag; retain levels | Implemented, with a safety rule for previous unclaimed bags |
| Fishing | Equip a rod, watch the float, manage line tension | Implemented as a hold/release minigame |
| Travel | Rocket to candy, ice, lava, toy, jungle, ocean, cloud, shadow worlds | Eight small themed destinations plus home |
| Crafting | Use planetary materials for gear, pets, decorations | Four functional gear/pet recipes |
| Social | Accounts, chat, shared zones, friends, home visits | Omitted; local single-player only |
| Retention | Daily/weekly tasks, achievements, passes, timed events | Omitted for the first evaluation |
| App support | Fullscreen, install/PWA, offline claims | Local web build; no PWA |

## Implementation choices

- Vite, TypeScript, and Three.js keep the project small and easy to modify.
- Original Blender models and procedural meshes provide the art without extracting assets from the reference.
- Gameplay rules are independent of rendering for deterministic tests.
- Local saves keep evaluation friction low; no registration or backend setup is required.
- Static scenery is batched by material to reduce rendering overhead.
- Economy and progression follow the reference's opening structure; prices, timing, XP, and creature balance are provisional.

## What should be evaluated next

Focus on whether moving, planting, interacting, and fighting feel good; whether the first goals are understandable; and whether the art direction is close enough to the intended target. Choose the most important missing systems after playing this baseline. Avoid expanding into full multiplayer or a large content catalog before the basic loop is approved.

## Follow-up inspection — 2026-09-30

A second guest-mode inspection checked seed cards and an actual carrot harvest. The reference starts with nine garden beds and lists nineteen crops. Its basic carrot takes 10 seconds, awards 4 XP, and lists a sale value of 3 energy; the local carrot takes 25 seconds, awards 8 XP, and sells for 8. The reference carrot also has a temporary movement-speed effect, while the local carrot restores health. Therefore the previous general claim that local crop timers were shorter was incorrect.

The reference's level-1 threshold is 25 XP (local: 30). The first quest gives 36 energy, 6 XP, and 15 star points (local: 36 energy and 12 XP). Expansion is initially 60 energy (local: 35). Local balance is provisional, not reference-equivalent.

The broad nine-step chapter sequence matches. The local three-crop catalog, five equipment slots, four recipes, generic combat effects, small themed planets, and single-player saving remain substantial reductions of the reference. See `REVIEW.md` for the full parity matrix, confirmed code defects, repairs, validation, and remaining limits.