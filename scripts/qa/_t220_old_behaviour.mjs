/* MEASURE THE OLD FAULT, don't reason about it. Recovers scripts/sea_trial.mjs at HEAD (before this
   watch's change), runs it with the lower-case gear spelling, and reads back the two lines it prints
   BEFORE npm test starts — `gear:` and `legs:`. Bounded and killed; --report points at a scratch
   path so the authoritative report is never touched. Scratch file, not a gate. */
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execSync, spawnSync } from "node:child_process";

const REPO = process.cwd();
const OLD = path.join(REPO, "scripts", "_t220_old_sea_trial.mjs");   // inside scripts/ so REPO resolves
fs.writeFileSync(OLD, execSync("git show HEAD:scripts/sea_trial.mjs", { encoding: "utf8", maxBuffer: 32e6 }));
const scratch = path.join(os.tmpdir(), `t220-scratch-${Date.now()}.md`);

for (const g of ["cosmetic", "SHALLOW"]) {
  const r = spawnSync(process.execPath, [OLD, `--gear=${g}`, `--report=${scratch}`, "--judge=off"],
    { cwd: REPO, encoding: "utf8", timeout: 20000, maxBuffer: 32e6 });
  const out = (r.stdout || "") + (r.stderr || "");
  const gearLine = (out.match(/^\s*gear:.*$/m) || ["(none)"])[0].trim();
  const legsLine = (out.match(/^\s*legs:.*$/m) || ["(none)"])[0].trim();
  const n = legsLine.startsWith("legs:") ? legsLine.slice(5).split(",").filter(s => s.trim()).length : 0;
  console.log(`\n  OLD FILE, --gear=${g}`);
  console.log(`    ${gearLine.slice(0, 120)}`);
  console.log(`    legs actually queued: ${n}`);
  console.log(`    exited: ${r.status === null ? "killed by the timeout mid-run (it was really sailing)" : r.status}`);
}
fs.rmSync(OLD, { force: true });
try { fs.rmSync(scratch, { force: true }); } catch {}
console.log("\n  (recovered copy and scratch report removed)\n");
