/* A-1 — DOCK AT TORTUGA, BAKE NOW. Wyatt, 2026-08-28: "I want: player to immediately be able to
 * start their bake-off when they dock at tortuga."
 *
 * MEASURED BEFORE CHANGING (the loop structure IS the behaviour): the bake-off day ran in TWO
 * phases — every seat's whole turn first, then every lit baker's attempt. A captain who docked at
 * Tortuga early in the order waited through every later captain's full turn before baking, which
 * is exactly his Q-1 observation ("Crustbeard started the ovens, but everyone got another turn
 * before the bake-off").
 *
 * THE RULE AFTER THIS CHANGE, one sentence with no phases in it: A BAKING CAPTAIN'S TURN IS THEIR
 * ATTEMPT, TAKEN IN THEIR OWN TURN SLOT. Newly docked -> ovens light -> the attempt runs in the
 * same slot; a captain still baking from a failed day attempts in their slot instead of sailing.
 * BOTH loops change in lockstep — the engine's headless playBakeoff and the live
 * runLiveDayBakeoff — because live and headless consuming identical randomness is what the whole
 * replay system stands on. Run RED against the two-phase tree.
 *
 * DETERMINISM COST, stated: the RNG interleaving changes, so the 2026-07-26 corpus (already
 * UNBOUND since the cutover — package.json marks test:determinism BROKEN) is further invalidated;
 * SOLO_SCHEMA_V bumps so a pre-change solo save is never replayed by post-change code.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

let fails = 0;
const pass = m => console.log("PASS " + m);
const fail = m => { console.log("FAIL " + m); fails++; };
/* ONE STRIPPER (2026-08-29). Every gate carried its own copy, and every copy deleted BLOCK
   comments first — so a LINE comment containing the characters that open one swallowed 152
   lines of src/orchestrator.js, the whole import block included, in eight gates at once.
   See scripts/qa/lib/strip_comments.mjs for the measurement. */
import { stripComments as strip } from "./lib/strip_comments.mjs";
function fnBody(src, name) {
  // strip FIRST, then anchor — a comment naming the function earlier in the file must not win
  const clean = strip(src);
  let h = clean.search(new RegExp(`(async function |async )?${name}\\(`));
  if (h < 0) return null;
  let i = clean.indexOf("{", clean.indexOf(")", h)), depth = 0, j = i;
  for (; j < clean.length; j++) {
    if (clean[j] === "{") depth++;
    else if (clean[j] === "}") { depth--; if (!depth) break; }
  }
  return clean.slice(i, j + 1);
}

const eng = fs.readFileSync(path.join(REPO, "src/engine/index.js"), "utf8");
const orch = fs.readFileSync(path.join(REPO, "src/orchestrator.js"), "utf8");

/* 1. the engine's headless day: the attempt rides the turn slot */
{
  const body = fnBody(eng, "playBakeoff") || "";
  const turnLoop = body.slice(0, body.indexOf("endBakeDay"));
  if (/lightOvens\(p\)\)\s*this\.bakeAttempt\(p/.test(turnLoop.replace(/\s+/g, " ")) || /if\(this\.lightOvens\(p\)\)this\.bakeAttempt\(p/.test(turnLoop))
    pass("engine: a newly-lit captain bakes in their own turn slot");
  else fail("engine: lightOvens does not feed bakeAttempt in the same turn slot — the two-phase day survives");
  if (/for\(const i of this\.bakersToday\(order\)\)this\.bakeAttempt/.test(body))
    fail("engine: the end-of-day bake phase still exists — everyone still gets a turn before the bake-off");
  else pass("engine: no end-of-day bake phase");
  if (/if\(p\.baking\)\{\s*this\.bakeAttempt\(p,null\);\s*continue;?\s*\}/.test(turnLoop.replace(/\s+/g, " ").replace(/\s/g, "")) || /if\(p\.baking\)\{this\.bakeAttempt\(p,null\);continue;\}/.test(turnLoop.replace(/\s+/g, "")))
    pass("engine: a continuing baker attempts in their slot instead of sailing");
  else fail("engine: a continuing baker's attempt is not in their turn slot");
}

/* 2. the live day mirrors it exactly */
{
  const body = fnBody(orch, "runLiveDayBakeoff") || "";
  if (/lightOvens\(p\)/.test(body) && /bakeTurnLive\(p\)/.test(body.slice(body.indexOf("lightOvens"))))
    pass("live: a newly-lit captain bakes in their own turn slot");
  else fail("live: lightOvens does not lead to bakeTurnLive in the same slot");
  if (/bakersToday/.test(body))
    fail("live: the end-of-day bake phase still exists");
  else pass("live: no end-of-day bake phase");
}

/* 3. old solo saves must not replay across the reorder */
{
  const u = fs.readFileSync(path.join(REPO, "src/ui/util.js"), "utf8");
  const m = u.match(/export const SOLO_SCHEMA_V=(\d+)/);
  if (m && Number(m[1]) >= 3) pass(`SOLO_SCHEMA_V=${m[1]} — pre-reorder saves are refused, not desynced`);
  else fail(`SOLO_SCHEMA_V=${m && m[1]} — a solo save recorded under the two-phase day would replay differently and desync mid-bake`);
}

console.log(fails ? `\nFAILED — ${fails} assertion(s)` : "\nPASSED — dock at Tortuga, bake now, on both loops");
process.exit(fails ? 1 : 0);
