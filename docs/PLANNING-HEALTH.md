# The planning health check — how to read it, and what it cannot see

The rule is stated in `.claude/CLAUDE.md` §5: run it before answering "where are we" and before
closing a phase, and **surface what it finds in your reply**. This document is the detail — what its
warnings actually mean, which ones are permanent noise, and the gap it cannot cover.

```bash
node .claude/gsd-core/bin/gsd-tools.cjs validate health --ws <workstream>
```

Drop `--ws <workstream>` for the whole project.

---

## Why the rule exists

**GSD already had this checker, and the reason it had never helped is that nobody ran it.** On
2026-08-02 it was sitting on **43 unread warnings** across four workstreams — including the stale
worktree that had just caused a completely wrong status report, and two workstreams whose STATE.md
said "blocked" / "outstanding" in the body while their own frontmatter said `complete`.

A warning you read and dismissed is fine. **A warning nobody looked at is how this project loses
days.**

---

## Known noise — do NOT "fix" these

### W019 "Unrecognized .planning/ file"

Fires on eight files Wyatt keeps deliberately:

`COPY-AND-TASTE-REVIEW.md`, `HANDOFF.md`, `PLAYTEST-*.md`, `REPO-STRUCTURE-AUDIT.md`, `WINDOWS.md`,
`art-audit.md`, `art-generation-process.md`, `how-to-play-pastry-pirates.md`

They are intentional, they are not GSD artifacts, and **they must not be moved or deleted to silence
the checker.** These were 32 of the original 43 warnings — pure noise, and the reason the status
reads a permanent "degraded".

### W002 — any phase number appearing in prose

It greps document text for "Phase N" and warns if N is not declared in that workstream. **Writing an
explanatory note that mentions another phase *adds warnings*.** Demonstrated accidentally on
2026-08-02, when four correction notes pushed the count from 43 to 47. Not a real finding. Do not
contort your writing to avoid it, and do not chase it.

### W011 — not a contradiction detector, despite appearances

It fires whenever STATE's current phase is marked `[x]` in ROADMAP — **even when STATE also says
complete and the two perfectly agree.** Verified 2026-08-02: `sound-clock` said complete, the roadmap
said complete, and it still warned.

It is useful only because it **quotes STATE's status line in the message**, so a stale line becomes
visible while you are reading it. **Read the quoted text; ignore the verdict.**

**W011 also false-positives on a phase number in a neighbouring line.** It matched "Phase 20" inside
*Phase 19's* description (`"before Phase 20 invests"`), saw that line's `- [x]`, and reported Phase 20
complete when it had not been started. **Confirm against the actual checkbox before believing it.**

---

## Honest summary of what this checker is worth

Of the original 43 warnings: **32 were W019 noise** on files kept deliberately, **~7 were W002/W011
artefacts** of prose-grepping, and the genuinely valuable one was **W017, the stale worktree**.

So run it and *read the quoted text*, but **treat the pass/fail verdict as close to meaningless.**
The value is in what it incidentally shows you, not in whether it goes green. It will likely never
go green.

> As of 2026-08-18 the count is down to **0 errors and 8 warnings, all W019**, because v1.3's
> workstream files were archived at the v2.0 milestone switch. That is as green as it gets here.

---

## What it does NOT check — where the real damage has come from

**Every GSD check reads frontmatter and file structure. None reads the prose inside a document.**
All four of 2026-08-02's record failures lived in that gap, so the checker is a floor, not a ceiling:

| Failure | Why no structural check can see it |
|---|---|
| A checklist row contradicting its own phase's VERIFICATION.md | Nothing compares sibling documents |
| Frontmatter `passed` while the body says `human_needed` | The body is never read |
| A ledger predicting the future (*"18-07 deletes the loser"*) — true when written, false 20 minutes later | Semantic, not structural |
| A hand-typed progress figure (20% when it was 80%) | It checks *which* phase, never recomputes the number |

### Three conventions close that gap, and they cost nothing

1. **Point, don't restate.** A checklist row must link to the verification report, never repeat its
   verdict. A pointer cannot go stale; a copy always can.
2. **Never hand-type a number that can be counted.** Progress is derivable from what is on disk. Any
   percentage typed into a document is wrong the moment work continues.
3. **No future tense in an append-only record.** "Will be deleted", "pending", "to be decided" belong
   in the roadmap where decisions live. A ledger records what happened. **A prediction in a log rots
   into a lie with nobody editing it.**
