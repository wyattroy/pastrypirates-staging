#!/usr/bin/env node
/* WHAT A WATCHING SCREEN FRAMES WHILE ANOTHER CAPTAIN TAKES THEIR TURN — ONE RULE, BOT OR HUMAN.
   Architecture item 46, and it is WYATT'S OWN RULING, given on 2026-09-17 against the recommendation
   Mac: Dev and Wy-Blade both put to him, in his words:
     "we cannot see other players sail squares (bots or humans) so ALL other players turns should be
      zoomed in on their boat for maximum immersion."
   (docs/INTENDED-BEHAVIOUR.md §0 · .claude/memory/DECISIONS.md, both 2026-09-17.)

   THE FAULT IT HOLDS SHUT — two places decided it, and which one you got depended on WHO the captain was:
     · ui/stage.js camFitSail: on a screen with no gold squares drawn — every screen but the chooser's —
       it asked the engine where that captain could sail and framed those squares. Water this screen
       draws nothing in.
     · ui/stage.js stageFlash: the "…is choosing where to sail…" line glided a watcher onto the captain's
       BOAT at 1.9x. That line is broadcast by pickCell, which only ever asks a PERSON — a bot's turn has
       no such line at all.
   So a person's turn ended on the boat and a bot's turn stayed on the squares. MEASURED, two windows,
   one real room, a guest phone at 375x812 watching 33 turns: a person's turn framed at 1.90x, the boat
   0.26 squares off centre, 11 of 11; a bot's turn at a mean 1.36x and 11.3 squares wide — the sail
   window — with the boat 1.8 squares off centre and, by the time that turn ended, as far as 6 squares
   off centre and out of frame entirely.

   NOW: camFrameTurn is the one place, and it decides from the one display door's own two inputs — the
   captain whose turn it is, and whether this screen is where that choice is being made (decisionIsLocal).
   Not the screen being asked -> that captain's boat. The screen being asked -> its own sail window
   (Game.sailChoices, architecture item 18, whose gate is sail_frame_same_squares_check.mjs and whose
   chooser half stands). The wait line asks the same function instead of aiming a camera of its own.

   RULES (each run against deliberately broken copies below, built in memory from the real source):
     1. ONE PLACE, ONE DOOR — camFrameTurn exists in ui/stage.js, camFitSail does not exist anywhere in
        src/, the stage bridge offers turnFrame and no second door, and nothing in src/ still calls sailCells.
     2. A WATCHER FRAMES THE BOAT AND CANNOT REACH THE SQUARES — camFrameTurn's `!local` branch frames the
        captain's own square at SEAT_ZOOM and RETURNS, and it stands BEFORE the Game.sailChoices read, so
        no watching screen can fall through to it. SEAT_ZOOM is the one distance camToSeat uses too.
     3. EVERY PATH REACHES IT CARRYING LOCALITY — the one event consumer frames the `turn` event with
        decisionIsLocal(e.p); renderPickPrompt (the screen drawing the squares) passes local:true; and
        those are the only two callers in src/.
     4. ONE DECISION, NOT TWO — stageFlash sends a WAIT line through camFrameTurn, not through a camera
        call of its own. A wait line is drawn only on a screen that is NOT being asked, so it is a
        watcher's line by construction and the turn has already decided its frame.
     5. POSED STREAMS — camFrameTurn compiled from the source text (real or broken) and run against real
        seeded Games: with the same captain's ship on the same square, a BOT's turn and a PERSON's turn
        give a watching screen the IDENTICAL framing decision, and that decision is the boat, never a fit;
        the chooser's own screen still gets a fit, never the boat.

   WHAT IS NOT THIS FACT, named so nobody "converges" it: the FIGHT camera (S.battle, held by the one
   consumer's engage/disengage — fight_on_screen_one_door_check.mjs), the storm's wide shot (stormCam),
   the rim sweep and the victory lean (sweepCam/leanCam), and an ordinary narration line about a captain
   (camToSeat) are each their own decision and are untouched by this item.

     node scripts/qa/watching_camera_one_rule_check.mjs */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { stripComments } from "./lib/strip_comments.mjs";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const { Game, roundCfg } = await import(pathToFileURL(path.join(REPO, "src/engine/index.js")).href);
const walk = d => fs.readdirSync(path.join(REPO, d), { withFileTypes: true })
  .flatMap(e => e.isDirectory() ? walk(path.join(d, e.name)) : e.name.endsWith(".js") ? [path.join(d, e.name)] : []);
const STAGE = "src/ui/stage.js", ORCH = "src/orchestrator.js", FLOW = "src/ui/flow.js";
const SEEDS = [1, 2, 3, 4];

/* A named function's body by brace matching, taken after its whole parameter list. */
function bodyAt(src, h) {
  if (h < 0) return "";
  let j = src.indexOf("(", h), d = 0;
  for (; j < src.length; j++) { if (src[j] === "(") d++; else if (src[j] === ")") { d--; if (!d) break; } }
  j = src.indexOf("{", j); d = 0;
  for (; j < src.length; j++) { if (src[j] === "{") d++; else if (src[j] === "}") { d--; if (!d) break; } }
  return src.slice(h, j + 1);
}
const fnBody = (src, head) => bodyAt(src, src.indexOf(head));
const count = (s, re) => (s.match(new RegExp(re.source, "g")) || []).length;

/* ⚠ THE RETURN IS `return[^;]*;`, NOT A BARE `return;` — architecture item 48 (2026-09-17) made the
   watching branch hand back the WAIT for the glide it just started (`return stageSettled();`), and a
   regex pinned to the bare return would have failed this gate for a change it should not judge. What
   this rule is about is unchanged and unweakened: the branch frames THAT CAPTAIN'S OWN SQUARE at
   SEAT_ZOOM and leaves, before the sailChoices read. Whether it also hands back a wait is item 48's
   fact and is held by scripts/qa/camera_settles_before_the_move_check.mjs. */
const WATCHER_BRANCH = /if\s*\(\s*!\s*local\s*\)\s*\{\s*camToCell\s*\(\s*own\s*,\s*SEAT_ZOOM\s*\)\s*;\s*return[^;]*;\s*\}/;

function rules(files) {
  const S = Object.fromEntries(Object.entries(files).map(([f, s]) => [f, stripComments(s)]));
  const stage = S[STAGE], orch = S[ORCH], flow = S[FLOW], out = [];
  const rule = checks => { const bad = checks.filter(c => !c[0]).map(c => c[1]); out.push({ ok: !bad.length, bad }); };
  const cam = fnBody(stage, "function camFrameTurn(");
  const flash = fnBody(stage, "function stageFlash(");
  const consume = fnBody(orch, "async function consumeEventBody(") || fnBody(orch, "function consumeEventBody(")
               || fnBody(orch, "async function consumeEvent(") || fnBody(orch, "function consumeEvent(");
  const prompt = fnBody(flow, "function renderPickPrompt(") || fnBody(flow, "export function renderPickPrompt(");

  // 1. ONE PLACE, ONE DOOR
  {
    const stillSail = Object.entries(S).filter(([, s]) => /\bcamFitSail\s*\(|\bsailCells\b/.test(s)).map(([f]) => f);
    const asks = Object.entries(S).filter(([f]) => f !== STAGE).filter(([, s]) => /\bg\.sailChoices\s*\(\s*who\s*\)/.test(s)).map(([f]) => f);
    rule([
      [!!cam, "camFrameTurn is missing from src/ui/stage.js — nothing decides a turn's frame in one place"],
      [!stillSail.length, `camFitSail / sailCells is still alive: ${stillSail.join(", ")} — the old door, or the watcher frame it carried`],
      [/\bturnFrame\s*:\s*\(\s*seat\s*,\s*pos\s*,\s*local\s*\)/.test(stage), "the stage bridge does not offer turnFrame(seat, pos, local) — a caller cannot pass this screen's locality"],
      [count(stage, /camFrameTurn\s*\(/) === 3, `camFrameTurn is reached ${count(stage, /camFrameTurn\s*\(/) - 1} time(s) inside ui/stage.js — expected exactly two (the bridge door and stageFlash's wait line)`],
      [!asks.length, `a screen outside ui/stage.js frames a captain's sail squares itself: ${asks.join(", ")}`],
    ]);
  }
  // 2. A WATCHER FRAMES THE BOAT AND CANNOT REACH THE SQUARES
  {
    const m = cam ? WATCHER_BRANCH.exec(cam) : null;
    const choicesAt = cam ? cam.indexOf("sailChoices(") : -1;
    rule([
      [!!m, "camFrameTurn has no `if (!local){ camToCell(own, SEAT_ZOOM); return … ; }` — a watching screen is not framed on that captain's boat"],
      [!!m && choicesAt >= 0 && m.index < choicesAt, "the watcher's boat frame does not stand before the Game.sailChoices read — a watching screen can still fall through and frame squares it draws none of"],
      [/const\s+SEAT_ZOOM\s*=/.test(stage), "SEAT_ZOOM is not defined in ui/stage.js — the distance is typed rather than named"],
      [/camToCell\s*\(\s*g\.players\[\s*i\s*\]\.pos\s*,\s*SEAT_ZOOM\s*\)/.test(stage), "camToSeat does not use SEAT_ZOOM — a line about a captain and a watcher's turn frame would drift apart"],
    ]);
  }
  // 3. EVERY PATH REACHES IT CARRYING LOCALITY
  {
    const callers = Object.entries(S).map(([f, s]) => [f, count(s, /\.turnFrame\s*\(/)]).filter(([, n]) => n);
    rule([
      [!!consume && /e\.t\s*===\s*"turn"[^;]*turnFrame\s*\(\s*e\.p\s*,\s*null\s*,\s*decisionIsLocal\s*\(\s*e\.p\s*\)\s*\)/.test(consume),
        "the one event consumer does not frame the `turn` event with decisionIsLocal(e.p) — a watching screen would be framed by the chooser's rule"],
      [!!prompt && /turnFrame\s*\(\s*seat\s*,\s*spec\.pos\s*,\s*true\s*\)/.test(prompt),
        "renderPickPrompt does not ask the turn frame with local:true — the screen drawing the squares is the screen being asked"],
      [callers.length === 2 && callers.every(([f]) => f === ORCH || f === FLOW),
        `the turn frame is asked for from ${callers.map(([f, n]) => `${f} (${n})`).join(", ") || "nowhere"} — expected exactly the one consumer and the sail prompt`],
    ]);
  }
  // 4. ONE DECISION, NOT TWO
  {
    rule([
      [!!flash && /opts\s*&&\s*opts\.wait\s*\)\s*camFrameTurn\s*\(\s*subj\s*,\s*null\s*,\s*false\s*\)/.test(flash),
        "stageFlash does not send a wait line through camFrameTurn — the narration-driven zoom and the turn-driven zoom are two decisions again, and a bot's turn has no wait line to be zoomed by"],
    ]);
  }
  // 5. POSED STREAMS
  {
    let res;
    try { res = posed(cam); } catch (e) { res = { err: `the posed streams threw: ${e.message}` }; }
    out.posed = res;
    rule(res.err ? [[false, res.err]] : [
      [res.humanSeats > 0 && res.botSeats > 0, `the posed table has ${res.humanSeats} human and ${res.botSeats} bot captains — this rule cannot reach its subject`],
      [res.differ === 0, `on ${res.differ} of ${res.poses} posed squares a bot's turn and a person's turn framed a watching screen differently (first: ${res.first})`],
      [res.notBoat === 0, `on ${res.notBoat} of ${res.poses} posed squares a watching screen did not frame that captain's own boat`],
      [res.chooserBoat === 0, `on ${res.chooserBoat} of ${res.poses} posed squares the screen BEING ASKED was thrown onto the boat instead of its sail window`],
    ]);
  }
  return out;
}

/* THE DECISION ITSELF, recorded: camFrameTurn's two exits are a cell FIT (the sail window) and a glide
   to one square (the boat), so the injected pair says which one it took and with what. */
function posed(camSrc) {
  if (!camSrc) throw new Error("camFrameTurn could not be found");
  /* `stageSettled` is injected because architecture item 48 made the WATCHING branch hand back the
     wait for its own glide, and this rule is the only one that runs that branch. A no-op here on
     purpose: what this gate judges is WHICH FRAME the branch chooses, not how long anything waits
     — that is camera_settles_before_the_move_check.mjs's own posed stream. */
  const make = new Function("S", "appState", "document", "camFitCells", "camToCell", "SEAT_ZOOM", "stageSettled",
    `${camSrc}; return camFrameTurn;`);
  const doc = { querySelectorAll: () => [], querySelector: () => null };
  const noWait = () => Promise.resolve();
  const r = { poses: 0, humanSeats: 0, botSeats: 0, differ: 0, notBoat: 0, chooserBoat: 0, first: "" };
  for (const seed of SEEDS) {
    const g = new Game(roundCfg(["human", "pirate", "trader", "balanced"]), seed, false);
    const appState = { game: g, mySeat: 0 };
    r.humanSeats = g.players.filter(p => p.strategy === "human").length;
    r.botSeats = g.players.filter(p => p.strategy !== "human").length;
    const n = g.cfg.grid;
    for (let x = 0; x < n; x++) for (let y = 0; y < n; y++) {
      const c = [x, y];
      if (g.blocked(c) || g.isIsland(c) || g.isHome(c) || g.onRim(c)) continue;
      r.poses++;
      const answers = [];
      for (let i = 0; i < g.players.length; i++) {
        g.players[i].pos = c;
        let got = null;
        const fit = cells => { got = ["fit", (cells || []).length]; };
        const boat = (cell, zoom) => { got = ["boat", cell[0] + "," + cell[1], zoom]; };
        make({}, appState, doc, fit, boat, 1.9, noWait)(i, null, false);   // a WATCHING screen
        answers.push(JSON.stringify(got));
        if (!got || got[0] !== "boat" || got[1] !== `${x},${y}` || got[2] !== 1.9) r.notBoat++;
        got = null;
        make({}, appState, doc, fit, boat, 1.9, noWait)(i, null, true);     // the screen BEING ASKED
        if (!got || got[0] !== "fit") r.chooserBoat++;
      }
      if (new Set(answers).size > 1) {
        r.differ++;
        if (!r.first) r.first = `seed ${seed} square ${x},${y}: ${answers.map((a, i) => `${g.players[i].strategy}=${a}`).join("  ")}`;
      }
    }
  }
  return r;
}

const files = Object.fromEntries(walk("src").map(f => [f.split(path.sep).join("/"), fs.readFileSync(path.join(REPO, f), "utf8")]));
const NAMES = [
  "one place, one door: camFrameTurn decides a turn's frame, camFitSail and the sailCells door are gone",
  "a watcher frames the boat and cannot reach the squares: the !local branch returns before Game.sailChoices, at the one SEAT_ZOOM",
  "every path reaches it carrying locality: the one consumer passes decisionIsLocal(e.p), the sail prompt passes local:true, nobody else calls it",
  "one decision, not two: a wait line asks camFrameTurn instead of aiming a camera of its own",
  "posed streams: a bot's turn and a person's turn frame a watching screen identically — on that captain's boat — while the screen being asked still gets its sail window",
];
const real = rules(files);
if (real.posed && !real.posed.err)
  console.log(`watching_camera_one_rule — ${real.posed.poses} posed sea squares on ${SEEDS.length} seeded boards, ${real.posed.humanSeats} human and ${real.posed.botSeats} bot captains at the table`);
real.forEach((r, i) => console.log(`  ${r.ok ? "PASS" : "FAIL"}  ${i + 1}. ${NAMES[i]}${r.ok ? "" : "\n          " + r.bad.join("\n          ")}`));

/* RED-PROOF: each mutant is the real source with ONE copy put back, and the rule(s) named must go red. */
const broken = (file, from, to) => files[file].includes(from) ? { ...files, [file]: files[file].replace(from, to) } : null;
const WATCHER_LINE = "  if (!local){ camToCell(own, SEAT_ZOOM); return stageSettled(); }";
const MUTANTS = [
  [[2, 5], "the square-framing watcher branch put back — a watching screen falls through to the sail window again (the fault this item removed)",
    broken(STAGE, WATCHER_LINE + "\n", "")],
  [[5], "a PERSON's turn taking a different path from a BOT's — the drift this item is, written as one line",
    broken(STAGE, WATCHER_LINE,
      "  if (!local && who && who.strategy === \"human\"){ camFitCells([own], 4.0, 0, 1); return; }\n" + WATCHER_LINE)],
  [[3], "the one consumer framing the turn without asking who is being asked",
    broken(ORCH, "window.__pp4.turnFrame(e.p,null,decisionIsLocal(e.p))", "window.__pp4.turnFrame(e.p)")],
  [[4], "the wait line aiming its own camera again (camToSeat), so a person's turn and a bot's turn are framed by different code",
    broken(STAGE, "if (opts && opts.wait) camFrameTurn(subj, null, false); else camToSeat(subj);", "camToSeat(subj);")],
  [[1], "a second door on the stage bridge — the old sailCells beside the new one",
    broken(STAGE, "    turnFrame: (seat, pos, local) =>",
      "    sailCells: (seat, pos) => { if (S.active) camFrameTurn(seat, pos); },\n    turnFrame: (seat, pos, local) =>")],
];
let proofOk = true;
for (const [ns, what, mutant] of MUTANTS) {
  const res = mutant ? rules(mutant) : null;
  const red = !!res && ns.every(n => !res[n - 1].ok);
  if (process.env.VERBOSE && res) ns.forEach(n => console.log(`          rule ${n}: ${res[n - 1].bad.join(" | ")}`));
  if (!red) proofOk = false;
  console.log(`  ${red ? "PASS" : "FAIL"}  red-proof (rule ${ns.join(" + ")}): ${what} ${red ? "goes red" : mutant ? "STAYS GREEN — the gate cannot see it" : "could not be built (the source moved)"}`);
}
const fails = real.filter(r => !r.ok).length;
console.log(fails || !proofOk ? `\nFAIL — ${fails} rule(s) broken${proofOk ? "" : ", and the red-proof did not hold"}`
  : `\nPASS — one rule frames another captain's turn on every watching screen, bot or human: their boat; ${real.length} rules, ${MUTANTS.length} mutants, each red`);
process.exit(fails || !proofOk ? 1 : 0);
