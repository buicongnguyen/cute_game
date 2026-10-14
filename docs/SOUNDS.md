# Sound effects (FIX-PLAN 5.1, QUALITY-PLAN stage 3)

All effects are synthesized at play time in `src/sfx.ts` (WebAudio: oscillators, two-operator FM bells, filtered noise,
envelopes). No audio files, no samples: nothing is added to the download (the module grows by about 2.4 KB gzipped JS).
The AudioContext is created on the first touch/key (phone unlock) or first sound, never at load.

Mixing: random pitch (+-4 %, +-0.75 % for musical cues) and volume (+-12 %) per play; per-sound limit inside 100 ms
(hit 3, coin 4, default 2, plus 18 ms minimum gap); voice cap 14 (level/quest/hurt/catch/power get +4 headroom);
a compressor on the effects bus. Effects volume and mute come from Settings (`sfxVolume`, `sound`); music is separate.

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
