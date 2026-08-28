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

const strip = s => s.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").map(l => l.replace(/\/\/.*$/, "")).join("\n");
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
  const body = fnBody(orch, "consumeEvent");
  if (!body) fail("consumeEvent() does not exist in src/orchestrator.js");
  else {
    const SEQ = ["applyActiveSeat(", "syncLogLines(", "animateRimSweepIfAny(", "render(", "spawnPops(", "playForEvent(", "applyEndMeta("];
    let last = -1, ordered = true;
    for (const step of SEQ) {
      const at = body.indexOf(step);
      if (at < 0) { fail(`consumeEvent() is missing ${step}) — a drawing step an event must trigger on every tier`); ordered = false; continue; }
      if (at < last) { fail(`consumeEvent(): ${step}) appears out of order — the guest's animate-before-render ordering is load-bearing`); ordered = false; }
      last = at;
    }
    if (ordered) pass("consumeEvent() holds the full drawing sequence in the proven order (seat → log → sweep → render → pops → sound → end-meta)");
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
