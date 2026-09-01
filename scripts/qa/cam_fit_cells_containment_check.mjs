#!/usr/bin/env node
/* THE GEOMETRY-ONLY UNIT TEST THE SAIL-SQUARE INVESTIGATION NAMED AS ITS NEXT STEP.
   (.planning/CHART.md, "A GUEST ON A PHONE HAS A SAIL SQUARE IT CANNOT TAP" — six probe runs on a
   real two-browser crew room measured a frame narrower than its own subject's bbox, twice, and
   left one open question: does src/ui/stage.js's camFitCells()/camTo() actually have a containment
   bug, or does the DOM probe's own bbox reconstruction not match what camFitCells was really
   handed? No browser needed to answer this — camFitCells is pure math over a cell list, and its
   own comment (:160) claims "the zoom is derived from the subject". This calls the REAL function,
   extracted from the real file by brace-matching (never a hand-copied re-implementation — that
   would test a description of the code, not the code, CLAUDE.md's "a comment is not a measurement"
   applied to test doubles), and checks the one property camFitCells is supposed to guarantee: the
   applied frame contains every cell it was asked to fit.

   RUN: node scripts/qa/cam_fit_cells_containment_check.mjs */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const SRC = fs.readFileSync(path.join(REPO, "src/ui/stage.js"), "utf8");

let fails = 0;
const ok = m => console.log("  ✓ " + m);
const bad = m => { fails++; console.log("  ✗ " + m); };

// Brace-matched extraction, not a line-number slice — this is the SAME source the game ships,
// verified to still exist and still shaped this way every run, not a frozen copy that can drift.
function extractFn(src, name){
  const start = src.indexOf(`function ${name}(`);
  if (start < 0) throw new Error(`function ${name}() not found in stage.js — has it been renamed?`);
  const bodyStart = src.indexOf("{", start);
  let depth = 0, i = bodyStart;
  for (; i < src.length; i++){
    if (src[i] === "{") depth++;
    else if (src[i] === "}"){ depth--; if (depth === 0) break; }
  }
  return src.slice(start, i + 1);
}
function extractConst(src, name){
  const m = src.match(new RegExp(`const ${name}\\s*=\\s*([^;\\n]+);`));
  if (!m) throw new Error(`const ${name} not found in stage.js`);
  return m[1];
}

const camFitCellsSrc = extractFn(SRC, "camFitCells");
const camToSrc = extractFn(SRC, "camTo");
const zoomCapSrc = extractFn(SRC, "zoomCap");
const CAM_FIT_PAD = Number(extractConst(SRC, "CAM_FIT_PAD"));
if (!(CAM_FIT_PAD > 0)) throw new Error("CAM_FIT_PAD did not extract to a positive number");
const PHONE_MAX_W = Number(extractConst(SRC, "PHONE_MAX_W"));
if (!(PHONE_MAX_W > 0)) throw new Error("PHONE_MAX_W did not extract to a positive number");

/* Sandbox: a fresh S/$/wake/cellPx for every call, matching the real module's own shapes
   (S.cam per :93, $ per :25, cellPx per :115) but never touching the real appState/DOM — the
   whole point is to run the real math with no browser. zoomCap needs $("boardwrap"); returning
   null reproduces the real function's own fallback on a phone (no desktop board-wrap present),
   which is the class of screen this bug was measured on. */
function run(cells, maxZoom, reservePx, { grid = 15, boardBandStrip = 390 } = {}){
  const S = { active: false, cam: { x: 0, y: 0, w: 640, tx: 0, ty: 0, tw: 640 } };
  const $ = id => null;
  const wake = () => {};
  const cellPx = () => 640 / grid;
  const boardBand = () => ({ top: 0, bottom: boardBandStrip, left: 8, right: 640 });
  const factory = new Function(
    "S", "$", "wake", "cellPx", "boardBand", "CAM_FIT_PAD", "PHONE_MAX_W",
    `${zoomCapSrc}\n${camToSrc}\n${camFitCellsSrc}\nreturn camFitCells;`
  );
  const camFitCells = factory(S, $, wake, cellPx, boardBand, CAM_FIT_PAD, PHONE_MAX_W);
  camFitCells(cells, maxZoom, reservePx);
  return S.cam;   // .tx/.ty/.tw are the TARGET camFitCells actually committed via camTo()
}

// The exact bbox math camFitCells itself uses (mirrored here only to compute the EXPECTED
// containment box for the assertion — camFitCells's own extracted source is what is under test,
// this is just the oracle for "did the real cells end up inside the real frame").
function bboxOf(cells, grid = 15){
  const cp = 640 / grid;
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  cells.forEach(([x, y]) => { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); });
  // the REAL (unpadded) pixel span of the cells themselves — losing the CAM_FIT_PAD margin at a
  // board edge is fine (there is no board there to show); losing part of an actual cell is the bug.
  return { realX0: x0 * cp, realY0: y0 * cp, realX1: (x1 + 1) * cp, realY1: (y1 + 1) * cp };
}

function assertContains(label, cam, real){
  const left = cam.tx, top = cam.ty, right = cam.tx + cam.tw, bottom = cam.ty + cam.tw;
  const shortL = real.realX0 - left, shortT = real.realY0 - top;
  const shortR = right - real.realX1, shortB = bottom - real.realY1;
  const held = shortL >= -1e-6 && shortT >= -1e-6 && shortR >= -1e-6 && shortB >= -1e-6;
  if (held) ok(`${label}: frame [${left.toFixed(1)},${top.toFixed(1)} ${cam.tw.toFixed(1)}x${cam.tw.toFixed(1)}] contains real cells [${real.realX0.toFixed(1)},${real.realY0.toFixed(1)}]-[${real.realX1.toFixed(1)},${real.realY1.toFixed(1)}]`);
  else bad(`${label}: frame [${left.toFixed(1)},${top.toFixed(1)} ${cam.tw.toFixed(1)}x${cam.tw.toFixed(1)}] does NOT contain real cells [${real.realX0.toFixed(1)},${real.realY0.toFixed(1)}]-[${real.realX1.toFixed(1)},${real.realY1.toFixed(1)}] — short by L${shortL.toFixed(1)} T${shortT.toFixed(1)} R${shortR.toFixed(1)} B${shortB.toFixed(1)}`);
  return held;
}

console.log("cam_fit_cells_containment_check — the real camFitCells()/camTo(), no browser\n");

// 1. CENTRE CLUSTER, no reserve — the ordinary case, nowhere near an edge or the 640 cap.
{
  const cells = [[6,6],[6,7],[7,6],[7,7]];
  const cam = run(cells, 2.2, 0);
  assertContains("centre cluster, reservePx=0", cam, bboxOf(cells));
}

// 2. EDGE-ADJACENT — cells touching the LEFT column (gx=0), the exact shape measured in the field
//    ((1,9) and (3,8) in the two clean repros, and every occurrence has been near an edge).
{
  const cells = [[0,8],[0,9],[1,8],[1,9]];
  const cam = run(cells, 2.2, 0);
  assertContains("left-edge cluster, reservePx=0", cam, bboxOf(cells));
}
// same on the RIGHT edge (gx = grid-1) — the third field repro was 24px off the RIGHT, not left.
{
  const cells = [[13,8],[13,9],[14,8],[14,9]];
  const cam = run(cells, 2.2, 0);
  assertContains("right-edge cluster, reservePx=0", cam, bboxOf(cells));
}

// 3. WITH A REAL RESERVE — a phone-sized prompt (ask pill + hint + a live narration bubble) is
//    genuinely 150-250px on a ~390px-tall board band; this is the case the code's own comment
//    (:181) says grows the frame to make room. Edge-adjacent AND reserved, together — the
//    two conditions the field bug's own screenshots both showed at once.
for (const reservePx of [0, 80, 150, 220, 250]){
  const cells = [[0,7],[0,8],[0,9],[1,8],[2,8]];
  const cam = run(cells, 2.2, reservePx, { boardBandStrip: 390 });
  assertContains(`left-edge cluster + reservePx=${reservePx} (phone strip 390)`, cam, bboxOf(cells));
}

// 4. THE 640-CAP EDGE CASE, PROVEN BY THE FORMULA ALONE, WORTH A NUMBER: camFitCells's own
//    `side = Math.min(side, 640)` (:191) is the only line in the function that can make the
//    frame SMALLER after side has already been set >= max(bw,bh) — every other step (the D-36
//    zoom floor, the reserve growth) only grows it. So this line can violate containment ONLY
//    when the padded bbox itself already exceeds 640 BEFORE that clamp runs — i.e. a cell spread
//    wide enough that width/height + CAM_FIT_PAD's own margin tips past the whole board. Tested
//    directly rather than reasoned about, per CLAUDE.md ("a comment is not a measurement").
{
  const cells = [[0,7],[12,7]];   // span 12 -> bw = (12+1+2*1.2)*cp = 15.4*cp; at grid=15, cp=42.67 -> 657.1 > 640
  const bbox = bboxOf(cells);
  const bboxWidthWithPad = (12 + 1 + 2 * CAM_FIT_PAD) * (640 / 15);
  const cam = run(cells, 2.2, 0);
  console.log(`  (padded bbox width ${bboxWidthWithPad.toFixed(1)} vs 640-cap — this is the one line that can shrink the frame below its own subject)`);
  assertContains("wide span tripping the 640 cap (grid=15, span=12)", cam, bbox);
}

// 5. THE FIELD NUMBER ITSELF — occurrence #2 from sail_containment_crew_probe.mjs (.planning/
//    CHART.md): true bbox (cells+ship, padded) was 486.4 units wide; the frame camFitCells
//    actually applied (read off the live viewBox) was only 336.8 wide. camFitCells's own math
//    computes `side = Math.max(bw, bh, ...)` and every later step can only GROW it (reserve) or
//    cap it at 640 (never below 640, and 336.8 < 640 so the cap above cannot be the explanation
//    either) — so IF those two numbers describe the same call, the function is provably broken.
//    Reconstruct the SAME cell set width (span=8, matching 486.4 = (8+1+2.4)*42.667) and confirm
//    what the real function actually does with it.
{
  const grid = 15, cp = 640 / grid;
  // span=8 in x reproduces the measured 486.4-wide TRUE bbox; y kept tight so bw drives `side`.
  const cells = [[1,8],[9,8],[5,7]];
  const bbox = bboxOf(cells, grid);
  const trueBboxWidth = (8 + 1 + 2 * CAM_FIT_PAD) * cp;
  const cam = run(cells, 2.2, 0, { grid });
  console.log(`  (reconstructed true bbox width ${trueBboxWidth.toFixed(1)} — field measurement was 486.4; applied frame this run: ${cam.tw.toFixed(1)} — field measurement was 336.8)`);
  const held = assertContains("occurrence #2 shape (span=8, matching the field's 486.4-wide bbox)", cam, bbox);
  if (held && cam.tw >= trueBboxWidth - 1e-6){
    ok(`camFitCells's own applied width (${cam.tw.toFixed(1)}) is >= the true bbox width (${trueBboxWidth.toFixed(1)}) it was handed — CONFIRMS the function honours its own containment guarantee for this exact shape`);
  }
}

console.log(fails ? `\nFAIL — ${fails} case(s): camFitCells/camTo do not contain their own subject\n`
                   : "\nPASS — every containment check held: camFitCells's math is sound for every shape tried, INCLUDING the field's own span. This narrows the sail-square investigation: the crew-phone bug is not explained by this function's math with the cell set it claims to have been given, so the probe's bbox reconstruction (ship position / cell-set timing at the moment camFitSail actually ran) is the more likely remaining lead, not camFitCells itself.\n");
process.exit(fails ? 1 : 0);
