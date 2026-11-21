// Finds date bombs: tests that pass today and fail on a later day (a hard-coded "future" date that arrives, a season
// or event window that closes, a helper's rest hour). One of those blocks the Pages deploy, which runs npm test first.
//
// As a preload (`node --import ./tests/support/clock-shift.mjs`) it moves the process's clock CLOCK_SHIFT_DAYS days
// ahead: Date.now(), new Date() and Date() all read the shifted time; time still runs, and a date built from numbers or
// text is untouched. A test that freezes the clock (node:test mock timers, as tests/main-locale.test.mjs does) is not
// moved, which is the point: freezing is the fix. tests/support/midday-clock.mjs sits on top of the shifted clock.
//
// Run directly it is the runner behind `npm run test:timeshift`:
//   node tests/support/clock-shift.mjs 45 400                      the whole suite at +45 and at +400 days
//   node tests/support/clock-shift.mjs 45 tests/farm.test.ts       chosen files at +45 days
// The preload goes in through NODE_OPTIONS, so servers and workers the tests start share the shifted clock.
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const DAY = 86_400_000;
const days = Number(process.env.CLOCK_SHIFT_DAYS ?? 0);
const direct = !!process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (!direct && Number.isFinite(days) && days !== 0 && !globalThis.Date.clockShiftDays) {
  const Real = globalThis.Date, realNow = Real.now.bind(Real), offset = days * DAY;
  Real.now = () => realNow() + offset;
  // Date.now is read again at each use, so a later patch of it (midday-clock.mjs) moves new Date() too.
  globalThis.Date = new Proxy(Real, {
    construct: (target, args, newTarget) => Reflect.construct(target, args.length ? args : [target.now()], newTarget),
    apply: target => new target(target.now()).toString(),
  });
  Real.prototype.constructor = globalThis.Date; // so `value.constructor === Date` still holds
  Object.defineProperty(Real, 'clockShiftDays', { value: days, enumerable: false });
}

if (direct) {
  const shifts = process.argv.slice(2).filter(arg => /^[+-]?\d+(\.\d+)?$/.test(arg)).map(Number);
  const files = process.argv.slice(2).filter(arg => !/^[+-]?\d+(\.\d+)?$/.test(arg));
  if (!shifts.length) { console.error('usage: node tests/support/clock-shift.mjs <days> [<days> ...] [test files]'); process.exit(2); }
  const preload = `--import=${import.meta.url}`, failed = [];
  for (const shift of shifts) {
    console.log(`\n=== clock +${shift} days (${new Date(Date.now() + shift * DAY).toISOString().slice(0, 10)}) ===`);
    const run = spawnSync(process.execPath, ['--experimental-strip-types', '--test', ...(files.length ? files : ['tests/*.test.ts', 'tests/*.test.mjs'])],
      { stdio: 'inherit', env: { ...process.env, CLOCK_SHIFT_DAYS: String(shift), NODE_OPTIONS: [process.env.NODE_OPTIONS, preload].filter(Boolean).join(' ') } });
    if (run.status !== 0) failed.push(shift);
  }
  console.log(failed.length ? `\ntest:timeshift FAILED at ${failed.map(shift => `+${shift}`).join(', ')} days` : `\ntest:timeshift passed at ${shifts.map(shift => `+${shift}`).join(', ')} days`);
  process.exit(failed.length ? 1 : 0);
}
