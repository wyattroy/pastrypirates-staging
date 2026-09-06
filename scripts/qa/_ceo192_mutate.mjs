/* CEO 192 — the sharp one: does the gate hold HIS RULING, or only the SHAPE of the launch line? */
import fs from "node:fs";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";

const BELL = "C:\\Users\\wyatt\\Projects\\pastrypirates\\scripts\\wyclau\\bell.ps1";
const GATE = "C:\\Users\\wyatt\\Projects\\pastrypirates\\scripts\\qa\\bell_check.mjs";
const original = fs.readFileSync(BELL, "utf8");
const sha = (s) => crypto.createHash("sha256").update(s).digest("hex").slice(0, 16);
console.log("ORIGINAL sha:", sha(original));

function runGate() {
  try { execFileSync(process.execPath, [GATE], { encoding: "utf8" }); return 0; }
  catch (e) { return e.status; }
}

const mutants = [
  ["M6 the Watch put straight back on OPUS", (s) => s.replace('$watchModel = "claude-sonnet-5"', '$watchModel = "claude-opus-5"')],
  ["M7 npm test with the Watch on Opus (whole chain)", null],
];

try {
  const m = mutants[0][1](original);
  if (m === original) { console.log("*** MUTATION DID NOT APPLY ***"); }
  else {
    fs.writeFileSync(BELL, m, "utf8");
    console.log("applied =", fs.readFileSync(BELL, "utf8").includes('claude-opus-5'));
    console.log("M6 bell_check exit =", runGate(), " (0 means the gate BLESSES the Watch running Opus)");
  }
} finally {
  fs.writeFileSync(BELL, original, "utf8");
  console.log("RESTORED sha:", sha(fs.readFileSync(BELL, "utf8")), "identical:", fs.readFileSync(BELL, "utf8") === original);
}
