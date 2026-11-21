// Shared by promo/hud-probe.mjs and tests/hud-layout.test.mjs: measuring the HUD in the page and judging the result:
// overlaps, pieces off the screen, touch controls under 44 px and (since WP16) text under 11 px.
// No imports, so the test can run with any Playwright build.
export const SIZES = { '1600x900': [1600, 900, false], '1280x720': [1280, 720, false], '768x1024': [768, 1024, true], '390x844': [390, 844, true], '320x568': [320, 568, true], '844x390': [844, 390, true] };

/** Runs in the page: the visible box of every HUD piece, by group. */
export function measureHud() {
  const seen = el => { if (!el) return false; const cs = getComputedStyle(el); if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity === 0) return false; if (el.closest('[hidden]')) return false; const b = el.getBoundingClientRect(); return b.width > 1 && b.height > 1; };
  const box = el => { const b = el.getBoundingClientRect(); return { l: b.left, t: b.top, r: b.right, b: b.bottom }; };
  const all = sel => [...document.querySelectorAll(sel)].filter(seen).map(box);
  const groups = {
    hero: all('#hud .player-card'), dock: all('#hud .top-actions button'), map: all('#hud .minimap'), home: all('#hud .home-button'),
    slips: all('#hud .tracker-panels > *, #hud #tracker-chip'), eat: all('#hud #quick-eat, #hud .quick-eat-pick'), buffs: all('#hud #buff-bar > *'),
    skills: all('#hud .skill'), pad: all('#hud .attack-pad'), jump: all('#hud .jump-pad'), stick: all('#movement-joystick'), boss: all('#boss-bar'), target: all('#target-frame'),
    colossus: all('.colossus-banner'), prompt: all('#context-prompt button'), counter: all('#combo-counter'), keys: all('#keys-guide'), reel: all('#reel-button'), fishHint: all('#fish-hint'), weather: all('#environment-bar > *'), goals: all('#hud #goals-flag'),
    pickups: all('#hud #pickup-feed > .pf-line'), // the pickup list by the backpack (gain-feed-ui.ts): STATES fill it before measuring
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
  // The hero plate's own pieces (they sit inside it, so they are not a group of their own): the name, the level badge on the
  // portrait tile, the energy count over the health bar. `cut` = the text is wider than its box; `tall` = the height of its glyphs.
  const piece = sel => { const el = document.querySelector(sel); if (!seen(el)) return null; const cs = getComputedStyle(el); return { ...box(el), text: el.textContent.trim(), cut: el.scrollWidth > el.clientWidth + 1, font: parseFloat(cs.fontSize), ellipsis: cs.textOverflow === 'ellipsis' }; };
  const plate = { name: piece('#hud #player-name'), level: piece('#hud .level-badge'), energy: piece('#hud .hero-energy'), energyText: piece('#hud #energy'), avatar: piece('#hud .avatar'), health: piece('#hud .meter.health'), oldTag: document.querySelectorAll('#hud .top-actions .energy, #hud .level-chip').length };
  // Text under 11 px (AAA plan WP16): every HUD element that shows text of its own, and the labels drawn by ::before / ::after.
  const tiny = [], tag = el => el.id || (typeof el.className === 'string' && el.className) || el.tagName.toLowerCase();
  for (const el of document.querySelectorAll('#hud *, #boss-bar, #boss-bar *, #target-frame, #target-frame *, #combo-counter, #combo-counter *')) {
    if (el.closest('svg') || !seen(el) || [...el.querySelectorAll('*')].length > 40) continue;
    let hidden = false; for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) { const c = getComputedStyle(p); if (c.display === 'none' || c.visibility === 'hidden' || +c.opacity === 0) { hidden = true; break; } } if (hidden) continue;
    const own = [...el.childNodes].filter(n => n.nodeType === 3 && n.textContent.trim()).map(n => n.textContent.trim()).join(' '), px = parseFloat(getComputedStyle(el).fontSize);
    if (own && px > 0 && px < 11 - .01) tiny.push({ el: tag(el), px, text: own.slice(0, 20) });
    for (const part of ['::before', '::after']) { const c = getComputedStyle(el, part), text = c.content; if (!text || text === 'none' || text === 'normal' || !/[^\s"']/.test(text) || c.display === 'none') continue; const size = parseFloat(c.fontSize); if (size > 0 && size < 11 - .01) tiny.push({ el: tag(el) + part, px: size, text: text.slice(0, 12) }); }
  }
  return { W: innerWidth, H: innerHeight, coarse, air: document.body.classList.contains('air-combat'), leftHanded: !!document.querySelector('#hud.joystick-right'), groups, plate, small, tiny, dockW: getComputedStyle(document.documentElement).getPropertyValue('--dock-w') };
}
/**
 * Runs in the page, for an open panel (`scope`, a selector): text under 11 px and, on a touch screen, controls whose real hit area
 * (what elementFromPoint gives a finger along the control's centre row and column) is under 44 px. A control cut by its
 * scrolling panel or by the screen edge is mid-scroll and is skipped, like one covered at its centre.
 */
export function measureReadable(scope) {
  const shown = el => { const b = el.getBoundingClientRect(); if (b.width <= 1 || b.height <= 1 || b.bottom <= 0 || b.right <= 0 || b.top >= innerHeight || b.left >= innerWidth || el.closest('[hidden],[inert]')) return false; for (let p = el; p && p !== document.documentElement; p = p.parentElement) { const c = getComputedStyle(p); if (c.display === 'none' || c.visibility === 'hidden' || +c.opacity === 0) return false; } return true; };
  const tag = el => el.id || (typeof el.className === 'string' && el.className) || el.tagName.toLowerCase(), roots = [...document.querySelectorAll(scope)].filter(shown), tiny = [], small = [];
  const top = el => { const b = el.getBoundingClientRect(), h = document.elementFromPoint(Math.min(innerWidth - 1, Math.max(0, (b.left + b.right) / 2)), Math.min(innerHeight - 1, Math.max(0, (b.top + b.bottom) / 2))); return !!h && (h === el || el.contains(h) || h.contains(el)); };
  for (const root of roots) for (const el of root.querySelectorAll('*')) {
    if (el.closest('svg') || el.tagName === 'OPTION' || !shown(el)) continue;
    const own = [...el.childNodes].filter(n => n.nodeType === 3 && n.textContent.trim()).map(n => n.textContent.trim()).join(' '), px = parseFloat(getComputedStyle(el).fontSize);
    if (own && px > 0 && px < 11 - .01 && top(el)) tiny.push({ el: tag(el), px, text: own.slice(0, 20) });
    for (const part of ['::before', '::after']) { const c = getComputedStyle(el, part), text = c.content; if (!text || text === 'none' || text === 'normal' || !/[^\s"']/.test(text) || c.display === 'none') continue; const size = parseFloat(c.fontSize); if (size > 0 && size < 11 - .01) tiny.push({ el: tag(el) + part, px: size, text: text.slice(0, 12) }); }
  }
  if (matchMedia('(pointer: coarse)').matches) for (const root of roots) for (const el of root.querySelectorAll('button, a[href], summary, select, input, [role=button], [role=tab], [role=menuitem], [role=switch]')) {
    if (!shown(el) || getComputedStyle(el).pointerEvents === 'none') continue;
    const target = el.closest('label') || el, b = target.getBoundingClientRect(), cx = Math.round((b.left + b.right) / 2), cy = Math.round((b.top + b.bottom) / 2), mine = h => !!h && (h === target || target.contains(h));
    let cut = b.top < 0 || b.bottom > innerHeight || b.left < 0 || b.right > innerWidth;
    for (let p = target.parentElement; p && !cut; p = p.parentElement) { const c = getComputedStyle(p); if (/auto|scroll|hidden|clip/.test(c.overflowY + c.overflowX)) { const r = p.getBoundingClientRect(); cut = b.top < r.top + 6 || b.bottom > r.bottom - 6 || b.left < r.left - 1 || b.right > r.right + 1; } }
    if (cut || !mine(document.elementFromPoint(cx, cy))) continue;
    const run = (dx, dy) => { let n = 1; for (const side of [1, -1]) for (let i = 1; i < 40; i++) { if (!mine(document.elementFromPoint(cx + dx * i * side, cy + dy * i * side))) break; n++; } return n; };
    const w = run(1, 0), h = run(0, 1); if (w < 44 || h < 44) small.push({ el: tag(el), text: el.textContent.trim().slice(0, 16), w, h });
  }
  return { tiny, small, sideways: document.documentElement.scrollWidth > innerWidth + 1 };
}
/** The findings of measureReadable, as lines. */
export const readableFindings = r => [...r.tiny.map(t => `text under 11 px ${JSON.stringify(t)}`), ...r.small.map(t => `touch target under 44 px ${JSON.stringify(t)}`), ...(r.sideways ? ['the page scrolls sideways'] : [])];
/** Toes and the pad are round: two of them overlap when their centres are closer than their radii allow, not when their boxes meet.
    The stick is a disc too (joystick.css, border-radius 50%): with jumping on, the attack toe sits by its lower corner, where the boxes
    meet on a 320 px phone while the discs are over 20 px apart. */
const ROUND = new Set(['skills|skills', 'skills|pad', 'skills|jump', 'pad|jump', 'pad|stick', 'jump|stick', 'skills|stick']);
/** Pieces made to sit on another: the goals badge is a tag on the map panel's corner (goals.css). It must stay inside the map's box. */
const ATTACHED = new Set(['map|goals', 'map|colossus']); // and the Colossus badge, closed, sits in the map's top-left corner (hud-ours.css)
/**
 * The five-button paw (jumping on, a touch screen): the rules of docs/FIGHT-PLAN.md section 11.
 *   - the Attack pad is at least 60 px, each special at least 48 px, Jump at least 52 px;
 *   - a thumb resting on Attack or on Jump covers no special: the thumb is a capsule 100 px wide (22 mm) from the
 *     screen's bottom corner on the paw's side to the middle of the button it rests on, and every special's disc (its
 *     cooldown ring is the disc's rim) stays clear of it;
 *   - Jump stands beside Attack on the inner side, and the specials are all above both.
 */
export const THUMB = 100;
export function pawFindings(m) {
  const out = []; if (!m.coarse || !m.air || !m.groups.pad.length || !m.groups.jump.length) return out;
  const pad = m.groups.pad[0], jump = m.groups.jump[0], mid = b => ({ x: (b.l + b.r) / 2, y: (b.t + b.b) / 2 }), size = b => Math.min(b.r - b.l, b.b - b.t);
  const right = mid(pad).x > m.W / 2, corner = { x: right ? m.W : 0, y: m.H };
  if (size(pad) < 60 - .5) out.push(`the Attack pad is ${size(pad).toFixed(0)} px, under 60`);
  if (size(jump) < 52 - .5) out.push(`the Jump pad is ${size(jump).toFixed(0)} px, under 52`);
  if (m.groups.skills.length !== 3 && m.groups.skills.length !== 4) out.push(`${m.groups.skills.length} specials on the paw (three, or four in a disguise)`);
  const inner = right ? mid(jump).x < mid(pad).x : mid(jump).x > mid(pad).x;
  if (!inner || Math.abs(mid(jump).y - mid(pad).y) > size(pad) / 2) out.push('Jump is not beside the Attack pad on the inner side');
  const seg = (p, a, b) => { const dx = b.x - a.x, dy = b.y - a.y, l = dx * dx + dy * dy, f = l ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l)) : 0; return Math.hypot(p.x - a.x - dx * f, p.y - a.y - dy * f); };
  for (const [i, s] of m.groups.skills.entries()) {
    if (size(s) < 48 - .5) out.push(`special ${i} is ${size(s).toFixed(0)} px, under 48`);
    if (s.b > Math.min(pad.t, jump.t) + size(s) * .75) out.push(`special ${i} is not above the Attack and Jump pads`);
    for (const [name, on] of [['Attack', pad], ['Jump', jump]]) { const clear = seg(mid(s), corner, mid(on)) - THUMB / 2 - size(s) / 2; if (clear < 0) out.push(`a thumb on ${name} covers special ${i} by ${(-clear).toFixed(1)} px`); }
  }
  return out;
}
/** Controls allowed under 44 px: none since WP16 (the timed-task pill, a slim 26 px row on phones, got a 44 px hit area in tap-targets.css). */
export const KNOWN_SMALL = [];
export function findings(m) {
  const out = [], names = Object.keys(m.groups), boxes = (a, b) => a.l < b.r - .5 && b.l < a.r - .5 && a.t < b.b - .5 && b.t < a.b - .5;
  const rounds = (a, b) => Math.hypot((a.l + a.r - b.l - b.r) / 2, (a.t + a.b - b.t - b.b) / 2) < (a.r - a.l + b.r - b.l) / 4 - .5;
  for (let i = 0; i < names.length; i++) for (let j = i; j < names.length; j++) {
    const A = m.groups[names[i]], B = m.groups[names[j]];
    const pair = names[i] + '|' + names[j];
    if (ATTACHED.has(pair)) { for (const b of B) if (!A.some(a => b.l >= a.l - .5 && b.t >= a.t - .5 && b.r <= a.r + .5 && b.b <= a.b + .5)) out.push(`${names[j]} is not on its ${names[i]} ${JSON.stringify([b.l, b.t, b.r, b.b].map(Math.round))}`); continue; }
    const hit = ROUND.has(pair) ? rounds : boxes;
    for (let x = 0; x < A.length; x++) for (let y = i === j ? x + 1 : 0; y < B.length; y++) if (hit(A[x], B[y])) out.push(`${names[i]} overlaps ${names[j]} ${JSON.stringify([A[x], B[y]].map(b => [b.l, b.t, b.r, b.b].map(Math.round)))}`);
  }
  for (const [name, boxes] of Object.entries(m.groups)) for (const b of boxes) if (b.l < -.5 || b.t < -.5 || b.r > m.W + .5 || b.b > m.H + .5) out.push(`${name} leaves the screen ${JSON.stringify([b.l, b.t, b.r, b.b].map(Math.round))}`);
  for (const s of m.small) if (!KNOWN_SMALL.some(k => String(s.el).includes(k))) out.push(`touch target ${JSON.stringify(s)}`);
  for (const t of m.tiny ?? []) out.push(`text under 11 px ${JSON.stringify(t)}`);
  out.push(...plateFindings(m), ...pawFindings(m));
  return out;
}
/** The hero plate: the name row beside the tile, the level as a number on a badge, the energy count over the health bar, all inside the
    plate and none of them cut (a long name may end in an ellipsis: that is `name.cut` with `name.ellipsis`, and is not a finding). */
export function plateFindings(m) {
  const out = [], p = m.plate, hero = m.groups.hero[0]; if (!p || !hero) return ['the hero plate is missing'];
  const within = (b, slack = .5) => b.l >= hero.l - slack && b.t >= hero.t - slack && b.r <= hero.r + slack && b.b <= hero.b + slack;
  if (p.oldTag) out.push('the separate energy tag, or the level chip is still in the HUD (the News button is now the inbox)');
  for (const key of ['name', 'level', 'energy', 'energyText', 'health']) if (!p[key]) out.push(`hero plate: ${key} is not shown`);
  if (out.length) return out;
  if (!within(p.name) || !within(p.energy) || !within(p.health)) out.push(`hero plate: a piece leaves the plate ${JSON.stringify([hero, p.name, p.energy, p.health].map(b => [b.l, b.t, b.r, b.b].map(Math.round)))}`);
  // The badge may hang a few pixels over the tile's corner, never out of the plate's outline by more than its border.
  if (!within(p.level, 3)) out.push(`hero plate: the level badge leaves the plate ${JSON.stringify([p.level.l, p.level.t, p.level.r, p.level.b].map(Math.round))}`);
  if (!/^\d{1,3}$/.test(p.level.text)) out.push(`the level badge shows "${p.level.text}", not the number alone`);
  if (p.level.cut || p.level.font < 11 || p.level.b - p.level.t < 16) out.push(`the level badge is cut or too small to read ${JSON.stringify(p.level)}`);
  if (p.energyText.cut || p.energy.cut || p.energyText.r > p.energy.r + .5) out.push(`the energy count is cut ${JSON.stringify(p.energyText)}`);
  if (p.energyText.font < 12) out.push(`the energy count is ${p.energyText.font}px, too small to read`);
  if (p.energy.b > p.health.t + .5) out.push('the energy count is not above the health bar');
  if (p.energy.l < p.name.r - .5 || p.energy.t >= p.name.b || p.energy.b <= p.name.t) out.push('the energy count is not on the name row, after the name');
  if (p.name.cut && !p.name.ellipsis) out.push('a long name is clipped without an ellipsis');
  if (p.avatar) {
    // Since e78e839 the name row (name left, energy count right) stands beside the tile at its top, over the bars. Short landscape phones keep
    // the older arrangement: the name row above the tile, the tile beside the bars.
    const beside = p.name.l >= p.avatar.r - .5 && p.name.t >= p.avatar.t - 5 && p.name.b <= p.health.t + .5, above = p.name.b <= p.avatar.t + .5;
    if (!beside && !above) out.push('the name is neither beside the portrait tile nor above it');
    const cx = (p.level.l + p.level.r) / 2, cy = (p.level.t + p.level.b) / 2;
    if (cx < p.avatar.l || cx > p.avatar.r + 2 || cy < p.avatar.t || cy > p.avatar.b + 2 || p.level.r < p.avatar.r - 2 || p.level.b < p.avatar.b - 2) out.push(`the level badge is not on the tile's corner ${JSON.stringify([p.avatar, p.level].map(b => [b.l, b.t, b.r, b.b].map(Math.round)))}`);
  } else if (p.level.r > p.name.l + .5 || p.level.b <= p.name.t || p.level.t >= p.name.b || p.name.b > p.health.t + .5) out.push('without the tile the level badge should stand before the name row, over the bars');
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
  // A chain of hits with the power strike charged (after 'fight'): the hit counter beside the explorer and the Attack pad glowing.
  charged: async page => {
    await page.evaluate(() => { const f = window.__zoo.fight; f.on = true; f.powerCharge.hits = 20; f.powerCharge.left = 12; f.streak.count = 11; window.__probeChain = setInterval(() => { f.powerCharge.left = 12; f.comboMeter.step(.1); f.comboMeter.hit('ground'); f.streak.hit(); }, 250); });
    await page.waitForFunction(() => !document.querySelector('#combo-counter')?.hidden && !!document.querySelector('#hud .attack-pad.ready'), null, { timeout: 8000 }).catch(() => {}); await page.waitForTimeout(400);
  },
  // The same fight in a disguise: its four skills are four toes on the arc.
  disguise: async page => {
    await page.evaluate(() => { const s = window.__zoo.state; s.bag.dz_ninja = 1; s.gear.disguise = 'dz_ninja'; window.__zoo.world.refreshPlayer?.(); });
    await page.waitForFunction(() => !!document.querySelector('#hud .skills.toes-4') || !document.body.classList.contains('air-combat'), null, { timeout: 8000 }).catch(() => {}); await page.waitForTimeout(500);
  },
  fishing: async page => {
    await page.evaluate(() => { clearInterval(window.__probeFight); clearInterval(window.__probeChain); __zoo.fight.powerCharge.clear(); __zoo.resetCombat?.(); const w = __zoo.world, s = __zoo.state; s.bag.harpoon = 1; s.gear.weapon = 'harpoon'; delete s.gear.disguise; w.selected = null; w.position.set(-7.5, 0, 15); w.cameraTarget.copy(w.position); w.destination = null; w.route = []; });
    await page.waitForSelector('#reel-button:not([hidden])', { timeout: 8000 }).catch(() => {}); await page.waitForTimeout(500);
  },
};

