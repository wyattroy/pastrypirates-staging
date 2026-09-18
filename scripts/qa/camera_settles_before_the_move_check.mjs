#!/usr/bin/env node
/* THE CAMERA REACHES THE CAPTAIN BEFORE THEIR BOAT STARTS MOVING — ARCHITECTURE ITEM 48.
   Wyatt's playtest ask, 2026-09-17, relayed by Mac: Dev, in his words:
     "the camera should center a bot before they begin to move."

   THE FAULT IT HOLDS SHUT. Architecture item 46 made every watching screen frame the captain whose
   turn it is (camFrameTurn, ui/stage.js) — but the frame was only ASKED FOR. The glide is 650ms
   (camTo), and the next event was drawn the moment the ask returned, so the boat set off while the
   camera was still travelling. MEASURED on the branch before this item, at rAF, a guest phone at
   375x812 in a real crew room and a solo phone, sampling the SVG's APPLIED viewBox against the
   ship group's own drawn place:
     · a BOT's turn, guest phone: the hull began moving 46-80 ms after the turn was framed and the
       camera did not arrive until 663-666 ms — the boat had a HEAD START of about six tenths of a
       second, every time.
     · a PERSON's turn watched from the other screen: the same fault, smaller, because a person
       takes a moment to choose.
   His ask is about ORDER, and order is a thing the code can be made to guarantee rather than
   usually get right.

   NOW: the door decides both halves. camFrameTurn's watching branch frames that captain's boat AND
   HANDS BACK THE WAIT FOR IT (stageSettled — the stage's own settle, the camera's tween plus the
   ships standing still, hard-capped at SETTLE_CAP_MS so a wait can never hold a voyage). The stage
   bridge returns what the door hands back and the one event consumer awaits it on the `turn` event.
   The screen BEING ASKED is never held: its own sail prompt must not wait on the glide it just
   asked for.

   RULES (each run against deliberately broken copies below, built in memory from the real source):
     1. ONE PLACE DECIDES BOTH — camFrameTurn's `!local` branch is `camToCell(own, SEAT_ZOOM); return
        stageSettled();`, the wait is the stage's own capped settle, and there is NO SECOND RULE
        BESIDE IT: the one consumer's `turn` statement asks the door and waits for nothing else.
     2. THE PATH CARRIES IT, IN THE RIGHT ORDER — the stage bridge RETURNS camFrameTurn's answer; the
        one event consumer ASKS for the frame from the event plus decisionIsLocal(e.p) BEFORE
        render(), and AWAITS it AFTER. A promise nobody returns and a promise nobody awaits are the
        same defect twice — and awaiting it on the ask's own line is a third, MEASURED: with the wait
        before render(), the ring and the captains row reached the new captain a whole camera-settle
        after the top bar did, so the three surfaces that say whose turn it is disagreed for 0.6-0.7s
        on EVERY watched turn (13 runs a voyage, longest 3.3s, against 4 runs and 1.9s before this
        item). Asking early costs nothing and starts the glide; waiting late costs the board nothing.
     3. THE SCREEN BEING ASKED IS NEVER HELD — stageSettled is reached exactly once inside
        camFrameTurn, and it stands inside the watching branch, before the Game.sailChoices read.
     4. POSED STREAMS — camFrameTurn compiled from the source text (real or broken) and run on every
        sea square of seeded Games with one human and three bot captains, against a clock: the
        camera's glide books an arrival, stageSettled advances the clock to it, and the consumer
        draws the move the moment the door hands back. For a WATCHED captain, bot or human alike,
        the move is never drawn before the camera has arrived; the screen being asked is not held.

   WHAT IS NOT THIS FACT: what a watching screen frames (item 46, watching_camera_one_rule_check.mjs),
   which squares the chooser's frame is built from (item 18, sail_frame_same_squares_check.mjs), and
   the arrival wait the consumer already keeps after a MOVE ("nothing after a move is shown until the
   boat has arrived"). This one is about the order of the frame and the move at the START of a turn.

     node scripts/qa/camera_settles_before_the_move_check.mjs */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { stripComments } from "./lib/strip_comments.mjs";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const { Game, roundCfg } = await import(pathToFileURL(path.join(REPO, "src/engine/index.js")).href);
const STAGE = "src/ui/stage.js", ORCH = "src/orchestrator.js";
const SEEDS = [1, 2, 3, 4];
const GLIDE_MS = 650;            // camTo's own tween duration — the distance this item is about

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

const WAIT_BRANCH = /if\s*\(\s*!\s*local\s*\)\s*\{\s*camToCell\s*\(\s*own\s*,\s*SEAT_ZOOM\s*\)\s*;\s*return\s+stageSettled\s*\(\s*\)\s*;\s*\}/;
/* "a `turn` statement in the one consumer that also waits on something of its own" — the seam a
   second rule would grow in. `[^;]*` keeps it to the one statement. */
const SECOND_WAIT = /e\.t\s*===\s*"turn"[^;]*settled/;

async function rules(files) {
  const S = Object.fromEntries(Object.entries(files).map(([f, s]) => [f, stripComments(s)]));
  const stage = S[STAGE], orch = S[ORCH], out = [];
  const rule = checks => { const bad = checks.filter(c => !c[0]).map(c => c[1]); out.push({ ok: !bad.length, bad }); };
  const cam = fnBody(stage, "function camFrameTurn(");
  const settle = fnBody(stage, "function stageSettled(");
  const consume = fnBody(orch, "async function consumeEventBody(") || fnBody(orch, "function consumeEventBody(")
    || fnBody(orch, "async function consumeEvent(") || fnBody(orch, "function consumeEvent(");

  // 1. ONE PLACE DECIDES BOTH
  {
    rule([
      [!!cam && WAIT_BRANCH.test(cam),
        "camFrameTurn's watching branch does not hand back the wait — it should read `if (!local){ camToCell(own, SEAT_ZOOM); return stageSettled(); }`, so the one place that decides what a watcher frames also decides that the move waits for it"],
      [!!settle && /SETTLE_CAP_MS/.test(settle) && /const\s+SETTLE_CAP_MS\s*=/.test(stage),
        "the wait is not the stage's own capped settle — a wait that cannot end is a stuck voyage wearing a polite face"],
      [!!consume && !SECOND_WAIT.test(consume),
        "the one event consumer waits for the stage itself on a `turn` event — that is a second rule beside the door, and the two will drift"],
    ]);
  }
  // 2. THE PATH CARRIES IT
  {
    const askAt = consume ? consume.search(/e\.t\s*===\s*"turn"[^;]*window\.__pp4\.turnFrame\s*\(\s*e\.p\s*,\s*null\s*,\s*decisionIsLocal\s*\(\s*e\.p\s*\)\s*\)/) : -1;
    const waitAt = consume ? consume.search(/await\s+turnFramed\b/) : -1;
    const renderAt = consume ? consume.search(/(^|\n)\s*render\s*\(\s*\)\s*;/) : -1;
    rule([
      [/\bturnFrame\s*:\s*\(\s*seat\s*,\s*pos\s*,\s*local\s*\)\s*=>\s*\{\s*if\s*\(\s*S\.active\s*\)\s*return\s+camFrameTurn\s*\(/.test(stage),
        "the stage bridge does not RETURN camFrameTurn's answer — the door's wait is swallowed at the door, and no caller can wait on it"],
      [askAt >= 0, "the one event consumer does not ask for the turn's frame from the event plus decisionIsLocal(e.p)"],
      [waitAt >= 0, "the one event consumer does not AWAIT the turn frame — it asks for the camera and draws the next event without waiting for it, which is the fault this item closes"],
      /* 2c. THE ORDER, AND IT IS A MEASUREMENT, NOT A PREFERENCE. With the await on the ask's own line,
         the ring and the captains row reached the new captain a whole camera-settle after the top bar
         did — 0.6-0.7s of disagreement on EVERY watched turn, 13 runs a voyage against 4, longest 3.3s
         against 1.9s. render() is what moves the ring and the row, and it moves no boat at a `turn`
         event, so the board is drawn first and the wait is honoured after it. It also keeps a guest's
         render on THIS turn's playhead rather than on a sail that landed during the wait. */
      [askAt >= 0 && renderAt >= 0 && askAt < renderAt,
        "the turn's frame is not ASKED FOR before render() — the glide would start a whole board-draw late, and every millisecond of it is paid out of the turn"],
      [waitAt >= 0 && renderAt >= 0 && waitAt > renderAt,
        "the turn's frame is WAITED FOR before render() — the ring and the captains row would then reach the new captain a camera-settle after the top bar does, on every watched turn (measured: 13 runs a voyage, longest 3.3s, against 4 runs and 1.9s)"],
    ]);
  }
  // 3. THE SCREEN BEING ASKED IS NEVER HELD
  {
    const at = cam ? cam.search(/stageSettled\s*\(/) : -1;
    const choicesAt = cam ? cam.indexOf("sailChoices(") : -1;
    rule([
      [count(cam || "", /stageSettled\s*\(/) === 1,
        `camFrameTurn reaches stageSettled ${count(cam || "", /stageSettled\s*\(/)} times — exactly one, in the watching branch, or the screen being asked is held by the glide it asked for`],
      [at >= 0 && choicesAt >= 0 && at < choicesAt,
        "the wait does not stand inside the watching branch, before the Game.sailChoices read — the chooser's own sail prompt would wait on its own frame"],
    ]);
  }
  // 4. POSED STREAMS
  {
    let res;
    try { res = await posed(cam); } catch (e) { res = { err: `the posed streams threw: ${e.message}` }; }
    out.posed = res;
    rule(res.err ? [[false, res.err]] : [
      [res.humanSeats > 0 && res.botSeats > 0, `the posed table has ${res.humanSeats} human and ${res.botSeats} bot captains — this rule cannot reach its subject`],
      [res.noAim === 0, `on ${res.noAim} of ${res.watched} watched turns the camera was never aimed at the captain at all`],
      [res.early === 0, `on ${res.early} of ${res.watched} watched turns the move was drawn BEFORE the camera arrived (first: ${res.firstEarly})`],
      [res.botEarly === 0 && res.humanEarly === 0, `a bot's turn and a person's turn are not held alike: ${res.botEarly} early on bot turns, ${res.humanEarly} on person turns`],
      [res.chooserHeld === 0, `on ${res.chooserHeld} of ${res.watched} poses the screen BEING ASKED was held waiting for its own frame`],
    ]);
  }
  return out;
}

/* THE ORDER ITSELF, POSED AGAINST A CLOCK. The director's glide books an arrival (camToCell /
   camFitCells); stageSettled is the stage handing the clock forward to it; and the consumer draws
   the move the instant the door hands back — which is exactly what the one consumer does, since the
   `sail` event is drained only after consumeEvent(`turn`) has resolved (the host's turn loop awaits
   the drain, the guest's wire is one promise chain). So "did the move start before the camera
   arrived?" is a question about this function's return value, and nothing else. */
async function posed(camSrc) {
  if (!camSrc) throw new Error("camFrameTurn could not be found");
  const make = new Function("S", "appState", "document", "camFitCells", "camToCell", "SEAT_ZOOM", "stageSettled",
    `${camSrc}; return camFrameTurn;`);
  const doc = { querySelectorAll: () => [], querySelector: () => null };
  const r = { poses: 0, watched: 0, humanSeats: 0, botSeats: 0, noAim: 0, early: 0, botEarly: 0, humanEarly: 0, chooserHeld: 0, firstEarly: "", waits: [] };
  let clock = 0, aim = null;
  const camToCell = () => { aim = clock + GLIDE_MS; };
  const camFitCells = () => { aim = clock + GLIDE_MS; };
  const settled = () => { if (aim != null) clock = Math.max(clock, aim); return Promise.resolve(); };
  const door = appState => make({}, appState, doc, camFitCells, camToCell, 1.9, settled);
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
      for (let i = 0; i < g.players.length; i++) {
        const bot = g.players[i].strategy !== "human";
        g.players[i].pos = c;
        // A WATCHING SCREEN: the frame is asked for, and the move is drawn when the door hands back.
        clock = 0; aim = null;
        await door(appState)(i, null, false);
        const moveAt = clock;
        r.watched++;
        if (aim == null) r.noAim++;
        else if (moveAt < aim) {
          r.early++; bot ? r.botEarly++ : r.humanEarly++;
          if (!r.firstEarly) r.firstEarly = `seed ${seed} square ${x},${y}, ${bot ? "bot" : "person"} seat ${i}: move at ${moveAt}ms, camera at ${aim}ms`;
        } else if (r.waits.length < 4) r.waits.push(moveAt - 0);
        // THE SCREEN BEING ASKED: its own sail window, and nothing held.
        clock = 0; aim = null;
        await door(appState)(i, null, true);
        if (clock !== 0) r.chooserHeld++;
      }
    }
  }
  return r;
}

const walk = d => fs.readdirSync(path.join(REPO, d), { withFileTypes: true })
  .flatMap(e => e.isDirectory() ? walk(path.join(d, e.name)) : e.name.endsWith(".js") ? [path.join(d, e.name)] : []);
const files = Object.fromEntries(walk("src").map(f => [f.split(path.sep).join("/"), fs.readFileSync(path.join(REPO, f), "utf8")]));
const NAMES = [
  "one place decides both: the watching branch frames the boat AND hands back the stage's own capped wait, and the consumer waits for nothing else of its own",
  "the path carries it, in the right order: the stage bridge returns the door's answer, the one event consumer asks for the frame BEFORE render() and awaits it AFTER",
  "the screen being asked is never held: the wait is reached once, inside the watching branch, before the sail window is read",
  "posed streams: on every sea square of seeded boards, a watched captain's move — bot or human — is never drawn before the camera has arrived, and the chooser is not held",
];
const real = await rules(files);
if (real.posed && !real.posed.err)
  console.log(`camera_settles_before_the_move — ${real.posed.poses} posed sea squares on ${SEEDS.length} seeded boards, ${real.posed.watched} watched turns, ${real.posed.humanSeats} human and ${real.posed.botSeats} bot captains at the table (the glide modelled at ${GLIDE_MS}ms)`);
real.forEach((r, i) => console.log(`  ${r.ok ? "PASS" : "FAIL"}  ${i + 1}. ${NAMES[i]}${r.ok ? "" : "\n          " + r.bad.join("\n          ")}`));

/* RED-PROOF: each mutant is the real source with the wait broken in ONE way, and the rule(s) named
   must go red. The first is the fault this item closes, written as one line. */
const broken = (file, from, to) => files[file].includes(from) ? { ...files, [file]: files[file].replace(from, to) } : null;
/* two edits to one file, both of which must land — a mutant that only half-applied would be a
   red-proof passing for the wrong reason. */
const twice = (file, a, b) => {
  let s = files[file];
  for (const [from, to] of [a, b]) { if (!s.includes(from)) return null; s = s.replace(from, to); }
  return { ...files, [file]: s };
};
const WAIT_LINE = "  if (!local){ camToCell(own, SEAT_ZOOM); return stageSettled(); }";
const ASK_LINE = `  const turnFramed=(e.t==="turn"&&!appState.replaying&&window.__pp4&&window.__pp4.turnFrame)?window.__pp4.turnFrame(e.p,null,decisionIsLocal(e.p)):null;`;
const WAIT_IN_CONSUMER = "  if(turnFramed)await turnFramed;";
const MUTANTS = [
  [[1, 4], "the wait taken out of the door — the frame is asked for and the move drawn without waiting for it (the fault this item closes)",
    broken(STAGE, WAIT_LINE, "  if (!local){ camToCell(own, SEAT_ZOOM); return; }")],
  [[2], "the one consumer asking for the frame and never awaiting it",
    broken(ORCH, WAIT_IN_CONSUMER, "")],
  [[2], "the stage bridge swallowing the door's answer, so no caller has anything to wait on",
    broken(STAGE, "turnFrame: (seat, pos, local) => { if (S.active) return camFrameTurn(seat, pos, local); }",
      "turnFrame: (seat, pos, local) => { if (S.active) camFrameTurn(seat, pos, local); }")],
  /* THE ORDER, TIDIED BACK — the shape this item had for one commit, and the one a later reader is
     most likely to "simplify" to, because awaiting on the ask's own line looks neater. It costs the
     ring and the captains row a whole camera-settle on every watched turn. */
  [[2], "the wait moved back onto the ask's own line, before render() — neater to read, and it puts the board a camera-settle behind the top bar on every watched turn",
    twice(ORCH, [ASK_LINE, ASK_LINE.replace("const turnFramed=(", "const turnFramed=await (")], [WAIT_IN_CONSUMER + "\n", ""])],
  [[3, 4], "the screen BEING ASKED held too — a captain's own sail prompt waiting on the glide it just asked for",
    broken(STAGE, "  camFitCells(cells, 4.0, need || S.lastPromptNeed || 0, 1);\n}",
      "  camFitCells(cells, 4.0, need || S.lastPromptNeed || 0, 1);\n  return stageSettled();\n}")],
  [[1], "a second rule beside the door — the consumer waiting for the stage itself on a turn event",
    broken(ORCH, ASK_LINE, ASK_LINE + `\n  if(e.t==="turn"&&window.__pp4&&window.__pp4.settled)await window.__pp4.settled();`)],
];
let proofOk = true;
for (const [ns, what, mutant] of MUTANTS) {
  const res = mutant ? await rules(mutant) : null;
  const red = !!res && ns.every(n => !res[n - 1].ok);
  if (process.env.VERBOSE && res) ns.forEach(n => console.log(`          rule ${n}: ${res[n - 1].bad.join(" | ")}`));
  if (!red) proofOk = false;
  console.log(`  ${red ? "PASS" : "FAIL"}  red-proof (rule ${ns.join(" + ")}): ${what} ${red ? "goes red" : mutant ? "STAYS GREEN — the gate cannot see it" : "could not be built (the source moved)"}`);
}
const fails = real.filter(r => !r.ok).length;
console.log(fails || !proofOk ? `\nFAIL — ${fails} rule(s) broken${proofOk ? "" : ", and the red-proof did not hold"}`
  : `\nPASS — the camera reaches a watched captain before their boat is drawn moving, bot or human; ${real.length} rules, ${MUTANTS.length} mutants, each red`);
process.exit(fails || !proofOk ? 1 : 0);
