/* judge_mode.mjs — what to do with the vision judge, given what the eye test just found.
 *
 * ONE DECISION, IN ONE PLACE, BECAUSE IT WAS PREVIOUSLY IN NO PLACE. sea_trial.mjs ran an eye test
 * (step 1b, scripts/qa/judge_can_see_check.mjs), printed its verdict, and then handed the fleet
 * whatever --judge argument it had been given — so on 2026-09-01 it printed "the eyes are SHUT" and
 * sailed ten legs into that same judge. Every screen of every leg then burned its full timeout
 * (120s per screen, 300s per batch), and the trial produced nothing for 80 of its 111 minutes.
 *
 * WHY A TIMEOUT DID NOT SAVE IT, since that is the part worth remembering: the timeouts exist and
 * fire correctly, but they resolve to {verdict:"ERROR"} / {unparseable:...}, and only a FATAL sets
 * judgeAll's `fatal` flag. So the designed rescue — "THE JUDGE IS DEAD, NOT THE SCREENS. Defer
 * rather than forfeit" — is reached when the judge is ABSENT and missed when it is merely BROKEN.
 * This function reaches that same rescue deliberately, from evidence gathered thirty seconds
 * earlier, instead of hoping the fleet stumbles into it.
 *
 * QUEUE, NEVER OFF. The screens are still captured and still written to the queue for a session to
 * judge later; nothing visual is forfeited, it is deferred. Turning the judge OFF here would
 * quietly convert "we could not look" into "we did not need to look", which is the NOT-RUN column's
 * whole principle violated in a new place.
 */
"use strict";

/* `requested` is the --judge argument as given ("on" | "off" | "queue").
   `eyesOk` is step 1b's finding: true = the judge really opened a screenshot and described it,
   false = it demonstrably cannot see, null = the check could not be asked at all.

   UNKNOWN IS NOT SHUT, and that asymmetry is deliberate: 1b exits 2 when it could not run, and
   treating that as "blind" would silently stop judging on every machine where the CHECK is broken
   rather than the judge — an instrument's own failure quietly rewriting the plan. */
export function judgeModeFor(requested, eyesOk) {
  if (requested !== "on") return requested;   // an explicit human choice outranks the eye test
  return eyesOk === false ? "queue" : "on";
}
