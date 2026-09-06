#!/usr/bin/env node
/* CEO 190 — does the red-proof HARNESS still read a CRASHING gate as a catch?
   Builds a whole fake ROOT in the OS temp dir containing both scripts, breaks the GATE copy, and
   runs the HARNESS copy inside it (its ROOT is derived from its own location, so it fixtures from
   the fake root). The live tree is never touched. TEMPORARY: deleted at the end of the review. */
import { cpSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const ROOT = "C:/Users/wyatt/Projects/pastrypirates";
const SKIP = new Set(["assets", "node_modules", ".git"]);
const dir = mkdtempSync(join(tmpdir(), "ceo190-crash-"));
mkdirSync(join(dir, "scripts", "qa"), { recursive: true });
for (const rel of ["src", "classic", "index.html", "about.html", "rules.html", "stats.html"]) {
  const from = join(ROOT, rel);
  if (!existsSync(from)) continue;
  cpSync(from, join(dir, rel), { recursive: true, filter: (s) => !SKIP.has(s.split(/[\\/]/).pop()) });
}
for (const f of ["analytics_consent_check.mjs", "_t206_gate_redproof.mjs"]) {
  cpSync(join(ROOT, "scripts", "qa", f), join(dir, "scripts", "qa", f));
}

const gate = join(dir, "scripts", "qa", "analytics_consent_check.mjs");
const mode = process.argv[2] || "syntax";
if (mode === "syntax") {
  writeFileSync(gate, readFileSync(gate, "utf8") + "\nthis is not javascript {{{\n");
} else if (mode === "earlyexit") {
  /* A subtler crash: the gate throws BEFORE any case runs, so exit is non-zero and no case printed. */
  writeFileSync(gate, 'throw new Error("boom");\n' + readFileSync(gate, "utf8"));
}
console.log(`  gate broken in the fake root (${mode}); running the harness copy inside it\n`);

const r = spawnSync(process.execPath, [join(dir, "scripts", "qa", "_t206_gate_redproof.mjs")],
  { cwd: dir, encoding: "utf8" });
console.log((r.stdout || "") + (r.stderr || ""));
console.log(`  harness exit = ${r.status}  (a CRASHING gate must NOT produce a green harness)`);
try { rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); } catch {}
