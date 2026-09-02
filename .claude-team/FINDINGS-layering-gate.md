# THE PLAN'S HIGHEST-VALUE ITEM WAS ALREADY BUILT — and red-proofing it found a real hole

2026-08-31. `.planning/architecture-one-director.html` §06 calls the layering gate *"the
highest-value item here, because it is what makes the parity gate unnecessary"*, and gives its
status as **"Extend `module_graph_check.js`, which already runs."**

## It needs no extension. All three rules are already enforced.

`checkTierShape` (`scripts/module_graph_check.js:164`) already declares, at `:198-226`:

| §06 asks the build to fail on | already enforced by |
|---|---|
| L3 importing `src/state/` or `src/ui/` | `checkTierShape("shared", [], …)` — shared may import **nothing** from `src/` |
| L4 importing L2 | `checkTierShape("ui", ["shared","engine","state"], …)` — `orchestrator.js` sits directly in `src/`, so it is the `main` tier, which is **not** on that list |
| L1 importing anything from `ui/` | `checkTierShape("engine", ["shared"], …)` |

**PROVEN, not read off the allow-lists:** each violation was planted into the real file and the
gate went to exit 1, naming the file, the line and the tier. Then removed; clean tree exit 0.

**So step 6's "turn the layering gate on strict" is largely already true, and §06's status column
is out of date.** That is a step the plan does not need to spend.

## AND THE RED-PROOF IS THE ONLY REASON A REAL HOLE WAS FOUND

The first attempt planted all three violations as **bare side-effect imports** — `import
"../ui/board.js";` — and **none of them failed.** Not because the rules were missing, but because
`IMPORT_RE` matched only `from "…"` and `import("…")`. A third legal spelling of an import was
invisible, so any file could reach into any tier through it and the gate stayed green.

Nothing in `src/` uses that spelling today, so nothing was actually broken — **which is precisely
why it was worth closing now**, before the migration starts adding modules under a rule the gate
could be walked around.

## The lesson, and it is the session's own §12h pointing at itself

I read the allow-lists, reasoned correctly about tiers, and concluded the rules were enforced —
**a true statement about the code.** Had I stopped there I would have reported "already enforced,
nothing to do" and been right by accident, with a hole underneath. **The plant is what turned a
correct reading into a measurement, and the measurement is what found the thing the reading could
not contain.**

A gate you have not watched fail is a gate you are trusting on its comments.
