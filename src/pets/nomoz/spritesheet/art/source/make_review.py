"""
Review sheets for the sprite art (Pillow + numpy):

  python3 art/source/make_review.py   ->   art/review/contact_art.png
                                           art/review/walk_cycles.png

contact_art.png: every art folder, every frame, 3x, fur tones brightened x3.2
(the fur is near-black; the app adds a rim light) with the folder name.
walk_cycles.png: the five walking directions, three frames each, next to the
approved frames they were made from.
"""
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw
from kit import ART, W, H, APPROVED

OUT = Path(ART) / 'review'
OUT.mkdir(exist_ok=True)
BG = (60, 64, 70)


def frames(name):
    d = Path(ART) / name
    return [np.array(Image.open(p).convert('RGBA')) for p in sorted(d.glob('[0-9].png'))]


def boost(im, k=3.2):
    px = im.load()
    for y in range(im.size[1]):
        for x in range(im.size[0]):
            r, g, b = px[x, y][:3]
            if (r, g, b) != BG and max(r, g, b) < 110:
                v = min(255, int(max(r, g, b) * k))
                px[x, y] = (v, v, min(255, v + 8))
    return im


def sheet(rows, scale, label_w=130):
    h = max(1, len(rows)) * (H * scale + 6)
    w = label_w + max(len(r[1]) for r in rows) * (W * scale + 6)
    im = Image.new('RGB', (w, h), BG)
    d = ImageDraw.Draw(im)
    for i, (name, fr) in enumerate(rows):
        y = i * (H * scale + 6) + 3
        d.text((6, y + 4), name, fill=(255, 220, 120) if name in APPROVED else (170, 220, 255))
        for j, f in enumerate(fr):
            tile = Image.new('RGB', (W, H), BG)
            tile.paste(Image.fromarray(f, 'RGBA'), (0, 0), Image.fromarray(f, 'RGBA'))
            im.paste(tile.resize((W * scale, H * scale), Image.NEAREST), (label_w + j * (W * scale + 6), y))
    return boost(im)


names = sorted(p.name for p in Path(ART).iterdir() if p.is_dir() and p.name not in ('source', 'review'))
sheet([(n, frames(n)) for n in names], 3).save(OUT / 'contact_art.png')

rows = []
for v in ('side', 'front', 'frontQ', 'rearQ', 'rear'):
    rows.append((f'walk_{v}', frames(f'walk_{v}')))
sheet(rows, 3).save(OUT / 'walk_cycles.png')
print('wrote', [p.name for p in OUT.iterdir()])
