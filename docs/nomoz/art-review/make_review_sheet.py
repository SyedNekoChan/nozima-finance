"""Builds the native-resolution PNGs and a review sheet for the two sample
sprites. Scaling is nearest-neighbour by whole numbers only."""
import os
from PIL import Image, ImageDraw
import protagonist, creature, hunter, gustwing
from pixlib import hexc

HERE = os.path.dirname(os.path.abspath(__file__))

def scaled(im, k):
    return im.resize((im.width * k, im.height * k), Image.NEAREST)

def panel(sprite, k, bg, tile=None, pad=10):
    w, h = sprite.width * k + 2 * pad, sprite.height * k + 2 * pad
    base = Image.new('RGBA', (w, h), hexc(bg))
    if tile:
        d = ImageDraw.Draw(base)
        t = 16 * k
        for gy in range(0, h, t):
            for gx in range(0, w, t):
                if ((gx // t) + (gy // t)) % 2 == 0:
                    d.rectangle([gx, gy, gx + t - 1, gy + t - 1], fill=hexc(tile))
    base.alpha_composite(scaled(sprite, k), (pad, pad))
    return base

def row(sprite, name):
    ks = [(1, '#14161d', None), (3, '#2f5a3a', '#35653f'), (3, '#d9d2c0', '#cfc7b3'), (3, '#0a0a0f', None), (7, '#1d2230', None)]
    panels = [panel(sprite, k, bg, tile) for k, bg, tile in ks]
    H = max(p.height for p in panels)
    W = sum(p.width for p in panels) + 6 * (len(panels) - 1)
    out = Image.new('RGBA', (W, H), hexc('#000000'))
    x = 0
    for p in panels:
        out.alpha_composite(p, (x, 0)); x += p.width + 6
    return out

def sheet_for(a_im, b_im):
    r1, r2 = row(a_im, 'a'), row(b_im, 'b')
    W = max(r1.width, r2.width)
    sheet = Image.new('RGBA', (W, r1.height + r2.height + 6), hexc('#000000'))
    sheet.alpha_composite(r1, (0, 0)); sheet.alpha_composite(r2, (0, r1.height + 6))
    return sheet

def main():
    # round 1: first samples
    p, c = protagonist.build(), creature.build()
    p.im.save(os.path.join(HERE, 'protagonist_swordsman_44x58.png'))
    c.im.save(os.path.join(HERE, 'creature_emberfox_52x46.png'))
    sheet_for(p.im, c.im).save(os.path.join(HERE, 'review_sheet_round1.png'))
    # round 2: direction taken from the owner's reference images
    h, g = hunter.build(), gustwing.build()
    h.im.save(os.path.join(HERE, 'protagonist_hunter_58x70.png'))
    g.im.save(os.path.join(HERE, 'creature_gustwing_66x58.png'))
    s2 = sheet_for(h.im, g.im); s2.save(os.path.join(HERE, 'review_sheet_round2.png'))
    print('round1', p.im.size, c.im.size, 'round2', h.im.size, g.im.size, 'sheet2', s2.size)

if __name__ == '__main__':
    main()
