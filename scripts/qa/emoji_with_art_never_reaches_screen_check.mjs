/* EVERY EMOJI THE GAME HAS ART FOR NEVER REACHES THE SCREEN. THE OTHERS DO, AND THAT IS FINE.
 *
 * ⚠ THIS FILE WAS CALLED `typed_emoji_never_reaches_screen_check.mjs` FOR ABOUT AN HOUR, AND THAT
 * NAME WAS FALSE — CEO 101 caught it. Plenty of typed emoji reach the screen and are drawn by the
 * font: the 🏴 that OPENS the very card this gate is about (`src/ui/panel.js:1153`) is a bare
 * U+1F3F4, and `EMOJI_IMG` holds only the ZWJ sequence "🏴‍☠", so the bare flag is never swapped.
 * It renders. **A gate whose NAME states a broader claim than its cases prove is the same fault
 * this item exists to remove**, one level up — so the name changed rather than the claim being
 * quietly narrowed in a comment.
 *
 * WHAT THIS GATE IS FOR, and it is a record fault rather than a game fault.
 *
 * The sea trial photographed a blank where the black-market card's coin belongs
 * (`solo-tablet-wk-026-settled.png`, the 19:14Z run). Three documents then explained it the same
 * wrong way -- CHART.md's T-005, JUDGED-2026-09-02T0219Z.md and JUDGED-2026-09-02T0300Z.md all say
 * the thing that came back blank was "the typed U+1F315", a raw glyph WebKit could not draw, and
 * left an open question sitting on Wyatt: does real Safari blank it too?
 *
 * NO SAFARI IS EVER ASKED TO DRAW THAT ONE. `src/shared/index.js:135` maps "\u{1F315}" to COIN_IMG,
 * and emojify() -- applied at describe() and panel() -- swaps it for
 * `<img src=".../icons/coin-emoji.png">` before anything renders. The typed character does not
 * survive to the DOM, so a font cannot be the explanation and the question put to Wyatt was void.
 *
 * WHAT WAS BLANK WAS THAT IMAGE. What rules out a failed load is NOT the width of the gap --
 * `.narrIcon` is pinned at `width:18px;height:18px;margin:0 1px` (`index.html:307`), so a
 * completely failed image reserves exactly the same box, and CEO 101 was right to say so. What
 * rules it out is that the SAME URL painted four times in the CAPTAINS panel of that very frame
 * (`src/ui/util.js:165`). **The mechanism of the missed paint is NOT proven and this file does not
 * claim it is** -- what is proven is what it is not: not a font, not a missing file, not an engine
 * difference. See `.planning/T005-2026-09-02-THE-COIN-AND-THE-RIG.md`.
 *
 * Run: node scripts/qa/emoji_with_art_never_reaches_screen_check.mjs
 */
import { EMOJI_IMG, emojify, ASSET_BASE } from "../../src/shared/index.js";

const fail = [];
const ok = (name) => console.log(`  ok   ${name}`);
const bad = (name, why) => { fail.push(`${name}: ${why}`); console.log(`  FAIL ${name} -- ${why}`); };

console.log("EVERY EMOJI WITH CUSTOM ART NEVER REACHES THE SCREEN");

/* 1 -- the exact string the black market builds (src/ui/panel.js:1155), through the same
   chokepoint panel() puts it through. This is the one the trial photographed. */
{
  const out = emojify(`ingredient — for <b>10\u{1F315}.</b>`);
  if (out.includes("\u{1F315}")) bad("black-market string", "the typed U+1F315 survives into the HTML");
  else if (!out.includes("icons/coin-emoji.png")) bad("black-market string", "no coin image in the output");
  else ok("black-market string -- typed moon gone, coin image in its place");
}

/* 2 -- and not just that one string: NO key of EMOJI_IMG survives. Derived from the map itself,
   never a hand-kept list, so a new icon is covered the day it is added (rule 9).
   ⚠ WHAT THE RED-PROOF SHOWED THIS CASE CANNOT DO, recorded rather than assumed: deleting
   "\u{1F315}" from EMOJI_IMG leaves this case GREEN, at 73 of 73, because the map is both the
   subject and the list of what to test. A case derived from a list cannot notice the list
   shrinking. That is exactly why case 1 names the real string literally -- and case 1 went red.
   Measured 2026-09-02 by removing the entry and running this file. */
{
  const survivors = [];
  for (const emo of Object.keys(EMOJI_IMG)) {
    const out = emojify(`before ${emo} after`);
    if (out.includes(emo)) survivors.push(emo);
  }
  if (survivors.length) bad("every mapped emoji", `${survivors.length} survive emojify(): ${survivors.join(" ")}`);
  else ok(`every mapped emoji -- all ${Object.keys(EMOJI_IMG).length} replaced`);
}

/* 3 -- THE CHECK MUST BE ABLE TO FAIL, or cases 1 and 2 prove nothing (rule 6: red-proof the
   instrument before believing it). An emoji with NO custom art must come through untouched.
   THE CONTROL IS THE REAL ONE, not an invented character: the bare 🏴 that opens this very card
   (`src/ui/panel.js:1153`). CEO 101's find, and it is worth more than a synthetic control --
   **it is the direct disproof of the missing-font theory.** That flag is drawn by the font, on the
   same card, in the same frame, in the same WebKit capture where the coin came back blank. If a
   font were missing, it would be blank too. It is not. */
{
  const noArt = "\u{1F3F4}"; // bare black flag -- src/ui/panel.js:1153, deliberately NOT the ZWJ "🏴‍☠" that IS mapped
  if (noArt in EMOJI_IMG) bad("the instrument can fail", "the bare flag now HAS art -- this control is spent, pick another and say so here");
  else {
    const out = emojify(`${noArt} <b>The shelves be bare…</b>`);
    if (!out.includes(noArt)) bad("the instrument can fail", "the bare flag was replaced -- emojify is matching too much");
    else ok("the instrument can fail -- the card's own bare flag is left for the font, and it renders");
  }
}

/* 4 -- punctuation stays glued to the icon. This is the OTHER half of what the trial saw: the
   full stop stranded beside the gap. emojify() wraps icon+punctuation in .pp4Cling precisely so a
   line cannot break between them, and that wrapper is what keeps "10 [coin]." on one line. */
{
  const out = emojify(`for 10\u{1F315}.`);
  if (!/pp4Cling[^>]*>\s*<img[^>]*coin-emoji[^>]*>\s*\./.test(out.replace(/\n/g, "")))
    bad("punctuation clings", `the full stop is not wrapped with the icon: ${out}`);
  else ok("punctuation clings -- the icon and its full stop cannot be split across lines");
}

/* 5 -- every image the map points at lives under the asset base. A mapping to an off-tree URL
   would render blank for a reason no screenshot could distinguish from the transient above. */
{
  const stray = Object.entries(EMOJI_IMG).filter(([, url]) => !String(url).startsWith(ASSET_BASE));
  if (stray.length) bad("mapped art is in the asset tree", stray.map(([e, u]) => `${e}->${u}`).join(" "));
  else ok("mapped art is in the asset tree");
}

console.log(fail.length ? `\nFAIL -- ${fail.length} case(s)` : `\nPASS -- 5 cases`);
process.exit(fail.length ? 1 : 0);
