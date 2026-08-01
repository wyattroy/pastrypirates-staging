#!/usr/bin/env node
// scripts/determinism_baseline.js
//
// The determinism regression oracle for the v1.1 milestone (D-09). Every later phase in this
// milestone answers "did we break it?" by diffing against the corpus this tool captures and
// verifies. Its quality is the ceiling on Phases 8–12's safety.
//
// --capture   replays every seed, writes scripts/fixtures/determinism/seed-<seed>.jsonl plus
//             manifest.json, and asserts the corpus is non-empty and covers every required
//             mechanic before it lets the write count as a pass.
// --verify    (default when no flag is given) replays every seed fresh, hashes the result, and
//             compares against the committed manifest — the behavior oracle.
//
// Corpus: 30 base seeds, 12345-12374 (D-03), PLUS one explicit extra seed (14-04, EXTRA_SEEDS
// below) added to restore REQUIRED_EVENT_TYPES coverage for `shipwrecked` under the post-14-03
// engine (D-15/D-18/D-21 shifted the RNG stream and routing enough that none of the original 30
// seeds produces it any more — see docs/DETERMINISM-RERECORD.md Section 6a). The base 30 keep
// their original seedIndex (0..29) and personality rotation unchanged; the extra seed gets the
// next seedIndex (30) so its rotation is deterministic and documented by the same rule. Both
// `capture()` and `verify()` iterate base-range-then-extras in this fixed order. Each seed file
// ends with one extra "__final__" line (D-05) so the final-state snapshot participates in that
// seed's single SHA-256, rather than splitting the oracle across two files with two comparison
// mechanisms.

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { loadEngine } from "./lib/load_engine.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = path.join(__dirname, "fixtures", "determinism");
// Exported (08-05) — scripts/rebase_source_hash.js imports MANIFEST_PATH, playSeed, serializeSeed
// and hashBytes below to reuse verify()'s exact comparison-2 logic (fresh replay hashed and
// compared to manifest.perSeed[].sha256) rather than reimplementing a second, subtly-different
// copy of it. Adding `export` to existing declarations is the only change; behavior when this file
// runs standalone as `node determinism_baseline.js [--capture]` is unchanged (see file bottom).
export const MANIFEST_PATH = path.join(FIXTURES_DIR, "manifest.json");

// same personality roster / seeding convention real_game_test.js established
const SEED_BASE = 12345;
const BOT_STRATS = ["pirate", "trader", "balanced", "rusher", "monopolist"];
const SEED_COUNT = 30; // D-03: seeds 12345-12374 inclusive — the base contiguous range, unchanged

// 14-04 — one explicit extra seed appended after the base range to restore `shipwrecked`
// coverage under the post-14-03 engine. First-match over a bounded search (seeds 12375-12379,
// evaluated at seedIndex 30, the FIXED_SEED_INDEX every extra seed after the first would also
// use if more were ever added) — see docs/DETERMINISM-RERECORD.md Section 6a/6b for the search
// log. Not part of the base contiguous range; appended, never inserted, so the base 30's
// seedIndex (0..29) and personality rotation never shift.
const EXTRA_SEEDS = [12379];

// Every seed this corpus captures/verifies, in the fixed order capture()/verify() both use:
// base range first (seedIndex 0..SEED_COUNT-1), then EXTRA_SEEDS in array order (seedIndex
// SEED_COUNT, SEED_COUNT+1, ...).
function allSeedsWithIndex() {
  const out = [];
  for (let i = 0; i < SEED_COUNT; i++) out.push({ seed: SEED_BASE + i, seedIndex: i });
  EXTRA_SEEDS.forEach((seed, k) => out.push({ seed, seedIndex: SEED_COUNT + k }));
  return out;
}

// D-04 — mapped from the mechanics D-04 names to the engine's actual event-type strings. Do not
// remove an entry to make a capture pass; if one is genuinely absent, that's a finding to surface.
const REQUIRED_EVENT_TYPES = [
  "battle", "battleflee",  // battle
  "trade",                 // trade
  "dock",                  // dock
  "fish",                  // fish
  "windmove", "tradewind", "shipwrecked", // storm and wind
  "aground",                // run-aground
  "end", "bakeoff", "finish", // endgame
];

const mode = process.argv[2] === "--capture" ? "capture" : "verify";

function seedFile(seed) {
  return path.join(FIXTURES_DIR, `seed-${seed}.jsonl`);
}

function strategiesFor(i) {
  return [0, 1, 2, 3].map((s) => BOT_STRATS[(i + s) % BOT_STRATS.length]);
}

export function playSeed(Game, roundCfg, i, seed) {
  const strategies = strategiesFor(i);
  const cfg = roundCfg(strategies);
  const g = new Game(cfg, seed, true); // record=true — Game.ev() is a no-op otherwise
  g.play();
  return g;
}

// D-05 — final game state as the last JSONL line, fixed field order so serialization is stable.
function finalStateLine(g) {
  return {
    t: "__final__",
    winner: g.winner,
    round: g.round,
    players: g.players.map((p) => ({
      idx: p.idx,
      pos: [...p.pos],
      coins: p.coins,
      ing: [...p.ing],
      done: p.done,
    })),
  };
}

// Serialize one event per line, JSON.stringify with no replacer/indentation (D-06/D-07), plus the
// final-state line last. Key order comes from Game.ev()'s insertion order and is stable across
// runs of identical code.
export function serializeSeed(g) {
  const lines = g.events.map((e) => JSON.stringify(e));
  lines.push(JSON.stringify(finalStateLine(g)));
  return lines.join("\n") + "\n";
}

export function hashBytes(bytes) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

function truncateForDisplay(s) {
  if (s === undefined) return "<missing line>";
  return s.length > 160 ? s.slice(0, 160) + "…" : s;
}

async function capture() {
  const { Game, roundCfg, sourceHash } = await loadEngine();
  fs.mkdirSync(FIXTURES_DIR, { recursive: true });

  const perSeed = [];
  const coverage = {};
  for (const { seed, seedIndex } of allSeedsWithIndex()) {
    const g = playSeed(Game, roundCfg, seedIndex, seed);
    if (!g.events.length) {
      console.error(`FAIL capture: seed ${seed} produced zero events — record flag or extraction is suspect.`);
      process.exit(1);
    }
    for (const e of g.events) coverage[e.t] = (coverage[e.t] || 0) + 1;

    const bytes = serializeSeed(g);
    fs.writeFileSync(seedFile(seed), bytes);
    const sha256 = hashBytes(bytes);
    perSeed.push({ seed, file: path.basename(seedFile(seed)), events: g.events.length, sha256 });
    console.log(`  captured seed ${seed} — ${g.events.length} events`);
  }

  // Coverage assertion (D-04) — a corpus that silently under-covers a mechanic is worse than no
  // corpus at all: it produces green runs that prove nothing about that mechanic.
  const missing = REQUIRED_EVENT_TYPES.filter((t) => !(coverage[t] > 0));
  if (missing.length) {
    console.error(`\nFAIL capture: corpus does not cover required event type(s): ${missing.join(", ")}`);
    process.exit(1);
  }

  const manifest = {
    formatVersion: 1,
    capturedAt: new Date().toISOString(),
    seedBase: SEED_BASE,
    seedCount: SEED_COUNT,
    extraSeeds: EXTRA_SEEDS, // 14-04: appended after the base range, see file header comment
    botStrategies: BOT_STRATS,
    seatRotation: "BOT_STRATS[(seedIndex + seat) % BOT_STRATS.length] for seat in 0..3; base range is seedIndex 0..seedCount-1, extraSeeds continue the same index from seedCount",
    engineSourceHash: sourceHash,
    requiredEventTypes: REQUIRED_EVENT_TYPES,
    coverage,
    perSeed,
  };
  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + "\n");
  console.log(`\nWrote manifest.json (${perSeed.length} seeds, coverage OK).`);
  process.exit(0);
}

async function verify() {
  if (!fs.existsSync(MANIFEST_PATH)) {
    console.error(`FAIL verify: no manifest found at ${MANIFEST_PATH} — run --capture first.`);
    process.exit(1);
  }
  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8"));
  const { Game, roundCfg, sourceHash } = await loadEngine();

  let failures = 0;
  let behaviorMismatch = false; // comparison 2 (fresh replay) diverged for at least one seed
  let firstDivergenceSeed = null;

  manifest.perSeed.forEach((entry, i) => {
    const { seed, sha256: expectedSha256 } = entry;

    // Comparison 1: hash the stored .jsonl bytes against the manifest entry — detects a
    // corrupted or stale committed fixture (T-07-01).
    const storedPath = seedFile(seed);
    const storedExists = fs.existsSync(storedPath);
    const storedBytes = storedExists ? fs.readFileSync(storedPath, "utf8") : null;
    const storedHash = storedExists ? hashBytes(storedBytes) : null;
    const storedOk = storedExists && storedHash === expectedSha256;

    // Comparison 2: replay fresh, serialize identically, hash, compare to the same manifest
    // entry — the behavior oracle (Pitfall 3: never a whole-manifest diff). Always run this even
    // if comparison 1 already failed, so a corrupted *manifest entry* (as opposed to a corrupted
    // *fixture file*) still surfaces a located divergence rather than a bare "hash mismatch".
    const g = playSeed(Game, roundCfg, i, seed);
    const freshBytes = serializeSeed(g);
    const freshHash = hashBytes(freshBytes);
    const freshOk = freshHash === expectedSha256;

    const ok = storedOk && freshOk;
    console.log(
      `  ${(ok ? "PASS" : "FAIL").padEnd(5)} seed ${seed} fresh=${freshHash} stored=${storedExists ? storedHash : "<missing>"} want=${expectedSha256}`
    );

    if (!ok) {
      failures++;
      if (!freshOk) behaviorMismatch = true; // comparison 2 is the actual behavior oracle (D-11)

      // D-10 — print the first divergent seed/event index only, so a single run tells the reader
      // both how widespread the break is (every seed's PASS/FAIL above) and exactly where it
      // starts (this detail, for the first divergent seed).
      if (firstDivergenceSeed === null) {
        firstDivergenceSeed = seed;
        if (storedExists && storedBytes !== freshBytes) {
          const storedLines = storedBytes.split("\n").filter((l) => l.length > 0);
          const freshLines = freshBytes.split("\n").filter((l) => l.length > 0);
          const maxLen = Math.max(storedLines.length, freshLines.length);
          let divergentIndex = -1;
          for (let li = 0; li < maxLen; li++) {
            if (storedLines[li] !== freshLines[li]) {
              divergentIndex = li;
              break;
            }
          }
          console.log(`\n  DIVERGENCE — first mismatch at seed ${seed}, event index ${divergentIndex}:`);
          console.log(`    stored: ${truncateForDisplay(storedLines[divergentIndex])}`);
          console.log(`    fresh:  ${truncateForDisplay(freshLines[divergentIndex])}\n`);
        } else {
          // Committed fixture and fresh replay agree with each other byte-for-byte, but neither
          // matches manifest.perSeed[i].sha256 — the manifest entry itself is stale/corrupted,
          // not the underlying data.
          console.log(
            `\n  DIVERGENCE — first mismatch at seed ${seed}, event index -1 (no line differs; ` +
              `stored fixture and fresh replay agree with each other — the manifest's recorded ` +
              `sha256 is stale or corrupted, not the underlying content).\n`
          );
        }
      }
    }
  });

  // Comparison 3 (D-11): engine source hash — diagnostic classification only, never drives exit
  // code. Phase 8 relocates the engine source while keeping behavior byte-identical; a gate here
  // would make Phase 8's own success condition unreachable.
  const sourceMoved = manifest.engineSourceHash && sourceHash !== manifest.engineSourceHash;
  if (!behaviorMismatch && !sourceMoved) {
    console.log("  SOURCE: unchanged — hashes match and engine source hash matches.");
  } else if (!behaviorMismatch && sourceMoved) {
    console.log(
      "  SOURCE: moved, behavior identical — event hashes match but engineSourceHash differs " +
        "(expected once Phase 8 relocates the engine source)."
    );
  } else {
    console.log("  SOURCE: behavior changed — event hashes differ; engineSourceHash is diagnostic only.");
  }

  console.log(`\n${failures === 0 ? "All seeds passed." : failures + " seed(s) FAILED."}`);
  process.exit(failures === 0 ? 0 : 1);
}

// Guarded (08-05) so `import { playSeed, serializeSeed, hashBytes, MANIFEST_PATH } from
// "./determinism_baseline.js"` (scripts/rebase_source_hash.js does exactly this) does not also
// trigger a full verify() run as a side effect of the import — only run capture()/verify() when
// this file is the actual entry point, exactly as before for every existing caller
// (`node scripts/determinism_baseline.js [--capture]`).
if (import.meta.url === `file://${process.argv[1]}`) {
  if (mode === "capture") {
    await capture();
  } else {
    await verify();
  }
}
