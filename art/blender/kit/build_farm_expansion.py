"""Original low-poly duck, pig and garden guardian additions to the farm kit.

Called by build_farm.py. Every animated piece keeps its own ground-centred root,
named rigid hinges and the existing 1,500-triangle per-animal budget.
"""
import math


def extend(g):
    Model, sphere, cyl, rbox, FM = (g[n] for n in ('Model', 'sphere', 'cyl', 'rbox', 'FM'))
    def blob(part, color, center, radii, seg=10, rings=5):
        part.add(sphere(1, seg, rings, scale=radii).moved(center), color)

    def animal(pid, m):
        bird = pid in ('duck', 'duckling')
        young = pid in ('duckling', 'piglet')
        dog = pid == 'dog'
        sc = .56 if young else 1
        def v(x,y,z): return (x*sc,y*sc,z*sc)
        if bird:
            piv = dict(body=v(0,0,.20),head=v(0,-.12,.36),wing_l=v(-.18,0,.30),wing_r=v(.18,0,.30),leg_l=v(-.09,0,.14),leg_r=v(.09,0,.14),tail=v(0,.25,.30))
        else:
            piv = dict(body=v(0,0,.40),head=v(0,-.33,.55),leg_fl=v(-.21,-.28,.30),leg_fr=v(.21,-.28,.30),leg_bl=v(-.21,.28,.30),leg_br=v(.21,.28,.30),tail=v(0,.44,.52))
        model = Model(pid,piv)
        color = '#ffde63' if pid=='duckling' else '#fffaf0' if bird else '#c98d4c' if dog else '#ffc1cd' if young else '#ffb4c0'
        coat = FM(pid,color)
        if bird:
            blob(model['body'],coat,v(0,.02,.29),v(.22,.34,.19),12,6)
            blob(model['head'],coat,v(0,-.20,.50),v(.15,.16,.18),12,6)
            # A wide, flat bill and webbed feet distinguish a duck from the existing hen.
            blob(model['head'],m['beak'],v(0,-.39,.45),v(.125,.13,.035),10,4)
            for side in (-1,1):
                blob(model['head'],m['eye'],v(side*.12,-.315,.55),v(.026,.026,.032),8,4)
                blob(model['head'],m['glint'],v(side*.128,-.335,.563),v(.009,.009,.01),6,3)
                part='wing_l' if side<0 else 'wing_r'
                blob(model[part],coat,v(side*.19,.055,.32),v(.07,.24,.10),10,4)
                leg='leg_l' if side<0 else 'leg_r'
                model[leg].add(cyl(v(side*.09,0,.13),v(side*.09,0,.025),.024*sc,sides=7),m['leg'])
                blob(model[leg],m['beak'],v(side*.09,-.055,.025),v(.085,.13,.025),8,4)
            blob(model['tail'],coat,v(0,.33,.35),v(.09,.13,.10),8,4)
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
    g['GLB_LIMIT']=640*1024

    def preview(entries):
        g['stage']((1400,800),ground='#8BE36A');g['hide_all']()
        for i,pid in enumerate(new):
            g['dup'](entries[pid],((i-2)*1.65,0,0),math.radians(-25),scale=1.4 if pid.startswith('duck') else 1)
        g['game_camera'](target=(0,0,.5),ortho_scale=9)
        g['render'](g['os'].path.join(g['PREVIEWS'],'farm-expansion.webp'))
    g['preview_expansion']=preview
