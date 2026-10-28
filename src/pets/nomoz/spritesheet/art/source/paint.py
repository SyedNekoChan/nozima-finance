"""
Fur painting helpers for build_missing.py. Everything is drawn pixel by pixel
in the ten near-black fur tones of the approved frames (index 0 darkest, 9
the lit highlight), with fur-like vertical strokes, so new limbs match the
approved ones in palette and pixel density.
"""
import numpy as np
from kit import *

RAMP = [tuple(int(v) for v in c) for c in sorted(FUR.tolist(), key=sum)]  # 10 tones, dark -> light


def rgba(i):
    r, g, b = RAMP[max(0, min(len(RAMP) - 1, i))]
    return (r, g, b, 255)


DIM = 0  # tone offset for limbs farther from the viewer


def put(a, x, y, i):
    if 0 <= x < W and 0 <= y < H:
        a[y, x] = rgba(i - DIM)


class Rng:
    """small deterministic generator, so rebuilding gives the same pixels"""
    def __init__(self, seed):
        self.s = seed & 0xFFFFFFFF

    def next(self):
        self.s = (self.s * 1664525 + 1013904223) & 0xFFFFFFFF
        return self.s / 4294967296.0


def fur_column_noise(rng, w, h):
    """per-column vertical stroke noise in {-1,0,+1}: runs of 3-7 rows"""
    n = np.zeros((h, w), int)
    for x in range(w):
        y = 0
        while y < h:
            run = 3 + int(rng.next() * 5)
            v = 0 if rng.next() < 0.55 else (1 if rng.next() < 0.5 else -1)
            n[y:y + run, x] = v
            y += run
    return n


def limb(a, cx, y0, y1, half_top, half_bottom, lean=0.0, seed=1, light=1, fluff=1.0):
    """a furry leg: centre column cx at the top, leaning `lean` px per row,
    half-width tapering from half_top to half_bottom, lit on the left. The
    edges jitter and bulge with fur tufts and the tones vary in strokes."""
    rng = Rng(seed)
    width = 2 * int(max(half_top, half_bottom)) + 8
    n = fur_column_noise(rng, width, y1 - y0 + 1)
    for y in range(y0, y1 + 1):
        t = (y - y0) / max(1, y1 - y0)
        half = half_top + (half_bottom - half_top) * t
        c = cx + lean * (y - y0)
        jl = int(rng.next() * 3 * fluff) - 1 if rng.next() < 0.45 else 0
        jr = int(rng.next() * 3 * fluff) - 1 if rng.next() < 0.45 else 0
        xl, xr = int(round(c - half)) - max(0, jl), int(round(c + half)) + max(0, jr)
        if rng.next() < 0.08 * fluff:      # a tuft on the outer side
            xl -= 1
        for x in range(xl, xr + 1):
            u = (x - xl) / max(1, xr - xl)
            base = 5 if u < 0.35 else 4 if u < 0.7 else 3
            if light and u < 0.22:
                base += 2
            tone = base + n[y - y0, (x - xl) % n.shape[1]] + (1 if rng.next() < 0.07 else 0) - (1 if rng.next() < 0.07 else 0)
            if x in (xl, xr):
                tone = 1 if u > 0.5 else 3
            if x == xl + 1 and u < 0.5 and rng.next() < 0.3:
                tone = 8
            put(a, x, y, tone)
    return a


def paw(a, cx, y_bottom, w=9, h=4, seed=2, lift=0):
    """a paw: a rounded pad wider than the leg, toe seams, lit top edge"""
    rng = Rng(seed)
    for r in range(h):
        y = y_bottom - h + 1 + r - lift
        half = (w / 2.0) * (0.78 if r == 0 else 1.0 if r < h - 1 else 0.8)
        xl, xr = int(round(cx - half)), int(round(cx + half - 1))
        for x in range(xl, xr + 1):
            u = (x - xl) / max(1, xr - xl)
            tone = 6 if r == 0 else 4 if u < 0.5 else 3
            if r == h - 1:
                tone = 1
            if r >= 1 and (x - xl) in (w // 3, 2 * w // 3):
                tone = 1                              # toe seams
            if x in (xl, xr):
                tone = 1
            put(a, x, y, tone)


def tuft(a, x, y, direction, length, tone=3):
    """a short fur wisp breaking the silhouette"""
    for i in range(length):
        put(a, x + direction * i, y - (i // 2), tone if i < length - 1 else 2)


def tone_index(rgb):
    return min(range(len(RAMP)), key=lambda i: sum((RAMP[i][k] - int(rgb[k])) ** 2 for k in range(3)))


def texture(a, box, seed, amount=0.6):
    """give a smooth area fur strokes: interior pixels move 1-2 tones in
    vertical runs (the approved fur is stroked, the rear views were smooth)"""
    x0, y0, x1, y1 = box
    rng = Rng(seed)
    n = fur_column_noise(rng, x1 - x0, y1 - y0)
    src = a.copy()
    for y in range(max(1, y0), min(H - 1, y1)):
        for x in range(max(1, x0), min(W - 1, x1)):
            if src[y, x, 3] == 0:
                continue
            if any(src[y + dy, x + dx, 3] == 0 for dy in (-1, 0, 1) for dx in (-1, 0, 1)):
                continue
            if rng.next() > amount:
                continue
            i = tone_index(src[y, x, :3])
            d = n[y - y0, x - x0] * (2 if rng.next() < 0.3 else 1)
            if i <= 1:
                continue
            a[y, x] = rgba(max(2, min(8, i + d)))
    return a
