"""Objets 3D du film v3 (bouteille, canette, papier, gobelet) rendus sur fond transparent.
Mêmes lumières que la station (render_film_v2_scene.py). Concept visuel, pas un modèle d'ingénierie.
Exécution sans carte graphique, avec le module Python de Blender :
    FILM_ENGINE=CYCLES /tmp/bpyenv/bin/python tools/render_film_v3_sprites.py
Sortie : tools/film_v3/sprites/<objet>.png (512 x 512, 1 m = 1280 px)
"""
import bpy, math, os
from pathlib import Path
from mathutils import Vector
import addon_utils
addon_utils.enable('cycles', default_set=True)
OUT = Path(__file__).resolve().parent / 'film_v3' / 'sprites'
OUT.mkdir(parents=True, exist_ok=True)
S = 512
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
scene = bpy.context.scene
scene.render.engine = 'CYCLES'
scene.cycles.device = 'CPU'; scene.cycles.samples = 64; scene.cycles.use_denoising = True
scene.render.resolution_x = scene.render.resolution_y = S
scene.render.film_transparent = True
scene.render.image_settings.file_format = 'PNG'; scene.render.image_settings.color_mode = 'RGBA'
scene.view_settings.view_transform = 'AgX'
for look in ('AgX - Medium High Contrast', 'Medium High Contrast'):
    try:
        scene.view_settings.look = look; break
    except TypeError:
        pass
scene.world.color = (.05, .09, .07)


def mat(name, color, metal=0, rough=.4, trans=0, emission=0):
    m = bpy.data.materials.new(name); m.use_nodes = True
    p = m.node_tree.nodes.get('Principled BSDF')
    p.inputs['Base Color'].default_value = (*color, 1); p.inputs['Metallic'].default_value = metal; p.inputs['Roughness'].default_value = rough
    if trans:
        p.inputs['Transmission Weight'].default_value = trans; p.inputs['IOR'].default_value = 1.45
    if emission:
        p.inputs['Emission Color'].default_value = (*color, 1); p.inputs['Emission Strength'].default_value = emission
    return m


PET = mat('PET', (.5, .78, .9), 0, .06, .92)
CAP = mat('Cap', (.05, .45, .27), 0, .35)
ALU = mat('Alu', (.78, .8, .78), .9, .22)
BAND = mat('Band', (.85, .16, .04), 0, .4)
PAPER = mat('Paper', (.94, .92, .84), 0, .62)
INK = mat('Ink', (.12, .16, .14), 0, .7)
CUP = mat('Cup', (.96, .95, .9), 0, .5)
LID = mat('Lid', (.12, .09, .07), 0, .4)
SLEEVE = mat('Sleeve', (.5, .33, .16), 0, .55)


def clear():
    for o in [o for o in bpy.data.objects if o.type == 'MESH']:
        bpy.data.objects.remove(o, do_unlink=True)


def cyl(r1, r2, h, z, m, verts=48, r_cap=True):
    bpy.ops.mesh.primitive_cone_add(vertices=verts, radius1=r1, radius2=r2, depth=h, location=(0, 0, z))
    o = bpy.context.object; o.data.materials.append(m); bpy.ops.object.shade_smooth()
    b = o.modifiers.new('b', 'BEVEL'); b.width = .0015; b.segments = 3
    return o


def bottle():
    cyl(.036, .036, .12, .06, PET)          # corps
    cyl(.036, .0155, .045, .1425, PET)      # épaule
    cyl(.0155, .0155, .03, .18, PET)        # col
    cyl(.0175, .0175, .014, .202, CAP, 32)  # bouchon
    cyl(.0295, .0295, .004, .008, PET)      # pied (bague)


def can():
    cyl(.033, .033, .115, .0575, ALU)
    cyl(.033, .028, .008, .119, ALU)
    cyl(.028, .028, .006, .1235, ALU)
    cyl(.0336, .0336, .04, .06, BAND)       # bande imprimée
    bpy.ops.mesh.primitive_torus_add(major_radius=.0215, minor_radius=.0016, location=(0, 0, .1272))
    o = bpy.context.object; o.data.materials.append(ALU)


def box(loc, dim, m, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cube_add(location=loc)
    o = bpy.context.object; o.dimensions = dim
    bpy.ops.object.transform_apply(scale=True)
    o.rotation_euler = rot; o.data.materials.append(m)
    return o


def paper():
    # feuille imprimée légèrement pliée en deux (deux demi-feuilles) : lecture claire de « papier »
    for sign in (-1, 1):
        ang = math.radians(-12 * sign)
        cx = sign * .0375 * math.cos(ang)
        cy = -sign * .0375 * math.sin(ang) * -1
        box((cx, cy, .105), (.075, .0022, .21), PAPER, (0, 0, ang))
        for i in range(7):
            w = .056 if i < 6 else .03
            lx = cx + (0 if i < 6 else -sign * .012)
            box((lx, cy - .0016, .185 - i * .0235), (w, .0007, .0045), INK, (0, 0, ang))


def cup():
    cyl(.028, .0405, .095, .0475, CUP)              # gobelet conique
    cyl(.0318, .0388, .036, .052, SLEEVE)           # manchon kraft
    cyl(.0452, .0452, .007, .0985, LID)             # couvercle
    cyl(.0408, .0408, .004, .1035, LID)             # bec


def lights_and_camera():
    for name, loc, power, size, color in [('key', (1.5, -3, 5), 1200, 4.5, (.82, 1, .89)), ('fill', (-3, -1.5, 2.5), 800, 4, (1, .84, .64)), ('rim', (2.5, 2, 3.7), 1500, 3, (.37, 1, .68))]:
        bpy.ops.object.light_add(type='AREA', location=loc); o = bpy.context.object; o.name = name
        o.data.energy = power; o.data.shape = 'DISK'; o.data.size = size; o.data.color = color
        o.rotation_euler = (Vector((0, 0, .1)) - o.location).to_track_quat('-Z', 'Y').to_euler()
    bpy.ops.object.camera_add(); cam = bpy.context.object; scene.camera = cam
    cam.data.type = 'ORTHO'; cam.data.ortho_scale = S / 1280   # 1 m = 1280 px
    el, az, d = math.radians(24), math.radians(28), 3
    cam.location = Vector((math.sin(az) * math.cos(el) * d, -math.cos(az) * math.cos(el) * d, .1 + math.sin(el) * d))
    cam.rotation_euler = (Vector((0, 0, .1)) - cam.location).to_track_quat('-Z', 'Y').to_euler()


lights_and_camera()
for name, build in [('bottle', bottle), ('can', can), ('paper', paper), ('cup', cup)]:
    clear(); build()
    scene.render.filepath = str(OUT / f'{name}.png')
    bpy.ops.render.render(write_still=True)
print('Objets 3D du film v3 :', OUT)
