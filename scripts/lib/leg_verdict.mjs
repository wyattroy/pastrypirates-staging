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

/* legVerdict(rec) — WHAT THE LEG FOUND, moved here 2026-08-30 from playtest_gate.mjs.
 *
 * WHY IT MOVED, and it is the same reason legVerdictLine moved in 2026-08-27: the gate runs its
 * whole fleet at import time, so nothing could import this function to check what it SAYS without
 * also sailing ten voyages. A verdict no check can reach is a verdict nobody can red-proof — which
 * is how 'vision judge FAILED 4 screen(s)' went two days without ever printing how many were
 * looked at. The two verdict functions live in ONE file on purpose: they are read together, in the
 * same report, and a second near-homonym module beside this one would be two things kept in step
 * by discipline (CLAUDE.md rule 23).
 */
export function legVerdict(rec) {
  const v = [];
  if (!rec.finished) v.push("did not finish the voyage");
  /* A RESCUE IS NOT A FREE PASS — CEO Review 12, 2026-08-28: "nothing bounds the recoveries…
     A leg needing eleven relaunches should not produce the same shaped verdict as one needing
     none," and this repo has already paid once for an instrument that was reassuring rather than
     silent. The mount absorbs ANY WebKit death, so without this a future crash caused by OUR OWN
     game code would relaunch, resume, and report finished:true with a small asterisk.
     TWO RULES, both derived rather than typed:
       - ANY recovery on a NON-WebKit leg fails outright. The crash we sanction is WebKit's own
         (diagnosed by core dump); Chrome has never once needed one, so a Chrome relaunch is by
         definition not the known bug.
       - A WebKit leg gets a budget of ONE RESCUE PER FOUR GAME-DAYS SAILED (floor 2). A voyage
         that has to be restarted more often than that is not sailing, it is crash-looping, and
         the verdict should say so. The divisor is the honest knob: the 2026-08-28 fleet ran
         11 rescues over 29 days (budget 7 — FAILS, correctly: the CEO called that leg a limp),
         2 over 19 and 1 over 16 (budgets 4 and 4 — both pass). Change it when observation
         changes, and say what you observed. */
  const rescues = rec.recoveries || 0;
  if (rescues) {
    const wk = /-wk$/.test(rec.name);
    const budget = Math.max(2, Math.ceil((rec.days || 1) / 4));
    if (!wk) v.push(`${rescues} browser relaunch(es) on a Chrome leg — Chrome has never needed one; this is NOT the sanctioned WebKit crash`);
    else if (rescues > budget) v.push(`${rescues} WebKit relaunch(es) over ${rec.days || "?"} day(s) — above the ${budget} this voyage's length allows; that is a crash loop being ridden out, not a voyage`);
  }
  /* ⚠ DEFENSIVE, NOT A REPAIR — AND THE STORY IS THE POINT.
     This was written on 2026-08-31 to fix a reported 18x undercount: the log showed 36 structural
     failures and the report showed 2. THE REPORT WAS RIGHT. `sea-trial-shots/log.txt` ACCUMULATES
     ACROSS RUNS (its elapsed prefix resets sixteen times); the 36 are spread over ~16 trials, and
     the last run's report.json holds exactly 2. And the mechanism blamed does not exist:
     playtest_gate.mjs:390 gives recA and recB `screens: rec.screens` — THE SAME ARRAY as the
     parent — so a guest's failures were never missing from the count.
     KEPT ANYWAY, because it costs nothing and a future change that gives seats their own arrays
     would make that bug real. Deduplicated by ARRAY IDENTITY, which is what makes it a no-op today.
     DO NOT read this as evidence the report ever undercounted. It did not. */
  const screenSets = [];
  const seenArrays = new Set();
  for (const src of [rec, ...(rec.seats || [])]) {
    const arr = src && src.screens;
    if (Array.isArray(arr) && !seenArrays.has(arr)) { seenArrays.add(arr); screenSets.push(arr); }
  }
  const structFails = screenSets.flatMap(a => a.flatMap(s => (s && s.fails) || []));
  /* NAME THEM. A COUNT IS NOT ACTIONABLE, AND THIS ONE HID THE BIGGEST FINDING IN THE FLEET.
     Every other line in this verdict names its subject — dead controls list their labels,
     unreachable controls their `what`, unexercised kinds their names — and this one alone said
     only "2 structural check failure(s)". Rule 24 stands on Wyatt being able to OPEN THE REPORT
     and see what happened; a bare number sends him to a 5,000-line log or nowhere.
     WHAT IT COST, 2026-08-29: the FULL trial for build 2026.08.29.2 reported "1" and "2"
     structural failures per leg. Behind those numbers were 22 failures, 14 of them on
     crew-phone-guest, and they say `on-screen: clickable off-screen: sailCell` and
     `sail-clickable: 2 sail square(s) covered ... <- #pp4Cap` — the trial had independently
     reproduced "sail squares a guest cannot tap", the TOP item on the backlog, and the summary
     line threw the evidence away. Grouped by RULE rather than listed flat, because one broken
     screen trips the same rule repeatedly and a flat list would be its own kind of noise. */
  if (structFails.length) {
    const byRule = new Map();
    for (const k of structFails) byRule.set(k.rule, (byRule.get(k.rule) || 0) + 1);
    const named = [...byRule.entries()].sort((a, b) => b[1] - a[1]).map(([r, n]) => `${r}×${n}`).join(", ");
    const first = (structFails[0] && structFails[0].what) ? ` — first: ${String(structFails[0].what).slice(0, 110)}` : "";
    v.push(`${structFails.length} structural check failure(s): ${named}${first}`);
  }
  for (const seat of rec.seats || [rec]) {
    const P = seat.player; if (!P) continue;
    if (P.deadButtons.length) v.push(`${P.deadButtons.length} dead control(s): ${P.deadButtons.map(d => d.label).slice(0, 5).join(", ")}`);
    if (P.findings.length) v.push(`${P.findings.length} unreachable control(s): ${P.findings.map(f => f.what).slice(0, 3).join("; ")}`);
    // coverage: a kind the game OFFERED but the player never successfully exercised
    /* A RESUMED leg comes back from report.json, where a Map was serialized to a plain object;
       a live-driven one is a real Map. Accept both rather than assume one -- the identical fault
       was found and fixed in playtest_gate.mjs on 2026-09-01 and this second copy was missed, so
       calling legVerdict() on a stored leg threw "P.coverage.entries is not a function". Same
       fault, same fix, both places (rule 8). */
    const covEntries = P.coverage instanceof Map ? [...P.coverage.entries()] : Object.entries(P.coverage || {});
    const unexercised = covEntries.filter(([k, r]) => r.seen > 2 && r.clicked === 0 && !/back|menu close|chat close/.test(k)).map(([k]) => k);
    if (unexercised.length) v.push(`offered but never exercised: ${unexercised.join(", ")}`);
  }
  /* THE TWO SEATS DISAGREEING IS A FAILURE, not a note. This is the class Wyatt's 2026-08-26
     playtest was mostly made of — seven findings where both screens were individually fine and they
     showed different games — and until this line the leg had no way to say so. */
  if (rec.parity && rec.parity.length)
    v.push(`${rec.parity.length} moment(s) where the two captains saw different games: ` +
           rec.parity.slice(0, 3).map(p => `${p.field} (${p.why})`).join("; "));
  if (rec.consoleErrs && rec.consoleErrs.length) v.push(`${rec.consoleErrs.length} console error(s): ${rec.consoleErrs[0]}`);
  /* A JUDGED SLOT CAN BE EMPTY, AND EVERY READER MUST COPE. judgeAll stops the whole pass on the
     first FATAL, so screens it never reached come back `undefined` — deliberately, because an
     unreached screen has NOT been cleared and must never be defaulted to PASS. This crashed a real
     run of Wyatt's on 2026-08-22 (`Cannot read properties of undefined (reading 'verdict')`, twice:
     here and in the contact sheet) because the producer learned to leave holes and its consumers
     did not. Count the holes and say so, rather than assuming a dense array. */
  const judged = (rec.judged || []).filter(j => j && j.r);
  const judgeHoles = (rec.judged || []).length - judged.length;
  const judgeFails = judged.filter(j => j.r.verdict === "FAIL");
  if (judgeFails.length) v.push(`vision judge FAILED ${judgeFails.length} of ${judged.length} screen(s) it looked at`);
  /* THE DENOMINATOR, WITHOUT WHICH A HALF-SEEN LEG READS AS A CLEAN ONE.
     Wyatt, 2026-08-30: "everything must be seen visually, or else you don't catch your own code
     errors." JUDGE_CAP capped the eyes at the first 30 distinct screens of a leg while the
     structural rules ran on all of them, and this verdict said nothing about the gap — so
     crew-desktop came back "60 captured, 30 judged, all 30 PASS" and read as visually clean with
     half of it never opened (one recorded fleet: 349 captured, 267 judged, 82 never looked at).
     An unseen screen is not a passed screen; it is the same distinction as the report's NOT-RUN
     column, one level down, and it belongs in the verdict rather than in a log nobody opens. */
  const unseen = rec.screens.length - judged.length;
  if (judged.length && unseen > 0)
    v.push(`${unseen} screen(s) NOT looked at — the judge saw ${judged.length} of ${rec.screens.length}; those ${unseen} are not cleared`);
  const judgeErrs = judged.filter(j => j.r.verdict === "ERROR" || j.r.verdict === "FATAL");
  if (judgeErrs.length) v.push(`vision judge errored on ${judgeErrs.length} screen(s) — those screens are NOT cleared`);
  if (judgeHoles) v.push(`${judgeHoles} screen(s) never judged — NOT cleared`);
  const motionOnly = rec.screens.reduce((n, s) => n + ((s.motionOnly || []).length), 0);
  if (motionOnly) v.push(`${motionOnly} observation(s) seen only DURING an animation — not failures, read them in the log`);
  /* NAME THE CAUSE, NOT JUST THE COUNT — and checks.mjs already worked it out.
     waitSettled() records WHICH half kept moving ("geometry", "text", or both) precisely because
     the two need opposite fixes, and its own comment says the finding is "reported, not merely
     counted... the report has to tell them apart". It was not: this line printed a bare number and
     the cause was computed and thrown away. A comment describing what the code MEANT to do, while
     the code did something else -- the exact trap CLAUDE.md's rule 6 is about.
     Found 2026-09-01 with a real finding in hand: Safari's first two legs on the Razer each
     reported unsettled screens, and there was no way to tell from the verdict whether the game was
     still animating or the text was still painting. Also reports how long the worst one ran,
     because a screen that hit the 12s runaway guard is a different problem from one that missed
     the window by 200ms. */
  const unsettledScreens = rec.screens.filter(s => s.settle && !s.settle.settled);
  if (unsettledScreens.length) {
    const causes = {};
    for (const s of unsettledScreens) { const k = s.settle.churn || "unknown"; causes[k] = (causes[k] || 0) + 1; }
    const why = Object.entries(causes).map(([k, n]) => `${n} ${k}`).join(", ");
    const worst = Math.max(...unsettledScreens.map(s => s.settle.ms || 0));
    const hardCapped = unsettledScreens.filter(s => s.settle.hardCap).length;
    v.push(
      `${unsettledScreens.length} screen(s) never stopped moving before being checked ` +
      `(still moving: ${why}; longest wait ${(worst / 1000).toFixed(1)}s` +
      (hardCapped ? `, ${hardCapped} hit the 12s runaway guard` : "") + ")"
    );
  }
  if ((rec.queued || []).length) v.push(`vision pass DEFERRED for ${rec.queued.length} screen(s) — queued for a session, NOT cleared`);
  return v;
}
