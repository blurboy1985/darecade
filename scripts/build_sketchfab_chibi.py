"""Build the Play Simi avatar from "Chibi Girl Character" with Blender 5.2.

Source: Chibi Girl Character by Syed's Creation (@Dawood3D), CC BY 4.0,
https://sketchfab.com/3d-models/chibi-girl-character-3e795731d68d416eb0b8770a6b363e65
Unpack the download into art/characters/sketchfab-chibi-girl/ first.

The source is one unrigged 77.8k-triangle mesh in an A pose. This script splits
it by material, reduces it, adds the boy hair and the extra garments, binds
everything to the game's 41-bone skeleton and exports
public/models/neighbour-chibi2.glb.

  blender -b --python scripts/build_sketchfab_chibi.py

CHIBI2_SKIP_PROOFS=1 skips the proof renders.
"""
import bpy, bmesh, json, math, os, struct
import numpy as np
from pathlib import Path
from mathutils import Matrix, Vector

ROOT = Path(__file__).resolve().parents[1]
ART = ROOT / "art/characters/sketchfab-chibi-girl"
SRC = ART / "source/Final_chibi_1"
GLB = ROOT / "public/models/neighbour-chibi2.glb"

bpy.ops.wm.open_mainfile(filepath=str(SRC / "chibi1.blend"))
src = bpy.data.objects["Cube.007"]
# Source faces +X with its feet at the origin. The game skeleton faces -Y.
src.data.transform(
    Matrix(((0, 1, 0, 0), (-1, 0, 0, 0.65), (0, 0, 1, 0), (0, 0, 0, 1)))
    @ src.matrix_world
)
src.matrix_world = Matrix.Identity(4)
SOURCE_TRIANGLES = sum(len(p.vertices) - 2 for p in src.data.polygons)


def activate(ob):
    bpy.ops.object.select_all(action="DESELECT")
    ob.select_set(True)
    bpy.context.view_layer.objects.active = ob


def sstep(a, b, x):
    t = np.clip((x - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)


def coords(ob):
    out = np.empty(len(ob.data.vertices) * 3, np.float32)
    ob.data.vertices.foreach_get("co", out)
    return out.reshape(-1, 3).astype(np.float64)


def set_coords(ob, P):
    ob.data.vertices.foreach_set("co", P.astype(np.float32).ravel())
    ob.data.update()


# --- islands -----------------------------------------------------------------
bm = bmesh.new()
bm.from_mesh(src.data)
bm.verts.ensure_lookup_table()
bm.faces.ensure_lookup_table()
island = [-1] * len(bm.verts)
boxes = []
for seed in bm.verts:
    if island[seed.index] >= 0:
        continue
    stack, members = [seed], []
    island[seed.index] = len(boxes)
    while stack:
        v = stack.pop()
        members.append(v)
        for e in v.link_edges:
            w = e.other_vert(v)
            if island[w.index] < 0:
                island[w.index] = len(boxes)
                stack.append(w)
    P = np.array([v.co for v in members])
    boxes.append((P.min(0), P.max(0), len(members)))
material_names = [m.name for m in src.data.materials]
face_material = [material_names[f.material_index] for f in bm.faces]
face_island = [island[f.verts[0].index] for f in bm.faces]
bm.free()


def is_bun(i):
    lo, hi, _ = boxes[i]
    return lo[2] > 1.5 and abs((lo[0] + hi[0]) / 2) > 0.25


def is_eye_frame(i):
    lo, hi, n = boxes[i]
    return n < 200 and 1.1 < lo[2] and hi[2] < 1.4 and min(abs(lo[0]), abs(hi[0])) > 0.05


def extract(name, keep, ratio=1.0):
    """Copy the faces chosen by keep(material, island) into a new object."""
    me = src.data.copy()
    b = bmesh.new()
    b.from_mesh(me)
    b.faces.ensure_lookup_table()
    drop = [
        f for f in b.faces if not keep(face_material[f.index], face_island[f.index])
    ]
    bmesh.ops.delete(b, geom=drop, context="FACES")
    b.to_mesh(me)
    b.free()
    me.materials.clear()
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    if ratio < 1:
        activate(ob)
        mod = ob.modifiers.new("reduce", "DECIMATE")
        mod.ratio = ratio
        bpy.ops.object.modifier_apply(modifier=mod.name)
    return ob


legs_island = min(
    {i for i, m in zip(face_island, face_material) if m == "skin" and boxes[i][2] > 1000},
    key=lambda i: boxes[i][1][2],
)
parts = {
    "Skin_Top": extract("Skin_Top", lambda m, i: m == "skin" and i != legs_island, 0.046),
    "Skin_Legs": extract("Skin_Legs", lambda m, i: m == "skin" and i == legs_island, 0.095),
    "Head": extract("Head", lambda m, i: m == "head" and not is_eye_frame(i), 0.18),
    "Lashes": extract("Lashes", lambda m, i: m == "head" and is_eye_frame(i), 0.55),
    "Eyes": extract("Eyes", lambda m, i: m == "eyes"),
    "Hair": extract("Hair", lambda m, i: m == "hairs" and not is_bun(i), 0.45),
    "Buns": extract("Buns", lambda m, i: m == "hairs" and is_bun(i), 0.36),
    "Beads": extract("Beads", lambda m, i: m == "pony", 0.09),
    "Jacket": extract("Jacket", lambda m, i: m == "jacket", 0.19),
    "Shirt": extract("Shirt", lambda m, i: m == "shirt", 0.18),
    "Trim": extract("Trim", lambda m, i: m == "bag"),
    "Skirt": extract("Skirt", lambda m, i: m == "skirt", 0.21),
    "Socks": extract("Socks", lambda m, i: m == "socks", 0.16),
}
frame_islands = [i for i in range(len(boxes)) if is_eye_frame(i)]
eye_centres = {
    side: float(
        np.mean(
            [(boxes[i][0][2] + boxes[i][1][2]) / 2 for i in frame_islands if boxes[i][0][0] * side > 0]
        )
    )
    for side in (-1, 1)
}
bpy.data.objects.remove(src, do_unlink=True)


# --- generated pieces --------------------------------------------------------
def cut(ob, name, z, keep_above, grow):
    """Copy ob, keep one side of a horizontal plane and push it out along normals."""
    new = ob.copy()
    new.data = ob.data.copy()
    new.name = name
    bpy.context.scene.collection.objects.link(new)
    b = bmesh.new()
    b.from_mesh(new.data)
    bmesh.ops.bisect_plane(
        b,
        geom=b.verts[:] + b.edges[:] + b.faces[:],
        dist=1e-5,
        plane_co=(0, 0, z),
        plane_no=(0, 0, 1),
        clear_inner=keep_above,
        clear_outer=not keep_above,
    )
    b.normal_update()
    for v in b.verts:
        v.co += v.normal * grow(v.co.z)
    b.to_mesh(new.data)
    b.free()
    return new


legs = parts["Skin_Legs"]
parts["Shorts"] = cut(
    legs, "Shorts", 0.3, True, lambda z: 0.016 + 0.022 * min(1, max(0, (0.5 - z) / 0.2))
)
parts["Trousers"] = cut(
    legs, "Trousers", 0.11, True, lambda z: 0.024 + 0.012 * min(1, max(0, (0.2 - z) / 0.09))
)
parts["Shoes"] = cut(legs, "Shoes", 0.06, False, lambda z: 0.014)
# Every look covers the hips, so the skin there only risks poking through.
b = bmesh.new()
b.from_mesh(legs.data)
bmesh.ops.delete(
    b, geom=[f for f in b.faces if all(v.co.z > 0.41 for v in f.verts)], context="FACES"
)
b.to_mesh(legs.data)
b.free()
# Boy hair: the same strands trimmed at ear level.
parts["HairShort"] = cut(parts["Hair"], "HairShort", 1.27, True, lambda z: 0)


def sheet(name, rows, cols, point):
    verts = [point(r / (rows - 1), c / (cols - 1)) for r in range(rows) for c in range(cols)]
    faces = [
        (r * cols + c, r * cols + c + 1, (r + 1) * cols + c + 1, (r + 1) * cols + c)
        for r in range(rows - 1)
        for c in range(cols - 1)
    ]
    me = bpy.data.meshes.new(name)
    me.from_pydata(verts, [], faces)
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    return ob


def cape_point(v, u):
    z = 0.9 - 0.56 * v
    width = 0.2 + 0.1 * v
    x = (u * 2 - 1) * width
    return (x, 0.235 + 0.08 * v - 0.07 * (x / width) ** 2, z)


parts["Cape"] = sheet("Cape", 12, 9, cape_point)

# --- skeleton ----------------------------------------------------------------
bpy.ops.import_scene.gltf(filepath=str(ROOT / "art/characters/chibi/neighbour-chibi.glb"))
rig = next(o for o in bpy.data.objects if o.type == "ARMATURE")
HATS = {"Mage_Hat": "Hat_Wizard", "Knight_Helmet": "Hat_Knight", "Barbarian_Hat": "Hat_Bear"}
old_atlas = None
for ob in list(bpy.data.objects):
    if ob.type == "MESH" and ob.parent == rig:
        if ob.name in HATS:
            ob.name = HATS[ob.name]
            parts[ob.name] = ob
        else:
            bpy.data.objects.remove(ob, do_unlink=True)
rig.name = "Simi_Chibi2_Rig"
LEG_X = 0.13  # The source stands with its feet closer together than KayKit.
activate(rig)
bpy.ops.object.mode_set(mode="EDIT")
for eb in rig.data.edit_bones:
    if eb.name.split(".")[0] in ("upperleg", "lowerleg", "foot", "toes"):
        sign = 1 if eb.name.endswith(".l") else -1
        eb.head.x = eb.tail.x = sign * LEG_X
bpy.ops.object.mode_set(mode="OBJECT")
rest = {b.name: np.array(b.head_local) for b in rig.data.bones}

# Joint positions in the source pose (left side; the right side is mirrored).
FIT = {
    "hips": (0, 0, 0.38),
    "spine": (0, 0, 0.5),
    "chest": (0, 0, 0.7),
    "head": (0, 0.036, 0.98),
    "upperarm": (0.19, 0, 0.81),
    "lowerarm": (0.275, -0.035, 0.685),
    "wrist": (0.355, -0.08, 0.56),
    "upperleg": (0.1, 0, 0.42),
    "lowerleg": (0.1, -0.008, 0.28),
    "foot": (0.095, 0.019, 0.145),
}
CHAIN = {  # bone -> the joint that ends its segment, and whether it may stretch
    "hips": ("spine", True),
    "spine": ("chest", True),
    "chest": ("head", True),
    "head": (None, False),
    "upperarm": ("lowerarm", True),
    "lowerarm": ("wrist", True),
    "wrist": (None, False),
    "upperleg": ("lowerleg", True),
    "lowerleg": ("foot", True),
    "foot": (None, False),
}
SIDED = ("upperarm", "lowerarm", "wrist", "upperleg", "lowerleg", "foot")


def fitted(joint, sign):
    return np.array(FIT[joint]) * (sign, 1, 1)


def bone_name(joint, sign):
    return joint + (".l" if sign > 0 else ".r") if joint in SIDED else joint


BONES = []
TO_SOURCE = {}  # bone -> 4x4 taking the skeleton's rest pose to the source pose
for joint, (end, stretch) in CHAIN.items():
    for sign in (1, -1) if joint in SIDED else (1,):
        name = bone_name(joint, sign)
        h1, h2 = rest[name], fitted(joint, sign)
        turn, scale = np.eye(3), np.eye(3)
        # A rigid end follows the bone before it.
        via, via_end = (joint, end) if end else {"wrist": ("lowerarm", "wrist")}.get(joint, (None, None))
        if via:
            a1, b1 = rest[bone_name(via, sign)], rest[bone_name(via_end, sign)]
            a2, b2 = fitted(via, sign), fitted(via_end, sign)
            d1, d2 = b1 - a1, b2 - a2
            l1, l2 = np.linalg.norm(d1), np.linalg.norm(d2)
            d1, d2 = d1 / l1, d2 / l2
            turn = np.array(Vector(d1).rotation_difference(Vector(d2)).to_matrix())
            if stretch:
                scale = np.eye(3) + (l2 / l1 - 1) * np.outer(d1, d1)
        m = np.eye(4)
        m[:3, :3] = turn @ scale
        m[:3, 3] = h2 - m[:3, :3] @ h1
        TO_SOURCE[name] = m
        BONES.append(name)

KIND = {
    "Skin_Top": "body",
    "Jacket": "body",
    "Shirt": "body",
    "Trim": "body",
    "Cape": "cape",
    "Skirt": "skirt",
    "Skin_Legs": "leg",
    "Socks": "leg",
    "Shorts": "leg",
    "Trousers": "leg",
    "Shoes": "leg",
}


def weigh(P, kind):
    """Skin weights from position alone, so every layer of clothing agrees."""
    x, y, z = P.T
    W = {b: np.zeros(len(P)) for b in BONES}
    if kind == "head":
        W["head"][:] = 1
        return W
    left = np.ones(len(P))
    if kind == "body":
        for sign in (1, -1):
            shoulder, elbow, wrist = (fitted(j, sign) for j in ("upperarm", "lowerarm", "wrist"))
            along = (wrist - shoulder) / np.linalg.norm(wrist - shoulder)
            u = (P - shoulder) @ along
            # Sleeves hang beside the body; this line runs down the gap.
            gap = 0.197 + (0.66 - z) * 0.4
            soft = np.interp(z, [0.66, 0.74], [0.012, 0.06])
            arm = sstep(-0.04, 0.06, u) * sstep(gap - soft, gap + soft, sign * x)
            at_elbow = np.linalg.norm(elbow - shoulder)
            at_wrist = np.linalg.norm(wrist - shoulder)
            e = sstep(at_elbow - 0.035, at_elbow + 0.035, u)
            k = sstep(at_wrist - 0.02, at_wrist + 0.02, u)
            W[bone_name("upperarm", sign)] = arm * (1 - e)
            W[bone_name("lowerarm", sign)] = arm * e * (1 - k)
            W[bone_name("wrist", sign)] = arm * e * k
            left = left - arm
        neck = sstep(0.95, 1.0, z)
        W["head"] = left * neck
        left = left * (1 - neck)
    if kind != "cape":
        if kind == "leg":
            leg = sstep(0.46, 0.36, z)
            side = sstep(-0.035, 0.035, x)
        else:  # Cloth hangs from the hips and only leans with the legs.
            leg = 0.45 * sstep(0.46, 0.26, z)
            side = sstep(-0.1, 0.1, x)
        knee = sstep(0.315, 0.245, z)
        ankle = sstep(0.165, 0.125, z)
        for sign, share in ((1, side), (-1, 1 - side)):
            w = left * leg * share
            W[bone_name("upperleg", sign)] = w * (1 - knee)
            W[bone_name("lowerleg", sign)] = w * knee * (1 - ankle)
            W[bone_name("foot", sign)] = w * knee * ankle
        left = left * (1 - leg)
    waist, ribs = sstep(0.45, 0.55, z), sstep(0.65, 0.75, z)
    W["hips"] = left * (1 - waist)
    W["spine"] = left * waist * (1 - ribs)
    W["chest"] = left * waist * ribs
    return W


def bind(ob, kind):
    P = coords(ob)
    W = np.stack([weigh(P, kind)[b] for b in BONES], 1)
    # glTF skins carry four influences.
    W[W < np.sort(W, 1)[:, [-4]]] = 0
    W /= W.sum(1, keepdims=True)
    blend = np.einsum("nb,bij->nij", W, np.stack([TO_SOURCE[b] for b in BONES]))
    homogeneous = np.concatenate([P, np.ones((len(P), 1))], 1)
    set_coords(ob, np.einsum("nij,nj->ni", np.linalg.inv(blend), homogeneous)[:, :3])
    for column, bone in enumerate(BONES):
        used = np.nonzero(W[:, column] > 1e-4)[0]
        if not len(used):
            continue
        group = ob.vertex_groups.new(name=bone)
        for i in used:
            group.add([int(i)], float(W[i, column]), "REPLACE")
    ob.parent = rig
    ob.modifiers.new("Armature", "ARMATURE").object = rig


for name, ob in parts.items():
    if not name.startswith("Hat_"):
        bind(ob, KIND.get(name, "head"))

# --- the three model hats from the earlier avatar ------------------------------
crown = float(coords(parts["Hair"])[:, 2].max())
for name, ob in parts.items():
    if not name.startswith("Hat_"):
        continue
    me = ob.data
    image = next(
        n.image for n in me.materials[0].node_tree.nodes if n.type == "TEX_IMAGE" and n.image
    )
    w, h = image.size
    pixels = np.array(image.pixels[:], np.float32).reshape(h, w, 4)
    uv = np.empty(len(me.loops) * 2, np.float32)
    me.uv_layers.active.data.foreach_get("uv", uv)
    uv = uv.reshape(-1, 2) % 1
    colour = pixels[
        np.clip((uv[:, 1] * h).astype(int), 0, h - 1), np.clip((uv[:, 0] * w).astype(int), 0, w - 1)
    ]
    # Image pixels are sRGB; colour attributes are linear.
    colour[:, :3] = np.where(
        colour[:, :3] > 0.04045, ((colour[:, :3] + 0.055) / 1.055) ** 2.4, colour[:, :3] / 12.92
    )
    attribute = me.color_attributes.new("Color", "FLOAT_COLOR", "CORNER")
    attribute.data.foreach_set("color", colour.ravel())
    me.color_attributes.active_color = attribute
    me.color_attributes.render_color_index = 0
    while me.uv_layers:
        me.uv_layers.remove(me.uv_layers[0])
    # The new head is a fifth larger and sits higher.
    P = coords(ob)
    P[:, 0] *= 1.22
    P[:, 1] = 0.075 + (P[:, 1] - 0.08) * 1.22
    P[:, 2] = crown - 0.07 + (P[:, 2] - 1.846) * 1.22
    set_coords(ob, P)

# --- blink ---------------------------------------------------------------------
LIFT = rest["head"][2] - FIT["head"][2]
for name in ("Eyes", "Lashes"):
    ob = parts[name]
    P = coords(ob)
    ob.shape_key_add(name="Basis")
    key = ob.shape_key_add(name="Blink")
    for side in (-1, 1):
        centre = eye_centres[side] + LIFT - 0.03
        rows = P[:, 0] * side > 0
        P[rows, 2] = centre + (P[rows, 2] - centre) * 0.07
    key.data.foreach_set("co", P.astype(np.float32).ravel())
    key.value = 0

# --- materials -----------------------------------------------------------------
def srgb(hexcode):
    return tuple(
        ((c / 255 + 0.055) / 1.055) ** 2.4 if c / 255 > 0.04045 else c / 255 / 12.92
        for c in (int(hexcode[i : i + 2], 16) for i in (1, 3, 5))
    ) + (1,)


for stale in bpy.data.materials:
    stale.name = "source-" + stale.name  # Free the names the game looks up.


def material(name, colour=None, image=None, vertex_colour=False):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    m.use_backface_culling = False
    shader = m.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Roughness"].default_value = 0.9
    shader.inputs["Specular IOR Level"].default_value = 0.12
    if colour:
        shader.inputs["Base Color"].default_value = srgb(colour)
        m.diffuse_color = srgb(colour)
    if image:
        node = m.node_tree.nodes.new("ShaderNodeTexImage")
        node.image = image
        m.node_tree.links.new(node.outputs["Color"], shader.inputs["Base Color"])
    if vertex_colour:
        node = m.node_tree.nodes.new("ShaderNodeVertexColor")
        node.layer_name = "Color"
        m.node_tree.links.new(node.outputs["Color"], shader.inputs["Base Color"])
    return m


def texture(filename, name, size=512):
    image = bpy.data.images.load(str(SRC / filename))
    image.name = name
    image.scale(size, size)
    image.pack()
    return image


face_image = texture("head Base Color.png", "chibi2-face")
eye_image = texture("Eyes_base_color.png", "chibi2-eyes")
# A second iris colour for the boy: the pink iris turned to blue.
px = np.array(eye_image.pixels[:], np.float32).reshape(-1, 4)
r, g, b = px[:, 0].copy(), px[:, 1].copy(), px[:, 2].copy()
pink = (r - np.minimum(g, b) > 0.08) & (r >= b)
px[pink, 0], px[pink, 1], px[pink, 2] = g[pink] * 0.9, (r[pink] + g[pink]) / 2, r[pink]
eye_image_b = bpy.data.images.new("chibi2-eyes-b", 512, 512, alpha=True)
eye_image_b.pixels.foreach_set(px.ravel())
eye_image_b.pack()

SKIN = "#ffc8b6"
MATERIALS = {
    "skin": material("skin", SKIN),
    "face": material("face", image=face_image),
    "eyes": material("eyes", image=eye_image),
    "eyes_b": material("eyes_b", image=eye_image_b),
    "hair": material("hair", "#fd7ba6"),
    "beads": material("beads", "#fe9500"),
    "jacket": material("jacket", "#ff96b3"),
    "shirt": material("shirt", "#ccf6ff"),
    "trim": material("trim", "#fbd6a6"),
    "bottom": material("bottom", "#98c2ef"),
    "socks": material("socks", "#1c1c22"),
    "shoes": material("shoes", "#f4f1ea"),
    "cape": material("cape", "#98c2ef"),
    "hat": material("hat", vertex_colour=True),
}
USES = {
    "Skin_Top": "skin",
    "Skin_Legs": "skin",
    "Head": "face",
    "Lashes": "face",
    "Eyes": "eyes",
    "Hair": "hair",
    "HairShort": "hair",
    "Buns": "hair",
    "Beads": "beads",
    "Jacket": "jacket",
    "Shirt": "shirt",
    "Trim": "trim",
    "Skirt": "bottom",
    "Shorts": "bottom",
    "Trousers": "bottom",
    "Socks": "socks",
    "Shoes": "shoes",
    "Cape": "cape",
}
eyes_b = parts["Eyes"].copy()
eyes_b.data = parts["Eyes"].data.copy()
eyes_b.name = "EyesB"
bpy.context.scene.collection.objects.link(eyes_b)
parts["EyesB"] = eyes_b
USES["EyesB"] = "eyes_b"
for name, ob in parts.items():
    ob.data.name = name
    ob.data.materials.clear()
    ob.data.materials.append(MATERIALS[USES.get(name, "hat")])
    if USES.get(name) not in ("face", "eyes", "eyes_b"):
        while ob.data.uv_layers:
            ob.data.uv_layers.remove(ob.data.uv_layers[0])
    for polygon in ob.data.polygons:
        polygon.use_smooth = True
rig["source"] = "Chibi Girl Character by Syed's Creation, CC BY 4.0, modified"

# --- export ----------------------------------------------------------------------
bpy.ops.object.select_all(action="DESELECT")
rig.select_set(True)
for ob in parts.values():
    ob.select_set(True)
bpy.context.view_layer.objects.active = rig
bpy.ops.export_scene.gltf(
    filepath=str(GLB),
    export_format="GLB",
    use_selection=True,
    export_animations=False,
    export_yup=True,
    export_apply=False,
    export_extras=True,
    export_image_format="AUTO",
    export_materials="EXPORT",
    export_skins=True,
    export_morph=True,
    export_morph_normal=False,
    export_morph_tangent=False,
    export_try_sparse_sk=True,
    export_try_omit_sparse_sk=True,
)

with open(GLB, "rb") as f:
    f.read(12)
    length = struct.unpack("<I", f.read(4))[0]
    f.read(4)
    gltf = json.loads(f.read(length))
report = {
    "source": "Chibi Girl Character by Syed's Creation (CC BY 4.0)",
    "source_triangles": SOURCE_TRIANGLES,
    "glb_bytes": GLB.stat().st_size,
    "bones": len(rig.data.bones),
    "base_skin": SKIN,
    "crown_z": round(crown, 4),
    "parts": {},
}
for mesh in gltf["meshes"]:
    report["parts"][mesh["name"]] = {
        "vertices": sum(gltf["accessors"][p["attributes"]["POSITION"]]["count"] for p in mesh["primitives"]),
        "triangles": sum(gltf["accessors"][p["indices"]]["count"] // 3 for p in mesh["primitives"]),
    }
report["total_triangles"] = sum(p["triangles"] for p in report["parts"].values())
for name, ob in parts.items():
    P = coords(ob)
    report["parts"].setdefault(name, {})["min"] = np.round(P.min(0), 3).tolist()
    report["parts"][name]["max"] = np.round(P.max(0), 3).tolist()
(ART / "budgets.json").write_text(json.dumps(report, indent=2) + "\n")
print("CHIBI2_COMPLETE", json.dumps({k: v for k, v in report.items() if k != "parts"}), flush=True)
print("CHIBI2_PARTS", json.dumps({k: v["triangles"] for k, v in report["parts"].items()}), flush=True)

# --- proofs ------------------------------------------------------------------------
if not os.environ.get("CHIBI2_SKIP_PROOFS"):
    scene = bpy.context.scene
    for ob in list(bpy.data.objects):
        if ob.type in ("CAMERA", "LIGHT"):
            bpy.data.objects.remove(ob, do_unlink=True)
    camera = bpy.data.objects.new("camera", bpy.data.cameras.new("camera"))
    scene.collection.objects.link(camera)
    scene.camera = camera
    camera.data.type = "ORTHO"
    camera.data.ortho_scale = 2.6
    scene.render.engine = "BLENDER_WORKBENCH"
    scene.display.shading.light = "STUDIO"
    scene.display.shading.color_type = "TEXTURE"
    scene.render.resolution_x = scene.render.resolution_y = 640
    rig.hide_render = True

    def show(names):
        for name, ob in parts.items():
            ob.hide_render = name not in names

    def turn_bone(name, axis, angle):
        bone = rig.pose.bones[name]
        head = bone.matrix.translation.copy()
        bone.matrix = (
            Matrix.Translation(head)
            @ Matrix.Rotation(angle, 4, axis)
            @ Matrix.Translation(-head)
            @ bone.matrix
        )
        bpy.context.view_layer.update()

    def shoot(name, view):
        camera.location, camera.rotation_euler = {
            "front": ((0, -6, 1.12), (math.pi / 2, 0, 0)),
            "side": ((6, 0, 1.12), (math.pi / 2, 0, math.pi / 2)),
            "back": ((0, 6, 1.12), (math.pi / 2, 0, math.pi)),
            "three": ((3.6, -4.8, 1.9), (math.radians(82), 0, math.radians(37))),
        }[view]
        scene.render.filepath = str(ART / f"proof-{name}.png")
        bpy.ops.render.render(write_still=True)

    GIRL = ["Skin_Top", "Skin_Legs", "Head", "Lashes", "Eyes", "Hair", "Buns", "Beads", "Jacket", "Shirt", "Trim", "Skirt", "Socks"]
    BOY = ["Skin_Top", "Skin_Legs", "Head", "Lashes", "EyesB", "HairShort", "Jacket", "Shirt", "Trim", "Shorts", "Socks", "Shoes"]
    show(GIRL)
    shoot("girl-rest", "front")
    for sign, side in ((1, ".l"), (-1, ".r")):
        turn_bone("upperarm" + side, "Y", sign * 1.4)
    shoot("girl-front", "front")
    shoot("girl-side", "side")
    shoot("girl-back", "back")
    show(BOY)
    shoot("boy-front", "front")
    shoot("boy-three", "three")
    show(["Skin_Top", "Skin_Legs", "Head", "Lashes", "Eyes", "Hair", "Shirt", "Trim", "Trousers", "Shoes", "Cape", "Hat_Wizard"])
    shoot("extras-three", "three")
    shoot("extras-back", "back")
    # A stride with one arm raised shows how the joints hold up.
    show(GIRL)
    turn_bone("upperleg.l", "X", 0.7)
    turn_bone("lowerleg.l", "X", -0.8)
    turn_bone("upperleg.r", "X", -0.6)
    turn_bone("upperarm.r", "Y", 2.2)
    turn_bone("lowerarm.l", "X", 0.9)
    turn_bone("head", "Z", 0.5)
    for ob in (parts["Eyes"], parts["Lashes"]):
        ob.data.shape_keys.key_blocks["Blink"].value = 1
    shoot("girl-stride", "three")
    shoot("girl-stride-side", "side")
