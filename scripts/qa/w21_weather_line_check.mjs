#!/usr/bin/env node
/* W2-1/A-9 — the day-start weather line, in the shape Wyatt chose.
 *
 *   node scripts/qa/w21_weather_line_check.mjs
 *
 * HIS RULINGS, and they are the whole spec (A-9, 2026-08-28, superseding the 2026-08-27 "remove
 * 3 squares" — his own later word, Q-9 option (b)):
 *   1. "write directions in all caps, eg, SOUTH for all storm and wind"
 *   2. calm days stay short; a STORM day keeps a sentence of its own carrying the rule —
 *      "It'll blow every ship 3 squares WEST" — because it is the only place the game states how
 *      far a storm moves you. The distance and direction must be DERIVED (STORM_PUSH, DIRNAME),
 *      never typed: this gate builds its expected strings from the same constants.
 *
 * It renders the REAL EVENT_NARRATION.newround against the REAL payloads orchestrator.js emits, so
 * it cannot pass on a comment or on a string that is never reached. Every branch is exercised:
 * calm, calm-with-storm-forecast, storm, held storm, and storm-with-storm-forecast.
 *
 * NO OTHER GATE PROTECTS THIS COPY — nothing under scripts/ contains these literals and the
 * narration tests that did are in the parked test:v1 chain. This is the only thing standing here.
 */
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
// Paths DERIVED from this file's own location, never typed. game_url_check.js fails the build on a
// hardcoded tree path, and it caught this check on its first run — the cutover moved every path
// once already, and a gate that 404s when the tree moves protects nothing.
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const { EVENT_NARRATION } = await import(pathToFileURL(path.join(ROOT, "src/ui/util.js")).href);

let fails = 0;
const ok  = (m) => console.log("  PASS  " + m);
const bad = (m) => { fails++; console.log("  FAIL  " + m); };
const strip = (h) => String(h).replace(/<[^>]*>/g, "");

const render = (e) => strip(EVENT_NARRATION.newround(e, null, 40, 0).txt);

const { STORM_PUSH } = await import(pathToFileURL(path.join(ROOT, "src/shared/index.js")).href);
const rule = (d) => ` It’ll blow every ship ${STORM_PUSH} squares ${d}.`;   // derived, exactly as the line must derive it
const CASES = [
  ["calm",                  {round:6,dir:"S",next:"N",nextStorm:false,storm:false,streak:0,windStreak:1}, "Day 6: Wind SOUTH. Tomorrow: NORTH."],
  ["calm, storm forecast",  {round:6,dir:"S",next:null,nextStorm:true,storm:false,streak:0,windStreak:1}, "Day 6: Wind SOUTH. Tomorrow: a storm."],
  ["calm, wind held",       {round:6,dir:"W",next:"E",nextStorm:false,storm:false,streak:0,windStreak:3}, "Day 6: Wind WEST. Tomorrow: EAST."],
  ["storm",                 {round:6,dir:"S",next:"N",nextStorm:false,storm:true,streak:0,windStreak:1},  "Day 6: Storm blowin’ SOUTH."+rule("SOUTH")+" Tomorrow: NORTH."],
  ["storm held",            {round:9,dir:"N",next:"S",nextStorm:false,storm:true,streak:2,windStreak:2},  "Day 9: Storm still NORTH."+rule("NORTH")+" Tomorrow: SOUTH."],
  ["storm, storm forecast", {round:6,dir:"E",next:null,nextStorm:true,storm:true,streak:0,windStreak:1},  "Day 6: Storm blowin’ EAST."+rule("EAST")+" Tomorrow: a storm."],
];

console.log("\nThe day-start weather line");
for (const [what, e, want] of CASES) {
  let got; try { got = render(e); } catch (err) { got = "THREW: " + err.message; }
  got === want ? ok(`${what.padEnd(22)} ${got}`)
               : bad(`${what.padEnd(22)} got  "${got}"\n                             want "${want}"`);
}

// His ruling 1 applies to EVERY surface that names a wind, not just this one (rule 8).
console.log("\nDirections are CAPS everywhere a wind or storm is named");
const { DIRNAME } = await import(pathToFileURL(path.join(ROOT, "src/shared/index.js")).href);
for (const [k, v] of Object.entries(DIRNAME))
  v === v.toUpperCase() ? ok(`DIRNAME.${k} = "${v}"`) : bad(`DIRNAME.${k} = "${v}" — not caps`);

// A-9: the rule sentence appears on STORM days only, never on calm ones — and its number comes
// off STORM_PUSH, so this assertion re-renders with nothing typed.
console.log("\nThe storm rule rides storm days only");
const calmSquares = CASES.filter(([,e])=>!e.storm).some(([, e]) => /squares?/i.test(render(e)));
calmSquares ? bad("a CALM day's line mentions squares — the rule belongs to storm days only") : ok("calm days stay short — no rule sentence");
const stormAll = CASES.filter(([,e])=>e.storm).every(([, e]) => new RegExp(`${STORM_PUSH} squares`).test(render(e)));
stormAll ? ok(`every storm day states the rule with the DERIVED distance (${STORM_PUSH})`) : bad("a storm day is missing the rule sentence or types its own number");

console.log(fails ? `\nFAIL — ${fails}\n` : "\nPASS — the weather line reads as he wrote it\n");
process.exit(fails ? 1 : 0);
