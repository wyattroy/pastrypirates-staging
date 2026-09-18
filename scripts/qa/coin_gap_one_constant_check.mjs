#!/usr/bin/env node
/* coin_gap_one_constant_check.mjs — COINS ARRIVE AT THE PURSE A CONSTANT TIME APART, WHATEVER THE HAUL.
 *
 * HIS WORDS, 2026-09-18: "'the stagger between coins is derived from how many are arriving' is not how I want it designed -- I want
 * all coins to arrive at the purse after a consistent time from each other. Eg 500ms." And, told what it would cost: "Try 300ms then
 * -- even with a 12 coin haul (rare) it's over in under 4s."
 *
 * WHY IT EXISTS. The gap WAS derived: `coinGap(n) = n>1 ? Math.min(TREASURE_GAP_MS, TREASURE_STAGGER_MS/(n-1)) : 0`, with the stagger
 * capped at 1600ms — so the more coins a captain earned, the FASTER each one arrived. Measured on a real board at animation-frame rate
 * (the purse's own number ticking up, sampled every frame): two coins landed 283ms apart and twelve landed 145ms apart, and every big
 * payday was squeezed into the same ~1.6s. Bots and humans earn different-sized hauls, so that also made a bot's coins and a person's
 * LOOK like they flew at different speeds when the only difference was the size of the haul.
 *
 * THE FIVE RULES, and the mutant that turns each one red (a case that cannot fail is not a case):
 *   1. one name, one number — the gap is a plain constant, and neither the old derivation nor its stagger survives anywhere in src/
 *   2. the SAME expression spaces every flight that puts coins into a purse — no second knob, even one set to the same value today
 *   3. (behavioural) the interval between coins is identical for a haul of 1, 2, 7, 12, 17 and 20 — the drawn schedule is computed
 *      from the source's own delay expression and its own constants, and every consecutive difference must equal the gap
 *   4. (behavioural) the schedule does not depend on WHO earned them or WHERE they came from — same answer for any seat, any source
 *   5. the wait each flight holds the turn for matches the coins it actually drew, off the same constant
 *
 * Every rule is a pure function of the source text, so the SAME functions run against deliberately broken copies below (RED-PROOF).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const rd = f => fs.readFileSync(path.join(REPO, f), "utf8");
const walk = d => fs.readdirSync(path.join(REPO, d), { withFileTypes: true })
  .flatMap(e => e.isDirectory() ? walk(path.join(d, e.name)) : e.name.endsWith(".js") ? [path.join(d, e.name)] : []);

/* A function's body: skip the whole parameter list first (a default like `{from="boat"}={}` has braces of its own). */
function body(src, head) {
  const h = src.indexOf(head); if (h < 0) return "";
  let j = src.indexOf("(", h), d = 0;
  for (; j < src.length; j++) { if (src[j] === "(") d++; else if (src[j] === ")") { d--; if (!d) break; } }
  j = src.indexOf("{", j); d = 0;
  for (; j < src.length; j++) { if (src[j] === "{") d++; else if (src[j] === "}") { d--; if (!d) break; } }
  return src.slice(h, j + 1);
}
const code = s => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`\\])\/\/[^\n]*/g, "$1");   // comments never count as code

/* THE COIN-ARRIVAL FLIGHTS ARE FOUND, NOT LISTED. Anything in the board that animates a picture and calls `land(` — the pay-in door's
   "this coin is in" — is a flight that puts coins into a purse, including one added tomorrow. A coin LEAVING calls `leave(` and is a
   different fact with its own spacing (SPEND_GAP_MS), so it is not swept up here. */
function arrivalFlights(board) {
  const out = [];
  for (const m of board.matchAll(/(?:export\s+)?(?:async\s+)?function\s+([A-Za-z0-9_$]+)\s*\(/g)) {
    const name = m[1], b = body(board, m[0]);
    if (/\.animate\(/.test(b) && /\bland\(/.test(b)) out.push({ name, body: b });
  }
  return out;
}
/* The delay of the k-th coin, and the wait the flight holds, straight out of the source. */
const delayOf = b => (b.match(/\.animate\([\s\S]*?\{[^{}]*?delay:([^,}]+)[,}]/) || [])[1];
const waitOf = b => (b.match(/const\s+flight\s*=\s*([^;]+);/) || [])[1];
/* Every `const NAME = <number>` in the board, so an expression can be evaluated with the file's own numbers in scope. */
function numbers(board) {
  const env = {};
  for (const m of board.matchAll(/\bconst\s+([A-Za-z0-9_$]+\s*=\s*[-\d.]+(?:\s*,\s*[A-Za-z0-9_$]+\s*=\s*[-\d.]+)*)\s*;/g))
    for (const part of m[1].split(",")) { const [k, v] = part.split("="); env[k.trim()] = parseFloat(v); }
  return env;
}
/* Evaluate an expression from the source with the board's own constants plus the flight's own locals. A throw is an answer:
   it means the delay reads something this gate cannot see, which is exactly the thing it is here to refuse. */
function evalExpr(expr, env, locals) {
  const names = [...Object.keys(env), ...Object.keys(locals)];
  const vals = [...Object.values(env), ...Object.values(locals)];
  return new Function(...names, `"use strict";return (${expr});`)(...vals);
}
const schedule = (expr, env, n, extra = {}) =>
  Array.from({ length: n }, (_, k) => evalExpr(expr, env, { k, n, seat: 0, coins: n, from: "boat", to: 1, size: 20, ...extra }));
const diffs = a => a.slice(1).map((v, i) => +(v - a[i]).toFixed(6));

const HAULS = [1, 2, 7, 12, 17, 20];      // a single coin, his two-coin case, and the big hauls the game really grants

function rules(files) {
  const board = code(files["src/ui/board.js"]);
  const others = Object.entries(files).filter(([f]) => f !== "src/ui/board.js").map(([f, s]) => [f, code(s)]);
  const out = [];
  const rule = (ok, pass, fail) => out.push({ ok, text: ok ? pass : fail });
  const env = numbers(board);
  const G = env.TREASURE_GAP_MS;
  const flights = arrivalFlights(board);

  // 1. ONE NAME, ONE NUMBER — and the derivation is gone, not merely unused
  const declared = (board.match(/\bTREASURE_GAP_MS\s*=\s*[-\d.]+/g) || []).length;
  const derivation = Object.entries(files).filter(([, s]) => /\bcoinGap\b|\bTREASURE_STAGGER_MS\b/.test(code(s))).map(([f]) => f);
  rule(Number.isFinite(G) && declared === 1 && derivation.length === 0,
    `the gap between arriving coins is ONE constant, ${G}ms, and nothing derives it from the size of the haul`,
    derivation.length ? `the old derivation is back in ${derivation.join(", ")} — a bigger haul makes each coin arrive quicker`
      : `TREASURE_GAP_MS is declared ${declared} time(s) as a plain number (read ${G})`);

  // 2. ONE EXPRESSION SPACES EVERY FLIGHT INTO A PURSE — no second knob, not even one set to the same value today
  const exprs = flights.map(f => ({ name: f.name, d: (delayOf(f.body) || "").trim() }));
  const same = exprs.length >= 2 && exprs.every(e => e.d && e.d === exprs[0].d) && /\bTREASURE_GAP_MS\b/.test(exprs[0].d);
  rule(same,
    `every flight that puts coins into a purse (${exprs.map(e => e.name).join(", ")}) spaces them by the same expression, off that one constant: ${exprs[0] ? exprs[0].d : "—"}`,
    exprs.length < 2 ? `only ${exprs.length} coin-arrival flight found — this gate has lost sight of the thing it guards`
      : `the flights space their coins differently: ${exprs.map(e => `${e.name} -> ${e.d || "no delay"}`).join(" · ")} — a second knob for one fact`);

  // 3. THE INTERVAL IS THE SAME WHATEVER THE HAUL — his ruling, computed from the source's own numbers
  let r3 = { ok: true, why: "" };
  for (const f of flights) {
    const d = delayOf(f.body);
    if (!d) { r3 = { ok: false, why: `${f.name} draws coins with no delay at all` }; break; }
    for (const n of HAULS) {
      let s; try { s = schedule(d, env, n); } catch (e) { r3 = { ok: false, why: `${f.name}'s delay cannot be worked out from the board's own constants (${e.message})` }; break; }
      const bad = diffs(s).find(v => Math.abs(v - G) > 1e-6);
      if (bad !== undefined) { r3 = { ok: false, why: `${f.name} puts a haul of ${n} coins ${bad}ms apart, not ${G}ms — the gap still depends on how many are arriving` }; break; }
    }
    if (!r3.ok) break;
  }
  rule(r3.ok,
    `a haul of ${HAULS.join(", ")} coins all arrive exactly ${G}ms apart — two coins are spaced like twelve`,
    r3.why);

  // 4. …AND IT DOES NOT DEPEND ON WHO EARNED THEM OR WHERE THEY CAME FROM (bots and humans, identical affordances)
  let r4 = { ok: true, why: "" };
  const WHO = [{ seat: 0, from: "boat" }, { seat: 1, from: "boat" }, { seat: 3, from: 2 }];
  for (const f of flights) {
    const d = delayOf(f.body); if (!d) continue;
    for (const n of HAULS) {
      let base = null;
      for (const w of WHO) {
        let s; try { s = schedule(d, env, n, w); } catch (e) { r4 = { ok: false, why: `${f.name}'s delay cannot be worked out (${e.message})` }; break; }
        if (base === null) base = JSON.stringify(s);
        else if (JSON.stringify(s) !== base) { r4 = { ok: false, why: `${f.name} spaces seat ${w.seat}'s coins differently from seat 0's (haul of ${n}) — a coin that flies by who earned it` }; break; }
      }
      if (!r4.ok) break;
    }
    if (!r4.ok) break;
  }
  rule(r4.ok,
    "the spacing is the same for every captain and every source — a bot's coin and a person's fly on the same clock",
    r4.why);

  // 5. THE WAIT MATCHES THE COINS DRAWN — off the same constant, or the turn moves on before the last coin lands
  let r5 = { ok: true, why: "" };
  for (const f of flights) {
    const w = waitOf(f.body), d = (f.body.match(/\.animate\([\s\S]*?\{[^{}]*?duration:([^,}]+)[,}]/) || [])[1];
    if (!w || !d) { r5 = { ok: false, why: `${f.name} has no stated wait for its own coins` }; break; }
    for (const n of HAULS) {
      let got, want;
      try { got = evalExpr(w, env, { n, k: n - 1, seat: 0, coins: n }); want = evalExpr(d.trim(), env, { n, k: 0, seat: 0, coins: n }) + (n - 1) * G; }
      catch (e) { r5 = { ok: false, why: `${f.name}'s wait cannot be worked out (${e.message})` }; break; }
      if (Math.abs(got - want) > 1e-6) { r5 = { ok: false, why: `${f.name} waits ${got}ms for ${n} coins that take ${want}ms to arrive` }; break; }
    }
    if (!r5.ok) break;
  }
  rule(r5.ok,
    "each flight waits exactly as long as the coins it drew, off the same constant — the turn never moves on over a coin still in the air",
    r5.why);

  return out;
}

const files = Object.fromEntries(walk("src").map(f => [f.split(path.sep).join("/"), rd(f)]));
const real = rules(files);
for (const r of real) console.log(`  ${r.ok ? "PASS" : "FAIL"}  ${r.text}`);

/* RED-PROOF: each rule must go red on a copy broken the way it guards against. */
const broken = (file, from, to) => { const f = { ...files }; if (!f[file].includes(from)) return null; f[file] = f[file].replace(from, to); return f; };
const B = "src/ui/board.js";
const MUTANTS = [
  ["the old derivation put back (the cap on the stagger)",
    broken(B, "const TREASURE_MS=630,", "const TREASURE_STAGGER_MS=1600;\nconst coinGap=n=>n>1?Math.min(TREASURE_GAP_MS,TREASURE_STAGGER_MS/(n-1)):0;\nconst TREASURE_MS=630,"), 0],
  ["a SECOND KNOB for the crossing flight, set to the same value today",
    broken(B, "      {duration:ACROSS_MS,delay:k*TREASURE_GAP_MS,", "      {duration:ACROSS_MS,delay:k*ACROSS_GAP_MS,")
      && (() => { const f = broken(B, "      {duration:ACROSS_MS,delay:k*TREASURE_GAP_MS,", "      {duration:ACROSS_MS,delay:k*ACROSS_GAP_MS,");
                  f[B] = f[B].replace("const ACROSS_MS=900;", "const ACROSS_MS=900;\nconst ACROSS_GAP_MS=300;"); return f; })(), 1],
  ["the haul's size back in the spacing, inside the delay itself",
    broken(B, "{duration:TREASURE_MS,delay:k*TREASURE_GAP_MS,", "{duration:TREASURE_MS,delay:k*Math.min(TREASURE_GAP_MS,1600/Math.max(1,n-1)),"), 2],
  ["a coin that flies by WHO earned it",
    broken(B, "{duration:TREASURE_MS,delay:k*TREASURE_GAP_MS,", "{duration:TREASURE_MS,delay:k*(seat===0?TREASURE_GAP_MS:120),"), 3],
  ["a flight that stops waiting for the coins it drew",
    broken(B, "const flight=TREASURE_MS+(n-1)*TREASURE_GAP_MS;", "const flight=TREASURE_MS+(n-1)*150;"), 4],
];
let proofOk = true;
for (const [what, mutant, idx] of MUTANTS) {
  let res = null;
  try { res = mutant ? rules(mutant) : null; } catch { res = null; }
  const red = !!res && res[idx] && !res[idx].ok;      // the rule that guards against THIS break, not merely any rule
  if (!red) proofOk = false;
  console.log(`  ${red ? "PASS" : "FAIL"}  red-proof: ${what} ${red ? "goes red" : mutant ? "STAYS GREEN — the gate cannot see it" : "could not be built (the source moved)"}`);
}
const fails = real.filter(r => !r.ok).length;
console.log(fails || !proofOk ? `\nFAIL — ${fails} rule(s) broken${proofOk ? "" : ", and the red-proof did not hold"}`
  : `\nPASS — coins arrive a constant time apart whatever the haul; ${real.length} rules, each red-proofed`);
process.exit(fails || !proofOk ? 1 : 0);
