/* judge_stages_by_basename_check.mjs — the judge must be able to pick up a screenshot on the
 * machine the sea trial actually sails from.
 *
 * WHY THIS EXISTS, MEASURED 2026-09-02 ON WY-BLADE (win32). Every sea trial on this machine
 * reported "1b/2 can the judge open a screenshot? FAIL — the eyes are SHUT", and every one of them
 * then deferred its whole visual half to the queue. 343 screens from the 1914Z release trial were
 * sitting unjudged on the strength of that verdict. THE JUDGE WAS NEVER ASKED. Before any judging
 * happens the screenshots are copied into the child's own scratch folder (see vision.mjs's
 * stageImages and the comment above it — the child cannot open repo paths), and that copy worked
 * the filename out with `String(abs).split("/").pop()`. Handed a path built by `path.join` on
 * Windows, that "basename" is the entire path, so the destination became
 *   <temp>\ppjudge-x\C:\Users\...\sea-trial-shots\crew-desktop-guest-001-settled.png
 * and copyFileSync threw ENOENT. judge_can_see_check.mjs crashed, exited 1, and sea_trial.mjs's
 * step 1b reads a non-zero, non-2 exit as "THE JUDGE CANNOT SEE".
 *
 * THAT IS RULE 6'S FAILURE WEARING A VERDICT'S CLOTHES: an instrument that crashes has told you
 * something about ITSELF, and this one's crash was being reported as a fact about the judge, in the
 * one file rule 24 says to open and believe.
 *
 * WHAT IS CHECKED, AND WHY IT IS THE REAL FUNCTION. This gate imports stageImages from
 * scripts/lib/vision.mjs and runs it — never a re-implementation, which would only test a
 * description of the code (docs/HARD-WON-LESSONS.md §12i). It stages nothing through the network
 * and calls no judge: the fault is entirely in the file copy, so this stays a fast unit gate.
 *
 * THE THREE PATH SHAPES ARE NOT DECORATION — all three occur in this repo today:
 *   - native      path.join(...)                         judge_can_see_check.mjs  (all backslashes on win32)
 *   - mixed       dir + "/" + name                       playtest_gate.mjs's queue entries
 *   - posix       plain forward slashes                  every Mac and every cloud container
 * The mixed one survived the old code by luck, which is exactly why the fault stayed invisible on
 * the machine that writes the queue and fatal on the machine that reads it.
 */
"use strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { stageImages } from "../lib/vision.mjs";

let fails = 0, checks = 0;
const ok = (cond, what) => { checks++; if (!cond) { fails++; console.log("  FAIL — " + what); } else console.log("  ok   — " + what); };

console.log("judge staging check — can the judge pick up a screenshot on THIS machine?\n");

/* A real file with a real screenshot name, in a real temp directory, so the copy has something to
   copy. Never a fixture inside the repo: the whole point is a path the judge's child cannot see. */
const src = fs.mkdtempSync(path.join(os.tmpdir(), "ppjudge-src-"));
const NAME = "crew-desktop-guest-001-settled.png";
const abs = path.join(src, NAME);
fs.writeFileSync(abs, "not a real png, and it does not need to be — this gate never opens it\n");

const shapes = [
  ["native  (path.join — what judge_can_see_check.mjs builds)", abs],
  ["mixed   (dir + \"/\" + name — what playtest_gate.mjs writes into judge-queue.json)", src.split(path.sep).join(path.sep) + "/" + NAME],
  ["posix   (every Mac and every cloud container)", abs.split(path.sep).join("/")],
];

for (const [label, p] of shapes) {
  let staged = null, err = null;
  try { staged = stageImages([p]); } catch (e) { err = e; }
  if (err) { ok(false, `${label} — stageImages threw ${String(err.code || err.message).slice(0, 60)}`); continue; }
  try {
    ok(staged.names[0] === NAME, `${label} — the staged name is the bare basename (got ${JSON.stringify(staged.names[0]).slice(0, 90)})`);
    ok(fs.existsSync(path.join(staged.dir, NAME)), `${label} — the file really lands in the judge's own folder`);
    /* THE NAME IS THE MATCHING KEY, NOT JUST A LABEL. judgeBatch asks the model to echo back each
       screenshot's basename and matches every verdict by it. A name that is not the bare basename
       does not fail loudly — every verdict is dropped as "never mentioned", and a screen nobody
       looked at reads exactly like a screen nobody had to. */
    ok(!/[\\/]/.test(staged.names[0]), `${label} — the name carries no separator, so verdicts can match back to it`);
  } finally { staged.cleanup(); }
}

fs.rmSync(src, { recursive: true, force: true });

console.log(`\n${fails ? "FAIL" : "PASS"} — ${checks - fails}/${checks} checks`);
process.exit(fails ? 1 : 0);
