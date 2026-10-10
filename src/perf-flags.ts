/**
 * Switches for the structural speed-ups, all on. Perf and test builds (VITE_PERF_HOOK, dev) expose this object as
 * `__zoo.flags`, so a pixel A/B can render the very same frozen frame with a speed-up off and on (promo/frozen-ab.mjs).
 * Nothing in the shipped game turns one off.
 */
export const perfFlags = {
  /** Remote players and bots draw one merged mesh per rigid part, like the friends (avatar-merge.ts). */
  mergeRemoteAvatars: true,
  /** Scatter tiles (static scenery) are skipped by the per-frame matrix pass once their matrices are settled. */
  freezeStaticTrees: true,
  /** The matrix pass trusts the position/rotation/scale cache instead of three.js's matrixWorldNeedsUpdate on objects it composes itself. */
  trustTransforms: true,
  /** Merged outline hulls are built once per kit part and placement and shared (outline.ts).
   * Off builds every hull again, as before. */
  cacheHulls: true,
};
