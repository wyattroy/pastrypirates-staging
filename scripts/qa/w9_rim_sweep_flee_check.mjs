/* W9b — THE SHIP THAT FLEES A BATTLE IS TELEPORTED, ON BOTH SCREENS.
 *
 * TWO SEPARATE FAULTS AT ONE SITE, kept apart here because they have different fixes:
 *
 * FAULT 1 — NO ROUTE AT ALL. src/orchestrator.js:719 offers `reachable(def)` (src/ui/flow.js:305,
 * = Game.sailStates with throughRim) — EVERY sail-reachable square, not just the adjacent ones. The
 * chosen square is then assigned straight onto the ship at src/orchestrator.js:732
 * (`def.pos=dest`), and the event emitted at :735 is `{t:"battleflee",a,d,rounds,downwind}` — no
 * `route`, so Game.ev's bakeDraw lane stays null and there is nothing on the wire to walk. And
 * animateSailRoute refuses anything whose `t` is not "sail" (src/ui/flow.js:1215) even if a route
 * were added. So the boat slides down the straight chord between its two squares, on the host and
 * on the guest alike — the ORIGINAL complaint, quoted in sailPath's own header at
 * src/engine/index.js:630-634: "a move around the corner of an island read as sailing THROUGH the
 * island". The rule was applied at the sail site and not at its twin.
 *
 * FAULT 2 — THE RIM RIDE IS SKIPPED. :732 also calls tradewind(def) then animateRimSweepIfAny().
 * The animator derives its starting square from the PREVIOUS event's snapshot (src/ui/flow.js:1042)
 * and that snapshot still holds the ship's PRE-BATTLE square, so onRim(from) is false at
 * src/ui/flow.js:1043 and the ride is refused. This is the second entry on the animator's own
 * documented fallback list (src/ui/flow.js:1018-1019) — and a comment is not a measurement, so it
 * is measured here rather than believed.
 *
 * WHAT THIS GATE DOES ABOUT "DOES IT MATTER". Leg C measures, over seeded boards, how far a flee
 * actually travels and how often the straight line it is drawn along crosses LAND. If flees were
 * nearly always one square this would be a footnote; the numbers are printed either way, and the
 * leg fails only if cornering flees turn out to be impossible — which would retire the item.
 *
 * NOTHING HERE IS A SOURCE READ. The engine is real, the boards are real, and the real animator is
 * executed. Every ship painter in src/ui/board.js early-returns on an empty shipEls, so a ride
 * executes and simply draws nothing.
 *
 * RUN IT AGAINST A DIFFERENT TREE:  node scripts/qa/w9_rim_sweep_flee_check.mjs --tree=/some/copy
 */
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const treeArg = process.argv.find(a => a.startsWith("--tree="));
const TREE = treeArg ? path.resolve(treeArg.slice(7)) : REPO;

let fails = 0;
const pass = m => console.log("  PASS  " + m);
const fail = m => { console.log("  FAIL  " + m); fails++; };
const missed = m => { console.log("INSTRUMENT DID NOT REACH ITS SUBJECT — " + m); process.exit(2); };

for (const rel of ["src/ui/flow.js", "src/state/index.js", "src/engine/index.js", "src/orchestrator.js"])
  if (!fs.existsSync(path.join(TREE, rel))) missed(`${rel} does not exist under ${TREE}`);

globalThis.window = globalThis;
globalThis.addEventListener = () => {};
globalThis.requestAnimationFrame = cb => setTimeout(cb, 0);
globalThis.getComputedStyle = () => ({ display: "none" });
globalThis.document = {
  getElementById: () => null, querySelector: () => null, querySelectorAll: () => [],
  addEventListener() {}, documentElement: { style: {} },
};

const u = rel => `file://${path.join(TREE, rel)}`;
const { Game, roundCfg } = await import(u("src/engine/index.js"));
const { man } = await import(u("src/shared/index.js"));
const { appState } = await import(u("src/state/index.js"));

const STRATS = ["pirate", "trader", "balanced", "rusher"];
const DEF = 0, ATT = 1;

let loads = 0;
async function freshFlow() {
  const flow = await import(u("src/ui/flow.js") + `?w9b=${++loads}-${Date.now()}`);
  for (const fn of ["animateSailRoute", "animateRimSweepIfAny"])
    if (typeof flow[fn] !== "function") missed(`src/ui/flow.js does not export ${fn} — re-anchor this gate`);
  return flow;
}
function newGame(seed) {
  const g = new Game({ ...roundCfg(STRATS) }, seed, true);
  if (!g.players || g.players.length < 2) missed("the posed Game has fewer than two captains — no battle can be posed");
  if (typeof g.sailPath !== "function" || typeof g.sailStates !== "function")
    missed("the engine exposes no sailStates/sailPath — re-anchor this gate");
  return g;
}
function useGame(g) { appState.replaying = false; appState.game = g; appState.evIdx = g.events.length - 1; }
const cells = g => [...g.valid].map(k => k.split(",").map(Number));
/* THE BOT'S OWN FLEE RULE, copied from src/orchestrator.js:731 — farthest from the attacker. */
const botFlee = (list, attPos) => list.reduce((best, cc) => man(cc, attPos) > man(best, attPos) ? cc : best, list[0]);
/* Does the STRAIGHT LINE a ship is drawn along cross land? Sampled finely between cell centres —
   the same question the 16.3%-of-moves measurement in sailPath's header asked. */
function chordCrossesLand(g, from, to) {
  const steps = 60;
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const x = Math.round(from[0] + (to[0] - from[0]) * t);
    const y = Math.round(from[1] + (to[1] - from[1]) * t);
    if (x === from[0] && y === from[1]) continue;
    if (x === to[0] && y === to[1]) continue;
    if (!g.valid.has(x + "," + y) || g.isIsland([x, y]) || g.isHome([x, y])) return true;
  }
  return false;
}

console.log(`TREE UNDER TEST — ${TREE}`);
console.log(`SUBJECT REACHED — real Game boards, the real flee-destination rule, and the real src/ui/flow.js animators\n`);

/* ─── A. THE INSTRUMENT, BOTH WAYS. Prove a route CAN reach the wire and CAN be walked, so a red
       verdict below is about the flee site and not about this harness. ───────────────────── */
let poseCorner = null;    // a real cornering flee, reused by leg B
{
  const flow = await freshFlow();
  outer:
  for (let seed = 1; seed <= 60 && !poseCorner; seed++) {
    const g = newGame(seed * 7919);
    for (const dpos of cells(g)) {
      if (g.isIsland(dpos) || g.isHome(dpos) || g.blocked(dpos)) continue;
      const def = g.players[DEF], att = g.players[ATT];
      def.pos = [...dpos];
      const near = cells(g).filter(c => man(c, dpos) === 1 && !g.isIsland(c) && !g.isHome(c));
      if (!near.length) continue;
      att.pos = [...near[0]];
      g.players.forEach((q, i) => { if (i !== DEF && i !== ATT) q.pos = [...g.home]; });
      const list = [...g.sailStates(def, { throughRim: true }).keys()].map(k => k.split(",").map(Number));
      if (!list.length) continue;
      const dest = botFlee(list, att.pos);
      const route = g.sailPath(def, dest, { throughRim: true });
      if (route.length >= 3 && chordCrossesLand(g, dpos, dest)) {
        poseCorner = { seed: seed * 7919, from: [...dpos], attPos: [...att.pos], dest, route };
        break outer;
      }
    }
  }
  if (!poseCorner) missed("no cornering flee could be posed on 60 boards — leg B has no subject");

  /* The engine's OWN sail emitter, on the identical move: does a route reach the wire and walk? */
  const g = newGame(poseCorner.seed);
  const def = g.players[DEF];
  def.pos = [...poseCorner.from];
  g.ev({ t: "newround", p: DEF });
  const before = [...def.pos];
  def.pos = [...poseCorner.dest];
  const ev = g.ev({ t: "sail", p: DEF, route: [before, ...poseCorner.route] });
  useGame(g);
  const walked = await flow.animateSailRoute(ev, g.events.length - 1) === true;
  if (ev.draw && Array.isArray(ev.draw.route) && walked)
    pass(`CONTROL (must draw): the SAME move emitted the engine's way carries a ${ev.draw.route.length}-square route on the `
       + `wire and the walker walks it — the machinery exists and this gate can go green`);
  else missed(`the engine's own sail emit did not produce a walkable route (draw=${JSON.stringify(ev.draw)}, walked=${walked}). `
            + "The harness is not reaching the walker; every verdict below would be meaningless.");

  const f2 = await freshFlow();
  const g2 = newGame(poseCorner.seed);
  g2.ev({ t: "newround", p: DEF });
  const e2 = g2.ev({ t: "newround", p: DEF });
  useGame(g2);
  if (await f2.animateSailRoute(e2, g2.events.length - 1) !== true)
    pass("CONTROL (must NOT draw): an event with no route does not walk — this gate can return false");
  else missed("an event carrying no route reported a walk. This instrument cannot fail and must not be trusted.");
}

/* What the flee site actually does today, read once in B0 and POSED by legs B and D. A behavioural
   leg has to build the event the site emits; hardcoding today's shape would leave this gate red
   forever after a fix. */
let site = { route: false, entryEvent: false, seat: false };

/* ─── B0. THE SITE ITSELF, READ — THE REQUIREMENT, so this gate tracks a fix instead of staying
       red forever. The legs around it are behavioural; a behavioural leg has to POSE the emit,
       and a pose is a copy of today's shape. These two read what the site actually does, and go
       green the moment it does it. Both are reported with the file:line they matched. ─────── */
{
  const orch = fs.readFileSync(path.join(TREE, "src/orchestrator.js"), "utf8");
  const at = i => orch.slice(0, i).split("\n").length;
  const s0 = orch.indexOf("const cells=reachable(def);");
  const emitIdx = orch.indexOf('t:"battleflee"');
  if (s0 < 0 || emitIdx < 0 || emitIdx < s0)
    missed("the battle-flee site (reachable(def) ... battleflee) is not where this gate expects it in src/orchestrator.js — re-anchor, do not delete");
  const block = orch.slice(s0, orch.indexOf("\n", emitIdx));
  const emit = block.slice(block.indexOf('t:"battleflee"'));
  const posIdx = block.indexOf("def.pos=dest");
  const twIdx = block.indexOf("tradewind(def)");
  if (posIdx < 0 || twIdx < 0) missed("def.pos=dest / tradewind(def) not found in the flee block — re-anchor this gate");
  console.log(`  SUBJECT — flee block src/orchestrator.js:${at(s0)}-${at(emitIdx)}, def.pos=dest at :${at(s0 + posIdx)}\n`);

  site.route = /sailPath\(/.test(block) && /\broute\b/.test(emit);
  site.entryEvent = /\.ev\(/.test(block.slice(posIdx, twIdx));
  /* THE SEAT. Game.ev bakes the draw lane against o.state[o.p] — an event with no `p` can never
     carry a route, however carefully the route is computed. The battleflee emit names its captains
     `a` and `d` and has no `p` at all, so FAULT 1 is two missing things, not one. */
  site.seat = /\bp:/.test(emit);
  if (site.seat)
    pass(`FAULT 1b, at the site: the flee event names a seat (\`p\`), so Game.ev can bake a route onto it (src/orchestrator.js:${at(emitIdx)})`);
  else
    fail(`FAULT 1b, at the site: the event emitted at src/orchestrator.js:${at(emitIdx)} carries no \`p\` — it names its `
       + `captains \`a\` and \`d\`. Game.ev bakes the drawn route against o.state[o.p] (src/engine/index.js), so a route `
       + `added to this event would still bake to null. Whoever fixes FAULT 1 must give the event a seat as well as a route.`);
  if (site.route)
    pass(`FAULT 1, at the site: the flee asks sailPath for its route and puts it on the emitted event (src/orchestrator.js:${at(s0 + posIdx)})`);
  else
    fail(`FAULT 1, at the site: src/orchestrator.js:${at(s0 + posIdx)} assigns def.pos=dest with no sailPath call in the block `
       + `(sailPath present: ${/sailPath\(/.test(block)}) and the event emitted at :${at(emitIdx)} carries no route lane `
       + `(route present: ${/\broute\b/.test(emit)}). Nothing reaches the wire for either screen to walk.`);

  const between = block.slice(posIdx, twIdx);
  if (/\.ev\(/.test(between))
    pass(`FAULT 2, at the site: an event is recorded at the flee destination before tradewind(def) (src/orchestrator.js:${at(s0 + twIdx)})`);
  else
    fail(`FAULT 2, at the site: nothing is recorded between def.pos=dest and tradewind(def) (src/orchestrator.js:${at(s0 + posIdx)}-${at(s0 + twIdx)}), `
       + `so the rim entry never enters the event stream and the animator's derivation (src/ui/flow.js:1042-1043) has nothing to find.`);
}

/* ─── B. FAULT 1 — THE FLEE ITSELF, POSED EXACTLY AS src/orchestrator.js:731-735 DOES IT. ─── */
{
  const flow = await freshFlow();
  const g = newGame(poseCorner.seed);
  const def = g.players[DEF], att = g.players[ATT];
  def.pos = [...poseCorner.from]; att.pos = [...poseCorner.attPos];
  g.ev({ t: "newround", p: DEF });
  def.pos = [...poseCorner.dest];                              // orchestrator.js:732 — def.pos=dest
  const ev = site.route                                          // POSED AS THE SITE EMITS IT TODAY
    ? g.ev(site.seat ? { t: "battleflee", p: DEF, a: ATT, d: DEF, rounds: 1, downwind: "a", route: [poseCorner.from, ...poseCorner.route] }
                     : { t: "battleflee", a: ATT, d: DEF, rounds: 1, downwind: "a", route: [poseCorner.from, ...poseCorner.route] })
    : g.ev({ t: "battleflee", a: ATT, d: DEF, rounds: 1, downwind: "a" });   // orchestrator.js:735
  useGame(g);
  const walked = await flow.animateSailRoute(ev, g.events.length - 1) === true;
  const onWire = !!(ev.draw && Array.isArray(ev.draw.route));
  if (onWire && walked)
    pass("a flee around the corner of an island draws its real route");
  else
    fail(`a flee from [${poseCorner.from}] to [${poseCorner.dest}] — ${man(poseCorner.from, poseCorner.dest)} squares apart, `
       + `a ${poseCorner.route.length}-square sailing route, and the straight line between them CROSSES LAND — `
       + `put no route on the wire (draw=${JSON.stringify(ev.draw || null)}) and was not walked (walked=${walked}). `
       + `src/orchestrator.js:732 assigns def.pos=dest without asking sailPath, and :735 emits a battleflee carrying `
       + `no route; animateSailRoute also refuses any event whose t is not "sail" (src/ui/flow.js:1215). Both screens `
       + `draw the boat sliding through the island.`);
}

/* ─── C. HOW OFTEN DOES IT MATTER? The distances and the cornering rate, over seeded boards. ─
       Printed as evidence whatever it says. It fails only if cornering is impossible. */
{
  let n = 0, nonAdj = 0, crossesLand = 0, detour = 0, sum = 0, max = 0;
  let humanAny = 0, humanCross = 0;
  for (let seed = 1; seed <= 25; seed++) {
    const g = newGame(seed * 104729);
    const water = cells(g).filter(c => !g.isIsland(c) && !g.isHome(c) && !g.blocked(c));
    for (let k = 0; k < 24; k++) {
      const dpos = water[(k * 37 + seed * 11) % water.length];
      const near = water.filter(c => man(c, dpos) === 1);
      if (!near.length) continue;
      const def = g.players[DEF], att = g.players[ATT];
      def.pos = [...dpos]; att.pos = [...near[k % near.length]];
      g.players.forEach((q, i) => { if (i !== DEF && i !== ATT) q.pos = [...g.home]; });
      const list = [...g.sailStates(def, { throughRim: true }).keys()].map(s => s.split(",").map(Number));
      if (!list.length) continue;
      const dest = botFlee(list, att.pos);
      const route = g.sailPath(def, dest, { throughRim: true });
      const d = man(dpos, dest);
      n++; sum += d; if (d > max) max = d;
      if (d > 1) nonAdj++;
      if (route.length > d) detour++;
      if (route.length >= 3 && chordCrossesLand(g, dpos, dest)) crossesLand++;
      /* the HUMAN half: a human picks any reachable square, so count how many of the offered
         squares would be drawn through land if chosen. */
      for (const c of list) {
        const r = g.sailPath(def, c, { throughRim: true });
        if (r.length >= 3) { humanAny++; if (chordCrossesLand(g, dpos, c)) humanCross++; }
      }
    }
  }
  if (!n) missed("no flee could be posed on any board — leg C measured nothing");
  const pc = (a, b) => b ? (100 * a / b).toFixed(1) + "%" : "n/a";
  console.log(`\n  MEASURED, ${n} posed flees over 25 seeded boards (the BOT's own rule: farthest from the attacker)`);
  console.log(`    distance from the ship's square to where it flees: mean ${(sum / n).toFixed(2)} squares, max ${max}`);
  console.log(`    more than one square away ................. ${nonAdj}/${n}  ${pc(nonAdj, n)}`);
  console.log(`    the sailing route is longer than the chord . ${detour}/${n}  ${pc(detour, n)}`);
  console.log(`    the STRAIGHT LINE DRAWN CROSSES LAND ...... ${crossesLand}/${n}  ${pc(crossesLand, n)}`);
  console.log(`    a HUMAN's offered squares (3+ squares of sailing): ${humanCross}/${humanAny} ${pc(humanCross, humanAny)} would be drawn through land\n`);
  /* EVIDENCE, NOT A VERDICT. This leg answers "does it matter" — it is a fact about the boards,
     not about the code, so it must NOT hold the gate red after a fix. The faults above are the
     verdict; these numbers are why they are worth fixing. */
  if (crossesLand > 0)
    pass(`WHY IT MATTERS (evidence): ${pc(crossesLand, n)} of bot flees (${crossesLand}/${n}) are drawn along a straight `
       + `line that CROSSES LAND, and ${pc(nonAdj, n)} travel more than one square (mean ${(sum / n).toFixed(2)}). Not a `
       + `footnote — the same picture playtest 21 item 6 was raised about, at the one site the route fix never reached.`);
  else
    pass("no posed flee is drawn across land — the flee route would be a footnote, not a picture problem");
}

/* ─── D. FAULT 2 — THE RIM RIDE, ON BOTH TIERS. ────────────────────────────────────────────── */
{
  const flow = await freshFlow();
  const g = newGame(4242);
  const def = g.players[DEF];
  g.players.forEach((q, i) => { if (i !== DEF) q.pos = [...g.home]; });
  /* a real rim entry whose arc head is elsewhere, and an inland square to be pre-battle at */
  let entry = null;
  for (const cell of g.rim) {
    const [x, y] = cell.split(",").map(Number);
    const head = g.rimHead[cell];
    if (head && (head[0] !== x || head[1] !== y)) { entry = [x, y]; break; }
  }
  if (!entry) missed("no rim cell with an arc head elsewhere — the ride cannot be posed");
  const inland = cells(g).find(c => !g.rim.has(c[0] + "," + c[1]) && !g.isIsland(c) && !g.isHome(c) && !g.blocked(c));
  if (!inland) missed("no inland water square — the pre-battle position cannot be posed");
  def.pos = [...inland];
  g.ev({ t: "newround", p: DEF });
  g.ev({ t: "battle", a: ATT, d: DEF });                 // the PRE-BATTLE snapshot, taken inland
  def.pos = [...entry];                                  // orchestrator.js:732 — def.pos=dest
  if (site.entryEvent) g.ev({ t: "battleflee", a: ATT, d: DEF });   // POSED AS THE SITE RECORDS IT TODAY
  if (!g.tradewind(def)) missed("tradewind() refused the posed flee destination — no ride exists to measure");
  useGame(g);
  const e = g.events[g.events.length - 1];
  const rode = await flow.animateRimSweepIfAny(e, g.events.length - 1) === true;

  /* THE MATCHED GREEN TWIN, on the same board and the same rim entry: record ONE event at the
     destination before tradewind — what the site does not do — and the ride happens. So the red
     below is about the flee site, not about this animator or this harness. */
  const f2 = await freshFlow();
  const g2 = newGame(4242);
  const d2 = g2.players[DEF];
  g2.players.forEach((q, i) => { if (i !== DEF) q.pos = [...g2.home]; });
  d2.pos = [...inland];
  g2.ev({ t: "newround", p: DEF });
  d2.pos = [...entry];
  g2.ev({ t: "battleflee", a: ATT, d: DEF });            // recorded AT the destination
  if (!g2.tradewind(d2)) missed("tradewind() refused the posed twin — the green control cannot be built");
  useGame(g2);
  const twin = await f2.animateRimSweepIfAny(g2.events[g2.events.length - 1], g2.events.length - 1) === true;
  if (twin) pass(`CONTROL (must ride): the SAME flee with one event recorded at the destination [${entry}] DOES ride — this leg can go green`);
  else missed(`the matched twin did not ride either (twin=${twin}) — this leg cannot pass and its red verdict means nothing`);

  if (rode)
    pass("a ship that FLEES onto the rim rides the sweep");
  else
    fail(`a ship that FLEES onto the rim at [${entry}] DID NOT RIDE, on BOTH tiers. events[n-2] still holds the `
       + `pre-battle square [${inland}], so onRim(from) is false at src/ui/flow.js:1043 and the animator declines. `
       + `The ship simply appears at the whirlpool. Consistent between host and guest, and consistently missing — `
       + `exactly the second entry on the animator's own fallback list at src/ui/flow.js:1018-1019, still true.`);
}

console.log(fails
  ? `\nFAILED — ${fails} case(s). A fleeing ship is assigned a destination directly: no route reaches the wire, and no `
    + `rim entry is ever recorded, so both screens draw a slide through the islands and a teleport to the whirlpool.`
  : "\nPASSED — a fleeing ship draws the route it sailed and rides the rim when it flees into the trade winds");
process.exit(fails ? 1 : 0);   // src/ui/stage.js arms a 500ms interval at module load; nothing clears it
