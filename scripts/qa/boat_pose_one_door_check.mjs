#!/usr/bin/env node
/* THE BOAT'S TWO PICTURES HAND OVER IN ONE PLACE, AND THE HAND-OVER CARRIES THE POSE.
   Wyatt, 2026-09-16, on build .5: "the bobbing before sailing is not quite right -- it sometimes jitters, so it needs to more intelligently
   lerp between whatever state the boat is in, and whatever state it should be in to sail." The bobbing copy and the SVG picture swapped
   with a cut, and the picture always started from rest — measured, a wind-up started at the top of the swell: the boat jumped 5.05px in
   one frame (the swell is 5.71px). After: no frame moves more than 0.88px.
     1. only handOver shows or hides the bobbing copy and the boat's picture
     2. handOver carries the copy's lift into the picture (an ADDED settle) and restarts the swell from rest when the copy takes over
     3. the swell eases per half, so it turns smoothly at its top */
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
  const hand = body(board, "function handOver(");
  const outside = board.replace(hand, "");
  // a copy is born hidden (bobShip); every later show or hide is a swap, and a swap belongs to handOver
  const writes = (outside.replace(/pic\.style\.visibility\s*=\s*"hidden"\s*;\s*\n\s*host\.appendChild\(pic\)/, "").match(/\b(pic|im|turnBob\.im|turnBob\.pic)\.style\.visibility\s*=/g) || []).length;
  rule(hand && writes === 0, "only handOver swaps the bobbing copy and the boat's picture", `the copy or the picture is shown or hidden ${writes} time(s) outside handOver — a cut with no pose carried`);
  rule(/liftOf\(/.test(hand) && /composite\s*:\s*"add"/.test(hand) && /currentTime\s*=\s*0/.test(hand),
    "the hand-over starts the picture where the copy was, and the copy's swell where the picture is",
    "handOver swaps without carrying the pose — the boat drops by however high the swell happened to be");
  const bob = body(board, "function bobShip(");   // not exported since architecture item 3 (bobTheTurn is the door); the rule reads the same body
  rule(/offset\s*:\s*\.5\s*,\s*easing\s*:\s*"ease-in-out"/.test(bob) && /iterations\s*:\s*Infinity\s*,\s*easing\s*:\s*"linear"/.test(bob),
    "the swell eases per half and turns smoothly at its top", "the swell eases across the whole cycle again — fastest exactly at its peak");
  return out;
}
run(rules, [
  ["the old cut put back in the bob's loop", "src/ui/board.js", "    handOver(me,show);", '    if(show!==me.showing){ me.showing=show; pic.style.visibility=show?"visible":"hidden"; im.style.visibility=show?"hidden":""; }', 0],
  ["a hand-over that forgets the lift", "src/ui/board.js", 'composite:"add",id:"bob-settle"', 'id:"bob-settle"', 1],
  ["the whole-cycle ease put back", "src/ui/board.js", '{duration:SHIP_BOB_MS,iterations:Infinity,easing:"linear",id:"turn-bob"}', '{duration:SHIP_BOB_MS,iterations:Infinity,easing:"ease-in-out",id:"turn-bob"}', 2],
], "the boat's pictures hand over in one place, carrying the pose");
