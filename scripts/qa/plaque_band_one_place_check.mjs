#!/usr/bin/env node
/* WHETHER THE CAPTAINS' PLAQUE CARRIES A RECIPE BAND IS DECIDED IN ONE PLACE — WHEN ITS ROWS ARE BUILT.
   Wyatt, 2026-09-16, on the board flinching as the ingredients popped in: "diagnose the root cause." It was this fact decided too late:
   render() switched #capRecipeBand on during its first full pass, 3s in, after the board had been sized, so the plaque grew 45px and the
   board snapped 647 -> 602 wide at his window. The band's presence is a fact about the TABLE, so util.js buildPlayerRows decides it, from
   the row test it already makes; render() only fills the band in.
   RULE: the band's `hidden` is written in exactly one place in src/, and that place is buildPlayerRows. RED-PROOFED below. */
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
function writesIn(src) {
  const js = strip(src);
  const vars = [...js.matchAll(/(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:\$|document\.getElementById)\(\s*["']capRecipeBand["']\s*\)/g)].map(m => m[1]);
  let n = (js.match(/(?:\$|document\.getElementById)\(\s*["']capRecipeBand["']\s*\)\s*\.hidden\s*=/g) || []).length;
  for (const v of new Set(vars)) n += (js.match(new RegExp(`\\b${v}\\.hidden\\s*=`, "g")) || []).length;
  return n;
}
function rules(files) {
  const total = Object.values(files).reduce((n, s) => n + writesIn(s), 0);
  const inBuild = writesIn(body(files["src/ui/util.js"], "export function buildPlayerRows("));
  const ok = total === 1 && inBuild === 1;
  return [{ ok, text: ok ? "the plaque's recipe band is switched on or off in exactly one place: buildPlayerRows, as the rows are built"
    : `the band's presence is written ${total} time(s), ${inBuild} of them in buildPlayerRows — a second place can resize the plaque mid-voyage` }];
}
const files = Object.fromEntries(walk("src").map(f => [f.split(path.sep).join("/"), fs.readFileSync(path.join(REPO, f), "utf8")]));
const real = rules(files);
for (const r of real) console.log(`  ${r.ok ? "PASS" : "FAIL"}  ${r.text}`);
const b = files["src/ui/board.js"], anchor = 'if(band)band.classList.toggle("bandEmpty",!bandHtml);';
const mutant = b.includes(anchor) ? { ...files, "src/ui/board.js": b.replace(anchor, anchor + " band.hidden=false;") } : null;
const red = !!mutant && !rules(mutant)[0].ok;
console.log(`  ${red ? "PASS" : "FAIL"}  red-proof: render() switching the band on again ${red ? "goes red" : mutant ? "STAYS GREEN" : "could not be built (the source moved)"}`);
const fail = !real[0].ok || !red;
console.log(fail ? "\nFAIL" : "\nPASS — the plaque's shape is decided once, when its rows are built");
process.exit(fail ? 1 : 0);
