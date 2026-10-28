"""Creature sample #2: 'Gustwing' (a Wind kit), a review sample only, not an
approved species. Round-two direction: pastel palette, colour-shifted
selective outlines, large expressive eyes, asymmetric wind-swept feathers."""
from pixlib import Canvas, hexc, bez, paint_lock, outline_auto, dither, cubic, clump

CREAM = ['#ffffff', '#f7f5ff', '#e0e4f9', '#b9c1e4', '#7f86b6']
SKY   = ['#eaf7ff', '#bde3fb', '#82c0f1', '#5493d3', '#37609d']
MINT  = ['#e5fcec', '#b7edcb', '#7dd2a5', '#48a283', '#2c6c66']
LAV   = ['#f4eaff', '#d6c1f8', '#ad90e2', '#7b60b6', '#4d3d83']
GOLD  = ['#fff3b8', '#f7d062', '#d99b38', '#955f2b']
FEET  = ['#ffc9a1', '#f59b64', '#d06b49', '#8d4040']
IRIS  = ['#232d68', '#3d63bf', '#7db2f2', '#d1ebff']
LASH  = '#33265e'
WHITE = '#ffffff'

def build():
    c = Canvas(66, 58)
    c.ox, c.oy = 12, 4
    L = (-0.62, -0.78)

    # ---- tail ribbons streaming to the viewer's left (behind everything)
    BC, BR = (24, 28), 22
    clump(c, cubic((14, 38), (2, 38), (-4, 44), (-4, 55)), 8, 0.9, LAV, BC, BR, w_mid=7.5, bias=-0.05)
    clump(c, cubic((16, 40), (6, 45), (2, 50), (4, 57)), 6, 0.8, MINT, BC, BR, bias=-0.1)
    clump(c, cubic((13, 36), (2, 32), (-5, 36), (-8, 45)), 5, 0.7, SKY, BC, BR, bias=0.0)

    # ---- feet
    for x0 in (17, 27):
        c.ellipse(x0 + 2.5, 45, 3.4, 2.2, FEET, light=L, cuts=(0.7, 0.3, -0.1, -0.5))
        c.pts(FEET[3], (x0, 46), (x0 + 2, 47), (x0 + 4, 46))        # toe separations
    # ---- body
    c.ellipse(24, 34, 11.4, 10.2, SKY, light=L, cuts=(0.88, 0.5, 0.05, -0.4))
    c.ellipse(24, 37, 7.2, 7.4, CREAM, light=L, cuts=(0.8, 0.35, -0.2, -0.6))          # belly
    # wind-glyph on the belly: a small spiral of mint pixels
    for (x, y) in ((22, 33), (23, 32), (24, 32), (25, 33), (25, 34), (24, 35), (23, 35), (23, 34), (24, 34)):
        c.put(x, y, MINT[1])
    c.pts(MINT[2], (26, 35), (26, 36), (25, 37), (23, 37), (22, 36))

    # ---- wings: fanned primaries over a dark under-mass; the far wing is lifted a little
    clump(c, cubic((13, 32), (4, 32), (0, 40), (2, 48)), 11, 2, SKY, BC, BR, w_mid=10, bias=-0.55, flow=False, edge_dark=False)
    for (p, w) in ((((13, 30), (6, 26), (0, 30), (-1, 38)), 6), (((13, 33), (5, 33), (1, 41), (3, 49)), 6), (((14, 36), (9, 40), (8, 47), (10, 53)), 5)):
        clump(c, cubic(*p), w, 0.8, SKY, BC, BR, w_mid=w - 0.5, bias=0.02, tip_dark=False)
    clump(c, cubic((35, 31), (43, 29), (49, 35), (48, 44)), 11, 2, SKY, BC, BR, w_mid=10, bias=-0.55, flow=False, edge_dark=False)
    for (p, w) in ((((35, 29), (42, 23), (48, 26), (50, 34)), 6), (((35, 32), (44, 31), (48, 38), (46, 46)), 6), (((34, 35), (40, 39), (41, 46), (39, 52)), 5)):
        clump(c, cubic(*p), w, 0.8, SKY, BC, BR, w_mid=w - 0.5, bias=0.0, tip_dark=False)

    # ---- head
    c.ellipse(24, 19.5, 13.6, 11.6, SKY, light=L, cuts=(0.9, 0.56, 0.12, -0.35))
    c.ellipse(24, 23, 10.2, 7.6, CREAM, light=L, cuts=(0.8, 0.3, -0.25, -0.65))          # face mask
    # cheek fluff: short scalloped tufts, and chest fluff below the face
    HC2, HR2 = (24, 20), 15
    for (p, w) in ((((11, 20), (7, 21), (5, 24), (6, 27)), 5), (((11, 23), (7, 25), (6, 28), (8, 31)), 5), (((12, 26), (9, 29), (9, 32), (11, 34)), 4)):
        clump(c, cubic(*p), w, 0.9, CREAM, HC2, HR2, bias=0.15, flow=False)
    for (p, w) in ((((37, 20), (41, 21), (43, 24), (42, 27)), 5), (((37, 23), (41, 25), (42, 28), (40, 31)), 5), (((36, 26), (39, 29), (39, 32), (37, 34)), 4)):
        clump(c, cubic(*p), w, 0.9, CREAM, HC2, HR2, bias=0.2, flow=False)
    for (p, w) in ((((19, 29), (18, 32), (19, 35), (21, 38)), 4.5), (((29, 29), (30, 32), (29, 35), (27, 38)), 4.5)):
        clump(c, cubic(*p), w, 0.8, CREAM, BC, BR, bias=0.0, flow=False)
    # crown tufts swept by the wind
    clump(c, cubic((19, 9), (12, 3), (5, 5), (2, 10)), 7, 0.8, SKY, BC, BR, w_mid=6.5, bias=0.05)
    clump(c, cubic((22, 8), (17, 3), (11, 2), (7, 5)), 5, 0.7, MINT, BC, BR, bias=0.0)
    clump(c, cubic((29, 8), (33, 3), (37, 3), (39, 7)), 5, 0.7, SKY, BC, BR, bias=-0.08)
    clump(c, cubic((24, 8), (24, 2), (28, -1), (31, 1)), 3.2, 0.6, LAV, BC, BR, bias=0.0, flow=False)
    # beak
    c.rect(22, 25, 25, 27, GOLD[1]); c.hline(22, 25, 25, GOLD[0]); c.hline(23, 25, 27, GOLD[2]); c.pts(GOLD[3], (24, 28)); c.pts(GOLD[2], (22, 27))
    # eyes (7w x 10h), lashes, layered iris, catchlights
    def eye(x0, mirror):
        c.hline(x0 + 1, x0 + 5, 17, LASH); c.put(x0 + (1 if not mirror else 5), 18, LASH)
        c.pts(LASH, (x0 - 1 if not mirror else x0 + 7, 18), (x0 - 1 if not mirror else x0 + 7, 17))
        for i in range(9):
            y = 19 + i
            col = IRIS[0] if i < 2 else (IRIS[1] if i < 6 else (IRIS[2] if i < 8 else IRIS[3]))
            a, b = x0 + 1, x0 + 5
            if i in (0, 8):
                a, b = x0 + 2, x0 + 4
            c.hline(a, b, y, col)
        for y in range(20, 26):
            c.put(x0, y, '#eef1fc'); c.put(x0 + 6, y, '#e4e9fa')
        c.rect(x0 + 2, 21, x0 + 3, 23, '#161a45')                  # pupil
        c.rect(x0 + 1, 19, x0 + 2, 20, WHITE)                       # main catchlight
        c.pts('#e8f8ff', (x0 + 4, 25), (x0 + 5, 24))
        c.hline(x0 + 1, x0 + 5, 28, CREAM[3])
    eye(13, False); eye(28, True)
    # blush
    c.pts('#ffadb8', (12, 27), (13, 27), (14, 27), (34, 27), (35, 27), (36, 27)); c.pts('#ffc9c4', (12, 26), (36, 26))

    c.ox = c.oy = 0
    outline_auto(c, tint=(40, 34, 90))
    return c

if __name__ == '__main__':
    import sys
    build().save(sys.argv[1] if len(sys.argv) > 1 else 'gustwing.png')
