// The music in numbers and in clips (docs/SOUNDS.md, AAA-PLAN WP13). Nobody can listen on a build machine: this plays the
// music director (src/features/music-director.ts) and its live score through the game's own audio graph (music bus,
// duck, compressor) in an OfflineAudioContext in Chromium, with the same code the game runs, and measures what reaches the speakers.
//
//   node promo/music-clips.mjs            the tables, and the clips with their listen page in .scratch/owner/music/
//   node promo/music-clips.mjs --check    also exit 1 when a tune is more than 2 LU from the theme, a peak passes -1 dBFS,
//                                         the music is not under the blows and cues, or a crowded fight over it clips
//   node promo/music-clips.mjs --write    also keep the levels in promo/music-levels.json, each with its tune's signature:
//                                         tests/music-score.test.ts holds the tunes to it, so run this after changing a tune,
//                                         a level or the score. Refused while --check would fail.
//   node promo/music-clips.mjs --no-clips the tables only
//   node promo/music-clips.mjs --quick    the first two tables only (while tuning a level)
//   node promo/music-clips.mjs --json f   also write everything measured to the file f
//
// Needs a dev server of this repo (it imports the TypeScript modules as the game does):  PORT=<port>, default 5298.
// PLAYWRIGHT_MODULE=<path to playwright/index.mjs> if playwright is not found.
//
// What it prints:
//   1. Per tune: key, mode, tempo, how long before a phrase can come again, notes a second, the most voices at once (desktop
//      and touch), and 30 s of it on the music bus at the default sliders: peak, RMS and a K-weighted loudness estimate
//      (BS.1770 filters, no gate), beside the recorded theme played the same way.
//   2. The layers: the tune of a place with the chase drums, and the touch version (6 voices, no pad).
//   3. The music under the effects: the peak of blows and cues (promo/loudness.json) over the music's RMS, the duck under
//      a stinger, and the peak of a crowded fight over the boss tune with both sliders at the top.
//   4. A session: village, forest, a chase, a boss, the win, back to the village with the theme, its rest, the cottage.
//      Per second: the state, what plays, the bus RMS, the notes and drum strokes begun.
// The clips (48 kHz, 16 bit, as loud as in the game at the default sliders): village, forest, danger, boss (20 s each),
// the theme (20 s, to compare) and two minutes of the village's variations without its rests.
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL, fileURLToPath } from 'node:url';

const LF = String.fromCharCode(10);
export const MODE_NAMES = ['major', 'dorian', 'phrygian', 'lydian', 'mixolydian', 'minor'];
const NOTE_NAMES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
export const keyName = tune => `${NOTE_NAMES[tune.key % 12]} ${MODE_NAMES[tune.mode ?? 0]}`;

/**
 * What a tune is, as one short string: its entry, the score's levels, and the notes of its first 16 bars for a desktop and
 * for a touch device. It changes when the tune, a level or the way the score writes notes changes.
 */
export async function signatures() {
  const { MUSIC } = await import('../src/features/music-content.ts'), score = await import('../src/features/music-score.ts'), { TRIM } = await import('../src/features/music-director.ts');
  const out = {};
  for (const [id, tune] of Object.entries(MUSIC)) {
    if (!tune.progs) continue;
    const hash = createHash('sha256').update(JSON.stringify([tune, MUSIC.danger, score.LEVEL, score.ECHO, TRIM]));
    for (const lite of [false, true]) { const s = new score.Score(tune, 1, lite); for (let i = 0; i < 128; i++) { const n = s.next(i >= 64); for (let k = 0; k < n; k++) { const note = s.notes[k]; hash.update(`${note.kind}:${note.f.toFixed(2)}:${note.len.toFixed(3)}:${note.amp.toFixed(4)};`); } hash.update('|'); } }
    out[id] = hash.digest('hex').slice(0, 12);
  }
  return out;
}

/** The score alone, without any audio: per tune the notes a second and the most voices at once, over three minutes. */
export async function scoreFacts() {
  const { MUSIC } = await import('../src/features/music-content.ts'), { Score } = await import('../src/features/music-score.ts');
  const out = {};
  for (const [id, tune] of Object.entries(MUSIC)) {
    if (!tune.progs) continue;
    const facts = {};
    for (const lite of [false, true]) {
      const s = new Score(tune, 1, lite), eighth = s.beat / 2, steps = Math.round(180 / eighth), ends = []; let notes = 0, most = 0; const ids = new Set();
      for (let i = 0; i < steps; i++) { const at = i * eighth, n = s.next(false); ids.add(s.id); for (let k = 0; k < n; k++) { ends.push(at + s.notes[k].len); notes++; } const live = ends.filter(e => e > at).length; if (live > most) most = live; }
      facts[lite ? 'touch' : 'desktop'] = { notesPerSecond: Math.round(notes / 180 * 10) / 10, mostAtOnce: most, progressions: ids.size };
    }
    out[id] = { ...facts, phraseSeconds: Math.round(32 * 60 / tune.bpm * 10) / 10 };
  }
  return out;
}

/** Runs in the page: renders and measures. Returns plain data. */
async function measure({ clips, quick }) {
  const { Sfx } = await import('/src/sfx.ts');
  const { installMix } = await import('/src/features/sound-mix.ts');
  const { installStingers } = await import('/src/features/stingers.ts');
  const { audioLevels } = await import('/src/audio-settings.ts');
  const { MUSIC, HOME_ZONES } = await import('/src/features/music-content.ts');
  const { Director, newScene, FADE } = await import('/src/features/music-director.ts');
  const DRUM = 3, HAT = 4;
  const RATE = 48000, LEAD = .5, dB = v => v > 1e-6 ? 20 * Math.log10(v) : -120, round = v => Math.round(v * 10) / 10;
  const seeded = seed => () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  // Every note the players begin, for the session table: [time, kind].
  // Nothing may be taken out of an offline graph: a deck that is closed during the planning would be silent from the start.
  Director.prototype.close = () => {};
  // The player's own play() is wrapped as soon as the first player exists (its class is taken from the director's deck, not imported: after an edit a dev server may hand a page two copies of a module).
  let begun = [], wrapped = false;
  const wrap = director => { const player = director.decks.find(d => d.player)?.player; if (!player) return; const proto = Object.getPrototypeOf(player), play = proto.play; proto.play = function (note, at) { begun.push([at, note.kind]); return play.call(this, note, at); }; wrapped = true; };

  /**
   * One offline render of `seconds` of the director through a fresh graph. Everything is planned before the render starts:
   * the game reads the context's clock, so the loop sets the clock the game sees, ten times a second as mount() does.
   * `script`: [seconds, step(scene, sfx, director)] in time order. `rests`: the village rests as in the game (otherwise a tune plays on). Times count from LEAD (Chromium's compressor fades in
   * over its first 50 ms or so; promo/loudness.mjs has the story).
   */
  async function session(seconds, script, { lite = false, live = true, theme = null, rests = false, sfxLevel = .8, musicLevel = .45, seed = 1 } = {}) {
    const real = new OfflineAudioContext(1, Math.ceil(RATE * (seconds + LEAD)), RATE); let clock = 0;
    const ctx = new Proxy(real, { get(target, key) { if (key === 'currentTime') return clock; const v = target[key]; return typeof v === 'function' ? v.bind(target) : v; } });
    const sfx = new Sfx(() => ctx); sfx.random = seeded(seed); sfx.volume = sfxLevel; installMix(sfx.graph); installStingers(sfx.graph, () => {});
    audioLevels.music = musicLevel;
    const director = new Director(sfx.graph, lite, seed), scene = newScene(), log = []; director.can = live; director.theme = theme; begun = [];
    let next = 0;
    for (let i = 0; i <= Math.floor(seconds * 10); i++) {
      clock = LEAD + i / 10;
      while (next < script.length && script[next][0] <= i / 10 + 1e-9) script[next++][1](scene, sfx, director);
      director.tick(scene); if (!wrapped) wrap(director); if (!rests && director.cur?.player) director.until = director.cur.until = Infinity;
      if (i % 10 === 0) log.push({ t: i / 10, state: director.name, plays: director.resting ? '(rest)' : director.key ? director.cur?.src ? 'theme' : director.key : '-' });
    }
    const data = (await real.startRendering()).getChannelData(0).subarray(Math.round(RATE * LEAD));
    for (const row of log) { let notes = 0, drums = 0; for (const [at, kind] of begun) if (at - LEAD >= row.t && at - LEAD < row.t + 1) { notes++; if (kind === DRUM || kind === HAT) drums++; } row.notes = notes; row.drums = drums; }
    audioLevels.music = .45;
    return { data, log };
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
  const rmsOf = (d, a, b) => { const from = Math.floor(a * RATE), to = Math.min(d.length, Math.floor(b * RATE)); let s = 0; for (let i = from; i < to; i++) s += d[i] * d[i]; return dB(Math.sqrt(s / Math.max(1, to - from))); };
  const peakOf = (d, a = 0, b = d.length / RATE) => { let peak = 0; for (let i = Math.floor(a * RATE); i < Math.min(d.length, Math.floor(b * RATE)); i++) { const v = Math.abs(d[i]); if (v > peak) peak = v; } return dB(peak); };
  /** The RMS of what is above about 6 kHz (two one-pole high-passes): the tunes have next to nothing there, the shaker of the drums lives there. */
  const airOf = (d, a, b) => { const from = Math.floor(a * RATE), to = Math.min(d.length, Math.floor(b * RATE)), k = 1 / (1 + 2 * Math.PI * 6000 / RATE); let x1 = 0, y1 = 0, y2 = 0, s = 0; for (let i = from; i < to; i++) { const y = k * (y1 + d[i] - x1), z = k * (y2 + y - y1); x1 = d[i]; y1 = y; y2 = z; s += z * z; } return dB(Math.sqrt(s / Math.max(1, to - from))); };
  /** Peak, RMS, loudness and the top band of a stretch (seconds). */
  const facts = (d, a, b) => ({ peak: round(peakOf(d, a, b)), rms: round(rmsOf(d, a, b)), lufs: round(loudness(d, Math.floor(a * RATE), Math.min(d.length, Math.floor(b * RATE)))), air: round(airOf(d, a, b)) });

  /** Puts the scene where a tune plays. */
  const zoneOf = Object.fromEntries(Object.entries(HOME_ZONES).map(([zone, id]) => [id, zone]));
  const place = (scene, id) => {
    Object.assign(scene, newScene());
    if (zoneOf[id]) scene.zone = zoneOf[id]; else if (id === 'boss') scene.boss = true; else if (id === 'space') scene.space = true;
    else if (['ctf', 'rescue', 'vault'].includes(id)) scene.mode = id; else scene.planet = id;
  };
  const tunes = Object.keys(MUSIC).filter(id => MUSIC[id].progs);
  let theme = null;
  try { const bytes = await (await fetch('/assets/' + MUSIC.village.file)).arrayBuffer(); theme = await new OfflineAudioContext(2, 1, RATE).decodeAudioData(bytes); } catch { /* no theme: compared with nothing */ }

  // 1. Every tune alone: 30 s of it, after its fade in.
  const out = { tunes: {}, layers: {}, mix: {}, theme: null, themeFacts: theme ? { seconds: round(theme.duration), channels: theme.numberOfChannels, megabytes: round(theme.length * theme.numberOfChannels * 4 / 1048576) } : null };
  const WINDOW = [FADE + .7, FADE + 30.7];
  if (theme) out.theme = facts((await session(33, [[0, s => place(s, 'village')]], { live: false, theme })).data, ...WINDOW);
  for (const id of tunes) out.tunes[id] = facts((await session(33, [[0, s => place(s, id)]])).data, ...WINDOW);
  // 2. The layers.
  for (const id of ['forest', 'village', 'boss']) {
    const calm = (await session(33, [[0, s => place(s, id)]])).data, chased = (await session(33, [[0, s => { place(s, id); s.chase = true; }]])).data, touch = (await session(33, [[0, s => place(s, id)]], { lite: true })).data;
    out.layers[id] = { calm: facts(calm, ...WINDOW), chased: id === 'boss' ? null : facts(chased, ...WINDOW), touch: facts(touch, ...WINDOW) };
  }
  // 3. Under the effects. A stinger's duck is read on the music alone, lowered as the stinger lowers it.
  if (!quick) {
    const alone = (await session(8, [[0, s => place(s, 'forest')]])).data, ducked = (await session(8, [[0, s => place(s, 'forest')], [4, (s, sfx) => sfx.graph.duck('music', 6, 1.4)]])).data;
    out.mix.duck = { depth: round(rmsOf(ducked, 4.15, 5.35) - rmsOf(alone, 4.15, 5.35)), after: round(rmsOf(ducked, 6, 7.5) - rmsOf(alone, 6, 7.5)) };
    // A crowded fight: 3 s of blows every 45 ms, a power strike, a win, over the boss tune with both sliders at the top.
    const brawl = ['swing', 'hit', 'hitHeavy', 'crit', 'punch', 'hit', 'poof', 'coin', 'boom', 'hurt', 'thud', 'shoot', 'zap', 'break'];
    const fight = top => { const script = [[0, s => place(s, 'boss')]]; for (let i = 0; i < 66; i++) script.push([4 + Math.round(i * .45) / 10, (s, sfx) => { for (let k = 0; k < 2; k++) sfx.play(brawl[(i * 2 + k) % brawl.length]); }]); script.push([5.5, (s, sfx) => sfx.play('power')], [6.4, (s, sfx) => { sfx.play('level'); sfx.play('victory'); }]); script.sort((a, b) => a[0] - b[0]); return session(9, script, top ? { sfxLevel: 1, musicLevel: 1, seed: 11 } : { seed: 11 }); };
    out.mix.brawlTop = round(peakOf((await fight(true)).data)); out.mix.brawl = round(peakOf((await fight(false)).data));
  }
  // 4. A session, with the director as the game runs it (the village rests).
  if (!quick) {
    const script = [
      [0, s => place(s, 'village')],
      [20, s => place(s, 'forest')], // the new place must hold 1.5 s before its tune takes over
      [30, (s, sfx, d) => { d.theme = theme; }], // the theme has come
      [40, s => { s.chase = true; }], [52, s => { s.chase = false; }],
      [62, s => { s.boss = true; }], [80, (s, sfx) => { s.boss = false; sfx.play('victory'); }],
      [92, s => place(s, 'village')],
      [280, s => { s.indoors = true; }], [284, s => { s.radio = true; }], [290, s => { s.radio = false; s.indoors = false; }],
    ];
    const { data, log } = await session(300, script, { rests: true });
    out.session = log.map(row => ({ ...row, rms: round(rmsOf(data, row.t, row.t + 1)), air: round(airOf(data, row.t, row.t + 1)) }));
  }
  // The clips.
  if (clips && !quick) {
    const pcm = d => { const bytes = new Uint8Array(d.length * 2), view = new DataView(bytes.buffer); for (let i = 0; i < d.length; i++) view.setInt16(i * 2, Math.max(-32768, Math.min(32767, Math.round(d[i] * 32767))), true); let text = ''; for (let i = 0; i < bytes.length; i += 32768) text += String.fromCharCode.apply(null, bytes.subarray(i, i + 32768)); return btoa(text); };
    out.clips = {};
    for (const id of ['village', 'forest', 'boss']) out.clips[id] = pcm((await session(20, [[0, s => place(s, id)]])).data);
    out.clips.danger = pcm((await session(20, [[0, s => place(s, 'forest')], [5, s => { s.chase = true; }], [16, s => { s.chase = false; }]])).data);
    if (theme) out.clips.theme = pcm((await session(20, [[0, s => place(s, 'village')]], { live: false, theme })).data);
    out.clips['village-2min'] = pcm((await session(120, [[0, s => place(s, 'village')]])).data);
  }
  return out;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2), check = args.includes('--check'), write = args.includes('--write'), jsonAt = args.indexOf('--json'), clips = !args.includes('--no-clips'), quick = args.includes('--quick');
  const pwPath = process.env.PLAYWRIGHT_MODULE;
  let chromium;
  try { ({ chromium } = pwPath ? await import(pwPath.startsWith('file:') ? pwPath : pathToFileURL(pwPath).href) : createRequire(import.meta.url)('playwright')); }
  catch (e) { console.error(`Playwright was not found (${e.message.split(LF)[0]}). Set PLAYWRIGHT_MODULE to the path of an installed playwright/index.mjs.`); process.exit(2); }
  const base = `http://127.0.0.1:${process.env.PORT || 5298}`;
  const browser = await chromium.launch();
  let out;
  try {
    const page = await browser.newPage();
    page.on('pageerror', e => console.error('page error:', e.message));
    await page.goto(`${base}/favicon.svg`, { timeout: 30000 });
    out = await page.evaluate(measure, { clips, quick });
  } catch (e) { console.error(`Could not measure at ${base} (${e.message.split(LF)[0]}). Is the dev server running? Set PORT.`); process.exitCode = 2; }
  finally { await browser.close(); }
  if (out) {
    const { MUSIC } = await import('../src/features/music-content.ts');
    const kept = JSON.parse(readFileSync(new URL('./loudness.json', import.meta.url), 'utf8')), score = await scoreFacts(), sig = await signatures();
    const n = (v, w = 8) => String(v).padStart(w), problems = [];
    console.log('1. Every tune alone (30 s on the music bus, music slider 0.45; dBFS at the speakers)');
    console.log(`${'tune'.padEnd(9)}${'key'.padEnd(15)}${n('bpm', 5)}${n('phrase s')}${n('notes/s')}${n('voices')}${n('touch')}${n('peak')}${n('rms')}${n('LKFS~')}${n('to theme')}`);
    if (out.theme) console.log(`${'theme'.padEnd(9)}${'(recorded)'.padEnd(15)}${n('', 5)}${n(out.themeFacts.seconds)}${n('')}${n('')}${n('')}${n(out.theme.peak)}${n(out.theme.rms)}${n(out.theme.lufs)}`);
    for (const [id, f] of Object.entries(out.tunes)) {
      const t = MUSIC[id], s = score[id], off = out.theme ? Math.round((f.lufs - out.theme.lufs) * 10) / 10 : 0;
      console.log(`${id.padEnd(9)}${keyName(t).padEnd(15)}${n(t.bpm, 5)}${n(s.phraseSeconds)}${n(s.desktop.notesPerSecond)}${n(s.desktop.mostAtOnce)}${n(s.touch.mostAtOnce)}${n(f.peak)}${n(f.rms)}${n(f.lufs)}${n(off)}`);
      if (Math.abs(off) > 2) problems.push(`${id} is ${off} LU from the theme (2 at most): change its gain in music-content.ts`);
      if (f.peak > -1) problems.push(`${id} peaks at ${f.peak} dBFS (-1 at most)`);
    }
    console.log('   A tune takes another of its 4 progressions every 8 bars (phrase s), never the same more than twice running, with a new melody each time: it has no loop point.');
    console.log(`${LF}2. The layers (peak, RMS, loudness, and the RMS above 6 kHz, where only the shaker plays)`);
    const four = f => `${n(f.peak, 6)}${n(f.rms, 6)}${n(f.lufs, 6)}${n(f.air, 7)}`;
    for (const [id, l] of Object.entries(out.layers)) console.log(`${id.padEnd(9)}calm ${four(l.calm)}   ${l.chased ? `with the chase drums ${four(l.chased)}` : 'has its own beat'.padEnd(45)}   touch ${four(l.touch)}`);
    if (quick) process.exit(0);
    const loudest = Math.max(...Object.values(out.tunes).map(f => f.rms)), over = sound => Math.round((kept.sounds[sound].peak - loudest) * 10) / 10;
    console.log(`${LF}3. Under the effects (the loudest tune's RMS is ${loudest} dBFS)`);
    const cues = ['hit', 'hitHeavy', 'punch', 'swing', 'hurt', 'alert', 'ready', 'powerReady', 'level', 'victory', 'rewardSmall', 'deny', 'click'];
    console.log('   peak over the music RMS, dB: ' + cues.map(c => `${c} ${over(c)}`).join(', '));
    for (const c of ['hit', 'punch', 'victory', 'rewardSmall', 'deny', 'alert']) if (!(over(c) > 0)) problems.push(`${c} peaks ${over(c)} dB over the music: the music is not under it`);
    console.log(`   a duck of 6 dB for 1.4 s (a stinger): the music is ${out.mix.duck.depth} dB while it holds, ${out.mix.duck.after} dB 0.6 s after`);
    console.log(`   a crowded fight over the boss tune: peak ${out.mix.brawl} dBFS at the default sliders, ${out.mix.brawlTop} dBFS with both at the top (${out.mix.brawlTop < 0 ? 'no clipping' : 'CLIPS'})`);
    if (!(out.mix.brawlTop < 0)) problems.push('a crowded fight over the boss tune clips');
    if (Math.abs(out.mix.duck.depth + 6) > 1) problems.push(`a 6 dB duck lowers the score by ${out.mix.duck.depth} dB`);
    console.log(`${LF}4. A session (every row is one second; the rows where nothing changes are left out)`);
    console.log(`${n('s', 5)}  ${'state'.padEnd(9)}${'plays'.padEnd(9)}${n('bus RMS')}${n('>6 kHz')}${n('notes')}${n('drums')}`);
    let last = '';
    for (const row of out.session) { const face = `${row.state}|${row.plays}|${Math.round(row.rms / 3)}|${row.drums > 0}`; if (face !== last || row.t % 30 === 0) console.log(`${n(row.t, 5)}  ${row.state.padEnd(9)}${row.plays.padEnd(9)}${n(row.rms)}${n(row.air)}${n(row.notes)}${n(row.drums)}`); last = face; }
    if (out.clips) {
      const dir = fileURLToPath(new URL('../.scratch/owner/music/', import.meta.url)); mkdirSync(dir, { recursive: true });
      const names = Object.keys(out.clips);
      for (const name of names) {
        const pcm = Buffer.from(out.clips[name], 'base64'), head = Buffer.alloc(44);
        head.write('RIFF', 0); head.writeUInt32LE(36 + pcm.length, 4); head.write('WAVEfmt ', 8); head.writeUInt32LE(16, 16); head.writeUInt16LE(1, 20); head.writeUInt16LE(1, 22);
        head.writeUInt32LE(48000, 24); head.writeUInt32LE(96000, 28); head.writeUInt16LE(2, 32); head.writeUInt16LE(16, 34); head.write('data', 36); head.writeUInt32LE(pcm.length, 40);
        writeFileSync(dir + name + '.wav', Buffer.concat([head, pcm]));
      }
      const about = { village: 'The village (C major, 104 beats a minute): the theme\'s own key and instruments. In the game it plays two phrases, then rests 60 to 120 s.', forest: 'Mushroom Forest (F lydian, 92, a little swing).', danger: 'Mushroom Forest with a chase: the drums join at 5 s and leave after 16 s.', boss: 'A boss (D minor, 138), with its own beat.', theme: 'The recorded theme, as the director plays it in the village: for comparing levels.', 'village-2min': 'Two minutes of the village\'s variations, without the rests between them.' };
      const row = name => { const f = out.tunes[name] ?? (name === 'theme' ? out.theme : null); return `<section><h2>${name}</h2><p>${about[name] ?? ''}${f ? ` Measured: loudness ${f.lufs} LKFS, peak ${f.peak} dBFS.` : ''}</p><audio controls preload="none" src="${name}.wav"></audio></section>`; };
      writeFileSync(dir + 'index.html', `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Zoo Garden: the live score</title><style>body{font:16px/1.5 system-ui,sans-serif;max-width:44rem;margin:2rem auto;padding:0 1rem;color:#223}h1{font-size:1.5rem}h2{font-size:1.1rem;margin:1.6rem 0 .2rem}audio{width:100%}p{margin:.2rem 0 .5rem}small{color:#556}</style><h1>Zoo Garden: the live score</h1><p>Rendered by <code>promo/music-clips.mjs</code> with the game's own score code, through the game's music bus and compressor at the default music volume (45%), so the clips are as quiet as the music is in play: turn the volume up to judge the tunes. Nothing here is a recording: every note is an oscillator, and the melodies are drawn from each tune's seed.</p>${names.map(row).join('')}<p><small>To hear only the recorded theme in the game: set THEME_ONLY in src/features/music-content.ts, or on one device the preference "music" to "theme".</small></p>${LF}`);
      console.log(`${LF}Clips and the listen page: ${dir}index.html (${names.join(', ')})`);
    }
    console.log(problems.length ? `${LF}${problems.map(p => 'OUT  ' + p).join(LF)}` : `${LF}Every tune is within 2 LU of the theme, under the effects, and nothing clips.`);
    if (jsonAt >= 0 && args[jsonAt + 1]) writeFileSync(args[jsonAt + 1], JSON.stringify({ ...out, clips: undefined, score }, null, 1));
    if (check && problems.length) process.exitCode = 1;
    if (write) {
      if (problems.length) { console.error('Not written: tune the music first.'); process.exitCode = 1; }
      else {
        const rows = '{' + LF + Object.entries(out.tunes).map(([id, f]) => `  ${JSON.stringify(id)}: ${JSON.stringify({ peak: f.peak, rms: f.rms, lufs: f.lufs, tune: sig[id] })}`).join(',' + LF) + LF + ' }';
        const text = `{${LF} "about": "Measured by promo/music-clips.mjs --write: 30 s of each tune on the music bus, dBFS at the speakers, sliders at their defaults. Do not edit by hand.",${LF} "theme": ${JSON.stringify({ peak: out.theme?.peak, rms: out.theme?.rms, lufs: out.theme?.lufs })},${LF} "tunes": ${rows},${LF} "layers": ${JSON.stringify(out.layers)},${LF} "mix": ${JSON.stringify(out.mix)}${LF}}${LF}`;
        writeFileSync(fileURLToPath(new URL('./music-levels.json', import.meta.url)), text); console.log('Written: promo/music-levels.json');
      }
    }
  }
}
