// src/ui/pilot.js — THE PILOT: the tutorial that is not a tutorial.
//
// Wyatt's own mechanism, 2026-09-02, and it is the spine of this whole feature:
//   "the tutorial being just extra narration lines -- they give most context/explanation the first
//    time (eg: first time: 'Tap any yellow square to sail towards a dock. Sailing against the wind
//    is harder.' 2nd time: 'Tap any yellow square to sail'. 3rd turn: 'Tap to sail')"
//
// Every teachable moment holds a short array of phrasings, longest first, indexed by how many
// times that moment has been SEEN on this device. Show the moment, show the rung at that count,
// then increment. Past the end you stay on the last rung forever.
//
// THE BOTTOM RUNG OF EVERY LADDER IS `null`, AND THAT IS THE WHOLE SAFETY ARGUMENT.
// `null` means "whatever the game builds today", handed in by the call site. So a veteran's game
// is byte-identical BY CONSTRUCTION rather than by an assertion somebody has to keep true — and
// editing shipped copy needs no edit here at all. This is CLAUDE.md's "nothing is a constant":
// the shipped string is derived from the one place that already owns it, never copied to a second.
// scripts/qa/pilot_gates.mjs asserts the `null` tail on every ladder and red-proofs it.
//
// PER DEVICE, NEVER PER TABLE. A first-time guest must be able to get help the veteran host does
// not need, so nothing here ever reaches the wire. That is the one place two screens in this game
// deliberately disagree, which is normally the shape of a bug — it has its own row in
// docs/INTENDED-BEHAVIOUR.md, added in the same commit, because otherwise it gets filed as a
// host/guest fault within the week. It is safe under that file's §3 invariant for exactly one
// reason: THE PILOT EMITS NO EVENT. It only supplies strings to boxes the renderer already draws.
//
// Read .claude/memory/DECISIONS.md "THE TUTORIAL" for the 29 rulings behind the copy.

import { devHost } from "../shared/host.js";

const KEY = "pp4_pilot";
const VERSION = 1;

/* ================= the ladders ================= *
 * An entry is either a string (the prompt line) or {msg, sub} where `sub` is the helper line
 * beneath the buttons. `null` is the bottom rung: use what the game already says.
 *
 * DRAFT COPY THROUGHOUT, in his register, and his to rewrite — the top rungs especially.
 * What is settled here is the SHAPE: which moment, which slot, how many rungs.
 *
 * THE EDITORIAL LAW (Wyatt, 2026-08-25, deleting "Attacking costs ye 2🌕 for powder"):
 * A RUNG MAY NOT RESTATE ITS OWN BUTTON. "Muse — do nothing, take a coin" is legal because the
 * circle reads "Muse +1🌕" and says nothing about doing nothing. "Attack costs two dubloons" is
 * not, because the circle already reads "Attack −2🌕".
 */
/* ⚠ THE WORD IS "INGREDIENT", NOT "CRATE" — swept 2026-09-07 with his playtest item 23 ("Crate
   prices rise" -> "Ingredient prices rise" on the rules page). These seven lines were written while
   the rename was landing elsewhere and were missed by it: the Pilot is the FIRST voice a new
   captain hears, so it was teaching a vocabulary the rest of the game had already dropped. */
export const LADDERS = {
  // ---- the sail moment. The wind rule is the single most important sentence in the game, and
  // it rides HERE rather than getting a ladder of its own, because the sail prompt is the only
  // moment where the wind is the answer to the question on screen.
  //
  // Wyatt SET ASIDE his own 2026-08-25 deletion of wind text for exactly this rung:
  //   "ignore my previous ruling, it was about a different matter and we are solving it with our
  //    rung system". That ruling still governs PERMANENT wind text; it does not govern a clause
  //    that deletes itself after three turns.
  //
  // The wind clause goes in `sub`, which lands in sailPanelHTML's `hint` — a parameter that was
  // deliberately kept on the wire when the red debug shout was deleted on 2026-08-25, so the spec
  // shape and the guest payload are unchanged. No new field, no new parity risk.
  "sail.pick": [
    /* ⭐ HIS WORDS, 2026-09-07 playtest item 3, replacing my draft ("Sailin' into the wind is
       slower — half sail, half the squares"). He kept the rung and rewrote the sentence: the old
       one made a player parse two halves to reach one fact. */
    { msg: "Tap a gold square to sail — head for a dock.", sub: "Sailin' into the wind only gets ye half the distance." },
    { msg: "Tap a gold square to sail toward a dock." },
    { msg: "Tap a gold square to sail." },
    null,
  ],

  // ---- the act menu: docking, and the fact that ye must
  "act.menu": [
    "Ingredients come off the islands — tie up at a dock to take one aboard.",
    "Tie up at a dock to take an ingredient aboard.",
    null,
  ],

  // ---- first sighting of each button. Driven by FIRST SIGHTING of that option, never by turn
  // count, so a captain offered their first battle on day nine still meets rung 0.
  "act.attack": [
    "One broadside each — heads beats tails, and the winner takes an ingredient off the loser.",
    "One broadside each — heads beats tails, winner takes an ingredient.",
    null,
  ],
  "act.trade": [
    "A hail reaches the whole table, not one captain — name what ye want and what ye'll give.",
    "A hail reaches the whole table — name what ye want and what ye'll give.",
    null,
  ],
  "act.muse": [
    "Nothin' worth doin' today? Muse on it and pocket a dubloon.",
    "Nothin' worth doin'? Muse on it and pocket a dubloon.",
    null,
  ],

  // ---- the recipe draft. Two of his nine topics are true at the same instant — which
  // ingredients ye need, and which every captain holds — so they are one sentence, not two beats.
  //
  // He rejected adding text here: "The recipe choice moment has a lot of text in it already, and
  // it's pretty overwhelming -- even as is. Adding more text is not the solution to this." So this
  // ladder is SHORT and the real teaching at this moment is the dotted course (src/ui/course.js),
  // which is a picture rather than a paragraph.
  /* ⚠ SHORTENED AFTER LOOKING AT IT. Rung 0 was two sentences and wrapped to THREE LINES above the
     card — on the one screen he singled out for having too much text already. That is not a length
     I get to defend; it is his ruling being broken by my own copy. The dropped clause (every
     captain's hold sits below) is not lost: recipe.stowed says it a moment later, at the instant
     the hold actually appears, which is where it belongs. */
  /* ⭐ HIS WORDS, 2026-09-09: "change 'Tap a recipe to highlight its docks' to 'tap a recipe to see
     its route'". THE WHOLE LADDER MOVES WITH IT — a rung still saying "docks" would teach a
     different noun for the same picture, which is the drift this ladder exists to prevent. And the
     lowercase is his, typed inside his own quotes; the pill is small italic text where it reads
     as a whisper rather than a heading. */
  "recipe.draft": [
    "tap a recipe to see its route — those five docks are what ye must gather.",
    "tap a recipe to see its route.",
    null,
  ],

  // ---- THE ONE LADDER THAT ADDS A LINE. Nothing is said at this moment today, so its bottom
  // rung is SILENCE rather than today's copy — and a veteran's game is still byte-identical.
  // It earns the exception: the answer to "where did my recipe go?" is "look down there", and
  // nothing currently points down there. The captains box flashes once as the line lands; a
  // sentence saying `below` and a box that blinks are the same instruction twice, and the second
  // one works without being read.
  "recipe.stowed": [
    "Yer recipe's stowed below, {name} — five ingredients to find. They stay greyed 'til ye hold 'em, and every captain's hold sits right beside yers.",
    "Yer recipe's stowed below — five ingredients to find, greyed 'til ye hold 'em.",
    "Yer recipe's stowed below.",
    null,
  ],

  // ---- the trade winds, taught the first time the rim actually carries somebody
  "rim.sweep": [
    // ⭐ HIS WORDS, 2026-09-08, replacing my draft — it names the rim, the direction AND where ye
    // end up, which the old line left ye to work out from a moving picture.
    "Sail into the trade winds along the rim and they'll carry ye clockwise to the next whirlpool",
    null,
  ],

  // ---- the storm. Wyatt ruled it IN, 2026-09-02: it moves every ship three squares with no
  // explanation, and it hits about one first voyage in five.
  "storm.hit": [
    "A storm takes the whole crew — every ship runs three squares afore anyone acts.",
    null,
  ],

  // ---- the price of a crate. Also ruled IN. The Buy button already says −3🌕; what it never
  // says is that the number climbs as the island empties, which is why getting there first
  // matters. Legal under the editorial law: the button states the price, not that it moves.
  "dock.buy": [
    "Ingredients come dearer as an island empties — the early bird pays least.",
    null,
  ],
};

/* THE MOMENTS, in one list, for the gates and for the toggle. Derived from LADDERS so a new
   ladder cannot be forgotten by a second list that has to be kept in step. */
export const MOMENTS = Object.keys(LADDERS);

/* ================= storage ================= *
 * ONE key answers both questions: its ABSENCE means "never played", and its contents mean
 * "what have you seen". A browser that refuses storage (a private tab) runs the pilot in memory
 * for that voyage — a first-timer still gets taught, and there is no session to nag across.
 *
 * That is a DELIBERATE departure from how the hold-the-sea hint (stage.js peekUses) treats
 * refused storage: it assumes LEARNED and goes quiet, because its cost of being wrong is a hint
 * that repeats forever. Here the cost of being wrong is one tap on a card, so the default flips.
 */
let mem = null;          // the in-memory mirror, and the whole store when localStorage refuses
let storageOk = true;

function blank(){ return { v: VERSION, seen: {}, last: null, off: false, met: false }; }

function read(){
  if (mem) return mem;
  try {
    const raw = localStorage.getItem(KEY);
    if (raw == null){ mem = blank(); return mem; }
    const o = JSON.parse(raw);
    // only accept keys we still own — a retired key in storage otherwise outlives the code that
    // wrote it and rides back out. That exact fault bit the Course Tuner ("rip":0.42 survived the
    // ripple ring's deletion by a version); the general shape is worth not repeating.
    mem = blank();
    if (o && typeof o === "object"){
      if (o.seen && typeof o.seen === "object")
        for (const k of MOMENTS) if (Number.isFinite(+o.seen[k])) mem.seen[k] = +o.seen[k];
      if (typeof o.last === "string") mem.last = o.last;
      mem.off = !!o.off;
      mem.met = !!o.met;
    }
  } catch (e) {
    storageOk = false;
    mem = blank();
  }
  return mem;
}

function write(){
  if (!storageOk || !mem) return;
  try { localStorage.setItem(KEY, JSON.stringify({ v: VERSION, seen: mem.seen, last: mem.last, off: mem.off, met: mem.met })); }
  catch (e) { storageOk = false; }
}

/** Has this device ever played? The absence of the key is the answer. */
export function pilotFirstTime(){ return !read().met; }

/** How many rungs does this ladder have? */
export function pilotDepth(id){ const l = LADDERS[id]; return l ? l.length : 0; }

/** Which rung is this moment on right now? Clamped to the bottom. */
export function pilotRung(id){
  const l = LADDERS[id]; if (!l) return 0;
  const s = read();
  if (s.off) return l.length - 1;
  return Math.min(l.length - 1, Math.max(0, s.seen[id] | 0));
}

/* THE ONE READER. `shipped` is what the game builds today — a string, or {msg,sub}.
   At the bottom rung this returns `shipped` UNCHANGED and that is the byte-identical guarantee,
   made by construction rather than by an assertion. */
export function pilotLine(id, shipped){
  const l = LADDERS[id];
  const ship = (shipped != null && typeof shipped === "object")
    ? { msg: shipped.msg == null ? "" : shipped.msg, sub: shipped.sub == null ? null : shipped.sub }
    : { msg: shipped == null ? "" : shipped, sub: null };
  if (!l) return ship;
  const rung = l[pilotRung(id)];
  if (rung == null) return ship;                     // the bottom rung: the shipped line, untouched
  if (typeof rung === "string") return { msg: rung, sub: null };
  return { msg: rung.msg, sub: rung.sub == null ? null : rung.sub };
}

/** Convenience for the many call sites that only ever want the prompt line. */
export function pilotMsg(id, shippedMsg){ return pilotLine(id, shippedMsg).msg; }

/** Is the Pilot actually saying anything at this moment right now?
 *  TRUE only while a live rung is left — false at the bottom rung, for a veteran, and whenever the
 *  parrot is off. Callers use it to decide whether a moment is worth interrupting AT ALL, before
 *  they spend anything on it (flashing the captains box, dimming the board, holding the turn).
 *  Asking pilotLine() for a string and testing it for emptiness answers the same question, but it
 *  makes every call site re-derive "empty means silent", which is the kind of thing that drifts. */
export function pilotSpeaks(id){
  const l = LADDERS[id];
  return !!l && l[pilotRung(id)] != null;
}

/** This moment has now been shown. Advances that ONE count by one. */
export function pilotSee(id){
  if (!LADDERS[id]) return;
  const s = read();
  if (s.off) return;                                  // silenced: nothing to advance
  const l = LADDERS[id];
  s.seen[id] = Math.min(l.length - 1, (s.seen[id] | 0) + 1);
  write();
}

/* ================= the dial ================= */

/** Every ladder to rung 0 — the Ahoy fork's "Nah", and the parrot switched ON. */
export function pilotStartFromTheTop(){
  const s = read(); s.off = false;
  for (const k of MOMENTS) s.seen[k] = 0;
  s.met = true; write();
}

/** Every ladder to its last rung — the fork's "Yaargh!". This is today's game exactly. */
export function pilotSkipToVeteran(){
  const s = read(); s.off = false;
  for (const k of MOMENTS) s.seen[k] = LADDERS[k].length - 1;
  s.met = true; write();
}

/** The parrot is a TWO-STATE TOGGLE (his ruling, over a three-step: an unlabelled three-state
 *  control gets pressed at random). ON also puts every count back to 0 and says so. */
export function pilotIsOn(){ return !read().off; }
export function pilotToggle(){
  const s = read();
  if (s.off){ pilotStartFromTheTop(); return true; }
  s.off = true; s.met = true; write(); return false;
}

/* ================= decay ================= *
 * Wyatt asked for the best practice and there is no canonical one — I looked. What exists either
 * side of the question agrees: memory decays exponentially and is countered by review at
 * EXPANDING intervals, and the games convention is to give a returning player a refresher rather
 * than the tutorial again. So: expanding thresholds, and a step back rather than a reset.
 *
 * EVALUATED ONCE, AT THE START OF A VOYAGE — NEVER DURING ONE. That is what makes it predictable,
 * and it answers the objection this spec raised against decay in its own first draft: words can
 * never grow back mid-game, and two voyages in one evening behave identically.
 */
export const DECAY = [
  { days: 7,  back: 0 },   // under a week — nothing changes
  { days: 30, back: 1 },   // a week to a month — every ladder steps back one rung
  { days: 90, back: 2 },   // a month to a quarter — back two
  { days: Infinity, back: Infinity },  // over 90 days — back to the top
];

/** Call ONCE, as a voyage launches. Returns how many rungs were given back (for the record). */
export function pilotDecayOnLaunch(now){
  const s = read();
  const t = now instanceof Date ? now : new Date();
  let back = 0;
  if (s.last){
    const days = (t - new Date(s.last)) / 86400000;
    if (days >= 0) for (const step of DECAY){ if (days < step.days){ back = step.back; break; } }
  }
  if (back > 0) for (const k of MOMENTS)
    s.seen[k] = back === Infinity ? 0 : Math.max(0, (s.seen[k] | 0) - back);
  s.last = t.toISOString();
  /* ⚠ THIS MUST NOT SET `met`, AND IT USED TO. `met` is what pilotFirstTime() reads, and decay
     runs at the top of showAhoyIntro — one line ABOVE the fork. So setting it here answered the
     fork's own question before the fork could ask it, and "Do ye know how to play?" never appeared
     for anyone. Caught by running the thing rather than by reading it: the posed pair timed out
     waiting for a card that could no longer exist.
     `met` belongs to the two places a captain actually meets the Pilot — answering the fork, or
     tapping the parrot. A voyage merely happening is not either of those. */
  write();
  return back;
}

/* ================= THE ENTRY POINT ================= *
 * ?pilot=new · ?pilot=off · ?pilot=vet
 *
 * WHY THIS EXISTS AT ALL, and it is not developer convenience. Every rung in this file is spent
 * the first time it is seen, so "show me rung 0" means "find a device that has never played" —
 * which on a phone means clearing site data, and Wyatt reads on a phone. Without a flag, checking
 * one line of copy costs him a settings trip and a reload, and the checklist item that asks for it
 * quietly becomes an item he skips.
 *
 *   new  every ladder back to the top AND the fork un-answered, so "Do ye know how to play?"
 *        appears again. This is the first-time captain's whole voyage.
 *   vet  every ladder at the bottom: today's game exactly, with no fork.
 *   off  the parrot silenced, as if he had tapped it off.
 *
 * devHost() GATED, deliberately and with its cost understood: on the live domain this does nothing
 * at all, silently. That is the right trade — flags in a player's URL bar are a way to break a real
 * game — and STAGING COUNTS AS A DEV HOST (src/shared/host.js), which is where he plays work in
 * progress. Any checklist item using it must point at staging, never at the live domain.
 */
export function pilotApplyUrlFlag(){
  let mode = null;
  try {
    if (!devHost()) return null;
    const m = /[?&]pilot=(new|off|vet)\b/.exec(location.search);
    mode = m && m[1];
  } catch (e) { return null; }
  if (!mode) return null;
  if (mode === "new"){ pilotStartFromTheTop(); const s = read(); s.met = false; write(); }
  else if (mode === "vet") pilotSkipToVeteran();
  else if (mode === "off"){ const s = read(); s.off = true; s.met = true; write(); }
  return mode;
}

/** Test seam only — never called by the game. Lets the gates pose a state without a browser. */
export function __pilotPose(state){ mem = Object.assign(blank(), state || {}); storageOk = false; return mem; }
export function __pilotPeek(){ return read(); }
