/**
 * What a feature module (src/features/*.ts) gets from the game: one object, handed to its mount().
 * main.ts supplies the host half (the world, the save, actions, sound, dialogs, the frame); this module adds the event
 * bus and small stored preferences. Features need nothing else from main.ts, so they load after Start, and so does
 * this module: features.ts makes the services when it mounts them (the dev hook shows them as __zoo.services from then on).
 * Sound beyond `tone` goes through `audio`, the game's one audio graph (sfx.ts). A feature takes it from here and imports
 * sfx.ts for types only: a run-time import of sfx.ts from a feature makes Rollup split that module out of the start chunk
 * into one more file fetched at start.
 */
import type { World } from './world.ts';
import type { SaveState } from './model.ts';
import type { Sound, AudioGraph } from './sfx.ts';
import type { QualityLevel } from './graphics.ts';
import type { EventBus, EventSink } from './game-events.ts';

export interface ServiceHost {
  world: World;
  /** The save in play (another object after a profile or server change: read it each time). */
  state(): SaveState;
  /** One intent through the shared rules, or the server online; undefined when refused. */
  perform<T = unknown>(type: string, payload?: Record<string, unknown>, options?: { quiet?: boolean }): Promise<T | undefined>;
  toast(message: string, icon?: string): void;
  tone(kind?: Sound): void;
  /** The game's audio graph: its one AudioContext, the buses (sfx, ui, ambience, music), duck() and the shared voice counter. */
  audio: AudioGraph;
  openDialog(type: string, title: string, body: string, kicker?: string, icon?: string): void;
  closeDialog(): void;
  /** The open dialog's type, or '' when none is open. */
  modal(): string;
  /** Runs after each drawn frame with the frame's seconds; the returned function stops it. */
  onFrame(listener: (dt: number) => void): () => void;
  /** The active save profile (0-based). */
  slot(): number;
  /** True on a touch device. */
  touch(): boolean;
  /** The explorer's health as a part of the full bar: 0 to 1. */
  health(): number;
  /** The graphics level in use right now. */
  quality(): QualityLevel;
  /** game-events.ts connect: from here on the game's events reach this bus. */
  connect(bus: EventSink): void;
}
export interface GameServices extends Omit<ServiceHost, 'connect'>, EventBus {
  /** A small stored preference of this browser; the fallback when unset or when storage is closed. */
  pref(key: string, fallback?: string): string;
  /** Stores a preference; false when storage refused it (the game carries on). */
  setPref(key: string, value: string): boolean;
}

/**
 * The event bus (game-events.ts has the events and the sending end). A listener that throws is logged and never stops
 * the others. `note` gets the HUD tick's facts and emits storyStep and place when they changed since the tick before;
 * another save (a profile, a state from the server) is a new baseline, not a step.
 */
export function createEvents(): EventSink {
  const all: Record<string, Set<(payload: never) => void>> = {};
  let seenSave: unknown, seenStory = 0, seenPlace = '';
  const bus: EventSink = {
    on(event, listener) { (all[event] ??= new Set()).add(listener); return () => { all[event].delete(listener); }; },
    emit(event, payload) { for (const listener of [...all[event] ?? []]) try { listener(payload as never); } catch (error) { console.error(error); } },
    note(save, story, zone, planet) {
      const place = planet + '/' + zone, fresh = save !== seenSave, from = seenStory, was = seenPlace;
      seenSave = save; seenStory = story; if (zone) seenPlace = place;
      if (!fresh && story !== from) bus.emit('storyStep', { index: story, from });
      if (zone && place !== was) bus.emit('place', { name: zone, planet, from: was });
    },
  };
  return bus;
}

export const PREF_PREFIX = 'zoo-garden-pref-';
/** The services of one page: the host's half, a bus connected to the game's events, and the preferences. */
export function createServices(host: ServiceHost, bus: EventSink = createEvents()): GameServices {
  const { connect, ...game } = host; connect(bus);
  return {
    ...game, on: bus.on, emit: bus.emit,
    pref(key, fallback = '') { try { return globalThis.localStorage?.getItem(PREF_PREFIX + key) ?? fallback; } catch { return fallback; } },
    setPref(key, value) { try { globalThis.localStorage.setItem(PREF_PREFIX + key, value); return true; } catch { return false; } },
  };
}
