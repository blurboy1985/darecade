"""Build Darecade's chibi neighbour from Quaternius CC0 connected topology.
Reference direction: user-provided cute large-headed arcade character. Original
wardrobe additions, proportion edits and integration are authored for Darecade.
"""
import bpy,bmesh,math,os
from pathlib import Path
from mathutils import Vector,Matrix
ROOT=Path(__file__).resolve().parents[1]
SOURCE=ROOT/'art/characters/source/Universal Base Characters[Standard]'
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
base=SOURCE/'Base Characters/Godot - UE/Superhero_Male_FullBody.gltf'
for n in ['T_Hair_1_Normal','T_Eye_Normal']:
 alias=base.parent/(n+'_png.png')
 if not alias.exists():alias.write_bytes((base.parent/(n+'.png')).read_bytes())
bpy.ops.import_scene.gltf(filepath=str(base))
rig=next(o for o in bpy.data.objects if o.type=='ARMATURE')
body=bpy.data.objects['SuperHero_Male'];eyes=bpy.data.objects['Eyes'];brows=bpy.data.objects['Eyebrows']
keep={rig,body,eyes,brows}
for o in list(bpy.data.objects):
 if o not in keep:bpy.data.objects.remove(o,do_unlink=True)

def chibi(p):
 x,y,z=p
 # Shorter body and limbs, generous head, gentle nose profile.
 if z>1.5 and abs(x)<.155:
  blend=min(1,(z-1.5)/.06)
  sx=1+2.7*blend
  yy=y
  if yy<-.084:yy=-.084+(yy+.084)*.42
  return Vector((x*sx,yy*(1+2.0*blend),1.125+(z-1.5)*3.0))
 xx=x if abs(x)<.21 else math.copysign(.21+(abs(x)-.21)*.68,x)
 if z>1.26 and abs(x)>.26:
  y=.065+(y-.065)*1.30
  z=1.455+(z-1.455)*1.30
 if z>1.26:
  xx+=math.copysign(.073*min(1,max(0,(abs(x)-.15)/.06)),x)
 if .17<z<.80:
  cx=math.copysign(.114,x);dx=x-cx;dy=y-.04
  r=max(.35,math.sqrt((dx/.08)**2+(dy/.09)**2))
  xx=cx+dx/r*1.10;y=.04+dy/r*1.05
 return Vector((xx,y*.94,z*.75))

def mat(name,color,rough=.8):
 m=bpy.data.materials.new(name);m.diffuse_color=(*color,1);m.use_nodes=True
 p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*color,1);p.inputs['Roughness'].default_value=rough
 return m
M={n:mat(n,c) for n,c in {'Skin':(.87,.60,.38),'Fabric':(.40,.55,.38),'Pants':(.065,.075,.09),'Trim':(.91,.87,.77),'Jacket':(.025,.033,.043),'Accent':(.75,.43,.11),'Hair':(.055,.024,.014),'Sole':(.25,.13,.06)}.items()}
# Store original coordinates for garment selection before changing proportions.
coords=[body.matrix_world@v.co for v in body.data.vertices]
body.data.materials.clear()
for m in [M['Skin'],M['Pants'],M['Trim']]:body.data.materials.append(m)
for face in body.data.polygons:
 p=sum((coords[i] for i in face.vertices),Vector())/len(face.vertices)
 face.material_index=1 if p.z<.98 else 2 if .98<=p.z<1.49 and abs(p.x)<.255 else 0
# Connected clothing is authored as joined cloth volumes, then skin-weighted.
clothes=[]
# Shape every mesh in rest space. Eye globes grow independently for an expressive face.
for o in [body,eyes,brows,*clothes]:
 world=o.matrix_world.copy()
 for v in o.data.vertices:
  p=world@v.co
  if o==eyes:
   center=Vector((math.copysign(.033,p.x),-.069,1.699))
   p=center+(p-center)*1.30
  v.co=chibi(p)
 o.matrix_world=Matrix.Identity(4)
 for f in o.data.polygons:f.use_smooth=True
# Remove bare foot geometry; sneakers below are bound to the existing foot bones.
bm=bmesh.new();bm.from_mesh(body.data)
bmesh.ops.delete(bm,geom=[f for f in bm.faces if f.material_index==2 or any(v.co.z<.17 for v in f.verts) or f.calc_center_median().z>1.115],context='FACES');bm.to_mesh(body.data);bm.free()
bpy.data.objects.remove(eyes,do_unlink=True);bpy.data.objects.remove(brows,do_unlink=True)
# Modify the armature's rest geometry to match the new connected mesh.
bpy.context.view_layer.objects.active=rig;bpy.ops.object.mode_set(mode='EDIT')
for b in rig.data.edit_bones:
 b.head=chibi(b.head);b.tail=chibi(b.tail)
 if (b.tail-b.head).length<.002:b.tail.z+=.02
bpy.ops.object.mode_set(mode='OBJECT')
rig.name='NeighbourRig'

def bind(o,bone):
 vg=o.vertex_groups.new(name=bone);vg.add(list(range(len(o.data.vertices))),1,'REPLACE')
 mod=o.modifiers.new('Skin','ARMATURE');mod.object=rig;o.parent=rig
 return o

def block(name,loc,size,material,bone,bevel=.02):
 bpy.ops.mesh.primitive_cube_add(size=1,location=loc);o=bpy.context.object;o.name=name;o.dimensions=size
 bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
 mod=o.modifiers.new('Tailored edges','BEVEL');mod.width=bevel;mod.segments=3
 bpy.ops.object.modifier_apply(modifier=mod.name)
 o.data.materials.append(M[material]);bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
 for f in o.data.polygons:f.use_smooth=True
 return bind(o,bone)

for side,suffix in [(1,'l'),(-1,'r')]:
 x=side*.114
 block('Sneaker',(x,-.035,.085),(.19,.31,.16),'Trim','foot_'+suffix,.055)
 block('Sole',(x,-.035,.025),(.195,.315,.045),'Sole','foot_'+suffix,.017)
 for y in [-.055,-.02,.015]:block('Lace',(x,y,.163),(.12,.012,.012),'Trim','foot_'+suffix,.003)
# Proper continuous sleeves and clean hems replace cut triangles from the base.
def garment(style):
 verts=[];faces=[];segments=24
 rings=[(.715,.205,.135),(.75,.22,.145),(.93,.235,.15),(1.065,.235,.145),(1.12,.20,.115),(1.15,.085,.075)]
 if style==4:rings=[(.48,.28,.17),(.57,.27,.165),(.80,.19,.13),*rings[2:]]
 if style==5:rings=[(.62,.225,.15),(.76,.23,.15),*rings[2:]]
 for z,w,d in rings:
  for i in range(segments):
   angle=2*math.pi*i/segments;verts.append((w*math.cos(angle),d*math.sin(angle),z))
 for j in range(len(rings)-1):
  for i in range(segments):
   k=j*segments+i;n=j*segments+(i+1)%segments;faces.append((k,n,n+segments,k+segments))
 faces.extend([tuple(reversed(range(segments))),tuple((len(rings)-1)*segments+i for i in range(segments))])
 mesh=bpy.data.meshes.new('Tailored_cloth');mesh.from_pydata(verts,[],faces);mesh.update()
 o=bpy.data.objects.new('Clothing'+str(style),mesh);bpy.context.collection.objects.link(o)
 parts=[o]
 for side in [-1,1]:
  end=.585 if style in [0,5,6,7] else .445
  length=end-.19
  bpy.ops.mesh.primitive_cylinder_add(vertices=20,radius=.084,depth=length,location=(side*(.19+length/2),.05,1.092),rotation=(0,math.pi/2,0))
  parts.append(bpy.context.object)
 bpy.ops.object.select_all(action='DESELECT')
 for obj in parts:obj.select_set(True)
 bpy.context.view_layer.objects.active=o;bpy.ops.object.join()
 rem=o.modifiers.new('Connected cloth','REMESH');rem.mode='VOXEL';rem.voxel_size=.012;rem.use_smooth_shade=True;bpy.ops.object.modifier_apply(modifier=rem.name)
 sm=o.modifiers.new('Soft cloth','SMOOTH');sm.factor=.6;sm.iterations=4;bpy.ops.object.modifier_apply(modifier=sm.name)
 de=o.modifiers.new('Mobile topology','DECIMATE');de.ratio=.22;bpy.ops.object.modifier_apply(modifier=de.name)
 for m in [M['Fabric'],M['Jacket'],M['Trim']]:o.data.materials.append(m)
 for face in o.data.polygons:
  q=face.center;face.material_index=1 if style in [1,7] else 0
  if style in [1,2,5,7] and abs(q.x)<.065 and q.y<-.07:face.material_index=2
  if q.z<.74:face.material_index=2 if style in [0,3] else (1 if style==7 else 0)
  face.use_smooth=True
 groups={n:o.vertex_groups.new(name=n) for n in ['spine_01','spine_02','spine_03','upperarm_l','upperarm_r','lowerarm_l','lowerarm_r']}
 for v in o.data.vertices:
  x,y,z=v.co;side='l' if x>0 else 'r';arm=max(0,min(1,(abs(x)-.20)/.13)) if z>.99 else 0
  fore=max(0,min(1,(abs(x)-.42)/.07))
  spine='spine_01' if z<.83 else 'spine_02' if z<1.02 else 'spine_03'
  for bone,weight in [(spine,1-arm),('upperarm_'+side,arm*(1-fore)),('lowerarm_'+side,arm*fore)]:
   if weight>0:groups[bone].add([v.index],weight,'REPLACE')
 mod=o.modifiers.new('Skin','ARMATURE');mod.object=rig;o.parent=rig;return o
clothes=[garment(i) for i in range(8)]
# A softly sculpted original chibi face on the connected humanoid rig.
def orb(name,loc,size,material):
 bpy.ops.mesh.primitive_uv_sphere_add(segments=32 if name=='Face' else 16,ring_count=24 if name=='Face' else 10,radius=1,location=loc)
 o=bpy.context.object;o.name=name;o.scale=size;bpy.ops.object.transform_apply(location=True,rotation=False,scale=True)
 o.data.materials.append(M[material])
 for f in o.data.polygons:f.use_smooth=True
 return bind(o,'Head')
M['EyeWhite']=mat('EyeWhite',(.97,.96,.89),.45)
M['Iris']=mat('Iris',(.032,.018,.012),.38)
M['Pupil']=mat('Pupil',(.009,.008,.011),.30)
M['Lip']=mat('Lip',(.42,.16,.07),.8)
headparts=[orb('Face',(0,-.006,1.63),(.335,.263,.32),'Skin')]
headparts.append(orb('Neck',(0,.012,1.19),(.079,.075,.12),'Skin'))
headparts.append(orb('Button_nose',(0,-.281,1.53),(.025,.028,.027),'Skin'))
for side in [-1,1]:
 headparts.append(orb('Ear',(side*.327,0,1.57),(.052,.045,.089),'Skin'))
 orb('Eye_outline',(side*.127,-.24,1.656),(.111,.020,.117),'Hair')
 orb('Eye_white',(side*.127,-.252,1.656),(.103,.017,.106),'EyeWhite')
 orb('Iris',(side*.121,-.271,1.65),(.060,.008,.080),'Iris')
 orb('Pupil',(side*.121,-.282,1.65),(.041,.004,.060),'Pupil')
 orb('Eye_spark',(side*.121-.019,-.288,1.688),(.017,.004,.023),'EyeWhite')
 orb('Eye_spark_small',(side*.121+.020,-.288,1.617),(.007,.003,.009),'EyeWhite')
 # Thick eyebrows form a confident, softer version of the reference expression.
 b=orb('Brow',(side*.13,-.237,1.789),(.113,.022,.019),'Hair')
 # A small smile avoids retaining the adult base character's jaw and lips.
for i in range(9):
 x=-.044+i*.011;z=1.429-.008*(1-(x/.044)**2)
 orb('Smile',(x,-.244,z),(.008,.006,.004),'Lip')
# Shorten the neck silhouette without changing the connected body's joint chain.
for obj in bpy.data.objects:
 if obj.type=='MESH' and obj!=body and any(g.name=='Head' for g in obj.vertex_groups):
  for v in obj.data.vertices:v.co.z-=.075
# Batch facial details into one skin with a primitive per material.
headparts=[o for o in bpy.data.objects if o.type=='MESH' and any(g.name=='Head' for g in o.vertex_groups)]
bpy.ops.object.select_all(action='DESELECT')
for o in headparts:o.select_set(True)
bpy.context.view_layer.objects.active=headparts[0];bpy.ops.object.join();face=headparts[0]
face.name='BodyAndFace'
# All face vertices share the head bone; the neck overlaps under the collar.
# Four hairstyles from the same CC0 base, bound to the head for independent choice.
hairdir=SOURCE/'Hairstyles/Origin at 0/glTF (Godot)'
for i,name in [(0,'Hair_SimpleParted'),(2,'Hair_Buzzed')]:
 before=set(bpy.data.objects);bpy.ops.import_scene.gltf(filepath=str(hairdir/(name+'.gltf')))
 imported=[o for o in bpy.data.objects if o not in before]
 mesh=next(o for o in imported if o.type=='MESH');mesh.name='Hair'+str(i)
 # Origin-at-zero versions still contain the head-height geometry.
 for v in mesh.data.vertices:
  v.co=chibi(mesh.matrix_world@v.co)
  v.co.z=1.6+(v.co.z-1.6)*.90-.075
 mesh.matrix_world=Matrix.Identity(4)
 # Native textures provide sculpted strand detail, downsampled for the web.
 for material in mesh.data.materials:
  material.name='HairTexture'+str(i)
  if material.use_nodes:
   material.node_tree.nodes.get("Principled BSDF").inputs["Base Color"].default_value=(.075,.032,.017,1)
   base_node=material.node_tree.nodes.get("Principled BSDF")
   for link in list(material.node_tree.links):
    if link.to_node==base_node and link.to_socket.name=="Base Color":material.node_tree.links.remove(link)
   for node in list(material.node_tree.nodes):
    if node.type=='TEX_IMAGE' and node.image:
     if node.image.size[0]==0:
      for link in list(material.node_tree.links):
       if link.from_node==node:material.node_tree.links.remove(link)
     elif node.image.size[0]>512:node.image.scale(512,512)
 bind(mesh,'Head')
 for o in imported:
  if o!=mesh:bpy.data.objects.remove(o,do_unlink=True)
# A hood and pocket give the first outfit an actual hoodie silhouette.
hood=block('Hood_back',(0,.13,1.12),(.25,.16,.15),'Fabric','spine_03',.065)
pocket=block('Hoodie_pocket',(0,-.158,.82),(.23,.035,.12),'Fabric','spine_02',.018)
details=[hood,pocket]
for x in [-.055,.055]:details.append(block('Drawstring',(x,-.135,1.04),(.01,.014,.13),'Trim','spine_03',.003))
bpy.ops.object.select_all(action='DESELECT');clothes[0].select_set(True)
for o in details:o.select_set(True)
bpy.context.view_layer.objects.active=clothes[0];bpy.ops.object.join()
# Layered curtain locks echo the reference's silhouette without duplicating its costume.
def hair_lock(name,points,radii):
 curve=bpy.data.curves.new(name,'CURVE');curve.dimensions='3D';curve.resolution_u=6
 curve.bevel_depth=.045;curve.bevel_resolution=2
 path=curve.splines.new('BEZIER');path.bezier_points.add(len(points)-1)
 for b,p,r in zip(path.bezier_points,points,radii):b.co=p;b.radius=r;b.handle_left_type='AUTO';b.handle_right_type='AUTO'
 for b in path.bezier_points:b.co.z-=.075
 o=bpy.data.objects.new(name,curve);bpy.context.collection.objects.link(o);o.data.materials.append(M['Hair'])
 bpy.ops.object.select_all(action='DESELECT');o.select_set(True);bpy.context.view_layer.objects.active=o;bpy.ops.object.convert(target='MESH');return bind(o,'Head')
locks=[]
for side in [-1,1]:
 for i in range(3):
  locks.append(hair_lock('Curtain_lock',[(side*.018,-.18,2.005-i*.008),(side*(.11+i*.015),-.27,1.98-i*.022),(side*(.245+i*.015),-.245,1.84-i*.03),(side*(.235+i*.02),-.235,1.73-i*.025)],[1,.95,.6,.03]))
hair=bpy.data.objects['Hair0'];bpy.ops.object.select_all(action='DESELECT');hair.select_set(True)
for o in locks:o.select_set(True)
bpy.context.view_layer.objects.active=hair;bpy.ops.object.join()
# Fitted chibi hair replaces stretched adult buns and long strands. All hair
# stays outside the cheek silhouette and follows the head joint.
def fitted_cap(style):
 verts=[];faces=[];segments=40;rows=12
 for row in range(rows+1):
  for j in range(segments):
   phi=2*math.pi*j/segments
   # Front fringe sits above the brows; sides and back cover the scalp.
   front=max(0,-math.sin(phi))**6
   limit=2.02-.91*front
   theta=.015+(limit-.015)*row/rows
   verts.append((.350*math.sin(theta)*math.cos(phi),.296*math.sin(theta)*math.sin(phi),1.575+.345*math.cos(theta)))
 for row in range(rows):
  for j in range(segments):
   a=row*segments+j;b=row*segments+(j+1)%segments;faces.append((a,b,b+segments,a+segments))
 faces.append(tuple(reversed(range(segments))))
 mesh=bpy.data.meshes.new('Fitted_hair');mesh.from_pydata(verts,[],faces);mesh.update()
 o=bpy.data.objects.new('Hair'+str(style),mesh);bpy.context.collection.objects.link(o);o.data.materials.append(M['Hair']);bind(o,'Head');return o
for style in [1,3,4,5,6,7]:
 hair=fitted_cap(style);parts=[]
 # Side-swept fringe is tapered and clears both eyes.
 for side in [-1,1]:
  parts.append(hair_lock('Soft_fringe',[(side*.015,-.19,1.97),(side*.14,-.286,1.94),(side*.27,-.23,1.81),(side*.30,-.17,1.70)],[1.05,1.3,1,.08]))
 if style==1:
  for side in [-1,1]:
   parts.append(orb('Soft_bun',(side*.28,.09,1.87),(.135,.13,.13),'Hair'))
   parts.append(orb('Bun_ribbon',(side*.285,.005,1.86),(.055,.022,.04),'Trim'))
 if style in [3,4]:
  # One continuous curtain of hair, with soft edges instead of separate blunt tubes.
  verts=[];faces=[];segments=32
  bottom=1.08 if style==3 else 1.36
  rows=[(1.80,.235,.21),(1.68,.326,.28),(1.48,.350,.295),(bottom+.07,.335,.285),(bottom,.29,.255)]
  for z,w,d in rows:
   for j in range(segments+1):
    phi=-.13+(math.pi+.26)*j/segments
    verts.append((w*math.cos(phi),d*math.sin(phi)+.016,z+.04*abs(math.cos(phi)) if z==bottom else z))
  for k in range(len(rows)-1):
   for j in range(segments):
    n=k*(segments+1)+j;faces.append((n,n+1,n+segments+2,n+segments+1))
  mesh=bpy.data.meshes.new('Continuous_layers');mesh.from_pydata(verts,[],faces);mesh.update()
  o=bpy.data.objects.new('Smooth_layers',mesh);bpy.context.collection.objects.link(o);o.data.materials.append(M['Hair'])
  bpy.context.view_layer.objects.active=o
  sub=o.modifiers.new('Flowing silhouette','SUBSURF');sub.levels=1;bpy.ops.object.modifier_apply(modifier=sub.name)
  thick=o.modifiers.new('Soft edge','SOLIDIFY');thick.thickness=.022;bpy.ops.object.modifier_apply(modifier=thick.name)
  bind(o,'Head');parts.append(o)
 if style==5:
  parts.append(orb('Pony_tie',(0,.27,1.81),(.10,.055,.09),'Trim'))
  for x in [-.06,0,.06]:parts.append(hair_lock('Ponytail',[(x,.30,1.88),(x,.43,1.74),(x,.46,1.48),(x+.03,.38,1.32)],[1.1,1.5,1,.10]))
 if style==6:
  for j in range(18):
   phi=2*math.pi*j/18
   parts.append(orb('Curl',(.295*math.cos(phi),.24*math.sin(phi),1.80+.06*math.sin(j*2)),(.075,.075,.075),'Hair'))
  for x,y in [(-.13,0),(0,0),(.13,0),(0,-.12),(0,.12)]:parts.append(orb('Crown_curl',(x,y,1.91),(.10,.10,.07),'Hair'))
 if style==7:
  for side in [-1,1]:
   for j in range(6):parts.append(orb('Braid',(side*(.30+.016*math.sin(j*math.pi/2)),.08,1.55-j*.055),(.063-j*.005,.062-j*.004,.055),'Hair'))
   parts.append(orb('Braid_tie',(side*.29,.08,1.24),(.04,.042,.022),'Trim'))
 bpy.ops.object.select_all(action='DESELECT');hair.select_set(True)
 for o in parts:o.select_set(True)
 bpy.context.view_layer.objects.active=hair;bpy.ops.object.join()
# Four additional silhouettes with sewn details; every piece retains skin weights.
for style in [4,5,6,7]:
 parts=[]
 if style==4:
  parts.append(block('Dress_waist',(0,-.139,.81),(.34,.024,.035),'Trim','spine_01',.01))
  for side in [-1,1]:parts.append(block('Dress_strap',(side*.12,-.14,1.015),(.034,.026,.20),'Trim','spine_02',.012))
 if style==5:
  for z in [.75,.85,.95,1.05]:parts.append(block('Pearl_button',(.066,-.155,z),(.021,.018,.021),'Trim','spine_02',.007))
 if style==6:
  for side in [-1,1]:parts.append(block('Sport_stripe',(side*.12,-.155,.93),(.035,.02,.31),'Trim','spine_02',.009))
  parts.append(block('Club_badge',(.12,-.172,1.045),(.065,.016,.05),'Accent','spine_03',.013))
 if style==7:
  parts.append(block('Star_badge',(.125,-.162,1.02),(.075,.03,.075),'Accent','spine_03',.018))
  for side in [-1,1]:parts.append(block('Jacket_trim',(side*.085,-.15,.93),(.022,.024,.29),'Fabric','spine_02',.006))
 bpy.ops.object.select_all(action='DESELECT');clothes[style].select_set(True)
 for o in parts:o.select_set(True)
 bpy.context.view_layer.objects.active=clothes[style];bpy.ops.object.join()

# Jacket details use the spine rig, not detached floating costume blocks.
for i in [1,2]:
 garment=clothes[i]
 details=[]
 for z in [.80,.90,1.0]:details.append(block('Gold_button',(.075,-.14,z),(.026,.025,.026),'Accent','spine_02',.008))
 details.append(block('Collar_left',(.07,-.095,1.10),(.055,.05,.08),'Jacket','spine_03',.014))
 details.append(block('Collar_right',(-.07,-.095,1.10),(.055,.05,.08),'Jacket','spine_03',.014))
 if i==2:
  for side in [-1,1]:
   details.append(block('Explorer_pocket',(side*.135,-.151,.875),(.10,.035,.12),'Fabric','spine_02',.014))
   details.append(block('Pocket_flap',(side*.135,-.176,.92),(.105,.018,.034),'Trim','spine_02',.006))
 # Join additions into the garment, retaining their skin weights and material slots.
 bpy.ops.object.select_all(action='DESELECT');garment.select_set(True)
 for o in details:o.select_set(True)
 bpy.context.view_layer.objects.active=garment;bpy.ops.object.join()
# The fitted hair shares smooth normals; fewer triangles keep eight variants
# inside the existing phone download budget without simplifying the face.
for style in [1,3,4,5,6,7]:
 o=bpy.data.objects['Hair'+str(style)];bpy.context.view_layer.objects.active=o
 de=o.modifiers.new('Phone hair topology','DECIMATE');de.ratio=.65;bpy.ops.object.modifier_apply(modifier=de.name)
# Missing normal maps from the source's filename aliases should not create bad exports.
for material in bpy.data.materials:
 if not material.use_nodes:continue
 for node in list(material.node_tree.nodes):
  if node.type=='TEX_IMAGE' and node.image:
   if not node.image.size[0]:
    for link in list(material.node_tree.links):
     if link.from_node==node:material.node_tree.links.remove(link)
   elif node.image.size[0]>512:node.image.scale(512,512)
# Save all variants; the game activates one garment and hairstyle at a time.
# Footwear shares two material passes, retaining individual left/right weights.
footwear=[o for o in bpy.data.objects if o.type=='MESH' and o.name.startswith(('Sneaker','Sole','Lace'))]
bpy.ops.object.select_all(action='DESELECT')
for o in footwear:o.select_set(True)
bpy.context.view_layer.objects.active=footwear[0];bpy.ops.object.join();footwear[0].name='Footwear'
for o in bpy.data.objects:
 if o.type=='MESH':
  # Imported paint masks are not colour; remove them before material reuse.
  for attr in list(o.data.color_attributes):o.data.color_attributes.remove(attr)
  for f in o.data.polygons:f.use_smooth=True
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'art/characters/neighbour-cute.blend'))
bpy.ops.export_scene.gltf(filepath=str(ROOT/'public/models/neighbour.glb'),export_format='GLB',export_animations=False,export_yup=True,export_extras=True)
print('CUTE_NEIGHBOUR_EXPORTED')
