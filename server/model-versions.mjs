import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

/**
 * Content hash per model file (`{ 'cottage.glb': '1a2b3c4d5e' }`). The client appends it as ?v=
 * (vite.config.ts) and the service worker (build-offline.mjs) computes the same hashes from dist,
 * so both sides agree on which copy of a model belongs to which build.
 */
export function modelVersions(directory) {
  const versions = {};
  let names = [];
  try { names = readdirSync(directory); } catch { return versions; }
  for (const name of names.filter(n => n.endsWith('.glb')).sort()) {
    versions[name] = createHash('sha256').update(readFileSync(path.join(directory, name))).digest('hex').slice(0, 10);
  }
  return versions;
}
