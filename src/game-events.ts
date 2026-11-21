/**
 * Game events: what happened, said once, for the feature modules (src/features/) that load after Start.
 * The game's own code emits at the place where the thing happens (main.ts, hud-combat.ts); features listen through
 * the services (game-services.ts), which also hold the bus itself. Nothing in the start code listens.
 *
 * Every event has a site that emits it or a named later owner; tests/game-events-main.test.mjs holds that table.
 */
import type { Enemy } from './world.ts';
import type { CombatHit } from './combat.ts';
import type { ProgressEntry } from './progression.ts';

export interface GameEvents {
  /** Once per page, right after the features are mounted (they mount after the first played frame). */
  started: Record<string, never>;
  /** One per level gained: three levels at once are three events. */
  levelUp: { level: number };
  /** The story moved to another step (compared at the HUD tick). */
  storyStep: { index: number; from: number };
  /** A quest, task, pass or achievement reward was claimed: the entry as it stood before the claim, and the energy it paid. */
  reward: { kind: string; entry: ProgressEntry; energy: number };
  /** The hero is in another zone or on another planet (compared at the HUD tick); `from` is the place before as 'planet/zone', '' at first. */
  place: { name: string; planet: string; from: string };
  /** A creature noticed the hero and starts its chase. */
  creatureAlert: { enemy: Enemy };
  /** A creature fell to a blow settled in this browser (its hp is 0); `impact` as in hitLanded, absent for a hazard. */
  creatureDefeat: { enemy: Enemy; impact?: CombatHit };
  /** A calm boss is close: inside its sight radius plus 6 m. */
  bossApproach: { enemy: Enemy };
  /** The boss bar shows a boss for the first time in this fight. */
  bossEngaged: { enemy: Enemy };
  /** A boss's stagger meter broke: it is on its knees. */
  bossBreak: { enemy: Enemy };
  /** The hero lost health: the amount after defence, and what dealt it (melee, shot, hazard; 'server' in an online room). */
  playerHurt: { amount: number; source: string };
  /**
   * A blow of the hero, a pet or a helper landed on a creature (never a hazard or another player's blow): the health it
   * took, and the blow (`impact.critical`, `impact.helper` for a pet's or helper's; absent for a plain strike).
   */
  hitLanded: { enemy: Enemy; damage: number; impact?: CombatHit };
  /** A catch was landed and is in the bag: a fish, or junk and treasure (look the id up in FISH). */
  fishCatch: { id: string; size: number; huge?: boolean; supergiant?: boolean; mystery?: boolean };
  /** The player's own harvest (not a helper's). `first` only on the harvest that settles the welcome and brings Pepper. */
  harvest: { crops: string[]; all: boolean; first: boolean };
  /** A caged friend was freed, at this spot. */
  rescue: { id: string; at: { x: number; z: number } };
  /** A rescued friend reached the village, once per friend and page. */
  friendHome: { id: string };
  /** WP17: the first tutorial win. */
  firstWin: Record<string, never>;
  /** WP12: a creature winds up an attack (through world.onTelegraph). */
  telegraph: { enemy: Enemy; time: number };
}
export type GameEvent = keyof GameEvents;
export type Listener<K extends GameEvent> = (payload: GameEvents[K]) => void;
export interface EventBus {
  /** Listens; the returned function stops listening. */
  on<K extends GameEvent>(event: K, listener: Listener<K>): () => void;
  /** Tells every listener, in the order they subscribed. A listener that throws is logged and never stops the others. */
  emit<K extends GameEvent>(event: K, payload: GameEvents[K]): void;
}
/** The listening end, which loads with the features (game-services.ts createEvents). */
export interface EventSink extends EventBus {
  /** The HUD tick's facts; the sink compares them with the tick before and emits storyStep and place. */
  note(save: unknown, story: number, zone: string, planet: string): void;
}

// The start code holds only the sending end. Until the features connect their bus nobody listens, so an event is dropped
// here for the price of one test.
let sink: EventSink | undefined;
export const connect = (bus: EventSink) => { sink = bus; };
export const emit: EventBus['emit'] = (event, payload) => sink?.emit(event, payload);
/** Called at the HUD tick with the save in play, its story index and where the hero is (storyStep and place come of it). */
export const noteProgress: EventSink['note'] = (save, story, zone, planet) => sink?.note(save, story, zone, planet);
