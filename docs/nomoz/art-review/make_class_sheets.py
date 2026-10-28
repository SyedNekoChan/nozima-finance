"""Exports the five class models (one static front pose each) and builds the
review sheets. Whole-number nearest-neighbour scaling only; every model is
bottom-aligned so the feet share one baseline."""
import os
from PIL import Image, ImageDraw
import model_swordsman, model_hunter, model_assassin, model_mage, model_necromancer
from pixlib import hexc

HERE = os.path.dirname(os.path.abspath(__file__))
MODELS = [('swordsman', model_swordsman), ('hunter', model_hunter), ('assassin', model_assassin),
          ('mage', model_mage), ('necromancer', model_necromancer)]

def scaled(im, k):
    return im.resize((im.width * k, im.height * k), Image.NEAREST)

def silhouette(im):
    out = Image.new('RGBA', im.size, (0, 0, 0, 0)); px, o = im.load(), out.load()
    for y in range(im.height):
        for x in range(im.width):
            if px[x, y][3]: o[x, y] = (20, 20, 28, 255)
    return out

def row(ims, k, bg, tile=None, pad=10, gap=10):
    H = max(i.height for i in ims) * k + 2 * pad
    W = sum(i.width * k + gap for i in ims) + 2 * pad - gap
    base = Image.new('RGBA', (W, H), hexc(bg))
    d = ImageDraw.Draw(base)
    if tile:
        t = 16 * k
        for gy in range(0, H, t):
            for gx in range(0, W, t):
                if ((gx // t) + (gy // t)) % 2 == 0:
                    d.rectangle([gx, gy, gx + t - 1, gy + t - 1], fill=hexc(tile))
    x = pad
    for i in ims:
        big = scaled(i, k)
        base.alpha_composite(big, (x, H - pad - big.height)); x += big.width + gap
    return base

def stack(parts, gap=8):
    W = max(p.width for p in parts); H = sum(p.height for p in parts) + gap * (len(parts) - 1)
    sheet = Image.new('RGBA', (W, H), (0, 0, 0, 255)); y = 0
    for p in parts:
        sheet.alpha_composite(p, (0, y)); y += p.height + gap
    return sheet

def main():
    sprites = []
    for name, m in MODELS:
        im = m.build().im
        sprites.append(im)
        if name != 'swordsman':   # the approved Swordsman keeps its existing file
            im.save(os.path.join(HERE, 'protagonist_model_%s_%dx%d.png' % (name, im.width, im.height)))
    stack([row(sprites, 3, '#2f5a3a', '#35653f'), row(sprites, 2, '#d9d2c0', '#cfc7b3'),
           row(sprites, 1, '#14161d'), row([silhouette(i) for i in sprites], 3, '#e8e2ee')]).save(os.path.join(HERE, 'class_lineup_review.png'))
    row(sprites, 9, '#2a2f3a').save(os.path.join(HERE, 'class_models_inspection.png'))
    print([(n, i.size) for (n, _), i in zip(MODELS, sprites)])

if __name__ == '__main__':
    main()
