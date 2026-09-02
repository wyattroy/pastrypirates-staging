# PREDICTION — the End of Voyage screen is photographed and checked by nothing

Written 2026-08-31 BEFORE any fix, so it cannot be retrofitted.

## What I claim, with the citation

`scripts/playtest_gate.mjs:229` — the End of Voyage branch:

```js
if (st && st.over) { log(`  [${tag}] END OF VOYAGE at day ${st.day}`);
  const f2 = `${OUT}/${tag}-eov.png`; await c.shot(f2);
  rec.screens.push({ shot: f2, sig: "end of voyage", fails: [] });
  rec.finished = true; return; }
```

Compare the path EVERY OTHER screen takes, `scripts/playtest_gate.mjs:208-226`:
motion shot → `structuralChecks` on the moving frame → `waitSettled(c)` → settled shot →
`structuralChecks` again → `fails` recorded → each failure logged.

So the LAST SCREEN OF EVERY VOYAGE, on all ten legs of a FULL trial, gets:
- **no `structuralChecks`** — `fails: []` is a hardcoded literal, not a result;
- **no `waitSettled`** — the shot fires the instant `over` flips, mid-glide. w34 measured that
  card travelling 688px in 250ms, so this frame is caught during exactly that motion;
- **no `motionShot`**, so nothing can even be read against it afterwards.

## What would prove me WRONG

1. If `structuralChecks` is run on the EOV screen somewhere else — a later pass over
   `rec.screens`, or inside `c.shot`. Then the branch is a shortcut, not a hole.
2. If the vision judge reads screens whose `fails` array is empty and would still have caught a
   broken EOV card. Then the screen is checked, just not structurally.
3. If some leg-level check asserts on `sig === "end of voyage"`.

If any of those hold, this is not a gap and I say so instead of fixing it.

## Why I expect it went unnoticed

It produces no failure and no silence — it produces a **PASS**. `fails: []` is indistinguishable in
every report from "checked, and clean". This is the same shape as the fault closed an hour ago:
an instrument that reports on a thing it never looked at. Rule 6.

## What happened immediately before (rule: widen the time horizon)

`return` on the same line. The branch ends the leg, so it was written as a *teardown* — grab a
final photo and stop — rather than as a screen. Everything that makes a screen a screen lives in
the loop body above it, and the early return steps over all of it.

---

## THE RESULT — checked 2026-08-31, BEFORE fixing anything

**I was right on two of the three falsifiers and WRONG on the headline. Saying so first.**

| falsifier | outcome |
|---|---|
| F1 — is `structuralChecks` run on the EOV screen anywhere else? | **NO.** It is called at `playtest_gate.mjs:211` and `:218` only, both inside the loop body the EOV branch returns before reaching. `c.shot` checks nothing. **Prediction holds.** |
| F2 — does the vision judge read it anyway? | **YES — and this half of my claim was WRONG.** `playtest_gate.mjs:441-442` maps over `rec.screens`, which INCLUDES the EOV entry. The judge's eyes are on that screenshot. |
| F3 — does any leg-level check assert on `sig === "end of voyage"`? | **NO.** The only occurrence in all of `scripts/` is the push that creates it. **Prediction holds.** |

**So "photographed and checked by nothing" was too strong, and I am striking it.** The correct
statement is narrower and still worth fixing:

> The End of Voyage screen gets **no structural checks** and **no settle wait**, on every leg of
> every trial. It is the only screen in the run that skips both.

**AND F2 MAKES THE SETTLE HALF WORSE, NOT BETTER.** Because the judge *does* look at it, the missing
`waitSettled` means the eyes are handed a frame captured the instant `st.over` flips — mid-glide.
`scripts/qa/w34_eov_park_glide.mjs` measured that card travelling **688px on desktop and 762px on
tablet in 250ms**. So the one screen the judge is guaranteed to see from every leg is the one screen
it is guaranteed to see *while it is still moving* — and a card caught in flight is exactly what
produces a judge complaint that reads as a real layout defect and is not one. The gap costs both a
missing check AND false noise in the check that does run.

**The lesson, which is rule 6 pointing at me:** I wrote "checked by nothing" from reading one branch
and not following where `rec.screens` goes afterwards. The prediction note is the only reason that
got corrected instead of shipped as a finding.

---

## THE LIVE PROOF — a real solo voyage, End of Voyage at day 11

`scripts/playtest_gate.mjs --legs=solo-desktop`, 564s to the ending. The log line
`end of voyage: settled and structurally clean` is reachable ONLY through `settleAndCheck`, and
both `solo-desktop-eov.png` (motion) and `solo-desktop-eov-settled.png` now exist where before
there was only the first.

**WHAT IS PROVEN:** seven structural rules now run on the End of Voyage screen. Before this change
**zero ran and the screen was recorded as clean anyway.**

**AND A SECOND CLAIM OF MINE IS NOT SUPPORTED — striking it too.** I wrote that the missing settle
wait meant the judge was "handed the one frame guaranteed to be mid-flight", citing w34's 688px
glide. **The matched pair says otherwise.** Motion and settled frames of this ending are visually
identical apart from one ✨ sparkle moving from the lower right of the winner banner to the upper
left. The card was already at rest when `st.over` flipped.

**Why I was wrong, which is worth more than the claim was:** w34 measured the card being **parked
by a scroll or a drag** — a gesture — not its arrival. I reached for the nearest measured number
about that card and applied it to a different moment. *A number measured about one moment is not
evidence about another,* and it read as rigour because it had a citation attached.

**So the settle wait is worth keeping on its merits, not on that argument:** it costs ~2s per leg,
it makes the ending obey the same rule as every other screen (rule 23), and it records a settle
reading where there was none. It is not fixing a mid-flight capture, because on this evidence there
was not one.

**The leg reported FAIL, and that is NOT this change.** Its two findings are `offered but never
exercised: vanilla beans` and `4 screen(s) never stopped moving before being checked` — the leg's
own coverage rules. The same failure shape appears **90 times** in `sea-trial-shots/log.txt` from
earlier runs, at counts of 8 to 18. This run was at 4, the low end. The End of Voyage screen settled
and contributed none of them.

---

## CORRECTION — THE HOLE WAS REAL AND SMALLER THAN I BILLED IT. CEO REVIEW 39.

**I struck two of my own claims above and this THIRD one survived — the one written in the
commit-message-shaped sentence.** CEO 39 found it by opening evidence I never opened: the pre-fix
10-leg trial's own `sea-trial-shots/report.json`.

**STRIKING:** *"seven structural rules now run on the End of Voyage screen. Before this change zero
ran and the screen was recorded as clean anyway."*

**WHAT IS ACTUALLY TRUE**, verified by reading that report myself rather than taking the CEO's word:
**all ten legs already contained a settled, structurally-checked screenshot of the ending.** The
ordinary loop catches it one tick earlier under the signature `… ~ EOV ~`, `settled: true`, checks
run. Beside it sat a SECOND entry, `sig: "end of voyage"`, `settle: None`, `fails: []`.

> So the fault was never *"the last screen of every leg was checked by nothing"*. It was **a
> DUPLICATE record of an already-checked screen entering the report marked clean.**

**That is still worth fixing, and here is the honest size of it:** `fails: []` reads as *checked and
clean* in every report; it inflates each leg's screen count, which moves the denominator of the
"N screens never looked at" rule; and it spends one paid vision-judge call per leg on a photograph
of a screen already in the record. Fixed by routing the branch through `captureIfNew` — a genuinely
new screen is settled and checked like any other, a screen already recorded is not recorded twice.

**AND THE SMALL NUMBER WAS WRONG THE SAME WAY.** I wrote the pre-existing failure ran "at counts of
8 to 18". Counted properly: **90 occurrences, range 1 to 22, and 20 of them at 4 or below.** My run
at 4 was therefore ordinary, not "the low end" — a claim I made about a distribution I had looked at
five lines of.

### The lesson, and it is not "be careful"

**Every one of these three overclaims had the same shape: a true statement about the CODE, promoted
to a statement about the WORLD without opening the world.** I read the branch and saw no checks —
true. I concluded no checks ran on that screen — false, because a different code path was already
checking it. The report that would have said so was on disk the whole time and I never opened it.

**RULE 6 HAS A COROLLARY THIS EARNED: when you find a hole, go and look at what the system actually
PRODUCED before you say how big it is.** Reading the code tells you what one path does. Only the
output tells you what the system does. The gap between those two is exactly where every one of
these three claims lived.

**And the process worked, which is the case for rule 25:** two claims were caught by my own
prediction note, and the third by a reader with fresh eyes who went and opened a file I had not.
