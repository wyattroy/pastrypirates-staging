#!/usr/bin/env node
// scripts/qa/event_actor_field_check.mjs
//
// THE SEA TRIAL'S CRASH, ROOT-CAUSED. 2026-08-31, the 465-commit branch: EVERY Chromium leg of a
// full sea trial crashed identically, within the first turn of every mode, with
// "TypeError: Cannot read properties of undefined (reading 'replace') at pname()". Traced through
// a full stack trace (widened console capture, scripts/lib/cdp.mjs) to
// src/ui/util.js:narrateCurrentBody -- pn(e.p) on a "turn" event whose .p was undefined.
//
// THE CAUSE: commit b3c7b12c, "rename the player `p` to `player`... function by function",
// mechanically renamed the LOCAL VARIABLE `p` to `player` inside botTurn/humanTurn and eight
// sibling functions in src/ui/flow.js -- and swept the EVENT SCHEMA FIELD NAME along with it,
// nine times: `g.ev({t:"turn",p:p.idx})` became `g.ev({t:"turn",player:player.idx})`. The field
// key is not a local variable; it is a wire-format contract every consumer depends on spelling
// exactly "p" -- narrationSubjects() reads `e.p` unconditionally for every event type,
// applyActiveSeat's own comment names "turn/sail/dock/pass/attack" as carrying `p`, and the
// engine's OWN emission of the same five event types (src/engine/index.js) still correctly uses
// `p:`. Nine emissions in flow.js (purse, dock, openoffer x2, sail x3, turn x2) drifted from that
// schema; the engine side never did, because the rename commit never touched engine/index.js.
//
// WHY GREP FOR THE ENGINE'S OWN LIST RATHER THAN HARD-CODING ONE: the set of event types that
// carry an actor is derived from engine/index.js's own emissions (the canonical schema), not
// typed by hand here -- a new actor-carrying event type added to the engine later needs no edit
// to this gate to be covered, and one added only in flow.js with a fabricated actor field would
// still be missed by construction, same as this session's bug was, until it drifts from the
// engine's own list. Never trust a hand-kept list to detect the failure it exists to prevent.
//
// Checks the REAL source files, never a copy (HARD-WON-LESSONS §12i).

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = join(fileURLToPath(import.meta.url), "..", "..", "..");
const ENGINE = readFileSync(join(REPO_ROOT, "src", "engine", "index.js"), "utf8");
const UI_FILES = ["src/ui/flow.js", "src/orchestrator.js"].map((p) => [p, readFileSync(join(REPO_ROOT, p), "utf8")]);

// Derive the canonical actor-carrying event types from the engine's own emissions: any
// `this.ev({t:"X",p:...})` (p immediately after the type, in either order within the object is
// NOT assumed -- only the common "t" then "p" adjacent shape the engine actually uses).
const actorTypes = new Set();
for (const m of ENGINE.matchAll(/this\.ev\(\{t:"([a-zA-Z]+)",p:/g)) actorTypes.add(m[1]);
if (actorTypes.size === 0) {
  console.error("FAIL — derived ZERO actor-carrying event types from src/engine/index.js; the pattern this gate looks for may have drifted from the engine's real emission shape");
  process.exit(1);
}

const failures = [];
for (const [path, src] of UI_FILES) {
  for (const type of actorTypes) {
    // Any emission of this type in the UI layer must use the SAME field name the engine does: p.
    // A `player:` (or any other) field name for one of these types is exactly this session's bug.
    const wrongRe = new RegExp(`\\.ev\\(\\{t:"${type}",(?!p:)[a-zA-Z]+:`, "g");
    for (const m of src.matchAll(wrongRe)) {
      const line = src.slice(0, m.index).split("\n").length;
      failures.push(`${path}:${line}: emits "${type}" without a "p:" actor field immediately after "t:" (engine/index.js uses p: for this type) — ${m[0]}`);
    }
  }
}

if (failures.length) {
  console.error("FAIL — event actor field check");
  for (const f of failures) console.error(`  - ${f}`);
  console.error("\nEvery event type the engine emits with a p: actor field must be emitted the same way");
  console.error("everywhere else (rule 23, ONE DISPLAY PATH doesn't apply only to rendering — a schema");
  console.error("field is exactly the kind of thing that must never fork). narrationSubjects(), the");
  console.error("narration table's own p-reading handlers, and applyActiveSeat all read e.p unconditionally.");
  process.exit(1);
}

console.log(`PASS — all ${actorTypes.size} actor-carrying event type(s) (${[...actorTypes].sort().join(", ")}) use the same "p:" field everywhere they're emitted, matching the engine's own schema`);
process.exit(0);
