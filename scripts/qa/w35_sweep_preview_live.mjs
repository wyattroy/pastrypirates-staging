/* W3-5 — DOES THE TRADE-WIND PREVIEW ACTUALLY CLEAR? Measured in a browser, with real clicks.
 *
 *   node scripts/qa/w35_sweep_preview_live.mjs
 *
 * WYATT: "A trade-wind square's preview stays on screen after you click a trade-wind square and
 * then click a yellow sailing square. It should be removed."
 *
 * WHY THIS EXISTS WHEN A GATE ALREADY PASSES. scripts/qa/w35_sweep_preview_check.mjs reads the
 * source and says "so tapping a plain yellow square clears it" — a claim about RUNTIME made from
 * TEXT, which is the fault eleven consecutive CEO reviews have named. The text really is right;
 * that is not the point. Nobody had watched it happen.
 *
 * IT IS A STATE QUESTION, NOT A RATE (rule 26). One board that offers both kinds of square answers
 * it completely, so this poses one and clicks it rather than sampling voyages for an hour.
 *
 * REAL MOUSE EVENTS THROUGH CDP, not el.click(). The lesson is already in this repo's ledger from
 * the End of Voyage work: a synthetic wheel event never scrolls anything, and only a trusted one
 * does. Clicks are less fragile than wheels, but the guard being tested calls stopPropagation and
 * preventDefault on a capture-phase document listener — exactly where a synthetic event's
 * differences would show. So the taps are real.
 *
 * IT CAN FAIL HONESTLY: no swept square, or no preview drawn, and it says NOT RUN.
 */
import { serve, launch, attach, killAll, sleep, driverOff } from "../mp_rig.mjs";

const PORT = 8524, DBG = 9426;
const url = serve(PORT);
launch(DBG, "/tmp/chrome-w35");
const C = await attach(DBG);
await C.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });

const tap = async (x, y) => {
  for (const type of ["mousePressed", "mouseReleased"])
    await C.send("Input.dispatchMouseEvent", { type, x, y, button: "left", clickCount: 1 });
};
const PREVIEW = `(()=>{const n=document.querySelectorAll('.sweepPath,.sweepEnd,.sweepGhost');
  return JSON.stringify({n:n.length, kinds:[...new Set([...n].map(e=>e.getAttribute('class')||e.tagName))]});})()`;

console.log("W3-5 — the trade-wind preview, clicked for real.\n");
await C.ev(`location.href=${JSON.stringify(url)}`); await sleep(2500);
await C.ev(`localStorage.clear()`); await C.ev(`location.reload()`); await sleep(2500);
await C.ev(`document.getElementById('choiceSolo').click()`);
for (let i = 0; i < 40; i++) {
  if (await C.ev(`(()=>{const b=document.getElementById('btnNameConfirm');return !!(b&&b.offsetParent)})()`) === true) break;
  await sleep(250);
}
await C.ev(`(()=>{const i=document.getElementById('nameModalInput');if(i)i.value='Wyatt';return !!i})()`);
await C.ev(`document.getElementById('btnNameConfirm').click()`);

/* Drive only until a prompt offers BOTH kinds, then stop driving so the taps are mine. */
const { DRIVER_SRC } = await import("../mp_rig.mjs");
await sleep(1500);
await C.ev(DRIVER_SRC(url));
const FIND = `(()=>{const sw=document.querySelector('.sailCell.sailSwept');
  const pl=[...document.querySelectorAll('.sailCell')].find(c=>!c.classList.contains('sailSwept'));
  if(!sw||!pl) return "no";
  const a=sw.getBoundingClientRect(), b=pl.getBoundingClientRect();
  return JSON.stringify({sx:Math.round(a.left+a.width/2), sy:Math.round(a.top+a.height/2),
                         px:Math.round(b.left+b.width/2), py:Math.round(b.top+b.height/2)});})()`;
/* POSE IT, DO NOT WAIT FOR IT — rule 26, which this probe was violating while its ledger row
   claimed to embody it. CEO Review 28 ran the committed version twice, unmodified, and got
   "NOT RUN — no prompt offered a trade-wind square AND a plain one together" both times: about
   seventeen minutes of driving for nothing. It was hunting a rate.
   `sweepGuard` reads exactly two things off a square — the `sailSwept` class and `data-sweptTo`
   (src/ui/stage.js:1932, :1956) — so promoting one ordinary square is a complete and honest pose:
   the code under test cannot tell the difference, because there is no difference it can see.
   Only ever promotes when the board has not offered one itself. */
await C.ev(`(()=>{const cs=[...document.querySelectorAll('.sailCell')];
  if(cs.length<2||cs.some(c=>c.classList.contains('sailSwept')))return "as dealt";
  const c=cs[0], g=appState_unused=>0;
  c.classList.add('sailSwept');
  if(!c.dataset.sweptTo){const o=cs[cs.length-1];c.dataset.sweptTo=(o.dataset.gx||0)+","+(o.dataset.gy||0);}
  return "posed";})()`).catch(()=>{});

let spot = null;
for (let i = 0; i < 1500; i++) {                          // bounded — rule 17
  await C.ev(`(()=>{const cs=[...document.querySelectorAll('.sailCell')];
    if(cs.length<2||cs.some(c=>c.classList.contains('sailSwept')))return 0;
    const c=cs[0];c.classList.add('sailSwept');
    if(!c.dataset.sweptTo){const o=cs[cs.length-1];c.dataset.sweptTo=(o.dataset.gx||0)+","+(o.dataset.gy||0);}
    return 1;})()`).catch(()=>{});
  const s = await C.ev(FIND);
  if (s && s !== "no") { spot = JSON.parse(s); break; }
  await sleep(200);
}
if (!spot) { killAll(); console.log("=== NOT RUN — no prompt offered a trade-wind square AND a plain one together."); process.exit(1); }
await driverOff(C);
await sleep(300);

console.log(`  found a prompt with both: trade-wind at ${spot.sx},${spot.sy}  plain at ${spot.px},${spot.py}`);
console.log(`  before any tap: ${await C.ev(PREVIEW)}`);

/* STEP 1 — tap the trade-wind square. The preview must APPEAR. This is the half that makes the
   next assertion meaningful: without a drawn preview, "it cleared" is vacuously true. */
/* THE SAME RULE FOR THE FIRST TAP, WHICH I HAD APPLIED ONLY TO THE SECOND. CEO Review 28's rule is
   that an instrument must assert it touched its subject in the same breath as its result — and I
   guarded tap 2 and left tap 1 on a coordinate measured earlier in the loop. On a tree with the bug
   reinstated that made the difference between a clean FAIL and an unhelpful NOT RUN: the first tap
   missed, no preview was drawn, and the probe correctly refused — but refused about the wrong
   thing. Re-measured and checked here, so "no preview appeared" can only ever mean the code did
   not draw one. */
const sw = await C.ev(`(()=>{const c=document.querySelector('.sailCell.sailSwept'); if(!c) return "gone";
  const r=c.getBoundingClientRect();
  const x=Math.round(r.left+r.width/2), y=Math.round(r.top+r.height/2);
  const el=document.elementFromPoint(x,y), hit=el&&el.closest&&el.closest('.sailCell');
  return JSON.stringify({x:x,y:y,onSwept:!!(hit&&hit.classList.contains('sailSwept'))});})()`);
if (sw === "gone") { killAll(); console.log("\n=== NOT RUN — the trade-wind square vanished before it could be tapped."); process.exit(1); }
const SW = JSON.parse(sw);
if (!SW.onSwept) { killAll(); console.log(`\n=== NOT RUN — the point to be tapped is not on the trade-wind square, so a missing preview would prove nothing.`); process.exit(1); }
await tap(SW.x, SW.y);
await sleep(700);
const shown = JSON.parse(await C.ev(PREVIEW));
console.log(`  after tapping the trade-wind square: ${shown.n} preview element(s) ${shown.kinds.length ? "— " + shown.kinds.join(", ") : ""}`);
if (!shown.n) { killAll(); console.log("\n=== NOT RUN — the first tap drew no preview at all, so there is nothing to clear and this proves nothing."); process.exit(1); }

/* STEP 2 — now tap a PLAIN yellow square. Wyatt's report is that the preview survives this.
   RE-MEASURE FIRST, AND PROVE THE TAP LANDS ON A SQUARE. CEO Review 28 broke the first version of
   this probe by reinstating W3-5's bug and watching it still PASS: the FIRST tap calls camFull()
   (src/ui/stage.js:1955), #sailHost is camera-transformed (CAM_HTML_LAYERS, :396), so every sail
   square MOVES — and the probe then tapped a coordinate measured before the glide. It hit board
   artwork 131px away, and tapping empty sea clears the preview through the `!cell` branch, which
   worked before the fix too. A tap on the sea and a tap on a square produced the same number, and
   the probe recorded the number.
   So the coordinate is taken AFTER the camera settles, and the element under it is checked before
   the tap counts. An instrument must assert that it touched its subject in the same breath as its
   result — the rule CEO 28 named, applied here. */
const land = await C.ev(`(()=>{const pl=[...document.querySelectorAll('.sailCell')].find(c=>!c.classList.contains('sailSwept'));
  if(!pl) return "gone";
  const r=pl.getBoundingClientRect();
  const x=Math.round(r.left+r.width/2), y=Math.round(r.top+r.height/2);
  const el=document.elementFromPoint(x,y);
  const hit=el&&el.closest&&el.closest('.sailCell');
  return JSON.stringify({x:x,y:y,onSquare:!!hit,swept:!!(hit&&hit.classList.contains('sailSwept')),
    was:${JSON.stringify([spot.px, spot.py])}});})()`);
if (land === "gone") { killAll(); console.log("\n=== NOT RUN — the plain square vanished before it could be tapped."); process.exit(1); }
const L = JSON.parse(land);
console.log(`  the plain square moved from ${L.was.join(",")} to ${L.x},${L.y} (the first tap zooms the camera out)`);
if (!L.onSquare || L.swept) {
  killAll();
  console.log(`\n=== NOT RUN — the point to be tapped is not on a plain sail square (onSquare:${L.onSquare} swept:${L.swept}).`);
  console.log(`    Tapping anything else clears the preview through the \`!cell\` branch, which worked before the fix too —`);
  console.log(`    so a PASS from here would prove nothing. That is exactly how the first version of this probe passed on a broken tree.`);
  process.exit(1);
}
await tap(L.x, L.y);
await sleep(700);
const after = JSON.parse(await C.ev(PREVIEW));
console.log(`  after tapping a plain yellow square: ${after.n} preview element(s) ${after.kinds.length ? "— " + after.kinds.join(", ") : ""}`);
killAll();
console.log(after.n
  ? `\n=== FAIL — the preview is still on the board after tapping a plain square. That is exactly what he reported.`
  : `\n=== PASS — the preview was drawn by the first tap and was gone after tapping a plain square. Watched, not read off the source.`);
process.exit(after.n ? 1 : 0);
