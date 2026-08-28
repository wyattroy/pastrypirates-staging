/* SHOT-CLOCK REMOVAL CHECK — Wave 1, 2026-08-28.
 *
 * Wyatt: "i'd prefer to do it even if it breaks shot clock, and to temporarily remove the shot
 * clock from the game." This gate is the four-step process's step 1 for that removal: it was RUN
 * RED against the tree that still carried the clock (every assertion below failed on 2026-08-28
 * before the removal commit), then the removal made it green — so it is known to be able to fail.
 *
 * TWO HALVES. Half 2 changed meaning on 2026-08-28 evening: it used to assert pause SURVIVED
 * (inventory D2); Wyatt's A-10 then removed play/pause too, so it now asserts pause is GONE and
 * only the sweeper belt (the real hidden-tab defence) remains. ask()'s prompts still must resolve
 * without the armed promise (inventory D1 — half-removed, every prompt hangs).
 *
 * WHEN THE CLOCK COMES BACK (it is TEMPORARILY out, against a converged dispatch): delete this
 * gate in the same commit that reintroduces it, and bring back rule C in DISPLAY-RULES.md.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

let fails = 0;
const pass = m => console.log("PASS " + m);
const fail = m => { console.log("FAIL " + m); fails++; };

const read = f => fs.readFileSync(path.join(REPO, f), "utf8");
/* COMMENTS ARE STRIPPED BEFORE MATCHING — mode_fork_check's own precedent, for the same reason:
   the comments are this repo's graveyard (rule 10), and the tombstones the removal left behind
   deliberately NAME what stood there so the clock's return can find its way back. Matching them
   would force deleting the very records the removal is supposed to leave. What this gate asserts
   is that no LIVE code references the clock. Red-proofed both ways on 2026-08-28: without the
   strip, every tombstone comment read as a failure. */
const strip = src => src
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/<!--[\s\S]*?-->/g, "")   // index.html's tombstones are HTML comments — same rule as /* */
  .split("\n").map(l => l.replace(/(^|[^:])\/\/.*$/, "$1")).join("\n");
// every shipped module that could carry clock code — src/ recursively, plus index.html
const srcFiles = [];
(function walk(d){ for (const e of fs.readdirSync(path.join(REPO, d), { withFileTypes: true })) {
  const rel = path.join(d, e.name);
  if (e.isDirectory()) walk(rel);
  else if (e.name.endsWith(".js")) srcFiles.push(rel);
} })("src");
srcFiles.push("index.html");
const all = srcFiles.map(f => ({ f, s: strip(read(f)) }));

/* ---- 1. the clock machinery is gone ---------------------------------------------------- */
// identifiers that must have ZERO occurrences anywhere in shipped code. shotClockPaused and
// turnExpired are deliberately NOT here: pause keeps the former, and the latter's ~20 dead abort
// guards are swept in a separate commit (inventory: KEEP-BUT-NEUTER).
const GONE = ["startShotClock","stopShotClock","rearmShotClock","shotClockTick",
  "applyShotClockPenalty","applyTimerOff","armClock","withShotClock","expireShotClock",
  "broadcastClock","watchClock","watchTimer","toggleTimer","netSetClock","netWatchClock",
  "netSetTimerOff","netWatchTimerOff","clockPendingArm","clockPendingLocal","clockPendingText",
  "clockPendingSeat","shotClockSeat","shotClockDeadline","shotClockForce","shotClockStash",
  "shotClockFired","shotClockPauseElapsed","scTimerToggle","pp4Clock"];
for (const id of GONE) {
  const hits = all.filter(x => x.s.includes(id));
  if (hits.length) fail(`\`${id}\` still present in: ${hits.map(x => x.f).join(", ")}`);
  else pass(`\`${id}\` gone from shipped code`);
}

/* ---- 2. the two clock events no longer exist ------------------------------------------- */
// emitters AND consumers: EVENT_NARRATION rows, EVENT_SOUND rows, the award tally. CASE-SENSITIVE
// lowercase on purpose: the event names are `shotclock`/`shotclockskip`, while `shotClockPanel`
// and `shotClockPaused` (camelCase) are KEEP items — an -i flag here would condemn the pause
// feature this gate's half 4 exists to protect. Red-proofed both ways on 2026-08-28: the -i
// version flagged src/ui/board.js for a panel layout reference that stays.
{
  const hits = all.filter(x => /shotclock/.test(x.s));
  if (hits.length) fail(`the shotclock/shotclockskip event name still in: ${hits.map(x => x.f).join(", ")}`
    + " — an event nothing emits must not keep narration/sound/award consumers");
  else pass("no shotclock/shotclockskip emitters or consumers anywhere in shipped code");
}
{
  const u = strip(read("src/ui/util.js"));   // the tombstone comment may name the award
  if (/Barnacle Brain/.test(u)) fail("the Barnacle Brain award row survives with nothing to tally — every seat would score 0 and it would be handed out by tie-break (inventory D3)");
  else pass("Barnacle Brain award removed with its events");
}

/* ---- 3. ask() resolves without the armed promise (inventory D1) ------------------------ */
{
  const u = read("src/ui/util.js");
  if (/const armed\s*=\s*new Promise/.test(u)) fail("ask() still creates the `armed` promise — with the seam gone every prompt in the game hangs on the first question");
  else pass("ask(): the `armed` promise is gone");
  if (/armed\.then/.test(u)) fail("ask() still chains on `armed`");
  else pass("ask(): nothing chains on `armed`");
}

/* ---- 4. pause is GONE TOO — Wyatt's A-10 (2026-08-28) SUPERSEDES inventory D2 ----------
   "I haven't seen the play/pause panel ever in the latest build… you can simply remove
   play/pause from this latest work — if we need to put it in again later, we'll re-engineer it."
   This half used to assert the OPPOSITE (pause survives); the ruling flipped it, and it was run
   RED against the tree that still carried pause before the removal commit. HISTORY THAT MUST
   RIDE BACK IN WITH ANY RE-ENGINEERED PAUSE: the app-switch auto-pause existed because a hidden
   tab's throttled timers used to hang a turn forever; sleepMs's sweeper belt (util.js) is the
   surviving defence against lost timers and MUST stay. */
const PAUSE_GONE = ["toggleShotClockPause","applyPauseState","waitWhilePaused","shotClockPaused",
  "togglePause","watchPause","netSetPaused","netWatchPaused","autoPausedByHide","scPause",
  "shotClockPanel","soloBotGame"];
for (const id of PAUSE_GONE) {
  const hits = all.filter(x => x.s.includes(id));
  if (hits.length) fail(`pause still present: \`${id}\` in ${hits.map(x => x.f).join(", ")}`);
  else pass(`pause gone: \`${id}\``);
}
{
  const u = strip(read("src/ui/util.js"));
  if (/pendingSleeps/.test(u) && /SLEEP_SWEEP_MS/.test(u)) pass("sleepMs's sweeper belt survives — the real defence against a hidden tab's lost timers");
  else fail("sleepMs's sweeper belt is GONE — a hidden tab's lost setTimeout can hang a voyage again (the bug the auto-pause existed for)");
}

console.log(fails ? `\nFAILED — ${fails} assertion(s)` : "\nPASSED — the shot clock and play/pause are both out; the sweeper belt survives");
process.exit(fails ? 1 : 0);
