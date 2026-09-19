#!/usr/bin/env node
/* HOW CLOSE THE SAME SOUND MAY PLAY TO ITSELF IS DECIDED IN ONE PLACE — and since 2026-09-19 that
   is two halves of one place, deliberately: the RULE is a cue's own `gapMs` in src/shared/sounds.js,
   and the CLOCK that enforces it is `spacedOk` in src/ui/audio.js, reached only through `playCue`.
   A rule is design and belongs with the sound; a clock is runtime and belongs with the graph.
   Wyatt, 2026-09-16, on build .5: "there's a new glitch during the bakeoff where the crates are never swapped around, they're just static
   and then they come down multiple times. this is a REGRESSION." The bake-off kept its own clock for the shuffle's swish (5e2654de), and
   declared it BELOW the `await runSwaps()` that used it — the shuffle threw before its first crate moved, and every watcher rebuilt its
   bench, dropped the lids again and threw again. The coin tick kept a second copy of the same clock in audio.js. Now both go through
   the one door, and nothing outside audio.js keeps a clock for a sound.
     1. audio.js holds exactly one spacing clock (spacedOk), playCue is its only caller, and every
        cue that declares a gapMs is therefore spaced by it — no cue can opt out or keep its own
     2. no file outside audio.js reads performance.now() within three lines of calling a play...() sound
     3. the bake-off's shuffle plays its swish through the door, with no local sound clock (the
        declared-after-use shape that crashed) */
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
  const table = code(files["src/shared/sounds.js"] || "");
  /* Both ends alive: the clock exists and is reached ONLY from playCue, and the table really does
     declare gaps. Either half missing would make this rule vacuous. */
  const spacedCallers = (audio.match(/spacedOk\(/g) || []).length;         // the definition + playCue's one call
  const gaps = (table.match(/gapMs:/g) || []).length;
  rule(/function spacedOk\(/.test(audio) && /if \(c\.gapMs != null && !spacedOk\(/.test(audio) && spacedCallers === 2 && gaps >= 3,
    `audio.js holds the one sound-spacing clock (spacedOk) and playCue is its only caller; ${gaps} cue(s) in sounds.js declare a gap and every one of them is spaced by it`,
    spacedCallers !== 2 ? `spacedOk has ${spacedCallers - 1} caller(s) besides its own definition — a second one is a second clock`
      : gaps < 3 ? `only ${gaps} cue(s) declare a gapMs — the rule above would pass on nothing`
      : "playCue no longer routes a cue's gapMs through the one clock, so a spaced sound can stack again");
  const clocks = [];
  for (const [f, s] of Object.entries(files)) {
    if (f === "src/ui/audio.js") continue;
    const lines = code(s).split("\n");
    lines.forEach((l, i) => { if (/performance\.now\(\)/.test(l) && lines.slice(Math.max(0, i - 3), i + 4).some(x => /\bplay[A-Z]\w*\(/.test(x))) clocks.push(`${f}:${i + 1}`); });
  }
  rule(clocks.length === 0, "no file outside audio.js keeps a clock beside a sound", `a sound clock is kept outside audio.js at ${clocks.join(", ")}`);
  const swaps = body(code(files["src/ui/bakeoff.js"] || ""), "async function runSwaps(");
  rule(/playCue\("bakeoff\.cratesSwap"\)/.test(swaps) && !/lastSwish|SWISH_GAP_MS|\bswish\(\)/.test(code(files["src/ui/bakeoff.js"] || "")),
    "the bake-off's shuffle plays its swish through audio.js, with no local clock to be declared too late",
    "the bake-off's shuffle keeps its own swish clock again — the shape that threw before the first crate moved");
  return out;
}
run(rules, [
  ["the bake-off's own swish clock put back", "src/ui/bakeoff.js", "  async function runSwaps(){", "  const SWISH_GAP_MS=110; let lastSwish=-1e9;\n  const swish=()=>{const n=performance.now();if(n-lastSwish<SWISH_GAP_MS)return;lastSwish=n;playCue(\"bakeoff.cratesSwap\");};\n  async function runSwaps(){", 2],
  ["a second caller of the one clock — the shape that makes it two clocks", "src/ui/audio.js", "function playCue(cue, opts) {", "function playTickNow() { if (spacedOk(\"abacus-click\", 35)) play(\"abacus-click\"); }\nfunction playCue(cue, opts) {", 0],
  ["playCue stops honouring a cue's gap, so a spaced sound can stack again", "src/ui/audio.js", "  if (c.gapMs != null && !spacedOk(c.stem, c.gapMs)) return;", "", 0],
  ["a clock beside a sound in another file", "src/ui/board.js", '  playCue("purse.coinOut"); // the ONE place', '  const _t=performance.now();\n  playCue("purse.coinOut"); // the ONE place', 1],
], "a sound's spacing is declared with the cue and enforced by one clock");
