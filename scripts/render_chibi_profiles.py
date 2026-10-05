"""Render repeatable front, quarter, side and rear proofs from the saved blend.

PROFILE_OUTPUT selects an evidence directory; the packed source is not modified.
"""
import bpy, math, os
from pathlib import Path
from mathutils import Vector, Quaternion

ROOT = Path(__file__).resolve().parents[1]
bpy.ops.wm.open_mainfile(filepath=str(ROOT / 'art/characters/chibi/simi-chibi.blend'))
scene = bpy.context.scene
scene.cycles.samples = 16
scene.render.resolution_x = 480
scene.render.resolution_y = 480
scene.render.resolution_percentage = 100
camera = scene.camera
camera.data.ortho_scale = 1.12
rig = next(o for o in bpy.data.objects if o.type == 'ARMATURE')
for side, angle in [('l', -1.18), ('r', 1.18)]:
    pb = rig.pose.bones['upperarm.' + side]
    pb.rotation_mode = 'QUATERNION'
    rest = pb.bone.matrix_local.to_quaternion()
    pb.rotation_quaternion = rest.inverted() @ Quaternion((0, 1, 0), -angle) @ rest
out = Path(os.environ.get('PROFILE_OUTPUT', ROOT / '.browser/profile-after'))
out.mkdir(parents=True, exist_ok=True)
for family in ['Rogue', 'Mage', 'Knight', 'Barbarian']:
    for ob in bpy.data.objects:
        if ob.type == 'MESH' and ob.name != 'Studio floor':
            hidden = not (ob.name.startswith(family + '_') and not any(s in ob.name for s in ['Hat', 'Helmet', 'Hooded']))
            ob.hide_render = hidden
            ob.hide_set(hidden)
    for angle in [0, 45, 90, 135, 180, 270]:
        a = math.radians(angle)
        camera.location = (6 * math.sin(a), -6 * math.cos(a), 1.47)
        camera.rotation_euler = (Vector((0, 0, 1.47)) - camera.location).to_track_quat('-Z', 'Y').to_euler()
        scene.render.filepath = str(out / f'{family.lower()}-{angle}.png')
        bpy.ops.render.render(write_still=True)
    # Expressions and optional headwear are reviewed at the revealing side angle.
    head = bpy.data.objects[family + '_Head']
    for angle in [90, 270]:
        a = math.radians(angle)
        camera.location = (6 * math.sin(a), -6 * math.cos(a), 1.47)
        camera.rotation_euler = (Vector((0, 0, 1.47)) - camera.location).to_track_quat('-Z', 'Y').to_euler()
        for expression in ['Blink', 'Smile']:
            key = head.data.shape_keys.key_blocks[expression]
            key.value = 1
            scene.render.filepath = str(out / f'{family.lower()}-{angle}-{expression.lower()}.png')
            bpy.ops.render.render(write_still=True)
            key.value = 0
    hatname = {'Rogue': 'Rogue_Head_Hooded', 'Mage': 'Mage_Hat', 'Knight': 'Knight_Helmet', 'Barbarian': 'Barbarian_Hat'}[family]
    hat = bpy.data.objects[hatname]
    if family == 'Rogue':
        head.hide_render = True
        head.hide_set(True)
    hat.hide_render = False
    hat.hide_set(False)
    camera.data.ortho_scale = 1.55
    for angle in [0, 90, 180, 270]:
        a = math.radians(angle)
        camera.location = (6 * math.sin(a), -6 * math.cos(a), 1.62)
        camera.rotation_euler = (Vector((0, 0, 1.62)) - camera.location).to_track_quat('-Z', 'Y').to_euler()
        scene.render.filepath = str(out / f'{family.lower()}-{angle}-hat.png')
        bpy.ops.render.render(write_still=True)
    camera.data.ortho_scale = 1.12

if os.environ.get('PROFILE_PORTRAITS'):
    camera.location = (2.4, -7, 2.4)
    camera.rotation_euler = (Vector((0, 0, .96)) - camera.location).to_track_quat('-Z', 'Y').to_euler()
    camera.data.ortho_scale = 2.29
    scene.render.resolution_x = 900
    scene.render.resolution_y = 1100
    for family in ['Rogue', 'Mage', 'Knight', 'Barbarian']:
        for ob in bpy.data.objects:
            if ob.type == 'MESH' and ob.name != 'Studio floor':
                hidden = not (ob.name.startswith(family + '_') and not any(s in ob.name for s in ['Hat', 'Helmet', 'Hooded']))
                ob.hide_render = hidden
                ob.hide_set(hidden)
        scene.render.filepath = str(ROOT / 'art/characters/chibi' / (family.lower() + '-portrait.png'))
        bpy.ops.render.render(write_still=True)
    for ob in bpy.data.objects:
        if ob.type == 'MESH' and ob.name != 'Studio floor':
            hidden = not (ob.name.startswith('Rogue_') and not any(s in ob.name for s in ['Hat', 'Helmet', 'Hooded']))
            ob.hide_render = hidden
            ob.hide_set(hidden)
    camera.location = (.3, -6, 1.73)
    camera.rotation_euler = (Vector((0, 0, 1.47)) - camera.location).to_track_quat('-Z', 'Y').to_euler()
    camera.data.ortho_scale = 1.10
    scene.render.resolution_x = scene.render.resolution_y = 1000
    for name in ['face-detail', 'blink-face', 'smile-face']:
        for expression in ['Blink', 'Smile']:
            bpy.data.objects['Rogue_Head'].data.shape_keys.key_blocks[expression].value = int(name.startswith(expression.lower()))
        scene.render.filepath = str(ROOT / 'art/characters/chibi' / (name + '.png'))
        bpy.ops.render.render(write_still=True)
    for expression in ['Blink', 'Smile']:
        bpy.data.objects['Rogue_Head'].data.shape_keys.key_blocks[expression].value = 0

print('PROFILE_PROOFS_COMPLETE', out)
