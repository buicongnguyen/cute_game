# Draw-call review

This workflow adapts Claude's shared `smooth-dense-scenes` skill, used for the Starline/3D_game_scene performance work. The skill is at `~/.claude/skills/smooth-dense-scenes/SKILL.md`. Three.js is the same r180 generation used by its recipes.

## Run it

Start an unminified development client, for example:

```sh
npm run dev:client -- --port 5298 --strictPort
```

The review needs an installed Playwright Chromium. It resolves Playwright from this project, or from the optional `PLAYWRIGHT_MODULE` environment variable pointing to an existing installation's `index.mjs`. It does not install software or add a production dependency.

```sh
npm run perf:draws -- http://127.0.0.1:5298/ --mobile --cpu 4 --out draw-review.json
npm run perf:draws -- http://127.0.0.1:5298/ --viewport 1280x720 --out draw-review-desktop.json
```

Optional: `--scenes village,forest,canyon`, `--flag mergeLocalAvatar`. Reports belong outside tracked source; do not commit diagnostic JSON files or captures.

## What the review checks

- Fresh, isolated browser storage seeded from `promo/save.json`; no real saves or accounts are changed.
- Fixed Sharp quality and camera locations, with seeded randomness, a frozen game clock and the same scene for both arms.
- Raw WebGL draw submissions, including shadows. Per-object attribution counts actual submissions, excluding objects that reach Three.js's renderer but submit no draw.
- Main/shadow breakdown, triangles, scene geometry-buffer bytes, canvas dimensions, MSAA and the actual GPU. Software-renderer timing must not be presented as phone performance.
- Full-canvas pixel readback before/after and an unchanged-build control; no screenshot needs to be displayed or saved. The command fails if any pixels differ, browser errors occur, or draws increase.
- Twelve interleaved timing pairs and unchanged-state timing controls. Repeated GPU readbacks are a synchronous rendering diagnostic, not gameplay FPS. Treat gains inside the control variation as noise.

## Local-player batching

Remote players, friends and companions already batch compatible pieces by rigid body part. The local player previously retained separate compatible skin/shirt/hair draws. `mergeLocalAvatar` applies exact batching before cloning its status materials, so hurt flashes and stealth stay local to the explorer.

The sprout and meshes owning child sockets remain independent. Gear, transparent/glowing/textured materials, outlines, different shadow flags and animated attachments keep their existing handling. No scenery, model detail, movement rules, render resolution or shadow quality is reduced.

## Measured result — 2026-10-25

Isolated promo save, fixed Sharp, portrait 390 × 844 CSS pixels, 487 × 1055 rendering buffer, 4× CPU slowdown, NVIDIA RTX 4080 SUPER through Chromium/D3D11. These are emulated-device rendering counts, not measurements from a physical phone. The simpler new-game village was about 154–158 draws; use the same save and quality when comparing rows.

| Scene | Before, all draws | After, all draws | Reduction | Different pixels |
| --- | ---: | ---: | ---: | ---: |
| Village | 187 | 165 | 22 (11.8%) | 0 |
| Forest | 91 | 69 | 22 (24.2%) | 0 |
| Canyon | 129 | 107 | 22 (17.1%) | 0 |

Eleven visible draws and eleven shadow draws were removed in each scene. Triangle counts were unchanged (172,022 / 77,470 / 66,116 respectively). Each pixel control also differed by zero pixels. The added local-player geometry used 252,768 bytes, approximately 0.24 MiB; the shared source kit remains intact. Timing controls varied enough that no fixed FPS improvement is claimed.

The diagnostic fails on an unknown performance flag or an invalid page. Keep the previous report and rerun the same command after changing rendering code or assets. Use the skill's raw `render-probe.mjs` for live-frame distributions and `draw-attribution.mjs` / `cpu-profile.mjs` to investigate other costs before adding more optimizations.

A second paired phone run measured village 200 → 178, forest 91 → 69 and canyon 130 → 108; a 1280 × 720 desktop run measured 225 → 203, 96 → 74 and 133 → 111. Actor positions and transient effects can vary between page loads; each pair still removed exactly 22 submissions and changed zero pixels. Use paired comparisons rather than comparing unrelated launches.

The reusable command also compares recolouring, a hat plus outfit, a grown body, walking, hurt flashes, stealth and a fishing pose. All seven had zero differing pixels. A separate transition check confirms entering and leaving stealth switches the local avatar representation; its result is a logical check, not a fabricated pixel measurement. Stealth retains the original independently sorted transparent meshes; the optimization resumes when the explorer becomes opaque. Only the explorer is rebuilt at these transitions; pets keep their existing instances and movement state.
