#!/usr/bin/env python3
"""Statistiques de luminance d'une capture — audit d'éclairage de Vigile v2.

Usage : python tools/imgstats.py shot1.png [shot2.png ...]
Sortie JSON : moyenne, écart-type, % de noirs bouchés (<6), % de blancs
brûlés (>250), et par bande verticale (haut/milieu/bas) pour repérer une scène
écrasée ou un ciel surexposé.
"""

import json
import sys

from PIL import Image, ImageStat


def stats(path):
    img = Image.open(path).convert("L")
    w, h = img.size
    stat = ImageStat.Stat(img)
    hist = img.histogram()
    total = w * h
    dark = sum(hist[:6]) / total * 100
    bright = sum(hist[251:]) / total * 100
    bands = {}
    for name, (y0, y1) in {"haut": (0, h // 3), "milieu": (h // 3, 2 * h // 3), "bas": (2 * h // 3, h)}.items():
        b = img.crop((0, y0, w, y1))
        bands[name] = round(ImageStat.Stat(b).mean[0], 1)
    return {
        "file": path,
        "size": [w, h],
        "mean": round(stat.mean[0], 1),
        "std": round(stat.stddev[0], 1),
        "dark_pct": round(dark, 1),
        "bright_pct": round(bright, 2),
        "bands": bands,
    }


if __name__ == "__main__":
    print(json.dumps([stats(p) for p in sys.argv[1:]], ensure_ascii=False))
