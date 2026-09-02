/* THE TYPED EMOJI NEVER REACHES THE SCREEN.
 *
 * WHAT THIS GATE IS FOR, and it is a record fault rather than a game fault.
 *
 * The sea trial photographed a blank where the black-market card's coin belongs
 * (`solo-tablet-wk-026-settled.png`, the 19:14Z run). Three documents then explained it the same
 * wrong way -- CHART.md's T-005, JUDGED-2026-09-02T0219Z.md and JUDGED-2026-09-02T0300Z.md all say
 * the thing that came back blank was "the typed U+1F315", a raw glyph WebKit could not draw, and
 * left an open question sitting on Wyatt: does real Safari blank it too?
 *
 * NO SAFARI IS EVER ASKED TO DRAW IT. `src/shared/index.js` maps "\u{1F315}" to COIN_IMG in
 * EMOJI_IMG, and emojify() -- applied at describe() and panel() -- swaps it for
 * `<img src=".../icons/coin-emoji.png">` before anything renders. The typed character does not
 * survive to the DOM, so a font cannot be the explanation and the question put to Wyatt was void.
 * (What was actually blank was that IMAGE, with its layout box intact: measured 2026-09-02, the
 * gap is 42px wide and the coin that renders in the next run's same box is 42px wide, with the
 * full stop starting at the identical column. An element that reserves its width and paints
 * nothing is a paint transient, not a missing file -- the same file painted four times in the
 * CAPTAINS panel of that very frame, `src/ui/util.js:165`.)
 *
 * So this gate asserts the fact that was misread, so nobody has to re-derive it from a screenshot:
 * EVERY emoji the game has custom art for is gone from emojify()'s output, and the substitution is
 * a real one rather than a no-op.
 *
 * Run: node scripts/qa/typed_emoji_never_reaches_screen_check.mjs
 */
import { EMOJI_IMG, emojify, ASSET_BASE } from "../../src/shared/index.js";

const fail = [];
const ok = (name) => console.log(`  ok   ${name}`);
const bad = (name, why) => { fail.push(`${name}: ${why}`); console.log(`  FAIL ${name} -- ${why}`); };

console.log("THE TYPED EMOJI NEVER REACHES THE SCREEN");

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
   instrument before believing it). An emoji with NO custom art must come through untouched. If
   this one ever "passes" by finding nothing, the two above are passing for the same empty reason. */
{
  const noArt = "\u{1F355}"; // pizza -- deliberately not a pastry-pirate icon
  if (noArt in EMOJI_IMG) bad("the instrument can fail", "the control emoji now HAS art -- pick another");
  else {
    const out = emojify(`before ${noArt} after`);
    if (!out.includes(noArt)) bad("the instrument can fail", "an unmapped emoji was replaced -- emojify is matching too much");
    else ok("the instrument can fail -- an unmapped emoji is left alone");
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
