#!/usr/bin/env python3
"""A video as README's animated picture (docs/readme/*.webp): 960 px wide, 6 frames a second, each frame
stored as what changed from the one before (most of the window stays still), so a 40-second clip is about
half a megabyte. Needs ffmpeg and Pillow.

    python3 scripts/about-videos/clip.py public/about/mechanism.mp4 docs/readme/mechanism.webp
"""
import glob
import os
import subprocess
import sys
import tempfile

from PIL import Image


def clip(video, out, fps=6, width=960, quality=70):
    with tempfile.TemporaryDirectory() as folder:
        subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', video, '-vf', f'fps={fps},scale={width}:-1:flags=lanczos',
                        os.path.join(folder, 'f%04d.png')], check=True)
        frames = [Image.open(f).convert('RGB') for f in sorted(glob.glob(os.path.join(folder, 'f*.png')))]
        frames[0].save(out, save_all=True, append_images=frames[1:], duration=1000 // fps, loop=0, quality=quality, method=6,
                       minimize_size=True, allow_mixed=True)
    print(f'{out}: {len(frames)} frames, {os.path.getsize(out) / 1e6:.2f} MB')


if __name__ == '__main__':
    clip(sys.argv[1], sys.argv[2])
