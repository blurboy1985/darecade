"""Original stylised articulated neighbours. Blender source and lightweight GLB.
Game axes: X right, Y up, Z forward. Export meshes join by joint/material.
"""
import bpy, math, os
ROOT=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
def xyz(v): return (v[0],-v[2],v[1])
def mat(name,color):
 m=bpy.data.materials.new(name);m.diffuse_color=(*color,1);m.use_nodes=True
 p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*color,1);p.inputs['Roughness'].default_value=.72
 return m
M={k:mat(k,v) for k,v in {'Skin':(.76,.49,.32),'Fabric':(.46,.60,.84),'Trim':(.93,.89,.80),'Pants':(.16,.22,.31),'Hair':(.095,.064,.055),'White':(.99,.97,.9),'Eye':(.12,.22,.22),'Lip':(.43,.19,.15),'Accent':(.95,.62,.28)}.items()}
def group(name,p=(0,0,0),parent=None):
 o=bpy.data.objects.new(name,None);bpy.context.collection.objects.link(o);o.parent=parent;o.location=xyz(p);return o
def orb(name,p,size,material,parent):
 bpy.ops.mesh.primitive_uv_sphere_add(segments=12,ring_count=8,radius=1)
 o=bpy.context.object;o.name=name;o.parent=parent;o.location=xyz(p);o.scale=(size[0],size[2],size[1]);o.data.materials.append(M[material])
 for f in o.data.polygons:f.use_smooth=True
 return o
def block(name,p,size,material,parent,bevel=.04):
 bpy.ops.mesh.primitive_cube_add(size=1);o=bpy.context.object;o.name=name;o.dimensions=(size[0],size[2],size[1]);bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
 o.parent=parent;o.location=xyz(p);o.data.materials.append(M[material]);mod=o.modifiers.new('Soft tailored edges','BEVEL');mod.width=bevel;mod.segments=2
 bpy.ops.object.modifier_apply(modifier=mod.name)
 for f in o.data.polygons:f.use_smooth=True
 return o
root=group('NeighbourRig')
spine=group('Spine',(0,.96,0),root)
for style in range(4):
 g=group('Clothing'+str(style),parent=spine)
 orb('Tailored_top',(0,.06,0),(.275,.35,.17),'Fabric',g)
 if style==0:
  orb('Hood',(0,.31,-.14),(.24,.16,.12),'Fabric',g)
  block('Kangaroo_pocket',(0,-.12,.155),(.27,.11,.06),'Trim',g,.025)
  for x in [-.07,.07]:block('Drawstring',(x,.19,.158),(.015,.18,.018),'Trim',g,.006)
 if style==1:
  block('Jacket_front',(0,.03,.17),(.1,.54,.035),'Trim',g,.012)
  for y in [-.16,-.04,.08,.2]:orb('Button',(.02,y,.201),(.016,.016,.009),'Accent',g)
  block('Club_patch',(-.15,.18,.155),(.09,.08,.027),'Accent',g,.02)
 if style==2:
  for x in [-.15,.15]:
   block('Vest_panel',(x,.08,.16),(.19,.42,.05),'Pants',g)
   block('Utility_pocket',(x,-.01,.20),(.12,.13,.04),'Accent',g,.02)
  block('Belt',(0,-.24,.06),(.49,.055,.28),'Pants',g,.01)
 if style==3:
  bpy.ops.mesh.primitive_cone_add(vertices=20,radius1=.34,radius2=.20,depth=.37)
  o=bpy.context.object;o.name='Skater_skirt';o.parent=g;o.location=xyz((0,-.36,0));o.data.materials.append(M['Fabric'])
  for f in o.data.polygons:f.use_smooth=True
  block('Waist_band',(0,-.22,.015),(.43,.055,.31),'Trim',g,.025)
orb('Neck',(0,1.38,0),(.095,.12,.085),'Skin',root)
head=group('Head',(0,1.61,0),root)
orb('Face',(0,0,0),(.205,.245,.18),'Skin',head)
for side in [-1,1]:
 orb('Ear',(side*.203,-.015,0),(.04,.066,.045),'Skin',head)
 orb('Eye_white',(side*.082,.015,.164),(.053,.032,.023),'White',head)
 orb('Iris',(side*.078,.015,.186),(.023,.026,.012),'Eye',head)
 orb('Eye_glint',(side*.074,.026,.198),(.008,.008,.004),'White',head)
 brow=orb('Brow',(side*.082,.067,.162),(.058,.012,.019),'Hair',head)
 brow.rotation_euler.y=side*.1
orb('Nose',(0,-.043,.178),(.037,.044,.041),'Skin',head)
orb('Smile',(0,-.107,.16),(.068,.009,.012),'Lip',head)
for style in range(4):
 h=group('Hair'+str(style),parent=head)
 orb('Crown',(0,.17,-.015),(.219,.115,.183),'Hair',h)
 if style==0:
  for i in range(5):orb('Wave',(-.15+i*.074,.17,.115),(.065,.065,.055),'Hair',h)
 elif style==1:
  orb('Bun',(0,.27,-.10),(.115,.115,.12),'Hair',h)
  for x in [-.175,.175]:orb('Temple',(x,.10,.005),(.04,.13,.13),'Hair',h)
 elif style==2:
  for x in [-.14,-.07,0,.07,.14]:orb('Curl',(x,.22,.11),(.07,.075,.07),'Hair',h)
  orb('Back',(0,.06,-.135),(.185,.18,.07),'Hair',h)
 else:
  for x in [-.178,.178]:orb('Bob',(x,-.035,-.055),(.072,.23,.14),'Hair',h)
  orb('Fringe',(-.055,.12,.135),(.15,.10,.045),'Hair',h)
for side,name in [(-1,'Left'),(1,'Right')]:
 arm=group(name+'Arm',(side*.335,1.25,0),root)
 orb('Sleeve',(0,-.085,0),(.105,.17,.12),'Fabric',arm)
 orb('Upper_arm',(0,-.19,0),(.076,.10,.08),'Skin',arm)
 elbow=group(name+'Elbow',(0,-.265,0),arm)
 orb('Forearm',(0,-.105,0),(.064,.135,.07),'Skin',elbow)
 hand=group(name+'Hand',(0,-.24,0),elbow)
 orb('Hand',(0,-.025,.007),(.064,.084,.047),'Skin',hand)
 orb('Thumb',(-side*.05,-.016,.03),(.026,.05,.025),'Skin',hand)
 leg=group(name+'Leg',(side*.14,.71,0),root)
 orb('Trousers',(0,-.12,0),(.122,.20,.13),'Pants',leg)
 knee=group(name+'Knee',(0,-.30,0),leg)
 orb('Shin',(0,-.125,0),(.082,.175,.094),'Pants',knee)
 block('Sneaker',(0,-.28,.045),(.20,.14,.32),'Trim',knee,.06)
 block('Sole',(0,-.325,.05),(.21,.038,.33),'White',knee,.015)
 for z in [.05,.10]:block('Lace',(0,-.21,z),(.13,.012,.02),'White',knee,.004)
# Combine same-material geometry at each joint to control draw calls on phones.
parents=[o for o in bpy.data.objects if o.type=='EMPTY']
for parent in parents:
 children=[o for o in parent.children if o.type=='MESH']
 for material in M.values():
  objs=[o for o in list(parent.children) if o.type=="MESH" and o.data.materials and o.data.materials[0]==material]
  if len(objs)<2:continue
  bpy.ops.object.select_all(action='DESELECT')
  for o in objs:o.select_set(True)
  bpy.context.view_layer.objects.active=objs[0];bpy.ops.object.join();objs[0].name=parent.name+'_'+material.name
# The authoring file keeps all outfit and hair alternatives for editing.
os.makedirs(os.path.join(ROOT,'art','characters'),exist_ok=True)
os.makedirs(os.path.join(ROOT,'public','models'),exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(ROOT,'art','characters','neighbour.blend'))
bpy.ops.export_scene.gltf(filepath=os.path.join(ROOT,'public','models','neighbour.glb'),export_format='GLB',export_animations=False,export_yup=True)
print('DARECADE_CHARACTER_EXPORTED')
