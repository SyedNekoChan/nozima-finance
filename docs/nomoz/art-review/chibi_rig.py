"""Shared chibi rig for the class models. Same skull, face, eye, body and limb
geometry as the approved Swordsman model (head about 55% of the height, small
tapered torso, short limbs); each class supplies colours and hooks for hair,
outfit, equipment and silhouette. Single static front pose only."""
from pixlib import Canvas, hexc, cubic, bez, paint_lock, clump, outline_auto

CX = 20
L = (-0.62, -0.78)

SKIN  = ['#fff1e4', '#fddec6', '#f3bba2', '#da9186', '#a9646c']
STEEL = ['#f5f9ff', '#cfdcf0', '#94a8cb', '#5f739d', '#37436c']
LEATH = ['#e8b980', '#bd8656', '#895640', '#5d3a35', '#38242d']
GOLD  = ['#fff2b0', '#f5cf5f', '#cf9a35', '#8f5f2b']
RED   = ['#ffbaa2', '#f27d6f', '#cb4859', '#912b47', '#5a1a30']
BONE  = ['#fffaf0', '#f3e8d0', '#d9c8a8', '#ab977f', '#6f5f60']
WHITE = '#fffdf4'

def span(c, y, half, ramp, light=0.3, shade=0.72, cx=CX):
    x0, x1 = cx - int(half), cx + int(half) - 1
    n = max(1, x1 - x0)
    for x in range(x0, x1 + 1):
        t = (x - x0) / n
        idx = 0 if t < light * 0.45 else (1 if t < light else (2 if t < shade else (3 if t < 0.94 else 4)))
        c.put(x, y, ramp[idx])

def build(spec):
    top = spec.get('top', 0)           # extra rows above the standard head (hats, staves)
    side = spec.get('side', 0)         # extra columns each side
    c = Canvas(40 + 2 * side, 47 + top)
    c.ox, c.oy = side, top
    skin = spec.get('skin', SKIN)
    hair = spec['hair']; iris = spec['iris']
    T, SL, TR, BT = spec['tunic'], spec['sleeve'], spec['trouser'], spec.get('boots', LEATH)
    lash = spec.get('lash', '#3a1f33'); sclera = spec.get('sclera', '#e9eefb'); pupil = spec.get('pupil', '#2a1109')
    HC, HR = (20, 13), 14

    if spec.get('back'): spec['back'](c)

    # nape hair behind the neck
    c.rect(15, 23, 24, 26, hair[3])

    # ---- legs and boots
    for sx in (-1, 1):
        xc0 = CX + sx * 2.8
        for y in range(36, 41):
            hw = 2.3 - (y - 36) * 0.06
            for x in range(int(round(xc0 - hw)), int(round(xc0 + hw)) + 1):
                t = (x - (xc0 - hw)) / (2 * hw)
                idx = 1 if t < 0.3 else (2 if t < 0.68 else 3)
                if sx > 0 and t > 0.82: idx = 4
                c.put(x, y, TR[idx])
    for sx in (-1, 1):
        xc = CX + sx * 2.9
        for y in range(40, 44):
            hw = 2.45
            for x in range(int(round(xc - hw)), int(round(xc + hw)) + 1):
                t = (x - (xc - hw)) / (2 * hw)
                idx = 1 if t < 0.3 else (2 if t < 0.7 else 3)
                if y == 40: idx = 0
                c.put(x, y, BT[idx])
        c.ellipse(xc + sx * 0.3, 44.0, 3.0, 1.7, BT, light=L, cuts=(0.7, 0.3, -0.1, -0.5))
        c.hline(int(round(xc - 2.2)), int(round(xc + 2.2)), 45, BT[4])
        c.pts(spec.get('buckle', STEEL[1]), (int(round(xc)), 42))

    if spec.get('behind_body'): spec['behind_body'](c)

    # ---- torso
    half = spec.get('torso_half', {27: 2.8, 28: 5.0, 29: 6.2, 30: 6.5, 31: 6.3, 32: 5.9, 33: 5.4, 34: 5.4, 35: 6.0})
    for y, h in half.items():
        span(c, y, h, T)
    if spec.get('scallop', True):
        for x in range(14, 27, 3):
            c.pts(T[4], (x, 35), (x + 1, 35))
    c.vline(21, 33, 35, T[3]); c.vline(17, 34, 35, T[3])
    if spec.get('robe'):
        r = spec['robe']
        flare = r.get('flare', {36: 6.4, 37: 6.8, 38: 7.2, 39: 7.6, 40: 8.0, 41: 8.4, 42: 8.8})
        for y, h in flare.items():
            span(c, y, h, r['ramp'])
        for y in flare:
            c.put(CX - int(flare[y]), y, r['ramp'][1]); c.put(CX + int(flare[y]) - 1, y, r['ramp'][4])
        for (x, y0, y1) in r.get('folds', ((16, 38, 42), (24, 38, 42), (20, 39, 42))):
            c.vline(x, y0, y1, r['ramp'][3]); c.vline(x - 1, y0 + 1, y1, r['ramp'][1] if x < 20 else r['ramp'][2])
        if r.get('trim'):
            c.hline(CX - int(flare[42]), CX + int(flare[42]) - 1, 42, r['trim'][2])
            c.hline(CX - int(flare[42]) + 1, CX + int(flare[42]) - 2, 41, r['trim'][1]) if r.get('trim2') else None
        if r.get('ragged'):
            for x in range(CX - int(flare[42]), CX + int(flare[42]), 2):
                c.pts(r['ramp'][4], (x, 43))
    if spec.get('torso_gear'): spec['torso_gear'](c)
    c.pts(T[3], (CX - 1, 28), (CX, 28), (CX + 1, 28))
    if spec.get('belt'): spec['belt'](c)

    # ---- arms
    ah = spec.get('arm_shift', 0)
    paint_lock(c, bez((14.4, 28.5), (12.4 - ah, 31.5), (12.8 - ah, 34)), 3.3, 2.5, SL, L, tip_dark=False)
    paint_lock(c, bez((25.6, 28.5), (27.6 + ah, 31.5), (27.2 + ah, 34)), 3.3, 2.5, SL, L, tip_dark=False)
    if spec.get('cuffs'): spec['cuffs'](c)
    c.ellipse(12.8 - ah, 37.0, 1.9, 1.9, skin, light=L, cuts=(0.8, 0.3, -0.2, -0.6)); c.pts(skin[3], (12 - ah, 38), (13 - ah, 38))
    c.ellipse(27.2 + ah, 36.4, 1.9, 1.9, skin, light=L, cuts=(0.7, 0.25, -0.25, -0.6))
    if spec.get('front'): spec['front'](c)

    # ---- neck
    c.rect(18, 26, 22, 27, skin[3]); c.rect(18, 26, 20, 26, skin[2])
    if spec.get('collar'): spec['collar'](c)
    else:
        c.pts(T[1], (16, 27), (17, 27)); c.pts(T[3], (23, 27), (24, 27))

    # ---- head
    c.ellipse(20, 13.6, 12.6, 11.6, hair, light=L, cuts=(0.97, 0.72, 0.32, -0.08))
    c.ellipse(20, 16.4, 12.4, 10.0, skin, light=L, cuts=(0.84, 0.22, -0.4, -0.78),
              mask=lambda x, y: abs((x - 20) / 11.3) ** 2.6 + abs((y - 16.4) / 9.0) ** 2.6 <= 1)
    c.pts(skin[3], (11, 22), (12, 23), (13, 24)); c.hline(15, 25, 25, skin[3]); c.hline(17, 23, 26, skin[4])
    c.pts(skin[2], (8, 17), (8, 18), (32, 17), (32, 18))

    def eye(x0, outer_left):
        c.hline(x0 + (0 if outer_left else 1), x0 + (3 if outer_left else 4), 13, lash)
        c.pts(lash, (x0 - 1, 14)) if outer_left else c.pts(lash, (x0 + 5, 14))
        rows = ((14, iris[0], 1, 3), (15, iris[1], 0, 4), (16, iris[1], 0, 4), (17, iris[2], 0, 4), (18, iris[2], 0, 4), (19, iris[2], 1, 3))
        for y, col, a, b in rows:
            c.hline(x0 + a, x0 + b, y, col)
        sxx = x0 - 1 if outer_left else x0 + 5
        for y in (15, 16, 17, 18):
            c.put(sxx, y, sclera)
        px = x0 + 2 if outer_left else x0 + 1
        c.rect(px, 15, px + 1, 17, pupil)
        c.rect(x0, 14, x0 + 1, 15, WHITE)
        c.pts(iris[3], (x0 + 3, 18))
        c.hline(x0 + 1, x0 + 3, 20, skin[3])
    eye(12, True); eye(24, False)
    br = spec.get('brow', hair[3])
    c.pts(br, (12, 11), (13, 10), (14, 10), (15, 10), (16, 11)); c.pts(br, (24, 11), (25, 10), (26, 10), (27, 10), (28, 11))
    c.pts(skin[3], (20, 19))
    c.pts('#8f3c4b', (19, 22), (20, 23), (21, 22)); c.pts('#d9706f', (20, 22))
    c.pts(spec.get('blush', '#f48f93'), (11, 21), (12, 21), (13, 21), (27, 21), (28, 21), (29, 21))

    # ---- hair
    if spec.get('hair_fn'): spec['hair_fn'](c, hair, HC, HR)
    else: default_hair(c, hair, HC, HR)
    for (x, y) in ((12, 6), (13, 5), (14, 4), (15, 4), (16, 3), (17, 3), (18, 3), (11, 7), (10, 8), (10, 9)):
        if c.get(x, y)[3] and not spec.get('no_sheen'):
            c.put(x, y, hair[0])
    for x in range(12, 30):
        for y in range(8, 15):
            if c.get(x, y) in [hexc(s) for s in skin] and c.get(x, y - 1) in [hexc(s) for s in hair]:
                c.put(x, y, skin[3])
    if spec.get('head_top'): spec['head_top'](c)
    if spec.get('last'): spec['last'](c)

    c.ox = c.oy = 0
    outline_auto(c, tint=spec.get('tint', (46, 30, 74)))
    return c

def default_hair(c, H, HC, HR, bangs='std'):
    clump(c, cubic((17, 3), (12, 4), (8.5, 8), (8.5, 14)), 6.0, 1.4, H, HC, HR, w_mid=5.4, bias=0.08, flow=False)
    clump(c, cubic((24, 3), (28.5, 4), (31.5, 8), (31.5, 14)), 6.0, 1.4, H, HC, HR, w_mid=5.4, bias=-0.06, flow=False)
    clump(c, cubic((20, 3), (13, 3.5), (9.5, 8), (10.5, 13.5)), 5.2, 0.8, H, HC, HR, w_mid=4.8, bias=0.02, flow=False)
    clump(c, cubic((20.5, 3), (17.5, 5), (15.2, 8.5), (16.6, 12.6)), 6.4, 0.8, H, HC, HR, w_mid=5.6, bias=0.1, flow=False)
    clump(c, cubic((21.5, 3), (24, 5), (25.6, 8.5), (24.2, 12.0)), 5.6, 0.8, H, HC, HR, w_mid=5.0, bias=0.0, flow=False)
    clump(c, cubic((23, 3), (29, 3.5), (31.5, 8), (30.5, 13.5)), 5.2, 0.8, H, HC, HR, w_mid=4.8, bias=-0.06, flow=False)
    clump(c, cubic((9.5, 9), (7.2, 14), (8, 20), (10, 24.5)), 4.2, 0.8, H, HC, HR, w_mid=3.8, bias=0.0, flow=False)
    clump(c, cubic((30.5, 9), (32.8, 14), (32, 20), (30, 24.5)), 4.2, 0.8, H, HC, HR, w_mid=3.8, bias=-0.08, flow=False)
    clump(c, cubic((21, 3), (23, 0), (27, 1), (27, 4)), 2.6, 0.6, H, HC, HR, bias=0.1)
