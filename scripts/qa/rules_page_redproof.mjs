/* RED-PROOF FOR rules_page_check.mjs §6 — can the fence actually FAIL?
 *
 *   node scripts/qa/rules_page_redproof.mjs
 *
 * WHY THIS EXISTS AND WHY IT IS A FILE RATHER THAN SOMETHING A WATCH RAN ONCE. §6's whole claim is
 * that /rules.html and the in-game modal cannot disagree — because the gate regenerates the page
 * and requires the file on disk to match byte for byte. **If that assertion can ever pass on a
 * corrupted page, the claim is decoration and nobody would find out.** CLAUDE.md rule 6: check that
 * a check can fail before believing it passing. The prediction written for T-100 named this as the
 * falsifier that mattered, so it is proven here rather than asserted in a commit message.
 *
 * THREE CORRUPTIONS, one per way the two could really drift:
 *   1. a NUMBER edited on the page          — someone "fixes" a price by hand
 *   2. a WORD edited on the page            — someone improves a sentence on the page only
 *   3. a NUMBER edited in the MODAL         — the rules genuinely change and nobody regenerates
 *                                             (the case that matters most, and the only one where
 *                                             the page is the stale half)
 *
 * Each mutation is applied, the gate is run, and a PASS from it is the failure. Everything is
 * restored in a finally block whether or not the run succeeds — and the restore is verified by
 * re-reading the files, not assumed, because a red-proof that leaves a corrupted page behind is
 * worse than no red-proof at all.
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const RULES = path.join(REPO, "rules.html");
const INDEX = path.join(REPO, "index.html");
const GATE = path.join(REPO, "scripts", "qa", "rules_page_check.mjs");

const rulesOrig = fs.readFileSync(RULES, "utf8");
const indexOrig = fs.readFileSync(INDEX, "utf8");

/* The gate exits non-zero on failure, which is what we WANT here — so a throw from execFileSync is
   the good outcome and a clean return is the bad one. */
function gateFails() {
  try { execFileSync(process.execPath, [GATE], { cwd: REPO, stdio: "pipe" }); return false; }
  catch { return true; }
}

let bad = 0;
const check = (name, ok, detail) => {
  if (ok) console.log(`RED OK   ${name} — ${detail}`);
  else { console.log(`⛔ HOLE   ${name} — the gate PASSED on a corrupted page; §6 is decoration`); bad++; }
};

try {
  /* Sanity first: the gate must be GREEN on the untouched tree, or every result below is noise —
     a gate that fails for an unrelated reason "detects" all three corruptions without reading them. */
  if (gateFails()) {
    console.log("⛔ the gate is already RED on an untouched tree — fix that first; this red-proof can prove nothing until it is green");
    process.exit(1);
  }
  console.log("BASELINE the gate is green on the untouched tree, so a FAIL below is caused by the mutation\n");

  // 1. a number edited on the page
  const one = rulesOrig.replace('data-rule="powder">', 'data-rule="powder">9');
  if (one === rulesOrig) throw new Error('red-proof could not find the powder span in rules.html — the mutation was a no-op, which would have "passed" for the wrong reason');
  fs.writeFileSync(RULES, one);
  check("number edited on the page", gateFails(), "a hand-changed price on rules.html goes RED");
  fs.writeFileSync(RULES, rulesOrig);

  // 2. a word edited on the page
  const two = rulesOrig.replace("dream o' pastry", "dream of pastry");
  if (two === rulesOrig) throw new Error("red-proof could not find its sentence in rules.html — the mutation was a no-op");
  fs.writeFileSync(RULES, two);
  check("word edited on the page", gateFails(), "a sentence improved on rules.html only goes RED");
  fs.writeFileSync(RULES, rulesOrig);

  // 3. the modal moves and the page is not regenerated — the real drift, page as the stale half
  const three = indexOrig.replace('<b data-rule="powder"></b>🌕 for powder', '<b data-rule="powder"></b>🌕 for gunpowder');
  if (three === indexOrig) throw new Error("red-proof could not find the powder sentence in index.html's modal — the mutation was a no-op");
  fs.writeFileSync(INDEX, three);
  check("modal changed, page not regenerated", gateFails(), "the stale page goes RED instead of drifting quietly — the case Wyatt named");
  fs.writeFileSync(INDEX, indexOrig);

  /* 4 and 5 — CEO 171's finding and its fix. The page shipped correct, gated and UNREACHABLE from
     the game, because index.html's How-to-play control is a <button> a crawler cannot follow. Both
     halves of the repair are proven here: the link must be there, and it must NOT be copied onto
     the page it points at. */
  const four = indexOrig.replace('<a href="rules.html">playpastrypirates.com/rules.html</a>', 'playpastrypirates.com/rules.html');
  if (four === indexOrig) throw new Error("red-proof could not find the share link in index.html — the mutation was a no-op");
  fs.writeFileSync(INDEX, four);
  check("the game page's link to the rules removed", gateFails(), "an unreachable rules page goes RED — the half of his ask that shipped missed the first time");
  fs.writeFileSync(INDEX, indexOrig);

  const five = rulesOrig.replace("</div>\n</body>", '<a href="rules.html">self</a>\n</div>\n</body>');
  if (five === rulesOrig) throw new Error("red-proof could not find the page's closing markup — the mutation was a no-op");
  fs.writeFileSync(RULES, five);
  check("the omit marker leaking the share line onto the page", gateFails(), "a page that links to itself goes RED");
} finally {
  fs.writeFileSync(RULES, rulesOrig);
  fs.writeFileSync(INDEX, indexOrig);
  /* Verified by re-reading, never assumed. */
  const restored = fs.readFileSync(RULES, "utf8") === rulesOrig && fs.readFileSync(INDEX, "utf8") === indexOrig;
  console.log(restored ? "\nRESTORED rules.html and index.html are byte-identical to how this run found them (re-read, not assumed)"
                       : "\n⛔ RESTORE FAILED — rules.html or index.html is NOT as this run found it. Run: git checkout -- rules.html index.html");
  if (!restored) bad++;
}

console.log(bad ? `\nFAILED — ${bad} hole(s) in the fence` : "\nPASSED — §6 fails on all five ways the page, the modal and the link between them could break");
process.exit(bad ? 1 : 0);
