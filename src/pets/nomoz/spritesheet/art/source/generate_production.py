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
from handcraft import handcraft

HANDCRAFT = True
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


def shift_rows(m, dy):
    out = np.zeros_like(m)
    if dy > 0: out[dy:] = m[:H - dy]
    elif dy < 0: out[:H + dy] = m[-dy:]
    else: out[:] = m
    return out


def tail_entry(f, g, dy):
    """the tail of a finished frame for tails.json: its pixels as '#' rows over a bounding box, the base and the tip"""
    tm = getattr(f, 'tail', None)
    if tm is None: return None
    tm = shift_rows(tm, dy) & (g[..., 3] > 0)
    ys, xs = np.where(tm)
    if len(xs) < 12: return None
    x0, x1, y0, y1 = int(xs.min()), int(xs.max()), int(ys.min()), int(ys.max())
    rows = [''.join('#' if tm[y, x] else '.' for x in range(x0, x1 + 1)) for y in range(y0, y1 + 1)]
    pts = getattr(f, 'tailpts', None)
    base = [round(pts[0][0], 1), round(pts[0][1] + dy, 1)]
    tip = [round(pts[1][0], 1), round(pts[1][1] + dy, 1)]
    return {'x': x0, 'y': y0, 'rows': rows, 'base': base, 'tip': tip}


def write(name, frames, floor=61):
    done, tails = [], []
    for f in frames:
        g = as_fr(handcraft(f, seed=sum(map(ord, name)) + len(done)) if HANDCRAFT else np.asarray(f))
        g = tidy(g)
        ys = np.where((g[..., 3] > 0).any(axis=1))[0]
        dy = floor - int(ys.max())
        g = ground(g, floor)
        done.append(g)
        tails.append(tail_entry(f, g, dy))
    d = OUT / name
    d.mkdir(parents=True, exist_ok=True)
    for old in d.glob('*.png'): old.unlink()
    for i, f in enumerate(done):
        save(f, d / f'{i}.png')
    record_tails(name, tails)


def record_tails(name, tails):
    """art/tails.json: per art folder, per frame, the tail pixels that the renderer sways at run time"""
    import json
    path = Path(ART) / 'tails.json'
    data = json.loads(path.read_text()) if path.exists() else {}
    data[name] = tails
    path.write_text(json.dumps(dict(sorted(data.items())), indent=0, separators=(',', ':')) + '\n')


def body_render(P, az, cx, tilt, seed=1, pitch=0.0, style=None, **kw):
    R = Render(az, cx, seed=seed, tilt_deg=tilt, pitch_deg=pitch)
    R.add(P); R.cast(); R.shade(**{**SHADE, **kw})
    fr = R.to_frame(seed=seed + 2, **{**STYLE, **(style or {})})
    # which visible pixels are the tail (and the base and tip of its spine, in frame coordinates)
    pr = lambda c: (float((R.M @ c)[0] + R.cx), float(62.0 - (R.M @ c)[1]))
    paws = []
    for q in R.prims:
        if q.paw:
            x0, y0 = pr(q.c)
            v = R.M @ (R._pitched(R.pivot + np.array([0.0, 0.0, 1.0])) - R.pivot)
            paws.append((x0, y0, float(v[0]), float(-v[1]), float(v[2])))
    tp = [q for q in P if q.part == 'tail']
    if not tp: return as_fr(fr, paws=paws)
    tid = R.partnames['tail']
    tm = (R.part[SS // 2::SS, SS // 2::SS] == tid) & R.mask
    body = (R.part[SS // 2::SS, SS // 2::SS] >= 0) & (R.part[SS // 2::SS, SS // 2::SS] != tid) & R.mask
    grow = tm.copy()
    for dy, dx in ((-1, 0), (1, 0), (0, -1), (0, 1)):
        grow |= np.roll(np.roll(tm, dy, 0), dx, 1)
    tm = (grow & ~body & (fr[..., 3] > 0)) | tm
    pr = lambda c: (float((R.M @ c)[0] + R.cx), float(62.0 - (R.M @ c)[1]))
    return as_fr(fr, tm, (pr(tp[0].c), pr(tp[-1].c)), paws)


# rendering style of every generated body (render_cat.py to_frame): fewer speckles, fur locks, limbs outlined, and the
# tone distribution of the approved frames (so all generated frames are as dark, as contrasty and as flat as the originals)
def _target():
    t = approved_tone_target()
    t[1] += t[0]  # the darkest tone is the outline's: inside the body the deepest shadow is the next one up
    t[0] = 0.0
    return t


STYLE = dict(smooth=1, locks=0.03, limbs=1, match=_target())


def legs3d(cfg, bd=0.0, hip_front=(5.8, 22.0, 12.0), hip_hind=(7.2, 21.0, -16.0), a=11.5, thick=1.0, sx=1.0, haunch=0.0, shoulder=0.0, paw=1.15, elbow=0.0):
    """cfg: leg -> (dz from rest, lift) ; returns primitives. haunch > 0 adds a thigh muscle over each hind hip, so the haunch reads as a form of its own"""
    P = []
    for name, (side, front, off) in LEGS.items():
        dz, lift = cfg[name]
        z0 = 12.5 if front else -15.5
        hx, hy, hz = hip_front if front else hip_hind
        hip = (side * hx * sx, hy - bd, hz)
        foot = (side * (5.2 if front else 6.4) * sx, 1.6 + lift, z0 + dz)
        P += leg(name, hip, foot, a=a, thick=thick, paw=paw, shoulder=shoulder if front else 0.0, elbow=elbow)
        if haunch and not front:
            P.append(Prim((hip[0] + side * 0.6, hip[1] - 1.5, hip[2] - 0.5), (4.6 * haunch, 6.4 * haunch, 6.6 * haunch), name, 0.7, flow=(0, -1, 0.3)))
    return P


# ------------------------------------------------------------------ the five keyed poses of a walk or creep
# frame 0 contact (left-front and right-hind forward), 1 neutral (all four down: the standing pose), 2 contact
# (the other diagonal), 3 and 4 the passing poses between them (one diagonal swinging through, the body at its
# highest). The manifest plays 0 3 2 4.
PHASES = ['A', 'N', 'C', 'P1', 'P2']
BOB = {'A': 0.7, 'N': 0.0, 'C': 0.7, 'P1': -0.8, 'P2': -0.8}   # contact: the weight drops; passing: it rises


def gait(kind, S=S_, lift=3.2):
    """leg -> (forward offset, lift) for side-like views (z is along the body)"""
    if kind == 'A':
        return dict(FL=(S * 0.9, 0), FR=(-S * 0.85, lift), HR=(S * 0.8, 0), HL=(-S * 0.9, lift * 0.4))
    if kind == 'C':
        return dict(FR=(S * 0.9, 0), FL=(-S * 0.85, lift), HL=(S * 0.8, 0), HR=(-S * 0.9, lift * 0.4))
    if kind == 'P1':   # FR and HL swing through, FL and HR hold the ground
        return dict(FL=(-S * 0.1, 0), HR=(S * 0.1, 0), FR=(S * 0.05, lift * 1.25), HL=(-S * 0.05, lift * 1.1))
    if kind == 'P2':
        return dict(FR=(-S * 0.1, 0), HL=(S * 0.1, 0), FL=(S * 0.05, lift * 1.25), HR=(-S * 0.05, lift * 1.1))
    return dict(FL=(S * 0.12, 0), FR=(-S * 0.08, 0), HR=(S * 0.1, 0), HL=(-S * 0.1, 0))


def front_cfg(phase, S=S_, lift=3.4):
    """the same strides seen head on (z toward or away from the viewer)"""
    g = gait(phase, S, lift)
    return g


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


def place(frame, head, x, y, dx=0, dy=0, fade=4, side=None, seed=5, tail_over=False):
    hd = np.zeros_like(frame)
    paste(hd, head, x + dx, y + dy, fade_rows=fade, fade_side=side, seed=seed)
    out = under(frame, hd)
    tm = getattr(frame, 'tail', None)
    if tail_over and tm is not None:
        out[tm & (frame[..., 3] > 0)] = frame[tm & (frame[..., 3] > 0)]   # a tail rising in front of the head stays in front
    return as_fr(out, tm, getattr(frame, 'tailpts', None), getattr(frame, 'paws', None), hd[..., 3] > 0)


# ------------------------------------------------------------------ tails
def tail_walk_side(sw, bd=0.0):
    """held up and back, a gentle S: the tip hooks forward a little"""
    return tail([(0, 29 - bd * 0.6, -23), (sw * 0.3, 33 - bd * 0.5, -31), (sw * 0.6, 40 - bd * 0.4, -35), (sw, 46 - bd * 0.3, -36.5), (sw, 51 - bd * 0.3, -34)], r0=3.0, r1=4.6)


def tail_creep(sw, bd=0.0):
    """low, trailing and flowing, the tip lifting a little"""
    return tail([(0, 27 - bd * 0.5, -22), (sw * 0.3, 24.5 - bd * 0.5, -29), (sw * 0.6, 22.8 - bd * 0.5, -35), (sw, 23.2 - bd * 0.4, -40), (sw, 25.5 - bd * 0.4, -43.5)], r0=2.8, r1=4.4)


# ------------------------------------------------------------------ walk / creep front and rear
def walk_front(crouch=False, seed=11):
    out = []
    h, hx, hy = head_front()
    for i, ph in enumerate(PHASES):
        bd = BOB[ph] * 0.8 + (5.0 if crouch else 0.0)
        P = torso(bd=bd, chest_z=15, hip_z=-19, ruff_w=11.0)
        P += legs3d(front_cfg(ph, S=6.2 if crouch else 8.4, lift=2.6 if crouch else 3.4), bd=bd, a=10.4 if crouch else 11.5)
        t = 0  # the tail's sway is added at run time (tail.js); baking a different sway into each frame made it step every beat
        ty = -5 if crouch else 0
        # the tail curves up behind the haunch, a plume showing past the hip (as in the approved sitting cat)
        P += tail([(8, 19 + ty * 0.4, -24), (13 + t * 0.4, 19 + ty * 0.5, -27), (17 + t * 0.6, 23 + ty * 0.6, -28), (19 + t * 0.8, 30 + ty * 0.8, -27)], r0=3.0, r1=4.6)
        b = body_render(P, 0, 39, 12, seed=seed + i)
        out.append(place(b, h, hx, hy, dy=int(round(bd)) + (2 if crouch else 0)))
    return out


def walk_rear(crouch=False, seed=21):
    out = []
    h, hx, hy = head_rear()
    for i, ph in enumerate(PHASES):
        bd = BOB[ph] * 0.8 + (5.0 if crouch else 0.0)
        P = torso(bd=bd, chest_z=15, hip_z=-19, ruff_w=11.0, hip_w=3.5)
        P += legs3d(front_cfg(ph, S=6.2 if crouch else 8.4, lift=2.6 if crouch else 3.4), bd=bd, a=10.4 if crouch else 11.5, hip_hind=(8.0, 21.0, -16.0), thick=1.1)
        t = 0  # (see walk_front)
        if crouch:
            # low and trailing: seen end on it lies along the line of sight, a plume dropping behind the rump
            P += tail([(1, 28 - bd * 0.4, -22), (2 + t, 26 - bd * 0.4, -30), (3 + t, 25 - bd * 0.4, -38), (4 + t, 27 - bd * 0.4, -44)], r0=2.8, r1=4.2)
        else:
            # up from the rump, in front of the back, its tip leaning to one side beside the head
            P += tail([(0, 28, -23), (5 + t * 0.4, 33, -26), (10 + t * 0.8, 41, -27), (12 + t, 50, -25)], r0=3.4, r1=4.8)
        b = body_render(P, 180, 41, 12, seed=seed + i)
        out.append(place(b, h, hx, hy, dy=int(round(bd)) + (4 if not crouch else 3), fade=3, tail_over=True))
    return out


# ------------------------------------------------------------------ walk / creep, side and three-quarter views
HEAD_FRAME = {'A': 0, 'N': 1, 'C': 2, 'P1': 1, 'P2': 1}


def walk_side_like(az, tilt, cx, head_for, crouch=False, seed=31, hip_w=0.0, chest_w=1.0, ruff_w=8.2, haunch=0.0):
    out = []
    for i, ph in enumerate(PHASES):
        bd = (5.0 if crouch else 0.0) + BOB[ph] * (0.6 if crouch else 1.0)
        S = 7.0 if crouch else S_
        P = torso(bd=bd, chest_z=15, hip_z=-19, ruff_w=ruff_w, hip_w=hip_w, chest_w=chest_w)
        P += legs3d(gait(ph, S=S, lift=2.8 if crouch else 3.4), bd=bd, a=10.6 if crouch else 11.5, haunch=haunch, shoulder=1.0 if chest_w < 1 else 0.0, elbow=1.0 if chest_w < 1 else 0.0)
        sw = 0  # (see walk_front)
        P += tail_creep(sw, bd) if crouch else tail_walk_side(sw, bd)
        P += head_for.model(bd, crouch) if hasattr(head_for, 'model') else []
        b = body_render(P, az, cx, tilt, seed=seed + i)
        out.append(head_for(b, HEAD_FRAME[ph], crouch, bd))
    return out


def head_side_placer(b, k, crouch, bd=0.0):
    h, x, y = head_side(k)
    return place(b, h, x, y, dx=1 if crouch else 0, dy=int(round(bd)) + (2 if crouch else 0), fade=5, side='right')


def head_threeq_placer(b, k, crouch, bd=0.0):
    h, x, y = head_threeq()
    return place(b, h, x, y, dx=0, dy=int(round(bd)) + (2 if crouch else 0), fade=4, side='right')


def head_rearq_placer(b, k, crouch, bd=0.0):
    return b


def _rearq_model(bd, crouch):
    return head3d((0, 36.0 - bd, 25.5), size=1.0)


head_rearq_placer.model = _rearq_model


# ------------------------------------------------------------------ leaps, low, loaf
def leap_side():
    h, x, y = head_side(1)
    bd = -1.0
    pitch = 8.0
    P = torso(bd=bd, sag=-1.0, chest_z=16, hip_z=-20, ruff_w=8.0)
    # forelegs reach out ahead with the elbow bent and the paws spread, hind legs stretch out behind: thigh, hock, a long
    # narrow shin and a broad paw (the whole cat is pitched nose up)
    for name, (side, front, off) in LEGS.items():
        hx, hy, hz = (5.8, 22.0, 12.0) if front else (7.2, 21.0, -16.0)
        hip = (side * hx, hy - bd, hz)
        if front:
            foot = (side * 5.8, 23.5 + (2.0 if side < 0 else 0), 33.0 + (0 if side > 0 else -4.0))
            P += leg(name, hip, foot, a=10.0, b=13.0, paw=1.35, wrist=0.8, shoulder=1.0, elbow=1.0)
        else:
            foot = (side * 6.8, 13.0 + (3.5 if side < 0 else 0), -35.0 + (0 if side > 0 else 4.0))
            P += leg(name, hip, foot, a=10.0, b=14.0, paw=1.35, wrist=0.75, shoulder=1.1, elbow=1.0)
    P += tail([(0, 31, -24), (0, 31.5, -32), (0, 33, -39), (0, 35, -43), (0, 38.5, -46)], r0=2.8, r1=4.4)
    b = body_render(P, -90, 42, 0, seed=41, pitch=pitch)
    return [place(b, h, x, y, dx=0, dy=-3, fade=5, side='right')]


def leap_front():
    h, hx, hy = head_front()
    bd = -2.0
    P = torso(bd=bd, chest_z=15, hip_z=-19, ruff_w=11.0)
    # airborne, pounced toward the viewer: the body pitched at us, the forelegs thrown wide and forward (nearer is
    # lower on screen), the hind legs kicked out behind and to the sides, the tail streaming up. No leg is a
    # planted column: all four feet are in the air, and the engine keeps the shadow on the ground below.
    for name, (side, front, off) in LEGS.items():
        hx_, hy_, hz_ = (6.0, 22.0, 12.0) if front else (7.2, 21.0, -16.0)
        foot = (side * 12.5, 21.0, 31.0) if front else (side * 13.5, 12.0, -24.0)
        P += leg(name, (side * hx_, hy_ - bd, hz_), foot, a=10.5 if front else 10.0, b=12.5 if front else 13.5, paw=1.35, wrist=0.8, shoulder=1.0, elbow=1.0)
    P += tail([(8, 24, -24), (13, 27, -28), (17, 33, -29), (19, 41, -28)], r0=3.0, r1=4.6)
    b = body_render(P, 0, 39, 12, seed=43, pitch=14.0)
    return [place(b, h, hx, hy, dy=-1)]


def low_front():
    out = []
    # the closed-eye head only (rows 8..40), chin down: the chest ruff is rendered, the cat is crouched low
    hd = crop(load('idle_front', 3), 26, 8, 56, 40)
    for i in range(2):
        bd = 14.0 - 0.8 * i
        P = torso(bd=bd, chest_z=14, hip_z=-17, ruff_w=11.5, hip_w=2.0)
        # hind legs folded under, forelegs stretched forward
        P += legs3d(dict(FL=(17.0, 0), FR=(17.0, 0), HL=(-7.0, 0), HR=(-7.0, 0)), bd=bd, a=7.5, thick=1.0, hip_front=(6.4, 19.5, 12.0), hip_hind=(8.5, 18.0, -14.0))
        for sx in (-1, 1):  # two forepaws rest side by side in front of the chest: broad pads with the forearms behind them
            part = 'FL' if sx > 0 else 'FR'
            P.append(Prim((sx * 7.2, 2.8, 26.0 + 0.5 * i), (4.6, 3.0, 5.6), part, 0.3, flow=(0, 0, 1)))
            P.append(Prim((sx * 7.0, 3.8, 21.0), (3.8, 2.8, 5.0), part, 0.3, flow=(0, 0, 1)))
        P += tail([(8, 3.0, -9), (14, 3.0, -12), (19, 4.5, -11), (22, 7.5, -7)], r0=2.8, r1=4.8)
        b = body_render(P, 0, 39, 8, seed=51 + i)
        out.append(place(b, hd, 26, 8, dy=9 + i, fade=5))
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


JOBS = {
    'walk_front': walk_front,
    'walk_rear': walk_rear,
    'walk_frontQ': lambda: walk_side_like(-45, 8, 42, head_threeq_placer, chest_w=0.78, ruff_w=6.0, haunch=1.0),
    'walk_rearQ': lambda: walk_side_like(-135, 8, 52, head_rearq_placer, hip_w=2.5),
    'creep_front': lambda: walk_front(crouch=True, seed=71),
    'creep_rear': lambda: walk_rear(crouch=True, seed=81),
    'creep_frontQ': lambda: walk_side_like(-45, 8, 42, head_threeq_placer, crouch=True, seed=91, chest_w=0.78, ruff_w=6.0, haunch=1.0),
    'creep_rearQ': lambda: walk_side_like(-135, 8, 52, head_rearq_placer, crouch=True, seed=101, hip_w=2.5),
    'creep_side': lambda: walk_side_like(-90, 0, 46, head_side_placer, crouch=True),
    'leap_front': leap_front,
    'leap_side': leap_side,
    'low_front': low_front,
    'loaf_front': loaf_front,
}

if __name__ == '__main__':
    only = set(sys.argv[2:])
    for name, fn in JOBS.items():
        if only and name not in only: continue
        fr = fn()
        write(name, fr, floor=54 if name.startswith('leap') else 61)
        print(name, len(fr))
