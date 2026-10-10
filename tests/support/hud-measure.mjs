// Shared by promo/hud-probe.mjs and tests/hud-layout.test.mjs: measuring the HUD in the page and judging the result.
// No imports, so the test can run with any Playwright build.
export const SIZES = { '1600x900': [1600, 900, false], '1280x720': [1280, 720, false], '768x1024': [768, 1024, true], '390x844': [390, 844, true], '320x568': [320, 568, true], '844x390': [844, 390, true] };

/** Runs in the page: the visible box of every HUD piece, by group. */
export function measureHud() {
  const seen = el => { if (!el) return false; const cs = getComputedStyle(el); if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity === 0) return false; if (el.closest('[hidden]')) return false; const b = el.getBoundingClientRect(); return b.width > 1 && b.height > 1; };
  const box = el => { const b = el.getBoundingClientRect(); return { l: b.left, t: b.top, r: b.right, b: b.bottom }; };
  const all = sel => [...document.querySelectorAll(sel)].filter(seen).map(box);
  const groups = {
    hero: all('#hud .player-card'), energy: all('#hud .top-actions > .energy'), dock: all('#hud .top-actions button'), map: all('#hud .minimap'), home: all('#hud .home-button'),
    slips: all('#hud .tracker-panels > *, #hud #tracker-chip'), eat: all('#hud #quick-eat, #hud .quick-eat-pick'), buffs: all('#hud #buff-bar > *'),
    skills: all('#hud .skill'), pad: all('#hud .attack-pad'), stick: all('#movement-joystick'), boss: all('#boss-bar'), target: all('#target-frame'),
    colossus: all('.colossus-banner'), prompt: all('#context-prompt button'), keys: all('#keys-guide'), reel: all('#reel-button'), fishHint: all('#fish-hint'), weather: all('#environment-bar > *'),
  };
  // Touch targets: what a finger really gets at each control's centre row and column.
  const coarse = matchMedia('(pointer: coarse)').matches, small = [];
  if (coarse) for (const el of document.querySelectorAll('#hud button')) {
    if (!seen(el) || el.closest('[inert]') || getComputedStyle(el).pointerEvents === 'none') continue;
    const b = el.getBoundingClientRect(), cx = Math.round((b.left + b.right) / 2), cy = Math.round((b.top + b.bottom) / 2), mine = h => !!h && (h === el || el.contains(h));
    if (!mine(document.elementFromPoint(cx, cy))) { const thief = document.elementFromPoint(cx, cy); small.push({ el: el.id || el.className || el.dataset.action, covered: thief ? (thief.id || String(thief.className)).slice(0, 40) : 'nothing' }); continue; }
    const run = (dx, dy) => { let n = 1; for (const s of [1, -1]) for (let i = 1; i < 40; i++) { if (!mine(document.elementFromPoint(cx + dx * i * s, cy + dy * i * s))) break; n++; } return n; };
    const w = run(1, 0), h = run(0, 1); if (w < 44 || h < 44) small.push({ el: el.id || el.className || el.dataset.action, w, h });
  }
  return { W: innerWidth, H: innerHeight, groups, small, dockW: getComputedStyle(document.documentElement).getPropertyValue('--dock-w') };
}
/** Toes and the pad are round: two of them overlap when their centres are closer than their radii allow, not when their boxes meet. */
const ROUND = new Set(['skills|skills', 'skills|pad']);
/** Known before this stage and left alone: the timed-task pill is a slim 25 px row on phones (its neighbours take no taps there). */
export const KNOWN_SMALL = ['challenge-tracker'];
export function findings(m) {
  const out = [], names = Object.keys(m.groups), boxes = (a, b) => a.l < b.r - .5 && b.l < a.r - .5 && a.t < b.b - .5 && b.t < a.b - .5;
  const rounds = (a, b) => Math.hypot((a.l + a.r - b.l - b.r) / 2, (a.t + a.b - b.t - b.b) / 2) < (a.r - a.l + b.r - b.l) / 4 - .5;
  for (let i = 0; i < names.length; i++) for (let j = i; j < names.length; j++) {
    const A = m.groups[names[i]], B = m.groups[names[j]];
    const hit = ROUND.has(names[i] + '|' + names[j]) ? rounds : boxes;
    for (let x = 0; x < A.length; x++) for (let y = i === j ? x + 1 : 0; y < B.length; y++) if (hit(A[x], B[y])) out.push(`${names[i]} overlaps ${names[j]} ${JSON.stringify([A[x], B[y]].map(b => [b.l, b.t, b.r, b.b].map(Math.round)))}`);
  }
  for (const [name, boxes] of Object.entries(m.groups)) for (const b of boxes) if (b.l < -.5 || b.t < -.5 || b.r > m.W + .5 || b.b > m.H + .5) out.push(`${name} leaves the screen ${JSON.stringify([b.l, b.t, b.r, b.b].map(Math.round))}`);
  for (const s of m.small) if (!KNOWN_SMALL.some(k => String(s.el).includes(k))) out.push(`touch target ${JSON.stringify(s)}`);
  return out;
}
/** The three states the probe measures; each returns when the HUD has settled. */
export const STATES = {
  calm: async page => { await page.evaluate(() => { const w = __zoo.world; w.position.set(0, 0, 6); w.cameraTarget.copy(w.position); w.selected = null; }); await page.waitForTimeout(700); },
  fight: async page => {
    await page.evaluate(async () => {
      const z = window.__zoo, w = z.world, s = z.state; w.onDamage = () => {};
      try { await z.startChallenge('harvest'); } catch { /* one may be running */ }
      const boss = w.enemies.filter(e => e.boss && e.hp > 0).sort((a, b) => Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z))[0];
      w.position.set(boss.x, 0, boss.z + 7); w.cameraTarget.copy(w.position); boss.hp = boss.maxHp * .8;
      const other = w.enemies.filter(e => !e.boss && e.hp > 0).sort((a, b) => Math.hypot(a.x - boss.x, a.z - boss.z) - Math.hypot(b.x - boss.x, b.z - boss.z))[0];
      window.__probeFight = setInterval(() => { s.hp = 999; boss.hp = Math.max(boss.hp, boss.maxHp * .5); other.hp = Math.max(1, other.maxHp * .5); w.selected = other; }, 100);
    });
    await page.waitForTimeout(2500);
  },
  fishing: async page => {
    await page.evaluate(() => { clearInterval(window.__probeFight); const w = __zoo.world, s = __zoo.state; s.bag.harpoon = 1; s.gear.weapon = 'harpoon'; delete s.gear.disguise; w.selected = null; w.position.set(-7.5, 0, 15); w.cameraTarget.copy(w.position); w.destination = null; w.route = []; });
    await page.waitForSelector('#reel-button:not([hidden])', { timeout: 8000 }).catch(() => {}); await page.waitForTimeout(500);
  },
};

