import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DAMAGE_REACH, POWER_LANE_LIFT } from '../src/feel-rules.ts';

test('"POWER READY!" has its own lane above every damage number (FIX-PLAN 3.2)', () => {
  assert.ok(POWER_LANE_LIFT >= DAMAGE_REACH + .4, `lane ${POWER_LANE_LIFT} over reach ${DAMAGE_REACH}`);
  const main = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
  assert.match(main, /t\(level>1\?'POWER ×2!':'POWER READY!'\),'xp lane'\)/);
  const fx = readFileSync(new URL('../src/fx.ts', import.meta.url), 'utf8');
  assert.match(fx, /if \(!f\.lane\) f\.pos\.y \+= dt \* 1\.4/, 'the lane does not drift up into the numbers');
});
