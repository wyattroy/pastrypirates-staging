/* A gate that exits 2, not 1.
 *
 * WHY IT EXISTS (architecture item 63, 2026-09-18). scripts/run_gates.mjs claims it exits with the
 * FAILING GATE'S OWN exit code rather than flattening everything to 1 — which matters in this suite,
 * where several gates use 2 to mean "I could not judge this" rather than "I judged it and it failed"
 * (a verdict reached with a dead instrument is not a pass, QA-PROCESS §2b).
 *
 * A case asserting `exit === 1` against fail_short.mjs cannot tell a runner that passes the code
 * through from one that flattens it — it returns the same answer on both sides of the fault, which is
 * decoration, not evidence. This fixture is the mutant-killer for that case.
 */
console.error("could not judge this");
process.exit(2);
