/**
 * Scroll cues for the horizontal tab strips (.panel-tabs in the panels, .ranking-cats in the leaderboard): when a strip holds more
 * tabs than fit, a chevron with a soft fade marks the hidden side (classes more-l / more-r, styled in menus.css), and the active tab
 * scrolls into view when the strip is drawn or its active tab changes, so the current tab is never the one hidden off the edge.
 */
const SELECTOR = '.panel-tabs, .ranking-cats';
const ACTIVE = 'button.active, button[aria-pressed="true"]';

function sync(strip: HTMLElement) {
  const max = strip.scrollWidth - strip.clientWidth;
  strip.classList.toggle('more-r', max > 3 && strip.scrollLeft < max - 3);
  strip.classList.toggle('more-l', max > 3 && strip.scrollLeft > 3);
}

function reveal(strip: HTMLElement) {
  const tab = strip.querySelector<HTMLElement>(ACTIVE);
  if (!tab || !strip.clientWidth) { sync(strip); return; }
  strip.dataset.cueTab = tab.textContent ?? '';
  strip.scrollLeft = Math.max(0, tab.offsetLeft - (strip.clientWidth - tab.offsetWidth) / 2);
  sync(strip);
}

function enhance(strip: HTMLElement) {
  if (strip.dataset.cues) {
    // Redrawn in place (the leaderboard swaps the chips' children): follow the new active tab.
    const tab = strip.querySelector<HTMLElement>(ACTIVE);
    if (tab && (tab.textContent ?? '') !== strip.dataset.cueTab) reveal(strip); else sync(strip);
    return;
  }
  strip.dataset.cues = '1';
  strip.addEventListener('scroll', () => sync(strip), { passive: true });
  // A strip inside a closed panel has no width yet: it gets its cues, and its active tab scrolled into view, once it is shown.
  let shown = false;
  new ResizeObserver(() => { if (!shown && strip.clientWidth) { shown = true; reveal(strip); } else sync(strip); }).observe(strip);
  reveal(strip);
}

export function initTabCues(root: HTMLElement = document.body) {
  const scan = () => root.querySelectorAll<HTMLElement>(SELECTOR).forEach(enhance);
  let queued = false;
  new MutationObserver(() => { if (queued) return; queued = true; requestAnimationFrame(() => { queued = false; scan(); }); }).observe(root, { childList: true, subtree: true });
  scan();
}

// Importing the module starts the cues (main.ts imports it once).
if (typeof document !== 'undefined') initTabCues();
