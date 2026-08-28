/* legVerdictLine(r) — HOW ONE LEG OF THE SEA TRIAL IS REPORTED, in one place.
 *
 * Extracted 2026-08-27 because it was inline in playtest_gate.mjs and printed this, in the same
 * report that correctly listed both legs under "voyages that did NOT run":
 *     == solo-desktop-wk: PASS (voyage incomplete)
 * The rule was "no findings means PASS", and a leg that never started has no findings. So the one
 * instrument built to keep NOT-RUN distinct from PASS was itself collapsing them.
 *
 * NOT RUN IS ITS OWN OUTCOME AND IT IS CHECKED FIRST. It is not a pass and it is not a failure —
 * a failure is something the leg found, and a leg that never opened a browser found nothing.
 * Reporting it as either loses the only distinction that matters here.
 */
export function legVerdictLine(r) {
  if (r.notRun) return `\n== ${r.name}: NOT RUN — ${String(r.notRun).split("\n")[0]}`;
  const ok = !r.verdict || r.verdict.length === 0;
  return `\n== ${r.name}: ${ok ? "PASS" : "FAIL"}${r.finished ? "" : " (voyage incomplete)"}`;
}
