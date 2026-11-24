"""Images fixes de la station pour le site : rendu 3D entier, détouré, avec une ombre douce intégrée à la base.
1) Rendre les vues (Blender, sans carte graphique, environ 1 min 40 par image) :
     FILM_SET=stills FILM_ENGINE=CYCLES FILM_SAMPLES=48 FILM_W=1000 FILM_H=1000 \
       /tmp/bpyenv/bin/python tools/render_film_v2_scene.py
2) Assembler les WebP du site (ombre + deux tailles) :
     python3 tools/build_station_stills.py
Entrée : /tmp/ecoscan-film-v2/still-<vue>.png  Sortie : assets/station/<nom>-{1000,800,480}.webp
Concept visuel, pas un modèle d'ingénierie.
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter

SRC = Path('/tmp/ecoscan-film-v2')
OUT = Path(__file__).resolve().parents[1] / 'assets' / 'station'
OUT.mkdir(parents=True, exist_ok=True)
# vue rendue -> nom utilisé dans index.html
VIEWS = {
    'exterior': 'ouverture',
    'front': 'session',
    'cutaway': 'separation',
    'routing-pet': 'aiguillage',
    'routing-alu': 'capteurs',
    'routing-hold': 'compartiments',
}


def with_shadow(im):
    # le rendu est réduit à 94 % et posé en haut du canvas : marge sous la machine pour l'ombre et la flottaison
    small = im.resize((940, 940), Image.LANCZOS)
    im = Image.new('RGBA', (1000, 1000), (0, 0, 0, 0))
    im.alpha_composite(small, (30, 6))
    a = im.split()[3]
    solid = a.point(lambda v: 255 if v > 128 else 0)
    x0, y0, x1, y1 = solid.getbbox()
    # étendue horizontale des 50 dernières lignes : c'est la base de la machine
    base = solid.crop((0, y1 - 50, im.width, y1)).getbbox()
    bx0, bx1 = base[0], base[2]
    w = (bx1 - bx0) * 1.0
    cx = (bx0 + bx1) / 2
    h = w * 0.085
    soft = Image.new('RGBA', im.size, (0, 0, 0, 0))
    ImageDraw.Draw(soft).ellipse((cx - w * 0.54, y1 - h * 1.1, cx + w * 0.54, y1 + h * 0.6), fill=(11, 42, 27, 115))
    soft = soft.filter(ImageFilter.GaussianBlur(h * 0.38))
    tight = Image.new('RGBA', im.size, (0, 0, 0, 0))
    ImageDraw.Draw(tight).ellipse((cx - w * 0.42, y1 - h * 0.55, cx + w * 0.42, y1 + h * 0.14), fill=(11, 42, 27, 150))
    tight = tight.filter(ImageFilter.GaussianBlur(h * 0.12))
    return Image.alpha_composite(Image.alpha_composite(soft, tight), im)


for view, name in VIEWS.items():
    path = SRC / f'still-{view}.png'
    if not path.exists():
        print('absent :', path)
        continue
    im = with_shadow(Image.open(path).convert('RGBA'))
    for size in (1000, 800, 480):
        (im if size == 1000 else im.resize((size, size), Image.LANCZOS)).save(OUT / f'{name}-{size}.webp', quality=84, method=6)
    print(name, 'ok', [round((OUT / f'{name}-{s}.webp').stat().st_size / 1024, 1) for s in (1000, 800, 480)], 'Ko')
