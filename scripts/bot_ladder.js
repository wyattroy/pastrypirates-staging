#!/usr/bin/env node
// scripts/bot_ladder.js — RETIRED 2026-09-18. This file is a headstone, not an instrument.
//
// WHAT IT WAS. Principle 10 made mechanical: seat the new bot brain and the brain it replaces at
// one table, on the same seeds, and ask only who wins. It earned its place — on 2026-08-09 a
// whole-turn planner improved every behaviour proxy (trades 26 -> 140, shots with the wind 25.5% ->
// 88.6%, blank turns 8.8% -> 6.8%) and was one command from shipping, and this ladder measured it
// as a WORSE player in three of four configurations. Nothing in the behaviour statistics could
// have said so.
//
// WHY IT CANNOT BE RE-POINTED, which is the whole reason this is a headstone and not a one-line
// import fix. A head-to-head needs TWO brains, so this file carried the incumbent inside it as
// OLD_TURN, a verbatim copy stamped with the commit it was current in, and its own header laid
// down the rule: *"the incumbent is always what is live, never what was live three changes ago."*
// It called `chooseTarget` / `chooseAction` — the pre-planner brain. That brain is gone, and it was
// not lost by accident:
//
//     Wyatt, 2026-08-18: "we should never use the old bot brain, it's done. Bot tuning should be
//     done with the newest algorithm that is actually used in game."
//
// `src/engine/index.js` now holds exactly ONE whole-turn planner and `planTurn()` dispatches to it
// unconditionally; the control arm and the four helpers only it called were deleted deliberately.
// So there is no incumbent left to seat opposite. Re-stamping OLD_TURN to today's turn — the thing
// this file's own header tells you to do — would put the same brain in both arms and read +0.0
// forever. That is a control, not a measurement: a case that cannot fail.
//
// WHAT TO USE INSTEAD — `node scripts/bot_ladder4.js [games] [seedMult] [--json]`.
// It measures the same thing on a TIME axis rather than a seat axis: run the identical command on
// the same seeds either side of your change and diff the two records. Every seat runs the shipping
// brain in both runs, so whatever moved, the change moved. ~420 ms a game.
// It ignores `--help` and starts a real ladder, so read its header rather than running it to ask.
//
// The measuring body, OLD_TURN included, is in git history at 394ff691 — `git show
// 394ff691:scripts/bot_ladder.js`. Nothing was thrown away.
//
// WHY THE PATH SURVIVES AT ALL. `docs/BOT-DESIGN-PRINCIPLES.md` §9 — the doc `.claude/CLAUDE.md`
// sends you to BEFORE you may touch a bot — names this path, and that doc belongs to another
// session mid-rewrite. A doc that names a path and a path that answers when you follow it is the
// deal; this file keeps that deal in one second instead of an ERR_MODULE_NOT_FOUND stack trace,
// which is what it gave every session from 2026-08-26 until today.

console.error(`
scripts/bot_ladder.js is RETIRED — it measured the new bot brain against the brain it replaced,
and this engine no longer carries that second brain (Wyatt, 2026-08-18: "we should never use the
old bot brain, it's done"). There is nothing left to seat opposite, so there is no ladder to run.

  Use instead:  node scripts/bot_ladder4.js [games] [seedMult] [--json]
                the same question on a TIME axis — same seeds, same command, either side of your
                change, then diff the two records. Read its header before you run it.

  The old body: git show 394ff691:scripts/bot_ladder.js
  The reasoning: the comment at the top of this file, and docs/BOT-DESIGN-PRINCIPLES.md §9.
`);
process.exit(1);
