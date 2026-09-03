#!/usr/bin/env node
/* SCRATCH — run EVERY gate in package.json's test chain, without && short-circuiting.
 * `npm test` stops at the first red, so one pre-existing failure hides the state of the 30 gates
 * behind it — including a gate this watch just added. This reports all of them. */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const chain = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")).scripts.test;
const cmds = chain.split("&&").map((s) => s.trim()).filter(Boolean);

const red = [];
for (const c of cmds) {
  const parts = c.split(/\s+/).slice(1); // drop the leading `node`
  try {
    execFileSync(process.execPath, parts, { cwd: ROOT, stdio: "pipe" });
  } catch {
    red.push(parts[0]);
  }
}
console.log(`${cmds.length} gates run · ${cmds.length - red.length} green · ${red.length} red`);
for (const r of red) console.log(`  RED  ${r}`);
