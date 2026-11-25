# EcoScan

Before building or changing UI, read DESIGN.md.

## Contraintes

- **Tout reste gratuit : n'ajoute aucun service, outil ou ressource payant** (GitHub Pages, plan gratuit Higgsfield).
  Pourquoi : « je ne veux absolument rien payer ».
  <!-- 2026-11-25: « je ne veux aboslument rien payer » -->

## Avant de livrer un changement d'interface

Avec le serveur local actif (`python3 tools/serve_local.py --port 8000`) :

```sh
python3 tools/build_site.py   # après tout changement de CSS ou de JS
node tests/taste.cjs          # images non recadrées, fenêtre de révélation des titres
node tools/perf_floor.cjs     # plancher de performance (voir DESIGN.md)
```
