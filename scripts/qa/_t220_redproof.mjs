/* RED-PROOF for sea_trial_chosen_depth_check.mjs — scratch, not committed as a gate.
   Each --red= must fail, and must fail the clause it names and (where isolatable) only that one. */
import { spawnSync } from "node:child_process";
const CASES = ["order", "honour", "case", "unknown", "picker", "unrecorded", "reason", "report", "phantom"];
let bad = 0;
for (const c of CASES) {
  const r = spawnSync(process.execPath, ["scripts/qa/sea_trial_chosen_depth_check.mjs", `--red=${c}`],
    { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
  const out = (r.stdout || "") + (r.stderr || "");
  const fails = (out.match(/^  FAIL/gm) || []).length;
  const nonzero = r.status !== 0;
  const ok = nonzero && fails > 0;
  if (!ok) bad++;
  console.log(`  ${ok ? "trips" : "DOES NOT TRIP"}  --red=${c.padEnd(11)} exit ${r.status}  ${fails} clause(s) failed`);
}
const clean = spawnSync(process.execPath, ["scripts/qa/sea_trial_chosen_depth_check.mjs"], { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
console.log(`\n  no --red flag: exit ${clean.status} (must be 0)`);
process.exit(bad || clean.status !== 0 ? 1 : 0);
