#!/usr/bin/env python3
"""trace.py — the game's ingredient art (assets/ingredients/*.png) as cuttable vectors.

Wyatt, 2026-08-22: "each ingredient to just be the ingredient icon itself, cut out ... among the real
organic border of the art png". So: the CUT outline is the art's alpha silhouette (dilated a hair so
the drawn outline is not at the very edge), and the RASTER is the art's dark line-work and shadows —
the same drawing, as a woodcut. Pixel grids are traced as unions of unit squares, so outer loops and
holes come out with opposite winding and nonzero fill needs nothing more.

  python3 physical-board/art/trace.py physical-board/art/ingredients.json

Output is in pixel units; the generator scales each token to size.
"""
import json, sys, math
from PIL import Image, ImageFilter

REPO = "/Users/wyattroy/Documents/Projects/pastrypirates"

def trace(mask, w, h):
    edges = {}
    def add(a, b):
        if (b, a) in edges: del edges[(b, a)]
        else: edges[(a, b)] = True
    for y in range(h):
        row = mask[y]
        for x in range(w):
            if row[x]:
                add((x, y), (x + 1, y)); add((x + 1, y), (x + 1, y + 1)); add((x + 1, y + 1), (x, y + 1)); add((x, y + 1), (x, y))
    nxt = {}
    for (a, b) in edges: nxt.setdefault(a, []).append(b)
    loops = []
    while nxt:
        start = next(iter(nxt)); cur = start; loop = []
        while True:
            loop.append(cur)
            outs = nxt.get(cur)
            if not outs: break
            b = outs.pop()
            if not outs: del nxt[cur]
            cur = b
            if cur == start: break
        if len(loop) > 3: loops.append(loop)
    return loops

def smooth(pts, win=2):
    n = len(pts); out = []
    for i in range(n):
        sx = sy = 0
        for k in range(-win, win + 1):
            p = pts[(i + k) % n]; sx += p[0]; sy += p[1]
        out.append((sx / (2 * win + 1), sy / (2 * win + 1)))
    return out

def dp(pts, tol):
    if len(pts) < 6: return pts
    def simp(seg):
        if len(seg) < 3: return seg
        a, b = seg[0], seg[-1]; dx, dy = b[0] - a[0], b[1] - a[1]; L = math.hypot(dx, dy) or 1
        best, bi = -1, 0
        for i in range(1, len(seg) - 1):
            d = abs((seg[i][0] - a[0]) * dy - (seg[i][1] - a[1]) * dx) / L
            if d > best: best, bi = d, i
        if best > tol: return simp(seg[:bi + 1])[:-1] + simp(seg[bi:])
        return [a, b]
    far = max(range(len(pts)), key=lambda i: math.hypot(pts[i][0] - pts[0][0], pts[i][1] - pts[0][1]))
    h1 = simp(pts[:far + 1]); h2 = simp(pts[far:] + [pts[0]])
    return h1[:-1] + h2[:-1]

def area(pts):
    return sum(pts[i][0] * pts[(i + 1) % len(pts)][1] - pts[(i + 1) % len(pts)][0] * pts[i][1] for i in range(len(pts))) / 2

ING = ["wheat", "dairy", "sugar", "eggs", "cocoa", "spice", "vanilla"]

def lum(px): return 0.299 * px[0] + 0.587 * px[1] + 0.114 * px[2]
def is_water(px): return px[2] > px[0] + 25 and px[2] > px[1] - 10          # the light-blue halo round an island
def is_red(px): return px[0] > px[1] + 60 and px[0] > px[2] + 60                # the chocolate bar's wrapper

def trace_image(im, cfg, key):
    """cut = the silhouette (alpha, minus water halo if asked), dilated `pad` px and closed `close` px;
       raster = the ink (dark pixels, with per-asset exceptions)."""
    M = 24                                       # dilation head-room: padded variants grow up to ~19 px, and PIL's
    big = Image.new("RGBA", (im.size[0] + 2 * M, im.size[1] + 2 * M), (0, 0, 0, 0))   # filters cannot grow past the canvas —
    big.paste(im, (M, M)); im = big              # without this the padding clips flat ("cut off by a bounding box", Wyatt 2026-08-25)
    w, h = im.size; px = im.load()
    pad, close = cfg.get("pad", 2), cfg.get("close", 3)
    sil_img = Image.new("L", (w, h), 0); sp = sil_img.load()
    for y in range(h):
        for x in range(w):
            p = px[x, y]
            if cfg.get("blackbg"):                     # rendered on black: anything lit is the shape
                if lum(p) > 40: sp[x, y] = 255
            elif cfg.get("whitebg"):                   # black art on white paper: anything dark is the shape
                if p[3] > 110 and lum(p) < 128: sp[x, y] = 255
            elif p[3] > cfg["alpha"] and not (cfg.get("nowater") and is_water(p)): sp[x, y] = 255
    sil = sil_img.filter(ImageFilter.MaxFilter(2 * (pad + close) + 1)).filter(ImageFilter.MinFilter(2 * close + 1))
    silpx = sil.load()
    silmask = [[1 if silpx[x, y] else 0 for x in range(w)] for y in range(h)]
    def inky(p):
        if cfg.get("whitebg"): return False            # the silhouette IS the engraving; no separate ink pass
        if cfg.get("blackbg"): return lum(p) > 40 and p[0] > 120 and p[0] > p[2] + 50      # the emoji's yellow bolt is the ink
        if p[3] <= 110: return False
        if cfg.get("nowater") and is_water(p): return False
        if key == "cocoa" and is_red(p): return False      # wrapper stays open for paint; its dark outline still traces
        return lum(p) < cfg["ink"]
    inset = cfg.get("inkInset", 0)
    core = sil.filter(ImageFilter.MinFilter(2 * inset + 1)).load() if inset else None     # ink only well inside the coast
    dark = [[1 if inky(px[x, y]) and (core is None or core[x, y]) else 0 for x in range(w)] for y in range(h)]
    if cfg.get("blackbg"):   # close the bolt into one solid shape
        dk = Image.new("L", (w, h), 0); dp_ = dk.load()
        for y in range(h):
            for x in range(w):
                if dark[y][x]: dp_[x, y] = 255
        dk = dk.filter(ImageFilter.MaxFilter(7)).filter(ImageFilter.MinFilter(7)); dp_ = dk.load()
        dark = [[1 if dp_[x, y] else 0 for x in range(w)] for y in range(h)]
    cut = [dp(smooth(l, cfg.get("smooth", 4)), cfg.get("tol", 1.4)) for l in trace(silmask, w, h)]
    ras = [dp(smooth(l, 1), 0.6) for l in trace(dark, w, h)]
    big = max(abs(area(l)) for l in cut)
    cut = [l for l in cut if abs(area(l)) > big * 0.02]
    ras = [l for l in ras if abs(area(l)) > 6]
    # padding variants of the cut, for Wyatt to choose from: the silhouette dilated further, then smoothed
    variants = {}
    for name, extra in cfg.get("padVariants", {}).items():
        # drop dead pixels from the RAW silhouette, BEFORE any dilation can weld them to the body — a 1 px speck
        # under the sugar grew into a notch in its C padding (Wyatt, 2026-08-25)
        raw = sil_img.filter(ImageFilter.MinFilter(5)).filter(ImageFilter.MaxFilter(5))
        v = raw.filter(ImageFilter.MaxFilter(2 * (pad + close) + 1)).filter(ImageFilter.MinFilter(2 * close + 1))
        v = v.filter(ImageFilter.MaxFilter(2 * extra + 1)).filter(ImageFilter.MinFilter(2 * (extra // 2) + 1)).filter(ImageFilter.MaxFilter(2 * (extra // 2) + 1))
        vp = v.load(); vm = [[1 if vp[x, y] else 0 for x in range(w)] for y in range(h)]
        vl = [dp(smooth(l, 6), 1.8) for l in trace(vm, w, h)]
        vb = max(abs(area(l)) for l in vl); variants[name] = [l for l in vl if abs(area(l)) > vb * 0.02]
    return cut, ras, variants

PADS = {"cutB": 8, "cutC": 14}   # ~0.8 mm and ~1.4 mm more padding than the default (token art is ~10 px/mm)
ASSETS = {**{ing: dict(path=f"{REPO}/assets/ingredients/{ing}.png", ink=112, alpha=110, padVariants=PADS) for ing in ING},
          "sugar": dict(path=f"{REPO}/assets/ingredients/sugar.png", ink=205, alpha=110, padVariants=PADS),
          "eggs": dict(path=f"{REPO}/assets/ingredients/eggs.png", ink=150, alpha=110, close=6, smooth=6, tol=1.8, padVariants=PADS),
          "dairy": dict(path=f"{REPO}/assets/ingredients/dairy.png", ink=150, alpha=110, padVariants=PADS),
          "cocoa": dict(path=f"{REPO}/assets/ingredients/cocoa.png", ink=112, alpha=110, close=5, padVariants=PADS),
          "spice": dict(path=f"{REPO}/assets/ingredients/spice.png", ink=100, alpha=110, close=5, padVariants=PADS),
          # the storm: the 🌩️ emoji itself, rendered by Chrome on black (art/storm-emoji.png) — Wyatt, 2026-08-22
          "stormemoji": dict(path=f"{REPO}/physical-board/art/storm-emoji.png", ink=0, alpha=0, blackbg=True, pad=1, close=3, smooth=4, tol=1.4),
          # the ships' skull: Wyatt's reference image, black on white (2026-08-25, on seeing the traced ☠️:
          # "the emoji raster doesn't look right -- use notes/skull-ref.png instead")
          "skullref": dict(path=f"{REPO}/physical-board/art/skull-ref.png", ink=0, alpha=0, whitebg=True, pad=1, close=2, smooth=3, tol=1.2),
          "swirl": dict(path=f"{REPO}/assets/trade-swirl.png", ink=105, alpha=200),
          "skull": dict(path=f"{REPO}/assets/icons/skull.png", ink=120, alpha=110),
          "coin": dict(path=f"{REPO}/assets/icons/coin-emoji.png", ink=110, alpha=110),
          "storm": dict(path=f"{REPO}/assets/icons/storm-cloud.png", ink=110, alpha=110),
          # the islands: the sand silhouette (no water halo), the art's ink — one per footprint, art/islands/N.png
          **{f"island{n}": dict(path=f"{REPO}/assets/islands/{n}.png", ink=95, alpha=120, nowater=True, pad=1, close=4, smooth=5, tol=1.6, inkInset=16) for n in range(1, 8)}}
out = {}
for key, cfg in ASSETS.items():
    im = Image.open(cfg["path"]).convert("RGBA")
    cut, ras, variants = trace_image(im, cfg, key)
    xs = [p[0] for l in cut for p in l]; ys = [p[1] for l in cut for p in l]
    out[key] = {"w": im.size[0], "h": im.size[1], "bbox": [min(xs), min(ys), max(xs), max(ys)],
                "cut": [[[round(x, 1), round(y, 1)] for x, y in l] for l in cut],
                "raster": [[[round(x, 1), round(y, 1)] for x, y in l] for l in ras]}
    for name, loops in variants.items(): out[key][name] = [[[round(x, 1), round(y, 1)] for x, y in l] for l in loops]
    print(key, "cut loops", len(cut), "raster loops", len(ras), file=sys.stderr)

# Tortuga: the game has no + island, so one is composed from the I-shaped island art laid across itself;
# the centre square is cleared of ink (the name goes there)
i3 = Image.open(f"{REPO}/assets/islands/1.png").convert("RGBA")
W, H = i3.size; cellpx = W / 3.0          # the art spans three squares across
canvas = Image.new("RGBA", (W, W), (0, 0, 0, 0))
canvas.alpha_composite(i3, (0, int(W / 2 - H / 2)))
canvas.alpha_composite(i3.rotate(90, expand=True), (int(W / 2 - H / 2), 0))
cut, ras, _ = trace_image(canvas, dict(ink=95, alpha=120, nowater=True, pad=1, close=4, smooth=5, tol=1.6, inkInset=16), "tortuga")
cx0, cy0, cx1, cy1 = W / 2 - cellpx * 0.42, W / 2 - cellpx * 0.42, W / 2 + cellpx * 0.42, W / 2 + cellpx * 0.42
ras = [l for l in ras if not all(cx0 < x < cx1 and cy0 < y < cy1 for x, y in l)]
xs = [p[0] for l in cut for p in l]; ys = [p[1] for l in cut for p in l]
out["tortuga"] = {"w": W, "h": W, "bbox": [min(xs), min(ys), max(xs), max(ys)], "cut": [[[round(x, 1), round(y, 1)] for x, y in l] for l in cut], "raster": [[[round(x, 1), round(y, 1)] for x, y in l] for l in ras]}
print("tortuga cut loops", len(cut), "raster loops", len(ras), file=sys.stderr)
json.dump(out, open(sys.argv[1], "w"))
