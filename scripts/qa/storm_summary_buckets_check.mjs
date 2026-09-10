/* THE STORM SUMMARY'S BUCKETS SURVIVE THE WIRE — the crash that killed CREW voyages.
 *
 *   node scripts/qa/storm_summary_buckets_check.mjs
 *
 * ============================================================================
 *  The bug this holds closed
 * ============================================================================
 * Named in Wyatt's own 2026-08-21 handoff as an open, game-stopping fault: "stormSummary reading
 * .length of undefined". It survived four months because it CANNOT happen outside a crew game.
 *
 *   · Game.stormSummaryEvent() builds five buckets — moved/held/shipHeld/blown/swept — and only
 *     emits when at least one has somebody in it. The others are therefore `[]`.
 *   · Firebase RTDB does not store an empty array. It stores nothing.
 *   · So a guest receives the event with those fields UNDEFINED, and the narration's very first
 *     line, `if(e.moved.length)`, throws.
 *   · A host reads the array it just built, in memory. A solo game never crosses a wire.
 *
 * fixEv() is the one seam that repairs wire-mangled events — it has always done exactly this for
 * `state[].ing`, for exactly the same reason.
 *
 * ============================================================================
 *  What is actually invariant, and why this is not a typed list
 * ============================================================================
 * The bucket names must be THE SAME in two places that cannot see each other: the engine that emits
 * them and the repair that restores them. A sixth bucket added to the engine with no entry in
 * fixEv() re-opens the identical crash — silently, and only in crew, which is the hardest place to
 * notice. So this reads the engine's own emit line and requires fixEv's list to match it exactly.
 * Neither list is authoritative on its own; agreement is the check.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = p => fs.readFileSync(path.join(REPO, p), "utf8");
let bad = 0;
const pass = m => console.log("  PASS  " + m);
const fail = m => { bad++; console.log("  FAIL  " + m); };

console.log("THE STORM SUMMARY's buckets survive the wire (the crew crash)\n");

const eng = read("src/engine/index.js");
const util = read("src/ui/util.js");

/* The engine's own emit, read rather than remembered. */
const emit = eng.match(/this\.ev\(\{\s*t:\s*"stormSummary"([^)]*)\)/);
const emitted = emit ? [...emit[1].matchAll(/(\w+)\s*:\s*g\.(\w+)/g)].map(m => m[1]) : [];
emitted.length >= 4
  ? pass(`instrument reached its subject — the engine emits ${emitted.length} bucket(s): ${emitted.join(", ")}`)
  : fail("cannot find Game.stormSummaryEvent's ev() call — re-anchor this gate, do not delete it");

const decl = util.match(/export\s+const\s+STORM_BUCKETS\s*=\s*\[([^\]]*)\]/);
const repaired = decl ? [...decl[1].matchAll(/"([^"]+)"/g)].map(m => m[1]) : [];
repaired.length
  ? pass(`fixEv() repairs ${repaired.length} bucket(s): ${repaired.join(", ")}`)
  : fail("STORM_BUCKETS is missing from src/ui/util.js — the crew crash is re-opened");

const missing = emitted.filter(k => !repaired.includes(k));
const extra = repaired.filter(k => !emitted.includes(k));
missing.length === 0 && extra.length === 0 && emitted.length > 0
  ? pass("the two lists agree exactly — no bucket can reach a guest undefined")
  : fail(`the lists disagree — emitted-but-not-repaired: [${missing}] · repaired-but-not-emitted: [${extra}]`);

/* And the repair must actually run for this event type. */
/e\.t\s*===\s*"stormSummary"[\s\S]{0,120}STORM_BUCKETS/.test(util)
  ? pass("fixEv() applies the repair to stormSummary events")
  : fail("fixEv() declares STORM_BUCKETS but does not apply it to stormSummary");

/* RED PROOF — this gate can FAIL. Two gates in this repo shipped unable to fail at all. */
const mutantEng = 'this.ev({t:"stormSummary",dir:d,moved:g.moved,held:g.held,shipHeld:g.shipHeld,blown:g.blown,swept:g.swept,becalmed:g.becalmed})';
const mutantKeys = [...mutantEng.matchAll(/(\w+)\s*:\s*g\.(\w+)/g)].map(m => m[1]);
mutantKeys.some(k => !repaired.includes(k))
  ? pass("RED-PROOF: a sixth bucket added to the engine alone would be caught")
  : fail("RED-PROOF FAILED: a new engine bucket would slip past this check");

console.log(bad ? `\nFAILED — ${bad} problem(s)` : "\nPASSED — the engine and the wire repair name the same buckets");
process.exit(bad ? 1 : 0);
