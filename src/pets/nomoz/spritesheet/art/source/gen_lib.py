"""Shared helpers for generate_production.py: approved head sprites and frame composition."""
import sys
from pathlib import Path
import numpy as np
from PIL import Image
sys.path.insert(0, str(Path(__file__).resolve().parent))
from render_cat import *
from cat_model import *

W, H = 96, 64


class Fr(np.ndarray):
    """a frame (H, W, 4 uint8) that remembers which of its pixels are the tail (see tails.json)"""
    tail = None
    tailpts = None

    def __array_finalize__(self, obj):
        self.tail = getattr(obj, 'tail', None)
        self.tailpts = getattr(obj, 'tailpts', None)


def as_fr(a, tail=None, tailpts=None):
    f = np.asarray(a).view(Fr)
    f.tail, f.tailpts = tail, tailpts
    return f


def load(name, n=0):
    return np.array(Image.open(f'{ART}/{name}/{n}.png').convert('RGBA'))


def crop(a, x0, y0, x1, y1):
    return a[y0:y1, x0:x1].copy()


def paste(dst, part, x, y, fade_rows=0, fade_side=None, seed=5):
    """paste an approved head sprite on a frame. fade_rows: the bottom rows are thinned out stochastically
    so the head melts into the rendered body (never adds pixels that were not in the sprite)."""
    rng = np.random.default_rng(seed)
    h, w = part.shape[:2]
    for yy in range(h):
        for xx in range(w):
            if part[yy, xx, 3] == 0: continue
            Y, X = y + yy, x + xx
            if not (0 <= Y < H and 0 <= X < W): continue
            keep = 1.0
            if fade_rows and yy >= h - fade_rows:
                keep = 1.0 - (yy - (h - fade_rows) + 1) / (fade_rows + 1)
            if fade_side == 'right' and xx >= w - 3:
                keep = min(keep, 1.0 - (xx - (w - 3) + 1) / 4)
            if rng.random() <= keep: dst[Y, X] = part[yy, xx]
    return dst


def under(body, head_layer):
    out = body.copy()
    m = head_layer[..., 3] > 0
    out[m] = head_layer[m]
    return out
