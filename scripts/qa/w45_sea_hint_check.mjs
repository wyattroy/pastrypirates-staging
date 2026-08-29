/* W4-5 — THE SEA HINT BELONGS BESIDE THE CARD, AND IT IS A BUTTON. Wyatt, from his playtest list:
 * "Move the 'Tap and hold the sea to reveal the board' tooltip closer to the recipe card, and give
 * it the same pulse as the buttons — in a way, it is a button, a button that reveals the sea."
 *
 * MEASURED BEFORE CHANGING, at the moment he means (recipe picker up):
 *   desktop 1200 — hint top 115, card top 428  -> 295px apart, animation-name: none
 *   tablet   768 — hint top 116, card top 429  -> 295px apart, none
 *   phone    390 — hint top 140, card top 380  -> 222px apart, none
 * Both halves of the complaint are real.
 *
 * READ THE GRAVEYARD BEFORE THIS GATE (rule 10). peekHintTick() does NOT place the hint at a fixed
 * spot and must never be made to: it used to, at band.bottom - 44, and the 2026-08-21 gate caught it
 * drawn across "Stay put", across a trade's ✓, and over the second line of "Call Flaky Jack" — five
 * judge findings, one cause. It became a PREFERENCE SEARCH whose every candidate is tested for clear
 * air, hiding rather than covering the answer. So this gate asserts the ORDER OF PREFERENCE and the
 * SURVIVAL OF THE YIELD, never a position — a "fix" that pins the hint under the card would satisfy
 * a naive assertion and re-open all five findings.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const pass = m => console.log("PASS " + m);
const fail = m => { console.log("FAIL " + m); fails++; };

const jsRaw = fs.readFileSync(path.join(REPO, "src/ui/stage.js"), "utf8");
/* COMMENTS ARE STRIPPED BEFORE ANYTHING IS COUNTED, and this is not housekeeping — it is the same
   rule as "a comment is not a measurement", turned on the instrument itself. This gate counts how
   many places write the hint's position. The graveyard note that records the REMOVED pin quotes
   that line verbatim, as graveyard notes in this repo are supposed to, and the first version
   counted it as a third writer and failed a correct tree. An instrument that cannot tell code from
   a comment about code is measuring the wrong thing. */
const js = jsRaw.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
const html = fs.readFileSync(path.join(REPO, "index.html"), "utf8");
const css = (html.match(/<style[^>]*>([\s\S]*?)<\/style>/) || [, ""])[1].replace(/\/\*[\s\S]*?\*\//g, "");

/* (1) THE CARD COMES FIRST IN THE SEARCH. Read the candidate list itself rather than trusting a
   comment about it — the list is the behaviour. */
{
  const m = js.match(/for\s*\(\s*const\s+y\s+of\s*\[([^\]]+)\]\s*\)/);
  if (!m) fail("could not find the hint's candidate list in peekHintTick — re-anchor this assertion, do not delete it");
  else {
    const order = m[1].split(",").map(s => s.trim());
    /* A NAME IS NOT A BEHAVIOUR. The first version tested /card/i against the variable's NAME, so
       renaming `head` to `cardTop` would have passed it with nothing moved (CEO Review 18). What
       must be true is that the first candidate is DERIVED FROM THE CARD'S OWN RECT — so the gate
       finds where that identifier is assigned and reads the expression. */
    const first = order[0];
    const asg = js.match(new RegExp(`const\\s+${first}\\s*=([\\s\\S]{0,240}?);`));
    const fromCard = !!asg && /getBoundingClientRect|\bcardR\b/.test(asg[1]) &&
                     /actionPanel|card/i.test(asg[1] + (js.match(/const\s+cardEl\s*=([^;]+);/) || ["", ""])[1]);
    if (fromCard)
      pass(`the first candidate (${first}) is computed from the card's own measured rect — [${order.join(", ")}] — so the hint lands beside the thing it is about, at any size`);
    else
      fail(`the hint's first candidate (${first}) is not derived from the card's rect — order [${order.join(", ")}]. Measured before this item: with a card up the hint fell to the far end of the board, 295px away at 1200 and 768, 222px at 390`);
  }
}

/* (2) AND THE YIELD SURVIVES. Every candidate must still pass clear(), and the last resort must
   still be to hide. This is the half that stops the five judge findings returning. */
{
  const body = (js.match(/function peekHintTick\([\s\S]*?\n\}/) || [""])[0];
  /* THE SUBSTANCE, NOT THE SPELLING. The first version demanded `if (clear(y))` immediately after
     the loop header, and correctly went red the moment the guard became `y !== null && clear(y)` —
     a stricter guard, not a weaker one. An assertion that fails on a safe refactor teaches sessions
     to loosen it, which is how a gate dies. So: inside the loop, the hint's position may only be
     written AFTER clear(y) has been consulted. That survives any extra guard and still fails the
     moment clear() is dropped. */
  const loop = (body.match(/for\s*\(\s*const\s+y\s+of\s*\[[^\]]+\]\s*\)\s*\{[\s\S]*?\n  \}/) || [""])[0];
  const loopGuarded = /clear\(\s*y\s*\)/.test(loop) &&
    loop.indexOf("clear(") < loop.indexOf("hint.style.top");
  /* AND NOTHING WRITES THE POSITION OUTSIDE THAT LOOP EXCEPT THE ONE HONEST FALLBACK. Red-proofing
     found this hole the moment it was tried: inserting an unconditional `hint.style.top = nearCard`
     BEFORE the loop pins the hint under the card and escapes a gate that only inspects the loop —
     which is exactly the pinning that produced the five judge findings of 2026-08-21.
     The function is allowed EXACTLY TWO writes: the fallback taken when the span has no measurable
     size (there is nothing to test for clearance yet), and the guarded one inside the loop. A third
     is a pin, whatever it is called. */
  /* AND IT COUNTS THE WHOLE FILE, NOT ONE FUNCTION. The first version counted writes inside
     peekHintTick only — and there WAS a third write, in promptTick, pinning the hint over the sea
     every tick and being overwritten a moment later. Two writers for one position is two things
     kept in step by nothing (rule 23), and the gate could not see it (CEO Review 18).
     EXACTLY TWO WRITES IN THE WHOLE OF stage.js: the fallback taken when the span has no measurable
     size, and the guarded one inside the loop. Both are inside peekHintTick. A third anywhere is a
     second writer or a pin. */
  const writesAll = (js.match(/hint\.style\.top\s*=/g) || []).length;
  const writesHere = (body.match(/hint\.style\.top\s*=/g) || []).length;
  const writes = writesAll;
  const guarded = loopGuarded && writesAll === 2 && writesHere === 2;
  const hides = /hint\.style\.display\s*=\s*"none"/.test(body);
  const air = /const AIR\s*=\s*\d+/.test(body);
  if (guarded && hides && air)
    pass("every candidate is still tested by clear(), the 6px air is still declared, and hiding is still the last resort — the yield the 2026-08-21 findings bought is intact");
  else
    fail(`the hint no longer yields (clear-guarded:${loopGuarded} position-writes-in-stage.js:${writesAll} (must be exactly 2, all inside peekHintTick — found ${writesHere} there) hides-as-last-resort:${hides} air-declared:${air}) — pinning it re-opens the five judge findings of 2026-08-21: drawn across "Stay put", across a trade's ✓, and over "Call Flaky Jack"`);
}

/* (3) IT PULSES LIKE A BUTTON, AND FROM THE ONE VOCABULARY. Rule 8: same gesture, same behaviour,
   everywhere. A second @keyframes for the same cue is how two gestures drift apart, so the hint must
   be named in the SAME rule the stage buttons read, not given an animation of its own. */
{
  const vocab = css.match(/([^{}]*#flipCoinWrap\.active[^{]*)\{([^}]*animation\s*:\s*pp4Glow[^}]*)\}/);
  if (!vocab) fail("could not find the one attention-vocabulary rule that grants pp4Glow — re-anchor this assertion, do not delete it");
  else if (/pp4PeekHint/.test(vocab[1]))
    pass("the sea hint is named in the SAME rule the stage buttons read for their pulse — one gesture, not a second copy that can drift");
  else
    fail("the sea hint is not in the attention-vocabulary rule — Wyatt: \"in a way, it is a button, a button that reveals the sea\", and it measured animation-name:none at all three sizes");
  /* and it must not have grown a private animation instead */
  /* BEING NAMED IN THE RULE IS NOT THE SAME AS ANIMATING. A later `animation:none` on the hint
     would leave assertion 3 green and the pulse gone (CEO Review 18), so both a competing animation
     AND a cancelling one fail here. */
  const own = /\.pp4PeekHint[^{}]*\{[^}]*animation\s*:\s*(?!pp4Glow)[a-zA-Z]/.test(css);
  const cancelled = /\.pp4PeekHint[^{}]*\{[^}]*animation[^:;}]*:\s*none/.test(css);
  if (own) fail("the sea hint has been given an animation of its own instead of the shared one — that is a second gesture for one cue, and the two will drift (rule 8)");
  else if (cancelled) fail("the sea hint is named in the vocabulary but a later rule cancels its animation — it is in the list and does not pulse, which is worse than being out of the list");
  else pass("the hint has no private animation competing with the shared vocabulary, and nothing later cancels it");
}

console.log(fails ? `\nFAILED — ${fails} assertion(s)`
  : "\nPASSED — the hint tries the card-adjacent spot first, still yields to every control with air, and pulses from the one shared vocabulary");
process.exit(fails ? 1 : 0);
