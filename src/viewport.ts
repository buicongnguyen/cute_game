/**
 * The window's inner size without a layout read. `innerWidth` / `innerHeight` make the browser flush pending style and
 * layout work, so a read after a DOM write (label text, a transform) recalculates the page again. The label and HUD
 * loops read the size dozens of times per frame between writes (about 4% of a frame at 4x CPU slowdown), so they read
 * this copy instead; it is refreshed whenever the window or the visual viewport resizes. Without a real window (tests,
 * vm sandboxes) every read goes straight to the global, so nothing is ever stale there.
 */
const live = typeof window !== 'undefined' && typeof window.addEventListener === 'function';
let width = 0, height = 0;
function sync() { width = window.innerWidth; height = window.innerHeight; }
if (live) {
  sync();
  for (const type of ['resize', 'orientationchange']) window.addEventListener(type, sync);
  window.visualViewport?.addEventListener('resize', sync);
}
const global = globalThis as unknown as { innerWidth?: number; innerHeight?: number };
export const viewWidth = () => live ? width : global.innerWidth ?? 0;
export const viewHeight = () => live ? height : global.innerHeight ?? 0;
/** Re-reads the size now (a resize handler that already ran before this one's listener was added). */
export const refreshViewport = () => { if (live) sync(); };
