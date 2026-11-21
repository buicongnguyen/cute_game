// Decisions the offline service worker makes, kept as plain functions so tests can check them and
// build-offline.mjs can paste their source into sw.js. They must not reference anything outside
// their own parameters.

/** Caches that belong to this deployment path but not to this build: dropped on activate. */
export function staleCaches(keys, version, prefix, base) {
  return keys.filter(key => key !== version && (key.startsWith(prefix) || (base === '/' && /^zoo-garden-[a-f0-9]{16}$/.test(key))));
}

/**
 * How to answer one request.
 *   skip: let the browser handle it (other origins, the API, the socket, non-GET, files this build does not have).
 *   navigate: network first, bypassing the HTTP cache, so index.html always matches the scripts it names;
 *     offline, this build's own cached index.html (whose scripts are in the same cache).
 *   pinned: cache first. Only for URLs that name one exact build of a file: Vite's hashed files and
 *     models whose ?v= content hash is the one this worker was built with.
 *   fresh: network first with a cache fallback, for everything else (unversioned or other-version models,
 *     icons, the manifest), so a new deploy never gets an old copy while the network works.
 */
export function strategy({ method, mode, origin, pathname, search }, self, base, known, pinned) {
  if (method !== 'GET' || origin !== self || !pathname.startsWith(base)) return 'skip';
  const local = pathname.slice(base.length);
  if (local === 'api' || local.startsWith('api/') || local === 'socket' || local.startsWith('socket/') || local === 'sw.js') return 'skip';
  if (mode === 'navigate') return 'navigate';
  if (!known.includes(pathname)) return 'skip';
  return pinned.includes(pathname + search) ? 'pinned' : 'fresh';
}

/**
 * Files the install does not download: the worker keeps each one the first time the game fetches it, and fills in
 * the rest in the background later (build-offline.mjs LATER). Gear models download only when something from them is
 * first worn, planet scenery only when that planet is first visited, the farm pen kit only when the pen is first
 * shown, and music (assets/audio/) only when it first plays.
 */
export const onDemand = url => /\/assets\/(models\/(gear-[a-z-]+|hero-[a-z-]+|disguises|pets|worlds-[a-z]+|farm|creatures|helper|cage|house|titans)\.glb|audio\/[^/]+)$/.test(url);

/** Vite's content-hashed output (assets/name-HASH.ext) never changes under the same name. */
export const isHashedBuildFile = url => /\/assets\/[^/]+-[A-Za-z0-9_-]{8}\.[a-z0-9]+$/.test(url);
