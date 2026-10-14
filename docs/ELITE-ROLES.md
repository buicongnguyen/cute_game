# Elite roles on the normal planets

Written 2026-10-14 (branch `dev-elite`). The owner approved roles on the normal planets, two first so the feel can be judged before they spread: a **splitter** on the Candy planet and a **shielded** creature on the Ocean planet. Rescue Call keeps its own roles (`rescue-content.ts`); these are separate.

## Where things live

| What | File |
|---|---|
| Rules and numbers (pure data) | `src/elite-roles.ts` (`ELITE_ROLES`, `SPLIT`, `SHIELD`, `barrierHit`, `eliteAssignments`) |
| Browser world: dressing, barrier on a hit, split, children leaving with the parent, snapshots | `src/elite-world.ts`, called from a few lines in `src/world.ts` |
| Rewards (browser and server) | `src/elite-rewards.ts` |
| Server authority | `server/combat-authority.mjs` (`hit`, `kill`, the tick), roster in `src/enemy-roster.ts` |
| Drawing, cues, first-meeting toast | `src/elite-view.ts`, `src/elite.css`; badge and hint in `src/hud-combat.ts` |
| Art | `art/blender/kit/build_elite.py` -> `public/assets/models/elite.glb` |
| Strings | `src/locales/vi-elite.ts`; Help topic 'Elite creatures' |
| Balance | `ELITE=1 node --experimental-strip-types promo/fight-sim.mts` |

## Who carries a role

A role is attached to a spawned creature of an ordinary species, never a boss and never a dormant slot. On its planet, exactly round(count x 1/6) of the species carry it, picked by a fixed hash of planet, species and the creature's place among its kind, from the shared roster order alone. Every browser and the server agree without sending anything. Creatures are placed at least 27 m from the centre, and the landing safe zone is 11 m, so an elite never stands in the landing area.

| Role | Planet | Species | How many | Health | Damage | Size | EXP | Extra loot roll |
|---|---|---|---|---|---|---|---|---|
| Splitter | Candy (landing level 6) | Jelly Jumper (the blob that already reads as a splitter in Rescue Call) | 4 of 26 | x1.15 | x1.1 | x1.3 | x1.6 | 50% |
| Shielded | Ocean (landing level 12) | Stone Crab (a shelled creature at home in the sea; Lava already has the shelled magma turtle) | 2 of 12 | x1.4 | x1.1 | x1.2 | x1.6 | 60% |

## The splitter

When beaten it bursts into **2** children: 60% size, 30% of the elite's health each, 55% damage, 30% faster. Children do not split again: the second level (a child into 2 tiny ones at 40% size) is the data switch `SPLIT.second`, **off**.

- **Cap (speed rule):** the Candy planet keeps 8 dormant child slots, appended last to the roster (older creature ids do not move). With fewer than 2 free slots the elite dies without splitting.
- **Respawn:** children never respawn themselves. When their parent comes back at its home, any child of it still out vanishes.
- **Counting (decided):** the elite counts as **one kill of its species** for quests, bounties and kill totals, with its loot and the extra roll. A child pays its small EXP (15% of an ordinary jelly's) and nothing else: no loot, no kill count. All EXP together is about 1.9x an ordinary jelly. This is above the 1.3x first suggested, because the fight takes 1.2x to 2.8x as long and rewards a minute should stay about even or a little better.
- **Launch:** children are 0.36 m round, so the Strike's third hit and the Quake launch them like any small creature.
- **Online:** the server wakes the children in its `kill` path, the same way as the magma slime's tiny slimes, so every player sees the same children.

## The shielded crab

It wears a crystal barrier. The simulation (`combat.ts`) tags every hit with a `source`, so the browser and the server apply the same rule:

| Source | Set by | While the barrier stands |
|---|---|---|
| `shot` | a basic attack's projectile (a gun, the air shot) | 15% gets through, 'Deflected', the barrier flashes |
| `pet` | a pet's shot, the dog's toss | 15%, deflected |
| `summon` | turrets, cannons, clones, trees | 15%, deflected |
| `melee` | a basic sword or fist hit | full damage, 1 crack |
| `skill` | any skill: Lob and its splash, Rush, Strike chain, disguise skills, a skill's own projectile | full damage, 1 crack |
| `dive`, `quake`, `power` | the dive strike; the Quake, Sky Quake and old Root Quake; the power strike | full damage, breaks it at once |

3 cracks break it. Broken, it stays down for **6 s**, everything hurts in full, and the crab is stunned for **1 s**. Then it regrows. Cracks heal after 10 s without a cracking hit. Hazards never touch the barrier. Devour still finishes a weakened crab through it, as with the magma turtle's shell.

**Online:** the server's `hit` applies `barrierHit` before the stun is worked out, adds `barrier` (the event) to the impact it broadcasts, ticks the barrier, and publishes it in the snapshot. Browsers draw what the server says.

## Look

- **Every elite:** a ground ring in the role's colour, and a badge on its health bar with an icon and the role. The selected one also shows its one-line hint. The target frame shows icon, role and hint.
- **Splitter:** a see-through jelly body (its ink outline is dropped, because it showed through as a dark core) with the two magenta cores it will become drifting inside, and a wobble. Its children have the same look, smaller. 'Split!' and a pink burst when it splits.
- **Shielded:** a crown of 12 hexagonal crystal plates round the crab. Dark zigzag cracks appear at one and two hits. At three it shatters into pooled shards with 'Shell broken!', then grows back over 0.45 s.

**Cost:** each part kind is one instanced mesh for all elites in view: ring, barrier, three crack sets and cores, so at most 6 draws together. A part kind with nothing to show is hidden. Triangles per part: barrier 240, cracks 108/144/144, cores 240. `elite.glb` is 41.8 KB and is loaded only on a planet with elites.

## Balance (fight-sim, 6 seeds, hero at the planet's landing level with that level's gear)

| Role | Way of fighting | Ordinary | Elite | Ratio | EXP a minute |
|---|---|---|---|---|---|
| Splitter | sword | 1.6 s | 1.8 s | x1.17 | 764 -> 1571 |
| Splitter | fists | 2.5 s | 4.2 s | x1.67 | 475 -> 682 |
| Splitter | gun, close, with skills | 1.3 s | 3.5 s | x2.77 | 938 -> 814 |
| Splitter | gun at 7 m, shots and Lob | 2.1 s | 4.2 s | x2.02 | 576 -> 684 |
| Shielded | sword | 1.0 s | 1.7 s | x1.66 | 3077 -> 4092 |
| Shielded | fists | 4.2 s | 6.7 s | x1.59 | 761 -> 1052 |
| Shielded | gun, close, with skills | 1.2 s | 1.6 s | x1.31 | 2659 -> 4461 |
| Shielded | gun at 7 m, shots and Lob (wrong answer) | 3.0 s | 13.9 s | x4.65 | 1063 -> 503 |
| Shielded | gun at 7 m, shots only (wrong answer) | 3.4 s | 26.2 s | x7.72 | 938 -> 268 |

The barrier never cuts a sword or fist hit, so for them it adds nothing beyond the x1.4 health. Ordinary fights at the landing level last only 1 to 4 s, so ratios move in steps of a hit or two.

The wrong answer, a gun kept at range into the shield, is over the hoped-for 3x. With 15% let through, the barrier only breaks after three Lobs (about 12 s), however much health the crab has. Letting 30% through gives x3.25 (shots and Lob) and x3.63 (shots only). That is the knob, `SHIELD.shot`, if the owner wants the wrong answer softer.
