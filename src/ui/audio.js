// src/ui/audio.js
//
// Phase 21 (AUDIO-01/D-02/D-07/D-09/D-10/D-11/D-12/D-13). A new `shared` leaf-tier module — the
// only file in this tier besides src/shared/index.js. src/shared/index.js's own header (lines
// 1-6) states this tier's purity bar: "Holds no DOM, `window`, Firebase, wall-clock, or
// unseeded-random access — pure constants and pure helpers only." This file DELIBERATELY BREAKS
// the DOM/window half of that bar — it constructs an AudioContext, reads document.hidden, and
// reads/writes localStorage. That is a known, deliberate deviation, not an oversight.
//
// The compensating rule that keeps the tier honest: every one of those three touches lives ONLY
// inside initAudio(), isMuted() and setMuted() — never at module load, and never anywhere else in
// this file. That is what makes the module import cleanly under plain Node (where window,
// document and AudioContext are all undefined) — a hard structural requirement from
// 21-VALIDATION.md, not a style preference: scripts/audio_mapping_test.js (Task 2) cannot exist  [UNGATED-IN-4: audio_mapping_test.js reads the root tree, not this one]
// without it. It also keeps the second tier rule intact: this file imports nothing from anywhere
// under src/ — scripts/module_graph_check.js auto-scans every new file under src/ against that
// shape with no registration needed.
//
// Design: one AudioContext, one masterGain -> ctx.destination, one decoded AudioBuffer per sfx
// stem (decoded once, lazily, on initAudio()). Every play() call makes a FRESH
// AudioBufferSourceNode from the cached buffer through a fresh per-play GainNode — never reusing
// or restarting a node — which is exactly what makes repeats layer (D-10) instead of cutting each
// other off or being dropped (both explicitly rejected behaviours). Mute (D-13) and tab-blur
// (D-12) both act on the single masterGain — see applyMasterGain() — so they can never fight.

/* ================= Pure data — safe to import headlessly, nothing built at load ================= */

// sfx/ — the repo root's set, exactly as assets are shared (this game IS the root since the 2026-08-26 cutover). /3 has no sfx/ of its own, and a
// page-relative "sfx/" 404s silently for every stem. The same bug shipped in /v2/ and /v2bakeoff/
// (no sfx dir exists in git under either) until it was found here by a headless probe on
// 2026-08-09 and fixed in all three builds at Wyatt's word.
const SFX_DIR = "sfx/";
// The closed literal array — the ONLY source of a fetch URL anywhere in this module, never a
// runtime string (threat T-21-02). Adding a 7th stem later means adding it here, nowhere else.
const SFX_FILES = ["battle-swords", "battle-won", "bells", "cannon", "coin-flip", "drumroll", "fishing", "ship-move", "store-ingredient", "storm"];
// Per-stem relative gain — CONTEXT.md "Claude's Discretion": the single tuning point for loudness
// normalising, so a by-ear browser pass adjusts one number per sound without restructuring
// anything else. Every stem defaults to 1 (no normalising applied yet).
// DEFECT-3 (docs/AUDIO.md §1): every value was still 1, so the six stems had never been levelled
// against each other — a 15.6 dB spread, measured EBU R128. The sword clash was about six times
// louder than a crate being loaded, and the two extremes sat in the worst possible places: the
// LOUDEST file is what fires when you run out of time, and the QUIETEST is the victory sound.
// These are the doc's measured figures, not guesses. Integrated / true peak / gain:
//   battle-swords   -16.3 LUFS / +0.2 dBFS (clipped IN THE FILE) -> 0.46
//   fishing         -21.2      / -4.3                            -> 0.81
//   storm           -21.7      / -1.5                            -> 0.86
//   coin-flip       -26.8      / -4.3                            -> 1.45  (near the ceiling)
//   ship-move       -27.7      / -11.3                           -> 1.72
//   store-ingredient -31.9     / -12.4                           -> 2.79
// Gains above 1 are safe here BECAUSE the true peaks are so far down: the largest boost, 2.79x on
// store-ingredient (+8.9 dB against a -12.4 dBFS peak), still lands near -3.5 dBFS.
// STILL OUTSTANDING and NOT fixed by a gain: battle-swords is clipped inside the file itself
// (+0.2 dBFS). Turning it down fixes the balance, never the distortion — that needs a fresh export.
const SFX_VOLUME = {
  "battle-swords": 0.46,
  "coin-flip": 1.45,
  "fishing": 0.81,
  "ship-move": 1.72,
  "store-ingredient": 2.79,
  "storm": 0.86,
  /* T-073 — DELIBERATELY UNLEVELLED AT 1, and written down rather than omitted.
     Wyatt's q7 ruling, 2026-09-06: "level everything together, once", AFTER every file is in —
     partial levelling now would be redone anyway once the ambience bed and the rest are in the
     mix. An ABSENT key and a key at 1 behave identically at runtime; the difference is that an
     absent key looks like an oversight and this looks like the decision it is. The levelling pass
     replaces these two numbers along with all six above. */
  "battle-won": 1,
  "bells": 1,
  "cannon": 1,
  "drumroll": 1,
};
// pp_-prefixed per-browser preference convention pp_timerOff already established
// (src/orchestrator.js:168) — mute follows it exactly, same key-naming shape.
const MUTE_KEY = "pp_muted";

/* ================= THE SOUND CONTROL IS THREE-WAY — his ruling, 2026-09-07 ================= */
/* "Make sure The audio/mute switch is 3-way— sound+music, sound, mute— repeat again from
   sound+music."

   THIS CLOSES AN OPEN QUESTION, it does not invent one. docs/AUDIO.md §4 has carried it since
   2026-08-19 as question 2 — "Three-state cycle instead of two switches?" — with the note that a
   cycle "adds no new control to a screen where placing the mute button already cost several
   rounds". He has now ruled, and the ORDER is part of the ruling: full -> sfx -> mute -> full.

   `isMuted()` stays the whole game's question and simply derives from this, so not one of its
   callers changes: mute is still mute. What is new is that "sound is on" now has two answers, and
   only the music can tell them apart. scripts/qa/ambience_one_seam_check.mjs holds the order, the
   wrap, and the three menu labels. */
const SOUND_MODES = ["full", "sfx", "mute"];
const SOUND_MODE_KEY = "pp_soundMode";

// D-11 — Claude's discretion (21-CONTEXT.md): the storm sits quieter underneath the short sounds
// so flips, clashes and dockings stay clear on top of it. Opening value; a by-ear browser pass
// tunes this one number, never the graph shape.
const STORM_VOLUME = 0.35;
// D-09 — Claude's discretion: the fade duration once the storm moment resolves (the next
// `newround`/`end`). Opening value, same tuning-point discipline as STORM_VOLUME.
const STORM_FADE_SEC = 1.2;

/* ================= THE AMBIENCE BED — Luis's twelve clips, Wyatt's numbers ================= */
/* An ocean loop with gulls and creaks scattered over it. Luis's own spec, quoted by Wyatt:
   "for the ambient, I got you the looping ocean + seagull and creak clips. You'll need to come up
   with a randomizer for these clips. also randomize the stereo placement as you play them" — the
   randomiser is this project's job, not his.

   ⛔ DELIBERATELY NOT IN SFX_FILES, AND THAT IS LOAD-BEARING. initAudio() does
   `await Promise.all(SFX_FILES.map(loadOne))`, so nothing in the game makes a sound until every
   stem in that array has arrived. docs/AUDIO.md §3 wrote the consequence down before these files
   existed: "Add a music bed to that list and every sound effect in the game goes silent until the
   music finishes downloading, potentially the first minute of play on a phone." The bed is 917 KB
   against the ten stems' 583 KB. It loads on its own path (initAmbience) and fades in whenever it
   arrives, so a slow phone gets a silent sea and a fully audible game rather than the reverse.
   scripts/qa/ambience_one_seam_check.mjs fails if a clip ever appears in both arrays. */
const AMBIENCE_FILES = [
  "ocean-loop",
  "gull-1", "gull-2", "gull-3", "gull-4", "gull-5",
  "creak-1", "creak-2", "creak-3", "creak-4", "creak-5", "creak-6",
];

/* ⭐ HIS NUMBERS. Wyatt dialled these by hand in the Sea Bed Tuner on 2026-09-07 and pasted the
   block out of it — https://claude.ai/code/artifact/4623cd73-2340-4611-832f-522ebbf33442 — with
   "THIS IS AWESOME BUILD IT NOW". They are a ruling, not a default for somebody to improve on.
   The dB he actually saw on the slider sits beside each one, so the two can never disagree about
   what he chose. scripts/qa/ambience_one_seam_check.mjs fails if any of them drifts. */
const AMBIENCE_SEA = 0.596;              // -4.5 dB — the bed everything else sits on
const AMBIENCE_GULL = 0.168;             // -15.5 dB — well down; raw, the gulls land 12 dB ABOVE the sea
const AMBIENCE_CREAK = 1.122;            // +1.0 dB — raw, the creaks sit 6 dB UNDER it
/* ⭐ HIS EARS, 2026-09-07 playtest (sound sheet item 3), and they REVERSE the pair he dialled in
   the tuner an hour earlier: "Creaks should be every 8 seconds; gulls every 14 seconds." The hull
   is now the near sound and the birds the far one, which is what a deck actually sounds like.
   These are MEAN waits, not intervals — ambSchedule draws an exponential gap around them, so
   "every 8 seconds" is a rhythm you feel rather than a beat you can count. */
const AMBIENCE_GULL_MEAN_SEC = 14;       // average wait between cries
const AMBIENCE_CREAK_MEAN_SEC = 8;       // average wait between groans of the hull
const AMBIENCE_SPREAD = 0.7;             // how far to port/starboard a scattered clip may land
const AMBIENCE_LIVELINESS = 0.35;        // how much each hit shifts in loudness and pitch

/* Recorded from the same tuner block, NOT WIRED, and written down rather than dropped so nobody
   re-derives it by ear later. Music needs two things this branch does not have: his own "short 1"
   edit (it is on Drive; the tuner played a cut of the full master instead), and the three-phase
   sound button — Music+SFX -> SFX only -> mute — which is a new feature with its own consistency
   sweep, not a sound swap. Handoff items 4 and 6. */
const MUSIC_LEVEL = 0.141;               // -17.0 dB
/* ⚠ THE HEADPHONE CHECK HAPPENED AND IT FAILED. He asked for it twice in one playtest, from two
   different sheets: "the music should be less panned left — bring it back to center more" and
   "Move fiddle more to the middle. It sounds weirdly panned in headphones."
   -0.7 was judged on SPEAKERS in the tuner, where a hard pan reads as width. In headphones it
   reads as a fiddle strapped to your left ear. -0.15 keeps the song off the centre line — so it
   still sits beside the gulls and creaks rather than on top of them — without the lopsidedness.
   THIS IS MY GUESS AT "more to the middle", not his number. It is on his taste sheet. */
const MUSIC_PAN = -0.15;                 // 15% to port — enough to leave centre clear, not enough to notice

/* "Out on the Ocean", Fiddlers Plus — credited on the Credits page by his instruction, 2026-09-07.
   ⭐ THIS IS NOW HIS OWN EDIT, 214.1s (3:34), mono, 2.1 MB. He handed the file over directly:
   "out on the ocean fiddlers plus short is in /notes". It replaces the 34.5s cut that made him
   write "currently, only 35ish seconds of the song play... the full song should run".

   WHY HIS DIALLED LEVEL STILL MEANS WHAT HE HEARD. MUSIC_LEVEL and MUSIC_PAN were judged in the
   tuner against the OLD cut, so a swap could silently move the mix. Measured rather than assumed
   (ffmpeg ebur128): the old cut is -17.8 LUFS integrated, his edit -17.5 — 0.3 dB apart, which is
   under the threshold of audibility. No re-levelling, and none is hiding in here for later.

   2.1 MB is four times the old file and that is FINE, load-bearingly so: it is not in SFX_FILES,
   for the same reason the bed is not — initAudio() awaits that whole array, so a music bed in it
   silences every sound effect in the game until the song has downloaded. It arrives on its own
   path (initAmbience) and fades in whenever it gets here.

   Mono is not an accident worth fixing — a mono source is exactly what pans cleanly, and MUSIC_PAN
   moves all of it. */
const MUSIC_FILE = "music-ocean";

/* ⭐ THE SONG WAITS A MINUTE BEFORE IT COMES ROUND AGAIN. Wyatt, 2026-09-07: "the song shouldn't
   immediately restart after it finishes— it should wait a minute."
   NOTE FOR THE RECORD: an earlier note (handoff §1, 2026-09-06) said "2-minute gap before it
   repeats". THIS IS THE LATER RULING AND IT WINS — a minute. Recorded rather than silently
   reconciled, so nobody restores 120 from the older page believing it is the live decision.
   The track therefore does NOT loop: it ends, this timer runs, and it starts again. A looping
   source would make this constant dead code, which is what the gate checks for. */
/* ⭐ THREE MINUTES — Wyatt, 2026-09-08: "I want a bigger pause between the song plays -- make it 3
   minutes". That supersedes his 60 of 2026-09-07, which itself superseded a 120 from the day
   before; the newest ruling wins and the older two are recorded here so nobody restores one from
   an older page.
   AND THE SONG IS IMMEDIATE WHEN MUSIC COMES BACK ON: "reset that 3 minutes when someone cycles
   through the sound playback (so if they get back to 'sound on - with music' the song starts up
   immediately)". That already falls out of the design and is asserted rather than added —
   musicStop() clears the pending timer and musicStart() calls musicPlayOnce() straight away, so a
   cycle through mute and back cannot leave a captain listening to silence for three minutes. */
const MUSIC_GAP_SEC = 180;

/* Measured integrated loudness (EBU R128, ffmpeg), so ONE family level can control files that were
   delivered up to 8.3 dB apart. The trim is COMPUTED from this table below rather than typed
   beside it — CLAUDE.md, "nothing is a constant": a re-export from Luis needs one number changed
   here, not two kept in step. Creak 6 arrives 8.3 dB under creak 3 and takes a ~2.03x boost; at a
   single flat creak level it would simply never be heard at any setting. */
const AMBIENCE_LUFS = {
  "ocean-loop": -32.2,
  "gull-1": -20.5, "gull-2": -21.1, "gull-3": -19.6, "gull-4": -21.2, "gull-5": -21.0,
  "creak-1": -38.6, "creak-2": -38.3, "creak-3": -36.4,
  "creak-4": -36.6, "creak-5": -36.6, "creak-6": -44.7,
};
const AMBIENCE_FAMILY = {
  gull: AMBIENCE_FILES.filter(n => n.startsWith("gull-")),
  creak: AMBIENCE_FILES.filter(n => n.startsWith("creak-")),
};
// clip name -> the multiplier that brings it to its own family's mean loudness.
const AMBIENCE_TRIM = {};
for (const fam of Object.keys(AMBIENCE_FAMILY)) {
  const names = AMBIENCE_FAMILY[fam];
  const mean = names.reduce((a, n) => a + AMBIENCE_LUFS[n], 0) / names.length;
  for (const n of names) AMBIENCE_TRIM[n] = Math.pow(10, (mean - AMBIENCE_LUFS[n]) / 20);
}

// The bed comes up and goes down on a ramp, never a cut — a sea that snaps on is a click.
const AMBIENCE_FADE_IN_SEC = 2.5;
const AMBIENCE_FADE_OUT_SEC = 0.9;

/* SHOTCLOCK_SOUND_PLACEHOLDER stood here (D-22, battle-swords standing in for a purpose-made
   time-out alert). Left with the shot clock 2026-08-28 — restore the shopping-list note with it. */

// D-05 EXPLICIT PLACEHOLDER — not a final choice. The win screen gets a sound rather than
// silence; nothing in the six actually sounds like victory, so Claude selected the short, bright
// one — closest of the six to a chime — as a stand-in. On the shopping list for Luis: a
// purpose-made victory sound. Swapping it is a one-constant change.
/* T-073, 2026-09-06 — NO LONGER A PLACEHOLDER, so it no longer carries the word.
   ⚠ AND AN EARLIER VERSION OF THIS COMMENT PUT WORDS IN WYATT'S MOUTH. It said "Wyatt's §2 ruling
   marks PP_SFX_BattleWon.mp3 CERTAIN" — HE NEVER RULED ON THE VICTORY SOUND. CEO 227 read all
   fourteen of his comments (INBOX-20260906T162203Z..163615Z): none mentions the victory sound, the
   win screen, or BattleWon. "certain" was a CONFIDENCE TAG in the PRD's own table, written by a
   session, not by him. The swap is still obviously right and squarely inside "start the SFX
   wiring" — the attribution was not, and a false "he ruled this" in a source comment is the kind
   of line the next session inherits as settled fact.
   The swap retires the worst
   pairing in the game: `store-ingredient` is the QUIETEST stem here (-31.9 LUFS, docs/AUDIO.md
   DEFECT-3's table) and it was playing the BIGGEST moment. Kept as a named constant, not inlined,
   so the DOM-free harness can assert it by name. */
const WIN_SOUND = "battle-won";

/* The End-of-Voyage drumroll. src/orchestrator.js has called `await flash("Drumroll...")` since
   the moment was built and NOTHING HAS EVER PLAYED under it. Wyatt's ruling (s3 #3): "do the
   drumroll audio timing check, and match the narration box timing to the sfx file." */
const DRUMROLL_SOUND = "drumroll";

/* THE CANNON — fired when a shot LANDS, never when a battle merely happens.
 * His ruling (s2/q5, 2026-09-06): "The cannon sound should fire when a shot has LANDED... this
 * does not overlap with teh second coin flip in a battle, but comes a moment after it (eg. 100ms
 * after)" and "cannon sound happens only when a shot lands".
 *
 * ⭐ NO OFFSET IS WIRED, MEASURED RATHER THAN TYPED. The coin stem runs 965ms; FLIP_SPIN_MS (795)
 * plus FLIP_LAND_HOLD_MS (800) put the battle's resolve 1595ms after that sound starts — 630ms of
 * clear air, six times the gap he asked for, produced by two constants that already exist. A
 * sleep(100) here would be a third constant restating them and would rot the day either moves.
 * Confirmed twice: ffprobe on the file, and soundDurationMs() in headless Chrome.
 *
 * WHY IT SITS IN THE ORCHESTRATOR AND NOT IN EVENT_SOUND: the `battle` event only fires once the
 * whole fight has RESOLVED and carries no per-outcome detail, which is the same reason the clash
 * had to move to engage time (see BATTLE_ENGAGE_SOUND above). The landing is a moment inside the
 * fight, so only the fight's own code knows it happened. */
const CANNON_SOUND = "cannon";

// 260801-7f4 — a REAL choice, and so is WIN_SOUND above now (it stopped being a placeholder at
// departed SHOTCLOCK one); this stem literally is a sword clash; it is not on any shopping
// list for Luis. Named as a constant (not inlined) so the DOM-free harness can assert it by name.
// This is the moment cue for a battle being JOINED — see playBattleEngage() below — fired from the
// orchestrator's own battle-opening seams, never from the `battle` event, because that event does
// not exist until the whole fight has already resolved.
const BATTLE_ENGAGE_SOUND = "battle-swords";

// D-01/D-03/D-04/D-06/D-21: the 25-key event->sound mapping, mirroring EVENT_NARRATION's exact
// shape (src/ui/util.js) and register — a plain object literal, never a Map needing .get() with a
// default, never a switch with no default, never a .find() that can throw on a miss. An absent
// key reads as `undefined` and dispatches to silence with no throw and no console warning.
const EVENT_SOUND = {
  // D-01 (sailing); D-04 (wind pushes your boat — your ship moved, just not by choice); D-21 (a
  // gale blows you off the dock — the identical case as windmove)
  /* ⭐ THE STORM NO LONGER MOVES YOU WITH A SAIL SOUND. Wyatt, 2026-09-07 playtest (sound sheet
     item 13): "Remove the movement sounds (sail and anchor) from the storm movements — they're
     confusing and distracting."
     WHY HE IS RIGHT AND THIS IS NOT A LOSS. `ship-move` is the sound of a captain CHOOSING to
     sail. `windmove` and `blownOut` are the weather doing it TO them, and a storm round fires one
     per affected ship — so a four-ship storm played the deliberate-sail cue four times for moves
     nobody made. The storm's own bed (which now runs under the whole round, see soundForEvent)
     is the weather's voice; these were four small ships talking over it. */
  sail: "ship-move", windmove: null, blownOut: null,
  // D-01/D-04: a crate changing hands, whether docking or trading
  dock: "store-ingredient", trade: "store-ingredient",
  // D-01; D-04 (fleeing/dodging — the clash happened, you just left it). NOT the battle's own
  // start/end — see the `battle: null` entry below.
  battleflee: "battle-swords", dodge: "battle-swords",
  // D-01 (fishing); D-03 (dropping anchor in a storm); D-21 (the anchor holding — same family)
  /* `anchorHold` is the storm case of the same instruction above — a ship riding the weather out.
     ⚠ IT IS NOT ALLOWED TO BECOME "storm" AGAIN. That exact line was DEFECT-1 and DEFECT-2 in
     docs/AUDIO.md (an 8-second bed at ~3x level, once per anchoring ship, unfadeable). Going
     SILENT is strictly further from that defect than "fishing" was, and the guard in
     scripts/audio_mapping_test.js now pins the invariant that actually matters — never a storm
     stem — rather than the literal it used to pin. */
  fish: "fishing", anchor: "fishing", anchorHold: null,
  // D-04: running aground / shipwrecked both borrow storm
  // v2.1: nothing runs aground any more — the storm keeps its own cue via `newround`
  shipwrecked: "storm",
  // D-06 — explicit silence, not merely absent from the table
  blocked: null, moored: null,
  /* T-073 — YOUR TURN. His ruling (s4/q4): "Your Turn should use the Bell SFX sound. New day
     should NOT use this sound." So `newround` stays null below; the bell is on the TURN.
     ⭐ THIS IS THE ONE SOUND NOT HEARD BY THE WHOLE TABLE — see LOCAL_ONLY_SOUND_EVENTS. */
  turn: "bells",
  newround: null, tradewind: null, bakeoff: null,
  // playtest 21 item 3: the storm's one summary line. Deliberately SILENT — every ship in it has
  // already played its own cue (windmove/blownOut -> ship-move, anchorHold -> fishing) as it moved,
  // so a sound here would be a fifth noise describing four that just happened.
  stormSummary: null,
  end: null, finish: null,
  // 260801-7f4 — explicit silence, not an oversight. The `battle` event only fires once the whole
  // fight has resolved (src/engine/index.js:581), which is exactly why the clash used to land at
  // the end instead of the start. The clash moved to engage time — see playBattleEngage() and its
  // two call sites in src/orchestrator.js (asyncBattle and watchBattle).
  battle: null,
  // D-21 — explicit silence: an offer is not a deal; sidebet is already narration-suppressed
  parley: null, sidebet: null,
  // v2 events, explicit silence rather than merely absent (D-06). `purse` especially: it exists
  // only to push a fresh state snapshot to the Captains panel mid-turn and is invisible by design,
  // so it must never become audible if the unmapped default ever changes.
  purse: null, idle: null, openoffer: null, collab: null,
  // NOTE: `anchorHold: "storm"` used to sit here, and it was the whole of DEFECT-1 and DEFECT-2 in
  // docs/AUDIO.md. `anchorHold` is already mapped to "fishing" above, and in a JS object literal the
  // LAST key wins — so this line silently overrode it, which (a) stranded fishing.mp3, downloaded
  // and decoded every game and triggerable by nothing, and (b) made every anchoring ship play the
  // 8.0-second storm bed. The comment that stood here claimed it "rides the storm bus"; it did not.
  // soundForEvent() routes to the quiet storm bus ONLY for the pair newround+storm, so STORM_VOLUME
  // (0.35) never applied and it landed ~3x louder than the storm is mixed to sit. noteStormOutcome()
  // is per player, so three captains anchoring in one storm stacked three of them on top of the
  // storm cue that had already played, and fadeStorm() could retire none of them (stormNode is only
  // set on the newround path). Deleting one line fixed both. DO NOT RE-ADD IT.
  /* ⭐ MUSE IS THE ANCHOR GOING DOWN. Wyatt, 2026-09-07 playtest (sound sheet item 13): "Add the
     anchor sound to 'muse' action, played when muse is clicked."
     `pass` IS Muse — the radial builds it as `{label: museFace, value: "pass"}` (src/ui/flow.js)
     and the ladders key it as `act.muse`. So the cue goes in this map rather than on the button's
     click handler: one dispatcher means the sound arrives the same way on every tier, the whole
     table hears it (D-07), and there is no second code path to drift. It rides "fishing", which
     is already the anchor family — `anchor` above is the same stem. */
  pass: "fishing",
  // a battle that ends with nobody hit has no hit to sound; the paid re-fire is covered by the
  // flip that follows it
  battlenull: null, refire: null,
  // v2.1: the ovens going cold rides the battle sound of the raid that caused it — it is the
  // consequence of that same broadside, one beat later, not a second event to be scored.
  unfinish: null,
  // v2.1 bake-off: EXPLICIT silence, not an omission (D-06 — the two are different things here).
  // Whether a successful bake earns its own cue is a design call for Wyatt, not a side effect.
  ovens: null, bake: null,
};

// PURE — no ctx, no DOM, no side effect, safe to call under plain Node. Returns null, or an
// object naming the stem and the bus to route it through.
//
// THE TRAP (see 21-CONTEXT.md/21-02-PLAN.md): Game.ev() (src/engine/index.js:233) stamps
// `o.storm=this.stormNow` onto EVERY event it records, so during a stormy round every single
// event of every captain carries `storm:true`. Keying the storm cue on `e.storm` alone would fire
// storm.mp3 on every action of every captain for the whole round — the exact opposite of D-08
// ("storm.mp3 fires once when the storm arrives, not once per captain the storm affects"). Keying
// it on the PAIR (e.t is "newround" AND e.storm) is correct, and because `newround` is emitted
// exactly once per round (src/orchestrator.js's two live `newround` emissions), D-08's fires-once
// falls out of this pure lookup with no dedup state needed at all.
/* ⭐ D-07'S ONE SANCTIONED EXCEPTION, AND IT IS A SET SO THAT ADDING A SECOND IS A VISIBLE ACT.
 * Everything on this path is heard by the whole table. "Your turn" cannot be — a cue meant for
 * YOU that also fires on three other screens is not a signal, it is noise, and at a four-handed
 * table it would ring four times a round. Wyatt was shown this file's own "ever" and the
 * rule-preserving alternative (everyone hears it on every turn change) and chose the seat gate
 * knowingly, 2026-09-06. Recorded in docs/INTENDED-BEHAVIOUR.md so a two-tab session does not
 * report the difference as a host/guest defect.
 * THE NEXT SOUND THAT WANTS A GATE IS A FRESH DECISION FOR HIM, not a precedent this set grants. */
const LOCAL_ONLY_SOUND_EVENTS = new Set(["turn"]);

/* STILL PURE. It only LABELS the cue; it never asks who is playing. The seat test needs appState,
 * and this file imports nothing by design (leaf tier) — so the answer is handed to playForEvent
 * by its single caller instead. That keeps the whole map assertable under plain Node. */
function soundForEvent(e) {
  /* ⭐ THE STORM IS SCATTERED THUNDER — and this REPLACES the loop of one day earlier.
     Wyatt, 2026-09-08, having heard the loop: "I'll work on a longer storm track -- in the mean
     time, play the storm.mp3 once at the beginning of a storm and then an average of once every 20
     seconds -- not every 8 seconds. the sound in its current form is thunder. scatter pan it too."
     He is right about what the file IS: 8.007s, and its envelope is one broadband crack that decays
     — a thunderclap, not a wash. Looping a thunderclap every 8 seconds is a metronome made of
     lightning. Scattered around a 20-second mean, panned somewhere new each time, it reads as
     weather happening around the ship.
     THE MECHANISM IS THE SEA BED'S, NOT A SECOND ONE: exponential gaps and a random pan, exactly
     as the gulls and creaks are scattered (ambSchedule/ambFireOne). It still rides the quiet storm
     bus, so STORM_VOLUME governs it and fadeStorm() ends it.
     `bus: "storm"` and no `loop`: playForEvent hands this to the scatter starter below. */
  if (e.t === "newround" && e.storm) return { name: "storm", bus: "storm", scatter: true };
  const name = EVENT_SOUND[e.t];
  if (!name) return null;
  const out = { name, bus: "master" };
  if (LOCAL_ONLY_SOUND_EVENTS.has(e.t)) out.localOnly = true;
  return out;
}

/* ================= Lazy audio graph — built ONLY by initAudio(), nothing at module load ================= */

let ctx = null;
let masterGain = null;
let stormGain = null; // D-11: storm's own quieter bus, still connected into masterGain
// (stormNode stood here — the single in-flight storm one-shot. The storm is a scatter now and
//  `stormLive` below holds every clap still ringing; fadeStorm() retires all of them.)
const buffers = {}; // stem name -> decoded AudioBuffer
let visibilityHandlerAttached = false;
// Seeded lazily, on first isMuted()/setMuted() call — never read at module load.
let mutedCache = null;

/* Reads the three-way mode, MIGRATING the old boolean the first time it finds one. A player who
   muted the game last week must still find it muted; a player who did not gets the full mix.
   Anything unrecognised degrades to "full" rather than throwing (T-21-01's discipline). */
function readModeFromStorage() {
  try {
    const m = localStorage.getItem(SOUND_MODE_KEY);
    if (SOUND_MODES.includes(m)) return m;
    return localStorage.getItem(MUTE_KEY) === "1" ? "mute" : "full";
  } catch (e) {
    return "full"; // absent/tampered store degrades to everything on, never a crash (T-21-01)
  }
}

// isMuted()/setMuted() are safe to call before initAudio() has ever run — mutedCache is seeded
// independently of the audio graph, and applyMasterGain() (called by setMuted()) itself no-ops
// when ctx is still null.
/* THE ONE QUESTION EVERY EXISTING CALLER ASKS, and it still means exactly what it meant. Mute is
   one of the three modes, so play(), applyMasterGain() and panel.js all keep working unchanged —
   the three-way switch adds a state, it does not move the goalposts under anything. */
function isMuted() {
  return soundMode() === "mute";
}
/* Whether the MUSIC may play. The only thing that separates the two sound-on modes. */
function musicOn() {
  return soundMode() === "full";
}
function soundMode() {
  if (mutedCache === null) mutedCache = readModeFromStorage();
  return mutedCache;
}
function setSoundMode(m) {
  mutedCache = SOUND_MODES.includes(m) ? m : "full";
  try {
    localStorage.setItem(SOUND_MODE_KEY, mutedCache);
    /* The old key is kept in step, not abandoned. Nothing in the game reads it any more, but a
       player who rolls back to an older build must not silently lose a mute they chose. */
    localStorage.setItem(MUTE_KEY, mutedCache === "mute" ? "1" : "0");
  } catch (e) {
    // swallowed — mirrors pp_timerOff's own try/catch discipline exactly
  }
  applyMasterGain();
  /* The bed and the music are the two sounds that never stop on their own, so a mode change has to
     reach them directly. play()'s own `if (isMuted()) return` guard cannot help: their sources were
     started minutes ago and are still going. syncBeds() is a no-op when there is nothing running. */
  syncBeds();
}
/* full -> sfx -> mute -> full. The wrap is the ruling, not a nicety: "repeat again from
   sound+music". Derived from the array so the order lives in exactly one place. */
function cycleSoundMode() {
  const i = SOUND_MODES.indexOf(soundMode());
  setSoundMode(SOUND_MODES[(i + 1) % SOUND_MODES.length]);
  return soundMode();
}
/* Kept because it is exported and reads clearly at a call site that genuinely means "silence
   everything" — it maps onto the cycle rather than living beside it as a second way to set the
   same state. Nothing in the game calls it today. */
function setMuted(v) {
  setSoundMode(v ? "mute" : "full");
}

// The one place the master level is decided (D-12/D-13): 0 when muted OR the tab is hidden,
// otherwise 1 — applied through a ramp, never a bare assignment, so mute and tab-blur can never
// stomp on each other mid-transition.
/* WYATT, 2026-09-06: "sound is no longer working even in solo in safari -- i have sound turned on,
   and nothing is playing" ... "it works in chrome though". Safari-only is the whole clue.

   ONE FILE, TWO AUDIO RAMPS, AND ONLY ONE OF THEM WAS WRITTEN SAFELY. fadeStorm() (:401) cancels
   scheduled values and anchors at the CURRENT value before ramping, with a comment that says
   exactly why: "anchor the ramp at the CURRENT value, not a stale target." This function — the one
   that decides whether ANY sound is audible — did neither. It fired a bare setTargetAtTime() on
   top of whatever automation was already queued.

   WHY THAT IS SAFARI-SHAPED. `setTargetAtTime` is an exponential approach anchored to a moment on
   ctx.currentTime, and **ctx.currentTime STOPS ADVANCING while the context is suspended or, on
   Apple platforms only, `interrupted`.** Safari enters those states aggressively: a background
   tab, a second window taking audio focus, the system sleeping — which is exactly what testing
   crew in two Safari windows consists of. The hide ramp toward 0 lands. The show ramp back to 1 is
   then scheduled against a frozen clock, on top of the un-cancelled ramp still sitting in the
   queue, and the master never climbs back. Source nodes still start — so Safari lights the tab's
   audio indicator, which is what he saw — into a bus pinned near silence. Chrome has no
   `interrupted` state and a forgiving automation queue, so Chrome was fine throughout.

   THE FIX IS THE RULE THE OTHER RAMP ALREADY FOLLOWS, plus one thing that ramp does not need:
   when the clock is NOT running there is nothing for a ramp to travel along, so the value is set
   OUTRIGHT. A ramp on a stopped clock is not a slow fade, it is no fade at all. */
/* ⭐ THE CLOCK IS THE TRUTH, NOT ctx.state — Wyatt, 2026-09-09, on his phone:
     "safari showed that the tab SHOULD be making sound; but no sound came out... i toggled it
      through a full cycle. still no sound. then I reloaded... I left the page entirely and went to
      youtube, played a video, heard sound, then retyped staging... STILL no sound. THEN, when i
      clicked polly to toggle it off, the sound came on! ... now, when I tried to replicate the bug,
      the sound works every time."

   THE NOTE ABOVE THIS FUNCTION ALREADY DIAGNOSED THIS SHAPE ONCE and fixed half of it: a ramp
   scheduled against a frozen clock never travels, so the master bus stays where it was. What it did
   not question is the TEST — `ctx.state === "running"`. On Apple platforms those are not the same
   claim. The file's own comment thirty lines up says the quiet part: **ctx.currentTime STOPS
   ADVANCING while the context is suspended or `interrupted`** — so the clock, not the state string,
   is what says whether a ramp can move at all. Safari can and does report `running` on a context
   whose clock is not advancing, and every guard in this file trusted the string.

   WHY THAT MATCHES EVERY STEP HE DESCRIBED, INCLUDING THE ONE THAT MAKES NO SENSE:
     - He switched to another tab. document.hidden -> the master ramps toward 0. That lands.
     - He came back. The ramp back to 1 is scheduled against a clock that is not moving, so the bus
       stays at 0 while source nodes still start — which is exactly why Safari lit the tab's audio
       indicator over silence.
     - Cycling the sound toggle calls this function again: another ramp, same frozen clock, still 0.
     - A tap could not help either, because unlockAudio() returns at its first line whenever the
       state string says "running" (see orchestrator.js) — so the session kick and resume() were
       both unreachable in precisely this state.
     - THE PARROT. That button touches no audio at all, and it did not fix anything: when Safari's
       clock eventually restarted on its own, the ramp still sitting in the queue finally travelled
       and the bus climbed to 1. Whatever he happened to be pressing at that instant would look like
       the cause. It also explains why it never reproduced.

   ⚠ HONEST LIMIT, and it is the same one the session-kick note above carries: I could not reproduce
   his state. This is reasoned from the code and from his sequence, not measured on a device. What
   is NOT a hypothesis is the dead end itself — trusting a state string that this very file
   documents as unreliable is wrong whether or not it is what silenced his phone.

   WHEN IN DOUBT, SET. A ramp is a nicety worth 50ms; silence is a bug worth an evening. So the
   value is landed outright unless we have POSITIVE evidence the clock is moving. */
/* ⚠ TRI-STATE, AND THE THIRD VALUE IS THE WHOLE POINT: true / false / null for "cannot tell yet".
   Two callers read this evidence and THEIR SAFE DEFAULTS ARE OPPOSITE, which a boolean cannot
   express — collapsing "unknown" onto either one produces a real fault:
     - applyMasterGain must SET rather than ramp unless it can see the clock move, because a ramp on
       a stopped clock is silence forever.
     - the diagnosis must NOT say "stalled" unless it can see the clock stopped, because a wrong
       word on that row is exactly the thing that cost Wyatt an evening in the first place.
   The first version of this returned a bare false while unproven, which meant a healthy game
   reported "stalled" for the first half-second of every voyage. Caught before it shipped only by
   asking what the default MEANT to each caller. */
/* ⚠ AND READING IT MUST NOT CONSUME IT. The first version re-sampled on EVERY call — so the answer
   depended on who had asked last. audioDiagnosis() (500ms panel tick), audioRunning() and wakeCtx()
   all ask, often within the same millisecond; each one reset the pair, no two samples were ever
   200ms apart, the verdict was permanently "cannot tell", and wakeCtx() therefore returned early on
   a genuinely stalled context. MEASURED, and it is why this note exists rather than a tidier one:
   with the detector working and the row correctly reading "stalled", a tap moved the clock 1.55 ->
   1.55. Detection without recovery is a better-worded dead end, not a fix.
   SO THERE IS ONE WRITER AND IT KEEPS THE OLDER SAMPLE until enough wall time has passed to judge
   by; the verdict persists between reads. A frequent reader can no longer starve a slow question. */
let clkT = -1, clkWall = 0, clkVerdict = null;
function clockAdvancing() {
  if (!ctx) return null;
  const t = ctx.currentTime, w = Date.now();
  if (clkT < 0) { clkT = t; clkWall = w; return clkVerdict; }
  if (w - clkWall >= 200) {                          // enough wall time to judge by — and only then
    clkVerdict = (t - clkT) > 0.05;
    clkT = t; clkWall = w;
  }
  return clkVerdict;
}
/* The question the menu row could not ask: the context CLAIMS to run but its clock is frozen, so
   nothing scheduled will ever play. Different from "blocked" (state says so and a tap fixes it)
   and from "nosamples" (nothing decoded), and it needs a different sentence.
   ONLY ON PROOF — `=== false`, never a falsy unknown. */
function audioStalled() { return !!ctx && ctx.state === "running" && clockAdvancing() === false; }

function applyMasterGain() {
  if (!ctx || !masterGain) return; // safe to call with no graph built yet
  const hidden = typeof document !== "undefined" && document.hidden;
  const target = isMuted() || hidden ? 0 : 1;
  const g = masterGain.gain;
  const now = ctx.currentTime;
  g.cancelScheduledValues(now);          // nothing stale may survive this call
  g.setValueAtTime(g.value, now);        // anchor at where the gain ACTUALLY is
  if (ctx.state === "running" && clockAdvancing() === true) g.setTargetAtTime(target, now, 0.05);
  else g.value = target;                 // frozen or unproven clock: no ramp can travel, land it now
}

async function loadOne(name) {
  const res = await fetch(`${SFX_DIR}${name}.mp3`);
  const arr = await res.arrayBuffer();
  buffers[name] = await ctx.decodeAudioData(arr);
}

// Lazy, idempotent — a second call returns immediately. Resolves window.AudioContext /
// window.webkitAudioContext and returns silently when neither exists, so an unsupported browser
// degrades to a fully playable silent game (the project's existing silent-failure-for-optional-
// operations convention, cf. iconAt()'s image-load fallback).
async function initAudio() {
  if (ctx) return;
  if (typeof window === "undefined") return;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  masterGain = ctx.createGain();
  masterGain.connect(ctx.destination);
  stormGain = ctx.createGain();          // D-11: storm sits quieter underneath the short sounds
  stormGain.gain.value = STORM_VOLUME;
  stormGain.connect(masterGain);         // still governed by the one master mute/blur ramp
  applyMasterGain();
  // Fire-and-forget: a freshly-constructed AudioContext starts "suspended" under browser
  // autoplay policy even when construction itself happened inside a real user gesture's call
  // stack (as it does here — see the one-shot unlock in src/orchestrator.js's wireLobby()). A
  // rejected resume() must never propagate into the game action the gesture rode in on (T-21-04).
  /* The boot wake goes through the same one door as every other. It used to be a bare resume()
     whose resolution nobody acted on — and applyMasterGain() had already run four lines above,
     against a clock that was not yet moving. */
  wakeCtx();
  if (!visibilityHandlerAttached && typeof document !== "undefined") {
    visibilityHandlerAttached = true;
    document.addEventListener("visibilitychange", () => {
      if (!ctx) return;
      if (!document.hidden) {
        // REQUIRED on iOS Safari — a backgrounded AudioContext enters "interrupted" and will not
        // resume playback on its own even once the tab is visible again.
        /* THROUGH wakeCtx(), NOT A SECOND RAW resume(). This used to call resume() and then
           applyMasterGain() on the very next line — synchronously, while the context was still
           suspended and its clock still frozen, which is the exact ordering that pinned the master
           bus. wakeCtx() re-applies the gain once resume() RESOLVES. One waking path for the whole
           file; the play() funnel and this handler cannot drift apart. */
        wakeCtx();
      }
      applyMasterGain();
    });
  }
  await Promise.all(SFX_FILES.map(loadOne));
}

// The private play primitive. Returns immediately when ctx or the named buffer is missing (either
// initAudio() never ran, the browser is unsupported, or the fetch/decode hasn't resolved yet).
// A NEW AudioBufferSourceNode + a fresh per-play GainNode every call — never reused, never
// restarted, never dropped because another instance is already running (D-10).
/* THE CONTEXT CAN GO TO SLEEP AGAIN, AND NOTHING USED TO NOTICE — Wyatt, 2026-09-06, crew in two
   Safari windows: "sounds don't seem to be working for guests... i can see that safari THINKS it is
   playing sounds (the little sound icon in the browser url field appears when a sfx should appear)
   but i hear nothing... Refreshing the page seems to have fixed it."

   THAT PAIR OF SYMPTOMS IS THE DIAGNOSIS. A source node really is started — so Safari lights the
   tab's audio indicator — while the AudioContext sits in `suspended` or, on Apple platforms,
   `interrupted`, so nothing reaches the speakers. A reload builds a fresh context inside a fresh
   gesture and it works again.

   `resume()` was called in exactly two places (initAudio, and visibilitychange), so the context was
   woken ONCE at boot and never re-checked. Safari suspends aggressively — another tab taking audio
   focus, a Private window, a window switch, the system sleeping — and switching between two Safari
   windows is precisely what playing host-and-guest on one Mac consists of. Nothing else in the game
   was ever going to notice, because `play()` only ever asked whether the BUFFER existed.

   HIS INSTRUCTION, same message: "this should be solved architecturally through the shared engine
   from which both host and guest drain; not through driftable patches." play() IS that engine —
   every sound in the game, host or guest, solo or crew, reaches the speakers through this one
   function. So the wake-up lives here, once, and there is no guest-side anything to drift.

   Fire-and-forget for the same reason initAudio's is (T-21-04): a rejected resume must never
   propagate into the game action that triggered the sound. This play is still allowed to proceed —
   a context that resumes a few milliseconds late plays late, which is better than silence, and the
   NEXT sound finds it running. */
/* Yesterday this only woke the context. That was necessary and not sufficient: a context can come
   back RUNNING with its master bus still pinned by the automation above, which is the state he was
   in. So the gain is re-applied once resume() actually RESOLVES — at that point the clock is
   moving again and a ramp means something. `resuming` stops a resume() being fired on every single
   sound while one is already in flight; Safari does not enjoy that. */
/* ⭐ AND ONE MORE DOOR, BECAUSE resume() WAS NOT ENOUGH ON HIS MAC — Wyatt, 2026-09-08:
   "when i first loaded staging for this playtest, the sound was not happening. nothing i clicked or
   refreshed, or closed tab and reopened made it happen. then i had an idea -- i loaded youtube.com
   and started playing a video. this must have reset something in safari -- because when i went back
   to staging, now there was sound."

   READ WHAT THAT RULES OUT. A reload builds a brand new AudioContext inside a fresh gesture, and a
   reload did NOT fix it — so the thing that was asleep was not our context and not our code. What
   fixed it was another PAGE playing audio through a MEDIA ELEMENT. That is Safari's audio session,
   which sits underneath WebAudio: while it is not active, an AudioContext can report "running" and
   still reach no speaker, and nothing in the WebAudio API will claim it.

   AN <audio> ELEMENT WILL. Playing a real media element inside a user gesture is what the platform
   accepts as "this page wants the audio session" — the same thing YouTube did for him by accident.
   So the gesture unlock now plays half a tick of encoded silence, once, alongside resume(). It is
   477 bytes inlined (no request, nothing to fail), volume 0, and it is deliberately NOT WebAudio —
   routing it through our own graph would defeat the entire point.

   ⚠ HONEST LIMIT: I could not reproduce his state, so this is the best-supported hypothesis rather
   than a measured fix. It costs one silent element per page and cannot make anything worse; if his
   next voyage is silent again, the next thing to try is rebuilding the AudioContext outright. */
const SILENT_MP3 = "data:audio/mpeg;base64,SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjYyLjEyLjEwMQAAAAAAAAAAAAAA/+M4wAAAAAAAAAAAAEluZm8AAAAPAAAAAwAAAbAAqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq1dXV1dXV1dXV1dXV1dXV1dXV1dXV1dXV1dXV1dXV1dXV////////////////////////////////////////////AAAAAExhdmM2Mi4yOAAAAAAAAAAAAAAAACQC8AAAAAAAAAGw9wpEpwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA/+MYxAAAAANIAAAAAExBTUUzLjEwMFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV/+MYxDsAAANIAAAAAFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV/+MYxHYAAANIAAAAAFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV";
let sessionKicked = false;
function kickAudioSession() {
  if (sessionKicked || typeof Audio === "undefined") return;
  sessionKicked = true;
  try {
    const a = new Audio(SILENT_MP3);
    a.volume = 0;
    const p = a.play();
    if (p && p.catch) p.catch(() => { sessionKicked = false; });   // refused: let a later tap retry
  } catch (e) { sessionKicked = false; }
}

/* ══════════════════════════════════════════════════════════════════════════════════════════════
   ⭐ RECOVERING A LOST AUDIO SESSION — Wyatt, 2026-09-09, on his iPhone, and this is the SECOND
   round on the same fault. The first round taught the game to NOTICE it; this one teaches it to get
   out of it.

     "i was playing the game in mobile safari and the sound worked, then i turned my phone screen
      off for a minute (phone still on). the sound went away. when i reopened my phone, the game was
      back up, but the sound was gone — and the note in the game says 'Sound: ON — yer browser
      stalled it, tap the board.' but tapping the board doesn't unstall it; i've played multiple
      turns now, tapping and sailing and flipping, with no sound. The only way I've found to
      reliably fix this is to fully close the tab on my phone, open a new tab, and re-visit staging."

   HIS SCREENSHOTS ARE THE DIAGNOSIS, and they are why this is not another guess. Safari's page menu
   on a DIFFERENT tab offered him "Mute Other Tab — [STAGING] Pastry Pirates"; the tab switcher drew
   a red speaker badge on the staging tab; the address bar carried the audio indicator. Safari was
   certain the page was producing sound the entire time he heard nothing. Meanwhile the row he was
   reading said "stalled", so the clock check added this morning was RIGHT — the context claimed to
   run and its clock was frozen.

   SO WHY DID TAPPING NOT HELP? Two reasons, and the first is a one-line oversight:

     1. kickAudioSession() IS ONE-SHOT. `sessionKicked` is set true on the first successful play and
        is only ever reset in a catch. Locking the phone TAKES the audio session away — and the
        <audio> element is the only thing in this file that can claim it back (that is the whole
        reason it exists, see its own note). After the first tap of the page's life, it could never
        run again. resume() on its own does not reclaim a session; it only asks a context to run.
     2. And when a context has been interrupted long enough, Safari will not give it back at all.
        resume() resolves, or hangs, and the clock stays put.

   HIS OWN WORKAROUND IS THE FIX, AND IT IS WORTH SAYING PLAINLY: closing the tab and opening a new
   one builds a FRESH AudioContext. That is the strongest evidence available that the old context is
   unrecoverable, and it is exactly what the note at kickAudioSession predicted a day ago — "if his
   next voyage is silent again, the next thing to try is rebuilding the AudioContext outright."
   His next voyage was silent. So we rebuild.

   TWO TAPS, NOT ONE, AND NOT TWENTY. The first stalled gesture re-claims the session and asks the
   context to resume, because that is cheap and it is enough for an ordinary tab-switch. The second
   throws the context away and builds a new one, which is the thing that actually works and costs a
   re-decode. Escalating on the SECOND gesture rather than the first means an ordinary recoverable
   stall never pays for a rebuild, and a captain never has to tap more than twice.
   ══════════════════════════════════════════════════════════════════════════════════════════════ */
let stallGestures = 0;
let rebuilding = false;
/* CALLED ONLY FROM A REAL USER GESTURE (src/orchestrator.js's unlockAudio). Both remedies need one:
   a media element may not play outside a gesture, and a new AudioContext constructed outside one
   starts suspended with nothing able to wake it. */
function recoverAudio() {
  /* THE COUNTER IS CLEARED BY AUDIBLE SOUND, NOT BY TIME — so a page that has already been through
     one unrecoverable stall rebuilds on the FIRST tap of the next one rather than the second. That
     is deliberate: the cheap remedy has already been shown not to work on this device today. It
     resets the moment a gesture lands while sound is actually running. Observed in the red proof,
     where section 4 rebuilt on tap 1 because section 3 had already spent a gesture. */
  if (!audioStalled()) { stallGestures = 0; return; }
  stallGestures++;
  /* THE SESSION FIRST. Cheap, and it is the whole fix for the common case of another app having
     taken audio focus for a moment. Resetting the flag is the bug fix: without it this call has
     been a no-op on every gesture after the first since the day it was written. */
  sessionKicked = false;
  kickAudioSession();
  wakeCtx();
  if (stallGestures >= 2) rebuildAudio();
}
/* THROW THE CONTEXT AWAY AND BUILD A NEW ONE — what closing the tab does, without losing the game.
   ⚠ EVERY DECODED BUFFER BELONGS TO THE OLD CONTEXT and must go with it; an AudioBuffer decoded by
   a closed context cannot be played by a new one. The mp3s themselves come back out of the HTTP
   cache, so this costs a decode rather than a download. */
function rebuildAudio() {
  if (rebuilding) return;
  rebuilding = true;
  const wasWanted = ambWanted;
  try { ambStop(); } catch (e) {}
  try { musicStop(); } catch (e) {}
  const old = ctx;
  ctx = null; masterGain = null; stormGain = null;
  ambBus = null; ambSeaGain = null; ambGullGain = null; ambCreakGain = null;
  ambSeaSrc = null; ambLoading = null;
  ambRunning = false; musicRunning = false;
  musicSrc = null; musicGain = null; musicPanNode = null;
  if (musicTimer) { clearTimeout(musicTimer); musicTimer = null; }
  ambGen++;                                   // orphan every scatter timer still in flight
  for (const k of Object.keys(ambTimers)) { clearTimeout(ambTimers[k]); delete ambTimers[k]; }
  for (const k of Object.keys(buffers)) delete buffers[k];
  for (const k of Object.keys(ambBuffers)) delete ambBuffers[k];
  clkT = -1; clkWall = 0; clkVerdict = null;  // a new context's clock has its own history
  resuming = false; sessionKicked = false; stallGestures = 0;
  if (old && old.close) { try { old.close(); } catch (e) {} }
  /* initAudio() is what constructs the context, and it must happen INSIDE this gesture's call
     stack — so it is called synchronously here and only its loading is awaited. */
  initAudio()
    .then(() => { ambWanted = wasWanted; return wasWanted ? initAmbience() : null; })
    .then(() => { syncBeds(); applyMasterGain(); })
    .catch(() => {})
    .finally(() => { rebuilding = false; });
}

let resuming = false;
function wakeCtx() {
  /* ⚠ `ctx.state === "running"` USED TO END THIS FUNCTION, and that was the other half of the dead
     end described at applyMasterGain: on a context that reports running while its clock is frozen,
     resume() was never called again for the life of the page. audioStalled() is what lets a tap
     reach a context that is lying about itself. */
  if (!ctx || resuming) return;
  if (ctx.state === "running" && !audioStalled()) return;
  resuming = true;
  /* THE FLAG MUST BE ABLE TO CLEAR ITSELF. Safari can leave resume()'s promise PENDING FOREVER
     when the context is `interrupted` — it neither resolves nor rejects. A flag cleared only by
     those two paths would then block every future attempt for the life of the page, which is a
     deadlock I shipped in 0bda3be7 and am removing here rather than leaving for the next reader. */
  const clear = () => { resuming = false; };
  setTimeout(clear, 1000);
  ctx.resume().then(() => { clear(); applyMasterGain(); }).catch(clear);
}
/* Whether sound can ACTUALLY be heard right now — the question the unlock could not previously
   ask, which is why it gave up after one try. Exported for src/orchestrator.js's gesture unlock. */
function audioRunning() { return !!ctx && ctx.state === "running" && !audioStalled(); }
/* WHY THE GAME NOW SAYS THIS OUT LOUD. Wyatt spent an evening on "no sound in Safari" and I was
   wrong three times, because the screen showed exactly one word — "ON" — whether the engine was
   running, asleep, or had never loaded a single sample. He had no way to tell those apart and
   neither did I, so every step was a guess shipped to staging.

   THE TWO REMAINING CAUSES NEED OPPOSITE FIXES and look identical from the outside:
     "blocked"    the AudioContext exists but is not running — the browser has not let it start,
                  or has suspended it. Another tap normally fixes it (see the gesture unlock).
     "nosamples"  the context IS running and not one mp3 decoded — the files never arrived. That
                  is a content blocker, an extension or a failed fetch, and no amount of tapping
                  will help.
   A player whose audio is blocked deserves to know that too, rather than assuming the game is
   broken. This is the game being honest about its own state, on the row that already claims to
   report it. */
function audioDiagnosis() {
  if (isMuted()) return "muted";
  if (!ctx || ctx.state !== "running") return "blocked";
  /* THE STATE HE HAD NO WORD FOR. He spent an evening unable to tell me anything except "no
     sound", because the row said "ON" throughout. A context whose clock has stopped is neither
     blocked nor missing samples, and it is the one state where the honest advice is different:
     tapping does help, but only because a tap now reaches resume() again. */
  if (audioStalled()) return "stalled";
  if (!Object.keys(buffers).length) return "nosamples";
  /* THE THIRD SOUND-ON STATE, added here rather than beside the row. This function is already the
     single thing that decides what the menu says — panel.js's own comment: "ONE ATTRIBUTE CARRIES
     THE WHOLE TRUTH, so the menu row and the icon cannot disagree." A middle position the row
     could not name would be a switch the player cannot read. */
  return musicOn() ? "ok" : "nomusic";
}
function play(name, opts) {
  if (!ctx || !buffers[name]) return;
  /* MUTE NOW SKIPS THE SOUND ENTIRELY — Wyatt, 2026-09-06: "yes, make mute skip the sound
     entirely." Asked because of what he saw while testing crew: "when i DO mute the host screen,
     safari still shows the sfx firing whenever a sound file WOULD play — though i cannot hear it
     through my speakers." He was right to distrust it. Mute was `masterGain.gain = 0`, so a source
     node was still started on every cue: silent, but enough for Safari to light the tab's audio
     indicator — the toggle looked broken because the one visible signal said it had done nothing.

     SAFE BECAUSE NOTHING TIMES OFF A SOUND. play()'s return value now has NO consumer at all — it
     used to feed `stormNode`, and the storm became a scatter on 2026-09-08 (stormFireOne keeps its
     own list, and it carries the same mute guard this function does). No caller awaits a sound or
     reads its duration; the cannon and drumroll beats are measured constants, not audio callbacks.
     So a muted player and an unmuted one still run the game at identical pace, which matters: in
     crew they are the same voyage on two screens.

     applyMasterGain() is deliberately UNCHANGED and still ramps the master bus. A long sound that
     was already in flight when he hits mute must still fall silent, and that is the path that does
     it. This gate only stops NEW ones from starting. */
  if (isMuted()) return;
  wakeCtx();
  const bus = (opts && opts.bus) || masterGain;
  const src = ctx.createBufferSource();
  src.buffer = buffers[name];
  const gain = ctx.createGain();
  gain.gain.value = SFX_VOLUME[name] != null ? SFX_VOLUME[name] : 1;
  src.connect(gain).connect(bus);
  /* (opts.loop stood here for one day, for the looping storm. His 2026-09-08 ruling replaced that
     loop with scattered thunder — see stormScatterStart — and nothing else ever asked to loop, so
     the branch is deleted rather than left as a feature with no caller.) */
  src.start();
  return { src, gain };
}

// The single exported flip sound — every flip in the game passes through
// src/ui/board.js's setFlipCoin() "spin" branch, on both host and guest (D-02/D-07).
function playFlip() {
  play("coin-flip");
}
/* THE SOUND MUST LAST AS LONG AS THE COIN SPINS — Wyatt, 2026-09-06: "the guest docking coin flip
   lasted too long -- it kept flipping longer than the sound file lasted."

   He is describing a seam, not a wrong number. The spin is painted the instant the coin is tapped
   and runs until a RESULT ARRIVES; on a guest that result comes over the wire, so its length is the
   network's to decide and cannot be known in advance. The sound was fired exactly once, at
   setFlipCoin("spin") (src/ui/board.js:2407). Whenever the wire took longer than one coin-flip
   sample, the player watched a coin spin in silence — and docking IS a coin flip, so it is the
   moment most likely to show it.

   CAPPING THE SPIN WOULD BE THE WRONG FIX: landing a face before the result is known is a lie
   about the game. So the audio carries the picture instead.

   THE INTERVAL IS DERIVED, NEVER TYPED — the decoded buffer's own duration. Re-recording the sample
   at a different length re-times this automatically, and there is no second number to keep in step.
   The absolute ceiling below is a LEAK GUARD, not a game rule: it exists only so a caller that
   never calls stop can never leave a sound looping for the rest of the session. */
let flipLoopTimer = null;
function startFlipSpinSound() {
  stopFlipSpinSound();
  playFlip();
  const b = buffers["coin-flip"];
  if (!b || !b.duration) return;                 // not decoded yet: one shot is all we can honestly give
  const everyMs = Math.max(120, b.duration * 1000);
  const startedAt = Date.now();
  const tick = () => {
    if (Date.now() - startedAt > 30000) { stopFlipSpinSound(); return; }  // leak guard, see above
    playFlip();
    flipLoopTimer = setTimeout(tick, everyMs);
  };
  flipLoopTimer = setTimeout(tick, everyMs);
}
function stopFlipSpinSound() {
  if (flipLoopTimer) { clearTimeout(flipLoopTimer); flipLoopTimer = null; }
}

/* ⭐ THE STORM IS SCATTERED THUNDER — Wyatt, 2026-09-08: "play the storm.mp3 once at the beginning
   of a storm and then an average of once every 20 seconds -- not every 8 seconds. the sound in its
   current form is thunder. scatter pan it too."
   MEASURED, and he is right about the file: 8.007s whose envelope is one broadband crack that
   decays away. Looping that every 8 seconds is a metronome made of lightning.
   SAME MECHANISM AS THE SEA BED, deliberately — exponential gaps around a mean and a random pan,
   exactly as gulls and creaks are scattered. A fixed 20-second interval would become audible as a
   beat within a minute, which is the lesson ambSchedule already carries. AMBIENCE_SPREAD is
   reused rather than a second spread constant: it is "how far to port or starboard a scattered
   clip may land", and thunder is a scattered clip. */
const STORM_MEAN_SEC = 20;          // average wait between claps, after the first
let stormScatterTimer = null;
let stormGen = 0;                    // bumped on every stop, so a timer from a past storm is dead
let stormLive = [];                  // the claps still ringing, for fadeStorm to retire

function stormFireOne(name) {
  if (!ctx || !buffers[name] || isMuted()) return;
  const src = ctx.createBufferSource();
  src.buffer = buffers[name];
  const g = ctx.createGain();
  g.gain.value = SFX_VOLUME[name] != null ? SFX_VOLUME[name] : 1;
  src.connect(g);
  if (ctx.createStereoPanner) {
    const p = ctx.createStereoPanner();
    p.pan.value = (Math.random() * 2 - 1) * AMBIENCE_SPREAD;
    g.connect(p).connect(stormGain);
  } else {
    g.connect(stormGain);            // no panner on this browser: centred thunder beats none
  }
  src.start();
  const node = { src, gain: g };
  stormLive.push(node);
  src.onended = () => { stormLive = stormLive.filter(n => n !== node); };
}

function stormSchedule(name, gen) {
  const dt = Math.max(2, -Math.log(1 - Math.random()) * STORM_MEAN_SEC);
  stormScatterTimer = setTimeout(() => {
    if (gen !== stormGen) return;    // a previous storm's timer is dead on arrival
    stormFireOne(name);
    stormSchedule(name, gen);
  }, dt * 1000);
}

/** One clap the instant the storm arrives — his words — then scattered until fadeStorm(). */
function stormScatterStart(name) {
  stormScatterStop();
  wakeCtx();
  const gen = stormGen;
  stormFireOne(name);
  stormSchedule(name, gen);
}
function stormScatterStop() {
  stormGen++;
  if (stormScatterTimer) { clearTimeout(stormScatterTimer); stormScatterTimer = null; }
}

// D-09: a no-op when no thunder is in flight. Otherwise ramps each ringing clap's CURRENT gain down
// to a small epsilon over STORM_FADE_SEC — never to literal zero, which can throw or hitch in some
// engines — then stops it shortly after the ramp lands. Never stops a source without the ramp:
// D-09 forbids both a hard cut and droning past the moment.
// IT ALSO STOPS THE SCHEDULER, which is the half a one-shot storm never needed: retiring the claps
// already ringing while leaving the timer armed would simply produce another clap 20 seconds into
// a storm that is over.
function fadeStorm() {
  stormScatterStop();
  if (!ctx || !stormLive.length) { stormLive = []; return; }
  const going = stormLive;
  stormLive = [];                    // clear immediately, so a second call is a true no-op
  const now = ctx.currentTime;
  for (const node of going) {
    const g = node.gain.gain;
    g.cancelScheduledValues(now);
    g.setValueAtTime(g.value, now);  // anchor the ramp at the CURRENT value, not a stale target
    g.linearRampToValueAtTime(0.0001, now + STORM_FADE_SEC);
    try {
      node.src.stop(now + STORM_FADE_SEC + 0.05);
    } catch (e) {
      // a source already stopped/ended on its own is not an error worth surfacing
    }
  }
}

/* ================= THE AMBIENCE BED — runtime ================= */
/* THE SEAM IS THE SCREEN BEING UP, NOT WHO IS COMPUTING THE GAME. startAmbience() has exactly one
   caller — showGameView() in src/ui/lobby.js — and stopAmbience() exactly two, showHome() and
   showRoom(). That file's own header states why those three are the right place: "Wired in these
   three functions rather than at each caller, because every route to these screens goes through
   them and a route added later cannot forget." Solo, pass-and-play, host, guest and the
   reload-resume path all reach the board through showGameView() and therefore cannot drift apart.

   THIS IS THE POINT WYATT MADE ABOUT THE DRUMROLL, applied before the mistake rather than after:
   "DO NOT ARCHITECT DRIFTABLE CODE OR I WILL FIRE YOU" (2026-09-06). A bed started from a host path
   and a guest path is that same fault wearing a different coat — two screens, two lifetimes, and
   nothing making them agree. scripts/qa/ambience_one_seam_check.mjs fails the build if a second
   start seam ever appears anywhere under src/. */

/* A SEPARATE BUFFER STORE, deliberately — not the `buffers` map above. audioDiagnosis() reports
   "nosamples" from `Object.keys(buffers).length`, which is how a player learns that no mp3 decoded
   at all. Decoding the bed into that same map would make that check pass while every actual game
   sound was still missing, turning an honest diagnosis into a false green. */
const ambBuffers = {};
let ambBus = null, ambSeaGain = null, ambGullGain = null, ambCreakGain = null;
let ambSeaSrc = null;
const ambTimers = {};
let ambWanted = false;    // the board is on screen
let ambRunning = false;   // sources are actually live
let ambLoading = null;    // the in-flight load promise, so a second call does not refetch
let ambGen = 0;           // bumped on every stop, so a scatter timer from a previous run cannot fire

/* Find the first and last sample carrying real signal, so the bed loops INSIDE the decoded buffer.
   docs/AUDIO.md §3: "MP3 pads a sliver of silence onto both ends of every file, so a naive MP3 loop
   clicks each time it comes round... Set loopStart/loopEnd on the AudioBufferSourceNode." That doc
   says "two numbers per looping file"; these two are MEASURED off the samples at load instead, so a
   re-export from Luis re-times itself and there is no pair of constants to keep in step. */
function ambLoopPoints(buf) {
  const th = 0.0015, ch = buf.getChannelData(0), n = ch.length;
  let a = 0, b = n - 1;
  while (a < n && Math.abs(ch[a]) < th) a++;
  while (b > a && Math.abs(ch[b]) < th) b--;
  return b > a ? { start: a / buf.sampleRate, end: b / buf.sampleRate } : { start: 0, end: buf.duration };
}

async function ambLoadOne(name) {
  const res = await fetch(`${SFX_DIR}${name}.mp3`);
  const arr = await res.arrayBuffer();
  ambBuffers[name] = await ctx.decodeAudioData(arr);
}

/* The bed's own load path — the whole reason these clips are not in SFX_FILES. Lazy, idempotent,
   and never awaited by anything the player is waiting on. */
async function initAmbience() {
  if (ambLoading) return ambLoading;
  ambLoading = (async () => {
    await initAudio();                       // idempotent; returns at once if the graph exists
    if (!ctx) return;                        // unsupported browser — a silent sea, never a crash
    if (!ambBus) {
      ambBus = ctx.createGain();
      ambBus.gain.value = 0;                 // comes up on a ramp in ambStart(), never a cut
      ambBus.connect(masterGain);            // governed by the one mute/tab-blur ramp, like everything else
      ambSeaGain = ctx.createGain();   ambSeaGain.gain.value = AMBIENCE_SEA;     ambSeaGain.connect(ambBus);
      ambGullGain = ctx.createGain();  ambGullGain.gain.value = AMBIENCE_GULL;   ambGullGain.connect(ambBus);
      ambCreakGain = ctx.createGain(); ambCreakGain.gain.value = AMBIENCE_CREAK; ambCreakGain.connect(ambBus);
      /* The music sits OUTSIDE ambBus, on its own gain and pan straight into masterGain. It is not
         part of the bed and must not fade with it — the middle position of his three-way switch
         silences the song and keeps the sea, which is only possible if they are separate. */
      musicPanNode = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
      musicGain = ctx.createGain();
      musicGain.gain.value = MUSIC_LEVEL;
      if (musicPanNode) { musicPanNode.pan.value = MUSIC_PAN; musicGain.connect(musicPanNode).connect(masterGain); }
      else musicGain.connect(masterGain);   // no panner on this browser: centred music beats none
    }
    /* The song rides the bed's load path, not the game's. Same reason and the same 540 KB
       argument: docs/AUDIO.md §3, "Music must load on its own path and fade in whenever it
       arrives." */
    await Promise.all(AMBIENCE_FILES.concat([MUSIC_FILE]).map(ambLoadOne));
  })().catch(() => { /* a bed that fails to arrive is a quiet game, never a broken one */ });
  return ambLoading;
}

// One scattered cry or creak: a fresh source every time, trimmed to its family, jittered by
// AMBIENCE_LIVELINESS, and panned somewhere inside AMBIENCE_SPREAD. Luis asked for the randomised
// stereo by name; the loudness and pitch jitter is what stops five gull files sounding like five
// gull files on repeat.
function ambFireOne(fam) {
  const names = AMBIENCE_FAMILY[fam];
  const name = names[(Math.random() * names.length) | 0];
  const buf = ambBuffers[name];
  if (!ctx || !buf) return;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.playbackRate.value = 1 + (Math.random() * 2 - 1) * 0.10 * AMBIENCE_LIVELINESS;
  const g = ctx.createGain();
  g.gain.value = AMBIENCE_TRIM[name] * Math.pow(10, ((Math.random() * 2 - 1) * 7 * AMBIENCE_LIVELINESS) / 20);
  const dest = fam === "gull" ? ambGullGain : ambCreakGain;
  src.connect(g);
  /* createStereoPanner is absent on some older WebKit builds. A bed with no panning is still a
     bed; a bed that throws takes the whole voyage's audio down with it. */
  if (ctx.createStereoPanner) {
    const p = ctx.createStereoPanner();
    p.pan.value = (Math.random() * 2 - 1) * AMBIENCE_SPREAD;
    g.connect(p).connect(dest);
  } else {
    g.connect(dest);
  }
  src.start();
}

/* Exponential gaps, not a fixed interval. A metronome is exactly what makes a bed sound like a
   loop: the ear finds a regular beat within about a minute and then cannot un-hear it. */
function ambSchedule(fam, gen) {
  const meanS = fam === "gull" ? AMBIENCE_GULL_MEAN_SEC : AMBIENCE_CREAK_MEAN_SEC;
  const dt = Math.max(0.3, -Math.log(1 - Math.random()) * meanS);
  ambTimers[fam] = setTimeout(() => {
    if (!ambRunning || gen !== ambGen) return;   // a timer from a previous run is dead on arrival
    ambFireOne(fam);
    ambSchedule(fam, gen);
  }, dt * 1000);
}

function ambStart() {
  if (ambRunning || !ctx || !ambBuffers["ocean-loop"]) return;
  ambRunning = true;
  const gen = ++ambGen;
  const buf = ambBuffers["ocean-loop"];
  const lp = ambLoopPoints(buf);
  ambSeaSrc = ctx.createBufferSource();
  ambSeaSrc.buffer = buf;
  ambSeaSrc.loop = true;
  ambSeaSrc.loopStart = lp.start;
  ambSeaSrc.loopEnd = lp.end;
  ambSeaSrc.connect(ambSeaGain);
  ambSeaSrc.start(0, lp.start);
  const now = ctx.currentTime;
  const g = ambBus.gain;
  g.cancelScheduledValues(now);
  g.setValueAtTime(g.value, now);              // anchor at where it ACTUALLY is — fadeStorm's rule
  if (ctx.state === "running") g.linearRampToValueAtTime(1, now + AMBIENCE_FADE_IN_SEC);
  else g.value = 1;                            // frozen clock: a ramp cannot travel, so land it
  ambSchedule("gull", gen);
  ambSchedule("creak", gen);
}

function ambStop() {
  if (!ambRunning) return;
  ambRunning = false;
  ambGen++;                                    // orphan every scatter timer still in flight
  for (const k of Object.keys(ambTimers)) { clearTimeout(ambTimers[k]); delete ambTimers[k]; }
  const src = ambSeaSrc;
  ambSeaSrc = null;
  if (!ctx || !ambBus) return;
  const now = ctx.currentTime;
  const g = ambBus.gain;
  g.cancelScheduledValues(now);
  g.setValueAtTime(g.value, now);
  g.linearRampToValueAtTime(0.0001, now + AMBIENCE_FADE_OUT_SEC);  // never literal zero — fadeStorm's note
  try { if (src) src.stop(now + AMBIENCE_FADE_OUT_SEC + 0.05); } catch (e) { /* already ended */ }
}

/* ---- the music: plays, ENDS, waits a minute, comes round again ---- */
let musicSrc = null, musicGain = null, musicPanNode = null, musicTimer = null, musicRunning = false;

function musicPlayOnce() {
  const buf = ambBuffers[MUSIC_FILE];
  if (!ctx || !buf) return;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  /* DELIBERATELY NOT src.loop. Looping would restart the song the instant it ended and make
     MUSIC_GAP_SEC dead code — his ruling is that it waits. So the track runs to its end, `onended`
     fires, and the timer below brings it back. */
  src.connect(musicGain);
  src.onended = () => {
    if (src !== musicSrc || !musicRunning) return;   // stopped or superseded: not our business
    musicSrc = null;
    musicTimer = setTimeout(() => { if (musicRunning) musicPlayOnce(); }, MUSIC_GAP_SEC * 1000);
  };
  src.start();
  musicSrc = src;
}

function musicStart() {
  if (musicRunning || !ctx || !ambBuffers[MUSIC_FILE]) return;
  musicRunning = true;
  musicPlayOnce();
}

function musicStop() {
  if (!musicRunning) return;
  musicRunning = false;
  if (musicTimer) { clearTimeout(musicTimer); musicTimer = null; }
  const src = musicSrc;
  musicSrc = null;
  if (!ctx || !musicGain) return;
  /* Ramped, never cut — a song stopping dead mid-bar is worse than the silence it makes room for. */
  const now = ctx.currentTime;
  const g = musicGain.gain;
  g.cancelScheduledValues(now);
  g.setValueAtTime(g.value, now);
  g.linearRampToValueAtTime(0.0001, now + AMBIENCE_FADE_OUT_SEC);
  try { if (src) src.stop(now + AMBIENCE_FADE_OUT_SEC + 0.05); } catch (e) { /* already ended */ }
  // restore the level for the next start, once the ramp has certainly landed
  setTimeout(() => { if (musicGain && !musicRunning) musicGain.gain.value = MUSIC_LEVEL; },
             (AMBIENCE_FADE_OUT_SEC + 0.2) * 1000);
}

/* THE ONE RECONCILER, and it now answers for both continuous sounds. Five things can change
   whether the sea or the song should be audible — the board coming up, the board going away, the
   sound mode changing, and the clips finally arriving — and every one of them calls this rather
   than starting or stopping anything itself. That is what stops a "start" and a "stop" racing each
   other into a bed that is running with nobody able to say so.

   THE TWO ANSWERS DIFFER BY EXACTLY ONE TERM. The sea plays whenever sound is on at all; the music
   additionally needs the full mode. That single difference IS the middle position of his three-way
   switch, expressed once. */
/* ⭐ THE BEDS WAKE THE CONTEXT, TOO — Wyatt, 2026-09-07 playtest (item 10): "after refreshing the
   page multiple times, starting different games in staging, exiting games, and restarting new
   ones, the sound fully stops playing at all... i'm using safari", and the Chrome half of the same
   note: "the game loaded automatically but the sound switch said 'sound blocked by your browser'
   until I refreshed."

   WHY THE SEA AND THE SONG WERE THE TWO SOUNDS THIS COULD HAPPEN TO. play() has woken the context
   on every cue since 0bda3be7 — but the sea and the music do not go through play(). They build
   their own source nodes (ambStart, musicPlayOnce), because they are continuous and play() is a
   one-shot primitive. So the two sounds a player hears FIRST, before touching anything, were the
   only two with no wake on their path at all. Start a game into a suspended context and the bed
   ran silently forever with nothing to notice.

   His Chrome clue is the proof: Chrome resumes happily OUTSIDE a gesture, so on Chrome this one
   line is the whole fix — the game auto-resumed a saved solo voyage with no tap anywhere, and
   nothing asked the context to wake. On Safari a resume outside a gesture is refused, so this is
   necessary but not sufficient there; the always-armed gesture listener in src/orchestrator.js is
   the other half. Two browsers, two halves, one door each. */
function syncBeds() {
  wakeCtx();
  const soundOn = ambWanted && !isMuted();
  if (soundOn && ambBuffers["ocean-loop"]) ambStart(); else ambStop();
  if (soundOn && musicOn() && ambBuffers[MUSIC_FILE]) musicStart(); else musicStop();
}

/* MUTE STOPS THE SEA OUTRIGHT rather than only pulling the master bus to zero. Wyatt, 2026-09-06:
   "yes, make mute skip the sound entirely" — asked because a muted Safari still lit the tab's audio
   indicator on every cue, so the toggle looked broken. A LOOPING bed is that same complaint with a
   stopwatch on it: it would hold the indicator lit for the entire voyage. play() already returns
   early when muted; this is the same rule for the sound that never stops on its own. */

function startAmbience() {
  ambWanted = true;
  initAmbience().then(syncBeds).catch(() => {});
  syncBeds();                                  // already loaded from an earlier voyage: start now
}

function stopAmbience() {
  ambWanted = false;
  syncBeds();
}

// The impure dispatcher — called once per event that just arrived, on both host (liveRender())
// and guest (watchEvents()). D-07: the whole table is audible, and that is still the rule for
// every cue but ONE.
// ⚠ THIS COMMENT USED TO END "no appState.mySeat/isLocalTo gate anywhere on this path, EVER".
// That absolute stopped being true on 2026-09-06 when Wyatt ruled the your-turn bell is heard by
// that player alone (LOCAL_ONLY_SOUND_EVENTS above). It is corrected here rather than left
// standing, because a "never" beside code that does it once is how the next reader reports
// working code as a bug — the exact rot that had to be cleaned out of docs/AUDIO.md the same day.
// The gate is NOT taken here: `isLocalSeat` is passed IN by the single caller, so this file still
// imports nothing and the seat logic stays where appState already lives. Never writes a field onto the event object to communicate with this
// module: all dedup/fade state (stormNode above) lives in this file's own module-locals, never on
// an object game.ev() produced or that netPushEvent carries — that risks drifting the determinism
// corpus the v1.3 engine fence exists to protect.
/* ONCE PER EVENT, IN EVERY MODE — Wyatt, 2026-08-20: "board sounds should be played in consistent
   places across the different game modes", and, on the symptom: "the same audio file at the
   beginning of sailing, and again at the beginning of a pass... sometimes they sound robotic as a
   result when they play twice right on top of each other."

   Two near-identical copies of one waveform a few milliseconds apart interfere — that is the
   "robotic" he hears, and it is the tell that the SAME sound played twice, not that two sounds
   played.

   THE CAUSE, and the comment above this function was already asserting the fix as though it were
   true: this is called "once per event that just arrived", but on the host it is reached through
   liveRender() (ui/panel.js:302), which plays the sound for whatever the LATEST event is — every
   time it is called. liveRender() has ~50 call sites. Any two of them firing without a new event
   in between replay the same sound. Two that do exactly that:
     ui/flow.js:1896-1898  ev({t:"sail"}); liveRender();  then  tradewind(p) ... liveRender();
     ui/flow.js:2001       if(appState.passAndPlay) liveRender();   <- no new event at all
   The second is why pass-and-play is worse, which is exactly where he reported it worst.

   THE FIX BELONGS HERE, NOT IN THE 50 CALLERS. Sound has two triggers — liveRender() on the host,
   watchEvents() on a guest — and putting the rule in either one leaves the other free to drift.
   This function is the single place both tiers pass through, so "once per event" becomes true for
   solo, pass-and-play, host and guest at once, and stays true for a 51st caller nobody has written
   yet. That is the consistency he asked for, enforced in one place rather than promised in fifty.

   IDENTITY, deliberately: game.ev() mints a fresh object per event, and the guest's watchEvents
   receives each event once as its own object (child-added, pushed at :1263), so the same reference
   can only ever mean "this exact event again". Nothing is written onto the event object — the module
   header forbids it, because an event field would risk drifting the determinism corpus. */
let lastSounded = null;
function playForEvent(e, isLocalSeat) {
  if (e === lastSounded) return;                 // the same event replayed by a second liveRender()
  lastSounded = e;
  // The arrival of the next round header or the voyage's end is the exact game-state signal that
  // the storm moment has resolved — fade whatever storm sound is in flight BEFORE possibly
  // starting a fresh one for THIS event, so a freshly-started storm cue is never immediately
  // faded by its own newround.
  if (e.t === "newround" || e.t === "end") fadeStorm();
  const s = soundForEvent(e);
  if (!s) return;
  /* The exception, applied. `isLocalSeat` is UNDEFINED for every caller that does not pass it, so
     a localOnly cue stays SILENT rather than leaking to the whole table when the answer is unknown
     — silence is the safe failure here, not sound. */
  if (s.localOnly && isLocalSeat !== true) return;
  /* The storm is not a one-shot and not a loop — it is a scatter that runs for the round. */
  if (s.scatter) { stormScatterStart(s.name); return; }
  play(s.name, { bus: masterGain });
}

// D-05's placeholder cue, tied to the win screen APPEARING, not to the `end`/`finish` events —
// those stay silent as events per D-06. Called from both places appState.liveDone is set true
// (host and guest).
function playWinScreen() {
  play(WIN_SOUND, { bus: masterGain });
}

// 260801-7f4 — the moment a fight is JOINED, not the `battle` event (which only exists once the
// fight is already over, spoils moved and all — see the `battle: null` comment above). Called
// directly from the orchestrator's own battle-opening seams: once on the host tier (asyncBattle,
// after the powder guard, before the opening announcement) and once on the guest tier (watchBattle,
// on the false->true edge of appState.spectatingBattle). A named moment cue, built the same way as
// playWinScreen() — calls the private play() primitive with a fixed stem and the master bus, and
// nothing else.
/* HOW LONG IS A STEM, IN MILLISECONDS — read off the decoded buffer, never typed.
 *
 * RULE 9, and this is the case the rule was written for: the drumroll's narration box has to be
 * held open for as long as the drumroll actually lasts, and that length is a property of a FILE
 * somebody re-exports. A typed 3150 would be right until Luis sends a longer roll, and then it
 * would be silently wrong — audio running on past a box that has already faded.
 *
 * Returns 0, never NaN and never a throw, when the buffer is not decoded yet (muted boot,
 * unsupported browser, fetch still in flight). Callers treat 0 as "no opinion" and fall back to
 * the reading-speed hold, which is what the box did before any of this existed. */
function soundDurationMs(name) {
  const b = buffers[name];
  return b && b.duration > 0 ? Math.round(b.duration * 1000) : 0;
}

function playDrumroll() {
  play(DRUMROLL_SOUND, { bus: masterGain });
}

function playCannon() {
  play(CANNON_SOUND, { bus: masterGain });
}

function playBattleEngage() {
  play(BATTLE_ENGAGE_SOUND, { bus: masterGain });
}

export {
  SFX_DIR, SFX_FILES, SFX_VOLUME, MUTE_KEY, initAudio, playFlip, startFlipSpinSound, stopFlipSpinSound, isMuted, setMuted, audioRunning, audioDiagnosis,
  kickAudioSession,
  recoverAudio,
  /* wakeCtx is exported for ONE caller: the gesture listener in src/orchestrator.js. Safari only
     honours resume() inside a user-gesture call stack, and initAudio() cannot be that caller —
     it returns immediately once `ctx` exists, so every gesture after the first reached no wake at
     all. That is precisely how a page could end up permanently silent. */
  wakeCtx,
  EVENT_SOUND, soundForEvent, playForEvent, playWinScreen, fadeStorm,
  STORM_VOLUME, STORM_FADE_SEC, WIN_SOUND, DRUMROLL_SOUND, CANNON_SOUND,
  soundDurationMs, playDrumroll, playCannon,
  BATTLE_ENGAGE_SOUND, playBattleEngage,
  /* The bed. startAmbience/stopAmbience have exactly three call sites between them, all in
     src/ui/lobby.js's three screen functions — see the runtime block's header, and the gate that
     holds it to that. The constants are exported so a headless harness can assert his tuned values
     by name without a browser, the same way WIN_SOUND and CANNON_SOUND are. */
  AMBIENCE_FILES, AMBIENCE_LUFS, AMBIENCE_TRIM, startAmbience, stopAmbience, initAmbience,
  AMBIENCE_SEA, AMBIENCE_GULL, AMBIENCE_CREAK,
  AMBIENCE_GULL_MEAN_SEC, AMBIENCE_CREAK_MEAN_SEC, AMBIENCE_SPREAD, AMBIENCE_LIVELINESS,
  MUSIC_LEVEL, MUSIC_PAN, MUSIC_FILE, MUSIC_GAP_SEC,
  SOUND_MODES, SOUND_MODE_KEY, soundMode, setSoundMode, cycleSoundMode, musicOn,
};
