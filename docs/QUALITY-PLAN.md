# Zoo Garden: plan to become our own game and look much better, without getting slower

Written 2026-10-11. Status: plan only, nothing built yet. Feature work happens on the `develop` branch; `main` is what players get.

## 1. Goal and limits

- **Different.** At a glance the game should no longer look like a sibling of the game it was first built against.
- **Better.** The target is the look and feel of a polished console or mobile indie game. True AAA needs teams of animators, composers and artists, so that is not promised.
- **Not slower.** This is a hard rule (section 2). A stage that costs speed does not ship.
- **Web first.** The game keeps running in the browser, on phones and PCs. Steam and other stores come later, if at all.

## 2. The speed rule

Every stage is measured before and after with one command, and merges only if it passes.

**How to measure**

```
npx vite --port 5298 --host 127.0.0.1 --strictPort     (in one terminal)
node promo/perf-budget.mjs                              (in another)
```

It stands the hero at three fixed places and prints, for each one, the draw calls (how many separate things the graphics card is asked to draw in a frame), the triangles, and the frame rate on a CPU slowed four times to act like a phone. When a change needs an exact before and after, `promo/frozen-ab.mjs` renders the same frozen frame with the change off and on.

**Baseline** (dev build, 1600 x 900, level-41 test save, whole frame including shadows, two runs on 2026-10-11)

| Place | Draw calls | Triangles | Slow-CPU frame rate |
|---|---|---|---|
| Village (the heaviest view) | 248 to 259 | 200,000 to 206,000 | 59 to 60 |
| Wilds | 96 to 98 | 80,000 to 82,000 | 60 |
| Redrock Canyon | 113 to 124 | 68,000 to 73,000 | 53 to 60 |

The live site on 2026-10-10: about 2.3 MB downloaded before play, a steady 60 frames a second standing in the village, no slow frames.

Creatures keep moving while the tool measures, and other programs share the test PC, so numbers wander by 5 to 10 percent between runs. The slow-CPU frame rate is the noisiest. The test PC also has a strong graphics card, so it under-reports what a weak phone would feel: treat triangles and draw calls as the real limits.

**The gate**

1. Draw calls and triangles at all three places stay inside the baseline range, on every graphics setting.
2. The download before play does not grow. New art and sound load only when needed.
3. Anything that costs graphics time on every frame (glow, depth blur) is an optional extra: off by default, never on phones, and switched off by the existing automatic fallback when frames slow down. The existing Sharp, Balanced and Battery saver settings keep their meaning.
4. Prefer work done once, when the art is made, over work done every frame. Shading baked into the models costs nothing while playing.
5. The type check and the full test suite pass.

## 3. Where the game stands

Judged from about twenty screenshots of the running game, the rendering and sound code, and a saved picture of the other game.

**Still shared with the other game** (this is what makes the two look alike)

- The village: a round, ring-fenced hub with a red-roofed well, a crystal fountain, a striped market stall, a rocket pad and garden beds.
- The screen layout: a top row of round icons, a round minimap cut into four coloured sectors, a cluster of four skill buttons, quest cards on the left.
- The content skeleton: the four starting skills, the eight planet themes, the King Bear boss, much of the item list, and the camera angle.

**Already ours**

The cottage interior and its family, the Ember Well (wake, soothe or let the Colossus sleep), the Lake Guardian, AI neighbours and rescued helpers, Rescue Call, and (on `develop`, not yet released) Roar hours and Dyes.

**Where the quality falls short**

- The ground is flat colour with soft blends, so the wilds and the planet landing areas look empty. The Night Planet is almost black.
- Lighting is flat: no colour grading, no soft shading where objects meet the ground.
- Characters are rigid parts moved by code. They work, but they are stiff.
- Crops are flat 2D cards with thick outlines beside 3D models, so two art styles share the screen.
- Sound is one music track plus generated tones.
- The camera always looks steeply down, so there is never a horizon.

The planets were photographed only at their landing pads, loaded through a developer shortcut. Their outer areas may be fuller.

## 4. The stages

| # | Stage | Makes us | Speed risk | Size |
|---|---|---|---|---|
| 0 | Speed gate | safe | none | done with this plan |
| 1 | Free lighting upgrade | better | very low | medium |
| 2 | Our own village and screen layout | different | low | medium to large |
| 3 | Sound | better | none for frame rate | medium |
| 4 | Fuller world, one art style | better | high, needs care | large |
| 5 | Livelier characters | better | medium | large |
| 6 | Our own story and content | different | none | large, in parts |
| 7 | Camera angle (optional) | both | high | see section 5 |

### Stage 0. Speed gate

`promo/perf-budget.mjs` and the baseline table above. Every later stage starts by running it and ends by running it.

### Stage 1. Free lighting upgrade

Everything here costs nothing, or next to nothing, per frame.

- A colour curve and a light setup per planet: warm, vivid and saturated, never washed out. Sky, fog and light colours give each planet its own mood.
- Soft shading baked into the models when they are made (darker where parts meet, under roofs, at the feet of trees).
- A sky and horizon gradient in place of one flat background colour.
- Richer ground from the colours it already carries: worn paths, darker grass under trees, lighter clearings. Same triangles.
- A Night Planet you can read: more base light, glowing plants and crystals.

Optional and off by default: a "Fancy effects" switch for strong PCs (glow, a slight toy-diorama depth blur), under gate rule 3.

Done when: before-and-after pictures of the village, the wilds and three planets are clearly better, and the gate passes.

### Stage 2. Our own village and screen layout

- A new hub shape of our own in place of the fenced circle, for example a terraced village built around the Ember Well, with redesigned silhouettes for the well, fountain, stall and launch pad.
- A new screen layout: a different minimap shape, our own arrangement of the icon row and the skill buttons, our own icons.
- New names and looks for the four starting skills.

Speed: the hub must stay inside the village baseline. The screen layout is ordinary page elements and does not affect frame rate.

Risks: many tests pin positions in the village, and players' saves store where they placed decorations and garden beds. Moving the village needs a save migration and must not lose anything a player placed.

### Stage 3. Sound

- Music for each region, background ambience (wind, water, birds, night insects), real sound effects for hits, harvests, menus and footsteps.
- Sound loads only when it is needed and streams, so the download before play does not grow.

Honest limit: generated music and effects will be a clear step up, but truly high-quality music needs a composer or a licensed library.

### Stage 4. Fuller world, one art style

- Denser wilds and planets: landmarks, clusters of plants and rocks, shorelines, height.
- One art style for crops: 3D crops, or cards redrawn to match the models.

Speed: this is the stage most able to slow the game down. More things on screen must come from the methods the game already uses (many copies drawn as one batch, still scenery merged and frozen, less detail far away), never from many separate objects. Each scene gets a budget equal to its baseline.

### Stage 5. Livelier characters

- Keep rigid parts for crowds (creatures, neighbours, other players): they are cheap and can be drawn in batches.
- Make them feel alive with motion alone: squash and stretch, anticipation before a hit, follow-through, changing face expressions. No extra cost.
- A skeleton only for the hero and the bosses, and only if the gate still passes. Skeletons for crowds are ruled out.

### Stage 6. Our own story and content

- A story spine: the world rests on sleeping ember springs, each planet has a spring and a guardian, and the player's choices (wake, soothe, let sleep) change that planet.
- Day and night, seasons and weather that change what grows, what bites and which creatures appear. Mostly light and colour changes, so no speed cost.
- Neighbours and helpers as characters with likes, small quests and memory.
- New names and designs for planets, bosses and items that still follow the other game.

## 5. The camera angle

The question was whether lowering the camera would hurt the frame rate. It would. A lower camera sees much further, so the game has to draw much more.

Measured on 2026-10-11 by tilting the camera at the same distance (one run, same tool):

| Camera pitch | Village draw calls / triangles | Canyon draw calls / triangles | Slow-CPU frame rate, village |
|---|---|---|---|
| 51.5° (today) | 248 / 200,000 | 124 / 73,000 | 60 |
| 40° | 317 / 244,000 | 253 / 226,000 | 59 |
| 30° | 405 / 360,000 | 373 / 354,000 | 54 |
| 22° | 495 / 465,000 | 470 / 462,000 | 46 |
| 30° with a shorter view distance | 369 / 294,000 | 343 / 294,000 | 60 |

- At 30° the village needs about 1.6 times the draw calls and 1.8 times the triangles. The canyon needs about 3 times and 5 times.
- A shorter view distance wins back only part of it.
- The lower view does look better and more like its own game: building fronts and faces become visible, and trees close the horizon.

**Decision for now:** the camera stays where it is through stages 1 to 3. A lower camera is tried only after stage 4 has set up less detail in the distance, and it ships only if the gate passes. Two cheaper options to try first: a mild tilt of about 44 to 45 degrees, and a lower camera only in calm moments (walking up to the cottage, cut-scenes, a photo mode), never in fights.

## 6. Order, and what is not in this plan

Order: 0, 1, 2, 3, then 4, 5 and 6 in parts, with 7 as an experiment after 4.

Not in this plan: a Steam release, real-money purchases, the player market, and the three-lane battle mode.

**Decisions for the owner**

1. Tone: a cozy game about living in a place (recommended), or an action game with a story on the side.
2. The village: is a save migration acceptable so that the hub can change shape?
3. Sound: generated, licensed, or a composer.
4. The camera: keep it, or accept the extra work to afford a mild tilt.
