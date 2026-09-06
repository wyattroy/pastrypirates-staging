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
  WIN_SOUND, BATTLE_ENGAGE_SOUND,
} from "../src/ui/audio.js";
// EVENT_NARRATION import style matches scripts/narration_test.js:24-27 exactly — proof that
// importing the narration surface headlessly (no DOM, no src/ui/flow.js or src/ui/panel.js)
// works, and the load-bearing baseline this script's own mapping-completeness checks pin against.
import { EVENT_NARRATION } from "../src/ui/util.js";
/* NAMESPACE import for the T-073 additions, deliberately, and this is not fussiness: a named
   import of a symbol that does not exist yet is a SyntaxError at load, which crashes the whole
   suite instead of failing one check — the exact way this file lay dead for weeks after
   SHOTCLOCK_SOUND_PLACEHOLDER left (docs/AUDIO.md §1). A red step that crashes tells you nothing
   about WHICH assertion is red. Namespaced, every new check fails individually and legibly. */
import * as AUDIO from "../src/ui/audio.js";
const DRUMROLL_SOUND = AUDIO.DRUMROLL_SOUND;
const soundDurationMs = AUDIO.soundDurationMs || (() => NaN);
import { statSync } from "node:fs";

let failures = 0;
function check(name, actual, expected) {
  const ok = actual === expected;
  if (!ok) failures++;
  console.log(`  ${(ok ? "PASS" : "FAIL").padEnd(5)} ${name.padEnd(78)} got=${JSON.stringify(actual)} want=${JSON.stringify(expected)}`);
}
function checkTrue(name, actual) { check(name, actual, true); }

/* ================= SFX_FILES: every stem resolves to a real, non-zero file =================
   (The heading said "exactly 6 stems" and sat above a list of nine — CEO 227 finding 4. The count
   went when the hand-typed check did; the heading was left behind, which is how a heading becomes
   the next reader's wrong fact.) */

/* WAS `check("SFX_FILES has exactly 6 entries", SFX_FILES.length, 6)` — a HAND-TYPED COUNT, and
   CLAUDE.md §5 is explicit: never hand-type a number that can be counted. It went red the moment
   two of Luis's stems landed, which is the number being wrong rather than the game being wrong —
   the same species as the 25-key pins docs/AUDIO.md §1 already flags as "hand-typed counts that
   the game outgrew". Replaced with what the count was actually protecting, both of which CAN
   fail: no stem is listed twice, and the list is not empty. Every stem also resolving to a real
   non-zero file on disk is already asserted by the loop directly below. */
checkTrue("SFX_FILES is non-empty", SFX_FILES.length > 0);
checkTrue(`SFX_FILES lists no stem twice${(() => {
  const d = SFX_FILES.filter((n, i) => SFX_FILES.indexOf(n) !== i);
  return d.length ? ` — DUPLICATED: ${[...new Set(d)].join(", ")}` : "";
})()}`, new Set(SFX_FILES).size === SFX_FILES.length);

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

/* ================= T-073: Luis's round-2 stems — HIS RULINGS, 2026-09-06 =================
   Written RED, before the change, per the four steps. Each pins one of his comment-box rulings.

   THE VICTORY SOUND. `WIN_SOUND` (was `WIN_SOUND_PLACEHOLDER`) had been `store-ingredient` since D-05 — the file
   docs/AUDIO.md measures as the QUIETEST in the game (-31.9 LUFS) playing the BIGGEST moment. Luis
   delivered `PP_SFX_BattleWon.mp3` for exactly this. His §2 ruling marks it certain.

   THE DRUMROLL. src/orchestrator.js already calls `await flash("Drumroll...")` and NOTHING PLAYS.
   His ruling (s3, #3): "do the drumroll audio timing check, and match the narration box timing to
   the sfx file." MEASURED 2026-09-06: the box holds that line for 1130ms (reading-speed model,
   util.js narrationHoldMs) and the audio runs 3150ms — the sound is 2.02s LONGER than the box.
   ⚠ The PRD said the window was a hard 2550ms floor. That floor was DELETED by D-34; the claim was
   stale, and "sized to fit that exact window" was wrong in both directions.

   RULE 9 — the box hold is DERIVED FROM THE FILE, never typed. soundDurationMs() reads the decoded
   AudioBuffer's own duration, so re-exporting the stem at a different length re-times the box with
   no code change. A typed 3150 would be a constant standing in for a quantity that moves. */

checkTrue("the victory sound is its OWN stem, not the quietest file in the game",
  WIN_SOUND !== "store-ingredient");
checkTrue("battle-won is a loadable stem", SFX_FILES.includes("battle-won"));
checkTrue("DRUMROLL_SOUND is exported", typeof DRUMROLL_SOUND === "string");
checkTrue("drumroll is a loadable stem", SFX_FILES.includes(DRUMROLL_SOUND));
checkTrue("soundDurationMs is exported so the narration box can be timed FROM the file",
  typeof AUDIO.soundDurationMs === "function");
checkTrue("soundDurationMs returns 0 (not NaN, not a throw) before any buffer is decoded",
  soundDurationMs("drumroll") === 0);
{ // the stems must actually be on disk, at the sizes Luis delivered
  const want = { "battle-won": 52068, "drumroll": 55021 };
  for (const [stem, bytes] of Object.entries(want)) {
    let got = -1; try { got = statSync(new URL(`../sfx/${stem}.mp3`, import.meta.url)).size; } catch {}
    check(`sfx/${stem}.mp3 is present and byte-exact against Luis's delivery`, got, bytes);
  }
}
{ // and the drumroll is actually WIRED — the call site must ask for a sound, not just a flash
  const orch = fs.readFileSync(new URL("../src/orchestrator.js", import.meta.url), "utf8");
  /* ⛔ THIS CHECK COULD NOT FAIL AND CEO 227 MUTATION-TESTED IT TO PROVE IT. The `|| /playDrumroll/`
     alternative matched the IMPORT LINE (orchestrator.js:79), so deleting the call and reverting to
     a bare flash() still printed PASS — green on a build where the drumroll never plays. The
     alternative is gone, and the assertion is now what it always claimed to be: the roll is played
     on BOTH twins. Host-only was the actual defect (finding 1), so counting the call sites is the
     assertion that would have caught it. */
  {
    /* ⛔ THIS CHECK USED TO DEMAND *TWO* CALL SITES, AND DEMANDING TWO IS DEMANDING DRIFT.
       It was written to catch the drumroll being host-only, and it did — but it enshrined the wrong
       cure: two calls kept in step by memory. Wyatt, 2026-09-06: "DO NOT ARCHITECT DRIFTABLE CODE",
       and "there should be NO more precedent for drift, we have been fixing that tech debt for
       weeks". So the assertion is inverted: the drumroll must be wired in ZERO hand-placed call
       sites. When it returns it goes through the ONE dispatcher both clients already run — the
       shape the your-turn bell uses — and this check will then be rewritten to pin THAT, not to
       count copies. */
    const sites = (orch.match(/^\s*[^/\n]*playDrumroll\(\);/gm) || []).length;
    checkTrue(`the drumroll is wired in NO hand-placed call site — one path or none (found ${sites})`,
      sites === 0);
  }
}

/* ================= T-073 slice 2: the cannon, on a LANDED shot =================
   His ruling (s2): "The cannon sound should fire when a shot has LANDED -- make sure that this
   does not overlap with teh second coin flip in a battle, but comes a moment after it (eg. 100ms
   after)." And (q5): "cannon sound happens only when a shot lands, per my previous note."

   ⭐ NO OFFSET CONSTANT IS WIRED, AND THAT IS THE POINT (rule 9). Measured 2026-09-06, both from
   the file and again in a real browser: the coin stem runs 965ms, while FLIP_SPIN_MS (795,
   board.js:2330) + FLIP_LAND_HOLD_MS (800, board.js:2348) put the resolve 1595ms after that sound
   starts — 630ms of clear air. His "eg. 100ms" is already exceeded six-fold by pacing two existing
   constants produce. A typed sleep(100) here would be a third constant restating them, and would
   go silently wrong the day either moves. Full working: .planning/wyclau/T-073-SLICE2-CANNON-MEASURED.md

   ⛔ AND IT MUST NOT FIRE ON EVERY BATTLE. Two of the four resolve outcomes land nothing — both
   captains missing, and both firing heads in a CROSSWIND where the game's own line says "the
   cannonballs collide". Firing there would put a cannon over the sentence saying nothing hit. The
   engine already computes the test: `scorer` is non-null exactly when a shot got through. */

checkTrue("CANNON_SOUND is exported", typeof AUDIO.CANNON_SOUND === "string");
checkTrue("cannon is a loadable stem", SFX_FILES.includes("cannon"));
{
  let got = -1; try { got = statSync(new URL("../sfx/cannon.mp3", import.meta.url)).size; } catch {}
  check("sfx/cannon.mp3 is present and byte-exact against Luis's delivery", got, 33540);
}
{
  const orch = fs.readFileSync(new URL("../src/orchestrator.js", import.meta.url), "utf8");
  checkTrue("the battle resolve fires the cannon", /playCannon\(\)/.test(orch));
  /* THE GUARD, READ FROM SOURCE, because a finished module cannot show that the call is
     CONDITIONAL. This is the assertion that stops the cannon being wired to the battle instead of
     to the hit — the one mistake his ruling explicitly forbids. */
  checkTrue("the cannon is fired ONLY when a shot landed — guarded by the engine's own scorer",
    /if\s*\(\s*scorer\s*\)\s*playCannon\(\)/.test(orch));
  /* ⚠ THIS ONE WAS VACUOUS WHEN FIRST WRITTEN AND WAS TIGHTENED BEFORE THE FIX LANDED. With no
     cannon in the file at all, "no hand-typed delay before the cannon" is trivially true — it
     passed in the RED step, which is the one thing a check in a RED step must not do (a
     measurement that cannot fail is not a measurement). It now REQUIRES the call to exist, so it
     is red until the wiring lands and a real regression guard afterwards. */
  {
    const i = orch.indexOf("playCannon()");
    const near = i < 0 ? "" : orch.slice(Math.max(0, i - 400), i + 400);
    checkTrue("no hand-typed delay sits beside the cannon — the existing flip pacing IS the gap",
      i >= 0 && !/sleep\(\s*\d{2,4}\s*\)/.test(near.replace(/sleep\(hold\)/g, "")));
  }
}

/* ================= T-073: the YOUR-TURN bell — D-07's ONE sanctioned exception =================
   His ruling (s4/q4): "Your Turn should use the Bell SFX sound. New day should NOT use this sound."
   And, put to him in the question UI with `src/ui/audio.js`'s own "ever" quoted at him, he chose
   the per-player cue over the rule-preserving version knowingly: a bell that rings four times a
   round is not a signal to YOU. docs/INTENDED-BEHAVIOUR.md carries it so a two-tab session does not
   report it as a host/guest defect.

   WHY THE GATE LIVES WHERE IT DOES, because this is the whole design:
     - `soundForEvent` stays PURE and simply LABELS the cue `localOnly` — no appState, no DOM, so
       the harness can still assert the whole map under plain Node.
     - `playForEvent` takes the locality as an ARGUMENT rather than reaching for it, because
       src/ui/audio.js imports NOTHING (checked: zero import lines) and that purity is load-bearing.
     - There is exactly ONE caller of playForEvent (src/orchestrator.js), so host and guest both
       run that same line and each evaluates it FOR ITSELF. One path, two correct answers — not two
       paths kept in step, which is the drumroll mistake CEO 232 caught.
   THE EXCEPTION MUST STAY EXACTLY ONE SOUND WIDE, and the third case below is what enforces that:
   the next sound that wants a seat gate is a fresh decision for Wyatt, not a precedent. */

checkTrue("bells is a loadable stem", SFX_FILES.includes("bells"));
{
  let got = -1; try { got = statSync(new URL("../sfx/bells.mp3", import.meta.url)).size; } catch {}
  check("sfx/bells.mp3 is present and byte-exact against Luis's delivery", got, 42414);
}
check("a turn plays the bell", (soundForEvent({ t: "turn", p: 1 }) || {}).name, "bells");
checkTrue("the turn bell is labelled localOnly — the one sound not heard by the whole table",
  (soundForEvent({ t: "turn", p: 1 }) || {}).localOnly === true);
{
  /* D-07 IS STILL THE RULE FOR EVERYTHING ELSE. Walk every event the map knows and prove exactly
     one carries the exception — so a second one cannot be added quietly. */
  const leaky = Object.keys(EVENT_SOUND)
    .filter((t) => t !== "turn")
    .filter((t) => ((soundForEvent({ t, p: 1 }) || {}).localOnly === true));
  checkTrue(`the whole table still hears everything else — exactly one localOnly cue${leaky.length ? ` — ALSO GATED: ${leaky.join(", ")}` : ""}`,
    leaky.length === 0);
}
checkTrue("NEW DAY stays silent — his ruling: 'New day should NOT use this sound'",
  !EVENT_SOUND.newround);
{
  const orch = fs.readFileSync(new URL("../src/orchestrator.js", import.meta.url), "utf8");
  checkTrue("the single playForEvent call passes the seat's locality, so each client answers for itself",
    /playForEvent\(\s*e\s*,/.test(orch));
  const aud = fs.readFileSync(new URL("../src/ui/audio.js", import.meta.url), "utf8");
  /* THE COMMENT IS PART OF THE CHANGE, NOT DECORATION. audio.js said the whole table is audible
     "ever". Leaving an absolute NEVER beside code that does it once is how the next reader reports
     working code as broken — the exact rot docs/AUDIO.md just had corrected in three places. */
  checkTrue("audio.js's D-07 comment no longer claims 'ever' without naming the exception",
    !/no appState\.mySeat\/isLocalTo gate anywhere on this path, ever/.test(aud));
  checkTrue("audio.js still imports NOTHING — the leaf-tier purity the gate was designed around",
    !/^import\s/m.test(aud));
}

/* ================= The two flagged placeholders ================= */

checkTrue("WIN_SOUND is exported", typeof WIN_SOUND === "string");
checkTrue("WIN_SOUND is a member of SFX_FILES", SFX_FILES.includes(WIN_SOUND));
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
