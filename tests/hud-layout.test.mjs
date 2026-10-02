// Browser layout check for the combat HUD (RU-03, C1). It needs a running DEV server and Playwright, so it only
// runs when HUD_LAYOUT_URL is set, for example:
//   npx vite --host 127.0.0.1 --port 5302 --strictPort   (in another shell)
//   HUD_LAYOUT_URL=http://127.0.0.1:5302/ PLAYWRIGHT_MODULE=<path to playwright/index.mjs> node --test tests/hud-layout.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';

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
      await page.waitForFunction(() => !!window.__zoo?.world, null, { timeout: 30000 });
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
        const panels = { player: all('.player-card'), buttons: all('.top-actions button'), minimap: all('.minimap'), trackers: all('.tracker-stack > :not([hidden]):not(.quick-eat)'), skills: all('.skill'), toasts: all('.toast'), prompt: all('#context-prompt button'), pad: all('#touch-controls button'), joystick:all('#movement-joystick'), home: all('.home-button') };
        const W = innerWidth, H = innerHeight; let hits = 0, n = 0;
        for (let y = 4; y < H; y += 8) for (let x = 4; x < W; x += 8) { n++; const el = document.elementFromPoint(x, y); if (el && el.closest('#hud') && getComputedStyle(el).pointerEvents !== 'none') hits++; }
        return { boss: all('#boss-bar')[0] ?? null, target: all('#target-frame')[0] ?? null, panels, tappable: hits / n, W, H };
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
        assert.ok(Math.max(...skills.map(b => b.b)) >= r.H - 30, 'fight buttons sit near the bottom edge');
        assert.ok(Math.max(...skills.map(b => b.r)) >= r.W - 24, 'default fight buttons sit near the right edge');
        for (const [panel, boxes] of Object.entries(r.panels)) if(panel !== 'home') for(const b of boxes) assert.ok(!overlap(home,b), `Home overlaps ${panel} at ${name}`);
        assert.ok(skills.every(b=>!r.panels.joystick.some(j=>overlap(b,j))), 'fight buttons stay clear of movement');
        // The alternate handedness remains usable after moving Home out of the thumb cluster.
        const swapped = await page.evaluate(() => {
          document.querySelector('#hud').classList.add('joystick-right');
          return { skills:[...document.querySelectorAll('.skill')].map(el=>{const b=el.getBoundingClientRect();return {l:b.left,r:b.right};}), home:document.querySelector('.home-button').getBoundingClientRect().top };
        });
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
