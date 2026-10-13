import test from 'node:test';
import assert from 'node:assert/strict';
import { ITEMS } from '../src/model.ts';
import { allProfiles } from '../src/disguise-profile.ts';

test('a disguise costs what it is worth: ten energy per point of its all-round strength, and sells for about 55% of that', () => {
  const profiles = allProfiles();
  assert.equal(profiles.length, 17);
  for (const p of profiles) {
    const price = Math.round(p.total / 6) * 10, item = ITEMS[p.id];
    assert.equal(item.price, price, `${p.id}: priced by its strength (${p.total} over six scores)`);
    assert.equal(item.sell, Math.round(price * .55 / 10) * 10, `${p.id}: sell value`);
    assert.ok(item.sell! < item.price!, `${p.id}: never sells for more than it costs`);
  }
  const byPower = [...profiles].sort((a, b) => b.total - a.total), byPrice = [...profiles].sort((a, b) => ITEMS[b.id].price! - ITEMS[a.id].price!);
  assert.equal(ITEMS[byPower[0].id].price, ITEMS[byPrice[0].id].price, 'the strongest is the dearest');
  assert.equal(ITEMS[byPower.at(-1)!.id].price, ITEMS[byPrice.at(-1)!.id].price, 'the weakest is the cheapest');
});
