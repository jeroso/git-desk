#!/usr/bin/env python3
"""Render the git-desk app icon to a transparent 1024x1024 PNG.

We have no SVG rasterizer on this machine (rsvg/cairosvg/magick absent) and
qlmanage flattens SVG transparency onto white, so we draw the icon directly
with Pillow at 4x supersample (then downscale with LANCZOS for anti-aliasing).
The design mirrors build/icon.svg: a navy rounded tile with a commit graph —
orange HEAD, a green feature branch forking out and merging back, a blue trunk,
and a purple older commit — exactly the curved-bezier graph the app renders.

Run:  python3 build/make-icon.py   (outputs build/icon.png)
"""
from PIL import Image, ImageDraw

S = 4                       # supersample factor
N = 1024 * S                # working canvas
def u(v): return int(round(v * S))   # 1024-space -> working-space

def hexc(h):
    h = h.lstrip('#')
    return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16))

NAVY_TOP = hexc('27406e')
NAVY_BOT = hexc('0d1730')
ORANGE = hexc('f0883e')
GREEN  = hexc('3fb950')
BLUE   = hexc('58a6ff')
PURPLE = hexc('bc8cff')

# tile: 104..920 in 1024-space, radius 184 (matches Apple's macOS icon grid)
X0, Y0, X1, Y1, RAD = u(104), u(104), u(920), u(920), u(184)
TH, TW = Y1 - Y0, X1 - X0

base = Image.new('RGBA', (N, N), (0, 0, 0, 0))

# vertical navy gradient, clipped to the rounded tile
col = Image.new('RGBA', (1, TH))
for i in range(TH):
    t = i / (TH - 1)
    col.putpixel((0, i), (
        round(NAVY_TOP[0] + (NAVY_BOT[0] - NAVY_TOP[0]) * t),
        round(NAVY_TOP[1] + (NAVY_BOT[1] - NAVY_TOP[1]) * t),
        round(NAVY_TOP[2] + (NAVY_BOT[2] - NAVY_TOP[2]) * t),
        255,
    ))
grad = Image.new('RGBA', (N, N), (0, 0, 0, 0))
grad.paste(col.resize((TW, TH)), (X0, Y0))

mask = Image.new('L', (N, N), 0)
ImageDraw.Draw(mask).rounded_rectangle([X0, Y0, X1, Y1], radius=RAD, fill=255)
base.paste(grad, (0, 0), mask)

# subtle top sheen (white fade over the top 55% of the tile), clipped to tile
scol = Image.new('RGBA', (1, TH), (0, 0, 0, 0))
sheen_h = int(TH * 0.55)
for i in range(sheen_h):
    scol.putpixel((0, i), (255, 255, 255, round(0.14 * 255 * (1 - i / sheen_h))))
sheen_full = Image.new('RGBA', (N, N), (0, 0, 0, 0))
sheen_full.paste(scol.resize((TW, TH)), (X0, Y0))
sheen = Image.new('RGBA', (N, N), (0, 0, 0, 0))
sheen.paste(sheen_full, (0, 0), mask)
base = Image.alpha_composite(base, sheen)

draw = ImageDraw.Draw(base)

def bezier(p0, p1, p2, p3, n=240):
    pts = []
    for i in range(n + 1):
        t = i / n; mt = 1 - t
        x = mt**3*p0[0] + 3*mt*mt*t*p1[0] + 3*mt*t*t*p2[0] + t**3*p3[0]
        y = mt**3*p0[1] + 3*mt*mt*t*p1[1] + 3*mt*t*t*p2[1] + t**3*p3[1]
        pts.append((x, y))
    return pts

def line(p0, p1, n=240):
    return [(p0[0] + (p1[0]-p0[0])*i/n, p0[1] + (p1[1]-p0[1])*i/n) for i in range(n + 1)]

def stroke(points, color, width):
    """Round-capped, smooth stroke by stamping filled circles along the path."""
    r = width / 2
    for x, y in points:
        draw.ellipse([x - r, y - r, x + r, y + r], fill=color + (255,))

SW = u(30)
stroke(line((u(392), u(300)), (u(392), u(724))), BLUE, SW)                          # trunk
stroke(bezier((u(392), u(300)), (u(392), u(376)), (u(600), u(376)), (u(600), u(452))), GREEN, SW)  # branch out
stroke(bezier((u(600), u(452)), (u(600), u(506)), (u(392), u(506)), (u(392), u(560))), GREEN, SW)  # merge

def node(cx, cy, color, r=58):
    R = u(r)
    draw.ellipse([u(cx) - R, u(cy) - R, u(cx) + R, u(cy) + R], fill=color + (255,))

node(392, 300, ORANGE)
node(600, 452, GREEN)
node(392, 560, BLUE)
node(392, 724, PURPLE)

out = base.resize((1024, 1024), Image.LANCZOS)
out.save('build/icon.png')
print('wrote build/icon.png', out.size, '| corner alpha:', out.getpixel((2, 2))[3])
