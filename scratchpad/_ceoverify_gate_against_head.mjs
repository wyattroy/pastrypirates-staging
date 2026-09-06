import { execSync } from "node:child_process";

const src = execSync("git show HEAD:scripts/sea_trial.mjs", { cwd: process.cwd(), encoding: "utf8" });

const failures = [];
const check = (label, cond) => { if (!cond) failures.push(label); console.log(`  ${cond ? "OK" : "FAIL"}  ${label}`); };

console.log("Running the gate's checks against HEAD's version of sea_trial.mjs (pre-fix, since the fix is uncommitted):");
check("imports gameTreeHash from the lib", /import\s*\{\s*gameTreeHash\s*\}\s*from\s*"\.\/lib\/game_tree_hash\.mjs"/.test(src));
check("computes a tree-hash constant once, near where STAMP is read", /const\s+\w*[Tt][Rr][Ee][Ee]\w*\s*=\s*gameTreeHash\(REPO\)/.test(src));
const buildLines = src.split("\n").filter(l => /\$\{STAMP\}/.test(l) && /build/i.test(l));
check(`at least 3 build-identity lines exist to check (found ${buildLines.length})`, buildLines.length >= 3);
const allCarryHash = buildLines.length > 0 && buildLines.every(l => /tree|hash/i.test(l));
check("every build-identity line also names the tree hash, not just STAMP", allCarryHash);

console.log(failures.length ? `\nWould FAIL — ${failures.length} case(s) against HEAD (pre-fix)` : "\nWould PASS against HEAD (pre-fix) -- gate does NOT depend on the fix!");
