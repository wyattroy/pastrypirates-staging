#!/usr/bin/env node
/* where_is_my_work.mjs — "is my work on staging? is it live?" answered by READING THE SITES.
 *
 * WHY THIS EXISTS, 2026-09-06. Wyatt said "the very first thing i did this morning around 9am ET
 * was merge the branch to main", and a session ran
 *
 *     git merge-base --is-ancestor HEAD origin/main    -> NO
 *     git rev-list --count origin/main..HEAD           -> 1355
 *
 * and told him the merge had failed. Both numbers were TRUE and about the WRONG SUBJECT: this
 * checkout's `origin` is the PRODUCTION repo, and he was talking about staging, which is a
 * DIFFERENT REPOSITORY (wyattroy/pastrypirates-staging). It then raised an alarm that players were
 * on an eleven-day-old build — accurate, intentional, and not a fault. Three rounds of his time.
 *
 * THE LESSON THIS SCRIPT IS: an instrument that answers honestly about the wrong subject is the
 * most convincing kind of wrong (CLAUDE.md rule 6; HARD-WON-LESSONS section 10). Git ancestry
 * CANNOT answer "did my work ship?" — staging is published by COPY, not by merge, so there is no
 * ancestry to measure. THE ONLY HONEST ANSWER IS THE STAMP THE SITE IS ACTUALLY SERVING.
 *
 * NOT in `npm test`, on purpose: it needs the network, and a gate that fails when the wifi drops
 * teaches people to ignore gates. It is a thing you RUN when you want to know.
 *
 *   node scripts/where_is_my_work.mjs
 */
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const STAMP_RE = /PP4_STAMP\s*=\s*"([^"]*)"/;

const SITES = [
  { name: "staging", url: "https://staging.playpastrypirates.com/src/ui/stage.js",
    what: "where you play work-in-progress — published by COPY, from any branch" },
  { name: "production", url: "https://playpastrypirates.com/src/ui/stage.js",
    what: "the game real players are in — moves only by a MERGE to main in this repo" },
];

function gitBranch() {
  try {
    const head = fs.readFileSync(path.join(repo, ".git", "HEAD"), "utf8").trim();
    return head.startsWith("ref: ") ? head.replace("ref: refs/heads/", "") : `detached at ${head.slice(0, 8)}`;
  } catch { return "unknown"; }
}

function localStamp() {
  const f = path.join(repo, "src", "ui", "stage.js");
  if (!fs.existsSync(f)) return { err: `no src/ui/stage.js at ${f}` };
  const m = STAMP_RE.exec(fs.readFileSync(f, "utf8"));
  return m ? { stamp: m[1] } : { err: "src/ui/stage.js has no PP4_STAMP" };
}

async function liveStamp(url) {
  // A NETWORK FAILURE IS "UNKNOWN", NEVER "NOT PUBLISHED". Reporting absence on a failed fetch is
  // exactly the class of lie this script exists to stop.
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
    if (!res.ok) return { err: `HTTP ${res.status}` };
    const m = STAMP_RE.exec(await res.text());
    return m ? { stamp: m[1] } : { err: "served a page with no PP4_STAMP in it" };
  } catch (e) {
    return { err: `could not reach it (${e.name === "TimeoutError" ? "timed out" : e.message})` };
  }
}

const local = localStamp();
const results = await Promise.all(SITES.map(async (s) => ({ ...s, ...(await liveStamp(s.url)) })));

console.log("\nWHERE IS MY WORK?  — read off the live sites, never off git ancestry\n");
console.log(`  your working tree   ${local.stamp ?? "?? " + local.err}`);
console.log(`                      on branch ${gitBranch()}\n`);
for (const r of results) {
  console.log(`  ${r.name.padEnd(20)}${r.stamp ?? "UNKNOWN — " + r.err}`);
  console.log(`                      ${r.what}`);
}

// The staging stamp carries a "-staging@<sha>" suffix the deploy adds to the PUBLISHED copy, never
// to the source, so the comparison is on the part before it.
const base = (s) => (s ? s.split("-staging@")[0] : null);
const staging = results.find((r) => r.name === "staging");
const prod = results.find((r) => r.name === "production");

console.log("  ------------------------------------------------------------------");
if (!local.stamp) {
  console.log("  Cannot judge: this tree has no readable stamp.");
} else if (!staging.stamp) {
  console.log(`  Staging: UNKNOWN — ${staging.err}.`);
  console.log("  That is NOT evidence it is unpublished. Say UNKNOWN to him, not 'not deployed'.");
} else if (base(staging.stamp) === local.stamp) {
  console.log("  STAGING IS CARRYING THIS TREE. Your work is published and he can play it.");
} else {
  console.log(`  STAGING IS SERVING A DIFFERENT BUILD (${base(staging.stamp)}) than this tree`);
  console.log(`  (${local.stamp}).  To publish:  npm run deploy:staging -- "what changed"`);
}
if (prod.stamp && local.stamp && base(prod.stamp) !== local.stamp) {
  console.log(`\n  Production is on ${prod.stamp}.`);
  console.log("  OLDER THAN THIS TREE IS NORMAL AND USUALLY CORRECT — it moves only when Wyatt");
  console.log("  approves a merge to main in THIS repo. Never copy staging onto production:");
  console.log("  staging carries its own CNAME, a robots.txt saying Disallow: /, and a rewritten");
  console.log("  stamp; copying it would take the live game out of Google and mislabel the build.");
}
console.log("");
