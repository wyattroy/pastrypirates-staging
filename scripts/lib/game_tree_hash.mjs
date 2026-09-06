// scripts/lib/game_tree_hash.mjs
//
// THE GAME TREE'S IDENTITY, DERIVED — never hand-typed (CLAUDE.md rule 9).
//
// T-009 / T-219 (.planning/CHART.md): the sea trial's leg-resume cache trusted a hand-bumped
// build stamp (PP4_STAMP) alone. Twice on 2026-09-04, a real game-code commit landed and the
// stamp did not move with it — nothing in the trial itself could tell, because nothing it
// checked came from the code. This file gives it something that does.
//
// ONE DEFINITION OF "IS THIS THE GAME" — reused, not re-decided. `.claude/hooks/lib/game-code.cjs`
// already answers this for the pre-edit hook and the gear picker (CLAUDE.md rule 23: two things
// that must agree are one thing, or they drift). This file adds a THIRD reader of that same
// definition, not a fourth copy of the rule.

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { isGameCode } = require("../../.claude/hooks/lib/game-code.cjs");

/** Every file git tracks in `repoRoot`, as forward-slash relative paths — git's own convention
 *  on every OS (verified for this exact purpose by the T-220 finding: `gear.mjs` relies on the
 *  same fact because it reads `git diff --name-only`). Untracked-and-unstaged new files are not
 *  covered — this project's own workflow commits as it goes (a ledger claim sits beside a
 *  commit, CLAUDE.md rule 16), so an uncommitted new game file mid-trial is not a shape this
 *  repo's process produces. */
function gitTrackedFiles(repoRoot) {
  const out = execFileSync("git", ["ls-files"], { cwd: repoRoot, encoding: "utf8" });
  return out.split("\n").filter(Boolean);
}

/** THE CORE PRIMITIVE — hash a named set of files' CURRENT on-disk content, sorted so file order
 *  never matters. Does not care where `relPaths` came from, so it is testable with a handful of
 *  files in a scratch directory and no git at all. A path with no file on disk still changes the
 *  hash (a deleted-but-tracked file is a real change, never silently ignored). */
export function hashFiles(repoRoot, relPaths) {
  const h = crypto.createHash("sha256");
  for (const rel of [...relPaths].sort()) {
    h.update(rel);
    h.update("\0");
    try {
      h.update(fs.readFileSync(path.join(repoRoot, rel)));
    } catch {
      h.update("MISSING");
    }
    h.update("\0");
  }
  return h.digest("hex");
}

/** THE GAME TREE'S IDENTITY. Every git-tracked file `isGameCode()` calls the game, hashed by
 *  its current on-disk content. Two calls with an unchanged tree always agree; any change to
 *  any file `isGameCode()` covers changes it — including a change nobody remembered to stamp. */
export function gameTreeHash(repoRoot) {
  const files = gitTrackedFiles(repoRoot).filter(isGameCode);
  return hashFiles(repoRoot, files);
}
