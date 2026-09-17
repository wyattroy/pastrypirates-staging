#!/usr/bin/env node
/* WHICH WORDS THE FLIP STAGE SHOWS IS DECIDED IN ONE PLACE.
   Wyatt, 2026-09-16: "during flippenator flips, the TAILS or HEADS text that appears at the end is written on top of other text. the other
   text shouldn't be there, or should be removed first." The stage's lines were shown and hidden in three places (stage.js cerClearStamp and
   coinLandsWithWeight, index.html's .resolving rule) and two of its three lines in none — so the landing word stamped over the stakes.
   Now: the stage has ONE phase, set by stage.js cerPhase alone, and index.html's [data-cer] block decides every line from it.
   Rules (pure functions of the source, so the same functions run against broken copies — RED-PROOF below):
     1. the phase is written in exactly one place (cerPhase)
     2. no script shows or hides a stage line itself (style.visibility / opacity / display on .pp4CerTitle, .pp4CerStakes, .pp4CerSub)
     3. every line of words the stage creates is hidden in the "verdict" phase — a NEW line added later must be named there too
     4. no stylesheet rule shows or hides a stage line except by [data-cer] */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const rd = f => fs.readFileSync(path.join(REPO, f), "utf8");
const strip = s => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`\\])\/\/[^\n]*/g, "$1");
const NOT_WORDS = new Set(["pp4CerSlot", "pp4CerStamp"]);   // the coin's slot and the landing word itself

function rules(stage, html) {
  const js = strip(stage), css = strip((html.match(/<style[^>]*>[\s\S]*?<\/style>/g) || []).join("\n"));
  const out = [], rule = (ok, pass, fail) => out.push({ ok, text: ok ? pass : fail });
  const writes = (js.match(/\.dataset\.cer\s*=|setAttribute\(\s*["']data-cer["']/g) || []).length;
  rule(writes === 1 && /function cerPhase\([^)]*\)\s*\{[^}]*dataset\.cer\s*=/.test(js),
    "the stage's phase is written in exactly one place (cerPhase)", `the stage's phase is written in ${writes} place(s) — it must be only cerPhase`);
  const lines = [...new Set([...js.matchAll(/className\s*=\s*["'](pp4Cer[A-Za-z]+)["']/g), ...js.matchAll(/class=\\?["'](pp4Cer[A-Za-z]+)/g)].map(m => m[1]))].filter(c => !NOT_WORDS.has(c));
  const vars = [...js.matchAll(/(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*[^;]*querySelector\(\s*["']\.(pp4Cer[A-Za-z]+)["']\)/g)].filter(m => lines.includes(m[2])).map(m => m[1]);
  const direct = (js.match(/querySelector\(\s*["']\.pp4Cer(?:Title|Stakes|Sub)["']\)\s*\)?\s*\.style\.(?:visibility|opacity|display)/g) || []).length;
  const viaVar = vars.reduce((n, v) => n + (js.match(new RegExp(`\\b${v}\\.style\\.(?:visibility|opacity|display)\\s*=`, "g")) || []).length, 0);
  rule(direct + viaVar === 0, "no script shows or hides a line of the stage's words itself",
    `a script sets a stage line's visibility/opacity/display ${direct + viaVar} time(s) — only the [data-cer] block may`);
  const verdictHides = new Set([...css.matchAll(/#pp4Veil\[data-cer="verdict"\]\s*\.(pp4Cer[A-Za-z]+)/g)].map(m => m[1]));   // every selector in the comma list
  const blockBody = (css.match(/#pp4Veil\[data-cer="verdict"\][^{]*\{([^}]*)\}/) || [])[1] || "";
  const missing = lines.filter(c => !verdictHides.has(c));
  rule(lines.length >= 3 && missing.length === 0 && /visibility\s*:\s*hidden/.test(blockBody),
    `every line of words the stage creates (${lines.join(", ")}) leaves before the landing word`,
    `the landing word can stamp over ${missing.join(", ") || "a line"} — every line the stage creates must be hidden in [data-cer="verdict"]`);
  const stray = [...css.matchAll(/([^{}]*\.(pp4CerTitle|pp4CerStakes|pp4CerSub)\b[^{}]*)\{([^}]*)\}/g)]
    .filter(m => /\b(opacity|visibility|display)\s*:/.test(m[3]) && !/\[data-cer=/.test(m[1])).map(m => m[1].trim().slice(0, 60));
  rule(stray.length === 0, "no stylesheet rule shows or hides a stage line except by the stage's phase",
    `a rule hides or shows a stage line outside the phase block: ${stray.join(" | ")}`);
  /* 5. A TAP STAYS "spinning" UNTIL THE COIN LANDS (2026-09-17). The tap set "spinning" and the launch it then ran called a tidy-up that
     set "ask" again, so "Tap the coin" stood over the whole spin. Only arming may say "ask"; nothing the launch calls may. */
  const body = head => { const h = js.indexOf(head); if (h < 0) return ""; let j = js.indexOf("{", js.indexOf(")", h)), d = 0;
    for (let k = j; k < js.length; k++) { if (js[k] === "{") d++; else if (js[k] === "}") { d--; if (!d) return js.slice(h, k + 1); } } return ""; };
  const tidy = body("function cerClearStamp("), launch = body("function coinSinksAndLaunches(");
  const askSites = (js.match(/cerPhase\([^,]+,\s*"ask"\)/g) || []).length;
  rule(!/cerPhase\(/.test(tidy) && !/cerPhase\([^,]+,\s*"ask"\)/.test(launch) && askSites === 1,
    "a tapped coin stays \"spinning\" until it lands — only arming the coin says \"ask\"",
    `"ask" is set in ${askSites} place(s)${/cerPhase\(/.test(tidy) ? ", including the tidy-up a tap's launch runs" : ""} — "Tap the coin" can come back over the spin`);
  return out;
}
const stage = rd("src/ui/stage.js"), html = rd("index.html");
const real = rules(stage, html);
for (const r of real) console.log(`  ${r.ok ? "PASS" : "FAIL"}  ${r.text}`);
const swap = (s, a, b) => s.includes(a) ? s.replace(a, b) : null;
const MUTANTS = [
  ["a second place writes the phase", swap(stage, "function cerClearStamp(){", "function cerClearStamp(){\n  $(\"pp4Veil\").dataset.cer = \"ask\";"), null, 0],
  ["a script hides \"Tap the coin\" itself again", swap(stage, "  cerPhase(v, \"verdict\");", "  const sub2 = v.querySelector(\".pp4CerSub\"); sub2.style.visibility = \"hidden\";\n  cerPhase(v, \"verdict\");"), null, 1],
  ["a new line of words the verdict does not clear", swap(stage, "t.className = \"pp4CerTitle\";", "t.className = \"pp4CerTitle\"; const w2 = document.createElement(\"div\"); w2.className = \"pp4CerWind\";"), null, 2],
  ["the tidy-up saying \"ask\" again, mid-spin", swap(stage, "  v.querySelectorAll(\".pp4CerStamp\").forEach(s => s.remove());\n}", "  v.querySelectorAll(\".pp4CerStamp\").forEach(s => s.remove());\n  cerPhase(v, \"ask\");\n}"), null, 4],
  ["the old fade rule put back", null, swap(html, "  #pp4Veil[data-cer=\"spinning\"] .pp4CerSub { opacity:0; }", "  #pp4Veil[data-cer=\"spinning\"] .pp4CerSub { opacity:0; }\n  #pp4Veil.resolving .pp4CerSub { opacity:0; }"), 3],
];
let proof = true;
for (const [what, st, ht, idx] of MUTANTS) {
  const built = (st !== null || ht !== null) && (st === null || typeof st === "string") && (ht === null || typeof ht === "string");
  const res = built ? rules(st || stage, ht || html) : null, red = !!res && !res[idx].ok;
  if (!red) proof = false;
  console.log(`  ${red ? "PASS" : "FAIL"}  red-proof: ${what} ${red ? "goes red" : built ? "STAYS GREEN" : "could not be built (the source moved)"}`);
}
const fails = real.filter(r => !r.ok).length;
console.log(fails || !proof ? `\nFAIL — ${fails} rule(s) broken${proof ? "" : ", red-proof did not hold"}` : `\nPASS — the flip stage's words are decided in one place; ${real.length} rules, each red-proofed`);
process.exit(fails || !proof ? 1 : 0);
