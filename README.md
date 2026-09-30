# Zoo Garden

A browser adventure built against the gameplay of Zoo Pet, with independently authored Three.js code, original Blender assets, and local multiplayer services. The expanded build includes the reference crop, equipment, creature, progression and crafting catalogs, along with full-size worlds and their activities.

## Run

Tested with Node.js 26.7. Use Node.js 22.18 or later for native TypeScript support in the server and tests.

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

- Click or tap to walk; hold the ground to steer. Arrow keys and the touch direction pad also work. Scroll or pinch to zoom.
- Click objects to approach and interact. **F** uses the nearest object. **I** opens the backpack, **J** the journal, **M** the map, and **Escape** closes a panel.
- **Space** attacks. **Q/W/E/R** use four skills, with different specials for weapons and disguises.
- Plant, harvest and sell crops. Buy gear and equip it from the backpack. The journal guides the first adventure and awards story, daily, weekly and achievement rewards.
- Equip a fishing rod and visit a pond. Wait for the bite, then hold to reel and release during surges. Watch both line tension and progress.
- Store valuables in the chest. If defeated, recover loose items from the dropped bag. A second defeat moves the previous bag's contents safely into storage.
- Explore four regions around home, then use the rocket to visit eight other worlds. Watch environmental warnings and bring suitable equipment.

## Online play

Open **Play together** to create a local account or sign in. Accounts use usernames and passwords; no email is required. Offline and online adventures have separate saves. Signing out restores the offline adventure you left behind.

Online players share the wild areas, enemies, boss attacks and world events. Gardens are private; friends can visit and see planting or decorating updates. Use a party code for a private shared world. One browser tab per account is active at a time.

For two-player testing on one computer, use separate browser profiles or a normal window and a private window, and create different accounts. This build was also exercised with separate localhost hostnames.

The server stores account profiles in `data/accounts.json`, excluded from source control. Back up that file to retain online progress. Browser saves remain in that browser's local storage. Online saves use revisions, retry deduplication and a local pending copy to avoid overwriting newer progress during interrupted connections. Restarting the server ends sign-in sessions; sign in again to resume.

The default server listens only on this computer. Internet play requires deployment of both the built game and the Node/WebSocket service, persistent storage and HTTPS. No public deployment was performed. Shared creature simulation uses an elected player host with migration; it is intended for cooperative play and is not a competitive anti-cheat economy.

## Included

- 19 crops; nine starting beds, expandable to 33; fertilizer, rare seeds, cooking and timed food effects.
- Six equipment slots, ten disguises with four skills each, 64 shop offers, 30 workshop recipes, two furnace recipes and 21 distinct placeable decorations.
- Nine full-size worlds; four home regions; species-specific creatures, bosses, loot, ranged attacks and status effects.
- Ice inertia, volcano warnings and tides, cave and furnace progression, special lava weather, toy trains and renewable gifts, jungle thorns and poison, ocean oxygen and turtles, cloud bounce routes and night-world light pillars.
- 18 fish plus junk; water-specific catches, rare and huge fish, bait and collection records.
- 29 story milestones and ongoing tasks, daily and weekly activities, achievements, monthly star pass, bounties, timed challenges and six collection groups.
- Account saves, friends, visits, chat, private parties, shared creatures and environments, plus offline browser play and install/fullscreen support.
- Preserved version-1 saves, colors and possessions. Earlier six-bed gardens receive three additional beds.

The interface uses English and original artwork. Inventory and storage have no slot limit, so migration and reward collection do not discard possessions. These are intentional improvements. Physical-phone performance, browser installation behavior and long-session balancing still benefit from user play-testing.

## GitHub Pages edition

The solo browser edition is prepared for https://buicongnguyen.github.io/cute_game/.

```sh
npm run build:pages
```

This creates only the playable static files in `dist/`, with the `/cute_game/` path prefix. It includes farming, fishing, combat, all worlds and progression, original runtime models, browser saves and offline installation. The Pages interface clearly identifies solo play. Accounts, friends, chat and shared worlds require the Node/WebSocket service and remain available with `npm run dev` or `npm start`; GitHub Pages cannot run that service.

The Pages workflow runs all tests before publishing `dist/` from `main`. Source files, editable Blender artwork and account data are not included in the website artifact. `VITE_BASE_PATH` can override the deployment directory; the normal build remains rooted at `/`.

Browser saves are local to each website address. The published site starts a separate adventure from the localhost game.
## Source guide

- `src/content.ts`, `model.ts`, `progression.ts`: catalog, game rules, persistence and rewards.
- `src/combat.ts`, `fishing.ts`, `gameplay-controls.ts`, `gestures.ts`: timed gameplay and input.
- `src/world.ts`, `enemies.ts`, `boss-patterns.ts`, `environments.ts`, `lava-weather.ts`: world simulation and encounters.
- `src/environment-art.ts`, `decorations-art.ts`, `combat-view.ts`, `assets.ts`: original rendering and model integration.
- `src/main.ts`, `online.ts`, `platform.ts`: interface, shared play and browser installation.
- `server/`: HTTP/WebSocket account service, development launcher and offline build generator.
- `tests/`: deterministic simulations and live HTTP/WebSocket integration tests.
- `art/`: editable Blender source, export scripts, GLB/FBX assets and the asset guide.
- `PARITY_REVIEW.md`: detailed coverage, validation and remaining evaluation limits.

The earlier `ANALYSIS.md`, `REVIEW.md`, `EVALUATION.md` and `MULTIPLAYER_ASSESSMENT.md` record the initial evaluation and engine decision. Their old feature-gap lists are superseded by this README and the current parity review. Unity was assessed for browser multiplayer; this implementation keeps the existing web engine.
