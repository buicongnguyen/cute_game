"""A large forest hawk adapted from the user's 3d_astra ambient bird.

Reuse source: ../3d_astra/github-io/src/ambient-life.js, birdGeometry() and
BIRDS.hawk. The source's shoulder/elbow/tip and tail coordinates are retained
below, enlarged and given closed volumes, a readable face and rigid wing hinges.
No dependency on the other checkout is needed to reproduce this asset.

blender -b --factory-startup --python-exit-code 1 --python
    art/blender/kit/build_forest_birds.py -- --install --render

Blender Z up, -Y forward; GLB Y up, +Z forward. Root forest_raptor, four rigid
parts body/head/wing_l/wing_r. Creature-art bakes their palette to four draws.
"""
import bpy
import json
import math
import os
import shutil
import sys
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from style import mat, reset_scene, export_glb, render, studio, game_camera
from build_weapons import Geo, Piece, sphere, tube, cone, slab, leaf_outline, xf, triangulate, ell_point, add_eye, new_empty

REPO = os.path.normpath(os.path.join(HERE, '..', '..', '..'))
NAME = 'forest_raptor'
FILE = 'forest-birds.glb'
PARTS = ('body', 'head', 'wing_l', 'wing_r')
PIVOTS = {'body': (0, 0, 1.05), 'head': (0, -.48, 1.32),
          'wing_l': (-.22, 0, 1.16), 'wing_r': (.22, 0, 1.16)}
# Actual source vertices: Three coordinates x, y-up, z-forward. These are the
# five vertices of birdGeometry's three right-wing triangles, in boundary order.
SOURCE_WING = [(0.05, 0, 0.12), (0.32, 0, 0.08), (0.64, 0, -0.16),
               (0.30, 0, -0.12), (0.05, 0, -0.12)]
SOURCE_TAIL = [(0, .02, -.28), (-.12, 0, -.46), (.12, 0, -.46)]
SOURCE_TRIANGLES = [(0, 4, 3), (0, 3, 1), (1, 3, 2)]


def palette():
    colors = dict(body='#94704a', wing='#6f5232', tip='#2e241a',
                  cream='#F4DFAD', gold='#F5B21E', eye='#202535', white='#FFFDF6')
    out = {k: mat('Forest raptor ' + k, v, .52 if k != 'eye' else .25) for k, v in colors.items()}
    for m in out.values():
        m.use_backface_culling = True
    return out


def ell(piece, center, radii, material, segs=12, rings=7):
    piece.add(sphere(1, segs, rings, scale=radii).moved(center), material)


def wing_shell():
    top = [Vector((x * 3.2, -z * 3.2, 1.16 + x * .1)) for x, y, z in SOURCE_WING]
    bottom = [v - Vector((0, 0, .09)) for v in top]
    faces = [tuple(reversed(f)) for f in SOURCE_TRIANGLES]
    faces += [tuple(i + 5 for i in f) for f in SOURCE_TRIANGLES]
    faces += [(i, i + 5, (i + 1) % 5 + 5, (i + 1) % 5) for i in range(5)]
    tags = [0, 0, 1, 0, 0, 1] + [0, 1, 1, 0, 0]
    return Geo(top + bottom, faces, tags).outward()


def build():
    m = palette()
    pieces = {role: Piece(NAME + '_' + role) for role in PARTS}
    body, head = pieces['body'], pieces['head']
    ell(body, (0, .03, 1.04), (.36, .61, .36), m['body'])
    ell(body, (0, -.36, 1.05), (.28, .23, .28), m['cream'], 10, 6)
    # Extend the source's narrow rear body into its tail fan; the overlap avoids
    # a detached tail when the rounded torso is viewed from the side.
    body.add(cone((0, .42, 1.05), (0, 1.088, 1.02), .24, sides=8), m['body'])
    # The source triangular tail fan, thickened; split cream tip feathers make
    # its direction readable during a dive without adding another animated part.
    outline = [(x * 3.2, -z * 3.2) for x, y, z in SOURCE_TAIL]
    body.add(slab(outline, .08, bev=.02), m['tip'], xf(loc=(0, 0, .99)))
    for side in (-1, 1):
        body.add(slab(leaf_outline(.62, .24, 3), .07, bev=.012), m['body'],
                 xf(loc=(side * .1, .69, 1.02), rot=(0, 0, -side * .23)))
        # Tucked legs and three curled talons. They move with the body.
        body.add(tube([(side * .19, .06, .85), (side * .21, -.04, .63)],
                      [.065, .045], sides=5, cap=0), m['gold'])
        for toe in (-1, 0, 1):
            body.add(tube([(side * .21, -.04, .64), (side * .21 + toe * .065, -.2, .57),
                           (side * .21 + toe * .07, -.23, .61)], [.035, .025, .009], sides=4, cap=0), m['tip'])
    center, radii = (0, -.51, 1.4), (.32, .31, .29)
    ell(head, center, radii, m['cream'])
    # Swept crown feathers keep the face a forest hawk rather than a farm hen.
    for side in (-1, 1):
        head.add(cone((side * .16, -.36, 1.6), (side * .26, -.09, 1.62), .12, sides=6), m['body'])
        pos, normal = ell_point(center, radii, (side * .63, -.78, .16))
        add_eye(head, pos, normal, .078, m['eye'], m['white'], segs=8, squash=1.15)
        head.add(tube([(side * .08, -.765, 1.51), (side * .22, -.696, 1.57)],
                      [.035, .055], sides=5, cap=0), m['body'])
    beak = Geo([(-.1, -.75, 1.41), (.1, -.75, 1.41), (-.075, -.75, 1.3), (.075, -.75, 1.3),
                (0, -.99, 1.34), (0, -.91, 1.2)],
               [(0, 1, 4), (0, 4, 5, 2), (1, 3, 5, 4), (2, 5, 3), (0, 2, 3, 1)]).outward()
    head.add(beak, m['gold'])
    for role, side in [('wing_l', -1), ('wing_r', 1)]:
        wing = pieces[role]
        shell = wing_shell()
        wing.add(shell.mirrored() if side < 0 else shell, {0: m['wing'], 1: m['tip']})
        # Rounded shoulder/coverts overlap the body at the hinge throughout the
        # ±0.85 rad flap. The source elbow-to-tip triangle remains the main wing.
        ell(wing, (side * .58, .03, 1.17), (.49, .27, .10), m['body'], 10, 5)
        for i in range(3):
            geo = slab(leaf_outline(.53 + i * .035, .19, 3), .065, bev=.01)
            geo = geo.transformed(xf(loc=(1.05 + i * .25, .29 + i * .04, 1.17), rot=(0, 0, -.52 - i * .12)))
            wing.add(geo.mirrored() if side < 0 else geo, m['tip'] if i != 0 else m['body'])
    root = new_empty(NAME, .3)
    parts = {}
    for role, piece in pieces.items():
        obj = triangulate(piece.build(offset=PIVOTS[role]))
        obj.parent = root
        obj.location = PIVOTS[role]
        parts[role] = obj
    return root, parts


def stats(root, parts):
    bpy.context.view_layer.update()
    vertices = [o.matrix_world @ v.co for o in parts.values() for v in o.data.vertices]
    low = [min(v[i] for v in vertices) for i in range(3)]
    high = [max(v[i] for v in vertices) for i in range(3)]
    result = {role: dict(triangles=len(obj.data.polygons), pivot_gltf=[obj.location.x, obj.location.z, -obj.location.y],
                         materials=[m.name for m in obj.data.materials]) for role, obj in parts.items()}
    triangles = sum(v['triangles'] for v in result.values())
    assert triangles <= 1500, triangles
    return dict(triangles=triangles, parts=result, bounds_blender=dict(min=low, max=high),
                size_gltf=[high[0] - low[0], high[2] - low[2], high[1] - low[1]],
                recommended_body_radius=.72, recommended_scale=1, flap_axis_gltf='z', flap_range_radians=[-.85, .85])


def preview(root, parts):
    studio(size=(1400, 900), ground_color='#6FA951')
    cam = game_camera(target=(0, .12, 1), ortho_scale=5.6)
    cam.location.x = 2.7
    cam.rotation_euler = (Vector((0, .12, 1)) - cam.location).to_track_quat('-Z', 'Y').to_euler()
    path = os.path.join(REPO, 'art', 'previews', 'kit')
    render(os.path.join(path, 'forest-birds.webp'))
    parts['wing_l'].rotation_euler.y = -.65
    parts['wing_r'].rotation_euler.y = .65
    render(os.path.join(path, 'forest-birds-flap.webp'))


def main():
    args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    assert all(a in ('--install', '--render') for a in args), args
    reset_scene()
    root, parts = build()
    data = stats(root, parts)
    path = os.path.join(REPO, 'art', 'generated', 'kit', 'models', FILE)
    data['bytes'] = export_glb([root] + list(parts.values()), path)
    assert data['bytes'] < 100 * 1024, data['bytes']
    data['generator'] = 'art/blender/kit/build_forest_birds.py'
    data['source'] = dict(project='3d_astra', path='github-io/src/ambient-life.js', function='birdGeometry',
                          sha256='3642e5daeca3d48b68351098171bc60f275be0d83df8fa5ada1abcc0edafb179',
                          reused='Wing shoulder/elbow/tip topology, tail fan, hawk palette; enlarged with closed volumes and a new face.')
    data['file'] = 'public/assets/models/' + FILE
    data['root'] = NAME
    data['runtime_parts'] = list(PARTS)
    data['textures'] = 0
    data['animations'] = 'Rigid runtime flapping; no skin or baked animation clips.'
    with open(os.path.join(REPO, 'art', 'forest-birds-manifest.json'), 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2)
        f.write('\n')
    if '--install' in args:
        shutil.copy2(path, os.path.join(REPO, 'public', 'assets', 'models', FILE))
    if '--render' in args:
        preview(root, parts)
    print(json.dumps(data, indent=2))


if __name__ == '__main__':
    main()
