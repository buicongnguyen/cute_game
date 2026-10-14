# Zoo Garden: plan to fix what the October 2026 check found

Written 2026-10-15 from two checks of the live game (develop `8e821b2`): a speed check on PC and on a simulated mid-range phone, and a player-appeal check that played the first minutes as a new player and the late game with a level-40 save. Neither was a real person on a real phone; the phone numbers come from a PC browser slowed down 4 times. Screens, traces and logs are in the session's `scratchpad\audit\` and `scratchpad\appeal\`.

Every item keeps the speed rule of `docs/QUALITY-PLAN.md` section 2: measured before and after, and it must not get slower.

Status key: **todo**, **doing**, **done**, **owner** (waits for an owner decision).

## Phase 1. Phone speed (small, no decisions needed)

| # | Item | What was found | Fix | Files | Status |
|---|---|---|---|---|---|
| 1.1 | Freeze when shadows switch off in a fight | When frames drop, the graphics governor turns shadows off; that changes every material's shader, so all of them rebuild at once. On the simulated phone a fight froze for up to 0.8 s and dropped to about 3 fps; shader programs jumped from 50 to 74. | Start phones on Auto with shadows already off (the reduced profile), so there is nothing to rebuild; for any later switch, prepare the no-shadow shaders ahead (`compileAsync`) or keep the shadow map on and stop the casters instead. | `src/graphics.ts`, `src/world.ts` (`applyGraphics`) | todo |
| 1.2 | Screen layout re-measured on every change | Two layout watchers re-measure every HUD button whenever anything on screen changes (the HUD rewrites every 120 ms): about 9% of the phone's processing time in a fight, with forced layouts. | Run each at most once per frame (`requestAnimationFrame`), only when sizes can change; stop watching the whole page. | `src/hud-layout.ts`, `src/mobile-game-support.mjs` (line ~222) | todo |
| 1.3 | Battery-saver freezes in the village | With Battery saver on, the village ran at 21.7 fps with long tasks up to 0.37 s, while Balanced did not. Cause unknown. | Record a performance trace, find the cause, fix it. | to find | todo |
| 1.4 | Governor waits 3 slow seconds | A phone spends at least 3 s of a fight under 36 fps before any relief. | After 1.1, let the first step down come sooner on phones (about 1 s). | `src/graphics.ts` | todo |
| 1.5 | Swimming scene costs more | About 50 more draw calls than the village, and phone memory grows by about 35 MB. | Look at the water pass and the pond views; reuse, batch or skip what is off screen. | `src/world.ts` (`waterPass`), fishing view, `src/swim.ts` | todo |
| 1.6 | Raycasting every frame | A small cost every frame. | Raycast only when the pointer moves, or every few frames. | `src/world.ts` | todo |

## Phase 2. Download size (medium)

| # | Item | What was found | Fix | Files | Status |
|---|---|---|---|---|---|
| 2.1 | Models are not compressed | About 3.4 MB before play on PC and 2.9 MB on phone; no model uses mesh compression. | Compress and quantize every GLB (meshopt) when the art is built, decode with `MeshoptDecoder`. Expected 50 to 70% smaller. | Blender export / build step, `src/assets.ts` | todo |
| 2.2 | Models load before they are needed | Fish, house, disguise, gear and pet models load at the title screen or right after Start. | Load fish near a pond or the shop, the house on entering, disguises and pets when first shown. | `src/assets.ts`, callers | todo |
| 2.3 | Code preloaded too early | The page preloads the Capture the Flag, Vault, help and skill-info code at start. | Load each only when its mode or panel opens. | `vite.config.ts`, `index.html` | todo |
| 2.4 | Misnamed shared code chunk | The world, the model loader and the farm land in a file named `colossus-sleep`. | Name the chunks honestly (`world`, `loader`) so caching and checks are clear. No size change. | `vite.config.ts` | todo |

## Phase 3. Bugs (small)

| # | Bug | Fix | Status |
|---|---|---|---|
| 3.1 | Pressing F at a pond opens the garden seed menu instead of fishing (the nearer garden wins). | Prefer the pond when the explorer faces or stands at it. | done (dev-bugs: interact-pick.ts) |
| 3.2 | The "power ready" label overlaps damage numbers ("28 WEP READ 31!"). | Give the label its own lane above the hero, apart from the damage numbers. | done (dev-bugs: POWER_LANE_LIFT) |
| 3.3 | A friend-request pop-up lands mid-fight over the joystick. | Hold social pop-ups until the fight ends; send them to News. | done (dev-bugs: social-hold.ts + News note) |
| 3.4 | The shop lets you buy the same sword many times without a warning. | Warn or block a second copy of gear you already own (stackables still buy freely). | done (dev-bugs: "Owned" + confirm; pets free up to 2) |
| 3.5 | Closing the welcome gift with × leaves 0 energy and the gift pending, with no sign of it. | × takes the gift (or says where it waits). | done (dev-bugs: × and Escape take it) |
| 3.6 | In packs, more than 13 health bars cover each other (the Vault). | Show bars only for the target and creatures already hurt. | done (dev-bugs: target, hurt, elites; max 8) |
| 3.7 | The level-40 test save (`promo/save.json`) is still on Chapter 1 step 1 with 1 of 9 planets. | Make a real mid/late-game test save. | done (dev-bugs: promo/save-late.json; save.json kept for tests and baselines) |
| 3.8 | The speed tool's canyon row is invalid: creatures push the hero off the spot. | Keep the hero pinned while measuring. | done (dev-bugs: __zoo.pinHero) |

## Phase 4. First minutes (needs owner decisions)

| # | Item | What was found | Proposal | Status |
|---|---|---|---|---|
| 4.1 | 1,000,000-energy welcome gift | Quest rewards of 36 to 76 energy and most prices mean nothing; energy-only items are bought at once. | A small starter pack instead: about 500 energy plus a free hat or pet. Keep a separate tester gift if it is needed for testing. | done: owner chose 10,000 energy (dev-bugs); tester gift unchanged |
| 4.2 | Slow first reward | The first crop takes 150 s, so the first reward comes at about 2 min 45 s; then the hero stood idle in an empty forest for about 2.5 min. | A "tutorial radish" that grows in about 20 s, and an easy creature beside the garden for the first fight. Aim: first fun under 60 s. | owner |
| 4.3 | Too much on screen at level 1 | Four skills, Attack and Jump show before any enemy; a quick-eat slot shows 0. | Reveal skills as they unlock and quick-eat once there is food. | owner |
| 4.4 | Too many red badges, two "news" places | A new save shows More 8 from the first second; after 6 minutes Journal 6, News 4, More 8. The News inbox and "Ranking and news" are separate. | Badges only for things you can collect; no unread count on a new save; merge or rename the two news places. | owner |
| 4.5 | Long lists at first | The seed picker shows about 24 rows, mostly locked; the shop opens on 10 weapons; Chapter 1 lists 9 steps. | Show what is unlocked first and fold the locked rows into one "more at level N" line. | owner |

## Phase 5. Reasons to keep playing (medium)

| # | Item | Proposal | Status |
|---|---|---|---|
| 5.1 | Sound | Real sounds for hit, critical hit, harvest, coins, level-up and a catch; music per region later. No frame-rate cost. (QUALITY-PLAN stage 3.) | todo |
| 5.2 | Daily welcome-back | One cheerful card on the first visit of the day: check-in streak, today's Colossus, rescue calls and Vault runs. | todo |
| 5.3 | Quest walk vs auto-fight | While the explorer walks a quest route, auto-fight does not pull them away; show an arrow or line to the target. | todo |
| 5.4 | Rewards that grow with level | Achievements, dailies and quests pay in line with the player's level; claimable Collect buttons are gold, the rest dimmed. | todo |
| 5.5 | Long-term goals on screen | Planets discovered x/9, collection %, "next unlock in N levels". | todo |
| 5.6 | Story | More than a checklist: a few scenes per chapter with the village characters. (QUALITY-PLAN stage 6.) | todo |
| 5.7 | Collection book | Silhouettes of fish, creatures and items still to find, one tap from the main screen. | todo |

## Phase 6. Look and feel

| # | Item | Proposal | Status |
|---|---|---|---|
| 6.1 | Phone portrait camera | The camera is close and enemies arrive off screen; zoom out a little in portrait. | todo |
| 6.2 | PC HUD text is tiny | The health and EXP numbers are about 8 px at 1600x900; make them larger. | todo |
| 6.3 | Keyboard guide always on | Fold it after the first few minutes; keep it one key away. | todo |
| 6.4 | Dark forest and swamp | Lift the light in the forest and swamp so they read warm, not muddy. | todo |
| 6.5 | Rescue Call in landscape | The build panel covers about 40% of the screen and the map edge shows bare ground. | todo |
| 6.6 | Vault rooms | The floor is dark and empty; dress the rooms and fix the health-bar crowd (3.6). | todo |
| 6.7 | Two art styles | Crops are flat cards beside 3D models. (QUALITY-PLAN stage 4.) | todo |

## Earlier open decisions (from the October 14 to 15 work)

| Topic | Question |
|---|---|
| Colossus for beginners | Sleep until level 30 solo, leave low levels alone online, choice at the Ember Well? Level 20, 30 or 40? |
| Five-button fight | Fire the power strike while Attack is already held when it charges, or require a fresh press? +10% for the specials? Keep the "Attack chain" bench row? |
| Elites | Shots through the crab's shield 15% or 30%? Spread the splitter's small jellies so one sword sweep does not take both? Which role next? |
| Weapon pair | Shadow Lord at +6%: accept? Keep the 3 s hold after a manual swap? Swap button on PC? Show swaps to other players? |
| Sword wind | "Premium" = rare weapons and dyed skins? +0.4 m reach for a basic sword at +15? |
| Swimming | 18 s stamina, 70% / 55% speed? Shots crossing ponds for everyone? |
| Breakable scenery | Ice first? Hit counts? 6 wood a day? A stone material? Let partial damage heal? Attack with nothing nearby hits scenery? |
| Bag | E and the in-place card in the shop too? E takes off a worn item? |
| Journal | The Explore / Grow / Collect grouping? |

## Order

1. Phase 1 and Phase 3: small, safe, no decisions needed.
2. Phase 4 once the owner decides 4.1 to 4.5.
3. Phase 2 (download size), then Phase 5 and Phase 6 in parts.

Each item ships through `develop`: type check, the full test suite, the speed gate, pictures on phone and PC, then `main`.
