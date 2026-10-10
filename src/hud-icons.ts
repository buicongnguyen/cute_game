/**
 * Zoo Garden's own HUD icon set (stage 2 of docs/QUALITY-PLAN.md): one hand-drawn style for the dock, the Home tab, the
 * attack pad and the four starting skills. Every icon is a 24 x 24 inline SVG with a plum ink outline (round joins) and flat
 * warm fills, so the screen reads as one family instead of a row of mixed emoji.
 *
 * Buttons that other modules create with text (Play together, Neighbours, full screen, install) keep their text for
 * screen readers and tests; hud-ours.css paints the matching drawing over them from the CSS variables set by
 * publishHudIcons() (--hi-friends and so on), so there is one source for every drawing.
 */
const INK = '#3a2433';
const ATTRS = `viewBox="0 0 24 24" fill="none" stroke="${INK}" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"`;
const wrap = (body: string) => `<svg class="hi" ${ATTRS} aria-hidden="true" focusable="false">${body}</svg>`;

const BODIES = {
  /** A satchel with a flap and a brass clasp. */
  bag: `<path d="M8 8.6V7a4 4 0 0 1 8 0v1.6"/><path d="M4.8 8.6h14.4l1 9.6a2 2 0 0 1-2 2.3H5.8a2 2 0 0 1-2-2.3z" fill="#ff8a2a"/><path d="M4.4 12.4c2.4 1.7 5 2.4 7.6 2.4s5.200-.7 7.600-2.400" fill="none"/><rect x="10.200" y="12.600" width="3.600" height="4" rx="1" fill="#ffe08a"/>`,
  /** An open journal with a ribbon. */
  journal: `<path d="M12 6.600C10 5.100 6.500 4.700 3.500 5.600v12.600c3-.9 6.500-.5 8.500 1 2-1.500 5.500-1.900 8.500-1V5.600c-3-.9-6.500-.5-8.500 1z" fill="#fff6e0"/><path d="M12 6.600v12.600"/><path d="M6 9.600c1.300-.3 2.600-.2 3.800.2M6 12.900c1.300-.3 2.600-.2 3.800.2" stroke-width="1.200"/><path d="M15.300 5.300v6.400l1.600-1.400 1.600 1.400V5.100" fill="#ff5d8c"/>`,
  /** A prize rosette. */
  ranking: `<path d="M8.300 13.800 6.600 21l3.200-1.500L12 22l2.200-2.500 3.200 1.500-1.700-7.200" fill="#ff5d8c"/><circle cx="12" cy="9.300" r="6.300" fill="#ffc93a"/><path d="m12 5.900 1.050 2.150 2.350.35-1.700 1.650.4 2.350L12 11.300l-2.100 1.100.4-2.350-1.700-1.650 2.350-.35z" fill="#fff6e0" stroke-width="1.100"/>`,
  /** A notice sheet. */
  news: `<path d="M17.200 9h3.300v9a2 2 0 0 1-2 2" fill="#ffc93a"/><path d="M4.500 4h11.700a1 1 0 0 1 1 1v13a2 2 0 0 0 2 2H6.500a2 2 0 0 1-2-2z" fill="#fff6e0"/><rect x="7.300" y="7" width="3.600" height="3.600" rx=".8" fill="#ff8a2a" stroke-width="1.200"/><path d="M13 7.500h1.700M13 10.200h1.700M7.500 13.500h7.200M7.500 16.500h5" stroke-width="1.300"/>`,
  /** Two friends. */
  friends: `<path d="M14.800 13.200c3.700-.7 6.200 1.500 6.500 5.300h-5.500" fill="#7fd1ff"/><circle cx="16.400" cy="8.100" r="2.800" fill="#7fd1ff"/><path d="M2.700 19.700c.3-3.500 2.600-5.500 5.800-5.500s5.500 2 5.800 5.500z" fill="#ffb45e"/><circle cx="8.500" cy="8.900" r="3.300" fill="#ffb45e"/>`,
  /** A sprout (the solo edition's note). */
  sprout: `<path d="M12 21v-9"/><path d="M12 13.500C12 9.500 9.300 7 4.500 7c0 4.200 2.700 6.800 7.500 6.500z" fill="#7ed957"/><path d="M12 11c0-3.800 2.500-6 7-6 0 4-2.500 6.400-7 6z" fill="#4cc93a"/><path d="M8 21h8" stroke-width="2"/>`,
  /** Two cottages. */
  neighbours: `<path d="M12.300 20v-7.300l4.600-4 4.600 4V20z" fill="#ff9db8"/><path d="M2.500 20v-8.800l5.200-4.600 5.200 4.600V20z" fill="#ffe08a"/><path d="M6.300 20v-4h2.900v4" fill="#ff8a2a" stroke-width="1.300"/><path d="M16 15.500h1.900" stroke-width="1.500"/>`,
  /** A speech bubble with a question mark. */
  help: `<path d="M4 6.500A2.500 2.500 0 0 1 6.500 4h11A2.500 2.500 0 0 1 20 6.500v8a2.500 2.500 0 0 1-2.500 2.500H12l-4 3.500V17H6.500A2.500 2.500 0 0 1 4 14.500z" fill="#7fd1ff"/><path d="M9.800 8.700a2.300 2.300 0 1 1 3.400 2c-.8.500-1.200.9-1.200 1.700"/><circle cx="12" cy="14.400" r=".5" fill="${INK}"/>`,
  /** A cog. */
  settings: `<g transform="translate(12 12) scale(.9) translate(-12 -12.900)"><path d="M10.300 3h3.400l.5 2.300 1.600.7 2-1.300 2.400 2.400-1.300 2 .7 1.600 2.300.5v3.400l-2.300.5-.7 1.600 1.300 2-2.400 2.400-2-1.300-1.600.7-.5 2.300h-3.400l-.5-2.300-1.600-.7-2 1.300-2.400-2.400 1.300-2-.7-1.600-2.300-.5v-3.400l2.300-.5.7-1.600-1.300-2 2.400-2.400 2 1.300 1.600-.7z" fill="#c9b6ff"/><circle cx="12" cy="12.900" r="3.100" fill="#fff6e0"/></g>`,
  /** Four corner brackets. */
  fullscreen: `<path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5" stroke-width="2.300"/>`,
  /** A phone with a down arrow. */
  install: `<rect x="6.500" y="2.500" width="11" height="19" rx="2.500" fill="#fff6e0"/><path d="M12 7v7M9 11.500l3 3 3-3" stroke-width="2"/><path d="M10.500 18.500h3" stroke-width="1.400"/>`,
  /** A cottage. */
  home: `<path d="M5.300 11v9.300h13.400V11L12 5z" fill="#fff6e0"/><path d="M9.800 20.300v-5.100h4.400v5.100" fill="#ffb45e"/><path d="M2.800 12.300 12 4l9.200 8.300" stroke="#ff5d8c" stroke-width="3.400"/><path d="M2.800 12.300 12 4l9.200 8.300" stroke-width="1.200" transform="translate(0 -1.900)"/>`,
  /** The energy spark. */
  bolt: `<path d="M13.600 2.500 5 13.600h5.600l-1.100 7.900L18.600 10h-5.500z" fill="#ffc93a"/>`,
  /** The attack pad: three claw strokes. */
  attack: `<path d="M5.200 4.500c3.900 3.200 5.800 8 5.300 14.700M11.200 3.300c4.100 3.700 5.700 8.800 5 15.800M17 5c2.600 3.100 3.300 6.900 2.600 11" stroke="${INK}" stroke-width="4.600"/><path d="M5.200 4.500c3.900 3.200 5.800 8 5.300 14.700M11.200 3.300c4.100 3.700 5.700 8.800 5 15.800M17 5c2.600 3.100 3.300 6.900 2.600 11" stroke="#fff6e0" stroke-width="2.300"/>`,
  // ---- The four starting skills
  /** Petal Gale: four petals turning around a golden heart. */
  gale: `<g fill="#fff6e0"><path d="M12 11.200C9.500 9.800 9 6 11.600 2.800c3 1.900 3.500 5.800.4 8.400z"/><path d="M12.800 12c1.400-2.500 5.200-3 8.400-.4-1.900 3-5.800 3.500-8.400.4z"/><path d="M12 12.800c2.500 1.400 3 5.200.4 8.400-3-1.900-3.500-5.800-.4-8.400z"/><path d="M11.200 12c-1.400 2.500-5.200 3-8.400.4 1.900-3 5.800-3.500 8.400-.4z"/></g><circle cx="12" cy="12" r="2.100" fill="#ffc93a"/><path d="M4.300 5.800c1-1.500 2.400-2.600 4-3.200M19.700 18.200c-1 1.500-2.400 2.600-4 3.200" stroke="#fff6e0" stroke-width="1.500"/>`,
  /** Breeze Step: a leaf darting forward on three wind lines. */
  breeze: `<path d="M2.500 8.500h6M2 12.500h4.500M3.500 16.500h5" stroke="#fff6e0" stroke-width="1.900"/><path d="M9.500 17.500C8 11.500 12 5.500 21.500 4.500c.5 8.500-4 13.500-12 13z" fill="#fff6e0"/><path d="M9.500 17.500c3-4.500 6.500-8 10-11" stroke-width="1.300"/>`,
  /** Root Quake: a boulder landing on cracked ground. */
  quake: `<path d="M6.500 12.500 8 6.800l5-2.300 4.300 2.700 1.200 5.300z" fill="#fff6e0"/><path d="M10.500 7.500 13 9l-1 3" stroke-width="1.200"/><path d="M2.500 13h19l-2.200 4.200-3.300.6-1.700 3-3.800-1.900-3.300 1.600-1.200-3.200-3.300-.8z" fill="#ffe08a"/><path d="M12 13v2.800l-2 1.500M15.500 13l1 2.500" stroke-width="1.300"/><path d="M3 9.300 4.500 8M21 9.300 19.500 8M2.500 5.500l1 .5M21.500 5.500l-1 .5" stroke="#fff6e0" stroke-width="1.700"/>`,
  /** Paw Storm: a paw print with speed strokes. */
  paw: `<g fill="#fff6e0"><ellipse cx="6.300" cy="10.300" rx="1.900" ry="2.500" transform="rotate(-22 6.300 10.300)"/><ellipse cx="10.300" cy="6.400" rx="1.900" ry="2.600" transform="rotate(-8 10.300 6.400)"/><ellipse cx="15" cy="6.600" rx="1.900" ry="2.600" transform="rotate(10 15 6.600)"/><ellipse cx="18.600" cy="10.900" rx="1.900" ry="2.500" transform="rotate(24 18.600 10.900)"/><path d="M12.500 11.300c2.800 0 5 2.600 5 5.200 0 2.300-1.700 3.300-3 3.300-.9 0-1.400-.4-2-.4s-1.200.4-2.100.4c-1.400 0-2.900-1.100-2.900-3.200 0-2.700 2.200-5.300 5-5.300z"/></g>`,
} as const;
export type HudIconName = keyof typeof BODIES;

/** The inline SVG for a HUD icon. */
export const hudIcon = (name: HudIconName) => wrap(BODIES[name]);

/** Drawings for skills by their catalog name; a skill without one keeps its emoji (weapon specials, disguise kits). */
const SKILL_ART: Record<string, HudIconName> = { 'Petal Gale': 'gale', 'Breeze Step': 'breeze', 'Root Quake': 'quake', 'Paw Storm': 'paw' };
/** The skill button's picture: our drawing for the four starting skills, otherwise null (the caller shows the emoji). */
export const skillArt = (name: string): string | null => { const key = SKILL_ART[name]; return key ? hudIcon(key) : null; };

/** A drawing as a CSS url() value, for buttons painted from the stylesheet. */
export const hudIconUrl = (name: HudIconName) => `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" ${ATTRS}>${BODIES[name]}</svg>`)}")`;

/** Publishes the drawings hud-ours.css paints over text-made dock buttons. Called once at start-up. */
export function publishHudIcons(root: HTMLElement = document.documentElement) {
  for (const name of ['friends', 'sprout', 'neighbours', 'fullscreen', 'install'] as const) root.style.setProperty(`--hi-${name}`, hudIconUrl(name));
}
