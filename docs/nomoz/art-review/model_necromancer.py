"""Necromancer chibi model (single static front pose) on the shared rig."""
from pixlib import cubic, bez, paint_lock, clump
import chibi_rig as R
from chibi_rig import L, LEATH, GOLD, STEEL, BONE, span, CX

SKIN  = ['#f6f1f6', '#e9dde7', '#d3bdcc', '#ab8da0', '#725675']
HAIR  = ['#f0f3f6', '#cbd2dc', '#9ca4ba', '#6c7493', '#40456a']
IRIS  = ['#0e3f48', '#1f9a84', '#6febbb', '#d6ffe9']
COAT  = ['#7e6da0', '#5b4a7f', '#413462', '#2b2248', '#1a102c']
SLEEVE = ['#6f5e92', '#4f406f', '#382d58', '#251d41', '#150e25']
FLAME = ['#eafff0', '#9cf6c3', '#4cd79c', '#209c7e', '#105c5a']
STAFFC = ['#a79480', '#7c6a5e', '#5a4a47', '#3b2f33', '#221a22']

def hair_fn(c, H, HC, HR):
    R.default_hair(c, H, HC, HR)
    clump(c, cubic((15, 4), (12, 0.5), (8.5, 1), (7.5, 5)), 3.2, 0.6, H, HC, HR, bias=0.06, flow=False)      # messy tufts
    clump(c, cubic((26, 3.5), (28.5, 0), (32, 0.5), (33, 4)), 3.0, 0.6, H, HC, HR, bias=-0.04, flow=False)
    c.rect(29, 6, 31, 9, BONE[1]); c.hline(29, 31, 6, BONE[0]); c.vline(31, 7, 9, BONE[3]); c.pts(BONE[4], (30, 8))      # bone hair clip

def behind_body(c):
    # tattered cape spreading behind the body: a wide, ragged silhouette
    paint_lock(c, bez((14, 27), (4.5, 35), (3.5, 45)), 9.0, 1.4, COAT, L, w_mid=8.0, tip_dark=True)
    paint_lock(c, bez((26, 27), (35.5, 35), (36.5, 45)), 9.0, 1.4, COAT, L, w_mid=8.0, tip_dark=True)
    for (x, y) in ((4, 44), (6, 45), (35, 44), (33, 45)):
        c.put(x, y, COAT[4])

def torso_gear(c):
    # bone ribs across the chest and a skull clasp
    for y in (30, 32):
        c.hline(16, 19, y, BONE[1]); c.hline(21, 24, y, BONE[2]); c.pts(BONE[0], (16, y)); c.pts(BONE[4], (24, y))
    c.rect(19, 29, 21, 31, BONE[0]); c.pts(BONE[2], (19, 31), (21, 31)); c.pts('#1a102c', (19, 30), (21, 30)); c.pts(BONE[3], (20, 31))

def belt(c):
    span(c, 33, 5.2, BONE, light=0.3, shade=0.72)
    span(c, 34, 5.4, COAT, light=0.3, shade=0.72)
    c.rect(19, 33, 21, 34, FLAME[2]); c.pts(FLAME[0], (19, 33)); c.pts(FLAME[3], (21, 34))                  # soul crystal clasp

def cuffs(c):
    c.rect(11, 33, 13, 35, BONE[2]); c.hline(11, 13, 33, BONE[0]); c.vline(11, 34, 35, BONE[1]); c.pts(BONE[4], (13, 35))
    c.rect(26, 33, 28, 35, BONE[3]); c.hline(26, 28, 33, BONE[1]); c.pts(BONE[4], (28, 35))

def front(c):
    # gnarled staff in the viewer-left hand: leans out past the head, hooked top holding a spectral flame
    paint_lock(c, bez((4.6, 9), (7.2, 26), (11.6, 44)), 2.2, 2.2, STAFFC, L, tip_dark=False)
    paint_lock(c, bez((4.6, 9), (1.8, 6.5), (5.8, 4.2)), 2.2, 1.2, STAFFC, L, tip_dark=False)
    paint_lock(c, bez((5.4, 5), (4, 1.5), (6.2, -2)), 4.2, 0.6, FLAME, L, tip_dark=False)
    c.pts(FLAME[0], (5, 2), (6, 0)); c.pts(FLAME[2], (8, 3), (3, 4))

def collar(c):
    # hood bunched around the neck
    span(c, 27, 6.0, COAT, light=0.3, shade=0.7); span(c, 28, 7.0, COAT, light=0.3, shade=0.7)
    c.pts(COAT[4], (CX - 6, 28), (CX + 5, 28)); c.pts(COAT[0], (CX - 5, 27), (CX - 4, 27), (CX - 3, 27))

SPEC = dict(name='necromancer', skin=SKIN, hair=HAIR, iris=IRIS, tunic=COAT, sleeve=SLEEVE, trouser=COAT, boots=SLEEVE,
            robe=dict(ramp=COAT, ragged=True, flare={36: 6.6, 37: 7.2, 38: 7.8, 39: 8.4, 40: 9.0, 41: 9.4, 42: 9.8}),
            hair_fn=hair_fn, behind_body=behind_body, torso_gear=torso_gear, belt=belt, cuffs=cuffs, front=front, collar=collar,
            lash='#241830', sclera='#e6f2f0', pupil='#06201c', brow=HAIR[4], blush='#d98fb4', tint=(34, 22, 66), buckle=BONE[1], top=4, side=4, arm_shift=1, scallop=False)

def build():
    return R.build(SPEC)

if __name__ == '__main__':
    import sys
    build().save(sys.argv[1] if len(sys.argv) > 1 else 'model_necromancer.png')
