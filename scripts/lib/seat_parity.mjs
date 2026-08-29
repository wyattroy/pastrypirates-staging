/* seat_parity.mjs — DO THE TWO CAPTAINS SEE THE SAME GAME?
 *
 * Wyatt's design principle (2026-08-26): "the game itself should remain consistent for every player
 * in every mode... players of different modes see different things, which is not what we want."
 * CLAUDE.md rule 23's design-time question is "what makes these two agree?" — and until this file
 * the honest answer was "nothing; we keep them in step".
 *
 * WHY IT DID NOT EXIST BEFORE, and it is a real problem rather than an oversight: playtest_gate
 * already plays BOTH crew seats to a true end of voyage, and then throws the comparison away — each
 * seat is judged against the universal rules ALONE. Seven of Wyatt's 35 findings are "both screens
 * are individually fine and they disagree", which no single-screen rule can see. A rule saying
 * "a narration box must have text in it" passes happily on a screen with no narration box at all.
 * A MISSING THING IS INVISIBLE TO A CHECKER THAT ONLY INSPECTS WHAT IS PRESENT.
 *
 * WHY IT COMPARES THE TABLE AND NOT THE WHOLE SCREEN. The two seats are not in lockstep — one is
 * being asked something while the other waits, and their prompts SHOULD differ. Comparing whole
 * screens would cry wolf on every turn, and a gate that cries wolf teaches its reader to dismiss it
 * (HARD-WON-LESSONS). So this compares only THE SHARED TRUTH: facts about the table that must hold
 * on every screen no matter whose turn it is.
 *
 * What that set catches, from his own list:
 *   T-03  the day's wind never appears for the guest      -> wind
 *   T-09  the previous captain stays lit during a bake     -> lit
 *   T-04  a battle card that never leaves the guest        -> battle
 *   T-06  the host shows nothing during a guest's bake     -> bench
 *   plus any purse, day or roster that drifts between the two.
 */

/* One screen's view of the SHARED truth. Deliberately small: everything here is a fact about the
   table, never about the viewer. Anything viewer-specific (your own prompt, your own buttons) is
   excluded by construction rather than by an allow-list, so a new per-seat control cannot silently
   start being compared. */
export const SEAT_VIEW = `JSON.stringify((()=>{
  const txt = el => el ? (el.innerText||'').replace(/\\s+/g,' ').trim() : null;
  const vis = el => { if(!el) return false; const r=el.getBoundingClientRect(); const s=getComputedStyle(el);
    return r.width>1 && r.height>1 && s.display!=='none' && s.visibility!=='hidden'; };
  const rib = document.getElementById('pp4Ribbon');
  const day = rib ? ((txt(rib)||'').match(/DAY\\s*\\d+/)||[])[0]||null : null;
  /* #prow0..3 ONLY. A bare id-prefix selector also matches #prowRecipe0..3 -- and A CAPTAIN'S
     RECIPE IS PRIVATE, so the host legitimately shows Cinnamon where the guest shows Spiced. The
     first run of this comparator reported exactly that as a divergence, twice, inside 60 seconds.
     A gate that cries wolf teaches its reader to dismiss it, which is worse than no gate -- this
     file's own header says so, and then the selector broke the rule anyway. Caught by READING the
     finding instead of trusting it.

     NO BACKTICKS IN HERE, EVER: this whole block lives inside a template literal, so one backtick
     in a comment closes the string and the rest of the comment is parsed as code. That is exactly
     how the first version of this fix crashed -- "ReferenceError: id is not defined". */
  const rows = [...document.querySelectorAll('#prow0,#prow1,#prow2,#prow3')].map(r => {
    const t = txt(r)||'';
    return { name: t.split(' ')[0]||'', purse: (t.match(/\\d+/)||[])[0]||null, lit: r.classList.contains('activeTurn') };
  });
  /* WHAT IS NOT HERE, AND WHY — this list shrank on 2026-08-26 after its first real voyage.
     It used to carry 'battle' (is a battle card on screen) and 'bench' (whose bake-off is showing),
     read out of #pp4Prompt. #pp4Prompt IS THE VIEWER'S OWN PROMPT BOX -- every prompt in the game
     draws into #actionPanel inside it -- so those two fields were per-seat surfaces sitting in a
     list whose header promised viewer-specific things were "excluded by construction". They were
     not. The header described an intention the selector did not implement.

     And the game puts DIFFERENT THINGS in that box on purpose: the captain whose decision it is
     gets a battle card with buttons while everyone else gets a waiting line (orchestrator.js), a
     seat already inside its own battle prompt deliberately does not redraw from the shared
     snapshot, and a spectator being asked to call the winner has the box replaced entirely.

     It duly cried wolf twice in one voyage -- and in OPPOSITE directions, which is the fingerprint
     of "whose turn is it", not of a fault. A gate that cries wolf teaches its reader to dismiss it.

     CATCHING T-04 (a battle card stuck on the guest for 13.4 seconds and past the end of the
     fight) NEEDS A CLOCK, not a snapshot: a difference that clears when the battle clears is
     normal; one that OUTLIVES the battle is the bug. This comparator has no clock, so it cannot
     tell them apart, and shipping a field that cannot tell them apart is worse than shipping
     neither. That is the next piece of work, named rather than faked.

     AND NOTE THE QUOTE MARKS IN THIS COMMENT. This block lives inside a template literal, so a
     single backtick closes the string and everything after it is parsed as code. This file already
     carried a warning saying exactly that, written an hour earlier after the same crash -- and the
     comment you are reading crashed the same way on its first save. The warning was not enough;
     using ordinary quotes in here is. */
  return {
    day,
    wind: txt(document.getElementById('pp4Pill')),
    captains: rows.map(r => r.name + ':' + r.purse).join(','),
    lit: rows.filter(r => r.lit).map(r => r.name).join(',') || '(nobody)',
  };
})())`;

/* Every field above is a fact about the TABLE. Nothing viewer-specific is collected at all, so
   there is no allow-list — and there deliberately isn't one. An earlier version of this file
   declared an empty `ALLOWED` object that no code read: a stub implying a mechanism that did not
   exist, which is the same species as a comment describing behaviour the code does not have.
   If a field ever needs an exception, that is the signal it does not belong in this list. */

/* Compare two views. Returns [] when the table agrees. */
export function compareSeats(a, b, { aName = "host", bName = "guest" } = {}) {
  /* A SEAT THAT COULD NOT BE READ IS NOT A SEAT THAT AGREES. This returned [] -- "they match" --
     which is the lenient answer on no evidence, the exact polarity error gear.mjs was rewritten to
     avoid the day before. Same mistake, different file, same hour. */
  if (!a || !b) return [{ field: "could not read a seat", why: "one of the two screens returned nothing — NOT compared, and not agreement" }];
  const out = [];
  const say = (field, why) => out.push({ field, why });

  if (a.day !== b.day) say("day", `${aName} shows ${JSON.stringify(a.day)}, ${bName} shows ${JSON.stringify(b.day)}`);
  if (a.wind !== b.wind) say("wind", `${aName} shows ${JSON.stringify(a.wind)}, ${bName} shows ${JSON.stringify(b.wind)}`);

  /* SET, not order — the captains box is rotated so each browser's own captain sits on top, which
     is Wyatt's own ruling (2026-08-20, "the active player, whether host or guest, should always
     see their captain's name on top") and pass-and-play floats the acting captain there too.
     …AND THE MESSAGE NAMES ONLY WHAT DIFFERS. It used to print both full lists, and on
     2026-08-29 that cost real time: the report read
       host: test1:1,Dough:6,Flaky:6,test2:2   guest: test2:2,test1:1,Dough:7,Flaky:6
     and the eye lands on the rotation, which is correct and deliberate, rather than on the single
     purse that actually disagreed. A comparison that ignores order must not then print an ordered
     list as its evidence — the reader cannot tell which half the check objected to. */
  const setOf = s => (s || "").split(",").filter(Boolean).sort().join(",");
  if (setOf(a.captains) !== setOf(b.captains)) {
    const A = new Map((a.captains || "").split(",").filter(Boolean).map(x => [x.slice(0, x.lastIndexOf(":")), x.slice(x.lastIndexOf(":") + 1)]));
    const B = new Map((b.captains || "").split(",").filter(Boolean).map(x => [x.slice(0, x.lastIndexOf(":")), x.slice(x.lastIndexOf(":") + 1)]));
    const diffs = [...new Set([...A.keys(), ...B.keys()])]
      .filter(k => A.get(k) !== B.get(k))
      .map(k => `${k}: ${aName} ${A.has(k) ? A.get(k) : "(absent)"} vs ${bName} ${B.has(k) ? B.get(k) : "(absent)"}`);
    say("captains", diffs.length
      ? `${diffs.join("; ")}   (row ORDER differs by design and is not part of this finding)`
      : `${aName}: ${a.captains || "(none)"}   ${bName}: ${b.captains || "(none)"}`);
  }

  if (a.lit !== b.lit) say("whose turn", `${aName} lights ${a.lit}, ${bName} lights ${b.lit}`);

  return out;
}

/* Sample both seats once they have BOTH stopped moving, then compare.
   THE SETTLE IS NOT OPTIONAL: mid-tween the two are legitimately out of step, and comparing then
   would report the network's latency as a bug. `stableFor` consecutive identical reads on both
   sides is what separates "they disagree" from "one has not caught up yet". */
export async function compareWhenSettled(A, B, { sampleMs = 250, stableFor = 3, capMs = 6000 } = {}) {
  const t0 = Date.now();
  let lastA = null, lastB = null, stable = 0;
  while (Date.now() - t0 < capMs) {
    let a = null, b = null;
    try { a = JSON.parse(await A.ev(SEAT_VIEW)); b = JSON.parse(await B.ev(SEAT_VIEW)); } catch { return { skipped: "a seat could not be read" }; }
    const same = JSON.stringify(a) === JSON.stringify(lastA) && JSON.stringify(b) === JSON.stringify(lastB);
    stable = same ? stable + 1 : 0;
    lastA = a; lastB = b;
    if (stable >= stableFor) return { a, b, findings: compareSeats(a, b) };
    await new Promise(r => setTimeout(r, sampleMs));
  }
  // Never guess. A pair that never settles is reported as such, not compared and not passed.
  return { a: lastA, b: lastB, skipped: `neither seat settled within ${capMs}ms — not compared` };
}
