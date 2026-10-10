# Zoo Garden

A browser adventure built against the gameplay of Zoo Pet, with independently authored Three.js code, original Blender assets, and local multiplayer services. The expanded build includes the reference crop, equipment, creature, progression and crafting catalogs, along with full-size worlds and their activities.

## Run

Use Node.js 24, selected by `.node-version`, for the server, tests, and Render deployment.

```sh
npm install
npm run dev
```

This starts the browser development server at http://127.0.0.1:5173 and the account/world service at port 8787. If either port is already occupied by a running copy, stop that copy before starting another.

```sh
npm run build   # type-check, production assets, generated offline cache
npm start       # production game plus account/world service on port 8787
npm test        # gameplay, worlds, assets, save migration and real server tests
```

`npm run dev:client` and `npm run preview` run only the browser front end. Keep the account service running separately if using those commands for multiplayer.

## Play

- Click or tap to walk; hold the ground to steer. Arrow keys also work (WASD in the second layout below). Phones enable a draggable joystick by default, with skills on the opposite side. Settings can swap hands or restore tap controls. Scroll or pinch to zoom.
- **Settings → PC keyboard layout** offers the original **Arrows + QWER** layout or **WASD + JKL;**: W/A/S/D move and J/K/L/; use the four skills in order. In the WASD layout, **P** opens the journal; arrow keys still move. The preference is saved, and skill labels follow it. Flight controls stay W/A/D to fly, S to brake and L to land.
- On phones, the four combat skills sit near the bottom corner and fishing controls sit above them. **Home** is beside the minimap in the upper HUD, away from combat taps; it returns straight to the village center on the home planet and uses the return-flight sequence from another planet.
- Click objects to approach and interact. **F** uses the nearest object. **I** opens the backpack, **J** the journal, **M** the map, and **Escape** closes a panel.
- Stand near a creature and your explorer fights it automatically; click one to chase it down. **Space** attacks the nearest creature. **Q/W/E/R** use four skills: the whirlwind spins with arms out, the dash lunges through enemies, the ground slam leaps and crashes down with a shockwave, and the fourth is your weapon's or disguise's special.
- Creatures shout "!" when they notice you, crouch and tremble before they strike, slide back when hit and pop into experience orbs when defeated. Critical hits briefly freeze the action and shake the camera. Bosses show a health bar at the top of the screen.
- Plant, harvest and sell crops. Gear you buy is equipped straight away and appears on your explorer: weapons in hand, hats, outfits, boots, disguises and a pet that follows you. Swap gear from the backpack. The journal guides the first adventure and awards story, daily, weekly and achievement rewards.
- Keep a fishing rod in your backpack: the best owned rod appears automatically near a pond. Tap the pond or press **F** to cast, and the fish swimming in the water come to investigate. Leaving the shore or attacking restores your chosen combat weapon, another owned weapon, or bare fists. Press **Reel** (or Space) the moment one bites, hold to pull it toward the shore, and let go when it surges or the line turns red. The catch leaps into your arms, and the journal's Collection tab keeps your record for every species.
- Buy a **Hunting harpoon** at the Outfitters for **1,000 energy**, then equip it to hunt ordinary visible pond fish by tapping a fish or pressing **Hunt**. Throws recharge in 1.3 seconds and caught fish return after 18 seconds. The reusable harpoon needs no ammunition. Equip a rod from your backpack to return to line fishing or catch mysterious shadows. Six large Great Forest Hawks fly in Mushroom Forest outside the village; harpoons and other combat weapons can defeat them for feathers and possible meat. See the [hunting rules and asset notes](docs/hunting.md).
- Store valuables in the chest. The backpack holds 100 kinds of item and the chest 120 (a slot is one item id, so stacks never split); expand them at the backpack panel, the bag by 10 up to 5 times (150) and the chest by 20 up to 4 times (200), for energy and rare materials. If defeated, your loose items drop in a bag where you fell and stay recoverable for 7 days; up to 20 bags are kept, and when there are more the oldest is moved safely into the chest. **Settings → Keep backpack on defeat** keeps your items instead of dropping a bag.
- Explore four regions around home: a pine and toadstool forest, a flower meadow, a reedy swamp and a red-rock canyon, joined by winding sand trails. Each of the other eight worlds is dressed in its own scenery, from lollipop trees and giant donuts to snowy pines, glowing lava rocks and twisted night trees.
- Fly between worlds yourself. Open the starship's star map, fill the tank for ϟ 20 and take off. In space, hold the screen (or the mouse, or **W A D**) to steer, hold **Boost** (or **Shift**) to go faster at five times the fuel, and **S** to brake. Collect ✨ stardust to refuel (+3 energy each, and now and then a star shard), bounce off the asteroid belts, and follow the **?** on the radar to discover new planets. Hover over a planet and press **Land** (or **L**); landing needs the planet's level. Running out of fuel never strands you: the ship just crawls until it reaches stardust. **Home** flies you straight back to Clover Village.
- Watch environmental warnings and bring suitable equipment.
- **The Delvers' Vault** (co-op dungeon): talk to Vault Keeper Wren beside the glowing circle outside the south gate, then stand in the circle. After a 10-second countdown the party (up to five) drops into five rooms: Glowcap Grotto, Belfry of Hushed Bells, Coral Throne, Ember Forge and Starfall Observatory. In each room, clear the creatures, defeat its guardian, then step into the portal (it takes you anyway after 8 seconds). Guardians telegraph four skills each on the ground: get out of the coloured shapes, spread out from moon dust, and hide in the green circles from the eclipse. The run lasts at most 30 minutes, ends 25 seconds after the last guardian, and you can enter six times a day (the day turns at midnight Vietnam time). Each guardian may drop its own companion (25%, luck does not raise it; each has two skills it casts in fights), always drops Rune Seals, and the last one may leave a Delver's Chest decoration (50%). Fainting in the vault sends you home without dropping your bag. Offline, your AI neighbours fill the party (friends first); they fight with small blows and never take loot. Recommended from level 20.

## Game modes

Besides the farm and the worlds, six extras are one tap or one short walk away. Daily limits are generous on purpose (this is a solo-friendly edition) and the day turns at midnight Vietnam time.

- **The Delvers' Vault** (co-op dungeon, up to five, 6 runs a day): talk to Vault Keeper Wren by the glowing circle outside the south gate and stand in it. Details above.
- **Flag Rush** (capture the flag): talk to Gatekeeper Orrin at the Multiworld Gate beside the south gate and pick a mode. Choose 1, 2, 3 or 5 a side against AI teams; first to three captures wins, with 8 minutes plus a 3-minute golden point, jump pads over the river and power-ups every 22 seconds. Matches pay energy for wins, captures, returns and knock-outs (at most 1,400), for 12 paid matches a day. Online matches against real players are not built yet.
- **Rescue Call** (squad tower defence): a friend on another planet sends an SOS every 30 to 60 minutes of play (up to 4 a day); walk through the cracked portal by the south square, or pick a mission there at any time. You lead a squad of up to five, build defences with Spark between waves, upgrade friends and hero as the fight goes, and keep ten hearts safe. Three missions so far (Toybox, Candy, the Wild Jungle). Eight winning missions a day pay in full, and up to 80 waves a day pay anything.
- **Cinderpeak Colossus** (daily world boss): it wakes in Redrock Canyon every day from 08:00 to midnight Vietnam time, with a 10-minute warning banner, and works offline too. It has 3,000,000 health for one explorer (+80% for each extra one), pierces 75% of your defence, takes double damage on its lowered head and kneels near the end. Everyone who helps shares the loot (Cinderhorn Crown 15%); the final blow earns the Little Cinderpeak companion.
- **Leaderboard** (🏆 in the top-right menu): weekly and all-time boards with your rank. Signed in on a game server it ranks real players (the week starts Monday 00:00 UTC); on the solo Pages edition it ranks you and your AI neighbours.
- **News board** (📰 in the top-right menu): update notes and what is coming soon, in English and Vietnamese. It opens by itself once when there is something new.

## Online play

Open **Play together** to create an account on the current game server or sign in. Accounts use usernames and passwords; no email is required. Offline and online adventures have separate saves. Signing out restores the offline adventure you left behind.

Online players share the wild areas, enemies, boss attacks and world events. Gardens are private; friends can visit and see planting or decorating updates. Use a party code for a private shared world. One browser tab per account is active at a time.

For two-player testing on one computer, use separate browser profiles or a normal window and a private window, and create different accounts. This build was also exercised with separate localhost hostnames.

For local development without `DATABASE_URL`, the server stores accounts in `data/accounts.json`, excluded from source control. Back up that file to retain local account progress. With `DATABASE_URL`, account credentials, profiles, save revisions, friends, and friend requests persist in PostgreSQL. The Render configuration requires Neon and fails startup if the database is missing or unavailable. Browser offline saves remain in that browser's local storage. Online actions use revisions and immutable request IDs; durable receipts make retries safe without uploading a client save. Identical retries return the original action result with the current canonical profile.

Sign-ins persist across restarts: PostgreSQL deployments save hashed session tokens in the database; local file storage uses `DATA_DIR/sessions.json`. A restart clears parties, chat history, and active rooms. Run one server instance because connected players and rooms are held in memory.

The default server listens only on this computer. [`render.yaml`](render.yaml) and the [Render + Neon deployment guide](docs/multiplayer-deployment.md) prepare one free HTTPS service for the complete game, account API, and WebSockets. Automatic code deploys are off, and the database connection is supplied privately in Render. The configuration does not create or deploy any remote resources by itself. When deployed, players open the new Render address; GitHub Pages remains the separate solo edition.

Copy `.env.example` to `.env` for local database settings. `npm run db:check` checks the PostgreSQL connection; `npm run db:import -- --path "C:\path\accounts.json"` explicitly imports a legacy account file into an empty PostgreSQL destination. See the deployment guide before importing. Never put database credentials in a `VITE_*` variable.

The Delvers' Vault online: the server watches who stands in the circle, runs the 10-second countdown, forms the party from everyone there (up to five), moves it into a private room and relays the run (`server/dungeon-lobby.mjs`). The run counter and every room's rewards are shared rules (`dungeonStart`, `dungeonClaim` in `src/actions.ts`) applied by the server with its own clock and dice; a member may start only the run the lobby put them in and claim only rooms the run's host reported cleared, in order and at most one every 15 seconds. The arena itself is simulated by the first member's browser (creatures and guardian skills) and relayed to the others, whose hits go back to it; damage taken in the vault stays local to the run and does not change the server's health. If the host leaves, the next member's browser takes over.

The server calculates online spending, rewards, combat damage, health and cooldowns. An elected browser host still supplies bounded enemy movement and visual snapshots; movement and fishing telemetry are not proof of honest human input. This remains cooperative multiplayer, not a complete anti-cheat guarantee.

## Included

- 27 crops, including eight long-growing fruits; nine starting beds, expandable to 24, each upgradable to level 5; rare seeds, cooking and timed food effects. Each fertilizer removes half the original growing time, so two applications ripen a newly planted crop (on fruit trees one dose takes off at most 2 hours). Up to 80 decorations can be placed.
- The pen holds 15 animals in all (chickens, ducks, cows, pigs, goats and geese), up to 10 of a kind (9 goats or geese) once it is fully expanded, plus one permanent guard dog. Animals stockpile eggs, duck eggs, milk, truffles, goat milk or goose eggs during a two-real-hour lifespan, then become meat; the stock they had earned is collected with the meat. One game hour is 60 real seconds; production takes 120/180/240/360/300/240 seconds and continues offline. Species shelters store five products and shorten production to 70%. Cows graze three times as long as they walk.
- Six equipment slots, 16 disguises with four skills each (the ten shared with the reference use its skills; the six uniforms have kits of their own, and the ninja leaves four clones that take enemy attacks), workshop and furnace crafting, placeable decorations, nine Titan hats and 39 pets that fight beside you (a companion for each of the 17 bosses and nine Titans, five Vault companions that cast skills, the Colossus pet and seven others). Weapon forging reaches +15 with 30% success; failed attempts consume materials.
- Nine full-size worlds, each with its own scenery mix, a three-row border and shaded ground; four home regions; a piloted starship flight with fuel, stardust, asteroid belts, planet discovery and landing; species-specific creatures, bosses, loot, ranged attacks and status effects.
- Ice inertia, volcano warnings and tides, cave and furnace progression, special lava weather, toy trains and renewable gifts, jungle thorns and poison, ocean oxygen and turtles, cloud bounce routes and night-world light pillars.
- 19 fish (including the harpoon-only Lake Guardian) plus junk; water-specific catches, bait, collection records and mysterious silhouettes that reveal supergiant fish or unusual items.
- 29 story milestones and ongoing tasks, daily and weekly activities, achievements, monthly star pass, bounties, timed challenges and six collection groups.
- Account saves, friends, visits, chat, private parties, server-approved crop theft and guard dogs, shared loot with ten-second owner priority and thirty-second expiry, plus offline browser play and install/fullscreen support (**Install as app** appears on the title card and in Settings when your browser offers it; iPhone and iPad show the Add to Home Screen steps).
- Helpers and neighbours: the garden robot (ϟ1000) harvests and replants, a farm helper (ϟ1000) tends the pen; they take daily rests, walk home or stroll round the farm when idle, and what they collect flies to them. For solo play, AI neighbours fight beyond the gates, send friend requests, give presents now and then, chat in a message box, fill the Vault party and the Flag Rush teams, and never take loot or kill credit; switch them off in Settings (they are always off while you play online).
- Difficulty (Settings): Easy keeps every original value; Normal slows the economy (kitchen from level 14, fruit trees later and twice as slow, dearer livestock); Hard adds tougher creatures and +15% XP and drops. Raising it is free; lowering it asks first and works once an hour.
- Nine Titan encounters, moving dinosaur giant attacks, planet-specific hazards and a home discovery sign showing explored worlds out of nine.
- Preserved version-1 saves, colors and possessions. Earlier six-bed gardens receive three additional beds.

The interface supports English and Vietnamese with original artwork. Choose a language on the welcome screen or in Settings; the preference stays on this device and does not change saved progress or player names. Vietnamese catalog terms follow the reference game where available, with translations for this game’s additional features. Each panel has its own colour band and icon, messages appear as short pills near the bottom of the screen, and on phones panels open as bottom sheets. The backpack and chest are larger than the reference's (100 and 120 slots against 20 and 40), and rewards that cannot fit in a full backpack go to the chest, so migration and reward collection do not discard possessions. These are intentional improvements. Physical-phone performance, browser installation behavior and long-session balancing still benefit from user play-testing.

## Graphics and phones

Settings → Graphics offers Auto, Sharp, Balanced and Battery saver. Auto starts phones and desktops on Sharp, with pixel ratio capped at 2. On mobile, farm animals move more calmly and update at 20 Hz; fish and other simple creatures keep their existing animation and detail. If play stays under 36 fps, mobile Auto first removes shadows and reduces decorative grass/flowers while preserving resolution, outlines and the sharp crop atlas. Resolution is reduced only if that is insufficient, and quality recovers when there is headroom. Explicit manual choices remain fixed; old mobile Auto learned levels reset once so the optimized renderer can measure performance again. Choices are remembered per device. **Settings → Render resolution** (Auto, Sharp, Balanced, Battery saver) caps the pixels drawn per screen pixel: Auto keeps phones at 1.25 like the reference and leaves desktops to the Graphics level. Other Settings: language, full screen, install as app, music and effects volume sliders with vibration, AI neighbours, joystick and its side, PC keyboard layout, difficulty, new-bed placement, camera distance and keep backpack on defeat. Models use flat colours, scenery is merged or instanced, and effects are pooled. See [mobile rendering measurements](docs/mobile-performance.md) for the tested savings and tradeoffs.

The dense worlds stay light: repeated scenery is drawn as instances in 64 m tiles, models whose parts differ only in colour are merged with baked vertex colours, small ground cover and distant creatures cast no shadows, collision and paths use a grid index, and each planet's scenery file downloads only when that planet is first reached. In the village on a phone-sized view this brought a frame from 344 WebGL draw calls to 219.

## GitHub Pages edition

Play the [solo browser edition](https://buicongnguyen.github.io/cute_game/). The full source is available in the [public GitHub repository](https://github.com/buicongnguyen/cute_game).

```sh
npm run build:pages
```

This creates only the playable static files in `dist/`, with the `/cute_game/` path prefix. It includes farming, fishing, combat, all worlds and progression, original runtime models, browser saves and offline installation. The Pages interface clearly identifies solo play. Accounts, friends, chat and shared worlds require the Node/WebSocket service and remain available with `npm run dev`, `npm start`, or the prepared [Render + Neon deployment](docs/multiplayer-deployment.md); GitHub Pages cannot run that service.

The Pages workflow runs all tests before publishing `dist/` from `main`. Source files, editable Blender artwork and account data are not included in the website artifact. `VITE_BASE_PATH` can override the deployment directory; the normal build remains rooted at `/`.

Browser saves are local to each website address. The published site starts a separate adventure from the localhost game.
## Source guide

- `src/content.ts`, `model.ts`, `progression.ts`: catalog, game rules, persistence and rewards.
- `src/combat.ts`, `fishing.ts`, `gameplay-controls.ts`, `gestures.ts`: timed gameplay and input.
- `src/world.ts`, `enemy-types.ts`, `boss-patterns.ts`, `environments.ts`, `lava-weather.ts`: world simulation and encounters.
- `src/environment-art.ts`, `decorations-art.ts`, `combat-view.ts`, `assets.ts`: original rendering and model integration.
- `src/main.ts`, `online.ts`, `platform.ts`: interface, shared play and browser installation.
- `src/fx.ts`, `sfx.ts`, `fishing-view.ts`, `graphics.ts`: pooled hit effects and floating numbers, synthesized sounds, in-world fishing, and adaptive graphics quality.
- `server/`: HTTP/WebSocket account service, file/PostgreSQL persistence, database utilities, development launcher and offline build generator.
- `tests/`: deterministic simulations and live HTTP/WebSocket integration tests.
- `art/`: headless Blender generators for the props, scenery, crops, fish, the explorer and every wearable item, weapon, pet, disguise and material icon, plus their contract, previews, Unity FBX exports and the asset guide (`art/ASSET_GUIDE.md`).
- `src/style.css`: interface design tokens and all HUD, panel, message and label styles.
- `docs/reference-update-plan-2026-10-02.md`: current update implementation, bilingual reference Help, deliberate differences and remaining hosted/device acceptance.
- `PARITY_REVIEW.md`: earlier coverage and evaluation history.

The earlier `ANALYSIS.md`, `REVIEW.md`, `EVALUATION.md` and `MULTIPLAYER_ASSESSMENT.md` record the initial evaluation and engine decision. Their old feature-gap lists are superseded by this README and the current parity review. Unity was assessed for browser multiplayer; this implementation keeps the existing web engine.
