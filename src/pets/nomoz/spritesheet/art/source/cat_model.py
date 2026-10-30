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


def torso(bd=0.0, sag=0.0, fluff=1.0, chest_z=15.0, hip_z=-19.0, ruff_w=7.8, hip_w=0.0, chest_w=1.0):
    """smooth torso: overlapping ellipsoids along a gently arched spine (deep chest, tucked flank, full haunch)"""
    P = []
    n = 16
    for i in range(n + 1):
        t = i / n
        z = chest_z + (hip_z - chest_z) * t
        y = 27.0 - bd + 0.8 * math.sin(math.pi * t) + sag * math.sin(math.pi * t)
        ry = 10.6 - 2.6 * math.exp(-((t - 0.52) / 0.20) ** 2) - 0.5 * t
        rx = 7.8 - 0.5 * math.exp(-((t - 0.52) / 0.2) ** 2) + 0.7 * t + hip_w * max(0.0, t - 0.55) / 0.45
        rx *= 1 - (1 - chest_w) * max(0.0, 1 - t / 0.5)   # a narrower chest (three-quarter views, where it would stick out beside the head)
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
    # three toes along the front of the paw: the shading between them separates them (a paw is not a stub)
    for dx in (-1.7, 0.0, 1.7):
        P.append(Prim(f + np.array([dx * thick, 1.1, 5.4 - 0.5 * abs(dx)]), (1.25 * thick, 1.05, 1.5), pn, flow=(0, 0, 1)))
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
    c: centre of the skull. A rounded skull, full cheek ruffs that sit wider than the skull, the muzzle showing past
    the near cheek, a thick ruff at the nape, and two tall pointed ears with fur at their tips."""
    x, y, z = c
    s = size
    P = [Prim((x, y, z), (8.6 * s, 7.8 * s, 8.4 * s), 'head', 0.5 * fluff),                      # skull
         Prim((x, y - 1.5 * s, z + 1.5 * s), (9.4 * s, 6.4 * s, 8.0 * s), 'head', 0.8 * fluff),   # brow and cheeks
         Prim((x, y - 4.2 * s, z - 1.5 * s), (9.6 * s, 4.6 * s, 7.6 * s), 'ruff', 0.9 * fluff, flow=(0, -1, 0.2)),  # nape ruff
         Prim((x, y - 2.4 * s, z + 8.6 * s), (4.2 * s, 3.4 * s, 4.6 * s), 'head', 0.4 * fluff)]    # muzzle
    for sx in (-1, 1):
        # cheek ruffs: tufted, sweeping down and back
        P.append(Prim((x + sx * 8.4 * s, y - 2.8 * s, z + 1.0 * s), (3.4 * s, 4.2 * s, 5.6 * s), 'ruff', 1.0 * fluff, flow=(sx * 0.2, -1, -0.3)))
        base = np.array([x + sx * 5.8 * s, y + 6.0 * s, z - 0.6 * s])
        tip = base + np.array([sx * 1.6 * s, 7.0 * s, -0.8 * s])
        P += chain(base, tip, 4.2 * s, 0.9 * s, n=8, part='head', fluff=0.1)
        # a small tuft at the tip of each ear
        P.append(Prim(tip + np.array([0.0, 0.6 * s, 0.0]), (1.1 * s, 1.5 * s, 1.1 * s), 'head', 0.9 * fluff, flow=(0, 1, 0)))
    return P
