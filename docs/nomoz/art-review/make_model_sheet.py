"""Exports the single protagonist model and builds its inspection sheet:
native PNG, enlarged inspection view, gameplay-size views, silhouette and a
proportion overlay. Whole-number nearest-neighbour scaling only."""
import os
from PIL import Image, ImageDraw
import model_swordsman
from pixlib import hexc

HERE = os.path.dirname(os.path.abspath(__file__))
NAME = 'protagonist_model_swordsman_40x47.png'

def scaled(im, k):
    return im.resize((im.width * k, im.height * k), Image.NEAREST)

def bg_panel(sprite, k, bg, tile=None, pad=12, label=None):
    w, h = sprite.width * k + 2 * pad, sprite.height * k + 2 * pad
    base = Image.new('RGBA', (w, h), hexc(bg))
    d = ImageDraw.Draw(base)
    if tile:
        t = 16 * k
        for gy in range(0, h, t):
            for gx in range(0, w, t):
                if ((gx // t) + (gy // t)) % 2 == 0:
                    d.rectangle([gx, gy, gx + t - 1, gy + t - 1], fill=hexc(tile))
    base.alpha_composite(scaled(sprite, k), (pad, pad))
    return base

def silhouette(sprite):
    sil = Image.new('RGBA', sprite.size, (0, 0, 0, 0))
    px, out = sprite.load(), sil.load()
    for y in range(sprite.height):
        for x in range(sprite.width):
            if px[x, y][3]:
                out[x, y] = (20, 20, 28, 255)
    return sil

def overlay(sprite, k):
    base = bg_panel(sprite, k, '#e8e2ee')
    d = ImageDraw.Draw(base)
    pad = 12
    for y, col in ((0, '#d03a3a'), (23, '#2a7fd0'), (26, '#2aa05a'), (35, '#c98a1a'), (39, '#9a3ad0'), (55, '#d03a3a')):
        d.line([(0, pad + y * k), (base.width, pad + y * k)], fill=hexc(col), width=1)
    return base

def main():
    c = model_swordsman.build()
    sprite = c.im
    sprite.save(os.path.join(HERE, NAME))
    panels = [
        bg_panel(sprite, 12, '#2a2f3a'),                       # enlarged inspection
        bg_panel(sprite, 3, '#2f5a3a', '#35653f'),             # gameplay size 3x
        bg_panel(sprite, 3, '#d9d2c0', '#cfc7b3'),
        bg_panel(sprite, 2, '#2f5a3a', '#35653f'),             # compact 2x
        bg_panel(sprite, 1, '#14161d'),                        # native
        bg_panel(silhouette(sprite), 4, '#e8e2ee'),            # silhouette
        overlay(sprite, 4),                                    # proportion lines
    ]
    H = max(p.height for p in panels); W = sum(p.width for p in panels) + 8 * (len(panels) - 1)
    sheet = Image.new('RGBA', (W, H), (0, 0, 0, 255))
    x = 0
    for p in panels:
        sheet.alpha_composite(p, (x, 0)); x += p.width + 8
    sheet.save(os.path.join(HERE, 'protagonist_model_review.png'))
    # measurements for the report
    px = sprite.load(); bbox = sprite.getbbox()
    def width_at(y):
        xs = [x for x in range(sprite.width) if px[x, y][3]]
        return (max(xs) - min(xs) + 1) if xs else 0
    print('native', sprite.size, 'bbox', bbox, 'sheet', sheet.size)
    print('width at y: hair(8)', width_at(8), 'face(15)', width_at(15), 'shoulders(27)', width_at(27), 'waist(35)', width_at(35), 'hem(39)', width_at(39), 'legs(46)', width_at(46))

if __name__ == '__main__':
    main()
