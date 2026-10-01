"""Original Titan encounter/companion/trophy models; run with Blender --background --python.

Outputs titans.glb (27 named roots), a checked manifest and a nine-Titan preview.
Ground origin, Blender Z up/-Y front, glTF Y up/+Z front. Boss bounds match hit radii.
No reference meshes or textures are imported.
"""
import bpy, math, os, sys, json, shutil
from mathutils import Vector
HERE=os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0,HERE)
import style
R=os.path.abspath(os.path.join(HERE,'..','..','..'))
OUT=os.path.join(R,'public','assets','models','titans.glb')
DATA=[('turtle',5.2,4.2,2.4,'#6b8a4a','#c9a86a','#8fe05a'),('hydra',6,3.8,2.3,'#ff5aa8','#8ae0ff','#ffe14d'),('crystal',6.4,3.6,2.2,'#9fe8ff','#e8f8ff','#6a8cff'),('scorpion',4.6,4.4,2.4,'#3a2a2e','#ff6a2b','#ffc23d'),('clock',5,4.2,2.4,'#c89a3a','#8a8ea0','#3fb0ff'),('flower',5.4,4,2.4,'#c0203a','#ffe0b0','#4fbf5a'),('kraken',5.6,4.4,2.4,'#8a3a9a','#ff9ad8','#3fd0c0'),('whale',4,4.6,2.5,'#dff0ff','#8ab8ff','#fff27a'),('eye',5,3.8,2.3,'#2a1a3e','#b06aff','#ff3b6a')]
def empty(name):
 o=bpy.data.objects.new(name,None);bpy.context.collection.objects.link(o);return o
def unit(key,colors):
 pieces=[];mats=[style.mat('Titan '+key+' '+str(i),c,rough=.36,metal=.15 if key=='clock' else 0) for i,c in enumerate(colors)]
 ink=style.mat('Titan eyes','#282238',rough=.2);white=style.mat('Titan eye shine','#fff8e2',rough=.22)
 def ball(name,p,s,c=0):
  o=style.ico(name,1,p,mats[c] if isinstance(c,int) else c,subdiv=1,scale=s);pieces.append(o);return o
 def rod(name,a,b,r,c=0,r2=None):
  a,b=Vector(a),Vector(b);v=b-a;o=style.cyl(name,r,v.length,(a+b)*.5,mats[c],verts=8,bev=0,radius_top=r2 if r2 is not None else r);o.rotation_euler=v.to_track_quat('Z','Y').to_euler();pieces.append(o);return o
 def eye(x,y,z,r=.13):
  ball('eye white',(x,y,z),(r,r*.55,r),white);ball('pupil',(x,y-r*.45,z),(r*.48,r*.24,r*.65),ink);ball('glint',(x-r*.17,y-r*.68,z+r*.26),(r*.15,)*3,white)
 if key=='turtle':
  ball('belly',(0,0,.58),(1,.95,.46),1);ball('shell',(0,.15,.95),(1.02,1.1,.68),0)
  for x in [-.82,.82]:
   for y in [-.72,.76]:ball('leg',(x,y,.35),(.3,.42,.35),0);ball('toes',(x,y-.18,.16),(.28,.24,.13),1)
  ball('neck',(0,-1.05,.68),(.38,.62,.32),0);ball('wise head',(0,-1.44,.88),(.5,.47,.34),0)
  for x in [-.23,.23]:eye(x,-1.8,1.0)
  for i in range(7):
   a=i*math.tau/7;rod('mountain spike',(math.sin(a)*.6,math.cos(a)*.65,1.3),(math.sin(a)*.5,math.cos(a)*.5,1.9+(i%2)*.2),.23,2,.025)
  rod('central mountain',(0,.1,1.5),(0,.1,2.2),.38,1,.02)
 elif key=='hydra':
  ball('body',(0,.2,.45),(.85,.95,.45),0)
  for i,x in enumerate([-.7,0,.7]):
   c=i%3
   for j in range(4):ball('curved neck',(x*(j+1)/4,.15-j*.15,.7+j*.3),(.2,.23,.3),c)
   ball('serpent head',(x,-.6,1.88),(.36,.44,.3),c);ball('muzzle',(x,-.96,1.8),(.3,.22,.19),c)
   for side in [-1,1]:eye(x+side*.16,-.99,1.99,.1);rod('candy horn',(x+side*.21,-.48,2),(x+side*.28,-.35,2.35),.12,(c+1)%3,.005)
  for i in range(5):ball('tail',(math.sin(i*.6)*.3,.75+i*.23,.35-i*.045),(.3-i*.04,.27-i*.03,.23-i*.03),2)
 elif key=='crystal':
  ball('floating heart',(0,0,1.15),(.64,.5,1.0),0)
  for i in range(8):
   a=i*math.tau/8;rod('crystal skirt',(math.sin(a)*.18,math.cos(a)*.16,.9),(math.sin(a)*.82,math.cos(a)*.72,.22),.08,2,.18)
  ball('queen face',(0,-.16,1.9),(.39,.28,.42),1)
  for x in [-.15,.15]:eye(x,-.43,1.96,.095)
  for i in range(7):
   a=i*math.tau/7;rod('crown shard',(math.sin(a)*.4,math.cos(a)*.35,2.1),(math.sin(a)*.56,math.cos(a)*.45,2.6+(i%2)*.17),.11,0,.006)
  for side in [-1,1]:rod('arm',(side*.35,0,1.6),(side*.96,-.15,1.38),.14,1,.07);ball('orbit shard',(side*1.1,-.2,1.5),(.14,.12,.4),2)
 elif key in ['scorpion','clock']:
  ball('armored body',(0,0,.7),(.82,1,.45),0)
  for i in range(4):
   y=-.65+i*.45
   for side in [-1,1]:
    rod('upper leg',(side*.6,y,.7),(side*1.16,y+.25,.6),.13,1);rod('pointed leg',(side*1.16,y+.25,.6),(side*1.38,y-.1,.08),.12,0,.05)
  if key=='scorpion':
   for i in range(7):ball('tail segment',(0,.7+math.sin(i*.37)*.85,.8+i*.17),(.18,.21,.19),1)
   rod('venom sting',(0,1.35,1.8),(0,1.06,2.18),.19,2,.005)
   for side in [-1,1]:
    rod('claw arm',(side*.55,-.55,.6),(side*.95,-1.3,.7),.18,0);ball('pincer',(side*.99,-1.45,.76),(.3,.4,.22),1)
    for off in [-1,1]:rod('claw tip',(side*.99+off*.15,-1.6,.76),(side*.99+off*.09,-1.9,.77),.1,2,.012)
  else:
   o=style.cyl('clock face',.72,.14,(0,0,1.2),mats[1],verts=16,bev=.02);pieces.append(o)
   for i in range(12):
    a=i*math.tau/12;ball('clock tooth',(math.sin(a)*.79,math.cos(a)*.79,1.24),(.11,.11,.1),0)
   rod('clock hand',(0,0,1.33),(.4,-.3,1.33),.045,2);rod('clock hand',(0,0,1.33),(-.14,.5,1.33),.035,2)
   ball('clock hub',(0,0,1.37),(.12,.12,.08),2)
  for x in [-.24,.24]:eye(x,-.92,.9,.11)
 elif key=='flower':
  rod('stem',(0,0,.12),(0,0,1.1),.4,2,.26)
  for i in range(7):
   a=i*math.tau/7;ball('leaf',(math.sin(a)*.64,math.cos(a)*.64,.25),(.58,.48,.12),2)
   p=ball('ruffled petal',(math.sin(a)*.86,math.cos(a)*.86,1.05),(.63,.64,.26),0);p.rotation_euler.x=math.sin(a)*.22;p.rotation_euler.y=math.cos(a)*.22
   for j in range(3):ball('cream speck',(math.sin(a)*(.62+j*.16),math.cos(a)*(.62+j*.16),1.27),(.055,.055,.045),1)
  ball('flower mouth',(0,0,1.16),(.65,.65,.38),1);ball('deep throat',(0,0,1.46),(.47,.47,.12),ink)
  for i in range(12):
   a=i*math.tau/12;rod('tooth',(math.sin(a)*.45,math.cos(a)*.45,1.45),(math.sin(a)*.3,math.cos(a)*.3,1.52),.07,1,.004)
 elif key=='kraken':
  ball('mantle',(0,0,1.25),(.6,.66,1.0),0);ball('brow',(0,-.27,1.2),(.63,.5,.3),0)
  for i in range(8):
   a=i*math.tau/8;previous=None
   for j in range(5):
    d=.42+j*.26;point=(math.sin(a+j*.16)*d,math.cos(a+j*.16)*d,.52-j*.06)
    if previous is not None:rod('continuous tentacle',previous,point,.22-(j-1)*.03,0,.22-j*.03)
    previous=point
    ball('curling tentacle',(math.sin(a+j*.16)*d,math.cos(a+j*.16)*d,.52-j*.06),(.22-j*.03,.23-j*.03,.2-j*.025),0)
    if j<4:ball('sucker',(math.sin(a+j*.16)*d,math.cos(a+j*.16)*d,.69-j*.06),(.07,.07,.045),1)
  for x in [-.23,.23]:eye(x,-.68,1.42,.15)
 elif key=='whale':
  ball('cloud whale',(0,-.15,.92),(.86,1.5,.66),0);ball('belly',(0,-.27,.68),(.69,1.25,.4),1)
  for side in [-1,1]:
   f=ball('fin',(side*.9,-.1,.79),(.64,.48,.11),1);f.rotation_euler.y=side*.25
   f=ball('tail fluke',(side*.48,1.55,.91),(.63,.4,.13),1);f.rotation_euler.z=side*.22
   eye(side*.48,-1.36,1.03,.14)
  for i in range(3):ball('cloud crown',(i*.22-.22,.0,1.65),(.2,.2,.18),0)
  rod('sky horn',(0,-.65,1.43),(0,-.84,2.0),.13,2,.005)
 else:
  ball('void shell',(0,0,1.2),(.88,.75,.94),0);ball('sclera',(0,-.47,1.2),(.7,.4,.7),white);ball('iris',(0,-.79,1.2),(.43,.16,.49),2);ball('pupil',(0,-.94,1.2),(.14,.08,.34),ink)
  ball('eye glint',(-.13,-1.01,1.43),(.09,.04,.12),white)
  for i in range(10):
   a=i*math.tau/10;x,z=math.sin(a),1.2+math.cos(a);rod('void ray',(x*.72,0,1.2+(z-1.2)*.72),(x*1.23,.15,1.2+(z-1.2)*1.23),.16,1,.008)
 return style.join(pieces,key+'_body')
def normalize(obj,height,width):
 bpy.context.view_layer.update();pts=[obj.matrix_world@Vector(c) for c in obj.bound_box];low=[min(p[i] for p in pts) for i in range(3)];high=[max(p[i] for p in pts) for i in range(3)];cx=(low[0]+high[0])/2;cy=(low[1]+high[1])/2;sxy=width/max(high[0]-low[0],high[1]-low[1]);sz=height/(high[2]-low[2]);matrix=obj.matrix_world.copy()
 for v in obj.data.vertices:
  p=matrix@v.co;v.co=((p.x-cx)*sxy,(p.y-cy)*sxy,(p.z-low[2])*sz)
 obj.location=(0,0,0);obj.rotation_euler=(0,0,0);obj.scale=(1,1,1)
def stats(obj):
 obj.data.calc_loop_triangles();pts=[Vector(c) for c in obj.bound_box];return {'triangles':len(obj.data.loop_triangles),'bounds':[[round(min(p[i] for p in pts),4) for i in range(3)],[round(max(p[i] for p in pts),4) for i in range(3)]]}
def main():
 style.reset_scene();roots=[];manifest={};bosses=[]
 for key,height,radius,scale,*colors in DATA:
  model=unit(key,colors);normalize(model,height/scale,radius*2/scale);root=empty('titan_'+key);model.name='titan_'+key+'_body';model.parent=root;roots.append(root);bosses.append(root);manifest[root.name]=stats(model)
  assert manifest[root.name]['triangles']<6500,(key,manifest[root.name])
  pet=root.copy();pet.name='pet_t_'+key;bpy.context.collection.objects.link(pet);pm=model.copy();pm.data=model.data.copy();pm.name=pet.name+'_body';pm.parent=pet;bpy.context.collection.objects.link(pm);normalize(pm,.7,.85);roots.append(pet);manifest[pet.name]=stats(pm)
  # Wearable miniature trophy sits at the explorer's head attachment, in hero coordinates.
  hat=empty('hat_t_'+key);hm=model.copy();hm.data=model.data.copy();hm.name=hat.name+'@head';hm.parent=hat;bpy.context.collection.objects.link(hm);normalize(hm,.45,.8)
  for v in hm.data.vertices:v.co.z+=2.03
  roots.append(hat);manifest[hat.name]=stats(hm)
 os.makedirs(os.path.dirname(OUT),exist_ok=True);objects=[o for root in roots for o in [root]+list(root.children_recursive)];style.export_glb(objects,OUT)
 path=os.path.join(R,'art','generated','kit','titans-manifest.json');os.makedirs(os.path.dirname(path),exist_ok=True);open(path,'w').write(json.dumps(manifest,indent=2));assert os.path.getsize(OUT)<2500000
 for root in roots:root.hide_render=True;[setattr(c,'hide_render',True) for c in root.children_recursive]
 # A true Blender render verifies all nine silhouettes together at the gameplay scale.
 import build_creatures as presentation
 presentation.stage((1800,1500),ground='#a2c785')
 for i,root in enumerate(bosses):
  root.hide_render=False;root.location=((i%3-1)*11,(i//3-1)*10,0);root.scale=(DATA[i][3],)*3
  for c in root.children_recursive:c.hide_render=False
 presentation.camera(34,18,(0,0,2),37,distance=60)
 path=os.path.join(R,'art','previews','kit','titans.webp');os.makedirs(os.path.dirname(path),exist_ok=True);style.render(path)
 print('TITANS_OK',len(manifest),'models',os.path.getsize(OUT),'bytes',sum(v['triangles'] for v in manifest.values()),'triangles')
if __name__=='__main__':main()
