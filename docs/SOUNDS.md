# Sound effects (FIX-PLAN 5.1, QUALITY-PLAN stage 3)

All effects are synthesized at play time in `src/sfx.ts` (WebAudio: oscillators, two-operator FM bells, filtered noise,
envelopes). No audio files, no samples: nothing is added to the download (the module grows by about 2.4 KB gzipped JS).
The AudioContext is created on the first touch/key (phone unlock) or first sound, never at load.

Mixing: random pitch (+-4 %, +-0.75 % for musical cues) and volume (+-12 %) per play; per-sound limit inside 100 ms
(hit 3, coin 4, default 2, plus 18 ms minimum gap); voice cap 14 (level/quest/hurt/catch/power, the big stingers and the Colossus's roar get +4 headroom);
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
  4 more for priority cues), 10 on a touch device (8 and 2; it was 6 and 2 until WP13 measured a twelve-creature fight on a phone: 5 to 9 sounds refused with 6, 0 to 5 with 8). A new player calls `voices.take(now, end)` and stays silent on
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
features chunk (about 5.9 KB gzip together). Nothing is recorded and nothing is downloaded for the score: every note is an
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
  in the middle of another). Danger lasts 1.5 s and a boss 2 s past its cause, so a creature at the edge of its reach
  cannot make the drums flap. The drums come in within 0.3 s and leave in about 2 s.
- **Borders.** Another place must hold 1.5 s before its tune takes over, so a walk along a border changes nothing. A
  tune that another replaced plays on unheard for 4 s after its fade: if its place (or the boss) comes back in that
  time it is faded up again where it is, not started from its first bar. At most three decks exist.
- **The village rests.** A tune plays once (two 8-bar phrases, 37 s), then 60 to 120 s of the world's own sounds, then
  a variation. The wild regions play on. A tune takes another of its progressions every 8 bars, never the same more
  than twice running, in one of three arrangements, with a new melody each time: it has no loop point.
- **The recorded theme** (444 KB) is fetched 20 s after the first played frame or later, in idle time, never during a
  chase or a boss; a fetch that fails is tried again after 30 s, then 1, 2, 4 ... 16 minutes. The service worker keeps
  it on first use. It is decoded (36.9 s, one channel at 48 kHz: 6.8 MB of memory) only where it is needed: in the
  village, or where there is no live score. It then plays on an arrival in the village, at most once in three minutes;
  otherwise, and after the rests, the live score plays a variation.
- **Theme only.** Below Sharp graphics, on Battery saver, and with "Live music" off there is no full live score: the
  theme plays and rests wherever there is music. Until the theme is there (the first 20 s, Save-Data, offline) the
  live score stands in with a touch device's means (six voices, no pad), so no device is silent. The graphics level is
  the automatic governor's: the director takes it up only at a change of place, in a rest or when the switch is moved,
  never in the middle of a chase or a boss. `THEME_ONLY` in `music-content.ts` is the one flag for everyone.
- **The switch.** Settings has a "Live music" row after the music slider ("Tunes played for each place. Off: the
  recorded theme only."). On is automatic, Off is the theme only; it applies at once and is kept per device
  (`zoo-garden-pref-music`: `''` or `theme`; `live` forces the full score at any graphics level). The row is drawn
  through the `radio.row` slot of `audio-settings.ts`, which the director fills when it mounts; its Vietnamese is in
  `src/features-vi/music.ts`.
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
  live voices together would pass 6, the melody and the figure first. Two voices are always the score's, so the beat
  and the bass stay under the fullest fight.
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
- Below Sharp graphics, or with "Live music" off in Settings, the recorded theme plays instead; a lighter live score
  stands in until it has been fetched. The change comes at the next place or rest, not in the middle of a fight.
- Walking into another region, its tune takes over about 1.5 s after the border and is fully there 1.8 s later.
- The music slider now also moves the world's music; at 0 there is none.
- **Not checked by ear.** Keys, tempos, levels, the crossfades, the drums, the rests and the voice budgets are measured.
  Whether the tunes are pleasant, whether seeded melodies hold up over an hour, and whether a sine marimba sounds cheap
  on phone speakers (the bass notes are below what most of them play) needs a listener: the clips and the listen page are
  for that. **Not verified on a real iPhone**, like the rest of the Web Audio path.

## Creature voices, the wind-up warning and the heartbeat (AAA-PLAN WP12)

Every creature family has a voice (`src/features/creature-voices.ts`, in the lazy features chunk; nothing recorded,
nothing downloaded). A blob squeaks, a bird chirps, a boar grunts, a bear growls; the bigger the creature, the lower it
speaks (pitch = (0.7 / radius)^0.6, kept between 0.4 and 1.6 of the family's pitch).

| Kind | When | What is heard |
|---|---|---|
| notice | a creature saw the explorer (`creatureAlert`) | the family's own rising "?!", in place of the shared alert beep (`main.ts` plays the beep only while no feature listens) |
| windup | an attack is coming (`telegraph`, told by `world.onTelegraph` where world.ts starts a wind-up) | the voice starts with the telegraph, climbs in pitch and level, and peaks as the blow lands |
| hurt | a blow landed on it (`hitLanded`) | a short falling yelp, at most once in 0.25 s per creature |
| death | it fell (`creatureDefeat`) | the voice falls away, under the poof |

- **A boss's wind-up is the warning.** It is louder than the other voices (about -13.5 dBFS, 9 dB over the music's RMS,
  4 dB under a hit), has an octave and breath on top, and is not held back by the pauses below. A wind-up longer than
  1.2 s (the rain, 1.3 s) starts its voice later, so every warning rises for at most 1.2 s and peaks at the blow.
- **An interrupted wind-up falls silent.** A flinch, a stun, a stagger break, a creature that turns to flee, a defeat:
  the voice is faded out within about 0.1 s. While a wind-up sounds its creature is looked at every 0.08 s (a timer
  that exists only then).
- **Placing.** A voice is panned by where its creature is across the screen (at most 0.8 to a side) and faded with its
  distance from the explorer: full inside 6 m, silent from 30 m on. An ordinary creature's wind-up is heard only
  inside 14 m.
- **A crowd cannot squeak a fight away.** Every voice is an ordinary voice of the shared counter (never a priority
  one). On top of that the feature holds itself back: at most 4 creature voices at once (2 on a touch device) and 6
  started in a second (4); no two of a kind within 0.08 s (a notice: 0.3 s; a wind-up: 0.15 s); the same family says
  the same kind again only after 0.4 s (notice), 0.6 s (wind-up), 0.12 s (hurt) or 0.15 s (death). One notice may sound
  over the cap, because it took the place of a cue. `__zooSfx.graph.creatures.stats` counts played, limited, capped.
- **The Colossus roars with its own voice** (`roar` in `stingers.ts`: two rough low voices a few Hz apart that sink, a
  chest note and a rush of air; -11.2 dBFS, 519 ms). It played the explorer's hurt cry before. Like
  that cry it may use a voice kept for priority cues: it stuns.
- **A pet's or a helper's blow lands with a bite** (`petHit` in `stingers.ts`: teeth snap and a short bark), 6.1 dB
  under the explorer's own hit (-15.3 against -9.2 dBFS), in place of hit, hitHeavy and crit. No line of the hit path
  changed for it: `hitLanded` is told just before the hit sound in `main.ts` hit(), the feature notes whose blow it is
  (`blow.helper`), and the stingers' `cue` swaps the sound. `tests/creature-voices.test.ts` holds that order.

### The low-health warning (`src/features/low-health.ts`, `low-health.css`)

Below a quarter of the health bar: a heartbeat, a red edge and a heart on the bar, until the bar is over 30% again
(between the two it stays as it was, so a bar at exactly a quarter does not make it flap). Off when knocked out, inside
the cottage, on Battery saver and in a hidden tab.

- The heartbeat is two soft low thumps every 0.8 s (-24 dBFS, 232 ms, strongest near 86 Hz with a quieter part
  around 200 Hz for small speakers), planned on the audio clock, an ordinary voice: a full fight may drop a beat.
- The red edge is one layer of its own; only its opacity changes (no layout, no repaint of the page). A desktop pulses
  it with the beat. A touch device shows it still, and so do a reduced-motion setting and the comfort preference
  `flashes` = `off` (`zoo-garden-pref-flashes`; the Flashes switch itself comes with WP9).
- The heart on the bar is a class on the bar that is already there (the warning is not colour alone).
- A timer looks at the health five times a second; nothing runs per frame.

### Levels (promo/loudness.mjs, parts 5 and 6; kept in promo/loudness.json)

At full level (a creature beside the explorer, of the table's size), default sliders, dBFS at the speakers. For
comparison: a hit -9.2, the explorer's hurt cry -12, the alert beep -21.8, the music's RMS -22.8.

| Kind | Peak over the families | Band (`VOICE_BANDS`, `WARNING_BAND`) |
|---|---|---|
| notice | -21.8 to -18.8 | -24 to -17 |
| windup (a creature) | -24.8 to -20 | -26 to -17 |
| hurt | -26.7 to -23.4 | -28 to -18 |
| death | -22.4 to -18.2 | -26 to -17 |
| warning (a boss's wind-up) | -14.3 to -13.3 | -16 to -11 |
| heartbeat | -24 | -26 to -22 |

Each cell: peak dBFS / loudness (K-weighted estimate) / ms within 20 dB of the peak / band with the most energy and
spectral centroid in Hz.

| Family | notice | windup (0.8 s) | hurt | death | warning (boss, 1.1 s) |
|---|---|---|---|---|---|
| blob | -21.3 / -30.4 / 58 / mid 923 | -23.1 / -30 / 843 / mid 869 | -25.6 / -34.4 / 70 / mid 1132 | -22.1 / -31.6 / 190 / mid 913 | -13.5 / -22.6 / 1152 / mid 2306 |
| bunny | -21.2 / -31.6 / 143 / mid 1259 | -23.1 / -29.3 / 843 / mid 1133 | -25.6 / -33.3 / 52 / mid 1458 | -22.1 / -30.8 / 154 / mid 1188 | -13.4 / -22.3 / 1148 / mid 2681 |
| mushroom | -21.3 / -32.6 / 62 / mid 1494 | -23.2 / -32.2 / 842 / mid 1245 | -25.8 / -37 / 75 / mid 1678 | -22.2 / -33.9 / 207 / mid 1338 | -13.6 / -24.9 / 1139 / low 1862 |
| frog | -21.3 / -35.6 / 190 / low 727 | -24.8 / -35 / 843 / low 644 | -25.8 / -37.9 / 74 / low 759 | -22.1 / -34.3 / 215 / low 657 | -13.4 / -26.1 / 1121 / low 962 |
| winged | -21.2 / -29.5 / 184 / high 2670 | -23.1 / -27.2 / 843 / high 2278 | -25.6 / -31.4 / 40 / high 2872 | -22.1 / -28.7 / 154 / high 2361 | -13.5 / -21.6 / 1149 / mid 3914 |
| quadruped | -21.8 / -32.6 / 78 / low 730 | -21.3 / -33.8 / 816 / low 649 | -26.7 / -37.4 / 105 / low 1040 | -19.6 / -33 / 243 / low 731 | -14.1 / -26.2 / 1128 / low 1145 |
| bear | -21.3 / -33.8 / 102 / low 994 | -22.1 / -36 / 826 / low 914 | -25.8 / -38.6 / 139 / low 1421 | -20.5 / -34.7 / 357 / low 1014 | -13.4 / -26.8 / 1123 / sub 903 |
| crab | -19.5 / -30 / 139 / mid 2269 | -21.3 / -27.8 / 842 / mid 1995 | -24 / -32 / 31 / mid 2291 | -20.3 / -29.4 / 153 / mid 2077 | -13.7 / -23.3 / 1143 / mid 2017 |
| flower | -20.8 / -33.7 / 70 / low 3017 | -20.4 / -32.7 / 856 / low 2507 | -23.4 / -36.3 / 79 / low 3850 | -20.2 / -34.7 / 212 / low 3105 | -13.6 / -24.2 / 1149 / low 2109 |
| cactus | -21.3 / -34 / 91 / low 2370 | -22 / -32.1 / 848 / low 2128 | -24.6 / -36.3 / 37 / mid 3634 | -22.2 / -34.8 / 189 / low 2795 | -13.5 / -22.9 / 1145 / low 1672 |
| treant | -21.1 / -34 / 119 / sub 986 | -21.6 / -35.9 / 830 / sub 800 | -24.1 / -38.2 / 156 / low 1270 | -20.7 / -35 / 411 / sub 910 | -13.3 / -26.6 / 1135 / sub 897 |
| lollipop | -21.4 / -32.9 / 161 / mid 2898 | -23.4 / -30.6 / 842 / mid 2424 | -26.1 / -34.6 / 59 / mid 3125 | -22.4 / -32.1 / 158 / mid 2612 | -13.5 / -23.6 / 1149 / mid 3179 |
| cake | -21.5 / -32.8 / 91 / low 459 | -23.2 / -32.3 / 842 / low 438 | -25.8 / -37.1 / 110 / low 545 | -22.2 / -34 / 308 / low 462 | -13.3 / -24.4 / 1133 / low 1200 |
| biped | -19.6 / -31.1 / 178 / low 1020 | -21.3 / -28.6 / 841 / low 921 | -23.9 / -33.4 / 64 / low 1071 | -20.4 / -30.3 / 174 / low 961 | -13.5 / -23.5 / 1142 / low 1177 |
| penguin | -20.3 / -32 / 150 / mid 1627 | -21.8 / -31.4 / 839 / mid 1381 | -25 / -34.6 / 61 / mid 1601 | -20.7 / -30.8 / 183 / mid 1436 | -13.5 / -25.4 / 1132 / mid 1910 |
| volcano | -20.6 / -34.5 / 121 / sub 1675 | -21.3 / -36.1 / 841 / sub 1367 | -23.6 / -38.3 / 130 / sub 1932 | -20.1 / -35.2 / 347 / sub 1513 | -13.4 / -27.8 / 1139 / sub 1395 |
| turtle | -19.5 / -32.3 / 116 / low 976 | -23.4 / -35.7 / 844 / low 960 | -23.7 / -37.1 / 136 / low 1455 | -19.9 / -33.2 / 369 / low 1006 | -13.5 / -26.3 / 1119 / low 987 |
| worm | -20.1 / -32.9 / 96 / low 3135 | -20 / -32.4 / 857 / low 2609 | -23.6 / -35.9 / 110 / low 3949 | -19.7 / -35 / 317 / low 3195 | -13.6 / -26.4 / 1146 / low 2111 |
| dragon | -20.8 / -34.2 / 135 / low 1598 | -21.1 / -35.5 / 837 / low 1423 | -23.4 / -37.1 / 141 / low 2096 | -18.2 / -33.7 / 405 / low 1560 | -14.3 / -27.2 / 1128 / low 1205 |
| jackbox | -21.5 / -34.8 / 178 / mid 1453 | -23.2 / -32.2 / 842 / mid 1218 | -25.9 / -37 / 64 / mid 1625 | -22.2 / -33.9 / 174 / mid 1294 | -13.5 / -25 / 1136 / low 1824 |
| robot | -19.5 / -31.4 / 213 / low 1261 | -21.4 / -28.7 / 841 / low 1107 | -23.9 / -33.1 / 45 / low 1277 | -20.4 / -30.3 / 152 / low 1168 | -13.7 / -23 / 1136 / low 1134 |
| eye | -21.2 / -31 / 87 / mid 654 | -23.1 / -30.4 / 842 / mid 613 | -25.6 / -35.3 / 106 / mid 795 | -22.1 / -32.1 / 291 / mid 650 | -13.5 / -23.8 / 1140 / low 1960 |
| titan | -18.8 / -33.6 / 148 / sub 1511 | -20.4 / -35.5 / 834 / sub 1157 | -23.6 / -37.7 / 193 / sub 1534 | -19.7 / -34.7 / 553 / sub 1288 | -13.4 / -27.9 / 1137 / sub 1220 |

The warning on the clock, per boss pattern (seconds before the blow lands; the voice rendered alone):

| Pattern | Wind-up, s | Voice starts | First over the music's RMS | Loudest (s from the blow) | Peak, dBFS |
|---|---|---|---|---|---|
| slam | 1.1 | 1.09 | 1.06 | 0 | -12.5 |
| quake | 1.2 | 1.19 | 1.16 | -0.01 | -13.1 |
| charge | 1 | 0.99 | 0.96 | 0.01 | -12.4 |
| barrage | 0.9 | 0.89 | 0.86 | -0.04 | -13.1 |
| rain | 1.3 | 1.19 | 1.16 | -0.01 | -13.1 |
| spin | 0.7 | 0.69 | 0.66 | -0.01 | -13.5 |
| eclipse | 1.2 | 1.19 | 1.16 | -0.01 | -13.1 |
| plain blow | 0.6 | 0.59 | 0.56 | -0.06 | -13.7 |
| enraged spin | 0.56 | 0.55 | 0.52 | -0.02 | -13.3 |
| enraged rain | 1.04 | 1.03 | 1 | -0.03 | -13.2 |

A crowded fight with a creature voice every 90 ms and a boss winding up, over the theme, both sliders at the top: peak
-3.2 dBFS, no clipping.

`tests/creature-voices.test.ts` and `tests/low-health.test.ts` compare every voice's signature with the one measured:
**after changing a voice, the heartbeat, the roar or the pet hit, run `promo/loudness.mjs --check --write`.**

### In the game: promo/voice-probe.mjs

```
PORT=<dev server port> node promo/voice-probe.mjs
```

Plays the real game in Chromium on a desktop and under phone emulation: a fight with twelve creatures and live music
(voices a second, the most at once, what the shared counter refused), King Bear's telegraphs with their voices and how
long each wind-up really lasted, the low-health warning as the bar falls and rises (with screenshots in
`.scratch/voice-probe/`), the number of AudioContexts and every request made meanwhile. Measured for WP12: about 2
creature voices a second and at most 3 at once in that fight, the shared counter refused 0 sounds on the desktop and
0 to 1 on the phone profile (staging before: 0 to 3); every King Bear telegraph (0.6 s plain blow, 1.0 s charge, 1.1 s
slam, 1.2 s quake) had its voice, and a wind-up cut short by a stun was silent 0.2 s later; the warning came on below
25% and went above 30%, switched once with the bar trembling at a quarter, 6 beats in 5 s; one AudioContext; no
request for sound.

### What a player may notice (WP12)

- Creatures sound alive: each kind has its own small voice when it notices you, when it is hit and when it falls.
  The shared alert beep is gone from fights (it still plays for a strained fishing line and before the features load).
- A boss's attack is heard coming: a rising growl that tops out as the blow lands. Ordinary creatures wind up quietly.
- Pets and helpers hit with a soft bite, not with your weapon's sound; the Colossus has a roar.
- With little health left a heartbeat, a red edge and a heart on the bar warn until you are over 30% again.
- **Not checked by ear.** Levels, lengths, pitch by size, the lead of the warning, the caps and the absence of clipping
  are measured. Whether the voices are charming or grating, whether 23 families are told apart by more than pitch, and
  whether the heartbeat is audible on a phone speaker (most of it is below 200 Hz) needs a listener. **Not verified on
  a real iPhone**, like the rest of the Web Audio path.
- **Known limits.** A guest in an online room hears no wind-up voice (the host runs the creatures; the telegraph on the
  ground is still drawn). A boss's warning is an ordinary voice: in a fight that fills a phone's eight voices it can
  be dropped (not seen in the probe). The Colossus's own attacks have no wind-up voice (they do not go through
  `world.onTelegraph`). On Battery saver there is no low-health warning at all, as the plan asks. The plan's check
  names a wind-up that starts 0.4 to 0.8 s before the blow; the voice here starts with the telegraph (0.55 to 1.2 s
  before), as the plan's scope asks (a rise of 0.4 to 1.2 s). Creature wind-ups shorter than 0.4 s (wasp 0.3, wolf
  0.35) get a voice as long as their telegraph.
