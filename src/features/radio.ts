/**
 * The radio's player. It lives with the lazy features so the start download does not carry it: mount() hands one to
 * house-life.ts (the `radio` slot in audio-settings.ts), which switches it on and off. Making it plays nothing and builds no audio.
 */
import { assetUrl } from '../asset-url.ts';
import { audioLevels, radio } from '../audio-settings.ts';
import type { AudioGraph } from '../sfx.ts';
import type { GameServices } from '../game-services.ts';

/**
 * The cottage radio (house-life.ts switches it on and off): plays the game's own theme (public/assets/audio/zoo-garden-theme.mp3, a loop). If the file cannot play, a tiny WebAudio music box (a looping pentatonic tune) stands in.
 * Both play into the music bus of the game's one audio graph (sfx.ts, handed in), and the Settings music slider is that bus's gain:
 * an iPhone ignores an <audio> element's own volume, so the element goes through a MediaElementAudioSourceNode. Only without WebAudio does the element's volume carry the slider.
 */
export class MusicBox {
  /**
   * The mix's compressor adds make-up gain (5.2 dB on the theme, measured in Chromium with the game's settings), and the
   * radio used to play past it. This trim keeps the radio as loud as it was at the same slider.
   */
  static TRIM = .55;
  private gain: GainNode | null = null; private timer = 0; private step = 0;
  playing = false;
  private static NOTES = [523, 659, 784, 659, 587, 523, 440, 523, 659, 784, 880, 784, 659, 587, 523, 0];
  private theme: HTMLAudioElement | null = null; private fallback = false;
  /** True once the theme element feeds the music bus; the level the slider had when it was last applied. */
  private wired = false; private level = -1;
  private graph: AudioGraph;
  constructor(graph: AudioGraph) {
    this.graph = graph;
    // The <audio> loop plays on in a hidden tab, where the frame loop (which stops it on leaving) no longer runs: hold it while hidden, go on when back.
    if (typeof document === 'undefined') return;
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.theme?.pause(); else if (this.playing && this.theme) void this.theme.play().catch(() => {}); });
    globalThis.addEventListener?.('pagehide', () => this.stop());
  }
  /** The Settings music slider (audio-settings.ts audioLevels) onto the music bus, or onto the element where there is no bus. */
  private mix() {
    this.level = this.graph.music = audioLevels.music;
    const bus = this.graph.bus('music');
    if (this.theme && !this.wired) this.theme.volume = this.level;
    return bus;
  }
  start() {
    const bus = this.mix();
    if (!this.fallback && typeof Audio !== 'undefined') {
      try {
        if (!this.theme) {
          const theme = this.theme = Object.assign(new Audio(assetUrl("audio/zoo-garden-theme.mp3")), { loop: true, volume: bus ? 1 : this.level });
          // A browser that cannot route the element keeps it on its own volume.
          if (bus) try { const trim = bus.context.createGain(); trim.gain.value = MusicBox.TRIM; this.graph.ctx!.createMediaElementSource(theme).connect(trim); trim.connect(bus); this.wired = true; } catch { theme.volume = this.level; }
        }
        this.playing = true;
        void this.theme.play().catch(() => { this.fallback = true; this.theme = null; this.wired = false; if (this.playing) this.start(); });
        return;
      } catch { this.fallback = true; this.theme = null; this.wired = false; }
    }
    if (!bus) return;
    // The stand-in tune, at the level it always had beside the theme (0.07 at the default slider 0.45).
    if (!this.gain) { this.gain = bus.context.createGain(); this.gain.gain.value = .07 / .45 * MusicBox.TRIM; this.gain.connect(bus); }
    this.playing = true; this.step = 0; this.timer = 0;
  }
  stop() { this.playing = false; this.theme?.pause(); }
  /** Called each frame while inside; schedules a note every 0.32 s. */
  tick(dt: number) {
    if (this.level !== audioLevels.music && (this.theme || this.gain)) this.mix();
    if (!this.playing || !this.fallback || !this.gain) return;
    if ((this.timer -= dt) > 0) return; this.timer = .32;
    const f = MusicBox.NOTES[this.step++ % MusicBox.NOTES.length]; if (!f) return;
    const ctx = this.gain.context, at = ctx.currentTime; if (!this.graph.voices.take(at, at + .62)) return;
    const osc = ctx.createOscillator(), env = ctx.createGain();
    osc.type = 'triangle'; osc.frequency.value = f; env.gain.setValueAtTime(.9, at); env.gain.exponentialRampToValueAtTime(.001, at + .6);
    osc.connect(env); env.connect(this.gain); osc.start(at); osc.stop(at + .62);
  }
}

export function mount(services: Pick<GameServices, 'audio'>) { radio.box ??= new MusicBox(services.audio); }
