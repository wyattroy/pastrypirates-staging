// src/shared/sounds.js
//
// ⭐ THE SOUND ENGINE'S ONE TABLE. Wyatt, 2026-09-19:
//
//     "We need a sound engine. 'Eight of the eighteen sounds never go through the event map at
//      all — they're played straight from code.' All our new maps will have different sounds, so
//      these must be cleaned up the same way the assets and narration must be — folderized, called
//      in one place, through one channel, consistently across game modes and player types."
//
// HE IS QUOTING THIS PROJECT'S OWN SWEEP BACK AT IT (docs/AUDIO.md §1c, 2026-09-18), and the count
// is worth stating exactly, because it is the shape of the fault rather than the size of it:
// SEVEN stems were reachable only through the event map, ONE (the cork pop) through both, and TEN
// only by a named function call — `playCardSwish()`, `playLidNote(k)`, `playCrateVerdict(right)`.
//
// WHY THAT IS A DEFECT AND NOT A STYLE. Every one of those function names IS A FILENAME. When a
// second map arrives with its own sounds, `playCardSwish` is a promise about a file that map does
// not have — so the swap would have to happen at twenty-four call sites across six files, in the
// UI tier, where a map has no business being known about at all. A call site must name THE MOMENT
// ("the bake-off's lid lands") and never the sound; only this table may name a sound.
//
// SO THERE ARE THREE THINGS HERE AND NOTHING ELSE:
//   1. THE PACK — which folder the files come from. A map brings its own; anything it does not
//      bring falls back to the base pack, so a new map can ship three files or thirty.
//   2. THE CUES — every moment in the game that makes a sound, each naming a stem, its slice, its
//      spacing rule and its bus. This is the ONE PLACE.
//   3. THE EVENT MAP — which of the engine's own events reach which cue. It is a VIEW ON THE SAME
//      TABLE, not a second one, which is the whole point: an event cue and a moment cue are now
//      the same kind of thing and go out through the same door (`playCue`, src/ui/audio.js).
//
// CONSISTENT ACROSS GAME MODES AND PLAYER TYPES, BY CONSTRUCTION. A cue is chosen from the moment
// and nothing else — never from `isHost`, never from whose turn it is, never from whether a bot or
// a person caused it. The ONE exception in the game is declared here as a field on the cue it
// belongs to (`localOnly`, on "your turn" — his knowing ruling of 2026-09-06), so adding a second
// is a visible act in this file rather than an `if` somewhere in the UI.
//
// TIER: `shared`, which imports nothing from anywhere under `src/` (scripts/module_graph_check.js
// enforces it). That is what lets a headless harness read the whole sound design under plain Node,
// with no AudioContext and no DOM — the property that makes every gate below possible.

/* ================= 1. THE PACK — folderized, so a map can bring its own ================= */

/* HOW A NEW MAP GETS ITS OWN SOUNDS. The files used to sit in one flat `sfx/`, which is fine for
   one world and impossible for two: there is nowhere to put a second `ship-move` and nothing to
   say which world it belongs to. Now:

       sfx/<pack>/<folder>/<stem>.mp3

   and the FOLDER is the answer to "what does a new map actually have to supply?" — it is the same
   question `assets/` answers by having `boats/`, `islands/` and `ingredients/` rather than 137
   files in a heap.

     voyage/    the world's own voice — sailing, weather, crates, coins, a fight.
     ceremony/  the furniture of the bake-off and the victory card: page swishes, lid notes, the
                drumroll, the award whoosh.

   ⭐ A NEW MAP MAY REPLACE EVERY ONE OF THEM — his ruling, 2026-09-19: "A new map will replace
   everything. It'll replace the background. and the ingredients and the island assets and the sound
   effects and the music and the narration lines." So the two folders are there to make a pack
   READABLE — to say what a sound is FOR, so somebody making one knows what they are making — and
   NOT to mark `ceremony/` as fixed. The fallback below exists so a half-finished pack still plays,
   never to suggest a pack should stop at the world.
     ambience/  the bed — the sea, the gulls, the creaking hull.
     music/     the track.

   THE FALLBACK IS WHAT MAKES IT CHEAP. `packStems(pack)` is the list of stems a pack actually
   ships; `stemUrl` serves anything else out of the base pack. So a second map is a folder with
   three files in it, not a folder with thirty. */
export const SFX_ROOT = "sfx/";

/* The base pack — the sounds in the game today. NAMED after the world rather than called
   "default", so the second pack reads as its sibling instead of as an exception to it. */
export const BASE_PACK = "home-waters";

/* The pack in play. One binding, so the day a map carries its own sounds this is the line that
   moves — and nothing else in the game learns a new word. */
export const SOUND_PACK = BASE_PACK;

/* stem -> the folder inside a pack it lives in. DERIVED FROM NOTHING AND CHECKED BY A GATE:
   scripts/qa/sound_one_door_check.mjs fails the build if a stem here has no file on disk, or a
   file on disk is named by no cue — the same both-ends discipline sfx_files_exist_check already
   applies to the stem list. */
export const STEM_FOLDER = {
  // voyage/ — the world
  "ship-move": "voyage", "store-ingredient": "voyage", "cork-pop": "voyage", "fishing": "voyage",
  "battle-swords": "voyage", "cannon": "voyage", "storm": "voyage", "bells": "voyage",
  "coin-flip": "voyage", "coin-chink": "voyage", "abacus-click": "voyage",
  // ceremony/ — the bake-off and the victory card
  "card-swish": "ceremony", "crate-chime": "ceremony", "crate-squawk": "ceremony",
  "crate-marimba": "ceremony", "award-whoosh": "ceremony", "drumroll": "ceremony",
  "battle-won": "ceremony",
  // ambience/ — the bed. Listed here so the sea is swappable with the rest; its RUNTIME (how often
  // a gull cries, how far it pans) stays in src/ui/audio.js, where the graph that scatters it is.
  "ocean-loop": "ambience",
  "gull-1": "ambience", "gull-2": "ambience", "gull-3": "ambience", "gull-4": "ambience", "gull-5": "ambience",
  "creak-1": "ambience", "creak-2": "ambience", "creak-3": "ambience",
  "creak-4": "ambience", "creak-5": "ambience", "creak-6": "ambience",
  // music/
  "music-ocean": "music",
};

/* WHICH STEMS EACH PACK SHIPS. The base pack ships everything; a later map lists what it replaces,
   which his ruling expects to be ALL of them. An absent stem is not a fault — it is the fallback
   letting a pack be finished in pieces rather than all at once. */
export const PACK_STEMS = {
  [BASE_PACK]: null,        // null means "all of them" — the base pack is the floor
};

/* THE ONLY PLACE A SOUND FILE'S URL IS BUILT, anywhere in the game (threat T-21-02: never a
   runtime string). Page-relative on purpose — the game IS the repo root since the 2026-08-26
   cutover, and a leading slash would break the /classic build's `../sfx` reach. */
export function stemUrl(stem, pack) {
  const p = pack || SOUND_PACK;
  const ships = PACK_STEMS[p];
  const from = (ships && ships.indexOf(stem) < 0) ? BASE_PACK : p;
  const folder = STEM_FOLDER[stem];
  return SFX_ROOT + from + "/" + (folder ? folder + "/" : "") + stem + ".mp3";
}

// The closed literal array — every stem the game loads up front, and the other end of the gate
// that checks each one has a file. Adding a stem means adding it here and to STEM_FOLDER above,
// and giving at least one cue that plays it; nothing else.
export const SFX_FILES = ["abacus-click", "award-whoosh", "coin-chink", "battle-swords", "battle-won", "bells", "cannon", "card-swish", "coin-flip", "cork-pop", "crate-chime", "crate-marimba", "crate-squawk", "drumroll", "fishing", "ship-move", "store-ingredient", "storm"];


/* ================= THE MIX — his q7 levelling pass, 2026-09-18 ================= */
/* Per-stem relative gain: the single tuning point for loudness, so a by-ear pass adjusts one
   number per sound without restructuring anything else.

   ⭐ THIS IS THE ONE LEVELLING PASS HE ORDERED. Wyatt's q7 ruling (2026-09-06) was "level
   everything together, once, after all files are in", and on 2026-09-18 he put the last five in
   scope himself: "It should relevel them too; I haven't heard them properly." So every stem below
   is levelled here, including the cork pop and the four "Sounds of the Voyage" picks that used to
   sit at 1 because they were rendered at the level he auditioned on a tuner page. THAT HISTORY IS
   STILL TRUE and is kept beside each one — hearing a sound alone on a tuner page is not hearing it
   in a game under an ocean bed, a fiddle and eight other effects, and that gap is what he is
   naming. What changed is the conclusion, not the measurement.

   ⛔ WHY LOUDNESS ALONE WAS THE WRONG YARDSTICK, and this is the whole lesson of the pass.
   The six stems below were levelled in 2026-08 by EBU R128 integrated loudness, every one brought
   to the same -23 LUFS. That matches how loud a sound is WHEN IT PLAYS and is blind to HOW OFTEN
   IT PLAYS — so the sounds a player hears fifty times a voyage were boosted to match sounds heard
   once. He found all three of the worst offenders by ear before anyone measured it:
     "the coin flips are too loud, the sailing sound is too loud" (coin-flip 1.45, ship-move 1.72)
     "Muse sound is also too loud by a lot"                        (fishing, ALREADY CUT to 0.81)
   The muse is the proof: R128 had already turned it DOWN and he still called it much too loud.

   ⭐⭐ EVERY NUMBER BELOW IS HIS, SET BY EAR IN THE TUNER ON 2026-09-18. They are a ruling, not a
   default for somebody to improve on. A measured proposal was built first (the frequency-weighted
   line is recorded below, because its METHOD is the thing worth keeping) and he then overrode it
   with his own ear, which is what his ear is for. Where they differ, HIS NUMBER WINS — and the two
   biggest disagreements are written down beside their stems so nobody "corrects" them back.

   THE CONDITIONS HE TUNED UNDER, and they matter: **the ambience bed was OFF, the music was ON,
   master at 0.80.** So the balance between the EFFECTS and the SEA has not yet been heard as a
   whole — and in the same breath he RAISED the bed (AMBIENCE_SEA/GULL/CREAK below). Nothing here is
   adjusted for that; it is written down so he can judge it in the game, which is the only place it
   can be judged.

   THE SHAPE OF WHAT HE DID — he arrived by ear at exactly the axis the first pass lacked. He RAISED
   THE BED AND LOWERED ALMOST EVERYTHING HEARD OFTEN: sailing 1.72 -> 0.57, the muse 0.81 -> 0.38,
   the flip 1.45 -> 0.57, the turn bell 1 -> 0.63, a crate 2.79 -> 1.82, the coin tick 3 -> 1. The
   rare ceremony sounds went UP: crate-squawk 2.10, crate-marimba 1.94, card-swish 1.76, cork-pop
   1.73, award-whoosh 1.48, drumroll 1.41.

   THE METHOD THAT PREDICTED IT, kept because it was right about the shape and is the yardstick for
   the next stem that arrives (docs/AUDIO.md §1c has the full two-axis table):
       target loudness = -16.9 dB - 1.71 dB x log2(plays per voyage)
   -16.9 is where `battle-won` sits: the loudest once-a-voyage moment, never complained about.
   1.71 dB per doubling was the smallest slope that cut all three of his complaints by 5 dB.
   HOW OFTEN EACH IS HEARD IS COUNTED, NEVER GUESSED — 200 seeded voyages, the shipping bot brain,
   the bake-off ruleset, every play derived from the engine's own event stream. The headline: a
   player hears `sail` 58 times a voyage and `pass` (the Muse) 32 — 92% and 50% of all turns.

   THE CEILING IS -1 dBFS TRUE PEAK, and every gain below is checked against the file's own measured
   peak by scripts/audio_map_check.js, which reads SFX_TRUE_PEAK_DBFS. A gain that would breach it
   cannot be committed. MEASURED AGAINST HIS NUMBERS, 2026-09-18: nothing clips. The six gains above
   1 land at crate-squawk -12.6, crate-marimba -9.1, store-ingredient -7.2, card-swish -5.1,
   award-whoosh -9.4, cork-pop -2.6 dBFS, and drumroll at -7.0. The closest to the ceiling is the
   cork pop, with 1.6 dB to spare.

   MEASURED FIGURES — a measurement is not a setting, so the old ones stand and the new sit beside
   them. Max momentary loudness (EBU R128) is the yardstick, because it reads a 120ms click and an
   8s storm on one scale, and because a sliced file (cork-pop, crate-marimba) is played ONE SLOT at
   a time and max-momentary measures the slot rather than the average over all nineteen.
   Kept from the 2026-08 pass (integrated / true peak / the gain it produced):
     battle-swords -16.3 LUFS / +0.2 dBFS -> 0.46   fishing  -21.2 / -4.3  -> 0.81
     storm         -21.7      / -1.5      -> 0.86   coin-flip -26.8 / -4.3 -> 1.45
     ship-move     -27.7      / -11.3     -> 1.72   store-ingredient -31.9 / -12.4 -> 2.79

   ⚠ THE SWORD CLASH IS NOT A DEFECT, AND THIS NOTE USED TO SAY IT WAS. `battle-swords` measures
   +0.2 dBFS true peak — that figure is real and stays. The VERDICT attached to it ("clipped in the
   file, needs a fresh export") is WITHDRAWN: Luis checked the file on 2026-09-18 and found it fine,
   and Wyatt relayed it — "luis checked the sword clash and found it fine; fix your notes it is not
   a problem." So the -1 dBFS ceiling stands for every stem levelled here, and this one file is a
   known, judged exception rather than an outstanding fault. Nothing downstream should carry it as
   open work. */
/* EVERY VALUE IS HIS, tuned by ear 2026-09-18. The comment on each stem says WHERE IT ACTUALLY
   PLAYS — swept from every call site in src/, not from EVENT_SOUND alone, because eight of these
   eighteen are played directly from code and never touch that map. He asked for exactly this
   ("You mislabeled some of the sounds from where they actually appear I think" — he was right). */
export const SFX_VOLUME = {
  /* ---- the ones he named as too loud, and the rest of the often-heard ---- */
  /* MUSE — EVENT_SOUND.pass. Heard on HALF of all turns (31.9 a voyage). "Too loud by a lot", his
     strongest wording, and he is righter than the stem alone explains: THE MUSE IS TWO SOUNDS, this
     one and the muse coin's chink on the same beat. Measured together at the old gains they peaked
     at -1.2 dBFS, a whisker off full scale; at his new pair they peak at -14.3. */
  "fishing": 0.38,
  /* THE COIN FLIP — playFlip()/startFlipSpinSound(), from the tapped coin (board.js setFlipCoin
     "spin") and the small coin over a flipping boat (dockcoin.js). 32 a voyage, and that is a
     FLOOR: the spin sound REPLAYS this stem every 965ms (its own buffer length) for as long as a
     coin is still spinning, so a slow wire means more. */
  "coin-flip": 0.57,
  // SAILING — EVENT_SOUND.sail. The most-heard cue in the game: 58 a voyage, on 92% of all turns.
  "ship-move": 0.57,
  /* YOUR TURN — EVENT_SOUND.turn, and the ONE sound only its own seat hears
     (LOCAL_ONLY_SOUND_EVENTS), so ~16 a voyage rather than 63. It is a SIGNAL TO ACT, not a report
     of something that happened, which is why it can afford to sit above the reports around it. */
  "bells": 0.63,
  // A COIN INTO A PURSE — playCoinChink(), board.js coinArrived, the one door every earning passes
  // through. 84 a voyage: the single most frequent sound in the game.
  "coin-chink": 0.66,
  /* A CRATE — two moments, one stem: bought or traded at a dock (EVENT_SOUND.dock/trade) and the
     "woomp" as a crate's bounce BEGINS in the hold (playCrateLand, board.js, his 2026-09-18 ask).
     ⭐ THIS, not `crate-chime`, is the sound of a crate landing in the hold. */
  "store-ingredient": 1.82,
  /* THE COIN TICK — playCoinTick(): a coin LEAVING a purse (board.js coinLeft), each bake-off
     guess, and the End of Voyage stats rolling up. 79 a voyage.
     ⚠ HE CUT THIS FROM 3 TO 1 — a 9.5 dB drop, the largest single move in his pass, and it REVERSES
     his own 2026-09-14 ask ("The ticking sound isn't happening as it should… i don't hear it")
     which is why the 3 was there. Both are his. Recorded rather than reconciled so nobody restores
     the 3 from the older note believing it is the live decision. Worth knowing when he judges it:
     the file is the quietest in the game by 5 dB (max momentary -40.2), and he tuned with the
     ambience bed OFF, so this is the stem most likely to go missing again once the sea is back. */
  "abacus-click": 1.00,

  /* ---- the ceremony sounds: rare, and he raised almost all of them ---- */
  /* THE CORK POP — playPop(), popin.js: a crate ARRIVING in a hold at the round's pop-in (one file
     of 19 slots, a semitone up per pop), and buying a crate at a dock (soundForEvent dock+bought).
     It sat at 1 because his 55% was baked into the file from the pop-in tuner. Still true; no
     longer the conclusion — he had not heard it in the game, where it was 12 dB under the mix. */
  "cork-pop": 1.73,
  /* THE PAPER SWISH — playCardSwish(): the recipe cards flying in (stage.js entrance), the
     crow's-nest prompt releasing, and the End of Voyage cards dealing and paging. */
  "card-swish": 1.76,
  /* ⭐ NOT A CRATE LANDING IN A HOLD — he flagged the label and he was right. playCrateVerdict(true)
     is a VERDICT CHIME: a crate you got RIGHT on the bake-off reveal (bakeoff.js), the "BAKED!" wax
     seal stamping down, and the "best" pill stamping in at the End of Voyage. The label was wrong;
     the wiring is correct and was not touched. */
  "crate-chime": 1.00,
  /* THE MARIMBA — playLidNote(k), 8 slots of 600ms, a step up the scale per lid: each bake-off lid
     landing (bakeoff.js dropLid), the victory letters, and the End of Voyage dock line. */
  "crate-marimba": 1.94,
  // A WRONG CRATE on the bake-off reveal — playCrateVerdict(false). His squawk, picked 2026-09-14.
  "crate-squawk": 2.10,
  // EACH AWARD CARD dealing in at the End of Voyage — playAwardWhoosh(), victory.js.
  "award-whoosh": 1.48,
  // THE END OF VOYAGE ROLL, before the winner is revealed — playDrumroll(), victory.js.
  "drumroll": 1.41,

  /* ---- unchanged at his hand ---- */
  /* THE CLASH — EVENT_SOUND.engage (a fight being CALLED, on every screen) and battleflee.
     ⚠ NOT A DEFECT, and this note used to say it was: see the withdrawn +0.2 dBFS verdict above. */
  "battle-swords": 0.46,
  // THE CANNON — EVENT_SOUND.shotLands (a shot getting through) and EVENT_SOUND.ovens (firing up
  // the bakery). Its -2.0 dBFS transient is the tightest headroom in the table.
  "cannon": 1.00,
  // THE STORM — scattered thunder, once when a storm arrives then ~20s apart, on its own quiet bus.
  "storm": 0.57,
  // VICTORY — WIN_SOUND, playWinScreen(), victory.js. Heard once.
  "battle-won": 1.00,
};

/* MEASURED TRUE PEAK of each stem's own file, dBFS — the ceiling check's evidence, and the reason
   it is a table rather than a number typed beside each gain. scripts/audio_map_check.js computes
   `peak + 20*log10(gain)` for every stem and fails if any lands above SFX_PEAK_CEILING_DBFS, so a
   future gain cannot quietly push a sound into distortion. Re-measure with
   `ffmpeg -i sfx/<stem>.mp3 -af ebur128=peak=true -f null -` and change the number here; nothing
   else knows these figures, so there is no second place to keep in step.
   `battle-swords` at +0.2 is above the ceiling IN THE FILE and is the one judged exception — Luis
   checked it 2026-09-18 and found it fine (see the note above). The gate names it as such rather
   than pretending the measurement is different. */
export const SFX_PEAK_CEILING_DBFS = -1;
export const SFX_TRUE_PEAK_DBFS = {
  "abacus-click": -12.6, "award-whoosh": -12.8, "battle-swords": 0.2, "battle-won": -8.0,
  "bells": -10.1, "cannon": -2.0, "card-swish": -10.0, "coin-chink": -11.7, "coin-flip": -4.3,
  "cork-pop": -7.4, "crate-chime": -19.0, "crate-marimba": -14.9, "crate-squawk": -19.0,
  "drumroll": -10.0, "fishing": -4.3, "ship-move": -11.3, "store-ingredient": -12.4, "storm": -1.5,
};
/* ================= 2. THE PIECES A CUE IS BUILT FROM ================= */

/* ⭐ THE POP-IN'S SOUND — his cork pop, one per ingredient, climbing a semitone each (src/ui/popin.js).
   sfx/cork-pop.mp3 holds 19 slots of 300ms: slot s is the pop pitched s semitones above his starting pitch, each
   rendered from the tuner's own recipe (.planning/research/audio-sourcing/render_cork_run.mjs) — so a high pop is as
   long as a low one, which a sped-up sample would not be. Each pop starts 40ms into its slot; playback starts 10ms
   before it, so an mp3 decoder's priming delay can shift the pop but never clip its attack. */
export const POP_SLOT_S = 0.3, POP_START_S = 0.04, POP_SLOTS = 19;
export const BUY_POP_SLOT = 7;   // a bought crate's pop: seven semitones up (a fifth) — bright against the pop-in's low start
/* ⭐ THE SOUNDS OF THE VOYAGE HE PICKED — 2026-09-14, on the page of that name, each rendered from the page's own recipe
   (.planning/research/audio-sourcing/render_voyage_sounds.mjs + sounds-of-the-voyage.html beside it). His picks, and his notes:
     card-swish     the recipe cards arrive — "Paper swish", "remove the "boop boop" at the end -- just use the swish at the beginning."
     abacus-click   coins tick as they count, and the End of Voyage stats as they roll up — "Abacus click", and "The coin tick"
     crate-marimba  each bake-off lid lands a note higher — "Marimba", "make them lower pitched so they sound more like big crates."
                    ONE FILE OF SLOTS, like the cork pop: slot k is the k-th lid of a sweep, 600ms each, the note 40ms in.
     crate-chime /  a right crate / a wrong crate on the reveal — "Chime & thud", then 2026-09-14: "I want the "wrong" sound to be a
     crate-squawk   squawk during the bakeoff" — the page's own squawk, his pick over re-downloading the macaw recording
     award-whoosh   each award card dealt in — "Soft whoosh"
   Refused, on purpose: a sting under HEADS/TAILS ("the coin already has a landing sound baked in"), and the first-home fanfare,
   which is Luis's to make (SOUND-BRIEF.csv). */
export const MARIMBA_SLOT_S = 0.6, MARIMBA_LEAD_S = 0.04, MARIMBA_SLOTS = 8;
/* ⭐ HOW CLOSE THE SAME SOUND MAY PLAY TO ITSELF — DECIDED HERE, AND ONLY HERE. Two copies of this rule existed: the coin tick's, here,
   and the crate shuffle's swish, written inside the bake-off (bakeoff.js, 2026-09-15). The bake-off's copy was declared a few lines
   BELOW the shuffle that called it, so the shuffle threw before its first crate moved — Wyatt, 2026-09-16: "during the bakeoff ... the
   crates are never swapped around, they're just static and then they come down multiple times" (each watcher rebuilt its bench, dropped
   the lids again, and threw again). A sound that must not stack names its gap here; nothing outside the sound engine keeps a clock for a sound.
   scripts/qa/sound_spacing_one_place_check.mjs holds it. *//* A swish per crossing of the shuffle, never two inside SWISH_GAP_MS, so a fast shuffle is a sweep and not a hiss (his 2026-09-15 ask:
   "we want a swish sound as the crates are shuffled"). The recipe cards use the same swish. */
export const SWISH_GAP_MS = 110;/* A coin leaving a purse clicks — one click per coin SEEN leaving (board.js coinLeft), SPEND_GAP_MS apart. Two captains can pay at once,
   so a click closer than TICK_GAP_MS to the last is dropped rather than stacked into a buzz. */
export const TICK_GAP_MS = 35;/* ⭐ THE CHINK A COIN MAKES LANDING IN THE PURSE — Wyatt, 2026-09-15: "the 'tick' sound of the coin is the wrong sound -- we want
   a coin 'chink' sound whenever a coin goes into the purse." sfx/coin-chink.mp3 is ONE FILE OF THREE SLOTS — the three on his Game Feel
   Tuner, rendered from that page's own recipe (.planning/research/audio-sourcing/render_coin_chink.mjs). 2026-09-16 he picked: "the
   chink I pick: B".
   LAYERED, NEVER SKIPPED. The same day: "Instead of least time between chinks, can you layer the sounds so they don't clip? i don't see
   this being a problem but pls verify." Verified by mixing the real file at this gain exactly as Web Audio sums it
   (scratch chink_clip.mjs, 2026-09-16): one chink peaks at 0.41 of full scale; three at his 325ms spacing, 0.41; a 20-coin haul at its
   tightest 84ms, 0.41; even 40ms apart, 0.42 — each has decayed to a whisper before the next begins. Two on the same instant, 0.81;
   only THREE on the same instant would clip (1.22), and no path does that: a haul's coins are at least 84ms apart, and at most two
   purses fill at once (two side-bet winners in a four-seat game). So every chink plays.
   RE-MEASURED FOR SILVER, 2026-09-16 (scratch chink_clip_silver.mjs, the rendered file at this gain): one chink 0.38; three at his 470ms,
   five at 400ms, twenty at 84ms and even at 40ms, all 0.38; two on the same instant 0.75; three on the same instant 1.13 — the same
   picture as B: only a path that lands three coins on one instant would clip, and none does. */
/* ROUND 2, 2026-09-16: "I also don't love the coin chink sound." Three coins built like real ones went on the tuner — a struck disc
   ringing at several pitches at once — and he picked: "the chink I pick: A". The file now holds those three, in longer slots (Silver
   rings for 0.45s). */
export const CHINK_SLOT_S = 0.5, CHINK_LEAD_S = 0.03, CHINK_SLOTS = 3;
export const CHINK_PICK = 0;          // 0 = A, Silver — his pick · 1 = B, Into the purse · 2 = C, On the pile
/* ⭐ A RUN OF COINS CLIMBS. Wyatt, 2026-09-18: "can the coin chink sound increase in pitch by half
   a step for each clink in a row?" So a haul arrives as a rising figure rather than the same note
   twenty times.

   WHAT COUNTS AS "IN A ROW" IS DERIVED, NOT TYPED. The run resets once the previous chink has
   finished ringing and then some — CHINK_RUN_RESET is the slot's own length (Silver rings for
   0.45s of its 0.5s slot) with half again on top. Tie it to the coin spacing instead and this file
   has to know board.js's TREASURE_GAP_MS, which is a dial he moves; tie it to the sound's own
   length and it stays true whichever way that dial goes.

   THE CEILING IS A DRAFT AND IT IS HIS. An octave, because the game will hand this twenty coins
   (TREASURE_MAX) and twenty half steps is an octave and a half, which is shrill. Say the word and
   it comes off — the climb itself is what he asked for; where it stops is taste. */
export const CHINK_RUN_RESET = CHINK_SLOT_S * 1000 * 1.5, CHINK_RUN_MAX = 12;
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
export const WIN_SOUND = "battle-won";

/* The End-of-Voyage drumroll. src/orchestrator.js has called `await flash("Drumroll...")` since
   the moment was built and NOTHING HAS EVER PLAYED under it. Wyatt's ruling (s3 #3): "do the
   drumroll audio timing check, and match the narration box timing to the sfx file." */
export const DRUMROLL_SOUND = "drumroll";

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
export const CANNON_SOUND = "cannon";

// 260801-7f4 — a REAL choice, and so is WIN_SOUND above now (it stopped being a placeholder at
// departed SHOTCLOCK one); this stem literally is a sword clash; it is not on any shopping
// list for Luis. Named as a constant (not inlined) so the DOM-free harness can assert it by name.
// This is the moment cue for a battle being JOINED — EVENT_SOUND.engage below, the event the engine records the moment a fight is
// called (Game.beginBattle) — never the `battle` event, because that event does not exist until the whole fight has already resolved.
export const BATTLE_ENGAGE_SOUND = "battle-swords";

/* ================= 3. THE CUES — every moment in the game that makes a sound ================= */

/* ONE ENTRY PER MOMENT, and the fields are the whole vocabulary:

     stem      which sound. The only place a filename appears outside STEM_FOLDER.
     slot      a sliced stem's default slot; a caller may hand a different one (playCue's `slot`).
     gapMs     how close this sound may play to ITSELF — see THE SPACING RULE above. The clock is
               kept per STEM, not per cue, which is deliberate: two cues on the same stem (the
               bake-off's shuffle and the victory card's pages both swish) must not be able to
               stack on each other either.
     bus       "storm" routes through the quieter weather bus; everything else rides the master.
     climb     each play in a run is a half step higher than the last (the coin chink, his ask).
     scatter   not a one-shot — a clap every ~20s for as long as the moment lasts (the storm).
     localOnly heard on the screen the moment belongs to, and no other. THE ONE EXCEPTION IN THE
               GAME, and it is a field rather than an `if` so a second one is a visible act.

   A MOMENT WITH NO SOUND IS STILL A MOMENT: `stem: null` is explicit silence, which is a different
   statement from a cue that does not exist, exactly as `null` in the event map always has been.

   NAMING: `<where>.<what happens>`, in the game's own nouns — the same register
   src/shared/words.js uses for narration, so the two tables read as one design. */
export const CUES = {

  /* ---------- the voyage: the world's own sounds ---------- */
  "sail":               { stem: "ship-move" },
  "crate.changesHands": { stem: "store-ingredient" },
  "crate.bought":       { stem: "cork-pop", slot: BUY_POP_SLOT },
  /* ⛔⛔ SETTLED, AND NOBODY RE-OPENS IT. Wyatt, 2026-09-19: "stop recommending crate chime to be
     the sound of a crate landing in the hold. You need to write down that the crate landing in the
     hold ALREADY has the sound, and it is the thump sound from buying a crate. And that is the way
     it should stay. Unless I say otherwise, stop suggesting."

     THE SOUND IS `store-ingredient` — the crate-acquisition thump — and it is RIGHT. His earlier
     ask, 2026-09-18: "the crates landing in the hold should use the old crate acquisition 'woomp'
     sound when the crate first begins its in-hold bounce." A second cue on the same stem, not a
     replacement: a bought crate pops its cork at the dock about a second and a third earlier, so
     the two never land together.

     ⚠ `crate-chime` IS A DIFFERENT SOUND FOR A DIFFERENT MOMENT — a crate you named RIGHT in the
     bake-off (bakeoff.crateRight). Its NAME is the only thing that invites the confusion, and
     renaming a shipped file is not worth doing quietly. TWO SESSIONS IN TWO DAYS have now offered
     to "fix" this; the wiring was never wrong. Do not offer a third time. */
  "crate.landsInHold":  { stem: "store-ingredient" },
  "battle.called":      { stem: BATTLE_ENGAGE_SOUND },
  "battle.fled":        { stem: BATTLE_ENGAGE_SOUND },
  "shot.lands":         { stem: CANNON_SOUND },
  "ovens.lit":          { stem: CANNON_SOUND },
  /* THE MUSE IS THE ANCHOR GOING DOWN — his 2026-09-07 ask, and the one cue on this stem. An
     "anchor.drops" cue stood beside it for an hour of 2026-09-19 and was deleted unplayed: the
     `fish` and `anchor` events left the map on 2026-09-18, so nothing could ever have reached it.
     scripts/qa/sound_one_door_check.mjs found it, which is what that rule is for. */
  "muse":               { stem: "fishing" },
  /* THE BELL IS A TURN BEGINNING, and `localOnly` is what says whose. Named `turn.begins` rather
     than for the captain it belongs to because the pirate-register gate (ui_contract_check, D-29)
     reads a "yours" in src/ as un-converted player copy — it cannot tell an identifier from a line
     the game says, and teaching it to would weaken a check that guards real words. */
  "turn.begins":        { stem: "bells", localOnly: true },
  "storm.arrives":      { stem: "storm", bus: "storm", scatter: true },
  "coin.spins":         { stem: "coin-flip" },
  "purse.coinIn":       { stem: "coin-chink", slot: CHINK_PICK, climb: true },
  "purse.coinOut":      { stem: "abacus-click", gapMs: TICK_GAP_MS },

  /* ---------- the round's pop-in ---------- */
  "popin.crateArrives": { stem: "cork-pop", slot: 0 },

  /* ---------- the recipe cards and the crow's nest ---------- */
  "recipe.cardsFlyIn":  { stem: "card-swish", gapMs: SWISH_GAP_MS },
  "prompt.cardArrives": { stem: "card-swish", gapMs: SWISH_GAP_MS },

  /* ---------- the bake-off ---------- */
  "bakeoff.lidLands":   { stem: "crate-marimba", slot: 0 },
  "bakeoff.cratesSwap": { stem: "card-swish", gapMs: SWISH_GAP_MS },
  "bakeoff.pickChanges":{ stem: "abacus-click", gapMs: TICK_GAP_MS },
  "bakeoff.crateRight": { stem: "crate-chime" },
  "bakeoff.crateWrong": { stem: "crate-squawk" },

  /* ---------- the victory card ---------- */
  "victory.arrives":      { stem: WIN_SOUND },
  "victory.letterPops":   { stem: "crate-marimba", slot: 0 },
  "victory.pageTurns":    { stem: "card-swish", gapMs: SWISH_GAP_MS },
  "victory.bakeStep":     { stem: "crate-marimba", slot: 0 },
  "victory.podiumRises":  { stem: "cork-pop", slot: 0 },
  "victory.boatLands":    { stem: "cork-pop", slot: 1 },
  "victory.baked":        { stem: "crate-chime" },
  "victory.drumroll":     { stem: DRUMROLL_SOUND },
  "victory.awardDeals":   { stem: "award-whoosh" },
  /* NOT the coin chink: that sound is a coin ARRIVING in a purse, played in exactly one place
     (scripts/qa/coin_arrival_one_event_check.mjs holds it). A score row landing is a lid note. */
  "victory.scoreRowLands":{ stem: "crate-marimba", slot: 7 },
  "victory.scoreTicks":   { stem: "abacus-click", gapMs: TICK_GAP_MS },
  "victory.bestPill":     { stem: "crate-chime" },
  "victory.settingSail":  { stem: "crate-marimba", slot: 7 },
};

/* WHICH STEMS ARE SLICED, and the geometry of each slice. A sliced stem is ONE file holding several
   pre-rendered pitches — a high cork pop is as long as a low one, which a sped-up sample would not
   be. `slotS` is the length of a slot, `leadS` how far into it the sound starts; playback begins
   10 ms before that so an mp3 decoder's priming delay can shift the attack but never clip it. */
export const SLICES = {
  "cork-pop":      { slotS: POP_SLOT_S,     leadS: POP_START_S,     slots: POP_SLOTS },
  "crate-marimba": { slotS: MARIMBA_SLOT_S, leadS: MARIMBA_LEAD_S,  slots: MARIMBA_SLOTS },
  "coin-chink":    { slotS: CHINK_SLOT_S,   leadS: CHINK_LEAD_S,    slots: CHINK_SLOTS },
};

/* WHERE IN A SLICED FILE A CUE'S SLOT BEGINS — PURE, so the whole slicing design is assertable
   under plain Node. Returns {} for an unsliced stem, which play() reads as "the whole file". */
export function sliceFor(cue, slot) {
  const c = CUES[cue];
  if (!c || !c.stem) return {};
  const g = SLICES[c.stem];
  if (!g) return {};
  const want = slot == null ? (c.slot || 0) : slot;
  const s = Math.max(0, Math.min(g.slots - 1, Math.round(want || 0)));
  return { from: s * g.slotS + g.leadS - 0.01, dur: g.slotS - g.leadS };
}

/* ================= 4. THE EVENT MAP — a view on the same table ================= */

// D-01/D-03/D-04/D-06/D-21: the event->sound mapping — a plain object literal, never a Map needing
// .get() with a default, never a switch with no default, never a .find() that can throw on a miss.
// An absent key reads as `undefined` and dispatches to silence with no throw and no console warning.
/* ⛔ NO KEY HERE MAY NAME AN EVENT THE GAME CANNOT EMIT, and a gate holds it now:
   scripts/qa/event_sound_kinds_real_check.mjs derives the producer list from the engine's own
   emissions and fails on any entry that names something nothing in src/ emits.
   ⭐ THE COUNT IS NOT WRITTEN DOWN HERE ANY MORE, because it rotted. This comment used to say "the
   25-key event->sound mapping, mirroring EVENT_NARRATION's exact shape (src/ui/util.js)". On
   2026-09-18 it held 38 keys against EVENT_NARRATION's 13, and SEVEN of them named events the
   cutover deleted — so the table that is supposed to say what every action does had drifted by
   seven entries, in the one file a "which sound plays here?" question is answered from. SIX are
   listed below; the seventh is gone from this file entirely — see the note under the list.
   THE RECORD OF WHAT WENT, so nobody puts them back by accident (each verified absent from all of
   src/ before it was removed; all seven are still real in the FROZEN v1, classic/, which is exactly
   how a table like this rots — every one of them was right when it was written):
     fish: "fishing"        v2 rule 3, src/ui/flow.js:321 — "fishing is gone entirely"
     anchor: "fishing"      the v1 storm ladder; `anchorHold` below is its only survivor
     dodge: "battle-swords" the v1 storm ladder (src/ui/flow.js names the whole ladder as deleted)
     moored: null           explicit silence for an event v2 does not have (`blocked`/`halted` remain)
     bakeoff: null          the engine emits `bake` and `bakeTurn`, never `bakeoff`
     idle: null             emitted nowhere; the only other "idle" in src/ is an animation playState
   THE SEVENTH IS NOT NAMED HERE AND THAT IS DELIBERATE — Wyatt, 2026-09-19: the wreck at the bottom
   of the v1 storm ladder "doesn't exist any more in the game and never will", so its name is out of
   the live tree altogether rather than preserved in a list of things not to do. NOTHING IS LOST BY
   THAT: a comment was never what stopped a dead key coming back — scripts/qa/event_sound_kinds_real_check.mjs
   fails the build on ANY key here naming an event nothing in src/ emits, which is the whole class,
   not one remembered member of it. It is still a live rule in the FROZEN v1 (classic/), which keeps
   its own engine and its own audio table and is not touched by this. */
export const EVENT_CUE = {
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
  sail: "sail", windmove: null, blownOut: null,
  // D-01/D-04: a crate changing hands, whether docking or trading
  dock: "crate.changesHands", trade: "crate.changesHands",
  // D-01; D-04 (fleeing — the clash happened, you just left it). NOT the battle's own
  // start/end — see the `battle: null` entry below.
  battleflee: "battle.fled",
  // D-21: a ship riding the weather out — the only survivor of v1's anchor/dodge/aground ladder
  /* ⚠ IT IS NOT ALLOWED TO BECOME "storm" AGAIN. That exact line was DEFECT-1 and DEFECT-2 in
     docs/AUDIO.md (an 8-second bed at ~3x level, once per anchoring ship, unfadeable). Going
     SILENT is strictly further from that defect than "fishing" was, and the guard in
     scripts/audio_mapping_test.js now pins the invariant that actually matters — never a storm
     stem — rather than the literal it used to pin. */
  anchorHold: null,
  // D-06 — explicit silence, not merely absent from the table
  blocked: null,
  /* T-073 — YOUR TURN. His ruling (s4/q4): "Your Turn should use the Bell SFX sound. New day
     should NOT use this sound." So `newround` stays null below; the bell is on the TURN.
     ⭐ THIS IS THE ONE SOUND NOT HEARD BY THE WHOLE TABLE — see LOCAL_ONLY_SOUND_EVENTS. */
  turn: "turn.begins",
  newround: null, tradewind: null,
  // architecture item 19: a boat that comes into the current AT its head rides no squares — explicit silence, like the ride itself
  rimhead: null,
  // playtest 21 item 3: the storm's one summary line. Deliberately SILENT — every ship in it has
  // already played its own cue (windmove/blownOut -> ship-move, anchorHold -> fishing) as it moved,
  // so a sound here would be a fifth noise describing four that just happened.
  stormSummary: null,
  end: null, finish: null,
  // 260801-7f4 — explicit silence, not an oversight. The `battle` event only fires once the whole
  // fight has resolved (engine winBattle), which is exactly why the clash used to land at the end
  // instead of the start. The clash plays at engage time — the entry below.
  battle: null,
  /* ⭐ THE CLASH IS THE FIGHT BEING CALLED, ON EVERY SCREEN, THROUGH THIS ONE DISPATCHER — architecture item 4, 2026-09-17. His ruling
     (2026-09-06): "I want the clashing sound to happen when battles are first called; the sound is exciting." It was played by two
     named calls instead: the host's fight played it before its opening line, and a crew guest played it on the first battle snapshot it
     heard — measured 4.35 s after the opening line, and 9.6 s after it when the guest was asked for a crow's-nest call. The engine now
     records the call (`engage`, Game.beginBattle) and this map sounds it wherever that event is drawn. The fight's end (`disengage`,
     the camera letting go) is silent. */
  engage: "battle.called", disengage: null,
  /* ⭐ THE CANNON RIDES THE LANDED SHOT, ON EVERY SCREEN — Wyatt, 2026-09-14: "Fix this too" (a crew guest heard no cannon).
     It used to be played by the fight itself (`if(scorer)playCannon()` in src/orchestrator.js), and the fight runs only on
     the device that owns it, so every other screen in a crew watched the hit in silence. The fight now RECORDS the hit as a
     `shotLands` event — emitted only when a shot gets through, and again when a paid re-fire lands — and this line is the
     whole of the wiring: every screen's one consumer plays it. His 2026-09-06 ruling holds unchanged, "cannon sound happens
     only when a shot lands": a miss and a crosswind collision record no shot, so they stay silent. */
  shotLands: "shot.lands",
  // D-21 — explicit silence: an offer is not a deal; sidebet is already narration-suppressed
  parley: null, sidebet: null,
  // v2 events, explicit silence rather than merely absent (D-06). `purse` especially: it exists
  // only to push a fresh state snapshot to the Captains panel mid-turn and is invisible by design,
  // so it must never become audible if the unmapped default ever changes.
  purse: null, openoffer: null, collab: null,
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
  pass: "muse",
  // a battle that ends with nobody hit has no hit to sound; the paid re-fire is covered by the
  // flip that follows it
  battlenull: null, refire: null,
  // the powder a fight burns: its coins are SEEN leaving the purse (board.js coinsLeave), and the fight's own engage cue already sounds
  powder: null,
  // v2.1: the ovens going cold rides the battle sound of the raid that caused it — it is the
  // consequence of that same broadside, one beat later, not a second event to be scored.
  unfinish: null,
  // v2.1 bake-off: a successful bake stays EXPLICIT silence (D-06). Firing up the ovens is the cannon — Wyatt, 2026-09-16: "use the
  // cannon sound when someone fires up the bakery". On every screen, like every sound in this map.
  ovens: "ovens.lit", bake: null,
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
/* DERIVED FROM THE TABLE, so the exception is declared where the cue is declared and this can
   never say something the table does not. It stays exported because two gates and the twin ledger
   read it by name. */
export const LOCAL_ONLY_SOUND_EVENTS = new Set(
  Object.keys(EVENT_CUE).filter(k => EVENT_CUE[k] && CUES[EVENT_CUE[k]] && CUES[EVENT_CUE[k]].localOnly));

/* STILL PURE. It only LABELS the cue; it never asks who is playing. The seat test needs appState,
 * and this file imports nothing by design (leaf tier) — so the answer is handed to playForEvent
 * by its single caller instead. That keeps the whole map assertable under plain Node. */
export function cueForEvent(e) {
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
  if (e.t === "newround" && e.storm) return "storm.arrives";
  /* A JUICIER STORE SOUND — PASSED on his game feel audit (2026-09-13), as proposed: "The same pop you are picking in the
     tuner, so buying and the pop-in speak the same language." A crate BOUGHT at a dock plays his cork pop (BUY_POP_SLOT
     semitones above its starting pitch); scrubbing the docks and every trade keep the store sound. */
  if (e.t === "dock" && e.got === "bought") return "crate.bought";
  return EVENT_CUE[e.t] || null;
}

/* EVENT_SOUND — DERIVED, never kept. The event->STEM answer the game used to hold by hand, worked
   out from the two tables above so it cannot drift from them. Nothing in the game reads it; it is
   here because a stem is what a person asks about ("which file does docking play?") and because
   the gates and the sound-levels tuner ask that question too. */
export const EVENT_SOUND = Object.fromEntries(
  Object.keys(EVENT_CUE).map(k => [k, (EVENT_CUE[k] && CUES[EVENT_CUE[k]] && CUES[EVENT_CUE[k]].stem) || null]));
