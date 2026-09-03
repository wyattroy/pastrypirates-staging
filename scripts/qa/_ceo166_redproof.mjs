/* CEO 166 — read-only inspection of w52 gate internals + red-proof. Delete after use. */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const REPO = "C:/Users/wyatt/Projects/pastrypirates";
const TREE = path.join(REPO, ".tmp-ceo166");
const stage0 = fs.readFileSync(path.join(REPO, "src/ui/stage.js"), "utf8");
const gate = fs.readFileSync(path.join(REPO, "scripts/qa/w52_call_beside_boat_check.mjs"), "utf8");
fs.mkdirSync(path.join(TREE, "scripts/qa"), { recursive: true });
fs.mkdirSync(path.join(TREE, "src/ui"), { recursive: true });
fs.writeFileSync(path.join(TREE, "scripts/qa/w52_call_beside_boat_check.mjs"), gate);

// replicate the gate's own slicing
const slice = src => {
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
  const s = code.indexOf("let spots = anchors.map(");
  const i = code.lastIndexOf("if (onBoats){", s);
  const j = code.indexOf("menu.forEach((b, i) =>", i);
  return { code, branch: j < 0 ? "" : code.slice(i, j) };
};

const report = (name, src) => {
  const { code, branch } = slice(src);
  const radDef = /const boatRad\s*=[\s\S]{0,180}fixedRect\(/.test(code) && /\bboatRad\s*\(/.test(branch);
  const calls = (branch.match(/\bboatRad\s*\(/g) || []).length;
  console.log(`${name}: branch=${branch.length}ch boatRad-calls-in-branch=${calls} radDef=${radDef}`);
  const airs = branch.match(/const AIR\s*=\s*([^;]+);/);
  console.log(`      AIR in branch = ${airs ? airs[1] : "NONE"}`);
};

const run = (name, mutate) => {
  const s = mutate(stage0);
  fs.writeFileSync(path.join(TREE, "src/ui/stage.js"), s);
  let out = "", code = 0;
  try { out = execFileSync(process.execPath, [path.join(TREE, "scripts/qa/w52_call_beside_boat_check.mjs")], { encoding: "utf8" }); }
  catch (e) { out = (e.stdout || "") + (e.stderr || ""); code = e.status; }
  const fails = out.split("\n").filter(l => l.startsWith("FAIL"));
  console.log(`${name}: applied=${s !== stage0} exit=${code} ${code ? "KILLED" : "SURVIVED"}${fails.length ? " :: " + fails[0].slice(0, 130) : ""}`);
  report("   detail", s);
};

run("BASELINE          ", s => s);
run("M2 seed-constant  ", s => s.replace("const rad = boatRad(anchorSeats[k]);", "const rad = 26;"));
// zero the AIR that is INSIDE the circles branch (line ~3340), not the unrelated one at 592
run("M4 branch-AIR-zero", s => s.replace("      const AIR = 6;\n      const HALF = Math.round(D * S.growPeak) / 2;",
                                          "      const AIR = 0;\n      const HALF = Math.round(D * S.growPeak) / 2;"));
