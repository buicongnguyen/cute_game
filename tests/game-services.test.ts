// The event bus and the services the feature modules get (src/game-events.ts, src/game-services.ts).
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { connect, emit, noteProgress, type GameEvent } from '../src/game-events.ts';
import { createEvents, createServices, PREF_PREFIX, type ServiceHost } from '../src/game-services.ts';
import { EVENT_SAMPLES } from './support/game-event-samples.mjs';

const EVENTS = Object.keys(EVENT_SAMPLES) as GameEvent[];
const host = (over: Partial<ServiceHost> = {}) => ({
  world: { planet: 'home' }, state: () => ({ level: 3 }), perform: async () => undefined, toast() {}, tone() {}, openDialog() {}, closeDialog() {},
  modal: () => '', onFrame: () => () => {}, slot: () => 0, touch: () => false, quality: () => 'high', connect, ...over,
}) as unknown as ServiceHost;

test('the eighteen events of the plan are all there, each with a payload that arrives as it was sent', () => {
  assert.deepEqual([...EVENTS].sort(), ['bossApproach', 'bossBreak', 'bossEngaged', 'creatureAlert', 'creatureDefeat', 'firstWin', 'fishCatch', 'friendHome', 'harvest', 'hitLanded',
    'levelUp', 'place', 'playerHurt', 'rescue', 'reward', 'started', 'storyStep', 'telegraph']);
  const bus = createEvents();
  for (const event of EVENTS) {
    const got: unknown[] = [], off = bus.on(event, payload => { got.push(payload); });
    bus.emit(event, EVENT_SAMPLES[event] as never);
    for (const other of EVENTS) if (other !== event) bus.emit(other, EVENT_SAMPLES[other] as never);
    assert.equal(got.length, 1, `${event} reaches its listener once, and no other event does`);
    assert.equal(got[0], EVENT_SAMPLES[event], 'the payload is handed over as it is, not copied');
    off();
  }
});

test('listeners subscribe and unsubscribe; they are told in the order they subscribed', () => {
  const bus = createEvents(), order: string[] = [];
  const offA = bus.on('levelUp', ({ level }) => { order.push('a' + level); }), offB = bus.on('levelUp', ({ level }) => { order.push('b' + level); });
  bus.emit('levelUp', { level: 2 });
  offA(); offA(); // twice is harmless
  bus.emit('levelUp', { level: 3 });
  offB();
  bus.emit('levelUp', { level: 4 });
  assert.deepEqual(order, ['a2', 'b2', 'b3']);
  // A listener may leave, or bring another, while it is being told: this round is not disturbed.
  const late: number[] = [];
  const once = bus.on('levelUp', ({ level }) => { once(); bus.on('levelUp', l => { late.push(l.level); }); order.push('once' + level); });
  bus.emit('levelUp', { level: 5 }); bus.emit('levelUp', { level: 6 });
  assert.deepEqual(order.slice(3), ['once5']); assert.deepEqual(late, [6]);
  assert.doesNotThrow(() => bus.emit('started', {}), 'an event nobody listens to is fine');
});

test('a listener that throws is logged and never stops the others', () => {
  const logged = mock.method(console, 'error', () => {});
  try {
    const bus = createEvents(), told: string[] = [];
    bus.on('harvest', () => { told.push('first'); });
    bus.on('harvest', () => { throw new Error('a broken feature'); });
    bus.on('harvest', ({ crops }) => { told.push('last:' + crops.join()); });
    assert.doesNotThrow(() => bus.emit('harvest', { crops: ['carrot'], all: false, first: false }));
    assert.deepEqual(told, ['first', 'last:carrot']);
    assert.equal(logged.mock.callCount(), 1); assert.match(String(logged.mock.calls[0].arguments[0]), /a broken feature/);
  } finally { logged.mock.restore(); }
});

test('the facts of the HUD tick become storyStep and place events, once per change', () => {
  const bus = createEvents(), seen: string[] = [];
  bus.on('storyStep', p => { seen.push(`story ${p.from}>${p.index}`); }); bus.on('place', p => { seen.push(`place ${p.from}>${p.planet}/${p.name}`); });
  const save = {};
  bus.note(save, 4, 'Clover Village', 'home');
  assert.deepEqual(seen, ['place >home/Clover Village'], 'the first tick is the baseline for the story, and says where the hero is');
  bus.note(save, 4, 'Clover Village', 'home'); bus.note(save, 4, 'Clover Village', 'home');
  assert.equal(seen.length, 1, 'nothing changed: nothing is said');
  bus.note(save, 5, 'Clover Village', 'home');
  bus.note(save, 5, 'Mushroom Forest', 'home');
  bus.note(save, 5, 'Mushroom Forest', 'candy'); // the same zone name on another planet is another place
  bus.note(save, 5, '', 'candy');                 // no zone yet (a world being built): not a place
  bus.note(save, 5, 'Mushroom Forest', 'candy');
  assert.deepEqual(seen.slice(1), ['story 4>5', 'place home/Clover Village>home/Mushroom Forest', 'place home/Mushroom Forest>candy/Mushroom Forest']);
  bus.note({}, 9, 'Mushroom Forest', 'candy');
  assert.equal(seen.length, 4, 'another save (a profile, a state from the server) is a new baseline, not a story step');
  bus.note(save, 10, 'Mushroom Forest', 'candy');
  assert.equal(seen.length, 4, 'and so is coming back to the first one');
});

test('the start code only sends: events are dropped until the services connect a bus, then reach its listeners', () => {
  connect(undefined as never);
  assert.doesNotThrow(() => { emit('levelUp', { level: 2 }); noteProgress({}, 1, 'Clover Village', 'home'); }, 'before the features load nobody listens');
  assert.equal(emit('friendHome', { id: 'pepper' }), false, 'and the sender is told so: a once-only site keeps its news for later');
  let connected = 0;
  const services = createServices(host({ connect: bus => { connected++; connect(bus); } }));
  assert.equal(connected, 1); assert.equal('connect' in services, false, 'features get the bus, not the plug');
  const levels: number[] = [], places: string[] = [];
  services.on('levelUp', ({ level }) => { levels.push(level); }); services.on('place', ({ name }) => { places.push(name); });
  assert.equal(emit('levelUp', { level: 3 }), true); services.emit('levelUp', { level: 4 }); // the game's emit, and a feature's own
  noteProgress({}, 1, 'Clover Village', 'home');
  assert.deepEqual(levels, [3, 4]); assert.deepEqual(places, ['Clover Village']);
  assert.equal(services.state().level, 3); assert.equal(services.quality(), 'high'); assert.equal(services.world.planet, 'home');
});

test('preferences read and write the storage of this browser, and survive a storage that throws or is missing', () => {
  const real = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const use = (storage: unknown) => Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true, writable: true });
  const services = createServices(host());
  try {
    const kept = new Map<string, string>();
    use({ getItem: (key: string) => kept.get(key) ?? null, setItem: (key: string, value: string) => { kept.set(key, value); } });
    assert.equal(services.pref('captions'), ''); assert.equal(services.pref('captions', 'on'), 'on', 'unset: the fallback');
    assert.equal(services.setPref('captions', 'off'), true);
    assert.equal(services.pref('captions', 'on'), 'off'); assert.deepEqual([...kept], [[PREF_PREFIX + 'captions', 'off']], 'stored under a prefix of the game');
    use({ getItem() { throw new Error('storage is closed'); }, setItem() { throw new Error('quota'); } });
    assert.equal(services.pref('captions', 'on'), 'on'); assert.equal(services.setPref('captions', 'off'), false);
    use(undefined);
    assert.equal(services.pref('captions', 'on'), 'on'); assert.equal(services.setPref('captions', 'off'), false);
  } finally { if (real) Object.defineProperty(globalThis, 'localStorage', real); else delete (globalThis as { localStorage?: unknown }).localStorage; }
});

test('the audio features come in a chunk of their own: mounted when it arrives, one retry when it does not, and never in the way', async () => {
  const { loadAudio, AUDIO_RETRY } = await import('../src/game-services.ts');
  const tick = () => new Promise(resolve => setTimeout(resolve, 0)), services = { name: 'services' } as never;
  const run = async (answers: boolean[]) => {
    const mounted: unknown[] = [], timers: [() => void, number][] = [], logged: unknown[] = [], error = console.error; let loads = 0;
    console.error = (e: unknown) => { logged.push(e); };
    try {
      loadAudio(services, async () => { if (!answers[loads++]) throw new Error('offline'); return { mountAudio: s => { mounted.push(s); } }; }, (fn, ms) => { timers.push([fn, ms]); });
      await tick(); await tick();
      const first = { mounted: mounted.length, timers: timers.length };
      for (const [fn] of timers.splice(0)) fn(); await tick(); await tick();
      return { first, mounted, timers, logged, loads };
    } finally { console.error = error; }
  };
  const ok = await run([true]); assert.deepEqual(ok.first, { mounted: 1, timers: 0 }); assert.equal(ok.mounted[0], services); assert.equal(ok.loads, 1); assert.equal(ok.logged.length, 0);
  const second = await run([false, true]); assert.deepEqual(second.first, { mounted: 0, timers: 1 }); assert.equal(second.mounted.length, 1); assert.equal(second.loads, 2); assert.equal(second.logged.length, 1);
  const never = await run([false, false]); assert.equal(never.mounted.length, 0); assert.equal(never.loads, 2, 'one retry, not a loop'); assert.equal(never.timers.length, 0); assert.equal(never.logged.length, 2);
  assert.equal(AUDIO_RETRY, 8000);
  // A chunk whose mounting throws is logged like a failed fetch and does not reach the caller.
  const broken = await run([true]); assert.equal(broken.loads, 1);
  let threw = false; const error = console.error; console.error = () => {};
  try { loadAudio(services, async () => ({ mountAudio() { throw new Error('bad feature'); } }), () => {}); await tick(); await tick(); } catch { threw = true; } finally { console.error = error; }
  assert.equal(threw, false);
});
