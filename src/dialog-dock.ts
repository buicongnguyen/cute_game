import './dialog-dock.css';

/**
 * Desktop panel docking: on a wide screen with a mouse, regular menus (bag, wardrobe, shops, bench, chest, kitchen…)
 * dock to the right without dimming the world, so the explorer stays in view and gear changes show on the avatar
 * as they happen. Confirm/alert-style dialogs and big read-only pages stay centred. Phones keep the bottom sheet:
 * the CSS only applies under (pointer: fine) and min-width 1000px.
 */
const CENTRED = new Set(['death', 'difficulty-confirm', 'feed-confirm', 'reset', 'help', 'fish-help', 'map', 'settings', 'travel', 'quests']);

export const dockable = (type: string) => !CENTRED.has(type);

/** True while a docked panel is actually laid out on the right (the media query matched). */
export function dockedNow(): boolean {
  const layer = document.querySelector('#dialog-layer');
  return !!layer && !(layer as HTMLElement).hidden && layer.classList.contains('docked') && matchMedia(DOCK_QUERY).matches;
}
export const DOCK_QUERY = '(pointer: fine) and (min-width: 1000px)';

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
    const W = innerWidth, panel = document.querySelector('#dialog');
    let want = 0;
    if (dockedNow() && panel) want = Math.max(0, (W / 2 + 96 - (panel.getBoundingClientRect().left - 24)) / W); // hero half-width up to ~90px with a wide hat
    if (Math.abs(want - shift) < 1e-4) { if (shift === want) return; shift = want; } else shift += (want - shift) * .18;
    if (shift < 1e-4 && want === 0) { shift = 0; camera.clearViewOffset(); } else camera.setViewOffset(1, 1, shift, 0, 1, 1);
  };
  requestAnimationFrame(tick);
}
