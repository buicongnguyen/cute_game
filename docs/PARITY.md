# Parity matrix: Zoo Garden vs https://zoo-pet.store (Zoo Pet)

Reference investigated on: 2026-10-06 (bundle `index-CgCMMPRt.js`, app version `muvh7368`; previous rounds `CgMqZuZ2` 2026-10-01 and `CmwoDrOY` 2026-10-02). Clone at `9f17ef6`.
Intentional differences agreed with the user: English + Vietnamese UI, original Blender art, AI neighbours, phone joystick on by default, no inventory slot limit, fertilizer halves growth, game-hour farm clock with 2 h livestock lifespan, chicken/cow prices and caps from earlier rounds, automatic rod selection, forgiving death bag, solo GitHub Pages edition.

Status: `missing` · `partial` · `done` · `verified` (with evidence) · `differs` (on purpose, say why;
write "decide" in Notes until the user has agreed) · `n/a`
Impact (open rows): 3 = the user notices at once · 2 = in normal play · 1 = rarely.
Evidence: `test "<name>"`, `cmp:<viewport>/<NN-step>` (captures from the 2026-10-06 `compare.mjs` run, kept outside the repo), `F-0xx` (private facts file), `drift` (table-diff unchanged), `probe:<what>`.

Summary: `node <skill>/scripts/parity-status.mjs docs/PARITY.md --check . --compare <captures> --facts <notes>/REFERENCE-FACTS.md`.

Aspects: data · rules · flow · layout · visuals · feel · audio · text · input · performance · mobile · persistence · online · accessibility · onboarding

## Start and shell

| Area | Feature | Aspect | Reference behaviour (fact, with source) | Status | Impact | Evidence | Notes |
|---|---|---|---|---|---|---|---|
| Start | Front door | flow | Account form → "Chơi thử" guest → title card → Play (F-001) | differs | | cmp:390x844/01-landing, cmp:390x844/02-title | One welcome card with profiles and language; local saves instead of accounts on Pages. Accepted in earlier rounds |
| Start | Title card | layout | Logo, name, 6 colours, ▶ Chơi ngay, 📲 install, ⛶ fullscreen, ⚙️ settings, controls hint (F-001) | partial | 1 | cmp:1440x900/02-title | Clone card has name, colours, start, language, profiles; install/fullscreen live in the HUD |
| Shell | News board | flow | 📰 button with badge; board opens 2.5 s after load when unread; tabs Tin cập nhật / Sắp ra mắt (F-002, F-003) | missing | 3 | cmp:1440x900/03-home-news | No news button, board or upcoming tab in the clone (`main.ts` top actions) |
| Shell | Version check | flow | Poll `version.json` every 60 s, toast, auto-save and reload (F-004) | partial | 1 | test "a new worker installs past the HTTP cache, takes over at once, drops old caches and tells pages its scripts" | Clone shows a "new version · Reload" pill from the service worker; no auto-save-and-reload |
| Shell | Notifications | flow | Browser notifications for ripe crops, animal products, new version; off by default (F-012) | missing | 1 | F-012 | No Notification API use in `src/` |
| Shell | Settings | flow | Graphics tier, shadows, outlines, FPS, joystick, music 0.45 and effects 0.8 sliders, vibration, notifications (F-011) | partial | 2 | F-011 | Clone: one "Gentle sound effects" toggle (also vibration), no music/effects sliders, no FPS, no shadow/outline toggles |
| Shell | Language | text | Vietnamese only | differs | | cmp:1440x900/05-bag | English + Vietnamese, agreed |

## HUD and layout

| Area | Feature | Aspect | Reference behaviour (fact, with source) | Status | Impact | Evidence | Notes |
|---|---|---|---|---|---|---|---|
| HUD | Top-right menu | layout | ⚡, 🎒, 📜, 🏆, 📰, 👥, ❔, ⚙️ (+📲, 💬), minimap below (F-005) | partial | 3 | cmp:1440x900/04-home-garden, cmp:390x844/04-home-garden | Clone has ⚡ 🎒 📖 👥 🏘️ ? ⚙ ⛶; no 🏆 or 📰; extra Home button left of the minimap |
| HUD | Size tokens | layout | Button 44 / minimap 150 / skill 82 px desktop; phone 34 / 92 / 54 (F-006) | partial | 2 | cmp:390x844/04-home-garden | Clone minimap 150 on compact layouts; skill buttons smaller on desktop (≈50 px) |
| HUD | Skill buttons, desktop | layout | Vertical column at bottom-left, Q→R top to bottom, 82 px (F-007) | partial | 3 | cmp:1440x900/04-home-garden | Clone: a row at bottom-right plus a keyboard guide at bottom-left; decide whether to move them |
| HUD | Skill buttons, phone | mobile | One row of 4 along the bottom; joystick off by default (F-007, F-010) | differs | | cmp:390x844/04-home-garden | Clone: joystick left + 2×2 skills right, user request 2026-10-02 |
| HUD | Quest tracker | layout | Left under the player card, story + bounty + challenge rows, "▾ Thu gọn" (F-008) | done | | cmp:1440x900/04-home-garden | Clone tracker sits in the same place, foldable |
| HUD | Boss bar | layout | Bottom centre on desktop/landscape, top on phone portrait (F-009) | partial | 1 | F-009 | Clone shows it at the top on every viewport |
| HUD | Dungeon keeper label | layout | "🏰 Bà Giữ Hầm 👥 0/5" label over the south gate (F-040) | missing | 2 | cmp:1440x900/03-home-news | Comes with the dungeon |
| HUD | Dialogs | layout | Centred cream cards with coloured header and ✕ (F-047) | differs | | cmp:1440x900/05-bag, cmp:390x844/05-bag | Clone: right drawer on desktop, bottom sheet on phones (README "intentional improvements") |

## Garden, farm and helpers

| Area | Feature | Aspect | Reference behaviour (fact, with source) | Status | Impact | Evidence | Notes |
|---|---|---|---|---|---|---|---|
| Garden | Home scene | visuals | Small hut, chest, crystal, 6 beds, flowers; camera FOV 40 (F-050) | partial | 2 | cmp:1440x900/04-home-garden | Clone home is denser (pen, well, oven, decorations) and the hut reads larger |
| Garden | Crops | data | 27 crops incl. 8 fruit (F-048) | verified | | drift | table-diff: 19 crops identical; fruit kept in the clone's fruit table |
| Garden | Fertilizer | rules | Spore grow 1 (F-048) | differs | | F-048 | Clone 0.5 (two doses finish a crop), user requirement |
| Garden | Garden caps | rules | 40 decorations, 12 animals, 24 extra plots (F-021) | partial | 1 | test "expand costs 60 + 20 per extra bed, prefers a kit in the bag and stops at 24 beds in all (15 extra)" | Decor 40 and plot cost match; animal cap is 15 livestock + dog |
| Farm | Species | data | Chicken, duck, pig, cow, dog only (F-019, F-023) | differs | | F-023 | Clone adds goat and goose; decide (not in the reference) |
| Farm | Prices | data | Chicken 150, duck 220, pig 380, cow 520, dog 450 (F-019) | differs | | cmp:1440x900/09-pen | Clone chicken 25, cow 70 (earlier user pricing); duck, pig, dog match. Decide |
| Farm | Production clock | rules | Real 2/3/4/6 h, no lifespan (F-019, F-022) | differs | | test "livestock expires after two real hours and failed full-stock grants retain the stock" | Clone game-hour clock (60 s) + 2 h lifespan, agreed 2026-10-02 |
| Farm | Pens | data | Pen costs ⚡ + leather/coral/bone; ×0.7 interval, stock 5 (F-020) | partial | 1 | test "species shelters preserve stock and fractional progress, accelerate only nearby matching animals" | Effect matches; costs are energy-only and different values |
| Farm | Buy flow | flow | Shop tab 🐷 Thú nuôi → bag → "Thả trong vườn" (F-021) | differs | | cmp:1440x900/08-shop-pets, cmp:1440x900/09-pen | Clone: animal-pen panel, animals auto-released; agreed 2026-10-02 |
| Farm | Guard dog | rules | Chase 6 s, bite 18 / 30 with pen (F-016) | verified | | test "guard dogs are unique permanent guardians, with pen-dependent bites and no production or meat" | |
| Farm | Products | data | Egg 30/40, duck egg 45/55, milk 70/90 + regen, truffle 160 (F-024) | partial | 1 | F-024 | Clone values from the 2026-10-02 plan; not re-diffed this round |
| Helpers | Garden and pen robots | rules | None in the reference (F-025) | differs | | test "the helper costs ϟ1000 once, only at home, and older saves have none" | Clone extension requested by the user |

## Bag, shop, forge

| Area | Feature | Aspect | Reference behaviour (fact, with source) | Status | Impact | Evidence | Notes |
|---|---|---|---|---|---|---|---|
| Bag | Slots | rules | Bag 20 slots, chest 40, stack 99 (F-018) | differs | | cmp:1440x900/05-bag | Clone has no slot limit (README); agreed |
| Bag | Expansion | flow | Bag 20→40 in 5 tiers, chest 40→80 in 4 tiers, ⚡ + rare materials (F-018) | missing | 2 | cmp:1440x900/05-bag | Only meaningful with limits; decide: a cosmetic "capacity" sink, or skip |
| Bag | Layout | layout | 6 equip slots, stats, grid, expand card, counters, collections button (F-047) | partial | 2 | cmp:1440x900/05-bag | Clone grouped list in a drawer; no kill/harvest/fish counters or collections button in the bag |
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
| Combat | Death | rules | 3 s countdown; bags last 24 h, max 10 (F-033) | differs | | F-033 | Clone keeps one bag and banks the older one, no expiry; agreed |
| Disguise | Roster | data | 10 disguises with prices and boss drops (F-034) | differs | | test "the six uniform disguises run all four skills, each with a description" | Clone has 16 (army, navy, áo dài ×2, USA, Vietnam added); decide whether to keep |
| Disguise | Skills | data | 40 skills, cooldowns per F-035 | done | | F-035 | Clone `DISGUISE_FACTS` matches names and cooldowns for the 10 shared; no test pins the cooldowns |
| Disguise | Boss drops | rules | robot/gorilla/leviathan/shadowlord 8%, phoenix 6%, superhero at pass tier 30 (F-034) | partial | 1 | F-034 | Not re-checked against `LOOT_TABLES` this round |
| Pets | Attack loop | rules | Shot every cd at ≤7 m for ATK × dmg; skill pets cycle skills (F-036) | partial | 2 | test "each Titan reward can be earned, equipped for real stats, saved, and used as an attacking companion" | No skill-casting pets yet (needed for dungeon/colossus pets); pet_robot shot differs (volt vs rainbow) |
| Pets | Boss pets | rules | None for ordinary bosses; no first-kill guarantee (F-038) | differs | | test "the first defeat guarantees the pet exactly once, later kills are a 10% chance" | Clone extension (commit ecc49c1); decide |
| Bosses | Titans | data | 9 titans, hat 12%, pet 6% (F-039) | verified | | test "nine planets have distinct Titans, complete moves, and independent legendary hat and pet loot" | |
| Bosses | Boss scaling | rules | HP × jf × (7/1.4/2.6), +60% per extra player, enrage <30% (F-037) | partial | 2 | F-037 | Titan ×7 matches; player-count scaling and the jf table not re-verified |
| Dungeon | Co-op dungeon | flow | Keeper NPC at the south gate, 5-player lobby, 10 s countdown, 2 runs/day, 30 min, 5 stages (F-040, F-041) | missing | 3 | F-040 | Biggest new feature (2026-10-05). Online-only in the reference; the clone could fill the party with AI neighbours offline (decide) |
| Dungeon | Monsters and bosses | data | 10 mob kinds, 5 bosses with 4 skills each (F-041) | missing | 3 | F-041 | Needs Blender models and 20 boss skills |
| Dungeon | Rewards | data | Boss pet 25%, Ấn Hầm Ngục, chest/pillar decorations (F-042) | missing | 2 | F-042 | |
| Colossus | World event | flow | Daily 20:00–21:00 VN at Red Canyon (78, 0); all planets darken; runs offline too (F-043) | missing | 3 | F-043 | Works offline in the reference, so it fits the Pages edition |
| Colossus | Attacks | rules | 9 attacks, 75% pierce, head ×2.5, armour break 35%, roar stun (F-044) | missing | 2 | F-044 | |
| Colossus | Rewards | data | Contributor loot, hat_sb_horn 15%, last-hit pet (F-045) | missing | 2 | F-045 | |
| Combat | Fight scene | visuals | Enemies with HP bars, target ring, cooldown overlay | done | | cmp:1440x900/10-fight | Clone fight shows target frame, HP bars, ring and numbers |

## Fishing

| Area | Feature | Aspect | Reference behaviour (fact, with source) | Status | Impact | Evidence | Notes |
|---|---|---|---|---|---|---|---|
| Fishing | Mystery shadow spawn | rules | Summoned only while fishing: 10% per attract, ≤1 per 60 s, near the bobber (F-026) | partial | 2 | F-026 | Clone spawns one per pond 4–20 s after load, 45–90 s after a catch (the 2026-10-01 rule); changed in the 2026-10-03 update |
| Fishing | Mystery prize | rules | 60% supergiant ×1.6–2.6, else 9 treasures (F-027) | verified | | test "mystery fish has a strict sixty-percent supergiant boundary and bounded size" | |
| Fishing | Fish size | visuals | Model size follows the cm caught (F-028) | partial | 1 | F-028 | Clone size roll matches; model-to-cm scale not checked |
| Fishing | Bite and reel | feel | Hook window 1.4+0.6q, 95% bite, slack 7 s (F-029) | done | | F-029 | Implemented 2026-10-02 |
| Fishing | Weights | data | Per-water weights | verified | | drift | table-diff unchanged |

## Social and online

| Area | Feature | Aspect | Reference behaviour (fact, with source) | Status | Impact | Evidence | Notes |
|---|---|---|---|---|---|---|---|
| Social | Leaderboard | online | 🏆 weekly and all-server boards, 5 + 6 categories, rank line (F-013) | missing | 2 | F-013 | Needs the server; AI neighbours could fill a solo board (decide) |
| Social | Watering | rules | +10%, EXP 5+min(30, lvl), 1 per crop, 5/day per home (F-014) | partial | 2 | test "friends can gift items from the bag (chest + note, daily limit) and water growing crops once per plant" | Clone: 30/day per visitor, +2 XP, boost capped at 120 s |
| Social | Guest log | online | 📒 log, kinds water/steal/dog/visit, 30 entries (F-015) | done | | F-015 | `online.ts` diary also logs gifts and messages |
| Social | Theft | rules | 6/day per home, dog blocks (F-016) | verified | | test "crop theft checks friendship, visit, generation, ripeness, range and six successful crops per UTC day" | |
| Social | Parties and gifts | online | None (F-017) | differs | | F-017 | Clone extension |
| Social | AI neighbours | online | None | differs | | test "neighbours live beyond the gates, hunt the nearest ordinary enemy there, and walk through their own gate" | Clone extension agreed with the user |

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
