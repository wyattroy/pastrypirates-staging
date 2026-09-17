/* T-249 — A CAPTAIN WHO CALLS THE WINNER OF A FIGHT THAT ENDS IN A FLIGHT IS NEVER TOLD ANYTHING.
 *
 * collectSideBets() runs before every fight (src/orchestrator.js), so any spectating captain may
 * already hold a live call by the time the flip resolves. Three of asyncBattleRun's exits settle
 * those bets — a NULL (settleSideBets(bets,null)) and a decided win (settleSideBets(bets,"a"/"d"))
 * — but the both-tails FLEE exit (`if(fled)return;`) leaves the function before either. The rules
 * page's own promise ("nobody's paid on a battle with no winner") stays true either way, so this
 * is not a payout bug — it is silence: the caller is asked a question and never told anything
 * happened at all. Filed 2026-09-03T23:5xZ, watch T-216; claimed and checked here 2026-09-04.
 *
 * OBSERVED IN THE CODE, NOT IN A SCREEN — this is a structural check, not a posed pair, because
 * the defect is an omitted function call, not a layout question (rule 26 governs the latter, not
 * this). A live repro would need a forced both-tails flip plus a spectating human caller, which
 * this repo has no deterministic hook for; the source-level shape is what actually decides the
 * question asked here: on the flee path, is settleSideBets ever reached?
 *
 * RE-ANCHORED 2026-09-17 (architecture item 9): the fight has ONE way out now — it says how it ended (a win, a stand-off or a
 * flight) and then settles the calls, once, for all three — so there is no flee exit left to find. The question is unchanged and is
 * asked of the new shape: after the flight is recorded (Game.flee), does anything leave the fight before the calls are settled, and
 * are they settled with no winner when nobody won? A mutant of the old fault (a flight that returns early) must turn it red, below.
 * scripts/qa/fight_ending_said_once_check.mjs holds the rest of the ending.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { stripComments } from "./lib/strip_comments.mjs";
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const pass = m => console.log("PASS " + m);
const fail = m => { console.log("FAIL " + m); fails++; };

/* the function's own statements — the bodies of helpers written inside it emptied, so a helper's `return` is not the fight's */
function ownText(text) {
  const open = text.indexOf("{");
  let s = text.slice(open + 1, -1), out = "", i = 0;
  const re = /=>\s*\{|\bfunction\b[^{]*\{/g; let m;
  while ((m = re.exec(s))) {
    const start = m.index + m[0].length - 1; let d = 0, k = start;
    for (; k < s.length; k++) { if (s[k] === "{") d++; else if (s[k] === "}" && --d === 0) break; }
    out += s.slice(i, start) + "{}"; i = k + 1; re.lastIndex = i;
  }
  return out + s.slice(i);
}
function verdict(orchSrc) {
  const src = stripComments(orchSrc);
  const fn = (src.match(/async function asyncBattleRun\(att,def\)\{[\s\S]*?\n\}\n/) || [""])[0];
  if (!fn) return { ok: false, msg: "could not find asyncBattleRun in src/orchestrator.js — re-anchor this check" };
  const own = ownText(fn);
  const fleeAt = own.search(/appState\.game\.flee\(/);
  if (fleeAt < 0) return { ok: false, msg: "the flight (appState.game.flee) is gone from asyncBattleRun — re-anchor this check against src/orchestrator.js's current text before trusting either verdict" };
  const settles = [...own.matchAll(/settleSideBets\(\s*bets\s*,([^;]*)\)\s*;/g)];
  const settleAt = settles.length ? settles[0].index : -1;
  const early = [...own.slice(fleeAt, settleAt < 0 ? own.length : settleAt).matchAll(/\breturn\b[^;]*;/g)].map(r => r[0]);
  const noWinnerNull = settles.length === 1 && /^\s*F\.winner\s*\?[\s\S]*:\s*null\s*$/.test(settles[0][1]);
  if (settles.length === 1 && !early.length && noWinnerNull)
    return { ok: true, msg: `after a flight nothing leaves the fight before the calls are settled (\`settleSideBets(bets,${settles[0][1].replace(/\s+/g, "")})\`, once, for every ending) — a spectator who called this fight is told, with no bounty, exactly as after a NULL battle` };
  if (early.length) return { ok: false, msg: `the fight can leave after a flight before the calls are settled (\`${early.join(" ")}\`) — a captain asked to call this fight from the crow's nest is left with no answer at all: no "sidebet" event, no settle line, nothing` };
  return { ok: false, msg: `the calls are settled ${settles.length} time(s)${settles.length === 1 ? ", but not with no winner when nobody won (" + settles[0][1].trim() + ")" : ""} — every ending, a flight included, must reach the one settlement` };
}

const orch = fs.readFileSync(path.join(REPO, "src/orchestrator.js"), "utf8");
const v = verdict(orch);
(v.ok ? pass : fail)(v.msg);
/* RED-PROOF: the old fault put back — a flight that leaves before the calls settle — must be seen */
const mutant = orch.includes("  let evEnd;\n") ? orch.replace("  let evEnd;\n", "  if(F.fled)return;\n  let evEnd;\n") : null;
const mv = mutant ? verdict(mutant) : null;
if (mv && !mv.ok) pass("red-proof: a flight that returns before the calls settle (the T-249 fault put back) goes red");
else fail(`red-proof: ${mutant ? "a flight that returns before the calls settle STAYS GREEN — this check cannot see its own fault" : "could not be built (the source moved — re-anchor)"}`);

console.log(fails ? `\nFAILED — ${fails} assertion(s)`
  : "\nPASSED — a caller is told the outcome of every fight, including one that ends in a flight");
process.exit(fails ? 1 : 0);
