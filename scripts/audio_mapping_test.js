#!/usr/bin/env node
// scripts/audio_mapping_test.js
//
// Phase 21 (AUDIO-01/21-VALIDATION.md § Wave 0): the DOM-free harness every task in this phase's
// plans asserts through. 21-01 gated src/ui/audio.js's pure surface only — the sfx file
// table, the per-stem volume table, the mute key, and mute get/set's no-audio-graph-required
// safety. 21-02 (this wave) extends the same file with the 25-key EVENT_SOUND mapping: the
// key-set-matches-EVENT_NARRATION assertions, the per-key no-throw dispatch, the storm-stamp
// guard (D-08's fires-once pinned against Game.ev()'s habit of stamping `storm` onto every event
// of a stormy round), and the two flagged placeholder constants.
//
// Convention (matches scripts/narration_test.js): no assertion library, a local
// check(name, actual, expected) counter, plain console.log, process.exit(failures?1:0). Direct
// `import` of the audio surface from src/ui/audio.js — no DOM reference, no import of
// src/ui/board.js or src/orchestrator.js.
//
// The bare `import` of ../src/ui/audio.js immediately below is itself the first, unnamed
// assertion this script makes: if that module ever starts constructing an AudioContext, reading
// document, or reading localStorage at module load, this script throws before its first check
// line ever prints. That is the design constraint 21-VALIDATION.md imposes on the implementation
// (Wave 0 Requirements: "factor the mapping table and dispatch lookup so they are importable
// without constructing a live AudioContext"), made load-bearing by this harness's own existence.

import fs from "node:fs";
import {
  SFX_DIR, SFX_FILES, SFX_VOLUME, MUTE_KEY, isMuted, setMuted,
  EVENT_SOUND, soundForEvent, STORM_VOLUME, STORM_FADE_SEC,
  WIN_SOUND_PLACEHOLDER, BATTLE_ENGAGE_SOUND,
} from "../src/ui/audio.js";
// EVENT_NARRATION import style matches scripts/narration_test.js:24-27 exactly — proof that
// importing the narration surface headlessly (no DOM, no src/ui/flow.js or src/ui/panel.js)
// works, and the load-bearing baseline this script's own mapping-completeness checks pin against.
import { EVENT_NARRATION } from "../src/ui/util.js";
import { statSync } from "node:fs";

let failures = 0;
function check(name, actual, expected) {
  const ok = actual === expected;
  if (!ok) failures++;
  console.log(`  ${(ok ? "PASS" : "FAIL").padEnd(5)} ${name.padEnd(78)} got=${JSON.stringify(actual)} want=${JSON.stringify(expected)}`);
}
function checkTrue(name, actual) { check(name, actual, true); }

/* ================= SFX_FILES: exactly 6 stems, each resolving to a real, non-zero file ================= */

check("SFX_FILES has exactly 6 entries", SFX_FILES.length, 6);

for (const stem of SFX_FILES) {
  let size = 0;
  let threw = false;
  try {
    size = statSync(`${SFX_DIR}${stem}.mp3`).size;
  } catch (e) {
    threw = true;
  }
  checkTrue(`sfx/${stem}.mp3 exists on disk`, !threw);
  checkTrue(`sfx/${stem}.mp3 has non-zero size (got ${size} bytes)`, size > 0);
}

/* ================= SFX_VOLUME: one key per SFX_FILES entry, no orphans in either direction ================= */

const volumeKeys = Object.keys(SFX_VOLUME);
checkTrue(
  "every SFX_FILES stem has an SFX_VOLUME entry",
  SFX_FILES.every((name) => name in SFX_VOLUME)
);
checkTrue(
  "no SFX_VOLUME key is orphaned (absent from SFX_FILES)",
  volumeKeys.every((name) => SFX_FILES.includes(name))
);

/* ================= MUTE_KEY: the pp_-prefixed convention pp_timerOff already established ================= */

check("MUTE_KEY is exactly \"pp_muted\"", MUTE_KEY, "pp_muted");

/* ================= isMuted()/setMuted(): safe under Node, no audio graph required ================= */

// Under Node, localStorage does not exist — isMuted()'s try/catch fallback must degrade to
// unmuted (false) rather than throwing (threat T-21-01: an absent or tampered store reads as
// unmuted, never crashes).
let isMutedThrew = false;
let initialMuted;
try {
  initialMuted = isMuted();
} catch (e) {
  isMutedThrew = true;
}
checkTrue("isMuted() does not throw under Node (no localStorage global)", !isMutedThrew);
check("isMuted() returns false with no localStorage present", initialMuted, false);

// setMuted()/isMuted() must both be safe to call before initAudio() has ever run — no live ctx,
// no built graph — since applyMasterGain() (called internally by setMuted()) itself no-ops when
// ctx is still null.
let setMutedTrueThrew = false;
try {
  setMuted(true);
} catch (e) {
  setMutedTrueThrew = true;
}
checkTrue("setMuted(true) does not throw with no audio graph built", !setMutedTrueThrew);
check("isMuted() returns true after setMuted(true)", isMuted(), true);

let setMutedFalseThrew = false;
try {
  setMuted(false);
} catch (e) {
  setMutedFalseThrew = true;
}
checkTrue("setMuted(false) does not throw with no audio graph built", !setMutedFalseThrew);
check("isMuted() returns false after setMuted(false)", isMuted(), false);

/* ================= EVENT_SOUND: key-set matches EVENT_NARRATION's 25-key inventory, both ways ================= */
// Checking the two tables against each other is stronger and more future-proof than hardcoding
// the number 25 a second time — a silent shrink of BOTH tables together is still caught below.

const narrationKeys = Object.keys(EVENT_NARRATION);
const soundKeys = Object.keys(EVENT_SOUND);

checkTrue(
  "every EVENT_NARRATION key has an EVENT_SOUND disposition",
  narrationKeys.every((k) => k in EVENT_SOUND)
);
checkTrue(
  "EVENT_SOUND invents no key of its own (every key is also in EVENT_NARRATION)",
  soundKeys.every((k) => k in EVENT_NARRATION)
);
check("EVENT_NARRATION has exactly 25 keys (the shared inventory size)", narrationKeys.length, 25);
check("EVENT_SOUND has exactly 25 keys (matches EVENT_NARRATION)", soundKeys.length, 25);

/* ================= EVENT_SOUND values: every non-null a real stem, every silent entry strictly null ================= */

for (const k of soundKeys) {
  const v = EVENT_SOUND[k];
  if (v === null) {
    checkTrue(`EVENT_SOUND.${k} is explicit null (not merely absent/undefined)`, v === null);
  } else {
    checkTrue(`EVENT_SOUND.${k} ("${v}") is a member of SFX_FILES`, SFX_FILES.includes(v));
  }
}

/* ================= 260801-7f4: the clash moved to engage time — named assertions, not accidental =================
   The generic loop directly above already passes on `EVENT_SOUND.battle === null` with no assertion
   naming WHY — any explicit null satisfies its "explicit null" arm, silence included. That means
   this behaviour change would pass green with the harness left unedited, which is exactly the
   failure mode being closed here: a future edit that restores a stem to `battle` (re-creating the
   double-clash this task exists to remove) would slip through silently too. These four checks name
   the intent out loud instead of leaving it to fall out of a generic loop by accident. */

check("EVENT_SOUND.battle is explicit null - the clash moved to engage time", EVENT_SOUND.battle, null);
check("EVENT_SOUND.battleflee still maps to battle-swords", EVENT_SOUND.battleflee, "battle-swords");
check("EVENT_SOUND.dodge still maps to battle-swords", EVENT_SOUND.dodge, "battle-swords");
checkTrue("BATTLE_ENGAGE_SOUND is a member of SFX_FILES", SFX_FILES.includes(BATTLE_ENGAGE_SOUND));

/* ================= soundForEvent(e): per-key no-throw dispatch, exercised with fabricated events ================= */
// Mirrors scripts/narration_test.js's fabricated-event-per-key idiom for the object shapes.

for (const k of narrationKeys) {
  let threw = false;
  let result;
  try {
    result = soundForEvent({ t: k });
  } catch (e) {
    threw = true;
  }
  checkTrue(`soundForEvent({t:"${k}"}) does not throw`, !threw);
  const shapeOk = result === null || (result && typeof result.name === "string" && SFX_FILES.includes(result.name));
  checkTrue(`soundForEvent({t:"${k}"}) returns null or a valid {name,bus}`, !!shapeOk);
}

/* ================= The storm-stamp guard — the assertion that actually pins D-08 =================
   Game.ev() (src/engine/index.js:233) stamps o.storm=this.stormNow onto EVERY event it records,
   so during a stormy round every one of the 25 event types can carry storm:true. The storm cue
   must fire for "newround" and ONLY "newround" — never leak onto any other event just because the
   engine's storm stamp happened to be true when that event was recorded. */

let stormStampLeak = false;
for (const k of narrationKeys) {
  const r = soundForEvent({ t: k, storm: true });
  const isStormCue = !!(r && r.bus === "storm");
  const shouldBeStormCue = k === "newround";
  if (isStormCue !== shouldBeStormCue) stormStampLeak = true;
  checkTrue(
    `soundForEvent({t:"${k}", storm:true}) storm-cue-only-for-newround`,
    isStormCue === shouldBeStormCue
  );
}
checkTrue("storm-stamp guard: no non-newround key ever resolves to the storm cue", !stormStampLeak);

// Direct cases, named explicitly per the plan's own acceptance criteria.
{
  const r = soundForEvent({ t: "newround", storm: true });
  checkTrue("soundForEvent({t:\"newround\", storm:true}) returns the storm cue", !!(r && r.bus === "storm" && r.name === "storm"));
}
check("soundForEvent({t:\"newround\"}) with no storm returns null", soundForEvent({ t: "newround" }), null);

/* ================= Unknown event type: silence, never a throw ================= */

let unknownThrew = false;
let unknownResult;
try {
  unknownResult = soundForEvent({ t: "never-seen-before" });
} catch (e) {
  unknownThrew = true;
}
checkTrue("soundForEvent with an unknown t does not throw", !unknownThrew);
check("soundForEvent with an unknown t returns null", unknownResult, null);

/* ================= The two flagged placeholders ================= */

checkTrue("WIN_SOUND_PLACEHOLDER is exported", typeof WIN_SOUND_PLACEHOLDER === "string");
checkTrue("WIN_SOUND_PLACEHOLDER is a member of SFX_FILES", SFX_FILES.includes(WIN_SOUND_PLACEHOLDER));
/* THE SHOT CLOCK'S FOUR ASSERTIONS STOOD HERE and were removed 2026-08-31. The shot clock itself
   left the game on 2026-08-28 at Wyatt's word ("temporarily remove the shot clock"), taking
   SHOTCLOCK_SOUND_PLACEHOLDER with it — and this file kept importing it, so the WHOLE SUITE has
   crashed on load ever since. It went unnoticed because this file lives in `test:v1`, PARKED by
   the cutover: every audio assertion in the project has been unrun for weeks while `npm test`
   reported green about other things.
   When the clock comes back, so do these four — its cue is still named in EVENT_SOUND's comments
   and in git history at this file. */
checkTrue("no assertion here references a symbol audio.js no longer exports (the crash that hid this whole suite)",
  typeof EVENT_SOUND === "object" && EVENT_SOUND !== null);

/* ================= STORM_VOLUME / STORM_FADE_SEC: numeric ranges, not exact values (Claude's discretion) ================= */

checkTrue(`STORM_VOLUME (${STORM_VOLUME}) is greater than 0 and less than 1`, STORM_VOLUME > 0 && STORM_VOLUME < 1);
checkTrue(`STORM_FADE_SEC (${STORM_FADE_SEC}) is greater than 0`, STORM_FADE_SEC > 0);

/* ================= DEFECT-1 / DEFECT-2: the duplicate key that made a sound unplayable =========
   docs/AUDIO.md described these as live for weeks after they were fixed at the cutover
   (fb74eedc), and on 2026-08-31 I repeated that description to Wyatt as a bug hurting players.
   It was not. Two separate faults, and this closes both:

   THE ORIGINAL DEFECT: `EVENT_SOUND` listed `anchorHold` TWICE. In a JS object literal the last
   wins, so `anchorHold: "fishing"` was silently overwritten by `anchorHold: "storm"` — fishing.mp3
   became unplayable, and anchoring in a storm played an 8-second storm stem on the MASTER bus,
   roughly three times louder than the storm is mixed to sit, once per ship.

   WHY IT WENT UNNOTICED: this suite is thorough and green, and it mentioned neither `anchorHold`
   nor `fishing` ANYWHERE — so its green tick was never evidence about this. The doc said so at the
   time ("worth adding both assertions with the fix, red first") and nobody did. A duplicate key is
   invisible to every runtime check that reads the finished object, which is why the second case
   below reads the SOURCE. */

check("anchorHold plays fishing, not storm — DEFECT-1/2's regression guard", EVENT_SOUND.anchorHold, "fishing");
checkTrue("fishing is actually reachable — some event maps to it",
  Object.values(EVENT_SOUND).includes("fishing"));
check("anchorHold does NOT land on the master bus with a storm stem",
  (soundForEvent({ t: "anchorHold" }) || {}).name, "fishing");

/* AND THE DUPLICATE KEY ITSELF, read from the SOURCE — the finished object cannot show it, because
   by then the loser is already gone. This is the only case here that could have caught the
   original defect at the moment it was written. */
{
  const src = fs.readFileSync(new URL("../src/ui/audio.js", import.meta.url), "utf8");
  const body = (src.match(/const EVENT_SOUND\s*=\s*\{([\s\S]*?)\n\};/) || [, ""])[1];
  const keys = [...body.matchAll(/(?:^|[,{\n])\s*([A-Za-z_$][\w$]*)\s*:/g)].map(m => m[1]);
  const dupes = keys.filter((k, i) => keys.indexOf(k) !== i);
  checkTrue(`EVENT_SOUND declares every key exactly once${dupes.length ? ` — DUPLICATED: ${[...new Set(dupes)].join(", ")}` : ""}`,
    dupes.length === 0 && keys.length > 0);
}

console.log(`\n${failures ? "FAILED" : "PASSED"} — ${failures} failing check(s)`);
process.exit(failures ? 1 : 0);
