#!/usr/bin/env node
/* PROVEN, NOT ASSERTED — ITEM 4 (D-15): no captain, bot or human, both passes and lights the ovens
 * in the same turn.
 *
 * The roadmap's own success criterion for this item is "a bot never passes and bakes in the same
 * turn, proven from an event stream" — proven, not asserted, and no check in this codebase could
 * do that before this one (02.2-RESEARCH.md's validation review). This is the phase's one
 * legitimate piece of new checking, required by the criterion itself rather than chosen
 * (.claude/CLAUDE.md rule 7 — tooling is a substitution for the ask unless the ask needs it).
 *
 * WHAT IT DOES NOT DO. It instruments nothing and changes no engine emission. It reads only the
 * ALREADY-RECORDED event stream, exactly as scripts/bot_ladder4.js reads turn and pass counts
 * today — {t:"turn"}, {t:"pass"}, {t:"ovens"}, all emitted by the engine before this check ever
 * runs. A gated determinism re-record (docs/DETERMINISM-RERECORD.md) is a cost this file never
 * incurs.
 *
 * HOW A "TURN" IS FOUND IN THE STREAM. playBakeoff() (src/engine/index.js) calls, per seat, per
 * round: this.takeTurn(p, wind, storm) then this.lightOvens(p) — same p, back to back, before the
 * loop moves to the next seat. Only AFTER every seat in the round has had that pair does the day
 * loop run that round's bake ATTEMPTS (this.bakeAttempt for whoever is already p.baking). So the
 * events between one {t:"turn"} marker and the next {t:"turn"} or {t:"newround"} marker belong to
 * exactly one captain's one turn, and a same-turn {t:"ovens"} for that captain (if the day's bake
 * attempts hadn't started yet) can only be the lightOvens() call this engine's own turn loop made
 * for THIS turn — never a different captain's, never a later round's.
 *
 * SEEDS. Construction copied from scripts/bot_ladder4.js: new Game({...roundCfg(STRATS),
 * bakeoff:true}, seed, true). The dev seed family is x7919 (this file's default); the OTHER seed
 * family scripts/bot_ladder4.js names as held out for close calls MUST NOT be consumed by a
 * routine gate — its literal is deliberately not written in this file (a plan-level check greps
 * for that digit string to prove it stays out), so if you need it, read it from bot_ladder4.js.
 *
 * RED-PROOFED. Run against the pre-fix tree (git checkout the parent commit's two files, or `git
 * stash` an unstaged fix) this failed on real seeds before it was believed passing — see
 * 02.2-04-SUMMARY.md for the recorded red/green pair. A check that cannot fail is not protection
 * (this codebase has already shipped one that couldn't, per docs/AUDIO.md).
 */
import { Game, roundCfg } from "../src/engine/index.js";

const ARGV = process.argv.slice(2);
const GAMES = +(ARGV[0] || 60);
const SEEDMULT = +(ARGV[1] || 7919); // the dev family — never the held-out family as a routine default
const STRATS = ["pirate", "trader", "balanced", "rusher"];

const fails = [];
const passes = [];
const ok = (name, cond, detail = "") => (cond ? passes.push(name) : fails.push(name + (detail ? "  — " + detail : "")));

let turnsChecked = 0, passSeen = 0, ovensSeen = 0;
const violations = [];

for (let s = 1; s <= GAMES; s++) {
  const seed = s * SEEDMULT;
  const g = new Game({ ...roundCfg(STRATS), bakeoff: true }, seed, true);
  g.play();

  // Segment the already-recorded stream by {t:"turn"} markers — see the header note above for why
  // this segmentation is safe: the engine's own loop order guarantees a captain's pass and that
  // captain's ovens (if any) both land inside the SAME segment, never a neighbour's.
  let seg = null;
  const flush = () => {
    if (!seg) return;
    turnsChecked++;
    const hasPass = seg.events.some((e) => e.t === "pass");
    const hasOvens = seg.events.some((e) => e.t === "ovens");
    if (hasPass) passSeen++;
    if (hasOvens) ovensSeen++;
    if (hasPass && hasOvens) violations.push({ seed, p: seg.p, round: seg.round });
    seg = null;
  };
  let round = 0;
  for (const e of g.events) {
    if (e.t === "newround") { flush(); round++; continue; }
    if (e.t === "turn") { flush(); seg = { p: e.p, round, events: [e] }; continue; }
    if (seg) seg.events.push(e);
  }
  flush();
}

// CONTROLS — quantities known before believing anything below them (docs/HARD-WON-LESSONS.md §3:
// the harness checks itself). If a bake-off game genuinely produced zero turns, zero passes or
// zero ovens across this many seeds, the harness itself is broken (wrong cfg, wrong event names,
// a record flag silently off) and the absence-of-violation result below means nothing.
ok(`CONTROL: ${GAMES} bake-off games were played`, GAMES > 0);
ok("CONTROL: at least one turn was recorded", turnsChecked > 0, `turnsChecked=${turnsChecked}`);
ok("CONTROL: at least one pass was recorded", passSeen > 0, `passSeen=${passSeen}`);
ok("CONTROL: at least one bot reached the ovens", ovensSeen > 0, `ovensSeen=${ovensSeen}`);

// THE PROOF ITEM 4 ASKS FOR.
ok(
  "no captain both passes and lights the ovens in the same turn",
  violations.length === 0,
  violations.length
    ? `${violations.length} violation(s): ${violations.slice(0, 5).map((v) => `seed=${v.seed} seat=${v.p} round=${v.round}`).join("; ")}`
    : ""
);

console.log(`\nbot bake/pass check — ${GAMES} bake-off games, seed family x${SEEDMULT}`);
console.log(`turns checked: ${turnsChecked}, turns with a pass: ${passSeen}, turns with ovens lighting: ${ovensSeen}`);
console.log("\nPASS (" + passes.length + ")");
passes.forEach((s) => console.log("  ok   " + s));
console.log("FAIL (" + fails.length + ")");
fails.forEach((s) => console.log("  FAIL " + s));
if (fails.length) {
  console.log("\nA bake-eligible captain must never collect the pass dubloon (item 4, D-15). See the");
  console.log("canBake(p) guard at src/engine/index.js's takeTurn fallback and src/ui/flow.js's");
  console.log("botTurn fallback.\n");
  process.exit(1);
}
console.log("");
