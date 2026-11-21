import { spawnSync } from 'node:child_process';

const env = {
  ...process.env,
  VITE_BASE_PATH: process.env.VITE_BASE_PATH || '/cute_game/',
  VITE_STATIC_HOST: 'true',
};
for (const args of [
  ['node_modules/typescript/bin/tsc', '--noEmit'],
  ['node_modules/vite/bin/vite.js', 'build'],
  ['server/build-offline.mjs'],
  ['promo/await-cycle.mjs'], // a chunk that waits on itself through the Vietnamese pack leaves a blank page: fail the build instead
]) {
  const result = spawnSync(process.execPath, args, { env, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}
