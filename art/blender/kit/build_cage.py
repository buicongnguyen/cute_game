"""Zoo Garden prisoner cage: a little round birdcage-style jail that stands next to a boss and holds a rescued friend.

About 1.75 m to the roof ring (the prisoner inside is the explorer at half size, ~0.97 m), in the shared chunky toy
style (style.py): a round wooden floor, iron bars, a red cone roof with a ring on top. All designs are original.

Two rigid models (CONTRACT.md style, no armature), each one top-level object:
- `cage`       the floor, roof and the bars round the back and sides;
- `cage_door`  the front bars, two cross rails and a golden padlock (pops off when the prisoner is rescued).
The front (Blender -Y, glTF +Z) faces the game camera; its bars are few and thin so the prisoner stays visible.
Materials are `Cage <name>`, flat colours. The runtime merges each model into one vertex-coloured draw.

Run from the repository root:

    blender -b --factory-startup --python art/blender/kit/build_cage.py -- [--install] [--render]

Outputs art/generated/kit/models/cage.glb, art/generated/kit/cage-manifest.json and (--render) art/previews/kit/cage.webp;
--install copies cage.glb to public/assets/models/. Exits non-zero over the triangle budget (1,400).
"""
import bpy
import json
import math
import os
import shutil
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)
from style import box, cyl, cone, sphere, torus, mat, join, triangles, reset_scene, studio, render  # noqa: E402
from mathutils import Vector  # noqa: E402

REPO = os.path.normpath(os.path.join(HERE, '..', '..', '..'))
GEN = os.path.join(REPO, 'art', 'generated', 'kit')
OUT = os.path.join(GEN, 'models', 'cage.glb')
MANIFEST = os.path.join(GEN, 'cage-manifest.json')
PREVIEW = os.path.join(REPO, 'art', 'previews', 'kit', 'cage.webp')
PUBLIC_MODEL = os.path.join(REPO, 'public', 'assets', 'models', 'cage.glb')
TRI_BUDGET = 1400
R = 0.7          # bar circle radius
TOP = 1.55       # top ring height: high enough that the 51-degree game camera sees the prisoner's head under the roof
FRONT = 55       # half-angle (degrees) of the door arc around the front (-Y)


def materials():
    return dict(
        wood=mat('Cage wood', '#B5793F', 0.6),
        plank=mat('Cage plank', '#8E5A2E', 0.65),
        iron=mat('Cage iron', '#56607A', 0.35, 0.3),
        roof=mat('Cage roof', '#D9534A', 0.45),
        gold=mat('Cage gold', '#FFC94A', 0.3, 0.4),
    )


def bar(name, angle, m, z0=0.12, z1=TOP):
    a = math.radians(angle)
    return cyl(name, 0.026, z1 - z0, (R * math.sin(a), -R * math.cos(a), (z0 + z1) / 2), m, verts=6, bev=0, seg=1)


def build():
    m = materials()
    pieces = [
        cyl('floor', R + 0.06, 0.12, (0, 0, 0.06), m['wood'], verts=18, bev=0.02, seg=1),
        cyl('floor-rim', R + 0.1, 0.05, (0, 0, 0.025), m['plank'], verts=18, bev=0, seg=1),
        torus('top-ring', R, 0.04, (0, 0, TOP), m['iron'], major_segs=18, minor_segs=4),
        cone('roof', R + 0.08, 0.34, (0, 0, TOP + 0.17), m['roof'], verts=18),
        sphere('roof-knob', 0.07, (0, 0, TOP + 0.36), m['gold'], segs=8, rings=5),
        torus('hang-ring', 0.08, 0.018, (0, 0, TOP + 0.45), m['iron'], major_segs=10, minor_segs=4, rot=(math.radians(90), 0, 0)),
        torus('mid-ring-back', R, 0.022, (0, 0, 0.78), m['iron'], major_segs=18, minor_segs=4),
    ]
    # Bars round the back and sides, every 30 degrees outside the door arc.
    for i, deg in enumerate(range(FRONT + 15, 360 - FRONT - 14, 30)):
        pieces.append(bar(f'bar-{i}', deg, m['iron']))
    cage = join(pieces, 'cage')
    door = []
    for i, deg in enumerate((-FRONT + 12, -14, 14, FRONT - 12)):
        door.append(bar(f'door-bar-{i}', deg, m['iron']))
    # Two straight rails across the door, and the padlock hanging in the middle.
    for z in (0.42, 1.12):
        door.append(box(f'door-rail-{z}', (2 * R * math.sin(math.radians(FRONT)), 0.04, 0.05), (0, -R * math.cos(math.radians(FRONT)) - 0.02, z), m['plank'], bev=0.01, seg=1))
    door += [
        box('lock', (0.16, 0.07, 0.14), (0, -R - 0.05, 0.74), m['gold'], bev=0.025, seg=1),
        torus('lock-shackle', 0.05, 0.013, (0, -R - 0.05, 0.83), m['gold'], major_segs=10, minor_segs=4, rot=(math.radians(90), 0, 0)),
        sphere('lock-hole', 0.018, (0, -R - 0.088, 0.73), m['plank'], segs=6, rings=4),
    ]
    cage_door = join(door, 'cage_door')
    return [cage, cage_door]


def main():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    reset_scene()
    objs = build()
    tris = sum(triangles(o) for o in objs)
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', use_selection=True, export_yup=True, export_apply=True,
                              export_materials='EXPORT', export_extras=False, export_cameras=False, export_lights=False,
                              export_animations=False, export_texcoords=False, export_normals=True)
    size = os.path.getsize(OUT)
    top = max((o.matrix_world @ Vector(c)).z for o in objs for c in o.bound_box)
    with open(MANIFEST, 'w') as f:
        json.dump(dict(cage=dict(triangles=tris, height=round(top, 3), bytes=size, models=[o.name for o in objs],
                                 parts={o.name: triangles(o) for o in objs})), f, indent=2)
    if '--render' in argv:
        studio(transparent=False, size=(600, 600))
        cam_data = bpy.data.cameras.new('Preview camera')
        cam_data.type = 'ORTHO'
        cam_data.ortho_scale = 2.6
        cam = bpy.data.objects.new('Preview camera', cam_data)
        bpy.context.scene.collection.objects.link(cam)
        cam.location = (2.2, -4.0, 3.2)
        cam.rotation_euler = (Vector((0, 0, 0.8)) - cam.location).to_track_quat('-Z', 'Y').to_euler()
        bpy.context.scene.camera = cam
        render(PREVIEW)
    if '--install' in argv:
        os.makedirs(os.path.dirname(PUBLIC_MODEL), exist_ok=True)
        shutil.copyfile(OUT, PUBLIC_MODEL)
    print(f'cage.glb {size} bytes, {tris} triangles, height {top:.3f} m')
    if tris > TRI_BUDGET:
        print(f'FAILED: {tris} triangles > {TRI_BUDGET}')
        sys.exit(1)


main()
