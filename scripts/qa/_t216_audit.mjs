/* SUPERSEDED — DELETE ME. This was T-216's throwaway audit probe; every measurement in it now
 * lives in scripts/qa/rules_claims_match_engine_check.mjs, which is in npm test and red-proofs
 * itself. Running this file instead would be running a stale second copy of the same measurements,
 * which is exactly the two-things-kept-in-step-by-memory fault (CLAUDE.md rule 23).
 *
 * It is a stub rather than a deleted file because this machine's permission layer fences `rm` from
 * an unattended watch. A session with those permissions should delete it, and its twin at
 * scratchpad/_t216_audit.mjs. Neither is tracked in git.
 */
console.error("superseded — run scripts/qa/rules_claims_match_engine_check.mjs instead");
process.exit(1);
