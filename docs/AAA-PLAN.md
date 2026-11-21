# Zoo Garden: AAA plan

**Plan v2 (final for round 1)** · 2026-11-19 · written on `develop` at commit b3b9f57 (the same as `origin/main`).
Status: plan only. Nothing in the game has changed. This file replaces plan v1.

**Where it comes from.** Plan v1 took the judges' winning plan (A) and the best parts of B and C. Five critics then checked v1:
speed, feasibility, owner intent, player impact and completeness. They raised 120 issues (27 high). Plan v2 applies every high issue
(two with a changed fix, explained in section 12) and nearly all medium and low ones (two rejected in part, with reasons). A second consistency check then fixed 10 more problems, each checked against the code. Section 12 lists every change.

**The five biggest changes from v1**
1. The speed gate becomes exact. It freezes the clock, the random numbers and the creatures (like the existing `promo/draw-call-review.mjs`), so "0 new draw calls" can be checked to the last draw. It also counts shader programs, memory, the Vietnamese start-up download, the before-play download (models and audio included, measured with the service worker blocked so it repeats) and the service worker's install list as its own row.
2. Round 1 measures the player's journey before and after. A journey tool plays the first 15 minutes and a mid-game boss fight, and a "before" show reel is recorded on day one, so the owner gets real before/after proof.
3. New systems and their Vietnamese text load after Start in one small chunk. v1's plan would have grown the first download by about 10-15 KB, plus 12-18 KB for Vietnamese players. v2 has a bytes ledger and a payback package.
4. A chunky toy effects package (the owner's 2026-10-28 request "add some VFX but don't make the game slow down"), a talk bar that never covers the fight buttons, one "beat conductor" so celebrations never pile up, and story scenes that check who is home before they play.
5. Six v1 items leave round 1 to make room and lower risk: the village static batch, the time of day, the camera pass, the boss models kit, the robot and croc signature moves, and the planet renames. Each has a reason and a place in round 2 or 3.

**Words used in this plan** (see also the table in `AAA-EVALUATION.md`)

| Word | Meaning |
|---|---|
| WP | Work package: one job for one builder agent, 1-3 hours, then an independent review. |
| Heavy | A package that needs a browser, Blender or the full test suite to verify. At most 3 heavy jobs run at once, counting the integrator's merge checks. |
| Hot file | A big shared file many packages edit, so merges can clash: `src/main.ts` (344,830 bytes), `src/world.ts` (266,464), `src/content.ts`, `src/combat.ts`, `src/actions.ts`, the Vietnamese files in `src/locales/` (above all `vi-catalog.ts` and `vi-pack.ts`), and the server files. |
| Speed gate | `promo/perf-budget.mjs` after WP0: draw calls (main and shadow counted apart), triangles and shader programs at fixed places, compared with a saved baseline. |
| Frozen frame | A frame drawn with the clock, random numbers and creatures stopped, so two runs give the same counts. |
| Pre-Start bytes | The gzip size of everything the browser loads before the Start button (about 792 KB today). |
| First-visit download | Two rows. The **before-play download** (`perf:download`, WP3): what a new visitor's browser fetches with the service worker blocked, up to the Start button and from Start to 10 s after the first played frame (code, models, audio, images, fonts); the owner's limit is 1.6 MB (new save) and 1.8 MB (late save). The **install list** (`perf:bytes`, WP0): the files the service worker fetches in the background on a first visit (about 2.7 MB today: every hashed script and stylesheet, plus icons, sounds and mode models), with its own limit. |
| Lazy / feature | Loaded only after Start. New systems live in `src/features/` and `src/story/` and mount from `src/features.ts`. |
| Ledger | `promo/perf-ledger.json` (draws, programs) and the bytes ledger in the merge log: the only way a package may spend anything, by a named entry in this plan. |
| Server closure | The 96 `src` modules the server imports (`promo/server-closure.mjs` lists them). Changes there must keep rule results the same unless the package says "online change". |
| Bark | A one-line talk bubble with a face, no buttons, at most 2.5 s; allowed during fights. |
| Beat conductor | One queue that spaces ribbons, cards, scenes and stingers, so moments never pile up. |
| Default | A decision taken with the evaluation's recommendation. It does not reverse an owner decision and is easy to undo. |

---

## 1. What AAA means for Zoo Garden

**Vision.** Zoo Garden is a cozy home-and-adventure game in a chunky, glossy toy style: warm vivid colour by day,
very dark blue nights with bright lanterns, never washed-out pastel. The player cares for a garden village and makes trips
through the gates and across the stars that feel like real action. Every blow freezes for a moment, shakes the screen the
way it was struck, throws chunky coloured sparks and makes a sound. Every creature has a voice. Music follows the player from
the village to the wilds to the boss arena. A small cast (Pepper the cook, Sprout the gardener, the farmer, the neighbours)
gives each goal a reason and comes home when rescued. Bosses are events with a name card, a signature move, a weakness the
player's moves can open and a medal for playing well. The names, the light and the words are our own. And it runs as light as
today: the same draw calls, the same download before play, and nothing per frame on a phone that a phone cannot afford.

**Six pillars and how they are measured after round 1**

| Pillar | Why | Measure after round 1 |
|---|---|---|
| Every press answers | The fight is the strongest system, but missing freezes, dropped presses and an automatic first fight hide it. | At least 90% of own hits freeze 30-110 ms in a scripted 8 s fight. A press up to 0.15 s early is never lost. The tutorial fight needs at least 3 Attack presses (was 0) and never takes the hero below 60% health. Attack opens 0 dialogs while a creature is near (was 6 on phone, about 75 on PC). |
| The world is never silent | Measured silence when idle, no music outdoors, cues 20-30 dB too quiet. Synthesized sound costs 0 bytes and 0 draw calls. | Idle ambience peak at least -45 dBFS in every outdoor zone (was 0.000 in the swamp). Music audible within 3 s of Start. Gameplay cues at least -24 dBFS. 0 bytes added before play. Touch devices run at most 6 live synthesized voices. |
| Every step has a reason and a face | Story scores 2 of 10: 29 wordless steps. | Chapters 1-2: 15 of 15 steps have a scene or a one-line reason; all 29 story steps have a reason line; both home rescues have a rescue and a homecoming scene. A named character speaks within 60 s of Play. 0 "Collect your reward" taps. No scene opens during a fight, and the talk bar never covers a control. |
| Moments worth remembering | Level-ups only flash a bar, bosses just appear, a catch is a floating label. | New save, first 15 minutes (journey tool): at least 5 celebrated beats (premise and Pepper's arrival scene with the energy count-up, a level ribbon, First win!, the first catch card, the Chapter 1 finale). Mid-game save: boss intro, BREAK, medal and the farmer's rescue scene. Each beat 1.6 s or less (the 8 s dinner never blocks input); no two stingers start within 0.6 s. |
| Vivid toy look, all our own | The game uses the reference's grey toon ramp, ink and planet colours, thin white effects and some reference names. | Our own ramp and ink; shaded pixels bluer with no loss of saturation. Candy frame mean lightness 0.62 or less (was 0.74). Space sky hue 210-240 with under 2% magenta pixels. Chunky effects with a colour per skill. 0 reference skill or boss names in player text (planets follow in round 3). HUD text at least 11 px, touch targets at least 44 px on 3 viewports. |
| Never slower | The owner's hard rule. Frame rates are useless on this busy PC, so counts and bytes are the gate. | After every merge the frozen gate is exact on every standing row (main draws, shadow draws, triangles, programs); live fight rows stay within +5%. The only exception is the ledger entry named in this plan (space: +1 program). At the end of the round, English and Vietnamese pre-Start bytes and the before-play download up to Start are at or below the baseline; after Start the download grows only by the lazy features chunks, within their named allowances; the install list stays within its own limit. No new render pass. |

**What a player feels after round 1**

*The first 15 minutes (new save, phone or PC)*
- 0:00 The title shows our own wordmark and a tagline that states the premise, over the live village. The name field holds an original suggested name with a dice button (no more "Clover"). The title is quiet: sound starts after Start.
- 0:05 Play. The welcome card shows the two-line premise and a postcard from Pepper, the village cook, who is on her way. When it closes, the camera glides so all 9 beds are on screen and stays there until the player moves, and a line from Pepper's postcard appears in the talk bar above the controls. Birds, wind and footsteps on grass; the live score fades in.
- 0:30 Plant the 20 s tutorial crop. 0:50 first harvest: Pepper arrives in the village (the first harvest already brings her today), her scene plays and her 10,000 energy counts up. The story reward collects itself and flies from the tracker into the energy plate and EXP bar; the next goal shows at once.
- 1:30-3:00 Sell, buy and equip, each with a reason from Pepper. Level-ups merge into one ribbon on the top edge ("Level 4!") with a gold light pillar, a cheer pose and their own fanfare.
- 3:00-4:30 The raid: three Gloomcap nibblers stand away from the buildings. Attack always swings in a fight. One nibbler winds up a ring to step out of. Each hit freezes for 35-80 ms, throws chunky coloured sparks and kicks the screen the way the blow went. "First win!"
- 5:00-10:00 Crystal upgrade, a catch card at the pond for the first fish while the hero holds it up, skills practice, then dinner at level 5 with Pepper, the neighbours and the pets: "Chapter 1 complete". The hook: Sprout went to water the old treant's roots and has not come back.
- 10:00-15:00 Chapter 2. Walking east, a red "Lv 7+ Dangerous" chip and a red border band warn before anything attacks. Creatures squeak, grunt and wind up audibly; drums join when something gives chase.

*A boss fight (mid-game save, King Bear)*: walking up, an intro card names it "Old Honeypaw" with an original title before it attacks; boss drums; three honey-slam marks chase the hero with a rising sound 0.4-0.8 s before impact; the farmer calls the weakness from the cage ("Dash through his charge!"); a 3 s stun; a new phase at 60% health; BREAK with a 0.11 s freeze and one big word; a medal; the cage opens with a rescue scene, and the farmer's homecoming gets its own scene.

*Coming back tomorrow*: the welcome-back card shows Pepper's face when she is home (a postcard from her otherwise) and the streak ("3 days in a row"). Existing players get a one-time "What's new" card, and the Journal's "Story so far" lets them watch every scene they have passed. (The day and night cycle and requests from friends come in round 2.)

---

## 2. The owner's ideas: verdicts

The full table with sources, values and effort is in `AAA-EVALUATION.md` section 3. Here is the verdict on each idea and where it goes.

**The critique in short** (the owner asked: "evaluate my thought, suggest improvement, then execute"):
1. "Become our own game" (O1) is right and comes first. New names alone are cheap paint, so round 1 ships them with our own light, colours, effects and story. The hub, the game name and the planet themes wait for the owner's yes.
2. The story spine is already in the owner's ideas: rescue a friend at a boss, they walk home, take a job and make the cottage warmer (O21). The plan builds on that and does not invent a new premise.
3. Keep the owner's 2D crop cards (asked for speed), but bake them at the player's camera angle with our own ink. No 3D crops.
4. Enemies should be "chunky toy", not "more real". Real-looking creatures would clash with the toy style and cost triangles.
5. Colour, baked shading and pooled effect shapes first (they cost nothing per frame); a "Fancy effects" switch (PC only, never phones) later for anything per frame.
6. The hub is the clearest copy of the reference, but moving it means moving saved beds and decorations. Round 1 only draws two designs for the owner's yes.
7. Two of the owner's rules shape every new screen: no mid-screen pop-ups for gains (O59), and fight buttons always shown (O37). v2 adds a test that no new overlay ever covers them.
8. The owner's decisions stay untouched: beds 2x per level to 5, bag 100 / chest 120, the 10,000 welcome gift, the Colossus lid per device, the pitch slider 30-51.5 (default 42), rod snap 60/30/10%, two pet slots with the dog, the tester code (solo, hash only), heal 4x at home, harpoon numbers, BOSS_BLOCK_ON=false, Attack doubling as the use button.

| # | Idea (short) | Verdict | Where | Why, in one line |
|---|---|---|---|---|
| O1 | Become our own game | Improve | WP25, WP6, WP18, WP19, WP5; hub, planets and name in round 3 | Names, light, colours and effects together; the hub and game name after the owner's yes. |
| O2 | Our own village hub | Keep, needs yes | WP5 designs; build in rounds 2-3 | The most visible copy, but it needs a save migration the owner approves. |
| O3 | Own names for the 4 starting skills | Keep | WP25 | Cheap with ids unchanged; the Q skill's name must fit the thrown petal Lob. |
| O4 | Our own screen layout | Improve | WP16 | The layout is ours; the text is too small (8.5-10 px). |
| O5 | Lighting pass, VFX, a Fancy effects switch | Improve | WP6, WP18, WP19 (effects); switch in round 2 | Baked colour and pooled effect shapes first (0 frame cost); the switch is PC only and off by default. |
| O6 | One style for crops | Improve | WP6; re-bake on slider change and planters in round 2 | 2D cards stay for speed, baked at the 42° camera with our own ink. |
| O7 | Livelier characters | Improve | WP10 (motion); face and springs round 2; skeleton round 4 if needed | Motion-only life first. |
| O8 | Warm forest and swamp | Keep | WP18 | Colour only, free per frame. |
| O9 | Dress the Vault rooms | Keep | Round 2 | Needs merged room kits with a clear centre. |
| O10 | Rescue Call in landscape | Keep | Round 2 | Small, with the arena dressing. |
| O11 | Phone camera a little further back | Keep | Round 2 camera pass, after the village batch | It needs the batch's savings to stay inside the phone rows. |
| O12 | Enemies in Blender | Improve | Round 2 (boss kit 1 first, then planet kits) | Chunky toys with their own silhouettes, loaded on landing; budget 3,000 triangles per boss. |
| O13 | Rebuild art in Blender | Keep (done) | Rule | The base of every art package. |
| O14 | Everyday disguises from the boat edition | Owner decides | WP5; round 3 if yes | Depends on which repo leads character art. |
| O15 | Boat faces on hero models | Owner decides | WP5 | Shipped (+4.4-5 KB per model); record or trim. |
| O16 | Animated river water | Drop (the owner rejected it) | Parked | Any new water motion must pass a flicker test first (round 2, PC switch). |
| O17 | Speed gate before and after every stage | Improve now | WP0, WP3 | The tool measures the wrong camera and graphics level today. |
| O18 | Use 2D where it keeps speed | Keep (rule) | WP6 | Crops stay cards. |
| O19 | Pitch slider 30-51.5, default 42 | Keep | Untouched; distance LOD round 2 | The owner's decision. |
| O20 | Our own story, ember springs | Keep | WP14, WP20, WP21; chapters 3-4 in round 2 | The heart of "a more interesting game". |
| O21 | Rescue a friend who comes home and works | Keep and extend | WP21, WP23 | Rescue and homecoming scenes make it the story spine. |
| O22 | Characters with likes and memory | Improve | Round 2 (friendship hearts, requests only from friends at home, a memory line) | Round 1 gives the cast faces and voices first. |
| O23 | An easier start | Keep | Re-measured in WP17 and WP20 | The new story must not slow the first reward (under 40 s). |
| O24 | Flag badge and arrival flags | Keep (done) | Rule | Built as the owner wanted. |
| O25 | "The role is not clear" | Improve | WP14, WP20 | A two-line premise and Pepper speaking within 60 s. |
| O26 | Day, night, seasons, weather | Narrow | Round 2 (colour-only time of day with night glows); seasons and weather round 3 | Night needs window and lamp glows, paid by the round-2 village batch. |
| O27 | Collection book | Improve | Round 2 | One book for fish, creatures, crops, pets and hats. |
| O28 | Coming soon list and News | Improve | WP24 (Greenhouse status), WP26 (round News entry); features round 3 | The board must tell the truth. |
| O29 | Cottage next steps | Partly | WP11 (room tone); fireplace, lamp, sleep and decorations round 2 | Drop the fridge stash (busywork). |
| O30 | Make our hits feel like the best | Improve | WP9, WP19, WP23 | Freeze, shake, buffer, chunky sparks, then boss weaknesses. |
| O31 | Five-button fight; teach combos | Keep | WP17 (finisher tip); training dummy round 2 | Built; it needs teaching. |
| O32 | Boss re-tune and a weakness per boss | Keep | WP23 (King Bear, treant); round 2 the other 15 | The owner's order: moves first (done), bosses next. |
| O33 | Online timings on the server | Owner decides | WP5; round 4 | Solo-first or host a server. |
| O34 | Bosses block low hits | Keep off (the owner rejected it) | Help text fixed in WP16 | BOSS_BLOCK_ON stays false; no weakness needs air play. |
| O35 | Smaller bosses that visibly break | Keep (done) | WP22 builds on it | BREAK becomes a moment. |
| O36 | Elite roles per planet | Improve | Round 2 | One role per planet, each asking for a different special. |
| O37 | Buttons always shown; Attack is also "use" | Keep (the owner's rule) | WP17, WP14 | Attack swings only when a fight is on; no overlay covers the buttons. |
| O38 | Move the skill buttons | Keep (done) | Rule | |
| O39 | Harpoon numbers, rod snap 60/30/10% | Keep (the owner's rule) | Rule | |
| O40 | Many side systems built | Keep, frozen | Rule | No new systems until story and bosses land. |
| O41 | Rescue Call phase 2-3 | Keep | Round 2 | |
| O42 | Online co-op Rescue and Flag Rush | Drop for now | Parked | No server is hosted. |
| O43 | Colossus lid level 15 or 30 | Owner decides the level | WP24 changes rewards only; WP5 asks | The lid stays at 20, per device. |
| O44 | 10,000 gift, bag 100 / chest 120, lid per device, pets | Keep (the owner's rules) | Rule | |
| O45 | AI neighbours and helpers | Keep | WP20 (dinner guests); personality in round 3 | Deepen through story, not more systems. |
| O46 | Starship with fuel and a sorted star map | Improve | WP18 (space colours); launch spectacle round 2 | |
| O47 | Farm pen animals | Improve, needs yes | WP5; ranch in round 2 | Today the pen is empty on every return. |
| O48 | Farming helper; steady rod snaps 10% | Keep, ask | WP5 | Keep 10% unless the owner wants "never". |
| O49 | Farm robot and helpers' sizes | Keep (done) | Rule | |
| O50 | Heal 4x at home | Keep (the owner's rule) | Rule | |
| O51 | Pets at the pen | Keep (done) | Rule | |
| O52 | Gear shows on the avatar | Keep (done) | Rule | |
| O53 | Shape shop | Keep (done) | WP25 shows free looks on the title | |
| O54 | +10 gear, equal power | Keep (rule) | Rule | |
| O55 | Tester code | Keep (the owner's rule) | Rule; WP26 puts `?colossus=1` behind it | Solo only, only its hash in the repo. |
| O56 | Fishing cast and pond | Keep | WP15 adds a catch card for the first, new and record catches | |
| O57 | Beds placed by themselves | Keep (done) | Rule | |
| O58 | Labels pinned; compact icons | Keep (UI rule) | WP16 | Bigger tap areas are invisible, so icons stay compact. |
| O59 | Small messages; gains in the tracker | Keep (hard UI rule) | WP15 | Ribbons on the top edge; rewards fly from the tracker, not the hero. |
| O60 | Bonus line, compact name, PC buttons, WASD guide | Improve | WP16 | The small PC numbers are still open. |
| O61 | Keyboard guide folds itself | Improve | WP16 | Open for a new player; folds after the first planting, 3 minutes or 30 keys. |
| O62 | Music per region, ambience, real sounds | Improve | WP7, WP8, WP11, WP12, WP13; generated tracks round 2; free CC0 recordings asked in WP5 | The cheapest big gap (0 bytes). |
| O63 | Browser notifications | Drop for now | Parked | Low value. |
| O64 | PvP, survival, market, Steam, real money | Drop (agree) | Parked | Out of scope. |

---

## 3. New ideas we adopt

From `AAA-EVALUATION.md` section 4.

| # | Idea | When | Where |
|---|---|---|---|
| I1 | Ember Springs story spine | Round 1 (chapters 1-2, both home rescues, a reason for every step), round 2 (chapters 3-4) | WP14, WP20, WP21 |
| I2 | Pepper's Kitchen Garden (Chapter 1) | Round 1 | WP20 |
| I3 | Planet restoration | Round 3 | |
| I4 | Boss intro cards and a BREAK moment | Round 1 | WP22 |
| I5 | Boss medals, Echo rematches, weekly trial | Medals round 1; rematches and trial round 2 | WP22 |
| I6 | Garden-tool boss weaknesses | Round 2 | |
| I7 | Ascended planets after level 20 | Round 4 | |
| I8 | Friendship hearts | Round 2 (with friend requests and a memory line) | |
| I9 | Neighbours with personality and memory | Round 3 | |
| I10 | Village restoration projects | Round 3, with the new hub | |
| I11 | Weekly festivals and seasons | Round 3 | |
| I12 | Kitchen orders and picnic buffs | Round 3 | |
| I13 | Crop quality and cross-pollination | Round 4 | |
| I14 | Legendary fish and a catch reveal | Catch card round 1; legendary fish, records wall and aquarium round 2 | WP15 |
| I15 | A ranch instead of an expiring pen | Round 2, if the owner says yes | WP5 asks |
| I16 | Vault Keeper shop and weekly affixes | Round 2 | |
| I17 | Pet bond and duo finishers | Round 3 | |
| I18 | Constellation collection | Round 2, as the collection book | |
| I19 | Starship courier runs and ship paint | Round 4 | |
| I20 | Befriend instead of defeat | Round 4 | |
| I21 | "Make your explorer" and a staged title | Round 1 (our own title wordmark, premise tagline, name dice, free looks); turning preview and posed hero round 2 | WP25 |
| I22 | Living soundscape at zero bytes | Round 1 | WP11 |
| I23 | Adaptive music director | Round 1 (live score plus the theme); generated region tracks round 2 | WP13 |
| I24 | Creature voices and audio warnings | Round 1 | WP12 |
| I25 | Hit feel 2.0 | Round 1 | WP9 |
| I26 | A livelier hero without a skeleton | Round 1 (gait, fidgets, poses); face and springs round 2 | WP10 |
| I27 | Toy finish at zero frame cost | Round 1 | WP6 |
| I28 | A postcard landmark and a creature kit per planet | Round 2 (village batch first, then boss kit 1, landmarks, planet kits) | |
| I29 | Living scenery: wind sway and one water shader | Round 2, behind the PC-only Fancy effects switch, flicker-tested | |

---

## 4. Roadmap, rounds 1-4

**Round 1 (this session): feel, sound, the first story, our own look and names.** 28 packages (WP0-WP27): 26 heavy, 2 light, in 11 batches, at most 3 heavy jobs at once. That is 2 above the guide's 26: the critics asked for three new packages (the "before" numbers WP3, the journey tool WP4 and chunky toy effects WP19) and some splits, while six v1 items left the round (section 12). The slip order in section 10 can drop one whole package (WP23) if time runs short. About 45-75 hours of agent time; 30-40 hours of wall-clock time including about 28 merges of 30-40 minutes each (every merge also runs the 8 browser suites, about 16 minutes).
- Blockers and "before" numbers: WP0 (date test, frozen speed gate, bytes, all 61 browser tests green), WP3 (fight, space, moving, King Bear, treant and download rows, a mid-game save that real play reaches), WP4 (journey tool and the before show reel).
- Foundations: WP1 (self-wiring test harness, clock-shift run, size and server guards), WP2 (game events, services, lazy features, lazy Vietnamese).
- Feel: WP9 hit feel, WP10 hero motion, WP17 the first fight and danger signs, WP19 chunky toy effects.
- Sound: WP7 one sound system, WP8 mix and stingers, WP11 ambience and footsteps, WP12 creature voices, WP13 music director.
- Story and moments: WP14 scenes, talk bar and opening, WP15 moments and the beat conductor, WP20 Chapter 1, WP21 Chapter 2 and rescues.
- Bosses: WP22 boss events and medals, WP23 King Bear and treant signatures.
- Look and identity: WP6 toy finish, WP18 our own colours, WP16 HUD, WP25 our own names and title.
- Choices and approvals: WP24 Ember Well rewards and a fair bounty, WP5 owner decision pack.
- WP26 and WP27 cleanup, then `aaa/staging` to `develop` and `main`, and the Pages deploy.

*Exit:* all packages merged into `aaa/staging`, then `develop` and `main`; Pages deployed. `npm test` 0 failures, `test:timeshift` green, `tsc` 0 errors with `noUnusedLocals: true`, the frozen gate exact on every standing row, English and Vietnamese pre-Start bytes and the before-play download up to Start at or below the baseline, the download after Start and the install list within their named allowances, the 8 browser suites green. The journey tool on 390x844 and 1600x900 shows: a named character within 60 s, 0 Collect taps, 0 Attack dialogs in fights, at least 5 beats in the first 15 minutes, the boss beats on the mid-game save, music and ambience audible. The owner gets a short report, the before/after show reel, music clips with a listen page, a story-lines page and the decision pack, all in the kept folder `.scratch/owner/`.

**Round 2: depth for the first month and a wider world** (after the owner answers the decision pack)
- Headroom first: the village static batch (merged per 20-25 m cell and per material, indexed geometry, 8-bit colours, under `freezeStaticTree`, re-merged in idle time; the gate then compares against the post-batch numbers plus ledger entries). Then "headroom 2": merge bot pets and gear (about -25 draws), scatter per tile (about 40 to 15), pond banks and golden fish (about 32 to 15).
- Time of day at home (colour only, values changed in place and tweened, a two-frame flicker check; night with window and lamp glows paid from the ledger; "Always day" in Settings; gate pinned to day plus a night row); then the cottage fireplace, lamp and "sleep to the next morning" (O26, O29).
- Camera pass: look-ahead, boss framing (through the view offset, zoom at most 1.05, the Colossus left out; it includes the PC boss-approach camera move taken out of WP22), a tree fade pattern anchored to each tree with a panning flicker test, and the phone camera 1.3 to 1.36 paid from the ledger (P26, P28, O11).
- Boss kit 1 (robot, Cake King, Magma Golem, Shadow Lord; at most 3,000 triangles each, glow in vertex colours, compiled on load, on demand), then planet creature kits, one planet per package (P16, O12, I28).
- Signatures and weaknesses for the robot, the croc and the other 13 bosses; garden-tool weaknesses; Echo rematches and a weekly boss trial (O32, P6, P7, I6, I5).
- Story chapters 3-4 (flying out, the troubled springs, Lantern Night), one rescued friend visiting per planet (I1, O20).
- Friendship hearts with requests only from friends at home and a welcome-back memory line (I8, O22).
- Hero face (blink and moods, shown in portraits and close-ups first), CPU-only springs, top-view readability of the hero (P24, I26).
- Crops re-baked when the pitch slider settles, bevelled planters; item icons re-rendered with the new ramp (P20).
- A PC-only Fancy effects switch, off by default and never on phones, hosting tree and reed sway and one toon water patch, each flicker-tested (I29, P19, O5, O16 rule).
- ACE-Step original region tracks: 4 takes per slot, a blind loudness-matched listen page, the owner keeps the good ones (I23, O62).
- Phone sharpness after a real-phone test and a phone gate row; phone fight stalls (FIX-PLAN 1.1: warm-up and the slowest-frame column) (P30).
- Collection book as constellations; one SVG icon family; a real map; a card-grid shop and market; place-flag level ranges (O27, I18, P29, P11).
- If the owner says yes: ranch, special-offer buy-back, cosmetic neighbour gifts, a softer bed curve, the section 8 tuning answers (I15, O47, P5, P4).
- Vault Keeper shop and weekly affixes, dressed Vault rooms, Rescue Call phase 2 and landscape fix, one elite role per planet (I16, O9, O10, O41, O36, P23).
- Legendary fish, a records wall and an aquarium (I14); launch and landing spectacle (O46); training dummy and combo tips (O31); the cottage's dark lower screen; creatures turn back at the village border; a real late test save.
- "Make your explorer" step with a turning preview; a posed hero and companion on the title (I21). A text size option.
- If the owner picked a hub: Blender renders of the chosen option, then the hub in M packages with the save migration (O2).
- Code: decouple the tests from `main.ts` text (careful refactor 1).

*Exit:* chapters 1-4 have scenes; 17 of 17 bosses have a signature move and a weakness; no code-shape bosses; every planet has a landmark; the gate still passes.

**Round 3: our own world and a living year** (after the identity decisions)
- The identity pass: the new hub with its save migration, our own planet names and themes, item names and the copied tables; reword the 228 source comments that mention the reference; our own disguise skills (O1, O2, P21); everyday disguises as on-demand kits if the owner names the art-lead repo (O14).
- Weekly festivals and seasons; weather and day phases that change what grows, bites and appears (I11, O26).
- Village restoration projects as the visible energy sink (I10, P5); kitchen orders and picnic buffs (I12); planet restoration colour (I3).
- Neighbours with personality, memory and rivalries (I9, O45); pet bond and duo finishers (I17).
- Coming-soon features: Greenhouse, Night market, Pet show (O28). Gamepad support.
- Code: carve `main.ts` into controllers; split `World` into systems.

*Exit:* no reference layout, names or tables remain; something new every week with no bigger first download; `main.ts` under 250 KB.

**Round 4: endgame, one fight system and the name**
- Ascended planets after level 20 (I7, P6); befriend instead of defeat (I20); crop quality (I13); starship courier runs and ship paint (I19).
- One fight system after the owner's online decision (O33); online co-op only if a server is hosted (O42).
- A skeleton for the hero and bosses only if motion-only life falls short (O7).
- Ability registry shared with the server; break the `model.ts` import cycle; merge byte-identical hash functions with golden tests; delete the always-on perf-flag "off" paths; split `promo/`.
- A rename and a store page if the owner picked a name; real iPhone and Android checks.

*Exit:* new play from level 20 to 60; one fight rule set (or a recorded decision to keep two); the code-health score reaches 7.

---

## 5. Round 1 work packages

| WP | Title | Effort | Heavy | Owner | Depends on | Hot files | Batch |
|---|---|---|---|---|---|---|---|
| WP0 | Blockers: the date test and an honest, frozen speed gate | M | yes | free | | none (world.ts only if the try-on fix needs it) | 0 |
| WP1 | Test foundations: a self-wiring harness, a clock-shift run, size and server guards | M | yes | free | WP0 | none | 1 |
| WP2 | Plug-in foundations: events, services, lazy features, lazy Vietnamese | M | yes | free | WP1 | main.ts | 2 |
| WP3 | More "before" numbers: fights, space, moving, download, a mid-game save | M | yes | free | WP0 | none | 1 |
| WP4 | The journey tool and the before show reel | M | yes | free | WP0 | none | 1 |
| WP5 | Owner decision pack | M | no | needs-owner | WP0 | none | 1 |
| WP6 | Toy finish: our own ramp, ink and highlights; crops at the player's angle | M | yes | free | WP0, WP3 | none | 2 |
| WP7 | Sound core: one audio system with buses | M | yes | free | WP0 | main.ts (delete 1 line), server/sw-logic.mjs, server/build-offline.mjs | 2 |
| WP8 | Mix and stingers: cues the player can hear | M | yes | free | WP1, WP7 | main.ts | 3 |
| WP9 | Hit feel 2.0 | M | yes | free | WP2, WP3, WP7 | main.ts, world.ts | 4 |
| WP10 | The hero moves smoothly | M | yes | free | WP2, WP3 | world.ts | 3 |
| WP11 | A world that sounds alive: ambience and footsteps | M | yes | free | WP2, WP7, WP9 | none | 6 |
| WP12 | Creatures with voices, warnings the player can hear | M | yes | free | WP2, WP3, WP7 | main.ts (2 lines), world.ts (1 hook) | 4 |
| WP13 | Music in the world: a director with a live score | M | yes | default | WP2, WP7 | locales/vi-econ.ts (1 entry in place) | 4 |
| WP14 | Story scenes: talk bar, barks, portraits, premise and the opening | M | yes | default | WP2, WP7, WP9 | main.ts, locales/vi-first.ts (2 entries) | 5 |
| WP15 | Moments: one conductor, ribbons, rewards that collect themselves, a catch card | M | yes | default | WP2, WP8, WP10, WP14, WP19 | main.ts | 6 |
| WP16 | A HUD that reads at a glance: 11 px, 44 px, tokens | M | yes | default | WP0 | locales/vi-help-topics.ts | 3 |
| WP17 | The first fight and danger the player can read | M | yes | free | WP1, WP2 | main.ts | 5 |
| WP18 | Our own colours: warm wilds, vivid Candy, dark blue space | M | yes | free | WP3, WP6 | world.ts (1 import) | 6 |
| WP19 | Chunky toy effects | M | yes | free | WP3, WP6, WP9 | main.ts, world.ts (effect calls) | 5 |
| WP20 | Chapter 1: Pepper's Kitchen Garden | M | yes | default | WP14, WP15, WP17 | none | 7 |
| WP21 | Chapter 2, the rescues and coming back | M | yes | default | WP20 | main.ts | 8 |
| WP22 | Boss fights as events: intro card, one big word, BREAK, medals | M | yes | free | WP2, WP8, WP9, WP15 | main.ts, world.ts (1 hook) | 7 |
| WP23 | King Bear and the old treant: a signature move and a weakness (solo) | M | yes | default | WP12, WP14, WP22 | world.ts (1 hook) | 8 |
| WP24 | Fair rewards and true words: Ember Well, bounty cap, text fixes | M | no | default | WP1 | main.ts (1 line), locales/vi-news.ts, locales/vi-gameplay.ts (in place) | 4 |
| WP25 | Our own names and an original title | M | yes | default | WP14, WP16 | main.ts, combat.ts, locales/vi-catalog.ts, locales/vi-friends.ts, locales/vi-five.ts, locales/vi-house.ts | 7 |
| WP26 | Cleanup A: mechanical cleanup, text drift and the round report | M | yes | free | WP0-WP25 | main.ts, world.ts, locales/vi-news.ts, server closure (identical results) | 9 |
| WP27 | Cleanup B: careful refactors and the byte payback | M | yes | free | WP26 | main.ts | 10 |

**Rules for every package**
- New behaviour goes in new modules. Hooks into hot files are one or two lines. New systems live in `src/features/` (one mount file each, helpers in subfolders) or `src/story/`, mount from `src/features.ts` and load after Start. Nobody edits a shared list: `features.ts` finds feature files by itself.
- Every new player-facing string has English and Vietnamese. Text shown only after Start goes in the feature's own `src/features-vi/<name>.ts`, registered with `addPhrases` (WP2), so Vietnamese players do not download it before the title. Only text shown before Start goes in an existing `src/locales/` file, with one exception: the welcome card's two premise lines (WP14) render at the moment of Start, before any lazy table can load, so they go in `vi-first.ts`. Nobody edits `vi-pack.ts`.
- Story text names bosses, skills and friends through lookups (`ENEMY_TYPES.bear.name`, `FRIENDS.clover.name`), never typed words, and tests read names from the same tables, so WP25's renames flow through. Every new player-facing name passes the private name check (`.scratch/plan/name-check.mjs`, WP5) before review.
- Tests check behaviour (pure functions, fake hosts, rendered HTML), never source text with regexes.
- No save-format change and no new action in `src/actions.ts`. Per-device memory (seen scenes, medals, settings rows) goes in `localStorage` per profile slot, wrapped in try/catch.
- Server closure: edits to the 96 modules the server reaches keep rule results identical, except the two "online changes" named in WP24 (a defaulted Colossus parameter and the bounty cap). Server tests (`colossus-server`, `combat-authority`, `w10-combat-authority`, `actions-authority`, `w15-server`) pass with no edit.
- No new overlay may cover the joystick, Attack, the 4 skill buttons or the target frame at 390x844, 844x390 and 1600x900; overlays use the zones in `src/screen-zones.css` (WP14).
- Every new material, shape or kit is compiled during the start-up warm-up (`KitLibrary.warmOnLoad`, `compileAsyncSafe`, `World.readyTrail`); programs created during the scripted fight must not rise above the baseline.
- Per-frame camera changes write `world.viewOffset` (the Colossus `frameCamera` pattern, `src/colossus.ts:205-215`), never `world.resize()` every frame: `resize()` resets the canvas (`src/world.ts:296-302`).
- Audio on touch devices: at most 6 live synthesized voices in total (ambience, voices, score), one shared noise buffer, AudioParam automation instead of JS every frame, the audio context suspended when every volume is 0 or the tab is hidden.
- Visual packages attach screenshots at 390x844 and 1600x900 (plus 844x390 where they touch the HUD) that the builder and the reviewer have looked at. Packages that add a beat add its check to `promo/journey.mjs`.
- Before review: `tsc`, the package's own tests, the tests that read `main.ts` if it was touched, and `perf:bytes` on both the English and the Vietnamese start, compared with the batch's starting commit; each must stay within the package's allowance in section 7. Rendering packages also run `perf:gate -- --compare` (exact counts). Packages that add a perf flag (WP6 `perfFlags.ownRamp`, WP10 `perfFlags.heroMotion`) also run `promo/frozen-ab.mjs`, which renders one frozen page twice, with the flag on and off. It cannot compare two commits or two page loads, so packages without a flag (WP18, WP19 and the others) rely on the gate's counts plus before/after screenshots.

### WP0. Blockers: the date test and an honest, frozen speed gate
- **Result:** nothing visible. The next push deploys again, every browser test passes again, and every later change is measured at the real 42° camera on fixed graphics, frame for frame.
- **Scope:**
  1. `tests/w15-review.test.ts`: freeze `Date.now` at T0 (line 34) for the whole file and restore it after, as commit 8c401e6 did. Test 6 (line 151) fails because the season rule (`src/progression.ts:150`) reads the real clock.
  2. `promo/perf-budget.mjs`, frozen mode (the default), copied from the init script in `promo/draw-call-review.mjs:20-24`: fake `performance.now`/`Date.now`, a hand-pumped `requestAnimationFrame`, a seeded `Math.random`. After Start and closing dialogs, pump 120 frames, wait until kit loads and the crop-atlas bake are idle (poll up to 20 s), pin the hero (`__zoo.pinHero`), stop pumping, then count one call of `world.render()` with a draw counter that is active only inside that call (main and shadow split as `draw-call-review.mjs` does). Drop the slow-CPU frame-rate check from every row (frame rates are not the gate).
  3. Camera: drop the `CAMERA.offset` writes (lines 27-28). Per row call `setCameraPitch(deg)` from `/src/camera-rig.ts`, then `world.resize()`; read the pitch back from `world.viewOffset` and log it; a row more than 0.5° off is invalid.
  4. Init script: seed `zoo-garden-graphics` = `{setting:<level>,autoVersion:2}`, `cute-game-neighbours-on` = `'0'` (`src/bots.ts:31`), `zoo-camera-view`, `zoo-colossus-sleeps` = `'asleep'`, language `en`. Fix the dead `save.settings.aiNeighbours` line in `draw-call-review.mjs` to the real key.
  5. Per row record: main draws, shadow draws, triangles, `renderer.info.programs.length`, `memory.geometries`, `memory.textures`, geometry bytes (as `draw-call-review.mjs` measures them), `__zoo.matrixStats.visited`, the graphics level and shadow-map size. A row not on its pinned level is invalid.
  6. 24 rows (1600x900 unless stated): village, wild and canyon at 42° on `save-late.json`, `save.json` and `save-new.json` (9 primary); 30° and 51.5° on `save-late.json` (6); phone 390x844 at device scale 3 with `isMobile` and `hasTouch`, graphics `high` (the phone rule caps the ratio at 1.25) (3); Balanced (`medium`) and Battery saver (`low`) on `save-late.json` (6). The governor's reduced phone tier is not gated (recorded).
  7. Limits: draws, shadow draws, triangles and programs exact (+0) on every frozen row; if the two baseline runs differ on a row, its limit is the larger value plus the observed spread. Memory and matrix counters +5%. `RUNS=2`. `--baseline` writes `promo/perf-baseline.json`; `--compare` exits 1 on any row over its limit; limits add named entries from `promo/perf-ledger.json` (starts empty). Compare maths in `promo/perf-compare.mjs`; npm script `perf:gate`.
  8. `promo/start-bytes.mjs` (npm `perf:bytes`), after `npm run build:pages`: (a) the English start: gzip of `index.html` and every script, modulepreload and stylesheet before the Start button, per file; (b) the Vietnamese start: (a) plus the `vi-pack` chunk (`src/i18n.ts:165` loads it before the first screen); (c) the install list: the transfer size of the built service worker's `CORE` and `EXTRA` lists (gzip for scripts, stylesheets, JSON and SVG; raw for models, audio and images), about 2.7 MB today, printed per file so a new lazy chunk shows by name. `server/build-offline.mjs:49` puts every hashed script and stylesheet in `CORE`, so every new lazy chunk and every pre-Start byte joins this row (limits in section 7: the running pre-Start total, `public/news.json` growth and the chunk allowances). Stored in a `bytes` section of the baseline.
  9. Take the baseline twice on this tree (b3b9f57 plus tools) and commit it. Rewrite "How to measure" in `docs/QUALITY-PLAN.md` section 2. Commit `docs/AAA-EVALUATION.md` and `docs/AAA-PLAN.md` after replacing the reference game's name with "the reference game".
  10. Browser suites green at the start of the round. Run the 8 browser files on a dev server with its own port and a private `cacheDir` (about 16 minutes):
      `HUD_LAYOUT_URL=<dev url> PLAYWRIGHT_MODULE=C:/Users/n/source/repos/3D_claudeopus55/node_modules/playwright/index.mjs node --test tests/art-retry-browser.test.mjs tests/device-qa.test.mjs tests/dialog-dock.test.mjs tests/hud-layout.test.mjs tests/item-layout.test.mjs tests/mobile-menu-layout.test.mjs tests/quick-eat-browser.test.mjs tests/rescue-view-browser.test.mjs`
      At b3b9f57, 44 of 61 pass (log: `.scratch/baseline/browser-tests.log`).
      - 10 fail with "the name is not above the portrait tile": `tests/hud-layout.test.mjs:305` ("our HUD: nothing overlaps or leaves the screen" at 1600x900, 1280x720, 768x1024 and 390x844, in English and Vietnamese: 8 rows) and `:401` ("the power strike ... hit counter stays clear", 390x844, both hands: 2 rows).
      - 4 fail at 320x568 with "without the tile the level badge should stand before the name, over the energy count": `:305` in English and Vietnamese, and `:401` for both hands.
      The 2026-10-17 HUD simplification (commit e78e839) moved the name and the tile. Update those 14 assertions to the layout that commit intended (read its diff and the current CSS), keeping every overlap and off-screen check.
      - 3 fail at `tests/quick-eat-browser.test.mjs:64` ("the hat is on the explorer", a mesh count after try-on, at 1440x900, 390x844 and 844x390). Find out why: b3b9f57 merged the avatar's draws (`src/avatar-merge.ts`), or the hat's kit loads after the 800 ms wait, or try-on is really broken. If it is a real bug, fix it (the try-on path, `src/world.ts:914-916`) and keep the gate exact. If the counting method is stale, check the hat another way (the hat item among the explorer's built parts after try-on, and a change in the head's bounding box).
      The command goes in `docs/QUALITY-PLAN.md` section 2. From here on the integrator runs the 8 suites after every merge (WP16 wraps the command as `npm run test:browser`).
- **Files:** `tests/w15-review.test.ts`, `promo/perf-budget.mjs`, `promo/perf-compare.mjs`, `promo/perf-baseline.json`, `promo/perf-ledger.json`, `promo/start-bytes.mjs`, `promo/draw-call-review.mjs`, `tests/perf-compare.test.mjs`, `tests/hud-layout.test.mjs`, `tests/quick-eat-browser.test.mjs`, `package.json`, `docs/QUALITY-PLAN.md`, `docs/AAA-EVALUATION.md`, `docs/AAA-PLAN.md`. Read only: `src/camera-rig.ts`, `src/graphics.ts`, `src/i18n.ts`. Only if try-on is really broken: `src/world.ts`, `src/avatar-merge.ts`. (Items 2-7 build one tool. The server-closure list moved to WP1, which is the package that tests it.)
- **Hot files:** none, unless the try-on fix needs `src/world.ts` (batch 0 runs alone).
- **Tests:** `tests/perf-compare.test.mjs`: an equal row passes and +1 draw fails on an exact row; the spread rule; a ledger entry raises the limit only for its row; a missing row fails; an invalid row is refused; memory counters at +5%. `w15-review` passes. Its clock is now frozen for the whole file, so it no longer depends on today's date; WP1's `test:timeshift` re-checks it at +45 and +400 days (the clock-shift preload does not exist yet in WP0). The 8 browser suites: every assertion updated for e78e839 still checks overlap and off-screen; the hat check passes because the hat is on the explorer, not because the check was loosened.
- **Acceptance:**
  - `npm test`: 0 failures (was 1 of 2,234).
  - The 8 browser suites pass 61 of 61 (was 44 of 61), twice in a row; the command is in `docs/QUALITY-PLAN.md`.
  - 42° rows log 42.0° ± 0.1 and 30° rows log 30.0° ± 0.1 with more draws than 42° (today they are identical).
  - Two frozen runs on the unchanged tree give identical main draws, shadow draws, triangles and programs on at least 20 of 24 rows; `--compare` passes twice and fails when a test hook adds one mesh to the village.
  - Late village within about 10% of the evaluation's clean probe (294 draws / 245,000 triangles; wild 95 / 88,500; canyon 132 / 83,000).
  - `perf:bytes` prints the English start (near 792 KB gzip), the Vietnamese start and the install-list row (about 2.7 MB) with each file named. One full gate run takes 10 minutes or less.
- **Speed:** tools and tests only; 0 change to the game unless try-on is really broken (then one fix, with the gate exact).
- **Refs:** P1, P2, O17.

### WP1. Test foundations: a self-wiring harness, a clock-shift run, size and server guards
- **Result:** nothing visible. Later packages can add imports to `main.ts` without hand-editing 8 test files, and hidden date bombs are found before they block a deploy.
- **Scope:**
  1. `tests/support/main-harness.mjs`: cut named functions out of `src/main.ts` as today, find their free names with the TypeScript compiler API (already used by these tests), map each name to `main.ts`'s own import lines, import those modules (with the `.css` load hook that `tests/vi-panels.test.mjs` uses) and return the `node:vm` context. Fakes passed in win; an unresolved name fails with one clear message naming it. Start from `.scratch/eval/code/harness-names.mjs`.
  2. Move 8 files onto it, keeping every assertion: `main-locale`, `vi-panels`, `frame-lifecycle`, `graphics-frame`, `keyboard-routing`, `touch-routing`, `authority-state-controller`, `w14-equip`.
  3. `tests/support/clock-shift.mjs`: a preload (`node --import`) that moves `Date.now` and `new Date()` by `CLOCK_SHIFT_DAYS`; npm script `test:timeshift` runs the suite at +45 and +400 days. Freeze the clock (the 8c401e6 method, or `tests/support/midday-clock.mjs`) in up to 11 failing files; list any beyond that in `docs/QUALITY-PLAN.md` for round 2.
  4. `tests/architecture-fitness.test.mjs`: `src/main.ts` at most 356,000 bytes and `src/world.ts` at most 272,000 (today 344,830 and 266,464; WP27 lowers them); the server closure equals `docs/server-closure.txt` unless the change is listed in `tests/fixtures/closure-allow.json`; no closure module imports `three`, a `.css` file or touches `document`/`window` at load; an allow list for scan-type tests (own names, locale scans).
  5. The closure list (moved here from WP0): copy `.scratch/plan/server-closure.mjs` to `promo/server-closure.mjs` and write its list to `docs/server-closure.txt` (96 modules today).
- **Files:** `tests/support/main-harness.mjs`, `tests/support/clock-shift.mjs`, `promo/server-closure.mjs`, `docs/server-closure.txt`, `tests/main-locale.test.mjs`, `tests/vi-panels.test.mjs`, `tests/frame-lifecycle.test.mjs`, `tests/graphics-frame.test.mjs`, `tests/keyboard-routing.test.mjs`, `tests/touch-routing.test.mjs`, `tests/authority-state-controller.test.mjs`, `tests/w14-equip.test.ts`, `tests/architecture-fitness.test.mjs`, `tests/fixtures/closure-allow.json`, `package.json`, `docs/QUALITY-PLAN.md`.
- **Hot files:** none (`main.ts` is only read).
- **Tests:** a harness self-test with a temporary copy of `main.ts` that gains one import used by a harnessed renderer resolves with no test edit; an unknown name gives the clear message. The fitness test passes on the real files and fails on an oversized fixture and on a fake closure module that imports `three`.
- **Acceptance:** the 8 files pass with no hand-written list of `main.ts` imports; `test:timeshift` green at +45 and +400 days, or each remaining failure listed with its file; `npm test` 0 failures with the same test count plus the new tests.
- **Speed:** tests only.
- **Refs:** P1.

### WP2. Plug-in foundations: events, services, lazy features, lazy Vietnamese
- **Result:** nothing visible. New systems load after Start in one small chunk, so the first download stays the same for English and Vietnamese players, and later packages plug in with one file.
- **Scope:**
  1. `src/game-events.ts`: typed events `started`, `levelUp`, `storyStep`, `reward`, `place`, `creatureAlert`, `creatureDefeat`, `bossApproach`, `bossEngaged`, `bossBreak`, `playerHurt`, `hitLanded`, `fishCatch`, `harvest`, `rescue`, `friendHome`, `firstWin`, `telegraph`. A throwing listener never stops the others.
  2. `src/game-services.ts`: `world`, `state()`, `perform`, `toast`, `tone`, `openDialog`/`closeDialog`, `modal()`, `onFrame`, `on`/`emit`, `pref`/`setPref` (localStorage in try/catch), `slot()` (the active profile slot), `touch()`, `quality()`. Exposed as `__zoo.services` in dev builds. (Audio needs no service: feature modules import `audioGraph` from `src/sfx.ts`, WP7.)
  3. `src/features.ts`: `mountFeatures(services)` loads every `src/features/*.ts` with `import.meta.glob` and calls each module's `mount(services)`; `start()` (`main.ts:605`) calls it with `import()` after the first played frame.
  4. `src/i18n.ts`: `addPhrases(loader)`. When the language is (or later becomes) Vietnamese, the loader runs and its phrases merge into the table, the cache clears and listeners fire. Additive only: `i18n.ts` is in the server closure. `tests/support/feature-phrases.mjs` loads every `src/features-vi/*.ts` for the locale tests.
  5. `vite.config.ts`: `manualChunk` pins `/src/features/` and `/src/story/` to a `features` chunk and `/src/features-vi/` to `features-vi` (as `help-topics` is pinned today, so `experimentalMinChunkSize` cannot fold them into the start download); a small `generateBundle` plugin writes `.scratch/build/chunk-map.json`, outside `dist/`, because `server/build-offline.mjs` lists every file in `dist/` and a map there would join the install list and the service worker's version hash; `perf:bytes` fails if a module from those folders lands in `index`, `world`, `rules` or `three`, or if a start chunk imports the `features` or `features-vi` chunk statically (a static import or modulepreload would put the lazy chunk in the start download).
  6. Emits at existing sites, no behaviour change. Every event in the list has a site here or a named owner:
     - `started`: once, right after `mountFeatures` resolves (features mount after the first played frame, so an emit inside `start()` at `main.ts:605` would reach no listener);
     - `levelUp` in `levelCheck` (`main.ts:546-547`);
     - `harvest` and `reward` in `perform()`'s success path (`main.ts:276`, the line that calls `pepperGift` today): `harvest` after the player's own `harvest` or `harvestAll`, with `first: true` on the harvest that settles the welcome (the one that brings Pepper); `reward` after `claimQuest` and `claimProgress`, with what was granted (the claim buttons at `main.ts:2270` and 2304 and WP15's auto-claim all go through `perform`);
     - `creatureAlert` at `world.onAlert` (1440); `hitLanded` in `hit()` (`main.ts:1525`) for hits that are not remote or hazards, with `helper` set from the impact (pets and helpers); `creatureDefeat` on the defeat path (1521, 1537);
     - `rescue` in the friend crew's `rescued` callback (1232); `friendHome` in its `arrived` callback (`main.ts:1242`), once per friend id: a friend who walks home after a rescue (Pepper joins at home with the first harvest, so a new save never sends it for her);
     - `playerHurt` on the solo damage path (`main.ts:2017`) and in `applyAuthorityHealth` online (2096);
     - `storyStep`, `place` and `fishCatch` from story index, place and fishing changes compared at the existing HUD tick;
     - `bossApproach` from a pure helper next to `bossFor` in `src/hud-combat.ts` (a boss within its sight radius + 6 m and not yet aggro); `bossEngaged` when `CombatHud.panels()` sees a new boss (`hud-combat.ts:195`); `bossBreak` when `staggerBroken` turns true;
     - owned by later packages: `telegraph` (WP12, through `world.onTelegraph`) and `firstWin` (WP17, the first tutorial kill).
- **Files:** `src/game-events.ts`, `src/game-services.ts`, `src/features.ts`, `src/i18n.ts`, `vite.config.ts`, `src/main.ts`, `src/hud-combat.ts`, `promo/start-bytes.mjs`, `tests/game-services.test.ts`, `tests/i18n-phrases.test.ts`, `tests/support/feature-phrases.mjs`, `tests/lazy-split.test.mjs`, `tests/hud-combat.test.ts`.
- **Hot files:** `src/main.ts`.
- **Tests:** subscribe and unsubscribe; a throwing listener does not stop others; a typed payload per event; `pref` survives a throwing localStorage. `i18n-phrases`: a loader registered in English runs only after switching to Vietnamese, `t()` returns the new phrase, English is untouched. `bossApproach` thresholds. An emit table: every event in `game-events.ts` has a site above or a named owner (WP12, WP17); a harness run of `perform('harvest')` on `save-new.json` emits `harvest` with `first: true` exactly once; `claimQuest` emits `reward`; `started` fires once, after `mountFeatures` resolves. A build check: a fixture feature module lands in the `features` chunk.
- **Acceptance:** `main-locale`, `vi-panels` and `frame-lifecycle` green with no edit; a harness run of `levelCheck` emits exactly one `levelUp` per level gained; `features` and `features-vi` are separate lazy chunks in `.scratch/build/chunk-map.json`, and no start chunk imports or modulepreloads them; English and Vietnamese starts grow by 1.0 KB gzip or less each; frozen gate exact.
- **Speed:** 0 draw calls; at most 1.0 KB gzip before Start (allowance in the bytes ledger the same bytes also count in the install list's running pre-Start allowance (section 7)); only comparisons at the existing HUD tick.
- **Refs:** none (foundation).

### WP3. More "before" numbers: fights, space, moving, download, a mid-game save
- **Result:** nothing visible. Every round-1 change that touches fights, space, moving or downloads is measured against a number taken before any game change.
- **Scope:**
  1. `promo/save-mid.json`, a state real play reaches: story index 12 ("Defeat a boss", `src/content.ts:4061`), level 8, standing near King Bear. Pepper is home, because index 0 (harvest three crops) is done: the first harvest by hand settles the welcome and adds her with `home: true` (`src/friends.ts:69-83`, `welcomeStart` and `firstHarvestGift`, called by the harvest action at `src/actions.ts:98-100`, on the server too), so `welcome` is `'done'`. Sprout and the farmer are still caged: `bosses` holds neither `home:treant` nor `home:bear`. Counters match steps 0-11 done. Pepper's cage on the Toy planet (`src/friends.ts:14-16`, 56-57) never appears on such a save: `cageState` returns `rescued` for a friend.
  2. New frozen and live rows in `promo/perf-budget.mjs`: (a) King Bear fight on `save-mid.json`, hero 8 m from the awake bear: a frozen frame mid-telegraph and the live peak over 4 s; (a2) the old treant fight on `save-mid.json` (Sprout's cage is locked, so the treant is unbeaten), hero 8 m from the awake treant: a frozen frame mid-telegraph and the live peak over 4 s (WP23 changes both bosses, so both have rows); (b) a scripted 8 s swamp fight on `save-late.json` with a fixed input script: peak main draws, shadow draws and triangles, programs created during the fight, CDP `Performance.getMetrics` LayoutCount, RecalcStyleCount and Nodes, plus the slowest frame and long-task count (logged, not gated); (c) space flight 4 s after launch; (d) moving rows: the hero walks east and north for 1 s at village, wild and canyon (frozen frame at the end); (e) idle village on `save-late.json`: CDP LayoutCount, RecalcStyleCount and Nodes over 4 s of idle play after Start (a live row, +5%), so the DOM-heavy packages (WP14, WP15, WP16) get an idle layout check; (f) a Colossus fight: started through the dev hook `__zoo.colossus.start()` in a `VITE_PERF_HOOK` build on `save-late.json`, hero 10 m away, live peak over 4 s. Row (f) stays report-only until two runs agree within 5%.
  3. `promo/first-visit-bytes.mjs` (npm `perf:download`), the before-play download: `vite preview` of the build on a private port, a fresh profile and Playwright `serviceWorkers: 'block'`. The worker registers about 3 s after art goes quiet (`src/art-status.ts:53`, `src/art-retry.ts:42`) and then installs about 2.7 MB, so with it running a fixed window would catch a timing-dependent slice of that install. For `save-new` and `save-late`, English and Vietnamese: bytes transferred up to the Start button and from Start to 10 s after the first played frame, by type (js, css, glb, audio, image, font). Stored in a `download` section of the baseline. Limit: exact plus 1% noise; the after-Start window may also grow by the named lazy-chunk allowances in section 7, and by nothing else. The install list is not part of this row: it is WP0's `perf:bytes` row (c), with its own limit (section 7).
  4. Take these baselines twice on the WP0 tree (no game change yet).
- **Files:** `promo/save-mid.json`, `promo/perf-budget.mjs`, `promo/perf-compare.mjs`, `promo/first-visit-bytes.mjs`, `promo/perf-baseline.json`, `tests/save-mid.test.ts`, `tests/perf-compare.test.mjs`, `package.json`.
- **Hot files:** none.
- **Tests:** `save-mid.test.ts`: the save parses; level 8, story index 12; `welcome` is `'done'` and Pepper's friend entry has `home: true`, the same entry `firstHarvestGift` gives a new game after its first hand harvest; `cageState` is `rescued` for Pepper and `locked` for Sprout and the farmer; `bosses` holds neither `home:treant` nor `home:bear`. `perf-compare`: the new row kinds; programs created above the baseline fail; live rows use +5%.
- **Acceptance:** all new rows in the baseline from two runs (the Colossus row as a report); the King Bear and treant rows show the boss in frame (screenshots at 1600x900 and 390x844); today's programs-created number for the scripted fight recorded; `perf:download` (service worker blocked) passes twice on the unchanged tree and its new-save before-play total is recorded against the owner's 1.6 MB limit; WP0's install-list row passes twice.
- **Speed:** tools only.
- **Refs:** P2, O17.

### WP4. The journey tool and the before show reel
- **Result:** nothing visible. The owner gets a "before" video and numbers for the first 15 minutes and a boss fight; every later package proves its beat on the same route.
- **Scope:**
  1. `promo/journey.mjs`, promoted from `.scratch/eval/play-new/session-v2.mjs`, `fight.mjs` and `sheets.mjs`. Route `new`: a fresh save played by a script for 15 minutes (plant, harvest, sell, buy, equip, the fight step, fishing, the crystal step) at 390x844 and 1600x900. Route `mid`: `promo/save-mid.json` (WP3), walk to King Bear and fight with a fixed script until the cage opens or 120 s. The save comes from WP3 in the same batch: WP3 merges first, and WP4 rebases onto it before it takes the `mid` baseline (still before any game change). Until then the route reads the save path from an argument and is tested with a fixture.
  2. Each run writes a timeline JSON: time of the first named line, dialogs opened (and by what: Attack or a tap), Collect taps, Attack presses, level-ups, ribbons and cards, stingers (when the sound hook exists), knock-outs; and one contact-sheet frame per beat. Each later package adds its beat to a small `beats` table in the tool.
  3. Run it on the WP0 tree and commit `promo/journey-baseline.json` (numbers only; images stay in `.scratch/`).
  4. `promo/reel.mjs`: a Playwright video of 6 clips (title to first harvest, the first fight, a level-up, King Bear on the mid-game save, Candy 26 m from the pad, the village on the late save) into the kept owner folder `.scratch/owner/reel/before/`. WP26 records the "after" reel with the same script.
- **Files:** `promo/journey.mjs`, `promo/journey-baseline.json`, `promo/reel.mjs`, `tests/journey-timeline.test.mjs`, `package.json`; kept output `.scratch/owner/reel/before/` (git-ignored, never cleaned).
- **Hot files:** none.
- **Tests:** `tests/journey-timeline.test.mjs` parses a recorded event fixture into the timeline and counts beats correctly.
- **Acceptance:** the baseline shows today's numbers (Pepper's text dialog at about 0:50, at least 1 Collect tap per step, 0 Attack presses in the fight step, at least 6 dialogs opened by Attack on the phone); the 6 clips play; the contact sheets are looked at; one run takes 20 minutes or less per viewport.
- **Speed:** tools only.
- **Refs:** P9, P10, P12.

### WP5. Owner decision pack
- **Result:** nothing in the game. The owner gets one short page with every decision that needs their yes, each with a picture or numbers, a default and the cost, answerable in one line.
- **Scope:** write `docs/AAA-DECISIONS.md`; every item has a question, a default, a cost, what the player sees and the revert cost. Nothing is executed.
  1. Our own hub: option A "Ember Terraces" (three low terraces down from the Ember Well; cottage on top; garden terraces facing the camera; market on a footbridge; launch pad on an east ledge) and option B "Riverbend Hamlet" (a stream with two bridges; the well on an island plaza). Both keep `SAFE_RADIUS` 18 and the four gates (`src/bot-logic.ts:199-203`). Per option: a top-down SVG from a layout table (`docs/hub/plan-a.svg`, `plan-b.svg`; script in `.scratch/plan/hub/`), a station table that would replace `HOME_CLEARANCE` (`src/model.ts:359`), walking times, a migration design (a `hubLayout` version; beds keep their block; decorations move to the nearest free spot; leftovers packed through the `decor-move.ts` pack-away path inside bag 100 / chest 120), a node dry-run on `save.json`, `save-late.json` and `save-new.json` counting moved and packed items, and a draw budget at or under the village baseline.
  2. Game name: a private brief in `.scratch/owner/NAME-BRIEF.md` (5 names without "Zoo", a quick web clash check each, what a rename touches).
  3. Online: solo-first and retire the classic fight path (`main.ts:294-301`), or host a server.
  4. Character art lead (Zoo Garden or `cute_game_boat`), the +4.4-5 KB faces, the everyday disguises port, and what stays unique to Zoo Garden and is not exported (evaluation decision 7).
  5. Economy and tuning: the bed curve (608,256 energy an hour at 24 level-5 beds) with two softer options; special offers; neighbour gifts; pen or ranch; the bag kept on defeat (`src/model.ts:851-852`) with a softer option (drop the trip's loot, not the bag); the evaluation's section 8 tuning table (nothing changes until answered; answered items go to round 2).
  6. Public identity: moving `PARITY.md` and the reference notes to private notes; the 228 source comments that mention the reference; a draft README pitch (ships only after a yes).
  7. Colossus lid level 15/20/30; the round-1 Automatic Colossus default (section 9) with the "Automatic always pays in full" alternative; the Fancy effects switch; phone sharpness; the steady rod's 10% snap; free CC0 recorded sound effects next to synthesized ones.
  8. The round-1 defaults taken (section 9) with how to undo each.
  9. Tools for later packages: `.scratch/plan/name-check.mjs` reads the private reference notes in `~/.claude/skills/clone-reference-app/notes/zoo-garden/` and flags any new name that matches or translates a reference name (never committed); a note that `.scratch/owner/` holds the owner's deliverables and is never cleaned.
- **Files:** `docs/AAA-DECISIONS.md`, `docs/hub/plan-a.svg`, `docs/hub/plan-b.svg`; git-ignored: `.scratch/plan/hub/`, `.scratch/plan/name-check.mjs`, `.scratch/owner/NAME-BRIEF.md`.
- **Hot files:** none.
- **Tests:** no game tests. The dry-run runs on the 3 test saves and its numbers are copied into the doc; the name check flags a planted test name.
- **Acceptance:** every item has a question, a default, a revert cost and a one-line player effect; each hub option has a plan, a station table, migration numbers for 3 saves and a draw budget at or under 294 draws / 245,000 triangles; `git diff` shows no change under `src/`; the reviewer confirms plain English and one-line answers.
- **Speed:** none (documentation).
- **Refs:** O1, O2, O14, O15, O33, O43, O47, O48, O62, P4, P5, P7, P21, P30, I15.

### WP6. Toy finish: our own ramp, ink and highlights; crops at the player's angle
- **Result:** shapes read as glossy toys: warm lit faces, blue-violet shade instead of grey bands, bevels that catch a highlight, our own outline colour. Crops are drawn from the 42° camera players use, with the new thin ink, and never hang over the next bed.
- **Scope:**
  1. `src/toon.ts`: keep today's 4-texel grey ramp `[110,185,235,255]` (line 10) as `TOON_RAMP_CLASSIC`; add our own 5-step RGB ramp from a blue-violet shade (about #7c74b8) to a warm cream light (about #fff3e0), tuned against `art/previews/kit/hero.webp` so shaded saturation does not drop. Install a one-time ShaderChunk override when `toon.ts` loads (before any renderer exists) so the gradient map reads `.rgb`; with a grey ramp the result equals today's, and no new programs are made.
  2. Item icons (`src/icons.ts`) and the mirror (`src/mirror-preview.ts`): swap `material.gradientMap` by reference to `TOON_RAMP_CLASSIC` around their renders (no data change, no re-upload), so 5 icons stay byte-identical. Section 9 records why icons keep the old steps until a round-2 re-render.
  3. `src/outline.ts` `INK` (line 14): our own warm plum-brown (about #4a2c2a) instead of #3a2433.
  4. Baked highlight: extend `contactShade`/`shadeGeometry` (`src/look.ts:162-180`) with a top highlight (faces with normal y above 0.6, top 6-10% lighter) and a catch-light on upward bevel edges, in vertex colours at bake time.
  5. Crops (`src/crop-cards.ts`): bake the atlas at `cameraPitch()` at load instead of the fixed 51.5° (lines 12, 25); replace the reference ink rim with the new ink at 1 px; cap each ripe card's screen footprint at 0.95 of its bed's width at 30°, 42° and 51.5°. (Re-baking when the slider settles and bevelled planters move to round 2.)
  6. `perfFlags.ownRamp` switches back for A/B.
- **Files:** `src/toon.ts`, `src/outline.ts`, `src/look.ts`, `src/icons.ts`, `src/mirror-preview.ts`, `src/crop-cards.ts`, `src/perf-flags.ts`, `tests/toon.test.ts`, `tests/look.test.ts`, `tests/crop-cards.test.ts`.
- **Hot files:** none.
- **Tests:** `toon.test.ts`: 5 RGB steps, shade bluer than red, light warmer; the chunk patch is idempotent; a CPU copy of the lookup with a grey ramp equals today's; `INK` is not #3a2433. `look.test.ts`: the highlight raises top faces only. `crop-cards.test.ts`: bake pitch equals `cameraPitch()` at 30, 42 and 51.5; the footprint cap at each pitch; no #3a2433.
- **Acceptance:**
  - 8 before/after pairs (village, garden close-up, swamp, Night planet at 390x844 and 1600x900): in shaded pixels the mean of (blue minus red) rises by at least 0.05; HSV saturation of shaded and of lit pixels not lower; shaded mean lightness within 0.03 of before; the hero side by side with `hero.webp`.
  - 5 item icons render byte-identical data URLs before and after.
  - No ripe card overhangs a neighbouring bed at 42° on both viewports (today a radish does).
  - Frozen gate exact on every row, programs included; atlas bake 150 ms or less (logged).
  - English and Vietnamese starts +0.3 KB or less (`toon.ts` and `look.ts` load before Start).
- **Speed:** 0 draw calls, 0 triangles, 0 new programs; one extra 5-texel texture; vertex colours at bake time; at most 0.3 KB gzip before Start (bytes-ledger allowance); the same bytes also count in the install list's running pre-Start allowance (section 7).
- **Refs:** I27, P17, P20, O5, O6, O18.
- **Result (as built):**
  - The shade target is **not met**: in shaded pixels blue minus red moves by -0.003 to +0.017, not +0.05. The ramp only colours the sun's light on faces turned from it. Cast shadows get no sun light at all (they show the hemisphere light alone) and are most of the shaded area; from the game camera the faces turned from the sun are 0.2 to 2% of the screen, and most are orange or brown paint with almost no blue to lift. The follow-up is the hemisphere colours in `LOOKS` (`src/look.ts`), with the planet colours; no light was changed in this package.
  - Under the warm light step the grass turned yellower and darker, so the ground's colour is corrected (`groundKeep` in `src/look.ts`): flat ground in full sun is lit exactly as under the grey ramp, and a grass-only patch is within 0.003 of before in hue, saturation and lightness. Shadows lying on the ground come out a few percent bluer. (A second ramp texture for the ground would have added a texture to every row of the speed gate.)
  - Under a cool sun (the Night Planet) the two light steps are neutral, so moonlit blue keeps its saturation.
  - The ramp's shade is #6466b4 and its light #fff6e8 (tuned from the plan's "about" values so warm paint in shade does not turn redder).
  - Crop cards: the rim is the new ink at the old sticker weight (the 1 px rim lost the cards' presence, owner review); the bed cap stays at 0.95 (at 1.00 with the idle bob only 2.7 px stay clear of the next bed at 390x844); a lopsided crop is centred on its bed by its silhouette, which lets the fruit trees stand about 14% larger than with a pivot-centred cap.
  - Start bytes: +669 gzip against staging at the merge (+507 against the staging it was built on), over the 0.3 KB estimate; recorded as a named entry in `promo/perf-ledger.json`.

### WP7. Sound core: one audio system with buses
- **Result:** the music slider works on iPhone, and the 444 KB theme no longer downloads in the background on a first visit. The base for every sound package.
- **Scope:**
  1. `src/sfx.ts` owns one AudioContext with buses `sfx`, `ui`, `ambience`, `music` into the existing compressor. Export `audioGraph()` → `{ctx, bus(name), duck(name, dB, seconds), voices}` where `voices` is a shared live-synth-voice counter with a touch budget of 6. Ducks do not stack: overlapping calls hold one -6 dB until the last one ends. WP8 (stingers) and WP14 (talk bar) call `duck`; WP13 plays its score on the music bus, so the ducks apply to it. The play API takes optional `detune` (cents) and `pan`. Click, open and close go to `ui`. Delete the unused context at `main.ts:241`.
  2. `src/house-life.ts` `MusicBox` (lines 51-87): the theme plays through the shared context (a MediaElementAudioSourceNode into the music bus); the slider sets the bus gain, not `element.volume` (lines 65 and 79: the iPhone fix); no second AudioContext.
  3. Move the on-demand rule from `server/build-offline.mjs:46` into `server/sw-logic.mjs` (exported) and add `/assets/audio/`; `build-offline.mjs` imports it.
  4. Suspend the context when every volume is 0 or the tab is hidden; resume on the next input.
  5. Volumes stay in `state.settings` through `parseAudio` (`src/audio-settings.ts:1-4`); buses add no saved field.
- **Files:** `src/sfx.ts`, `src/house-life.ts`, `src/main.ts`, `server/build-offline.mjs`, `server/sw-logic.mjs`, `tests/sound-bus.test.ts`, `tests/sound.test.ts`, `tests/offline.test.mjs`.
- **Hot files:** `src/main.ts` (deletes line 241), `server/sw-logic.mjs`, `server/build-offline.mjs`.
- **Tests:** `sound-bus.test.ts` with a recording fake AudioContext: every voice reaches exactly one bus; UI sounds on `ui`; `duck` lowers music 6 dB within 0.1 s and restores it; two overlapping ducks hold one -6 dB until the later one ends; detune passes through; one context only; the voice counter refuses a 7th voice on touch. `offline.test.mjs`: `onDemand('/x/assets/audio/a.mp3')` is true and the theme is not in the install list.
- **Acceptance:** a browser probe counts exactly 1 AudioContext after a fight plus a radio play; the built install list holds 0 `/assets/audio/` URLs (`perf:bytes` install-list row about 444 KB smaller; the integrator lowers that row's limit to the new value at the merge, since limits are lowered, never raised); the before-play download rows (service worker blocked) unchanged; music slider at 0 gives music bus gain 0 (unit test, plus a WebKit Playwright run if available); English and Vietnamese starts +0.3 KB or less.
- **Speed:** 0 draw calls; the service worker's install list 444 KB smaller; at most 0.3 KB gzip before Start (bytes-ledger allowance).
- **Refs:** P13, P15, O62.

### WP8. Mix and stingers: cues the player can hear
- **Result:** punches, casts and POWER READY are clearly audible. Level-up, rewards, victories, equipping and discoveries each have their own sound, and the level fanfare plays only on a level-up.
- **Scope:**
  1. A `LOUDNESS` table in `src/sfx.ts`: impacts -14 to -18 dBFS peak, whooshes 6-10 dB under their hit, UI -26 to -30, gameplay cues -24 or louder. Raise punch and cast about 15 dB (gain, wider band, a tonal layer) and POWER READY about 12 dB.
  2. New stingers: `levelUp` (unique), `rewardSmall`/`Medium`/`Large`, `discover`, `victory`, `equip`, `deny`, `go`.
  3. Replace every use of the `level` sound that is not a level-up (30 sites, found with the pattern `tone\([^)]*'level'` plus `sound('level')`; 9 are ternaries such as `tone(x ? 'alert' : 'level')`, where only the `'level'` branch changes):
     - `main.ts`: 1232 (rescue), 1314 (Lake Guardian caught), 1493 (rare drop), 1521 (boss defeat), 1566 (equip), 2132 (gift), 2207 (star shard, ternary), 2209 (planet discovered), 2267 (forge success, ternary), 2393 (storage expanded);
     - `ship-sequence.ts:70` (`this.sound('level')`); `colossus.ts`: 349 (the Colossus wakes) and 410;
     - `ctf.ts`: 184, 355, 359, 368 and 429 (the last three are ternaries); `dungeon.ts`: 184, 262 and 319 (a pet joins);
     - `rescue.ts`: 252, 508 (ternary), 536 and 538 (ternary); `upgrade-bench.ts`: 105, 108 (ternary), 111 and 115; `house-life.ts:113` (bed, ternary).
     After this, the `level` sound plays only in the level-up path (`main.ts:552`).
  4. Give `dz_navy` and `dz_aodai_man` combat sounds in `src/skill-sounds.ts`; the rocket launch plays `boom`.
  5. `promo/loudness.mjs`: the evaluation's OfflineAudioContext check (`.scratch/eval/audio-feel/loudness.mjs`) as a tool.
  6. Every stinger calls `audioGraph().duck('music', 6, its length)` from WP7. This lands the stinger half of the rule "stingers and the talk bar duck music 6 dB": from batch 3 it ducks the cottage radio, and from batch 4 the live score (WP13 plays on the same bus). WP14 lands the talk-bar half.
- **Files:** `src/sfx.ts`, `src/main.ts`, `src/ship-sequence.ts`, `src/colossus.ts`, `src/ctf.ts`, `src/dungeon.ts`, `src/rescue.ts`, `src/upgrade-bench.ts`, `src/house-life.ts`, `src/skill-sounds.ts`, `promo/loudness.mjs`, `tests/sound-mix.test.ts`, `tests/sound.test.ts`, `tests/w14-equip.test.ts`.
- **Hot files:** `src/main.ts`.
- **Tests:** `sound-mix.test.ts`: recorded peak gains keep the `LOUDNESS` order; `levelUp`, `rewardLarge`, `victory` and `equip` are 4 different recipes; each mode's fake host receives the named stinger at its former `level` site; a stinger ducks the music bus 6 dB and restores it (recording fake).
- **Acceptance:** `promo/loudness.mjs --check` (settled readings, the bands of `LOUDNESS` in `src/sfx.ts`): impacts -12 to -6 and UI -26 to -21, both as loud as before; each whoosh 6 to 10 dB under its hit and never under -26 (punch -17.3, was -30.8; cast -21.6, was -36.4); cues -24 to -10, with `ready` about -20 (was -25.5) and `powerReady`, the POWER READY moment, about -14.5. The numbers first written here (impacts -14 to -18, UI -26 to -30, punch and cast "were -36 to -47") were read on the first sound of a new audio context, where Chromium's compressor is still fading in and a short sound reads 5 to 12 dB too low; the order and the raises are unchanged (docs/SOUNDS.md, "The mix and the stingers"). A search with the pattern `tone\([^)]*'level'` (which also catches the ternaries) plus `sound('level')` finds only the level-up path (`main.ts:552`), and the review lists the stinger used at each of the 30 former sites. `w14-equip` green. English and Vietnamese starts +0.3 KB or less (`sfx.ts` loads before Start).
- **Speed:** 0 draw calls; 0 download bytes (synthesized); at most 0.3 KB gzip of code before Start (bytes-ledger allowance).
- **Refs:** P15, P14, O62.

### WP9. Hit feel 2.0
- **Result:** every blow lands with a tiny freeze and a shake that follows the hit. Chained hits climb in pitch. Mashing Attack chains smoothly. Settings has Screen shake (Off / Low / Full) and Flashes (On / Low).
- **Scope:**
  1. `src/hit-react.ts` stop table: own light hit 0.035 s, third chain hit 0.06, critical 0.08, power strike 0.09, boss break 0.11; pets and helpers 0; Battery saver 0 (today's rule).
  2. True freeze: at `main.ts:2468` (today `dt*=.1`) the simulation gets dt 0 during hit-stop while effects, shake and floating text run on real time; `world.ts:2237` passes the real dt to `fx.update`.
  3. `src/shake.ts`: a trauma model (offset = trauma² × smooth noise at about 18 Hz, biased along the blow, ±0.5° roll, decay 1.5/s at any frame rate); `fx.ts` `shake()`/`shakeOffset` (lines 314-324) delegate with the same API.
  4. `src/settings-extras.ts`: a registry `addSettingsRow(section, render, bind)` and `settingsExtrasHtml(section)` for `audio` and `comfort`; `settings()` (`main.ts:1157`) gains one call per section, so later features add rows with no `main.ts` edit. Rows registered here: Screen shake (Low by default under `prefers-reduced-motion`) and Flashes (Low halves the damage flash and the break flash), stored per device.
  5. `src/press-buffer.ts`: a press during `attackCooldown` (`main.ts:1939`) is kept 0.15 s and fires when the cooldown ends; a buffered press never triggers "use".
  6. Combo pitch ladder through WP7's detune (+1 semitone per own chain hit, cap +5, reset with the chain). A 3% zoom punch for 80 ms on power strike, finisher and boss break as a pure scale of `world.viewOffset` inside the frame (never `world.resize()`).
  7. Haptics behind the existing Vibration switch (`main.ts:493`): 12 ms on own critical and kill; [20,30,40] on boss break and Colossus kneel.
  8. Strings in `src/features-vi/comfort.ts`.
- **Files:** `src/hit-react.ts`, `src/shake.ts`, `src/press-buffer.ts`, `src/settings-extras.ts`, `src/fx.ts`, `src/camera-rig.ts`, `src/main.ts`, `src/world.ts`, `src/features-vi/comfort.ts`, `tests/hit-feel.test.ts`, `tests/settings-extras.test.ts`, `tests/frame-lifecycle.test.mjs`, `tests/keyboard-routing.test.mjs`, `tests/touch-routing.test.mjs`.
- **Hot files:** `src/main.ts`, `src/world.ts`.
- **Tests:** the stop table (own light 0.035, pet 0, saver 0, break 0.11); trauma 1 falls under 0.05 within 0.7 s with the same curve at 60 and 120 Hz; Off gives a zero offset; a press 0.1 s before the cooldown ends fires on the end frame, 0.3 s before is dropped; the ladder caps at +5 and resets; the zoom punch returns to 1 within 80 ms and never calls `resize` (spy); the registry renders rows in order, in English and Vietnamese.
- **Acceptance:**
  - Scripted 8 s swamp fight (WP3 row script): at least 90% of own hits freeze 30-110 ms (was 33 of 525 frames, criticals only).
  - Mashing Attack 10 times in 2 s gives at least 8 swings.
  - During a freeze, particles and shake move while simulated positions stay fixed (two frames 30 ms apart).
  - The shake row at 390x844 and 1600x900 has three 44 px choices; Off removes all camera shake.
  - Added freeze time (stop table × logged own hits) is 8% or less of the fight-sim King Bear careful run; the scripted fight peak draws and LayoutCount within +5%.
- **Speed:** 0 draw calls, 0 triangles; one noise sample per frame; at most 0.5 KB gzip before Start (registry, shake, buffer).
- **Refs:** I25, P25, O30.

### WP10. The hero moves smoothly
- **Result:** the explorer eases into and out of walking, fidgets when idle (looks at a pet or a ripe crop, stretches, taps a foot) and sits after 30 s. Level-ups and catches can play a cheer or a hold-up pose.
- **Scope:**
  1. `src/hero-motion.ts` (static, small): gait blend with `newGait`/`stepGait` from `src/walk-cycle.ts` (in 12/s, out 8/s), a 0.12 rad lean-in for 0.15 s on start, a settle on stop; called from `World.animatePlayer` (`src/world.ts:2411`) in place of the walk/idle switch at lines 2435-2436.
  2. An optional `world.heroExtras` hook set by `src/features/hero-idle.ts` (lazy): seeded idle fidgets after 6-10 s (look at the nearest creature, pet or ripe crop within 8 m; stretch; foot tap), sit after 30 s; any input cancels in one frame; fight, dash, slam, fishing, swim and flight poses keep priority.
  3. `world.playPose('cheer' | 'holdUp', seconds)`: 0.6-1.2 s pose clips on the existing rigid parts, for WP15.
  4. Battery saver: fidgets and poses off; the gait blend stays (it removes a snap).
  5. No springs on merged parts (ears and the head leaf are baked into the head, `src/assets.ts:403` `mergeEars` and `world.ts:919`, so swinging them would add draws) and no face this round (both round 2).
  6. `perfFlags.heroMotion` for a frozen A/B; new World fields guarded with `??` (tests build World with `Object.create`).
- **Files:** `src/hero-motion.ts`, `src/features/hero-idle.ts`, `src/world.ts`, `src/walk-cycle.ts`, `src/perf-flags.ts`, `tests/hero-motion.test.ts`.
- **Hot files:** `src/world.ts`.
- **Tests:** at 60 fps after a stop no leg changes more than 0.1 rad per frame and is under 0.05 rad within 0.45 s; the first fidget comes between 6 and 10 s; sit at 30 s; input cancels within one frame; deterministic per seed; no new objects after warm-up; Battery saver gives no fidget; `playPose` returns to idle.
- **Acceptance:** the evaluation's anim probe (`.scratch/eval/audio-feel/anim-probe.mjs`): largest per-frame leg change on stop 0.1 rad or less (was 0.545); 20 s idle shows at least 2 different fidgets (a 6-frame strip at 1600x900, one shot at 390x844); a cheer pose screenshot; a fight frame with `heroMotion` off and on differs in 0 pixels (`frozen-ab`); frozen gate exact on every row; English start +0.3 KB or less.
- **Speed:** 0 draw calls, 0 triangles, 0 programs; a few trig operations per frame for the local hero only.
- **Refs:** I26, P24, O7.

### WP11. A world that sounds alive: ambience and footsteps
- **Result:** birds and wind by day and crickets at night in the village; frogs in the swamp, dry wind in the canyon, rumble on the lava planet; water near ponds; a crackling fire in the cottage; footsteps that change on grass, path, sand, snow, wood and shallow water.
- **Scope:**
  1. `src/features/ambience.ts`: a pure planner `plan(place, localHour, nearPond, inFight, saver, touch)` returning layer gains, and a player that synthesizes layers from one shared looping noise buffer and AudioParam automation (no JS every frame). Layers: wind; birds by day (FM chirps every 2-7 s); crickets at night; pond water within 10 m; swamp frogs and insects; lava rumble; ocean waves; high wind on the sky planets; an owl on the Night planet; drips in the Vault; cottage room tone (fire crackle, clock tick) through `src/house-life.ts`. Duck 3 dB in fights; suspend when the tab is hidden; off on Battery saver.
  2. Budget: at most 4 live ambience voices on PC and 2 on touch devices, inside the shared counter (WP7).
  3. `src/features/footsteps.ts`: reads `world.walkClock` and `world.moving` (public fields) through `services.onFrame`; a step when the walk phase crosses 0 or π; surface from the planet, `zoneAt` (`src/environments.ts:82`) and indoors; 3-4 variants in round robin, never the same twice in a row, about -30 dBFS; none while swimming, flying or airborne.
  4. An Ambience volume row through WP9's registry (`audio` section), stored per device with `services.pref`; no change to `parseAudio`, `applyAudio` or `AudioSettings` (they are in the save and the server closure).
  5. Strings in `src/features-vi/ambience.ts`.
- **Files:** `src/features/ambience.ts`, `src/features/footsteps.ts`, `src/house-life.ts`, `src/features-vi/ambience.ts`, `tests/ambience.test.ts`, `tests/footsteps.test.ts`.
- **Hot files:** none.
- **Tests:** `ambience.test.ts`: home 10:00 gives birds and wind; home 23:00 gives crickets; the swamp gives frogs and insects; 3 dB lower in a fight; Battery saver gives nothing; chirp gaps within 2-7 s for a seed; every planet, home zone and indoor place has a bed; the voice budget per device holds; a save's audio settings parse the same as before. `footsteps.test.ts`: 2 steps per gait cycle, 0 when still, 0 while swimming or airborne; 6 surfaces; round robin never repeats.
- **Acceptance:** browser probe, Chomper Swamp idle 6 s: ambience bus peak at least -45 dBFS (was 0.000); 5 s of walking on the village path plays 8-12 steps, standing plays 0; idle live voices at most 4 on PC and 2 on a 390x844 touch profile; the slider at 0 is silent within 0.5 s; a hidden tab suspends; JS time for ambience at most 0.5 ms per second (logged); pre-Start bytes +0.1 KB or less (hooks only).
- **Speed:** 0 draw calls; 0 download bytes; at most 0.1 KB gzip of hook code before Start; off on Battery saver.
- **Refs:** I22, P14, O62, O29.

### WP12. Creatures with voices, warnings the player can hear
- **Result:** blobs squeak, birds chirp, boars grunt. A boss attack can be heard winding up before it lands. The Colossus has its own roar. Pets' hits sound softer than the player's. Below a quarter of health a heartbeat, a red edge and a heart icon warn.
- **Scope:**
  1. `src/features/creature-voices.ts`: a recipe per family field in `src/enemy-types.ts` (bubbly glide, FM chirp, noise grunt, wood knock, metal blip, ghost whoosh), pitch falling as size grows. Events: notice (on `creatureAlert`; `main.ts:1440` skips `tone('alert')` while the feature is mounted: a one-line guard), wind-up, hurt (at most 1 per 0.25 s per creature), death (family voice plus the poof at `main.ts:1537`).
  2. Wind-up: one optional callback `world.onTelegraph?.(kind, x, z, seconds)` where `world.ts` builds boss telegraphs (line 1808); `main.ts` forwards it as the `telegraph` event (one line). The voice rises over the telegraph's time (0.4-1.2 s) and peaks at impact.
  3. The Colossus roar gets its own recipe (`src/colossus.ts:281`, today the player's hurt voice). Pet and helper hits play 6 dB lower with a bite or bark timbre.
  4. Pan by screen x (±0.8), fall-off with distance from the camera target, silent beyond 30 m; all voices through the existing SoundGate (`MAX_VOICES` 14) and the shared touch budget (WP7).
  5. `src/features/low-health.ts` with its own CSS file: below 25% health (off above 30%) a soft heartbeat every 0.8 s at about -24 dBFS and a red edge that pulses with an opacity-only animation on its own layer; touch devices get a static edge with no pulse; a heart icon on the health bar so the warning is not colour only; off on Battery saver, at 0 health and indoors.
- **Files:** `src/features/creature-voices.ts`, `src/features/low-health.ts`, `src/features/low-health.css`, `src/colossus.ts`, `src/main.ts`, `src/world.ts`, `tests/creature-voices.test.ts`, `tests/low-health.test.ts`.
- **Hot files:** `src/main.ts` (2 lines), `src/world.ts` (1 hook).
- **Tests:** every family in `ENEMY_TYPES` has a voice; pitch falls with size; wind-up length equals the telegraph time; hurt rate limit; pan clamp; silent beyond 30 m; the touch budget holds. `low-health.test.ts`: 25%/30% hysteresis; off at 0 health, indoors and on Battery saver; no pulse on touch.
- **Acceptance:** King Bear fight on the mid-game save: every telegraph has a wind-up starting 0.4-0.8 s before impact (event log with times); three families give three different notice sounds (spectral centroids differ by 15% or more); the Colossus roar is not the hurt voice; pet hits 6 dB below own hits; low-health screenshots at 390x844 and 1600x900; the scripted fight at low health keeps RecalcStyle and Layout counts within +5% on the phone profile.
- **Speed:** 0 draw calls; 0 download bytes; at most 0.1 KB gzip of hook code before Start; one callback per telegraph; voices under the existing cap.
- **Refs:** I24, P14.

### WP13. Music in the world: a director with a live score
- **Result:** music plays in the village and each wild region has its own live-played tune. Drums join when something chases the player, a boss brings its own beat, and quiet stretches let the world breathe. Nothing downloads before play.
- **Scope:**
  1. `src/features/music-director.ts`: states village, wild per region, planet, danger (a chasing creature within 12 m, held 1.5 s), boss (`bossEngaged`), indoors (the radio), space, modes. No title state: the title stays quiet and sound starts after Start. Equal-power crossfades of 1.8 s on the music bus. Ducking: the score and the theme play only on the music bus, so the 6 dB ducks that WP8's stingers (batch 3) and WP14's talk bar (batch 5) call through WP7's `duck` apply to them; WP13 adds no duck code of its own.
  2. `src/features/music-score.ts`: a WebAudio port of `promo/music.py`'s marimba, pad and bass recipes; per region a key, tempo and seeded 8-bar progression, scheduled 0.2 s ahead about 4 times a second. The theme MP3 is requested no earlier than 20 s after the first played frame, in idle time (like `loadInsight`'s delay at `main.ts:605`, but later), so it stays outside the before-play download window, and it is cached on demand (WP7); the score plays first and the theme takes over on the next village arrival once cached.
  3. Rest in the village: the theme (or a score variation) once on arrival, then 60-120 s of ambience only, then a variation.
  4. `src/features/music-content.ts`: one entry per state (file or synth recipe, gain, key, tempo), so round 2's tracks only add entries.
  5. Budgets: touch devices get at most 6 score voices and no pad layer; below Sharp and on Battery saver, theme only; a hidden tab suspends. The slider label at `src/audio-settings.ts:56` changes from "The cottage radio and its tunes" to "Music in the world and the cottage radio" (label only; parsing unchanged); its Vietnamese entry at `src/locales/vi-econ.ts:30` is re-keyed in place.
  6. Render 4 clips of 20 s (village, forest, danger, boss) and a 2-minute village excerpt with OfflineAudioContext using the same score code, as WAV files in the kept owner folder `.scratch/owner/music/` with a local listen page. One flag sets the director to theme-only.
- **Files:** `src/features/music-director.ts`, `src/features/music-score.ts`, `src/features/music-content.ts`, `src/house-life.ts`, `src/audio-settings.ts`, `src/locales/vi-econ.ts` (line 30 holds the slider label), `src/features-vi/music.ts`, `promo/music-clips.mjs`, `tests/music-director.test.ts`, `tests/music-score.test.ts`.
- **Hot files:** `src/locales/vi-econ.ts` (one entry re-keyed in place).
- **Tests:** `music-director.test.ts`: the state table (village after Start; a wild zone gives its region; a chaser within 12 m adds danger; a boss event gives boss; an interior gives indoors; space); no title state; crossfade gains keep a sum of squares of 1 ± 0.01 over 1.8 s; no flapping inside the 1.5 s hold; every planet and mode has an entry; a duck call (as WP8's stingers make) lowers the score 6 dB. `music-score.test.ts`: nothing scheduled more than 0.25 s ahead; deterministic per seed; an offline render's loudness within ±2 LU of the theme and peaks at or below -1 dBFS; no 8-bar phrase more than twice in a row; at least 3 progressions per region in 3 minutes; the touch budget.
- **Acceptance:** after Start in the village the music bus is non-silent within 3 s (AnalyserNode); walking into Mushroom Forest crossfades within 2 s; the boss layer starts within 1 s of the boss bar; the theme MP3 is requested no earlier than 20 s after the first played frame; the before-play download and the install list grow only by WP13's share of the features chunks (allowance in section 7); no code writes `HTMLAudioElement.volume`; the clips and the listen page exist in `.scratch/owner/music/`.
- **Speed:** 0 draw calls; 0 download bytes before play; at most 0.1 KB gzip of hook code before Start; scheduler about 4 times a second; off on Battery saver.
- **Refs:** I23, P13, O62.

### WP14. Story scenes: talk bar, barks, portraits, premise and the opening
- **Result:** characters speak in a small bar with a real 3D portrait, 2-4 short lines and sometimes a choice. Play never stops, scenes wait out fights, the bar never covers a control, and every scene can be skipped. The welcome card says who the player is and why they are here, with a postcard from Pepper, who arrives with the first harvest (as she does today). After the card closes, the camera holds a view of all 9 beds until the player moves.
- **Scope:**
  1. `src/features/story.ts` mounts the runner in `src/story/scenes.ts`: data-driven scenes with an id, a trigger (story step start or done by index; events `harvest` with `first: true` from WP2, `rescue:<id>`, `friendHome:<id>`), conditions (a friend home or not, through `friendOf`; player level at most the chapter's end level + 3; Pepper speaks in person only when `friendOf(s, 'pepper')?.home`, and before that, on a new save before its first harvest or on a legacy save whose welcome was settled before she existed (`src/model.ts:902`), her lines show as a postcard: her portrait slot with a stamp, no model in the world), a speaker, 2-4 lines of 90 characters or fewer and an optional two-way choice that changes only the reply. One at a time, queued; waits while an aggro creature is within 12 m (`fightNear`, `src/hud-combat.ts:59`) or a dialog is open. A scene whose conditions fail is marked "unlocked" (watchable later) and never plays by itself.
  2. `src/screen-zones.css` names the zones every overlay uses: a top-edge ribbon zone, a top-band card zone, the talk-bar zone and a toast zone below the target frame. The talk bar (`src/story/talk-bar.css`): on portrait phones its bottom sits 8 px above the top of the control cluster, at most 120 px tall (2 lines), 16 px gutters; on landscape phones between the two thumb clusters; on PC at the bottom centre. 44 px Next and Skip; auto-advance after 4 s per line; it shrinks to a small speaker chip when a fight starts. While a line shows, the bar ducks music 6 dB through WP7's `duck`: the talk-bar half of the duck rule (WP8 lands the stinger half).
  3. A bark kind: one line with a portrait, no buttons, in the top-band zone, 2.5 s or less, at most one per 15 s, allowed during fights (used by WP17 tips and WP23 hints).
  4. `src/story/portraits.ts`: Pepper, Sprout, the farmer and the explorer drawn once with the friend models (`src/friend-view.ts`) through `portraitShot` (`src/hero-portrait.ts:104`), one per idle slot after about 3 s of play and never in a fight, and only from kits already loaded (friends use the hero's avatar builder, `src/world.ts:900`; Pepper's chibi body may not be loaded before she first appears, for example with AI neighbours off), so a portrait never fetches a kit; a coloured disc with an initial until then (never an emoji).
  5. The premise: `src/welcome-cards.ts` shows a two-line premise with Pepper's portrait slot (her postcard: she is on her way) instead of the emoji art (line 8); the single card and its planting tip stay. The card opens at once in `start()` (`main.ts:605`) and renders once with `t()`, before any lazy chunk can load, so its two English lines live in `welcome-cards.ts` and their Vietnamese in `src/locales/vi-first.ts`, which already holds the card's text and loads before the first screen through `vi-pack.ts`. Both fit WP14's 0.3 KB allowance on each start. `welcome-cards.ts` imports nothing from `src/features/`, `src/story/` or `src/features-vi/`: a static import would pull the lazy chunk into the start download.
  6. The opening sequence: Play → welcome card → close → a 1.5 s camera glide to a view of the 9 beds and the hero (`src/story/first-view.ts` through `world.cameraFocus`, plus a view-offset zoom where a phone needs it). The view then holds until the first input after the closing tap (a move, a tap on the world or a key); that input releases `cameraFocus`, and the camera eases back to the normal follow view within 0.5 s. Never on a loaded save. If the card closes before the feature has mounted, the glide starts at mount unless input came first. → a line from Pepper's postcard in the talk bar.
  7. Pepper's arrival: the first harvest by hand settles the welcome, which adds Pepper to the village (`home: true`) and grants the 10,000 energy (`src/friends.ts:69-83`, `src/actions.ts:98-100`; the server runs the same). `pepperGift` (`main.ts:602`) becomes her arrival scene, triggered by WP2's `harvest` event with `first: true`. The energy, its timing and the rule do not change. With Story scenes Off the scene does not play, and the player sees today's "Your first harvest!" dialog (the existing `pepperGift` text, kept as the fallback), so Pepper's arrival and thanks are never lost.
  8. A "Story scenes: On/Off" row through WP9's registry (`comfort`). Seen and unlocked ids per profile slot in localStorage.
  9. Strings: the two premise lines are in `welcome-cards.ts` and `vi-first.ts` (item 5). Every other WP14 string goes in `src/features-vi/story.ts`, loaded after Start; the runner waits for those phrases before its first line when the language is Vietnamese.
- **Files:** `src/features/story.ts`, `src/story/scenes.ts`, `src/story/talk-bar.css`, `src/story/portraits.ts`, `src/story/first-view.ts`, `src/screen-zones.css`, `src/welcome-cards.ts`, `src/welcome-cards.css`, `src/main.ts`, `src/features-vi/story.ts`, `src/locales/vi-first.ts`, `tests/story-scenes.test.ts`, `tests/welcome.test.ts`, `tests/hud-layout.test.mjs`, `tests/authority-state-controller.test.mjs`, `promo/journey.mjs`.
- **Hot files:** `src/main.ts`, `src/locales/vi-first.ts` (2 premise entries).
- **Tests:** `story-scenes.test.ts`: one scene at a time; waits in a fight and while a dialog is open; loading `save.json` and `save-late.json` auto-plays 0 scenes, `save-new.json` plays the premise; skip marks seen; an unlocked scene never auto-plays; auto-advance 4 s; barks are rate-limited and allowed in fights; Off shows nothing; a tap on the bar never reaches Attack; the store is keyed per profile slot; every line has a Vietnamese entry; the opening: after the closing tap the bed view holds until the first input, which returns the follow view within 0.5 s, and if the card closed before mount the glide starts at mount unless input came first; Pepper: on `save-new.json` no scene puts her in the world before the first harvest, the first hand harvest (which adds her) plays her arrival scene once, and a legacy save (welcome done, no Pepper) shows her lines as postcards; a talk-bar line ducks the music bus 6 dB and releases it. `welcome.test.ts`: the premise card has a portrait slot and keeps the planting tip and its buttons; with the language set to Vietnamese its first render is Vietnamese (its entries are in `vi-first.ts`); `welcome-cards.ts` imports nothing from `src/features/`, `src/story/` or `src/features-vi/`. `hud-layout` (browser): while a scene shows, `elementFromPoint` at the joystick centre, Attack and each skill button returns that control at 390x844, 844x390 (joystick on either side) and 1600x900.
- **Acceptance:** a new save shows the premise with Pepper's disc, replaced by her portrait once her kit is loaded, and no emoji art (390x844, 1600x900); in Vietnamese the premise card shows Vietnamese on its first render (390x844 screenshot); the first harvest plays Pepper's arrival scene in the bar (not a dialog), the bar 120 px tall or less; the overlap check passes on 3 viewports; a scene triggered during a fight waits; with no input after the closing tap, all 9 bed centres project inside ±0.95 of the screen 0.1 s and 1.0 s after the 1.5 s glide ends (timed from the glide's start, so inside the hold), on both viewports (today they are off screen on the phone), and the first input returns the follow view within 0.5 s; journey route `new`: a named character speaks within 60 s of Play; the idle-village layout row (WP3) within +5%.
- **Speed:** 0 draw calls; at most 4 portrait renders on the icon renderer, once, in idle time; before Start only the premise lines and the portrait slot: 0.3 KB or less on each start (English in `welcome-cards.ts`, Vietnamese in `vi-first.ts`); portraits never fetch a kit.
- **Cut line:** WP14 is one of the two largest M packages. If it passes 3 hours of agent time, the 3D portraits (item 4) move to WP21, the next package that needs them, and the coloured disc shows until then.
- **Refs:** I1, P3, P26, P29, O20, O25.

### WP15. Moments: one conductor, ribbons, rewards that collect themselves, a catch card
- **Result:** a level-up lights a gold pillar on the hero and slides a "Level 4!" ribbon along the top edge without pausing play; several quick level-ups merge into one. Story rewards collect themselves and fly from the tracker into the HUD. Big energy gains count up. The first catch, a new fish or a record shows a card while the hero holds the fish up.
- **Scope:**
  1. `src/features/moments.ts` with a beat conductor (`src/features/moments/conductor.ts`): one queue for ribbons, cards, scenes and stingers. Level-ups within 4 s merge into one ribbon (gained levels on the stat line) and one stinger; stingers start at least 0.6 s apart and a lower-priority stinger is dropped if a higher one played within 1 s; scenes wait for an active ribbon; ribbons wait while a scene's first line shows. The scene runner consults it (one line in `src/story/scenes.ts`).
  2. Ribbons in the top-edge zone: 1.3 s, never mid-screen, held while a dialog is open; kinds level, chapter, first win (from WP17's `firstWin` event) and medal (WP22).
  3. Level-up: the News entry stays; `world.fx.pillar?.()` (pooled, WP19), the ribbon with one stat line, `world.playPose?.('cheer')` (WP10) and the `levelUp` stinger (WP8).
  4. Auto-claim (`src/features/moments/story-flow.ts`): when the current story step is complete and calm (no aggro creature within 12 m, no dialog), `perform('claimQuest')` runs by itself, at most one claim per 2 s; `#quick-claim` (`main.ts:629`) stays only as the fallback if a claim is refused. Up to 8 DOM reward icons fly from the story tracker row (not from the hero, keeping the owner's gain rule in `src/gain-feed.ts`) to the energy plate and EXP bar; the next step shows at once.
  5. `src/tracker-label.ts`: the icon and the count chip first ("1/3"); the title may shorten, the count never; used where `main.ts` renders the trackers.
  6. The energy plate counts up over 0.8 s for gains of 1,000 or more (Pepper's 10,000).
  7. `src/features/moments/catch-card.ts` on `fishCatch` only for the first catch, a New! fish (not in `fishRecords`) or a Record! (bigger): a top-band card for 2 s with the fish icon (`src/item-icons.ts`), name, size, the badge, the catch jingle and `world.playPose?.('holdUp')`. Ordinary catches keep today's label.
  8. Strings in `src/features-vi/moments.ts`.
- **Files:** `src/features/moments.ts`, `src/features/moments/conductor.ts`, `src/features/moments/story-flow.ts`, `src/features/moments/catch-card.ts`, `src/features/moments/moments.css`, `src/tracker-label.ts`, `src/story/scenes.ts`, `src/main.ts`, `src/gain-feed.ts`, `src/features-vi/moments.ts`, `promo/journey.mjs`, `tests/conductor.test.ts`, `tests/story-flow.test.ts`, `tests/catch-card.test.ts`, `tests/tracker-label.test.ts`, `tests/start.test.ts`, `tests/hud-layout.test.mjs`.
- **Hot files:** `src/main.ts`.
- **Tests:** `conductor.test.ts`: merging within 4 s; stinger spacing and priority; ribbon FIFO and the dialog hold; scenes and ribbons never overlap; loading `save.json` and `save-late.json` (fake host, 60 s of HUD ticks) shows at most 1 ribbon in the first 60 s, because no backlog of level-ups or chapters replays on load. `story-flow.test.ts`: claims only when complete and calm, once per step, at most one per 2 s, falls back to the button on a refused claim. `catch-card.test.ts`: first, New! and Record! only. `tracker-label.test.ts`: the count survives any title length, also in Vietnamese. `start.test.ts:53-54` becomes a behaviour check.
- **Acceptance:** journey route `new`: 0 manual Collect taps through Chapter 1 (was 1 per step); levels 1-4 (reached in 68 s today) show 2 ribbons or fewer; `save.json` and `save-late.json` show at most 1 ribbon in the first 60 s; no two stingers start within 0.6 s; a ribbon and the talk bar never show in the same 0.5 s; the ribbon never overlaps the target frame or joystick (the `elementFromPoint` check in `tests/hud-layout.test.mjs` at 390x844, 844x390 and 1600x900); the first catch shows the card and the hold-up pose (screenshot); the phone tracker shows "0/3" with its title; frozen gate exact; the idle-village layout row (WP3) within +5%.
- **Speed:** the pillar is a pooled 1.2 s transient from WP19 (warmed at start, outside the standing rows); everything else is DOM; lazy; at most 0.3 KB before Start (`tracker-label.ts`).
- **Cut line:** WP15 is the other of the two largest M packages. If it passes 3 hours of agent time, the catch card (item 7, with its test and strings) moves to WP20, which already depends on WP15.
- **Refs:** P12, P27, I14, O56, O59.

### WP16. A HUD that reads at a glance: 11 px, 44 px, tokens
- **Result:** no tiny numbers, every phone button easy to hit, the PC keyboard guide no longer covering the garden, phone Help talking about taps, and tidy tabs and shop rows.
- **Scope:** follow the `game-ui-upgrade` skill's audit.
  1. `src/ui-tokens.css` (type scale 11, 12, 13, 15, 18, 24 px; warm palette; radii; outline; a shadow), used by new CSS this round (no mass refactor of the 597 colours).
  2. An 11-12 px floor with heavier weight for all HUD text: EXP 8.5 px (`src/hud-ours.css:321`), map caption 8.5 (`:311`), HP 9.5 (`src/hud-compact.css:102`), compass, key hints, dialog kickers, target HP and the rest of the 74 rules.
  3. 44 px hit areas for the 11 small phone targets (Backpack, Journal, News, More at 34x34; tracker folds; quick-eat pick; goals flag) through invisible `::after` areas in `src/tap-targets.css`, so icons keep their compact size (O58).
  4. Keys guide (`src/hud-keys.ts`, today folding after 120 key presses, line 10): stays open for a new player and folds itself after the first planting, 3 minutes of play or 30 game keys, whichever comes first; a hand choice stays final; the panel is narrowed or moved so it never covers the nearest bed.
  5. Help (`src/help-topics.ts`, `src/locales/vi-help-topics.ts`): touch wording on phones (no "Q throws petals... WASD"); drop the boss-blocking sentence in the Jump topic (line 28) while `BOSS_BLOCK_ON` is false.
  6. CSS fixes: tab arrows over labels, cut-off ranking tabs (`src/ranking.css`), the squeezed shop row (`src/menus.css`).
  7. Pay for the tokens: delete dead CSS (`src/welcome-cards.css` `.wc-2`, `.wc-3`, `.wc-dots` and the selectors in `.scratch/eval/code/css-unused.json`; about 3 KB raw, 0.8 KB gzip).
  8. Add the 11 px / 44 px audit to `promo/hud-probe.mjs` and `tests/hud-layout.test.mjs`; npm script `test:browser` (WP0's recorded command for the 8 browser files, with vite on its own port and a private cacheDir). It is a merge gate from WP0 on: 61 of 61 pass at the start, and the new audit rows add to that count. Turn `tests/hud-ours.test.ts:151-158` into behaviour checks.
- **Files:** `src/ui-tokens.css`, `src/hud-ours.css`, `src/hud-compact.css`, `src/hud-desk.css`, `src/tap-targets.css`, `src/menus.css`, `src/ranking.css`, `src/welcome-cards.css`, `src/hud-keys.ts`, `src/help-topics.ts`, `src/locales/vi-help-topics.ts`, `promo/hud-probe.mjs`, `tests/hud-layout.test.mjs`, `tests/hud-keys.test.ts`, `tests/help-topics.test.ts`, `tests/hud-ours.test.ts`, `package.json`, `docs/FIX-PLAN.md`.
- **Hot files:** `src/locales/vi-help-topics.ts`.
- **Tests:** `hud-keys.test.ts`: an empty store starts open; it folds after the first planting, after 3 minutes or after 30 keys; a hand choice is kept. `help-topics.test.ts`: touch Help has no PC key names; the Jump topic does not mention blocking while `BOSS_BLOCK_ON` is false, in both languages. `hud-layout` (browser): no visible text under 11 px and no phone target under 44 px.
- **Acceptance:** `hud-probe` on 390x844, 844x390 and 1600x900: 0 HUD text under 11 px and 0 touch targets under 44 px (was 74 rules and 11 buttons); first PC view of a new save: `elementFromPoint` at the nearest bed is the canvas; phone Help has no PC key names; before/after screenshots of the village HUD and dialogs on 3 viewports; pre-Start CSS gzip not larger than before; the idle-village layout row (WP3) within +5%.
- **Speed:** 0 draw calls; CSS and one small module; the dead CSS (about 0.8 KB gzip) pays for the tokens, so WP16 nets 0 and pays back nothing for the rest of the round.
- **Refs:** P27, P26, O4, O34, O58, O60, O61.

### WP17. The first fight and danger the player can read
- **Result:** in a fight Attack never opens the shop or the pen. The tutorial fight needs real presses, one creature winds up a ring to step out of, and the first kill bursts bigger and sends the `firstWin` event, which WP15 (batch 6) shows as a "First win!" ribbon. Walking toward Redrock Canyon at level 2, a red "Lv 7+ Dangerous" chip and a red border appear before anything attacks.
- **Scope:**
  1. `src/attack-intent.ts`: `IntentInput` gains `fight`; when true the result is always attack. `attackUses` (`main.ts:701`) sets it when an aggro creature is within 8 m of the hero, a living hostile is within 6 m, or the chapter-0 kill step is on with a live tutorial critter within 10 m. Otherwise Attack stays the use button (owner decision).
  2. `critterSpots` (`src/first-run.ts:117`): at least 7 m from every usable entity (shop, workshop, pen site, chest, market, cottage door, well) and 3.2 m from each other; fall back to a 12-15 m ring. During the kill step the critters show as "Gloomcap nibbler" (display only).
  3. `src/features/tutorial-fight.ts` (lazy), hooked through an optional check in `autoAttack` (`main.ts:1556`): during the kill step auto-swing waits for the first manual Attack press; a tracker tap still walks the hero there, and the Attack pad pulses with "Tap Attack!" / "Press F!". Critter 0 winds up a 1.0 s ring (an existing telegraph radius from the pool) and bites only if the hero stays inside; the bite never takes the hero below 60% health; "Step out of the ring!" the first time; after the second chain hit "One more for a finisher!" (barks if WP14 is mounted, otherwise `src/moment-tips.ts`). The first kill gets a bigger burst and emits `firstWin` (WP15 shows the ribbon; the gain feed keeps only the XP line).
  4. Danger: `zoneInfo` (`src/hud-combat.ts:76`) adds a red "Lv N+ Dangerous" chip with a warning icon when the zone is 3 or more levels above the player; `showZone` (`main.ts:719`) shows it for 2.8 s; a warm-to-red vertex-colour band 4 m wide at the canyon's border with the hub (`src/ground.ts`, home only) with the level as a word in the existing place-flag label (`src/place-flags-view.ts`), so the warning is never colour only.
  5. Strings: every new string (the danger chip, the nibbler name, the tutorial tips) goes in `src/features-vi/tutorial.ts`, loaded after Start through `addPhrases`. All of them show only after Start, so `vi-first.ts` and `vi-flags.ts` (both loaded before the first screen through `vi-pack.ts`) are not edited. Static code calls `t()` when it shows the text; if the chip ever shows before the lazy table has loaded, that one showing falls back to English.
- **Files:** `src/attack-intent.ts`, `src/first-run.ts`, `src/features/tutorial-fight.ts`, `src/moment-tips.ts`, `src/hud-combat.ts`, `src/place-flags-view.ts`, `src/ground.ts`, `src/main.ts`, `src/features-vi/tutorial.ts`, `tests/attack-intent.test.ts`, `tests/first-run.test.ts`, `tests/hud-combat.test.ts`, `tests/keyboard-routing.test.mjs`, `tests/touch-routing.test.mjs`, `promo/journey.mjs`.
- **Hot files:** `src/main.ts`. (`first-run.ts` is in the server closure: spots and a display name only, server tests unchanged.)
- **Tests:** `attack-intent.test.ts`: `fight=true` gives attack even when something is usable, fresh or long after a swing; `fight=false` keeps today's table; the regex check at lines 22-24 becomes a behaviour check. `first-run.test.ts`: on the real home layout no spot is within 7 m of a usable entity; auto-swing waits for the first press; the ring only on critter 0 during the step; the bite floor of 60%; tips fire once. `hud-combat.test.ts`: chip thresholds by level (line 68 reads the boss name from the table).
- **Acceptance:** journey runs of the fight step on phone and PC: 0 dialogs opened by Attack (was 6 on phone, about 75 on PC); at least 3 manual Attack presses (was 0); the hero takes damage only in the ring and stays at or above 60%; the first kill comes no more than 10 s later than today's 38-44 s; a level-2 hero walking east past the market sees the red chip before any canyon creature aggroes (today knocked out in 4.4 s); screenshots of the chip, band and ring at 390x844 and 1600x900; frozen gate exact.
- **Speed:** 0 draw calls (the ring reuses the telegraph pool, labels are DOM, the band is vertex colour); at most 0.3 KB before Start.
- **Refs:** P9, P10, P11, O23, O31, O37.

### WP18. Our own colours: warm wilds, vivid Candy, dark blue space
- **Result:** the forest and swamp look warm and inviting; Candy is a rich berry colour instead of washed-out pink; the Crocodile King stands out from its swamp; space is very dark blue with blue and teal clouds and round stars, and its key hints are no longer hidden.
- **Scope:**
  1. `src/planet-palette.ts`: our own ground, sky, water and kit tints per planet and home zone in one place. `src/ground.ts` (`RICH`, `HOME_RICH`, lines 43-49), `src/look.ts` `LOOKS` (line 25), `src/pond-view.ts` `LOOKS` (line 17) and `KIT_TINTS` (`world.ts:137`, one import) read from it. `src/content.ts` `PLANET_FACTS` stays unchanged.
  2. Rules enforced by tests: big-area colours with saturation at least 0.45 and lightness 0.35-0.65 (except accents and the Night planet); every boss at least 20 L* (lightness units) from its ground. Forest and swamp lift toward warm greens; Candy saturated berry and raspberry with one hot accent; Toy and Cloud more saturated; the croc a darker teal-olive with a warm belly (its colour field in `src/enemy-types.ts`; display data the server ignores).
  3. `src/space-view.ts`: background about #050a24 (line 58, today #120a2a); nebulae blue and teal only (line 68); round star sprites made at runtime (+1 program, compiled during the launch sequence with `compileAsyncSafe` on the space scene, as the cottage does; ledger entry "space +1 program"); asteroids `flatShading: false` with the same geometry detail (line 145). `#space-hint` (`src/style.css:1906`) moves above the Return home button.
  4. The Night planet stays as it is.
  5. Measure and record the hero's top-view contrast against home ground at the play camera (the fix is round 2's art pass).
- **Files:** `src/planet-palette.ts`, `src/ground.ts`, `src/look.ts`, `src/pond-view.ts`, `src/world.ts`, `src/space-view.ts`, `src/style.css`, `src/enemy-types.ts`, `promo/perf-ledger.json`, `tests/planet-palette.test.ts`, `tests/space.test.ts`.
- **Hot files:** `src/world.ts` (1 import).
- **Tests:** `planet-palette.test.ts`: saturation and lightness rules per planet and zone; L* contrast of every boss against its ground; Night unchanged. `space.test.ts`: background hue 210-240 with value 0.15 or less; no nebula hue between 280 and 330.
- **Acceptance:** Candy at 1600x900, 26 m from the pad: frame mean lightness 0.62 or less (was 0.74) and mean saturation 0.45 or more; space: under 2% of pixels in the magenta band 280-330 and the key hints fully visible at 390x844 and 1600x900; screenshot pairs for the 9 planets plus forest and swamp at 1600x900 and 4 pairs at 390x844, looked at, with Night still very dark blue; frozen gate exact at village, wild and canyon (programs included); the space row +1 program (ledger), draws and triangles exact.
- **Speed:** 0 draw calls, 0 triangles; colour values only, plus one runtime star sprite; at most 0.1 KB gzip of code before Start.
- **Refs:** P18, P22, O8, O46.

### WP19. Chunky toy effects
- **Result:** hits throw chunky stars, petals and puffs in a colour per skill instead of thin white chips; rings and slashes are thick and two-toned; dashes and landings kick up dust. Same pools, same draw calls.
- **Scope:**
  1. The glow pool in `src/fx.ts`: its material picks one of 4 sprites (soft dot, star, petal, puff) from a small runtime-drawn atlas by a per-instance attribute. The material is replaced once when the pool is created, so the program count stays the same.
  2. The chip pool: replace `IcosahedronGeometry(.5, 0)` (`fx.ts:53`) with one chunky bevelled star or rounded chip of at most twice the triangles; raise the `burst` default size from 0.12 (line 205).
  3. `src/fx-palette.ts`: a colour pair for each of the 4 skills, the power strike, the finisher, BREAK and each disguise-skill class (so the Sun knight no longer reads as a white egg); effect callers in `world.ts` and `main.ts` pass a kind key (one argument each).
  4. Rings and slash arcs (`fx.ts:241`, 269-270): thicker and two-toned (rim and core) with the existing ring and arc material settings.
  5. Dust puffs on dash and landing (glow pool, puff sprite; not on every footstep); the spark card's ink (`fx.ts:162`) uses WP6's ink.
  6. `fx.pillar(at, colour, seconds)`: a pooled open cylinder of 64 triangles or fewer with the arc material's settings, added to the start-up warm-up (`World.readyTrail`), for WP15.
- **Files:** `src/fx.ts`, `src/fx-palette.ts`, `src/power-fx.ts` (power strike and finisher looks), `src/skill-fx.ts` (skill visuals), `src/disguise-fx.ts` and `src/skill-visuals.ts` (disguise-skill looks, for a colour per disguise class), `src/world.ts`, `src/main.ts`, `tests/fx-effects.test.ts`. Read only: `src/disguise-profile.ts` (the disguise classes).
- **Hot files:** `src/main.ts`, `src/world.ts` (effect calls only).
- **Tests:** `fx-effects.test.ts`: pool sizes unchanged; the atlas has 4 sprites; the palette covers the 4 skills, strike, finisher, BREAK and every disguise class; the pillar returns to its pool; no allocation after warm-up.
- **Acceptance:** before/after contact sheets of every skill plus a hit, a critical and BREAK at 1600x900 and 390x844, looked at; `renderer.info.programs` unchanged on every row and programs created during the scripted fight not above the baseline; standing rows exact; the scripted fight peak draws and triangles within +5%; English and Vietnamese starts +0.4 KB or less (`fx.ts` and the effect files load before Start).
- **Speed:** 0 new draw calls, 0 new programs, same pool sizes; no full-screen pass; the same on phones; at most 0.4 KB gzip before Start (bytes-ledger allowance).
- **Refs:** O5, P28.

### WP20. Chapter 1: Pepper's Kitchen Garden
- **Result:** the first chapter has a motive: creatures keep raiding Pepper's kitchen garden. The player plants, sells, gears up, drives off the Gloomcap nibblers, fishes and practises, and the chapter ends with dinner at the cottage and a hook for tomorrow.
- **Scope:**
  1. `docs/story/CAST.md`: one page on how Pepper, Sprout, the farmer and the neighbours talk, so WP20 and WP21 write in one voice.
  2. `src/story/ch1.ts`: fresh original writing for the 9 chapter-0 steps (`STORY_STEPS` indices 0-8, `src/content.ts:4049-4057`, unchanged), each a scene or a one-line reason from Pepper; the chapter title "Pepper's Kitchen Garden" in the tracker; lines of 90 characters or fewer, warm and a little funny. The `cute_game_boat` "Homeward Book" draft is only a tone reference; nothing from the reference game. An early line mentions Sprout ("Sprout used to keep these beds..."). Pepper is home from the first harvest on (it brings her, WP14 item 7); lines for step 0 before that come from her postcard.
  3. The raid beat uses WP17's nibblers.
  4. The dinner finale when index 8 (level 5) is claimed: an 8 s moment that never blocks input. The cast is read from the save: Pepper (home since the first harvest on every new save), up to 3 AI neighbours (on by default, `src/bots.ts:47`; none when the device switched them off) and the player's pets walk to a spot by the cottage (`src/friend-idle.ts`). On a legacy save without Pepper (its welcome settled before she existed), the explorer reads her postcard instead, her dinner line waits for her homecoming (WP21), and the finale never waits for a missing model. Pepper speaks; a "Chapter 1 complete" ribbon (WP15); the chest rewards fly in; Pepper points at the travel rocket ("One day it will fly us to the stars"), and the hook: Sprout went to water the old treant's roots and has not come back. It waits if a fight is near.
  5. `promo/story-lines.mjs` writes every story line (English and Vietnamese) to one readable page in the kept folder `.scratch/owner/story/` for the reviewer and the owner.
  6. Strings in `src/features-vi/story-ch1.ts`; names through lookups; the name check runs before review.
- **Files:** `docs/story/CAST.md`, `src/story/ch1.ts`, `src/features-vi/story-ch1.ts`, `src/friend-idle.ts`, `promo/story-lines.mjs`, `promo/journey.mjs`, `tests/story-ch1.test.ts`.
- **Hot files:** none.
- **Tests:** indices 0-8 all have content; the finale triggers once on the index-8 claim and waits while a fight is near; every line 90 characters or fewer with a Vietnamese entry; no typed boss or friend names; Pepper's gift is still exactly 10,000 energy, once; the finale's cast comes from the save: with Pepper home she walks and speaks, on a legacy save without her it plays with the postcard, and with neighbours off it plays with Pepper and the pets.
- **Acceptance:** journey route `new`: a named character speaks within 60 s of Play; 9 of 9 steps show a reason; 0 dialogs added; dinner screenshots at 390x844 and 1600x900; Chapter 1 takes the scripted active player 8-14 minutes and the first reward still arrives under 40 s.
- **Speed:** 0 draw calls (existing friends, neighbours and village); text in a lazy chunk; at most 0.1 KB gzip of hook code before Start.
- **Refs:** I1, I2, O20, O23, O25.

### WP21. Chapter 2, the rescues and coming back
- **Result:** Chapter 2 sends the player into the wilds with a purpose. Freeing Sprout from the treant's cage and the farmer from the bear's cage plays a real rescue scene, and their arrival home gets its own scene. Every later step gets a one-line reason. Existing players get a one-time "What's new" card and can watch every scene they have passed.
- **Scope:**
  1. `src/story/ch2.ts` for indices 9-14, including the variant line when cooking is locked on Normal or Hard.
  2. Rescue scenes when the treant's and bear's cages open (the `rescue` event; `CAGES` in `src/friends-state.ts:51-55`) and homecoming scenes on `friendHome` (WP2's emit in the crew's `arrived` callback, `main.ts:1242`) for Sprout and the farmer. On a legacy save that frees Pepper from the robot's cage on the Toy planet (`src/friends.ts:56-57`; it applies only when she is not already a friend), her homecoming is the dinner line WP20 kept for it. `main.ts:1232` shows `RESCUE_LINES` (`src/friend-ui.ts:59`) only when scenes are Off (a one-line check). A chapter-end choice at level 8 (Plan a journey / Stay home today) changes only the reply.
  3. `src/story/step-why.ts`: one-line reasons for steps 15-28 and the endgame steps (`ENDGAME_STEPS`, `src/progression.ts:194`), shown in the Journal and the tracker detail. Step titles stay unchanged (saves, tests, Vietnamese keys).
  4. The Journal story tab gets "Story so far" with Watch buttons for seen and unlocked scenes (the quests renderer in `main.ts`).
  5. Coming back: on the first load after the update, the scenes of passed chapters and of friends already home are unlocked; a one-time "What's new" card on the welcome-back path (`src/welcome-back.ts`) with 3-4 lines (WP26 sets the final text to match what shipped); the welcome-back card shows Pepper's portrait (disc first) only when she is home, and her postcard otherwise. The "What's new" lines and their Vietnamese must be there when the card shows: they go in `src/locales/vi-first.ts` (loaded before the first screen) or the card awaits its chunk before it opens, never in a lazy chunk that is unloaded by then (`features-vi` is unloaded when the card shows).
  6. Strings in `src/features-vi/story-ch2.ts`; names through lookups; the name check runs before review.
- **Files:** `src/story/ch2.ts`, `src/story/step-why.ts`, `src/story/scenes.ts`, `src/main.ts`, `src/welcome-back.ts`, `src/welcome-back.css`, `src/features-vi/story-ch2.ts`, `promo/journey.mjs`, `tests/story-ch2.test.ts`, `tests/step-why.test.ts`, `tests/welcome.test.ts`.
- **Hot files:** `src/main.ts`.
- **Tests:** `story-ch2.test.ts`: indices 9-14 have content; each rescue scene fires once on a cage opening in a test world; the locked-kitchen variant; no typed names; "What's new" shows once; `friendHome:pepper` plays her homecoming once on a legacy save, and a new save never sends it (she joins at home with the first harvest); `save-late.json` unlocks every passed scene. `step-why.test.ts`: every story step 0-28 and every endgame step has a reason in English and Vietnamese.
- **Acceptance:** journey route `mid`: the farmer's rescue scene with a portrait after King Bear falls (screenshots at 390x844 and 1600x900); chapter-end choice buttons 44 px on the phone; 6 of 6 chapter-2 steps and 29 of 29 story steps have a reason; the late save shows "What's new" once and the Journal lists every unlocked scene.
- **Speed:** 0 draw calls; lazy text; portraits from WP14's cache; at most 0.1 KB gzip of hook code before Start.
- **Refs:** I1, O20, O21, P3.

### WP22. Boss fights as events: intro card, one big word, BREAK, medals
- **Result:** walking up to a boss shows its name and title with a sting before it attacks. Over a boss the player sees one clear word at a time (FINISHER, BREAK, RESIST), not five stacked. Breaking its guard freezes the moment with one big BREAK. Winning gives a bronze, silver or gold medal, and the best medal shows next time. Warning words sit on solid pills.
- **Scope:**
  1. `src/features/boss-moments.ts` on `bossApproach` (WP2): a top-band card (1.6 s or less, input never locked) with a portrait drawn from a model already loaded (within 45 m, one per idle slot; the crown icon as fallback; never fetches a kit), the name and an original title from `src/features/boss-titles.ts` (all 17 bosses; names through lookups) and a sting. The full card on the first meeting per profile, then at most once a day; other approaches show a small name chip on the boss bar. In solo play the boss's first attack waits for the card (an optional world hook). The card uses the top-band zone of `src/screen-zones.css` (WP14). (The PC camera move on approach left WP22 to keep it one M package; it is part of round 2's camera pass, with boss framing.)
  2. A callout lane in `fx.ts` `text()`: one word at a time above the target, at least 0.35 s apart, newest wins. Damage numbers in side lanes: bigger, heavier, outlined; own hits warm white, criticals orange ×1.3, pet and helper hits smaller and grey-blue; at most 3 stacked per target; at least 14 px on phones. The skill-name float over the hero (`main.ts:1692`, 1994) moves into the lane and shows for the first 3 uses of each skill per device, and always on touch devices (their buttons hide the names, `src/hud-ours.css:219`).
  3. BREAK on `bossBreak`: the 0.11 s freeze (WP9 table), "BREAK!" in the lane, the flash at half strength when Flashes is Low, a [20,30,40] ms vibration behind the Vibration switch. `src/boss-stagger.ts` is read only (server closure).
  4. `src/features/boss-medals.ts`: from first hit to kill, track time, hits taken and food eaten; gold at or under the target time with 3 hits or fewer and no food; silver up to 1.6× the time; otherwise bronze; target times from `promo/fight-sim.mts`; the best medal per profile slot in localStorage, shown on the boss bar; the victory ribbon through WP15.
  5. Solid warning pills with contrast at least 4.5:1: Colossus attack names (`src/colossus.css`), the zone banner (`src/style.css`) and the Flag Rush "Go!" banner (`src/ctf.css`).
  6. Strings in `src/features-vi/boss.ts`.
- **Files:** `src/features/boss-moments.ts`, `src/features/boss-titles.ts`, `src/features/boss-medals.ts`, `src/features/boss-moments.css`, `src/screen-zones.css`, `src/fx.ts`, `src/feel-rules.ts`, `src/main.ts`, `src/world.ts`, `src/colossus.css`, `src/ctf.css`, `src/style.css`, `src/features-vi/boss.ts`, `promo/journey.mjs`, `tests/boss-moments.test.ts`, `tests/boss-medals.test.ts`, `tests/callout-lane.test.ts`, `tests/hud-layout.test.mjs`.
- **Hot files:** `src/main.ts`, `src/world.ts` (1 hook).
- **Tests:** `boss-moments.test.ts`: the card fires on approach, the full card once per profile then daily, a chip otherwise; the first-attack hold only in solo; BREAK only on the change to broken; 17 of 17 titles in both languages. `callout-lane.test.ts`: two callouts within 0.35 s show one after the other; at most one lane entry alive; damage-number stack cap 3; the skill-name rule. `boss-medals.test.ts`: the medal table; food or more than 3 hits caps at silver; the best medal is never lowered. `hud-layout` (browser): while the intro card, the name chip and a callout show, `elementFromPoint` at the joystick centre, Attack, each skill button and the target frame returns that control at 390x844, 844x390 (joystick on either side) and 1600x900.
- **Acceptance:** journey route `mid`: the King Bear card appears before the bear attacks and the hero takes 0 damage during the card (1600x900, 390x844, 844x390); the overlap check passes on the 3 viewports; a late-save bear fight shows at most one callout word over the boss at any time (was 5 within 150 px); a break shows the freeze and one "BREAK!"; victory shows the medal ribbon and the next fight's boss bar shows the best medal; pill contrast at least 4.5:1; King Bear rows within +5%; the before-play download and the install list grow only by WP22's share of the features chunks (no new fetch: portraits only from loaded models); English and Vietnamese starts +0.2 KB or less (the callout lane in `fx.ts`; everything else is lazy).
- **Speed:** 0 draw calls; portraits only from loaded models; lazy except the callout lane; at most 0.2 KB gzip before Start (bytes-ledger allowance).
- **Refs:** I4, I5, P28, O35.

### WP23. King Bear and the old treant: a signature move and a weakness (solo)
- **Result:** King Bear and the old treant each have a move of their own with warning marks that chase the player, a weakness the player's moves can open (on the ground, no air combat needed) and a change of pace at 60% and 30% health. They guard the cages of the farmer and Sprout, and the caged friend calls out the weakness.
- **Scope:** follows the owner's FIGHT-PLAN order: moves first, then a weakness opened by a move.
  1. `src/features/boss-signatures.ts` (lazy) sets an optional `world.bossBrain` hook consulted at the boss skill pick (`world.ts:1805`) only when there is no network role; until it arrives the classic table runs. Its own `SoloSkill` type and tables; `BossSkill`, `BOSS_WINDUPS` and `BOSS_CALLOUTS` (`src/boss-patterns.ts`), `boss-stagger.ts`, `boss-body.ts`, `combat.ts` and `server/combat-authority.mjs` are not edited (server closure).
  2. Signatures with existing circle telegraphs (radii already pooled and warmed when the boss engages; nothing created mid-fight) and WP12's wind-up voice: the bear's three honey-slam marks chase the hero and freeze 0.4 s before impact; the treant sends a line of root rings toward the hero, then a ring.
  3. Weaknesses, each with a ground way that works with air combat off: the bear: dash (Breeze Step) through its charge, or jump it, for a 3 s stun (an air dive is a faster option); the treant: Root Quake, or any hit during its 2 s rooted pause, adds 50% stagger. After the first phase change or 20 s, the caged friend barks the hint (WP14; the farmer by the bear, Sprout by the treant).
  4. Phases at 60% and 30%: the signature comes more often; solo health for these two bosses 25% lower; `BOSS_BLOCK_ON` stays false.
  5. `promo/fight-sim.mts`: careless and skilled scripts for these two bosses, run with air combat on and off.
  6. Strings in `src/features-vi/signatures.ts`.
- **Files:** `src/features/boss-signatures.ts`, `src/world.ts`, `promo/fight-sim.mts`, `src/features-vi/signatures.ts`, `tests/boss-signatures.test.ts`.
- **Hot files:** `src/world.ts` (1 hook).
- **Tests:** each boss has a signature with a telegraph of 0.8 s or more; chasing marks stop 0.4 s before impact; weakness detection from event sequences, with air combat on and off; phase changes fire once at 60% and 30%; a networked world uses the classic table; no new ring radius is created mid-fight. Existing `boss-patterns`, `boss-fight` and `combat-authority` tests stay green with no edit.
- **Acceptance:** fight-sim at equal level, air combat on and off: the careful script beats each boss in 35-60 s; the careless script takes at least 3× the careful script's damage and needs food (today a near-free win); using the weakness cuts the fight by at least 20%; chasing-mark screenshots at 1600x900 and 390x844; King Bear and treant rows (WP3) within +5% (at most +9 draws during a signature, recorded); programs created during the fight not above the baseline; pre-Start bytes +0.1 KB or less (the hook only).
- **Speed:** existing pooled telegraph discs only; lazy module; at most 0.1 KB gzip of hook code before Start.
- **Refs:** O32, P7, P6, O30, O21.

### WP24. Fair rewards and true words: Ember Well, bounty cap, text fixes
- **Result:** waking, soothing or letting the Colossus sleep now matter, and the well shows the trade-off before the player chooses. Bounties never send a beginner after a creature far above them. "1 days" reads "1 day in a row", and News tells the truth about the Greenhouse.
- **Scope:**
  1. `grantColossusReward` (`src/colossus-rewards.ts:20`) gains a last parameter `lid: 'wild' | 'soothed' = 'wild'` (`ColossusLid` is `'wild' | 'soothed' | 'asleep'`, `src/colossus-sleep.ts:14`; asleep never fights), so the server call (`server/combat-authority.mjs:210`) is unchanged. Use the literal union or an `import type`: `colossus-sleep.ts` reads localStorage at load and must not join the server closure. Soothed: 20% XP, no crown roll, plus 2 `seed_fire` (an existing item). (Online change 1: a defaulted parameter.)
  2. Who gets the soothed rate: an explicit "Soothe it" pick. Automatic is the default pick `'auto'`, not a lid: `lidFor` (`src/colossus-sleep.ts:30-33`) gives asleep below level 20 and soothed from 20. For the first Automatic kill the caller (`src/colossus.ts:398`) passes `'wild'`, so it pays in full; the level-20 News entry and the well say "Soothed, it pays a fifth of the XP plus fire seeds; wake it at the Ember Well for the full reward"; later Automatic kills pay the soothed rate. (Decision row in section 9; one line to make Automatic always pay in full.)
  3. Asleep: once per local day per profile slot at the well, 1 manure (shown as Fertilizer) through the same solo state-change path as the Colossus reward (`src/colossus.ts:398`), inside the bag limit.
  4. `src/colossus-well-ui.ts` (client only, loaded when the well opens): `wellChoicesHtml()` lists all 4 choices (Automatic first) with their rewards and the pet rule; the well dialog (`main.ts:994`) appends it in one line. `colossus.ts:400` floats the soothed XP number.
  5. Bounty cap (online change 2, a rule both sides run): `src/progression.ts` (around line 183) offers bounties only up to the player's level +1; the rotation stays deterministic.
  6. "1 consecutive days" becomes "1 day in a row" / "{count} days in a row" (`src/welcome-back.ts:79`, `src/progression.ts:317`; the Vietnamese entry for "{count} consecutive days" in `src/locales/vi-gameplay.ts:40` is re-keyed in place).
  7. `public/news.json`: the Greenhouse becomes "Planned" (English and Vietnamese).
  8. Strings: the new well, soothed-reward and Fertilizer text shows only after Start, so its Vietnamese goes in `src/features-vi/colossus-well.ts`, loaded lazily through `addPhrases`. `vi-colossus.ts` (loaded before the first screen through `vi-catalog.ts`) is not edited.
- **Files:** `src/colossus-rewards.ts`, `src/colossus.ts`, `src/colossus-well-ui.ts`, `src/main.ts`, `src/progression.ts`, `src/welcome-back.ts`, `src/features-vi/colossus-well.ts`, `src/locales/vi-gameplay.ts`, `src/locales/vi-news.ts`, `public/news.json`, `tests/colossus.test.ts`, `tests/colossus-sleep.test.ts`, `tests/progression.test.ts`, `tests/welcome.test.ts`.
- **Hot files:** `src/main.ts` (1 line), `src/locales/vi-news.ts`, `src/locales/vi-gameplay.ts` (one entry re-keyed in place); server closure: `colossus-rewards.ts`, `progression.ts`.
- **Tests:** a soothed kill gives 6,000 XP at `COLOSSUS_STATS.xp` 30,000 and no crown roll; wild (the default) unchanged; Automatic: first kill 30,000, second 6,000; the asleep gift works once per local day, also with the clock-shift preload; `wellChoicesHtml` lists 4 choices in English and Vietnamese; over 200 seeds no bounty above level +1 for levels 1-10 and at level 30 every bounty is still offered; "1 day" singular; `colossus-server`, `combat-authority` and `w15-server` stay green with no edit.
- **Acceptance:** an explicit soothed solo kill gives 6,000 XP (was 30,000); the first Automatic kill gives 30,000; the well dialog rendered in node at 390 px lists the 4 choices with rewards; server tests unchanged and green; WP24's own test files (`colossus`, `colossus-sleep`, `progression`, `welcome`) pass with the clock-shift preload (`node --test --import ./tests/support/clock-shift.mjs`) at +45 and +400 days. The full `test:timeshift` runs the whole suite, so it is the integrator's check after the merge; this keeps WP24 light.
- **Speed:** 0 draw calls; rules and text; the well UI and its Vietnamese load on demand; pre-Start bytes +0.1 KB or less (the rule changes).
- **Refs:** P8, P11, O43.

### WP25. Our own names and an original title
- **Result:** the four starting skills and seventeen bosses carry Zoo Garden's own names in English and Vietnamese. The farmer is no longer a second Clover. The title has our own wordmark and a tagline that says what the game is about, and new players get an original suggested name.
- **Scope:**
  1. Names, ids unchanged (saves are safe); every name passes the name check and gets original Vietnamese. Skills (`src/combat.ts`, `src/moves.ts:48`, `src/hud-icons.ts:68` where `SKILL_ART` is keyed by name, `main.ts:319`): Petal Gale (the thrown petal Lob in the five-button fight) becomes a name that fits a thrown petal arc (default "Blossom Lob"); Breeze Step → Dandelion Dash; Root Quake → Beanstalk Stomp; Paw Storm → Bramble Flurry. Bosses (`src/enemy-types.ts` display names, `src/boss-pet-content.ts`): bear Old Honeypaw, treant Mossbeard, croc Swampjaw, mushking Baron Toadstool, cake Sir Sprinkleton, gingerbread Crumblebrick, jellyqueen Queen Wobbleton, yeti Big Flurry, mammoth Tusker Frostmane, frostowl Hoarfeather, golem Cinderhulk, dragon Scorchwing, robot Gearbox, gorilla Thunderknuckle, leviathan Deepcoil, phoenix Stormplume, shadowlord The Gloomwarden. The farmer: `FRIENDS.clover.name` (`src/friends-state.ts:46`) becomes Barley; farmer lines in `friend-ui.ts`, `friend-lines.ts`, `friend-lines-more.ts`, `house-talk.ts`, `vi-friends.ts`; the bare "Clover" entry in `src/locales/vi-house.ts:7` is re-keyed to the new name (after checking that no other caller translates the bare word). Planet names wait for round 3 (with the planet themes, so they change once).
  2. Title (`src/title-card.ts`): a CSS-only wordmark with the existing font, a toy outline and shadow (no image, 0.3 KB gzip or less); a tagline that states the premise; our own order of elements; the name field prefilled from `src/name-ideas.ts` (about 40 original names of 20 characters or fewer, never Clover) with a 44 px dice; free looks from `src/looks.ts` next to the colours. `newGame()`'s default (`src/model.ts:218`, server closure) stays. The `#name-input` and first `button.primary` contracts stay.
  3. Vietnamese: replace the keys of renamed strings in `src/locales/vi-catalog.ts`; title strings in their existing locale file. Tests that pin old names read them from the tables instead.
  4. Rescue Call no longer lists "Clover" twice.
- **Files:** `src/combat.ts`, `src/moves.ts`, `src/hud-icons.ts`, `src/main.ts`, `src/help-topics.ts` (its player text names Root Quake), `src/enemy-types.ts`, `src/boss-pet-content.ts`, `src/friends-state.ts`, `src/friend-ui.ts`, `src/friend-lines.ts`, `src/friend-lines-more.ts`, `src/house-talk.ts`, `src/name-ideas.ts`, `src/title-card.ts`, `src/looks.ts`, `src/locales/vi-catalog.ts`, `src/locales/vi-friends.ts`, `src/locales/vi-five.ts` (the Vietnamese of that help line), `src/locales/vi-house.ts`, `tests/own-names.test.ts`, `tests/welcome.test.ts`, `tests/hud-combat.test.ts`, `tests/fixtures/closure-allow.json`. Tests that hard-code old names (each re-read; a test that looks a name up by display text switches to a table lookup): `tests/air-switch.test.ts`, `tests/controls.test.ts`, `tests/elite-roles.test.ts`, `tests/five-rules.test.ts`, `tests/hud-ours.test.ts`, `tests/jump-rules.test.ts`, `tests/model.test.ts`, `tests/moves.test.ts`, `tests/rescue.test.ts`, `tests/static-host.test.mjs`, `tests/vi-panels.test.mjs`, `tests/weapon-pair.test.ts` (`row('Shadow Lord')`), `tests/fixtures/vi-snapshot.json`.
- **Hot files:** `src/main.ts`, `src/combat.ts`, `src/locales/vi-catalog.ts`, `src/locales/vi-friends.ts`, `src/locales/vi-five.ts`, `src/locales/vi-house.ts`. (`combat.ts`, `enemy-types.ts`, `friends-state.ts` and `boss-pet-content.ts` are in the server closure: display names only.)
- **Tests:** `own-names.test.ts` (on the scan allow list): none of the old skill or boss names in `ENEMY_TYPES`, the skill and move tables or `FRIENDS`, in both languages through `t()`; every new name has a Vietnamese entry; name ideas never Clover, 20 characters or fewer, the dice never repeats the current name; a version-1 save fixture loads with the same items, friends and story index. `welcome.test.ts`: `titleCardHtml` keeps `#name-input` and the first `button.primary` and lists only free looks.
- **Acceptance:** a search finds 0 old skill or boss names in player text in `src/` (outside comments and migration code); `npm test` green including `catalog-locale`, `vi-panels` and `main-locale`; screenshots of the skill tray, a boss bar and the title at 390x844, 844x390 and 1600x900 in English and Vietnamese; a new save started without typing a name is not called Clover; English and Vietnamese starts +0.5 KB or less.
- **Speed:** 0 draw calls; text and CSS.
- **Refs:** O1, O3, O53, P3, P21, I21.

### WP26. Cleanup A: mechanical cleanup, text drift and the round report
- **Result:** nothing new to see, but tidier code, true docs, a News entry for the round, the "after" show reel and a short report for the owner.
- **Scope:** do the safe mechanical list in section 8, each item re-searched first (round-1 packages may now use it) and checked with `tsc`, `npm test` and `build:pages`: dead exports and unused types; unused locals, then `noUnusedLocals: true`; one `escapeHtml` in `src/html.ts` (golden test first; imports nothing) for the 19 files with their own `esc` today (`main.ts`, `auto-plant-ui.ts`, `bag-slots-ui.ts`, `ctf.ts`, `dungeon.ts`, `dye-ui.ts`, `friend-looks-ui.ts`, `friend-ui.ts`, `house-life.ts`, `house-ui.ts`, `i18n.ts`, `item-power.ts`, `look-shop.ts`, `look-tiles.ts`, `news-board.ts`, `pet-card.ts`, `rescue.ts`, `tester.ts`, `upgrade-bench.ts`); one `dist2D` in `src/geom.ts` (golden test first; imports nothing, so it is safe for the server closure). `geom.ts` joins the closure, because `colossus-patterns.ts`, `ctf-rules.ts` and `friends.ts` are server-reached; so does `html.ts` if the `esc` copies in the server-reached `i18n.ts`, `item-power.ts` or `pet-card.ts` move to it. WP26 regenerates `docs/server-closure.txt` with `promo/server-closure.mjs` (97 or 98 modules) and notes the reason in `tests/fixtures/closure-allow.json`, so WP1's architecture-fitness test stays green; stale root docs to `docs/history/` with README links fixed; the `PERFORMANCE_REVIEW.md` title and move; the two `PERF-ANALYSIS.md` links; `?colossus=1` (`main.ts:2524`) only with the tester code in solo play; wave-named test files renamed with `git mv`; FIX-PLAN 5.1 and 6.3 marked done; the "What's new" lines set to what shipped; a dated round-1 entry in `public/news.json` (English and Vietnamese through `vi-news.ts`); the "after" reel with `promo/reel.mjs` into `.scratch/owner/reel/after/`; `docs/AAA-ROUND1.md` with what shipped per package, before/after numbers (gate rows, pre-Start bytes, the before-play download and the install list, loudness, journey timeline, scene count), what moved to round 2 and the paths of the owner's deliverables.
- **Files:** `tsconfig.json`, `src/html.ts`, `src/geom.ts`, `src/main.ts`, `src/world.ts`, `src/scene-matrices.ts`, `src/boss-body.ts`, `src/guide.ts`, `src/viewport.ts`, `src/colossus-patterns.ts`, `src/ctf-ai.ts`, `src/ctf-rules.ts`, `src/dungeon-patterns.ts`, `src/friends.ts`, `src/rescue-ai.ts`, `src/rescue-rules.ts`, `src/auto-plant-ui.ts`, `src/bag-slots-ui.ts`, `src/ctf.ts`, `src/dungeon.ts`, `src/dye-ui.ts`, `src/friend-looks-ui.ts`, `src/friend-ui.ts`, `src/house-life.ts`, `src/house-ui.ts`, `src/i18n.ts`, `src/item-power.ts`, `src/look-shop.ts`, `src/look-tiles.ts`, `src/news-board.ts`, `src/pet-card.ts`, `src/rescue.ts`, `src/tester.ts`, `src/upgrade-bench.ts`, `src/features/story.ts`, `README.md`, `docs/history/`, `docs/FIX-PLAN.md`, `docs/server-closure.txt`, `tests/fixtures/closure-allow.json`, `public/news.json`, `src/locales/vi-news.ts`, `docs/AAA-ROUND1.md`, `tests/html.test.ts`, `tests/geom.test.ts`.
- **Hot files:** `src/main.ts`, `src/world.ts` (unused locals and the `esc` swap only); `src/locales/vi-news.ts` (the round's News entry); server closure, with identical results: `src/colossus-patterns.ts`, `src/ctf-rules.ts`, `src/friends.ts` (`dist2D`) and `src/i18n.ts`, `src/item-power.ts`, `src/pet-card.ts` (`esc`).
- **Tests:** golden tests for `escapeHtml` and `dist2D` before the swap; the full suite with the same test count after the renames; `test:timeshift`; `tsc` with `noUnusedLocals`; `build:pages`.
- **Acceptance:** `tsc` 0 errors with `noUnusedLocals: true` (false today at `tsconfig.json:6`); `npm test` 0 failures; `test:timeshift` green; `build:pages` succeeds; exactly one `escapeHtml` and one `dist2D` in `src`; dead exports 22 → 0; architecture-fitness green with the updated closure list; frozen gate exact; the report and the after reel exist.
- **Speed:** about 0 KB expected before Start: Rollup already drops unused exports from the build, so this cleanup tidies the code, not the download (anything it saves is a bonus); 0 draw-call change.
- **Refs:** O28, P1.

### WP27. Cleanup B: careful refactors and the byte payback
- **Result:** nothing new to see. The first download ends at or below where the round started, and `main.ts` is smaller than before the round.
- **Scope:**
  1. Byte payback (the round's only real payback): move rarely used dialog renderers out of `main.ts` into lazy modules loaded on first open, built on `GameServices`, in this order, and stop as soon as the English and Vietnamese pre-Start gzip are at or below the WP0 baseline. The list is sized for the worst case, the 5.5 KB sum of the round's allowances: it can free about 7 KB. First `settings()` (`main.ts:1157`, the largest one-line function at about 6 KB raw), `testerMore` (1147), `help` (1160) and `map` (1143), about 2.5 KB gzip together; then, only if still needed, `forgeMenu` (1067), `decorations` (1072), `crafting` (1062), `storage` (976) and `market` (974), about 2.5 KB more; then `cooking` (996), `upgrades` (984), `deathDialog` (2000) and `feedConfirm` (1004), about 1.2 KB more; last the Journal renderer `quests` (941, after WP21's "Story so far"), about 1.1 KB. Measure each candidate's real gzip saving first and record the list in the merge log; a dialog that cannot move with identical HTML is replaced by the next largest one. The round ends at or below the baseline before Start either way.
  2. The three mode bridges (`main.ts:2519-2547`): host objects for `initDungeon`, `initCtf` and `initRescue` built from the one `GameServices` object.
  3. Behaviour checks instead of `main.ts` source regexes in at most 6 named tests this round touched (`power-rules.test.ts:172`, `welcome.test.ts:56`, `start.test.ts:53-54` if still a regex, `hud-ours.test.ts:151-158` if still a regex, plus up to 2 more named in the review).
  4. Lower the fitness budgets to the final sizes of `main.ts` and `world.ts`.
  5. Final `perf:gate`, `perf:bytes`, `perf:download` and `test:timeshift`; then the integrator merges `aaa/staging` → `develop` → `main` and checks the Pages deploy.
- **Files:** `src/main.ts`, `src/game-services.ts`, `src/settings-dialog.ts`, `src/tester-panel.ts`, `src/help-dialog.ts`, `src/map-dialog.ts`, and only if needed `src/forge-dialog.ts`, `src/decor-dialog.ts`, `src/craft-dialog.ts`, `src/storage-dialog.ts`, `src/market-dialog.ts`, `src/cook-dialog.ts`, `src/upgrade-dialog.ts`, `src/death-dialog.ts`, `src/feed-dialog.ts`, `src/journal-dialog.ts`, `tests/architecture-fitness.test.mjs`, `tests/power-rules.test.ts`, `tests/welcome.test.ts`, `tests/start.test.ts`, `tests/hud-ours.test.ts`, `tests/main-locale.test.mjs`, `tests/vi-panels.test.mjs`.
- **Hot files:** `src/main.ts`.
- **Tests:** each moved dialog renders the same HTML before and after in English and Vietnamese (golden through the WP1 harness); each mode host has the same keys as before (snapshot); the fitness budgets at the new sizes.
- **Acceptance:** English and Vietnamese pre-Start gzip at or below the WP0 baseline; the before-play download up to Start at or below the WP3 baseline and after Start within the lazy-chunk allowances; the install list at or below its section 7 limit (the baseline minus WP7's drop, plus the running pre-Start total, `public/news.json` growth and the chunk allowances, recomputed by `perf:bytes` from the ledger; the moved code stays in the list, so the pre-Start drop does not lower it); Settings opens within 150 ms on first open (logged) with the same rows; frozen gate exact; `npm test` 0 failures; `main.ts` smaller than 344,830 bytes.
- **Speed:** pre-Start bytes go down by at least the round's measured growth (at most 5.5 KB gzip if every allowance in section 7 is used up; the named list frees about 7 KB); the moved code stays in the install list as new chunks (chunk overhead within its 1.5 KB allowance); each moved dialog costs one small chunk fetch on its first open; 0 draw-call change.
- **Refs:** none (code health).

---

## 6. Batches, order and hot files

**How round 1 runs.** A staging branch `aaa/staging` from `develop`. Each package is built by one agent in its own git worktree outside the repo (`node_modules` as a junction to the main checkout, a private vite `cacheDir`, its own dev-server port), checked by an independent reviewer agent, then merged one at a time into staging. Never `git stash` (one stash list for all worktrees); servers are stopped by exact PID; every wait has a timeout; scratch files stay in the package's ignored `.scratch/`. A failing fix stops after 4 corrections and goes back to the plan. Builders branch from staging at the start of their batch.

**Heavy slots.** At most 3 heavy jobs run at once, and the integrator's merge checks count as one. Builders write code freely but queue their heavy steps (browser, Blender, full suite) behind a 3-slot lock. After each merge the integrator runs `tsc`, `npm test`, `perf:bytes` (English and Vietnamese against the running bytes total, plus the install-list row) and the 8 browser suites (the command in WP0, later `npm run test:browser`; about 16 minutes; a red suite blocks the next merge); the full `test:timeshift` after WP24, WP26 and WP27; the frozen gate only after rendering packages (WP6, WP9, WP10, WP12, WP14, WP15, WP17, WP18, WP19, WP22, WP23); `perf:download` after WP7, WP13, WP14, WP22 and WP27.

**Batches** (dependencies always land in an earlier batch; the merge order inside a batch is stated in its row; where no order is stated, as in batch 8, the packages share no source file and any order works)

| Batch | Packages (heavy / light) | Why these together |
|---|---|---|
| 0 | WP0 | Runs alone: the date test blocks every deploy and every later package is gated by its tool. |
| 1 | WP1, WP3, WP4 / WP5 | Tools, tests and docs only: no hot file. The "before" numbers (WP3), the before journey and reel (WP4) must be taken before any game change lands. WP5 is documentation. WP1, WP3 and WP4 all add npm scripts to `package.json`, and WP4's `mid` route reads WP3's `promo/save-mid.json`. Merge WP1, WP3, WP4, then WP5; each keeps every script when it rebases, and WP4 takes its `mid` baseline after rebasing onto WP3. |
| 2 | WP2, WP6, WP7 | The two foundations every later package needs (plug-in points, sound core) plus the toy finish, which touches no hot file. `main.ts` is edited by two: WP2 (emits and the features call) and WP7, which only deletes the unused line 241. Merge WP7, WP6, then WP2. |
| 3 | WP8, WP10, WP16 | Different files: WP8 is the only `main.ts` editor (stinger sites), WP10 the only `world.ts` editor (`animatePlayer`), WP16 is CSS plus `hud-keys` and Help. |
| 4 | WP9, WP12, WP13 / WP24 | Three `main.ts` editors in different functions (WP24: the well dialog, 1 line; WP12: line 1440 and one forward line; WP9: the frame, the attack key and two calls in `settings()`). Two `world.ts` editors in different places (WP12 near line 1808, WP9 at line 2237). `colossus.ts`: WP12 at line 281, WP24 at lines 398-400. WP24 stays light: it runs only its own files with the clock-shift preload, and the integrator runs the full `test:timeshift` after its merge. Merge WP24, WP13, WP12, then WP9. |
| 5 | WP14, WP17, WP19 | WP14 needs WP9's settings registry; WP19 needs WP9's `fx.ts` shake change. WP19 moved here from batch 6 so that WP15 (batch 6) can build on its `fx.pillar`. `main.ts` has three editors: WP14 (`pepperGift`, the welcome card), WP17 (`attackUses`, `autoAttack`, `showZone`) and WP19 (one kind argument per effect call). `world.ts` and `fx.ts` only in WP19. WP17 and WP14 both add a row to `promo/journey.mjs`'s beats table. Merge WP19, WP17, then WP14 (WP19's scattered one-argument edits go first, so the two packages with a few local hooks rebase onto them; WP14 keeps WP17's beats row). |
| 6 | WP11, WP15, WP18 | WP11 moved here from batch 5 (no package depends on it). WP15 needs WP14 and WP19 from batch 5. `main.ts` only in WP15 (trackers, claim fallback); `world.ts` only in WP18 (one import); WP11 touches no hot file. Merge WP11, WP18, then WP15. |
| 7 | WP20, WP22, WP25 | WP20 touches no hot file. `main.ts`: WP22 (lines 1692, 1994) and WP25 (line 319). `enemy-types.ts` only in WP25 (WP18 finished in batch 6). WP22 and WP20 both add a row to `promo/journey.mjs`'s beats table. Merge WP22, WP25, then WP20 (its text uses name lookups, so the renames flow in; it keeps WP22's beats row). |
| 8 | WP21, WP23 | WP21 needs WP20; WP23 needs WP22's callout lane and WP14's barks. `main.ts` only in WP21, `world.ts` only in WP23. |
| 9 | WP26 | Cleanup A after every feature package; touches files across the tree. |
| 10 | WP27 | Cleanup B last: it moves dialog code out of `main.ts`, which would clash with WP26's scattered edits if run together. Then staging → `develop` → `main` and the Pages deploy. |

**Hot-file matrix** (x = edits; "1" = a one-line hook; "sc" = server closure file)

| WP | main.ts | world.ts | content.ts | combat.ts | actions.ts | vi-catalog.ts | vi-pack.ts | other locales | server files and closure | shared non-hot files |
|---|---|---|---|---|---|---|---|---|---|---|
| WP0 | | fix only if needed | | | | | | | | promo tools, two browser tests |
| WP1 | | | | | | | | | | tests, package.json |
| WP2 | x | | | | | | | | i18n.ts (sc, additive) | hud-combat.ts, vite.config.ts |
| WP3 | | | | | | | | | | promo tools, package.json |
| WP4 | | | | | | | | | | promo tools, package.json |
| WP5 | | | | | | | | | | docs |
| WP6 | | | | | | | | | | toon.ts, look.ts, crop-cards.ts |
| WP7 | 1 (delete) | | | | | | | | sw-logic.mjs, build-offline.mjs | sfx.ts, house-life.ts |
| WP8 | x | | | | | | | | | sfx.ts, colossus.ts, house-life.ts, mode files |
| WP9 | x | x | | | | | | | | fx.ts, camera-rig.ts |
| WP10 | | x | | | | | | | | walk-cycle.ts |
| WP11 | | | | | | | | | | house-life.ts |
| WP12 | 2 lines | 1 | | | | | | | | colossus.ts |
| WP13 | | | | | | | | vi-econ.ts (1 entry in place) | audio-settings.ts (sc, label only) | house-life.ts |
| WP14 | x | | | | | | | vi-first.ts (2 entries) | | welcome-cards.ts, journey.mjs |
| WP15 | x | | | | | | | | | gain-feed.ts, story/scenes.ts |
| WP16 | | | | | | | | vi-help-topics.ts | | many CSS files |
| WP17 | x | | | | | | | | first-run.ts (sc, display) | hud-combat.ts, ground.ts, journey.mjs |
| WP18 | | 1 | | | | | | | enemy-types.ts (sc, colour) | look.ts, ground.ts, style.css |
| WP19 | x | x | | | | | | | | fx.ts, power-fx.ts, skill-fx.ts, disguise-fx.ts, skill-visuals.ts |
| WP20 | | | | | | | | | | friend-idle.ts, journey.mjs |
| WP21 | x | | | | | | | | | welcome-back.ts, story/scenes.ts |
| WP22 | x | 1 | | | | | | | | fx.ts, screen-zones.css, colossus.css, ctf.css, journey.mjs |
| WP23 | | 1 | | | | | | | | promo/fight-sim.mts |
| WP24 | 1 | | | | | | | vi-news.ts, vi-gameplay.ts (1 entry in place) | colossus-rewards.ts, progression.ts (sc, online changes) | colossus.ts, welcome-back.ts |
| WP25 | x | | | x | | x | | vi-friends.ts, vi-five.ts, vi-house.ts | enemy-types.ts, friends-state.ts, boss-pet-content.ts (sc, names) | hud-icons.ts, moves.ts |
| WP26 | x | x | | | | | | vi-news.ts | dist2D callers and the `esc` copies in i18n.ts, item-power.ts, pet-card.ts (sc, identical results); geom.ts (and html.ts if used) join the closure list | many |
| WP27 | x | | | | | | | | | game-services.ts |

No package edits `src/actions.ts`, `src/content.ts` or `src/locales/vi-pack.ts`. Only WP25 edits `combat.ts` and `vi-catalog.ts`. `features.ts` and the Vietnamese tables are found by glob, so no shared list collects adjacent lines.

---

## 7. Speed gate: how each package is checked

**The gate** (WP0, extended by WP3). All rows run frozen: the clock, random numbers and creatures stop, and one `world.render()` is counted. Rows: village, wild and canyon at 42° on three saves (primary); 30°, 51.5°, phone 390x844, Balanced and Battery saver (secondary standing rows); moving rows, space, the King Bear and treant rows and the scripted 8 s swamp fight (WP3). Graphics pinned per row, AI neighbours off, 1600x900 unless stated.

| Row kind | Limit |
|---|---|
| Standing rows (primary and secondary, moving, space, frozen frames) | Main draws, shadow draws, triangles and programs exact; if the two baseline runs differed, the larger value plus the observed spread. |
| Live rows (King Bear and treant 4 s peaks, scripted fight peak, idle village layout) | Draws and triangles +5%; programs created during the fight not above the baseline; CDP layout counts (LayoutCount, RecalcStyleCount, Nodes) +5%, in the fight and idle in the village. |
| Memory and CPU counters (geometries, textures, geometry bytes, matrix visits) | +5%. |
| Colossus fight (WP3 row f) | Report only, until two runs agree within 5%. |
| Ledger | Named entries only. Round 1 has one: the space row +1 program (WP18, round stars). |

**Bytes.** Three static rows from `perf:bytes` (English start, Vietnamese start, service-worker install list) and the before-play download from `perf:download` (WP3: new and late saves, English and Vietnamese, with the service worker blocked, to the Start button and from Start to 10 s after the first played frame). The bytes ledger in the merge log tracks every package's pre-Start change against its allowance. Each package checks its own English and Vietnamese start against the batch's starting commit before review (rules in section 5), and the integrator checks the running total after every merge:

| Package | Pre-Start allowance (gzip, English and Vietnamese each) |
|---|---|
| WP2 (events, services, features call, `addPhrases`) | 1.0 KB |
| WP9 (settings registry, shake, press buffer) | 0.5 KB |
| WP25 (title wordmark, name ideas) | 0.5 KB |
| WP19 (sprite atlas drawing, effect palette, pillar; `fx.ts` loads before Start) | 0.4 KB |
| WP10, WP14 (including the premise lines: English in `welcome-cards.ts`, Vietnamese in `vi-first.ts`), WP15, WP17 | 0.3 KB each (1.2 KB) |
| WP6 (ramp, chunk patch, highlight bake in `toon.ts` and `look.ts`), WP7 (buses, minus the unused context), WP8 (loudness table, stinger recipes in `sfx.ts`) | 0.3 KB each (0.9 KB) |
| WP22 (the callout lane in `fx.ts`; the rest is lazy) | 0.2 KB |
| WP11, WP12, WP13, WP18, WP20, WP21, WP23, WP24 (one-line hooks and small rule changes; their own code is lazy) | 0.1 KB each (0.8 KB) |
| WP0, WP1, WP3, WP4, WP5 | 0 (no game code) |
| WP16 | 0 net: its dead CSS (about 0.8 KB) pays for its own tokens, so it is not a payback for the round |
| WP26 | about 0: Rollup already drops unused exports from the build; anything it saves is a bonus |
| **Sum of allowances** | **5.5 KB** (caps; most hooks are a few dozen bytes, so real growth should be well under this) |
| WP27 payback (lazy dialogs) | at least the measured total; the named list can free about 7 KB, more than the 5.5 KB worst case: about 2.5 KB from settings, tester, help and map; about 2.5 KB more from forge, decorations, crafting, storage and market; about 1.2 KB from cooking, upgrades, the defeat dialog and the feed confirm; about 1.1 KB from the Journal |

Mid-round, the running total may not pass the sum of the allowances of the packages merged so far (5.5 KB once every package is in), so the plan's own allowances never trip the stop, but any overspend does. The round ends at or below the baseline for both English and Vietnamese. The payback rests on WP27, whose named list covers the worst case; a dialog that cannot move is replaced by the next largest one. `perf:bytes` also fails if a module from `src/features/`, `src/story/` or `src/features-vi/` lands in a start chunk, or if a start chunk imports the lazy chunks statically.

**Before-play download and install list.** The before-play download is measured with the service worker blocked: the worker registers about 3 s after art goes quiet (`src/art-status.ts:53`, `src/art-retry.ts:42`), and a fixed window would catch a timing-dependent slice of its 2.7 MB install. Up to the Start button the download grows only by the pre-Start allowances above and ends at or below the baseline. From Start to 10 s after the first played frame it may grow only by the `features` and `features-vi` chunks, within their allowances below: no new audio, models, images or fonts (portraits are drawn from loaded models; the theme waits 20 s). The install list is its own row, because every hashed script and stylesheet joins it (`server/build-offline.mjs:49`), including every new lazy chunk:

| Install list (`perf:bytes` row c) | Limit (gzip for code, raw for other files) |
|---|---|
| Start of the round | The WP0 baseline (about 2.7 MB) |
| Pre-Start growth | The running total of the pre-Start allowances of the packages merged so far (5.5 KB gzip in all at most): those scripts are in `CORE` too, so they grow the list by the same bytes. The ledger keeps the total; the integrator recomputes the limit at each merge. |
| `public/news.json` growth | Its measured gzip growth (WP24 and WP26), recorded in the ledger (it is in `EXTRA`) |
| After WP7 | The value measured at WP7's merge, about 444 KB lower (audio moves to on-demand). Limits are lowered, never raised. |
| `features` chunk (all of `src/features/` and `src/story/`, code and CSS) | 30 KB in all, shared by every feature package; each records its share in the bytes ledger |
| `features-vi` chunk | 15 KB in all, shared the same way |
| WP24's `colossus-well-ui` chunk | 1.5 KB |
| WP27's lazy dialog chunks | 1.5 KB in all (their code leaves the start chunk, which is in the list too, so only the chunk overhead is new) |
| Any other new chunk or file | 0: it needs a named entry in this plan. The limit at any merge is the baseline, minus WP7's drop, plus the rows above that have merged. |

**Frame cost.** No package adds a render pass. Nothing new runs per frame on phones except tiny CPU work (the hero's gait, one footstep comparison, one shake noise sample), and fidgets and poses are off on Battery saver. Audio on touch devices stays within 6 live synthesized voices. Tree sway, moving water and the time of day wait for round 2.

| WP | What could change | How it is checked |
|---|---|---|
| WP0, WP1, WP3, WP4 | Tools only | Gate passes twice on the unchanged tree; WP0 also brings the 8 browser suites to 61 of 61 |
| WP2 | Plumbing, chunk layout | Gate exact; bytes within 1.0 KB; chunk map |
| WP5 | Docs | None |
| WP6 | Colours, one ramp texture, the atlas bake | Gate and programs exact; 5 icons byte-identical; bytes within 0.3 KB |
| WP7 | One audio context | Gate untouched; install list -444 KB; download rows; bytes within 0.3 KB |
| WP8, WP11, WP12, WP13 | Audio only | Gate exact; bytes within allowance (WP8 0.3 KB, the others 0.1 KB); download rows (WP13); touch voice budget |
| WP9 | Freeze, shake, zoom punch through the view offset | Standing rows exact; scripted fight within +5% |
| WP10 | Pose maths | Gate exact; frozen A/B 0 pixels |
| WP14, WP15, WP16 | DOM, CSS | Gate exact; overlap test (WP14, WP15); idle-village layout counts within +5%; bytes within allowance |
| WP20, WP21, WP24, WP25 | Text, DOM, CSS | Gate exact; bytes within allowance |
| WP17 | DOM, vertex colours, a pooled ring | Gate exact; bytes within 0.3 KB |
| WP18 | Colour values, runtime stars | Gate exact; space +1 program (ledger); bytes within 0.1 KB |
| WP19 | Pool shapes and sprites | Standing rows exact, programs exact; fight rows within +5%; bytes within 0.4 KB |
| WP22 | DOM, callout lane | Gate exact; overlap test; King Bear rows within +5%; download and install list within the features-chunk allowance; bytes within 0.2 KB |
| WP23 | Pooled telegraph discs | King Bear and treant rows within +5% (at most +9 draws in a signature, recorded) |
| WP26, WP27 | Less code | Gate exact; bytes at or below the baseline at the end |

---

## 8. Code cleanup

The last two packages do the evaluation's section 6 cleanup. WP26 does the safe mechanical list; WP27 the careful refactors that fit and the byte payback.

| Item | Evidence | Effort | Package |
|---|---|---|---|
| Date time-bomb test (fixed in WP0, verified) | `tests/w15-review.test.ts:34,151`; `src/progression.ts:150` | S | WP0, WP26 |
| Delete 17 dead exports and 4 unused types | `.scratch/eval/code/deadcode.json` (for example `boss-body.ts:73`, `guide.ts:100`, `viewport.ts:20`); re-search after round 1 | S | WP26 |
| Remove 43 unused locals and imports, then `noUnusedLocals: true` | `.scratch/eval/code/tsc-unused.log`; `tsconfig.json:6`; `main.ts:241` (removed in WP7) | S | WP26 |
| One `escapeHtml` (`src/html.ts`) instead of the `esc` copies | 19 files (WP26 lists them), for example `main.ts:228`, `auto-plant-ui.ts:12`, `bag-slots-ui.ts:12`; `i18n.ts`, `item-power.ts` and `pet-card.ts` are server-reached; golden test first | S | WP26 |
| One `dist2D` (`src/geom.ts`) instead of 7 helpers | `colossus-patterns.ts:36`, `ctf-ai.ts:17`, `ctf-rules.ts:62`, `dungeon-patterns.ts:44`, `friends.ts:122`, `rescue-ai.ts:13`, `rescue-rules.ts:316` (some in the server closure: golden test, identical results) | S | WP26 |
| Dead CSS and the unused welcome-card styles (done in WP16, verified) | `welcome-cards.css:4-9`; `.scratch/eval/code/css-unused.json` | S | WP16, WP26 |
| Move stale root docs to `docs/history/` and fix the README links | `ANALYSIS.md`, `EVALUATION.md`, `REVIEW.md`, `MULTIPLAYER_ASSESSMENT.md`, `PARITY_REVIEW.md`; `README.md:121-123`; `PARITY.md` itself waits for the owner (WP5 item 6) | S | WP26 |
| Fix the broken title of `PERFORMANCE_REVIEW.md` and move it to `docs/` | the first line shows a double-encoded dash | S | WP26 |
| Fix two links to the missing `PERF-ANALYSIS.md` | `main.ts:2463`, `scene-matrices.ts:8` → `docs/draw-call-review.md` | S | WP26 |
| `?colossus=1` only with the tester code (solo) | `main.ts:2524` calls `colossus.start()` from a URL in production; the owner uses it to test | S | WP26 |
| Help text about boss blocking (done in WP16, verified) | `help-topics.ts:28` and `vi-help-topics.ts` | S | WP16, WP26 |
| Rename the wave-named test files by subject (`git mv` only) | 16 files `tests/w9-review…w27-auto-plant-server` plus `review-oct8`; same test count after | S | WP26 |
| Text drift: FIX-PLAN 5.1 and 6.3, the Greenhouse status, "1 consecutive days" | `docs/FIX-PLAN.md`; `public/news.json`; `welcome-back.ts:79`, `progression.ts:317` | S | WP24, WP26 |
| Byte payback: rarely used dialogs out of `main.ts` into lazy modules | `settings()` `main.ts:1157` (about 6 KB raw), `testerMore` 1147, `help` 1160, `map` 1143 (about 2.5 KB gzip together); if needed `forgeMenu` 1067, `decorations` 1072, `crafting` 1062, `storage` 976, `market` 974 (about 2.5 KB more); then `cooking` 996, `upgrades` 984, `deathDialog` 2000, `feedConfirm` 1004 (about 1.2 KB); last the Journal `quests` 941 (about 1.1 KB): about 7 KB in all, more than the 5.5 KB worst case; the bytes ledger (section 7) | M | WP27 |
| Careful refactor: the three mode bridges from the one `GameServices` object | `main.ts:2519-2547` builds near-identical hosts for `initDungeon`, `initCtf`, `initRescue` | M | WP27 |
| Careful refactor: behaviour checks instead of `main.ts` source regexes (at most 6 named tests) and tighter fitness budgets | 48 test files read `main.ts` as text (evaluation section 6); `tests/architecture-fitness.test.mjs` | M | WP27 |

Not in round 1 (they need care and A/B checks; rounds 2-4 in section 4): decoupling every test from `main.ts` text, carving `main.ts`, splitting `World`, the ability registry, the `model.ts` import cycle, merging the byte-identical hash functions (changes seeded content if wrong), deleting the perf-flag "off" paths, splitting `promo/` (other sessions use its paths).

---

## 9. Decisions

**Taken by default in round 1** (each is a small commit and easy to undo)

| Question | Default taken | How to undo |
|---|---|---|
| Tone (evaluation decision 1) | Cozy life at the centre, with real action trips beyond the gates and the story told through the village. | None needed; it guides writing only. |
| Music for round 1 (evaluation decision 4) | A live WebAudio score from the theme's own instruments plays first; the owner's theme MP3 arrives after the first played frame and takes over in the village; the title stays quiet. ACE-Step tracks in round 2; the owner picks the takes. | One flag sets theme-only. |
| Level-up and reward moments vs "small, neat messages" (O59) | Quick level-ups merge into one 1.3 s ribbon on the top edge with a pillar and a cheer; rewards fly from the tracker, never from the hero; News entries stay; no mid-screen pop-ups. | A setting brings back the quiet flash. |
| Story rewards collect themselves | Yes, when the step is done and calm, at most one claim per 2 s; the button stays as a fallback. | One flag. |
| Default name "Clover" (evaluation decision 14) | The title suggests an original name with a dice; `newGame()` and existing saves unchanged; the farmer's display name becomes Barley (id unchanged). | Remove the prefill; revert one name. |
| Our own names (O1, O3) | 4 skills and 17 bosses now, ids unchanged; planet names in round 3 with the planet themes; the game's name does not change. | Revert one table and its Vietnamese keys. |
| README pitch and PARITY.md (evaluation decision 6) | WP5 drafts a new README pitch; nothing ships until the owner says yes; `PARITY.md` waits for the owner's answer. | None. |
| Story source (evaluation decision 2) | Homeward Book tone for the home arc, ember springs for the planets, on the owner's rescue motif; Zoo Garden owns its story text, written fresh. | Scenes are data; Settings has Story scenes Off. |
| When Pepper arrives | As today: the first harvest by hand brings her home with the 10,000 energy (`firstHarvestGift`, run by the server too); before that she speaks by postcard. Scenes that need her check that she is home; on a legacy save without her, her lines come by postcard and her dinner line waits for her homecoming. No friend, cage or action rule changes. | None needed (scene data). |
| Seen scenes, medals, settings rows | Per device in localStorage per profile slot; no save or server change. | Add a save field later (S). |
| Home boss re-tune (solo) | King Bear and the treant only: 25% less solo health, phases at 60/30%, a signature, a weakness with a ground way (air combat never required); online keeps the classic table. | Switch the solo module off. |
| Colossus rewards (evaluation decision 12) | Wild: full. Explicit "Soothe it": 20% XP plus 2 fire seeds. Automatic: the first kill pays in full and the player is told the trade-off; later kills pay the soothed rate. Asleep: 1 Fertilizer a day. The lid stays at level 20, per device. | One line makes Automatic always pay in full; the parameter's default, wild, pays in full. |
| When Attack swings instead of "use" | An aggro creature within 8 m of the hero, a hostile within 6 m, or the tutorial kill step; otherwise Attack stays "use" (owner decision). | One condition and two constants. |
| Tutorial bite | Only when standing in the ring; never below 60% health. | One constant. |
| Keyboard guide (O61) | Open for a new player; folds after the first planting, 3 minutes or 30 keys; a hand choice is final. | One constant. |
| Screen shake and flashes | Shake Full by default, Low under reduced motion, Off available; Flashes On/Low; hit-stop stays off on Battery saver. | Defaults in the registry rows. |
| CPU pose maths on phones | Counted as tiny CPU work, not a render effect: the gait blend always runs; fidgets and poses stop on Battery saver. | One check. |
| Crops (evaluation decision 9) | Keep the owner's 2D cards, baked at the player's angle at load with the new ink, capped to their bed. | Two constants. |
| Our own ramp without changing icons | One shader-chunk change reads colour from the ramp; item icons and the mirror keep the old grey steps for round 1 (5 icons checked byte for byte); round 2 re-renders the icons with the new ramp. | `perfFlags.ownRamp`. |
| Bounty cap | Bounties up to the player's level +1 (a rule both sides run). | One constant. |
| Boss intro card | Full card on the first meeting per profile, then at most daily; a name chip otherwise; in solo the boss waits for the card. | Constants in `boss-moments.ts`. |
| Moved to round 2 | The village batch, the time of day, the camera pass, boss kit 1, the robot and croc signatures, friend requests, the hero face. | None in round 1. |
| Speed gate | Exact limits on frozen rows; growth only through named ledger entries (round 1: space +1 program); the baseline is never raised. | None (stricter). |
| Service-worker install list | Its own row with its own limit: the WP0 baseline, lowered at WP7's merge; new lazy chunks only through named allowances (section 7). The before-play download is measured with the worker blocked. | None (stricter). |
| Pre-Start bytes | Allowances in section 7 (5.5 KB at most, checked per package and after every merge); WP27 pays them back with a named list of rarely used dialogs (about 7 KB, more than the worst case; WP16 nets 0; WP26 saves about 0); the round ends at or below the baseline. | If a named dialog cannot move, the next largest one takes its place. |
| Story steps | `STORY_STEPS` unchanged (server and saves); scenes and reason lines add the "why". | None. |
| Section 8 tuning table | Nothing changes until the owner answers; answered items go to round 2. | None. |

**Waiting for the owner** (prepared in WP5; nothing executed in round 1)

| Question | Recommendation | Cost if yes |
|---|---|---|
| A new village hub: option A "Ember Terraces" or B "Riverbend Hamlet", with a save migration | One of the two; the migration packs what does not fit | 2-3 M packages in rounds 2-3 |
| Rename the game (a name without "Zoo" before any sale) | Pick from the private brief | About an M package |
| Online: solo-first and retire the classic fight path, or host a server | Solo-first for the AAA push | M in round 4 |
| Which repo leads character art; keep the +4.4-5 KB faces; what stays unique to Zoo Garden | Zoo Garden leads; keep the faces; keep the Ember Well story, planets and new hub here | S |
| Port the everyday disguises as on-demand kits | Yes, with a triangle budget per avatar | M in round 3 |
| Bed upgrades 2x per level to 5 (the owner's batch 91ded7d) | Soften to 1.6x, or levels 4-5 in Rune Seals; less XP from low crops | S |
| Special offers and neighbour gifts give away top items | Buy-back after the first drop; cosmetic gifts | S |
| Farm pen animals expire after 2 h | A ranch where animals stay | M (a save field) |
| The bag is kept on defeat | Keep, or drop only the trip's loot | S |
| Move `PARITY.md`, the reference notes and the 228 reference comments out of the public repo; ship the new README pitch | Yes (no history rewrite) | S |
| Colossus lid level (15, 20 or 30); Automatic Colossus pay | Keep 20; keep the round-1 default | S |
| A PC-only Fancy effects switch | Yes in round 2, hosting sway and water | M |
| Phone sharpness when there is headroom | After a real-phone test | M |
| Steady rod 10% snap | Keep 10% unless the owner wants "never" | S |
| Free CC0 recorded sound effects next to the synthesized ones | Try a few for impacts in round 2 | S |
| The evaluation's section 8 tuning table | Its recommendations, built in round 2 once answered | S each |

---

## 10. Risks

| Risk | What we do about it |
|---|---|
| Merge conflicts in `main.ts`, `world.ts` and the Vietnamese files | New modules with one-line hooks; features and Vietnamese tables found by glob (no shared list); at most 3 `main.ts` editors per batch, in different functions, merged in the listed order; only WP25 edits `combat.ts` and `vi-catalog.ts`; nobody edits `vi-pack.ts`, `content.ts` or `actions.ts`. |
| The frozen gate is not fully repeatable on some rows | The spread rule for rows whose two baseline runs differ; the gate's exact compare after every rendering package, plus `frozen-ab` (flag on and off in one page) for packages that add a perf flag; a row may be re-baselined only with the reviewer's note in the merge log. |
| The pre-Start download creeps up | Allowances per package (5.5 KB in all), checked by each package on English and Vietnamese before review; a running total after every merge that stops at the sum of the merged packages' allowances; lazy features pinned in their own chunk; a chunk-map check. One real payback, WP27, with a named list of dialogs of about 7 KB, more than the 5.5 KB worst case. |
| Vietnamese players download the new story before the title | Feature text lives in lazy `features-vi` tables registered with `addPhrases`. The one exception is the welcome card's two premise lines (WP14): the card renders at the moment of Start, before any lazy table can load, so they sit in `vi-first.ts` inside WP14's 0.3 KB. The Vietnamese start has its own baseline row. |
| The vm test harnesses break when `main.ts` gains an import | WP1's self-wiring harness for all 8 files before the `main.ts` packages; reviewers run those tests first. |
| Shader changes flicker, add programs or stall the first fight | One chunk patch installed at load (0 programs); pool materials replaced at creation; every new shape warmed at start; programs and programs-created rows exact; the only new program (space stars) compiles during the launch. |
| The colour ramp drifts toward muddy or pastel | Acceptance needs saturation not lower and lightness within 0.03, plus colour-rule tests and before/after pairs; `perfFlags.ownRamp` reverts. |
| Overlays cover the fight buttons | Screen zones, a 120 px talk bar that shrinks to a chip in fights, and an `elementFromPoint` test on 3 viewports in WP14, WP15 and WP22. |
| Celebrations pile up in the first 90 seconds | One beat conductor: merged level-ups, spaced stingers, scenes and ribbons never together; journey checks. |
| Story scenes play out of context on old saves | Scene conditions (who is home, level band); Pepper speaks in person only when she is home, otherwise by postcard; unlocked scenes never auto-play; tests on `save.json` and `save-late.json`. |
| The live score sounds cheap or repetitive; audio costs CPU on phones | Objective music tests (loudness, peaks, repeats), rests in the village, 6 voices on touch, theme-only below Sharp; the owner gets clips and a listen page; one flag for theme-only. |
| iPhone audio (gesture unlock, element volume) is untested on real devices | One context on the first gesture, music through the bus, a WebKit Playwright run where possible; the report says a real-iPhone check was not done. |
| The true freeze shifts timing-sensitive tests | Short freezes, none for pets or Battery saver, the added time capped at 8% of the fight-sim run; the stop table is one constant. |
| Renames break text that stores display names | Ids never change; names come from tables at display time; story text and tests use lookups; WP25 loads an old save fixture. |
| Boss re-tune breaks online parity | Solo-only lazy module; server closure files keep identical results; server tests must stay green with no edit. |
| Date rules create more time bombs | Clocks injected; `test:timeshift` (+45 and +400 days) from WP1. WP24 runs its own files with the clock-shift preload; the integrator runs the full `test:timeshift` after WP24, WP26 and WP27 and before the push to `main`. |
| Agent-written Vietnamese (about 1,500-2,000 words) is not checked by a speaker | Short lines, the vi-panels English-word scan, catalog tests; the story-lines page for the owner's spot check after deploy; fixes are text only. |
| Browser jobs overload the PC; leftover servers or poll loops | The 3-slot heavy lock including the integrator (the 8 browser suites run in the integrator's slot); private ports and cacheDirs; stop by exact PID; timeouts on every wait; no Blender job in round 1. |
| The browser suites were already red (17 of 61 failing at b3b9f57), so a new layout break would hide among old failures | WP0 makes all 61 pass first, without loosening any overlap check, and finds out whether try-on is really broken; the integrator runs the 8 suites after every merge, and a red suite blocks the next merge. |
| Other sessions share this machine (ports, stash, worktrees) | Never `git stash`; remove only worktrees this session created, after checking junctions; stop servers by PID. |
| 28 packages take longer than planned | Slip order, first to last: WP25's title wordmark (the names stay), WP21's "What's new" card, WP12's low-health warning, WP19's dust puffs, then WP23 as a whole (WP22 still ships). Cleanup and the deploy never slip. |
| The owner dislikes a default (a name, the Colossus split, auto-claim) | Each default is one small commit listed in section 9 with its undo, and reported plainly. |

---

## 11. Parked and later

**Parked** (not in round 1, with the reason; the same list as the plan's JSON)

| Item | Reason |
|---|---|
| O16 animated river water | The owner rejected it because it flickered. Any new water motion is flicker-tested frame by frame and sits behind the PC-only Fancy effects switch (round 2). |
| O34 bosses blocking low hits (BOSS_BLOCK_ON) | The owner turned it off; it stays false. Only the Help text that still describes it is fixed (WP16), and no weakness needs air play. |
| P4 bed upgrades 2x per level to 5 | The owner's decision (batch 91ded7d). WP5 shows the numbers and two softer options; nothing changes until the owner chooses. |
| O39 harpoon numbers and O48 rod snap 60/30/10% | The owner's rules; kept. WP5 only asks whether 10% on the steady rod is fine. |
| O43 Colossus beginner lid level | The owner's decision: level 20, per device. WP24 changes rewards only; WP5 asks about 15 or 30. |
| O42 online co-op Rescue and online Flag Rush | No server is hosted. Revisit only if the owner hosts one. |
| O63 browser notifications and auto save-and-reload | Low value (1 of 5); dropped for now. |
| O64 3-lane PvP, survival, player market, Steam, real money | Out of scope by the owner. |
| O40 new side systems | Kept as built but frozen: no new systems until the story and boss passes land. |
| Built owner ideas kept as rules: O13, O18, O24, O38, O44, O49, O50, O51, O52, O54, O55, O57 | Built and owner-approved; round 1 must not change them, and existing tests guard them. |
| Village static batch in round 1 | v1's stretch package. Its savings are only needed by round-2 spenders (night glows, landmarks, the phone camera); it needs per-cell merging to avoid more triangles on phones. First package of round 2. |
| Time of day in round 1 | A very dark night needs window and lamp glows, which cost a draw only the village batch can pay without breaking the "not slower" rule; a dark night without lights would miss the art bar. Round 2, right after the batch. |
| Camera pass in round 1 (look-ahead, boss framing, tree fade pattern, phone camera) | Look-ahead is nearly invisible; the phone camera needs the batch's savings; the fade pattern needs a panning flicker test. The first-view glide stays in round 1 (WP14). Round 2. |
| Boss models kit 1 in round 1 | Round capacity; it blocks nothing; it fits with the planet kits. Round 2 with a 3,000-triangle budget per boss, glow in vertex colours and compile-on-load. |
| Robot and croc signature moves in round 1 | Four bosses were too big for one package; King Bear and the treant guard the two home cages Chapter 2 uses. Round 2. |
| Planet renames in round 1 | They would change again with the round-3 planet themes; renaming twice confuses players. Round 3. |
| Friend requests and the welcome-back memory line in round 1 | They belong with friendship hearts and memory; requests must come only from friends already home. Round 2. |
| Hero face, blink and springs in round 1 | The face is about 60 px tall in play and rarely faces the camera; springs on merged ears would add draws. Round 2, in portraits and close-ups first, springs on the CPU. |
| Crop re-bake on slider change and bevelled planters in round 1 | Round capacity; WP6 already bakes at the player's pitch at load. Round 2. |
| Card-grid shop and market in round 1 | Round capacity; the shop works and WP16 fixes the squeezed row. Round 2 with the icon family. |
| Place-flag level ranges in round 1 | The danger chip, the border band and the bounty cap already cover the problem. Round 2. |
| Tree, bush and reed sway in round 1 | A per-frame effect that would not be opt-in; round 2 behind a PC-only, off-by-default Fancy effects switch with a flicker test. |
| ACE-Step generated region music in round 1 | A GPU job on a shared GPU and a listening step the owner must do; round 2. Round 1 ships the theme plus a live score at 0 bytes. |
| Creature leash at the village border and the cottage framing | Kept out of round 1 to keep `world.ts` AI edits bounded; round 2. |
| Hub Blender concept renders | Heavy Blender work; WP5 uses SVG plans and numbers; renders follow for the option the owner picks (round 2). |
| A paid composer or licensed music | Free tools and assets first; generated takes the owner picks come in round 2. |
| The cottage fridge stash (part of O29) | Busywork, as the research note says; room tone comes in WP11, fireplace, lamp, sleep and decorations in round 2. |
| Rewriting git history to remove PARITY.md | It would break every clone and fork; moving the file waits for the owner's answer. |
| Merging the byte-identical hash functions, deleting perf-flag off paths, splitting promo/ | Each can change seeded content or break other sessions' paths; round 4 with golden tests and path updates. |

**Later** (with the round)
- Round 2: P4 and P5 (if the owner says yes), P11 (flag levels), P16, P18 (landmarks), P19, P20 (re-bake, planters), P23, P24 (face), P26 and P28 (camera pass), P29 (icons, map, card shop), P30; I5 (rematches, trial), I6, I8, I14 (legendary fish, records wall, aquarium), I15, I16, I18, I21 (explorer step), I26 (face, springs), I28, I29; O9, O10, O11, O12, O19 (distance LOD), O22, O26 (time of day), O27, O29 (fireplace, lamp, sleep), O31 (training dummy), O36, O41, O46 (spectacle), O47; chapters 3-4, the other 15 bosses, the village batch and headroom 2, phone fight stalls, a text size option, generated music, the hub (if approved).
- Round 3: P21 (the rest of the identity pass, planet names, reference comments, disguise skills), I3, I9, I10, I11, I12, I17, O2 (build), O14, O26 (seasons, weather), O28 (features), O45, gamepad.
- Round 4: P6 (Ascended planets), I7, I13, I19, I20, O7 (skeleton, if needed), O33.

**Where every evaluation problem goes**

| P | Problem | Where |
|---|---|---|
| P1 | Date time-bomb test | WP0 (fix), WP1 (clock-shift run) |
| P2 | Speed gate measures wrong | WP0, WP3 |
| P3 | Wordless story and the "Clover" clash | WP14, WP20, WP21, WP25 |
| P4 | Bed upgrade fountain | WP5 (owner decision); parked |
| P5 | Energy means nothing, gifts skip drops | WP5; round 2 |
| P6 | Nothing new after level 20 | WP23 (2 bosses); rounds 2 and 4 |
| P7 | Boss fights never lost | WP23; WP5 (bag on defeat); round 2 |
| P8 | Soothing pays like waking | WP24 |
| P9 | Attack opens dialogs in the tutorial fight | WP17 |
| P10 | The first fight needs no input | WP17 |
| P11 | A deadly zone 15 m from the market | WP17 (chip, band), WP24 (bounty cap); flag levels round 2 |
| P12 | Progress has no moments | WP15 |
| P13 | No music outdoors | WP7, WP13 |
| P14 | Silent world, mute creatures | WP11, WP12 |
| P15 | The mix hides key cues | WP7, WP8 |
| P16 | Code-shape creatures and bosses | Round 2 (boss kit 1, planet kits) |
| P17 | Flat light model | WP6 |
| P18 | Empty, pastel planets | WP18 (colour); round 2 landmarks |
| P19 | Static water | Round 2 (flicker-tested, PC switch) |
| P20 | Two styles in the garden | WP6; round 2 planters and re-bake |
| P21 | Presents itself as the reference | WP25, WP5; round 3 |
| P22 | Space breaks the night rule | WP18 |
| P23 | Vault and Rescue arenas unfinished | Round 2 |
| P24 | Stiff hero | WP10; face round 2 |
| P25 | Hit-stop and shake numbers | WP9 |
| P26 | Camera does not frame the play | WP14 (first-view glide), WP16 (keys guide); round 2 camera pass |
| P27 | Small HUD text and targets | WP16, WP15 (tracker count) |
| P28 | Fights hard to read | WP22 (callout lane, pills), WP19 (effects); round 2 tree fade |
| P29 | Emoji and web lists | WP14 (portraits, premise card); round 2 icons, map, shop |
| P30 | Jagged phone picture | Round 2 |

**Where the "also found" items go**

| Item | Where |
|---|---|
| The farm pen is empty for returning players; "Collect meat" | WP5 asks; round 2 ranch |
| Text drift (Help blocking, FIX-PLAN status, Greenhouse, "1 consecutive days") | WP16 (Help), WP24 (Greenhouse, singular), WP26 (FIX-PLAN) |
| Two fight rule sets | WP5 asks; round 4 (O33) |
| The cottage's dark lower screen | Round 2 |
| Fishing has no late challenge; the catch is only a label | WP15 (catch card); round 2 legendary fish |
| Thin disguise and skill visuals | WP19 |
| The green Crocodile King on green ground | WP18 |
| Rescue Call lists "Clover" twice | WP25 |
| Small UI layout issues (tab arrows, ranking tabs, toasts, the "Go!" banner) | WP16, WP14 (toast zone), WP22 (pills) |
| The late test save is not a real late player | Round 2 |
| Phone Help names PC keys | WP16 |

---

## 12. Changes from v1

- **Packages.** v1 had 26 (WP0-WP25); v2 has 28 (WP0-WP27): 2 more than the guide's 26, because the critics asked for three new packages (more "before" numbers, the journey tool, chunky effects) and several splits, while six v1 items left the round.
- **Speed gate (all high speed issues accepted).** Frozen rows with exact limits; programs, memory and matrix counters; counted only inside `world.render()`; no frame-rate check; save-new, Balanced and Battery saver rows (owner and completeness critics); fight, space, moving and King Bear rows and the first-visit download in WP3; the Vietnamese start and install-list rows; the ledger is enforced by the gate. Phone row pinned to Sharp with a phone profile (the speed critic's version, not "Balanced": it keeps the phone's real draw set; Balanced has its own rows).
- **Bytes (accepted).** A bytes ledger with allowances, lazy features pinned in their own chunk with a chunk-map check, lazy Vietnamese through `addPhrases`, and a real payback package (WP27). The tutorial fight, hero fidgets and boss signatures are lazy.
- **Split and trimmed packages (feasibility, accepted).** WP0's clock-shift sweep moved to WP1; sound split into core (WP7) and mix (WP8); hit feel waits for the sound core; HUD keeps one package by moving the tracker chip to WP15, warning pills to WP22 and toasts to the screen zones; damage numbers moved to WP22; the first fight keeps the danger chip and band, and the bounty cap moved to WP24; names split from the README (now a WP5 draft); cleanup split into A and B; boss signatures cut to King Bear and the treant; the hero cut to gait, fidgets and poses.
- **Moved out of round 1.** Village batch, time of day, camera pass (except the first-view glide), boss kit 1, robot and croc signatures, planet renames, friend requests, hero face and springs, crop re-bake and planters, flag levels. Reasons in section 11.
- **Owner intent (all high issues accepted).** The talk bar is at most 120 px, sits above or between the controls, shrinks in fights and has an overlap test. Chunky effects added (WP19). Ember Well lists all 4 choices; Automatic is handled with a changed fix: v2 does not keep Automatic at full pay forever (that would make an explicit "Soothe it" pick pointless) but pays the first Automatic kill in full and tells the player first; the owner can switch Automatic to full pay in one line. Medium and low: weaknesses always have a ground way; the keys guide stays open for new players; rewards fly from the tracker; the catch card only for first, new and record catches; the README waits for the owner; skill names stay visible on touch; the boss card once per profile then daily; `?colossus=1` behind the tester code; a kept owner folder; no reference-game name in these docs; "the owner"/"they" and "the player" throughout; wrong claims fixed (rod snap 60/30/10%; the server closure rule).
- **Player impact (all high issues accepted).** The journey tool and before reel (WP4); a mid-game save (WP3); pillar 4 restated (5 beats in 15 minutes on a new save, boss beats on the mid-game save); screen zones; the beat conductor; scene conditions; chunky effects. Night lights are handled by moving the time of day to round 2 behind the village batch, which pays for them. Medium: the opening sequence, "What's new" and Watch, music rests and objective music tests, an original title, the boss card on approach, barks, the dinner cast, the cast sheet and story-lines page, saturation checks for the ramp. Rejected in part: waiting for the owner's listen before the main deploy (the owner's style is build, deploy, then report, and a one-flag theme-only fallback exists); the card-grid shop (round 2 for capacity).
- **Completeness (all accepted).** VFX covered; first-visit download gated; an "also found" table; every P, I and O mapped; phone fight stalls logged now and fixed in round 2; all `tone('level')` sites listed; save-new rows; decisions 1 and 7 added; O7 is round 4 and O28 round 3 everywhere; I21's remainder, O26 and O29 placed; the 228 comments, disguise skills and the bag on defeat placed; headroom buckets in round 2; accessibility (Flashes row, cues never colour only; text size round 2, gamepad round 3); the doc and the JSON now match.
- **Final consistency check (13 fixes, no other change).**
  1. Bytes ledger: every package that adds code before Start now has an allowance (WP6, WP7 and WP8 0.3 KB, WP19 0.4, WP22 0.2, eight small packages 0.1), 5.5 KB in all. The mid-round stop is the sum of the merged packages' allowances, not a flat +3 KB that the plan's own allowances would trip. WP16's dead CSS nets 0 (it pays for its own tokens); WP26 saves about 0 (Rollup already drops unused exports). WP27 is the one real payback, with a longer named list of dialogs and a fallback. Every package checks English and Vietnamese bytes before review.
  2. WP24 stays light: it runs only its own files with the clock-shift preload, and the integrator runs the full `test:timeshift` after the merge.
  3. WP15 now depends on WP19 (the pillar). WP19 moved to batch 5 and WP11 to batch 6, so WP19 lands first.
  4. WP22 has the overlap check: an `elementFromPoint` test on 390x844, 844x390 and 1600x900, screenshots at 844x390, and `src/screen-zones.css` in its files. WP15's overlap check is named as the same test.
  5. WP26 updates `docs/server-closure.txt` and `tests/fixtures/closure-allow.json`, because `geom.ts` (and maybe `html.ts`) joins the server closure.
  6. WP8 lists all 30 non-level-up uses of the `level` sound, including 9 ternaries, and its search pattern catches the ternaries.
  7. Text shown only after Start goes in lazy `features-vi` tables: WP17 no longer edits `vi-first.ts` or `vi-flags.ts`, and WP24 no longer edits `vi-colossus.ts`.
  8. Every batch row states its merge order (batches 1 and 8 need none), matching the JSON. (The second check below gave batch 1 an order.)
  9. File lists: WP24 adds `vi-gameplay.ts`; WP25 adds `help-topics.ts`, `vi-five.ts` and the 13 tests or fixtures that hard-code old names; WP19 adds `power-fx.ts`, `skill-fx.ts`, `disguise-fx.ts` and `skill-visuals.ts`.
  10. WP3 adds an idle-village layout row (checked by WP14, WP15 and WP16) and defines the Colossus report row through `__zoo.colossus`.
  11. `frozen-ab.mjs` is used only where a perf flag exists (WP6, WP10); it cannot compare two commits.
  12. WP0's date test no longer needs WP1's clock-shift preload.
  13. Size: WP0's server-closure list moved to WP1; WP22's PC camera move moved to round 2's camera pass; WP14 and WP15 have named cut lines; the count stays 28, 2 above the guide, with the slip order able to drop WP23.
- **Second consistency check (10 fixes, each checked against the code).**
  1. Pepper's place in the story. The check said Pepper is caged on the Toy planet on a new save, so "Pepper home" at story index 12 could not be reached. The code says otherwise: the first harvest by hand settles the welcome and adds Pepper at home with the 10,000 energy (`src/friends.ts:69-83`, called by the harvest action at `src/actions.ts:98-100`, on the server too; FIX-PLAN 4.6). Her Toy-planet cage only applies to a legacy save whose welcome was settled before she existed. So the suggested arc (Pepper leaves, goes missing and is rescued in Chapter 2) was not used: it would need a change to `friends.ts`, which the server runs. The real gap is fixed instead: before the first harvest she is not in the village, so the opening uses her postcard and her arrival scene plays on the harvest that brings her. WP3's mid-game save is the state real play reaches, with a test. WP14's scenes check that she is home (postcard otherwise); WP20's dinner reads its cast from the save; WP21 gives her a homecoming when a legacy save frees her. A decision row in section 9 records it.
  2. The before-play download is measured with the service worker blocked, so it repeats. The install list is its own row with a limit (the WP0 baseline, lowered at WP7's merge) and named allowances for new lazy chunks (section 7). WP0, WP3, WP7, WP13, WP22, WP27, pillar 6, the exit line and section 7 name the right row; WP13's theme waits 20 s after the first played frame.
  3. The welcome card's two premise lines live in `welcome-cards.ts` and `vi-first.ts`, so a Vietnamese player sees them in Vietnamese at once; `welcome-cards.ts` never imports the lazy chunk, and WP2's chunk check catches a static import.
  4. WP14's opening glide holds the bed view until the first input, so its bed check is timed from the glide's start (the glide's end plus 0.1 s and plus 1.0 s, both inside the hold) and matches its scope.
  5. WP3 adds an old-treant fight row on the mid-game save; WP23 is checked on the King Bear and treant rows.
  6. WP2 gives every event an emit site or an owner (`started`, `harvest`, `reward`, `hitLanded`, `friendHome` and `playerHurt` with lines). The 6 dB music duck: WP7 provides it, WP8 wires the stingers (batch 3), WP14 the talk bar (batch 5), and WP13's score plays on the ducked bus. WP14 lists WP7 as a dependency.
  7. File lists and merge orders: WP26's 19 `esc` files and its closure files, WP13's `vi-econ.ts`, WP25's `vi-house.ts`, WP14's `vi-first.ts`; batch 1 shares `package.json` and WP3's save (order WP1, WP3, WP4, WP5); batches 5 and 7 share `promo/journey.mjs`'s beats table (orders stated).
  8. Wording: section 4 now says what this section says about the 2 extra packages; WP17 sends `firstWin` and WP15 shows "First win!"; WP24's parameter is `lid: 'wild' | 'soothed' = 'wild'`, and Automatic is the pick `'auto'`.
  9. WP15 again tests that `save.json` and `save-late.json` show at most 1 ribbon in the first 60 s. WP27's payback list frees about 7 KB, more than the 5.5 KB sum of the allowances, with a next-largest rule instead of the hooks fallback.
  10. A baseline run of the 8 browser suites at b3b9f57 passed 44 of 61. WP0 now makes all 61 pass (14 stale HUD assertions after commit e78e839: 10 fail with "the name is not above the portrait tile" and the 4 rows at 320x568 with "without the tile the level badge should stand before the name, over the energy count"; 3 try-on failures diagnosed and fixed or re-tested), the command is recorded, and the integrator runs the 8 suites after every merge, so merges take longer (wall-clock 30-40 hours). Also, the parked music row now gives only the free-tools-first reason.
  Re-checked after these fixes: every package is in exactly one batch, every dependency lands in an earlier batch, and no batch has more than 3 heavy packages.
