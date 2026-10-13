// Fixture saves for the Village Almanac tests: a new explorer, a mid-game one (every number chosen by hand so the
// expected figures can be worked out on paper) and the promo save. NOW is the fixed clock they are read at.
import { readFileSync } from 'node:fs';
import { newGame, parseSave, type SaveState } from '../../src/model.ts';

export const NOW = Date.UTC(2026, 9, 13, 9, 0, 0);
export const fresh = (): SaveState => { const s = newGame('Mai'); s.savedAt = NOW; return s; };
/**
 * Level 14 on Easy, 900 energy. 12 beds: 6 grow carrots (planted long ago, so ripe), 2 grow pumpkins planted just now,
 * 4 are empty. Bag: 12 carrots, 3 perch, 4 eggs, 2 milk, 5 leather, a wooden sword (worn), a straw hat (worn), a rod.
 * The pen: built, 2 chickens and a cow bought 30 minutes ago. Sprout is home and working; the garden robot is owned but paused.
 * Visited: home and the Toybox Planet.
 */
export function midGame(): SaveState {
  const s = newGame('Mai'); s.savedAt = NOW; s.welcome = 'done';
  s.level = 14; s.energy = 900;
  for (let i = s.plots.length; i < 12; i++) s.plots.push({ crop: null, plantedAt: 0, x: -12 + i, z: 5 });
  s.plots.forEach((p, i) => { if (i < 6) Object.assign(p, { crop: 'carrot', plantedAt: NOW - 3_600_000, growDuration: 100_000, generation: `g${i}` }); else if (i < 8) Object.assign(p, { crop: 'pumpkin', plantedAt: NOW, growDuration: 300_000, generation: `g${i}` }); });
  s.bag = { carrot: 12, fish_perch: 3, egg: 4, milk: 2, leather: 5, sword_wood: 1, hat_straw: 1, rod: 1 };
  s.gear = { weapon: 'sword_wood', hat: 'hat_straw' };
  for (const id of Object.keys(s.bag)) s.collection[id] = 1;
  s.farm.built = true; s.farm.nextId = 4;
  s.farm.animals = [1, 2].map(uid => ({ uid, kind: 'chicken' as const, bornAt: NOW - 1_800_000, acquiredAt: NOW - 1_800_000, cycleAt: NOW - 1_740_000, timerVersion: 2 as const }));
  s.farm.animals.push({ uid: 3, kind: 'cow', bornAt: NOW - 1_800_000, acquiredAt: NOW - 1_800_000, cycleAt: NOW - 1_680_000, timerVersion: 2 });
  s.friends = [{ id: 'sprout', role: 'garden', rescuedAt: NOW - 86_400_000, gear: {}, home: true, borrowed: true }];
  s.bosses = ['home:treant'];
  s.helper = { owned: true, paused: true, seed: 'same', last: {} };
  s.visited = ['home', 'toy']; s.discovered = ['home', 'toy'];
  s.healthUp = 2; s.attackUp = 3;
  s.fishRecords = { fish_perch: 22 };
  Object.assign(s.progression.totals, { harvest: 240, sell: 5200, cook: 12, fish: 9, kill: 130, boss: 2, craft: 4, mine: 6, upgrade: 5, planet: 1 });
  Object.assign(s.counters, { harvests: 240, sold: 5200, bought: 4, kills: 130, fish: 9, upgrades: 5 });
  return s;
}
/** The promo save (promo/save.json: level 40 with banked EXP, a full garden, almost 5 million energy, no history of play). */
export const promo = (): SaveState => parseSave(readFileSync(new URL('../../promo/save.json', import.meta.url), 'utf8'))!;
