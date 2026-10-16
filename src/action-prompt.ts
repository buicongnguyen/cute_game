/**
 * The context (action) button, #context-prompt (owner request 2026-10-16). It used to show only a name ("Your cottage",
 * "Workshop") and to pop in and out mid-screen, switching between nearby things while the explorer walked.
 *
 * - promptLabel: a verb and an icon per kind of thing ("🚪 Enter cottage", "🔨 Open workshop"); unknown kinds keep their own
 *   icon and name. English keys: main.ts runs them through t() (Vietnamese in locales/vi-prompt.ts).
 * - PromptFocus: what the button refers to. A new thing shows once it has been the nearest for PROMPT_SHOW_S, the button stays
 *   PROMPT_HIDE_S after its thing went out of reach (walking past never flickers), and once shown the thing is kept while it
 *   stays in reach unless another is clearly nearer (PROMPT_SWITCH_M).
 *
 * Pure: no DOM, no three.js. main.ts steps it on the HUD tick (about every 0.13 s) and writes the DOM only when it changes.
 */

/** Seconds a thing must be the nearest before the button shows it. The HUD ticks about every 0.13 s, so this is "two ticks in a row". */
export const PROMPT_SHOW_S = .12;
/** Seconds the button stays after its thing went out of reach with nothing else to show. */
export const PROMPT_HIDE_S = .25;
/** Another thing takes the button over only when it is this many metres nearer than the shown one. */
export const PROMPT_SWITCH_M = .8;

/** kind → [icon, English label]; `{name}` is the thing's own (translated) name. */
export const PROMPT_VERBS: Readonly<Record<string, readonly [string, string]>> = {
  home: ['🚪', 'Enter cottage'], 'house-door': ['🚪', 'Go outside'], 'house-wardrobe': ['👕', 'Open wardrobe'], 'house-mirror': ['🪞', 'Use mirror'], 'house-bench': ['🛠️', 'Use upgrade bench'],
  craft: ['🔨', 'Open workshop'], chest: ['📦', 'Open chest'], sell: ['🛒', 'Sell at market'], shop: ['🛍️', 'Open shop'], cook: ['🍳', 'Cook'],
  upgrade: ['💎', 'Use energy crystal'], well: ['🪨', 'Visit Ember Well'], travel: ['🚀', 'Board starship'], fish: ['🎣', 'Go fishing'],
  pen: ['🐔', 'Visit animal pen'], animal: ['🐔', 'Visit animal pen'], decoration: ['🪴', 'Arrange decoration'], cage: ['🗝️', 'Open cage'],
  friend: ['💬', 'Talk to {name}'], dropped: ['🎒', 'Pick up backpack'], gift: ['🎁', 'Open present'], mine: ['⛏️', 'Mine crystal'],
  'meteor-ore': ['☄️', 'Mine meteor'], 'fire-crystal': ['⛏️', 'Mine fire crystal'], 'magma-ore': ['⛏️', 'Mine magma ore'], 'obsidian-ore': ['⛏️', 'Mine obsidian'],
  clam: ['🐚', 'Open clam'], fruit: ['🍎', 'Pick fruit'], bounce: ['☁️', 'Jump to next island'], turtle: ['🐢', 'Ride turtle'], 'light-pillar': ['💡', 'Light pillar'],
  brazier: ['🔥', 'Light brazier'], furnace: ['🔥', 'Use furnace'], 'cave-gate': ['⛏️', 'Break gate'], 'cave-chest': ['🧰', 'Open treasure chest'],
  'ctf-keeper': ['💬', 'Talk to {name}'], 'ctf-gate': ['🌀', 'Enter gate'], 'dungeon-keeper': ['💬', 'Talk to {name}'], 'dungeon-portal': ['🌀', 'Next room'],
  'rescue-portal': ['📯', 'Open rescue portal'], enemy: ['⚔️', 'Attack {name}'],
};

export interface PromptThing { kind: string; name: string; icon: string }
/** What main.ts knows about the thing beyond its kind: a bed's state, an animal with produce ready, a house activity's own verb. */
export interface PromptExtra { plot?: 'empty' | 'growing' | 'ripe'; ready?: boolean; verb?: { icon: string; text: string } }

/** The button's icon and English label (with `{name}` still in it) for a thing. */
export function promptLabel(e: PromptThing, x: PromptExtra = {}): { icon: string; text: string } {
  if (e.kind === 'plot') return x.plot === 'ripe' ? { icon: '🌾', text: 'Harvest crop' } : x.plot === 'growing' ? { icon: '🌿', text: 'Check crop' } : { icon: '🌱', text: 'Plant a seed' };
  if (e.kind === 'animal' && x.ready) return { icon: '🥚', text: 'Collect produce' };
  if (e.kind === 'pen' && /site$/i.test(e.name)) return { icon: '🔨', text: 'Build animal pen' };
  if (x.verb) return x.verb;
  const v = Object.hasOwn(PROMPT_VERBS, e.kind) ? PROMPT_VERBS[e.kind] : undefined;
  return v ? { icon: v[0], text: v[1] } : { icon: e.icon, text: '{name}' };
}

/** Which thing the button refers to; steps on the HUD tick. Generic so tests can use plain objects. */
export class PromptFocus<T> {
  target: T | null = null;
  private pending: T | null = null; private waited = 0; private gone = 0;
  /**
   * `candidate`: the game's nearest thing now (world.nearest()); `inReach`: the shown thing is still valid and in reach;
   * `gap`: a thing's interact distance (interact-pick.ts). Returns the thing to show, or null.
   */
  step(dt: number, candidate: T | null, inReach: (e: T) => boolean, gap: (e: T) => number): T | null {
    const cur = this.target;
    if (cur && inReach(cur)) {
      this.gone = 0; this.pending = null; this.waited = 0;
      if (candidate && candidate !== cur && gap(candidate) < gap(cur) - PROMPT_SWITCH_M) this.target = candidate;
      return this.target;
    }
    if (cur) {
      // Out of reach: hand over at once to the next thing (no fade between two neighbours), else hold the button a moment.
      if (candidate && candidate !== cur) { this.target = candidate; this.gone = 0; return candidate; }
      this.gone += dt; if (this.gone < PROMPT_HIDE_S) return cur;
      this.target = null; this.gone = 0;
    }
    if (!candidate) { this.pending = null; this.waited = 0; return null; }
    if (candidate !== this.pending) { this.pending = candidate; this.waited = 0; return null; }
    this.waited += dt;
    if (this.waited >= PROMPT_SHOW_S) { this.target = candidate; this.pending = null; this.waited = 0; }
    return this.target;
  }
  /** Forget everything (a dialog opened, a map change). */
  reset() { this.target = this.pending = null; this.waited = this.gone = 0; }
}
