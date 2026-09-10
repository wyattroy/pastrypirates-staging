/* LOOSENING A CHECK IS HOW A SUITE QUIETLY STOPS MEANING ANYTHING — so this proves it did not.
 *
 *   node scripts/qa/checks_pointer_events_redproof.mjs
 *
 * ============================================================================
 *  What changed, and why it needed proving
 * ============================================================================
 * scripts/lib/checks.mjs counts "controls the player must be able to reach" and fails when one is
 * covered. It excluded display:none, visibility:hidden, opacity and zero size — but NEVER asked
 * about pointer-events. So an element the BROWSER ITSELF refuses to deliver a click to was counted
 * as an unreachable control.
 *
 * That is not academic: the recipe picker is a STACK of two cards by design, and the card behind is
 * deliberately pointer-events:none / aria-hidden / out of the tab order, with a separate reachable
 * control (.pp4RcPeek) over its visible sliver. The sea trial reported it as a covered clickable on
 * every leg, ten of ten. index.html claimed that arrangement "cannot fail the structural check
 * because it is not a clickable at all" — the claim was FALSE, and the check's definition was the
 * thing that was wrong.
 *
 * ⚠ BUT A CHECK THAT WAS MADE TO STOP FAILING IS WORTHLESS UNLESS IT CAN STILL FAIL. This holds
 * BOTH halves in one run, against a real DOM in a real browser:
 *
 *     A. a covered element with pointer-events:none   -> must NOT be reported  (the fix)
 *     B. a covered element that IS clickable          -> must STILL be reported (the bar)
 *
 * If B ever stops failing, the structural check has been gutted and this says so.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { serve, launch, attach, killAll, sleep } from "../mp_rig.mjs";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const PORT = 8960 + (process.pid % 40), DBG = 9960 + (process.pid % 40);
const url = serve(PORT);
launch(DBG, path.join(REPO, `.tmp-pe-${process.pid}`));
const C = await attach(DBG);
let bad = 0;
const pass = m => console.log("  PASS  " + m);
const fail = m => { bad++; console.log("  FAIL  " + m); };

/* The exact predicate checks.mjs now uses, applied to a purpose-built page. Reproduced rather than
   imported because checks.mjs is a browser-injected source string, not an importable module — so
   this asserts the RULE, and a drift between the two is caught by the string test at the end. */
const PROBE = `(() => {
  const vis = el => { const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none' || +cs.opacity < 0.05) return false;
    const r = el.getBoundingClientRect(); return r.width > 1 && r.height > 1; };
  const clickable = el => getComputedStyle(el).pointerEvents !== 'none';
  const out = [];
  for (const el of document.querySelectorAll('.apBtn')) {
    if (!vis(el) || !clickable(el)) continue;
    const r = el.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + r.width/2, r.top + r.height/2);
    const top = !!(hit && (hit === el || el.contains(hit) || hit.contains(el)));
    out.push({id: el.id, top, hit: hit ? (hit.id || hit.className || hit.tagName) : null,
              rect:[Math.round(r.left),Math.round(r.top),Math.round(r.width),Math.round(r.height)]});
  }
  return JSON.stringify(out);
})()`;

/* ⚠ THE FIXTURE IS BUILT INTO A REAL SERVED PAGE, NOT A data: URL. The first version navigated to
   a data: URL and the probe found ZERO buttons — it then reported "the check has been gutted",
   which was a verdict about an empty page. A measurement of nothing is not a measurement. */
const FIXTURE = `(() => {
  document.body.style.margin = '0';
  document.body.innerHTML = \`<div style="position:relative;width:400px;height:300px">
    <button class="apBtn" id="backCard" aria-hidden="true" tabindex="-1"
      style="position:absolute;left:40px;top:20px;width:200px;height:100px;pointer-events:none">back</button>
    <button class="apBtn" id="frontCard"
      style="position:absolute;left:10px;top:20px;width:200px;height:100px">front</button>
    <button class="apBtn" id="buried"
      style="position:absolute;left:10px;top:160px;width:200px;height:100px">buried</button>
    <div id="lid" style="position:absolute;left:10px;top:160px;width:200px;height:100px;background:#000"></div>
  </div>\`;
  return document.querySelectorAll('.apBtn').length;
})()`;

try {
  console.log("POINTER-EVENTS: the structural check's definition of a control\n");
  await C.ev(`location.href=${JSON.stringify(url)}`).catch(() => {});
  await sleep(2000);
  const n = await C.ev(FIXTURE);
  n === 3 ? pass(`instrument reached its subject — ${n} buttons built into a real page`)
          : fail(`the fixture did not build (${n} buttons) — everything below is meaningless`);
  await sleep(200);
  const all = JSON.parse(await C.ev(PROBE));
  console.log("  (raw) " + JSON.stringify(all) + "\n");
  const got = all.filter(e => !e.top).map(e => e.id);

  got.includes("backCard")
    ? fail("A: the pointer-events:none card behind is STILL reported — the fix did not take")
    : pass("A: a card behind with pointer-events:none is not counted as an unreachable control");

  got.includes("buried")
    ? pass("B: a genuinely clickable button under an opaque lid IS still reported — the check still bites")
    : fail("B: THE CHECK HAS BEEN GUTTED — a real covered button is no longer reported");

  got.includes("frontCard")
    ? fail("C: the front card is reported covered — its own contents are not pointer-events:none")
    : pass("C: the front card reads as reachable");

  /* AND THE RULE IN checks.mjs MUST BE THE RULE PROVED HERE. Two copies of a predicate is rule 23;
     this asserts the source actually contains the pointer-events filter, so the proof above cannot
     go on passing after somebody removes it. */
  const fs = await import("node:fs");
  const src = fs.readFileSync(path.join(REPO, "scripts/lib/checks.mjs"), "utf8");
  /pointerEvents\s*!==\s*'none'/.test(src) && /\.filter\(vis\)\.filter\(clickable\)/.test(src)
    ? pass("checks.mjs applies the same pointer-events rule this proof exercises")
    : fail("checks.mjs no longer filters on pointer-events — this proof is testing nothing");

  console.log(bad ? `\nFAILED — ${bad} problem(s)` : "\nPASSED — the fix took, and the check still bites");
  process.exitCode = bad ? 1 : 0;
} catch (e) {
  console.log("PROBE FAILED:", e.message);
  process.exitCode = 1;
} finally { killAll(); }
