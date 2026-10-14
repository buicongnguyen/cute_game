"""Zoo Garden elite roles (src/elite-roles.ts, src/elite-view.ts): the small extra parts an elite creature wears.

All in a unit space that fits a creature of hit radius 1 standing on the ground (the runtime scales them by the creature's
radius). Original designs in the shared chunky toy style (style.py). Each a top-level rigid object:
- `elite_barrier`  a crown of faceted hexagonal crystal plates round and over the creature (the shielded role);
- `elite_crack_1`, `elite_crack_2`, `elite_crack_3`  bright zigzag cracks on the plates, one set per cracking hit;
- `elite_cores`    two small round cores, shown inside a splitter's see-through body: the two it will become.
The runtime draws each as one instanced mesh for every elite on screen (one draw per part kind, not per creature).

Run from the repository root:

    blender -b --factory-startup --python art/blender/kit/build_elite.py -- [--install] [--render]

Outputs art/generated/kit/models/elite.glb, art/generated/kit/elite-manifest.json and (--render) art/previews/kit/elite.webp;
--install copies elite.glb to public/assets/models/. Exits non-zero when any part is over 300 triangles.
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
from style import beam, cyl, sphere, mat, join, triangles, reset_scene, studio, render  # noqa: E402
from mathutils import Vector  # noqa: E402

REPO = os.path.normpath(os.path.join(HERE, '..', '..', '..'))
GEN = os.path.join(REPO, 'art', 'generated', 'kit')
OUT = os.path.join(GEN, 'models', 'elite.glb')
MANIFEST = os.path.join(GEN, 'elite-manifest.json')
PREVIEW = os.path.join(REPO, 'art', 'previews', 'kit', 'elite.webp')
PUBLIC_MODEL = os.path.join(REPO, 'public', 'assets', 'models', 'elite.glb')
PART_BUDGET = 300

# The plates: (angle round the creature in degrees, distance out, height, tilt up from vertical in degrees, plate radius).
PLATES = [(a, 1.0, 0.42, 18, 0.3) for a in range(0, 360, 52)] + \
         [(a + 26, 0.66, 0.92, 52, 0.27) for a in range(0, 360, 90)] + [(0, 0.0, 1.16, 90, 0.24)]


def orient(obj, loc, normal, roll=0.0):
    obj.rotation_mode = 'QUATERNION'
    q = Vector(normal).normalized().to_track_quat('Z', 'Y')
    if roll:
        from mathutils import Quaternion
        q = q @ Quaternion((0, 0, 1), roll)
    obj.rotation_quaternion = q
    obj.location = loc
    return obj


def plate_frame(p):
    a, out, h, tilt, r = p
    a, t = math.radians(a), math.radians(tilt)
    normal = Vector((math.cos(a) * math.cos(t), math.sin(a) * math.cos(t), math.sin(t))) if out else Vector((0, 0, 1))
    return Vector((math.cos(a) * out, math.sin(a) * out, h)), normal, r


def build():
    crystal = mat('Elite crystal', '#8FE8FF', 0.15, 0.0, emit='#8FE8FF', emit_strength=0.4)
    crack = mat('Elite crack', '#FFFFFF', 0.2, 0.0, emit='#FFFFFF', emit_strength=1.0)
    core = mat('Elite core', '#FFE3F3', 0.2, 0.0, emit='#FF9ED2', emit_strength=0.5)
    plates = []
    for i, p in enumerate(PLATES):
        loc, normal, r = plate_frame(p)
        plates.append(orient(cyl(f'plate-{i}', r, 0.06, (0, 0, 0), crystal, verts=6, bev=0, seg=1), loc, normal, roll=0.3 * i))
    barrier = join(plates, 'elite_barrier')
    # Cracks: per level a zigzag of two thin bars on a few plates, just outside the plate's face.
    levels = [[0, 3, 8], [1, 5, 9, 11], [2, 4, 6, 10]]
    cracks = []
    for level, ids in enumerate(levels, start=1):
        bars = []
        for k, i in enumerate(ids):
            loc, normal, r = plate_frame(PLATES[i])
            base = loc + normal * 0.045
            side = normal.cross(Vector((0, 0, 1))) if PLATES[i][1] else Vector((1, 0, 0))
            side = side.normalized() if side.length > 1e-6 else Vector((1, 0, 0))
            up = normal.cross(side).normalized()
            flip = -1 if k % 2 else 1
            zig = [(-0.75, 0.12), (-0.25, -0.18), (0.2, 0.16), (0.72, -0.08)]
            pts = [base + side * (x * r) + up * (y * r * flip) for x, y in zig]
            for j in range(len(pts) - 1):
                bars.append(beam(f'crack-{level}-{k}-{j}', pts[j], pts[j + 1], 0.03, crack, bev=0))
        cracks.append(join(bars, f'elite_crack_{level}'))
    cores = join([sphere('core-a', 0.25, (-0.2, 0.02, 0.45), core, segs=10, rings=7), sphere('core-b', 0.22, (0.21, -0.03, 0.52), core, segs=10, rings=7)], 'elite_cores')
    return [barrier, *cracks, cores]


def main():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    reset_scene()
    objs = build()
    parts = {o.name: triangles(o) for o in objs}
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', use_selection=True, export_yup=True, export_apply=True,
                              export_materials='EXPORT', export_extras=False, export_cameras=False, export_lights=False,
                              export_animations=False, export_texcoords=False, export_normals=True)
    size = os.path.getsize(OUT)
    with open(MANIFEST, 'w') as f:
        json.dump(dict(elite=dict(triangles=sum(parts.values()), bytes=size, models=[o.name for o in objs], parts=parts)), f, indent=2)
    if '--render' in argv:
        studio(transparent=False, size=(600, 600))
        cam_data = bpy.data.cameras.new('Preview camera')
        cam_data.type = 'ORTHO'
        cam_data.ortho_scale = 3.2
        cam = bpy.data.objects.new('Preview camera', cam_data)
        bpy.context.scene.collection.objects.link(cam)
        cam.location = (2.4, -4.2, 3.4)
        cam.rotation_euler = (Vector((0, 0, 0.6)) - cam.location).to_track_quat('-Z', 'Y').to_euler()
        bpy.context.scene.camera = cam
        render(PREVIEW)
    if '--install' in argv:
        os.makedirs(os.path.dirname(PUBLIC_MODEL), exist_ok=True)
        shutil.copyfile(OUT, PUBLIC_MODEL)
    print(f'elite.glb {size} bytes, parts {parts}')
    over = {k: v for k, v in parts.items() if v > PART_BUDGET}
    if over:
        print(f'FAILED: over {PART_BUDGET} triangles: {over}')
        sys.exit(1)


main()
