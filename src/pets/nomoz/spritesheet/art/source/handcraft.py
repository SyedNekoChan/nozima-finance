"""
Hand-finishing pass for the generated frames (run on a rendered frame before it is written):

  - fur strokes: short runs of lit pixels along the form, each with a dark line beside it, so the fur reads as
    deliberate clusters instead of a smooth gradient;
  - paws: toes with dark gaps between them and a lit top, on the paw positions the renderer recorded;
  - outline: the shadow side (below and right) of the silhouette is the darkest tone, the lit side one step lighter.

Everything is whole palette tones and opaque pixels. The approved head pixels (frame.headmask) are never touched.
Not hand-drawn: this is code, like the rest of the generator.
"""
import numpy as np

FUR = np.array([(3, 3, 5), (9, 8, 11), (14, 13, 16), (16, 15, 19), (18, 18, 22), (21, 21, 25), (24, 23, 27), (24, 24, 28), (27, 27, 30), (37, 36, 39)], int)
H, W = 64, 96


def tones(a):
    d = np.abs(a[..., None, :3].astype(int) - FUR[None, None]).sum(-1)
    return d.argmin(-1), d.min(-1) < 12


def _edge(m):
    p = np.pad(m, 1)
    return m & ~(p[:-2, 1:-1] & p[2:, 1:-1] & p[1:-1, :-2] & p[1:-1, 2:])


def strokes(idx, m, protect, rng, density=0.035):
    inner = m & ~_edge(m) & ~protect
    p = np.pad(np.where(m, idx, 0).astype(float), 2, mode='edge')
    blur = sum(p[2 + dy:H + 2 + dy, 2 + dx:W + 2 + dx] for dy in (-1, 0, 1) for dx in (-1, 0, 1)) / 9.0
    q = np.pad(blur, 1, mode='edge')
    gx = (q[1:-1, 2:] - q[1:-1, :-2]) / 2
    gy = (q[2:, 1:-1] - q[:-2, 1:-1]) / 2
    out = idx.copy()
    touched = np.zeros((H, W), bool)
    order = rng.permutation(H * W)
    for k in order:
        y, x = divmod(int(k), W)
        if not inner[y, x] or touched[y, x] or rng.random() > density: continue
        if not 3 <= idx[y, x] <= 8: continue
        gnorm = (gx[y, x] ** 2 + gy[y, x] ** 2) ** 0.5
        dx, dy = (-gy[y, x] / gnorm, gx[y, x] / gnorm) if gnorm > 0.25 else (0.0, 1.0)
        if dy < 0 or (dy == 0 and dx < 0): dx, dy = -dx, -dy   # strokes run downward
        L = 3 + int(rng.random() < 0.5)
        pts = [(int(round(x + dx * i)), int(round(y + dy * i))) for i in range(L)]
        if not all(0 <= px < W and 0 <= py < H and inner[py, px] and not touched[py, px] for px, py in pts): continue
        # the gap line sits to the shadow side (lower right) of the stroke
        nx, ny = (1, 0) if abs(dx) < abs(dy) else (0, 1)
        gap = [(px + nx, py + ny) for px, py in pts[1:]]
        if not all(0 <= px < W and 0 <= py < H and inner[py, px] and not touched[py, px] for px, py in gap): continue
        for i, (px, py) in enumerate(pts):
            out[py, px] = min(9, idx[py, px] + (2 if 0 < i < L - 1 else 1))
            touched[py, px] = True
        for px, py in gap:
            out[py, px] = max(1, idx[py, px] - 2)
            touched[py, px] = True
    return out


def paws(idx, m, protect, plist):
    """toes: three lit tips with dark gaps between them, drawn in the paw's own frame (u along the toes, v across)"""
    if not plist: return idx, m
    idx, m = idx.copy(), m.copy()
    for (px, py, ax, ay, toward) in plist:
        if toward < -0.35: continue            # the toes face away from the viewer: nothing to show
        n = (ax * ax + ay * ay) ** 0.5
        if n < 0.35: ax, ay = 0.0, 1.0         # facing us: the toes point down the screen
        else: ax, ay = ax / n, ay / n
        base = idx[int(np.clip(round(py), 0, H - 1)), int(np.clip(round(px), 0, W - 1))]
        base = int(np.clip(base, 3, 6))
        for y in range(int(py) - 7, int(py) + 8):
            for x in range(int(px) - 7, int(px) + 8):
                if not (0 <= x < W and 0 <= y < H) or protect[y, x]: continue
                dx, dy = x - px, y - py
                u = dx * ax + dy * ay
                v = -dx * ay + dy * ax
                if not (-1.5 <= u <= 5.4 and abs(v) <= 3.4 - 0.18 * max(0.0, u)): continue
                toe = min((-1.9, 0.0, 1.9), key=lambda t: abs(v - t))
                tipd = abs(v - toe)
                if u > 3.0 and tipd > 0.95: continue          # a gap between two toes: stays empty / dark
                if u > 4.2 and tipd > 0.55 + 0.35 * (5.4 - u): continue   # rounded toe ends
                if not m[y, x]:
                    m[y, x] = True; idx[y, x] = base
                if u > 2.6 and tipd <= 0.95:
                    idx[y, x] = min(9, base + (2 if u < 4.3 and v - toe < 0.3 else 1))   # lit top of each toe
        # dark gaps between the toes, inside the paw
        for gv in (-0.95, 0.95):
            for u in (2.4, 3.2, 4.0):
                x, y = int(round(px + ax * u - ay * gv)), int(round(py + ay * u + ax * gv))
                if 0 <= x < W and 0 <= y < H and m[y, x] and not protect[y, x]: idx[y, x] = 1
    return idx, m


def outline(idx, m, protect, rng):
    """the silhouette ring: the darkest tone on the shadow side (below / right of it), one lighter on the lit side"""
    out = idx.copy()
    p = np.pad(m, 1)
    em = ~p
    below = em[2:, 1:-1]; right = em[1:-1, 2:]; above = em[:-2, 1:-1]; left = em[1:-1, :-2]
    ring = m & (below | right | above | left) & ~protect
    shadow = ring & (below | right)
    out[ring] = 1
    out[shadow & (rng.random((H, W)) < 0.8)] = 0
    return out


def handcraft(f, seed=1):
    a = np.array(f, np.uint8)
    m = a[..., 3] > 0
    idx, fur = tones(a)
    keep = ~fur & m                              # not a fur tone (an eye yellow): left alone
    head = getattr(f, 'headmask', None)
    protect = (head if head is not None else np.zeros((H, W), bool)) | keep
    rng = np.random.default_rng(seed)
    idx = strokes(idx, m, protect, rng)
    idx, m = paws(idx, m, protect, getattr(f, 'paws', None))
    idx = np.where(protect, 0, idx)
    out = a.copy()
    free = m & ~protect
    # the ring is redone after the paws grew the silhouette
    ring_idx = outline(np.where(free, idx, 0), m, protect, rng)
    idx = np.where(free, ring_idx, idx)
    out[free, :3] = FUR[idx[free]].astype(np.uint8)
    out[free, 3] = 255
    return out
