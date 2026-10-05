"""Original Play Simi game face. Based on the approved v3 face equations.
Imported by build_chibi_character.py.
Low topology surfaces preserve the approved silhouette and expression controls.
All mesh, iris and skin artwork is original. No reference asset pixels are used.
"""
import bpy, bmesh, math, os, json
import numpy as np
from pathlib import Path
from math import sin,cos,pi,sqrt
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[1]; OUT=ROOT/'art/characters/chibi';OUT.mkdir(parents=True,exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
scene=bpy.context.scene;scene.render.threads_mode='FIXED';scene.render.threads=2

def rgb(h):return tuple(int(h[i:i+2],16)/255 for i in (1,3,5))
def linear(v):return v/12.92 if v<=.04045 else ((v+.055)/1.055)**2.4
def rgba(h):return tuple(linear(v) for v in rgb(h))+(1,)
def toon(name,h,flat=.70):
    m=bpy.data.materials.new(name);m.use_nodes=True;n=m.node_tree.nodes;n.clear();link=m.node_tree.links
    out=n.new('ShaderNodeOutputMaterial');mix=n.new('ShaderNodeMixShader');mix.inputs[0].default_value=flat
    diffuse=n.new('ShaderNodeBsdfDiffuse');diffuse.inputs['Color'].default_value=rgba(h);diffuse.inputs['Roughness'].default_value=.9
    emission=n.new('ShaderNodeEmission');emission.inputs['Color'].default_value=rgba(h);emission.inputs['Strength'].default_value=1
    link.new(diffuse.outputs[0],mix.inputs[1]);link.new(emission.outputs[0],mix.inputs[2]);link.new(mix.outputs[0],out.inputs['Surface'])
    return m,diffuse,emission
skin,sd,se=toon('Warm controlled skin','#f7d9c6',.78)
lidmat,_,_=toon('Soft peach eyelids','#f7d9c6',.84)
white,_,_=toon('Warm eye white','#fffaf1',.97)
ink,_,_=toon('Warm charcoal upper lashes','#332e38',1)
hair,_,_=toon('Slate teal short hair','#405765',.52)
hairlight,_,_=toon('Soft hair highlight','#607d88',.75)
shirt,_,_=toon('Neutral ivory shoulder study','#e4e2df',.5)
neckmat,_,_=toon('Warm neck and ears','#f0cbb6',.65)
mouthmat,_,_=toon('Mouth interior','#7a4149',1)
tonguemat,_,_=toon('Smile tongue','#dfa094',1)
# Skin paint contains only diffuse cheek/nose colour. Eyes and mouth are meshes.
N=1024
X,Z=np.meshgrid(np.linspace(-.55,.55,N),np.linspace(1.20,2.12,N))
C=np.empty((N,N,4),np.float32);C[:,:,:3]=rgb('#f7d9c6');C[:,:,3]=1

def paint(h,a):
    a=np.clip(a,0,1)[...,None];C[:,:,:3]=C[:,:,:3]*(1-a)+np.array(rgb(h))*a
for s in [-1,1]:
    paint('#eaa397',np.exp(-(((X-s*.321)/.084)**2+((Z-1.395)/.047)**2)*1.7)*.48)
    # Two restrained small blush strokes keep expression readable at small scale.
    for k in [-1,1]:
        q=(X-(s*.321+k*.014))/.0022;r=(Z-1.384)/.009
        paint('#c68780',np.exp(-(q*q+r*r)*2)*.28)
paint('#d7a594',np.exp(-((X/.013)**2+((Z-1.407)/.009)**2))* .12)
skinimg=bpy.data.images.new('Original cheek and nose paint',width=N,height=N,alpha=True);skinimg.pixels.foreach_set(C.ravel());skinimg.filepath_raw=str(OUT/'skin-paint.png');skinimg.file_format='PNG';skinimg.save();skinimg.pack()
tex=skin.node_tree.nodes.new('ShaderNodeTexImage');tex.image=skinimg
skin.node_tree.links.new(tex.outputs['Color'],sd.inputs['Color']);skin.node_tree.links.new(tex.outputs['Color'],se.inputs['Color'])
# Dark simple blue iris. A broad low blue pool and deliberate white gleam replace
# radial ornament, multiple rings and tiny dots.
N=512;U,V=np.meshgrid(np.linspace(-1,1,N),np.linspace(-1,1,N))
I=np.empty((N,N,4),np.float32);I[:,:,:3]=rgb('#34333f');I[:,:,3]=1
f=np.clip((-V+.2)/1.5,0,1)[...,None]
I[:,:,:3]=np.array(rgb('#292833'))*(1-f)+np.array(rgb('#414454'))*f
pool=np.clip((1-np.sqrt(((U+.01)/.73)**2+((V+.60)/.37)**2))/.12+.5,0,1)[...,None]
I[:,:,:3]=I[:,:,:3]*(1-pool)+np.array(rgb('#8aaac1'))*pool
shine=np.clip((1-np.sqrt(((U+.30)/.25)**2+((V-.71)/.245)**2))/.03+.5,0,1)[...,None]
I[:,:,:3]=I[:,:,:3]*(1-shine)+np.array(rgb('#fffef8'))*shine
irisimg=bpy.data.images.new('Original simple blue iris',width=N,height=N,alpha=True);irisimg.pixels.foreach_set(I.ravel());irisimg.filepath_raw=str(OUT/'iris-paint.png');irisimg.file_format='PNG';irisimg.save();irisimg.pack()
irismat,di,em=toon('Graphic dark blue iris','#ffffff',1);tex=irismat.node_tree.nodes.new('ShaderNodeTexImage');tex.image=irisimg;irismat.node_tree.links.new(tex.outputs['Color'],di.inputs['Color']);irismat.node_tree.links.new(tex.outputs['Color'],em.inputs['Color'])

def mesh(name,vs,fs,mat,sub=0):
    me=bpy.data.meshes.new(name);me.from_pydata(vs,[],fs);me.update();bm=bmesh.new();bm.from_mesh(me);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(me);bm.free()
    ob=bpy.data.objects.new(name,me);scene.collection.objects.link(ob);me.materials.append(mat)
    for p in me.polygons:p.use_smooth=True
    if sub:mod=ob.modifiers.new('Smooth shape','SUBSURF');mod.levels=sub;mod.render_levels=sub
    return ob

def ell(name,c,r,mat):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=12,ring_count=8,location=c);ob=bpy.context.object;ob.name=name;ob.scale=r;ob.data.materials.append(mat)
    for p in ob.data.polygons:p.use_smooth=True
    return ob

def line(name,pts,r,mat):
    cu=bpy.data.curves.new(name,'CURVE');cu.dimensions='3D';cu.resolution_u=4;cu.bevel_depth=r;cu.bevel_resolution=1
    sp=cu.splines.new('BEZIER');sp.bezier_points.add(len(pts)-1)
    for b,p in zip(sp.bezier_points,pts):b.co=p;b.handle_left_type='AUTO';b.handle_right_type='AUTO'
    ob=bpy.data.objects.new(name,cu);scene.collection.objects.link(ob);ob.data.materials.append(mat);return ob

# The lower head occupies only 0.15m below the eye apertures. Cheeks are rounded
# and broad near the eye baseline, narrowing immediately into the small chin.
RS=[(1.25,.035,.035,.035),(1.263,.15,.112,.025),(1.289,.285,.206,.028),(1.325,.374,.264,.037),(1.385,.438,.305,.052),(1.412,.452,.316,.056),(1.435,.463,.325,.059),(1.46,.47,.333,.062),(1.555,.472,.350,.070),(1.675,.455,.360,.082),(1.79,.40,.335,.085),(1.89,.30,.270,.085),(1.975,.14,.145,.070),(2.00,.018,.018,.060)]
def nose_projection(x,z):
    # A small continuous nose and soft muzzle give the profile a readable break.
    # This is part of the skin mesh, not another floating facial ornament.
    return .100*math.exp(-((x/.058)**2+((z-1.415)/.043)**2))+.012*math.exp(-((x/.12)**2+((z-1.348)/.045)**2))
def surf(x,z):
    rx=float(np.interp(z,[r[0] for r in RS],[r[1] for r in RS]));ry=float(np.interp(z,[r[0] for r in RS],[r[2] for r in RS]));cy=float(np.interp(z,[r[0] for r in RS],[r[3] for r in RS]));q=max(.015,1-(x/max(rx,.01))**2)
    return cy-ry*q**.48-nose_projection(x,z)
vs=[];fs=[];n=24
for z,rx,ry,cy in RS:
    for i in range(n):
        a=2*pi*i/n;ca=cos(a);x=rx*sin(a);y=cy-ry*math.copysign(abs(ca)**.96,ca)
        if ca>0:y-=nose_projection(x,z)
        vs.append((x,y,z))
for j in range(len(RS)-1):
    for i in range(n):fs.append((j*n+i,(j+1)*n+i,(j+1)*n+(i+1)%n,j*n+(i+1)%n))
fs += [tuple(reversed(range(n))),tuple((len(RS)-1)*n+i for i in range(n))]
head=mesh('Compact rounded human head',vs,fs,skin,1);uv=head.data.uv_layers.new(name='Cheek colour projection')
for poly in head.data.polygons:
    for li in poly.loop_indices:
        v=vs[head.data.loops[li].vertex_index];uv.data[li].uv=((v[0]+.55)/1.1,(v[2]-1.2)/.92)
bpy.context.view_layer.objects.active=head;head.select_set(True);bpy.ops.object.modifier_apply(modifier='Smooth shape')
control=bpy.data.objects.new('FACE EXPRESSION CONTROLS',None);scene.collection.objects.link(control)
for prop in ['blink','smile']:
    control[prop]=0.0;control.id_properties_ui(prop).update(min=0,max=1,description='Continuous '+prop+' expression')
control['gaze_x']=0.0;control.id_properties_ui('gaze_x').update(min=-.025,max=.025,description='Horizontal iris gaze offset')
def drive(key,prop,expression=None):
    dr=key.driver_add('value').driver;dr.type='SCRIPTED';v=dr.variables.new();v.name='amount';v.type='SINGLE_PROP';v.targets[0].id=control;v.targets[0].data_path='["'+prop+'"]';dr.expression=expression or 'amount'

EYE_Z=1.548; RX=.123

def bounds(x,cx,side):
    q=max(-1,min(1,(x-cx)/RX));a=max(0,1-q*q)
    return EYE_Z+.144*a**.60+side*q*.007,EYE_Z-.139*a**.57+side*q*.007

def outline(cx,side,n=24):
    pts=[]
    for i in range(n):
        a=2*pi*i/n;x=cx+RX*cos(a);hi,lo=bounds(x,cx,side);pts.append((x,hi if sin(a)>=0 else lo))
    return pts

def eyey(x,z,cx):
    q=((x-cx)/RX)**2+((z-EYE_Z)/.145)**2
    return surf(x,z)-.006-.010*max(0,1-q)

def disk(name,contour,c,mat,centre_uv=None,depth=0):
    # Concentric tessellation conforms to a shallow curved eye surface.
    n=len(contour);vs=[(c[0],eyey(c[0],c[1],c[0])-depth,c[1])];fs=[];coords=[(.5,.5)]
    for row in range(1,3):
        t=row/2
        for i,(x,z) in enumerate(contour):
            px=c[0]+t*(x-c[0]);pz=c[1]+t*(z-c[1]);vs.append((px,eyey(px,pz,c[0])-depth,pz));coords.append((.5+.5*t*cos(2*pi*i/n),.5+.5*t*sin(2*pi*i/n)))
    for i in range(n):fs.append((0,1+i,1+(i+1)%n))
    for row in range(1):
        for i in range(n):fs.append((1+row*n+i,1+(row+1)*n+i,1+(row+1)*n+(i+1)%n,1+row*n+(i+1)%n))
    ob=mesh(name,vs,fs,mat)
    uv=ob.data.uv_layers.new(name='Eye artwork')
    for poly in ob.data.polygons:
        for li in poly.loop_indices:uv.data[li].uv=coords[ob.data.loops[li].vertex_index]
    return ob

def finish_lid(ob,control,skinimg):
    """Match closed lids to the face and overlap the socket border cleanly.
    Neutral geometry and its shader are preserved exactly.
    """
    if ob.get('lid_closure_revision')==1:return
    key=ob.data.shape_keys.key_blocks['Blink']
    cx=sum(v.co.x for v in key.data)/len(key.data)
    sign=1 if ob.name.startswith('Upper') else -1
    for i,v in enumerate(key.data):
        v.co.x=cx+(v.co.x-cx)*1.023
        v.co.y-=.003
        v.co.z+=sign*.005*(1-(i//13)/2)
    uv=ob.data.uv_layers.new(name='Closed skin projection')
    for poly in ob.data.polygons:
        for li in poly.loop_indices:
            co=key.data[ob.data.loops[li].vertex_index].co
            uv.data[li].uv=((co.x+.55)/1.1,(co.z-1.2)/.92)
    material=bpy.data.materials.get('Lid skin matching face')
    if material is None:
        material=bpy.data.materials['Soft peach eyelids'].copy();material.name='Lid skin matching face'
        nodes=material.node_tree.nodes;links=material.node_tree.links
        output=next(n for n in nodes if n.type=='OUTPUT_MATERIAL')
        original=output.inputs['Surface'].links[0].from_socket
        coord=nodes.new('ShaderNodeUVMap');coord.uv_map='Closed skin projection'
        texture=nodes.new('ShaderNodeTexImage');texture.image=skinimg;links.new(coord.outputs['UV'],texture.inputs['Vector'])
        diffuse=nodes.new('ShaderNodeBsdfDiffuse');diffuse.inputs['Roughness'].default_value=.9
        emission=nodes.new('ShaderNodeEmission');emission.inputs['Strength'].default_value=1
        links.new(texture.outputs['Color'],diffuse.inputs['Color']);links.new(texture.outputs['Color'],emission.inputs['Color'])
        flat=nodes.new('ShaderNodeMixShader');flat.inputs[0].default_value=.78
        links.new(diffuse.outputs[0],flat.inputs[1]);links.new(emission.outputs[0],flat.inputs[2])
        mix=nodes.new('ShaderNodeMixShader');links.new(original,mix.inputs[1]);links.new(flat.outputs[0],mix.inputs[2]);links.new(mix.outputs[0],output.inputs['Surface'])
        driver=mix.inputs[0].driver_add('default_value').driver
        variable=driver.variables.new();variable.name='blink';variable.type='SINGLE_PROP';variable.targets[0].id=control;variable.targets[0].data_path='["blink"]';driver.expression='blink'
    ob.data.materials[0]=material;ob['lid_closure_revision']=1

for side in [-1,1]:
    cx=side*.205;pts=outline(cx,side)
    # Shallow conforming eyes sit above the continuous game head.
    disk('Curved sclera '+str(side),pts,(cx,EYE_Z),white)
    ip=[(cx+.095*cos(2*pi*i/24),EYE_Z-.002+.135*sin(2*pi*i/24)) for i in range(24)]
    iris=disk('Curved original iris '+str(side),ip,(cx,EYE_Z-.002),irismat,depth=.002)
    dr=iris.driver_add('location',0).driver;v=dr.variables.new();v.name='gaze';v.type='SINGLE_PROP';v.targets[0].id=control;v.targets[0].data_path='["gaze_x"]';dr.expression='gaze'
    # Upper and lower lid grids bridge the opening as Blink moves from 0 to 1.
    # At full blink the two curved skin sheets meet at the same resting line.
    for upper in [True,False]:
        vs=[];closed=[];fs=[];columns=12;rows=2
        for j in range(rows+1):
            t=j/rows
            for i in range(columns+1):
                q=i/columns*2-1;x=cx+RX*q;hi,lo=bounds(x,cx,side);edge=hi if upper else lo
                shut=EYE_Z-.023+.012*(1-q*q)
                z=edge+(.006 if upper else -.004)*(1-t)
                cz=edge*(1-t)+shut*t
                # A shallow outward bow keeps the lid outside the curved eyeball.
                yy=surf(x,z)-.012;cy=surf(x,cz)-.026
                vs.append((x,yy,z));closed.append((x,cy,cz))
        for j in range(rows):
            for i in range(columns):fs.append((j*(columns+1)+i,j*(columns+1)+i+1,(j+1)*(columns+1)+i+1,(j+1)*(columns+1)+i))
        lid=mesh(('Upper' if upper else 'Lower')+' controllable lid '+str(side),vs,fs,lidmat)
        lid.shape_key_add(name='Open');key=lid.shape_key_add(name='Blink')
        for v,p in zip(key.data,closed):v.co=p
        drive(key,'blink')
        finish_lid(lid,control,skinimg)
    # Thick intentional upper silhouette, tapered at the inner corner.
    vs=[];shut=[];fs=[];steps=20
    for i in range(steps+1):
        q=i/steps*2-1;x=cx+RX*q;hi,lo=bounds(x,cx,side);width=.006+.009*sqrt(max(0,1-q*q))+.004*max(0,q*side)
        close=EYE_Z-.023+.012*(1-q*q)
        for sign in [-1,1]:
            z=hi+sign*width*.5;vs.append((x,surf(x,z)-.016,z));shut.append((x,surf(x,close)-.031,close+sign*.005))
        if i<steps:fs.append((i*2,i*2+1,i*2+3,i*2+2))
    lash=mesh('Strong upper lash '+str(side),vs,fs,ink)
    lash.shape_key_add(name='Open');key=lash.shape_key_add(name='Blink')
    for v,p in zip(key.data,shut):v.co=p
    drive(key,'blink')
    # Small relaxed brow, separated from the lid.
    line('Soft brow '+str(side),[(cx-.075,surf(cx-.075,1.728)-.006,1.728),(cx, surf(cx,1.752)-.006,1.752),(cx+.070,surf(cx+.070,1.733)-.006,1.733)],.005,hair)
# Tiny facial mouth has a real editable Smile shape key, plus a tongue that
# appears only as the mouth opens. A short eye-to-mouth gap carries the expression.
def mouth_geometry(smile):
    contour=[]
    for i in range(24):
        a=2*pi*i/24
        if smile:x=.073*cos(a);z=1.348+(.025 if sin(a)>0 else .052)*sin(a)
        else:x=.038*cos(a);z=1.348+.006*sin(a)+.011*(cos(a)**2)
        contour.append((x,surf(x,z)-.010,z))
    vs=[(0,surf(0,1.343)-.011,1.343)]+contour
    return vs,[(0,i+1,(i+1)%24+1) for i in range(24)]
a,fs=mouth_geometry(False);b,_=mouth_geometry(True);mouth=mesh('Expressive mouth',a,fs,mouthmat)
mouth.shape_key_add(name='Neutral');key=mouth.shape_key_add(name='Smile')
for v,p in zip(key.data,b):v.co=p
drive(key,'smile')
# Tongue lies in the lower half of the smiling mouth; collapses inside neutral.
vs=[];closed=[];fs=[]
for i in range(49):
    a=2*pi*i/48;x=.051*cos(a);z=1.315+.014*sin(a);vs.append((x,surf(x,z)-.013,z));closed.append((x*.001,surf(0,1.348)+.006,1.348))
ob=mesh('Smile tongue',closed,[tuple(range(48))],tonguemat);ob.shape_key_add(name='Hidden');key=ob.shape_key_add(name='Smile')
for v,p in zip(key.data,vs):v.co=p
drive(key,'smile')
for side in [-1,1]:ell('Small human ear '+str(side),(side*.46,.080,1.48),(.055,.044,.074),neckmat)
# Short, asymmetrical slate hair is an original neutral framing shape, without
# animal ears, visor, collar, hairpins or any Mamehinata costume identifiers.
vs=[];fs=[];n=40;rows=14
for j in range(rows+1):
    t=j/rows
    for i in range(n):
        a=2*pi*i/n;front=max(0,cos(a));end=1.40+.385*front**2;theta=math.acos((end-1.65)/.414)*t
        vs.append((.504*sin(theta)*sin(a),.100-.410*sin(theta)*cos(a),1.65+.414*cos(theta)))
for j in range(rows):
    for i in range(n):fs.append((j*n+i,j*n+(i+1)%n,(j+1)*n+(i+1)%n,(j+1)*n+i))
mesh('Continuous short hair cap',vs,fs,hair,0)
def bez(a,b,c,d,n=12):
    a,b,c,d=map(Vector,(a,b,c,d));return [a*(1-t)**3+b*3*(1-t)**2*t+c*3*(1-t)*t*t+d*t**3 for t in [i/(n-1) for i in range(n)]]
def fringe(name,a,b,c,d,w):
    path=bez(a,b,c,d,n=16);vs=[];fs=[];cross=5
    for j,p in enumerate(path):
        t=j/(len(path)-1);tan=path[min(j+1,len(path)-1)]-path[max(0,j-1)];across=Vector((-tan.z,0,tan.x)).normalized();width=w*(.04+.96*sin(pi*t*.75))*(1-t**4*.994)
        for k in range(cross+1):
            u=k/cross*2-1;v=p+across*width*u;v.z=min(v.z,1.65+.414*sqrt(max(.018,1-(v.x/.504)**2))-.002);yy=.100-.410*sqrt(max(.018,1-(v.x/.504)**2-((v.z-1.65)/.414)**2))
            vs.append((v.x,yy-.004-.008*(1-u*u)*sin(pi*t),v.z))
    for j in range(len(path)-1):
        for k in range(cross):fs.append((j*(cross+1)+k,j*(cross+1)+k+1,(j+1)*(cross+1)+k+1,(j+1)*(cross+1)+k))
    mesh(name,vs,fs,hair,0)
fringes=[
 ((-.10,0,2.04),(-.27,0,2.02),(-.43,0,1.81),(-.427,0,1.53),.12),
 ((-.08,0,2.045),(-.23,0,2.01),(-.34,0,1.84),(-.285,0,1.743),.108),
 ((-.065,0,2.045),(-.08,0,1.97),(-.11,0,1.82),(-.18,0,1.756),.104),
 ((-.05,0,2.045),(.14,0,2.01),(.20,0,1.83),(.07,0,1.713),.132),
 ((-.033,0,2.045),(.30,0,2.02),(.40,0,1.82),(.355,0,1.695),.118),
 ((-.02,0,2.04),(.35,0,1.99),(.49,0,1.72),(.43,0,1.505),.106),
]
for i,args in enumerate(fringes):fringe('Short swept fringe %02d'%i,*args)
# A restrained diffuse graphic sheen replaces realistic specular hair mottling.
# Hair is left matte and neutral to keep attention on the face.
