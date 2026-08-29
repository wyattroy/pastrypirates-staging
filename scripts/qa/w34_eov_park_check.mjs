/* W3-4 — THE END OF VOYAGE CARD IS DRAGGED, NOT FIRED, AND IT LANDS WITHOUT A BOUNCE.
 * Wyatt: "The End of Voyage card SLAMS down to the captains box. It should scroll smoothly."
 *
 * MEASURED IN CHROMIUM BEFORE ANY CHANGE (scripts/qa/w34_eov_park_glide.mjs — that probe is the
 * evidence; this is the tripwire):
 *   one 4px trackpad notch moved the card 688px on a 1200px desktop and 762px on a tablet — the
 *   ENTIRE journey, in 250ms, off a gesture that had barely started
 *   and it went 28px / 31px PAST the captains box before springing back, because the settle curve
 *   ended at 1.15 instead of 1
 * Both are the signature of a slam. Afterwards: one notch moves it 4px, the release parks it with
 * 0px of overshoot, and a finger still drags it live.
 *
 * THIS GATE READS SOURCE TEXT AND MAY ONLY CLAIM THINGS ABOUT SOURCE TEXT (CEO Review 21's rule).
 * The picture is the probe's job.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const pass = m => console.log("PASS " + m);
const fail = m => { console.log("FAIL " + m); fails++; };
/* COMMENTS STRIPPED FIRST, and this is not tidiness. The first run of this gate read
   `cubic-bezier(...,1.15)` out of the prose comment that EXPLAINS the fix and reported the curve's
   end point as NaN — my own explanation defeating my own check. An instrument that reads a file
   must read the part of it the browser reads. */
const html = fs.readFileSync(path.join(REPO, "index.html"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
const stage = fs.readFileSync(path.join(REPO, "src/ui/stage.js"), "utf8");
const code = stage.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");

/* (1) THE CURVE LANDS ON 1. A cubic-bezier whose last control point is above 1 goes past its
   destination and comes back — measured at 28px past the captains box. */
/* EVERY curve the stylesheet gives this element, not the first one. CEO Review 23 walked the
   previous version past by leaving the declaration alone and adding a LATER rule of the same
   specificity — `body.pp4Stage #statsWrap { transition-timing-function: cubic-bezier(.2,.9,.3,1.6) }`
   — which the browser honours and a first-match read never sees. */
const rules = html.match(/body\.pp4Stage #statsWrap(?![\w.#-])[^{]*\{[^}]*\}/g) || [];
const curves = rules.flatMap(r => [...r.matchAll(/cubic-bezier\(([^)]*)\)/g)].map(m => m[1]));
const ends = curves.map(b => parseFloat((b.split(",")[3] || "").trim()));
if (!rules.length) fail("could not find any `body.pp4Stage #statsWrap` rule — re-anchor this gate, do not delete it");
else if (!curves.length) fail("no settle curve is declared on the End of Voyage card at all — the browser's default ease overshoots nothing, but nothing here says so either; re-anchor this assertion");
else if (ends.every(e => Number.isFinite(e) && e <= 1))
  pass(`every settle curve the stylesheet gives the card lands on its destination — ${curves.length} declared, final control points ${ends.join(", ")}`);
else
  fail(`a settle curve ends above 1 (${curves.map((b, i) => `cubic-bezier(${b.trim()}) -> ${ends[i]}`).join("; ")}) — anything above 1 overshoots and springs back, which is what a slam IS (measured 28px past the captains box on desktop, 31px on tablet)`);

/* (2) THE DURATION SCALES WITH THE JOURNEY, and the stylesheet still owns the full-travel number. */
const varDur = rules.some(r => /transition\s*:\s*transform\s+var\(\s*--pp4EovSettle\s*,\s*[.\d]+s\s*\)/.test(r));
const jsSets = /setProperty\(\s*"--pp4EovSettle"/.test(code);
const jsDerives = /const fullMs\s*=[\s\S]{0,160}getComputedStyle\(wrap\)\.transitionDuration/.test(code)
  && /fullMs\s*\*\s*Math\.max\(/.test(code);
/* AND THE FLOOR MUST LEAVE ROOM TO SCALE. CEO Review 23 got past this by writing
   `Math.max(1, frac)` — frac never exceeds 1, so every journey took the full 250ms again and
   every pattern above still matched. A floor at or above 1 is a flat duration wearing a calc. */
const floor = parseFloat((code.match(/fullMs\s*\*\s*Math\.max\(\s*([\d.]+)/) || [, "1"])[1]);
if (varDur && jsSets && jsDerives && floor < 1)
  pass(`the source sets the settle time as fullMs * Math.max(${floor}, frac), reads fullMs back from the stylesheet, and the stylesheet declares the variable — so a short journey is genuinely shorter`);
else
  fail(`the settle time is not distance-proportional (css declares the variable:${varDur}, stage.js sets it:${jsSets}, derives the full-travel time from the stylesheet:${jsDerives}, floor:${floor}${floor >= 1 ? " — a floor of 1 makes every journey full length" : ""}) — a flat quarter-second is right for the full park and a slam for everything shorter`);

/* (3) THE WHEEL ACCUMULATES INTO THE CARD instead of committing the whole journey on notch one. */
const wheelBlk = (code.match(/wrap\.addEventListener\("wheel"[\s\S]*?\{ passive: false \}\);/) || [""])[0];
if (!wheelBlk) fail("could not find the wheel handler in stage.js — re-anchor this assertion");
else {
  const accumulates = /eovTranslateY\(wrap\)\s*\+\s*e\.deltaY/.test(wheelBlk)
    && /wrap\.style\.transform\s*=/.test(wheelBlk) && /classList\.add\("pp4EovDrag"\)/.test(wheelBlk);
  /* NO settle() AT ALL INSIDE THE WHEEL HANDLER, whatever the argument is spelled. CEO Review 23
     kept the accumulate lines and added `const far = g.dY; settle(far, true); return;` after them:
     one 4px notch threw the card the whole way again and every pattern still matched. The release
     is wheelRelease's job, on the quiet timer; the handler's job is to move the card. */
  const fires = /\bsettle\s*\(/.test(wheelBlk);
  if (accumulates && !fires)
    pass("a wheel notch is added to the card's own position and drawn there — the card follows the scroll instead of being launched at the captains box");
  else
    fail(`the wheel still commits inside its own handler (accumulates into the transform:${accumulates}, calls settle() there:${fires}) — the release belongs on the quiet timer; measured before the fix: one 4px notch threw the card 688px`);
}

/* (4) THE WHEEL RELEASES ON ITS OWN GESTURE, AND A FINGER CANCELS IT.
   This assertion USED to require the wheel to read EOV_PARK_RELEASE_FRACTION, and that was wrong
   twice over. CEO Review 23 walked it past by keeping the name and multiplying the threshold by
   0.05 — and it was pointing at the wrong requirement anyway: a distance threshold is unusable on a
   click-wheel, where one detent is ~100px against 688px of travel, so requiring it is what left a
   plain mouse unable to park the card at all. What the wheel must do is commit on the net
   direction of the gesture it just made, and a finger arriving mid-gesture must cancel the pending
   release before it can fire under the drag. */
const netTracked = /wheelNet\s*\+=\s*e\.deltaY/.test(code)
  && /const net\s*=\s*wheelNet/.test(code) && /net\s*[<>]\s*0/.test(code);
const fingerCancels = /if\s*\(wheelIdle\)\s*\{\s*clearTimeout\(wheelIdle\)[\s\S]{0,60}\}\s*\n\s*eovDrag\s*=/.test(code);
const fingerKeepsDistance = /const threshold = g\.dY \* EOV_PARK_RELEASE_FRACTION;[\s\S]{0,200}eovDrag = null;/.test(code);
if (netTracked && fingerCancels && fingerKeepsDistance)
  pass("the wheel accumulates a net direction and commits on it, a finger landing mid-gesture clears the pending release, and the finger keeps its own distance threshold");
else
  fail(`the two input paths are not wired as the source claims (wheel tracks a net direction:${netTracked}, a finger cancels the pending wheel release:${fingerCancels}, the finger still uses the distance threshold:${fingerKeepsDistance})`);

console.log(fails ? `\nFAILED — ${fails} failure(s)`
  : "\nPASSED — the text found: every declared settle curve ends at or below 1, the duration is written as fullMs * Math.max(floor<1, frac) with fullMs read back from the stylesheet, the wheel handler calls no settle(), and the release is a net-direction test a finger can cancel. What the card DOES is measured by scripts/qa/w34_eov_park_glide.mjs, not here.");
process.exit(fails ? 1 : 0);
