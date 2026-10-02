"""Original stylised Singapore-inspired dragon playground. Blender background script."""
import bpy, math, os
from mathutils import Vector

bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.makedirs(os.path.join(root,'public','models'), exist_ok=True)
os.makedirs(os.path.join(root,'art'), exist_ok=True)

def mat(name, color):
    m=bpy.data.materials.new(name); m.diffuse_color=(*color,1)
    m.use_nodes=True
    bsdf=m.node_tree.nodes.get('Principled BSDF'); bsdf.inputs['Base Color'].default_value=(*color,1); bsdf.inputs['Roughness'].default_value=.85
    return m
orange=mat('Terracotta mosaic',(0.77,.34,.16)); light=mat('Warm tile variation',(.92,.52,.26)); cream=mat('Cream grout',(.91,.79,.57)); teal=mat('Turquoise slide',(.20,.52,.52)); eye=mat('Warm porcelain',(.99,.95,.82)); pupil=mat('Deep ink',(.12,.18,.20)); gold=mat('Golden fins',(.94,.65,.28))

def cube(name, loc, scale, material, bevel=.04):
    bpy.ops.mesh.primitive_cube_add(size=1,location=loc);o=bpy.context.object;o.name=name;o.dimensions=scale;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);o.data.materials.append(material)
    if bevel:
        mod=o.modifiers.new('Soft tile edges','BEVEL');mod.width=bevel;mod.segments=2
        bpy.context.view_layer.objects.active=o;bpy.ops.object.modifier_apply(modifier=mod.name)
    return o

def uv(name, loc, scale, material):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=20,ring_count=12,location=loc);o=bpy.context.object;o.name=name;o.scale=scale;o.data.materials.append(material);bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    for p in o.data.polygons:p.use_smooth=True
    return o

def tube(name,points,radius,material):
    c=bpy.data.curves.new(name,'CURVE');c.dimensions='3D';c.bevel_depth=radius;c.bevel_resolution=2;c.resolution_u=8
    s=c.splines.new('BEZIER');s.bezier_points.add(len(points)-1)
    for b,p in zip(s.bezier_points,points):b.co=p;b.handle_left_type='AUTO';b.handle_right_type='AUTO'
    o=bpy.data.objects.new(name,c);bpy.context.collection.objects.link(o);o.data.materials.append(material)
    bpy.context.view_layer.objects.active=o;o.select_set(True);bpy.ops.object.convert(target='MESH');o.select_set(False)
    return o

# Rounded arch tunnel forms the body, with a hand-placed tile grid.
for i in range(15):
    a=math.pi*i/14
    x=.65+1.3*math.cos(a);z=.42+1.35*math.sin(a)
    o=cube('Body mosaic arch', (x,0,z),(.36,.9,.35), light if i%3==0 else orange,.06);o.rotation_euler[1]=a-math.pi/2
    for side in [-1,1]:
        for j in [-1,0,1]:
            tile=cube('Individually inset mosaic', (x,side*.463,z+j*.065),(.21,.022,.05),cream,.007);tile.rotation_euler[1]=a-math.pi/2

# Tall friendly head, muzzle and eyes; a new design rather than a scanned monument.
cube('Dragon neck',(-1.04,0,1.25),(.78,.86,2.5),orange,.16)
cube('Dragon forehead',(-1.2,0,2.5),(1.1,1.04,.9),orange,.22)
cube('Rounded snout',(-1.82,0,2.15),(.96,1.0,.54),light,.16)
cube('Smile',(-2.0,-.508,2.03),(.62,.018,.055),pupil,.01)
cube('Smile other side',(-2.0,.508,2.03),(.62,.018,.055),pupil,.01)
for side in [-1,1]:
    uv('Big porcelain eye',(-1.45,side*.51,2.6),(.23,.09,.25),eye)
    uv('Friendly pupil',(-1.53,side*.585,2.59),(.095,.035,.12),pupil)
    for row in range(8):
        for col in range(3):
            cube('Neck mosaic tile',(-1.3+col*.27,side*.438,.26+row*.26),(.23,.025,.22),light if (col+row)%4==0 else orange,.016)
    tube('Swept horn',[(-.87,side*.28,2.75),(-.67,side*.3,3.15),(-.4,side*.31,3.23)],.09,gold)
for i in range(5):
    bpy.ops.mesh.primitive_cone_add(vertices=4,radius1=.2,radius2=0,depth=.38,location=(-.62+i*.48,0,1.65+math.sin(i*.62)*.38));bpy.context.object.name='Golden ridge';bpy.context.object.data.materials.append(gold)

# A small turquoise slide curves away from the tunnel.
for side in [-1,1]:
    tube('Slide rail',[(1.2,side*.42,1.46),(1.9,side*.42,.92),(2.5,side*.42,.27),(3,side*.42,.22)],.08,cream)
verts=[];faces=[]
for i in range(17):
    t=i/16;x=1.15+1.9*t;z=.16+1.15*(1-t)**2
    verts.extend([(x,-.4,z),(x,.4,z)])
    if i:faces.append((2*i-2,2*i-1,2*i+1,2*i))
mesh=bpy.data.meshes.new('Curved slide');mesh.from_pydata(verts,[],faces);mesh.update();o=bpy.data.objects.new('Turquoise slide surface',mesh);bpy.context.collection.objects.link(o);o.data.materials.append(teal)
mod=o.modifiers.new('Slide thickness','SOLIDIFY');mod.thickness=.07;bpy.context.view_layer.objects.active=o;o.select_set(True);bpy.ops.object.modifier_apply(modifier=mod.name);o.select_set(False)
# A usable stair flight behind the slide, with a landing clear of the tall head.
for i in range(7):
    cube('Access step',(1.15,2.65-i*.30,.095+i*.18),(.78,.34,.18),cream,.035)
cube('Slide landing',(1.15,.37,1.24),(.8,.85,.16),teal,.04)
for side in [-1,1]:
    tube('Stair handrail',[(1.15+side*.47,2.65,.65),(1.15+side*.47,.85,1.75),(1.15+side*.47,.25,1.85)],.045,cream)

# Keep an editable master and a compact glTF runtime asset.
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(root,'art','dragon-playground.blend'))
bpy.ops.export_scene.gltf(filepath=os.path.join(root,'public','models','dragon-playground.glb'),export_format='GLB',export_yup=True)
print('Darecade dragon exported')
