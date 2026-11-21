// The Vietnamese phrases of the feature modules: every src/features-vi/*.ts (each default-exports a table), merged the way
// src/features.ts merges them in the game. Locale tests use it so a feature's text is checked like the pack's:
//   const extra = await featurePhrases();            // the merged table ({} while no feature has phrases)
//   await addFeaturePhrases();                       // also teaches them to t(), as the game does after Start
import { existsSync, readdirSync } from 'node:fs';

const DIR = new URL('../../src/features-vi/', import.meta.url);
/** The table files, in the order the game merges them. */
export const featurePhraseFiles = () => existsSync(DIR) ? readdirSync(DIR).filter(name => name.endsWith('.ts')).sort() : [];
/** Each file's table: [[name, table], ...]. */
export async function featurePhraseTables() {
  return Promise.all(featurePhraseFiles().map(async name => [name, (await import(new URL(name, DIR).href)).default]));
}
export async function featurePhrases() { return Object.assign({}, ...(await featurePhraseTables()).map(([, table]) => table)); }
export async function addFeaturePhrases() { const { addPhrases } = await import('../../src/i18n.ts'); await addPhrases(featurePhrases); }
