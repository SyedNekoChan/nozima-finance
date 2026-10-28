"""Refined protagonist model prototype: Swordsman, front view, ONE static pose.
Native canvas 40x47. Same rendering approach as the round-2 samples (hue-shifted
selective outlines, clustered multi-tone shading). Chibi proportions: the head
(with hair) is about 56% of the height on a small, compact body."""
import math
from pixlib import Canvas, hexc, cubic, bez, paint_lock, clump, outline_auto

SKIN  = ['#fff1e4', '#fddec6', '#f3bba2', '#da9186', '#a9646c']
HAIR  = ['#a6bdf0', '#6f86cb', '#4d60a8', '#343f7b', '#1e2449']
TUNIC = ['#fffbf2', '#f3e8d3', '#dac8ad', '#ad9484', '#715c68']
STEEL = ['#f5f9ff', '#cfdcf0', '#94a8cb', '#5f739d', '#37436c']
LEATH = ['#e8b980', '#bd8656', '#895640', '#5d3a35', '#38242d']
RED   = ['#ffbaa2', '#f27d6f', '#cb4859', '#912b47', '#5a1a30']
GOLD  = ['#fff2b0', '#f5cf5f', '#cf9a35', '#8f5f2b']
IRIS  = ['#8e4a1a', '#c47a22', '#ee9f2e', '#f7c25c']
SLEEVE = ['#f6e8cf', '#e4d0ab', '#c9ae8a', '#9d816f', '#665060']
LASH  = '#3a1f33'
WHITE = '#fffdf4'
CX = 20   # centre column; the figure is built around x = 19.5..20.5

def span(c, y, half, ramp, fold=None, light=0.3, shade=0.72):
    """One torso/leg row from CX-half to CX+half-1, shaded left (lit) to right (shadow)."""
    x0, x1 = CX - int(half), CX + int(half) - 1
    n = max(1, x1 - x0)
    for x in range(x0, x1 + 1):
        t = (x - x0) / n
        idx = 0 if t < light * 0.45 else (1 if t < light else (2 if t < shade else (3 if t < 0.94 else 4)))
        c.put(x, y, ramp[idx])

def build():
    c = Canvas(40, 47)
    L = (-0.62, -0.78)

    # ------------------------------------------------------------ nape hair behind the neck
    c.rect(15, 23, 24, 26, HAIR[3])

    # ------------------------------------------------------------ legs: short trousers, short boots
    TR = ['#6d88b0', '#53709a', '#3c577f', '#293f65', '#1a2a4a']
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
                c.put(x, y, LEATH[idx])
        c.ellipse(xc + sx * 0.3, 44.0, 3.0, 1.7, LEATH, light=L, cuts=(0.7, 0.3, -0.1, -0.5))   # toe
        c.hline(int(round(xc - 2.2)), int(round(xc + 2.2)), 45, LEATH[4])                         # sole
        c.pts(STEEL[1], (int(round(xc)), 42))                                                     # buckle glint

    # ------------------------------------------------------------ sheathed sword behind the hip
    paint_lock(c, bez((25.5, 33.5), (28.2, 38), (29, 42.5)), 2.4, 1.6, LEATH, L, tip_dark=False)
    c.pts(STEEL[2], (29, 43), (28, 43)); c.pts(STEEL[4], (29, 44))

    # ------------------------------------------------------------ torso: small, tapered
    half = {27: 2.8, 28: 5.0, 29: 6.2, 30: 6.5, 31: 6.3, 32: 5.9, 33: 5.4, 34: 5.4, 35: 6.0}
    for y, h in half.items():
        span(c, y, h, TUNIC)
    for x in range(14, 27, 3):
        c.pts(TUNIC[4], (x, 35), (x + 1, 35))                                       # scalloped hem
    c.vline(21, 33, 35, TUNIC[3]); c.vline(17, 34, 35, TUNIC[3])
    # breastplate: small shaped panel
    ST = ['#cfdcf0', '#a3b8dc', '#7a92bd', '#52688f', '#33406a']
    gh = {29: 2.8, 30: 3.3, 31: 3.3, 32: 2.8}
    for y, h in gh.items():
        span(c, y, h, ST, light=0.36, shade=0.72)
    c.hline(CX - 2, CX + 1, 29, STEEL[0]); c.pts(STEEL[1], (CX - 3, 30))
    c.vline(CX, 30, 32, ST[3]); c.pts(ST[4], (CX - 2, 32), (CX + 1, 32))
    c.pts(TUNIC[3], (CX - 1, 28), (CX, 28), (CX + 1, 28))                         # collar opening
    # sash + belt + buckle
    span(c, 33, 5.4, RED, light=0.3, shade=0.72)
    span(c, 34, 5.6, LEATH, light=0.3, shade=0.72)
    c.rect(CX - 1, 33, CX + 1, 34, GOLD[2]); c.pts(GOLD[0], (CX - 1, 33)); c.pts(GOLD[3], (CX + 1, 34)); c.pts(LEATH[4], (CX, 34))
    paint_lock(c, bez((24.5, 33.5), (26, 37), (25.2, 41)), 2.4, 1.2, RED, L, tip_dark=True)     # sash tail

    # ------------------------------------------------------------ short arms with readable hands
    paint_lock(c, bez((14.4, 28.5), (12.4, 31.5), (12.8, 34)), 3.3, 2.5, SLEEVE, L, tip_dark=False)
    paint_lock(c, bez((12.6, 33), (12.5, 34.4), (12.8, 35.4)), 2.8, 2.6, LEATH, L, tip_dark=False)    # bracer
    c.ellipse(12.8, 37.0, 1.9, 1.9, SKIN, light=L, cuts=(0.8, 0.3, -0.2, -0.6))                       # hand
    c.pts(SKIN[3], (12, 38), (13, 38))
    paint_lock(c, bez((25.6, 28.5), (27.6, 31.5), (27.2, 34)), 3.3, 2.5, SLEEVE, L, tip_dark=False)
    c.hline(26, 28, 34, SLEEVE[3])
    c.ellipse(27.2, 36.4, 1.9, 1.9, SKIN, light=L, cuts=(0.7, 0.25, -0.25, -0.6))
    # pauldron on the sword arm (viewer-left)
    c.ellipse(13.6, 29.0, 2.4, 1.7, ST, light=L, cuts=(0.7, 0.3, -0.1, -0.5))
    c.pts(STEEL[1], (12, 28), (13, 28), (14, 28)); c.pts(ST[4], (15, 29), (14, 30))
    # hilt peeking above the sheath at the hip (viewer-right)
    c.rect(27, 32, 28, 33, LEATH[3]); c.pts(LEATH[1], (27, 32))

    # ------------------------------------------------------------ neck (small, mostly under the chin)
    c.rect(18, 26, 22, 27, SKIN[3]); c.rect(18, 26, 20, 26, SKIN[2])
    c.pts(TUNIC[1], (16, 27), (17, 27)); c.pts(TUNIC[3], (23, 27), (24, 27))

    # ------------------------------------------------------------ head: the dominant feature
    c.ellipse(20, 13.6, 12.6, 11.6, HAIR, light=L, cuts=(0.97, 0.72, 0.32, -0.08))          # hair cap following the skull
    c.ellipse(20, 16.4, 12.4, 10.0, SKIN, light=L, cuts=(0.84, 0.22, -0.4, -0.78),
              mask=lambda x, y: abs((x - 20) / 11.3) ** 2.6 + abs((y - 16.4) / 9.0) ** 2.6 <= 1)   # face: rounded, full-cheeked
    c.pts(SKIN[3], (11, 22), (12, 23), (13, 24)); c.hline(15, 25, 25, SKIN[3]); c.hline(17, 23, 26, SKIN[4])   # jaw / chin shade
    c.pts(SKIN[2], (8, 17), (8, 18), (32, 17), (32, 18))                                      # ears, mostly under the side locks

    def eye(x0, outer_left):
        # lid line with a tiny flick at the outer corner
        c.hline(x0 + (0 if outer_left else 1), x0 + (3 if outer_left else 4), 13, LASH)
        c.pts(LASH, (x0 - 1, 14)) if outer_left else c.pts(LASH, (x0 + 5, 14))
        rows = ((14, IRIS[0], 1, 3), (15, IRIS[1], 0, 4), (16, IRIS[1], 0, 4), (17, IRIS[2], 0, 4), (18, IRIS[2], 0, 4), (19, IRIS[2], 1, 3))
        for y, col, a, b in rows:
            c.hline(x0 + a, x0 + b, y, col)
        sx = x0 - 1 if outer_left else x0 + 5
        for y in (15, 16, 17, 18):
            c.put(sx, y, '#e9eefb')                                   # sclera sliver on the outer side
        px = x0 + 2 if outer_left else x0 + 1
        c.rect(px, 15, px + 1, 17, '#2a1109')                         # small pupil
        c.rect(x0, 14, x0 + 1, 15, WHITE)                             # catchlight
        c.pts('#fff0c2', (x0 + 3, 18))
        c.hline(x0 + 1, x0 + 3, 20, SKIN[3])                          # lower lid line
    eye(12, True); eye(24, False)
    c.pts(HAIR[3], (12, 11), (13, 10), (14, 10), (15, 10), (16, 11)); c.pts(HAIR[3], (24, 11), (25, 10), (26, 10), (27, 10), (28, 11))
    c.pts(SKIN[3], (20, 19))
    c.pts('#8f3c4b', (19, 22), (20, 23), (21, 22)); c.pts('#d9706f', (20, 22))
    c.pts('#f48f93', (11, 21), (12, 21), (13, 21), (27, 21), (28, 21), (29, 21))

    HC, HR = (20, 13), 14
    # crown clumps give the cap its volume lines
    clump(c, cubic((17, 3), (12, 4), (8.5, 8), (8.5, 14)), 6.0, 1.4, HAIR, HC, HR, w_mid=5.4, bias=0.08, flow=False)
    clump(c, cubic((24, 3), (28.5, 4), (31.5, 8), (31.5, 14)), 6.0, 1.4, HAIR, HC, HR, w_mid=5.4, bias=-0.06, flow=False)
    # bangs: four pointed tips of different lengths around a small parting; a little forehead shows
    clump(c, cubic((20, 3), (13, 3.5), (9.5, 8), (10.5, 13.5)), 5.2, 0.8, HAIR, HC, HR, w_mid=4.8, bias=0.02, flow=False)
    clump(c, cubic((20.5, 3), (17.5, 5), (15.2, 8.5), (16.6, 12.6)), 6.4, 0.8, HAIR, HC, HR, w_mid=5.6, bias=0.1, flow=False)
    clump(c, cubic((21.5, 3), (24, 5), (25.6, 8.5), (24.2, 12.0)), 5.6, 0.8, HAIR, HC, HR, w_mid=5.0, bias=0.0, flow=False)
    clump(c, cubic((23, 3), (29, 3.5), (31.5, 8), (30.5, 13.5)), 5.2, 0.8, HAIR, HC, HR, w_mid=4.8, bias=-0.06, flow=False)
    clump(c, cubic((9.5, 9), (7.2, 14), (8, 20), (10, 24.5)), 4.2, 0.8, HAIR, HC, HR, w_mid=3.8, bias=0.0, flow=False)
    clump(c, cubic((30.5, 9), (32.8, 14), (32, 20), (30, 24.5)), 4.2, 0.8, HAIR, HC, HR, w_mid=3.8, bias=-0.08, flow=False)
    clump(c, cubic((21, 3), (23, 0), (27, 1), (27, 4)), 2.6, 0.6, HAIR, HC, HR, bias=0.1)
    for (x, y) in ((12, 6), (13, 5), (14, 4), (15, 4), (16, 3), (17, 3), (18, 3), (11, 7), (10, 8), (10, 9)):
        if c.get(x, y)[3]:
            c.put(x, y, HAIR[0])
    for x in range(12, 30):
        for y in range(8, 15):
            if c.get(x, y) in [hexc(s) for s in SKIN] and c.get(x, y - 1) in [hexc(s) for s in HAIR]:
                c.put(x, y, SKIN[3])

    outline_auto(c)
    return c

if __name__ == '__main__':
    import sys
    build().save(sys.argv[1] if len(sys.argv) > 1 else 'model_swordsman.png')
