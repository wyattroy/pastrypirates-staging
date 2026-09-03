#!/usr/bin/env node
/* ⚠ NOT A GATE. It is never in `npm test`, it asserts nothing, and nothing depends on it.
 * Same standing as `glass_peek.mjs` next to it, and for the same reason: it is an instrument for
 * LOOKING, not a check that can fail.
 *
 * ⚠ AND IT IS IN THE WRONG DIRECTORY — CEO 118's finding 4, accepted rather than argued with:
 * "`scripts/qa/` is where this project's gates live, and a `tmp_`-named file there will confuse the
 * next reader about whether it runs." The rename out of this folder was attempted twice from the
 * watch that wrote it (`git mv`, `git rm`) and REFUSED by this machine's sandbox, so the header is
 * carrying what the filename could not. **A later watch with permission moves it.**
 *
 *   node scripts/qa/tmp_rowcount_measure.mjs [<base commit>]
 *
 * WHAT IT IS FOR, and it earned its keep on its first run. A screenshot pair of the Glass taken
 * minutes apart is a CONFOUNDED A/B: `.planning/CHART.md` is a hot file three sessions write, and on
 * 2026-09-02 a peer committed a new row between the "before" and "after" shots — so the two pictures
 * disagreed on the open count (76 vs 77) for a reason that had nothing to do with the change being
 * photographed. This renders the SAME live `CHART.md` through BOTH generators in one pass instead,
 * which is the posed comparison rule 26 actually asks for: same board, before and after.
 *
 * Its first run: 51 of 77 rows read differently, 77 rows both times — every difference a phrase
 * completed or a raw markdown marker removed, and nothing gained or lost.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const base = process.argv[2] || "8838d73d"; // the commit before the title reader converged
const chart = readFileSync(".planning/CHART.md", "utf8");

function render(ref) {
  const dir = mkdtempSync(join(tmpdir(), "glass-ab-"));
  mkdirSync(join(dir, "scripts", "wyclau", "lib"), { recursive: true });
  mkdirSync(join(dir, ".planning", "wyclau"), { recursive: true });
  const at = (p) => ref === null
    ? readFileSync(p)
    : execFileSync("git", ["show", `${ref}:${p}`], { maxBuffer: 1 << 24 });
  writeFileSync(join(dir, "scripts", "wyclau", "glass.mjs"), at("scripts/wyclau/glass.mjs"));
  writeFileSync(join(dir, "scripts", "wyclau", "lib", "chart_model.mjs"), at("scripts/wyclau/lib/chart_model.mjs"));
  writeFileSync(join(dir, ".planning", "CHART.md"), chart);
  execFileSync(process.execPath, [join(dir, "scripts", "wyclau", "glass.mjs"), "--note", "A/B"], { stdio: "pipe" });
  const html = readFileSync(join(dir, ".planning", "wyclau", "glass.html"), "utf8");
  const ol = (/<ol>[\s\S]*?<\/ol>/.exec(html) || [""])[0];
  return [...ol.matchAll(/<li>([\s\S]*?)<\/li>/g)].map((m) => m[1]);
}

const before = render(base), after = render(null);
console.log(`rows: before ${before.length}, after ${after.length}\n`);
let changed = 0;
for (let i = 0; i < Math.min(before.length, after.length); i++) {
  if (before[i] === after[i]) continue;
  changed++;
  if (changed <= 8) console.log(`${i + 1}.\n  BEFORE  ${before[i]}\n  AFTER   ${after[i]}\n`);
}
console.log(`${changed} of ${before.length} rows read differently.`);
