# Zoo Garden: reference parity and correctness review

Reviewed 30 September 2026. Reference: [Zoo Pet](https://zoo-pet.store), which redirects to [the live game](https://d173ysgpwor2n4.cloudfront.net/). Local project: `C:\Users\n\source\repos\cute_game`.

## Verdict

The local game reproduces the structure of the opening garden–trade–equipment–combat loop, but it does **not** yet work as a complete functional clone of the reference. Its farming catalog, balance, combat effects, world content, progression systems, and online features differ substantially. The refined Blender models improve the presentation without closing these gameplay gaps.

This review separates missing reference features from defects in the systems that the local game already claims to support. The reproduced input, inventory, pathfinding, and persistence defects below were repaired. Enemy/scenery collision remains an open defect. The larger reference-content and balance differences were not redesigned.

## Evidence and limits

The reference was revisited through its public guest mode. Character setup, the village, seed selection, planting, a mature carrot harvest, inventory, the first chapter, and the help screen were inspected. The reference harvest awarded 4 XP and increased the first quest counter to 1/3. Crop, quest, and inventory observations were saved as transcripts. Planet-specific rules and online behavior below are described by the reference's help; they were not all played end-to-end. No account or multiplayer session was created.

The local review inspected every production TypeScript module, the interface and styles, existing tests, and Blender model integration. Reproductions targeted state transitions and gameplay invariants. A separate local test origin was used for fresh-game checks; the existing Clover adventure was retained.

## Reference comparison

| Area | Reference evidence | Local implementation | Assessment |
| --- | --- | --- | --- |
| Opening | Name/color selection, safe cottage garden, free seed planting, harvesting, trading | Same broad sequence with original English interface and art | Structural match |
| Starting garden | Nine empty beds; expansion shown at 60 energy | Six beds; first expansion 35 energy; maximum twelve | Different layout and economy |
| Crops | Nineteen seed cards; two unlocked at level 1; later crops up to level 18 | Three crops, unlocked at levels 1–3 | Major catalog/progression gap |
| Basic carrot | 10 seconds, 4 XP, displayed sale value 3; description gives +20% speed for 45 seconds | 25 seconds, 8 XP, sale value 8; heals 18 HP | Timing, reward, and consumable effect differ |
| First level | HUD starts at 0/25 EXP | First threshold 30 XP | Different progression curve |
| First quest | Harvest three crops; reward 36 energy, 6 XP, 15 star points | Same task and energy; 12 XP; no star-point system | Partial match |
| Chapter 1 | Nine tasks: harvest, sell, buy, equip, defeat five, upgrade, catch two fish, use ten skills, reach level five | Same task sequence | Structure matches; rewards and surrounding systems differ |
| Equipment | Weapon, hat, outfit, shoes, pet, disguise; critical-hit stat | Five slots; no disguise or critical-hit system; small item list | Partial match |
| Consumables | Temporary speed, attack, defense, XP, attack-speed, critical, magnet, luck, light, and resistance effects listed in seed descriptions | Food restores health; fertilizer instantly ripens a crop | Major effects gap |
| Combat | Different unarmed/sword/gun behavior; continuous spin, dash, knock-up, weapon-specific ultimate described | Shared immediate damage logic with different ranges/multipliers; generic effects and short stuns | Recognizable controls, simplified mechanics |
| Defeat/storage | Recoverable dropped bag; level retained; chest protects stored items | Implemented; previous unclaimed bag is automatically protected in storage on another defeat | Broad match with an extra local recovery rule |
| Fishing | Rod, fish/float observation, line tension and reeling | Functional tension/progress minigame with two fish outcomes | Simplified match |
| Travel | Eight themed planets; detailed environmental rules described | Eight small themed arenas plus home | Destinations match in theme; behavior does not |
| Planet rules | Eruptions, rising lava, floating stones, caves/ancient forge; toy train; jungle barriers/gas; swimming/oxygen/turtle; cloud platforms/wind; darkness/lighting | Static hazards, speed modifiers, mines, gifts, higher rare-fish chance, themed enemies | Major gameplay gap |
| Crafting/decorations | Planet materials produce equipment, pets, wings, and placeable garden decoration | Four recipes; no placement/decorations system | Partial match |
| Other progression | Daily/weekly quests, star pass, achievements, changing bounties, timed challenges visible in journal | First nine-step chapter only | Missing |
| Social/persistence | Guest mode explicitly offline; registered online play, shared areas, friends, visits, chat described | Browser-local single player | Online parity absent |
| App/controls | Hold-to-move, pinch camera zoom, fullscreen/install controls; offline installation described | Click/keyboard/touch direction pad; settings zoom; no PWA/install workflow | Partial match |

The earlier description that the local game used universally “shorter crop timers” was incorrect. The verified reference carrot is faster than the local carrot. Local balance remains provisional.

## Confirmed code defects addressed

| Finding | Reproduction and impact | Repair |
| --- | --- | --- |
| Shared combat reach was inconsistent | Clicking with the blaster approached melee distance despite its 8-unit attack range. A stunned or idle boss could be selected from outside the 2.7-unit melee range and receive no hit. Ordinary chasing bosses can close this gap, so this was not a universal permanent boss lock. | Selection, approach, follow-up attacks, and damage checks use the same weapon range. |
| A route could end across an obstacle | The search accepted a nearby grid cell, then appended the exact destination without checking the final segment. Reproduced a route that stopped 0.75 units short indefinitely. | Validate full route segments and the final approach. |
| Invisible gifts could still intercept clicks | An opened gift remained in the scene after removal from the live entity list; raycasting still returned its hidden mesh. | Targeting rejects hidden/removed entities and collected gifts are restored consistently. |
| Touch actions canceled held movement | Hold a direction with one finger, tap/release attack with another: the global pointer release cleared all movement, including keyboard input. | Track each touch pointer and keyboard input independently. |
| Paused enemies and active player cooldowns | Opening a dialog froze enemies while skill and invulnerability timers kept advancing, permitting safe repeated skill recharge. | Combat clocks follow the same pause policy as the simulation. |
| Fishing Enter instruction did not match focus | At a bite, focus remained on Close, so Enter could close the dialog instead of reeling. | Enable and focus Reel at the bite; maintain independent pointer, Space, and accessible toggle inputs. |
| Spare equipped items were trapped | Buy two hats and equip one: selling/storing the spare was disallowed because all copies were treated as equipped. | Protect one equipped copy and expose the remaining quantity to market/storage. |
| Malformed saved identifiers were accepted | Prototype names such as `constructor` and `__proto__` passed `in` checks, producing invalid crop growth or broken world data. | Require known own identifiers and validate optional saved structures/numbers. This is a local save robustness issue, not evidence of a remote exploit. |
| A legitimate high-level save was rejected | Progression could reach level 1000, but the loader rejected any level above 999. | Align loading with supported progression and retain valid high-level saves. This is a rare long-session edge case. |
| Rewards could be farmed by reloading | Crystal cooldowns and opened gifts existed only on scene objects; reload immediately restored rewards. | Save mine cooldowns and claimed gift indexes. Mines retain their 20-second renewal; Toybox presents are once per saved adventure in this baseline. |

## Validation

- Production TypeScript check and build: passed. The existing Vite advisory for the approximately 535 kB Three.js chunk remains; physical-phone performance is not established by a successful build.
- Automated suite: **45 passed, 0 failed**, expanded from the previous 18 tests.
- An independent integration review drove **180 routes across all nine worlds** using actual `World.update` with real Three.js objects and no WebGL rendering. Every sampled route completed, remained outside obstacles, and ended within 0.001 units of its destination. This is sampled coverage, not proof for every possible click.
- The rule-level nine-step chapter test completed at level 6, 21 XP, and 295 energy. It then covered Candy exploration, ordinary farming to level 9, Ember travel, Ember blade crafting/equipping, death, and returning to recover the dropped bag. Combat/fishing rewards and skill counters were simulated according to existing rules; this is not a claim of a complete manual chapter playthrough.
- Browser checks completed the opening four quests in a separate adventure: grow/harvest three carrots, sell them, buy the sword, equip it, and claim rewards. The test reached level 3, 60 energy, and the combat quest. Existing-save loading, crop growth across reloads, interaction routes, and combat pause were also verified. The original Clover adventure was retained.
- Browser fishing verification confirmed that a bite focuses Reel, Enter starts reeling, a second Enter releases, and Escape closes normally. A separate earlier attempt correctly snapped the line after tension became too high; no new successful fish catch is claimed for this pass.

Behavioral regression coverage includes inventory conservation, old-save compatibility, invalid identifiers, reward persistence, route clearance, targeting, weapon range, independent inputs, pause clocks, and fishing focus/input. Full chapter progression is checked using game rules; this is distinct from manually playing every combat and fishing encounter.

New reward history uses a compatible addition to the existing v1 save. Earlier saves did not record opened gifts or mine cooldowns, so that historical state cannot be reconstructed. From this update onward, every Toybox present can be collected once per adventure, and crystal veins regrow after 20 seconds across reloads and travel.

## Open code finding

**P2 — Enemy movement ignores scenery collisions (`src/world.ts`, enemy movement in `update`, approximately line 323).** Enemies update their positions directly, whereas the player follows obstacle-aware movement. Reproduction in the actual world simulation: keep the player at `(48, 48)`; after 373 updates of 0.025 seconds, the home Rock crab is at approximately `(22.698, -15.828)`, overlapping the tree at `(23.033, -16.312)` with trunk radius 0.601. The initial spawn is clear, but the idle path enters the trunk. Enemies can therefore visibly pass through solid scenery. A consistent enemy collision/navigation policy remains necessary; it was not replaced with an untested AI rewrite during this review.

No reproducible defect was found in preserving live crops during Blender asset replacement or in the suspected world-rebuild-during-death callback. These were checked and not reported as bugs.

## Remaining work before claiming reference parity

1. Agree on a parity specification: crop/item catalogs, growth and XP formulas, upgrade prices, world layouts, and which reference systems are required.
2. Reproduce combat behavior and feedback: sword sweeps, projectiles, repeated spin hits, knock-up, distinct ultimates, buffs, and critical hits.
3. Build one planet's full environmental rules, then extend the others. Recolored arenas alone are insufficient.
4. Add the remaining progression and content systems: disguises, decorations, collections, daily/weekly quests, bounties, passes, and events.
5. Implement shared server-owned gameplay, accounts, friends/visits, and chat if online parity is required.
6. Test full journeys on physical phones and multiple browsers, prolonged sessions, accessibility, and real network conditions. No physical-device performance or multiplayer certification is claimed here.

The immediate recommendation is to evaluate the repaired local loop and choose explicit parity targets before adding further visual detail or changing engines.
