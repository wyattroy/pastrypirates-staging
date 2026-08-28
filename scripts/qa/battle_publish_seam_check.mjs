/* FORK 3, STEP A — THE BATTLE PUBLISH LEAVES THE RENDERER. Wave 1, 2026-08-28.
 *
 * The fork-3 map (.planning/research/wave1-convergence/FORKS-2-AND-3.md) named the ECHO LOOP as
 * this fork's landmine: renderBattle() published to Firebase from INSIDE the renderer, and
 * watchBattle() bailed for the host purely to stop it reading its own write. The one-activity-
 * engine convergence cannot route the host through the shared consumer while a renderer writes
 * the wire — so the publish moves out FIRST, into battlePublish(o), the same benchPublish/
 * applyBenchSnap shape the bake-off already uses (local render always; the write under its own
 * guard). Run RED against the pre-lift tree on 2026-08-28.
 *
 * WHAT THIS DOES NOT DO YET (deliberately — the map's own sequencing): watchBattle's
 * `if(appState.isHost)return;` guard STAYS until the host actually consumes the battle node, and
 * playBattleEngage's edge trigger is untouched. Removing the guard is the later convergence step;
 * this gate only pins the precondition that makes it possible without an echo.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

let fails = 0;
const pass = m => console.log("PASS " + m);
const fail = m => { console.log("FAIL " + m); fails++; };
const src = fs.readFileSync(path.join(REPO, "src/orchestrator.js"), "utf8");

// slice a function body by brace-matching from its header — located by content, never line number
function fnBody(name) {
  const h = src.indexOf(`export function ${name}(`);
  if (h < 0) return null;
  let i = src.indexOf("{", h), depth = 0, j = i;
  for (; j < src.length; j++) {
    if (src[j] === "{") depth++;
    else if (src[j] === "}") { depth--; if (!depth) break; }
  }
  return src.slice(i, j + 1);
}

/* 1. the renderer no longer writes the wire */
{
  const body = fnBody("renderBattle");
  if (!body) fail("renderBattle() not found in src/orchestrator.js — re-anchor this gate, do not delete it");
  else if (/netSetBattle/.test(body)) fail("renderBattle() still publishes to Firebase from inside the renderer — the echo-loop landmine the fork-3 map warned about");
  else pass("renderBattle() is a pure renderer — no netSetBattle inside it");
}

/* 2. battlePublish exists and is the ONE battle-scoreboard publish site */
{
  const body = fnBody("battlePublish");
  if (!body) { fail("battlePublish() does not exist — the publish has nowhere to live outside the renderer"); }
  else {
    if (/renderBattle\(/.test(body)) pass("battlePublish() renders locally (Rule A: mirror when remote, local render always)");
    else fail("battlePublish() does not render locally — the host's own screen would go blank");
    if (/netSetBattle/.test(body) && /battleSnapshot/.test(body)) pass("battlePublish() writes the snapshot to the wire");
    else fail("battlePublish() does not write battleSnapshot to the wire");
  }
  // every netSetBattle write of a battle SNAPSHOT must be in battlePublish; the bench's two
  // {title,bake} writes (benchPublish and benchReveal) are the sanctioned other writers on this
  // node — a different payload class, counted by name below so a fourth writer goes loud.
  // (the import line has no paren and never matches this pattern)
  const sites = [...src.matchAll(/netSetBattle\(/g)].length;
  if (sites !== 3) fail(`expected exactly 3 netSetBattle call sites (battlePublish scoreboard + benchPublish/benchReveal bench), found ${sites}`);
  else pass("exactly 3 netSetBattle call sites: battlePublish (scoreboard), benchPublish + benchReveal (bench)");
}

/* 3. no orphaned direct render in the battle choreography — every scoreboard MOMENT publishes.
      The choreography's renderBattle( calls all became battlePublish( in the lift; a later direct
      renderBattle( call in the host loop would be a moment the table never sees. The two
      sanctioned direct callers are battlePublish itself and the handler-table row that serves
      renderBattleFromSnap (the GUEST's render path, which must never publish). */
{
  const stripped = src.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").map(l => l.replace(/\/\/.*$/, "")).join("\n");
  const direct = [...stripped.matchAll(/(?<![A-Za-z])renderBattle\(/g)].length;
  // battlePublish's own call + the export declaration's `export function renderBattle(` header
  // (the regex excludes the header via the preceding-letter guard on `function renderBattle`? no —
  // count and name the sanctioned sites instead of guessing):
  const inPublish = (fnBody("battlePublish") || "").match(/renderBattle\(/g)?.length || 0;
  const header = 1; // its own `export function renderBattle(` — matched by the pattern
  const sanctioned = inPublish + header;
  if (direct > sanctioned) fail(`${direct - sanctioned} direct renderBattle( call(s) remain outside battlePublish — a scoreboard moment the table never sees`);
  else pass("no direct renderBattle( calls outside battlePublish in the host loop");
}

/* 4. the echo guard stays until the host consumes the node */
{
  const body = fnBody("watchBattle") || "";
  if (/if\(appState\.isHost\)return;/.test(body)) pass("watchBattle keeps its host guard (removal is the later convergence step, not this one)");
  else fail("watchBattle's host guard is gone — with the publish lifted this may be intentional convergence, but it must arrive WITH the host consuming the node, not as a side effect of this lift");
}

console.log(fails ? `\nFAILED — ${fails} assertion(s)` : "\nPASSED — the battle publish is out of the renderer");
process.exit(fails ? 1 : 0);
