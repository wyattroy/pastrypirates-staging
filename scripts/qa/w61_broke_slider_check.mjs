/* W6-1 — WHEN THE PURSE IS EMPTY, THE CONTROL IS STILL THERE, GREYED, AND THE BUTTON DECLINES.
 * Wyatt: "'Would ye offer any coin on top?' appears with NO SLIDER when the player has no money
 * left. Expectation: the slider appears greyed out, and the button reads 'Nah' instead of
 * 'Offer it!'"
 *
 * THE CAUSE, read before changing: coinSlider() in src/ui/flow.js short-circuits on `max<=min` —
 * "nothing to choose — do not present a slider with one stop on it" — and falls back to a plain
 * button list carrying the caller's confirm label. So a broke captain is asked a yes/no question
 * with no visible control and an affirmative button, which is the screen he photographed.
 *
 * WHY THE COPY IS NOT SHARED BETWEEN THE TWO CALLERS, and this is a deliberate exception to rule 8
 * rather than an oversight — it is flagged to Wyatt in CTO-QUESTIONS.md, not decided here:
 *   - the OFFER asks a question — "Would ye offer any coin on top?" — so "Nah" answers it.
 *   - the COUNTER states a fact — "ye're ASKIN' X for yer Y" — where "Nah" would read as cancelling
 *     the whole counter-offer rather than declining the coin.
 * The MECHANISM is identical for both (a greyed slider, and a caller-supplied decline label); only
 * the word differs, because only the sentence differs. Inventing a word for the counter would be
 * putting copy in his mouth.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
/* ONE STRIPPER (2026-08-29). Every gate carried its own copy that deletes BLOCK comments
   first — so a LINE comment containing the characters that open one swallowed 152 lines of
   src/orchestrator.js, the whole import block included. MEASURED: it also blinded 10 lines
   of src/shared/index.js and 10 of src/ui/util.js. scripts/qa/lib/strip_comments.mjs. */
import { stripComments as sharedStrip } from "./lib/strip_comments.mjs";
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const pass = m => console.log("PASS " + m);
const fail = m => { console.log("FAIL " + m); fails++; };

const strip = sharedStrip;   /* JS only — the CSS strip below stays block-only, `//` is not a comment in CSS */
const flow = strip(fs.readFileSync(path.join(REPO, "src/ui/flow.js"), "utf8"));
const util = strip(fs.readFileSync(path.join(REPO, "src/ui/util.js"), "utf8"));
const html = fs.readFileSync(path.join(REPO, "index.html"), "utf8");
const css = (html.match(/<style[^>]*>([\s\S]*?)<\/style>/) || [, ""])[1].replace(/\/\*[\s\S]*?\*\//g, "");

/* (1) THE CONTROL IS STILL DRAWN. The nothing-to-choose branch must still render a slider — the
   complaint is its ABSENCE, so a branch that only swaps a label has not answered him. */
{
  const fn = (flow.match(/async function coinSlider\([\s\S]*?\n\}/) || [""])[0];
  if (!fn) fail("could not find coinSlider — re-anchor this assertion, do not delete it");
  else {
    const branch = (fn.match(/if\s*\(\s*max\s*<=\s*min\s*\)\s*\{[\s\S]*?\n  \}/) || [""])[0];
    if (!branch) fail("coinSlider no longer has a nothing-to-choose branch — re-anchor this assertion");
    else if (/slider\s*:/.test(branch))
      pass("with nothing to choose the slider is still drawn, not omitted — which is the absence Wyatt reported");
    else
      fail("coinSlider still presents NO SLIDER when the purse is empty — his words: \"appears with NO SLIDER when the player has no money left. Expectation: the slider appears greyed out\"");
  }
}

/* (2) AND IT IS VISIBLY DEAD. A slider that is drawn but looks live is worse than none — it invites
   a drag that cannot happen. Both halves: the markup must be able to disable it, and the stylesheet
   must show that state. */
{
  /* BOTH HALVES USED TO MATCH SOMETHING ADJACENT, and red-proofing caught both:
     - "can disable" tested for the word `disabled` anywhere in the function, which stays true via
       `sl.disabled` in the class name even after the attribute itself is gone;
     - "is styled" accepted ANY `:disabled { … opacity }` rule in the sheet, and there are others
       that have nothing to do with this control.
     So: the function must emit the ATTRIBUTE, conditioned on the flag; and the greying rule must
     name this slider in its own selector. */
  const fn = util.match(/export function sliderWrapHTML\([\s\S]*?\n\}/)?.[0] || "";
  const canDisable = /sl\.disabled\s*\?\s*["'`]\s*disabled/.test(fn);
  const styled = /\.apSlider[A-Za-z]*[^{}]*(?::disabled|\[disabled\]|\.apSliderDead)[^{}]*\{[^}]*opacity/.test(css) ||
                 /(?::disabled|\.apSliderDead)[^{}]*\.apSlider[A-Za-z]*[^{}]*\{[^}]*opacity/.test(css);
  if (canDisable && styled) pass("the slider can be drawn disabled and the stylesheet greys that state — it reads as dead rather than draggable");
  else fail(`the empty-purse slider is not visibly dead (markup-can-disable:${canDisable} stylesheet-greys-it:${styled}) — a live-looking control that cannot move is worse than no control`);
}

/* (3) THE BUTTON DECLINES, IN HIS WORD. "Nah", and only on the caller whose sentence is a question. */
{
  /* THE WORD MUST REACH THE CALL, not merely exist in the file. The first version tested for "Nah"
     anywhere in flow.js — and it is already the game's decline word at another prompt, so the
     assertion passed against the unfixed tree. (That "Nah" is also why his choice is the consistent
     one: the game already says it for exactly this.) */
  const flat = flow.replace(/\n/g, " ");
  const offerCall = (flat.match(/coinSlider\([^;]*?"Offer it!"[^;]*?\)/) || [""])[0];
  const offer = !!offerCall;
  const nah = /"Nah"/.test(offerCall);
  if (nah) pass("the offer's empty-purse button reads \"Nah\" — his word, on the caller whose sentence is a question");
  else fail("nothing supplies \"Nah\" — his expectation was \"the button reads 'Nah' instead of 'Offer it!'\"");
  if (!offer) fail("the offer caller no longer passes \"Offer it!\" — re-anchor assertion 3, the label pair is what this item is about");
}

/* (4) THE DECLINE LABEL IS THE CALLER'S, NOT A CONSTANT INSIDE THE CONTROL. If coinSlider hardcoded
   "Nah" it would put that word on the counter-offer too, where it reads as cancelling the whole
   counter rather than declining the coin. The mechanism is shared; the copy belongs to the sentence. */
{
  const fn = (flow.match(/async function coinSlider\([\s\S]*?\n\}/) || [""])[0];
  const hardcoded = /"Nah"/.test(fn);
  if (hardcoded) fail("\"Nah\" is hardcoded inside coinSlider, so it would also land on the counter-offer, whose sentence states a fact rather than asking a question — the word would read as cancelling the counter");
  else pass("the decline label is supplied by the caller, so each sentence keeps its own answer (the rule-8 exception is recorded in CTO-QUESTIONS.md, not decided in code)");
}

/* (5) THE GUEST SEES THE SAME DEAD CONTROL. CEO Review 19: `sliderWirePayload` sent five fields and
   `disabled` was not one of them, so the host got a greyed bar and the GUEST got a live-looking one
   — rule 23, in the one control TRADE-SYSTEM.md says every seat drags. A gate that reads only
   sliderWrapHTML and the stylesheet certifies "the slider is greyed" while looking at one seat of
   two, which is the fault five consecutive reviews have named. */
{
  const wire = util.match(/export function sliderWirePayload\([\s\S]*?\n\}/)?.[0] || "";
  if (!wire) fail("could not find sliderWirePayload — re-anchor this assertion, do not delete it");
  else if (/disabled/.test(wire))
    pass("the disabled flag crosses the wire, so a guest with an empty purse sees the same dead control the host does (rule 23)");
  else
    fail("sliderWirePayload does not carry `disabled` — the host would see a greyed bar and the guest a live-looking one, in the one control TRADE-SYSTEM.md says every seat drags");
}

/* (6) AND THE DECLINE WORD ONLY APPEARS WHEN NOTHING IS OFFERED. The branch fires on `max<=min`,
   which is NOT "broke": a coins-only offer from a captain holding exactly one coin lands here with
   min=max=1, and the first cut showed "Nah" on a button that then offered that coin. The word must
   be chosen by the AMOUNT, not by the branch. */
{
  const fn = (flow.match(/async function coinSlider\([\s\S]*?\n\}/) || [""])[0];
  const branch = (fn.match(/if\s*\(\s*max\s*<=\s*min\s*\)\s*\{[\s\S]*?\n  \}/) || [""])[0];
  const gatedOnZero = /min\s*===\s*0/.test(branch) &&
                      /(nothingOffered|min\s*===\s*0)[^;]*declineLabel|declineLabel[^;]*(nothingOffered|min\s*===\s*0)/.test(branch);
  if (gatedOnZero)
    pass("the decline word is used only when the fixed amount is zero — above zero the button confirms, because above zero it really does commit something");
  else
    fail("the decline label is used for the whole `max<=min` branch, which also fires when the captain has exactly one coin — the button would say \"Nah\" and then offer that coin (CEO Review 19: \"the button says no and offers a coin\")");
}

console.log(fails ? `\nFAILED — ${fails} assertion(s)`
  : "\nPASSED — with nothing to choose the control is still drawn and dead on BOTH seats, and the button declines only when the amount is actually zero");
process.exit(fails ? 1 : 0);
