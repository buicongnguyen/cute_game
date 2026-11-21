# Sound effects (FIX-PLAN 5.1, QUALITY-PLAN stage 3)

All effects are synthesized at play time in `src/sfx.ts` (WebAudio: oscillators, two-operator FM bells, filtered noise,
envelopes). No audio files, no samples: nothing is added to the download (the module grows by about 2.4 KB gzipped JS).
The AudioContext is created on the first touch/key (phone unlock) or first sound, never at load.

Mixing: random pitch (+-4 %, +-0.75 % for musical cues) and volume (+-12 %) per play; per-sound limit inside 100 ms
(hit 3, coin 4, default 2, plus 18 ms minimum gap); voice cap 14 (level/quest/hurt/catch/power and every stinger get +4 headroom);
a compressor on the mix. Effects volume and mute come from Settings (`sfxVolume`, `sound`); music is separate.

## The sound core: one AudioContext, four buses (AAA-PLAN WP7)

The whole game has one AudioContext. `src/sfx.ts` owns it: `audioGraph()` gives `{ ctx, bus(name), duck(name, dB, seconds), voices }`.
Never call `new AudioContext()` anywhere else.

```
effects (Sfx.play) ──► sfx ──► duck ─┐
click / open / close ─► ui ──► duck ─┤
(WP11 ambience) ─► ambience ─► duck ─┼─► compressor ─► speakers
radio theme, WP13 score ──► music ► duck ┘
```

- **Levels.** `sfx`, `ui` and `ambience` follow the effects slider (0.55 at the default 0.8, the old loudness); `music` follows
  the music slider (its gain is the slider value, so 0 is silence). Buses add no saved setting: the two volumes stay in
  `state.settings` (`audio-settings.ts` `parseAudio`). `bus(name)` applies the level each time it is called (a moved slider glides to its
  level in about 50 ms, never a step); `graph.sfx` and `graph.music` hold the two sliders.
- **The radio** (`src/features/radio.ts`) plays the theme `<audio>` element through a `MediaElementAudioSourceNode` into the
  music bus. An iPhone ignores `element.volume`, so the slider is the bus gain. A trim of 0.55 on the radio cancels the
  compressor's make-up gain (5.2 dB, measured), so the radio is as loud as before. Without WebAudio the element's own volume
  carries the slider. The player is in the lazy features chunk; `house-life.ts` reaches it through the `radio` slot in
  `audio-settings.ts`. A radio switched on before that chunk has come says "The radio is warming up…", asks for the
  features once more and starts by itself when they mount.
- **Play options.** `sfx.play(sound, { detune, pan })`: `detune` in cents shifts every pitch of the sound, `pan` from -1 to 1
  (the panner arrives with the features; before that sounds play in the middle).
- **Duck.** `duck('music', 6, 1)` lowers a bus 6 dB for 1 s (down within 0.1 s, back in about 0.3 s, glides only). Ducks do not stack: while one
  holds, another only makes it last longer, at the first one's depth. It arrives with the features
  (`src/features/sound-mix.ts`), after the first played frame; before that a call does nothing.
- **Voices.** `voices` counts live synthesized voices for everything that plays: 18 on a desktop (14 for ordinary sounds,
  4 more for priority cues), 8 on a touch device (6 and 2). A new player calls `voices.take(now, end)` and stays silent on
  false; only a priority cue passes `true` as the third argument, and the radio's stand-in tune never does. Click, open and
  close take no voice, so a fight cannot starve a tap. `audioGraph().stats.capped` counts the refusals: a scripted fight with
  3 creatures under touch emulation gave 0 (37 sounds, at most 5 at once).
- **Rest.** While both sliders are at 0 or the tab is hidden the context is suspended, and effects are skipped; the next
  input (or coming back to the tab) resumes it (`sound-mix.ts`, after the first played frame).
- **Features use `services.audio`,** not an import of `sfx.ts`: a run-time import of `sfx.ts` from a feature makes the build
  split that module into one more file fetched at start. Type imports are free.
- **Ranges.** A media element asks for its file with `Range: bytes=0-`; the host answers 206, which a cache cannot store.
  For a pinned file the worker fetches the whole file once without the header, keeps it, and cuts every asked range out of
  it as a 206 (`sw-logic.mjs` `byteRange`), online and offline.
- **Offline.** Files under `assets/audio/` are on demand (`server/sw-logic.mjs` `onDemand`): the service worker's install
  does not download them, and neither does its background fill (`backgroundFill`: models only). It keeps the theme the
  first time the radio plays, and an update carries it over. Offline without it, the radio plays its stand-in tune.

Tests: `tests/sound-bus.test.ts` (a recording fake AudioContext, `tests/support/fake-audio.ts`), `tests/offline.test.mjs`.

### What a player may notice (WP7)

- **iPhone, ringer switch off: the radio is expected to be silent now.** Sound that goes through Web Audio follows the
  ringer switch, like the effects always did; before, the radio was a plain `<audio>` element and played anyway (at full
  volume, because an iPhone ignores its volume). **Not verified:** this needs a real iPhone, with the ringer switch in both
  positions. The same check confirms that a `MediaElementAudioSourceNode` gives sound on iOS at all, and that the music
  slider now changes the radio's loudness there. No tool here has Web Audio in WebKit.
- **Music shares the effects' compressor.** A loud effect can pull the radio down for a moment. The radio's own level is
  unchanged (a 0.55 trim, measured -0.14 dB against before). WP8 tunes the mix.
- **Coming back to the tab on an iPhone may need one tap** before the radio is heard again: the browser lets the audio
  context resume only inside a gesture. Desktop browsers resume at once.
- **Offline, a radio that never played online** plays its stand-in tune: the theme (444 KB) is downloaded when the radio
  first plays, not in the background.

## The mix and the stingers (AAA-PLAN WP8)

### How loud each kind of sound is

`LOUDNESS` in `src/sfx.ts` is the mix as a table: where each kind of sound peaks at the speakers, with both sliders at
their defaults.

| Kind | Band (peak, dBFS) | Sounds | Measured |
|---|---|---|---|
| impact | -12 to -6 | hit, hitHeavy, crit, thud, break, boom, power | -11.1 (thud) to -6.3 (hitHeavy, crit); power -7.0 |
| whoosh | 6 to 10 dB under its hit, never under -26 | swing, punch, cast | swing -19.0 (8.7 under a blade hit), punch -17.3 (9.0 under a fist hit), cast -21.6 |
| ui | -26 to -21 | click, open, close | -21.9, -24.0, -25.3 |
| cue | -24 to -10 | alert, ready, powerReady, bite, hurt, catch, flag, success, quest, level and the nine stingers | alert -21.8, ready -20.1, powerReady -14.4, level -17.0, stingers -20.0 (deny) to -11.8 (victory) |

What WP8 changed in the old sounds: punch +13.5 dB (-30.8 to -17.3), cast +14.8 dB (-36.4 to -21.6), the creature alert
+8.2 dB (-30.0 to -21.8), the blade swing +4.7 dB (-23.7 to -19.0). Impacts and taps are as loud as they were.

The ready chime is two sounds now. `ready` plays whenever a skill button comes off its cooldown (every few seconds in a
fight), on UNTOUCHED and on a perfect dodge: +5.4 dB (-25.5 to -20.1). `powerReady` is the same chime for the one moment
the power strike is charged (POWER READY!, `main.ts`): +11.1 dB (-25.5 to -14.4), 8.4 dB over the music's RMS where
`ready` is 2.7 dB over it. Its recipe is in `stingers.ts`; it is a cue, not a tune (no duck, an ordinary voice).

**The numbers are not the plan's, and why.** The plan asked for impacts at -14 to -18 and taps at -26 to -30, from a
measurement that played each sound as the first sound of a new audio context. Chromium's compressor fades in over its
first 50 ms or so, so that reading is 5 to 12 dB too low for a short sound (a hit read -21.8 and is -9.2; a click read
-35.1 and is -21.9) and right for a long one (the level fanfare reads -17.0 both ways). In play the context has long
been running. `promo/loudness.mjs` therefore plays each sound half a second into the render, and prints the old reading
as its `cold` column. WP8 kept the plan's order and its raises (punch and cast about 15 dB, POWER READY about 12 dB) and
left the impacts where players know them, so the bands are written in the settled numbers. Bringing impacts down to a
true -14 to -18 would make every blow 5 to 9 dB quieter than before: that is a decision about the whole game's
loudness, not a fix, and it was not taken here.

**A click that was in every sound.** A new gain node is 1 until its envelope's first step, and a source that starts a
fraction of a sample before that step sent one sample through at full level: a click of up to -8 dBFS on some plays of
the quiet, noisy sounds (measured on the quest chime's shimmer: -3.2 to -20.1 over nine plays, -19.5 to -21.3 after).
Each envelope now holds its gain at 0 until its source starts (`tone`, `hiss`, `bell` in `sfx.ts`).

### Measuring: promo/loudness.mjs

```
PORT=<dev server port> node promo/loudness.mjs            # the tables
PORT=<dev server port> node promo/loudness.mjs --check    # exit 1 when a sound is outside its band, or a crowded fight clips
PORT=<dev server port> node promo/loudness.mjs --write    # also keep the result in promo/loudness.json
```

It renders every sound through the game's own graph (bus, duck, compressor) in an OfflineAudioContext in Chromium:
per sound the median peak of 9 seeded plays with the lowest and highest, RMS, a K-weighted loudness estimate, the
length within 20 dB of the peak, the strongest frequency and the band with the most energy; each whoosh with the hit it
leads to; every cue against the theme on the music bus (music -22.8 dBFS RMS at the default slider: punch peaks 5.5 dB
over it, cast 1.2, POWER READY 8.3, a hit 13.6, the win 11.0); the depth of the duck under each stinger (-6.0 dB, back
to 0.0 dB 0.6 s after); and a crowded fight over the theme with both sliders at the top (peak -3.1 dBFS, no clipping).

`promo/loudness.json` keeps each sound's level with a signature of its recipe (`promo/sound-signature.mjs`: sources,
volumes, pitches, and a hash of every wave and filter type, every value and every step with its time). `tests/sound-mix.test.ts` compares: **after changing a volume or a pitch in a recipe,
run the tool with `--check --write`**, or that test fails. Nobody can listen on a build machine; this is the check.

### The stingers

Nine short musical cues, each its own recipe (`src/features/stingers.ts`, in the lazy features chunk; the start
download holds only their names). Each lowers the music bus 6 dB for its length (`duck`, once it is sure to play) and
takes one voice; the same stinger twice within 0.1 s is one stinger.

- **Priority.** Only victory, rewardLarge, discover, go and the flag (and the level fanfare) may use the voices kept for
  priority cues, so they sound over a full fight, also on a phone. rewardSmall, rewardMedium, equip and deny are
  ordinary voices: in a full fight they are dropped like any sound, and a hurt cry keeps its reserved voice.
- **One tune at a time with the fanfare.** A boss kill, a Lake Guardian catch or a vault pet that is also a level-up
  asks for the fanfare and a stinger in the same moment. A stinger asked for while the fanfare plays waits for its end
  (1.1 s) and then plays; a fanfare asked for while a priority stinger plays waits for that one. Nothing is dropped, and
  a waiting cue holds no voice.

| Stinger | Length | Peak | How it is made | Where it plays |
|---|---|---|---|---|
| levelUp | 1.1 s | -17.0 | the level fanfare (`level` in `sfx.ts`): C-E-G arpeggio into a held chord | a level-up, and nothing else |
| rewardSmall | 0.45 s | -18.1 | two bright bells up a fourth over a soft note | a star shard in the dust, more storage, a tower upgrade (rescue), our side takes a flag, a drawn match, a nap in the bed |
| rewardMedium | 0.7 s | -16.3 | a three-bell D major run over a warm low note, a shimmer | a rare drop, a gift, a forge or upgrade that worked (menu and bench), a skill level, a captured flag, a ladder step (rescue) |
| rewardLarge | 1.1 s | -13.7 | a four-note A major run into a held chord, a drum, a high bell | a pet joins (vault), a new jump is learned |
| discover | 1.0 s | -16.1 | a rising hum under an open bell run that ends on a raised fourth | a new planet, the starship has landed, arriving on Flag Rush Isle |
| victory | 1.4 s | -11.8 | a drum, a three-note horn call, a second drum under a held F major chord | a boss falls, the Colossus crumbles, the Lake Guardian is caught, a friend is freed, a Flag Rush match is won |
| equip | 0.4 s | -18.0 | a cloth pull, a buckle, a two-bell fifth | new gear is on |
| deny | 0.32 s | -20.0 | two low notes stepping down | made for refusals; no site plays it yet |
| go | 0.6 s | -16.0 | two short horn notes and a higher one with a rush of air | a Flag Rush match starts, a rescue mission and each of its waves start, the vault party sets out, the vault guardian and the Colossus wake |

- **The level fanfare** now plays in one place: `levelCheck` in `main.ts`. The 30 other places that used it play the
  stinger named above: each calls `tone('<stinger>')` where it called `tone('level')`. `tests/sound-mix.test.ts` keeps
  the fanfare in `levelCheck` and nowhere else.
- **The arrival flag's horn call** (`flag`) moved to `stingers.ts` with them: same recipe and level (-14.3), and it
  now lowers the music too. That paid for the hook in the start download (the start is 8 bytes smaller than before WP8).
- **Before the features are mounted** (the first played frame) or if their chunk never arrives, a stinger, the flag and
  `powerReady` play the `success` chime, `levelUp` plays the fanfare, and nothing is lowered or made to wait. No stinger
  depends on an event listener: every site calls `tone` itself.
- **Uniforms.** The Navy sailor's Lighthouse beam plays `zap` and the Ao dai gentleman's Dragon dance `boom` (both
  borrowed the fanfare). The starship's lift-off plays `boom` with the whoosh.
- A feature plays one with `services.tone('victory')`. `sfx.play` asks `graph.cue` first for every sound; a new
  sound whose recipe can wait until after Start goes into `STINGER` in `stingers.ts`, not into `sfx.ts`.

### What a player may notice (WP8)

- Fights sound fuller: every swing and punch is heard before its hit, and POWER READY is a clear chime, well over the
  small chime of a skill coming back.
- A kill that is also a level-up plays the fanfare and then the win, one after the other.
- The fanfare is rarer: only a level-up plays it. Rewards, wins, discoveries and new gear each have their own short tune.
- The radio and the score dip for about a second under those tunes and under the arrival flag.
- **Not checked by ear.** Levels, lengths, pitch bands, the duck and the absence of clipping are measured; whether the
  new tunes are pleasant, and whether punch and cast are now too present, needs a listener.

| Event | Sound | How it is made |
|---|---|---|
| Blade swing / fist swing / gun shot | swing / punch / shoot | band-passed noise sweep up (blade high and long, fist low and short); gun: square+sine "pew" falling, noise crack, sine thump |
| Hit, light (per weapon) | hit | the last attack sound (1.2 s) picks it: blade = metallic FM ring (ratio 2.76) + high-passed slice + thud; fist = sine smack 160->52 Hz + low-passed noise + body bump; gun = square tick + gritty noise + short pop |
| Hit, heavy (knock-back or launch) | hitHeavy | the weapon hit plus a sub-bass drop 95->34 Hz and a low noise burst |
| Critical hit | crit | heavy hit + glassy FM bell, rising sine sweep, airy sparkle |
| Enemy defeat | poof | long low-passed air puff, falling "boop", two-note twinkle |
| Player hurt | hurt | squeaky "oof" (two falling sines at formant-ish pitches) on a thump |
| Harvest | harvest | rising bubble pop, leafy high-passed rustle, two-note wooden pluck |
| Plant / new bed | plant | two low-passed dirt pats and a soft rising sine |
| Energy gain | coin | two glassy FM coin bells (B6, E7) |
| Buy / sell | buy / sell | buy: two till ticks + coin chord; sell: four tumbling coin bells + shimmer |
| Level-up | level | square+triangle C-E-G arpeggio into a held C major chord, bell and sparkle; nothing else plays it (WP8) |
| Quest / reward collect | quest | G major bell arpeggio, shimmer sweep, warm triangle bass |
| Fish bite / catch | bite / catch | bite: double water plop; catch: big low-passed splash, random droplet chirps, two-note ta-da |
| UI tap / open / close | click / open / close | soft wooden FM tap; open = two-note pluck up with a whoosh; close = down |
| Power strike | power | rising charge whoosh, sub boom, sawtooth crack, high crackle, bell tail |
| Jump / land | jump (flip) / land | springy sine hop with an airy puff; land = low thud + dust |
| Swim stroke / water entry | stroke / dive | stroke: slow band-passed swish every 0.85 s while swimming and moving; dive: splash + droplets |

Other voices (alert, cast, reel, snap, ready, boom, zap, shock, freeze, magic, success, pop, splash) keep their roles,
several with richer layers. Tests: `tests/sound.test.ts`, `tests/sound-mix.test.ts`. Browser probe: `__zooSfx.stats` counts started /
limited / capped / muted effects, `__zooSfx.graph.stats.capped` the voices the shared counter refused, and an AnalyserNode
connected to `__zooSfx.graph.nodes.sfx.duck` meters a bus.

## The music (AAA-PLAN WP13)

Music plays in the world: a director (`src/features/music-director.ts`) chooses what plays, and a live score
(`src/features/music-score.ts`) plays it from the tunes in `src/features/music-content.ts`. All three are in the lazy
features chunk (5.1 KB gzip together). Nothing is recorded and nothing is downloaded for the score: every note is an
oscillator, as in `promo/music.py`, which made the theme (marimba: a sine with a fourth partial that dies in a tenth of
a second; bass: a sine; pad: a sine with an octave, slow in and out; the theme's three echoes). The melodies are not
written down anywhere: each tune is a key, a mode, a tempo and four 8-bar chord progressions, and the melody over them
is drawn from the tune's seed, two bars at a time, on a five-note scale.

| State | When | What plays |
|---|---|---|
| village | Clover Village | C major, 104: the theme's key and tempo. It rests (below). |
| forest, meadow, swamp, canyon | the wild regions of the home planet | F lydian 92, G major 96, D dorian 84, E mixolydian 108 |
| candy, ice, lava, toy, jungle, ocean, cloud, shadow | each planet | A major 120, Bb lydian 76, C phrygian 112, D major 126, G dorian 116, Eb major 80, A lydian 72, F# minor 88 |
| danger | a creature that is after someone (not asleep, idle or walking home) within 12 m | the tune of the place goes on and the drums join: kick, tom and shaker |
| boss | from the boss bar (`bossEngaged`) until the boss falls or is left behind | D minor 138, with its own beat |
| space | flying between planets | C lydian 66 |
| ctf, rescue, vault | in a mode | E mixolydian 132, A minor 124, C# phrygian 100 |
| indoors | inside the cottage | nothing: the radio is the music there |

There is no title state: the director is made when the features mount, after the first played frame.

- **Crossfades** are equal-power over 1.8 s (the squares of the gains add up to 1 all the way, also when a change comes
  in the middle of another). Danger and boss last 1.5 s past their cause, so a creature at the edge of its reach cannot
  make the drums flap. The drums come in within 0.3 s and leave in about 2 s.
- **The village rests.** A tune plays once (two 8-bar phrases, 37 s), then 60 to 120 s of the world's own sounds, then
  a variation. The wild regions play on. A tune takes another of its progressions every 8 bars, never the same more
  than twice running, in one of three arrangements, with a new melody each time: it has no loop point.
- **The recorded theme** (444 KB) is fetched 20 s after the first played frame or later, in idle time, and decoded
  once (36.9 s, one channel at 48 kHz: 6.8 MB of memory). The service worker keeps it on first use. From then on it plays once on
  each arrival in the village; the live score plays the variations after the rests.
- **Theme only.** Below Sharp graphics and on Battery saver there is no live score: the theme plays and rests wherever
  there is music (and nothing plays until it has come). `THEME_ONLY` in `music-content.ts` is the one flag that makes
  this so everywhere; on one device the preference `zoo-garden-pref-music` does it (`theme`), or forces the live score
  at any graphics level (`live`).
- **The radio wins.** Indoors the director is silent, and while the radio plays it stays silent; a radio that starts
  cuts what is still fading out in 0.12 s. The radio and the director share the music bus and the music slider (its
  label is now "Music in the world and the cottage radio"), and both go through the same 0.55 trim.
- **Off.** With the music slider at 0 the bus is at 0, nothing is planned and nothing is kept; with both sliders at 0 or
  in a hidden tab the context sleeps (`sound-mix.ts`) and the director waits. It reads only the audio clock: a stopped
  or faked page clock cannot stall it or make it spin, and after a stall it starts afresh from now (no burst of late
  notes).
- **Ducking** is not the director's: everything it plays is behind the music bus, which a stinger lowers 6 dB.
- **Voices.** The score counts its own voices: 14 on a desktop, 6 on a touch device, where it also leaves out the pad and
  the marimba's upper partial. It never takes a voice from the effects' counter, so music cannot make an effect or a
  priority cue fail. On a touch device it also makes room: a note is left out when the score's voices and the effects'
  live voices together would pass 6, the melody and the figure first, the beat and the bass last. In a fight on a phone
  the music thins out; it does not stop.
- **Cost.** A timer looks at the game ten times a second (where the hero is, whether a creature chases, the radio);
  frames stop in space, so it is not a frame listener. Notes are planned once per eighth note (2.2 to 4.6 times a
  second), at most 0.2 s ahead on the audio clock. Measured in Chromium: 10 to 27 audio nodes a second for the music on
  a desktop, 6 to 14 on a touch device; no draw call, no DOM node, no layout.

### Levels: promo/music-clips.mjs

```
PORT=<dev server port> node promo/music-clips.mjs            # the tables, and the clips with a listen page in .scratch/owner/music/
PORT=<dev server port> node promo/music-clips.mjs --check    # exit 1 when a tune is more than 2 LU from the theme, or a fight over the music clips
PORT=<dev server port> node promo/music-clips.mjs --write    # also keep the levels in promo/music-levels.json
```

It plays the director through the game's own graph in an OfflineAudioContext in Chromium. 30 s of each tune on the
music bus at the default sliders (the theme the same way: peak -9.7 dBFS, RMS -23.3, loudness -24.1):

| Tune | Peak, dBFS | RMS | Loudness | To the theme, LU | Notes a second | Most notes at once as written (desktop / touch) |
|---|---|---|---|---|---|---|
| village | -8.7 | -24.0 | -24.9 | -0.8 | 6.8 | 13 / 6 |
| forest | -11.2 | -24.7 | -25.6 | -1.5 | 5.3 | 13 / 6 |
| meadow | -10.3 | -24.6 | -25.3 | -1.2 | 5.3 | 11 / 5 |
| swamp | -8.7 | -24.3 | -25.1 | -1.0 | 3.5 | 11 / 5 |
| canyon | -9.9 | -24.5 | -25.3 | -1.2 | 7.0 | 13 / 6 |
| candy | -9.8 | -23.9 | -25.1 | -1.0 | 7.8 | 12 / 6 |
| ice | -8.5 | -24.7 | -25.8 | -1.7 | 2.8 | 11 / 5 |
| lava | -10.1 | -24.2 | -25.1 | -1.0 | 9.0 | 12 / 6 |
| toy | -10.3 | -24.3 | -25.1 | -1.0 | 8.1 | 13 / 6 |
| jungle | -11.1 | -24.7 | -25.4 | -1.3 | 8.6 | 13 / 6 |
| ocean | -8.7 | -24.3 | -25.1 | -1.0 | 4.3 | 11 / 5 |
| cloud | -7.8 | -24.7 | -25.8 | -1.7 | 2.6 | 11 / 5 |
| shadow | -9.4 | -24.4 | -25.1 | -1.0 | 3.7 | 11 / 5 |
| boss | -7.1 | -24.0 | -24.9 | -0.8 | 18.4 | 14 / 8 |
| space | -8.0 | -24.8 | -25.8 | -1.7 | 2.2 | 10 / 4 |
| ctf | -8.7 | -24.2 | -25.1 | -1.0 | 11.7 | 14 / 7 |
| rescue | -8.8 | -23.7 | -25.0 | -0.9 | 12.5 | 14 / 7 |
| vault | -8.4 | -24.5 | -25.3 | -1.2 | 4.1 | 11 / 5 |

- Every tune is 0.8 to 1.7 LU under the theme (the plan asks for within 2). The sparse tunes have a higher `gain` in
  `music-content.ts` to get there, so their single notes peak higher.
- The last column is what the score writes; the player then keeps to its voices (14 and 6). On a touch device the boss,
  ctf and rescue tunes write 7 or 8 notes at some moments, and the figure's or the melody's note is left out there.
- The chase drums add 2.2 to 2.5 dB of peak and 0.3 LU, and 5 to 7 dB above 6 kHz, where only the shaker plays
  (forest: -65.1 to -58.3 dBFS). The touch version is 0.9 to 1.1 LU quieter (no pad).
- Under the effects: over the loudest tune's RMS (-23.7 dBFS) a hit peaks 14.5 dB, a heavy hit 17.4, a punch 6.4, the
  win 11.9, a small reward 5.6, POWER READY 9.3, the creature alert 1.9, a tap 1.8: the same distances as over the
  theme. A stinger's duck takes the score down 6.0 dB and it is back 0.6 s after. A crowded fight over the boss tune
  peaks at -2.3 dBFS at the default sliders and -1.5 with both at the top: no clipping.
- `promo/music-levels.json` keeps each tune's level with a signature of the tune (its entry, the score's levels and its
  first 16 bars of notes). `tests/music-score.test.ts` compares: **after changing a tune, a level or the score, run the
  tool with `--check --write`**, or that test fails.

Tests: `tests/music-director.test.ts`, `tests/music-score.test.ts` (the recording fake AudioContext).

### What a player may notice (WP13)

- Music in the village within a second of Start, and another tune in every region, on every planet, in space and in
  the modes. In the village it comes and goes: about half a minute of music, then a minute or two without.
- Drums when something gives chase, a faster minor tune with a beat at a boss, the place's own tune again afterwards.
- On a phone in a busy fight the music gets thinner, so the blows keep their voices.
- When the graphics level drops below Sharp there is only the recorded theme, and none until it has been fetched
  (20 s or so into a first visit).
- The music slider now also moves the world's music; at 0 there is none.
- **Not checked by ear.** Keys, tempos, levels, the crossfades, the drums, the rests and the voice budgets are measured.
  Whether the tunes are pleasant, whether seeded melodies hold up over an hour, and whether a sine marimba sounds cheap
  on phone speakers (the bass notes are below what most of them play) needs a listener: the clips and the listen page are
  for that. **Not verified on a real iPhone**, like the rest of the Web Audio path.
