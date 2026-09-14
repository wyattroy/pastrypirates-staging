#!/usr/bin/env node
/* W2-1 — the day-start weather line, in the words Wyatt chose.
 *
 *   node scripts/qa/w21_weather_line_check.mjs
 *
 * HIS RULINGS, and they are the whole spec:
 *   1. (2026-08-27) "write directions in all caps, eg, SOUTH for all storm and wind"
 *   2. (2026-09-13, the narration pass — SUPERSEDES A-9's storm sentence of 2026-08-28)
 *        "Day 3: Wind still NORTH." for ANY repeated direction — "Make this appear for 2+"
 *        "Day 3: Storm's blowin' NORTH."        a storm that has just started
 *        "Day 3: Storm's now blowin' NORTH."    a storm that goes on, the wind having turned
 *        "Day 3: Storm's still blowin' NORTH."  a storm that goes on the same way
 *      "It'll blow every ship 3 squares NORTH" is gone — the storm's own summary names the squares when it pushes.
 *      "Tomorrow: …" stays (his pick, same night).
 *
 * It renders the REAL EVENT_NARRATION.newround, whose words now live in src/shared/words.js, against the payloads
 * orchestrator.js emits — so it cannot pass on a comment or on a string that is never reached.
 */
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
// Paths DERIVED from this file's own location, never typed (game_url_check.js fails a hardcoded tree path).
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const { EVENT_NARRATION } = await import(pathToFileURL(path.join(ROOT, "src/ui/util.js")).href);

let fails = 0;
const ok  = (m) => console.log("  PASS  " + m);
const bad = (m) => { fails++; console.log("  FAIL  " + m); };
const strip = (h) => String(h).replace(/<[^>]*>/g, "");
const render = (e) => strip(EVENT_NARRATION.newround(e, null, 40, 0).txt);

const CASES = [
  ["calm",                    {round:6,dir:"S",next:"N",nextStorm:false,storm:false,streak:0,windStreak:1}, "Day 6: Wind SOUTH. Tomorrow: NORTH."],
  ["calm, storm forecast",    {round:6,dir:"S",next:null,nextStorm:true,storm:false,streak:0,windStreak:1}, "Day 6: Wind SOUTH. Tomorrow: a storm."],
  ["calm, wind held 2 days",  {round:6,dir:"W",next:"E",nextStorm:false,storm:false,streak:0,windStreak:2}, "Day 6: Wind still WEST. Tomorrow: EAST."],
  ["calm, wind held 3 days",  {round:6,dir:"W",next:"E",nextStorm:false,storm:false,streak:0,windStreak:3}, "Day 6: Wind still WEST. Tomorrow: EAST."],
  ["storm starts",            {round:6,dir:"S",next:"N",nextStorm:false,storm:true,streak:0,windStreak:1},  "Day 6: Storm's blowin' SOUTH. Tomorrow: NORTH."],
  ["storm starts, wind held", {round:6,dir:"S",next:"N",nextStorm:false,storm:true,streak:1,windStreak:2},  "Day 6: Storm's blowin' SOUTH. Tomorrow: NORTH."],
  ["storm goes on, turned",   {round:9,dir:"N",next:"S",nextStorm:false,storm:true,streak:2,windStreak:1},  "Day 9: Storm's now blowin' NORTH. Tomorrow: SOUTH."],
  ["storm goes on, same way", {round:9,dir:"N",next:"S",nextStorm:false,storm:true,streak:3,windStreak:3},  "Day 9: Storm's still blowin' NORTH. Tomorrow: SOUTH."],
  ["storm, storm forecast",   {round:6,dir:"E",next:null,nextStorm:true,storm:true,streak:0,windStreak:1},  "Day 6: Storm's blowin' EAST. Tomorrow: a storm."],
];

console.log("\nThe day-start weather line");
for (const [what, e, want] of CASES) {
  let got; try { got = render(e); } catch (err) { got = "THREW: " + err.message; }
  got === want ? ok(`${what.padEnd(24)} ${got}`)
               : bad(`${what.padEnd(24)} got  "${got}"\n                               want "${want}"`);
}

// His ruling 1 applies to EVERY surface that names a wind, not just this one (rule 8).
console.log("\nDirections are CAPS everywhere a wind or storm is named");
const { DIRNAME } = await import(pathToFileURL(path.join(ROOT, "src/shared/index.js")).href);
for (const [k, v] of Object.entries(DIRNAME))
  v === v.toUpperCase() ? ok(`DIRNAME.${k} = "${v}"`) : bad(`DIRNAME.${k} = "${v}" — not caps`);

console.log("\nNo day's line restates how far a storm pushes — the storm's own summary says it (his pass, 2026-09-13)");
CASES.some(([, e]) => /squares?/i.test(render(e)))
  ? bad("a day's line mentions squares — he cut \"It'll blow every ship 3 squares\" on 2026-09-13")
  : ok("no day's line mentions squares");

console.log(fails ? `\nFAIL — ${fails}\n` : "\nPASS — the weather line reads as he wrote it\n");
process.exit(fails ? 1 : 0);
