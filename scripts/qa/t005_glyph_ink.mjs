/* T-005 — DOES THE RIG DRAW THE COIN, OR NOT?
 *
 * Wyatt, INBOX-20260902T0405Z: "I just tested the black market coin bug on safari, staging.6 and
 * the coin appeared correctly. I'm not sure what caused your rig to miss it, but it's working
 * correctly as is." So the SUBJECT here is the instrument, not the game. This tool exists to
 * answer one question about a picture with a number instead of an impression: how much ink is
 * inside a named box?
 *
 * WHY INK AND NOT "does it look right": rule 6. An eye reading a 1500px screenshot scaled into a
 * reply is exactly the unmeasured instrument that put four false defects in front of him on
 * 2026-08-20. A pixel count over a stated box can be red-proofed; a glance cannot.
 *
 * Usage:
 *   node scripts/qa/t005_glyph_ink.mjs --png=<file> --box=x,y,w,h [--out=<file> --zoom=8]
 *
 * Prints: the box, the paper colour it derived, the ink count and the ink fraction.
 * "Ink" is a pixel far enough from the box's own most common colour to be something drawn on it,
 * so the tool never needs to be told what the background is.
 */
import fs from "node:fs";
import path from "node:path";
import { decode, encode, COLOUR } from "../lib/png.mjs";

const arg = (k, d) => {
  const hit = process.argv.find((a) => a.startsWith(`--${k}=`));
  return hit ? hit.slice(k.length + 3) : d;
};

/** Pixel (x,y) as [r,g,b]. */
function at(img, x, y) {
  const o = (y * img.w + x) * img.bpp;
  if (img.bpp >= 3) return [img.px[o], img.px[o + 1], img.px[o + 2]];
  return [img.px[o], img.px[o], img.px[o]];
}

/** Chebyshev distance in RGB — cheap, and "far from the paper" is all we need. */
const far = (a, b) => Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]), Math.abs(a[2] - b[2]));

/**
 * Ink inside a box: pixels more than `tol` from the box's OWN most common colour.
 * Deriving the paper colour from the box (rather than passing it in) is what stops this
 * becoming another hardcoded constant that is right for one screenshot and wrong for the next.
 */
export function inkInBox(img, { x, y, w, h }, tol = 40) {
  const tally = new Map();
  for (let j = y; j < y + h; j++) {
    for (let i = x; i < x + w; i++) {
      const p = at(img, i, j);
      const k = (p[0] << 16) | (p[1] << 8) | p[2];
      tally.set(k, (tally.get(k) || 0) + 1);
    }
  }
  let bgKey = 0, best = -1;
  for (const [k, n] of tally) if (n > best) { best = n; bgKey = k; }
  const bg = [(bgKey >> 16) & 255, (bgKey >> 8) & 255, bgKey & 255];
  let ink = 0;
  for (let j = y; j < y + h; j++) {
    for (let i = x; i < x + w; i++) if (far(at(img, i, j), bg) > tol) ink++;
  }
  return { ink, total: w * h, fraction: ink / (w * h), bg };
}

/** Nearest-neighbour magnification, so a 40px glyph can actually be LOOKED at (rule 19). */
export function cropZoom(img, { x, y, w, h }, zoom) {
  const W = w * zoom, H = h * zoom;
  const out = Buffer.alloc(W * H * 3);
  for (let j = 0; j < H; j++) {
    for (let i = 0; i < W; i++) {
      const p = at(img, x + Math.floor(i / zoom), y + Math.floor(j / zoom));
      const o = (j * W + i) * 3;
      out[o] = p[0]; out[o + 1] = p[1]; out[o + 2] = p[2];
    }
  }
  return { w: W, h: H, depth: 8, colour: COLOUR.RGB, bpp: 3, px: out };
}

if (process.argv[1] && process.argv[1].endsWith("t005_glyph_ink.mjs")) {
  const png = arg("png");
  if (!png) { console.error("need --png="); process.exit(2); }
  const img = decode(fs.readFileSync(png));
  const boxArg = arg("box");
  if (!boxArg) { console.log(`${path.basename(png)} is ${img.w}x${img.h}`); process.exit(0); }
  const [x, y, w, h] = boxArg.split(",").map(Number);
  const r = inkInBox(img, { x, y, w, h });
  console.log(`${path.basename(png)} ${img.w}x${img.h}`);
  console.log(`  box ${x},${y} ${w}x${h} · paper rgb(${r.bg.join(",")})`);
  console.log(`  INK ${r.ink} / ${r.total} px = ${(r.fraction * 100).toFixed(2)}%`);
  /* --cols prints the ink COLUMN PROFILE across the box, collapsed to runs of "has ink" /
     "no ink". That is what tells a missing PAINT from a missing LAYOUT: an <img> that loaded and
     did not paint still reserves its width, so the empty run is as wide as the picture would be;
     an <img> that never loaded collapses and the empty run is a thin word-space. */
  if (process.argv.includes("--cols")) {
    const runs = [];
    for (let i = x; i < x + w; i++) {
      let n = 0;
      for (let j = y; j < y + h; j++) if (far(at(img, i, j), r.bg) > 40) n++;
      const kind = n > 0 ? "ink" : "gap";
      if (runs.length && runs[runs.length - 1].kind === kind) runs[runs.length - 1].w++;
      else runs.push({ kind, at: i - x, w: 1 });
    }
    console.log("  columns: " + runs.map((c) => `${c.kind}@${c.at}x${c.w}`).join(" "));
  }
  const out = arg("out");
  if (out) {
    fs.writeFileSync(out, encode(cropZoom(img, { x, y, w, h }, Number(arg("zoom", "8")))));
    console.log(`  wrote ${out}`);
  }
}
