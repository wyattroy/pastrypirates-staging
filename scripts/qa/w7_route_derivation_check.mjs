/* W7b — THE WALKER READS THE WRONG EVENT, SO THE GUEST'S BOAT SLIDES ANYWAY.
 *
 * W7 put the engine's route on the wire and taught the guest tier to walk it, and
 * w7_sail_route_on_wire_check.mjs guards that. A tester then measured the fixed build in two real
 * crew rooms and found it works on FIVE SAILS IN EIGHT: three still slid straight across, two of
 * those three being corner routes — the exact bug W7 exists to remove.
 *
 * WHY, and it is a RACE rather than a wrong constant:
 *   animateSailRoute() takes no parameters and reads `g.events[g.events.length-1]`
 *   (src/ui/flow.js). Its callers do not consume events[n-1] — they consume a SPECIFIC event:
 *     · the guest — src/orchestrator.js watchEvents: the Firebase callback pushes its event and
 *       assigns evIdx BEFORE its first await (deliberately, so a burst cannot reorder the feed),
 *       then awaits consumeEvent(e). Firebase does not await that callback, so the NEXT event's
 *       callback runs and pushes while the first is suspended. events[n-1] is now the later event.
 *     · the host — src/ui/panel.js liveRender: the drain loops every unconsumed event and calls
 *       onConsumeEvent(e) WITHOUT awaiting (fire-and-forget, on purpose, so liveRender stays
 *       synchronous). Every call in a burst therefore sees the same events[n-1] — the last one.
 *   So whenever any event lands behind a sail before its consumer runs, `last.t!=="sail"` and the
 *   walk is skipped: the boat glides straight to the destination, across the islands.
 *   This is timing, not geometry, which is why it is a 5/3 SPLIT and not a clean pass or fail.
 *
 * AND THE RE-ENTRY GUARD HAS THE SAME ROOT: `_lastRoutedEvIdx` is compared against `n-1`, an array
 * POSITION rather than an event identity. Two sails in one burst share a position, so the second
 * is refused; and a second voyage in one page load restarts events at length 1 while the module
 * keeps the old index, so its first sail is refused too.
 *
 * ⚠ WHY THIS GATE IS RUN AND NOT READ, WHICH IS THE WHOLE POINT OF IT.
 * The claim is about CONTROL FLOW UNDER INTERLEAVING. Text cannot see control flow — this suite
 * already learned that the expensive way, when a draft of the W7 gate asserted `return {route:`
 * and `return null` appear in bakeDraw's body and a `return null;` inserted as its FIRST line
 * walked straight through, green. So this gate builds the interleavings and RUNS the real walker.
 *
 * IT NEEDS ALMOST NO BROWSER. Every ship painter in src/ui/board.js early-returns on an empty
 * shipEls, so the walk executes and simply draws nothing; the one genuine requirement is a
 * requestAnimationFrame, plus a document stub for the 500ms camera interval src/ui/stage.js arms
 * at module load. Nothing below stubs anything the walker itself uses to decide.
 *
 * EACH CASE GETS A FRESH MODULE. `_lastRoutedEvIdx` is module-local state, so cases sharing one
 * import contaminate each other — the first draft of this file did exactly that and reported the
 * voyage-2 case GREEN by luck of ordering. Cache-busted imports are what make each case honest.
 *
 * RUN IT AGAINST A DIFFERENT TREE:  node scripts/qa/w7_route_derivation_check.mjs --tree=/some/copy
 */
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const treeArg = process.argv.find(a => a.startsWith("--tree="));
const TREE = treeArg ? path.resolve(treeArg.slice(7)) : REPO;

let fails = 0;
const pass = m => console.log("  PASS  " + m);
const fail = m => { console.log("  FAIL  " + m); fails++; };
/* An instrument that reports NOT FOUND has told you about ITSELF, not about the world. */
const missed = m => { console.log("INSTRUMENT DID NOT REACH ITS SUBJECT — " + m); process.exit(2); };

for (const rel of ["src/ui/flow.js", "src/state/index.js", "src/orchestrator.js", "src/ui/panel.js"])
  if (!fs.existsSync(path.join(TREE, rel))) missed(`${rel} does not exist under ${TREE}`);

globalThis.window = globalThis;
globalThis.addEventListener = () => {};
globalThis.requestAnimationFrame = cb => setTimeout(cb, 0);
globalThis.getComputedStyle = () => ({ display: "none" });
globalThis.document = {
  getElementById: () => null, querySelector: () => null, querySelectorAll: () => [],
  addEventListener() {}, documentElement: { style: {} },
};

const R1 = [[1, 1], [1, 2], [2, 2]];          // 3 squares -> a real corner, clears the <3 straight-hop cull
const R2 = [[5, 5], [5, 6], [6, 6]];
const sail = (seat, route) => ({ t: "sail", p: seat, draw: { route } });

/* One case = one fresh copy of flow.js, so its module-local _lastRoutedEvIdx starts at -1 every
   time. ONLY flow.js is cache-busted, and that is load-bearing: busting src/state/index.js too
   would hand this harness a SECOND appState while flow.js kept importing the original, so nothing
   the harness set would be visible to the walker. The first draft did exactly that and the CONTROL
   case caught it — which is the argument for having a control case at all. */
let loads = 0;
async function freshWalker() {
  const bust = `?w7b=${++loads}-${Date.now()}`;
  const { appState } = await import(pathToFileURL(path.join(TREE, "src/state/index.js")).href);
  const flow = await import(pathToFileURL(path.join(TREE, "src/ui/flow.js")).href + bust);
  if (typeof flow.animateSailRoute !== "function")
    missed("src/ui/flow.js does not export animateSailRoute — re-anchor this gate; do not delete it.");
  return { appState, flow };
}
/* Consume events[idx] the way a real consumer does. The consumed event and its index are HANDED
   OVER: a walker that cannot be told which event it is drawing cannot possibly draw the right one,
   and appState.evIdx is no escape — both call sites set it to events.length-1, so it carries the
   identical race. A fix that ignores these arguments simply stays red here. */
async function consume({ appState, flow }, events, idx) {
  appState.replaying = false;
  appState.ff = true;
  appState.evIdx = events.length - 1;                 // exactly what watchEvents/liveRender set
  appState.game = { events, players: [{ pos: [2, 2] }, { pos: [6, 6] }] };
  return (await flow.animateSailRoute(events[idx], idx)) === true;
}

console.log(`TREE UNDER TEST — ${TREE}`);
console.log(`SUBJECT REACHED — running src/ui/flow.js animateSailRoute() for real, one fresh module per case\n`);

/* ─── 0. THE INSTRUMENT ITSELF, BOTH WAYS. A check that cannot fail is not a measurement, and a
       check that cannot pass condemns working code. Prove both before believing any verdict. ─── */
{
  const w = await freshWalker();
  if (await consume(w, [sail(0, R1)], 0))
    pass("CONTROL (must walk): a lone sail event walks its route — the instrument reaches the walker");
  else missed("a lone sail event did not walk. The harness is not reaching the walker; every verdict below would be meaningless.");

  const n = await freshWalker();
  if (!(await consume(n, [{ t: "newround", p: 0 }], 0)))
    pass("CONTROL (must NOT walk): an event with no route does not walk — this gate can return false");
  else missed("an event carrying no route reported a walk. This instrument cannot fail and must not be trusted.");

  const s = await freshWalker();
  if (!(await consume(s, [sail(0, [[1, 1], [1, 2]])], 0)))
    pass("CONTROL: a 2-square straight hop is still culled — this gate did not delete that behaviour");
  else fail("a 2-square hop walked; the straight-hop cull (route.length<3) is gone, which is a separate regression");
}

/* ─── 1. THE RACE. A sail must walk even when a later event has already landed behind it. ─────
       This is the 3-in-8 the tester measured, and it is the whole item. ─────────────────────── */
{
  const w = await freshWalker();
  const events = [sail(0, R1), { t: "newround", p: 0 }];
  if (await consume(w, events, 0))
    pass("a sail consumed while a LATER event already sits at events[n-1] still walks its route");
  else fail("a sail consumed while a LATER event sits at events[n-1] DID NOT WALK — the walker read events[n-1], "
          + "found a non-sail and skipped. On the wire this is the guest's boat sliding straight across the islands, "
          + "and it happens whenever any event lands behind a sail before its consumer runs (src/ui/flow.js animateSailRoute).");
}

/* ─── 2. THE BURST. Two sails delivered together must BOTH walk their OWN route. ───────────────
       The host's drain (src/ui/panel.js liveRender) starts every unconsumed event without
       awaiting, so a burst is the normal case, not an edge one. ─────────────────────────────── */
{
  const w = await freshWalker();
  const events = [sail(0, R1), sail(1, R2)];
  const first = await consume(w, events, 0);
  const second = await consume(w, events, 1);
  if (first && second)
    pass("both sails of a two-sail burst walk — the re-entry guard identifies the EVENT, not a position");
  else fail(`a two-sail burst walked ${[first && "the first", second && "the second"].filter(Boolean).join(" and ") || "neither"} `
          + `(first=${first}, second=${second}). Both boats moved, one or both without its route: the guard compares `
          + `_lastRoutedEvIdx against events.length-1, a POSITION the two sails share, so it refuses the second `
          + `(src/ui/flow.js).`);
}

/* ─── 3. THE SECOND VOYAGE. Play again without reloading and events restart at length 1, while
       _lastRoutedEvIdx keeps the number it ended the last voyage on. ─────────────────────────
       Constructed to COLLIDE on purpose: voyage 1 ends having routed position 0, voyage 2's
       first sail is position 0 again. Sharing one module is the point of this case. */
{
  const w = await freshWalker();
  const v1 = await consume(w, [sail(0, R1)], 0);
  if (!v1) missed("voyage 1's own sail did not walk — this case cannot set up its collision.");
  const v2 = await consume(w, [sail(1, R2)], 0);
  if (v2)
    pass("the first sail of a SECOND voyage in one page load walks — the guard is not stranded across voyages");
  else fail("the first sail of a SECOND voyage in one page load DID NOT WALK. _lastRoutedEvIdx is a module-local "
          + "array position that survives Play again, so it still holds the last voyage's index and refuses a "
          + "brand-new sail that happens to land on the same one (src/ui/flow.js).");
}

console.log(fails
  ? `\nFAILED — ${fails} case(s). The route reaches the wire, but the walker decides from events[n-1] instead of `
    + `from the event being consumed, so any event landing behind a sail makes the boat slide straight across.`
  : "\nPASSED — the walker draws the route of the event it is given, in a burst, behind a later event, and across voyages");
process.exit(fails ? 1 : 0);   // src/ui/stage.js arms a 500ms interval at module load; nothing clears it
