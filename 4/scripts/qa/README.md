# `4/scripts/qa/` — one-off reproductions, NOT the process

**The process is the sea trial: `node 4/scripts/sea_trial.mjs`.** See `docs/QA-PROCESS.md`.

Everything in this folder is a **reproduction of one specific bug** — step 1 of the four steps
("show it broken"), kept as evidence of what was measured on 2026-08-26. They are not gates, they
are not run by `npm test`, and **they are not a QA process**.

## What was deleted from here, and why it matters

Three files were removed the same day they were written:

| deleted | because |
|---|---|
| `matrix.mjs` | `4/scripts/playtest_gate.mjs` already played whole voyages across modes and sizes, with a real mouse, universal checks and a vision judge. Written 2026-08-21 to Wyatt's own words. |
| `checks.mjs` | `4/scripts/lib/checks.mjs` already held UNIVERSAL structural rules by ROLE. Its own header says it is "the opposite of the piecemeal gate Wyatt (rightly) rejected: add no rule per bug" — and the deleted file was exactly ten per-bug rules. |
| `lib/advance.mjs` | `4/scripts/lib/player.mjs` already knew how to play the game fully: real mouse, on-screen gate, coverage-first choices, dead-button detection. |

**All three were written without looking for what existed.** That is the same failure the whole of
2026-08-26 was about, committed while fixing it. Recorded here rather than quietly deleted, because
the next session will feel the same urge.

## What is still here

Per-bug reproductions from the 2026-08-26 playtest. Useful when re-opening one of those bugs;
useless as coverage. If you find yourself adding a file here for a NEW bug, that is fine — that is
step 1. If you find yourself running files here INSTEAD of a sea trial, that is the failure.

## The two real gates that came out of that night

They live in `4/scripts/` and run in `npm test`, which is the difference:

- `mode_fork_check.js` — fails the build when a new mode fork appears in code that draws.
- `flip_consistency_check.js` — every flip beat is a named constant; the flip cannot outlast its own sound.
