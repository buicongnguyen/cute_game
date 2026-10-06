"""The Cinderpeak Colossus: an original stone-and-lava giant, its horn crown and its pebble-sized companion.

Run: blender -b --factory-startup --python art/blender/kit/build_colossus.py

Outputs
  public/assets/models/colossus.glb   roots `colossus`, `hat_colossus`, `pet_colossus`
  public/assets/icons/items/{hat_colossus,pet_colossus,colossus_shard}.webp   256x256 transparent bag icons
  art/generated/kit/colossus-manifest.json, art/previews/kit/colossus.webp

The giant keeps a pose hierarchy (src/colossus-art.ts poses it): empties at the joints, each carrying one mesh.
  colossus
    colossus_leg_l / colossus_leg_r   (hips; the leg and foot hang from them)
    colossus_body                     (pelvis; torso, shoulders, back spikes)
      colossus_head                   (neck; head, jaw, horns, eyes)
      colossus_arm_l / colossus_arm_r (shoulders; arm and fist)
Ground origin, Blender Z up / front -Y (glTF Y up / front +Z). Feet stand 8.5 m left and right of the body (the roar's
safe spots), the whole giant is about 17 m tall and under 25,000 triangles. No reference meshes or textures are used.
"""
import bpy, bmesh, math, os, sys, json, random
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import style

R = os.path.abspath(os.path.join(HERE, '..', '..', '..'))
OUT = os.path.join(R, 'public', 'assets', 'models', 'colossus.glb')
ICONS = os.path.join(R, 'public', 'assets', 'icons', 'items')
FOOT_X = 8.5
BUDGET = 25000
ICON_SIZE = 256
ICON_LIMIT = 30000

M = {}


def materials():
    M['basalt'] = style.mat('Colossus basalt', '#5e4848', rough=.92)
    M['rock'] = style.mat('Colossus rock', '#9a745c', rough=.85)
    M['dark'] = style.mat('Colossus obsidian', '#2a2131', rough=.3, metal=.1)
    M['lava'] = style.mat('Colossus lava', '#ff7a1e', rough=.4, emit='#ff6a10', emit_strength=4.0)
    M['ember'] = style.mat('Colossus ember', '#ffe27a', rough=.3, emit='#ffe066', emit_strength=8.0)
    M['horn'] = style.mat('Colossus horn', '#efd9ae', rough=.5)


def rock(name, r, loc, mat='basalt', scale=(1, 1, 1), sub=2, wobble=.14, seed=1, rot=(0, 0, 0)):
    """A faceted boulder: an icosphere pushed about a little, flat shaded so the facets read as cut stone."""
    rng = random.Random(seed)
    o = style.ico(name, r, loc, M[mat], subdiv=sub, scale=scale, rot=rot, smooth_shading=False)
    for v in o.data.vertices:
        n = v.co.normalized()
        v.co += n * r * wobble * (rng.random() - .5) * 2
    return o


def limb(name, a, b, r0, r1, mat='basalt', sides=7):
    """A tapered stone column from a to b."""
    a, b = Vector(a), Vector(b)
    o = style.cyl(name, r0, (b - a).length, (a + b) / 2, M[mat], verts=sides, bev=0, radius_top=r1)
    o.rotation_euler = (b - a).to_track_quat('Z', 'Y').to_euler()
    for p in o.data.polygons:
        p.use_smooth = False
    return o


def seam(name, a, b, width, depth=.18):
    """A glowing lava crack laid along the surface between a and b."""
    a, b = Vector(a), Vector(b)
    o = style.box(name, (width, depth, (b - a).length), (a + b) / 2, M['lava'], bev=0)
    o.rotation_euler = (b - a).to_track_quat('Z', 'Y').to_euler()
    return o


def crack(name, a, b, width=.26, steps=4, jitter=.32, seed=1):
    """A jagged lava crack: short glowing segments zig-zagging from a to b, each a little narrower."""
    rng = random.Random(seed)
    a, b = Vector(a), Vector(b)
    pts = [a]
    side = (b - a).cross(Vector((0, 1, 0)))
    side = side.normalized() if side.length > 1e-6 else Vector((1, 0, 0))
    for i in range(1, steps):
        pts.append(a.lerp(b, i / steps) + side * (rng.random() - .5) * 2 * jitter)
    pts.append(b)
    return [seam(name, pts[i], pts[i + 1], width * (1 - .12 * i)) for i in range(steps)]


def spike(name, base, tip, r, mat='dark'):
    base, tip = Vector(base), Vector(tip)
    o = style.cone(name, r, (tip - base).length, (base + tip) / 2, M[mat], verts=5)
    o.rotation_euler = (tip - base).to_track_quat('Z', 'Y').to_euler()
    for p in o.data.polygons:
        p.use_smooth = False
    return o


def empty(name, loc, parent=None):
    o = bpy.data.objects.new(name, None)
    bpy.context.collection.objects.link(o)
    o.location = loc
    if parent is not None:
        o.parent = parent
    return o


def attach(pieces, name, pivot_empty, pivot_world):
    """Join `pieces` and hang the mesh from `pivot_empty`, keeping it where it was built."""
    obj = style.join(pieces, name)
    for v in obj.data.vertices:
        v.co -= Vector(pivot_world)
    obj.parent = pivot_empty
    obj.location = (0, 0, 0)
    return obj


# ---------------------------------------------------------------- the giant
HIP = {1: (3.7, .3, 7.0), -1: (-3.7, .3, 7.0)}
PELVIS = (0, .3, 7.2)
NECK = (0, -.9, 13.6)
SHOULDER = {1: (5.7, 0, 12.4), -1: (-5.7, 0, 12.4)}


def leg(side, seed):
    s = side
    knee = (s * 6.9, -.7, 4.6)
    ankle = (s * FOOT_X, -.2, 1.5)
    p = [
        limb('thigh', HIP[s], knee, 1.55, 1.25),
        rock('thigh plate', 1.5, ((HIP[s][0] + knee[0]) / 2, -.5, 5.9), 'rock', (1.05, 1.0, 1.25), seed=seed + 1),
        rock('knee', 1.35, knee, 'basalt', (1.1, 1.05, 1.0), seed=seed + 2),
        limb('shin', knee, ankle, 1.2, 1.35),
        rock('foot', 1.0, (s * FOOT_X, -.6, .78), 'basalt', (2.0, 2.5, .95), seed=seed + 3),
        rock('heel', .9, (s * FOOT_X, .9, .7), 'rock', (1.3, 1.0, .8), sub=1, seed=seed + 4),
    ]
    p += crack('shin crack', (s * 7.35, -1.95, 4.1), (s * 8.15, -1.5, 1.9), .26, steps=3, seed=seed + 7)
    p += crack('thigh crack', (s * 4.5, -1.5, 6.7), (s * 6.3, -1.75, 5.0), .26, steps=3, seed=seed + 8)
    for i, dx in enumerate((-1.1, 0, 1.1)):
        p.append(rock('toe', .62, (s * FOOT_X + dx, -2.75, .5), 'rock', (1.0, 1.15, .8), sub=1, seed=seed + 10 + i))
        p.append(spike('toe claw', (s * FOOT_X + dx, -3.2, .5), (s * FOOT_X + dx * 1.1, -3.95, .25), .28, 'dark'))
    return p


def body():
    p = [
        rock('pelvis', 1.0, PELVIS, 'basalt', (3.4, 2.3, 1.7), seed=21),
        rock('belly', 1.0, (0, -.4, 9.0), 'basalt', (3.7, 2.7, 2.2), seed=22),
        rock('chest', 1.0, (0, -.2, 11.2), 'basalt', (4.9, 3.1, 2.6), seed=23),
        rock('chest plate l', 1.0, (1.9, -2.2, 11.4), 'rock', (2.1, .9, 1.7), seed=24),
        rock('chest plate r', 1.0, (-1.9, -2.2, 11.4), 'rock', (2.1, .9, 1.7), seed=25),
        rock('back', 1.0, (0, 1.6, 11.4), 'rock', (4.0, 1.8, 2.4), seed=26),
        # The molten heart glows through a split in the belly, cracks spreading from it like a star.
        style.ico('lava heart', 1.0, (0, -2.7, 9.3), M['lava'], subdiv=2, scale=(1.05, .5, 1.25)),
        style.ico('heart core', .55, (0, -3.05, 9.3), M['ember'], subdiv=2, scale=(1.0, .5, 1.2)),
    ]
    for i, (dx, dz) in enumerate(((2.6, 2.2), (-2.6, 2.2), (2.3, -1.5), (-2.3, -1.6), (.5, 3.4))):
        p += crack('heart crack', (dx * .3, -3.0, 9.3 + dz * .3), (dx, -2.55 + abs(dx) * .1, 9.3 + dz), .3, seed=50 + i)
    for s in (1, -1):
        p += crack('plate crack', (s * .9, -3.05, 11.9), (s * 3.2, -2.2, 12.6), .22, steps=3, seed=60 + s)
        p.append(spike('shoulder glow', (s * 5.9, 1.2, 15.0), (s * 6.65, 1.7, 16.2), .3, 'lava'))
    for s in (1, -1):
        p.append(rock('shoulder', 1.85, (s * 5.0, .1, 12.6), 'rock', (1.1, 1.0, 1.0), seed=30 + s))
        p.append(rock('collar', 1.2, (s * 2.6, -.6, 13.2), 'basalt', (1.4, 1.0, .8), sub=1, seed=33 + s))
    rng = random.Random(7)
    for i in range(9):
        a = -1.1 + i * .275
        x, z = math.sin(a) * 4.2, 11.3 + math.cos(a) * 2.4
        tip = (x * 1.25, 3.9 + rng.random() * .6, z + 1.9 + rng.random() * .9)
        p.append(spike('back crystal', (x, 1.8, z), tip, .7 + rng.random() * .25))
        p.append(spike('crystal glow', (x * 1.02, 2.0, z + .1), (tip[0] * .98, tip[1] - .55, tip[2] - .5), .32, 'lava'))
    for s in (1, -1):
        p.append(spike('shoulder crystal', (s * 5.4, .6, 13.9), (s * 6.8, 1.8, 16.0), .75))
        p.append(spike('shoulder crystal', (s * 4.6, 1.2, 13.6), (s * 5.2, 2.6, 15.6), .55))
    return p


def head():
    p = [
        rock('skull', 1.0, (0, -2.1, 14.9), 'basalt', (1.95, 2.05, 1.55), seed=41),
        rock('brow', 1.0, (0, -3.55, 15.45), 'rock', (2.05, .85, .6), seed=42),
        rock('jaw', 1.0, (0, -3.0, 13.75), 'rock', (1.55, 1.55, .72), seed=43),
        rock('cheek l', .7, (1.45, -3.2, 14.6), 'basalt', (1.0, 1.0, .9), sub=1, seed=44),
        rock('cheek r', .7, (-1.45, -3.2, 14.6), 'basalt', (1.0, 1.0, .9), sub=1, seed=45),
        # A glowing mouth slit and burning eyes under the brow.
        style.box('mouth', (2.1, .3, .26), (0, -4.25, 14.1), M['lava'], bev=0),
        style.ico('eye l', .34, (.78, -4.0, 15.05), M['ember'], subdiv=2, scale=(1.25, .6, .8)),
        style.ico('eye r', .34, (-.78, -4.0, 15.05), M['ember'], subdiv=2, scale=(1.25, .6, .8)),
    ]
    p += crack('forehead crack', (0, -3.95, 15.65), (.3, -3.1, 16.55), .2, steps=3, seed=48)
    for s in (1, -1):
        # Two great curved horns: three tapering segments sweeping out, up and back.
        pts = [(s * 1.25, -2.4, 15.9), (s * 2.35, -2.0, 16.75), (s * 3.05, -1.25, 17.75), (s * 3.15, -.25, 18.75)]
        for i in range(3):
            p.append(limb('horn', pts[i], pts[i + 1], .62 - i * .17, .45 - i * .15 if i < 2 else .05, 'horn', 7))
        for i in range(3):
            p.append(spike('jaw tusk', (s * (.45 + i * .38), -3.85, 13.7), (s * (.5 + i * .42), -4.25, 14.45 - i * .1), .16, 'horn'))
    return p


def arm(side, seed):
    s = side
    elbow, wrist = (s * 7.3, -.9, 8.6), (s * 7.6, -1.9, 4.5)
    fist = (s * 7.65, -2.25, 3.0)
    p = [
        limb('upper arm', SHOULDER[s], elbow, 1.25, 1.05),
        rock('elbow', 1.15, elbow, 'rock', (1.0, 1.0, 1.0), sub=1, seed=seed),
        limb('forearm', elbow, wrist, 1.15, 1.35),
        rock('fist', 1.0, fist, 'basalt', (1.65, 1.75, 1.55), seed=seed + 1),
    ]
    p += crack('forearm crack', (s * 8.1, -2.2, 7.9), (s * 8.3, -2.75, 5.0), .26, seed=seed + 8)
    p += crack('upper arm crack', (s * 6.3, -1.3, 11.6), (s * 7.2, -1.95, 9.2), .24, steps=3, seed=seed + 9)
    p.append(style.ico('fist glow', .5, (s * 7.65, -3.85, 3.3), M['lava'], subdiv=1, scale=(1.6, .35, .5)))
    for i, dx in enumerate((-.85, 0, .85)):
        p.append(rock('knuckle', .55, (s * 7.65 + dx, -3.6, 2.6), 'rock', (1.0, .9, 1.0), sub=1, seed=seed + 5 + i))
    p.append(spike('forearm crystal', (s * 8.4, -.9, 7.3), (s * 9.9, -.3, 8.4), .55))
    return p


def build_giant():
    root = empty('colossus', (0, 0, 0))
    out = {}
    for s, n in ((1, 'l'), (-1, 'r')):
        e = empty(f'colossus_leg_{n}', HIP[s], root)
        out[e.name] = attach(leg(s, 100 if s > 0 else 200), f'colossus_leg_{n}_mesh', e, HIP[s])
        # Soles sit flat on the ground.
        for v in out[e.name].data.vertices:
            v.co.z = max(v.co.z, -HIP[s][2])
    b = empty('colossus_body', PELVIS, root)
    out[b.name] = attach(body(), 'colossus_body_mesh', b, PELVIS)
    h = empty('colossus_head', tuple(Vector(NECK) - Vector(PELVIS)), b)
    out[h.name] = attach(head(), 'colossus_head_mesh', h, NECK)
    for s, n in ((1, 'l'), (-1, 'r')):
        e = empty(f'colossus_arm_{n}', tuple(Vector(SHOULDER[s]) - Vector(PELVIS)), b)
        out[e.name] = attach(arm(s, 300 if s > 0 else 400), f'colossus_arm_{n}_mesh', e, SHOULDER[s])
    return root, out


# ---------------------------------------------------------------- trophies
def build_hat():
    """A stone circlet with lava gems and two horns, worn at the explorer's head (hero space, z 2.03-2.48)."""
    p = [style.torus('circlet', .3, .07, (0, 0, 2.08), M['basalt'], major_segs=14, minor_segs=6)]
    for i in range(5):
        a = i * math.tau / 5 + math.pi / 2
        p.append(style.ico('gem', .055, (math.cos(a) * .3, math.sin(a) * .3 - .02, 2.1), M['lava'], subdiv=1))
    for s in (1, -1):
        pts = [(s * .2, -.05, 2.1), (s * .33, -.02, 2.24), (s * .4, .06, 2.38), (s * .38, .14, 2.47)]
        for i in range(3):
            p.append(limb('horn', pts[i], pts[i + 1], .075 - i * .02, .055 - i * .02 if i < 2 else .008, 'horn', 7))
    obj = style.join(p, 'hat_colossus@head')
    root = empty('hat_colossus', (0, 0, 0))
    obj.parent = root
    return root, obj


def build_pet(giant_meshes):
    """The companion: a joined copy of the giant shrunk to 0.7 m."""
    copies = []
    for mesh in giant_meshes.values():
        c = mesh.copy(); c.data = mesh.data.copy(); bpy.context.collection.objects.link(c)
        c.parent = None; c.matrix_world = mesh.matrix_world.copy(); copies.append(c)
    obj = style.join(copies, 'pet_colossus_body')
    # A 0.7 m companion needs far fewer facets than the 17 m giant.
    dec = obj.modifiers.new('fewer facets', 'DECIMATE'); dec.ratio = .45
    bpy.ops.object.select_all(action='DESELECT'); obj.select_set(True); bpy.context.view_layer.objects.active = obj
    bpy.ops.object.modifier_apply(modifier=dec.name)
    bpy.context.view_layer.update()
    pts = [obj.matrix_world @ v.co for v in obj.data.vertices]
    low = [min(q[i] for q in pts) for i in range(3)]; high = [max(q[i] for q in pts) for i in range(3)]
    k = .7 / (high[2] - low[2]); cx, cy = (low[0] + high[0]) / 2, (low[1] + high[1]) / 2
    for v in obj.data.vertices:
        q = obj.matrix_world @ v.co
        v.co = ((q.x - cx) * k, (q.y - cy) * k, (q.z - low[2]) * k)
    obj.location = (0, 0, 0); obj.rotation_euler = (0, 0, 0); obj.scale = (1, 1, 1)
    root = empty('pet_colossus', (0, 0, 0))
    obj.parent = root
    return root, obj


def build_shard():
    """Icon-only: a cluster of obsidian with a glowing core (the heartstone material)."""
    p = [style.ico('core', .5, (0, 0, .5), M['lava'], subdiv=2, scale=(1, 1, 1.15))]
    for i in range(6):
        a = i * math.tau / 6
        p.append(spike('shard', (math.cos(a) * .25, math.sin(a) * .25, .2), (math.cos(a) * .85, math.sin(a) * .85, .95 + (i % 2) * .35), .28))
    p.append(spike('shard', (0, 0, .5), (0, .1, 1.6), .32))
    return style.join(p, 'colossus_shard_icon')


def tris(obj):
    obj.data.calc_loop_triangles()
    return len(obj.data.loop_triangles)


def bounds(objs):
    bpy.context.view_layer.update()
    pts = [o.matrix_world @ v.co for o in objs for v in o.data.vertices]
    return [[round(min(q[i] for q in pts), 3) for i in range(3)], [round(max(q[i] for q in pts), 3) for i in range(3)]]


def render_icons(entries):
    import build_items
    style.studio(size=(ICON_SIZE, ICON_SIZE), transparent=True)
    build_items._eevee(48)
    scene = bpy.context.scene
    scene.view_settings.exposure = -.1
    scene.render.image_settings.file_format = 'WEBP'
    scene.render.image_settings.color_mode = 'RGBA'
    next(n for n in scene.world.node_tree.nodes if n.type == 'BACKGROUND').inputs['Strength'].default_value = .6
    meshes = [o for o in bpy.data.objects if o.type == 'MESH']
    os.makedirs(ICONS, exist_ok=True)
    out = {}
    for iid, obj, elev, yaw in entries:
        for o in meshes:
            o.hide_render = o is not obj
        cam = build_items.icon_camera(obj, elevation=elev, yaw=yaw, margin=1.12)
        bpy.ops.render.render(write_still=False)
        dest = os.path.join(ICONS, iid + '.webp')
        for quality in (90, 84, 78, 70, 62):
            scene.render.image_settings.quality = quality
            bpy.data.images['Render Result'].save_render(dest, scene=scene)
            if os.path.getsize(dest) <= ICON_LIMIT:
                break
        check = bpy.data.images.load(dest)
        assert tuple(check.size) == (ICON_SIZE, ICON_SIZE), iid
        alpha = check.pixels[:][3::4]
        assert min(alpha) == 0 and max(alpha) > .95, iid
        bpy.data.images.remove(check)
        bpy.data.objects.remove(cam, do_unlink=True)
        out[iid] = {'file': 'icons/items/' + iid + '.webp', 'bytes': os.path.getsize(dest)}
    for o in meshes:
        o.hide_render = False
    return out


def main():
    style.reset_scene()
    materials()
    root, parts = build_giant()
    hat_root, hat = build_hat()
    pet_root, pet = build_pet(parts)
    giant_tris = sum(tris(o) for o in parts.values())
    assert giant_tris < BUDGET, giant_tris
    giant_bounds = bounds(list(parts.values()))
    assert giant_bounds[0][2] > -.05 and 15 < giant_bounds[1][2] < 20, giant_bounds
    hat_bounds = bounds([hat])
    assert hat_bounds[0][2] >= 2.0 and hat_bounds[1][2] <= 2.5, hat_bounds
    objects = [o for r in (root, hat_root, pet_root) for o in [r] + list(r.children_recursive)]
    size = style.export_glb(objects, OUT)
    assert size < 1_500_000, size
    shard = build_shard()
    icons = render_icons([('hat_colossus', hat, 30, 20), ('pet_colossus', pet, 22, 28), ('colossus_shard', shard, 26, 18)])
    bpy.data.objects.remove(shard, do_unlink=True)
    manifest = {
        'file': 'public/assets/models/colossus.glb', 'bytes': size, 'triangles': giant_tris, 'bounds': giant_bounds,
        'parts': {name: {'triangles': tris(o), 'pivot': [round(v, 3) for v in o.parent.matrix_world.translation]} for name, o in parts.items()},
        'hat': {'triangles': tris(hat), 'bounds': hat_bounds}, 'pet': {'triangles': tris(pet), 'bounds': bounds([pet])}, 'icons': icons,
    }
    path = os.path.join(R, 'art', 'generated', 'kit', 'colossus-manifest.json')
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'w', encoding='utf-8', newline='\n') as f:
        json.dump(manifest, f, indent=2)
        f.write('\n')
    # Preview: the giant beside an explorer-sized post, lit like the kit sheets.
    import build_creatures as presentation
    hat_root.hide_render = True; hat.hide_render = True; pet_root.hide_render = True; pet.hide_render = True
    presentation.stage((1400, 1200), ground='#b9774f')
    post = style.cyl('explorer scale post', .35, 1.95, (-4, -9, .975), style.mat('Scale post', '#5ad1ff'), verts=10, bev=0)
    presentation.camera(18, 32, (0, 0, 8.5), 30, distance=80)
    style.render(os.path.join(R, 'art', 'previews', 'kit', 'colossus.webp'))
    bpy.data.objects.remove(post, do_unlink=True)
    print('COLOSSUS_OK', giant_tris, 'triangles', size, 'bytes', json.dumps(icons))


if __name__ == '__main__':
    main()
