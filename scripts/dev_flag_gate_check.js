#!/usr/bin/env node
// scripts/dev_flag_gate_check.js
//
// NO URL A PLAYER CAN TYPE MAY SKIP THE VOYAGE OR OPEN A TUNING PANEL.
//
// That is Phase 6 criterion 4, and until this gate it was kept by hand. The cutover (2026-08-26)
// turned this tree from a /4 dev preview into the front door, and `devHost()` in
// src/shared/index.js became the ONE gate every dev flag hangs off. Nothing checked that a new
// flag remembered to hang off it — and W0-1 adds two more flags whose whole purpose is to skip
// the voyage, so the number of ways to get this wrong just went up.
//
// STRICT BY DEFAULT, exactly like scripts/qa/gear.mjs decides what counts as game code: EVERY
// `location.search.indexOf("x=1")` found in src/ must sit on a line that also names devHost(),
// unless it is in UNGATED below with a reason. A hand-kept list of what to GUARD rots exactly like
// the thing it guards; a hand-kept list of what to EXCUSE is short, and each entry has to argue
// for itself.
//
// It also pins the hostnames themselves, because "widen devHost() to include staging" is one
// character away from "widen devHost() to include production".
//
// House convention: no test runner, one PASS/FAIL line per case, every case runs before exit.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let fails = 0;
const ok  = (m) => console.log("  PASS  " + m);
const bad = (m) => { fails++; console.log("  FAIL  " + m); };

// Flags that may be ungated, each with the reason it cannot hand a player a shortcut.
const UNGATED = {
  "bakeoff": "an A/B switch between two complete rulesets — neither one skips anything",
  "wind":    "same: turns the wind prototype on/off, both states are a whole playable game",
  "usage":   "opt out of usage pings; a privacy control, not a shortcut",
};

/* ---------- 1. devHost() answers correctly, hostname by hostname ---------- */
console.log("\ndevHost() — who is a developer's machine?");
const shared = await import(path.join(ROOT, "src/shared/index.js"));
const EXPECT = [
  ["localhost", true], ["127.0.0.1", true], ["0.0.0.0", true], ["", true], ["mac.local", true],
  ["staging.playpastrypirates.com", true],   // Wyatt plays work-in-progress here (2026-08-27)
  ["playpastrypirates.com", false],          // real players. NEVER.
  ["www.playpastrypirates.com", false],
  ["playpastrypirates.com.evil.example", false],  // suffix games must not pass
];
for (const [host, want] of EXPECT) {
  globalThis.location = { hostname: host, search: "" };
  const got = shared.devHost();
  const label = `${(host || "(empty)").padEnd(32)} -> ${got}`;
  got === want ? ok(label) : bad(`${label}  (expected ${want})`);
}

/* ---------- 2. every dev flag in src/ hangs off devHost() ---------- */
console.log("\nEvery ?flag=1 in src/ is behind devHost(), or excused by name");
const files = [];
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.name.endsWith(".js")) files.push(p);
  }
})(path.join(ROOT, "src"));

let found = 0;
for (const file of files) {
  const rel = path.relative(ROOT, file);
  fs.readFileSync(file, "utf8").split("\n").forEach((line, i) => {
    if (line.trim().startsWith("//") || line.trim().startsWith("*")) return;
    const m = [...line.matchAll(/location\.search\.indexOf\("([a-z0-9]+)=1"\)/g)];
    for (const [, flag] of m) {
      found++;
      const where = `${rel}:${i + 1}  ?${flag}=1`;
      if (UNGATED[flag]) ok(`${where}  — ungated on purpose: ${UNGATED[flag]}`);
      else if (line.includes("devHost()")) ok(`${where}  — behind devHost()`);
      else bad(`${where}  — NOT behind devHost(). A player could type this.`);
    }
  });
}
if (!found) bad("no ?flag=1 sites found at all — this check is pointed at the wrong tree");

/* ---------- 3. the two endgame skips W0-1 asked for actually exist ---------- */
console.log("\nThe endgame skips exist and are gated");
for (const flag of ["bake2", "endcard"]) {
  const hit = files.some(f => fs.readFileSync(f, "utf8").includes(`"${flag}=1"`));
  hit ? ok(`?${flag}=1 is implemented`) : bad(`?${flag}=1 is missing — W0-1 is not done`);
}

console.log(fails ? `\nFAIL — ${fails} problem(s)\n` : "\nPASS — no URL a player can type skips the voyage\n");
process.exit(fails ? 1 : 0);
