# Zoo Garden: plan to become our own game and look much better, without getting slower

Written 2026-10-11. Status: plan only, nothing built yet. Feature work happens on the `develop` branch; `main` is what players get.

## 1. Goal and limits

- **Different.** At a glance the game should no longer look like a sibling of the game it was first built against.
- **Better.** The target is the look and feel of a polished console or mobile indie game. True AAA needs teams of animators, composers and artists, so that is not promised.
- **Not slower.** This is a hard rule (section 2). A stage that costs speed does not ship.
- **Web first.** The game keeps running in the browser, on phones and PCs. Steam and other stores come later, if at all.

## 2. The speed rule

Every stage is measured before and after with one command, and merges only if it passes.

**How to measure**

One tool, `promo/perf-budget.mjs` (npm scripts `perf:gate`, `perf:baseline`, `perf:bytes`), frozen so that the same tree gives the same numbers.

```
npx vite --port 5298 --host 127.0.0.1 --strictPort                    (one terminal; the dev server has the __zoo hook)
PORT=5298 node promo/perf-budget.mjs --compare                        (another; about 3 minutes for its two runs; exit 1 on any row over its limit)
PORT=5298 RUNS=4 node promo/perf-budget.mjs --baseline                (only to re-take promo/perf-baseline.json; ONLY=<words> re-takes just those rows)
npm run build:pages && npm run perf:bytes                             (download weight, see below)
```

- **What it measures.** 24 rows at 1600 x 900 unless stated: village, wild and canyon at the default 42 degree camera on the late, mid and new test saves (9); 30 and 51.5 degrees on the late save (6); a phone (390 x 844, device scale 3, touch) on graphics High (3); Balanced and Battery saver on the late save (6). A row is invalid, and refused, if the camera is more than 0.5 degrees off its pitch, the graphics level is not the pinned one, the hero is not on the spot or a dialog is open.
- **How it is frozen:** `performance.now` and `Date.now` are fake, `requestAnimationFrame` is pumped by hand, `setTimeout` and `setInterval` run on the fake clock from Start on, `Math.random` is seeded and every frame starts a random stream of its own (made from the frame's number), neighbours are off, the Colossus sleeps, graphics are seeded. The game advances only in blocks of 30 frames; after each block it stands still, in real time, until nothing it asked for is on its way (a download, a lazy chunk, a kit being built, a texture being decoded). So art lands between the same two frames however slow the machine is, and every run reads the same frame of the same world; each row prints that frame number. After Start and the greeting cards the game runs a fixed 900 frames; for each row the hero is pinned, 120 frames run, and ONE `world.render()` is counted with a draw counter that is active only inside that call. No frame rate is measured (a slow CPU makes it a lottery).
- **What a row holds:** main draws, shadow draws, triangles, the shader programs that frame's own draws use (not every program compiled since the page opened), geometries, textures, geometry bytes, scene matrices visited, the graphics level and shadow-map size. What chance decides is counted apart and kept out of the exact counts: `fx` (spark and glow pools, loot cards, shots in the air), `roam` (a rescued friend walking through the view; about 13 draws each) and their shadow draws (`fxShadow`, `roamShadow`).
- **Limits** (`promo/perf-compare.mjs`, tested by `tests/perf-compare.test.mjs`): draws, shadow draws, triangles and programs must not pass the baseline's larger value: exact, with nothing added for spread (the spread between the baseline runs is recorded in the file, and is 0 on every frozen row). Memory counters may grow 5%. `fx` and `fxShadow` may grow 3, `roam` and `roamShadow` 16. A named entry in `promo/perf-ledger.json` (`{ "row": "<key>", "name": "<package>", "allow": { "main": 6 } }`) raises its own row's limit and nothing else; every entry is a decision, so it carries the package's name. Compare measures twice and reads the smaller value of each field (a real addition shows in both runs); a row that is invalid or missing in either run is refused.
- **Self-test:** `PROBE_ADD=village node promo/perf-budget.mjs --compare` adds one mesh to the village rows and must fail them.
- **Download weight:** `npm run perf:bytes` (after `build:pages`) prints the English start (index.html and every script, modulepreload and stylesheet before Start, gzip), the Vietnamese start (that plus the vi-pack chunk) and the install list (the service worker's CORE and EXTRA lists: gzip for scripts, stylesheets, JSON and SVG, raw for models, audio and images), per file, so a new lazy chunk shows up by name.
- **More rows (AAA plan WP3, 13 of them; same tool, same commands):** moving rows (`village-move`, `wild-move`, `canyon-move`: the hero walks east and north for 1 s, then one frozen frame); King Bear and the old treant on `promo/save-mid.json` (level 8, story step "Defeat a boss", the hero 8 m from the boss: `frame` is one frozen frame half way through the boss's first wind-up, on desktop and phone, `peak` the 4 s after it); `swampfight` (8 s in the swamp with a fixed input script); `space` (one frozen frame 4 s after entering space); `idle` (4 s of idle village: the page's layout work); `colossus` (4 s beside the woken Colossus). Frozen frames are exact like the standing rows. The `peak`, `swampfight` and `idle` rows are live: the fake clock, one game frame for each real browser frame; peak draws, peak shadow draws, peak triangles and Chrome's LayoutCount, RecalcStyleCount and Nodes may grow 5% over the baseline's larger value (no spread added); shader programs created during the row may not pass the baseline at all; the slowest frame and long tasks are logged only. The Colossus row is a report, never gated; since the tool reads the same world every run its runs agree within 5% (144 + 57 peak draws in all four), so it can be made a gated live row when the owner wants.
- **Known holes (rows that need slack over 2 draws or 1% of triangles): none.** In the baseline of 2026-11-21 (four runs) all 27 frozen rows are identical in every counted field, and so are the peak draws and triangles of the live rows. What still differs between runs is Chrome's own layout work in the four live rows, because the browser's frames are real: at most 4 layouts and 26 style recalcs (3.5%, the scripted fight), inside the 5% those counters are allowed. `SHOTS=<dir>` is for looking only; `--baseline` and `--compare` refuse it. `ONLY=<words> --baseline` re-takes just those rows and leaves the rest of the file, and its run counts, alone.
- **Before-play download:** `npm run build:pages && npm run perf:download` (`promo/first-visit-bytes.mjs`; `--baseline` re-takes the `download` section of `promo/perf-baseline.json`). It starts its own `vite preview` on `PORT` (default 5297), opens a fresh profile with the service worker blocked, and weighs what the browser fetches up to the Start button (until the network is quiet for 2 s) and from Start to 10 s after the first played frame, by type, for the new and late saves in English and Vietnamese. Files are weighed from the build as the host sends them (gzip for code, raw for models, audio, images and fonts). Limit: exact plus 1% noise per window and per type; the lazy `features` and `features-vi` chunks may arrive after Start within 30 KB and 15 KB.
- **When a change needs an exact picture before and after,** `promo/frozen-ab.mjs` renders the same frozen frame with the change off and on.

**Browser tests** (the eight suites that need a running dev server; run after every merge, about 16 minutes; `CI=1` style limits do not apply here):

```
npx vite --port <own port> --host 127.0.0.1 --strictPort        (a private cacheDir in a wrapper config, so other servers are not disturbed)
HUD_LAYOUT_URL=http://127.0.0.1:<own port>/ PLAYWRIGHT_MODULE=<a playwright install>/index.mjs node --test tests/art-retry-browser.test.mjs tests/device-qa.test.mjs tests/dialog-dock.test.mjs tests/hud-layout.test.mjs tests/item-layout.test.mjs tests/mobile-menu-layout.test.mjs tests/quick-eat-browser.test.mjs tests/rescue-view-browser.test.mjs
```

Do not edit `src/` while they run. The HUD test measures the plate the way hud-ours.css lays it out (name and energy count on one row beside the portrait tile; short landscape phones keep the name above the tile).

**Test foundations** (WP1 of `docs/AAA-PLAN.md`; they change nothing in the game)

- **Time-shift run:** `npm run test:timeshift` runs the whole suite twice, with the clock 45 and 400 days ahead (`tests/support/clock-shift.mjs`, a preload that moves `Date.now()`, `new Date()` and `Date()`; it reaches servers and workers the tests start). It finds date bombs: tests that pass today and fail on a later day, and with them block the Pages deploy. Run it before a release and after adding a test that uses dates; `node tests/support/clock-shift.mjs 400 tests/<file>` runs chosen files. The fix for a date bomb is to freeze the clock in that test (`mock.timers.enable({ apis: ['Date'], now })` as `tests/w15-review.test.ts` and `tests/main-locale.test.mjs` do, or `tests/support/midday-clock.mjs` for helper work hours); a frozen clock is not moved by the shift.
  - Result on 2026-11-21 (2,259 tests, 64 of them the browser suites that skip without a server): no test fails because of the date at +45 or +400 days, so no file needed freezing in this round. The check itself was proven on the version of `tests/w15-review.test.ts` from before its fix (WP0), which fails one more test at +400 days.
  - For round 2, not a date problem: `tests/creature-ai.test.ts` ("a minute in the home forest never stalls...") measures wall-clock time per step against a 200 ms limit and failed in both full runs on a PC busy with other work (273 ms and 204 ms); alone it passes at both shifts. It needs a load-adjusted limit like the test above it in the same file.
- **The main.ts harness:** a test that runs pieces of `src/main.ts` uses `tests/support/main-harness.mjs`. It cuts the named functions, variables or statements out of the source, finds the names they use and imports each one from the module `main.ts` itself imports it from, so a new import in `main.ts` needs no test edit. The test passes only its fakes (state, the dialog and DOM boundary, stubs); fakes win. A name of `main.ts`'s own that the test does not provide fails with a message that names it when the code reads it. Eight files use it; `tests/main-harness.test.mjs` is its self-test.
- **Architecture fitness** (`tests/architecture-fitness.test.mjs`):
  - `src/main.ts` stays at or under 356,000 bytes and `src/world.ts` at or under 272,000 (344,830 and 266,464 on 2026-11-21, counted with `\n` line ends as git stores them).
  - The server closure, the `src` modules the Node server loads, equals `docs/server-closure.txt` (96 modules; `node promo/server-closure.mjs` prints it, `--write` rewrites the file, `node promo/server-closure.mjs <name>.ts` says whether the server reaches a module and through which file). A reviewed change goes in `tests/fixtures/closure-allow.json` with its reason. No closure module may import `three` or a stylesheet, or use `document` or `window` as it loads.
  - A test that reads files under `src/` as text must be listed in `tests/fixtures/source-scan-allow.json` (79 files today, a list that should only shrink). New tests check behaviour through imports; the list is for scans of the whole source, such as naming and locale scans.

**Baseline** (dev build, frozen as above, four runs on 2026-11-21, 33 of 37 rows identical across them and all 27 frozen ones; `promo/perf-baseline.json` holds every row)

| Row (late save, High) | Main + shadow draws | Triangles | Programs in the frame |
|---|---|---|---|
| Village, 42 degrees | 146 + 76 | 205,609 | 21 |
| Village, 30 degrees | 196 + 76 | 248,174 | 21 |
| Village, 51.5 degrees | 131 + 76 | 198,591 | 21 |
| Wilds, 42 degrees | 71 + 24 | 91,507 | 15 |
| Redrock Canyon, 42 degrees | 93 + 37 | 83,317 | 17 |
| Village, phone | 84 + 70 | 160,212 | 16 |
| Village, Balanced | 146 + 76 | 205,609 | 21 |
| Village, Battery saver | 138 + 0 | 126,970 | 16 |

The two draw counts leave out `fx` and `roam` (above), and `programs` counts the programs the frame uses (about 50 are compiled in a session). Two earlier tables of this file (2026-10-11, the tool before the freeze) counted a moving scene and a slow-CPU frame rate; they are replaced because they could not be repeated. The first frozen tool (WP0) still let the game run a different number of frames while it waited for art, so its rows read one or two draws or one program apart from run to run; the numbers here are from the tool that fixes the frame.

Measured with `perf:bytes` on 2026-11-21 (b3b9f57 plus the tools): English start 778 KB gzip, Vietnamese start 908 KB, install list 4.55 MB (377 files; icons about 1.4 MB and models about 1.6 MB of it, raw). An earlier estimate of 2.7 MB did not hold up.

Measured on 2026-11-21 with the WP3 rows (four baseline runs, then the gate twice: pass, pass):

| Row | Main + shadow draws | Triangles | Programs |
|---|---|---|---|
| Village, walking (late save) | 111 + 70 | 179,925 | 19 |
| Wilds, walking | 80 + 29 | 100,621 | 15 |
| Redrock Canyon, walking | 98 + 37 | 84,031 | 16 |
| Space, 4 s after launch | 31 + 0 | 65,990 | 7 |
| King Bear mid-telegraph (mid save) | 77 + 34 | 77,442 | 13 |
| King Bear mid-telegraph, phone | 62 + 29 | 63,712 | 11 |
| Treant mid-telegraph | 94 + 20 | 154,944 | 15 |
| Treant mid-telegraph, phone | 82 + 19 | 130,712 | 15 |

| Live row | Peak draws + shadow | Peak triangles | Programs created | Layouts / style recalcs / nodes |
|---|---|---|---|---|
| King Bear, 4 s | 107 + 34 | 89,498 | 0 | 114 / 311 / 1,007 |
| Treant, 4 s | 113 + 20 | 163,200 | 0 | 118 / 334 / 1,007 |
| Scripted swamp fight, 8 s | 136 + 38 | 128,073 | 1 | 229 / 737 / 1,035 |
| Idle village, 4 s | - | - | - | 33 / 296 / 1,080 |
| Colossus, 4 s (report only) | 144 + 57 | 92,714 | 0 | 83 / 323 / 1,009 |

Before-play download, service worker blocked (`perf:download`, 2026-11-21, three runs; the gate passed twice for the English cases):

| Case | Up to Start | Start to 10 s after the first frame | Owner's limit |
|---|---|---|---|
| New save, English | 2.47 MB (33 files: code 0.84 MB, models 1.58 MB, fonts 0.05 MB) | 0.21 MB (the cottage model and the Almanac chunk) | 1.6 MB: **over** |
| Late save, English | 2.92 MB (37 files: models 2.02 MB) | 0.22 MB | 1.8 MB: **over** |
| New and late save, Vietnamese | not measurable: the page never shows Start | - | - |

Two findings for the owner, both older than this tool. (1) With the title screen left to finish loading, a first visit fetches 2.47 MB before Start, not 1.6 MB: the title loads the first-view models (creatures 409 KB, farm 313 KB, fruit crops 164 KB, fish 144 KB, crops 117 KB). (2) In the built game a visitor whose language is Vietnamese gets a blank page (also on the live site on 2026-11-21): `src/i18n.ts` waits for the vi pack at the top of the module, the built vi pack imports the `rules` chunk that holds `i18n.ts`, and the two wait for each other. The dev server is not affected. The fix is under way on its own branch (`aaa/vifix`). Until it is merged the two Vietnamese cases are left out of the download baseline and fail `perf:download`; run `ONLY=en` for the English ones, and take the Vietnamese baseline with `ONLY=vi node promo/first-visit-bytes.mjs --baseline` afterwards.

The live site on 2026-10-10: about 2.3 MB downloaded before play, a steady 60 frames a second standing in the village, no slow frames.

**The gate**

1. `perf:gate` passes: draws, shadow draws, triangles and programs on all 24 rows stay at or under the baseline (plus any ledger entry for that row).
2. The download before play does not grow (`perf:bytes`). New art and sound load only when needed.
3. Anything that costs graphics time on every frame (glow, depth blur) is an optional extra: off by default, never on phones, and switched off by the existing automatic fallback when frames slow down. The existing Sharp, Balanced and Battery saver settings keep their meaning.
4. Prefer work done once, when the art is made, over work done every frame. Shading baked into the models costs nothing while playing.
5. The type check and the full test suite pass.

## 3. Where the game stands

Judged from about twenty screenshots of the running game, the rendering and sound code, and a saved picture of the other game.

**Still shared with the other game** (this is what makes the two look alike)

- The village: a round, ring-fenced hub with a red-roofed well, a crystal fountain, a striped market stall, a rocket pad and garden beds.
- The screen layout: a top row of round icons, a round minimap cut into four coloured sectors, a cluster of four skill buttons, quest cards on the left.
- The content skeleton: the four starting skills, the eight planet themes, the King Bear boss, much of the item list, and the camera angle.

**Already ours**

The cottage interior and its family, the Ember Well (wake, soothe or let the Colossus sleep), the Lake Guardian, AI neighbours and rescued helpers, Rescue Call, and (on `develop`, not yet released) Roar hours and Dyes.

**Where the quality falls short**

- The ground is flat colour with soft blends, so the wilds and the planet landing areas look empty. The Night Planet is almost black.
- Lighting is flat: no colour grading, no soft shading where objects meet the ground.
- Characters are rigid parts moved by code. They work, but they are stiff.
- Crops are flat 2D cards with thick outlines beside 3D models, so two art styles share the screen.
- Sound is one music track plus generated tones.
- The camera always looks steeply down, so there is never a horizon.

The planets were photographed only at their landing pads, loaded through a developer shortcut. Their outer areas may be fuller.

## 4. The stages

| # | Stage | Makes us | Speed risk | Size |
|---|---|---|---|---|
| 0 | Speed gate | safe | none | done with this plan |
| 1 | Free lighting upgrade | better | very low | medium |
| 2 | Our own village and screen layout | different | low | medium to large |
| 3 | Sound | better | none for frame rate | medium |
| 4 | Fuller world, one art style | better | high, needs care | large |
| 5 | Livelier characters | better | medium | large |
| 6 | Our own story and content | different | none | large, in parts |
| 7 | Camera angle (optional) | both | high | see section 5 |

### Stage 0. Speed gate

`promo/perf-budget.mjs` and the baseline table above. Every later stage starts by running it and ends by running it.

### Stage 1. Free lighting upgrade

Everything here costs nothing, or next to nothing, per frame.

- A colour curve and a light setup per planet: warm, vivid and saturated, never washed out. Sky, fog and light colours give each planet its own mood.
- Soft shading baked into the models when they are made (darker where parts meet, under roofs, at the feet of trees).
- A sky and horizon gradient in place of one flat background colour.
- Richer ground from the colours it already carries: worn paths, darker grass under trees, lighter clearings. Same triangles.
- A Night Planet you can read: more base light, glowing plants and crystals.

Optional and off by default: a "Fancy effects" switch for strong PCs (glow, a slight toy-diorama depth blur), under gate rule 3.

Done when: before-and-after pictures of the village, the wilds and three planets are clearly better, and the gate passes.

**Built on the `dev-light` branch (2026-10-11), not yet merged.** The code is `src/look.ts`; `perfFlags.richLook` switches it off for a before and after.

- Colour curve: a few multiply-adds inside the shaders that already draw (three's custom tone-mapping slot), no extra pass. More contrast and saturation, and a soft roll-off so sunlit surfaces no longer clip to pastel. The interface's own small pictures (item icons, the mirror) do not use it and did not change.
- A light setup per planet: sun colour and direction, sky light, fog and sky colours for all nine.
- Sky gradient: drawn only while sky can be on screen. With today's steep camera that is almost never, so it costs nothing in normal play. It is ready for a lower camera (stage 7).
- Ground: deeper colours, broad light and dark drifts, shade under trees and rocks, lusher banks round ponds, worn earth along trails and in the village, glow beside lava and night flowers. Same triangles.
- Night Planet: the dark overlay went from 93% to 61% opaque, fog starts further away, small plants glow, and a pool of light follows the explorer. The pool is as wide as the explorer can see, so the Light buff visibly more than doubles it. Creatures outside the light stay hidden, as before.
- Soft shading on models: a cheap version is baked once when scenery and buildings load (darker near the ground and under overhangs, lighter at the top). True ray-traced shading baked in Blender was skipped: it would add a colour channel to every model file and so grow the download.
- Speed: draw calls and triangles are unchanged (the scenery is the same 665,198 triangles in the same batches with the look off and on). The Night Planet draws one more small mesh.
- Not done: the optional "Fancy effects" switch.

### Stage 2. Our own village and screen layout

- A new hub shape of our own in place of the fenced circle, for example a terraced village built around the Ember Well, with redesigned silhouettes for the well, fountain, stall and launch pad.
- A new screen layout: a different minimap shape, our own arrangement of the icon row and the skill buttons, our own icons.
- New names and looks for the four starting skills.

Speed: the hub must stay inside the village baseline. The screen layout is ordinary page elements and does not affect frame rate.

Risks: many tests pin positions in the village, and players' saves store where they placed decorations and garden beds. Moving the village needs a save migration and must not lose anything a player placed.

### Stage 3. Sound

- Music for each region, background ambience (wind, water, birds, night insects), real sound effects for hits, harvests, menus and footsteps.
- Sound loads only when it is needed and streams, so the download before play does not grow.

Honest limit: generated music and effects will be a clear step up, but truly high-quality music needs a composer or a licensed library.

### Stage 4. Fuller world, one art style

- Denser wilds and planets: landmarks, clusters of plants and rocks, shorelines, height.
- One art style for crops: 3D crops, or cards redrawn to match the models.

Speed: this is the stage most able to slow the game down. More things on screen must come from the methods the game already uses (many copies drawn as one batch, still scenery merged and frozen, less detail far away), never from many separate objects. Each scene gets a budget equal to its baseline.

### Stage 5. Livelier characters

- Keep rigid parts for crowds (creatures, neighbours, other players): they are cheap and can be drawn in batches.
- Make them feel alive with motion alone: squash and stretch, anticipation before a hit, follow-through, changing face expressions. No extra cost.
- A skeleton only for the hero and the bosses, and only if the gate still passes. Skeletons for crowds are ruled out.

### Stage 6. Our own story and content

- A story spine: the world rests on sleeping ember springs, each planet has a spring and a guardian, and the player's choices (wake, soothe, let sleep) change that planet.
- Day and night, seasons and weather that change what grows, what bites and which creatures appear. Mostly light and colour changes, so no speed cost.
- Neighbours and helpers as characters with likes, small quests and memory.
- New names and designs for planets, bosses and items that still follow the other game.

## 5. The camera angle

The question was whether lowering the camera would hurt the frame rate. It would. A lower camera sees much further, so the game has to draw much more.

Measured on 2026-10-11 by tilting the camera at the same distance (one run, same tool; draw calls / triangles):

| Camera pitch | Village | Wilds | Redrock Canyon | Slow-CPU frame rate, village |
|---|---|---|---|---|
| 51.5° (today) | 269 / 219,000 | 98 / 84,000 | 128 / 70,000 | 59 |
| 48° | 264 / 213,000 | 103 / 88,000 | 132 / 81,000 | 59 |
| 45° | 292 / 232,000 | 107 / 94,000 | 151 / 86,000 | 56 |
| 42° | 291 / 232,000 | 115 / 114,000 | 177 / 91,000 | 59 |
| 40° | 314 / 253,000 | 118 / 125,000 | 154 / 99,000 | 56 |
| 30° | 378 / 349,000 | 144 / 177,000 | 180 / 144,000 | 45 |

- A tilt to 48° is inside the measuring noise. 45° costs roughly 10 to 20 percent more work. 30° costs 1.4 to 2 times.
- The lower view does look better and more like its own game: building fronts and faces become visible.
- An earlier version of this table showed the canyon tripling. That was wrong: a boss had knocked the hero out during the measurement, and those rows measured the village. The tool now guards against it.

**Decision for now:** the camera stays where it is through stages 1 to 3. A lower camera is tried only after stage 4 has set up less detail in the distance, and it ships only if the gate passes. A mild tilt to about 48 degrees can be tried early, since it is nearly free. Further options: about 45 degrees with a shorter view distance, and a lower camera only in calm moments (walking up to the cottage, cut-scenes, a photo mode), never in fights.

## 6. Order, and what is not in this plan

Order: 0, 1, 2, 3, then 4, 5 and 6 in parts, with 7 as an experiment after 4.

Not in this plan: a Steam release, real-money purchases, the player market, and the three-lane battle mode.

**Decisions for the owner**

1. Tone: a cozy game about living in a place (recommended), or an action game with a story on the side.
2. The village: is a save migration acceptable so that the hub can change shape?
3. Sound: generated, licensed, or a composer.
4. The camera: keep it, or accept the extra work to afford a mild tilt.
