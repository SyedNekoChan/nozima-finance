"""Small helpers for authoring the review sprites. Everything is drawn on a
1x RGBA canvas with whole-pixel operations only (no antialiasing, no blur)."""
import math
from PIL import Image

def hexc(h, a=255):
    h = h.lstrip('#')
    return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16), a)

class Canvas:
    def __init__(self, w, h):
        self.w, self.h = w, h
        self.im = Image.new('RGBA', (w, h), (0, 0, 0, 0))
        self.px = self.im.load()
        self.oy = 0   # temporary vertical offset for drawing a body part lower than authored
        self.ox = 0   # temporary horizontal offset (lets a sprite be authored with a margin)

    def put(self, x, y, c):
        x += self.ox
        y += self.oy
        if 0 <= x < self.w and 0 <= y < self.h:
            self.px[x, y] = c if isinstance(c, tuple) else hexc(c)

    def get(self, x, y):
        x += self.ox
        y += self.oy
        if 0 <= x < self.w and 0 <= y < self.h:
            return self.px[x, y]
        return (0, 0, 0, 0)

    def opaque(self, x, y):
        return self.get(x, y)[3] > 0

    def rect(self, x0, y0, x1, y1, c):
        for y in range(y0, y1 + 1):
            for x in range(x0, x1 + 1):
                self.put(x, y, c)

    def hline(self, x0, x1, y, c):
        for x in range(x0, x1 + 1):
            self.put(x, y, c)

    def vline(self, x, y0, y1, c):
        for y in range(y0, y1 + 1):
            self.put(x, y, c)

    def pts(self, c, *coords):
        for x, y in coords:
            self.put(x, y, c)

    def ellipse(self, cx, cy, rx, ry, ramp, light=(-0.55, -0.75), cuts=(0.78, 0.45, 0.12, -0.3), mask=None):
        """Fill an ellipse and shade it by a light direction. ramp is ordered
        light -> dark and `cuts` are the lum thresholds between ramp entries,
        so shading comes out as contiguous clusters rather than noise."""
        lx, ly = light
        lz = math.sqrt(max(0.0, 1 - lx * lx - ly * ly))
        for y in range(int(cy - ry) - 1, int(cy + ry) + 2):
            for x in range(int(cx - rx) - 1, int(cx + rx) + 2):
                nx = (x - cx) / rx
                ny = (y - cy) / ry
                d = nx * nx + ny * ny
                if d > 1.0:
                    continue
                if mask and not mask(x, y):
                    continue
                nz = math.sqrt(1 - d)
                lum = nx * lx + ny * ly + nz * lz
                idx = len(ramp) - 1
                for i, t in enumerate(cuts):
                    if lum >= t:
                        idx = i
                        break
                self.put(x, y, ramp[idx])

    def outline(self, color, keep=None, inner=False):
        """Selective outline: paint `color` on transparent pixels that touch an
        opaque pixel (4-neighbourhood). `keep(x,y)` can veto a pixel."""
        todo = []
        for y in range(-1, self.h + 1):
            for x in range(-1, self.w + 1):
                if self.opaque(x, y):
                    continue
                if any(self.opaque(x + dx, y + dy) for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))):
                    if keep is None or keep(x, y):
                        todo.append((x, y))
        for x, y in todo:
            self.put(x, y, color)

    def save(self, path, scale=1, bg=None):
        im = self.im
        if bg is not None:
            base = Image.new('RGBA', im.size, bg if isinstance(bg, tuple) else hexc(bg))
            base.alpha_composite(im)
            im = base
        if scale != 1:
            im = im.resize((im.width * scale, im.height * scale), Image.NEAREST)
        im.save(path)


# ---------------------------------------------------------------------------
# Locks: tapered, curved ribbons (hair locks, tails, fur tufts) whose shading
# follows the ribbon, giving directional light/shadow clusters.
# ---------------------------------------------------------------------------
def bez(p0, p1, p2, n=40):
    out = []
    for i in range(n + 1):
        t = i / n
        x = (1 - t) ** 2 * p0[0] + 2 * (1 - t) * t * p1[0] + t * t * p2[0]
        y = (1 - t) ** 2 * p0[1] + 2 * (1 - t) * t * p1[1] + t * t * p2[1]
        out.append((x, y, t))
    return out

def lock_pixels(spine, w0, w1, w_mid=None):
    """Return {(x,y): (lateral, t)} for a tapered ribbon. lateral in [-1,1]
    (negative = left of the travel direction), t along the spine 0..1."""
    samples = []
    for i, (x, y, t) in enumerate(spine):
        if i < len(spine) - 1:
            dx, dy = spine[i + 1][0] - x, spine[i + 1][1] - y
        else:
            dx, dy = x - spine[i - 1][0], y - spine[i - 1][1]
        L = math.hypot(dx, dy) or 1.0
        nx, ny = -dy / L, dx / L
        if w_mid is None:
            w = w0 + (w1 - w0) * t
        else:
            w = (w0 + (w_mid - w0) * (t / 0.5)) if t < 0.5 else (w_mid + (w1 - w_mid) * ((t - 0.5) / 0.5))
        samples.append((x, y, nx, ny, max(0.35, w) / 2.0, t))
    best = {}
    for (x, y, nx, ny, hw, t) in samples:
        for yy in range(int(y - hw) - 1, int(y + hw) + 2):
            for xx in range(int(x - hw) - 1, int(x + hw) + 2):
                px, py = xx + 0.5, yy + 0.5
                d = math.hypot(px - x, py - y)
                if d <= hw:
                    lat = ((px - x) * nx + (py - y) * ny) / hw
                    key = (xx, yy)
                    if key not in best or d / hw < best[key][2]:
                        best[key] = (lat, t, d / hw, nx, ny)
    return {k: (v[0], v[1], v[3], v[4]) for k, v in best.items()}

def paint_lock(cv, spine, w0, w1, ramp, light=(-0.6, -0.8), w_mid=None, edge=None, tip_dark=True, hi=0.35, sh=-0.35):
    """Paint a lock with lateral shading: the side facing `light` gets the
    highlight band, the far side the shadow band, tips go darker. `edge`
    (a colour) outlines the lock where it overlaps earlier art."""
    pix = lock_pixels(spine, w0, w1, w_mid)
    mask = set(pix)
    for (x, y), (lat, t, nx, ny) in pix.items():
        facing = lat * (nx * light[0] + ny * light[1]) / max(1e-6, math.hypot(nx, ny))
        # facing > 0: this side of the ribbon faces the light
        if facing > hi:
            idx = 0 if abs(lat) > 0.55 else 1
        elif facing > 0.0:
            idx = 1
        elif facing > sh:
            idx = 2
        else:
            idx = 3
        if tip_dark and t > 0.86:
            idx = min(len(ramp) - 1, idx + 1)
        cv.put(x, y, ramp[idx])
    if edge:
        for (x, y) in mask:
            if any((x + dx, y + dy) not in mask for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))):
                if cv.opaque(x, y):
                    pass
                cv.put(x, y, edge)
    return mask


# ---------------------------------------------------------------------------
# Hue-aware selective outline and dithering (added for the second round)
# ---------------------------------------------------------------------------
def _lum(c):
    return (0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]) / 255.0

def outline_auto(cv, darken=0.34, tint=(46, 30, 74), tint_amt=0.28, lost_edge=0.80, only=None):
    """Outline in a darkened, cool-shifted version of the neighbouring fill
    colour, and leave out ("lose") the contour where a bright, lit area meets
    the background on its upper-left side. `only` can restrict outlining to
    neighbours satisfying a predicate on the fill colour."""
    todo = []
    for y in range(-1, cv.h + 1):
        for x in range(-1, cv.w + 1):
            if cv.px[x, y][3] if (0 <= x < cv.w and 0 <= y < cv.h) else 0:
                continue
            best = None
            for dx, dy in ((1, 0), (0, 1), (-1, 0), (0, -1)):
                nx, ny = x + dx, y + dy
                if 0 <= nx < cv.w and 0 <= ny < cv.h and cv.px[nx, ny][3]:
                    col = cv.px[nx, ny]
                    if best is None or _lum(col) < _lum(best[0]):
                        best = (col, dx, dy)
            if best is None:
                continue
            col, dx, dy = best
            if only and not only(col):
                continue
            # neighbour is below/right of this pixel when dx>0 or dy>0: a lit upper-left edge
            if _lum(col) > lost_edge and (dx > 0 or dy > 0):
                continue
            r = int(col[0] * darken * (1 - tint_amt) + tint[0] * tint_amt)
            g = int(col[1] * darken * (1 - tint_amt) + tint[1] * tint_amt)
            b = int(col[2] * darken * (1 - tint_amt) + tint[2] * tint_amt)
            todo.append((x, y, (r, g, b, 255)))
    for x, y, col in todo:
        if 0 <= x < cv.w and 0 <= y < cv.h:
            cv.px[x, y] = col

def dither(cv, pixels, c1, c2, phase=0):
    """Checkerboard between two tones over the given pixels: an intentional
    pixel-cluster texture used for soft shading transitions."""
    for (x, y) in pixels:
        cv.put(x, y, c1 if (x + y + phase) % 2 == 0 else c2)


# ---------------------------------------------------------------------------
# Natural clumps: flowing hair/fur/feather masses. Tone = a global light term
# (so the whole head or body is lit coherently) blended with a per-clump
# across-shading, plus darker clump boundaries and tips. Soft transitions use a
# checker dither instead of hard stripes.
# ---------------------------------------------------------------------------
def cubic(p0, p1, p2, p3, n=56):
    out = []
    for i in range(n + 1):
        t = i / n
        u = 1 - t
        x = u ** 3 * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t ** 3 * p3[0]
        y = u ** 3 * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t ** 3 * p3[1]
        out.append((x, y, t))
    return out

_CUTS = (0.60, 0.18, -0.22, -0.58)

def clump(cv, spine, w0, w1, ramp, center, radius, light=(-0.62, -0.78), w_mid=None,
          mix=0.45, edge_dark=True, tip_dark=True, bias=0.0, dither_band=0.06, flow=True):
    """Paint one flowing clump. `center`/`radius` define the global light
    falloff (the form the clump belongs to); `mix` weights it against the
    clump's own across-shading; `bias` brightens or darkens the clump. With
    `flow`, a dark parting line and a pale glint follow the clump's length
    (never the whole width), which is what makes a mass read as grouped hair."""
    pix = lock_pixels(spine, w0, w1, w_mid)
    mask = set(pix)
    wide = max(w0, w1, w_mid or 0) >= 5.5
    for (x, y), (lat, t, nx, ny) in pix.items():
        gx, gy = (x + 0.5 - center[0]) / radius, (y + 0.5 - center[1]) / radius
        g = max(-1.0, min(1.0, gx * light[0] + gy * light[1] + 0.05))
        nn = math.hypot(nx, ny) or 1.0
        cside = lat * ((nx * light[0] + ny * light[1]) / nn)
        v = mix * g + (1 - mix) * cside + bias
        if edge_dark and abs(lat) > 0.62 and cside < 0:
            v -= 0.42                                    # shadowed clump edge reads as the gap to the next clump
        if tip_dark and t > 0.80:
            v -= 0.26 * (t - 0.80) / 0.20
        if flow and wide and 0.14 < t < 0.78:
            side = 1 if (nx * light[0] + ny * light[1]) >= 0 else -1
            if abs(lat * side + 0.18) < 0.11:
                v -= 0.34                                # parting line inside the clump
            elif abs(lat * side - 0.46) < 0.10:
                v += 0.26                                # glint on the lit side
        idx = len(ramp) - 1
        for i, th in enumerate(_CUTS):
            if v >= th:
                idx = i
                break
        for i, th in enumerate(_CUTS):
            if abs(v - th) < dither_band and (x + y) % 2 == 0:
                idx = min(len(ramp) - 1, i + 1) if idx == i else max(0, i)
                break
        cv.put(x, y, ramp[idx])
    return mask
