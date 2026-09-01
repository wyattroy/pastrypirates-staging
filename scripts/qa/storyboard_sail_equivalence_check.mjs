#!/usr/bin/env node
/* THE CONVERSION MUST NOT HAVE CHANGED WHICH SAILS WALK.
 *
 *   node scripts/qa/storyboard_sail_equivalence_check.mjs
 *
 * Step 1 of the one-director plan moved the DECISION to ride a sail route out of
 * src/ui/flow.js's animateSailRoute and into present() in src/shared/storyboard.js. Same three
 * lines of policy: does the event carry a baked route, and is it long enough to have a corner?
 *
 * A STRANGLER-FIG CONVERSION IS ONLY SAFE IF IT IS A NO-OP, and "I moved it verbatim" is a claim
 * about the code, not about the world (HARD-WON-LESSONS §12h). So this runs BOTH answers over
 * every route shape that matters and asserts they agree — the old policy re-stated here from
 * flow.js's own history, and the new one imported and RUN.
 *
 * WHY THE OLD POLICY IS RE-STATED RATHER THAN IMPORTED: it no longer exists to import. That is
 * the honest weakness of this gate and it is worth naming — it compares present() against a
 * written-down specification of the old behaviour, not against the old code. What makes that
 * acceptable is that the specification is three lines, quoted from the commit that moved them,
 * and that this file will be deleted when the old path is (step 6). It is a migration gate with
 * an expiry, not a permanent fixture.
 *
 * House convention: no test runner, one PASS/FAIL line per case, every case runs before exit.
 */
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const { present, BEAT_KINDS } = await import(pathToFileURL(path.join(ROOT, "src/shared/storyboard.js")).href);

let failures = 0;
const fail = (w) => { failures++; console.log(`  FAIL  ${w}`); };
const pass = (w) => console.log(`  PASS  ${w}`);
console.log("storyboard_sail_equivalence_check — converting `sail` must not change which sails walk\n");

/* THE OLD POLICY, verbatim from flow.js's animateSailRoute before 2026-08-31:
     const route = ev.draw && ev.draw.route;
     if (!Array.isArray(route) || route.length < 3) return false;
     return animateSailRouteRun(ev.p, route[0], route.slice(1));
   Expressed as: would it have walked, and with what arguments? */
const oldPolicy = (ev) => {
  if (!ev) return null;
  const route = ev.draw && ev.draw.route;
  if (!Array.isArray(route) || route.length < 3) return null;
  return { seat: ev.p, from: route[0], path: route.slice(1) };
};

const sq = (n) => Array.from({ length: n }, (_, i) => [i, i]);
const CASES = [
  ["no event at all",                      null],
  ["a sail with no draw lane",             { t: "sail", p: 1 }],
  ["a sail with an empty draw lane",       { t: "sail", p: 1, draw: {} }],
  ["a sail whose route is not an array",   { t: "sail", p: 1, draw: { route: "nope" } }],
  ["a 0-square route",                     { t: "sail", p: 1, draw: { route: [] } }],
  ["a 1-square route",                     { t: "sail", p: 1, draw: { route: sq(1) } }],
  ["a 2-square hop (the threshold — must NOT walk)", { t: "sail", p: 1, draw: { route: sq(2) } }],
  ["a 3-square route (the threshold — MUST walk)",   { t: "sail", p: 0, draw: { route: sq(3) } }],
  ["a long route",                         { t: "sail", p: 3, draw: { route: sq(12) } }],
  ["seat 0, which must not be read as falsy", { t: "sail", p: 0, draw: { route: sq(5) } }],
  ["a seat that is null",                  { t: "sail", p: null, draw: { route: sq(4) } }],
];

let agreed = 0, walked = 0;
for (const [label, ev] of CASES) {
  const before = oldPolicy(ev);
  const beats = present(ev);
  /* present() returns [] for "converted, draws nothing" and null only for an unconverted kind.
     Every case here IS a sail (or null), so [] is the expected shape of "would not have walked". */
  const after = Array.isArray(beats) && beats.length
    ? { seat: beats[0].seat, from: beats[0].from, path: beats[0].path }
    : null;
  const same = JSON.stringify(before) === JSON.stringify(after);
  if (same) { agreed++; if (after) walked++; }
  else fail(`${label}: the old policy says ${JSON.stringify(before)}, present() says ${JSON.stringify(after)}`);
}
agreed === CASES.length
  ? pass(`all ${CASES.length} route shapes agree, and ${walked} of them walk — the threshold, the seat and the squares are unchanged`)
  : fail(`${CASES.length - agreed} of ${CASES.length} route shapes disagree`);

/* AND THE GATE MUST BE ABLE TO FAIL. A comparison that cannot separate the two answers is not a
   comparison — this is the "check the instrument can fail before believing it" rule, and it has
   caught three vacuous checks in this repo already. */
{
  const bent = (ev) => { const r = ev && ev.draw && ev.draw.route; return (!Array.isArray(r) || r.length < 4) ? null : { seat: ev.p, from: r[0], path: r.slice(1) }; };
  const three = { t: "sail", p: 1, draw: { route: sq(3) } };
  const catchesThreshold = JSON.stringify(bent(three)) !== JSON.stringify(oldPolicy(three));
  const catchesSeat = JSON.stringify({ ...oldPolicy(three), seat: 9 }) !== JSON.stringify(oldPolicy(three));
  catchesThreshold && catchesSeat
    ? pass("red-proof: this comparison separates a moved threshold and a changed seat — it can fail")
    : fail(`red-proof FAILED (threshold:${catchesThreshold} seat:${catchesSeat}) — the comparison may be vacuous`);
}

/* EVERY BEAT KIND L3 CAN EMIT MUST HAVE A PERFORMER IN L4. An unknown beat throws there rather
   than skipping, but a throw at runtime is a player watching a screen stop. Catch it at build. */
{
  const fs = await import("node:fs");
  const perf = fs.readFileSync(path.join(ROOT, "src/ui/flow.js"), "utf8");
  const missing = BEAT_KINDS.filter(k => !new RegExp(`case\\s*["']${k}["']`).test(perf));
  missing.length === 0
    ? pass(`L4 has a performer for all ${BEAT_KINDS.length} beat kind(s) L3 can emit: ${BEAT_KINDS.join(", ")}`)
    : fail(`L3 can emit beat kind(s) L4 cannot play: ${missing.join(", ")} — that throws at runtime, which is a player watching the screen stop`);
}

console.log(`\n${failures ? "FAIL" : "PASS"} — ${failures} failure(s)`);
process.exit(failures ? 1 : 0);
