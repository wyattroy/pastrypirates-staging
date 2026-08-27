#!/usr/bin/env python3
"""extract.py — glyph outlines from the game's own fonts (Georgia, Avenir Next) to JSON of SVG path
data, so generate.mjs can engrave real lettering with no font at laser time. Units: font units, with
unitsPerEm recorded; y is flipped to y-down in the generator. macOS system fonts only — nothing is
copied into the repo but the outlines of the characters used."""
import json, sys
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 .,:;!?'()-+/=&×−’éèêëàâäçîïôöùûüñÉÈÊÀÇ"
FONTS = {
  "georgia-bold":   ("/System/Library/Fonts/Supplemental/Georgia Bold.ttf", None),
  "georgia-italic": ("/System/Library/Fonts/Supplemental/Georgia Italic.ttf", None),
  "georgia":        ("/System/Library/Fonts/Supplemental/Georgia.ttf", None),
  "avenir-next-demibold": ("/System/Library/Fonts/Avenir Next.ttc", "AvenirNext-DemiBold"),
  "avenir-next": ("/System/Library/Fonts/Avenir Next.ttc", "AvenirNext-Regular"),
}
out = {}
for key, (path, psname) in FONTS.items():
    idx = 0
    if path.endswith(".ttc"):
        from fontTools.ttLib import TTCollection
        coll = TTCollection(path)
        names = [f["name"].getDebugName(6) for f in coll.fonts]
        idx = names.index(psname)
        font = coll.fonts[idx]
    else:
        font = TTFont(path)
    cmap = font.getBestCmap(); gs = font.getGlyphSet(); hmtx = font["hmtx"]
    upm = font["head"].unitsPerEm
    glyphs = {}
    for ch in CHARS:
        gn = cmap.get(ord(ch))
        if not gn: continue
        pen = SVGPathPen(gs); gs[gn].draw(pen)
        glyphs[ch] = {"d": pen.getCommands(), "adv": hmtx[gn][0]}
    out[key] = {"upm": upm, "ascender": font["hhea"].ascent, "descender": font["hhea"].descent, "glyphs": glyphs}
    print(key, "glyphs", len(glyphs), "upm", upm, file=sys.stderr)
json.dump(out, open(sys.argv[1], "w"))
