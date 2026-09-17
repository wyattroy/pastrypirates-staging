#!/usr/bin/env node
/* A VOYAGE THAT STOPS SAYS SO ON EVERY SCREEN.
   Wyatt, 2026-09-17, AGREED: "When the host's voyage breaks, should every screen be told?" — yes. It was told nowhere: the host drew
   its own wreck box and published nothing, so a crew guest watching a bake sat for seven minutes on "… is at the ovens — watch the
   crates" (two-window run, 2026-09-16). The bake has no clock, by his own ruling, and the "host left" warning only fires when the
   host's tab disconnects — a live-but-broken host never does.
   THE FACT: this voyage has stopped and cannot go on. ONE place decides it (orchestrator haltVoyage), the engine records it
   (Game.halt -> {t:"halted"}), the feed carries it, and the ONE consumer draws it on every screen.
     1. the engine records a halt once per voyage
     2. haltVoyage records and pushes it, and is the only door the voyage's catches use
     3. the one consumer draws it, and releases a watcher's bench first
     4. no catch in the voyage chain is silent (a bare console.error), and the named exception is named
   Each rule is a pure function of the source; they run again below against a broken copy (RED-PROOF). */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const rd = f => fs.readFileSync(path.join(REPO, f), "utf8");
const code = s => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`\\])\/\/[^\n]*/g, "$1");
function body(src, head) {
  const h = src.indexOf(head); if (h < 0) return "";
  let j = src.indexOf("(", h), d = 0;
  for (; j < src.length; j++) { if (src[j] === "(") d++; else if (src[j] === ")") { d--; if (!d) break; } }
  j = src.indexOf("{", j); d = 0;
  for (; j < src.length; j++) { if (src[j] === "{") d++; else if (src[j] === "}") { d--; if (!d) break; } }
  return src.slice(h, j + 1);
}
function rules(files) {
  const eng = code(files["src/engine/index.js"]), orch = code(files["src/orchestrator.js"]);
  const main = code(files["src/main.js"]), panel = code(files["src/ui/panel.js"]);
  const out = [], rule = (ok, pass, fail) => out.push({ ok, text: ok ? pass : fail });
  const halt = body(eng, "halt(where){");
  rule(/this\.halted/.test(halt) && /t:"halted"/.test(halt),
    "the engine records a stopped voyage once, as an event every screen reads",
    "the engine has no one-per-voyage halt event — a stopped voyage is not a fact anyone else can hear");
  const door = body(orch, "export function haltVoyage(");
  /* THE TWO SITES THAT MAY STILL DRAW THE BOX THEMSELVES, by name: the consumer's own `halted` branch (it IS the drawing step) and a
     watcher's bench catch (this screen's own bench broke; there is nothing to tell the crew). Everything else goes through the door. */
  const allowed = [/if\(e\.t==="halted"\)\{[^\n]*/, /\.catch\(e=>\{voyageAground\(e,"bench watch"\);\}\)/];
  const rest = allowed.reduce((t, re) => t.replace(re, ""), orch.replace(door, ""));
  const strays = [["src/main.js", main], ["src/orchestrator.js", rest]]
    .flatMap(([f, s]) => (s.match(/voyageAground\(/g) || []).map(() => f));
  rule(/\.halt\(where\)/.test(door) && /pushEvents\(\)/.test(door) && /voyageAground\(/.test(door) && strays.length === 0,
    "one door records the halt, sends it to the crew and draws the box; the voyage's catches all use it",
    `haltVoyage is not the one door (records:${/\.halt\(where\)/.test(door)} pushes:${/pushEvents\(\)/.test(door)}), or ${strays.length} call(s) outside the two named sites still draw the box themselves: ${strays.join(", ")}`);
  const consume = body(orch, "export async function consumeEvent(e){");
  rule(/e\.t===?"halted"/.test(consume) && /releaseBench\(\)/.test(consume) && /voyageAground\(/.test(consume) && /releaseBench\(\)/.test(door)
       && /function releaseBench\(\)\{[^}]*applyBenchSnap\(null\)[\s\S]{0,80}retireBakeCard\(\)/.test(orch),
    "a stopped voyage releases BOTH kinds of bake-off on every screen — a watcher's bench and the baker's own card",
    "a screen is left holding a live bake-off under the wreck box (a watcher's bench, or the baker's own card)");
  const chain = [/runLiveNet\(\)\.catch\(([^)]*)\)/, /_evQ = _evQ\.then\(\(\) => consumeEvent\(e\)\)\.catch\(([^;]*)\)/];
  const silent = chain.map(re => (orch.match(re) || [""])[0]).filter(t => t && !/haltVoyage/.test(t));
  const namedException = /panel\.js's drain catch keeps calling voyageAground/.test(files["src/orchestrator.js"]) && /voyageAground\(/.test(panel);
  rule(silent.length === 0 && namedException,
    "no catch in the voyage chain dies quietly, and the one exception (the drain's own catch) is named in the code",
    silent.length ? `a voyage catch does not halt: ${silent.join(" | ")}` : "the drain's exception is not named where the door is defined");
  return out;
}
const FILES = Object.fromEntries(["src/engine/index.js", "src/orchestrator.js", "src/main.js", "src/ui/panel.js"].map(f => [f, rd(f)]));
const real = rules(FILES);
for (const r of real) console.log(`  ${r.ok ? "PASS" : "FAIL"}  ${r.text}`);
const broken = (file, from, to) => { const f = { ...FILES }; if (!f[file].includes(from)) return null; f[file] = f[file].replace(from, to); return f; };
const MUTANTS = [
  ["the engine's halt losing its once-per-voyage guard", broken("src/engine/index.js", "    if(this.halted)return null;\n    this.halted=true;\n", ""), 0],
  ["the door no longer sending it to the crew", broken("src/orchestrator.js", "      pushEvents();\n", ""), 1],
  ["a voyage catch drawing the box itself again", broken("src/orchestrator.js", 'runLiveNet().catch(e=>haltVoyage(e,"runLiveNet"))', 'runLiveNet().catch(e=>voyageAground(e,"runLiveNet"))'), 1],
  ["the consumer no longer releasing the bench", broken("src/orchestrator.js", 'if(e.t==="halted"){ releaseBench();', 'if(e.t==="halted"){'), 2],
  ["the calling screen left holding its own bench", broken("src/orchestrator.js", "  releaseBench();\n  voyageAground(err,where);", "  voyageAground(err,where);"), 2],
  ["the baker's own card left up (only a watcher's bench released)", broken("src/orchestrator.js", "try{ retireBakeCard(); }catch(e){}", ""), 2],
  ["the event queue dying quietly again", broken("src/orchestrator.js", '.catch(err => haltVoyage(err, "consumeEvent"))', '.catch(err => { console.error("consumeEvent", err); })'), 3],
];
let proof = true;
for (const [what, mutant, idx] of MUTANTS) {
  const res = mutant ? rules(mutant) : null, red = !!res && res[idx] && !res[idx].ok;
  if (!red) proof = false;
  console.log(`  ${red ? "PASS" : "FAIL"}  red-proof: ${what} ${red ? "goes red" : mutant ? "STAYS GREEN — the gate cannot see it" : "could not be built (the source moved)"}`);
}
const fails = real.filter(r => !r.ok).length;
console.log(fails || !proof ? `\nFAIL — ${fails} rule(s) broken${proof ? "" : ", and the red-proof did not hold"}` : `\nPASS — a stopped voyage reaches every screen; ${real.length} rules, each red-proofed`);
process.exit(fails || !proof ? 1 : 0);
