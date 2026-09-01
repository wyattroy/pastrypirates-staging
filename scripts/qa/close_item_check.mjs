#!/usr/bin/env node
/* close_item_check.mjs — the CEO gate must actually gate.
 *
 * CEO Review 65, on the Watch redesign: "the design says CEO-per-item 'becomes a gate' but never
 * says what enforces the gate. Given that 'CEO after every item' has been promised and lost twice
 * before, the build must make this mechanical." scripts/wyclau/close_item.mjs is the mechanism —
 * the ONLY way a watch closes an item — and THIS check drives it as a real subprocess against
 * real fixture trees, both directions:
 *
 *   RED SIDE: every kind of missing evidence must REFUSE (exit 1) — no CEO verdict, an
 *   untraceable verdict, a commit with no game code, a stated solution with no implementing
 *   commit named, an already-closed item.
 *   GREEN SIDE: complete evidence must close — and the tick, the INBOX fate and the ledger entry
 *   must all be written together, so the three records cannot disagree.
 *
 * A gate that only tests the happy path certifies a close_item.mjs that always says yes — which
 * would be the exact decoration ("a check that cannot fail proves nothing") this project keeps
 * paying for.
 *
 * House convention: no test runner, one PASS/FAIL line per case, every case runs before exit.
 */
"use strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const SCRIPT = path.join(ROOT, "scripts", "wyclau", "close_item.mjs");

let failed = false;
const check = (label, cond, detail) => {
  if (cond) console.log(`PASS -- ${label}`);
  else { console.error(`FAIL -- ${label}${detail ? `: ${detail}` : ""}`); failed = true; }
};

/* One fixture repo, built once: a git history with one game-code commit and one docs-only
 * commit, a Chart with open rows, an INBOX with a solution-bearing item, and a CEO record
 * whose Review 7 names the item while Review 8 names nothing. */
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "close-item-check-"));
const g = (...args) => execFileSync("git", args, { cwd: dir, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
fs.mkdirSync(path.join(dir, ".planning", "wyclau"), { recursive: true });
fs.mkdirSync(path.join(dir, "src"), { recursive: true });
g("init", "-q");
g("config", "user.email", "gate@example.com");
g("config", "user.name", "close-item gate");
fs.writeFileSync(path.join(dir, "src", "flow.js"), "export const a = 1;\n");
g("add", "."); g("commit", "-q", "-m", "seed");
fs.writeFileSync(path.join(dir, "src", "flow.js"), "export const a = 2;\n");
g("add", "."); g("commit", "-q", "-m", "the game change");
const gameSha = g("rev-parse", "HEAD").trim();
fs.writeFileSync(path.join(dir, "NOTES.md"), "docs only\n");
g("add", "."); g("commit", "-q", "-m", "docs only");
const docsSha = g("rev-parse", "HEAD").trim();

const CHART = path.join(dir, ".planning", "CHART.md");
const INBOX = path.join(dir, ".planning", "wyclau", "INBOX.md");
const REVIEWS = path.join(dir, ".planning", "CEO-REVIEWS.md");
const LEDGER = path.join(dir, ".planning", "CTO-LEDGER.md");
fs.writeFileSync(CHART, [
  "# chart", "- [ ] fix the wind pill on the guest", "- [ ] fix the wind gauge label",
  "- [ ] repair the dock ramp",
].join("\n") + "\n");
fs.writeFileSync(INBOX, [
  "# inbox",
  "## INBOX-20260901T0100Z — camera zoom",
  "> zoom the camera out more",
  "solution: zoom the camera out more",
  "status: OPEN",
  "",
  "## INBOX-20260901T0200Z — already closed",
  "> old ask",
  "solution: none stated",
  "status: DONE 2026-09-01 — done earlier",
].join("\n") + "\n");
fs.writeFileSync(REVIEWS, [
  `## CEO Review 7 — names things`,
  `Verdict on "repair the dock ramp" and INBOX-20260901T0100Z and commit ${gameSha.slice(0, 7)}: YES.`,
  `## CEO Review 8 — names nothing`,
  `A verdict about something else entirely.`,
].join("\n") + "\n");
fs.writeFileSync(LEDGER, "# ledger\n");

const run = (...args) => spawnSync(process.execPath, [SCRIPT, `--repo=${dir}`, ...args], { encoding: "utf8" });

console.log("close_item_check — the CEO gate must refuse missing evidence and write all three records\n");

/* RED SIDE — every refusal must actually refuse. */
let r = run("--item=repair the dock ramp", "--commit=" + gameSha);
check("no --ceo is a usage error", r.status === 2, `exit ${r.status}`);

r = run("--item=repair the dock ramp", "--ceo=99", "--commit=" + gameSha);
check("a CEO review that does not exist refuses", r.status === 1 && /not in CEO-REVIEWS/.test(r.stdout), `exit ${r.status}: ${r.stdout.slice(0, 120)}`);

r = run("--item=repair the dock ramp", "--ceo=8", "--commit=" + gameSha);
check("a CEO review that never mentions the item refuses (traceability)", r.status === 1 && /never mentions/.test(r.stdout), `exit ${r.status}: ${r.stdout.slice(0, 120)}`);

r = run("--item=repair the dock ramp", "--ceo=7", "--commit=" + docsSha);
check("a commit touching no game code refuses and points at --reason", r.status === 1 && /touches no game code/.test(r.stdout), `exit ${r.status}: ${r.stdout.slice(0, 160)}`);

r = run("--item=repair the dock ramp", "--ceo=7", "--reason=short");
check("a --reason too short to review refuses", r.status === 1, `exit ${r.status}`);

r = run("--item=INBOX-20260901T0100Z", "--ceo=7", "--commit=" + gameSha);
check("a stated solution with no --solution-commit refuses (solution-first)", r.status === 1 && /stated a solution/.test(r.stdout), `exit ${r.status}: ${r.stdout.slice(0, 160)}`);

r = run("--item=INBOX-20260901T0200Z", "--ceo=7", "--reason=already handled elsewhere, closing the record");
check("an already-DONE inbox item refuses", r.status === 1 && /already DONE/.test(r.stdout), `exit ${r.status}`);

r = run("--item=fix the wind", "--ceo=7", "--commit=" + gameSha);
check("an ambiguous Chart substring refuses (matches two rows)", r.status === 1 && /matches 2 open Chart rows/.test(r.stdout), `exit ${r.status}: ${r.stdout.slice(0, 120)}`);

/* GREEN SIDE — complete evidence closes, and all three records move together. */
r = run("--item=repair the dock ramp", "--ceo=7", "--commit=" + gameSha, "--summary=ramp repaired");
check("complete evidence on a Chart row closes (exit 0)", r.status === 0, `exit ${r.status}: ${r.stdout.slice(0, 200)}`);
const chartAfter = fs.readFileSync(CHART, "utf8");
check("the Chart row is ticked with a pointer, not restated",
  /- \[x\] repair the dock ramp \(closed \d{4}-\d{2}-\d{2} · CEO 7 · commit/.test(chartAfter), chartAfter.split("\n").find((l) => l.includes("dock ramp")));
check("the other rows are untouched", chartAfter.includes("- [ ] fix the wind pill on the guest") && chartAfter.includes("- [ ] fix the wind gauge label"));
check("the ledger gained the close entry in the same run", /close_item: "repair the dock ramp" · CEO 7/.test(fs.readFileSync(LEDGER, "utf8")));

r = run("--item=INBOX-20260901T0100Z", "--ceo=7", "--commit=" + gameSha, "--solution-commit=" + gameSha);
check("an inbox item with solution evidence closes (exit 0)", r.status === 0, `exit ${r.status}: ${r.stdout.slice(0, 200)}`);
const inboxAfter = fs.readFileSync(INBOX, "utf8");
check("the inbox fate line records CEO, commit and solution-first together",
  /status: DONE \d{4}-\d{2}-\d{2} — CEO 7, commit \w{7}.*his solution first: commit \w{7}/.test(inboxAfter),
  inboxAfter.split("\n").find((l) => l.startsWith("status: DONE 2")) );

/* RED-PROOF THE INSTRUMENT ITSELF: a close_item that always said yes must fail this gate.
 * Cheapest honest form: re-run a refusal case and demand it still refuses AFTER the greens —
 * state from successful closes must not have unlocked anything. */
r = run("--item=INBOX-20260901T0100Z", "--ceo=7", "--commit=" + gameSha, "--solution-commit=" + gameSha);
check("re-closing a closed item still refuses (the gate has no always-yes state)", r.status === 1 && /already DONE/.test(r.stdout), `exit ${r.status}`);

try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* best effort */ }

console.log("");
if (failed) { console.error("FAIL close_item_check — the CEO gate does not gate."); process.exit(1); }
console.log("PASS close_item_check — refusals refuse, closes move all three records together.");
process.exit(0);
