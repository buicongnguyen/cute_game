// The mix in numbers (docs/SOUNDS.md, AAA-PLAN WP8). Nobody can check a mix by reading code, and a build machine cannot
// listen: this renders every synthesized sound of src/sfx.ts and every stinger of src/features/stingers.ts through the
// game's own audio graph (bus, duck, compressor) in an OfflineAudioContext in Chromium, and measures what reaches the speakers.
//
//   node promo/loudness.mjs            the tables
//   node promo/loudness.mjs --check    also exit 1 when a sound is outside its band of the LOUDNESS table in src/sfx.ts
//   node promo/loudness.mjs --json f   also write everything measured to the file f
//   node promo/loudness.mjs --write    also keep the levels in promo/loudness.json, each with its recipe's signature
//                                      (promo/sound-signature.mjs): tests/sound-mix.test.ts holds the recipes to it, so run
//                                      this after changing a volume or a pitch in a recipe. Refused while a sound is outside its band.
//
// Needs a dev server of this repo (it imports the TypeScript modules as the game does):  PORT=<port>, default 5298.
// PLAYWRIGHT_MODULE=<path to playwright/index.mjs> if playwright is not found.
//
// What it prints:
//   1. Per sound, over RUNS seeded plays (each play draws its own pitch and volume, default 9): the median peak in dBFS with
//      the lowest and highest, the peak when it is the first sound of a context just made (cold), RMS and a K-weighted loudness estimate (BS.1770 filters, no gate) over the part within 20 dB
//      of the peak, that part's length, the strongest frequency and the band that holds the most energy.
//   2. Each whoosh with the hit it leads to (the hit takes the weapon of the last attack sound).
//   3. Against the game's theme on the music bus at the default sliders: how far each cue stands over the music, how deep
//      the music goes under a stinger, and the highest peak of a crowded fight at full sliders (over 0 dBFS would clip).
//   4. The LOUDNESS bands, sound by sound.
import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { signatures } from './sound-signature.mjs';

const CR = String.fromCharCode(13), LF = String.fromCharCode(10);
const args = process.argv.slice(2), check = args.includes('--check'), jsonAt = args.indexOf('--json');
const pwPath = process.env.PLAYWRIGHT_MODULE;
let chromium;
try { ({ chromium } = pwPath ? await import(pwPath.startsWith('file:') ? pwPath : pathToFileURL(pwPath).href) : createRequire(import.meta.url)('playwright')); }
catch (e) { console.error(`Playwright was not found (${e.message.split(String.fromCharCode(10))[0]}). Set PLAYWRIGHT_MODULE to the path of an installed playwright/index.mjs.`); process.exit(2); }
const base = `http://127.0.0.1:${process.env.PORT || 5298}`, RUNS = Number(process.env.RUNS || 9);

/** Runs in the page: renders and measures. Returns plain data. */
async function measure(RUNS) {
  const { Sfx, ALL_SOUNDS, STINGERS, LOUDNESS } = await import('/src/sfx.ts');
  const { installMix } = await import('/src/features/sound-mix.ts');
  const { installStingers, STINGER, LEVEL_LENGTH } = await import('/src/features/stingers.ts');
  const { MusicBox } = await import('/src/features/radio.ts');
  const RATE = 48000, dB = v => v > 0 ? 20 * Math.log10(v) : -120, round = v => Math.round(v * 10) / 10;
  const seeded = seed => () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };

  /**
   * One offline render of `seconds` through a fresh graph. Everything is planned before the render starts: the game reads
   * the context's clock when it plays, so `at(time, step)` sets the clock the game sees and runs the step (call it in time order).
   * Times count from LEAD: Chromium's compressor fades in over its first 50 ms or so, and a sound played into that reads
   * 5 to 12 dB too low (the `cold` column shows it; in the game the context has long been running).
   */
  const LEAD = .5;
  async function render(seconds, script, { seed = 1, sfxLevel = .8, musicLevel = .45, lead = LEAD } = {}) {
    const real = new OfflineAudioContext(1, Math.ceil(RATE * (seconds + lead)), RATE); let clock = lead;
    const ctx = new Proxy(real, { get(target, key) { if (key === 'currentTime') return clock; const v = target[key]; return typeof v === 'function' ? v.bind(target) : v; } });
    const sfx = new Sfx(() => ctx);
    sfx.random = seeded(seed); sfx.volume = sfxLevel; sfx.graph.music = musicLevel; installMix(sfx.graph); installStingers(sfx.graph);
    const at = (time, step) => { clock = lead + time; step(); };
    script(sfx, at, real);
    return (await real.startRendering()).getChannelData(0).subarray(Math.round(RATE * lead));
  }

  // BS.1770 K-weighting at 48 kHz: a high shelf, then a high-pass.
  const K = [[1.53512485958697, -2.69169618940638, 1.19839281085285, -1.69065929318241, .73248077421585], [1, -2, 1, -1.99004745483398, .99007225036621]];
  function loudness(d, from, to) {
    let sum = 0; const z = [[0, 0], [0, 0]];
    for (let i = from; i < to; i++) {
      let x = d[i];
      for (let s = 0; s < 2; s++) { const [b0, b1, b2, a1, a2] = K[s], y = b0 * x + z[s][0]; z[s][0] = b1 * x - a1 * y + z[s][1]; z[s][1] = b2 * x - a2 * y; x = y; }
      sum += x * x;
    }
    return sum > 0 ? -.691 + 10 * Math.log10(sum / Math.max(1, to - from)) : -120;
  }
  /** Magnitudes of a radix-2 FFT of the samples (zero-padded to `size`). */
  function spectrum(d, from, to, size = 131072) {
    const re = new Float64Array(size), im = new Float64Array(size), n = Math.min(size, to - from);
    for (let i = 0; i < n; i++) re[i] = d[from + i];
    for (let i = 1, j = 0; i < size; i++) { let bit = size >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit; if (i < j) { const t = re[i]; re[i] = re[j]; re[j] = t; } }
    for (let len = 2; len <= size; len <<= 1) {
      const ang = -2 * Math.PI / len, wr = Math.cos(ang), wi = Math.sin(ang);
      for (let i = 0; i < size; i += len) { let cr = 1, ci = 0; for (let k = 0; k < len / 2; k++) {
        const a = i + k, b = a + len / 2, xr = re[b] * cr - im[b] * ci, xi = re[b] * ci + im[b] * cr;
        re[b] = re[a] - xr; im[b] = im[a] - xi; re[a] += xr; im[a] += xi; const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t;
      } }
    }
    const power = new Float64Array(size / 2); for (let i = 0; i < size / 2; i++) power[i] = re[i] * re[i] + im[i] * im[i];
    return { power, hz: RATE / size };
  }
  const BANDS = [['sub', 0, 120], ['low', 120, 500], ['mid', 500, 2000], ['high', 2000, 6000], ['air', 6000, 24000]];
  /** Peak, the part within 20 dB of it, RMS and loudness over that part, and where the energy sits. */
  function facts(d, from = 0, to = d.length) {
    let peak = 0; for (let i = from; i < to; i++) { const a = Math.abs(d[i]); if (a > peak) peak = a; }
    if (!(peak > 1e-6)) return { peak: -120, rms: -120, lufs: -120, ms: 0, hz: 0, band: '-' };
    let first = -1, last = -1; const gate = peak / 10;
    for (let i = from; i < to; i++) if (Math.abs(d[i]) >= gate) { if (first < 0) first = i; last = i; }
    let sum = 0; for (let i = first; i <= last; i++) sum += d[i] * d[i];
    const { power, hz } = spectrum(d, from, to); let top = 1; for (let i = 2; i < power.length; i++) if (power[i] > power[top]) top = i;
    const energy = BANDS.map(([name, lo, hi]) => { let e = 0; for (let i = Math.max(1, Math.floor(lo / hz)); i < Math.min(power.length, Math.ceil(hi / hz)); i++) e += power[i]; return [name, e]; }).sort((a, b) => b[1] - a[1]);
    return { peak: dB(peak), rms: dB(Math.sqrt(sum / (last - first + 1))), lufs: loudness(d, first, last + 1), ms: Math.round((last - first + 1) / RATE * 1000), hz: Math.round(top * hz), band: energy[0][0] };
  }
  const median = list => { const s = [...list].sort((a, b) => a - b); return s[s.length >> 1]; };
  /** The facts of the play with the median peak, with the lowest and highest peak of all plays. */
  const fold = runs => { const peaks = runs.map(r => r.peak), mid = median(peaks), pick = runs.find(r => r.peak === mid); return { ...Object.fromEntries(Object.entries(pick).map(([k, v]) => [k, typeof v === 'number' ? round(v) : v])), low: round(Math.min(...peaks)), high: round(Math.max(...peaks)) }; };

  // 1. Every sound alone.
  const sounds = {};
  for (const sound of [...ALL_SOUNDS, ...STINGERS]) {
    const runs = []; for (let r = 0; r < RUNS; r++) runs.push(facts(await render(2.5, sfx => sfx.play(sound), { seed: 1 + r * 7919 })));
    sounds[sound] = fold(runs); sounds[sound].cold = round(facts(await render(2.5, sfx => sfx.play(sound), { lead: 0 })).peak);
  }
  // 2. Each attack sound, then the hit it colours half a second later.
  const pairs = {};
  for (const [whoosh, weapon] of [['swing', 'blade'], ['punch', 'fist'], ['shoot', 'gun']]) {
    const lead = [], hit = [];
    for (let r = 0; r < RUNS; r++) { const d = await render(1.5, (sfx, at) => { sfx.play(whoosh); at(.5, () => sfx.play('hit')); }, { seed: 3 + r * 7919 }); lead.push(facts(d, 0, RATE * .5)); hit.push(facts(d, RATE * .5)); }
    pairs[whoosh] = { weapon, whoosh: fold(lead), hit: fold(hit) }; pairs[whoosh].under = round(pairs[whoosh].hit.peak - pairs[whoosh].whoosh.peak);
  }

  // 3. Against the theme. The radio plays the file through its trim into the music bus (features/radio.ts).
  const mix = { cues: {}, ducks: {} };
  let theme = null;
  try { const bytes = await (await fetch('/assets/audio/zoo-garden-theme.mp3')).arrayBuffer(); theme = await new OfflineAudioContext(2, 1, RATE).decodeAudioData(bytes); } catch { /* no theme: this part is skipped */ }
  if (theme) {
    const music = (sfx, ctx, offset = 20) => { const src = ctx.createBufferSource(), trim = ctx.createGain(); src.buffer = theme; src.loop = true; trim.gain.value = MusicBox.TRIM; src.connect(trim); trim.connect(sfx.graph.nodes.music?.bus ?? sfx.graph.bus('music')); src.start(0, offset % theme.duration); };
    const alone = await render(4, (sfx, at, ctx) => music(sfx, ctx)), bed = facts(alone);
    mix.music = { peak: round(bed.peak), rms: round(dB(Math.sqrt(alone.reduce((s, v) => s + v * v, 0) / alone.length))), lufs: round(loudness(alone, 0, alone.length)) };
    for (const sound of ['punch', 'cast', 'swing', 'ready', 'alert', 'hit', 'crit', 'power', 'click', 'level', ...STINGERS.filter(s => s !== 'levelUp')]) {
      const both = facts(await render(4, (sfx, at, ctx) => { music(sfx, ctx); at(1, () => sfx.play(sound)); }));
      mix.cues[sound] = { overMusicPeak: round(sounds[sound].peak - mix.music.rms), overMusicLoudness: round(sounds[sound].lufs - mix.music.lufs), mixPeak: round(both.peak) };
    }
    const rmsOf = (d, a, b) => { let s = 0; for (let i = Math.floor(a * RATE); i < Math.floor(b * RATE); i++) s += d[i] * d[i]; return dB(Math.sqrt(s / Math.max(1, Math.floor(b * RATE) - Math.floor(a * RATE)))); };
    for (const [name, length] of [['level', LEVEL_LENGTH], ...Object.entries(STINGER).map(([n, s]) => [n, s.length])]) {
      // The music alone, lowered as the stinger lowers it: the stinger itself would hide what the music does.
      const d = await render(4, (sfx, at, ctx) => { music(sfx, ctx); at(1, () => sfx.graph.duck('music', 6, length)); });
      const held = Math.max(1.12, 1 + length - .02);
      mix.ducks[name] = { length, depth: round(rmsOf(d, 1.1, held) - rmsOf(alone, 1.1, held)), after: round(rmsOf(d, 1 + length + .6, 1 + length + 1.2) - rmsOf(alone, 1 + length + .6, 1 + length + 1.2)) };
    }
    // A crowded fight with both sliders at the top: 3 s of blows every 45 ms over the theme, a power strike, a win.
    const brawl = ['swing', 'hit', 'hitHeavy', 'crit', 'punch', 'hit', 'poof', 'coin', 'boom', 'hurt', 'thud', 'shoot', 'zap', 'break'];
    const d = await render(4.5, (sfx, at, ctx) => { music(sfx, ctx); for (let i = 0; i < 66; i++) at(.2 + i * .045, () => sfx.play(brawl[i % brawl.length])); at(1.5, () => sfx.play('power')); at(2.4, () => { sfx.play('level'); sfx.play('victory'); }); }, { sfxLevel: 1, musicLevel: 1, seed: 11 });
    mix.brawl = { peak: round(facts(d).peak) };
  }

  // 4. The bands.
  const verdicts = [], judge = (kind, sound, value, lo, hi, what) => verdicts.push({ kind, sound, value, band: [lo, hi], what, ok: value >= lo - .05 && value <= hi + .05 });
  for (const kind of ['impact', 'ui', 'cue']) for (const sound of LOUDNESS[kind].sounds) judge(kind, sound, sounds[sound].peak, ...LOUDNESS[kind].peak, 'peak dBFS');
  for (const [whoosh, p] of Object.entries(pairs)) if (whoosh !== 'punch') judge('impact', `hit (${p.weapon})`, p.hit.peak, ...LOUDNESS.impact.peak, 'peak dBFS');
  for (const whoosh of Object.keys(LOUDNESS.whoosh.of)) judge('whoosh', whoosh, pairs[whoosh].under, ...LOUDNESS.whoosh.under, `dB under its hit (${pairs[whoosh].weapon})`);
  for (const sound of LOUDNESS.whoosh.sounds) judge('whoosh', sound, sounds[sound].peak, LOUDNESS.whoosh.floor, 0, 'peak dBFS, at least');
  return { runs: RUNS, sounds, pairs, mix, verdicts };
}

const browser = await chromium.launch();
let out;
try {
  const page = await browser.newPage();
  page.on('pageerror', e => console.error('page error:', e.message));
  await page.goto(`${base}/favicon.svg`, { timeout: 30000 });
  out = await page.evaluate(measure, RUNS);
} catch (e) { console.error(`Could not measure at ${base} (${e.message.split('\n')[0]}). Is the dev server running? Set PORT.`); process.exitCode = 2; }
finally { await browser.close(); }
if (out) {
  const n = (v, w = 7) => String(v).padStart(w);
  console.log(`1. Every sound alone (${out.runs} plays; default sliders; dBFS at the speakers)`);
  console.log(`${'sound'.padEnd(13)}${n('peak')}${n('low')}${n('high')}${n('cold')}${n('rms')}${n('LKFS~')}${n('ms')}${n('Hz')}  band`);
  for (const [name, r] of Object.entries(out.sounds)) console.log(`${name.padEnd(13)}${n(r.peak)}${n(r.low)}${n(r.high)}${n(r.cold)}${n(r.rms)}${n(r.lufs)}${n(r.ms)}${n(r.hz)}  ${r.band}`);
  console.log('\n2. A whoosh and the hit it leads to');
  for (const [name, p] of Object.entries(out.pairs)) console.log(`${name.padEnd(8)}${n(p.whoosh.peak)}   hit (${p.weapon})${n(p.hit.peak)}   the whoosh is ${p.under} dB under`);
  if (out.mix.music) {
    const m = out.mix.music;
    console.log(`\n3. Against the theme on the music bus (music slider 0.45): music peak ${m.peak}, RMS ${m.rms}, loudness ${m.lufs}`);
    console.log(`${'cue'.padEnd(13)}${n('peak over music RMS', 21)}${n('loudness over music', 21)}${n('peak of the mix', 17)}`);
    for (const [name, c] of Object.entries(out.mix.cues)) console.log(`${name.padEnd(13)}${n(c.overMusicPeak, 21)}${n(c.overMusicLoudness, 21)}${n(c.mixPeak, 17)}`);
    console.log(`\n${'duck under'.padEnd(13)}${n('length s', 10)}${n('music while held, dB', 22)}${n('music 0.6 s after, dB', 23)}`);
    for (const [name, d] of Object.entries(out.mix.ducks)) console.log(`${name.padEnd(13)}${n(d.length, 10)}${n(d.depth, 22)}${n(d.after, 23)}`);
    console.log(`\nA crowded fight over the theme, both sliders at the top: peak ${out.mix.brawl.peak} dBFS (${out.mix.brawl.peak < 0 ? 'no clipping' : 'CLIPS'})`);
  } else console.log('\n3. The theme could not be read: the part against music was skipped.');
  console.log('\n4. The LOUDNESS bands (src/sfx.ts)');
  for (const v of out.verdicts) console.log(`${v.ok ? 'ok  ' : 'OUT '} ${v.kind.padEnd(7)}${v.sound.padEnd(14)}${n(v.value)}  ${v.what} [${v.band[0]}, ${v.band[1]}]`);
  const bad = out.verdicts.filter(v => !v.ok).length + (out.mix.brawl && !(out.mix.brawl.peak < 0) ? 1 : 0);
  console.log(bad ? `\n${bad} outside the bands.` : '\nEvery sound is inside its band.');
  if (jsonAt >= 0 && args[jsonAt + 1]) writeFileSync(args[jsonAt + 1], JSON.stringify(out, null, 1));
  if (check && bad) process.exitCode = 1;
  if (args.includes('--write')) {
    if (bad) { console.error('Not written: tune the sounds into their bands first.'); process.exitCode = 1; }
    else {
      const { Sfx } = await import('../src/sfx.ts'), { installStingers } = await import('../src/features/stingers.ts');
      const sig = signatures(Sfx, Object.keys(out.sounds), installStingers);
      const kept = {
        about: 'Measured by promo/loudness.mjs --write: dBFS at the speakers, sliders at their defaults, the median of seeded plays. Do not edit by hand.',
        sounds: Object.fromEntries(Object.entries(out.sounds).map(([name, r]) => [name, { peak: r.peak, low: r.low, high: r.high, loudness: r.lufs, ms: r.ms, band: r.band, recipe: sig[name] }])),
        hits: Object.fromEntries(Object.entries(out.pairs).map(([name, p]) => [name, { weapon: p.weapon, whoosh: p.whoosh.peak, hit: p.hit.peak, under: p.under }])),
        music: out.mix.music ?? null, brawl: out.mix.brawl ?? null,
      };
      const file = fileURLToPath(new URL('./loudness.json', import.meta.url));
      // One line per sound, so a change shows as that sound's line.
      const rows = table => '{' + LF + Object.entries(table).map(([name, row]) => `  ${JSON.stringify(name)}: ${JSON.stringify(row)}`).join(',' + LF) + LF + ' }';
      const text = '{' + LF + Object.entries(kept).map(([key, value]) => ` ${JSON.stringify(key)}: ${key === 'sounds' || key === 'hits' ? rows(value) : JSON.stringify(value)}`).join(',' + LF) + LF + '}' + LF;
      writeFileSync(file, text.replaceAll(LF, CR + LF)); console.log('Written: promo/loudness.json');
    }
  }
}
