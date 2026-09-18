#!/usr/bin/env node
/* A FIGHT ON SCREEN — THE CAMERA HOLDS THE TWO SHIPS, LETS GO, AND THE SWORDS CLASH — THROUGH THE ONE DOOR, ON EVERY SCREEN.
   Architecture item 4 (.planning/ARCHITECTURE-AUDIT-2026-09-16.md), under Wyatt's ruling on "architectural" (DECISIONS.md, 2026-09-16).
   THE FAULT IT HOLDS SHUT: a fight's start and end were decided in five places, and two screens disagreed. The host held the camera and
   played the clash from its own fight (orchestrator.js asyncBattleRun) and let go in that fight's `finally`; a crew guest held the camera
   from every battle snapshot it drew (flow.js renderBattleFromSnap), played the clash on the first snapshot it heard (orchestrator.js
   applyBattleSnap) — which comes after the opening line and every crow's-nest call — and NOTHING EVER LET GO on a guest.
   MEASURED before the change in a two-window crew game: the guest's clash 4.4 s after its opening line, 9.6 s when the guest was asked for
   a crow's-nest call, 13.8 s when both humans were; the guest's hold never released, so for the rest of the voyage a line about a captain
   glided the host's camera onto that ship and left the guest's where it was.
   NOW: the engine records the fight called (`engage`, Game.beginBattle) and the fight over (`disengage`, Game.endBattle — after the
   crow's-nest calls are settled, the moment the host always let go), and the one event consumer holds and lets go on those two events on
   every screen; the clash is EVENT_SOUND.engage, sounded by the one dispatcher.
   RULES (comment-stripped source; each red-proofed below against a copy of the real source broken the way it guards against, in memory):
     1. THE CLASH, ONE DOOR — no playBattleEngage anywhere in src; EVENT_SOUND maps `engage` to the clash stem; nothing plays that stem by
        name. Behavioural: the audio module itself (real or mutant, imported) sounds the clash on engage for the whole table, and is
        silent on disengage.
     2. THE CAMERA, ONE DOOR — window.__pp4.battle( and .battleEnd( are each called exactly once in src, both inside consumeEvent: the
        hold on `engage` (e.a, e.d), armed before the event's sound is dispatched, and the release on `disengage`; stage.js writes S.battle
        only in the bridge's battle / battleEnd.
     3. BOTH FIGHTS CALL THE FIGHT BEFORE THEIR OPENING LINE, AND END IT — the engine alone records engage (beginBattle, before the powder)
        and disengage (endBattle), and its own fight ends in a finally; the watched fight begins, AWAITS THE DRAIN (every consumer on this
        screen has drawn `engage`, and the event has been published) and only then speaks its opening line; asyncBattle refuses an
        illegal attack before anything begins, and ends every fight it began in a finally that drains the ending. Behavioural: the
        engine's own beginBattle / endBattle / battle, compiled from the source onto real posed Games — a won fight, a null fight and a
        flee each record exactly one engage (the fight's first event, then its powder, naming both captains and the wind) and exactly one
        disengage (the fight's last event); a refused attack records neither. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { stripComments } from "./lib/strip_comments.mjs";
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const walk = d => fs.readdirSync(path.join(REPO, d), { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(d, e.name)) : e.name.endsWith(".js") ? [path.join(d, e.name)] : []);
const { Game, roundCfg } = await import(pathToFileURL(path.join(REPO, "src/engine/index.js")).href);

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
/* an engine METHOD definition — two-space indent, name, params, `{` — never a call; returns [params, inner body] */
function methodParts(src, name) {
  const m = new RegExp(`^  ${name}\\(([^)]*)\\)\\{`, "m").exec(src); if (!m) return null;
  const b = bodyFrom(src, m.index);
  return [m[1], b.slice(m[0].length, -1)];
}
const method = (src, name) => { const p = methodParts(src, name); return p ? p[1] : ""; };
const count = (s, re) => (s.match(re) || []).length;

/* posed table: captains 0 and 1 side by side on open water across the wind, the others far off; the fight's three steps compiled from
   the given engine source so a mutant's behaviour is what runs */
function posedFight(engSrc) {
  const M = {};
  for (const name of ["beginBattle", "endBattle", "battle"]) {
    const p = methodParts(engSrc, name); if (!p) throw new Error(`Game.${name} is missing`);
    M[name] = new Function(`return function(${p[0]}){${p[1]}}`)();
  }
  for (let s = 0; s < 80; s++) {
    const g = new Game(roundCfg(["bot", "bot", "bot", "bot"]), 4242 + s * 101, true);
    Object.assign(g, M);
    const n = g.cfg.grid, wet = c => !(g.blocked(c) || g.isIsland(c) || g.isHome(c) || g.onRim(c));
    for (let x = 1; x < n - 1; x++) for (let y = 1; y < n - 1; y++) {
      const a = [x, y], d = [x, y - 1];
      if (!wet(a) || !wet(d) || !wet([x + 1, y]) || !wet([x - 1, y])) continue;
      const [att, def, far, far2] = g.players;
      att.pos = a; def.pos = d; far.pos = [0, 0]; far2.pos = [n - 1, n - 1];
      g.players.forEach(pl => { pl.done = false; pl.baking = false; pl.coins = 20; });
      def.ing = [g.ings[0]]; att.ing = [];
      g.windNow = "E";
      g.events.length = 0;
      return { g, att, def };
    }
  }
  throw new Error("no board in 80 seeds could pose two captains side by side on open water");
}

async function rules(files) {
  const code = Object.fromEntries(Object.entries(files).map(([f, s]) => [f, stripComments(s)]));
  const all = Object.entries(code);
  const orch = code["src/orchestrator.js"], audio = code["src/ui/audio.js"], stage = code["src/ui/stage.js"], eng = code["src/engine/index.js"];
  const out = [], rule = (ok, pass, fail) => out.push({ ok, text: ok ? pass : fail });

  // 1. THE CLASH, ONE DOOR
  const named = all.filter(([, s]) => /\bplayBattleEngage\b/.test(s)).map(([f]) => f);
  const map = (/const\s+EVENT_SOUND\s*=\s*\{([\s\S]*?)\n\};/.exec(audio) || [, ""])[1];
  const mapped = /(?:^|[\s,{])engage\s*:\s*BATTLE_ENGAGE_SOUND\b/.test(map) && /const\s+BATTLE_ENGAGE_SOUND\s*=\s*"battle-swords"/.test(audio);
  const byName = all.reduce((n, [, s]) => n + count(s, /\bplay\s*\(\s*(?:BATTLE_ENGAGE_SOUND\b|["'`]battle-swords["'`])/g), 0);
  let heard = false, hearWhy = "";
  try {
    const A = await import("data:text/javascript;base64," + Buffer.from(files["src/ui/audio.js"]).toString("base64"));
    const s = A.soundForEvent({ t: "engage", a: 0, d: 1 }), e = A.soundForEvent({ t: "disengage", a: 0, d: 1 });
    heard = !!(s && s.name === "battle-swords" && !s.localOnly) && e === null && A.EVENT_SOUND.disengage === null;
    hearWhy = `engage → ${JSON.stringify(s)}, disengage → ${JSON.stringify(e)}`;
  } catch (err) { hearWhy = "the audio module could not be imported: " + err.message; }
  rule(named.length === 0 && mapped && byName === 0 && heard,
    `the clash has one door: EVENT_SOUND.engage, the clash stem heard by the whole table, sounded by the one dispatcher; no playBattleEngage, nothing plays the stem by name, a fight's end is silent (${hearWhy})`,
    `the clash has another door${named.length ? " — playBattleEngage is in " + named.join(", ") : ""}${mapped ? "" : " — EVENT_SOUND does not map engage to BATTLE_ENGAGE_SOUND (\"battle-swords\")"}${byName ? ` — the clash stem is played by name ${byName} time(s)` : ""}${heard ? "" : ` — the audio module does not sound the clash on engage for every screen and nothing on disengage (${hearWhy})`}`);

  // 2. THE CAMERA, ONE DOOR
  const consume = fn(orch, "consumeEvent");
  const holds = all.reduce((n, [, s]) => n + count(s, /__pp4\s*\.\s*battle\s*\(/g), 0);
  const lets = all.reduce((n, [, s]) => n + count(s, /\.\s*battleEnd\s*\(/g), 0);
  /* RE-ANCHORED BY ARCHITECTURE ITEM 25 (2026-09-18): the hold carries the fight's WIND as well as its two ships, and the stage's slot
     is [attacker, defender, wind]. Both spellings are asserted here rather than loosened, because the wind's one reading now travels
     through this same door — a hold that drops it sends the flip ceremony back to working the wind out from its own board. */
  const holdAt = consume.search(/e\.t\s*===\s*"engage"[^;\n]*__pp4\s*\.\s*battle\s*\(\s*e\.a\s*,\s*e\.d\s*,[^;\n]*e\.downwind/);
  const letAt = consume.search(/e\.t\s*===\s*"disengage"[^;\n]*__pp4\s*\.\s*battleEnd\s*\(\s*\)/);
  const soundAt = consume.search(/\bplayForEvent\s*\(/);
  const writes = count(stage, /\bS\.battle\s*=(?!=)/g);
  const bridge = /\bbattle\s*:\s*\([^)]*\)\s*=>\s*\{[^}]*S\.battle\s*=\s*\[\s*a\s*,\s*d\s*,[^\]]*\][^}]*\}\s*,\s*battleEnd\s*:\s*\(\s*\)\s*=>\s*\{\s*S\.battle\s*=\s*null\s*;?\s*\}/.test(stage);
  rule(holds === 1 && lets === 1 && holdAt >= 0 && letAt >= 0 && soundAt > holdAt && writes === 2 && bridge,
    "the fight camera has one door: consumeEvent holds both ships AND the fight's wind on `engage` (before the event's sound) and lets go on `disengage`, on every screen; nothing else holds or lets go, and only the stage bridge writes the hold",
    `the fight camera is held from ${holds} place(s) and let go from ${lets} in src${holdAt < 0 ? " — consumeEvent does not hold on engage (e.a, e.d, e.downwind)" : ""}${letAt < 0 ? " — consumeEvent does not let go on disengage" : ""}${holdAt >= 0 && soundAt <= holdAt ? " — the hold is armed after the event's sound" : ""}${writes !== 2 || !bridge ? ` — stage.js writes S.battle ${writes} time(s), not only in the bridge, or the slot no longer carries the wind` : ""}`);

  // 3. BOTH FIGHTS CALL THE FIGHT BEFORE THEIR OPENING LINE, AND END IT
  const begin = method(eng, "beginBattle"), end = method(eng, "endBattle"), headless = method(eng, "battle");
  const engageAt = begin.search(/this\.ev\(\{\s*t\s*:\s*"engage"\s*,\s*a\s*:\s*att\.idx\s*,\s*d\s*:\s*def\.idx\s*,\s*downwind\b/), powderAt = begin.search(/this\.payPowder\(/);
  const recorded = t => all.reduce((n, [, s]) => n + count(s, new RegExp(`\\bt\\s*:\\s*"${t}"`, "g")), 0);
  const ended = /this\.ev\(\{\s*t\s*:\s*"disengage"\s*,\s*a\s*:\s*att\.idx\s*,\s*d\s*:\s*def\.idx/.test(end);
  const headlessEnds = /\bfinally\s*\{\s*this\.endBattle\(\s*att\s*,\s*def\s*\)/.test(headless);
  const run = fn(orch, "asyncBattleRun"), wrap = fn(orch, "asyncBattle");
  const bAt = run.search(/\.beginBattle\(\s*att\s*,\s*def\s*\)/), drainAt = run.search(/await\s+liveRender\(\s*\)/), openAt = run.search(/await\s+flash\(\s*opening\.html/);
  /* ⚠ ANCHORED ON THE BEAT, NOT ON THE LINE'S NAME. This read `/"battle\.opening"/` until
     2026-09-18, when Wyatt had the opening beat say "{a} loads the cannon…" instead — the ORDER
     this rule exists to guard (begin -> drain -> speak) was untouched and the gate still went red,
     because it was looking for a string rather than for the thing the string was in. Same fault as
     the parity gate that anchored on local variable names. What is load-bearing is that the fight
     SPEAKS after the drain; which words it speaks is his. */
  const refusedFirst = wrap.search(/if\s*\(\s*!\s*appState\.game\.canAttack\(\s*att\s*,\s*def\s*\)\s*\)\s*return\s+null/), tryAt = wrap.search(/\btry\s*\{\s*return\s+await\s+asyncBattleRun\(\s*att\s*,\s*def\s*\)/);
  const wrapEnds = /\bfinally\s*\{\s*appState\.game\.endBattle\(\s*att\s*,\s*def\s*\)\s*;\s*liveRender\(\s*\)/.test(wrap);
  const order = bAt >= 0 && drainAt > bAt && openAt > drainAt && refusedFirst >= 0 && tryAt > refusedFirst && wrapEnds;
  let beh = false, why = "";
  try {
    const seen = [];
    for (const [label, faces] of [["a won fight", [true, false]], ["a null fight", [true, true]], ["a flee", [false, false]]]) {
      const { g, att, def } = posedFight(files["src/engine/index.js"]);
      let k = 0; g.flip = () => faces[Math.min(k++, faces.length - 1)];
      g.botWantsFlee = () => true; g.wantsRefire = () => false;
      g.battle(att, def);
      const ty = g.events.map(e => e.t), eg = g.events.filter(e => e.t === "engage"), dg = g.events.filter(e => e.t === "disengage");
      seen.push({ label, ty: ty.join(">"), ok: eg.length === 1 && dg.length === 1 && ty[0] === "engage" && ty[1] === "powder" && ty[ty.length - 1] === "disengage"
        && eg[0].a === att.idx && eg[0].d === def.idx && eg[0].downwind === g.downwindSide(att, def) && dg[0].a === att.idx && dg[0].d === def.idx
        && ty.includes(label === "a won fight" ? "battle" : label === "a null fight" ? "battlenull" : "battleflee") });
    }
    const R = posedFight(files["src/engine/index.js"]); R.def.ing = [];
    R.g.battle(R.att, R.def);
    seen.push({ label: "a refused attack", ty: R.g.events.map(e => e.t).join(">"), ok: R.g.events.length === 0 });
    beh = seen.every(s => s.ok); why = seen.map(s => `${s.label}: ${s.ty || "nothing"}`).join(" · ");
  } catch (e) { why = "the engine's fight could not be run: " + e.message; }
  rule(engageAt >= 0 && powderAt > engageAt && ended && recorded("engage") === 1 && recorded("disengage") === 1 && headlessEnds && order && beh,
    `both fights call the fight before their opening line and end it: the engine alone records engage (beginBattle, before the powder) and disengage (endBattle, its own fight in a finally); the watched fight drains the call before it speaks and ends every fight it began in a finally (posed — ${why})`,
    `a fight is called or ended outside the engine's pair of steps, or the watched fight speaks before the call is drawn${engageAt >= 0 && powderAt > engageAt ? "" : " — beginBattle does not record engage (both captains and the wind) before the powder"}${ended ? "" : " — endBattle does not record disengage"}${recorded("engage") === 1 && recorded("disengage") === 1 ? "" : ` — engage is recorded ${recorded("engage")}x and disengage ${recorded("disengage")}x in src`}${headlessEnds ? "" : " — the engine's own fight does not end in a finally"}${bAt >= 0 && drainAt > bAt && openAt > drainAt ? "" : " — asyncBattleRun does not begin, await the drain, then speak its opening line, in that order"}${refusedFirst >= 0 && tryAt > refusedFirst && wrapEnds ? "" : " — asyncBattle does not refuse an illegal attack first and end the fight in a finally that drains it"}${beh ? "" : " — posed: " + why}`);
  return out;
}

const files = Object.fromEntries(walk("src").map(f => [f.split(path.sep).join("/"), fs.readFileSync(path.join(REPO, f), "utf8")]));
const real = await rules(files);
for (const r of real) console.log(`  ${r.ok ? "PASS" : "FAIL"}  ${r.text}`);

/* RED-PROOF: each rule must go red on a copy of the real source broken the way it guards against (in memory; nothing is written). */
const broken = (file, from, to) => { const f = { ...files }; if (!f[file] || !f[file].includes(from)) return null; f[file] = f[file].replace(from, () => to); return f; };
const MUTANTS = [
  ["playBattleEngage(); back in the watched fight, before its opening line (the audit's own mutant)",
    broken("src/orchestrator.js", "  const F=appState.game.beginBattle(att,def);", "  playBattleEngage();\n  const F=appState.game.beginBattle(att,def);"), 0],
  ["the clash taken off the engage event (EVENT_SOUND.engage silent)",
    broken("src/ui/audio.js", "engage: BATTLE_ENGAGE_SOUND,", "engage: null,"), 0],
  ["window.__pp4.battle(snap.attIdx,snap.defIdx) back in renderBattleFromSnap (the audit's own mutant)",
    broken("src/ui/flow.js", "  netHandlers().onRenderBattle(", "  if(window.__pp4)window.__pp4.battle(snap.attIdx,snap.defIdx);\n  netHandlers().onRenderBattle("), 1],
  ["the host's own release back in asyncBattle's finally",
    broken("src/orchestrator.js", "  finally{ appState.game.endBattle(att,def); liveRender(); }", "  finally{ appState.game.endBattle(att,def); liveRender(); if(window.__pp4&&window.__pp4.battleEnd)window.__pp4.battleEnd(); }"), 1],
  ["the consumer letting go on the fight's outcome instead of when the whole fight is over",
    broken("src/orchestrator.js", `if(e.t==="disengage"&&window.__pp4&&window.__pp4.battleEnd)`, `if((e.t==="battle"||e.t==="battlenull"||e.t==="battleflee")&&window.__pp4&&window.__pp4.battleEnd)`), 1],
  ["the watched fight speaking its opening line before the call is drawn (the drain not awaited)",
    null, 2],   // built below from the real text
  ["the engine no longer recording the fight being called",
    broken("src/engine/index.js", `    this.ev({t:"engage",a:att.idx,d:def.idx,downwind});\n`, ""), 2],
  ["the engine's own fight ending only when it is won (no finally)",
    broken("src/engine/index.js", "    }finally{this.endBattle(att,def);}", "    }finally{}"), 2],
];
/* the drain mutant needs the awaited drain REMOVED, not a second one added — built here from the real text */
{
  const o = files["src/orchestrator.js"], run = fn(o, "asyncBattleRun"), cut = run.replace(/\n  await liveRender\(\);\n/, "\n  liveRender();\n");
  MUTANTS[5][1] = cut !== run ? { ...files, "src/orchestrator.js": o.replace(run, () => cut) } : null;
}
let proofOk = true;
for (const [what, mutant, idx] of MUTANTS) {
  const res = mutant ? await rules(mutant) : null;
  const red = !!res && !!res[idx] && !res[idx].ok;          // the rule that guards against THIS break, not merely any rule
  if (!red) proofOk = false;
  console.log(`  ${red ? "PASS" : "FAIL"}  red-proof: ${what} ${red ? "goes red" : mutant ? "STAYS GREEN — the gate cannot see it" : "could not be built (the source moved)"}`);
}
const fails = real.filter(r => !r.ok).length;
console.log(fails || !proofOk ? `\nFAIL — ${fails} rule(s) broken${proofOk ? "" : ", and the red-proof did not hold"}`
  : `\nPASS — a fight on screen is held, let go and heard through the one door on every screen; ${real.length} rules, each red-proofed`);
process.exit(fails || !proofOk ? 1 : 0);
