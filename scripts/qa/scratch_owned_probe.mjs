// DEAD SCRATCH — emptied, not deleted, because this session's sandbox refuses `rm` on a file it
// created (third measurement of that fence; see CTO-LEDGER 2026-09-03T02:09Z watch).
//
// What it measured, watch 2026-09-03T02:2xZ: the strict handle regex in
// `chart_sweep_conserves_check.mjs` against the shared `idOfRow` reader in
// `scripts/wyclau/lib/chart_model.mjs`, on HEAD's Chart and on the live one.
// RESULT: 50 owned, max T-128, IDENTICAL on both files. The "stale private regex" theory was WRONG
// and the fix built on it was reverted. Kept as a pointer so the theory is not re-run.
export {};
