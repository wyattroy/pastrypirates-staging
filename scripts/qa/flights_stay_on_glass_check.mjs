#!/usr/bin/env node
/* EVERYTHING THAT FLIES STAYS ON THE SCREEN — ONE RULE, IN arcFrames.
   Wyatt, 2026-09-16, on build .5: "when the crate is parabollically lobbed into the hold in desktop mode, it goes off the screen for its
   whole journey. Can you calculate the crates max height based on the screen height ... with the constraint of keeping it onscreen? ...
   i basically want the parabola, and also want the crate to remain visible, if possible." A flight's height was a share of its own
   length; a tall desktop board lifted an island's crate out of the window. board.js onGlass cuts height and sideways bow to the window.
     1. arcFrames applies onGlass whenever it is told where the flight starts
     2. every arcFrames( call in src/ says where it starts (from:) — no flight is exempt
     3. no caller clamps against the window itself (the trade swap's old private clamp was the first copy of this rule) */
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
  const board = code(files["src/ui/board.js"] || "");
  rule(/if\s*\(\s*from\s*\)\s*\(\s*\{\s*lift\s*,\s*side\s*\}\s*=\s*onGlass\(/.test(body(board, "export function arcFrames(")) && /innerWidth/.test(body(board, "export function onGlass(")),
    "arcFrames cuts every flight it is told the start of to what the window has room for (onGlass)",
    "arcFrames no longer applies onGlass — a flight can leave the screen again");
  const calls = Object.entries(files).flatMap(([f, s]) => { const c = code(s); const r = []; let i = -1;
    while ((i = c.indexOf("arcFrames(", i + 1)) >= 0) { if (/function\s+$/.test(c.slice(Math.max(0, i - 9), i))) continue; r.push([f, c.slice(i, i + 220)]); } return r; });
  const bare = calls.filter(([, t]) => !/\bfrom\s*[:,]/.test(t.slice(0, t.indexOf("})") + 2 || 220)));
  rule(calls.length > 0 && bare.length === 0, `all ${calls.length} flights say where they start, so all of them stay on the screen`, `${bare.length} flight(s) never say where they start: ${bare.map(([f, t]) => f + " " + t.slice(0, 60)).join(" | ")}`);
  const privateClamps = Object.entries(files).filter(([f]) => f.startsWith("src/")).flatMap(([f, s]) => { const c = code(s).replace(body(code(s), "export function onGlass("), ""); return /window\.innerWidth\s*-\s*half/.test(c) ? [f] : []; });
  rule(privateClamps.length === 0, "no flight keeps its own window clamp beside the shared one", `a private window clamp is back in ${privateClamps.join(", ")}`);
  return out;
}
run(rules, [
  ["the rule taken out of arcFrames", "src/ui/board.js", "  if(from)({lift,side}=onGlass(from,dx,dy,lift,side,half));\n", "\n", 0],
  ["a crate launched without saying where it starts", "src/ui/board.js", "{lift,from:[cx,cy],half:f.rect.h*.62,", "{lift,", 1],
  ["the trade swap's private clamp put back", "src/ui/board.js", "    const side=leg.bow*CRATE_BOW", "    const half=9,cx0=0; Math.min(window.innerWidth-half-cx0,1);\n    const side=leg.bow*CRATE_BOW", 2],
], "every flight's height and bow are cut to the window in one place");
