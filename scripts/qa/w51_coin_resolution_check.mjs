/* W5-1 — THE FLIP CEREMONY ASKS FOR A BIGGER PICTURE, IT DOES NOT STRETCH A SMALL ONE.
 * Wyatt: "The coin flip is low-res while the rest of the game is not."
 *
 * MEASURED IN CHROMIUM BEFORE ANY CHANGE, with the ceremony posed on a 390px phone at DPR 3:
 *   #flipCoinWrap layout box  76.05px   painted 167px   = 502 device pixels
 *   #pp4CerSlot #flipPanel    transform: matrix(2.2,0,0,2.2,0,0) + filter: drop-shadow(...)
 * The filter forces a render surface, so the coin and its wooden socket were rasterised for a
 * 76px box and then blown up 2.2x. THE ART WAS NEVER THE PROBLEM — flip-heads.png is 384x384 and
 * flip-socket.png 512x512, both far larger than anything asked of them. What was low-res was the
 * raster, and it showed as stair-stepping on the socket's rope border while the boats and islands
 * beside it stayed crisp.
 *
 * THE FIX, and why it is a rule rather than a number: the ceremony now MULTIPLIES the
 * flippenator's own size tokens by --pp4CerZoom instead of transforming the panel, so the browser
 * rasterises at the size it will paint. Painted size is unchanged to the pixel (167px phone,
 * 141px desktop, re-measured), and the resting flippenator in #controlsRow is byte-identical
 * (76.05px/3px/11.115px/14.04px at 390, 64px/3px/11px/11px at 1200 — measured against HEAD).
 *
 * THE TRAP THIS GATE EXISTS TO STOP: the obvious "fix" is to write the magnified sizes out as a
 * second set of clamp()s. That is two sets of numbers for one control, and the day somebody tunes
 * the flippenator the ceremony silently stops matching it. One clamp per dimension, multiplied.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const pass = m => console.log("PASS " + m);
const fail = m => { console.log("FAIL " + m); fails++; };
const html = fs.readFileSync(path.join(REPO, "index.html"), "utf8");
const rule = sel => {
  const i = html.indexOf(sel + " {");
  return i < 0 ? null : html.slice(i, html.indexOf("}", i) + 1);
};

/* (1) NOTHING STRETCHES THE PANEL. */
const panel = rule("#pp4CerSlot #flipPanel");
if (!panel) fail("could not find the `#pp4CerSlot #flipPanel` rule — re-anchor this gate, do not delete it");
else if (/transform\s*:\s*[^;}]*scale\s*\(/.test(panel))
  fail("the flip ceremony still scales the panel with a transform — that stretches the raster the browser already drew (measured: a 76px box painted at 167px, rope border stair-stepping)");
else pass("the ceremony does not transform-scale the flippenator — the raster is made at the size it is painted");

/* (2) THE MAGNIFIED SIZES ARE THE RESTING ONES, MULTIPLIED — NOT A SECOND SET OF NUMBERS. */
const cerCoin = rule("#pp4CerSlot #flipCoinWrap.coin");
const cerPlank = rule("#pp4CerSlot .flipPlank");
const usesToken = (r, tok) => !!r && new RegExp("var\\(\\s*" + tok + "\\s*\\)").test(r) && /var\(\s*--pp4CerZoom\s*\)/.test(r);
const literalClamp = r => !!r && /clamp\s*\(/.test(r);
const coinOk = usesToken(cerCoin, "--flipCoinD") && usesToken(cerCoin, "--coinRing") && !literalClamp(cerCoin);
const plankOk = usesToken(cerPlank, "--flipPad") && !literalClamp(cerPlank);
if (coinOk && plankOk)
  pass("the ceremony multiplies the flippenator's own tokens (--flipCoinD, --coinRing, --flipPad) by --pp4CerZoom — one clamp per dimension, no second set to keep in step");
else
  fail(`the magnified sizes are not derived from the resting ones (coin:${coinOk}, plank:${plankOk}) — a second set of clamp()s drifts the moment anybody tunes the flippenator`);

/* (3) …AND THE RESTING FLIPPENATOR READS THOSE SAME TOKENS. A gate that only checked the ceremony
   would pass a tree where the ordinary control had been given its own numbers back. */
const restCoin = rule("#flipCoinWrap.coin");
const restPlank = rule(".flipPlank");
const restOk = !!restCoin && /var\(\s*--flipCoinD\s*\)/.test(restCoin) && !!restPlank && /var\(\s*--flipPad\s*\)/.test(restPlank);
const ringOk = /--coinRing\s*:/.test(html) && /border\s*:\s*var\(\s*--coinRing\s*\)/.test(html);
if (restOk && ringOk) pass("the resting flippenator and the coin's ring read the same tokens the ceremony multiplies");
else fail(`the resting control no longer reads the shared tokens (sizes:${restOk}, ring:${ringOk}) — the ceremony would then magnify numbers nothing else uses`);

/* (4) THE TRANSFORM'S OVERFLOW RESERVATION IS GONE WITH THE TRANSFORM. `#pp4CerSlot` carried
   `padding:56px 0` — about half the 125px a 2.2x-scaled panel painted past its own layout box.
   Left in place beside a properly sized panel it is counted twice and the column grows by all of it. */
const slot = rule("#pp4CerSlot");
if (!slot) fail("could not find the `#pp4CerSlot` rule — re-anchor this assertion");
else if (/padding\s*:\s*(?!0)[^;}]*px/.test(slot))
  fail(`#pp4CerSlot still reserves vertical air for a transform that no longer exists (${slot.replace(/\s+/g, " ").slice(0, 80)}) — that air is now counted twice`);
else pass("#pp4CerSlot reserves no overflow — the panel lays out at the size it paints");

console.log(fails ? `\nFAILED — ${fails} failure(s)` : "\nPASSED — the ceremony sizes the coin instead of stretching it, from the flippenator's own tokens");
process.exit(fails ? 1 : 0);
