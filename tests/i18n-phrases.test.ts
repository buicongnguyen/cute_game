// Vietnamese phrases that arrive apart from the pack (src/i18n.ts addPhrases): the lazy feature chunk brings its own.
// One file, one process: the tests run in order and share the language state, like a page does.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addPhrases, getLanguage, localizeHtml, onLanguageChange, setLanguage, switchLanguage, t } from '../src/i18n.ts';
import { VI_PACK } from '../src/locales/vi-pack.ts';
import { addFeaturePhrases, featurePhraseTables, featurePhrases } from './support/feature-phrases.mjs';

const NEW = 'A phrase only the test feature has', NEW_VI = 'Cụm từ chỉ tính năng thử có';
const COUNTED = 'The test feature counted {count} lanterns', COUNTED_VI = 'Tính năng thử đếm được {count} đèn lồng';
const packKey = Object.keys(VI_PACK).find(key => !key.includes('{') && VI_PACK[key] !== key)!;
let calls = 0, changes = 0;
onLanguageChange(() => { changes++; });

test('a loader registered in English does not run; English text is untouched', async () => {
  assert.equal(getLanguage(), 'en');
  await addPhrases(async () => { calls++; return { [NEW]: NEW_VI, [COUNTED]: COUNTED_VI, [packKey]: 'a feature must not replace this' }; });
  await new Promise(resolve => setTimeout(resolve, 5));
  assert.equal(calls, 0, 'an English player never fetches the phrases');
  assert.equal(t(NEW), NEW); assert.equal(t(COUNTED, { count: 3 }), 'The test feature counted 3 lanterns'); assert.equal(changes, 0);
});

test('switching to Vietnamese runs the loader once, before the page re-renders, and t() knows the new phrases', async () => {
  let seenAtChange = '';
  const off = onLanguageChange(() => { seenAtChange = t(NEW); });
  await switchLanguage('vi');
  off();
  assert.equal(calls, 1);
  assert.equal(seenAtChange, NEW_VI, 'the phrases are in memory when the listeners fire: no English flash');
  assert.equal(t(NEW), NEW_VI);
  assert.equal(t(COUNTED, { count: 3 }), 'Tính năng thử đếm được 3 đèn lồng');
  assert.equal(t('The test feature counted 12 lanterns'), 'Tính năng thử đếm được 12 đèn lồng', 'a phrase with a number in it is matched like the templates of the pack');
  assert.equal(localizeHtml(`<b title="${NEW}">${NEW}</b>`), `<b title="${NEW_VI}">${NEW_VI}</b>`);
  assert.equal(t(packKey), VI_PACK[packKey], 'additive only: a phrase of the pack keeps its text');
  assert.equal(changes, 1);
});

test('back in English the text is English again, and the loader does not run a second time on the next switch', async () => {
  await switchLanguage('en');
  assert.equal(t(NEW), NEW); assert.equal(t(packKey), packKey);
  setLanguage('vi');
  assert.equal(t(NEW), NEW_VI); assert.equal(calls, 1);
});

test('a loader added while the game is in Vietnamese runs at once, and the page is told when its phrases are in', async () => {
  assert.equal(getLanguage(), 'vi');
  const before = changes; let ran = false;
  const done = addPhrases(async () => { ran = true; return { 'A late phrase of the test feature': 'Cụm từ đến sau' }; });
  assert.equal(ran, true); assert.equal(t('A late phrase of the test feature'), 'A late phrase of the test feature', 'not yet');
  await done;
  assert.equal(t('A late phrase of the test feature'), 'Cụm từ đến sau'); assert.equal(changes, before + 1, 'onLanguageChange fired, so cached and bound text is redrawn');
  assert.equal(t(NEW), NEW_VI, 'earlier additions stay');
});

test('a loader that fails does not block the switch, and is tried again', async () => {
  await switchLanguage('en');
  let tries = 0;
  await addPhrases(async () => { if (++tries < 3) throw new Error('offline'); return { 'A phrase that came on the third try': 'Cụm từ đến ở lần thử thứ ba' }; });
  await switchLanguage('vi'); // the wait fails, the switch happens and asks once more by itself
  assert.equal(getLanguage(), 'vi'); assert.equal(tries, 2);
  await new Promise(resolve => setTimeout(resolve, 5));
  assert.equal(t('A phrase that came on the third try'), 'A phrase that came on the third try', 'still offline: English for this phrase, Vietnamese for the rest');
  assert.equal(t(NEW), NEW_VI);
  await switchLanguage('en'); await switchLanguage('vi');
  assert.equal(tries, 3); assert.equal(t('A phrase that came on the third try'), 'Cụm từ đến ở lần thử thứ ba');
});

test('the phrase tables of the features (src/features-vi) load for the locale tests and never redefine a phrase of the pack', async () => {
  const tables = await featurePhraseTables(), merged = await featurePhrases();
  for (const [name, table] of tables) {
    assert.ok(table && typeof table === 'object', `src/features-vi/${name} default-exports its table`);
    for (const [key, value] of Object.entries(table)) {
      assert.equal(typeof value, 'string', `${name}: "${key}"`);
      assert.ok(!Object.hasOwn(VI_PACK, key), `src/features-vi/${name} repeats "${key}", which the pack already has (the pack's text wins, so the line is dead)`);
    }
  }
  assert.deepEqual(Object.keys(merged).sort(), [...new Set(tables.flatMap(([, table]) => Object.keys(table)))].sort());
  await addFeaturePhrases();
  for (const [key, value] of Object.entries(merged)) assert.equal(t(key), value);
});
