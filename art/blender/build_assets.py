"""Editable village assets. Run with Blender --background --python build_assets.py -- --output PATH.

Blender coordinates: Z up, -Y faces the viewer. glTF exports Y up, +Z forward.
All geometry and materials are original, authored for Zoo Garden.
"""
import bpy, math, json, os, sys, argparse, random
from mathutils import Vector

args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
parser = argparse.ArgumentParser()
parser.add_argument('--output', required=True)
parser.add_argument('--render', action='store_true')
opts = parser.parse_args(args)
OUT = os.path.abspath(opts.output)
for folder in ['models', 'unity-fbx', 'source', 'previews']:
    os.makedirs(os.path.join(OUT, folder), exist_ok=True)

bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
for col in list(bpy.data.collections):
    if col.name != 'Collection': bpy.data.collections.remove(col)
current_collection = None
assets = {}
stats = {}

def material(name, color):
    if name in bpy.data.materials: return bpy.data.materials[name]
    rgb = [int(color.lstrip('#')[i:i+2], 16) / 255 for i in (0, 2, 4)]
    def linear(c): return c / 12.92 if c < 0.04045 else ((c + 0.055) / 1.055) ** 2.4
    rgba = (*[linear(c) for c in rgb], 1)
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    mat.diffuse_color = rgba
    bsdf = mat.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = rgba
    bsdf.inputs['Roughness'].default_value = .78
    return mat

def assign(obj, name, mat):
    obj.name = name
    obj.data.materials.clear()
    obj.data.materials.append(mat)
    return obj

def bevel_object(obj, width=.035, segments=2):
    if width:
        modifier = obj.modifiers.new('Soft handcrafted edges', 'BEVEL')
        modifier.width = width
        modifier.segments = segments
        modifier.affect = 'EDGES'
    return obj

def box(name, location, scale, mat, bevel=.04):
    bpy.ops.mesh.primitive_cube_add(size=1, location=location)
    obj = bpy.context.object
    obj.dimensions = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    assign(obj, name, mat)
    return bevel_object(obj, bevel)

def uvball(name, loc, scale, mat, segments=12, rings=8):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments, ring_count=rings, radius=1, location=loc)
    obj = bpy.context.object
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    assign(obj, name, mat)
    for p in obj.data.polygons: p.use_smooth = True
    return obj

def cylinder(name, loc, radius, depth, mat, vertices=16):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=loc)
    return assign(bpy.context.object, name, mat)

def cone(name, loc, r1, r2, depth, mat, vertices=16):
    bpy.ops.mesh.primitive_cone_add(vertices=vertices, radius1=r1, radius2=r2, depth=depth, location=loc)
    return assign(bpy.context.object, name, mat)

def torus(name, loc, major, minor, mat):
    bpy.ops.mesh.primitive_torus_add(major_segments=24, minor_segments=6, location=loc, major_radius=major, minor_radius=minor)
    obj = assign(bpy.context.object, name, mat)
    for p in obj.data.polygons: p.use_smooth = True
    return obj

def mesh(name, vertices, faces, mat):
    data = bpy.data.meshes.new(name)
    data.from_pydata(vertices, [], faces)
    data.update()
    obj = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(mat)
    return obj

def beam(name, a, b, width, mat):
    start, end = Vector(a), Vector(b)
    obj = box(name, (start+end)/2, (width, width, (end-start).length), mat, width*.15)
    obj.rotation_euler = (end-start).to_track_quat('Z', 'Y').to_euler()
    return obj

def start_asset(name):
    global current_collection
    col = bpy.data.collections.new(name)
    bpy.context.scene.collection.children.link(col)
    bpy.context.view_layer.active_layer_collection = bpy.context.view_layer.layer_collection.children[col.name]
    current_collection = col
    assets[name] = col
    return col

def finish_asset(name):
    col = assets[name]
    bpy.ops.object.select_all(action='DESELECT')
    originals = [o for o in col.objects if o.type == 'MESH']
    for obj in originals: obj.select_set(True)
    bpy.context.view_layer.objects.active = originals[0]
    bpy.ops.object.duplicate()
    copies = list(bpy.context.selected_objects)
    for obj in copies:
        bpy.context.view_layer.objects.active = obj
        for modifier in list(obj.modifiers):
            bpy.ops.object.modifier_apply(modifier=modifier.name)
    bpy.context.view_layer.objects.active = copies[0]
    bpy.ops.object.join()
    exported = bpy.context.object
    exported.name = name
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    # Export mesh origins at ground center, independent of whichever component was active.
    bpy.context.scene.cursor.location = (0, 0, 0)
    bpy.ops.object.origin_set(type='ORIGIN_CURSOR')
    exported.data.calc_loop_triangles()
    triangles = len(exported.data.loop_triangles)
    bounds = [list(v) for v in exported.bound_box]
    bpy.ops.export_scene.gltf(filepath=os.path.join(OUT, 'models', name+'.glb'),
        export_format='GLB', use_selection=True, export_yup=True,
        export_apply=True, export_materials='EXPORT', export_extras=True,
        export_cameras=False, export_lights=False)
    bpy.ops.export_scene.fbx(filepath=os.path.join(OUT, 'unity-fbx', name+'.fbx'),
        use_selection=True, object_types={'MESH'}, apply_unit_scale=True,
        axis_forward='-Z', axis_up='Y', use_mesh_modifiers=True,
        bake_anim=False, add_leaf_bones=False, path_mode='AUTO')
    stats[name] = {'triangles': triangles, 'materials': len(exported.data.materials),
                   'source_objects': len(originals), 'bounds_blender': bounds,
                   'glb_bytes': os.path.getsize(os.path.join(OUT,'models',name+'.glb'))}
    bpy.data.objects.remove(exported, do_unlink=True)
    bpy.ops.object.select_all(action='DESELECT')
    print('ASSET_DONE', name, json.dumps(stats[name]), flush=True)

cream = material('Warm plaster', '#F1DDB3')
timber = material('Warm walnut beams', '#8F623F')
timber_light = material('Honey porch boards', '#B68C59')
dark = material('Recessed shadows', '#514A38')
roof = material('Honey thatch', '#D8AA55')
roof_light = material('Golden thatch highlights', '#E6BE6F')
roof_dark = material('Amber thatch shadow', '#BA873D')
teal = material('Quiet turquoise glass', '#78AAA7')
teal_light = material('Sky glass highlights', '#AED5C3')
leaf = material('Clover leaf green', '#79A765')
leaf_dark = material('Deep leaf green', '#557E4D')
rose = material('Rose petal', '#D698A5')
stone = material('Foundation limestone', '#C4C0AA')
brass = material('Little brass details', '#D7B56C')

def arched_panel(name, width, base, arch_start, depth, y, mat):
    # A simple arch outline extruded along the front/back axis.
    radius = width/2
    outline = [(-radius, base), (radius, base), (radius, arch_start)]
    outline += [(radius*math.cos(i*math.pi/10), arch_start+radius*math.sin(i*math.pi/10)) for i in range(1,11)]
    count=len(outline)
    verts=[(x, yy, z) for yy in [y-depth/2,y+depth/2] for x,z in outline]
    faces=[tuple(range(count-1,-1,-1)),tuple(range(count,count*2))]
    faces += [(i,(i+1)%count,(i+1)%count+count,i+count) for i in range(count)]
    return bevel_object(mesh(name,verts,faces,mat),.025,2)

def cottage():
    start_asset('cottage')
    cylinder('Circular stone plinth', (0,0,.16),2.83,.30,stone,32)
    cylinder('Rounded warm plaster walls',(0,0,1.7),2.57,3.02,cream,32)
    cylinder('Timber sill band',(0,0,.42),2.64,.22,timber,32)
    cylinder('Roof support ring',(0,0,3.05),2.68,.23,timber,32)
    for i in range(20):
        a=i*math.tau/20
        obj=box('Foundation block %02d'%i,(math.cos(a)*2.69,math.sin(a)*2.69,.21),(.57,.26,.29),stone,.065)
        obj.rotation_euler[2]=a+math.pi/2
    for a in [-.98,-.45,.45,.98,math.pi/2,math.pi,math.pi*1.5]:
        x,y=math.sin(a)*2.53,-math.cos(a)*2.53
        obj=box('Wall upright',(x,y,1.74),(.15,.17,2.85),timber,.025);obj.rotation_euler[2]=a
    # Multi-ring roof with an organic profile and individual broad thatch strips.
    profile=[(0.0,5.6),(.38,5.59),(.95,5.37),(1.6,5.02),(2.28,4.55),(2.95,3.98),(3.52,3.40),(3.60,3.26)]
    segments=32
    verts=[]
    for radius,z in profile:
        for i in range(segments):
            a=i*math.tau/segments
            verts.append((radius*math.cos(a),radius*math.sin(a),z))
    faces=[]
    for row in range(len(profile)-1):
        for i in range(segments):
            j=(i+1)%segments;faces.append((row*segments+i,row*segments+j,(row+1)*segments+j,(row+1)*segments+i))
    mesh('Sculpted thatch roof shell',verts,faces,roof)
    # Layered tile-like straw bundles keep the silhouette readable in an overhead game view.
    rng=random.Random(45)
    for row,(r0,z0,r1,z1,count) in enumerate([(3.59,3.28,2.73,4.23,32),(2.92,4.02,2.0,4.87,28),(2.18,4.68,1.21,5.27,24),(1.39,5.15,.45,5.57,18)]):
        for i in range(count):
            center=(i+.5*(row%2))*math.tau/count
            half=math.pi/count*.96
            v=[]
            for radius,z in [(r0,z0),(r1,z1)]:
                for a in [center-half,center,center+half]:
                    lift=.045 if a==center else .005
                    v.append((radius*math.cos(a),radius*math.sin(a),z+lift))
            m=[roof,roof,roof_light,roof_dark][rng.randrange(4)]
            strip=mesh('Thatch bundle %d-%02d'%(row,i),v,[(0,1,4,3),(1,2,5,4)],m)
            solid=strip.modifiers.new('Thatch edge thickness','SOLIDIFY');solid.thickness=.045
    torus('Soft rounded eave',(0,0,3.25),3.56,.095,roof_dark)
    cone('Rounded straw finial',(0,0,5.65),.51,.16,.40,roof_light,20)
    uvball('Finial cap',(0,0,5.86),(.19,.19,.11),roof,16,8)
    # Tiny chimney, tilted cap, and round stove collar.
    chimney=cylinder('Copper stove pipe',(1.35,.45,5.37),.18,1.0,timber,12)
    cone('Chimney rain cap',(1.35,.45,5.94),.34,.1,.16,timber_light,12)
    torus('Chimney collar',(1.35,.45,5.01),.26,.075,roof_dark)
    # Door frame and inset wooden planks.
    arched_panel('Arched door casing',1.34,.32,1.62,.22,-2.58,timber_light)
    arched_panel('Arched walnut door',1.05,.37,1.58,.08,-2.73,timber)
    for x in [-.34,-.17,0,.17,.34]:
        height=1.34+math.sqrt(max(0,.5**2-x*x))
        box('Door plank seam',(x,-2.786,.4+height/2),(.012,.012,height),dark,0)
    for x in [-.38,.38]:
        for z in [.8,1.45]:uvball('Door peg',(x,-2.799,z),(.025,.014,.025),brass,8,4)
    torus('Round door handle',(.30,-2.85,1.15),.078,.019,brass).rotation_euler[0]=math.pi/2
    # Front windows sit tangentially to the circular wall.
    for sign in [-1,1]:
        a=sign*.66
        pivot=Vector((math.sin(a)*2.56,-math.cos(a)*2.56,1.8))
        parts=[]
        parts.append(box('Window walnut surround',pivot,(.94,.17,1.17),timber,.075))
        parts.append(box('Window cream inset',pivot+Vector((math.sin(a)*.10,-math.cos(a)*.10,0)),(.83,.14,1.05),cream,.06))
        parts.append(box('Turquoise window pane',pivot+Vector((math.sin(a)*.19,-math.cos(a)*.19,0)),(.67,.055,.88),teal,.05))
        parts.append(box('Window mullion',pivot+Vector((math.sin(a)*.23,-math.cos(a)*.23,0)),(.055,.055,.94),cream,.008))
        parts.append(box('Window crossbar',pivot+Vector((math.sin(a)*.235,-math.cos(a)*.235,0)),(.72,.055,.055),cream,.008))
        for obj in parts:obj.rotation_euler[2]=a
        flowerbox=box('Window flower box',pivot+Vector((math.sin(a)*.25,-math.cos(a)*.25,-.78)),(1.02,.36,.30),timber_light,.05);flowerbox.rotation_euler[2]=a
        for j in range(5):
            offset=Vector(((j-2)*.18,0,0));offset.rotate(flowerbox.rotation_euler)
            pos=pivot+Vector((math.sin(a)*.27,-math.cos(a)*.27,-.53))+offset
            uvball('Window herbs',pos,(.16,.15,.20),leaf,8,5)
            if j%2==0:uvball('Window pink flower',pos+Vector((0,-.02,.17)),(.10,.10,.08),rose,8,5)
    # Porch with individual bevelled planks, steps, and braced posts.
    for i in range(12):box('Porch board %02d'%i,(-2.06+i*.375,-2.92,.28),(.35,1.43,.17),timber_light,.024)
    for i in range(2):box('Welcoming porch step',(0,-3.65-i*.24,.17-i*.06),(1.85,.34,.16),timber_light,.035)
    for sign in [-1,1]:
        x=sign*2.07
        cylinder('Porch column',(x,-2.77,1.77),.105,2.93,timber,12)
        cylinder('Post stone foot',(x,-2.77,.36),.18,.2,stone,12)
        beam('Porch timber brace',(x,-2.77,2.51),(x-sign*.48,-2.77,3.02),.12,timber_light)
    # Hanging lantern, circular welcome plaque, and a leaf motif.
    beam('Lantern hook',(-1.0,-2.77,2.47),(-1.0,-3.03,2.47),.055,timber)
    box('Lantern glow',(-1.0,-3.03,2.17),(.19,.17,.24),roof_light,.035)
    for z in [2.02,2.32]:box('Lantern frame',(-1,-3.03,z),(.25,.22,.055),timber,.02)
    plaque=cylinder('Round welcome plaque',(0,-2.72,2.66),.25,.07,leaf_dark,20);plaque.rotation_euler[0]=math.pi/2
    for sign in [-1,1]:
        obj=uvball('Welcome leaf',(sign*.07,-2.775,2.69),(.065,.025,.12),cream,8,5);obj.rotation_euler[1]=sign*.5
    finish_asset('cottage')

cottage()
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from props import build_props
build_props(dict(box=box,uvball=uvball,cylinder=cylinder,cone=cone,torus=torus,material=material,start_asset=start_asset,finish_asset=finish_asset))

# Arrange the original editable pieces on a studio presentation board.
layout={'cottage':(-4,1,0),'market-stall':(3,-2,0),'equipment-stall':(3,2.0,0),'garden-bed':(-3.2,-5.4,0),'wishing-crystal':(3,6.2,0)}
for name,col in assets.items():
    root=bpy.data.objects.new(name+' | editable asset',None)
    col.objects.link(root)
    for obj in list(col.objects):
        if obj != root:obj.parent=root
    root.location=layout.get(name,(0,0,0))

studio=bpy.data.collections.new('Studio — presentation only')
bpy.context.scene.collection.children.link(studio)
bpy.context.view_layer.active_layer_collection=bpy.context.view_layer.layer_collection.children[studio.name]
groundmat=material('Studio warm backdrop','#E9E5D7')
box('Studio floor',(0,0,-.16),(200,200,.25),groundmat,0)
scene=bpy.context.scene
scene.render.engine='CYCLES'
scene.cycles.samples=32
scene.cycles.use_denoising=True
scene.render.resolution_x=1600
scene.render.resolution_y=1200
scene.render.resolution_percentage=100
scene.world.color=(.25,.25,.25)
scene.world.use_nodes=True
scene.world.node_tree.nodes['Background'].inputs['Color'].default_value=(.72,.78,.72,1)
scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value=.65
scene.view_settings.view_transform='AgX'
scene.view_settings.look='AgX - Medium High Contrast'

def area(name,location,power,size):
    bpy.ops.object.light_add(type='AREA',location=location)
    light=bpy.context.object;light.name=name;light.data.energy=power;light.data.shape='DISK';light.data.size=size
    light.rotation_euler=(Vector((0,0,1))-light.location).to_track_quat('-Z','Y').to_euler()
area('Large warm key',(-7,-10,16),2300,9)
area('Soft fill',(9,-1,10),1400,8)
area('Back rim',(-1,9,12),2000,7)
bpy.ops.object.camera_add(location=(16,-23,19))
camera=bpy.context.object;camera.name='Asset collection camera';camera.data.type='ORTHO';camera.data.ortho_scale=22
camera.rotation_euler=(Vector((0,0,1.5))-camera.location).to_track_quat('-Z','Y').to_euler();scene.camera=camera
scene.render.image_settings.file_format='PNG'
scene.render.filepath=os.path.join(OUT,'previews','village-asset-collection.png')
scene['game_asset_notes']='Original Zoo Garden assets. Units in meters. Front -Y in Blender, +Z in GLB. The Studio collection is presentation-only. FBX exports are provided for a future Unity prototype.'
with open(os.path.join(OUT,'asset-manifest.json'),'w',encoding='utf-8') as f:json.dump({'generator':'Blender '+bpy.app.version_string,'coordinate_system':'GLB: Y-up, +Z front, meters','assets':stats},f,indent=2)
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT,'source','zoo-garden-village.blend'))
if opts.render:
    bpy.ops.render.render(write_still=True)
    # Hero render: the cottage only, at a readable three-quarter angle.
    for name,col in assets.items():col.hide_render=name!='cottage'
    camera.location=(7,-13,10)
    target=Vector((-4,1,2.2));camera.rotation_euler=(target-camera.location).to_track_quat('-Z','Y').to_euler();camera.data.ortho_scale=10.7
    scene.render.resolution_x=1400;scene.render.resolution_y=1200
    scene.render.filepath=os.path.join(OUT,'previews','cottage-refined.png')
    bpy.ops.render.render(write_still=True)
print('ASSET_BUILD_COMPLETE',OUT,flush=True)
