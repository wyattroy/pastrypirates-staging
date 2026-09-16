#!/usr/bin/env node
/* A FIGHT TAKES ITS POWDER IN ONE PLACE, AND SAYS SO.
   Found 2026-09-16 applying Wyatt's ruling on "architectural": a fight's powder was taken in two places — the engine's battle() and the
   animated fight a player watches (orchestrator.js asyncBattleRun) — and only the engine's copy recorded it, so the coins-leaving animation
   for powder never played in a real game. Now engine payPowder takes it and records a `powder` event; both fights call it; the one event
   consumer reads that event. RULES (red-proofed below):
     1. powder leaves a purse in exactly one place: Game.payPowder
     2. both fights pay through it — the engine's battle() and the orchestrator's asyncBattleRun
     3. the consumer shows the coins leaving from the `powder` event */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const walk = d => fs.readdirSync(path.join(REPO, d), { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(d, e.name)) : e.name.endsWith(".js") ? [path.join(d, e.name)] : []);
const strip = s => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`\\])\/\/[^\n]*/g, "$1");
function body(src, head) {
  const h = src.indexOf(head); if (h < 0) return "";
  let j = src.indexOf("(", h), d = 0;
  for (; j < src.length; j++) { if (src[j] === "(") d++; else if (src[j] === ")") { d--; if (!d) break; } }
  j = src.indexOf("{", j); d = 0;
  for (; j < src.length; j++) { if (src[j] === "{") d++; else if (src[j] === "}") { d--; if (!d) break; } }
  return src.slice(h, j + 1);
}
function rules(files) {
  const eng = strip(files["src/engine/index.js"]), orch = strip(files["src/orchestrator.js"]);
  const out = [], rule = (ok, pass, fail) => out.push({ ok, text: ok ? pass : fail });
  const takes = Object.values(files).reduce((n, s) => n + (strip(s).match(/\.coins\s*-=\s*[^;]*powder/g) || []).length, 0);
  const pay = body(eng, "payPowder(att){");
  rule(takes === 0 && /coins\s*-=\s*cost/.test(pay) && /t:"powder"/.test(pay),   // `takes` counts powder taken anywhere BUT payPowder
    "powder leaves a purse in exactly one place, Game.payPowder, which records it",
    `powder is taken ${takes} other time(s) outside payPowder, or payPowder does not take and record it`);
  rule(/this\.payPowder\(att\)/.test(body(eng, "battle(att,def){")) && /\.payPowder\(att\)/.test(body(orch, "async function asyncBattleRun(")),
    "both fights — the engine's and the one a player watches — pay their powder through it",
    "a fight pays its powder without payPowder");
  const consume = body(orch, "export async function consumeEvent(e){");
  rule(/"powder"/.test(consume) && /coinsLeave\(/.test(consume),
    "the one event consumer shows powder leaving the purse from the `powder` event",
    "consumeEvent does not read the `powder` event — powder coins never visibly leave");
  return out;
}
const files = Object.fromEntries(walk("src").map(f => [f.split(path.sep).join("/"), fs.readFileSync(path.join(REPO, f), "utf8")]));
const real = rules(files);
for (const r of real) console.log(`  ${r.ok ? "PASS" : "FAIL"}  ${r.text}`);
const orch = files["src/orchestrator.js"], a = "  appState.game.payPowder(att);";
const m1 = orch.includes(a) ? { ...files, "src/orchestrator.js": orch.replace(a, "  if(c.powder)att.coins-=c.powder;") } : null;
const red1 = !!m1 && !rules(m1)[0].ok, red2 = !!m1 && !rules(m1)[1].ok;
console.log(`  ${red1 && red2 ? "PASS" : "FAIL"}  red-proof: the watched fight taking its own powder again ${red1 && red2 ? "goes red" : m1 ? "STAYS GREEN" : "could not be built"}`);
const fails = real.filter(r => !r.ok).length, bad = fails || !(red1 && red2);
console.log(bad ? `\nFAIL — ${fails} rule(s)` : "\nPASS — a fight's powder is taken, and seen leaving, in one place");
process.exit(bad ? 1 : 0);
