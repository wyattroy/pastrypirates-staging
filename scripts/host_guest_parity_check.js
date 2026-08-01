#!/usr/bin/env node
// scripts/host_guest_parity_check.js
//
// G26 (Wyatt-approved 2026-07-30) — THE HOST/GUEST PARITY GATE D-56 RECOMMENDED AND NOBODY WROTE.
//
// Mirrors scripts/ui_contract_check.js's structure exactly: shebang, a header naming what is gated
// and why, one PASS/FAIL line per assertion, every assertion run before exit so a single run
// reports every problem, named failures, and a `--drill` mode that proves each assertion CAN fail
// against synthetic fixtures under os.tmpdir(). Static source scan, no DOM — the same technique
// ui_contract_check.js and no_undef_check.js already use.
//
// ============================================================================
// Why this exists
// ============================================================================
// D-56's own words about the host and guest prompt renderers: they *"match by discipline, not by
// structure — nothing enforces it, and nothing would notice if they diverged tomorrow."* Four
// drifts later that prediction is the whole problem:
//
//   F7    prompt delivery leak      — gated, by ui_contract_check.js assertion 7
//   D-35  sail-prompt wording fork  — structurally safe (the guest renders the host's `msg`),
//                                     and the class vocabulary it travels in is gated HERE
//   D-55  sail-highlight rect drift — FIXED 2026-07-30 (G25, one shared builder), gated by
//                                     assertion 2 below
//   D-57  two narration schedulers  — still unenforced; recorded in
//                                     .planning/todos/pending/narration-two-schedulers-unenforced.md
//
// A drift is cheap to introduce (edit one renderer, forget the other) and expensive to find: every
// one of the four was discovered by a human staring at two browser windows. This gate makes the
// cheap half loud.
//
// ============================================================================
// The assertions
// ============================================================================
// 1. PROMPT CLASS VOCABULARY PARITY. The set of panel class tokens the HOST path emits
//    (localAsk, src/ui/flow.js) equals the set the GUEST path emits (watchPrompt's ask branch,
//    src/orchestrator.js). Fails NAMING the class present on one side and missing on the other —
//    that message is the whole value of the gate. Both sides satisfy this today; it exists so the
//    next edit to one cannot silently skip the other.
// 2. ONE SAIL-HIGHLIGHT BUILDER. In src/ui/flow.js exactly one rect builder carries the sailCell
//    class, both localPickCell and remotePickHighlights call the shared sailHighlightRect(), and
//    neither builds an el("rect" of its own. This is G25's fix, made permanent.
// 3. ONE RIM-SWEEP STEPPER (added by G14, in the same commit that ships the stepper — an assertion
//    whose subject does not exist yet either fails for an unrelated reason or is written loosely
//    enough to pass an empty tree). Exactly one rimSweepPath definition; src/orchestrator.js calls
//    the shared animateRimSweepIfAny() and contains NEITHER rimCellInfo NOR rimHead — i.e. the
//    guest tier does not reimplement the ring walk.
// 4. THE RIM SWEEP ARRIVES BEFORE IT SWEEPS, AND RESTORES THE GLIDE (2026-07-31). Assertion 3 pins
//    that ONE stepper exists and both tiers call it; it says nothing about whether that stepper
//    draws the right thing. It didn't. The sweep painted only squares AFTER the one the player
//    clicked, and did so in the same synchronous task as the board redraw that would have shown the
//    arrival — so the browser never painted the clicked square at all, and the sweep began with the
//    boat still rendered inland. With a 350ms glide re-aimed every 95ms the boat then took the
//    CHORD instead of the ARC, drifting diagonally across the middle of the board. Since both tiers
//    share the stepper, both tiers had it. Assertion 4 pins the two properties that fix it: the
//    sweep paints `from` AND YIELDS before its loop, and it retunes the glide AND restores it in a
//    `finally`. See `notes/trade winds animation bug.mov`.
//
//    EXTENDED the same day, after a SECOND recording (`notes/tradewinds jitter.mov`). The fix above
//    worked and still looked wrong — Wyatt: *"it works, technically, but it looks really jittery
//    because it's working exactly as we designed it."* Per-square stepping is a staircase no matter
//    how well the beat is tuned, so the sweep now interpolates along a spline (rimSweepCurve, whose
//    geometry is proven separately in scripts/narration_flow_test.js). Assertion 4 gained the two
//    properties that traversal must not lose, NEITHER of which is visible to a reader:
//      - progress derived from ELAPSED TIME, not a tick count — a counted chain cannot catch up
//        after a slow callback (src/ui/panel.js's typewriter learned this), and in a hidden tab,
//        where setTimeout is clamped to ~1s, it would crawl instead of completing.
//      - NOT requestAnimationFrame — rAF is FULLY SUSPENDED in a hidden tab, so an awaited rAF
//        loop never resolves and freezes the entire game loop the moment a player switches tabs.
//        Reproduced live 2026-07-31 while instrumenting the first bug.
// 5. THE ACTIVE RING MOVES IN LOCKSTEP WITH THE SHIP (2026-07-31, third recording). activeRing and
//    the ship are set to the SAME coordinates by the SAME calls, so they look incapable of drifting.
//    They drift on something neither call shows: the ship carries a css transition and the ring does
//    not, so the ring SNAPS to each target while the ship eases toward it and ends up permanently
//    AHEAD of the boat it marks. Same defect three times at shrinking amplitude — ~2 squares in the
//    original bug, a fraction of a square once the ship's own glide was fixed. Every instance was
//    caught by Wyatt from a recording and none was visible in review. See `notes/tradewinds v5.mov`.
//
// ============================================================================
// Comment stripping, and why it is not optional here
// ============================================================================
// Every assertion below runs against source with FULL-LINE leading comments removed (the same
// technique scripts/narration_flow_test.js uses). Without it, a renderer that MENTIONS `apDisabled`
// in a comment while no longer emitting it would pass — the exact vacuous check this project has
// caught three times in two days. Drill 1c pins that: a token present only in a comment must not
// count as emitted.

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REAL_ROOT = path.join(__dirname, "..");

const FLOW_REL = path.join("src", "ui", "flow.js");
const ORCH_REL = path.join("src", "orchestrator.js");
const BOARD_REL = path.join("src", "ui", "board.js");

const mk = (name) => ({ name, ok: true, failures: [], notes: [] });
const fail = (res, msg) => { res.ok = false; res.failures.push(msg); };
const note = (res, msg) => { res.notes.push(msg); };

const read = (root, rel) => {
  const full = path.join(root, rel);
  return fs.existsSync(full) ? fs.readFileSync(full, "utf8") : null;
};

// full-line leading comments only — a trailing `//` strip would eat the `https://` inside string
// literals, the same false-negative net_contract_check.js's header warns about
const stripComments = (src) => src.split("\n").filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join("\n");

// slice a named function's body: from its header to the next TOP-LEVEL `export ` (column 0), or to
// end of file. Located by CONTENT — never by line number — so a line shift makes this go loud
// rather than silently reading the wrong region.
function sliceFn(src, header) {
  const i = src.indexOf(header);
  if (i < 0) return null;
  const j = src.indexOf("\nexport ", i + header.length);
  return src.slice(i, j < 0 ? src.length : j);
}

/* ================= Assertion 1: prompt class vocabulary parity ================= */
// The panel class vocabulary both renderers draw from. Every token here is a class the action
// panel's CSS styles; a renderer that stops emitting one is rendering a materially different
// prompt from its twin. ` recipes` is the grid MODIFIER on .apBtns (a multi-column recipe layout),
// carried as its own token because it is emitted by a separate ternary on each side.
const PANEL_CLASS_VOCAB = ["apBack", "apMsg", "apBtns", "apBtn", "apDisabled", "apSub", " recipes"];

export function checkPromptClassParity(root) {
  const res = mk("assertion 1 — prompt class vocabulary parity (localAsk vs watchPrompt)");
  const flow = read(root, FLOW_REL);
  const orch = read(root, ORCH_REL);
  if (flow === null) { fail(res, `${FLOW_REL} is missing — the host prompt renderer has nothing to compare`); return res; }
  if (orch === null) { fail(res, `${ORCH_REL} is missing — the guest prompt renderer has nothing to compare`); return res; }

  const hostRegion = sliceFn(stripComments(flow), "export function localAsk(");
  const guestRegion = sliceFn(stripComments(orch), "export function watchPrompt(");
  if (!hostRegion) { fail(res, `localAsk() was not located in ${FLOW_REL} — if it was renamed, re-anchor this gate; do NOT delete the assertion`); return res; }
  if (!guestRegion) { fail(res, `watchPrompt() was not located in ${ORCH_REL} — if it was renamed, re-anchor this gate; do NOT delete the assertion`); return res; }

  const hostSet = new Set(PANEL_CLASS_VOCAB.filter((t) => hostRegion.includes(t)));
  const guestSet = new Set(PANEL_CLASS_VOCAB.filter((t) => guestRegion.includes(t)));

  for (const t of PANEL_CLASS_VOCAB) {
    const h = hostSet.has(t), g = guestSet.has(t);
    if (h && !g) fail(res, `PARITY-CLASS: the host prompt renderer (localAsk, ${FLOW_REL}) emits ${JSON.stringify(t)} and the guest renderer (watchPrompt, ${ORCH_REL}) does NOT — a guest seeing this prompt gets different markup from the host. Emit it on both sides, or remove it from both.`);
    if (g && !h) fail(res, `PARITY-CLASS: the guest prompt renderer (watchPrompt, ${ORCH_REL}) emits ${JSON.stringify(t)} and the host renderer (localAsk, ${FLOW_REL}) does NOT — a host seeing this prompt gets different markup from the guest. Emit it on both sides, or remove it from both.`);
  }
  note(res, `class vocabulary: ${hostSet.size} token(s) on the host, ${guestSet.size} on the guest, of ${PANEL_CLASS_VOCAB.length} in the vocabulary`);
  return res;
}

/* ================= Assertion 2: one sail-highlight builder ================= */
export function checkOneSailHighlightBuilder(root) {
  const res = mk("assertion 2 — one sail-highlight builder serves host and guest (D-55/G25)");
  const flow = read(root, FLOW_REL);
  if (flow === null) { fail(res, `${FLOW_REL} is missing`); return res; }
  const live = stripComments(flow);

  const builders = (live.match(/class:"sailCell"/g) || []).length;
  if (builders !== 1) {
    fail(res, `PARITY-SAILRECT: ${builders} rect builder(s) in ${FLOW_REL} carry class:"sailCell", expected exactly 1. Two builders is how D-55 happened — the guest's squares were a different orange, dimmer, unanimated and unhoverable for a whole phase. One builder, called by both paths.`);
  }
  if (!/export function sailHighlightRect\(/.test(live)) {
    fail(res, `PARITY-SAILRECT: the shared builder sailHighlightRect() is not exported from ${FLOW_REL} — without it there is nothing for the two pick paths to share.`);
  }
  for (const fn of ["localPickCell", "remotePickHighlights"]) {
    const body = sliceFn(live, `export function ${fn}(`);
    if (!body) { fail(res, `PARITY-SAILRECT: ${fn}() was not located in ${FLOW_REL} — re-anchor this gate rather than deleting the assertion.`); continue; }
    if (!/sailHighlightRect\(/.test(body)) fail(res, `PARITY-SAILRECT: ${fn}() does not call sailHighlightRect() — it is drawing its own sail squares, which is exactly the drift D-55 recorded.`);
    if (/el\("rect"/.test(body)) fail(res, `PARITY-SAILRECT: ${fn}() still builds an el("rect" of its own — move those attributes into sailHighlightRect() so there is one place that decides what a sail square looks like.`);
  }
  if (/fill:"#fdb63d"/.test(live)) {
    fail(res, `PARITY-SAILRECT: the guest's old #fdb63d fill survives in ${FLOW_REL} — the host's #ffc23a is the approved colour on both seats.`);
  }

  // GEOMETRY PARITY (added 2026-07-31, with UI-03's 10% shrink).
  //
  // Everything above proves the two paths call ONE builder. That is necessary and it is not
  // sufficient: same builder + different arguments is still two different squares on two screens.
  // A one-character edit — `sailHighlightRect(c,cellPx*0.9,svg)` in one caller — recreates D-55
  // exactly while every assertion above stays green. WR-13 already recorded that this gate is
  // symmetric-only; this closes that hole for the argument that decides SIZE.
  const calls = [];
  for (const fn of ["localPickCell", "remotePickHighlights"]) {
    const body = sliceFn(live, `export function ${fn}(`);
    if (!body) continue; // already failed loudly above
    const m = body.match(/sailHighlightRect\(([^)]*)\)/);
    if (!m) continue;    // already failed loudly above
    // normalise whitespace only — never the argument names themselves
    calls.push({ fn, args: m[1].replace(/\s+/g, "") });
    if (!/const\s+cellPx\s*=\s*boardCell\(\)/.test(body)) {
      fail(res, `PARITY-SAILRECT-GEOM: ${fn}() does not derive cellPx from boardCell() — both pick paths must size their squares from the same source, or host and guest render different-sized highlights from the same builder.`);
    }
  }
  if (calls.length === 2 && calls[0].args !== calls[1].args) {
    fail(res, `PARITY-SAILRECT-GEOM: the two pick paths pass DIFFERENT arguments to sailHighlightRect() — ${calls[0].fn}(${calls[0].args}) vs ${calls[1].fn}(${calls[1].args}). One shared builder does not help if it is fed different geometry.`);
  }

  // and the scale constant lives in exactly one place, so "10% smaller" cannot become two numbers
  const scaleDefs = (live.match(/const\s+SAIL_HL_SCALE\s*=/g) || []).length;
  if (scaleDefs !== 1) {
    fail(res, `PARITY-SAILRECT-GEOM: ${scaleDefs} definition(s) of SAIL_HL_SCALE in ${FLOW_REL}, expected exactly 1 — the highlight's size must be decided in one place for both seats.`);
  }

  note(res, `sail-highlight builders carrying the sailCell class: ${builders}; call sites agreeing on geometry: ${calls.length}`);
  return res;
}

/* ================= Assertion 3: one rim-sweep stepper ================= */
// Added by G14/T12. Written to be VACUOUS-PROOF: if the stepper does not exist yet, this fails
// loudly rather than passing because it found nothing to check.
export function checkOneRimSweepStepper(root) {
  const res = mk("assertion 3 — one rim-sweep stepper serves host and guest (G14)");
  const flow = read(root, FLOW_REL);
  const orch = read(root, ORCH_REL);
  if (flow === null) { fail(res, `${FLOW_REL} is missing`); return res; }
  if (orch === null) { fail(res, `${ORCH_REL} is missing`); return res; }
  const liveFlow = stripComments(flow), liveOrch = stripComments(orch);

  const defs = (liveFlow.match(/export function rimSweepPath\(/g) || []).length;
  if (defs !== 1) {
    fail(res, `PARITY-RIMSWEEP: ${defs} rimSweepPath definition(s) in ${FLOW_REL}, expected exactly 1. The rim walk is pure geometry over a static ring; two copies of it is two chances to disagree about where a ship goes.`);
  }
  if (!/animateRimSweepIfAny/.test(liveOrch)) {
    fail(res, `PARITY-RIMSWEEP: ${ORCH_REL} never calls animateRimSweepIfAny() — the guest is not driving the shared stepper, so a guest watching a trade-wind sweep sees the ship teleport while the host sees it travel.`);
  }
  for (const sym of ["rimCellInfo", "rimHead"]) {
    if (new RegExp(`\\b${sym}\\b`).test(liveOrch)) {
      fail(res, `PARITY-RIMSWEEP: ${ORCH_REL} reads ${sym} directly — the guest tier is reimplementing the rim walk instead of calling the one shared stepper. That is the fork this assertion exists to prevent.`);
    }
  }
  note(res, `rimSweepPath definitions: ${defs}; the guest tier drives the shared stepper`);
  return res;
}

// Added 2026-07-31 after a screen recording (`notes/trade winds animation bug.mov`) showed the
// sweep dragging the boat diagonally across the middle of the board instead of round the ring.
//
// The two properties below are invisible in code review — both look like ordinary paint calls, and
// the tree passed every other gate while the bug was live. What made it visible was that
// `activeRing` carries no css transition and so ran ~2 squares AHEAD of the boat, drawing the path
// the boat should have taken. Neither property can be asserted from the ring, so assert them from
// the source instead:
//
//   1. The sweep PAINTS `from` AND AWAITS before the loop. The await is the load-bearing half: it
//      is the yield that lets the browser paint the arrival at all. A paint with no await is
//      exactly the no-op that caused the bug — same task, overwritten before any pixel moved.
//   2. The sweep retunes the glide AND RESTORES IT. Failing to restore is worse than the original
//      bug: the ship keeps a ~86ms glide for the rest of the game, so every ordinary move snaps.
export function checkRimSweepArrivesAndRestores(root) {
  const res = mk("assertion 4 — the rim sweep arrives before it sweeps, and restores the glide (2026-07-31)");
  const flow = read(root, FLOW_REL);
  if (flow === null) { fail(res, `${FLOW_REL} is missing`); return res; }
  const live = stripComments(flow);

  // Isolate animateRimSweepIfAny's body by brace matching — a regex over the whole file would
  // happily match a paint in some unrelated function and report a green that means nothing.
  const start = live.indexOf("export async function animateRimSweepIfAny");
  if (start < 0) {
    fail(res, `PARITY-SWEEPARRIVE: animateRimSweepIfAny is not in ${FLOW_REL} at all. ANTI-VACUITY: this assertion fails rather than passing over an absent function.`);
    return res;
  }
  const open = live.indexOf("{", start);
  let depth = 0, end = -1;
  for (let i = open; i < live.length; i++) {
    if (live[i] === "{") depth++;
    else if (live[i] === "}") { depth--; if (depth === 0) { end = i; break; } }
  }
  if (end < 0) { fail(res, `PARITY-SWEEPARRIVE: could not brace-match animateRimSweepIfAny's body`); return res; }
  const body = live.slice(open, end);

  const loopAt = body.indexOf("rimSweepCurve(");
  if (loopAt < 0) { fail(res, `PARITY-SWEEPARRIVE: animateRimSweepIfAny no longer builds a rimSweepCurve — this assertion no longer describes the code and must be rewritten, not deleted.`); return res; }
  const beforeLoop = body.slice(0, loopAt);

  // 1. arrival: paint `from`, then YIELD, both before the loop
  if (!/paintShipAt\(\s*seat\s*,\s*from\s*\)/.test(beforeLoop)) {
    fail(res, `PARITY-SWEEPARRIVE: the sweep never paints the ship at \`from\` before its loop. The square the player clicked is then never drawn, and the sweep starts with the boat still rendered inland — the 2026-07-31 bug exactly.`);
  }
  if (!/await\s+sleep\(\s*RIM_SWEEP_ARRIVE_MS\s*\)/.test(beforeLoop)) {
    fail(res, `PARITY-SWEEPARRIVE: no \`await sleep(RIM_SWEEP_ARRIVE_MS)\` before the sweep loop. Painting \`from\` WITHOUT yielding is a no-op — the browser paints once per task, so the next paint overwrites it before any pixel moves. The await IS the fix; the paint alone is not.`);
  }

  // 2. the glide is retuned for the sweep, and restored afterwards
  if (!/setShipGlideMs\(\s*seat\s*,\s*RIM_SWEEP_TICK_MS\s*,\s*"linear"\s*\)/.test(body)) {
    fail(res, `PARITY-SWEEPARRIVE: the sweep does not set a one-tick LINEAR glide. Left at SHIP_GLIDE_MS the ship is re-aimed mid-glide and takes the chord instead of the arc; left eased, every individual tick eases in and out and the line shimmers.`);
  }

  // 3. progress is derived from ELAPSED TIME, and the loop is NOT rAF-driven.
  //    Both halves are load-bearing and neither is obvious to a reader:
  //      - a tick-counting loop cannot catch up after a slow callback (panel.js's typewriter lesson)
  //      - requestAnimationFrame is FULLY SUSPENDED in a hidden tab, so an awaited rAF loop hangs
  //        the whole game loop the moment a player switches tabs. Reproduced live 2026-07-31.
  if (!/Date\.now\(\)\s*-\s*began/.test(body)) {
    fail(res, `PARITY-SWEEPARRIVE: the sweep's progress is not derived from elapsed time (Date.now() - began). A tick-counting traversal cannot catch up after a slow callback, and in a hidden tab — where setTimeout is clamped to ~1s — it would crawl instead of completing.`);
  }
  // 3b. The traversal must delegate its position maths to the SHARED pure functions, because
  //     scripts/rim_sweep_trace_test.js measures the animation by calling those same two functions.
  //     If the live loop ever computes positions inline again, that harness silently becomes a test
  //     of a parallel implementation — green while the real animation does something else entirely.
  for (const fn of ["rimSweepDurationMs", "rimSweepPointAt"]) {
    if (!new RegExp(`${fn}\\(`).test(body)) {
      fail(res, `PARITY-SWEEPARRIVE: the sweep no longer calls ${fn}(). scripts/rim_sweep_trace_test.js measures the animation THROUGH that function; computing it inline here leaves the harness measuring a copy and passing while the real motion drifts.`);
    }
  }
  if (/requestAnimationFrame/.test(body)) {
    fail(res, `PARITY-SWEEPARRIVE: the sweep is driven by requestAnimationFrame. rAF callbacks are FULLY SUSPENDED (not throttled) in a hidden tab, so this awaited loop would never resolve and would freeze the entire game loop the moment a player switched tabs — the same trap src/ui/panel.js:334 documents for the typewriter.`);
  }
  if (!/setShipGlideMs\(\s*seat\s*,\s*null\s*\)/.test(body)) {
    fail(res, `PARITY-SWEEPARRIVE: the sweep never restores the glide via setShipGlideMs(seat,null). The ship would keep the short sweep glide for the REST OF THE GAME, making every ordinary move snap instead of glide.`);
  }
  const fin = body.lastIndexOf("finally");
  if (fin < 0 || !/setShipGlideMs\(\s*seat\s*,\s*null\s*\)/.test(body.slice(fin))) {
    fail(res, `PARITY-SWEEPARRIVE: the glide restore is not inside the \`finally\`. A turn expiry or a thrown paint mid-sweep would then strand the ship on the short glide permanently.`);
  }
  note(res, `sweep arrives at \`from\` and yields before stepping; glide retuned and restored in finally`);
  return res;
}


/* ========== Assertion 5: the active ring moves in lockstep with the ship it marks ========== */
// Added 2026-07-31 after the THIRD recording of this animation (`notes/tradewinds v5.mov`).
//
// activeRing (the white sonar ripple) and the ship are moved to the SAME coordinates by the SAME
// calls, so they look like they cannot drift. They drift because of something neither call shows:
// the ship carries a css `transition` and the ring does not, so the ring SNAPS to each target while
// the ship eases toward it. The ring therefore sits permanently AHEAD of the boat it is marking.
//
// This is the same defect three times over, at shrinking amplitude: ~2 squares in the original bug
// (where the ring's lead is what made the diagnosis possible at all), then a fraction of a square
// once the ship's glide was fixed — small, but by then the only thing on the board moving out of
// step. Wyatt caught every one of them from a recording; none was visible in review.
//
// So: whenever setShipGlideMs retunes a ship it must retune that ship's ring too, and restoring must
// restore BOTH. The restore half matters independently — a ring left with a transition would slide
// across the whole board when the turn passes to another captain, instead of appearing on them.
export function checkRingMovesWithShip(root) {
  const res = mk("assertion 5 — the active ring is retuned and restored with the ship it marks (2026-07-31)");
  const board = read(root, BOARD_REL);
  if (board === null) { fail(res, `${BOARD_REL} is missing`); return res; }
  const live = stripComments(board);

  const fn = sliceFn(live, "export function setShipGlideMs(");
  if (!fn) {
    fail(res, `PARITY-RING: setShipGlideMs is not in ${BOARD_REL} at all. ANTI-VACUITY: this assertion fails rather than passing over an absent function.`);
    return res;
  }
  if (!/activeRing/.test(fn)) {
    fail(res, `PARITY-RING: setShipGlideMs retunes the ship's glide but never touches activeRing. The ring has no transition of its own, so it SNAPS to each target while the ship eases toward it — the ripple ends up permanently ahead of the boat it marks. Retune both, or neither.`);
    return res;
  }
  // the restore branch must clear the ring's transition, not merely set some duration on it
  if (!/activeRing\.style\.transition\s*=\s*ms\s*==\s*null\s*\?\s*""/.test(fn)) {
    fail(res, `PARITY-RING: setShipGlideMs does not RESTORE activeRing's transition to "" when ms is null. A ring left carrying a transition slides right across the board from one captain's boat to the next when the turn passes, instead of simply appearing on them.`);
  }
  // and it must only ever move the ring belonging to the seat being retuned
  if (!/activeTurnSeat\(\)\s*===\s*seat/.test(fn)) {
    fail(res, `PARITY-RING: setShipGlideMs changes activeRing without checking activeTurnSeat() === seat — it would retune the ring while it is marking a DIFFERENT captain's boat.`);
  }
  note(res, `setShipGlideMs retunes and restores activeRing alongside the ship, scoped to the active seat`);
  return res;
}

/* ================= Runner ================= */
function runAll(root, { quiet = false } = {}) {
  const log = quiet ? () => {} : (...args) => console.log(...args);
  const results = [];

  const a1 = checkPromptClassParity(root);
  log(`${a1.ok ? "PASS" : "FAIL"} ${a1.name}`);
  for (const n of a1.notes) log(`      ${n}`);
  results.push(a1);

  const a2 = checkOneSailHighlightBuilder(root);
  log(`${a2.ok ? "PASS" : "FAIL"} ${a2.name}`);
  for (const n of a2.notes) log(`      ${n}`);
  results.push(a2);

  const a3 = checkOneRimSweepStepper(root);
  log(`${a3.ok ? "PASS" : "FAIL"} ${a3.name}`);
  for (const n of a3.notes) log(`      ${n}`);
  results.push(a3);

  const a4 = checkRimSweepArrivesAndRestores(root);
  log(`${a4.ok ? "PASS" : "FAIL"} ${a4.name}`);
  for (const n of a4.notes) log(`      ${n}`);
  results.push(a4);

  const a5 = checkRingMovesWithShip(root);
  log(`${a5.ok ? "PASS" : "FAIL"} ${a5.name}`);
  for (const n of a5.notes) log(`      ${n}`);
  results.push(a5);

  return results;
}

/* ================= --drill: prove each assertion CAN fail ================= */
// Builds a disposable fixture tree under os.tmpdir(), one synthetic violation at a time, runs the
// SAME check function against it, and asserts the result is FAIL. Never touches the real src/.
// Exits 1 if any assertion fails to demonstrate a FAIL against its own synthetic violation — that
// would mean the check is broken, not that the tree is clean.
function drill() {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pp-parity-drill-"));
  let allOk = true;

  const fixture = (rel, content) => {
    const full = path.join(tmpRoot, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content);
  };
  const resetFixture = () => {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
    fs.mkdirSync(tmpRoot, { recursive: true });
  };
  const expect = (label, r, wantFail, marker) => {
    const ok = wantFail
      ? (!r.ok && (!marker || r.failures.some((f) => f.includes(marker))))
      : r.ok;
    console.log(`${ok ? "PASS" : "FAIL"} ${label} — expected ${wantFail ? "FAIL" : "PASS"}${marker ? ` naming ${marker}` : ""}, got ${r.ok ? "PASS" : "FAIL"}`);
    for (const f of r.failures) console.log(`    ${f}`);
    if (!ok) allOk = false;
  };

  // --- a well-formed pair, used as the base for the positive controls ---
  const GOOD_HOST_ASK = [
    `export function localAsk(msg,opts,colors,sub){`,
    `  const backHtml=backIdx!==-1?\`<button class="apBack" data-i="\${backIdx}">‹</button>\`:"";`,
    `  const subHtml=sub?\`<div class="apSub">\${sub}</div>\`:"";`,
    `  const grid=rest.some(x=>x.o.cls)?" recipes":"";`,
    `  panel(\`\${backHtml}<div class="apMsg">\${msg}</div><div class="apBtns\${grid}">\`+`,
    `    rest.map(x=>\`<button class="apBtn \${x.o.cls||""}\${x.o.disabled?" apDisabled":""}">\${x.o.label}</button>\`).join("")+\`</div>\${subHtml}\`,true);`,
    `}`,
    ``,
  ].join("\n");
  const GOOD_GUEST_ASK = [
    `export function watchPrompt(){`,
    `  const backHtml=backIdx>=0?\`<button class="apBack" data-i="\${backIdx}">‹</button>\`:"";`,
    `  const subHtml=p.sub?\`<div class="apSub">\${p.sub}</div>\`:"";`,
    `  const grid=cls.some(c=>c)?" recipes":"";`,
    `  panel(\`\${backHtml}<div class="apMsg">\${p.msg}</div><div class="apBtns\${grid}">\`+`,
    `    rest.map(x=>\`<button class="apBtn \${cls[x.i]||""}\${dis[x.i]?" apDisabled":""}">\${x.l}</button>\`).join("")+\`</div>\${subHtml}\`,true);`,
    `}`,
    ``,
  ].join("\n");

  // 1a: the guest branch stops emitting apDisabled — a greyed option renders ungreyed on a guest
  resetFixture();
  fixture(FLOW_REL, GOOD_HOST_ASK);
  fixture(ORCH_REL, GOOD_GUEST_ASK.replace(`\${dis[x.i]?" apDisabled":""}`, ""));
  expect("drill 1a (guest renderer drops apDisabled)", checkPromptClassParity(tmpRoot), true, "apDisabled");

  // 1b: the HOST side drops one instead — the gate must be symmetric, or half the drifts sail past
  resetFixture();
  fixture(FLOW_REL, GOOD_HOST_ASK.replace(`const subHtml=sub?\`<div class="apSub">\${sub}</div>\`:"";`, `const subHtml="";`));
  fixture(ORCH_REL, GOOD_GUEST_ASK);
  expect("drill 1b (HOST renderer drops apSub — the gate is symmetric)", checkPromptClassParity(tmpRoot), true, "apSub");

  // 1c: a token present ONLY in a comment must NOT count as emitted. This is the anti-vacuity
  //     control: without comment stripping, a renderer that merely TALKS about apDisabled passes.
  resetFixture();
  fixture(FLOW_REL, GOOD_HOST_ASK);
  fixture(ORCH_REL, GOOD_GUEST_ASK.replace(`\${dis[x.i]?" apDisabled":""}`, "") .replace("export function watchPrompt(){", "// this renderer used to emit apDisabled\nexport function watchPrompt(){"));
  expect("drill 1c (a class named only in a COMMENT does not count as emitted)", checkPromptClassParity(tmpRoot), true, "apDisabled");

  // 1d: negative control — a matched pair passes, so 1a-1c fail for the right reason
  resetFixture();
  fixture(FLOW_REL, GOOD_HOST_ASK);
  fixture(ORCH_REL, GOOD_GUEST_ASK);
  expect("drill 1d (negative control — a matched pair passes)", checkPromptClassParity(tmpRoot), false);

  // --- assertion 2 fixtures ---
  const GOOD_PICK = [
    // PRE-EXISTING FIXTURE BUG, found 2026-07-31 while merging: Phase 16 added the
    // PARITY-SAILRECT-GEOM sub-check (one SAIL_HL_SCALE definition) to assertion 2 but did not add
    // the constant to this negative-control fixture, so drill 2c has been failing against a tree it
    // is supposed to approve. The assertion itself is fine — the REAL flow.js passes it — but a
    // negative control that cannot go green is exactly as broken as an assertion that cannot go red,
    // and it makes `--drill` report DRILL FAILURE for a healthy tree.
    `const SAIL_HL_SCALE=0.9;`,
    `export function sailHighlightRect(c,cellPx,svg){`,
    `  return el("rect",{x:c[0]*cellPx+2,rx:6,fill:"#ffc23a",class:"sailCell"},svg);`,
    `}`,
    `export function localPickCell(p,cells){`,
    `  const cellPx=boardCell();`,
    `  cells.forEach(c=>{const r=sailHighlightRect(c,cellPx,svg);hs.push(r);});`,
    `}`,
    `export function remotePickHighlights(cells,promptId,msg){`,
    `  const cellPx=boardCell();`,
    `  for(const c of cells){const r=sailHighlightRect(c,cellPx,svg);hs.push(r);}`,
    `}`,
    ``,
  ].join("\n");

  // 2a: the guest path builds its own class-less rect again — D-55, exactly as it was
  resetFixture();
  fixture(FLOW_REL, GOOD_PICK.replace(
    `  for(const c of cells){const r=sailHighlightRect(c,cellPx,svg);hs.push(r);}`,
    `  for(const c of cells){const r=el("rect",{rx:5,fill:"#fdb63d",opacity:.4},svg);hs.push(r);}`));
  expect("drill 2a (guest rebuilds its own class-less rect — D-55 reintroduced)", checkOneSailHighlightBuilder(tmpRoot), true, "PARITY-SAILRECT");

  // 2b: two builders both carry the class — the "match by discipline" state D-56 warned about
  resetFixture();
  fixture(FLOW_REL, GOOD_PICK.replace(
    `  for(const c of cells){const r=sailHighlightRect(c,cellPx,svg);hs.push(r);}`,
    `  for(const c of cells){const r=el("rect",{rx:6,fill:"#ffc23a",class:"sailCell"},svg);hs.push(r);}`));
  expect("drill 2b (two builders carry the class — matching by discipline, not structure)", checkOneSailHighlightBuilder(tmpRoot), true, "expected exactly 1");

  // 2c: negative control
  resetFixture();
  fixture(FLOW_REL, GOOD_PICK);
  expect("drill 2c (negative control — one builder, both callers)", checkOneSailHighlightBuilder(tmpRoot), false);

  // --- assertion 3 fixtures ---
  const GOOD_SWEEP_FLOW = `export function rimSweepPath(game,from){return [];}\nexport async function animateRimSweepIfAny(){}\n`;
  const GOOD_SWEEP_ORCH = `export function watchEvents(){ await animateRimSweepIfAny(); render(); }\n`;

  // 3a: the guest walks the ring itself instead of calling the shared stepper
  resetFixture();
  fixture(FLOW_REL, GOOD_SWEEP_FLOW);
  fixture(ORCH_REL, `export function watchEvents(){ const ring=appState.game.rimCellInfo; await animateRimSweepIfAny(); render(); }\n`);
  expect("drill 3a (guest reimplements the ring walk via rimCellInfo)", checkOneRimSweepStepper(tmpRoot), true, "rimCellInfo");

  // 3b: the guest never calls the stepper at all — the ship teleports on one seat and travels on the other
  resetFixture();
  fixture(FLOW_REL, GOOD_SWEEP_FLOW);
  fixture(ORCH_REL, `export function watchEvents(){ render(); }\n`);
  expect("drill 3b (guest never drives the shared stepper)", checkOneRimSweepStepper(tmpRoot), true, "animateRimSweepIfAny");

  // 3c: ANTI-VACUITY — the stepper does not exist. The assertion must FAIL, not pass because it
  //     found nothing to check. This is the form of vacuous check this project has caught three
  //     times in two days.
  resetFixture();
  fixture(FLOW_REL, `export function localPickCell(){}\n`);
  fixture(ORCH_REL, `export function watchEvents(){ render(); }\n`);
  expect("drill 3c (anti-vacuity — no stepper at all must FAIL, not silently pass)", checkOneRimSweepStepper(tmpRoot), true, "expected exactly 1");

  // 3d: negative control
  resetFixture();
  fixture(FLOW_REL, GOOD_SWEEP_FLOW);
  fixture(ORCH_REL, GOOD_SWEEP_ORCH);
  expect("drill 3d (negative control — one stepper, guest drives it)", checkOneRimSweepStepper(tmpRoot), false);

  // --- assertion 4 fixtures ---
  // 4a: THE REAL PRE-FIX SHAPE. Not invented — this is the body as it stood at 1ac3d10, the code
  //     the recording was made against. An assertion that cannot fail against the actual bug it
  //     was written for is decoration.
  const PREFIX_SWEEP = `export async function animateRimSweepIfAny(){
  const curve=rimSweepCurve([from,...path]);
  try{
    for(const c of path){
      paintShipAt(seat,c);
      await sleep(RIM_SWEEP_STEP_MS);
    }
  }finally{
    paintShipAt(seat,to);
  }
}\n`;
  resetFixture();
  fixture(FLOW_REL, PREFIX_SWEEP);
  expect("drill 4a (THE REAL PRE-FIX CODE — no arrival, no glide retune)", checkRimSweepArrivesAndRestores(tmpRoot), true, "never paints the ship at `from`");

  // 4b: paints the arrival but does NOT yield — the subtle version, and the one most likely to be
  //     written by someone "fixing" this from the summary alone. Must still FAIL.
  resetFixture();
  fixture(FLOW_REL, PREFIX_SWEEP.replace("  try{", "  try{\n    paintShipAt(seat,from);"));
  expect("drill 4b (paints the arrival but never yields — still invisible)", checkRimSweepArrivesAndRestores(tmpRoot), true, "WITHOUT yielding is a no-op");

  // 4c: retunes the glide but never restores it — every later move snaps for the rest of the game
  resetFixture();
  fixture(FLOW_REL, `export async function animateRimSweepIfAny(){
  try{
    paintShipAt(seat,from);
    await sleep(RIM_SWEEP_ARRIVE_MS);
    const curve=rimSweepCurve([from,...path]);
    setShipGlideMs(seat,RIM_SWEEP_TICK_MS,"linear");
    for(;;){ const t=Math.min(1,(Date.now()-began)/total); paintShipAtPoint(seat,0,0); if(t>=1)break; await sleep(RIM_SWEEP_TICK_MS); }
  }finally{ paintShipAt(seat,to); }
}\n`);
  expect("drill 4c (glide retuned but never restored)", checkRimSweepArrivesAndRestores(tmpRoot), true, "never restores the glide");

  // 4e: rAF-driven traversal — looks smoother, hangs the game loop dead in a hidden tab. Must FAIL.
  resetFixture();
  fixture(FLOW_REL, `export async function animateRimSweepIfAny(){
  try{
    paintShipAt(seat,from);
    await sleep(RIM_SWEEP_ARRIVE_MS);
    const curve=rimSweepCurve([from,...path]);
    setShipGlideMs(seat,RIM_SWEEP_TICK_MS,"linear");
    await new Promise(done=>{ const step=()=>{ const t=Math.min(1,(Date.now()-began)/total); paintShipAtPoint(seat,0,0); if(t>=1)return done(); requestAnimationFrame(step); }; requestAnimationFrame(step); });
  }finally{ setShipGlideMs(seat,null); paintShipAt(seat,to); }
}\n`);
  expect("drill 4e (rAF-driven traversal — hangs the game loop in a hidden tab)", checkRimSweepArrivesAndRestores(tmpRoot), true, "FULLY SUSPENDED");

  // 4f: tick-counting instead of elapsed time — cannot catch up, crawls when throttled. Must FAIL.
  resetFixture();
  fixture(FLOW_REL, `export async function animateRimSweepIfAny(){
  try{
    paintShipAt(seat,from);
    await sleep(RIM_SWEEP_ARRIVE_MS);
    const curve=rimSweepCurve([from,...path]);
    setShipGlideMs(seat,RIM_SWEEP_TICK_MS,"linear");
    for(let k=0;k<=STEPS;k++){ paintShipAtPoint(seat,0,0); await sleep(RIM_SWEEP_TICK_MS); }
  }finally{ setShipGlideMs(seat,null); paintShipAt(seat,to); }
}\n`);
  expect("drill 4f (tick-counted, not elapsed-time — crawls when throttled)", checkRimSweepArrivesAndRestores(tmpRoot), true, "not derived from elapsed time");

  // 4g: computes positions inline instead of via the shared pure functions. The trace harness
  //     would then be measuring a copy — green while the real animation drifts. Must FAIL.
  resetFixture();
  fixture(FLOW_REL, `export async function animateRimSweepIfAny(){
  try{
    paintShipAt(seat,from);
    await sleep(RIM_SWEEP_ARRIVE_MS);
    const curve=rimSweepCurve([from,...path]);
    const total=Math.min(RIM_SWEEP_MAX_MS,Math.max(RIM_SWEEP_MIN_MS,RIM_SWEEP_MS_PER_CELL*path.length));
    setShipGlideMs(seat,RIM_SWEEP_TICK_MS,"linear");
    for(;;){ const t=Math.min(1,(Date.now()-began)/total); const u=t*(curve.length-1); paintShipAtPoint(seat,curve[0][0],curve[0][1]); if(t>=1)break; await sleep(RIM_SWEEP_TICK_MS); }
  }finally{ setShipGlideMs(seat,null); paintShipAt(seat,to); }
}\n`);
  expect("drill 4g (position maths inlined — trace harness would measure a copy)", checkRimSweepArrivesAndRestores(tmpRoot), true, "no longer calls rimSweepDurationMs");

  // 4d: ANTI-VACUITY — the function is gone entirely. Must FAIL, not pass over an absent body.
  resetFixture();
  fixture(FLOW_REL, `export function rimSweepPath(){}\n`);
  expect("drill 4d (anti-vacuity — no animateRimSweepIfAny at all must FAIL)", checkRimSweepArrivesAndRestores(tmpRoot), true, "not in");

  // --- assertion 5 fixtures ---
  const GOOD_RING = `export function setShipGlideMs(seat,ms,ease){
  const css=\`transform \${shipGlideCss(ms==null?SHIP_GLIDE_MS:ms,ms==null?null:ease)}\`;
  shipEls[seat].style.transition=css;
  if(activeRing&&activeTurnSeat()===seat)activeRing.style.transition=ms==null?"":css;
}
`;
  // 5a: THE REAL PRE-FIX SHAPE — the ship is retuned, the ring is not, so the ring runs ahead
  resetFixture();
  fixture(BOARD_REL, `export function setShipGlideMs(seat,ms,ease){
  shipEls[seat].style.transition=\`transform \${shipGlideCss(ms==null?SHIP_GLIDE_MS:ms,ms==null?null:ease)}\`;
}
`);
  expect("drill 5a (THE REAL PRE-FIX CODE — ship retuned, ring left snapping)", checkRingMovesWithShip(tmpRoot), true, "never touches activeRing");

  // 5b: retunes the ring but never restores it — the ring then slides across the board on turn change
  resetFixture();
  fixture(BOARD_REL, `export function setShipGlideMs(seat,ms,ease){
  const css="transform 16ms linear";
  shipEls[seat].style.transition=css;
  if(activeRing&&activeTurnSeat()===seat)activeRing.style.transition=css;
}
`);
  expect("drill 5b (ring retuned but never restored — slides across the board on turn change)", checkRingMovesWithShip(tmpRoot), true, "does not RESTORE");

  // 5c: ANTI-VACUITY — no setShipGlideMs at all must FAIL, not pass over an absent function
  resetFixture();
  fixture(BOARD_REL, `export function paintShipAt(){}\n`);
  expect("drill 5c (anti-vacuity — no setShipGlideMs at all must FAIL)", checkRingMovesWithShip(tmpRoot), true, "not in");

  // 5d: negative control
  resetFixture();
  fixture(BOARD_REL, GOOD_RING);
  expect("drill 5d (negative control — ring retuned and restored with the ship)", checkRingMovesWithShip(tmpRoot), false);

  // --- final negative control: the REAL tree passes every assertion, which is what proves the
  //     fixes and the gate agree ---
  {
    const r = runAll(REAL_ROOT, { quiet: true });
    const ok = r.every((x) => x.ok);
    console.log(`${ok ? "PASS" : "FAIL"} drill Z (negative control — the REAL tree passes all five) — expected PASS, got ${ok ? "PASS" : "FAIL"}`);
    for (const x of r) for (const f of x.failures) console.log(`    ${f}`);
    if (!ok) allOk = false;
  }

  fs.rmSync(tmpRoot, { recursive: true, force: true });
  console.log(`\n${allOk ? "ALL 5 ASSERTIONS RED-PROOF DRILLED OK" : "DRILL FAILURE — an assertion did not fail against its own synthetic violation"}`);
  process.exit(allOk ? 0 : 1);
}

/* ================= Entry ================= */
// Guarded on being the MAIN module. The check functions are exported so a one-off red-proof can
// run them against an arbitrary tree (e.g. `git show <sha>:src/ui/flow.js` written to a temp root,
// which is how assertion 2 was proven to fail against the pre-G25 tree). Without this guard the
// entry block runs on IMPORT and process.exit()s before the caller's own code does, which silently
// prints this gate's own verdict and looks like the caller's result — a false red-proof.
const IS_MAIN = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (!IS_MAIN) {
  // imported for reuse — nothing runs
} else if (process.argv.includes("--drill")) {
  drill();
} else {
  const results = runAll(REAL_ROOT);
  const failed = results.filter((r) => !r.ok);
  if (failed.length) {
    console.error("\nFAILURES:");
    for (const r of failed) for (const f of r.failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  process.exit(0);
}
