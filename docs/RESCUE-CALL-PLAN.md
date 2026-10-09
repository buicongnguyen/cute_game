# Rescue Call — squad tower defence on other planets

Status: planned (2026-10-09; updated the same day: same-size enemies with rising health, an in-mission upgrade ladder for friends and the hero). Owner of the idea: the game owner; design written with Claude.

## 1. The idea in one paragraph

Now and then a friend on another planet sends an SOS: their farm is under attack. A cracked portal opens in the
village. You lead a squad (you, your rescued helpers, your AI neighbours; later real friends online) through the portal
to that planet and **hold the line**: your squad stands at your end of a field, enemies march in along lanes from the
far end, and you place and upgrade defences on build pads between waves. Win the waves to save the farm and earn the
friend's thank-you gift. It is tower defence with a hero you play yourself.

## 2. Orientation (phone upright vs landscape)

The camera stays our normal top-down follow camera. Only the field is laid out to fit the screen:

| Screen | Your end | Enemies come from | Lanes run |
|---|---|---|---|
| Landscape / desktop | left | right | left ↔ right |
| Phone held upright (portrait) | **bottom** | **top** | bottom ↔ top |

The same field data is used for both; portrait simply rotates the field 90° when the mission starts (chosen once from
the screen shape at entry, so rotating the phone mid-mission does not flip the battlefield). The camera follows the
hero along the lanes and pulls back a little so two lanes are always in view.

## 3. Core loop

1. **SOS** — every 30–60 min of play (and at most a few times a day) a call arrives: toast + 📯 on the map + a portal
   near the south square. Calls expire after a while; ignoring one costs nothing.
2. **Briefing** — the planet, its friend, the enemy kinds, the wave count, the recommended level, and **squad pick**
   (up to 5: you + helpers + neighbours).
3. **Build phase (before each wave, ~20 s, can skip)** — spend **Spark** (the mission's own currency) to place or
   upgrade defences on build pads.
4. **Wave** — enemies spawn at the far end and walk along their lane paths toward your end. Defences and squad fight;
   you move freely, use your skills, and give one squad order: **Hold** (stay on your pads) or **Follow me**.
5. **Leak** — an enemy that reaches your end takes 1 of the farm's **hearts** (10).
6. **End** — all waves cleared (win) or hearts at 0 / every squad member fallen back (loss). Rewards are paid for the
   waves cleared either way.

## 4. Tower-defence mechanics

### Field
- 3 lanes (portrait and phones) or up to 5 lanes (wide screens use the same 3–5 lane maps; maps are made for both).
- Each lane is a path of waypoints; some lanes **merge** before your end (choke points), some have a **fork**.
- **Build pads** (8–12 per map) sit beside the paths; a pad holds one defence.
- Decor fences/rocks make a light maze feel without blocking the view.

### Currency: Spark ✨
- Start of mission: 100 Spark. Each kill drops Spark (by enemy tier); each cleared wave gives a bonus.
- Spark exists only inside the mission (it never enters the save), so the 1M energy start cannot buy the game.

### Defences (re-using what we already have)
| Defence | Based on | Role | Lv1 → Lv3 |
|---|---|---|---|
| Popcorn turret | pea shooter look | single target, fast | +range, +rate |
| Tesla coil | mecha tesla turret | chains to 3, short range | chains 5, slow |
| Deck cannon | pirate cannon | splash, slow | bigger blast |
| Sandbag wall | army sandbags | blocks the lane for a while (HP) | more HP |
| Frost lantern | snowman ice / lantern | slows in an area | freezes briefly |
| Healing flower | fairy flower ring | heals squad nearby | bigger ring |
| Squad post | a rescued friend / neighbour | a fighter that guards its pad | gains a skill |

Rules: place (cost), upgrade ×2, sell (60% back). Defences have HP; enemies attack the nearest defence in their lane
when blocked.

### The squad (your rule)
- Squad members are placed on **post pads** or follow you.
- At 0 HP a squad member does **not** die: it **falls back** to the camp at your end, recovers over 15 s, then can
  return. Its post is empty meanwhile.
- If **every** squad member has fallen back at the same time and the hearts keep dropping, the mission ends.
- You (the hero) are the strongest unit: disguise skills, weapon specials, potions. If you fall, you respawn at the
  camp after 5 s.

### Enemies (re-using current assets, same size)
- Each planet uses its own creatures from `enemy-types.ts` (`PLANET_SPAWNS`) at their **normal size**; a defence raider
  only gets a light tint and, from wave 3 on, a small prop (helmet, scarf, banner) so stronger ones are recognisable.
- **Difficulty rises through health, not size**: every wave adds HP (about +18% per wave, +40% on boss waves) and a few
  more enemies; damage rises slowly (+6% per wave). This forces the player to **upgrade during the mission**.
- Enemy roles: **runner** (fast, low HP), **brute** (slow, tanky, attacks defences), **flyer** (skips walls, hit only
  by towers that hit air), **shooter** (attacks towers from range), **splitter** (breaks into small ones),
  **wave boss** (the planet's boss, on the last wave).
- Waves are data (`wave tables`): per wave, which kinds, how many, on which lanes, spacing, HP factor.

### Growing stronger inside the mission (the upgrade ladder)
Kills drop **Spark ✨** and sometimes a **Star bit ⭐** (rarer; bosses and brutes drop more). Between waves, the build
panel has three tabs: **Defences**, **Squad**, **Me**.

**Squad members start weak**: plain clothes and a **basic punch** (low damage, short reach). Spending Spark/Star bits
moves each friend up their own ladder, one step at a time. Each step visibly changes what they wear or hold:

| Step | Friend gets | Effect |
|---|---|---|
| 0 | plain clothes, punch | basic hits |
| 1 | a starter weapon (wooden sword / toy slingshot / bubble wand by role) | +damage, a little range |
| 2 | a work outfit (leather / chef / hoodie by role) | +HP, +defence |
| 3 | a better weapon (iron sword / star bow / magic wand) | +damage, faster |
| 4 | a **disguise** with one skill | an area or control skill on a cooldown |
| 5 | the disguise's second skill + armour (knight / kimono / angel …) | stronger skill, more HP |
| 6 | top weapon + **ultimate** of the disguise | big ultimate on a long cooldown |

- Gear is ordered **weak → strong** by its real stats (the game's item stats: atk, def, hp), and each step is the next
  item in that list for the friend's role. The order is computed from the item data, so new items slot in automatically.
- **Friends never wear the same disguise as the hero**, and no two friends share one. Each friend has a role
  (fighter / ranged / support) that decides which branch of weapons and disguises they climb.
- Mission gear is **borrowed for the mission only** (it is not added to the save), so it cannot be farmed; outside
  the mission the friends keep their own clothes.
- **Me tab**: the hero can buy mission boosts with Spark/Star bits: +damage, +attack speed, skill cooldown −10%,
  a heal potion, a temporary shield. They reset at the end of the mission.
- Choices matter: Spark spent on a friend is not spent on a tower; the build panel shows each option's cost and the
  next step's preview (the friend tries the new gear on in place).

## 5. Missions (first set)

| Planet (unlock lv) | Friend asking | Enemies | Last-wave boss | Waves |
|---|---|---|---|---|
| Toybox (4) | a toy maker | toy soldiers, wind-up mice | Giant Toy Robot | 6 |
| Candy (6) | a baker | gummy blobs, gingerbread | Cake King | 7 |
| Wild Jungle (8) | a ranger | boars, bees | Jungle Gorilla | 8 |
| Frost (10) | a fisher | ice creatures | Snow Yeti | 8 |
| Ocean (12), Volcano (14), Cloud (16), Night (20) | … | planet creatures | planet boss | 9–10 |

Difficulty scales with the mission's recommended level, not the player's level, so the numbers stay fair.

## 6. Rewards

- EXP and energy per wave cleared (capped per day).
- **Thank-you gift** on a win: that planet's seeds, a decoration, and a small chance of a "Defender" hat/pet.
- A "Hero of <planet>" badge (first win) and best result per planet on the 🏆 board (weekly: waves held).
- No item loss on a loss; the death bag rule does **not** apply inside a mission.

## 7. Online (later)

The mission state is a pure, serialisable module (like Flag Rush), so a later step can run it on the server for
co-op squads of real friends (shared Spark, each player builds on their own pads). Phase 1 is solo with AI squad.

## 8. Technical plan

| Module | Role |
|---|---|
| `src/rescue-content.ts` | missions, maps (lanes, pads, camp), wave tables, defences, enemy variants, EN+VI text |
| `src/rescue-rules.ts` | pure, seeded, tested: waves, paths, Spark, placing/upgrading/selling, targeting, hearts, fall-back, win/lose |
| `src/rescue-ai.ts` | squad behaviour (hold/follow, pick targets, fall back, punch at step 0, use disguise skills from step 4) |
| `src/rescue-ladder.ts` | the weak → strong gear ladder per role, computed from item stats; distinct disguises per friend and the hero; mission-only borrowing |
| `src/rescue.ts` | runtime: SOS schedule, portal, briefing + build UI, arena on the home map far from the village (like the Vault and Flag Rush), orientation choice, HUD (hearts, wave, Spark, build pads) |
| `src/rescue-view.ts` | drawing: instanced enemies with variant props, defences, lane markers, pads |
| `art/blender/kit/build_rescue.py` | portal, pads, lane markers, camp, farmhouse, defence models, variant props; low triangles |
| `server/` | `rescueClaim` action: validated rewards (once per mission run, daily caps), like `ctfClaim` |
| tests | waves and paths, pad rules, Spark economy, fall-back, leaks/hearts, orientation mapping, rewards and caps |

Performance: at most ~40 live enemies, instanced per kind; defences are pooled; the frame governor applies.

## 9. Phases

1. **Phase 1 — Hold the Line on 3 planets** (Toybox, Candy, Jungle): SOS + portal, squad pick, build pads,
   5 defence kinds, wave tables with rising HP, the squad/hero upgrade ladder, fall-back rule, portrait/landscape
   fields, rewards, tests, screenshots on phone and desktop.
2. **Phase 2 — all planets**, remaining defences (healing flower, squad post skills), the planet bosses as last
   waves, leaderboard entries.
3. **Phase 3 — Hold the Camp** map type (centre defence, enemies from all sides).
4. **Phase 4 — online co-op** on the server.

## 10. Defaults (the owner may change them later)

- SOS every 30–60 minutes of play; a setting turns calls off.
- A failed rescue costs nothing.
- 5 winning missions a day pay full rewards.
