/**
 * The drawn side of the first-30-minutes guidance (rules live in guide.ts): the pulsing pointer on the nearest empty
 * garden bed (a ring and bobbing arrow in the world, and an edge arrow while the bed is off screen) and the space
 * HUD's Return home button.
 */
import * as T from 'three';
import { t } from './i18n.ts';
import type { World } from './world.ts';
import type { SaveState } from './model.ts';
import { nearestEmptyBed, needsGardenGuide, edgeArrow, homeButtonUrgent, isTouch } from './guide.ts';
import './guide.css';

interface GardenGuideHost { world: World; hud: HTMLElement; state: () => SaveState; bedAt: (i: number) => { x: number; z: number }; active: () => boolean }

export function mountGardenGuide(host: GardenGuideHost) {
  const group = new T.Group(); group.visible = false; group.renderOrder = 50;
  const gold = new T.MeshBasicMaterial({ color: '#ffd23f', transparent: true, opacity: .85, depthWrite: false, depthTest: false, side: T.DoubleSide });
  const ring = new T.Mesh(new T.RingGeometry(1.15, 1.5, 40), gold); ring.rotation.x = -Math.PI / 2; ring.renderOrder = 50;
  const arrow = new T.Mesh(new T.ConeGeometry(.42, .9, 16), gold); arrow.rotation.x = Math.PI; arrow.renderOrder = 51;
  group.add(ring, arrow); host.world.scene.add(group);
  const pointer = document.createElement('div'); pointer.id = 'guide-pointer'; pointer.hidden = true; pointer.setAttribute('aria-hidden', 'true');
  pointer.innerHTML = '<span class="gp-arrow">➤</span><span class="gp-label"></span>';
  host.hud.append(pointer);
  const label = pointer.querySelector<HTMLElement>('.gp-label')!, arrowEl = pointer.querySelector<HTMLElement>('.gp-arrow')!;
  let time = 0, shownText = '';
  return {
    frame(dt: number) {
      time += dt;
      const s = host.state(), on = host.active() && needsGardenGuide(s);
      const bed = on ? nearestEmptyBed(s.plots, host.bedAt, host.world.position) : null;
      group.visible = !!bed; pointer.hidden = !bed;
      if (!bed) return;
      const pulse = 1 + Math.sin(time * 4.2) * .12;
      group.position.set(bed.x, .12, bed.z); ring.scale.setScalar(pulse); arrow.position.y = 2.4 + Math.sin(time * 4.2) * .35;
      const text = t(isTouch() ? '🌱 Tap a bed to plant' : '🌱 Click a bed to plant');
      if (text !== shownText) { shownText = text; label.textContent = text; }
      const p = host.world.screen(bed.x, 1.2, bed.z), w = innerWidth, h = innerHeight;
      const inside = p.front && p.x > 40 && p.x < w - 40 && p.y > 150 && p.y < h - 150;
      if (inside) { pointer.classList.remove('edge'); pointer.style.transform = `translate(${p.x.toFixed(0)}px, ${(p.y - 78).toFixed(0)}px)`; arrowEl.style.transform = 'rotate(90deg)'; return; }
      const e = edgeArrow(p.x, p.y, w, h, 70, p.front); pointer.classList.add('edge');
      const half = (label.offsetWidth || 220) / 2 + 6, centre = e.x + 8, shift = Math.min(w - half, Math.max(half, centre)) - centre; pointer.style.setProperty('--gp-shift', `${shift.toFixed(0)}px`);
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
