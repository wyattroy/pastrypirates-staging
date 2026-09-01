/* W7 — THE ROUTE NEVER REACHES THE WIRE, SO THE GUEST'S BOAT DOES NOT SAIL IT.
 *
 * Wyatt saw this in a two-tab crew game: the host's boat threads between the islands and the
 * guest's boat slides in a straight line, cutting across land.
 *
 * The shape of it, in this tree:
 *   - the engine computes a REAL legal path — Game.sailPath (src/engine/index.js)
 *   - only src/ui/flow.js asks for that path, and only src/ui/flow.js walks it (animateSailRoute)
 *   - flow.js's turn loop runs under runLiveNet(), which src/orchestrator.js attaches on the HOST ONLY
 *   - the event published to the guest is {t:"sail", p:<seat>} plus Game.ev's baked snapshot, and
 *     that snapshot carries each captain's FINAL pos and nothing about how it got there
 *   - the guest consumes through watchEvents -> consumeEvent, assigns p.pos, and calls render(),
 *     which glides the ship from wherever it was straight to the destination
 *
 * So the route is computed, drawn once on the host, and thrown away. There is nothing on the wire
 * for a guest to walk even if it wanted to.
 *
 * THIS GATE IS RED ON PURPOSE UNTIL THAT IS FIXED. It asserts the REQUIREMENT (a route reaches the
 * wire and the guest walks it), not the current behaviour — so it goes green when the defect goes,
 * and it cannot be satisfied by anything less.
 *
 * WHY IT IS STATIC. All the parity gates in this suite are assertions on source text; a live
 * two-browser measurement of this needs Firebase and real timing and would flake, and a flaky gate
 * gets switched off. What a static gate CANNOT see is named in the report: whether the guest's
 * glide actually crosses land on any given board.
 *
 * RUN IT AGAINST A DIFFERENT TREE:  node scripts/qa/w7_sail_route_on_wire_check.mjs --tree=/some/copy
 * (used to red-proof it: a hand-edited copy where the route IS on the wire makes it pass.)
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { stripComments as strip } from "./lib/strip_comments.mjs";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const treeArg = process.argv.find(a => a.startsWith("--tree="));
const TREE = treeArg ? path.resolve(treeArg.slice(7)) : REPO;

let fails = 0;
const pass = m => console.log("PASS " + m);
const fail = m => { console.log("FAIL " + m); fails++; };
/* An instrument that reports NOT FOUND has told you about ITSELF, not about the world. If the
   subject is missing, this gate must ABORT loudly rather than pass on an empty search. */
const missed = m => { console.log("INSTRUMENT DID NOT REACH ITS SUBJECT — " + m); process.exit(2); };

const read = rel => {
  const p = path.join(TREE, rel);
  if (!fs.existsSync(p)) missed(`${rel} does not exist under ${TREE}`);
  return fs.readFileSync(p, "utf8");
};
const lineOf = (src, idx) => src.slice(0, idx).split("\n").length;

const engine = read("src/engine/index.js");
const flow   = read("src/ui/flow.js");
const storyboard = read("src/shared/storyboard.js");   // step 1 moved the ride DECISION here
const orch   = read("src/orchestrator.js");

/* ─── STEP 0. PROVE THE INSTRUMENT TOUCHED ITS SUBJECT ────────────────────────────────────────
   Every pattern below is reported with the file:line it matched, so a reader can check that this
   gate looked at the real thing and not at an empty string. */
const subj = {};
{
  const m = engine.match(/\n\s*sailPath\s*\(/);
  if (!m) missed("src/engine/index.js has no sailPath( — the engine's legal-path search. Re-anchor this gate; do not delete it.");
  subj.sailPath = `src/engine/index.js:${lineOf(engine, m.index + 1)}`;

  const w = flow.match(/export\s+async\s+function\s+animateSailRoute\s*\(/);
  if (!w) missed("src/ui/flow.js has no animateSailRoute( — the only code that walks a route square by square.");
  subj.walker = `src/ui/flow.js:${lineOf(flow, w.index)}`;

  const b = engine.match(/o\.state\s*=\s*this\.players\.map\(/);
  if (!b) missed("src/engine/index.js: Game.ev() no longer bakes o.state — that bake IS the wire payload this gate inspects.");
  subj.bake = `src/engine/index.js:${lineOf(engine, b.index)}`;

  const c = orch.match(/export\s+async\s+function\s+consumeEvent\s*\(/);
  if (!c) missed("src/orchestrator.js has no consumeEvent( — the one event consumer the guest draws from.");
  subj.consumer = `src/orchestrator.js:${lineOf(orch, c.index)}`;

  const wch = orch.match(/export\s+function\s+watchEvents\s*\(/);
  if (!wch) missed("src/orchestrator.js has no watchEvents( — the guest's Firebase feed.");
  subj.watch = `src/orchestrator.js:${lineOf(orch, wch.index)}`;

  console.log(`SUBJECT REACHED — route search ${subj.sailPath} · route walker ${subj.walker} · wire payload bake ${subj.bake} · guest consumer ${subj.consumer} · guest feed ${subj.watch}`);
  console.log(`TREE UNDER TEST — ${TREE}\n`);
}

/* the shape of a field that could carry a route: a list of squares, under any of these names */
const ROUTE_KEY = /\b(route|path|legs|via|squares|waypoints)\b/;

/* ─── 1. THE WIRE. Every sail event published must carry the route the engine chose. ───────────
   Today each emitter publishes {t:"sail",p:<seat>} — the seat and nothing else — and Game.ev's
   baked snapshot adds only each captain's FINAL pos. */
{
  const emitters = [...`${flow}`.matchAll(/ev\(\{\s*t\s*:\s*"sail"[^}]*\}/g)]
        .map(m => ({ file: "src/ui/flow.js", src: flow, idx: m.index, text: m[0] }))
    .concat([...`${engine}`.matchAll(/ev\(\{\s*t\s*:\s*"sail"[^}]*\}/g)]
        .map(m => ({ file: "src/engine/index.js", src: engine, idx: m.index, text: m[0] })));

  if (!emitters.length) missed('no ev({t:"sail"…}) emitter found in flow.js or engine/index.js — this gate has lost its subject.');
  console.log(`  (found ${emitters.length} sail emitter(s))`);

  for (const e of emitters) {
    const where = `${e.file}:${lineOf(e.src, e.idx)}`;
    if (ROUTE_KEY.test(e.text)) pass(`${where} publishes a route with the sail event — ${e.text}`);
    else fail(`${where} publishes the seat and nothing else — ${e.text} — so no guest can know which squares the boat sailed through`);
  }

  /* ⚠ THE PRESENTATION LANE, ASSERTED BY NAME — AND THE FIRST VERSION OF THIS COULD NOT FAIL.
     A fresh checker found it the same day it shipped. The old assertion tested the physical bake
     LINE against ROUTE_KEY, and that line also contains `delete o.route`. So a tree that computed
     the route and then threw it away again — WHICH IS THE ORIGINAL DEFECT, EXACTLY — matched the
     word "route" and was blessed, with every other gate green beside it.

     The lesson is this repo's oldest one and it was committed inside the gate written to end it:
     A GATE THAT GOES GREEN ON THE BUG IT GUARDS IS NOT SILENT, IT IS REASSURING. And the
     red-proof that missed it was run UPWARDS — break the tree, patch until green — which only
     ever proves a gate can turn green. Every assertion below was proved DOWNWARDS: break the
     shipped fix one way at a time, watch this file go red, restore. */
  const bakeLine = engine.slice(engine.indexOf("o.state=this.players.map(")).split("\n")[0];

  if (/o\.draw\s*=/.test(bakeLine) && /this\.bakeDraw\s*\(/.test(bakeLine))
    pass(`${subj.bake} hands the route to bakeDraw and assigns the o.draw lane beside the snapshot`);
  else fail(`${subj.bake} does not assign o.draw from this.bakeDraw(…) — ${bakeLine.trim().slice(0, 140)}… — so the route is computed and dropped, which is the defect this item exists to remove`);

  /* the builder itself, by body — the one place that decides what the far side is handed */
  /* THE DEFINITION, NOT THE CALL SITE — and the first draft got this wrong, went red on a tree
     whose bakeDraw plainly does both things, and was corrected because rule 6 says a check that
     condemns something known to work is the suspect. `this.bakeDraw(o.route,…)` is a call and is
     followed by `;`; the definition is the occurrence with no dot before it and a body after it. */
  const bi = engine.search(/(?<![.\w])bakeDraw\s*\([^)]*\)\s*\{/);
  if (bi < 0) fail(`src/engine/index.js has no bakeDraw — nothing builds the presentation lane, so o.draw can only ever be undefined`);
  else {
    let o = engine.indexOf("{", bi), d = 0, c = o;
    for (; c < engine.length; c++) { if (engine[c] === "{") d++; else if (engine[c] === "}") { d--; if (!d) break; } }
    const bd = engine.slice(o, c + 1);
    /* ⚠ THIS ONE IS RUN, NOT READ, AND THAT DISTINCTION IS THE WHOLE FINDING.
       The draft above it asserted `return {route:` and `return null` appear in the body — and a
       downward red-proof walked straight through it: inserting `return null;` as bakeDraw's FIRST
       line kills the guest's boat on every sail, and both text assertions stayed green because
       both strings are still in the body underneath. TEXT CANNOT SEE CONTROL FLOW. A one-line
       change would have shipped the original bug back with 53 gates green.

       The engine is pure — no DOM, no network, no isHost — so it simply imports and runs here,
       and bakeDraw does not use `this`. Two calls settle it: one route that lands where the
       snapshot says, one that does not. */
    const mod = await import(new URL("file://" + path.join(TREE, "src/engine/index.js")).href + "?t=" + Date.now());
    const proto = mod.Game && mod.Game.prototype;
    if (!proto || typeof proto.bakeDraw !== "function") missed(`Game.bakeDraw is not a function on the imported engine — this gate cannot run its subject.`);
    const vouched = proto.bakeDraw.call(null, [[1, 1], [1, 2], [2, 2]], { pos: [2, 2] });
    const refused = proto.bakeDraw.call(null, [[1, 1], [1, 2], [9, 9]], { pos: [2, 2] });
    if (vouched && Array.isArray(vouched.route) && vouched.route.length === 3)
      pass(`src/engine/index.js:${lineOf(engine, bi)} bakeDraw RUN with a 3-square route landing on the baked pos → returned all 3 squares`);
    else fail(`src/engine/index.js:${lineOf(engine, bi)} bakeDraw RUN with a good route returned ${JSON.stringify(vouched)} — the lane is empty on every sail, and the guest glides straight`);
    if (refused === null)
      pass(`src/engine/index.js:${lineOf(engine, bi)} bakeDraw RUN with a route ending away from the baked pos → refused (null). No route beats an invented one`);
    else fail(`src/engine/index.js:${lineOf(engine, bi)} bakeDraw RUN with a route that does not land on the baked pos returned ${JSON.stringify(refused)} — a drawn line that disagrees with the recorded move would be published as truth`);
  }

  /* NO RULE MAY READ THE LANE. Until now this was only prose, in a comment — and a comment is not
     a measurement. If a rule ever reads o.draw, presentation has become a game fact, the scrubber
     and the far side can disagree, and deleting the lane stops being free. */
  const drawReads = [...engine.matchAll(/\b(?:ev|e|evt|last|prev)\.draw\b/g)];
  if (!drawReads.length) pass(`src/engine/index.js never READS a draw lane — presentation stays presentation, and deleting it changes no move`);
  else fail(`src/engine/index.js reads a draw lane at line(s) ${drawReads.map(m => lineOf(engine, m.index)).join(", ")} — a rule is reading presentation, so the lane is no longer free to delete`);

  /* AND THE WALKER MUST READ WHAT THE BAKER WROTE — the two ends of one wire.
     FOLLOWED, NOT WEAKENED, 2026-08-31. This asserted the read was in src/ui/flow.js, and it went
     red the moment step 1 moved that decision into src/shared/storyboard.js's present(). The
     behaviour did not change; the gate's SUBJECT moved. Loosening it to "some file somewhere reads
     draw.route" would have been the easy fix and a bad one — this project has shipped a gate aimed
     at the wrong tree before, and a gate aimed at nothing in particular is worse (§3 of
     HARD-WON-LESSONS: a gate aimed at the wrong tree is not silent, it is reassuring).
     So it now asserts the WIRE, end to end, in whichever file each end lives: something in the
     display path reads the lane, and flow.js can reach that reader. Both halves must hold. */
  const readers = [["src/ui/flow.js", flow], ["src/shared/storyboard.js", storyboard]]
    .filter(([, src]) => /\.draw\s*&&\s*\w+\.draw\.route|\.draw\?\.route|\.draw\.route/.test(src))
    .map(([name]) => name);
  /* CODE ONLY. The first version tested this against the raw file and a COMMENT saying "moved into
     present()" satisfied it — a gate passing on prose about the code instead of the code, which is
     rule 6 committed inside a gate written to enforce rule 6. Caught by red-proofing the second
     direction and noticing it did not fire. */
  const flowCode = flow.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
  const flowReachesReader = /\.draw\.route/.test(flowCode) || /=\s*present\s*\(/.test(flowCode);
  if (readers.length && flowReachesReader)
    pass(`the lane the engine writes is the lane the walker walks — read in ${readers.join(" + ")}, reached from src/ui/flow.js`);
  else if (!readers.length)
    fail(`nothing in the display path reads draw.route — the engine publishes a lane nothing consumes, so the guest still glides straight`);
  else
    fail(`draw.route is read in ${readers.join(" + ")}, but src/ui/flow.js neither reads it nor calls present() — the walker cannot reach the decision, so the lane is orphaned`);
}

/* ─── 2. THE GUEST. The one event consumer must walk the route. ────────────────────────────────
   consumeEvent assigns p.pos from the baked state and calls render(); render glides the ship to
   wherever it now is, in a straight line, across whatever is in between. */
{
  const i = orch.search(/export\s+async\s+function\s+consumeEvent\s*\(/);
  let j = orch.indexOf("{", i), depth = 0, k = j;
  for (; k < orch.length; k++) { if (orch[k] === "{") depth++; else if (orch[k] === "}") { depth--; if (!depth) break; } }
  const body = strip(orch.slice(j, k + 1));
  if (/animateSailRoute/.test(body)) pass(`${subj.consumer} walks the route (animateSailRoute reached from the one event consumer)`);
  else fail(`${subj.consumer} never reaches animateSailRoute — it assigns p.pos from the baked state and calls render(), so the guest's boat slides straight from where it was to the destination`);

  /* WIDENED 2026-08-30, because the first version made the code worse. It demanded the specifier
     end in "flow.js", so the builder had to import this ONE function directly while every other ui
     function in that file arrives through the ./ui/index.js barrel — an inconsistency (rule 8) that
     a GATE invented rather than a developer. What this assertion actually cares about is whether the
     walker is IN SCOPE on the tier that draws the guest; which door it came through is not its
     business. It now accepts either, so the code can be consistent. */
  const imports = strip(orch).match(/import[^;]*from\s*["'][^"']*(?:flow|index)\.js["']/g) || [];
  if (imports.some(s => /animateSailRoute/.test(s))) pass("src/orchestrator.js imports animateSailRoute — the guest tier can reach the walker");
  else fail("src/orchestrator.js does not import animateSailRoute from src/ui/flow.js — the walker is not even in scope on the tier that draws the guest");
}

/* ─── 3. REACHABILITY. The only code that walks a route must not be host-only. ─────────────────
   Every caller of animateSailRoute is inside flow.js's turn loop, and that loop runs under
   runLiveNet(), which orchestrator.js attaches on the host branch alone. */
{
  const files = fs.readdirSync(path.join(TREE, "src"), { recursive: true })
    .filter(f => typeof f === "string" && f.endsWith(".js"))
    .map(f => path.join("src", f));
  const callers = new Set();
  for (const rel of files) {
    const src = strip(fs.readFileSync(path.join(TREE, rel), "utf8"));
    for (const m of src.matchAll(/(?<!function\s)animateSailRoute\s*\(/g)) {
      if (/export\s+async\s+function\s+animateSailRoute/.test(src.slice(Math.max(0, m.index - 40), m.index + 20))) continue;
      callers.add(rel);
    }
  }
  if (!callers.size) missed("no call site of animateSailRoute anywhere under src/ — the walker is dead code, or this gate's pattern has rotted.");
  console.log(`  (route walker is called from: ${[...callers].join(", ")})`);

  const hostGate = orch.match(/if\s*\(\s*appState\.isHost\s*\)\s*\{\s*runLiveNet\(\)/);
  if (!hostGate) missed("src/orchestrator.js: cannot find the isHost gate on runLiveNet() — re-anchor this assertion before trusting its verdict.");
  const gateAt = `src/orchestrator.js:${lineOf(orch, hostGate.index)}`;

  const outsideFlow = [...callers].filter(f => f !== "src/ui/flow.js");
  if (outsideFlow.length) pass(`the route walker is called from outside the host-only turn loop as well (${outsideFlow.join(", ")})`);
  else fail(`every caller of the route walker is inside src/ui/flow.js, whose turn loop runs only under runLiveNet() — gated on the host at ${gateAt}. A guest can never call it, so a guest's boat can never sail the route.`);
}

console.log(fails
  ? `\nFAILED — ${fails} assertion(s). The route the engine chose is computed, drawn once on the host, and thrown away; the guest is sent a destination and glides to it in a straight line.`
  : "\nPASSED — the engine's route reaches the wire and the guest walks it");
process.exit(fails ? 1 : 0);
