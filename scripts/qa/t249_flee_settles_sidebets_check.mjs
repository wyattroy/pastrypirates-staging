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
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const pass = m => console.log("PASS " + m);
const fail = m => { console.log("FAIL " + m); fails++; };

const src = fs.readFileSync(path.join(REPO, "src/orchestrator.js"), "utf8");

const fn = (src.match(/async function asyncBattleRun\(att,def\)\{[\s\S]*?\n\}\n/) || [""])[0];
if (!fn) {
  fail("could not find asyncBattleRun in src/orchestrator.js — re-anchor this check");
} else {
  // Isolate the stretch from the flee flag's declaration down to the function's end, so the
  // assertion is about THIS function's flee handling and cannot accidentally match settleSideBets
  // calls that belong to the nulled/win exits elsewhere in the same file.
  const fleeIdx = fn.search(/if\(fled\)(\{|return)/);
  const tail = fleeIdx === -1 ? "" : fn.slice(fleeIdx);
  if (!tail) {
    fail("the flee exit (`if(fled)...`) is gone or reshaped — re-anchor this check against src/orchestrator.js's current text before trusting either verdict");
  } else {
    // The fix must settle the bets ON THE FLEE PATH ITSELF, before the function leaves — not
    // merely call settleSideBets somewhere later in the file, which the fled captain never reaches.
    const fleeGuard = (tail.match(/if\(fled\)\{[\s\S]*?\}|if\(fled\)return;/) || [""])[0];
    const settlesOnFlee = /settleSideBets\(\s*bets\s*,\s*null\s*\)/.test(fleeGuard);
    const stillReturns = /return;\s*\}?\s*$/.test(fleeGuard);
    if (settlesOnFlee && stillReturns) {
      pass(`the flee exit settles the side bets before leaving (\`${fleeGuard.replace(/\s+/g, " ")}\`) — a spectator who called this fight is told, with no bounty, exactly as a NULL battle already tells them`);
    } else if (settlesOnFlee && !stillReturns) {
      fail(`the flee guard now calls settleSideBets but no longer returns — it would fall through into the win/plunder logic with no winner assigned (\`${fleeGuard.replace(/\s+/g, " ")}\`)`);
    } else {
      fail(`the flee exit never settles the side bets (\`${fleeGuard.replace(/\s+/g, " ")}\`) — a captain asked to call this fight from the crow's nest is left with no answer at all: no "sidebet" event, no "The Lookout settles" line, nothing. The NULL exit two branches below (\`settleSideBets(bets,null)\`) is the exact shape this path is missing`);
    }
  }
}

console.log(fails ? `\nFAILED — ${fails} assertion(s)`
  : "\nPASSED — a caller is told the outcome of every fight, including one that ends in a flight");
process.exit(fails ? 1 : 0);
