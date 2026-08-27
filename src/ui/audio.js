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
const SFX_FILES = ["battle-swords", "coin-flip", "fishing", "ship-move", "store-ingredient", "storm"];
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
};
// pp_-prefixed per-browser preference convention pp_timerOff already established
// (src/orchestrator.js:168) — mute follows it exactly, same key-naming shape.
const MUTE_KEY = "pp_muted";

// D-11 — Claude's discretion (21-CONTEXT.md): the storm sits quieter underneath the short sounds
// so flips, clashes and dockings stay clear on top of it. Opening value; a by-ear browser pass
// tunes this one number, never the graph shape.
const STORM_VOLUME = 0.35;
// D-09 — Claude's discretion: the fade duration once the storm moment resolves (the next
// `newround`/`end`). Opening value, same tuning-point discipline as STORM_VOLUME.
const STORM_FADE_SEC = 1.2;

// D-22 EXPLICIT PLACEHOLDER — not a final choice. Running out of time must make a noise so you
// notice even if you looked away (Wyatt's call), but none of Luis's six is an alarm. This is a
// stand-in: short, percussive, unambiguously adverse. On the shopping list for Luis: a
// purpose-made time-out alert. `EVENT_SOUND.shotclock`/`.shotclockskip` reference this constant
// rather than repeating the stem string, so a later edit cannot quietly de-flag it by inlining it.
const SHOTCLOCK_SOUND_PLACEHOLDER = "battle-swords";

// D-05 EXPLICIT PLACEHOLDER — not a final choice. The win screen gets a sound rather than
// silence; nothing in the six actually sounds like victory, so Claude selected the short, bright
// one — closest of the six to a chime — as a stand-in. On the shopping list for Luis: a
// purpose-made victory sound. Swapping it is a one-constant change.
const WIN_SOUND_PLACEHOLDER = "store-ingredient";

// 260801-7f4 — a REAL choice, not a placeholder like the two above. Unlike WIN_SOUND_PLACEHOLDER
// and SHOTCLOCK_SOUND_PLACEHOLDER, this stem literally is a sword clash; it is not on any shopping
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
  sail: "ship-move", windmove: "ship-move", blownOut: "ship-move",
  // D-01/D-04: a crate changing hands, whether docking or trading
  dock: "store-ingredient", trade: "store-ingredient",
  // D-01; D-04 (fleeing/dodging — the clash happened, you just left it). NOT the battle's own
  // start/end — see the `battle: null` entry below.
  battleflee: "battle-swords", dodge: "battle-swords",
  // D-01 (fishing); D-03 (dropping anchor in a storm); D-21 (the anchor holding — same family)
  fish: "fishing", anchor: "fishing", anchorHold: "fishing",
  // D-04: running aground / shipwrecked both borrow storm
  // v2.1: nothing runs aground any more — the storm keeps its own cue via `newround`
  shipwrecked: "storm",
  // D-22 — see SHOTCLOCK_SOUND_PLACEHOLDER above. Referenced by constant, never repeated inline.
  shotclock: SHOTCLOCK_SOUND_PLACEHOLDER, shotclockskip: SHOTCLOCK_SOUND_PLACEHOLDER,
  // D-06 — explicit silence, not merely absent from the table
  blocked: null, moored: null, turn: null, newround: null, tradewind: null, bakeoff: null,
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
  // the ocean look and a blown-into-berth rescue are moments, but quiet ones — the narration and
  // the board already carry them
  pass: null,
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
function soundForEvent(e) {
  if (e.t === "newround" && e.storm) return { name: "storm", bus: "storm" };
  const name = EVENT_SOUND[e.t];
  return name ? { name, bus: "master" } : null;
}

/* ================= Lazy audio graph — built ONLY by initAudio(), nothing at module load ================= */

let ctx = null;
let masterGain = null;
let stormGain = null; // D-11: storm's own quieter bus, still connected into masterGain
let stormNode = null; // { src, gain } of the in-flight storm sound, or null — fadeStorm()'s target
const buffers = {}; // stem name -> decoded AudioBuffer
let visibilityHandlerAttached = false;
// Seeded lazily, on first isMuted()/setMuted() call — never read at module load.
let mutedCache = null;

function readMutedFromStorage() {
  try {
    return localStorage.getItem(MUTE_KEY) === "1";
  } catch (e) {
    return false; // absent/tampered store degrades to unmuted, never a crash (T-21-01)
  }
}

// isMuted()/setMuted() are safe to call before initAudio() has ever run — mutedCache is seeded
// independently of the audio graph, and applyMasterGain() (called by setMuted()) itself no-ops
// when ctx is still null.
function isMuted() {
  if (mutedCache === null) mutedCache = readMutedFromStorage();
  return mutedCache;
}
function setMuted(v) {
  mutedCache = !!v;
  try {
    localStorage.setItem(MUTE_KEY, mutedCache ? "1" : "0");
  } catch (e) {
    // swallowed — mirrors pp_timerOff's own try/catch discipline exactly
  }
  applyMasterGain();
}

// The one place the master level is decided (D-12/D-13): 0 when muted OR the tab is hidden,
// otherwise 1 — applied through a ramp, never a bare assignment, so mute and tab-blur can never
// stomp on each other mid-transition.
function applyMasterGain() {
  if (!ctx || !masterGain) return; // safe to call with no graph built yet
  const hidden = typeof document !== "undefined" && document.hidden;
  const target = isMuted() || hidden ? 0 : 1;
  masterGain.gain.setTargetAtTime(target, ctx.currentTime, 0.05);
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
  ctx.resume().catch(() => {});
  if (!visibilityHandlerAttached && typeof document !== "undefined") {
    visibilityHandlerAttached = true;
    document.addEventListener("visibilitychange", () => {
      if (!ctx) return;
      if (!document.hidden) {
        // REQUIRED on iOS Safari — a backgrounded AudioContext enters "interrupted" and will not
        // resume playback on its own even once the tab is visible again.
        ctx.resume().catch(() => {});
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
function play(name, opts) {
  if (!ctx || !buffers[name]) return;
  const bus = (opts && opts.bus) || masterGain;
  const src = ctx.createBufferSource();
  src.buffer = buffers[name];
  const gain = ctx.createGain();
  gain.gain.value = SFX_VOLUME[name] != null ? SFX_VOLUME[name] : 1;
  src.connect(gain).connect(bus);
  src.start();
  return { src, gain };
}

// The single exported flip sound — every flip in the game passes through
// src/ui/board.js's setFlipCoin() "spin" branch, on both host and guest (D-02/D-07).
function playFlip() {
  play("coin-flip");
}

// D-09: a no-op when no storm node is in flight. Otherwise ramps the CURRENT gain value down to a
// small epsilon over STORM_FADE_SEC — never to literal zero, which can throw or hitch in some
// engines — then stops the source shortly after the ramp lands. Never stops the source without the
// ramp: D-09 forbids both a hard cut and droning past the moment.
function fadeStorm() {
  if (!stormNode) return;
  const node = stormNode;
  stormNode = null; // clear the held reference immediately, so a second call is a true no-op
  if (!ctx) return;
  const g = node.gain.gain;
  const now = ctx.currentTime;
  g.cancelScheduledValues(now);
  g.setValueAtTime(g.value, now); // anchor the ramp at the CURRENT value, not a stale target
  g.linearRampToValueAtTime(0.0001, now + STORM_FADE_SEC);
  try {
    node.src.stop(now + STORM_FADE_SEC + 0.05);
  } catch (e) {
    // a source already stopped/ended on its own is not an error worth surfacing
  }
}

// The impure dispatcher — called once per event that just arrived, on both host (liveRender())
// and guest (watchEvents()). D-07: no appState.mySeat/isLocalTo gate anywhere on this path, ever —
// the whole table is audible. Never writes a field onto the event object to communicate with this
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
function playForEvent(e) {
  if (e === lastSounded) return;                 // the same event replayed by a second liveRender()
  lastSounded = e;
  // The arrival of the next round header or the voyage's end is the exact game-state signal that
  // the storm moment has resolved — fade whatever storm sound is in flight BEFORE possibly
  // starting a fresh one for THIS event, so a freshly-started storm cue is never immediately
  // faded by its own newround.
  if (e.t === "newround" || e.t === "end") fadeStorm();
  const s = soundForEvent(e);
  if (!s) return;
  const bus = s.bus === "storm" ? stormGain : masterGain;
  const node = play(s.name, { bus });
  if (s.bus === "storm") stormNode = node || null;
}

// D-05's placeholder cue, tied to the win screen APPEARING, not to the `end`/`finish` events —
// those stay silent as events per D-06. Called from both places appState.liveDone is set true
// (host and guest).
function playWinScreen() {
  play(WIN_SOUND_PLACEHOLDER, { bus: masterGain });
}

// 260801-7f4 — the moment a fight is JOINED, not the `battle` event (which only exists once the
// fight is already over, spoils moved and all — see the `battle: null` comment above). Called
// directly from the orchestrator's own battle-opening seams: once on the host tier (asyncBattle,
// after the powder guard, before the opening announcement) and once on the guest tier (watchBattle,
// on the false->true edge of appState.spectatingBattle). A named moment cue, built the same way as
// playWinScreen() — calls the private play() primitive with a fixed stem and the master bus, and
// nothing else.
function playBattleEngage() {
  play(BATTLE_ENGAGE_SOUND, { bus: masterGain });
}

export {
  SFX_DIR, SFX_FILES, SFX_VOLUME, MUTE_KEY, initAudio, playFlip, isMuted, setMuted,
  EVENT_SOUND, soundForEvent, playForEvent, playWinScreen, fadeStorm,
  STORM_VOLUME, STORM_FADE_SEC, WIN_SOUND_PLACEHOLDER, SHOTCLOCK_SOUND_PLACEHOLDER,
  BATTLE_ENGAGE_SOUND, playBattleEngage,
};
