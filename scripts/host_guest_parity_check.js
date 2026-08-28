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
// 6. ORCHESTRATION PARITY (02.15-01, D-28 — Wyatt's pick, 2026-08-20). Assertions 1-5 all pin
//    MARKUP. None of them can see WHO CALLS a renderer, and that is where the fault actually
//    lives: the host's screen is driven by the game loop, a guest's by nine Firebase listeners,
//    and the renderers are shared while the ORCHESTRATION is not. Assertion 6 fails NAMING any
//    renderer the host's loop drives that no listener can reach. Declared gaps are explicit and
//    carry the stage that closes each; --strict ignores them and asserts the rule in full.
//
// ============================================================================
// THE TREE THIS GATE SCANS — read before trusting a green run
// ============================================================================
// Until 2026-08-20 this file scanned ONLY the repo root's src/ — the v1 game, which has had no
// code commit since 2026-08-02 and which nobody is developing. `4/` is the game being built, and
// every host/guest drift of the last month happened there, unwatched, while this gate reported
// green. *A gate aimed at the wrong tree is not silent, it is reassuring* (HARD-WON-LESSONS §3).
//
// A bare run still scans the root tree, unchanged, so the existing npm test wiring is untouched.
// Pass `--tree=4` for the game under development. See pickTreeHere() at the foot of this file,
// which now defers to the SHARED selector scripts/lib/pick_tree.js.
//
// ============================================================================
// 2026-08-23 (03-01 Task 3, TEST-05 + TEST-06) — THE TRAINING WHEELS ARE OFF
// ============================================================================
// `npm test` now runs BOTH aims, and the 4/ aim runs WITHOUT `--report`. A host/guest parity break
// in the game under development FAILS THE BUILD. That is what TEST-06 asked for and what the
// measured block below was blocking.
//
// Assertions 2 and 4 were red against 4/ for reasons that had nothing to do with parity — the
// subjects had been RENAMED and MOVED, not forked — so they were re-anchored to 4/'s own code.
// Neither was weakened; both gained a drill proving the re-anchored form can still go red
// (2d/2e, 4h/4i/4j), and assertion 4 gained a property it could not have had before the tree it
// describes split its guard from its ride: EXACTLY ONE RIDE.
//
// WHAT DID NOT CHANGE, deliberately, and it is the easiest wrong thing to do in this file:
// ASSERTION 6'S DECLARED GAP IS STILL DECLARED. `localAsk` is still named as an open fork, which
// is 02.15's D-04 safe stop, recorded on purpose. Green on assertion 6 means "NO WORSE THAN
// DECLARED", never "converted". Widening the declaration to buy a full green would convert an
// honest partial into a lie — 02.15-VERIFICATION.md says outright that it was not widened then,
// and it was not widened now.
//
// AND WHAT THIS GATE STILL CANNOT SEE, stated so a green is not over-read: whether the host's
// sentence and the guest's sentence READ THE SAME has no automated check here or anywhere else in
// the repo. Every assertion below is markup, call graph or orchestration. Content parity is
// rule 19's two-tab pass, and this task did not change that.
//
// MEASURED THE DAY THE SELECTOR LANDED (2026-08-20), kept because it is the before-picture:
//   assertion 1 against 4/  — ALREADY GREEN (6 tokens each side). 02.1-03 unified the button
//                             builder, so the markup vocabulary genuinely does match. THE RE-AIM
//                             ALONE PROVES NOTHING; assertion 6 is what was red.
//   assertion 2 against 4/  — FAIL. `class:"sailCell"` is not built in src/ui/flow.js at all;
//                             the subject moved or was renamed. NOT a Group A regression.
//   assertion 3 against 4/  — PASS.
//   assertion 4 against 4/  — FAIL. animateRimSweepIfAny no longer builds a rimSweepCurve in 4/.
//                             NOT a Group A regression.
//   assertion 5 against 4/  — PASS.
//   assertion 6 against 4/  — FAIL (--strict), naming flash, setActor and localAsk as driven by
//                             the host's loop and reachable from ZERO of the nine listeners.
// BOTH OF THOSE ARE NOW GREEN AND BLOCKING — re-anchored 2026-08-23, see the section above. The
// re-anchor moved the ASSERTIONS onto 4/'s code; it did not move 4/'s code onto the assertions.
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
import { pickTree, treeLine, REPO_ROOT } from "./lib/pick_tree.js";
import { stripCommentSegments } from "./lib/js_region_tokenizer.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REAL_ROOT = REPO_ROOT;

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

// Comments are blanked before every assertion below — a renderer that MENTIONS `apDisabled` in a
// comment while no longer emitting it must not pass. Drill 1c pins exactly that.
//
// NEVER a trailing `//`-to-end-of-line strip: it would eat the `//` inside `https://` string
// literals, the false negative net_contract_check.js's header is a whole section about.
//
// CONVERGED 03-01 Task 2. This was a private line-filter here — the first of what would have been
// three copies by the end of the night (net and wind-dot both needed it). Three definitions of
// "what is a comment" is three chances to disagree, so there is now ONE, in the shared tokenizer,
// and it is STRONGER than what it replaced: classify()-backed, so it blanks the interior of a
// `/* ... */` block (which a line filter cannot see — that miss is what left two false NO-APP-STATE
// findings standing in src/net/writers.js) and it preserves every byte, so offsets, brace
// matching and line numbers are all unchanged. The full --drill suite passes unchanged.
const stripComments = stripCommentSegments;

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

  /* RE-ANCHORED 03-01 Task 3 (TEST-06) — THE SUBJECT EXISTS; THE SPELLING MOVED.
     This counted `class:"sailCell"` only, which is how the ROOT tree writes it: an attribute-object
     key handed to el("rect",{...}). `4/` builds the square as an HTML div instead — playtest 20,
     because UI-06's bounce animates transform:scale and on an SVG element that forces a full layout
     every frame (measured: 60.1 layouts/sec from the transform alone, zero from the opacity) — so
     src/ui/flow.js:513 sets the class as a DOM PROPERTY, `d.className="sailCell"`.

     The gate therefore found ZERO builders in the game we actually ship and reported "expected 1"
     — a false alarm about the most load-bearing rule it guards, and the kind that gets a gate
     ignored. It was NOT a drift: there is exactly one builder in 4/, written a different way.

     So: count builders that apply the class by EITHER SPELLING, and keep the assertion at exactly
     one. What the assertion protects is completely unchanged, and its reason for existing is
     restated in the failure text below because that sentence is the whole value of the gate.

     Deliberately NOT a bare /sailCell/ grep. That would also match `.sailCells(` (a __pp4 test
     hook), the class name inside a comment, and any future `classList.contains("sailCell")` READ —
     none of which builds anything. A reader is not a builder, and a gate that cannot tell them
     apart counts wrong in the direction that fakes a green. */
  const SAIL_BUILDER_SPELLINGS = [
    /class:\s*"sailCell"/g,                       // attribute-object key — el("rect",{class:"sailCell"}) (root)
    /\.className\s*=\s*"sailCell"/g,              // DOM property — d.className="sailCell" (4/)
    /\.classList\.add\(\s*"sailCell"\s*\)/g,      // DOM method — the third way to write the same thing
  ];
  const builders = SAIL_BUILDER_SPELLINGS.reduce((n, re) => n + (live.match(re) || []).length, 0);
  if (builders !== 1) {
    fail(res, `PARITY-SAILRECT: ${builders} builder(s) in ${FLOW_REL} apply the sailCell class (counted across all three spellings: class:"sailCell", .className="sailCell", .classList.add("sailCell")), expected exactly 1. Two builders is how D-55 happened — the guest's squares were a different orange, dimmer, unanimated and unhoverable for a whole phase. One builder, called by both paths.`);
  }
  if (!/export function sailHighlightRect\(/.test(live)) {
    fail(res, `PARITY-SAILRECT: the shared builder sailHighlightRect() is not exported from ${FLOW_REL} — without it there is nothing for the two pick paths to share.`);
  }
  /* 02.15-02 Task 3, RE-ANCHORED (THE TRACER) — 4/ ONLY. `localPickCell` and `remotePickHighlights`
     used to be the two ORCHESTRATIONS that each called sailHighlightRect() — the host's game loop
     and a guest's watchPrompt listener. THE TRACER converged them into ONE renderer,
     renderPickPrompt(), named directly by both `localPickCell` (the local response mechanism) and
     `watchPrompt`'s pick branch. With one renderer there is NOTHING LEFT TO COMPARE — a two-name
     comparison would pass vacuously forever the instant the second name stopped existing, which is
     precisely the reassuring-gate failure this phase exists to kill (T-02.15-06). Replaced with a
     COUNT: exactly one function calls sailHighlightRect(, and it is renderPickPrompt. A synthetic
     tree where a SECOND caller reappears must go RED — see drill 2a/2b below, and the count must go
     UP, not stay flat, or this re-anchor weakened the gate rather than strengthening it.

     DUAL-MODE, DELIBERATELY — NOT a re-widening. This script scans TWO DIFFERENT TREES (the
     tree-selector, D-28): the root game (`src/`, unmodified since 2026-08-02, still on the
     PRE-CONVERGENCE two-orchestration shape) and `4/` (converged by this task). Hardcoding
     `renderPickPrompt` as the only acceptable shape would fail assertion 2 against the ROOT tree —
     which this script is wired into root `npm test` FOR — for a reason that has nothing to do with
     any drift on that tree. That is the exact "gate red for reasons unrelated to what it measures"
     failure this file's own header warns against (§ "THE TREE THIS GATE SCANS"). So: detect which
     shape the scanned tree is actually in, and apply the check that shape earns. This is not two
     things kept in sync by discipline — it is one script correctly describing two different,
     internally-consistent trees, exactly as ORCHESTRATION_DECL's `--tree=4` selector already does. */
  const converged = /export function renderPickPrompt\(/.test(live);
  if (converged) {
    const body = sliceFn(live, `export function renderPickPrompt(`);
    if (!body) {
      fail(res, `PARITY-SAILRECT: renderPickPrompt() was not located in ${FLOW_REL} — re-anchor this gate rather than deleting the assertion.`);
    } else {
      if (!/sailHighlightRect\(/.test(body)) fail(res, `PARITY-SAILRECT: renderPickPrompt() does not call sailHighlightRect() — it is drawing its own sail squares, which is exactly the drift D-55 recorded.`);
      if (/el\("rect"/.test(body)) fail(res, `PARITY-SAILRECT: renderPickPrompt() still builds an el("rect" of its own — move those attributes into sailHighlightRect() so there is one place that decides what a sail square looks like.`);
      if (!/const\s+cellPx\s*=\s*boardCell\(\)/.test(body)) {
        fail(res, `PARITY-SAILRECT-GEOM: renderPickPrompt() does not derive cellPx from boardCell() — the ONE renderer both tiers share must size its squares from the same source every call, or a stale cellPx renders different-sized highlights from one call to the next.`);
      }
    }
  } else {
    // LEGACY SHAPE — the root v1 game, untouched by 02.15. Two named orchestrations each call
    // sailHighlightRect() directly. Byte-identical to this assertion's behaviour before Task 3.
    for (const fn of ["localPickCell", "remotePickHighlights"]) {
      const body = sliceFn(live, `export function ${fn}(`);
      if (!body) { fail(res, `PARITY-SAILRECT: ${fn}() was not located in ${FLOW_REL} — re-anchor this gate rather than deleting the assertion.`); continue; }
      if (!/sailHighlightRect\(/.test(body)) fail(res, `PARITY-SAILRECT: ${fn}() does not call sailHighlightRect() — it is drawing its own sail squares, which is exactly the drift D-55 recorded.`);
      if (/el\("rect"/.test(body)) fail(res, `PARITY-SAILRECT: ${fn}() still builds an el("rect" of its own — move those attributes into sailHighlightRect() so there is one place that decides what a sail square looks like.`);
    }
  }
  if (/fill:"#fdb63d"/.test(live)) {
    fail(res, `PARITY-SAILRECT: the guest's old #fdb63d fill survives in ${FLOW_REL} — the host's #ffc23a is the approved colour on both seats.`);
  }

  // THE ONE-CALLER COUNT for the CONVERGED shape (was the two-caller GEOMETRY comparison,
  // 2026-07-31/UI-03; superseded by the convergence above, 4/ only). Total mentions of
  // `sailHighlightRect(` minus its own `export function` definition is the number of CALL SITES.
  // Exactly one, or a second orchestration has reappeared and there is nothing left stopping it
  // from feeding the shared builder different geometry again.
  let calls = [], callSites = null;
  if (converged) {
    const totalMentions = (live.match(/sailHighlightRect\(/g) || []).length;
    const hasDef = /export function sailHighlightRect\(/.test(live);
    callSites = totalMentions - (hasDef ? 1 : 0);
    if (callSites !== 1) {
      fail(res, `PARITY-SAILRECT-GEOM: sailHighlightRect( is called from ${callSites} place(s) in ${FLOW_REL}, expected exactly 1 (renderPickPrompt). With one converged renderer there is nothing left to keep in step if a second caller reappears — that second caller is the defect, not a variant to reconcile.`);
    }
  } else {
    // LEGACY two-caller GEOMETRY comparison, unchanged from before Task 3 — root tree only.
    for (const fn of ["localPickCell", "remotePickHighlights"]) {
      const body = sliceFn(live, `export function ${fn}(`);
      if (!body) continue; // already failed loudly above
      const m = body.match(/sailHighlightRect\(([^)]*)\)/);
      if (!m) continue;    // already failed loudly above
      calls.push({ fn, args: m[1].replace(/\s+/g, "") });
      if (!/const\s+cellPx\s*=\s*boardCell\(\)/.test(body)) {
        fail(res, `PARITY-SAILRECT-GEOM: ${fn}() does not derive cellPx from boardCell() — both pick paths must size their squares from the same source, or host and guest render different-sized highlights from the same builder.`);
      }
    }
    if (calls.length === 2 && calls[0].args !== calls[1].args) {
      fail(res, `PARITY-SAILRECT-GEOM: the two pick paths pass DIFFERENT arguments to sailHighlightRect() — ${calls[0].fn}(${calls[0].args}) vs ${calls[1].fn}(${calls[1].args}). One shared builder does not help if it is fed different geometry.`);
    }
  }

  // and the scale constant lives in exactly one place, so "10% smaller" cannot become two numbers
  const scaleDefs = (live.match(/const\s+SAIL_HL_SCALE\s*=/g) || []).length;
  if (scaleDefs !== 1) {
    fail(res, `PARITY-SAILRECT-GEOM: ${scaleDefs} definition(s) of SAIL_HL_SCALE in ${FLOW_REL}, expected exactly 1 — the highlight's size must be decided in one place for both seats.`);
  }

  note(res, `sail-highlight builders carrying the sailCell class: ${builders}; ${converged ? `sailHighlightRect call sites: ${callSites} (expected 1, renderPickPrompt)` : `call sites agreeing on geometry: ${calls.length} (legacy two-orchestration shape)`}`);
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

  /* RE-ANCHORED 03-01 Task 3 (TEST-06) — 4/ SPLIT THE GUARD FROM THE RIDE, AND THAT IS BETTER.
     This used to brace-match animateRimSweepIfAny and demand the curve be built inside it. That
     described the root tree, where the guard and the ride are one function. In `4/` they are two:
     animateRimSweepIfAny is now a thin GUARD (is the last event a tradewind? is `from` on the rim?
     have we already swept this event index?) which ends in `return animateRimSweepRun(seat,from,to)`,
     and animateRimSweepRun holds the entire ride.

     The split is load-bearing, not cosmetic, and its own comment says why: a SWEPT STORM STEP emits
     nothing between stepping onto the rim and tradewind(), so the event stream cannot supply `from`
     — but runStormLive is holding the pre-step square in its hand. Giving the ride an entry point
     that takes `from` explicitly is what lets a storm ride animate at all WITHOUT adding a field to
     the event stream. That last part matters more than it looks: adding the entry cell to the event
     is the STORM-02 class of change, i.e. a determinism re-record (docs/DETERMINISM-CAPTURE-4.md).
     4/ got the animation and kept the one-way door shut.

     So the gate reports the extraction as a regression, and the gate is wrong. Its own failure text
     is the instruction — *"must be rewritten, not deleted"* — so: FIND THE RIDE, wherever it lives,
     and assert every one of the same properties against it.

     ANTI-VACUITY, and this is the part that must not be lost: "find the ride" cannot be allowed to
     mean "find nothing and pass". The guard must exist; it must reach exactly ONE ride; the ride
     must build a curve. Every one of those is a named failure below, and the one-ride COUNT further
     down is what stops the extraction quietly becoming two rides that drift apart — which is D-55's
     failure class one layer up from where D-55 happened. */
  const sliceBody = (name) => {
    const start = live.indexOf(`export async function ${name}`);
    if (start < 0) return null;
    const open = live.indexOf("{", start);
    let depth = 0;
    for (let i = open; i < live.length; i++) {
      if (live[i] === "{") depth++;
      else if (live[i] === "}") { depth--; if (depth === 0) return live.slice(open, i); }
    }
    return null;
  };

  const guardBody = sliceBody("animateRimSweepIfAny");
  if (guardBody === null) {
    fail(res, `PARITY-SWEEPARRIVE: animateRimSweepIfAny is not in ${FLOW_REL} at all (or its body could not be brace-matched). ANTI-VACUITY: this assertion fails rather than passing over an absent function.`);
    return res;
  }

  // Which shape is this tree in? INLINE (root: the guard IS the ride) or EXTRACTED (4/).
  let rideName = "animateRimSweepIfAny";
  let body = guardBody;
  if (guardBody.indexOf("rimSweepCurve(") < 0) {
    // EXTRACTED. The guard must delegate to exactly one ride. Anything named animateRimSweep* that
    // the guard calls and that is not the guard itself is a candidate.
    const called = [...new Set(
      [...guardBody.matchAll(/\b(animateRimSweep[A-Za-z0-9_]*)\s*\(/g)].map((m) => m[1])
    )].filter((n) => n !== "animateRimSweepIfAny");
    if (called.length === 0) {
      fail(res, `PARITY-SWEEPARRIVE: animateRimSweepIfAny neither builds a rimSweepCurve nor calls any animateRimSweep* ride. The sweep has been moved somewhere this assertion cannot follow — re-anchor it, do NOT delete it.`);
      return res;
    }
    if (called.length > 1) {
      fail(res, `PARITY-SWEEPARRIVE: animateRimSweepIfAny reaches ${called.length} different rides (${called.join(", ")}). Two rides is two chances to disagree about how a boat crosses the ring — exactly the fork D-55 recorded one layer down. One ride, entered from wherever you like.`);
      return res;
    }
    rideName = called[0];
    body = sliceBody(rideName);
    if (body === null) {
      fail(res, `PARITY-SWEEPARRIVE: animateRimSweepIfAny delegates to ${rideName}(), which is not an \`export async function\` in ${FLOW_REL} (or its body could not be brace-matched). Re-anchor this gate rather than deleting the assertion.`);
      return res;
    }
  }

  const loopAt = body.indexOf("rimSweepCurve(");
  if (loopAt < 0) { fail(res, `PARITY-SWEEPARRIVE: ${rideName}() does not build a rimSweepCurve — this assertion no longer describes the code and must be rewritten, not deleted.`); return res; }
  const beforeLoop = body.slice(0, loopAt);

  // 1. arrival: paint `from`, then YIELD, both before the loop
  if (!/paintShipAt\(\s*seat\s*,\s*from\s*\)/.test(beforeLoop)) {
    fail(res, `PARITY-SWEEPARRIVE: the sweep never paints the ship at \`from\` before its loop. The square the player clicked is then never drawn, and the sweep starts with the boat still rendered inland — the 2026-07-31 bug exactly.`);
  }
  if (!/await\s+sleep\(\s*RIM_SWEEP_ARRIVE_MS\s*\)/.test(beforeLoop)) {
    fail(res, `PARITY-SWEEPARRIVE: no \`await sleep(RIM_SWEEP_ARRIVE_MS)\` before the sweep loop. Painting \`from\` WITHOUT yielding is a no-op — the browser paints once per task, so the next paint overwrites it before any pixel moves. The await IS the fix; the paint alone is not.`);
  }

  // 2. the glide is retuned for the sweep, and restored afterwards
  // RE-ANCHORED 03-01 Task 3. This demanded the glide be EXACTLY `RIM_SWEEP_TICK_MS`. 4/ writes
  // `RIM_SWEEP_TICK_MS*MOTION_BRIDGE_TICKS` — a glide that deliberately OUTLASTS the tick, so the
  // browser always has a transition in flight to interpolate and soaks up setTimeout's jitter
  // (measured; see MOTION_BRIDGE_TICKS in util.js). One tick's worth, which is what the root tree
  // still has, leaves the glide finished before the next target lands and the boat renders on
  // every other frame. That is a REFINEMENT of this assertion's property, not a violation of it.
  // The two things that are actually load-bearing — the glide is DERIVED FROM the sweep tick rather
  // than left at SHIP_GLIDE_MS, and it is LINEAR — are both still pinned. Pinning the exact
  // expression would have made the honest fix red, which is how a gate gets ignored.
  if (!/setShipGlideMs\(\s*seat\s*,[^,)]*\bRIM_SWEEP_TICK_MS\b[^,)]*,\s*"linear"\s*\)/.test(body)) {
    fail(res, `PARITY-SWEEPARRIVE: the sweep does not set a LINEAR glide derived from RIM_SWEEP_TICK_MS. Left at SHIP_GLIDE_MS the ship is re-aimed mid-glide and takes the chord instead of the arc; left eased, every individual tick eases in and out and the line shimmers.`);
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
  /* EXACTLY ONE RIDE, 03-01 Task 3. Earned by the extraction above and not assertable before it.
     Every property this assertion pins is pinned against ONE function body. The moment a second
     function builds a rimSweepCurve, half of them are unguarded on the other one — and it would
     stay green, which is the reassuring-gate failure this whole phase exists to close. Count call
     sites (total mentions minus the definition) rather than naming the ride, so this cannot be
     satisfied by renaming. Same COUNT idiom assertion 2 uses; one gesture, one behaviour. */
  const curveMentions = (live.match(/rimSweepCurve\(/g) || []).length;
  const curveDef = /export function rimSweepCurve\(/.test(live) ? 1 : 0;
  const rideCount = curveMentions - curveDef;
  if (rideCount !== 1) {
    fail(res, `PARITY-SWEEPARRIVE-ONERIDE: rimSweepCurve( is built in ${rideCount} place(s) in ${FLOW_REL}, expected exactly 1 (${rideName}). Every property above is asserted against ONE body; a second ride is a second set of arrival, glide-restore and elapsed-time properties that nothing checks.`);
  }

  note(res, `the ride is ${rideName}(); it arrives at \`from\` and yields before stepping, retunes the glide from RIM_SWEEP_TICK_MS and restores it in finally; ${rideCount} function build(s) the curve`);
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


/* ================= assertion 6: ORCHESTRATION PARITY (02.15-01, D-28) ================= */
// THE DISEASE ASSERTIONS 1-5 CANNOT SEE. They all pin MARKUP — that two renderers emit the same
// classes, that one builder serves both tiers. None of them can see WHO CALLS a renderer, and that
// is where the fault actually lives (D-24): the host's screen is driven by the game loop
// (runLiveNet), a guest's by nine independent Firebase listeners, and the renderers are shared
// while the ORCHESTRATION is not. Assertion 1 was measured green against 4/ on 2026-08-20 — 6
// tokens each side, because 02.1-03 unified the button builder — so re-aiming the existing
// assertions at 4/ would have gone straight to green and looked like proof of a conversion that had
// not happened. This assertion exists so something is genuinely RED first.
//
// THE RULE, which is CLAUDE.md rule 23 narrowed to something checkable:
//   a renderer the host's game loop drives must ALSO be reachable from the listener path.
//
// DECLARED, NEVER SILENTLY TOLERATED. Reality worse than the declaration FAILS, naming the
// renderer. A gap is declared explicitly, with the stage that closes it, so stopping early leaves
// a gate that is green against a declaration anyone can read the holes in — a reviewable statement,
// not an accident. Widening the declaration to cover a renderer that is still host-only turns this
// back into the reassuring kind of gate; do not do it.
// watchClock left with the shot clock (2026-08-28) — eight listeners now.
const LISTENERS = ["watchEvents","watchPrompt","watchNarr","watchFlip","watchBattle",
                   "watchDraftPrompt","watchTurnOrder","watchRecoveryState"];

// Renderers this gate tracks. `shared:true` means a listener must be able to reach it;
// `shared:false` is a DECLARED GAP — still host-loop-only, with the stage that closes it named.
const ORCHESTRATION_DECL = [
  { fn: "showNarration(", shared: true,  why: "narration text — shared before this phase began" },
  { fn: "flash(",         shared: true,  why: "shared — PROMOTED BY 02.15-01 STAGE 1, in the same commit that made it true. watchNarr now draws through flash(), the same function the host's loop calls." },
  /* STAGE 2 CHANGED THIS ROW'S SUBJECT, AND THAT IS A JUDGEMENT CALL, SO IT IS WRITTEN DOWN.
     `setActor` is not a renderer — it is a one-line assignment to appState.curSeat. What actually
     draws is ribbonTick and camToSeat, reading curSeat and S.activeSeat, and the pair must be set
     together or the ribbon and the camera disagree. Stage 2 introduced applyActiveSeat as the ONE
     function that sets both, called by the host's turn loop AND by watchEvents. So the checkable
     subject is applyActiveSeat, and setActor is now reached through it on both tiers.
     THIS IS NOT WIDENING THE DECLARATION TO HIDE A GAP — the gap is CLOSED, and setActor's raw
     numbers are still measured and printed beside it so the swap is auditable rather than asserted.
     A `superseded` row asserts nothing; it exists so nobody reads a vanished renderer as a quietly
     dropped requirement. */
  { fn: "applyActiveSeat(", shared: true, why: "shared — PROMOTED BY 02.15-01 STAGE 2, in the same commit that made it true. The one function that sets curSeat AND S.activeSeat, called by humanTurn/botTurn and by watchEvents." },
  { fn: "setActor(",      superseded: "applyActiveSeat(", why: "not a renderer — a one-line assignment to appState.curSeat, now reached by both tiers THROUGH applyActiveSeat. Reported, not asserted." },
  /* W1 (2026-08-28) CLOSED THIS ROW — the last declared gap of the six forks. renderAskPrompt is
     the ONE ask-class renderer, named directly by localAsk (now the LOCAL RESPONSE MECHANISM,
     exactly localPickCell's shape) and by watchPrompt's ask branch. Same superseded precedent as
     setActor→applyActiveSeat and localPickCell→renderPickPrompt: measured and printed, asserts
     nothing, so the swap is auditable rather than asserted. The row was added BEFORE the
     convergence and watched RED (PARITY-ORCH-ABSENT — renderAskPrompt did not exist), per this
     gate's own rule that a row added after the fact proves nothing. */
  { fn: "localAsk(",      superseded: "renderAskPrompt(", why: "not a renderer any more — the LOCAL RESPONSE MECHANISM, reached THROUGH renderAskPrompt on both tiers. W1, 2026-08-28." },
  { fn: "renderAskPrompt(", shared: true, why: "shared — PROMOTED BY W1 (2026-08-28), in the same commit that made it true. The ONE ask-class renderer: buttons, slider, back, flip arming and the ceremony's words, named directly by localAsk and by watchPrompt's ask branch." },
  /* 02.15-02 Task 3 (THE TRACER) CLOSED THIS ROW. localPickCell was the DECLARED GAP watched RED
     by Task 1 — the host drew its own sail window from the game loop; a guest's was drawn by a
     separate wrapper, remotePickHighlights, called from watchPrompt. Task 3 converged both into
     ONE renderer, renderPickPrompt (below), named DIRECTLY by watchPrompt's kind==="pick" branch —
     not through a guest-only wrapper, which is what lets this gate see the convergence instead of
     asserting nothing. localPickCell is not a renderer any more: it is the LOCAL RESPONSE
     MECHANISM, reached THROUGH renderPickPrompt by construction. Same `superseded` precedent as
     Stage 2's setActor→applyActiveSeat swap — measured and printed, asserts nothing, so the swap
     is auditable rather than asserted. */
  { fn: "localPickCell(", superseded: "renderPickPrompt(", why: "not a renderer any more — the LOCAL RESPONSE MECHANISM, reached THROUGH renderPickPrompt on both tiers. 02.15-02 Task 3 (THE TRACER)." },
  { fn: "renderPickPrompt(", shared: true, why: "shared — PROMOTED BY 02.15-02 TASK 3 (THE TRACER), in the same commit that made it true. The ONE sail-window renderer, named directly by localPickCell (the local response mechanism) and by watchPrompt's kind===\"pick\" branch." },
  /* 04-01 TASK 3 (MP-05) ADDS TWO ROWS, AND THEY WERE WATCHED RED AGAINST THE PRE-TASK TREE BEFORE
     THEY WERE ADDED — a row added after the fact proves nothing (see 04-01-SUMMARY.md for the run).
     Against build 2026-08-23a `playBakeoffLive` read listeners=0 host-loop=1 and `applyBenchSnap`
     did not exist at all, i.e. PARITY-ORCH and PARITY-ORCH-ABSENT respectively.

     TWO ROWS RATHER THAN ONE, because the bake-off is reached from the listener tier by two
     different listeners and only one of them can name the choreography directly:
       watchPrompt  — the REMOTE CAPTAIN's own hands. Names playBakeoffLive directly, exactly as
                      the sail tracer's pick branch names renderPickPrompt.
       watchBattle  — EVERY OTHER CAPTAIN, watching. Reaches the same choreography through
                      applyBenchSnap, which is the ONE entry both the publisher (mirror-when-remote,
                      local render always) and the listener go through. That is not a guest-only
                      wrapper — it is the shared seam — so it gets its own tracked row instead of
                      being hidden behind the first one. */
  { fn: "playBakeoffLive(", shared: true, why: "shared — PROMOTED BY 04-01 TASK 3 (MP-05), in the same commit that made it true. The ONE bake-off choreography: the baker's own hands and every watching captain run this same function from the same spec, face down for all of them. Named directly by bakeoffPrompt's decisionIsLocal branch and by watchPrompt's kind===\"bake\" branch." },
  { fn: "applyBenchSnap(", shared: true, why: "shared — PROMOTED BY 04-01 TASK 3 (MP-05). The one entry a bench moment reaches this screen through, called by benchPublish (local render always) and by watchBattle's bench branch. It is what carries the watching captain into playBakeoffLive." },
  /* 05-01 TASK 3 (MP-08, D-55) ADDS TWO ROWS, WATCHED RED AGAINST THE PRE-TASK TREE BEFORE THEY
     WERE ADDED — a row added after the fact proves nothing, and this gate spent three phases green
     while pointed at a game nobody was developing. Against build 2026-08-23b both read
     PARITY-ORCH-ABSENT: neither function existed, because a remote captain got coinStepper's +/-
     pair instead of a slider and the markup was one inline line in localAsk.

     TWO ROWS RATHER THAN ONE, for the same reason the bake-off took two: the markup and the wiring
     are separately droppable. A tier that built the bar and forgot to wire it would render a dead
     control — measured as a real failure class by the playtest gate ("0 dead sliders" is one of the
     four things it counts) — and a tier that wired without building would render nothing at all. */
  { fn: "sliderWrapHTML(", shared: true, why: "shared — PROMOTED BY 05-01 TASK 3 (MP-08, D-55), in the same commit that made it true. The ONE definition of what a coin slider IS, carrying the two class names stage.js identifies the control by (.apSlider keeps the prompt in radial mode, .apSliderWrap keys the placement memo). Named directly by localAsk and by watchPrompt's ask branch." },
  { fn: "wireSlider(", shared: true, why: "shared — PROMOTED BY 05-01 TASK 3 (MP-08, D-55). The ONE wiring: writes the running position into the caller's ref, repaints the readout, and re-states the whole deal in the ask as ye drag. Named directly by localAsk and by watchPrompt's ask branch — not through a tier-only wrapper, which is what would satisfy the eye and nothing else." },
];

// Slice a function body by BRACE MATCHING from its `export function NAME(` header. Located by
// content, never by line number, for the same reason sliceFn is — a line shift must go loud.
function fnBody(src, name) {
  // async exports too — consumeEvent (W1) is `export async function`
  let i = src.indexOf("export function " + name + "(");
  if (i < 0) i = src.indexOf("export async function " + name + "(");
  if (i < 0) return null;
  const st = src.indexOf("{", i);
  if (st < 0) return null;
  let d = 0;
  for (let j = st; j < src.length; j++) {
    if (src[j] === "{") d++;
    else if (src[j] === "}") { d--; if (d === 0) return src.slice(st, j + 1); }
  }
  return null;
}

const countOf = (hay, needle) => hay.split(needle).length - 1;

// `strict` ignores every declared gap and asserts rule 23 in full. That is the RED-PROOF reading
// and the honest end-state measure — run with --strict. It is NOT what `npm test`-style runs use,
// because a gate that is red at the end of a SUCCESSFUL partial conversion teaches people to
// ignore it, which is how the old gate taught people it was fine by passing.
export function checkOrchestrationParity(root, { strict = false } = {}) {
  const res = mk(`assertion 6 — orchestration parity: a renderer the host's loop drives is reachable from the listener path${strict ? " [STRICT — declared gaps ignored]" : ""}`);
  const orchRaw = read(root, ORCH_REL);
  const flowRaw = read(root, FLOW_REL);
  if (!orchRaw) { fail(res, `${ORCH_REL} not found under ${root}`); return res; }
  const orch = stripComments(orchRaw);
  const flow = flowRaw ? stripComments(flowRaw) : "";

  // ---- ANTI-VACUITY, and it is the whole reason this assertion is trustworthy. An empty or
  // unrecognisable listener set must FAIL LOUDLY, never pass by finding nothing to complain about.
  const found = [], missing = [];
  for (const w of LISTENERS) { const b = fnBody(orch, w); if (b) found.push([w, b]); else missing.push(w); }
  if (missing.length) fail(res, `PARITY-ORCH-VACUITY: ${missing.length} of ${LISTENERS.length} listener bodies not found in ${ORCH_REL} (${missing.join(", ")}) — this assertion cannot measure a tree it cannot parse, and must not pass one`);
  /* W1 (2026-08-28): THE LISTENER PATH INCLUDES THE ONE CONSUMER. watchEvents no longer draws
     inline — it delegates every drawing step to consumeEvent (the one-activity-engine seam), so a
     textual scan of listener BODIES alone reads `applyActiveSeat: listeners=0` about a call that
     every listener-delivered event makes. consumeEvent's body IS what the listener executes; it
     joins the scanned path, with its own anti-vacuity: if it exists it must be non-trivial. This
     was caught RED before it was fixed — the applyActiveSeat row failed PARITY-ORCH the moment
     the consumer landed, on a convergence that was real. */
  const consumer = fnBody(orch, "consumeEvent");
  if (consumer && consumer.length < 200) fail(res, `PARITY-ORCH-VACUITY: consumeEvent exists but is ${consumer.length} chars — too small to be the real consumer`);
  // …and the ONE ask renderer (fork 2, same day): watchPrompt names renderAskPrompt and the
  // slider builders live inside it, so the scan must read through that delegation too. Guarded
  // the same way: it only extends the path if watchPrompt actually reaches it — a renderer no
  // listener calls must NOT smuggle its callees into the listener path.
  const askRenderer = fnBody(flow, "renderAskPrompt");
  const wpBody = fnBody(orch, "watchPrompt") || "";
  const askReached = askRenderer && /renderAskPrompt\(/.test(wpBody) ? askRenderer : "";
  if (askRenderer && askRenderer.length < 200) fail(res, `PARITY-ORCH-VACUITY: renderAskPrompt exists but is ${askRenderer.length} chars — too small to be the real renderer`);
  const listenerSrc = found.map(([, b]) => b).join("\n") + (consumer ? "\n" + consumer : "") + (askReached ? "\n" + askReached : "");
  if (listenerSrc.length < 500) { fail(res, `PARITY-ORCH-VACUITY: the listener path is ${listenerSrc.length} chars — too small to be the real one. Refusing to report parity against an empty listener set`); return res; }

  const driven = orch + "\n" + flow;   // where the host's loop reaches its renderers
  const rows = [];
  for (const d of ORCHESTRATION_DECL) {
    const inside = countOf(listenerSrc, d.fn);
    const outside = countOf(driven, d.fn) - inside;
    rows.push({ ...d, inside, outside });
    if (d.superseded) continue;               // reported below, asserts nothing — see the note above
    const mustShare = strict || d.shared;
    if (!mustShare) continue;
    if (outside === 0 && inside === 0) {
      fail(res, `PARITY-ORCH-ABSENT: ${d.fn} is not called anywhere in ${ORCH_REL} or ${FLOW_REL} — a renderer nobody calls cannot prove parity, and must not pass as "shared"`);
      continue;
    }
    if (inside === 0) fail(res, `PARITY-ORCH: ${d.fn} is driven ${outside}x from the host's game loop and is reachable from ZERO of the ${found.length} listeners — the host draws it and a guest cannot. ${d.why}`);
  }

  for (const r of rows) {
    const gap = !r.shared && !r.superseded && !strict;
    const tag = r.superseded ? `SUPERSEDED by ${r.superseded.replace("(", "")} — ${r.why}`
              : gap ? "DECLARED GAP — " + r.why
              : r.shared ? "shared" : r.why;
    note(res, `${r.fn.replace("(", "").padEnd(18)} listeners=${r.inside}  host-loop=${r.outside}  ${tag}`);
  }
  const gaps = ORCHESTRATION_DECL.filter((d) => !d.shared && !d.superseded).map((d) => d.fn.replace("(", ""));
  if (!strict) note(res, gaps.length
    ? `THE DECLARATION STILL NAMES ${gaps.length} GAP(S): ${gaps.join(", ")}. Green here means "no worse than declared", NOT "converted".`
    : `The declaration names no gaps — every tracked renderer is reachable from both paths.`);
  return res;
}

/* ================= Runner ================= */
// `orchestration` is OPT-IN and defaults OFF, so a bare run (root tree, npm test wiring) behaves
// byte-identically to before 02.15-01. Assertion 6 describes 4/'s two-directors architecture; the
// root game is not being developed and making its run red would teach people to ignore the gate.
function runAll(root, { quiet = false, orchestration = false, strict = false } = {}) {
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

  if (orchestration) {
    const a6 = checkOrchestrationParity(root, { strict });
    log(`${a6.ok ? "PASS" : "FAIL"} ${a6.name}`);
    for (const n of a6.notes) log(`      ${n}`);
    results.push(a6);
  }

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

  // --- assertion 2 fixtures — RE-ANCHORED 02.15-02 Task 3 (THE TRACER). GOOD_PICK now reflects the
  //     CONVERGED shape: ONE renderer, renderPickPrompt, named by construction (the fixture stands
  //     in for both "the local caller wraps it" and "the listener names it directly" — the count
  //     check below can't tell WHO calls it, only how many places do, which is exactly what makes a
  //     resurrected second caller visible again in 2a/2b). ---
  const GOOD_PICK = [
    `const SAIL_HL_SCALE=0.9;`,
    `export function sailHighlightRect(c,cellPx,svg){`,
    `  return el("rect",{x:c[0]*cellPx+2,rx:6,fill:"#ffc23a",class:"sailCell"},svg);`,
    `}`,
    `export function renderPickPrompt(spec,answer){`,
    `  const cellPx=boardCell();`,
    `  spec.cells.forEach(c=>{const r=sailHighlightRect(c,cellPx,svg);hs.push(r);});`,
    `}`,
    ``,
  ].join("\n");

  // 2a: the ONE renderer stops calling the shared builder and hand-builds its own class-less rect
  //     again — D-55, exactly as it was, now visible as renderPickPrompt itself drifting rather
  //     than as a divergence between two orchestrations (there is only one left to drift).
  resetFixture();
  fixture(FLOW_REL, GOOD_PICK.replace(
    `  spec.cells.forEach(c=>{const r=sailHighlightRect(c,cellPx,svg);hs.push(r);});`,
    `  spec.cells.forEach(c=>{const r=el("rect",{rx:5,fill:"#fdb63d",opacity:.4},svg);hs.push(r);});`));
  expect("drill 2a (renderPickPrompt stops calling sailHighlightRect, hand-builds its own rect — D-55 reintroduced)", checkOneSailHighlightBuilder(tmpRoot), true, "PARITY-SAILRECT");

  // 2b: A SECOND CALLER REAPPEARS — the two-directors fault reborn on this exact channel. Something
  //     (a resurrected remotePickHighlights, or any new orchestration) calls sailHighlightRect()
  //     again outside renderPickPrompt. The count must go UP and the drill must catch it, or this
  //     re-anchor weakened the gate instead of strengthening it (T-02.15-06).
  resetFixture();
  fixture(FLOW_REL, GOOD_PICK + `export function remotePickHighlights(cells){\n  const cellPx=boardCell();\n  for(const c of cells){const r=sailHighlightRect(c,cellPx,svg);hs.push(r);}\n}\n`);
  expect("drill 2b (a SECOND caller of sailHighlightRect reappears — the two-directors fault, reborn)", checkOneSailHighlightBuilder(tmpRoot), true, "expected exactly 1");

  // 2c: negative control — one renderer, one caller, converged
  resetFixture();
  fixture(FLOW_REL, GOOD_PICK);
  expect("drill 2c (negative control — one renderer, one caller, converged)", checkOneSailHighlightBuilder(tmpRoot), false);

  /* 2d / 2e — THE SPELLINGS, 03-01 Task 3. The re-anchor above taught this assertion to count the
     sail class applied as a DOM PROPERTY as well as as an attribute-object key, because that is how
     `4/` writes it. A widening is exactly the kind of change that can quietly turn a gate vacuous,
     so both halves are drilled: the new spelling must still be able to make the count go RED (2d),
     AND a tree written entirely in the new spelling must pass for the right reason (2e). Without
     2d the widening would be indistinguishable from deleting the assertion. */
  const GOOD_PICK_DOM = [
    `const SAIL_HL_SCALE=0.9;`,
    `export function sailHighlightRect(c,cellPx,svg){`,
    `  const d=document.createElement("div");`,
    `  d.className="sailCell";`,
    `  return d;`,
    `}`,
    `export function renderPickPrompt(spec,answer){`,
    `  const cellPx=boardCell();`,
    `  spec.cells.forEach(c=>{const r=sailHighlightRect(c,cellPx,svg);hs.push(r);});`,
    `}`,
    ``,
  ].join("\n");

  // 2d: a SECOND builder written in the DOM-property spelling. Before the re-anchor this was
  //     invisible — the gate counted `class:"sailCell"` only, so a whole second builder written the
  //     4/ way scored zero and the gate reported "0 builders" while two existed.
  resetFixture();
  fixture(FLOW_REL, GOOD_PICK_DOM.replace(
    `  d.className="sailCell";`,
    `  d.className="sailCell";\n  const guest=document.createElement("div");\n  guest.className="sailCell";`));
  expect("drill 2d (a second builder in the DOM-PROPERTY spelling — invisible before the re-anchor)", checkOneSailHighlightBuilder(tmpRoot), true, "expected exactly 1");

  // 2e: negative control for the new spelling — one builder, written the way 4/ writes it, passes.
  resetFixture();
  fixture(FLOW_REL, GOOD_PICK_DOM);
  expect("drill 2e (negative control — ONE builder in the DOM-property spelling, the 4/ shape)", checkOneSailHighlightBuilder(tmpRoot), false);

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

  /* 4h / 4i / 4j — THE EXTRACTED SHAPE, 03-01 Task 3. Every drill above writes the guard and the
     ride as ONE function, which is the root tree's shape. `4/` splits them, and the re-anchor added
     a whole branch to follow the split. A branch nothing drills is a branch that has only ever been
     seen pass against one real tree — §2's *"a check you have only ever seen pass is
     indistinguishable from a check that cannot fail"*, arriving inside the gate itself. So the
     split shape gets the same three: it can go red on a property (4h), it passes for the right
     reason (4i), and it refuses a FORK rather than picking one of two rides (4j). */
  const EXTRACTED_RIDE_BODY = `  try{
    setShipGlideMs(seat,RIM_SWEEP_ARRIVE_MS,"linear");
    paintShipAt(seat,from);
    await sleep(RIM_SWEEP_ARRIVE_MS);
    const curve=rimSweepCurve([from,...path]);
    const total=rimSweepDurationMs(path.length);
    setShipGlideMs(seat,RIM_SWEEP_TICK_MS*MOTION_BRIDGE_TICKS,"linear");
    const began=Date.now();
    for(;;){ const t=Math.min(1,(Date.now()-began)/total); const p=rimSweepPointAt(curve,t); if(p)paintShipAtPoint(seat,p[0],p[1]); if(t>=1)break; await routeTick(RIM_SWEEP_TICK_MS); }
  }finally{ setShipGlideMs(seat,null); paintShipAt(seat,to); }
  return true;`;
  const EXTRACTED_GUARD = `export async function animateRimSweepIfAny(){
  const g=appState.game;
  if(!g||appState.replaying)return false;
  return animateRimSweepRun(seat,from,to);
}
`;

  // 4h: the split is followed, and the ride is missing the glide RESTORE. The gate must find the
  //     ride and fail on the property — not shrug because the guard looks fine.
  resetFixture();
  fixture(FLOW_REL, EXTRACTED_GUARD + `export async function animateRimSweepRun(seat,from,to){\n` +
    EXTRACTED_RIDE_BODY.replace(`}finally{ setShipGlideMs(seat,null); paintShipAt(seat,to); }`, `}finally{ paintShipAt(seat,to); }`) + `\n}\n`);
  expect("drill 4h (EXTRACTED shape — the ride never restores the glide)", checkRimSweepArrivesAndRestores(tmpRoot), true, "never restores the glide");

  // 4i: negative control for the split — a correct guard delegating to a correct ride passes.
  resetFixture();
  fixture(FLOW_REL, EXTRACTED_GUARD + `export async function animateRimSweepRun(seat,from,to){\n` + EXTRACTED_RIDE_BODY + `\n}\n`);
  expect("drill 4i (negative control — EXTRACTED guard + one correct ride, the 4/ shape)", checkRimSweepArrivesAndRestores(tmpRoot), false);

  // 4j: the guard reaches TWO rides. Picking either one would leave the other's arrival, glide and
  //     elapsed-time properties unguarded — and it would read as green. Refuse, and name both.
  resetFixture();
  fixture(FLOW_REL, EXTRACTED_GUARD.replace(
    `  return animateRimSweepRun(seat,from,to);`,
    `  if(storm)return animateRimSweepStormRun(seat,from,to);\n  return animateRimSweepRun(seat,from,to);`) +
    `export async function animateRimSweepRun(seat,from,to){\n` + EXTRACTED_RIDE_BODY + `\n}\n` +
    `export async function animateRimSweepStormRun(seat,from,to){\n` + EXTRACTED_RIDE_BODY + `\n}\n`);
  expect("drill 4j (a FORK — the guard reaches two different rides)", checkRimSweepArrivesAndRestores(tmpRoot), true, "different rides");

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

  /* --- assertion 6 fixtures: ORCHESTRATION PARITY (02.15-01) ---------------------------------
     Every fixture below writes a WHOLE synthetic orchestrator.js containing all nine listener
     names, because the assertion's own anti-vacuity guard refuses to report against a tree it
     cannot parse — which is the property drill 6c exists to prove. */
  const NINE = ["watchEvents","watchPrompt","watchNarr","watchFlip","watchBattle",
                "watchDraftPrompt","watchTurnOrder","watchRecoveryState"];   // eight since the clock left; name kept so the fixtures read
  // pad each body so the whole listener set clears the 500-char floor without any real call in it
  const orchFixture = (bodies) => NINE.map((w) =>
    `export function ${w}(){\n  const pad="${"x".repeat(70)}";\n  ${bodies[w] || ""}\n}\n`).join("\n");

  /* THE FIXTURES BELOW MUST SATISFY EVERY `shared:true` ENTRY IN ORCHESTRATION_DECL, or a negative
     control goes red the moment a stage promotes a renderer — which is precisely what happened when
     Stage 1 promoted `flash` and is the same class of stale-fixture bug drill 2c's note records.
     A negative control that cannot go green is exactly as broken as an assertion that cannot go red. */
  const SHARED_NOW = ORCHESTRATION_DECL.filter((d) => d.shared && !d.superseded).map((d) => d.fn.replace("(", ""));
  const allSharedBody = SHARED_NOW.map((f) => `${f}('x');`).join("");
  const hostDrivesEverything = `export function runLiveNet(){${ORCHESTRATION_DECL.filter((d) => !d.superseded).map((d) => `${d.fn.replace("(", "")}('x');`).join("")}}\n`;

  // 6a: a renderer DECLARED shared that no listener can reach — the two-directors fault itself
  resetFixture();
  fixture(ORCH_REL, orchFixture({ watchNarr: allSharedBody.replace("showNarration('x');", "") }));
  fixture(FLOW_REL, hostDrivesEverything);
  expect("drill 6a (showNarration driven by the host loop, reachable from NO listener)",
    checkOrchestrationParity(tmpRoot), true, "showNarration");

  // 6b: STRICT ignores the declared gaps, so a declared gap still red-proofs — this is the reading
  //     that was watched RED against the real 4/ tree on 2026-08-20 before Stage 1 began
  resetFixture();
  fixture(ORCH_REL, orchFixture({ watchNarr: allSharedBody }));
  fixture(FLOW_REL, hostDrivesEverything);
  // the marker is DERIVED from the declaration's first live gap, so a stage that closes one does
  // not leave this drill asserting against a renderer nobody tracks any more
  const FIRST_GAP = (ORCHESTRATION_DECL.find((d) => !d.shared && !d.superseded) || {}).fn;
  expect(`drill 6b (STRICT — a DECLARED gap (${FIRST_GAP}) is still a failure when gaps are ignored)`,
    checkOrchestrationParity(tmpRoot, { strict: true }), true, FIRST_GAP);

  // 6c: ANTI-VACUITY. An EMPTY listener set must FAIL, never pass by finding nothing to complain
  //     about. This is the single most important drill on this assertion: a gate that reports
  //     parity against a tree it could not parse is the reassuring kind this project keeps paying
  //     for (docs/HARD-WON-LESSONS.md §3), and it is exactly how a re-aim at a renamed 4/ would
  //     have gone silently green.
  resetFixture();
  fixture(ORCH_REL, `export function somethingElse(){}\n`);
  fixture(FLOW_REL, `export function runLiveNet(){showNarration('x');}\n`);
  expect("drill 6c (ANTI-VACUITY — an empty listener set must FAIL, not pass)",
    checkOrchestrationParity(tmpRoot), true, "VACUITY");

  // 6d: a renderer nobody calls AT ALL must not pass as "shared" — the other vacuity direction
  resetFixture();
  fixture(ORCH_REL, orchFixture({ watchNarr: "render();" }));
  fixture(FLOW_REL, `export function runLiveNet(){render();}\n`);
  expect("drill 6d (a renderer called NOWHERE must not pass as shared)",
    checkOrchestrationParity(tmpRoot), true, "ABSENT");
  // 6d is deliberately left with NO shared renderer at all, which is what makes ABSENT fire.

  // 6e: negative control — a renderer both tiers reach passes
  resetFixture();
  fixture(ORCH_REL, orchFixture({ watchNarr: allSharedBody }));
  fixture(FLOW_REL, hostDrivesEverything);
  expect(`drill 6e (negative control — every declared-shared renderer (${SHARED_NOW.join(", ")}) reachable from a listener passes)`,
    checkOrchestrationParity(tmpRoot), false);

  // --- final negative control: the REAL tree passes every assertion, which is what proves the
  //     fixes and the gate agree ---
  {
    const r = runAll(REAL_ROOT, { quiet: true });
    const ok = r.every((x) => x.ok);
    console.log(`${ok ? "PASS" : "FAIL"} drill Z (negative control — the REAL root tree passes assertions 1-5) — expected PASS, got ${ok ? "PASS" : "FAIL"}`);
    for (const x of r) for (const f of x.failures) console.log(`    ${f}`);
    if (!ok) allOk = false;
  }

  fs.rmSync(tmpRoot, { recursive: true, force: true });
  console.log(`\n${allOk ? "ALL 6 ASSERTIONS RED-PROOF DRILLED OK" : "DRILL FAILURE — an assertion did not fail against its own synthetic violation"}`);
  process.exit(allOk ? 0 : 1);
}

/* ================= Entry ================= */
// Guarded on being the MAIN module. The check functions are exported so a one-off red-proof can
// run them against an arbitrary tree (e.g. `git show <sha>:src/ui/flow.js` written to a temp root,
// which is how assertion 2 was proven to fail against the pre-G25 tree). Without this guard the
// entry block runs on IMPORT and process.exit()s before the caller's own code does, which silently
// prints this gate's own verdict and looks like the caller's result — a false red-proof.
const IS_MAIN = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

// ---- THE TREE SELECTOR (02.15-01 / D-28) ----------------------------------------------------
// This gate has been green for months against `src/` — THE OLD GAME, which nobody is developing —
// while every host/guest drift it was written to catch was happening in `4/`. A gate aimed at the
// wrong tree is not silent, it is reassuring (docs/HARD-WON-LESSONS.md §3).
//
// The re-aim is a selector, not a rewrite: every checker already took a `root` argument and read
// through read(root, REL), and 4/ uses the identical internal layout (src/ui/flow.js,
// src/orchestrator.js, src/ui/board.js). DEFAULT IS UNCHANGED — a bare run still scans the root
// tree, so the existing npm test wiring behaves exactly as it did.
//
//   node scripts/host_guest_parity_check.js                  root tree, assertions 1-5 (unchanged)
//   node scripts/host_guest_parity_check.js --tree=4         4/, assertions 1-5 + 6
//   node scripts/host_guest_parity_check.js --tree=4 --strict 4/, assertion 6 with gaps IGNORED
//   node scripts/host_guest_parity_check.js --tree=4 --report assertions 1-5 reported, never fatal
//   node scripts/host_guest_parity_check.js --drill          red-proof every assertion
//
// Wiring --tree=4 into root `npm test` is Phase 3 / TEST-05, not this phase; a green root run still
// says nothing about 4/, so run this by name like every other 4/-side gate.
// CONVERGED, 03-01 Task 3. This function used to live here, as this file's own private copy of
// the idiom. Phase 3 gave the same selector to six more gates, and six copies is the shape rule 23
// forbids — *what makes these agree?* Nothing. So there is now exactly ONE of it, in
// scripts/lib/pick_tree.js, and this file was moved onto it rather than left running beside it.
// The behaviour is unchanged in every mode, including the arbitrary-path mode the drills use.
// `orchestration` is this gate's own name for "the tree has a guest tier worth asserting against",
// which is true of 4/ and of a synthetic tree and false of the root game — derived here rather
// than pushed into the shared selector, because no other gate has that concept.
function pickTreeHere(argv) {
  const t = pickTree(argv);
  return { root: t.root, label: t.label, orchestration: t.name !== "root" };
}

if (!IS_MAIN) {
  // imported for reuse — nothing runs
} else if (process.argv.includes("--drill")) {
  drill();
} else {
  const { root, label, orchestration } = pickTreeHere(process.argv);
  const strict = process.argv.includes("--strict");
  // --report: print every verdict and exit 0 regardless. Assertions 2-5 pin subjects (the sail
  // rect builder, the rim-sweep stepper, the glide restore, the active ring) that may or may not
  // exist under 4/ by the same names, and assertion 3's own header warns that an assertion whose
  // subject does not exist either fails for an unrelated reason or is loose enough to pass an
  // empty tree. Reporting them is useful; letting them BLOCK this phase would teach people to
  // ignore the gate, which costs more than the coverage buys. Porting them properly is TEST-06.
  // `--report` survives as an EXPLORATION mode only — it is no longer used by npm test, which runs
  // the 4/ aim bare so a parity break exits non-zero (03-01 Task 3 / TEST-06). It now says so on
  // every run it is used on, because a gate that exits 0 while printing failures is the single
  // easiest thing in this repo to quote as a green.
  const reportOnly = process.argv.includes("--report");
  console.log(`tree: ${label}`);
  if (reportOnly) console.log(`--report: EXPLORATION MODE — this run will exit 0 even if it fails. It is NOT what npm test runs and a green from it proves nothing.`);
  const results = runAll(root, { orchestration, strict });
  const failed = results.filter((r) => !r.ok);
  if (failed.length) {
    // NAME THE TREE IN THE FAILURE HEADER TOO. The `tree:` line at the top says it, but a failure
    // pasted into a summary or a commit message travels without it — and every path below is
    // RELATIVE (src/ui/flow.js reads identically for both trees, which is the two-trees hazard
    // CLAUDE.md rule 18 is about). One repetition here makes a quoted failure self-describing.
    console.error(`\nFAILURES — tree: ${label}`);
    for (const r of failed) for (const f of r.failures) console.error(`  - ${f}`);
    if (!reportOnly) process.exit(1);
    console.error("\n(--report: exiting 0 anyway — these are reported, not gating)");
  }
  process.exit(0);
}
