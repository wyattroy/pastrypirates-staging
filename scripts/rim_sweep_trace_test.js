#!/usr/bin/env node
// scripts/rim_sweep_trace_test.js
//
// THE TRADE-WIND ANIMATION TRACE HARNESS (Wyatt-approved 2026-07-31).
//
// ============================================================================
// Why this exists
// ============================================================================
// Three separate defects shipped in this one animation in a single day, and a HUMAN caught every
// one of them by recording his screen and sending the file over:
//
//   1. the boat never reached the square the player clicked, and cut diagonally across the middle
//      of the board instead of travelling the ring      (notes/trade winds animation bug.mov)
//   2. the motion was a staircase — correct, and ugly    (notes/tradewinds jitter.mov)
//   3. the active ring ran ahead of the boat it marks    (notes/tradewinds v5.mov)
//
// Wyatt, afterwards: *"can you simply record a snippet of the gameplay yourself and diagnose it from
// the recordings going forward? Wouldn't that be more efficient and allow us to make better gates
// that actually measure what we're looking for."*
//
// This harness is the answer to the second half of that question. It cannot watch pixels — see the
// honest limits below — but it can enumerate, exactly and without a browser, EVERY POSITION THE
// ANIMATION WILL AIM THE BOAT AT, and assert the shape of that motion. Defects 1 and 2 are both
// caught here, in numbers, before anyone looks at a screen.
//
// ============================================================================
// What this CANNOT catch, stated up front so nobody trusts it too far
// ============================================================================
// Defect 3 would have PASSED every assertion in this file. The ring and the boat were handed
// IDENTICAL positions — the divergence happened afterwards, inside the browser, because one had a
// css transition and the other did not. Measured live on 2026-07-31: a 1000ms linear transition in
// the automated tab moved 0px of 400px across 600ms, because browsers freeze animation in a hidden
// tab. Rendered motion is therefore not observable from here at all.
//
// That whole class — lag, shimmer, two things drifting apart — is defended STRUCTURALLY instead, by
// host_guest_parity_check.js assertion 5, which fails if the ship is ever retuned without its ring.
// Making a defect impossible beats measuring it.
//
// ============================================================================
// Why it measures the real motion and not a copy of it
// ============================================================================
// A harness that re-implements the animation proves only that two implementations agree. So the
// live loop's position maths was EXTRACTED rather than duplicated: animateRimSweepIfAny() calls
// rimSweepDurationMs() and rimSweepPointAt(), this file calls the same two functions, and
// host_guest_parity_check.js assertion 4 fails if the live loop ever stops calling them.
//
// The one thing genuinely simulated here is the CLOCK. Live, `t` comes from Date.now(); here it is
// enumerated at RIM_SWEEP_TICK_MS intervals — i.e. this measures the motion on a machine that never
// drops a frame. That is the right thing to measure: a dropped frame is the browser's business,
// while the SHAPE of the motion is ours.
//
// House style matches hail_ranking_test.js / narration_flow_test.js: no assertion library, a local
// check(), plain console.log, process.exit(failures ? 1 : 0).

import {
  rimSweepPath, rimSweepCurve, rimSweepDurationMs, rimSweepPointAt,
} from "../src/ui/flow.js";
import {
  RIM_SWEEP_TICK_MS, RIM_SWEEP_MIN_MS, RIM_SWEEP_MAX_MS, RIM_SWEEP_MS_PER_CELL,
} from "../src/ui/util.js";
import { Game as EngineGame, roundCfg as engineRoundCfg } from "../src/engine/index.js";

let failures = 0;
function check(name, actual, expected) {
  const ok = actual === expected;
  if (!ok) failures++;
  console.log(`  ${(ok ? "PASS" : "FAIL").padEnd(5)} ${name.padEnd(88)} got=${JSON.stringify(actual)} want=${JSON.stringify(expected)}`);
}
const checkTrue = (name, actual) => check(name, actual, true);
const median = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : 0; };

console.log("Trade-wind sweep trace harness — every position the animation aims at\n");

// Replays one sweep on a perfect clock and returns the frames it would paint.
// `tickMs` is a parameter ONLY so the red-proof below can replay the OLD per-square stepper through
// this same measuring apparatus; live code always uses RIM_SWEEP_TICK_MS.
function traceSweep(from, path, tickMs = RIM_SWEEP_TICK_MS) {
  const curve = rimSweepCurve([from, ...path]);
  const total = rimSweepDurationMs(path.length);
  const frames = [];
  for (let ms = 0; ; ms += tickMs) {
    const t = Math.min(1, ms / total);
    const p = rimSweepPointAt(curve, t);
    if (p) frames.push({ ms, t, x: p[0], y: p[1] });
    if (t >= 1) break;
  }
  return { frames, total, curve };
}

/* ================= The traces ================= */
{
  const problems = [];
  let traces = 0, framesTotal = 0;
  let worstGap = 0, worstRatio = 0, worstDrift = 0, fewestFrames = Infinity;
  let shortestMs = Infinity, longestMs = 0;

  for (let seed = 1; seed <= 8; seed++) {
    const g = new EngineGame(engineRoundCfg(["balanced", "balanced", "balanced", "balanced"]), seed, true);
    const ring = g.rimCellInfo || [];
    // `g.cfg.grid`, NOT `g.grid` — there is no `grid` property on Game. A previous version of this
    // measurement used it, every radius came out NaN, and because NaN comparisons are false the
    // band check below silently tested NOTHING while printing PASS. The finite guard is the fix.
    const n = g.cfg.grid;
    const cx = (n - 1) / 2, cy = (n - 1) / 2;
    const radii = ring.map((c) => Math.hypot(c.x - cx, c.y - cy));
    const rMin = Math.min(...radii), rMax = Math.max(...radii);
    if (!Number.isFinite(rMin) || !Number.isFinite(rMax)) {
      problems.push(`seed ${seed}: ANTI-VACUITY — ring radius band not finite (${rMin}..${rMax})`);
      continue;
    }

    for (const rc of ring) {
      const from = [rc.x, rc.y];
      const path = rimSweepPath(g, from);
      if (!path.length) continue;
      const head = path[path.length - 1];
      const { frames, total } = traceSweep(from, path);
      traces++; framesTotal += frames.length;
      fewestFrames = Math.min(fewestFrames, frames.length);
      shortestMs = Math.min(shortestMs, total); longestMs = Math.max(longestMs, total);
      if (frames.length < 2) { problems.push(`seed ${seed}: ${from} produced ${frames.length} frame(s)`); continue; }

      // ── 1. STARTS ON THE SQUARE THE PLAYER CLICKED ─────────────────────────────────────────
      // This is defect 1, as a number. The pre-fix animation's first painted position was the
      // square AFTER the one clicked, so the boat was never shown arriving in the trade winds.
      const f0 = frames[0];
      if (Math.hypot(f0.x - from[0], f0.y - from[1]) > 1e-6) {
        problems.push(`seed ${seed}: first frame is (${f0.x.toFixed(2)},${f0.y.toFixed(2)}), not the clicked square ${from}`);
      }
      // ── 2. ENDS ON THE WHIRLPOOL ───────────────────────────────────────────────────────────
      const fz = frames[frames.length - 1];
      if (Math.hypot(fz.x - head[0], fz.y - head[1]) > 1e-6) {
        problems.push(`seed ${seed}: last frame is (${fz.x.toFixed(2)},${fz.y.toFixed(2)}), not the arc head ${head}`);
      }

      const gaps = [];
      let backwards = 0, prevProgress = -1;
      for (let i = 1; i < frames.length; i++) {
        gaps.push(Math.hypot(frames[i].x - frames[i - 1].x, frames[i].y - frames[i - 1].y));
        if (frames[i].t < prevProgress) backwards++;
        prevProgress = frames[i].t;
      }
      const maxGap = Math.max(...gaps), medGap = median(gaps);
      worstGap = Math.max(worstGap, maxGap);
      worstRatio = Math.max(worstRatio, medGap > 0 ? maxGap / medGap : Infinity);

      // ── 3. SMOOTH, NOT A STAIRCASE ─────────────────────────────────────────────────────────
      // Defect 2, as a number — and the metric matters more than it looks.
      //
      // The FIRST version of this assertion capped the absolute distance per frame and failed the
      // shipped animation at 0.60 cells. That was the measurement being wrong, not the animation:
      // 0.60 cells in one frame at 60fps is simply fast, and fast is not jerky. What makes a
      // staircase a staircase is that it DOES NOT MOVE on most frames and then jumps. Measured at
      // the same frame rate, on the same 17-cell arc:
      //
      //     today   max 0.602  median 0.158  ratio 3.8   <- the easing hump, and correct
      //     stepper max 1.41   median 0.00   ratio 1.4e9 <- dwells, then jumps
      //
      // So the discriminator is the RATIO of the largest frame step to the typical one, plus the
      // simple fact that the typical one is not zero. Both are scale-free: they stay meaningful if
      // the sweep is ever retuned faster or slower, which an absolute cap would not.
      if (!(medGap > 0)) {
        problems.push(`seed ${seed}: ${from} does not move on a typical frame (median ${medGap}) — it dwells and jumps, which is a staircase`);
      } else if (maxGap / medGap > 8) {
        problems.push(`seed ${seed}: ${from} has a max/median frame step of ${(maxGap / medGap).toFixed(1)} (today's easing gives ~3.8) — the motion is dwelling and then jumping`);
      }
      // and a separate absolute sanity cap, so a future "make it snappier" cannot turn the sweep
      // into a blur that technically passes the ratio test by being uniformly too fast
      if (maxGap > 1.0) problems.push(`seed ${seed}: ${from} covers ${maxGap.toFixed(2)} cells in a single frame — too fast to read as travel`);
      // ── 4. NEVER TRAVELS BACKWARDS ─────────────────────────────────────────────────────────
      if (backwards) problems.push(`seed ${seed}: ${from} goes backwards ${backwards} time(s)`);

      // ── 5. STAYS ON THE RING ───────────────────────────────────────────────────────────────
      // The other half of defect 1: the boat used to cut the CHORD across the middle of the board.
      for (const f of frames) {
        const r = Math.hypot(f.x - cx, f.y - cy);
        worstDrift = Math.max(worstDrift, Math.max(0, rMin - r, r - rMax));
        if (r < rMin - 0.75 || r > rMax + 0.75) {
          problems.push(`seed ${seed}: ${from} strays to radius ${r.toFixed(2)}, outside the ring band ${rMin.toFixed(2)}..${rMax.toFixed(2)} — it is cutting across the board`);
          break;
        }
      }

      // ── 6. THE EASING IS ACTUALLY APPLIED ──────────────────────────────────────────────────
      // The winds should take hold and the whirlpool should receive the boat. If the ease were
      // dropped the motion would be linear and this hump would flatten — a silent loss of feel
      // that nothing else in the suite would notice.
      const speedAt = (frac) => {
        const i = Math.max(1, Math.min(frames.length - 1, Math.round(frac * (frames.length - 1))));
        return Math.hypot(frames[i].x - frames[i - 1].x, frames[i].y - frames[i - 1].y);
      };
      const mid = speedAt(0.5), start = speedAt(0.06), end = speedAt(0.97);
      if (!(mid > start * 1.5 && mid > end * 1.5)) {
        problems.push(`seed ${seed}: ${from} is not eased — mid-sweep speed ${mid.toFixed(4)} vs ${start.toFixed(4)}/${end.toFixed(4)} at the ends`);
      }

      // ── 7. DURATION IS IN RANGE ────────────────────────────────────────────────────────────
      if (total < RIM_SWEEP_MIN_MS || total > RIM_SWEEP_MAX_MS) {
        problems.push(`seed ${seed}: ${from} runs ${total}ms, outside ${RIM_SWEEP_MIN_MS}..${RIM_SWEEP_MAX_MS}`);
      }
    }
  }

  // ANTI-VACUITY: this whole file is worthless if the loops above never produced a trace, and a
  // "0 problems" pass would look identical to a real one. Assert the work happened.
  checkTrue(`ANTI-VACUITY: traces were actually produced (${traces} sweep(s), ${framesTotal} frame(s))`, traces > 50 && framesTotal > 2000);
  check(`TRACE: every sweep starts on the clicked square, ends on the whirlpool, stays on the ring, is smooth and eased — ${traces} sweep(s) over 8 seeds; largest frame step ${worstGap.toFixed(3)} cells, worst max/median ratio ${worstRatio.toFixed(1)}, max drift off the ring ${worstDrift.toFixed(3)} cells, fewest frames ${fewestFrames}, ${shortestMs}..${longestMs}ms${problems.length ? " — " + problems.slice(0, 4).join("; ") : ""}`, problems.length, 0);
  checkTrue(`TRACE: even the shortest sweep has enough frames to read as continuous (${fewestFrames})`, fewestFrames >= 20);
}

/* ================= Red-proof: the old stepper must FAIL this harness ================= */
// A gate that has never rejected anything is decoration. Replay the ACTUAL pre-2026-07-31 motion —
// the per-square stepper, one whole cell per paint — through the same measuring apparatus and
// confirm the smoothness assertion rejects it.
{
  const g = new EngineGame(engineRoundCfg(["balanced", "balanced", "balanced", "balanced"]), 3, true);
  const ring = g.rimCellInfo || [];
  const rc = ring.find((c) => rimSweepPath(g, [c.x, c.y]).length >= 3);
  checkTrue("RED-PROOF: found a real board and a real arc to replay the old stepper on", !!rc);
  if (rc) {
    const from = [rc.x, rc.y];
    const path = rimSweepPath(g, from);
    // The old motion sampled AT THE SAME FRAME RATE this harness uses. Modelling it as one frame
    // per cell would be the wrong red-proof: it would show a steady 1.0 per frame and read as
    // merely "fast". What the eye actually saw was the ship HOLDING STILL for ~6 frames and then
    // jumping a whole cell, and that dwell is the defect. RIM_SWEEP_STEP_MS was 95ms.
    const STEP_MS = 95;
    const stepperFrames = [];
    for (let ms = 0; ms < STEP_MS * path.length; ms += RIM_SWEEP_TICK_MS) {
      const c = path[Math.min(path.length - 1, Math.floor(ms / STEP_MS))];
      stepperFrames.push({ x: c[0], y: c[1] });
    }
    const sGaps = [];
    for (let i = 1; i < stepperFrames.length; i++) sGaps.push(Math.hypot(stepperFrames[i].x - stepperFrames[i - 1].x, stepperFrames[i].y - stepperFrames[i - 1].y));
    const sMed = median(sGaps), sMax = Math.max(...sGaps);
    checkTrue(`RED-PROOF: the old stepper does not move on a typical frame (median ${sMed.toFixed(2)}, max ${sMax.toFixed(2)}) — the dwell-and-jump assertion can fail`, !(sMed > 0));
    checkTrue("RED-PROOF: the old stepper's first frame was NOT the clicked square — the starts-where-you-clicked assertion can fail", Math.hypot(stepperFrames[0].x - from[0], stepperFrames[0].y - from[1]) > 1e-6);

    // and today's motion clears the same bars on the same board
    const { frames } = traceSweep(from, path);
    const cGaps = [];
    for (let i = 1; i < frames.length; i++) cGaps.push(Math.hypot(frames[i].x - frames[i - 1].x, frames[i].y - frames[i - 1].y));
    const cMed = median(cGaps), cRatio = Math.max(...cGaps) / cMed;
    checkTrue(`RED-PROOF: today's motion moves on every frame and stays under the ratio bar (median ${cMed.toFixed(3)}, ratio ${cRatio.toFixed(1)})`, cMed > 0 && cRatio <= 8);
  }
}

/* ================= Degenerate inputs ================= */
{
  check("EDGE: an empty curve yields no point rather than throwing", rimSweepPointAt([], 0.5), null);
  check("EDGE: a null curve yields no point rather than throwing", rimSweepPointAt(null, 0.5), null);
  const c = rimSweepCurve([[0, 0], [1, 0]]);
  checkTrue("EDGE: progress is clamped below 0", !!rimSweepPointAt(c, -5));
  checkTrue("EDGE: progress is clamped above 1", !!rimSweepPointAt(c, 5));
  checkTrue(`EDGE: a 1-cell arc still clears the minimum duration (${rimSweepDurationMs(1)}ms)`, rimSweepDurationMs(1) >= RIM_SWEEP_MIN_MS);
  checkTrue(`EDGE: a 40-cell arc is capped (${rimSweepDurationMs(40)}ms, uncapped would be ${RIM_SWEEP_MS_PER_CELL * 40}ms)`, rimSweepDurationMs(40) === RIM_SWEEP_MAX_MS);
}

console.log(`\n${failures ? `FAILED — ${failures} failing check(s)` : "PASSED — 0 failing check(s)"}`);
process.exit(failures ? 1 : 0);
