# Fight plan: four ground moves, the jump, and their combinations

Written 2026-10-11. Status: steps 1 to 3 built (branch `dev-moves`), disguise skills and the weapon in the air built (section 4b, branch `dev-airdz`); steps 4 and 5 still plan. The jump itself is being built on branch `dev-jump`; this plan says how the moves are balanced once it lands. The speed rule of `docs/QUALITY-PLAN.md` applies: no move may add drawing work beyond the pooled effects the game already has.

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

### 4b. Jump + a disguise skill, and the weapon in the air (built 2026-10-12)

One table, `src/air-cast.ts` (`AIR_CAST`), gives every disguise skill (17 disguises x 4) one class for a press in the air window. A test fails when a skill is added without a class. Switch off or online, none of it is reached.

| Class | What happens | Skills |
|---|---|---|
| **Air, from the body** | Cast where the hero is: it hangs 0.2 s in a casting pose, and the cast begins at its height (shots fly down to the target, a hook or a drain slants down, puffs and shields are up there) | Laser gaze, Boulder throw, Vanish, Great fireball, Shield block, Homing missiles, Energy shield, Grappling hook, Scout parrot, Life drain, Bat form, Bat swarm, Cork popgun, Lotus petals, Paper fan breeze, Dragon fan, Star shield, Liberty torch, Golden star burst |
| **Air, set on the ground** | The same hang; what is made appears on the ground under the hero (a summon, a shout's ring, a flower ring) | Shadow clones, Challenge, Tesla turret, Terrifying roar, Healing flower ring, Binding tree, Deck cannon, Rolling snowball, Snow decoy, Bosun's whistle, Lighthouse beam, Lantern festival |
| **Air, called down far away** | The same hang; the strike lands on the enemy's spot as ever | Sheep spell, Black hole, Sky sword, Fairy charm, Ship broadside, Signal flare, Supply drop, Fireworks finale, Great golden star |
| **Plunge** | A ground skill: the hero drops at once at the dive's speed and the skill is cast where it lands, stronger from higher (+10% from a single jump's top, +20% double, +30% triple, `AIR_CASTING.bonus`). No dive strike on top; each hit obeys the dive's cap on a boss (20% of its health); the cooldown starts on landing, so a plunge that finds no target costs nothing | Meteor dive (still leaps 4 m ahead while it falls), Smoke bomb, Knight's charge, Tank mode, Devour, Tail sweep, Giant form, Blood moon, Ice rink, Ice age, Sandbag wall, Anchor swing, Wave ride, Ink circle, Dragon dance, Bamboo vault, Bronze drum |
| **Movement** | It takes the jump over, so the hero is never moved twice. Flight: the jump ends and its height blends into the flight (no pop up, no drop). Glide: the height holds for the dash, then the hero falls. Blink: arrives at the same height and hangs 0.12 s; Shadow strike arrives on the ground behind its target | Take flight, Butterfly float, Kite glide (flight); Silk ribbon glide, Eagle strike (glide); Blink, Shadow strike (blink) |

A press too late in the fall or during a dive is kept and cast on landing; it now also waits out a plunge that landed as a charge, so two quick presses cast both skills. Criticals from the air are worth 8x only where they already were (a hit landed while the hero is in the air); a plunge's hits land from the ground and use the ordinary 4x.

**The weapon in the air.** The attack button uses the weapon that fights (the one in hand, else the disguise's own): paws spin as before (2.2 m); a blade's spin reaches as far as the blade does on the ground (2.3 to 3.4 m) in the blade's colour; a gun shoots, the shot leaving from the hero's height and flying down. The dive strikes with it: a blade chops down with its own reach, a gun lands as a blast in its shot's colour. Damage, cooldowns, the dive's cap and its sure critical are unchanged. In a disguise the hero now swings, chops or aims with the weapon it holds (it used to punch whatever it held).

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

## 10. The hit counter and the power strike (built 2026-10-13, branch `dev-combo`)

Only while the 'Jump and air combat' switch is on, in solo play. Off or online nothing of it exists: no counter, no button, no key, no charge (`tests/air-switch.test.ts`). The basic attack itself is unchanged.

**The hit counter** (`src/combo-counter.ts`, `src/combo-counter.css`) replaces the combo chip on the screen's left edge. A number in a thin ring with 'HITS' and the damage bonus beside it, tilted, placed beside the explorer on the side away from the creature being fought. It pops on every hit, warms in colour and grows a little at 5, 10, 20 and 30 hits, names the big moments under the number for a moment ('LAUNCH!', 'FINISHER!', 'POWER!'), and when the chain ends shows its sum for 1.8 s ('12 hits · 3,480'), with 'New best!' when it beats the best chain. The best chain (hits and damage) is kept in the save's progression totals (`comboBest`, `comboBestDamage`: an open table of numbers, so no new save field). The page is written only when the count or the state changes; all motion is CSS and stops under 'reduced motion'. Where it may sit is a rule (`placeCounter`): never on the explorer or on a HUD piece, and off the target while any place clear of it is free; with no free place at all it is not shown.

**The power strike** (`src/power-rules.ts`, one table of numbers; `combat.ts powerStrike`; `src/power-fx.ts`; `src/power-hud.ts`).

| | |
|---|---|
| Charge | Every hit of the explorer's own on a creature (basic attacks, skills, air hits) adds one; pets, the dog and summons do not, and neither does the strike itself. The thin ring round the hit counter shows it filling |
| Ready | At 20 hits a glowing button appears with a pop and a chime: on touch a round button just above the paw on its inner side (the outer side on phones 360 px wide or less and on tablets; mirrored left-handed), on a desktop the first button of the tray with its key, **G** |
| Waiting | The button stays 12 s and blinks through the last 3; unused, the charge falls to half (10 hits). Being hit does not empty it; being knocked out does; using it starts again from nothing |
| Overcharge | Hits while the button shows go on counting: at 40 the button shows x2 and the 12 s start again |
| Damage | 5 basic hits (x2: 8.5), all of it on one creature, shared out among several, never less than 1.25 (x2: 2) each. The combo ramp does not raise it, a critical happens by the ordinary chance and the ordinary 4x, and one strike never takes more than 15% of a boss |
| Timing | 0.22 s wind-up (light gathers on the explorer), 0.09 s hit-stop (half for the wave), 0.3 s recovery |

| Weapon in hand (or the disguise's own) | Form | Area at level 1 (x2: 1.25 times) |
|---|---|---|
| Blade | A crescent wave that travels ahead at 26 m/s; each creature is hit when it arrives | 7 m long, 3.2 m wide |
| Fists | A gust of wind in a cone | 4.6 m, about 100 degrees |
| Gun | A beam | 11 m long, 1.5 m wide |
| Any, in the air | The explorer dives and it lands as a ring (the bigger dive version, in place of the dive strike) | 4 m round |

What is drawn is what hits, and it is made only of the pooled effects of `fx.ts` and the pooled beam of `combat-view.ts`: no mesh, material or shader of its own.

**Balance** (`node --experimental-strip-types promo/fight-sim.mts`, 6 seeds; damage per second without and with the strike, the script pressing the button as soon as it is charged and the boss stands in its area):

| Script | King Bear | Yeti | Shadow Lord |
|---|---|---|---|
| careless | 152 to 177 (+16.2%) | 172 to 200 (+16.7%) | 353 to 389 (+10.1%) |
| single jump | 194 to 211 (+8.5%) | 210 to 235 (+12.0%) | 321 to 350 (+8.9%) |
| double jump | 209 to 237 (+13.6%) | 278 to 309 (+11.2%) | 415 to 433 (+4.5%) |
| ground route | 160 to 180 (+12.0%) | 193 to 217 (+12.8%) | 272 to 300 (+10.3%) |
| launch route | 182 to 206 (+12.9%) | 220 to 243 (+10.4%) | 308 to 329 (+6.8%) |
| chase route | 175 to 188 (+7.7%) | 198 to 227 (+14.5%) | 293 to 324 (+10.8%) |

Mean +11.1%, highest +16.7%; biggest single hit 8.5% of a boss. The owner's starting numbers (10 hits, about 6 basic hits) gave +17 to +25% at 16 hits already, so the charge needs 20 hits and deals 5: the bound of about 12 to 15% came first. The overcharge is worth less than two strikes (8.5 against 10), so waiting never beats pressing.

**Decisions for the owner**

1. 20 hits and 5 basic hits, or the snappier 10 hits with a strike of about 2.5? Both keep the bound; a strike every 10 hits at 6 does not.
2. The automatic five-step chain on the attack button (spin, finisher) and hold-to-repeat were set aside for the power strike; the basic attack is as it was.
3. The air version uses the ordinary 4x critical, not the 8x of hits from the air, to keep the strike bounded.
