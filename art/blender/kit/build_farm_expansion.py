"""Original low-poly duck, pig and garden guardian additions to the farm kit.

Called by build_farm.py. Every animated piece keeps its own ground-centred root,
named rigid hinges and the per-animal budget in build_farm.py BUDGET (2,600).
"""
import math


def extend(g):
    Model, sphere, cyl, rbox, FM, cone = (g[n] for n in ('Model', 'sphere', 'cyl', 'rbox', 'FM', 'cone'))
    def blob(part, color, center, radii, seg=10, rings=5, young=[False]):
        if young[0]: seg=max(5,round(seg*.8)); rings=max(3,round(rings*.8))
        part.add(sphere(1, seg, rings, scale=radii).moved(center), color)

    def animal(pid, m):
        bird = pid in ('duck', 'duckling')
        young = pid in ('duckling', 'piglet')
        dog = pid == 'dog'
        sc = .56 if young else 1
        blob.__defaults__[-1][0]=young
        def v(x,y,z): return (x*sc,y*sc,z*sc)
        if bird:
            piv = dict(body=v(0,0,.20),head=v(0,-.12,.36),wing_l=v(-.18,0,.30),wing_r=v(.18,0,.30),leg_l=v(-.09,0,.14),leg_r=v(.09,0,.14),tail=v(0,.25,.30))
        else:
            piv = dict(body=v(0,0,.40),head=v(0,-.33,.55),leg_fl=v(-.21,-.28,.30),leg_fr=v(.21,-.28,.30),leg_bl=v(-.21,.28,.30),leg_br=v(.21,.28,.30),tail=v(0,.44,.52))
        model = Model(pid,piv)
        color = '#ffde63' if pid=='duckling' else '#fffaf0' if bird else '#c98d4c' if dog else '#ffc1cd' if young else '#ffb4c0'
        coat = FM(pid,color)
        if bird:
            bill=m['beak']
            # Body: barrel + breast + uptilted rump, so the silhouette is a duck's boat shape.
            blob(model['body'],coat,v(0,.03,.29),v(.215,.33,.185),14,8)
            blob(model['body'],coat,v(0,-.14,.27),v(.19,.18,.18),12,6)
            blob(model['body'],coat,v(0,.22,.34),v(.15,.16,.13),10,5)
            blob(model['body'],coat,v(0,-.02,.20),v(.17,.28,.10),10,4)
            # Slim neck blending head into the body.
            blob(model['head'],coat,v(0,-.15,.43),v(.095,.10,.15),8,5)
            blob(model['head'],coat,v(0,-.19,.51),v(.145,.155,.165),14,8)
            blob(model['head'],coat,v(0,-.255,.455),v(.10,.09,.075),8,4)
            # Flat bill: upper + lower mandible, nail, nostrils.
            blob(model['head'],bill,v(0,-.37,.455),v(.095,.105,.03),10,4)
            blob(model['head'],bill,v(0,-.43,.452),v(.075,.055,.024),8,3)
            blob(model['head'],bill,v(0,-.37,.425),v(.085,.095,.017),8,3)
            blob(model['head'],m['leg'],v(0,-.485,.455),v(.032,.02,.014),6,3)
            for side in (-1,1):
                blob(model['head'],m['eye'],v(side*.035,-.45,.468),v(.012,.016,.008),5,3)
                blob(model['head'],m['eye'],v(side*.118,-.30,.545),v(.028,.028,.034),8,5)
                blob(model['head'],m['glint'],v(side*.128,-.32,.558),v(.009,.009,.01),6,3)
                blob(model['head'],m['blush'],v(side*.135,-.285,.495),v(.03,.012,.018),6,3)
                part='wing_l' if side<0 else 'wing_r'
                W=model[part]
                # Folded wing: shoulder, overlapping feather layers, pointed tip.
                blob(W,coat,v(side*.195,-.02,.325),v(.06,.17,.12),8,5)
                blob(W,coat,v(side*.2,.09,.31),v(.055,.17,.095),8,4)
                blob(W,coat,v(side*.198,.17,.30),v(.048,.15,.07),6,4)
                W.add(cone(v(side*.2,.24,.30),v(side*.2,.40,.33),.04*sc,5),coat)
                for yy,zz in ((.05,.255),(.15,.25)):
                    blob(W,coat,v(side*.208,yy,zz),v(.035,.12,.035),6,3)
                leg='leg_l' if side<0 else 'leg_r'
                L=model[leg]; x=side*.09
                blob(L,coat,v(x,.0,.15),v(.06,.08,.055),6,4)
                L.add(cyl(v(x,0,.14),v(x,-.005,.035),.026*sc,.019*sc,sides=6),m['leg'])
                blob(L,m['leg'],v(x,-.005,.04),v(.03,.03,.022),6,3)  # ankle
                for ang in (-.5,0,.5):
                    tx=x+math.sin(ang)*.1; ty=-.005-math.cos(ang)*.1
                    L.add(cyl(v(x,-.005,.03),v(tx,ty,.016),.012*sc,.009*sc,sides=4),m['leg'])
                    blob(L,m['leg'],v(tx,ty,.016),v(.015,.016,.012),4,3)
                blob(L,m['leg'],v(x,-.065,.012),v(.075,.075,.008),8,3)  # web
            # Upturned tail fan.
            T=model['tail']
            blob(T,coat,v(0,.32,.36),v(.085,.11,.09),8,4)
            for k in (-1,0,1):
                T.add(cone(v(k*.03,.36,.37),v(k*.06,.50,.46-abs(k)*.03),.045*sc,5),coat)
        elif not dog:
            blob(model['body'],coat,v(0,.03,.49),v(.31,.45,.27),12,7)
            blob(model['body'],coat,v(0,-.20,.52),v(.30,.25,.27),12,7)   # shoulders
            blob(model['body'],coat,v(0,.26,.50),v(.30,.24,.26),12,7)    # hams
            blob(model['body'],coat,v(0,.02,.38),v(.27,.40,.19),10,4)    # belly
            blob(model['head'],coat,v(0,-.40,.60),v(.235,.24,.225),14,7)
            blob(model['head'],coat,v(0,-.40,.50),v(.20,.22,.14),10,4)   # jowls
            snout=m['muzzle']
            model['head'].add(cyl(v(0,-.52,.545),v(0,-.67,.545),.125*sc,.135*sc,sides=12),snout)
            blob(model['head'],snout,v(0,-.67,.545),v(.135,.025,.12),12,4)  # snout disc
            blob(model['head'],snout,v(0,-.55,.55),v(.15,.10,.12),8,4)
            for side in (-1,1):
                blob(model['head'],m['nostril'],v(side*.05,-.700,.55),v(.022,.012,.032),8,4)
                blob(model['head'],m['nostril'],v(side*.065,-.64,.47),v(.05,.03,.007),6,3)  # mouth line
                # Floppy folded ear with inner colour.
                blob(model['head'],coat,v(side*.17,-.37,.80),v(.10,.07,.10),8,4)
                blob(model['head'],coat,v(side*.215,-.40,.775),v(.085,.09,.06),8,4)
                blob(model['head'],m['muzzle'],v(side*.205,-.43,.775),v(.055,.045,.04),8,4)
                blob(model['head'],m['eye'],v(side*.125,-.575,.675),v(.029,.027,.033),8,5)
                blob(model['head'],m['glint'],v(side*.13,-.598,.688),v(.01,.009,.011),6,3)
            for name,(x,y) in {'fl':(-.21,-.28),'fr':(.21,-.28),'bl':(-.21,.28),'br':(.21,.28)}.items():
                L=model['leg_'+name]
                kb=.02 if y>0 else -.02
                L.add(cyl(v(x,y,.31),v(x,y+kb,.17),.095*sc,.066*sc,sides=7),coat)
                blob(L,coat,v(x,y+kb,.17),v(.07,.07,.065),6,4)  # knee
                L.add(cyl(v(x,y+kb,.17),v(x,y,.075),.062*sc,.054*sc,sides=7),coat)
                L.add(cyl(v(x,y,.085),v(x,y,.02),.062*sc,.07*sc,sides=7),m['hoof'])
                for tx in (-.032,.032):
                    blob(L,m['hoof'],v(x+tx,y-.03,.028),v(.04,.062,.03),6,3)  # split toes
            # Curly corkscrew tail.
            previous=None
            for i in range(7):
                a=i*.95; r=.045*(1-i*.03)
                center=v(math.sin(a)*r,.52+i*.012,.57-i*.003+math.cos(a)*r)
                if previous is not None: model['tail'].add(cyl(previous,center,.026*sc,sides=6),coat)
                blob(model['tail'],coat,center,v(.028,.028,.03),6,3)
                previous=center
        else:
            blob(model['body'],coat,v(0,.03,.49),v(.32,.47,.29),12,7)
            blob(model['head'],coat,v(0,-.39,.62),v(.23,.25,.23),12,6)
            muzzle=m['trim'] if dog else m['muzzle']
            blob(model['head'],muzzle,v(0,-.61,.53),v(.15,.12,.105),10,5)
            if dog:
                blob(model['head'],m['eye'],v(0,-.721,.555),v(.058,.024,.04),8,4)
                blob(model['head'],m['strap'],v(0,-.59,.45),v(.045,.07,.015),8,3)
            else:
                for side in (-1,1): blob(model['head'],m['nostril'],v(side*.055,-.718,.54),v(.02,.009,.03),6,3)
            for side in (-1,1):
                blob(model['head'],m['eye'],v(side*.13,-.579,.69),v(.03,.028,.035),8,4)
                blob(model['head'],m['glint'],v(side*.134,-.602,.70),v(.01,.009,.011),6,3)
                blob(model['head'],coat,v(side*.19,-.33,.85),v(.075,.09,.15 if dog else .09),8,4)
            for name,(x,y) in {'fl':(-.21,-.28),'fr':(.21,-.28),'bl':(-.21,.28),'br':(.21,.28)}.items():
                model['leg_'+name].add(cyl(v(x,y,.30),v(x,y,.045),.075*sc,sides=8),coat)
                blob(model['leg_'+name],m['hoof'],v(x,y-.01,.045),v(.08,.095,.045),8,3)
            # Pigs have a visibly curled tail, dogs a cheerful upright wagging tail.
            previous=None
            for i in range(6 if not dog else 4):
                if dog: center=v(0,.49+i*.035,.56+i*.07)
                else: a=i*1.05; center=v(math.sin(a)*.055,.51+math.cos(a)*.05,.54+i*.009)
                if previous is not None: model['tail'].add(cyl(previous,center,.036*sc,sides=6),coat)
                blob(model['tail'],coat,center,v(.035,.035,.04),6,3)
                previous=center
            if dog:
                blob(model['body'],m['strap'],v(0,-.30,.58),v(.255,.045,.21),10,4)
                blob(model['body'],m['bell'],v(0,-.358,.40),v(.05,.03,.06),8,4)
        blob.__defaults__[-1][0]=False
        return model

    def product(pid,m):
        model=Model(pid)
        if pid=='duck_egg': blob(model[None],m['egg'],(0,0,.075),(.055,.055,.075),10,6)
        else:
            brown=FM('truffle','#73503e')
            blob(model[None],brown,(0,0,.105),(.13,.12,.105),10,6)
            for x,y,z in ((.065,-.06,.17),(-.06,-.07,.15),(.02,.05,.20)):
                blob(model[None],m['wood_light'],(x,y,z),(.025,.025,.015),6,3)
        return model

    def shelter(pid,m):
        model=Model(pid)
        model[None].add(rbox((.72,.64,.07),(0,0,.035),n=8),m['wood'])
        model[None].add(rbox((.59,.52,.035),(0,0,.087),n=8),m['hay'])
        for side in (-1,1):model[None].add(rbox((.055,.65,.27),(side*.34,0,.135),n=8),m['wood_light'])
        model[None].add(rbox((.72,.055,.27),(0,.30,.135),n=8),m['wood_light'])
        if pid=='dog_shelter':
            model[None].add(rbox((.80,.73,.10),(0,0,.46),n=8),m['red'])
            model[None].add(rbox((.49,.65,.16),(0,0,.55),n=8),m['red'])
            for side in (-1,1):model[None].add(rbox((.14,.055,.31),(side*.27,-.30,.23),n=8),m['wood'])
        return model
    for pid in ('chicken_shelter','duck_shelter','cow_shelter','pig_shelter','dog_shelter'):
        g['PROPS'].append(pid);g['SIZE'][pid]=dict(h=.63 if pid=='dog_shelter' else .27,half=(.4,.37))
        g['KIND'][pid]='prop';g['BUILDERS'][pid]=lambda m,pid=pid:shelter(pid,m)

    new=['duck','duckling','pig','piglet','dog']
    g['ANIMALS'].extend(new); g['PRODUCTS'].extend(['duck_egg','truffle'])
    g['FARM_IDS']=g['ANIMALS']+g['PROPS']+g['PRODUCTS']
    for pid in new:
        g['PARTS'][pid]=g['BIRD_PARTS'] if pid.startswith('duck') else g['HOOF_PARTS']
        sc=.56 if pid in ('duckling','piglet') else 1
        g['SIZE'][pid]=dict(h=(.68 if pid.startswith('duck') else 1.0 if pid=='dog' else .94)*sc,half=((.28*sc,.49*sc) if pid.startswith('duck') else (.34*sc,.73*sc)))
        g['KIND'][pid]='animal';g['BUILDERS'][pid]=lambda m,pid=pid:animal(pid,m)
    for pid in ('duck_egg','truffle'):
        g['SIZE'][pid]=dict(h=.15 if pid=='duck_egg' else .22,half=(.055,.055) if pid=='duck_egg' else (.13,.12))
        g['KIND'][pid]='product';g['BUILDERS'][pid]=lambda m,pid=pid:product(pid,m)
        g['ICON_VIEW'][pid]=dict(elevation=28,yaw=24,margin=1.2)
    g['GLB_LIMIT']=1000*1024

    def preview(entries):
        g['stage']((1400,800),ground='#8BE36A');g['hide_all']()
        for i,pid in enumerate(new):
            g['dup'](entries[pid],((i-2)*1.65,0,0),math.radians(-25),scale=1.4 if pid.startswith('duck') else 1)
        g['game_camera'](target=(0,0,.5),ortho_scale=9)
        g['render'](g['os'].path.join(g['PREVIEWS'],'farm-expansion.webp'))
    g['preview_expansion']=preview
    # The guard dog is its own original puppy (build_farm_dog.py), cousin of the wilds' wolf.
    import build_farm_dog
    build_farm_dog.install(g)
    # The goat and the goose (build_farm_goat.py, build_farm_goose.py): each registers its adult, young animal and shelter.
    import build_farm_goat, build_farm_goose
    build_farm_goat.install(g)
    build_farm_goose.install(g)
