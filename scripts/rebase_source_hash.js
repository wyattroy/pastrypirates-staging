#!/usr/bin/env node
// scripts/rebase_source_hash.js
//
// Why this file exists (D-01/D-02): scripts/determinism_baseline.js --capture is the ONLY other
// write path to scripts/fixtures/determinism/manifest.json, and it replays and re-hashes all 30
// seeds as a side effect of writing anything. Using --capture "just to fix" a stale
// engineSourceHash would silently rewrite every frozen per-seed sha256 too — quietly redefining
// the oracle as "whatever the moved code now does", which is D-01's forbidden failure mode,
// arrived at by accident rather than intent. This tool exists to remove that temptation: it
// touches exactly one manifest field (engineSourceHash), and only after confirming every seed's
// fresh replay still matches its already-frozen hash. A future reader who doesn't know this
// history will reach for --capture to fix a stale source hash, and will be wrong — use this
// script instead.
//
// No flags. Exits 0 on a successful, gated re-base. Exits 1 — and leaves manifest.json completely
// untouched — if the gate finds any seed's fresh replay diverges from its frozen hash (naming the
// seed). Re-basing a hash while the corpus is red would bless broken code, so the gate always
// runs, and always runs first.

import fs from "node:fs";
import { loadEngine } from "./lib/load_engine.js";
import { MANIFEST_PATH, playSeed, serializeSeed, hashBytes } from "./determinism_baseline.js";

async function main() {
  if (!fs.existsSync(MANIFEST_PATH)) {
    console.error(`FAIL rebase: no manifest found at ${MANIFEST_PATH} — run --capture first (that is a fresh corpus, not a rebase).`);
    process.exit(1);
  }

  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8"));
  const { Game, roundCfg, sourceHash: freshSourceHash } = await loadEngine();

  // The gate — reuses verify()'s exact comparison-2 logic (fresh replay hashed and compared to
  // the frozen manifest.perSeed[].sha256) via the imports above, rather than reimplementing a
  // second, subtly-different copy of the oracle's core comparison. Every seed is checked before
  // any decision is made, so a run that fails still reports every divergent seed, not just the
  // first.
  const divergentSeeds = [];
  manifest.perSeed.forEach((entry, i) => {
    const { seed, sha256: expected } = entry;
    const g = playSeed(Game, roundCfg, i, seed);
    const fresh = hashBytes(serializeSeed(g));
    if (fresh !== expected) {
      divergentSeeds.push({ seed, fresh, expected });
    }
  });

  if (divergentSeeds.length) {
    console.error("FAIL rebase: refusing to re-base engineSourceHash — the following seed(s) diverged from their frozen hash:");
    for (const d of divergentSeeds) {
      console.error(`  seed ${d.seed}: fresh=${d.fresh} want=${d.expected}`);
    }
    console.error("\nBehaviour changed. The source hash was NOT touched. Fix the code, not the fixture — run");
    console.error("node scripts/determinism_baseline.js --verify for the full divergence report.");
    process.exit(1);
  }

  // The write — surgical. Mutate the single field on the already-parsed object; never rebuild the
  // manifest. Every other field (formatVersion, capturedAt, seedBase, seedCount, botStrategies,
  // seatRotation, requiredEventTypes, coverage, perSeed) is left byte-identical by construction,
  // because nothing but this one property assignment touches `manifest` before it is written back
  // with the same serialization capture() uses. This one-field mutation is precisely the
  // difference between this tool and capture(), which rebuilds the whole object from scratch.
  const before = manifest.engineSourceHash;
  manifest.engineSourceHash = freshSourceHash;
  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + "\n");

  console.log(`All ${manifest.perSeed.length} seed(s) matched their frozen hash on fresh replay — gate passed.`);
  console.log(`engineSourceHash: ${before}`);
  console.log(`               -> ${freshSourceHash}`);
  process.exit(0);
}

await main();
