"""Representative protagonist review sample: Swordsman variant, front view
(facing down), single idle pose. 40x52 canvas, hand-authored with locks."""
from pixlib import Canvas, hexc, bez, paint_lock, outline_auto, dither, cubic, clump

SKIN   = ['#fff1e4', '#fddec6', '#f3bba2', '#da9186', '#a9646c']
HAIR   = ['#ffdcba', '#f8b384', '#dc8259', '#ab544d', '#69324b']
CLOTH  = ['#dbf1c8', '#a4d594', '#65a972', '#41766a', '#294d52']      # forest-green tunic
SCARF  = ['#fffcf4', '#f4e9d6', '#dccab0', '#b09685', '#76606c']      # cream cowl
LEATH  = ['#e8b980', '#bd8656', '#895640', '#5d3a35', '#38242d']
METAL  = ['#ffffff', '#dfe6f1', '#a1adc4', '#66718b', '#373e58']
GOLD   = ['#fff2b0', '#f5cf5f', '#cf9a35', '#8f5f2b']
IRIS   = ['#16414c', '#2b8084', '#69cfbd', '#c8f7e9']
OUTL   = '#150f21'
LASH   = '#3a1f33'
WHITE  = '#fffaea'
LAV    = '#dfe3f8'   # sclera sliver

def build():
    c = Canvas(58, 70)
    c.ox = 12   # margin on the left for the wind-swept ponytail
    c.oy = 7    # margin on top so the crown is not clipped
    L = (-0.62, -0.78)

    c.oy = 11   # body is authored for a shorter figure; lowered to give the torso and legs room
    # ------------------------------------------------------------ legs/boots
    for x0, lit in ((12, True), (22, False)):
        c.rect(x0, 44, x0 + 5, 49, CLOTH[3])
        c.vline(x0, 44, 49, CLOTH[2] if lit else CLOTH[3]); c.vline(x0 + 5, 44, 49, CLOTH[4])
        c.pts(CLOTH[4], (x0 + 1, 47), (x0 + 2, 47), (x0 + 3, 48))                                                  # knee crease
        c.rect(x0 - 1, 49, x0 + 6, 53, LEATH[2])
        c.hline(x0 - 1, x0 + 6, 49, LEATH[0]); c.hline(x0 - 1, x0 + 6, 50, LEATH[1])
        c.vline(x0 - 1, 51, 53, LEATH[1]); c.vline(x0 + 6, 51, 53, LEATH[4]); c.vline(x0 + 5, 51, 53, LEATH[3])
        c.hline(x0 - 1, x0 + 6, 53, LEATH[4])
        c.hline(x0 + 1, x0 + 4, 51, LEATH[3]); c.pts(METAL[1], (x0 + 2, 51)); c.pts(METAL[3], (x0 + 3, 51))   # strap + buckle
        c.pts(LEATH[0], (x0, 52))

    # ------------------------------------------------------------ tunic body
    for y in range(27, 45):
        half = 10 if y < 38 else 9
        for x in range(20 - half, 20 + half):
            t = (x - (20 - half)) / (2 * half - 1)
            idx = 1 if t < 0.26 else (2 if t < 0.62 else 3)
            if t > 0.88: idx = 4
            c.put(x, y, CLOTH[idx])
    # hem with scallops
    c.hline(11, 28, 44, CLOTH[3])
    for x in range(11, 29, 3):
        c.pts(CLOTH[4], (x, 44), (x + 1, 44))
    # folds: dark creases with a lit edge beside them
    for (x, y0, y1) in ((15, 36, 43), (24, 34, 43), (19, 39, 43)):
        c.vline(x, y0, y1, CLOTH[4]); c.vline(x - 1, y0 + 1, y1, CLOTH[1] if x < 20 else CLOTH[2])
    c.pts(CLOTH[0], (11, 32), (12, 32), (13, 32), (11, 33), (12, 33), (11, 34))         # shoulder sheen
    c.pts(CLOTH[0], (13, 38), (14, 38), (13, 39))
    # chest lacing + trim
    c.vline(19, 32, 37, LEATH[3]); c.vline(20, 32, 37, LEATH[4])
    for y in (33, 35, 37):
        c.hline(18, 21, y, LEATH[1]); c.pts(LEATH[0], (18, y)); c.pts(LEATH[4], (21, y))
    # belt, buckle, pouch
    c.rect(10, 39, 29, 41, LEATH[2]); c.hline(10, 29, 39, LEATH[0]); c.hline(10, 29, 40, LEATH[1]); c.hline(10, 29, 41, LEATH[3])
    c.rect(18, 38, 21, 42, METAL[2]); c.rect(19, 39, 20, 41, LEATH[4]); c.hline(18, 21, 38, METAL[0]); c.vline(18, 38, 42, METAL[1]); c.vline(21, 39, 42, METAL[4])
    c.rect(25, 41, 28, 45, LEATH[1]); c.hline(25, 28, 41, LEATH[0]); c.vline(28, 42, 45, LEATH[3]); c.hline(25, 28, 45, LEATH[4]); c.pts(METAL[1], (26, 43), (27, 43)); c.pts(METAL[3], (27, 44))

    # ------------------------------------------------------------ arms
    # viewer-left arm (lit)
    c.rect(5, 29, 10, 40, CLOTH[2]); c.vline(5, 30, 40, CLOTH[1]); c.vline(10, 30, 40, CLOTH[3]); c.hline(5, 10, 29, CLOTH[1])
    c.pts(CLOTH[0], (5, 30), (6, 29), (7, 29), (6, 30)); c.hline(6, 9, 36, CLOTH[3]); c.pts(CLOTH[1], (6, 35), (7, 35)); c.vline(8, 32, 34, CLOTH[3])
    c.rect(5, 38, 10, 42, LEATH[2]); c.hline(5, 10, 38, LEATH[0]); c.vline(5, 39, 42, LEATH[1]); c.vline(10, 39, 42, LEATH[4]); c.hline(5, 10, 42, LEATH[4])
    c.pts(METAL[1], (7, 40), (8, 40)); c.pts(METAL[3], (8, 41))
    c.rect(5, 43, 10, 45, SKIN[2]); c.hline(5, 10, 43, SKIN[1]); c.pts(SKIN[0], (5, 43), (6, 43)); c.vline(10, 44, 45, SKIN[3]); c.hline(6, 9, 45, SKIN[3]); c.pts(SKIN[3], (7, 44), (8, 44))
    # viewer-right arm (shade)
    c.rect(29, 29, 34, 40, CLOTH[3]); c.vline(29, 30, 40, CLOTH[2]); c.vline(34, 30, 40, CLOTH[4]); c.hline(29, 34, 29, CLOTH[2])
    c.pts(CLOTH[1], (29, 30), (30, 29)); c.hline(30, 33, 36, CLOTH[4]); c.vline(32, 32, 34, CLOTH[4])
    c.rect(29, 38, 34, 42, LEATH[3]); c.hline(29, 34, 38, LEATH[1]); c.vline(29, 39, 42, LEATH[2]); c.vline(34, 39, 42, LEATH[4]); c.hline(29, 34, 42, LEATH[4])
    c.pts(METAL[2], (31, 40), (32, 40)); c.pts(METAL[4], (32, 41))
    c.rect(29, 43, 34, 45, SKIN[3]); c.hline(29, 34, 43, SKIN[2]); c.vline(34, 44, 45, SKIN[4]); c.hline(30, 33, 45, SKIN[4]); c.pts(SKIN[4], (31, 44), (32, 44))

    # recurve bow held at the viewer-left hand
    paint_lock(c, bez((3, 30), (-3, 43), (4, 56)), 2.8, 1.6, LEATH, L, w_mid=3.4, tip_dark=False)
    for (x, y) in ((3, 31), (3, 32), (3, 33), (4, 34), (4, 38), (4, 44), (4, 50), (4, 54), (4, 55)):
        c.put(x, y, METAL[1])                                   # string
    c.pts(GOLD[1], (0, 42), (0, 43), (1, 42), (1, 44)); c.pts(GOLD[3], (1, 43))   # grip wrap
    c.pts(LEATH[0], (1, 36), (0, 38), (2, 33))

    c.oy = 7
    # ------------------------------------------------------------ neck + scarf
    c.rect(17, 28, 22, 31, SKIN[3]); c.rect(17, 28, 19, 30, SKIN[2]); c.hline(17, 22, 31, SKIN[4])
    c.rect(12, 30, 27, 33, SCARF[2]); c.hline(12, 27, 30, SCARF[1]); c.hline(12, 27, 33, SCARF[3])
    c.pts(SCARF[0], (12, 30), (13, 30), (14, 30), (15, 30), (12, 31)); c.pts(SCARF[4], (26, 33), (27, 33), (27, 32), (27, 31))
    c.vline(18, 31, 32, SCARF[3]); c.vline(23, 31, 32, SCARF[1])                         # wrap creases
    # tail on the shaded side
    c.rect(26, 33, 29, 45, SCARF[2]); c.vline(26, 33, 45, SCARF[1]); c.vline(29, 34, 45, SCARF[3])
    c.hline(26, 29, 46, SCARF[3]); c.pts(SCARF[4], (26, 46), (28, 46), (29, 45), (29, 46)); c.pts(SCARF[0], (26, 34), (26, 35), (26, 36), (26, 38))
    c.pts(SCARF[3], (27, 38), (27, 39), (28, 41), (27, 43)); c.pts(SCARF[4], (27, 47), (28, 47)); c.pts(SCARF[2], (27, 40))

    # ------------------------------------------------------------ hair (back)
    HC, HR = (20, 15), 19          # light falloff centre / radius for the whole head of hair
    c.ellipse(20, 15.5, 16.2, 14.6, HAIR, light=L, cuts=(0.99, 0.78, 0.4, -0.05))
    # long lock on the near side and a short one on the far side, behind the face
    clump(c, cubic((32, 9), (39, 16), (37, 28), (34, 38)), 9, 1.4, HAIR, HC, HR, w_mid=8.5, bias=-0.1)
    clump(c, cubic((9, 9), (3, 16), (5, 24), (8, 29)), 7, 1.2, HAIR, HC, HR, w_mid=6.5, bias=-0.05)

    # ------------------------------------------------------------ face
    c.ellipse(20, 20, 11.6, 9.6, SKIN, light=L, cuts=(0.82, 0.2, -0.42, -0.8))
    c.pts(SKIN[2], (8, 21), (8, 22), (9, 22), (31, 21), (31, 22), (30, 22))             # ears hint (mostly hidden by locks)
    # jaw shade
    c.hline(14, 26, 29, SKIN[3]); c.pts(SKIN[4], (18, 29), (19, 29), (20, 29), (21, 29))

    # ------------------------------------------------------------ eyes (7w x 9h)
    def eye(x0, mirror):
        cols = list(range(x0, x0 + 7))
        # sclera slivers + lid
        c.hline(x0, x0 + 6, 17, LASH)                       # upper lid line
        c.pts(LASH, (x0 - 1, 18) if not mirror else (x0 + 7, 18), (x0 - 1, 17) if not mirror else (x0 + 7, 17))   # lash flick, outer corner
        c.hline(x0 + 1, x0 + 5, 18, SKIN[3])               # lid crease shadow
        for y in range(20, 25):
            c.put(x0, y, LAV); c.put(x0 + 6, y, LAV)
        # iris: 5 wide, rows 18..25 with rounded top and bottom
        spans = {18: (2, 4), 19: (1, 5), 20: (1, 5), 21: (1, 5), 22: (1, 5), 23: (1, 5), 24: (1, 5), 25: (2, 4)}
        rows = {18: IRIS[0], 19: IRIS[0], 20: IRIS[0], 21: IRIS[1], 22: IRIS[1], 23: IRIS[2], 24: IRIS[2], 25: IRIS[3]}
        for y, (a, b) in spans.items():
            c.hline(x0 + a, x0 + b, y, rows[y])
        # darker limbal ring on the sides
        for y in range(19, 25):
            c.put(x0 + 1, y, IRIS[0] if y < 23 else IRIS[1]); c.put(x0 + 5, y, IRIS[0] if y < 23 else IRIS[1])
        # pupil
        c.rect(x0 + 2, 20, x0 + 4, 22, '#26100a')
        # catchlights
        hx = x0 + 1 if not mirror else x0 + 1
        c.rect(hx, 19, hx + 1, 20, WHITE)
        c.put(x0 + 4 if not mirror else x0 + 4, 24, '#fff0c2')
        c.put(x0 + 3, 23, IRIS[3])
        # lower lid
        c.hline(x0 + 1, x0 + 5, 26, SKIN[3])
    eye(10, False); eye(23, True)
    # brows (hair-coloured, slightly tilted, partly under the fringe)
    c.pts(HAIR[3], (10, 16), (11, 15), (12, 14), (13, 14), (14, 15)); c.pts(HAIR[3], (29, 16), (28, 15), (27, 14), (26, 14), (25, 15))   # arched, friendly brows
    # nose, mouth, blush
    c.pts(SKIN[3], (20, 24))
    c.pts('#8f3c4b', (18, 27), (19, 28), (20, 28), (21, 28), (22, 27)); c.pts('#d9706f', (19, 27), (20, 27), (21, 27))
    c.pts('#ee8f8f', (11, 26), (12, 26), (13, 26), (26, 26), (27, 26), (28, 26)); c.pts('#f6b6a7', (11, 25), (28, 25))

    # ------------------------------------------------------------ front hair locks
    E = HAIR[4]
    HC, HR = (20, 15), 19
    # high ponytail: a dark under-mass for depth, then separate fanned clumps with gaps between them
    clump(c, cubic((12, 8), (0, 5), (-8, 14), (-8, 26)), 10, 1.5, HAIR, HC, HR, w_mid=9, bias=-0.75, flow=False, edge_dark=False)
    clump(c, cubic((12, 6), (1, -3), (-9, 1), (-14, 12)), 7, 0.8, HAIR, HC, HR, w_mid=6.5, bias=0.05)
    clump(c, cubic((12, 8), (1, 4), (-9, 12), (-9, 27)), 8.5, 0.9, HAIR, HC, HR, w_mid=8, bias=-0.02)
    clump(c, cubic((11, 10), (3, 12), (-2, 20), (-1, 33)), 6, 0.8, HAIR, HC, HR, w_mid=5.5, bias=-0.14)
    clump(c, cubic((12, 9), (5, 6), (-3, 6), (-9, 3)), 4, 0.6, HAIR, HC, HR, bias=0.12)
    # bangs: two narrower sweeps over the viewer-left brow, one on the right, a small lock between the eyes
    clump(c, cubic((25, 2), (14, 1), (6, 7), (8, 14)), 8, 1.2, HAIR, HC, HR, w_mid=7.5, bias=-0.04)
    clump(c, cubic((25, 3), (18, 3), (12, 7), (13, 13)), 7, 1.0, HAIR, HC, HR, bias=0.08)
    clump(c, cubic((25, 2), (31, 2), (34, 7), (30, 13)), 8, 1.2, HAIR, HC, HR, w_mid=7, bias=-0.06)
    clump(c, cubic((24, 4), (22, 8), (22, 12), (20, 17)), 4.5, 0.9, HAIR, HC, HR, bias=0.04)
    clump(c, cubic((23, 2), (27, -3), (31, -1), (31, 4)), 3.4, 0.6, HAIR, HC, HR, bias=0.1)       # crown wisp
    # side locks framing the face
    clump(c, cubic((8, 8), (3, 14), (3, 21), (6, 26)), 6.5, 1.0, HAIR, HC, HR, w_mid=5.5, bias=0.02)
    clump(c, cubic((32, 8), (38, 16), (37, 28), (35, 38)), 8.5, 1.0, HAIR, HC, HR, w_mid=7.5, bias=-0.08)
    # head-form sheen: a stepped highlight arc across the crown, dithered into the mid tone
    for (x, y) in ((12, 5), (13, 4), (14, 3), (15, 3), (16, 2), (17, 2), (18, 2), (11, 6), (10, 7), (9, 8), (9, 9)):
        if c.get(x, y)[3] and c.get(x, y) != hexc(HAIR[0]):
            c.put(x, y, HAIR[0])
    for (x, y) in ((13, 5), (14, 4), (15, 4), (16, 3), (10, 8), (10, 9), (19, 3), (20, 3)):
        if c.get(x, y)[3] and (x + y) % 2 == 0:
            c.put(x, y, HAIR[0])
    c.rect(9, 4, 12, 8, GOLD[2]); c.hline(9, 12, 4, GOLD[0]); c.vline(9, 4, 8, GOLD[1]); c.vline(12, 5, 8, GOLD[3]); c.hline(9, 12, 8, GOLD[3]); c.pts('#3aa38f', (10, 6), (11, 6))   # hair clasp
    # fringe cast shadow on the forehead
    for x in range(11, 30):
        for y in range(8, 20):
            if c.get(x, y) in [hexc(s) for s in HAIR]:
                continue
            below = c.get(x, y - 1)
            if below in [hexc(s) for s in HAIR] and c.get(x, y) in [hexc(s) for s in SKIN]:
                c.put(x, y, SKIN[2])
    # ------------------------------------------------------------ outline: colour-shifted, lost on lit edges
    c.ox = c.oy = 0
    outline_auto(c)
    return c


if __name__ == '__main__':
    import sys
    c = build()
    c.save(sys.argv[1] if len(sys.argv) > 1 else 'protagonist.png')
