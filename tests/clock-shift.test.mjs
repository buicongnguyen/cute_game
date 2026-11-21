// tests/support/clock-shift.mjs, the preload behind `npm run test:timeshift`: it must really move the clock, or a
// green time-shift run would mean nothing.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

const preload = new URL('./support/clock-shift.mjs', import.meta.url), midday = new URL('./support/midday-clock.mjs', import.meta.url);
const DAY = 86_400_000;
/** Run a script in a fresh Node process with the preload and a shift; the script's JSON output comes back. */
function shifted(days, script) {
  const env = { ...process.env, NODE_OPTIONS: '' }; delete env.CLOCK_SHIFT_DAYS; if (days !== undefined) env.CLOCK_SHIFT_DAYS = String(days);
  const run = spawnSync(process.execPath, ['--import', preload.href, '--input-type=module', '-e', script], { env, encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr); return JSON.parse(run.stdout);
}
// The test process itself may be running shifted (test:timeshift), so the real time comes from a child with no shift.
const realNow = () => shifted(undefined, 'console.log(Date.now())');
const near = (actual, expected, message) => assert.ok(Math.abs(actual - expected) < 60_000, `${message}: ${actual - expected} ms off`);

test('the preload moves Date.now(), new Date() and Date() by CLOCK_SHIFT_DAYS, and nothing else', () => {
  for (const days of [45, 400]) {
    const real = realNow();
    const out = shifted(days, `console.log(JSON.stringify({ now: Date.now(), made: new Date().getTime(), text: Date.parse(Date()), fixed: new Date(2020, 0, 2).getTime(), parsed: new Date('2031-05-06T00:00:00Z').toISOString(),
      utc: Date.UTC(2020, 0, 2), isDate: new Date() instanceof Date, same: new Date(5).constructor === Date, tag: Object.prototype.toString.call(new Date()) }))`);
    near(out.now, real + days * DAY, `Date.now() at +${days}`); near(out.made, real + days * DAY, `new Date() at +${days}`); near(out.text, real + days * DAY, `Date() at +${days}`);
    assert.equal(out.fixed, new Date(2020, 0, 2).getTime(), 'a date built from numbers is untouched');
    assert.equal(out.parsed, '2031-05-06T00:00:00.000Z'); assert.equal(out.utc, Date.UTC(2020, 0, 2));
    assert.deepEqual([out.isDate, out.same, out.tag], [true, true, '[object Date]']);
  }
});

test('with no shift the clock is left alone', () => {
  const real = realNow();
  for (const days of [undefined, 0, 'soon']) { const out = shifted(days, 'console.log(JSON.stringify({ now: Date.now(), made: new Date().getTime(), marked: "clockShiftDays" in Date }))'); near(out.now, real, 'Date.now()'); near(out.made, real, 'new Date()'); assert.equal(out.marked, false); }
});

test('a frozen clock is not moved (freezing is the fix for a date bomb), and the midday clock sits on the shifted day', () => {
  const frozen = shifted(400, `import { mock } from 'node:test'; mock.timers.enable({ apis: ['Date'], now: Date.UTC(2026, 9, 17, 6) });
    const during = [Date.now(), new Date().getTime()]; mock.timers.reset(); console.log(JSON.stringify({ during, after: Date.now() }))`);
  assert.deepEqual(frozen.during, [Date.UTC(2026, 9, 17, 6), Date.UTC(2026, 9, 17, 6)]); near(frozen.after, realNow() + 400 * DAY, 'the shift is back after the freeze');
  const noon = shifted(45, `const { MIDDAY } = await import(${JSON.stringify(midday.href)}); console.log(JSON.stringify({ MIDDAY, now: Date.now(), made: new Date().getTime() }))`);
  const day = new Date(realNow() + 45 * DAY), expected = Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), 12);
  assert.ok(Math.abs(noon.MIDDAY - expected) <= DAY, 'noon of the shifted day (or its neighbour, at midnight)'); near(noon.now, noon.MIDDAY, 'Date.now() at shifted noon'); near(noon.made, noon.MIDDAY, 'new Date() follows the midday patch');
});
