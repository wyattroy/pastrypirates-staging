/* W5-2 — THE CALL BUTTONS SIT BESIDE THEIR OWN BOAT, AND STAY THERE.
 * Wyatt: "The buttons to call other battling captains sit on top of their boats, and often on the
 * WRONG boat. They should be directly beside the boats — side, top or bottom — so the player can
 * read the wind and the situation."
 *
 * MEASURED IN CHROMIUM BEFORE ANY CHANGE, with the real prompt posed at three sizes
 * (scripts/qa/w52_call_beside_boat.mjs — that probe is the measurement; this gate holds the rule):
 *   phone 390  (35px boats)  circle covered  0–5% of its own hull
 *   desktop 1200 (67px)                      12%
 *   tablet 768   (83–88px)                   24–27%
 * The bigger the board the more hull the answer hides, because the seed was the literal `ay + 26`
 * — a constant standing in for half a boat, and a boat is drawn `cell` wide (rule 9).
 *
 * AND THE SECOND HALF, reproduced by posing the two options in the order that fires it: D-48's
 * "the last option takes the lowest spot" is a SWAP between two spots. Harmless in a fan around
 * your own ship, where every spot is interchangeable. These spots are anchored to NAMED boats, so
 * the swap put each circle beside the other captain's boat — measured at 768px: "Call Captain 2"
 * 425px from Captain 2, sitting 24% on Captain 1's hull, and vice versa. It fires whenever the
 * attacker's boat is right of the defender's: about half of all fights. "Often."
 *

 * WHAT THIS GATE IS, AND IS NOT. It reads the TEXT of stage.js, so every line it prints is a claim
 * about the text and nothing more. CEO Review 21 walked the first version of it past FOUR working
 * breakages — dropping the swollen-petal term, keeping boatRad alive but multiplied by zero,
 * neutering the hull test with `=> false && …`, and re-introducing the wrong-boat swap by hand
 * without using the name it was watching for — each of which restored the reported fault with the
 * gate still green. Its closing line nonetheless said "the call circles sit beside their own boat",
 * which no source-text check can know. Both are fixed here: the assertions now read the EXPRESSIONS
 * rather than looking for words, and the pass lines say what was read.
 * The picture is measured by scripts/qa/w52_call_beside_boat.mjs, in a browser. That probe is the
 * evidence; this gate is the tripwire.
 *
 * WHAT THIS MUST NOT BREAK: D-48 itself. The ordinary fan around your own ship still has to run
 * lastLowest(), or "Pass is always the lowest circle" is silently repealed — so this gate requires
 * it to survive OUTSIDE the anchored-boats branch, not merely to be absent inside it.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const pass = m => console.log("PASS " + m);
const fail = m => { console.log("FAIL " + m); fails++; };
const src = fs.readFileSync(path.join(REPO, "src/ui/stage.js"), "utf8");
const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");

/* Anchor on the branch itself rather than on line numbers: `if (onBoats){` inside the radial
   placement, up to the `menu.forEach` that writes the spots out. */
/* ⚠ ANCHOR ON THE SEED AND WALK BACK — there is MORE THAN ONE `if (onBoats){` in this function now.
   `T-013` added a second one up in the ask-pill block (the pill has to know where these circles will
   land), and it sits EARLIER in the file — so `indexOf("if (onBoats){")` silently began returning
   the pill's branch, and this "branch" swelled to span both. Caught by red-proofing: a tamper
   planted in the placement seed was answered by a `boatRad(` call in the PILL block, and the gate
   reported PASS. A gate whose anchor can drift onto a different block is a gate that answers about
   code nobody asked it about. So the seed is found first and the opening brace is the nearest one
   ABOVE it. */
const branch = (() => {
  const s = code.indexOf("let spots = anchors.map(");
  if (s < 0) return "";
  const i = code.lastIndexOf("if (onBoats){", s);
  if (i < 0) return "";
  const j = code.indexOf("menu.forEach((b, i) =>", i);
  return j < 0 ? "" : code.slice(i, j);
})();

if (!branch) fail("could not find the anchored-boats placement branch in stage.js — re-anchor this gate, do not delete it");
else {
  /* (1) THE OFFSET COMES FROM THE BOAT, NOT FROM A NUMBER. */
  /* THE SEED IS WHATEVER `let spots = anchors.map(...)` PRODUCES, however it is written — one line
     or twenty. Matching only the multi-line form made the one-line `ay + 26` original read as an
     EMPTY seed, so the red-proof failed for "boatRad absent" and reported "a literal ay±N
     survives:false" about a tree whose whole seed was that literal. A gate that reaches the right
     verdict through a reason that is not true is the fault this project keeps paying for. */
  const seedAt = branch.indexOf("let spots = anchors.map(");
  const seed = seedAt < 0 ? null : branch.slice(seedAt, branch.indexOf("\n      const NEED", seedAt) + 1 || undefined);
  /* READ THE OFFSET EXPRESSION ITSELF, not the presence of a word. CEO Review 21 defeated the
     first version twice here: once by deleting the `rad + AIR` terms while leaving boatRad called
     elsewhere in the branch, and once by putting the flat 26 back with the boat measurement
     multiplied by zero. Both kept every word the gate was looking for. So: find what each spot is
     actually displaced BY, and require all three terms in that one expression — the boat's radius,
     the petal at its pulse peak, and the air — with nothing zeroing them. */
  const offset = (seed || "").match(/\(\s*rad\s*\+[^)]*\)/g) || [];
  const whole = offset.find(o => /\brad\b/.test(o) && /\bHALF\b/.test(o) && /\bAIR\b/.test(o));
  const halfDef = (branch.match(/const HALF\s*=\s*([^;]+);/) || [, ""])[1];
  const airDef  = (branch.match(/const AIR\s*=\s*([^;]+);/) || [, ""])[1];
  /* ⚠ THE DEFINITION IS LOOKED FOR IN THE WHOLE FILE, THE CALL IN THE BRANCH — and that split is the
     point, not a loosening. `T-013` hoisted `boatRad` out of this branch because the ASK PILL is
     placed first and has to know how big the boats are to know where these circles will land; with
     the definition scoped to the branch it could only guess, and it guessed with a constant. Scoping
     the search to the branch would therefore fail a tree in which the derivation is MORE shared, not
     less — a gate punishing the fix for rule 23.
     What it still cannot be walked past: the definition must measure a real rect (`fixedRect`), and
     THE SEED ITSELF must call it.

     ⛔ "THE BRANCH MUST CALL IT" WAS NOT ENOUGH, AND CEO 167 WALKED PAST IT WHILE THE COMMIT CLAIMED
     OTHERWISE. Replacing the seed's `const rad = boatRad(anchorSeats[k])` with a literal `26` — the
     ORIGINAL W5-2 defect, restored exactly — passed all five clauses, because `hulls` a few lines
     down still calls `boatRad(i)` and satisfied a branch-wide search. The `rad` in `(rad + HALF +
     AIR)` would have been a constant while this gate reported the offset "derived". Pre-existing,
     and the previous commit said it was closed when it was not. The call has to be in the SEED,
     which is the expression the offset is actually built from. */
  const radDef  = /const boatRad\s*=[\s\S]{0,180}fixedRect\(/.test(code) && /\bboatRad\s*\(/.test(seed || "");
  const live = t => t && !/^\s*0\s*$/.test(t) && !/\*\s*0\b/.test(t) && !/\b0\s*\*/.test(t);
  const derived = !!whole && live(halfDef) && live(airDef) && radDef && /growPeak/.test(halfDef);
  const constantStern = !!seed && /ay\s*[+-]\s*\d+(?!\s*\*)/.test(seed);
  if (seed === null) fail("could not find `let spots = anchors.map(` in the anchored-boats branch — the seed has moved; re-anchor this assertion rather than trusting its silence");
  else if (derived && !constantStern)
    pass(`the source displaces each circle by \`${whole.replace(/\s+/g, " ")}\` — the boat's own measured half-size (fixedRect), the petal at --pp4GrowPeak (${halfDef.trim()}) and ${airDef.trim()}px of air, none of them zeroed`);
  else
    fail(`the offset expression is not all three live terms (found:${whole ? "`" + whole.replace(/\s+/g, " ") + "`" : "none"}, HALF=\`${halfDef.trim()}\`, AIR=\`${airDef.trim()}\`, boatRad measures a rect:${radDef}, a literal ay±N survives:${constantStern}) — CEO Review 21 got past this by keeping the words and deleting the arithmetic`);

  /* (2) NOTHING MAY COME TO REST ON A HULL — seed, separation, clamp or fallback row. */
  const guards = (branch.match(/onHull\s*\(/g) || []).length;   // call sites; the `const onHull =` definition does not match
  /* AND THE PREDICATE MUST BE ABLE TO SAY YES. CEO Review 21 neutered it with `=> false && …`,
     which keeps every word and answers "no hull, anywhere, ever". Read its body: it has to test
     all four edges against the hull list, with nothing short-circuiting it to a constant. */
  const onHullBody = (branch.match(/const onHull\s*=\s*\([^)]*\)\s*=>\s*([^;]+);/) || [, ""])[1];
  const realTest = /hulls\.some\s*\(/.test(onHullBody) &&
    (onHullBody.match(/[<>]/g) || []).length >= 4 &&
    !/(^|[^!=<>])\b(false|true)\b/.test(onHullBody);
  const hullsBuilt = /const onHull\s*=/.test(branch) && /const hulls\s*=/.test(branch) && /boatUXY\s*\(\s*i\s*\)/.test(branch);
  // the repair loop is the half that catches what the clamp and the even-row fallback do AFTER seeding
  const repairs = /for \(let pass[\s\S]*?hulls\.find\(/.test(branch);
  if (hullsBuilt && realTest && guards >= 2 && repairs)
    pass(`every hull is an obstacle, projected through the same camera as the anchors — ${guards} onHull call site(s) (choosing the side, and the retry) plus a repair pass over what the clamp and the fallback row did`);
  else
    fail(`the hulls are not guarded (defined+built:${hullsBuilt}, the predicate can answer YES:${realTest}, onHull call sites:${guards}, repair pass:${repairs}) — the band clamp and the even-row fallback know nothing about boats and will put a circle back on one`);

  /* (3) D-48 IS NOT APPLIED TO SPOTS THAT ARE NOT INTERCHANGEABLE. */
  /* (3a) AND THE BINDING THAT MAKES A SWAP HARMLESS. Watching for the NAME `lastLowest` is the
     assertion CEO Review 21 walked past: it re-introduced the swap by hand, three lines above the
     write-out, and every check stayed green. The durable answer is not a better pattern — it is
     that each circle now takes the spot NEAREST ITS OWN BOAT rather than the one at its own index,
     so any reordering upstream, named or not, is undone by construction. */
  const bound = /const claim\s*=/.test(branch) &&
    /Math\.hypot\([^)]*anchors\[i\]\[0\][\s\S]{0,90}anchors\[i\]\[1\]/.test(branch) &&
    /spots\[claim\[i\]\s*>=\s*0\s*\?\s*claim\[i\]\s*:\s*i\]/.test(code);
  if (bound)
    pass("each circle is assigned the spot NEAREST THE BOAT IT NAMES, not the spot at its own index — a reordering upstream, by any name, cannot put it beside the wrong captain");
  else
    fail("the circles are still index-matched to the spots — a swap anywhere above the write-out puts each one beside the other captain's boat, which is the fault Wyatt reported and a CEO review restored by hand in three lines");

  if (/lastLowest\s*\(/.test(branch))
    fail("lastLowest() is applied inside the anchored-boats branch — it SWAPS two spots, and these spots name specific boats, so it puts each circle beside the wrong captain (measured: 425px off, at 768px)");
  else
    pass("lastLowest() is not applied where each spot names a boat — a swap there is the wrong-boat bug");
}

/* (4) …AND D-48 STILL GOVERNS THE ORDINARY FAN. */
const after = branch ? code.slice(code.indexOf("menu.forEach((b, i) =>", code.indexOf("if (onBoats){"))) : code;
if (/=\s*lastLowest\s*\(/.test(after))
  pass("D-48 survives for the fan around your own ship, where Pass may take any spot");
else
  fail("lastLowest() is no longer applied to the ordinary fan — 'the Pass button is always the lowest one' has been repealed by a fix aimed at a different prompt");

/* THE PASS LINE SAYS WHAT WAS READ. This gate reads source text; it cannot see a circle. The
   picture is scripts/qa/w52_call_beside_boat.mjs's job, in a browser, and its numbers are in the
   commit. Seven consecutive CEO reviews have found a pass line claiming more than its gate looked
   at; this is the sentence that stops being one. */
console.log(fails ? `\nFAILED — ${fails} failure(s)`
  : "\nPASSED — stage.js's source still displaces each circle by its own boat's measured size, guards every hull, binds each circle to the nearest named boat, and leaves D-48 to the ordinary fan. What a player SEES is measured by scripts/qa/w52_call_beside_boat.mjs, not here.");
process.exit(fails ? 1 : 0);
