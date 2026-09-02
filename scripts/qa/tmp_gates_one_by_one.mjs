// Run every gate in package.json's `test` chain SEPARATELY and print the whole table.
// `npm test` is a && chain, so the first failure hides every gate after it — which makes it useless
// for answering "did MY change break anything" when the suite is already red from somebody else's.
// Scratch; delete once the suite is green again.
import { execSync } from "node:child_process";
import fs from "node:fs";

const cmds = JSON.parse(fs.readFileSync("package.json", "utf8")).scripts.test.split("&&").map((s) => s.trim());
let pass = 0;
const failed = [];
for (const c of cmds) {
  try {
    execSync(c, { stdio: "pipe", timeout: 180000 });
    pass++;
  } catch {
    failed.push(c);
  }
}
console.log(`${pass} of ${cmds.length} gates pass`);
for (const f of failed) console.log(`  FAIL  ${f}`);
