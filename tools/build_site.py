#!/usr/bin/env python3
"""Assemble le CSS du site et versionne les fichiers locaux (Python standard, aucune dépendance).

Les feuilles de style sources restent séparées et éditables :
    styles.css, product.css, experience-navigation.css, experience-shop.css, premium.css
Ce script les concatène dans l'ordre, les minifie dans `site.min.css` (une seule requête bloquante)
et met à jour l'étiquette de version `?v=` de `site.min.css` et des scripts locaux dans `index.html`.
À relancer après chaque modification d'un CSS ou d'un JS :

    python3 tools/build_site.py
"""
import hashlib
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
SOURCES = ["styles.css", "product.css", "experience-navigation.css", "experience-shop.css", "premium.css"]
OUTPUT = ROOT / "site.min.css"


def minify(css: str) -> str:
    strings = []

    def keep(match):
        strings.append(match.group(0))
        return f"\x00{len(strings) - 1}\x00"

    css = re.sub(r"/\*.*?\*/", "", css, flags=re.S)
    css = re.sub(r"url\([^)]*\)|\"(?:\\.|[^\"\\])*\"|'(?:\\.|[^'\\])*'", keep, css)
    css = re.sub(r"\s+", " ", css)
    css = re.sub(r"\s*([{};,>])\s*", r"\1", css)
    css = re.sub(r";}", "}", css)
    css = css.strip()
    return re.sub(r"\x00(\d+)\x00", lambda m: strings[int(m.group(1))], css)


def digest(path: pathlib.Path) -> str:
    return hashlib.sha1(path.read_bytes()).hexdigest()[:8]


def main() -> int:
    bundle = "\n".join(minify((ROOT / name).read_text(encoding="utf-8")) for name in SOURCES)
    OUTPUT.write_text(bundle + "\n", encoding="utf-8")
    html_path = ROOT / "index.html"
    html = html_path.read_text(encoding="utf-8")

    def stamp(match):
        name = match.group("name")
        return f'{match.group("attr")}="./{name}?v={digest(ROOT / name)}"'

    html = re.sub(r'(?P<attr>href|src)="\./(?P<name>site\.min\.css|(?:script|product|premium|experience-[a-z]+)\.js)(?:\?v=[^"]*)?"', stamp, html)
    html_path.write_text(html, encoding="utf-8")
    before = sum((ROOT / n).stat().st_size for n in SOURCES)
    print(f"site.min.css : {OUTPUT.stat().st_size / 1024:.1f} Ko (sources : {before / 1024:.1f} Ko)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
