#!/usr/bin/env node
/* physical-board/generate.mjs — laser-cut Pastry Pirates, three ways.
 *
 * Emits every piece of a physical set as SVG (Rhino/Illustrator/LightBurn-ready) and DXF (R12),
 * in THREE design versions so Wyatt can pick per piece. Everything is derived from the game's own
 * numbers — 4/src/engine/index.js (15x15 grid, round sea, 40-cell clockwise trade-wind rim, home
 * at centre with four berths) and 4/src/shared/index.js (the 7 TET island footprints, the 7
 * ingredients) — not redrawn by eye.
 *
 *   node physical-board/generate.mjs                 # defaults: 20mm squares, 3mm material
 *   node physical-board/generate.mjs --cell 24 --material 3.2
 *
 * TWO LAYERS, TWO COLOURS (Wyatt, 2026-08-21): CUT is a red hairline stroke, RASTER is black fill.
 * Same names in the DXF layer table. Nothing else is in the files.
 *
 * RASTER shapes never overlap each other (every union is authored as one outline, every hole is a
 * reversed sub-path under the nonzero rule) so no laser app's fill mode can cancel a region.
 *
 * No dependencies. Pure geometry in, text out.
 */
import fs from "node:fs";
import path from "node:path";

const HERE = path.dirname(new URL(import.meta.url).pathname);
import { execSync } from "node:child_process";
const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf("--" + k); return i >= 0 ? Number(argv[i + 1]) : d; };

const CELL = opt("cell", 25);          // mm per grid square (Wyatt, 2026-08-22: 25)
const MAT  = opt("material", 5.9);     // thick-sheet thickness, mm — Wyatt calipered his "6 mm" ply at 5.9 (2026-08-25)
const KERF = opt("kerf", 0.275);       // beam width, MEASURED from Wyatt's 2026-08-25 test cut (uncompensated files):
                                       // dock tab 8.7 of 9.00 drawn = 0.30 on outer cuts; island notch 9.4 of 9.15 =
                                       // 0.25 on holes. The average — the two errors cancel, so every joint lands on
                                       // its designed play. Every cut file is offset by half of this.
const BED_W = opt("bedw", 600), BED_H = opt("bedh", 400), BED_MARGIN = 6;   // his laser bed
const ONLY = (argv.includes("--versions") ? argv[argv.indexOf("--versions") + 1] : "v3").split(",");
const GRID = 15;                        // engine: cfg.grid
const CC   = (GRID - 1) / 2;            // engine: centre of the round world
const CLR  = 0.4;                       // per-side clearance so a loose piece drops into a square
const PIECE = CELL - 2 * CLR;           // a one-square piece
const GAP  = 4;                         // spacing between nested parts on a sheet
const SHEET_W = opt("sheet", 300);      // wrap width for the preview sheets
const CENTER = ((GRID - 1) / 2) * CELL + CELL / 2;   // the board's centre in mm

/* =========================================================================================
   1. Geometry core — items are {layer, piece, sub:[subpath]}; a subpath is {cmds} or {circle}
   ========================================================================================= */
const r3 = v => Math.round(v * 1000) / 1000;
const rad = d => d * Math.PI / 180;
const K = 0.5522847498; // cubic-bezier circle constant

function item(layer, sub, piece) { return { layer, sub, piece }; }
function polyCmds(pts) {
  const c = [["M", pts[0][0], pts[0][1]]];
  for (let i = 1; i < pts.length; i++) c.push(["L", pts[i][0], pts[i][1]]);
  c.push(["Z"]);
  return { cmds: c };
}
function poly(layer, pts) { return item(layer, [polyCmds(pts)]); }
function circ(layer, cx, cy, r, ccw = false) { return item(layer, [{ circle: { cx, cy, r, ccw } }]); }
function ring(layer, cx, cy, ro, ri) { return item(layer, [{ circle: { cx, cy, r: ro, ccw: false } }, { circle: { cx, cy, r: ri, ccw: true } }]); }
function rect(layer, x, y, w, h, rx = 0) {
  const pts = [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
  return rx ? item(layer, [roundCorners(pts, rx)]) : poly(layer, pts);
}
// regular polygon, `n` sides, circumradius r, first vertex at angle a0 (deg)
function ngon(layer, cx, cy, r, n, a0 = -90, rx = 0) {
  const pts = []; for (let i = 0; i < n; i++) { const a = rad(a0 + i * 360 / n); pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]); }
  return rx ? item(layer, [roundCorners(pts, rx)]) : poly(layer, pts);
}
// ellipse as four cubics, CW in y-down space; rot in degrees
function ellipseCmds(cx, cy, rx, ry, rot = 0, ccw = false) {
  const c = [["M", rx, 0], ["C", rx, K * ry, K * rx, ry, 0, ry], ["C", -K * rx, ry, -rx, K * ry, -rx, 0], ["C", -rx, -K * ry, -K * rx, -ry, 0, -ry], ["C", K * rx, -ry, rx, -K * ry, rx, 0], ["Z"]];
  const s = Math.sin(rad(rot)), co = Math.cos(rad(rot));
  const t = ([x, y]) => [cx + x * co - y * s, cy + x * s + y * co];
  const out = { cmds: c.map(cmd => cmd[0] === "Z" ? cmd : cmd[0] === "C" ? ["C", ...t([cmd[1], cmd[2]]), ...t([cmd[3], cmd[4]]), ...t([cmd[5], cmd[6]])] : [cmd[0], ...t([cmd[1], cmd[2]])]) };
  return ccw ? reverseSub(out) : out;
}
function ellipse(layer, cx, cy, rx, ry, rot = 0, ccw = false) { return item(layer, [ellipseCmds(cx, cy, rx, ry, rot, ccw)]); }

// ---- sub-path reversal (turns an outer into a hole under nonzero) ----
function cmdsToSegs(cmds) {
  const segs = []; let cur = null, start = null;
  for (const c of cmds) {
    if (c[0] === "M") { cur = [c[1], c[2]]; start = cur; }
    else if (c[0] === "L") { segs.push({ a: cur, b: [c[1], c[2]] }); cur = [c[1], c[2]]; }
    else if (c[0] === "C") { segs.push({ a: cur, c1: [c[1], c[2]], c2: [c[3], c[4]], b: [c[5], c[6]] }); cur = [c[5], c[6]]; }
    else if (c[0] === "Z") { if (cur && start && (cur[0] !== start[0] || cur[1] !== start[1])) segs.push({ a: cur, b: start }); }
  }
  return segs;
}
function segsToCmds(segs, closed = true) {
  const c = [["M", ...segs[0].a]];
  for (const s of segs) c.push(s.c1 ? ["C", ...s.c1, ...s.c2, ...s.b] : ["L", ...s.b]);
  if (closed) c.push(["Z"]);
  return c;
}
function reverseSub(sub) {
  if (sub.circle) return { circle: { ...sub.circle, ccw: !sub.circle.ccw } };
  const segs = cmdsToSegs(sub.cmds).reverse().map(s => s.c1 ? { a: s.b, c1: s.c2, c2: s.c1, b: s.a } : { a: s.b, b: s.a });
  return { cmds: segsToCmds(segs, true) };
}
function reverseItem(it) { return { ...it, sub: it.sub.map(reverseSub) }; }
const hole = it => reverseItem(it);

// ---- corner rounding of a polygon -> cubic path ----
function roundCorners(pts, r) {
  const n = pts.length, cmds = [];
  const unit = (a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1; return [dx / l, dy / l, l]; };
  for (let i = 0; i < n; i++) {
    const P = pts[(i + n - 1) % n], V = pts[i], N = pts[(i + 1) % n];
    const [ux, uy, lp] = unit(V, P), [vx, vy, ln] = unit(V, N);
    const ri = Math.min(r, lp / 2, ln / 2);
    const A = [V[0] + ux * ri, V[1] + uy * ri], B = [V[0] + vx * ri, V[1] + vy * ri];
    const c1 = [A[0] + (V[0] - A[0]) * 2 / 3, A[1] + (V[1] - A[1]) * 2 / 3];
    const c2 = [B[0] + (V[0] - B[0]) * 2 / 3, B[1] + (V[1] - B[1]) * 2 / 3];
    cmds.push(i === 0 ? ["M", ...A] : ["L", ...A]);
    cmds.push(["C", ...c1, ...c2, ...B]);
  }
  cmds.push(["Z"]);
  return { cmds };
}

// ---- affine transform: scale s, rotate rot (deg), then translate ----
function xf(items, { tx = 0, ty = 0, rot = 0, s = 1 } = {}) {
  const co = Math.cos(rad(rot)), si = Math.sin(rad(rot));
  const t = (x, y) => [tx + s * (x * co - y * si), ty + s * (x * si + y * co)];
  return items.map(it => ({
    ...it, sub: it.sub.map(sp => sp.circle
      ? { circle: { ...sp.circle, cx: t(sp.circle.cx, sp.circle.cy)[0], cy: t(sp.circle.cx, sp.circle.cy)[1], r: sp.circle.r * s } }
      : { cmds: sp.cmds.map(c => c[0] === "Z" ? c : c[0] === "C" ? ["C", ...t(c[1], c[2]), ...t(c[3], c[4]), ...t(c[5], c[6])] : [c[0], ...t(c[1], c[2])]) })
  }));
}
const tag = (items, piece) => items.map(it => ({ ...it, piece: it.piece ?? piece }));

// ---- flatten to polylines (DXF + bbox) ----
function flatten(sub, n = 8) {
  if (sub.circle) { const { cx, cy, r, ccw } = sub.circle, pts = []; for (let i = 0; i < 48; i++) { const a = (ccw ? -i : i) / 48 * Math.PI * 2; pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]); } return { pts, closed: true }; }
  const pts = []; let cur = null, closed = false;
  for (const c of sub.cmds) {
    if (c[0] === "M") { cur = [c[1], c[2]]; pts.push(cur); }
    else if (c[0] === "L") { cur = [c[1], c[2]]; pts.push(cur); }
    else if (c[0] === "C") {
      const [x0, y0] = cur;
      for (let i = 1; i <= n; i++) { const t = i / n, u = 1 - t; pts.push([u * u * u * x0 + 3 * u * u * t * c[1] + 3 * u * t * t * c[3] + t * t * t * c[5], u * u * u * y0 + 3 * u * u * t * c[2] + 3 * u * t * t * c[4] + t * t * t * c[6]]); }
      cur = [c[5], c[6]];
    } else if (c[0] === "Z") closed = true;
  }
  return { pts, closed };
}
function bbox(items) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const it of items) for (const sp of it.sub) for (const [x, y] of flatten(sp, 6).pts) { if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y; }
  return { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0 };
}

/* =========================================================================================
   2. A 5x7 block font — so titles, compass letters and rule cards need no font files at all
   ========================================================================================= */
const FONT_SRC = {
  A: ".###.|#...#|#...#|#####|#...#|#...#|#...#", B: "####.|#...#|#...#|####.|#...#|#...#|####.", C: ".####|#....|#....|#....|#....|#....|.####",
  D: "####.|#...#|#...#|#...#|#...#|#...#|####.", E: "#####|#....|#....|####.|#....|#....|#####", F: "#####|#....|#....|####.|#....|#....|#....",
  G: ".####|#....|#....|#.###|#...#|#...#|.####", H: "#...#|#...#|#...#|#####|#...#|#...#|#...#", I: "#####|..#..|..#..|..#..|..#..|..#..|#####",
  J: "..###|...#.|...#.|...#.|...#.|#..#.|.##..", K: "#...#|#..#.|#.#..|##...|#.#..|#..#.|#...#", L: "#....|#....|#....|#....|#....|#....|#####",
  M: "#...#|##.##|#.#.#|#.#.#|#...#|#...#|#...#", N: "#...#|##..#|#.#.#|#..##|#...#|#...#|#...#", O: ".###.|#...#|#...#|#...#|#...#|#...#|.###.",
  P: "####.|#...#|#...#|####.|#....|#....|#....", Q: ".###.|#...#|#...#|#...#|#.#.#|#..#.|.##.#", R: "####.|#...#|#...#|####.|#.#..|#..#.|#...#",
  S: ".####|#....|#....|.###.|....#|....#|####.", T: "#####|..#..|..#..|..#..|..#..|..#..|..#..", U: "#...#|#...#|#...#|#...#|#...#|#...#|.###.",
  V: "#...#|#...#|#...#|#...#|#...#|.#.#.|..#..", W: "#...#|#...#|#...#|#.#.#|#.#.#|##.##|#...#", X: "#...#|#...#|.#.#.|..#..|.#.#.|#...#|#...#",
  Y: "#...#|#...#|.#.#.|..#..|..#..|..#..|..#..", Z: "#####|....#|...#.|..#..|.#...|#....|#####",
  0: ".###.|#...#|#..##|#.#.#|##..#|#...#|.###.", 1: "..#..|.##..|..#..|..#..|..#..|..#..|.###.", 2: ".###.|#...#|....#|...#.|..#..|.#...|#####",
  3: "#####|...#.|..#..|...#.|....#|#...#|.###.", 4: "...#.|..##.|.#.#.|#..#.|#####|...#.|...#.", 5: "#####|#....|####.|....#|....#|#...#|.###.",
  6: "..##.|.#...|#....|####.|#...#|#...#|.###.", 7: "#####|....#|...#.|..#..|.#...|.#...|.#...", 8: ".###.|#...#|#...#|.###.|#...#|#...#|.###.",
  9: ".###.|#...#|#...#|.####|....#|...#.|.##..", "-": ".....|.....|.....|#####|.....|.....|.....", ".": ".....|.....|.....|.....|.....|.##..|.##..",
  ":": ".....|.##..|.##..|.....|.##..|.##..|.....", "/": "....#|....#|...#.|..#..|.#...|#....|#....", "+": ".....|..#..|..#..|#####|..#..|..#..|.....",
  "=": ".....|.....|#####|.....|#####|.....|.....", "'": ".##..|..#..|.#...|.....|.....|.....|.....", "!": "..#..|..#..|..#..|..#..|..#..|.....|..#..",
  "?": ".###.|#...#|....#|...#.|..#..|.....|..#..", "&": ".##..|#..#.|#..#.|.##..|#.#.#|#..#.|.##.#", "(": "..#..|.#...|#....|#....|#....|.#...|..#..",
  ")": "..#..|...#.|....#|....#|....#|...#.|..#..", ",": ".....|.....|.....|.....|.##..|..#..|.#...", " ": "...|...|...|...|...|...|...",
};
const FONT = {}; for (const k in FONT_SRC) FONT[k] = FONT_SRC[k].split("|");
function textWidth(str, px) { return ([...str.toUpperCase()].reduce((a, ch) => a + (FONT[ch] || FONT["?"])[0].length + 1, 0) - 1) * px; }
// pixels are emitted as one rect per horizontal run; runs in adjacent rows share an edge, never overlap
function text(layer, str, x, y, px, { align = "left", valign = "top" } = {}) {
  const w = textWidth(str, px), h = 7 * px;
  const ox = align === "center" ? x - w / 2 : align === "right" ? x - w : x;
  const oy = valign === "middle" ? y - h / 2 : valign === "bottom" ? y - h : y;
  const items = []; let col = 0;
  for (const ch of str.toUpperCase()) {
    const g = FONT[ch] || FONT["?"];
    for (let r = 0; r < 7; r++) { const row = g[r]; let c = 0; while (c < row.length) { if (row[c] === "#") { let c2 = c; while (c2 < row.length && row[c2] === "#") c2++; items.push(rect(layer, ox + (col + c) * px, oy + r * px, (c2 - c) * px, px)); c = c2; } else c++; } }
    col += g[0].length + 1;
  }
  return items;
}

/* =========================================================================================
   2b. REAL LETTERING — the game's own fonts (Georgia for the voice, Avenir Next for labels), as
       outlines extracted once by fonts/extract.py. Wyatt, 2026-08-22: the pixel font read as
       "techno"; the brand is the app's. Glyph paths are TrueType: outer contours and holes wind
       opposite ways, so nonzero fill needs nothing more.
   ========================================================================================= */
const GLYPHS = JSON.parse(fs.readFileSync(path.join(HERE, "fonts", "glyphs.json"), "utf8"));
function glyphCmds(d) { // fontTools SVGPathPen: absolute M/L/H/V/Q/C/Z, with implicit repeats ("M x y x y x y" = M then L L)
  const toks = d.match(/[MLHVQCZ]|-?\d*\.?\d+(?:e-?\d+)?/g) || [], out = []; let i = 0, cur = [0, 0], mode = null;
  const isNum = t => t !== undefined && !/[MLHVQCZ]/.test(t);
  const num = () => parseFloat(toks[i++]);
  while (i < toks.length) {
    let t = toks[i];
    if (!isNum(t)) { mode = t; i++; if (t === "Z") { out.push(["Z"]); mode = null; continue; } }
    if (mode === "M") { cur = [num(), num()]; out.push(["M", cur[0], cur[1]]); mode = "L"; }
    else if (mode === "L") { cur = [num(), num()]; out.push(["L", cur[0], cur[1]]); }
    else if (mode === "H") { cur = [num(), cur[1]]; out.push(["L", cur[0], cur[1]]); }
    else if (mode === "V") { cur = [cur[0], num()]; out.push(["L", cur[0], cur[1]]); }
    else if (mode === "Q") { const qx = num(), qy = num(), x = num(), y = num(); out.push(["C", cur[0] + 2 / 3 * (qx - cur[0]), cur[1] + 2 / 3 * (qy - cur[1]), x + 2 / 3 * (qx - x), y + 2 / 3 * (qy - y), x, y]); cur = [x, y]; }
    else if (mode === "C") { const a = num(), b = num(), c = num(), d2 = num(), x = num(), y = num(); out.push(["C", a, b, c, d2, x, y]); cur = [x, y]; }
    else i++;
  }
  return out;
}
function ftextWidth(str, size, font = "georgia-bold") { const F = GLYPHS[font]; let w = 0; for (const ch of str) { const g = F.glyphs[ch] || F.glyphs["?"]; w += g.adv; } return w * size / F.upm; }
// size = em height in mm; (x,y) = baseline origin unless valign says otherwise
function ftext(layer, str, x, y, size, { font = "georgia-bold", align = "left", valign = "baseline" } = {}) {
  const F = GLYPHS[font], k = size / F.upm, w = ftextWidth(str, size, font), items = [];
  const capH = 0.7 * size; // close enough for both faces; only used to centre
  const ox = align === "center" ? x - w / 2 : align === "right" ? x - w : x;
  const oy = valign === "middle" ? y + capH / 2 : valign === "top" ? y + capH : y;
  let pen = 0;
  for (const ch of str) {
    const g = F.glyphs[ch] || F.glyphs["?"];
    if (g.d) { const cmds = glyphCmds(g.d).map(c => c[0] === "Z" ? c : c[0] === "C" ? ["C", ox + pen + c[1] * k, oy - c[2] * k, ox + pen + c[3] * k, oy - c[4] * k, ox + pen + c[5] * k, oy - c[6] * k] : [c[0], ox + pen + c[1] * k, oy - c[2] * k]);
      // one item per glyph; split sub-paths at each M so holes stay paired with their outer
      const subs = []; let curC = null; for (const c of cmds) { if (c[0] === "M") { curC = [c]; subs.push({ cmds: curC }); } else curC.push(c); }
      items.push(item(layer, subs)); }
    pen += g.adv * k;
  }
  return items;
}

/* =========================================================================================
   3. Rectilinear polygon tools — union outline of grid cells, inset/outset, notches
   ========================================================================================= */
// union outline of a set of unit cells -> array of loops (each an array of [x,y] in cell units, CW)
function traceCells(cells) {
  const key = c => c.join(",");
  const set = new Set(cells.map(key));
  const edges = new Map(); // directed edge "x1,y1>x2,y2" ; interior edges appear twice opposed and cancel
  const add = (a, b) => { const k = a.join(",") + ">" + b.join(","), rk = b.join(",") + ">" + a.join(","); if (edges.has(rk)) edges.delete(rk); else edges.set(k, [a, b]); };
  for (const [x, y] of cells) { add([x, y], [x + 1, y]); add([x + 1, y], [x + 1, y + 1]); add([x + 1, y + 1], [x, y + 1]); add([x, y + 1], [x, y]); }
  const byStart = new Map(); for (const [, [a, b]] of edges) byStart.set(a.join(","), b);
  const loops = [];
  while (byStart.size) {
    const [startK, first] = byStart.entries().next().value;
    const loop = [startK.split(",").map(Number)]; let cur = first; byStart.delete(startK);
    while (cur.join(",") !== startK) { loop.push(cur); const nxt = byStart.get(cur.join(",")); byStart.delete(cur.join(",")); cur = nxt; }
    // merge collinear runs
    const m = []; for (let i = 0; i < loop.length; i++) { const P = loop[(i + loop.length - 1) % loop.length], V = loop[i], N = loop[(i + 1) % loop.length]; if ((V[0] - P[0]) * (N[1] - V[1]) - (V[1] - P[1]) * (N[0] - V[0]) !== 0) m.push(V); }
    loops.push(m);
  }
  void set;
  return loops;
}
function signedArea(pts) { let a = 0; for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; a += p[0] * q[1] - q[0] * p[1]; } return a / 2; }
// offset outward by d (negative = inward); polygon is made CW first
function offsetPoly(ptsRaw, d) {
  const ptsIn = ptsRaw.filter((p, i) => i === 0 || Math.hypot(p[0] - ptsRaw[i - 1][0], p[1] - ptsRaw[i - 1][1]) > 1e-6);
  if (Math.hypot(ptsIn[0][0] - ptsIn[ptsIn.length - 1][0], ptsIn[0][1] - ptsIn[ptsIn.length - 1][1]) < 1e-6) ptsIn.pop();
  const pts = signedArea(ptsIn) < 0 ? [...ptsIn].reverse() : ptsIn;
  const n = pts.length, lines = [];
  for (let i = 0; i < n; i++) {
    const a = pts[i], b = pts[(i + 1) % n], dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy);
    const nx = dy / l, ny = -dx / l; // outward normal for CW in y-down
    lines.push({ a: [a[0] + nx * d, a[1] + ny * d], dx, dy });
  }
  const out = [], limit = Math.abs(d) * 2.5;
  for (let i = 0; i < n; i++) {
    const L1 = lines[(i + n - 1) % n], L2 = lines[i], V = pts[i];
    const den = L1.dx * L2.dy - L1.dy * L2.dx;
    if (Math.abs(den) < 1e-9) { out.push(L2.a); continue; }
    const t = ((L2.a[0] - L1.a[0]) * L2.dy - (L2.a[1] - L1.a[1]) * L2.dx) / den;
    const X = [L1.a[0] + L1.dx * t, L1.a[1] + L1.dy * t];
    // mitre limit: a near-parallel pair of edges would send the join off to infinity — bevel it instead
    if (Math.hypot(X[0] - V[0], X[1] - V[1]) > limit) { const l1 = Math.hypot(L1.dx, L1.dy), e1 = [L1.a[0] + L1.dx, L1.a[1] + L1.dy]; out.push(e1, L2.a); void l1; }
    else out.push(X);
  }
  return out;
}
// perimeter unit edges of a cell set: {m:[x,y] midpoint (cell units), inward:[nx,ny], along:[tx,ty]}
function perimeterEdges(cells) {
  const set = new Set(cells.map(c => c.join(","))), out = [];
  for (const [x, y] of cells) {
    if (!set.has(`${x},${y - 1}`)) out.push({ m: [x + .5, y], inward: [0, 1], along: [1, 0] });
    if (!set.has(`${x + 1},${y}`)) out.push({ m: [x + 1, y + .5], inward: [-1, 0], along: [0, 1] });
    if (!set.has(`${x},${y + 1}`)) out.push({ m: [x + .5, y + 1], inward: [0, -1], along: [-1, 0] });
    if (!set.has(`${x - 1},${y}`)) out.push({ m: [x, y + .5], inward: [1, 0], along: [0, -1] });
  }
  return out;
}
// insert a notch (list of points, in order) into the straight segment of `cmds` that contains `m`
function insertNotch(cmds, m, notchPts) {
  for (let i = 1; i < cmds.length; i++) {
    const c = cmds[i]; if (c[0] !== "L") continue;
    const prev = cmds[i - 1], a = prev[0] === "C" ? [prev[5], prev[6]] : [prev[1], prev[2]], b = [c[1], c[2]];
    const dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy;
    const t = ((m[0] - a[0]) * dx + (m[1] - a[1]) * dy) / l2;
    const px = a[0] + dx * t, py = a[1] + dy * t;
    if (t > 0.02 && t < 0.98 && Math.hypot(px - m[0], py - m[1]) < 0.05) {
      cmds.splice(i, 0, ...notchPts.map(p => ["L", p[0], p[1]]));
      return true;
    }
  }
  return false;
}
// jigsaw-nub outline points, from A (before) to B (after) along the edge; dir = +1 into the piece (socket) or -1 outward (nub)
function mushroomPts(m, along, inward, { hw, nd, r }, dir) {
  const n = [inward[0] * dir, inward[1] * dir], t = along;
  const P = (x, d) => [m[0] + t[0] * x + n[0] * d, m[1] + t[1] * x + n[1] * d];
  const dj = nd + r - Math.sqrt(r * r - hw * hw), phi = Math.asin(hw / r), pts = [P(-hw, 0), P(-hw, dj)];
  const steps = 18;
  for (let i = 1; i < steps; i++) { const f = -phi - (2 * Math.PI - 2 * phi) * i / steps; pts.push(P(r * Math.sin(f), nd + r - r * Math.cos(f))); }
  pts.push(P(hw, dj), P(hw, 0));
  return pts;
}
function slotPts(m, along, inward, { hw, depth }, dir) {
  const n = [inward[0] * dir, inward[1] * dir], t = along;
  const P = (x, d) => [m[0] + t[0] * x + n[0] * d, m[1] + t[1] * x + n[1] * d];
  return [P(-hw, 0), P(-hw, depth), P(hw, depth), P(hw, 0)];
}

/* =========================================================================================
   4. The world, straight from the engine (Game constructor, 4/src/engine/index.js)
   ========================================================================================= */
function seaCells() {
  const r2 = (CC + 0.4) * (CC + 0.4), valid = new Set(), rim = new Set();
  for (let x = 0; x < GRID; x++) for (let y = 0; y < GRID; y++) if ((x - CC) ** 2 + (y - CC) ** 2 <= r2) valid.add(x + "," + y);
  const DIRS = [[0, -1], [0, 1], [1, 0], [-1, 0]];
  for (const k of valid) { const [x, y] = k.split(",").map(Number); for (const d of DIRS) { const ox = x + d[0], oy = y + d[1]; if (ox < 0 || oy < 0 || ox >= GRID || oy >= GRID || !valid.has(ox + "," + oy)) { rim.add(k); break; } } }
  return { valid, rim, DIRS };
}
const TET = [[[0, 0], [1, 0], [2, 0]], [[0, 0], [1, 0], [0, 1]], [[0, 0], [1, 0], [2, 0], [3, 0]], [[0, 0], [1, 0], [0, 1], [1, 1]], [[0, 0], [1, 0], [2, 0], [0, 1]], [[0, 0], [1, 0], [1, 1], [2, 1]], [[0, 0], [1, 0], [2, 0], [1, 1]]];
// the physical set needs the MIRROR of the two chiral shapes too (8 = L reversed, 9 = S reversed): the app
// flips art freely, a wooden piece cannot. Seven of the nine go out each voyage.
const ISLAND_SHAPES = [...TET, [[0, 0], [1, 0], [2, 0], [2, 1]], [[1, 0], [2, 0], [0, 1], [1, 1]]];
const ING = ["wheat", "dairy", "sugar", "eggs", "cocoa", "spice", "vanilla"];
const ING_NAME = { wheat: "TOASTY WHEAT", dairy: "FRESH MILK", sugar: "CRYSTAL SUGAR", eggs: "SPECKLED EGGS", cocoa: "CACAO PODS", vanilla: "VANILLA BEANS", spice: "HOT CINNAMON" };
const CAPTAINS = ["CRUMBLE", "BISCOTTI", "GINGERSNAP", "SHORTBREAD"]; // pink, teal, green, orange in the app
// the game's own recipe book — 21 named recipes, one per 5-of-7 combination (4/src/ui/recipe.js)
const RECIPE_BOOK = (await import(path.join(HERE, "..", "4", "src", "ui", "recipe.js"))).RECIPE_BOOK;
const MAT3 = opt("material3", 3.1); // the thin material: spinner, crates, chests, sails — Wyatt calipered the NEW "3 mm" sheet
                                    // at 3.1 (2026-08-25, evening, at the laser). The first batch measured 2.6 — a 0.5 mm spread
                                    // between sheets with the same label, so CALIPER EVERY NEW SHEET and pass --material3.
const KERF3 = opt("kerf3", 0.08);  // thin-ply kerf: his UNcompensated chest already snaps REALLY firmly — "maybe a TINY
                                   // bit of compensation is necessary, but very little" (2026-08-25, from the built chest)
let KERF_FOR = () => KERF;         // set per version once the parts know their materials
// the ingredient art itself, traced by art/trace.py: cut = silhouette loops, raster = the drawing's ink
const ART = JSON.parse(fs.readFileSync(path.join(HERE, "art", "ingredients.json"), "utf8"));
const TOKEN_MM = 20; // the longest side of a token; one sits on each island square of 25
function artToken(name, cx, cy, size = TOKEN_MM, { cut = true, ink = true, solid = false, outline = 0, rot = 0, pad = "cut" } = {}) {
  const a = { ...ART[name], cut: ART[name][pad] || ART[name].cut }, [x0, y0, x1, y1] = ART[name].bbox, k = size / Math.max(x1 - x0, y1 - y0), mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
  const co = Math.cos(rad(rot)), si = Math.sin(rad(rot));
  const T = ([x, y]) => { const u = (x - mx) * k, v = (y - my) * k; return [cx + u * co - v * si, cy + u * si + v * co]; };
  const L = loop => polyCmds(loop.map(T));
  const out = [];
  if (cut) out.push(item(CU, a.cut.map(L)));
  if (solid) out.push(item(RA, a.cut.map(L)));
  else {
    if (outline) for (const loop of a.cut) { const pts = loop.map(T); out.push(item(RA, [polyCmds(offsetPoly(pts, outline / 2)), reverseSub(polyCmds(offsetPoly(pts, -outline / 2)))])); }
    if (ink) out.push(item(RA, a.raster.map(L)));
  }
  return out;
}
// place an asset so its silhouette fills a box (x0,y0,w,h) less a clearance; mirror = flip left-right (the two chiral islands)
function artFit(name, x0, y0, w, h, { clr = CLR, mirror = false, cut = true, ink = true } = {}) {
  const a = ART[name], [bx0, by0, bx1, by1] = a.bbox, k = Math.min((w - 2 * clr) / (bx1 - bx0), (h - 2 * clr) / (by1 - by0));
  const cx = x0 + w / 2, cy = y0 + h / 2, mx = (bx0 + bx1) / 2, my = (by0 + by1) / 2, sx = mirror ? -k : k;
  const L = loop => polyCmds(loop.map(([x, y]) => [cx + (x - mx) * sx, cy + (y - my) * k]));
  const out = []; if (cut) out.push(item(CU, a.cut.map(L))); if (ink) for (const loop of a.raster) out.push(item(RA, [L(loop)]));
  return out;
}
// the game's coin, as an inline glyph — Wyatt: "Never write 'coins', use the game art"
function coinGlyph(cx, cy, d) { return artToken("coin", cx, cy, d, { cut: false, outline: 0.3 }); }

/* =========================================================================================
   5. Icons — each authored in a 100x100 box, RASTER, outer outlines CW and holes CCW
   ========================================================================================= */
const RA = "RASTER", CU = "CUT", GU = "GUIDE";   // GUIDE never reaches a laser file — it is for the page only

// ---- island art helpers (the sampler's drawing code, 2026-08-22): everything in the icons' 100 x 100 box ----
const islandArt = (() => {
  const rad = a => a * Math.PI / 180;
  const P = (cx, cy, a, r) => [cx + r * Math.cos(rad(a)), cy + r * Math.sin(rad(a))];
  const Bz = (p0, c, p1, t) => [(1 - t) ** 2 * p0[0] + 2 * (1 - t) * t * c[0] + t * t * p1[0], (1 - t) ** 2 * p0[1] + 2 * (1 - t) * t * c[1] + t * t * p1[1]];
  const Bt = (p0, c, p1, t) => { const x = 2 * (1 - t) * (c[0] - p0[0]) + 2 * t * (p1[0] - c[0]), y = 2 * (1 - t) * (c[1] - p0[1]) + 2 * t * (p1[1] - c[1]), L = Math.hypot(x, y) || 1; return [x / L, y / L]; };
  const q2c = (p0, c, p1) => ["C", p0[0] + 2 / 3 * (c[0] - p0[0]), p0[1] + 2 / 3 * (c[1] - p0[1]), p1[0] + 2 / 3 * (c[0] - p1[0]), p1[1] + 2 / 3 * (c[1] - p1[1]), p1[0], p1[1]];
  // a fan: ONE closed path — blades radiating from a hub circle (cx,cy,R), joined by arcs along the hub
  function fan(cx, cy, R, blades) {
    const bs = [...blades].sort((p, q) => p.a - q.a), cmds = [];
    bs.forEach((b, i) => {
      const d = (b.w / R) * 180 / Math.PI, p0 = P(cx, cy, b.a - d, R), p1 = P(cx, cy, b.a + d, R), tip = P(cx, cy, b.a, b.l);
      const ux = Math.cos(rad(b.a)), uy = Math.sin(rad(b.a)), nx = -uy, ny = ux, m = P(cx, cy, b.a, (R + b.l) / 2), bend = b.bend || 0, bw = (b.belly ?? 1.8) * b.w;
      const c0 = [m[0] + nx * (bend - bw), m[1] + ny * (bend - bw)], c1 = [m[0] + nx * (bend + bw), m[1] + ny * (bend + bw)];
      cmds.push(i === 0 ? ["M", ...p0] : ["L", ...p0]); cmds.push(q2c(p0, c0, tip)); cmds.push(q2c(tip, c1, p1));
      const next = bs[(i + 1) % bs.length], a0 = b.a + d, a1 = (i + 1 < bs.length ? next.a : next.a + 360) - (next.w / R) * 180 / Math.PI;
      for (let k = 1; k < 6; k++) cmds.push(["L", ...P(cx, cy, a0 + (a1 - a0) * k / 6, R)]);
    });
    cmds.push(["Z"]); return { cmds };
  }
  // a lumpy stone: an ellipse-ish blob with a few bumps
  function stone(cx, cy, rx, ry, seed = 1) {
    const n = 9, pts = []; let s = seed * 977 + 1; const rnd = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
    for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2, k = 0.88 + rnd() * 0.18; pts.push([cx + rx * k * Math.cos(a), cy + ry * k * Math.sin(a)]); }
    const mid = (p, q) => [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
    const cmds = [["M", ...mid(pts[n - 1], pts[0])]]; for (let i = 0; i < n; i++) cmds.push(q2c(i === 0 ? mid(pts[n - 1], pts[0]) : mid(pts[i - 1], pts[i]), pts[i], mid(pts[i], pts[(i + 1) % n]))); cmds.push(["Z"]);
    return { cmds };
  }
  // a solid leaf with shallow V-notches along ONE edge (never past 45 % of the half-width, so it stays one piece)
  function leafNotched(p0, c, p1, { n = 60, wmax = 6.5, w0 = 1.2, notches = 3, depth = 0.55, side = -1 } = {}) {
    const L = [], R = [];
    const tri = t => { if (t < 0.15 || t > 0.92) return 0; const x = ((t - 0.15) / (0.92 - 0.15)) * notches % 1; return Math.max(0, 1 - Math.abs(x - 0.5) / 0.16); };
    for (let i = 0; i <= n; i++) { const t = i / n, p = Bz(p0, c, p1, t), u = Bt(p0, c, p1, t), nn = [-u[1], u[0]];
      const base = w0 + (wmax - w0) * Math.sin(Math.PI * Math.pow(t, 0.8)) * (1 - t * 0.1), k = 1 - depth * tri(t);
      const hl = side > 0 ? base * k : base, hr = side < 0 ? base * k : base;
      L.push([p[0] + nn[0] * hl, p[1] + nn[1] * hl]); R.push([p[0] - nn[0] * hr, p[1] - nn[1] * hr]); }
    return polyCmds([...L, ...R.reverse()]);
  }
  // a curved tapered trunk in ring segments (real gaps between them)
  function trunk(bx, by, tx, ty, { w0 = 6, w1 = 3.2, bow = 10, rings = 0, gap = 1.6 } = {}) {
    const p0 = [bx, by], c = [(bx + tx) / 2 + bow, (by + ty) / 2], p1 = [tx, ty], out = [], n = rings > 0 ? rings + 1 : 1;
    for (let k = 0; k < n; k++) { const ta = k / n, tb = (k + 1) / n, Lp = [], Rp = [], m = 10;
      for (let i = 0; i <= m; i++) { const t = ta + (tb - ta) * i / m, p = Bz(p0, c, p1, t), u = Bt(p0, c, p1, t), nn = [-u[1], u[0]], hw = w0 + (w1 - w0) * t;
        const shrink = rings > 0 ? (i === 0 ? gap / 2 : i === m ? -gap / 2 : 0) : 0, q = [p[0] + u[0] * shrink, p[1] + u[1] * shrink];
        Lp.push([q[0] + nn[0] * hw, q[1] + nn[1] * hw]); Rp.push([q[0] - nn[0] * hw, q[1] - nn[1] * hw]); }
      out.push(polyCmds([...Lp, ...Rp.reverse()])); }
    return out;
  }
  // a crown: a hub and fronds at the given screen angles (-90 = up), each arching up then drooping the short way round
  function crown(cx, cy, fronds, make, hubR = 4.5) {
    const turn = d => ((d + 180) % 360 + 360) % 360 - 180, out = [{ circle: { cx, cy, r: hubR, ccw: false } }];
    for (const f of fronds) { const a = f.a, len = f.len, arch = f.arch ?? 0, droop = f.droop ?? 0.3;
      const p0 = P(cx, cy, a, hubR + 0.6), c = P(cx, cy, a + turn(-90 - a) * arch, len * 0.62), p1 = P(cx, cy, a + turn(90 - a) * droop, len);
      out.push(make(p0, c, p1, f)); }
    return out;
  }
  return { fan, stone, leafNotched, trunk, crown };
})();
const ICONS = {
  // a single wheat ear: grains up both sides of a stem, matching assets/ingredients/wheat.png
  wheat() {
    const it = [];
    it.push(poly(RA, [[48.5, 77], [51.5, 77], [52.5, 98], [47.5, 98]]));
    it.push(ellipse(RA, 50, 11, 5, 8.5, 0));
    for (const y of [28, 47, 66]) { it.push(ellipse(RA, 42, y, 5.5, 9.5, -30)); it.push(ellipse(RA, 58, y, 5.5, 9.5, 30)); }
    return it;
  },
  // milk bottle, label left as an unengraved band
  dairy() {
    const body = { cmds: [["M", 38, 30], ["L", 62, 30], ["C", 62, 36, 73, 38, 73, 48], ["L", 73, 86], ["C", 73, 94, 66, 96, 50, 96], ["C", 34, 96, 27, 94, 27, 86], ["L", 27, 48], ["C", 27, 38, 38, 36, 38, 30], ["Z"]] };
    const label = reverseSub(polyCmds([[31, 56], [69, 56], [69, 70], [31, 70]]));
    return [item(RA, [body, label]), rect(RA, 36, 12, 28, 8, 2), rect(RA, 38, 21, 24, 7)];
  },
  // two sugar cubes: three faces each, separated by a hairline of wood
  sugar() {
    const cube = (cx, cy, s) => {
      const h = s * 0.5, g = 1.4; // g = gap between faces
      const T = [cx, cy - s], Rr = [cx + s * 0.87, cy - h], B = [cx, cy], L = [cx - s * 0.87, cy - h];
      const Bt = [cx, cy + s], Rb = [cx + s * 0.87, cy + h], Lb = [cx - s * 0.87, cy + h];
      const sh = (pts, dx, dy) => pts.map(([x, y]) => [x + dx, y + dy]);
      return [poly(RA, sh([T, Rr, B, L], 0, -g)), poly(RA, sh([L, B, Bt, Lb], -g * .87, g * .5)), poly(RA, sh([B, Rr, Rb, Bt], g * .87, g * .5))];
    };
    return [...cube(36, 44, 20), ...cube(66, 64, 15)];
  },
  // one speckled egg; speckles are holes
  eggs() {
    const egg = { cmds: [["M", 50, 6], ["C", 68, 6, 82, 36, 82, 60], ["C", 82, 80, 68, 95, 50, 95], ["C", 32, 95, 18, 80, 18, 60], ["C", 18, 36, 32, 6, 50, 6], ["Z"]] };
    const sp = [[40, 32, 3.2], [58, 44, 4], [36, 60, 3.5], [60, 72, 3], [46, 82, 2.5], [64, 24, 2.2]].map(([x, y, r]) => ({ circle: { cx: x, cy: y, r, ccw: true } }));
    return [item(RA, [egg, ...sp])];
  },
  // a chocolate bar: two columns, three rows of squares
  cocoa() {
    const it = [];
    for (let r = 0; r < 3; r++) for (let c = 0; c < 2; c++) it.push(rect(RA, 24 + c * 28, 10 + r * 28, 24, 24, 3));
    return it;
  },
  // three cinnamon sticks, rolled — the curl is a slit left unengraved at each end
  spice() {
    const stick = (cx) => {
      const outer = roundCorners([[cx - 7, 10], [cx + 7, 10], [cx + 7, 90], [cx - 7, 90]], 4);
      const slits = [[cx - 3, 14, 6, 4], [cx - 3, 82, 6, 4]].map(([x, y, w, h]) => reverseSub(polyCmds([[x, y], [x + w, y], [x + w, y + h], [x, y + h]])));
      return item(RA, [outer, ...slits]);
    };
    return xf(xf([stick(32), stick(50), stick(68)], { tx: -50, ty: -50 }), { rot: -30, tx: 50, ty: 50 });
  },
  // vanilla flower: five petals round a centre
  vanilla() {
    const it = [];
    for (let i = 0; i < 5; i++) { const a = -90 + i * 72, cx = 50 + 30 * Math.cos(rad(a)), cy = 50 + 30 * Math.sin(rad(a)); it.push(ellipse(RA, cx, cy, 12, 19, a + 90)); }
    it.push(circ(RA, 50, 50, 9));
    return it;
  },
  // anchor (home + docks): ring above, one outline for shaft, stock and flukes
  anchor() {
    const body = { cmds: [["M", 46, 26], ["L", 54, 26], ["L", 54, 36], ["L", 72, 36], ["L", 72, 42], ["L", 54, 42], ["L", 54, 70], ["C", 60, 72, 68, 68, 72, 60], ["L", 82, 68], ["C", 78, 84, 64, 96, 50, 96], ["C", 36, 96, 22, 84, 18, 68], ["L", 28, 60], ["C", 32, 68, 40, 72, 46, 70], ["L", 46, 42], ["L", 28, 42], ["L", 28, 36], ["L", 46, 36], ["Z"]] };
    return [ring(RA, 50, 14, 9, 5), item(RA, [body])];
  },
  // palm tree for island pieces — Wyatt's pick from the second line-up (2026-08-22): "H · wind-blown", a leaning
  // ringed trunk with every notched leaf streaming to the right, a nod to the game's wind. Authored as the
  // sampler drew it: a curved trunk in ring segments, a hub, five solid leaves with shallow V-notches on the lee edge.
  palm() {
    const it = [];
    for (const seg of islandArt.trunk(36, 98, 40, 40, { w0: 6, w1: 3, bow: -10, rings: 5 })) it.push(item(RA, [seg]));
    const fronds = [{ a: -135, len: 40, droop: 0.7 }, { a: -100, len: 46, droop: 0.62 }, { a: -65, len: 50, droop: 0.5 }, { a: -30, len: 50, droop: 0.4 }, { a: 5, len: 44, droop: 0.3 }];
    for (const sh of islandArt.crown(40, 34, fronds, (p0, c, p1) => islandArt.leafNotched(p0, c, p1, { wmax: 5.4, w0: 1.3, notches: 3, depth: 0.55, side: -1 }))) it.push(item(RA, [sh]));
    return it;
  },
  // storm cloud (one outline) with a bolt beneath
  cloud() {
    const c = { cmds: [["M", 22, 62], ["C", 8, 62, 8, 46, 22, 44], ["C", 20, 32, 40, 26, 48, 36], ["C", 54, 22, 78, 26, 76, 40], ["C", 90, 40, 92, 62, 78, 62], ["Z"]] };
    return [item(RA, [c]), poly(RA, [[54, 64], [60, 64], [52, 76], [60, 76], [44, 96], [50, 78], [42, 78]])];
  },
  cloudOnly() { return [ICONS.cloud()[0]]; },
  // ship's wheel: rim, hub, eight spokes, eight handles — nothing overlaps
  wheel() {
    const it = [ring(RA, 50, 50, 40, 34), circ(RA, 50, 50, 8)];
    for (let i = 0; i < 8; i++) { const a = i * 45; it.push(...xf([rect(RA, 9.5, -2, 23.5, 4)], { tx: 50, ty: 50, rot: a })); it.push(...xf([rect(RA, 41, -2.5, 9, 5, 2)], { tx: 50, ty: 50, rot: a })); }
    return it;
  },
  // pier, after assets/dock.png: a deck of upright planks, a post at each corner, an anchor hung on it; the island lies to +x
  pier() {
    const deck = roundCorners([[22, 28], [98, 28], [98, 72], [22, 72]], 2);
    const slits = [36, 50, 64, 78, 92].map(x => reverseSub(polyCmds([[x - 1.1, 31], [x + 1.1, 31], [x + 1.1, 69], [x - 1.1, 69]])));
    return [item(RA, [deck, ...slits]), circ(RA, 22, 24, 5), circ(RA, 22, 76, 5), circ(RA, 98, 24, 5), circ(RA, 98, 76, 5)];
  },
  // a grass tuft — Wyatt's pick (2026-08-22): "C · the game's tuft", four fat blades curving outward like the green
  // art's tufts, ONE closed shape (a fan from a small hub) so the laser's fill never sees an overlap
  tuft() { return [item(RA, [islandArt.fan(50, 92, 14, [{ a: -158, l: 54, w: 5, bend: -12, belly: 2.2 }, { a: -112, l: 80, w: 5, bend: -6, belly: 2.2 }, { a: -68, l: 80, w: 5, bend: 6, belly: 2.2 }, { a: -22, l: 54, w: 5, bend: 12, belly: 2.2 }, { a: 90, l: 14, w: 0.1 }])])]; },
  // stones — Wyatt's pick (2026-08-22): "C · a cluster of three": big, middle and a pebble, grouped as the island art does
  stones() { return [item(RA, [islandArt.stone(30, 52, 28, 24, 7)]), item(RA, [islandArt.stone(67, 62, 17, 15, 2)]), item(RA, [islandArt.stone(90, 74, 8, 7, 9)])]; },
  // the trade-wind whirlpool, after assets/trade-swirl.png: two spiral arms about an eye
  swirl() {
    const arm = (phase) => { const pts = [], turns = 0.9, a0 = 10, b = (44 - a0) / (turns * Math.PI * 2), w0 = 7, w1 = 14; const P = (th, r) => [50 + r * Math.cos(th + phase), 50 + r * Math.sin(th + phase)];
      const n = 40; for (let i = 0; i <= n; i++) { const th = i / n * turns * Math.PI * 2, w = w0 + (w1 - w0) * (1 - i / n); pts.push(P(th, a0 + b * th + w / 2)); }
      for (let i = n; i >= 0; i--) { const th = i / n * turns * Math.PI * 2, w = w0 + (w1 - w0) * (1 - i / n); pts.push(P(th, Math.max(1, a0 + b * th - w / 2))); } return poly(RA, pts); };
    return [arm(0), arm(Math.PI), circ(RA, 50, 50, 5)];
  },
  // the fleur-de-lis tip of the game's compass needle
  fleur() {
    return [poly(RA, [[50, 4], [60, 26], [50, 40], [40, 26]]), item(RA, [{ cmds: [["M", 50, 40], ["C", 64, 26, 84, 30, 80, 46], ["C", 78, 56, 66, 54, 60, 48], ["L", 56, 56], ["L", 44, 56], ["L", 40, 48], ["C", 34, 54, 22, 56, 20, 46], ["C", 16, 30, 36, 26, 50, 40], ["Z"]] }]), rect(RA, 44, 58, 12, 6)];
  },
  // an eight-point compass rose
  rose() {
    const pts = []; for (let k = 0; k < 8; k++) { const a = k * 45, rr = k % 2 ? 24 : 46; pts.push([50 + rr * Math.cos(rad(a - 90)), 50 + rr * Math.sin(rad(a - 90))]); const b = a + 22.5; pts.push([50 + 9 * Math.cos(rad(b - 90)), 50 + 9 * Math.sin(rad(b - 90))]); }
    return [poly(RA, pts), ring(RA, 50, 50, 49.5, 48)];
  },
  // the game's boat (assets/boats): jib and mainsail on one mast, a rounded hull with portholes
  boat() {
    const hull = { cmds: [["M", 8, 62], ["L", 92, 62], ["C", 92, 76, 80, 86, 50, 86], ["C", 20, 86, 8, 76, 8, 62], ["Z"]] };
    const holes = [30, 50, 70].map(x => ({ circle: { cx: x, cy: 72, r: 3.2, ccw: true } }));
    return [item(RA, [hull, ...holes]), rect(RA, 48, 6, 4, 54), item(RA, [{ cmds: [["M", 54, 10], ["C", 80, 26, 86, 42, 84, 56], ["L", 54, 56], ["Z"]] }]), item(RA, [{ cmds: [["M", 46, 22], ["C", 28, 34, 22, 46, 20, 56], ["L", 46, 56], ["Z"]] }])];
  },
};
// place an icon: centre (cx,cy), size = the 100-box scaled to `size` mm, optional rotation
function icon(name, cx, cy, size, rot = 0) { return xf(xf(ICONS[name](), { tx: -50, ty: -50 }), { s: size / 100, rot, tx: cx, ty: cy }); }

/* =========================================================================================
   6. Token framings per version — crates, island markers and recipe icons share one style
   ========================================================================================= */
// inverted badge: a filled disc with the icon knocked out (every icon sub-path reversed)
function badge(name, cx, cy, d) {
  const disc = circ(RA, cx, cy, d / 2);
  const ic = icon(name, cx, cy, d * 0.66).map(reverseItem);
  return [{ ...disc, sub: [...disc.sub, ...ic.flatMap(i => i.sub)] }];
}
const TOKEN = {
  v1: { // square crate: rounded square, lid-edge band, icon
    crate(name, cx, cy) { const s = CELL * 0.56; return [rect(CU, cx - s / 2, cy - s / 2, s, s, 1.5), ...frameBand(cx, cy, s - 1.6, s - 1.6, 0.5, 1.2), ...icon(name, cx, cy, s * 0.62)]; },
    marker(name, cx, cy) { const d = CELL * 0.74; return [circ(CU, cx, cy, d / 2), ring(RA, cx, cy, d / 2 - 0.8, d / 2 - 1.4), ...icon(name, cx, cy, d * 0.6)]; },
    recipeIcon(name, cx, cy, d) { return icon(name, cx, cy, d); },
  },
  v2: { // round token, inverted badge
    crate(name, cx, cy) { const d = CELL * 0.6; return [circ(CU, cx, cy, d / 2), ...badge(name, cx, cy, d - 1.6)]; },
    marker(name, cx, cy) { const d = CELL * 0.78; return [circ(CU, cx, cy, d / 2), ring(RA, cx, cy, d / 2 - 0.6, d / 2 - 1.1), ...badge(name, cx, cy, d - 3.6)]; },
    recipeIcon(name, cx, cy, d) { return badge(name, cx, cy, d); },
  },
  v3: { // the ingredient art itself, cut along its own outline (Wyatt, 2026-08-22); on cards, its silhouette in the app's rounded-square chip
    crate(name, cx, cy) { return artToken(name, cx, cy); },
    marker(name, cx, cy) { return artToken(name, cx, cy); },
    recipeIcon(name, cx, cy, d) { return [...frameBand(cx, cy, d + 1.8, d + 1.8, 0.4, (d + 1.8) / 4), ...artToken(name, cx, cy, d * 0.86, { cut: false, outline: 0.32 })]; },
  },
};
function frameBand(cx, cy, w, h, t, rx) { // a rectangular band of thickness t (RASTER)
  const o = roundCorners([[cx - w / 2, cy - h / 2], [cx + w / 2, cy - h / 2], [cx + w / 2, cy + h / 2], [cx - w / 2, cy + h / 2]], rx);
  const i = reverseSub(roundCorners([[cx - w / 2 + t, cy - h / 2 + t], [cx + w / 2 - t, cy - h / 2 + t], [cx + w / 2 - t, cy + h / 2 - t], [cx - w / 2 + t, cy + h / 2 - t]], Math.max(0.2, rx - t)));
  return [item(RA, [o, i])];
}
function hexRing(cx, cy, r, t) { return item(RA, [ngon(RA, cx, cy, r, 6).sub[0], reverseSub(ngon(RA, cx, cy, r - t, 6).sub[0])]); }

/* =========================================================================================
   7. The pieces
   ========================================================================================= */
const gridLines = (valid) => { // unique cell edges as thin rects; verticals shortened so nothing overlaps
  const t = 0.35, out = [], H = new Set(), V = new Set();
  for (const k of valid) { const [x, y] = k.split(",").map(Number); H.add(`${x},${y}`); H.add(`${x},${y + 1}`); V.add(`${x},${y}`); V.add(`${x + 1},${y}`); }
  for (const k of H) { const [x, y] = k.split(",").map(Number); out.push(rect(RA, x * CELL - t / 2, y * CELL - t / 2, CELL + t, t)); }
  for (const k of V) { const [x, y] = k.split(",").map(Number); out.push(rect(RA, x * CELL - t / 2, y * CELL + t / 2, t, CELL - t)); }
  return out;
};

// the trade-wind current, one mark per rim square, tangent to the ring, clockwise — exactly
// buildRimFlow()'s rotate(deg+90) in 4/src/ui/board.js
function rimMarks(rim, style) {
  const out = [], C = CC * CELL + CELL / 2;
  for (const k of rim) {
    const [x, y] = k.split(",").map(Number), cx = (x + .5) * CELL, cy = (y + .5) * CELL;
    const deg = Math.atan2(cy - C, cx - C) * 180 / Math.PI, rr = Math.hypot(cx - C, cy - C);
    if (style === "arrow") {
      const L = CELL * .62, w = CELL * .13, hw = CELL * .36, hl = CELL * .26;
      out.push(...xf([poly(RA, [[-L / 2, -w / 2], [L / 2 - hl, -w / 2], [L / 2 - hl, -hw / 2], [L / 2, 0], [L / 2 - hl, hw / 2], [L / 2 - hl, w / 2], [-L / 2, w / 2]])], { tx: cx, ty: cy, rot: deg + 90 }));
    } else if (style === "chevron") {
      const a = CELL * .2, t = CELL * .11;
      const chev = (ox) => poly(RA, [[ox - a, -a], [ox - a + t, -a], [ox + t, 0], [ox - a + t, a], [ox - a, a], [ox, 0]]);
      out.push(...xf([chev(-CELL * .1), chev(CELL * .16)], { tx: cx, ty: cy, rot: deg + 90 }));
    } else if (style === "game") { // the app's own wind-arrow.png: one bold chevron, arms at 45°, corners lightly rounded
      const a = CELL * .27, t = CELL * .17, ox = (a - t) / 2;
      out.push(...xf([item(RA, [roundCorners([[ox - a, -a], [ox - a + t, -a], [ox + t, 0], [ox - a + t, a], [ox - a, a], [ox, 0]], CELL * .03)])], { tx: cx, ty: cy, rot: deg + 90 }));
    } else { // curved: an arc of the ring itself with a head at its clockwise end
      const half = (CELL * .3) / rr, w = CELL * .12, hw = CELL * .34, hl = CELL * .24, a0 = rad(deg) - half, a1 = rad(deg) + half, pts = [];
      const P = (a, r) => [C + r * Math.cos(a), C + r * Math.sin(a)];
      for (let i = 0; i <= 8; i++) pts.push(P(a0 + (a1 - a0) * i / 8, rr - w / 2));
      pts.push(P(a1, rr - hw / 2), P(a1 + hl / rr, rr), P(a1, rr + hw / 2));
      for (let i = 8; i >= 0; i--) pts.push(P(a0 + (a1 - a0) * i / 8, rr + w / 2));
      out.push(poly(RA, pts));
    }
  }
  return out;
}

// Isle of Tortuga's own square: sand edge band, anchor, name — centred on (cx,cy)
function homeSquareMarks(cx, cy) {
  return [...frameBand(cx, cy, CELL - 3, CELL - 3, 0.7, CELL * .25), ...icon("anchor", cx, cy - CELL * .13, CELL * .42), ...ftext(RA, "Tortuga", cx, cy + CELL * .36, CELL * .13, { font: "georgia-bold", align: "center" })];
}
// the board art's ripples (assets/board.png): many concentric passes of short, brushy wave strokes
// — tapered at both ends, broken by gaps, a little wobble, a little drift off the true radius — from
// just outside the berths to the inner edge of the rim. Wyatt, 2026-08-22: "smaller tighter ripples".
function rippleRings() {
  const C = CENTER, out = [];
  let seed = 20260822; const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  // "more wavy, jittery, scattered" (Wyatt): shorter strokes, each on its own wobble, scattered off the pass by
  // up to half the pitch, so no two strokes line up into a ring
  // r0 was CELL*1.75 while the + plug covered the berth squares; with the one-square Tortuga
  // (2026-08-25) the water runs in over them — strokes just stay 2 mm clear of the dotted silhouette
  const nearTort = (x, y) => { const dx = Math.abs(x - C), dy = Math.abs(y - C);
    return (dx <= CELL * .5 + 2 && dy <= CELL * .5 + 2) || (dx <= TDOCK.stem / 2 + 2 && dy <= CELL * .5 + TDOCK.reach + 2) || (dy <= TDOCK.stem / 2 + 2 && dx <= CELL * .5 + TDOCK.reach + 2); };
  const r0 = CELL * .85, r1 = CELL * 6.05, pitch = 7.5;
  for (let R0 = r0; R0 <= r1; R0 += pitch) {
    let th = rnd() * Math.PI * 2; const end = th + Math.PI * 2;
    while (th < end) {
      const len = 7 + rnd() * 20, gap = 4 + rnd() * 14, dTh = len / R0, drift = (rnd() - .5) * pitch * 0.9, thick = 0.3 + rnd() * 0.2;
      const wob = 14 + rnd() * 22, ph = rnd() * Math.PI * 2, amp = 0.5 + rnd() * 0.9;
      if (th + dTh > end) break;
      const n = Math.max(6, Math.round(len / 1.6)), outer = [], inner = [];
      for (let i = 0; i <= n; i++) {
        const t = i / n, a = th + dTh * t, r = R0 + drift + amp * Math.sin(wob * a + ph), w = thick * Math.sin(Math.PI * t) + 0.02;
        outer.push([C + (r + w / 2) * Math.cos(a), C + (r + w / 2) * Math.sin(a)]); inner.push([C + (r - w / 2) * Math.cos(a), C + (r - w / 2) * Math.sin(a)]);
      }
      if (!outer.some(p => nearTort(p[0], p[1]))) out.push(poly(RA, [...outer, ...inner.reverse()]));
      th += dTh + gap / R0;
    }
  }
  return out;
}
// four berths, each pier facing back toward the island (dockOrient([-d]))
function berthMarks(DIRS) {
  const hx = CC, hy = CC, out = [];
  for (const d of DIRS) { const cx = (hx + d[0] + .5) * CELL, cy = (hy + d[1] + .5) * CELL, rot = Math.atan2(-d[1], -d[0]) * 180 / Math.PI; out.push(...icon("pier", cx, cy, CELL * .82, rot)); }
  return out;
}
function homeMarks(DIRS) { return [...homeSquareMarks((CC + .5) * CELL, (CC + .5) * CELL), ...berthMarks(DIRS)]; }

function spinnerDial(style, R, cx, cy, { onBoard = false } = {}) {
  const it = [];
  if (!onBoard) it.push(circ(CU, cx, cy, R));
  it.push(circ(CU, cx, cy, 1.65)); // pivot, M3 bolt or brass fastener
  it.push(ring(RA, cx, cy, R - 1, R - 2.4));
  it.push(ring(RA, cx, cy, 5.5, 4.5));
  const divider = (a, r0, r1, w) => xf([rect(RA, r0, -w / 2, r1 - r0, w)], { tx: cx, ty: cy, rot: a });
  const wedge = (a0, a1, r0, r1) => { const pts = []; for (let i = 0; i <= 10; i++) pts.push([cx + r1 * Math.cos(rad(a0 + (a1 - a0) * i / 10)), cy + r1 * Math.sin(rad(a0 + (a1 - a0) * i / 10))]); for (let i = 10; i >= 0; i--) pts.push([cx + r0 * Math.cos(rad(a0 + (a1 - a0) * i / 10)), cy + r0 * Math.sin(rad(a0 + (a1 - a0) * i / 10))]); return poly(RA, pts); };
  const stormWedge = (a0, a1) => { const w = wedge(a0, a1, R * .33, R * .86), am = rad((a0 + a1) / 2), rm = R * .6; const cl = icon("cloudOnly", cx + rm * Math.cos(am), cy + rm * Math.sin(am), R * .2).map(reverseItem); return [{ ...w, sub: [...w.sub, ...cl.flatMap(i => i.sub)] }]; };
  const letters = (rr, px) => [["N", -90], ["E", 0], ["S", 90], ["W", 180]].forEach(([L, a]) => it.push(...text(RA, L, cx + rr * Math.cos(rad(a)), cy + rr * Math.sin(rad(a)), px, { align: "center", valign: "middle" })));
  if (style === "quadrants" || style === "quadrants-storm") {
    for (const a of [45, 135, 225, 315]) it.push(...divider(a, R * .3, R * .86, 1));
    letters(R * .6, R * .033);
    if (style === "quadrants-storm") for (const q of [-45, 45, 135, 225]) it.push(...stormWedge(q + 72, q + 90)); // last 18° of each quadrant = 20%
  } else if (style === "roulette") {
    for (let i = 0; i < 20; i++) { const a = -45 + i * 18, bold = i % 5 === 0; it.push(...divider(a, bold ? R * .3 : R * .45, R * .86, bold ? 1.2 : 0.5)); }
    for (let q = 0; q < 4; q++) it.push(...stormWedge(-45 + q * 90 + 72, -45 + q * 90 + 90));
    letters(R * .58, R * .03);
  }
  return it;
}
// a five-sector spinner, one sector a storm — the app's 20% per round
function stormDial(R) {
  const it = [circ(CU, 0, 0, R), circ(CU, 0, 0, 1.65), ring(RA, 0, 0, R - 1, R - 2.2), ring(RA, 0, 0, 4.5, 3.6)];
  for (let i = 0; i < 5; i++) it.push(...xf([rect(RA, R * .28, -.4, R * .55, .8)], { rot: -90 + i * 72 }));
  const a0 = -90 + 4 * 72 + 4, a1 = -90 + 360 - 4, pts = [];
  for (let i = 0; i <= 10; i++) pts.push([R * .8 * Math.cos(rad(a0 + (a1 - a0) * i / 10)), R * .8 * Math.sin(rad(a0 + (a1 - a0) * i / 10))]);
  for (let i = 10; i >= 0; i--) pts.push([R * .34 * Math.cos(rad(a0 + (a1 - a0) * i / 10)), R * .34 * Math.sin(rad(a0 + (a1 - a0) * i / 10))]);
  const wedge = poly(RA, pts), am = rad((a0 + a1) / 2), cl = icon("cloudOnly", R * .57 * Math.cos(am), R * .57 * Math.sin(am), R * .3).map(reverseItem);
  it.push({ ...wedge, sub: [...wedge.sub, ...cl.flatMap(i => i.sub)] });
  return it;
}
function spinnerArrows(cx, cy) { // current (bold, "NOW") and forecast (hollow) on the same pivot
  const cur = poly(CU, [[-12, -3], [19, -3], [19, -8], [30, 0], [19, 8], [19, 3], [-12, 3], [-8, 0]]);
  const now = [cur, circ(CU, 0, 0, 1.65), ...text(RA, "NOW", 5, 0, 0.72, { align: "center", valign: "middle" })];
  const fo = item(CU, [polyCmds([[-10, -3.2], [14, -3.2], [14, -8], [24, 0], [14, 8], [14, 3.2], [-10, 3.2]])]);
  const foIn = item(RA, [polyCmds([[-10, -3.2], [14, -3.2], [14, -8], [24, 0], [14, 8], [14, 3.2], [-10, 3.2]]), reverseSub(polyCmds([[-8.6, -1.8], [12.6, -1.8], [12.6, -4.6], [20.6, 0], [12.6, 4.6], [12.6, 1.8], [-8.6, 1.8]]))]);
  const next = [fo, foIn, circ(CU, 0, 0, 1.65)];
  const washer = [circ(CU, 0, 0, 4.5), circ(CU, 0, 0, 1.65)];
  return { now: xf(now, { tx: cx, ty: cy }), next: xf(next, { tx: cx + 50, ty: cy }), washers: [xf(washer, { tx: cx + 90, ty: cy }), xf(washer, { tx: cx + 102, ty: cy })] };
}

function shipStanding(kind, captain) {
  const it = [];
  const pat = captain; // 0 plain disc, 1 stripes, 2 dots, 3 checks
  if (kind === "sloop") {
    it.push(poly(CU, [[0, 12], [8, 12], [8, 0], [9.2, 0], [9.2, 1], [16, 11], [9.2, 11], [9.2, 12], [17, 12], [15, 17], [11, 17], [11, 17 + MAT - .1], [5, 17 + MAT - .1], [5, 17], [2, 17]]));
    it.push(rect(RA, 1.5, 13.5, 14.5, 0.6), rect(RA, 2.5, 15.2, 12, 0.6));
    it.push(...sailPattern(pat, [[10.2, 3.6], [14.2, 10], [10.2, 10]]));
  } else {
    it.push(poly(CU, [[0, 13], [7.5, 13], [7.5, 0], [8.7, 0], [8.7, 1], [15, 1], [15, 6], [8.7, 6], [8.7, 7.5], [15, 7.5], [15, 12], [8.7, 12], [8.7, 13], [18, 13], [16, 18], [11, 18], [11, 18 + MAT - .1], [5, 18 + MAT - .1], [5, 18], [2, 18]]));
    it.push(rect(RA, 1.5, 14.5, 15.5, 0.6), rect(RA, 2.5, 16.2, 13, 0.6));
    it.push(...sailPattern(pat, [[9.6, 1.9], [14.1, 1.9], [14.1, 5.1], [9.6, 5.1]]), ...sailPattern(pat, [[9.6, 8.4], [14.1, 8.4], [14.1, 11.1], [9.6, 11.1]]));
  }
  const base = [rect(CU, 0, 0, 18, 9, 2), rect(CU, 9 - (MAT + .15) / 2, 1.4, MAT + .15, 6.2)];
  return { profile: it, base };
}
// Wyatt, 2026-08-22: "Make the ships 3d by slotting two vertical sails into a horizontal ship bottom. The sails in
// 3mm, bottom in 6mm." The hull is the boat seen from above — pointed bow, round stern, deck planks — with two
// slots along its centreline; the main sail and the jib each carry a tab that drops through a slot.
function ship3d(c) {
  // Wyatt: "model the ship off an old pirate ship, not a modern yacht ... rotate the hull notches 90 degrees so that the
  // sails can be perpendicular to the direction of the ship; make the sails square-ish; draw the game art skull and
  // crossbones on the sails" — assets/icons/sailboat.png is the reference: square sail, skull and bones, wooden hull.
  const L = 24, B = 12, sw = MAT3 + .05, sl = 7, hull = [];   // slot play 0.05 — sails snap (Wyatt, 2026-08-25)
  hull.push(item(CU, [{ cmds: [["M", 3, 0.8], ["L", 14, 0.8], ["C", 18.5, 0.8, 21.5, B * .22, L, B / 2], ["C", 21.5, B * .78, 18.5, B - .8, 14, B - .8], ["L", 3, B - .8], ["C", 0.6, B - .8, 0.6, 0.8, 3, 0.8], ["Z"]] }]));
  hull.push(rect(CU, 7.5 - sw / 2, B / 2 - sl / 2, sw, sl), rect(CU, 15.5 - sw / 2, B / 2 - sl / 2, sw, sl));   // slots athwartships
  for (const py of [B * .25, B * .5, B * .75]) hull.push(rect(RA, 3.2, py - .22, 16.5, .44));                       // deck planks
  hull.push(rect(RA, 1.6, B / 2 - .3, 1.6, .6));                                                                   // tiller
  const sail = (w, hgt, pat) => { const mh = hgt + 8, y0 = 2, y1 = 2 + hgt; const pts = [[0, 0], [2.6, 0], [2.6, mh], [tab_(sl) / 2 + 1.3, mh], [tab_(sl) / 2 + 1.3, mh + MAT], [-tab_(sl) / 2 + 1.3, mh + MAT], [-tab_(sl) / 2 + 1.3, mh], [0, mh], [0, y1 + 1.2], [-(w / 2 - 1.3), y1 + 2.2], [-(w / 2 - 1.3), y0], [-(w / 2 - 1.3) + 0, y0], [0, y0]];
    // one outline: mast, a square sail hung left AND right of the mast, its foot bellying down
    const sq = [[0, 0], [2.6, 0], [2.6, y0], [w / 2 + 1.3, y0], [w / 2 + 1.3, y1], [w / 2 - 1.5, y1 + 1.6], [1.3, y1 + 2.4], [-(w / 2 - 2.8), y1 + 1.6], [-(w / 2 - 1.3), y1], [-(w / 2 - 1.3), y0], [0, y0]];
    const foot = sq.findIndex(p => p[0] === 0 && p[1] === y0 && sq.indexOf(p) > 0);
    const outline = [[0, 0], [2.6, 0], [2.6, y0], [w / 2 + 1.3, y0], [w / 2 + 1.3, y1], [w / 2 - 1.5, y1 + 1.6], [2.6, y1 + 2.4], [2.6, mh], [tab_(sl) / 2 + 1.3, mh], [tab_(sl) / 2 + 1.3, mh + MAT], [-tab_(sl) / 2 + 1.3, mh + MAT], [-tab_(sl) / 2 + 1.3, mh], [0, mh], [0, y1 + 2.4], [-(w / 2 - 2.8), y1 + 1.6], [-(w / 2 - 1.3), y1], [-(w / 2 - 1.3), y0], [0, y0]];
    // Wyatt, 2026-08-25: skull BIG on both sail faces (the question UI settled sails over his word "masts";
    // overrules "plain sails", 2026-08-22). Same day, on seeing the traced ☠️: "the emoji raster doesn't look
    // right -- use notes/skull-ref.png instead" — his reference, traced black-on-white (art/skull-ref.png).
    const cx = 1.3, cy = y0 + 1.4 + (hgt - 1.4) * .5, sk = Math.min(w - 4, hgt - 3.4);
    void pat;
    return [item(CU, [polyCmds(outline)]), rect(RA, -(w / 2 - 1.3), y0 + .6, w, .5), ...artToken("skullref", cx, cy, sk, { cut: false, solid: true })];
  };
  const main = sail(15, 13, c), fore = sail(12, 11, c);
  return [{ ...part(`ship-${CAPTAINS[c]}-hull`, hull), mat: MAT }, { ...part(`ship-${CAPTAINS[c]}-main`, main), mat: MAT3 }, { ...part(`ship-${CAPTAINS[c]}-fore`, fore), mat: MAT3 }];
}
const tab_ = sl => sl - 0.1;   // 0.1 play along the slot (was 0.3 — the 2026-08-25 ruling: 3 mm pieces snap)
// crossed bones as ONE polygon (a plus turned 45°) so no two fills overlap, with a knob at each end
function crossbones(cx, cy, L) {
  const w = L * .22, plus = [[-L, -w / 2], [-w / 2, -w / 2], [-w / 2, -L], [w / 2, -L], [w / 2, -w / 2], [L, -w / 2], [L, w / 2], [w / 2, w / 2], [w / 2, L], [-w / 2, L], [-w / 2, w / 2], [-L, w / 2]];
  const out = xf([poly(RA, plus)], { rot: 45, tx: cx, ty: cy });
  for (const a of [45, 135, 225, 315]) { const r = L + w * .55; out.push(circ(RA, cx + r * Math.cos(rad(a)), cy + r * Math.sin(rad(a)), w * .62)); }
  return out;
}
function ship3d_old(c) {
  const L = 22, B = 11, sw = MAT3 + .2, sl = 5.5, hull = [];
  hull.push(item(CU, [{ cmds: [["M", 2.2, 0], ["L", 14, 0], ["C", 18, 0, 21, -B * .3, L, -B * .5 + B * .5], ["L", L, 0], ["C", 21, B * .3 - B * .5 + B * .5, 18, B, 14, B], ["L", 2.2, B], ["C", -0.8, B, -0.8, 0, 2.2, 0], ["Z"]].map(cmd => cmd) }]));
  // that outline is awkward to read as numbers: a spindle — stern arc on the left, bow point at (L, B/2)
  hull[0] = item(CU, [{ cmds: [["M", 2.2, 0], ["L", 13, 0], ["C", 17.5, 0, 20.5, B * .2, L, B / 2], ["C", 20.5, B * .8, 17.5, B, 13, B], ["L", 2.2, B], ["C", -0.9, B, -0.9, 0, 2.2, 0], ["Z"]] }]);
  hull.push(rect(CU, 4, B / 2 - sw / 2, sl, sw), rect(CU, 11.5, B / 2 - sw / 2, sl, sw));
  for (const py of [B * .22, B * .78]) hull.push(rect(RA, 2.5, py - .25, 15, .5));
  hull.push(rect(RA, 1.2, B / 2 - .3, 1.8, .6)); // tiller
  const main = [item(CU, [polyCmds([[0, 0], [2, 0], [2, 4], [14, 18], [2, 20], [2, 24], [5.3 + 2, 24], [5.3 + 2, 24 + MAT], [2, 24 + MAT], [0, 24 + MAT]])]), ...sailPattern(c, [[3.2, 5.5], [11.5, 17], [3.2, 18.5]])];
  const jib = [item(CU, [polyCmds([[0, 0], [2, 0], [2, 2], [11, 14.5], [2, 15.5], [2, 18], [7.3, 18], [7.3, 18 + MAT], [2, 18 + MAT], [0, 18 + MAT]])]), ...sailPattern(c, [[3.2, 3.5], [9.2, 13.5], [3.2, 14]])];
  return [{ ...part(`ship-${CAPTAINS[c]}-hull`, hull), mat: MAT }, { ...part(`ship-${CAPTAINS[c]}-main`, main), mat: MAT3 }, { ...part(`ship-${CAPTAINS[c]}-jib`, jib), mat: MAT3 }];
}
// four captains told apart in black and white: 0 plain, 1 stripes, 2 dots, 3 checks — kept inside the sail polygon
function sailPattern(pat, polyPts) {
  const b = bbox([poly(RA, polyPts)]), out = [];
  const inside = (x, y) => { let c = false; for (let i = 0, j = polyPts.length - 1; i < polyPts.length; j = i++) { const [xi, yi] = polyPts[i], [xj, yj] = polyPts[j]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c; } return c; };
  const cell = 1.1;
  for (let y = b.y0 + .4; y < b.y1 - .4; y += cell) for (let x = b.x0 + .4; x < b.x1 - .4; x += cell) {
    const cx = x + cell / 2, cy = y + cell / 2; if (!inside(cx - .45, cy - .45) || !inside(cx + .45, cy + .45) || !inside(cx + .45, cy - .45) || !inside(cx - .45, cy + .45)) continue;
    const ix = Math.round((x - b.x0) / cell), iy = Math.round((y - b.y0) / cell);
    if (pat === 0) continue;
    if (pat === 1 && iy % 2) continue;
    if (pat === 2) { out.push(circ(RA, cx, cy, .32)); continue; }
    if (pat === 3 && (ix + iy) % 2) continue;
    out.push(rect(RA, x + .1, y + .1, cell - .2, cell - .2));
  }
  if (pat === 0) { const cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2; out.push(circ(RA, cx, cy, Math.min(b.w, b.h) * .18)); }
  return out;
}

function whirlpool(style, cx, cy) {
  const s = PIECE, it = [rect(CU, cx - s / 2, cy - s / 2, s, s, 2)], Rmax = s * .42;
  const spiral = (turns, w, a0) => { const b = (Rmax - a0 - w / 2) / (turns * Math.PI * 2), n = Math.round(turns * 40), pts = [], P = (th, r) => [cx + r * Math.cos(th), cy + r * Math.sin(th)]; for (let i = 0; i <= n; i++) { const th = i / n * turns * Math.PI * 2; pts.push(P(th, a0 + b * th + w / 2)); } for (let i = n; i >= 0; i--) { const th = i / n * turns * Math.PI * 2; pts.push(P(th, Math.max(0.05, a0 + b * th - w / 2))); } return poly(RA, pts); };
  if (style === "swirl") it.push(...artToken("swirl", cx, cy, s * .84, { cut: false }));
  else if (style === "spiral") it.push(spiral(2.5, 1.1, 1.0));
  else if (style === "rings") { for (const [r, a] of [[Rmax, 20], [Rmax * .66, 160], [Rmax * .33, 300]]) { const pts = [], w = 1.1; for (let i = 0; i <= 24; i++) pts.push([cx + (r + w / 2) * Math.cos(rad(a + i * 11.25)), cy + (r + w / 2) * Math.sin(rad(a + i * 11.25))]); for (let i = 24; i >= 0; i--) pts.push([cx + (r - w / 2) * Math.cos(rad(a + i * 11.25)), cy + (r - w / 2) * Math.sin(rad(a + i * 11.25))]); it.push(poly(RA, pts)); } it.push(circ(RA, cx, cy, 1.1)); }
  else { it.push(spiral(2, 1.7, 2.2), circ(RA, cx, cy, 1.6)); }
  return it;
}

// a closed polyline with the coast gently waved along its outward normal — still, the wave dies out
// within `quiet` mm of each notch midpoint so the dock slots stay on straight shore
function waveCoast(cmds, notchMids, { amp = 0.7, lambda = 9, quiet = 7, step = 0.8, phase = 0, ripple = 0 } = {}) {
  const raw = flatten({ cmds }, 16).pts, pts = [];
  for (let i = 0; i < raw.length; i++) { const a = raw[i], b = raw[(i + 1) % raw.length], L = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(1, Math.ceil(L / step)); for (let k = 0; k < n; k++) pts.push([a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n]); }
  const cw = signedArea(pts) > 0, out = []; let sArc = 0;
  // fit whole waves round the loop, so the coast closes without a step where it started
  let perim = 0; for (let i = 0; i < pts.length; i++) { const q = pts[(i + 1) % pts.length]; perim += Math.hypot(q[0] - pts[i][0], q[1] - pts[i][1]); }
  const lam = perim / Math.max(1, Math.round(perim / lambda)), lam2 = perim / Math.max(1, Math.round(perim / (lambda * 0.53)));
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], q = pts[(i + 1) % pts.length], pr = pts[(i + pts.length - 1) % pts.length];
    const tx = q[0] - pr[0], ty = q[1] - pr[1], tl = Math.hypot(tx, ty) || 1, nx = (cw ? ty : -ty) / tl, ny = (cw ? -tx : tx) / tl; // outward
    const dmin = Math.min(...notchMids.map(m => Math.hypot(p[0] - m[0], p[1] - m[1])));
    const f = dmin <= quiet ? 0 : dmin >= quiet + 5 ? 1 : (dmin - quiet) / 5;
    const w = amp * f * (Math.sin(2 * Math.PI * sArc / lam + phase) + ripple * Math.sin(2 * Math.PI * sArc / lam2 + phase * 1.7)) / (1 + ripple);
    out.push([p[0] + nx * w, p[1] + ny * w]);
    sArc += Math.hypot(q[0] - p[0], q[1] - p[1]);
  }
  return out;
}
// drop a notch into a dense polyline: points within hw of the midpoint (along the edge) are replaced by the notch
function notchPolyline(ptsIn, m, along, hw, notchPts, offTol = 1.5) {
  // start the walk at the point farthest from the notch, so the window never straddles index 0
  const n = ptsIn.length; let far = 0, fd = -1; for (let i = 0; i < n; i++) { const d = Math.hypot(ptsIn[i][0] - m[0], ptsIn[i][1] - m[1]); if (d > fd) { fd = d; far = i; } }
  const pts = [...ptsIn.slice(far), ...ptsIn.slice(0, far)], idx = [];
  for (let i = 0; i < n; i++) { const d = (pts[i][0] - m[0]) * along[0] + (pts[i][1] - m[1]) * along[1], off = Math.abs((pts[i][0] - m[0]) * along[1] - (pts[i][1] - m[1]) * along[0]); if (Math.abs(d) <= hw && off < offTol) idx.push(i); }
  if (!idx.length) return pts;
  const first = idx[0], last = idx[idx.length - 1];
  return [...pts.slice(0, first), ...notchPts, ...pts.slice(last + 1)];
}
// Wyatt, 2026-08-22 (after the generated coasts): the island IS the game's island art — assets/islands/N.png traced
// (art/trace.py): the sand silhouette is the cut, the art's palms, rocks, grass edge the engraving. Shapes 8 and 9
// are the L and the S mirrored. A dock notch is cut where the coast crosses the middle of each outside edge, and
// any engraving that would meet a notch is dropped, so no cut ever crosses ink.
function islandFromArt(shapeIdx) {
  const cells = ISLAND_SHAPES[shapeIdx], artKey = shapeIdx === 7 ? "island5" : shapeIdx === 8 ? "island6" : `island${shapeIdx + 1}`, mirror = shapeIdx >= 7;
  return islandClean(cells, artKey, mirror, [], shapeIdx);
}
// Wyatt's SECOND drawing (notes/islands.jpeg, 2026-08-22) and his answers to the questions, all rulings his:
//   the cut is ruler-straight between 5 mm corners (no wave), 0.4 mm inside the squares, a plain 9 x 2.6 notch in the
//   middle of every outside edge whose floor bites a little into the shore line; TWO engraved lines inside it — shore
//   and grass, 0.6 mm, each waving its own way, bare wood between them as the beach; one mark per square, centred: the
//   wind-blown palm on an end square, the three stones on the junction square with a tuft beside them, the game's tuft
//   on every other square. Tortuga (marks: false) gets the same coast and keeps its piers and name.
function islandClean(cells, artKey, mirror = false, extra = [], seedBase = 17, { palm = true } = {}) {
  const loop = traceCells(cells)[0].map(([x, y]) => [x * CELL, y * CELL]);
  const edges = perimeterEdges(cells).map(e => ({ ...e, m: [e.m[0] * CELL + e.inward[0] * CLR, e.m[1] * CELL + e.inward[1] * CLR] }));
  // the cut: the rounded polyomino, straight-edged, notched
  const rounded = roundCorners(offsetPoly(loop, -CLR), ISLAND_R);
  let pts = waveCoast(rounded.cmds, [], { amp: 0, step: 0.5 });
  if (signedArea(pts) < 0) pts = pts.reverse();
  for (const e of edges) pts = notchPolyline(pts, e.m, e.along, NOTCH.socket.hw + 0.2, slotPts(e.m, e.along, e.inward, NOTCH.socket, +1));
  const it = [item(CU, [polyCmds(pts)])];
  // the two lines: each an inset of the footprint with its own 5 mm corners (so the beach widens a little at every
  // corner, as in the drawing), waved on its own phase, drawn LINE_W wide as a ring
  const lineAt = (d, phase) => { const c = roundCorners(offsetPoly(loop, -CLR - d), ISLAND_R), w = waveCoast(c.cmds, [], { amp: 0.5, lambda: 11, quiet: 0, step: 0.6, phase, ripple: 0.4 });
    return item(RA, [polyCmds(offsetPoly(w, LINE_W / 2)), reverseSub(polyCmds(offsetPoly(w, -LINE_W / 2)))]); };
  it.push(lineAt(SHORE_LINE, seedBase * 1.37), lineAt(GRASS_LINE, seedBase * 2.71 + 1.9));
  // the marks
  if (palm) {
    const set = new Set(cells.map(c => c.join(","))), nb = c => [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(d => set.has(`${c[0] + d[0]},${c[1] + d[1]}`)).length;
    const nbs = cells.map(nb), minNb = Math.min(...nbs), maxNb = Math.max(...nbs);
    const palmCell = cells[cells.map((c, i) => i).filter(i => nbs[i] === minNb).pop()];
    const stonesCell = cells.find((c, i) => nbs[i] === maxNb && c !== palmCell) || cells.find(c => c !== palmCell);
    for (const c of cells) { const x = (c[0] + .5) * CELL, y = (c[1] + .5) * CELL;
      if (c === palmCell) it.push(...icon("palm", x, y, CELL * .5));
      else if (c === stonesCell) { it.push(...icon("stones", x - CELL * .1, y - CELL * .04, 6)); it.push(...icon("tuft", x + CELL * .16, y + CELL * .1, 4)); }
      else it.push(...icon("tuft", x, y, 4)); }
  }
  it.push(...extra);
  void artKey; void mirror;
  return it;
}
function islandPiece(v, shapeIdx) {
  if (v === "v3") return islandFromArt(shapeIdx);
  const cells = ISLAND_SHAPES[shapeIdx], loop = traceCells(cells)[0].map(([x, y]) => [x * CELL, y * CELL]);
  const inset = offsetPoly(loop, -CLR);
  const outline = roundCorners(inset, v === "v3" ? 4.2 : 3);   // "round the corners more" — but leave a straight run for the dock notch and the band around it
  const edges = perimeterEdges(cells).map(e => ({ ...e, m: [e.m[0] * CELL + e.inward[0] * CLR, e.m[1] * CELL + e.inward[1] * CLR] }));
  const it = [];
  if (v === "v3") {
    // the game's coast: a wavy sand edge (Wyatt, 2026-08-22). Wave first, then the dock slots.
    let pts = waveCoast(outline.cmds, edges.map(e => e.m), { quiet: 9 });
    for (const e of edges) pts = notchPolyline(pts, e.m, e.along, DOVE.socket.head / 2 + 0.2, dovetailPts(e.m, e.along, e.inward, DOVE.socket, +1));
    it.push(item(CU, [polyCmds(pts)]));
    // the sand band goes AROUND each notch, 0.8 mm clear of the cut, so no cut ever crosses the engraving (Wyatt: "the
    // notches cut into the islands' black raster lines, which will look messy"). It follows a coast whose notches are
    // plain rectangles a little larger than the dovetails — offsets of an undercut would fold over on themselves.
    let bandCoast = waveCoast(outline.cmds, edges.map(e => e.m), { quiet: 9 });
    for (const e of edges) bandCoast = notchPolyline(bandCoast, e.m, e.along, DOVE.socket.head / 2 + 0.7, slotPts(e.m, e.along, e.inward, { hw: DOVE.socket.head / 2 + 0.5, depth: DOVE.socket.depth + 0.6 }, +1));
    const band = offsetPoly(bandCoast, -0.9), inner = offsetPoly(bandCoast, -1.9);
    it.push(item(RA, [polyCmds(band), reverseSub(polyCmds(inner))]));
    const set = new Set(cells.map(c => c.join(","))), nb = c => [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(d => set.has(`${c[0] + d[0]},${c[1] + d[1]}`)).length;
    let seed = shapeIdx * 7919 + 13; const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
    // tufts live in the squares' corners — away from the edge midpoints where a dock nests, and from the token
    for (const [cx, cy] of cells) for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { if (rnd() < 0.35) continue; const x = (cx + .5) * CELL + sx * (CELL * .3 + rnd() * 1.2), y = (cy + .5) * CELL + sy * (CELL * .3 + rnd() * 1.2); it.push(...icon("tuft", x, y, 3.2 + rnd() * 1.2)); }
    const best = cells.reduce((a, c) => nb(c) > nb(a) ? c : a, cells[0]);
    it.push(...icon("palm", (best[0] + .5) * CELL - 2, (best[1] + .5) * CELL - 1, CELL * .5));
    const rockCell = cells[cells.length - 1];
    it.push(...icon("rock", (rockCell[0] + .5) * CELL + CELL * .27, (rockCell[1] + .5) * CELL - CELL * .27, 4.5));
    return it;
  }
  if (v === "v2") for (const e of edges) insertNotch(outline.cmds, e.m, mushroomPts(e.m, e.along, e.inward, JIG.socket, +1));
  it.push(item(CU, [outline]));
  it.push(item(RA, [roundCorners(offsetPoly(loop, -(CLR + 1.6)), 2), reverseSub(roundCorners(offsetPoly(loop, -(CLR + 2.6)), 1.2))]));
  const set = new Set(cells.map(c => c.join(","))), nb = c => [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(d => set.has(`${c[0] + d[0]},${c[1] + d[1]}`)).length;
  const best = cells.reduce((a, c) => nb(c) > nb(a) ? c : a, cells[0]);
  it.push(...icon("palm", (best[0] + .5) * CELL, (best[1] + .5) * CELL, CELL * .62));
  return it;
}
const JIG = { nub: { hw: 1.5, nd: 1.4, r: 2.3 }, socket: { hw: 1.65, nd: 1.4, r: 2.45 } };
const SLOT = { slot: { hw: (MAT + .3) / 2, depth: 4.5 } };
// Wyatt, 2026-08-22: "little notches cut in along every of their square's edges, where a dock could slot in;
// small and subtle so it doesn't take up much of the square". A dovetail 3 mm at the mouth, 4.2 at the
// root, 2.4 deep: it locks against being pulled apart, and hides under the ingredient that sits on the square.
// Wyatt, later the same day: "widen the notches so that the entire dock design can nest directly into the island".
// The tab is now as wide as the pier itself; 0.15 mm of play all round (the usual fit for 6 mm ply after kerf).
const DOVE = { tab: { neck: 9.6, head: 11.0, depth: 3.0 }, socket: { neck: 9.75, head: 11.15, depth: 3.1 } };   // (the earlier, wider dovetail — kept for v1/v2)
// Wyatt's drawing, 2026-08-22 (notes/docknotch.jpeg): a plain square-cornered notch in the middle of every outside
// edge, 6 mm wide and 2.5 mm deep, shallow enough never to reach the engraved line inside; the dock's deck is the
// same 6 mm wide and becomes the tab. 0.15 mm of play.
// 2026-08-22, later: "make the dock, and notch, 50% wider" — 9 mm
const NOTCH = { tab: { hw: 4.5, depth: 2.5 }, socket: { hw: 4.525, depth: 2.6 } }, ISLAND_R = 5;   // side play 0.05
// total (was 0.15 — the 2026-08-25 test cut wiggled; "the docks should snap into the islands"); depth keeps 0.1
// Wyatt's second drawing (notes/islands.jpeg, 2026-08-22): two engraved lines inside the cut — the SHORE line and the
// GRASS line, bare wood between them is the beach. He drew them 3.5 and 6.5 mm in; they sit 0.9 mm further out here
// because he also ruled that the notch floor should bite a little INTO the shore line ("the dock is literally touching
// the sand") while the dock's 2.5 mm tab stays as it is — so the shore line straddles the 2.6 mm notch floor. The beach
// between the lines is the drawing's 2.4 mm.
const SHORE_LINE = 2.6, GRASS_LINE = 5.6, LINE_W = 0.6;
function dovetailPts(m, along, inward, { neck, head, depth }, dir) {
  const n = [inward[0] * dir, inward[1] * dir], t = along, P = (x, d) => [m[0] + t[0] * x + n[0] * d, m[1] + t[1] * x + n[1] * d];
  return [P(-neck / 2, 0), P(-head / 2, depth), P(head / 2, depth), P(neck / 2, 0)];
}

// ---- THE T-DOCK (Wyatt's remake, 2026-08-25 evening — twenty question-UI rulings) ----
// The square dock tile is GONE: the pier itself is the cut. ONE geometry serves the seven player
// docks and Tortuga's four baked arms — two things that must agree are one thing (CLAUDE.md rule 23).
// stem 9 wide (the deck IS the tab, unchanged, so the already-cut islands keep working); reach 12.5
// total so the head's outer face lands on the square's midline — the 24 × 12 hull lies BROADSIDE
// against the straight berth face and fits the outer half of the square (nose-in was measured out:
// only 8 mm of water beside a centred 9 mm stem); head 18 × 3.5, 1 mm rounds on its corners.
// Bollards are part of the CUT, not engraving: half-round lugs off the stem's sides — his pen
// drawing at the laser: two pairs, one near the sand, one at the head; nothing drawn on them.
// Frame: the island's cut edge passes through `m` along unit `t`; unit `o` points to sea.
const TDOCK = { stem: 9, reach: 12.5, head: 18, headD: 3.5, r: 1, lug: 1.1, lugAt: [1.8, 7.2] };
function tArmPts(m, t, o, { lugs = true } = {}) {
  const { stem, reach, head, headD, r, lug, lugAt } = TDOCK, hs = stem / 2, hh = head / 2, d0 = reach - headD;
  const pts = [], P = (u, d) => pts.push([m[0] + t[0] * u + o[0] * d, m[1] + t[1] * u + o[1] * d]);
  const arc = (cu, cd, rr, a0, a1, n = 6) => { for (let i = 0; i <= n; i++) { const a = a0 + (a1 - a0) * i / n; P(cu + rr * Math.cos(a), cd + rr * Math.sin(a)); } };
  // bollards are FULL circles, as his pen drawing has them (2026-08-25, second correction — the
  // first build cut semicircles): the circle's centre stands `bite` short of a full radius off the
  // stem's edge, so almost the whole ring shows and a ~1.5 mm neck of wood attaches it
  const bite = 0.8, A = Math.acos(bite / lug);
  P(-hs, 0);
  if (lugs) for (const d of lugAt) arc(-hs - bite, d, lug, -A, -(2 * Math.PI - A), 12);
  P(-hs, d0);
  arc(-hh + r, d0 + r, r, -Math.PI / 2, -Math.PI, 4);
  arc(-hh + r, reach - r, r, Math.PI, Math.PI / 2, 4);
  arc(hh - r, reach - r, r, Math.PI / 2, 0, 4);
  arc(hh - r, d0 + r, r, 0, -Math.PI / 2, 4);
  P(hs, d0);
  if (lugs) for (const d of [...lugAt].reverse()) arc(hs + bite, d, lug, Math.PI - A, -(Math.PI - A), 12);
  P(hs, 0);
  return pts;
}
// the engraving: the stem's deck (planks across the walk, as the old tile's deck had) runs from
// `inshore` mm PAST the island edge — onto the tab, or onto Tortuga's sand — to a thin bare seam
// before the head; the head's own deck has its planks turned 90°, spaced along the bar, as both the
// approved line-up and his pen drawing have them.
function tArmRaster(m, t, o, inshore) {
  const { stem, reach, headD, head } = TDOCK, hs = stem / 2, hh = head / 2, d0 = reach - headD;
  const Pt = (u, d) => [m[0] + t[0] * u + o[0] * d, m[1] + t[1] * u + o[1] * d];
  const Q = (u0, dA, u1, dB) => polyCmds([Pt(u0, dA), Pt(u1, dA), Pt(u1, dB), Pt(u0, dB)]);
  // ONE plank language on both parts of the T (his third correction: the first build reversed the
  // figure-ground between stem and head): planks 1.5, bare seams 0.4, everywhere
  const PITCH = 1.9, GAP = 0.4;
  const deck = Q(-hs, -inshore, hs, d0 - 0.3), slits = [];
  for (let d = -inshore + PITCH; d < d0 - 0.9; d += PITCH) slits.push(reverseSub(Q(-hs + 0.5, d - GAP / 2, hs - 0.5, d + GAP / 2)));
  const hd = Q(-hh + 0.6, d0 + 0.3, hh - 0.6, reach - 0.6), hSlits = [];
  const nS = Math.floor((head - 3.4) / PITCH);   // slits centred on the stem so the bar's two end boards match
  for (let i = 0; i < nS; i++) { const u = (i - (nS - 1) / 2) * PITCH; hSlits.push(reverseSub(Q(u - GAP / 2, d0 + 0.3, u + GAP / 2, reach - 0.6))); }
  return [item(RA, [deck, ...slits]), item(RA, [hd, ...hSlits])];
}
// Tortuga, remade (same rulings): a ONE-square island wearing the treatment of the nine — straight
// edges, 5 mm corners, shore AND grass lines — with the four T-docks baked into the cut, their decks
// starting at the shore line ("the dock is literally touching the sand"), a big anchor and no name,
// nothing else on the sand. The shore line PARTS under each deck so the rasters never overlap (fill
// mode cancels overlaps); the grass line ring stays whole — the decks stop short of it.
function tortugaPiece() {
  const loop = traceCells([[0, 0]])[0].map(([x, y]) => [x * CELL, y * CELL]);
  const edges = perimeterEdges([[0, 0]]).map(e => ({ ...e, m: [e.m[0] * CELL + e.inward[0] * CLR, e.m[1] * CELL + e.inward[1] * CLR] }));
  let pts = waveCoast(roundCorners(offsetPoly(loop, -CLR), ISLAND_R).cmds, [], { amp: 0, step: 0.5 });
  if (signedArea(pts) < 0) pts = pts.reverse();
  for (const e of edges) pts = notchPolyline(pts, e.m, e.along, TDOCK.stem / 2 + 0.2, tArmPts(e.m, e.along, [-e.inward[0], -e.inward[1]]));
  const it = [item(CU, [polyCmds(pts)])];
  const grass = waveCoast(roundCorners(offsetPoly(loop, -CLR - GRASS_LINE), ISLAND_R).cmds, [], { amp: 0.5, lambda: 11, quiet: 0, step: 0.6, phase: 99 * 2.71 + 1.9, ripple: 0.4 });
  it.push(item(RA, [polyCmds(offsetPoly(grass, LINE_W / 2)), reverseSub(polyCmds(offsetPoly(grass, -LINE_W / 2)))]));
  const shore = waveCoast(roundCorners(offsetPoly(loop, -CLR - SHORE_LINE), ISLAND_R).cmds, [], { amp: 0.5, lambda: 11, quiet: 0, step: 0.6, phase: 99 * 1.37, ripple: 0.4 });
  const under = p => edges.some(e => Math.abs((p[0] - e.m[0]) * e.along[0] + (p[1] - e.m[1]) * e.along[1]) < TDOCK.stem / 2 + 1.1 && Math.abs((p[0] - e.m[0]) * e.inward[0] + (p[1] - e.m[1]) * e.inward[1]) < 6);
  const s0 = shore.findIndex(under), rot = s0 < 0 ? shore : [...shore.slice(s0), ...shore.slice(0, s0)];
  const chains = []; let ch = [];
  for (const p of rot) { if (under(p)) { if (ch.length > 3) chains.push(ch); ch = []; } else ch.push(p); }
  if (ch.length > 3) chains.push(ch);
  for (const c of chains) {
    const fwd = [], back = [];
    for (let i = 0; i < c.length; i++) { const a = c[Math.max(0, i - 1)], b = c[Math.min(c.length - 1, i + 1)]; const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1, nx = -dy / L * LINE_W / 2, ny = dx / L * LINE_W / 2; fwd.push([c[i][0] + nx, c[i][1] + ny]); back.push([c[i][0] - nx, c[i][1] - ny]); }
    it.push(poly(RA, [...fwd, ...back.reverse()]));
  }
  it.push(...icon("anchor", CELL / 2, CELL / 2, CELL * .42));
  for (const e of edges) it.push(...tArmRaster(e.m, e.along, [-e.inward[0], -e.inward[1]], 3.2));
  return it;
}

function dockPiece(v, ing) {
  if (v === "v3") {
    // the cut-out T: outline is the pier itself; the 9 × 2.5 tab closes the island side, and the
    // deck's planks run onto it so the nested jetty reads as touching the sand
    const m = [TDOCK.reach, TDOCK.head / 2], t = [0, 1], o = [-1, 0];
    const pts = tArmPts(m, t, o);
    pts.push([m[0] + NOTCH.tab.depth, m[1] + TDOCK.stem / 2], [m[0] + NOTCH.tab.depth, m[1] - TDOCK.stem / 2]);
    const it = [item(CU, [polyCmds(pts)]), ...tArmRaster(m, t, o, NOTCH.tab.depth - 0.25)];
    return { dock: it, extra: [] };
  }
  const s = PIECE, pts = [[0, 0], [s, 0], [s, s], [0, s]], outline = roundCorners(pts, 2);
  const m = [s, s / 2], along = [0, 1], inward = [-1, 0];
  if (v === "v2") insertNotch(outline.cmds, m, mushroomPts(m, along, inward, JIG.nub, -1));
  const it = [item(CU, [outline])];
  if (v === "v1") it.push(...icon("anchor", s * .5, s * .42, s * .42), ...text(RA, "DOCK", s * .5, s * .85, s * .03, { align: "center", valign: "middle" }));
  else it.push(...icon("pier", s * .5, s * .5, s * .84));
  const extra = [];
  if (v === "v1") { // pier top piece: glued on, overhangs onto the island by OVER
    const w = s * .44, over = CELL * .34, L = s * .6 + over;
    const deck = roundCorners([[0, 0], [L, 0], [L, w], [0, w]], 1.5);
    extra.push(item(CU, [deck]));
    for (let x = 3; x < L - 2; x += 3.2) extra.push(rect(RA, x - .4, 1.2, .8, w - 2.4));
  }
  
  return { dock: it, extra };
}

function recipeCards(v) {
  // the game's own recipe book: 21 named recipes, one per 5-of-7 combination, in the modal's Georgia
  // 64 × 20 since 2026-08-25: the chest is half as deep, so the card is a strip — title above, the five
  // ingredients in a row below. ("Recipe No." went; there is no room and the title carries the identity.)
  const W = 64, H = 20, cards = [];
  RECIPE_BOOK.forEach((r, n) => {
    const it = [rect(CU, 0, 0, W, H, 3), ...frameBand(W / 2, H / 2, W - 2.4, H - 2.4, 0.4, 2.2)];
    let size = 3.0; while (ftextWidth(r.title, size) > W - 8 && size > 2.0) size -= 0.2;
    it.push(...ftext(RA, r.title, W / 2, 6.6, size, { font: "georgia-bold", align: "center" }));
    r.ings.forEach((ing, i) => it.push(...TOKEN[v].recipeIcon(ing, W / 2 + (i - 2) * 10.4, 13.2, 7.6)));
    void n;
    cards.push(it);
  });
  return cards;
}

function referenceCard() {
  // each line: a bold category, then plain text in which "¤" is the game's coin (Wyatt: never write "coins")
  const lines = [["Sail", "4 squares, 2 if any square is upwind"], ["Dock", "heads 3 ¤, tails 1 ¤"], ["Crate", "6 ¤ minus crates left; sold out 10 ¤"], ["Battle", "powder 2 ¤; fire again for 2 ¤"], ["Call it right", "+2 ¤"], ["Storm", "every ship 3 squares downwind"]];
  const sz = 2.6, cw = 3.2;
  const segW = txt => txt.split("¤").reduce((a, piece, i) => a + ftextWidth(piece, sz, "avenir-next") + (i ? cw + 0.6 : 0), 0);
  const lineW = ([cat, txt]) => ftextWidth(cat + "  ", sz, "avenir-next-demibold") + segW(txt);
  const W = Math.max(...lines.map(lineW)) + 10, H = lines.length * 4.8 + 13, it = [rect(CU, 0, 0, W, H, 3), ...frameBand(W / 2, H / 2, W - 2.4, H - 2.4, 0.4, 2.2)];
  it.push(...ftext(RA, "Pastry Pirates", W / 2, 6.6, 3.8, { font: "georgia-bold", align: "center" }));
  lines.forEach(([cat, txt], i) => { const y = 13.2 + i * 4.8; let x = 5;
    it.push(...ftext(RA, cat, x, y, sz, { font: "avenir-next-demibold" })); x += ftextWidth(cat + "  ", sz, "avenir-next-demibold");
    txt.split("¤").forEach((piece, j) => { if (j) { it.push(...coinGlyph(x + cw / 2, y - sz * .34, cw)); x += cw + 0.6; } it.push(...ftext(RA, piece, x, y, sz, { font: "avenir-next" })); x += ftextWidth(piece, sz, "avenir-next"); }); });
  return it;
}

/* =========================================================================================
   8. Boards
   ========================================================================================= */
function board(v) {
  const { valid, rim, DIRS } = seaCells(), it = [], C = CC * CELL + CELL / 2, RSEA = (CC + .4) * CELL;
  it.push(...tag(gridLines(valid), "grid"));
  it.push(...tag(rimMarks(rim, v === "v1" ? "arrow" : v === "v2" ? "chevron" : "curved"), "trade-winds"));
  it.push(...tag(homeMarks(DIRS), "tortuga"));
  let w, h, ox = 0, oy = 0, notes;
  if (v === "v1") {
    const M = 24; ox = M; oy = M; w = GRID * CELL + 2 * M; h = w;
    it.push(...tag([rect(CU, -M, -M, w, h, 10)], "board-edge"));
    // a wind dial engraved into the top-left corner, pivot hole cut — the arrows mount here
    const dc = -M + 38; it.push(...tag(spinnerDial("quadrants-storm", 36, dc, dc, { onBoard: true }), "corner-dial"));
    it.push(...tag(text(RA, "WIND", dc, dc + 36 + 1.5, 0.9, { align: "center" }), "corner-dial"));
    it.push(...tag(icon("rose", GRID * CELL + M - 38, -M + 38, 46), "corner-rose"));
    it.push(...tag(text(RA, "PASTRY PIRATES", C, GRID * CELL + M / 2, 1.45, { align: "center", valign: "middle" }), "title"));
    it.push(...tag(text(RA, "THE SUGAR SEAS", -M + 38, GRID * CELL + M - 38, 0.8, { align: "center", valign: "middle" }), "corner-bl"));
    it.push(...tag(icon("anchor", GRID * CELL + M - 38, GRID * CELL + M - 38, 30), "corner-br"));
    notes = `Square plank ${w}x${h} mm, corners R10. Wind dial engraved in the top-left corner with its pivot hole cut (mount the two arrows there). Compass rose top-right, title along the bottom. Rim squares carry one straight arrow each.`;
  } else if (v === "v2") {
    const M = 7, loop = traceCells([...valid].map(k => k.split(",").map(Number)))[0].map(([x, y]) => [x * CELL, y * CELL]);
    const outer = offsetPoly(loop, M); const b = bbox([poly(CU, outer)]);
    ox = -b.x0; oy = -b.y0; w = b.w; h = b.h;
    it.push(...tag([item(CU, [roundCorners(outer, 4)])], "board-edge"));
    it.push(...tag([item(RA, [roundCorners(offsetPoly(loop, M - 2), 3), reverseSub(roundCorners(offsetPoly(loop, M - 2.8), 2.5))])], "board-edge-band"));
    notes = `Cut along the pixel edge of the world: ${r3(w)}x${r3(h)} mm, stepped outline ${M} mm outside the rim squares, with an engraved border band. Rim squares carry double chevrons — the app's own wind-arrow glyph.`;
  } else {
    // the pixel world's corners reach further than the sea's radius — the circle must clear every one
    let Rmax = 0; for (const k of valid) { const [x, y] = k.split(",").map(Number); for (const [cx, cy] of [[x, y], [x + 1, y], [x, y + 1], [x + 1, y + 1]]) Rmax = Math.max(Rmax, Math.hypot(cx * CELL - C, cy * CELL - C)); }
    const M = 7, Rb = Rmax + M; w = h = 2 * Rb; ox = Rb - C; oy = Rb - C;
    it.push(...tag([circ(CU, C, C, Rb)], "board-edge"));
    it.push(...tag([ring(RA, C, C, Rmax + 3.2, Rmax + 2.5), ring(RA, C, C, Rmax + 1.9, Rmax + 1.4)], "board-edge-band"));
    notes = `A true circle, ${r3(w)} mm across, double engraved ring at the water's edge. Rim squares carry a curved current arrow that follows the ring.`;
  }
  return { id: "board", title: "The board", items: xf(it, { tx: ox, ty: oy }), w: r3(w), h: r3(h), notes, count: 1 };
}

/* =========================================================================================
   8b. THE FIVE-PIECE BOARD (Wyatt, 2026-08-22): four jigsaw quadrants that lock to each other,
       and Tortuga as a fifth piece that drops into the square hole they leave in the middle.

   One canonical quadrant (NW) is drawn and rotated four times, so all four quarters have the
   SAME cut outline — interchangeable, and they nest identically. Its two straight edges carry
   complementary knob patterns (out-in-out up the vertical seam, in-out-in along the horizontal
   one) so that after rotation every knob meets a socket. Knobs sit mid-cell, two squares apart,
   clear of the berths and the rim arrows, so the only engraving that crosses a knob is a grid
   line — and those are carried across by ownership (see gridForQuadrants) rather than clipped.
   ========================================================================================= */
const JIGB = { nub: { hw: 4, nd: 2.5, r: 5.5 }, socket: { hw: 4.05, nd: 2.5, r: 5.55 } };  // 0.1 mm total play, after kerf
const EDGE_A = [[6, "out"], [4, "in"], [2, "out"]].map(([k, s]) => [k * CELL, s]);
const EDGE_B = [[2, "in"], [4, "out"], [6, "in"]].map(([k, s]) => [k * CELL, s]);
// THE SEAMS RUN ALONG GRID LINES (Wyatt, 2026-08-22: "the jigs should be cut along or within the grid
// lines"). A pinwheel: the canonical NW quadrant is everything left of x = C+h and above y = C-h —
// the grid lines that bound Tortuga's square on its right and its top. Rotated four times that leaves
// exactly Tortuga's square as the hole, and every other square, berths and rim included, whole on one
// piece. Knobs are centred mid-square, so each one lives inside a single square of its neighbour.
function quadrantPts(Rb, withCentre = false) {
  const C = CENTER, h = CELL / 2, pts = [], sr = Math.sqrt(Rb * Rb - h * h);
  const a0 = Math.atan2(-h, -sr), a1 = Math.atan2(-sr, h); // from the left rim point (C-sr, C-h), clockwise over the top, to (C+h, C-sr)
  for (let i = 0; i <= 90; i++) { const a = a0 + (a1 - a0) * i / 90; pts.push([C + Rb * Math.cos(a), C + Rb * Math.sin(a)]); }
  for (const [d, s] of EDGE_A) pts.push(...mushroomPts([C + h, C - d], [0, 1], [-1, 0], s === "out" ? JIGB.nub : JIGB.socket, s === "out" ? -1 : 1));
  // Wyatt, 2026-08-22: Tortuga is a piece that sits ON the board; the centre square belongs to this quadrant
  if (withCentre) pts.push([C + h, C - h], [C + h, C + h], [C - h, C + h], [C - h, C - h]);
  else pts.push([C + h, C - h]);
  for (const [d, s] of EDGE_B) pts.push(...mushroomPts([C - d, C - h], [-1, 0], [0, -1], s === "out" ? JIGB.nub : JIGB.socket, s === "out" ? -1 : 1));
  return pts;
}
const rot90 = (v, k) => { let [x, y] = v; for (let i = 0; i < k; i++) [x, y] = [-y, x]; return [x, y]; };
const aboutCentre = (items, k) => xf(xf(items, { tx: -CENTER, ty: -CENTER }), { rot: 90 * k, tx: CENTER, ty: CENTER });
// every knob on the assembled board: base point m on the seam, n pointing out of its owner, t along the seam
function allKnobs() {
  const C = CENTER, out = [];
  const h = CELL / 2;
  const canon = [...EDGE_A.filter(e => e[1] === "out").map(([d]) => ({ m: [C + h, C - d], n: [1, 0], t: [0, 1] })), ...EDGE_B.filter(e => e[1] === "out").map(([d]) => ({ m: [C - d, C - h], n: [0, 1], t: [1, 0] }))];
  for (let k = 0; k < 4; k++) for (const kb of canon) { const rm = rot90([kb.m[0] - C, kb.m[1] - C], k); out.push({ m: [C + rm[0], C + rm[1]], n: rot90(kb.n, k), t: rot90(kb.t, k), owner: k }); }
  return out;
}
const QUAD = (() => { const C = CENTER, h = CELL / 2; return [
  { id: "NW", sx: -1, bx: C + h, sy: -1, by: C - h }, { id: "NE", sx: 1, bx: C + h, sy: -1, by: C + h },
  { id: "SE", sx: 1, bx: C - h, sy: 1, by: C + h }, { id: "SW", sx: -1, bx: C - h, sy: 1, by: C - h }]; })();
const inQuad = (p, q, e = 1e-6) => ((q.sx < 0 ? p[0] <= q.bx + e : p[0] >= q.bx - e) && (q.sy < 0 ? p[1] <= q.by + e : p[1] >= q.by - e))
  || (q.id === "NW" && Math.abs(p[0] - CENTER) <= CELL / 2 + e && Math.abs(p[1] - CENTER) <= CELL / 2 + e);   // NW owns Tortuga's square
function knobOwnerAt(p, knobs) {
  const { hw, nd, r } = JIGB.nub;
  for (const kb of knobs) { const dx = p[0] - kb.m[0], dy = p[1] - kb.m[1], u = dx * kb.n[0] + dy * kb.n[1], s = dx * kb.t[0] + dy * kb.t[1];
    if (u >= -0.01 && u <= nd + 0.01 && Math.abs(s) <= hw) return kb.owner;
    if ((u - nd - r) ** 2 + s * s <= r * r) return kb.owner; }
  return -1;
}
// -2 = on a seam (both pieces claim it — the cut itself draws that line) or in Tortuga's hole
function quadrantOf(p, knobs) { const o = knobOwnerAt(p, knobs); if (o >= 0) return o; const hits = QUAD.map((q, k) => inQuad(p, q) ? k : -1).filter(k => k >= 0); return hits.length === 1 ? hits[0] : -2; }
// Sutherland–Hodgman against one half-plane: keep nx*x+ny*y <= d
function clipPolyHalf(pts, nx, ny, d) {
  const out = [], n = pts.length, f = p => nx * p[0] + ny * p[1] - d;
  for (let i = 0; i < n; i++) { const a = pts[i], b = pts[(i + 1) % n], fa = f(a), fb = f(b);
    if (fa <= 0) out.push(a);
    if ((fa < 0 && fb > 0) || (fa > 0 && fb < 0)) { const t = fa / (fa - fb); out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]); } }
  return out;
}
// an engraved shape, cut to one quadrant's quarter of the board (knobs carry only grid lines, handled separately)
function clipItemQuadrant(it, { sx, bx, sy, by }) {
  const b = bbox([it]);
  const outX = sx < 0 ? b.x0 >= bx : b.x1 <= bx, outY = sy < 0 ? b.y0 >= by : b.y1 <= by;
  if (outX || outY) return null;
  const inX = sx < 0 ? b.x1 <= bx : b.x0 >= bx, inY = sy < 0 ? b.y1 <= by : b.y0 >= by;
  if (inX && inY) return it;
  const sub = [];
  for (const sp of it.sub) { let pts = flatten(sp, 10).pts; pts = clipPolyHalf(pts, -sx, 0, -sx * bx); pts = clipPolyHalf(pts, 0, -sy, -sy * by); if (pts.length >= 3) sub.push(polyCmds(pts)); }
  return sub.length ? { ...it, sub } : null;
}
// grid lines by OWNERSHIP, sampled every half millimetre: a line runs onto a knob with the knob's owner and
// stops at a socket, so across a locked seam every grid line reads continuous
function gridForQuadrants(valid, knobs) {
  const per = [[], [], [], []];
  for (const rc of gridLines(valid)) {
    const p = rc.sub[0].cmds, x0 = p[0][1], y0 = p[0][2], x1 = p[2][1], y1 = p[2][2], horiz = (x1 - x0) > (y1 - y0);
    const L = horiz ? x1 - x0 : y1 - y0, step = 0.5, n = Math.ceil(L / step); let run = null;
    const flush = () => { if (run && run.o >= 0 && run.b - run.a > 0.3) per[run.o].push(horiz ? rect(RA, run.a, y0, run.b - run.a, y1 - y0) : rect(RA, x0, run.a, x1 - x0, run.b - run.a)); run = null; };
    for (let i = 0; i <= n; i++) { const pos = (horiz ? x0 : y0) + Math.min(L, i * step), mid = horiz ? [pos, (y0 + y1) / 2] : [(x0 + x1) / 2, pos], o = quadrantOf(mid, knobs);
      if (run && run.o === o) run.b = pos; else { flush(); run = { o, a: pos, b: pos }; } }
    flush();
  }
  return per;
}
function boardFivePiece() {
  const { valid, rim, DIRS } = seaCells(), C = CENTER;
  let Rmax = 0; for (const k of valid) { const [x, y] = k.split(",").map(Number); for (const [cx, cy] of [[x, y], [x + 1, y], [x, y + 1], [x + 1, y + 1]]) Rmax = Math.max(Rmax, Math.hypot(cx * CELL - C, cy * CELL - C)); }
  const Rb = Rmax + 7;
  // where Tortuga sits: a dotted outline of the new one-square-plus-docks silhouette, under the piece
  // (lugs left off the ghost — dots that small read as noise). Wyatt, 2026-08-25: outline updated.
  const dotted = [];
  { const loop = traceCells([[0, 0]])[0].map(([x, y]) => [(x + CC) * CELL, (y + CC) * CELL]);
    const edgesT = perimeterEdges([[0, 0]]).map(e => ({ ...e, m: [(e.m[0] + CC) * CELL + e.inward[0] * CLR, (e.m[1] + CC) * CELL + e.inward[1] * CLR] }));
    let gp = waveCoast(roundCorners(offsetPoly(loop, -CLR), ISLAND_R).cmds, [], { amp: 0, step: 0.5 });
    if (signedArea(gp) < 0) gp = gp.reverse();
    for (const e of edgesT) gp = notchPolyline(gp, e.m, e.along, TDOCK.stem / 2 + 0.2, tArmPts(e.m, e.along, [-e.inward[0], -e.inward[1]], { lugs: false }));
    const flat = gp, step = 0.4; let acc = 0, run = null;
    const flush = () => { if (run) { const [a, b] = [run.a, run.b], ux = (b[0] - a[0]), uy = (b[1] - a[1]), L = Math.hypot(ux, uy) || 1, nx = -uy / L * .2, ny = ux / L * .2; if (L > 0.5) dotted.push(poly(RA, [[a[0] + nx, a[1] + ny], [b[0] + nx, b[1] + ny], [b[0] - nx, b[1] - ny], [a[0] - nx, a[1] - ny]])); run = null; } };
    for (let i = 0; i < flat.length; i++) { const a = flat[i], b = flat[(i + 1) % flat.length], L = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(1, Math.ceil(L / step));
      for (let k = 0; k < n; k++) { const p = [a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n], on = (acc % 3.6) < 2.0; acc += L / n;
        if (on) { if (run) run.b = p; else run = { a: p, b: p }; } else flush(); } }
    flush(); }
  const raster = [...tag(rimMarks(rim, "game"), "trade-winds"), ...tag(dotted, "tortuga-outline"), ...tag(rippleRings(), "ripples"), ...tag([ring(RA, C, C, Rmax + 3.2, Rmax + 2.5), ring(RA, C, C, Rmax + 1.9, Rmax + 1.4)], "edge-band")];
  const knobs = allKnobs(), grid = gridForQuadrants(valid, knobs), canon = poly(CU, quadrantPts(Rb)), canonNW = poly(CU, quadrantPts(Rb, true));
  // small engraved marks go to the quadrant that owns their centre; only the rim bands need clipping
  const assign = (it, q, k) => { const b = bbox([it]); if (b.w < 14 && b.h < 14) { const o = quadrantOf([(b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2], knobs); return o === k ? it : (o === -2 ? clipItemQuadrant(it, q) : null); } return clipItemQuadrant(it, q); };
  const quadrants = QUAD.map((q, k) => ({ name: `quadrant-${q.id}`, mat: MAT, items: tag([...aboutCentre([k === 0 ? canonNW : canon], k), ...raster.map(it => assign(it, q, k)).filter(Boolean), ...grid[k]], `quadrant-${q.id}`) }));
  // Tortuga: ONE square with its four T-docks baked into the cut (Wyatt's remake, 2026-08-25 —
  // the + of five squares is retired). The island treatment of the nine, a big anchor, no name.
  const plug = { name: "tortuga", mat: MAT, items: tag(xf(tortugaPiece(), { tx: -0.5 * CELL, ty: -0.5 * CELL }), "tortuga") };
  const assembledItems = [...QUAD.flatMap((q, k) => tag(aboutCentre([k === 0 ? canonNW : canon], k), `seam-${q.id}`)), ...raster, ...tag(gridLines(valid), "grid"), ...tag(xf(plug.items, { tx: C, ty: C }), "tortuga")];
  const assembled = { id: "board-assembled", title: "The board, assembled", kind: "design", items: xf(assembledItems, { tx: Rb - C, ty: Rb - C }), w: r3(2 * Rb), h: r3(2 * Rb), count: 5,
    notes: `Design view, no kerf. ${r3(2 * Rb)} mm across. Four quadrants lock with three puzzle knobs per seam; the north-west one carries the centre square. Tortuga is a ONE-square 6 mm island with its four T-docks baked into the cut — a big anchor in the middle, no name — sitting on the board over a dotted outline of its silhouette; ships berth broadside against the dock heads in the four squares around it, where the water now runs. Seams run along the grid lines, so every square is whole on one piece. Rim marks are the app's own wind chevron; the water is the art's brush strokes.` };
  return { assembled, quadrants, plug, Rb };
}
// ---- kerf: push every cut line half a beam away from the wood that stays ----
function pointInPoly(p, pts) { let c = false; for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) { const [xi, yi] = pts[i], [xj, yj] = pts[j]; if ((yi > p[1]) !== (yj > p[1]) && p[0] < (xj - xi) * (p[1] - yi) / (yj - yi) + xi) c = !c; } return c; }
function kerfCompensate(items, k) {
  const kf = typeof k === "function" ? k : () => k;
  const out = [...items], byPiece = new Map();
  items.forEach((it, i) => { if (it.layer !== CU) return; const key = it.piece || ("_" + i); if (!byPiece.has(key)) byPiece.set(key, []); byPiece.get(key).push({ it, i }); });
  for (const [, group] of byPiece) {
    const polys = group.flatMap(g => g.it.sub.map(sp => ({ sp, pts: flatten(sp, 12).pts })));
    for (const g of group) out[g.i] = { ...g.it, sub: g.it.sub.map(sp => {
      const pts = flatten(sp, 12).pts, kp = kf(g.it.piece), isHole = polys.some(q => q.sp !== sp && pointInPoly(pts[0], q.pts)), d = isHole ? -kp / 2 : kp / 2;
      return sp.circle ? { circle: { ...sp.circle, r: sp.circle.r + d } } : polyCmds(offsetPoly(pts, d));
    }) };
  }
  return out;
}
// ---- shelf-pack named parts onto bed-sized sheets, tallest first ----
function packSheets(parts) {
  const W = BED_W, H = BED_H, m = BED_MARGIN, g = GAP, sorted = parts.map(p => ({ ...p, b: bbox(p.items) })).sort((a, b) => b.b.h - a.b.h);
  const sheets = []; // each: {items, parts, shelves:[{y, h, x}]}
  const place = (sh, shelf, p) => { sh.items.push(...tag(xf(p.items, { tx: shelf.x - p.b.x0, ty: shelf.y - p.b.y0 }), p.name)); sh.parts++; shelf.x += p.b.w + g; };
  for (const p of sorted) {
    let done = false;
    for (const sh of sheets) { const shelf = sh.shelves.find(f => p.b.h <= f.h && shelf_fits(f, p)); if (shelf) { place(sh, shelf, p); done = true; break; } }
    if (done) continue;
    for (const sh of sheets) { const last = sh.shelves[sh.shelves.length - 1], y = last.y + last.h + g; if (y + p.b.h <= H - m) { const f = { y, h: p.b.h, x: m }; sh.shelves.push(f); place(sh, f, p); done = true; break; } }
    if (done) continue;
    const sh = { items: [], parts: 0, shelves: [{ y: m, h: p.b.h, x: m }] }; sheets.push(sh); place(sh, sh.shelves[0], p);
  }
  return sheets;
  function shelf_fits(f, p) { return f.x + p.b.w <= W - m; }
}

/* =========================================================================================
   8c. THE THIN PARTS, 3 mm (Wyatt, 2026-08-22): cargo crates, treasure chests, the nested spinner
   ========================================================================================= */
// a box-joint edge from p0 to p1: fingers alternate; "out" protrudes by t on tabs, "in" recedes by t.
// `outward` is the unit normal away from the panel. Returns the points after p0 up to and including p1.
function fingerEdge(p0, p1, outward, t, spec, fingerW = 6) {
  const L = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]), ux = (p1[0] - p0[0]) / L, uy = (p1[1] - p0[1]) / L;
  let n = Math.round(L / fingerW); if (n % 2 === 0) n += 1; if (n < 3) n = 3; const seg = L / n, pts = [];
  const P = (sv, d) => [p0[0] + ux * sv + outward[0] * d, p0[1] + uy * sv + outward[1] * d];
  for (let i = 0; i < n; i++) { const tab = (i % 2 === 0) === !!spec.start, d = spec.kind === "out" ? (tab ? t : 0) : (tab ? -t : 0); pts.push(P(i * seg, d), P((i + 1) * seg, d)); }
  pts.push(p1);
  return pts;
}
// hinge knuckles along an edge: every other segment is a tongue of height K with a dowel hole, rounded so it can swing
// side = lateral play per side of every tongue, so neighbouring tongues of the two parts can turn past each other
// Wyatt, 2026-08-25, from the built chest: NO dowel holes — a laser cuts through the sheet's face, so a hole for an
// axle along the edge is impossible to cut in place (he had to discard them). The hinge is a FRICTION fit instead:
// side play per tongue down from 0.15 to 0.03, so the interleaved tongues wedge and the lid stays where you put it.
function knuckleEdge(p0, p1, outward, spec, { K = 6.4, hole = 3.3, r = 3.1, n = 5, side = 0.03 } = {}) {
  const L = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]), ux = (p1[0] - p0[0]) / L, uy = (p1[1] - p0[1]) / L, seg = L / n, pts = [], holes = [];
  const P = (sv, d) => [p0[0] + ux * sv + outward[0] * d, p0[1] + uy * sv + outward[1] * d];
  for (let i = 0; i < n; i++) {
    const tab = (i % 2 === 0) === !!spec.start, s0 = i * seg + side, s1 = (i + 1) * seg - side;
    if (!tab) { pts.push(P(i * seg, 0), P((i + 1) * seg, 0)); continue; }
    pts.push(P(i * seg, 0));
    pts.push(P(s0, 0), P(s0, hole));
    for (let k = 0; k <= 6; k++) { const a = Math.PI + k / 6 * Math.PI / 2; pts.push(P(s0 + r + r * Math.cos(a), hole + r * Math.sin(a) * -1)); }
    for (let k = 0; k <= 6; k++) { const a = -Math.PI / 2 + k / 6 * Math.PI / 2; pts.push(P(s1 - r + r * Math.cos(a), hole + r * Math.sin(a) * -1)); }
    pts.push(P(s1, hole), P(s1, 0), P((i + 1) * seg, 0));
    holes.push(P((s0 + s1) / 2, hole));
  }
  pts.push(p1);
  return { pts, holes };
}
const HINGE_BODY = 2.4;   // Wyatt: the strip was under a millimetre between cuts; 2.4 mm of body now, and the lid walls take it into account
function hingeStrip(w, t) {
  // the strip runs t FURTHER at each end (Wyatt, 2026-08-25: "it should extend a little further on each side"),
  // filling the corner voids his photos show and slotting against the side walls' back-edge teeth
  const k = knuckleEdge([0, 0], [w, 0], [0, -1], { start: false }), pts = [[-t, 0], ...k.pts, [w + t, 0], [w + t, HINGE_BODY], ...fingerEdge([w, HINGE_BODY], [0, HINGE_BODY], [0, 1], t, { kind: "out", start: false }), [-t, HINGE_BODY]];
  return [item(CU, [polyCmds(pts)])];
}
// a wall panel w×h (nominal) with fingers on the bottom (down into the base) and both vertical edges (into the neighbours)
function wallPanel(w, h, t, { start, top = null }) {
  const pts = [[0, 0]], holes = [];
  if (top && top.kind === "knuckle") { const k = knuckleEdge([0, 0], [w, 0], [0, -1], top); pts.push(...k.pts); holes.push(...k.holes); }
  else pts.push([w, 0]);
  pts.push(...fingerEdge([w, 0], [w, h], [1, 0], t, { kind: "out", start }));
  pts.push(...fingerEdge([w, h], [0, h], [0, 1], t, { kind: "out", start: false }));   // bottom fingers start one segment in, so the plate keeps its corners
  pts.push(...fingerEdge([0, h], [0, 0], [-1, 0], t, { kind: "out", start }));
  void holes;   // no dowel holes — the hinge is a friction fit (2026-08-25)
  return [item(CU, [polyCmds(pts)])];
}
// the plate a box stands on (or a lid's top): full footprint, slots around the rim where the walls' fingers land
function platePanel(L, W, t) {
  const pts = [];
  const edge = (a, b, outward) => { const ux = Math.sign(b[0] - a[0]), uy = Math.sign(b[1] - a[1]); const i0 = [a[0] + ux * t, a[1] + uy * t], i1 = [b[0] - ux * t, b[1] - uy * t]; pts.push(a, i0, ...fingerEdge(i0, i1, outward, t, { kind: "in", start: false }), i1); };
  edge([0, 0], [L, 0], [0, -1]); edge([L, 0], [L, W], [1, 0]); edge([L, W], [0, W], [0, 1]); edge([0, W], [0, 0], [-1, 0]);
  return [item(CU, [polyCmds(pts)])];
}
const planks = (x, y, w, h, pitch, vertical = false) => { const out = []; if (vertical) for (let px = x + pitch; px < x + w - 1; px += pitch) out.push(rect(RA, px - .3, y + 1, .6, h - 2)); else for (let py = y + pitch; py < y + h - 1; py += pitch) out.push(rect(RA, x + 1, py - .3, w - 2, .6)); return out; };
// an open cargo crate for a captain's hold: tokens stand on edge in it, icons showing (cargo is public in the game)
// a slatted crate, like the classic wooden one (Wyatt's reference photo): three slats a side with real gaps cut
// between them, solid corner posts engraved, a nail at each slat end
function cargoCrate(captain) {
  const t = MAT3, Lo = 44, Wo = 30, H = 18, hw = H - t, parts = [], post = 4;
  const slatted = (w, first) => { const it = wallPanel(w, hw, t, { start: first }); const g = 1.4, sh = (hw - 2 * g - 1) / 3;
    for (const k of [1, 2]) it.push(rect(CU, post, 0.5 + k * sh + (k - 1) * g, w - 2 * post, g));   // the gaps between slats, cut through
    it.push(rect(RA, 0.6, 0.4, post - 1.2, hw - 0.8), rect(RA, w - post + 0.6, 0.4, post - 1.2, hw - 0.8));   // corner posts
    for (const k of [0, 1, 2]) { const yc = 0.5 + k * sh + k * g + sh / 2; it.push(circ(RA, post + 1.6, yc, .5), circ(RA, w - post - 1.6, yc, .5)); }
    return it; };
  const wF = Lo - 2 * t, wS = Wo - 2 * t;
  parts.push(part(`crate-${captain}-front`, slatted(wF, true)));   // no captain mark — Wyatt paints that
  parts.push(part(`crate-${captain}-back`, slatted(wF, true)));
  parts.push(part(`crate-${captain}-side-1`, slatted(wS, false)), part(`crate-${captain}-side-2`, slatted(wS, false)));
  parts.push(part(`crate-${captain}-base`, platePanel(Lo, Wo, t)));
  return parts.map(p => ({ ...p, mat: MAT3 }));
}
// a treasure chest: coins inside, the captain's recipe card held in the lid where only they can read it
function treasureChest(captain) {
  // Wyatt, 2026-08-25, from the built chest: "the entire chest should be 50% less deep" — players hold under 10
  // coins. Depth (away from you, facing the lock) 54 → 27; the recipe cards shrink with it.
  const t = MAT3, Lo = 80, Wo = 27, Hb = 20, Hl = 12, hb = Hb - t, hl = Hl - t, parts = [], ci = CAPTAINS.indexOf(captain);
  const SX = [Lo * .25, Lo * .75], SXW = SX.map(x => x - t);   // strap positions in ASSEMBLED x, so the "iron bars"
  // line up from the top plate down the front and back (2026-08-25: "they are misaligned" — walls sit t inboard)
  const strap = (w, h, xs = [w * .25, w * .75]) => xs.flatMap(sx => [rect(RA, sx - 2, 0, 4, h), ...[.2, .5, .8].map(f => circ(RA, sx, h * f, .55))]);
  const lock = (cx, cy) => [item(RA, [roundCorners([[cx - 4, cy - 4], [cx + 4, cy - 4], [cx + 4, cy + 4], [cx - 4, cy + 4]], 1.2), { circle: { cx, cy: cy - 1, r: 1.1, ccw: true } }, reverseSub(polyCmds([[cx - .7, cy - .4], [cx + .7, cy - .4], [cx + 1, cy + 2.6], [cx - 1, cy + 2.6]]))])];
  // assembly labels (Wyatt: "add rastered labels ... so I can understand how they fit together"): the four vertical
  // corners are 1–4 clockwise from the front-left; a wall's bottom edge says which plate edge it lands on; H = hinge
  const lab = (txt, x, y, rot = 0) => xf(ftext(GU, txt, 0, 0, 2.6, { font: "avenir-next-demibold", align: "center", valign: "middle" }), { rot, tx: x, ty: y });   // page only, never engraved
  const wallLabels = (w, h, left, right, bottom, top) => [...(left ? lab(left, 3.2, h / 2, 90) : []), ...(right ? lab(right, w - 3.2, h / 2, -90) : []), ...lab(bottom, w / 2, h - 2.6), ...(top ? lab(top, w / 2, 2.6) : [])];
  const plateLabels = (L, W, pre) => [...lab(pre + "F", L / 2, W - 3.4), ...lab(pre + "K", L / 2, 3.4), ...lab(pre + "S2", 3.6, W / 2, 90), ...lab(pre + "S1", L - 3.6, W / 2, -90)];
  // body
  const wFront = Lo - 2 * t, wSide = Wo - 2 * t;
  parts.push(part(`chest-${captain}-front`, [...wallPanel(wFront, hb, t, { start: true }), ...planks(0, 0, wFront, hb, 4.2), ...strap(wFront, hb, SXW), ...lock(wFront / 2, hb / 2), ...wallLabels(wFront, hb, "1", "2", "B·F")]));
  parts.push(part(`chest-${captain}-back`, [...wallPanel(wFront, hb, t, { start: true, top: { kind: "knuckle", start: true } }), ...planks(0, 0, wFront, hb, 4.2), ...strap(wFront, hb, SXW), ...wallLabels(wFront, hb, "3", "4", "B·K", "H")]));
  parts.push(part(`chest-${captain}-side-1`, [...wallPanel(wSide, hb, t, { start: false }), ...planks(0, 0, wSide, hb, 4.2), ...wallLabels(wSide, hb, "2", "3", "B·S1")]));
  parts.push(part(`chest-${captain}-side-2`, [...wallPanel(wSide, hb, t, { start: false }), ...planks(0, 0, wSide, hb, 4.2), ...wallLabels(wSide, hb, "4", "1", "B·S2")]));
  parts.push(part(`chest-${captain}-base`, [...platePanel(Lo, Wo, t), ...planks(t, t, Lo - 2 * t, Wo - 2 * t, 5), ...strap(Lo, Wo), ...plateLabels(Lo, Wo, "B·"), ...lab("BASE", Lo / 2, Wo / 2)]));
  // lid: a shallow box; its back wall carries the other half of the hinge on its free edge
  parts.push(part(`chest-${captain}-lid-front`, [...wallPanel(wFront, hl, t, { start: true }), ...planks(0, 0, wFront, hl, 3.5), ...strap(wFront, hl, SXW), ...wallLabels(wFront, hl, "L1", "L2", "T·F")]));
  // the lid's hinge strip: fingers up into the top plate, knuckle tongues hanging down between the chest's; its
  // axis sits 3.3 mm below the plate, exactly where the chest wall's tongues put theirs
  parts.push(part(`chest-${captain}-lid-hinge`, [...hingeStrip(wFront, t), ...lab("H", wFront / 2, 9), ...lab("T·K", wFront * .5, HINGE_BODY + 1.6)]));
  parts.push(part(`chest-${captain}-lid-side-1`, [...wallPanel(wSide, hl, t, { start: false }), rect(RA, 1, 5.6, wSide - 2, .4), ...wallLabels(wSide, hl, "L2", "", "T·S1")]));
  parts.push(part(`chest-${captain}-lid-side-2`, [...wallPanel(wSide, hl, t, { start: false }), rect(RA, 1, 5.6, wSide - 2, .4), ...wallLabels(wSide, hl, "", "L1", "T·S2")]));
  parts.push(part(`chest-${captain}-lid-top`, [...platePanel(Lo, Wo, t), ...planks(t, t, Lo - 2 * t, Wo - 2 * t, 5), ...strap(Lo, Wo), ...plateLabels(Lo, Wo, "T·")]));   // no captain's mark — paint it, like the crates (Wyatt, 2026-08-25: the marks read as drilled holes)
  // the card channel sits UNDER the hinge strip (rail line at 5.6): the card slides in and out through the lid's open
  // back — Wyatt, 2026-08-25: it must "fall out with gravity", never stick inside the lid. Rails cover only the front
  // 60 % of each end wall, so the back half is a clear exit ramp.
  for (const n of [1, 2]) parts.push(part(`chest-${captain}-card-rail-${n}`, [rect(CU, 0, 0, r3(wSide * .6), 3, .4), ...lab(`RAIL ${n}`, wSide * .3, 1.5)]));
  return parts.map(p => ({ ...p, mat: MAT3 }));
}
// the nested spinner: a backing disc; a fixed dial glued on it (the game's compass); a ring that turns around the dial
// with one pointer = this round's wind; a fleur-de-lis needle on the centre pivot = the forecast. All 3 mm, one M3 bolt.
function nestedSpinner() {
  const RB = 48, RD = 35, RI = RD + 0.4, parts = [];
  parts.push(part("spinner-backing", [circ(CU, 0, 0, RB), circ(CU, 0, 0, 1.65), ring(RA, 0, 0, RD + .2, RD - .3)]));
  const dial = [circ(CU, 0, 0, RD), circ(CU, 0, 0, 1.65), ring(RA, 0, 0, 4.2, 3.4)];
  // the two scroll bands, broken where the medallions sit so no line ever crosses a letter
  const arcBand = (r0, r1, a0, a1) => { const pts = [], n = 24; for (let i = 0; i <= n; i++) { const a = rad(a0 + (a1 - a0) * i / n); pts.push([r1 * Math.cos(a), r1 * Math.sin(a)]); } for (let i = n; i >= 0; i--) { const a = rad(a0 + (a1 - a0) * i / n); pts.push([r0 * Math.cos(a), r0 * Math.sin(a)]); } return poly(RA, pts); };
  const medR = RD - 3.6, medRad = 5.4;
  for (let q = 0; q < 4; q++) { const c0 = -90 + q * 90, c1 = c0 + 90; for (const [r0, r1] of [[RD - 1.7, RD - 1], [RD - 6.2, RD - 5.6]]) { const g = Math.asin((medRad + 0.8) / ((r0 + r1) / 2)) * 180 / Math.PI; dial.push(arcBand(r0, r1, c0 + g, c1 - g)); } }
  for (let i = 0; i < 36; i++) { const ang = i * 10 + 5, near = [0, 90, 180, 270].some(m => Math.abs(((ang - m + 540) % 360) - 180) < 14), inWedge = [45, 135, 225, 315].some(m => Math.abs(((ang - m + 540) % 360) - 180) < 10); if (near || inWedge) continue; const a = rad(ang), rr = RD - 3.7; dial.push(circ(RA, rr * Math.cos(a), rr * Math.sin(a), .5)); }
  // the medallions: a filled disc with the letter knocked out — the art's N/E/S/W coins
  for (const [L, a] of [["N", -90], ["E", 0], ["S", 90], ["W", 180]]) { const cx = medR * Math.cos(rad(a)), cy = medR * Math.sin(rad(a)); const disc = circ(RA, cx, cy, medRad); const letter = ftext(RA, L, cx, cy, 6.2, { font: "avenir-next-demibold", align: "center", valign: "middle" }).map(reverseItem); dial.push({ ...disc, sub: [...disc.sub, ...letter.flatMap(i => i.sub)] }); }
  // storm wedges: a fifth of each quadrant, centred on NE/SE/SW/NW, from the centre ring to the dial's edge, the
  // game's storm cloud knocked out of each (Wyatt: "bring them all the way from the center to the rim ... bisect the
  // orientation lines ... a lightning-bolt cloud, like in the game")
  // Wyatt: the storm icon like the 🌩️ emoji — a cloud with a bolt under it, drawn to fit the wedge — and the word STORM
  // Wyatt: "Can you simply rasterise in the storm emoji?" — yes: art/storm-emoji.png is the 🌩️ emoji rendered by Chrome,
  // traced like the ingredients; its silhouette is knocked out of each wedge, with the word STORM below it
  for (const mid of [45, 135, 225, 315]) { const w = arcBand(5.2, RD - 2.2, mid - 9, mid + 9);
    // Wyatt, 2026-08-25: cloud clear of the wedge edges (~0.9 mm each side), STORM written ACROSS the wedge's wide
    // end with the letters' tops toward the hub — outside the needle's 26.5 mm reach, so it stays readable with the
    // needle lying on top of the wedge
    const local = [...artToken("stormemoji", 23.5, 0, 5.8, { cut: false, solid: true, rot: 90 }), ...xf(ftext(RA, "STORM", 0, 0, 2.0, { font: "avenir-next-demibold", align: "center", valign: "middle" }), { rot: -90, tx: 29.5, ty: 0 })];
    const holes = xf(local, { rot: mid }).map(reverseItem); dial.push({ ...w, sub: [...w.sub, ...holes.flatMap(i => i.sub)] }); }
  parts.push(part("spinner-dial", dial));
  // Wyatt, 2026-08-22: "a 3D wind-now flag/vane that slots in to show the current wind direction visibly, and
  // differentiates it from the flat spun forecast". The ring carries a radial slot at its pointer; the vane's
  // tab drops through it and stands on the backing disc. Its pennant streams inward, toward the letter the
  // ring is set to — the way the wind blows — 25 mm above the flat needle, so the two can never be confused.
  const VS = MAT3 + .05, VL = 7, vr = RB - 5;   // slot: material + 0.05 so the vane stands snug (same ruling as the sails), 7 long, centred at r = 43
  const ringPart = [circ(CU, 0, 0, RB), circ(CU, 0, 0, RI), rect(CU, -VS / 2, -(vr + VL / 2), VS, VL), ring(RA, 0, 0, RB - 1, RB - 1.6), ...icon("fleur", 0, -(RI + 2.6), 5, 180), ...ftext(RA, "WIND NOW", 0, RB - 5, 3, { font: "avenir-next-demibold", align: "center" })];
  for (let i = 0; i < 24; i++) { if (i >= 4 && i <= 8) continue; const rr = RB - 4; ringPart.push(xf([rect(RA, rr - 1.2, -.25, 2.4, .5)], { rot: i * 15 })[0]); }  // no ticks under the WIND NOW label
  parts.push(part("spinner-ring", ringPart));
  // the needle: a classic compass needle (Wyatt, 2026-08-25: the balanced double-fleur was symmetric — "it is not
  // clear which direction it is facing. change the shape to match a compass needle and raster one half of it").
  // A long rhombus, outline still symmetric about the axle so it balances; the POINTING half is engraved dark,
  // stopping at a half-round clear of the pivot hole so no cut meets ink.
  const NL = 26.5, NW = 4.5, NR = 2.3;
  const needleOutline = [[NL, 0], [0, NW], [-NL, 0], [0, -NW]];
  const darkHalf = [[NL, 0], [0, NW], [0, NR]];
  for (let i = 0; i <= 8; i++) { const a = rad(90 - i * 22.5); darkHalf.push([NR * Math.cos(a), NR * Math.sin(a)]); }
  darkHalf.push([0, -NR], [0, -NW]);
  const needle = [item(CU, [polyCmds(needleOutline)]), circ(CU, 0, 0, 1.65), poly(RA, darkHalf)];
  parts.push(part("spinner-needle", needle), part("spinner-washer", [circ(CU, 0, 0, 4), circ(CU, 0, 0, 1.65)]));
  // the vane: a pennant on a mast, the tab below the mast (through the ring, onto the backing). Drawn as it
  // stands — pennant at the top, tab at the bottom — so WIND NOW reads upright once it is in the slot.
  const mh = 30, pw = 30, ph = 10, tab = VL - .4;
  const pts = [[0, 0.6], [2.6, 0.6], [2.6, mh], [tab / 2 + 1.3, mh], [tab / 2 + 1.3, mh + MAT3], [-tab / 2 + 1.3, mh + MAT3], [-tab / 2 + 1.3, mh], [0, mh],
    [0, ph + 0.6], [-pw, ph + 0.6], [-pw + 5, ph / 2 + 0.6], [-pw, 0.6]];
  const vane = [item(CU, [polyCmds(pts)]), rect(RA, 0.9, ph + 2.4, 0.8, mh - ph - 3.6), ...ftext(RA, "WIND NOW", -(pw - 5) / 2 - 1, ph / 2 + 0.6 + 1.7, 4.2, { font: "avenir-next-demibold", align: "center" })];   // 4.2 (Wyatt, 2026-08-25: bigger)
  parts.push(part("spinner-vane", vane));
  return parts.map(p => ({ ...p, mat: MAT3 }));
}

/* =========================================================================================
   8d. MOCKUPS — an isometric picture of the assembled thing, for the page only (never a laser file)
   ========================================================================================= */
const V3 = { add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]], sc: (a, k) => [a[0] * k, a[1] * k, a[2] * k], cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]], dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2], norm: a => { const l = Math.hypot(...a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; } };
// a placed slab: its 2D items drawn on the plane origin + u·U + v·V, thickness T behind that plane (along -N)
function slab(items, { origin, U = [1, 0, 0], V = [0, 1, 0], T = MAT, xform = null, tint = 0, bias = 0 }) { return { items, origin, U: V3.norm(U), V: V3.norm(V), T, xform, tint, bias }; }
function isoScene(slabs, { scale = 3.2, pad = 20 } = {}) {
  // Rewritten 2026-08-25 after Wyatt's adversarial-review gate: the old painter gave every slab ONE depth and ALWAYS
  // drew its art face, whichever way it pointed — an open lid past 90° showed its outside where its inside is, and
  // rotated parts sorted wrong ("captured from the wrong face"). Now: each face carries its own view depth; the two
  // big faces are orientation-culled; the engraving is drawn only when the art face genuinely looks at the camera;
  // a visible back face renders as bare wood — which is what the back of a ply part is.
  const C30 = Math.cos(Math.PI / 6), S30 = 0.5, cam = V3.norm([1, 1, 1.2]);
  const proj = p => [(p[0] - p[1]) * C30, (p[0] + p[1]) * S30 - p[2]];
  const faces = [];
  for (const sb of slabs) {
    const N = V3.cross(sb.U, sb.V), to3 = ([u, v], back = false) => { let p = V3.add(sb.origin, V3.add(V3.sc(sb.U, u), V3.sc(sb.V, v))); if (back) p = V3.add(p, V3.sc(N, -sb.T)); return sb.xform ? sb.xform(p) : p; };
    const base = 0.86 - sb.tint, wood = `hsl(36,52%,${Math.round(base * 78)}%)`, side = `hsl(32,48%,${Math.round(base * 58)}%)`, rear = `hsl(34,50%,${Math.round(base * 70)}%)`, ink = "#2a1d12";
    let cutLoops = sb.items.filter(i => i.layer === CU).flatMap(i => i.sub.map(sp => flatten(sp, 8).pts));
    if (!cutLoops.length) continue;
    // normalize winding: outer loops positive area, holes negative — the side-quad culling below reads orientation
    // from the winding, and mixed-winding sources shed "debris" quads from the far silhouette
    cutLoops = cutLoops.map(l => { const hole = cutLoops.some(o => o !== l && pointInPoly(l[0], o)); return ((signedArea(l) < 0) === hole) ? [...l].reverse() : l; });   // outers negative, holes positive: the camera-side quads survive the cull
    // depth: pure view depth for rotated slabs; unrotated slabs add a strong stack term (a flat scene's true painter
    // order IS bottom-up) and the scene may bias a slab whose containment the mean cannot see (tokens inside a crate)
    const zBoost = sb.xform ? 0 : 50 * Math.min(...sb.items.filter(i => i.layer === CU).flatMap(i => i.sub.map(sp => flatten(sp, 8).pts)).flat().map(pt => { const q = V3.add(sb.origin, V3.add(V3.sc(sb.U, pt[0]), V3.sc(sb.V, pt[1]))); return Math.min(q[2], q[2] - sb.T * N[2]); })) + (sb.bias || 0);
    const depth = p3s => p3s.reduce((a2, p) => a2 + V3.dot(p, cam), 0) / p3s.length + zBoost;
    const f0 = to3(cutLoops[0][0]), b0 = to3(cutLoops[0][0], true), facing = V3.dot(V3.add(f0, V3.sc(b0, -1)), cam) > 0;
    const bigPts = cutLoops.map(l => l.map(p => to3(p, !facing)));
    const faceDepth = depth(bigPts.flat());
    faces.push({ pts: bigPts.map(l => l.map(proj)), depth: faceDepth, fill: facing ? wood : rear, rule: "evenodd", stroke: "#6b4a2a", sw: 1 });
    // the engraving lives ON its face: it sorts WITH the face (+epsilon), never by its own position — otherwise art on
    // the far half of a large face sorts behind the face itself and is painted over (the "bald half" bug)
    if (facing) for (const it of sb.items) { if (it.layer !== RA) continue; const p3 = it.sub.map(sp => flatten(sp, 6).pts.map(p => to3(p))); faces.push({ pts: p3.map(l => l.map(proj)), depth: faceDepth + 0.06, fill: ink, rule: "nonzero" }); }
    for (const l of cutLoops) { const pf = l.map(p => to3(p)), pb = l.map(p => to3(p, true));
      for (let i = 0; i < l.length; i++) { const j = (i + 1) % l.length, q = [pf[i], pf[j], pb[j], pb[i]], nrm = V3.cross(V3.add(q[1], V3.sc(q[0], -1)), V3.add(q[3], V3.sc(q[0], -1))); if (V3.dot(nrm, cam) <= 0) continue; faces.push({ pts: [q.map(proj)], depth: faceDepth - 0.01, fill: side }); } }   // sides ride just beneath their own face: a neighbour piece then covers a shared seam wall, and a slab's rim never paints over its own engraving
  }
  faces.sort((a2, b2) => a2.depth - b2.depth);
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const f of faces) for (const l of f.pts) for (const [x, y] of l) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  const W = (x1 - x0) * scale + 2 * pad, H = (y1 - y0) * scale + 2 * pad, P = ([x, y]) => `${r3((x - x0) * scale + pad)} ${r3((y - y0) * scale + pad)}`;
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${r3(W)}" height="${r3(H)}" viewBox="0 0 ${r3(W)} ${r3(H)}"><rect width="${r3(W)}" height="${r3(H)}" fill="#f3ead6"/>`;
  for (const f of faces) svg += `<path d="${f.pts.map(l => "M" + l.map(P).join("L") + "Z").join("")}" fill="${f.fill}"${f.rule ? ` fill-rule="${f.rule}"` : ""}${f.stroke ? ` stroke="${f.stroke}" stroke-width="${f.sw || 0.5}"` : ""}${process.env.PB_DEBUG_DEPTH ? ` data-depth="${r3(f.depth)}"` : ""}/>`;
  return svg + "</svg>";
}
const flatAt = (items, x, y, z, T = MAT) => slab(items, { origin: [x, y, z + T], T });            // lying on the table, top face at z+T
const standing = (items, origin, U, T = MAT3) => slab(items, { origin, U, V: [0, 0, -1], T });     // a vertical panel whose 2D top edge is at origin

/* =========================================================================================
   9. Sheets — nest named parts left-to-right, wrapping at a width
   ========================================================================================= */
function sheet(id, title, parts, { maxW = SHEET_W, gap = GAP, notes = "", count } = {}) {
  let x = gap, y = gap, rowH = 0, W = 0, items = [];
  for (const p of parts) {
    const b = bbox(p.items);
    if (x + b.w > maxW && x > gap) { x = gap; y += rowH + gap; rowH = 0; }
    items.push(...tag(xf(p.items, { tx: x - b.x0, ty: y - b.y0 }), p.name));
    x += b.w + gap; rowH = Math.max(rowH, b.h); W = Math.max(W, x);
  }
  return { id, title, items, w: r3(W), h: r3(y + rowH + gap), notes, count: count ?? parts.length };
}
const part = (name, items) => ({ name, items });

/* =========================================================================================
   10. Versions
   ========================================================================================= */
const VERSIONS = [
  { id: "v1", dir: "v1-plank", name: "V1 · The Plank", blurb: "A square plank with the round world engraved into it. The corners earn their keep: the wind dial lives top-left with its pivot cut into the board, a compass rose top-right, the title along the bottom. Docks are two-layer piers that overhang onto the island (glue the plank on top). Square crates, straight rim arrows, standing sloops." },
  { id: "v2", dir: "v2-pixel", name: "V2 · The Pixel World", blurb: "The board is cut along the stepped edge of the world itself — the sea IS the board. Jigsaw docks click into sockets cut in every island edge. Round tokens with the ingredient knocked out of a black badge, double-chevron rim (the app's own wind glyph), a 20-sector weather wheel with the storm odds built in, standing galleons." },
  { id: "v3", dir: "v3-round", name: "V3 · The Round Table", blurb: "A true circle with a double ring at the water's edge, cut in five: four identical jigsaw quadrants whose seams follow the grid lines around Tortuga, and Tortuga itself as the centre plug. Rim marks are the app's own wind chevron. T-shaped cut-out docks snap into a notch on any island edge; Tortuga is a one-square island with its four docks baked in. Hexagonal crates, a plain wind dial plus a separate 5-sector storm spinner, flat disc ships." },
];

function buildVersion(V) {
  const v = V.id, docs = [], cutParts = [];
  let five = null;
  if (v === "v3") { five = boardFivePiece(); docs.push(five.assembled); cutParts.push(...five.quadrants, five.plug); }
  else docs.push(board(v));
  // islands: the seven TET footprints, numbered as assets/islands/N.png
  const islandParts = (v === "v3" ? ISLAND_SHAPES : TET).map((_, i) => part(`island-${i + 1}`, islandPiece(v, i))); cutParts.push(...islandParts);
  docs.push(sheet("islands", v === "v3" ? "Island shapes (9)" : "Island shapes (7)", islandParts, { notes: v === "v3" ? "Every tetromino orientation: the seven footprints of the app plus the mirror images of the L and the S. Seven go out each voyage. Your second drawing: a straight-edged coast with 5 mm corners; a shore line and a grass line engraved inside it, 0.6 mm, each waving its own way, bare wood between them for the beach; a plain 9 × 2.5 mm notch in the middle of every outside edge, its floor just into the shore line so a dock touches the sand; one mark a square — the wind-blown palm on an end square, three stones and a tuft on the junction square, the game\u2019s grass tuft on the rest." : v === "v1" ? "Plain edges. Shoreline band and a palm engraved. 0.4 mm clearance per side so they sit inside the squares." : v === "v2" ? "A jigsaw socket is cut into the middle of EVERY outside edge, so a dock can click onto any side of any square." : "A 4.5 mm slot in the middle of every outside edge takes the mooring post of a dock." }));
  // docks
  const dp = ING.map(ing => dockPiece(v, ing));
  const dockParts = dp.map((d, i) => part(`dock-${ING[i]}`, d.dock));
  const dockExtras = dp.flatMap((d, i) => d.extra.length ? [part(v === "v1" ? `pier-top-${ING[i]}` : `mooring-post-${ING[i]}`, d.extra)] : []);
  cutParts.push(...dockParts, ...dockExtras);
  docs.push(sheet("docks", "Docks (7)", [...dockParts, ...dockExtras], { notes: v === "v1" ? "Two layers: the square is the water cell (anchor engraved); the plank strip glues on top, flush with the island-facing edge, and overhangs onto the island by a third of a square. The overhang is what 'attaches' it." : v === "v2" ? "One piece. The nub on the pier side clicks into any island socket. Engraved pier with plank slits and two bollards." : "The cut-out T (Wyatt, 2026-08-25): the pier itself is the piece — 9 mm stem whose deck becomes the unchanged 9 × 2.5 mm tab (0.05 play), 12.5 mm total reach so the head's outer face sits on the square's midline, 18 × 3.5 mm head with 1 mm rounds and a straight berth face the 24 × 12 hull lies broadside against. Planks run onto the tab; the head's planks turn 90°. The four bollards are half-round lugs CUT into the stem's sides — his pen drawing." }));
  // ingredient crates (4 per ingredient: 3 on the shelf + 1 black-market spare) and island markers
  const TOKEN_PAD = "cutC";   // Wyatt, 2026-08-25: "This is the correct amount of padding (C)"
  const crates = ING.flatMap(ing => [0, 1, 2, 3].map(n => part(`crate-${ing}-${n + 1}`, v === "v3" ? artToken(ing, 0, 0, TOKEN_MM, { pad: TOKEN_PAD }) : TOKEN[v].crate(ing, 0, 0))));
  cutParts.push(...crates);
  if (v === "v3") for (const [pad, label, mm] of [["cutC", "C", "about 1.7 mm"]])   // A and B removed (Wyatt, 2026-08-25: "I like c best")
    docs.push(sheet(`crates-${label.toLowerCase()}`, `Ingredient tokens — padding ${label}`, ING.map(ing => part(`token-${ing}`, artToken(ing, 0, 0, TOKEN_MM, { pad }))), { count: 7, notes: `Option ${label}: the cut line sits ${mm} outside the drawing's ink. Pick one; the cutting sheets currently carry option B.` }));
  docs.push(sheet("crates", "Ingredient crates (28)", crates, { notes: "Four per ingredient: three to stock an island at 3–4 players, one spare for the black market. Wheat, milk, sugar, eggs, cocoa, cinnamon, vanilla — the app's own icons, redrawn as cuttable outlines." }));
  const markerParts = v === "v3" ? [] : ING.map(ing => part(`marker-${ing}`, TOKEN[v].marker(ing, 0, 0))); cutParts.push(...markerParts);
  if (v !== "v3") docs.push(sheet("markers", "Island markers (7)", markerParts, { notes: "Sits on an island at setup to say which ingredient grows there — the shapes are dealt fresh each game, so the ingredient can't be engraved on the island." }));
  const whirlParts = [0, 1, 2, 3].map(n => ({ ...part(`whirlpool-${n + 1}`, whirlpool(v === "v1" ? "spiral" : v === "v2" ? "rings" : "swirl", 0, 0)), mat: v === "v3" ? MAT3 : MAT })); cutParts.push(...whirlParts);
  docs.push(sheet("whirlpools", "Whirlpools (4)", whirlParts, { notes: "One square each in 3 mm, 0.4 mm clearance, the game's whirlpool art (assets/trade-swirl.png) traced and engraved. Drop them on any four trade-wind squares — a ship carried by the current gets off at the next whirlpool." }));
  // spinner
  const arr = spinnerArrows(0, 0);
  const spParts = v === "v3" ? nestedSpinner() : [part("dial", spinnerDial(v === "v1" ? "quadrants-storm" : "roulette", 40, 0, 0)), part("arrow-now", arr.now), part("arrow-next", arr.next), part("washer-1", arr.washers[0]), part("washer-2", arr.washers[1])];
  
  cutParts.push(...spParts);
  docs.push(sheet("spinner", "Wind spinner", spParts, { notes: (v === "v1" ? "80 mm dial (also engraved on the board's corner). Each quadrant's last 18° is a storm wedge — one fifth of the wheel, the app's 20%. " : v === "v2" ? "80 mm weather wheel: 20 sectors, the last of every five is a storm sector (20%). " : "Nested, all 3 mm: a 96 mm backing disc; the game's compass as a 70 mm dial glued on it (storm wedge in the last fifth of each quadrant); a ring that turns around the dial — its slot takes the standing WIND NOW vane, a pennant on a 30 mm mast that streams toward the letter the ring is set to; a flat compass needle on the centre pivot for the forecast — the dark half is the pointer. Stack: backing, dial + ring (same level), needle, washer — an M3 × 16 bolt with a nyloc nut; the vane just drops into the ring. ") + (v === "v3" ? "" : `Two arrows on one pivot: the bold one labelled NOW is this round's wind, the hollow one is the forecast. Stack: dial, hollow arrow, washer, NOW arrow, washer — ${MAT * 3 + 2 * MAT} mm of wood, so an M3 × ${MAT * 5 + 8} bolt and nyloc nut.`) }));
  // ships
  const shipParts = [];
  for (let c = 0; c < 4; c++) {
    if (v === "v3") shipParts.push(...ship3d(c));
    else { const s = shipStanding(v === "v1" ? "sloop" : "galleon", c); shipParts.push(part(`ship-${CAPTAINS[c]}`, s.profile), part(`ship-base-${CAPTAINS[c]}`, s.base)); }
  }
  cutParts.push(...shipParts);
  docs.push(sheet("ships", "Ships (4)", shipParts, { count: 4, notes: "Four captains told apart in wood: CRUMBLE plain, BISCOTTI striped, GINGERSNAP dotted, SHORTBREAD checked (pink, teal, green, orange in the app — paint the sails if you like). " + (v === "v3" ? "An old pirate ship after the game's own sailboat art: a 6 mm hull seen from above (24 × 12 mm, deck planks, a tiller) with two slots ACROSS the beam; two 3 mm square sails on short masts whose tabs drop through the slots and sit flush underneath, the skull and crossbones (his reference, art/skull-ref.png) engraved big on each. About 24 mm tall. Paint the sails for the captain." : "Standing profiles: the tab under the hull drops into the slot in the base.") }));
  // recipes
  const recipeParts = recipeCards(v).map((c, i) => ({ ...part(`recipe-${i + 1}`, c), mat: MAT3 })); cutParts.push(...recipeParts);
  docs.push(sheet("recipes", "Recipe cards (21)", recipeParts, { notes: "Every possible 5-of-7 recipe, exactly once — 21 cards, 64 × 20 mm (sized for the shallow chest lid: the card slides under the hinge strip and tips out of the open back with gravity). Deal two to each captain, keep one, as the app does." }));
  // extras
  // Wyatt, 2026-08-25: "delete the cloud and captain's wheel, the game doesn't need them." The spinner's needle
  // parked in a storm wedge IS the forecast; nothing marks the board. Only the rules card remains here.
  const extraParts = [part("reference-card", referenceCard())].map(p => ({ ...p, mat: MAT3 })); cutParts.push(...extraParts);
  if (v === "v3") {
    const crateParts = CAPTAINS.flatMap(c => cargoCrate(c)), chestParts = CAPTAINS.flatMap(c => treasureChest(c));
    cutParts.push(...crateParts, ...chestParts);
    docs.push(sheet("crates-boxes", "Cargo crates (4)", crateParts, { count: 4, notes: "One open crate per captain, 44 × 30 × 18 mm in 3 mm ply: three slats a side with real gaps cut between them, solid corner posts, box joints. Tokens stand on edge in it, icons showing — cargo is public, as in the game. Paint to mark whose it is." }));
    docs.push(sheet("chests", "Treasure chests (4)", chestParts, { count: 4, notes: "One per captain, 80 × 27 × 32 mm in 2.6 mm ply — half as deep since 2026-08-25 (players hold under 10 coins). Box-jointed body (20 mm) and lid (12 mm). The hinge is a FRICTION fit, no dowel and no holes: the lid's two tongues wedge between the body's three and the lid stays where you put it; the hinge strip runs a ply-thickness further at each end so it fills the corners against the side walls' teeth. Both big plates carry the planks and straps, so either can face up. The recipe card (64 × 20) slides UNDER the hinge strip into rails on the lid's end walls; the rails cover only the front 60 %, so tipping the open chest lets the card fall out of the lid's back. Straps line up from the plates down the front and back. Blue labels are read-only, never engraved: corners 1–4 clockwise from front-left (L1, L2 on the lid), a wall's bottom names the plate edge it meets, H = the hinge strip; the two RAIL strips glue inside the lid's end walls under the engraved line." }));

  // one-offs for scrap-by-scrap test cuts (Wyatt, 2026-08-25: "i'm printing these test runs on scraps of wood
  // offcuts ... give me the ships, crates, and chests as 1-offs") — one unit each, split by material so each
  // file goes onto one scrap. Captains no longer differ on any of these (marks are painted), so one of each is all.
  if (v === "v3") {
    const oneShip = ship3d(0);
    docs.push(sheet("one-ship-hull", "One ship — hull (test cut, thick ply)", oneShip.filter(p => p.mat === MAT), { notes: `A single hull, ${MAT} mm ply. Kerf-compensated — cut on the line.` }));
    docs.push(sheet("one-ship-sails", "One ship — sails (test cut, thin ply)", oneShip.filter(p => p.mat === MAT3), { notes: `One mainsail and one jib, ${MAT3} mm ply. Kerf-compensated — cut on the line.` }));
    docs.push(sheet("one-crate", "One cargo crate (test cut, thin ply)", cargoCrate(CAPTAINS[0]), { maxW: 110, notes: `A single crate, ${MAT3} mm ply: four slatted walls and the base. Kerf-compensated — cut on the line.` }));
    docs.push(sheet("one-chest", "One treasure chest (test cut, thin ply)", treasureChest(CAPTAINS[0]), { maxW: 175, notes: `A single chest, ${MAT3} mm ply: body, lid, hinge strip, two card rails. Blue labels are read-only, not engraved. Kerf-compensated — cut on the line.` }));
    docs.push(sheet("one-tortuga", "Tortuga (test cut, thick ply)", [{ ...part("tortuga", tortugaPiece()), mat: MAT }], { notes: `The one-square Tortuga with its four baked T-docks (~50 × 50 mm), ${MAT} mm ply. Kerf-compensated — cut on the line.` }));
  }
  }
  docs.push(sheet("extras", "Extras", extraParts, { notes: "A rules card with the numbers the app keeps for you. (The storm cloud and first-player wheel were cut on 2026-08-25 — the needle parked in a storm wedge is the forecast.)" }));
  if (v === "v3") docs.push(...mockups(five, { islandParts, dockParts, crates, whirlParts, spParts, shipParts, crateParts: CAPTAINS.flatMap(c => cargoCrate(c)), chestParts: CAPTAINS.flatMap(c => treasureChest(c)), recipeParts }));
  if (v === "v3") {
    // the cutting sheets: every part, tallest first, on bed-sized sheets, kerf-compensated
    // one run of sheets per material: the board and its tokens in 6 mm, the thin parts in 3 mm
    const noGuide = p => ({ ...p, items: p.items.filter(i => i.layer !== GU) });
    const thick = packSheets(cutParts.filter(p => (p.mat || MAT) === MAT).map(noGuide)), thin = packSheets(cutParts.filter(p => (p.mat || MAT) === MAT3).map(noGuide));
    const all = [...thick.map(sh => ({ sh, m: MAT })), ...thin.map(sh => ({ sh, m: MAT3 }))], N = all.length;
  const matByPart = new Map(cutParts.map(p => [p.name, p.mat || MAT]));
  KERF_FOR = name => (matByPart.get(name) === MAT3 ? KERF3 : KERF);   // thin parts get the thin kerf, everywhere
    all.forEach(({ sh, m }, i) => docs.splice(1 + i, 0, { id: `sheet-${i + 1}`, title: `Cutting sheet ${i + 1} of ${N} — ${m} mm`, kind: "sheet", kerf: m === MAT3 ? KERF3 : KERF, mat: m, items: kerfCompensate(sh.items, KERF_FOR), w: BED_W, h: BED_H, count: sh.parts,
      notes: `${BED_W} × ${BED_H} mm bed, ${m} mm material. Every red line is already pushed ${(m === MAT3 ? KERF3 : KERF) / 2} mm away from the wood that stays (kerf ${m === MAT3 ? KERF3 : KERF} mm), so cut exactly on the line. ${sh.parts} parts.` }));
  } else {
    const all = docs.filter(d => d.id !== "board"), allParts = all.map(d => part(d.id, d.items));
    docs.push(sheet("pieces-all", "All pieces on one sheet", allParts, { maxW: SHEET_W, notes: `Every piece except the board, nested in a ${SHEET_W} mm wide sheet.`, count: all.reduce((a, d) => a + d.count, 0) }));
  }
  return { ...V, docs };
}

/* =========================================================================================
   10b. The mockups themselves — Wyatt, 2026-08-22: "renders of the assembled ships, treasure
        chests, and wind spinner, as well as a render of the assembled board"
   ========================================================================================= */
function mockups(five, P) {
  const docs = [], byName = (parts, n) => parts.find(p => p.name === n).items;
  const doc = (id, title, svg, notes) => ({ id, title, kind: "mockup", svg, notes, w: 0, h: 0, count: 0, items: [] });
  // the ship: hull flat, two square sails standing athwartships in the slots
  const shipSlabs = (c, x, y, z) => { const hull = byName(P.shipParts, `ship-${CAPTAINS[c]}-hull`), main = byName(P.shipParts, `ship-${CAPTAINS[c]}-main`), fore = byName(P.shipParts, `ship-${CAPTAINS[c]}-fore`);
    const B = 12, sailAt = (items, sx) => { const b = bbox(items.filter(i => i.layer === CU)); const mh = b.y1 - MAT;
      const shown = items.map(it => it.layer !== CU ? it : { ...it, sub: it.sub.map(sp => polyCmds(clipPolyHalf(flatten(sp, 8).pts, 0, 1, mh - 0.05))) });   // the tab is inside the hull
      return standing(shown, [x + sx + MAT3 / 2, y + B / 2 - 1.3, z + MAT + mh], [0, -1, 0]); };   // art face toward +x = the camera
    return [flatAt(hull, x, y, z), sailAt(main, 7.5), sailAt(fore, 15.5)]; };
  docs.push(doc("mockup-ship", "Mockup: a ship, assembled", isoScene(shipSlabs(1, 0, 0, 0), { scale: 9 }), "The 6 mm hull with its two square sails dropped into the slots across the beam. Biscotti's stripes along the foot of each sail; the game's skull over crossed bones."));
  // the treasure chest, open, card in the lid
  const chestSlabs = (() => { const c = 0, g = n => byName(P.chestParts, `chest-${CAPTAINS[c]}-${n}`), t = MAT3, Lo = 80, Wo = 27, hb = 20 - MAT3;
    // every slab's art face points OUTWARD, and the chest faces the camera (+y): the camera sees the +x/+y/top
    // faces only, so the lock-plate wall must be on the +y side or it can never be seen. Hinge goes to y = 0.
    const s = [slab(g("base"), { origin: [0, Wo, 0], U: [1, 0, 0], V: [0, -1, 0], T: t, bias: -40 })];   // art face down (outside bottom); floor paints first
    s.push(slab(g("front"), { origin: [t, Wo, t + hb], U: [1, 0, 0], V: [0, 0, -1], T: t }));       // lock side, toward the camera
    s.push(slab(g("back"), { origin: [Lo - t, 0, t + hb], U: [-1, 0, 0], V: [0, 0, -1], T: t }));   // knuckle side, away
    s.push(slab(g("side-2"), { origin: [0, Wo - t, t + hb], U: [0, -1, 0], V: [0, 0, -1], T: t }));
    s.push(slab(g("side-1"), { origin: [Lo, t, t + hb], U: [0, 1, 0], V: [0, 0, -1], T: t }));
    // the lid, closed pose first, then swung open 110° about the hinge axis (y = Wo - t/2, z = t + hb + 3.3)
    const ay = t / 2, az = t + hb + 2.2, th = rad(125), rot = p => [p[0], ay + (p[1] - ay) * Math.cos(th) - (p[2] - az) * Math.sin(th), az + (p[1] - ay) * Math.sin(th) + (p[2] - az) * Math.cos(th)];
    const lidZ = t + hb + (12 - MAT3), hl = 12 - MAT3;
    const lid = [slab(g("lid-top"), { origin: [0, 0, lidZ + t], T: t, xform: rot }),
      slab(g("lid-front"), { origin: [Lo - t, Wo, lidZ - hl], U: [-1, 0, 0], V: [0, 0, 1], T: t, xform: rot }),
      slab(g("lid-side-2"), { origin: [0, Wo - t, lidZ - hl], U: [0, -1, 0], V: [0, 0, 1], T: t, xform: rot }),
      slab(g("lid-side-1"), { origin: [Lo, t, lidZ - hl], U: [0, 1, 0], V: [0, 0, 1], T: t, xform: rot }),
      slab(g("lid-hinge"), { origin: [t, 0, lidZ - HINGE_BODY], U: [1, 0, 0], V: [0, 0, 1], T: t, xform: rot }),   // seated: body 27..29.4 under the plate, tongues hanging BELOW
      slab(g("card-rail-1"), { origin: [Lo - t, t, lidZ - 5.6], U: [0, 1, 0], V: [0, 0, -1], T: t, xform: rot }), slab(g("card-rail-2"), { origin: [t, Wo - t, lidZ - 5.6], U: [0, -1, 0], V: [0, 0, -1], T: t, xform: rot })];
    // a few coins inside
    // the coins lie on the table beside the card: inside the body they are geometrically invisible at this camera
    // (walls 17.4 tall, box 21.8 deep), and painting them "visible anyway" was the wrong-face lie all over again
    for (let i = 0; i < 3; i++) s.push({ ...flatAt(coinGlyph(0, 0, 18).concat([circ(CU, 0, 0, 9)]), 78 + i * 8, Wo + 14 + i * 6, i * 1.7, 1.6), openOnly: true });   // 18 mm coins lie flat (interior 21.8 deep); hidden in the closed pose, where the painter would bleed them through the wall
    // the card lies on the table in front, face up — just tipped out of the open lid. (Inside the lid it rides on the
    // two rails, under the hinge strip; past 90° this painter would show the lid's outside where its inside is, so the
    // lid stays under 90° and the card tells its story here. Wyatt, 2026-08-25: "captured from the wrong face".)
    s.push({ ...flatAt(P.recipeParts[13].items, 4, Wo + 10, 0, t), openOnly: true });   // on the table, viewer side, clear of the chest
    return [...s, ...lid]; })();
  docs.push(doc("mockup-chest", "Mockup: a treasure chest, open", isoScene(chestSlabs, { scale: 5 }), "Body on its base, lid tilted back on the friction hinge — the tongues wedge and hold the pose. The recipe card lies in front, just tipped out: inside the lid it rides on the two rails (front 60 % of the end walls), under the hinge strip, and falls free when you tip the open chest. Coins spilled on the table beside it."));
  docs.push(doc("mockup-chest-closed", "Mockup: a treasure chest, closed", isoScene(chestSlabs.filter(sb => !sb.openOnly).map(sb => sb.xform ? { ...sb, xform: null } : sb), { scale: 5 }), "The same chest shut: lid walls meet the body walls, the tongues interleave at the back."));
  // the spinner: backing, dial + ring at one level, needle above, vane standing in the ring's slot
  const spSlabs = (() => { const g = n => byName(P.spParts, n), t = MAT3, s = [flatAt(g("spinner-backing"), 0, 0, 0, t), flatAt(g("spinner-dial"), 0, 0, t, t), flatAt(xf(g("spinner-ring"), { rot: -30 }), 0, 0, t, t), flatAt(xf(g("spinner-needle"), { rot: -20 }), 0, 0, 2 * t, t), flatAt(g("spinner-washer"), 0, 0, 3 * t, t)];
    const a = rad(-30 - 90), vr = 43, vx = vr * Math.cos(a), vy = vr * Math.sin(a); // the slot, turned with the ring
    const vane = g("spinner-vane"), vb = bbox(vane.filter(i => i.layer === CU)); // tab bottom at vb.y1, mast base at vb.y1 - MAT3
    s.push(slab(vane, { origin: [vx - 1.3 * Math.cos(a), vy - 1.3 * Math.sin(a), t + (vb.y1 - t)], U: [Math.cos(a), Math.sin(a), 0], V: [0, 0, -1], T: t, bias: 60 }));
    return s; })();
  docs.push(doc("mockup-spinner", "Mockup: the wind spinner, assembled", isoScene(spSlabs, { scale: 4 }), "Backing disc; the compass dial glued on it with the ring turning around it; the flat forecast needle on the pivot above; the WIND NOW vane standing in the ring's slot, pennant toward the letter the ring is set to."));
  // a cargo crate with tokens standing in it
  const crateSlabs = (() => { const c = 2, g = n => byName(P.crateParts, `crate-${CAPTAINS[c]}-${n}`), t = MAT3, Lo = 44, Wo = 30, hw = 15;
    const s = [{ ...flatAt(g("base"), 0, 0, 0, t), bias: -40 }, slab(g("front"), { origin: [Lo - t, 0, t + hw], U: [-1, 0, 0], V: [0, 0, -1], T: t }), slab(g("back"), { origin: [t, Wo, t + hw], U: [1, 0, 0], V: [0, 0, -1], T: t }),   // the floor paints FIRST: a big flat face out-means standing walls in this projection
      slab(g("side-2"), { origin: [0, t, t + hw], U: [0, 1, 0], V: [0, 0, -1], T: t }), slab(g("side-1"), { origin: [Lo, Wo - t, t + hw], U: [0, -1, 0], V: [0, 0, -1], T: t })];
    // no tokens in this scene: five adversarial-review rounds showed the painter cannot draw "a standing piece
    // inside an open box" without lying somewhere (occlusion, gaps, or parallax). The crate is shown empty and
    // TRUE; the tokens' own art is on the tokens sheet, and the caption tells the story.
    return s; })();
  docs.push(doc("mockup-crate", "Mockup: a cargo crate", isoScene(crateSlabs, { scale: 6 }), "Slatted sides with real gaps, corner posts. In play the ingredient tokens stand inside on edge, icons showing — cargo is public, as in the game (the tokens are on their own sheet)."));
  // the board on the table: quadrants, Tortuga on top, three islands with docks and tokens, two ships, a whirlpool
  const boardSlabs = (() => { const s = five.quadrants.map(q => flatAt(q.items, 0, 0, 0)); const C = CENTER;
    s.push(flatAt(xf(five.plug.items, { tx: C, ty: C }), 0, 0, MAT));
    const place = (i, cx, cy, dockSide) => { const isl = P.islandParts[i].items, b = bbox(isl.filter(x => x.layer === CU)); s.push(flatAt(xf(isl, { tx: cx - b.x0, ty: cy - b.y0 }), 0, 0, MAT));
      const cells = ISLAND_SHAPES[i]; cells.forEach(([a, b2], k) => { const ing = ING[(i * 3 + k) % 7], tk = artToken(ing, cx + (a + .5) * CELL, cy + (b2 + .5) * CELL); if (k < 3) s.push(flatAt(tk, 0, 0, 2 * MAT)); });
      const d = byName(P.dockParts, `dock-${ING[i % 7]}`); s.push(flatAt(xf(d, { rot: dockSide.rot, tx: dockSide.x, ty: dockSide.y }), 0, 0, MAT)); };
    place(0, 3 * CELL, 4 * CELL, { rot: 180, x: 3 * CELL - CLR, y: 4 * CELL + CELL - CLR });        // I3, dock on its left end
    place(4, 9 * CELL, 2 * CELL, { rot: 90, x: 10 * CELL + CELL - CLR, y: 4 * CELL + CLR });         // L4, dock below its foot
    place(5, 4 * CELL, 9 * CELL, { rot: 0, x: 7 * CELL + CLR, y: 10 * CELL + CLR });                 // S, dock on its right end
    s.push(flatAt(xf(P.whirlParts[0].items, { tx: 9.5 * CELL, ty: 0.5 * CELL }), 0, 0, MAT, MAT3));
    s.push(...shipSlabs(0, 6 * CELL + 1, 6 * CELL + 6, MAT), ...shipSlabs(3, 8 * CELL + 1, 7 * CELL + 6, MAT));
    return s; })();
  docs.push(doc("mockup-board", "Mockup: the board on the table", isoScene(boardSlabs, { scale: 2.6 }), "The four quadrants locked, Tortuga sitting on top over its dotted outline, three islands with a dock plugged into each and their ingredients one per square, a whirlpool tile on the rim, two ships at Tortuga."));
  return docs;
}

/* =========================================================================================
   11. Emit — SVG (two layer groups) and DXF R12 (two layers)
   ========================================================================================= */
function svgPathD(sub) {
  if (sub.circle) { const { cx, cy, r, ccw } = sub.circle, sw = ccw ? 0 : 1; return `M${r3(cx + r)} ${r3(cy)}A${r3(r)} ${r3(r)} 0 1 ${sw} ${r3(cx - r)} ${r3(cy)}A${r3(r)} ${r3(r)} 0 1 ${sw} ${r3(cx + r)} ${r3(cy)}Z`; }
  return sub.cmds.map(c => c[0] === "Z" ? "Z" : c[0] + c.slice(1).map(r3).join(" ")).join("");
}
function emitSVG(doc, V, forPage = false) {
  const layers = [[RA, "RASTER", `fill="#000000" fill-rule="nonzero" stroke="none"`], [CU, "CUT", `fill="none" stroke="#ff0000" stroke-width="0.1"`], ...(forPage ? [[GU, "GUIDE", `fill="#1d63d6" fill-rule="nonzero" stroke="none"`]] : [])];
  let out = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape" width="${doc.w}mm" height="${doc.h}mm" viewBox="0 0 ${doc.w} ${doc.h}">\n`;
  out += `<title>Pastry Pirates — ${V.name} — ${doc.title}</title>\n<desc>${doc.notes.replace(/[<>&]/g, "")} Units: mm. ${CELL} mm squares, ${MAT} mm material. ${doc.kerf ? `KERF-COMPENSATED: cut lines offset ${KERF / 2} mm away from the kept wood (kerf ${KERF} mm) — cut exactly on the line.` : "No kerf compensation — this is the assembled-board design view, not a cutting file."} RASTER = black fill (engrave), CUT = red hairline (cut). Generated by physical-board/generate.mjs.</desc>\n`;
  for (const [L, name, attrs] of layers) {
    out += `<g id="${name}" class="layer-${name.toLowerCase()}" inkscape:label="${name}" inkscape:groupmode="layer" ${attrs}>\n`;
    let curPiece = null;
    for (const it of doc.items) {
      if (it.layer !== L) continue;
      if (it.piece !== curPiece) { if (curPiece !== null) out += `</g>\n`; curPiece = it.piece; out += `<g class="piece" data-piece="${curPiece || "misc"}">\n`; }
      if (it.sub.length === 1 && it.sub[0].circle) { const c = it.sub[0].circle; out += `<circle cx="${r3(c.cx)}" cy="${r3(c.cy)}" r="${r3(c.r)}"/>\n`; }
      else out += `<path d="${it.sub.map(svgPathD).join("")}"/>\n`;
    }
    if (curPiece !== null) out += `</g>\n`;
    out += `</g>\n`;
  }
  return out + `</svg>\n`;
}
// DXF: the geometry is handed to ezdxf (art/dxf.py) which writes real R2000 — Wyatt's Rhino refused the
// hand-rolled version ("Opendesign error: null object id", 2026-08-25): ODA wants the full object/handle
// structure, and the reference library is the only honest way to produce it. RASTER = one solid HATCH per
// item (loops = its sub-paths, odd-parity so holes stay open); CUT = bare polylines/circles.
function dxfEntities(doc) {
  const H = doc.h, out = [];
  const loopPts = sp => { if (sp.circle) { const { cx, cy, r } = sp.circle, pts = []; for (let i = 0; i < 48; i++) { const a = i / 48 * 2 * Math.PI; pts.push([r3(cx + r * Math.cos(a)), r3(H - (cy + r * Math.sin(a)))]); } return pts; } return flatten(sp).pts.map(([x, y]) => [r3(x), r3(H - y)]); };
  for (const it of doc.items) {
    if (it.layer === GU) continue;
    if (it.layer === RA) { const loops = it.sub.map(loopPts).filter(l => l.length > 2); if (loops.length) out.push({ type: "hatch", loops }); continue; }
    for (const sp of it.sub) {
      if (sp.circle) { out.push({ type: "circle", layer: it.layer, cx: r3(sp.circle.cx), cy: r3(H - sp.circle.cy), r: r3(sp.circle.r) }); continue; }
      const { pts, closed } = flatten(sp);
      out.push({ type: "poly", layer: it.layer, closed: !!closed, pts: pts.map(([x, y]) => [r3(x), r3(H - y)]) });
    }
  }
  return out;
}
function writeDXFs(dxfDocs) {
  const j = path.join(HERE, ".dxf-build.json");
  fs.writeFileSync(j, JSON.stringify(dxfDocs));
  try { execSync(`python3 ${JSON.stringify(path.join(HERE, "art", "dxf.py"))} ${JSON.stringify(j)}`, { stdio: "inherit" }); }
  catch (e) { console.error("DXF EMISSION FAILED — the .dxf files were NOT written. Install the writer: pip3 install --user ezdxf"); throw e; }
  finally { fs.unlinkSync(j); }
}

/* =========================================================================================
   12. Main
   ========================================================================================= */
const siteData = { cell: CELL, material: MAT, kerf: KERF, bed: [BED_W, BED_H], generated: new Date().toISOString().slice(0, 10), versions: [] };
for (const V of VERSIONS.filter(V => ONLY.includes(V.id))) {
  const built = buildVersion(V), dir = path.join(HERE, V.dir);
  const dxfDocs = [];
  fs.mkdirSync(dir, { recursive: true });
  const groups = [];
  for (const doc of built.docs) {
    if (doc.kind === "mockup") { fs.writeFileSync(path.join(dir, `${doc.id}.svg`), doc.svg); groups.push({ id: doc.id, title: doc.title, kind: "mockup", mat: null, notes: doc.notes, w: 0, h: 0, count: 0, svg: doc.svg }); continue; }
    // Wyatt's first test cut (2026-08-25) was from the GROUP files, which carried no kerf compensation — the only
    // warning lived in an SVG <desc> his Rhino flow never shows, and the docks wiggled ~0.5 mm. Now EVERY cut file
    // is compensated; only the assembled-board design view is not. Page previews stay uncompensated.
    const cuttable = doc.kind !== "sheet" && doc.kind !== "design";
    const diskDoc = cuttable ? { ...doc, kerf: KERF, items: kerfCompensate(doc.items, KERF_FOR) } : doc;
    const svg = emitSVG(diskDoc, V), pageSvg = emitSVG(doc, V, true);
    fs.writeFileSync(path.join(dir, `${doc.id}.svg`), svg);
    dxfDocs.push({ path: path.join(dir, `${doc.id}.dxf`), w: doc.w, h: doc.h, entities: dxfEntities(diskDoc) });
    groups.push({ id: doc.id, title: doc.title, kind: doc.kind || "preview", mat: doc.mat || null, notes: doc.notes, w: doc.w, h: doc.h, count: doc.count, svg: pageSvg });
  }
  siteData.versions.push({ id: V.id, dir: V.dir, name: V.name, blurb: V.blurb, groups });
  writeDXFs(dxfDocs);
  console.log(`${V.dir}: ${built.docs.length} files x2 (svg+dxf)`);
}
fs.writeFileSync(path.join(HERE, "site-data.js"), "window.PB_DATA = " + JSON.stringify(siteData) + ";\n");
console.log(`cell ${CELL} mm, material ${MAT} mm — site-data.js written`);
