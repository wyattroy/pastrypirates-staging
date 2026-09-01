/* JUDGE COVERAGE GATE — "the eyes saw N of M", or the verdict is lying by omission.
 *
 * Wyatt, 2026-08-30: "Judge is important because everything must be seen visually, or else you
 * don't catch your own code errors."
 *
 * THE DEFECT THIS EXISTS FOR. `JUDGE_CAP = 30` means the vision judge only ever looked at the first
 * thirty distinct screens of a leg, and the verdict printed "vision judge FAILED 4 screen(s)" with
 * NO DENOMINATOR. A recorded run captured 349 screens, judged 267, and never looked at 82 — and its
 * worst leg, crew-desktop, was 60 captured / 30 judged / all 30 PASS. That leg reads as visually
 * clean. Half of it was never opened. A crew leg measured on 2026-08-30 captured 55 screens, so
 * this is not a corner case; it is the normal case for every long leg.
 *
 * WHAT IS ASSERTED, and both halves matter:
 *   1. A leg whose screens were only PARTLY judged must SAY SO in its verdict, even when every
 *      screen it did look at passed. Silence on a partly-judged leg is the whole fault.
 *   2. A leg judged in full must NOT carry that warning — or the line becomes noise on every leg
 *      and gets ignored, which is this repo's other recurring failure (a gate that cries wolf).
 *
 * RED-PROOFED: assertion 1 fails against the code as it stood before 2026-08-30 (the verdict was
 * empty for that record), and assertion 2 fails against a naive fix that warns unconditionally.
 * A check that cannot fail proves nothing — CLAUDE.md rule 6.
 */
import { legVerdict } from "../lib/leg_verdict.mjs";

let fails = 0;
const check = (name, ok, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${ok || !detail ? "" : `\n       ${detail}`}`);
  if (!ok) fails++;
};

/* a leg record shaped like the real thing: finished, nothing structurally wrong, every judged
   screen clean — the exact record that used to produce a completely empty verdict. */
const legRec = (captured, judgedCount) => ({
  name: "crew-desktop",
  finished: true,
  screens: Array.from({ length: captured }, (_, i) => ({ shot: `s${i}.png`, fails: [] })),
  judged: Array.from({ length: judgedCount }, (_, i) => ({ shot: `s${i}.png`, r: { verdict: "PASS", issues: [] } })),
  seats: [],
});

const partly = legVerdict(legRec(60, 30)).join(" | ");
check("a leg judged 30 of 60 says so in its verdict",
  /\b30\b/.test(partly) && /\b60\b/.test(partly),
  `verdict was: ${partly || "(EMPTY — the leg reads as clean and 30 screens were never looked at)"}`);

check("...and names it as screens NOT looked at, not as a pass",
  /not (looked at|seen|judged)|never (looked|seen|judged)|unseen/i.test(partly),
  `verdict was: ${partly || "(EMPTY)"}`);

const whole = legVerdict(legRec(24, 24)).join(" | ");
check("a leg judged IN FULL carries no such warning (or the line becomes noise)",
  !/not looked at|never looked|unseen/i.test(whole),
  `verdict was: ${whole}`);

/* The pre-existing verdicts must survive the change — this file is now the only thing standing
   between them and a silent regression, because nothing else imports legVerdict. */
const failing = legVerdict({ name: "solo-phone", finished: true, screens: [], seats: [],
  judged: [{ shot: "a.png", r: { verdict: "FAIL", issues: ["text overlaps"] } }] }).join(" | ");
check("a judged FAIL is still reported", /vision judge FAILED 1/.test(failing), `verdict was: ${failing}`);

const unfinished = legVerdict({ name: "crew-phone", finished: false, screens: [], seats: [] }).join(" | ");
check("an unfinished voyage is still reported", /did not finish/.test(unfinished), `verdict was: ${unfinished}`);

console.log(fails ? `\nFAIL — ${fails} failure(s)` : "\nPASS — 0 failure(s)");
process.exit(fails ? 1 : 0);
