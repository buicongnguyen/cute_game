/**
 * Publishes where the top-right menu ends as the CSS variable --menu-bottom (px from the top), so the minimap and the Home
 * button (hud-desk.css) sit right under it however many rows its buttons wrap to on this screen.
 */
export function initHudLayout() {
  const menu = document.querySelector<HTMLElement>('#hud .top-actions'); if (!menu) return;
  let last = -1;
  const measure = () => { const bottom = Math.ceil(menu.getBoundingClientRect().bottom); if (bottom !== last && bottom > 0) { last = bottom; document.documentElement.style.setProperty('--menu-bottom', bottom + 'px'); } };
  measure();
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(measure).observe(menu);
  addEventListener('resize', measure); addEventListener('orientationchange', measure);
  // Buttons are added after start-up (online, neighbours, platform tools): measure again as the page settles.
  for (const ms of [300, 1200, 3000]) setTimeout(measure, ms);
}
