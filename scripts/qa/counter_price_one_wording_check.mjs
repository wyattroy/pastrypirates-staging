#!/usr/bin/env node
/* WHAT A COUNTER-OFFER IS ASKING FOR — WORDED IN ONE PLACE, AND NEVER SIGNED.
   Architecture item 20b, 2026-09-18 — WYATT'S OWN ASK, off his own playtest: "Fix this so it is intuitive -- i've also
   noticed the confusion when i play."

   THE FACT, IN THE GAME'S WORDS: what the table's answer to a hail says a captain must hand over — the crate and the coin —
   on the line and on the circle beside it.

   WHAT HE SAW. Posed and photographed on the tree before this gate (a crate offered with 3🌕 on it, countered for 9 more;
   desktop 1400x900 and iPhone-13-mini 375x812 dsf3 — .planning/architecture-cleanup-shots/item-20b-*-before.png):
     the ask LINE  read   "💰 Crustbeard wants 🥛 Fresh Milk + 12🌕"     — the whole price, correctly
     the CIRCLE    read   "Crustbeard" over "🥛+12🌕"                    — the same 12, with a + in front of it
   12 is the WHOLE price. The + was words.js's "trade.coinsShort" ("+{n}🌕"), left from the days when a counter really was
   "+k coins ON TOP of the offer"; once Game.counterTerms started returning the TOTAL, that + began telling a captain the
   price was twelve MORE than the offer in front of them. A trade prompt that misstates the price turns a deliberate choice
   into a forfeit — the same fault, one size down, as the circle that once showed a name and no terms at all (playtest 21).

   HIS WORDING FOR THE CIRCLE, answered by him himself when the question reached him (2026-09-18, item 20c) and FINAL:

       Crustbeard 12🌕

   The captain and the price, NOTHING ELSE — no verb. Item 20b worked from a relay of that ruling and drew "Crustbeard wants
   12🌕" for one commit; he struck the word out. Rules 4 and 7 below hold his wording, so putting any other word on the circle
   — "wants" included — turns this gate red rather than passing quietly.

   BEFORE, FOUR PLACES TURNED A DEAL INTO WORDS (tree 3388f500), and one of them disagreed:
     src/ui/flow.js:2199  counterOffer   `bits`      — the countering captain's slider line   ("🥛 Fresh Milk + 12🌕")
     src/ui/flow.js:2354  humanTrade     `giveBits`  — DEAD: built, never read
     src/ui/flow.js:2412  humanTrade     `bitsOf`    — the asker's answer line and its button ("🥛 Fresh Milk + 12🌕")
     src/ui/flow.js:2434  humanTrade     the circle  — a sentence typed into the drawing code   ("🥛+12🌕")
   AFTER: one `dealBits(ing,coins,icons)`. `icons` is the only difference a surface may ask for — a petal has room for the
   crate's picture, not its name — and it changes no word. The two answer circles now speak from the words table
   (trade.takesShort / trade.wantsShort) like every other line the game says.

   RULES (each a pure function of the source text and the words table, so the SAME function runs against deliberately
   broken copies — RED-PROOF at the bottom, in memory, never on disk):
     1. ONE BUILDER — `dealBits` is defined once in src/, and it is the only thing in flow.js that spells a coin amount;
        the counter slider, the answer line, the answer button and the counter circle all read it.
     2. THE SIGN IS GONE — no coin amount anywhere in words.js carries a leading + or −, and "trade.coinsShort" is spelled
        nowhere in src/.
     3. THE CIRCLES SPEAK FROM THE TABLE — every `short:` on a trade answer is a say() of a words id, never a sentence
        built in flow.js.
     4. THE PETAL IS THE CAPTAIN AND THE PRICE, NOTHING ELSE — trade.wantsShort carries the line's own {q} and its {what},
        and not one word besides: no verb, no "for", no punctuation of its own. HIS wording, not a house style.
     5. THE PETAL IS THE CAPTAIN AND THEIR ASK, TWO ROWS — everything after {q} lies inside ONE element. MEASURED, not
        reasoned: the petal is a flex COLUMN (index.html "#pp4Prompt.radial .apBtn"), so every child is its own row; a first
        cut that left the verb, the crate and the price as separate children grew the disc from 105px to 122px and put the
        circle over the narration box on a 375x812 phone.
     6. BEHAVIOURAL, the real humanTrade compiled from flow.js onto the real engine: a crate offered with 3🌕, countered for
        9 more — the line and the circle name the SAME price, 12, and neither signs it. The circle is the line with the pouch,
        the verb and the crate's NAME taken off and the crate's picture put back.
     7. BEHAVIOURAL, his wording: a coins-only offer countered the same way puts "Crustbeard 12🌕" on the circle, character
        for character.
   WHAT IT DOES NOT SEE, so a PASS is never read as more: the ENGINE's own offerLabel (src/engine/index.js) spells a deal a
   fifth time for the EVENT log ("Fresh Milk + 3 coins", coined by util.js fmtItem). It carries no misleading sign and is a
   different consumer — the voyage record, not a prompt — so it is named here and left alone. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { stripComments } from "./lib/strip_comments.mjs";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const rd = f => fs.readFileSync(path.join(REPO, f), "utf8");
const walk = d => fs.readdirSync(path.join(REPO, d), { withFileTypes: true })
  .flatMap(e => e.isDirectory() ? walk(path.join(d, e.name)) : e.name.endsWith(".js") ? [path.join(d, e.name)] : []);
const engineMod = await import(pathToFileURL(path.join(REPO, "src/engine/index.js")).href);
const wordsMod = await import(pathToFileURL(path.join(REPO, "src/shared/words.js")).href);
const { WORDS, fill, seat } = wordsMod;

const FLOW = "src/ui/flow.js";
const HEADS = {
  trade: "export async function humanTrade(player){",
  counter: "async function counterOffer(q,player,offer){",
};
/* the balanced body of a named function — head, then its parens, then its braces */
function body(src, head) {
  const h = src.indexOf(head); if (h < 0) return "";
  let j = src.indexOf("(", h), d = 0;
  for (; j < src.length; j++) { if (src[j] === "(") d++; else if (src[j] === ")") { d--; if (!d) break; } }
  j = src.indexOf("{", j); d = 0;
  for (; j < src.length; j++) { if (src[j] === "{") d++; else if (src[j] === "}") { d--; if (!d) break; } }
  return src.slice(h, j + 1);
}
/* a top-level `const NAME=…;` statement, taken whole (dealBits and counterTerms are arrows, not functions) */
function stmt(src, name) {
  const h = src.indexOf(`const ${name}=`); if (h < 0) return "";
  const end = src.indexOf(";", h); return end < 0 ? "" : src.slice(h, end + 1);
}
const count = (s, re) => (s.match(re) || []).length;
/* every coin amount a line renders, as the nobrk unit fill() holds it in — "+12🌕" is the defect, "12🌕" is right */
const amounts = html => [...html.matchAll(/<span class="nobrk">([\s\S]*?)<\/span>/g)].map(m => m[1]);
const plain = html => html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();

/* ---------------- the rules, over a set of files and a words table ---------------- */
function textRules(files, words) {
  const out = [], rule = (ok, pass, fail) => out.push({ ok, text: ok ? pass : fail });
  const code = Object.fromEntries(Object.entries(files).map(([f, s]) => [f, stripComments(s)]));
  const flow = code[FLOW] || "";
  const trade = body(flow, HEADS.trade), counter = body(flow, HEADS.counter), bits = stmt(flow, "dealBits");

  // 1. one builder, and everything that words a deal reads it
  const defs = Object.values(code).reduce((n, s) => n + count(s, /\bdealBits\s*=/g), 0);
  const coinSpellings = count(flow, /say\("coin\.amount"/g);
  const inBits = count(bits, /say\("coin\.amount"/g);
  const readers = { slider: /dealBits\(askIng,/.test(counter), line: /const bitsOf=\(t,icons\)=>dealBits\(/.test(trade) };
  rule(defs === 1 && !!bits && coinSpellings === 1 && inBits === 1 && readers.slider && readers.line
    && count(trade, /dealBits\(|bitsOf\(/g) >= 4,
    "one builder — dealBits — and it is the only thing in flow.js that spells a coin amount; the counter slider, the answer line, its button and the circle all read it",
    `a deal is worded somewhere else: dealBits defined ${defs}x, coin.amount spelled ${coinSpellings}x in flow.js (${inBits} of them inside dealBits), slider reads it: ${readers.slider}, answer line reads it: ${readers.line}`);

  /* 2. the sign is gone. NOT a sweep of the whole table: "⚔️ Attack −{n}🌕", "+{n}🌕" over a mused idea and the crow's-nest
     tally are DELTAS, and signing a delta is right. What a trade answer shows is a TOTAL, and it takes its amount from
     coin.amount through {what} — so no answer line spells one of its own, and the old "+{n}🌕" spelling is gone from src/. */
  const ANSWER_LINES = ["trade.wants", "trade.wantsInstead", "trade.wantsShort", "trade.takes", "trade.takesShort"];
  const ownAmount = ANSWER_LINES.filter(k => /\{n\}🌕|\d+🌕/.test(words[k] || ""));
  const shortLeft = Object.entries(code).filter(([, s]) => /coinsShort/.test(s)).map(([f]) => f);
  const amountLine = words["coin.amount"] || "";
  rule(ownAmount.length === 0 && shortLeft.length === 0 && /^\{n\}🌕$/.test(amountLine),
    "a trade answer's amount is coin.amount's, unsigned, reached through {what} — no answer line spells one of its own, and \"coinsShort\" is spelled nowhere in src/",
    `a signed or hand-spelled amount is back: lines spelling their own ${JSON.stringify(ownAmount)}; coin.amount="${amountLine}"${shortLeft.length ? `; coinsShort still in ${shortLeft.join(", ")}` : ""}`);

  // 3. the circles speak from the words table
  const shorts = [...trace(trade)];
  rule(shorts.length === 2 && shorts.every(s => /^say\("trade\.(takes|wants)Short"/.test(s)),
    "both answer circles are a say() of a words id — trade.takesShort and trade.wantsShort — never a sentence built in flow.js",
    `a trade answer's circle is built in the drawing code again: ${JSON.stringify(shorts)}`);

  /* 4. the petal is the captain and the price and nothing else — HIS wording, "Crustbeard 12🌕". Strip the markup and the two
     facts it is allowed to carry, and there must be nothing left over: a verb clause, a stray word or a stray mark all fail. */
  const line = words["trade.wants"] || "", petal = words["trade.wantsShort"] || "";
  const leftOver = petal.replace(/<[^>]*>/g, "").replace(/\{q\}|\{what\}/g, "").trim();
  rule(petal.includes("{q}") && petal.includes("{what}") && !/\{q:/.test(petal) && leftOver === "",
    `the circle is the captain and the price and nothing else — "${petal}"`,
    `the circle says more than the captain and the price: circle "${petal}"${leftOver ? `, with "${leftOver}" left over after {q} and {what}` : ""} (the line, which keeps its verb, reads "${line}")`);

  // 5. the captain, then their ask, in one element  (the flex-column measurement above)
  const after = petal.replace(/^\{q\}(<br>)?/, "");
  rule(petal.startsWith("{q}") && /^<([a-z]+)>[\s\S]*<\/\1>$/.test(after),
    "the circle is two rows: the captain, then everything they are askin' inside one element — so the petal's flex column cannot grow a row per word",
    `the circle's ask is not held in one element ("${petal}") — every child is its own row in a flex column, which is what grew the disc to 122px over the narration box`);
  return out;
}
/* the `short:` values in humanTrade's answer options, read as source text */
function* trace(trade) {
  for (const m of trade.matchAll(/\bshort:([\s\S]*?),(?:value|\n)/g)) yield m[1].trim();
}

/* ---------------- the real screen, compiled from flow.js onto the real engine ---------------- */
function compileTrade(flowSrc) {
  const src = stripComments(flowSrc);
  const parts = [stmt(src, "counterTerms"), stmt(src, "dealBits"), body(src, HEADS.trade).replace(/^export\s+/, "")];
  if (parts.some(p => !p)) throw new Error("humanTrade, counterTerms or dealBits could not be found in flow.js");
  return new Function("appState", "ask", "coinSlider", "crateOpt", "CHECKMARK_IMG", "HEXCOL", "hearHail",
    "iconImg", "ilabelImg", "iname", "ING_IMG", "liveRender", "narrateLastEvent", "say", "sayFlash", "sayText", "seat", "pn",
    `${parts.join("\n")}\nreturn {humanTrade};`);
}
const NAME = i => `Cap${i}`;
async function posedTrade(flowSrc, words, { crate, offered, askFor }) {
  const { Game, roundCfg } = engineMod;
  const g = new Game(roundCfg(["human", "balanced", "balanced", "balanced"]), 7919, true);
  const [me, holder] = g.players;
  const W = g.ings[0], X = g.ings[1];
  for (const c of g.players) { c.ing = []; c.done = false; c.coins = 0; }
  me.ing = [X, X]; me.coins = 30; holder.ing = [W];
  const appState = { game: g, turnExpired: false, replaying: false, dlog: [], dlogIdx: 0, dlogN: 0 };
  const look = viewer => ({ me: i => i === viewer, name: i => `<b>${NAME(i)}</b>`, poss: i => `<b>${NAME(i)}'s</b>` });
  const say = (id, facts, viewer) => {
    const t = words[id];
    if (t === undefined) throw new Error(`src/shared/words.js has no line "${id}"`);
    return fill(t, facts, look(viewer));
  };
  const sayText = (id, facts, viewer) => say(id, facts, viewer).replace(/<[^>]*>/g, "");
  const seen = { prompts: [] };
  const ask = async (s, msg, options) => {
    seen.prompts.push({ msg, options: options.map(o => ({ value: o.value, label: o.label, short: o.short == null ? null : o.short })) });
    if (seen.prompts.length > 20) throw new Error("the trade screen never settled");
    const vals = options.map(o => o.value);
    if (vals.includes(W)) return W;                       // step 0 — what do ye WANT
    if (vals.includes(X) && !crate) return "__coinsonly__";
    if (vals.includes(X)) return X;                       // step 1 — what will ye GIVE
    seen.answer = seen.prompts[seen.prompts.length - 1];  // the answer round
    return -1;                                            // walk away, so nothing settles behind the measurement
  };
  seen.crate = X;
  const coinSlider = async () => offered;                 // step 2 — the coins on the table
  const F = compileTrade(flowSrc)(appState, ask, coinSlider, (ings, i) => ({ label: i, value: i }), "check.png",
    ["#a", "#b", "#c", "#d"], async () => [{ q: holder, kind: "counter", askFor }],
    s => `<img class="narrIcon" src="${s}" alt="">`, i => `<img class="narrIcon" src="ing/${i}" alt=""> ${i}`, i => i,
    new Proxy({}, { get: (_, k) => `ing/${String(k)}` }), () => {}, async () => {}, say, async () => {}, sayText, seat,
    i => `<b>${NAME(i)}</b>`);
  await F.humanTrade(me);
  return seen;
}

async function behaviourRules(files, words) {
  const out = [], rule = (ok, pass, fail) => out.push({ ok, text: ok ? pass : fail });
  const flow = files[FLOW];
  const got = {};
  try {
    /* 6. a crate offered with 3🌕, countered for 9 more. THE CIRCLE IS THE LINE, with the crate's picture where the line
       spells its name — so take the line, drop the pouch it opens with, the VERB (his wording keeps it on the line and off
       the circle) and the crate's NAME, and what is left must be the circle, character for character. That is the whole
       convergence, asserted rather than described: a sign, a word or a number on one and not the other fails here. */
    const s = await posedTrade(flow, words, { crate: true, offered: 3, askFor: 9 });
    const opt = s.answer.options.find(o => o.short) || {};
    const petal = opt.short || "", line = opt.label || "";
    const lineAmts = amounts(line), petalAmts = amounts(petal);
    const lineAsCircle = plain(line)
      .replace(/^\S+\s/, "")                                   // the pouch the line opens with
      .replace(new RegExp(`^(${NAME(1)})\\s\\S+\\s`), "$1 ")   // the line's verb, whatever word the table gives it
      .replace(` ${s.crate}`, "");                             // the crate's NAME — the circle carries its picture instead
    got.crate = { line: plain(line), petal: plain(petal), lineAsCircle, lineAmts, petalAmts, onScreen: s.answer.msg.includes(line) };
    got.crate.ok = lineAmts.length === 1 && petalAmts.length === 1 && lineAmts[0] === "12🌕" && petalAmts[0] === "12🌕"
      && !/[+−]/.test(lineAmts[0] + petalAmts[0]) && lineAsCircle === plain(petal) && /ing\//.test(petal) && got.crate.onScreen;
    // 7. his wording, on a coins-only offer: the captain and the price, nothing else
    const c = await posedTrade(flow, words, { crate: false, offered: 3, askFor: 9 });
    const cPetal = (c.answer.options.find(o => o.short) || {}).short || "";
    got.coins = { petal: plain(cPetal), want: `${NAME(1)} 12🌕` };
    got.coins.ok = got.coins.petal === got.coins.want;
  } catch (e) { got.threw = String(e && e.stack || e); }
  rule(!!got.crate && got.crate.ok && !got.threw,
    `the real trade screen on the real engine: a crate offered with 3🌕 and countered for 9 more puts the line "${got.crate ? got.crate.line : "?"}" on screen and the same deal on its circle — "${got.crate ? got.crate.petal : "?"}" — one price, 12🌕, unsigned on both`,
    `the line and the circle no longer name one deal: ${JSON.stringify({ crate: got.crate, threw: got.threw })}`);
  rule(!!got.coins && got.coins.ok && !got.threw,
    `his wording, character for character, on a coins-only counter: "${got.coins ? got.coins.petal : "?"}"`,
    `the circle no longer reads "${got.coins ? got.coins.want : "<name> 12🌕"}": ${JSON.stringify({ coins: got.coins, threw: got.threw })}`);
  return out;
}

const files = Object.fromEntries(walk("src").map(f => [f.split(path.sep).join("/"), rd(f)]));
const run = async (fs_, words) => [...textRules(fs_, words), ...await behaviourRules(fs_, words)];
const real = await run(files, WORDS);
for (const r of real) console.log(`  ${r.ok ? "PASS" : "FAIL"}  ${r.text}`);

/* ---------- RED-PROOF: every rule must go red on a copy broken the way it guards against ---------- */
const broke = (from, to) => files[FLOW].includes(from) ? { ...files, [FLOW]: files[FLOW].replace(from, to) } : null;
const OLD_SHORT = "short:say(\"trade.wantsShort\",{q:seat(r.q.idx),what:bitsOf(t,true)||say(\"trade.nothin\",{})},player.idx),";
const MUTANTS = [
  ["the old circle back: a sentence typed into flow.js, with \"+{n}🌕\" on the end",
    broke(OLD_SHORT, "short:`${pn(r.q.idx)}<br>${t.giveIng?iconImg(ING_IMG[t.giveIng]):\"\"}${t.giveCoins?say(\"trade.coinsShort\",{n:t.giveCoins}):\"\"}`,"),
    { ...WORDS, "trade.coinsShort": "+{n}🌕" }, [1, 2, 5, 6]],
  ["a second builder beside dealBits",
    broke("const dealBits=", "const otherBits=(i,c)=>[i?ilabelImg(i):null,c?say(\"coin.amount\",{n:c}):null].filter(Boolean).join(\" + \");\nconst dealBits="),
    WORDS, [0]],
  ["the circle signing the price again: trade.wantsShort rendering \"+{n}🌕\"",
    files, { ...WORDS, "trade.wantsShort": "{q}<span>+{what}</span>" }, [5, 6]],
  ["the word he struck out put back: the circle saying \"wants\" again",
    files, { ...WORDS, "trade.wantsShort": "{q}<span>{q:wants|want} {what}</span>" }, [3, 5, 6]],
  ["the circle's ask split back into separate children (the 122px disc over the narration box)",
    files, { ...WORDS, "trade.wantsShort": "{q}<br>{what}" }, [4]],
  ["the accept circle built in the drawing code again",
    broke("short:say(\"trade.takesShort\",{icon:iconImg(CHECKMARK_IMG),q:seat(r.q.idx)},player.idx),value:i});",
      "short:`${iconImg(CHECKMARK_IMG)}<br>${pn(r.q.idx)}`,value:i});"), WORDS, [2]],
];
let proofOk = true;
for (const [what, mutant, words, idxs] of MUTANTS) {
  let red = false, why = "";
  if (mutant) {
    try { const res = await run(mutant, words); red = idxs.every(i => !!res[i] && !res[i].ok); if (!red) why = idxs.filter(i => res[i] && res[i].ok).map(i => i + 1).join(","); }
    catch (e) { why = "the gate itself threw: " + String(e && e.message || e); }
  }
  if (!red) proofOk = false;
  console.log(`  ${red ? "PASS" : "FAIL"}  red-proof: ${what} ${red ? `goes red (rule${idxs.length > 1 ? "s" : ""} ${idxs.map(i => i + 1).join(", ")})`
    : mutant ? `STAYS GREEN — the gate cannot see it${why ? ` (rule ${why} still passed)` : ""}` : "could not be built (the source moved)"}`);
}
const fails = real.filter(r => !r.ok).length;
console.log(fails || !proofOk ? `\nFAIL — ${fails} rule(s) broken${proofOk ? "" : ", and the red-proof did not hold"}`
  : `\nPASS — a counter's price is worded once, by dealBits and the words table, and never signed; ${real.length} rules, ${MUTANTS.length} mutants, each red`);
process.exit(fails || !proofOk ? 1 : 0);
