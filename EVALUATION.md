# First play-test

For a fresh test, use a separate browser profile or a separate local preview origin. Keep the existing adventure available for save-compatibility checks. Settings → Start a new adventure replaces the save for that origin and is only needed when you intentionally want to discard it.

## A 10–15 minute route

1. Pick a name/color and start. Walk using the ground, arrow keys, and map shortcuts.
2. Plant three carrots. Each takes 25 seconds. Open the backpack or journal while they grow.
3. Harvest, claim the first journal reward, and sell the three carrots at the market.
4. Claim the selling reward, buy the sprout sword, claim the purchase reward, then equip the sword in the backpack.
5. Claim the equipment reward. Use the map to walk into Bramble Woods. Click creatures to attack; try Q/W/E/R.
6. Claim the combat reward, upgrade at the crystal, buy and equip a fishing rod, and visit the pond.
7. Hold and release Reel/Space to keep line tension in the green. Catch two fish.
8. Check the remaining journal steps, grow more crops, and work toward level 5 and the rocket.
9. Reload the page and continue. Check that the garden, equipment, inventory, and quest step survived.
10. Try a narrow phone-sized window and Low graphics mode.

## Questions for the next version

| Area | Questions |
|---|---|
| Movement | Does the character move quickly enough? Is click-to-walk predictable? |
| Interactions | Are the labels clear? Can you reach every service without getting stuck? |
| Farming | Is 25 seconds too short, too long, or right for the first crop? |
| Combat | Are hits readable? Do the four skills feel different enough? |
| Fishing | Is the hold/release tension understandable and satisfying? |
| Progression | Does the quest journal explain the next step without feeling restrictive? |
| Visuals | Keep the softer palette, or move closer to the reference's brighter colors? |
| Content | Improve one planet deeply, add more activities at home, or prioritize multiplayer? |

Record reproduction steps for problems: what you clicked, your equipment/level, the current planet, expected behavior, and actual behavior.

## Validation approach

`npm run build` checks all production TypeScript and creates the distribution. `npm test` checks the resource/progression rules and navigation regressions. Browser checks cover starting, farming, selling, quest rewards, equipment, and save/reload; further checks are recorded in `TEST_RESULTS.md`.

Planet-specific endgame balance, a full chapter playthrough on a physical phone, and multiplayer are not covered by those automated tests.
