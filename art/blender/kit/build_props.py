"""Zoo Garden village props: a vivid, chunky, glossy toy kit.

Run from the repository root:

    blender -b --factory-startup --python art/blender/kit/build_props.py -- [--only a,b] [--install] [--render]

Writes one joined mesh per prop to art/generated/kit/models/<file>.glb plus
art/generated/kit/props-manifest.json. --install copies the GLBs to
public/assets/models/, --render writes previews to art/previews/kit/.

Blender is Z up with the front of every prop facing -Y (the game camera looks
from -Y and above). The origin is the ground centre, base at z = 0. Limits come
from CONTRACT.md; the build fails if any prop breaks them. All designs are
original. Randomness is seeded, so the output is deterministic.
"""
import argparse
import json
import math
import os
import random
import re
import shutil
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import bpy  # noqa: E402
import bmesh  # noqa: E402
from mathutils import Vector  # noqa: E402
from style import (reset_scene, mat, box, cyl, cone, sphere, ico, torus, blob,  # noqa: E402
                   extrude_outline, beam, bevel, smooth, join, triangles, export_glb,
                   studio, game_camera, render)

ROOT = os.path.abspath(os.path.join(HERE, '..', '..', '..'))
OUT_DIR = os.path.join(ROOT, 'art', 'generated', 'kit')
MODEL_DIR = os.path.join(OUT_DIR, 'models')
MANIFEST = os.path.join(OUT_DIR, 'props-manifest.json')
PREVIEW_DIR = os.path.join(ROOT, 'art', 'previews', 'kit')
INSTALL_DIR = os.path.join(ROOT, 'public', 'assets', 'models')
TOTAL_BYTES_LIMIT = 1_600_000
TAU = math.tau


def rad(deg):
    return math.radians(deg)


# ------------------------------------------------------------------ materials
# One shared library so the same name always means the same colour across the
# kit. (colour, roughness[, emission colour, emission strength]). No metallic
# values: the game has no environment map, so metals would render dark.
MATERIALS = {
    # Wood, straw and plaster
    'Wood': ('#D8782C', 0.55),
    'Wood light': ('#F4A646', 0.5),
    'Wood dark': ('#96501F', 0.6),
    'Terracotta': ('#E8553A', 0.5),
    'Chest wood': ('#C45E24', 0.5),
    'Chest wood light': ('#E07A30', 0.45),
    'Straw': ('#FFBE24', 0.55),
    'Straw light': ('#FFDD55', 0.5),
    'Straw dark': ('#EE8414', 0.6),
    'Plaster': ('#FFF0CE', 0.65),
    # Stone and metal
    'Stone': ('#BAC3D6', 0.6),
    'Stone light': ('#E3E9F4', 0.55),
    'Stone dark': ('#8B96AE', 0.65),
    'Gold': ('#FFC21A', 0.32),
    'Steel': ('#DCE4F0', 0.28),
    'Iron': ('#4A5068', 0.42),
    'Charcoal': ('#30343F', 0.55),
    # Cloth and paint
    'Awning red': ('#F2333D', 0.5),
    'Awning white': ('#FFF8EC', 0.5),
    'Awning teal': ('#0FB5CF', 0.5),
    'Awning orange': ('#FF7A1C', 0.5),
    'Awning yellow': ('#FFCB2B', 0.5),
    'Red': ('#EE3440', 0.45),
    'Violet': ('#8E4DFF', 0.45),
    'Navy': ('#2F55C8', 0.45),
    'White': ('#FFFBF2', 0.4),
    'Sun': ('#FFD21F', 0.4),
    # Glass, water and plants
    'Glass': ('#5FD2FF', 0.12),
    'Water': ('#27A9F5', 0.08),
    'Leaf': ('#46BE36', 0.55),
    'Flower pink': ('#FF5AA5', 0.45),
    # Produce
    'Red fruit': ('#F22D35', 0.3),
    'Cabbage': ('#8FE04A', 0.5),
    'Pumpkin': ('#FF8A10', 0.45),
    # Soil
    'Soil': ('#5A2C18', 0.8),
    'Soil ridge': ('#86461F', 0.75),
    # Magic and fire (emissive)
    'Crystal': ('#35E0FF', 0.15, '#2FD8FF', 0.9),
    'Crystal light': ('#B8F6FF', 0.12, '#8AEFFF', 1.0),
    'Crystal violet': ('#A865FF', 0.18, '#9A55FF', 0.8),
    'Crystal pink': ('#FF63C8', 0.18, '#FF55C0', 0.8),
    'Ember': ('#FF7418', 0.5, '#FF5A0A', 1.6),
    'Flame': ('#FFC530', 0.5, '#FFB21A', 1.6),
    'Soup': ('#FF5A1E', 0.25, '#FF4A12', 0.45),
    'Pad light': ('#6FE4FF', 0.2, '#48D8FF', 1.4),
    # Rocket and pad
    'Rocket white': ('#FFFFFF', 0.3),
    'Rocket red': ('#F2323C', 0.35),
    'Pad': ('#A7B1C6', 0.6),
    'Pad dark': ('#383D4C', 0.55),
    'Hazard': ('#FFC619', 0.45),
}


def M(name):
    spec = MATERIALS[name]
    emit, strength = (spec[2], spec[3]) if len(spec) > 2 else (None, 0.0)
    return mat(name, spec[0], spec[1], 0.0, emit, strength)


# ------------------------------------------------------------ mesh helpers
def new_obj(name, bm, materials):
    data = bpy.data.meshes.new(name)
    bm.to_mesh(data)
    bm.free()
    obj = bpy.data.objects.new(name, data)
    for m in materials if isinstance(materials, (list, tuple)) else [materials]:
        if m is not None:
            data.materials.append(m)
    bpy.context.scene.collection.objects.link(obj)
    return obj


def revolve(name, profile, materials, bands=None, segs=40, loc=(0, 0, 0), rot=(0, 0, 0),
            waves=0, amp=0.0, phase=0.0, smooth_angle=50, cap_top=False, cap_bottom=False,
            scale=None):
    """Revolve [(r, z[, wave_weight]), ...] around Z.

    Trace the profile from the bottom-inside, around the outside, to the top so
    every face points outward. `bands[j]` picks the material of the band between
    profile points j and j+1. `waves` scallops the radius (toy pie-crust edges).
    """
    materials = materials if isinstance(materials, (list, tuple)) else [materials]
    bm = bmesh.new()
    rings = []
    for p in profile:
        r, z = p[0], p[1]
        w = p[2] if len(p) > 2 else 1.0
        if r <= 1e-6:
            rings.append([bm.verts.new((0, 0, z))])
            continue
        ring = []
        for i in range(segs):
            a = i * TAU / segs
            rr = r * (1 + amp * w * math.cos(waves * a + phase)) if waves else r
            ring.append(bm.verts.new((rr * math.cos(a), rr * math.sin(a), z)))
        rings.append(ring)
    for j, (lo, hi) in enumerate(zip(rings, rings[1:])):
        idx = bands[j] if bands else 0
        faces = []
        if len(lo) == 1 and len(hi) == 1:
            continue
        if len(lo) == 1:
            for i in range(segs):
                faces.append(bm.faces.new((lo[0], hi[i], hi[(i + 1) % segs])))
        elif len(hi) == 1:
            for i in range(segs):
                faces.append(bm.faces.new((lo[i], lo[(i + 1) % segs], hi[0])))
        else:
            for i in range(segs):
                faces.append(bm.faces.new((lo[i], lo[(i + 1) % segs], hi[(i + 1) % segs], hi[i])))
        for f in faces:
            f.material_index = idx
    if cap_bottom and len(rings[0]) > 1:
        f = bm.faces.new(list(reversed(rings[0])))
        f.material_index = bands[0] if bands else 0
    if cap_top and len(rings[-1]) > 1:
        f = bm.faces.new(rings[-1])
        f.material_index = bands[-1] if bands else 0
    obj = new_obj(name, bm, materials)
    obj.location = loc
    obj.rotation_euler = rot
    if scale is not None:
        obj.scale = scale
    return smooth(obj, smooth_angle)


def sector(name, r0, r1, a0, a1, z0, z1, material, n=3, bev=0.04, seg=2, taper=0.0):
    """An annular block between angles a0..a1 (radians): stones, pad tiles, planks."""
    bm = bmesh.new()
    cols = []
    for i in range(n + 1):
        a = a0 + (a1 - a0) * i / n
        c, s = math.cos(a), math.sin(a)
        cols.append([bm.verts.new((r0 * c, r0 * s, z0)), bm.verts.new((r1 * c, r1 * s, z0)),
                     bm.verts.new(((r1 - taper) * c, (r1 - taper) * s, z1)),
                     bm.verts.new(((r0 + taper) * c, (r0 + taper) * s, z1))])
    for i in range(n):
        p, q = cols[i], cols[i + 1]
        for k in range(4):
            bm.faces.new((p[k], q[k], q[(k + 1) % 4], p[(k + 1) % 4]))
    bm.faces.new(cols[0])
    bm.faces.new(list(reversed(cols[-1])))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    obj = new_obj(name, bm, material)
    return smooth(bevel(obj, bev, seg), 40)


def slab(name, outline, depth, loc=(0, 0, 0), material=None, rot=(0, 0, 0), bev=0.03, seg=1):
    """extrude_outline with a choice of bevel segments (1 keeps small parts cheap)."""
    bm = bmesh.new()
    front = [bm.verts.new((x, -depth / 2, z)) for x, z in outline]
    back = [bm.verts.new((x, depth / 2, z)) for x, z in outline]
    bm.faces.new(front)
    bm.faces.new(list(reversed(back)))
    n = len(outline)
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((front[i], back[i], back[j], front[j]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    obj = new_obj(name, bm, material)
    obj.location = loc
    obj.rotation_euler = rot
    return smooth(bevel(obj, bev, seg), 40)


def mound(name, length, width, height, loc, material, segs=12, rings=3):
    """A capsule-shaped soft mound along X (soil ridges): round ends, straight middle."""
    bm = bmesh.new()
    stretch = max(0.0, length / 2 - width / 2)
    rows = []
    for j in range(rings + 1):
        t = j / rings
        rf = math.cos(t * math.pi / 2) * 0.82 + 0.18 if j else 1.0
        zf = math.sin(t * math.pi / 2)
        row = []
        for i in range(segs):
            a = (i + 0.5) * TAU / segs
            x = rf * width / 2 * math.cos(a)
            x += math.copysign(stretch, x)
            row.append(bm.verts.new((x, rf * width / 2 * math.sin(a), zf * height)))
        rows.append(row)
    for lo, hi in zip(rows, rows[1:]):
        for i in range(segs):
            bm.faces.new((lo[i], lo[(i + 1) % segs], hi[(i + 1) % segs], hi[i]))
    bm.faces.new(rows[-1])
    obj = new_obj(name, bm, material)
    obj.location = loc
    return smooth(obj, 80)


def arc(cx, cz, r, a0, a1, n):
    return [(cx + r * math.cos(a0 + (a1 - a0) * i / n), cz + r * math.sin(a0 + (a1 - a0) * i / n))
            for i in range(n + 1)]


def arch_outline(w, h, n=8):
    """Door/window arch in (x, z): flat bottom at z = 0, semicircular top."""
    r = w / 2
    return [(-r, 0.0), (r, 0.0)] + arc(0, h - r, r, 0, math.pi, n)


def tongue_outline(w, h, n=6):
    """Awning scallop hanging below z = 0."""
    r = w / 2
    return [(r, 0.0), (-r, 0.0)] + arc(0, -h + r, r, math.pi, TAU, n)


def rounded_rect(w, h, r, n=3, z0=0.0):
    pts = []
    for cx, cz, a in ((w / 2 - r, z0 + h - r, 0), (-w / 2 + r, z0 + h - r, 90),
                      (-w / 2 + r, z0 + r, 180), (w / 2 - r, z0 + r, 270)):
        pts += arc(cx, cz, r, rad(a), rad(a + 90), n)
    return pts


def star_outline(r_out, r_in, points=5):
    pts = []
    for i in range(points * 2):
        a = math.pi / 2 + i * math.pi / points
        r = r_out if i % 2 == 0 else r_in
        pts.append((r * math.cos(a), r * math.sin(a)))
    return pts


def bolt_outline(s=1.0):
    pts = [(0.10, 0.50), (-0.24, -0.02), (-0.02, -0.02), (-0.12, -0.50),
           (0.26, 0.06), (0.04, 0.06), (0.16, 0.50)]
    return [(x * s, z * s) for x, z in pts]


def polar(r, deg, z=0.0):
    return (r * math.cos(rad(deg)), r * math.sin(rad(deg)), z)


def facing(deg):
    """Z rotation that turns a -Y facing part to face outward at azimuth `deg`."""
    return rad(deg + 90)


# ------------------------------------------------------------- props
def canvas(prefix, x0, x1, count, profile, colours, thick=0.07, sub=2, ripple=0.02, tongue=0.18, tongue_n=4):
    """A striped cloth awning: one continuous sheet (profile [(y, z), ...] front to back) with
    soft ripples per stripe and a scalloped valance hanging from the front edge."""
    mats = [M(c) for c in colours]
    bm = bmesh.new()
    cols = count * sub
    grid = []
    for k in range(cols + 1):
        x = x0 + (x1 - x0) * k / cols
        lift = ripple * math.sin(math.pi * (k % sub) / sub)
        grid.append([bm.verts.new((x, y, z + lift)) for y, z in profile])
    for k in range(cols):
        for j in range(len(profile) - 1):
            f = bm.faces.new((grid[k][j], grid[k + 1][j], grid[k + 1][j + 1], grid[k][j + 1]))
            f.material_index = (k // sub) % len(mats)
    sheet = new_obj(f'{prefix} sheet', bm, mats)
    sol = sheet.modifiers.new('Solidify', 'SOLIDIFY')
    sol.thickness = thick
    sol.offset = -1.0
    bevel(sheet, 0.03, 2, 35)
    for p in sheet.data.polygons:
        p.use_smooth = True
    if tongue:
        width = (x1 - x0) / count
        y0, z0 = profile[0]
        for i in range(count):
            slab(f'{prefix} scallop {i}', tongue_outline(width * 0.97, tongue, tongue_n), thick * 0.7,
                 loc=(x0 + (i + 0.5) * width, y0 + thick * 0.4, z0 - thick * 0.35),
                 material=mats[i % len(mats)], bev=0.022, seg=1)
    return sheet


def crate(name, loc, size=(0.5, 0.4, 0.2), material='Wood light', seg=1):
    x, y, z = loc
    box(name, size, (x, y, z + size[2] / 2), M(material), bev=0.035, seg=seg)
    return z + size[2]


def produce(kind, centre, rng, count, spread=(0.18, 0.12), rake=0.35):
    """A heap of chunky produce; items further back sit higher so the heap faces the camera."""
    cx, cy, cz = centre
    for i in range(count):
        ox = (i + 0.5) / count * 2 * spread[0] - spread[0] + rng.uniform(-0.02, 0.02)
        oy = (rng.random() - 0.5) * 2 * spread[1]
        lift = (oy + spread[1]) * rake
        if kind in ('tomato', 'apple', 'lemon'):
            r = {'tomato': 0.095, 'apple': 0.088, 'lemon': 0.082}[kind] + rng.random() * 0.012
            sphere(f'{kind} {i}', r, (cx + ox, cy + oy, cz + r * 0.75 + lift),
                   M('Sun' if kind == 'lemon' else 'Red fruit'), segs=8, rings=5,
                   scale=(1.3, 1, 0.9) if kind == 'lemon' else (1, 1, 0.88), rot=(0, 0, rng.uniform(-0.5, 0.5)))
            if kind == 'apple':
                cyl(f'Apple stem {i}', 0.014, 0.07, (cx + ox, cy + oy, cz + r * 1.55 + lift), M('Wood dark'),
                    verts=4, bev=0.0)
            if kind == 'tomato':
                ico(f'Tomato cap {i}', 0.035, (cx + ox, cy + oy, cz + r * 1.5 + lift), M('Leaf'), 1,
                    scale=(1.3, 1.3, 0.5))
        elif kind == 'cabbage':
            r = 0.16 + rng.random() * 0.02
            blob(f'Cabbage {i}', r, (cx + ox, cy + oy, cz + r * 0.6 + lift), M('Cabbage'), (1, 1, 0.85), 2,
                 0.1, seed=rng.randint(0, 999))
        elif kind == 'carrot':
            a = rad(108 + rng.uniform(-6, 6))
            axis = Vector((0, -math.sin(a), math.cos(a)))
            base = Vector((cx + ox, cy + oy, cz + 0.08 + lift))
            cone(f'Carrot {i}', 0.07, 0.34, base, M('Pumpkin'), verts=8, rot=(a, 0, rng.uniform(-0.25, 0.25)))
            ico(f'Carrot top {i}', 0.07, base - axis * 0.2 + Vector((0, 0, 0.04)), M('Leaf'), 1,
                scale=(0.9, 0.9, 1.4))


def pumpkin(name, loc, r=0.22):
    x, y, z = loc
    prof = [(0.0, 0.0), (r * 0.55, 0.01, 1), (r * 0.95, r * 0.35, 1), (r, r * 0.75, 1),
            (r * 0.72, r * 1.12, 1), (r * 0.2, r * 1.2, 0.5), (0.0, r * 1.16)]
    revolve(name, prof, M('Pumpkin'), segs=12, loc=(x, y, z), waves=6, amp=0.08, smooth_angle=70)
    cyl(name + ' stem', 0.035, 0.12, (x, y, z + r * 1.24), M('Leaf'), verts=5, bev=0.0)


def build_cottage():
    WALL_R = 2.32
    # Stone plinth: a course of chunky stones in alternating tones.
    count = 14
    for i in range(count):
        a0 = TAU * i / count + rad(1.3)
        a1 = TAU * (i + 1) / count - rad(1.3)
        sector(f'Plinth stone {i}', 2.1, 2.6, a0, a1, 0.0, 0.36 + 0.03 * (i % 2),
               M('Stone light' if i % 2 else 'Stone'), n=2, bev=0.07, seg=1, taper=0.06)
    # Round plaster wall with a timber sill band and posts.
    revolve('Wall', [(WALL_R, 0.3), (WALL_R, 3.4)], M('Plaster'), segs=36)
    revolve('Sill band', [(WALL_R - 0.02, 0.34), (WALL_R + 0.07, 0.35), (WALL_R + 0.09, 0.46),
                          (WALL_R + 0.07, 0.56), (WALL_R - 0.02, 0.57)], M('Wood dark'), segs=36)
    for k, deg in enumerate((-90 + 27, -90 - 27, -90 + 70, -90 - 70, 25, 155, 90 - 30, 90 + 30)):
        x, y, _ = polar(WALL_R + 0.03, deg)
        box(f'Timber post {k}', (0.22, 0.12, 2.6), (x, y, 1.82), M('Wood'), bev=0.045, seg=1,
            rot=(0, 0, facing(deg)))
    # Front door facing -Y.
    y_door = -WALL_R - 0.02
    extrude_outline('Door frame', arch_outline(1.32, 2.1, 8), 0.12, (0, y_door + 0.03, 0.34), M('Wood dark'),
                    bev=0.035)
    extrude_outline('Door', arch_outline(1.06, 1.95, 8), 0.14, (0, y_door - 0.03, 0.36), M('Terracotta'),
                    bev=0.035)
    for x in (-0.18, 0.18):
        box(f'Door groove {x}', (0.04, 0.03, 1.3), (x, y_door - 0.1, 1.0), M('Wood dark'), bev=0.012, seg=1)
    torus('Door window rim', 0.17, 0.04, (0, y_door - 0.11, 1.78), M('Gold'), 12, 5, rot=(rad(90), 0, 0))
    cyl('Door window', 0.16, 0.04, (0, y_door - 0.1, 1.78), M('Glass'), verts=12, bev=0.0, rot=(rad(90), 0, 0))
    sphere('Door knob', 0.08, (0.33, y_door - 0.14, 1.12), M('Gold'), segs=10, rings=6)
    # Two arched windows with flower boxes, front-left and front-right.
    for side, deg in (('L', -90 - 47), ('R', -90 + 47)):
        ang = facing(deg)
        out = Vector((math.cos(rad(deg)), math.sin(rad(deg)), 0))
        along = Vector((math.cos(ang), math.sin(ang), 0))
        px, py, _ = polar(WALL_R + 0.02, deg)
        extrude_outline(f'Window frame {side}', arch_outline(0.98, 1.22, 7), 0.12, (px, py, 1.12),
                        M('Wood dark'), rot=(0, 0, ang), bev=0.03)
        gx, gy, _ = polar(WALL_R + 0.08, deg)
        extrude_outline(f'Window glass {side}', arch_outline(0.74, 1.02, 7), 0.06, (gx, gy, 1.22),
                        M('Glass'), rot=(0, 0, ang), bev=0.015)
        mx, my, _ = polar(WALL_R + 0.12, deg)
        box(f'Window mullion {side}', (0.07, 0.05, 1.0), (mx, my, 1.72), M('Plaster'), bev=0.02, seg=1,
            rot=(0, 0, ang))
        box(f'Window transom {side}', (0.76, 0.05, 0.07), (mx, my, 1.64), M('Plaster'), bev=0.02, seg=1,
            rot=(0, 0, ang))
        bx, by, _ = polar(WALL_R + 0.15, deg)
        box(f'Flower box {side}', (0.96, 0.3, 0.24), (bx, by, 1.02), M('Terracotta'), bev=0.05, seg=2,
            rot=(0, 0, ang))
        rng = random.Random(7 if side == 'L' else 11)
        centre = Vector((bx, by, 0)) - out * 0.04
        for j in range(4):
            p = centre + along * (-0.3 + 0.2 * j)
            blob(f'Flower box leaves {side}{j}', 0.13, (p.x, p.y, 1.17), M('Leaf'), (1.1, 0.9, 0.8), 1, 0.1,
                 seed=rng.randint(0, 99))
            ico(f'Flower {side}{j}', 0.085, (p.x - out.x * 0.05, p.y - out.y * 0.05, 1.3 + rng.uniform(0, 0.04)),
                M('Flower pink' if j % 2 == 0 else 'Gold'), 1)
    # Porch deck and step toward -Y (front edge stays at y >= -3.4).
    for i in range(6):
        x = -1.0 + 0.4 * i
        box(f'Porch plank {i}', (0.37, 0.95, 0.12), (x, -2.62, 0.3), M('Wood light' if i % 2 else 'Wood'),
            bev=0.035, seg=2)
    box('Porch beam', (2.5, 0.14, 0.26), (0, -3.08, 0.13), M('Wood dark'), bev=0.04, seg=1)
    box('Porch step', (1.5, 0.3, 0.16), (0, -3.24, 0.08), M('Wood light'), bev=0.04, seg=2)
    for x in (-1.0, 1.0):
        cyl(f'Porch pot {x}', 0.19, 0.3, (x, -2.72, 0.51), M('Terracotta'), verts=10, bev=0.03, seg=1,
            radius_top=0.23)
        blob(f'Porch bush {x}', 0.24, (x, -2.72, 0.78), M('Leaf'), (1, 1, 0.85), 2, 0.1, seed=int(x * 10) + 30)
        for j, (dx, dy) in enumerate(((-0.1, -0.1), (0.12, -0.05), (0.0, 0.1))):
            ico(f'Porch flower {x}{j}', 0.075, (x + dx, -2.72 + dy - 0.06, 0.95), M('Flower pink'), 1)
    # Tiered golden straw roof: three plump tiers, each with a dark drop band, a light rolled
    # rim and soft ribs continuing the scalloped edge up the thatch.
    # Each tier: underside from `inner`, rim radius R with its lip starting at height z, lip height L,
    # then a convex cushion top rising by H toward radius r_in (steep near the rim, flat inward).
    tiers = [
        dict(inner=(WALL_R - 0.12, 3.35), rim=3.45, z=3.14, lip=0.42, r_in=2.0, H=0.56),
        dict(inner=(1.8, 4.05), rim=2.62, z=3.9, lip=0.4, r_in=1.25, H=0.5),
        dict(inner=(1.1, 4.72), rim=1.68, z=4.62, lip=0.36, r_in=0.0, H=0.62),
    ]
    for k, t in enumerate(tiers):
        R, z, L, H = t['rim'], t['z'], t['lip'], t['H']
        prof = [(t['inner'][0], t['inner'][1], 0.0), (R - 0.25, z + 0.02, 0.5), (R + 0.02, z + 0.06, 1.0),
                (R + 0.1, z + L * 0.42, 1.0), (R + 0.06, z + L * 0.78, 1.0), (R - 0.08, z + L, 1.0)]
        r0, z0 = R - 0.08, z + L
        for f in (0.14, 0.32, 0.55, 0.78, 1.0):
            r = r0 + (t['r_in'] - r0) * f
            prof.append((r, z0 + 0.04 + H * math.sin(f * math.pi / 2), 0.8 * r / R))
        bands = [0, 0, 0, 1, 1] + [2] * 5
        revolve(f'Roof tier {k}', prof, [M('Straw dark'), M('Straw light'), M('Straw')], bands,
                segs=48 if k < 2 else 36, waves=12, amp=0.028, phase=rad(15 * k), smooth_angle=65)
    # Leaf sprout finial.
    top = tiers[2]['z'] + tiers[2]['lip'] + 0.04 + tiers[2]['H']
    cyl('Finial stem', 0.07, 0.42, (0, 0, top + 0.16), M('Leaf'), verts=8, bev=0.0, radius_top=0.05)
    for s in (-1, 1):
        sphere(f'Finial leaf {s}', 0.34, (0.27 * s, -0.03, top + 0.46), M('Leaf'), segs=10, rings=6,
               scale=(1, 0.48, 0.2), rot=(0, rad(-30 * s), rad(-12 * s)))
    # Little terracotta chimney poking out of the lowest tier at the back right.
    cx, cy, _ = polar(3.0, 38)
    cyl('Chimney', 0.24, 1.1, (cx, cy, 3.85), M('Terracotta'), verts=10, bev=0.03, seg=1)
    cyl('Chimney cap', 0.31, 0.16, (cx, cy, 4.46), M('Wood dark'), verts=10, bev=0.045, seg=2)


def build_market_stall():
    rng = random.Random(21)
    # Counter with alternating vertical front planks.
    box('Counter core', (2.5, 0.9, 0.9), (0, -0.05, 0.45), M('Wood dark'), bev=0.05, seg=1)
    for i in range(7):
        x = -1.08 + i * 0.36
        box(f'Counter plank {i}', (0.33, 0.1, 0.8), (x, -0.52, 0.46), M('Wood light' if i % 2 else 'Wood'),
            bev=0.035, seg=1)
    box('Counter top', (2.72, 1.04, 0.12), (0, -0.07, 0.96), M('Wood light'), bev=0.045, seg=2)
    # Corner posts and a gently sloped, scalloped red-and-white awning.
    for x in (-1.3, 1.3):
        box(f'Front post {x}', (0.14, 0.14, 2.34), (x, -0.5, 1.17), M('Wood'), bev=0.04, seg=1)
        box(f'Back post {x}', (0.14, 0.14, 2.56), (x, 0.4, 1.28), M('Wood'), bev=0.04, seg=1)
    prof = [(-0.9, 2.28), (-0.45, 2.42), (0.05, 2.54), (0.5, 2.62), (0.86, 2.66)]
    canvas('Market awning', -1.57, 1.57, 8, prof, ('Awning red', 'Awning white'), thick=0.08, ripple=0.025,
           tongue=0.17)
    # Energy sign: a round navy badge with a yellow lightning bolt riding the awning front.
    lean = 40  # tilted back so the badge faces the 42-degree game camera squarely
    tilt = (rad(90 - lean), 0, 0)
    badge_c = Vector((0, -0.62, 2.54))
    cyl('Sign badge', 0.29, 0.08, badge_c, M('Navy'), verts=16, bev=0.03, seg=1, rot=tilt)
    torus('Sign rim', 0.29, 0.045, badge_c + Vector((0, -0.01, 0)), M('Sun'), 16, 5, rot=tilt)
    face = badge_c + Vector((0, -math.cos(rad(lean)) * 0.05, math.sin(rad(lean)) * 0.05))
    slab('Sign bolt', bolt_outline(0.44), 0.05, face, M('Sun'), rot=(rad(-lean), 0, 0), bev=0.014, seg=1)
    # Produce crates on the counter.
    kinds = (('carrot', 4), ('tomato', 5), ('cabbage', 2), ('lemon', 5))
    for i, (kind, n) in enumerate(kinds):
        x = -0.93 + i * 0.62
        top = crate(f'Crate {i}', (x, -0.22, 1.02), (0.56, 0.46, 0.14), 'Wood light' if i % 2 else 'Wood')
        produce(kind, (x, -0.22, top - 0.03), rng, n, (0.18, 0.11))
    # Pumpkins and an apple basket on the ground at the front corners.
    pumpkin('Pumpkin A', (1.36, -0.76, 0.0), 0.21)
    pumpkin('Pumpkin B', (1.03, -0.8, 0.0), 0.15)
    pumpkin('Pumpkin C', (1.25, -0.42, 0.0), 0.16)
    top = crate('Ground basket', (-1.2, -0.76, 0.0), (0.46, 0.34, 0.2), 'Wood')
    produce('apple', (-1.2, -0.76, top - 0.03), rng, 3, (0.12, 0.05), rake=0.2)


def sword(prefix, loc, rot_y, scale=1.0):
    """A chunky toy sword in the XZ plane (faces -Y); rot_y = pi points the blade down."""
    x, y, z = loc
    s = scale
    blade = [(-0.09 * s, 0.0), (0.09 * s, 0.0), (0.09 * s, 0.78 * s), (0.0, 0.94 * s), (-0.09 * s, 0.78 * s)]
    slab(f'{prefix} blade', blade, 0.06 * s, (x, y, z), M('Steel'), rot=(0, rot_y, 0), bev=0.02, seg=2)
    c, sn = math.cos(rot_y), math.sin(rot_y)

    def at(d):
        return (x + sn * d, y, z + c * d)
    box(f'{prefix} guard', (0.42 * s, 0.1 * s, 0.09 * s), at(-0.03 * s), M('Gold'), bev=0.03, seg=1,
        rot=(0, rot_y, 0))
    cyl(f'{prefix} grip', 0.045 * s, 0.24 * s, at(-0.18 * s), M('Red'), verts=6, bev=0.0, rot=(0, rot_y, 0))
    sphere(f'{prefix} pommel', 0.075 * s, at(-0.32 * s), M('Gold'), segs=8, rings=5)


def build_equipment_stall():
    # Counter on the left under a teal canopy; display board with sword and shield on the right.
    box('Counter core', (1.8, 0.86, 0.9), (-0.6, -0.02, 0.45), M('Wood dark'), bev=0.05, seg=1)
    for i in range(5):
        x = -1.32 + i * 0.36
        box(f'Counter plank {i}', (0.33, 0.1, 0.8), (x, -0.47, 0.46), M('Wood light' if i % 2 else 'Wood'),
            bev=0.035, seg=1)
    box('Counter top', (1.96, 1.0, 0.12), (-0.6, -0.04, 0.96), M('Wood light'), bev=0.045, seg=2)
    box('Counter trim', (1.9, 0.08, 0.1), (-0.6, -0.54, 0.86), M('Awning teal'), bev=0.03, seg=1)
    for x in (-1.49, 0.29):
        box(f'Front post {x}', (0.14, 0.14, 2.5), (x, -0.48, 1.25), M('Wood'), bev=0.04, seg=1)
        box(f'Back post {x}', (0.14, 0.14, 2.5), (x, 0.36, 1.25), M('Wood'), bev=0.04, seg=1)
    # Rounded barrel-vault canopy in teal and white.
    prof = [(-0.88, 2.3), (-0.62, 2.5), (-0.25, 2.62), (0.15, 2.62), (0.5, 2.5), (0.76, 2.3)]
    canvas('Outfitter canopy', -1.56, 0.36, 6, prof, ('Awning teal', 'Awning white'), thick=0.08, ripple=0.025,
           tongue=0.16)
    for x in (-1.51, 0.35):
        sphere(f'Canopy knob {x}', 0.09, (x, -0.07, 2.66), M('Gold'), segs=8, rings=5)
    # On the counter: a violet wizard hat, a knight helmet and a stack of folded clothes.
    hx, hy = -1.2, -0.22
    cyl('Hat stand', 0.035, 0.34, (hx, hy, 1.19), M('Wood dark'), verts=6, bev=0.0)
    cyl('Hat stand foot', 0.13, 0.05, (hx, hy, 1.04), M('Wood dark'), verts=10, bev=0.015, seg=1)
    cyl('Hat brim', 0.31, 0.05, (hx, hy, 1.37), M('Violet'), verts=16, bev=0.02, seg=1)
    torus('Hat band', 0.16, 0.042, (hx, hy, 1.43), M('Gold'), 12, 5)
    cone('Hat crown', 0.18, 0.58, (hx + 0.02, hy, 1.67), M('Violet'), verts=10, rot=(rad(-6), rad(12), 0))
    sphere('Hat star', 0.055, (hx + 0.05, hy - 0.05, 1.93), M('Sun'), segs=8, rings=5)
    revolve('Helmet', [(0.0, 0.0), (0.21, 0.0), (0.22, 0.1), (0.18, 0.22), (0.1, 0.29), (0.0, 0.31)], M('Steel'),
            segs=14, loc=(-0.58, -0.18, 1.02), smooth_angle=70)
    torus('Helmet brim', 0.21, 0.035, (-0.58, -0.18, 1.05), M('Gold'), 14, 5)
    box('Helmet visor', (0.2, 0.05, 0.05), (-0.58, -0.39, 1.14), M('Wood dark'), bev=0.02, seg=1)
    blob('Helmet plume', 0.1, (-0.58, -0.14, 1.4), M('Red'), (0.6, 1.3, 1.0), 1, 0.08, seed=4)
    for j, colour in enumerate(('Red', 'Awning teal', 'Sun')):
        box(f'Folded cloth {j}', (0.38 - 0.03 * j, 0.3, 0.09), (-0.02, -0.2, 1.07 + 0.095 * j), M(colour),
            bev=0.035, seg=1, rot=(0, 0, rad(5 * (j - 1))))
    # Display board with a toy sword and a round shield, facing the camera.
    extrude_outline('Display board', rounded_rect(0.98, 1.5, 0.14, 2), 0.1, (1.05, 0.25, 0.28), M('Wood'),
                    bev=0.03)
    for x in (0.66, 1.44):
        box(f'Display leg {x}', (0.12, 0.12, 1.75), (x, 0.3, 0.875), M('Wood dark'), bev=0.03, seg=1)
    box('Display cap', (1.06, 0.24, 0.1), (1.05, 0.25, 1.83), M('Awning teal'), bev=0.04, seg=2)
    sword('Sword', (0.83, 0.16, 0.66), 0.0, 1.1)
    sx, sy, sz = 1.22, 0.12, 1.12
    cyl('Shield', 0.3, 0.08, (sx, sy, sz), M('Red'), verts=16, bev=0.03, seg=1, rot=(rad(90), 0, 0))
    torus('Shield rim', 0.3, 0.05, (sx, sy - 0.01, sz), M('Gold'), 16, 5, rot=(rad(90), 0, 0))
    slab('Shield star', star_outline(0.16, 0.07), 0.06, (sx, sy - 0.05, sz), M('Sun'), bev=0.014, seg=1)
    # Barrel of spare swords (hilts up) at the front right.
    bx, by = 0.95, -0.58
    revolve('Barrel', [(0.0, 0.0), (0.22, 0.0), (0.27, 0.2), (0.27, 0.36), (0.22, 0.56), (0.0, 0.56)],
            M('Wood'), segs=12, loc=(bx, by, 0.0), smooth_angle=70)
    for zz in (0.14, 0.44):
        torus(f'Barrel hoop {zz}', 0.262, 0.025, (bx, by, zz), M('Gold'), 12, 4)
    for k, (dx, tilt) in enumerate(((-0.07, 172), (0.08, 190))):
        sword(f'Barrel sword {k}', (bx + dx, by, 0.84), rad(tilt), 0.72)


def build_garden_bed():
    POST = 0.22
    half = 1.05
    c = half - POST / 2
    for i, (sx, sy) in enumerate(((-1, -1), (1, -1), (1, 1), (-1, 1))):
        box(f'Post {i}', (POST, POST, 0.335), (sx * c, sy * c, 0.1675), M('Wood'), bev=0.045, seg=1)
    span = 2 * c - POST
    T = 0.15
    for i, (x, y, sx, sy) in enumerate(((0, -(half - T / 2), span, T), (0, half - T / 2, span, T),
                                        (-(half - T / 2), 0, T, span), (half - T / 2, 0, T, span))):
        box(f'Plank {i}', (sx, sy, 0.3), (x, y, 0.15), M('Wood light'), bev=0.035, seg=2)
    inner = half - T
    box('Soil', (2 * inner + 0.02, 2 * inner + 0.02, 0.2), (0, 0, 0.12), M('Soil'), bev=0.0)
    # Two rounded soil ridges along X at y = +-0.4 (crops stand at (+-0.4, +-0.4), soil top z 0.22).
    for y in (-0.4, 0.4):
        mound(f'Ridge {y}', 1.66, 0.46, 0.075, (0, y, 0.205), M('Soil ridge'))


def crystal(name, base, height, radius, tilt=(0, 0), material='Crystal', tip='Crystal light', spin=0.0):
    x, y, z = base
    prof = [(0.0, 0.0), (radius * 0.8, 0.0), (radius, height * 0.18), (radius * 0.96, height * 0.7),
            (0.0, height)]
    return revolve(name, prof, [M(material), M(tip)], [0, 0, 0, 1], segs=6, loc=(x, y, z),
                   rot=(rad(tilt[0]), rad(tilt[1]), spin), smooth_angle=20)


def build_wishing_crystal():
    rng = random.Random(5)
    # Tiered octagonal stone fountain with water and gold trim.
    o = TAU / 16
    revolve('Base tier', [(0.0, 0.0), (1.3, 0.0), (1.33, 0.08), (1.3, 0.2), (1.22, 0.24), (0.0, 0.24)],
            M('Stone'), segs=8, rot=(0, 0, o), smooth_angle=30)
    revolve('Basin wall', [(1.02, 0.2), (1.2, 0.2), (1.22, 0.56), (1.18, 0.62), (1.04, 0.62), (1.0, 0.56),
                           (1.0, 0.3)], M('Stone light'), segs=8, rot=(0, 0, o), smooth_angle=30)
    revolve('Basin trim', [(0.99, 0.6), (1.24, 0.6), (1.25, 0.67), (0.99, 0.67)], M('Gold'), segs=8,
            rot=(0, 0, o), smooth_angle=30)
    revolve('Water', [(0.0, 0.47), (1.02, 0.47)], M('Water'), segs=8, rot=(0, 0, o))
    for k in range(8):
        x, y, _ = polar(1.12, 45 * k + 45)
        ico(f'Trim stud {k}', 0.065, (x, y, 0.69), M('Gold'), 1)
    # Octagonal pedestal with a small gold-rimmed bowl.
    revolve('Pedestal', [(0.0, 0.3), (0.5, 0.3), (0.44, 0.8), (0.62, 0.92), (0.64, 1.02), (0.0, 1.02)],
            M('Stone light'), segs=8, rot=(0, 0, o), smooth_angle=30)
    revolve('Pedestal trim', [(0.53, 0.84), (0.67, 0.94), (0.67, 1.0), (0.53, 1.0)], M('Gold'), segs=8,
            rot=(0, 0, o), smooth_angle=30)
    # Glowing crystal cluster.
    crystal('Crystal main', (0, 0, 0.98), 2.16, 0.36, spin=0.3)
    for k, (deg, h, r, tilt) in enumerate(((20, 1.3, 0.21, 24), (145, 1.08, 0.19, 27), (255, 1.4, 0.22, 20),
                                           (-40, 0.85, 0.16, 32))):
        x, y, _ = polar(0.3, deg)
        crystal(f'Crystal side {k}', (x, y, 0.96), h, r,
                tilt=(-tilt * math.sin(rad(deg)), tilt * math.cos(rad(deg))), spin=rng.random())
    for k, (deg, mname) in enumerate(((-60, 'Crystal violet'), (75, 'Crystal pink'), (200, 'Crystal violet'),
                                      (-125, 'Crystal pink'), (15, 'Crystal violet'), (130, 'Crystal pink'))):
        x, y, _ = polar(0.8, deg)
        crystal(f'Crystal small {k}', (x, y, 0.42), 0.58 + 0.12 * (k % 2), 0.13,
                tilt=(-30 * math.sin(rad(deg)), 30 * math.cos(rad(deg))), material=mname, tip=mname,
                spin=rng.random())
    # Floating sparkles.
    for k, (deg, z) in enumerate(((-30, 2.35), (165, 2.05), (70, 2.7), (-150, 2.6))):
        x, y, _ = polar(0.75, deg)
        ico(f'Sparkle {k}', 0.1, (x, y, z), M('Crystal light'), 1, scale=(0.7, 0.7, 1.25), smooth_shading=False)


def build_storage_chest():
    box('Chest core', (1.1, 0.66, 0.54), (0, 0, 0.35), M('Wood dark'), bev=0.03, seg=1)
    for k, z in enumerate((0.21, 0.48)):
        box(f'Chest plank {k}', (1.16, 0.72, 0.25), (0, 0, z), M('Chest wood'), bev=0.045, seg=2)
    lid = cyl('Lid', 0.36, 1.16, (0, 0, 0.61), M('Chest wood light'), verts=12, bev=0.045, seg=2,
              rot=(0, rad(90), 0))
    lid.scale = (0.8, 1.0, 1.0)  # local X is world Z after the Y rotation
    box('Lid rim', (1.18, 0.76, 0.08), (0, 0, 0.62), M('Gold'), bev=0.03, seg=1)
    for x in (-0.36, 0.36):
        box(f'Body band {x}', (0.12, 0.76, 0.56), (x, 0, 0.33), M('Gold'), bev=0.035, seg=1)
        band = cyl(f'Lid band {x}', 0.385, 0.12, (x, 0, 0.61), M('Gold'), verts=12, bev=0.025, seg=1,
                   rot=(0, rad(90), 0))
        band.scale = (0.82, 1.0, 1.0)
    for sx in (-1, 1):
        for sy in (-1, 1):
            box(f'Corner {sx}{sy}', (0.12, 0.12, 0.62), (sx * 0.555, sy * 0.335, 0.31), M('Gold'), bev=0.04,
                seg=1)
    box('Lock plate', (0.26, 0.07, 0.3), (0, -0.37, 0.58), M('Gold'), bev=0.045, seg=2)
    cyl('Keyhole', 0.04, 0.03, (0, -0.395, 0.61), M('Charcoal'), verts=8, bev=0.0, rot=(rad(90), 0, 0))
    box('Keyhole slot', (0.035, 0.03, 0.09), (0, -0.395, 0.55), M('Charcoal'), bev=0.0)
    for sx in (-1, 1):
        torus(f'Handle {sx}', 0.09, 0.028, (sx * 0.6, 0, 0.44), M('Gold'), 8, 3, rot=(0, rad(90), 0))


def build_workshop():
    # Back pegboard with hanging tools, under a small striped awning.
    for x in (-1.08, 1.08):
        box(f'Back post {x}', (0.14, 0.14, 2.42), (x, 0.72, 1.21), M('Wood'), bev=0.04, seg=1)
    box('Pegboard', (2.06, 0.1, 1.1), (0, 0.74, 1.52), M('Wood light'), bev=0.04, seg=2)
    box('Pegboard rail', (2.2, 0.14, 0.12), (0, 0.72, 0.95), M('Wood dark'), bev=0.03, seg=1)
    # Hammer.
    box('Peg hammer handle', (0.08, 0.05, 0.5), (-0.72, 0.66, 1.4), M('Wood dark'), bev=0.02, seg=1)
    box('Peg hammer head', (0.34, 0.1, 0.15), (-0.72, 0.64, 1.7), M('Iron'), bev=0.035, seg=1)
    # Saw hanging blade-down: a tapered steel blade with chunky teeth and a red handle.
    saw = [(0.13, 0.0), (0.075, -0.62), (-0.075, -0.62)]
    for i in range(1, 6):
        mid, end = (i - 0.5) / 5, i / 5
        saw.append((-0.075 - 0.055 * mid - 0.055, -0.62 + 0.62 * mid))
        saw.append((-0.075 - 0.055 * end, -0.62 + 0.62 * end))
    slab('Peg saw blade', saw, 0.04, (0.02, 0.67, 1.76), M('Steel'), bev=0.012, seg=1)
    box('Peg saw handle', (0.32, 0.08, 0.18), (0.02, 0.66, 1.8), M('Red'), bev=0.05, seg=2)
    # Wrench.
    box('Peg wrench bar', (0.08, 0.05, 0.46), (0.62, 0.66, 1.44), M('Navy'), bev=0.02, seg=1)
    torus('Peg wrench ring', 0.1, 0.04, (0.62, 0.65, 1.72), M('Navy'), 10, 5, rot=(rad(90), 0, 0))
    torus('Peg wrench jaw', 0.08, 0.04, (0.62, 0.65, 1.17), M('Navy'), 10, 5, rot=(rad(90), 0, 0))
    prof = [(0.34, 2.3), (0.6, 2.43), (0.86, 2.5)]
    canvas('Workshop awning', -1.185, 1.185, 6, prof, ('Awning orange', 'Awning yellow'), thick=0.08,
           ripple=0.02, tongue=0.14)
    # Sturdy workbench.
    box('Bench top', (1.6, 0.8, 0.14), (-0.35, 0.0, 0.88), M('Wood light'), bev=0.045, seg=2)
    for sx in (-1, 1):
        for sy in (-1, 1):
            box(f'Bench leg {sx}{sy}', (0.13, 0.13, 0.82), (-0.35 + sx * 0.68, sy * 0.3, 0.41), M('Wood'),
                bev=0.03, seg=1)
    box('Bench shelf', (1.46, 0.62, 0.08), (-0.35, 0.0, 0.26), M('Wood'), bev=0.03, seg=1)
    for k in range(3):
        box(f'Shelf plank {k}', (1.1, 0.14, 0.08), (-0.4, -0.16 + 0.16 * k, 0.34),
            M('Wood light' if k % 2 else 'Wood dark'), bev=0.03, seg=1)
    # Vise on the front-left corner.
    box('Vise body', (0.26, 0.24, 0.18), (-0.98, -0.28, 1.04), M('Navy'), bev=0.04, seg=1)
    box('Vise jaw', (0.28, 0.08, 0.16), (-0.98, -0.43, 1.03), M('Navy'), bev=0.03, seg=1)
    cyl('Vise screw', 0.025, 0.36, (-0.98, -0.52, 1.0), M('Steel'), verts=6, bev=0.0, rot=(0, rad(90), 0))
    # Tools and work on the bench.
    box('Toolbox', (0.46, 0.26, 0.2), (0.12, 0.14, 1.05), M('Red'), bev=0.045, seg=2)
    box('Toolbox handle', (0.3, 0.04, 0.12), (0.12, 0.14, 1.2), M('Iron'), bev=0.015, seg=1)
    box('Plank on bench', (0.7, 0.2, 0.06), (-0.45, -0.14, 0.98), M('Wood'), bev=0.02, seg=1, rot=(0, 0, rad(-8)))
    box('Bench hammer handle', (0.36, 0.05, 0.05), (-0.42, 0.18, 0.99), M('Wood dark'), bev=0.015, seg=1,
        rot=(0, 0, rad(20)))
    box('Bench hammer head', (0.08, 0.2, 0.08), (-0.26, 0.24, 1.0), M('Iron'), bev=0.02, seg=1, rot=(0, 0, rad(20)))
    torus('Gear', 0.12, 0.045, (-0.02, -0.2, 0.975), M('Awning yellow'), 12, 5)
    for k in range(6):
        a = TAU * k / 6
        box(f'Gear tooth {k}', (0.08, 0.07, 0.07), (-0.02 + 0.175 * math.cos(a), -0.2 + 0.175 * math.sin(a), 0.975),
            M('Awning yellow'), bev=0.015, seg=1, rot=(0, 0, a))
    # Anvil on a tree stump beside the bench, with a glowing hot ingot.
    revolve('Stump', [(0.0, 0.0), (0.4, 0.0), (0.34, 0.1), (0.3, 0.5), (0.0, 0.5)], M('Wood dark'),
            segs=12, loc=(0.78, -0.4, 0.0), smooth_angle=60)
    revolve('Stump top', [(0.0, 0.5), (0.3, 0.5), (0.29, 0.53), (0.0, 0.54)], M('Wood light'), segs=12,
            loc=(0.78, -0.4, 0.0), smooth_angle=60)
    box('Anvil foot', (0.34, 0.26, 0.1), (0.78, -0.4, 0.59), M('Iron'), bev=0.03, seg=1)
    box('Anvil waist', (0.2, 0.16, 0.14), (0.78, -0.4, 0.7), M('Iron'), bev=0.03, seg=1)
    box('Anvil face', (0.5, 0.24, 0.13), (0.78, -0.4, 0.83), M('Iron'), bev=0.04, seg=2)
    cone('Anvil horn', 0.1, 0.26, (0.47, -0.4, 0.84), M('Iron'), verts=8, rot=(0, rad(-90), 0))
    box('Hot ingot', (0.2, 0.09, 0.06), (0.84, -0.42, 0.92), M('Ember'), bev=0.02, seg=1)


def build_kitchen():
    rng = random.Random(9)
    # Ring of chunky rounded stones.
    stones = 8
    for i in range(stones):
        deg = 360 * i / stones + 12
        x, y, _ = polar(0.8, deg)
        blob(f'Hearth stone {i}', 0.23, (x, y, 0.18), M(('Stone', 'Stone dark')[i % 2]), (1.0, 0.9, 0.7), 2,
             0.1, seed=rng.randint(0, 999))
    # Logs, glowing embers and tall toy flames beneath the pot.
    for k, deg in enumerate((10, 70, 130)):
        cyl(f'Log {k}', 0.085, 1.0, (0, 0, 0.09), M('Wood dark'), verts=6, bev=0.0, rot=(rad(90), 0, rad(deg)))
    for k in range(7):
        x, y, _ = polar(0.2 + 0.3 * rng.random(), rng.random() * 360)
        ico(f'Ember {k}', 0.07 + 0.03 * rng.random(), (x, y, 0.075), M('Ember'), 1, scale=(1, 1, 0.6))
    for k, (deg, r, s) in enumerate(((-90, 0.62, 1.15), (-52, 0.6, 0.95), (-128, 0.6, 1.0), (-15, 0.58, 0.8),
                                     (-165, 0.58, 0.85), (110, 0.55, 0.9))):
        x, y, _ = polar(r, deg)
        ico(f'Flame base {k}', 0.12 * s, (x, y, 0.2), M('Ember'), 1, scale=(1, 1, 0.9))
        cone(f'Flame {k}', 0.115 * s, 0.4 * s, (x, y, 0.2 + 0.2 * s), M('Ember'), verts=6)
        ico(f'Flame core {k}', 0.075 * s, (x * 1.06, y * 1.06, 0.24 * s), M('Flame'), 1, scale=(1, 1, 1.5))
    # Charcoal-iron cauldron.
    prof = [(0.0, 0.28), (0.34, 0.3), (0.6, 0.4), (0.74, 0.6), (0.77, 0.8), (0.72, 1.0), (0.64, 1.08),
            (0.6, 1.1), (0.58, 1.0)]
    revolve('Cauldron', prof, M('Iron'), segs=22, smooth_angle=70)
    torus('Cauldron rim', 0.63, 0.06, (0, 0, 1.1), M('Charcoal'), 22, 5)
    for s in (-1, 1):
        torus(f'Cauldron ear {s}', 0.11, 0.035, (s * 0.76, 0, 0.92), M('Charcoal'), 8, 4, rot=(rad(90), 0, 0))
    # Bubbling soup.
    revolve('Soup', [(0.0, 1.03), (0.6, 1.03)], M('Soup'), segs=22)
    for k, (dx, dy, r) in enumerate(((0.2, -0.15, 0.1), (-0.25, 0.05, 0.085), (0.08, 0.28, 0.07),
                                     (-0.08, -0.32, 0.06), (0.3, 0.12, 0.05))):
        sphere(f'Bubble {k}', r, (dx, dy, 1.02), M('Flame'), segs=8, rings=4, scale=(1, 1, 0.8))
    # Wooden ladle leaning on the rim.
    handle = Vector((-0.55, 0.42, 1.55)) - Vector((-0.12, 0.1, 0.95))
    box('Ladle handle', (0.07, 0.07, handle.length), Vector((-0.12, 0.1, 0.95)) + handle / 2, M('Wood'), bev=0.02,
        seg=1, rot=handle.to_track_quat('Z', 'Y').to_euler())
    sphere('Ladle bowl', 0.12, (-0.08, 0.07, 1.0), M('Wood'), segs=8, rings=5, scale=(1, 1, 0.6))
    # A rising trail of shrinking steam puffs.
    for k, (x, y, z, r) in enumerate(((0.16, 0.04, 1.2, 0.13), (0.26, 0.14, 1.39, 0.095), (0.18, 0.24, 1.52, 0.065))):
        ico(f'Steam {k}', r, (x, y, z), M('White'), 2)


def build_well():
    # Stone wall: a dark lining with staggered chunky stones and a cap course on top.
    revolve('Well lining', [(0.66, 0.1), (0.66, 0.8)], M('Stone dark'), segs=16)
    revolve('Water', [(0.0, 0.5), (0.7, 0.5)], M('Water'), segs=16)
    course = 8
    for row, (z0, z1, off) in enumerate(((0.0, 0.42, 0.0), (0.4, 0.8, 0.5))):
        for i in range(course):
            a0 = TAU * (i + off) / course + rad(1.6)
            a1 = TAU * (i + 1 + off) / course - rad(1.6)
            tone = ('Stone', 'Stone dark', 'Stone light')[(i + row) % 3]
            sector(f'Well stone {row}.{i}', 0.68, 1.06, a0, a1, z0, z1, M(tone), n=1, bev=0.05, seg=1, taper=0.02)
    for i in range(course):
        a0 = TAU * (i + 0.25) / course + rad(1.6)
        a1 = TAU * (i + 1.25) / course - rad(1.6)
        sector(f'Well cap {i}', 0.62, 1.12, a0, a1, 0.8, 0.95, M('Stone light' if i % 2 else 'Stone'), n=2,
               bev=0.05, seg=1)
    # Posts, crank axle, rope and bucket.
    for x in (-0.82, 0.82):
        box(f'Well post {x}', (0.16, 0.16, 1.44), (x, 0.0, 1.62), M('Wood'), bev=0.04, seg=1)
    cyl('Axle', 0.07, 1.8, (0, 0, 1.84), M('Wood light'), verts=8, bev=0.015, seg=1, rot=(0, rad(90), 0))
    cyl('Rope drum', 0.14, 0.5, (0, 0, 1.84), M('Wood dark'), verts=10, bev=0.03, seg=1, rot=(0, rad(90), 0))
    box('Crank arm', (0.06, 0.06, 0.34), (1.0, 0.0, 1.72), M('Wood dark'), bev=0.02, seg=1)
    cyl('Crank handle', 0.045, 0.14, (1.02, 0.0, 1.57), M('Red'), verts=6, bev=0.01, seg=1, rot=(0, rad(90), 0))
    cyl('Rope', 0.022, 0.62, (0, -0.02, 1.47), M('Wood light'), verts=6, bev=0.0)
    revolve('Bucket', [(0.0, 0.0), (0.15, 0.0), (0.2, 0.26), (0.17, 0.26), (0.13, 0.04), (0.0, 0.04)],
            M('Wood'), segs=10, loc=(0, -0.02, 0.92), smooth_angle=60)
    torus('Bucket hoop', 0.185, 0.022, (0, -0.02, 1.08), M('Gold'), 10, 4)
    torus('Bucket handle', 0.18, 0.016, (0, -0.02, 1.18), M('Wood dark'), 10, 4, rot=(rad(90), 0, 0))
    ico('Bucket water', 0.15, (0, -0.02, 1.12), M('Water'), 1, scale=(1, 1, 0.25))
    # Red gable roof, ridge running front to back so both slopes and the gable face the camera.
    pitch = rad(32)
    ridge_z = 2.74
    for side in (-1, 1):
        for row in range(3):
            d = 0.19 + row * 0.29
            x = side * d * math.cos(pitch)
            z = ridge_z - d * math.sin(pitch) - 0.03 * row
            box(f'Roof row {side}.{row}', (0.36, 1.26 - 0.03 * row, 0.1), (x, 0, z),
                M('Red' if row % 2 == 0 else 'Terracotta'), bev=0.045, seg=2, rot=(0, side * pitch, 0))
    box('Roof ridge', (0.2, 1.34, 0.16), (0, 0, ridge_z + 0.04), M('Wood light'), bev=0.06, seg=2)
    for y in (-0.53, 0.53):
        slab(f'Gable {y}', [(-0.76, 0.0), (0.76, 0.0), (0.0, 0.47)], 0.1, (0, y, 2.28), M('Wood'), bev=0.025,
             seg=1)
    box('Gable beam', (1.8, 0.12, 0.12), (0, -0.53, 2.24), M('Wood dark'), bev=0.03, seg=1)
    box('Gable beam back', (1.8, 0.12, 0.12), (0, 0.53, 2.24), M('Wood dark'), bev=0.03, seg=1)
    cyl('Gable medallion', 0.1, 0.05, (0, -0.6, 2.42), M('Gold'), verts=10, bev=0.0, rot=(rad(90), 0, 0))


def build_rocket():
    # Launch pad with a hazard ring and blue lights.
    revolve('Pad', [(0.0, 0.0), (2.55, 0.0), (2.64, 0.07), (2.62, 0.2), (2.52, 0.27), (2.3, 0.28), (0.0, 0.28)],
            M('Pad'), segs=40, smooth_angle=45)
    revolve('Pad deck', [(0.0, 0.28), (2.05, 0.28), (2.08, 0.31), (0.0, 0.31)], M('Pad dark'), segs=40)
    tiles = 20
    for i in range(0, tiles, 2):
        a0 = TAU * i / tiles + rad(3)
        a1 = TAU * (i + 1) / tiles + rad(3)
        sector(f'Hazard {i}', 1.62, 2.0, a0, a1, 0.3, 0.335, M('Hazard'), n=2, bev=0.0, seg=1)
    revolve('Pad ring', [(1.18, 0.3), (1.3, 0.3), (1.3, 0.335), (1.18, 0.335)], M('Hazard'), segs=36)
    for i in range(8):
        x, y, _ = polar(2.32, 22.5 + 45 * i)
        cyl(f'Pad light base {i}', 0.13, 0.08, (x, y, 0.31), M('Pad dark'), verts=8, bev=0.0)
        sphere(f'Pad light {i}', 0.11, (x, y, 0.36), M('Pad light'), segs=8, rings=5, scale=(1, 1, 0.75))
    # Rocket body.
    revolve('Nozzle', [(0.3, 0.33), (0.52, 0.33), (0.48, 0.6), (0.3, 0.62)], M('Charcoal'), segs=20,
            smooth_angle=40)
    body = [(0.0, 0.55), (0.6, 0.55), (0.8, 0.72), (0.9, 1.15), (0.93, 1.8), (0.9, 2.5), (0.83, 3.1),
            (0.73, 3.5)]
    revolve('Body', body, M('Rocket white'), segs=28, smooth_angle=60)
    revolve('Band', [(0.72, 3.42), (0.775, 3.45), (0.785, 3.62), (0.72, 3.66)], M('Sun'), segs=28, smooth_angle=60)
    nose = [(0.74, 3.6), (0.7, 3.95), (0.58, 4.35), (0.4, 4.68), (0.18, 4.92), (0.0, 5.0)]
    revolve('Nose', nose, M('Rocket red'), segs=28, smooth_angle=60)
    sphere('Nose tip', 0.1, (0, 0, 5.03), M('Gold'), segs=10, rings=6)
    revolve('Base band', [(0.82, 0.74), (0.87, 0.77), (0.925, 1.05), (0.905, 1.1)], M('Rocket red'), segs=28,
            smooth_angle=60)
    # Porthole facing -Y.
    pz = 2.35
    torus('Porthole rim', 0.31, 0.07, (0, -0.87, pz), M('Gold'), 18, 5, rot=(rad(90), 0, 0))
    sphere('Porthole glass', 0.28, (0, -0.86, pz), M('Glass'), segs=14, rings=8, scale=(1, 0.33, 1))
    # Four swept fins on the diagonals.
    fin = [(0.7, 2.05), (0.8, 0.62), (1.0, 0.36), (1.38, 0.33), (1.42, 0.5), (1.32, 0.95), (1.08, 1.5)]
    for k, deg in enumerate((45, 135, 225, 315)):
        extrude_outline(f'Fin {k}', fin, 0.15, (0, 0, 0), M('Rocket red'), rot=(0, 0, rad(deg)), bev=0.045)


# -------------------------------------------------------------- contract
BUILDERS = {
    'cottage': dict(file='cottage.glb', build=build_cottage, tris=9000, h=6.5, radius=3.7),
    'market-stall': dict(file='market-stall.glb', build=build_market_stall, tris=5000, h=2.9, box=(3.2, 2.0)),
    'equipment-stall': dict(file='equipment-stall.glb', build=build_equipment_stall, tris=5000, h=2.9,
                            box=(3.2, 2.0)),
    'garden-bed': dict(file='garden-bed.glb', build=build_garden_bed, tris=900, h=0.34, box=(2.12, 2.12)),
    'wishing-crystal': dict(file='wishing-crystal.glb', build=build_wishing_crystal, tris=2500, h=3.2, radius=1.35),
    'storage-chest': dict(file='storage-chest.glb', build=build_storage_chest, tris=1200, h=1.1, box=(1.3, 0.85)),
    'workshop': dict(file='workshop.glb', build=build_workshop, tris=4000, h=2.6, box=(2.4, 1.8)),
    'kitchen': dict(file='kitchen.glb', build=build_kitchen, tris=2500, h=1.6, radius=1.1),
    'well': dict(file='well.glb', build=build_well, tris=3000, h=2.9, radius=1.15),
    'rocket': dict(file='rocket.glb', build=build_rocket, tris=4000, h=5.2, radius=2.7),
}
EPS = 1e-4
# Hand-off notes for the game integrator (copied into the manifest). Directions are Blender's:
# -Y is the front, which becomes +Z in the glTF.
NOTES = {
    'cottage': 'Door (with brass knob and round window) faces -Y. Walls r 2.32, plinth r 2.6, roof r 3.65; '
               'only the porch/step leaves r 2.7, toward -Y to y -3.39.',
    'market-stall': 'Counter front and the navy energy badge (yellow bolt, tilted 40 deg back to face the camera) '
                    'face -Y.',
    'equipment-stall': 'Counter (hat, helmet, clothes) under the teal canopy on the left; sword-and-shield '
                       'board and sword barrel on the right; all face -Y.',
    'garden-bed': 'Soil top z 0.22, frame planks top z 0.30, corner posts z 0.335. Ridges run along X at '
                  'y = +-0.4 and rise to z 0.28, so crops at (+-0.4, +-0.4) sit slightly into them.',
    'wishing-crystal': 'Crystal materials are emissive (Crystal, Crystal light, Crystal violet, Crystal pink); '
                       'water surface at z 0.47.',
    'storage-chest': 'Lock plate faces -Y. Domed lid; no separate lid object (one joined mesh).',
    'workshop': 'Open front toward -Y; the awning covers only y >= 0.34 so the bench stays visible. '
                'Hot ingot on the anvil uses the emissive Ember material.',
    'kitchen': 'Emissive: Ember (glowing coals and flame bodies), Flame (flame cores and soup bubbles), Soup '
               '(soup surface at z 1.03).',
    'well': 'Gable roof ridge runs along Y so the gable (gold medallion) faces -Y; crank handle on +X; '
            'water surface at z 0.5.',
    'rocket': 'Porthole faces -Y at z 2.35. Body r <= 0.93 (porthole rim about 0.96); the four diagonal fins '
              'reach r 1.42 (inside collision r 1.5); pad r 2.64. Pad light is emissive.',
}


def check_contract(key, obj):
    spec = BUILDERS[key]
    verts = [v.co for v in obj.data.vertices]
    problems = []
    lo = Vector((min(v.x for v in verts), min(v.y for v in verts), min(v.z for v in verts)))
    hi = Vector((max(v.x for v in verts), max(v.y for v in verts), max(v.z for v in verts)))
    r_max = max(math.hypot(v.x, v.y) for v in verts)
    tris = triangles(obj)
    if tris > spec['tris']:
        problems.append(f'{tris} triangles > budget {spec["tris"]}')
    if lo.z < -EPS:
        problems.append(f'base below ground: min z {lo.z:.3f}')
    if hi.z > spec['h'] + EPS:
        problems.append(f'height {hi.z:.3f} > {spec["h"]}')
    if 'box' in spec:
        bx, by = spec['box']
        if max(abs(lo.x), abs(hi.x)) > bx / 2 + EPS or max(abs(lo.y), abs(hi.y)) > by / 2 + EPS:
            problems.append(f'footprint x[{lo.x:.3f},{hi.x:.3f}] y[{lo.y:.3f},{hi.y:.3f}] exceeds {bx} x {by}')
    if 'radius' in spec and r_max > spec['radius'] + EPS:
        problems.append(f'radius {r_max:.3f} > {spec["radius"]}')
    if key == 'cottage':
        # Below the roof, only the porch may leave the r 2.7 wall circle, and only toward -Y (to 3.4).
        for v in verts:
            if v.z < 2.95 and math.hypot(v.x, v.y) > 2.7 + EPS:
                if not (v.y < 0 and abs(v.x) <= 1.3 and v.y >= -3.4 - EPS):
                    problems.append(f'wall/porch vertex outside r 2.7 at ({v.x:.2f}, {v.y:.2f}, {v.z:.2f})')
                    break
        if lo.y < -3.7 - EPS:
            problems.append(f'front {lo.y:.3f} beyond roof radius')
    if key == 'rocket':
        # The body (everything above the fins) stays inside r 1.0; the fins stay inside collision r 1.5.
        for v in verts:
            r = math.hypot(v.x, v.y)
            if v.z > 2.05 and r > 1.0 + EPS:
                problems.append(f'body vertex outside r 1.0 at z {v.z:.2f} (r {r:.3f})')
                break
            if v.z > 0.5 and r > 1.45 + EPS:
                problems.append(f'fin vertex outside r 1.45 at z {v.z:.2f} (r {r:.3f})')
                break
    info = dict(triangles=tris, budget=spec['tris'],
                bounds=dict(min=[round(c, 4) for c in lo], max=[round(c, 4) for c in hi]),
                max_radius=round(r_max, 4),
                materials=[m.name for m in obj.data.materials],
                emissive_materials=[m.name for m in obj.data.materials if len(MATERIALS.get(m.name, ())) > 2],
                notes=NOTES.get(key, ''))
    return problems, info


# ----------------------------------------------------------------- main
def parse_args():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument('--only', default='')
    parser.add_argument('--install', action='store_true')
    parser.add_argument('--render', action='store_true')
    parser.add_argument('--out', default=MODEL_DIR)
    parser.add_argument('--stats', action='store_true', help='print the heaviest parts of each prop')
    parser.add_argument('--fbx', action='store_true', help='also write Unity FBX copies to art/exports/unity-fbx')
    return parser.parse_args(argv)


def part_triangles(obj):
    evaluated = obj.evaluated_get(bpy.context.evaluated_depsgraph_get())
    mesh = evaluated.to_mesh()
    mesh.calc_loop_triangles()
    count = len(mesh.loop_triangles)
    evaluated.to_mesh_clear()
    return count


def print_stats(key, parts):
    groups = {}
    for obj in parts:
        stem = re.sub(r'[ ]?[-0-9.LR]*$', '', obj.name) or obj.name
        groups[stem] = groups.get(stem, 0) + part_triangles(obj)
    top = sorted(groups.items(), key=lambda kv: -kv[1])[:14]
    print(f'[stats] {key}: ' + ', '.join(f'{k} {v}' for k, v in top))


def triangulate(obj):
    """Triangulate and sort faces so the GLB is byte-for-byte reproducible: UV spheres come out of
    bmesh in a memory-address-dependent face order. New diagonals stay smooth (shading unchanged)."""
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    result = bmesh.ops.triangulate(bm, faces=[f for f in bm.faces if len(f.verts) > 3],
                                   quad_method='FIXED', ngon_method='EAR_CLIP')
    for edge in result['edges']:
        edge.smooth = True
    bm.verts.index_update()
    bm.faces.index_update()

    def key(face):
        c = face.calc_center_median()
        return (face.material_index, round(c.x, 4), round(c.y, 4), round(c.z, 4),
                tuple(sorted(v.index for v in face.verts)))
    rank = {f.index: n for n, f in enumerate(sorted(bm.faces, key=key))}
    bm.faces.sort(key=lambda f: rank[f.index])
    bm.faces.index_update()
    bm.to_mesh(obj.data)
    bm.free()
    obj.data.update()
    return obj


def export_fbx(obj, key):
    """Unity copy of a prop: Y up, -Z forward, metres. Unity import is untested."""
    folder = os.path.join(ROOT, 'art', 'exports', 'unity-fbx')
    os.makedirs(folder, exist_ok=True)
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.export_scene.fbx(filepath=os.path.join(folder, key + '.fbx'), use_selection=True,
                             object_types={'MESH'}, apply_unit_scale=True, axis_forward='-Z', axis_up='Y',
                             use_mesh_modifiers=True, bake_anim=False, add_leaf_bones=False)


def build_all(keys, out_dir, stats=False, fbx=False):
    results = {}
    objects = {}
    for key in keys:
        spec = BUILDERS[key]
        before = set(bpy.data.objects)
        spec['build']()
        parts = [o for o in bpy.data.objects if o not in before and o.type == 'MESH']
        if stats:
            print_stats(key, parts)
        obj = triangulate(join(parts, key))
        problems, info = check_contract(key, obj)
        path = os.path.join(out_dir, spec['file'])
        info['bytes'] = export_glb([obj], path)
        if fbx:
            export_fbx(obj, key)
        info['file'] = spec['file']
        results[key] = info
        objects[key] = obj
        status = 'OK' if not problems else 'FAIL'
        print(f'[props] {key:16s} {status} tris {info["triangles"]:5d}/{spec["tris"]:5d}  '
              f'{info["bytes"] / 1024:7.1f} KB  h {info["bounds"]["max"][2]:.2f}  r {info["max_radius"]:.2f}  '
              f'mats {len(info["materials"])}')
        if problems:
            info['problems'] = problems
            for p in problems:
                print(f'[props]    !! {p}')
    return results, objects


LAYOUT = {
    'cottage': (0.0, 5.0), 'well': (-6.2, 6.0), 'wishing-crystal': (6.4, 6.0),
    'market-stall': (-6.2, 0.6), 'equipment-stall': (6.0, 0.6), 'storage-chest': (-2.6, 1.0),
    'workshop': (1.0, -3.6), 'kitchen': (-2.2, -3.6), 'garden-bed': (-7.0, -4.2),
    'rocket': (6.6, -5.0),
}


def render_previews(objects):
    scene = bpy.context.scene
    studio()
    # Tone the shared studio down for previews only: the game lights props with a hemisphere
    # and a sun and has no glossy sky reflections, so a dimmer world and -0.4 EV read closer.
    bg = next(n for n in scene.world.node_tree.nodes if n.type == 'BACKGROUND')
    bg.inputs['Strength'].default_value = 0.55
    scene.view_settings.exposure = -0.4
    try:
        scene.eevee.taa_render_samples = 48
    except AttributeError:
        pass
    os.makedirs(PREVIEW_DIR, exist_ok=True)
    cams = []
    for key, obj in objects.items():
        for other in objects.values():
            other.hide_render = other is not obj
        lo = Vector(BUILDER_INFO[key]['bounds']['min'])
        hi = Vector(BUILDER_INFO[key]['bounds']['max'])
        size = hi - lo
        vertical = size.y * math.sin(rad(42)) + size.z * math.cos(rad(42))
        ortho = max(size.x * 1.3, vertical * 1.3 * 4 / 3, 2.0)
        centre = ((lo.x + hi.x) / 2, (lo.y + hi.y) / 2, (lo.z + hi.z) / 2)
        cams.append(game_camera(centre, ortho))
        render(os.path.join(PREVIEW_DIR, f'{key}.webp'))
    # Collection shot: every prop laid out like a small village.
    beds = []
    for key, obj in objects.items():
        obj.hide_render = False
        x, y = LAYOUT[key]
        obj.location = (x, y, 0)
    if 'garden-bed' in objects:
        src = objects['garden-bed']
        for k, (dx, dy) in enumerate(((2.3, 0), (0, -2.3), (2.3, -2.3))):
            dup = src.copy()
            dup.location = (src.location.x + dx, src.location.y + dy, 0)
            bpy.context.scene.collection.objects.link(dup)
            beds.append(dup)
    game_camera((0.0, 0.2, 0.8), 24.0)
    scene.render.resolution_x, scene.render.resolution_y = 1600, 1200
    render(os.path.join(PREVIEW_DIR, 'props.webp'))
    for dup in beds:
        bpy.data.objects.remove(dup, do_unlink=True)
    for obj in objects.values():
        obj.location = (0, 0, 0)


BUILDER_INFO = {}


def main():
    args = parse_args()
    keys = [k for k in (args.only.split(',') if args.only else BUILDERS) if k]
    unknown = [k for k in keys if k not in BUILDERS]
    if unknown:
        raise SystemExit(f'unknown prop(s): {unknown}; choose from {list(BUILDERS)}')
    reset_scene()
    os.makedirs(args.out, exist_ok=True)
    results, objects = build_all(keys, args.out, args.stats, args.fbx)
    BUILDER_INFO.update(results)

    manifest = {}
    if os.path.exists(MANIFEST):
        try:
            with open(MANIFEST, encoding='utf-8') as fh:
                manifest = json.load(fh).get('assets', {})
        except (OSError, ValueError):
            manifest = {}
    manifest.update(results)
    manifest = {k: manifest[k] for k in BUILDERS if k in manifest}
    total = sum(v['bytes'] for v in manifest.values())
    os.makedirs(os.path.dirname(MANIFEST), exist_ok=True)
    with open(MANIFEST, 'w', encoding='utf-8', newline='\n') as fh:
        json.dump(dict(generator='art/blender/kit/build_props.py', units='metres',
                       coordinates='Blender: Z up, front faces -Y, origin at ground centre',
                       total_bytes=total, assets=manifest), fh, indent=2)
        fh.write('\n')
    print(f'[props] total {total / 1024:.1f} KB for {len(manifest)} assets -> {MANIFEST}')

    failures = {k: v['problems'] for k, v in results.items() if v.get('problems')}
    if len(manifest) == len(BUILDERS) and total > TOTAL_BYTES_LIMIT:
        failures['total'] = [f'total GLB size {total} bytes > {TOTAL_BYTES_LIMIT}']
    if args.render:
        render_previews(objects)
    if failures:
        for key, problems in failures.items():
            for p in problems:
                print(f'[props] CONTRACT FAIL {key}: {p}')
        sys.stdout.flush()
        # Blender swallows exceptions from --python in background mode; exit non-zero explicitly.
        os._exit(1)
    if args.install:
        os.makedirs(INSTALL_DIR, exist_ok=True)
        for key in keys:
            src = os.path.join(args.out, BUILDERS[key]['file'])
            shutil.copyfile(src, os.path.join(INSTALL_DIR, BUILDERS[key]['file']))
        print(f'[props] installed {len(keys)} GLB(s) to {INSTALL_DIR}')


if __name__ == '__main__':
    try:
        main()
    except SystemExit:
        raise
    except Exception:
        import traceback
        traceback.print_exc()
        sys.stdout.flush()
        os._exit(1)
