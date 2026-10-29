"""
Writes the tail pixels of the approved frames into art/tails.json (the generated frames record theirs in
generate_production.py). Approved art is only read: a tail is the set of opaque pixels of the frame inside a
hand-drawn polygon that cuts it from the body. The renderer sways those pixels at run time (renderer.js);
they are never written back to the art.

  python3 art/source/tail_regions.py [debug.png]      (Pillow + numpy)
"""
import json
import sys
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw

ART = Path(__file__).resolve().parent.parent
W, H = 96, 64

# art folder -> (polygon in frame pixels, base of the tail, tip of the tail), the same for every frame of the folder
REGIONS = {
    'idle_front': ([(55, 27), (82, 27), (82, 60), (53, 60), (53, 52), (55, 46)], (56, 55), (60, 34)),
    'sit_threeq': ([(59, 26), (82, 26), (82, 62), (57, 62), (57, 56), (59, 46)], (60, 57), (63, 31)),
    'sit_groom': ([(62, 26), (82, 26), (82, 62), (61, 62), (61, 56), (62, 46)], (62, 57), (67, 30)),
    'sit_doze': ([(61, 45), (82, 45), (82, 62), (59, 62), (59, 55)], (60, 56), (68, 48)),
    'sit_rear': ([(57, 34), (82, 34), (82, 62), (56, 62), (56, 56), (57, 46)], (57, 57), (64, 40)),
    # the tail is down and trailing in frame 0, up in frames 1 and 2 (the hind leg hangs below it)
    'walk_side': [([(64, 24), (96, 24), (96, 52), (72, 57), (66, 49)], (64, 34), (90, 46)),
                  ([(64, 2), (96, 2), (96, 36), (68, 43), (64, 38)], (65, 38), (77, 10)),
                  ([(64, 2), (96, 2), (96, 36), (68, 43), (64, 38)], (65, 38), (77, 10))],
    'stretch': ([(68, 10), (96, 10), (96, 40), (68, 40)], (66, 33), (90, 17)),
}


def main():
    path = ART / 'tails.json'
    data = json.loads(path.read_text()) if path.exists() else {}
    dbg = Image.new('RGBA', (W * 4 * 4, H * 4 * 8), (30, 30, 36, 255))
    row = 0
    for name, spec in REGIONS.items():
        frames = sorted((ART / name).glob('[0-9].png'))
        out = []
        for col, f in enumerate(frames):
            poly, base, tip = spec[col] if isinstance(spec, list) else spec
            region = Image.new('L', (W, H), 0)
            ImageDraw.Draw(region).polygon(poly, fill=255)
            region = np.array(region) > 0
            a = np.array(Image.open(f).convert('RGBA'))
            tm = region & (a[..., 3] > 0)
            ys, xs = np.where(tm)
            x0, x1, y0, y1 = int(xs.min()), int(xs.max()), int(ys.min()), int(ys.max())
            rows = [''.join('#' if tm[y, x] else '.' for x in range(x0, x1 + 1)) for y in range(y0, y1 + 1)]
            out.append({'x': x0, 'y': y0, 'rows': rows, 'base': list(base), 'tip': list(tip)})
            im = Image.fromarray(a, 'RGBA').resize((W * 4, H * 4), Image.NEAREST)
            px = im.load()
            for y in range(H * 4):
                for x in range(W * 4):
                    r, g, b, al = px[x, y]
                    if al:
                        k = 3 if max(r, g, b) < 110 else 1
                        c = (min(255, r * k + 30), min(255, g * k + 30), min(255, b * k + 34))
                        if tm[y // 4, x // 4]: c = (255, 120, 80)
                        px[x, y] = c + (255,)
            if col < 4: dbg.paste(im, (col * W * 4, row * H * 4), im)
        data[name] = out
        row += 1
    path.write_text(json.dumps(dict(sorted(data.items())), indent=0, separators=(',', ':')) + '\n')
    if len(sys.argv) > 1: dbg.save(sys.argv[1])
    print('tails for', ', '.join(REGIONS))


if __name__ == '__main__':
    main()
