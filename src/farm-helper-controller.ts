import type { SaveState, Collected } from './model.ts';
import { helperOf, type FarmHelperTask } from './farm-helper.ts';

interface Result { collected: Collected[]; fed: number[] }
interface Host {
  state(): SaveState;
  /** A stable scene identity only while the owner can work in their own home. */
  context(): unknown | null;
  perform<T>(type: string, payload?: Record<string, unknown>): Promise<T | undefined>;
  completed(result: Result, catchUp: boolean): void;
}

/** One pending job for this robot, with no effects leaking across visits, flights or account changes. */
export class FarmHelperController {
  pending = false;
  private entry: unknown = null;
  private entryState: SaveState | null = null;
  private host: Host;
  constructor(host: Host) { this.host = host; }
  sync() {
    const state = this.host.state(), context = this.host.context(), helper = helperOf(state);
    if (!context) { this.entry = null; this.entryState = null; return; }
    if (this.pending || !helper.owned || helper.paused) return;
    if (this.entry !== context || this.entryState !== state) {
      this.entry = context; this.entryState = state;
      void this.run('farmHelperCatchUp', {}, true);
    }
  }
  work(task: FarmHelperTask) {
    const h = helperOf(this.host.state());
    if (this.pending || !this.host.context() || !h.owned || h.paused) return false;
    void this.run(task.kind === 'collect' ? 'farmHelperCollect' : 'farmHelperFeed', { uid: task.uid }, false, task.uid);
    return true;
  }
  private async run(type: string, payload: Record<string, unknown>, catchUp: boolean, uid?: number) {
    const state = this.host.state(), context = this.host.context(); this.pending = true;
    try {
      const value = await this.host.perform<Result | Collected[] | boolean>(type, payload);
      if (value === undefined || this.host.state() !== state || this.host.context() !== context || !context) return;
      const result: Result = catchUp ? value as Result : type === 'farmHelperCollect' ? { collected: value as Collected[], fed: [] } : { collected: [], fed: value ? [uid!] : [] };
      this.host.completed(result, catchUp);
    } catch { /* perform reports rejected commands; never keep the robot locked after a transport failure. */ }
    finally { this.pending = false; }
  }
}
