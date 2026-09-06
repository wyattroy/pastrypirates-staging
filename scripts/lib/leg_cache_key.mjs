// scripts/lib/leg_cache_key.mjs
//
// WHETHER A CACHED SEA-TRIAL LEG RECORD IS STILL TRUSTWORTHY — pulled out of
// scripts/playtest_gate.mjs so the resume decision can be tested without a browser.
//
// T-009 / T-219 (.planning/CHART.md): a record used to be trusted on the hand-typed build
// stamp alone. Four real game-code commits landed on one unchanged stamp in a single day
// (2026-09-04) and each one would have been silently resumed rather than re-sailed had a
// watch not noticed and bumped the stamp by hand first. The tree hash (scripts/lib/game_tree_hash.mjs)
// is DERIVED (CLAUDE.md rule 9), so nobody has to remember anything for this to stay safe.

/** A cached leg record may be reused only if it was produced against the EXACT game tree this
 *  run is about to sail — not merely the same build stamp, which is a number a human bumps. */
export function legIsFresh(record, currentTreeHash) {
  return !!record && record.__treeHash === currentTreeHash;
}
