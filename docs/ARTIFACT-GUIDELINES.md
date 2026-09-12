# ARTIFACT GUIDELINES — the things Wyatt asks for every single time

**Created 2026-09-10 at his instruction:** *"it may make sense for you to create a new artifact that
claude.md links to called ARTIFACT-GUIDELINES with all the things I ask you to do every single time,
like make things commentable, give a pass/problem, re-use artifacts."*

**That sentence is the whole reason this file exists.** Each rule below is here because he asked for
it more than once. If you are about to publish a page for him and you have not read this, you are
about to make him ask again.

---

## 1. EVERY SECTION IS COMMENTABLE

**His words, 2026-09-10:** *"change the plaque art brief artifact to let me comment on every section
of it."*

Not just checklists — **every artifact**, including a brief, a plan, an architecture write-up. He
reads these on a phone and reacts section by section; a page he cannot answer back to costs him a
round trip into chat, where the reply is detached from the thing it is about.

- A comment box under **every section**, not one at the bottom.
- It saves as he types (see §6) and comes out in **Copy my notes**.
- A section he did not comment on is simply absent from the copied notes — never padded with
  "(no comment)".

## 2. ANYTHING CHECKABLE GETS PASS / PROBLEM

Two buttons, `Passed` and `Problem`, on any item he is being asked to look at. Not a checkbox: a
verdict, because "I looked and it is wrong" and "I have not looked" are different states and a tick
cannot tell them apart.

- **Problem** is the word, never "Fail" — he is reporting, not grading.
- The card takes a coloured left edge so a page of verdicts reads at a glance.
- Both are toggles: tapping the same one again clears it.

## 3. RE-USE THE ARTIFACT. NEVER PUBLISH A SECOND ONE.

**One sheet, one URL, updated in place.** He keeps the link open on his phone; a new URL orphans
whatever he had already ticked.

- The running checklist is **`.planning/CURRENT-SHEET.md`** — it holds the live URL and the build it
  was written for. **Update that file in the same commit that republishes the sheet**, or the next
  session cannot find it and publishes a sixteenth.
- Publishing to an existing artifact means passing its `url`. Publishing without one creates a NEW
  artifact — that is how fifteen of them happened.
- Other long-lived artifacts (the art brief, the tuner, the architecture note) are listed at the
  bottom of `CURRENT-SHEET.md` for the same reason.
- **The title is his to set.** He renamed "Before Ye Merge" to "Pastry Pirates Checklist" on
  2026-09-10 because it had outlived a one-off gate. Do not rename an artifact he uses without
  being asked; do not change its favicon at all, because he finds the tab by its icon.

## 4. ONE SHAPE: BLOCKING QUESTIONS AT THE TOP, THEN THE CHECKS

**His words, 2026-09-09:** *"items parked with questions [go] into our consistent Playtest
artifact... with blocking questions at the top, and the playtestable items below."*

- **A question is not a check.** It has no pass and no fail — it has an ANSWER, and until it has one
  a piece of work is stopped. Amber, not teal. Its buttons are answers, not verdicts.
- Give every question **its options and your recommendation**, and put the **measurement inside the
  question** — *"at 360px it fits beside the clock by 2px — does that count as room?"*
- **Scope the question to the work.** He ruled hard on this: a question about restyling the
  captain's box that asked whether hidden recipes should stay hidden got *"NO NEVER SHOW OTHERS YOUR
  RECIPE!!! I am so confused why you would ask this."* A question wider than the job puts settled
  things back on the table.
- **Answers come out FIRST** when he copies his notes, above the verdicts. They are what unblocks
  work; the verdicts confirm it.

## 5. THE THINGS HE IS ASKED TO LOOK AT ARE ONE TAP AWAY, AND YOU WALKED THEM FIRST

**His words, 2026-09-10:** *"I can't test this because it's too time consuming — you must give me a
better way than running through a whole game myself. I need you to QA this, not me."*

- Every item carries **its own link**, beside what to do — not one URL at the top of the page.
- A URL that still costs four taps is not a shortcut. `?endcard=1` once reached the end card with
  every stat at zero, so the award he wanted to see could not appear at all — **a route that reaches
  a screen but empties it of the thing being checked is not a route to that check.**
- **Walk it yourself before it goes on the sheet.** Today's doors: `?ovens=1`, `?bake2=1`,
  `?endcard=1` — each auto-starts solo and lands.

## 6. IT HAS TO SURVIVE HIS PHONE

He opens these on a phone, often in a private tab.

- **Guard every `localStorage` touch in try/catch.** In a private tab the accessor itself THROWS,
  and an unguarded read at the top of the script takes the whole page down — he gets a blank screen
  instead of a checklist. The marks are a convenience; the sheet working is not.
- **The save indicator must not lie.** If the write failed, say *"can't save here — copy yer notes
  before ye leave"*.
- **Copy is ONE tap.** *"Copy my notes takes two clicks."* The first tap copies; the dialog is
  confirmation of something that already happened. And it **never claims a copy it did not make** —
  if both the clipboard API and the `execCommand` fallback fail, it says so and leaves the text
  selected.

## 7. THE BUILD STAMP IS PART OF THE PAGE

Any sheet asking him to look at staging names the exact build, read off the wire before the sheet
was written, and says plainly: **a different stamp is a different build — stop and tell me.**
A bare stamp with no `-staging@<sha>` means he is looking at production and the publish did not land.

## 8. AND CLOSE THE TURN WITH THE LINK

**His words, 2026-09-10:** *"at the END of long turns, you should always present me with a summary of
all work + the artifact."* What changed and what it means for a player · anything you got wrong and
corrected · what is still open and whose it is · **the link**.

## 9. IF THE PAGE HAS CONTROLS, THE PREVIEW NEVER LEAVES THE SCREEN

**His words, 2026-09-12:** *"the preview must ALWAYS be visible while scrolling through the tuners --
it is not user frinedly to have to scroll down to adjust a dial then scroll back up to see its
change."*

A tuner is a feedback loop, and a loop with a scroll in the middle of it is broken. **Pin the preview
(`position: sticky; top: 0`) so every slider moves something he can see while he moves it.** Two
things this needs and both are easy to get wrong:

- The sticky element must be a **direct child of the tall scrolling container**. Wrap it in a div
  that ends where the controls begin and it un-sticks the moment that wrapper scrolls past — which
  looks exactly like sticky not working.
- Cap it (`max-height: ~60vh; overflow: auto`) and give it an opaque background, or on a phone the
  preview eats the screen the controls were supposed to live in.

## 10. NO STANDFIRST. HE ALREADY HAS THE CONTEXT.

**His words, 2026-09-12:** *"remove the verbose byline text. i already have context, in our chat
session."*

The page is a tool, not a memo. He arrives from the chat that produced it, so a paragraph explaining
what the page is and why it exists is dead weight he has to scroll past every time. **A title, and
straight into the thing.** Anything that genuinely has to be said belongs in the chat reply, or as a
one-line caption on the exact control it concerns.

---

## Why these live here and not in CLAUDE.md

He trimmed them out of CLAUDE.md on 2026-09-10 in the same breath as asking for this file. CLAUDE.md
is the short list that survives being read; this is the long form it points at, the same way
`docs/AUDIO.md` and `docs/TRADE-SYSTEM.md` work. **Read this before publishing anything, not after
he asks for a change to it.**
