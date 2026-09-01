/* W1-4 / WYATT'S LEAD — ARE TRADE-WIND SQUARES RENDERED DIFFERENTLY FROM ORDINARY ONES?
 *
 *   node scripts/qa/w14_swept_geometry.mjs
 *
 * HIS WORDS, 2026-08-30: "The zoom out problem may happen because sailable trade winds squares are
 * rendered differently than normal yellow squares."
 *
 * WHY THIS PROBE AND NOT ANOTHER CREW RUN. A 12-minute crew game offered exactly FOUR trade-wind
 * squares — too few to say anything, and the run happened to be anomalously clean (1 bad square in
 * 132). Rates cannot answer this. But the question is not a rate: it is whether a square's DRAWN
 * position agrees with the grid coordinate the renderer stamped on it. That needs one prompt
 * containing both kinds, not a hundred prompts.
 *
 * SOLO, because "rendered differently" is not a host/guest question and solo is the cheapest board
 * that has a trade-wind rim on it.
 *
 * THE TEST: sailHighlightRect (src/ui/flow.js) places every square from its grid cell —
 *   left = (gx*cellPx + inset) / 640 * 100 cqw, and the same for top.
 * So for any two squares the SCREEN distance between them must be the grid distance times one
 * common scale. Fit that scale from the ORDINARY squares, then check every square against it.
 * A square that disagrees is drawn somewhere its coordinates do not predict — which is exactly
 * what "rendered differently" would mean.
 *
 * IT CAN FAIL HONESTLY: no prompt, or no trade-wind square in the prompt, and it says NOT RUN.
 */
import { serve, launch, attach, killAll, sleep } from "../mp_rig.mjs";

const PORT = 8522, DBG = 9424;
const url = serve(PORT);
launch(DBG, "/tmp/chrome-w14geo");
const C = await attach(DBG);
await C.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });

console.log("W1-4 — do trade-wind squares sit where their grid coordinates say?\n");
await C.ev(`location.href=${JSON.stringify(url)}`);
await sleep(2500);
await C.ev(`localStorage.clear()`); await C.ev(`location.reload()`); await sleep(2500);
await C.ev(`document.getElementById('choiceSolo').click()`);
for (let i = 0; i < 40; i++) {
  if (await C.ev(`(()=>{const b=document.getElementById('btnNameConfirm');return !!(b&&b.offsetParent)})()`) === true) break;
  await sleep(250);
}
await C.ev(`(()=>{const i=document.getElementById('nameModalInput');if(i)i.value='Wyatt';return !!i})()`);
await C.ev(`document.getElementById('btnNameConfirm').click()`);

/* CAPTURE ON SIGHT — the driver is not running here, so the prompt simply waits for a human, and
   there is no race with anything answering it. BOUNDED, rule 17. */
const SNAP = `(()=>{
  const cs=[...document.querySelectorAll('.sailCell')];
  if(!cs.length) return "none";
  return JSON.stringify(cs.map(c=>{const r=c.getBoundingClientRect();
    return {gx:+c.dataset.gx, gy:+c.dataset.gy, swept:c.classList.contains('sailSwept'),
            x:r.left, y:r.top, w:r.width, h:r.height};}));})()`;

/* THE DRIVER PLAYS, because a solo game sits waiting for a human at the recipe card and never
   reaches a sail prompt on its own — the first cut of this probe reported NOT RUN for that reason
   alone. It answers the prompt within ~700ms, but this captures ON SIGHT rather than after a
   settle window, so it cannot be outrun: the question here is where a square IS drawn, not where
   it ends up after a camera glide. */
const { DRIVER_SRC } = await import("../mp_rig.mjs");
await sleep(1500);
await C.ev(DRIVER_SRC(url));

/* KEEP LOOKING UNTIL A PROMPT ACTUALLY CONTAINS ONE. The ship starts mid-board, so the first sail
   prompt of a voyage has no rim square in range at all — the first run of this stopped there and
   reported NOT RUN about a question it had not reached. A trade-wind square only appears once the
   ship is within a move of the rim, which takes a few turns. Bounded (rule 17): ~5 minutes of
   200ms samples, then it gives up and says so. Any snapshot WITH a swept square wins immediately;
   the best swept-free one is kept only so the run can still report what it did see. */
let snap = null, fallback = null;
for (let i = 0; i < 1500; i++) {
  const s = await C.ev(SNAP);
  if (s && s !== "none") {
    const cells = JSON.parse(s);
    if (cells.some(c => c.swept)) { snap = cells; break; }
    if (!fallback || cells.length > fallback.length) fallback = cells;
  }
  await sleep(200);
}
if (!snap && fallback) { console.log(`  (no prompt in ~5 minutes offered a trade-wind square; the fullest seen had ${fallback.length})`); snap = fallback; }
killAll();
if (!snap) { console.log("=== NOT RUN — no sail prompt appeared, so nothing was measured."); process.exit(1); }

const swept = snap.filter(c => c.swept), plain = snap.filter(c => !c.swept);
console.log(`  ${snap.length} square(s) on screen: ${plain.length} ordinary, ${swept.length} trade-wind\n`);
if (!swept.length) { console.log("=== NOT RUN — the prompt offered no trade-wind square, so his lead is NOT tested."); process.exit(1); }
if (plain.length < 2) { console.log("=== NOT RUN — too few ordinary squares to fit a scale against."); process.exit(1); }

/* FIT THE SCALE FROM THE ORDINARY SQUARES ONLY, so the trade-wind ones are judged against a rule
   they had no part in setting. Two squares differing in gx give px-per-grid-x, and likewise y. */
const fit = (cells, key, axis) => {
  let best = null;
  for (let i = 0; i < cells.length; i++) for (let j = i + 1; j < cells.length; j++) {
    const dg = cells[j][key] - cells[i][key];
    if (Math.abs(dg) < 1) continue;
    const d = (cells[j][axis] - cells[i][axis]) / dg;
    if (!best || Math.abs(dg) > best.dg) best = { s: d, dg: Math.abs(dg), o: cells[i][axis] - cells[i][key] * d };
  }
  return best;
};
const fx = fit(plain, "gx", "x"), fy = fit(plain, "gy", "y");
if (!fx || !fy) { console.log("=== NOT RUN — the ordinary squares do not span both axes; no scale to fit."); process.exit(1); }
console.log(`  scale fitted from the ORDINARY squares alone: ${fx.s.toFixed(2)}px per grid-x, ${fy.s.toFixed(2)}px per grid-y\n`);

let worstPlain = 0, worstSwept = 0;
const rows = [];
for (const c of snap) {
  const ex = fx.o + c.gx * fx.s, ey = fy.o + c.gy * fy.s;
  const dx = c.x - ex, dy = c.y - ey;
  const err = Math.max(Math.abs(dx), Math.abs(dy));
  if (c.swept) worstSwept = Math.max(worstSwept, err); else worstPlain = Math.max(worstPlain, err);
  rows.push({ ...c, dx, dy, err });
}
rows.sort((a, b) => b.err - a.err).slice(0, 8).forEach(r =>
  console.log(`    grid ${String(r.gx).padStart(2)},${String(r.gy).padStart(2)}${r.swept ? " TRADE-WIND" : "           "}  drawn at ${Math.round(r.x)},${Math.round(r.y)}  off by ${r.dx.toFixed(1)},${r.dy.toFixed(1)}px`));
console.log(`\n  worst disagreement, ordinary squares:   ${worstPlain.toFixed(1)}px`);
console.log(`  worst disagreement, trade-wind squares: ${worstSwept.toFixed(1)}px`);
const verdict = worstSwept > worstPlain + 2;
console.log(verdict
  ? `\n=== HIS LEAD IS RIGHT — trade-wind squares are drawn where their coordinates do not predict, and ordinary ones are not.`
  : `\n=== NOT SUPPORTED — both kinds sit where their grid coordinates say, within ${Math.max(worstPlain, worstSwept).toFixed(1)}px. Whatever moves the squares moves ALL of them; the trade-wind ones are simply the rim, so they fall off first.`);
process.exit(0);
