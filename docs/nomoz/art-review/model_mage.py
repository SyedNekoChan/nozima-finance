"""Mage chibi model (single static front pose) on the shared rig."""
from pixlib import cubic, bez, paint_lock, clump
import chibi_rig as R
from chibi_rig import L, LEATH, GOLD, STEEL, BONE, span, CX

HAIR  = ['#f8f4ff', '#ddd4f7', '#b8abe3', '#8b7dc1', '#5e4f91']
IRIS  = ['#1e2b6e', '#3a5bc4', '#7fa8f5', '#d1e8ff']
ROBE  = ['#9bafee', '#6883da', '#4863ba', '#324593', '#212e65']
SLEEVE = ['#acbff4', '#7d95e2', '#5772c6', '#3c50a0', '#27377c']
HAT   = ['#7b92dc', '#5169bb', '#37499a', '#25326c', '#161e45']
ORB   = ['#ffffff', '#d3f6ff', '#86d6f8', '#4e9ae0', '#2f62ae']
GOLD5 = ['#fff2b0', '#f5cf5f', '#cf9a35', '#8f5f2b', '#5b3a1c']
WOOD  = ['#c9976a', '#9b6a46', '#74482f', '#4f2f22', '#2e1b17']

def head_top(c):
    # small pointed hat, tilted; the brim sits above the brows so the face stays clear
    paint_lock(c, bez((18.5, 5), (20.5, -2), (27, -6.5)), 15, 1.2, HAT, L, w_mid=11, tip_dark=False)
    c.ellipse(20, 5.0, 14.5, 3.4, HAT, light=L, cuts=(0.8, 0.45, 0.05, -0.4))
    c.hline(11, 29, 4, GOLD[2]); c.hline(11, 29, 3, GOLD[1]); c.pts(GOLD[0], (12, 3), (13, 3), (14, 3)); c.pts(GOLD[3], (27, 4), (28, 4), (29, 4))
    c.pts(GOLD[1], (20, 0), (19, 1), (20, 1), (21, 1), (20, 2))                           # small star on the cone
    c.hline(8, 12, 6, HAT[0]); c.hline(28, 32, 6, HAT[4])

def torso_gear(c):
    span(c, 33, 5.6, GOLD5, light=0.3, shade=0.72)
    c.pts(GOLD[0], (CX - 5, 33)); c.rect(19, 32, 21, 34, GOLD[2]); c.pts(GOLD[0], (19, 32)); c.pts('#6fb8ff', (20, 33))        # sash and gem clasp

def cuffs(c):
    # wide bell cuffs with gold trim
    c.rect(10, 33, 14, 35, SLEEVE[2]); c.hline(10, 14, 35, GOLD[2]); c.hline(10, 14, 33, SLEEVE[0]); c.vline(10, 34, 35, SLEEVE[1]); c.vline(14, 34, 35, SLEEVE[4])
    c.rect(25, 33, 29, 35, SLEEVE[3]); c.hline(25, 29, 35, GOLD[3]); c.hline(25, 29, 33, SLEEVE[1]); c.vline(29, 34, 35, SLEEVE[4])

def front(c):
    # staff held in the viewer-right hand; the orb floats clear of the hat brim
    paint_lock(c, bez((35.2, 4), (33.2, 20), (30.2, 44)), 2.0, 2.0, WOOD, L, tip_dark=False)
    c.ellipse(35.4, 2.2, 3.0, 3.0, ORB, light=L, cuts=(0.85, 0.5, 0.0, -0.45))
    c.pts(ORB[1], (31, 2), (39, 2), (35, -2), (35, 6)); c.pts(ORB[0], (32, -1), (38, -1), (40, 5))
    c.pts(GOLD[1], (34, 5), (35, 5), (36, 5)); c.pts(GOLD[3], (35, 6))

def collar(c):
    span(c, 27, 5.6, BONE, light=0.3, shade=0.7); span(c, 28, 6.2, BONE, light=0.3, shade=0.7)
    c.pts(GOLD[2], (CX - 1, 28), (CX, 28)); c.pts(BONE[3], (CX - 5, 28), (CX + 4, 28))

SPEC = dict(name='mage', hair=HAIR, iris=IRIS, tunic=ROBE, sleeve=SLEEVE, trouser=ROBE, boots=LEATH,
            robe=dict(ramp=ROBE, trim=GOLD, trim2=True), head_top=head_top, torso_gear=torso_gear, cuffs=cuffs, front=front, collar=collar,
            pupil='#101a50', sclera='#eef1ff', lash='#2a2060', brow=HAIR[4], blush='#f5a0b8', tint=(40, 34, 96), top=8, side=4, arm_shift=1, scallop=False)

def build():
    return R.build(SPEC)

if __name__ == '__main__':
    import sys
    build().save(sys.argv[1] if len(sys.argv) > 1 else 'model_mage.png')
