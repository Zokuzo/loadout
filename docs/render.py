#!/usr/bin/env python3
"""Draws docs/themes.png from the plugin's own files: one card per theme (loadout/colors/<slug>.json and loadout/themes/<slug>.json).
docs/initial-d.png is the four cars of loadout/avatar/hooks/touge.ts, each pixel drawn eight times.
Needs Pillow and a monospace font with box and symbol glyphs (DejaVu Sans Mono): python3 docs/render.py"""
import json
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent / 'loadout'
FONT = '/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf'
BOLD = '/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf'
W, H, PAD, SIZE = 560, 214, 22, 17
ORDER = ['kirby', 'kirby-pink', 'ghostrunner', 'cyberpunk-edgerunners', 'initial-d', 'default', 'y2k', 'y2k-dark']
DARK = {'claude': '#d97757', 'text': '#ffffff', 'inactive': '#999999', 'success': '#4eba65', 'warning': '#ffc107', 'error': '#ff6b80',
        'suggestion': '#b1b9f9', 'permission': '#b1b9f9', 'promptBorder': '#888888', 'bashBorder': '#fd5db1', 'userMessageBackground': '#373737', 'autoAccept': '#af87ff'}


def card(slug):
    pack = json.loads((ROOT / 'themes' / f'{slug}.json').read_text())
    file = ROOT / 'colors' / f'{slug}.json'
    c = {**DARK, **(json.loads(file.read_text())['overrides'] if file.exists() else {})}
    bg = pack['terminal']['background'] or '#1e1e1e'
    img = Image.new('RGB', (W, H), bg)
    d = ImageDraw.Draw(img)
    f, b = ImageFont.truetype(FONT, SIZE), ImageFont.truetype(BOLD, SIZE)
    step = SIZE + 9
    y = PAD
    d.text((PAD, y), pack['name'] if slug != 'default' else 'Built-in themes', font=b, fill=c['claude'])
    x = W - PAD
    for key in ('error', 'warning', 'success', 'suggestion', 'permission', 'claude'):
        x -= 22
        d.rectangle([x, y + 2, x + 16, y + 18], fill=c[key])
    y += step + 8
    # your prompt, framed as the frames part draws it
    d.rounded_rectangle([PAD, y, W - PAD, y + step + 14], radius=6, outline=c['text'], fill=c['userMessageBackground'])
    d.text((PAD + 12, y + 7), '❯ fix the failing test', font=f, fill=c['text'])
    y += step + 26
    d.rectangle([PAD, y, PAD + 10, y + step - 6], fill=c['claude'])
    d.text((PAD + 22, y - 2), 'Found it: an off-by-one in the loop.', font=f, fill=c['text'])
    y += step + 4
    d.text((PAD + 22, y - 2), '+ for (let i = 0; i < n; i++)', font=f, fill=c['success'])
    y += step + 10
    spin = pack.get('spinner')
    if spin:
        icon = spin['frames'][-1]
        d.rectangle([PAD, y, PAD + 10 + SIZE // 2, y + step - 6], fill=c['claude'])
        d.text((PAD + 3, y - 2), icon, font=b, fill=bg)
        d.text((PAD + 30, y - 2), f"{spin['verbs'][0]}…", font=b, fill=c['claude'])
        d.text((PAD + 30 + d.textlength(spin['verbs'][0] + '… ', font=b), y - 2), '(12s · ↓ 1.2k tokens)', font=f, fill=c['inactive'])
    return img


slugs = [s for s in ORDER if (ROOT / 'themes' / f'{s}.json').exists()]
cols = 2
rows = -(-len(slugs) // cols)
GAP = 14
sheet = Image.new('RGB', (cols * W + (cols + 1) * GAP, rows * H + (rows + 1) * GAP), '#08080a')
for i, slug in enumerate(slugs):
    sheet.paste(card(slug), (GAP + (i % cols) * (W + GAP), GAP + (i // cols) * (H + GAP)))
sheet.save(Path(__file__).with_name('themes.png'), optimize=True)
print('wrote', Path(__file__).with_name('themes.png'), len(slugs), 'themes')
