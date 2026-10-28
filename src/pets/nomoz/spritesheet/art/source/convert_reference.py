"""
Converts the user's reference sheet (reference.webp, a 1024x1024 concept
image with a visible pixel grid) into 96x64 sprite frames in ../<clip>/<n>.png.

  python3 art/source/convert_reference.py     (needs Pillow and numpy)

How: the cats are dark blobs on a grey grid. The grid lines are thin, so a
morphological opening removes them; each cat's box (found once and listed
below) is area-averaged down at SCALE (0.275: one sprite pixel per ~3.6
reference pixels, the same density as the procedural cat), the colours are
quantised to a 10 fur + 4 eye-yellow palette shared by every frame, stray
edge speckles are dropped, and the result is placed on a 96x64 canvas, feet
on row 61. Poses that face right in the reference are flipped, because sprite
frames are authored facing LEFT (see ../../SPEC.md).

This is a mechanical conversion of the reference, not new art. Frames can be
hand-finished in SpriteForge afterwards; the PNGs in ../<clip>/ are the source
of truth once edited, so do not re-run this over hand-finished frames.
"""
from pathlib import Path
import numpy as np
from PIL import Image, ImageFilter

HERE = Path(__file__).resolve().parent
OUT = HERE.parent
FRAME_W, FRAME_H, FLOOR = 96, 64, 62
SCALE = 0.275

# clip -> (frame boxes in the reference [x0, y0, x1, y1], flip, scale, align)
# align: 'center' centres each frame; 'left' keeps a shared left edge
CLIPS = {
    'idle_front': ([(81, 61, 251, 257), (327, 61, 497, 257), (573, 61, 743, 257), (824, 61, 994, 257)], False, SCALE, 'first-left'),
    'walk_side': ([(20, 317, 338, 502), (369, 302, 666, 502), (691, 302, 999, 502)], True, SCALE, 'head-left'),
    'sit_threeq': ([(76, 543, 312, 763)], False, SCALE, 'center'),
    'sit_doze': ([(543, 553, 717, 758)], False, SCALE, 'center'),
    'sit_groom': ([(773, 548, 998, 758)], False, SCALE, 'center'),
    'sit_rear': ([(829, 778, 1004, 1004)], False, SCALE, 'center'),
    'curl': ([(538, 840, 737, 973)], False, SCALE, 'center'),
    'stretch': ([(67, 778, 502, 1004)], False, 0.21, 'center'),
}

im = Image.open(HERE / 'reference.webp').convert('RGB')
A = np.array(im).astype(float)
lum = A.sum(2) / 3
yellow = (A[..., 0] > 170) & (A[..., 1] > 130) & (A[..., 2] < 150) & (A[..., 0] - A[..., 2] > 50)
raw = (lum < 85) | yellow
opened = Image.fromarray((raw * 255).astype('uint8')).filter(ImageFilter.MinFilter(5)).filter(ImageFilter.MaxFilter(5))
grown = opened.filter(ImageFilter.MaxFilter(7))
MASK = (np.array(grown) > 0) & raw


def is_yellow(c):
    return c[0] > 150 and c[1] > 110 and c[2] < 170 and c[0] - c[2] > 40


def downsample(box, scale, flip):
    x0, y0, x1, y1 = box
    w, h = x1 - x0, y1 - y0
    tw, th = max(1, round(w * scale)), max(1, round(h * scale))
    m = MASK[y0:y1, x0:x1].astype(float)
    c = A[y0:y1, x0:x1]
    ma = np.array(Image.fromarray((m * 255).astype('uint8')).resize((tw, th), Image.BOX)).astype(float) / 255
    cc = np.array(Image.fromarray((c * m[..., None]).astype('uint8')).resize((tw, th), Image.BOX)).astype(float)
    col = np.where(ma[..., None] > 0, cc / np.maximum(ma[..., None], 1e-6), 0)
    out = np.zeros((th, tw, 4), 'uint8')
    out[..., :3] = np.clip(col, 0, 255).astype('uint8')
    out[..., 3] = np.where(ma >= 0.5, 255, 0)
    img = Image.fromarray(out, 'RGBA')
    return img.transpose(Image.FLIP_LEFT_RIGHT) if flip else img


def palette(images, n_fur=10, n_eye=4):
    fur, eye = [], []
    for img in images:
        a = np.array(img)
        for c in a[a[..., 3] > 0][:, :3]:
            (eye if is_yellow(c) else fur).append(c)

    def q(px, n):
        big = Image.fromarray(np.array(px).reshape(1, -1, 3).astype('uint8'))
        return np.array(big.quantize(n, method=Image.MEDIANCUT, dither=Image.NONE).getpalette()[: n * 3]).reshape(-1, 3)

    return q(fur, n_fur), q(eye, n_eye)


def clean(img, fur, eye):
    a = np.array(img)
    h, w = a.shape[:2]
    op = a[..., 3] > 0
    o = a.copy()
    for y in range(h):
        for x in range(w):
            if not op[y, x]:
                continue
            nb = sum(
                1
                for dy in (-1, 0, 1)
                for dx in (-1, 0, 1)
                if (dy or dx) and 0 <= y + dy < h and 0 <= x + dx < w and op[y + dy, x + dx]
            )
            if nb <= 2 and not is_yellow(a[y, x, :3]):
                o[y, x, 3] = 0
    # the reference sheet has text labels near some cats ("MISC POSES"): keep
    # only the largest connected shape
    alive = o[..., 3] > 0
    seen = np.zeros(alive.shape, bool)
    best = []
    for y0 in range(h):
        for x0 in range(w):
            if alive[y0, x0] and not seen[y0, x0]:
                stack, comp = [(y0, x0)], []
                seen[y0, x0] = True
                while stack:
                    cy, cx = stack.pop()
                    comp.append((cy, cx))
                    for dy in (-1, 0, 1):
                        for dx in (-1, 0, 1):
                            ny, nx = cy + dy, cx + dx
                            if 0 <= ny < h and 0 <= nx < w and alive[ny, nx] and not seen[ny, nx]:
                                seen[ny, nx] = True
                                stack.append((ny, nx))
                if len(comp) > len(best):
                    best = comp
    keep = np.zeros(alive.shape, bool)
    for cy, cx in best:
        keep[cy, cx] = True
    o[~keep, 3] = 0
    for y in range(h):
        for x in range(w):
            if o[y, x, 3] == 0:
                continue
            c = o[y, x, :3].astype(int)
            cand = eye if is_yellow(c) else fur
            o[y, x, :3] = cand[((cand - c) ** 2).sum(1).argmin()]
    return Image.fromarray(o, 'RGBA')


def main():
    raws = {k: [downsample(b, s, f) for b in boxes] for k, (boxes, f, s, _) in CLIPS.items()}
    fur, eye = palette([i for v in raws.values() for i in v])
    for clip, (boxes, flip, scale, align) in CLIPS.items():
        frames = [clean(i, fur, eye) for i in raws[clip]]
        widest = max(f.size[0] for f in frames)
        folder = OUT / clip
        folder.mkdir(exist_ok=True)
        for n, f in enumerate(frames):
            fw, fh = f.size
            if fw > FRAME_W or fh > FRAME_H - (FRAME_H - FLOOR):
                raise SystemExit(f'{clip} frame {n} is {fw}x{fh}, too big for {FRAME_W}x{FRAME_H}')
            x = (FRAME_W - widest) // 2 if align in ('first-left', 'head-left') else (FRAME_W - fw) // 2
            canvas = Image.new('RGBA', (FRAME_W, FRAME_H), (0, 0, 0, 0))
            canvas.alpha_composite(f, (x, FLOOR - fh))
            canvas.save(folder / f'{n}.png')
        print(clip, len(frames), 'frames, widest', widest)


if __name__ == '__main__':
    main()
