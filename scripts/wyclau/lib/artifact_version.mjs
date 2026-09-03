/* artifact_version.mjs — WHAT COUNTS AS AN ARTIFACT VERSION. The only copy.
 *
 * Both Glass receipts name the version of his page that a session read or published:
 *
 *     .planning/wyclau/LAST-HARVEST   {"artifactVersion": "1788394958-ad3f", ...}
 *     .planning/wyclau/LAST-PUBLISH   ... version=1788395643-2eb7 commit=<sha>
 *
 * They exist to answer ONE question — is a republish safe? — and the only honest way to answer it is
 * to compare the version you READ against the version that is LIVE. Wyatt, 2026-09-02: "the harvest
 * stamp records when a session looked. It is not evidence the page hasn't changed since. Your page
 * carries its own version number — that's the fact that can answer 'is a republish safe?', and a
 * clock never can."
 *
 * WHY THIS IS A MODULE AND NOT A TEST INSIDE EACH WRITER (rule 23). Two things that must agree are
 * one thing, or they will drift — and here the drift would be silent, because each writer would keep
 * its own gate green while enforcing a different rule. On 2026-09-02 the WRONG kind of value spread
 * from one receipt to the other in about ten minutes with nothing between them.
 *
 * ⚠ THE ONE DESIGN CALL, AND IT IS DELIBERATE: THIS REFUSES A CLOCK AND ONLY A CLOCK.
 * It does NOT demand that a value match the platform's current `<epoch>-<hash>` shape. If that
 * format ever changes, a strict allow-list here would make the harvest stamp start failing — and
 * .claude/hooks/glass-harvest-first.cjs then denies every Glass publish, wedging the one surface
 * Wyatt steers from, in order to prevent a fault that has never happened. That hook's own standing
 * rule is "it must never wedge anything". So: refuse what is PROVABLY the wrong kind, and say so
 * loudly about a value we merely do not recognise. `receipt_version_is_identity_check.mjs` case 5
 * fails if that warning ever hardens into a refusal.
 *
 * ⚠ AND THE RECEIPTS ARE NOT SEALED — ONE BACK ROAD IS STILL OPEN, NAMED HERE SO NOBODY READS THIS
 * FILE AND CONCLUDES OTHERWISE (CEO 130). `.claude/hooks/glass-harvest-first.cjs` denies a Glass
 * publish until the stamp file looks fresh, and its own deny text still instructs a blocked session
 * to redirect a bare `date -u` timestamp into `.planning/wyclau/LAST-HARVEST`. That path writes a
 * clock straight past both writers and satisfies the hook's mtime check, so a session doing exactly
 * what the system tells it still ends up with a clock in the receipt. NOTHING HERE CAN STOP IT:
 * this module guards the writers, and that route does not use them. What DOES catch it is
 * `receipt_version_is_identity_check.mjs` case 7b, which reads the live receipts on every `npm test`
 * whoever wrote them — a detector, not a preventer. The preventer is an edit under `.claude/`, which
 * an unattended watch is refused permission to make (measured by four watches now); it is written
 * out verbatim as edit 2c in `.planning/wyclau/CLAUDE-DIR-REPAIRS-PENDING.md` and needs Wyatt's own
 * hands.
 */

/* The shape the platform hands back today: a unix-second epoch, a hyphen, a short hex tag.
   Used to RECOGNISE, never to require — see the box above. */
export const VERSION_ID_RE = /^\d{6,}-[0-9a-z]+$/i;

export const isVersionId = (v) => VERSION_ID_RE.test(String(v ?? "").trim());

/* A CLOCK IS A VALUE JAVASCRIPT WILL READ AS A DATE. `Date.parse` separates the two shapes cleanly,
   measured on this Node before the rule was written: "1788394958-ad3f" -> NaN, "2026-09-02" ->
   1788307200000, "2026-09-02T21:55:24.391Z" -> 1788386124391. The isVersionId guard comes first so a
   real id can never be condemned as a clock, however the platform's format moves. */
export const looksLikeClock = (v) => {
  const s = String(v ?? "").trim();
  if (!s || isVersionId(s)) return false;
  return Number.isFinite(Date.parse(s));
};

/* The refusal, in the words the caller should print. Returns null when there is nothing to refuse.
   `writer` names the command so the message is actionable from wherever it appears. */
export function clockRefusal(version, writer) {
  if (!looksLikeClock(version)) return null;
  return `REFUSING TO STAMP — "${version}" is a CLOCK, not the version of his page.

This receipt exists to answer one question before a republish: has he written something since you
read the page? A timestamp cannot answer it. His page's own \`generatedAt\` moves when a SESSION
regenerates the page and never when HE saves into it — two real versions of it, 1788385436-4b8b and
1788385523-b046, carry the identical generatedAt while the second holds an idea the first does not.
So a comparison against a time says "unchanged" at the exact moment he has written something.

This is not hypothetical: on 2026-09-02 both receipts held a clock, and the value spread from one to
the other in eleven minutes.

Pass the version the Artifact call itself returned — it looks like 1788386140-0fbe:

  node ${writer} --version=<the version the call returned>

If you do not have one, you have not read or published the live page. Do that first.

Nothing was written.`;
}

/* Not a refusal — a value we do not recognise is still accepted, and this is what gets said about
   it. Returns null when the value looks like a version id. */
export function unrecognisedNote(version, writer) {
  const s = String(version ?? "").trim();
  if (!s || isVersionId(s) || looksLikeClock(s)) return null;
  return `⚠ "${s}" does not look like an artifact version id (expected something like 1788386140-0fbe).
  It is being recorded anyway — refusing it could wedge the Glass if the platform's id format has
  changed, and only a clock is provably wrong. Check it against what the Artifact call returned.
  (${writer})`;
}
