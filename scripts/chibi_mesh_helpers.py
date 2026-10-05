"""Small original mesh assembly and CC0-compatible skin weight helpers.

Loaded by build_chibi_character.py with its shared rig and atlas materials.
"""
class Part:
    def __init__(self,name,who): self.name=name; self.who=who; self.v=[]; self.f=[]; self.uv=[]; self.w=[]; self.morphs={}
    def add(self,verts,faces,cell,weights='head',shade=None):
        n=len(self.v)
        for j,v in enumerate(verts):
            self.v.append(tuple(v)); self.w.append(weights(v) if callable(weights) else {weights:1})
            # Keep UVs well inside one cell; height gives a subtle hand-painted shade.
            g=.5 if shade is None else min(.85,max(.15,shade(v)))
            self.uv.append(((cell%8+.5)/8,.5+.5*(1-(cell//8+1-g)/4)))
        self.f.extend(tuple(n+i for i in f) for f in faces)
    def finish(self):
        mesh=bpy.data.meshes.new(self.name); mesh.from_pydata(self.v,[],self.f); mesh.update()
        bm=bmesh.new(); bm.from_mesh(mesh); bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces)); bm.to_mesh(mesh); bm.free()
        ob=bpy.data.objects.new(self.name,mesh); bpy.context.collection.objects.link(ob)
        mesh.materials.append(materials[self.who.lower()])
        uv=mesh.uv_layers.new(name='Palette')
        for p in mesh.polygons:
            p.use_smooth=True
            for li in p.loop_indices: uv.data[li].uv=self.uv[mesh.loops[li].vertex_index]
        if self.morphs:
            ob.shape_key_add(name='Basis')
            for name, positions in self.morphs.items():
                key=ob.shape_key_add(name=name); key.value=0
                for v,co in zip(key.data,positions): v.co=co
        groups={}
        for i,w in enumerate(self.w):
            for bone,value in w.items():
                if value<.0001: continue
                if bone not in groups: groups[bone]=ob.vertex_groups.new(name=bone)
                groups[bone].add([i],value,'REPLACE')
        mod=ob.modifiers.new('Shared character skeleton','ARMATURE'); mod.object=rig
        ob.parent=rig
        return ob

def blend(a,b,t):
    t=max(0,min(1,t))
    return {a:1-t,b:t} if a!=b else {a:1}
def torso(v):
    z=v[2]
    return blend('hips','spine',(z-.55)/.27) if z<.82 else blend('spine','chest',(z-.82)/.24)
def arm(side):
    def weight(v):
        x=abs(v[0]); s='.'+side
        if x<.52: return blend('upperarm'+s,'lowerarm'+s,(x-.39)/.13)
        if x<.77: return blend('lowerarm'+s,'wrist'+s,(x-.67)/.10)
        return {'hand'+s:1}
    return weight
def leg(side):
    def weight(v):
        z=v[2]; s='.'+side
        if z>.24: return blend('lowerleg'+s,'upperleg'+s,(z-.24)/.12)
        return blend('foot'+s,'lowerleg'+s,(z-.12)/.12)
    return weight

def ell(p,c,r,cell,w='head',n=20,m=12):
    verts=[]; faces=[]
    for j in range(m+1):
        a=pi*j/m
        for i in range(n):
            b=2*pi*i/n; verts.append((c[0]+r[0]*sin(a)*cos(b),c[1]+r[1]*sin(a)*sin(b),c[2]+r[2]*cos(a)))
    for j in range(m):
        for i in range(n): faces.append((j*n+i,j*n+(i+1)%n,(j+1)*n+(i+1)%n,(j+1)*n+i))
    p.add(verts,faces,cell,w,lambda v:.25+.5*(v[2]-c[2]+r[2])/(2*r[2]))

def rings(p,rs,cell,w=torso,n=16,axis='z',cx=0):
    verts=[]; faces=[]
    for h,rx,ry,cy in rs:
        for i in range(n):
            a=2*pi*i/n
            verts.append((cx+rx*cos(a),cy+ry*sin(a),h) if axis=='z' else (h,cy+rx*cos(a),1.107+ry*sin(a)))
    for j in range(len(rs)-1):
        for i in range(n): faces.append((j*n+i,j*n+(i+1)%n,(j+1)*n+(i+1)%n,(j+1)*n+i))
    faces.extend([tuple(reversed(range(n))),tuple((len(rs)-1)*n+i for i in range(n))])
    p.add(verts,faces,cell,w,lambda v:.35+.3*v[2]/2)

def sweep(p,points,widths,depths,cell,w='head',n=8):
    pts=[Vector(v) for v in points]; verts=[]; faces=[]
    for i,c in enumerate(pts):
        tangent=(pts[min(i+1,len(pts)-1)]-pts[max(0,i-1)]).normalized()
        front=Vector((0,-1,0)); across=tangent.cross(front).normalized()
        if across.length<.1: across=Vector((1,0,0))
        front=across.cross(tangent).normalized()
        for j in range(n):
            a=2*pi*j/n; verts.append(c+across*(widths[i]*cos(a))+front*(depths[i]*sin(a)))
    for i in range(len(pts)-1):
        for j in range(n): faces.append((i*n+j,i*n+(j+1)%n,(i+1)*n+(j+1)%n,(i+1)*n+j))
    faces += [tuple(reversed(range(n))),tuple((len(pts)-1)*n+j for j in range(n))]
    p.add(verts,faces,cell,w)
