import './dialog-dock.css';

/**
 * Desktop panel docking: on a wide screen with a mouse, every menu (bag, wardrobe, shops, bench, chest, kitchen, the
 * wishing crystal, the market, the starship's travel list, the map, the journal, settings and help…) docks to the right
 * without dimming the world, so the explorer stays in view and gear changes show on the avatar as they happen. Only
 * true confirm/alert dialogs stay centred over a dimmed world, because they ask for a decision before anything else:
 * being knocked out, the difficulty and feed confirmations, and starting a new story. Phones keep the bottom sheet:
 * the CSS only applies under (pointer: fine) and min-width 1000px.
 */
export const CENTRED: ReadonlySet<string> = new Set(['death', 'difficulty-confirm', 'feed-confirm', 'reset']);

export const dockable = (type: string) => !CENTRED.has(type);

/** True while a docked panel is actually laid out on the right (the media query matched). */
export function dockedNow(): boolean {
  const layer = document.querySelector('#dialog-layer');
  return !!layer && !(layer as HTMLElement).hidden && layer.classList.contains('docked') && dockMedia().matches;
}
export const DOCK_QUERY = '(pointer: fine) and (min-width: 1000px)';
/** One MediaQueryList for the session: its `matches` is live, so asking each frame costs nothing and creates nothing. */
let dockList: MediaQueryList | null = null;
const dockMedia = () => dockList ??= matchMedia(DOCK_QUERY);

export function setDock(type: string) {
  document.querySelector('#dialog-layer')?.classList.toggle('docked', dockable(type));
}

type ViewCamera = { setViewOffset(fw: number, fh: number, x: number, y: number, w: number, h: number): void; clearViewOffset(): void };
/**
 * The follow camera keeps the hero at screen centre. When a docked panel would reach the hero (narrow desktop windows,
 * roughly below 1280 px) the picture slides left with a projection view offset, so the hero sits in the free left part;
 * it eases back on close. A view offset leaves the camera rig, picking (it unprojects through the same matrix) and
 * resize handling untouched; it is set in normalised units so it survives resizes.
 */
export function initDockFraming(camera: ViewCamera) {
  let shift = 0;
  const tick = () => {
    requestAnimationFrame(tick);
    // Phones and narrow windows never dock: nothing to measure once the picture has settled back.
    if (shift === 0 && !dockMedia().matches) return;
    // The docked menu, or the docked "Play together" modal (online.ts; dialog-dock.css docks it the same way).
    const W = innerWidth, panel = dockedNow() ? document.querySelector('#dialog') : dockMedia().matches ? document.querySelector('#online-dialog[open]') : null;
    let want = 0;
    if (panel) want = Math.max(0, (W / 2 + 96 - (panel.getBoundingClientRect().left - 24)) / W); // hero half-width up to ~90px with a wide hat
    if (Math.abs(want - shift) < 1e-4) { if (shift === want) return; shift = want; } else shift += (want - shift) * .18;
    if (shift < 1e-4 && want === 0) { shift = 0; camera.clearViewOffset(); } else camera.setViewOffset(1, 1, shift, 0, 1, 1);
  };
  requestAnimationFrame(tick);
}
