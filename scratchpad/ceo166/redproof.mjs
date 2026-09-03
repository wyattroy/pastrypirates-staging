/* CEO 166 — read-only red-proof of scripts/qa/w52_call_beside_boat_check.mjs.
   Builds a throwaway tree under scratchpad/ceo166/tree, plants a tamper in ITS copy of stage.js,
   and runs the real gate against it. The repo's own files are never modified. */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const REPO = "C:/Users/wyatt/Projects/pastrypirates";
const HERE = "C:/Users/wyatt/Projects/pastrypirates/scratchpad/ceo166";
const TREE = path.join(HERE, "tree");
const stage0 = fs.readFileSync(path.join(REPO, "src/ui/stage.js"), "utf8");
const gate = fs.readFileSync(path.join(REPO, "scripts/qa/w52_call_beside_boat_check.mjs"), "utf8");

fs.mkdirSync(path.join(TREE, "scripts/qa"), { recursive: true });
fs.mkdirSync(path.join(TREE, "src/ui"), { recursive: true });
fs.writeFileSync(path.join(TREE, "scripts/qa/w52_call_beside_boat_check.mjs"), gate);

const run = (name, mutate) => {
  const s = mutate(stage0);
  if (s === stage0 && name !== "BASELINE") { console.log(`${name}: MUTANT DID NOT APPLY`); return; }
  fs.writeFileSync(path.join(TREE, "src/ui/stage.js"), s);
  let out = "", code = 0;
  try { out = execFileSync(process.execPath, [path.join(TREE, "scripts/qa/w52_call_beside_boat_check.mjs")], { encoding: "utf8" }); }
  catch (e) { out = (e.stdout || "") + (e.stderr || ""); code = e.status; }
  const fails = out.split("\n").filter(l => l.startsWith("FAIL"));
  console.log(`${name}: exit=${code} ${code ? "KILLED" : "SURVIVED"}${fails.length ? " :: " + fails[0].slice(0, 110) : ""}`);
};

run("BASELINE", s => s);
// 1. the hoisted definition stops measuring a real rect
run("M1 boatRad-literal", s => s.replace("const r = fixedRect(el); return Math.max(r.width, r.height) / 2 || D / 2; };",
                                          "const r = {width:26,height:26}; return Math.max(r.width, r.height) / 2 || D / 2; };"));
// 2. the branch stops CALLING boatRad (constant back in the seed)
run("M2 seed-constant", s => s.replace("const rad = boatRad(anchorSeats[k]);", "const rad = 26;"));
// 3. the swollen petal term zeroed
run("M3 HALF-zero", s => s.replace("const HALF = Math.round(D * S.growPeak) / 2;", "const HALF = 0 * Math.round(D * S.growPeak) / 2;"));
// 4. the air zeroed
run("M4 AIR-zero", s => s.replace(/const AIR = 6;/, "const AIR = 0;"));
// 5. HOLE PROBE: definition moved OUT of promptTick entirely (file-wide search should still see it)
run("M5 def-elsewhere-and-branch-const", s =>
  s.replace("const rad = boatRad(anchorSeats[k]);", "const rad = boatRad(anchorSeats[k]) * 0 + 26;"));
