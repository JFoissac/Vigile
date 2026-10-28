#!/usr/bin/env python3
"""Métriques de capture pour la revue visuelle de Vigile v2.

Reprend les indicateurs du scorecard three.js (entropie de couleur, part de la
couleur dominante, densité de contours, contraste de luminance) pour comparer
deux captures objectivement, sans jugement à l'œil.

Usage : python tools/shotmetrics.py shot1.png [shot2.png ...]
"""

import json
import math
import sys

from PIL import Image, ImageFilter, ImageStat


def metrics(path):
    img = Image.open(path).convert("RGB")
    w, h = img.size
    small = img.resize((320, 180), Image.BILINEAR)

    # entropie de couleur : histogramme 4 bits par canal (4096 cases)
    px = list(small.resize((160, 90), Image.BILINEAR).getdata())
    counts = {}
    for r, g, b in px:
        k = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4)
        counts[k] = counts.get(k, 0) + 1
    total = sum(counts.values()) or 1
    entropy = 0.0
    for c in counts.values():
        p = c / total
        entropy -= p * math.log2(p)

    # couleur dominante (part de l'image)
    dominant = max(counts.values()) / total

    # densité de contours : part de pixels dont le gradient dépasse un seuil
    grey = img.convert("L")
    edges = grey.filter(ImageFilter.FIND_EDGES)
    eh = edges.histogram()
    edge_density = sum(eh[24:]) / (w * h)

    lum = ImageStat.Stat(grey)
    contrast = lum.stddev[0]

    return {
        "file": path,
        "size": [w, h],
        "colorEntropyBits": round(entropy, 2),
        "dominantColorShare": round(dominant, 3),
        "edgeDensity": round(edge_density, 4),
        "luminance": {"mean": round(lum.mean[0], 1), "contrast": round(contrast, 1)},
    }


if __name__ == "__main__":
    for p in sys.argv[1:]:
        print(json.dumps(metrics(p), ensure_ascii=False))
