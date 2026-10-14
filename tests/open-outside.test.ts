import test from 'node:test';
import assert from 'node:assert/strict';
import { inAppBrowser, framed, chromeIntent, isAndroid } from '../src/open-outside.ts';
import { VI_PACK } from '../src/locales/vi-pack.ts';

test('app browsers are recognised, ordinary browsers are not', () => {
  for (const ua of ['Mozilla/5.0 (Linux; Android 10; SM-G960F Build/QP1A; wv) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36 [FB_IAB/FB4A;FBAV/440.0;]',
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Zalo iOS',
    'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36 Instagram 300.0',
    'Mozilla/5.0 (Linux; Android 12; wv) AppleWebKit/537.36 Version/4.0 Chrome/119 Mobile Safari/537.36 KAKAOTALK 10.4']) assert.ok(inAppBrowser(ua), ua);
  for (const ua of ['Mozilla/5.0 (Linux; Android 10; SM-G960F) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36',
    'Mozilla/5.0 (Linux; Android 10; SAMSUNG SM-G960F) AppleWebKit/537.36 SamsungBrowser/23.0 Chrome/115 Mobile Safari/537.36',
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36']) assert.ok(!inAppBrowser(ua), ua);
  assert.ok(isAndroid('Linux; Android 10')); assert.ok(!isAndroid('iPhone'));
});

test('a framed page is detected, also when the parent is on another site', () => {
  const top = {} as Window; assert.ok(framed({ self: {}, top } as unknown as Window)); const self = {} as Window;
  assert.ok(!framed({ self, top: self } as unknown as Window));
  assert.ok(framed({ self: {}, get top(): Window { throw new Error('cross-origin'); } } as unknown as Window));
});

test('the Chrome intent keeps the whole address and falls back to it', () => {
  const href = 'https://buicongnguyen.github.io/cute_game/?lang=vi#play', intent = chromeIntent(href);
  assert.ok(intent.startsWith('intent://buicongnguyen.github.io/cute_game/?lang=vi%23play#Intent;scheme=https;package=com.android.chrome;'));
  assert.ok(intent.includes('S.browser_fallback_url=' + encodeURIComponent(href)) && intent.endsWith(';end'));
});

test('the banner reads in Vietnamese', () => {
  for (const s of ['For smooth play, open in Chrome.', 'For smooth play, open in your browser: tap ⋯ and then Open in browser.', 'The game runs smoother on its own page.', 'Open in Chrome', 'Copy link', 'Link copied', 'Play full screen', 'Close']) assert.ok(VI_PACK[s], s);
});
