# Reference update review and implementation plan

Reviewed and implemented locally: **2 October 2026**. Three implementation reviews checked reachable controls, reward persistence, and browser/server integration. The latest review found additional missing interactions and defects despite the previous passing suite; its evidence is recorded below. The public [GitHub Pages edition](https://buicongnguyen.github.io/cute_game/) is solo; multiplayer service deployment, real-device acceptance, and native PostgreSQL connection/recovery checks remain separate.

## Evidence and scope

- User-provided screenshots: the **1 October 2026** update. The second and third images repeat some entries; the translation below includes each entry once.
- [Reference game](https://zoo-pet.store/) and its [public CDN](https://d173ysgpwor2n4.cloudfront.net/), fetched on the review date.
- [Current public update feed](https://d173ysgpwor2n4.cloudfront.net/api/news): confirms the screenshot text and also describes the **29 September nine-Titan update**.
- [Public client inspected](https://d173ysgpwor2n4.cloudfront.net/assets/index-CmwoDrOY.js). Both current HTML pages identify this bundle. The main-domain asset request returned 404, so inspection used the working CDN copy. SHA-256: `87E2098B1C1DA2373D5CA213B2E1F8CA8FF0A91BFDE18E4336DBBC896CA7E091`.
- Local comparison: `src/`, `server/`, and tests in this repository, including the existing Claude changes and the current multiplayer preparation.

This is a fresh public-client and update-feed review, not a full live playthrough of every planet or an audit of the reference's private server. Client code confirms advertised client mechanics; server-only limits and anti-cheat guarantees still need behavioral verification. Keep observations, user requirements, and proposed design choices separate.

## Implementation result / Kết quả thực hiện

| Area / Hạng mục | Implemented locally / Đã triển khai cục bộ |
| --- | --- |
| Farm / Nông trại | Ducks, pigs, permanent guard dog, stock accumulation, species shelters, duck eggs and truffles; caps 10 chicken, 10 duck, 10 cow, 10 pig, 1 dog. / Vịt, heo, chó canh vườn không hết tuổi, tích trữ sản phẩm và chuồng riêng theo loài. |
| Crops / Cây trồng | Eight fruit crops; original crops grow 10× longer with 3× EXP/sale value, preserving existing planted deadlines and healing. Two fertilizer doses still finish a crop. / Tám cây ăn quả; giữ hạn thu hoạch cây đã trồng và quy tắc hai lần bón phân. |
| Theft / Trộm cây | Friend visits, ripe-crop identity, distance, dog protection and six successful steals per visitor/home/UTC day are checked atomically by the server. / Máy chủ kiểm tra kết bạn, vị trí, cây chín, chó bảo vệ và giới hạn sáu lần thành công mỗi ngày UTC. |
| Forge / Rèn vũ khí | Workshop and Bag UI, +15 maximum, 30% success, failure consumes materials, one rank per weapon type. / Rèn trong Xưởng và Túi, tối đa +15, thành công 30%, thất bại mất nguyên liệu. |
| Fishing / Câu cá | Longer hook window, slower tension, no random snap, mystery silhouettes and supergiant/unusual rewards; owned rods selected automatically. / Dễ giật câu hơn, bóng cá bí ẩn, cá siêu khổng lồ hoặc vật phẩm lạ; tự dùng cần có trong túi. |
| Combat / Chiến đấu | Nine Titans with original Blender models, distinct skills, nine hats and nine combat pets; dinosaur execution, sweep, roar and moving giant stomps. / Chín Titan, mũ và thú chiến đấu riêng; hoàn thiện kỹ năng khủng long. |
| Planets / Hành tinh | Stable jungle fruit deadlines, three-hit clams, contact bounce clouds, eclipse-disabled lamps, carried Fire Crystal light and continuous lava-event timing. / Sửa thời gian quả rừng, sò ba đòn, mây nhún tự động, nhật thực, ánh sáng Pha Lê Lửa và sự kiện dung nham. |
| Discovery / Khám phá | Question-mark sign near the bottom of the home safe area shows the explorer name, discovered count out of nine, and unknown-planet icons; opens the star map. / Biển dấu hỏi ở phía dưới khu an toàn hiển thị tên, số hành tinh đã khám phá trên chín và mở bản đồ sao. |
| Mobile / Điện thoại | Joystick enabled by default on touch devices when no preference is saved; default left movement/right skills, with a left/right-handed setting. Turning it off restores tap controls. / Mặc định bật cần di chuyển trên thiết bị cảm ứng; có tùy chọn đổi bên hoặc tắt để dùng cách chạm cũ. |
| Help and input / Hướng dẫn và điều khiển | 25 bilingual local Help topics, physical-key shortcuts, composition guards, Enter chat and click-player friendship actions. / 25 mục hướng dẫn song ngữ, phím tắt theo phím vật lý, bảo vệ lúc gõ tiếng Việt, Enter mở chat và chọn người chơi để kết bạn. |
| Online progress / Tiến trình online | Versioned commands, durable retry receipts, transactional economy/theft/drops, server-selected rewards and server combat/health calculations. Full-profile uploads are rejected. / Lệnh có phiên bản, lưu kết quả để thử lại an toàn, giao dịch nguyên tử và máy chủ tính phần thưởng/sát thương. |

### Deliberate differences and limits

- One game hour is **60 real seconds** for livestock, including offline elapsed time. Production takes 120/180/240/360 seconds, while fruit takes real 8/12/14 hours. Livestock live two real hours, then become meat; dogs remain permanent.
- The user requested mobile joystick mode by default, superseding the reference's tap default. Saved explicit tap mode is respected. Either movement side is selectable because the requested handedness was ambiguous.
- The discovery sign matches the reference's home placement at approximately `(2.6, 2.7, 14.5)`, visible nearby, with discovered emoji and unknown ❔ slots. It is localized and reflects saved discoveries.
- Old crop healing, quick garden collection, automatic rod selection, separate offline saves, and banking an older death bag are preserved local improvements. Crop harvesting resets the plant; fruit is not a permanently regrowing orchard.
- Animals are bought through the animal-pen panel, also accessible from Shop → Pets, and automatically released near their species' garden anchor rather than manually placed. Tap a particular animal or its ready product to collect only its stock; the animal rows also have Collect buttons. Tapping the pen still collects all ready products.
- Pond bridges/jetties were removed at the user's request so they cannot hide fish. Water remains blocked and fishing is performed from the shore. The bar below health now displays **EXP current / required** on desktop and phones.
- Server action checks protect inventory, spending, crop ownership, reward rolls, cooldowns and health. The elected browser host still supplies bounded enemy movement/visual snapshots; player movement remains client reported. Fishing checks server tickets, elapsed time and bounded reeling telemetry, which is not proof of human input. This is **not a claim of complete anti-cheat parity** with the reference's private backend.
- Hosted TLS, native PostgreSQL multi-connection behavior, sleeping-service recovery, real phones, real UniKey composition, and long-session encounter balancing require later acceptance. Local browser emulation does not replace those checks.

## English translation of the attached update

**NEW — Pets, fruit crops, weapon forging, and crop stealing! — 1 October 2026**

1. **Pets:** Buy them from the Equipment Shop's Pets tab, then release them in your garden. Chickens lay eggs every 2 hours, ducks every 3 hours, cows produce milk every 4 hours, and pink pigs find valuable truffles every 6 hours. Tap an animal to collect its product.
2. **Crop stealing:** Visit a friend's garden and tap a ripe crop to steal it! You can steal up to 6 times per home per day. If the owner has a Garden Guard Dog, it chases and bites the thief, who gets nothing.
3. **Eight new fruit crops:** They take a long time to grow but give very large rewards: apples, grapes, and mangoes take 8 hours; pineapples, coconuts, and durians take 12 hours; lychees and Immortal Peaches take 14 hours.
4. **Existing crops:** They now grow more slowly, taking 2–34 minutes, but give three times the EXP and energy. Their models are much larger, and compact harvest labels sit above the plants.
5. **Weapon forging:** Use the Crafting Workshop or select a weapon in your Bag. Each upgrade adds 1% of the weapon's base damage, up to +15. The success rate is 30%; failed attempts still consume materials.
6. **Easier fishing:** You have more time to hook a fish, line tension rises more slowly, and random line breaks have been removed. Look for **mysterious fish shadows ❓** underwater: catching one may reveal a **SUPER-GIANT fish** or an unusual item!
7. **Joystick added:** Open Settings → Movement. Enabling it places the joystick on the left and moves skill buttons to the right. Tap-to-move remains the default.
8. **Stronger anti-cheat:** Buying, selling, crafting, upgrading, forging, and similar actions are checked by the server. Editing the game through F12 developer tools no longer works. *This is the reference developer's claim, not a guarantee independently established by this review.*
9. **Bug fixes:** Fixed unexpected reloads and lost items during play, especially just after defeating a Titan. Everyone can now see boss attack effects; cartoon outlines no longer disappear; boss map positions remain correct; and enemies still take damage when other players attack from far away.
10. **Interface fixes:** Removed countdown text from dropped items to reduce clutter. Keyboard shortcuts no longer require two presses when UniKey is enabled. Lists and notifications are no longer obscured.

## Existing work and constraints to preserve

- Browser-first game; keep the current engine and WebSocket architecture. A Unity migration is not required for these additions.
- English and Vietnamese must cover all new labels, descriptions, errors, tutorials, timers, and accessibility text.
- Keep the user's **10 chickens and 10 cows** limits, existing breeds, helper, pen progression, recipes, and saved animals.
- Keep cows grazing for three times their moving duration and preserve the fixes for visual blinking.
- Fertilizer removes **half the original growing duration**, so two applications finish a crop. The reference's remaining-time description must not override this explicit user requirement.
- Keep automatic rod use near water when a rod is in the bag, with weapon/fist combat elsewhere.
- Preserve separate offline and online saves, account isolation, chat acknowledgements, and visit privacy.
- Public server deployment and two-device multiplayer acceptance testing remain deferred until the user deploys the server.

## Original comparison and reference specifications

The following gap descriptions record the **pre-implementation baseline** and the reference rules that informed the work. They are retained for traceability; the result table and completed checklist describe the current implementation. The farm table has been updated with the chosen local clock.

### Planets and shared world systems

At the pre-update baseline, all nine planets existed with normal enemies and much of their environmental gameplay. The Titan layer, nine legendary hats and nine Titan pets were absent then; they have since been implemented. The reference loot table gives the corresponding hat a 12% drop chance and pet a 6% chance; these are table probabilities, not guaranteed rewards.

| Planet | Pre-update examples | Titan subsequently added | Pre-update gap / follow-up, resolved by this implementation |
| --- | --- | --- | --- |
| Home | Garden, regional enemies, original bosses | Ancient Mountain Turtle | Farm update, guarded crop theft, shared drops |
| Candy | Existing world, creatures, ordinary bosses | Three-Headed Candy Hydra | Add Titan moves and rewards; no broader claim of complete parity |
| Ice | Existing world, creatures, ordinary bosses | Ice Crystal Queen | Add Titan moves and rewards; retest new fishing balance |
| Lava | Weather, tides, mining, cave, furnace, dragon event | Inferno Scorpion | Keep this substantial existing implementation; add Titan and synchronized attack effects |
| Toy | Gift boxes and train collisions | Clockwork Spider | Add Titan and associated items/pet |
| Jungle | Fruit healing/buffs, poison, thorns | Death Flower Rafflesia | Fix fruit cooldown across leaving/re-entering the planet |
| Ocean | Oxygen, bubbles, turtle swimming boost | Abyssal Kraken | Clams need three hits and 1–2 coral; local currently opens immediately for one coral |
| Sky / Cloud | Wind, lightning, falls, bounce pads | Celestial Cloud Whale | Reference pads launch on contact; local requires interaction |
| Dark / Shadow | Lamps, healing areas, darkness | Void Eye | Reference eclipse disables lamp illumination/healing/repulsion; local lamps keep working |

Local anchors: `src/enemy-types.ts:12`, `src/world.ts:552`, `src/boss-patterns.ts:2`, `src/environments.ts:123`, `src/world.ts:800`, `src/world.ts:818`. Reference definitions/spawning and environments are in the inspected bundle's formatted snapshot around lines 10063–10070, 11448, and 13949–14035.

The Titan announcement adds sweeping beams, black holes, seismic rays, bombardment, leap/crush attacks, death rings with a safe inner area, homing orbs, poison pools, summons, and repeated stomps. Audit each Titan's exact sequence, arena, cooldowns, and phase thresholds before coding its encounter; existing ordinary-boss attacks do not establish Titan parity.

**Jungle bug to fix first:** `src/world.ts:809` stores the fruit's next-ready time as simulation time plus 60, but rebuilding the planet resets simulation time (`:479`) while retaining `resourceTimers` (`:132`). A harvest at time 600 followed by re-entry at time 0 can leave a 660-second wait. Use a stable deadline or correctly preserved remaining duration, and test repeated travel/reload.

**Pet behavior:** existing local pets follow the player and provide stats; their catalog damage/cooldown data is not consumed by an autonomous attack loop (`src/content.ts:1597`, `src/world.ts:1433`). The reference pets shoot nearby enemies. Add the combat loop as well as the new Titan pet catalog.

**Shared loot:** local drops are private, and shared-kill rewards are rolled per client. The reference advertises ten seconds of owner priority followed by public pickup, with thirty-second expiry; local thirty-second expiry already exists but owner priority remains a TODO (`src/drops.ts:28`). Player-thrown items should become immediately collectible by others. This needs atomic server pickup, not just visible meshes.

**Death bags:** the reference keeps up to ten dated death stashes for one day. Local code keeps one stash and banks the previous one on another death (`src/model.ts:484`). Keep this more forgiving local behavior unless an explicit product decision changes it; add durable multiplayer ownership and expiry deliberately. Ground-drop countdown labels are still present locally (`src/drops-view.ts:120`).

**Remote appearance:** equipped disguises and pets are visible, but giant size, invisibility, shield, and flight state are not included in persistent remote-player snapshots (`src/online.ts:6`, `src/world.ts:640`). Add durations/state to snapshots for late joiners, not only temporary generic effects.

### Dinosaur mode: present, needs tuning

The Tyrannosaur disguise and all four controls already exist (`src/combat.ts:132`, `:154`). Reference acquisition is through the disguise shop for 420 energy + 3 amber + 10 vines + 6 bones; the jungle gorilla also has an 8% disguise drop in its public loot table.

| Skill | Current reference | Local difference / action |
| --- | --- | --- |
| Devour | 9s cooldown; nearest enemy within 3.2m; instantly consumes a non-boss strictly below 40% HP and heals 25% maximum HP; otherwise a 3× bite | Already present; local range is 3m and ordinary bite is 3.5×. Verify execution bypass/kill confirmation and one reward online |
| Tail Sweep | 5s cooldown; 360° radius 3.6m, 1.8× damage, knockback 6 | Local radius 5m, multiplier 2, different knockback/stun. Choose exact parity or document the intended buff |
| Terrifying Roar | 12s cooldown; fear within 9m for 4s, with boss resistance | Broadly present; verify boss resistance and remote visuals |
| Giant Form | 18s cooldown; double size for 10s, +60% attack and +20 defence; moving footsteps cause 0.7× hits within 2.5m roughly every .45s | Local has a giant timer/damage bonus but no avatar enlargement or +20 defence; damage pulses even while stationary. Add size/collision-safe presentation and movement-gated stomps |

Reference skill implementation: formatted snapshot around 10774–10789. For Devour, show an appropriate bite/failure against bosses; never grant the execute heal simply because a client requested it.

### Farm and crops

Initial review: local farming supported chicken/cow juvenile growth, feeding, coats, pen upgrades, one waiting product, and eventual meat. The October implementation now supports all five species and offline product accumulation while retaining the local juvenile/feed/aging mechanics. See the farm implementation notes below for approved timing differences and migration behavior.

| Animal | Reference purchase energy | Product | Reference interval | Local status |
| --- | ---: | --- | --- | --- |
| Chicken | 150 | Egg | 2 real hours | Implemented; grow 60s / produce 120s, price 25; old first 40s cycle preserved |
| Duck | 220 | Duck egg | 3 real hours | Implemented; grow 90s / produce 180s, price 220 |
| Cow | 520 | Milk | 4 real hours | Implemented; grow 120s / produce 240s, price 70; old first 75s cycle preserved |
| Pig | 380 | Truffle | 6 real hours | Implemented; grow 120s / produce six **in-game** hours (360s), price 380 |
| Guard dog | 450 | Theft protection | No production cycle | Implemented; one permanent guardian, price 450 |

A matching pen reduces duration to **70%** and raises stored products from **3 to 5**. Matching uses the nearest species pen within five units of the animal's saved placement point. Fractional progress is retained on collection unless stock was full. The reference uses a shared 40-placement cap for animals/decorations; keep the user's separate local species limits instead. See `src/farm.ts:33`, `:54`, `:56`, `:199` and reference formatted snapshot around 10406, 10418, 12628–12693.

All eight fruit IDs below are now implemented alongside the original 19 crops in `src/content.ts`. Their growth uses the reference **real-hour** durations, separately from the accelerated livestock clock:

| Crop ID / English label | Unlock level | Real-time growth | EXP | Sale energy | Explicit effect |
| --- | ---: | --- | ---: | ---: | --- |
| `apple` / Magic Red Apple | 3 | 8h | 400 | 600 | Heal 120 |
| `grape` / Juicy Purple Grapes | 5 | 8h | 450 | 700 | Regenerate 4 HP/s for 180s |
| `mango` / Golden Mango | 7 | 8h | 500 | 800 | +25% speed for 180s |
| `pineapple` / Crown Pineapple | 9 | 12h | 750 | 1,200 | +25% attack for 180s |
| `coconut` / Refreshing Coconut | 11 | 12h | 800 | 1,300 | Heal 400; 50% fire resistance for 180s |
| `durian` / Spiky Durian | 14 | 12h | 950 | 1,500 | +25 defence for 180s |
| `lychee` / Ruby Lychee | 16 | 14h | 1,100 | 1,800 | +15% critical chance, +20% attack speed for 180s |
| `peach` / Immortal Peach | 18 | 14h | 1,400 | 2,200 | Heal 9,999; +20% attack, +15 defence, 5 HP/s regeneration, +50% EXP for 300s |

These long crops have no seed-item requirement. The reference also applies fallback crop healing of `8 + sale energy` where no explicit heal is given; evaluate this large healing effect rather than overlooking it. Old crops are transformed once by **growth ×10, EXP ×3, energy ×3**; long fruits are excluded. The screenshot's “2–34 minutes” is rounded display wording. Avoid applying those multipliers twice during migration.

### Fishing, forging, and controls

Reference fishing has a 95% bite chance after the final nibble versus local 80%, a hook window of `1.4 + 0.6 × rodQuality` seconds versus `0.6 + 0.4 × rodQuality`, slower held-line tension, tension relief of .9/s versus .6/s, seven seconds of slack tolerance versus four, and no random surge snap. Preserve local steady/unbreakable rods and automatic equipment as explicit improvements. Compare `src/fishing.ts:119`, `:162`, `:184` with reference formatted snapshot around 12223–12245.

The missing mystery-fish system spawns one question-mark silhouette per stocked water, initially after 4–20s and again 45–90s after capture. It is attracted within 3.5m of the cast. The reference rolls 60% supergiant fish, sized 1.6–2.6 times the species' maximum, with enhanced rewards; otherwise it rolls unusual loot such as star shards, pearls, amber, moonstones, thunderstones, star seeds, a crown, golden fish, or pirate chest. Verify the reward/progression balance alongside server validation before porting it.

Weapon enhancement is missing; the existing lava “forge” only exchanges materials (`src/content.ts:3679`). Reference enhancement is per **weapon ID**, shared by copies of that type; rods are excluded. At current level `L`, an attempt costs `80 + 60L` energy, `4 + 2L` each of bone and leather, `1 + floor(L/3)` star shards; from L5, add `1 + floor((L−5)/4)` moonstones, and from L10 add `L−8` fire cores. Failure consumes the cost without downgrading. The actual reference formula multiplies the **whole pre-buff attack expression** (base, level, upgrades, equipment) by `1 + enhancement/100`, then applies attack buffs. This is more precise than the announcement's “base damage” wording; do not accidentally compound enhancement levels or multiply only a weapon's item stat.

The local optional controls are four direction buttons (`src/gameplay-controls.ts:5`, `src/main.ts:87`). The reference uses a draggable stick with a 52px radius and 18% dead zone, continuous direction, and **fixed movement speed**, not speed proportional to stick displacement. It refuses water destinations and stops movement on release/cancel. Match this behavior or label proportional speed as a separate improvement.

## Timing and progression decisions

The reference uses real elapsed time for animal production, while the user's pig requirement specifies six in-game hours. The implementation centralizes the local farm clock in `src/farm-clock.ts`: one game hour equals 60 real seconds, offline time counts, and online commands use server time. All four species follow the 2:3:4:6 production ratio. This permits many cycles within the preserved two-real-hour livestock lifespan. Guard dogs never become meat.

Fruit uses real-hour timers and single-harvest crop behavior. Existing planted crops snapshot their old duration during migration. New plantings use the current table. Original crops retain their prior raw/cooked healing rather than deriving stronger healing from the tripled sale values.

## Delivery plan

### Implemented online authority boundary

The previous full-profile upload boundary has been replaced. `PUT /api/profile` now rejects writes; the session determines the actor and all online progress uses server-approved commands. The offline reducer remains local and does not upload its save into an account. Enemy movement still has the client-host limitation described above.

Implemented command boundary:

```text
POST /api/actions
{ requestId, expectedRevision, rulesVersion, type, payload }
```

The session supplies the actor. Payloads express intent through stable item/recipe/plot IDs and quantities. The server supplies prices, permissions, timestamps, rewards, and random outcomes. Under row locks, validate the latest state and atomically write the new account state, durable command receipt, and notification/outbox event. A compact receipt keyed by account/request ID stores the command hash, original outcome and original action revision: identical retries return that outcome with the **current** canonical profile/revision, and a changed payload with the same ID fails. Receipts do not duplicate an entire profile for every click. Check the receipt before rejecting a stale expected revision so an acknowledged-late request can recover safely.

JSONB accounts retain private daily-theft ledgers, drops, tickets and bounded outboxes; a separate receipt table shares the transaction. The local version-2 account file also persists receipts, and the database importer supports version 1 and version 2. Lock two-player operations in stable account-ID order. Broadcast only committed events, with event IDs so repeated delivery is harmless. A full inventory must be checked before removing another player's crop.

Authority version 1 preserves existing account progress as a legacy baseline without claiming it was historically verified. Cosmetic/settings edits are commands too. The client serializes immutable commands, retries the same request after uncertain replies, and refreshes after revision conflicts. Spending and reward paths include fishing, kills, gathering, farm production, quests, gifts, transfers and consumption. Offline saves remain separate.

Tests must include lost replies, retries after restart, reused IDs with altered payloads, concurrent spending, forged prices/RNG/time, failure between debit and credit, outbox replay, old-client uploads, and real PostgreSQL multi-connection races.

### Phase 0 — Persistence, authority, and migration foundation

- [x] Prepare PostgreSQL account storage, atomic updates/import, database health checks, `.env.example`, and a one-instance Render configuration. See [multiplayer deployment instructions](multiplayer-deployment.md).
- [x] Add local restart, rollback, authentication-race, friendship-privacy, chat acknowledgement, and retry tests.
- [x] Add a versioned farm/crop/upgrade schema and migrate old saves without losing breeds, arrival dates, helpers, inventory, or placed objects.
- [x] Introduce a shared clock abstraction and explicit production/lifespan policies; test accelerated time without waiting hours.
- [x] Design server-approved economy actions before enabling theft or claiming anti-cheat parity. PostgreSQL persistence does **not** by itself make purchases, combat rewards, or profile uploads trustworthy.
- [x] Keep offline actions deterministic and local; online actions must use server results and report unavailable/pending outcomes honestly.

Acceptance: loading a pre-update save preserves its progress; migration is repeatable; failed database operations grant no items; retries produce one result; unauthenticated and unauthorized actions change nothing.

### Phase 1 — Ducks, pigs, guard dogs, and fruit crops

- [x] Extend `farm.ts`, `farm-view.ts`, farm UI, catalogs, serialization, and both languages for ducks, pigs, and guard dogs.
- [x] Add duck eggs and truffles with inventory icons, value, collection, and appropriate food/material behavior. Rebalance existing eggs/milk deliberately rather than overwriting current recipe economics.
- [x] Add purchase and placement paths, species capacity rules, production progress, ready-product indicators, and per-animal collection. Preserve existing quick collection if useful.
- [x] Keep 10 chickens/10 cows, with final limits of 10 ducks, 10 pigs, and one effective guard dog per garden. These are approved local design choices, not reference facts.
- [x] Make the dog patrol/idle/chase visibly, but let the server decide whether a theft succeeds. The dog should not attack ordinary visitors or the owner.
- [x] Add apples, grapes, mangoes, pineapples, coconuts, durians, lychees, and Immortal Peaches as distinct crop definitions and models. Include unlocks, durations, EXP, energy, yields, seed rules, and localized descriptions.
- [x] Review the older crops' new duration/reward table and larger presentation. Use a content version so previously planted crops do not unexpectedly become much slower on loading.
- [x] Keep compact labels anchored above mature plants; verify fruit trees do not obscure the player, pond, paths, farm, or UI.
- [x] Implement species-specific shelters alongside the existing farm capacity upgrades: matching livestock store five products and produce in 70% of the normal interval; the dog shelter increases a blocked-theft bite from 18 to 30 damage.

Acceptance: correct species/product after reload and offline catch-up; caps cannot be bypassed; collection at a timer boundary grants once; two fertilizer uses finish any supported crop; long-lived animals produce before aging; animal and crop meshes remain stable on mobile.

### Phase 2 — Multiplayer crop stealing and garden protection

- [x] Define a `stealCrop` command with actor, target garden, stable plot/crop generation ID, and request ID. Never accept a client-supplied loot amount or successful-outcome flag.
- [x] Check current friendship, garden visit/proximity, ripeness, remaining harvest, guard-dog state, and daily allowance on the server.
- [x] Implement **six successful thefts per visitor/home/UTC day**; blocked attempts do not count. The reference private-server interpretation remains unverified, so this is a documented local rule.
- [x] Match the observed client theft result: it grants one crop and clears the visitor's plot; the owner's `stolen` event also clears that plot. The local server grants one crop and clears the owner plot in the same transaction; concurrent/replayed attempts are covered by local two-account tests.
- [x] Atomically update both accounts, crop/yield state, and the daily ledger. Lock records in a consistent order and save the result against the request ID.
- [x] Broadcast committed plot and dog effects to the relevant visitors; removing a friendship must revoke visits and outstanding permissions.
- [x] Show a clear blocked result for protected gardens. The reference client chases for up to six seconds and bites once for 18 damage, or 30 with a matching dog pen. Validate the outcome on our server and keep the animation as feedback; do not let each client decide damage independently.

Acceptance: two thieves cannot harvest the same unit; retries cannot double rewards or daily counts; old/replayed visits fail; changing the browser clock has no online effect; a guard blocks the theft even if its animation is hidden or delayed.

### Phase 3 — Forging, fishing, and input parity

- [x] Add persistent weapon enhancement levels, maximum +15, at the workshop and in weapon inventory details. Apply the reference's pre-buff attack formula documented above, with linear +1% per level and no compounding.
- [x] Show the 30% success chance and material loss on failure before an attempt. Server-selected randomness and committed costs/results are required online; retries must not reroll.
- [x] Define enhancement ownership for duplicate weapons and selling/storage/equipping; migration defaults existing weapons to +0.
- [x] Compare fishing hook windows, tension rise/relief, rod modifiers, and line-break conditions. Preserve skill-based failure while removing any unrelated random break.
- [x] Add mysterious underwater silhouettes with visible question marks and a verified giant-fish/unusual-item reward table. Make reveal, size, reward, and collection one authoritative online event.
- [x] Enable a draggable joystick by default for touch devices without a saved preference, with left movement/right skills and an optional reversed layout. Settings can restore original tap mode. Respect safe areas/orientation and retain continuous direction with fixed speed.
- [x] Fix shortcut handling with physical `KeyboardEvent.code` and composition/text-input guards. Automated input tests pass; real UniKey acceptance remains below.
- [x] Review dropped-item labels, modal stacking, notices, and outline persistence on low/high quality settings.

Acceptance: forge failures deduct only the stated cost once; +15 cannot be exceeded; fish hook/tension boundaries are tested; canceling fishing cannot grant rewards; touch input does not activate skills underneath the joystick; Vietnamese typing does not trigger gameplay shortcuts.

### Phase 4 — Dinosaur and other-planet completeness

- [x] Tune the existing dinosaur's Devour, Tail Sweep, Roar, and Giant Form against current reference behavior. Do not build a second transformation system.
- [x] Make instant devouring a dedicated validated execution outcome, with boss immunity, target/range checks, exactly one kill reward, and healing only after the kill is confirmed online.
- [x] Implement the nine missing Titans with individual models, spawn locations, move sets, telegraphs, phases, rewards, and respawn rules. Start with one complete Titan and its networking before expanding to all nine.
- [x] Complete planet-specific interactable/hazard differences identified in the comparison above, retaining mechanics already implemented. Fix the jungle revisit timer before adding further persistent resource timers.
- [x] Fix the Help-audit gaps: carried Fire Crystals should provide cave light; lava event state should not always restart on re-entry; add click-player friendship actions and Enter-to-chat; correct the local Help's outdated blanket level-5 travel claim.
- [x] Add legendary Titan hats and functional Titan companions after their exact drop/effect definitions are reviewed. Do not represent these merely as inventory names.
- [x] Replicate timed boss effects, summons, projectiles, and transformations for late joiners and host changes. Visual events must not independently grant damage or loot on every client.
- [x] Implement shared loot ownership, claim/release/expiry, player item drops, and persistent death bags using server records before matching the reference's shared-drop behavior.

Acceptance: Devour never executes a boss; Titan damage and rewards occur once; non-hosts and distant players see the same boss health/telegraphs; late join and host migration preserve active hazards; minimap markers use actual world coordinates; death bags survive reconnect/restart for their configured lifetime.

### Phase 5 — Assets, accessibility, and release verification

Checked items indicate local implementation and automated/browser checks, not a public release or physical-device acceptance.

- [x] Refine new animal/fruit/Titan assets in Blender using the existing art direction, independent materials, reusable meshes, sensible bounds, and mobile budgets. Include duck/pig/dog animations and dog chase/bite feedback.
- [x] Keep fallbacks while assets load; test missing models, quality changes, resize, and shadow changes for flicker or invisible outlines.
- [x] Verify English/Vietnamese text, Unicode/IME behavior, touch sizes, joystick placement, and readable timers without putting development terminology into game screens.
- [x] Run unit, migration, authority, network and targeted local browser tests. Hosted two-device acceptance is separate below.
- [ ] After user deployment, test hosted PostgreSQL reconnect/TLS, native multi-connection contention, sleeping-service recovery, deployment restart, durable inventory/loot, and database failure behavior.
- [ ] Test two real devices, installation/offline behavior, native UniKey input and long-session mobile performance.
- [x] Write local feature notes only for completed behavior. Keep multiplayer-dependent interactions unavailable in the Pages solo edition, with clear explanations.

## Help-button guide: English and Vietnamese cross-check

Source: the current **Help / Hướng dẫn** button's `openHelp()` content in the [inspected public client](https://d173ysgpwor2n4.cloudfront.net/assets/index-CmwoDrOY.js), formatted snapshot around lines 13409–13431. It contains **18 help entries**. The bilingual table restates their gameplay instructions and meaning for comparison; the Vietnamese column is a concise restatement, not a verbatim transcription. This guide predates some update-feed details: absence from Help does not mean the new farm animals, fruit, forging, or Titans are absent from the reference.

| ID | Tiếng Việt — nội dung hướng dẫn | English — translated meaning |
| --- | --- | --- |
| H01 | Nhấn mặt đất để đi tới; giữ thao tác để tiếp tục di chuyển. Mục tiêu đang chọn được đánh dấu bằng mũi tên vàng và vòng chọn. | Click or tap the ground to move; hold to keep moving. A yellow arrow and selection ring identify the selected target. |
| H02 | Chọn quái để tấn công. Đấm tay không, kiếm đánh theo vùng và súng đánh từ xa có cơ chế khác nhau. | Select an enemy to attack. Fists, swords with sweeping attacks, and ranged guns use different combat styles. |
| H03 | Q dùng Chong Chóng; W lướt; E đấm đất và hất tung. R kích hoạt kỹ năng đặc biệt phụ thuộc vũ khí. | Q activates Whirlwind, W dashes, E performs a ground slam with a launch effect, and R uses the weapon's special skill. |
| H04 | Phím I mở túi: đổi vũ khí hoặc đồ mặc, dùng thức ăn hồi máu và phân bón. Rương gần nhà dùng để cất đồ an toàn. | Press I for inventory: equip weapons or clothing and use healing food or fertilizer. The chest near the house provides safe storage. |
| H05 | Khi chết vẫn giữ cấp độ; đồ đang mang trong túi rơi tại vị trí chết. Quay lại lấy túi màu hồng để thu hồi. | Death preserves your level. Carried inventory drops at the death location and can be recovered from the pink bag. |
| H06 | Trồng và thu hoạch để nhận EXP; phân bón từ quái giúp cây mau lớn. Chọn luống đất để mở chức năng mở rộng vườn. | Grow and harvest crops for EXP. Fertilizer obtained from enemies speeds growth. Select a bed to access garden expansion. |
| H07 | Bán vật phẩm tại sạp để nhận năng lượng. Cửa hàng bán vũ khí, quần áo và cần câu; pha lê nâng chỉ số nhân vật. | Sell items at the stall for energy. Buy weapons, clothing, and rods at the equipment shop; use the crystal to upgrade character stats. |
| H08 | Hướng dẫn yêu cầu trang bị cần rồi chọn mặt nước. Theo dõi phao và cá, nhấn hoặc giữ Kéo/phím cách đúng lúc; dây quá căng sẽ đứt. | The guide says to equip a rod and select water. Watch the float and fish, then press or hold Reel/Space at the right time. Excessive tension breaks the line. |
| H09 | Tàu ở khu nhà đưa người chơi tới các hành tinh Kẹo, Băng và Dung Nham khi đủ cấp và năng lượng nhiên liệu. Chuyến về nhà không tốn phí. | Use the home-area spaceship to reach Candy, Ice, and Lava once level and energy requirements are met. Returning home is free. |
| H10 | Dung Nham có phun trào cách khoảng 2–3 phút, vùng cảnh báo đỏ, đá cao để tránh và nguy hiểm có thể hại quái. Có thủy triều, đá nổi để vượt sông; hướng dẫn nói mỗi lần đến gặp sự kiện khác như thiên thạch, bão hoặc rồng. | Lava has eruptions roughly every 2–3 minutes, red warning zones, high rocks for safety, and hazards that can damage enemies. It has rising lava and floating crossings; the guide advertises different events on visits, such as meteors, magma storms, or dragons. |
| H11 | Đào tinh thể, obsidian và thiên thạch. Phá đá chắn cửa hang; đem Pha Lê Lửa để có ánh sáng, rồi thắp ba lò lửa để mở Lò Rèn Cổ. | Mine crystals, obsidian, and meteors. Break the cave entrance rock, carry a Fire Crystal for light, and ignite three braziers to activate the Ancient Furnace. |
| H12 | Xưởng ở nhà chế tạo trang bị từ vật liệu hành tinh, gồm giày chống dung nham, kiếm, cánh lửa, Rồng Con và đồ trang trí. Đặt đồ từ túi để bạn bè thấy khi ghé vườn. | The home workshop uses planetary materials for lava-resistant boots, swords, fire wings, a Baby Dragon pet, and decorations. Place decorations from inventory so visiting friends can see them. |
| H13 | Năm hành tinh bổ sung có luật riêng: Đồ Chơi có quà/tàu hỏa; Rừng có gai/khí độc; Đại Dương có dưỡng khí/rùa; Mây có đảo nổi/mây nhún/gió; Bóng Đêm cần thắp đèn. | Five further planets add distinct systems: Toy gifts/trains; Jungle thorns/poison; Ocean oxygen/turtle rides; Sky floating islands/bounce clouds/wind; and Dark-world lighting. |
| H14 | Mua cải trang để đổi hình dạng và cả bốn kỹ năng, ví dụ Ninja, Pháp Sư, Hiệp Sĩ, Robot, Khủng Long. Mục thời trang có nhiều mũ, áo và giày. | Disguises change appearance and all four skills, including Ninja, Mage, Knight, Robot, and Dinosaur forms. Fashion offers additional hats, outfits, and shoes. |
| H15 | Khi online, người chơi có khu nhà riêng; đi qua cổng ra ngoài sẽ gặp người khác trong vùng chung của hành tinh. | Online players have private home areas. Going outside the gate enters the planet's shared area. |
| H16 | Chọn người chơi khác để kết bạn, dùng danh sách bạn bè để tới vườn của họ. Enter mở trò chuyện. | Select another player to add them as a friend, use the friends list to visit their garden, and press Enter to chat. |
| H17 | Trên điện thoại, chụm hai ngón để đổi độ phóng camera. Có thể cài thành ứng dụng, dùng toàn màn hình và chơi phần ngoại tuyến; Help có nút đổi toàn màn hình. | On phones, pinch to zoom the camera. The game can be installed, opened fullscreen, and used offline; Help includes a fullscreen toggle. |
| H18 | Rừng Nấm ở phía tây và Đồng Cỏ phía nam dễ hơn; Đầm Lầy phía bắc ở mức vừa; Hẻm Núi Đỏ phía đông khó và có Gấu Vua. | Mushroom Forest to the west and Meadow to the south are easier; the northern Swamp is intermediate; the eastern Red Canyon is harder and contains the Bear King. |

Offline installation in H17 does not make online chat, friends, visits, or shared combat available without a server connection. H08 describes reference manual equipment; our automatic rod behavior remains the user's intentional improvement.

### Implementation check for every Help entry

**Status legend:** **Implemented / Đã có** means the behavior is present in local code, not that live hosted multiplayer has been accepted. **Partial / Chưa đủ** identifies a missing subfeature or mismatch. **Intentional difference / Khác có chủ đích** preserves an agreed local behavior. **Missing / Chưa có** identifies functionality still to build. These checks use current source and existing focused tests; they are not a claim that all reference mechanics have been exhaustively played through.

| ID | Status | Evidence and follow-up |
| --- | --- | --- |
| H01 | Implemented; presentation differs | Tap/hold and joystick movement, clear target markers; enemy/object marker colors intentionally differ. |
| H02 | Implemented | Fists, sword arcs, ranged attacks, approach and repeated attacks; online damage and kill rewards are server-calculated. |
| H03 | Implemented | Physical Q/W/E/R bindings, cooldowns, launch effects and disguise overrides; combat and input tests cover these paths. |
| H04 | Implemented; Help clarified | Inventory, equipment, food and chest actions work. Local Help directs fertilizer use through a growing crop bed, avoiding an unsupported backpack-targeting promise. |
| H05 | Implemented; intentional difference | Pink death bag recovery preserves level/equipment/storage. A previous bag banks safely on another death; no expiry. Server records and saved profile own online recovery. |
| H06 | Implemented; intentional differences | Planting, EXP, expansion and whole-garden collection; each fertilizer removes half the original duration, including migrated and fruit crops. |
| H07 | Implemented with online authority | Selling, shopping and upgrades use shared rules offline and transactional server commands online; forged profile uploads fail. |
| H08 | Implemented; intentional improvement | Automatic owned rod/weapon switching; easier fishing, mystery shadows and supergiant/treasure rewards. Online tickets and reward receipts prevent duplicate grants; telemetry has the limitation stated above. |
| H09 | Implemented; Help corrected | 20-energy launch, planet-specific landing requirements and free home return. No blanket level-5 claim; discovery sign and star map show progress across all nine worlds. |
| H10 | Implemented; hosted acceptance deferred | Eruptions, tides, high-ground protection, crossings and weather use a stable elapsed clock; online weather/health is server-owned. Active rooms still restart with the service. |
| H11 | Implemented | Carried Fire Crystals provide cave light on Lava; gate strikes, mining, meteor claims and three braziers are validated online. |
| H12 | Implemented | Workshop, decorations, visits and autonomous pet attacks, including Titan pets; committed server combat grants rewards once. |
| H13 | Implemented known gaps | Jungle fruit uses stable deadlines; clams take three hits; clouds bounce on contact; eclipse suppresses lamps. All nine Titans added; not a claim of exhaustive private-server parity. |
| H14 | Implemented reviewed effects | Dinosaur exact-range execute with boss immunity, sweep, resistant roar, enlarged giant with defence and movement-only stomps; snapshots carry timed visual states. |
| H15 | Implemented; hosted check deferred | Private gardens, shared wild areas, friends and 24-player party rooms. Saved planets resume; Pages remains solo. |
| H16 | Implemented; room chat retained | Click-player friend actions, friend visits and Enter-to-chat with composition guards. Room-wide chat is the retained local behavior. |
| H17 | Implemented capabilities; physical-device acceptance open | Pinch, install, fullscreen and offline build/cache support. Installed standalone mode is not automatically fullscreen. Multiplayer still needs networking. |
| H18 | Implemented | Forest west, meadow south, swamp north and canyon east, with matching regional danger and Bear King. |

### Help follow-through

The listed light, timer, pet, dinosaur, friendship, chat and travel-wording gaps are implemented. `src/help-topics.ts` now supplies 24 local topics with English/Vietnamese coverage. The original H01–H18 bilingual reference table above is preserved for comparison. Real-device installation/IME and hosted acceptance remain open.

## Local validation evidence

The final full suite passed **685 tests**, with **zero failures** and three optional browser checks skipped by that command. Those HUD checks were run separately against the local development browser server and passed **3/3** at 390×844, 1440×900 and 844×390, including the taller, labeled EXP bar. Both the Pages build and complete server build passed; `dist/` was restored to the complete server edition. The existing large-chunk warning remains, with no compilation errors.

Coverage includes migrations, repeated receipt replay across restart/import, transactional rollback, concurrent theft and private garden boundaries, paid flights, combat authority, health/life transitions, UI acknowledgment races, fishing, farm caps/timers and model contracts. Database tests use PGlite's PostgreSQL engine; hosted TLS and native multi-connection contention remain separate acceptance work.

Browser evidence is kept outside the repository under `outputs/reference-update/` in the task workspace. It covers phone 390×844, landscape 844×390 and desktop layouts, both movement sides, language switching, 25 Help topics, forging and a complete mystery catch. A separate production-server smoke test used two isolated browser contexts and temporary accounts: UI registration, acknowledged chat, server-approved planting, mutual friendship, garden visits and crop/friend persistence after reload all passed without page errors. The discovery sign was checked in English and Vietnamese for its name, 3/9 count, six unknown icons, default phone controls and star-map navigation. Phone prompts/notices were moved clear of the thumb controls and visually checked. Physical phones and hosted PostgreSQL are not represented by these local checks.

### Second review: actual gaps and their corrections

The earlier checklist overstated completeness where backend functions existed without a usable control or the browser transport did not call them. This review explicitly checked those connections.

| Finding | Correction and evidence |
| --- | --- |
| Online host never published enemy snapshots | Elected hosts now send snapshots every 150 ms. A two-browser test selected and killed a real enemy through the game controls, verified the other browser saw the defeat, and confirmed each defeated enemy counted once in the server profile. |
| Account switching/reconnecting could reuse another session's pending work | Per-account queues and session epochs reject stale account, room, travel and reconnect responses. Focused session/action regressions cover these races. |
| Visiting home from a distant planet changed the saved destination | Visits now keep the canonical planet and return the player to the correct room/party. Network regression covers Lava → friend's home → Lava. |
| Loot release existed only as an API; thrown items immediately returned | The online World panel now offers **Share nearby loot**. Thrown items keep the owner's walk-away lock; priority locks remain separate and cannot be cleared by distance. Server and drop-controller regressions cover both. |
| Devour could fail against shell armor | A validated execution bypasses ordinary damage reduction offline and online, keeps boss/range/HP checks, grants one kill and heals only after a confirmed kill. |
| Titan warning locations differed from actual damage | Server-generated marks now drive both warnings and damage, preserving ring safe areas and timing metadata. Active hazards keep progressing through late joins and host changes. |
| Starting another Titan skill discarded lasting hazards | Concurrent cast lifetimes preserve existing pools/orbs. Dragon fire rain is server-owned; phase-three cooldown and online lava immunity match offline rules. |
| Lost health-commit responses could repeat damage | Retries retain the same durable request ID. Account cache refresh removes stale deleted fields; death/reset/travel clear obsolete fishing, flight and ride state. |
| Failed inventory grants could consume farm/world rewards | Death bags stage their grants atomically; failed decoration/resource grants preserve the object/cooldown; invalid harvest clocks are rejected. |
| Per-animal collection was supported by the server but absent from UI | Ready animal rows now expose individual collection while retaining quick collection. Guard protection also has visible chase/bite feedback for relevant clients; damage remains server-decided. |
| Fish hidden by pond bridges; unidentified experience bar | Removed the jetty/planks, preserved shore casting and blocked water, and added a readable EXP value under health. Pond/nav/fishing and responsive HUD checks cover these changes. |

### Where to find the implemented features

| Feature | Playable path | Verification boundary |
| --- | --- | --- |
| Ducks, pigs, guard dog and shelters | Home → animal pen, or Shop → Pets → Animal pen; buy animals/shelters, feed or collect from animal rows | Local rules/serialization/UI covered; hosted theft acceptance remains open. |
| Animal pen robot (user extension) | Animal pen → Animal pen helper → Hire for ϟ1000 | Independent from garden robot; gathers waiting products/meat, with pause and optional feeding from the bag. |
| Fruit and older crop changes | Select a garden bed → crop list; choose a fruit crop, fertilize or harvest | Eight fruit types, migrations, caps and two-dose fertilizer covered. Fruit is single-harvest. |
| Weapon forging | Workshop → forge, or Bag → weapon → forge | +15 cap, 30% roll and failure costs tested offline/server. |
| Mystery fishing | Carry a rod, approach a pond, choose a mystery silhouette | A complete local browser mystery catch was verified; server proof has the limits stated above. |
| Dinosaur skills | Buy/equip Dinosaur disguise, use Q/W/E/R | Execution, immunity, healing and giant movement effects covered by runtime tests. |
| Titans, hats and combat pets | Travel to each planet and find its Titan; pick up and equip rewards | Nine world spawns, all move sets and all nine reward pairs tested through pickup/equip/save/reload/pet damage. Not every full encounter was manually played. |
| Discovery counter | Question-mark sign near the bottom of the safe area → star map | EN/VI phone checks include name, count and unknown slots. |
| Chat, friends, visits, theft and shared loot | Online panel, Enter chat, click another player; visit a friend; World → Share nearby loot | Available in the server edition. Pages cannot provide shared multiplayer without that service. |
| Movement and help | Settings → Movement; Help button | Default phone joystick, side selection, tap mode and 25 bilingual topics; physical-device/UniKey testing remains open. |

Unfinished acceptance work remains unchecked in Phase 5. All 18 Titan hat/companion inventory thumbnails are now generated from the shipped Blender models; the bag, equipment panel and loot labels use these images. Emoji remain a fallback for failed asset requests. The historical comparison earlier in this file describes the pre-update baseline, not missing features in this release.

A final phone browser smoke test verified **Shop → Pets → Animal pen → Collect ×3** grants only the selected chicken's stock while leaving duck eggs untouched. It also checked all 25 Help entries in both languages, the new fruit/product inventory tiles and the unobscured pond. The isolated multiplayer browser check reported no page errors or failed API responses.

## Farm implementation notes — 2026-10-02

### Third implementation and logic review

| Plan requirement | Missing or incorrect behavior found | Implemented correction / evidence |
| --- | --- | --- |
| Individual animal collection (Phase 1) | Direct taps on animals selected the whole pen even though row buttons existed. | Instanced body/head/leg/product hits now retain the animal UID; selection follows a walking animal. Actual phone-browser tap collected the chosen chicken's three eggs while preserving the duck's stock. |
| Product pickup feedback (Phase 1) | An early online profile update could remove expired livestock before its meat animation began. | Collection retains the pre-command origin and uses it if the animal mesh has already disappeared. Farm-picking and collection tests cover both orders. |
| Save completed fishing rewards (Phases 0/3) | Offline catches were granted only when the visual leap finished; a world rebuild or reload could erase an earned catch. | The model grant and save now precede animation. Late replies/callbacks cannot affect a new cast, world or account. Failed grants do not show success. |
| Mystery silhouette/reward integration (Phase 3) | Client shadows respawned after landing, but server eligibility began at the start of a cast. Visible shadows could produce rejected casts, and visual cooldowns stopped during space flight/background suspension. | Canonical per-pond cooldown begins on a committed mystery catch. Cancellation preserves eligibility. Start/finish replies synchronize relative remaining time against a monotonic clock; stale mystery requests still allow an ordinary cast. |
| New Titan asset completeness (Phase 5) | All nine hats and nine pets had usable 3D models but no inventory images. | `build_titan_icons.py` renders all 18 transparent 160×160 images from `titans.glb`, totaling about 85 KB. Browser inventory checks verified all 18 images load. |
| Stable avatar/assets and quality changes (Phases 4/5) | Refreshing remote avatars deleted/reinserted keys while iterating the same Map, which could loop forever. | Refresh iterates a snapshot. Regression and two-browser runtime checks verify it returns with remote players still present. |
| Atomic reward acceptance (Phase 0) | Oversized catch bonuses, gift rewards, the final brazier and daily cave chest could consume their source despite an incomplete grant. Banking an old death stash could create invalid counts later discarded on reload. | Model operations preflight whole reward bundles and numeric limits. Invalid attempts preserve inventory, timers and unlocks; regression tests reload the resulting saves. |
| Session authorization (Phase 0) | Requests authenticated before reading a slow body or waiting for a transaction could still change an account after logout. | Access is revalidated after body parsing and inside the locked command/receipt operation. Deferred-request and queued-command tests reproduce the revoked-session cases. |
| Loot after visiting (Phases 2/4) | Leaving a garden into the same home room could omit the room snapshot and drop reload. | Visit exit refreshes the same-room snapshot; client fetches use an epoch so stale drop lists cannot reappear after a newer transition. |
| Titan summons and transformation snapshots (Phase 4) | Summon boosts did not stack as in the reference, the online host could also move reinforcements locally, and partial player poses could clear active transformations. | Only server-approved online summons move living reinforcements; boosts and remaining chase time survive snapshots. Partial poses preserve transformations. |
| Confirmed-hit effects and health order (Phases 0/4) | A rejected hit could grant lifesteal; buffered damage could commit after a potion was consumed. | Lifesteal requires an accepted hit. Pending damage is committed before health-changing commands; conflicts preserve the consumable and refresh the profile. |
| Fullscreen from Help (H17) | The global fullscreen button existed, but the Help guide lacked its advertised control. | Help now has a localized Fullscreen button sharing the existing capability/fallback handler. |
| Locked lava cave (H11) | A client requesting an interior fire crystal could bypass the closed gate. | The server checks the resource against the actual cave geometry and requires the gate to be open. |

The review also checks the existing eight fruits, migration clocks, two-dose fertilizer rule, shelters/caps, forge costs and ownership, all nine Titan definitions/move sets/rewards, dinosaur skills, discovery sign, mobile controls, and H01–H18 Help requirements. Feature presence is distinguished from hosted acceptance: PostgreSQL TLS/native multi-connection tests and physical phone/UniKey/installation checks are still open, and GitHub Pages remains solo. These are not represented as missing local feature code or as completed tests.

### Requested tree refinement / Cải thiện cây ngoài vùng an toàn

- **EN:** Round trees now have visible forks and less regular crowns; pines have exposed trunks and uneven tier edges. Deterministic warm/cool color variation makes the wild trees less repetitive. Tree locations, collision radii, tile batching, nearby shadows and battery-saver behavior remain compatible.
- **VI:** Cây tán tròn có nhánh chạc rõ hơn và tán bớt đều; cây thông lộ thân với viền tầng lá tự nhiên hơn. Màu ấm/lạnh thay đổi nhẹ, ổn định theo vị trí giúp cây ngoài vùng an toàn bớt lặp lại. Vị trí cây, bán kính va chạm, cách vẽ theo nhóm, bóng gần nhân vật và chế độ tiết kiệm pin vẫn tương thích.
- Blender asset budgets: round **578 → 554** triangles, pine **360 → 358**, blossom **598 unchanged**. The scenery file grows only **736 bytes**, to **84,676 bytes**. All other scenery geometry/materials are unchanged. No leaf textures or tree animations were added.
- Fixed-camera browser checks at 390×844 and 1280×800 kept the same scenery draw calls: forest **23/27**, meadow **16/23**. Rendered scenery triangles decreased in all four views (phone forest **55,517 → 54,041**). Per-instance colors use **16,176 bytes** across the home scenery. These are local renderer measurements, not a physical-phone frame-rate guarantee.
- Regression coverage verifies stable colors across rebuild/order/quality changes, untouched placement and shared resources, fading/overlay reuse without color flashes, and the actual shipped model's triangle and single-batch limits.

### Animal pen helper / Rô-bốt chăm vật nuôi

- **EN:** Hire a separate animal-pen robot for **1,000 energy**, the same shared price as the garden robot. It collects eggs, duck eggs, milk, truffles and meat from expired livestock into the bag, with normal EXP. Pause/resume is available. Automatic feeding starts **off**; turning it on spends the cheapest suitable crops already in the bag. It never purchases feed, animals or replacements. Returning home collects only the stock actually waiting, once, within existing animal storage limits.
- **VI:** Thuê riêng một rô-bốt chăm vật nuôi với giá **1.000 năng lượng**, bằng giá rô-bốt làm vườn. Rô-bốt thu trứng gà, trứng vịt, sữa, nấm truffle và thịt từ vật nuôi hết tuổi thọ vào túi, nhận EXP như bình thường. Có thể tạm dừng hoặc tiếp tục. **Tự động cho ăn mặc định tắt**; khi bật, rô-bốt dùng nông sản phù hợp rẻ nhất đang có trong túi. Rô-bốt không tự mua thức ăn, vật nuôi hay con thay thế. Khi về nhà, rô-bốt chỉ thu một lần lượng sản phẩm thực sự đang chờ, theo giới hạn tích trữ hiện có.
- The pen menu contains the hire/settings entry in English and Vietnamese. Ownership and both switches are stored inside `farm.helper`; old saves default to unowned. Visitors see the owner's robot but cannot make it work on their own inventory or the owner's farm. The view reuses the six rigid parts of `helper.glb` with no new asset download or shadow pass.
- Rule and authority tests cover equal price, duplicate purchase/receipt handling, pause, feeding opt-in, available inventory, all products and meat, capped offline stock, save migration, visits and flight restrictions. Phone-browser QA verified the 1,000-energy charge, three automatically collected eggs, feeding only after opting in, paused behavior, visible robot, persisted switches after reload and Vietnamese settings.

### Farm design and asset details

- `src/farm-clock.ts` defines one game hour as 60 real seconds. Offline elapsed wall-clock time advances production. Chicken/duck/cow/pig cycles are 120/180/240/360 seconds; fruit crops use real 8/12/14-hour timers. Online actions use server timestamps. The farm panel explains these clocks explicitly.
- Livestock retain the two-real-hour lifespan, immutable acquisition timestamps, juvenile growth, feeding and coat/breed data. Expired livestock stay as collectible meat until a successful collection; guard dogs never age into meat. Chicken/cow caps remain ten each; ducks/pigs also cap at ten, dogs at one. Cow grazing remains three times the actual prior walking duration.
- A free animal stores three products; a matching shelter within five units of its saved release anchor stores five and shortens production to 70%. Collection preserves fractional progress unless stock was full. Buying shelters rebases progress without granting extra products. Shelters do not change livestock lifespan or capacity-upgrade prices.
- Animal timer migration uses per-animal `timerVersion: 2`: existing chicken/cow first-cycle deadlines preserve their former 40/75-second intervals, then use the new intervals. `contentVersion: 3` and per-plot `growDuration` preserve old planted crop deadlines; planting again uses current durations. The original 19 crops receive growth ×10, EXP ×3 and sale energy ×3 exactly once. Their raw and cooked healing stays unchanged. Eight new fruit crops are seedless, single-harvest plants with localized effects, without automatic orchard regrowth.
- `art/blender/kit/build_farm_expansion.py` refines original duck, pig and guardian models plus young variants, products and five shelters; `build_farm.py` includes the extension. `build_fruit_crops.py` generates distinct trees, palm, grape trellis and pineapple rosette. Runtime outputs are `public/assets/models/farm.glb` and `fruit_crops.glb`; item icons include `duck_egg.webp`, `truffle.webp` and eight transparent fruit icons in `public/assets/icons/crops/`. Young and ripe crop presentation is now 25% larger, with the sprout size preserved; ready badges are anchored above mature silhouettes. Blender exports passed kit bounds, transform, triangle and bundle-size checks. Contract metadata is in `art/blender/kit/CONTRACT.md`.
- Focused automated coverage: `tests/farm-expansion.test.ts`, `farm-lifecycle.test.ts`, `farm-roam.test.ts`, `farm-herd.test.ts`, `crop-update.test.ts`, `weapon-forge.test.ts` (plot migration), `farm-collection.test.mjs`, and `catalog-locale.test.ts`. It covers offline accumulation, stock boundaries, atomic failed grants, compatible repeat loads, two fertilizer applications, all species caps, permanent dogs, original crop healing, maximum 41-animal/200-product presentation, and cancellation when the active save/world changes. Browser/mobile visual clearance remains a separate acceptance check; do not infer that it passed from mesh/unit tests.
