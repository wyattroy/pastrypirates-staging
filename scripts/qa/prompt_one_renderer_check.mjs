/* ONE RENDERER DRAWS EVERY PROMPT — and no tier may grow a second.
 *
 *   node scripts/qa/prompt_one_renderer_check.mjs
 *
 * ============================================================================
 *  Why this gate exists
 * ============================================================================
 * Wyatt, 2026-09-09, having found the guest's recipe picker naming the HOST:
 *   "No second renderers! We need one renderer. Why is the guest using a second renderer?"
 *
 * It was using one because `watchDraftPrompt` hand-rolled `<div class="apMsg">…<div class="apBtns
 * recipes">` itself and re-derived the SAME rule renderAskPrompt uses one file away. Two renderers
 * for one card — so when the seat was published in one of them, every mode that could be driven
 * locally went green and the guest stayed broken.
 *
 * ⚠ AND IT HAD HAPPENED BEFORE. `watchPrompt` was converged onto the one renderer on 2026-08-28
 * ("FORK 2 CONVERGED"), with a comment explaining exactly why. The draft channel was not, and
 * nothing noticed for twelve days, because nothing was watching. A convergence with no gate is a
 * convergence that lasts until the next person needs a prompt in a hurry.
 *
 * ============================================================================
 *  What is actually invariant
 * ============================================================================
 * `optionButtonsHTML()` is the one definition of what an option button is. Anything that calls it
 * is, by definition, drawing a prompt's option row — so the rule is simply:
 *
 *     ONLY src/ui/flow.js MAY CALL optionButtonsHTML().
 *
 * Everything else asks flow.js to draw (localAsk / renderAskPrompt) and keeps only its own RESPONSE
 * mechanism — which is the sanctioned host/guest difference: who COMPUTES, never who DRAWS.
 *
 * NOT GATED, ON PURPOSE: one-off single-button barriers (pass-the-wheel, the bake-off intro, a
 * reconnecting notice) build their own `<div class="apBtns">` with one button in it. Those are
 * notices, not choices — no option array, nothing to keep in step — and a gate that called them
 * drift would train people to ignore it.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let bad = 0;
const pass = m => console.log("  PASS  " + m);
const fail = m => { bad++; console.log("  FAIL  " + m); };

const SRC = path.join(REPO, "src");
const files = [];
(function walk(d){ for (const e of fs.readdirSync(d, { withFileTypes: true })) {
  const f = path.join(d, e.name);
  if (e.isDirectory()) walk(f); else if (e.name.endsWith(".js")) files.push(f);
} })(SRC);

/* Comments are stripped first. Two of this repo's gates have been fooled by their own subject
   being described in prose — the sail-order gate most recently — and the notes above and in
   orchestrator.js both NAME optionButtonsHTML while no longer calling it. */
const strip = s => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

const OWNER = path.join("src", "ui", "flow.js");
const callers = [];
for (const f of files) {
  const rel = path.relative(REPO, f);
  const code = strip(fs.readFileSync(f, "utf8"));
  if (!/optionButtonsHTML\s*\(/.test(code)) continue;
  if (rel === OWNER || rel === path.join("src", "ui", "util.js")) continue;  // the renderer and its definition
  callers.push(rel);
}

console.log("ONE RENDERER draws every prompt — no tier may grow a second\n");

/* INSTRUMENT REACHED ITS SUBJECT. If optionButtonsHTML is renamed or gone, silence below means
   nothing at all — the same anti-vacuity check every gate in this directory carries. */
const ownerHas = /optionButtonsHTML\s*\(/.test(strip(fs.readFileSync(path.join(REPO, OWNER), "utf8")));
ownerHas
  ? pass(`instrument reached its subject — ${OWNER} calls optionButtonsHTML()`)
  : fail(`cannot find optionButtonsHTML() in ${OWNER} — re-anchor this gate, do not delete it`);

callers.length === 0
  ? pass("no file outside the renderer builds a prompt's option row")
  : fail(`${callers.length} file(s) build their own option row: ${callers.join(", ")} — ` +
         `they must call localAsk()/renderAskPrompt() and keep only their own response mechanism`);

/* RED PROOF — the check can FAIL. A gate that has never been seen red is a gate nobody can trust,
   and this repo has shipped two that could not fail at all. */
const mutant = strip(`
  // a tier growing its own renderer again
  panel('<div class="apMsg">'+msg+'</div><div class="apBtns">'+optionButtonsHTML(opts)+'</div>');
`);
/optionButtonsHTML\s*\(/.test(mutant)
  ? pass("RED-PROOF: a hand-rolled option row in another tier would be caught")
  : fail("RED-PROOF FAILED: the detector does not match a hand-rolled option row");

console.log(bad ? `\nFAILED — ${bad} problem(s)` : "\nPASSED — one renderer, and nothing else draws a prompt");
process.exit(bad ? 1 : 0);
