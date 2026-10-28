"""Assassin chibi model (single static front pose) on the shared rig."""
from pixlib import cubic, bez, paint_lock, clump
import chibi_rig as R
from chibi_rig import L, LEATH, GOLD, STEEL, RED, span, CX

HAIR  = ['#aaa0da', '#7569ad', '#4f4483', '#332c5d', '#1b1739']
IRIS  = ['#5a1630', '#b02c4c', '#ec6478', '#ffc0c6']
TUNIC = ['#8d89a9', '#6b6789', '#4d4969', '#34314f', '#201d37']
SLEEVE = ['#7b7799', '#5b5779', '#413d5d', '#2c2947', '#1a1831']
TROUS = ['#6c698d', '#535075', '#3e3b5d', '#2b2946', '#1b1931']
BOOTS = ['#6d6080', '#4e4362', '#393149', '#272034', '#17131f']
DARK  = ['#6a5468', '#4c3a4e', '#352838', '#241a28', '#150f19']

def hair_fn(c, H, HC, HR):
    R.default_hair(c, H, HC, HR)
    # one long lock over the viewer-right cheek: the asymmetric Assassin cut
    clump(c, cubic((26, 6), (31.5, 9), (33.5, 17), (31.5, 25.5)), 4.4, 0.7, H, HC, HR, w_mid=4.0, bias=-0.1, flow=False)

def behind_body(c):
    # tattered half-cloak behind the viewer-right shoulder
    paint_lock(c, bez((25, 28), (31, 31), (31.5, 39)), 6.0, 1.4, TUNIC, L, w_mid=5.4, tip_dark=True)
    for (x, y) in ((29, 39), (31, 40), (30, 37)):
        c.put(x, y, TUNIC[4])

def torso_gear(c):
    for i in range(0, 11):                                       # crossed chest straps
        c.pts(DARK[2], (15 + i, 28 + int(i * 0.5)), (25 - i, 28 + int(i * 0.5)))
        c.pts(DARK[0], (15 + i, 27 + int(i * 0.5)), (25 - i, 27 + int(i * 0.5)))
    c.pts(STEEL[1], (19, 30), (21, 30))                           # strap buckle glint

def belt(c):
    span(c, 33, 5.4, DARK, light=0.3, shade=0.72)
    span(c, 34, 5.6, DARK, light=0.3, shade=0.72)
    c.rect(19, 33, 21, 34, STEEL[2]); c.pts(STEEL[0], (19, 33)); c.pts(STEEL[4], (21, 34))
    # two dagger hilts at the hips, pommels outward
    c.rect(12, 34, 15, 35, DARK[3]); c.pts(DARK[0], (12, 34)); c.pts(STEEL[1], (11, 34), (11, 35)); c.vline(15, 33, 36, STEEL[2]); c.pts(STEEL[0], (15, 33))
    c.rect(25, 34, 28, 35, DARK[3]); c.pts(DARK[1], (25, 34)); c.pts(STEEL[2], (29, 34), (29, 35)); c.vline(25, 33, 36, STEEL[3]); c.pts(STEEL[1], (25, 33))

def cuffs(c):
    c.rect(11, 33, 13, 35, DARK[2]); c.hline(11, 13, 33, DARK[0]); c.pts(STEEL[1], (12, 34)); c.pts(DARK[4], (13, 35))
    c.rect(26, 33, 28, 35, DARK[3]); c.hline(26, 28, 33, DARK[1]); c.pts(STEEL[2], (27, 34)); c.pts(DARK[4], (28, 35))

def collar(c):
    # high collar and a crimson scarf with a tail blown to the viewer-left
    span(c, 27, 5.8, RED, light=0.3, shade=0.7); span(c, 28, 6.6, RED, light=0.3, shade=0.7)
    c.pts(RED[4], (CX - 5, 28), (CX + 4, 28)); c.vline(CX + 1, 27, 28, RED[3])
    paint_lock(c, bez((14.5, 28), (9.5, 30), (7.5, 35)), 3.4, 1.2, RED, L, tip_dark=True)

SPEC = dict(name='assassin', hair=HAIR, iris=IRIS, tunic=TUNIC, sleeve=SLEEVE, trouser=TROUS, boots=BOOTS,
            lash='#2a1630', sclera='#efe9f6', pupil='#2a0912', brow=HAIR[4], blush='#ee8a98', tint=(40, 24, 70),
            hair_fn=hair_fn, behind_body=behind_body, torso_gear=torso_gear, belt=belt, cuffs=cuffs, collar=collar,
            torso_half={27: 2.8, 28: 4.8, 29: 5.9, 30: 6.2, 31: 6.0, 32: 5.6, 33: 5.2, 34: 5.2, 35: 5.8}, side=3, scallop=False)

def build():
    return R.build(SPEC)

if __name__ == '__main__':
    import sys
    build().save(sys.argv[1] if len(sys.argv) > 1 else 'model_assassin.png')
