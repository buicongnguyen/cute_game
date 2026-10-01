/**
 * Adaptive graphics quality. The renderer's cost on phones is dominated by the
 * number of pixels drawn and by the shadow pass, not by triangle counts, so the
 * governor trades resolution first and shadows second, then recovers when the
 * frame rate allows. The choice is stored per device, never in the shared save.
 */
export type QualityLevel = 'low' | 'medium' | 'high';
export type QualitySetting = 'auto' | QualityLevel;

/** `outlines`: ink outlines on actors; they go last (only battery saver drops them), since they carry fight readability. */
export interface QualityProfile { label: string; ratio: number; shadow: number; particles: number; outlines: boolean }
export const QUALITY: Record<QualityLevel, QualityProfile> = {
  low: { label: 'Battery saver', ratio: .85, shadow: 0, particles: .45, outlines: false },
  medium: { label: 'Balanced', ratio: 1.25, shadow: 1024, particles: .75, outlines: true },
  high: { label: 'Sharp', ratio: 2, shadow: 2048, particles: 1, outlines: true },
};
export const QUALITY_KEY = 'zoo-garden-graphics';

export interface GraphicsEnvironment { mobile: boolean; devicePixelRatio: number }
export type GraphicsChange = 'ratio' | 'level' | null;

/** Seconds a level must hold before it is remembered, and the frame rate that counts as a good second. */
const HOLD_SECONDS = 60, GOOD_FPS = 55;

export class GraphicsGovernor {
  setting: QualitySetting;
  /** Level the automatic mode uses now (null: the device's default). */
  autoLevel: QualityLevel | null;
  ratio: number;
  fps = 0;
  private env: GraphicsEnvironment;
  private frames = 0; private elapsed = 0; private slowSeconds = 0;
  /** The automatic level remembered for the next visit: only one that held for a minute of play. */
  private kept: QualityLevel | null;
  private goodSeconds = 0; private heldSeconds = 0; private upWait = 10; private upTrial = 0; private unsaved = false;

  constructor(env: GraphicsEnvironment, stored?: { setting?: QualitySetting; autoLevel?: QualityLevel | null } | null, legacyLow = false) {
    this.env = env;
    const valid = (v: unknown): v is QualitySetting => v === 'auto' || v === 'low' || v === 'medium' || v === 'high';
    this.setting = valid(stored?.setting) ? stored!.setting! : legacyLow ? 'low' : 'auto';
    this.autoLevel = this.kept = stored?.autoLevel && stored.autoLevel in QUALITY ? stored.autoLevel : null;
    this.ratio = this.targetRatio();
  }

  get mobile() { return this.env.mobile; }
  get level(): QualityLevel {
    if (this.setting !== 'auto') return this.setting;
    return this.autoLevel ?? (this.env.mobile ? 'medium' : 'high');
  }
  get profile() { return QUALITY[this.level]; }
  targetRatio() { return Math.min(this.env.devicePixelRatio, this.profile.ratio); }

  choose(setting: QualitySetting) { this.setting = setting; if (setting === 'auto') this.autoLevel = this.kept = null; this.ratio = this.targetRatio(); }

  /**
   * Feed every frame's duration. Once per second in automatic mode: three slow
   * seconds in a row (under 36 fps) lower resolution by a quarter step down to 1×,
   * then the quality level, then resolution again down to 0.7×; a fast second
   * (over 57 fps) restores resolution toward the level's target, and ten good
   * seconds in a row (55 fps or more) at full resolution step back up a level.
   */
  sample(dt: number, playing: boolean): GraphicsChange {
    this.frames++; this.elapsed += dt;
    if (this.elapsed < 1) return null;
    const fps = this.frames / this.elapsed; this.fps = fps; this.frames = 0; this.elapsed = 0;
    // Pauses, menus and the settling seconds after start or landing break a streak: only play is judged.
    if (!playing || this.setting !== 'auto') { this.slowSeconds = this.goodSeconds = 0; return null; }
    // A level is remembered only after a minute of play, so a short spike (a crowded fight, a busy
    // moment on the device) lowers quality for the moment but never for the next visit.
    if (this.autoLevel !== this.kept && ++this.heldSeconds >= HOLD_SECONDS) { this.kept = this.autoLevel; this.unsaved = true; }
    if (this.upTrial > 0) this.upTrial--;
    if (fps < 36) {
      this.goodSeconds = 0;
      if (++this.slowSeconds < 3) return null;
      this.slowSeconds = 0;
      if (this.ratio > 1) { this.ratio = Math.max(1, this.ratio - .25); return 'ratio'; }
      const lower: Partial<Record<QualityLevel, QualityLevel>> = { high: 'medium', medium: 'low' };
      const next = lower[this.level];
      // A step up undone within 20 s doubles the wait before the next one, so a borderline device does not flicker.
      if (next) { if (this.upTrial > 0) this.upWait = Math.min(160, this.upWait * 2); this.setAuto(next); this.ratio = Math.min(this.ratio, this.targetRatio()); return 'level'; }
      if (this.ratio > .7) { this.ratio = Math.max(.7, this.ratio - .15); return 'ratio'; }
      return null;
    }
    this.slowSeconds = 0; this.goodSeconds = fps >= GOOD_FPS ? this.goodSeconds + 1 : 0;
    const target = this.targetRatio();
    if (fps > 57 && this.ratio < target) { this.ratio = Math.min(target, this.ratio + .25); return 'ratio'; }
    const higher: Partial<Record<QualityLevel, QualityLevel>> = { low: 'medium', medium: 'high' };
    const up = higher[this.level];
    if (up && this.level !== this.defaultLevel && this.goodSeconds >= this.upWait && this.ratio >= target) { this.setAuto(up); this.goodSeconds = 0; this.upTrial = 20; return 'level'; }
    return null;
  }

  /** True once after the remembered level changed; the caller then saves the settings. */
  takeSave() { const save = this.unsaved; this.unsaved = false; return save; }

  toJSON() { return { setting: this.setting, autoLevel: this.kept }; }

  private get defaultLevel(): QualityLevel { return this.env.mobile ? 'medium' : 'high'; }
  private setAuto(level: QualityLevel) { this.autoLevel = level === this.defaultLevel ? null : level; this.heldSeconds = 0; }
}

export function detectEnvironment(): GraphicsEnvironment {
  const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  const agent = typeof navigator === 'undefined' ? '' : navigator.userAgent;
  return { mobile: coarse || /Android|iPhone|iPad|iPod/i.test(agent), devicePixelRatio: typeof devicePixelRatio === 'number' ? devicePixelRatio : 1 };
}

export function loadGraphics(legacyLow: boolean) {
  let stored: { setting?: QualitySetting; autoLevel?: QualityLevel | null } | null = null;
  try { stored = JSON.parse(localStorage.getItem(QUALITY_KEY) ?? 'null'); } catch { /* Defaults apply. */ }
  return new GraphicsGovernor(detectEnvironment(), stored, legacyLow);
}

export function saveGraphics(governor: GraphicsGovernor) {
  try { localStorage.setItem(QUALITY_KEY, JSON.stringify(governor)); } catch { /* Settings stay for this session. */ }
}
