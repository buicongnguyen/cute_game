"""The bag icon of the guard dog as a pet (item `pet_dog`, src/pet-slots.ts).

It is the pen's own puppy (build_farm_dog.py, exported in public/assets/models/farm.glb), photographed in the item
icons' studio (build_farm.py render_icons), so the bag shows the very dog that walks out with you.

    blender -b --factory-startup --python art/blender/kit/build_dog_pet_icon.py -- [--install]

Writes art/generated/kit/icons/items/pet_dog.webp (160 x 160, transparent, <= 8 KB); --install copies it to
public/assets/icons/items/.
"""
import math
import os
import shutil
import sys

import bpy
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)
import style  # noqa: E402
import build_items  # noqa: E402

REPO = os.path.normpath(os.path.join(HERE, '..', '..', '..'))
GLB = os.path.join(REPO, 'public', 'assets', 'models', 'farm.glb')
ICONS = os.path.join(REPO, 'art', 'generated', 'kit', 'icons', 'items')
PUBLIC_ICONS = os.path.join(REPO, 'public', 'assets', 'icons', 'items')
ICON_SIZE, ICON_LIMIT = 160, 8 * 1024
VIEW = dict(elevation=14, yaw=32, margin=1.12)


def body_of(dog):
    """icon_camera aims at one mesh: any part will do, frame() then fits the whole puppy."""
    return next(o for o in dog.children_recursive if o.type == 'MESH')


def frame(cam, objects):
    """Centres the orthographic icon camera on every part of the puppy and fits it with the margin."""
    bpy.context.view_layer.update()
    inv = cam.matrix_world.inverted()
    pts = [inv @ (o.matrix_world @ v.co) for o in objects if o.type == 'MESH' for v in o.data.vertices]
    x0, x1 = min(p.x for p in pts), max(p.x for p in pts)
    y0, y1 = min(p.y for p in pts), max(p.y for p in pts)
    basis = cam.matrix_world.to_3x3()
    cam.location = cam.location + basis @ Vector(((x0 + x1) / 2, (y0 + y1) / 2, 0))
    cam.data.ortho_scale = max(x1 - x0, y1 - y0) * VIEW['margin']


def main():
    style.reset_scene()
    bpy.ops.import_scene.gltf(filepath=GLB)
    dog = bpy.data.objects.get('dog')
    if dog is None:
        raise SystemExit('farm.glb has no `dog`')
    keep = {dog, *dog.children_recursive}
    for o in list(bpy.data.objects):
        if o not in keep:
            bpy.data.objects.remove(o, do_unlink=True)
    dog.parent = None
    dog.location = (0, 0, 0)
    style.studio(size=(ICON_SIZE, ICON_SIZE), transparent=True)
    build_items._eevee(48)
    scene = bpy.context.scene
    bg = next(n for n in scene.world.node_tree.nodes if n.type == 'BACKGROUND')
    bg.inputs['Strength'].default_value = 0.6
    scene.view_settings.exposure = -0.15
    for light in bpy.data.objects:
        if light.type == 'LIGHT':
            light.data.angle = math.radians(22)
    scene.render.filter_size = 1.2
    scene.render.image_settings.file_format = 'WEBP'
    scene.render.image_settings.color_mode = 'RGBA'
    os.makedirs(ICONS, exist_ok=True)
    frame(build_items.icon_camera(body_of(dog), VIEW['elevation'], VIEW['yaw'], VIEW['margin']), keep)
    bpy.ops.render.render(write_still=False)
    result = bpy.data.images['Render Result']
    path = os.path.join(ICONS, 'pet_dog.webp')
    for quality in (88, 82, 76, 70, 64):
        scene.render.image_settings.quality = quality
        result.save_render(path, scene=scene)
        if os.path.getsize(path) <= ICON_LIMIT:
            break
    print(f'pet_dog.webp: {os.path.getsize(path)} bytes at quality {quality}')
    if os.path.getsize(path) > ICON_LIMIT:
        raise SystemExit('pet_dog.webp is over the icon limit')
    if '--install' in sys.argv:
        shutil.copyfile(path, os.path.join(PUBLIC_ICONS, 'pet_dog.webp'))
        print('installed')


if __name__ == '__main__':
    main()
