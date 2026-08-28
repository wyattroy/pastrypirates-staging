#!/usr/bin/env node
/* BUMP THE BUILD NUMBER — A-5 (Wyatt, 2026-08-28: "you should create a counter to increment the
 * build and track it").
 *
 *   node scripts/bump-build.mjs          # 2026.08.28.1 -> 2026.08.28.2 (same day) or 2026.08.29.1
 *   npm run bump
 *
 * THE STAMP ITSELF IS THE COUNTER — deliberately no separate counter file. This repo has paid
 * three times for a hand-kept list drifting from the thing it described (deploy EXCLUDES, the
 * doc-check file list, the profile ignore list); a .build-counter that disagreed with the stamp
 * in stage.js would be the fourth. The script reads the ONE stamp the game serves, derives the
 * next number from it and today's date, and writes it back. `git log -S PP4_STAMP` is the
 * tracking history — every bump is a commit.
 *
 * WHEN TO RUN IT: at the start of a batch of work that will reach staging, before the deploy —
 * the release loop in docs/GIT-AND-DEPLOY.md names the step. deploy-staging.sh deliberately does
 * NOT auto-bump: it deploys the working tree as-is and appends -staging@<sha>, and a deploy that
 * silently changed the build number would break "the stamp names the exact build he played".
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FILE = path.join(REPO, "src/ui/stage.js");

const src = fs.readFileSync(FILE, "utf8");
const m = src.match(/const PP4_STAMP = "(\d{4})\.(\d{2})\.(\d{2})\.(\d+)"/);
if (!m) {
  console.error("FATAL: PP4_STAMP in src/ui/stage.js is not in YYYY.MM.DD.N form — refusing to guess.");
  process.exit(1);
}
const today = new Date();
const y = today.getFullYear(), mo = String(today.getMonth() + 1).padStart(2, "0"), d = String(today.getDate()).padStart(2, "0");
const sameDay = m[1] === String(y) && m[2] === mo && m[3] === d;
const n = sameDay ? Number(m[4]) + 1 : 1;
const next = `${y}.${mo}.${d}.${n}`;
fs.writeFileSync(FILE, src.replace(m[0], `const PP4_STAMP = "${next}"`));
console.log(`stamped: ${m[1]}.${m[2]}.${m[3]}.${m[4]} -> ${next}   (commit this with the work it names)`);
