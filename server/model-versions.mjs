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

/**
 * Content hash per icon and audio file, keyed by the path under assets/ ('icons/items/apple.webp'). The client appends it
 * as ?v= (src/asset-url.ts) and build-offline.mjs computes the same ones from dist, so a redeploy that left a file alone
 * keeps its URL: the offline worker copies it from the previous cache and the browser's own cache keeps answering it.
 */
export function assetVersions(directory) {
  const versions = {};
  const walk = (dir, prefix) => {
    let entries = [];
    try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      if (entry.isDirectory()) walk(path.join(dir, entry.name), `${prefix}${entry.name}/`);
      else if (/\.(webp|png|mp3|ogg)$/.test(entry.name)) versions[`${prefix}${entry.name}`] = createHash('sha256').update(readFileSync(path.join(dir, entry.name))).digest('hex').slice(0, 8);
    }
  };
  for (const folder of ['icons', 'audio']) walk(path.join(directory, folder), `${folder}/`);
  return versions;
}
