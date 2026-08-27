#!/usr/bin/env node
/* W2-1 — the day-start weather line, in the shape Wyatt chose on 2026-08-27.
 *
 *   node scripts/qa/w21_weather_line_check.mjs
 *
 * HIS TWO RULINGS, and they are the whole spec:
 *   1. "write directions in all caps, eg, SOUTH for all storm and wind"
 *   2. "Option B but remove '3 squares'; reasoning: the game already teaches you this automatically"
 *
 * It renders the REAL EVENT_NARRATION.newround against the REAL payloads orchestrator.js emits, so
 * it cannot pass on a comment or on a string that is never reached. Every branch is exercised:
 * calm, calm-with-storm-forecast, storm, held storm, and storm-with-storm-forecast.
 *
 * NO OTHER GATE PROTECTS THIS COPY — nothing under scripts/ contains these literals and the
 * narration tests that did are in the parked test:v1 chain. This is the only thing standing here.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
// Paths DERIVED from this file's own location, never typed. game_url_check.js fails the build on a
// hardcoded tree path, and it caught this check on its first run — the cutover moved every path
// once already, and a gate that 404s when the tree moves protects nothing.
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const { EVENT_NARRATION } = await import(path.join(ROOT, "src/ui/util.js"));

let fails = 0;
const ok  = (m) => console.log("  PASS  " + m);
const bad = (m) => { fails++; console.log("  FAIL  " + m); };
const strip = (h) => String(h).replace(/<[^>]*>/g, "");

const render = (e) => strip(EVENT_NARRATION.newround(e, null, 40, 0).txt);

const CASES = [
  ["calm",                  {round:6,dir:"S",next:"N",nextStorm:false,storm:false,streak:0,windStreak:1}, "Day 6: Wind SOUTH. Tomorrow: NORTH."],
  ["calm, storm forecast",  {round:6,dir:"S",next:null,nextStorm:true,storm:false,streak:0,windStreak:1}, "Day 6: Wind SOUTH. Tomorrow: a storm."],
  ["calm, wind held",       {round:6,dir:"W",next:"E",nextStorm:false,storm:false,streak:0,windStreak:3}, "Day 6: Wind WEST. Tomorrow: EAST."],
  ["storm",                 {round:6,dir:"S",next:"N",nextStorm:false,storm:true,streak:0,windStreak:1},  "Day 6: Storm blowin’ SOUTH. Tomorrow: NORTH."],
  ["storm held",            {round:9,dir:"N",next:"S",nextStorm:false,storm:true,streak:2,windStreak:2},  "Day 9: Storm still NORTH. Tomorrow: SOUTH."],
  ["storm, storm forecast", {round:6,dir:"E",next:null,nextStorm:true,storm:true,streak:0,windStreak:1},  "Day 6: Storm blowin’ EAST. Tomorrow: a storm."],
];

console.log("\nThe day-start weather line");
for (const [what, e, want] of CASES) {
  let got; try { got = render(e); } catch (err) { got = "THREW: " + err.message; }
  got === want ? ok(`${what.padEnd(22)} ${got}`)
               : bad(`${what.padEnd(22)} got  "${got}"\n                             want "${want}"`);
}

// His ruling 1 applies to EVERY surface that names a wind, not just this one (rule 8).
console.log("\nDirections are CAPS everywhere a wind or storm is named");
const { DIRNAME } = await import(path.join(ROOT, "src/shared/index.js"));
for (const [k, v] of Object.entries(DIRNAME))
  v === v.toUpperCase() ? ok(`DIRNAME.${k} = "${v}"`) : bad(`DIRNAME.${k} = "${v}" — not caps`);

// And the storm's 3-square rule is GONE from this line, by his ruling 2.
console.log("\nThe 3-square rule is no longer typed into the weather line");
const anySquares = CASES.some(([, e]) => /squares?/i.test(render(e)));
anySquares ? bad("a line still says 'squares' — he asked for it removed") : ok("no line mentions squares");

console.log(fails ? `\nFAIL — ${fails}\n` : "\nPASS — the weather line reads as he wrote it\n");
process.exit(fails ? 1 : 0);
