#!/usr/bin/env node
// scripts/determinism_diff.js
//
// D-26's replacement for D-16's "confirm the differences are only storm-related" criterion.
// verify() (scripts/determinism_baseline.js:150-241) reports only the FIRST divergent seed and
// the first divergent event within it — that is not enough evidence to safely re-record a corpus
// that is expected to diverge on purpose (D-18's leeward wind-shadow fix cascades into bot
// routing, which cascades into dock/trade/fish/battle events). This tool walks EVERY seed and
// EVERY divergent line inside each one, to the end, tagging every divergence with its event `t`,
// `round`, `storm` flag, and the exact set of JSON keys whose values differ — so a human (or an
// automated gate) can scan the full list and confirm each divergence is explainable, rather than
// stopping at the first one and hoping the rest are the same story.
//
// --assert-clean       exits 1 if ANY seed diverges from the committed corpus, 0 otherwise. This
//                       is the tool's own fail-first proof (run it against an unchanged engine
//                       first — it must report zero divergent seeds) and its ongoing regression use.
// --ignore-keys=k1,k2  seeds the additive-only set: a divergent line is additive-only (not
//                       structural) when every key that differs is in this set — separates "a new
//                       key showed up" from "an existing key's value actually changed".
// --json               emits the full report as one JSON object on stdout.
// (default)            prints the human-readable report and exits 0.
//
// Reuses determinism_baseline.js's exports rather than reimplementing its comparison logic — see
// that file's own header at :27-31 for why this reuse pattern exists (scripts/rebase_source_hash.js
// established the precedent).

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { MANIFEST_PATH, playSeed, serializeSeed } from "./determinism_baseline.js";
import { loadEngine } from "./lib/load_engine.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = path.join(__dirname, "fixtures", "determinism");

function seedFile(seed) {
  return path.join(FIXTURES_DIR, `seed-${seed}.jsonl`);
}

// Mirrors determinism_baseline.js:98-101's 160-char truncation shape, applied per differing key
// value rather than to a whole serialized line.
function truncateForDisplay(v) {
  if (v === undefined) return "<absent>";
  const s = typeof v === "string" ? v : JSON.stringify(v);
  return s.length > 160 ? s.slice(0, 160) + "…" : s;
}

function parseArgs(argv) {
  const assertClean = argv.includes("--assert-clean");
  const json = argv.includes("--json");
  const ignoreArg = argv.find((a) => a.startsWith("--ignore-keys="));
  const ignoreKeys = new Set(
    ignoreArg ? ignoreArg.slice("--ignore-keys=".length).split(",").filter(Boolean) : []
  );
  return { assertClean, json, ignoreKeys };
}

// For one seed: split the committed fixture and a fresh replay into JSONL lines exactly as
// verify() does (storedBytes.split("\n").filter(l=>l.length>0), determinism_baseline.js:197-198),
// then walk EVERY line to the end of the longer array — never break at the first mismatch. That
// non-stopping walk is this tool's entire reason to exist.
function diffOneSeed(seed, storedBytes, freshBytes, ignoreKeys) {
  const storedLines = storedBytes.split("\n").filter((l) => l.length > 0);
  const freshLines = freshBytes.split("\n").filter((l) => l.length > 0);
  const maxLen = Math.max(storedLines.length, freshLines.length);

  const divergentLines = [];
  const keyDelta = {};
  const typeDelta = {};
  let firstStructuralIndex = -1;
  let firstStormEventIndex = -1;

  for (let li = 0; li < maxLen; li++) {
    const storedRaw = storedLines[li];
    const freshRaw = freshLines[li];

    // This seed's own fresh run tells us when the storm mechanic actually fired this
    // playthrough — independent of whether this particular line diverges from the old fixture.
    if (firstStormEventIndex === -1 && freshRaw !== undefined) {
      const freshEvt = JSON.parse(freshRaw);
      if (freshEvt.storm === true) firstStormEventIndex = li;
    }

    if (storedRaw === freshRaw) continue; // identical (including both undefined) — not a divergence

    // A missing side is null (D-01's spec for this tool), not a JSON.parse crash on undefined.
    const storedObj = storedRaw !== undefined ? JSON.parse(storedRaw) : null;
    const freshObj = freshRaw !== undefined ? JSON.parse(freshRaw) : null;

    const allKeys = new Set([
      ...(storedObj ? Object.keys(storedObj) : []),
      ...(freshObj ? Object.keys(freshObj) : []),
    ]);
    const keys = [];
    for (const key of [...allKeys].sort()) {
      const storedVal = storedObj ? storedObj[key] : undefined;
      const freshVal = freshObj ? freshObj[key] : undefined;
      if (JSON.stringify(storedVal) === JSON.stringify(freshVal)) continue;
      keys.push({ key, stored: truncateForDisplay(storedVal), fresh: truncateForDisplay(freshVal) });
      keyDelta[key] = (keyDelta[key] || 0) + 1;
    }

    // Additive-only (every differing key is in --ignore-keys) vs. structural (anything else).
    const structural = keys.some((k) => !ignoreKeys.has(k.key));
    if (structural && firstStructuralIndex === -1) firstStructuralIndex = li;

    const storedT = storedObj ? storedObj.t : null;
    const freshT = freshObj ? freshObj.t : null;
    const typeKey = freshT ?? storedT ?? "<missing>";
    typeDelta[typeKey] = (typeDelta[typeKey] || 0) + 1;

    divergentLines.push({
      seed,
      li,
      storedT,
      freshT,
      round: (freshObj ? freshObj.round : undefined) ?? (storedObj ? storedObj.round : undefined) ?? null,
      storm: (freshObj ? freshObj.storm : undefined) ?? (storedObj ? storedObj.storm : undefined) ?? null,
      structural,
      keys,
    });
  }

  // D-26's replacement criterion, made runnable: does any STRUCTURAL divergence precede the first
  // storm event in this seed's own fresh run?
  const preStormStructuralDivergence =
    firstStructuralIndex >= 0 && (firstStormEventIndex < 0 || firstStructuralIndex < firstStormEventIndex);

  return {
    seed,
    divergentLines,
    divergentLineCount: divergentLines.length,
    firstStructuralIndex,
    firstStormEventIndex,
    preStormStructuralDivergence,
    keyDelta,
    typeDelta,
  };
}

export async function diffAllSeeds(opts = {}) {
  const ignoreKeys = opts.ignoreKeys instanceof Set ? opts.ignoreKeys : new Set(opts.ignoreKeys || []);

  if (!fs.existsSync(MANIFEST_PATH)) {
    console.error(`FAIL diff: no manifest found at ${MANIFEST_PATH} — run --capture first.`);
    process.exit(1);
  }
  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8"));
  const { Game, roundCfg } = await loadEngine();

  const seeds = [];
  const byEventType = {};
  const byKey = {};
  let divergentSeeds = 0;
  let structuralDivergentSeeds = 0;
  let preStormStructuralFailures = 0;

  manifest.perSeed.forEach((entry, i) => {
    const { seed } = entry;
    const storedPath = seedFile(seed);
    if (!fs.existsSync(storedPath)) {
      console.error(`FAIL diff: missing committed fixture for seed ${seed} at ${storedPath}.`);
      process.exit(1);
    }
    const storedBytes = fs.readFileSync(storedPath, "utf8");
    const g = playSeed(Game, roundCfg, i, seed);
    const freshBytes = serializeSeed(g);

    const seedReport = diffOneSeed(seed, storedBytes, freshBytes, ignoreKeys);
    seeds.push(seedReport);
    if (seedReport.divergentLineCount > 0) divergentSeeds++;
    if (seedReport.firstStructuralIndex >= 0) structuralDivergentSeeds++;
    if (seedReport.preStormStructuralDivergence) preStormStructuralFailures++;
    for (const [t, c] of Object.entries(seedReport.typeDelta)) byEventType[t] = (byEventType[t] || 0) + c;
    for (const [k, c] of Object.entries(seedReport.keyDelta)) byKey[k] = (byKey[k] || 0) + c;
  });

  return {
    seeds,
    summary: {
      divergentSeeds,
      structuralDivergentSeeds,
      preStormStructuralFailures,
      byEventType,
      byKey,
    },
  };
}

function printHumanReport(report) {
  for (const s of report.seeds) {
    const tag = s.divergentLineCount === 0 ? "PASS" : "FAIL";
    console.log(
      `  ${tag.padEnd(5)} seed ${s.seed} divergentLines=${s.divergentLineCount} ` +
        `firstStructuralIndex=${s.firstStructuralIndex} firstStormEventIndex=${s.firstStormEventIndex} ` +
        `preStormStructuralDivergence=${s.preStormStructuralDivergence}`
    );
    for (const line of s.divergentLines) {
      console.log(
        `    li=${line.li} round=${line.round} storm=${line.storm} storedT=${line.storedT} ` +
          `freshT=${line.freshT} structural=${line.structural}`
      );
      for (const k of line.keys) {
        console.log(`      key=${k.key} stored=${k.stored} fresh=${k.fresh}`);
      }
    }
  }
  console.log(
    `\nSummary: divergentSeeds=${report.summary.divergentSeeds}/${report.seeds.length} ` +
      `structuralDivergentSeeds=${report.summary.structuralDivergentSeeds} ` +
      `preStormStructuralFailures=${report.summary.preStormStructuralFailures}`
  );
  console.log(`  byEventType: ${JSON.stringify(report.summary.byEventType)}`);
  console.log(`  byKey: ${JSON.stringify(report.summary.byKey)}`);
}

async function main() {
  const { assertClean, json, ignoreKeys } = parseArgs(process.argv.slice(2));
  const report = await diffAllSeeds({ ignoreKeys });

  if (json) {
    console.log(JSON.stringify(report));
    process.exit(0);
  }

  if (assertClean) {
    if (report.summary.divergentSeeds > 0) {
      console.error(
        `FAIL --assert-clean: ${report.summary.divergentSeeds} seed(s) diverged from the committed corpus.`
      );
      process.exit(1);
    }
    console.log("PASS --assert-clean: 0 seeds diverged from the committed corpus.");
    process.exit(0);
  }

  printHumanReport(report);
  process.exit(0);
}

// Guarded exactly like determinism_baseline.js:248 so this file can also be imported (e.g. by a
// future test script wanting diffAllSeeds directly) without triggering a full run as a side effect.
if (import.meta.url === `file://${process.argv[1]}`) {
  await main();
}
