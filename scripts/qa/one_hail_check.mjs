#!/usr/bin/env node
/* ONE HAIL — WHO IS ASKED, WHICH ANSWER IS TAKEN, WHAT THE ANSWERER SEES, AND WHAT THE TABLE HEARS WHEN IT FALLS THROUGH.
   Architecture item 15, 2026-09-17. Wyatt, playing build .5: "when a captain denied my trade counter offer (in solo play, on
   his bot turn), that trade fail resolution message did not appear."
   MEASURED BEFORE THE FIX, in a real solo game at 375x812: a bot hailed, the human countered, the bot refused — and the events
   were openoffer → parley → the next captain's turn, with not one line drawn about the refusal. The `parley` event had no entry
   in the narration table (deleted as collateral by the weather-line commit 693c2b0b, 2026-08-27), so a bot's failed hail was
   silent while a human's said why through four flashes written into humanTrade. And the hail itself was decided in THREE places
   (docs/TRADE-SYSTEM.md "A deal is settled in THREE places"): the engine's tryTrade, humanTrade and botOpenTradeLive — the live
   bot's copy asking EVERY holder where the engine asked only the offer's audience, pricing a spare crate with a typed 1.1, and
   carrying a verbatim second copy of the prompt an answering captain sees.
   NOW: Game.hailAudience says who is asked, Game.resolveHail remembers (rememberHail), chooses for a bot (chooseAnswer), settles
   and records a `parley` WITH ITS REASON; flow.js asks a person through one humanAnswersHail, collects answers through one
   hearHail, and the narration table words `parley` by reason for every captain.
   RULES (each red-proofed below, against a broken copy made in memory):
     1. a hail's refusals are remembered in one place — rememberRefusal/refusedFlagWanted are called only by Game.rememberHail,
        which only resolveHail calls (and the voyage-disagreements replay, which must remember exactly as a bot did)
     2. a hail is chosen and settled in one place — settleTrade is called once, in resolveHail; a counter is priced once, in
        chooseAnswer; a `parley` is recorded once, in resolveHail, with its reason
     3. who a hail is put to is decided in one place — Game.hailAudience honours offer.audience; the engine's collectResponses and
        flow.js's hearHail both ask it; both live runners hear through hearHail and resolve through resolveHail
     4. the prompt an answering captain sees exists once — say("trade.offered" and counterOffer( only in humanAnswersHail
     5. no number typed into src/ui or src/orchestrator.js equals a PLAN value inside a trade-pricing expression
     6. the fall-through words live in the narration table — no flow.js flash of a trade outcome; EVENT_NARRATION.parley reads e.why
     7. BEHAVIOURAL (a posed engine): every way a hail falls through records its reason, a bot's is remembered and a person's pick
        is not, a struck hail records no parley, and the audience excludes a holder the offer left out
     8. BEHAVIOURAL: every reason resolveHail can record has a line in words.js that renders, on another screen and the asker's own
*/
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { stripComments } from "./lib/strip_comments.mjs";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const rd = f => fs.readFileSync(path.join(REPO, f), "utf8");
const walk = d => fs.readdirSync(path.join(REPO, d), { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(d, e.name)) : e.name.endsWith(".js") ? [path.join(d, e.name)] : []);
const engineMod = await import(pathToFileURL(path.join(REPO, "src/engine/index.js")).href);
const { WORDS, fill, seat } = await import(pathToFileURL(path.join(REPO, "src/shared/words.js")).href);
const { PLAN } = engineMod;

/* A method's or function's body: from its head, skipping the parameter list, to the matching close brace. */
function body(src, head) {
  const h = src.indexOf(head); if (h < 0) return "";
  let j = src.indexOf("(", h), d = 0;
  for (; j < src.length; j++) { if (src[j] === "(") d++; else if (src[j] === ")") { d--; if (!d) break; } }
  j = src.indexOf("{", j); d = 0;
  for (; j < src.length; j++) { if (src[j] === "{") d++; else if (src[j] === "}") { d--; if (!d) break; } }
  return src.slice(h, j + 1);
}
const count = (s, re) => (s.match(re) || []).length;
const REASON_IDS = /parley\s*:\s*\([^)]*\)\s*=>\s*\{\s*const\s+id\s*=\s*\{([^}]*)\}\s*\[\s*e\.why\s*\]/;

function textRules(files) {
  const code = Object.fromEntries(Object.entries(files).map(([f, s]) => [f, stripComments(s)]));
  const eng = code["src/engine/index.js"], flow = code["src/ui/flow.js"], util = code["src/ui/util.js"];
  const srcFiles = Object.entries(code).filter(([f]) => f.startsWith("src/"));
  const uiFiles = srcFiles.filter(([f]) => f.startsWith("src/ui/") || f === "src/orchestrator.js");
  const out = [], rule = (ok, pass, fail) => out.push({ ok, text: ok ? pass : fail });

  // 1. MEMORY, ONCE
  const remember = body(eng, "  rememberHail(p,offer,responses,struck){"), resolve = body(eng, "  resolveHail(p,offer,responses,pick){");
  const refCalls = srcFiles.reduce((n, [, s]) => n + count(s, /\brememberRefusal\(/g) + count(s, /\brefusedFlagWanted\(/g), 0)
    - count(eng, /^\s*rememberRefusal\(p,want,byIdx,worth\)\{/gm) - count(eng, /^\s*refusedFlagWanted\(p,offer,q\)\{/gm);
  const inRemember = count(remember, /\bthis\.rememberRefusal\(/g) + count(remember, /\bthis\.refusedFlagWanted\(/g);
  const outsideSrc = Object.entries(code).filter(([f]) => !f.startsWith("src/")).reduce((n, [, s]) => n + count(s, /\b(rememberRefusal|refusedFlagWanted)\(/g), 0);
  const refusedWrites = srcFiles.reduce((n, [, s]) => n + count(s, /\.refused\[[^\]]+\](?:\.\w+)?\s*=(?!=)/g), 0)
    + Object.entries(code).filter(([f]) => !f.startsWith("src/")).reduce((n, [, s]) => n + count(s, /\.refused\[[^\]]+\](?:\.\w+)?\s*=(?!=)/g), 0);
  const hailMemCallers = srcFiles.reduce((n, [, s]) => n + count(s, /\.rememberHail\(/g), 0);
  const writesInRefusal = count(body(eng, "  rememberRefusal(p,want,byIdx,worth){"), /\.refused\[[^\]]+\](?:\.\w+)?\s*=(?!=)/g);
  rule(remember && refCalls === inRemember && inRemember >= 2 && outsideSrc === 0 && refusedWrites === 1 && writesInRefusal === 1 && hailMemCallers === count(resolve, /this\.rememberHail\(/g) && hailMemCallers >= 1,
    "a hail's refusals are remembered in one place: Game.rememberHail, called only by resolveHail (the replay tool calls it too, never a copy)",
    `refusals are remembered outside rememberHail (${refCalls - inRemember} call(s) in src, ${outsideSrc} outside src, ${refusedWrites} writes to .refused[…], rememberHail called ${hailMemCallers} time(s) vs ${count(resolve, /this\.rememberHail\(/g)} in resolveHail)`);

  // 2. CHOOSING AND SETTLING, ONCE
  const choose = body(eng, "  chooseAnswer(p,offer,takeable){");
  const settleCalls = srcFiles.reduce((n, [, s]) => n + count(s, /\.settleTrade\(/g), 0);
  const priceLoops = srcFiles.reduce((n, [, s]) => n + count(s, /coinTurns\(\s*t\.giveCoins/g), 0);
  const parleys = srcFiles.reduce((n, [, s]) => n + count(s, /t\s*:\s*"parley"/g), 0);
  rule(settleCalls === 1 && /this\.settleTrade\(/.test(resolve) && priceLoops === 1 && /coinTurns\(\s*t\.giveCoins/.test(choose)
       && parleys === 1 && /t:"parley"[^}]*\bwhy\b/.test(resolve) && /PLAN\.leverageTurns/.test(choose),
    "a hail is chosen and settled in one place: settleTrade only in resolveHail, a counter priced only in chooseAnswer (PLAN.leverageTurns), a parley recorded only in resolveHail with its reason",
    `a hail is settled ${settleCalls} time(s), a counter priced ${priceLoops} time(s), a parley recorded ${parleys} time(s) — each must be once, in the engine, and the parley must carry why`);

  // 3. WHO IS ASKED, ONCE
  const aud = body(eng, "  hailAudience(p,offer){"), collect = body(eng, "  collectResponses(offer,asker,opts){");
  const hear = body(flow, "async function hearHail(asker,offer){");
  const bot = body(flow, "export async function botOpenTradeLive(player){"), human = body(flow, "export async function humanTrade(player){");
  const tryT = body(eng, "  tryTrade(p){");
  const holderLoops = uiFiles.reduce((n, [, s]) => n + count(s, /holdersOf\(\s*offer\.want/g), 0);
  rule(/offer\.audience/.test(aud) && /this\.hailAudience\(/.test(collect) && /g\.hailAudience\(/.test(hear) && holderLoops === 0
       && /hearHail\(/.test(bot) && /hearHail\(/.test(human) && /g\.resolveHail\(/.test(bot) && /g\.resolveHail\(/.test(human)
       && /this\.collectResponses\(/.test(tryT) && /this\.resolveHail\(/.test(tryT),
    "who a hail is put to is decided once (Game.hailAudience, honouring the offer's audience); the simulator and both live runners hear and resolve through the one path",
    `a hail picks its own audience (holdersOf(offer.want…) in the UI ${holderLoops} time(s)), or a runner skips hailAudience / hearHail / resolveHail`);

  // 4. THE ANSWERING PROMPT, ONCE
  const answers = body(flow, "async function humanAnswersHail(q,asker,offer){");
  const offeredSays = srcFiles.reduce((n, [, s]) => n + count(s, /say\(\s*"trade\.offered"/g), 0);
  const counterCalls = srcFiles.reduce((n, [, s]) => n + count(s, /\bcounterOffer\(/g), 0) - count(flow, /async function counterOffer\(/g);
  rule(offeredSays === 1 && /say\(\s*"trade\.offered"/.test(answers) && counterCalls === 1 && /counterOffer\(/.test(answers),
    "the prompt a captain sees when a hail is put to them exists once: humanAnswersHail",
    `the answering prompt is written ${offeredSays} time(s) (say("trade.offered") and counterOffer is called ${counterCalls} time(s) — both must be once, in humanAnswersHail`);

  // 5. NO TYPED PLANNER NUMBER IN A PRICING EXPRESSION
  const PRICING = /\b(acquireTurns|coinTurns|crateCostTurns|offerValueTurns|estimateCrateCost|offerWorthTurns|counterTerms|leverageTurns)\b/;
  const planVals = [...new Set(Object.values(PLAN).filter(v => typeof v === "number"))];
  const typed = [];
  for (const [f, s] of uiFiles) {
    // a pricing expression is a statement that names a pricing function — split on ; and newlines, re-joining ternary tails
    for (const stmt of s.split(/;/)) {
      if (!PRICING.test(stmt)) continue;
      for (const v of planVals) {
        const lit = String(v).replace(".", "\\.");
        if (new RegExp(`(?<![\\w.$])${lit}(?![\\w.])`).test(stmt.replace(/"[^"\n]*"|'[^'\n]*'|`[^`]*`/g, ""))) typed.push(`${f}: ${v} in "${stmt.trim().slice(0, 90)}"`);
      }
    }
  }
  rule(typed.length === 0,
    "no number typed into the game's screen code stands in for a PLAN value inside a trade-pricing expression",
    `a planner number is typed into a pricing expression: ${typed.slice(0, 3).join(" | ")}`);

  // 6. THE FALL-THROUGH WORDS LIVE IN THE NARRATION TABLE
  const OUTCOMES = /"trade\.(silence|allDeclined|walksAway|declined)"/g;
  const outcomeCalls = uiFiles.filter(([f]) => f !== "src/ui/util.js").reduce((n, [, s]) => n + count(s, OUTCOMES), 0);
  const utilOutcomes = count(util, OUTCOMES);
  const table = util.match(REASON_IDS);
  rule(outcomeCalls === 0 && !!table && utilOutcomes === 4 && count(table[1], OUTCOMES) === 4,
    "a failed hail's words are the narration table's: EVENT_NARRATION.parley reads e.why, and no screen code flashes a trade outcome of its own",
    `a trade outcome is said outside the narration table (${outcomeCalls} time(s)), or EVENT_NARRATION.parley does not word every reason from e.why`);
  return out;
}

/* ---------- behavioural: a posed engine ---------- */
function behaviourRules(G, utilSrc, engSrc) {
  const out = [], rule = (ok, pass, fail) => out.push({ ok, text: ok ? pass : fail });
  const { Game, roundCfg } = G;
  const pose = () => {
    const g = new Game(roundCfg(["balanced", "balanced", "balanced", "balanced"]), 424242, true);
    const [p, q, r, s] = g.players;
    const [W, X] = g.ings;
    for (const c of g.players) { c.ing = []; c.coins = 5; c.done = false; c.baking = false; }
    q.ing = [W]; r.ing = [W];
    return { g, p, q, r, s, W, X };
  };
  const lastParley = g => [...g.events].reverse().find(e => e.t === "parley");
  const got = {};
  try {
    // silence
    { const { g, p, W } = pose(); const res = g.resolveHail(p, { want: W, giveIng: null, giveCoins: 1 }, []);
      got.silence = res.why === "silence" && lastParley(g) && lastParley(g).why === "silence"; }
    // declined: a deny — remembered for a bot
    { const { g, p, q, W } = pose(); const offer = { want: W, giveIng: null, giveCoins: 1 };
      const res = g.resolveHail(p, offer, [{ q, kind: "deny", why: "toodear" }]);
      got.declined = res.why === "declined" && lastParley(g).why === "declined" && !!(p.refused && p.refused[W + "|" + q.idx]); }
    // walkaway: a counter the bot can pay but will not — remembered
    { const { g, p, q, W } = pose(); const offer = { want: W, giveIng: null, giveCoins: 1 };
      const dear = Math.ceil((g.acquireTurns(p, W).turns + 1) * 8) + 8; p.coins = 1 + dear;
      const res = g.resolveHail(p, offer, [{ q, kind: "counter", askFor: dear }]);
      got.walkaway = res.why === "walkaway" && lastParley(g).why === "walkaway" && !g.events.some(e => e.t === "trade") && !!(p.refused && p.refused[W + "|" + q.idx]); }
    // a person's choice that cannot be honoured: fellThrough, names the captain, and NO memory is written for a person's pick
    { const { g, p, r, s, W } = pose(); const offer = { want: W, giveIng: null, giveCoins: 1 };
      const pick = { q: s, kind: "accept", why: "chose" };
      const res = g.resolveHail(p, offer, [{ q: r, kind: "deny", why: "chose" }, pick], pick);
      got.fellThrough = res.why === "fellThrough" && lastParley(g).why === "fellThrough" && lastParley(g).b === s.idx && !p.refused; }
    // a person walking away with an answer on the table: walkaway, no memory
    { const { g, p, q, r, W } = pose(); const offer = { want: W, giveIng: null, giveCoins: 1 };
      const res = g.resolveHail(p, offer, [{ q, kind: "accept", why: "chose" }, { q: r, kind: "deny", why: "chose" }], null);
      got.personWalks = res.why === "walkaway" && !p.refused; }
    // struck: no parley
    { const { g, p, q, W } = pose(); const offer = { want: W, giveIng: null, giveCoins: 1 };
      const res = g.resolveHail(p, offer, [{ q, kind: "accept" }]);
      got.struck = res.struck === true && !g.events.some(e => e.t === "parley") && g.events.some(e => e.t === "trade") && p.ing.includes(W); }
    // audience: q and r both hold W; the offer was composed for q only
    { const { g, p, q, r, W } = pose(); const offer = { want: W, giveIng: null, giveCoins: 1, audience: [q.idx] };
      const asked = g.hailAudience(p, offer).map(c => c.idx), answered = g.collectResponses(offer, p).map(x => x.q.idx);
      got.audience = asked.length === 1 && asked[0] === q.idx && answered.length === 1 && answered[0] === q.idx && !asked.includes(r.idx); }
  } catch (e) { got.threw = String(e && e.message || e); }
  const hailOk = ["silence", "declined", "walkaway", "fellThrough", "personWalks", "struck"].every(k => got[k]);
  rule(hailOk && !got.threw,
    "a posed hail: silence, declined, walkaway and fellThrough each record their reason; a bot remembers, a person's pick does not; a struck deal records no parley",
    `a posed hail resolved wrongly: ${JSON.stringify(got)}`);
  rule(!!got.audience,
    "a posed hail is put only to the captains its offer was composed for — a holder it left out is not asked",
    "a holder the offer left out was asked");

  // 8. every reason resolveHail can record has words that render
  const reasons = [...new Set([...stripComments(body(engSrc, "  resolveHail(p,offer,responses,pick){")).matchAll(/fall\(\s*(?:[^"()]*\?\s*)?"(\w+)"(?:\s*:\s*"(\w+)")?/g)].flatMap(m => [m[1], m[2]]).filter(Boolean))];
  const table = stripComments(utilSrc).match(REASON_IDS);
  const ids = {}; if (table) for (const m of table[1].matchAll(/(\w+)\s*:\s*"([\w.]+)"/g)) ids[m[1]] = m[2];
  const look = viewer => ({ me: i => i === viewer, name: i => `<b>Captain${i}</b>`, poss: i => `<b>Captain${i}'s</b>` });
  const bad = [];
  for (const why of reasons) {
    const id = ids[why], t = id && WORDS[id];
    if (!t) { bad.push(`${why}: no line`); continue; }
    for (const viewer of [9, 0]) {
      const html = fill(t, { p: seat(0), q: seat(1), want: "«crate»" }, look(viewer));
      if (!html.trim() || /\{[A-Za-z0-9_]+/.test(html) || /\b(undefined|null|NaN)\b/.test(html)) bad.push(`${why} for ${viewer === 0 ? "the asker" : "another screen"}: "${html}"`);
    }
  }
  rule(reasons.length >= 4 && bad.length === 0,
    `every reason a hail can fall through for (${reasons.join(", ")}) has a line in words.js that renders on another screen and on the asker's own`,
    `a hail can fall through in silence: ${bad.join(" | ") || "resolveHail records fewer than four reasons"}`);
  return out;
}

const files = Object.fromEntries([...walk("src"), "scripts/lib/voyage_ask.mjs"].map(f => [f.split(path.sep).join("/"), rd(f)]));
const run = (fs_, G) => [...textRules(fs_), ...behaviourRules(G, fs_["src/ui/util.js"], fs_["src/engine/index.js"])];
const real = run(files, engineMod);
for (const r of real) console.log(`  ${r.ok ? "PASS" : "FAIL"}  ${r.text}`);

/* ---------- RED-PROOF: each rule must go red on a copy broken the way it guards against ---------- */
const broken = (file, from, to) => { if (!files[file].includes(from)) return null; return { ...files, [file]: files[file].replace(from, to) }; };
/* A behavioural mutant is the real Game with one method replaced — in memory, never on disk. */
const mutantGame = patch => { class M extends engineMod.Game {} patch(M.prototype); return { ...engineMod, Game: M }; };
const HEAR = "  for(const q of g.hailAudience(asker,offer)){";
const MUTANTS = [
  ["the live bot remembering its own refusals again", broken("src/ui/flow.js", "  const hail=g.resolveHail(player,offer,responses);", "  for(const r of responses)if(r.kind===\"deny\")g.rememberRefusal(player,offer.want,r.q.idx,0);\n  g.resolveHail(player,offer,responses);"), 0, null],
  ["the replay tool copying the memory instead of calling it", broken("scripts/lib/voyage_ask.mjs", "g.rememberHail(p, offer, responses, dealt);", "for (const r of responses) if (r.kind === \"deny\") p.refused[x.want + \"|\" + r.q.idx] = {};"), 0, null],
  ["the live bot settling its own deal again", broken("src/ui/flow.js", "  const hail=g.resolveHail(player,offer,responses);", "  if(responses[0]&&responses[0].kind===\"accept\")g.settleTrade(player,responses[0].q,offer,0);\n  g.resolveHail(player,offer,responses);"), 1, null],
  ["the live bot asking every holder again: `for(const q of g.holdersOf(offer.want,player))`", broken("src/ui/flow.js", HEAR, "  for(const q of g.holdersOf(offer.want,asker)){"), 2, null],
  ["a second copy of the answering prompt", broken("src/ui/flow.js", "export async function botOpenTradeLive(player){", "async function secondPrompt(q,p,o){return ask(q.idx,say(\"trade.offered\",{q:pn(q.idx)}),[]);}\nexport async function botOpenTradeLive(player){"), 3, null],
  ["the typed 1.1 back in a pricing expression", broken("src/ui/flow.js", "  const hail=g.resolveHail(player,offer,responses);", "  const spare=g.acquireTurns(player,offer.want).turns>1.1;\n  g.resolveHail(player,offer,responses);"), 4, null],
  ["`sayFlash(\"trade.walksAway\")` back in humanTrade", broken("src/ui/flow.js", "  if(!hail.struck){", "  if(pick===-1)await sayFlash(\"trade.walksAway\",{p:seat(player.idx)});\n  if(!hail.struck){"), 5, null],
  ["the narration table losing its parley entry", broken("src/ui/util.js", "  parley:(e,at,cellPx,viewerSeat)=>{", "  parleyGone:(e,at,cellPx,viewerSeat)=>{"), 5, null],
  ["a fall-through that records no reason", files, 6, mutantGame(P => { const ev = P.ev; P.ev = function (o) { if (o && o.t === "parley") delete o.why; return ev.call(this, o); }; })],
  ["a person's pick written into the bot's memory", files, 6, mutantGame(P => { const rh = P.resolveHail; P.resolveHail = function (p, o, rs, pick) { const res = rh.call(this, p, o, rs, pick); if (pick !== undefined) this.rememberHail(p, o, rs, res.struck); return res; }; })],
  ["the audience ignored: every holder asked", files, 7, mutantGame(P => { P.hailAudience = function (p, o) { return this.holdersOf(o.want, p); }; })],
  ["a new reason with no words (walkaway's line removed)", broken("src/ui/util.js", "walkaway:\"trade.walksAway\",", ""), 8, null],
];
let proofOk = true;
for (const [what, mutant, idx, G] of MUTANTS) {
  let red = false;
  if (mutant) { const res = run(mutant, G || engineMod); red = !!res[idx] && !res[idx].ok; }
  if (!red) proofOk = false;
  console.log(`  ${red ? "PASS" : "FAIL"}  red-proof: ${what} ${red ? "goes red" : mutant ? "STAYS GREEN — the gate cannot see it" : "could not be built (the source moved)"}`);
}
const fails = real.filter(r => !r.ok).length;
console.log(fails || !proofOk ? `\nFAIL — ${fails} rule(s) broken${proofOk ? "" : ", and the red-proof did not hold"}` : `\nPASS — a hail is asked, answered, chosen, settled and worded in one place; ${real.length} rules, ${MUTANTS.length} mutants, each red`);
process.exit(fails || !proofOk ? 1 : 0);
