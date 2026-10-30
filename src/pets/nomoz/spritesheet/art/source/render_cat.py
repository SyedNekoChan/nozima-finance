"""
Procedural 3D-shaded renderer for the Nomoz production sprites.

  python3 art/source/render_cat.py            (Pillow + numpy)

The cat is a small articulated model made of ellipsoids (torso, haunches,
limbs with two-bone IK, plume tail). It is rendered orthographically from the
requested azimuth (front, three-quarter, side, rear...), shaded with a light
from the upper left plus a rim light, given a fur texture from 3-D noise, and
quantised to the ten fur tones of the approved frames with an ordered dither,
a dark contour and a lit upper-left edge. Heads are the approved heads (re-
used as sprites at their original size) except for the rear three-quarter
view, which is rendered. This is generated art, not hand-drawn and not made in
SpriteForge. The approved folders are never written.
"""
import math
import numpy as np
from PIL import Image
from pathlib import Path

HERE = Path(__file__).resolve().parent
ART = HERE.parent
W, H = 96, 64
SS = 4  # supersampling

# the ten fur tones of the approved frames, dark to light
FUR = [(3, 3, 5), (9, 8, 11), (14, 13, 16), (16, 15, 19), (18, 18, 22), (21, 21, 25), (24, 23, 27), (24, 24, 28), (27, 27, 30), (37, 36, 39)]
FURA = np.array(FUR, 'uint8')


# ------------------------------------------------------------------ noise
def _hash3(ix, iy, iz, seed=0):
    h = (ix * 374761393 + iy * 668265263 + iz * 2147483647 + seed * 1274126177) & 0xFFFFFFFF
    h = (h ^ (h >> 13)) * 1274126177 & 0xFFFFFFFF
    h = h ^ (h >> 16)
    return (h & 0xFFFF) / 65535.0


def noise3(x, y, z, seed=0):
    x0, y0, z0 = np.floor(x).astype(np.int64), np.floor(y).astype(np.int64), np.floor(z).astype(np.int64)
    fx, fy, fz = x - x0, y - y0, z - z0
    sx, sy, sz = fx * fx * (3 - 2 * fx), fy * fy * (3 - 2 * fy), fz * fz * (3 - 2 * fz)
    def c(dx, dy, dz): return _hash3(x0 + dx, y0 + dy, z0 + dz, seed)
    x00 = c(0, 0, 0) * (1 - sx) + c(1, 0, 0) * sx
    x10 = c(0, 1, 0) * (1 - sx) + c(1, 1, 0) * sx
    x01 = c(0, 0, 1) * (1 - sx) + c(1, 0, 1) * sx
    x11 = c(0, 1, 1) * (1 - sx) + c(1, 1, 1) * sx
    return (x00 * (1 - sy) + x10 * sy) * (1 - sz) + (x01 * (1 - sy) + x11 * sy) * sz


BAYER = np.array([[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]]) / 16.0 - 0.5


# ------------------------------------------------------------------ model
class Prim:
    __slots__ = ('c', 'r', 'part', 'fluff', 'dark', 'flow', 'paw')

    def __init__(self, c, r, part='body', fluff=0.0, dark=0.0, flow=(0, 0, 1)):
        self.c = np.array(c, float); self.r = np.array(r, float); self.part = part; self.fluff = fluff; self.dark = dark; self.paw = False
        f = np.array(flow, float); self.flow = f / (np.linalg.norm(f) + 1e-9)


def chain(p0, p1, r0, r1, n=None, part='body', fluff=0.0, squash=1.0):
    flow = np.array(p1, float) - np.array(p0, float)
    """tapered limb segment as a row of ellipsoids"""
    p0, p1 = np.array(p0, float), np.array(p1, float)
    L = np.linalg.norm(p1 - p0)
    n = n or max(2, int(L / 1.2))
    out = []
    for i in range(n + 1):
        t = i / n
        r = r0 + (r1 - r0) * t
        out.append(Prim(p0 + (p1 - p0) * t, (r * squash, r, r), part, fluff, flow=flow))
    return out


def ik2(hip, foot, a, b, bend):
    """two-bone IK in the (y, z) plane at constant x. bend=+1: the middle joint
    goes toward +z (knee forward), -1: toward -z (elbow back)."""
    hip, foot = np.array(hip, float), np.array(foot, float)
    d = foot - hip
    L = np.linalg.norm(d)
    L = min(L, a + b - 1e-3); L = max(L, abs(a - b) + 1e-3)
    d = d / max(np.linalg.norm(d), 1e-6) * L
    foot = hip + d
    cosA = (a * a + L * L - b * b) / (2 * a * L)
    ang = math.acos(max(-1, min(1, cosA)))
    base = math.atan2(d[1], d[2])  # angle of hip->foot in (z, y)
    th = base + bend * ang
    knee = hip + np.array([0, a * math.sin(th), a * math.cos(th)])
    return hip, knee, foot


def rot_y(theta):
    c, s = math.cos(theta), math.sin(theta)
    return np.array([[c, 0, s], [0, 1, 0], [-s, 0, c]])


class Render:
    def __init__(self, azimuth_deg, cx, seed=1, tilt_deg=0.0, pitch_deg=0.0, pivot=(0.0, 24.0, 0.0)):
        t = math.radians(tilt_deg)  # camera looks slightly down: nearer things sit lower on screen
        Rx = np.array([[1, 0, 0], [0, math.cos(t), -math.sin(t)], [0, math.sin(t), math.cos(t)]])
        self.M = Rx @ rot_y(math.radians(azimuth_deg))  # world -> view
        self.cx = cx
        self.prims = []
        self.seed = seed
        # the whole cat pitched about its lateral axis through `pivot` (positive: nose up), for leaps
        a = math.radians(pitch_deg)
        self.pitch = a
        self.pivot = np.array(pivot, float)

    def _pitched(self, c):
        if not self.pitch: return c
        o = c - self.pivot
        ca, sa = math.cos(self.pitch), math.sin(self.pitch)
        return self.pivot + np.array([o[0], o[1] * ca + o[2] * sa, -o[1] * sa + o[2] * ca])

    def add(self, p):
        items = p if isinstance(p, list) else [p]
        for q in items:
            if self.pitch:
                q.c = self._pitched(q.c)
                f = self._pitched(q.flow + self.pivot) - self.pivot
                q.flow = f / (np.linalg.norm(f) + 1e-9)
            self.prims.append(q)

    # ---- ray cast at SS x
    def cast(self):
        h, w = H * SS, W * SS
        ys, xs = np.mgrid[0:h, 0:w]
        xv = (xs + 0.5) / SS - self.cx
        yv = 62.0 - (ys + 0.5) / SS
        depth = np.full((h, w), -1e9)
        nrm = np.zeros((h, w, 3)); wpos = np.zeros((h, w, 3)); flow = np.zeros((h, w, 3)); flow[..., 2] = 1; part = np.full((h, w), -1, np.int16); fl = np.zeros((h, w)); dk = np.zeros((h, w))
        Mt = self.M.T
        dw = Mt @ np.array([0, 0, -1.0])
        parts = {}
        for pr in self.prims:
            if pr.part in ('FL', 'FR', 'HL', 'HR') and (self.M @ pr.c)[2] < -1.0 and pr.dark == 0: pr.dark = 0.13
            # screen bbox of the (conservative) sphere
            cv = self.M @ pr.c
            rm = pr.r.max() + 1
            x0 = int(max(0, math.floor((cv[0] - rm + self.cx) * SS))); x1 = int(min(w, math.ceil((cv[0] + rm + self.cx) * SS)))
            y0 = int(max(0, math.floor((62 - (cv[1] + rm)) * SS))); y1 = int(min(h, math.ceil((62 - (cv[1] - rm)) * SS)))
            if x0 >= x1 or y0 >= y1: continue
            sx, sy = xv[y0:y1, x0:x1], yv[y0:y1, x0:x1]
            ow = np.stack([sx, sy, np.full_like(sx, 500.0)], -1) @ self.M  # = Mt @ o for each row vector
            q = (ow - pr.c) / pr.r
            e = dw / pr.r
            a = float(e @ e)
            b = 2 * (q @ e)
            cc = (q * q).sum(-1) - 1
            disc = b * b - 4 * a * cc
            hit = disc >= 0
            t = (-b - np.sqrt(np.where(hit, disc, 0))) / (2 * a)
            z = 500.0 - t
            upd = hit & (z > depth[y0:y1, x0:x1])
            if not upd.any(): continue
            pw = ow + t[..., None] * dw
            nw = (pw - pr.c) / (pr.r ** 2)
            nw /= np.linalg.norm(nw, axis=-1, keepdims=True) + 1e-9
            nv = nw @ self.M.T
            sl = (slice(y0, y1), slice(x0, x1))
            depth[sl] = np.where(upd, z, depth[sl])
            nrm[sl] = np.where(upd[..., None], nv, nrm[sl])
            wpos[sl] = np.where(upd[..., None], pw, wpos[sl])
            flow[sl] = np.where(upd[..., None], pr.flow, flow[sl])
            pid = parts.setdefault(pr.part, len(parts))
            part[sl] = np.where(upd, pid, part[sl])
            fl[sl] = np.where(upd, pr.fluff, fl[sl])
            dk[sl] = np.where(upd, pr.dark, dk[sl])
        self.depth, self.nrm, self.wpos, self.part, self.fl, self.dk, self.partnames, self.flow = depth, nrm, wpos, part, fl, dk, parts, flow

    def smooth_normals(self, covered, mix):
        sig = SS * 1.1
        k = np.arange(-int(3 * sig), int(3 * sig) + 1)
        g = np.exp(-(k ** 2) / (2 * sig * sig)); g /= g.sum()
        def blur(a):
            a = np.apply_along_axis(lambda v: np.convolve(v, g, 'same'), 0, a)
            return np.apply_along_axis(lambda v: np.convolve(v, g, 'same'), 1, a)
        w = covered.astype(float)
        d = np.where(covered, self.depth, 0.0)
        ds = blur(d) / np.maximum(blur(w), 1e-3)
        gy, gx = np.gradient(ds)
        gx, gy = gx * SS, gy * SS
        n = np.stack([-gx, gy, np.ones_like(gx)], -1)
        n /= np.linalg.norm(n, axis=-1, keepdims=True)
        out = self.nrm * mix + n * (1 - mix)
        out /= np.linalg.norm(out, axis=-1, keepdims=True) + 1e-9
        return out

    # ---- shade + quantise
    def shade(self, light=(-0.55, 0.65, 0.55), ambient=0.30, gain=0.62, contrast=1.0, bias=0.0, mix=0.3):
        depth, nrm = self.depth, self.nrm
        covered = depth > -1e8
        nrm = self.smooth_normals(covered, mix)
        L = np.array(light, float); L /= np.linalg.norm(L)
        lam = np.clip((nrm * L).sum(-1), 0, 1)
        rimdir = np.array([-0.85, 0.5, 0.0]); rimdir /= np.linalg.norm(rimdir)
        rim = np.clip((nrm * rimdir).sum(-1), 0, 1) ** 3 * (1 - np.clip(nrm[..., 2], 0, 1)) ** 1.2
        under = np.clip(-nrm[..., 1], 0, 1)
        wp = self.wpos
        # fur: strokes aligned with each part's flow direction (noise stretched along the flow)
        fw = self.flow
        up = np.array([0.0, 1.0, 0.0]); alt = np.array([1.0, 0.0, 0.0])
        ref = np.where((np.abs(fw[..., 1]) > 0.9)[..., None], alt, up)
        e1 = np.cross(fw, ref); e1 /= np.linalg.norm(e1, axis=-1, keepdims=True) + 1e-9
        e2 = np.cross(fw, e1)
        a1, a2, a3 = (wp * e1).sum(-1), (wp * e2).sum(-1), (wp * fw).sum(-1)
        f1 = noise3(a1 * 0.55, a2 * 0.55, a3 * 0.13, self.seed)
        f2 = noise3(a1 * 1.3, a2 * 1.3, a3 * 0.35, self.seed + 7)
        fur = (f1 - 0.5) * 0.20 + (f2 - 0.5) * 0.09
        # fur locks: the level set of a slower noise stretched along the flow draws thin strokes that follow the fur
        lock = noise3(a1 * 0.24, a2 * 0.24, a3 * 0.07, self.seed + 91)
        s = ambient + gain * lam + 0.30 * rim - 0.20 * under + fur - self.dk + bias
        s = (s - 0.5) * contrast + 0.5
        s = np.where(covered, s, 0)
        # downsample
        def box(a): return a.reshape(H, SS, W, SS, *a.shape[2:]).mean(axis=(1, 3))
        cov = box(covered.astype(float))
        sh = box(s * covered) / np.maximum(cov, 1e-6)
        self.cov = cov
        self.lock1 = box(lock * covered) / np.maximum(cov, 1e-6)
        self.mask = cov >= 0.5
        self.sh = sh
        # depth map at 1x for contour decisions (max over cell = nearest)
        d = np.where(covered, depth, -1e9).reshape(H, SS, W, SS).max(axis=(1, 3))
        self.d1 = d
        grp = {'body': 'torso', 'belly': 'torso', 'ruff': 'torso', 'neck': 'torso'}
        names = {v: k for k, v in parts.items()} if False else {v: k for k, v in self.partnames.items()}
        gid = {}
        lut = np.full(max(self.partnames.values(), default=0) + 2, -1)
        for k, v in self.partnames.items(): lut[v] = gid.setdefault(grp.get(k, k), len(gid))
        pid = self.part[SS // 2::SS, SS // 2::SS]
        self.id1 = np.where(pid >= 0, lut[np.clip(pid, 0, None)], -1)
        self.fluff1 = box(self.fl)
        return self

    def to_frame(self, dither=0.35, seed=3, levels=9, smooth=0, locks=0.0, limbs=0, match=None):
        rng = np.random.default_rng(seed)
        mask = self.mask.copy()
        yy, xx = np.mgrid[0:H, 0:W]
        bay = BAYER[yy % 4, xx % 4]
        sh = self.sh.copy()
        # fur-stroke highlights: thresholded anisotropic noise on the lit side
        wp = self.wpos.reshape(H, SS, W, SS, 3).mean(axis=(1, 3))
        stroke = noise3(wp[..., 0] * 0.9 + wp[..., 1] * 0.25, wp[..., 1] * 0.5, wp[..., 2] * 0.22 + wp[..., 1] * 0.2, self.seed + 31)
        hair = noise3(wp[..., 0] * 1.9 + wp[..., 1] * 0.3, wp[..., 1] * 1.1, wp[..., 2] * 0.12, self.seed + 57)
        sh = sh + np.where((stroke > 0.70) & (sh > 0.30), 0.20, 0.0)  - np.where(stroke < 0.24, 0.09, 0.0)
        t = np.clip(sh, 0, 1) * levels + bay * dither * 2.0
        idx = np.clip(np.round(t), 1, 9).astype(int)
        if match is not None:
            # give the body the tone distribution of the approved frames: the covered pixels keep their order of brightness
            # (so the shading is the same) but are re-dealt over the ten fur tones in the approved proportions, so every
            # generated frame has the same overall darkness, shadow depth and flat mid-tone areas as the originals
            m = self.mask
            vals = (sh + bay * dither * 0.12)[m]
            order = np.argsort(vals, kind='stable')
            ranks = np.empty(len(vals)); ranks[order] = (np.arange(len(vals)) + 0.5) / len(vals)
            cdf = np.cumsum(np.asarray(match, float)); cdf /= cdf[-1]
            dealt = np.searchsorted(cdf, ranks, side='right').clip(0, 9)
            idx = np.where(m, 0, idx)
            idx[m] = dealt
        if smooth:
            # merge speckle into clusters: each pixel takes the commonest tone among its same-part neighbours
            ids = self.id1
            for _ in range(smooth):
                pad = np.pad(idx, 1, mode='edge'); padid = np.pad(ids, 1, constant_values=-2); padm = np.pad(self.mask, 1)
                votes = np.zeros((10, H, W))
                for dy in (-1, 0, 1):
                    for dx in (-1, 0, 1):
                        nb = pad[1 + dy:H + 1 + dy, 1 + dx:W + 1 + dx]
                        same = (padid[1 + dy:H + 1 + dy, 1 + dx:W + 1 + dx] == ids) & padm[1 + dy:H + 1 + dy, 1 + dx:W + 1 + dx]
                        for tone in range(10): votes[tone] += same & (nb == tone)
                top = votes.max(0)
                cur = np.take_along_axis(votes, idx[None], 0)[0]
                idx = np.where(cur >= top - 1, idx, votes.argmax(0))
        if locks:
            # a dark stroke along a fur lock, a lit pixel beside it on the lit side
            ridge = self.mask & (np.abs(self.lock1 - 0.5) < locks) & (self.sh > 0.25)
            lit = np.roll(np.roll(ridge, 1, 0), 1, 1) & self.mask & ~ridge
            idx = np.where(ridge, np.maximum(1, idx - 2), idx)
            idx = np.where(lit, np.minimum(9, idx + 1), idx)
        # fluffy silhouette: random 1px tufts on the soft parts
        nb = np.zeros_like(mask)
        for dy, dx in ((-1, 0), (1, 0), (0, -1), (0, 1)):
            nb |= np.roll(np.roll(mask, dy, 0), dx, 1)
        fl = self.fluff1
        flnb = np.zeros_like(fl)
        for dy, dx in ((-1, 0), (1, 0), (0, -1), (0, 1)):
            flnb = np.maximum(flnb, np.roll(np.roll(fl, dy, 0), dx, 1))
        rnd = rng.random((H, W))
        add = (~mask) & nb & (rnd < flnb * 0.65)
        idxg = idx.copy()
        for y in range(H):
            for x in range(W):
                if add[y, x]:
                    for dy, dx in ((0, -1), (-1, 0), (0, 1), (1, 0)):
                        y2, x2 = y + dy, x + dx
                        if 0 <= y2 < H and 0 <= x2 < W and mask[y2, x2]:
                            idxg[y, x] = idx[y2, x2]; break
        # a second, rarer ring makes 2 px tufts on the fluffiest parts (chest, belly, tail)
        mask1 = mask | add
        nb2 = np.zeros_like(mask)
        for dy, dx in ((-1, 0), (1, 0), (0, -1), (0, 1)):
            nb2 |= np.roll(np.roll(mask1, dy, 0), dx, 1)
        add2 = (~mask1) & nb2 & (rng.random((H, W)) < np.clip(flnb - 0.55, 0, 1) * 0.5) & (rng.random((H, W)) < 0.5)
        for y in range(H):
            for x in range(W):
                if add2[y, x]:
                    for dy, dx in ((0, -1), (-1, 0), (0, 1), (1, 0)):
                        y2, x2 = y + dy, x + dx
                        if 0 <= y2 < H and 0 <= x2 < W and mask1[y2, x2]:
                            idxg[y, x] = idxg[y2, x2]; break
        add = add | add2
        # fur notches: the odd edge pixel of the fluffy parts is missing
        edge_in = mask & ~(np.roll(mask, 1, 0) & np.roll(mask, -1, 0) & np.roll(mask, 1, 1) & np.roll(mask, -1, 1))
        notch = edge_in & (fl > 0.5) & (rng.random((H, W)) < 0.10)
        mask = mask & ~notch
        m2 = mask | add
        empty = ~m2
        def roll(a, dy, dx): return np.roll(np.roll(a, dy, 0), dx, 1)
        # dark contour all round (a covered pixel with an empty 4-neighbour)
        outline = m2 & (roll(empty, 1, 0) | roll(empty, -1, 0) | roll(empty, 0, 1) | roll(empty, 0, -1))
        # where a nearer surface overlaps a farther one, the farther pixel gets the contour
        d = self.d1
        ov = np.zeros((H, W), bool)
        for dy, dx in ((0, 1), (1, 0), (0, -1), (-1, 0)):
            nbd = roll(d, dy, dx)
            ov |= self.mask & (nbd > d + 2.0) & (nbd > -1e8)
        # limbs and body are separate shapes: a dark line on the farther pixel of every boundary between different parts
        ids = self.id1
        pb = np.zeros((H, W), bool)
        for dy, dx in ((0, 1), (1, 0)):
            nid = roll(ids, -dy, -dx)
            nd = roll(d, -dy, -dx)
            diff = (nid != ids) & (nid >= 0) & (ids >= 0) & self.mask & roll(self.mask, -dy, -dx) & (np.abs(nd - d) > 0.9)
            far_here = d <= nd
            pb |= diff & far_here
            pb |= roll(diff & ~far_here, dy, dx)
        ov = ov | pb
        self._pb = pb
        # rim: the pixel just inside a contour on the upper / left side, where the surface is lit
        rim = m2 & ~outline & (roll(outline, 1, 0) | roll(outline, 0, 1)) & (self.sh > 0.30)
        idxg = np.where(rim, np.minimum(9, idxg + 2), idxg)
        idxg = np.where(ov, np.minimum(idxg, 3), idxg)
        if limbs:
            # limbs read as shapes of their own: a darker line where one part passes in front of another
            idxg = np.where(self._pb, np.minimum(idxg, limbs), idxg)
        idxg = np.where(outline, np.where(rng.random((H, W)) < 0.65, 1, 0), idxg)
        # remove lone outlier pixels (a tone far from every neighbour), which read as noise rather than fur
        for _ in range(1):
            pad = np.pad(idxg, 1, mode='edge'); pm = np.pad(m2, 1)
            nbs = np.stack([pad[1 + dy:H + 1 + dy, 1 + dx:W + 1 + dx] for dy in (-1, 0, 1) for dx in (-1, 0, 1) if dy or dx])
            nbm = np.stack([pm[1 + dy:H + 1 + dy, 1 + dx:W + 1 + dx] for dy in (-1, 0, 1) for dx in (-1, 0, 1) if dy or dx])
            cnt = nbm.sum(0)
            mean = (nbs * nbm).sum(0) / np.maximum(cnt, 1)
            near = ((np.abs(nbs - idxg) <= 1) & nbm).sum(0)
            lone = m2 & ~outline & (cnt >= 5) & ((near <= 1) & (np.abs(mean - idxg) >= 2))
            idxg = np.where(lone, np.round(mean).astype(int), idxg)
        out = np.zeros((H, W, 4), 'uint8')
        out[m2, :3] = FURA[idxg[m2]]
        out[m2, 3] = 255
        return out


def save(a, path): Image.fromarray(a, 'RGBA').save(path)


def preview(frames, path, Z=8, boost=3.4):
    from PIL import ImageDraw
    n = len(frames)
    im = Image.new('RGBA', (n * (W * Z // 2 + 6) + 6, H * Z // 2 + 12), (66, 70, 80, 255))
    d = ImageDraw.Draw(im)
    for i, a in enumerate(frames):
        for y in range(H):
            for x in range(W):
                if a[y, x, 3]:
                    c = a[y, x, :3].astype(float); k = boost if c.max() < 110 else 1
                    c = tuple(int(min(255, v * k)) for v in c)
                    X = 6 + i * (W * Z // 2 + 6) + x * Z // 2; Y = 6 + y * Z // 2
                    d.rectangle([X, Y, X + Z // 2 - 1, Y + Z // 2 - 1], fill=c)
    im.save(path)
