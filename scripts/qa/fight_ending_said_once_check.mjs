#!/usr/bin/env node
/* HOW A FIGHT ENDED IS SAID ONCE — BY THE FIGHT, FROM THE EVENT ITS ENDING RECORDED, BEFORE THE CROW'S-NEST CALLS SETTLE.
   Architecture item 9 (.planning/ARCHITECTURE-AUDIT-2026-09-16.md), under Wyatt's ruling on "architectural" (DECISIONS.md, 2026-09-16).
   THE FACT: which line tells the table how a fight ended — "Crustbeard wins and takes Cacao Pods.", "Davy Scones slips away!" (his line,
   DECISIONS.md 2026-09-13), or a stand-off — and that it is said once.
   THE FAULT IT HOLDS SHUT: the fight a player watches (src/orchestrator.js asyncBattleRun) had three ways out. The won and the null way
   each narrated "whatever event is last" (narrateLastEvent), which was the ending only because nothing had been recorded after it yet;
   the flight said nothing of itself; and both callers narrated whatever was last AGAIN once the fight returned (humanAct after a
   person's attack, botTurn's beat after a bot's). Measured before the change: "slips away!" said 0 times in 4 posed flights on a solo
   phone (two- and four-captain tables, a person or a bot attacking) and 0 on the host and the guest of a crew room; over 900 headless
   voyages (2, 3 and 4 captains) 818 of 3,346 fights ended in a flight, the ending that had no one to say it.
   THE RULES (comment-stripped source; each red-proofed below against a copy of the real source broken the way it guards against, in memory):
     1. THE FIGHT SAYS ITS OWN ENDING — asyncBattleRun narrates exactly once, and only through narrateEvent(<ending>), where <ending> is
        the event the engine handed back for each way a fight ends: Game.flee's evFlee, Game.nullBattle, Game.winBattle. It never reads the
        top of the pile. The ending is said after it is recorded, then a flight's trade wind (showTheWind), then the calls settle
        (settleSideBets, once) — and nothing returns before the calls are settled. asyncBattle's own wrapper says nothing.
     2. NOTHING SPEAKS ABOUT A FIGHT AFTER IT RETURNS — at every call of onAsyncBattle( in src, the rest of its block is at most the bot's
        ordinary `await botBeat();` and `return;`: no narrate, no flash, no line.
     3. ONE BEAT FOR A BOT, AND IT HAS NOTHING TO ADD AFTER A FIGHT — botBeat is declared once, takes nothing and is always called with
        nothing; BOT_THINK_MS is slept only inside it; narrateCurrent is called only by it (the CEO's condition: no second, quieter form of
        the beat). What it narrates after a fight is the top of the pile, which is the fight's own `disengage` (asyncBattle ends every fight
        in a finally that records it and drains) — and the narration table has no words for `disengage`.
     4. BEHAVIOURAL — POSED FIGHTS: two- and four-captain tables (the two spectators are bots, and they call), × a win, a stand-off (both
        heads in a crosswind) and a flight, × a person attacking (humanAct's call and what follows it) and a bot attacking a person
        (botTurn's call and its beat). The real asyncBattle / asyncBattleRun, collectSideBets / settleSideBets / showTheWind and botBeat /
        narrateCurrent — whatever the source says, real or mutant — run over a real Game; drawing and asking are stubbed; every line is
        worded by the narration table (describeFor). Each fight hands its ending event to the narrator exactly once; a win and a flight
        each have their line and it is said exactly once; on a four-captain table it is said before the calls settle; after the fight
        returns, nothing more is said.
   WHAT THIS DOES NOT HOLD, measured 2026-09-17 and left for its own change: the one narrator says nothing while this screen's action
   panel is still marked as waiting on a decision (src/ui/util.js narrateEvent), and a square a person picks leaves that mark up for
   the panel's 60 ms clearing grace (src/ui/flow.js renderPickPrompt's teardown; the ask prompt clears it at once). A flight is recorded
   and narrated 1 ms after the person on this screen picks where to flee, so on that screen — a solo phone, or a crew host — "ye slip
   away!" is skipped, and so is its broadcast. This gate's poses stub the panel, so they cannot see it. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { stripComments } from "./lib/strip_comments.mjs";
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const walk = d => fs.readdirSync(path.join(REPO, d), { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(d, e.name)) : e.name.endsWith(".js") ? [path.join(d, e.name)] : []);
const { Game, roundCfg } = await import(pathToFileURL(path.join(REPO, "src/engine/index.js")).href);
const { describeFor, NEUTRAL_VIEWER } = await import(pathToFileURL(path.join(REPO, "src/ui/util.js")).href);
const { appState } = await import(pathToFileURL(path.join(REPO, "src/state/index.js")).href);
const ORCH = "src/orchestrator.js", FLOW = "src/ui/flow.js", UTIL = "src/ui/util.js";

/* a named function's text, from its header to its matching brace (parameters skipped first — a default can carry braces) */
function fn(src, name) {
  const m = new RegExp(`(?:export\\s+)?(?:async\\s+)?function\\s+${name}\\s*\\(`).exec(src);
  return m ? bodyFrom(src, m.index) : "";
}
function bodyFrom(src, at) {
  let j = src.indexOf("(", at), d = 0;
  for (; j < src.length; j++) { if (src[j] === "(") d++; else if (src[j] === ")") { d--; if (!d) break; } }
  j = src.indexOf("{", j); d = 0;
  for (let k = j; k < src.length; k++) { if (src[k] === "{") d++; else if (src[k] === "}" && --d === 0) return src.slice(at, k + 1); }
  return "";
}
/* a function's text with the bodies of the functions written INSIDE it emptied, so a `return` in a helper arrow is not one of its own */
function ownText(text) {
  const open = text.indexOf("{");
  let s = text.slice(open + 1, -1), out = "", i = 0;
  const re = /=>\s*\{|\bfunction\b[^{]*\{/g;
  let m;
  while ((m = re.exec(s))) {
    const start = m.index + m[0].length - 1; let d = 0, k = start;
    for (; k < s.length; k++) { if (s[k] === "{") d++; else if (s[k] === "}" && --d === 0) break; }
    out += s.slice(i, start) + "{}"; i = k + 1; re.lastIndex = i;
  }
  return out + s.slice(i);
}
const count = (s, re) => (s.match(re) || []).length;
/* every call of onAsyncBattle( in a file: the enclosing function's name, the call statement, and the rest of the block it sits in */
function fightCalls(src) {
  const found = [];
  const re = /\bonAsyncBattle\s*\(/g; let m;
  while ((m = re.exec(src))) {
    let k = m.index + m[0].length, d = 1;
    for (; k < src.length && d; k++) { if (src[k] === "(") d++; else if (src[k] === ")") d--; }
    const semi = src.indexOf(";", k);
    let e = semi + 1, depth = 0;
    for (; e < src.length; e++) { if (src[e] === "{") depth++; else if (src[e] === "}") { if (depth === 0) break; depth--; } }
    const before = src.slice(0, m.index);
    const owner = [...before.matchAll(/(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/g)].pop();
    const stmtStart = Math.max(before.lastIndexOf(";"), before.lastIndexOf("{"), before.lastIndexOf("}")) + 1;
    found.push({ owner: owner ? owner[1] : "?", call: src.slice(stmtStart, semi + 1).trim(), rest: src.slice(semi + 1, e) });
  }
  return found;
}

function textRules(files) {
  const S = Object.fromEntries(Object.entries(files).map(([f, s]) => [f, stripComments(s)]));
  const orch = S[ORCH], util = S[UTIL];
  const out = [], rule = (ok, pass, fail) => out.push({ ok, text: ok ? pass : fail });

  // 1. THE FIGHT SAYS ITS OWN ENDING
  {
    const run = fn(orch, "asyncBattleRun"), own = run ? ownText(run) : "", wrap = fn(orch, "asyncBattle");
    const said = [...own.matchAll(/\bnarrateEvent\(\s*([A-Za-z_$][\w$]*)\s*\)/g)];
    const narrations = count(own, /\bnarrate(?:Event|LastEvent|Current)\s*\(/g) + count(run, /\bnarrate(?:LastEvent|Current)\s*\(/g);
    const ending = said.length === 1 ? said[0][1] : null;
    const flightVar = (own.match(/([A-Za-z_$][\w$]*)\s*=\s*appState\.game\.flee\(\s*F\s*,/) || [])[1];
    const at = re => { const m = re.exec(own); return m ? m.index : -1; };
    const fromFlee = ending && flightVar ? at(new RegExp(`\\b${ending}\\s*=\\s*${flightVar}\\.evFlee\\b`)) : -1;
    const fromNull = ending ? at(new RegExp(`\\b${ending}\\s*=\\s*appState\\.game\\.nullBattle\\(\\s*F\\s*\\)`)) : -1;
    const fromWin = ending ? at(new RegExp(`\\b${ending}\\s*=\\s*appState\\.game\\.winBattle\\(\\s*F\\s*,`)) : -1;
    const steps = count(own, /\.flee\(/g) === 1 && count(own, /\.nullBattle\(/g) === 1 && count(own, /\.winBattle\(/g) === 1;
    const sayAt = at(/\bnarrateEvent\(/), windAt = at(/\bshowTheWind\(/), settleAt = at(/\bsettleSideBets\(/);
    const settles = count(own, /\bsettleSideBets\(/g);
    const returns = [...own.matchAll(/\breturn\b/g)].map(r => r.index);
    const pile = /\.events\s*\[/.test(own);
    const wrapQuiet = !!wrap && !/\bnarrate\w*\s*\(|\bflash\s*\(|\bsayFlash\s*\(/.test(wrap);
    const ok = !!run && said.length === 1 && narrations === 1 && fromFlee >= 0 && fromNull >= 0 && fromWin >= 0 && steps
      && sayAt > Math.max(fromFlee, fromNull, fromWin) && windAt > sayAt && settleAt > windAt && settles === 1
      && returns.every(r => r > settleAt) && !pile && wrapQuiet;
    rule(ok,
      `the fight says its own ending once, by reference: narrateEvent(${ending}) — ${ending} is Game.flee's evFlee, Game.nullBattle's or Game.winBattle's event — then a flight's wind, then the calls settle once; nothing returns before them, and asyncBattle's wrapper says nothing`,
      `the fight does not say its ending once, from the event it recorded, before the calls settle —`
        + `${said.length === 1 ? "" : ` narrateEvent(<name>) appears ${said.length} time(s);`}${narrations === 1 ? "" : ` ${narrations} narration call(s) in asyncBattleRun (narrateLastEvent / narrateCurrent read the top of the pile);`}`
        + `${fromFlee >= 0 ? "" : " the flight's ending (Game.flee's evFlee) is not what is said;"}${fromNull >= 0 ? "" : " the stand-off's ending (Game.nullBattle) is not what is said;"}${fromWin >= 0 ? "" : " the win's ending (Game.winBattle) is not what is said;"}`
        + `${steps ? "" : " the fight does not end through exactly one flee / nullBattle / winBattle;"}${sayAt > Math.max(fromFlee, fromNull, fromWin) ? "" : " the line is said before every ending is recorded;"}`
        + `${windAt > sayAt && settleAt > windAt ? "" : " the order is not ending, wind, calls;"}${settles === 1 ? "" : ` the calls are settled in ${settles} place(s);`}`
        + `${returns.every(r => r > settleAt) ? "" : " a way out of the fight returns before the calls settle (T-249's silence, or an ending never said);"}${pile ? " asyncBattleRun reads the event pile by index;" : ""}${wrapQuiet ? "" : " asyncBattle's wrapper speaks;"}`);
  }

  // 2. NOTHING SPEAKS ABOUT A FIGHT AFTER IT RETURNS
  {
    const calls = Object.entries(S).flatMap(([f, s]) => fightCalls(s).map(c => ({ f, ...c })));
    const bad = calls.filter(c => !/^(?:await\s*botBeat\(\)\s*;)?\s*(?:return\s*;)?$/.test(c.rest.replace(/\s+/g, " ").trim()));
    const owners = calls.map(c => c.owner);
    rule(calls.length >= 2 && owners.includes("humanAct") && owners.includes("botTurn") && bad.length === 0,
      `nothing speaks about a fight after it returns: ${calls.map(c => `${c.owner} (${c.rest.replace(/\s+/g, "") || "nothing"})`).join(", ")}`,
      `a fight is spoken about again after it returns — ${calls.length < 2 || !owners.includes("humanAct") || !owners.includes("botTurn") ? `the fight is called from ${owners.join(", ") || "nowhere"} (a person's attack in humanAct and a bot's in botTurn were expected); ` : ""}${bad.map(c => `${c.f} ${c.owner}: after "${c.call}" comes "${c.rest.replace(/\s+/g, " ").trim()}"`).join("; ")}`);
  }

  // 3. ONE BEAT FOR A BOT, AND IT HAS NOTHING TO ADD AFTER A FIGHT
  {
    const all = Object.entries(S);
    const decls = all.reduce((n, [, s]) => n + count(s, /\bfunction\s+botBeat\s*\(/g), 0);
    const beat = fn(util, "botBeat");
    const plain = /^export\s+async\s+function\s+botBeat\s*\(\s*\)\s*\{/.test(beat);
    const argued = all.reduce((n, [, s]) => n + count(s, /\bbotBeat\s*\(\s*[^)\s]/g), 0);
    const thinkOutside = all.reduce((n, [f, s]) => n + count(f === UTIL ? s.replace(beat, "") : s, /\bBOT_THINK_MS\b/g), 0) - count(util, /\bconst\s+BOT_THINK_MS\s*=/g);
    const cur = fn(util, "narrateCurrent");
    const currentOutside = all.reduce((n, [f, s]) => n + count(f === UTIL ? s.replace(beat, "").replace(cur, "") : s, /\bnarrateCurrent\s*\(/g), 0);
    const table = (/const\s+EVENT_NARRATION\s*=\s*\{([\s\S]*?)\n\};/.exec(util) || [, ""])[1];
    const wordless = !!table && !/(?:^|[\s,{])disengage\s*:/.test(table);
    const wrap = fn(S[ORCH], "asyncBattle");
    const endsLast = /\bfinally\s*\{\s*appState\.game\.endBattle\(\s*att\s*,\s*def\s*\)\s*;\s*liveRender\(\s*\)\s*;?\s*\}/.test(wrap);
    rule(decls === 1 && plain && argued === 0 && thinkOutside === 0 && /\bnarrateCurrent\(\s*\)/.test(beat) && currentOutside === 0 && wordless && endsLast,
      "a bot has one beat — botBeat, declared once, taking and given nothing, the only place a bot's thinking pause is slept and narrateCurrent is called — and after a fight it finds the fight's own `disengage` on top (recorded and drained in asyncBattle's finally), which has no words",
      `a bot's beat has a second form, or could add words after a fight —${decls === 1 && plain ? "" : ` botBeat is declared ${decls} time(s)${plain ? "" : ", or with parameters"};`}${argued ? ` botBeat is called with an argument ${argued} time(s);` : ""}${thinkOutside ? ` the thinking pause (BOT_THINK_MS) is slept ${thinkOutside} time(s) outside botBeat;` : ""}${/\bnarrateCurrent\(\s*\)/.test(beat) && currentOutside === 0 ? "" : " narrateCurrent is not botBeat's alone;"}${wordless ? "" : " the narration table gives `disengage` words;"}${endsLast ? "" : " asyncBattle does not end every fight by recording disengage and draining it, in a finally;"}`);
  }
  return out;
}

/* ---------- 4. BEHAVIOURAL: posed fights, the real display-code text run over a real Game ---------- */
function compileParts(files) {
  const orch = stripComments(files[ORCH]), flow = stripComments(files[FLOW]), util = stripComments(files[UTIL]);
  const need = { asyncBattle: fn(orch, "asyncBattle"), asyncBattleRun: fn(orch, "asyncBattleRun"), collectSideBets: fn(flow, "collectSideBets"),
    settleSideBets: fn(flow, "settleSideBets"), showTheWind: fn(flow, "showTheWind"), botBeat: fn(util, "botBeat"), narrateCurrent: fn(util, "narrateCurrent") };
  const missing = Object.entries(need).filter(([, t]) => !t).map(([n]) => n);
  if (missing.length) throw new Error("not found in the source: " + missing.join(", "));
  const tails = {};
  for (const owner of ["humanAct", "botTurn"]) {
    const c = fightCalls(fn(flow, owner));
    if (c.length !== 1) throw new Error(`${owner} calls the fight ${c.length} time(s)`);
    tails[owner] = c[0].call + c[0].rest;
  }
  return { need, tails };
}
function runPoses(files, words = e => { const L = describeFor(e, NEUTRAL_VIEWER); return L ? L.txt : null; }) {
  let parts;
  try { parts = compileParts(files); } catch (e) { return Promise.resolve({ ok: false, text: `the posed fights could not be built: ${e.message}` }); }
  const log = [];
  const S = {
    appState, BOT_THINK_MS: 0, HEXCOL: ["#f00", "#0f0", "#00f", "#ff0"],
    liveRender: () => { appState.evIdx = Math.max(0, appState.game.events.length - 1); return Promise.resolve(); },
    publishNow: () => {}, applyBattleSnap: () => {}, netRemoveBattle: () => {}, netFail: () => () => {}, battlePublish: () => {}, battleAsk: async () => {},
    sleep: async () => {}, stepDelay: () => 0, sayAll: id => ({ html: id, variants: [] }), say: id => id, seat: i => i, pn: i => "P" + i, ilabelImg: i => String(i),
    flash: async html => { log.push({ k: "flash", txt: String(html) }); }, sayFlash: async id => { log.push({ k: "flash", txt: id }); },
    ask: async (idx, msg, opts) => opts[0].value, pickCell: async (p, cells) => cells[0],
    flipFor: (p, why) => appState.game.flip(p, why),
    narrateEvent: async e => { if (!e) return; log.push({ k: "narrate", e, txt: words(e) }); },
    narrateLastEvent: async () => S.narrateEvent(appState.game.events[appState.game.events.length - 1]),
    netHandlers: () => ({ onLiveRender: S.liveRender, onAsyncBattle: async (a, d) => { const r = await S.asyncBattle(a, d); log.push({ k: "returned" }); return r; } }),
  };
  const make = text => new Function("S", `with(S){ return (${text.replace(/^export\s+/, "")}); }`)(S);
  try {
    for (const [name, text] of Object.entries(parts.need)) S[name] = make(text);
    S.humanTail = make(`async function(player,t,plan){${parts.tails.humanAct}}`);
    S.botTail = make(`async function(player,t,plan){${parts.tails.botTurn}}`);
  } catch (e) { return Promise.resolve({ ok: false, text: `the posed fights could not be compiled: ${e.message}` }); }

  const pose = (seats, attacker) => {
    for (let s = 0; s < 80; s++) {
      const g = new Game(roundCfg(Array(seats).fill("bot")), 9209 + s * 101, true);
      const n = g.cfg.grid, wet = c => !(g.blocked(c) || g.isIsland(c) || g.isHome(c) || g.onRim(c));
      for (let x = 1; x < n - 1; x++) for (let y = 1; y < n - 1; y++) {
        const a = [x, y], d = [x, y - 1];
        if (!wet(a) || !wet(d)) continue;
        const [att, def, ...rest] = g.players;
        att.pos = a; def.pos = d; rest.forEach((q, i) => { q.pos = i ? [n - 1, n - 1] : [0, 0]; });
        g.players.forEach(pl => { pl.done = false; pl.baking = false; pl.coins = 20; pl.strategy = "bot"; });
        (attacker === "human" ? att : def).strategy = "human";   // a person attacks a bot, or a bot attacks a person
        def.ing = [g.ings[0]]; att.ing = [];
        g.windNow = "E";                                           // the two ships lie north-south: a crosswind
        g.events.length = 0;
        if (g.downwindSide(att, def) !== null || !g.canAttack(att, def)) continue;
        return { g, att, def };
      }
    }
    throw new Error("no board in 80 seeds could pose two captains side by side on open water in a crosswind");
  };
  const seen = [], bad = [];
  return (async () => {
    for (const seats of [2, 4]) for (const end of ["win", "null", "flee"]) for (const attacker of ["human", "bot"]) {
      const label = `${seats} captains, ${end === "null" ? "a stand-off" : end === "win" ? "a win" : "a flight"}, ${attacker === "human" ? "a person" : "a bot"} attacking`;
      try {
        const { g, att, def } = pose(seats, attacker);
        const faces = { win: [true, false], null: [true, true], flee: [false, false] }[end];
        let k = 0;
        g.flip = function (p, why) { const h = faces[Math.min(k++, faces.length - 1)]; p.flips++; if (h) p.heads++; if (why) this.ev({ t: "coinflip", p: p.idx, heads: h ? 1 : 0, why }); return h; };
        g.botWantsFlee = () => true; g.wantsRefire = () => false;
        appState.game = g; appState.evIdx = 0; appState.replaying = false; appState.isHost = false; appState.db = null; appState.turnExpired = false;
        log.length = 0;
        if (attacker === "human") await S.humanTail(att, def, null); else await S.botTail(att, null, { target: def });
        const endings = g.events.filter(e => /^battle(null|flee)?$/.test(e.t));
        const want = { win: "battle", null: "battlenull", flee: "battleflee" }[end];
        const endEv = endings[0], endTxt = endEv ? words(endEv) : null;
        const lines = log.filter(x => (x.k === "narrate" && x.txt) || x.k === "flash");
        const handed = log.filter(x => x.k === "narrate" && x.e === endEv).length;
        const saidN = endTxt ? lines.filter(x => x.txt === endTxt).length : 0;
        const at = log.findIndex(x => x.k === "narrate" && x.e === endEv), settle = log.findIndex(x => x.k === "flash" && x.txt === "call.settle"), back = log.findIndex(x => x.k === "returned");
        const afterBack = back < 0 ? [] : log.slice(back + 1).filter(x => (x.k === "narrate" && x.txt) || x.k === "flash");
        const hasLine = end === "null" || (endTxt && (end === "win" ? /\bwins?\b/ : /slips? away/).test(endTxt.replace(/<[^>]*>/g, "")));
        const why = [];
        if (endings.length !== 1 || endEv.t !== want) why.push(`the fight recorded ${endings.map(e => e.t).join(", ") || "no ending"} (${want} expected)`);
        if (handed !== 1) why.push(`its ending was handed to the narrator ${handed} time(s)`);
        if (!hasLine) why.push(`its ending has no line (${JSON.stringify(endTxt)})`);
        if (endTxt && saidN !== 1) why.push(`its line was said ${saidN} time(s)`);
        if (seats === 4 && !(settle > at && at >= 0)) why.push(settle < 0 ? "the calls were never settled" : "its line came after the calls settled");
        if (seats === 2 && settle >= 0) why.push("a fight nobody could call settled calls");
        if (back < 0 || back < at) why.push("the ending was not said before the fight returned");
        if (afterBack.length) why.push(`after the fight returned, ${afterBack.map(x => JSON.stringify(String(x.txt).replace(/<[^>]*>/g, "").slice(0, 40))).join(", ")} was said`);
        if (g.events[g.events.length - 1].t !== "disengage") why.push(`the last event is ${g.events[g.events.length - 1].t}, not disengage`);
        seen.push(`${label}: ${endTxt ? JSON.stringify(endTxt.replace(/<[^>]*>/g, "").slice(0, 34)) + " ×" + saidN : "no words ×0"}${seats === 4 ? ", then the calls" : ""}`);
        if (why.length) bad.push(`${label} — ${why.join("; ")}`);
      } catch (e) { bad.push(`${label} — threw: ${e.message}`); }
    }
    return bad.length ? { ok: false, text: `a posed fight does not say how it ended exactly once, before the calls settle: ${bad.slice(0, 4).join(" | ")}${bad.length > 4 ? ` (+${bad.length - 4} more)` : ""}` }
      : { ok: true, text: `posed fights say how they ended exactly once, before the calls settle, and nothing after: ${seen.join(" · ")}` };
  })();
}

async function rules(files, words) { return [...textRules(files), await runPoses(files, words)]; }

const files = Object.fromEntries(walk("src").map(f => [f.split(path.sep).join("/"), fs.readFileSync(path.join(REPO, f), "utf8")]));
const real = await rules(files);
real.forEach((r, i) => console.log(`  ${r.ok ? "PASS" : "FAIL"}  ${i + 1}. ${r.text}`));

/* RED-PROOF: each mutant is the real source broken the way a rule guards against; the rule it names must go red. */
const broken = (edits) => { const f = { ...files }; for (const [file, from, to] of edits) { if (!f[file] || !f[file].includes(from)) return null; f[file] = f[file].replace(from, () => to); } return f; };
const HUMAN_CALL = "    await netHandlers().onAsyncBattle(player,t);", BOT_CALL = "    await netHandlers().onAsyncBattle(player,plan.target);";
const MUTANTS = [
  ["narrateLastEvent() back after a person's fight (the audit's own mutant)", broken([[FLOW, HUMAN_CALL, HUMAN_CALL + "\n    await narrateLastEvent();"]]), [2]],
  ["narrateLastEvent() back after a bot's fight, before its beat", broken([[FLOW, "    await botBeat();return;", "    await narrateLastEvent();await botBeat();return;"]]), [2]],
  ["the flight's way out again, saying nothing of itself (the audit's own mutant: the flee exit with no narrate)",
    broken([[ORCH, "  let evEnd;\n", "  if(F.fled){await showTheWind(flight.evWind);await settleSideBets(bets,null);return null;}\n  let evEnd;\n"]]), [1, 4]],
  ["the fight narrating the top of the pile instead of its ending", broken([[ORCH, "  await narrateEvent(evEnd);", "  await narrateLastEvent();"]]), [1]],
  ["the ending said twice", broken([[ORCH, "  await narrateEvent(evEnd);", "  await narrateEvent(evEnd);await narrateEvent(evEnd);"]]), [1, 4]],
  ["the ending said after the calls settle", broken([[ORCH, "  await narrateEvent(evEnd);\n  await showTheWind(flight.evWind);\n  await settleSideBets(bets,F.winner?(F.winner===att?\"a\":\"d\"):null);",
    "  await showTheWind(flight.evWind);\n  await settleSideBets(bets,F.winner?(F.winner===att?\"a\":\"d\"):null);\n  await narrateEvent(evEnd);"]]), [1, 4]],
  ["a second, quiet form of the bot's beat, taken after a fight (the CEO's condition)",
    broken([[UTIL, "export async function botBeat(){", "export async function botPause(){\n  netHandlers().onLiveRender();\n  if(!appState.replaying)await new Promise(r=>setTimeout(r,BOT_THINK_MS));\n}\nexport async function botBeat(){"],
      [FLOW, "    await botBeat();return;", "    await botPause();return;"]]), [2, 3]],
  ["the bot's beat told not to narrate after a fight (botBeat(true))",
    broken([[UTIL, "export async function botBeat(){\n  netHandlers().onLiveRender();\n  await narrateCurrent();", "export async function botBeat(quiet){\n  netHandlers().onLiveRender();\n  if(!quiet)await narrateCurrent();"],
      [FLOW, "    await botBeat();return;", "    await botBeat(true);return;"]]), [2, 3]],
  ["the fight's end given words (what the bot's beat would then say after every fight)",
    broken([[UTIL, "  rimhead:(e,at,cellPx,viewerSeat)=>", "  disengage:(e,at,cellPx,viewerSeat)=>({txt:say(\"battle.slipsAway\",{d:seat(e.d)},viewerSeat)}),\n  rimhead:(e,at,cellPx,viewerSeat)=>"]]), [3, 4],
    e => e.t === "disengage" ? "⚔️ the fight is over" : (describeFor(e, NEUTRAL_VIEWER) || {}).txt || null],
];
let proofOk = true;
for (const [what, mutant, idxs, words] of MUTANTS) {
  const res = mutant ? await rules(mutant, words) : null;
  const red = !!res && idxs.every(i => res[i - 1] && !res[i - 1].ok);   // the rules that guard against THIS break, not merely any rule
  if (!red) proofOk = false;
  console.log(`  ${red ? "PASS" : "FAIL"}  red-proof (rule ${idxs.join(" & ")}): ${what} ${red ? "goes red" : mutant ? `STAYS GREEN on rule(s) ${idxs.filter(i => res[i - 1].ok).join(", ")} — the gate cannot see it` : "could not be built (the source moved — re-anchor)"}`);
}
const fails = real.filter(r => !r.ok).length;
console.log(fails || !proofOk ? `\nFAIL — ${fails} rule(s) broken${proofOk ? "" : ", and the red-proof did not hold"}`
  : `\nPASS — how a fight ended is said once, by the fight, before the calls settle; ${real.length} rules, ${MUTANTS.length} mutants, each red`);
process.exit(fails || !proofOk ? 1 : 0);
