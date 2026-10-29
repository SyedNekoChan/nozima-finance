"""Walking / creeping cycle strips at 5x in the order the manifest plays them (0 1 2 1; the approved walk_side 0 1 2).
  python3 art/source/review_cycles.py out.png [walk|creep]"""
import sys
sys.path.insert(0, '.')
from gen_lib import *
from PIL import ImageDraw
out = sys.argv[1]; kind = sys.argv[2] if len(sys.argv) > 2 else 'walk'
views = ['front', 'frontQ', 'side', 'rearQ', 'rear']
rows = [(f'{kind}_{v}', [0, 1, 2] if f'{kind}_{v}' == 'walk_side' else [0, 1, 2, 1]) for v in views]
Z = 5; boost = 3.4
im = Image.new('RGBA', (4 * (W * Z + 6) + 6, len(rows) * (H * Z + 18) + 6), (66, 70, 80, 255)); d = ImageDraw.Draw(im)
for r, (n, seq) in enumerate(rows):
    d.text((6, 4 + r * (H * Z + 18)), n + ('  (approved)' if n == 'walk_side' else '') + '  ' + str(seq), fill=(255, 233, 168, 255))
    for i, k in enumerate(seq):
        a = load(n, k); x0 = 6 + i * (W * Z + 6); y0 = 16 + r * (H * Z + 18)
        for y in range(H):
            for x in range(W):
                if a[y, x, 3]:
                    c = a[y, x, :3].astype(float); kk = boost if c.max() < 110 else 1
                    d.rectangle([x0 + x * Z, y0 + y * Z, x0 + x * Z + Z - 1, y0 + y * Z + Z - 1], fill=tuple(int(min(255, v * kk)) for v in c) + (255,))
        d.line([(x0, y0 + 62 * Z), (x0 + W * Z, y0 + 62 * Z)], fill=(200, 70, 70, 255))
im.save(out)
