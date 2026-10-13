#!/usr/bin/env python3
"""The Y2K themes' avatars, rendered here: four chrome objects, one per model, in three loops each, for a light
and a dark ground. Nothing is footage: every frame is ray-marched from the formulas below (numpy and Pillow).

    python3 footage/y2k.py                 every slot, into assets/
    python3 footage/y2k.py opus            one form
    python3 footage/y2k.py --sheet x.png   one frame of each, side by side (a look before the long run)

Writes assets/<world>-<form>/<loop>/NNN.png (400 by 340, palette PNG) and its manifest.json.
"""
import json
import math
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

W, H, SS = 400, 340, 2          # the feed's shape (reel.ts FEED_SHAPE); rendered at twice the size, then halved
EYE, LENS, REACH = 3.4, 0.40, 1.7
TAU = 2 * math.pi
OUT = Path(__file__).resolve().parent.parent / 'assets'


def rot(p, axis, a):
    """Points turned by -a about an axis: the object turns by a."""
    i, j = [(1, 2), (2, 0), (0, 1)]['xyz'.index(axis)]
    c, s = math.cos(a), math.sin(a)
    q = p.copy()
    q[:, i] = c * p[:, i] + s * p[:, j]
    q[:, j] = -s * p[:, i] + c * p[:, j]
    return q


def smin(a, b, k):
    h = np.clip(0.5 + 0.5 * (b - a) / k, 0, 1)
    return b + (a - b) * h - k * h * (1 - h)


def ribbon(p, radius, half, thick, turns, flow):
    """A flat band bent into a ring and twisted `turns` times along it; `flow` slides the twist around."""
    a = np.arctan2(p[:, 2], p[:, 0])
    qx, qy = np.hypot(p[:, 0], p[:, 2]) - radius, p[:, 1]
    th = turns * a + flow
    c, s = np.cos(th), np.sin(th)
    dx, dy = np.abs(c * qx + s * qy) - half, np.abs(-s * qx + c * qy) - thick
    return np.hypot(np.maximum(dx, 0), np.maximum(dy, 0)) + np.minimum(np.maximum(dx, dy), 0) - 0.03


def torus(p, radius, tube):
    return np.hypot(np.hypot(p[:, 0], p[:, 2]) - radius, p[:, 1]) - tube


def bicone(r, y, height, base):
    n = math.hypot(height, base)
    return (r * height + np.abs(y) * base - height * base) / n


# --- the four objects: a distance field of the point and of u, the loop's place from 0 to 1; `e` is how hard it works (0 at rest) ---

def seraph(p, u, e):
    """Opus: two twisted ribbons of glass, one inside the other, their twists flowing against each other."""
    p = rot(rot(p / 0.84, 'x', 1.0 + 0.16 * math.sin(TAU * u)), 'z', 0.35 + 0.12 * math.cos(TAU * u))
    outer = ribbon(p, 0.86, 0.36, 0.045, 1.5, math.pi * u * (1 + e))
    q = rot(rot(p, 'x', 1.25), 'y', TAU * u)
    inner = ribbon(q, 0.42, 0.2, 0.04, 0.5, -math.pi * u * (1 + 2 * e))
    return np.minimum(outer, inner) * 0.84, 0.5


def lumen(p, u, e):
    """Sonnet: liquid metal, five drops that merge and part."""
    d = None
    for i, (size, fx, fy, fz) in enumerate([(0.52, 1, 1, 2), (0.4, 2, 1, 1), (0.36, 1, 2, 1), (0.33, 2, 2, 1), (0.3, 1, 1, 1)]):
        reach = (0.5 + 0.12 * e) if i else 0.18
        c = reach * np.array([math.sin(TAU * (fx * u + i * 0.21)), math.sin(TAU * (fy * u + i * 0.37)), 0.7 * math.cos(TAU * (fz * u + i * 0.13))])
        one = np.linalg.norm(p / 1.18 - c.astype(np.float32), axis=1) - size
        d = one if d is None else smin(d, one, 0.42)
    return d * 1.18, 0.8


def spark(p, u, e):
    """Haiku: a four-point star turning on its long axis, two beads circling it."""
    p = rot(p, 'z', 0.22 + 0.06 * math.sin(TAU * u))
    q = rot(p, 'y', math.pi * u * (1 + e))
    star = smin(bicone(np.hypot(q[:, 0], q[:, 2]), q[:, 1], 1.18, 0.27), bicone(np.hypot(q[:, 1], q[:, 2]), q[:, 0], 0.8, 0.23), 0.1)
    star = smin(star, bicone(np.hypot(q[:, 0], q[:, 1]), q[:, 2], 0.4, 0.3), 0.1) - 0.015
    b = rot(rot(p, 'x', 0.5), 'y', -math.pi * u * (1 + e))
    bead = np.linalg.norm(np.abs(b) - np.array([0.98, 0, 0], np.float32), axis=1) - 0.085
    return np.minimum(star, bead), 0.7


def halo(p, u, e):
    """Fable: a core in three rings, each turning on its own axis."""
    p = rot(p, 'x', 0.35)
    d = np.linalg.norm(p, axis=1) - (0.33 + 0.03 * e * math.sin(2 * TAU * u))
    d = np.minimum(d, torus(rot(p, 'x', math.pi * u * (1 + e)), 0.6, 0.05))
    d = np.minimum(d, torus(rot(rot(p, 'z', 0.9), 'x', -math.pi * u), 0.84, 0.05))
    d = np.minimum(d, torus(rot(rot(p, 'x', 1.2), 'z', math.pi * u * (1 + e)), 1.08, 0.05))
    return d, 0.85


# name, field, hue of the metal, how much it shifts hue across a curve (the film of oil on chrome)
FORMS = {
    'opus': ('SERAPH', seraph, (0.16, 0.72, 0.68), 0.05),
    'sonnet': ('LUMEN', lumen, (0.17, 0.33, 0.95), 0.05),
    'haiku': ('SPARK', spark, (0.62, 0.66, 0.86), 0.22),
    'fable': ('HALO', halo, (0.6, 0.36, 0.92), 0.16),
}
# loop: frames, ms a frame, effort, how far the room turns around the object (in thirds of a turn: it has three lamps)
LOOPS = {'drift': (60, 45, 0.0, 1), 'surge': (30, 45, 1.0, 2), 'flare': (30, 45, 0.0, 1)}   # 45 ms: the feed's own clock (register.tsx FEED_MS), twenty-two frames a second
MOODS = {'idle': ['drift'], 'working': ['surge'], 'happy': ['flare'], 'worried': ['drift']}
SPEECH = {
    'opus': ('STREAMLINED. STANDING BY.', 'BENDING LIGHT...', 'BUILT FROM MEMORY AND LIGHT.'),
    'sonnet': ('LIQUID. CALM. ONLINE.', 'POURING CHROME...', 'SMOOTH AS MERCURY.'),
    'haiku': ('ONE SPARK, ON STANDBY.', 'SPINNING UP...', 'DONE IN A FLASH.'),
    'fable': ('ORBIT STABLE.', 'ALIGNING THE RINGS...', 'THE FUTURE IS STILL YOURS.'),
}
WORLDS = {'y2k': True, 'y2kdark': False}   # world: is its ground light


def rays():
    ys, xs = np.mgrid[0:H * SS, 0:W * SS].astype(np.float32)
    d = np.stack([((xs + 0.5) / (W * SS) * 2 - 1) * LENS * W / H, (1 - (ys + 0.5) / (H * SS) * 2) * LENS, -np.ones_like(xs)], -1).reshape(-1, 3)
    return d / np.linalg.norm(d, axis=1, keepdims=True)


RAYS = rays()
ORIGIN = np.array([0, 0, EYE], np.float32)


def trace(field, u, e, lift):
    """Where each ray meets the object: a mask, the normals and the rays reflected."""
    def dist(p):
        p = p - np.array([0, lift, 0], np.float32)
        return field(p, u, e)

    along = RAYS[:, 2] * -EYE
    live = np.nonzero(EYE * EYE - along * along < REACH * REACH)[0]
    t = np.full(len(RAYS), EYE - REACH, np.float32)
    hit = np.zeros(len(RAYS), bool)
    for _ in range(110):
        d, pace = dist(ORIGIN + RAYS[live] * t[live, None])
        t[live] += d * pace
        near = d < 0.002
        hit[live[near]] = True
        live = live[~near & (t[live] < EYE + REACH)]
        if len(live) == 0:
            break
    at = np.nonzero(hit)[0]
    p = ORIGIN + RAYS[at] * t[at, None]
    n = np.zeros_like(p)
    for k in ([1, -1, -1], [-1, -1, 1], [-1, 1, -1], [1, 1, 1]):
        k = np.array(k, np.float32)
        n += k * dist(p + k * 0.003)[0][:, None]
    n /= np.linalg.norm(n, axis=1, keepdims=True) + 1e-9
    v = RAYS[at]
    facing = np.clip(-(n * v).sum(1), 0, 1)
    return at, n, v - 2 * (n * v).sum(1, keepdims=True) * n, facing


def step(lo, hi, x):
    x = np.clip((x - lo) / (hi - lo), 0, 1)
    return x * x * (3 - 2 * x)


def chrome(n, r, facing, hue, film, is_light, turn):
    """The metal: the room it mirrors (a pale sky, a dark line at the horizon, three tall lamps), a key light, the film's hue."""
    hue = np.array(hue, np.float32)
    white = np.ones(3, np.float32)
    if is_light:
        zenith, rim, pit, floor = hue * 0.62, white, hue * 0.1, hue * 0.3 + 0.62
    else:
        zenith, rim, pit, floor = hue * 0.2, hue * 0.35 + 0.65, hue * 0.02, hue * 0.5
    y = r[:, 1:2]
    az = np.arctan2(r[:, 0], r[:, 2])[:, None] + turn
    sky = rim + (zenith - rim) * step(0, 0.9, y)
    ground = pit + (floor - pit) * step(0.02, 0.8, -y)
    col = ground + (sky - ground) * step(-0.03, 0.03, y)
    lamps = step(0.5, 0.86, np.cos(3 * az)) * step(-0.25, 0.3, y) * (1 - step(0.7, 0.95, y))
    col = col + lamps * (1.1 if is_light else 1.5)
    col = col * (0.82 + 0.18 * (1 - facing[:, None]) ** 5 / 1)
    if film:
        col = col * (1 + film * np.cos(TAU * (facing[:, None] * 1.4 + np.array([0, 1 / 3, 2 / 3], np.float32))))
    key = np.array([-0.45, 0.7, 0.55], np.float32)
    key /= np.linalg.norm(key)
    return col + 2.2 * np.clip((r * key).sum(1, keepdims=True), 0, 1) ** 90


def blur(a, radius):
    """A float picture blurred: Pillow does it a channel at a time, on 8 bits (enough for a glow)."""
    a = np.atleast_3d(a)
    return np.dstack([np.asarray(Image.fromarray((np.clip(a[:, :, i], 0, 1) * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(radius)), np.float32) / 255 for i in range(a.shape[2])])


def halve(a):
    return a.reshape(H, SS, W, SS, -1).mean((1, 3))


def frame(form, loop, i, world):
    name, field, hue, film = FORMS[form]
    count, _ms, effort, thirds = LOOPS[loop]
    u = i / count
    is_light = WORLDS[world]
    happy = loop == 'flare'
    lift = 0.09 * math.sin(TAU * u) * (2 if happy else 1 if effort else 0.5)
    at, n, r, facing = trace(field, u, effort, lift)
    big = np.zeros((H * SS * W * SS, 4), np.float32)
    big[at, :3] = chrome(n, r, facing, hue, film, is_light, TAU / 3 * thirds * u)
    big[at, 3] = 1
    small = halve(big)
    obj, mask = small[:, :, :3], small[:, :, 3:]
    tint = np.array(hue, np.float32)

    ys, xs = np.mgrid[0:H, 0:W].astype(np.float32)
    far = np.hypot((xs - W / 2) / W, (ys - H / 2) / H)[:, :, None]
    if is_light:
        # A white room: ice blue creeping in from the corners, a soft tinted shadow under the object.
        ground = 1 - (1 - (tint * 0.25 + 0.72)) * step(0.15, 0.75, far) * 0.55
        shade = blur(np.roll(mask, 22, 0), 16)
        ground = ground * (1 - shade * 0.42 * (1 - tint * 0.6))
    else:
        # Night: near-black navy, the metal's own colour glowing behind it.
        ground = np.array([0.018, 0.03, 0.075], np.float32) + tint * 0.05 * (1 - step(0, 0.7, far))
        ground = ground + blur(mask, 30) * tint * 0.3
    out = ground * (1 - mask) + obj
    # What is brighter than white bleeds: a bloom, and a four-point glint where the light is hardest (the star of every chrome poster).
    hot = np.clip(obj.max(2, keepdims=True) - 1.0, 0, 1.2) * mask
    pulse = (0.75 + 0.6 * math.sin(TAU * u) ** 2) if happy else 0.55 + 0.25 * effort
    out = out + blur(hot, 5) * (1.0 if is_light else 1.6) * (tint * 0.4 + 0.6)
    glint = np.zeros_like(hot)
    for k in range(1, 46):
        fall = (1 - k / 46) ** 2.2 * 0.09
        glint += fall * (np.roll(hot, k, 1) + np.roll(hot, -k, 1) + (np.roll(hot, k, 0) + np.roll(hot, -k, 0)) * 0.7)
    out = out + blur(glint, 0.8) * pulse * (0.75 if is_light else 1.3)
    out = np.clip(out, 0, 1)
    return Image.fromarray((out * 255 + 0.5).astype(np.uint8))


def write(form):
    for world in WORLDS:
        slot = OUT / f'{world}-{form}'
        for loop, (count, _ms, _e, _t) in LOOPS.items():
            (slot / loop).mkdir(parents=True, exist_ok=True)
            for i in range(count):
                frame(form, loop, i, world).quantize(192, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE).save(slot / loop / f'{i:03d}.png', optimize=True)
            print(f'{slot.name}/{loop}: {count} frames', flush=True)
        idle, working, happy = SPEECH[form]
        manifest = {
            'name': FORMS[form][0],
            'speech': {'idle': idle, 'working': working, 'happy': happy},
            'clips': {loop: {'frames': count, 'ms': ms, 'what': FORMS[form][1].__doc__.strip()} for loop, (count, ms, _e, _t) in LOOPS.items()},
            'moods': MOODS,
        }
        (slot / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')


def sheet(path):
    cells = [frame(form, 'drift', 6, world) for world in WORLDS for form in FORMS]
    out = Image.new('RGB', (W * len(FORMS), H * len(WORLDS)))
    for k, cell in enumerate(cells):
        out.paste(cell, (W * (k % len(FORMS)), H * (k // len(FORMS))))
    out.save(path)


if __name__ == '__main__':
    args = sys.argv[1:]
    if args[:1] == ['--sheet']:
        sheet(args[1])
    else:
        for one in args or FORMS:
            write(one)
