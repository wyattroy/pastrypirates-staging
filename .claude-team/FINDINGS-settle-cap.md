# THE TRIAL'S MOST FREQUENT FAILURE IS ONE COMPONENT AND A 400ms CAP

Measured 2026-08-31 from `sea-trial-shots/report.json` — the previous FULL trial's own recorded
data, 328 screens across 10 legs. No browser, no new run; this was on disk the whole time.

## The failure

Every trial ends with legs failing on *"N screen(s) never stopped moving before being checked"*.
The count has been reported as 1, 3, 4, 8, 11, 13, 14, 18, 22 across runs and **never once broken
down**. It is the single most common reason a leg fails.

## It is one component, and the split is total

| | screens | never settled | median settle |
|---|---|---|---|
| **radial prompts** (`sig` begins `radial`) | 191 | **94 — 49.2%** | **2470ms** |
| **everything else** | 137 | **0 — 0.0%** | **409ms** |

Not "mostly". **Zero** non-radial screens have ever failed to settle in this corpus.

## And they DO settle — the cap gives up about 400ms early

`waitSettled`'s cap is **2600ms** (`scripts/lib/checks.mjs`). Radial prompt settle times:

```
min 374   p25 899   median 2470   p75 2656   p90 2726   max 3175
```

| cap | still unsettled |
|---|---|
| 2600ms (today) | **94** of 191 |
| 3000ms | **1** |
| 3500ms | **0** |

**Nothing here is failing to settle. It is settling just after we stop looking.**

## TWO READINGS, AND I AM NOT CHOOSING BETWEEN THEM

1. **The cap is too short**, so the trial has cried wolf on 94 screens per run, every run. That
   matters beyond the noise: *a gate that flakes gets disabled, and a disabled gate is worse than
   no gate because it was believed for a while* — this file's §10 lesson, and the reason CEO 31
   rejected a live two-client parity gate.
2. **The radial prompt genuinely takes up to 3.2 seconds to stop moving**, which is a long time to
   wait for buttons. That is a player-facing observation, not an instrument problem.

**Both may be true, and they call for opposite actions** — one raises the cap, the other speeds up
the prompt. **Raising the cap alone would make 94 failures per run vanish, which is exactly what
"switching a gate off" looks like from the outside.** So this goes to Wyatt with the numbers
attached rather than being quietly fixed at 5am.

## What would settle it (and is cheap)

Pose one radial prompt and trace what is still moving between 2.4s and 3.2s — one component, one
recording, per rule 26. If it is the bloom's own arrival easing, that is a deliberate 3-second
animation and the cap is simply wrong. If something is still drifting at 3.1s, that is the defect.


---

## CORRECTED 2026-08-31 BY WYATT, WHO PLAYED IT

**His words:** *"I've played the game. the radial prompt is instantaneous. I have no idea why your
tooling is measuring it wrong. it may be measuring the wrong thing... the radial prompt for trade
appears IMMEDIATELY and stays onscreen."* (Screen recording: `notes/radial-prompt-proof.mp4` on his
local main — not present in the container, so I have not watched it.)

**He is right, and the fault is in what I claimed, not in his eyes.**

### What the probe actually measures

`SETTLE_PROBE` watches **fourteen selectors at once** — `.apBtn, .btlBtn, .sailCell, .recipeCard,
.bkoCard, .apSlider, #flipCoinWrap.active, .apMsg, .apSub, .pp4Bub, .pp4PeekHint, #pp4Prompt,
#pp4Cap, #pp4Pill` — and returns **one** number for the whole screen. The word `radial` in a
signature is just the **prompt box's class name**, the first field of a screen label.

**So "the radial prompt takes 3.2 seconds to settle" was never measured. What was measured is
"something among fourteen selectors on a screen whose prompt happens to be radial was still
moving."** I took a screen-level number and reported it as a component. That is rule 6's exact
shape, and no amount of sample size fixes a quantity that names the wrong subject.

### What the data does support, now that it is asked properly

| question | answer |
|---|---|
| is it the sail squares? | **No.** 83 of 175 radial screens with NO sail cells still never settle |
| is it the button reveal? | **No clean relationship.** 0 buttons → 2120ms; 1 → 996ms; 2 → 2613ms |
| geometry or text? | **All 94 are `geometry`.** Zero are text — the field was already recorded |
| was the typewriter still painting? | Separately, yes — 99 deadline extensions were granted for it |

### The hypothesis this points at, NOT yet confirmed

Something small is moving **continuously**, and the probe's defence against that is failing.
`SETTLE_PROBE` quantises rects to 8px precisely because *"half this board never stops moving —
`.sailCell` carries a permanent bounce, ships glide, the ripple pulses"*. **A pulse whose rect
oscillates ACROSS an 8px boundary defeats that rounding entirely** — it produces two alternating
strings forever, so three consecutive identical samples never happen. Commit `a9ee68f5`'s title is
suggestive in exactly this direction: *"the narration bubble picks its side ONCE, and two placements
stop measuring a pulsing button."*

**If that is it, the fix is in the instrument and not in the game — which is what Wyatt said.**
Compare rects with a TOLERANCE rather than a rounded string, so an element oscillating by a few
pixels reads as stable instead of as two distinct screens.

**Not confirmed.** It needs one posed radial prompt with per-element sampling between 2s and 3.5s,
naming what actually moves. Until then this is a lead, not a cause — and the previous version of
this file, which put "the prompt takes 3 seconds" to Wyatt as one of two readings, was wrong in a
way his own eyes caught in seconds.