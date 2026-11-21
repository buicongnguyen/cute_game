/**
 * Switches for the structural speed-ups, all on. Perf and test builds (VITE_PERF_HOOK, dev) expose this object as
 * `__zoo.flags`, so a pixel A/B can render the very same frozen frame with a speed-up off and on (promo/frozen-ab.mjs).
 * Nothing in the shipped game turns one off. A tool that needs a switch off from the first line of the page (the look
 * switches are read while the page loads) sets `window.__zooFlagPreset = { ownRamp: false }` before the game's code runs.
 */
export const perfFlags = {
  /** Upload only live particle matrices and changed colours; retain pending hidden updates. */
  selectiveParticleUploads: true,
  /** The local explorer uses the same exact per-part batching as neighbours, with independent status materials. */
  mergeLocalAvatar: true,
  /** Remote players and bots draw one merged mesh per rigid part, like the friends (avatar-merge.ts). */
  mergeRemoteAvatars: true,
  /** Your pets (up to two, pet-slots.ts) draw one merged mesh per rigid part too, only where the look is identical (mergeParts exact). */
  mergeCompanions: true,
  /** Scatter tiles (static scenery) are skipped by the per-frame matrix pass once their matrices are settled. */
  freezeStaticTrees: true,
  /** The matrix pass trusts the position/rotation/scale cache instead of three.js's matrixWorldNeedsUpdate on objects it composes itself. */
  trustTransforms: true,
  /** Merged outline hulls are built once per kit part and placement and shared (outline.ts).
   * Off builds every hull again, as before. */
  cacheHulls: true,
  /** Our own look (look.ts): the colour curve, the per-planet light rigs and skies, the shaded ground and the contact
   * shading on scenery. Off draws the reference's flat rig; a world must be rebuilt (world.build) to switch. */
  richLook: true,
  /** The toy finish (AAA plan WP6): our own colour ramp (toon.ts) and ink (outline.ts), the baked top highlights
   * (look.ts) and crop cards drawn from the player's camera angle with bold ink, capped to their bed (crop-cards.ts).
   * Off gives the grey ramp, the old ink and the 51.5 degree cards back. Read as the page loads: preset it (above). */
  ownRamp: true,
  /** The explorer eases between standing and walking, fidgets and sits (hero-motion.ts, features/hero-idle.ts). Off is the
   * old switch between the two poses, for a frozen A/B. */
  heroMotion: true,
};
Object.assign(perfFlags, (globalThis as { __zooFlagPreset?: Partial<typeof perfFlags> }).__zooFlagPreset);
