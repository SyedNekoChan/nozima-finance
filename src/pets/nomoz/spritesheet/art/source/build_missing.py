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
def walk_front():
    """facing us, walking toward us: the sitting cat stood up (legs longer by
    repeated fur rows, the haunches left behind as hind legs), paws alternate"""
    out = []
    for lift, bob, tdx, tdy, srcn in (('L', 0, 0, 0, 0), (None, 1, 1, 0, 1), ('R', 0, 0, 1, 0)):
        src = load('idle_front', srcn)
        tail = region(src, 56, 0, W, H)
        body = erase(src.copy(), 56, 0, W, H)
        body = insert_rows(body, 52, 7, 28, 47, src=52)
        if lift:
            x0, x1 = {'L': (28, 38), 'R': (38, 47)}[lift]
            body = lift_paw(body, x0, x1, 64, 8, 6)
        if bob:
            body = bob_head(body, 34, bob)
        out.append(ground(over(shift(tail, tdx, tdy), body)))
    return out


def walk_rear():
    """walking away: the approved rear view with the sitting haunch cut off,
    two legs from the front view's legs, the curled tail raised at the side"""
    out = []
    for lift, bob, tail, srcn in (('L', 0, (0, 0), 0), (None, 1, (1, 0), 1), ('R', 0, (0, -1), 0)):
        rear = load('sit_rear', 0)
        tl = region(rear, 57, 28, W, H)
        body = erase(rear.copy(), 57, 28, W, H)
        body = erase(body, 0, 45, W, H)
        legs = crop(load('idle_front', srcn), 27, 48, 48, 62)
        paste(body, legs, 27, 44)
        ph = legs.shape[0]
        if lift:
            x0, x1 = {'L': (27, 37), 'R': (37, 48)}[lift]
            body = lift_paw(body, x0, x1, 44 + ph, 6, 6)
        if bob:
            body = bob_head(body, 24, bob)
        out.append(ground(over(shift(tl, -5 + tail[0], -12 + tail[1]), body)))
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


def walk_head_swap(kind, scale, at):
    """the approved side-walk body with the profile head replaced by the
    three-quarter head (toward us) or the rear head (away), re-sampled from
    the reference to the walking cat's head size"""
    head = head_from_reference(kind, scale)
    out = []
    for k in range(3):
        a = erase(load('walk_side', k), 1, 8, 24, 32)
        paste(a, head, *at)
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
    a = load('walk_side', 2)
    return [shift(a, 0, -7)]


def leap_front():
    wf = walk_front()[1]
    a = lift_paw(wf.copy(), 28, 47, 62, 6, 3)
    return [shift(a, 0, -7)]


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
