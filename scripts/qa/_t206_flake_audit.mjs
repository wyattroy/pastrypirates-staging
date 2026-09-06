#!/usr/bin/env node
/* Throwaway: the red proof exited 1 once under `> /dev/null` and 0 every other time. An
   intermittent gate is worth more attention than a failing one — rule 27's tell. Run it N times
   and record the exit code and the last line each time. */
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const N = Number(process.argv[2] || 5);
for (let i = 0; i < N; i++) {
  const r = spawnSync(process.execPath, [join(HERE, "_t206_gate_redproof.mjs")], { encoding: "utf8" });
  const lines = `${r.stdout || ""}${r.stderr || ""}`.trim().split("\n");
  console.log(`run ${i + 1}: exit ${r.status}  | ${lines[lines.length - 1].slice(0, 110)}`);
  if (r.status !== 0) console.log(lines.filter((l) => l.includes("FAIL")).join("\n"));
}
