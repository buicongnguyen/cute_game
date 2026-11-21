/**
 * The first fight and danger the player can read (AAA-PLAN WP17), all of it after Start.
 *
 * The first fight (the "defeat creatures" step of a new save, first-run.ts; solo, at home). Its creatures are told apart
 * by `tutorial` on the creature; they live only while that step is on.
 * - Swings wait for the player: until the first press of Attack (or F, or a mouse click on the creature), nothing swings
 *   by itself: not the standing auto-fight, not a phone's tap on the creature or a tap on the tracker (both still walk
 *   the explorer there). A small bubble under
 *   the explorer says 'Tap Attack!' / 'Press F!' and the Attack pad pulses. Only on a save that has no win yet; a press, a landed blow or
 *   the first win ends the wait for good (main.ts basicAttack asks world.lesson.swing).
 * - One creature teaches the ring: the first of the three winds up for LESSON.windup s inside a red ring of
 *   LESSON.ring m (a radius the telegraph pool already has) and bites only an explorer who is still in the ring when
 *   it ends, and never while a dialog is open. The other two never bite. A bite never takes the explorer below LESSON.floor of full health (main.ts asks
 *   world.lesson.bite for every blow). The village is a safe zone where world.ts lands no blow at all, so inside it this
 *   module lands the ring's bite itself; outside, the creature's own blow is the bite.
 * - Two tips, each once per save (kept by the firstRunSeen action): 'Step out of the ring!' at the first wind-up and
 *   'One more for a finisher!' after two blows in a row.
 * - The first win of a save bursts bigger (the effects' own pools: no new draw call) and sends `firstWin`, once per save:
 *   the explorer's own blow (not a pet's, a helper's or another player's) fells a creature while the save's defeat count
 *   is still 0; 'win' is kept in the save's seen list, so it is never told again.
 *
 * Danger: the chip of a zone 3 or more levels above the explorer becomes a red warning chip here (dangerChip),
 * and walking out of the village towards such a zone shows its banner WARN.edge - WARN.from m before the fence, before
 * its creatures can see the explorer.
 *
 * It also carries the rule for when a fight is on (fight-state.ts), which keeps Attack from using things then.
 *
 * Until this module is mounted (just after the first played frame), and if it never loads, the first fight plays as it
 * did before: creatures bite as their kind does and swings start by themselves.
 * No run-time import of start code (types only): see features.ts.
 */
import type { GameServices } from '../game-services.ts';
import type { Enemy, Lesson } from '../world.ts';
import type { FirstSeen } from '../first-run.ts';
import { inFight } from '../fight-state.ts';

/** The name the first fight's creatures show (display only: the species and its rules stay the mushroom's). */
export const CRITTER_NAME = 'Gloomcap nibbler';
/** The ring creature: its ring and reach in metres, its wind-up in seconds, the share of health a bite never goes below. */
export const LESSON = { ring: 2, reach: 1.6, windup: 1, floor: .6, color: '#ff3b3b' } as const;
/** A tip stays this long (seconds); two blows this close together are "in a row". */
export const TIP_S = 2.5, CHAIN_GAP_S = 1.2;
/** The press prompt shows when a creature of the first fight is this near (metres). */
export const PROMPT_NEAR = 6;
/** Leaving the village: the banner of a dangerous zone shows from `from` m out (the fence is at `edge`), again after walking back inside `rearm`. */
export const WARN = { from: 14.5, edge: 18, rearm: 11, levels: 3 } as const;
/** The wilds round the village: banner name and the level its creatures start at (hud-combat.ts ZONE_DIFFICULTY x 3 - 2; a test keeps them in step). */
export const WILDS = { canyon: ['Redrock Canyon', 7], forest: ['Mushroom Forest', 1], meadow: ['Blue Lake Meadow', 1], swamp: ['Chomper Swamp', 4] } as const;

/** A zone whose creatures start this many levels above the explorer is dangerous: its chip says so, after this sign. */
export const DANGER_LEVELS = 3, DANGER_SIGN = '\u26a0\ufe0f';
/**
 * The warning chip for a zone banner's chip (hud-combat.ts zoneInfo: '\u2605\u2605\u2605 \u00b7 Lv 7+ \u00b7 \ud83d\udc51 King Bear', the level is its
 * first number with a plus), when that level is DANGER_LEVELS or more above the explorer's:
 * '\u26a0\ufe0f Lv 7+ Dangerous \u00b7 \ud83d\udc51 King Bear'. null when the chip stays as it is (the village's 'Safe', a zone within reach, a chip
 * that already warns).
 */
export function dangerChip(chip: string, heroLevel: number, t: (source: string, params?: Record<string, string | number>) => string): string | null {
  const m = chip.startsWith(DANGER_SIGN) ? null : /(\d+)\+(.*)$/s.exec(chip), level = Number(m?.[1]);
  return m && level >= heroLevel + DANGER_LEVELS ? `${DANGER_SIGN} ${t('Lv {level}+ Dangerous', { level })}${m[2]}` : null;
}
/** What of a blow of `damage` may land on an explorer with `hp` of `max`: never below LESSON.floor of full health, whole points only. */
export function biteAllowed(damage: number, hp: number, max: number) {
  const room = Math.floor(hp - Math.ceil(max * LESSON.floor));
  return room < 1 ? 0 : Math.min(damage, room);
}
/** A blow of the explorer's own: not a pet's, a helper's or a summon's, and not a hazard (no blow at all). */
export const ownBlow = (impact?: { helper?: boolean; source?: string }) => !!impact && !impact.helper && impact.source !== 'pet' && impact.source !== 'summon';
/**
 * The first win of a save: the explorer's own blow fells a creature while the save has no defeat counted and was never
 * told so ('win' in the save's seen list, so a reload, or a kill that the count missed, cannot tell it twice).
 */
export const firstWinNow = (save: LessonSave, impact?: { helper?: boolean; source?: string }) => !!save.firstRun && save.counters.kills === 0 && !save.firstRun.seen?.includes('win') && ownBlow(impact);
/**
 * The ring's bite lands now: its wind-up has just ended in a strike (not a flinch or a stun, which go back to the
 * chase), the explorer is still in the ring and inside the village (outside it world.ts lands the blow itself), and
 * nothing holds the game (`quiet`: a dialog, the cottage, another planet).
 */
export const ringBites = (ring: { x: number; z: number; hp: number; phase?: string }, wasWindup: boolean, hero: { x: number; z: number }, quiet: boolean) =>
  wasWindup && ring.phase === 'recover' && ring.hp > 0 && !quiet && Math.hypot(hero.x, hero.z) < WARN.edge && inRing(ring, hero);
/** The explorer stands in the creature's ring. */
export const inRing = (e: { x: number; z: number }, p: { x: number; z: number }) => Math.hypot(e.x - p.x, e.z - p.z) <= LESSON.ring;
/** The zone whose banner should warn an explorer of `level` at (x, z) on the way out of the village, or null. */
export function wildAhead(x: number, z: number, level: number): keyof typeof WILDS | null {
  const r = Math.hypot(x, z); if (r < WARN.from || r >= WARN.edge) return null;
  const id = Math.abs(x) > Math.abs(z) ? x > 0 ? 'canyon' : 'forest' : z > 0 ? 'meadow' : 'swamp'; // environments.ts zoneAt, past the fence
  return WILDS[id][1] >= level + WARN.levels ? id : null;
}

interface LessonSave { firstRun?: { seen?: readonly string[] }; counters: { kills: number }; hp: number }
export interface LessonHost {
  enemies(): readonly Enemy[];
  hero(): { x: number; z: number };
  save(): LessonSave;
}
/**
 * The rules of the first fight, without the page: which creature has the ring, whether a swing waits, what a bite may take.
 * `tend()` is called a few times a second: it prepares creatures that are new and returns the ring creature (or null).
 */
export function createLesson(h: LessonHost) {
  let pressed: unknown = null;
  const taught = new WeakSet<object>(), mine: Enemy[] = [];
  const live = () => { for (const e of mine) if (e.hp > 0) return true; return false; };
  const rules = {
    /** The creatures of the first fight, the ring creature first. */
    mine,
    tend(): Enemy | null {
      mine.length = 0; for (const e of h.enemies()) if (e.tutorial) mine.push(e);
      for (let i = 0; i < mine.length; i++) {
        const e = mine[i]; if (taught.has(e) || !e.definition) continue; taught.add(e);
        e.name = CRITTER_NAME; e.definition = { ...e.definition, name: CRITTER_NAME };
        // The first winds up slowly inside a ring; the others never reach (a creature winds up only inside its reach).
        if (i === 0) { e.definition = { ...e.definition, windup: LESSON.windup, reach: LESSON.reach }; e.warn = { r: LESSON.ring, at: 'around', color: LESSON.color }; }
        else e.definition = { ...e.definition, reach: 0 };
      }
      return mine[0] ?? null;
    },
    /** Swings still wait for the first press: a new save with no win yet, creatures of the first fight alive. */
    waiting() { const s = h.save(); return !!s.firstRun && s.counters.kills === 0 && pressed !== s && live(); },
    /** The wait is over for this save (a press, a blow that landed). */
    release() { pressed = h.save(); },
    fight(sinceSwing: number) { const p = h.hero(); return inFight(h.enemies(), p.x, p.z, undefined, sinceSwing); },
    swing(auto: boolean) { if (!rules.waiting()) return false; if (auto) return true; rules.release(); return false; },
    bite(damage: number, enemyId: string | undefined, max: number) {
      if (!enemyId) return damage;
      let from: Enemy | undefined; for (const e of h.enemies()) if (e.id === enemyId) { from = e; break; }
      if (!from?.tutorial) return damage;
      return from.warn && inRing(from, h.hero()) ? biteAllowed(damage, h.save().hp, max) : 0;
    },
  };
  return rules satisfies Lesson;
}

const CSS = `
#lesson-tip{position:fixed;left:0;top:0;z-index:41;pointer-events:none;will-change:transform}
#lesson-tip[hidden]{display:none}
#lesson-tip b{position:absolute;left:0;top:10px;translate:-50% 0;display:block;width:max-content;max-width:min(240px,calc(100vw - 32px));padding:7px 13px;border-radius:16px;background:#fffdf4;border:3px solid #ff5a36;color:#3b2a12;font-weight:900;font-size:14px;line-height:1.25;text-align:center;box-shadow:0 4px 0 rgba(58,36,51,.25)}
#app #hud .attack-pad.lesson-press{animation:lesson-press .7s ease-in-out infinite alternate;outline:4px solid #ffe14a;outline-offset:3px}
@keyframes lesson-press{from{scale:1}to{scale:1.1}}
@media (prefers-reduced-motion:reduce){#app #hud .attack-pad.lesson-press{animation:none}}
#zone-banner.danger #banner-chip{background:#d21f1f;color:#fff;box-shadow:0 0 0 2px #fff,0 0 0 4px #7a0f0f}
`;

type TipId = 'press' | 'ring' | 'finisher';
export function mount(s: GameServices) {
  const w = s.world, rules = createLesson({ enemies: () => w.enemies, hero: () => w.position, save: () => s.state() });
  w.lesson = rules;
  const style = document.createElement('style'); style.textContent = CSS; document.head.append(style);
  // The warning chip: whenever the banner's chip changes (main.ts showZone writes it), a zone far above the explorer gets the
  // warning words and the red look. It happens before the next paint, so the plain chip of such a zone is never seen.
  const chip = document.querySelector('#banner-chip'), banner = document.querySelector('#zone-banner');
  if (chip && banner) {
    const mark = () => { const warn = dangerChip(chip.textContent ?? '', s.state().level, s.t); if (warn) chip.textContent = warn; banner.classList.toggle('danger', !!chip.textContent?.startsWith(DANGER_SIGN)); };
    new MutationObserver(mark).observe(chip, { childList: true, characterData: true, subtree: true }); mark();
  }
  const tip = document.createElement('div'); tip.id = 'lesson-tip'; tip.hidden = true; tip.setAttribute('role', 'status'); tip.dataset.beat = 'tip';
  const words = document.createElement('b'); tip.append(words); (document.querySelector('#hud') ?? document.body).append(tip);
  const pad = () => document.querySelector<HTMLElement>('#hud .attack-pad');
  let shown: TipId | null = null, left = 0, placed = '', clock = 0, ring: Enemy | null = null, wasWindup = false, lastBlow = -9, blows = 0, armed = true, won: unknown = null;

  const seen = (id: FirstSeen) => !!s.state().firstRun?.seen?.includes(id);
  function show(id: TipId, text: string, seconds: number) {
    if (shown === id) return;
    shown = id; left = seconds; placed = ''; words.textContent = s.t(text); tip.dataset.beatId = 'lesson-' + id; tip.hidden = false;
  }
  function hide() { if (!shown) return; shown = null; tip.hidden = true; }
  /** Every tip sits under the explorer's feet: there it covers no button (the fight corner is full) and not the creature's own tip above it. */
  function place() {
    const p = w.screen(w.position.x, 0, w.position.z), x = Math.min(innerWidth - 136, Math.max(136, p.x)), y = p.y + 14;
    const at = `${x.toFixed(0)},${y.toFixed(0)}`; if (at === placed) return; placed = at;
    tip.style.transform = `translate(${x.toFixed(0)}px, ${y.toFixed(0)}px)`;
  }
  const pulse = (on: boolean) => { const b = pad(); if (b && b.classList.contains('lesson-press') !== on) b.classList.toggle('lesson-press', on); };
  const calm = () => !!s.modal() || !!w.interior || w.planet !== 'home';
  // A mouse click on a creature is a press too (the creature's own tip says 'Press F or click it'); a tap on a phone only walks there.
  let clicked = -9;
  document.querySelector('#world')?.addEventListener('pointerdown', e => { if ((e as PointerEvent).pointerType === 'mouse') clicked = w.time; });

  s.on('hitLanded', ({ impact }) => {
    if (!ownBlow(impact)) return;
    rules.release(); // a blow of the explorer's own landed (a skill counts): swings are free from here on
    blows = w.time - lastBlow <= CHAIN_GAP_S ? blows + 1 : 1; lastBlow = w.time;
  });
  s.on('creatureDefeat', ({ enemy, impact }) => {
    const save = s.state(); if (won === save || !firstWinNow(save, impact)) return; // a pet's, a helper's or another player's kill is not the explorer's win
    won = save; rules.release(); void s.perform('firstRunSeen', { id: 'win' }, { quiet: true });
    // The first win: a second, bigger burst on top of the creature's own, from the same pools.
    const fx = w.fx, at = { x: enemy.x, y: enemy.mesh.position.y, z: enemy.z };
    if (fx) { fx.burst(at, { n: 36, color: ['#ffe14a', '#ffffff', '#ff8a3c'], glow: true, size: .2, speed: 7.5, up: 8, life: 1, y: .8 }); fx.ring({ x: enemy.x, z: enemy.z }, { color: '#ffe14a', from: .4, to: 4.2, life: .6, y: .1 }); }
    queueMicrotask(() => s.emit('firstWin', {})); // after the game's own step of this defeat
  });

  // The ring creature's wind-up starts (world.onTelegraph, through the game's telegraph event: the creatures' voices sound its warning from the same event).
  s.on('telegraph', ({ enemy }) => {
    if (enemy !== ring || seen('tip:ring') || calm()) return;
    show('ring', 'Step out of the ring!', TIP_S); queueMicrotask(() => void s.perform('firstRunSeen', { id: 'tip:ring' }, { quiet: true }));
  });

  s.onFrame(dt => {
    // The ring's bite, the moment its wind-up ends, where world.ts lands no blow (the village's safe zone).
    if (ring) {
      const windup = ring.phase === 'windup' && ring.hp > 0;
      if (!windup && ringBites(ring, wasWindup, w.position, calm())) w.onDamage(ring.damage, 'melee', ring.id, 'body');
      wasWindup = windup;
    }
    if (shown) { if (shown !== 'press' && (left -= dt) <= 0 || calm()) hide(); else place(); }
    if ((clock += dt) < .2) return; clock = 0;
    const had = ring; ring = w.planet === 'home' ? rules.tend() : null; if (ring !== had) wasWindup = false;
    const hero = w.position, state = s.state();
    if (w.time - clicked < .6 && (w.selected as Enemy | null)?.tutorial) { clicked = -9; rules.release(); }
    // The press prompt: while swings wait and a creature of the first fight is near.
    let near = false; if (ring && !calm() && rules.waiting()) for (const e of rules.mine) if (e.hp > 0 && Math.hypot(e.x - hero.x, e.z - hero.z) < PROMPT_NEAR) { near = true; break; }
    pulse(near);
    if (near) { if (!shown) show('press', s.touch() ? 'Tap Attack!' : 'Press F!', Infinity); } else if (shown === 'press') hide();
    if (ring && blows >= 2 && w.time - lastBlow < CHAIN_GAP_S && !shown && !seen('tip:chain') && !calm()) { show('finisher', 'One more for a finisher!', TIP_S); void s.perform('firstRunSeen', { id: 'tip:chain' }, { quiet: true }); }
    // Danger ahead: the banner of a zone far above the explorer, before the fence.
    if (w.planet === 'home' && !w.interior) {
      const r = Math.hypot(hero.x, hero.z);
      if (r < WARN.rearm) armed = true;
      else if (armed && !s.modal()) { const id = wildAhead(hero.x, hero.z, state.level); if (id) { armed = false; s.showZone(WILDS[id][0], true); } } // the banner of the zone ahead; the HUD keeps the name of the place the explorer is in
    }
  });
}
