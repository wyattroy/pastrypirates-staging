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

/* ⛔ AND IT MUST NAME THE SCREEN AND SAY WHAT IT SAW — `T-215`.
 *
 * The verdict filtered the failed screens and then printed only HOW MANY, while every one of them
 * already carried the filename and the judge's own sentence. **Rule 19's live detector — the half
 * that FINDS things nobody asked about — reported a count.** The 89-minute report of 2026-09-03
 * says *"vision judge FAILED 1 of 30 screen(s)"* six times and names exactly ONE `.png` in the
 * whole file; the sentences went to `sea-trial-shots/log.txt`, appended by **261 runs**, beside
 * screenshots later runs overwrite.
 *
 * ⚑ WHAT IT WAS HIDING, run through the real `report.json` the day this was written: *"captain list
 * rows 'Davy Scones' and 'Dough Hook' truncated to 'Dav'/'Dou', clipped by the recipe modal"* ·
 * *"'Play again!' button overlaps the two award cards, clipping their label text"* · *"pink captains
 * panel from the screen behind bleeds through beneath the End of Voyage modal, with no dimming
 * overlay"* · *"'Arrgh!' bubble floats alone in open water with no tail"*. **Two of those match rows
 * a human filed independently (`T-142`, `T-143`).**
 *
 * ⚠ AND THIS COMMENT USED TO END *"and the third was CONFIRMED BY EYE — the pink panel really is
 * there"*, WHICH IS A RUNTIME CLAIM AND IS NOT THIS FILE'S TO MAKE. It was inherited from another
 * session and would have shipped inside a gate, where rule 6 says a comment describing behaviour
 * rots silently. **The watch that committed it could not reproduce it**: `report.json` is dated
 * 08:43 and `solo-tablet-029-settled.png` 09:13 — the picture is half an hour NEWER than its own
 * verdict, because `sea-trial-shots/` is one directory that every run overwrites. Opened anyway, it
 * shows a mid-game Day-10 tablet board with a call-the-winner prompt: no End of Voyage modal at all.
 * **That is `T-215`'s unfixed second half, and it is why the sentence above is now attributed rather
 * than asserted.** Caught by CEO 170. */
check("a judged FAIL NAMES the screen", /a\.png/.test(failing), `verdict was: ${failing}`);
check("a judged FAIL carries the judge's own sentence", /text overlaps/.test(failing), `verdict was: ${failing}`);

/* ⛔ AND IT MUST SAY THE SENTENCE IS A POINTER, NOT A DIAGNOSIS — `T-019`, via CEO 170.
 *
 * A human opened all TEN FAIL verdicts of the 0624Z run: **two were false positives and one had the
 * wrong mechanism attached.** The *"'Arrgh!' bubble with no tail"* is a BUTTON (`panel.js:1156`);
 * the *"FORECAST ribbon clipped by the sidebar"* pill reads complete with ~280px of clear board
 * beside it; and the judge invented award names on `solo-phone-021`, the same hallucination
 * `INTENDED-BEHAVIOUR.md:123` already records it doing with wind direction.
 *
 * **So `T-215`'s own fix creates this hazard: printing the sentence makes an unreliable narrator
 * LOUDER.** The value it adds is the FILENAME — a screen worth opening, which a bare count could
 * not give anyone. Without the label, the next reader quotes the words, which is precisely what
 * `T-019` says the session before them did. The caveat has to ship in the OUTPUT, because nobody
 * reads a Chart row at the moment they are reading a verdict. */
check("the sentence is labelled a POINTER, not a diagnosis",
  /not quotable/.test(failing) && /T-019/.test(failing), `verdict was: ${failing}`);

/* Only the BASENAME: `shot` is `${OUT}/…`, and the full path adds sixty useless characters to every
   line of a report he reads. */
const pathy = legVerdict({ name: "solo-phone", finished: true, screens: [], seats: [],
  judged: [{ shot: "C:\\repo\\sea-trial-shots\\b.png", r: { verdict: "FAIL", issues: ["clipped"] } }] }).join(" | ");
check("the screen is named by basename, not by its whole path",
  /b\.png/.test(pathy) && !/sea-trial-shots[\\/]b\.png/.test(pathy), `verdict was: ${pathy}`);

/* A judge that fails a screen and gives no reason must still name the screen — otherwise the one
   case where nobody can guess what happened is the one that says least. */
const silent = legVerdict({ name: "solo-phone", finished: true, screens: [], seats: [],
  judged: [{ shot: "c.png", r: { verdict: "FAIL", issues: [] } }] }).join(" | ");
check("a FAIL with no stated reason still names the screen and says so",
  /c\.png/.test(silent) && /no reason/i.test(silent), `verdict was: ${silent}`);

/* ⚠ ONE ENTRY, NOT ONE PER SCREEN. `playtest_gate.mjs:653` reads `r.verdict.length` as pass/fail and
   other readers count it; a count that moves when the judge finds a second issue would replace an
   old lie with a new one. Two failed screens must still be ONE verdict entry. */
const twoFails = legVerdict({ name: "solo-tablet", finished: true, screens: [], seats: [],
  judged: [{ shot: "d.png", r: { verdict: "FAIL", issues: ["one"] } },
           { shot: "e.png", r: { verdict: "FAIL", issues: ["two"] } }] });
check("two failed screens are ONE verdict entry, not two",
  twoFails.filter((x) => /vision judge FAILED/.test(x)).length === 1, `entries: ${twoFails.length}`);
check("…and both are named", /d\.png/.test(twoFails.join(" ")) && /e\.png/.test(twoFails.join(" ")), `verdict was: ${twoFails.join(" | ")}`);

const unfinished = legVerdict({ name: "crew-phone", finished: false, screens: [], seats: [] }).join(" | ");
check("an unfinished voyage is still reported", /did not finish/.test(unfinished), `verdict was: ${unfinished}`);

console.log(fails ? `\nFAIL — ${fails} failure(s)` : "\nPASS — 0 failure(s)");
process.exit(fails ? 1 : 0);
