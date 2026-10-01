"""Zoo Garden dressing kit: small ground pieces that fill each planet's bare ground.

Nine original walk-through pieces (pebbles, sprinkles, toy bits, sky blooms, jungle blooms, shells,
ice shards, embers, glow shrooms), one per world palette. The game never draws these as 3D models:
it bakes each into the 2D ground-cover atlas (src/cover-cards.ts), so every scatter tile still draws
all its cover in one instanced batch of cards. A piece therefore costs atlas texels, not draw calls,
and its triangle budget only bounds the one-time bake. Geometry helpers come from
build_worlds_bright.py so the pieces share the bright kit's facets and materials style.

    blender -b --factory-startup --python art/blender/kit/build_dressing.py -- [--install] [--render]

Outputs art/generated/kit/models/worlds-dressing.glb (+ manifest); --install copies it to
public/assets/models/; --render writes art/previews/kit/worlds-dressing.webp. Every node has its
origin at its ground centre and stays inside a 1 m square and 0.6 m height. Deterministic.
"""
import json
import math
import os
import random
import shutil
import sys

import bpy

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)
import build_worlds_bright as B  # noqa: E402
from build_worlds_bright import Piece, ball, disc, ico0, lathe, leaf, octa, star_outline, tube, xf, RAD, TAU  # noqa: E402
from style import export_glb, mat, reset_scene  # noqa: E402
from mathutils import Vector  # noqa: E402

REPO = B.REPO
MODELS, GEN, PREVIEWS, PUBLIC_MODELS = B.MODELS, B.GEN, B.PREVIEWS, B.PUBLIC_MODELS
GLB_NAME = 'worlds-dressing.glb'
MANIFEST = os.path.join(GEN, 'worlds-dressing-manifest.json')
GLB_LIMIT = 120 * 1024
MAX_SIZE, MAX_H = 1.0, 0.6

# name: (planet, triangle budget)
CONTRACT = {
    'pebbles': ('home', 120), 'sprinkles': ('candy', 160), 'toy_bits': ('toy', 160), 'sky_bloom': ('cloud', 160),
    'jungle_bloom': ('jungle', 160), 'shells': ('ocean', 160), 'ice_shards': ('ice', 120), 'embers': ('lava', 120),
    'glow_shrooms': ('shadow', 160),
}
# name: (colour, roughness, emission colour, strength)
MATERIALS = {
    'Pebble': ('#B9B2A6', .8, None, 0), 'Pebble dark': ('#8C8578', .8, None, 0), 'Moss': ('#6CC24A', .7, None, 0),
    'Sprinkle pink': ('#FF4FA3', .4, None, 0), 'Sprinkle blue': ('#3FB6FF', .4, None, 0), 'Sprinkle yellow': ('#FFD93A', .4, None, 0),
    'Mint': ('#4FE2BE', .3, None, 0),
    'Toy red': ('#EE2D2D', .38, None, 0), 'Toy blue': ('#2462EA', .38, None, 0), 'Toy yellow': ('#FFC21A', .38, None, 0),
    'Cloud puff A': ('#FCFEFF', .55, None, 0), 'Sky petal': ('#8FD2FF', .5, None, 0), 'Sky grass': ('#5CD446', .6, None, 0),
    'Jungle leaf B': ('#3FC23E', .5, None, 0), 'Bloom': ('#FF5A2E', .45, None, 0), 'Bloom heart': ('#FFD93A', .45, None, 0),
    'Shell': ('#FFE3C8', .45, None, 0), 'Starfish': ('#FF8A4A', .5, None, 0), 'Sand pebble': ('#D9C79A', .7, None, 0),
    'Ice': ('#BFE8FF', .2, None, 0), 'Snow': ('#FFFFFF', .6, None, 0),
    'Basalt': ('#3A3036', .8, None, 0), 'Ember': ('#FF7A2B', .5, '#FF6A1A', 2.0),
    'Shroom stem': ('#D8CCF0', .6, None, 0), 'Shroom cap': ('#9A6AFF', .45, '#B48CFF', 1.2), 'Shroom dot': ('#7AF0FF', .4, '#7AF0FF', 1.5),
}


class Mats(dict):
    def __missing__(self, name):
        color, rough, emit, strength = MATERIALS[name]
        m = mat(name, color, rough, 0.0, emit, strength)
        m.use_backface_culling = True
        self[name] = m
        return m


def stone(r, c, squash, seed):
    """A faceted pebble: a squashed icosahedron with jittered corners, sat on the ground."""
    g = ico0(r, (0, 0, 0), squash)
    rng = random.Random(seed)
    for v in g.verts:
        v.x *= rng.uniform(.85, 1.12); v.y *= rng.uniform(.85, 1.12)
    low = min(v.z for v in g.verts)
    for v in g.verts:
        v.z = max(0.0, v.z - low - r * squash * .25) + 0.0
        v.x += c[0]; v.y += c[1]
    return g


def cap(r, h, c):
    return lathe([(r * .25, 0.0), (r, h * .35), (r * .7, h * .8), (0.0, h)], 8).transformed(xf(c))


def build_pebbles(m):
    p = Piece('pebbles')
    for (x, y), r, sq, key, s in (((-.18, .05), .17, .5, 'Pebble', 1), ((.16, -.06), .12, .55, 'Pebble dark', 2), ((.04, .2), .08, .6, 'Pebble', 3)):
        p.add(stone(r, (x, y), sq, s), m[key], smooth=False)
    for k in range(3):
        a = RAD(-30 + 60 * k)
        p.add(leaf(.22, .05, segs=2, fold=.2, bend=.3), m['Moss'], xf((.2, .16, 0), (RAD(70), 0, a)), smooth=False)
    return p.build()


def build_sprinkles(m):
    p = Piece('sprinkles')
    rng = random.Random(11)
    keys = ['Sprinkle pink', 'Sprinkle blue', 'Sprinkle yellow']
    for k in range(7):
        a, d, yaw = rng.uniform(0, TAU), rng.uniform(.05, .36), rng.uniform(0, TAU)
        cx, cy = math.cos(a) * d, math.sin(a) * d
        dx, dy = math.cos(yaw) * .07, math.sin(yaw) * .07
        p.add(tube([Vector((cx - dx, cy - dy, .03)), Vector((cx + dx, cy + dy, .03))], .03, sides=4, cap_start=True, cap_end=True), m[keys[k % 3]])
    # A pinwheel mint, lying flat and slightly domed.
    p.add(disc(B.circle_outline(10, .13), dome=.04), m['Mint'], xf((-.12, -.18, .02)))
    return p.build()


def build_toy_bits(m):
    p = Piece('toy_bits')
    p.add(ball(8, (-50, 0, 50), (.09, .09, .09), (-.2, .1, .09)), m['Toy blue'])
    p.add(ball(8, (-50, 0, 50), (.07, .07, .07), (.05, .26, .07)), m['Toy yellow'])
    # A little peg brick with two studs.
    p.add(lathe([(.17, 0), (.17, .14), (0, .14)], 4, phase=math.pi / 4), m['Toy red'], xf((.15, -.1, 0), (0, 0, .3), (1, .62, 1)), smooth=False)
    for sx in (-.06, .06):
        p.add(lathe([(.04, 0), (.04, .04), (0, .04)], 6), m['Toy red'], xf((.15 + sx, -.1, .14)))
    return p.build()


def build_sky_bloom(m):
    p = Piece('sky_bloom')
    p.add(ball(8, (-30, 10, 50), (.2, .17, .14), (-.08, .02, .1)), m['Cloud puff A'])
    p.add(ball(8, (-30, 10, 50), (.14, .13, .11), (.16, -.08, .08)), m['Cloud puff A'])
    for (x, y), h in (((.0, .12), .3), ((.2, .12), .24), ((-.22, -.12), .22)):
        p.add(tube([Vector((x, y, 0)), Vector((x, y, h))], .012, sides=3), m['Sky grass'], smooth=False)
        p.add(disc(star_outline(5, .07, .035), dome=.02), m['Sky petal'], xf((x, y, h)))
    return _clamp(p).build()


def build_jungle_bloom(m):
    p = Piece('jungle_bloom')
    for k in range(5):
        a = TAU * k / 5 + .3
        p.add(leaf(.38, .16, segs=3, fold=.35, bend=-.2), m['Jungle leaf B'], xf((0, 0, .02), (RAD(55), 0, a)))
    p.add(disc(star_outline(6, .12, .06), dome=.03), m['Bloom'], xf((0, 0, .22)))
    p.add(ball(6, (0, 50), (.04, .04, .03), (0, 0, .24)), m['Bloom heart'])
    return p.build()


def build_shells(m):
    p = Piece('shells')
    # Scallop: a fan with ridges, tipped up a little.
    fan = [(0.0, 0.0)] + [(.16 * math.cos(a) * (1 + .08 * math.cos(9 * a)), .16 * math.sin(a) * (1 + .08 * math.cos(9 * a)) + .02)
                         for a in [RAD(15 + 150 * k / 10) for k in range(11)]]
    p.add(disc(fan, dome=.05, center=(0, .06)), m['Shell'], xf((-.15, .08, .02), (RAD(-12), 0, .4)))
    p.add(disc(star_outline(5, .16, .06), dome=.04), m['Starfish'], xf((.16, -.1, .01), (0, 0, .5)))
    p.add(stone(.07, (.12, .22), .5, 5), m['Sand pebble'], smooth=False)
    return _clamp(p).build()


def build_ice_shards(m):
    p = Piece('ice_shards')
    for (x, y), h, r, tilt, yaw in (((0, 0), .42, .08, 0, 0), ((.12, .05), .28, .06, .4, .3), ((-.1, .08), .24, .05, .45, 2.4)):
        g = octa(1, (0, 0, 0), 1).transformed(xf((0, 0, h * .5), (0, 0, 0), (r, r, h * .5)))
        p.add(g, m['Ice'], xf((x, y, 0), (tilt, 0, yaw)), smooth=False)
    p.add(ball(7, (-20, 30), (.16, .13, .06), (-.02, -.12, .0)), m['Snow'])
    return _clamp(p).build()


def build_embers(m):
    p = Piece('embers')
    for (x, y), r, key, s in (((-.15, .05), .14, 'Basalt', 7), ((.12, .1), .1, 'Basalt', 8), ((.0, -.15), .07, 'Ember', 9), ((.2, -.08), .05, 'Ember', 10)):
        p.add(stone(r, (x, y), .55, s), m[key], smooth=False)
    return p.build()


def build_glow_shrooms(m):
    p = Piece('glow_shrooms')
    for (x, y), h, r in (((0, 0), .3, .12), ((.15, .09), .2, .08), ((-.13, .1), .16, .07)):
        p.add(lathe([(r * .3, 0), (r * .25, h)], 6), m['Shroom stem'], xf((x, y, 0)))
        p.add(lathe([(r, 0), (r * .8, r * .45), (0, r * .65)], 8), m['Shroom cap'], xf((x, y, h)))
        if h > .2:
            p.add(ico0(.025, (x + r * .45, y, h + r * .35)), m['Shroom dot'], smooth=False)
    return p.build()


def _clamp(p):
    for i, v in enumerate(p.verts):
        if v.z < 0:
            p.verts[i] = Vector((v.x, v.y, 0.0))
    return p


BUILDERS = dict(pebbles=build_pebbles, sprinkles=build_sprinkles, toy_bits=build_toy_bits, sky_bloom=build_sky_bloom,
                jungle_bloom=build_jungle_bloom, shells=build_shells, ice_shards=build_ice_shards, embers=build_embers,
                glow_shrooms=build_glow_shrooms)


def stats_of(obj):
    me = obj.data
    me.calc_loop_triangles()
    co = [v.co for v in me.vertices]
    lo = [min(c[i] for c in co) for i in range(3)]
    hi = [max(c[i] for c in co) for i in range(3)]
    return dict(planet=CONTRACT[obj.name][0], triangles=len(me.loop_triangles), materials=[x.name for x in me.materials],
                min=[round(v, 4) for v in lo], max=[round(v, 4) for v in hi])


def main():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    reset_scene()
    m = Mats()
    objs = {n: f(m) for n, f in BUILDERS.items()}
    failures, stats = [], {}
    for n, o in objs.items():
        s = stats[n] = stats_of(o)
        print(f"  {n:13s} {s['triangles']:4d} tris  min {s['min']}  max {s['max']}")
        if s['triangles'] > CONTRACT[n][1]: failures.append(f"{n}: {s['triangles']} tris > {CONTRACT[n][1]}")
        if abs(s['min'][2]) > .02: failures.append(f"{n}: base z {s['min'][2]}")
        if s['max'][2] > MAX_H or any(max(-s['min'][i], s['max'][i]) > MAX_SIZE / 2 for i in (0, 1)): failures.append(f'{n}: outside the dressing box')
    path = os.path.join(MODELS, GLB_NAME)
    size = export_glb(list(objs.values()), path)
    print(f'  {GLB_NAME} {size} bytes')
    if size > GLB_LIMIT: failures.append(f'{GLB_NAME} is {size} bytes')
    os.makedirs(GEN, exist_ok=True)
    with open(MANIFEST, 'w', encoding='utf-8', newline='\n') as fh:
        json.dump(dict(generator='art/blender/kit/build_dressing.py', file=GLB_NAME, bytes=size, nodes=stats), fh, indent=2)
        fh.write('\n')
    if '--render' in argv:
        B.CONTRACT.update({n: dict(planet=c[0], size=(1, 1, .6), r=None, tris=c[1], mats=()) for n, c in CONTRACT.items()})
        B.preview_sheet(objs, os.path.join(PREVIEWS, 'worlds-dressing.webp'))
    if failures:
        print('\nDressing contract failures:\n  ' + '\n  '.join(failures)); sys.stdout.flush(); os._exit(1)
    if '--install' in argv:
        shutil.copyfile(path, os.path.join(PUBLIC_MODELS, GLB_NAME)); print('installed', GLB_NAME)
    print('\nDressing kit OK'); sys.stdout.flush()


if __name__ == '__main__':
    try:
        main()
    except Exception:
        import traceback
        traceback.print_exc(); sys.stdout.flush(); os._exit(1)
