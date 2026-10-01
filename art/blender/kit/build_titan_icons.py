"""Render the 18 existing Titan trophy/companion models as transparent bag icons.

Run Blender -b --factory-startup --python art/blender/kit/build_titan_icons.py.
Uses the shipped GLB, so previews cannot drift from the wearable/pet models.
"""
import bpy, json, math, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import style
import build_items
from build_titans import DATA

REPO = os.path.abspath(os.path.join(HERE, '..', '..', '..'))
ICONS = os.path.join(REPO, 'public', 'assets', 'icons', 'items')
LIMIT = 18000


def main():
    style.reset_scene()
    bpy.ops.import_scene.gltf(filepath=os.path.join(REPO, 'public', 'assets', 'models', 'titans.glb'))
    meshes = [obj for obj in bpy.data.objects if obj.type == 'MESH']
    style.studio(size=(160, 160), transparent=True)
    build_items._eevee(48)
    scene = bpy.context.scene
    scene.view_settings.exposure = -.15
    scene.render.filter_size = 1.2
    scene.render.image_settings.file_format = 'WEBP'
    scene.render.image_settings.color_mode = 'RGBA'
    next(n for n in scene.world.node_tree.nodes if n.type == 'BACKGROUND').inputs['Strength'].default_value = .6
    for obj in bpy.data.objects:
        if obj.type == 'LIGHT':
            obj.data.angle = math.radians(22)
    os.makedirs(ICONS, exist_ok=True)
    entries = {}
    for prefix in ['hat_t_', 'pet_t_']:
        for key, *_ in DATA:
            iid = prefix + key
            root = bpy.data.objects[iid]
            parts = [obj for obj in [root] + list(root.children_recursive) if obj.type == 'MESH']
            assert len(parts) == 1, (iid, len(parts))
            for obj in meshes:
                obj.hide_render = obj not in parts
            cam = build_items.icon_camera(parts[0], elevation=32, yaw=24, margin=1.14)
            bpy.ops.render.render(write_still=False)
            result = bpy.data.images['Render Result']
            dest = os.path.join(ICONS, iid + '.webp')
            for quality in [88, 82, 76, 70, 64]:
                scene.render.image_settings.quality = quality
                result.save_render(dest, scene=scene)
                if os.path.getsize(dest) <= LIMIT:
                    break
            assert os.path.getsize(dest) <= LIMIT, iid
            check = bpy.data.images.load(dest)
            assert tuple(check.size) == (160, 160), iid
            alpha = check.pixels[:][3::4]
            assert min(alpha) == 0 and max(alpha) > .95, iid
            bpy.data.images.remove(check)
            bpy.data.objects.remove(cam, do_unlink=True)
            entries[iid] = {'file': 'icons/items/' + iid + '.webp', 'bytes': os.path.getsize(dest)}
    build_items.ICONS = ICONS
    build_items.contact_sheet(list(entries), os.path.join(REPO, 'art', 'previews', 'kit', 'titan-icons.webp'), cols=9)
    manifest_path = os.path.join(REPO, 'art', 'asset-manifest.json')
    with open(manifest_path, encoding='utf-8') as source:
        manifest = json.load(source)
    manifest['titan_icons'] = {'generator': 'art/blender/kit/build_titan_icons.py', 'size': [160, 160], 'assets': entries}
    with open(manifest_path, 'w', encoding='utf-8', newline='\n') as target:
        json.dump(manifest, target, ensure_ascii=False, indent=2)
        target.write('\n')
    print('TITAN_ICONS_OK', len(entries), 'icons', sum(value['bytes'] for value in entries.values()), 'bytes')


if __name__ == '__main__':
    main()
