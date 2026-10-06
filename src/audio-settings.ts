/**
 * Sound settings as the reference has them (F-011: music 0.45, effects 0.8 sliders, vibration on): two volumes and a
 * vibration switch replace the old single "Gentle sound effects" toggle. Stored in state.settings (model.ts parseSave
 * calls parseAudio), so they follow the save online; the server parses saves with the same function.
 *
 * Old saves: `sound: false` meant "silence", so it becomes both volumes 0 and vibration off (vibration used to follow
 * the sound switch). `sound` itself is kept, derived (any volume above 0), for older readers of the save.
 */
export const AUDIO_DEFAULTS = { musicVolume: .45, sfxVolume: .8, vibrate: true } as const;
export interface AudioSettings { sound: boolean; musicVolume: number; sfxVolume: number; vibrate: boolean }
type Raw = Record<string, unknown>;
/** A volume in [0, 1] in 5 % steps, or undefined when the value is not a finite number. */
export function volume(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  return Math.round(Math.max(0, Math.min(1, value)) * 20) / 20;
}
/** The audio part of a saved settings record, migrated from the old single sound switch when needed. */
export function parseAudio(raw: Raw): AudioSettings {
  const silent = raw.sound === false;
  const musicVolume = volume(raw.musicVolume) ?? (silent ? 0 : AUDIO_DEFAULTS.musicVolume);
  const sfxVolume = volume(raw.sfxVolume) ?? (silent ? 0 : AUDIO_DEFAULTS.sfxVolume);
  const vibrate = typeof raw.vibrate === 'boolean' ? raw.vibrate : !silent;
  return { sound: musicVolume > 0 || sfxVolume > 0, musicVolume, sfxVolume, vibrate };
}
/** Current levels, with defaults for a settings record built before parseAudio (tests, very old code paths). */
export function audioOf(settings: Partial<AudioSettings>): AudioSettings { return parseAudio(settings as Raw); }
/**
 * Apply a Settings change (actions.ts 'settings'): `musicVolume` / `sfxVolume` numbers, `vibrate` boolean, or the old
 * `sound` boolean (true = default volumes, false = silence). Returns true when anything audio-related was given.
 */
export function applyAudio(settings: Partial<AudioSettings>, patch: Raw): boolean {
  let touched = false;
  const now = audioOf(settings);
  if (typeof patch.sound === 'boolean' && patch.musicVolume === undefined && patch.sfxVolume === undefined) {
    now.musicVolume = patch.sound ? AUDIO_DEFAULTS.musicVolume : 0; now.sfxVolume = patch.sound ? AUDIO_DEFAULTS.sfxVolume : 0; touched = true;
  }
  const music = volume(patch.musicVolume), sfx = volume(patch.sfxVolume);
  if (music !== undefined) { now.musicVolume = music; touched = true; }
  if (sfx !== undefined) { now.sfxVolume = sfx; touched = true; }
  if (typeof patch.vibrate === 'boolean') { now.vibrate = patch.vibrate; touched = true; }
  if (!touched) return false;
  Object.assign(settings, { musicVolume: now.musicVolume, sfxVolume: now.sfxVolume, vibrate: now.vibrate, sound: now.musicVolume > 0 || now.sfxVolume > 0 });
  return true;
}

/** Live levels the players read every time they make a sound (main.ts keeps them in step with the save). */
export const audioLevels = { music: AUDIO_DEFAULTS.musicVolume as number, sfx: AUDIO_DEFAULTS.sfxVolume as number, vibrate: AUDIO_DEFAULTS.vibrate as boolean };
export function syncAudio(settings: Partial<AudioSettings>) { const a = audioOf(settings); audioLevels.music = a.musicVolume; audioLevels.sfx = a.sfxVolume; audioLevels.vibrate = a.vibrate; return a; }

const percent = (v: number) => `${Math.round(v * 100)}%`;
/** The Settings rows (English; openDialog localizes the panel): a music slider, an effects slider and the vibration switch (main.ts settings()). */
export function audioRowsHtml(settings: Partial<AudioSettings>) {
  const a = audioOf(settings);
  const slider = (kind: 'music' | 'sfx', title: string, note: string, value: number) =>
    `<div class="settings-row audio-row"><div><strong>${title}</strong><small>${note}</small></div><div class="volume-control"><input type="range" min="0" max="100" step="5" value="${Math.round(value * 100)}" data-volume="${kind}" aria-label="${title}"><output data-volume-out="${kind}">${percent(value)}</output></div></div>`;
  return slider('music', 'Music volume', 'The cottage radio and its tunes', a.musicVolume)
    + slider('sfx', 'Effects volume', 'Taps, hits, splashes and chimes', a.sfxVolume)
    + `<div class="settings-row"><div><strong>Vibration</strong><small>A little buzz on bites, hits and big moments (phones)</small></div><button class="toggle ${a.vibrate ? 'on' : ''}" role="switch" aria-checked="${a.vibrate}" aria-label="Vibration" data-action="vibrate"></button></div>`;
}
/**
 * Slider wiring: dragging previews the level at once (and plays a click for effects), letting go saves it through
 * `save` (the 'settings' action). Installed once on the app root (main.ts).
 */
export function bindAudioSliders(root: HTMLElement, preview: (kind: 'music' | 'sfx', value: number) => void, save: (kind: 'music' | 'sfx', value: number) => void) {
  const read = (event: Event) => { const input = event.target; if (!(input instanceof HTMLInputElement) || !input.dataset.volume) return null; const kind = input.dataset.volume === 'music' ? 'music' : 'sfx', value = volume(Number(input.value) / 100) ?? 0; const out = root.querySelector(`[data-volume-out="${kind}"]`); if (out) out.textContent = percent(value); return { kind, value } as const; };
  root.addEventListener('input', event => { const r = read(event); if (r) preview(r.kind, r.value); });
  root.addEventListener('change', event => { const r = read(event); if (r) save(r.kind, r.value); });
}
