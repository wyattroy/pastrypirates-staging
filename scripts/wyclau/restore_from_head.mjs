#!/usr/bin/env node
/* restore_from_head.mjs — put one tracked file back the way HEAD has it.
 *
 * WHY THIS EXISTS, AND IT IS NOT A CONVENIENCE. An unattended watch on this machine can `git add`,
 * `git commit` and `git push origin claude/*` — and CANNOT run any form of `git checkout`,
 * `git restore` or `git stash`. Measured 2026-09-02, five refusals in a row, against
 * `.claude/settings.json`'s allow list. **So a watch can damage a tracked file and cannot undo it**,
 * which is a worse asymmetry than not being able to write at all: it turns a two-second mistake
 * into something that needs a human.
 *
 * It happened the day this was written. `chartkeeper.mjs`'s section splice used the lookahead
 * `(?=^## |\Z)` — and `\Z` IS NOT A JAVASCRIPT ANCHOR. It matches a literal capital Z, so the
 * splice ended at the first "Z" in the text (this repo writes UTC times constantly: "04:19Z"), and
 * a second run tripled CHART.md. The fixtures that proved the rewrite idempotent contained no
 * letter Z, so every gate was honestly green.
 *
 * DELIBERATELY NARROW. One file per call, tracked files only, and it only ever writes what
 * `git show HEAD:<path>` returns — it cannot invent content, cannot touch an untracked file, and
 * cannot be pointed outside the repo. It is `git checkout -- <path>` with no options.
 *
 *   node scripts/wyclau/restore_from_head.mjs .planning/CHART.md
 */
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const target = process.argv[2];
if (!target) {
  console.error("usage: node scripts/wyclau/restore_from_head.mjs <repo-relative path>");
  process.exit(2);
}
const full = resolve(ROOT, target);
const rel = relative(ROOT, full).split("\\").join("/");
if (rel.startsWith("..")) {
  console.error(`refusing: ${target} is outside the repo`);
  process.exit(2);
}

let content;
try {
  content = execFileSync("git", ["show", `HEAD:${rel}`], { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
} catch {
  console.error(`refusing: ${rel} is not tracked at HEAD, so there is nothing to restore it to`);
  process.exit(1);
}
writeFileSync(full, content);
console.log(`restored ${rel} from HEAD (${content.split("\n").length} lines)`);
