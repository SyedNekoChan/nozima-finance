"""Representative protagonist review sample: Swordsman variant, front view
(facing down), single idle pose. 40x52 canvas, hand-authored with locks."""
from pixlib import Canvas, hexc, bez, paint_lock

SKIN   = ['#ffeadb', '#fbd5b9', '#eeb08f', '#cf846d', '#94524f']
HAIR   = ['#cfcdf7', '#9189d4', '#5f56a3', '#3a3470', '#1d1941']
CLOTH  = ['#a9ecd9', '#5fbcad', '#2f8d8e', '#1f606d', '#113845']
SCARF  = ['#ffb999', '#f2766a', '#cb4251', '#92273d', '#591729']
LEATH  = ['#e0aa68', '#ae7843', '#7f5032', '#56351f', '#2f1e16']
METAL  = ['#ffffff', '#d6deec', '#94a0b8', '#5a657c', '#2e3446']
IRIS   = ['#4d230d', '#96491a', '#e88f27', '#ffd065']
OUTL   = '#150f21'
WHITE  = '#fffaea'
LAV    = '#dfe3f8'   # sclera sliver

def build():
    c = Canvas(40, 58)
    L = (-0.62, -0.78)

    c.oy = 4   # body is authored for a shorter figure; lowered to give the torso and legs room
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

    # sheathed sword at the hip (viewer-left): grip, pommel, crossguard, scabbard tip
    c.rect(2, 36, 3, 39, LEATH[3]); c.vline(2, 36, 39, LEATH[2]); c.pts(METAL[1], (2, 40), (3, 40)); c.pts(METAL[3], (3, 41))        # pommel
    c.rect(0, 34, 5, 35, METAL[2]); c.hline(0, 5, 34, METAL[0]); c.hline(0, 5, 35, METAL[3]); c.pts(METAL[4], (5, 35)); c.pts(METAL[1], (1, 34))
    c.rect(3, 31, 4, 33, LEATH[2]); c.vline(3, 31, 33, LEATH[1])                                                                      # grip above guard
    c.pts(LEATH[4], (3, 32), (4, 33))
    # scabbard behind the arm, tip below
    c.rect(3, 43, 4, 49, LEATH[3]); c.vline(3, 43, 49, LEATH[2]); c.pts(METAL[2], (3, 50), (4, 50)); c.pts(METAL[4], (4, 50))

    c.oy = 0
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
    c.ellipse(20, 15.5, 16.2, 14.6, HAIR, light=L, cuts=(0.88, 0.52, 0.08, -0.4))
    # bob tails behind the jaw
    c.rect(5, 22, 9, 33, HAIR[2]); c.vline(5, 22, 33, HAIR[3]); c.vline(6, 22, 31, HAIR[1]); c.pts(HAIR[0], (6, 23), (6, 24), (7, 22))
    c.rect(30, 22, 34, 33, HAIR[3]); c.vline(34, 22, 33, HAIR[4]); c.vline(30, 22, 30, HAIR[2])
    c.pts(HAIR[4], (5, 33), (6, 33), (7, 32), (8, 33), (34, 33), (33, 33), (32, 32), (31, 33))
    for (x, y0, y1) in ((7, 26, 32), (32, 26, 32)):
        c.vline(x, y0, y1, HAIR[4])
    # back-hair sheen arc
    for (x, y) in ((9, 5), (10, 4), (11, 3), (12, 3), (13, 2), (8, 6), (7, 7), (7, 8), (6, 9), (6, 10), (6, 11), (6, 12)):
        c.put(x, y, HAIR[0])
    # shadow side
    for (x, y) in ((31, 6), (32, 8), (33, 10), (34, 13), (34, 16), (33, 19), (30, 4), (28, 3)):
        c.put(x, y, HAIR[4])

    # ------------------------------------------------------------ face
    c.ellipse(20, 20, 11.6, 9.6, SKIN, light=L, cuts=(0.82, 0.2, -0.42, -0.8))
    c.pts(SKIN[2], (8, 21), (8, 22), (9, 22), (31, 21), (31, 22), (30, 22))             # ears hint (mostly hidden by locks)
    # jaw shade
    c.hline(14, 26, 29, SKIN[3]); c.pts(SKIN[4], (18, 29), (19, 29), (20, 29), (21, 29))

    # ------------------------------------------------------------ eyes (7w x 9h)
    def eye(x0, mirror):
        cols = list(range(x0, x0 + 7))
        # sclera slivers + lid
        c.hline(x0, x0 + 6, 17, OUTL)                       # upper lid line
        c.pts(OUTL, (x0 - 1, 18) if not mirror else (x0 + 7, 18))   # lash flick, outer corner
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
    # left sweep over the forehead
    paint_lock(c, bez((22, 3), (8, 6), (9, 16)), 9, 2, HAIR, L, w_mid=7, edge=None)
    paint_lock(c, bez((21, 4), (12, 5), (13, 15)), 7, 1.5, HAIR, L, edge=None)
    # right sweep
    paint_lock(c, bez((19, 3), (30, 6), (31, 16)), 9, 2, HAIR, L, w_mid=7)
    paint_lock(c, bez((20, 4), (28, 5), (26, 15)), 7, 1.5, HAIR, L)
    # centre lock between the eyes and small cowlick
    paint_lock(c, bez((20, 4), (21, 10), (19, 18)), 5, 1.2, HAIR, L)
    paint_lock(c, bez((20, 2), (24, -1), (25, 3)), 3, 0.8, HAIR, L)
    # framing side locks
    paint_lock(c, bez((8, 8), (3, 18), (6, 31)), 7, 1.2, HAIR, L, w_mid=6)
    paint_lock(c, bez((32, 8), (37, 18), (34, 31)), 7, 1.2, HAIR, L, w_mid=6)
    # dark contour lines between locks
    for (x, y) in ((20, 8), (20, 9), (19, 10), (19, 11), (13, 7), (12, 9), (12, 11), (28, 7), (28, 9), (27, 11)):
        c.put(x, y, E)
    # fringe cast shadow on the forehead
    for x in range(11, 30):
        for y in range(8, 20):
            if c.get(x, y) in [hexc(s) for s in HAIR]:
                continue
            below = c.get(x, y - 1)
            if below in [hexc(s) for s in HAIR] and c.get(x, y) in [hexc(s) for s in SKIN]:
                c.put(x, y, SKIN[2])
    # sheen specks on the fringe
    for (x, y) in ((14, 5), (15, 4), (16, 4), (13, 7), (11, 9), (24, 4), (25, 5), (27, 8), (9, 11), (7, 14), (6, 18), (6, 22)):
        if c.opaque(x, y):
            c.put(x, y, HAIR[0])

    # ------------------------------------------------------------ outline
    c.outline(OUTL)
    out = Canvas(44, 58)
    out.im.paste(c.im, (2, 0))
    out.px = out.im.load()
    return out

if __name__ == '__main__':
    import sys
    c = build()
    c.save(sys.argv[1] if len(sys.argv) > 1 else 'protagonist.png')
