/* WHICH GEAR IS THIS CHANGE IN?  — the mechanical half of the QA process.
 *
 * Wyatt, 2026-08-26: "I want one elegant process that is called every time we need to change the
 * code of the game. Design this such that small changes can be qa'd quickly, and large changes are
 * qa'd appropriately, but all using a similar logic."
 *
 * SAME FOUR STEPS EVERY TIME — show it broken, change it, show it fixed, sweep. Only the SWEEP
 * changes size, and this file is what decides the size. It reads the files you actually changed.
 *
 * WHY IT IS MECHANICAL AND NOT A JUDGEMENT CALL: a rule based on how risky a change FEELS cannot be
 * enforced by anything, and the whole reason this exists is that on 2026-08-25/26 a session shipped
 * 22 fixes, picked its own testing depth by mood, and verified 4 of them in one mode at one screen
 * size. A rule based on "which files did you edit" can be enforced by a hook. That is the entire
 * design constraint.
 *
 *   node scripts/qa/gear.mjs              what gear am I in, right now, for my current changes
 *   node scripts/qa/gear.mjs --since=HEAD~3
 *   node scripts/qa/gear.mjs --files a.js b.js
 */
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

const arg = k => (process.argv.find(a => a.startsWith(k)) || "").split("=")[1];
const sh = c => { try { return execSync(c, { cwd: REPO, encoding: "utf8" }); } catch { return ""; } };

/* ---- what changed ---------------------------------------------------------- */
let files;
const iFiles = process.argv.indexOf("--files");
if (iFiles >= 0) files = process.argv.slice(iFiles + 1);
else {
  const since = arg("--since");
  const raw = since ? sh(`git diff --name-only ${since}`)
                    : sh("git diff --name-only") + sh("git diff --name-only --cached");
  files = [...new Set(raw.split("\n").map(s => s.trim()).filter(Boolean))];
}

/* ---- the rules -------------------------------------------------------------

   WYATT'S DESIGN PRINCIPLE, and this file must not contradict it (2026-08-26):

     "Each mode should be structurally different just about who the player is playing against, but
      the game itself should remain consistent for every player in every mode."

   Pastry Pirates is ONE game, not three. Solo, pass-and-play and crew are three answers to one
   question — who are the other captains, and how does a turn reach them? Everything else is the
   same game, and a player should not be able to tell which mode they are in from the board, the
   narration, the wording, the pacing or the prompts.

   AN EARLIER VERSION OF THIS FILE HAD A GEAR CALLED "behaviour changed inside one mode", and he
   caught it. That sentence PRESUMES the fork it should be preventing: it treats "this only affects
   crew" as an ordinary thing to say, then only looks at crew — so a divergence introduced anywhere
   else sails through, and the process quietly teaches itself that forking modes is routine. It is
   the same failure as the parity gate declaring localAsk an acceptable gap: a process agreeing, in
   advance, that a fork is fine.

   So there are three gears and the middle one is a different SUBJECT, not a smaller size:

     COSMETIC  words, colours, comments — cannot change anything
     PLUMBING  how a mode SERVES the game to its players: pass-and-play's hand-the-device gate and
               how often it fires, crew's room codes and joining and the 30-second grace. This is
               genuinely per-mode, because it is about the seating rather than the game.
     FULL      anything that can change what a captain SEES or CAN DO — every mode, every size.

   PLUMBING MUST BE EARNED, and everything else defaults to FULL. That polarity is deliberate: this
   file shipped an hour earlier defaulting to the LENIENT answer when it had no evidence, and dropped
   real changes into the gear that skips proving them broken.

   THE TELL that separates plumbing from the game: if a change can alter what any player sees or can
   do, it is NOT plumbing. `pos` went missing from the guest's sail prompt exactly here — it looked
   like wire plumbing and it changed what a guest could DO (stay put). Hence PLUMBING_FORBIDDEN
   below: an edit that mentions a prompt's payload or a renderer is the game, whatever file it is in. */

/* Narrow, explicit, and the ONLY way to earn the plumbing gear. */
const PLUMBING = [
  { re: /^4\/src\/ui\/lobby\.js$/,      modes: ["crew"],       what: "the room screens — creating, joining, naming, leaving" },
  { re: /\bpassGate\b/,                  modes: ["passplay"],   what: "pass-and-play's hand-the-device gate" },
  { re: /\bnetCreateRoom\b|\bnetJoinRoom\b|\bnetLeaveRoom\b|\bgenCode\b|\bhostGoneGrace\b/,
                                          modes: ["crew"],       what: "crew's room lifecycle and the host-gone grace" },
];
/* …but NEVER plumbing, whatever else the edit matches. These are the game reaching a player. */
const PLUMBING_FORBIDDEN = /\bspec\b|\bpayload\b|renderPickPrompt|playBakeoffLive|showNarration|localAsk|applyBenchSnap|applyBattleSnap|\bpanel\(/;

/* ---- helpers ---------------------------------------------------------------- */
/* NOT THE GAME: documents, and the test tooling itself. Editing a probe does not require sailing a
   voyage to prove the GAME still works — and the hook (.claude/hooks/qa-gear-first.cjs) already
   exempts scripts/ for the same reason, since writing a check IS step one. The two must agree, or
   a session gets stopped by one and waved through by the other. */
const isDoc = f => f.endsWith(".md") || f.startsWith(".planning/") || f.startsWith("docs/") || f.startsWith("scripts/");

/* ── WHAT COUNTS AS GAME CODE, AND WHY THIS IS NOT `startsWith("4/")` ANY MORE ────────────────
   IT WAS EXACTLY INVERTED FROM THE CUTOVER UNTIL 2026-08-26 NIGHT. This file filtered on
   `f.startsWith("4/") && !isDoc(f)`, and isDoc excludes `scripts/` — so with `4/` holding ONLY
   `scripts/` after the promotion, the game list was ALWAYS EMPTY. Every real change to the live
   game reported GEAR: NONE, "nothing to prove"; and a change to a QA script would have reported
   FULL. The instrument that decides how much testing every change gets was pointing at tooling and
   calling the game nothing.

   Found by editing src/ui/bakeoff.js and being told no game code had changed. It is the same
   cutover rot that left the browser fleet navigating to an empty /4/ — and it is the third time in
   one day that a hand-written path outlived the tree it named.

   DERIVED AS AN EXCLUSION LIST, not an inclusion one, on this file's own stated principle: a check
   that cannot see its subject must return the STRICT answer. A new top-level directory nobody
   thought about is therefore GAME by default and gets the heavier gear, rather than silently
   getting none.

     tooling      scripts/ and 4/ — BOTH trees. 4/ is dev scripts only now.
     record       .planning/, docs/, .claude/, notes/, any .md
     art source   art-review/ (not shipped; the assets it produces are, and those ARE game)
     generated    staging/ — published FROM the tree below by publish-staging-path.sh, so a change
                  there is always a CONSEQUENCE of a game change, never a cause. Gearing on it would
                  double-count the same edit.

   Everything else ships to a player and counts: index.html, src/**, assets/**, sfx/**, about.html,
   and classic/** — classic is frozen, but it is still served at /classic, so a change there is a
   change a player can reach and must not be waved through. */
const NOT_GAME = [/^\.planning\//, /^docs\//, /^\.claude\//, /^notes\//, /^art-review\//,
                  /^scripts\//, /^4\//, /^staging\//];
const isGame = f => !!f && !f.endsWith(".md") && !NOT_GAME.some(re => re.test(f));

function changedLines(f) {
  const d = sh(`git diff -U0 -- ${JSON.stringify(f)}`) + sh(`git diff -U0 --cached -- ${JSON.stringify(f)}`);
  return d.split("\n").filter(l => /^[+-]/.test(l) && !/^(\+\+\+|---)/.test(l));
}

/* A changed line that is only a comment, or only inside a CSS block, cannot change behaviour.
   NO EVIDENCE MEANS NOT-COSMETIC. `[].every(...)` is TRUE, so an empty diff — a file passed by name
   with nothing to inspect, a change already committed, a rename — reported "all cosmetic" and
   dropped the change into the one gear that skips proving it broken first. Caught by pointing this
   at a plain UI file, which came back COSMETIC.

   The direction is the whole lesson: a check that cannot see its subject must return the STRICT
   answer, never the lenient one. The same mistake pointed the other way let a narration probe
   measure a display:none panel and report PASS. */
const looksCosmetic = lines => lines.length > 0 && lines.every(l => {
  const t = l.slice(1).trim();
  if (!t) return true;
  if (/^(\/\/|\/\*|\*|<!--)/.test(t)) return true;                                                  // comment
  if (/^[.#:@a-zA-Z][^{};]*\{?$/.test(t) && !/\b(function|=>|const|let|var|return|await)\b/.test(t)) return true;  // css selector
  if (/^[a-z-]+\s*:\s*[^;]+;$/.test(t)) return true;                                                 // css declaration
  return false;
});

/* ---- decide ----------------------------------------------------------------- */
const game = files.filter(isGame);   // let, morally — the NONE branch may refill it
let gear, why, modes = ["solo", "passplay", "crew"];

if (!game.length) {
  /* THE BYPASS THAT MADE THE WHOLE PROCESS THEATRE, found by the CEO review 2026-08-26 and verified
     before it was believed.

     This read the WORKING TREE. The moment you commit a fix — which is the workflow this project
     mandates, atomic commits, one per fix — the tree is clean, this returned NONE, sea_trial sailed
     zero legs and wrote a report saying PASSED. Nobody had to cheat, nobody had to be tired: FOLLOWING
     THE RULES EXACTLY was sufficient to skip everything and produce a green certificate.

     And the lesson was already learned TWELVE LINES DOWN, in looksCosmetic(): "a check that cannot
     see its subject must return the STRICT answer, never the lenient one." It was applied to the
     inner test and not to the enclosing one, in the same file, in the same hour.

     So: nothing to compare means compare against what SHIPPED — origin/main...HEAD.

     AND IF THAT IS EMPTY TOO, NONE IS CORRECT. An earlier version of this comment claimed "the
     honest answer is still FULL — never NONE" while the code eight lines down set NONE, which is
     rule 6's rot exactly: a comment asserting behaviour the code does not have, written the day
     after that rule was earned. The code is right and the comment was wrong. Nothing changed
     against the shipped tree genuinely means there is nothing to sail — the danger was never NONE
     itself, it was NONE reached by looking only at UNCOMMITTED work. */
  const vsMain = sh("git diff --name-only origin/main...HEAD").split("\n").map(x => x.trim()).filter(Boolean);
  const shipped = vsMain.filter(isGame);
  if (shipped.length) {
    game.push(...shipped);
    gear = "FULL";
    why = `nothing uncommitted, so this reads what is AHEAD OF origin/main: ${shipped.join(", ")}`;
  } else {
    gear = "NONE";
    why = "no game code changed, committed or uncommitted, against origin/main";
  }
} else {
  const allLines = game.map(f => changedLines(f).join("\n")).join("\n");
  const cosmetic = game.every(f => looksCosmetic(changedLines(f)));

  if (cosmetic) { gear = "COSMETIC"; why = `only words, colours or comments changed in: ${game.join(", ")}`; }
  else if (PLUMBING_FORBIDDEN.test(allLines)) {
    gear = "FULL";
    why = "this edit touches a prompt's payload or a renderer — that is THE GAME reaching a player, whatever file it lives in";
  } else {
    const hit = PLUMBING.find(p => game.some(f => p.re.test(f)) || p.re.test(allLines));
    if (hit) { gear = "PLUMBING"; modes = hit.modes; why = `${hit.what} — how one mode serves the game up, not the game itself`; }
    else { gear = "FULL"; why = `behaviour can change in: ${game.join(", ")}`; }
  }
}

/* ---- say it in plain English ------------------------------------------------ */
const PLAN = {
  NONE:     { first: "nothing to prove — no game code changed",
              sweep: () => "npm test, so the written record stays consistent" },
  COSMETIC: { first: "NOT required — a colour or a word proves itself with a screenshot",
              sweep: () => "npm test, plus a screenshot of the one screen you changed" },
  PLUMBING: { first: "REQUIRED — write the check that FAILS before you touch the code",
              sweep: m => `npm test, plus the robot playing the mode this serving belongs to, at every screen size:\n           node scripts/sea_trial.mjs --gear=PLUMBING   (${m.join(",")}, plus the others once)\n         ...AND the other modes once, to prove the serving change did not leak into the game.` },
  FULL:     { first: "REQUIRED — write the check that FAILS before you touch the code",
              sweep: () => "npm test, plus the robot playing ALL THREE modes at all three sizes,\n           including a real two-browser crew game:\n           node scripts/sea_trial.mjs" },
};
const p = PLAN[gear];
console.log(`\n  GEAR: ${gear}`);
console.log(`  why:  ${why}`);
console.log(`\n  Step 1, show it broken first: ${p.first}`);
console.log(`  Step 4, the sweep:            ${p.sweep(modes)}`);
console.log(`\n  (Steps 2 and 3 never change: make the change, then show that same check passes.)\n`);
process.stdout.write("");
