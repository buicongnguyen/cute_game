/**
 * Settings > Controls at run time: applies the side, size and opacity to the HUD, places a saved custom layout, runs the
 * "Move buttons" editor and the PC keys panel. The rules live in controls-layout.ts / controls-keys.ts / controls-prefs.ts.
 *
 * Nothing here runs per frame. A layout is placed when something that moves the buttons changes (a setting, the window's
 * size or turn, the jump switch, the joystick, a new save's calm HUD showing a button (first-run.ts), a mode, the fourth skill toe): CSS custom properties on the
 * placed buttons (left/top, controls.css), measured once and checked once. Modes with their own arrangement (Flag Rush,
 * the Vault, Rescue Call, indoors, fishing; space flight hides this HUD) are excluded in CSS, so they keep their layouts.
 */
import { t } from './i18n.ts';
import { PARTS, conflictsOf, dragTo, fitLayout, layoutConflict, screenType, SIZES, toSpot, type Box, type Layout, type Obstacle, type Part, type ScreenType } from './controls-layout.ts';
import { readControls, saveControls, skillSide, sizeOf, opacityOf, type ControlsPrefs } from './controls-prefs.ts';
import { bindingKey, cleanKeys, effectiveKeys, jumpKeyUp, keyLabel, rebind, translateKey, type CustomKeys, type KeyAction, type KeyContext } from './controls-keys.ts';
import { keysPanelHtml, SCREEN_NAMES, type ControlsView } from './controls-html.ts';
import './controls.css';

export interface ControlsHost {
  hud: HTMLElement; store: Storage | null;
  joystickSide(): string | undefined; joystickOn(): boolean; keyContext(): KeyContext; skillNames(): string[];
  /** May the editor open now (the open field, not a mode, flight, fishing or indoors)? */
  canEdit(): boolean;
  /** Something the HUD shows changed (side, keys, size): refresh labels, measure the HUD again. */
  changed(): void;
  settings(): void; closeDialog(): void; openDialog(type: string, title: string, body: string, kicker?: string, icon?: string): void;
  toast(message: string, icon: string): void; modal(): string | null;
}
const PART_SELECTORS: Record<Part, string> = { skills: '.skills', attack: '.attack-pad', jump: '.jump-pad', eat: '.quick-eat', stick: '#movement-joystick' };
const OBSTACLES: [string, string][] = [['hero', '.player-card'], ['menu', '.top-actions > button, .home-button'], ['map', '.minimap'], ['quests', '.tracker-panels > :not([hidden]), #tracker-chip:not([hidden])'], ['keys', '#keys-guide']];
const NAMES: Record<string, string> = { hero: 'the hero card', menu: 'the menu buttons', map: 'the map', quests: 'the quest cards', keys: 'the keyboard guide', edge: 'the screen edge', skills: 'the skill buttons', attack: 'the Attack button', jump: 'the Jump button', eat: 'the eat button', stick: 'the joystick' };
const PLACED = 'data-ctl-placed';
const TOUCH_LAYOUT = '(pointer: coarse), (max-width: 900px), (max-height: 520px)';
/** Class changes that can move or show the fight buttons; any other class flip is ignored (some are rewritten every frame). */
const WATCHED = /^(air-combat|in-mode|indoors|joystick-on|fishing|toes-4|calm-skills|calm-attack|calm-eat)$/;

export function initControls(host: ControlsHost) {
  const hud = host.hud, root = document.documentElement;
  let prefs: ControlsPrefs = readControls(host.store), fallback = false, editing = false;
  const save = () => saveControls(host.store, prefs);
  const el = (p: Part) => hud.querySelector<HTMLElement>(PART_SELECTORS[p]) ?? document.querySelector<HTMLElement>(PART_SELECTORS[p]);
  const rect = (e: Element): Box | null => { const r = e.getBoundingClientRect(); return r.width > 1 && r.height > 1 ? { l: r.left, t: r.top, w: r.width, h: r.height } : null; };
  /** The skills group's box is its shown toes, not the container (which also holds Attack and Jump on the paw). */
  const toes = (): Box | null => {
    const boxes = Array.from(hud.querySelectorAll<HTMLElement>('.skills .skill')).map(rect).filter((b): b is Box => !!b);
    if (!boxes.length) return null;
    const l = Math.min(...boxes.map(b => b.l)), t = Math.min(...boxes.map(b => b.t));
    return { l, t, w: Math.max(...boxes.map(b => b.l + b.w)) - l, h: Math.max(...boxes.map(b => b.t + b.h)) - t };
  };
  const partBox = (p: Part) => { const e = el(p); return !e ? null : p === 'skills' ? toes() : rect(e); };
  const view = () => ({ w: innerWidth, h: innerHeight });
  const screen = (): ScreenType => screenType(view(), matchMedia(TOUCH_LAYOUT).matches);
  /** The safe area (notches, home bar) less 4 px of breathing room, from a probe that reads env(safe-area-inset-*). */
  let probe: HTMLElement | null = null;
  const safe = (): Box => {
    if (!probe) { probe = document.createElement('div'); probe.className = 'ctl-safe-probe'; document.body.append(probe); }
    const s = getComputedStyle(probe), px = (v: string) => parseFloat(v) || 0, m = 4;
    const l = px(s.paddingLeft) + m, tp = px(s.paddingTop) + m;
    return { l, t: tp, w: innerWidth - l - px(s.paddingRight) - m, h: innerHeight - tp - px(s.paddingBottom) - m };
  };
  const obstacles = (): Obstacle[] => OBSTACLES.flatMap(([name, sel]) => Array.from(hud.querySelectorAll(sel)).filter(e => !e.closest('[hidden]')).map(rect).filter((b): b is Box => !!b).map(box => ({ name, box })));
  const setPos = (e: HTMLElement, l: number, tp: number) => { e.setAttribute(PLACED, ''); e.style.setProperty('--ctl-x', Math.round(l) + 'px'); e.style.setProperty('--ctl-y', Math.round(tp) + 'px'); };
  const clearPlaced = () => { hud.querySelectorAll(`[${PLACED}]`).forEach(e => { e.removeAttribute(PLACED); (e as HTMLElement).style.removeProperty('--ctl-x'); (e as HTMLElement).style.removeProperty('--ctl-y'); }); hud.classList.remove('ctl-custom'); };
  /** Put each part's box where given. The skills container is moved so its toes land on the box (Attack and Jump inside it are placed on their own first). */
  const placeBoxes = (boxes: Partial<Record<Part, Box>>) => {
    hud.classList.add('ctl-custom');
    for (const p of ['attack', 'jump', 'eat', 'stick'] as const) { const b = boxes[p], e = el(p); if (b && e) setPos(e, b.l, b.t); }
    const b = boxes.skills, c = el('skills');
    if (b && c) { const box = rect(c), u = toes(); if (box && u) setPos(c, b.l - (u.l - box.l), b.t - (u.t - box.t)); }
  };
  const sizes = () => { const out: Partial<Record<Part, { w: number; h: number }>> = {}; for (const p of ['attack', 'jump', 'eat', 'stick', 'skills'] as const) { const b = partBox(p); if (b) out[p] = { w: b.w, h: b.h }; } return out; };
  /** Place the saved layout for this screen type, or fall back to the default when it no longer fits. */
  function place() {
    clearPlaced(); fallback = false;
    const layout = prefs.layouts?.[screen()]; if (!layout || editing) return;
    hud.classList.add('ctl-measure'); // trackers unfolded while measuring: a layout must clear them open, not only folded
    const boxes = fitLayout(layout, sizes(), view(), safe(), obstacles());
    if (boxes) {
      placeBoxes(boxes);
      // Check the placed result too (a part may sit differently than its size predicted, e.g. a container's padding).
      const placed: Partial<Record<Part, Box>> = {}; for (const p of PARTS) { const b = partBox(p); if (b) placed[p] = b; }
      if (layoutConflict(placed, safe(), obstacles(), Object.keys(boxes) as Part[])) { clearPlaced(); fallback = true; }
    } else fallback = true;
    hud.classList.remove('ctl-measure');
  }
  /** Side, size and opacity: one class and two custom properties, then the layout. */
  function apply() {
    const side = skillSide(prefs, host.joystickSide()), size = sizeOf(prefs), alpha = opacityOf(prefs);
    // The older sheets call "paw on the left, stick on the right" #hud.joystick-right; it now follows the skill buttons' side.
    hud.classList.toggle('joystick-right', side === 'left');
    root.style.setProperty('--ctl-scale', String(SIZES[size])); root.style.setProperty('--ctl-alpha', String(alpha / 100));
    hud.classList.toggle('ctl-faded', alpha < 100); hud.classList.toggle('ctl-sized', size !== 'normal');
    place(); watch?.takeRecords();
  }
  // Re-place on what can move the buttons, coalesced to one frame; never while editing.
  let queued = 0;
  const later = () => { if (!queued) queued = requestAnimationFrame(() => { queued = 0; if (!editing) { place(); watch?.takeRecords(); } }); };
  const tokens = (v: string | null) => new Set((v ?? '').split(/\s+/).filter(Boolean));
  const watch = typeof MutationObserver === 'undefined' ? null : new MutationObserver(records => {
    if (!prefs.layouts || !Object.keys(prefs.layouts).length) return;
    for (const r of records) {
      const target = r.target as Element;
      if (r.attributeName === 'hidden') { if (target.hasAttribute('hidden') !== (r.oldValue !== null)) { later(); return; } continue; }
      const now = tokens(target.getAttribute('class')), was = tokens(r.oldValue);
      for (const c of new Set([...now, ...was])) if (now.has(c) !== was.has(c) && WATCHED.test(c)) { later(); return; }
    }
  });
  if (watch) {
    watch.observe(document.body, { attributes: true, attributeFilter: ['class'], attributeOldValue: true });
    watch.observe(hud, { attributes: true, attributeFilter: ['class'], attributeOldValue: true });
    const skills = hud.querySelector('.skills'); if (skills) watch.observe(skills, { attributes: true, subtree: true, attributeFilter: ['class', 'hidden'], attributeOldValue: true });
    const eat = hud.querySelector('.quick-eat'); if (eat) watch.observe(eat, { attributes: true, attributeFilter: ['hidden'], attributeOldValue: true });
  }
  let resized = 0;
  const onResize = () => { if (editing) { endEdit(false); return; } clearTimeout(resized); resized = window.setTimeout(later, 150); };
  addEventListener('resize', onResize); addEventListener('orientationchange', onResize);

  // ---------------------------------------------------------------- keys
  const keyCtx = () => host.keyContext();
  // The HUD asks for key labels every frame (skill caps, the keyboard guide): answers are kept until the keys or their context change.
  let keysVersion = 0, cacheSig = '', cached: { custom: CustomKeys; keys: Record<KeyAction, string[]>; any: boolean } | null = null;
  const resolved = () => {
    const ctx = keyCtx(), sig = `${ctx.layout}|${ctx.air}|${ctx.space}|${keysVersion}`;
    if (!cached || sig !== cacheSig) {
      const preset = ctx.layout === 'classic' ? 'classic' : 'wasd', c = prefs.keys && prefs.keys.preset === preset ? cleanKeys(prefs.keys.map, ctx) : {};
      cacheSig = sig; cached = { custom: c, keys: effectiveKeys(ctx, c), any: Object.keys(c).length > 0 };
    }
    return cached;
  };
  const custom = (): CustomKeys => resolved().custom;
  const keys = () => resolved().keys;
  let listening: KeyAction | null = null, keyStatus = '';
  const rowName = (a: KeyAction) => { const i = a.startsWith('skill') ? Number(a.slice(5)) : -1, n = host.skillNames()[i]; return n ? t(n) : t(({ attack: 'Basic attack', jump: 'Jump', eat: 'Eat', interact: 'Interact' } as Record<string, string>)[a] ?? a); };
  function keysPanel() {
    host.openDialog('controls-keys', t('Keys'), keysPanelHtml(keys(), { listening, status: keyStatus, air: keyCtx().air, skillNames: host.skillNames().map(n => t(n)) }), 'SETTINGS');
    if (listening) document.querySelector<HTMLElement>(`[data-action="ctl-bind"][data-kind="${listening}"]`)?.focus({ preventScroll: true });
  }
  const refusalText: Record<string, string> = { move: '{key} moves the explorer, so it stays as it is.', menu: '{key} opens a menu, so it stays as it is.', system: '{key} is kept for menus and chat.', taken: '{key} is taken, and Jump has no key to swap while jumping is off.' };
  // While a row listens, the next key is caught here before the game or the panel sees it (Escape cancels).
  addEventListener('keydown', event => {
    if (!listening) return;
    event.preventDefault(); event.stopImmediatePropagation();
    if (event.key === 'Escape' || event.code === 'Escape') { listening = null; keyStatus = t('Nothing changed.'); keysPanel(); return; }
    const k = bindingKey({ code: event.code, key: event.key, ctrlKey: event.ctrlKey, metaKey: event.metaKey, altKey: event.altKey });
    if (!k) return; // a lone Ctrl / Alt / Meta: keep listening
    const action = listening, ctx = keyCtx(), result = rebind(custom(), action, k, ctx);
    listening = null;
    if (!result.ok) keyStatus = t(refusalText[result.reason] ?? refusalText.system, { key: keyLabel(k) });
    else {
      prefs.keys = { preset: ctx.layout === 'classic' ? 'classic' : 'wasd', map: result.keys as Record<string, string> }; keysVersion++; save();
      keyStatus = result.swapped ? t('{action} now uses {key}; {other} took {old}.', { action: rowName(action), key: keyLabel(k), other: rowName(result.swapped), old: keyLabel(result.keys[result.swapped] ?? '') }) : t('{action} now uses {key}.', { action: rowName(action), key: keyLabel(k) });
      host.changed();
    }
    keysPanel();
  }, true);

  // ---------------------------------------------------------------- the editor
  let edit: { boxes: Partial<Record<Part, Box>>; moved: Set<Part>; reset: boolean; layer: HTMLElement; bar: HTMLElement; drag: { part: Part; id: number; x: number; y: number; start: Box; target: HTMLElement } | null; refusedAt: number } | null = null;
  const status = (text: string, bad = false) => { if (!edit) return; const s = edit.bar.querySelector('.ctl-status')!; s.textContent = text; s.classList.toggle('bad', bad); };
  const partOf = (target: EventTarget | null): Part | null => {
    const node = target as Element | null; if (!node?.closest) return null;
    for (const p of ['attack', 'jump', 'eat', 'stick', 'skills'] as const) { const e = el(p); if (e && edit?.boxes[p] && (p === 'skills' ? node.closest('.skill') && e.contains(node) : e.contains(node))) return p; }
    return null;
  };
  function drawZones(bad: string[] = []) {
    if (!edit) return;
    const zones = obstacles().map(o => `<i class="ctl-zone${bad.includes(o.name) ? ' bad' : ''}" style="left:${o.box.l - 4}px;top:${o.box.t - 4}px;width:${o.box.w + 8}px;height:${o.box.h + 8}px"></i>`).join('');
    edit.layer.innerHTML = zones;
    for (const p of Object.keys(edit.boxes) as Part[]) el(p)?.classList.toggle('ctl-bad', bad.includes(p));
  }
  function startEdit() {
    if (editing) return;
    if (!host.canEdit()) { host.toast(t('Move buttons out in the open: modes, fishing and the cottage keep their own layout.'), '🎮'); return; }
    host.closeDialog(); editing = true;
    hud.classList.add('ctl-editing', 'ctl-measure');
    const boxes: Partial<Record<Part, Box>> = {};
    for (const p of ['skills', 'attack', 'jump', 'eat', 'stick'] as const) { const b = partBox(p); if (b) boxes[p] = b; }
    placeBoxes(boxes);
    const layer = document.createElement('div'); layer.className = 'ctl-editor-layer'; hud.prepend(layer);
    const bar = document.createElement('div'); bar.className = 'ctl-editor-bar'; bar.setAttribute('role', 'dialog'); bar.setAttribute('aria-label', t('Move buttons'));
    bar.innerHTML = `<strong>${t('Move buttons')}</strong><small class="ctl-where">${t('Layout for {screen}', { screen: t(SCREEN_NAMES[screen()]) })}</small><p class="ctl-status" role="status"></p><div class="ctl-bar-buttons"><button class="text-button" data-ctl="reset">${t('Reset to default')}</button><button class="soft-button" data-ctl="cancel">${t('Cancel')}</button><button class="primary" data-ctl="save">${t('Save')}</button></div>`;
    hud.append(bar);
    edit = { boxes, moved: new Set(prefs.layouts?.[screen()] ? Object.keys(prefs.layouts[screen()]!) as Part[] : []), reset: false, layer, bar, drag: null, refusedAt: 0 };
    for (const p of Object.keys(boxes) as Part[]) el(p)?.setAttribute('data-ctl-part', p);
    drawZones(); status(t('Drag a button to a new place. Dashed boxes are taken.'));
    bar.querySelector<HTMLElement>('[data-ctl="save"]')?.focus({ preventScroll: true });
  }
  function endEdit(keep: boolean) {
    if (!edit) return;
    if (keep) {
      const s = screen(); prefs.layouts = { ...prefs.layouts };
      if (edit.reset) delete prefs.layouts[s];
      else {
        // Only what was moved is kept (an untouched quick-eat keeps following the quest cards as they fold), but a moved skill
        // group pins Attack and Jump too: they sit inside its container and would otherwise travel with it.
        const keep = new Set(edit.moved); if (keep.has('skills')) { keep.add('attack'); keep.add('jump'); }
        const layout: Layout = {}; for (const p of keep) if (edit.boxes[p]) layout[p] = toSpot(edit.boxes[p]!, view());
        if (Object.keys(layout).length) prefs.layouts[s] = layout; else delete prefs.layouts[s];
      }
      save();
    }
    edit.layer.remove(); edit.bar.remove();
    hud.querySelectorAll('[data-ctl-part]').forEach(e => { e.removeAttribute('data-ctl-part'); e.classList.remove('ctl-bad'); });
    hud.classList.remove('ctl-editing', 'ctl-measure', 'ctl-dragging'); edit = null; editing = false;
    apply(); host.changed();
    if (keep) host.toast(fallback ? t("Saved, but it doesn't fit this screen right now.") : t('Button layout saved.'), '🎮');
  }
  function resetEdit() {
    if (!edit) return;
    clearPlaced();
    const boxes: Partial<Record<Part, Box>> = {};
    for (const p of Object.keys(edit.boxes) as Part[]) { const b = partBox(p); if (b) boxes[p] = b; }
    edit.boxes = boxes; edit.reset = true; edit.moved.clear(); placeBoxes(boxes); drawZones(); status(t('Back to the default layout. Save to keep it.'));
  }
  const others = (part: Part): Obstacle[] => [...obstacles(), ...(Object.keys(edit!.boxes) as Part[]).filter(p => p !== part).map(p => ({ name: p, box: edit!.boxes[p]! }))];
  const named = (hits: string[]) => hits.map(h => t(NAMES[h] ?? h)).join(', ');
  const moveTo = (part: Part, box: Box) => {
    const e = el(part); if (!e) return;
    if (part === 'skills') { const c = rect(e), u = toes(); if (c && u) setPos(e, box.l - (u.l - c.l), box.t - (u.t - c.t)); }
    else setPos(e, box.l, box.t);
  };
  addEventListener('pointerdown', event => {
    if (!edit) return;
    if ((event.target as Element).closest?.('.ctl-editor-bar')) return;
    event.preventDefault(); event.stopImmediatePropagation();
    const part = partOf(event.target); if (!part || edit.drag) return;
    const target = el(part)!; try { target.setPointerCapture(event.pointerId); } catch { /* synthetic events */ }
    edit.drag = { part, id: event.pointerId, x: event.clientX, y: event.clientY, start: edit.boxes[part]!, target };
    hud.classList.add('ctl-dragging'); status(t('Moving {what}…', { what: t(NAMES[part]) }));
  }, true);
  addEventListener('pointermove', event => {
    const d = edit?.drag; if (!edit || !d || event.pointerId !== d.id) return;
    event.preventDefault(); event.stopImmediatePropagation();
    const box = dragTo(d.start, event.clientX - d.x, event.clientY - d.y, safe()), hits = conflictsOf(box, safe(), others(d.part));
    moveTo(d.part, box); edit.boxes[d.part] = box; drawZones(hits);
    if (hits.length) status(t('Over {what}: let go somewhere free.', { what: named(hits) }), true); else status(t('Moving {what}…', { what: t(NAMES[d.part]) }));
  }, true);
  const drop = (event: PointerEvent) => {
    const d = edit?.drag; if (!edit || !d || event.pointerId !== d.id) return;
    event.preventDefault(); event.stopImmediatePropagation();
    try { d.target.releasePointerCapture(d.id); } catch { /* already released */ }
    const box = edit.boxes[d.part]!, hits = conflictsOf(box, safe(), others(d.part));
    edit.drag = null; hud.classList.remove('ctl-dragging');
    if (hits.length && event.type !== 'pointercancel') {
      // Refused: it goes back where it was, and the bar says what it would have covered (the zones stay red a moment).
      edit.boxes[d.part] = d.start; moveTo(d.part, d.start); drawZones(hits); status(t('Not there: it would cover {what}.', { what: named(hits) }), true);
      const at = edit.refusedAt = performance.now(); setTimeout(() => { if (edit && edit.refusedAt === at) drawZones(); }, 1400);
    } else if (hits.length) { edit.boxes[d.part] = d.start; moveTo(d.part, d.start); drawZones(); }
    else { edit.reset = false; edit.moved.add(d.part); drawZones(); status(t('Placed. Save when you like it.')); }
  };
  addEventListener('pointerup', drop, true); addEventListener('pointercancel', drop, true);
  // Taps in the editor never press the game's buttons; the bar's own buttons work.
  addEventListener('click', event => {
    if (!edit) return;
    const b = (event.target as Element).closest?.<HTMLElement>('.ctl-editor-bar [data-ctl]');
    if (!b && !(event.target as Element).closest?.('.ctl-editor-bar')) { event.preventDefault(); event.stopImmediatePropagation(); return; }
    if (!b) return;
    event.preventDefault(); event.stopImmediatePropagation();
    if (b.dataset.ctl === 'save') endEdit(true); else if (b.dataset.ctl === 'cancel') endEdit(false); else if (b.dataset.ctl === 'reset') resetEdit();
  }, true);
  addEventListener('keydown', event => { if (edit && event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); endEdit(false); } }, true);

  const api = {
    get editing() { return editing; }, get listening() { return listening !== null; }, get prefs() { return prefs; },
    side: () => skillSide(prefs, host.joystickSide()), apply,
    /** For Settings (controls-html.ts). */
    view(): ControlsView {
      const s = screen(), k = custom();
      return { side: api.side(), size: sizeOf(prefs), opacity: opacityOf(prefs), joystick: host.joystickOn(), screen: s, custom: !!prefs.layouts?.[s], fallback, pc: matchMedia('(any-pointer: fine)').matches, keys: keys(), customKeys: Object.keys(k).length > 0 };
    },
    /** Settings buttons with data-action="ctl-…"; true when handled. */
    click(action: string, button: HTMLElement): boolean {
      const kind = button.dataset.kind;
      switch (action) {
        case 'ctl-side': if (kind === 'left' || kind === 'right') { prefs.side = kind; save(); apply(); host.changed(); host.settings(); } return true;
        case 'ctl-size': if (kind === 'small' || kind === 'normal' || kind === 'large') { prefs.size = kind; save(); apply(); host.changed(); host.settings(); } return true;
        case 'ctl-opacity': { const n = Number(kind); if (n === 100 || n === 80 || n === 60) { prefs.opacity = n; save(); apply(); host.settings(); } return true; }
        case 'ctl-edit': startEdit(); return true;
        case 'ctl-keys': listening = null; keyStatus = ''; keysPanel(); return true;
        case 'ctl-bind': listening = kind as KeyAction; keyStatus = t('Press the new key for {action}. Escape cancels.', { action: rowName(listening) }); keysPanel(); return true;
        case 'ctl-keys-reset': listening = null; delete prefs.keys; keysVersion++; save(); keyStatus = t('Keys are back to the {preset} preset.', { preset: keyCtx().layout === 'classic' ? t('Arrows + QWER') : t('WASD + JKL;') }); host.changed(); keysPanel(); return true;
        case 'ctl-keys-back': listening = null; host.settings(); return true;
      }
      return false;
    },
    /** Picking a preset (PC keyboard layout) starts the keys over from it. */
    presetChosen() { if (prefs.keys) { delete prefs.keys; keysVersion++; save(); } },
    /** The keys for the keyboard guide when any are custom, else undefined (the guide shows the preset as always). */
    customKeys: () => resolved().any ? resolved().keys : undefined,
    keys, custom,
    /** A pressed key as main.ts's handler should read it (controls-keys.ts translateKey): null = blocked. */
    translate: (key: string, code: string) => translateKey(key, code, keyCtx(), custom()),
    bindingKey,
    jumpUp: (event: KeyboardEvent) => jumpKeyUp(bindingKey(event), keyCtx(), custom()),
    label: (a: KeyAction) => { const k = keys()[a]; return k.length ? k.map(keyLabel).join(' / ') : ''; },
    /** The skills' part box etc. for tests and the layout check. */
    partBox, screen,
  };
  return api;
}
export type Controls = ReturnType<typeof initControls>;
