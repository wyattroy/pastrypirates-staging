/* ⚠ STRAY — DELETE ME. Untracked scratch from watch 2026-09-02T06:49Z, kept only because this
   session could not remove it: `rm`, PowerShell `Remove-Item` and `git clean` are all refused by
   this machine's sandbox, including for a path inside the repo. Never committed; nothing imports it.

   Re-used at the end of the watch to RED-PROOF two claims a comment would otherwise just assert.
   Prints its findings; changes nothing. */
import { readFileSync } from "node:fs";

const keeper = readFileSync("scripts/wyclau/chartkeeper.mjs", "utf8");

/* 1. Would 12a-ii's banner assertion have caught the sentence CEO 95 found? The gate greps the
      tool's OUTPUT for /cannot be\s+read as approval/. The old banner printed the phrase split
      across two console.log lines, so the question is whether the regex survives the newline. */
const OLD_BANNER_OUTPUT = "⚠ 1 stamp(s) in your Inbox name MORE THAN ONE note, so a row citing them cannot be\n"
  + "  read as approval — give one of each pair a distinct stamp in .planning/wyclau/INBOX.md:\n";
console.log("12a-ii would have caught the old banner:", /cannot be\s+read as approval/.test(OLD_BANNER_OUTPUT));
console.log("…and does not match the new banner:      ", !/cannot be\s+read as approval/.test(keeper));

/* 2. Is the format string still written by hand anywhere outside chart_model.mjs? CEO 95 found
      three copies; there should now be one definition and no literals. */
const literals = (keeper.match(/`(checklist|inbox|\$\{marker\}|\$\{kind\})#\$\{/g) || []);
console.log("hand-written key literals left in chartkeeper.mjs:", literals.length, literals);

/* 3. Every title-keyed lookup should be gone from the tool. */
for (const bad of ["reapByKey.get(titleOf", "settleByKey.get(titleOf", "reapByKey.has(row.title)",
  "settleByKey.get(row.title)", "x.title === titleOf(c.lines)",
  "titleOf(x.row.lines) === titleOf(c.lines)"]) {
  console.log((keeper.includes(bad) ? "STILL PRESENT: " : "gone:          ") + bad);
}
