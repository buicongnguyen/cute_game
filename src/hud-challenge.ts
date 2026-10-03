// The timed bonus line under the ADVENTURE tracker: the reference's surprise «Thử thách» (bundle @916142 startChallenge,
// @917490 failChallenge, @918701 its #qtrack line). Every few minutes a short task with a countdown appears; doing it in
// time wins at once (no Collect step) and grows a win streak that raises the reward up to x3; a timeout breaks the streak.
import type { SaveState } from './model.ts';
import { challengeSeconds, challengeTitle, nextChallengeDelay, pickChallenge, progressEntries, type ChallengeChances } from './progression.ts';
import { t } from './i18n.ts';

const ICONS: Record<string, string> = { kill: '⚔️', skill: '🌀', harvest: '🌾', fish: '🎣', boss: '👑' };
export interface ChallengeView { icon: string; title: string; task: string; count: string; left: number; fraction: number; won: boolean; chip: string }

/** What the line shows now, or null when there is no challenge (or the last one ended). `won` is the short victory card. */
export function challengeView(s: SaveState, now: number, wonReward = ''): ChallengeView | null {
  const c = s.progression.challenge; if (!c) return null;
  const icon = ICONS[c.type] ?? '⏱️', count = `${Math.min(c.progress, c.target)}/${c.target}`;
  if (c.claimed) return wonReward ? { icon: '🏆', title: t('Challenge won!'), task: wonReward, count: '✓', left: 0, fraction: 0, won: true, chip: '🏆' } : null;
  const total = challengeSeconds(c.type) * 1000 || 1, left = Math.max(0, Math.ceil((c.ends - now) / 1000));
  const streak = s.progression.streak ? ` · 🔥${s.progression.streak}` : '';
  return { icon, title: t('Quick challenge · {count}s', { count: left }) + streak, task: `${challengeTitle(c.type)} · ${count}`, count, left, fraction: Math.max(0, Math.min(1, (c.ends - now) / total)), won: false, chip: `⏱️ ${left}s ${count}` };
}

export interface ChallengeHost {
  state(): SaveState;
  /** The explorer is out playing: started, alive, no dialog, not visiting, not in space, not indoors (reference update()). */
  active(): boolean;
  chances(): ChallengeChances;
  start(type: string): Promise<boolean>;
  claim(id: string): Promise<boolean>;
  toast(text: string, icon: string): void;
  won?(): void;
}

/** Schedules surprise challenges, wins them the moment they are complete and notices timeouts. tick() runs with the HUD. */
export class ChallengeDirector {
  /** Seconds until the next surprise challenge. */
  next: number;
  wonReward = ''; wonUntil = 0; private busy = false; private live: string | null = null;
  private host: ChallengeHost; private rng: () => number;
  constructor(host: ChallengeHost, rng: () => number = Math.random) { this.host = host; this.rng = rng; this.next = nextChallengeDelay('start', rng); }
  tick(dt: number, now = Date.now()) {
    if (now > this.wonUntil) this.wonReward = '';
    const s = this.host.state(), c = s.progression.challenge, open = c && !c.claimed ? `${c.type}:${c.ends}` : null;
    if (this.live && !open) { // won (claimed here or in the journal) or ran out (refreshProgress cleared it)
      if (!(c?.claimed && `${c.type}:${c.ends}` === this.live)) { this.next = nextChallengeDelay('failed', this.rng); this.host.toast(t("Time's up! The quick challenge is over. The next one comes soon."), '⌛'); }
      this.live = null; return;
    }
    if (open && c && c.progress >= c.target && !this.busy) {
      const entry = progressEntries(s, 'challenges', now)[0]; if (!entry) return;
      this.busy = true; const reward = entry.rewardLabel;
      void this.host.claim(entry.id).then(ok => { if (!ok) return; this.wonReward = reward; this.wonUntil = now + 4000; this.next = nextChallengeDelay('won', this.rng); this.host.toast(t('Challenge won! {reward}', { reward }), '🏆'); this.host.won?.(); }).finally(() => { this.busy = false; });
      return;
    }
    if (open) { this.live = open; return; }
    if (s.level < 2 || !this.host.active() || this.busy) return;
    this.next -= dt; if (this.next > 0) return;
    const type = pickChallenge(this.host.chances(), this.rng);
    if (!type) { this.next = nextChallengeDelay('none', this.rng); return; }
    this.busy = true;
    void this.host.start(type).then(ok => {
      const c = this.host.state().progression.challenge;
      if (!ok || !c) { this.next = nextChallengeDelay('none', this.rng); return; }
      this.live = `${c.type}:${c.ends}`;
      this.host.toast(t('Surprise challenge! {task} in {count} seconds', { task: `${challengeTitle(c.type)} ×${c.target}`, count: challengeSeconds(c.type) }), '⏱️');
    }).finally(() => { this.busy = false; });
  }
  view(now = Date.now()) { return challengeView(this.host.state(), now, this.wonReward); }
}

/** Fills the #challenge-tracker line; the ring's --left drains with the time. */
export function renderChallenge(root: HTMLElement, v: ChallengeView | null) {
  root.hidden = !v; if (!v) return;
  const set = (sel: string, text: string) => { const el = root.querySelector(sel); if (el && el.textContent !== text) el.textContent = text; };
  set('.ch-icon', v.icon); set('strong', v.title); set('small', v.task); set('.tracker-count', v.won ? '✓' : `${v.left}s`);
  root.classList.toggle('won', v.won); root.classList.toggle('urgent', !v.won && v.left <= 10);
  const left = v.fraction.toFixed(3); if (root.style.getPropertyValue('--left') !== left) root.style.setProperty('--left', left);
}
