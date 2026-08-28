#!/usr/bin/env python3
"""dxf.py — writes the set's DXF files via ezdxf, from the JSON the generator emits.

Why a python step: Wyatt's Rhino (ODA importer) refused a hand-written R2000 file outright
("Opendesign error: null object id ... Can't recover file", 2026-08-25). ODA wants the complete
R2000 object structure — handles, owners, block records, root dictionary — and ezdxf is the
reference implementation that produces it. RASTER items arrive as SOLID hatches (odd-parity, so
holes stay open); CUT as plain polylines and circles. One-time setup: pip3 install --user ezdxf
"""
import json, sys
import ezdxf

docs = json.load(open(sys.argv[1]))
for d in docs:
    doc = ezdxf.new("R2000", setup=False)
    doc.header["$INSUNITS"] = 4                        # millimetres
    doc.layers.add("CUT", color=1)
    doc.layers.add("RASTER", color=7)
    msp = doc.modelspace()
    for e in d["entities"]:
        if e["type"] == "hatch":
            h = msp.add_hatch(color=7, dxfattribs={"layer": "RASTER", "hatch_style": 0})
            for loop in e["loops"]:
                h.paths.add_polyline_path(loop, is_closed=True)
        elif e["type"] == "circle":
            msp.add_circle((e["cx"], e["cy"]), e["r"], dxfattribs={"layer": e["layer"]})
        else:
            msp.add_lwpolyline(e["pts"], close=e["closed"], dxfattribs={"layer": e["layer"]})
    doc.saveas(d["path"])
print(f"dxf.py: {len(docs)} DXF files written by ezdxf {ezdxf.__version__}")
