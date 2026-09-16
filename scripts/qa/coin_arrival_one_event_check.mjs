#!/usr/bin/env node
/* ONE WAY A PURSE'S NUMBER GOES UP: A COIN ARRIVING.
   Wyatt, 2026-09-16: "every coin that reaches a purse, from any source (dock, muse, won call, trade), arrives through ONE arrival event.
   That one event takes the coin off 'on the way', adds it to the number, and plays the chink. Nothing else raises the number or plays the
   chink." And the gate he asked for, rule for rule:
     1. the chink is played in exactly one place
     2. the purse number only goes UP inside the arrival event (a replay or a freshly drawn purse may set it; a price may tick it down)
     3. every earning in the one event consumer goes through the one pay-in door; nothing flies coins directly, and no count-hold remains
   WHY IT EXISTS: before this, three call sites in the consumer each chose their own flight and their own way of holding the number back
   (orchestrator.js 1976 / 1981 / 1982 on dev, holds at board.js 2083-2118 and 2242-2243), and the muse coin's path held nothing — its
   number rose when its line began, seconds before its coin landed. A fourth way of earning would have been a fourth copy.
   Every rule is a pure function of the source text, so the SAME functions run against a deliberately broken copy below (RED-PROOF):
   a gate that cannot fail proves nothing. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const rd = f => fs.readFileSync(path.join(REPO, f), "utf8");
const walk = d => fs.readdirSync(path.join(REPO, d), { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(d, e.name)) : e.name.endsWith(".js") ? [path.join(d, e.name)] : []);

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

function rules(files) {
  const board = code(files["src/ui/board.js"]), orch = code(files["src/orchestrator.js"]);
  const others = Object.entries(files).filter(([f]) => f !== "src/ui/board.js").map(([f, s]) => [f, code(s)]);
  const out = [];
  const rule = (ok, pass, fail) => out.push({ ok, text: ok ? pass : fail });

  // 1. THE CHINK, ONCE
  const arrived = body(board, "export function coinArrived(");
  const chinkSites = (board.match(/playCoinChink\(\s*\)/g) || []).length
    + others.reduce((n, [f, s]) => n + (f.endsWith("audio.js") ? 0 : (s.match(/playCoinChink\(\s*\)/g) || []).length), 0);
  rule(chinkSites === 1 && /playCoinChink\(\s*\)/.test(arrived),
    "the chink is played in exactly one place: the arrival event (coinArrived)",
    `the chink is played in ${chinkSites} place(s)${/playCoinChink\(\s*\)/.test(arrived) ? "" : ", and not in coinArrived"} — a coin can chink without arriving`);

  // 2. THE NUMBER GOES UP ONLY IN THE ARRIVAL EVENT
  const touchers = [...board.matchAll(/(?:export\s+)?(?:async\s+)?function\s+([A-Za-z0-9_$]+)\s*\(/g)]
    .map(m => m[1]).filter(name => /\.coinN/.test(body(board, `function ${name}(`)));
  const elsewhere = others.filter(([, s]) => /coinN/.test(s)).map(([f]) => f);
  rule(elsewhere.length === 0 && touchers.length === 2 && touchers.includes("coinArrived") && touchers.includes("showSeatCoins"),
    "only two functions ever touch a purse's number: the arrival event and the purse's own drawing",
    `a purse's number is touched by ${[...touchers, ...elsewhere].join(", ") || "nothing"} — only coinArrived and showSeatCoins may`);
  const show = body(board, "export function showSeatCoins(");
  const guard = show.search(/if\s*\(\s*show\s*>\s*from\s*\)\s*return\s*;/);
  const before = guard < 0 ? show : show.slice(0, guard), after = guard < 0 ? "" : show.slice(guard);
  const setsBefore = [...before.matchAll(/n\.textContent\s*=\s*([^;]+);/g)].map(m => m[1].trim());
  const replayOrFresh = /if\s*\(\s*!Number\.isFinite\(from\)\s*\|\|\s*appState\.replaying\s*\)\s*\{\s*n\.textContent\s*=\s*show/.test(before);
  const setsAfter = [...after.matchAll(/n\.textContent\s*=\s*([^;]+);/g)].map(m => m[1].replace(/\s/g, ""));
  const downOnly = setsAfter.every(v => v === "show" || v === "target" || v === "cur-1") && !/cur\s*\+/.test(after) && /cur\s*<=\s*target/.test(after);
  rule(guard >= 0 && setsBefore.length === 1 && replayOrFresh && downOnly,
    "the purse's own drawing sets a replayed or freshly drawn number, never raises one, and only ticks down for a price",
    guard < 0 ? "showSeatCoins has no `if(show>from)return;` — it can raise the number without a coin arriving"
              : `showSeatCoins moves the number some other way (before the guard: ${JSON.stringify(setsBefore)}, after it: ${JSON.stringify(setsAfter)})`);
  const pay = body(board, "export function payInto(");
  const onWayUp = (board.match(/ON_THE_WAY\[[^\]]+\]\s*=\s*\(ON_THE_WAY\[[^\]]+\]\s*\|\|\s*0\)\s*\+/g) || []).length;
  const onWayDown = (board.match(/ON_THE_WAY\[[^\]]+\]\s*=\s*Math\.max\(\s*0\s*,\s*\(ON_THE_WAY\[[^\]]+\]\s*\|\|\s*0\)\s*-/g) || []).length;
  const onWayWrites = (board.match(/ON_THE_WAY\[[^\]]+\]\s*=/g) || []).length;
  rule(onWayUp === 1 && /ON_THE_WAY\[seat\]\s*=\s*\(ON_THE_WAY\[seat\]\|\|0\)\s*\+\s*coins/.test(pay) && onWayDown === 1 && /Math\.max\(0,\(ON_THE_WAY\[seat\]\|\|0\)-count\)/.test(arrived) && onWayWrites === 2,
    "coins go ON the way only in the pay-in door, and come OFF it only in the arrival event",
    `"on the way" is written ${onWayWrites} time(s) (up ${onWayUp}, down ${onWayDown}) — it must rise only in payInto and fall only in coinArrived`);

  // 3. EVERY EARNING THROUGH THE ONE DOOR; NOTHING FLIES DIRECTLY; NO HOLDS
  const consume = body(orch, "export async function consumeEvent(e){");
  rule(/payInto\(\s*e\.p\s*,\s*earned\s*\)/.test(consume) && /"purse"/.test(consume) && /"sidebet"/.test(consume)
       && /"pass"[\s\S]{0,80}payInto\(\s*e\.p\s*,\s*e\.coins/.test(consume) && /payInto\(\s*e\.b\s*,\s*e\.paid\s*,\s*\{\s*from\s*:\s*e\.a/.test(consume),
    "the one event consumer pays a dock's, a won call's, a muse coin's and a trade sale's coins through the pay-in door (payInto)",
    "consumeEvent pays an earning without payInto");
  const flightCalls = ["flyFromBoat", "flyAcross"].reduce((n, f) => {
    const all = (board.match(new RegExp(`\\b${f}\\(`, "g")) || []).length - 1;          // less its own definition
    const inPay = (pay.match(new RegExp(`\\b${f}\\(`, "g")) || []).length;
    return n + (all - inPay) + others.reduce((k, [, s]) => k + (s.match(new RegExp(`\\b${f}\\(`, "g")) || []).length, 0);
  }, 0);
  const exported = /export\s+(async\s+)?function\s+(flyFromBoat|flyAcross)\b/.test(board);
  rule(flightCalls === 0 && !exported,
    "nothing flies coins except through the door: the two flights are private and called only by payInto",
    `coins are flown directly ${flightCalls} time(s)${exported ? ", and a flight is exported" : ""} — a way into a purse that skips the door`);
  const legacy = Object.entries(files).filter(([, s]) => /\b(holdCoinRoll|treasureBurst|coinsAcross)\s*\(/.test(code(s))).map(([f]) => f);
  rule(legacy.length === 0,
    "no count-hold remains anywhere, and neither of the old self-timed flights (treasureBurst, coinsAcross)",
    `a count-hold or an old flight is still called in ${legacy.join(", ")}`);
  return out;
}

const files = Object.fromEntries(walk("src").map(f => [f.split(path.sep).join("/"), rd(f)]));
const real = rules(files);
for (const r of real) console.log(`  ${r.ok ? "PASS" : "FAIL"}  ${r.text}`);

/* RED-PROOF: each rule must go red on a copy broken the way it guards against. */
const broken = (file, from, to) => { const f = { ...files }; if (!f[file].includes(from)) return null; f[file] = f[file].replace(from, to); return f; };
const board = files["src/ui/board.js"], orch = files["src/orchestrator.js"];
const MUTANTS = [
  ["a second chink, played from the purse's drawing", broken("src/ui/board.js", "    playCoinTick();", "    playCoinTick();playCoinChink();"), 0],
  ["the purse's drawing allowed to raise the number", broken("src/ui/board.js", "  if(show>from)return;\n", "\n"), 2],
  ["a muse coin flown straight from the consumer", broken("src/orchestrator.js", "payInto(e.p,e.coins,{after:", "flyFromBoat(e.p,e.coins,{after:"), 4],
  ["a flight exported and called from elsewhere", broken("src/ui/board.js", "async function flyAcross(", "export async function flyAcross("), 5],
  ["\"on the way\" lowered somewhere other than the arrival event", broken("src/ui/board.js", "export function payInto(", "function leak(s){ON_THE_WAY[s]=0;}\nexport function payInto("), 3],
  ["a count-hold put back", broken("src/ui/board.js", "export function payInto(", "function holdCoinRoll(){}\nholdCoinRoll(0,1);\nexport function payInto("), 6],
];
let proofOk = true;
for (const [what, mutant, idx] of MUTANTS) {
  const res = mutant ? rules(mutant) : null;
  const red = !!res && res[idx] && !res[idx].ok;          // the rule that guards against THIS break, not merely any rule
  if (!red) proofOk = false;
  console.log(`  ${red ? "PASS" : "FAIL"}  red-proof: ${what} ${red ? "goes red" : mutant ? "STAYS GREEN — the gate cannot see it" : "could not be built (the source moved)"}`);
}
const fails = real.filter(r => !r.ok).length;
console.log(fails || !proofOk ? `\nFAIL — ${fails} rule(s) broken${proofOk ? "" : ", and the red-proof did not hold"}` : `\nPASS — a purse's number goes up only when a coin arrives; ${real.length} rules, each red-proofed`);
process.exit(fails || !proofOk ? 1 : 0);
