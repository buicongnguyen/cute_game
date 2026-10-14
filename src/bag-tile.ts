// The backpack's tile actions (owner request 2026-10-14): the selected tile carries a green "E" corner button (its primary
// action: Equip, Use or Place) and a "?" that opens a small details card anchored beside the tile, instead of the old
// details panel at the bottom of the bag. main.ts inventory() renders them; this module keeps the tiny UI state and places
// the card once per render (no per-frame work). Vietnamese lives in locales/vi-bag.ts.

export const bagUi = { card: false, tapId: '', tapAt: 0 };

/** The selected tile's primary action, or null when the item has none (auto-held rods, a pet swap that needs a choice). */
export type BagPrimary = { action: string; label: string; disabled: boolean };

type Tr = (s: string, vars?: Record<string, string | number>) => string;

export function bagCornerHtml(id: string, primary: BagPrimary | null, name: string, t: Tr, esc: (s: string) => string): string {
  const e = primary ? `<button class="tile-act tile-e" data-action="${primary.action}" data-item="${id}" ${primary.disabled ? 'disabled' : ''} aria-label="${esc(t('{action}: {name}', { action: t(primary.label), name }))}" title="${esc(t(primary.label))} (E)">E</button>` : '';
  return `${e}<button class="tile-act tile-q" data-action="bag-card" data-item="${id}" aria-expanded="${bagUi.card}" aria-controls="bag-card" aria-label="${esc(t('Details: {name}', { name }))}">?</button>`;
}

/** A second tap on the same, already selected tile within 400 ms. */
export function isDoubleTap(id: string, wasSelected: boolean, now: number): boolean {
  const hit = wasSelected && bagUi.tapId === id && now - bagUi.tapAt < 400;
  bagUi.tapId = hit ? '' : id; bagUi.tapAt = hit ? 0 : now;
  return hit;
}

/**
 * Anchor the details card next to the selected tile inside the scrolling dialog body: to its right, else its left, else
 * (narrow phones) as a sheet under the tile's row; flips above the tile when there is no room below in view.
 */
export function placeBagCard(body: HTMLElement): void {
  const card = body.querySelector<HTMLElement>('#bag-card'), cell = body.querySelector<HTMLElement>('.item-cell.sel');
  if (!card || card.hidden || !cell) return;
  const b = body.getBoundingClientRect(), c = cell.getBoundingClientRect(), pad = 8, gap = 6;
  const top0 = c.top - b.top + body.scrollTop, left0 = c.left - b.left, width = body.clientWidth;
  const narrow = width < 520, w = narrow ? width - pad * 2 : Math.min(320, width - pad * 2);
  card.style.width = `${w}px`;
  const h = card.offsetHeight;
  let left: number, top: number;
  if (narrow) { left = pad; top = top0 + c.height + gap; card.dataset.side = 'below'; }
  else if (left0 + c.width + gap + w <= width - pad) { left = left0 + c.width + gap; top = top0; card.dataset.side = 'right'; }
  else if (left0 - gap - w >= pad) { left = left0 - gap - w; top = top0; card.dataset.side = 'left'; }
  else { left = pad; top = top0 + c.height + gap; card.dataset.side = 'below'; }
  const viewBottom = body.scrollTop + body.clientHeight;
  if (top + h > viewBottom && top0 - gap - h >= body.scrollTop) { top = card.dataset.side === 'below' ? top0 - gap - h : top0 + c.height - h; card.dataset.flip = 'up'; }
  else delete card.dataset.flip;
  card.style.left = `${Math.max(pad, left)}px`; card.style.top = `${Math.max(0, top)}px`;
  const bottom = Math.max(0, top) + h;
  if (bottom > viewBottom) body.scrollTop += bottom - viewBottom + pad;
}
