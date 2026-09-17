#!/usr/bin/env node
/* HOW CLOSE THE SAME SOUND MAY PLAY TO ITSELF IS DECIDED IN ONE PLACE: audio.js playSpaced.
   Wyatt, 2026-09-16, on build .5: "there's a new glitch during the bakeoff where the crates are never swapped around, they're just static
   and then they come down multiple times. this is a REGRESSION." The bake-off kept its own clock for the shuffle's swish (5e2654de), and
   declared it BELOW the `await runSwaps()` that used it — the shuffle threw before its first crate moved, and every watcher rebuilt its
   bench, dropped the lids again and threw again. The coin tick kept a second copy of the same clock in audio.js. Now both go through
   playSpaced, and nothing outside audio.js keeps a clock for a sound.
     1. playSpaced exists in audio.js and both spaced sounds (the coin tick and the card swish) go through it
     2. no file outside audio.js reads performance.now() within three lines of calling a play...() sound
     3. the bake-off's shuffle calls playCardSwish() directly, with no local sound clock (the declared-after-use shape that crashed) */
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
  const audio = code(files["src/ui/audio.js"] || "");
  rule(/function playSpaced\(/.test(audio) && /function playCoinTick\(\)\s*\{\s*playSpaced\(/.test(audio) && /function playCardSwish\(\)\s*\{\s*playSpaced\(/.test(audio),
    "audio.js holds the one sound-spacing clock (playSpaced), and the coin tick and the card swish both go through it",
    "a spaced sound in audio.js keeps its own clock instead of playSpaced");
  const clocks = [];
  for (const [f, s] of Object.entries(files)) {
    if (f === "src/ui/audio.js") continue;
    const lines = code(s).split("\n");
    lines.forEach((l, i) => { if (/performance\.now\(\)/.test(l) && lines.slice(Math.max(0, i - 3), i + 4).some(x => /\bplay[A-Z]\w*\(/.test(x))) clocks.push(`${f}:${i + 1}`); });
  }
  rule(clocks.length === 0, "no file outside audio.js keeps a clock beside a sound", `a sound clock is kept outside audio.js at ${clocks.join(", ")}`);
  const swaps = body(code(files["src/ui/bakeoff.js"] || ""), "async function runSwaps(");
  rule(/playCardSwish\(\)/.test(swaps) && !/lastSwish|SWISH_GAP_MS|\bswish\(\)/.test(code(files["src/ui/bakeoff.js"] || "")),
    "the bake-off's shuffle plays its swish through audio.js, with no local clock to be declared too late",
    "the bake-off's shuffle keeps its own swish clock again — the shape that threw before the first crate moved");
  return out;
}
run(rules, [
  ["the bake-off's own swish clock put back", "src/ui/bakeoff.js", "  async function runSwaps(){", "  const SWISH_GAP_MS=110; let lastSwish=-1e9;\n  const swish=()=>{const n=performance.now();if(n-lastSwish<SWISH_GAP_MS)return;lastSwish=n;playCardSwish();};\n  async function runSwaps(){", 1],
  ["the coin tick keeping its own clock again", "src/ui/audio.js", 'function playCoinTick() { playSpaced("abacus-click", TICK_GAP_MS); }', 'let lastTickAt=-1e9;\nfunction playCoinTick() { const now=performance.now(); if(now-lastTickAt<TICK_GAP_MS)return; lastTickAt=now; play("abacus-click"); }', 0],
  ["a clock beside a sound in another file", "src/ui/board.js", "  playCoinTick();           // the ONE place", "  const _t=performance.now();\n  playCoinTick();           // the ONE place", 1],
], "a sound's spacing is decided only in audio.js");
