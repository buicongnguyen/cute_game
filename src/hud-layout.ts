/**
 * Publishes how wide the dock (the menu column on the right edge) is as the CSS variable --dock-w, so the energy tag, the
 * map panel, the Home tab and the quest slips (hud-ours.css) sit just left of it however many columns its buttons
 * fold into on this screen. It also keeps --menu-bottom (where the dock's buttons end) for sheets that want it.
 * Measured when the dock's size changes, never per frame.
 */
export function dockMetrics(dock: DOMRect, buttons: readonly DOMRect[]) {
  const shown = buttons.filter(b => b.width > 0 && b.height > 0);
  if (!shown.length) return { width: Math.ceil(dock.width), bottom: Math.ceil(dock.bottom) };
  // The buttons, not the dock's box: the dock is as tall as the room it may use, and only its filled columns count.
  return { width: Math.ceil(dock.right - Math.min(...shown.map(b => b.left))), bottom: Math.ceil(Math.max(...shown.map(b => b.bottom))) };
}
export function initHudLayout() {
  const menu = document.querySelector<HTMLElement>('#hud .top-actions'); if (!menu) return;
  let lastWidth = -1, lastBottom = -1;
  const measure = () => {
    const { width, bottom } = dockMetrics(menu.getBoundingClientRect(), Array.from(menu.querySelectorAll<HTMLElement>('button'), b => b.getBoundingClientRect()));
    const root = document.documentElement.style;
    if (width !== lastWidth && width > 0) { lastWidth = width; root.setProperty('--dock-w', width + 'px'); }
    if (bottom !== lastBottom && bottom > 0) { lastBottom = bottom; root.setProperty('--menu-bottom', bottom + 'px'); }
  };
  measure();
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(measure).observe(menu);
  // Buttons come and go (news, online, neighbours, install); the energy number changing is not a layout change, so only
  // the dock's own child list and its two slots are watched.
  if (typeof MutationObserver !== 'undefined') {
    const watch = new MutationObserver(measure); watch.observe(menu, { childList: true });
    menu.querySelectorAll('#social-slot, #platform-slot').forEach(slot => watch.observe(slot, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden'] }));
  }
  addEventListener('resize', measure); addEventListener('orientationchange', measure);
  // Buttons are added after start-up (online, neighbours, platform tools): measure again as the page settles.
  for (const ms of [300, 1200, 3000]) setTimeout(measure, ms);
}
