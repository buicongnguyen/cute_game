# Fight plan: four ground moves, the jump, and their combinations

Written 2026-10-11. Status: plan. The jump itself is being built on branch `dev-jump`; this plan says how the moves are balanced once it lands. The speed rule of `docs/QUALITY-PLAN.md` applies: no move may add drawing work beyond the pooled effects the game already has.

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

## 3. Ground moves (starting numbers)

Damage is given against the basic attack (100%). Wind-up is the time before the hit; recovery is the time after it when the hero cannot act.

| Move | Damage | Reach / shape | Wind-up | Recovery | Cooldown | Extra |
|---|---|---|---|---|---|---|
| Strike | 3-hit chain: 100%, 110%, 140% | 2 m in front | 0.10 s | 0.15 s | none | Third hit launches small enemies |
| Rush | 160% | 6 m line, 1.2 m wide | 0.12 s | 0.30 s | 4 s | Passes through enemies; ground marks do not hurt while rushing |
| Quake | 220% | ring, 3.5 m | 0.35 s | 0.35 s | 7 s | Launches enemies it hits; 0.6 s stun on large ones |
| Lob | 260% centre, 130% edge | lands 4 to 9 m away, 2 m splash | 0.25 s + 0.6 s flight | 0.20 s | 6 s | Hits flying enemies; marks the landing spot |

Rule of thumb: over ten seconds of perfect use, each move should give about the same damage. The fast ones win in a duel, the slow ones win against groups.

## 4. Air moves (jump + one of the four)

| Jump + | Becomes | Change from the ground version |
|---|---|---|
| Strike | **Air swing**, a spin that hits all round (the old Petal Gale look) | 80% per hit, hits flying enemies, keeps the hero in the air a little longer |
| Rush | **Air dash** | Same damage, crosses the ground marks below, can change direction once |
| Quake | **Dive**, a drop onto the ground | Damage by height: 250% from a single jump, 320% double, 400% triple; a critical on a boss from a double or triple |
| Lob | **Rain**, three smaller shots straight down in a line | 3 x 90%, short range, good for a boss under the hero |

Higher jumps give more damage but leave the hero in the air longer, where projectiles still hit. That risk pays for the reward.

## 5. Sequences (the fighting-game part)

A hit within 1.5 s of the last one continues the combo: +4% damage per hit, up to +40%. Being hit resets it.

Three routes to teach, from easy to hard:

1. **Ground route:** Strike, Strike, Strike (launch), then Quake as the enemy lands.
2. **Launch route:** Quake (launch), jump, Air swing twice, Dive.
3. **Chase route:** Lob to draw an enemy, Rush through it, jump, Air dash back, Dive.

Finishers (Quake, Dive) end the combo with a bonus equal to half the ramp, so stopping at the right moment is a choice.

## 6. Avoiding hits

| Enemy attack | How it warns | How to avoid it |
|---|---|---|
| Swing or bite in front | The enemy leans back, 0.4 s | Step out of reach or to the side |
| Charge in a line | A line on the ground, 0.7 s | Step sideways, or Rush through it |
| Ground ring or quake | A growing ring, 0.8 s | Walk out if it is small; jump if it is wide |
| Falling shot | A circle where it lands, 0.9 s | Walk out of the circle |
| Chasing mark (bosses) | A mark that follows the hero, then locks | Keep moving, then Rush out when it locks |

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

## 8. Order of work

1. Jump with dodging and the Dive (in progress, `dev-jump`).
2. Reshape the four skills into Strike, Rush, Quake and Lob with the table in section 3; warnings on every creature attack.
3. Air versions (section 4) and the combo routes.
4. Bosses re-tuned with the simulated fights; chasing marks for the big ones.
5. Online timings on the server.

## 9. Decisions for the owner

1. Should Petal Gale become the Lob (with its spin moving to the air), or stay, with the Lob as a fifth move?
2. Keep cooldowns on the moves, or use one stamina bar shared by all four (more like a fighting game, harder to balance)?
3. Is the perfect-dodge critical wanted, or should dodging give safety only?
