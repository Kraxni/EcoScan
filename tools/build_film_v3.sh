#!/bin/sh
# Reconstruit les films explicatifs v3 (1080p, 30 i/s) : rendu des images dans le navigateur, puis encodage
# avec la voix et la musique du film v2. Aucun service payant.
# Prérequis : Node + Playwright (Chromium) et ffmpeg.
#
# Les plans 3D de la station (tools/film_v3/plates/) et les objets (tools/film_v3/sprites/) sont déjà dans le dépôt.
# Pour les régénérer, il faut le module Python de Blender (pip install bpy) :
#   FILM_LAYOUT=v3 FILM_ENGINE=CYCLES FILM_SAMPLES=32 FILM_W=1920 FILM_H=1080 python tools/render_film_v2_scene.py
#   FILM_ENGINE=CYCLES python tools/render_film_v3_sprites.py
# puis copier les plans (WebP) et plates.json dans tools/film_v3/plates/.
set -e
cd "$(dirname "$0")/.."
for L in fr en; do
  rm -rf "/tmp/film-$L"
  node tools/render_film_v3.cjs --lang "$L" --out "/tmp/film-$L" --workers 4
  SRC=assets/econova-film-v2-en.mp4; [ "$L" = fr ] && SRC=assets/econova-film-v2.mp4   # pistes audio (voix + musique) du film v2
  ffmpeg -y -framerate 30 -i "/tmp/film-$L/%05d.jpg" -i "$SRC" -map 0:v -map 1:a \
    -c:v libx264 -preset slow -crf 27 -g 60 -pix_fmt yuv420p -profile:v high \
    -c:a copy -movflags +faststart -t 92 "assets/econova-film-v3-$L.mp4"
done
