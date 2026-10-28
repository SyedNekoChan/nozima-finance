"""
Builds the art folders that the reference sheet does not contain, from the
approved frames (and the reference itself, re-sampled at another scale):

  python3 art/source/build_missing.py        (Pillow + numpy)

This is programmatic assembly, not hand-drawn art. Every frame is made only
of pixels of the approved cat: parts are cut out, shifted, repeated or
removed (a leg made longer by repeating a fur row, a body made lower by
removing rows) and recombined. Nothing is scaled except heads re-sampled from
the reference to the size of the walking cat. The approved folders are never
written. Results can be hand-finished in SpriteForge afterwards; do not
re-run over hand-finished frames.
"""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from kit import *
import paint as P

OUT = ART


def write(name, frames):
    d = Path(OUT) / name
    d.mkdir(exist_ok=True)
    for old in d.glob('*.png'):
        old.unlink()
    for i, f in enumerate(frames):
        save(f, d / f'{i}.png')
    print(name, len(frames), 'frames')


# ---------------------------------------------------------------- helpers
def delete_cols(a, x0, x1, y0=0, y1=H):
    r = a.copy()
    n = x1 - x0
    r[y0:y1, x0:W - n] = a[y0:y1, x1:W]
    r[y0:y1, W - n:W, 3] = 0
    return r


def lift_paw(a, x0, x1, y_bottom, rows, up):
    """lift the paw end (the last `rows` rows above y_bottom) of one leg by `up`"""
    seg = a[y_bottom - rows:y_bottom, x0:x1].copy()
    a[y_bottom - rows:y_bottom, x0:x1, 3] = 0
    a[y_bottom - rows - up:y_bottom - up, x0:x1] = seg
    return a


def bob_head(a, y_split, dy, x0=0, x1=W):
    head = region(a, x0, 0, x1, y_split)
    rest = a.copy()
    rest[:y_split, x0:x1, 3] = 0
    return over(rest, shift(head, 0, dy))


# ---------------------------------------------------------------- walking
def front_stance(phase, srcn, bob, tail_off):
    """a standing cat seen from the front. The head and chest are the approved
    ones (idle_front rows 8-45); the legs are painted: forelegs side by side,
    hind legs peeking out at both sides, one diagonal pair forward per phase.
    phase: 'A' left fore + right hind forward, 'B' all down, 'C' mirrored."""
    src = load('idle_front', srcn)
    tail = region(src, 56, 0, W, H)
    top = crop(src, 24, 8, 56, 46)
    upper = blank()
    paste(upper, top, 24, 6 + bob)
    # the sitting haunches are not part of a standing cat: cut them, the
    # painted hind legs cover the edge
    upper = erase(upper, 47, 38 + bob, W, H)
    upper = erase(upper, 0, 38 + bob, 27, H)
    lift = {'A': {'fl': 0, 'fr': 6, 'hl': 3, 'hr': 0}, 'B': {'fl': 0, 'fr': 0, 'hl': 1, 'hr': 1},
            'C': {'fl': 6, 'fr': 0, 'hl': 0, 'hr': 3},
            'L': {'fl': 4, 'fr': 4, 'hl': 2, 'hr': 2}}[phase]
    seed = {'A': 11, 'B': 21, 'C': 31, 'L': 41}[phase]
    legs = blank()
    # hind legs (behind): outside the forelegs, a little higher (farther away)
    P.DIM = 1
    for cx, key, sd in ((28, 'hl', 1), (48, 'hr', 2)):
        bottom = 59 - lift[key] + bob
        P.limb(legs, cx, 40 + bob, bottom - 3, 3.4, 2.6, 0.0, seed=seed + sd)
        P.paw(legs, cx, bottom, 8, 4, seed=seed + sd)
    P.DIM = 0
    back = legs
    legs = blank()
    # forelegs: the lifted one is shorter and a little tucked in
    for cx, key, sd in ((33, 'fl', 5), (41, 'fr', 6)):
        up = lift[key]
        bottom = 61 - up + bob
        lean = (0.0 if up == 0 else (0.18 if key == 'fl' else -0.18))
        P.limb(legs, cx, 41 + bob, bottom - 4, 3.6, 2.9, lean, seed=seed + sd)
        P.paw(legs, cx + int(lean * (bottom - 45)), bottom, 10 if up == 0 else 8, 4, seed=seed + sd)
    # a dark gap between the forelegs and under the chest
    for y in range(44 + bob, 58 + bob):
        legs[y, 37, :] = P.rgba(0) if legs[y, 37, 3] == 0 else legs[y, 37]
    t = shift(tail, tail_off[0] - 6, tail_off[1] + 2)
    return ground(over(t, back, upper, legs), 61)


def walk_front():
    """facing us, walking toward us: approved head and chest, painted legs"""
    return [front_stance('A', 0, 0, (0, 0)), front_stance('B', 1, 1, (1, 0)), front_stance('C', 0, 0, (0, 1))]


def walk_rear():
    """walking away: the approved rear view down to the rump, painted hind
    legs under it (paws alternate), the approved curled tail raised at the side"""
    out = []
    for phase, srcn, bob, tail in (('A', 0, 0, (0, 0)), ('B', 1, 1, (1, 0)), ('C', 0, 0, (0, -1))):
        rear = load('sit_rear', 0)
        tl = region(rear, 57, 28, W, H)
        body = erase(rear.copy(), 57, 28, W, H)
        body = erase(body, 0, 45, W, H)
        body = bob_head(body, 24, bob) if bob else body
        lift = {'A': (0, 6), 'B': (0, 0), 'C': (6, 0)}[phase]
        legs = blank()
        seed = {'A': 41, 'B': 51, 'C': 61}[phase]
        for cx, up, sd in ((33, lift[0], 1), (45, lift[1], 2)):
            bottom = 61 - up + bob
            lean = 0.0 if up == 0 else (0.15 if cx < 40 else -0.15)
            P.limb(legs, cx, 40 + bob, bottom - 4, 3.8, 3.0, lean, seed=seed + sd)
            P.paw(legs, cx + int(lean * (bottom - 44)), bottom, 10 if up == 0 else 8, 4, seed=seed + sd)
        for y in range(46 + bob, 58 + bob):
            if legs[y, 39, 3] == 0:
                legs[y, 39] = P.rgba(0)
        body = P.texture(body, (24, 0, 56, 45), 81 + ord(phase), 0.55)
        out.append(ground(over(shift(tl, -5 + tail[0], -10 + tail[1]), body, legs), 61))
    return out


def fr2ref(fx, fy, ox, box, scale=0.275):
    return int(box[0] + (fx - ox) / scale), int(box[1] + fy / scale)


def head_from_reference(kind, scale):
    if kind == 'threeq':
        b = (76, 543, 312, 763)
        x0, y0 = fr2ref(15, 0, 15, b)
        x1, y1 = fr2ref(47, 27, 15, b)
    else:  # rear
        b = (829, 778, 1004, 1004)
        x0, y0 = fr2ref(27, 0, 24, b)
        x1, y1 = fr2ref(54, 28, 24, b)
    return ref_part((x0, y0, x1, y1), scale)


def blend_seam(a, mask, y_min):
    """interleave head and body fur along the neck: within two pixels of the
    pasted head's lower edge, alternate pixels take the neighbouring colour of
    the other side (a fur-like dither instead of a straight cut)"""
    out = a.copy()
    opaque = a[..., 3] > 0
    ys, xs = np.where(mask)
    for y in range(max(y_min, 0), H):
        for x in range(W):
            if not opaque[y, x] or (x + y) % 2:
                continue
            # nearest pixel on the other side of the seam, within 2 px
            best = None
            for dy in range(-2, 3):
                for dx in range(-2, 3):
                    yy, xx = y + dy, x + dx
                    if 0 <= yy < H and 0 <= xx < W and opaque[yy, xx] and mask[yy, xx] != mask[y, x]:
                        d = abs(dx) + abs(dy)
                        if best is None or d < best[0]:
                            best = (d, yy, xx)
            if best:
                out[y, x] = a[best[1], best[2]]
    return out


def walk_head_swap(kind, scale, at):
    """the approved side-walk body with the profile head replaced by the
    three-quarter head (toward us) or the rear head (away), re-sampled from
    the reference to the walking cat's head size, blended into the neck"""
    head = head_from_reference(kind, scale)
    out = []
    for k in range(3):
        a = erase(load('walk_side', k), 1, 8, 24, 32)
        mask = np.zeros((H, W), bool)
        h, w = head.shape[:2]
        mask[at[1]:at[1] + h, at[0]:at[0] + w] = head[..., 3] > 0
        paste(a, head, *at)
        if kind == 'rear':
            a = P.texture(a, (at[0], at[1], at[0] + w, at[1] + h), 71 + k, 0.7)
        a = blend_seam(a, mask, at[1] + h - 9)
        out.append(ground(a))
    return out


# ---------------------------------------------------------------- crouch
def squash(a, y0, n, head_dy=0, head_x1=W, head_y=36):
    """a lower body: n rows removed at y0 (the legs get shorter; nothing above
    them is touched), the head lowered a little more, then back on the ground"""
    out = delete_rows(a, y0, y0 + n)
    if head_dy:
        out = bob_head(out, head_y, head_dy, 0, head_x1)
    return ground(out)


# ---------------------------------------------------------------- the rest
def leap_side():
    """a bound: the approved walking body with its legs replaced by painted
    ones, the forelegs reaching forward, the hind legs pushing back"""
    a = load('walk_side', 1)
    a = erase(a, 0, 45, 80, H)          # the walking legs
    legs = blank()
    P.DIM = 1
    for cx, lean, sd in ((26, -0.62, 3), (62, 0.66, 4)):     # far pair
        P.limb(legs, cx, 41, 52, 3.0, 2.4, lean, seed=300 + sd)
        P.paw(legs, cx + int(lean * 11), 56, 7, 4, seed=300 + sd)
    P.DIM = 0
    for cx, lean, sd in ((20, -0.75, 1), (55, 0.72, 2)):     # near pair
        P.limb(legs, cx, 41, 53, 3.4, 2.6, lean, seed=300 + sd)
        P.paw(legs, cx + int(lean * 12), 58, 8, 4, seed=300 + sd)
    return [shift(over(legs, a), 0, -3)]


def leap_front():
    """a hop toward us: the standing front cat with every paw tucked up, raised
    off the ground (the floor shadow stays down)"""
    return [shift(front_stance('L', 1, 0, (0, 0)), 0, -7)]


def low_front():
    """head down: the closed-eye front cat with the neck zone removed, so the
    head rests low on the shoulders"""
    out = []
    for bob in (0, 1):
        a = load('idle_front', 3)
        tail = region(a, 56, 0, W, H)
        body = erase(a.copy(), 56, 0, W, H)
        body = delete_rows(body, 31, 39, 0, 56)
        tail = shift(tail, 0, -8)
        body = bob_head(body, 31, bob, 0, 56) if bob else body
        out.append(ground(over(tail, body)))
    return out


def loaf_front():
    """lying with the paws tucked: the sitting front cat with the leg and
    haunch zone removed, so it is a low loaf; the tail is lowered with it"""
    out = []
    for n in (0, 1):
        a = load('idle_front', n)
        tail = region(a, 56, 0, W, H)
        body = erase(a.copy(), 56, 0, W, H)
        body = delete_rows(body, 43, 55, 0, 56)
        tail = shift(tail, 0, -12)
        out.append(ground(over(tail, body)))
    return out


def main():
    wf, wr = walk_front(), walk_rear()
    wq = walk_head_swap('threeq', 0.25, (1, 8))
    wrq = walk_head_swap('rear', 0.24, (2, 8))
    write('walk_front', wf)
    write('walk_rear', wr)
    write('walk_frontQ', wq)
    write('walk_rearQ', wrq)
    side = [load('walk_side', k) for k in range(3)]
    write('creep_side', [squash(f, 44, 7, 3, 24) for f in side])
    write('creep_frontQ', [squash(f, 44, 7, 3, 24) for f in wq])
    write('creep_rearQ', [squash(f, 44, 7, 3, 24) for f in wrq])
    write('creep_front', [squash(f, 56, 6, 2, 56, 34) for f in wf])
    write('creep_rear', [squash(f, 51, 5, 2, 56, 24) for f in wr])
    write('leap_side', leap_side())
    write('leap_front', leap_front())
    write('low_front', low_front())
    write('loaf_front', loaf_front())


if __name__ == '__main__':
    main()
