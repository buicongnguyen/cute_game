import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as C from '../src/content.ts';
import { ANIMALS } from '../src/farm.ts';
import { ENEMY_TYPES } from '../src/enemy-types.ts';
import { BASE_SKILLS, SPECIALS } from '../src/combat.ts';
import { LAVA_EVENT_INFO } from '../src/lava-weather.ts';
import { VI_CATALOG } from '../src/locales/vi-catalog.ts';

function translated(text: string, location: string) {
  assert.ok(Object.hasOwn(VI_CATALOG, text), `${location}: missing Vietnamese for ${JSON.stringify(text)}`);
  const value = VI_CATALOG[text];
  assert.ok(value.trim(), `${location}: translation is empty`);
  assert.equal(value, value.normalize('NFC'), `${location}: Vietnamese accents must use NFC`);
  assert.ok(!value.includes('\uFFFD') && !value.includes('undefined'), `${location}: broken text`);
}

test('Vietnamese covers every current item, crop, fish and farm product name and description', () => {
  // Importing farm registers Claude's newer foods in the same catalog the game uses.
  assert.ok(C.ITEMS.egg && C.ITEMS.milk && C.ITEMS.pancake);
  for (const [id, item] of Object.entries(C.ITEMS)) {
    translated(item.name, `item ${id}`);
    translated(item.desc, `item ${id} description`);
  }
  for (const [id, crop] of Object.entries(C.CROPS)) translated(crop.name, `crop ${id}`);
  for (const [id, fish] of Object.entries(C.FISH)) translated(fish.name, `fish ${id}`);
  for (const [id, animal] of Object.entries(ANIMALS)) {
    translated(animal.name, `animal ${id}`);
    translated(animal.baby, `baby animal ${id}`);
  }
});

test('Vietnamese covers every world, enemy, story step, collection and shop category', () => {
  for (const [id, planet] of Object.entries(C.PLANETS)) {
    translated(planet.name, `planet ${id}`);
    translated(planet.description, `planet ${id} description`);
  }
  for (const [id, enemy] of Object.entries(ENEMY_TYPES)) translated(enemy.name, `enemy ${id}`);
  for (const [id, collection] of Object.entries(C.COLLECTIONS)) translated(collection.name, `collection ${id}`);
  for (const step of C.STORY_STEPS) translated(step.title, 'story step');
  for (const category of [...C.SHOP_CATEGORIES, ...C.WORKSHOP_CATEGORIES]) translated(category.tab, 'category');
  for (const recipe of C.RECIPES) translated(recipe.category, 'recipe category');
  for (const upgrade of Object.values(C.UPGRADES)) translated(upgrade.name, 'upgrade');
  for (const event of Object.values(LAVA_EVENT_INFO)) translated(event.name, 'lava event');
});

test('Vietnamese covers all basic, weapon and disguise skill labels', () => {
  for (const skill of BASE_SKILLS) {
    translated(skill.name, 'base skill');
    translated(skill.description, 'base skill description');
  }
  for (const special of [...Object.values(C.SPECIALS), ...Object.values(SPECIALS)]) translated(special.name, 'weapon special');
  for (const disguise of Object.values(C.DISGUISES)) {
    translated(disguise.name, 'disguise');
    for (const skill of disguise.skills) translated(skill.name, 'disguise skill');
  }
});

test('reference terms and all generated cooked names stay consistent with their raw ingredients', () => {
  assert.equal(VI_CATALOG[C.ITEMS.carrot.name], 'Cà Rốt Tốc Hành');
  assert.equal(VI_CATALOG[C.ITEMS.sword_wood.name], 'Kiếm Gỗ');
  assert.equal(VI_CATALOG[ENEMY_TYPES.mushroom.name], 'Nấm Cáu Kỉnh');
  assert.equal(VI_CATALOG[C.PLANETS.home.name], 'Hành Tinh Mầm Xanh');
  assert.equal(VI_CATALOG[C.DISGUISES.dz_superhero.skills[0].name], 'Bay Lên Trời');
  for (const item of Object.values(C.ITEMS).filter(item => item.cooked)) {
    assert.ok(item.base);
    assert.equal(VI_CATALOG[item.name], `${VI_CATALOG[C.ITEMS[item.base!].name]} · Nướng`);
  }
});

test('catalog description translations preserve numeric gameplay information', () => {
  const numbers = (text: string) => text.match(/-?\d+(?:\.\d+)?/g) ?? [];
  for (const [id, item] of Object.entries(C.ITEMS)) {
    assert.deepEqual(numbers(VI_CATALOG[item.desc]), numbers(item.desc), `item ${id} changed its numbers`);
  }
  assert.equal(VI_CATALOG['+28 defense · +90 health · +-5% speed'], '+28 giáp · +90 máu · -5% tốc độ');
});

test('static interactive world labels are translated without changing the entity model', () => {
  const world = readFileSync(new URL('../src/world.ts', import.meta.url), 'utf8');
  const art = readFileSync(new URL('../src/environment-art.ts', import.meta.url), 'utf8');
  for (const match of world.matchAll(/this\.addEntity\('[^']+','([^']+)'/g)) translated(match[1], 'world entity');
  for (const match of art.matchAll(/this\.node\('[^']+','([^']+)'/g)) translated(match[1], 'environment node');
  for (const name of ['Animal pen', 'Animal pen site', 'Magma crystal vein', 'Planetary crystal vein', 'Fishing pond', 'Planetary fishing pool', 'Magma ore · three strikes', 'Obsidian ore · four strikes', 'Fallen meteor · four strikes', 'Erupted magma crystal', 'Mushroom Forest', 'Blue Lake Meadow', 'Chomper Swamp', 'Redrock Canyon']) translated(name, 'dynamic entity/zone label');
});
