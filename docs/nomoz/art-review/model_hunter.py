"""Hunter chibi model (single static front pose) on the shared rig."""
from pixlib import cubic, bez, paint_lock, clump
import chibi_rig as R
from chibi_rig import L, LEATH, GOLD, STEEL, BONE, span, CX

HAIR  = ['#ffc69b', '#f59f70', '#d6704f', '#a24848', '#632c47']
IRIS  = ['#16414c', '#2b8084', '#69cfbd', '#c8f7e9']
TUNIC = ['#dff3cc', '#a8d896', '#68ac74', '#43786c', '#2a4e54']
SLEEVE = ['#c9e7b3', '#97c984', '#5d9c64', '#3b6c5d', '#26474b']
TROUS = ['#9b8a6c', '#7d6e55', '#61553f', '#453c33', '#2c2628']

def hair_fn(c, H, HC, HR):
    R.default_hair(c, H, HC, HR)
    # short ponytail swinging out to the viewer-left, kept small
    clump(c, cubic((12, 7), (6, 5), (3, 9), (4, 15)), 4.6, 0.8, H, HC, HR, w_mid=4.4, bias=0.05, flow=False)
    clump(c, cubic((11.5, 9.5), (6, 10), (4.5, 14), (6, 18)), 3.0, 0.7, H, HC, HR, bias=-0.08, flow=False)
    c.rect(10, 5, 12, 8, GOLD[2]); c.hline(10, 12, 5, GOLD[0]); c.vline(10, 5, 8, GOLD[1]); c.vline(12, 6, 8, GOLD[3]); c.pts('#3aa38f', (11, 7))

def torso_gear(c):
    for i in range(0, 11):                                   # quiver strap across the chest
        x = 15 + i; y = 28 + int(i * 0.5)
        c.pts(LEATH[2], (x, y), (x + 1, y)); c.put(x, y - 1, LEATH[0] if i % 3 == 0 else LEATH[1]); c.put(x, y + 1, LEATH[3])

def belt(c):
    span(c, 33, 5.4, LEATH, light=0.3, shade=0.72)
    span(c, 34, 5.6, LEATH, light=0.3, shade=0.72)
    c.hline(19, 21, 33, GOLD[2]); c.pts(GOLD[0], (19, 33)); c.pts(GOLD[3], (21, 33))
    c.rect(14, 34, 17, 37, LEATH[1]); c.hline(14, 17, 34, LEATH[0]); c.vline(17, 35, 37, LEATH[3]); c.hline(14, 17, 37, LEATH[4]); c.pts(GOLD[1], (15, 35), (16, 35))   # pouch

def cuffs(c):
    c.rect(11, 33, 13, 35, LEATH[2]); c.hline(11, 13, 33, LEATH[0]); c.vline(11, 34, 35, LEATH[1]); c.pts(LEATH[4], (13, 35))
    c.rect(26, 33, 28, 34, LEATH[3]); c.hline(26, 28, 33, LEATH[1]); c.pts(LEATH[4], (28, 34))

def front(c):
    # bow held at the viewer-left hand
    paint_lock(c, bez((10.2, 28.5), (6.0, 37), (10.2, 45)), 2.4, 1.8, LEATH, L, w_mid=2.8, tip_dark=False)
    for (x, y) in ((10, 29), (11, 31), (11, 34), (11, 38), (11, 41), (10, 44)):
        c.put(x, y, STEEL[1])
    c.pts(GOLD[1], (7, 36), (7, 37))
    # quiver on the back: only the fletching shows over the viewer-right shoulder
    for (x, col) in ((27, '#8fe0c8'), (29, '#fffdf4'), (31, '#8fe0c8')):
        c.vline(x, 25, 28, LEATH[1]); c.pts(col, (x, 23), (x, 24), (x + 1, 24), (x - 1, 24))

def collar(c):
    span(c, 27, 5.6, BONE, light=0.3, shade=0.7); span(c, 28, 6.4, BONE, light=0.3, shade=0.7)
    c.pts(BONE[3], (CX - 4, 28), (CX + 3, 28)); c.vline(CX, 27, 28, BONE[3])

SPEC = dict(name='hunter', hair=HAIR, iris=IRIS, tunic=TUNIC, sleeve=SLEEVE, trouser=TROUS, boots=LEATH,
            hair_fn=hair_fn, torso_gear=torso_gear, belt=belt, cuffs=cuffs, front=front, collar=collar, side=3)

def build():
    return R.build(SPEC)

if __name__ == '__main__':
    import sys
    build().save(sys.argv[1] if len(sys.argv) > 1 else 'model_hunter.png')
