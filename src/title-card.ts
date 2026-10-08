import * as T from 'three';
import { cameraOffset } from './camera-rig.ts';
import { installButtonHtml } from './install-app.ts';

/**
 * The title: a short card floating over the live village (the reference's title: logo, one-line tagline, name, six
 * colours, a big Play button, then install / full screen / settings links), with the camera swaying slowly around the
 * explorer behind it. Save profiles wait behind a small "Profiles" link instead of filling the card.
 *
 * Kept ids and classes: #title-screen, #name-input, .color-picker [data-action=color], the start button is the first
 * `button.primary` in #title-screen (the browser tests click it), #online-link and the profile buttons [data-action=profile].
 */
export interface TitleCardParts {
  name: string; color: string; colors: readonly string[]; colorNames: readonly string[]; returning: boolean;
  language: string; profiles: string; online?: string; esc: (value: string) => string; t: (text: string) => string;
}
export function titleCardHtml(p: TitleCardParts) {
  const { esc, t } = p;
  return `<div id="title-screen" class="title-live"><div class="title-shade"></div>`
    + `<div class="title-stack"><div class="title-logo"><h1><span class="brand-sprout" aria-hidden="true">🌱</span>Zoo <em data-i18n-skip>Garden</em></h1><p class="title-tagline">${esc(t('Grow a garden · Catch fish · Battle monsters · Fly to new planets'))}</p></div>`
    + `<div class="welcome-card title-card"><div class="welcome-form"><label for="name-input" class="vh">${esc(t('Your name'))}</label><div class="title-row"><input id="name-input" aria-label="${esc(t('Your character name'))}" maxlength="20" value="${esc(p.name)}" placeholder="${esc(t('Your name'))}" autocomplete="off">`
    + `<fieldset class="color-picker"><legend>${esc(t('Pick your favorite color'))}</legend>${p.colors.map((c, i) => `<button type="button" data-action="color" data-color="${c}" style="--swatch:${c}" class="${p.color === c ? 'selected' : ''}" aria-label="${esc(t(p.colorNames[i] ?? c))}" aria-pressed="${p.color === c}"></button>`).join('')}</fieldset></div>`
    + `<button class="primary start-button" data-action="start"><span aria-hidden="true">▶</span> ${esc(t(p.returning ? 'Continue adventure' : 'Let’s play'))}</button></div>`
    + `<div class="title-links"><button type="button" class="title-link" data-action="title-profiles" aria-expanded="false" aria-controls="title-profiles">👤 ${esc(t('Profiles'))}</button>${installButtonHtml(t, 'title-link install-app')}${p.language}</div>`
    + `<div id="title-profiles" class="title-profiles" hidden>${p.profiles}</div>${p.online ?? ''}</div></div></div>`;
}
/** Shows or hides the profile picker under the card. */
export function toggleProfiles(root: ParentNode = document) {
  const panel = root.querySelector<HTMLElement>('#title-profiles'), link = root.querySelector<HTMLElement>('[data-action="title-profiles"]');
  if (!panel) return; panel.hidden = !panel.hidden; link?.setAttribute('aria-expanded', String(!panel.hidden));
}

/**
 * The idle camera behind the title: the usual follow view swung slowly around the explorer (±0.5 rad over ~42 s, so
 * the light and the scenery culling, which expect the play view, stay right) and aimed a little in front of the hero,
 * so it stands above the card. On Play the normal view is put back.
 */
export function titleOrbit(world: { camera: T.PerspectiveCamera; zoom: number; viewOffset: T.Vector3; cameraFocus: T.Vector3 | null; position: T.Vector3 }, started: () => boolean) {
  const up = new T.Vector3(0, 1, 0), focus = new T.Vector3(); let time = 0, active = false;
  return (dt: number) => {
    if (started()) {
      if (active) { active = false; cameraOffset(world.camera.aspect, world.zoom, world.viewOffset); if (world.cameraFocus === focus) world.cameraFocus = null; }
      return;
    }
    active = true; time += Math.min(dt, .1);
    cameraOffset(world.camera.aspect, world.zoom, world.viewOffset).applyAxisAngle(up, Math.sin(time * .15) * .5);
    // Aim between the hero and the camera: the hero then sits in the upper half of the screen, above the card.
    focus.set(world.viewOffset.x, 0, world.viewOffset.z).normalize().multiplyScalar(world.camera.aspect < 1 ? 3.2 : 2.4).add(world.position);
    world.cameraFocus = focus;
  };
}
