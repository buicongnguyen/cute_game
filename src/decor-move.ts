/**
 * Moving what the player placed at home (owner's ask, 2026-10-15): decorations (the Little volcano, lamps, statues,
 * the teddy…) and garden beds.
 *
 * - A tap on a placed decoration at home (it is selected, the explorer walks up, then world.onInteract) opens a small
 *   menu over it: Move, Turn (45° in place) and Pack away. The Decor panel's "placed at home" rows offer the same, and a
 *   bed's panel offers Move bed.
 * - Move lifts the item (hidden, a decoration stops blocking) and re-enters the placement bar with its see-through ghost
 *   at its current spot and turn. ✔ Place saves through the shared actions moveDecoration / moveBed (actions.ts; the
 *   server replays them after its own home-and-not-visiting gate, as for placeDecoration); ✕ or Esc puts it back.
 * - The spot rules are the placement rules (model.ts decorSpotOk / bedSpotOk) with the moving item's own old spot left out.
 * - A bed moves with its crop: moveBed keeps the crop, its planting time and its growing duration.
 *
 * The rules here are pure (tests/decor-move.test.ts); mountDecorMenu is the only DOM part. Vietnamese: locales/vi-decor.ts.
 */
import * as M from './model.ts';
import { t } from './i18n.ts';

export type MoveTarget = { kind: 'decor'; uid: string } | { kind: 'bed'; index: number };
export interface MoveStart { id: string; name: string; x: number; z: number; rotation: number }
export interface MoveIntent { type: 'moveDecoration' | 'moveBed'; payload: Record<string, unknown> }

/** One press of Turn (and of ↻ in the placement bar). */
export const TURN_STEP = Math.PI / 4;
/** The menu closes once the explorer is this far from the decoration: it belongs to the item being looked at. */
export const MENU_REACH = 4.5;
/** Presses on the menu this soon after it opened are ignored: the finger that opened it may land on a button. */
export const MENU_GUARD_MS = 350;
/** Height (m) above the item's foot that the menu points at. */
const ANCHOR_Y = 1.3;

/** Where a move starts: the ghost's item id, the name for the bar, the item's spot and turn; null when it cannot move (gone, away from home). */
export function moveStart(s: M.SaveState, target: MoveTarget): MoveStart | null {
  if (s.planet !== 'home') return null;
  if (target.kind === 'decor') {
    const d = s.decorations.find(d => d.uid === target.uid), item = d && Object.hasOwn(M.ITEMS, d.id) ? M.ITEMS[d.id] : undefined;
    return d && item ? { id: d.id, name: item.name, x: d.x, z: d.z, rotation: d.rotation || 0 } : null;
  }
  const plot = Number.isInteger(target.index) ? s.plots[target.index] : undefined;
  if (!plot) return null;
  const at = M.bedPosition(s, target.index);
  return { id: 'plot_kit', name: 'Garden bed', x: at.x, z: at.z, rotation: plot.rotation ?? 0 };
}

/** The shared spot rule for a move (the ghost and bar turn red where it is false). For a decoration the caller also asks the world's obstacles, as placing does. */
export function moveSpotOk(s: M.SaveState, target: MoveTarget, x: number, z: number, rotation: number) {
  return target.kind === 'decor' ? M.decorSpotOk(s, x, z, target.uid) : M.bedSpotOk(s, x, z, rotation, target.index);
}

/** The action that saves a move. */
export function moveIntent(target: MoveTarget, x: number, z: number, rotation: number): MoveIntent {
  return target.kind === 'decor' ? { type: 'moveDecoration', payload: { uid: target.uid, x, z, rotation } } : { type: 'moveBed', payload: { index: target.index, x, z, rotation } };
}

/** Turn: the decoration stays where it is and turns one step (a moveDecoration to its own spot); null when it is gone. */
export function turnIntent(s: M.SaveState, uid: string): MoveIntent | null {
  const d = s.decorations.find(d => d.uid === uid);
  return d ? { type: 'moveDecoration', payload: { uid, x: d.x, z: d.z, rotation: ((d.rotation || 0) + TURN_STEP) % (Math.PI * 2) } } : null;
}

/** Top-left corner of the menu: centred above the anchor, below it when there is no room above, always inside the view. */
export function menuSpot(anchor: { x: number; y: number }, box: { w: number; h: number }, view: { w: number; h: number }, gutter = 8) {
  const x = Math.min(Math.max(anchor.x - box.w / 2, gutter), Math.max(gutter, view.w - box.w - gutter));
  let y = anchor.y - box.h - 12;
  if (y < gutter) y = anchor.y + 36;
  y = Math.min(Math.max(y, gutter), Math.max(gutter, view.h - box.h - gutter));
  return { x: Math.round(x), y: Math.round(y) };
}

/** The menu's markup (text in English; t() turns it Vietnamese). */
export function menuHtml(name: string, icon: string, esc: (s: string) => string) {
  return `<div class="dm-head"><span class="dm-icon">${icon}</span><b>${esc(t(name))}</b><button type="button" class="dm-close" data-decor="close" aria-label="${esc(t('Close'))}">×</button></div>`
    + `<div class="dm-buttons"><button type="button" class="primary" data-decor="move">✥ ${esc(t('Move'))}</button>`
    + `<button type="button" class="sky-button" data-decor="turn">↻ ${esc(t('Turn'))}</button>`
    + `<button type="button" class="soft-button" data-decor="pack">🎒 ${esc(t('Pack away'))}</button></div>`;
}

export interface DecorMenuHost {
  state(): M.SaveState;
  /** At one's own home, playing, with no panel open and nothing being placed. */
  usable(): boolean;
  hero(): { x: number; z: number };
  /** CSS pixels of a world point (World.screen). */
  screen(x: number, y: number, z: number): { x: number; y: number; front: boolean };
  icon(id: string): string;
  esc(s: string): string;
  move(target: MoveTarget): void;
  turn(uid: string): Promise<unknown>;
  pack(uid: string): Promise<unknown>;
}

/** The tap menu over a placed decoration. `frame()` keeps it over the item and closes it when the explorer walks off. */
export function mountDecorMenu(layer: HTMLElement, host: DecorMenuHost) {
  const el = document.createElement('div');
  el.id = 'decor-menu'; el.className = 'decor-menu'; el.hidden = true; el.setAttribute('role', 'dialog');
  layer.append(el);
  let uid: string | null = null, openedAt = 0, busy = false, size = { w: 0, h: 0 };
  const close = () => { if (uid === null) return; uid = null; el.hidden = true; el.innerHTML = ''; };
  const decoration = () => uid === null ? undefined : host.state().decorations.find(d => d.uid === uid);
  const render = (d: M.Decoration) => {
    const item = M.ITEMS[d.id];
    el.innerHTML = menuHtml(item.name, host.icon(d.id), host.esc); el.setAttribute('aria-label', t(item.name));
    el.hidden = false; size = { w: el.offsetWidth, h: el.offsetHeight };
  };
  el.addEventListener('click', async event => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button[data-decor]');
    if (!button || uid === null) return;
    event.stopPropagation();
    if (busy || performance.now() - openedAt < MENU_GUARD_MS) return;
    const act = button.dataset.decor, id = uid;
    if (act === 'close') { close(); return; }
    if (act === 'move') { close(); host.move({ kind: 'decor', uid: id }); return; }
    busy = true;
    try {
      if (act === 'pack') { close(); await host.pack(id); }
      else if (act === 'turn') await host.turn(id);
    } finally { busy = false; }
  });
  // A press anywhere else closes the menu and still does what it does there (walk, open the bag…); Esc closes it on a PC
  // before the game's own Esc handling sees the key.
  document.addEventListener('pointerdown', event => { if (uid !== null && !el.contains(event.target as Node)) close(); }, true);
  document.addEventListener('keydown', event => { if (uid !== null && event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); close(); } }, true);
  addEventListener('resize', () => { if (uid !== null) size = { w: el.offsetWidth, h: el.offsetHeight }; });
  const api = {
    element: el,
    get uid() { return uid; },
    /** Opens the menu for decoration `id`; false when it is gone or the menu may not show now. */
    open(id: string) {
      const d = host.usable() ? host.state().decorations.find(d => d.uid === id) : undefined;
      if (!d || !Object.hasOwn(M.ITEMS, d.id)) return false;
      uid = id; openedAt = performance.now(); render(d); api.frame(); return true;
    },
    close,
    frame() {
      if (uid === null) return;
      const d = decoration(), hero = host.hero();
      if (!d || !host.usable() || Math.hypot(d.x - hero.x, d.z - hero.z) > MENU_REACH) { close(); return; }
      const at = host.screen(d.x, ANCHOR_Y, d.z);
      if (!at.front) { close(); return; }
      const spot = menuSpot(at, size, { w: innerWidth, h: innerHeight });
      el.style.transform = `translate(${spot.x}px,${spot.y}px)`;
    },
    /** Re-reads the item after a turn (a refused turn leaves it as it was). */
    refresh() { const d = decoration(); if (d) render(d); else close(); },
  };
  return api;
}
