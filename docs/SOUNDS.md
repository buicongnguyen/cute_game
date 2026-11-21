# Sound effects (FIX-PLAN 5.1, QUALITY-PLAN stage 3)

All effects are synthesized at play time in `src/sfx.ts` (WebAudio: oscillators, two-operator FM bells, filtered noise,
envelopes). No audio files, no samples: nothing is added to the download (the module grows by about 2.4 KB gzipped JS).
The AudioContext is created on the first touch/key (phone unlock) or first sound, never at load.

Mixing: random pitch (+-4 %, +-0.75 % for musical cues) and volume (+-12 %) per play; per-sound limit inside 100 ms
(hit 3, coin 4, default 2, plus 18 ms minimum gap); voice cap 14 (level/quest/hurt/catch/power get +4 headroom);
a compressor on the mix. Effects volume and mute come from Settings (`sfxVolume`, `sound`); music is separate.

## The sound core: one AudioContext, four buses (AAA-PLAN WP7)

The whole game has one AudioContext. `src/sfx.ts` owns it: `audioGraph()` gives `{ ctx, bus(name), duck(name, dB, seconds), voices }`.
Never call `new AudioContext()` anywhere else.

```
effects (Sfx.play) ──► sfx ──► duck ─┐
click / open / close ─► ui ──► duck ─┤
(WP11 ambience) ─► ambience ─► duck ─┼─► compressor ─► speakers
radio theme, (WP13 score) ► music ► duck ┘
```

- **Levels.** `sfx`, `ui` and `ambience` follow the effects slider (0.55 at the default 0.8, the old loudness); `music` follows
  the music slider (its gain is the slider value, so 0 is silence). Buses add no saved setting: the two volumes stay in
  `state.settings` (`audio-settings.ts` `parseAudio`). `bus(name)` applies the level each time it is called; `graph.sfx` and
  `graph.music` hold the two sliders.
- **The radio** (`src/features/radio.ts`) plays the theme `<audio>` element through a `MediaElementAudioSourceNode` into the
  music bus. An iPhone ignores `element.volume`, so the slider is the bus gain. A trim of 0.55 on the radio cancels the
  compressor's make-up gain (5.2 dB, measured), so the radio is as loud as before. Without WebAudio the element's own volume
  carries the slider. The player is in the lazy features chunk; `house-life.ts` reaches it through the `radio` slot in
  `audio-settings.ts`.
- **Play options.** `sfx.play(sound, { detune, pan })`: `detune` in cents shifts every pitch of the sound, `pan` from -1 to 1.
- **Duck.** `duck('music', 6, 1)` lowers a bus 6 dB for 1 s (down in 80 ms, back in 0.3 s). Ducks do not stack: while one
  holds, another only makes it last longer, at the first one's depth. It arrives with the features
  (`src/features/sound-mix.ts`), after the first played frame; before that a call does nothing.
- **Voices.** `voices` counts live synthesized voices for everything that plays: 18 on a desktop (14 for ordinary sounds,
  4 more for priority cues), 6 on a touch device (5 and 1). A new player calls `voices.take(now, end)` and stays silent on false.
- **Rest.** While both sliders are at 0 or the tab is hidden the context is suspended, and effects are skipped; the next
  input (or coming back to the tab) resumes it (`sound-mix.ts`, after the first played frame).
- **Features use `services.audio`,** not an import of `sfx.ts`: a run-time import of `sfx.ts` from a feature makes the build
  split that module into one more file fetched at start. Type imports are free.
- **Offline.** Files under `assets/audio/` are on demand (`server/sw-logic.mjs` `onDemand`): the service worker's install
  does not download them, and neither does its background fill (`backgroundFill`: models only). It keeps the theme the
  first time the radio plays, and an update carries it over. Offline without it, the radio plays its stand-in tune.

Tests: `tests/sound-bus.test.ts` (a recording fake AudioContext), `tests/offline.test.mjs`.

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
| Level-up | level | square+triangle C-E-G arpeggio into a held C major chord, bell and sparkle |
| Quest / reward collect | quest | G major bell arpeggio, shimmer sweep, warm triangle bass |
| Fish bite / catch | bite / catch | bite: double water plop; catch: big low-passed splash, random droplet chirps, two-note ta-da |
| UI tap / open / close | click / open / close | soft wooden FM tap; open = two-note pluck up with a whoosh; close = down |
| Power strike | power | rising charge whoosh, sub boom, sawtooth crack, high crackle, bell tail |
| Jump / land | jump (flip) / land | springy sine hop with an airy puff; land = low thud + dust |
| Swim stroke / water entry | stroke / dive | stroke: slow band-passed swish every 0.85 s while swimming and moving; dive: splash + droplets |

Other voices (alert, cast, reel, snap, ready, boom, zap, shock, freeze, magic, success, pop, splash) keep their roles,
several with richer layers. Tests: `tests/sound.test.ts`. Browser probe: `globalThis.__zooSfx.meter()` gives an
AnalyserNode on the effects bus and `__zooSfx.stats` counts started / limited / capped / muted voices.
