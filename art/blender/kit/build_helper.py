"""Zoo Garden garden helper: a tiny gardening robot ("Bolt") that tends the beds at home.

About a quarter of the explorer's height (0.52 m to the leaf tip against the explorer's ~1.93 m), in the shared
chunky toy style (style.py): a round sunny-yellow body with a leaf-green apron, a dome head with a dark face screen and two
glowing-free cyan eyes, a two-leaf sprout on top, stubby arms and legs, and a little orange watering can in the right
hand. All designs are original.

Rigid named parts, as farm.glb's animals (CONTRACT.md, "Garden helper"): one root empty `helper` with one child mesh
per part, `helper_<part>` for body, head, arm_l, arm_r (with the can), leg_l, leg_r. A child's translation is the
part's pivot (its joint) and its vertices are relative to it; children have no rotation or scale. Materials are
`Helper <name>`, flat colours, no textures. One draw per material after the runtime bakes colours.

Run from the repository root:

    blender -b --factory-startup --python art/blender/kit/build_helper.py -- [--install] [--render]

Outputs:
    art/generated/kit/models/helper.glb
    art/generated/kit/helper-manifest.json
    art/generated/kit/icons/helper.webp            (160 x 160, transparent; the buy panel's picture)
    art/previews/kit/helper.webp                    (with --render)
--install copies helper.glb to public/assets/models/ and the icon to public/assets/icons/helper.webp.
Exits non-zero when a part is missing or the triangle budget (1,500, as the farm animals) is broken.
"""
import bpy
import json
import math
import os
import shutil
import sys
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)
from style import box, cyl, sphere, torus, mat, join, triangles, export_glb, reset_scene, studio, render  # noqa: E402

REPO = os.path.normpath(os.path.join(HERE, '..', '..', '..'))
GEN = os.path.join(REPO, 'art', 'generated', 'kit')
OUT = os.path.join(GEN, 'models', 'helper.glb')
ICON = os.path.join(GEN, 'icons', 'helper.webp')
MANIFEST = os.path.join(GEN, 'helper-manifest.json')
PREVIEW = os.path.join(REPO, 'art', 'previews', 'kit', 'helper.webp')
PUBLIC_MODEL = os.path.join(REPO, 'public', 'assets', 'models', 'helper.glb')
PUBLIC_ICON = os.path.join(REPO, 'public', 'assets', 'icons', 'helper.webp')
TRI_BUDGET = 1500
PARTS = ['body', 'head', 'arm_l', 'arm_r', 'leg_l', 'leg_r']


def materials():
    return dict(
        shell=mat('Helper shell', '#FFD24A', 0.45),
        apron=mat('Helper apron', '#4FBF3A', 0.6),
        screen=mat('Helper screen', '#24335A', 0.3),
        eye=mat('Helper eye', '#7FF0FF', 0.25),
        cheek=mat('Helper cheek', '#FF8FB4', 0.5),
        leaf=mat('Helper leaf', '#6FD24A', 0.5),
        stem=mat('Helper stem', '#2F9A3A', 0.6),
        boot=mat('Helper boot', '#C46A2E', 0.55),
        can=mat('Helper can', '#FF8A2A', 0.35),
        water=mat('Helper rose', '#35B6F2', 0.35),
    )


def part(name, pieces, pivot):
    """Join pieces into `helper_<name>` with its origin (translation) at `pivot`."""
    obj = join(pieces, 'helper_' + name)
    bpy.context.scene.cursor.location = pivot
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.origin_set(type='ORIGIN_CURSOR')
    bpy.context.scene.cursor.location = (0, 0, 0)
    return obj


def build():
    m = materials()
    body = part('body', [
        sphere('b-shell', 0.11, (0, 0, 0.2), m['shell'], segs=12, rings=7, scale=(1, 0.9, 1.05)),
        cyl('b-apron', 0.103, 0.09, (0, -0.012, 0.165), m['apron'], verts=14, bev=0, seg=1),
        box('b-pocket', (0.07, 0.02, 0.04), (0, -0.103, 0.16), m['leaf'], bev=0, seg=1),
    ], (0, 0, 0.2))
    head = part('head', [
        sphere('h-dome', 0.105, (0, 0, 0.36), m['shell'], segs=12, rings=7, scale=(1.08, 0.95, 0.9)),
        sphere('h-screen', 0.078, (0, -0.062, 0.355), m['screen'], segs=10, rings=6, scale=(1.1, 0.7, 0.75)),
        sphere('h-eye-l', 0.017, (-0.032, -0.114, 0.36), m['eye'], segs=8, rings=5, scale=(1, 0.5, 1.25)),
        sphere('h-eye-r', 0.017, (0.032, -0.114, 0.36), m['eye'], segs=8, rings=5, scale=(1, 0.5, 1.25)),
        sphere('h-cheek-l', 0.012, (-0.062, -0.1, 0.335), m['cheek'], segs=8, rings=4, scale=(1, 0.4, 0.7)),
        sphere('h-cheek-r', 0.012, (0.062, -0.1, 0.335), m['cheek'], segs=8, rings=4, scale=(1, 0.4, 0.7)),
        cyl('h-stem', 0.009, 0.07, (0, 0, 0.47), m['stem'], verts=6, bev=0, seg=1),
        sphere('h-leaf-l', 0.04, (-0.035, 0, 0.5), m['leaf'], segs=8, rings=5, scale=(1, 0.45, 0.4), rot=(0, math.radians(-25), 0)),
        sphere('h-leaf-r', 0.034, (0.03, 0, 0.51), m['leaf'], segs=8, rings=5, scale=(1, 0.45, 0.4), rot=(0, math.radians(30), 0)),
    ], (0, 0, 0.29))
    arms = []
    for side, sx in (('l', -1), ('r', 1)):
        pieces = [
            cyl(f'a-{side}', 0.022, 0.09, (sx * 0.118, 0, 0.19), m['shell'], verts=8, bev=0, seg=1),
            sphere(f'a-{side}-hand', 0.026, (sx * 0.118, 0, 0.14), m['apron'], segs=8, rings=5),
        ]
        if side == 'r':
            # The watering can hangs from the right hand, spout forward (-Y).
            pieces += [
                cyl('can-body', 0.04, 0.06, (0.125, -0.02, 0.1), m['can'], verts=12, bev=0, seg=1),
                torus('can-handle', 0.026, 0.006, (0.125, 0.0, 0.14), m['can'], major_segs=10, minor_segs=4, rot=(math.radians(90), 0, math.radians(90))),
                cyl('can-spout', 0.008, 0.07, (0.125, -0.08, 0.12), m['can'], verts=6, bev=0, seg=1, rot=(math.radians(-60), 0, 0)),
                cyl('can-rose', 0.016, 0.012, (0.125, -0.112, 0.14), m['water'], verts=8, bev=0, seg=1, rot=(math.radians(-60), 0, 0)),
            ]
        arms.append(part('arm_' + side, pieces, (sx * 0.118, 0, 0.235)))
    legs = []
    for side, sx in (('l', -1), ('r', 1)):
        legs.append(part('leg_' + side, [
            cyl(f'l-{side}', 0.022, 0.07, (sx * 0.045, 0, 0.075), m['shell'], verts=8, bev=0, seg=1),
            sphere(f'l-{side}-boot', 0.034, (sx * 0.045, -0.012, 0.028), m['boot'], segs=10, rings=6, scale=(1, 1.35, 0.8)),
        ], (sx * 0.045, 0, 0.11)))
    root = bpy.data.objects.new('helper', None)
    bpy.context.scene.collection.objects.link(root)
    objs = [body, head, *arms, *legs]
    for o in objs:
        o.parent = root
    return root, objs


def main():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    reset_scene()
    root, objs = build()
    tris = sum(triangles(o) for o in objs)
    names = sorted(o.name for o in objs)
    failures = []
    if names != sorted('helper_' + p for p in PARTS):
        failures.append(f'parts {names}')
    if tris > TRI_BUDGET:
        failures.append(f'{tris} triangles > {TRI_BUDGET}')
    bpy.ops.object.select_all(action='DESELECT')
    root.select_set(True)
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = root
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', use_selection=True, export_yup=True, export_apply=True,
                              export_materials='EXPORT', export_extras=False, export_cameras=False, export_lights=False,
                              export_animations=False, export_texcoords=False, export_normals=True)
    size = os.path.getsize(OUT)
    top = max((o.matrix_world @ Vector(c)).z for o in objs for c in o.bound_box)
    manifest = dict(helper=dict(triangles=tris, height=round(top, 3), bytes=size, parts=PARTS,
                                pivots={o.name: [round(v, 3) for v in o.location] for o in objs}))
    with open(MANIFEST, 'w') as f:
        json.dump(manifest, f, indent=2)
    # Icon: a front three-quarter view on a transparent background.
    studio(transparent=True, size=(160, 160))
    cam_data = bpy.data.cameras.new('Icon camera')
    cam_data.type = 'ORTHO'
    cam_data.ortho_scale = 0.62
    cam = bpy.data.objects.new('Icon camera', cam_data)
    bpy.context.scene.collection.objects.link(cam)
    cam.location = (0.9, -1.6, 0.85)
    direction = Vector((0, 0, 0.27)) - cam.location
    cam.rotation_euler = direction.to_track_quat('-Z', 'Y').to_euler()
    bpy.context.scene.camera = cam
    render(ICON)
    if '--render' in argv:
        bpy.context.scene.render.resolution_x, bpy.context.scene.render.resolution_y = 600, 600
        cam_data.ortho_scale = 0.7
        render(PREVIEW)
    if '--install' in argv:
        os.makedirs(os.path.dirname(PUBLIC_MODEL), exist_ok=True)
        os.makedirs(os.path.dirname(PUBLIC_ICON), exist_ok=True)
        shutil.copyfile(OUT, PUBLIC_MODEL)
        shutil.copyfile(ICON, PUBLIC_ICON)
    print(f'helper.glb {size} bytes, {tris} triangles, height {top:.3f} m')
    if failures:
        print('FAILED: ' + '; '.join(failures))
        sys.exit(1)


main()
