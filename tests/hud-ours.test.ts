// Stage 2 of docs/QUALITY-PLAN.md: our own HUD arrangement, icon set and starting-skill names.
// The measured layout (overlaps, tap targets, every screen size) is checked in the browser by tests/hud-layout.test.mjs
// and promo/hud-probe.mjs; these tests pin the rules that make it hold, without a browser.
import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { hudIcon, hudIconUrl, skillArt, type HudIconName } from '../src/hud-icons.ts';
import { dockMetrics } from '../src/hud-layout.ts';
import { BASE_SKILLS, SPECIALS } from '../src/combat.ts';
import { t, setLanguage, loadVietnamese } from '../src/i18n.ts';
afterEach(() => setLanguage('en'));
const read = (file: string) => readFileSync(new URL(`../src/${file}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const css = read('hud-ours.css');
const ICONS: HudIconName[] = ['bag', 'journal', 'ranking', 'news', 'friends', 'sprout', 'neighbours', 'help', 'settings', 'fullscreen', 'install', 'home', 'bolt', 'attack', 'gale', 'breeze', 'quake', 'paw'];

test('the icon set: every drawing is one inline SVG in the same ink, hidden from screen readers, with no emoji', () => {
  for (const name of ICONS) {
    const svg = hudIcon(name);
    assert.match(svg, /^<svg class="hi" viewBox="0 0 24 24" [^>]*stroke="#3a2433"[^>]*aria-hidden="true" focusable="false">.+<\/svg>$/s, name);
    assert.equal(svg.match(/<svg/g)?.length, 1, name);
    assert.doesNotMatch(svg, /\p{Extended_Pictographic}/u, `${name} holds an emoji`);
    assert.doesNotMatch(svg, /<script|href=|url\(/, `${name} must be self-contained`);
    assert.match(hudIconUrl(name), /^url\("data:image\/svg\+xml,%3Csvg%20xmlns/, name);
  }
});

test('the four starting skills carry our own names and drawings; their numbers are unchanged', () => {
  assert.deepEqual(BASE_SKILLS.map(s => [s.name, s.cd]), [['Petal Gale', 7], ['Breeze Step', 4], ['Root Quake', 9]]);
  assert.deepEqual([SPECIALS.fist.name, SPECIALS.fist.cd], ['Paw Storm', 6]);
  for (const skill of [...BASE_SKILLS, SPECIALS.fist]) assert.match(skillArt(skill.name) ?? '', /^<svg/, `${skill.name} has a drawing`);
  // Other weapon specials and disguise kits keep their emoji.
  assert.equal(skillArt(SPECIALS.crescent.name), null);
  const names = [...BASE_SKILLS.map(s => s.name), SPECIALS.fist.name];
  assert.equal(new Set(names).size, 4);
  for (const old of ['Whirlwind', 'Dash', 'Ground slam', 'Punch flurry']) assert.ok(!names.includes(old as never), `${old} is retired`);
});

test('the starting skills read naturally in Vietnamese', async () => {
  await loadVietnamese(); setLanguage('vi');
  assert.deepEqual(['Petal Gale', 'Breeze Step', 'Root Quake', 'Paw Storm'].map(name => t(name)), ['Lốc Cánh Hoa', 'Bước Gió', 'Địa Chấn', 'Mưa Đấm']);
});

test('the HUD markup uses the icon set and the new names, and offers the attack pad', () => {
  const main = read('main.ts'), hud = main.slice(main.indexOf('<div id="hud" hidden>'), main.indexOf('<div id="space-hud" hidden>'));
  for (const name of ['sprout', 'bolt', 'bag', 'journal', 'ranking', 'help', 'settings', 'gale', 'breeze', 'quake', 'paw', 'attack', 'home']) assert.ok(hud.includes(`\${hudIcon('${name}')}`), `${name} is drawn in the HUD`);
  for (const emoji of ['🎒', '📖', '🏆', '⚙', '🌀', '➶', '💥', '⌂']) assert.ok(!hud.slice(0, hud.indexOf('id="touch-controls"')).replace(/class="tracker-stack".*?class="minimap"/s, '').includes(emoji), `${emoji} is still in the dock or the fight cluster`);
  assert.doesNotMatch(hud, /Whirlwind|Ground stomp|Star punch/);
  assert.match(hud, /<button class="attack-pad" data-action="attack" aria-label="Basic attack"/);
  assert.match(hud, /<div class="skills"[^>]*>(?:<button class="skill [^"]+" data-action="skill" data-index="[0-3]".*?<\/button>){4}<button class="attack-pad"/s, 'the pad sits in the fight cluster after the four skills');
});

test('the skill picture is written only when it changes, like the rest of the HUD', () => {
  const main = read('main.ts');
  assert.match(main, /const art=skillArt\(skill\.name\);if\(art\)setHtml\(parts\.icon as HTMLElement,art\);else setText\(parts\.icon,t\(skill\.icon\)\);/);
  assert.match(main, /const setHtml=\(el:Element,v:string\)=>\{if\(lastHtml\.get\(el\)===v\)return false;/);
});

test('our sheet loads after every older HUD sheet and before the tap-target sheet', () => {
  const main = read('main.ts'), at = (file: string) => main.indexOf(`import './${file}'`);
  for (const older of ['style.css', 'joystick.css', 'hud-compact.css', 'house.css', 'hud-desk.css']) assert.ok(at(older) >= 0 && at(older) < at('hud-ours.css'), older);
  assert.ok(at('hud-ours.css') < at('tap-targets.css'));
});

test('the dock: cells are never under 44 px, it folds into columns from the right edge and keeps room for the fight cluster', () => {
  assert.match(css, /--dock: max\(44px, calc\(var\(--b\) \+ 8px\)\);/);
  const dock = css.match(/#app #hud \.top-actions \{([^}]*)\}/)![1];
  assert.match(dock, /grid-auto-flow: column; grid-template-rows: repeat\(auto-fill, var\(--dock\)\); grid-auto-columns: var\(--dock\);/);
  assert.match(dock, /direction: rtl;/);
  assert.match(dock, /right: calc\(var\(--edge\) \+ var\(--safe-right\)\); top: calc\(var\(--edge\) \+ var\(--safe-top\)\);/);
  assert.match(dock, /bottom: calc\(var\(--dock-room\) \+ var\(--safe-bottom\)\);/);
  // The room kept under the dock on touch screens is the paw's height plus a margin.
  assert.match(css, /@media \(pointer: coarse\), \(max-width: 900px\), \(max-height: 520px\) \{ :root \{ --dock-room: calc\(var\(--sk\) \* 2\.38 \+ 44px\); \} \}/);
});

test('the paw: four toes on an arc over the pad, at least one toe width apart and clear of the pad', () => {
  const num = (re: RegExp) => { const m = css.match(re); assert.ok(m, String(re)); return m!.slice(1).map(Number); };
  // Offsets are in skill widths (sk); x is from the cluster's centre line, y is the toe's bottom above the cluster's bottom.
  const [width, height] = num(/width: calc\(var\(--sk\) \* ([\d.]+)\); height: calc\(var\(--sk\) \* ([\d.]+)\); max-width: none;/);
  const [b0] = num(/\.skill\[data-index="0"\] \{ left: 0; bottom: calc\(var\(--sk\) \* ([\d.]+)\); \}/);
  const [l1, b1] = num(/\.skill\[data-index="1"\] \{ left: calc\(50% - var\(--sk\) \* ([\d.]+)\); bottom: calc\(var\(--sk\) \* ([\d.]+)\); \}/);
  const [l2, b2] = num(/\.skill\[data-index="2"\] \{ left: calc\(50% \+ var\(--sk\) \* ([\d.]+)\); bottom: calc\(var\(--sk\) \* ([\d.]+)\); \}/);
  const [b3] = num(/\.skill\[data-index="3"\] \{ left: auto; right: 0; bottom: calc\(var\(--sk\) \* ([\d.]+)\); \}/);
  const [padLeft, padSize] = num(/\.attack-pad \{\s*display: grid; place-items: center; position: absolute; left: calc\(50% - var\(--sk\) \* ([\d.]+)\); bottom: 0; width: calc\(var\(--sk\) \* ([\d.]+)\);/);
  const toes = [[-width / 2 + .5, b0 + .5], [-l1 + .5, b1 + .5], [l2 + .5, b2 + .5], [width / 2 - .5, b3 + .5]], pad = [-padLeft + padSize / 2, padSize / 2];
  assert.ok(Math.abs(pad[0]) < .001, 'the pad is centred');
  for (let i = 0; i < 4; i++) {
    assert.ok(toes[i][1] + .5 <= height + .001, 'toes stay inside the cluster');
    assert.ok(Math.hypot(toes[i][0] - pad[0], toes[i][1] - pad[1]) >= .5 + padSize / 2 + .05, `toe ${i} is clear of the pad`);
    if (i) { assert.ok(toes[i][0] > toes[i - 1][0], 'key order left to right'); assert.ok(Math.hypot(toes[i][0] - toes[i - 1][0], toes[i][1] - toes[i - 1][1]) >= 1.05, `toes ${i - 1} and ${i} are more than a toe width apart`); }
  }
  assert.ok(Math.abs(toes[0][0] + toes[3][0]) < .001 && Math.abs(toes[1][0] + toes[2][0]) < .02, 'the paw is symmetric');
  assert.ok(padSize >= 1.2, 'the pad is the biggest target');
  // The smallest skill width any breakpoint sets is 44 px, so every toe is a full touch target without a grown hit area.
  const sizes = [...read('hud-compact.css').matchAll(/--sk: (\d+)px/g), ...css.matchAll(/--sk: (\d+)px/g)].map(m => +m[1]);
  assert.ok(sizes.length >= 5 && Math.min(...sizes) >= 44, `skill widths: ${sizes}`);
  assert.match(css, /#app #hud \.skill::after \{ content: none; \}/);
  // Left-handed play mirrors the cluster.
  assert.match(css, /#app #hud\.joystick-right \.skills, #app #hud\.joystick-on\.joystick-right \.skills \{ right: auto; left: calc\(var\(--paw-edge, 18px\) \+ var\(--safe-left\)\); \}/);
});

test('safe areas: every edge-anchored piece adds the matching inset', () => {
  assert.match(css, /--safe-left: env\(safe-area-inset-left, 0px\); --safe-right: env\(safe-area-inset-right, 0px\);/);
  assert.match(css, /#app #hud \.player-card \{\s*left: calc\(var\(--edge\) \+ var\(--safe-left\)\); top: calc\(var\(--edge\) \+ var\(--safe-top\)\);/);
  assert.match(css, /--col: calc\(var\(--edge\) \+ var\(--safe-right\) \+ var\(--dock-w\) \+ 8px\);/);
  assert.match(css, /--row2: calc\(var\(--edge\) \+ var\(--safe-top\) \+ var\(--dock\) \+ 4px\);/);
  assert.match(css, /right: calc\(var\(--paw-edge, 18px\) \+ var\(--safe-right\)\); bottom: calc\(22px \+ var\(--safe-bottom\)\);/);
  for (const piece of ['.minimap', '.home-button, #app #hud.joystick-on .home-button, #app #hud.joystick-on.joystick-right .home-button']) assert.ok(css.includes(`#app #hud ${piece} {`), piece);
  assert.match(css, /#app #hud \.minimap \{\s*position: absolute; left: auto; right: var\(--col\); top: var\(--row2\);/);
});

test('no frame cost: the sheet adds no animation, transition, blur or filter on standing HUD pieces', () => {
  assert.doesNotMatch(css, /animation\s*:|transition\s*:|backdrop-filter|@keyframes/);
  // Filters appear only on :hover and :active feedback.
  for (const rule of css.match(/[^{}]+\{[^{}]*filter:[^{}]*\}/g) ?? []) assert.match(rule, /:hover|:active|filter: none/, rule.slice(0, 80));
});

test('modes and the cottage keep working: hidden pieces stay hidden and Rescue lays the dock down as a belt', () => {
  assert.match(css, /body\.indoors #app #hud \.skills \{ display: none; \}/);
  // Our rules never set display on pieces that modes hide by display (the minimap, the tracker stack and its panels).
  for (const sel of ['.minimap', '.tracker-stack', '.tracker-panels', '#tracker-chip']) for (const rule of css.match(new RegExp(`#app #hud ${sel.replace('.', '\\.')}(?:, [^{]*)? \\{[^}]*\\}`, 'g')) ?? []) assert.doesNotMatch(rule, /display:/, rule.slice(0, 60));
  assert.match(css, /body\.in-rescue #app #hud \.top-actions \{\s*bottom: auto; display: flex; flex-wrap: wrap;/);
  assert.match(css, /body\.in-mode #app #hud \.home-button \{ right: var\(--col\); top: var\(--row2\) !important; \}/);
});

test('dockMetrics reads the filled columns, not the dock box', () => {
  const rect = (left: number, top: number, width: number, height: number) => ({ left, top, width, height, right: left + width, bottom: top + height }) as DOMRect;
  const dock = rect(700, 8, 132, 220);
  // One column of 34 px tiles centred in 44 px cells at the right edge.
  assert.deepEqual(dockMetrics(dock, [rect(793, 13, 34, 34), rect(793, 57, 34, 34)]), { width: 39, bottom: 91 });
  // Two columns; a hidden button (no box) is ignored.
  assert.deepEqual(dockMetrics(dock, [rect(793, 13, 34, 34), rect(749, 13, 34, 34), rect(0, 0, 0, 0)]), { width: 83, bottom: 47 });
  assert.deepEqual(dockMetrics(dock, []), { width: 132, bottom: 228 });
});
