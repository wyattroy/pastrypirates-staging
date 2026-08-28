/* SHOT-CLOCK REMOVAL CHECK — Wave 1, 2026-08-28.
 *
 * Wyatt: "i'd prefer to do it even if it breaks shot clock, and to temporarily remove the shot
 * clock from the game." This gate is the four-step process's step 1 for that removal: it was RUN
 * RED against the tree that still carried the clock (every assertion below failed on 2026-08-28
 * before the removal commit), then the removal made it green — so it is known to be able to fail.
 *
 * TWO HALVES, AND THE SECOND IS THE DANGEROUS ONE.
 *   1. The clock is GONE: no arming, no countdown, no penalty, no ⏱ toggle, no clock events, no
 *      Barnacle Brain award tallying events that can no longer occur (a 0-0-0 tie-break award is
 *      a visibly wrong End of Voyage screen — inventory D3).
 *   2. What SHARED the clock's state and panel SURVIVES: pause is a separate feature (inventory
 *      D2 — it backs the phone app-switch auto-pause that exists because a hidden tab used to
 *      hang a turn forever), and ask()'s prompts must still resolve without the armed promise
 *      (inventory D1 — the highest-risk edit: delete the seam but leave `armed` and every prompt
 *      in the game hangs on the first question).
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

/* ---- 4. pause SURVIVES (inventory D2) -------------------------------------------------- */
const KEEP = [
  ["src/ui/util.js", "toggleShotClockPause", "solo/pass-and-play pause entry"],
  ["src/ui/util.js", "applyPauseState",      "the shared pause body"],
  ["src/ui/util.js", "waitWhilePaused",      "what actually freezes bots"],
  ["src/ui/util.js", "shotClockPaused",      "the pause flag itself (rename is a follow-up, not now)"],
  ["src/orchestrator.js", "togglePause",     "the networked pause entry"],
  ["src/orchestrator.js", "watchPause",      "every client mirrors the shared pause flag"],
  ["src/main.js",    "visibilitychange",     "the phone app-switch auto-pause (a hidden tab used to hang a turn forever)"],
  ["index.html",     "scPause",              "the ▶/⏸ button"],
  ["index.html",     "shotClockPanel",       "the panel the pause button lives in"],
];
for (const [f, id, why] of KEEP) {
  if (read(f).includes(id)) pass(`pause survives: ${id} in ${f}`);
  else fail(`pause LOST: \`${id}\` missing from ${f} — ${why}`);
}

console.log(fails ? `\nFAILED — ${fails} assertion(s)` : "\nPASSED — the shot clock is out and pause survived it");
process.exit(fails ? 1 : 0);
