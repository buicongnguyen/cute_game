import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

/** A tunnel serves the multiplayer edition at its origin, whatever the last build targeted. */
export const shareBuildEnv = (env = process.env) => ({ ...env, VITE_BASE_PATH: '/', VITE_STATIC_HOST: 'false' });

const newest = file => {
  const stat = statSync(file);
  if (!stat.isDirectory()) return stat.mtimeMs;
  return Math.max(stat.mtimeMs, ...readdirSync(file).map(name => newest(path.join(file, name))));
};

export function needsShareBuild(root, force = false) {
  const built = path.join(root, 'dist', 'index.html');
  if (force || !existsSync(built)) return true;
  try {
    const info = JSON.parse(readFileSync(path.join(root, 'dist', 'build-info.json'), 'utf8'));
    if (info.edition !== 'online' || info.base !== '/') return true;
  } catch { return true; } // Old builds have no trustworthy edition marker.
  const inputs = ['src', 'public', 'server', 'index.html', 'vite.config.ts', 'package.json', 'package-lock.json',
    ...readdirSync(root).filter(name => name === '.env' || name.startsWith('.env.'))];
  const builtAt = statSync(built).mtimeMs;
  return inputs.some(name => { const file = path.join(root, name); return existsSync(file) && newest(file) > builtAt; });
}
