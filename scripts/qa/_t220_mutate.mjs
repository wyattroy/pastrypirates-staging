/* REAL-MUTATION RED-PROOF for clause 9. CEO 179's lesson: a red-proof that hard-codes the shape of
   what it mutates can go stale into a no-op, so this one asserts the mutation actually changed the
   file before believing the verdict. Restores in a finally block. Scratch, not a gate. */
import fs from "node:fs";
import { spawnSync } from "node:child_process";
const F = "scripts/sea_trial.mjs";
const LINE = "    if (!legs.includes(leg.name)) continue;";
const original = fs.readFileSync(F, "utf8");
try {
  const mutated = original.replace(LINE, "    // [mutated for the red-proof]");
  if (mutated === original) throw new Error("MUTATION WAS A NO-OP — the line this red-proof targets is not in the file verbatim, so nothing below would have meant anything.");
  fs.writeFileSync(F, mutated);
  const r = spawnSync(process.execPath, ["scripts/qa/sea_trial_chosen_depth_check.mjs"], { encoding: "utf8", maxBuffer: 32e6 });
  const out = (r.stdout || "") + (r.stderr || "");
  const nine = (out.match(/^  (PASS|FAIL)  9\..*$/m) || ["(clause 9 not printed)"])[0];
  const fails = (out.match(/^  FAIL/gm) || []).length;
  console.log(`  mutation applied (the fleet filter deleted from the real file)`);
  console.log(`  gate exit: ${r.status}   clauses failed: ${fails}`);
  console.log(`  ${nine.trim()}`);
  console.log(`\n  ${r.status !== 0 && /^  FAIL  9\./m.test(out) && fails === 1 ? "PROVEN — clause 9 fails on the real fault, and ONLY clause 9" : "NOT PROVEN"}`);
} finally {
  fs.writeFileSync(F, original);
  console.log(`  restored: ${fs.readFileSync(F, "utf8") === original ? "byte-identical" : "!! DIFFERENT — CHECK git diff !!"}`);
}
