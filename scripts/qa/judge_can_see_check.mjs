#!/usr/bin/env node
/* judge_can_see_check.mjs — CAN THE VISION JUDGE ACTUALLY OPEN A SCREENSHOT?
 *
 * WHY THIS EXISTS. On 2026-08-30 a FULL sea trial sailed every leg and its judge returned
 * "unparseable judge reply" 1494 times and hard-failed 120 more. The structural half of that run
 * was real; the eyes were shut for all of it, and nothing said so until someone counted.
 *
 * THE CAUSE, bisected with real calls rather than read: the judge is deliberately run from a TEMP
 * DIRECTORY (scripts/lib/vision.mjs, judgeEnv) because a child `claude -p` that inherits the repo
 * cwd loads .claude/settings.json, runs this project's hooks, and goes off to write a checklist
 * instead of a verdict — measured 2026-08-28, 75 calls lost that way. THAT PROTECTION IS WHY THE
 * CHILD CAN NO LONGER READ THIS REPO'S OWN PNGs. One fix caused the next failure.
 *
 *   0 images                     -> clean reply
 *   1 image by absolute path     -> clean verdict
 *   2 and 3 images               -> "I don't have permission to read those files."
 *   5 images                     -> "Self-signed certificate detected"
 *   3 images copied into its cwd -> a correct JSON array of three verdicts
 *
 * ⚠ AND THE MESSAGES POINT AWAY FROM THE CAUSE, which is the whole reason this gate is worth
 * having. A permission refusal arrives as PROSE; prose is not JSON; the trial files it as a PARSING
 * problem. Three different wordings, not one of them naming the wall. A gate that asks the plain
 * question — did it see the picture? — cannot be misled that way.
 *
 * WHAT THIS CAN AND CANNOT SEE:
 *   CAN:    whether judgeBatch, called exactly as the trial calls it, returns real verdicts for
 *           real screenshots from this repo.
 *   CANNOT: whether those verdicts are any GOOD. It asserts the eyes are open, never that they are
 *           right.
 *
 * NOT in `npm test` — it costs a model call and needs a screenshot to exist. Hand-run, and run it
 * before trusting any trial's judged half.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const SHOTS = path.join(REPO, "sea-trial-shots");

/* An instrument that reports NOT FOUND has told you about ITSELF, not the world. No screenshots
   means this gate could not run — exit 2, never a pass. */
if (!fs.existsSync(SHOTS)) {
  console.log("judge can-see check — NOT RUN: no sea-trial-shots/ directory. Sail a trial first.");
  process.exit(2);
}
/* ⚠ PICK REAL GAME SCREENS, NOT WHATEVER SORTS FIRST. The first draft took the first three .png
   alphabetically, which are the leftover `contact-*.png` dashboards — and the judge correctly
   REFUSED them ("the three files you gave me aren't single gameplay screenshots"). The gate then
   printed "THE JUDGE CANNOT SEE" over a reply that began "I can see the three images", which is
   exactly the fault it was built to catch: an error message pointing away from the cause. Caught by
   CEO Review 36, on the gate's own first day. */
const shots = fs.readdirSync(SHOTS)
  .filter(f => f.endsWith(".png") && !f.startsWith("contact-"))
  .sort().slice(0, 3);
if (shots.length < 2) {
  console.log(`judge can-see check — NOT RUN: found ${shots.length} screenshot(s), need at least 2.`);
  process.exit(2);
}

const { judgeBatch } = await import(pathToFileURL(path.join(REPO, "scripts", "lib", "vision.mjs")).href);

console.log("judge can-see check — does the vision judge actually open the pictures?\n");
console.log(`  subject: ${shots.length} screenshot(s) from sea-trial-shots/`);
for (const s of shots) console.log(`           ${s}  (${(fs.statSync(path.join(SHOTS, s)).size / 1048576).toFixed(1)}MB)`);
console.log("");

/* judgeBatch reads `it.path` (vision.mjs:169, :205). playtest_gate's own onEach reads `it.shot`,
   so items in the wild carry both — this gate sets both rather than guessing which door it went
   through. Getting this wrong once cost a run: the first draft passed only `shot` and judgeBatch
   crashed on `it.path.split`. */
const items = shots.map(s => ({ path: path.join(SHOTS, s), shot: path.join(SHOTS, s), context: "judge can-see check" }));
const out = await judgeBatch(items);

/* WHAT judgeBatch ACTUALLY RESOLVES — and the first draft of this gate got it wrong twice, which
   is worth the comment. It is NOT an array. It is one of:
     { results: Map<absolutePath, {verdict,issues,confidence}> }   the good case
     { unparseable: "...", raw: "..." }                            the reply was not a JSON array
     { fatal: {...} }                                              the judge cannot run at all
   A Map stringifies to `{}`, so a gate that prints JSON.stringify(out) on the good path reports an
   empty object and reads exactly like a failure. Read the shape by name. */
const arr = out && out.results instanceof Map
  ? items.map(it => out.results.get(it.path)).filter(Boolean)
  : null;
if (out && out.fatal) {
  console.log(`  FAIL  the judge cannot run at all — ${JSON.stringify(out.fatal).slice(0, 200)}`);
  console.log("\nFAILED — this is an environment fault, not a verdict about any screen.");
  process.exit(1);
}
if (!arr || arr.length !== items.length) {
  const detail = out && out.unparseable ? out.unparseable : `only ${arr ? arr.length : 0} of ${items.length} screenshot(s) came back named`;
  /* A REFUSAL IS NOT A BLINDNESS, and conflating them is how this gate lied on day one. If the
     reply shows the judge SAW the images and declined to rate them, say that instead — the eyes
     were open and the subject was wrong. */
  const sawThem = /\bI can see\b|\baren'?t single gameplay\b|\bcontact[- ]sheet\b/i.test(String((out && (out.unparseable || out.raw)) || ""));
  console.log(`  ${sawThem ? "FAIL (SUBJECT, NOT SIGHT)" : "FAIL"}  ${detail}`);
  if (sawThem) console.log("        The judge OPENED the images and refused to rate them. Its eyes work; this gate\n        handed it the wrong pictures. Fix the selection, not the judge.");
  if (out && out.raw) console.log(`        raw reply: ${String(out.raw).replace(/\s+/g, " ").slice(0, 200)}`);
  console.log("\n  THE JUDGE CANNOT SEE. Stage the images into the judge's own working directory and");
  console.log("  name them bare; do NOT move the child back into this repo — that reintroduces the");
  console.log("  hook hijack this arrangement exists to prevent.");
  console.log("\nFAILED — a trial run in this state has its eyes shut and will say 'unparseable'.");
  process.exit(1);
}

const good = arr.filter(r => r && (r.verdict === "PASS" || r.verdict === "FAIL"));
const bad  = arr.filter(r => !r || (r.verdict !== "PASS" && r.verdict !== "FAIL"));
for (const r of arr) console.log(`  verdict: ${r && r.verdict}  ${(r && r.issues || []).slice(0, 1).join("")}`);
console.log("");

if (good.length === items.length) {
  console.log(`  PASS  ${good.length} of ${items.length} screenshot(s) came back with a real verdict`);
  console.log("\nPASSED — the judge opened every picture it was given. (This says nothing about");
  console.log("whether its judgements are correct — only that its eyes are open.)");
  process.exit(0);
}
console.log(`  FAIL  ${bad.length} of ${items.length} screenshot(s) produced no verdict`);
for (const r of bad) console.log(`        ${JSON.stringify(r).slice(0, 200)}`);
console.log("\nFAILED — the judge could not see part or all of what it was given.");
process.exit(1);
