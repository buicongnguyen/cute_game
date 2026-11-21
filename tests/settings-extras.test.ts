// The Settings rows the feature modules add (AAA-PLAN WP9: src/settings-extras.ts, features/comfort.ts).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addSettingsRow, settingsExtrasHtml } from '../src/settings-extras.ts';
import { shakeRow, flashRow, SHAKE_CHOICES, FLASH_CHOICES, mount } from '../src/features/comfort.ts';
import { localizeHtml, setLanguage, switchLanguage } from '../src/i18n.ts';
import { addFeaturePhrases } from './support/feature-phrases.mjs';
import type { GameServices } from '../src/game-services.ts';

test('with no rows a section is empty', () => { assert.equal(settingsExtrasHtml('audio'), ''); assert.equal(settingsExtrasHtml('comfort'), ''); });

test('rows render in the order they were added, each in its own section, afresh every time', () => {
  let n = 0;
  addSettingsRow('comfort', () => `<div class="settings-row">first ${++n}</div>`);
  addSettingsRow('audio', () => '<div class="settings-row">sound</div>');
  addSettingsRow('comfort', () => '<div class="settings-row">second</div>');
  const comfort = settingsExtrasHtml('comfort');
  assert.ok(comfort.indexOf('first 1') >= 0 && comfort.indexOf('first 1') < comfort.indexOf('second')); assert.ok(!comfort.includes('sound'));
  assert.equal(settingsExtrasHtml('audio'), '<div class="settings-row">sound</div>');
  assert.ok(settingsExtrasHtml('comfort').includes('first 2'), 'rendered again each time Settings opens');
});

function services(prefs: Record<string, string>) {
  const fx = { rig: undefined as { gain: number } | undefined, feel: undefined as unknown, density: 1, flashes: .5, hitstop: 0, freeze(_s: number) {}, buzz: undefined as unknown }, heard: Record<string, (p: never) => void> = {};
  const s = { world: { fx, time: 0 }, state: () => ({ settings: { vibrate: true } }), touch: () => true, tone() {}, pref: (key: string, fallback = '') => prefs[key] ?? fallback, setPref: (key: string, value: string) => { prefs[key] = value; return true; },
    on: (event: string, listener: (p: never) => void) => { heard[event] = listener; return () => {}; } };
  return { s: s as unknown as GameServices, fx, heard };
}
const choices = (row: string) => [...row.matchAll(/<button role="radio" aria-checked="(true|false)" class="(on)?" data-kind="(\w+)">([^<]+)<\/button>/g)].map(m => [m[3], m[4], m[1] === 'true' && m[2] === 'on']);

test('the comfort feature adds Screen shake, then Flashes, with the stored choices marked; English and Vietnamese', async () => {
  const { s, fx, heard } = services({ shake: 'low', flashes: 'low' });
  mount(s);
  assert.equal(fx.rig!.gain, .4); assert.equal(fx.flashes, .5); assert.equal(typeof fx.buzz, 'function'); assert.equal(typeof fx.feel, 'function');
  assert.deepEqual(Object.keys(heard).sort(), ['bossBreak', 'creatureDefeat', 'hitLanded']);
  const html = settingsExtrasHtml('comfort'), shake = html.indexOf('<strong>Screen shake</strong>'), flashes = html.indexOf('<strong>Flashes</strong>');
  assert.ok(shake > 0 && flashes > shake, 'Screen shake first, then Flashes');
  assert.ok(html.includes(shakeRow('low')) && html.includes(flashRow('low')), 'the stored choices are the ones marked');
  assert.deepEqual(choices(shakeRow('low')), [['off', 'Off', false], ['low', 'Low', true], ['full', 'Full', false]]);
  assert.deepEqual(choices(shakeRow('off')).map(c => c[2]), [true, false, false]);
  assert.deepEqual(choices(flashRow('on')), [['on', 'On', true], ['low', 'Low', false]]);
  assert.equal(SHAKE_CHOICES.length, 3); assert.equal(FLASH_CHOICES.length, 2);
  assert.ok(shakeRow('full').includes('class="segmented comfort-pick" data-comfort="shake" role="radiogroup" aria-label="Screen shake"'));

  await switchLanguage('vi'); await addFeaturePhrases();
  try {
    const vi = localizeHtml(html.slice(shake - 40));
    assert.ok(vi.indexOf('<strong>Rung màn hình</strong>') > 0 && vi.indexOf('<strong>Chớp sáng</strong>') > vi.indexOf('<strong>Rung màn hình</strong>'));
    assert.ok(vi.includes('aria-label="Rung màn hình"') && vi.includes('aria-label="Chớp sáng"'));
    assert.deepEqual(choices(localizeHtml(shakeRow('full'))), [['off', 'Tắt', false], ['low', 'Thấp', false], ['full', 'Đầy đủ', true]]);
    assert.deepEqual(choices(localizeHtml(flashRow('low'))), [['on', 'Bật', false], ['low', 'Thấp', true]]);
    assert.ok(!/Screen shake|Flashes|How much|halves|>Off<|>Full<|>On</.test(vi), 'no English left in the rows');
  } finally { setLanguage('en'); }
});

test('a row is bound to the page after it is rendered, and not where there is no page', async () => {
  const seen: unknown[] = [];
  addSettingsRow('audio', () => '<div class="settings-row">bound</div>', root => { seen.push(root); });
  settingsExtrasHtml('comfort'); await Promise.resolve(); assert.equal(seen.length, 0, 'only the rows of the section asked for');
  settingsExtrasHtml('audio'); assert.equal(seen.length, 0, 'not before the caller has put the markup on the page');
  await Promise.resolve(); assert.deepEqual(seen, [undefined], 'no page in this test: the row is told so');
});

test('with nothing stored the shake is Full and the flashes are On', () => {
  const { s, fx } = services({});
  mount(s);
  assert.equal(fx.rig!.gain, 1); assert.equal(fx.flashes, 1);
});
