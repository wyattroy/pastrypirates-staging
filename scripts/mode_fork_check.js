// scripts/mode_fork_check.js — the machine half of Wyatt's design principle.
//
// Wyatt, 2026-08-26: "Each mode should be structurally different just about who the player is
// playing against, but the game itself should remain consistent for every player in every mode...
// I'm just really feeling burned by past sessions with you where you have branched the modes in
// places where they didn't need to be forked. And as a result, players of different modes see
// different things, which is not what we want."
//
// WHAT A FORK IS. A conditional on WHO IS PLAYING — isHost, amHost, passAndPlay, mySeat, seatLocal,
// decisionIsLocal — sitting inside a file whose job is to DRAW. In the orchestration those are
// sanctioned (CLAUDE.md rule 23: host/guest decides who COMPUTES and who CREATES THE ROOM). In a
// renderer they are how two captains end up looking at different games.
//
// A FIRST COUNT SAID 85 AND IT WAS WRONG — it counted comment lines. This strips comments before
// counting, deliberately: a comment EXPLAINING a fork is documentation, and a gate that punished
// it would delete the explanations. The real debt is 59.
//
// WHY A RATCHET AND NOT A BAN. There are 59 of these in the drawing files today. A gate that fails
// 85 times on the day it ships is a gate everyone learns to skip — which is the exact fate of the
// parity gate that declared localAsk an acceptable gap and stayed green for months. So this freezes
// the CURRENT count per file and fails only when a number RISES. A new fork cannot be added
// quietly; the existing ones are a debt with a number on it, and the number should fall.
//
// Same shape as gate_citation_check's UNGATED-IN-4 count, and for the same reason: a debt you can
// see shrinks, a debt you cannot see grows.
//
// WHEN YOU LEGITIMATELY REMOVE ONE, LOWER THE BASELINE IN THE SAME COMMIT. The gate says so when it
// notices a count has fallen — leaving the old number would quietly re-open the room you just shut.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/* A conditional on who is playing. Deliberately NOT matching comments — a comment explaining a fork
   is documentation, and punishing it would delete the explanations. */
const FORK = /\b(isHost|amHost|passAndPlay|mySeat|seatLocal|decisionIsLocal)\b/;

/* THE BASELINE — measured 2026-08-26. These are files whose job is to DRAW.
   orchestrator.js is deliberately absent: it is where "who computes and who creates the room"
   legitimately lives (rule 23), and counting it would train the reader to ignore this gate. */
const BASELINE = {
  "src/ui/audio.js":  0,
  "src/ui/board.js":  3,
  "src/ui/flow.js":  13,
  "src/ui/lobby.js":  5,
  "src/ui/panel.js":  7,
  "src/ui/stage.js":  9,
  "src/ui/util.js":  22,
  "index.html":       0,
};

const strip = src => src
  .replace(/\/\*[\s\S]*?\*\//g, "")            // block comments
  .split("\n").map(l => l.replace(/\/\/.*$/, "")).join("\n");   // line comments

let failed = false, total = 0, baseTotal = 0;
const rows = [];

for (const [rel, allowed] of Object.entries(BASELINE)) {
  const full = path.join(REPO, rel);
  if (!fs.existsSync(full)) { console.log(`FAIL ${rel} — file is missing; the baseline names it`); failed = true; continue; }
  const lines = strip(fs.readFileSync(full, "utf8")).split("\n");
  const hits = lines.map((l, i) => ({ l: l.trim(), n: i + 1 })).filter(o => FORK.test(o.l));
  total += hits.length; baseTotal += allowed;
  rows.push({ rel, count: hits.length, allowed, hits });
}

console.log("MODE FORKS in the files that DRAW — a conditional on WHO IS PLAYING\n");
for (const r of rows) {
  const verdict = r.count > r.allowed ? "ROSE" : r.count < r.allowed ? "fell" : "held";
  console.log(`  ${r.rel.padEnd(22)} ${String(r.count).padStart(3)} / ${String(r.allowed).padStart(3)} allowed   ${verdict}`);
  if (r.count > r.allowed) {
    failed = true;
    console.log(`      ${r.count - r.allowed} NEW fork(s). Every one of these is a place two captains can see different games:`);
    for (const h of r.hits.slice(-(r.count - r.allowed))) console.log(`        ${r.rel}:${h.n}  ${h.l.slice(0, 90)}`);
  }
  if (r.count < r.allowed) {
    console.log(`      good — ${r.allowed - r.count} fewer than the baseline. LOWER THE BASELINE IN THIS COMMIT,`);
    console.log(`      or you have quietly re-opened room for the fork you just removed.`);
  }
}

console.log(`\n  total ${total}, baseline ${baseTotal} — this is a DEBT and it should fall.`);
console.log(`  (orchestrator.js is excluded on purpose: "who computes and who creates the room" is`);
console.log(`   sanctioned there by CLAUDE.md rule 23. Drawing is not.)`);

if (failed) { console.log("\nFAILED — a mode fork was added to code that draws.\n"); process.exit(1); }
console.log("\nPASS no new mode forks in the drawing code.\n");
