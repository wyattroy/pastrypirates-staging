/* W6-1 — A GREYED SLIDER MUST HAVE NOWHERE TO GO.
 *
 * Wyatt asked for the broke-purse case: "'Would ye offer any coin on top?' appears with NO SLIDER
 * when the player has no money left. Expectation: the slider appears greyed out." W6-1 shipped it.
 *
 * WHAT IT COST, AND WHY THIS GATE EXISTS. The 2026.08.29.1 sea trial reported the coin slider as a
 * DEAD CONTROL on 7 legs of 10 — 12 of them on one leg, against `slider:9/9` on every leg the night
 * before. The game was right and the instrument was wrong: `scripts/lib/player.mjs` only ever asked
 * "did the readout move", and until W6-1 there was no slider on screen at all in this case, so it
 * had never had to tell "turned off on purpose" from "broken". It has been taught the difference —
 * AND THAT TEACHING RESTS ON AN INVARIANT THIS GATE HOLDS.
 *
 * THE INVARIANT: the game greys a slider ONLY where it also gives it a single value. `disabled:true`
 * appears in exactly one call, and that same call passes `max:min`, so there is literally nowhere to
 * drag to. The moment somebody greys a slider that HAS room to move, the probe's new rule would be
 * excusing a real defect — so the probe now flags exactly that case, and this gate stops the source
 * drifting under it.
 *
 * THIS GATE READS SOURCE TEXT AND CLAIMS ONLY THINGS ABOUT SOURCE TEXT (CEO Review 21's rule).
 * Whether a player can drag the bar is scripts/lib/player.mjs's business, inside a sea trial.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
/* ONE STRIPPER (2026-08-29). Every gate carried its own copy that deletes BLOCK comments
   first — so a LINE comment containing the characters that open one swallowed 152 lines of
   src/orchestrator.js, the whole import block included. MEASURED: it also blinded 10 lines
   of src/shared/index.js and 10 of src/ui/util.js. scripts/qa/lib/strip_comments.mjs. */
import { stripComments as sharedStrip } from "./lib/strip_comments.mjs";
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const pass = m => console.log("PASS " + m);
const fail = m => { console.log("FAIL " + m); fails++; };

/* Search the whole UI tier, not just the file that happens to carry it today — a second greyed
   slider added elsewhere is exactly the drift this is here to catch. */
const files = ["src/ui/flow.js", "src/ui/util.js", "src/ui/panel.js", "src/ui/board.js", "src/orchestrator.js"];
const specs = [];
for (const f of files) {
  const src = sharedStrip(fs.readFileSync(path.join(REPO, f), "utf8"));
  /* ONE LEVEL OF NESTING, because the real spec carries `ref:{value:min}` and a flat `[^{}]*`
     stops dead at it — the first run of this gate reported "no greyed slider exists any more"
     about the tree that has one, which is the instrument-cannot-reach-its-subject fault this
     project keeps paying for. Caught by red-proofing, which is what red-proofing is for. */
  for (const m of src.matchAll(/\{\s*slider\s*:\s*\{((?:[^{}]|\{[^{}]*\})*)\}/g)) specs.push({ file: f, body: m[1] });
}

if (!specs.length) fail("found no `{slider:{…}}` specs anywhere in the UI tier — re-anchor this gate, do not delete it");
else {
  const greyed = specs.filter(s => /disabled\s*:\s*true/.test(s.body));
  const roomToMove = greyed.filter(s => !/\bmax\s*:\s*min\b(?!\s*[+\-*/])/.test(s.body));
  if (!greyed.length)
    fail(`no greyed slider exists any more (${specs.length} slider spec(s) found) — W6-1 is the ask that a broke purse still SEES the control; if it was deliberately reverted, delete this gate in the same commit and say so`);
  else if (!roomToMove.length)
    pass(`every greyed slider is pinned to one value — ${greyed.length} of ${specs.length} spec(s) carry disabled:true, and each passes \`max:min\`, so the probe may treat it as turned-off rather than broken`);
  else
    fail(`a slider is greyed while it still has room to move (${roomToMove.map(s => s.file + ": " + s.body.replace(/\s+/g, " ").slice(0, 70)).join(" | ")}) — the sea trial's probe now EXCUSES a disabled slider, so this would hide a control a player can see, needs, and cannot use`);
}

/* …AND THE PROBE STILL HAS TO BE ABLE TO CATCH IT. A gate holding an invariant is worth nothing if
   the thing relying on it stopped checking. */
const probe = fs.readFileSync(path.join(REPO, "scripts/lib/player.mjs"), "utf8");
const checksRoom = /s\.disabled/.test(probe) && /s\.min\s*===\s*s\.max/.test(probe)
  && /greyed with room to move/.test(probe);
if (checksRoom)
  pass("the sea trial's probe still refuses a greyed slider that has room to move, rather than excusing every disabled one");
else
  fail("scripts/lib/player.mjs no longer distinguishes a slider pinned to one value from one greyed with room to move — it is back to excusing (or condemning) every disabled slider alike");

console.log(fails ? `\nFAILED — ${fails} failure(s)`
  : "\nPASSED — the source greys a slider only where it also pins it to one value, and the trial's probe still fails a greyed slider that has somewhere to go.");
process.exit(fails ? 1 : 0);
