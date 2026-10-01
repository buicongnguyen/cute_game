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

- Click or tap to walk; hold the ground to steer. Arrow keys also work. Phones enable a draggable joystick by default, with skills on the opposite side. Settings can swap hands or restore tap controls. Scroll or pinch to zoom.
- Click objects to approach and interact. **F** uses the nearest object. **I** opens the backpack, **J** the journal, **M** the map, and **Escape** closes a panel.
- Stand near a creature and your explorer fights it automatically; click one to chase it down. **Space** attacks the nearest creature. **Q/W/E/R** use four skills: the whirlwind spins with arms out, the dash lunges through enemies, the ground slam leaps and crashes down with a shockwave, and the fourth is your weapon's or disguise's special.
- Creatures shout "!" when they notice you, crouch and tremble before they strike, slide back when hit and pop into experience orbs when defeated. Critical hits briefly freeze the action and shake the camera. Bosses show a health bar at the top of the screen.
- Plant, harvest and sell crops. Gear you buy is equipped straight away and appears on your explorer: weapons in hand, hats, outfits, boots, disguises and a pet that follows you. Swap gear from the backpack. The journal guides the first adventure and awards story, daily, weekly and achievement rewards.
- Keep a fishing rod in your backpack: the best owned rod appears automatically near a pond. Tap the pond or press **F** to cast, and the fish swimming in the water come to investigate. Leaving the shore or attacking restores your chosen combat weapon, another owned weapon, or bare fists. Press **Reel** (or Space) the moment one bites, hold to pull it toward the shore, and let go when it surges or the line turns red. The catch leaps into your arms, and the journal's Collection tab keeps your record for every species.
- Store valuables in the chest. If defeated, recover loose items from the dropped bag. A second defeat moves the previous bag's contents safely into storage.
- Explore four regions around home: a pine and toadstool forest, a flower meadow, a reedy swamp and a red-rock canyon, joined by winding sand trails. Each of the other eight worlds is dressed in its own scenery, from lollipop trees and giant donuts to snowy pines, glowing lava rocks and twisted night trees.
- Fly between worlds yourself. Open the starship's star map, fill the tank for ϟ 20 and take off. In space, hold the screen (or the mouse, or **W A D**) to steer, hold **Boost** (or **Shift**) to go faster at five times the fuel, and **S** to brake. Collect ✨ stardust to refuel (+3 energy each, and now and then a star shard), bounce off the asteroid belts, and follow the **?** on the radar to discover new planets. Hover over a planet and press **Land** (or **L**); landing needs the planet's level. Running out of fuel never strands you: the ship just crawls until it reaches stardust. **Home** flies you straight back to Clover Village.
- Watch environmental warnings and bring suitable equipment.

## Online play

Open **Play together** to create an account on the current game server or sign in. Accounts use usernames and passwords; no email is required. Offline and online adventures have separate saves. Signing out restores the offline adventure you left behind.

Online players share the wild areas, enemies, boss attacks and world events. Gardens are private; friends can visit and see planting or decorating updates. Use a party code for a private shared world. One browser tab per account is active at a time.

For two-player testing on one computer, use separate browser profiles or a normal window and a private window, and create different accounts. This build was also exercised with separate localhost hostnames.

For local development without `DATABASE_URL`, the server stores accounts in `data/accounts.json`, excluded from source control. Back up that file to retain local account progress. With `DATABASE_URL`, account credentials, profiles, save revisions, friends, and friend requests persist in PostgreSQL. The Render configuration requires Neon and fails startup if the database is missing or unavailable. Browser offline saves remain in that browser's local storage. Online actions use revisions and immutable request IDs; durable receipts make retries safe without uploading a client save. Identical retries return the original action result with the current canonical profile.

Restarting the server clears sign-in sessions, parties, chat history, and active rooms; players sign in again to resume their saved account progress. Run one server instance because live sessions and rooms are held in memory.

The default server listens only on this computer. [`render.yaml`](render.yaml) and the [Render + Neon deployment guide](docs/multiplayer-deployment.md) prepare one free HTTPS service for the complete game, account API, and WebSockets. Automatic code deploys are off, and the database connection is supplied privately in Render. The configuration does not create or deploy any remote resources by itself. When deployed, players open the new Render address; GitHub Pages remains the separate solo edition.

Copy `.env.example` to `.env` for local database settings. `npm run db:check` checks the PostgreSQL connection; `npm run db:import -- --path "C:\path\accounts.json"` explicitly imports a legacy account file into an empty PostgreSQL destination. See the deployment guide before importing. Never put database credentials in a `VITE_*` variable.

The server calculates online spending, rewards, combat damage, health and cooldowns. An elected browser host still supplies bounded enemy movement and visual snapshots; movement and fishing telemetry are not proof of honest human input. This remains cooperative multiplayer, not a complete anti-cheat guarantee.

## Included

- 27 crops, including eight long-growing fruits; nine starting beds, expandable to 33; rare seeds, cooking and timed food effects. Each fertilizer removes half the original growing time, so two applications ripen a newly planted crop.
- Up to 10 chickens, ducks, cows and pigs each, plus one permanent guard dog. Animals stockpile eggs, duck eggs, milk or truffles during a two-real-hour lifespan, then become meat. One game hour is 60 real seconds; production takes 120/180/240/360 seconds and continues offline. Species shelters store five products and shorten production to 70%. Cows graze three times as long as they walk.
- Six equipment slots, ten disguises with four skills each, workshop and furnace crafting, placeable decorations, nine Titan hats and nine combat companions. Weapon forging reaches +15 with 30% success; failed attempts consume materials.
- Nine full-size worlds, each with its own scenery mix, a three-row border and shaded ground; four home regions; a piloted starship flight with fuel, stardust, asteroid belts, planet discovery and landing; species-specific creatures, bosses, loot, ranged attacks and status effects.
- Ice inertia, volcano warnings and tides, cave and furnace progression, special lava weather, toy trains and renewable gifts, jungle thorns and poison, ocean oxygen and turtles, cloud bounce routes and night-world light pillars.
- 18 fish plus junk; water-specific catches, bait, collection records and mysterious silhouettes that reveal supergiant fish or unusual items.
- 29 story milestones and ongoing tasks, daily and weekly activities, achievements, monthly star pass, bounties, timed challenges and six collection groups.
- Account saves, friends, visits, chat, private parties, server-approved crop theft and guard dogs, shared loot with ten-second owner priority and thirty-second expiry, plus offline browser play and install/fullscreen support.
- Nine Titan encounters, moving dinosaur giant attacks, planet-specific hazards and a home discovery sign showing explored worlds out of nine.
- Preserved version-1 saves, colors and possessions. Earlier six-bed gardens receive three additional beds.

The interface supports English and Vietnamese with original artwork. Choose a language on the welcome screen or in Settings; the preference stays on this device and does not change saved progress or player names. Vietnamese catalog terms follow the reference game where available, with translations for this game’s additional features. Each panel has its own colour band and icon, messages appear as short pills near the bottom of the screen, and on phones panels open as bottom sheets. Inventory and storage have no slot limit, so migration and reward collection do not discard possessions. These are intentional improvements. Physical-phone performance, browser installation behavior and long-session balancing still benefit from user play-testing.

## Graphics and phones

Settings → Graphics offers Auto, Sharp, Balanced and Battery saver. Auto starts phones on Balanced and desktops on Sharp, then watches the frame rate: if it stays under 36 fps it lowers the render resolution, then the shadow and particle quality, and it raises the resolution again when there is headroom. The choice is remembered per device. Models use flat colours rather than textures, scenery is merged into a few draw calls per area, and effects are pooled, so the game does not rely on normal maps or large textures.

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
