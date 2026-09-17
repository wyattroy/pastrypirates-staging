#!/usr/bin/env node
/* THE MOST COIN A COUNTER-OFFER MAY ASK FOR — DECIDED IN ONE PLACE, Game.counterRoom.
   Architecture item 20, 2026-09-17 (Wyatt's ruling on "architectural", DECISIONS.md 2026-09-16: name the fact, count every place
   that decides it, make the count one, gate it).
   BEFORE, four places decided it and disagreed (tree c10fc71f):
     src/engine/index.js:1341  respondToOffer — a bot answering refused as "toodear" above purse − coin offered, the ask ON TOP
     src/ui/flow.js:2146       counterOffer — a person countering dragged up to the asker's WHOLE purse, which the engine then ADDED
                               to the offer, so a drag to the end was always refused (measured on a phone: purse 40 offering 1,
                               "ye're ASKIN' 40" → "No captain will part with Hot Cinnamon for that.")
     src/ui/flow.js:2962       humanAnswersHail — the Counter button and "no coin left to sweeten the deal" used purse − offered,
                               while the Coin button a tap later was live on the whole purse
     src/engine/index.js:1760  canTakeAnswer — judged the counter's full terms against the purse
   HIS RULING — the number dragged is coin IN ALL (2e9e06b1, 2026-08-14, countering Dough Hook's 8🌕 with the slider stuck at 6):
   "i cannot ask for all that he has — i should be able to slide the slider up to 8, no?"
   RULES (red-proofed below, in memory — never on disk):
     1. the ceiling is defined once: Game.counterRoom, which reads counterTerms (the one place that knows what a counter's two shapes
        hand over), so the room and the settlement cannot mean different things
     2. no other place works the ceiling out: no `coins-offer.giveCoins` / `coins-(offer.giveCoins` spelling anywhere in src/ but the
        planner's one named line (the purse left after paying an offer — what a trade is worth to a bot, not what a counter may ask),
        and neither screen that counters reads a purse at all
     3. canTakeAnswer reads counterRoom, and respondToOffer's "toodear" asks canTakeAnswer — the bot answering and the asker taking
        read one rule, so they cannot disagree
     4. every screen reads it: the Counter button, the "no coin left to sweeten the deal" line and the Coin button all ask
        counterRoom(asker,offer,null); the slider's range is the room; the number dragged comes home as coin ON TOP of room.base
     5. behavioural, the real screen functions compiled from flow.js onto the real engine: purse 5 offering 3 — the slider runs 4..5
        and the largest total (5) settles; his path, purse 40 offering 1 — 2..40, and 40 settles; a crate counter still runs 0..purse
     6. behavioural: whole purse offered — the Coin button is greyed with the new reason (counter.allOffered), and for every purse and
        offer the offer screen's "no coin left" line shows exactly when the Coin button is greyed
     7. behavioural, the bot: for every purse, offer and price, a bot's coin counter is refused as "toodear" exactly when the asker
        could not take it, and every counter it does make settles
     8. behavioural: the new reason renders — a name on the countering captain's screen, never a hand-typed "ye" */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { stripComments } from "./lib/strip_comments.mjs";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const rd = f => fs.readFileSync(path.join(REPO, f), "utf8");
const walk = d => fs.readdirSync(path.join(REPO, d), { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(d, e.name)) : e.name.endsWith(".js") ? [path.join(d, e.name)] : []);
const engineMod = await import(pathToFileURL(path.join(REPO, "src/engine/index.js")).href);
const { WORDS, fill, seat } = await import(pathToFileURL(path.join(REPO, "src/shared/words.js")).href);

function body(src, head) {
  const h = src.indexOf(head); if (h < 0) return "";
  let j = src.indexOf("(", h), d = 0;
  for (; j < src.length; j++) { if (src[j] === "(") d++; else if (src[j] === ")") { d--; if (!d) break; } }
  j = src.indexOf("{", j); d = 0;
  for (; j < src.length; j++) { if (src[j] === "{") d++; else if (src[j] === "}") { d--; if (!d) break; } }
  return src.slice(h, j + 1);
}
const count = (s, re) => (s.match(re) || []).length;
const HEADS = {
  room: "  counterRoom(asker,offer,askIng){",
  take: "  canTakeAnswer(p,offer,r){",
  respond: "  respondToOffer(q,offer,asker){",
  counter: "async function counterOffer(q,player,offer){",
  answers: "async function humanAnswersHail(q,asker,offer){",
  slider: "async function coinSlider(seat,msgFor,start,min,max,confirmLabel,extraOpt,declineLabel,base){",
  log: "function logQuantity(n){",
};
// the one line that subtracts an offer from a purse for another reason: the planner valuing a hail (the purse left once it is paid)
const PLANNER_LINE = /coins:p\.coins-\(offer\.giveCoins\|\|0\)\},ctx\)/g;
const LEFTOVER = /\.coins\s*-\s*\(?\s*[\w$]*\.?giveCoins/g;

function textRules(files) {
  const out = [], rule = (ok, pass, fail) => out.push({ ok, text: ok ? pass : fail });
  const code = Object.fromEntries(Object.entries(files).map(([f, s]) => [f, stripComments(s)]));
  const eng = code["src/engine/index.js"], flow = code["src/ui/flow.js"];
  const room = body(eng, HEADS.room), take = body(eng, HEADS.take), respond = body(eng, HEADS.respond);
  const counter = body(flow, HEADS.counter), answers = body(flow, HEADS.answers), slider = body(flow, HEADS.slider);

  // 1. defined once, from counterTerms
  const defs = Object.values(code).reduce((n, s) => n + count(s, /\bcounterRoom\s*\([^)]*\)\s*\{|\bcounterRoom\s*[:=]/g), 0);
  rule(defs === 1 && !!room && /this\.counterTerms\(offer,/.test(room) && /asker\.coins/.test(room),
    "the ceiling is defined once — Game.counterRoom — and it reads counterTerms, the one place that knows what a counter hands over",
    `counterRoom is defined ${defs} time(s), or it does not derive the counter's terms from counterTerms`);

  // 2. nobody else works it out
  const leftovers = Object.entries(code).map(([f, s]) => [f, count(s, LEFTOVER) - (f === "src/engine/index.js" ? count(s, PLANNER_LINE) : 0)]).filter(([, n]) => n);
  const planner = count(eng, PLANNER_LINE);
  rule(leftovers.length === 0 && planner === 1 && !!counter && !!answers && !/\.coins\b/.test(counter) && !/\.coins\b/.test(answers),
    "no other place works the ceiling out: no purse-minus-offer outside the planner's one named line, and neither countering screen reads a purse",
    `the ceiling is worked out somewhere else — purse minus offer: ${leftovers.map(([f, n]) => `${f} x${n}`).join(", ") || "none"}; planner line found ${planner}x; counterOffer reads a purse: ${/\.coins\b/.test(counter)}; humanAnswersHail reads a purse: ${/\.coins\b/.test(answers)}`);

  // 3. the bot answering and the asker taking read one rule
  rule(/this\.counterRoom\(p,offer,r\.askIng\)/.test(take) && !/\.coins\b/.test(take)
       && /this\.canTakeAnswer\(asker,offer,/.test(respond) && /"toodear"/.test(respond) && !/\.coins\b/.test(respond),
    "canTakeAnswer reads counterRoom, and respondToOffer refuses as \"toodear\" only by asking canTakeAnswer — neither reads a purse of its own",
    "canTakeAnswer or respondToOffer decides the ceiling with its own purse arithmetic instead of counterRoom");

  // 4. every screen reads it
  const coinOpt = (counter.match(/value:"__coinsonly__",[^}]*\}/) || [""])[0];
  const counterOpt = (answers.match(/value:"counter",[^}]*\}/) || [""])[0];
  rule(/const coinRoom=g\.counterRoom\(player,offer,null\)/.test(counter) && /disabled:!coinRoom\b/.test(coinOpt) && /"counter\.allOffered"/.test(coinOpt)
       && /g\.counterRoom\(player,offer,askIng\)/.test(counter) && /coinSlider\([\s\S]*room\.min,room\.min,room\.max,[^;]*,room\.base\)/.test(counter)
       && /const coinRoom=appState\.game\.counterRoom\(asker,offer,null\)/.test(answers) && /disabled:!coinRoom&&/.test(counterOpt)
       && /!coinRoom\?say\("trade\.noSweetener"/.test(answers)
       && count(slider, /logQuantity\(/g) === 2 && /logQuantity\(min-base\)/.test(slider) && /logQuantity\(Math\.max\(min,Math\.min\(max,ref\.value\)\)-base\)/.test(slider),
    "every screen reads it: the Counter button, the \"no coin left\" line and the Coin button ask counterRoom(…,offer,null); the slider runs the room; the dragged total comes home as coin on top of room.base",
    "a countering screen decides the ceiling some other way — the Coin button, the Counter button, the hint or the slider range does not read counterRoom, or the dragged total is handed on without taking room.base off");
  return out;
}

/* The real screen functions, compiled from flow.js text, with ask() answered by a script: Counter, then Coin, then drag to the end. */
function compileScreens(flowSrc) {
  const src = stripComments(flowSrc);
  const parts = [HEADS.log, HEADS.slider, HEADS.counter, HEADS.answers].map(h => body(src, h));
  if (parts.some(p => !p)) throw new Error("a screen function could not be found in flow.js");
  return new Function("appState", "ask", "say", "sayText", "pn", "poss", "seat", "ilabelImg", "iconImg", "crateOpt", "CHECKMARK_IMG", "CANCEL_X_IMG", "endReplay", "netHandlers",
    `${parts.join("\n")}\nreturn {humanAnswersHail,counterOffer,coinSlider};`);
}
async function screenCounter(flowSrc, G, purse, offered, opts = {}) {
  const { Game, roundCfg } = G;
  const g = new Game(roundCfg(["human", "balanced", "balanced", "balanced"]), 7919, true);
  const [q, p] = g.players;
  const W = g.ings[0], X = g.ings[1];
  for (const c of g.players) { c.ing = []; c.done = false; }
  q.ing = [W]; q.coins = 0; p.ing = opts.crate ? [X] : [X]; p.coins = purse;
  const offer = { want: W, giveIng: null, giveCoins: offered };
  const appState = { game: g, turnExpired: false, replaying: false, dlog: [], dlogIdx: 0, dlogN: 0 };
  const seen = { prompts: [] }, logged = [];
  const ask = async (s, msg, options, colors, sub, extra) => {
    const pr = { msg, sub, options: options.map(o => ({ value: o.value, disabled: !!o.disabled, why: o.why || null })), slider: extra && extra.slider ? { min: extra.slider.min, max: extra.slider.max } : null };
    seen.prompts.push(pr);
    if (seen.prompts.length > 40) throw new Error(`the counter screen never settled on an answer (${seen.prompts.length} prompts; last "${msg}")`);
    if (extra && extra.slider) { extra.slider.ref.value = extra.slider.max; return "ok"; }
    const vals = options.map(o => o.value);
    if (vals.includes("counter")) { seen.offerPrompt = pr; return "counter"; }
    if (vals.includes("__coinsonly__")) {
      seen.counterPrompt = pr;
      if (opts.crate) return X;
      const coin = pr.options.find(o => o.value === "__coinsonly__");
      return opts.look || coin.disabled ? "__deny__" : "__coinsonly__";   // `look`: read the buttons, then deny
    }
    return null;
  };
  const say = k => `«${k}»`;
  const F = compileScreens(flowSrc)(appState, ask, say, say, i => `P${i}`, i => `P${i}'s`, seat, i => `[${i}]`, i => "", (ings, i) => ({ label: i, value: i }), "", "",
    () => {}, () => ({ onLogDecision: n => logged.push(n) }));
  const r = await F.humanAnswersHail(q, p, offer);
  seen.response = r;
  if (r && r.kind === "counter") {
    seen.takeable = g.canTakeAnswer(p, offer, r);
    const before = { p: p.coins, q: q.coins };
    seen.resolved = g.resolveHail(p, offer, [r], r);
    const tr = g.events.filter(e => e.t === "trade").pop();
    seen.paid = tr ? tr.paid : null;
    seen.moved = { p: before.p - p.coins, q: q.coins - before.q };
  }
  seen.slider = (seen.prompts.find(x => x.slider) || {}).slider || null;
  seen.logged = logged;
  return seen;
}

async function behaviourRules(files, G) {
  const out = [], rule = (ok, pass, fail) => out.push({ ok, text: ok ? pass : fail });
  const flow = files["src/ui/flow.js"];
  const got = {};
  try {
    // 5. the largest total settles
    for (const [name, purse, offered] of [["spec", 5, 3], ["his", 40, 1]]) {
      const s = await screenCounter(flow, G, purse, offered);
      got[name] = { slider: s.slider, askFor: s.response && s.response.askFor, logged: s.logged, takeable: s.takeable, struck: s.resolved && s.resolved.struck, paid: s.paid, moved: s.moved };
      got[name].ok = !!s.slider && s.slider.min === offered + 1 && s.slider.max === purse && s.response.askFor === purse - offered
        && s.logged.length === 1 && s.logged[0] === purse - offered
        && s.takeable === true && s.resolved.struck === true && s.paid === purse && s.moved.p === purse && s.moved.q === purse;
    }
    { const s = await screenCounter(flow, G, 6, 2, { crate: true });
      got.crate = { slider: s.slider, response: s.response && { askIng: s.response.askIng, askFor: s.response.askFor }, struck: s.resolved && s.resolved.struck, paid: s.paid };
      got.crate.ok = !!s.slider && s.slider.min === 0 && s.slider.max === 6 && s.response.askFor === 6 && s.resolved.struck === true && s.paid === 6; }
    // 6. whole purse offered, and the hint and the Coin button agree everywhere
    { const s = await screenCounter(flow, G, 3, 3, { look: true });
      const coin = s.counterPrompt && s.counterPrompt.options.find(o => o.value === "__coinsonly__");
      const counterBtn = s.offerPrompt && s.offerPrompt.options.find(o => o.value === "counter");
      got.allOffered = { hint: s.offerPrompt && s.offerPrompt.sub, counterLive: counterBtn && !counterBtn.disabled, coin, slider: s.slider, response: s.response && s.response.kind };
      got.allOffered.ok = s.offerPrompt.sub === "«trade.noSweetener»" && counterBtn && !counterBtn.disabled && !!coin && coin.disabled && coin.why === "«counter.allOffered»" && !s.slider; }
    const disagree = [];
    for (let purse = 0; purse <= 6; purse++) for (let offered = 0; offered <= purse; offered++) {
      const s = await screenCounter(flow, G, purse, offered, { look: true });
      const hint = s.offerPrompt && s.offerPrompt.sub === "«trade.noSweetener»";
      const coin = s.counterPrompt && s.counterPrompt.options.find(o => o.value === "__coinsonly__");
      if (!coin || hint !== coin.disabled) disagree.push(`purse ${purse} offering ${offered}: hint ${hint}, Coin greyed ${coin && coin.disabled}`);
      if (coin && coin.disabled && coin.why !== (offered ? "«counter.allOffered»" : "«counter.noCoin»")) disagree.push(`purse ${purse} offering ${offered}: reason ${coin.why}`);
    }
    got.agree = disagree;
  } catch (e) { got.threw = String(e && e.stack || e); }
  rule(got.spec && got.spec.ok && got.his && got.his.ok && got.crate && got.crate.ok && !got.threw,
    "the real counter screen on the real engine: purse 5 offering 3 drags 4..5 and 5 in all settles; his path, purse 40 offering 1, drags 2..40 and 40 in all settles; a crate counter still drags 0..purse",
    `the counter screen's largest total does not settle: ${JSON.stringify({ spec: got.spec, his: got.his, crate: got.crate, threw: got.threw })}`);
  rule(got.allOffered && got.allOffered.ok && got.agree && got.agree.length === 0 && !got.threw,
    "whole purse offered: \"no coin left to sweeten the deal\" shows and the Coin button is greyed with counter.allOffered — and for every purse 0..6 and offer the line shows exactly when the Coin button is greyed",
    `the offer screen's line and the Coin button disagree: ${JSON.stringify({ allOffered: got.allOffered, agree: got.agree, threw: got.threw })}`);

  // 7. the bot's refusal and the asker's test are one rule
  const botBad = [];
  try {
    const { Game, roundCfg } = G;
    for (let purse = 0; purse <= 8; purse++) for (let offered = 0; offered <= purse; offered++) for (let price = 1; price <= 10; price++) {
      const g = new Game(roundCfg(["balanced", "balanced", "balanced", "balanced"]), 424242, true);
      const [p, q] = g.players;
      for (const c of g.players) { c.ing = []; c.done = false; }
      const W = g.ings[0]; q.ing = [W]; p.ing = []; p.coins = purse;
      const offer = { want: W, giveIng: null, giveCoins: offered };
      const per = G.PLAN.coinsPerDockTurn;
      g.offerValueTurns = () => 0; g.visibleProgress = () => 0;
      g.crateCostTurns = () => (price - 0.5) / per;          // a shortfall that prices to exactly `price` coins on top
      const r = g.respondToOffer(q, offer, p);
      const could = purse >= offered + price;
      if (r.kind === "counter") {
        if (r.askFor !== price) { botBad.push(`purse ${purse} offer ${offered}: priced ${r.askFor}, posed ${price}`); continue; }
        if (!could || !g.canTakeAnswer(p, offer, r) || !g.resolveHail(p, offer, [r], r).struck) botBad.push(`purse ${purse} offer ${offered} +${price}: countered but the asker could not take it`);
      } else if (!(r.kind === "deny" && r.why === "toodear" && !could)) botBad.push(`purse ${purse} offer ${offered} +${price}: ${r.kind}/${r.why} though the asker could pay ${offered + price}`);
    }
  } catch (e) { botBad.push("threw " + String(e && e.message || e)); }
  rule(botBad.length === 0,
    "a bot answering: for every purse 0..8, offer and price 1..10, a coin counter is refused as \"toodear\" exactly when the asker could not take it, and every counter it makes settles",
    `the bot's refusal and the asker's test disagree: ${botBad.slice(0, 6).join(" | ")} (${botBad.length})`);

  // 8. the new reason renders, with the captain derived
  const t = WORDS["counter.allOffered"] || "";
  const look = viewer => ({ me: i => i === viewer, name: i => `<b>Captain${i}</b>`, poss: i => `<b>Captain${i}'s</b>` });
  const other = fill(t, { p: seat(1) }, look(0)), own = fill(t, { p: seat(1) }, look(1));
  rule(!!t && /Captain1/.test(other) && !/\{/.test(other + own) && !/\b(undefined|null|NaN)\b/.test(other + own) && !/\bye\b/i.test(t.replace(/\{[^}]*\}/g, "")),
    `the new reason renders with the captain's name on the countering captain's screen, and its "ye" is derived, never typed: "${other.replace(/<[^>]*>/g, "")}"`,
    `counter.allOffered is missing, does not render, or hand-types "ye": "${other}" / "${own}"`);
  return out;
}

const files = Object.fromEntries(walk("src").filter(f => /[\\/](ui|net|state|shared)[\\/]|orchestrator\.js$|engine[\\/]index\.js$/.test(f)).map(f => [f.split(path.sep).join("/"), rd(f)]));
const run = async (fs_, G) => [...textRules(fs_), ...await behaviourRules(fs_, G)];
const real = await run(files, engineMod);
for (const r of real) console.log(`  ${r.ok ? "PASS" : "FAIL"}  ${r.text}`);

/* ---------- RED-PROOF: each rule must go red on a copy broken the way it guards against ---------- */
const broken = (file, from, to) => { if (!files[file].includes(from)) return null; return { ...files, [file]: files[file].replace(from, to) }; };
const mutantGame = patch => { class M extends engineMod.Game {} patch(M.prototype); return { ...engineMod, Game: M }; };
const MUTANTS = [
  ["the old whole-purse slider put back: coin ON TOP from 1 (or 0) to the asker's whole purse",
    broken("src/ui/flow.js", "room.min,room.min,room.max,say(\"counter.go\",{}),null,null,room.base)", "askIng?0:1,askIng?0:1,Math.max(0,player.coins),say(\"counter.go\",{}))"), [1, 3, 4]],
  ["the screen handing the engine the TOTAL instead of total − offered",
    broken("src/ui/flow.js", "const n=logQuantity(Math.max(min,Math.min(max,ref.value))-base);", "const n=logQuantity(Math.max(min,Math.min(max,ref.value)));base=0;"), [3, 4]],
  ["the hint and the Coin button reading different rules: the Coin button live on the whole purse again",
    broken("src/ui/flow.js", "value:\"__coinsonly__\",disabled:!coinRoom,", "value:\"__coinsonly__\",disabled:player.coins<1,"), [3, 5]],
  ["the offer screen's line working out the leftover itself: `asker.coins-offer.giveCoins<1`",
    broken("src/ui/flow.js", "!coinRoom?say(\"trade.noSweetener\"", "asker.coins-offer.giveCoins<1?say(\"trade.noSweetener\""), [1, 3]],
  ["respondToOffer's own \"toodear\" back: `askFor>asker.coins-(offer.giveCoins||0)`",
    broken("src/engine/index.js", "if(asker&&!this.canTakeAnswer(asker,offer,counter))", "if(asker&&askFor>asker.coins-(offer.giveCoins||0))"), [1, 2]],
  ["canTakeAnswer with its own purse arithmetic back",
    broken("src/engine/index.js", "const room=this.counterRoom(p,offer,r.askIng)", "const room=(this.counterTerms(offer,r).giveCoins||0)<=p.coins?{min:0,max:p.coins}:null"), [2]],
  ["a second copy of the ceiling in the screen: `const counterRoom=(a,o)=>…`",
    broken("src/ui/flow.js", "async function counterOffer(q,player,offer){", "const counterRoom=(a,o)=>({base:o.giveCoins,min:o.giveCoins+1,max:a.coins});\nasync function counterOffer(q,player,offer){"), [0]],
  ["the engine's room letting the total run past the purse (the whole purse ON TOP)", files, [4],
    mutantGame(P => { const orig = P.counterRoom; P.counterRoom = function (a, o, i) { const r = orig.call(this, a, o, i); return r && i == null ? { ...r, max: a.coins + r.base } : r; }; })],
  ["the engine's room never greying a coins-only counter (the old live Coin button)", files, [5],
    mutantGame(P => { const orig = P.counterRoom; P.counterRoom = function (a, o, i) { return orig.call(this, a, o, i) || (i == null ? { base: o.giveCoins || 0, min: 1, max: a.coins } : null); }; })],
  ["the new reason with a hand-typed \"ye\"", files, [7], null, { "counter.allOffered": "Ye've no coin left beyond the offer — it must be an ingredient." }],
];
let proofOk = true;
for (const [what, mutant, idxs, G, words] of MUTANTS) {
  let red = false;
  if (mutant) {
    const saved = { ...WORDS };
    if (words) Object.assign(WORDS, words);
    try { const res = await run(mutant, G || engineMod); red = idxs.every(i => !!res[i] && !res[i].ok); }
    finally { if (words) { for (const k of Object.keys(words)) delete WORDS[k]; Object.assign(WORDS, saved); } }
  }
  if (!red) proofOk = false;
  console.log(`  ${red ? "PASS" : "FAIL"}  red-proof: ${what} ${red ? `goes red (rule${idxs.length > 1 ? "s" : ""} ${idxs.map(i => i + 1).join(", ")})` : mutant ? "STAYS GREEN — the gate cannot see it" : "could not be built (the source moved)"}`);
}
const fails = real.filter(r => !r.ok).length;
console.log(fails || !proofOk ? `\nFAIL — ${fails} rule(s) broken${proofOk ? "" : ", and the red-proof did not hold"}` : `\nPASS — the most coin a counter may ask for is Game.counterRoom's answer; ${real.length} rules, ${MUTANTS.length} mutants, each red`);
process.exit(fails || !proofOk ? 1 : 0);
