/* Scratch (T-100): was rulings_triage_check.mjs already RED before this watch touched anything?
   Rule 6 — do not report a defect, or a clean bill, without measuring it. This checks out the
   Chart as it stood at the pre-watch HEAD into a temp file and runs the gate against that, so the
   answer is measured rather than argued from "I didn't touch those rows". */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const PRE = process.argv[2] || "098c10f8"; // HEAD when this watch started
const CHART = path.join(REPO, ".planning", "CHART.md");

const now = fs.readFileSync(CHART, "utf8");
const old = spawnSync("git", ["show", `${PRE}:.planning/CHART.md`], { cwd: REPO, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
if (old.status !== 0) { console.log("could not read the pre-watch Chart:", old.stderr); process.exit(1); }

const run = () => spawnSync(process.execPath, [path.join(REPO, "scripts/qa/rulings_triage_check.mjs")], { cwd: REPO, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });

try {
  const nowRun = run();
  fs.writeFileSync(CHART, old.stdout);
  const oldRun = run();
  const count = r => ((r.stdout || "") + (r.stderr || "")).split("\n").filter(l => l.startsWith("FAIL")).length;
  console.log(`AT THIS WATCH'S HEAD : exit ${nowRun.status}, ${count(nowRun)} FAIL line(s)`);
  console.log(`AT ${PRE} (pre-watch) : exit ${oldRun.status}, ${count(oldRun)} FAIL line(s)`);
  console.log(oldRun.status !== 0
    ? "\nVERDICT: the gate was ALREADY RED before this watch — not caused by T-100."
    : "\nVERDICT: the gate was GREEN before this watch — this watch turned it red. Fix it.");
} finally {
  fs.writeFileSync(CHART, now);
  console.log(fs.readFileSync(CHART, "utf8") === now ? "RESTORED CHART.md (re-read, not assumed)" : "⛔ RESTORE FAILED — git checkout -- .planning/CHART.md");
}
