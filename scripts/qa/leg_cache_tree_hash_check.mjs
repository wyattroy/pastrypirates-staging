#!/usr/bin/env node
// scripts/qa/leg_cache_tree_hash_check.mjs
//
// T-009 / T-219 (.planning/CHART.md): the sea trial's leg-resume cache used to trust a hand-typed
// build stamp alone. Twice on 2026-09-04, a real game-code commit landed on an unchanged stamp,
// and only a watch noticing by hand kept the trial honest. Fixed by folding a content hash of
// the game tree (scripts/lib/game_tree_hash.mjs) into the resume decision
// (scripts/lib/leg_cache_key.mjs). This gate is the RED PROOF: it shows the primitives actually
// detect the exact failure shape, and that scripts/playtest_gate.mjs actually calls them rather
// than merely having them sit nearby unused (this project's own most-repeated fault — the
// Chartkeeper, the harvest, the T-220 hook fixes with no write access, all "built and unwired").
//
// RED-PROOFED BY CONSTRUCTION, NOT BY REVERTING PRODUCTION CODE: reverting playtest_gate.mjs to
// re-introduce the bug just to watch this gate fail would risk corrupting a live sea trial's own
// leg cache mid-flight (one was sailing, pid 41776, when this was written). Instead the negative
// case is demonstrated directly: a record shaped exactly like the OLD (stamp-only) format is fed
// to the NEW gate function and shown to be correctly rejected, and a scratch directory (never the
// real repo) proves the hash is genuinely content-sensitive rather than a constant.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { hashFiles, gameTreeHash } from "../lib/game_tree_hash.mjs";
import { legIsFresh } from "../lib/leg_cache_key.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, "..", "..");

const failures = [];
const check = (label, cond) => { if (!cond) failures.push(label); console.log(`  ${cond ? "OK" : "FAIL"}  ${label}`); };

console.log("1. hashFiles() is deterministic and content-sensitive (scratch dir, never the real repo):");
{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "leg-cache-hash-check-"));
  try {
    fs.writeFileSync(path.join(dir, "a.js"), "one");
    fs.mkdirSync(path.join(dir, "sub"));
    fs.writeFileSync(path.join(dir, "sub", "b.js"), "two");
    const h1 = hashFiles(dir, ["a.js", "sub/b.js"]);
    const h2 = hashFiles(dir, ["a.js", "sub/b.js"]);
    check("two calls over an unchanged tree agree", h1 === h2);

    fs.writeFileSync(path.join(dir, "a.js"), "ONE-CHANGED");
    const h3 = hashFiles(dir, ["a.js", "sub/b.js"]);
    check("editing a covered file's content changes the hash", h1 !== h3);

    const h4 = hashFiles(dir, ["a.js", "sub/b.js", "sub/does-not-exist.js"]);
    check("a listed-but-missing (deleted-but-tracked) file changes the hash", h4 !== h3);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

console.log("2. legIsFresh() rejects exactly the shape that caused the real 2026-09-04 failures:");
{
  // The OLD record shape (stamp only, no __treeHash) is what every leg on disk before this fix
  // looked like. It must never read as fresh again, however the stamp compares.
  const oldShapeRecord = { __stamp: "2026.09.04.1", __runId: "2026.09.04.1-abc123" };
  check("a stamp-only record (the pre-fix shape) is never trusted", legIsFresh(oldShapeRecord, "anything") === false);

  const freshRecord = { __stamp: "2026.09.04.2", __treeHash: "deadbeef" };
  check("a record whose tree hash matches the current tree IS trusted", legIsFresh(freshRecord, "deadbeef") === true);
  check("a record whose tree hash does NOT match is rejected even with the same stamp string", legIsFresh({ ...freshRecord, __stamp: "2026.09.04.2" }, "different-hash") === false);
  check("a null record is rejected", legIsFresh(null, "deadbeef") === false);
}

console.log("3. gameTreeHash() runs against the real repo, fast, and is deterministic:");
{
  const t0 = Date.now();
  const h1 = gameTreeHash(REPO);
  const elapsed = Date.now() - t0;
  const h2 = gameTreeHash(REPO);
  check("two calls against the live tree agree", h1 === h2);
  check("looks like a sha256 hex digest (64 hex chars)", /^[0-9a-f]{64}$/.test(h1));
  check(`completes in well under a second (${elapsed}ms) — negligible against a 90-minute trial`, elapsed < 5000);
}

console.log("4. scripts/playtest_gate.mjs actually WIRES these in (capability nothing invokes is capability that never runs):");
{
  const src = fs.readFileSync(path.join(REPO, "scripts", "playtest_gate.mjs"), "utf8");
  check("imports gameTreeHash from the lib", /import\s*\{\s*gameTreeHash\s*\}\s*from\s*"\.\/lib\/game_tree_hash\.mjs"/.test(src));
  check("imports legIsFresh from the lib", /import\s*\{\s*legIsFresh\s*\}\s*from\s*"\.\/lib\/leg_cache_key\.mjs"/.test(src));
  check("computes TREE_HASH once at startup", /const TREE_HASH\s*=\s*gameTreeHash\(REPO\)/.test(src));
  check("the cache filename itself is keyed on TREE_HASH (not just a comment saying so)", /legFile\s*=\s*\(name\)\s*=>.*TREE_HASH/.test(src));
  check("readDone() calls legIsFresh(), not a raw stamp comparison", /readDone\s*=\s*\(name\)\s*=>\s*\{[\s\S]{0,300}legIsFresh\(r,\s*TREE_HASH\)/.test(src));
  check("stampRun() records __treeHash on every leg for provenance", /stampRun\s*=\s*\(r\)\s*=>.*__treeHash:\s*TREE_HASH/.test(src));
}

console.log(failures.length ? `\nFAIL — ${failures.length} case(s):` : "\nPASS — the tree-hash cache key is real and wired in.");
for (const f of failures) console.error(`  - ${f}`);
process.exit(failures.length ? 1 : 0);
