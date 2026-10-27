# Performance review â€” 2026-10-25

## Scope and environment

Used `C:/Users/n/.claude/skills/smooth-dense-scenes/SKILL.md` and its CPU/buffer reference. The supplied path omitted the separator before `.claude`; the installed shared skill was found there. Engine: **Three.js 0.180.0**. Checked the installed `WebGLAttributes` implementation: update ranges are in components, and the renderer clears them after uploading.

Changes remain local: no commit, push or deployment. This review preserves the earlier local-avatar batching work and reviews the local particle-upload/cache changes alongside it. It does not reduce graphics settings, particle capacity, gameplay simulation, animation or controls.

Test hardware: Chromium, ANGLE/D3D11, NVIDIA RTX 4080 SUPER. Desktop CSS/backing viewport 1280Ã—720, CPU 1Ã—. Mobile CSS viewport 390Ã—844, device scale 2, existing Sharp quality produces a 487Ã—1055 backing buffer, CPU throttled 4Ã—. This is mobile emulation on a desktop GPU, not physical-phone evidence.

## Findings and implementation

1. **Particle uploads were provably redundant.** Two fixed pools (420 ordinary, 360 glow particles) uploaded all matrices and colours every update, including when empty. `ParticlePool` now uploads only live matrix prefixes and colours changed by emission or slot replacement. Empty pools submit no repeated buffer changes. Shrinking the draw count hides expired tails without writing them. Particle movement, billboarding, homing, arrival callbacks and random recycling are unchanged.
2. **Pending uploads need to survive skipped renders.** `queueAttributeRange` unions new writes with pending ranges into one bounded range. It does not discard data from hidden/unrendered frames. Initial GPU allocations retain their original capacity. No extra full-capacity staging buffer was introduced.
3. **Transform caching already exists and works.** Keep the project's Float64 TRS cache, parent propagation, hidden-branch invalidation and static-tree machinery; do not add a second traversal or production prototype wrappers. Fixed an invalidation defect: manual matrix mode now clears cached TRS, so returning to `matrixAutoUpdate` restores the automatic pose even when its TRS values have not changed.
4. **Avatar batching saves submissions in both passes.** The earlier local change batches compatible rigid parts with exact materials, preserving named attachments and independently hidden pieces. Transparent stealth uses the original per-piece rendering. This is separate from the particle optimization.

The measurable waste is unnecessary particle-buffer traffic and avatar submissions. Remaining CPU samples span HUD/layout, scene callbacks, traversal (`visit`, `moved`, `projectObject`), enemy updates and draw/program setup. Mobile samples highlighted `attackShown` and the loot render callback; desktop included `getBoundingClientRect`. Sample attribution is not a GPU timer and does not establish one universal bottleneck. The loot view already has an empty-state early return. No speculative gameplay or HUD rewrite was made.

## Controlled particle comparison

Same page, same settled scene, fixed time, dt=0 effect updates; only the upload flag changes. Actual WebGL calls include shadows. Complete RGBA buffers are compared with an identical-state control. Both desktop and mobile produced these upload results:

| State | Bytes/frame before | Bytes/frame after | Upload calls before â†’ after |
|---|---:|---:|---:|
| Empty pools | 59,280 | 0 | 4 â†’ 0 |
| 48 ordinary + 48 glow particles, unchanged colours | 59,280 | 6,144 | 4 â†’ 2 |

The active case is an **89.6% byte reduction**, not an FPS claim. 6,144 = 96 Ã— 16 matrix components Ã— 4 bytes. New or swapped colours still upload. First allocation remains full capacity.

| View / state | Draws before â†’ after | Shadow draws | Changed pixels / control |
|---|---:|---:|---:|
| desktop / empty | 164 â†’ 164 | 69 | 0 / 0 |
| desktop / 96 particles | 166 â†’ 166 | 69 | 0 / 0 |
| mobile / empty | 139 â†’ 139 | 62 | 0 / 0 |
| mobile / 96 particles | 141 â†’ 141 | 62 | 0 / 0 |

These zero-upload results apply to the isolated frozen empty pools. Normal gameplay still uploads fish, foliage, animated instances, effects and other changing buffers.

## Draw calls including shadows

Flag comparison uses the same frozen scene, changing only local-avatar batching. Values vary across launches because actors and assets settle at different times. Each paired result saves 11 main-view + 11 shadow submissions, with unchanged triangles.

| View / location | Total before â†’ after | Main before â†’ after | Shadows before â†’ after | Changed pixels / control |
|---|---:|---:|---:|---:|
| desktop / village | 256 â†’ 234 | 141 â†’ 130 | 115 â†’ 104 | 2 / 2 |
| desktop / forest | 96 â†’ 74 | 69 â†’ 58 | 27 â†’ 16 | 0 / 0 |
| desktop / canyon | 133 â†’ 111 | 88 â†’ 77 | 45 â†’ 34 | 0 / 0 |
| mobile / village | 186 â†’ 164 | 113 â†’ 102 | 73 â†’ 62 | 0 / 0 |
| mobile / forest | 91 â†’ 69 | 64 â†’ 53 | 27 â†’ 16 | 0 / 0 |
| mobile / canyon | 130 â†’ 108 | 85 â†’ 74 | 45 â†’ 34 | 0 / 0 |

Mobile passed exact scene and all seven character comparisons (recolour, outfit, grown body, walking, hurt flash, stealth and fishing). Stealth transitions and hand attachments passed on both layouts. Desktop forest/canyon and six character comparisons were exact; village had 2 changed pixels at a maximum channel delta of 1, also present in its unchanged control. Desktop stealth had 9 pixels at delta 1. The strict desktop avatar command therefore exits nonzero; this review does **not** claim perfect desktop avatar equivalence. An earlier attempt similarly had tiny control drift. The targeted particle comparisons pass exactly. Render callbacks were removed from the outer world entry point in frozen probes, while live-work measurements still use the game loop; scene callbacks still execute in Three.js.

## Matrix work and normal simulation

The transform-only audit copies the same hierarchy and local poses into ordinary Object3Ds, then compares settled normal Three.js traversal against the project's **existing** cache. It is not a newly achieved gain and is not moving gameplay:

| View | Ordinary compose / multiply | Cached compose / multiply | Cached nodes visited |
|---|---:|---:|---:|
| desktop | 2497 / 2523 | 0 / 0 | 834 |
| mobile | 2641 / 2667 | 0 / 0 | 897 |

Normal simulation: 4 warm-up frames, then 60 sampled frames per workload. Effects use a synthetic 96-particle burst, not a complete combat benchmark. Walking uses the existing directional input state. These sequential rows describe workload; they are not matched before/after comparisons.

| View / workload | Draws (shadow) | Upload bytes/frame | Compose / multiply per frame | New buffer allocations |
|---|---:|---:|---:|---:|
| desktop / idle | 204.9 (74.0) | 10927 | 187.3 / 622.1 | 0 (0 bytes) |
| desktop / effects | 204.7 (74.0) | 16794 | 273.4 / 621.8 | 0 (0 bytes) |
| desktop / walking-effects | 186.6 (72.8) | 16745 | 273.8 / 597.2 | 4 (840 bytes) |
| mobile / idle | 163.5 (62.0) | 12620 | 249.1 / 674.9 | 0 (0 bytes) |
| mobile / effects | 152.0 (62.0) | 18811 | 331.6 / 643.2 | 0 (0 bytes) |
| mobile / walking-effects | 144.8 (62.0) | 18605 | 328.6 / 633.4 | 0 (0 bytes) |

## CPU timings: no proven FPS improvement

Removed matrix, upload, render-attribution **and raw draw** wrappers before timings. Twelve interleaved pairs per condition, two warm-up and four sampled simulation frames per arm, plus identical-flag controls. These synchronous CPU times exclude GPU completion/display pacing. Actors continue evolving; the moving test also changes location, so these are coarse regression observations, not exact state-matched causal timings.

| View / condition | Before ms/frame | After ms/frame | Identical-arm A / B ms/frame |
|---|---:|---:|---:|
| desktop / stationary hero | 1.650 | 1.725 | 1.950 / 1.375 |
| desktop / moving | 2.000 | 2.175 | 2.650 / 1.850 |
| mobile / stationary hero | 18.400 | 21.700 | 16.650 / 21.425 |
| mobile / moving | 12.925 | 13.650 | 11.675 / 13.875 |

Apparent differences are smaller than the identical-arm variation; neither a CPU speedup nor a material slowdown is established. No measured FPS, mobile thermals, battery or GPU-time improvement is claimed. The reliable results are submission/upload work reductions and correctness checks.

## Memory

Counts below stayed identical before/after the paired and timing phases in each run. Scene backing storage deduplicates ArrayBuffers and includes geometry attributes, indices, instance matrices and colours. It is not total VRAM; textures, driver allocations and assets outside the live scene are excluded. Chromium heap readings are coarse, not leak evidence.

| View | Scene backing bytes | Geometries / textures / programs | Approx. reported JS heap |
|---|---:|---:|---:|
| desktop | 9,958,474 | 392 / 7 / 54 | 97.4 MB |
| mobile | 12,293,158 | 350 / 7 / 53 | 103.0 MB |

The new upload policy leaves pool capacities unchanged and adds bounded range metadata plus a dirty-colour flag. Earlier avatar batching adds 252,768 geometry bytes (~0.24 MiB), documented in `docs/draw-call-review.md`. Cross-launch scene memory differences are not savings. Short-run stability does not prove long-session leak freedom.

## Correctness and verification

Focused checks cover empty pools; live prefixes; middle-slot expiry/replacement; pending ranges after 1,000 unrendered updates; clear/reuse and capacity recycling; moving/billboard/homing parity against the original upload policy, including matching arrival callbacks; parent motion, turning, child animation/scaling, reparenting, hidden/revealed nodes, picking queries, manual-to-automatic matrices; and avatar attachments/status materials/companions.

**Final validation:** `npm test` passed: 2,233 tests, 2,172 passed, 61 skipped, 0 failed. `npm run build` passed (TypeScript, Vite and offline cache); the existing large-chunk advisory remains. Both CPU/buffer browser probes passed with no page errors. Mobile draw/pixel probe passed; desktop strict avatar probe flagged the explicitly documented tiny differences. The pixel threshold was not relaxed. `git diff --check` passed.

## Reproduce and evidence

Use an installed Playwright Chromium; no production dependency was added:

```powershell
npm run dev:client -- --port 5299 --strictPort
$env:PLAYWRIGHT_MODULE = 'C:/path/to/node_modules/playwright/index.mjs'
npm run perf:work -- http://127.0.0.1:5299/ --mobile --cpu 4 --out C:/temp/mobile.json
npm run perf:work -- http://127.0.0.1:5299/ --out C:/temp/desktop.json
npm run perf:draws -- http://127.0.0.1:5299/ --mobile --cpu 4 --out C:/temp/draw-mobile.json
npm run perf:draws -- http://127.0.0.1:5299/ --out C:/temp/draw-desktop.json
npm test
npm run build
```

Raw current reports: [desktop CPU/buffers](docs/performance-review/desktop.json), [mobile CPU/buffers](docs/performance-review/mobile.json), [desktop draw/pixels](docs/performance-review/draw-desktop.json), [mobile draw/pixels](docs/performance-review/draw-mobile.json). The mobile draw report preceded the frozen-render harness refinement; it passed the original stricter world-entry path. Both policies preserve normal production rendering. All profiling instrumentation is isolated to the browser harness; production exposes only its existing development hooks.
