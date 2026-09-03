#!/usr/bin/env node
/* SCRATCH — red-proof for glass_ruling_button_words_check.mjs cases 3, 4 and 6.
 * Cases 1, 2 and 5 were already seen RED on the real pre-fix tree. These three PASSED from the
 * first run, and a case that has never failed is a case nobody has shown can fail.
 * Mutates, runs the gate, restores from an in-memory copy in a finally block. */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const GLASS = join(ROOT, "scripts", "wyclau", "glass.mjs");
const CHARTER = join(ROOT, ".planning", "wyclau", "CHARTER.md");
const GATE = join(ROOT, "scripts", "qa", "glass_ruling_button_words_check.mjs");

const orig = { [GLASS]: readFileSync(GLASS, "utf8"), [CHARTER]: readFileSync(CHARTER, "utf8") };

function run(label) {
  try {
    const out = execFileSync(process.execPath, [GATE], { encoding: "utf8" });
    console.log(`\n### ${label}\nEXIT 0 (PASS — the gate did NOT catch this)\n${out}`);
  } catch (e) {
    console.log(`\n### ${label}\nEXIT ${e.status} (FAIL — caught)\n${e.stdout}`);
  }
}

try {
  // 3 — the third button renamed, which he never asked for.
  writeFileSync(GLASS, orig[GLASS].replace('data-choice="talk">Let\'s talk', 'data-choice="talk">Chat about it'));
  run("MUTATION A — the untouched third button is renamed to 'Chat about it'");
  writeFileSync(GLASS, orig[GLASS]);

  // 4 — the storage key renamed along with the label, which un-presses his saved rulings.
  writeFileSync(GLASS, orig[GLASS].replace('data-choice="yes">Approve', 'data-choice="approve">Approve'));
  run("MUTATION B — the stored value renamed from yes to approve");
  writeFileSync(GLASS, orig[GLASS]);

  // 6 — the numbering rule tidied out of the CHARTER.
  writeFileSync(CHARTER, orig[CHARTER].replace(/number or letter/gi, "label"));
  run("MUTATION C — his numbering rule deleted from the CHARTER");
  writeFileSync(CHARTER, orig[CHARTER]);
} finally {
  for (const [p, text] of Object.entries(orig)) writeFileSync(p, text);
  console.log("\nRESTORED both files from the in-memory originals.");
}
