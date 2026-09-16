/* trial_driver_never_waits_forever_check.mjs — THE SEA TRIAL'S PLAYER MUST NEVER WAIT FOREVER ON A RECIPE PICKER.
 *
 * WHAT HAPPENED. Wy-Blade's sea trial of 2026.09.15.2, 2026-09-15: all 10 voyages stood at the first recipe picker until the gate's
 * time limit — 40 minutes, 0 voyages finished, no verdict on the game at all. The cause was the driver, not the game:
 * scripts/lib/player.mjs recipeCardsSettling() (added in 971e4995, "a calmer sea trial") waited while ANY running animation touched
 * #pp4Prompt, with no cap — and every recipe card carries pp4Glow, which loops forever. Measured at 375x812: that test read "moving"
 * on every sample for 11 seconds.
 *
 * AND THE OBVIOUS FIX WAS WRONG TOO, which is why this checks three things, not one. Skipping only the endless glow read "still" at
 * 1 second, while the whole prompt was still at opacity 0 (it shows at 3.5s; the cards fly in until 7.5s) — so the driver would have
 * tapped a card nobody can see, the dead tap Wyatt ruled on ("stop the sea trial from tapping the recipe cards so quickly").
 *
 * WHAT IT IS: a REVERT ALARM on the source. The behaviour was measured in a browser (the picker sampled every 500ms with the old and
 * new tests side by side) and by sailing a solo leg with the trial's own player. One PASS/FAIL line per case; every case runs.
 *
 *   node scripts/qa/trial_driver_never_waits_forever_check.mjs [--root=<checkout>]    red-proof: 607e4fe9 must FAIL
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const HERE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const rootArg = process.argv.find((a) => a.startsWith("--root="));
const ROOT = rootArg ? path.resolve(rootArg.slice("--root=".length)) : HERE;
let src = "";
try { src = fs.readFileSync(path.join(ROOT, "scripts", "lib", "player.mjs"), "utf8"); } catch { console.log(`FAIL — cannot read scripts/lib/player.mjs under ${ROOT}`); process.exit(1); }
let fails = 0;
const ok = (m) => console.log("  PASS  " + m);
const bad = (m) => { fails++; console.log("  FAIL  " + m); };
const h = src.indexOf("async function recipeCardsSettling(");
if (h < 0) { console.log("  (recipeCardsSettling is gone — nothing to wait on, nothing to check)"); process.exit(0); }
let j = src.indexOf("{", h), d = 0;
for (; j < src.length; j++) { if (src[j] === "{") d++; else if (src[j] === "}") { d--; if (!d) break; } }
const fn = src.slice(h, j + 1);
console.log("trial_driver_never_waits_forever — scripts/lib/player.mjs recipeCardsSettling()");
const capM = /CARD_WAIT_CAP_MS\s*=\s*(\d+)/.exec(src);
(capM && +capM[1] >= 7500 && +capM[1] <= 60000 && /CARD_WAIT_CAP_MS/.test(fn))
  ? ok(`the wait is capped (${capM[1]}ms), past the 7.5s fly-in measured and short of a stuck voyage`)
  : bad("the picker wait has no cap between 7.5s and 60s — one animation that never stops stalls every voyage (it did: 10 of 10, 2026-09-15)");
/iterations\s*!==\s*Infinity/.test(fn) || /endTime\s*!==\s*Infinity/.test(fn)
  ? ok("an animation that never ends (the cards' pp4Glow) does not count as the cards still arriving")
  : bad("the wait counts never-ending animations as movement — the recipe cards' glow loops forever");
/\.opacity\s*\)?\s*<\s*0?\.9/.test(fn)
  ? ok("a prompt still fading in counts as arriving, so no card is tapped before it can be seen")
  : bad("the wait can read \"still\" while the prompt is still transparent — the driver taps a card nobody can see");
console.log(fails ? `\nFAIL — ${fails}\n` : "\nPASS — the sea trial's player waits for the cards to land, and never forever\n");
process.exit(fails ? 1 : 0);
