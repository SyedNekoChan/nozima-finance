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
    paws = None       # [(x, y, ax, ay, facing)] projected paw centres, toe axis and whether the toes face the viewer
    headmask = None   # the approved head pixels, which the handcraft pass never touches

    def __array_finalize__(self, obj):
        self.tail = getattr(obj, 'tail', None)
        self.tailpts = getattr(obj, 'tailpts', None)
        self.paws = getattr(obj, 'paws', None)
        self.headmask = getattr(obj, 'headmask', None)


def as_fr(a, tail=None, tailpts=None, paws=None, headmask=None):
    f = np.asarray(a).view(Fr)
    f.tail, f.tailpts, f.paws, f.headmask = tail, tailpts, paws, headmask
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


def approved_tone_target():
    """the proportions of the ten fur tones over the INTERIOR pixels (not the outline ring) of the approved frames"""
    fur = np.array(FUR)
    tot = np.zeros(10)
    for name in ('idle_front', 'walk_side', 'sit_threeq', 'sit_rear', 'sit_doze', 'sit_groom', 'stretch', 'curl'):
        for f in sorted((Path(ART) / name).glob('[0-9].png')):
            a = np.array(Image.open(f).convert('RGBA'))
            m = a[..., 3] > 0
            pad = np.pad(m, 1)
            inner = m.copy()
            for dy, dx in ((-1, 0), (1, 0), (0, -1), (0, 1)): inner &= pad[1 + dy:H + 1 + dy, 1 + dx:W + 1 + dx]
            rgb = a[..., :3][inner].astype(int)
            d = np.abs(rgb[:, None, :] - fur[None]).sum(-1)
            keep = d.min(1) < 12  # the eye yellows are not fur
            tot += np.bincount(d.argmin(1)[keep], minlength=10)
    return tot / tot.sum()
