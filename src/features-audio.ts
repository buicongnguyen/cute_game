/**
 * The audio features: every src/features-audio/*.ts (the mix and its duck, the stingers, the radio, the music director
 * with its score and tunes, the creature voices). They build into a lazy chunk of their own, "features-audio", which
 * features.ts asks for as soon as the other features are mounted: sound that can wait a moment longer does not make the
 * rest of the features a bigger download, and a chunk that fails to come costs only what is in it.
 *
 * Until these are mounted, and for good if their chunk never comes, the game sounds as it does before any feature: a
 * stinger is the success chime, the Colossus's roar the hurt cry, a pet's hit the plain hit, a creature that notices the
 * explorer the alert beep; nothing is lowered under a cue, and the radio says it is warming up.
 *
 * Like features.ts this file imports nothing from the start code at run time, and it is not pinned in vite.config.ts.
 */
import type { GameServices } from './game-services.ts';
import type { Feature } from './features.ts';

const features = import.meta.glob<Feature>('./features-audio/*.ts', { eager: true });

// The names of the audio features, for the console and for tests; also this chunk's side effect (see features.ts).
(globalThis as { zooAudioFeatures?: string[] }).zooAudioFeatures = Object.keys(features).sort();

/** Mounts every audio feature with the services the other features got, in file-name order. One that throws is logged and skipped. */
export function mountAudio(services: GameServices) {
  for (const file of Object.keys(features).sort()) try { features[file].mount?.(services); } catch (error) { console.error(file, error); }
}
