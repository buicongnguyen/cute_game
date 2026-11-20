# Zoo Garden: AAA evaluation

Written 2026-11-19 on branch `develop` at commit b3b9f57 (the same commit as `origin/main`).
Status: evaluation only. Nothing in the game was changed. This file is the only new file.

**How it was made.** Ten evaluators looked at the game from different sides:
the owner's ideas in the docs (`ideas-docs`), the owner's own messages (`ideas-prompts`), the code (`code`),
a first visit on phone and PC (`play-new`), the mid and late game (`play-late`), game design (`design`),
sound, feel and animation (`audio-feel`), an AAA rubric (`rubric`), speed (`perf`) and art (`art`).
All ten returned results. Their scripts, logs and screenshots are in `.scratch/eval/<evaluator>/`.
That folder is git-ignored, so it exists only on this PC, not on GitHub.
In this document, screenshot and log paths are relative to `.scratch/eval/`. Code paths are relative to the repo.

**The bar ("AAA").** Mario Kart 8-like stylized polish: chunky toy forms, bevelled edges, warm vivid colour
(never washed-out pastel), readable silhouettes, very dark blue nights. Plus real gameplay and story depth.
Original art, names and text only. And the hard rule: **the game must not get slower.**

**Words used in this document**

| Word | Meaning |
|---|---|
| Draw call | One request to the graphics card to draw one thing. Fewer draw calls = faster frames. |
| Triangles | The small flat pieces every 3D model is made of. |
| Speed gate | The test `promo/perf-budget.mjs`: it counts draw calls and triangles at the village, wild and canyon. A change must stay inside the baseline (the numbers measured before). |
| Governor | The game's automatic graphics setting. On a slow device it steps down (Sharp, Balanced, Battery saver). |
| Bake | Work done once when the art is built or loaded (for example shading painted into vertex colours), so it costs nothing per frame. |
| Instancing / merging | Drawing many copies, or many static pieces, in one draw call. |
| Hit-stop | A tiny freeze (a few frames) when a blow lands. It makes hits feel heavy. |
| Telegraph | A warning shape or sound before an attack lands. |
| God file | One very large file that does many unrelated jobs. Hard to change safely. |
| Effort | S = up to a day, M = a few days, L = one to two weeks, XL = more than two weeks. |
| Speed risk | How likely the change is to cost draw calls, triangles, download size or frame time: none, low, medium, high. |

---

## 1. Verdict

- **Overall: about 4.5 out of 10 against the AAA bar.** The engine and speed work are close to a top web game, and the home village looks good. Story, sound, animation, the economy, the late game and everything far from home are far below the bar.
- **Top 3 strengths:** (1) a light, well-measured game: 785 KB before the Start button, a speed gate, a graphics governor, 2,172 passing tests and a clean type check; (2) real combat feel and depth: the five-button fight, hit sparks, recoil by weight, boss stagger and BREAK, telegraphs (51 hit-stops in one 26 s fight); (3) a wide base of the owner's own cozy content: the cottage family and the rescue-then-they-work-for-you motif, the fish pond, 9 worlds, 4 modes and a rich looks builder, in a warm vivid home palette.
- **Top 5 gaps:** (1) **story**: 29 wordless checklist steps and no scenes; (2) **sound**: no music outdoors, no ambience, no footsteps; (3) **depth and economy**: garden beds earn 608,000 energy an hour, nothing new after level 20, bosses only gain health; (4) **art away from home**: empty and pastel planets, 32 creatures (11 bosses) still made of code shapes, a flat toon light, static water; (5) **identity**: the hub, names, toon ramp and tables still come from the reference game.
- **Fix first (two blockers):** one test now fails every day, so the next push to `main` will not deploy; and the speed gate tool measures the wrong camera angle and the wrong graphics level, so it cannot protect the "not slower" rule until it is fixed.

---

## 2. Scorecard

Scores are 0-10 today. They merge the rubric with the play-test, design, sound and art scores (the plain average of all rows is 4.5).

| # | Area | Score | What AAA looks like | Main gap today | Evidence |
|---|---|---|---|---|---|
| 1 | Colour and art direction | 5.5 | 3-5 colour key per region with one hot accent; big areas mid-bright and saturated; pastel only on accents; nights very dark blue | Home is vivid and the Night planet is right (#0b0d39); Candy is pastel (mean lightness 0.74); the space nebula is magenta; ground brightness barely varies | `rubric/06-planet-candy.png`, `play-late/shots/p1-space-pilot.png`, `src/content.ts:1947` |
| 2 | Lighting and materials (toy finish) | 4 | Glossy toy plastic: rim light, highlights, bevels that catch light, contact shade | The reference's 4-step grey toon ramp; no rim or gloss; the Blender previews look much better than the game | `src/toon.ts:5-10`, `art/shots/a02-well-closeup.png` vs the repo file `art/previews/kit/hero.webp` |
| 3 | Village and home art | 6.5 | Chunky bevelled toys, dressed ground, our own layout | Props are near the bar; the hub layout is the reference's; flat lime ground; cool grey stepping stones | `art/shots/a01-village-closeup.png`, `play-new/run1/pc-01-title.png` |
| 4 | Wilds and planets (composition) | 4 | Each frame shows 1+ landmark, 3+ points of interest, clustered dressing, some life | Flat, empty plains; scatter spread evenly; no landmarks | `art/shots/b-jungle-wild.png`, `rubric/03-wild-pc-late.png`, `src/biomes.ts:51-58` |
| 5 | Water | 3 | Moving toon water with depth bands and foam; lava with crust and glow | Static discs, a flat cyan ocean, clipped flat orange lava | `src/pond-view.ts:12`, `art/shots/b-lava-wild.png` |
| 6 | Characters and creatures (models) | 4.5 | One style, distinct silhouettes, readable from the play camera | 32 of 60 creature types are code shapes, 11 of them bosses; from above the hero reads as a hair ball; every boss wears the same crown | `src/creature-art.ts:21-27`, `play-late/shots/p1-candy-boss.png`, `art/crop-shadowlord.png` |
| 7 | Animation | 3.5 | 25-40 hero motions, smooth blends, blinks and expressions, swinging hair and gear | Rigid parts and sine waves; the walk snaps to rest in one frame; the face never moves (creatures and farm animals are livelier) | `audio-feel/anim-probe.json`, `src/world.ts:2435-2436` |
| 8 | Effects (VFX) | 5 | Chunky toy puffs, stars and petals, a colour per skill | Good pooling, but thin white lines and tiny chips | `art/crop-air-fx.png`, `src/fx.ts:53` |
| 9 | Combat feel | 6 | A 2-3 frame freeze on every hit, directional shake, layered impacts, buffered presses | Rich impact layers and recoil; no hit-stop on ordinary hits; random-jitter shake; early presses dropped | `src/hit-react.ts:25-35`, `src/fx.ts:314-324`, `src/main.ts:1939` |
| 10 | Combat depth and bosses | 5 | Boss phases, a signature move and a weakness each; mastery is rewarded | 7 shared boss moves for 17 bosses; bosses scale only in health; careless play always wins | `src/boss-patterns.ts:8-14`, `src/world.ts:1929`, `design/fight-sim.log` |
| 11 | Camera | 4.5 | Looks ahead, frames fights, has moments at boss intros and arrivals | Fixed follow with no look-ahead; phone portrait too close; the first goal starts off screen | `src/camera-rig.ts:3-9`, `rubric/09-first-view-phone.png` |
| 12 | HUD and menus | 5 | No text under 11 px, 44 px touch targets, one icon family, menus that look like game screens | 8.5-10 px numbers; 11 phone buttons under 44 px; about 1,500 emoji; a web-list shop; the map is an emoji picture | `src/hud-ours.css:311,321`, `play-new/run1/pc-14-shop.png`, `play-new/shots/pc-22-map.png` |
| 13 | Onboarding (first 10 minutes) | 6 | First reward under 30 s, a named character greets you within 60 s, a "wow" moment by minute 5-8 | First harvest at 30 s (good); the beds start off screen; Attack opens shop dialogs; extra "Collect" taps; the first flight waits for level 8 | `play-new/shots/phone2-17-fight-dialog-Made_with_a_li.png`, `play-new/phone2-log.json` |
| 14 | Story and cast | 2 | 4-6 chapters with scenes, a named cast, choices that change the world | 29 wordless checklist steps, one text dialog, no premise | `src/content.ts:4049-4079`, `design/shots/late-03-quests.png` |
| 15 | Economy and progression | 2.5 | Prices and rewards that matter, sinks you can see, new content up to the top level | Upgraded beds earn 608k energy an hour; a late player has 186k energy and nothing to buy; nothing new after level 20 | `src/model.ts:505-510`, `design/garden-math.txt`, `play-late/shots/x-goals.png` |
| 16 | Daily and long-term loops | 3.5 | A rhythm of days, weekly festivals and seasons, plus a collection book | About 15 timers with generic rewards; no day/night, seasons or events; no collection book | `src/progression.ts:101-175`, `docs/FIX-PLAN.md` 5.7 |
| 17 | Garden, farm and fishing | 4.5 | Small daily choices (quality, orders), a pen that grows, fishing with a chase and a reveal | The garden is a lookup table that helpers run; the pen is empty after 2 h; fishing has no late challenge | `src/farm.ts:73`, `play-late/shots/v03-pen-dialog.png`, `play-late/run.log` |
| 18 | Modes (Vault, Flag Rush, Colossus, Rescue) | 5 | Each mode has variety, its own rewards and its own look | Same Vault every run; Rune Seals buy nothing; soothing the Colossus beats waking it; Rescue has 3 missions and a prototype look | `src/dungeon-content.ts:70-76`, `src/colossus.ts:343`, `play-late/shots/m4-rescue-wave-1.png` |
| 19 | Space flight | 4.5 | Spectacle: star layers, set pieces, stylised planets | Works well (fuel, radar, autopilot) but sparse and magenta; the key hints hide under a button | `play-late/shots/p1-space-pilot.png`, `src/space-view.ts:58-70` |
| 20 | Audio | 2.5 | Music per region with layers, ambience, footsteps, a balanced mix | One 37 s track on the cottage radio; measured silence when idle; key cues 20-30 dB too quiet | `src/house-life.ts:50-87`, `audio-feel/probe-save.json`, `audio-feel/loudness.json` |
| 21 | Living world and social warmth | 4 | Neighbours with memory, likes and requests; time of day and weather | Neighbours wander and give gifts but repeat canned praise; no day/night at home | `src/bot-lines.ts:8-21`, `src/bot-chat.ts:36` |
| 22 | Accessibility and comfort | 4 | Text size option, colour-blind-safe warnings, shake and flash sliders, gamepad | Key remap and separate volumes exist; no text size, no shake setting, no gamepad | `src/feel-rules.ts:47`, `src/main.ts:493` |
| 23 | Speed and web delivery | 7 | Small download, quick start on 4G, no combat frame over 50 ms | 785 KB before Start; the gate exists but measures wrong; phone fights still have 83-126 ms stalls | `rubric/live-load.mjs`, `perf/tilt-check.log`, `docs/FIX-PLAN.md` 1.1 |
| 24 | Code health | 5 | Small modules; systems for animation, story and audio; tests that check behaviour | Clean shared rules, but `main.ts` (344 KB) and `world.ts` (266 KB) are god files and many tests read source text | `code/main-shape.mjs`, `code/test.log` |

---

## 3. The owner's ideas

Every idea from the docs and from the owner's own messages, in one table. Duplicates are merged and marked "merged".
Sources: **docs** = the repo plans (QUALITY-PLAN, FIX-PLAN, FIGHT-PLAN, ELITE-ROLES, RESCUE-CALL-PLAN, PARITY, news.json) and project memory;
**prompt** = the owner's own message on that date. The messages from 2026-10-06 to 10-14 are no longer on disk, so that week comes from the docs only.
Value: 1 (low) to 5 (high). Status: built / partial / not built / waiting for owner / rejected by owner.

| # | Idea | Source, date | Status | Verdict | Value | Effort | Speed risk |
|---|---|---|---|---|---|---|---|
| 1 | Become our own game: replace the hub, the 4 starting skills, planet names and themes, bosses, Chapter 1, the copied crop/recipe/shop tables, the disguise skills and the Vietnamese item names (merged: QUALITY-PLAN + "wants to sell it one day") | docs + memory, 2026-10-11 | partial (HUD, lighting and fight are ours) | Keep, top priority: one "identity pass"; move PARITY.md and reference notes out of the public repo | 5 | XL | none |
| 2 | Our own village hub (for example terraced around the Ember Well, new well, fountain, stall and launch pad) | docs (QUALITY stage 2b), 2026-10-11 | waiting for owner (save migration) | Keep: the most visible trace of the reference; Blender, bevelled, inside the village baseline | 5 | L | low |
| 3 | New names and looks for the 4 starting skills (Petal Gale, Breeze Step, Root Quake, Paw Storm) | docs (stage 2c), 2026-10-11 | not built | Improve: do it with the hub pass; cheap | 3 | S | none |
| 4 | Our own screen layout (dock, map panel, paw cluster, icon set) | docs (stage 2a), 2026-10-11 | built (`hud-ours.css`) | Improve: lift all HUD text to 11 px or more (also closes FIX 6.2) | 4 | M | none |
| 5 | Free lighting pass (colour curve, light per planet, sky gradient, readable Night) plus a "Fancy effects" switch (merged: prompt 2026-10-28 "add some VFX but don't make the game slow down") | docs (stage 1) 2026-10-11 + prompt 2026-10-28 | partial (`look.ts` live; no switch) | Keep: pooled VFX shapes first (no per-frame passes); a PC-only Fancy effects switch later, never on phones | 4 | M | low |
| 6 | One art style for crops and a fuller world (merged: prompt 2026-10-01 "the field and trees should be 2D only to make the game run faster" and 2026-09-30 "Can use 2D is okay") | docs (stage 4, FIX 6.7) 2026-10-11 + prompts | waiting for owner (2D wish vs one style) | Redraw the 2D cards in the toy style first (keeps the speed reason); 3D crops only if the gate passes | 4 | L | none for cards, high for 3D |
| 7 | Livelier characters: squash and stretch, anticipation, faces; skeletons only for the hero and bosses | docs (stage 5), 2026-10-11 | partial (hit squash, walk cycle, boss stagger) | Improve: motion-only life first (no skeleton) | 4 | L | medium |
| 8 | Lift the dark forest and swamp so they read warm | docs (FIX 6.4), 2026-10-15 | not built | Keep: per-region colours; free per frame | 4 | S | none |
| 9 | Dress the dark, empty Vault rooms | docs (FIX 6.6), 2026-10-15 | not built | Keep: 5 themed rooms with merged dressing | 3 | M | low |
| 10 | Rescue Call in landscape (panel covers 40%, bare map edge) | docs (FIX 6.5), 2026-10-15 | partial (`rescue-camera.ts`) | Keep: check on 844x390 and dress the field edges | 3 | S | low |
| 11 | Phone portrait camera zooms out a little | docs (FIX 6.1), 2026-10-15 | not built (`camera-rig.ts:9` portraitScale 1.3) | Keep: tune with the speed gate | 3 | S | medium |
| 12 | Redraw enemies in Blender, "more real"; small enemies "more real but cheap" | prompts 2026-10-01, 2026-10-15 | partial (27 types done, 32 still code shapes) | Improve: chunky toy look rather than "real"; planet kits loaded on landing | 4 | L | low |
| 13 | Rebuild the art in Blender and redo the UI ("asset and message box is not a good fit") | prompt 2026-09-30 | built (abb5afb) | Keep: it is the base for the AAA pass | 3 | done | none |
| 14 | Everyday disguises (swimmer, K-pop singer, yoga teacher, nurse), bear and fox ears with tails, free cat ears, "more vivid, more fancy" | prompt 2026-10-17 | partial (only in the fork `cute_game_boat`, c30374d) | Needs owner decision: port as on-demand kits with a stated triangle budget | 4 | M | low |
| 15 | Faces copied from the boat edition onto all hero models | commit 7031457, 2026-10-17 | built (+4.4-5 KB per hero model) | Needs owner decision: which repo leads character art; accept and record the +4 KB or recompress | 2 | S | low |
| 16 | Animated river water | prompt 2026-10-01 ("undo, it causes blinking") | rejected by owner | Drop; test any new water effect for flicker first | 2 | n/a | n/a |
| 17 | Speed gate run before and after every stage (the hard rule) | docs (stage 0), 2026-10-11 | partial (tool measures wrong) | Improve now: fix the tool, take a new baseline (section 7) | 5 | S | none |
| 18 | Steady labels, smooth on phones, "use 2D where it is okay" | prompts 2026-09-30, 2026-10-01 | built (7d4a625, crop and cover cards) | Keep as an art rule: prefer baked or 2D stand-ins where they keep speed | 4 | done | reduces cost |
| 19 | Camera pitch slider 30-51.5 with default 42; lower camera only after distance LOD | docs, owner pick 2026-10-11 (dea8854) | built (owner decision) | Keep as is; distance LOD is still missing | 4 | M | medium |
| 20 | Our own story: ember springs, a spring and a guardian per planet, wake / soothe / let sleep, plus story scenes with village characters | docs (stage 6, FIX 5.6), 2026-10-11 | partial (Ember Well and easier start only) | Keep, top priority for "a more interesting game" | 5 | XL | none |
| 21 | Prisons at bosses: rescue a half-size friend who follows you home and works (garden robot, farm, kitchen that cooks half); a house you can enter; dress the rescued friends | prompt 2026-10-02 | built | Keep and extend: the owner's recurring motif and the natural story spine | 5 | done (story L) | none |
| 22 | Neighbours and helpers as characters with likes, small quests and memory (merged: prompt 2026-10-02 "make each room interact like an AAA game; people walk, change rooms, kid talk then grown-up talk") | docs (stage 6) + prompt 2026-10-02 | partial (activities and age lines built; likes, quests, memory not) | Keep: pair with the story; add funny lines | 4 | M | none |
| 23 | An easier start: level-scaled story rewards, starter gifts, welcome cards, one goal at a time, 20 s tutorial crops (merged: owner note "a little easier for players to join") | docs (FIX phase 4) + owner note 2026-10-15 | built | Keep; re-measure the first minutes after the story changes | 4 | S | none |
| 24 | Long-term goals as a small flag badge (the card was too big and covered play), plus arrival flags (merged: same owner note) | docs (FIX 5.5) + owner note 2026-10-15 | built | Keep as is | 3 | S | none |
| 25 | "The game is not friendly with new players, the role is not clear"; buttons that suddenly appear | prompt 2026-10-16 | partial (onboarding done; "who you are and why" missing) | Improve through a premise and story scenes | 5 | L | none |
| 26 | Day and night, seasons and weather that change what grows, bites and appears | docs (stage 6), 2026-10-11 | not built | Keep, narrow: a colour-only day phase first (no per-frame cost) | 4 | L | low |
| 27 | Collection book with silhouettes, one tap from the main screen | docs (FIX 5.7), 2026-10-15 | partial (fish grid, cottage log) | Improve: one book for fish, creatures, crops, pets and hats | 4 | M | none |
| 28 | Coming soon: Pet show, Greenhouse ("In progress"), Night market; keep the News board current | docs (`public/news.json`), 2026-10-09 | not built (no code; last news 2026-10-09) | Improve: fix the Greenhouse status now; write news with every release | 3 | M | low |
| 29 | Cottage next steps: room ambient loops, fireplace and lamp, fridge stash, indoor decorations, sleep to the next day | research note HOUSE-EVAL, 2026-10-01 | not built | Keep ambience and decorations; sleep only after a day phase; drop the fridge stash | 3 | M | low |
| 30 | "Analyse the attack and the hit and make our game have those good points"; "the fighting style does not match" | prompt 2026-09-30 | partial (hit feel built; FIGHT steps 4-5 left) | Improve: what is left is row 32 | 5 | L | low |
| 31 | Jump, air combat and the five-button fight (chain, power strike, streak, three specials, perfect dodge) | docs (FIGHT-PLAN), owner 2026-10-11/14 | built (behind a setting, on by default, solo only) | Keep; teach the combos with tips or a training dummy | 5 | M | none |
| 32 | Boss re-tune, chasing warning marks, a weakness per boss opened by a move (owner: moves first, bosses after) | docs (FIGHT step 4), 2026-10-11 | not built | Keep: the core of deeper gameplay; give small code bosses Blender models in the same pass | 5 | L | low |
| 33 | Online timings on the server, so there is one fight system | docs (FIGHT step 5), 2026-10-11 | not built (online forces the classic rules, `main.ts:294-301`) | Needs owner decision (section 8) | 4 | L | none |
| 34 | Bosses block hits from the ground and a single jump | docs (FIGHT-PLAN), 2026-10-11 | rejected by owner (`BOSS_BLOCK_ON=false`) | Keep off; fix the Help text that still describes it (`src/help-topics.ts:28`) | 3 | S | none |
| 35 | Smaller, solid bosses that visibly break (chips pop off) | prompt 2026-10-15 | built (`boss-wear-view.ts`, `boss-body.ts`) | Keep; next step is row 32 | 5 | done | low |
| 36 | Elite roles on normal planets (splitter on Candy, shield crab on Ocean), then more | docs (ELITE-ROLES), owner 2026-10-14 | partial (2 roles) | Improve: one role per planet, each asking for a different special | 4 | M | low |
| 37 | Fight buttons and skills always shown, also in the safe zone; the village reacts to swings; Attack doubles as the use button (merged: prompt 2026-10-16, where the owner reversed their own hiding idea) | owner decision 2026-10-16/17 | built | Keep (owner decision). See problem 9: Attack must still swing when a creature is near | 3 | S | none |
| 38 | Settings to move the skill buttons, on PC and phone (a player complaint) | prompt 2026-10-15 | built (73e39b9) | Keep | 3 | done | none |
| 39 | Harpoon at 1,000 energy and +100 attack; electric robot shots; fast pond refill; rod snap 60% / 30% | prompt 2026-10-03 | built | Keep | 2 | done | none |
| 40 | Breakable scenery, swimming, weapon pair, Bond Surge, sword wind, Dyes, Roar hours, Village Almanac | git log 2026-10-10 to 10-15 | built (open tuning questions) | Keep but freeze: no new systems until story and boss passes land | 3 | S | low |
| 41 | Rescue Call, the owner's tower-defence rescue mode: phases 2-3 (all planets, healing flower, squad posts, bosses on the last wave, leaderboard, "Hold the Camp") (merged: docs + second-hand owner idea) | docs (RESCUE-CALL-PLAN), 2026-10-09 | partial (phase 1: 3 missions) | Keep: phase 2 next | 4 | M | low |
| 42 | Online co-op Rescue (phase 4) and online Flag Rush | docs, 2026-10-09 | not built (no server deployed) | Drop for the AAA push unless a server is hosted | 2 | XL | low |
| 43 | Colossus warning "auto off in Ember until level 15? or 30?" | prompt 2026-10-16 | partial (built at level 20 with Automatic) | Needs owner decision on the level; the lid stays per device (owner decision) | 2 | S | none |
| 44 | Owner rule values: 10,000 energy welcome gift as the first-harvest reward, bag 100 / chest 120, Colossus lid per device, two pet slots with the dog as a pet | owner decisions 2026-10-09 to 10-16 | built | Keep as is (owner decisions) | 3 | S | none |
| 45 | AI neighbours, garden and pen helpers | prompts 2026-10-01 to 10-05 | built | Keep; deepen through story and memory, not more systems | 4 | M | none |
| 46 | Starship to other planets with fuel and space obstacles; star map sorted easiest first | prompt 2026-10-01 | built (8b81134) | Keep; add launch and landing spectacle at no per-frame cost | 3 | done | none |
| 47 | A pen for chickens and cows (meat later), animals that wander, graze and come in colours | prompt 2026-10-01 | built | Improve: animals expire after 2 h, so returning players find it empty (problem list) | 3 | M | none |
| 48 | A tiny helper bought for 1,000 energy that farms; a rod that "does not break the string" | prompt 2026-10-01 | partial (helper built; the steady rod still snaps 10%, `fishing.ts:70`) | Keep; ask whether 10% is fine | 2 | S | none |
| 49 | Farm robot auto-buys animals; titans 0.75 size, birds 0.5; lists sorted most effective first; upgrades done in the house | prompt 2026-10-03 | built | Keep | 3 | done | none |
| 50 | Heal 4x faster at home; bad effects gone on return | prompt 2026-10-03 | built (`home-care.ts`) | Keep | 2 | done | none |
| 51 | Pet stays at the pen and follows outside; the puppy throws; the indoor dog is a cuter wolf | prompt 2026-10-03 | built | Keep | 2 | done | none |
| 52 | Bought gear shows on the avatar | prompt 2026-09-30 | built (898ec43) | Keep | 4 | done | none |
| 53 | Shape shop: thinner, taller chibi bodies, cat or rabbit ears, 12 animal hoods, real legs | prompts 2026-10-02/03 | built (`looks.ts`) | Keep | 3 | done | none |
| 54 | Clothing upgrade up to +10, equal power at max so looks are a free choice | prompt 2026-10-03 | built (`gear-ceiling.ts`) | Keep as a design rule | 4 | done | none |
| 55 | Tester password with 1M energy for testing | prompt 2026-10-02 | built (`tester.ts`, solo only) | Keep | 2 | done | none |
| 56 | Fishing: cast distance follows the tap; a smooth pond where the fish are visible | prompts 2026-09-30, 10-01 | built | Keep: the owner uses it as the model for other games | 4 | done | none |
| 57 | Beds placed automatically (manual placement as a setting); tap once to harvest all | prompt 2026-10-01 | built | Keep | 3 | done | none |
| 58 | Labels pinned to buildings; compact icons; dense menus with little space between rows | prompt 2026-10-01 | built | Keep as a UI rule | 3 | done | none |
| 59 | Small, neat phone messages; gains counted in the task tracker, not in the middle of the screen | prompts 2026-10-01, 10-16 | built (`gain-feed.ts`) | Keep as a hard UI rule for all new feedback | 4 | done | none |
| 60 | Timed bonus task line, compact name and level, PC special buttons bottom right, a WASD guide, PC menus on the right | prompt 2026-10-03 | built | Improve: the small PC numbers (FIX 6.2) are still open | 3 | S | none |
| 61 | Keyboard guide folds by itself | docs (FIX 6.3), 2026-10-15 | built, but FIX-PLAN still says todo (`hud-keys.ts:10` folds after 120 key presses per device) | Improve: start folded or fold after the first plant; mark FIX 6.3 done | 2 | S | none |
| 62 | Music per region, ambience (wind, water, birds, insects), real sound effects | docs (stage 3, FIX 5.1), 2026-10-11 | partial (synth effects built and live; one music track) | Improve: section 4 ideas 22-24; FIX-PLAN status is out of date | 5 | L | none |
| 63 | Browser notifications (ripe crops, new version) and auto save-and-reload | docs (PARITY.md:22-23), 2026-10-10 | not built | Drop for now | 1 | S | none |
| 64 | Out of scope: 3-lane PvP, survival, a player market, Steam now, real money | docs (QUALITY §6), 2026-10-11 | rejected by owner | Drop (agree): deepen what exists | 1 | XL | medium |

**How the owner likes work done** (from the owner's messages; it shapes the plan):
- "Evaluate my thought, suggest improvement, then execute." The owner wants their ideas critiqued first, then built without more asking.
- Deliver end to end: build, review, fix, commit, push, deploy. Short status reports that name what remains.
- Track every point of a long message and report each one ("did you fix all the stuff I said above?").
- Speed first: "must not get slower"; "Can use 2D is okay"; "make more real and cheap"; give budgets as numbers ("how many triangles is safe for the avatar?").
- Weigh technical risk before building ("is that okay technically, or will it cause bugs?").
- Free first: prefer free tools, assets and stores.
- Codex works in parallel on the owner's repos: leave handoff notes in md files when asked.
- Stop a failing fix after 4 corrections. Scratch files only in the project's own ignored folder.

---

## 4. New ideas

The best ideas from all evaluators, with duplicates merged. None of them goes against an owner decision.

| # | Idea | What it is | Why | Effort | Speed risk | From |
|---|---|---|---|---|---|---|
| 1 | Ember Springs story spine | 5 chapters to level 25. Each planet's spring is troubled and its titan guards it. Short scene cards (portrait, 2-4 lines) with Pepper, Sprout and the farmer; every step gets a reason. Combine with the "Homeward Book" draft from `cute_game_boat` for the home arc | Turns the checklist, cages, titans and Ember Well into a story; makes it our own game | L | none | design, rubric, play-late, ideas-docs |
| 2 | Pepper's Kitchen Garden (new Chapter 1) | Creatures raid Pepper's garden; you plant, cook and drive them off (the tutorial fight); a dinner scene ends the chapter | Gives the first 10 minutes a motive using existing systems | M | none | play-new |
| 3 | Planet restoration | Clearing nests and soothing springs turns dull patches of a planet to full colour (vertex colour change, same triangles); the star map shows each planet's % and state | Progress you can see in the world; uniquely ours | M | low | rubric |
| 4 | Boss intro cards and a boss-break moment | Name card with title and pose at the start; on a stagger break a short freeze and a name splash (camera arc only on PC and strong phones) | Makes boss fights feel like events | M | low | play-late, rubric |
| 5 | Boss medals, Echo rematches, weekly boss trial | Bronze/silver/gold for time, hits taken and no food; gold opens a harder Echo version; a weekly trial with a modifier on the local ranking | Gives the deep fight a goal and replay value | M | none | design, play-late |
| 6 | Garden-tool boss weaknesses | Each boss has one weakness set up with garden or kitchen items (a vine trap for the charging bear, a pepper bomb for the frost boss) for a sure stagger | A cozy-action twist for FIGHT step 4 that only this game can have | M | low | rubric |
| 7 | Ascended planets (after level 20) | Each world gets a harder variant with creatures scaled to the player, a new elite role and one signature boss move | Fills the empty level 20-60 range with new play, not more health | XL | low | play-late, design |
| 8 | Friendship hearts for the cottage family | A daily liked gift, personal requests, 5 heart scenes each, lines that react to what you did today | Characters with memory; costs only text and screens | M | none | design |
| 9 | Neighbours with personality, memory and rivalries | 5 archetypes (rival angler, shy gardener, boastful boss-hunter...) with weekly challenges ("beat my Yeti time"), favours and co-op Vault invites | The solo Pages edition feels inhabited instead of flattering | M | none | design, rubric |
| 10 | Village restoration projects | A notice board of builds (bridge, festival square, lighthouse, greenhouse) paid in energy plus materials; each changes the village | A real energy sink you can see; the hub grows with the player | L | medium | play-late, design |
| 11 | Weekly festivals and seasons | Harvest Fair, Fishing Derby, Lantern Night (very dark blue), Vault Week; season crops and fish by real month; village colour swaps | Something new every visit, with no new levels to download | M | low | design, rubric |
| 12 | Kitchen orders and picnic buffs | Visitors order dishes; dishes from your crops change skills (chilli stew leaves fire on Root Quake) | Ties garden, fishing, farm and fight into one loop | M | none | design, rubric |
| 13 | Crop quality and cross-pollination | 1-3 stars for care and timing; neighbouring crops can make a rare hybrid seed; giant crops for the fair | Small daily choices instead of a lookup table | M | low | design |
| 14 | Legendary fish and a catch reveal | One named legend fish per planet with its own fight pattern; the hero holds up the catch with a card and a jingle; records and an aquarium | Puts tension and a reason to return into fishing | M | none | play-late, design, rubric |
| 15 | A ranch instead of an expiring pen | Animals stay; coats and breeds are collectables; products are the timer | No empty pen on return; removes the "collect meat" tone | M | none | play-late |
| 16 | Vault Keeper shop and weekly affixes | Rune Seals buy pet skins, decor and recipes; each week the Vault gets a modifier and a new stage order | Fixes a dead currency and the same-run problem with data only | S | none | design |
| 17 | Pet bond and duo finishers | Pets learn one assist move through play; boss pets get one signature from their boss; a full bond unlocks a duo finisher card | Makes the 43 pets feel different | M | low | rubric, design |
| 18 | Constellation collection | Every new fish, creature or crop lights a star; a full constellation gives a ship trail or an emote; the star map becomes the collection book | A fresh form for the planned collection book | S-M | none | rubric |
| 19 | Starship courier runs and ship paint | Carry crops between planets for rare seeds; asteroid time trials against your ghost; ship paint, flame colour, a bobblehead | Gives the signature flight a reason to replay | M | low | rubric |
| 20 | Befriend instead of defeat | Some creatures can be soothed with a short hold-and-release rhythm and become helpers or pen animals | A gentle path for cozy players; a new collection | L | low | rubric |
| 21 | "Make your explorer" step and a staged title | Before Play: body, hood and colour with a turning preview; a posed hero and companion on the title with music | A warm first impression and ownership of the hero | M | low | play-new |
| 22 | Living soundscape at zero bytes | Synthesized wind, pond water, birds by day, crickets at night, lava rumble, plus footsteps per surface tied to the walk | Today the world is silent between actions; no download growth | M | low | audio-feel, rubric |
| 23 | Adaptive music director | Title, region, danger, boss and night music with 1.5-2 s crossfades and stingers; streamed after Start | AAA games are known by their music; none plays outdoors today | L | none | audio-feel, rubric |
| 24 | Creature voices and audio warnings | A small voice synth per creature family (notice, wind-up, hurt, death); boss wind-ups get a rising rumble timed to the telegraph | Fights become readable by ear | M | none | audio-feel |
| 25 | Hit feel 2.0 | A 30-40 ms true freeze on every own hit, smooth directional shake with a Settings slider, a combo pitch ladder, a small zoom punch on finishers, a 0.15 s attack buffer | Small number changes on a rich base; blows feel heavy | S | none | audio-feel, rubric |
| 26 | A livelier hero without a skeleton | Blended walk start and stop, idle fidgets, a blink and 3 expressions in the shader, springy hair and gear, short pose clips made in Blender and played on the existing parts | The hero is always on screen and is the stiffest character | M | none | audio-feel, code, rubric |
| 27 | Toy finish at zero frame cost | Our own 5-6 step colour ramp with warm lights and blue-violet shadows, and a rim highlight baked into vertex colours (the pitch only changes with the slider) | Closes most of the gap between the Blender previews and the game, and removes a copied value | M | none | art, rubric |
| 28 | A postcard landmark and a creature kit per planet | One merged landmark near each landing pad, and the missing creatures and bosses in the kit style, both loaded on landing | Fills the emptiest scenes and ends the code-shape bosses without a bigger first download | L | low | art |
| 29 | Living scenery: one wind clock and one water shader | Trees, bushes and reeds sway on the existing grass wind clock; one toon water patch for ponds, sea, lava and syrup | Makes a static world alive for almost nothing; works on phones | M | low | art |

---

## 5. Problems found

The 30 problems with the most impact, highest first. Each has evidence and a proposed fix.

**1. A test now fails every day, so the next push to `main` will not deploy.**
Evidence: `tests/w15-review.test.ts:151` fails at line 161. It uses a fixed October date (line 34) but the rules use the real clock, so the November season wipes the stars (`src/progression.ts:150`). Re-run with an October clock: passes (`code/oct-clock.mjs`). CI runs `npm test` before deploy (`.github/workflows/pages.yml`).
Fix: pass the fixed time to every rule call in that test (or freeze `Date.now` as commit 8c401e6 did). Effort S, speed risk none.

**2. The speed gate measures the wrong camera angle and the wrong graphics level.**
Evidence: the tool writes `CAMERA.offset` (`promo/perf-budget.mjs:14-15,28`), but the camera only reads the value set by `setCameraPitch` (`src/camera-rig.ts:31-45`). Every row, including the "51.5°" and PITCH rows, is really 42° (`perf/tilt-check.log`). The tool leaves graphics on Auto, so on a busy PC the wild and canyon rows run at Battery saver: canyon 68-74 draw calls instead of 116-132 (`perf/probe-auto-save.log`, `perf/shots-auto/wild.png`). AI neighbours add 35-50 draw calls of noise.
Fix: call `setCameraPitch`, pin graphics to Sharp, turn neighbours off, split main and shadow draws, store a JSON baseline. Effort S, speed risk none.

**3. The story is a wordless checklist, with no premise and a name clash.**
Evidence: 29 count steps ("Harvest three crops", "Reach level 25") in `src/content.ts:4049-4079`; one welcome card (`src/welcome-cards.ts:6-9`); "scenes with the village characters" still todo (FIX-PLAN 5.6). "Clover" is the default player name (`src/model.ts:218`), a rescued farmer (`src/friends-state.ts:47`) and the village.
Fix: new idea 1 and 2; a two-line premise on the welcome card; rename the default explorer and the farmer. Effort L, speed risk none.

**4. Bed upgrades turn the garden into an XP and energy fountain.**
Evidence: growth speed doubles per bed level up to 5, so 32x (`src/model.ts:505-510`). With the real model code: 24 level-5 gold-corn beds earn 608,256 energy and 387,072 XP an hour; 9 level-3 radish beds bought with the welcome gift earn 31,104 XP an hour at level 1, while reaching level 40 needs 115,525 XP in total (`design/garden-math.txt`). Helpers re-harvest every 20-45 s (`src/helper.ts:84-85`). The cap went from 3 to 5 in an owner-requested batch (91ded7d).
Fix: owner decision (section 8): a softer curve (1.6 per level) or levels 4-5 paid in Rune Seals, and less XP from crops far below your level. Effort S, speed risk none.

**5. Energy stops meaning anything, and gifts skip the drops.**
Evidence: the late save holds 186,400 energy while crystal ranks cost 237-716 (`design/shots/late-10-upgrade.png`). Special offers sell every boss or crafted item for 10,000 (titans 25,000) (`src/special-offers.ts:17`). AI neighbours give rare outfits and disguises on friendship (`src/bot-logic.ts:39-45,128,154`).
Fix: keep the 10,000 gift (owner decision); special items become a buy-back after the first drop; neighbour gifts become cosmetic; add visible sinks (new idea 10). Effort S-M, speed risk low.

**6. Nothing new after level 20, and bosses only gain health.**
Evidence: at level 41 the Goals panel says "You have opened every world, crop and the Vault" (`play-late/shots/x-goals.png`). Bosses get +12% health per level of difference (`src/world.ts:1929`): King Bear grew to 47,158 health and still fell in 35 s. 17 bosses share 7 moves (`src/boss-patterns.ts:8-14`). 19 kills in 26 s in the swamp.
Fix: new idea 7 (Ascended planets) and one signature move per boss. Effort XL, speed risk low.

**7. Boss fights are long, never lost, and skill earns nothing.**
Evidence: careless scripts win 6 of 6 against King Bear (7.9x health taken) and Shadow Lord (12.5x, 100 s), healed by food mid-fight (`design/fight-sim.log`). The bag is kept on defeat by default (`src/model.ts:851-852`). Shadow Lord takes 113-120 s against a 45-90 s target (FIGHT-PLAN §7).
Fix: phases at 60% and 30% with about 25% less health, one weakness per boss (new idea 6), medals (new idea 5). Effort M, speed risk low.

**8. Soothing the Colossus pays the same as waking it.**
Evidence: soothed = one fifth of the health and 50x lighter hits (`src/colossus-sleep.ts:18-22`), but the same 30,000 XP for every choice (`src/colossus.ts:343`); one kill takes a level-20 player to level 28.
Fix: wild = full XP, crown chance and pet; soothed = about 20% XP plus "calm ember" materials; asleep = a small daily garden buff. Show the trade-off at the well. Effort S, speed risk none.

**9. In the tutorial fight, Attack opens shop, workshop and pen dialogs.**
Evidence: 6 dialogs opened by Attack during "Defeat five creatures" on the phone; about 75 pen dialogs in 4 minutes on PC (`play-new/phone2-log.json`, `play-new/shots/phone2-17-fight-dialog-Made_with_a_li.png`). `src/attack-intent.ts:26-28` returns "use" whenever no hostile is in reach, and the tutorial creatures stand among those buildings.
Fix: keep Attack as the use button (owner decision), but let it swing whenever a creature is aggroed or within about 6 m, and during the fight step; move the tutorial creatures away from usable buildings. Effort S, speed risk none.

**10. The first fight needs no input and has no threat.**
Evidence: tapping the quest tracker walks the hero to each creature and auto-attacks: 5 kills in 20-21 s, 0 Attack presses, health stayed 130/130 (`play-new/phone-fight-log.json`, `play-new/shots/phone-fight-kill.png`).
Fix: one tutorial creature telegraphs a wind-up to dodge; auto-swing waits for the first manual press; a finisher prompt and a big first-kill moment. Effort M, speed risk none.

**11. A deadly zone starts 15 m from the market.**
Evidence: a level-2 hero met a level-7 Prickly Cactus (364 health) just east of the market and was knocked out 4.4 s after the first hit (`play-new/shots/pc-18-fight-dialog-A_little_rest_.png`). At level 4 a bounty asked for that cactus.
Fix: a sign or gate with a level badge at the border, a warning banner, a red-tinted threshold; offer bounties only up to player level +1. Effort M, speed risk low.

**12. Progress has no moments.**
Evidence: level-ups only flash the EXP bar (`src/main.ts:547,553`; levels 1 to 4 in 68 s with no pop-up). Each story step needs an extra "Collect your reward" tap (`play-new/phone2-log.json`). Pepper's 10,000 gift is a text dialog with an emoji portrait (`src/main.ts:602`, `play-new/shots/phone-10-pepper-gift.png`). Damage numbers are small and grey.
Fix: a 1.2-1.5 s level-up moment that does not pause play; rewards that fly into the HUD; Pepper walks over and coins count up; chunky coloured numbers. Effort S, speed risk low.

**13. No music outdoors.**
Evidence: the only music is a 37 s mono MP3 played by the cottage radio (`src/house-life.ts:50-87`); zero audio requests from boot through a fight (`audio-feel/probe-save.json`). The MP3 (443,916 bytes) is also downloaded at service-worker install (`server/build-offline.mjs:46-49`).
Fix: new idea 23; first add `/assets/audio/` to the on-demand list so music never grows the first download. Effort L, speed risk none.

**14. The world is silent and creatures are mute.**
Evidence: measured peak 0.000 over 6 s idle in the swamp (`audio-feel/probe-save.json`); no footstep sound (`src/sfx.ts:16-22`); every creature plays the same alert beep and the same "poof" (`src/main.ts:1440,1537`); no boss wind-up sound; the Colossus roar reuses the player's hurt voice (`src/colossus.ts:281`).
Fix: new ideas 22 and 24. Effort M, speed risk low.

**15. The sound mix hides key cues.**
Evidence: the fist whoosh peaks at -36 to -40 dBFS and POWER READY at -36 to -38, against -6.5 for the power strike (`audio-feel/loudness.json`). The level-up fanfare plays from 24 call sites (equip, boss defeat, gifts, landing...). The music slider does nothing on iPhone (`src/house-life.ts:65,79`). One bus, no panning.
Fix: a loudness table enforced by a test; distinct stingers; one audio context with music, ambience, effects and UI buses. Effort S-M, speed risk none.

**16. 32 creature types, including 11 bosses, are still code shapes.**
Evidence: only 27 types have Blender art (`src/creature-art.ts:21-27`) out of 60 (43 creatures + 17 bosses in `src/enemy-types.ts`). The rest are balls and cylinders, and every boss gets the same crown (`src/world.ts:939-973`). Cake King and Shadow Lord: `play-late/shots/p1-candy-boss.png`, `art/crop-shadowlord.png`.
Fix: a planet creature kit per planet, loaded on landing like `titans.glb`; bosses first, each with its own silhouette (new idea 28). Effort L, speed risk low.

**17. The light model flattens every bevel the Blender kit builds.**
Evidence: the reference's 4-step grey toon ramp `[110,185,235,255]` (`src/toon.ts:5-10`) and the reference's ink colour (`src/outline.ts:5-16`). Compare the game shot `art/shots/a02-well-closeup.png` with the Blender preview in the repo, `art/previews/kit/hero.webp`.
Fix: new idea 27 (own ramp, baked rim, own ink colour). Effort M, speed risk none.

**18. Planets are empty and often pastel, with the reference's colours.**
Evidence: planet colours come from the reference table (`src/content.ts:1947`, "facts measured from the public reference client" at line 7). Candy frame mean lightness 0.74 (`rubric/06-planet-candy.png`); flat plains with even scatter (`src/biomes.ts:51-58`, `art/shots/b-jungle-wild.png`). The Night planet is the right dark blue but empty (`play-late/shots/p2-night-wild.png`). Planets use only 93-144 draw calls, so there is budget.
Fix: our own saturated palettes; clustered scatter; a landmark per planet. Effort L, speed risk medium.

**19. Water is static and flat everywhere.**
Evidence: "no custom shaders" (`src/pond-view.ts:12-14`); a flat cyan ocean with a hard island edge (`art/shots/b-ocean-wild.png`); lava clipped to pure orange #ff3e00 (`art/shots/b-lava-wild.png`).
Fix: one toon water patch with depth bands, foam and lava crust, still 2 draw calls per pond (new idea 29). Effort M, speed risk low.

**20. The garden mixes two art styles.**
Evidence: crops are 2D cards with the reference's thick ink outline (`src/crop-cards.ts:9-16`), baked from a 51.5° view while players default to 42° (`src/crop-cards.ts:12,25-26`). Ripe cards hang over the next bed (`play-new/shots/phone-08-ripe-tip.png`, `art/crop-crops.png`).
Fix: re-bake the cards at the player's angle without the ink rim, cap their size, give the beds a bevelled planter (owner decision on 2D vs 3D). Effort M, speed risk low.

**21. The game still presents itself as the reference.**
Evidence: the hub layout (`src/bot-logic.ts:199`, `ideas-docs/village-default-camera.png`); the skill names (`src/main.ts:319`); "Candy Planet", King Bear; `README.md:3` "built against the gameplay of the reference game"; PARITY.md lists copied tables; 228 comment lines mention "the reference".
Fix: the identity pass (owner idea 1); rewrite the README as our own pitch. Effort XL, speed risk none.

**22. Space breaks the night colour rule.**
Evidence: nebula #8f398b (magenta, hue 303), violet-black sky, square stars, faceted asteroids (`src/space-view.ts:58,68,145`; `play-late/shots/p1-space-pilot.png`). The key hints hide under the Return home button.
Fix: very dark blue sky with blue and teal nebulae, round stars, kit asteroids, move the hints. Effort S, speed risk none.

**23. The Vault and Rescue Call arenas look unfinished.**
Evidence: Vault rooms reuse the swamp trees on flat floors, and a tree crown hides the boss fight (`play-late/shots/m1-vault-exit.png`). Rescue ground is dull olive with 10-20 px units (`play-late/shots/m4-rescue-wave-1.png`).
Fix: a baked kit per Vault room with a clear centre; a higher Rescue camera, bigger outlined units, real build plots. Effort M, speed risk low.

**24. The hero moves stiffly.**
Evidence: on stopping, the leg goes from -0.545 rad to 0 in one 16 ms frame (`audio-feel/anim-probe.json`); idle is two sine waves forever (`src/world.ts:2436`); the face never blinks or changes; nothing sways. Friends already blend their walk (`src/walk-cycle.ts`).
Fix: new idea 26. Effort M, speed risk none.

**25. Hit-stop and shake numbers are off.**
Evidence: ordinary hits get no freeze, and Battery saver removes all (`src/hit-react.ts:25-35`). The stop is a 10% slow motion of everything, including shake and particles (`src/main.ts:2468`). Shake is random per frame with a fixed 0.3 s fade and no setting (`src/fx.ts:314-324`). Early Attack presses are dropped (`src/main.ts:1939`).
Fix: new idea 25. Effort S, speed risk none.

**26. The camera does not frame the play, and the first view hides the goal.**
Evidence: no look-ahead (`src/camera-rig.ts:9`). On a new phone the beds are off screen (`rubric/09-first-view-phone.png`). On PC the keyboard panel covers the nearest bed and clips the pointer (`play-new/run1/pc-04-first-view.png`); it folds only after 120 key presses per device (`src/hud-keys.ts:10`).
Fix: look ahead 1.5-2.5 m; fight framing; a short pan to the beds after Play; start the keyboard guide folded. Effort M, speed risk low.

**27. HUD text is too small and some targets too small to tap.**
Evidence: EXP 8.5 px (`src/hud-ours.css:321`), map caption 8.5 px (`:311`), HP 9.5 px (`src/hud-compact.css:102`); 74 font-size rules under 11 px. On the phone 11 buttons are under 44 px (Backpack, Journal, News, More at 34x34) (`play-late/shots/ph03-village.png`). Trackers cut off the count ("Harvest three crops ·…", `play-new/shots/phone-04-first-view.png`).
Fix: 11-12 px floor, 44 px hit areas, the count in its own chip; add the check to the UI audit. Effort S, speed risk none.

**28. Fights are hard to read.**
Evidence: "FINISHER!", "Root Quake", "BREAK!", "RESIST" and "1061!" inside about 150 px (`play-late/shots/f4-bear-1.png`, `art/crop-bear-text.png`). Colossus attack names are faint red on brown (`play-late/shots/m3-colossus.png`). Trees fading in front of the hero become coarse noise (`src/occluders.ts:10-25`, `play-late/shots/p1-elite-approach.png`).
Fix: callout lanes with one big word at a time; drop the skill-name float; solid warning pills; a stable fade pattern at about 50%. Effort M, speed risk none.

**29. Emoji and web-style lists stand in for game art.**
Evidence: about 1,500 emoji in 99 source files; the welcome card art is three emoji (`src/welcome-cards.ts:8`); the map is an emoji picture that does not show where you are (`src/main.ts:1143`, `play-new/shots/pc-22-map.png`); the shop is a white web list (`play-new/run1/pc-14-shop.png`).
Fix: one SVG icon family plus the existing 3D item icons (loaded after Start); a real map from the minimap data; a card-grid shop. Effort M, speed risk none.

**30. On phones the 3D picture is jagged.**
Evidence: antialiasing is turned off on phones with a pixel ratio of 2 or more (`src/main.ts:351`), and the phone draws at ratio 1.25 (`src/graphics.ts:54`), 487x1055 for a 390x844 screen. Stepped roof and hero edges (`play-new/shots/phone-04-first-view.png`).
Fix: let the governor raise the ratio to 1.5 or switch on multisampling when there is headroom; test on a real phone first. Effort M, speed risk medium.

**Also found (smaller):**
- The farm pen is empty for every returning player: animals expire after 2 h (`src/farm.ts:73`), and the dialog says "Collect meat when it ends" (`play-late/shots/v03-pen-dialog.png`).
- Text drift: Help says bosses block low hits (`src/help-topics.ts:28`) but blocking is off; FIX-PLAN 5.1 and 6.3 say todo but are built; news.json says the Greenhouse is "In progress" with no code; "1 consecutive days" has no singular (`src/welcome-back.ts:79`, `src/progression.ts:317`).
- Two fight rule sets: online play forces the classic rules (`src/main.ts:294-301`), so every fight change needs two versions.
- The cottage leaves the bottom 40% of the screen as a dark void on PC and phone (`play-late/shots/v04-cottage.png`).
- Fishing has no late challenge (max line tension 0.32) and the catch is only a floating label (`play-late/run.log`).
- Disguise and skill visuals are thin: the Sun knight reads as a white egg; skills are thin rings (`play-late/shots/f3-disguise-s1.png`).
- The green Crocodile King fights on green swamp ground (`art/crop-croc.png`).
- Rescue Call lists "Clover" twice when the player keeps the default name (`play-late/shots/m4-rescue-result.png`).
- Small UI layout issues: tab arrows cover labels ("Sup›es"), cut-off ranking tabs, toasts over the target frame, a see-through "Go!" banner.
- The late test save is not a real late player: its main weapon is the harpoon and its collection is at 1% (`promo/stage-late.mjs`).
- The phone help names PC keys ("Q throws petals... WASD") (`play-new/shots/phone-23-help.png`).

---

## 6. Code health

**State today**

| Check | Result |
|---|---|
| Type check (`tsc --noEmit`) | Passes with no errors (69 s) |
| Tests (`npm test`) | 2,234 tests: 2,172 pass, **1 fails**, 61 skipped, 248.6 s (`code/test.log`) |
| The failing test | `tests/w15-review.test.ts:151`: a date time-bomb, fails every run since November; it blocks the Pages deploy |
| Skipped tests | 61 browser tests in 8 files never run in `npm test` or CI (they need `HUD_LAYOUT_URL`) |
| Same clock risk | 11 more test files mix fixed 2026 dates with `newGame()`; 131 rule functions default to `Date.now()` |
| Dead code | Small: 17 dead exports, 43 unused locals and imports, about 29 unused CSS selectors (about 3 KB), no unreachable files |
| Leftover debug | No `console.log`, one TODO, one commented-out line |

**What is good.** The rules are pure TypeScript and shared with the server: `actions.ts` is a 104-case reducer that `server/action-service.mjs` imports, and model, content, combat and progression do not touch three.js. That is a strong base for new systems.

**What is heavy**

| File or area | Size and shape |
|---|---|
| `src/main.ts` | 344 KB, 2,560 lines, 225 functions, 138 module-level mutable variables, one click handler with 122 cases (`main.ts:2253-2403`), touches 151 World members |
| `src/world.ts` | 266 KB, one class with 191 methods and 203 fields; `update` 14.5k characters, `animatePlayer` 12.9k, `updateEnemyAi` 12.1k |
| `src/combat.ts` | `CombatSimulation.cast` is one 22.6k-character switch |
| Tests welded to source text | 48 test files read `main.ts` as text, 148+ assertions match its source, 21 harnesses cut functions out of it and run them in `node:vm` |
| UI CSS | 51 files (326 KB), `.dialog-body` styled in 18 files, 597 hex colours, 87 font sizes, 47 `!important` |

**Safe mechanical cleanup** (each verified with `tsc`, `npm test` and `npm run build:pages`)

| Item | Evidence | Effort |
|---|---|---|
| Fix the date time-bomb test | `tests/w15-review.test.ts:34,151` | S |
| Delete 17 dead exports (and 4 unused types) | `code/deadcode.json` (for example `boss-body.ts:73`, `guide.ts:100`, `viewport.ts:20`) | S |
| Remove 43 unused locals and imports, then set `noUnusedLocals: true` | `code/tsc-unused.log`; unused `audio` at `main.ts:241` | S |
| One `escapeHtml` instead of 19 copies of `esc` | `auto-plant-ui.ts:12`, `bag-slots-ui.ts:12`, ... `main.ts:228` | S |
| One `dist2D` instead of 7 `dist` helpers | `colossus-patterns.ts:36`, `ctf-ai.ts:17`, ... | S |
| Delete dead CSS and the unused welcome-card styles | `welcome-cards.css:4-9`, `code/css-unused.json` | S |
| Move 5 stale root review docs to `docs/history/`, fix the README links | `ANALYSIS.md`, `EVALUATION.md`, `REVIEW.md`, ... (README.md:121-123) | S |
| Fix the broken title of `PERFORMANCE_REVIEW.md` and move it to `docs/` | title shows mojibake | S |
| Fix two links to a `PERF-ANALYSIS.md` that never existed | `main.ts:2463`, `scene-matrices.ts:8` | S |
| Put the `?colossus=1` URL switch behind the dev build | `main.ts:2523` | S |
| Fix the Help text about boss blocking (English and Vietnamese) | `help-topics.ts:28` | S |
| Rename 18 test files named after work waves (`w15-review` and so on) | `tests/w9-review...` | S |

**Careful refactors** (in this order; each one checked with the speed gate)

1. **Decouple the tests from `main.ts` text first.** Move each harnessed controller into its own module and import it; replace source-regex checks with behaviour checks; add a rule that no new test reads `src/*.ts` as text. Effort L.
2. **Carve `main.ts` into controllers** (dialogs, fishing, combat input, flight, decorations, mode host) that all receive one `GameServices` object. This also lets rarely used dialogs load on demand, which shrinks the first download. Effort XL.
3. **Split `World` into systems** behind the same facade: creature AI, player animator, telegraphs and trails, world builder. Effort L.
4. **An ability registry** instead of the 22.6k-character switch, shared with the server. New skills and boss weaknesses then need no switch edits. Effort L.
5. **Break the runtime import cycle** around `model.ts` (7 files) before splitting model or content. Effort M.
6. Merge only the byte-identical `hash` functions, with golden tests first (changing one changes seeded content and saves). Effort S.
7. Delete the always-on perf-flag "off" paths (including the reference's flat look) once A/B checks are no longer needed. Effort S.
8. Split `promo/` into tools, saves and shots (other sessions use these paths, so update them all). Effort M.

**Architecture blockers for AAA** (the missing foundations matter more than cleanup)

| Missing layer | Today | Needed for |
|---|---|---|
| Animation clips | No AnimationMixer or skinned mesh; every pose is hand-written in `World.animatePlayer` | Expressive hero, emotes, story scenes |
| Story, dialogue and scenes | A 29-row checklist; the only sequence code is take-off and landing (`ship-sequence.ts`) | Every story idea |
| One audio director | Three entry points: `sfx.ts`, a second audio context in `house-life.ts`, an unused one in `main.ts` | Music, ambience, ducking, iPhone volume |
| Design tokens for the UI | 597 colours and 87 font sizes in 51 layered files | A consistent AAA UI |
| One fight rule set | Solo air rules, classic rules and online rules; `airOn()` checked 45 times in `main.ts` | Boss weaknesses, elite roles |

Two guards help while this work runs: an **architecture fitness test** (fails if `main.ts` or `world.ts` grow, if a new test reads source text, or if a new import cycle appears), and a weekly **time-shift test run** with the clock moved +45 and +400 days.

---

## 7. Speed baseline for this round

**The tool problem first.** Until `promo/perf-budget.mjs` is fixed (problem 2), its numbers are not valid:
its rows all measure 42° (not 51.5°), the wild and canyon rows may silently run at Battery saver on a busy PC,
and AI neighbours move the village by 35-50 draw calls. The published table in QUALITY-PLAN §2 was taken at 51.5°, a pitch players no longer use.
So the perf evaluator measured a clean baseline with its own probe: graphics pinned to Sharp, the real 42° pitch,
1600x900, Colossus asleep, two runs. Frame rates are not reliable on this shared PC (4 to 47 fps for the same row), so **draw calls and triangles are the gate**.

**Gate thresholds (use the larger value of two runs; a change passes only if it stays at or under these)**

| Place | `promo/save-late.json` (level 41) | `promo/save.json` (level ~40) | `promo/save-new.json` (1 run, for reference) |
|---|---|---|---|
| Village | 294 draw calls / 245,000 triangles | 284 / 241,000 | 204 / 181,000 |
| Wild (Chomper Swamp) | 95 / 88,500 | 79 / 81,500 | 78 / 85,700 |
| Canyon | 132 / 83,000 | 116 / 75,500 | 126 / 82,000 |

**Secondary rows (late save, one run each; must not grow by more than 5%)**

| Row | Village | Wild | Canyon |
|---|---|---|---|
| Camera at 30° (slider minimum) | 304 / 268,000 | 134 / 134,000 | 157 / 101,000 |
| Phone 390x844, Auto graphics (ratio 1.25) | 182 / 180,000 | 85 / 83,000 | 124 / 74,000 |
| Classic 51.5° (to compare with QUALITY-PLAN §2) | 243 / 224,000 | 83 / 74,000 | 111 / 70,000 |
| Colossus fight (not in the gate yet; add a row) | 272 / 118,000 (measured once by play-late) | | |

**Download thresholds**

| What | Limit | Source |
|---|---|---|
| Download before play | 1.6 MB (new save), 1.8 MB (late save) | FIX-PLAN 2.2, 2026-10-15 |
| Live site to the Start button | 785 KB in 6 files (1.9 s on a fast link) | `rubric/live-load.mjs` |
| Start code (gzip) | 792 KB (index 276 + world 198 + three 145 + rules 125 + CSS 48) | `dist` built from b3b9f57 |
| All 56 models (gzip) | 1.96 MB | `perf/models.log` |

**Other rules that stay:** per-frame effects only as opt-in extras, never on phones; new music, icons and story art load after Start;
music files go on the service worker's on-demand list. After the tool is fixed (pinned level, `setCameraPitch`, neighbours off,
main and shadow draws split), take a new baseline once and use its maximum plus 3%.

**Where the frame goes (late village, 293 draw calls), and the headroom this opens**

| Bucket | Draw calls | Idea to cut it | Expected |
|---|---|---|---|
| Buildings and static props | 105 (51 main + 54 shadow) | Merge the placed village into one batch per material | about 105 to 12-18 |
| Shadow pass | 83-120 (61 static casters) | Bake static shadows into ground colour, or a static shadow map | about 100 to 30-45 |
| Characters, pets, gear, outlines | 106 | Merge bot pets and gear; later one batched mesh for all rigid parts | -25 to -30 first |
| Scatter (trees, rocks, cover) | 37-44 per place | Merge each type's parts into one geometry per tile | about 40 to 15 |
| Ponds and fish | 32 for 7,500 triangles | Bake banks, lilies and reeds; instance golden fish | about 32 to 15 |

Freed draw calls are the honest way to pay for richer scenes: spend part of them on landmarks and density, but keep the gate at today's numbers.
Two more checks: phone fights still have 83-126 ms stalls (FIX-PLAN 1.1; warm up effect materials after the first frame and add a slowest-frame column),
and the 42° default shipped before the distance LOD the plan asked for (30° costs +41% draw calls and +52% triangles in the wild).

---

## 8. Open decisions for the owner

**Big direction**

| # | Question | Recommendation |
|---|---|---|
| 1 | Tone: a cozy life game, or an action game with a story on the side? | Cozy life at the centre, with real action trips beyond the gates, and the story told through the village. |
| 2 | Which story? QUALITY-PLAN's "ember springs" or the "Homeward Book" draft in `cute_game_boat`? | Combine: Homeward Book for the home arc, ember springs for the planets, both built on your rescue-then-they-come-home motif. Name one repo as the owner of the story. |
| 3 | May the village hub change shape, with a save migration? | Yes. Move placed beds and decorations by their layout and pack anything that no longer fits into the bag (`decor-move.ts` can already pack away). |
| 4 | Where does music come from: generated, licensed or a composer? | Free first: zero-byte synthesized ambience now; original music generated with ACE-Step (the song-making skill) plus free-licence loops; you listen and keep only the good takes. A composer only before a sale. |
| 5 | Online: host the server, or declare the game solo-first? | Solo-first for the AAA push. Retire the classic fight path so there is one fight system; park online Flag Rush and Rescue co-op. |
| 6 | Name and public docs: keep "Zoo Garden" (next to "the reference game")? Keep PARITY.md and the clone wording public? | Consider a new name without "Zoo" before any sale. Move PARITY.md and the reference notes to private notes now; rewrite the README. |
| 7 | Sibling games (`cute_game_boat`, Cloudback, Willowmere) reuse Zoo Garden art. What stays unique here? Which repo leads character art? | Name Zoo Garden's signature (the Ember Well story, the planets, the new hub) and do not export it. Say which repo leads character art, and accept or trim the +4 KB faces. |
| 8 | Port the fork's everyday disguises (swimmer, K-pop singer, yoga teacher, nurse) and the bear/fox ears? | Yes, as on-demand kits made "more vivid", with a stated triangle budget per avatar. |

**Game design**

| # | Question | Recommendation |
|---|---|---|
| 9 | Crops: keep 2D cards (your 2026-10-01 wish) or one 3D art style? | Redraw the cards in the toy style at the player's camera angle first. True 3D crops only if the village gate still passes. |
| 10 | Bed upgrades: keep 2x speed per level up to level 5 (your solo-friendly batch)? | Soften it: 1.6x per level, or levels 4-5 paid in Rune Seals; less XP from crops far below your level. Keep the 10,000 welcome gift. |
| 11 | AI neighbour gifts and special offers give away top items. Limit them? | Neighbours give cosmetics and recipes; special items become a buy-back after the first drop. |
| 12 | Colossus: should wake, soothe and sleep pay differently? Beginner lid at level 20 (you named 15 or 30)? | Yes, different rewards (problem 8). Keep the lid at 20 unless you pick another level; it stays per device. |
| 13 | Farm pen: animals expire after 2 h and give meat. Keep? | Let animals stay (ranch); products become the timer. |
| 14 | Default explorer name "Clover" clashes with the farmer and the village. Rename? | Yes: ask for a name with suggestions, and rename the farmer. |
| 15 | A PC-only "Fancy effects" switch (glow, depth blur)? | Later. First pooled VFX shapes and colour, which cost nothing per frame. Never on phones. |
| 16 | Phone sharpness: let the governor raise the resolution or turn on multisampling when a phone has headroom? | Yes, after a real-phone test and a phone row in the gate. |

**Smaller tuning questions still open in FIX-PLAN and FIGHT-PLAN** (answer in one go; the recommendation is the default if you say nothing)

| Question | Recommendation |
|---|---|
| Five-button fight: fire while Attack is held? +10% for specials? Keep the "Attack chain" bench row? | Keep hold-to-fire (phone-friendly); no +10%; keep the bench row; the special rides on the strike |
| Power strike: 20 hits for 5 basic hits, or 10 for 2.5? | Keep 20 for 5; try 10 for 2.5 once on a real phone |
| Cooldowns, or one stamina bar for all moves? | Keep cooldowns (already balanced; less HUD) |
| Perfect-dodge critical? | Keep it |
| Strike in the fourth slot? | Close: the Strike was removed |
| Shadow Lord too long: re-tune or raise move damage? | Re-tune the boss with its weakness (FIGHT step 4) |
| Crab shield: 15% or 30% of shots pass? Spread splitter children? Next elite? | 30%; spread the children; next a flyer that wants Lob or Rush; keep the second split off |
| Weapon pair: accept Shadow Lord +6%, keep the 3 s hold? | Yes to both; Tab already swaps on PC |
| Sword wind "premium": cosmetic only? +0.4 m reach at +15? | Cosmetic only; no extra reach (keeps every item equal at +10) |
| Swimming numbers; shots crossing ponds for everyone? | Keep the numbers; yes, one rule for all |
| Breakables: ice first, 6 wood a day, partial damage heals? | Yes; scenery hits only when no creature is in reach |
| Bag: E and the in-place card in the shop too? E takes off a worn item? | Yes to both |
| Journal: group as Explore / Grow / Collect? | Yes, with the collection book under Collect |
| Hit-feel: light throw 2.8 m or 2 m; elite weight; croc hit radius; titans solid? | Keep 2.8 m until a phone test; elites heavy; fit the croc radius to its body; titans solid |
| Rescue Call: 5 or 8 full-pay wins a day; free failure? | Keep 8 and free failure |
| Steady rod: 10% snap chance, or truly never breaks? | Keep 10% unless you want "never" |

---

## 9. What was not checked

**Not checked by anyone**
- Real phones, iOS Safari and WebKit. All phone data is desktop Chromium emulation (often SwiftShader); heat, battery and real frame rates are unknown.
- Frame rates and input delay. The PC was about 90% busy; only draw calls, triangles, bytes and screenshots are reliable.
- Sound by ear. Headless browsers have no speakers; levels were measured offline, not judged for quality. The theme's musical quality was not judged.
- A fresh production build. Download numbers come from FIX-PLAN 2.2 (2026-10-15), the `dist` folder built on 2026-10-28 and the live site.
- Online play and the server (all runs were solo).
- The Vietnamese language, colour-blind readability, and texture memory of a bigger crop atlas.
- Animation in motion: judged from stills, code and one probe.
- The reference game itself. Claims about what is copied rest on the repo's own comments and docs (`content.ts:7`, `toon.ts:5`, `PARITY.md`, `README.md:87`).
- The 61 browser test suites, `promo/frozen-ab.mjs` before/after checks, and the Balanced and Battery saver graphics rows.

**Partly checked**
- The owner's messages from 2026-10-06 to 10-14 (AI neighbours, modes, Rescue Call, the 10-11 own-game plan, fight decisions) are no longer on disk; that week comes from the docs only.
- `promo/fight-sim.mts` hit its 300 s limit during the Shadow Lord table (King Bear and Yeti complete).
- Modes: no full Vault run to its reward screen, no full Flag Rush match, no soothed or Automatic Colossus, the splitter elite never split on camera, the Ocean elite not seen.
- Story chapters after chapter 4 step 22; minutes 2-15 of a real first session (fishing, crystal step, cottage, first flight).
- Planets were shot about 26 m from each landing pad; their outer areas may be fuller.
- The sibling repo `cute_game_boat` was only skimmed (its BACKLOG and design book are unread).
- The origin of the extra 20,000-30,000 village triangles since 2026-10-11 was not traced.

**Evaluators that returned nothing:** none. All ten (`ideas-docs`, `ideas-prompts`, `code`, `play-new`, `play-late`, `design`, `audio-feel`, `rubric`, `perf`, `art`) returned results.

**Where evaluators disagreed, and how this document settles it**
- *Phone antialiasing.* Art said it is on (`world.ts:275`); play-new measured it off. Checked for this document: `src/main.ts:351` turns it off on phones with a pixel ratio of 2 or more. Play-new is right.
- *Keyboard guide.* The docs evaluator found it built; the play-testers saw it open everywhere. Both are true: it folds after 120 key presses per device (`src/hud-keys.ts:10`), and fresh test browsers never reach that.
- *Story length.* Counted for this document: 29 steps (9 + 6 + 6 + 8) in 4 chapters.
- *Creature count.* Counted for this document: 60 types in `src/enemy-types.ts` (43 creatures + 17 bosses). Two evaluators counted 69 with a wider method.
- *Fancy effects and music source.* One evaluator said drop Fancy effects and license music; another said build an opt-in switch and use free or generated audio. This document recommends pooled VFX first and free audio first (decisions 4 and 15), because of the speed rule and the free-first rule.
- *Core loops.* The rubric scored loop breadth 6; the design review scored the economy 2. Both views are kept as separate rows (16 and 15) because both are true: there is a lot to do, but the rewards do not matter.
