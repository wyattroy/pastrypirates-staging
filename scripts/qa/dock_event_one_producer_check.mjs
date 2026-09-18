#!/usr/bin/env node
/* A DOCK EVENT HAS ONE PRODUCER — architecture item 49, 2026-09-18.
   (Wyatt's ruling on "architectural", DECISIONS.md 2026-09-16: name the fact, count every place that decides it, make the
   count ONE, gate it red-proofed.)

   THE FACT: what a dock turn did — the flip, the price the crate was offered at, what was paid for it, and what was left
   on the shelf — said in the event every screen reads.

   THIS IS THE ONE ITEM ON THE CLEANUP LIST WITH A DATED FAILURE BEHIND IT RATHER THAN A PREDICTION. Until today the line
   was written in two places, kept in step by hand:
     src/engine/index.js  a bot's dock        src/ui/flow.js  a person's dock
   On 2026-09-17 the engine's line gained `paid` (so the spending door could stop reading `price`, which flew coins out of
   the purse of a captain who had bought nothing — Wyatt: "when i passed on buying a crate at a dock, 3 coins dropped out
   of my purse"). The human berth's copy was not changed. So a PERSON's purchase emitted `paid=undefined`, `spent` fell to
   0, `payOut` was never called, and his coins stopped being drawn leaving his purse — the opposite of the reported fault,
   on the commonest action in the game. It reached staging. Measured on a phone, his own seat, same gesture, one run each
   build: before, purse 5→6→7→8→5, one silent step of 3, with ZERO coins seen leaving; after, 3→4→5→6→5→4→3, a coin at a
   time, 13 samples in flight. Nothing downstream could tell `undefined` from `0`, which is why every other gate was green:
   the one event consumer was right all along, and ONE CONSUMER IS NOT ONE PATH (docs/HARD-WON-LESSONS.md §2).

   The splint was a rule holding the two emitters identical. The repair is having one of them, and that is what this gate
   holds: there is nothing left to drift from.

   RULES (each red-proofed below, in memory — never on disk):
     1. exactly one place in src/ builds a dock event, and it is the engine's Game.dockDone
     2. the human berth hands the engine what the CAPTAIN decided and nothing else: humanDock calls g.dockDone and decides
        no word of the line itself — not what the flip turned up, not what was paid, not what was left on the shelf
     3. both berths capture the crate's price BEFORE the purchase and hand that number over unchanged — buying takes the
        crate off the shelf and the price climbs as the island empties (v2 rule 11), so a price re-read at the line would
        be the price of the next crate, not the one just bought
     4. behavioural, on the real engine: the real human berth (compiled out of flow.js text) and the engine's own berth
        write the SAME event for the same decision, and it carries the shipped field set — `paid` is what left the purse
        (the price on a coin buy, 0 on a barter, 0 on a refusal), `left` says what was passed up only when nothing was
        bought, and a barter's `price` is 0 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { stripComments } from "./lib/strip_comments.mjs";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const rd = f => fs.readFileSync(path.join(REPO, f), "utf8");
const walk = d => fs.readdirSync(path.join(REPO, d), { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(d, e.name)) : e.name.endsWith(".js") ? [path.join(d, e.name)] : []);
const engineMod = await import(pathToFileURL(path.join(REPO, "src/engine/index.js")).href);

/* A function's body: skip the whole parameter list first (a default like `{from="boat"}={}` has braces of its own). */
function body(src, head) {
  const h = src.indexOf(head); if (h < 0) return "";
  let j = src.indexOf("(", h), d = 0;
  for (; j < src.length; j++) { if (src[j] === "(") d++; else if (src[j] === ")") { d--; if (!d) break; } }
  j = src.indexOf("{", j); d = 0;
  for (; j < src.length; j++) { if (src[j] === "{") d++; else if (src[j] === "}") { d--; if (!d) break; } }
  return src.slice(h, j + 1);
}
const HEAD_DO = "  doDock(p,port){", HEAD_DONE = "  dockDone(p,ing,heads,price,buy){", HEAD_HUMAN = "export async function humanDock(";

/* ---------------- the rules that read the source ---------------- */
function textRules(files) {
  const out = [], rule = (ok, pass, fail) => out.push({ ok, text: ok ? pass : fail });
  const code = Object.fromEntries(Object.entries(files).map(([f, s]) => [f, stripComments(s)]));
  const eng = code["src/engine/index.js"], flow = code["src/ui/flow.js"];
  const done = body(eng, HEAD_DONE), doDock = body(eng, HEAD_DO), human = body(flow, HEAD_HUMAN);

  // 1. ONE PRODUCER
  const sites = [];
  for (const [f, s] of Object.entries(code)) {
    let i = 0;
    while ((i = s.indexOf('t:"dock"', i)) >= 0) { sites.push(`${f}:${s.slice(0, i).split("\n").length}`); i += 8; }
  }
  const insideDone = !!done && (done.match(/t:"dock"/g) || []).length === 1;
  rule(sites.length === 1 && insideDone,
    `exactly one place in src/ builds a dock event, and it is the engine's Game.dockDone (${sites[0] || "nowhere"})`,
    sites.length === 0 ? "nothing in src/ builds a dock event any more"
      : sites.length > 1 ? `a dock event is built in ${sites.length} places: ${sites.join(", ")} — that is the fault this item removed, and the last time it cost a player his coins on screen`
      : "the one dock event is built outside Game.dockDone — the engine's line is no longer the one that says it");

  // 2. THE HUMAN BERTH HANDS OVER A DECISION, NOT A LINE
  const handsOver = /\bg\.dockDone\(player,ing,h,price,buy\)/.test(human);
  const decides = [];
  if (/\bgot\b/.test(human)) decides.push("what the flip turned up (`got`)");
  if (/\bpaid\b/.test(human)) decides.push("what was paid (`paid`)");
  if (/dockLeft\(/.test(human)) decides.push("what was left on the shelf (`dockLeft`)");
  if (/\.ev\(\{/.test(human)) decides.push("an event of its own (`ev({…})`)");
  rule(!!human && handsOver && decides.length === 0,
    "the human berth hands the engine what the captain decided — the flip, the price offered, the purchase or refusal — and lets the engine's own line say it",
    !human ? "humanDock is not in flow.js any more"
      : !handsOver ? "humanDock does not hand its dock to Game.dockDone(player,ing,h,price,buy)"
      : `humanDock still decides ${decides.join(", ")} — a second berth writing the line is how a person's purchase lost its "paid" on 2026-09-17`);

  // 3. THE PRICE IS THE ONE THE CRATE WAS OFFERED AT
  const capturedBefore = b => {
    const price = b.indexOf("cratePrice("), buy = Math.min(...["buyCrate(", "barterCrate("].map(s => { const i = b.indexOf(s); return i < 0 ? Infinity : i; }));
    return price >= 0 && price < buy;
  };
  const handed = [[doDock, /this\.dockDone\(p,ing,h,price,buy\)/], [human, /\bg\.dockDone\(player,ing,h,price,buy\)/]];
  const bare = handed.every(([b, re]) => re.test(b));
  rule(!!doDock && !!human && capturedBefore(doDock) && capturedBefore(human) && bare && !/cratePrice\(/.test(done),
    "both berths read the crate's price BEFORE they buy and hand that very number over — the price climbs as the island empties, so the line says what the captain was actually offered",
    !bare ? "a berth hands Game.dockDone something other than the price it captured"
      : /cratePrice\(/.test(done) ? "Game.dockDone reads the price itself — after a purchase that is the price of the NEXT crate, not the one just bought"
      : "a berth reads the crate's price after it has already bought");
  return out;
}

/* ---------------- the real human berth, compiled out of flow.js text ---------------- */
function compileHumanDock(flowSrc) {
  const b = body(stripComments(flowSrc), HEAD_HUMAN).replace(/^export\s+/, "");
  if (!b) throw new Error("humanDock could not be found in flow.js");
  return new Function("appState", "ask", "say", "sayText", "iconImg", "ilabelImg", "ING_IMG", "dockPlace", "dockFlavorIcon",
    "humanFlip", "liveRender", "eventDrawn", "pickBarterCrates", "pilotMsg", "pilotSee", "narrateLastEvent",
    `${b}\nreturn {humanDock};`);
}
const BERTH = (g, p) => { const port = g.ings[0]; p.pos = [...g.dockOf[port]]; for (const q of g.players) if (q !== p && q.pos[0] === p.pos[0] && q.pos[1] === p.pos[1]) q.pos = [0, 0]; return port; };
const shape = e => JSON.stringify(e, (k, v) => (k === "state" || k === "tokens" || k === "round" || k === "wind" || k === "wind2" || k === "storm") ? undefined : v);

/* The same posed berth every time, so the bot's dock and the person's dock differ in nothing but who chose. */
function poseGame(G, c) {
  const g = new G.Game(G.roundCfg(["human", "balanced", "balanced", "balanced"]), 7919, true);
  const p = g.players[0], port = BERTH(g, p);
  p.coins = c.coins; p.recipe = [port, g.ings.find(i => i !== port)];
  p.ing = (c.hold || []).map(h => h === "self" ? port : g.ings.filter(i => i !== port)[h]);
  g.tokens[port] = c.tokens;
  return { g, p, port, price: g.cratePrice(port) };
}

async function behaviourRules(files, G) {
  const out = [], rule = (ok, pass, fail) => out.push({ ok, text: ok ? pass : fail });
  /* coins, crates left on the island, what is already in the hold, the flip, and the tap — then what the line MUST say.
     Every expected number is derived from the posed board (the price the island is asking today), never typed. */
  const CASES = [
    ["buys with coin, on treasure", { coins: 8, tokens: 3, hold: [], heads: true, answer: "coin" },
      (c, price) => ({ got: "bought", price, paid: price, black: 0, wentDry: 0, firstDry: 0 })],
    ["buys the last crate, working the docks", { coins: 8, tokens: 1, hold: [], heads: false, answer: "coin" },
      (c, price) => ({ got: "bought", price, paid: price, black: 0, wentDry: 1, firstDry: 1 })],
    ["taps Nah, holding none", { coins: 8, tokens: 3, hold: [], heads: false, answer: false },
      (c, price) => ({ got: "dockhand", price, paid: 0, left: "passed", black: 0, wentDry: 0, firstDry: 0 })],
    ["taps Nah, already carryin' one", { coins: 8, tokens: 3, hold: ["self"], heads: true, answer: false },
      (c, price) => ({ got: "treasure", price, paid: 0, left: "holds", black: 0, wentDry: 0, firstDry: 0 })],
    ["barters two crates at a bare shelf", { coins: 0, tokens: 0, hold: [0, 1], heads: false, answer: "barter" },
      (c, price) => ({ got: "bought", price: 0, paid: 0, paidIng: 2, black: 1, wentDry: 0, firstDry: 0 })],
  ];
  const wrong = [], apart = [];
  let threw = null;
  try {
    const mk = compileHumanDock(files["src/ui/flow.js"]);
    for (const [name, c, want] of CASES) {
      // the PERSON's berth — the real humanDock, its taps answered by a script
      const H = poseGame(G, c);
      const appState = { game: H.g, turnExpired: false, replaying: false };
      const noop = () => {}, blank = () => "";
      const F = mk(appState, async () => c.answer, blank, blank, blank, blank, new Proxy({}, { get: () => "" }), blank, blank,
        async () => c.heads, noop, async () => {}, async () => H.p.ing.slice(0, 2), () => null, noop, async () => {});
      await F.humanDock(H.p, H.port);
      const person = H.g.events.filter(e => e.t === "dock");

      // the ENGINE's own berth, the same board, the same flip, the same decision
      const B = poseGame(G, c);
      const buy = c.answer === "coin" ? B.g.buyCrate(B.p, B.port)
        : c.answer === "barter" ? B.g.barterCrate(B.p, B.port, B.p.ing.slice(0, 2)) : null;
      B.g.dockDone(B.p, B.port, c.heads, B.price, buy);
      const engine = B.g.events.filter(e => e.t === "dock");

      if (person.length !== 1 || engine.length !== 1) { wrong.push(`${name}: ${person.length} event(s) from the person's berth, ${engine.length} from the engine's`); continue; }
      if (shape(person[0]) !== shape(engine[0])) apart.push(`${name}: person ${shape(person[0])} vs engine ${shape(engine[0])}`);
      const e = person[0], w = want(c, H.price);
      const said = {};
      for (const k of ["got", "price", "paid", "black", "wentDry", "firstDry"]) said[k] = e[k];
      if (w.left !== undefined) said.left = e.left; else if (e.left !== undefined) said.left = e.left;
      if (w.paidIng !== undefined) said.paidIng = Array.isArray(e.paidIng) ? e.paidIng.length : e.paidIng;
      else if (e.paidIng !== undefined) said.paidIng = e.paidIng;
      const canon = o => JSON.stringify(Object.fromEntries(Object.keys(o).sort().map(k => [k, o[k]])));
      if (canon(said) !== canon(w)) wrong.push(`${name}: said ${canon(said)}, must say ${canon(w)}`);
    }
  } catch (e) { threw = String((e && e.stack) || e); }
  rule(!threw && apart.length === 0 && wrong.length === 0,
    `the real human berth on the real engine writes the same dock event the engine's own berth does, for all ${CASES.length} decisions — buy, last crate, refusal holding none, refusal already carryin' one, barter`,
    threw ? `posing the berth threw: ${threw}` : apart.length ? `the two berths' events are not the same: ${apart[0]}` : "the berths agree with each other and are both wrong: " + wrong[0]);
  rule(!threw && wrong.length === 0,
    "and what it says is what left the purse: `paid` is the price on a coin buy, 0 on a barter and 0 on a refusal; `left` names what was passed up only when nothing was bought; a barter's `price` is 0",
    threw ? `posing the berth threw: ${threw}` : `the dock's line says the wrong thing: ${wrong.slice(0, 3).join(" | ")} (${wrong.length})`);
  return out;
}

const files = Object.fromEntries(walk("src").map(f => [f.split(path.sep).join("/"), rd(f)]));
const run = async (fs_, G) => [...textRules(fs_), ...await behaviourRules(fs_, G)];
const real = await run(files, engineMod);
for (const r of real) console.log(`  ${r.ok ? "PASS" : "FAIL"}  ${r.text}`);

/* ---------- RED-PROOF: each rule must go red on a copy broken the way it guards against ---------- */
const broken = (file, from, to) => { if (!files[file].includes(from)) return null; return { ...files, [file]: files[file].replace(from, to) }; };
const mutantGame = patch => { class M extends engineMod.Game {} patch(M.prototype); return { ...engineMod, Game: M }; };
const MUTANTS = [
  ["the human berth writing its own dock event again, beside the engine's (the 2026-09-17 shape)",
    broken("src/ui/flow.js", "  g.dockDone(player,ing,h,price,buy);",
      '  g.ev({t:"dock",p:player.idx,ing,heads:h?1:0,got:buy?"bought":(h?"treasure":"dockhand"),price,left:buy?undefined:g.dockLeft(player,ing),black:0,wentDry:0,firstDry:0});'), [0, 1]],
  ["the human berth deciding what the flip turned up, and handing the word over",
    broken("src/ui/flow.js", "  const price=g.cratePrice(ing);", "  let got=h?\"treasure\":\"dockhand\";\n  const price=g.cratePrice(ing);"), [1]],
  ["the engine's line reading the price itself, after the crate has left the shelf",
    broken("src/engine/index.js", "    this.dockDone(p,ing,h,price,buy);", "    this.dockDone(p,ing,h,this.cratePrice(ing),buy);"), [2]],
  ["the one line losing `paid` again — the field whose absence stopped a person's coins being drawn leaving", files, [4],
    mutantGame(P => { const orig = P.dockDone; P.dockDone = function (p, ing, heads, price, buy) { orig.call(this, p, ing, heads, price, buy); const e = this.events[this.events.length - 1]; delete e.paid; }; })],
  ["the line calling the price a spend again, so a captain who bought nothing watches coins leave", files, [4],
    mutantGame(P => { const orig = P.dockDone; P.dockDone = function (p, ing, heads, price, buy) { orig.call(this, p, ing, heads, price, buy); const e = this.events[this.events.length - 1]; e.paid = price; }; })],
  ["a barter charging coins as well as crates", files, [4],
    mutantGame(P => { const orig = P.dockDone; P.dockDone = function (p, ing, heads, price, buy) { orig.call(this, p, ing, heads, price, buy); const e = this.events[this.events.length - 1]; if (e.paidIng) { e.price = price; e.paid = price; } }; })],
  ["the person's berth handing over a price read AFTER the crate left the shelf, so the two berths tell different stories",
    broken("src/ui/flow.js", "  g.dockDone(player,ing,h,price,buy);", "  g.dockDone(player,ing,h,g.cratePrice(ing),buy);"), [2, 3]],
];
let proofOk = true;
for (const [what, mutant, idxs, G] of MUTANTS) {
  let red = false;
  if (mutant) { const res = await run(mutant, G || engineMod); red = idxs.every(i => !!res[i] && !res[i].ok); }
  if (!red) proofOk = false;
  console.log(`  ${red ? "PASS" : "FAIL"}  red-proof: ${what} ${red ? `goes red (rule${idxs.length > 1 ? "s" : ""} ${idxs.map(i => i + 1).join(", ")})` : mutant ? "STAYS GREEN — the gate cannot see it" : "could not be built (the source moved)"}`);
}
const fails = real.filter(r => !r.ok).length;
console.log(fails || !proofOk ? `\nFAIL — ${fails} rule(s) broken${proofOk ? "" : ", and the red-proof did not hold"}` : `\nPASS — a dock event has ONE producer, Game.dockDone, and both berths reach it; ${real.length} rules, ${MUTANTS.length} mutants, each red`);
process.exit(fails || !proofOk ? 1 : 0);
