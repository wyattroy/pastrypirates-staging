/* THE ONE EVENT CONSUMER — Wave 1's heart, 2026-08-28.
 *
 * Wyatt: "fix all the described architecture so both host and guest listen to one game activity
 * engine." For the EVENT channel that means: the whole drawing sequence an event triggers —
 * active-seat, rim sweep, render, pops, sound, end-meta — lives in ONE function, and every tier
 * reaches it: the guest from the Firebase listener, the host and solo/pass-and-play from the
 * local drain (Rule A: the host's own screen never round-trips through Firebase).
 *
 * THE WORK WAS NEVER ADDING THE SHARED CONSUMER — IT WAS DELETING THE TWO INLINE COPIES
 * (HANDOFF-2026-08-28-WAVE1.md §2). Until both liveRender and watchEvents stop drawing inline,
 * two orchestrations can drift exactly the way the guest's flip ceremony drifted for three
 * phases. So the assertions here are mostly ABSENCE assertions on the two old bodies.
 * Run RED against the pre-convergence tree on 2026-08-28.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

let fails = 0;
const pass = m => console.log("PASS " + m);
const fail = m => { console.log("FAIL " + m); fails++; };
const orch = fs.readFileSync(path.join(REPO, "src/orchestrator.js"), "utf8");
const panel = fs.readFileSync(path.join(REPO, "src/ui/panel.js"), "utf8");

/* ONE STRIPPER (2026-08-29). Every gate carried its own copy, and every copy deleted BLOCK
   comments first — so a LINE comment containing the characters that open one swallowed 152
   lines of src/orchestrator.js, the whole import block included, in eight gates at once.
   See scripts/qa/lib/strip_comments.mjs for the measurement. */
import { stripComments as strip } from "./lib/strip_comments.mjs";
function fnBody(src, name) {
  const h = src.search(new RegExp(`export (async )?function ${name}\\(`));
  if (h < 0) return null;
  let i = src.indexOf("{", h), depth = 0, j = i;
  for (; j < src.length; j++) {
    if (src[j] === "{") depth++;
    else if (src[j] === "}") { depth--; if (!depth) break; }
  }
  return src.slice(i, j + 1);
}

/* 1. the consumer exists and holds the WHOLE drawing sequence, in the guest's proven order */
{
  /* ⚠ STRIPPED, AND THAT IS NOT A TIDY-UP. This block used to index into the RAW body, and
     consumeEvent() is one of the most heavily commented functions in the project — a comment that
     merely NAMES a later step (they all do: "both are awaited", "spawnPops stays below") lands an
     earlier index for it than its real call site and the order check silently reads the prose
     instead of the code. Section 3 below already stripped for exactly this reason; section 1 did
     not, which meant the one gate guarding the drawing ORDER was the one that could be fooled
     about it. Measured 2026-09-07 while moving playForEvent: the raw body reported
     spawnPops-before-playForEvent when the code says the opposite. */
  const body = strip(fnBody(orch, "consumeEvent") || "");
  if (!body) fail("consumeEvent() does not exist in src/orchestrator.js");
  else {
    /* ⭐ SOUND MOVED TO THE TOP, 2026-09-07. Wyatt: "Sailing sound should happen at the BEGINNING
       of a sail animation — it currently happens at the end. This should be applied to ALL
       players." playForEvent() sat AFTER the two awaited animations, so every cue in the game was
       dispatched once the boat had stopped moving. It now sits above them and this order pins it.
       The pops stay below the walk on purpose — coins land where the boat arrives. */
    const SEQ = ["applyActiveSeat(", "syncLogLines(", "playForEvent(", "animateRimSweepIfAny(", "render(", "spawnPops(", "applyEndMeta("];
    let last = -1, ordered = true;
    for (const step of SEQ) {
      const at = body.indexOf(step);
      if (at < 0) { fail(`consumeEvent() is missing ${step}) — a drawing step an event must trigger on every tier`); ordered = false; continue; }
      if (at < last) { fail(`consumeEvent(): ${step}) appears out of order — the guest's animate-before-render ordering is load-bearing`); ordered = false; }
      last = at;
    }
    if (ordered) pass("consumeEvent() holds the full drawing sequence in the proven order (seat → log → SOUND → sweep → render → pops → end-meta)");
    /* The specific regression his playtest caught, asserted on its own so a future reorder fails
       with the reason rather than with "out of order". */
    const iSound = body.indexOf("playForEvent("), iSail = body.indexOf("animateSailRoute(");
    if (iSound >= 0 && iSail >= 0 && iSound < iSail)
      pass("the sound is dispatched BEFORE the sail walk is awaited — his item 13, structurally");
    else
      fail("playForEvent() is below animateSailRoute() again — every cue in the game will land after the boat has finished moving, which is the defect Wyatt reported on 2026-09-07");
  }
}

/* 2. both tiers reach it */
{
  const w = strip(fnBody(orch, "watchEvents") || "");
  if (/consumeEvent\(/.test(w)) pass("watchEvents() (the guest) consumes through consumeEvent");
  else fail("watchEvents() does not reach consumeEvent — the guest still has its own orchestration");
  const l = strip(fnBody(panel, "liveRender") || "");
  if (/onConsumeEvent|consumeEvent\(/.test(l)) pass("liveRender() (host/solo/pass-and-play drain) consumes through consumeEvent");
  else fail("liveRender() does not reach consumeEvent — the host still draws from its own loop");
}

/* 3. THE DELETIONS — the two inline copies are gone. Comment-stripped so tombstones may explain. */
{
  const w = strip(fnBody(orch, "watchEvents") || "");
  let wOk = true;
  for (const step of ["render(", "spawnPops(", "playForEvent(", "applyEndMeta(", "applyActiveSeat("]) {
    if (w.includes(step)) { fail(`watchEvents() still inlines ${step}) beside the shared consumer — the drift the convergence exists to end`); wOk = false; }
  }
  if (wOk) pass("watchEvents(): no inline drawing beside the consumer");
  const l = strip(fnBody(panel, "liveRender") || "");
  let lOk = true;
  for (const step of ["spawnPops(", "playForEvent(", "render("]) {
    if (l.includes(step)) { fail(`liveRender() still inlines ${step}) beside the shared consumer`); lOk = false; }
  }
  if (lOk) pass("liveRender(): no inline drawing beside the consumer");
}

/* ⭐ 3b. THE DISPLAY BELONGS TO THE CONSUMER — no turn loop may reach past the drain.
      Wyatt, 2026-09-08: "All players, bot or human, are supposed to feed actions to an engine,
      which feeds events back, which a different piece of code displays. Is that not what you built
      here?" It is, and section 3 above already proves no drain draws for itself. This is the OTHER
      half of the same claim, and until today it was untrue: seven call sites in the turn loops
      awaited an animation DIRECTLY, beside their own liveRender(), because the drain was
      fire-and-forget and a loop that must stay behind a moving boat had nothing else to wait on.
      That is what let the ride and the drain get out of order for a year — the boat glided while
      its event sat unread, so the sound landed as the boat ARRIVED.
      liveRender() returns a promise now, so a turn loop awaits THE DRAIN. The rides have exactly
      one caller left in the tree and it is consumeEvent. This assertion is what keeps it that way:
      the next person who needs to wait for a boat must await the drain, not the picture. */
{
  const flow = strip(fs.readFileSync(path.join(REPO, "src/ui/flow.js"), "utf8"));
  const consumer = strip(fnBody(orch, "consumeEvent") || "");
  const orchAll = strip(orch);
  const RIDES = ["animateSailRoute", "animateRimSweepIfAny"];
  const calls = (src, name) => {
    // a CALL, never the declaration: `function <name>(` is excluded by the lookbehind
    const re = new RegExp(`(?<!function\\s)\\b${name}\\s*\\(`, "g");
    return [...src.matchAll(re)].length;
  };
  let clean = true;
  for (const ride of RIDES) {
    const inFlow = calls(flow, ride);
    if (inFlow > 0) {
      fail(`src/ui/flow.js calls ${ride}() ${inFlow} time(s) outside its own declaration — a turn ` +
           `loop is awaiting the PICTURE instead of the drain. Await liveRender() instead: it ` +
           `returns a promise, and the one consumer owns the drawing.`);
      clean = false;
    }
    const inOrch = calls(orchAll, ride), inConsumer = calls(consumer, ride);
    if (inOrch !== inConsumer) {
      fail(`src/orchestrator.js calls ${ride}() ${inOrch} time(s) but only ${inConsumer} of them ` +
           `are inside consumeEvent — every ride must belong to the one consumer.`);
      clean = false;
    }
    if (inConsumer < 1) {
      fail(`consumeEvent never calls ${ride}() — ANTI-VACUITY: this assertion must not pass by ` +
           `finding nothing anywhere.`);
      clean = false;
    }
  }
  if (clean) pass("the rides belong to consumeEvent alone — no turn loop reaches past the drain");
}

/* 4. Rule A holds: the local drain never reads its own write back. The consumer must not be
      reachable on the host FROM the Firebase callback — watchEvents' host-side no-op guard (or
      the attach-site fork that only attaches watchEvents on a guest) is what prevents the
      round-trip. The attach fork at beginGame is the live mechanism; assert it still exists. */
{
  if (/else\{watchEvents\(\);/.test(orch.replace(/\s+/g, ""))) pass("watchEvents still attaches on the guest branch only (Rule A: the host's screen never round-trips)");
  else fail("cannot find the guest-only watchEvents attach — if the host now listens to its own event feed, that is the Rule A round-trip");
}

/* 5. A STATE CHANGE IS NOT AN EVENT — the drain cannot redraw one (found by the 2026-08-28 sea
      trial, both solo legs). liveRender() consumes each event exactly ONCE (A-13); calling it
      after a bare appState change draws NOTHING once the frontier is consumed. endVoyage set
      liveDone=true and called liveRender() — every event was already consumed, render() never
      ran with liveDone set, and the End of Voyage screen never appeared IN ANY MODE. The engine
      finished; the screen sat silent. So: every site that sets liveDone=true must call render()
      itself, the way applyEndMeta (the guest twin) always has. Run RED against the drain-only
      endVoyage. */
{
  const clean = strip(orch);
  const sites = [...clean.matchAll(/appState\.liveDone\s*=\s*true/g)];
  if (!sites.length) fail("no liveDone=true site found in orchestrator — re-anchor this assertion, do not delete it");
  for (const m of sites) {
    const after = clean.slice(m.index, m.index + 400);
    if (/(?<![a-zA-Z])render\(\)/.test(after)) pass("a liveDone=true site calls render() itself — the End of Voyage screen cannot depend on an unconsumed event existing");
    else fail(`liveDone=true at orchestrator offset ${m.index} is not followed by a render() call — the drain has nothing left to consume there, so the End of Voyage screen never appears`);
  }
}

console.log(fails ? `\nFAILED — ${fails} assertion(s)` : "\nPASSED — one event consumer, three producers");
process.exit(fails ? 1 : 0);
