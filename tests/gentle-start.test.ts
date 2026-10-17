import test from 'node:test';
import assert from 'node:assert/strict';
import { guideFinished, GUIDE_SECONDS } from '../src/guide.ts';
import { creatureTravelPace } from '../src/enemy-types.ts';
import { lookPace } from '../src/looks.ts';
import { friendHeight } from '../src/growth.ts';
import * as M from '../src/model.ts';
test('first planting retires automatic guidance even after save reload', () => {
 const s = M.newGame(); assert.equal(guideFinished(s), false);
 s.firstRun = { plants: 1 }; assert.equal(guideFinished(s), true);
 assert.equal(guideFinished(M.parseSave(JSON.stringify(s))!), true); assert.equal(GUIDE_SECONDS, 20);
});
test('small enemies slow down while bosses and large quarry keep their pace', () => {
 assert.equal(creatureTravelPace('mushroom'), .75); assert.equal(creatureTravelPace('bee'), .75);
 assert.equal(creatureTravelPace('bear', true), 1); assert.equal(creatureTravelPace('forest_raptor'), 1);
 assert.equal(creatureTravelPace(undefined), 1);
});
test('longer legs get a gentler travel pace and retain proportional equipment bonuses', () => {
 const s = M.newGame(), base = M.activeStats(s).speed;
 s.looks.style = 'boy-grown-none-bare'; assert.equal(lookPace(s.looks.style), .9);
 assert.equal(M.activeStats(s).speed, base, 'equipment statistics stay independent of height');
 assert.equal(lookPace('boy-tiny-none-bare'), 1); assert.equal(lookPace('boy-teen-none-bare'), .97);
 assert.equal(lookPace('boy-tall-none-bare'), .94);
 assert.deepEqual([0,1,2].map(friendHeight), [.65,.75,.85]);
});
