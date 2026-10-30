"""
Builds art/walk_side_even: the approved walk_side frames with ONE tail.

The approved walk_side frames bake three different tails (frame 0 trails low, frames 1 and 2 are raised, each curled
differently), so the tail jumps at every step of the loop, and the run-time tail swing cannot hide that. This writes a
derived folder (the approved PNGs are only read, never written): frame 1 is the approved frame 1 as it is; frames 0 and 2
are the approved bodies, legs and heads with their own tail pixels removed and frame 1's tail pasted at the same root,
the little rump the old tail root covered rebuilt from the body's own colours. The tail pixels are therefore all
approved pixels, and the tail has the same silhouette in every frame; tail.js then swings it.

  python3 art/source/unify_walk_side.py [art dir]            (Pillow + numpy)
"""
import json
import sys
from pathlib import Path
import numpy as np
from PIL import Image

ART = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(__file__).resolve().parent.parent
H, W = 64, 96
OUT = ART / 'walk_side_even'

# how frame k's tail root sits against frame 1's: the pasted tail moves by (dx, dy) so its root meets this frame's back line
OFFSET = {0: (0, -2), 1: (0, 0), 2: (0, 0)}
# frame 0 only: the rump under the old (lower) tail root, rebuilt: rows -> how many columns right of x = 63 the rump reaches
RUMP = {0: {33: 2, 34: 3, 35: 4, 36: 4, 37: 4, 38: 3, 39: 3, 40: 2, 41: 2, 42: 1}}


def mask_of(entry):
    m = np.zeros((H, W), bool)
    for j, row in enumerate(entry['rows']):
        for i, ch in enumerate(row):
            if ch == '#': m[entry['y'] + j, entry['x'] + i] = True
    return m


def main():
    tails = json.loads((ART / 'tails.json').read_text())
    src = [np.array(Image.open(ART / 'walk_side' / f'{k}.png').convert('RGBA')) for k in range(3)]
    masks = [mask_of(e) for e in tails['walk_side']]
    canon, cmask = src[1], masks[1]
    outline = tuple(int(v) for v in src[1][np.where(src[1][..., 3] > 0)][:, :3].min(axis=0))
    OUT.mkdir(exist_ok=True)
    for old in OUT.glob('*.png'): old.unlink()
    entries = []
    for k in range(3):
        f = src[k].copy()
        dx, dy = OFFSET[k]
        pasted = np.zeros((H, W), bool)
        if k != 1:
            f[masks[k]] = 0
            ys, xs = np.where(cmask)
            for y, x in zip(ys, xs):
                Y, X = y + dy, x + dx
                if 0 <= Y < H and 0 <= X < W and not (src[k][Y, X, 3] > 0 and not masks[k][Y, X]):
                    f[Y, X] = canon[y, x]
                    pasted[Y, X] = True
            for y, reach in RUMP.get(k, {}).items():
                for x in range(64, 64 + reach):
                    if f[y, x, 3] == 0 and f[y, 63, 3] > 0:
                        f[y, x] = f[y, 62] if f[y, 62, 3] > 0 else f[y, 63]
                # the rear edge of the rebuilt rump is outlined like the rest of the body
                xe = 63 + reach
                if f[y, xe, 3] > 0: f[y, xe, :3] = outline
        else:
            pasted = cmask.copy()
        Image.fromarray(f, 'RGBA').save(OUT / f'{k}.png')
        ys, xs = np.where(pasted)
        x0, x1, y0, y1 = int(xs.min()), int(xs.max()), int(ys.min()), int(ys.max())
        rows = [''.join('#' if pasted[y, x] else '.' for x in range(x0, x1 + 1)) for y in range(y0, y1 + 1)]
        e = tails['walk_side'][1]
        entries.append({'x': x0, 'y': y0, 'rows': rows, 'base': [e['base'][0] + dx, e['base'][1] + dy], 'tip': [e['tip'][0] + dx, e['tip'][1] + dy]})
    tails['walk_side_even'] = entries
    (ART / 'tails.json').write_text(json.dumps(dict(sorted(tails.items())), indent=0, separators=(',', ':')) + '\n')
    print('walk_side_even: 3 frames, one tail')


if __name__ == '__main__':
    main()
