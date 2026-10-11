// Browser layout check for the combat HUD (RU-03, C1). It needs a running DEV server and Playwright, so it only
// runs when HUD_LAYOUT_URL is set, for example:
//   npx vite --host 127.0.0.1 --port 5302 --strictPort   (in another shell)
//   HUD_LAYOUT_URL=http://127.0.0.1:5302/ PLAYWRIGHT_MODULE=<path to playwright/index.mjs> node --test tests/hud-layout.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { dismissWelcome } from './browser-start.mjs';

const url = process.env.HUD_LAYOUT_URL;
const VIEWS = {
  'phone 390x844': { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  'small phone 320x568': { viewport: { width: 320, height: 568 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  'desktop 1440x900': { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 },
  'landscape 844x390': { viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
};

async function chromium() {
  const given = process.env.PLAYWRIGHT_MODULE;
  const pw = await import(given ? pathToFileURL(given).href : 'playwright');
  return pw.chromium ?? pw.default.chromium;
}

for (const [name, view] of Object.entries(VIEWS)) {
  test(`boss bar and target frame stay clear of the HUD at ${name}`, { skip: !url && 'set HUD_LAYOUT_URL to a running DEV server', timeout: 120000 }, async () => {
    const browser = await (await chromium()).launch({ args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
    try {
      const page = await (await browser.newContext(view)).newPage();
      // Isolate layout measurements from development hot reload while other modules are rebuilt.
      await page.routeWebSocket(socketUrl=>new URL(socketUrl).searchParams.has('token'),()=>{});
      await page.goto(url, { waitUntil: 'load', timeout: 60000 });
      await page.waitForSelector('#title-screen button.primary', { state: 'visible', timeout: 60000 });
      await page.waitForFunction(() => !document.querySelector('#title-screen').inert, null, { timeout: 30000 });
      await page.fill('#name-input', 'Layout');
      await page.click('#title-screen button.primary');
      await page.waitForFunction(() => !!window.__zoo?.world, null, { timeout: 30000 }); await dismissWelcome(page);
      await page.waitForTimeout(4000);
      // A boss fight with a regular creature selected: both the boss bar and the target frame show.
      await page.evaluate(() => {
        const w = window.__zoo.world, s = window.__zoo.state;
        // This is a layout fixture; new Titans must not kill its level-one explorer before measuring.
        w.onDamage = () => {};
        const boss = w.enemies.filter(e => e.boss && e.hp > 0).sort((a, b) => Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z))[0];
        w.position.set(boss.x, 0, boss.z + 7); w.cameraTarget.copy(w.position); boss.hp = boss.maxHp * .8;
        const other = w.enemies.filter(e => !e.boss && e.hp > 0).sort((a, b) => Math.hypot(a.x - boss.x, a.z - boss.z) - Math.hypot(b.x - boss.x, b.z - boss.z))[0];
        setInterval(() => { s.hp = 999; boss.hp = Math.max(boss.hp, boss.maxHp * .5); other.hp = Math.max(1, other.maxHp * .5); w.selected = other; }, 100);
      });
      await page.waitForTimeout(2500);
      const r = await page.evaluate(() => {
        const box = el => { const b = el.getBoundingClientRect(); return b.width && b.height && getComputedStyle(el).visibility !== 'hidden' ? { l: b.left, t: b.top, r: b.right, b: b.bottom } : null; };
        const all = sel => [...document.querySelectorAll(sel)].filter(el => !el.closest('[hidden]')).map(box).filter(Boolean);
        const panels = { player: all('.player-card'), buttons: all('.top-actions button'), minimap: all('.minimap'), trackers: all('.tracker-stack > :not([hidden]):not(.quick-eat)'), skills: all('.skill'), heel: all(document.body.classList.contains('air-combat') ? '#hud .jump-pad' : '#hud .attack-pad'), toe: document.body.classList.contains('air-combat') ? all('#hud .attack-pad') : [], toasts: all('.toast'), prompt: all('#context-prompt button'), pad: all('#touch-controls button'), joystick:all('#movement-joystick'), home: all('.home-button') };
        const W = innerWidth, H = innerHeight; let hits = 0, n = 0;
        for (let y = 4; y < H; y += 8) for (let x = 4; x < W; x += 8) { n++; const el = document.elementFromPoint(x, y); if (el && el.closest('#hud') && getComputedStyle(el).pointerEvents !== 'none') hits++; }
        return { boss: all('#boss-bar')[0] ?? null, target: all('#target-frame')[0] ?? null, panels, tappable: hits / n, W, H, air: document.body.classList.contains('air-combat') };
      });
      assert.equal(r.panels.pad.length, 0, 'the old directional buttons are replaced by the optional joystick');
      assert.equal(r.panels.joystick.length,view.hasTouch?1:0,'joystick starts enabled on touch-first devices only');
      assert.ok(r.boss, 'the boss bar shows'); assert.ok(r.target, 'the target frame shows');
      const overlap = (a, b) => a.l < b.r - .5 && b.l < a.r - .5 && a.t < b.b - .5 && b.t < a.b - .5;
      if (view.hasTouch) {
        const home = r.panels.home[0], skills = r.panels.skills;
        assert.ok(home && home.t < r.H / 3, 'Home is in the upper HUD, away from the combat thumb');
        assert.ok(home.r - home.l >= 44 && home.b - home.t >= 44, 'Home has a full touch target');
        assert.equal(skills.length, 4);
        // Stage 2: the paw. The big pad is the heel near the bottom edge; the four skills arc over it in key order.
        // With jumping and air combat on (the default) the big pad is Jump and the basic attack is the toe on the inner side.
        const pad = r.panels.heel[0], mid = b => [(b.l + b.r) / 2, (b.t + b.b) / 2];
        assert.equal(r.panels.heel.length, 1); assert.equal(r.panels.toe.length, r.air ? 1 : 0);
        assert.ok(pad && pad.b >= r.H - 30, `the big pad sits near the bottom edge: ${JSON.stringify(pad)} of ${r.H}`);
        assert.ok(pad.r - pad.l >= 52 && pad.b - pad.t >= 52, 'the big pad is a large target');
        const paw = [...skills.map(mid), mid(pad)];
        for (const toe of r.panels.toe) {
          assert.ok(toe.r - toe.l >= 44 && toe.b - toe.t >= 44, 'the attack toe is a full touch target');
          assert.ok(Math.hypot(mid(toe)[0] - mid(pad)[0], mid(toe)[1] - mid(pad)[1]) >= (toe.r - toe.l + pad.r - pad.l) / 2, 'the attack toe does not touch the Jump pad');
          for (const s of skills) assert.ok(Math.hypot(mid(toe)[0] - mid(s)[0], mid(toe)[1] - mid(s)[1]) >= Math.max(44, (toe.r - toe.l + s.r - s.l) / 2), 'the attack toe is a toe width clear of every skill');
          assert.ok(paw.every(p => mid(toe)[0] < p[0]), 'the attack toe is on the inner (left) side of the paw');
          assert.ok(toe.b >= r.H - 30 && Math.abs(mid(toe)[1] - mid(pad)[1]) < (pad.b - pad.t) / 2, 'the attack toe is level with the pad');
          // The toe and the stick are discs: at least 8 px of grass between them (their boxes meet at the stick's empty corner on a 320 px phone).
          for (const j of r.panels.joystick) assert.ok(Math.hypot(mid(toe)[0] - mid(j)[0], mid(toe)[1] - mid(j)[1]) - (toe.r - toe.l + j.r - j.l) / 2 >= 8, 'the attack toe stays clear of movement');
          assert.ok(Math.abs(mid(pad)[0] - (Math.min(toe.l, ...skills.map(b => b.l)) + Math.max(...skills.map(b => b.r))) / 2) < 1.5, 'the Jump pad is the centre of the paw');
        }
        for (const [i, b] of skills.entries()) {
          assert.ok(b.r - b.l >= 44 && b.b - b.t >= 44, 'every skill is a full touch target');
          // The old paw: four toes over the pad. With jumping on the arc is five toes wide (186 to -6 degrees), so its last toe is level with the pad on the outer side, as the attack toe is on the inner side.
          if (!r.air || i < 3) assert.ok(mid(b)[1] < mid(pad)[1], 'every skill of the arc sits above the middle of the pad');
          else assert.ok(Math.abs(mid(b)[1] - mid(pad)[1]) < (pad.b - pad.t) / 2 && b.l > mid(pad)[0], 'the last skill is the outer toe, level with the pad');
          assert.ok(Math.hypot(mid(b)[0] - mid(pad)[0], mid(b)[1] - mid(pad)[1]) >= (b.r - b.l + pad.r - pad.l) / 2, 'no skill touches the pad');
          if (i) assert.ok(mid(b)[0] > mid(skills[i - 1])[0], 'skills run left to right in key order');
          for (const o of skills.slice(0, i)) assert.ok(Math.hypot(mid(b)[0] - mid(o)[0], mid(b)[1] - mid(o)[1]) >= 44, 'skill centres are at least 44 px apart');
        }
        assert.ok(mid(skills[1])[1] < mid(skills[0])[1] && mid(skills[2])[1] < mid(skills[3])[1], 'the middle skills are the top of the arc');
        assert.ok(!r.panels.joystick.some(j => overlap(pad, j)), 'the attack pad stays clear of movement');
        assert.ok(Math.max(...skills.map(b => b.r)) >= r.W - 24, 'default fight buttons sit near the right edge');
        for (const [panel, boxes] of Object.entries(r.panels)) if(panel !== 'home') for(const b of boxes) assert.ok(!overlap(home,b), `Home overlaps ${panel} at ${name}`);
        assert.ok(skills.every(b=>!r.panels.joystick.some(j=>overlap(b,j))), 'fight buttons stay clear of movement');
        // The alternate handedness remains usable after moving Home out of the thumb cluster.
        const swapped = await page.evaluate(() => {
          document.querySelector('#hud').classList.add('joystick-right');
          const box=el=>{const b=el.getBoundingClientRect();return {l:b.left,r:b.right,t:b.top,b:b.bottom};},air=document.body.classList.contains('air-combat');
          return { skills:[...document.querySelectorAll('.skill')].map(box), home:document.querySelector('.home-button').getBoundingClientRect().top, toe:air?box(document.querySelector('#hud .attack-pad')):null, pad:air?box(document.querySelector('#hud .jump-pad')):null, stick:box(document.querySelector('#movement-joystick')) };
        });
        if (swapped.toe) {
          const { toe, pad: jump } = swapped;
          assert.ok(toe.r - toe.l >= 44 && toe.b - toe.t >= 44 && jump.r - jump.l >= 52, 'left-handed: full targets');
          assert.ok(swapped.skills.every(s => mid(toe)[0] > mid(s)[0]) && mid(toe)[0] > mid(jump)[0], 'left-handed: the attack toe stays on the inner side, now the right of the paw');
          assert.ok(Math.hypot(mid(toe)[0] - mid(jump)[0], mid(toe)[1] - mid(jump)[1]) >= (toe.r - toe.l + jump.r - jump.l) / 2, 'left-handed: the attack toe does not touch the Jump pad');
          for (const s of swapped.skills) { assert.ok(Math.hypot(mid(toe)[0] - mid(s)[0], mid(toe)[1] - mid(s)[1]) >= Math.max(44, (toe.r - toe.l + s.r - s.l) / 2), 'left-handed: the attack toe is clear of every skill'); assert.ok(Math.hypot(mid(jump)[0] - mid(s)[0], mid(jump)[1] - mid(s)[1]) >= (jump.r - jump.l + s.r - s.l) / 2, 'left-handed: no skill touches the Jump pad'); }
          assert.ok(Math.abs(mid(jump)[0] - (Math.min(...swapped.skills.map(b => b.l)) + toe.r) / 2) < 1.5, 'left-handed: the Jump pad is the centre of the paw');
          for (const b of [jump, ...swapped.skills]) assert.ok(!overlap(b, swapped.stick), 'left-handed: the paw stays clear of the stick');
          assert.ok(Math.hypot(mid(toe)[0] - mid(swapped.stick)[0], mid(toe)[1] - mid(swapped.stick)[1]) - (toe.r - toe.l + swapped.stick.r - swapped.stick.l) / 2 >= 8, 'left-handed: the attack toe stays clear of movement');
        }
        assert.ok(Math.min(...swapped.skills.map(b=>b.l)) <= 24, 'swapped-hand fight buttons remain on the left');
        assert.equal(swapped.home, home.t, 'hand swapping does not put Home back beside the fight buttons');
      }
      for (const [what, frame] of [['boss bar', r.boss], ['target frame', r.target]]) {
        assert.ok(frame.l >= 0 && frame.r <= r.W && frame.t >= 0 && frame.b <= r.H, `${what} is on screen`);
        for (const [panel, boxes] of Object.entries(r.panels)) for (const b of boxes) assert.ok(!overlap(frame, b), `${what} overlaps ${panel} at ${name}`);
      }
      assert.ok(!overlap(r.boss, r.target), 'boss bar and target frame do not overlap');
      // Quick eat sits under the portrait: on screen, a full touch target, clear of every other HUD control.
      const eat = await page.evaluate(() => { const b = document.querySelector('#quick-eat').getBoundingClientRect(), p = document.querySelector('.quick-eat-pick').getBoundingClientRect(); const hit = el => { const c = el.getBoundingClientRect(); return document.elementFromPoint((c.left + c.right) / 2, (c.top + c.bottom) / 2)?.closest('button') === el; }; const at = [...document.querySelectorAll('#quick-eat,.quick-eat-pick')].map(el => { const c = el.getBoundingClientRect(); return document.elementFromPoint((c.left + c.right) / 2, (c.top + c.bottom) / 2)?.outerHTML.slice(0, 120); }); return { at, eat: { l: b.left, r: b.right, t: b.top, b: b.bottom }, pick: { l: p.left, r: p.right, t: p.top, b: p.bottom }, tappable: hit(document.querySelector('#quick-eat')) && hit(document.querySelector('.quick-eat-pick')) }; });
      assert.ok(eat.tappable, `quick eat and its picker receive taps at ${name}: ${JSON.stringify(eat)}`);
      assert.ok(eat.eat.r - eat.eat.l >= 44 && eat.eat.b - eat.eat.t >= 44, 'quick eat has a full touch target');
      for (const box of [eat.eat, eat.pick]) {
        assert.ok(box.l >= 0 && box.r <= r.W && box.t >= 0 && box.b <= r.H, 'quick eat is on screen');
        for (const [panel, boxes] of Object.entries(r.panels)) if (panel !== 'player') for (const b of boxes) assert.ok(!overlap(box, b), `quick eat overlaps ${panel} at ${name}`);
        for (const [what, frame] of [['boss bar', r.boss], ['target frame', r.target]]) assert.ok(!overlap(box, frame), `quick eat overlaps the ${what} at ${name}`);
      }
      const mid = { l: r.W * .3, r: r.W * .7, t: r.H * .3, b: r.H * .7 };
      // Very small portraits have no clear corner between both thumb controls and the upper HUD;
      // the target stays above the joystick there. Keep the original middle-space check for roomy views.
      if (r.W > 360 || r.H > 650) assert.ok(!overlap(r.target, mid), 'the target frame stays out of the middle of the screen');
      // Wave 3: every touch target is at least 44 x 44 px (invisible hit areas around 32-34 px visuals), which costs about 2 points
      // of tappable area over the reference's 11%; the painted HUD itself shrank (see hud-compact.css).
      if (name.startsWith('landscape')) assert.ok(r.tappable <= .23, `tappable HUD ${(r.tappable * 100).toFixed(1)}% leaves most of the world clear with the requested default joystick`);
      if (view.hasTouch) {
        await page.evaluate(()=>{const w=window.__zoo.world,s=window.__zoo.state;s.bag.harpoon=1;s.gear.weapon='harpoon';delete s.gear.disguise;w.position.set(-7.5,0,15);w.cameraTarget.copy(w.position);w.destination=null;w.route=[];w.selected=null;document.querySelector('#hud').classList.remove('joystick-right');});
        await page.waitForSelector('#reel-button.hunt:not([hidden])');await page.waitForTimeout(300);
        for(const swapped of [false,true])for(const mode of ['hunt','cast','reel']){
          const h=await page.evaluate(({swapped,mode})=>{
            const hud=document.querySelector('#hud');hud.classList.toggle('joystick-right',swapped);hud.classList.toggle('fishing',mode==='reel');
            const rect=el=>{const b=el.getBoundingClientRect();return {l:b.left,r:b.right,t:b.top,b:b.bottom};};
            const hunt=document.querySelector('#reel-button'),hint=document.querySelector('#fish-hint'),skills=[...document.querySelectorAll('.skill')];
            hunt.className='reel-hud'+(mode==='reel'?'':' '+mode);hunt.hidden=false;hunt.style.animation='none';hint.hidden=mode==='cast';
            const receiver=el=>{const b=el.getBoundingClientRect();return document.elementFromPoint((b.left+b.right)/2,(b.top+b.bottom)/2)?.closest('button');};
            return {hunt:rect(hunt),hint:rect(hint),skills:skills.map(rect),joystick:rect(document.querySelector('#movement-joystick')),huntTappable:receiver(hunt)===hunt,skillsTappable:skills.every(el=>receiver(el)===el),receivers:[hunt,...skills].map(el=>receiver(el)?.outerHTML.slice(0,160)),prompt:getComputedStyle(document.querySelector('#context-prompt')).display};
          },{swapped,mode});
          assert.ok(h.huntTappable&&(mode==='reel'||h.skillsTappable),`${mode} and every active combat skill remain independently tappable (${swapped?'swapped':'default'}): ${JSON.stringify(h)}`);
          assert.equal(h.prompt,'none',`${mode} replaces the redundant pond context prompt`);
          for(const box of [...h.skills,h.joystick]){assert.ok(!overlap(h.hunt,box),`${mode} clears both thumb controls`);if(mode!=='cast')assert.ok(!overlap(h.hint,box),`${mode} hint clears both thumb controls`);}
          if(mode!=='cast')assert.ok(!overlap(h.hint,h.hunt),`${mode} hint clears its button`);
        }
      }
    } finally { await browser.close(); }
  });
}

// The discovery pill follows a point near the well and used to sit over the fight buttons on phones (wave-9 review).
test('the discovery pill never shows over the fight buttons or the stick at phone 390x844', { skip: !url && 'set HUD_LAYOUT_URL to a running DEV server', timeout: 120000 }, async () => {
  const browser = await (await chromium()).launch({ args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
  try {
    const page = await (await browser.newContext(VIEWS['phone 390x844'])).newPage();
    await page.routeWebSocket(socketUrl=>new URL(socketUrl).searchParams.has('token'),()=>{});
    await page.goto(url, { waitUntil: 'load', timeout: 60000 });
    await page.waitForSelector('#title-screen button.primary', { state: 'visible', timeout: 60000 });
    await page.waitForFunction(() => !document.querySelector('#title-screen').inert, null, { timeout: 30000 });
    await page.fill('#name-input', 'Pill'); await page.click('#title-screen button.primary');
    await page.waitForFunction(() => !!window.__zoo?.world, null, { timeout: 30000 }); await dismissWelcome(page); await page.waitForTimeout(3000);
    let shown = 0, bad = [];
    // Sweep the explorer around the pill's anchor (2.6, 14.5) so its projection crosses the whole lower screen.
    for (let dx = -6; dx <= 6; dx += 2) for (let dz = -12; dz <= 2; dz += 2) {
      const r = await page.evaluate(async ([dx, dz]) => {
        const w = window.__zoo.world; w.position.set(2.6 + dx, 0, 14.5 + dz); w.cameraTarget.copy(w.position);
        await new Promise(r => setTimeout(r, 450));
        const rect = el => { const b = el.getBoundingClientRect(); return { l: b.left, r: b.right, t: b.top, b: b.bottom }; };
        const pill = document.querySelector('#discovery-progress'), visible = !pill.hidden && getComputedStyle(pill).visibility !== 'hidden' && pill.getBoundingClientRect().width > 0;
        return { visible, pill: rect(pill), others: [...document.querySelectorAll('.skill,#movement-joystick,.home-button')].filter(e => e.getBoundingClientRect().width).map(rect) };
      }, [dx, dz]);
      if (!r.visible) continue; shown++;
      const overlap = (a, b) => a.l < b.r - .5 && b.l < a.r - .5 && a.t < b.b - .5 && b.t < a.b - .5;
      if (r.others.some(o => overlap(r.pill, o))) bad.push([dx, dz, r.pill]);
    }
    assert.ok(shown > 0, 'the pill shows somewhere near the well');
    assert.deepEqual(bad, [], 'the pill never covers a thumb control');
    if (process.env.HUD_SHOTS) await page.screenshot({ path: `${process.env.HUD_SHOTS}/discovery-390x844.png` });
  } finally { await browser.close(); }
});

// Wave 22: desktop layout (skills bottom right, keyboard guide bottom left), the timed bonus line under ADVENTURE and the level
// shown once (now the number on the portrait tile's badge). Phones keep their layout (the touch views above); here the guide must stay hidden on them.
const DESKTOP = { 'desktop 1440x900': VIEWS['desktop 1440x900'], 'desktop 1280x720': { viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 } };
async function openGame(view, name = 'Layout') {
  const browser = await (await chromium()).launch({ args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
  const page = await (await browser.newContext(view)).newPage();
  await page.routeWebSocket(socketUrl => new URL(socketUrl).searchParams.has('token'), () => {});
  await page.goto(url, { waitUntil: 'load', timeout: 60000 });
  await page.waitForSelector('#title-screen button.primary', { state: 'visible', timeout: 60000 });
  await page.waitForFunction(() => !document.querySelector('#title-screen').inert, null, { timeout: 30000 });
  await page.fill('#name-input', name); await page.click('#title-screen button.primary');
  await page.waitForFunction(() => !!window.__zoo?.world, null, { timeout: 30000 }); await dismissWelcome(page); await page.waitForTimeout(3000);
  return { browser, page };
}
// Runs in the page: the visible box of an element, or null.
const BOX = `el => { if (!el) return null; const b = el.getBoundingClientRect(), cs = getComputedStyle(el); return b.width && b.height && cs.display !== 'none' && cs.visibility !== 'hidden' ? { l: b.left, t: b.top, r: b.right, b: b.bottom } : null; }`;
const overlaps = (a, b) => a.l < b.r - .5 && b.l < a.r - .5 && a.t < b.b - .5 && b.t < a.b - .5;
const levelTexts = `[...document.querySelectorAll('.player-card *')].filter(el => !el.children.length && /\\b30\\b/.test(el.textContent) && box(el)).map(el => el.textContent)`;

for (const [name, view] of Object.entries(DESKTOP)) {
  test(`desktop HUD: skills bottom right, Home by the minimap, keyboard guide bottom left, bonus line under ADVENTURE, nothing overlaps at ${name}`, { skip: !url && 'set HUD_LAYOUT_URL to a running DEV server', timeout: 120000 }, async () => {
    const { browser, page } = await openGame(view);
    try {
      await page.evaluate(async () => { const z = window.__zoo; z.state.level = 30; z.state.hp = 999; z.keysGuide.memory = { mode: 'open', uses: 0 }; await z.startChallenge('harvest'); });
      await page.waitForTimeout(800);
      const r = await page.evaluate(([BOX, levelTexts]) => {
        const box = (0, eval)(BOX), all = sel => [...document.querySelectorAll(sel)].map(box).filter(Boolean);
        return { W: innerWidth, H: innerHeight, skills: all('#hud .skill'), guide: box(document.querySelector('#keys-guide')), guideText: document.querySelector('#keys-guide').textContent.replace(/\s/g, ''),
          quest: box(document.querySelector('.quest-tracker')), chal: box(document.querySelector('#challenge-tracker')), chalText: document.querySelector('#challenge-tracker').textContent, bounty: box(document.querySelector('#bounty-tracker')),
          others: { player: all('.player-card'), menu: all('.top-actions'), minimap: all('.minimap'), home: all('.home-button'), eat: all('.quick-eat'), trackers: all('.tracker-stack > :not([hidden]):not(.quick-eat)'), social: all('#social-slot'), prompt: all('#context-prompt button'), buffs: all('#buff-bar') },
          levels: eval(levelTexts), badge: box(document.querySelector('#hud .hero-face .level-badge')), tile: box(document.querySelector('#hud .avatar')) };
      }, [BOX, levelTexts]);
      assert.equal(r.skills.length, 4, 'four skill buttons');
      for (const s of r.skills) assert.ok(s.l > r.W * .6 && s.b > r.H - 170 && s.r <= r.W, `skills sit in the bottom-right corner: ${JSON.stringify(s)}`);
      assert.ok(Math.max(...r.skills.map(s => s.t)) - Math.min(...r.skills.map(s => s.t)) < 2, 'in one tidy row');
      assert.ok(r.guide && r.guide.l < 40 && r.guide.b > r.H - 40, `the keyboard guide is bottom left: ${JSON.stringify(r.guide)}`);
      assert.match(r.guideText, /WASD/); assert.match(r.guideText, /JKL;/); assert.match(r.guideText, /Space/);
      assert.ok(r.chal && r.quest && r.chal.t >= r.quest.b - .5 && (!r.bounty || r.chal.b <= r.bounty.t + .5), 'the bonus line sits right under ADVENTURE, above the bounty');
      assert.match(r.chalText, /Quick challenge · \d+s/); assert.match(r.chalText, /Harvest crops · 0\/4/);
      assert.deepEqual(r.levels, ['30'], 'the level shows once, as the number alone');
      assert.ok(r.badge && r.tile && r.badge.r >= r.tile.r - 2 && r.badge.b >= r.tile.b - 2 && r.badge.l > r.tile.l && r.badge.t > r.tile.t, `it is the badge on the portrait tile's corner: ${JSON.stringify([r.tile, r.badge])}`);
      for (const mine of [...r.skills, r.guide]) for (const [what, boxes] of Object.entries(r.others)) for (const b of boxes) assert.ok(!overlaps(mine, b), `${JSON.stringify(mine)} overlaps ${what} at ${name}`);
      assert.ok(!r.skills.some(s => overlaps(s, r.guide)));
      // Home sits where phones have it: up by the minimap, under the menu row, clear of everything else.
      const home = r.others.home[0], mm = r.others.minimap[0];
      assert.ok(home && home.b < r.H / 3 && home.r <= mm.l + .5 && home.t >= mm.t - .5 && home.t < mm.b, `Home is top right beside the minimap: ${JSON.stringify(home)}`);
      assert.ok(home.r - home.l >= 44 && home.b - home.t >= 40, 'Home stays a full-size button');
      for (const [what, boxes] of Object.entries(r.others)) if (what !== 'home') for (const b of boxes) assert.ok(!overlaps(home, b), `Home overlaps ${what} at ${name}`);
      for (const s of r.skills) assert.ok(!overlaps(home, s));
      if (process.env.HUD_SHOTS) await page.screenshot({ path: `${process.env.HUD_SHOTS}/desktop-${view.viewport.width}x${view.viewport.height}.png` });
      // Switching from the default WASD layout to classic updates the guide; folding is remembered on this device.
      await page.evaluate(() => { window.__zoo.state.settings.keyboardLayout = 'classic'; });
      await page.waitForFunction(() => /↑←↓→/.test(document.querySelector('#keys-guide').textContent.replace(/\s/g, '')) && /QWER/.test(document.querySelector('#keys-guide').textContent.replace(/\s/g, '')));
      await page.click('#keys-guide .keys-toggle'); await page.waitForTimeout(300);
      const folded = await page.evaluate(BOX => ({ box: (0, eval)(BOX)(document.querySelector('#keys-guide')), list: !!document.querySelector('#keys-guide dl'), saved: localStorage.getItem('zoo-garden-keys-guide') }), BOX);
      assert.equal(folded.list, false); assert.ok(folded.box.r - folded.box.l <= 48, 'folded to a small ⌨️ chip'); assert.match(folded.saved, /"closed"/);
      // Folded trackers (as in a fight) keep the countdown in the chip.
      await page.click('.tracker-fold'); await page.waitForTimeout(300);
      const chip = await page.evaluate(() => ({ panels: getComputedStyle(document.querySelector('.tracker-panels')).display, chip: document.querySelector('#tracker-chip').textContent }));
      assert.equal(chip.panels, 'none'); assert.match(chip.chip, /⏱️ \d+s 0\/4/);
    } finally { await browser.close(); }
  });
}
for (const name of ['phone 390x844', 'landscape 844x390']) {
  test(`phones keep their layout with the bonus line as a one-line pill at ${name}`, { skip: !url && 'set HUD_LAYOUT_URL to a running DEV server', timeout: 120000 }, async () => {
    const { browser, page } = await openGame(VIEWS[name]);
    try {
      await page.evaluate(async () => { const z = window.__zoo; z.state.level = 30; await z.startChallenge('kill'); });
      await page.waitForTimeout(800);
      const r = await page.evaluate(([BOX, levelTexts]) => { const box = (0, eval)(BOX); return { guide: box(document.querySelector('#keys-guide')), chal: box(document.querySelector('#challenge-tracker')), skills: [...document.querySelectorAll('.skill')].map(box), joystick: box(document.querySelector('#movement-joystick')), eat: box(document.querySelector('#quick-eat')), levels: eval(levelTexts) }; }, [BOX, levelTexts]);
      assert.equal(r.guide, null, 'no keyboard guide on touch screens');
      assert.ok(r.chal && r.chal.b - r.chal.t <= 26, `the bonus line is a slim pill: ${JSON.stringify(r.chal)}`);
      assert.deepEqual(r.levels, ['30'], 'the level shows once, as the number on the tile');
      assert.ok(!overlaps(r.eat, r.joystick), 'quick eat stays clear of the stick');
      for (const s of r.skills) assert.ok(!overlaps(s, r.chal));
      if (process.env.HUD_SHOTS) await page.screenshot({ path: `${process.env.HUD_SHOTS}/phone-${name.split(' ')[1]}.png` });
    } finally { await browser.close(); }
  });
}

// Stage 2 (docs/QUALITY-PLAN.md): our own arrangement. With the level-41 save (the fullest dock) nothing overlaps, nothing
// leaves the screen and every touch control is a full target, at every supported size, in English and Vietnamese, while
// calm, in a boss fight with a target and a timed task, and by the pond with the harpoon out.
import { readFileSync } from 'node:fs';
import { SIZES, STATES, measureHud, findings, plateFindings } from './support/hud-measure.mjs';
const fullSave = readFileSync(new URL('../promo/save.json', import.meta.url), 'utf8');
for (const size of Object.keys(SIZES)) for (const lang of ['en', 'vi']) {
  test(`our HUD: nothing overlaps or leaves the screen at ${size} in ${lang}`, { skip: !url && 'set HUD_LAYOUT_URL to a running DEV server', timeout: 180000 }, async () => {
    const [width, height, touch] = SIZES[size];
    const browser = await (await chromium()).launch({ args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
    try {
      const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: touch ? 2 : 1, hasTouch: touch, isMobile: touch });
      await context.addInitScript(([s, l]) => { try { localStorage.setItem('cute-game-save-v1', s); localStorage.setItem('cute-game-slot', '0'); localStorage.setItem('cute-game-language', l); localStorage.setItem('cute-game-tutorial', 'done'); } catch { /* storage blocked */ } }, [fullSave, lang]);
      const page = await context.newPage();
      await page.routeWebSocket(socketUrl => new URL(socketUrl).searchParams.has('token'), () => {});
      await page.goto(url, { waitUntil: 'load', timeout: 60000 });
      await page.waitForSelector('[data-action="start"]', { timeout: 60000 });
      await page.evaluate(() => document.querySelector('[data-action="start"]').click());
      await page.waitForFunction(() => !!window.__zoo?.world, null, { timeout: 30000 }); await page.waitForTimeout(6000);
      await page.evaluate(() => { document.querySelector('.tutorial,.welcome')?.remove(); document.querySelectorAll('dialog[open]').forEach(d => d.close()); (document.querySelector('#dialog-layer [data-action="close"]') || document.querySelector('#dialog-close'))?.click(); });
      for (const [state, enter] of Object.entries(STATES)) {
        await enter(page);
        const m = await page.evaluate(measureHud);
        assert.deepEqual(findings(m), [], `${state} at ${size} in ${lang}`);
        if (state !== 'calm') continue;
        const g = m.groups, dock = g.dock, map = g.map[0], hero = g.hero[0], plate = m.plate;
        // The dock: every menu button, in whole columns at the right edge, each cell at least 44 px. News is no longer one of
        // them (it is a tab of the leaderboard), and 360 px and narrower keeps How to play in Settings.
        assert.ok(dock.length >= (width <= 360 ? 7 : 8), `the level-41 dock shows every menu button (${dock.length})`);
        assert.equal(await page.evaluate(() => document.querySelectorAll('#hud [data-action="news"]').length), 0, 'the dock has no News button');
        const columns = [...new Set(dock.map(b => Math.round(b.l)))].sort((a, b) => a - b);
        assert.ok(columns.length <= 3 && Math.max(...dock.map(b => b.r)) >= m.W - 24, `the dock hugs the right edge in at most three columns: ${columns}`);
        for (const x of columns) { const ys = dock.filter(b => Math.round(b.l) === x).map(b => b.t).sort((a, b) => a - b); for (let i = 1; i < ys.length; i++) assert.ok(ys[i] - ys[i - 1] >= 44 - .5, 'dock buttons are at least 44 px apart'); }
        if (columns.length > 1) assert.ok(columns[1] - columns[0] >= 44 - .5, 'dock columns are at least 44 px apart');
        // The map panel and the Home tab hang left of the dock; the map is a panel, not a disc. With the energy tag gone the map
        // stands in the top row, level with the dock's first button and clear of the hero plate.
        const dockLeft = Math.min(...dock.map(b => b.l)), dockTop = Math.min(...dock.map(b => b.t));
        assert.ok(map.r <= dockLeft && g.home[0].r <= dockLeft, 'map and Home sit left of the dock');
        assert.ok(Math.abs(map.t - dockTop) <= 3 && map.t < 24, `the map stands in the top row, level with the dock's first button: ${map.t} vs ${dockTop}`);
        assert.ok(map.l >= hero.r + 8, `the map is clear of the hero plate: ${hero.r} then ${map.l}`);
        assert.ok(g.home[0].t >= map.t - .5 && g.home[0].t <= map.b + 12, 'Home follows the map (beside it, or right under it)');
        // The hero plate (findings() already checked: every piece inside the plate, the badge on the tile's corner or before the
        // name, the energy count over the health bar, nothing cut). Here: what the pieces say.
        const live = await page.evaluate(() => ({ name: window.__zoo.state.name, level: window.__zoo.state.level, energy: window.__zoo.state.energy }));
        assert.equal(plate.level.text, String(live.level), 'the badge shows the level, the number alone');
        assert.equal(plate.energyText.text.replace(/\D/g, ''), String(live.energy), 'the plate shows the energy count');
        assert.match(plate.energyText.text, /^\d{1,3}([,.\s\u00a0\u202f]\d{3})*$/, 'formatted with thousands separators, as before');
        assert.equal(plate.name.text, live.name); assert.equal(plate.name.cut, false, `"${live.name}" is shown whole`);
        assert.ok(plate.name.font <= 12 && plate.name.font >= 10.5, `the name is small but readable (${plate.name.font}px)`);
        assert.equal(!!plate.avatar, width > 360 || height < width, 'only 360 px and narrower drops the portrait tile');
        if (plate.avatar) assert.ok(plate.avatar.r - plate.avatar.l >= 36, 'the tile stays a clear picture (its 44 px tap area is among the touch targets checked above)');
        // Nothing in the plate is rewritten while its values stand still; the energy count is rewritten when it changes.
        const writes = await page.evaluate(async () => {
          const z = window.__zoo, count = { idle: 0, energy: 0 }, start = z.state.energy; let key = 'idle';
          const seen = new MutationObserver(list => { count[key] += list.length; });
          for (const sel of ['#hud .hero-energy', '#hud .level-badge', '#hud .player-name']) seen.observe(document.querySelector(sel), { childList: true, characterData: true, subtree: true, attributes: true });
          await new Promise(r => setTimeout(r, 900)); seen.takeRecords().forEach(() => count.idle++);
          const earned = z.state.energy !== start; // a friend sold something meanwhile: that write is legitimate
          key = 'energy'; const before = document.querySelector('#energy').textContent; z.state.energy += 1234;
          await new Promise(r => setTimeout(r, 900)); seen.takeRecords().forEach(() => count.energy++); seen.disconnect();
          const after = document.querySelector('#energy').textContent; z.state.energy -= 1234; await new Promise(r => setTimeout(r, 400));
          return { ...count, earned, before, after, expected: z.state.energy + 1234 };
        });
        if (!writes.earned) assert.equal(writes.idle, 0, 'no writes to the name, the badge or the energy count while they are unchanged');
        assert.ok(writes.energy >= 1 && writes.energy <= 4, `one write when the energy changes (${writes.energy})`);
        assert.equal(writes.after.replace(/\D/g, ''), String(writes.expected), 'the count follows the energy at once');
        // A 20-character Vietnamese name and a three-digit level: the plate keeps its size, the name ends in an ellipsis where it
        // does not fit, the badge holds three digits and the energy count is still whole.
        const stretched = await page.evaluate(async measureSource => {
          const z = window.__zoo, keep = { name: z.state.name, level: z.state.level, hp: z.state.hp }; z.state.name = 'Nguyễn Hoàng Bảo Trâm'; z.state.level = 100;
          await new Promise(r => setTimeout(r, 700)); const m = (0, eval)(`(${measureSource})`)();
          Object.assign(z.state, keep); await new Promise(r => setTimeout(r, 700)); return m;
        }, measureHud.toString());
        assert.deepEqual(plateFindings(stretched), [], `a long name and level 100 at ${size} in ${lang}`);
        assert.equal(stretched.plate.level.text, '100'); assert.equal(stretched.plate.level.cut, false);
        assert.ok(Math.abs((stretched.groups.hero[0].r - stretched.groups.hero[0].l) - (hero.r - hero.l)) < 1, 'a long name does not widen the plate');
        assert.ok(!stretched.plate.name.cut || stretched.plate.name.ellipsis, 'a name that does not fit ends in an ellipsis');
        assert.ok(stretched.groups.map[0].l >= stretched.groups.hero[0].r + 8, 'and the plate still stops before the map');
        const look = await page.evaluate(() => { const map = document.querySelector('#hud .minimap'), cap = document.querySelector('#map-caption').getBoundingClientRect(), box = map.getBoundingClientRect(), cs = getComputedStyle(map); return { radius: parseFloat(cs.borderTopLeftRadius) / box.width, inside: cap.width > 0 && cap.top >= box.top && cap.bottom <= box.bottom + .5 && cap.left >= box.left - .5 && cap.right <= box.right + .5, emoji: [...document.querySelectorAll('#hud .top-actions button')].filter(b => !b.querySelector('svg') && !getComputedStyle(b).backgroundImage.includes('svg')).length }; });
        assert.ok(look.radius < .3, `the map is a rounded panel (corner ${look.radius.toFixed(2)} of its width)`);
        assert.ok(look.inside, 'the place name is on a strip inside the map');
        assert.equal(look.emoji, 0, 'every dock button carries a drawing from the icon set');
        if (width >= 601 && height >= 521) assert.ok(g.slips.every(s => s.t >= map.b && s.r <= dockLeft), 'on roomy screens the quest slips hang under the map');
        else assert.ok(g.slips.every(s => s.r <= map.l && s.t >= g.hero[0].b - .5), 'on phones the quest chips stay under the hero plate, left of the map');
      }
      if (process.env.HUD_SHOTS) await page.screenshot({ path: `${process.env.HUD_SHOTS}/ours-${size}-${lang}.png` });
    } finally { await browser.close(); }
  });
}

// The news board lives inside the leaderboard dialog: Ranking | News tabs, the unread count on the dock's Ranking button and on
// the News tab, no News button in the dock. Everything the board did still works there (cards, NEW tags, read marks, Coming soon).
for (const [size, lang] of [['1280x720', 'en'], ['390x844', 'vi'], ['320x568', 'en'], ['844x390', 'vi']]) {
  test(`news lives inside the leaderboard dialog, with its unread count on the Ranking button, at ${size} in ${lang}`, { skip: !url && 'set HUD_LAYOUT_URL to a running DEV server', timeout: 180000 }, async () => {
    const [width, height, touch] = SIZES[size];
    const browser = await (await chromium()).launch({ args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
    try {
      const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: touch ? 2 : 1, hasTouch: touch, isMobile: touch });
      await context.addInitScript(([s, l]) => { try { localStorage.setItem('cute-game-save-v1', s); localStorage.setItem('cute-game-slot', '0'); localStorage.setItem('cute-game-language', l); localStorage.setItem('cute-game-tutorial', 'done'); } catch { /* storage blocked */ } }, [fullSave, lang]);
      const page = await context.newPage();
      await page.routeWebSocket(socketUrl => new URL(socketUrl).searchParams.has('token'), () => {});
      await page.goto(url, { waitUntil: 'load', timeout: 60000 });
      await page.waitForSelector('[data-action="start"]', { timeout: 60000 });
      await page.evaluate(() => document.querySelector('[data-action="start"]').click());
      await page.waitForFunction(() => !!window.__zoo?.world && !!window.__zoo.news, null, { timeout: 30000 }); await page.waitForTimeout(5000);
      await page.evaluate(() => { document.querySelector('.tutorial,.welcome')?.remove(); document.querySelectorAll('dialog[open]').forEach(d => d.close()); (document.querySelector('#dialog-layer [data-action="close"]') || document.querySelector('#dialog-close'))?.click(); });
      const total = await page.evaluate(async () => (await (await fetch('news.json', { cache: 'no-store' })).json()).news.length);
      assert.ok(total >= 2, 'the game ships news');
      const expected = total > 9 ? '9+' : String(total);
      // Runs in the page: the state of the dock button and of the dialog.
      const look = () => page.evaluate(() => {
        const rect = el => { const b = el.getBoundingClientRect(); return { l: b.left, t: b.top, r: b.right, b: b.bottom, w: b.width, h: b.height }; };
        const shown = el => !!el && !el.hidden && getComputedStyle(el).display !== 'none' && el.getBoundingClientRect().height > 1;
        const d = document.querySelector('#ranking-dialog'), trigger = document.querySelector('#hud [data-action="ranking"]'), badge = trigger.querySelector('.news-count'), panel = d.querySelector('.ranking-news');
        const tab = b => ({ section: b.dataset.section ?? b.dataset.kind, text: b.textContent, label: b.getAttribute('aria-label'), pressed: b.getAttribute('aria-pressed') === 'true', count: b.querySelector('.news-count')?.textContent ?? null, ...rect(b), tappable: (() => { const c = b.getBoundingClientRect(); const hit = document.elementFromPoint((c.left + c.right) / 2, (c.top + c.bottom) / 2); return !!hit && (hit === b || b.contains(hit)); })() });
        return { open: d.open, W: innerWidth, H: innerHeight, box: rect(d), title: d.querySelector('h2').textContent, kicker: d.querySelector('.social-kicker').textContent,
          dock: { badge: shown(badge) ? badge.textContent : null, badgeBox: shown(badge) ? rect(badge) : null, button: rect(trigger), label: trigger.getAttribute('aria-label'), title: trigger.title, news: document.querySelectorAll('#hud [data-action="news"], #hud .top-actions .energy').length },
          sections: [...d.querySelectorAll('.ranking-sections button')].map(tab), inner: [...panel.querySelectorAll('.panel-tabs button')].map(tab),
          ranking: shown(d.querySelector('.ranking-list')), rows: d.querySelectorAll('.ranking-row').length, boards: shown(d.querySelector('.ranking-tabs')), news: shown(panel), panel: rect(panel),
          cards: panel.querySelectorAll('.news-card').length, upcoming: panel.querySelectorAll('.news-card.upcoming').length, fresh: panel.querySelectorAll('.news-new').length, firstTitle: panel.querySelector('.news-card h3')?.textContent ?? '',
          scrolls: panel.scrollHeight > panel.clientHeight + 1 && getComputedStyle(panel).overflowY === 'auto', read: JSON.parse(localStorage.getItem('zoo-news-read') || '[]').length, oldPanel: !document.querySelector('#dialog-layer').hidden };
      });
      const words = lang === 'vi' ? { ranking: 'Xếp hạng', news: 'Tin tức', board: 'Bảng tin', leaderboard: 'Bảng xếp hạng', soon: 'Sắp ra mắt', both: 'Xếp hạng và tin tức', unread: `${total} tin chưa đọc`, tag: 'MỚI' }
        : { ranking: 'Ranking', news: 'News', board: 'News board', leaderboard: 'Leaderboard', soon: 'Coming soon', both: 'Ranking and news', unread: `${total} unread news`, tag: 'NEW' };
      // Closed: the Ranking button wears the unread count; there is no News button.
      const closed = await look();
      assert.equal(closed.open, false); assert.equal(closed.dock.news, 0, 'no News button (and no energy tag) in the dock');
      assert.equal(closed.dock.badge, expected, 'the unread count shows on the Ranking button');
      assert.ok(closed.dock.badgeBox.w >= 16 && closed.dock.badgeBox.h >= 16 && closed.dock.badgeBox.r <= closed.W && closed.dock.badgeBox.t >= 0, `the count is readable and on screen: ${JSON.stringify(closed.dock.badgeBox)}`);
      assert.ok(closed.dock.badgeBox.l >= closed.dock.button.l && closed.dock.badgeBox.b <= closed.dock.button.b, 'it sits on the button\'s upper right corner');
      assert.equal(closed.dock.title, words.both); assert.equal(closed.dock.label, `${words.both} · ${words.unread}`);
      // The Ranking button opens the dialog on Ranking; the News tab carries the same count.
      await page.evaluate(() => document.querySelector('#hud [data-action="ranking"]').click());
      await page.waitForSelector('#ranking-dialog .ranking-row, #ranking-dialog .ranking-empty', { timeout: 20000 }); await page.waitForTimeout(400);
      const ranking = await look();
      assert.ok(ranking.open && ranking.ranking && ranking.boards && !ranking.news, 'it opens on the Ranking section'); assert.ok(ranking.rows >= 1); assert.equal(ranking.title, words.leaderboard);
      assert.deepEqual(ranking.sections.map(s => [s.section, s.pressed]), [['ranking', true], ['news', false]]);
      assert.ok(ranking.sections[0].text.includes(words.ranking) && ranking.sections[1].text.includes(words.news), JSON.stringify(ranking.sections.map(s => s.text)));
      assert.equal(ranking.sections[1].count, expected, 'the News tab wears the unread count'); assert.equal(ranking.sections[1].label, `${words.news} · ${words.unread}`);
      for (const s of ranking.sections) assert.ok(s.h >= 44 && s.w >= 44 && s.tappable && s.l >= ranking.box.l && s.r <= ranking.box.r, `section tabs are full touch targets inside the dialog: ${JSON.stringify(s)}`);
      assert.ok(ranking.sections[0].r <= ranking.sections[1].l + .5, 'the two tabs stand side by side');
      assert.ok(ranking.box.l >= -.5 && ranking.box.r <= ranking.W + .5 && ranking.box.t >= -.5 && ranking.box.b <= ranking.H + .5, 'the dialog is on screen');
      assert.equal(ranking.read, 0, 'looking at the ranking does not mark the news read'); assert.equal(ranking.dock.badge, expected);
      if (process.env.HUD_SHOTS) await page.screenshot({ path: `${process.env.HUD_SHOTS}/ranking-${size}-${lang}.png` });
      // News: the cards, newest first with NEW tags, in the dialog; the count clears everywhere and the entries are read.
      await page.evaluate(() => document.querySelector('#ranking-dialog .ranking-sections button[data-section="news"]').click()); await page.waitForTimeout(400);
      const news = await look();
      assert.ok(news.open && news.news && !news.ranking && !news.boards, 'the News section replaces the list'); assert.equal(news.oldPanel, false, 'the old news panel does not open');
      assert.equal(news.title, words.board); assert.deepEqual(news.sections.map(s => s.pressed), [false, true]);
      assert.equal(news.cards, total); assert.equal(news.fresh, total, 'every unread entry wears the NEW tag'); assert.ok(news.firstTitle.startsWith(words.tag), news.firstTitle);
      assert.ok(news.scrolls && news.panel.b <= news.box.b + .5 && news.panel.l >= news.box.l - .5 && news.panel.r <= news.box.r + .5, 'the bulletin scrolls inside the dialog');
      assert.equal(news.sections[1].count, null); assert.equal(news.dock.badge, null, 'the count clears on the Ranking button too'); assert.equal(news.dock.label, words.both); assert.equal(news.read, total);
      assert.deepEqual(news.inner.map(t => [t.section, t.pressed]), [['news', true], ['soon', false]]); assert.ok(news.inner[1].text.includes(words.soon));
      for (const t of news.inner) assert.ok(t.h >= 44 && t.w >= 44 && t.tappable, `the bulletin's tabs are full touch targets: ${JSON.stringify(t)}`);
      if (process.env.HUD_SHOTS) await page.screenshot({ path: `${process.env.HUD_SHOTS}/ranking-news-${size}-${lang}.png` });
      // Coming soon, back to Ranking (the board loads again), and closing.
      await page.evaluate(() => document.querySelector('#ranking-dialog [data-action="news-tab"][data-kind="soon"]').click()); await page.waitForTimeout(300);
      const soon = await look(); assert.ok(soon.upcoming >= 1 && soon.cards === soon.upcoming, 'Coming soon lists the plans'); assert.deepEqual(soon.inner.map(t => t.pressed), [false, true]);
      await page.evaluate(() => document.querySelector('#ranking-dialog .ranking-sections button[data-section="ranking"]').click());
      await page.waitForSelector('#ranking-dialog .ranking-row', { timeout: 20000 });
      const back = await look(); assert.ok(back.ranking && !back.news && back.rows >= 1); assert.equal(back.title, words.leaderboard);
      await page.keyboard.press('Escape'); await page.waitForTimeout(200); assert.equal((await look()).open, false, 'Escape closes it');
      // Other code (the timed opening, a future toast or guide step) goes through the same door.
      await page.evaluate(() => window.__zoo.news.open('soon')); await page.waitForTimeout(300);
      const direct = await look(); assert.ok(direct.open && direct.news && direct.upcoming >= 1, 'news.open() shows the dialog on its News section'); assert.equal(direct.oldPanel, false);
      await page.evaluate(() => document.querySelector('#ranking-dialog .social-close').click()); await page.waitForTimeout(200);
      // Reopening from the dock is the ranking again, with nothing unread.
      await page.evaluate(() => document.querySelector('#hud [data-action="ranking"]').click()); await page.waitForTimeout(500);
      const again = await look(); assert.ok(again.open && again.ranking && !again.news); assert.equal(again.sections[1].count, null);
    } finally { await browser.close(); }
  });
}
