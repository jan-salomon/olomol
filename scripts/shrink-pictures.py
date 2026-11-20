#!/usr/bin/env python3
"""The manuals' screenshots as PNGs of 256 colours: about a third of their size, the same to the eye (a
screenshot's colours are flat: the app's, its text anti-aliased), so the PDFs are a third as large too.
scripts/manual-shots.mjs runs it on the pictures it takes; by hand:

    python3 scripts/shrink-pictures.py docs/img docs/en/img

Needs Pillow (Fedora: python3-pillow). A picture already in 256 colours, or one that wouldn't get smaller,
is left as it is."""
import os
import sys

from PIL import Image


def shrink(path):
    image = Image.open(path)
    if image.mode == 'P':
        return None
    before = os.path.getsize(path)
    # (median cut keeps the app's flat colours exact; a picture with see-through parts needs the octree)
    if 'A' in image.getbands():
        small = image.convert('RGBA').quantize(256, method=Image.Quantize.FASTOCTREE, dither=Image.Dither.NONE)
    else:
        small = image.convert('RGB').quantize(256, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)
    out = path + '.small'
    small.save(out, format='PNG', optimize=True)
    after = os.path.getsize(out)
    if after >= before:
        os.remove(out)
        return None
    os.replace(out, path)
    return before, after


def main(folders):
    total = [0, 0]
    for folder in folders:
        for name in sorted(os.listdir(folder)):
            if not name.endswith('.png'):
                continue
            done = shrink(os.path.join(folder, name))
            if done:
                total[0] += done[0]
                total[1] += done[1]
    if total[0]:
        print(f'pictures: {total[0] / 1e6:.1f} MB → {total[1] / 1e6:.1f} MB')


if __name__ == '__main__':
    main(sys.argv[1:] or ['docs/img', 'docs/en/img'])
