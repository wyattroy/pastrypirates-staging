/* privacy_footer_outside_modal_check.mjs — qid:t206-privacy-line, wired into npm test.
 *
 * THE CLAIM IT TESTS, Wyatt's ruling verbatim (Glass, 2026-09-04T00:35:50.066Z): "move all of it
 * off of the main screen into a privacy policy that is in its own html, simple to read, and in
 * plain english (not pirate) with small links to Privacy Policy and About at the bottom of the
 * index.html screen (not inside of the popup modal box)".
 *
 * Three things, all measured, none assumed:
 *   1. privacy.html exists, is plain English (no pirate address words — "ye"/"yer"), and is not
 *      a stub (a floor on length so an empty placeholder cannot pass).
 *   2. index.html's welcome modal (#lobby) no longer carries the old privacy sentence.
 *   3. index.html links to privacy.html and about.html from OUTSIDE every modalOverlay box —
 *      found by depth-counting <div>/</div> from each modalOverlay's own opening tag, so "inside
 *      the popup modal box" is measured structurally, not by proximity to a keyword.
 *
 * Wired into npm test the same watch it went green, per this project's own rule: a gate added
 * red is a gate somebody disables — this one never was red in the committed tree.
 *
 *   node scripts/qa/privacy_footer_outside_modal_check.mjs     exit 1 = broken, exit 0 = OK
 */
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const argRoot = process.argv.find((a) => a.startsWith("--root="));
const ROOT = argRoot ? argRoot.slice(7) : join(dirname(fileURLToPath(import.meta.url)), "..", "..");

const fails = [];

// ---- 1. privacy.html exists, is plain English, is not a stub ----
const privacyPath = join(ROOT, "privacy.html");
let privacyTxt = "";
if (!existsSync(privacyPath)) {
  fails.push("privacy.html does not exist");
} else {
  privacyTxt = readFileSync(privacyPath, "utf8");
  if (privacyTxt.length < 400) fails.push(`privacy.html is only ${privacyTxt.length} bytes — looks like a stub`);
  const pirateWords = /\bye\b|\byer\b|\bcaptain\b|\bAhoy\b/i;
  const m = privacyTxt.match(pirateWords);
  if (m) fails.push(`privacy.html reads pirate-speak ("${m[0]}") — his ruling says plain English, not pirate`);
}

// ---- helper: find the byte range [start,end) of the element beginning at `openIdx`, by
//      depth-counting <div ...> vs </div> tags from that point. ----
function elementRange(html, openIdx) {
  const tagRe = /<div\b[^>]*>|<\/div>/g;
  tagRe.lastIndex = openIdx;
  let depth = 0;
  let m;
  while ((m = tagRe.exec(html))) {
    if (m[0].startsWith("</div")) {
      depth--;
      if (depth === 0) return [openIdx, m.index + m[0].length];
    } else {
      depth++;
    }
  }
  return [openIdx, html.length]; // unterminated — treat as "rest of file", the strict answer
}

// ---- 2 + 3. index.html ----
const indexPath = join(ROOT, "index.html");
const idx = readFileSync(indexPath, "utf8");

// every modalOverlay's own byte range
const modalRanges = [];
const modalOpenRe = /<div\b[^>]*class="[^"]*\bmodalOverlay\b[^"]*"[^>]*>/g;
let mm;
while ((mm = modalOpenRe.exec(idx))) {
  modalRanges.push(elementRange(idx, mm.index));
}
const insideAnyModal = (i) => modalRanges.some(([s, e]) => i >= s && i < e);

// 2. the old sentence must be gone from every modal (it lived inside #lobby specifically, but
//    check all modals — the ruling is "off the main screen", not "moved to a different modal").
const OLD_SENTENCE = /Anonymised play and visit data/i;
const oldMatch = OLD_SENTENCE.exec(idx);
if (oldMatch && insideAnyModal(oldMatch.index)) {
  fails.push("the old privacy sentence is still inside a modalOverlay box in index.html");
}

// 3. links to privacy.html and about.html exist OUTSIDE every modal box.
function linkOutsideModal(href) {
  const re = new RegExp(`href="${href.replace(/\./g, "\\.")}"`, "g");
  let m2;
  while ((m2 = re.exec(idx))) {
    if (!insideAnyModal(m2.index)) return true;
  }
  return false;
}
if (!linkOutsideModal("privacy.html")) fails.push("no href=\"privacy.html\" found outside a modalOverlay box in index.html");
if (!linkOutsideModal("about.html")) fails.push("no href=\"about.html\" found outside a modalOverlay box in index.html");

console.log(`modalOverlay boxes found in index.html: ${modalRanges.length}`);
if (fails.length) {
  console.log(`\nFAIL  ${fails.length} check(s) failed:`);
  for (const f of fails) console.log(`   - ${f}`);
  process.exit(1);
}
console.log("\nPASS  privacy.html exists in plain English, the old sentence is out of every modal box,\n      and both links live outside every modal box.");
