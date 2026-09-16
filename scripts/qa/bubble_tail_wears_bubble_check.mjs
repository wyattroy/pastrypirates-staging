#!/usr/bin/env node
/* A NARRATION BUBBLE'S TAIL WEARS ITS BUBBLE'S COLOURS — IT DECIDES NONE OF ITS OWN.
   Wyatt, 2026-09-16: "there's a weird little white diamond that appears in the water near my boat during battles. why?" It was the dark-blue
   battle bubble's tail: .pp4Tail painted its own cream fill and took its edge from the text colour, so recolouring a bubble never reached
   its tail. Each kind of bubble now sets --bubBg and --bubEdge once; .pp4Bub and .pp4Tail paint only from them.
   Rules, run against index.html's styles and src/ (and against broken copies below — RED-PROOF):
     1. no rule for .pp4Tail sets a colour except var(--bubBg) / var(--bubEdge)
     2. no rule for .pp4Bub paints a background or border colour except through those two variables
     3. no script paints a bubble's or a tail's background or border colour */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const walk = d => fs.readdirSync(path.join(REPO, d), { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(d, e.name)) : e.name.endsWith(".js") ? [path.join(d, e.name)] : []);
const COLOUR_PROPS = /\b(background(?:-color)?|border(?:-(?:top|right|bottom|left))?(?:-color)?)\s*:\s*([^;}]+)/g;
function rules(html, js) {
  const css = (html.match(/<style[^>]*>([\s\S]*?)<\/style>/g) || []).join("\n").replace(/\/\*[\s\S]*?\*\//g, "");
  const out = [], rule = (ok, pass, fail) => out.push({ ok, text: ok ? pass : fail });
  const blocks = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(m => ({ sel: m[1].trim(), body: m[2] }));
  const offending = (want) => blocks.filter(b => want.test(b.sel)).flatMap(b => [...b.body.matchAll(COLOUR_PROPS)]
    .filter(m => /#|rgb|hsl|\b(white|black|transparent)\b/i.test(m[2]) && !/var\(--bub(Bg|Edge)\)/.test(m[2]))
    .map(m => `${b.sel.slice(0, 40)} { ${m[1]}: ${m[2].trim().slice(0, 30)} }`));
  const tail = offending(/\.pp4Tail\b/);
  rule(tail.length === 0, "a bubble's tail paints only its bubble's own two colours (var(--bubBg), var(--bubEdge))",
    `a tail decides a colour of its own: ${tail.join(" | ")}`);
  const bub = offending(/\.pp4Bub\b(?![\w-])(?![^,]*\.pp4Tail)/);
  rule(bub.length === 0, "every kind of bubble sets its colours only through --bubBg and --bubEdge",
    `a bubble paints a colour directly, where its tail cannot follow: ${bub.join(" | ")}`);
  const scripted = js.filter(([, s]) => /pp4(Bub|Tail)[\s\S]{0,120}\.style\.(background|backgroundColor|borderColor|border)\s*=/.test(s)).map(([f]) => f);
  rule(scripted.length === 0, "no script paints a bubble's or a tail's colours", `a script paints bubble colours in ${scripted.join(", ")}`);
  return out;
}
const html = fs.readFileSync(path.join(REPO, "index.html"), "utf8");
const js = walk("src").map(f => [f, fs.readFileSync(path.join(REPO, f), "utf8")]);
const real = rules(html, js);
for (const r of real) console.log(`  ${r.ok ? "PASS" : "FAIL"}  ${r.text}`);
const swap = (a, b) => html.includes(a) ? html.replace(a, b) : null;
const MUTANTS = [
  ["the tail given its own cream fill again", swap("height:15px; background:var(--bubBg);", "height:15px; background:#fffdf2;"), 0],
  ["the battle bubble painted directly again", swap(".pp4Bub.btl { --bubBg:#12323a;", ".pp4Bub.btl { background:#12323a;"), 1],
];
let proof = true;
for (const [what, mut, idx] of MUTANTS) {
  const red = !!mut && !rules(mut, js)[idx].ok; if (!red) proof = false;
  console.log(`  ${red ? "PASS" : "FAIL"}  red-proof: ${what} ${red ? "goes red" : mut ? "STAYS GREEN" : "could not be built (the source moved)"}`);
}
const fails = real.filter(r => !r.ok).length;
console.log(fails || !proof ? `\nFAIL — ${fails} rule(s)${proof ? "" : ", red-proof did not hold"}` : "\nPASS — a bubble's tail wears its bubble's colours, everywhere");
process.exit(fails || !proof ? 1 : 0);
