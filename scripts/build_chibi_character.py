"""Build the original Play Simi modular wardrobe with Blender 5.2.

The approved v3 face is rebuilt at game topology by build_chibi_face.py.
Only the CC0 KayKit rest skeleton is reused. Visible meshes and every atlas
pixel are original.
CHIBI_RENDER_ALL=1 also renders the complete outfit/contact and expressions.
"""
import bpy, bmesh, math, json, os, runpy
import numpy as np
from pathlib import Path
from mathutils import Vector, Quaternion
from math import sin, cos, pi, sqrt
ROOT=Path(__file__).resolve().parents[1]; OUT=ROOT/'art/characters/chibi';OUT.mkdir(parents=True,exist_ok=True)
# This focused builder shares the approved face's equations and expression keys.
face=runpy.run_path(str(ROOT/'scripts/build_chibi_face.py'))
face_objects=[o for o in bpy.data.objects if o.type in {'MESH','CURVE'}]
for ob in face_objects:
    if ob.type=='CURVE':
        bpy.ops.object.select_all(action='DESELECT');ob.select_set(True);bpy.context.view_layer.objects.active=ob;bpy.ops.object.convert(target='MESH')
    for mod in list(ob.modifiers):
        bpy.context.view_layer.objects.active=ob
        if not ob.data.shape_keys:bpy.ops.object.modifier_apply(modifier=mod.name)
    if ob.data.shape_keys:
        ob.data.shape_keys.animation_data_clear()
# Original packed atlas. Coordinates documented in README and budgets.json.
COLORS=['#f7d9c6','#fffaf1','#332e38','#663b37','#bd6950','#f3c878','#92a4ac','#e8eded',
'#64b7a4','#418e86','#f8dc8f','#25384b','#435d71','#b9d9db','#ea9191','#7a4149',
'#462b36','#6a433c','#a57256','#405765','#607d88','#343142','#696477','#957564',
'#18273f','#366994','#6fc6ce','#b1f5e5','#fffefa','#d1edf5','#eee0bc','#dfa094']
def rgb(h):return tuple(int(h[i:i+2],16)/255 for i in (1,3,5))
px=np.ones((512,512,4),np.float32)
for y in range(256,512):
    row=3-(y-256)//64
    for x in range(512):
        # Controlled matte colour with a slight diffuse painted gradient.
        k=.98+.04*((y-256)%64)/63
        px[y,x,:3]=np.array(rgb(COLORS[row*8+x//64]))*k
skin_pixels=np.array(face['skinimg'].pixels[:],np.float32).reshape(1024,1024,4)
iris_pixels=np.array(face['irisimg'].pixels[:],np.float32).reshape(512,512,4)
px[:256,:256]=skin_pixels[::4,::4];px[:256,256:]=iris_pixels[::2,::2]
img=bpy.data.images.new('Simi original packed atlas',width=512,height=512,alpha=True);img.pixels.foreach_set(px.ravel());img.filepath_raw=str(OUT/'palette.png');img.file_format='PNG';img.save();img.pack()
materials={}
for name in ['rogue','mage','knight','barbarian']:
    mat=bpy.data.materials.new(name);mat.use_nodes=True;bs=mat.node_tree.nodes.get('Principled BSDF');bs.inputs['Roughness'].default_value=1;bs.inputs['Specular IOR Level'].default_value=.12
    tex=mat.node_tree.nodes.new('ShaderNodeTexImage');tex.image=img;tex.interpolation='Linear';mat.node_tree.links.new(tex.outputs['Color'],bs.inputs['Base Color']);mat.node_tree.links.new(tex.outputs['Color'],bs.inputs['Emission Color']);bs.inputs['Emission Strength'].default_value=.38
    materials[name]=mat
bpy.ops.import_scene.gltf(filepath=str(ROOT/'public/models/neighbour-kaykit.glb'))
rig=next(o for o in bpy.data.objects if o.type=='ARMATURE')
for o in list(bpy.data.objects):
    if o not in face_objects and o!=rig:bpy.data.objects.remove(o,do_unlink=True)
rig.animation_data_clear();rig.name='Simi_Chibi_Rig';rig.data.name='CC0 compatible rest skeleton'
for pb in rig.pose.bones:
    pb.matrix_basis.identity()
    for c in list(pb.constraints):pb.constraints.remove(c)
exec((ROOT/'scripts/chibi_mesh_helpers.py').read_text())
def face_transform(v):return (v[0]*.81,v[1]*.81,1.13+(v[2]-1.25)*.88)
def append_face(p,ob,haircell=19):
    """Join facial surfaces without losing projection UVs or expression topology."""
    n=len(p.v);keys=ob.data.shape_keys.key_blocks if ob.data.shape_keys else None
    base=[face_transform(ob.matrix_world@v.co) for v in ob.data.vertices]
    for name in ['Blink','Smile']:
        if name not in p.morphs:p.morphs[name]=list(p.v)
        source=keys.get(name) if keys else None
        p.morphs[name].extend([face_transform(ob.matrix_world@v.co) for v in source.data] if source else base)
    p.v.extend(base);p.w.extend([{'head':1}]*len(base))
    layer=ob.data.uv_layers.active
    source_name=ob.data.materials[0].name if ob.data.materials else ''
    if 'skin' in source_name.lower() or 'cheek' in source_name.lower():
        uvs=[(.25,.25)]*len(base)
        if layer:
            for loop,uv in zip(ob.data.loops,layer.data):uvs[loop.vertex_index]=(uv.uv.x*.5,uv.uv.y*.5)
        else:uvs=[((v[0]/.81+.55)/1.1*.5,((v[2]-1.13)/.88+1.25-1.2)/.92*.5) for v in base]
    elif 'iris' in source_name.lower():
        uvs=[(.75,.25)]*len(base)
        for loop,uv in zip(ob.data.loops,layer.data):uvs[loop.vertex_index]=(.5+uv.uv.x*.5,uv.uv.y*.5)
    else:
        cell=1 if 'white' in source_name.lower() else 2 if 'lash' in source_name.lower() else 15 if 'interior' in source_name.lower() else 31 if 'tongue' in source_name.lower() else haircell if 'hair' in source_name.lower() else 0
        uvs=[((cell%8+.5)/8,.5+.5*(1-(cell//8+.5)/4))]*len(base)
    p.uv.extend(uvs);p.f.extend(tuple(n+i for i in poly.vertices) for poly in ob.data.polygons)
def finish(p):
    for key in p.morphs:p.morphs[key].extend(p.v[len(p.morphs[key]):])
    return p.finish()
def soft_lock(p,points,widths,depths,cell):
    """A smooth broad hair mass with rounded turns and a tapered end."""
    controls=[Vector(v) for v in points];pts=[];ws=[];ds=[]
    for i in range(len(controls)-1):
        a=controls[max(0,i-1)];b=controls[i];c=controls[i+1];d=controls[min(len(controls)-1,i+2)]
        for j in range(4):
            t=j/4;pts.append(.5*((2*b)+(-a+c)*t+(2*a-5*b+4*c-d)*t*t+(-a+3*b-3*c+d)*t*t*t));ws.append(widths[i]*(1-t)+widths[i+1]*t);ds.append(depths[i]*(1-t)+depths[i+1]*t)
    pts.append(controls[-1]);ws.append(widths[-1]);ds.append(depths[-1]);sweep(p,pts,ws,ds,cell,n=12)
def make_head(who,style,hood=False):
    p=Part(who+('_Head_Hooded' if hood else '_Head'),who)
    for ob in face_objects:
        ishair=('hair cap' in ob.name or 'fringe' in ob.name)
        if style==3 and ishair:continue
        append_face(p,ob,[19,17,21,22][style])
    if style==1: # rounded bob, broad curved masses rather than striped strands
        for s in [-1,1]:
            soft_lock(p,[(s*.29,.075,1.73),(s*.363,.06,1.59),(s*.372,.04,1.41),(s*.33,.04,1.28)],[.01,.067,.066,.01],[.025,.10,.10,.04],17)
        rings(p,[(1.26,.32,.19,.09),(1.36,.355,.22,.09),(1.60,.38,.235,.07),(1.74,.31,.23,.07)],17,'head',n=20)
        # The rear shell is hidden by the face in front and gives a clean back view.
        p.f=p.f[:-2] # remove ring end caps from the bob extension
    if style==2:
        for s in [-1,1]:
            ell(p,(s*.365,.12,1.62),(.085,.087,.09),21,n=12,m=8)
            soft_lock(p,[(s*.36,.135,1.66),(s*.46,.18,1.43),(s*.43,.20,1.16),(s*.49,.14,.96),(s*.37,.10,.84)],[.066,.094,.087,.060,.003],[.067,.075,.065,.054,.003],21)
            rings(p,[(1.57,.092,.081,.12),(1.60,.092,.081,.12)],14,'head',n=12,cx=s*.37)
    if style==3:
        # Cropped textured curls, clear forehead, compact round silhouette.
        for z,rx,ry,count in [(1.76,.32,.24,10),(1.84,.22,.17,8),(1.60,.365,.27,12)]:
            for i in range(count):
                a=2*pi*i/count;x=rx*cos(a);y=.05+ry*sin(a)
                if z==1.60 and y<-.10:continue
                ell(p,(x,y,z),(.085,.075,.073),22,n=8,m=5)
        ell(p,(0,.05,1.82),(.30,.22,.09),22,n=16,m=8)
        # Restrained grey beard preserves the saved inclusive older option.
        vs=[];fs=[];cols=20;rows=5
        for j in range(rows+1):
            t=j/rows
            for i in range(cols+1):
                u=i/cols*2-1;x=u*(.27*(1-t)+.14*t);top=1.195+.070*abs(u)**1.3;bottom=1.105+.060*abs(u);z=top*(1-t)+bottom*t
                originalz=(z-1.13)/.88+1.25;y=face['surf'](x/.81,max(1.25,originalz))*.81-.007
                vs.append((x,y,z))
        for j in range(rows):
            for i in range(cols):fs.append((j*(cols+1)+i,j*(cols+1)+i+1,(j+1)*(cols+1)+i+1,(j+1)*(cols+1)+i))
        p.add(vs,fs,22)
    if hood:
        # Original ranger folded hood rests behind the open hair and face.
        sweep(p,[(-.39,.17,1.44),(-.38,.25,1.78),(0,.26,1.95),(.38,.25,1.78),(.39,.17,1.44)],[.035,.040,.042,.040,.035],[.045]*5,9,n=8)
    return finish(p)

def outfit(who,kind):
    main=8;trim=[10,14,10,30][kind]
    p=Part(who+'_Body',who)
    hem=[.49,.43,.51,.52][kind];flare=[.29,.32,.27,.27][kind]
    rings(p,[(hem,flare,.168,0),(hem+.035,flare,.17,0),(.72,.224,.143,0),(.81,.218,.143,0),(1.02,.256,.16,0),(1.09,.265,.155,0),(1.135,.109,.09,0)],main)
    ell(p,(0,0,1.14),(.083,.071,.06),0,torso,n=16,m=8)
    rings(p,[(1.075,.18,.12,0),(1.13,.11,.093,0)],1)
    rings(p,[(hem,.005+flare,.178,0),(hem+.024,.005+flare,.178,0)],trim)
    if kind==0:
        # Folded neckerchief, tunic, cross-body field pouch.
        p.add([(-.14,-.159,1.108),(.14,-.159,1.108),(.025,-.185,.934),(-.055,-.185,.947)],[(0,1,2,3)],1,torso)
        sweep(p,[(-.21,-.154,1.035),(-.11,-.168,.9),(.12,-.169,.70)],[.021]*3,[.005]*3,23,torso,n=6)
        ell(p,(.175,-.164,.665),(.075,.036,.076),23,torso,n=12,m=8)
        p.add([(.106,-.201,.694),(.24,-.201,.694),(.21,-.209,.657),(.125,-.209,.657)],[(0,1,2,3)],18,torso)
    elif kind==1:
        # Academy double-breasted coat and ribbon, with one softly flared hem.
        for s in [-1,1]:
            p.add([(s*.10,-.111,1.128),(s*.17,-.152,1.048),(s*.045,-.167,.897),(s*.020,-.154,1.00)],[(0,1,2,3)],1,torso)
            p.add([(0,-.169,1.065),(s*.089,-.176,1.082),(s*.076,-.180,1.025)],[(0,1,2)],14,torso)
        ell(p,(0,-.181,1.055),(.021,.009,.023),10,torso,n=10,m=6)
        for s in [-1,1]:
            for z in [.86,.78]:ell(p,(s*.045,-.158,z),(.011,.009,.012),10,torso,n=8,m=4)
    elif kind==2:
        # Varsity-inspired armor, steel breastplate, stitched side panels.
        p.add([(-.17,-.165,1.032),(.17,-.165,1.032),(.15,-.181,.887),(0,-.188,.827),(-.15,-.181,.887)],[(0,1,2,3,4)],7,torso)
        p.add([(0,-.191,.995),(.045,-.191,.946),(0,-.198,.884),(-.045,-.191,.946)],[(0,1,2,3)],10,torso)
        for s in [-1,1]:p.add([(s*.023,-.173,.7),(s*.20,-.149,.7),(s*.244,-.164,.53),(s*.064,-.178,.515)],[(0,1,2,3)],9,torso)
    else:
        # Short sporty overshirt with zipper placket and pockets.
        sweep(p,[(0,-.152,1.08),(0,-.168,.84),(0,-.172,.555)],[.009]*3,[.004]*3,11,torso,n=6)
        for s in [-1,1]:
            p.add([(s*.105,-.155,.808),(s*.203,-.146,.794),(s*.195,-.163,.726),(s*.102,-.174,.74)],[(0,1,2,3)],30,torso)
    rings(p,[(.701,.231,.157,0),(.746,.227,.152,0)],11)
    p.add([(-.031,-.168,.709),(.031,-.168,.709),(.031,-.168,.743),(-.031,-.168,.743)],[(0,1,2,3)],trim,torso)
    finish(p)
    for side,suffix,s in [('l','Left',1),('r','Right',-1)]:
        a=Part(who+'_Arm'+suffix,who);w=arm(side)
        sleeve=[(.22,.040,.043,0),(.25,.100,.095,0),(.29,.116,.112,0),(.41,.092,.089,0),(.50,.077,.077,0),(.61,.075,.071,0),(.70,.064,.065,0)]
        rings(a,[(s*x,y,z,c) for x,y,z,c in sleeve],main,w,n=16,axis='x')
        rings(a,[(s*.656,.078,.075,0),(s*.699,.078,.075,0)],trim,w,n=12,axis='x')
        if kind==2:rings(a,[(s*.218,.050,.050,0),(s*.26,.127,.120,0),(s*.34,.124,.117,0),(s*.405,.103,.097,0)],7,w,n=16,axis='x')
        ell(a,(s*.776,0,1.107),(.084,.061,.061),0,w,n=16,m=8)
        ell(a,(s*.753,-.047,1.073),(.035,.027,.035),0,w,n=10,m=6)
        finish(a)
        l=Part(who+'_Leg'+suffix,who);w=leg(side);x=s*.16
        rings(l,[(.15,.079,.081,0),(.27,.082,.079,0),(.38,.094,.087,0),(.54,.105,.091,0)],9,w,n=12,cx=x)
        if kind==3:
            rings(l,[(.17,.088,.09,0),(.213,.089,.09,0)],30,w,n=12,cx=x)
            sweep(l,[(x+s*.080,-.01,.23),(x+s*.095,-.01,.48)],[.008,.008],[.005,.005],30,w,n=6)
        else:
            bootheight=[.28,.33,.30][kind]
            rings(l,[(.09,.093,.097,0),(.17,.091,.088,0),(bootheight,.096,.09,0)],23 if kind!=2 else 12,w,n=12,cx=x)
            rings(l,[(bootheight-.018,.099,.094,0),(bootheight+.008,.099,.094,0)],trim,w,n=12,cx=x)
        ell(l,(x,-.050,.087),(.103,.153,.080),11,w,n=16,m=8)
        ell(l,(x,-.055,.034),(.105,.158,.025),1 if kind==3 else 2,w,n=16,m=6)
        pnts=[(x-.045,-.174,.099),(x+.045,-.174,.099)]
        sweep(l,pnts,[.005,.005],[.004,.004],trim,w,n=6)
        finish(l)
    cape=Part(who+'_Cape',who);n=12;rows=6;vs=[];fs=[]
    length=[.54,.27,.35,.19][kind]
    for j in range(rows):
        t=j/(rows-1)
        for i in range(n+1):
            u=i/n*2-1;vs.append((u*(.21+.11*t),.143+.14*t+.014*cos(u*pi*3)*t,1.08-length*t+.04*abs(u)*t))
    for j in range(rows-1):
        for i in range(n):fs.append((j*(n+1)+i,j*(n+1)+i+1,(j+1)*(n+1)+i+1,(j+1)*(n+1)+i))
    cape.add(vs,fs,9,'chest');sweep(cape,vs[-n-1:],[.012]*(n+1),[.008]*(n+1),trim,'chest',n=6);finish(cape)

def hats():
    p=Part('Mage_Hat','Mage')
    rings(p,[(1.80,.45,.34,.025),(1.826,.455,.345,.025),(1.85,.33,.25,.025)],8,'head',n=24)
    rings(p,[(1.832,.30,.235,.025),(1.95,.24,.19,.04),(2.08,.15,.13,.07),(2.18,.045,.05,.13),(2.13,.003,.005,.24)],8,'head',n=20)
    rings(p,[(1.84,.307,.239,.027),(1.87,.287,.222,.029)],14,'head',n=20);finish(p)
    p=Part('Knight_Helmet','Knight')
    # Open-face polished cap and ear guards. Forehead and eyes stay readable.
    rings(p,[(1.765,.389,.28,.065),(1.83,.36,.264,.065),(1.91,.24,.21,.065),(1.94,.025,.04,.065)],13,'head',n=24)
    rings(p,[(1.765,.395,.286,.066),(1.789,.393,.285,.066)],10,'head',n=24)
    for s in [-1,1]:ell(p,(s*.37,.055,1.66),(.048,.125,.12),13,n=12,m=8)
    finish(p)
    p=Part('Barbarian_Hat','Barbarian')
    # Compact bucket cap appropriate for a neighbourhood sporting adventure.
    rings(p,[(1.78,.42,.31,.04),(1.804,.421,.312,.04),(1.83,.34,.255,.04),(1.95,.23,.19,.04),(1.975,.03,.04,.04)],8,'head',n=24)
    rings(p,[(1.831,.345,.26,.04),(1.865,.326,.248,.04)],30,'head',n=24);finish(p)

families=[('Rogue',0),('Mage',1),('Knight',2),('Barbarian',3)]
for who,kind in families:outfit(who,kind);make_head(who,kind)
make_head('Rogue',0,True);hats()
for ob in face_objects:bpy.data.objects.remove(ob,do_unlink=True)
meshes=[o for o in bpy.data.objects if o.type=='MESH']
for ob in meshes:ob['authorship']='Original Play Simi geometry; no reference pixels or paid asset data'
rig['skeleton_source']='KayKit Adventurers CC0 rest skeleton only'
for blocks in [bpy.data.meshes,bpy.data.materials,bpy.data.images,bpy.data.actions]:
    for block in list(blocks):
        if not block.users:blocks.remove(block)
bpy.ops.object.select_all(action='DESELECT');rig.select_set(True)
for ob in meshes:ob.select_set(True)
bpy.context.view_layer.objects.active=rig
GLB=ROOT/'public/models/neighbour-chibi.glb'
bpy.ops.export_scene.gltf(filepath=str(GLB),export_format='GLB',use_selection=True,export_animations=False,export_yup=True,export_apply=False,export_extras=True,export_image_format='AUTO',export_materials='EXPORT',export_skins=True,export_morph=True,export_morph_normal=False,export_morph_tangent=False,export_try_sparse_sk=True,export_try_omit_sparse_sk=True)
def compact_glb(path):
    """Losslessly share repeated buffer bytes across modular wardrobe parts.

    glTF permits overlapping views into one buffer. Keep accessors, component
    types, stride and count unchanged, so no decoder extension is required.
    """
    import struct, hashlib
    raw=path.read_bytes();length=int.from_bytes(raw[12:16],'little')
    document=json.loads(raw[20:20+length]);start=20+length
    binary=raw[start+8:start+8+int.from_bytes(raw[start:start+4],'little')]
    output=bytearray();seen={};chunks={}
    # Largest-first also shares a shorter all-head joint/weight buffer with
    # the identical prefix of a longer head. No numerical conversion occurs.
    for view in sorted(document['bufferViews'],key=lambda v:-v['byteLength']):
        chunk=binary[view.get('byteOffset',0):view.get('byteOffset',0)+view['byteLength']]
        layout=(view.get('byteStride'),view.get('target'))
        identity=(hashlib.sha256(chunk).digest(),*layout)
        if identity not in seen:
            shared=None
            for old,offset in chunks.get(layout,[]):
                relative=old.find(chunk)
                if relative>=0 and relative%4==0:
                    shared=offset+relative;break
            if shared is None:
                output.extend(b'\0'*((-len(output))%4));shared=len(output);output.extend(chunk)
                chunks.setdefault(layout,[]).append((chunk,shared))
            seen[identity]=shared
        view['byteOffset']=seen[identity]
    output.extend(b'\0'*((-len(output))%4));document['buffers'][0]['byteLength']=len(output)
    encoded=json.dumps(document,separators=(',',':'),ensure_ascii=False).encode();encoded+=b' '*((-len(encoded))%4)
    payload=struct.pack('<II',len(encoded),0x4e4f534a)+encoded+struct.pack('<II',len(output),0x004e4942)+output
    path.write_bytes(struct.pack('<III',0x46546c67,2,len(payload)+12)+payload)
compact_glb(GLB)
def show(who,hat=False,hood=False):
    for ob in meshes:
        ob.hide_render=not(ob.name.startswith(who+'_') and not any(s in ob.name for s in ['Hat','Helmet','Hooded']))
        if hood and ob.name=='Rogue_Head':ob.hide_render=True
        if hood and ob.name=='Rogue_Head_Hooded':ob.hide_render=False
        if hat and ob.name=={'Mage':'Mage_Hat','Knight':'Knight_Helmet','Barbarian':'Barbarian_Hat'}.get(who):ob.hide_render=False
        ob.hide_set(ob.hide_render)
show('Rogue')
scene=bpy.context.scene;scene.render.threads_mode='FIXED';scene.render.threads=2;scene.render.engine='CYCLES';scene.cycles.samples=32;scene.cycles.use_denoising=True
scene.world=bpy.data.worlds.new('Soft white studio');scene.world.use_nodes=True;scene.world.node_tree.nodes['Background'].inputs[0].default_value=(.7,.73,.78,1);scene.world.node_tree.nodes['Background'].inputs[1].default_value=.35
scene.view_settings.view_transform='Standard';scene.view_settings.look='None'
scene.render.resolution_x=900;scene.render.resolution_y=1100;scene.render.resolution_percentage=100;scene.render.image_settings.file_format='PNG'
bpy.ops.mesh.primitive_plane_add(size=200,location=(0,0,-.005));ground=bpy.context.object;ground.name='Studio floor'
mat=bpy.data.materials.new('Warm neutral floor');mat.diffuse_color=(.80,.78,.73,1);ground.data.materials.append(mat)
def area(name,loc,power,size):
    data=bpy.data.lights.new(name,'AREA');data.energy=power;data.size=size;ob=bpy.data.objects.new(name,data);scene.collection.objects.link(ob);ob.location=loc;ob.rotation_euler=(Vector((0,0,1))-ob.location).to_track_quat('-Z','Y').to_euler()
area('Large key',(-3,-5,6),130,5);area('Gentle rim',(3,2,4),110,4)
bpy.ops.object.camera_add(location=(2.4,-7,2.4));cam=bpy.context.object;cam.name='Avatar proof camera';cam.data.type='ORTHO';cam.data.ortho_scale=2.29;cam.rotation_euler=(Vector((0,0,.96))-cam.location).to_track_quat('-Z','Y').to_euler();scene.camera=cam
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'simi-chibi.blend'))
for side,angle in [('l',-1.18),('r',1.18)]:
    pb=rig.pose.bones['upperarm.'+side];pb.rotation_mode='QUATERNION';rest=pb.bone.matrix_local.to_quaternion();pb.rotation_quaternion=rest.inverted()@Quaternion((0,1,0),-angle)@rest
scene.render.filepath=str(OUT/'rogue-portrait.png');bpy.ops.render.render(write_still=True)
cam.location=(.3,-6,1.73);cam.rotation_euler=(Vector((0,0,1.47))-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.ortho_scale=1.10;scene.render.resolution_x=1000;scene.render.resolution_y=1000;scene.render.filepath=str(OUT/'face-detail.png');bpy.ops.render.render(write_still=True)
if os.environ.get('CHIBI_RENDER_ALL'):
    cam.location=(2.4,-7,2.4);cam.rotation_euler=(Vector((0,0,.96))-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.ortho_scale=2.29;scene.render.resolution_x=900;scene.render.resolution_y=1100
    for who,_ in families[1:]:show(who);scene.render.filepath=str(OUT/(who.lower()+'-portrait.png'));bpy.ops.render.render(write_still=True)
    show('Rogue');cam.location=(0,-6,1.73);cam.rotation_euler=(Vector((0,0,1.47))-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.ortho_scale=1.10;scene.render.resolution_x=1000;scene.render.resolution_y=1000
    for name in ['Blink','Smile']:
        key=bpy.data.objects['Rogue_Head'].data.shape_keys.key_blocks[name];key.value=1;scene.render.filepath=str(OUT/(name.lower()+'-face.png'));bpy.ops.render.render(write_still=True);key.value=0
# GLB measurements include actual glTF accessor duplication.
def measure(path):
    data=path.read_bytes();j=json.loads(data[20:20+int.from_bytes(data[12:16],'little')]);parts={}
    for node in j['nodes']:
        if 'mesh' not in node:continue
        primitives=j['meshes'][node['mesh']]['primitives'];parts[node['name']]={'vertices':sum(j['accessors'][p['attributes']['POSITION']]['count'] for p in primitives),'triangles':sum(j['accessors'][p['indices']]['count']//3 for p in primitives),'draws':len(primitives)}
    return {'glb_bytes':len(data),'mesh_count':len(parts),'material_count':len(j.get('materials',[])),'texture_count':len(j.get('textures',[])),'total_triangles':sum(p['triangles'] for p in parts.values()),'parts':parts}
report=measure(GLB);report['reference_kaykit']=measure(ROOT/'public/models/neighbour-kaykit.glb');report['visible_base_styles']={}
for who,_ in families:
    ps=[v for k,v in report['parts'].items() if k.startswith(who+'_') and not any(s in k for s in ['Hat','Helmet','Hooded'])]
    report['visible_base_styles'][who]={q:sum(p[q] for p in ps) for q in ['vertices','triangles','draws']}
parts=report['parts']
maximum=sum(max(v['triangles'] for k,v in parts.items() if k.endswith(suffix)) for suffix in ['Body','ArmLeft','ArmRight','LegLeft','LegRight','Cape'])+max(v['triangles'] for k,v in parts.items() if 'Head' in k)+max(v['triangles'] for k,v in parts.items() if k.endswith(('Hat','Helmet')))
report['worst_mixed_selection']={'triangles':maximum,'draws':8}
report['image_count']=1
assert report['glb_bytes']<=1500000, 'Model exceeds the 1.5 MB download budget'
assert maximum<=12000, 'Mixed wardrobe exceeds the 12,000 triangle budget'
report['atlas']={'size':[512,512],'palette_canvas_rect':[0,0,512,256],'grid':[8,4],'skin_canvas_rect':[0,256,256,256],'iris_canvas_rect':[256,256,256,256],'neutral_skin':'#f7d9c6'};report['expressions']=['Blink','Smile'];report['bones']=len(rig.data.bones)
(OUT/'budgets.json').write_text(json.dumps(report,indent=2)+'\n');print('CHIBI_COMPLETE',json.dumps({k:v for k,v in report.items() if k not in ['parts','reference_kaykit']}),flush=True)
