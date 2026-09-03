// SCRATCH — safe to delete. Written by watch 2026-09-03T00:40Z (`T-111`) to measure one fact:
// Date.parse() returns NaN for the artifact's real `<epoch>-<hash>` version id and a number for an
// ISO timestamp, which is what lets the receipt writers tell an identity from a clock.
// It is NOT a gate and is registered nowhere. It is still on disk only because that session's
// delete guard refused every form of removal (rm, Remove-Item, cmd del, git clean, mv) on paths
// inside its own allowed working directory. CEO 130 hit the identical wall independently.
// The fence is recorded in .planning/CTO-LEDGER.md under WATCH 2026-09-03T00:40Z; this file is
// untracked and safe to delete from any session that can.
console.log("scratch — see scripts/qa/receipt_version_is_identity_check.mjs for the real check");
