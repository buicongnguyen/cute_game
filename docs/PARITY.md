# Parity matrix: Zoo Garden vs https://zoo-pet.store (Zoo Pet)

Reference investigated on: 2026-10-06 (bundle `index-CgCMMPRt.js`, app version `muvh7368`; previous rounds `CgMqZuZ2` 2026-10-01 and `CmwoDrOY` 2026-10-02), plus its 2026-10-07 balance patch. The reference was not re-opened after that. Clone rows refreshed on 2026-10-10 against `91ded7d` (rounds 2026-10-06 to 2026-10-09: dungeon, Colossus, economy, leaderboard, extras, Flag Rush, Rescue Call phase 1, solo-friendly limits).
Intentional differences agreed with the user: English + Vietnamese UI, original Blender art, AI neighbours, phone joystick on by default, roomier bag and chest than the reference (100 + 10x5 and 120 + 20x4), fertilizer halves growth, game-hour farm clock with 2 h livestock lifespan, chicken/cow prices and caps from earlier rounds, automatic rod selection, forgiving death bag (7 days, 20 bags, a keep-my-bag setting), solo-friendly daily limits (dungeon 6 runs, Flag Rush 12 paid matches, Rescue Call 8 full-pay wins, 80 decorations), a wider Colossus window, solo GitHub Pages edition.

Status: `missing` · `partial` · `done` · `verified` (with evidence) · `differs` (on purpose, say why;
write "decide" in Notes until the user has agreed) · `n/a`
Impact (open rows): 3 = the user notices at once · 2 = in normal play · 1 = rarely.
Evidence: `test "<name>"`, `cmp:<viewport>/<NN-step>` (captures from the 2026-10-06 `compare.mjs` run, kept outside the repo; they show the clone as it was then), `F-0xx` (private facts file), `drift` (table-diff unchanged), `probe:<what>`.

Summary: `node <skill>/scripts/parity-status.mjs docs/PARITY.md --check . --compare <captures> --facts <notes>/REFERENCE-FACTS.md`.

Aspects: data · rules · flow · layout · visuals · feel · audio · text · input · performance · mobile · persistence · online · accessibility · onboarding

## Start and shell

| Area | Feature | Aspect | Reference behaviour (fact, with source) | Status | Impact | Evidence | Notes |
|---|---|---|---|---|---|---|---|
| Start | Front door | flow | Account form → "Chơi thử" guest → title card → Play (F-001) | differs | | cmp:390x844/01-landing, cmp:390x844/02-title | One welcome card with profiles and language; local saves instead of accounts on Pages. Accepted in earlier rounds |
| Start | Title card | layout | Logo, name, 6 colours, ▶ Chơi ngay, 📲 install, ⛶ fullscreen, ⚙️ settings, controls hint (F-001) | partial | 1 | test "title card: short, keeps the ids the game and tests use; install markup" | Done 2026-10-08: the card floats over the live village (camera sways) with name, 6 colours, start, language, profiles and the install button. Fullscreen and settings stay in the HUD; no controls hint |
| Shell | News board | flow | 📰 button with badge; board opens 2.5 s after load when unread; tabs Tin cập nhật / Sắp ra mắt (F-002, F-003) | done | | test "the news board: our own entries in both languages, newest first, unread remembered per device" | `news-board.ts`: 📰 button with unread count, auto-open 2.5 s after load (retries until no panel is open), News and Coming soon tabs; entries are our own, both languages, read state per device |
| Shell | Version check | flow | Poll `version.json` every 60 s, toast, auto-save and reload (F-004) | partial | 1 | test "a new worker installs past the HTTP cache, takes over at once, drops old caches and tells pages its scripts" | Clone shows a "new version · Reload" pill from the service worker; no auto-save-and-reload |
| Shell | Notifications | flow | Browser notifications for ripe crops, animal products, new version; off by default (F-012) | missing | 1 | F-012 | No Notification API use in `src/` (checked again 2026-10-10; Rescue Call has its own in-game SOS toast only) |
| Shell | Settings | flow | Graphics tier, shadows, outlines, FPS, joystick, music 0.45 and effects 0.8 sliders, vibration, notifications (F-011) | partial | 1 | test "sound settings: two volumes and vibration, migrated from the old single switch" | Clone has music 0.45 and effects 0.8 sliders, vibration, Graphics (Auto, Sharp, Balanced, Battery saver), Render resolution, joystick and side, difficulty, camera distance, keep-my-bag. No separate shadow/outline toggles, no FPS switch, no notifications |
| Shell | Render resolution | performance | Phones draw at most 1.25 device pixels per CSS pixel (487x1055 on a 390x844 phone) (F-011) | done | | test "Render resolution: Auto caps phones at the reference 1.25x (487x1055 at 390x844) and leaves desktops alone; choices are ceilings" | Settings, Render resolution: Auto, Sharp 2, Balanced 1.25, Battery saver 0.85; a ceiling, the adaptive governor may still go lower |
| Shell | Install as app | mobile | 📲 install on the title and in the top bar; iOS gets Share steps (F-001) | done | | test "title card: short, keeps the ids the game and tests use; install markup" | `install-app.ts`: the browser's install dialog on the title card and in Settings, Share, Add to Home Screen steps on iPhone and iPad, hidden once installed |
| Shell | Language | text | Vietnamese only | differs | | cmp:1440x900/05-bag | English + Vietnamese, agreed |

## HUD and layout

| Area | Feature | Aspect | Reference behaviour (fact, with source) | Status | Impact | Evidence | Notes |
|---|---|---|---|---|---|---|---|
| HUD | Top-right menu | layout | ⚡, 🎒, 📜, 🏆, 📰, 👥, ❔, ⚙️ (+📲, 💬), minimap below (F-005) | partial | 1 | cmp:1440x900/04-home-garden, cmp:390x844/04-home-garden | Clone now has 🏆 Leaderboard and 📰 News as well as ⚡ 🎒 📖 👥 🏘️ ? ⚙ ⛶; no 📲 or 💬 buttons in the bar (install is on the title card and in Settings); extra Home button left of the minimap. The captures predate the 🏆 and 📰 buttons |
| HUD | Size tokens | layout | Button 44 / minimap 150 / skill 82 px desktop; phone 34 / 92 / 54 (F-006) | partial | 2 | cmp:390x844/04-home-garden | Clone minimap 150 on compact layouts; skill buttons smaller on desktop (about 50 px). Not re-measured since |
| HUD | Skill buttons, desktop | layout | Vertical column at bottom-left, Q to R top to bottom, 82 px (F-007) | differs | | cmp:1440x900/04-home-garden | Clone: a row at bottom-right plus a keyboard guide at bottom-left; kept on purpose (the owner has not asked to move them) |
| HUD | Skill buttons, phone | mobile | One row of 4 along the bottom; joystick off by default (F-007, F-010) | differs | | cmp:390x844/04-home-garden | Clone: joystick left + 2×2 skills right, user request 2026-10-02 |
| HUD | Quest tracker | layout | Left under the player card, story + bounty + challenge rows, "▾ Thu gọn" (F-008) | done | | cmp:1440x900/04-home-garden | Clone tracker sits in the same place, foldable |
| HUD | Boss bar | layout | Bottom centre on desktop/landscape, top on phone portrait (F-009) | partial | 1 | F-009 | Clone shows it at the top on every viewport |
| HUD | Dungeon keeper label | layout | "🏰 Bà Giữ Hầm 👥 0/5" label over the south gate (F-040) | partial | 1 | test "everyone in the circle when the 10 s countdown ends goes in together (at most five), in a private room" | Vault Keeper Wren stands by the glowing circle with a 🏰 name tag; no live "party n/5" label over the gate |
| HUD | Dialogs | layout | Centred cream cards with coloured header and ✕ (F-047) | differs | | cmp:1440x900/05-bag, cmp:390x844/05-bag | Clone: right drawer on desktop, bottom sheet on phones (README "intentional improvements") |

## Garden, farm and helpers

| Area | Feature | Aspect | Reference behaviour (fact, with source) | Status | Impact | Evidence | Notes |
|---|---|---|---|---|---|---|---|
| Garden | Home scene | visuals | Small hut, chest, crystal, 6 beds, flowers; camera FOV 40 (F-050) | partial | 2 | cmp:1440x900/04-home-garden | Clone home is denser (pen, well, oven, decorations) and the hut reads larger |
| Garden | Crops | data | 27 crops incl. 8 fruit (F-048) | verified | | drift | table-diff: 19 crops identical; fruit kept in the clone's fruit table |
| Garden | Crop faces and harvest beat | feel | Ripe crops smile; the harvest flies to the collector, XP after it lands (F-048) | done | | tests "harvest beat: ring and label at once, the crop lands on the collector in 0.45 s, XP after it lands, about 0.85 s in all", "ripe crops are big characters, growing stages smaller; fruit trees keep their sizes" | Faces on crops; only the nearest ripe bed shows the ready badge |
| Garden | Fertilizer | rules | Spore grow 1 (F-048) | differs | | test "fruit trees (8 h or more) accept both fertilizers with a two-hour cap; every other crop still takes them" | Clone 0.5 (two doses finish a crop), user requirement; on fruit trees each dose takes at most 2 h so the long timers stay (2026-10-09 economy round) |
| Garden | Garden caps | rules | 40 decorations, 12 animals, 24 extra plots (F-021) | differs | | test "expand costs 60 + 20 per extra bed, prefers a kit in the bag and stops at 24 beds in all (15 extra)" | Clone: 80 decorations (solo-friendly, was 40), 15 livestock in all plus the dog (was 12), 9 + 15 = 24 beds with the same cost curve, bed upgrades to level 5 |
| Garden | Cottage and hero scale | visuals | The hut, chest and explorer are small against the beds; camera FOV 40 (F-050) | partial | 3 | cmp:1440x900/04-home-garden | The clone cottage and explorer read larger than the reference. Open: the user has not picked a scale yet, so nothing was changed |
| Farm | Species | data | Chicken, duck, pig, cow, dog only (F-019, F-023) | differs | | F-023 | Clone adds goat and goose; kept (15 animals in all, up to 10 per kind, goats and geese 9) |
| Farm | Prices | data | Chicken 150, duck 220, pig 380, cow 520, dog 450 (F-019) | differs | | cmp:1440x900/09-pen | Clone chicken 25, cow 70 on Easy (earlier user pricing; Normal and Hard 60 and 120), goat 300, goose 260; duck, pig, dog match. Kept on purpose |
| Farm | Production clock | rules | Real 2/3/4/6 h, no lifespan (F-019, F-022) | differs | | test "livestock expires after two real hours and failed full-stock grants retain the stock" | Clone game-hour clock (60 s) + 2 h lifespan, agreed 2026-10-02 |
| Farm | Pens | data | Pen costs ⚡ + leather/coral/bone; ×0.7 interval, stock 5 (F-020) | partial | 1 | test "species shelters preserve stock and fractional progress, accelerate only nearby matching animals" | Effect matches; costs are energy-only and different values |
| Farm | Buy flow | flow | Shop tab 🐷 Thú nuôi → bag → "Thả trong vườn" (F-021) | differs | | cmp:1440x900/08-shop-pets, cmp:1440x900/09-pen | Clone: animal-pen panel, animals auto-released; agreed 2026-10-02 |
| Farm | Guard dog | rules | Chase 6 s, bite 18 / 30 with pen (F-016) | verified | | test "guard dogs are unique permanent guardians, with pen-dependent bites and no production or meat" | |
| Farm | Products | data | Egg 30/40, duck egg 45/55, milk 70/90 + regen, truffle 160 (F-024) | partial | 1 | F-024 | Clone values from the 2026-10-02 plan; not re-diffed this round |
| Helpers | Garden and pen robots | rules | None in the reference (F-025) | differs | | test "the helper costs ϟ1000 once, only at home, and older saves have none" | Clone extension requested by the user |
| Helpers | Behaviour | feel | None in the reference (F-025) | differs | | test "the helper costs ϟ1000 once, only at home, and older saves have none" | Idle helpers walk home to rest or stroll round the farm instead of standing at their post; collected eggs, milk and crops fly to the helper; helpers grow to at most 80% of the explorer's height; the garden robot rests the last 3 h of the UTC day. Clone extension |

## Bag, shop, forge

| Area | Feature | Aspect | Reference behaviour (fact, with source) | Status | Impact | Evidence | Notes |
|---|---|---|---|---|---|---|---|
| Bag | Slots | rules | Bag 20 slots, chest 40, stack 99 (F-018) | differs | | test "the backpack and chest start at their base slots; a slot is one item id; worn copies sit in their gear slot" | Chosen on purpose: bag 100 kinds + 10 up to 5 times (150), chest 120 + 20 up to 4 times (200); a slot is one item id so stacks never split. The reference's 20 and 40 felt cramped with this game's item count. Old over-full saves keep everything |
| Bag | Expansion | flow | Bag 20→40 in 5 tiers, chest 40→80 in 4 tiers, ⚡ + rare materials (F-018) | done | | test "expansion costs follow the reference table exactly and use backpack materials only" | Same tier count (5 and 4) and the reference's cost formula (bag ⚡200 a tier, chest ⚡300); only the sizes differ (see Slots) |
| Bag | Layout | layout | 6 equip slots, stats, grid, expand card, counters, collections button (F-047) | partial | 2 | test "bag panel markup: slot meter, expand card with have/need chips, maxed card" | Clone now has a slot meter and an expand card with have/need chips; still a grouped list in a drawer, no kill/harvest/fish counters or collections button in the bag |
| Shop | Tabs | data | 8 tabs incl. Thú nuôi, Vũ trụ, Huyền thoại (F-046) | partial | 1 | cmp:1440x900/07-shop | Clone 6 tabs (Vũ khí, Quần áo, Thú cưng, Hóa trang, Vật dụng, Trang trí); items regrouped |
| Shop | Items and prices | data | 74 entries (F-046) | partial | 1 | F-046 | table-diff: 64 shared unchanged; 10 animal/pen rows live in `farm.ts`; 13 clone-only items |
| Shop | Buy flow | flow | Buy → bag; equip from the bag | differs | | cmp:1440x900/07-shop | Clone equips on buy and offers try-on; user choice 2026-10-01 |
| Forge | Enhancement | rules | ⚡80+60L + mats, 30%, max +15 (F-030) | done | | F-030 | Implemented 2026-10-02 (`weapon-forge.ts`) |
| Workshop | Recipes | data | 30 recipes | verified | | drift | table-diff unchanged |

## Combat, disguises, pets, bosses

| Area | Feature | Aspect | Reference behaviour (fact, with source) | Status | Impact | Evidence | Notes |
|---|---|---|---|---|---|---|---|
| Combat | Targeting and damage | rules | Auto-target 6/2.4 m, crit cap 85%, def/(def+60) (F-031) | done | | F-031 | Earlier rounds |
| Combat | Default skills | data | Q cd 7, W cd 4, E cd 9, R weapon special (F-032) | done | | cmp:1440x900/10-fight | Same names and cooldown display |
| Combat | Weapon specials | data | 16 specials (F-032) | partial | 1 | F-032 | 16 shared unchanged; clone adds volley, anchor, lotus, dragon, eagle, goldstar for its extra disguises |
| Combat | Death | rules | 3 s countdown; bags last 24 h, max 10 (F-033) | differs | | test "a defeat drops the loose backpack in a bag at the spot; it lasts 7 days and up to twenty are kept" | Clone: the loose backpack drops in a bag at the spot, bags last 7 days (was 24 h) and up to 20 are kept (the oldest is banked in the chest); Settings, Keep backpack on defeat, skips the drop, and it is ON by default (new saves and saves that never chose; an explicit off stays off): differs from the reference on purpose (test "keep-my-bag is on by default" in tests/econ2.test.ts). The named test still carries the older 24 h wording; `death-bags.ts` holds the 7-day value |
| Disguise | Roster | data | 10 disguises with prices and boss drops (F-034) | differs | | test "all 16 disguises have exactly four skills, a kit entry, a description, a sound and an icon each" | Clone has 16 (army, navy, áo dài x2, USA, Vietnam added), kept |
| Disguise | Skills | data | 40 skills, cooldowns per F-035 | verified | | tests "the ten reference disguises keep its cooldowns and icons, slot by slot", "reference mechanics: ranges, damage factors and durations match its skill code" | The ten shared disguises use the reference's four skills with its cooldowns |
| Disguise | Uniform kits | rules | None (the six uniforms are ours) | differs | | tests "the six uniforms have their own kits, shaped like the reference kits", "the six uniform specials: toy names and tips, Vietnamese, their own sounds" | Own kits and toy-themed specials that fit each suit; clone extension |
| Disguise | Summons | rules | Shadow clones, snow decoy, shields (F-035) | done | | tests "shadow clones: four of them, each with 25% of your health, taunting, still hitting for ×0.5", "snow decoy: 60% of your health; broken early it bursts ×2.5 and freezes at once, and never bursts twice" | Ninja makes 4 clones that draw and take enemy attacks; the snow decoy has HP; the knight's shield reflects shots; summons are hittable with HP |
| Disguise | Boss drops | rules | robot/gorilla/leviathan/shadowlord 8%, phoenix 6%, superhero at pass tier 30 (F-034) | partial | 1 | F-034 | Not re-checked against `LOOT_TABLES` this round |
| Pets | Attack loop | rules | Shot every cd at ≤7 m for ATK × dmg; skill pets cycle skills (F-036) | partial | 1 | test "each Titan reward can be earned, equipped for real stats, saved, and used as an attacking companion" | Dungeon companions now cast two skills each in fights (test "pet skills strike the creatures around their target"); the other pets still shoot only; pet_robot shot differs (volt vs rainbow) |
| Pets | Boss pets | rules | None for ordinary bosses; no first-kill guarantee (F-038) | differs | | test "the first defeat guarantees the pet exactly once, later kills are a 10% chance" | Clone extension, kept: a Little pet for each of the 17 bosses (first defeat guaranteed, then 10%) and for the nine Titans |
| Bosses | Titans | data | 9 titans, hat 12%, pet 6% (F-039) | verified | | test "nine planets have distinct Titans, complete moves, and independent legendary hat and pet loot" | |
| Bosses | Boss scaling | rules | HP × jf × (7/1.4/2.6), +60% per extra player, enrage <30% (F-037) | partial | 2 | F-037 | Titan ×7 matches; player-count scaling and the jf table not re-verified |
| Dungeon | Co-op dungeon | flow | Keeper NPC at the south gate, 5-player lobby, 10 s countdown, 6 runs/day here (reference: 2), 30 min, 5 stages (F-040, F-041) | done | | tests "everyone in the circle when the 10 s countdown ends goes in together (at most five), in a private room", "stage flow: creatures, guardian, portal (auto after 8 s or step in), and home 25 s after the last guardian" | The Delvers' Vault: 5 rooms, 10 s countdown, 30 min cap, up to 5 online; offline AI neighbours fill the party. 6 runs a day here (solo-friendly, the reference has 2), the day turns at midnight Vietnam time |
| Dungeon | Monsters and bosses | data | 10 mob kinds, 5 bosses with 4 skills each (F-041) | done | | tests "every guardian skill telegraphs before it strikes and then hits who stands in it", "scaling: difficulty 5, guardian HP x1.4 and attack x1.35, party size like the reference; skill cadence" | Five original guardians with four telegraphed skills each, original creatures and Blender models |
| Dungeon | Rewards | data | Boss pet 25%, Ấn Hầm Ngục, chest/pillar decorations (F-042) | done | | test "seeded loot rates: own pet 25% (no luck), seals always, the chest 50% on the last guardian" | Companion 25% per guardian (two skills each), Rune Seals always, Delver's Chest decoration 50% on the last |
| Dungeon | Lane PvP and survival modes | flow | 3-lane PvP and survival modes beside the dungeon (F-040) | missing | 2 | F-040 | Not started; Flag Rush and Rescue Call are the clone's first modes of this kind |
| Colossus | World event | flow | Daily 20:00–21:00 VN at Red Canyon (78, 0); all planets darken; runs offline too (F-043) | differs | | tests "Colossus is available 08:00 to midnight Vietnam time, once per day", "once killed it stays down for the day, leaves at the end of the window and wakes again the next day" | The Cinderpeak Colossus wakes at Redrock Canyon (78, 0) every day from 08:00 to midnight Vietnam time (widened with the solo-friendly limits so it is reachable at any hour), 10-minute warning banner, works offline. Planets do not darkenPlanets do not darken. Roar hours (2026-10-10): the reference now wakes it at 02:00, 12:00 and 19:00 UTC for one hour each in local time; we keep our long window and add those three UTC hours as bonus hours (solo kills +25% EXP and +25% loot count, banner line with the next start in local time; online the server pays as before, banner only). Tests in roar-hours.test.ts |
| Colossus | Attacks | rules | 9 attacks, 75% pierce, head ×2.5, armour break 35%, roar stun (F-044) | done | | tests "its blows pierce 75% of defence, cracked armour and scorching halve what is left, and never deal less than 1", "the head weak point: ×2.5 within 10 m of the lowered head (bite, breath, spit or kneeling), else ×1" | Same numbers: 75% pierce, head ×2.5, 35% crack chance, roar stun 2 s within 62 m unless by a foot, kneels at 25%, faster at 50% and 30% |
| Colossus | Health | rules | 3,000,000 for one explorer after the 2026-10-07 balance patch, +80% per extra explorer (F-044) | verified | | test "health is 3,000,000 for one explorer and grows 80% per extra explorer (2026-10-07 balance patch)" | Was 520,000 +35% before the patch. Offline (no server, no room) the clone uses a third of it, about 1,000,000 for one explorer, and AI neighbours may hit for up to 1,200 (was 400): a solo-play ease, online stays 3,000,000 (test "solo Colossus has a third of the online health") |
| Colossus | Rewards | data | Contributor loot, hat_sb_horn 15%, last-hit pet (F-045) | done | | test "helpers share the spoils: recent hitters and the killer, never AI neighbours; the final blow adds the companion" | Cinderhorn Crown 15%, Cinder Heartstone, star shards and more for every helper; Little Cinderpeak for the final blow. Stats kept under the gear ceiling instead of the reference's |
| Combat | Fight scene | visuals | Enemies with HP bars, target ring, cooldown overlay | done | | cmp:1440x900/10-fight | Clone fight shows target frame, HP bars, ring and numbers |
| Combat | Hit feel | feel | Creatures flash on a hit, damage numbers, target ring (F-031) | done | | test "hit confirm: creatures flash white for 0.14 s (titans barely), the explorer glows pink for 0.25 s" | Hit flash 0.14 s, explorer glow 0.25 s; stacking damage numbers; 120 degree melee arc decal |
| Combat | Skill effects | visuals | Smaller, quieter skill effects (F-032) | done | | tests "whirlwind: one thin swelling ring about the hero's size, its hit ticks draw nothing more", "ninja clones: four small puffs behind the clones, no big cloud over them" | Skill visuals made smaller and matched to their names (2026-10-08) |

## Fishing

| Area | Feature | Aspect | Reference behaviour (fact, with source) | Status | Impact | Evidence | Notes |
|---|---|---|---|---|---|---|---|
| Fishing | Mystery shadow spawn | rules | Summoned only while fishing: 10% per attract, ≤1 per 60 s, near the bobber (F-026) | done | | test "the mystery shadow is called only while fishing: 10% per attract, once a minute, near the bobber, three tries" | Changed to the fishing-only rule in the 2026-10-09 economy round; the solo-friendly pass made it show up faster |
| Fishing | Mystery prize | rules | 60% supergiant ×1.6–2.6, else 9 treasures (F-027) | verified | | test "mystery fish has a strict sixty-percent supergiant boundary and bounded size" | |
| Fishing | Fish size | visuals | Model size follows the cm caught (F-028) | partial | 1 | F-028 | Clone size roll matches; model-to-cm scale not checked |
| Fishing | Bite and reel | feel | Hook window 1.4+0.6q, 95% bite, slack 7 s (F-029) | done | | F-029 | Implemented 2026-10-02 |
| Fishing | Weights | data | Per-water weights | verified | | drift | table-diff unchanged |

## Social and online

| Area | Feature | Aspect | Reference behaviour (fact, with source) | Status | Impact | Evidence | Notes |
|---|---|---|---|---|---|---|---|
| Social | Leaderboard | online | 🏆 weekly and all-server boards, 5 + 6 categories, rank line (F-013) | partial | 2 | tests "boards order by score, share ranks on ties and report the caller even outside the top", "the solo board is the player and the neighbours, the same for the same seed and moment" | 🏆 button with weekly (5) and all-time (6) boards and the caller's rank. Online it reads the server's counters (week starts Monday 00:00 UTC, top 50); on Pages and signed out it shows the neighbourhood board (you and the AI neighbours). A real-player board on Pages needs a hosted server |
| Social | Watering | rules | +10%, EXP 5+min(30, lvl), 1 per crop, 5/day per home (F-014) | done | | test "watering numbers: 10% of the remaining time, 5 + min(30, level) XP, five a day per garden" | Matches since the 2026-10-09 round (the older 30 per visitor rule is gone) |
| Social | Guest log | online | 📒 log, kinds water/steal/dog/visit, 30 entries (F-015) | done | | F-015 | `online.ts` diary also logs gifts and messages |
| Social | Theft | rules | 6/day per home, dog blocks (F-016) | verified | | test "crop theft checks friendship, visit, generation, ripeness, range and six successful crops per UTC day" | |
| Social | Parties and gifts | online | None (F-017) | differs | | F-017 | Clone extension |
| Social | AI neighbours | online | None | differs | | test "neighbours live beyond the gates, hunt the nearest ordinary enemy there, and walk through their own gate" | Clone extension agreed with the user; a Settings switch, quiet in fights; they fill the Vault and Flag Rush teams and the Rescue squad and never take loot |

## Game modes

| Area | Feature | Aspect | Reference behaviour (fact, with source) | Status | Impact | Evidence | Notes |
|---|---|---|---|---|---|---|---|
| Flag Rush | Multiworld Gate | flow | Gate beside the south gate, mode picker, Capture the Flag vs teams online (F-040) | partial | 3 | test "the reference numbers: first to 3, 8 minutes + 3 overtime, level 8, respawn 5 s, flag home in 15 s, carrier 15% slower, power-ups every 22 s" | Gatekeeper Orrin at the Multiworld Gate; team sizes 1, 2, 3 or 5 against AI teams; first to 3 captures, 8 min + 3 min golden point, jump pads, seven power-ups. The online part is the next row |
| Flag Rush | Rewards and limits | rules | Daily paid matches (F-040) | done | | test "rewards: winners get the big share; a claim pays once, never faster than played, twelve a day" | 12 paid matches a day (solo-friendly), win 600 / draw 200 energy plus captures, returns and knock-outs, at most 1,400, never faster than 45 s |
| Flag Rush | Online matches | online | Real players on both teams (F-040) | missing | 2 | F-040 | Offline only: AI teams, no lobby or server rules yet |
| Rescue Call | SOS and portal | flow | None in the reference; our own mode (docs/RESCUE-CALL-PLAN.md) | done | | test "orientation: chosen once from the screen; landscape puts your end left, portrait at the bottom with raiders from the top" | A friend's SOS every 30 to 60 min of play (the first after 6, at most 4 a day, it fades after 12 min); portal by the south square; missions can also be started at any time, with a 3-minute team rest |
| Rescue Call | Phase 1 Hold the Line | rules | Own design: squad tower defence | done | | tests "waves: same-size planet creatures, health rising about 18% a wave (+40% on the boss wave), damage 6% a wave", "ladder: weak → strong by item stats per role, distinct disguises (never the hero's), and steps that cost Spark and Star bits" | Three missions (Toybox, Candy, Wild Jungle), five defences, 10 hearts, a squad of up to 5 with the upgrade ladder |
| Rescue Call | Rewards and limits | rules | Own design | done | | test "rescueClaim: validated, once per run, never faster than played, waves capped a day, eight full wins a day with the gift" | 80 waves and 8 full-pay wins a day, a 25% share after that |
| Rescue Call | Phases 2 to 4 | flow | Own plan: more planets, real friends online, more enemy kinds | missing | 2 | | Only phase 1 exists |

## Economy loops and scheduled events

| Area | Feature | Aspect | Reference behaviour (fact, with source) | Status | Impact | Evidence | Notes |
|---|---|---|---|---|---|---|---|
| Economy | Money loops | rules | Buy vs sell, cook vs raw, time-skip items on the longest timers (F-048, F-049) | done | | tests "Cook & sell all cooks every cookable stack first and earns exactly the cooked total it shows", "level gates: late gear needs the level of the world it comes from, to buy and to wear" | Loops run with the real rules module in the 2026-10-09 round: fertilizer on trees capped at 2 h a dose, level gates on late gear, watering 5 a day. Normal and Hard: kitchen from level 14, trees 5 levels later and twice as slow |
| Economy | Difficulty | rules | One difficulty | differs | | test "switching difficulty mid-game changes prices for new purchases; owned animals keep their pace" | Easy, Normal, Hard per save; lowering asks first and works once an hour; Hard pays +15% XP and drops. Clone extension |
| Events | Colossus clock | flow | Daily world boss, UTC+7, offline too (F-043) | differs | | test "Colossus is available 08:00 to midnight Vietnam time, once per day" | See the Colossus row: the window is 08:00 to midnight Vietnam time |
| Events | Vault day | rules | Runs counted per day, Vietnam midnight (F-040) | done | | test "two runs a day, counted at the start; the day turns at midnight in Vietnam" | The day turns at midnight Vietnam time; the limit is 6 a day here |
| Events | Weekly boards | rules | Weekly reset on Monday UTC (F-013) | done | | test "the week starts Monday 00:00 UTC, also across a year boundary" | Same for the solo board |
| Events | SOS calls | flow | Own design | done | | test "rescueClaim: validated, once per run, never faster than played, waves capped a day, eight full wins a day with the gift" | See the Rescue Call rows |

## Progression and platform

| Area | Feature | Aspect | Reference behaviour (fact, with source) | Status | Impact | Evidence | Notes |
|---|---|---|---|---|---|---|---|
| Progress | Daily, weekly, pass, bounty | data | F-049 | done | | test "daily quests, daily chest and check-in each award once and persist" | |
| Progress | Bounty timing | rules | Every 30 min per zone (F-049) | verified | | test "bounties count only the requested creature and expire at the saved half-hour boundary" | |
| World | Planets | data | 9 planets | verified | | drift | table-diff unchanged |
| World | Collections | data | 6 collection groups | verified | | drift | table-diff unchanged |
| Platform | Manifest | mobile | display fullscreen, 3 icons | partial | 1 | probe:recon manifest | Clone manifest display standalone, 2 icons |
| Platform | Engine version | performance | three.js r186 | partial | 1 | probe:recon stack | Clone r180 |
| Performance | Download | performance | 399 GLB, 23.6 MB at start | done | | probe:recon-diff 14.1 MB dev | Clone loads 24 GLB, scenery on demand |
