#!/usr/bin/env node
/* coin_speed_one_clock_check.mjs — A BOT'S COIN AND A PERSON'S COIN FLY ON THE SAME CLOCK.
 *
 * HIS AUDIT, 2026-09-18: "Verify that coin earning (and flying) calls one single function -- it seemed like the speed was different
 * for me vs bots. That is BAD CLAUDE if true!"
 *
 * THE ANSWER, MEASURED BEFORE THIS GATE WAS WRITTEN (headless Chrome, the purse's own number sampled every animation frame, solo and
 * a real crew room of a 1200x950 host and a 375x812 phone guest): a human captain's coin and a bot captain's coin OF THE SAME KIND AND
 * THE SAME HAUL flew within a frame of each other every time — a dock treasure of 2 coins, 625.4ms (human) against 625.9ms (bot); of
 * 12 coins, 630.0 against 629.8; a muse coin, 618.2 against 617.4. What DID differ was the size of the haul: under the old derived
 * stagger, two coins landed 283ms apart and twelve landed 145ms apart, and bots and people earn differently sized hauls. So his two
 * reports were ONE fault, and the repair is the commit before this one. This gate keeps the answer true.
 *
 * WHAT IT HOLDS, and the mutant that turns each rule red (a case that cannot fail is not a case):
 *   1. one door — nothing flies coins into a purse except payInto, and payInto is called only from the one event consumer
 *   2. the door takes no speed — its options are `from` and `after`, and nothing may hand it a duration
 *   3. neither flight can SEE who earned — no strategy, no bot test, no local seat inside the door or the flights
 *   4. one number each — every duration in a coin's flight is one of the four named constants, each declared once
 *   5. the consumer pays off the EVENT, never off the captain — no payInto call site asks who the seat belongs to
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const rd = f => fs.readFileSync(path.join(REPO, f), "utf8");
const walk = d => fs.readdirSync(path.join(REPO, d), { withFileTypes: true })
  .flatMap(e => e.isDirectory() ? walk(path.join(d, e.name)) : e.name.endsWith(".js") ? [path.join(d, e.name)] : []);

function body(src, head) {
  const h = src.indexOf(head); if (h < 0) return "";
  let j = src.indexOf("(", h), d = 0;
  for (; j < src.length; j++) { if (src[j] === "(") d++; else if (src[j] === ")") { d--; if (!d) break; } }
  j = src.indexOf("{", j); d = 0;
  for (; j < src.length; j++) { if (src[j] === "{") d++; else if (src[j] === "}") { d--; if (!d) break; } }
  return src.slice(h, j + 1);
}
const code = s => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`\\])\/\/[^\n]*/g, "$1");
/* Every argument list of `name(` in a chunk of source, balanced. */
function callArgs(src, name) {
  const out = []; const re = new RegExp(`\\b${name}\\(`, "g"); let m;
  while ((m = re.exec(src))) {
    let j = m.index + m[0].length - 1, d = 0;
    for (; j < src.length; j++) { if (src[j] === "(") d++; else if (src[j] === ")") { d--; if (!d) break; } }
    out.push(src.slice(m.index + m[0].length, j));
  }
  return out;
}
/* WHO THE CAPTAIN IS — every spelling of the question a coin's flight must never ask. */
const WHO = /\bstrategy\b|\bisBot\b|\bbotSeat\b|\bmySeat\b|\bisHost\b|\bdecisionIsLocal\b|["']human["']|players\s*\[/;
const DURATIONS = ["TREASURE_MS", "ACROSS_MS", "TREASURE_GAP_MS", "COIN_SETTLE_MS"];

/* The coin-arrival flights are FOUND, not listed: anything in the board that animates a picture and calls the pay-in door's `land(`. */
function arrivalFlights(board) {
  const out = [];
  for (const m of board.matchAll(/(?:export\s+)?(?:async\s+)?function\s+([A-Za-z0-9_$]+)\s*\(/g)) {
    const b = body(board, m[0]);
    if (/\.animate\(/.test(b) && /\bland\(/.test(b)) out.push({ name: m[1], body: b });
  }
  return out;
}

function rules(files) {
  const board = code(files["src/ui/board.js"]), orch = code(files["src/orchestrator.js"]);
  const others = Object.entries(files).filter(([f]) => f !== "src/ui/board.js" && f !== "src/orchestrator.js").map(([f, s]) => [f, code(s)]);
  const out = [];
  const rule = (ok, pass, fail) => out.push({ ok, text: ok ? pass : fail });
  const pay = body(board, "export function payInto(");
  const arrived = body(board, "export function coinArrived(");
  const consume = body(orch, "export async function consumeEvent(e){");
  const flights = arrivalFlights(board);

  // 1. ONE DOOR — nothing else flies coins in, and the door is opened only by the one event consumer
  const flownElsewhere = flights.reduce((n, f) => {
    const all = (board.match(new RegExp(`\\b${f.name}\\(`, "g")) || []).length - 1;       // less its own definition
    const inPay = (pay.match(new RegExp(`\\b${f.name}\\(`, "g")) || []).length;
    return n + (all - inPay) + others.reduce((k, [, s]) => k + (s.match(new RegExp(`\\b${f.name}\\(`, "g")) || []).length, 0)
      + (orch.match(new RegExp(`\\b${f.name}\\(`, "g")) || []).length;
  }, 0);
  const callsAll = [["src/orchestrator.js", orch], ...others].reduce((n, [, s]) => n + (s.match(/\bpayInto\(/g) || []).length, 0)
    + (board.match(/\bpayInto\(/g) || []).length - 1;                                      // less its own definition
  const callsInConsumer = (consume.match(/\bpayInto\(/g) || []).length;
  rule(flights.length >= 2 && flownElsewhere === 0 && callsAll > 0 && callsAll === callsInConsumer,
    `coins reach a purse through ONE door: ${flights.length} flights, private to payInto, opened from ${callsInConsumer} place(s) and all of them inside the one event consumer`,
    flownElsewhere > 0 ? `a coin flight is called ${flownElsewhere} time(s) outside the pay-in door — a way into a purse that skips it`
      : `payInto is called ${callsAll} time(s), ${callsInConsumer} of them in the one event consumer — an earning drawn somewhere else is an earning nothing else can keep in step`);

  // 2. THE DOOR TAKES NO SPEED — its options are `from` and `after` and nothing else
  const opts = (pay.match(/payInto\s*\(\s*seat\s*,\s*coins\s*,\s*\{([^}]*)\}/) || [])[1] || "";
  const optNames = opts.split(",").map(s => s.split("=")[0].trim()).filter(Boolean).sort();
  rule(optNames.length === 2 && optNames[0] === "after" && optNames[1] === "from",
    "the pay-in door takes only WHERE the coins come from and WHAT they wait for — never how fast they should go",
    `the pay-in door takes ${JSON.stringify(optNames)} — a caller that can hand it a speed is a second place deciding one fact`);

  // 3. NEITHER THE DOOR NOR A FLIGHT CAN SEE WHO EARNED
  const blind = [["payInto", pay], ["coinArrived", arrived], ...flights.map(f => [f.name, f.body])];
  const sighted = blind.filter(([, b]) => WHO.test(b)).map(([n]) => n);
  rule(sighted.length === 0,
    `the door and its ${flights.length} flights are blind to who earned the coins (${blind.map(b => b[0]).join(", ")} ask nothing about the captain)`,
    `${sighted.join(", ")} read who the captain is — a coin that can fly differently for a bot than for a person`);

  // 4. ONE NUMBER EACH, AND EVERY FLIGHT IS TIMED BY ONE OF THEM
  const twice = DURATIONS.filter(d => Object.values(files).reduce((n, s) => n + (code(s).match(new RegExp(`\\b${d}\\s*=[^=]`, "g")) || []).length, 0) !== 1);
  const durs = flights.flatMap(f => [...f.body.matchAll(/\.animate\([\s\S]*?\{[^{}]*?duration:([^,}]+)[,}]/g)].map(m => [f.name, m[1].trim()]));
  const strange = durs.filter(([, d]) => !DURATIONS.includes(d));
  rule(twice.length === 0 && durs.length > 0 && strange.length === 0,
    `every moment of a coin's flight is timed by one of the four named constants (${DURATIONS.join(", ")}), each declared exactly once`,
    twice.length ? `${twice.join(", ")} is declared more than once (or not at all) — two numbers for one moment`
      : strange.length ? `a flight times itself with ${strange.map(([f, d]) => `${f} -> ${d}`).join(", ")} instead of a named constant`
      : "no coin flight states how long it takes");

  // 5. THE CONSUMER PAYS OFF THE EVENT, NEVER OFF THE CAPTAIN
  const args = callArgs(consume, "payInto");
  const asks = args.filter(a => WHO.test(a));
  rule(args.length > 0 && asks.length === 0,
    `all ${args.length} earnings are paid from the event's own record — the consumer never asks whose seat it is`,
    asks.length ? `a pay-in reads who the captain is: ${asks.map(a => a.replace(/\s+/g, " ").slice(0, 70)).join(" | ")}`
      : "the one event consumer pays nothing in — this gate has lost sight of the thing it guards");

  return out;
}

const files = Object.fromEntries(walk("src").map(f => [f.split(path.sep).join("/"), rd(f)]));
const real = rules(files);
for (const r of real) console.log(`  ${r.ok ? "PASS" : "FAIL"}  ${r.text}`);

/* RED-PROOF: each rule must go red on a copy broken the way it guards against. */
const broken = (file, from, to) => { const f = { ...files }; if (!f[file].includes(from)) return null; f[file] = f[file].replace(from, to); return f; };
const B = "src/ui/board.js", O = "src/orchestrator.js";
const MUTANTS = [
  /* The 2026-09-17 shape, exactly: the HUMAN berth doing for itself what the one consumer does for
     everybody — which is how a person's coins and a bot's came to be drawn by two different pieces
     of code in the first place. */
  ["a human berth paying its own coins in, beside the door",
    broken("src/ui/flow.js", "  if(purseEv&&purseEv.t===\"purse\")await eventDrawn(purseEv);",
      "  if(purseEv&&purseEv.t===\"purse\"){payInto(purseEv.p,purseEv.coins);await eventDrawn(purseEv);}"), 0],
  ["a caller allowed to hand the door its own speed",
    broken(B, "export function payInto(seat,coins,{from=\"boat\",after=null}={}){", "export function payInto(seat,coins,{from=\"boat\",after=null,ms=TREASURE_MS}={}){"), 1],
  ["a flight that asks whether the captain is a bot",
    broken(B, "  const n=Math.max(1,Math.min(TREASURE_MAX,coins));", "  const n=Math.max(1,Math.min(TREASURE_MAX,coins));\n  const quick=appState.game.players[seat].strategy!==\"human\";"), 2],
  ["a second duration for a coin, typed at the flight",
    broken(B, "{duration:TREASURE_MS,delay:k*TREASURE_GAP_MS,", "{duration:seat===0?TREASURE_MS:400,delay:k*TREASURE_GAP_MS,"), 3],
  ["the consumer forking a pay-in on who the captain is",
    broken(O, "const earnedFlight=earned>0?payInto(e.p,earned):null;",
      "const earnedFlight=earned>0?payInto(e.p,earned,{from:appState.game.players[e.p].strategy===\"human\"?\"boat\":e.p}):null;"), 4],
];
let proofOk = true;
for (const [what, mutant, idx] of MUTANTS) {
  let res = null;
  try { res = mutant ? rules(mutant) : null; } catch { res = null; }
  const red = !!res && res[idx] && !res[idx].ok;
  if (!red) proofOk = false;
  console.log(`  ${red ? "PASS" : "FAIL"}  red-proof: ${what} ${red ? "goes red" : mutant ? "STAYS GREEN — the gate cannot see it" : "could not be built (the source moved)"}`);
}
const fails = real.filter(r => !r.ok).length;
console.log(fails || !proofOk ? `\nFAIL — ${fails} rule(s) broken${proofOk ? "" : ", and the red-proof did not hold"}`
  : `\nPASS — a bot's coin and a person's fly on the same clock; ${real.length} rules, each red-proofed`);
process.exit(fails || !proofOk ? 1 : 0);
