/* CEO 192 — re-run the watch's claimed red proofs myself, on the REAL file, then restore it.
   Every mutation is verified APPLIED (the text actually changed) before the gate result is read. */
import fs from "node:fs";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";

const BELL = "C:\\Users\\wyatt\\Projects\\pastrypirates\\scripts\\wyclau\\bell.ps1";
const GATE = "C:\\Users\\wyatt\\Projects\\pastrypirates\\scripts\\qa\\bell_check.mjs";
const original = fs.readFileSync(BELL, "utf8");
const sha = (s) => crypto.createHash("sha256").update(s).digest("hex").slice(0, 16);
console.log("ORIGINAL sha:", sha(original), "bytes:", original.length);

function runGate() {
  try {
    const out = execFileSync(process.execPath, [GATE], { encoding: "utf8" });
    return { exit: 0, out };
  } catch (e) {
    return { exit: e.status, out: (e.stdout || "") + (e.stderr || "") };
  }
}

const mutants = [
  ["M1 remove --model from the array", (s) => s.replace('@("-p", "`"$doorPrompt`"", "--model", $watchModel)', '@("-p", "`"$doorPrompt`"")')],
  ["M2 Start-Process rebuilds its own inline array", (s) => s.replace("-ArgumentList $claudeArgs", '-ArgumentList (@("-p", "`"$doorPrompt`"") + $kitArgs)')],
  ["M3 dry run prints a description again", (s) => s.replace("DRYRUN would ring a watch: claude $($claudeArgs -join ' ')", "DRYRUN would ring a watch (kit: whatever)")],
  ["M4 syntax error (unclosed brace) — does the PARSE check bite?", (s) => s.replace("if ($DryRun) {", "if ($DryRun) { { ")],
  ["M5 model set to a nonsense string", (s) => s.replace('$watchModel = "claude-sonnet-5"', '$watchModel = "not-a-model-at-all"')],
];

try {
  const base = runGate();
  console.log(`\nBASELINE: exit=${base.exit}`);
  for (const [name, fn] of mutants) {
    const mutated = fn(original);
    if (mutated === original) { console.log(`\n${name}: *** MUTATION DID NOT APPLY — text not found ***`); continue; }
    fs.writeFileSync(BELL, mutated, "utf8");
    const applied = fs.readFileSync(BELL, "utf8") === mutated;
    const r = runGate();
    const fails = r.out.split("\n").filter((l) => /FAIL/.test(l)).map((l) => l.trim());
    const notchecked = r.out.split("\n").filter((l) => l.includes("NOT CHECKED")).map((l) => l.trim());
    console.log(`\n${name}\n  applied=${applied} exit=${r.exit}`);
    fails.forEach((f) => console.log("   " + f));
    notchecked.forEach((f) => console.log("   " + f));
    fs.writeFileSync(BELL, original, "utf8");
  }
} finally {
  fs.writeFileSync(BELL, original, "utf8");
  const now = fs.readFileSync(BELL, "utf8");
  console.log("\nRESTORED sha:", sha(now), "identical:", now === original);
}
