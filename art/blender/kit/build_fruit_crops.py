"""Original garden fruit models. Run blender -b --python this-file -- --install.

Eight mature plants use ground-centred crop_<id> nodes. Grapes are trellised,
pineapples are rosettes and coconuts grow on palms; other fruit grows on small
orchard trees. The kit is independently authored and exported through Blender.
"""
import bpy, math, os, sys, json, shutil
from mathutils import Vector
HERE=os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0,HERE)
from style import reset_scene,mat,studio,game_camera,render
REPO=os.path.normpath(os.path.join(HERE,'..','..','..'))
GEN=os.path.join(REPO,'art','generated','kit')
IDS=['apple','grape','mango','pineapple','coconut','durian','lychee','peach']
reset_scene()
colors={'leaf':'#48AC47','light':'#83D949','wood':'#A96534','red':'#EF3B47','purple':'#914FCA','gold':'#FFBD31','green':'#8EAA31','brown':'#805230','pink':'#FF97AF','stem':'#6F7E2B'}
mats={k:mat('Fruit '+k,v) for k,v in colors.items()}
def finish(obj,root,material):
    obj.data.materials.append(mats[material]);obj.parent=root
    bpy.context.view_layer.objects.active=obj;obj.select_set(True)
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    obj.select_set(False);return obj
def orb(root,pos,scale,color,sub=1):
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=sub,radius=1,location=pos)
    obj=bpy.context.object;obj.scale=scale;return finish(obj,root,color)
def stick(root,a,b,r,color='wood',r2=None):
    d=Vector(b)-Vector(a);mid=(Vector(a)+Vector(b))/2
    bpy.ops.mesh.primitive_cone_add(vertices=7,radius1=r,radius2=r if r2 is None else r2,depth=d.length,location=mid)
    obj=bpy.context.object;obj.rotation_euler=d.to_track_quat('Z','Y').to_euler();return finish(obj,root,color)
def leaf(root,base,end,width,color='leaf'):
    a,b=Vector(base),Vector(end);d=b-a;side=Vector((-d.y,d.x,0)).normalized()*width
    mid=a+d*.58;verts=[a,mid+side, b, mid-side,mid+Vector((0,0,.035))]
    mesh=bpy.data.meshes.new('Fruit leaf');mesh.from_pydata(verts,[],[(0,1,4),(1,2,4),(2,3,4),(3,0,4),(3,2,1),(3,1,0)])
    obj=bpy.data.objects.new('Fruit leaf',mesh);bpy.context.collection.objects.link(obj);return finish(obj,root,color)
def fruit(root,kind,pos,size=.13):
    x,y,z=pos
    color={'apple':'red','grape':'purple','mango':'gold','pineapple':'gold','coconut':'brown','durian':'green','lychee':'pink','peach':'pink'}[kind]
    if kind=='grape':
        for i,(dx,dy,dz) in enumerate([(-.06,0,.08),(.06,0,.08),(0,-.035,0),(-.045,.015,-.06),(.045,.015,-.06),(0,0,-.14)]):orb(root,(x+dx,y+dy,z+dz),(.055,)*3,color)
    elif kind=='durian':
        orb(root,pos,(size,size*.86,size*1.12),color)
        for i in range(16):
            angle=i*2.399;zz=(i/15-.5)*1.6;rr=math.sqrt(max(.1,1-zz*zz));d=Vector((math.cos(angle)*rr,math.sin(angle)*rr,zz))
            a=Vector(pos)+d*size*.82;stick(root,a,a+d*.045,.025,'light',0)
    elif kind=='peach':
        orb(root,(x-.035,y,z),(size*.78,size*.8,size),'pink');orb(root,(x+.035,y,z),(size*.78,size*.8,size),'pink')
    else:orb(root,pos,(size*.85 if kind=='mango' else size,size*.82,size*1.24 if kind in ('mango','pineapple') else size),color,2 if kind=='pineapple' else 1)
    if kind not in ('grape','pineapple'):stick(root,(x,y,z+size*.7),(x+.015,y,z+size*1.25),.012,'stem')
roots=[]
for kind in IDS:
    root=bpy.data.objects.new('crop_'+kind,None);bpy.context.collection.objects.link(root);roots.append(root)
    if kind=='grape':
        for x in (-.38,.38):stick(root,(x,0,0),(x,0,1.13),.035)
        for z in (.4,.85,1.08):stick(root,(-.42,0,z),(.42,0,z),.025)
        stick(root,(0,0,0),(0,0,1.15),.023,'stem')
        for i,x in enumerate((-.25,0,.25)):
            fruit(root,kind,(x,-.08,.75 if i!=1 else .94));leaf(root,(x,0,.98),(x+.16,.10,1.14),.11)
    elif kind=='pineapple':
        fruit(root,kind,(0,0,.39),.23)
        for i in range(10):
            a=i*math.tau/10;leaf(root,(0,0,.12),(math.cos(a)*.48,math.sin(a)*.48,.27),.08,'light' if i%2 else 'leaf')
        for i in range(7):
            a=i*math.tau/7;leaf(root,(0,0,.64),(math.cos(a)*.17,math.sin(a)*.17,.98),.055)
        stick(root,(0,0,0),(0,0,.15),.04,'stem')
    elif kind=='coconut':
        for i in range(4):stick(root,(.035*i,0,i*.28),(.035*(i+1),0,(i+1)*.28),.045-i*.005)
        for i in range(8):
            a=i*math.tau/8;leaf(root,(.14,0,1.12),(.14+math.cos(a)*.58,math.sin(a)*.58,1.01),.12,'light' if i%2 else 'leaf')
        for x,y in ((.01,-.20),(.27,-.14),(.13,.08)):fruit(root,kind,(x,y,.91),.135)
    else:
        stick(root,(0,0,0),(0,0,.95),.055,r2=.028)
        for i in range(3):
            a=i*math.tau/3;tip=(math.cos(a)*.27,math.sin(a)*.22,.94+i*.045)
            stick(root,(0,0,.56),tip,.022);orb(root,tip,(.31,.27,.24),'light' if i==1 else 'leaf')
        for i in range(5):
            a=i*math.tau/5;stick(root,(0,0,.80),(math.cos(a)*.34,-.17+math.sin(a)*.25,.77+(i%2)*.16),.012);fruit(root,kind,(math.cos(a)*.34,-.17+math.sin(a)*.25,.64+(i%2)*.16),.12 if kind!='lychee' else .08)
    bpy.context.view_layer.update()
    # Combine per plant for efficient cards/baking; transforms become mesh-local to the ground origin.
    bpy.ops.object.select_all(action='DESELECT')
    meshes=[o for o in root.children if o.type=='MESH']
    for o in meshes:o.select_set(True)
    bpy.context.view_layer.objects.active=meshes[0];bpy.ops.object.join();obj=bpy.context.object
    bpy.context.scene.cursor.location=(0,0,0);bpy.ops.object.origin_set(type='ORIGIN_CURSOR');obj.name='crop_'+kind+'_mesh';obj.data.name=obj.name
    obj.select_set(False)
stats={}
for root in roots:
    vertices=[root.matrix_world @ o.matrix_local @ v.co for o in root.children for v in o.data.vertices]
    tris=sum(len(p.vertices)-2 for o in root.children for p in o.data.polygons)
    height=max(v.z for v in vertices);ground=min(v.z for v in vertices)
    if abs(ground)>.025 or height>1.4 or tris>2600:raise RuntimeError(f'{root.name} violates budget/ground: {tris}, {ground}, {height}')
    stats[root.name]={'triangles':tris,'height':height,'ground':ground}
os.makedirs(os.path.join(GEN,'models'),exist_ok=True)
path=os.path.join(GEN,'models','fruit_crops.glb')
bpy.ops.object.select_all(action='DESELECT')
for root in roots:
    root.select_set(True)
    for o in root.children:o.select_set(True)
bpy.ops.export_scene.gltf(filepath=path,export_format='GLB',use_selection=True,export_yup=True,export_apply=True,export_animations=False)
if os.path.getsize(path)>600*1024:raise RuntimeError('Fruit kit exceeds 600KB')
with open(os.path.join(GEN,'fruit-crops-manifest.json'),'w',encoding='utf-8') as f:json.dump({'generator':'build_fruit_crops.py','bytes':os.path.getsize(path),'models':stats},f,indent=2)
studio(size=(1600,900))
for i,root in enumerate(roots):root.location=((i%4-1.5)*1.65,(i//4-.5)*2.0,0)
game_camera(target=(0,0,.5),ortho_scale=8)
render(os.path.join(REPO,'art','previews','kit','fruit-crops.webp'))
if '--install' in sys.argv:
    shutil.copyfile(path,os.path.join(REPO,'public','assets','models','fruit_crops.glb'))

# Match the existing 160px transparent crop icon studio, using harvested fruit
# rather than whole trees so apple/grape/pineapple remain legible at 52px.
from build_nature import render_icons,contact_sheet
for obj in list(bpy.data.objects):
    if obj.type=='MESH':obj.hide_render=True
    elif obj.type in ('LIGHT','CAMERA'):bpy.data.objects.remove(obj,do_unlink=True)
icon_models={}
for kind in IDS:
    root=bpy.data.objects.new('icon_'+kind,None);bpy.context.collection.objects.link(root)
    if kind=='lychee':
        for x,y,z in ((-.12,0,.22),(.12,0,.22),(0,-.10,.06)):
            fruit(root,kind,(x,y,z),.13);stick(root,(.025,0,.49),(x,y,z+.14),.009,'stem')
    else:fruit(root,kind,(0,0,.25),.23 if kind!='grape' else .13)
    if kind=='pineapple':
        for i in range(7):
            a=i*math.tau/7;leaf(root,(0,0,.52),(math.cos(a)*.18,math.sin(a)*.18,.91),.06)
    elif kind=='coconut':
        for x,z in ((-.05,.32),(.05,.32),(0,.23)):orb(root,(x,-.174,z),(.029,.014,.028),'wood')
    else:
        top=.39 if kind=='grape' else .49
        stick(root,(0,0,top-.07),(.025,0,top+.08),.015,'stem')
        leaf(root,(.02,0,top+.025),(.27,.015,top+.10),.075,'light')
    bpy.ops.object.select_all(action='DESELECT')
    meshes=[obj for obj in root.children if obj.type=='MESH']
    for obj in meshes:obj.select_set(True)
    bpy.context.view_layer.objects.active=meshes[0];bpy.ops.object.join();obj=bpy.context.object
    obj.name='fruit_icon_'+kind;obj.hide_render=False;obj.select_set(False);icon_models['crop_'+kind]=obj
icon_sizes=render_icons(icon_models)
contact_sheet(IDS,os.path.join(REPO,'art','previews','kit','fruit-icons.webp'))
if '--install' in sys.argv:
    for kind in IDS:shutil.copyfile(os.path.join(GEN,'icons','crops',kind+'.webp'),os.path.join(REPO,'public','assets','icons','crops',kind+'.webp'))
if any(size>18*1024 for size in icon_sizes.values()):raise RuntimeError('Fruit icon exceeds 18KB')
with open(os.path.join(GEN,'fruit-crops-manifest.json'),'w',encoding='utf-8') as f:json.dump({'generator':'build_fruit_crops.py','bytes':os.path.getsize(path),'models':stats,'icons':{'size':[160,160],'bytes':icon_sizes}},f,indent=2)
print('Fruit icons OK',icon_sizes)
print('Fruit kit OK',stats)
