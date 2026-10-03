// Every item the game can show (bag, chest, shops, workshop, kitchen, market, tester shop, ground drops) has a picture:
// a Blender WebP under public/assets/icons/ (item-icons.ts iconPath), or, for a decoration, its own 3D model drawn
// by the game (icons.ts decorIcon). A missing file would fall back to an emoji, so this fails instead.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import * as M from '../src/model.ts';
import { iconPath } from '../src/item-icons.ts';
import { buildDecoration } from '../src/decorations-art.ts';
import { COOKABLE } from '../src/tester.ts';

const root = new URL('../public/assets/icons/', import.meta.url);
/** Width and height of a WebP (lossy 'VP8 ', lossless 'VP8L' or extended 'VP8X'), or null when it is not one. */
function webpSize(bytes: Buffer): [number, number] | null {
  if (bytes.toString('ascii', 0, 4) !== 'RIFF' || bytes.toString('ascii', 8, 12) !== 'WEBP') return null;
  const chunk = bytes.toString('ascii', 12, 16);
  if (chunk === 'VP8X') return [1 + bytes.readUIntLE(24, 3), 1 + bytes.readUIntLE(27, 3)];
  if (chunk === 'VP8L') { const b = bytes.readUInt32LE(21); return [1 + (b & 0x3fff), 1 + ((b >> 14) & 0x3fff)]; }
  if (chunk === 'VP8 ') return [bytes.readUInt16LE(26) & 0x3fff, bytes.readUInt16LE(28) & 0x3fff];
  return null;
}

test('every item has an icon file (or, for a decoration, a designed 3D model)', () => {
  const missing: string[] = [];
  for (const [id, item] of Object.entries(M.ITEMS)) {
    if (item.type === 'decor') { assert.equal(iconPath(id), null, id); if (buildDecoration(id).userData.fallback) missing.push(`${id}: decoration without a model`); continue; }
    const path = iconPath(id), url = path ? new URL(path, root) : null;
    if (!url || !existsSync(url)) { missing.push(`${id}: no ${path}`); continue; }
    if (!webpSize(readFileSync(url))) missing.push(`${id}: ${path} is not a WebP`);
  }
  assert.deepEqual(missing, []);
});

test('cooked food and farm dishes have their own 160 px Blender icons, not the raw item with a flame', () => {
  const ids = COOKABLE.map(c => c.id).concat('guard');
  assert.ok(ids.length >= 50, `${ids.length} kitchen results`);
  for (const id of ids) {
    const path = iconPath(id)!, bytes = readFileSync(new URL(path, root));
    assert.equal(path, `items/${id}.webp`);
    assert.deepEqual(webpSize(bytes), [160, 160], id); assert.ok(bytes.length <= 8 * 1024, `${id} is ${bytes.length} bytes`);
    const raw = M.ITEMS[id].base; if (raw) assert.notDeepEqual(bytes, readFileSync(new URL(iconPath(raw)!, root)), `${id} differs from ${raw}`);
  }
  const main = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
  assert.ok(!main.includes('cooked-art'), 'no flame-over-raw fallback left in the UI');
});
