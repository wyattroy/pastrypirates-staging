#!/usr/bin/env node
/* A BAKE-OFF RE-WATCH: WHAT IT COSTS, AND WHEN ITS COINS LEAVE THE BAKER'S PURSE — architecture item 17, 2026-09-18.
   (Wyatt's ruling on "architectural", DECISIONS.md 2026-09-16: name the fact, count every place that decides it, make
   the count ONE, delete the copies, gate it red-proofed.)

   THE FACT: what another look at the shuffle costs a captain, whether their purse can stand one, and when the coins are
   seen leaving it — on every screen at once.

   IT WAS DECIDED IN THREE PLACES AND PAID IN TWO, AND HERE IS WHAT THAT LOOKED LIKE. Measured 2026-09-18 in a real crew
   room, two headless phones (375x812, dsf 3, touch), one paid look each, sampling every 40ms on BOTH screens. The
   discriminator is the coin actually drawn leaving — img.ppTreasure[data-leaving="1"] (board.js coinsLeave) — never the
   number, because a real payOut and a silent correction end on the same number:

     HOST BAKES (seat 0, the captain with the engine)
       host's own screen   purse 3 -> 2 with a coin of theirs in flight 45ms after the tap (19 samples in flight)
       the other screen    the same drop, the same coin, at 86ms                            (21 samples in flight)
     GUEST BAKES (seat 1, a captain in another browser)
       guest's own screen  purse 5 -> 4 SILENTLY at the tap — 0 samples with a coin leaving
       host's screen       still 5 for 17.4 SECONDS (435 samples, nothing in flight), then 5 -> 4 with the coin at 17.5s
       and the coin that finally flew on the buyer's own screen came out of a number that had already moved

   One purchase, one gesture, two pictures, seventeen seconds apart. The guest branch of watchPrompt carried its own
   price (`prompt.cost||1`), ran its own purse down and wrote the lower number straight onto the captains row
   (`showSeatCoins`), while the host charged the whole bake in a lump when the answer came home.

   THE ONE PLACE NOW: Game.rewatchCost / Game.canRewatch decide the price and the affordability; the engine's `rewatch`
   event is the only thing that ever moves a purse for a look, drawn by the one event consumer through the one spending
   door. A captain baking in another browser reaches that engine at the tap — the bench moment they already publish
   carries `epoch`, the count of looks bought, and the host charges off it (chargeRewatches).

   RULES (each red-proofed below, in memory — never on disk):
     1. ONE PRICE. The re-watch price is BAKE_REWATCH_COST and nothing else names a number for it: not the guest branch
        (`prompt.cost||1`), not the button a captain reads ("bake.watchAgain" takes it as a placeholder).
     2. ONE AFFORDABILITY RULE. The comparison lives once, in Game.canRewatch; Game.bakeRewatch charges through it, and
        both re-watch buttons — the local captain's (flow.js bakeoffPrompt) and a remote captain's (orchestrator.js
        watchPrompt) — NAME it rather than re-typing a comparison of their own.
     3. NO TILL ON A SCREEN WITHOUT AN ENGINE. watchPrompt writes no purse: no showSeatCoins, no purse arithmetic, and
        orchestrator.js does not import the purse renderer at all.
     4. ONE PURSE DROP. The one event consumer takes a re-watch's coins out through the one spending door, from what the
        event says was PAID.
     5. ONE CHARGE, AND THE REMOTE TAP REACHES IT. Game.bakeRewatch is called from exactly three places outside the
        engine — the local tap, the remote tap's bench moment, and the replay tail — the bench listener actually calls
        the charger, and the replay tail is guarded by `appState.replaying` ALONE (with `!decisionIsLocal` beside it a
        remote captain is charged twice).
     6. BEHAVIOURAL, on the real engine: canRewatch agrees with what bakeRewatch will actually do, a look costs exactly
        rewatchCost, the event says what left the purse AND how many looks were bought (as `looks`, never as `n` —
        pushEvents stamps its own `n` on the wire copy of every event, so a rewatch line calling its count `n` reached
        every screen but the host's saying how far the feed had got: measured 2026-09-18, `n:20` and `n:28` for two looks
        of one coin each), and a captain who cannot afford one emits NO event — so no screen draws coins leaving for a
        look nobody got.
     7. BEHAVIOURAL, the remote tap: the real chargeRewatches (compiled out of orchestrator.js text) charges ONE look per
        epoch, nothing for a moment it has already paid for, nothing for a captain whose screen charges itself, and
        starts again at the next bench. */
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
const H_WATCH = "export function watchPrompt(){";
const H_BAKEOFF = "export async function bakeoffPrompt(";
const H_REWATCH = "  bakeRewatch(p,n){";
const H_CANREWATCH = "  canRewatch(p){";
const H_CHARGE = "function chargeRewatches(snap){";
const H_CONSUME = "export async function consumeEvent(e){";
const H_TURNLIVE = "async function bakeTurnLive(";

/* ---------------- the rules that read the source ---------------- */
function textRules(files) {
  const out = [], rule = (ok, pass, fail) => out.push({ ok, text: ok ? pass : fail });
  const code = Object.fromEntries(Object.entries(files).map(([f, s]) => [f, stripComments(s)]));
  const eng = code["src/engine/index.js"], orch = code["src/orchestrator.js"], flow = code["src/ui/flow.js"];
  const words = code["src/shared/words.js"], shared = code["src/shared/index.js"], bko = code["src/ui/bakeoff.js"];
  const watch = body(orch, H_WATCH), bakeoff = body(flow, H_BAKEOFF);
  const rewatch = body(eng, H_REWATCH), canRewatch = body(eng, H_CANREWATCH);

  // 1. ONE PRICE
  const priceFiles = Object.entries(code).filter(([, s]) => /BAKE_REWATCH_COST/.test(s)).map(([f]) => f).sort();
  const ALLOWED = ["src/engine/index.js", "src/shared/index.js", "src/ui/bakeoff.js"];   // charges it · defines it and prints it on the rules page · says it on the button
  // read off THIS tree's own words.js, never the live import — a gate that reads the shipped module
  // cannot see a mutant, and a red-proof that cannot fail is the thing this file exists to prevent
  const label = ((files["src/shared/words.js"] || "").match(/"bake\.watchAgain"\s*:\s*"([^"]*)"/) || ["", ""])[1];
  const typedDigit = /\d/.test(label);
  const guestPrice = /\bcost\s*=/.test(watch) || /prompt\.cost/.test(watch);
  rule(priceFiles.length === ALLOWED.length && ALLOWED.every(f => priceFiles.includes(f)) && !typedDigit && /\{n\}/.test(label) && !guestPrice,
    `what a look costs is written once (BAKE_REWATCH_COST, read by ${ALLOWED.join(", ")}), and the button a captain reads takes it as {n} rather than typing it`,
    guestPrice ? "watchPrompt carries a re-watch price of its own again (`prompt.cost||1`) — the price of a look is decided on two tiers, and only one of them would move"
      : typedDigit ? `the re-watch button types its price into the words ("${label}") — a retuned BAKE_REWATCH_COST would leave a captain reading the old number`
        : !/\{n\}/.test(label) ? `"bake.watchAgain" no longer takes the price as {n} ("${label}") — it must say the one number, not a copy of it`
          : `BAKE_REWATCH_COST is read in ${priceFiles.join(", ")} — only ${ALLOWED.join(", ")} may`);

  // 2. ONE AFFORDABILITY RULE
  const engineAsks = /this\.canRewatch\(p\)/.test(rewatch) && /p\.coins\s*>=\s*this\.rewatchCost\(p\)/.test(canRewatch);
  const localAsks = /canRewatch\(/.test(bakeoff), remoteAsks = /canRewatch\(/.test(watch);
  const ownTest = b => /coins\s*[<>]=?/.test(b) || /purse\s*[<>]=?/.test(b);
  rule(!!canRewatch && engineAsks && localAsks && remoteAsks && !ownTest(bakeoff) && !ownTest(watch),
    "whether a captain can afford another look is decided once, in Game.canRewatch — bakeRewatch charges through it and both re-watch buttons ask it",
    !canRewatch ? "Game.canRewatch is gone — the affordability test has no one place to live"
      : !engineAsks ? "Game.bakeRewatch no longer charges through canRewatch/rewatchCost — the engine's own charge and its own answer could disagree"
        : ownTest(watch) ? "watchPrompt compares a purse itself again — a captain on another device would be told a different answer from the one the engine gives"
          : ownTest(bakeoff) ? "bakeoffPrompt compares a purse itself again instead of asking Game.canRewatch"
            : "a re-watch button does not name canRewatch — it is answering from somewhere else");

  // 3. NO TILL ON A SCREEN WITHOUT AN ENGINE
  const draws = /showSeatCoins\s*\(/.test(watch), arith = /purse\s*-=|-=\s*want/.test(watch);
  const imported = /\bshowSeatCoins\b/.test(orch);
  rule(!draws && !arith && !imported,
    "a captain baking in another browser moves no money and draws no purse: watchPrompt has no till, and orchestrator.js does not reach the purse renderer at all",
    draws || arith ? "watchPrompt drops a purse of its own again — that is the copy whose number fell silently 17 seconds before any coin was drawn leaving it"
      : "orchestrator.js names showSeatCoins again — a purse is drawn by render(), from what the engine put on the event, and by nothing else");

  // 4. ONE PURSE DROP
  const consume = body(orch, H_CONSUME);
  rule(/e\.t===?"rewatch"&&e\.paid>0\)\?e\.paid/.test(consume.replace(/\s/g, "")) && /payOut\(\s*spender\s*,\s*spent\s*\)/.test(consume),
    "a re-watch's coins leave through the one spending door in the one event consumer, from what the event says was PAID",
    "the one event consumer no longer takes a re-watch's coins out through payOut, or no longer reads what was paid — the coins a captain spent would not be seen leaving");

  // 5. ONE CHARGE, AND THE REMOTE TAP REACHES IT
  /* BY THE FUNCTION EACH CALL SITS IN, never a line number: stripComments does not preserve lines
     (3329 -> 2085 in orchestrator.js), so a number computed here would name the wrong line in the file
     a reader then opens — a gate that misdirects is worse than one that says less. */
  const sites = [];
  for (const [f, s] of Object.entries(code)) {
    if (f === "src/engine/index.js") continue;
    let i = 0;
    while ((i = s.indexOf("bakeRewatch(", i)) >= 0) {
      const before = s.slice(0, i);
      const fn = [...before.matchAll(/function\s+([A-Za-z0-9_$]+)\s*\(/g)].pop();
      sites.push(`${f} (in ${(fn && fn[1]) || "?"})`);
      i += 12;
    }
  }
  const charger = body(orch, H_CHARGE);
  const wired = /chargeRewatches\(\s*v\.bake\s*\)/.test(orch);
  const tail = body(orch, H_TURNLIVE);
  const tailLine = (tail.replace(/\s/g, "").match(/if\([^;]*?\)g\.bakeRewatch\(player,dec\.w\)/) || [""])[0];
  const replayOnly = /^if\(dec\.w&&appState\.replaying\)/.test(tailLine);
  rule(sites.length === 3 && !!charger && wired && replayOnly,
    `Game.bakeRewatch is called from exactly three places outside the engine — the local tap, the remote tap's bench moment, and the replay tail (${sites.join(", ")})`,
    !charger ? "chargeRewatches is gone — a captain baking in another browser can no longer reach an engine at the tap, so their looks would go unpaid"
      : !wired ? "the bench listener does not call chargeRewatches — a remote captain's tap reaches nothing, and their purse never moves"
        : !replayOnly ? `the replay tail charges more than a replay (${tailLine || "not found"}) — with !decisionIsLocal beside appState.replaying a remote captain pays for every look twice`
          : `Game.bakeRewatch is called from ${sites.length} place(s) outside the engine: ${sites.join(", ")} — three is the whole set (local tap, remote tap, replay)`);
  return out;
}

/* ---------------- the real engine, posed ---------------- */
function poseGame(G, coins) {
  const g = new G.Game(G.roundCfg(["human", "balanced", "balanced", "balanced"]), 7919, true);
  const p = g.players[0];
  p.coins = coins;
  g.events.length = 0;
  return { g, p };
}
function engineRules(G) {
  const out = [], rule = (ok, pass, fail) => out.push({ ok, text: ok ? pass : fail });
  const wrong = [];
  let threw = null, cost = null;
  try {
    cost = poseGame(G, 5).g.rewatchCost(poseGame(G, 5).p);
    for (const coins of [0, 1, 2, 5]) {
      // (a) the answer and the charge agree
      const A = poseGame(G, coins);
      const said = A.g.canRewatch(A.p), did = A.g.bakeRewatch(A.p, 1) > 0;
      if (said !== did) wrong.push(`${coins} coins: canRewatch said ${said} and bakeRewatch ${did ? "bought" : "bought nothing"}`);
      // (b) one look costs exactly rewatchCost, and the event says what left
      if (did) {
        const ev = A.g.events.filter(e => e.t === "rewatch");
        if (ev.length !== 1) wrong.push(`${coins} coins: one look emitted ${ev.length} rewatch event(s)`);
        else if (ev[0].paid !== cost || ev[0].looks !== 1 || ev[0].n !== undefined || A.p.coins !== coins - cost)
          wrong.push(`${coins} coins: one look said looks=${ev[0].looks} n=${ev[0].n} paid=${ev[0].paid} and left ${A.p.coins} (must be looks=1, no n at all, paid=${cost}, left ${coins - cost})`);
      } else if (A.g.events.some(e => e.t === "rewatch")) {
        wrong.push(`${coins} coins: a captain who could not afford a look still emitted a rewatch event — every screen would draw coins leaving for nothing`);
      }
      // (c) as many as the purse allows, and never one more
      const B = poseGame(G, coins);
      const bought = B.g.bakeRewatch(B.p, 99), want = Math.floor(coins / cost);
      const evs = B.g.events.filter(e => e.t === "rewatch");
      if (bought !== want || B.p.coins !== coins - want * cost)
        wrong.push(`${coins} coins, 99 looks asked for: ${bought} bought and ${B.p.coins} left (must be ${want} and ${coins - want * cost})`);
      if (want > 0 && (evs.length !== 1 || evs[0].paid !== want * cost || evs[0].looks !== want || evs[0].n !== undefined))
        wrong.push(`${coins} coins, 99 looks: the line said ${JSON.stringify(evs.map(e => ({ looks: e.looks, n: e.n, paid: e.paid })))} (must be one line, looks=${want}, no n, paid=${want * cost})`);
      if (want === 0 && evs.length) wrong.push(`${coins} coins, 99 looks: a broke captain emitted ${evs.length} rewatch event(s)`);
    }
  } catch (e) { threw = String((e && e.stack) || e); }
  rule(!threw && wrong.length === 0,
    `on the real engine, a look costs exactly what Game.rewatchCost says (${cost}), canRewatch agrees with what bakeRewatch does, the line says what left the purse, and a captain who cannot afford one buys nothing and says nothing`,
    threw ? `posing the engine threw: ${threw}` : `the one place does not hold: ${wrong.slice(0, 3).join(" | ")} (${wrong.length})`);
  return out;
}

/* ---------------- the real remote tap, compiled out of orchestrator.js text ---------------- */
function compileCharger(orchSrc) {
  const src = stripComments(orchSrc);
  const led = /let\s+_rewatchPaid\s*=\s*\{[^}]*\};/.exec(src);
  const b = body(src, H_CHARGE);
  if (!led || !b) throw new Error("chargeRewatches (or its ledger) could not be found in orchestrator.js");
  return new Function("appState", "decisionIsLocal", "liveRender", `${led[0]}\n${b}\nreturn chargeRewatches;`);
}
function remoteTapRules(files, G) {
  const out = [], rule = (ok, pass, fail) => out.push({ ok, text: ok ? pass : fail });
  const wrong = [];
  let threw = null;
  try {
    const mk = compileCharger(files["src/orchestrator.js"]);
    const run = (steps, { localSeats = [] } = {}) => {
      const { g, p } = poseGame(G, 9);
      const appState = { isHost: true, replaying: false, game: g };
      const charge = mk(appState, s => localSeats.includes(s), () => {});
      for (const snap of steps) charge(snap);
      return { g, p, paid: 9 - p.coins };
    };
    const cost = poseGame(G, 5).g.rewatchCost(poseGame(G, 5).p);
    // one look per epoch, and nothing for a moment already paid for
    const a = run([{ seat: 0, epoch: 1, phase: "shuffle" }, { seat: 0, epoch: 1, phase: "pick" }, { seat: 0, epoch: 1, phase: "pick" }]);
    if (a.paid !== cost) wrong.push(`one look, then two more bench moments at the same epoch: ${a.paid} taken, must be ${cost}`);
    // three looks, one at a time, as the epochs arrive
    const b = run([{ seat: 0, epoch: 1 }, { seat: 0, epoch: 2 }, { seat: 0, epoch: 3 }]);
    if (b.paid !== 3 * cost || b.g.events.filter(e => e.t === "rewatch").length !== 3)
      wrong.push(`three looks tapped one at a time: ${b.paid} taken in ${b.g.events.filter(e => e.t === "rewatch").length} line(s), must be ${3 * cost} in 3`);
    // a bench moment that never arrived: the next one catches up rather than losing the look
    const c = run([{ seat: 0, epoch: 2 }]);
    if (c.paid !== 2 * cost) wrong.push(`a swallowed publish (epoch jumps straight to 2): ${c.paid} taken, must be ${2 * cost}`);
    // a captain whose own screen charges itself is never charged here
    const d = run([{ seat: 0, epoch: 1 }, { seat: 0, epoch: 2 }], { localSeats: [0] });
    if (d.paid !== 0) wrong.push(`a captain whose decision is local was charged ${d.paid} by the remote tap as well — that is paying twice`);
    // a bot's bench never moves its epoch, so nothing is ever charged for one
    const e = run([{ seat: 1, epoch: 0, phase: "open" }, { seat: 1, epoch: 0, phase: "shuffle" }]);
    if (e.paid !== 0) wrong.push(`a bench that bought nothing (epoch 0) still took ${e.paid}`);
    // the next bake starts again: the epoch drops back and the captain may buy again
    const f = run([{ seat: 0, epoch: 1 }, { seat: 0, phase: "reveal" }, { seat: 0, epoch: 1 }]);
    if (f.paid !== 2 * cost) wrong.push(`a look bought in each of two bakes: ${f.paid} taken, must be ${2 * cost}`);
  } catch (ex) { threw = String((ex && ex.stack) || ex); }
  rule(!threw && wrong.length === 0,
    "the real remote tap (chargeRewatches, run on the real engine) charges one look per bench epoch, nothing twice for the same one, nothing for a captain whose own screen charges itself, and starts again at the next bake",
    threw ? `compiling or running chargeRewatches threw: ${threw}` : `the remote tap does not hold: ${wrong.slice(0, 3).join(" | ")} (${wrong.length})`);
  return out;
}

const files = Object.fromEntries(walk("src").map(f => [f.split(path.sep).join("/"), rd(f)]));
const run = (fs_, G) => [...textRules(fs_), ...engineRules(G), ...remoteTapRules(fs_, G)];
const real = run(files, engineMod);
for (const r of real) console.log(`  ${r.ok ? "PASS" : "FAIL"}  ${r.text}`);

/* ---------- RED-PROOF: each rule must go red on a copy broken the way it guards against ---------- */
const broken = (file, from, to) => { if (!files[file].includes(from)) return null; return { ...files, [file]: files[file].replace(from, to) }; };
const mutantGame = patch => { class M extends engineMod.Game {} patch(M.prototype); return { ...engineMod, Game: M }; };
const MUTANTS = [
  ["the guest branch carrying a re-watch price of its own again (`prompt.cost||1`)",
    broken("src/orchestrator.js", "      const baker=()=>", "      const cost=prompt.cost||1;\n      const baker=()=>"), [0]],
  ["the button typing its price into the words again",
    broken("src/shared/words.js", '"bake.watchAgain": "Watch again {icon}{n}"', '"bake.watchAgain": "Watch again {icon}1"'), [0]],
  ["a remote captain's button answering from a purse of its own",
    broken("src/orchestrator.js", "mayWatch.canAfford=()=>appState.game.canRewatch(baker());",
      "let purse=prompt.coins||0;mayWatch.canAfford=()=>purse>=1;"), [1]],
  ["the local captain's button re-typing the comparison",
    broken("src/ui/flow.js", "onRewatch.canAfford=()=>appState.game.canRewatch(player);",
      "onRewatch.canAfford=()=>player.coins>=1;"), [1]],
  ["the guest's till put back — the closure that dropped a number with no coin behind it",
    broken("src/orchestrator.js", "      const mayWatch=(n)=>(n||0)>0&&appState.game.canRewatch(baker());",
      "      let purse=prompt.coins||0;\n      const mayWatch=(n)=>{const want=n||0;if(want<=0||purse<want)return false;purse-=want;showSeatCoins(prompt.seat,purse);return true;};"), [1, 2]],
  ["the one consumer reading a look's price instead of what was paid",
    broken("src/orchestrator.js", '(e.t==="rewatch"&&e.paid>0)?e.paid', '(e.t==="rewatch")?1'), [3]],
  ["the replay tail charging a remote captain as well, so every look is paid for twice",
    broken("src/orchestrator.js", "if(dec.w&&appState.replaying)g.bakeRewatch(player,dec.w);",
      "if(dec.w&&(appState.replaying||!decisionIsLocal(player.idx)))g.bakeRewatch(player,dec.w);"), [4]],
  ["the bench listener no longer calling the charger — a remote tap that reaches no engine",
    broken("src/orchestrator.js", "if(v&&v.bake){chargeRewatches(v.bake);applyBenchSnap(v.bake);return;}",
      "if(v&&v.bake){applyBenchSnap(v.bake);return;}"), [4]],
  ["the engine's answer and its charge disagreeing (a free look when the purse is empty)", files, [5],
    mutantGame(P => { P.canRewatch = function () { return true; }; })],
  ["the line calling its count `n` again — the name the broadcast's own serial overwrites on every screen but the host's", files, [5],
    mutantGame(P => { const o = P.bakeRewatch; P.bakeRewatch = function (p, n) { const b = o.call(this, p, n); const e = this.events[this.events.length - 1]; if (e && e.t === "rewatch") { e.n = e.looks; delete e.looks; } return b; }; })],
  ["the line understating what left the purse", files, [5],
    mutantGame(P => { const o = P.bakeRewatch; P.bakeRewatch = function (p, n) { const b = o.call(this, p, n); const e = this.events[this.events.length - 1]; if (e && e.t === "rewatch") e.paid = 1; return b; }; })],
  ["the remote tap forgetting what it has already charged, so one look is paid for on every bench moment",
    broken("src/orchestrator.js", "  const want=epoch-_rewatchPaid.n;", "  const want=epoch>0?1:0;"), [6]],
  ["the remote tap charging a captain whose own screen already charged them",
    broken("src/orchestrator.js", "  if(seat==null||decisionIsLocal(seat))return;", "  if(seat==null)return;"), [6]],
];
let proofOk = true;
for (const [what, mutant, idxs, G] of MUTANTS) {
  let red = false;
  if (mutant) { try { const res = run(mutant, G || engineMod); red = idxs.every(i => !!res[i] && !res[i].ok); } catch { red = false; } }
  if (!red) proofOk = false;
  console.log(`  ${red ? "PASS" : "FAIL"}  red-proof: ${what} ${red ? `goes red (rule${idxs.length > 1 ? "s" : ""} ${idxs.map(i => i + 1).join(", ")})` : mutant ? "STAYS GREEN — the gate cannot see it" : "could not be built (the source moved)"}`);
}
const fails = real.filter(r => !r.ok).length;
console.log(fails || !proofOk ? `\nFAIL — ${fails} rule(s) broken${proofOk ? "" : ", and the red-proof did not hold"}` : `\nPASS — a look at the shuffle has one price, one affordability rule and one purse drop; ${real.length} rules, ${MUTANTS.length} mutants, each red`);
process.exit(fails || !proofOk ? 1 : 0);
