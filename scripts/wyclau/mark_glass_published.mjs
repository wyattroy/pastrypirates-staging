#!/usr/bin/env node
// VENDORED FROM claude-kit (plugins/wyclau) — edit THERE, not here. Re-vendor: `bash install.sh vendor <repo> wyclau` from claude-kit. Drift is caught by scripts/qa/vendor_check.mjs.
// scripts/wyclau/mark_glass_published.mjs
//
// Run this immediately after the Artifact tool call that publishes the Glass succeeds. A plain
// node script cannot call the Artifact tool itself (only a live session can), so this is the other
// half of "make publishing part of pulsing": it records that a publish REALLY happened, so the
// publish-lag brake in .claude/hooks/wyclau-stop-keep-working.cjs (moved there from npm test by
// CEO Review 52 -- it must never gate the game's own release) can tell a published pulse from one
// that only updated the local file and stopped.
//
// LAST-PUBLISH is local and gitignored, same as HEARTBEAT — per-machine by nature.

import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const WY = join(ROOT, ".planning", "wyclau");
const LAST_PUBLISH = join(WY, "LAST-PUBLISH");

const nowIso = new Date().toISOString();
mkdirSync(WY, { recursive: true });
writeFileSync(LAST_PUBLISH, `${nowIso}\tGlass published\n`);
console.log(`LAST-PUBLISH stamped ${nowIso}`);
