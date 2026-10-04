import * as M from '../src/model.ts';
import * as F from '../src/farm.ts';
import { writeFileSync } from 'node:fs';
const now = Date.now(), s = M.newGame('Clover');
s.level = 40; s.energy = 5_000_000; s.welcome = 'done'; s.xp = 0;
console.log('expand', typeof M.expandGarden, 'pen', F.canBuildPen(s));
let n = 0; while (typeof M.expandGarden === 'function' && n < 20 && M.expandGarden(s)) n++;
console.log('beds', s.plots.length);
F.buildPen(s);
for (const k of ['chicken', 'cow', 'duck', 'pig', 'dog']) for (let i = 0; i < (k === 'dog' ? 1 : 3); i++) { const a = F.buyAnimal(s, k, now - 3_600_000); }
try { for (const k of ['chicken', 'cow', 'duck', 'pig']) console.log(k, F.buildSpeciesPen(s, k, now - 3_600_000)); } catch (e) { console.log('sp', e.message); }
const picks = ['apple','grape','mango','pineapple','coconut','rainbowrose','dragonfruit','moonflower','pumpkin','candy','star','berry','goldcorn','melon','clover','glowshroom','carrot','chili','coffee','lychee','peach','durian','iceberry','magnetmelon'];
s.plots.forEach((p, i) => { const id = picks[i % picks.length]; p.crop = id; p.plantedAt = now - M.CROPS[id].duration - 1000; p.growDuration = M.CROPS[id].duration; });
console.log('animals', s.farm.animals.length, 'species', JSON.stringify(s.farm.speciesPens)?.slice(0, 200));
s.friends = [
  { id: 'sprout', role: 'garden', rescuedAt: now - 9e8, gear: { hat: 'hat_straw', outfit: 'armor_leather', boots: 'boots_cloud' }, home: true, grown: 2, look: 'girl-teen-bunny-bare' },
  { id: 'clover', role: 'farm', rescuedAt: now - 9e8, gear: { hat: 'hat_cowboy', outfit: 'armor_cloud' }, home: true, grown: 2 },
  { id: 'pepper', role: 'cook', rescuedAt: now - 9e8, gear: { hat: 'hat_bear', outfit: 'armor_chef' }, home: true, grown: 2 },
];
writeFileSync('promo/save.json', JSON.stringify(s));
