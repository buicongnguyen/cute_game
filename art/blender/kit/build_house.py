"""Zoo Garden cottage interior kit: furniture and fittings for the house the explorer can enter.

Original toy-style pieces (sofa, fireplace, beds, shelves, plants, lamps, wardrobe, mirror, kitchen,
bathroom, study and craft corner, windows and doors). The game places them from the room plan in
src/house.ts and merges every plain piece of the whole interior into one vertex-coloured batch, so
the materials here only carry colours (and a glow for lamps, flames and window light).

    blender -b --factory-startup --python art/blender/kit/build_house.py -- [--install] [--render]

Outputs art/generated/kit/models/house.glb (+ manifest); --install copies it to public/assets/models/;
--render writes art/previews/kit/house.webp. Every node has its origin at its ground centre, its front
toward -Y (glTF +Z) and stays inside its CONTRACT box. The door's origin is its hinge (left edge).
Deterministic.
"""
import json
import math
import os
import shutil
import sys

import bpy

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)
from style import (box, cyl, cone, sphere, ico, torus, lathe, blob, extrude_outline, join, export_glb,  # noqa: E402
                   mat, reset_scene, triangles, studio, render)

REPO = os.path.normpath(os.path.join(HERE, '..', '..', '..'))
GEN = os.path.join(REPO, 'art', 'generated', 'kit')
MODELS = os.path.join(GEN, 'models')
PREVIEWS = os.path.join(REPO, 'art', 'previews', 'kit')
PUBLIC_MODELS = os.path.join(REPO, 'public', 'assets', 'models')
GLB_NAME = 'house.glb'
MANIFEST = os.path.join(GEN, 'house-manifest.json')
GLB_LIMIT = 540 * 1024
RAD = math.radians

# name: (width x, depth y, height z, triangle budget)
CONTRACT = {
    'sofa': (2.05, 0.9, 1.1, 1200),
    'armchair': (1.05, 0.9, 1.1, 1000),
    'coffee_table': (0.95, 0.95, 0.7, 400),
    'fireplace': (1.85, 1.2, 2.05, 700),
    'rug_round': (2.65, 2.65, 0.1, 500),
    'rug_rect': (2.25, 1.55, 0.1, 200),
    'bookshelf': (1.35, 0.5, 2.05, 2000),
    'floor_lamp': (0.65, 0.65, 1.75, 200),
    'plant_big': (0.85, 0.75, 1.5, 400),
    'plant_small': (0.35, 0.35, 0.55, 300),
    'dining_table': (1.45, 0.95, 1.2, 500),
    'chair': (0.5, 0.5, 1.05, 300),
    'window': (1.55, 0.4, 2.3, 300),
    'picture': (0.95, 0.15, 2.3, 200),
    'bed': (1.55, 2.2, 1.05, 1100),
    'nightstand': (0.55, 0.65, 0.6, 300),
    'lamp_small': (0.4, 0.4, 0.5, 200),
    'wardrobe': (1.35, 0.8, 2.25, 600),
    'mirror': (0.75, 0.55, 1.6, 700),
    'counter': (2.5, 0.8, 1.25, 700),
    'stove': (0.85, 0.8, 1.2, 500),
    'fridge': (0.8, 0.85, 1.85, 600),
    'bathtub': (1.8, 1, 0.85, 1100),
    'sink': (0.65, 0.65, 1.65, 400),
    'towel_rack': (0.9, 0.2, 1.1, 300),
    'desk': (1.35, 0.7, 1.2, 500),
    'globe': (0.6, 0.5, 1.15, 1000),
    'workbench': (1.65, 0.75, 1.3, 600),
    'easel': (0.8, 0.8, 1.65, 1100),
    'yarn_basket': (0.7, 0.7, 0.7, 300),
    'door_frame': (1.95, 0.55, 2.5, 300),
    'door': (2.2, 0.35, 2, 500),
    'doorway': (1.05, 0.1, 2, 200),
    'duck': (0.25, 0.4, 0.3, 300),
    'stool': (0.45, 0.45, 0.55, 200),
    'round_table': (1.05, 1.05, 1, 700),
    'welcome_mat': (1.25, 0.75, 0.1, 200),
}

# name: (colour, roughness, emission colour, strength)
MATERIALS = {
    'Wood': ('#C77A3A', .6, None, 0), 'Wood light': ('#E8A862', .6, None, 0), 'Wood dark': ('#8A4B25', .6, None, 0),
    'Teal fabric': ('#24B3B0', .8, None, 0), 'Rose fabric': ('#F2668E', .8, None, 0), 'Cream fabric': ('#FFF1D2', .8, None, 0),
    'Sun fabric': ('#FFC23A', .8, None, 0), 'Lilac fabric': ('#A98BFF', .8, None, 0),
    'Brick': ('#CF5B3E', .8, None, 0), 'Brick light': ('#E98A5E', .8, None, 0), 'Soot': ('#3A2A2A', .9, None, 0),
    'Flame': ('#FF8A2A', .4, '#FF7A1A', 3.0), 'Flame core': ('#FFE36B', .4, '#FFD84A', 3.0),
    'Leaf': ('#3FB53A', .6, None, 0), 'Leaf light': ('#7EDB55', .6, None, 0), 'Pot': ('#E0743E', .6, None, 0),
    'White': ('#FFFDF6', .4, None, 0), 'Porcelain': ('#F2F8FF', .25, None, 0), 'Steel': ('#B9C3D2', .3, None, 0),
    'Charcoal': ('#3A3D4A', .7, None, 0), 'Gold': ('#F5B21E', .35, None, 0),
    'Window light': ('#FFE7A0', .3, '#FFD978', 1.6), 'Lamp glow': ('#FFF0B0', .3, '#FFE08A', 2.2),
    'Mirror glass': ('#BDEBFF', .1, '#9FDcff', .35),
    'Rug red': ('#E23D5E', .9, None, 0), 'Rug cream': ('#FFE2B0', .9, None, 0), 'Rug blue': ('#3F74D6', .9, None, 0),
    'Rug green': ('#59C27A', .9, None, 0),
    'Book red': ('#EF3B3B', .7, None, 0), 'Book blue': ('#35A2F2', .7, None, 0), 'Book green': ('#4FBF3A', .7, None, 0),
    'Book yellow': ('#FFC83A', .7, None, 0), 'Book purple': ('#9B6BFF', .7, None, 0),
    'Terracotta': ('#D8643C', .6, None, 0), 'Mint paint': ('#7FE0C4', .5, None, 0), 'Sky paint': ('#6CCBFF', .5, None, 0),
    'Water': ('#8FDDF5', .1, None, 0), 'Duck': ('#FFD93A', .4, None, 0), 'Beak': ('#FF8A2A', .4, None, 0),
    'Doorway dark': ('#2A1A16', .9, None, 0), 'Ocean': ('#3C8EE6', .5, None, 0),
    'Canvas': ('#FFF8E6', .8, None, 0), 'Paint pink': ('#FF5C8A', .6, None, 0), 'Paint sun': ('#FFC83A', .6, None, 0),
    'Paint green': ('#6FD24A', .6, None, 0),
}


class Mats(dict):
    def __missing__(self, name):
        color, rough, emit, strength = MATERIALS[name]
        m = mat(name, color, rough, 0.0, emit, strength)
        self[name] = m
        return m


M = Mats()


def arc(cx, cz, r, a0, a1, n):
    return [(cx + r * math.cos(a0 + (a1 - a0) * i / n), cz + r * math.sin(a0 + (a1 - a0) * i / n)) for i in range(n + 1)]


def arch(w, h, n=8, x0=0.0):
    r = w / 2
    return [(x0 - r, 0.0), (x0 + r, 0.0)] + arc(x0, h - r, r, 0, math.pi, n)


def legs(name, w, d, h, r=.035, inset=.08, material='Wood dark', verts=6):
    out = []
    for i, (sx, sy) in enumerate(((-1, -1), (1, -1), (1, 1), (-1, 1))):
        out.append(cyl(f'{name} leg {i}', r, h, (sx * (w / 2 - inset), sy * (d / 2 - inset), h / 2), M[material], verts=verts, bev=0))
    return out


def piece(name, parts):
    obj = join(parts, name)
    return obj


# ------------------------------------------------------------------ living room
def build_sofa(name='sofa', w=2.0, fabric='Teal fabric', pillow='Rose fabric'):
    p = [box(f'{name} base', (w, .85, .34), (0, 0, .25), M[fabric], bev=.06, seg=2)]
    p += legs(name, w, .85, .1, r=.04)
    seats = 2 if w > 1.5 else 1
    sw = (w - .44) / seats
    for i in range(seats):
        x = -w / 2 + .22 + sw * (i + .5)
        p.append(box(f'{name} seat {i}', (sw - .03, .66, .16), (x, -.06, .5), M['Cream fabric'], bev=.06, seg=2))
    p.append(box(f'{name} back', (w, .24, .6), (0, .31, .72), M[fabric], bev=.08, seg=2))
    for sx in (-1, 1):
        p.append(box(f'{name} arm {sx}', (.22, .85, .5), (sx * (w / 2 - .11), 0, .55), M[fabric], bev=.08, seg=2))
    p.append(box(f'{name} pillow', (.38, .14, .34), (-w / 2 + .5, .14, .74), M[pillow], bev=.06, seg=2, rot=(RAD(-12), 0, RAD(8))))
    if seats > 1:
        p.append(box(f'{name} pillow 2', (.38, .14, .34), (w / 2 - .5, .14, .74), M['Sun fabric'], bev=.06, seg=2, rot=(RAD(-12), 0, RAD(-8))))
    return piece(name, p)


def build_coffee_table():
    p = [cyl('ct top', .45, .06, (0, 0, .45), M['Wood light'], verts=20, bev=.02, seg=1)]
    for i in range(3):
        a = RAD(90 + 120 * i)
        p.append(cyl(f'ct leg {i}', .035, .42, (math.cos(a) * .28, math.sin(a) * .28, .21), M['Wood dark'], verts=6, bev=0))
    p.append(lathe('ct pot', [(.0, .48), (.08, .48), (.1, .55), (.07, .62), (.0, .63)], (0.08, -.05, 0), M['White'], segments=10))
    p.append(cyl('ct cup', .04, .07, (-.16, .1, .515), M['Rose fabric'], verts=8, bev=0))
    return piece('coffee_table', p)


def build_fireplace():
    p = [box('fp body', (1.6, .6, 1.1), (0, 0, .55), M['Brick'], bev=.04, seg=1)]
    p.append(box('fp breast', (1.1, .45, .85), (0, .07, 1.55), M['Brick light'], bev=.04, seg=1))
    p.append(box('fp mantel', (1.8, .72, .1), (0, -.04, 1.13), M['Wood dark'], bev=.03, seg=1))
    p.append(extrude_outline('fp mouth', arch(.9, .72, 8), .1, (0, -.27, .1), M['Soot'], bev=.0))
    p.append(box('fp hearth', (1.3, .3, .08), (0, -.42, .04), M['Brick light'], bev=.02, seg=1))
    for i, x in enumerate((-.14, .14)):
        p.append(cyl(f'fp log {i}', .07, .55, (x * .4, -.2, .2), M['Wood dark'], verts=8, bev=0, rot=(0, RAD(90), RAD(25 if i else -25))))
    for i, (x, h, r) in enumerate(((0, .5, .17), (-.17, .34, .11), (.17, .38, .12))):
        p.append(cone(f'fp flame {i}', r, h, (x, -.22, .26 + h / 2), M['Flame'], verts=7))
    p.append(cone('fp core', .09, .3, (0, -.26, .4), M['Flame core'], verts=6))
    for i, x in enumerate((-.6, .6)):
        p.append(cyl(f'fp candle {i}', .04, .16, (x, -.1, 1.26), M['White'], verts=8, bev=0))
        p.append(cone(f'fp candle flame {i}', .03, .08, (x, -.1, 1.38), M['Flame core'], verts=5))
    p.append(sphere('fp vase', .09, (0, -.12, 1.27), M['Sky paint'], segs=10, rings=6))
    return piece('fireplace', p)


def build_rug_round():
    p = [cyl('rr outer', 1.3, .02, (0, 0, .01), M['Rug red'], verts=32, bev=0),
         cyl('rr ring', 1.0, .022, (0, 0, .012), M['Rug cream'], verts=32, bev=0),
         cyl('rr inner', .6, .024, (0, 0, .014), M['Rug red'], verts=28, bev=0)]
    return piece('rug_round', p)


def build_rug_rect(name='rug_rect', w=2.2, d=1.5, body='Rug blue', border='Rug cream'):
    p = [box(f'{name} border', (w, d, .02), (0, 0, .01), M[border], bev=0),
         box(f'{name} body', (w - .24, d - .24, .024), (0, 0, .012), M[body], bev=0)]
    for i in range(3):
        p.append(box(f'{name} stripe {i}', (w - .5, .08, .026), (0, (i - 1) * (d - .5) / 2, .013), M[border], bev=0))
    return piece(name, p)


def build_bookshelf():
    w, d, h = 1.2, .4, 2.0
    p = [box('bs side L', (.06, d, h), (-w / 2 + .03, 0, h / 2), M['Wood'], bev=.015, seg=1),
         box('bs side R', (.06, d, h), (w / 2 - .03, 0, h / 2), M['Wood'], bev=.015, seg=1),
         box('bs back', (w, .03, h), (0, d / 2 - .015, h / 2), M['Wood dark'], bev=0),
         box('bs crown', (w + .08, d + .04, .06), (0, 0, h - .03), M['Wood dark'], bev=.015, seg=1)]
    keys = ['Book red', 'Book blue', 'Book green', 'Book yellow', 'Book purple']
    k = 0
    for s, z in enumerate((.04, .5, .98, 1.46)):
        p.append(box(f'bs shelf {s}', (w - .1, d - .04, .04), (0, 0, z), M['Wood'], bev=0))
        if s == 3:
            p.append(sphere('bs ball', .12, (-.25, -.02, z + .14), M['Sky paint'], segs=10, rings=6))
            p.append(cyl('bs jar', .09, .22, (.25, 0, z + .13), M['Pot'], verts=8, bev=0))
            continue
        x = -w / 2 + .1
        while x < w / 2 - .14:
            bw = .07 + (k * 37 % 5) * .012
            bh = .28 + (k * 53 % 4) * .03
            p.append(box(f'bs book {k}', (bw, d - .1, bh), (x + bw / 2, -.02, z + .02 + bh / 2), M[keys[k % 5]], bev=.008, seg=1,
                         rot=(0, RAD(8) if k % 7 == 3 else 0, 0)))
            x += bw + .015
            k += 1
    return piece('bookshelf', p)


def build_floor_lamp():
    p = [cyl('fl base', .18, .05, (0, 0, .025), M['Charcoal'], verts=12, bev=.01, seg=1),
         cyl('fl pole', .025, 1.3, (0, 0, .7), M['Gold'], verts=6, bev=0),
         cyl('fl shade', .3, .38, (0, 0, 1.48), M['Lamp glow'], verts=12, bev=0, radius_top=.2)]
    return piece('floor_lamp', p)


def leafy(prefix, base_z, r, n, spread, seed):
    import random
    rng = random.Random(seed)
    out = []
    for i in range(n):
        a = math.tau * i / n + rng.uniform(-.3, .3)
        d = spread * rng.uniform(.3, 1)
        out.append(blob(f'{prefix} leaf {i}', r * rng.uniform(.75, 1.1), (math.cos(a) * d, math.sin(a) * d, base_z + rng.uniform(0, r * 1.4)),
                        M['Leaf' if i % 2 else 'Leaf light'], scale=(1, 1, 1.25), subdiv=1, wobble=.12, seed=seed + i))
    return out


def build_plant_big():
    p = [lathe('pb pot', [(.0, 0), (.2, 0), (.28, .4), (.3, .45), (.0, .45)], (0, 0, 0), M['Pot'], segments=14)]
    p.append(cyl('pb soil', .26, .02, (0, 0, .44), M['Wood dark'], verts=12, bev=0))
    p += leafy('pb', .7, .24, 7, .2, 5)
    p.append(blob('pb top', .25, (0, 0, 1.15), M['Leaf light'], scale=(1, 1, 1.1), subdiv=1, wobble=.1, seed=3))
    return piece('plant_big', p)


def build_plant_small():
    p = [lathe('ps pot', [(.0, 0), (.1, 0), (.14, .2), (.0, .2)], (0, 0, 0), M['Sky paint'], segments=10)]
    p += leafy('ps', .26, .1, 4, .06, 9)
    p.append(sphere('ps flower', .05, (.04, -.06, .44), M['Rose fabric'], segs=8, rings=5))
    return piece('plant_small', p)


def build_dining_table():
    p = [box('dt top', (1.4, .9, .07), (0, 0, .76), M['Wood light'], bev=.025, seg=1)]
    p += legs('dt', 1.4, .9, .73, r=.045, inset=.12, material='Wood')
    p.append(box('dt runner', (1.1, .3, .01), (0, 0, .8), M['Rose fabric'], bev=0))
    p.append(lathe('dt vase', [(.0, .8), (.06, .8), (.08, .9), (.04, 1.0), (.0, 1.0)], (0, 0, 0), M['Sky paint'], segments=10))
    for i, (x, y) in enumerate(((-.18, .05), (.0, -.06), (.17, .04))):
        p.append(sphere(f'dt bloom {i}', .05, (x * .5, y, 1.06), M['Sun fabric' if i == 1 else 'Rose fabric'], segs=8, rings=5))
    return piece('dining_table', p)


def build_chair():
    p = [box('ch seat', (.45, .45, .06), (0, 0, .45), M['Wood light'], bev=.02, seg=1),
         box('ch cushion', (.4, .4, .05), (0, -.01, .5), M['Rose fabric'], bev=.02, seg=1),
         box('ch back', (.45, .06, .45), (0, .2, .75), M['Wood light'], bev=.02, seg=1)]
    p += legs('ch', .45, .45, .43, r=.025, inset=.05, material='Wood')
    return piece('chair', p)


def build_stool():
    p = [cyl('st seat', .2, .06, (0, 0, .45), M['Mint paint'], verts=12, bev=.02, seg=1)]
    for i in range(3):
        a = RAD(90 + 120 * i)
        p.append(cyl(f'st leg {i}', .025, .43, (math.cos(a) * .13, math.sin(a) * .13, .215), M['Wood'], verts=6, bev=0))
    return piece('stool', p)


def build_round_table():
    p = [cyl('rt top', .5, .06, (0, 0, .74), M['White'], verts=20, bev=.02, seg=1),
         cyl('rt post', .06, .7, (0, 0, .37), M['Wood dark'], verts=8, bev=0),
         cyl('rt foot', .25, .05, (0, 0, .025), M['Wood dark'], verts=12, bev=.01, seg=1)]
    p.append(lathe('rt bowl', [(.0, .77), (.12, .77), (.16, .84), (.0, .84)], (0, 0, 0), M['Sky paint'], segments=12, cap_top=False))
    for i, (x, y, c) in enumerate(((-.05, 0, 'Book red'), (.05, .04, 'Sun fabric'), (0, -.05, 'Leaf light'))):
        p.append(sphere(f'rt fruit {i}', .055, (x, y, .87), M[c], segs=8, rings=5))
    return piece('round_table', p)


def build_window():
    w, h, z0 = 1.2, 1.2, .9
    p = [box('wi frame', (w, .14, h), (0, 0, z0 + h / 2), M['Wood light'], bev=.03, seg=1),
         box('wi sill', (w + .16, .22, .07), (0, -.06, z0 - .02), M['Wood light'], bev=.02, seg=1)]
    for i, (x, z) in enumerate(((-1, -1), (1, -1), (-1, 1), (1, 1))):
        p.append(box(f'wi pane {i}', (w / 2 - .14, .05, h / 2 - .14), (x * (w / 4 - .02), -.06, z0 + h / 2 + z * (h / 4 - .02)), M['Window light'], bev=0))
    for sx in (-1, 1):
        p.append(box(f'wi curtain {sx}', (.18, .06, h + .1), (sx * (w / 2 + .02), -.09, z0 + h / 2 + .02), M['Rose fabric'], bev=.02, seg=1))
    p.append(box('wi rod', (w + .3, .04, .04), (0, -.1, z0 + h + .1), M['Wood dark'], bev=0))
    return piece('window', p)


def build_picture():
    p = [box('pi frame', (.9, .06, .65), (0, 0, 1.9), M['Gold'], bev=.02, seg=1),
         box('pi canvas', (.76, .02, .5), (0, -.035, 1.9), M['Sky paint'], bev=0),
         box('pi hill', (.76, .025, .16), (0, -.04, 1.73), M['Paint green'], bev=0),
         cyl('pi sun', .08, .02, (.2, -.045, 2.02), M['Paint sun'], verts=10, bev=0, rot=(RAD(90), 0, 0))]
    return piece('picture', p)


# ------------------------------------------------------------------ bedroom
def build_bed():
    p = [box('bd frame', (1.4, 2.1, .3), (0, 0, .2), M['Wood'], bev=.04, seg=1),
         box('bd mattress', (1.3, 2.0, .2), (0, 0, .45), M['White'], bev=.06, seg=2),
         box('bd blanket', (1.36, 1.25, .1), (0, -.38, .55), M['Rose fabric'], bev=.05, seg=2),
         box('bd fold', (1.37, .2, .12), (0, .22, .57), M['Cream fabric'], bev=.05, seg=2),
         box('bd pillow', (.85, .38, .16), (0, .72, .62), M['Cream fabric'], bev=.07, seg=2),
         box('bd head', (1.5, .12, 1.0), (0, 1.0, .5), M['Wood dark'], bev=.04, seg=1),
         box('bd foot', (1.5, .1, .55), (0, -1.03, .28), M['Wood dark'], bev=.03, seg=1)]
    for i in range(4):
        p.append(sphere(f'bd heart {i}', .06, (-.45 + i * .3, -.6, .61), M['Sun fabric'], segs=8, rings=5, scale=(1, 1, .4)))
    return piece('bed', p)


def build_nightstand():
    p = [box('ns body', (.5, .45, .5), (0, 0, .27), M['Wood light'], bev=.03, seg=1),
         box('ns drawer', (.4, .02, .16), (0, -.23, .36), M['Wood'], bev=.01, seg=1),
         sphere('ns knob', .03, (0, -.25, .36), M['Gold'], segs=6, rings=4)]
    p += legs('ns', .5, .45, .04, r=.03, inset=.05)
    return piece('nightstand', p)


def build_lamp_small():
    p = [lathe('ls base', [(.0, 0), (.1, 0), (.12, .06), (.05, .2), (.0, .2)], (0, 0, 0), M['Sky paint'], segments=10),
         cyl('ls shade', .17, .2, (0, 0, .32), M['Lamp glow'], verts=10, bev=0, radius_top=.11)]
    return piece('lamp_small', p)


def build_wardrobe():
    w, d, h = 1.2, .6, 2.1
    p = [box('wd body', (w, d, h - .1), (0, 0, (h - .1) / 2 + .06), M['Wood light'], bev=.04, seg=1),
         box('wd crown', (w + .1, d + .08, .1), (0, 0, h + .02), M['Wood dark'], bev=.03, seg=1)]
    for sx in (-1, 1):
        p.append(box(f'wd door {sx}', (w / 2 - .08, .03, h - .4), (sx * w / 4, -d / 2 - .01, h / 2 + .05), M['Lilac fabric'], bev=.02, seg=1))
        p.append(sphere(f'wd knob {sx}', .04, (sx * .07, -d / 2 - .04, 1.1), M['Gold'], segs=8, rings=5))
        p.append(extrude_outline(f'wd heart {sx}', [(0, -.07), (.08, .01), (.05, .07), (0, .04), (-.05, .07), (-.08, .01)], .02,
                                 (sx * w / 4, -d / 2 - .03, 1.65), M['Rose fabric'], bev=0))
    p += legs('wd', w, d, .08, r=.04, inset=.08)
    return piece('wardrobe', p)


def build_mirror():
    p = [cyl('mi foot', .2, .05, (0, .05, .025), M['Wood dark'], verts=10, bev=.01, seg=1),
         cyl('mi post', .03, .2, (0, .05, .13), M['Wood dark'], verts=6, bev=0)]
    frame = torus('mi frame', .3, .05, (0, 0, 1.0), M['Gold'], 24, 6, rot=(RAD(90), 0, 0))
    frame.scale = (1, 1.45, 1)
    p.append(frame)
    glass = cyl('mi glass', .3, .03, (0, .01, 1.0), M['Mirror glass'], verts=24, bev=0, rot=(RAD(90), 0, 0))
    glass.scale = (1, 1.45, 1)
    p.append(glass)
    p.append(sphere('mi bow', .07, (0, -.03, 1.47), M['Rose fabric'], segs=8, rings=5, scale=(1.6, .6, 1)))
    return piece('mirror', p)


# ------------------------------------------------------------------ kitchen
def build_counter():
    w, d = 2.4, .65
    p = [box('co body', (w, d, .82), (0, 0, .45), M['Mint paint'], bev=.03, seg=1),
         box('co top', (w + .04, d + .04, .06), (0, 0, .89), M['Wood light'], bev=.02, seg=1),
         box('co kick', (w - .1, d - .1, .06), (0, .02, .03), M['Wood dark'], bev=0),
         box('co basin', (.55, .4, .03), (.5, -.02, .925), M['Steel'], bev=0)]
    for i in range(4):
        x = -w / 2 + .3 + i * .6
        p.append(box(f'co door {i}', (.52, .02, .6), (x, -d / 2 - .005, .45), M['White'], bev=.01, seg=1))
        p.append(sphere(f'co knob {i}', .025, (x + .18, -d / 2 - .03, .62), M['Gold'], segs=6, rings=4))
    p.append(cyl('co tap', .025, .3, (.5, .2, 1.05), M['Steel'], verts=6, bev=0))
    p.append(cyl('co spout', .02, .2, (.5, .12, 1.18), M['Steel'], verts=6, bev=0, rot=(RAD(90), 0, 0)))
    for i, c in enumerate(('Book red', 'Sun fabric', 'Sky paint')):
        p.append(cyl(f'co jar {i}', .07, .18 + i * .03, (-.9 + i * .2, .18, .99 + i * .015), M[c], verts=8, bev=0))
    return piece('counter', p)


def build_stove():
    p = [box('sv body', (.8, .65, .88), (0, 0, .45), M['White'], bev=.04, seg=1),
         box('sv window', (.5, .02, .3), (0, -.33, .4), M['Charcoal'], bev=.01, seg=1),
         box('sv handle', (.5, .04, .04), (0, -.36, .63), M['Steel'], bev=0)]
    for i, (x, y) in enumerate(((-.2, -.13), (.2, -.13), (-.2, .15), (.2, .15))):
        p.append(cyl(f'sv ring {i}', .1, .02, (x, y, .9), M['Charcoal'], verts=12, bev=0))
    p.append(lathe('sv pot', [(.0, .91), (.15, .91), (.16, 1.08), (.0, 1.08)], (-.2, -.13, 0), M['Book red'], segments=12))
    p.append(cyl('sv lid knob', .03, .04, (-.2, -.13, 1.1), M['Charcoal'], verts=6, bev=0))
    return piece('stove', p)


def build_fridge():
    p = [box('fr body', (.75, .7, 1.78), (0, 0, .9), M['Sky paint'], bev=.12, seg=3),
         box('fr split', (.72, .02, .03), (0, -.355, 1.2), M['Steel'], bev=0),
         box('fr handle a', (.04, .05, .35), (.28, -.38, 1.45), M['Steel'], bev=.01, seg=1),
         box('fr handle b', (.04, .05, .45), (.28, -.38, .85), M['Steel'], bev=.01, seg=1),
         sphere('fr magnet', .04, (-.18, -.36, 1.5), M['Sun fabric'], segs=8, rings=5),
         sphere('fr magnet 2', .035, (-.05, -.36, 1.62), M['Rose fabric'], segs=8, rings=5)]
    return piece('fridge', p)


# ------------------------------------------------------------------ bathroom
def build_bathtub():
    tub = lathe('bt tub', [(.0, .12), (.42, .12), (.46, .3), (.46, .58), (.4, .58), (.38, .32), (.0, .32)], (0, 0, 0), M['Porcelain'], segments=20)
    tub.scale = (1.9, 1, 1)
    p = [tub]
    water = cyl('bt water', .37, .02, (0, 0, .52), M['Water'], verts=20, bev=0)
    water.scale = (1.9, 1, 1)
    p.append(water)
    for i, (x, y) in enumerate(((-.6, -.25), (.6, -.25), (-.6, .25), (.6, .25))):
        p.append(sphere(f'bt foot {i}', .07, (x, y, .07), M['Gold'], segs=8, rings=5))
    for i, (x, y, r) in enumerate(((-.3, .1, .09), (-.18, -.05, .07), (.25, .12, .08), (.36, -.06, .06), (.0, .15, .07))):
        p.append(sphere(f'bt bubble {i}', r, (x, y, .55), M['White'], segs=8, rings=5))
    p.append(cyl('bt tap', .03, .3, (.78, .1, .65), M['Steel'], verts=6, bev=0))
    return piece('bathtub', p)


def build_sink():
    p = [lathe('sk pedestal', [(.0, 0), (.15, 0), (.09, .2), (.08, .7), (.0, .7)], (0, 0, 0), M['Porcelain'], segments=12),
         lathe('sk basin', [(.0, .7), (.12, .7), (.28, .78), (.29, .88), (.0, .88)], (0, 0, 0), M['Porcelain'], segments=16),
         cyl('sk tap', .025, .14, (0, .18, .95), M['Steel'], verts=6, bev=0),
         box('sk mirror frame', (.5, .04, .6), (0, .2, 1.3), M['Mint paint'], bev=.03, seg=1),
         box('sk mirror', (.4, .02, .5), (0, .17, 1.3), M['Mirror glass'], bev=0)]
    return piece('sink', p)


def build_towel_rack():
    p = [box('tr bar', (.7, .04, .04), (0, 0, 1.0), M['Gold'], bev=0)]
    for sx in (-1, 1):
        p.append(cyl(f'tr post {sx}', .025, 1.0, (sx * .33, 0, .5), M['Gold'], verts=6, bev=0))
        p.append(cyl(f'tr foot {sx}', .08, .03, (sx * .33, 0, .015), M['Gold'], verts=8, bev=0))
    p.append(box('tr towel', (.4, .06, .55), (-.08, -.03, .74), M['Rose fabric'], bev=.02, seg=1))
    p.append(box('tr towel 2', (.22, .06, .4), (.2, -.03, .82), M['Mint paint'], bev=.02, seg=1))
    return piece('towel_rack', p)


def build_duck():
    p = [sphere('du body', .09, (0, 0, .07), M['Duck'], segs=10, rings=6, scale=(1, 1.3, .8)),
         sphere('du head', .06, (0, -.08, .17), M['Duck'], segs=10, rings=6),
         cone('du beak', .03, .06, (0, -.15, .17), M['Beak'], verts=6, rot=(RAD(90), 0, 0))]
    return piece('duck', p)


# ------------------------------------------------------------------ study and craft room
def build_desk():
    p = [box('dk top', (1.3, .65, .06), (0, 0, .76), M['Wood'], bev=.02, seg=1),
         box('dk drawers', (.4, .6, .7), (.42, 0, .38), M['Wood light'], bev=.02, seg=1),
         box('dk drawer a', (.32, .02, .14), (.42, -.31, .55), M['Wood'], bev=.01, seg=1),
         box('dk drawer b', (.32, .02, .14), (.42, -.31, .3), M['Wood'], bev=.01, seg=1),
         box('dk leg', (.05, .6, .73), (-.6, 0, .37), M['Wood light'], bev=.01, seg=1),
         box('dk book', (.3, .22, .04), (-.25, -.05, .81), M['Book blue'], bev=.01, seg=1, rot=(0, 0, RAD(12))),
         box('dk book 2', (.26, .2, .04), (-.25, -.04, .85), M['Book yellow'], bev=.01, seg=1, rot=(0, 0, RAD(-6))),
         cyl('dk mug', .05, .1, (.15, .1, .84), M['Rose fabric'], verts=8, bev=0)]
    p.append(cyl('dk lamp post', .02, .3, (-.5, .2, .94), M['Charcoal'], verts=6, bev=0))
    p.append(cone('dk lamp shade', .12, .12, (-.45, .15, 1.1), M['Lamp glow'], verts=8))
    return piece('desk', p)


def build_globe():
    p = [cyl('gl foot', .2, .04, (0, 0, .02), M['Wood dark'], verts=10, bev=.01, seg=1),
         cyl('gl post', .03, .55, (0, 0, .3), M['Wood dark'], verts=6, bev=0),
         sphere('gl ball', .22, (0, 0, .8), M['Ocean'], segs=16, rings=10)]
    for i, (a, b, r) in enumerate(((20, 30, .09), (150, -10, .11), (260, 40, .07))):
        x = math.cos(RAD(a)) * math.cos(RAD(b)) * .2
        y = math.sin(RAD(a)) * math.cos(RAD(b)) * .2
        z = .8 + math.sin(RAD(b)) * .2
        p.append(sphere(f'gl land {i}', r, (x, y, z), M['Paint green'], segs=8, rings=5, scale=(1, 1, .6)))
    ring = torus('gl ring', .26, .015, (0, 0, .8), M['Gold'], 20, 4, rot=(RAD(90), RAD(20), 0))
    p.append(ring)
    return piece('globe', p)


def build_workbench():
    p = [box('wb top', (1.6, .7, .08), (0, 0, .86), M['Wood light'], bev=.02, seg=1),
         box('wb shelf', (1.5, .6, .05), (0, 0, .25), M['Wood'], bev=.01, seg=1),
         box('wb board', (1.6, .05, .35), (0, .33, 1.06), M['Wood'], bev=.01, seg=1)]
    p += legs('wb', 1.6, .7, .82, r=.045, inset=.08, material='Wood dark')
    p.append(box('wb hammer head', (.18, .06, .06), (-.4, -.05, .93), M['Steel'], bev=.01, seg=1))
    p.append(box('wb hammer grip', (.05, .28, .04), (-.4, .06, .92), M['Wood dark'], bev=.01, seg=1))
    for i, (x, c) in enumerate(((.2, 'Paint pink'), (.36, 'Paint sun'), (.5, 'Paint green'))):
        p.append(cyl(f'wb paint {i}', .06, .12, (x, -.1, .96), M[c], verts=8, bev=0))
    p.append(box('wb box', (.4, .35, .2), (0, .05, .35), M['Pot'], bev=.02, seg=1))
    return piece('workbench', p)


def build_easel():
    from style import beam
    p = [beam('es leg a', (-.35, -.2, 0), (-.05, 0, 1.6), .05, M['Wood']),
         beam('es leg b', (.35, -.2, 0), (.05, 0, 1.6), .05, M['Wood']),
         beam('es leg c', (0, .35, 0), (0, .02, 1.5), .05, M['Wood']),
         box('es ledge', (.7, .1, .04), (0, -.13, .7), M['Wood dark'], bev=.01, seg=1),
         box('es canvas', (.62, .04, .5), (0, -.12, .98), M['Canvas'], bev=.01, seg=1, rot=(RAD(-8), 0, 0)),
         sphere('es blot a', .09, (-.12, -.15, 1.0), M['Paint pink'], segs=8, rings=5, scale=(1, .2, 1)),
         sphere('es blot b', .07, (.12, -.15, 1.08), M['Paint sun'], segs=8, rings=5, scale=(1, .2, 1)),
         sphere('es blot c', .1, (.05, -.15, .86), M['Paint green'], segs=8, rings=5, scale=(1.5, .2, .6))]
    return piece('easel', p)


def build_yarn_basket():
    p = [lathe('yb basket', [(.0, 0), (.26, 0), (.32, .3), (.29, .3), (.24, .03), (.0, .03)], (0, 0, 0), M['Wood light'], segments=14)]
    for i, (x, y, c) in enumerate(((-.09, .02, 'Rose fabric'), (.1, .05, 'Sky paint'), (0, -.1, 'Sun fabric'), (.02, .1, 'Lilac fabric'))):
        p.append(ico(f'yb yarn {i}', .12, (x, y, .3), M[c], subdiv=1))
    p.append(cyl('yb needle', .01, .4, (.05, 0, .45), M['Wood dark'], verts=4, bev=0, rot=(RAD(30), RAD(20), 0)))
    return piece('yarn_basket', p)


# ------------------------------------------------------------------ doors
def build_door_frame():
    p = [box('df post L', (.14, .28, 2.35), (-.86, 0, 1.175), M['Wood dark'], bev=.02, seg=1),
         box('df post R', (.14, .28, 2.35), (.86, 0, 1.175), M['Wood dark'], bev=.02, seg=1),
         box('df lintel', (1.9, .28, .16), (0, 0, 2.38), M['Wood dark'], bev=.02, seg=1),
         sphere('df lamp', .08, (0, -.17, 2.3), M['Lamp glow'], segs=8, rings=5)]
    return piece('door_frame', p)


def build_door():
    # Hinge on the left edge (x = 0), the panel opens around Z.
    w, h = 1.06, 1.95
    p = [extrude_outline('dr panel', arch(w, h, 8, x0=w / 2), .08, (0, 0, 0), M['Terracotta'], bev=.02)]
    for x in (w / 2 - .18, w / 2 + .18):
        p.append(box(f'dr groove {x:.2f}', (.04, .02, 1.2), (x, -.045, .95), M['Wood dark'], bev=0))
    p.append(cyl('dr window', .14, .03, (w / 2, -.04, 1.45), M['Window light'], verts=10, bev=0, rot=(RAD(90), 0, 0)))
    p.append(torus('dr rim', .15, .03, (w / 2, -.05, 1.45), M['Gold'], 12, 4, rot=(RAD(90), 0, 0)))
    p.append(sphere('dr knob', .06, (w - .14, -.08, .95), M['Gold'], segs=8, rings=5))
    return piece('door', p)


def build_doorway():
    return piece('doorway', [extrude_outline('dw dark', arch(1.0, 1.92, 8), .02, (0, 0, 0), M['Doorway dark'], bev=0)])


def build_welcome_mat():
    p = [box('wm mat', (1.2, .7, .02), (0, 0, .01), M['Sun fabric'], bev=0),
         box('wm stripe', (1.0, .12, .024), (0, 0, .012), M['Rug red'], bev=0)]
    return piece('welcome_mat', p)


# ------------------------------------------------------------------ house activities (src/house-activities.ts)
def build_trophy():
    """A small gold cup on a wooden plinth: one per boss beaten, on the living-room trophy shelf."""
    p = [box('tr plinth', (.2, .2, .07), (0, 0, .035), M['Wood dark'], bev=.01, seg=1),
         cyl('tr stem', .025, .08, (0, 0, .11), M['Gold'], verts=8, bev=0),
         lathe('tr cup', [(.0, .15), (.05, .15), (.1, .22), (.11, .3), (.0, .3)], (0, 0, 0), M['Gold'], segments=12, cap_top=False),
         torus('tr handle l', .045, .012, (-.11, 0, .24), M['Gold'], 10, 4, rot=(RAD(90), 0, 0)),
         torus('tr handle r', .045, .012, (.11, 0, .24), M['Gold'], 10, 4, rot=(RAD(90), 0, 0))]
    return piece('trophy', p)


def build_trophy_shelf():
    """A wall shelf for trophies (hangs at 1.35 m), with brackets."""
    p = [box('ts board', (1.5, .3, .05), (0, 0, 1.35), M['Wood'], bev=.015, seg=1),
         box('ts lip', (1.5, .03, .06), (0, -.15, 1.38), M['Wood dark'], bev=0)]
    for i, x in enumerate((-.6, .6)):
        p.append(box(f'ts bracket {i}', (.05, .26, .2), (x, .02, 1.23), M['Wood dark'], bev=.01, seg=1))
    return piece('trophy_shelf', p)


def build_photo():
    """A little framed photo for each rescued friend (the canvas is tinted per friend in the game)."""
    p = [box('ph frame', (.42, .04, .36), (0, 0, 1.7), M['Wood light'], bev=.015, seg=1),
         box('ph canvas', (.32, .02, .26), (0, -.022, 1.7), M['Canvas'], bev=0),
         sphere('ph face', .06, (0, -.03, 1.68), M['Paint sun'], segs=8, rings=5, scale=(1, .3, 1))]
    return piece('photo', p)


def build_painting():
    """A painting from the easel, hung in the craft room (the canvas is tinted per painting in the game)."""
    p = [box('pa frame', (.62, .05, .5), (0, 0, 1.65), M['Gold'], bev=.015, seg=1),
         box('pa canvas', (.52, .02, .4), (0, -.025, 1.65), M['Canvas'], bev=0),
         box('pa hill', (.52, .025, .12), (0, -.03, 1.51), M['Paint green'], bev=0),
         cyl('pa sun', .06, .02, (.14, -.035, 1.75), M['Paint pink'], verts=10, bev=0, rot=(RAD(90), 0, 0))]
    return piece('painting', p)


def build_kettle():
    """A round kettle for the tea buff (sits on the kitchen counter)."""
    p = [lathe('ke body', [(.0, 0), (.12, 0), (.15, .08), (.13, .17), (.05, .2), (.0, .2)], (0, 0, 0), M['Sky paint'], segments=12),
         cone('ke spout', .035, .14, (0, -.16, .11), M['Sky paint'], verts=6, rot=(RAD(-60), 0, 0)),
         torus('ke handle', .08, .015, (0, 0, .24), M['Charcoal'], 12, 4, rot=(0, RAD(90), 0)),
         sphere('ke knob', .025, (0, 0, .22), M['Charcoal'], segs=6, rings=4)]
    return piece('kettle', p)


def build_radio():
    """A cosy wooden radio that plays a music box tune."""
    p = [box('ra body', (.5, .26, .34), (0, 0, .17), M['Wood'], bev=.05, seg=2),
         box('ra grille', (.24, .02, .2), (-.08, -.13, .17), M['Cream fabric'], bev=0),
         cyl('ra dial', .055, .03, (.14, -.135, .2), M['Gold'], verts=12, bev=0, rot=(RAD(90), 0, 0)),
         cyl('ra knob', .025, .03, (.14, -.135, .08), M['Charcoal'], verts=8, bev=0, rot=(RAD(90), 0, 0)),
         cyl('ra aerial', .008, .3, (.18, .06, .46), M['Steel'], verts=4, bev=0, rot=(0, RAD(-20), 0))]
    return piece('radio', p)


def build_books():
    """A diary on a stack of books, for the study desk."""
    p = []
    for i, (m, w, rot) in enumerate((('Book red', .3, 0), ('Book blue', .27, 8), ('Book green', .28, -6))):
        p.append(box(f'bk book {i}', (w, .2, .05), (0, 0, .025 + i * .052), M[m], bev=.008, seg=1, rot=(0, 0, RAD(rot))))
    p.append(box('bk diary', (.24, .18, .04), (0, 0, .176), M['Book purple'], bev=.008, seg=1, rot=(0, 0, RAD(12))))
    p.append(box('bk ribbon', (.02, .01, .1), (.03, -.1, .14), M['Gold'], bev=0))
    return piece('books', p)


CONTRACT.update({
    'trophy': (0.4, 0.25, 0.35, 360), 'trophy_shelf': (1.55, 0.35, 1.45, 200), 'photo': (0.45, 0.1, 1.9, 150),
    'painting': (0.65, 0.1, 1.95, 150), 'kettle': (0.35, 0.5, 0.36, 400), 'radio': (0.55, 0.3, 0.65, 300), 'books': (0.35, 0.3, 0.25, 200),
})


BUILDERS = dict(
    sofa=lambda: build_sofa(), armchair=lambda: build_sofa('armchair', 1.0, 'Sun fabric', 'Teal fabric'),
    coffee_table=build_coffee_table, fireplace=build_fireplace, rug_round=build_rug_round,
    rug_rect=lambda: build_rug_rect(), bookshelf=build_bookshelf, floor_lamp=build_floor_lamp,
    plant_big=build_plant_big, plant_small=build_plant_small, dining_table=build_dining_table, chair=build_chair,
    window=build_window, picture=build_picture, bed=build_bed, nightstand=build_nightstand, lamp_small=build_lamp_small,
    wardrobe=build_wardrobe, mirror=build_mirror, counter=build_counter, stove=build_stove, fridge=build_fridge,
    bathtub=build_bathtub, sink=build_sink, towel_rack=build_towel_rack, desk=build_desk, globe=build_globe,
    workbench=build_workbench, easel=build_easel, yarn_basket=build_yarn_basket, door_frame=build_door_frame,
    door=build_door, doorway=build_doorway, duck=build_duck, stool=build_stool, round_table=build_round_table,
    welcome_mat=build_welcome_mat, trophy=build_trophy, trophy_shelf=build_trophy_shelf, photo=build_photo,
    painting=build_painting, kettle=build_kettle, radio=build_radio, books=build_books,
)


def stats_of(obj):
    me = obj.data
    co = [v.co for v in me.vertices]
    lo = [min(c[i] for c in co) for i in range(3)]
    hi = [max(c[i] for c in co) for i in range(3)]
    return dict(triangles=triangles(obj), materials=[x.name for x in me.materials], min=[round(v, 3) for v in lo], max=[round(v, 3) for v in hi])


def preview(objs, path):
    studio('#E9C9A0', (1400, 1000))
    cols = 7
    for i, o in enumerate(objs.values()):
        o.location = ((i % cols) * 2.6 - 7.8, (i // cols) * 2.6 - 5, 0)
    cam_data = bpy.data.cameras.new('Preview')
    cam_data.type = 'ORTHO'
    cam_data.ortho_scale = 21
    cam = bpy.data.objects.new('Preview', cam_data)
    bpy.context.scene.collection.objects.link(cam)
    cam.location = (0, -22, 20)
    cam.rotation_euler = (RAD(50), 0, 0)
    bpy.context.scene.camera = cam
    render(path)


def main():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    reset_scene()
    objs = {}
    for name, build in BUILDERS.items():
        objs[name] = build()
    failures, stats = [], {}
    for n, o in objs.items():
        s = stats[n] = stats_of(o)
        w, d, h, budget = CONTRACT[n]
        print(f"  {n:13s} {s['triangles']:5d} tris  min {s['min']}  max {s['max']}")
        if s['triangles'] > budget: failures.append(f"{n}: {s['triangles']} tris > {budget}")
        if n != 'door' and (max(-s['min'][0], s['max'][0]) > w / 2 + .01 or max(-s['min'][1], s['max'][1]) > d / 2 + .01):
            failures.append(f'{n}: outside its {w} x {d} footprint')
        if s['max'][2] > h + .01 or s['min'][2] < -.01: failures.append(f"{n}: height {s['min'][2]}..{s['max'][2]} outside 0..{h}")
    path = os.path.join(MODELS, GLB_NAME)
    size = export_glb(list(objs.values()), path)
    total = sum(s['triangles'] for s in stats.values())
    print(f'  {GLB_NAME} {size} bytes, {total} triangles')
    if size > GLB_LIMIT: failures.append(f'{GLB_NAME} is {size} bytes')
    os.makedirs(GEN, exist_ok=True)
    with open(MANIFEST, 'w', encoding='utf-8', newline='\n') as fh:
        json.dump(dict(generator='art/blender/kit/build_house.py', file=GLB_NAME, bytes=size, triangles=total, nodes=stats), fh, indent=2)
        fh.write('\n')
    if '--render' in argv:
        preview(objs, os.path.join(PREVIEWS, 'house.webp'))
    if failures:
        print('\nHouse contract failures:\n  ' + '\n  '.join(failures)); sys.stdout.flush(); os._exit(1)
    if '--install' in argv:
        shutil.copyfile(path, os.path.join(PUBLIC_MODELS, GLB_NAME)); print('installed', GLB_NAME)
    print('\nHouse kit OK'); sys.stdout.flush()


if __name__ == '__main__':
    try:
        main()
    except Exception:
        import traceback
        traceback.print_exc(); sys.stdout.flush(); os._exit(1)
