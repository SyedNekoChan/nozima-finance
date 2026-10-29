"""
Generates the production sprite frames that the reference sheet does not contain
(see SPEC.md, spec.js `from: 'generated'`):

  python3 art/source/generate_production.py [outdir]     (Pillow + numpy)

Method: render_cat.py (3-D shaded ellipsoid model, fur-flow noise, dark contour, ten-tone palette) draws the
body, limbs and tail for each pose and direction. The head and chest ruff are the approved pixels of the
matching view (idle_front, sit_threeq, sit_rear, walk_side), pasted at their original size; only the rear
three-quarter head is rendered. Not hand-drawn, not made in SpriteForge. The approved folders are only read.
"""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from gen_lib import *

OUT = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(ART) / '_gen'
SHADE = dict(contrast=0.85, gain=0.5, ambient=0.40)
S_ = 9.0  # stride


def tidy(a, minnb=2):
    """drop pixels with fewer than `minnb` opaque 8-neighbours (stray specks)"""
    m = a[..., 3] > 0
    pad = np.pad(m, 1)
    nb = sum(pad[1 + dy:H + 1 + dy, 1 + dx:W + 1 + dx].astype(int) for dy in (-1, 0, 1) for dx in (-1, 0, 1) if dy or dx)
    out = a.copy()
    out[m & (nb < minnb), 3] = 0
    # drop small detached islands (anything not connected to the main body)
    m = out[..., 3] > 0
    seen = np.zeros_like(m)
    comps = []
    for y0 in range(H):
        for x0 in range(W):
            if m[y0, x0] and not seen[y0, x0]:
                stack, cells = [(y0, x0)], []
                seen[y0, x0] = True
                while stack:
                    y, x = stack.pop(); cells.append((y, x))
                    for dy in (-1, 0, 1):
                        for dx in (-1, 0, 1):
                            yy, xx = y + dy, x + dx
                            if 0 <= yy < H and 0 <= xx < W and m[yy, xx] and not seen[yy, xx]:
                                seen[yy, xx] = True; stack.append((yy, xx))
                comps.append(cells)
    biggest = max(len(c) for c in comps)
    for c in comps:
        if len(c) < max(25, biggest // 12):
            for y, x in c: out[y, x, 3] = 0
    return out


def ground(a, row):
    """shift the frame vertically so its lowest opaque row is `row` (planted paws on 61; a leap is raised)"""
    ys = np.where((a[..., 3] > 0).any(axis=1))[0]
    dy = row - int(ys.max())
    if dy == 0: return a
    out = np.zeros_like(a)
    if dy > 0: out[dy:] = a[:H - dy]
    else: out[:H + dy] = a[-dy:]
    return out


def write(name, frames, floor=61):
    frames = [ground(tidy(f), floor) for f in frames]
    d = OUT / name
    d.mkdir(parents=True, exist_ok=True)
    for old in d.glob('*.png'): old.unlink()
    for i, f in enumerate(frames):
        save(f, d / f'{i}.png')


def body_render(P, az, cx, tilt, seed=1, **kw):
    R = Render(az, cx, seed=seed, tilt_deg=tilt)
    R.add(P); R.cast(); R.shade(**{**SHADE, **kw})
    return R.to_frame(seed=seed + 2)


def legs3d(cfg, bd=0.0, hip_front=(5.8, 22.0, 12.0), hip_hind=(7.2, 21.0, -16.0), a=11.5, thick=1.0, sx=1.0):
    """cfg: leg -> (dz from rest, lift) ; returns primitives"""
    P = []
    for name, (side, front, off) in LEGS.items():
        dz, lift = cfg[name]
        z0 = 12.5 if front else -15.5
        hx, hy, hz = hip_front if front else hip_hind
        hip = (side * hx * sx, hy - bd, hz)
        foot = (side * (5.2 if front else 6.4) * sx, 1.6 + lift, z0 + dz)
        P += leg(name, hip, foot, a=a, thick=thick)
    return P


# stride configurations: contact A, passing, contact B (side-derived views and crouched walks)
def gait(kind, S=S_, lift=3.2):
    if kind == 'A':
        return dict(FL=(S * 0.9, 0), FR=(-S * 0.85, lift), HR=(S * 0.8, 0), HL=(-S * 0.9, lift * 0.4))
    if kind == 'B':
        return dict(FL=(S * 0.1, 0), FR=(S * 0.15, 0.4), HR=(0, 0), HL=(0, 0))
    return dict(FR=(S * 0.9, 0), FL=(-S * 0.85, lift), HL=(S * 0.8, 0), HR=(-S * 0.9, lift * 0.4))


# ------------------------------------------------------------------ heads (approved pixels)
def head_front(closed=False):
    idle = load('idle_front', 3 if closed else 0)
    h = crop(idle, 26, 8, 56, 47)
    for yy in range(h.shape[0]):
        y = 8 + yy
        if y >= 36:
            lo, hi = 27 + (y - 36) * 0.8, 52 - (y - 36) * 0.8
            for xx in range(h.shape[1]):
                if not (lo <= 26 + xx <= hi): h[yy, xx, 3] = 0
    return h, 26, 8


def head_side(k):
    a = load('walk_side', k)
    h = crop(a, 0, 4, 34, 46)
    # keep only the head, neck and ruff: drop what hangs low at the right edge (the body continues in the render)
    return h, 0, 4


def head_threeq():
    a = load('sit_threeq', 0)
    return crop(a, 14, 0, 50, 32), 14, 0


def head_rear():
    a = load('sit_rear', 0)
    return crop(a, 27, 0, 58, 29), 27, 0


def place(frame, head, x, y, dx=0, dy=0, fade=4, side=None, seed=5):
    hd = np.zeros_like(frame)
    paste(hd, head, x + dx, y + dy, fade_rows=fade, fade_side=side, seed=seed)
    return under(frame, hd)


# ------------------------------------------------------------------ tails
def tail_walk_side(sw, bd=0.0):
    return tail([(0, 29 - bd * 0.6, -23), (sw * 0.3, 33 - bd * 0.5, -31), (sw * 0.6, 41 - bd * 0.4, -36), (sw, 48 - bd * 0.3, -37.5), (sw, 54 - bd * 0.3, -34)])


def tail_creep(sw):
    """low and trailing, the tip lifting a little"""
    return tail([(0, 25, -22), (sw * 0.3, 22.5, -31), (sw * 0.6, 21.5, -40), (sw, 24, -47)], r0=2.8, r1=4.7)


# ------------------------------------------------------------------ walk / creep front and rear
def front_cfg(phase, S=S_, lift=3.4):
    return {'A': dict(FL=(S * 1.0, 0), FR=(-S * 0.9, lift), HL=(-S * 0.9, lift * 0.9), HR=(S * 0.9, 0)),
            'B': dict(FL=(0, 0), FR=(0, 0), HL=(0, 0), HR=(0, 0)),
            'C': dict(FL=(-S * 0.9, lift), FR=(S * 1.0, 0), HL=(S * 0.9, 0), HR=(-S * 0.9, lift * 0.9))}[phase]


def walk_front(crouch=False, seed=11):
    out = []
    h, hx, hy = head_front()
    for i, ph in enumerate('ABC'):
        bob = {'A': 0.0, 'B': -1.0, 'C': 0.0}[ph] + (8.0 if crouch else 0.0)
        P = torso(bd=bob, chest_z=15, hip_z=-19, ruff_w=11.0)
        P += legs3d(front_cfg(ph, S=6.5 if crouch else S_, lift=2.4 if crouch else 3.4), bd=bob, a=10.2 if crouch else 11.5)
        t = {'A': 3, 'B': 0, 'C': -3}[ph]
        ty = 0 if not crouch else -6
        P += tail([(5, 27 + ty * 0.5, -22), (11 + t, 28 + ty * 0.7, -27), (15 + t, 33 + ty, -29), (15 + t * 1.2, 39 + ty, -29)], r0=2.8, r1=5.0)
        b = body_render(P, 0, 39, 12, seed=seed + i)
        out.append(place(b, h, hx, hy, dy=int(bob) + (4 if crouch else 0)))
    return out


def walk_rear(crouch=False, seed=21):
    out = []
    h, hx, hy = head_rear()
    for i, ph in enumerate('ABC'):
        bob = {'A': 0.0, 'B': -1.0, 'C': 0.0}[ph] + (8.0 if crouch else 0.0)
        P = torso(bd=bob, chest_z=15, hip_z=-19, ruff_w=11.0, hip_w=3.0)
        P += legs3d(front_cfg(ph, S=6.5 if crouch else S_, lift=2.4 if crouch else 3.4), bd=bob, a=10.2 if crouch else 11.5, hip_hind=(8.0, 21.0, -16.0))
        t = {'A': 2.5, 'B': 0, 'C': -2.5}[ph]
        if crouch:
            P += tail([(3, 25, -22), (8 + t, 23, -28), (14 + t, 22, -31), (20 + t, 24, -30)], r0=2.8, r1=4.6)
        else:
            P += tail([(3, 28, -22), (9 + t, 33, -26), (13 + t, 41, -27), (12 + t, 49, -25)], r0=2.8, r1=4.8)
        b = body_render(P, 180, 41, 12, seed=seed + i)
        out.append(place(b, h, hx, hy + 4 + int(bob) + (-0 if not crouch else -1), fade=3))
    return out


# ------------------------------------------------------------------ walk / creep, side and three-quarter views
def walk_side_like(az, tilt, cx, head_for, crouch=False, seed=31, hip_w=0.0):
    out = []
    for i, ph in enumerate('ABC'):
        bd = 8.0 if crouch else 0.0
        bd += {'A': 0.0, 'B': 0.8, 'C': 0.0}[ph]
        S = 6.5 if crouch else S_
        P = torso(bd=bd, chest_z=15, hip_z=-19, ruff_w=8.2, hip_w=hip_w)
        P += legs3d(gait(ph, S=S, lift=2.4 if crouch else 3.2), bd=bd, a=10.2 if crouch else 11.5)
        sw = {'A': 2, 'B': 0, 'C': -2}[ph]
        P += tail_creep(sw) if crouch else tail_walk_side(sw, bd)
        P += head_for.model(bd, crouch) if hasattr(head_for, 'model') else []
        b = body_render(P, az, cx, tilt, seed=seed + i)
        out.append(head_for(b, i, crouch))
    return out


def head_side_placer(b, i, crouch):
    h, x, y = head_side(i)
    return place(b, h, x, y, dx=1 if crouch else 0, dy=9 if crouch else 0, fade=5, side='right')


def head_threeq_placer(b, i, crouch):
    h, x, y = head_threeq()
    return place(b, h, x, y, dx=0, dy=(9 if crouch else 0) + (1 if i == 1 else 0), fade=4, side='right')


def head_rearq_placer(b, i, crouch):
    return b


def _rearq_model(bd, crouch):
    return head3d((0, 36.0 - bd - (0 if not crouch else 0), 25.5), size=1.0)


head_rearq_placer.model = _rearq_model


# ------------------------------------------------------------------ leaps, low, loaf
def leap_side():
    h, x, y = head_side(1)
    bd = -7.0
    P = torso(bd=bd, sag=-1.0, chest_z=16, hip_z=-20, ruff_w=8.0)
    # forelegs reach forward and down, hind legs push back
    for name, (side, front, off) in LEGS.items():
        hx, hy, hz = (5.8, 22.0, 12.0) if front else (7.2, 21.0, -16.0)
        hip = (side * hx, hy - bd, hz)
        if front:
            foot = (side * 5.2, 19.0 + (3.0 if side < 0 else 0), 33.0 + (0 if side > 0 else -3.0))
        else:
            foot = (side * 6.4, 14.0 + (3.0 if side < 0 else 0), -26.0 + (0 if side > 0 else 3.0))
        P += leg(name, hip, foot, a=11.5, b=11.0)
    P += tail([(0, 33, -24), (0, 38, -33), (0, 43, -42), (0, 45, -49)], r0=2.8, r1=4.6)
    b = body_render(P, -90, 42, 0, seed=41)
    return [place(b, h, x, y, dx=0, dy=-7, fade=5, side='right')]


def leap_front():
    h, hx, hy = head_front()
    bd = -7.0
    P = torso(bd=bd, chest_z=15, hip_z=-19, ruff_w=11.0)
    # forelegs reach toward the viewer (nearer = lower on screen), hind legs trail
    cfg = dict(FL=(14.0, 8.0), FR=(14.0, 8.0), HL=(-6.0, 6.0), HR=(-6.0, 6.0))
    P += legs3d(cfg, bd=bd)
    P += tail([(5, 31, -22), (11, 34, -27), (15, 39, -29), (15, 45, -29)], r0=2.8, r1=5.0)
    b = body_render(P, 0, 39, 12, seed=43)
    return [place(b, h, hx, hy, dy=-7)]


def low_front():
    out = []
    hd, hx, hy = head_front(closed=True)
    # the closed-eye head only (rows 8..30), chin down: the chest ruff is rendered, the cat is crouched low
    hd = crop(load('idle_front', 3), 26, 8, 56, 40)
    for i in range(2):
        bd = 15.0 - 0.8 * i
        P = torso(bd=bd, chest_z=14, hip_z=-17, ruff_w=11.5, hip_w=2.0)
        # forelegs stretched forward flat, hind legs folded under
        P += legs3d(dict(FL=(17.0, 0), FR=(17.0, 0), HL=(-7.0, 0), HR=(-7.0, 0)), bd=bd, a=7.5, thick=1.0, hip_front=(6.4, 19.5, 12.0), hip_hind=(8.5, 18.0, -14.0))
        P += tail([(7, 3.0, -9), (12, 2.6, -12), (16, 3.0, -12), (19, 4.0, -9)], r0=2.6, r1=4.4)
        b = body_render(P, 0, 39, 14, seed=51 + i)
        out.append(place(b, hd, hx, hy, dy=10 + i, fade=5))
    return out


def loaf_front():
    out = []
    hd = crop(load('idle_front', 0), 26, 8, 56, 36)
    for i in range(2):
        up = 0.7 * i
        P = [Prim((0, 10.0, 1), (15.8, 10.0 + up, 15), 'body'),
             Prim((0, 8.0, 6), (13.5, 7.5, 12), 'belly', 0.8),
             Prim((-11.0, 11.0, -3), (7.0, 8.5, 9), 'HL', 0.7), Prim((11.0, 11.0, -3), (7.0, 8.5, 9), 'HR', 0.7),
             Prim((0, 14.5 + up, 13), (12.0, 8.5, 6), 'ruff', 0.8, flow=(0, -1, 0.3))]
        for sx in (-1, 1):  # tucked forepaws peeking out under the chest
            P.append(Prim((sx * 4.4, 2.6, 19.0), (3.6, 2.6, 4.6), 'FL' if sx > 0 else 'FR', 0.3, flow=(0, 0, 1)))
        P += tail([(12, 5.0, -4), (19, 4.2, 4), (21, 4.2, 13), (17, 4.8, 20)], r0=3.4, r1=5.4)
        b = body_render(P, 0, 39, 16, seed=61 + i)
        out.append(place(b, hd, 26, 8, dy=24 + i, fade=5))
    return out


if __name__ == '__main__':
    only = set(sys.argv[2:])
    jobs = {
        'walk_front': walk_front,
        'walk_rear': walk_rear,
        'walk_frontQ': lambda: walk_side_like(-45, 8, 38, head_threeq_placer),
        'walk_rearQ': lambda: walk_side_like(-135, 8, 52, head_rearq_placer, hip_w=2.5),
        'creep_front': lambda: walk_front(crouch=True, seed=71),
        'creep_rear': lambda: walk_rear(crouch=True, seed=81),
        'creep_frontQ': lambda: walk_side_like(-45, 8, 38, head_threeq_placer, crouch=True, seed=91),
        'creep_rearQ': lambda: walk_side_like(-135, 8, 52, head_rearq_placer, crouch=True, seed=101, hip_w=2.5),
        'creep_side': lambda: walk_side_like(-90, 0, 46, head_side_placer, crouch=True),
        'leap_front': leap_front,
        'leap_side': leap_side,
        'low_front': low_front,
        'loaf_front': loaf_front,
    }
    for name, fn in jobs.items():
        if only and name not in only: continue
        fr = fn()
        write(name, fr, floor=54 if name.startswith('leap') else 61)
        preview(fr, f'/tmp/claude-0/-home-user-nozima-finance/1846b3aa-0f19-59ba-b225-26ceabaaed2e/scratchpad/live/g_{name}.png', Z=12)
        print(name, len(fr))
