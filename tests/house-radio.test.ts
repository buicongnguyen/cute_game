// Review: the radio's theme is an <audio> loop that only the frame loop stopped, so it played on in a hidden tab.
import test from 'node:test';
import assert from 'node:assert/strict';

test('the radio theme pauses while the tab is hidden and goes on when it is back', async () => {
  const doc = Object.assign(new EventTarget(), { hidden: false, documentElement: {} });
  const plays: string[] = [];
  class FakeAudio { loop = false; volume = 1; src: string; constructor(src: string) { this.src = src; } play() { plays.push('play'); return Promise.resolve(); } pause() { plays.push('pause'); } }
  const g = globalThis as Record<string, unknown>, before = { document: g.document, Audio: g.Audio };
  g.document = doc; g.Audio = FakeAudio;
  try {
    const { MusicBox } = await import('../src/house-life.ts');
    const box = new MusicBox(); box.start(); assert.deepEqual(plays, ['play']);
    doc.hidden = true; doc.dispatchEvent(new Event('visibilitychange')); assert.deepEqual(plays, ['play', 'pause'], 'hidden: paused');
    doc.hidden = false; doc.dispatchEvent(new Event('visibilitychange')); assert.deepEqual(plays, ['play', 'pause', 'play'], 'back: playing again');
    box.stop(); doc.hidden = true; doc.dispatchEvent(new Event('visibilitychange')); doc.hidden = false; doc.dispatchEvent(new Event('visibilitychange'));
    assert.equal(plays.at(-1), 'pause', 'a radio switched off stays off');
  } finally { g.document = before.document; g.Audio = before.Audio; }
});
