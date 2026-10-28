"""Representative creature review sample: 'Emberfox' (a Fire kit), a review
sample only, not an approved species. Front view, sitting idle, 52x46."""
from pixlib import Canvas, hexc, bez, paint_lock

FUR   = ['#ffe0ab', '#ffb862', '#f58a30', '#cb5a22', '#8c3519']
CREAM = ['#fffaf0', '#f8e4c0', '#e1c394', '#b99269', '#8a6648']
DARK  = ['#6a3d37', '#4b2a2a', '#2f1a1d']
FLAME = ['#fff8bd', '#ffd953', '#ff9f33', '#ea5421', '#a02b1e']
IRIS  = ['#0f4538', '#1c8467', '#4fd1a1', '#bdf7d8']
OUTL  = '#2a0f13'
WHITE = '#fffdf2'

def build():
    c = Canvas(52, 46)
    c.ox, c.oy = 4, 4   # authored with a margin so ears, tail and flame are not clipped
    L = (-0.6, -0.78)

    # ---- tail (behind everything): curved bush with a flame tip
    paint_lock(c, bez((28, 34), (44, 33), (40, 15)), 11, 5, FUR, L, w_mid=10, tip_dark=False)
    paint_lock(c, bez((33, 30), (40, 27), (38, 17)), 5, 2, [FUR[0], FUR[1], FUR[1], FUR[2]], L, tip_dark=False)   # tail sheen
    # cream tail band
    for (x, y) in ((40, 22), (41, 22), (42, 23), (41, 24), (40, 24), (39, 23), (38, 24), (39, 25)):
        c.put(x, y, CREAM[1])
    paint_lock(c, bez((39, 17), (43, 11), (40, 3)), 8, 0.6, FLAME, L, w_mid=7, tip_dark=False)                    # flame
    paint_lock(c, bez((39, 16), (41, 11), (40, 6)), 4, 0.5, [FLAME[0], FLAME[0], FLAME[1], FLAME[1]], L, tip_dark=False)
    paint_lock(c, bez((35, 18), (36, 14), (34, 11)), 4, 0.5, FLAME, L, tip_dark=False)                           # side flicker

    # ---- hind haunches
    c.ellipse(11.5, 33, 6.2, 6, FUR, light=L, cuts=(0.85, 0.5, 0.05, -0.45))
    c.ellipse(28.5, 33, 6.2, 6, FUR, light=L, cuts=(0.7, 0.3, -0.1, -0.5))
    # ---- body
    c.ellipse(20, 29, 10.8, 9.2, FUR, light=L, cuts=(0.86, 0.5, 0.05, -0.45))
    # cream belly + chest ruff
    c.ellipse(20, 31, 6, 7, CREAM, light=L, cuts=(0.8, 0.35, -0.2, -0.6))
    # front legs with dark socks and paws
    for x0, lit in ((14, True), (22, False)):
        c.rect(x0, 30, x0 + 3, 36, FUR[2] if lit else FUR[3])
        c.vline(x0, 30, 36, FUR[1] if lit else FUR[2]); c.vline(x0 + 3, 31, 36, FUR[4])
        c.rect(x0 - 1, 35, x0 + 4, 38, DARK[1]); c.hline(x0 - 1, x0 + 4, 35, DARK[0]); c.hline(x0 - 1, x0 + 4, 38, DARK[2])
        c.pts(CREAM[2], (x0, 37), (x0 + 2, 37)); c.pts(DARK[2], (x0 + 1, 37), (x0 + 3, 37))         # toe separations
        c.pts(CREAM[0], (x0, 35))
    # chest ruff tufts
    for sp, w0, w1 in ((bez((16, 25), (14, 29), (15, 33)), 4, 0.8), (bez((20, 26), (20, 30), (20, 34)), 4, 0.8), (bez((24, 25), (26, 29), (25, 33)), 4, 0.8)):
        paint_lock(c, sp, w0, w1, CREAM, L, tip_dark=True)

    # ---- ears (behind head)
    paint_lock(c, bez((12, 11), (8, 5), (8, -1)), 9, 1.0, FUR, L, w_mid=8)
    paint_lock(c, bez((28, 11), (32, 5), (32, -1)), 9, 1.0, FUR, L, w_mid=8)
    paint_lock(c, bez((12, 10), (10, 6), (10, 1)), 4.5, 0.6, [CREAM[1], CREAM[2], '#d99a8a', '#a8625c'], L, tip_dark=False)   # inner ear
    paint_lock(c, bez((28, 10), (30, 6), (30, 1)), 4.5, 0.6, [CREAM[1], CREAM[2], '#d99a8a', '#a8625c'], L, tip_dark=False)
    for (x, y) in ((8, 0), (9, 0), (32, 0), (31, 0), (8, 1), (32, 1)):
        c.put(x, y, DARK[1])                                                                           # dark ear tips

    # ---- head
    c.ellipse(20, 15.5, 12.4, 9.4, FUR, light=L, cuts=(0.86, 0.5, 0.06, -0.42))
    # cheek ruff: short cream clumps stacked on each side
    for (x0, y0, x1, y1, w) in ((10, 16, 5, 19, 6), (10, 19, 4, 23, 6), (11, 22, 6, 26, 5)):
        paint_lock(c, bez((x0, y0), ((x0 + x1) / 2 - 1, (y0 + y1) / 2 + 1), (x1, y1)), w, 1.2, CREAM, L)
    for (x0, y0, x1, y1, w) in ((30, 16, 35, 19, 6), (30, 19, 36, 23, 6), (29, 22, 34, 26, 5)):
        paint_lock(c, bez((x0, y0), ((x0 + x1) / 2 + 1, (y0 + y1) / 2 + 1), (x1, y1)), w, 1.2, CREAM, L)
    # muzzle + nose
    c.ellipse(20, 19.8, 6.4, 4.2, CREAM, light=L, cuts=(0.8, 0.3, -0.3, -0.7))
    c.rect(19, 17, 21, 18, DARK[2]); c.pts(DARK[1], (18, 17), (22, 17)); c.pts('#8a6670', (19, 17)); c.pts(WHITE, (19, 17))
    c.pts(DARK[1], (20, 19), (20, 20), (18, 21), (19, 21), (21, 21), (22, 21), (17, 20), (23, 20))      # mouth
    c.pts('#e7948f', (20, 21), (21, 22))                                                              # tongue tip
    # whisker dots
    c.pts(CREAM[3], (15, 20), (14, 21), (25, 20), (26, 21))
    # forehead ember mark
    c.pts(FLAME[2], (20, 8), (19, 9), (20, 9), (21, 9), (20, 10)); c.pts(FLAME[1], (20, 9)); c.pts(FLAME[3], (19, 10), (21, 10), (20, 11)); c.pts(FLAME[0], (20, 8))

    # ---- eyes (7w x 8h)
    def eye(x0, mirror):
        c.hline(x0 + 2, x0 + 4, 11, OUTL)                           # short lid line
        c.put(x0 + 1 if not mirror else x0 + 5, 12, OUTL); c.put(x0 - 1 if not mirror else x0 + 7, 13, OUTL)   # lash flick
        spans = {12: (2, 4), 13: (1, 5), 14: (0, 6), 15: (0, 6), 16: (0, 6), 17: (1, 5), 18: (1, 5), 19: (2, 4)}
        cols = {12: IRIS[0], 13: IRIS[0], 14: IRIS[0], 15: IRIS[1], 16: IRIS[1], 17: IRIS[2], 18: IRIS[2], 19: IRIS[3]}
        for y, (a, b) in spans.items():
            c.hline(x0 + a, x0 + b, y, cols[y])
        for y in (14, 15, 16):
            c.put(x0, y, IRIS[0]); c.put(x0 + 6, y, IRIS[0])         # darker limbal ring
        c.rect(x0 + 2, 14, x0 + 4, 16, '#10201c')                    # pupil
        c.rect(x0 + 1, 13, x0 + 2, 14, WHITE)                         # main catchlight
        c.put(x0 + 4, 17, IRIS[3]); c.put(x0 + 5, 18, '#e8fff0')     # reflected light
        c.hline(x0 + 1, x0 + 5, 20, FUR[3])                           # lower lid shadow
    eye(10, False); eye(24, True)
    # small brow tufts
    c.pts(CREAM[1], (12, 9), (13, 9), (26, 9), (27, 9)); c.pts(CREAM[2], (11, 10), (28, 10))

    c.ox = c.oy = 0
    c.outline(OUTL)
    return c

if __name__ == '__main__':
    import sys
    c = build()
    c.save(sys.argv[1] if len(sys.argv) > 1 else 'creature.png')
