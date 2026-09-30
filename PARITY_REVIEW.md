# Zoo Garden parity review

Review date: 30 September 2026. Project: `C:\Users\n\source\repos\cute_game`.

The local browser game now covers substantially more of [Zoo Pet](https://zoo-pet.store/) than the first evaluation build. The crop, equipment, economy and progression catalogs were checked against observable gameplay facts in the public reference client. Local rendering, interface text, game logic, models and multiplayer services are independently authored.

This is a substantially expanded evaluation build. Two independent browser accounts verified shared worlds, persistence, friends, private parties, chat and read-only home visits. The implementation uses original art and an independently built world; this report does not claim pixel-for-pixel equivalence or exhaustive long-session balancing.

## Coverage matrix

| Area | Reference behavior checked | Local coverage | Verification and limits |
|---|---|---|---|
| Browser play | Walk, interact, fight, farm and fish in a 3D world | Three.js browser game with mouse, keyboard and touch controls | Playable locally. Long sessions on physical phones still need evaluation. No Unity port was made. |
| Crops | 19 crops with individual level gates, timers, XP, sale values, food buffs and three special seed requirements | All 19 catalog entries implemented with measured values | Automated test checks every crop's unlock, duration, XP and sale value. Rare-seed consumption, harvest timing and duplicate harvest protection tested. |
| Starting garden | Nine beds; up to 24 additional beds | Nine starting beds, 33 total maximum; expansion cost `60 + 20 × existing extra beds`, or a bed kit | All 24 expansions exercised. Old six-bed saves receive three new, positioned beds while preserving crops and previous purchases. |
| Farming supplies | Fertilizer halves remaining growth; magic spores ripen a crop | Both effects, single-bed planting, plant all and harvest all | Consumption and harvest boundaries tested. |
| Equipment and items | Six equipment slots and full public item/equipment catalogs | Weapon, hat, outfit, boots, companion and disguise; 214 item definitions including 38 cooked foods and two retained legacy possessions | 64 shop offers, 30 workshop recipes and two ancient-furnace recipes. Material and currency transactions tested. |
| Stats and economy | Level threshold `round(25 × level^1.55)`; health, attack, defense and critical upgrades | Reference formulas, escalating prices, food effects, expiry and cooking multipliers | XP carry-over, health restoration, exact costs, cooking and timed effect persistence tested. |
| Disguises and combat | Ten disguises, each with four skills; weapon-dependent attacks and specials | All ten disguise definitions and 40 skill entries; melee, projectiles, dash, spin, landing attacks and status effects | Catalog and combat simulation tests pass. Every visual effect has not been compared frame by frame with the reference. |
| Fishing | 18 fish plus junk, water-specific catch weights, rods, bait, bite window, tension, rare and huge catches | Catalog, weighted catches and fishing minigame; huge catch flag preserves the reference's in-range size rule | Catch rewards, records, collection tracking and huge/common distinction tested. The complete visual fishing sequence still needs side-by-side evaluation. |
| Worlds | Home and eight other destinations with different travel gates and fares | Clover Village, Candy, Frost, Volcano, Toybox, Jungle, Ocean, Cloud and Night worlds | All nine destinations reached during the model story test. Home includes the surrounding forest, meadow, swamp and canyon regions. |
| Creatures | Species-specific stats, loot, bosses and behavior | 59 creature definitions, including 17 boss definitions | Shared catalog and combat behavior implemented; deterministic combat tests cover representative attack types. Full late-game combat balancing remains a play-test task. |
| Volcano | Gate, cave chest, fire crystals, three braziers, furnace, lava hazards and special events | Persistent gate/braziers, daily cave chest, resource cooldowns, furnace recipes, lava tides, meteor/treasure events, dormant dragon and phased arena flooding | Independent navigation tests reach the gate, chest, five fire-crystal veins, three braziers and furnace. Deterministic weather, ore lifetime, dragon hazards and host migration have automated checks. |
| Toybox | Surprise boxes, timed return and random effects; trains | 26 stable gift IDs, saved 45-second cooldowns, weighted giant/tiny/energy/heal/bomb/parts/slow outcomes; moving trains | Reload does not bypass the gift timer. Old once-only gift records migrate to renewable cooldowns. |
| Jungle | Fruit, poison and changing thorn barriers | Fruit healing and temporary effects, fruit regrowth, poison regions and thorn cycles | Environmental interactions and timed hazards have simulation coverage; extended manual play across every combination remains an evaluation task. |
| Ocean | Swimming, oxygen, bubbles, clams and sea turtles | Water movement, oxygen, air bubbles, pearl clams and timed turtle rides | All 19 clam/turtle interaction nodes reached in an independent headless navigation check. |
| Cloud | Separate islands, bounce routes, wind, lightning and falls | Connected island graph, bounce travel, wind, timed lightning warnings and fall recovery | All 50 bounce endpoints are approachable from their island and target a valid landing island. Shared lightning timing survives host migration. |
| Night | Darkness, illuminated safe areas and light pillars | Player illumination, light sources and timed pillars | Implemented; shared environment state is included in multiplayer synchronization. Visual darkness and encounter pacing need browser evaluation. |
| Story | 29 milestones, chapter rewards and repeatable later tasks | Full story sequence and repeatable continuation | All 29 milestones completed in an automated journey through public model operations, reaching level 25 and every planet without direct currency or XP grants. |
| Recurring progression | Three daily and four weekly tasks, check-in streak, chests, achievements, monthly star pass, bounties and timed challenges | Functional objectives, rewards, persistence, period resets and replay protection | UTC day/week/month boundaries, stale claims, successive achievement tiers, targeted bounties, challenge expiry and streaks tested. Pass has 30 tiers at 50 stars each. |
| Collection and decorating | Six themed collections and home decoration placement | Discovery tracking; place, move, rotate and recover decorations; maximum 40 decorations | All 21 decorations have distinct original models. Persistence and returned inventory tested. Collection panels track discovery without inventing reward claims. |
| Saving and recovery | Persistent adventure, crops, equipment and inventory | Version-1 migration, local saves, separate online profile, dropped-bag recovery and retained old colors/items | Malformed saves, inherited identifiers, finite numeric state, level-1000 preservation, equipped-copy protection and repeated death recovery covered. |
| Multiplayer | Accounts, shared worlds, friends, visits, parties and chat | Local Node server, account profiles, public/private rooms, host-driven shared creatures, friends, read-only garden visits and chat | Two browser accounts verified parties, chat, friends, visits, farming, shopping, equipment and persistence. Server tests cover shared combat, late joining, weather, host migration, ore claim deduplication and stale save rejection. |
| Install/offline | Browser installation and continued local play | Web manifest, service worker and generated offline cache | Production build precaches 18 files. Nine isolated regressions verify cache contents, offline navigation/assets, API exclusion, update cleanup, cache isolation, fullscreen and install prompts. Physical installation is not claimed. |

## Intentional changes

- English names and interface text are independently authored. Original Blender assets and procedural models preserve the friendly visual direction without reproducing the reference artwork.
- The bag and chest use unrestricted item quantities instead of the reference's 20/40 slots and 99-item stacks. This avoids destroying existing possessions during migration or silently discarding rewards.
- Earlier equipment, materials, colors and planted crops remain usable. Legacy identifiers such as turnip, sword and fertilizer migrate to their current equivalents; original wood and bunny possessions remain available.
- Offline and online adventures are separate. Signing out restores the offline adventure rather than replacing it with the account profile.
- Renewable rewards use persisted timestamps. Reloading does not reset mine, resource or gift cooldowns.
- If an explorer falls again before retrieving a dropped bag, its old contents move to storage rather than disappearing.

## Verified in this review

The model/progression test suite covers the complete crop table, garden expansion, transactions, equipment, food, crafting, reward cooldowns, migration and progression. The full story journey uses planting, harvesting, selling, shopping, crafting, cooking, mining and travel operations. Successful creature and fishing outcomes are simulated through the same public reward functions used by the game; they are not arbitrary test grants. It finishes all 29 milestones, visits every planet, places decorations, equips a disguise and confirms that progression survives saving.

A separate world interaction check uses real Three.js objects and the actual world navigation/update functions without creating a WebGL renderer. It checks 50 cloud bounce endpoints, the complete cave-to-furnace interaction route and 19 aquatic interaction nodes. These checks complement browser evaluation; they do not verify rendering, animation or physical touch hardware.

All 150 integrated tests passed, with no failures or skips. TypeScript checking and the production build passed. Results are recorded in TEST_RESULTS.txt and BUILD_RESULTS.txt alongside this report. The only build advisory is the size of the separately bundled Three.js renderer.

### Browser checks completed

- Existing Clover save retained its level, currency, old equipment and crops through migration.
- Nine carrots planted, grown, harvested and sold; story rewards and equipment purchases survived reload.
- Two accounts joined a private party, exchanged test chat, became friends and visited a read-only garden.
- A real server restart expired the session safely; signing back in restored the level-2 account and 120 energy.
- In the online forest, Whirlwind and Ground Slam damaged shared creatures, awarded three defeat rewards, advanced the boar bounty, and raised the test player to level 3. The home action returned the player to safety.
- Desktop and 390 × 844 responsive views inspected. No application console errors observed in the checked sessions.
- Fishing cast/nibble UI inspected; catch/tension outcomes are covered by simulation tests, not a claimed complete manual catch.

## Run and evaluate locally

Use a recent Node.js release that supports the project's TypeScript runtime tests. The project has been exercised with Node.js 26.7.

```powershell
cd C:\Users\n\source\repos\cute_game
npm install
npm run dev
```

`npm run dev` starts the local multiplayer service and browser development server together. Open the browser address it prints, normally `http://127.0.0.1:5173`. The local account service normally listens on port 8787.

For a production build served by the same multiplayer service:

```powershell
npm run build
npm start
```

Open `http://127.0.0.1:8787`. To check rules and integration tests, run:

```powershell
npm test
```

For two-player evaluation on one computer, use two separate browser profiles or a normal window and a private window. Create different accounts through **Play together**, enter the same public world or private party, then test movement, shared creatures, chat and a friend visit. Two tabs sharing one account are intentionally treated as the same adventure.

The account database is stored locally in `data/accounts.json`. Browser-only preview mode does not provide the account service; use `npm run dev` or `npm start` for multiplayer.

## Remaining evaluation and hosting limits

Map geography is not identical. In particular, the current lava world has five basins, five ferries, six eruption vents and fourteen mesas rather than the reference's cross-map river network and larger vent population. Cave and furnace placement differs. The dragon nest location/radius, eleven safe islands, phased flooding, warnings and event-end dismissal are implemented. An unfinished river-layout experiment is retained outside the playable project; it was not included in the tested build.

The game has not been deployed publicly. Friends on other networks will need a reachable Node host and public deployment with HTTPS/WSS; the printed loopback address only serves this computer. Browser installation features also depend on a secure context, with localhost accepted for development.

Shared creatures currently use a player host for simulation, with server routing, account storage and room coordination. This is suitable for cooperative evaluation; it is not a competitive, cheat-resistant authoritative game server. Full simulation and reward authority on the server would be a separate production step.

Automated tests verify shared enemy/projectile/environment state during late joins and host migration, idempotent saves, stale save protection, offline cache updates and the complete story progression. Browser checks verify recovery after a real service restart: the offline adventure was restored safely and signing back in recovered the online level, currency and equipment. Remaining evaluation concerns are sustained combat under poor network conditions, physical phone performance and installation, every late-game skill animation, and subjective difficulty/feel. Weather uses a deterministic local/shared-world clock rather than the reference service's live event schedule; art, scenery placement and English text are original.
