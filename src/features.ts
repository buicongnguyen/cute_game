/**
 * The feature modules: every src/features/*.ts, mounted once after the first played frame (main.ts loadFeatures).
 * A feature exports `mount(services)`. This file and all of them build into one lazy chunk, "features", and their
 * Vietnamese phrases (src/features-vi/*.ts, each a default-exported table that imports nothing) into "features-vi",
 * fetched only when the language is Vietnamese. Neither is part of the start download; `npm run perf:bytes` fails if
 * that changes.
 *
 * This file imports nothing from the start code at run time (addPhrases and the event bus are handed in). A feature may import game modules; it
 * should know that a static import of start code can move small shared modules between the start chunks, which
 * `npm run perf:bytes` shows as a few hundred bytes either way.
 */
import type { addPhrases } from './i18n.ts';
import { createServices, type GameServices, type ServiceHost } from './game-services.ts';

export interface Feature { mount?(services: GameServices): void }
const features = import.meta.glob<Feature>('./features/*.ts', { eager: true });
const tables = import.meta.glob<Record<string, string>>('./features-vi/*.ts', { import: 'default' });

// The names of the mounted features, for the console and for tests. It is also this chunk's side effect: Rollup folds a
// small chunk without one into the start download (experimentalMinChunkSize in vite.config.ts), so keep the line.
(globalThis as { zooFeatures?: string[] }).zooFeatures = Object.keys(features).sort();

/** The longest the features wait for their Vietnamese phrases before they mount, in ms. */
export const PHRASE_WAIT = 4000;
/** Every feature's Vietnamese phrases, merged into one table. */
export const featurePhrases = async (): Promise<Record<string, string>> => Object.assign({}, ...await Promise.all(Object.keys(tables).sort().map(file => tables[file]())));

/**
 * Makes the services of what main.ts hands over and mounts every feature with them, in file-name order. `phrases` is i18n.ts addPhrases: in Vietnamese the features' phrases are
 * fetched first, so a feature never shows English for a moment; in English they are fetched only if the player switches.
 * A feature that throws is logged and skipped; the others still mount. Returns the services (the dev hook shows them).
 */
export async function mountFeatures(host: ServiceHost, phrases: typeof addPhrases): Promise<GameServices> {
  const services = createServices(host);
  // Asked for only when a feature has phrases: adding a table re-renders the page's text, which an empty one must not cost.
  // Waited for at most PHRASE_WAIT: a request that hangs must not hold every feature back. Phrases that come later still
  // join the table and re-render the page.
  if (Object.keys(tables).length) await Promise.race([
    phrases(featurePhrases).catch(() => { /* Offline and uncached: the features mount in English; a later language switch tries again. */ }),
    new Promise(resolve => setTimeout(resolve, PHRASE_WAIT)),
  ]);
  for (const file of Object.keys(features).sort()) try { features[file].mount?.(services); } catch (error) { console.error(file, error); }
  return services;
}
