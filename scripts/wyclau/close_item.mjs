#!/usr/bin/env node
// VENDORED FROM claude-kit (plugins/wyclau) — edit THERE, not here. Re-vendor: `bash install.sh vendor <repo> wyclau` from claude-kit. Drift is caught by scripts/qa/vendor_check.mjs.
/* close_item.mjs — the ONLY way a watch closes an item. Refuses without the evidence.
 *
 * WHY THIS IS A SCRIPT AND NOT A RULE. "CEO after every item" was ruled twice and lost twice
 * (2026-08-28 twice, gone again by 2026-09-01 — Wyatt: "the CEO is never being called"). CEO
 * Review 65 named the gap in the redesign itself: "the design says CEO-per-item 'becomes a
 * gate' but never says what enforces the gate." This file is the enforcement. A watch that
 * ticks the Chart or the INBOX by hand instead of through here has broken the Door's contract,
 * and the tick, the fate and the ledger entry it writes together are how the three records
 * cannot disagree.
 *
 * WHAT IT ENFORCES (mechanical) AND WHAT IT DELEGATES (judgement):
 *   1. A CEO verdict EXISTS in .planning/CEO-REVIEWS.md and is TRACEABLE to this item — the
 *      review text must name the item id or the closing commit. The gate checks presence and
 *      traceability; whether the verdict is honest is the CEO's job, not greppable.
 *   2. The item ends in a GAME-CODE DIFF or a stated ONE-LINE REASON (Wyatt's ruling: "every
 *      run ends in a diff or a reason" — the reason is reviewed by the CEO like any work).
 *      Game code is index.html + src/ — the release process's own definition of the game
 *      (docs/GIT-AND-DEPLOY.md section 5: "there is exactly one copy of the game in this
 *      repo: index.html + src/").
 *   3. SOLUTION-FIRST: if the INBOX item records a solution in Wyatt's words, closing requires
 *      naming the commit that implemented it (--solution-commit). The gate verifies the commit
 *      exists and records it; the CEO brief must verify it actually implements his words.
 *
 * USAGE (from a watch, at close):
 *   node scripts/wyclau/close_item.mjs --item="INBOX-20260901T1200Z" --ceo=66 \
 *     --commit=<sha> [--solution-commit=<sha>] [--summary="one line"]
 *   node scripts/wyclau/close_item.mjs --item="<substring of one Chart '- [ ]' row>" --ceo=66 \
 *     --reason="measured, no change needed: <why>"
 *
 * EXIT: 0 closed (Chart/INBOX ticked, ledger appended — commit and push after).
 *       1 refused (the missing evidence is named on stdout).  2 usage.
 * --repo=<dir> points at another tree so a gate can drive this against fixtures (red-proof).
 */
"use strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const args = Object.fromEntries(process.argv.slice(2).map((a) => {
  const m = a.match(/^--([^=]+)(?:=(.*))?$/);
  return m ? [m[1], m[2] === undefined ? true : m[2]] : [a, true];
}));

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = args.repo ? path.resolve(String(args.repo)) : path.resolve(here, "..", "..");
const CHART = path.join(repo, ".planning", "CHART.md");
const INBOX = path.join(repo, ".planning", "wyclau", "INBOX.md");
const REVIEWS = path.join(repo, ".planning", "CEO-REVIEWS.md");
const LEDGER = path.join(repo, ".planning", "CTO-LEDGER.md");

const refuse = (why, fix) => { console.log(`REFUSED: ${why}\n  -> ${fix}`); process.exit(1); };
const usage = (why) => { console.log(`usage error: ${why} (see header of this file)`); process.exit(2); };
const read = (p) => { try { return fs.readFileSync(p, "utf8"); } catch { return null; } };
const nowIso = new Date().toISOString().replace(/\.\d+Z$/, "Z");

const item = args.item && String(args.item);
if (!item) usage("--item is required");
const ceoN = args.ceo && String(args.ceo).match(/^\d+$/) && Number(args.ceo);
if (!ceoN) usage("--ceo=<review number> is required");
if (!args.commit && !args.reason) usage("one of --commit=<sha> or --reason=\"…\" is required");
if (args.commit && args.reason) usage("--commit and --reason are mutually exclusive — a diff needs no excuse");

/* 0. Locate the item — exactly one, in the INBOX or the Chart. */
const isInbox = /^INBOX-/.test(item);
let inboxBlock = null, chartRow = null, solutionLine = null;
if (isInbox) {
  const src = read(INBOX);
  if (src === null) refuse(`no INBOX at ${INBOX}`, "the item id names an inbox entry but the inbox file is missing");
  // Sections found by SPLITTING, never by a lazy regex reaching for end-of-file — JS has no \Z
  // anchor, and the first draft's `(?=^## |\Z)` silently truncated every section at its first
  // literal "Z". Found by close_item_check's red side on the day this was written.
  const secs = src.split(/^(?=## )/m);
  inboxBlock = secs.find((s) => new RegExp(`^## ${item.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(s));
  if (!inboxBlock) refuse(`no INBOX entry titled "## ${item}"`, "check the id against .planning/wyclau/INBOX.md");
  if (/^status:\s*DONE/m.test(inboxBlock)) refuse(`${item} is already DONE`, "nothing to close");
  const sol = inboxBlock.match(/^solution:\s*(.+)$/m);
  if (sol && !/^none stated\b/i.test(sol[1].trim())) solutionLine = sol[1].trim();
} else {
  const src = read(CHART);
  if (src === null) refuse(`no Chart at ${CHART}`, "run from the repo root or pass --repo");
  const rows = src.split("\n").filter((l) => l.startsWith("- [ ]") && l.toLowerCase().includes(item.toLowerCase()));
  if (rows.length === 0) refuse(`no open Chart row ("- [ ]") contains "${item}"`, "check the wording against .planning/CHART.md");
  if (rows.length > 1) refuse(`"${item}" matches ${rows.length} open Chart rows`, "use a longer, unique substring");
  chartRow = rows[0];
}

/* 1. The CEO verdict exists and is traceable to THIS item. */
const reviews = read(REVIEWS);
if (reviews === null) refuse(`no ${REVIEWS}`, "the CEO record is missing entirely");
// Split-based for the same \Z reason as the INBOX lookup above.
const revSec = reviews.split(/^(?=## CEO Review )/m)
  .find((s) => new RegExp(`^## CEO Review ${ceoN}\\b`).test(s));
if (!revSec) refuse(`CEO Review ${ceoN} is not in CEO-REVIEWS.md`, "run the CEO (fresh context), append its verdict, then close");
const rev = [revSec];
const short = args.commit ? String(args.commit).slice(0, 7) : null;
const traceable =
  (isInbox && rev[0].includes(item)) ||
  (short && rev[0].includes(short)) ||
  (!isInbox && rev[0].toLowerCase().includes(item.toLowerCase().slice(0, 40)));
if (!traceable) {
  refuse(`CEO Review ${ceoN} never mentions this item (${isInbox ? item : `"${item}"`}${short ? ` or commit ${short}` : ""})`,
    "the verdict must name the item id or the closing commit so the record is traceable — re-run the CEO with the item named");
}

/* 2. A game-code diff, or a stated reason. */
let closeEvidence;
if (args.commit) {
  let files;
  try {
    files = execFileSync("git", ["show", "--name-only", "--format=", String(args.commit)],
      { cwd: repo, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim().split("\n").filter(Boolean);
  } catch {
    refuse(`commit ${args.commit} does not exist in this repo`, "pass the sha of the commit that changed the game");
  }
  const game = files.filter((f) => f === "index.html" || f.startsWith("src/"));
  if (game.length === 0) {
    refuse(`commit ${short} touches no game code (index.html or src/) — files: ${files.slice(0, 5).join(", ")}${files.length > 5 ? "…" : ""}`,
      `if this item legitimately changed no game code, close with --reason="…" instead — the reason leads the report and the CEO reviews it`);
  }
  closeEvidence = `commit ${short} (${game.length} game file${game.length === 1 ? "" : "s"})`;
} else {
  const reason = String(args.reason).trim();
  if (reason.length < 10) refuse("the --reason is too short to review", "one honest line: why did this item change no game code?");
  if (reason.length > 300) refuse("the --reason is a paragraph", "one line — the detail belongs in the ledger entry, not the excuse");
  closeEvidence = `no game diff — ${reason}`;
}

/* 3. Solution-first: his stated solution requires the commit that implemented it. */
let solutionEvidence = "no stated solution";
if (solutionLine) {
  if (!args["solution-commit"]) {
    refuse(`Wyatt stated a solution for ${item} ("${solutionLine.slice(0, 60)}…") and no --solution-commit names the commit that implemented it`,
      "his stated solution is tried FIRST (ruling 2026-09-01); pass --solution-commit=<sha>, and the CEO verdict must confirm it implements his words");
  }
  try {
    execFileSync("git", ["rev-parse", "--verify", `${String(args["solution-commit"])}^{commit}`],
      { cwd: repo, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  } catch {
    refuse(`--solution-commit ${args["solution-commit"]} does not exist`, "pass the real sha");
  }
  solutionEvidence = `his solution first: commit ${String(args["solution-commit"]).slice(0, 7)}`;
}

/* All evidence present — write the tick, the fate, and the ledger entry TOGETHER. */
const stampShort = nowIso.slice(0, 10);
const pointer = `(closed ${stampShort} · CEO ${ceoN} · ${closeEvidence}${solutionLine ? ` · ${solutionEvidence}` : ""})`;
if (isInbox) {
  const src = read(INBOX);
  const updated = src.replace(inboxBlock,
    inboxBlock.replace(/^status:.*$/m, `status: DONE ${stampShort} — CEO ${ceoN}, ${closeEvidence}${solutionLine ? `; ${solutionEvidence}` : ""}`));
  if (updated === src) refuse(`could not update the status line of ${item}`, "the entry has no 'status:' line — fix the entry format first");
  fs.writeFileSync(INBOX, updated);
} else {
  const src = read(CHART);
  fs.writeFileSync(CHART, src.replace(chartRow, chartRow.replace("- [ ]", "- [x]") + ` ${pointer}`));
}
fs.appendFileSync(LEDGER,
  `\n- ${nowIso} · close_item: ${isInbox ? item : `"${item.slice(0, 60)}"`} · CEO ${ceoN} · ${closeEvidence} · ${solutionEvidence}${args.summary ? ` · ${String(args.summary)}` : ""}\n`);
console.log(`CLOSED ${isInbox ? item : `"${item.slice(0, 60)}"`} — CEO ${ceoN}, ${closeEvidence}, ${solutionEvidence}.`);
console.log("Now: commit (pull --rebase first), push, republish the Glass, END the turn.");
