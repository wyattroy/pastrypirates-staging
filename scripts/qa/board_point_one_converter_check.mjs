#!/usr/bin/env node
/* WHERE A BOARD POINT SITS ON THE PAGE IS DECIDED IN ONE PLACE: board.js fixedPointOfBoard.
   Wyatt, 2026-09-16, on build .5: "during battles, the coins are off to the side, misaligned with the boats. debug and fix." A fight's
   flip coin wrote its own board-to-page arithmetic (aa08a1ad) and left out fixedOrigin(), the page's own offset — measured, posed at
   1440x900: the fight coin 15px right of and 45px below its boat, where the dock coin sat on it; after, (443,501) on a boat at (443,500.5).
   And "the tiny coin that is flipped by bot captains is really pixellated -- why?": it was a 16px coin in the camera layer, stretched by
   the zoom. Every small coin is now drawn on the page at the camera's size (dockcoin.js coinSpot), placed by the one converter.
     1. matrixTransform( appears once in src/, inside fixedPointOfBoard, which subtracts fixedOrigin()
     2. dockcoin.js asks fixedPointOfBoard and reads no screen matrix of its own
     3. the small coin is sized, not scaled: appended to the page, never to the camera layer, with its size set from the zoom */
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
  const board = code(files["src/ui/board.js"] || ""), dc = code(files["src/ui/dockcoin.js"] || "");
  const sites = Object.entries(files).flatMap(([f, s]) => (code(s).match(/matrixTransform\(/g) || []).map(() => f));
  const conv = body(board, "export function fixedPointOfBoard(");
  rule(sites.length === 1 && /matrixTransform\(/.test(conv) && /fixedOrigin\(\)/.test(conv),
    "a board point is turned into a page point in exactly one place, which takes off the page's own offset",
    `matrixTransform( appears ${sites.length} time(s) (${sites.join(", ")})${/fixedOrigin\(\)/.test(conv) ? "" : ", and the converter does not subtract fixedOrigin()"}`);
  rule(/fixedPointOfBoard\(/.test(dc) && !/getScreenCTM|matrixTransform/.test(dc),
    "the flip coin asks the one converter and keeps no screen matrix of its own",
    "dockcoin.js reads a screen matrix of its own — the copy that put a fight's coin beside its boat");
  const flip = body(dc, "export async function flipDockCoin(");
  rule(/document\.body\.appendChild\(el\)/.test(flip) && !/dockCoinHost|pp4Fx/.test(flip) && /DC_SIZE_PX\s*\*\s*zoom/.test(dc),
    "the small coin is drawn on the page at the camera's size, never in a camera-scaled layer",
    "the small coin is appended to a camera-scaled layer again, or drawn without the zoom — painted small and stretched");
  return out;
}
run(rules, [
  ["the fight coin's own screen-matrix copy put back", "src/ui/dockcoin.js", "  const top = fixedPointOfBoard(ships, pt[0], pt[1] - cell / 2)", "  const _m = ships.getScreenCTM(); const top = fixedPointOfBoard(ships, pt[0], pt[1] - cell / 2)", 1],
  ["the converter forgetting the page's offset", "src/ui/board.js", "  const p=pt.matrixTransform(ctm),o=fixedOrigin();", "  const p=pt.matrixTransform(ctm),o={x:0,y:0};", 0],
  ["the coin drawn in the camera layer again", "src/ui/dockcoin.js", "  document.body.appendChild(el);", '  $("dockCoinHost").appendChild(el);', 2],
], "a board point reaches the page through one converter, and the small coin is sized, not scaled");
