#!/usr/bin/env node
/* NO RULE HIDES INSIDE ANOTHER RULE'S BRACES.
   Wyatt, 2026-09-16: "active player's ship disappeared when it is not sailing (it is only visible during sailing)". The cause: a rule
   for #bobHost (the layer the active boat's bobbing copy is drawn in) had been pasted INSIDE the #boardShips rule, between its
   declarations. Every browser with CSS nesting reads that as "#bobHost inside #boardShips" — which matches nothing, the two being
   siblings — so the layer was never positioned, and at his window the boat drew 602px below itself for a whole day. Nothing went red:
   the file parsed, every other rule applied, and at phone size the stray layer happened to land close enough to look right.
   This holds the whole class, not the one instance: a `{` opened inside an ordinary rule is a FAIL unless it is deliberate nesting
   (a selector starting with `&`) — at-rules that exist to hold rules (@media, @supports, @container, @layer, @keyframes' steps) are fine.
   Every .html page at the root and every .css file under src/ is read. RED-PROOFED below against a copy with a rule pushed inside another. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function styleText(file) {
  const s = fs.readFileSync(file, "utf8");
  if (file.endsWith(".css")) return [{ css: s, line0: 1 }];
  const out = []; const re = /<style[^>]*>([\s\S]*?)<\/style>/g; let m;
  while ((m = re.exec(s))) out.push({ css: m[1], line0: s.slice(0, m.index).split("\n").length });
  return out;
}
/* Walk the braces. Comments and strings are blanked first (keeping newlines, so line numbers hold). */
function problems(css, line0) {
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, c => c.replace(/[^\n]/g, " ")).replace(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g, c => c.replace(/[^\n]/g, " "));
  const stack = [], out = []; let start = 0;
  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i];
    if (ch === "{") {
      const head = clean.slice(start, i).split(";").pop().trim();
      const parent = stack[stack.length - 1];
      const kind = head.startsWith("@") ? (/^@(media|supports|container|layer|document|scope|starting-style)\b/.test(head) ? "group" : /^@(-webkit-)?keyframes\b/.test(head) ? "keyframes" : "atrule") : "rule";
      if (parent && parent.kind === "rule" && !head.startsWith("&")) {
        const line = line0 + clean.slice(0, i).split("\n").length - 1;
        out.push(`line ${line}: "${head.slice(0, 60)}" opens inside "${parent.head.slice(0, 40)}" (line ${parent.line}) — a rule inside another rule's braces matches nothing`);
      }
      stack.push({ head, kind: parent && parent.kind === "keyframes" ? "step" : kind, line: line0 + clean.slice(0, i).split("\n").length - 1 });
      start = i + 1;
    } else if (ch === "}") { stack.pop(); start = i + 1; }
  }
  return out;
}
const files = fs.readdirSync(REPO).filter(f => f.endsWith(".html")).map(f => path.join(REPO, f));
const walk = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(d, e.name)) : e.name.endsWith(".css") ? [path.join(d, e.name)] : []);
if (fs.existsSync(path.join(REPO, "src"))) files.push(...walk(path.join(REPO, "src")));

let fails = 0, blocks = 0;
for (const f of files) for (const { css, line0 } of styleText(f)) {
  blocks++;
  for (const p of problems(css, line0)) { console.log(`  FAIL  ${path.relative(REPO, f)} ${p}`); fails++; }
}
// RED-PROOF: the exact shape of the 2026-09-15 mistake must go red, and deliberate `&` nesting and @media must not.
const broken = problems("#a { position: absolute;\n  #b { z-index: 4; }\n  width: 100%; }", 1).length;
const fine = problems("@media (max-width: 9px) { #a { color: red; } }\n@keyframes k { from { opacity: 0 } to { opacity: 1 } }\n.x { color: red; & .y { color: blue; } }", 1).length;
const redproof = broken === 1 && fine === 0;
console.log(`  ${redproof ? "PASS" : "FAIL"}  the check can fail: a rule pasted inside another goes red (${broken}), @media, @keyframes and & nesting stay green (${fine})`);
console.log(fails || !redproof ? `\nFAIL — ${fails} rule(s) inside another rule's braces, across ${files.length} file(s)` : `\nPASS — no rule hides inside another, across ${blocks} style block(s) in ${files.length} file(s)`);
process.exit(fails || !redproof ? 1 : 0);
