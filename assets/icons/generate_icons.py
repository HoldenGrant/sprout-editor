#!/usr/bin/env python3
"""Generates placeholder PNG icons (16/48/128) for Sprout Editor: a green
circle with a white sprout glyph. Run once at build time:

    python3 assets/icons/generate_icons.py

Not loaded by the extension itself -- output PNGs are what manifest.json
references.
"""
from PIL import Image, ImageDraw

SIZES = [16, 48, 128]
GREEN = (46, 160, 67, 255)  # matches the toolbar button gradient start
DARK_GREEN = (26, 116, 49, 255)

for size in SIZES:
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    pad = max(1, size // 16)
    draw.ellipse([pad, pad, size - pad, size - pad], fill=GREEN, outline=DARK_GREEN, width=max(1, size // 32))

    # Simple sprout glyph: a stem + two symmetric leaves, drawn with
    # primitives so it reads clearly even at 16px without a font/emoji renderer.
    cx, cy = size / 2, size / 2
    stem_w = max(1, size // 14)
    stem_top = cy - size * 0.02
    draw.line([(cx, cy + size * 0.26), (cx, stem_top)], fill='white', width=stem_w)
    leaf_r = size * 0.16
    leaf_offset_x = size * 0.15
    leaf_offset_y = size * 0.10
    # left leaf
    draw.ellipse(
        [cx - leaf_offset_x - leaf_r, stem_top - leaf_offset_y - leaf_r * 0.7,
         cx - leaf_offset_x + leaf_r, stem_top - leaf_offset_y + leaf_r * 0.7],
        fill='white',
    )
    # right leaf (mirrored)
    draw.ellipse(
        [cx + leaf_offset_x - leaf_r, stem_top - leaf_offset_y - leaf_r * 0.7,
         cx + leaf_offset_x + leaf_r, stem_top - leaf_offset_y + leaf_r * 0.7],
        fill='white',
    )

    img.save(f'icon{size}.png')
    print(f'wrote icon{size}.png')
