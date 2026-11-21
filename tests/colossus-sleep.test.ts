import test from 'node:test';
import assert from 'node:assert/strict';

const store = new Map<string, string>();
Object.assign(globalThis, { localStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) } });

test('the well lid has three lids plus Automatic, remembered; an explicit choice rules at any level', async () => {
  const lid = await import('../src/colossus-sleep.ts');
  assert.equal(lid.colossusChoice(), null, 'nothing stored: the player never chose');
  lid.setColossusLid('soothed');
  assert.equal(lid.colossusSoothed(1), true); assert.equal(lid.colossusSleeps(1), false, 'chosen below 20: the choice rules');
  assert.equal(store.get('zoo-colossus-sleeps'), 'soothed');
  lid.setColossusLid('asleep');
  assert.equal(lid.colossusSleeps(40), true); assert.equal(lid.colossusSoothed(40), false);
  lid.setColossusLid('nonsense' as never);
  assert.equal(lid.colossusChoice(), null, 'anything else is Automatic, never the full-strength giant');
  assert.equal(lid.colossusLid(3), 'asleep');
  assert.equal(lid.SOOTHE_FACTOR, 50);
});

test('the first version’s saved "1" still means asleep', async () => {
  store.set('zoo-colossus-sleeps', '1');
  const lid = await import('../src/colossus-sleep.ts?again');
  assert.equal(lid.colossusLid(30), 'asleep');
});

test('the automatic rule (never chose, or chose Automatic): asleep below level 20, soothed from 20 on, never wild unasked (FIX-PLAN 4.6)', async () => {
  store.clear();
  const lid = await import('../src/colossus-sleep.ts?unchosen');
  const L = lid.COLOSSUS_LEVEL; assert.equal(L, 20);
  assert.equal(lid.lidFor(1, null), 'asleep'); assert.equal(lid.lidFor(L - 1, null), 'asleep');
  assert.equal(lid.lidFor(L, null), 'soothed'); assert.equal(lid.lidFor(60, null), 'soothed', 'stays soothed until the player chooses');
  assert.equal(lid.lidFor(L - 5, 'wild'), 'wild', 'chose wild is not never chose');
  assert.equal(lid.colossusChoice(), null); assert.equal(lid.colossusSleeps(5), true); assert.equal(lid.colossusSoothed(30), true);
  lid.setColossusLid('wild'); assert.equal(lid.colossusLid(5), 'wild');
  lid.setColossusLid('auto'); assert.equal(lid.colossusChoice(), null, 'Automatic brings the rule back'); assert.equal(store.get('zoo-colossus-sleeps'), 'auto');
  assert.equal(lid.colossusLid(5), 'asleep'); assert.equal(lid.colossusLid(25), 'soothed');
});

test('the Colossus honours the rule: the event, the sky and the badge, and online below 20 no badge or News', async () => {
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(new URL('../src/colossus.ts', import.meta.url), 'utf8'), main = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
  assert.match(src, /this\.killedDay !== clock\.day && this\.lid\(clock\.day\) !== 'asleep'/, 'asleep: no event, so no sky and no wake-up News');
  assert.match(src, /else if \(!online && this\.lid\(clock\.day\) !== 'asleep'\)/, 'asleep: no badge');
  assert.match(src, /online && this\.h\.state\(\)\.level < COLOSSUS_LEVEL\) mode = 'none'/, 'online under 20: no badge');
  assert.match(main, /if\(before<COLOSSUS_LEVEL&&after>=COLOSSUS_LEVEL\)inbox\.announce\(\{kind:'other',icon:'🌋',title:'The Colossus stirs…'/, 'one News entry at 20');
  assert.match(main, /'Sleeping until level \{need\} \(you are level \{level\}\)\.'/, 'the well shows the rule');
  assert.match(main, /pick\('well-auto','🌙','Automatic'/, 'a fourth choice, Automatic, lit while the rule is on');
  assert.match(main, /case 'well-auto':setColossusLid\('auto'\)/);
  const wb = readFileSync(new URL('../src/welcome-back.ts', import.meta.url), 'utf8');
  assert.match(wb, /if \(s\.level >= COLOSSUS_LEVEL\)/, 'the daily card says nothing about it below 20');
});

// ---- AAA-PLAN WP24: the well's trade-off view and the sleeping well's gift (colossus-well-ui.ts) ----
test('the sleeping well gives 1 Fertilizer once per local day per profile slot, inside the bag limit', async () => {
  const W = await import('../src/colossus-well-ui.ts'), M = await import('../src/model.ts'), { readFileSync } = await import('node:fs');
  const { fits } = await import('../src/storage-slots.ts');
  assert.deepEqual(W.WELL_PAY.gift, ['manure', 1]);
  // The bag as main.ts hands it in: the slot check and the bag-only add of the shared rules.
  const bag = { fits, add: (save: typeof s, id: string, count: number) => M.addItem(save, id, count) };
  // From the clock in force (also under the clock-shift preload): local noon, so "tomorrow" is 24 h on in any time zone.
  const noon = new Date(Date.now()); noon.setHours(12, 0, 0, 0); const now = noon.getTime(), DAY = 86_400_000;
  const s = M.newGame(), had = s.bag.manure ?? 0;
  assert.equal(W.wellGift(bag, s, 'slotA', now), 'ready');
  assert.equal(W.takeWellGift(bag, s, 'slotA', now), true); assert.equal(s.bag.manure, had + 1, 'manure: shown as Fertilizer'); assert.equal(M.ITEMS.manure.name, 'Fertilizer');
  assert.equal(store.get('zoo-well-gift:slotA'), W.wellDay(now)); assert.equal(W.wellDay(new Date(2026, 0, 5, 23, 59).getTime()), '2026-01-05', 'the local calendar day, a key that sorts by time');
  assert.equal(W.wellGift(bag, s, 'slotA', now + 3_600_000), 'taken'); assert.equal(W.takeWellGift(bag, s, 'slotA', now + 3_600_000), false); assert.equal(s.bag.manure, had + 1, 'once a day');
  const late = new Date(now); late.setHours(23, 59, 0, 0); assert.equal(W.takeWellGift(bag, s, 'slotA', late.getTime()), false, 'still the same local day');
  const morning = new Date(now + DAY); morning.setHours(0, 1, 0, 0); assert.equal(W.takeWellGift(bag, s, 'slotA', morning.getTime()), true, 'the local midnight brings the next one'); assert.equal(s.bag.manure, had + 2);
  // Another profile slot has its own day.
  const other = M.newGame(); assert.equal(W.takeWellGift(bag, other, 'slotB', now), true); assert.equal(W.takeWellGift(bag, other, 'slotB', now), false);
  // A full bag: the gift waits (not marked taken), and comes once there is room.
  const full = M.newGame(); delete full.bag.manure; let filled = 0;
  for (const id of Object.keys(M.ITEMS)) { if (!fits(full, { manure: 1 })) break; if (id !== 'manure' && !full.bag[id] && fits(full, { [id]: 1 })) { full.bag[id] = 1; filled++; } }
  assert.ok(filled > 0 && !fits(full, { manure: 1 }), 'the bag is full');
  assert.equal(W.wellGift(bag, full, 'slotC', now), 'full'); assert.equal(W.takeWellGift(bag, full, 'slotC', now), false); assert.equal(full.bag.manure, undefined); assert.equal(store.has('zoo-well-gift:slotC'), false);
  delete full.bag[Object.keys(full.bag).at(-1)!]; assert.equal(W.takeWellGift(bag, full, 'slotC', now), true); assert.equal(full.bag.manure, 1);
  // No storage (a private window): no gift rather than an endless one.
  const none = M.newGame(), count = none.bag.manure ?? 0; assert.equal(W.takeWellGift(bag, none, 'slotD', now, null), false); assert.equal(none.bag.manure ?? 0, count);
  // The game hands the gift out through its state-change path, as it does the Colossus reward.
  const ui = readFileSync(new URL('../src/colossus-well-ui.ts', import.meta.url), 'utf8');
  assert.match(ui, /if \(h\.change\(\(\) => takeWellGift\(h, h\.state\(\), h\.slot, Date\.now\(\)\)\)\) h\.toast\(/);
  const main = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
  assert.match(main, /\{t,esc,fits:fitsBag,add:M\.addItem,state:\(\)=>state,change,toast,slot:activeKey\(\),lid:colossusLid\(level\)\}/);
});
test('the well lists its four choices with what each pays, Automatic first, in English and Vietnamese', async () => {
  const W = await import('../src/colossus-well-ui.ts'), I = await import('../src/i18n.ts'), { readFileSync } = await import('node:fs');
  const words = () => ({ t: I.t, esc: (text: string) => text.replace(/[&<>"']/g, ch => '&#' + ch.charCodeAt(0) + ';'), lang: I.getLanguage() });
  // The view keeps display copies of the pay numbers (it imports no game module at run time): each must equal the rule it shows.
  const C = await import('../src/colossus-content.ts'), R = await import('../src/colossus-rewards.ts'), E = await import('../src/colossus.ts'), { ITEMS } = await import('../src/content.ts');
  assert.deepEqual({ ...W.WELL_PAY, gift: 0 }, { xp: C.COLOSSUS_STATS.xp, soothedXp: R.SOOTHED_XP, seeds: R.SOOTHED_GIFT[1], crownChance: C.COLOSSUS_LOOT[0][1], crown: C.COLOSSUS_ITEMS.hat_colossus.name, pet: C.COLOSSUS_ITEMS[R.COLOSSUS_PET].name, autoFull: E.AUTO_ALWAYS_FULL, paidKey: E.AUTO_PAID_KEY, gift: 0 });
  assert.equal(C.COLOSSUS_LOOT[0][0], 'hat_colossus'); assert.equal(R.SOOTHED_GIFT[0], 'seed_fire'); assert.equal(ITEMS.seed_fire.name, 'Fire seed'); assert.equal(ITEMS[W.WELL_PAY.gift[0]].name, 'Fertilizer');
  const ids = (html: string) => [...html.matchAll(/data-well-pay="(\w+)"/g)].map(m => m[1]);
  I.setLanguage('en');
  const en = W.wellChoicesHtml(words());
  assert.deepEqual(ids(en), ['auto', 'wild', 'soothed', 'asleep']);
  for (const text of ['Automatic', 'Let it wake', 'Soothe it', 'Lower the lid', '30,000 EXP', '6,000 EXP (a fifth)', 'a 15% chance of the Cinderhorn Crown', 'the loot without the crown', 'plus 2 fire seeds', 'Each whole day it sleeps, the warm well gives 1 Fertilizer.', 'the final blow brings Little Cinderpeak', 'The first soothed win pays in full (30,000 EXP)'])
    assert.ok(en.includes(text), text);
  assert.ok(!en.includes('data-well-gift'), 'no gift row unless the lid is down');
  assert.match(W.wellChoicesHtml(words(), { autoPaid: true }), /The full-pay win is used: soothed wins pay 6,000 EXP and 2 fire seeds\./);
  assert.match(W.wellChoicesHtml(words(), { gift: 'ready' }), /warms the soil: 1 Fertilizer is ready\.<\/b><br><button class="primary" style="min-height:44px" data-well-gift>Take it<\/button>/);
  assert.match(W.wellChoicesHtml(words(), { gift: 'taken' }), /Today’s 1 Fertilizer is taken\. Come back tomorrow\.<\/b><\/p>/); assert.match(W.wellChoicesHtml(words(), { gift: 'full' }), /Bag full: make room for today’s 1 Fertilizer\./);
  const awake = W.wellChoicesHtml(words(), { gift: 'awake' }); assert.match(awake, /The giant was awake today, so the soil is cold\. Keep the lid down a whole day for 1 Fertilizer\./); assert.ok(!awake.includes('data-well-gift'), 'no button on a day the giant was awake');
  // Vietnamese: the lazy table (features-vi) on top of the pack, as the game loads it after Start.
  const table = (await import('../src/features-vi/colossus-well.ts')).default as Record<string, string>;
  I.setLanguage('vi'); await I.loadVietnamese(); await I.addPhrases(async () => table);
  try {
    const vi = W.wellChoicesHtml(words(), { gift: 'ready' });
    assert.deepEqual(ids(vi), ['auto', 'wild', 'soothed', 'asleep']);
    for (const text of ['Tự động', 'Để nó thức dậy', 'Xoa dịu nó', 'Hạ nắp xuống', '30.000 EXP', '6.000 EXP (một phần năm)', 'Vương Miện Sừng Tro', '2 hạt giống lửa', 'giếng ấm tặng 1 Phân Bón.', 'Cự Thạch Tí Hon', 'Mỗi lựa chọn được thưởng gì', '>Nhận</button>'])
      assert.ok(vi.includes(text), text);
    for (const english of ['fight', 'EXP (a fifth)', 'fire seeds', 'final blow', 'Take it', ' pays ', 'The ']) assert.ok(!vi.includes(english), 'left in English: ' + english);
    for (const html of [W.wellChoicesHtml(words(), { autoPaid: true }), W.wellChoicesHtml(words(), { gift: 'taken' }), W.wellChoicesHtml(words(), { gift: 'full' })]) assert.doesNotMatch(html, /The |Today|Bag full|soothed wins/);
    assert.match(W.wellChoicesHtml(words(), { gift: 'awake' }), /Hôm nay người khổng lồ đã thức nên đất nguội rồi\. Hãy đậy nắp trọn một ngày để nhận 1 Phân Bón\./);
    // Every phrase of the table is used by the view or by the kill notice, and none is left as English.
    const used = readFileSync(new URL('../src/colossus-well-ui.ts', import.meta.url), 'utf8') + readFileSync(new URL('../src/colossus.ts', import.meta.url), 'utf8');
    for (const [key, value] of Object.entries(table)) { assert.ok(used.includes("'" + key + "'"), 'unused: ' + key); assert.notEqual(value, key); }
  } finally { I.setLanguage('en'); }
  // The well dialog appends it (solo only), from its own chunk, and the level-20 News entry tells the trade-off.
  const main = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
  assert.match(main, /if\(!online\)void import\('\.\/colossus-well-ui\.ts'\)\.then\(m=>modal==='well'&&m\.mountWell\(\$\('#dialog-body'\),/);
  assert.match(main, /'The Cinderpeak Colossus can wake for you now, soothed\. The Ember Well shows what each choice pays\.'/);
  assert.doesNotMatch(main, /from '\.\/colossus-well-ui\.ts'/, 'never a static import: the view is not in the start download');
  // The view imports types only: a run-time import of start code from this lazy chunk would re-split the start chunks.
  const view = readFileSync(new URL('../src/colossus-well-ui.ts', import.meta.url), 'utf8');
  assert.deepEqual(view.split(/\r?\n/).filter(line => /^import /.test(line) && !/^import type /.test(line)), []); assert.doesNotMatch(view, /import\(/);
});
test('the solo kill pays by the lid it was fought at; the server never passes a lid', async () => {
  const { readFileSync } = await import('node:fs');
  // The runtime pays by the strength the giant was fought at, remembers the full-pay kill per profile slot and floats what it paid.
  const src = readFileSync(new URL('../src/colossus.ts', import.meta.url), 'utf8');
  assert.match(src, /fought = this\.spawnedWeak > 1 \? 'soothed' : 'wild'/); assert.ok(src.includes('const paidKey = ' + String.fromCharCode(96) + '$' + '{AUTO_PAID_KEY}:$' + '{activeKey()}' + String.fromCharCode(96)));
  assert.match(src, /const pay = colossusPay\(fought, !!colossusChoice\(\), autoPaid\), xp = S\.xp \* \(pay === 'soothed' \? SOOTHED_XP : 1\)/);
  assert.match(src, /grantColossusReward\(this\.h\.state\(\), lastHit, Math\.random, false, undefined, pay\)/); assert.match(src, /this\.h\.gain\('xp', xp \+ Math\.round\(extraXp\)\)/);
  const server = readFileSync(new URL('../server/combat-authority.mjs', import.meta.url), 'utf8');
  assert.match(server, /grantColossusReward\(profile,id===killer\.account\.id,Math\.random,false,bonus\)/, 'the server never passes a lid: a shared world pays the wild rate');
});
// ---- WP24 review: the gift's clock guard, and asleep as a real trade ----
test('the well gift cannot be had twice by winding the clock: a stored day today or later counts, a far future one resets to today', async () => {
  const W = await import('../src/colossus-well-ui.ts'), M = await import('../src/model.ts'), { fits } = await import('../src/storage-slots.ts');
  const bag = { fits, add: (save: ReturnType<typeof M.newGame>, id: string, count: number) => M.addItem(save, id, count) };
  const noon = new Date(Date.now()); noon.setHours(12, 0, 0, 0); const now = noon.getTime(), DAY = 86_400_000, key = 'zoo-well-gift:clock';
  const s = M.newGame(), had = s.bag.manure ?? 0;
  assert.equal(W.takeWellGift(bag, s, 'clock', now), true); assert.equal(store.get(key), W.wellDay(now)); assert.match(store.get(key)!, /^\d{4}-\d{2}-\d{2}$/);
  // Wound back a day (to any hour of it): the stored day is later than "today", so it is taken.
  for (const back of [DAY, DAY + 11 * 3_600_000, DAY - 11 * 3_600_000]) { assert.equal(W.wellGift(bag, s, 'clock', now - back), 'taken'); assert.equal(W.takeWellGift(bag, s, 'clock', now - back), false); }
  assert.equal(store.get(key), W.wellDay(now), 'the newest day is kept');
  // Toggling between two dates: today's gift, tomorrow's gift, then neither again however often the clock flips.
  assert.equal(W.takeWellGift(bag, s, 'clock', now + DAY), true); assert.equal(s.bag.manure, had + 2);
  for (let flip = 0; flip < 4; flip++) { assert.equal(W.takeWellGift(bag, s, 'clock', now), false, 'back on today'); assert.equal(W.takeWellGift(bag, s, 'clock', now + DAY), false, 'and tomorrow again'); }
  assert.equal(s.bag.manure, had + 2); assert.equal(store.get(key), W.wellDay(now + DAY));
  // A day more than one ahead (the clock jumped far forward and came back): it resets to today, as taken; the next real day gives again.
  assert.equal(W.takeWellGift(bag, s, 'clock', now + 30 * DAY), true); assert.equal(s.bag.manure, had + 3);
  assert.equal(W.wellGift(bag, s, 'clock', now), 'taken'); assert.equal(store.get(key), W.wellDay(now), 'reset to today, still taken');
  assert.equal(W.takeWellGift(bag, s, 'clock', now), false); assert.equal(W.takeWellGift(bag, s, 'clock', now + DAY), true, 'not frozen until the far date'); assert.equal(s.bag.manure, had + 4);
  // A broken value sorts after every date: it counts as a far day, so today is taken and tomorrow gives again.
  store.set('zoo-well-gift:old', 'garbage'); assert.equal(W.wellGift(bag, M.newGame(), 'old', now), 'taken'); assert.equal(store.get('zoo-well-gift:old'), W.wellDay(now)); assert.equal(W.wellGift(bag, M.newGame(), 'old', now + DAY), 'ready');
});
test('asleep is a trade: no gift on a day the lid was up at the well or the giant was fought', async () => {
  const W = await import('../src/colossus-well-ui.ts'), M = await import('../src/model.ts'), { fits } = await import('../src/storage-slots.ts'), E = await import('../src/colossus.ts'), { readFileSync } = await import('node:fs');
  const bag = { fits, add: (save: ReturnType<typeof M.newGame>, id: string, count: number) => M.addItem(save, id, count) };
  const noon = new Date(Date.now()); noon.setHours(12, 0, 0, 0); const now = noon.getTime(), DAY = 86_400_000;
  // The lid was up when the well was looked at today (the view notes it), then lowered: nothing today, the gift tomorrow.
  const s = M.newGame(), had = s.bag.manure ?? 0;
  W.noteAwake('trade', now); assert.equal(store.get('zoo-well-awake:trade'), W.wellDay(now));
  assert.equal(W.wellGift(bag, s, 'trade', now + 3_600_000), 'awake'); assert.equal(W.takeWellGift(bag, s, 'trade', now + 3_600_000), false); assert.equal(s.bag.manure ?? 0, had);
  assert.equal(W.wellGift(bag, s, 'trade', now - DAY), 'awake', 'winding the clock back does not help');
  assert.equal(W.takeWellGift(bag, s, 'trade', now + DAY), true, 'a whole day asleep pays'); assert.equal(s.bag.manure, had + 1);
  // Taking the gift first and lifting the lid after: the gift stays taken, and the lid counts for that day only.
  W.noteAwake('trade', now + DAY); assert.equal(W.wellGift(bag, s, 'trade', now + DAY), 'taken'); assert.equal(W.wellGift(bag, s, 'trade', now + 2 * DAY), 'ready');
  // A fight marks the day too (colossus.ts noteWellAwake, the same key and day format), per profile slot.
  E.noteWellAwake('fight', now); assert.equal(store.get('zoo-well-awake:fight'), W.wellDay(now)); assert.equal(W.WELL_AWAKE_KEY, 'zoo-well-awake');
  assert.equal(W.wellGift(bag, M.newGame(), 'fight', now), 'awake'); assert.equal(W.wellGift(bag, M.newGame(), 'other-slot', now), 'ready');
  E.noteWellAwake('fight', now - DAY); assert.equal(store.get('zoo-well-awake:fight'), W.wellDay(now), 'an earlier day never replaces a later one');
  for (const at of [new Date(2026, 0, 5, 0, 0, 1), new Date(2027, 11, 31, 23, 59, 59)]) { E.noteWellAwake('fmt' + at.getTime(), at.getTime()); assert.equal(store.get('zoo-well-awake:fmt' + at.getTime()), W.wellDay(at.getTime())); }
  // Where they are called: a local blow in a solo fight, and every time the view is shown with the lid up.
  const src = readFileSync(new URL('../src/colossus.ts', import.meta.url), 'utf8'), ui = readFileSync(new URL('../src/colossus-well-ui.ts', import.meta.url), 'utf8');
  assert.match(src, /if \(who === 'local' && !hazard && !this\.h\.online\(\) && Date\.now\(\) - this\.awakeNoted > 60000\) \{ this\.awakeNoted = Date\.now\(\); noteWellAwake\(activeKey\(\), Date\.now\(\)\); \}/);
  assert.match(ui, /if \(h\.lid !== 'asleep'\) noteAwake\(h\.slot, Date\.now\(\)\);/);
  assert.match(src, /grantRoarBonus\(this\.h\.state\(\), l, Math\.random, xp\)/, 'the roar bonus is taken from the EXP paid');
  // The stale hint is gone: lowering the lid is "no fight", not "nothing happens".
  const main = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8'), { COLOSSUS_VI } = await import('../src/locales/vi-colossus.ts');
  assert.match(main, /pick\('well-sleep','🪨','Lower the lid','It sleeps through its hour\. No fight\.'/); assert.equal(COLOSSUS_VI['It sleeps through its hour. No fight.'], 'Nó ngủ suốt giờ của mình. Không có trận đánh.'); assert.doesNotMatch(main, /Nothing happens/);
});
