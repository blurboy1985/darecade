"""Author synchronized player/prop clips in Blender, with editable preview avatars.
Coordinates in helpers are game coordinates (X right, Y up, Z forward).
The exported controller rig retargets to the player's current outfit in Three.js.
"""
import bpy, math, os, json
from mathutils import Quaternion

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'public', 'models', 'interactions')
MASTER = os.path.join(ROOT, 'art', 'interactions')
os.makedirs(OUT, exist_ok=True)
os.makedirs(MASTER, exist_ok=True)
FPS = 30
manifest = {}

def xyz(p): return (p[0], -p[2], p[1])
def smooth(a, b, t):
    u = max(0, min(1, t)); u = u*u*(3-2*u)
    return a+(b-a)*u
def lerp(a,b,u): return tuple(smooth(x,y,u) for x,y in zip(a,b))
def material(name, rgb):
    m = bpy.data.materials.new(name); m.diffuse_color=(*rgb,1); m.use_nodes=True
    bsdf=m.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value=(*rgb,1)
    bsdf.inputs['Roughness'].default_value=.82
    return m
def empty(name, p=(0,0,0), parent=None):
    o=bpy.data.objects.new(name,None); bpy.context.collection.objects.link(o)
    o.location=xyz(p); o.parent=parent; o.rotation_mode='QUATERNION'
    return o
def rotate(o, pitch=0, yaw=0, roll=0):
    o.rotation_quaternion=Quaternion((0,0,1),yaw) @ Quaternion((1,0,0),pitch) @ Quaternion((0,-1,0),roll)
def cube(name,p,size,mat,parent=None,preview=False):
    bpy.ops.mesh.primitive_cube_add(size=1)
    o=bpy.context.object; o.name=name; o.dimensions=(size[0],size[2],size[1])
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    o.location=xyz(p); o.parent=parent; o.data.materials.append(mat); o.rotation_mode='QUATERNION'
    if preview:o['preview_avatar']=True
    return o
def ball(name,p,r,mat,parent=None):
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2,radius=r)
    o=bpy.context.object; o.name=name; o.location=xyz(p);o.parent=parent;o.data.materials.append(mat);o.rotation_mode='QUATERNION'
    return o
def rod(name,a,b,r,mat,parent=None):
    from mathutils import Vector
    va,vb=Vector(xyz(a)),Vector(xyz(b));d=vb-va
    bpy.ops.mesh.primitive_cylinder_add(vertices=10,radius=r,depth=d.length)
    o=bpy.context.object;o.name=name;o.location=(va+vb)/2;o.rotation_mode='QUATERNION';o.rotation_quaternion=d.to_track_quat('Z','Y');o.parent=parent;o.data.materials.append(mat)
    return o
def key(o,frame):
    for prop in ['location','rotation_quaternion','scale']:o.keyframe_insert(data_path=prop,frame=frame)
def rig(mats):
    root=empty('PlayerRig');root['controller']='player'
    cube('Preview_body',(0,.95,0),(.6,.64,.4),mats['lime'],root,True)
    cube('Preview_head',(0,1.52,0),(.62,.58,.55),mats['skin'],root,True)
    cube('Preview_hair',(0,1.84,0),(.66,.14,.58),mats['ink'],root,True)
    for x in [-.14,.14]:cube('Preview_eye',(x,1.52,.28),(.07,.07,.03),mats['ink'],root,True)
    parts={}
    for name,x,y in [('LeftArm',-.42,1.18),('RightArm',.42,1.18),('LeftLeg',-.18,.67),('RightLeg',.18,.67)]:
        o=empty(name,(x,y,0),root);parts[name]=o
        arm='Arm' in name
        cube('Preview_'+name,(0,-.22,0),(.23,.46,.3),mats['lime'] if arm else mats['ink'],o,True)
        cube('Preview_tip',(0,-.46,.06),(.25,.15,.32),mats['skin'] if arm else mats['cream'],o,True)
    return root,parts

def build(kind,duration):
    bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
    scene=bpy.context.scene;scene.render.fps=FPS;scene.frame_start=0;scene.frame_end=int(duration*FPS)
    mats={n:material(n,c) for n,c in {'lime':(.66,.82,.37),'skin':(.86,.61,.4),'ink':(.12,.18,.25),'cream':(.93,.87,.71),'teal':(.24,.52,.5),'gold':(.96,.68,.31),'coral':(.91,.48,.39),'paper':(.97,.92,.79),'orange':(.75,.43,.24)}.items()}
    root,parts=rig(mats); animated=[]
    if kind=='swing':
        for x in [-1.35,1.35]:
            for z in [-.9,.9]:rod('A_frame',(x,0,z),(x,3.15,0),.09,mats['teal'])
        rod('Top_bar',(-1.5,3.15,0),(1.5,3.15,0),.11,mats['gold'])
        pivot=empty('SwingPivot',(0,3.05,0));animated.append(pivot)
        for x in [-.62,.62]:rod('Swing_chain',(x,0,0),(x,-2.38,0),.027,mats['cream'],pivot)
        cube('Swing_seat',(0,-2.38,0),(1.45,.15,.6),mats['coral'],pivot)
        for x in [-1.35,1.35]:cube('Footing',(x,.06,0),(.35,.12,2.15),mats['cream'])
    elif kind=='bench':
        book=empty('Book',(0,1.02,.52));animated.append(book)
        cube('Book_spine',(0,0,0),(.06,.06,.43),mats['teal'],book)
        covers=[]
        for side in [-1,1]:
            cover=empty('Book_cover',parent=book);covers.append(cover);animated.append(cover)
            cube('Cover',(side*.21,0,0),(.4,.045,.45),mats['teal'],cover)
            cube('Pages',(side*.21,.032,0),(.37,.035,.41),mats['paper'],cover)
        page=empty('Turning_page',parent=book);animated.append(page)
        cube('Paper_leaf',(.20,.06,0),(.37,.012,.4),mats['cream'],page)
    elif kind=='pet':
        cat=empty('KopiBody');animated.append(cat)
        body=ball('Kopi_body',(0,.42,0),.37,mats['orange'],cat);body.scale=(1,.85,1)
        head=ball('Kopi_head',(0,.78,.15),.3,mats['gold'],cat)
        for x in [-.19,.19]:
            bpy.ops.mesh.primitive_cone_add(vertices=3,radius1=.15,depth=.25)
            o=bpy.context.object;o.name='Kopi_ear';o.location=xyz((x,1,.12));o.parent=cat;o.data.materials.append(mats['orange'])
            ball('Eye',(x*.6,.8,.414),.036,mats['ink'],cat)
            cube('Paw',(x,.17,.17),(.16,.13,.26),mats['cream'],cat)
        tail=empty('KopiTail',(.2,.35,-.2),cat);animated.append(tail)
        rod('Tail',(0,0,0),(.3,.35,-.3),.075,mats['orange'],tail)
        heart=empty('Happy_heart',(0,1.5,.1));animated.append(heart)
        for x in [-.07,.07]:ball('Heart_lobe',(x,.04,0),.1,mats['coral'],heart)
        h=cube('Heart_tip',(0,-.045,0),(.15,.15,.07),mats['coral'],heart);rotate(h,roll=math.pi/4)
    elif kind=='arcade':
        stick=empty('CabinetJoystick',(-.37,1.73,.98));animated.append(stick)
        rod('Joystick_stem',(0,0,0),(0,.25,0),.055,mats['ink'],stick)
        ball('Joystick_grip',(0,.25,0),.11,mats['coral'],stick)
        buttons=[]
        for x in [.3,.57]:
            o=ball('Arcade_button',(x,1.65,1.02),.1,mats['gold']);buttons.append(o);animated.append(o)
        pixels=[]
        for i in range(6):
            o=cube('Screen_pixel',(-.43+i*.17,2.18+(i%2)*.18,.755),(.12,.12,.025),mats['lime']);pixels.append(o);animated.append(o)
    elif kind=='bell':
        bell=empty('BicycleBell',(0,1.68,0));animated.append(bell)
        b=ball('Bell_dome',(0,0,0),.135,mats['gold'],bell);b.scale=(1,1,.7)
        lever=cube('Bell_lever',(.15,-.04,0),(.15,.04,.05),mats['ink'],bell)
        rings=[]
        for i in range(2):
            bpy.ops.mesh.primitive_torus_add(major_segments=24,minor_segments=6,major_radius=.2,minor_radius=.015)
            o=bpy.context.object;o.name='Sound_ring';o.location=xyz((0,1.7,0));o.data.materials.append(mats['cream']);o.rotation_mode='QUATERNION';rings.append(o);animated.append(o)
    elif kind=='dragon':
        stars=[]
        for i in range(5):
            o=ball('Slide_sparkle',(3.1+(i-2)*.27,.8+(i%2)*.3,.15),.1,mats['gold']);stars.append(o);animated.append(o)

    for frame in range(scene.frame_end+1):
        t=frame/FPS; p=(0,.1,1.8);yaw=0;pitch=0;arms=[0,0];legs=[0,0];roll=0
        if kind=='swing':
            angle=math.sin((t-1.5)*2.65)*.48*min(1,max(0,(t-1.5)/1.2))*min(1,max(0,(7.5-t)/1.2)) if 1.5<t<7.5 else 0
            rotate(pivot,pitch=angle)
            seated=(0,3.05-2.92*math.cos(angle),-2.92*math.sin(angle))
            p=lerp((0,.1,1.9),seated,t/1.4) if t<1.4 else seated if t<7.5 else lerp(seated,(0,.1,1.9),(t-7.5)/1.5)
            sit=min(1,t/1.4,max(0,(9-t)/1.5));legs=[-1.4*sit]*2;arms=[-1.6*sit]*2;pitch=angle
        elif kind=='bench':
            sit=min(1,t/1.5,max(0,(8-t)/1.5));p=(0,smooth(.1,.08,sit),smooth(1.8,.08,sit));legs=[-1.4*sit]*2;arms=[-1.25*sit]*2
            book.scale=(max(.001,smooth(0,1,(t-1.1)/.6)*smooth(1,0,(t-6.2)/.4)),)*3
            for side,c in zip([-1,1],covers):rotate(c,roll=side*smooth(1.45,.08,(t-1.4)/.8))
            rotate(page,roll=-math.pi*(.5+.5*math.sin(t*2.4)))
        elif kind=='pet':
            u=min(1,t/1.3,max(0,(6-t)/1.2));p=lerp((1.4,.1,.8),(.62,-.05,.8),u);yaw=-2.5;pitch=.25*u;legs=[-.8*u,-1.1*u];arms=[-.3*u,(-1.2+.12*math.sin(t*8))*u]
            cat.location=xyz((0,.05*math.sin(t*3)*u,0));rotate(cat,roll=.1*math.sin(t*2)*u);rotate(tail,yaw=math.sin(t*5)*.45*u)
            heart.scale=(max(.001,u*.7),)*3;heart.location=xyz((0,1.5+.08*math.sin(t*4),.1))
        elif kind=='arcade':
            u=min(1,t/.8,max(0,(4.2-t)/.7));p=(0,smooth(.1,.48,u),smooth(2.5,1.5,u));yaw=math.pi;arms=[(-1.25+.15*math.sin(t*9))*u,(-1.25+.16*math.sin(t*12))*u]
            rotate(stick,pitch=.18*math.sin(t*7)*u,roll=.2*math.cos(t*6)*u)
            for i,b in enumerate(buttons):b.location=xyz(([.3,.57][i],1.65-.045*max(0,math.sin(t*12+i))*u,1.02))
            for i,b in enumerate(pixels):b.scale=(max(.001,u*(.5+.5*math.sin(t*6+i))),)*3
        elif kind=='bell':
            u=min(1,t/.8,max(0,(3.2-t)/.8));p=lerp((.8,.1,1.5),(.25,.1,.8),u);yaw=-2.8;arms=[-.2*u,-1.85*u]
            rotate(bell,roll=math.sin(t*35)*.2*u)
            for i,r in enumerate(rings):
                a=((t-1-i*.2)%1.0);s=1+a*4 if .8<t<2.5 else .001;r.scale=(s,s,s)
        elif kind=='dragon':
            pts=[(3.5,.1,-2.65),(1.15,.3,-2.65),(1.15,1.61,-.45),(1.15,1.61,0),(1.15,1.13,0),(3.1,-.02,0),(3.5,.1,1.7)]
            times=[0,1.5,4,4.7,5.2,6.8,8.5]
            i=next((j for j in range(6) if t<times[j+1]),5);u=min(1,(t-times[i])/(times[i+1]-times[i]));p=lerp(pts[i],pts[i+1],u)
            dx=pts[i+1][0]-pts[i][0];dz=pts[i+1][2]-pts[i][2];yaw=math.atan2(dx,dz) if dx or dz else math.pi/2
            if i==4:
                p=(1.15+1.95*u,-.02+1.15*(1-u)**2,0);legs=[-1.4]*2;arms=[-1.1]*2
            elif i==3: legs=[-1.4*u]*2;arms=[-1.1*u]*2
            else:legs=[math.sin(t*10)*.5,-math.sin(t*10)*.5];arms=[-legs[0]*.6,-legs[1]*.6]
            for n,s in enumerate(stars):
                a=max(0,min(1,(t-6.3)/.3))*max(0,min(1,(8-t)/.6));s.scale=(max(.001,a),)*3;s.location=xyz((3.1+(n-2)*.27,.8+(n%2)*.3+max(0,t-6.3)*.35,.15))
        root.location=xyz(p);rotate(root,pitch=pitch,yaw=yaw,roll=roll)
        for part,a in zip(['LeftArm','RightArm','LeftLeg','RightLeg'],arms+legs):rotate(parts[part],pitch=a)
        for o in [root,*parts.values(),*animated]:key(o,frame)

    scene.frame_set(0)
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(MASTER,kind+'.blend'))
    bpy.ops.export_scene.gltf(filepath=os.path.join(OUT,kind+'.glb'),export_format='GLB',export_yup=True,export_extras=True,export_animations=True,export_animation_mode='SCENE',export_frame_range=True,export_force_sampling=True)
    manifest[kind]={'duration':duration,'frames':scene.frame_end+1,'source':'art/interactions/'+kind+'.blend'}

for kind,duration in [('swing',9),('bench',8),('pet',6),('arcade',4.2),('bell',3.2),('dragon',8.5)]:build(kind,duration)
with open(os.path.join(OUT,'manifest.json'),'w') as f:json.dump(manifest,f,indent=2)
print('EXPORTED six Blender interaction scenes')
