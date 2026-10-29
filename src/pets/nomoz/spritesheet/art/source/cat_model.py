"""Articulated Nomoz model for render_cat.py (cat space: x to the viewer's right in the front view,
y up, z forward; ground is y = 0)."""
import math
import numpy as np
from render_cat import Prim, chain, ik2, Render

LEGS = {  # name: (side x sign, front?, gait phase offset)
    'FL': (+1, True, 0.25), 'FR': (-1, True, 0.75), 'HL': (+1, False, 0.0), 'HR': (-1, False, 0.5),
}


def foot_target(u, stride, lift, z0, y0=1.6):
    """foot position along the cycle: stance (60%) slides back, swing (40%) returns lifted"""
    u %= 1.0
    if u < 0.6:
        t = u / 0.6
        return z0 + stride * (1 - 2 * t), y0, 0.0
    t = (u - 0.6) / 0.4
    return z0 - stride + 2 * stride * t, y0 + lift * math.sin(math.pi * t), t


def torso(bd=0.0, sag=0.0, fluff=1.0, chest_z=15.0, hip_z=-19.0, ruff_w=7.8, hip_w=0.0):
    """smooth torso: overlapping ellipsoids along a gently arched spine (deep chest, tucked flank, full haunch)"""
    P = []
    n = 16
    for i in range(n + 1):
        t = i / n
        z = chest_z + (hip_z - chest_z) * t
        y = 27.0 - bd + 0.8 * math.sin(math.pi * t) + sag * math.sin(math.pi * t)
        ry = 10.6 - 2.6 * math.exp(-((t - 0.52) / 0.20) ** 2) - 0.5 * t
        rx = 7.8 - 0.5 * math.exp(-((t - 0.52) / 0.2) ** 2) + 0.7 * t + hip_w * max(0.0, t - 0.55) / 0.45
        P.append(Prim((0, y - (10.6 - ry) * 0.2 - 0.4, z), (rx, ry, 5.2), 'body'))
    P.append(Prim((0, 20.8 - bd, (chest_z + hip_z) / 2 + 1), (5.6, 3.6, abs(chest_z - hip_z) / 2 + 3), 'belly', 0.9 * fluff))
    P.append(Prim((0, 26 - bd, chest_z + 6.5), (ruff_w * 0.92, 9.2, 6.8), 'ruff', 0.8 * fluff, flow=(0, -1, 0.3)))
    P.append(Prim((0, 32 - bd, chest_z + 9), (6.8, 8, 7), 'neck'))
    return P


def leg(name, hip, foot, a=11.0, b=11.0, bend=None, fluff=0.5, thick=1.0):
    pn = name
    side, front, _ = LEGS[name]
    bend = (-1 if front else +1) if bend is None else bend
    h, k, f = ik2(hip, foot, a, b, bend)
    P = []
    r_up, r_lo = (3.9 if front else 4.8) * thick, 2.6 * thick
    P += chain(h, k, r_up, 3.2 * thick, part=pn, fluff=fluff * 0.5)
    P += chain(k, f + np.array([0, 2.0, 0]), 3.0 * thick, r_lo, part=pn, fluff=fluff)
    P.append(Prim(f + np.array([0, 1.5, 2.0]), (3.0 * thick, 2.0, 4.2), pn, flow=(0, 0, 1)))
    return P


def tail(points, r0=2.8, r1=4.9, fluff=0.6, tuft=True):
    """a plume: thin at the root, fullest about two thirds along, tapering to a tufted tip"""
    pts = np.array(points, float)
    P = []
    n = len(pts) - 1
    for i in range(n):
        for j in range(5):
            t = (i + j / 5) / n
            c = pts[i] + (pts[i + 1] - pts[i]) * (j / 5)
            r = r0 + (r1 - r0) * math.sin(min(1, t * 1.35) * math.pi / 2) * (1 - 0.55 * t ** 3)
            P.append(Prim(c, (r, r * 1.05, r), 'tail', fluff, flow=pts[i + 1] - pts[i]))
    if tuft:
        d = pts[-1] - pts[-2]
        d = d / (np.linalg.norm(d) + 1e-9)
        # a few locks fan out at the tip, so it ends in a point rather than a blunt end
        side = np.cross(d, [0.0, 1.0, 0.0])
        if np.linalg.norm(side) < 1e-6: side = np.cross(d, [1.0, 0.0, 0.0])
        side = side / (np.linalg.norm(side) + 1e-9)
        for k, (along, off, rr) in enumerate(((2.2, 0.0, 2.1), (1.4, 1.5, 1.7), (1.4, -1.5, 1.7))):
            P.append(Prim(pts[-1] + d * along + side * off, (rr, rr, rr), 'tail', fluff, flow=d + side * off * 0.15))
    return P


def walk_pose(phase, stride=9.0, lift=5.5, bd=0.0, crouch=False, tail_pts=None, bob=0.0):
    P = torso(bd + bob)
    hipy_f, hipy_h = 22.0 - bd, 21.0 - bd
    for name, (side, front, off) in LEGS.items():
        z0 = 12.5 if front else -15.5
        zf, yf, sw = foot_target(phase + off, stride, lift, z0)
        hip = (side * (5.6 if front else 6.4), hipy_f if front else hipy_h, 12.0 if front else -16.0)
        foot = (side * (5.0 if front else 5.6), yf, zf)
        P += leg(name, hip, foot, a=11.5 if not crouch else 10.5, b=11.0)
    P += tail(tail_pts or [(0, 29, -23), (0, 34, -31), (0, 42, -36), (0, 50, -38)])
    return P


def head3d(c, size=1.0, bd=0.0, fluff=1.0):
    """a rendered cat head (for the one view with no approved head: from behind and to the side).
    c: centre of the skull. Skull, cheek fur and two pointed ears."""
    x, y, z = c
    P = [Prim((x, y, z), (9.2 * size, 8.4 * size, 8.8 * size), 'head', 0.6 * fluff),
         Prim((x, y - 2, z + 1), (10.4 * size, 7.0 * size, 8.0 * size), 'head', 0.9 * fluff)]
    for sx in (-1, 1):
        base = np.array([x + sx * 5.6 * size, y + 6.6 * size, z - 1.0])
        tip = base + np.array([sx * 1.6 * size, 7.2 * size, -0.5])
        P += chain(base, tip, 3.6 * size, 0.8 * size, n=7, part='head', fluff=0.1)
    return P
