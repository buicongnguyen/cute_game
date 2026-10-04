// Helpers rest on the UTC clock (helper-state.ts BREAKS: Bolt 21:00-24:00, the cook the last hour of every 4), so a
// test that seeds beds with Date.now() and expects a helper to work failed for 8 hours of every day, and with it the
// Pages deploy (pages.yml runs npm test first). Importing this module moves the test process's clock to today 12:xx
// UTC, a working hour for every helper; time still runs, so durations and server clocks behave as before. Break hours
// have their own tests (tests/helper-breaks.test.ts) with fixed times.
const real = Date.now.bind(Date), start = real(), day = new Date(start);
export const MIDDAY = Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), 12);
const offset = MIDDAY - start;
Date.now = () => real() + offset;
