// Model downloads that fail (a phone dropping off Wi-Fi, a deploy swapping files) used to leave the
// code stand-ins up for the whole session. Each load now retries with backoff, then again whenever the
// tab becomes visible, the device comes back online or the player taps the "art didn't load" note;
// a late success is announced so the world can swap the stand-ins for the real models.

export interface RetryPolicy {
  /** Waits between the quick retries; the first attempt is immediate. */
  delays: readonly number[];
  sleep(ms: number): Promise<void>;
  /** Resolves when it is worth trying again (visible tab, back online, manual retry). */
  wake(): Promise<void>;
}

let wakers: (() => void)[] = [];
/** Retries every model that is still waiting after its quick retries. */
export function wakeArt() { const due = wakers; wakers = []; for (const f of due) f(); }
const waitForWake = () => new Promise<void>(resolve => wakers.push(resolve));

export const BROWSER_POLICY: RetryPolicy = { delays: [1000, 3000, 10000], sleep: ms => new Promise(r => setTimeout(r, ms)), wake: waitForWake };
/** Without a window (Node tests) there is no network to recover, and pending timers would hold the test run open. */
export const DEFAULT_POLICY: RetryPolicy = typeof window === 'undefined' ? { delays: [], sleep: async () => {}, wake: waitForWake } : BROWSER_POLICY;
if (typeof window !== 'undefined') {
  window.addEventListener('online', wakeArt);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') wakeArt(); });
}

const failing = new Set<string>();
const statusListeners = new Set<() => void>(), loadedListeners = new Set<(url: string) => void>();
/** Files that are still missing after their quick retries. */
export const failingArt = () => [...failing];
export function onArtStatus(listener: () => void) { statusListeners.add(listener); return () => { statusListeners.delete(listener); }; }
/** Fires after a model that had given up loads after all; its library is already updated. */
export function onArtLoaded(listener: (url: string) => void) { loadedListeners.add(listener); return () => { loadedListeners.delete(listener); }; }
const status = () => { for (const f of statusListeners) f(); };

/**
 * Loads `key` with quick retries. Resolves with the value, or undefined once the quick retries are spent:
 * callers then carry on with their stand-ins while the load keeps waiting for a wake-up in the background,
 * calling `late` (then the loaded listeners) when it finally succeeds.
 */
export async function loadWithRetry<V>(key: string, attempt: () => Promise<V>, late: (value: V) => void, policy: RetryPolicy = DEFAULT_POLICY): Promise<V | undefined> {
  for (let i = 0; ; i++) {
    try { return await attempt(); }
    catch { if (i >= policy.delays.length) break; await policy.sleep(policy.delays[i]); }
  }
  failing.add(key); status();
  void (async () => {
    for (;;) {
      await policy.wake();
      let value: V;
      try { value = await attempt(); } catch { continue; /* Still unavailable: wait for the next wake-up. */ }
      // Outside the try: an error in a callback is not a failed download, and must not fetch the file again.
      failing.delete(key); late(value); status();
      for (const f of loadedListeners) try { f(key); } catch (error) { console.error(error); }
      return;
    }
  })();
  return undefined;
}
