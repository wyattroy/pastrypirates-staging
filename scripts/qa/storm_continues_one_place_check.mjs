#!/usr/bin/env node
/* WHETHER TODAY'S STORM IS A NEW ONE OR A CONTINUING ONE — COUNTED IN ONE PLACE, BEFORE TOMORROW IS DRAWN.
   Architecture item 44 (Mac: Dev relaying Wyatt, 2026-09-17: "fix it, no ruling needed" — "The words themselves don't change;
   today the game shows the right words on the wrong day. The lines' own meaning is the intent.").
   THE FAULT IT HOLDS SHUT: the storm count was written by rollStorm, which draws TOMORROW's weather, and the day's record read it
   after that draw — so the first of two storms in a row was recorded as going on ("Storm's now/still blowin'") and the second as
   new ("Storm's blowin'"). Measured before the fix, headless (pirate/trader/balanced/rusher): seed 15838 days 9-10, 23757 days
   3-4, 47514 days 5-6 — day.stormNow then day.storm, every time. Found by architecture item 2 (c8d4bf51, NOT DONE).
   The v1 game drew today's storm and read the count at once, which was right; v2's forecast (02cb5e79, 2026-08-05) moved the draw a
   day ahead and left the read where it was.
   THE WORDS (src/shared/words.js): day.storm "Storm's blowin'" — a new storm; day.stormNow "Storm's now blowin'" — it goes on, the
   wind turned; day.stormStill "Storm's still blowin'" — it goes on the same way. Unchanged; only which day gets which is held here.
   THE RULES (each red-proofed below against a mutant of the real source, built in memory; comments stripped first):
     1. THE COUNT — the storm days running (today included) is written only by Game.advanceWind, after the forecast becomes today and
        before tomorrow is drawn, plus the constructor's opening 0. It is named only there, in rollStorm (the cap: never a third in a
        row) and in Game.beginDay (the day's record) — no screen reads the engine's count (a guest's engine never keeps one).
     2. THE RECORD IS THE ONE ANSWER EVERY SCREEN READS — {t:"newround"} carries `streak: this.stormStreak`, nothing recomputed;
        `.streak` is read once in src/, by the day's line chooser, which decides from the day's own storm, streak and wind streak
        only; the three storm lines are named nowhere else.
     3. BEHAVIOUR, SEEDS 15838, 23757, 47514 — real voyages run on the engine's OWN weather text (rollStorm, drawWeather,
        advanceWind, beginDay — real or mutant) and every day's line rendered by the line chooser's OWN text: a calm day gets no storm
        line; a storm after a calm day (or on day 1) gets day.storm and streak 1; a storm the day after a storm gets day.stormNow
        (wind turned) or day.stormStill (wind held) and streak 2. The streak is checked against an independent count of the records'
        own storm flags. Each seed must hold both a new storm and a continuing one, or the rule says it proved nothing.
     4. THE DRAW DID NOT MOVE — on the same voyages, every day's roll spends exactly one random draw, reads the count of storms
        running through the day before (the value the draw-time count gave it before this item), and its storm is the day's.
        Measured when this landed: the same storms on the same days with the same random draws, before and after, in 1200 headless
        voyages and 21 live-loop runs; only the records' streak differed (see the commit).
   NOT HELD HERE: whether a storm happens (roll and cap, rules_claims_match_engine_check / DRIVING-THE-GAME §5e) and the words. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { stripComments } from "./lib/strip_comments.mjs";
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const { Game, roundCfg } = await import(pathToFileURL(path.join(REPO, "src/engine/index.js")).href);
const { say } = await import(pathToFileURL(path.join(REPO, "src/ui/util.js")).href);
const { DIRNAME } = await import(pathToFileURL(path.join(REPO, "src/shared/index.js")).href);
const { WORDS } = await import(pathToFileURL(path.join(REPO, "src/shared/words.js")).href);
const walk = d => fs.readdirSync(path.join(REPO, d), { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(d, e.name)) : e.name.endsWith(".js") ? [path.join(d, e.name)] : []);
const ENG = "src/engine/index.js", UTIL = "src/ui/util.js", ORCH = "src/orchestrator.js", WORDS_FILE = "src/shared/words.js";
const SEEDS = [15838, 23757, 47514];
const CAPTAINS = ["pirate", "trader", "balanced", "rusher"];
const STORM_IDS = ["day.storm", "day.stormNow", "day.stormStill"], CALM_IDS = ["day.wind", "day.windStill"];

/* A body by brace matching, after the parameter list (skipped whole). */
function bodyAt(src, h) {
  if (h < 0) return "";
  let j = src.indexOf("(", h), d = 0;
  for (; j < src.length; j++) { if (src[j] === "(") d++; else if (src[j] === ")") { d--; if (!d) break; } }
  j = src.indexOf("{", j); d = 0;
  for (; j < src.length; j++) { if (src[j] === "{") d++; else if (src[j] === "}") { d--; if (!d) break; } }
  return src.slice(h, j + 1);
}
const methodRe = name => new RegExp(`^  ${name}\\(([^)]*)\\)\\{`, "m");
const method = (eng, name) => { const m = eng.match(methodRe(name)); return m ? bodyAt(eng, m.index) : ""; };
const braces = (src, open) => { let d = 0, j = open; for (; j < src.length; j++) { if (src[j] === "{") d++; else if (src[j] === "}") { d--; if (!d) break; } } return src.slice(open, j + 1); };
const count = (s, re) => (s.match(new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g")) || []).length;
const WRITE = /\bstormStreak\s*(?:=(?!=)|\+\+|--|[-+*]=)|(?:\+\+|--)\s*(?:this|g|[\w$.]+)\.stormStreak\b/g;

/* The day's line chooser (EVENT_NARRATION.newround), by its own text. */
function chooserText(util) {
  const h = util.indexOf("newround:e=>{");
  return h < 0 ? "" : braces(util, h + "newround:e=>".length);
}
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const LINE_RX = [...CALM_IDS, ...STORM_IDS].map(id => [id, new RegExp("^" + esc(WORDS[id]).replace(/\\\{day\\\}/g, "\\d+").replace(/\\\{dir\\\}/g, "[A-Z]+") + "(?: |$)")]);

/* Real voyages on the engine's own weather text. Cached by that text: mutants elsewhere reuse the real voyages. */
const voyageCache = new Map();
function voyages(eng) {
  const roll = bodyAt(eng, eng.indexOf("function rollStorm("));
  const cap = eng.match(/\bconst DAY_CAP\s*=\s*(\d+)\s*;/);
  const heads = ["drawWeather", "advanceWind", "beginDay"].map(n => [n, eng.match(methodRe(n))]);
  const key = roll + heads.map(([n, m]) => m ? method(eng, n) : "").join("\n");
  if (voyageCache.has(key)) return voyageCache.get(key);
  let out;
  try {
    if (!roll) throw new Error("function rollStorm is missing from the engine");
    if (!cap) throw new Error("const DAY_CAP is missing from the engine");
    const rollStorm = new Function(`return ${roll}`)();
    out = SEEDS.map(seed => {
      const g = new Game(roundCfg(CAPTAINS), seed, true);
      const rolls = [];
      const watched = gg => { const read = gg.stormStreak || 0, before = gg.randCalls; const storm = rollStorm(gg); rolls.push({ read, spent: gg.randCalls - before, storm }); return storm; };
      for (const [name, m] of heads) {
        if (!m) throw new Error(`Game.${name} is missing`);
        const b = bodyAt(eng, m.index);
        g[name] = new Function("rollStorm", "DAY_CAP", `return function(${m[1]}){${b.slice(m[0].length, -1)}}`)(watched, +cap[1]);
      }
      g.play();
      return { seed, days: g.events.filter(e => e.t === "newround"), rolls };
    });
  } catch (e) { out = { error: e.message }; }
  voyageCache.set(key, out);
  return out;
}

function rules(files) {
  const S = Object.fromEntries(Object.entries(files).map(([f, s]) => [f, stripComments(s)]));
  const eng = S[ENG], util = S[UTIL];
  const src = Object.entries(S).filter(([f]) => f !== WORDS_FILE);
  const out = [];
  const rule = checks => { const bad = checks.filter(c => !c[0]).map(c => c[1]); out.push({ ok: !bad.length, bad }); };
  const V = voyages(eng);
  const behave = fn => { if (V.error) return [false, `the engine's weather steps could not be run (${V.error})`]; try { return fn(); } catch (e) { return [false, `the voyage check threw: ${e.message}`]; } };
  const roll = bodyAt(eng, eng.indexOf("function rollStorm(")), advance = method(eng, "advanceWind"), day = method(eng, "beginDay");
  const ctor = method(eng, "constructor"), draw = method(eng, "drawWeather");

  // 1. THE COUNT
  {
    const writes = src.map(([f, s]) => [f, count(s, WRITE)]).filter(([, n]) => n);
    const allWrites = writes.reduce((a, [, n]) => a + n, 0);
    const inAdvance = count(advance, WRITE), inCtor = count(ctor, /\bthis\.stormStreak\s*=\s*0\s*;/);
    const cur = advance.search(/\bconst\s+cur\s*=\s*this\.next\b/);
    const w = advance.search(/\bthis\.stormStreak\s*=(?!=)/);
    const tail = cur < 0 ? -1 : advance.slice(cur).search(/\bthis\.next\s*=\s*this\.drawWeather\(\)/);
    const tomorrow = tail < 0 ? -1 : cur + tail;
    const named = src.reduce((a, [, s]) => a + count(s, /\bstormStreak\b/), 0);
    const namedHere = count(roll, /\bstormStreak\b/) + count(advance, /\bstormStreak\b/) + count(day, /\bstormStreak\b/) + count(ctor, /\bstormStreak\b/);
    const where = src.filter(([f, s]) => /\bstormStreak\b/.test(s) && f !== ENG).map(([f]) => f);
    rule([
      [inAdvance === 1 && inCtor === 1 && allWrites === 2,
        `the storm count is written ${allWrites} time(s) in src/ (${writes.map(([f, n]) => `${f} ×${n}`).join(", ") || "nowhere"}) — only Game.advanceWind (${inAdvance}) and the constructor's opening 0 (${inCtor}) may`],
      [count(roll, WRITE) === 0, "rollStorm writes the storm count — it draws TOMORROW's weather, so the day's record would carry tomorrow's count"],
      [cur >= 0 && w > cur && tomorrow > w, `Game.advanceWind does not count today's storm after the forecast becomes today and before tomorrow is drawn (forecast→today at ${cur}, count at ${w}, tomorrow's draw at ${tomorrow})`],
      [named === namedHere && where.length === 0, `the storm count is named ${named} time(s) in src/, ${named - namedHere} outside rollStorm / Game.advanceWind / Game.beginDay / the constructor${where.length ? " — in " + where.join(", ") : ""}`],
    ]);
  }
  // 2. THE RECORD IS THE ONE ANSWER
  {
    const chooser = chooserText(util);
    const idStmt = (chooser.match(/\bconst\s+id\s*=([\s\S]*?);/) || [])[1] || "";
    const fields = [...new Set([...idStmt.matchAll(/\be\.(\w+)/g)].map(m => m[1]))];
    const foreign = idStmt.replace(/\be\.\w+/g, "").replace(/"[^"]*"/g, "").match(/[A-Za-z_$][\w$.]*/g) || [];
    const reads = src.reduce((a, [, s]) => a + count(s, /\.streak\b/), 0), keys = src.reduce((a, [, s]) => a + count(s, /\bstreak\s*:/), 0);
    const names = STORM_IDS.map(id => [id, src.reduce((a, [, s]) => a + count(s, new RegExp(`["'\`]${esc(id)}["'\`]`)), 0), count(idStmt, new RegExp(`"${esc(id)}"`))]);
    rule([
      [keys === 1 && /\bt\s*:\s*"newround"[^}]*\bstreak\s*:\s*this\.stormStreak\s*[,}]/.test(day), `the day's record does not carry the count as it stands (streak: this.stormStreak) in Game.beginDay, or \`streak:\` is written ${keys} time(s) in src/`],
      [reads === 1 && /\be\.streak\b/.test(idStmt), `\`.streak\` is read ${reads} time(s) in src/ — only the day's line chooser (EVENT_NARRATION.newround) may`],
      [fields.includes("streak") && fields.every(f => ["storm", "streak", "windStreak"].includes(f)) && foreign.length === 0,
        `the day's line is chosen from ${JSON.stringify(fields)}${foreign.length ? " and " + JSON.stringify(foreign) : ""} — only the day's own storm, streak and wind streak may decide it`],
      [names.every(([, n, inId]) => n === 1 && inId === 1), `a storm line is named outside the day's line chooser: ${names.map(([id, n, inId]) => `${id} ×${n} (chooser ${inId})`).join(", ")}`],
    ]);
  }
  // 3 + 4. BEHAVIOUR
  const chooser = chooserText(util);
  let pick = null, pickErr = null;
  try { const f = new Function("DIRNAME", "say", `return e=>${chooser}`)(DIRNAME, say); pick = e => { const t = String(f(e).txt).replace(/<[^>]*>/g, ""); const hit = LINE_RX.find(([, rx]) => rx.test(t)); return hit ? hit[0] : `?? "${t}"`; }; }
  catch (e) { pickErr = e.message; }
  rule([behave(() => {
    if (!pick) return [false, `the day's line chooser could not be compiled (${pickErr})`];
    const bad = [], shown = [];
    for (const v of V) {
      let running = 0, fresh = 0, going = 0;
      const storms = [];
      for (const e of v.days) {
        running = e.storm ? running + 1 : 0;
        const id = pick(e);
        const want = !e.storm ? CALM_IDS : running === 1 ? ["day.storm"] : [e.windStreak >= 2 ? "day.stormStill" : "day.stormNow"];
        if (e.storm) { storms.push(`day ${e.round} ${id} (streak ${e.streak})`); if (running === 1) fresh++; else going++; }
        if (e.streak !== running || !want.includes(id)) bad.push(`seed ${v.seed} day ${e.round}: ${e.storm ? `storm ${running} day(s) running` : "calm"}, wind held ${e.windStreak} → ${id}, streak ${e.streak} (must be ${want.join(" or ")}, streak ${running})`);
      }
      if (!fresh || !going) bad.push(`seed ${v.seed} holds ${fresh} new storm(s) and ${going} continuing one(s) — it needs both, or this rule proves nothing`);
      shown.push(`${v.seed}: ${storms.join(", ") || "no storm"}`);
    }
    return [bad.length === 0, bad.length ? bad.slice(0, 6).join("; ") : "storm days — " + shown.join(" · ")];
  })]);
  rule([behave(() => {
    const bad = [];
    for (const v of V) {
      if (v.rolls.length !== v.days.length + 1) bad.push(`seed ${v.seed}: ${v.rolls.length} weather rolls for ${v.days.length} days (must be one per day, plus tomorrow's)`);
      let through = 0;
      v.days.forEach((e, k) => {
        const r = v.rolls[k];
        if (!r || r.spent !== 1 || r.read !== through || r.storm !== !!e.storm)
          bad.push(`seed ${v.seed} day ${e.round}: its roll ${r ? `spent ${r.spent} draw(s), read ${r.read} storm(s) running, drew ${r.storm ? "a storm" : "calm"}` : "never happened"} (must be 1 draw, ${through} running, ${e.storm ? "a storm" : "calm"})`);
        through = e.storm ? through + 1 : 0;
      });
    }
    return [bad.length === 0, bad.length ? bad.slice(0, 6).join("; ") : `every day's roll spent one draw and read the storms running through the day before (${V.map(v => `${v.seed}: ${v.days.length} days`).join(", ")})`];
  })]);
  return out;
}

const files = Object.fromEntries(walk("src").map(f => [f.split(path.sep).join("/"), fs.readFileSync(path.join(REPO, f), "utf8")]));
const NAMES = ["the count: written only by Game.advanceWind, after the forecast becomes today and before tomorrow is drawn; named only by the engine's weather steps",
  "the record: {t:\"newround\"} carries streak: this.stormStreak, and the day's line chooser is the one reader, deciding from the day's own storm, streak and wind",
  `seeds ${SEEDS.join(", ")}: a new storm gets day.storm, the second day in a row day.stormNow / day.stormStill, a calm day no storm line`,
  "the draw did not move: every day's roll spends one draw and reads the storms running through the day before"];
const real = rules(files);
console.log(`storm_continues_one_place — whether today's storm is a new one or a continuing one; seeds ${SEEDS.join(", ")} (${CAPTAINS.join("/")})`);
real.forEach((r, i) => console.log(`  ${r.ok ? "PASS" : "FAIL"}  ${i + 1}. ${NAMES[i]}${r.ok ? "" : "\n          " + r.bad.join("\n          ")}`));

/* RED-PROOF: each mutant is the real source with ONE copy put back (or one rule broken); every rule it names must go red. */
const broken = (...edits) => {
  const next = { ...files };
  for (const [file, from, to] of edits) { if (!next[file].includes(from)) return null; next[file] = next[file].replace(from, to); }
  return next;
};
const COUNT_LINE = "    this.stormStreak=cur.storm?(this.stormStreak||0)+1:0;\n";
const ROLL = "  const roll=g.r()<g.cfg.storm;\n  return (g.stormStreak||0)>=2?false:roll;\n";
const MUTANTS = [
  [[1, 3], "the old read-after-draw order put back (rollStorm writes the count as it draws tomorrow; beginDay reads it after)",
    broken([ENG, ROLL, "  const roll=g.r()<g.cfg.storm;\n  const storm=(g.stormStreak||0)>=2?false:roll;\n  g.stormStreak=storm?(g.stormStreak||0)+1:0;\n  return storm;\n"],
      [ENG, COUNT_LINE, ""], [ENG, "streak:this.stormStreak,", "streak:storm?this.stormStreak:0,"])],
  [[1, 4], "Game.advanceWind counting today's storm AFTER tomorrow is drawn",
    broken([ENG, COUNT_LINE, ""], [ENG, "    this.next=this.drawWeather();\n", "    this.next=this.drawWeather();\n" + COUNT_LINE])],
  [[1, 2], "a screen reading the engine's count instead of the day's record (appState.game.stormStreak in the line chooser)",
    broken([UTIL, ":e.streak>=2?(", ":appState.game.stormStreak>=2?("])],
  [[2], "the line chooser also calling a storm continuing when TOMORROW storms",
    broken([UTIL, ":e.streak>=2?(", ":(e.streak>=2||e.nextStorm)?("])],
  [[2], "a second chooser: the live day's header saying \"still blowin'\" itself when another storm is forecast",
    broken([ORCH, "    let header=describe(appState.game.events[appState.game.events.length-1]).txt;",
      "    let header=describe(appState.game.events[appState.game.events.length-1]).txt;\n    if(appState.game.stormNow&&appState.game.stormNext)header=say(\"day.stormStill\",{day:appState.game.round,dir:DIRNAME[appState.game.windNow]});"])],
  [[3], "a storm never counted as going on (the count reset to 1 every storm day)",
    broken([ENG, COUNT_LINE, "    this.stormStreak=cur.storm?1:0;\n"])],
  [[4], "tomorrow's roll skipped when the cap holds (no random draw spent — the seeded stream moves)",
    broken([ENG, ROLL, "  if((g.stormStreak||0)>=2)return false;\n  return g.r()<g.cfg.storm;\n"])],
];
let proofOk = true;
for (const [ns, what, mutant] of MUTANTS) {
  const res = mutant ? rules(mutant) : null;
  const red = !!res && ns.every(n => !res[n - 1].ok);
  if (res && process.argv.includes("--why")) res.forEach((r, i) => console.log(`        rule ${i + 1} ${r.ok ? "green" : "RED: " + r.bad.join(" | ")}`));
  if (!red) proofOk = false;
  console.log(`  ${red ? "PASS" : "FAIL"}  red-proof (rule ${ns.join(" + ")}): ${what} ${red ? "goes red" : mutant ? `STAYS GREEN on rule ${ns.filter(n => res[n - 1].ok).join(", ")} — the gate cannot see it` : "could not be built (the source moved)"}`);
}
const fails = real.filter(r => !r.ok).length;
console.log(fails || !proofOk ? `\nFAIL — ${fails} rule(s) broken${proofOk ? "" : ", and the red-proof did not hold"}` : `\nPASS — whether today's storm is new or going on is counted once, before tomorrow is drawn, and read by every screen off the day's record; ${real.length} rules, ${MUTANTS.length} mutants, each red`);
process.exit(fails || !proofOk ? 1 : 0);
