#!/usr/bin/env node
/* THE WIND A SHOT WAS FIRED IN IS READ ONCE, BY THE ENGINE, AND EVERY SCREEN IS HANDED IT.  (architecture item 25, 2026-09-18)
 *
 * Wyatt's ruling on "architectural" (DECISIONS.md, 2026-09-16): name the fact, count every place that decides it, make the count ONE,
 * and gate it, red-proofed. THE FACT: which ship is firing downwind in this fight — the rule that settles a two-heads round, said by
 * the fight's first line ("⬇ HOSTCAP FIRES DOWNWIND — WINS TIES" / "CROSSWIND · ties collide") and by the flip stage's stakes line
 * ("HostCap is firin' downwind — two heads and the tie is theirs.").
 *
 * BEFORE (count 4): src/engine/index.js beginBattle read it once and recorded it (`engage`, and on the fight) — the truth; and then
 *   src/orchestrator.js renderBattle, src/ui/stage.js's ceremony and src/ui/flow.js's bot crow's-nest caller each read it AGAIN, out of
 *   `appState.game` — that is, out of the positions and wind on the board THE SCREEN DRAWING IT happened to be holding. Nothing in src/
 *   ever set the `o.dw` the renderer preferred, so its fallback fired on every screen, always.
 *
 * WHY THAT IS NOT A PEDANTRY. A guest's board is mirrored inside the one event consumer, which is a queue; the fight's words arrive on
 * a different wire and are drawn the moment they land. MEASURED in a two-window crew room (host 1200x950, guest iPhone-13-mini 375x812
 * dsf3), one fight, the guest's signal dropped for 3.9 s the way a phone's does:
 *     host  +4.56 s  "HostCap — ye load the cannon… / ⬇ HOSTCAP FIRES DOWNWIND — WINS TIES"   (on screen 4.56-9.20 s)
 *     guest +4.90 s  "HostCap loads the cannon… / CROSSWIND · ties collide"                    (on screen 4.90-5.50 s)
 *     guest +11.1 s  the flip stage: "HostCap is firin' downwind — two heads and the tie is theirs."
 *   (all four numbers are ONE run — the guest's own board did not catch up with the fight until +5.13 s, 230 ms after it had spoken.)
 *   The engine had recorded downwind="a" (the host) on the `engage` event. Two of the three readings were wrong, both on the phone, and
 *   they disagreed with each other. It also happens with nothing dropped at all: 2026-09-17, a plain crew room, item 8's own before-run
 *   (host "⬇ HOSTCAP FIRES DOWNWIND — WINS TIES" 4.36-8.98 s, guest "CROSSWIND · ties collide" 4.41-8.95 s — four and a half seconds of
 *   both screens contradicting each other about the same shot).
 *
 * AFTER (count 1): Game.beginBattle reads it once and records it on the `engage` event and on the fight object. From there it is CARRIED,
 *   never re-read: asyncBattleRun puts `dw` on every publish, battleSnapshot puts it on the wire, renderBattle says it; the one event
 *   consumer hands it to the stage with the pair (S.battle = [attacker, defender, wind]) and the ceremony says that; collectSideBets is
 *   handed it for the bot caller. A screen that was not told does not guess — absent means crosswind, which is what the engine's own null
 *   means and what Firebase leaves behind when it deletes a null field.
 *
 * RULES (each red-proofed below, in memory; comments never count as code):
 *   1. downwindSide is named ONLY in the engine — its definition and the one call in beginBattle. Nothing in src/ui or the orchestrator.
 *   2. renderBattle SAYS the wind it was handed: it reads o.dw and never works one out (no downwindSide, no windNow, no DIRS, no
 *      appState.game).
 *   3. the fight carries it: asyncBattleRun's publish shape holds dw:F.downwind, and battleSnapshot carries "dw" across the wire.
 *   4. the one door hands it to the stage: consumeEvent's hold is __pp4.battle(e.a, e.d, e.downwind), and the stage's slot is a triple
 *      dropped whole by battleEnd.
 *   5. the ceremony says the stored wind (S.battle[2]) and never works one out.
 *   6. POSED AND RUN, on the real engine: beginBattle reads the wind once and records it on `engage` and on the fight; moving both ships
 *      afterwards changes neither.
 *   7. POSED AND RUN, through the wire and the real renderer: the wind survives battleSnapshot, and renderBattle names the captain the
 *      ENGINE named on a screen whose own board would name the other one — and a crosswind stays a crosswind on a board that would call
 *      it downwind.
 *   8. the bot crow's-nest caller is handed the fight's wind (collectSideBets(att, def, downwind)) and asyncBattleRun passes F.downwind.
 *
 * House convention: no test runner, one PASS/FAIL line per rule, every rule runs before exit.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const ENG = "src/engine/index.js", ORCH = "src/orchestrator.js", FLOW = "src/ui/flow.js", STAGE = "src/ui/stage.js";
const walk = d => fs.readdirSync(path.join(REPO, d), { withFileTypes: true })
  .flatMap(e => e.isDirectory() ? walk(path.join(d, e.name)) : e.name.endsWith(".js") ? [path.join(d, e.name)] : []);
const strip = s => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`\\])\/\/[^\n]*/g, "$1");
function bodyAt(src, h) {
  if (h < 0) return "";
  let j = src.indexOf("(", h), d = 0;
  for (; j < src.length; j++) { if (src[j] === "(") d++; else if (src[j] === ")") { d--; if (!d) break; } }
  j = src.indexOf("{", j); d = 0;
  for (; j < src.length; j++) { if (src[j] === "{") d++; else if (src[j] === "}") { d--; if (!d) break; } }
  return src.slice(h, j + 1);
}
const fnBody = (src, head) => bodyAt(src, src.indexOf(head));
const methodRe = name => new RegExp(`^  ${name}\\(([^)]*)\\)\\{`, "m");
const method = (eng, name) => { const m = eng.match(methodRe(name)); return m ? bodyAt(eng, m.index) : ""; };
const count = (s, re) => (s.match(re) || []).length;

/* The real function, run as written, with only its outside world stubbed — the shape scripts/qa/fight_lines_not_filtered_check.mjs
   uses. Any name it reaches that is not stubbed resolves to the real global, so an unexpected dependency throws here instead of
   passing quietly. */
function realFunction(src, head, stubs) {
  const fn = fnBody(src, head).replace(/^export\s+/, "");
  if (!fn) return null;
  const scope = new Proxy({}, {
    has: (_, k) => typeof k === "string" && k !== "undefined",
    get: (_, k) => (k === Symbol.unscopables ? undefined : (Object.prototype.hasOwnProperty.call(stubs, k) ? stubs[k] : globalThis[k])),
  });
  return new Function("scope", `with(scope){ return (${fn}); }`)(scope);
}
/* The real ENGINE on a real board, with one method recompiled from the source under test, so the behavioural rule runs what the
   source says rather than what the module happens to export. */
const { Game, roundCfg } = await import(pathToFileURL(path.join(REPO, ENG)).href);
const { man } = await import(pathToFileURL(path.join(REPO, "src/shared/index.js")).href);
function posedDownwindFight(engSrc) {
  const m = engSrc.match(methodRe("beginBattle"));
  if (!m) throw new Error("Game.beginBattle is missing");
  const b = bodyAt(engSrc, m.index), inner = b.slice(m[0].length, -1);
  const beginBattle = new Function("man", `return function(${m[1]}){${inner}}`)(man);
  for (let s = 0; s < 80; s++) {
    const g = new Game(roundCfg(["bot", "bot", "bot", "bot"]), 7331 + s * 97, true);
    g.beginBattle = beginBattle;
    const n = g.cfg.grid, wet = c => !(g.blocked(c) || g.isIsland(c) || g.isHome(c) || g.onRim(c));
    for (let x = 2; x < n - 2; x++) for (let y = 2; y < n - 2; y++) {
      const a = [x, y], d = [x, y - 1];
      if (!wet(a) || !wet(d)) continue;
      const [att, def, far, far2] = g.players;
      att.pos = a; def.pos = d; far.pos = [0, 0]; far2.pos = [n - 1, n - 1];
      g.players.forEach(p => { p.done = false; p.baking = false; p.coins = 20; });
      def.ing = [g.ings[0]]; att.ing = [];
      g.windNow = "N";                 // the defender one square north: the ATTACKER fires downwind
      g.events.length = 0;
      return { g, att, def };
    }
  }
  throw new Error("no board in 80 seeds could pose two captains one square apart along the wind — the probe cannot reach its subject");
}

function rules(files) {
  const S = Object.fromEntries(Object.entries(files).map(([f, s]) => [f, strip(s)]));
  const eng = S[ENG], orch = S[ORCH], flow = S[FLOW], stage = S[STAGE];
  const out = [], rule = (ok, pass, fail) => out.push({ ok, text: ok ? pass : fail });

  // 1. ONE PLACE NAMES THE WIND
  const outside = Object.entries(S).filter(([f, s]) => f !== ENG && /\bdownwindSide\b/.test(s)).map(([f]) => f);
  const inEngine = count(eng, /\bdownwindSide\b/g);
  const inBegin = /this\.downwindSide\(\s*att\s*,\s*def\s*\)/.test(method(eng, "beginBattle"));
  rule(!outside.length && inEngine === 2 && inBegin,
    "downwindSide is named twice in src/ and both are the engine's: its definition, and the one reading Game.beginBattle takes",
    [outside.length && `a screen works the wind out for itself again, in ${outside.join(", ")}`,
     inEngine !== 2 && `downwindSide is named ${inEngine} time(s) in the engine, not 2 (its definition and beginBattle's one call)`,
     !inBegin && "Game.beginBattle does not read the wind for the fight it is starting"].filter(Boolean).join("; "));

  // 2. renderBattle SAYS THE WIND IT WAS HANDED
  const rb = fnBody(orch, "export function renderBattle(");
  const rbDerives = [/\bdownwindSide\b/, /\bwindNow\b/, /\bDIRS\b/, /appState\s*\.\s*game/].filter(re => re.test(rb)).map(re => re.source);
  rule(!!rb && /\bo\.dw\b/.test(rb) && /battle\.downwindTag/.test(rb) && /battle\.crosswindTag/.test(rb) && !rbDerives.length,
    "the fight's first line says the wind it was handed (o.dw) and works none out for itself",
    !rb ? "renderBattle not found in src/orchestrator.js — this gate pointed at nothing"
      : rbDerives.length ? `renderBattle works the wind out from this screen's own board again (${rbDerives.join(", ")}) — on a guest that board is behind its event queue`
      : "renderBattle no longer says a wind at all — o.dw, battle.downwindTag and battle.crosswindTag must all be in it");

  // 3. THE FIGHT CARRIES IT — on every publish, and across the wire
  const run = fnBody(orch, "async function asyncBattleRun(");
  const onPublish = /const\s+base\s*=\s*o\s*=>\s*Object\.assign\(\{[^}]*\bdw\s*:\s*F\.downwind\b/.test(run);
  const snapFn = fnBody(flow, "export function battleSnapshot(");
  const onWire = /\bfor\s*\(\s*const\s+k\s+of\s*\[[^\]]*"dw"[^\]]*\]/.test(snapFn);
  rule(onPublish && onWire,
    "the fight puts the engine's reading on every publish (dw:F.downwind) and battleSnapshot carries it across the wire",
    [!onPublish && "asyncBattleRun's publish shape does not carry dw:F.downwind — every screen would have to guess",
     !onWire && "battleSnapshot does not carry \"dw\" — a guest is handed the fight's words with no wind in them"].filter(Boolean).join("; "));

  // 4. THE ONE DOOR HANDS IT TO THE STAGE
  const consume = fnBody(orch, "export async function consumeEvent(") || fnBody(orch, "async function consumeEvent(");
  const hold = /e\.t\s*===\s*"engage"[^;\n]*__pp4\s*\.\s*battle\s*\(\s*e\.a\s*,\s*e\.d\s*,[^;\n]*e\.downwind/.test(consume);
  const slot = /\bbattle\s*:\s*\([^)]*\)\s*=>\s*\{[^}]*S\.battle\s*=\s*\[\s*a\s*,\s*d\s*,[^\]]*\][^}]*\}\s*,\s*battleEnd\s*:\s*\(\s*\)\s*=>\s*\{\s*S\.battle\s*=\s*null\s*;?\s*\}/.test(stage);
  rule(!!consume && hold && slot,
    "the one event consumer hands the stage the fight's wind with its two ships (__pp4.battle(e.a, e.d, e.downwind)), and the stage keeps all three in one slot that battleEnd drops whole",
    !consume ? "consumeEvent not found in src/orchestrator.js — this gate pointed at nothing"
      : [!hold && "consumeEvent's hold on `engage` does not carry e.downwind — the stage would be left to work the wind out itself",
         !slot && "the stage's bridge no longer stores [attacker, defender, wind] in one slot cleared by battleEnd"].filter(Boolean).join("; "));

  // 5. THE CEREMONY SAYS THE STORED WIND
  const cer = (stage.match(/if\s*\(\s*!fm\s*&&\s*S\.battle[\s\S]{0,1200}/) || [""])[0];
  const cerDerives = [/\bdownwindSide\b/, /\bwindNow\b/, /\bDIRS\b/].filter(re => re.test(cer)).map(re => re.source);
  rule(!!cer && /S\.battle\s*\[\s*2\s*\]/.test(cer) && !cerDerives.length,
    "the flip stage's stakes line says the wind the fight was called in (S.battle[2]) and works none out for itself",
    !cer ? "the ceremony's `!fm && S.battle` block was not found — this gate pointed at nothing"
      : cerDerives.length ? `the ceremony works the wind out from this screen's own board again (${cerDerives.join(", ")})`
      : "the ceremony no longer reads the wind the fight was called in (S.battle[2])");

  // 6. POSED AND RUN — the engine reads it once, records it, and does not re-read it
  let r6 = null;
  try {
    const { g, att, def } = posedDownwindFight(files[ENG]);
    const truth = g.downwindSide(att, def);
    const fight = g.beginBattle(att, def);
    const ev = g.events.find(e => e.t === "engage");
    const before = { fight: fight && fight.downwind, ev: ev && ev.downwind };
    att.pos = [att.pos[0] + 1, att.pos[1]];          // the board moves under the fight; the reading must not
    def.pos = [def.pos[0] + 2, def.pos[1] + 2];
    const after = { fight: fight && fight.downwind, ev: g.events.find(e => e.t === "engage").downwind, board: g.downwindSide(att, def) };
    r6 = (truth === "a" && before.fight === "a" && before.ev === "a" && after.fight === "a" && after.ev === "a" && after.board !== "a")
      ? null
      : `posed downwind fight: the engine says ${JSON.stringify(truth)}, the fight carries ${JSON.stringify(before.fight)}, the engage event ${JSON.stringify(before.ev)}; after both ships moved they read ${JSON.stringify(after.fight)} / ${JSON.stringify(after.ev)} and the board says ${JSON.stringify(after.board)}`;
  } catch (e) { r6 = "the posed fight threw: " + e.message; }
  rule(!r6,
    "posed and run: Game.beginBattle reads the wind once, carries it on the fight and records it on the `engage` event — and moving both ships afterwards changes neither",
    r6 || "");

  // 7. POSED AND RUN — through the wire and the real renderer, on a screen whose own board disagrees
  let r7 = null;
  try {
    const att = { idx: 0 }, def = { idx: 1 };
    const say = (id, f) => id === "battle.downwindTag" ? `DOWNWIND:${f.name}` : id === "battle.crosswindTag" ? "CROSSWIND" : `L:${id}`;
    const pname = i => `CAP${i}`;
    const snapshot = realFunction(files[FLOW], "export function battleSnapshot(", {});
    if (!snapshot) throw new Error("battleSnapshot not found in src/ui/flow.js");
    const draw = (dw, boardSays, pair) => {
      globalThis.battleLineSaid = null;                                   // a fresh screen for each pose
      const drawn = [];
      const render = realFunction(files[ORCH], "export function renderBattle(", {
        appState: { replaying: false, game: { downwindSide: () => boardSays } },
        say, pname, window: { __pp4: { flash: html => drawn.push(html) } },
      });
      if (!render) throw new Error("renderBattle not found in src/orchestrator.js");
      const o = { att: pair[0], def: pair[1], round: 1, result: { id: "battle.loads", facts: {} }, dw };
      const snap = snapshot(o);
      if (snap.dw == null) delete snap.dw;                                // Firebase deletes a null field: the wire really does this
      render(Object.assign({ att: pair[0], def: pair[1] }, snap));
      return drawn.join(" | ");
    };
    /* the engine gave the wind to the ATTACKER; this screen's board would give it to the defender */
    const a = draw("a", "d", [att, def]);
    /* a crosswind fight on a screen whose board would call it downwind */
    const b = draw(null, "a", [{ idx: 2 }, { idx: 3 }]);
    const okA = /DOWNWIND:CAP0/.test(a) && !/DOWNWIND:CAP1/.test(a) && !/CROSSWIND/.test(a);
    const okB = /CROSSWIND/.test(b) && !/DOWNWIND/.test(b);
    r7 = okA && okB ? null
      : `on a screen whose board disagreed, the fight's first line read ${JSON.stringify(a)} (wanted the attacker, CAP0) and a crosswind fight read ${JSON.stringify(b)} (wanted CROSSWIND)`;
  } catch (e) { r7 = "the posed line threw: " + e.message; }
  rule(!r7,
    "posed and run: the wind survives battleSnapshot, and the fight's first line names the captain the ENGINE named even when this screen's own board names the other one — and a crosswind stays a crosswind",
    r7 || "");

  // 8. THE BOT CROW'S-NEST CALLER IS HANDED IT
  const sig = /export async function collectSideBets\(\s*att\s*,\s*def\s*,\s*downwind\s*\)/.test(flow);
  const bets = fnBody(flow, "export async function collectSideBets(");
  const usesIt = /\bfav\s*=\s*downwind\s*\|\|/.test(bets);
  const passed = /collectSideBets\(\s*att\s*,\s*def\s*,\s*F\.downwind\s*\)/.test(run);
  rule(sig && usesIt && passed,
    "the bot crow's-nest caller is handed the fight's wind (collectSideBets(att, def, downwind)) and asyncBattleRun passes F.downwind",
    [!sig && "collectSideBets no longer takes the fight's wind",
     !usesIt && "the bot caller no longer favours the ship the FIGHT says is downwind",
     !passed && "asyncBattleRun does not pass F.downwind to collectSideBets — the caller would have to read the board itself"].filter(Boolean).join("; "));

  return out;
}

const files = Object.fromEntries(walk("src").map(f => [f.split(path.sep).join("/"), fs.readFileSync(path.join(REPO, f), "utf8")]));
const real = rules(files);
for (const r of real) console.log(`  ${r.ok ? "PASS" : "FAIL"}  ${r.text}`);

/* RED-PROOF — each break must turn the rule that guards against it red, not merely some rule. Every rule below has at least one
   mutant that turns IT red and nothing weaker: a case nobody can turn red is decoration, not evidence. */
const broken = (file, from, to) => { if (!files[file] || !files[file].includes(from)) return null; return { ...files, [file]: files[file].replace(from, () => to) }; };
const OLD_WIND_LINE = `    const wind=o.dw==null?say("battle.crosswindTag",{}):say("battle.downwindTag",{name:pname(o.dw==="a"?o.att.idx:o.def.idx).toUpperCase()});`;
const MUTANTS = [
  ["the ceremony asking the board again (g.downwindSide(A, D))",
    broken(STAGE, "      const dw = S.battle[2];", "      const dw = A && D && g.downwindSide ? g.downwindSide(A, D) : null;"), [0, 4]],
  ["the ceremony working the wind out from positions and windNow, without naming downwindSide",
    broken(STAGE, "      const dw = S.battle[2];", "      const dw = (A && D && g.windNow === 'N' && D.pos[1] - A.pos[1] === -1) ? 'a' : null;"), [4]],
  ["renderBattle's old fallback to this screen's own board",
    broken(ORCH, OLD_WIND_LINE,
      `    const dw=o.dw!==undefined?o.dw:(appState.game&&appState.game.downwindSide?appState.game.downwindSide(o.att,o.def):null);\n    const wind=dw==null?say("battle.crosswindTag",{}):say("battle.downwindTag",{name:pname(dw==="a"?o.att.idx:o.def.idx).toUpperCase()});`), [0, 1]],
  ["renderBattle asking the board outright, ignoring what it was handed",
    broken(ORCH, OLD_WIND_LINE,
      `    const dw=appState.game.downwindSide(o.att,o.def);\n    const wind=dw==null?say("battle.crosswindTag",{}):say("battle.downwindTag",{name:pname(dw==="a"?o.att.idx:o.def.idx).toUpperCase()});`), [0, 1, 6]],
  ["renderBattle re-deriving the wind from positions and windNow, without naming downwindSide",
    broken(ORCH, OLD_WIND_LINE,
      `    const dw=(appState.game.windNow==="N"&&o.def.pos[1]-o.att.pos[1]===-1)?"a":null;\n    const wind=dw==null?say("battle.crosswindTag",{}):say("battle.downwindTag",{name:pname(dw==="a"?o.att.idx:o.def.idx).toUpperCase()});`), [1]],
  ["the fight's publish shape losing dw:F.downwind",
    broken(ORCH, "const base=o=>Object.assign({att,def,a,d,round,need,dw:F.downwind},o);", "const base=o=>Object.assign({att,def,a,d,round,need},o);"), [2]],
  ["battleSnapshot no longer carrying \"dw\" across the wire",
    broken(FLOW, `"roleA","roleD","dw"]`, `"roleA","roleD"]`), [2, 6]],
  ["the one door holding the two ships but not the wind",
    broken(ORCH, "window.__pp4.battle(e.a,e.d,e.downwind==null?null:e.downwind);", "window.__pp4.battle(e.a,e.d);"), [3]],
  ["the stage's slot going back to a pair, with no room for the wind",
    broken(STAGE, "S.battle = [a, d, dw === undefined ? null : dw]; S.lock = false;", "S.battle = [a, d]; S.lock = false;"), [3]],
  ["the engine no longer recording the wind on the fight's `engage`",
    broken(ENG, `this.ev({t:"engage",a:att.idx,d:def.idx,downwind});`, `this.ev({t:"engage",a:att.idx,d:def.idx});`), [5]],
  ["asyncBattleRun no longer handing the bot caller the fight's wind",
    broken(ORCH, "collectSideBets(att,def,F.downwind)", "collectSideBets(att,def)"), [7]],
  ["the bot caller reading the board for itself again",
    broken(FLOW, "      const fav=downwind||(att.coins>=def.coins?\"a\":\"d\");", "      const fav=appState.game.downwindSide(att,def)||(att.coins>=def.coins?\"a\":\"d\");"), [0, 7]],
];
let proofOk = true;
for (const [what, mutant, idx] of MUTANTS) {
  let res = null;
  if (mutant) { try { res = rules(mutant); } catch (e) { res = null; } }
  const red = !!res && idx.every(i => !res[i].ok);
  if (!red) proofOk = false;
  console.log(`  ${red ? "PASS" : "FAIL"}  red-proof: ${what} ${red ? `turns rule${idx.length > 1 ? "s" : ""} ${idx.map(i => i + 1).join(", ")} red`
    : mutant ? (res ? `LEAVES rule(s) ${idx.filter(i => res[i].ok).map(i => i + 1).join(", ")} GREEN` : "threw while being measured") : "could not be built (the source moved)"}`);
}
const fails = real.filter(r => !r.ok).length;
console.log(fails || !proofOk
  ? `\nFAIL — ${fails} rule(s) broken${proofOk ? "" : ", and the red-proof did not hold"}`
  : `\nPASS — the wind a shot was fired in is read once, by the engine, and handed to every screen; ${real.length} rules, each red-proofed`);
process.exit(fails || !proofOk ? 1 : 0);
