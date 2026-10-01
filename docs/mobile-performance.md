# Mobile farm rendering

Mobile Auto starts at Sharp, using the same quality profile as desktop: a pixel ratio capped at 2, 2048-pixel shadows and 256-pixel crop atlas cells. Farm animal animation is calmer while retaining the same models, materials, breed colors and outlines. This applies to touch/coarse-pointer devices and mobile user agents; desktop animation retains its original cadence. Fish and other simple creatures keep their existing animation and model detail.

## Changes

- Animal poses update at 20 Hz, instead of once per simulation step. Between updates, the renderer reuses the existing instance buffers. Collection effects and guard pursuit use 30 Hz.
- Casual roaming runs at 60% of the desktop pace. Bobbing, body sway, tail wagging and idle head motion use 45% of the original amplitude; idle motion is also slower. Guard pursuit and fleeing retain their normal pace.
- Growth, product readiness, expiry and removal still use the real clock. These changes appear immediately rather than waiting for the next animation update. Picking uses the same visible animal instances.
- Breed colors upload only when their instance slots change. Matrix uploads cover active instances rather than the entire allocated capacity.
- On mobile **Auto**, three consecutive slow seconds first disable the shadow pass and halve decorative grass/flower density. This first fallback preserves the current pixel ratio, crop atlas size, outlines and model detail. If frames remain slow, the existing resolution/quality fallback still applies. Effects return after sustained recovery, with a longer retry delay if restoring them repeatedly causes slow frames.
- Explicit **Sharp**, **Balanced** and **Battery saver** settings remain fixed. Old mobile Auto learned levels are reset once with `autoVersion: 2`, allowing the updated renderer to start at Sharp and measure the device again. Newly learned automatic levels still persist; explicit manual and legacy Battery saver choices are preserved.
- Trees already use shared/instanced geometry. This change keeps their current silhouettes and detail; it does not add a separate reduced-detail tree asset.

## Measured rendering work

Measured in Chromium with an emulated touch device, an 844 × 390 CSS-pixel viewport, device pixel ratio 3, Sharp's capped rendering ratio of 2, and actual `farm.glb` assets. The benchmark used 41 animals: ten each of chickens, ducks, cows and pigs, plus one dog; each livestock species included adults and young animals. After 30 warm-up frames, it submitted 300 frames with 1/60-second simulation steps. The comparison loaded the previous farm view and the updated view with identical assets, resolution and lighting.

These are rendering-work counts, **not FPS measurements on a physical phone**. Raw WebGL draw calls include the shadow pass; Three.js's main render counter does not include that pass.

| Farm benchmark | Previous view | Updated animation | Updated + Auto effects fallback |
| --- | ---: | ---: | ---: |
| Pose matrix buffer writes | 9,600 | 3,200 | 3,200 |
| GPU buffer upload calls | 28,800 | 3,200 | 3,200 |
| GPU buffer upload bytes | 12,025,200 | 1,452,800 | 1,452,800 |
| Total WebGL draws per frame | 44 | 44 | 34 |
| Main-pass triangles per frame | 49,344 | 49,344 | 49,344 |
| Canvas backing size | 1688 × 780 | 1688 × 780 | 1688 × 780 |

The animation change reduces pose writes by 67% and uploaded bytes by 88%. It does not change draw counts by itself. The optional effects fallback removes the farm's ten shadow-pass draws.

A second capture rendered the complete home scene with the same camera, full herd and loaded scenery. The first Auto fallback changed total WebGL draw calls from **293 to 155** while keeping the **1688 × 780** backing size, outlines and **256-pixel crop atlas cells**. Main-pass calls changed from 159 to 155; most of the saving came from removing the shadow pass. Exact home counts depend on camera position and visible entities.

## Reproduction and checks

1. Run the development client and use Chromium mobile emulation with an 844 × 390 viewport, touch enabled and device scale factor 3.
2. Load `farm.glb` and use Sharp's pixel ratio of 2 and 2048-pixel shadows. Create the full mixed-age herd above with a fixed seed and a fixed camera. Render 30 warm-up frames and then 300 frames at a fixed 1/60-second simulation step. Compare against the previous `FarmPenView` using the same module dependencies and assets.
3. Count instance-matrix attribute versions, WebGL `bufferSubData` calls/bytes, and all four WebGL draw entry points (`drawArrays`, `drawElements`, and their instanced variants). Count complete passes rather than relying only on `renderer.info.render.calls`.
4. Repeat with the complete home scene. Feed the Auto governor three seconds below 36 FPS, apply its returned profile, and verify fewer draws with unchanged canvas dimensions, outlines and crop atlas size.

Automated coverage in `tests/farm-mobile.test.ts` checks 60/120 Hz input cadence, unchanged geometry and draw counts, immediate lifecycle updates, animal picking, real-time guard/collection effects, calmer roaming, and breed uploads across reordered instances. `tests/graphics.test.ts` checks the Sharp default, the one-time mobile Auto migration, the first effects fallback, recovery and fixed manual settings.

The tradeoff is visibly calmer, less frequent animal motion. When Auto needs the effects fallback, shadows disappear and decorative ground cover becomes sparser. Actual battery use, GPU time and sustained frame rate still need checking on representative physical phones.
