#!/bin/sh
# Reconstruit les films explicatifs v3 (1080p, 30 i/s) : rendu des images, puis encodage avec la voix existante.
# Prérequis : Node + Playwright (Chromium) et ffmpeg. Aucun service payant.
set -e
cd "$(dirname "$0")/.."
for L in fr en; do
  rm -rf "/tmp/film-$L"
  node tools/render_film_v3.cjs --lang "$L" --out "/tmp/film-$L" --workers 4
  SRC=assets/econova-film-v2-en.mp4; [ "$L" = fr ] && SRC=assets/econova-film-v2.mp4   # pistes audio (voix + musique) du film v2
  ffmpeg -y -framerate 30 -i "/tmp/film-$L/%05d.jpg" -i "$SRC" -map 0:v -map 1:a \
    -c:v libx264 -preset slow -tune animation -crf 29 -g 60 -pix_fmt yuv420p -profile:v high \
    -c:a copy -movflags +faststart -t 92 "assets/econova-film-v3-$L.mp4"
done
