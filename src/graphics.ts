/**
 * Adaptive graphics quality. The renderer's cost on phones is dominated by the
 * number of pixels drawn and by the shadow pass, not by triangle counts, so the
 * governor trades resolution first and shadows second, then recovers when the
 * frame rate allows. The choice is stored per device, never in the shared save.
 */
export type QualityLevel = 'low' | 'medium' | 'high';
export type QualitySetting = 'auto' | QualityLevel;

export interface QualityProfile { label: string; ratio: number; shadow: number; particles: number }
export const QUALITY: Record<QualityLevel, QualityProfile> = {
  low: { label: 'Battery saver', ratio: .85, shadow: 0, particles: .45 },
  medium: { label: 'Balanced', ratio: 1.25, shadow: 1024, particles: .75 },
  high: { label: 'Sharp', ratio: 2, shadow: 2048, particles: 1 },
};
export const QUALITY_KEY = 'zoo-garden-graphics';

export interface GraphicsEnvironment { mobile: boolean; devicePixelRatio: number }
export type GraphicsChange = 'ratio' | 'level' | null;

export class GraphicsGovernor {
  setting: QualitySetting;
  /** Level chosen by the automatic mode after measuring this device. */
  autoLevel: QualityLevel | null;
  ratio: number;
  fps = 0;
  private env: GraphicsEnvironment;
  private frames = 0; private elapsed = 0; private slowSeconds = 0;

  constructor(env: GraphicsEnvironment, stored?: { setting?: QualitySetting; autoLevel?: QualityLevel | null } | null, legacyLow = false) {
    this.env = env;
    const valid = (v: unknown): v is QualitySetting => v === 'auto' || v === 'low' || v === 'medium' || v === 'high';
    this.setting = valid(stored?.setting) ? stored!.setting! : legacyLow ? 'low' : 'auto';
    this.autoLevel = stored?.autoLevel && stored.autoLevel in QUALITY ? stored.autoLevel : null;
    this.ratio = this.targetRatio();
  }

  get mobile() { return this.env.mobile; }
  get level(): QualityLevel {
    if (this.setting !== 'auto') return this.setting;
    return this.autoLevel ?? (this.env.mobile ? 'medium' : 'high');
  }
  get profile() { return QUALITY[this.level]; }
  targetRatio() { return Math.min(this.env.devicePixelRatio, this.profile.ratio); }

  choose(setting: QualitySetting) { this.setting = setting; if (setting === 'auto') this.autoLevel = null; this.ratio = this.targetRatio(); }

  /**
   * Feed every frame's duration. Once per second in automatic mode: three slow
   * seconds in a row (under 36 fps) lower resolution by a quarter step down to 1×,
   * then the quality level, then resolution again down to 0.7×; a fast second
   * (over 57 fps) restores resolution toward the level's target.
   */
  sample(dt: number, playing: boolean): GraphicsChange {
    this.frames++; this.elapsed += dt;
    if (this.elapsed < 1) return null;
    const fps = this.frames / this.elapsed; this.fps = fps; this.frames = 0; this.elapsed = 0;
    if (!playing || this.setting !== 'auto') return null;
    if (fps < 36) {
      if (++this.slowSeconds < 3) return null;
      this.slowSeconds = 0;
      if (this.ratio > 1) { this.ratio = Math.max(1, this.ratio - .25); return 'ratio'; }
      const lower: Partial<Record<QualityLevel, QualityLevel>> = { high: 'medium', medium: 'low' };
      const next = lower[this.level];
      if (next) { this.autoLevel = next; this.ratio = Math.min(this.ratio, this.targetRatio()); return 'level'; }
      if (this.ratio > .7) { this.ratio = Math.max(.7, this.ratio - .15); return 'ratio'; }
      return null;
    }
    this.slowSeconds = 0;
    const target = this.targetRatio();
    if (fps > 57 && this.ratio < target) { this.ratio = Math.min(target, this.ratio + .25); return 'ratio'; }
    return null;
  }

  toJSON() { return { setting: this.setting, autoLevel: this.autoLevel }; }
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
