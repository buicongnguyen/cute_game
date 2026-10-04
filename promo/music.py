"""Cosy marimba-and-pad theme for the intro videos (original, generated). Writes music.wav."""
import numpy as np, wave, random
SR = 44100; BPM = 104; BEAT = 60 / BPM; BARS = 22; DUR = BARS * 4 * BEAT + 3
import os
LOOP = os.environ.get('LOOP') == '1'
if LOOP: BARS = 16; DUR = BARS * 4 * BEAT
rng = random.Random(7)
out = np.zeros(int(SR * DUR) + SR)
def hz(m): return 440 * 2 ** ((m - 69) / 12)
def add(t, f, length, amp, kind):
    n = int(SR * length); x = np.arange(n) / SR; i = int(t * SR)
    if kind == 'mar':   # marimba-like: sine + 4th harmonic, quick decay
        y = (np.sin(2 * np.pi * f * x) + .35 * np.sin(2 * np.pi * 4 * f * x) * np.exp(-x * 25)) * np.exp(-x * 5.5)
    elif kind == 'bass':
        y = np.sin(2 * np.pi * f * x) * np.exp(-x * 3.2)
    else:               # pad: soft triangle-ish with slow attack/release
        y = (np.sin(2 * np.pi * f * x) + .3 * np.sin(2 * np.pi * 2 * f * x)) * np.minimum(1, x / .5) * np.minimum(1, (length - x) / .8)
    out[i:i + n] += amp * y[:max(0, len(out) - i)] if i + n > len(out) else amp * y
# C - Am - F - G, pentatonic-friendly melody notes per chord (MIDI)
chords = [(48, [60, 64, 67]), (45, [57, 60, 64]), (53, [57, 60, 65]), (55, [59, 62, 67])]
scale = {0: [72, 74, 76, 79, 81], 1: [72, 74, 76, 79, 81], 2: [72, 74, 77, 79, 81], 3: [71, 74, 76, 79, 83]}
motif = None
for bar in range(BARS):
    root, tri = chords[bar % 4]; t0 = bar * 4 * BEAT
    for k in range(4):  # bass on each beat (root, fifth)
        add(t0 + k * BEAT, hz(root + (7 if k % 2 else 0)) , BEAT * 1.6, .26, 'bass')
    for m in tri: add(t0, hz(m), 4 * BEAT + .6, .05, 'pad')
    for step in range(8):  # eighth-note arpeggio, soft
        add(t0 + step * BEAT / 2, hz(tri[step % 3] + 12), BEAT, .10, 'mar')
    if bar >= 2:       # melody from bar 3, phrases of 2 bars
        if bar % 2 == 0 or motif is None: motif = [rng.choice(scale[bar % 4]) for _ in range(4)]
        for j, m in enumerate(motif):
            if rng.random() < .85: add(t0 + (j * 2 + (1 if j % 2 else 0)) * BEAT / 2 * (1 if bar % 2 else 1), hz(m), BEAT * 1.4, .17, 'mar')
# gentle echo (reverb-ish) and fade
for d, g in ((0.23, .28), (0.41, .18), (0.67, .1)):
    k = int(d * SR); out[k:] += out[:-k] * g
if LOOP:  # wrap the tail (notes ringing past the end) onto the start so the loop is seamless
    n = int(SR * DUR); tail = out[n:].copy(); out = out[:n]; out[:len(tail)] += tail
out = out[:int(SR * DUR)]
if not LOOP: fade = 0
if not LOOP:
    fade = int(SR * 2.5); out[-fade:] *= np.linspace(1, 0, fade); out[:int(SR * .3)] *= np.linspace(0, 1, int(SR * .3))
out = out / np.abs(out).max() * .8
with wave.open('music-loop.wav' if LOOP else 'music.wav', 'wb') as w:
    w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR); w.writeframes((out * 32767).astype(np.int16).tobytes())
print('seconds', DUR)
