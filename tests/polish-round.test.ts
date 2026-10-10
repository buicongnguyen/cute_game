import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { t, setLanguage } from '../src/i18n.ts';
afterEach(() => setLanguage('en'));
const read = (file: string) => readFileSync(new URL(`../src/${file}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');

test('nameplates, neighbours and the bot card say the level through the catalog, so Vietnamese reads Cấp', () => {
  for (const file of ['nameplates.ts', 'bots.ts']) assert.doesNotMatch(read(file), /· Lv \$\{/, `${file} still hard-codes "Lv"`);
  setLanguage('vi');
  assert.equal(t('Lv {level}', { level: 17 }), 'Cấp 17');
  setLanguage('en');
  assert.equal(t('Lv {level}', { level: 17 }), 'Lv 17');
});

test('every new panel string has a Vietnamese line', () => {
  setLanguage('vi');
  for (const key of ['About {minutes} min until ripe', '(you)', 'CLIMB THE RANKS', 'MEET BEYOND THE GATE', 'MEET THE VILLAGE', 'CHAT WITH A NEIGHBOUR', 'JUST YOU AND YOUR GARDEN',
    'The game server is not reachable right now.', 'Looking for the game server…', 'You can keep playing on your own: your adventure saves on this device. Come back later to play together.']) {
    assert.notEqual(t(key), key, `missing vi: ${key}`);
  }
  assert.equal(t('About 24 min until ripe'), 'Còn khoảng 24 phút nữa là chín');
});

test('world-anchored plates and bubbles sit under the HUD (z-index 1 against #app at 2)', () => {
  assert.match(read('style.css'), /#app \{[^}]*z-index: 2;/);
  assert.match(read('online.css'), /\.player-plate \{[^}]*z-index: 1;/);
  assert.match(read('bots.css'), /\.bot-bubble \{[^}]*z-index: 1;/);
  assert.match(read('style.css'), /\.friend-bubble\{[^}]*z-index:1;/);
});

test('Rescue, Flag Rush and the Vault all mark body.in-mode, and the Colossus banner steps aside under it', () => {
  for (const file of ['rescue.ts', 'ctf.ts', 'dungeon.ts']) { const src = read(file); assert.match(src, /classList\.add\('in-[a-z]+', 'in-mode'\)/, file); assert.match(src, /classList\.remove\('in-[a-z]+', 'in-mode'\)/, file); }
  assert.match(read('rescue.css'), /body\.in-mode \.colossus-banner/);
});

test('the shared header: leaderboard, neighbours and Play together use the main panels\' tone header with a kicker', () => {
  const css = read('online.css');
  assert.match(css, /\.social-header \{[^}]*var\(--tone-top\)/);
  assert.match(css, /\.social-kicker/);
  for (const file of ['ranking.ts', 'bots.ts', 'online.ts']) assert.match(read(file), /headerParts\(/, file);
});

test('the Neighbours switch is the Settings switch markup, not a bare checkbox', () => {
  const src = read('bots.ts');
  assert.match(src, /role', 'switch'/);
  assert.doesNotMatch(src, /type = 'checkbox'/);
});
