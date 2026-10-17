/**
 * The drawn side of the first-30-minutes guidance (rules live in guide.ts): the pulsing pointer on the nearest empty
 * garden bed (a ring and bobbing arrow in the world, and an edge arrow while the bed is off screen) and the space
 * HUD's Return home button. In Chapter 1 of a new save the same pointer shows the next step's place by itself (`goal`,
 * FIX-PLAN 4.6): the market, the outfitters, a creature to defeat. Its × turns this automatic pointing off for the save
 * (`setOff`); a tap on the quest tracker turns it back on.
 */
import * as T from 'three';
import { t } from './i18n.ts';
import type { World } from './world.ts';
import type { SaveState } from './model.ts';
import { GUIDE_SECONDS, GARDEN_GUIDE, nearestEmptyBed, needsGardenGuide, edgeArrow, homeButtonUrgent, isTouch } from './guide.ts';
import './guide.css';

export interface GuideGoal { x: number; z: number; label: string }
interface GardenGuideHost {
  world: World; hud: HTMLElement; state: () => SaveState; bedAt: (i: number) => { x: number; z: number }; active: () => boolean;
  /** Chapter 1's next place when there is no bed to point at (null: none). */
  goal?: () => GuideGoal | null;
  key?: () => string;
  /** A moment tip is up near the target: the label steps back while the target is on screen (the ring stays). */
  quiet?: () => boolean;
  /** The player turned the pointer off with its ×. */
  off?: () => boolean; setOff?: () => void;
}

export function mountGardenGuide(host: GardenGuideHost) {
  const group = new T.Group(); group.visible = false; group.renderOrder = 50;
  const gold = new T.MeshBasicMaterial({ color: '#ffd23f', transparent: true, opacity: .85, depthWrite: false, depthTest: false, side: T.DoubleSide });
  const ring = new T.Mesh(new T.RingGeometry(1.15, 1.5, 40), gold); ring.rotation.x = -Math.PI / 2; ring.renderOrder = 50;
  const arrow = new T.Mesh(new T.ConeGeometry(.42, .9, 16), gold); arrow.rotation.x = Math.PI; arrow.renderOrder = 51;
  group.add(ring, arrow); host.world.scene.add(group);
  const pointer = document.createElement('div'); pointer.id = 'guide-pointer'; pointer.hidden = true;
  pointer.innerHTML = '<span class="gp-arrow" aria-hidden="true">➤</span><span class="gp-label"><span class="gp-text" aria-hidden="true"></span><button type="button" class="gp-off"><i aria-hidden="true">×</i></button></span>';
  host.hud.append(pointer);
  const label = pointer.querySelector<HTMLElement>('.gp-label')!, textEl = pointer.querySelector<HTMLElement>('.gp-text')!, arrowEl = pointer.querySelector<HTMLElement>('.gp-arrow')!, offEl = pointer.querySelector<HTMLButtonElement>('.gp-off')!;
  offEl.addEventListener('click', event => { event.stopPropagation(); host.setOff?.(); pointer.hidden = true; group.visible = false; });
  let time = 0, shownText = '', visibleSeconds = 0, saveKey = '';
  let previouslyOff = true;
  return {
    frame(dt: number) {
      time += dt;
      const key = host.key?.() ?? '';
      if (key !== saveKey) {
        saveKey = key; previouslyOff = !!host.off?.();
        try { visibleSeconds = Math.max(0, Math.min(GUIDE_SECONDS, Number(localStorage.getItem('zoo-guide-seconds:' + key)) || 0)); } catch { visibleSeconds = 0; }
      }
      const off = !!host.off?.();
      if (previouslyOff && !off) visibleSeconds = 0; // An explicit quest-tracker tap grants another short hint.
      previouslyOff = off;
      const s = host.state(), on = host.active() && !host.off?.();
      const near = on && needsGardenGuide(s) ? nearestEmptyBed(s.plots, host.bedAt, host.world.position) : null, at = host.world.position;
      const bed = near && Math.hypot(near.x - at.x, near.z - at.z) <= GARDEN_GUIDE.reach ? near : null; // out in the wilds it would only point off screen
      const goal: GuideGoal | null = bed ? { x: bed.x, z: bed.z, label: isTouch() ? '🌱 Tap a bed to plant' : '🌱 Click a bed to plant' } : on ? host.goal?.() ?? null : null;
      group.visible = !!goal; pointer.hidden = !goal;
      if (!goal) return;
      const beforeSecond = Math.floor(visibleSeconds);
      visibleSeconds += Math.max(0, dt);
      if (Math.floor(visibleSeconds) !== beforeSecond) {
        try { localStorage.setItem('zoo-guide-seconds:' + key, String(Math.min(GUIDE_SECONDS, visibleSeconds))); } catch { /* Session-only when storage is unavailable. */ }
      }
      if (visibleSeconds >= GUIDE_SECONDS) { host.setOff?.(); pointer.hidden = true; group.visible = false; return; }
      const pulse = 1 + Math.sin(time * 4.2) * .12;
      group.position.set(goal.x, .12, goal.z); ring.scale.setScalar(pulse); arrow.position.y = 2.4 + Math.sin(time * 4.2) * .35;
      const text = t(goal.label);
      if (text !== shownText) { shownText = text; textEl.textContent = text; offEl.setAttribute('aria-label', t('Hide the way pointer')); offEl.title = t('Hide the way pointer'); }
      const p = host.world.screen(goal.x, 1.2, goal.z), w = innerWidth, h = innerHeight;
      const inside = p.front && p.x > 40 && p.x < w - 40 && p.y > 150 && p.y < h - 150;
      if (inside) { if (host.quiet?.()) { pointer.hidden = true; return; } pointer.classList.remove('edge'); pointer.style.transform = `translate(${p.x.toFixed(0)}px, ${(p.y - 78).toFixed(0)}px)`; arrowEl.style.transform = 'rotate(90deg)'; return; }
      const e = edgeArrow(p.x, p.y, w, h, 70, p.front); pointer.classList.add('edge');
      const half = (label.offsetWidth || 220) / 2 + 14, centre = e.x + 8, shift = Math.min(w - half - 28, Math.max(half, centre)) - centre; /* room for the × past the label's end */ pointer.style.setProperty('--gp-shift', `${shift.toFixed(0)}px`);
      pointer.style.transform = `translate(${e.x.toFixed(0)}px, ${e.y.toFixed(0)}px)`; arrowEl.style.transform = `rotate(${e.angle.toFixed(3)}rad)`;
    },
  };
}

/** The space HUD's Return home button: always there in flight, big and pulsing when the tank is nearly dry or the ship is at the edge. */
export function mountSpaceHome(hud: HTMLElement) {
  const button = document.createElement('button'); button.id = 'space-home'; button.dataset.action = 'space-home'; button.hidden = true;
  button.innerHTML = '<span class="sh-icon">🏠</span><span class="sh-text"></span>';
  hud.append(button); const text = button.querySelector<HTMLElement>('.sh-text')!; let key = '';
  return {
    update(flight: { fuel: number; x: number; z: number; autopilot: unknown; landing: unknown } | null) {
      const show = !!flight && !flight.autopilot && !flight.landing; button.hidden = !show; if (!flight || !show) return;
      const urgent = homeButtonUrgent(flight), next = urgent ? 'urgent' : 'calm';
      if (next !== key) { key = next; button.classList.toggle('urgent', urgent); text.textContent = t(urgent ? 'Return home · auto-pilot' : 'Return home'); }
    },
  };
}

/** Marks every scrollable tab row (.panel-tabs) that still has tabs off to the right, so guide.css can show a chevron there. */
export function watchTabScroll(body: HTMLElement) {
  const update = (row: HTMLElement) => row.classList.toggle('has-more', row.scrollWidth > row.clientWidth + 4 && row.scrollLeft + row.clientWidth < row.scrollWidth - 4);
  const scan = () => body.querySelectorAll<HTMLElement>('.panel-tabs').forEach(row => {
    if (!row.dataset.cue) { row.dataset.cue = '1'; row.addEventListener('scroll', () => update(row), { passive: true }); }
    update(row);
  });
  new MutationObserver(scan).observe(body, { childList: true });
  addEventListener('resize', scan);
  scan();
}
