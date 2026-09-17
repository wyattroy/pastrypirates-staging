#!/usr/bin/env node
/* WHETHER YE MAY ATTACK OR TRADE, AND THE REASON THE BUTTON GIVES WHEN YE MAY NOT — DECIDED IN ONE PLACE, THE ENGINE.
   Architecture item 13, 2026-09-17 (Wyatt's ruling on "architectural", DECISIONS.md 2026-09-16: name the fact, count every place
   that decides it, make the count one, gate it).
   BEFORE: the engine decided it (canAttack, holdersOf) AND the action menu decided it again (src/ui/flow.js humanAct): a target
   list with no in-play test and its own range test, its own powder test (twice), a greyed reason picked by elimination (powder,
   else "Their holds are empty"), and a Trade test that counted a baker's crates. Measured on a 375x812 phone: beside a captain
   baking at Tortuga with five crates aboard, Attack was greyed with "Their holds are empty — there's nothin' aboard worth takin'.";
   when the only cargo on the water was a baker's, Trade was live and tapping it bounced with "No one has cargo to trade for."
   AFTER: Game.alongside (range), canPayPowder (affordability), whyNoAttack/canAttack/attackTargets/whyNoAttackHere, and
   whyNoTrade/canOpenTrade (through holdersOf). The menu greys and words; WHY_WORDS is the only map from a reason to a line.
   RULES (red-proofed below, in memory — never on disk):
     1. no screen code compares a purse with the powder — affordability is Game.canPayPowder
     2. flow.js keeps no attack-target list or range test of its own — the menu, its guard and the live bot read
        Game.alongside / attackTargets / whyNoAttackHere
     3. flow.js keeps no trade-eligibility test of its own — no captain filter reading a hold, no "has something to offer" re-test;
        humanAct and humanTrade read Game.whyNoTrade
     4. the menu's reasons are worded only from the engine's answer: each reason line is named once, in WHY_WORDS, and WHY_WORDS
        words every reason whyNoAttack and whyNoTrade can return
     5. SETTLED CALL (Mac: Dev relaying Wyatt, 2026-09-16): a captain baking at Tortuga may still make crow's-nest calls — the
        callers stay `!player.done`, never filtered by in-play
     6. behavioural, posed on the real engine: a captain beside a baker with a full hold is told "sanctuary" (and may fire on the
        same ship the moment it is not baking); broke beats sanctuary ("noPowder"); an empty hold is "emptyHolds"
     7. behavioural: a table whose only crates are aboard a baker gives "noCargo" (and a trade opens the moment that captain is not
        baking); an empty hold and an empty purse give "nothingToTrade"
     8. behavioural: the words — every reason's line renders, with "yer" derived for the captain reading it and a name elsewhere */
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
/* every `players.<filter|some|find|every>(<predicate>)` call, with its predicate text */
function captainFilters(src) {
  const out = [];
  for (const m of src.matchAll(/players\.(filter|some|find|every)\(/g)) {
    let j = m.index + m[0].length, d = 1;
    for (; j < src.length && d; j++) { if (src[j] === "(") d++; else if (src[j] === ")") d--; }
    out.push(src.slice(m.index, j));
  }
  return out;
}

function textRules(files) {
  const out = [], rule = (ok, pass, fail) => out.push({ ok, text: ok ? pass : fail });
  const code = Object.fromEntries(Object.entries(files).map(([f, s]) => [f, stripComments(s)]));
  const flow = code["src/ui/flow.js"], eng = code["src/engine/index.js"];
  const act = body(flow, "export async function humanAct(player,sailCtx){");
  const trade = body(flow, "export async function humanTrade(player){");
  const botTurn = body(flow, "async function botTurn(");

  // 1. NO POWDER COMPARISON OUTSIDE THE ENGINE
  const POWDER_CMP = /(?<![=>])(?:<=?|>=?)\s*[\w$.()]*\bpowder\b|\bpowder\b\s*(?:<=?|>=?)(?!=)/g;
  const cmp = Object.entries(code).filter(([f]) => f !== "src/engine/index.js").map(([f, s]) => [f, count(s, POWDER_CMP)]).filter(([, n]) => n);
  rule(cmp.length === 0 && /canPayPowder\(att\)\s*\{/.test(eng) && /this\.canPayPowder\(att\)/.test(body(eng, "  whyNoAttack(att,def){")),
    "no screen code compares a purse with the powder — whether a captain can pay for a broadside is Game.canPayPowder, read by whyNoAttack",
    `a purse is compared with the powder outside the engine (${cmp.map(([f, n]) => `${f} x${n}`).join(", ") || "none"}), or whyNoAttack does not ask canPayPowder`);

  // 2. NO ATTACK-TARGET LIST OR RANGE TEST IN flow.js
  const rangeTests = count(flow, /man\(\s*[\w$.]+\.pos\s*,\s*[\w$.]+\.pos\s*\)\s*<=?\s*1/g);
  const targetFilters = captainFilters(flow).filter(c => /\bman\(|canAttack\(|whyNoAttack\(/.test(c));
  rule(rangeTests === 0 && targetFilters.length === 0
       && /g\.alongside\(player\.pos,player\)/.test(act) && /g\.attackTargets\(player\)/.test(act) && /g\.whyNoAttackHere\(player\)/.test(act)
       && /disabled:!attackable\.length/.test(act) && /g\.attackTargets\(player\)\.includes\(plan\.target\)/.test(botTurn)
       && /this\.attackTargets\(p\)\.includes\(plan\.target\)/.test(body(eng, "  takeTurn(p,windDir,storm){"))
       && /this\.alongside\(cell,p\)/.test(body(eng, "  foesAt(cell,p){")) && count(eng, /man\(\s*cell\s*,\s*q\.pos\s*\)\s*<=\s*1/g) === 1,
    "flow.js keeps no attack-target list or range test of its own: the menu reads Game.alongside / attackTargets / whyNoAttackHere, the live bot and the simulator fire only on attackTargets, and the engine's range test is written once (alongside, read by foesAt)",
    `a range test or target list is decided outside the engine (${rangeTests} range test(s) and ${targetFilters.length} captain filter(s) in flow.js: ${targetFilters.map(s => s.slice(0, 70)).join(" | ")}), or a runner skips attackTargets`);

  // 3. NO TRADE-ELIGIBILITY TEST IN flow.js
  const holdFilters = captainFilters(flow).filter(c => /\.ing\b/.test(c));
  const offerTests = count(flow, /!\s*[\w$]+\.coins\s*&&\s*![\w$]+\.ing\.length|[\w$]+\.coins\s*>\s*0\s*\|\|\s*[\w$]+\.ing\.length/g);
  rule(holdFilters.length === 0 && offerTests === 0
       && /g\.whyNoTrade\(player\)/.test(act) && /g\.whyNoTrade\(player\)/.test(trade) && !/anyHeld/.test(trade)
       && /this\.holdersOf\(i,p\)/.test(body(eng, "  whyNoTrade(p){")),
    "flow.js keeps no trade-eligibility test of its own: the menu and humanTrade read Game.whyNoTrade, which asks holdersOf — so a captain baking at Tortuga is nobody to trade with",
    `trade eligibility is decided outside the engine (${holdFilters.length} captain filter(s) reading a hold: ${holdFilters.map(s => s.slice(0, 70)).join(" | ") || "none"}; ${offerTests} "has something to offer" re-test(s)), or a trade door skips whyNoTrade`);

  // 4. THE WORDS COME ONLY FROM THE REASON
  const table = flow.match(/const WHY_WORDS=\{([^}]*)\}/);
  const map = {}; if (table) for (const m of table[1].matchAll(/(\w+)\s*:\s*"([\w.]+)"/g)) map[m[1]] = m[2];
  const ids = Object.values(map);
  const namedOnce = ids.length > 0 && ids.every(id => count(flow, new RegExp(`"${id.replace(".", "\\.")}"`, "g")) === 1);
  const reasons = [...new Set([...body(eng, "  whyNoAttack(att,def){").matchAll(/"(\w+)"/g), ...body(eng, "  whyNoTrade(p){").matchAll(/"(\w+)"/g)].map(m => m[1]).filter(r => r !== "noTarget"))];
  const unworded = reasons.filter(r => !map[r] || !WORDS[map[r]]);
  rule(!!table && namedOnce && reasons.length >= 5 && unworded.length === 0
       && /why:attackWhy\?sayText\(WHY_WORDS\[attackWhy\]/.test(act) && /why:tradeWhy\?sayText\(WHY_WORDS\[tradeWhy\]/.test(act),
    `the menu words a greyed Attack or Trade only from the engine's reason: WHY_WORDS names each line once and words every reason the engine gives (${reasons.join(", ")})`,
    `a greyed reason is picked some other way — WHY_WORDS ${table ? "" : "is missing, "}names a line more than once in flow.js (${ids.filter(id => count(flow, new RegExp(`"${id.replace(".", "\\.")}"`, "g")) !== 1).join(", ") || "-"}), or a reason has no line (${unworded.join(", ") || "-"})`);

  // 5. SETTLED CALL: crow's-nest callers stay !player.done
  const calls = captainFilters(flow).filter(c => /player!==att&&player!==def/.test(c));
  rule(calls.length === 1 && /!player\.done/.test(calls[0]) && !/inPlay/.test(calls[0]),
    "a captain baking at Tortuga may still make crow's-nest calls: the callers are every other captain not `done`, never filtered by in-play (settled call, Mac: Dev relaying Wyatt, 2026-09-16)",
    `the crow's-nest callers changed: ${calls.map(s => s.slice(0, 90)).join(" | ") || "not found"}`);
  return out;
}

function behaviourRules(G, flowSrc, words) {
  const out = [], rule = (ok, pass, fail) => out.push({ ok, text: ok ? pass : fail });
  const { Game, roundCfg } = G;
  const pose = () => {
    const g = new Game(roundCfg(["balanced", "balanced", "balanced", "balanced"]), 424242, true);
    const [p, q, r, s] = g.players;
    for (const c of g.players) { c.ing = []; c.coins = 5; c.done = false; c.baking = false; }
    p.pos = [7, 6]; q.pos = [8, 6];                        // p and q alongside, q beside Tortuga (7,7)
    r.pos = [1, 1]; s.pos = [13, 13];                      // nobody else within a broadside
    return { g, p, q, r, s };
  };
  const got = {};
  try {
    // 6. sanctuary, and its control
    { const { g, p, q } = pose(); q.ing = [...q.recipe]; q.baking = true;
      got.sanctuary = g.attackTargets(p).length === 0 && g.whyNoAttack(p, q) === "sanctuary" && g.whyNoAttackHere(p) === "sanctuary" && g.alongside(p.pos, p).includes(q);
      q.baking = false;
      got.sanctuaryControl = g.attackTargets(p).includes(q) && g.whyNoAttackHere(p) === null; }
    { const { g, p, q } = pose(); q.ing = [...q.recipe]; q.baking = true; p.coins = 0;
      got.noPowder = g.whyNoAttackHere(p) === "noPowder"; }
    { const { g, p } = pose();
      got.emptyHolds = g.whyNoAttackHere(p) === "emptyHolds" && g.attackTargets(p).length === 0; }
    { const { g, p, r, s } = pose(); r.pos = [7, 5]; s.pos = [8, 5]; p.pos = [1, 13];
      got.nobodyAlongside = g.alongside(p.pos, p).length === 0 && g.whyNoAttackHere(p) === null; }
    // 7. no cargo but a baker's, and its control; nothing to trade
    { const { g, p, q } = pose(); q.ing = [...q.recipe]; q.baking = true;
      got.noCargo = g.whyNoTrade(p) === "noCargo" && !g.canOpenTrade(p);
      q.baking = false;
      got.noCargoControl = g.whyNoTrade(p) === null && g.canOpenTrade(p); }
    { const { g, p, q } = pose(); q.ing = [q.recipe[0]]; p.coins = 0; p.ing = [];
      got.nothingToTrade = g.whyNoTrade(p) === "nothingToTrade"; }
  } catch (e) { got.threw = String(e && e.message || e); }
  rule(got.sanctuary && got.sanctuaryControl && got.noPowder && got.emptyHolds && got.nobodyAlongside && !got.threw,
    "a posed table: beside a baker with a full hold a captain is told \"sanctuary\" and may fire on the same ship the moment it is not baking; no powder is said first; an empty hold is \"emptyHolds\"; nobody alongside, no reason",
    `the engine's attack answer is wrong on a posed table: ${JSON.stringify(got)}`);
  rule(got.noCargo && got.noCargoControl && got.nothingToTrade && !got.threw,
    "a posed table whose only crates are aboard a baker gives \"noCargo\" (and a trade opens the moment that captain is not baking); an empty hold and purse give \"nothingToTrade\"",
    `the engine's trade answer is wrong on a posed table: ${JSON.stringify(got)}`);
  // 8. every reason's line renders, "yer" for the reader, a name elsewhere
  const table = stripComments(flowSrc).match(/const WHY_WORDS=\{([^}]*)\}/);
  const map = {}; if (table) for (const m of table[1].matchAll(/(\w+)\s*:\s*"([\w.]+)"/g)) map[m[1]] = m[2];
  const look = viewer => ({ me: i => i === viewer, name: i => `<b>Captain${i}</b>`, poss: i => `<b>Captain${i}'s</b>` });
  const bad = [];
  for (const [why, id] of Object.entries(map)) {
    const t = words[id];
    if (!t) { bad.push(`${why}: no line ${id}`); continue; }
    for (const viewer of [0, 9]) {
      const html = fill(t, { n: 2, p: seat(0) }, look(viewer));
      if (!html.trim() || /\{[A-Za-z0-9_']+/.test(html) || /\b(undefined|null|NaN)\b/.test(html)) bad.push(`${why} for ${viewer ? "another screen" : "its reader"}: "${html}"`);
    }
  }
  const sanct = words[map.sanctuary] || "";
  const own = fill(sanct, { p: seat(0) }, look(0)), other = fill(sanct, { p: seat(0) }, look(9));
  rule(bad.length === 0 && !!sanct && /\byer\b/.test(own) && /Captain0's/.test(other) && !/\bye(r)?\b/i.test(sanct.replace(/\{[^}]*\}/g, "")),
    "every reason's line renders; the sanctuary line derives \"yer\" for the captain reading it and a name anywhere else, never typed",
    `a reason's words do not render, or the sanctuary line hand-types "ye": ${bad.join(" | ") || JSON.stringify({ own, other })}`);
  return out;
}

const files = Object.fromEntries([...walk("src").filter(f => /[\\/](ui|net|state|shared)[\\/]|orchestrator\.js$|engine[\\/]index\.js$/.test(f))].map(f => [f.split(path.sep).join("/"), rd(f)]));
const run = (fs_, G, words = WORDS) => [...textRules(fs_), ...behaviourRules(G, fs_["src/ui/flow.js"], words)];
const real = run(files, engineMod);
for (const r of real) console.log(`  ${r.ok ? "PASS" : "FAIL"}  ${r.text}`);

/* ---------- RED-PROOF: each rule must go red on a copy broken the way it guards against ---------- */
const broken = (file, from, to) => { if (!files[file].includes(from)) return null; return { ...files, [file]: files[file].replace(from, to) }; };
const mutantGame = patch => { class M extends engineMod.Game {} patch(M.prototype); return { ...engineMod, Game: M }; };
const MUTANTS = [
  ["the menu's own powder test back: `const canAfford=player.coins>=appState.game.cfg.powder;`",
    broken("src/ui/flow.js", "  const canTrade=!tradeWhy;\n", "  const canTrade=!tradeWhy;\n  const canAfford=player.coins>=appState.game.cfg.powder;\n"), 0, null],
  ["the attack guard re-testing powder: `if(player.coins<appState.game.cfg.powder||!attackable.length)`",
    broken("src/ui/flow.js", "    if(!attackable.length){await sayFlash(\"act.cantAttack\"", "    if(player.coins<appState.game.cfg.powder||!attackable.length){await sayFlash(\"act.cantAttack\""), 0, null],
  ["the menu's old target list: everyone adjacent, no in-play test",
    broken("src/ui/flow.js", "  const alongside=g.alongside(player.pos,player);", "  const alongside=appState.game.players.filter(q=>q!==player&&man(player.pos,q.pos)<=1);"), 1, null],
  ["the live bot's own range test: `man(player.pos,plan.target.pos)<=1&&g.canAttack(...)`",
    broken("src/ui/flow.js", "g.attackTargets(player).includes(plan.target)", "man(player.pos,plan.target.pos)<=1&&g.canAttack(player,plan.target)"), 1, null],
  ["Trade counting a baker's crates: `players.some(q=>q!==player&&!q.done&&q.ing.length>0)`",
    broken("src/ui/flow.js", "  const canTrade=!tradeWhy;", "  const canTrade=!!(player.coins||player.ing.length)&&appState.game.players.some(q=>q!==player&&!q.done&&q.ing.length>0);"), 2, null],
  ["humanTrade's own \"nothing to give\" test back: `if(!player.coins&&!player.ing.length)`",
    broken("src/ui/flow.js", "  const cannot=g.whyNoTrade(player);", "  if(!player.coins&&!player.ing.length)return false;\n  const cannot=g.whyNoTrade(player);"), 2, null],
  ["the greyed Attack reason picked by elimination again: `!canAfford?\"act.noPowder\":\"act.emptyHolds\"`",
    broken("src/ui/flow.js", "why:attackWhy?sayText(WHY_WORDS[attackWhy],", "why:attackWhy?sayText(attackWhy===\"noPowder\"?\"act.noPowder\":\"act.emptyHolds\","), 3, null],
  ["the crow's-nest callers filtered by in-play",
    broken("src/ui/flow.js", "player!==att&&player!==def&&!player.done", "player!==att&&player!==def&&appState.game.inPlay(player)"), 4, null],
  ["the engine forgetting sanctuary in its reason (the old menu's elimination)", files, 5,
    mutantGame(P => { P.whyNoAttack = function (a, d) { if (!d || d === a) return "noTarget"; if (!this.canPayPowder(a)) return "noPowder"; return d.ing.length ? (this.cfg.bakeoff && d.baking ? "emptyHolds" : null) : "emptyHolds"; }; })],
  ["the engine letting Trade count a baker's crates", files, 6,
    mutantGame(P => { P.whyNoTrade = function (p) { if (!p.coins && !p.ing.length) return "nothingToTrade"; return this.players.some(q => q !== p && !q.done && q.ing.length) ? null : "noCargo"; }; })],
  ["the sanctuary line with a hand-typed \"yer\" (never derived)", files, 7, null, { ...WORDS, "act.sanctuary": "Their ovens are lit at Tortuga — they're beyond yer reach now." }],
];
let proofOk = true;
for (const [what, mutant, idx, G, words] of MUTANTS) {
  let red = false;
  if (mutant) { const res = run(mutant, G || engineMod, words || WORDS); red = !!res[idx] && !res[idx].ok; }
  if (!red) proofOk = false;
  console.log(`  ${red ? "PASS" : "FAIL"}  red-proof: ${what} ${red ? "goes red" : mutant ? "STAYS GREEN — the gate cannot see it" : "could not be built (the source moved)"}`);
}
const fails = real.filter(r => !r.ok).length;
console.log(fails || !proofOk ? `\nFAIL — ${fails} rule(s) broken${proofOk ? "" : ", and the red-proof did not hold"}` : `\nPASS — whether ye may attack or trade, and why not, is the engine's answer; ${real.length} rules, ${MUTANTS.length} mutants, each red`);
process.exit(fails || !proofOk ? 1 : 0);
