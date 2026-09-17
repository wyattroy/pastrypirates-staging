#!/usr/bin/env node
/* A CRATE CHANGING HOLDS IS ONE ANIMATION, WHATEVER MOVED IT.
   Wyatt, 2026-09-16, on build .5: "when you steal an ingredient from another player through battle, those crates should change holds
   according to the same exact animation as trades." A plundered crate tumbled into the sea off the loser (board.js loserKnocked) while a
   traded crate flew hold to hold (tradeSwapFrom/To). board.js holdMovesFrom now reads every crate that changes holds off the event —
   a trade's two, a fight's plunder — and holdMovesTo flies them all the same way.
     1. holdMovesFrom reads both a trade and a battle's plunder
     2. the one event consumer asks it for every event, not for one event name
     3. no crate is thrown into the sea any more, and the old trade-only names are gone */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const walk = d => fs.readdirSync(path.join(REPO, d), { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(d, e.name)) : e.name.endsWith(".js") ? [path.join(d, e.name)] : []);
const code = s => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`\\])\/\/[^\n]*/g, "$1");   // comments never count as code
/* A function's body: skip the parameter list first (a default like `{a=1}={}` has braces of its own). */
function body(src, head) {
  const h = src.indexOf(head); if (h < 0) return "";
  let j = src.indexOf("(", h), d = 0;
  for (; j < src.length; j++) { if (src[j] === "(") d++; else if (src[j] === ")") { d--; if (!d) break; } }
  j = src.indexOf("{", j); d = 0;
  for (; j < src.length; j++) { if (src[j] === "{") d++; else if (src[j] === "}") { d--; if (!d) break; } }
  return src.slice(h, j + 1);
}
const FILES = Object.fromEntries(walk("src").map(f => [f.split(path.sep).join("/"), fs.readFileSync(path.join(REPO, f), "utf8")]));
function run(rules, mutants, passLine) {
  const real = rules(FILES);
  for (const r of real) console.log(`  ${r.ok ? "PASS" : "FAIL"}  ${r.text}`);
  let proofOk = true;
  for (const [what, file, from, to, idx] of mutants) {
    const f = { ...FILES };
    const can = f[file] && f[file].includes(from);
    if (can) f[file] = f[file].replace(from, to);
    const res = can ? rules(f) : null;
    const red = !!res && res[idx] && !res[idx].ok;
    if (!red) proofOk = false;
    console.log(`  ${red ? "PASS" : "FAIL"}  red-proof: ${what} ${red ? "goes red" : can ? "STAYS GREEN — the gate cannot see it" : "could not be built (the source moved)"}`);
  }
  const fails = real.filter(r => !r.ok).length;
  console.log(fails || !proofOk ? `\nFAIL — ${fails} rule(s) broken${proofOk ? "" : ", and the red-proof did not hold"}` : `\nPASS — ${passLine}; ${real.length} rule(s), each red-proofed`);
  process.exit(fails || !proofOk ? 1 : 0);
}
const ruleSet = () => { const out = []; return { out, rule: (ok, pass, fail) => out.push({ ok, text: ok ? pass : fail }) }; };
function rules(files) {
  const { out, rule } = ruleSet();
  const board = code(files["src/ui/board.js"] || ""), orch = code(files["src/orchestrator.js"] || "");
  const from = body(board, "export function holdMovesFrom(");
  rule(/e\.t===?"trade"/.test(from) && /e\.t===?"battle"/.test(from) && /spoilIng/.test(from),
    "one reader names every crate that changes holds: a trade's and a fight's plunder", "holdMovesFrom no longer reads both a trade and a fight's plunder");
  const consume = body(orch, "export async function consumeEvent(e){");
  rule(/holdMovesFrom\(e\)/.test(consume) && !/e\.t\s*===?\s*"trade"[^;]{0,40}holdMovesFrom/.test(consume) && /holdMovesTo\(/.test(consume),
    "the one event consumer asks it for every event and flies whatever it returns", "consumeEvent asks for crate moves only for some events, or never flies them");
  const legacy = Object.entries(files).filter(([, s]) => /tradeSwapFrom|tradeSwapTo|ppCrateSplash|crate-splash/.test(code(s))).map(([f]) => f);
  rule(legacy.length === 0, "no crate splashes into the sea, and no trade-only crate animation remains", `an old crate animation is still in ${legacy.join(", ")}`);
  return out;
}
run(rules, [
  ["plunder left out of the reader", "src/ui/board.js", '}else if(e.t==="battle"&&e.spoilIng&&e.winner!=null){', '}else if(false){', 0],
  ["the consumer asking only for trades", "src/orchestrator.js", "const swapFlight=!appState.replaying?holdMovesFrom(e):null;", 'const swapFlight=(e.t==="trade"&&!appState.replaying)?holdMovesFrom(e):null;', 1],
  ["the sea splash put back", "src/ui/board.js", "export const KNOCK_MS=900;", 'export const KNOCK_MS=900; const _c="crate-splash";', 2],
], "a crate changing holds flies one way, whatever moved it");
