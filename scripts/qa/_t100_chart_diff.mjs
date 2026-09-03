/* SCRATCH (T-100): what exactly changed in CHART.md after this watch committed it? Something in
   `npm test` moved a row, and "a row moved" is not good enough to commit blind — rule 6. */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const d = spawnSync("git", ["diff", "-U0", "--", ".planning/CHART.md"], { cwd: REPO, encoding: "utf8", maxBuffer: 64e6 }).stdout || "";
const add = d.split("\n").filter(l => l.startsWith("+") && !l.startsWith("+++"));
const del = d.split("\n").filter(l => l.startsWith("-") && !l.startsWith("---"));
console.log(`added ${add.length} line(s), removed ${del.length} line(s)`);
console.log("\n--- ADDED (first 4) ---");
for (const l of add.slice(0, 4)) console.log(l.slice(0, 180));
console.log("\n--- REMOVED (first 4) ---");
for (const l of del.slice(0, 4)) console.log(l.slice(0, 180));
const addSet = new Set(add.map(l => l.slice(1)));
const delSet = new Set(del.map(l => l.slice(1)));
const onlyAdded = [...addSet].filter(l => !delSet.has(l));
const onlyRemoved = [...delSet].filter(l => !addSet.has(l));
console.log(`\nTRULY NEW TEXT: ${onlyAdded.length} line(s)`);
for (const l of onlyAdded.slice(0, 10)) console.log("  +" + l.slice(0, 170));
console.log(`TRULY LOST TEXT: ${onlyRemoved.length} line(s)`);
for (const l of onlyRemoved.slice(0, 10)) console.log("  -" + l.slice(0, 170));
