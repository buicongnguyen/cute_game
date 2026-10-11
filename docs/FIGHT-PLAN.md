# Fight plan: four ground moves, the jump, and their combinations

Written 2026-10-11. Status: steps 1 to 3 built (branch `dev-moves`); steps 4 and 5 still plan. The jump itself is being built on branch `dev-jump`; this plan says how the moves are balanced once it lands. The speed rule of `docs/QUALITY-PLAN.md` applies: no move may add drawing work beyond the pooled effects the game already has.

## 1. The idea

Every fight is built from four kinds of move, on the ground or in the air, and the way to avoid a hit is to leave the place where it will land.

| # | Move | What it is | Good at | Weak against |
|---|---|---|---|---|
| 1 | **Strike** | A straight hit in front of the hero | Fast, safe, builds the combo | Short reach, one target |
| 2 | **Rush** | A fast pass through the enemy that hits on the way | Closing distance, escaping, hitting a line of enemies | Ends behind the enemy with a short pause |
| 3 | **Quake** | A hit on the ground that sends a ring outward | Crowds around the hero, launching enemies upward | Slow to start; a jumping or far enemy is missed |
| 4 | **Lob** | A shot thrown upward that drops on a marked spot | Range, hitting behind cover, flying enemies | Slow flight; the target can walk out of the mark |

Jump (single, double, triple) is the fifth action. It is not an attack: it changes each of the four.

**Owner's decisions (2026-10-11)**

- The fight moves are designed first; boss styles come after. Each boss will then get a weakness that a certain combination of moves opens.
- A new player has one jump. The double jump, and later the triple, are unlocked by improving a skill.
- Bosses block low hits: hits from the ground or from a single jump are reduced (starting value: half damage, one value per boss), hits from double-jump height or higher are not. A single jump is mainly for dodging; the double jump is what opens a boss up. Bosses met before the double jump can be unlocked do not block.

## 2. Evaluation of the idea

**What is strong**

- Four moves with different shapes (point, line, ring, far circle) are easy to read and easy to teach. Each answers a different question: who is in front, who is far, who surrounds me, who is behind cover.
- "Avoid a hit by leaving its place" is fair and skill-based. It needs no dodge button, and it works the same for the player and for the creatures.
- The four already map onto the game: Paw Storm is a Strike, Breeze Step is a Rush, Root Quake is a Quake. Only the Lob is new, and it would replace or reshape Petal Gale.
- Combining with the jump gives eight moves from four buttons, so phones do not need more buttons.

**What to watch**

1. **Dodging by moving only works if every attack warns first.** Each enemy attack needs a visible mark on the ground and a wind-up long enough to walk out of it. Attacks that hit at once (a bite at close range) must be weak, or the rule feels unfair.
2. **Moving away must not always be the best answer.** If walking beats everything, the jump and the Rush are pointless. Some marks should be too wide to walk out of in time (jump them), and some should chase the hero (Rush through them).
3. **The Lob is the hardest to make fun.** A slow arcing shot that enemies simply walk out of feels bad. It needs a small splash, and enemies should only leave the mark when they are free to move (not while attacking or stunned).
4. **Petal Gale changes role.** Players who like the spin lose it unless it becomes the air version of Strike (section 4).
5. **Balance work is real.** Existing fights were tuned for four skills with cooldowns and no dodge. The numbers below are starting points to tune, not final values.
6. **Online.** The server decides creature damage. Move timings must be the same on both sides, or a hit that looked dodged will still land. Solo first.

## 3. Ground moves (what shipped)

One table in `src/moves.ts` (`MOVES`, `AIR_MOVES`), shared by the hero and, later, creatures. The moves replace the four starting skills only while the 'Jump and air combat' switch is on, in solo play. Switch off, or online, the old Petal Gale spin, Breeze Step, Root Quake and Paw Storm play exactly as before. Disguises and uniforms keep their own four skills unchanged in this step; a weapon with a special of its own keeps it in the fourth slot (`STRIKE_OVER_WEAPON_SPECIAL = false`, see section 9). Names stay: Petal Gale is the Lob (petals thrown in an arc), Breeze Step the Rush, Root Quake the Quake, Paw Storm the Strike. Upgrade levels scale them as before (damage; the Lob's splash +0.12 m and the Quake's ring +0.3 m per level; Rush cooldown -0.2 s per level).

| Move (slot, keys) | Damage | Reach / shape | Wind-up | Recovery | Cooldown | Extra |
|---|---|---|---|---|---|---|
| Strike (Paw Storm; R / ;) | 3 hits: 80%, 88%, 112% | 2 m arc ahead, 120 degrees (a body counts when any part is in it) | 0.10 s, hits 0.16 s apart | 0.15 s | 5 s | Third hit launches creatures under 1.2 m wide, never a boss |
| Rush (Breeze Step; W / K) | 160% | 6 m line, 1.2 m wide | 0.12 s | 0.30 s | 4 s | Untouchable while dashing: no ground mark or blow hurts |
| Quake (Root Quake; E / L) | 240% | 3.5 m ring | 0.35 s | 0.35 s | 7 s | Launches; 0.6 s stun on bosses and creatures 1.2 m wide or more (a boss turns it into a slow) |
| Lob (Petal Gale; Q / J) | 260% within 0.8 m of the spot, 130% to 2 m | lands 4 to 9 m away | 0.25 s + 0.6 s flight | 0.20 s | 6 s | Aimed at the chosen target, else the nearest enemy within 9 m, else 6.5 m ahead; the spot is marked for the whole wind-up and flight; hits flyers |

Changes from the starting numbers, from the simulation (section 7): the Strike chain went from 100/110/140% (350% a cast) to 80/88/112% (280%) and got a 5 s cooldown, because without one it outdamaged everything; the Quake went from 220% to 240% so its ten seconds match the others.

## 4. Air moves (jump + one of the four), and the final input mapping

| Jump + | Becomes | Numbers |
|---|---|---|
| Strike | **Sky Spin**: one spin hitting all round (the old Petal Gale look) | 80%, 2.2 m round, holds the height 0.12 s; 0.32 s between spins. It is also what the attack button does while rising with paws or a blade, so there is one air swing, not two |
| Rush | **Sky Step** (air dash) | 160%, same 6 m, holds the height 0.24 s, turns once toward the stick after half the way; own air cooldown 4 s |
| Quake | **Sky Quake** (heavy dive) | A 4.5 m ring for 2.5x from a single jump's top, 3.2x double, 4x triple, plus the plain dive strike on top; capped at 15% of a boss per ring; own air cooldown 7 s. While cooling down, the Quake key in the air does the plain dive |
| Lob | **Petal Rain** | 3 shots of 90% straight down, 1.3 m apart in a line from under the hero, 1.3 m splash each; own air cooldown 6 s |

The attack button keeps: in the air, rising = Sky Spin (with a gun: the old air shot), falling from 0.9 m up = the plain dive (`jump-rules.ts DIVE`, no cooldown). Air forms have their own cooldowns, so a Rush can be followed by Sky Step and a Quake by Sky Quake; in the air each skill button shows its air form's cooldown and turns sky blue.

| | PC | Phone |
|---|---|---|
| Jump | Space (or Left Shift with Space on attack) | centre Jump pad |
| Attack | F / N | inner toe |
| Lob / Rush / Quake / Strike | J K L ; (WASD layout) or Q W E R | the four skill toes |
| Air forms | Jump, then the skill key while in the air | press Jump and slide the same finger to the toe (or tap Jump, then the toe) |

## 5. Sequences
(the fighting-game part)

A hit within 1.5 s of the last one continues the combo: +4% damage per hit, up to +40%. Being hit resets it.

Three routes to teach, from easy to hard:

1. **Ground route:** Strike, Strike, Strike (launch), then Quake as the enemy lands.
2. **Launch route:** Quake (launch), jump, Air swing twice, Dive.
3. **Chase route:** Lob to draw an enemy, Rush through it, jump, Air dash back, Dive.

Finishers (Quake, Dive) end the combo with a bonus equal to half the ramp, so stopping at the right moment is a choice.

As built: the existing combo meter (+4% a hit, 1.5 s window, 2 s on touch). A Quake or a dive (plain or Sky Quake) landing on a chain of three or more is a finisher: x1.25 and 'FINISHER!'. A Quake that opens a chain counts as its launcher. In the ground route a hero with a weapon special does Strike x3 as three basic hits (every third basic hit launches, as before). All three routes are scripted in `promo/fight-sim.mts` and win (section 7).

## 6. Avoiding hits

| Enemy attack | How it warns | How to avoid it |
|---|---|---|
| Swing or bite in front | The enemy leans back, 0.4 s | Step out of reach or to the side |
| Charge in a line | A line on the ground, 0.7 s | Step sideways, or Rush through it |
| Ground ring or quake | A growing ring, 0.8 s | Walk out if it is small; jump if it is wide |
| Falling shot | A circle where it lands, 0.9 s | Walk out of the circle |
| Chasing mark (bosses) | A mark that follows the hero, then locks | Keep moving, then Rush out when it locks |

**Warnings audit (step 2, as built; no new meshes: the pooled telegraph decals).** Shapes are named in `jump-rules.ts ATTACK_SHAPE`.

| Attack | Before | Now (switch on) |
|---|---|---|
| Ordinary melee bites and swings | red arc, wind-ups 0.30 to 0.45 s (bee, owl, minislime 0.3 s) | wind-up never under 0.35 s (`WARNING.min`); the blow lands only inside the drawn arc |
| Chargers (boar, seal, lizards, snake, wisp ...) | pose only (firebat, lavaworm, magmaturtle had discs) | amber lane of discs toward the target during the wind-up, kept down for the run |
| Boss plain bite or swipe | pose only | red arc of its real reach; the blow lands only inside it |
| Boss spin (2.4 s of hits) | no mark after the wind-up | a 3.4 m ring follows the boss, pulsing with each hit |
| Boss slam, quake, rain, charge, eclipse; titans; the Colossus; dungeon skills | discs, 0.7 to 2.4 s | unchanged (all over 0.35 s) |
| Shots (shooters, barrage) | a pose, then a slow ball | unchanged: the ball is its own warning |
| Hazards (lava, fire rain) | own marks, 1.1 s | unchanged |

Not changed in this step: online (the server keeps its timings); no new boss attacks; chasing marks are still to come (step 4).

Rules that keep it fair:

- No attack lands without a mark or a clear body pose first. Minimum warning 0.35 s on Normal.
- Leaving the mark before it lands means no damage. Leaving within the last 0.25 s is a perfect dodge: the next hit is a critical.
- Creatures use the same four shapes, so what the player learns from their own moves also reads the enemy.
- Difficulty changes the warning time and how many marks overlap, never hidden damage.

## 7. How the balance is checked

1. One data table of all moves (the numbers above), used by the hero and by creatures.
2. A simulated fight in the tests: a scripted hero using each route against three bosses, reporting time to win and damage taken. Targets: a boss lasts 45 to 90 s at its level; no single hit takes more than 15% of a boss's health; a careless hero loses.
3. A check that no move is always best: each of the four must be the top choice in at least one test fight.
4. Play checks on a phone, because timing windows feel shorter on touch.

**Results (as shipped, `node --experimental-strip-types promo/fight-sim.mts`, 6 seeds, no food eaten).**

Ten seconds of one move used perfectly on one creature: Lob 520%, Rush 480%, Quake 480%, Strike 560% (within 17%).

| Test fight (10 s, one move) | Lob | Rush | Quake | Strike | Best |
|---|---|---|---|---|---|
| one large creature in reach | 520% | 480% | 480% | 560% | Strike |
| five in a row ahead | 1820% | 2400% | 1440% | 560% | Rush |
| six all round | 260% | 480% | 2880% | 1680% | Quake |
| three 8 m away | 1560% | 960% | 0 | 0 | Lob |

Boss fights (time to win; damage taken in full healths; boss block off as shipped): King Bear lvl 13 / Yeti lvl 16 / Shadow Lord lvl 24.

| Script | King Bear | Yeti | Shadow Lord |
|---|---|---|---|
| switch off (old skills) | 64 s, 5.0 | 60 s, 5.1 | 90 s, 11.2 |
| careless (moves, no jump, no stepping out) | 72 s, 7.4 | 67 s, 7.9 | 93 s, 11.2 |
| single jump, dodging | 56 s, 1.4 | 52 s, 0.5 | 102 s, 3.3 |
| double jump, all moves | 51 s, 1.4 | 44 s, 0.5 | 84 s, 1.8 |
| ground route | 67 s, 1.7 | 58 s, 0.1 | 120 s, 3.5 |
| launch route | 59 s, 1.8 | 53 s, 0.2 | 113 s, 3.3 |
| chase route | 65 s, 2.3 | 54 s, 0.4 | 119 s, 3.7 |

Biggest single hit 7.8% of a boss (target under 15%). Careless play takes 7 to 11 healths (loses without food); careful play 0.1 to 3.7. The Shadow Lord routes run 113 to 120 s (target 45 to 90) because it is met two levels up and grows 24%: that is step 4.

## 8. Order of work

1. [x] Jump with dodging and the Dive.
2. [x] Reshape the four skills into Strike, Rush, Quake and Lob with the table in section 3; warnings on every creature attack.
3. [x] Air versions (section 4) and the combo routes.
4. [ ] Bosses re-tuned with the simulated fights; chasing marks for the big ones.
5. [ ] Online timings on the server.

## 9. Decisions for the owner

1. Decided for now: Petal Gale became the Lob and its spin is the air Strike (Sky Spin).
2. Keep cooldowns on the moves, or use one stamina bar shared by all four (more like a fighting game, harder to balance)?
3. Is the perfect-dodge critical wanted, or should dodging give safety only?
4. Should the Strike replace weapon specials in the fourth slot (`STRIKE_OVER_WEAPON_SPECIAL`, built, off)? Today a sword keeps its special and the Strike exists only for paws and weapons without one.
5. The Shadow Lord is long with the moves (113 to 120 s on the routes): re-tune it in step 4, or raise move damage.
